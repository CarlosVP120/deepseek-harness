/**
 * FiscalCFDI AI plugin for DeepSeek Harness.
 *
 * Exposes the FiscalCFDI AI accounting engine (CONTPAQi SQL history, CFDI/bank
 * intake, autonomous journal generation, audit and CONTPAQi importable) as
 * model-facing tools. Every tool delegates to `bridge.py`, which reuses the
 * same desk layer as the Chainlit pilot, so both front ends share months,
 * files, answers and audited importables. No accounting logic lives here.
 */
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import type { Agent, PreStepDecision } from '@deepseek-ai/dsh-agent'
import { createUserMessage, type ContextFormed } from '@deepseek-ai/dsh-llm'
import { defineTool, type ToolExecution } from '@deepseek-ai/dsh-tools'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { SessionBindings } from './bindings.ts'
import type {
  FiscalcfdiAnswerRequest, FiscalcfdiBindRequest, FiscalcfdiBinding, FiscalcfdiCompany, FiscalcfdiImportable, FiscalcfdiMonth,
  FiscalcfdiMonthDetail, FiscalcfdiMonthRequest, FiscalcfdiSessionRequest, FiscalcfdiUploadRequest,
  FiscalcfdiCompanyRefresh, FiscalcfdiSqlCheck, FiscalcfdiSqlConnection, FiscalcfdiSqlRequest,
} from './types.ts'

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    'fiscalcfdi-context': { kind: 'fiscalcfdi-context' } & ContextFormed
  }
}

export type * from './types.ts'

export interface Config {
  /** Python interpreter of the engine environment. */
  python: string
  /** Absolute path to bridge.py. */
  bridge: string
  /** Milliseconds one bridge call may run; processing itself runs detached. */
  timeoutMs: number
  /** Longest a waiting fiscalcfdi_estado call follows a running month before it returns to the model. */
  waitMs: number
  /** Milliseconds between engine reads while a fiscalcfdi_estado call waits. */
  waitPollMs: number
  /** Credential holding the OpenRouter key that the Models settings page stores; the engine runs on the same key. */
  apiKeyRef: string
}

export const Config: Schema<Config> = Schema.object({
  python: Schema.string().required(),
  bridge: Schema.string().required(),
  timeoutMs: Schema.number().default(120000),
  waitMs: Schema.number().default(600000),
  waitPollMs: Schema.number().default(10000),
  apiKeyRef: Schema.string().default('OPENROUTER_API_KEY'),
})

type BridgeResult = { ok: boolean; error?: string } & Record<string, unknown>

/** Environment of one bridge call; `OPENROUTER_API_KEY` there overrides the engine's own `.env`. */
type EngineEnvironment = () => Promise<NodeJS.ProcessEnv>

function callBridge(config: Config, command: string, payload: object, signal: AbortSignal, env: NodeJS.ProcessEnv): Promise<BridgeResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(config.python, [config.bridge, command], { stdio: ['pipe', 'pipe', 'pipe'], signal, timeout: config.timeoutMs, env })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8') })
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8') })
    child.on('error', reject)
    child.on('close', (code) => {
      try {
        resolve(JSON.parse(stdout) as BridgeResult)
      } catch {
        reject(new Error(`El motor FiscalCFDI AI terminó sin respuesta válida (código ${code}). ${stderr.slice(-400)}`))
      }
    })
    child.stdin.end(JSON.stringify(payload))
  })
}

const month = {
  rfc: { type: 'string', description: 'RFC de la empresa, tal como lo devuelve fiscalcfdi_empresas. Si se omite, se usa la empresa seleccionada en la interfaz.' },
  periodo: { type: 'string', description: 'Mes contable en formato AAAA-MM, por ejemplo 2026-07. Si se omite, se usa el mes seleccionado en la interfaz.' },
} as const

/** Month arguments as the model may send them: both optional, resolved from the Session's selection. */
interface MonthArgs { rfc?: string | undefined; periodo?: string | undefined; esperar?: boolean | undefined }

/** Tools whose explicit month becomes the Session's selection, so the panel follows the conversation. */
const SELECTING = new Set(['abrir_mes', 'subir', 'estado', 'procesar', 'responder', 'cobertura', 'importable'])

const text = {
  schema: { type: 'string' },
  render: (_args: unknown, value: string) => [{ type: 'text' as const, text: value }],
} as const

type JsonLike = string | number | boolean | null | JsonLike[] | { [key: string]: JsonLike }
type Json = { [key: string]: JsonLike }

function parsed(value: string): Json {
  try {
    return JSON.parse(value) as Json
  } catch {
    return {}
  }
}

/** The month card's data: what the engine reported, without the long per-file and per-question texts. */
function monthCard(value: string) {
  const {
    rfc, empresa, periodo, estado, descripcion, etapa, intento, archivos, preguntas, resultado, avance, error, mensaje, listo_para_procesar,
  } = parsed(value)
  return JSON.parse(JSON.stringify({
    rfc, empresa, periodo, estado, descripcion, etapa, intento, resultado, avance, error, mensaje, listo_para_procesar,
    archivos: Array.isArray(archivos) ? archivos.length : undefined,
    preguntas: Array.isArray(preguntas) ? preguntas.length : undefined,
  })) as Json
}

const monthOutput = { ...text, presentationMeta: (_args: unknown, value: string) => monthCard(value) } as const

interface Movement { fecha: string; banco: string; concepto: string; importe: string; poliza: unknown }

/** The model reads totals per bank and only the movements still without a journal; the card gets every movement. */
const coverageOutput = {
  ...text,
  render: (_args: unknown, value: string) => {
    const { bancos, movimientos } = parsed(value) as unknown as { bancos?: JsonLike[]; movimientos?: Movement[] }
    const missing = (movimientos ?? []).filter(row => !row.poliza)
    return [{ type: 'text' as const, text: JSON.stringify({
      bancos,
      movimientos_total: movimientos?.length ?? 0,
      sin_poliza: missing.length,
      movimientos_sin_poliza: missing.slice(0, 60).map(({ fecha, banco, concepto, importe }) => ({ fecha, banco, concepto, importe })),
      nota: 'El usuario ya ve en la tarjeta cada movimiento con su póliza; no los repitas, resume la cobertura.',
    }, null, 1) }]
  },
  presentationMeta: (_args: unknown, value: string) => parsed(value),
} as const

/** Resolve after `ms`, or reject as soon as `signal` aborts. */
function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason as Error)
      return
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort)
      resolve()
    }, ms)
    const abort = () => {
      clearTimeout(timer)
      reject(signal.reason as Error)
    }
    signal.addEventListener('abort', abort, { once: true })
  })
}

function registerTools(ctx: Context, config: Config, bindings: SessionBindings, environment: EngineEnvironment): void {
  const run = async (command: string, payload: object, signal: AbortSignal) => {
    const result = await callBridge(config, command, payload, signal, await environment())
    if (!result.ok) throw new Error(result.error ?? 'Error del motor FiscalCFDI AI')
    return JSON.stringify(result, null, 1)
  }
  /** Run a month command for the month the model named, or the one selected for its Session. */
  const runMonth = async (command: string, args: MonthArgs & Record<string, unknown>, exec: ToolExecution) => {
    const session = exec.agent?.session.id
    const bound = session === undefined ? undefined : bindings.get(session)
    const rfc = args.rfc ?? bound?.rfc
    const periodo = args.periodo ?? bound?.periodo
    if (rfc === undefined || periodo === undefined) {
      throw new Error('No hay empresa y mes seleccionados. Pregúntale al usuario cuáles, o pídele que los elija en el selector junto a la caja de texto.')
    }
    const { esperar, ...payload } = args
    const env = await environment()
    let result = await callBridge(config, command, { ...payload, rfc, periodo }, exec.signal, env)
    // A waiting status read follows the run here, without model turns, until it stops running.
    const deadline = Date.now() + config.waitMs
    while (esperar === true && result.ok && result.estado === 'running' && Date.now() < deadline) {
      await pause(config.waitPollMs, exec.signal)
      result = await callBridge(config, command, { ...payload, rfc, periodo }, exec.signal, env)
    }
    if (!result.ok) throw new Error(result.error ?? 'Error del motor FiscalCFDI AI')
    if (session !== undefined && SELECTING.has(command)) {
      const empresa = typeof result.empresa === 'string' ? result.empresa : bound?.rfc === rfc ? bound.empresa : rfc
      bindings.set(session, { rfc, periodo, empresa })
    }
    return JSON.stringify(result, null, 1)
  }

  ctx.tools.register(defineTool({
    name: 'fiscalcfdi_empresas',
    description: 'Lista las empresas de CONTPAQi que FiscalCFDI AI puede contabilizar (RFC, nombre y base SQL). Úsala cuando el usuario no indique el RFC o para confirmar la empresa.',
    parameters: {},
    output: text,
    execute: (_args, exec) => run('empresas', {}, exec.signal),
  }))

  ctx.tools.register(defineTool({
    name: 'fiscalcfdi_abrir_mes',
    description: 'Abre (o retoma) el trabajo contable de una empresa y mes. Cada empresa+mes tiene un solo trabajo que conserva archivos, respuestas, intentos e importables. Devuelve el estado, los archivos ya cargados y qué falta para procesar.',
    parameters: month,
    output: text,
    execute: (args, exec) => runMonth('abrir_mes', args, exec),
  }))

  ctx.tools.register(defineTool({
    name: 'fiscalcfdi_subir_archivos',
    description: 'Carga al mes contable los archivos que el usuario adjuntó (estados de cuenta, listados de CFDI emitidos/recibidos y REP, papel de trabajo PDT, pólizas de meses anteriores, acuses). Pasa las rutas absolutas que Harness asignó a los adjuntos. El motor identifica cada archivo por su contenido; no hace falta clasificarlos. Devuelve qué se cargó, qué se rechazó y qué falta.',
    parameters: {
      ...month,
      rutas: { type: 'array', items: { type: 'string' }, required: true, description: 'Rutas absolutas de los archivos adjuntos.' },
    },
    output: text,
    execute: (args, exec) => runMonth('subir', args, exec),
  }))

  ctx.tools.register(defineTool({
    name: 'fiscalcfdi_estado',
    description: 'Consulta el estado del mes contable: archivos, si está listo para procesar, si el agente contable está trabajando, los pasos de su avance, sus preguntas pendientes y, al terminar, pólizas, cobertura bancaria e IVA. El usuario ve el resultado como una tarjeta del mes. Mientras el agente contable trabaja, llámala con esperar=true: regresa cuando termina, pregunta algo o se detiene. No la llames repetidamente para seguir el avance.',
    parameters: {
      ...month,
      esperar: { type: 'boolean', description: 'true para esperar, mientras el agente contable trabaja, a que termine, pregunte algo o se detenga (hasta unos minutos), en vez de devolver el avance de inmediato.' },
    },
    output: monthOutput,
    execute: (args, exec) => runMonth('estado', args, exec),
  }))

  ctx.tools.register(defineTool({
    name: 'fiscalcfdi_responder',
    description: 'Envía al motor la respuesta del usuario: a una pregunta del agente contable (estado "waiting"), a una confirmación de preparación (por ejemplo qué hojas del PDT usar) o una corrección sobre un resultado terminado, que reabre el mes para un nuevo intento auditado. Usa las palabras del usuario; nunca inventes respuestas contables.',
    parameters: {
      ...month,
      texto: { type: 'string', required: true, description: 'Respuesta o instrucción del usuario, en sus propias palabras.' },
      pregunta_id: { type: 'string', description: 'Id de la pregunta que se contesta; por omisión la primera pendiente.' },
      aprueba_propuesta: { type: 'boolean', description: 'true solo si el usuario aprobó explícitamente la propuesta del agente.' },
    },
    output: text,
    execute: (args, exec) => runMonth('responder', args, exec),
  }))

  ctx.tools.register(defineTool({
    name: 'fiscalcfdi_procesar',
    description: 'Inicia la contabilización autónoma del mes: el agente contable consulta el historial de CONTPAQi, aplica las políticas de la empresa, concilia bancos, genera pólizas y las audita. Corre en segundo plano y tarda varios minutos; después llama una vez a fiscalcfdi_estado con esperar=true. Si falta información, devuelve qué falta sin iniciar.',
    parameters: month,
    output: monthOutput,
    execute: (args, exec) => runMonth('procesar', args, exec),
  }))

  ctx.tools.register(defineTool({
    name: 'fiscalcfdi_cobertura',
    description: 'Muestra la cobertura bancaria del último intento con pólizas: totales de cargos y abonos por banco y cada movimiento del estado de cuenta con la póliza y las cuentas con que se registró. El usuario ve una tarjeta con todos los movimientos; tú recibes los totales y los movimientos que quedaron sin póliza. Úsala al terminar un mes o cuando el usuario pregunte cómo quedó un movimiento.',
    parameters: month,
    output: coverageOutput,
    execute: (args, exec) => runMonth('cobertura', args, exec),
  }))

  ctx.tools.register(defineTool({
    name: 'fiscalcfdi_meses',
    description: 'Lista los meses contables abiertos de todas las empresas con su estado, pólizas y cobertura bancaria, del más reciente al más antiguo.',
    parameters: {},
    output: text,
    execute: (_args, exec) => run('meses', {}, exec.signal),
  }))

  ctx.tools.register(defineTool({
    name: 'fiscalcfdi_importable',
    description: 'Obtiene la ruta del archivo importable a CONTPAQi (.xls P/M1/AM/AD) de un mes terminado. Solo existe si la auditoría lo aprobó y el archivo no cambió después. Después llama a la herramienta present con esa ruta para que el usuario lo descargue.',
    parameters: month,
    output: text,
    execute: (args, exec) => runMonth('importable', args, exec),
  }))
}

function remoteFailure(result: BridgeResult): RemoteError<'gateway/internal'> {
  return new RemoteError('gateway/internal', result.error ?? 'Error del motor FiscalCFDI AI', {})
}

function nullableNumber(value: unknown): number | null {
  return typeof value === 'number' ? value : null
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : null
}

function list<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : []
}

/** Project the engine's public SQL settings onto the settings page's connection. */
function sqlConnection(raw: unknown): FiscalcfdiSqlConnection {
  const conf = (raw ?? {}) as Record<string, unknown>
  return {
    server: typeof conf.server === 'string' ? conf.server : '', port: Number(conf.port ?? 1433),
    user: typeof conf.user === 'string' ? conf.user : '',
    database: typeof conf.database === 'string' ? conf.database : 'master', passwordConfigured: conf.password_configured === true,
  }
}

/** Project the engine's month snapshot onto the panel's typed detail. */
function monthDetail(raw: BridgeResult): FiscalcfdiMonthDetail {
  const result = raw.resultado as Record<string, unknown> | null | undefined
  const avance = (raw.avance ?? {}) as { pasos?: unknown; cobertura?: Record<string, unknown> }
  const live = avance.cobertura ?? {}
  return {
    rfc: String(raw.rfc), empresa: String(raw.empresa), periodo: String(raw.periodo),
    estado: String(raw.estado), descripcion: nullableString(raw.descripcion) ?? '', intento: Number(raw.intento ?? 0),
    mensaje: nullableString(raw.mensaje ?? raw.aviso), error: nullableString(raw.error), listo: raw.listo_para_procesar === true,
    archivos: list<Record<string, unknown>>(raw.archivos).map(file => ({
      nombre: String(file.nombre), tipo: nullableString(file.tipo), rol: nullableString(file.rol), estado: nullableString(file.estado) ?? '',
    })),
    preguntas: list<Record<string, unknown>>(raw.preguntas)
      .map(question => ({ id: String(question.id), pregunta: String(question.pregunta) })),
    requisitos: list<Record<string, unknown>>(raw.requisitos).map(item => ({
      clave: String(item.clave), titulo: String(item.titulo), listo: item.listo === true,
    })),
    pasos: list<Record<string, unknown>>(avance.pasos)
      .map(step => ({ clave: String(step.clave), titulo: String(step.titulo), estado: String(step.estado) })),
    cubiertos: nullableNumber(result?.movimientos_bancarios_cubiertos ?? live.movimientos_bancarios_cubiertos),
    total: nullableNumber(result?.movimientos_bancarios_total ?? live.movimientos_bancarios_total),
    resultado: result === null || result === undefined ? null : {
      auditoria_aprobada: result.auditoria_aprobada === true,
      polizas: nullableNumber(result.polizas),
      cubiertos: nullableNumber(result.movimientos_bancarios_cubiertos),
      total: nullableNumber(result.movimientos_bancarios_total),
      iva_acreditable: nullableString(result.iva_acreditable_pagado),
      iva_trasladado: nullableString(result.iva_trasladado_cobrado),
    },
    importable: raw.importable_disponible === true,
  }
}

/**
 * The FiscalCFDI AI Host service: registers the accounting tools, remembers
 * which company month each chat works on (the composer selector and the month
 * panel), tells the agent about that selection, and serves the Client panels
 * through the `fiscalcfdi` Remote namespace.
 */
export class Fiscalcfdi extends TypertRemoteService {
  static inject = ['tools', 'agents']
  static Config = Config

  private readonly bindings: SessionBindings
  private readonly uploads: string

  /**
   * @param ctx - Host context owning the tool registry and agent steps.
   * @param config - Engine interpreter, bridge and call budget.
   */
  constructor(ctx: Context, private readonly config: Config) {
    super(ctx, 'fiscalcfdi')
    const home = process.env.DSH_HOME ?? join(homedir(), '.fiscalcfdi-ai')
    this.bindings = new SessionBindings(home)
    this.uploads = join(home, 'fiscalcfdi', 'uploads')
    registerTools(ctx, config, this.bindings, this.environment)
    // Each turn's first request carries the month the user selected, so the agent never asks for it again.
    ctx.on('agent/pre-step', async ({ agent, step }: { agent: Agent; step: number }, next: () => Promise<PreStepDecision>) => {
      const decision = await next()
      if (decision.kind === 'reject' || step !== 1) return decision
      const bound = this.bindings.get(agent.session.id)
      if (bound === undefined) return decision
      const text = `Mes contable seleccionado en la interfaz: ${bound.empresa} (RFC ${bound.rfc}), periodo ${bound.periodo}. `
        + 'Las herramientas fiscalcfdi_* lo usan cuando omites rfc y periodo; no se lo vuelvas a preguntar al usuario. '
        + 'El usuario ve el panel «Mes contable» con archivos, avance, dudas y descarga.'
      return {
        ...decision,
        messages: [...decision.messages, createUserMessage({
          content: [{ type: 'text', text }],
          source: { kind: 'fiscalcfdi-context', form: 'snapshot', sections: [{ name: 'fiscalcfdi-context', text }] },
        })],
      }
    }, { prepend: true })
  }

  /** The engine's environment: this process's, with the OpenRouter key stored in the Models settings when there is one. */
  private readonly environment: EngineEnvironment = async () => {
    const stored = await this.ctx.get('credentials')?.resolve(credentialRef(this.config.apiKeyRef))
    return stored === undefined ? process.env : { ...process.env, OPENROUTER_API_KEY: stored.value }
  }

  private async bridge(command: string, payload: object, signal?: AbortSignal): Promise<BridgeResult> {
    const result = await callBridge(this.config, command, payload, signal ?? new AbortController().signal, await this.environment())
    if (!result.ok) throw remoteFailure(result)
    return result
  }

  /**
   * Every company month the engine keeps, newest activity first.
   * @param signal - Remote caller cancellation.
   * @returns the months with their state, journals and bank coverage.
   */
  @Remote('months')
  async months(signal?: AbortSignal): Promise<FiscalcfdiMonth[]> {
    return (await this.bridge('meses', {}, signal)).meses as FiscalcfdiMonth[]
  }

  /**
   * The CONTPAQi companies the engine can post.
   * @param signal - Remote caller cancellation.
   * @returns companies by display name.
   */
  @Remote('companies')
  async companies(signal?: AbortSignal): Promise<FiscalcfdiCompany[]> {
    const rows = (await this.bridge('empresas', {}, signal)).empresas as { rfc: string; nombre: string }[]
    return rows.map(({ rfc, nombre }) => ({ rfc, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  }

  /**
   * The company month a chat Session works on.
   * @param request - the Session.
   * @returns its selection, or null when it has none.
   */
  @Remote('binding')
  binding(request: FiscalcfdiSessionRequest): FiscalcfdiBinding | null {
    return this.bindings.get(request.sessionId) ?? null
  }

  /**
   * Select a company month for a chat Session and open it in the engine.
   * @param request - the Session and the company month.
   * @param signal - Remote caller cancellation.
   * @returns the opened month.
   */
  @Remote('bind')
  async bind(request: FiscalcfdiBindRequest, signal?: AbortSignal): Promise<FiscalcfdiMonthDetail> {
    const opened = await this.bridge('abrir_mes', { rfc: request.rfc, periodo: request.periodo }, signal)
    this.bindings.set(request.sessionId, { rfc: request.rfc, periodo: request.periodo, empresa: String(opened.empresa) })
    return monthDetail({ ...opened, ...await this.bridge('estado', { rfc: request.rfc, periodo: request.periodo }, signal) })
  }

  /**
   * Clear a chat Session's company month.
   * @param request - the Session.
   */
  @Remote('unbind')
  unbind(request: FiscalcfdiSessionRequest): void {
    this.bindings.delete(request.sessionId)
  }

  /**
   * One company month as the month panel shows it.
   * @param request - the company month.
   * @param signal - Remote caller cancellation.
   * @returns files, checklist, progress, questions and result.
   */
  @Remote('month')
  async month(request: FiscalcfdiMonthRequest, signal?: AbortSignal): Promise<FiscalcfdiMonthDetail> {
    return monthDetail(await this.bridge('estado', { rfc: request.rfc, periodo: request.periodo }, signal))
  }

  /**
   * Load files dropped on the month panel; the engine recognizes each by its content.
   * @param request - the company month and the files.
   * @param signal - Remote caller cancellation.
   * @returns the month after loading.
   */
  @Remote('upload')
  async upload(request: FiscalcfdiUploadRequest, signal?: AbortSignal): Promise<FiscalcfdiMonthDetail> {
    await mkdir(this.uploads, { recursive: true })
    const folder = await mkdtemp(join(this.uploads, `${request.rfc}-${request.periodo}-`))
    const rutas: string[] = []
    const nombres: Record<string, string> = {}
    for (const file of request.files) {
      const path = join(folder, basename(file.name))
      await writeFile(path, Buffer.from(file.data, 'base64'))
      rutas.push(path)
      nombres[path] = file.name
    }
    return monthDetail(await this.bridge('subir', { rfc: request.rfc, periodo: request.periodo, rutas, nombres }, signal))
  }

  /**
   * Send the user's answer to the engine: a pending question, a preparation confirmation or a correction.
   * @param request - the company month and the user's words.
   * @param signal - Remote caller cancellation.
   * @returns the month after the answer.
   */
  @Remote('answer')
  async answer(request: FiscalcfdiAnswerRequest, signal?: AbortSignal): Promise<FiscalcfdiMonthDetail> {
    const payload = { rfc: request.rfc, periodo: request.periodo, texto: request.texto, pregunta_id: request.pregunta_id }
    await this.bridge('responder', payload, signal)
    return this.month(request, signal)
  }

  /**
   * Start the autonomous posting run of a ready month.
   * @param request - the company month.
   * @param signal - Remote caller cancellation.
   * @returns the month as the run starts, or what is still missing.
   */
  @Remote('process')
  async process(request: FiscalcfdiMonthRequest, signal?: AbortSignal): Promise<FiscalcfdiMonthDetail> {
    return monthDetail(await this.bridge('procesar', { rfc: request.rfc, periodo: request.periodo }, signal))
  }

  /**
   * The saved CONTPAQi SQL connection, without its password.
   * @param signal - Remote caller cancellation.
   * @returns server, port, login, database and whether a password is saved.
   */
  @Remote('sqlConnection')
  async sqlConnection(signal?: AbortSignal): Promise<FiscalcfdiSqlConnection> {
    return sqlConnection((await this.bridge('sql', {}, signal)).conexion)
  }

  /**
   * Connect to a CONTPAQi SQL server and, when `save` is set and it answers, keep it as the saved connection.
   * @param request - the connection; an empty password keeps the saved one.
   * @param signal - Remote caller cancellation.
   * @returns the saved connection after the call and what the server reported.
   */
  @Remote('checkSql')
  async checkSql(request: FiscalcfdiSqlRequest & { save: boolean }, signal?: AbortSignal): Promise<FiscalcfdiSqlCheck> {
    const { save, ...connection } = request
    const result = await this.bridge(save ? 'sql_guardar' : 'sql_probar', connection, signal)
    return {
      connection: sqlConnection(result.conexion), version: nullableString(result.version),
      saved: result.guardada === true, changed: result.cambio_servidor === true,
    }
  }

  /**
   * Re-read the CONTPAQi companies from the saved server.
   * @param signal - Remote caller cancellation.
   * @returns how many companies are available and how many databases could not be read.
   */
  @Remote('refreshCompanies')
  async refreshCompanies(signal?: AbortSignal): Promise<FiscalcfdiCompanyRefresh> {
    const result = await this.bridge('sql_empresas', {}, signal)
    return { companies: Number(result.empresas ?? 0), unavailable: Number(result.no_disponibles ?? 0) }
  }

  /**
   * The audited CONTPAQi importable of a finished month.
   * @param request - the company month.
   * @param signal - Remote caller cancellation.
   * @returns the file name and its bytes.
   */
  @Remote('importable')
  async importable(request: FiscalcfdiMonthRequest, signal?: AbortSignal): Promise<FiscalcfdiImportable> {
    const result = await this.bridge('importable', { rfc: request.rfc, periodo: request.periodo }, signal)
    return { nombre: String(result.nombre), data: (await readFile(String(result.ruta))).toString('base64') }
  }
}

export default Fiscalcfdi
