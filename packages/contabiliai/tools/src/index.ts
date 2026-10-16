/**
 * ContabiliAI plugin for DeepSeek Harness.
 *
 * Exposes the ContabiliAI accounting engine (CONTPAQi SQL history, CFDI/bank
 * intake, autonomous journal generation, audit and CONTPAQi importable) as
 * model-facing tools. Every tool delegates to `bridge.py`, which reuses the
 * same desk layer as the Chainlit pilot, so both front ends share months,
 * files, answers and audited importables. No accounting logic lives here.
 */
import { spawn } from 'node:child_process'
import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'contabiliai'
export const inject = ['tools']

export interface Config {
  /** Python interpreter of the engine environment. */
  python: string
  /** Absolute path to bridge.py. */
  bridge: string
  /** Milliseconds one bridge call may run; processing itself runs detached. */
  timeoutMs: number
}

export const Config: Schema<Config> = Schema.object({
  python: Schema.string().required(),
  bridge: Schema.string().required(),
  timeoutMs: Schema.number().default(120000),
})

type BridgeResult = { ok: boolean, error?: string } & Record<string, unknown>

function callBridge(config: Config, command: string, payload: object, signal: AbortSignal): Promise<BridgeResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(config.python, [config.bridge, command], { stdio: ['pipe', 'pipe', 'pipe'], signal, timeout: config.timeoutMs })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8') })
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8') })
    child.on('error', reject)
    child.on('close', (code) => {
      try {
        resolve(JSON.parse(stdout) as BridgeResult)
      } catch {
        reject(new Error(`El motor ContabiliAI terminó sin respuesta válida (código ${code}). ${stderr.slice(-400)}`))
      }
    })
    child.stdin.end(JSON.stringify(payload))
  })
}

const month = {
  rfc: { type: 'string', required: true, description: 'RFC de la empresa, tal como lo devuelve contabiliai_empresas.' },
  periodo: { type: 'string', required: true, description: 'Mes contable en formato AAAA-MM, por ejemplo 2026-07.' },
} as const

const text = {
  schema: { type: 'string' },
  render: (_args: unknown, value: string) => [{ type: 'text' as const, text: value }],
} as const

export function apply(ctx: Context, config: Config) {
  const run = async (command: string, payload: object, signal: AbortSignal) => {
    const result = await callBridge(config, command, payload, signal)
    if (!result.ok) throw new Error(result.error ?? 'Error del motor ContabiliAI')
    return JSON.stringify(result, null, 1)
  }

  ctx.tools.register(defineTool({
    name: 'contabiliai_empresas',
    description: 'Lista las empresas de CONTPAQi que ContabiliAI puede contabilizar (RFC, nombre y base SQL). Úsala cuando el usuario no indique el RFC o para confirmar la empresa.',
    parameters: {},
    output: text,
    execute: (_args, exec) => run('empresas', {}, exec.signal),
  }))

  ctx.tools.register(defineTool({
    name: 'contabiliai_abrir_mes',
    description: 'Abre (o retoma) el trabajo contable de una empresa y mes. Cada empresa+mes tiene un solo trabajo que conserva archivos, respuestas, intentos e importables. Devuelve el estado, los archivos ya cargados y qué falta para procesar.',
    parameters: month,
    output: text,
    execute: (args, exec) => run('abrir_mes', args, exec.signal),
  }))

  ctx.tools.register(defineTool({
    name: 'contabiliai_subir_archivos',
    description: 'Carga al mes contable los archivos que el usuario adjuntó (estados de cuenta, listados de CFDI emitidos/recibidos y REP, papel de trabajo PDT, pólizas de meses anteriores, acuses). Pasa las rutas absolutas que Harness asignó a los adjuntos. El motor identifica cada archivo por su contenido; no hace falta clasificarlos. Devuelve qué se cargó, qué se rechazó y qué falta.',
    parameters: {
      ...month,
      rutas: { type: 'array', items: { type: 'string' }, required: true, description: 'Rutas absolutas de los archivos adjuntos.' },
    },
    output: text,
    execute: (args, exec) => run('subir', args, exec.signal),
  }))

  ctx.tools.register(defineTool({
    name: 'contabiliai_estado',
    description: 'Consulta el estado del mes contable: archivos, si está listo para procesar, si el agente contable está trabajando, sus preguntas pendientes y, al terminar, pólizas, cobertura bancaria e IVA. Úsala para seguir el avance mientras el motor trabaja (cada consulta es barata).',
    parameters: month,
    output: text,
    execute: (args, exec) => run('estado', args, exec.signal),
  }))

  ctx.tools.register(defineTool({
    name: 'contabiliai_responder',
    description: 'Envía al motor la respuesta del usuario: a una pregunta del agente contable (estado "waiting"), a una confirmación de preparación (por ejemplo qué hojas del PDT usar) o una corrección sobre un resultado terminado, que reabre el mes para un nuevo intento auditado. Usa las palabras del usuario; nunca inventes respuestas contables.',
    parameters: {
      ...month,
      texto: { type: 'string', required: true, description: 'Respuesta o instrucción del usuario, en sus propias palabras.' },
      pregunta_id: { type: 'string', description: 'Id de la pregunta que se contesta; por omisión la primera pendiente.' },
      aprueba_propuesta: { type: 'boolean', description: 'true solo si el usuario aprobó explícitamente la propuesta del agente.' },
    },
    output: text,
    execute: (args, exec) => run('responder', args, exec.signal),
  }))

  ctx.tools.register(defineTool({
    name: 'contabiliai_procesar',
    description: 'Inicia la contabilización autónoma del mes: el agente contable consulta el historial de CONTPAQi, aplica las políticas de la empresa, concilia bancos, genera pólizas y las audita. Corre en segundo plano y tarda varios minutos; sigue el avance con contabiliai_estado. Si falta información, devuelve qué falta sin iniciar.',
    parameters: month,
    output: text,
    execute: (args, exec) => run('procesar', args, exec.signal),
  }))

  ctx.tools.register(defineTool({
    name: 'contabiliai_importable',
    description: 'Obtiene la ruta del archivo importable a CONTPAQi (.xls P/M1/AM/AD) de un mes terminado. Solo existe si la auditoría lo aprobó y el archivo no cambió después. Después llama a la herramienta present con esa ruta para que el usuario lo descargue.',
    parameters: month,
    output: text,
    execute: (args, exec) => run('importable', args, exec.signal),
  }))
}
