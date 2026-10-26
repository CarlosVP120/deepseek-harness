/**
 * Native accounting runs: the engine's planning agent runs in this app, on the
 * model and key selected in the Models settings, while its tools still execute
 * in the engine. The engine's worker prepares the month (sources, SQL history,
 * catalog), then hosts the planning tools over a private channel (fd 3 for
 * requests, fd 4 for its messages); this module creates the agent as an
 * ordinary Session the user can open, forwards every tool call, and reports
 * how the run ended so the worker records the result exactly as before.
 */
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, open } from 'node:fs/promises'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import type { Readable, Writable } from 'node:stream'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-agent-default-model'
import { brandString } from '@deepseek-ai/dsh-brand'
import { createUserMessage, ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import type { SessionEvent, SessionId, TurnEndReason } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-title'
import { AssistantOutputFold } from '@deepseek-ai/dsh-subagent'
import { PERSONA_PREFIX_SECTION } from '@deepseek-ai/dsh-system-prompt'
import type {} from '@deepseek-ai/dsh-workspace'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'

/** A month whose worker this app starts, as the bridge reports it. */
export interface EngineLaunch {
  /** Engine job key. */
  trabajo: string
  /** Absolute path of the engine's worker.py. */
  worker: string
  /** Job log the worker appends to. */
  log: string
}

/** The planning agent the worker asks this app to run. */
interface AgentSpec {
  type: 'agent'
  name: string
  title?: string
  instructions: string
  message: string
  settings: { max_turns: number; max_tokens: number; reasoning_effort: string; temperature: number }
  tools: { name: string; description: string; parameters: Record<string, unknown> }[]
}

type WorkerMessage = AgentSpec | { type: 'result'; id: string; output: string }

/** What the runner needs from the plugin. */
export interface RunnerOptions {
  /** Engine interpreter. */
  python: string
  /** Data home; runs are attached to a «contabilidad» project inside it. */
  home: string
  /** The engine environment with the app's OpenRouter key. */
  environment: () => Promise<NodeJS.ProcessEnv>
}

/** One run's channel to its worker: numbered calls, answered in order. */
class WorkerChannel {
  private readonly pending = new Map<string, (output: string) => void>()
  private closed = false

  constructor(private readonly input: Writable, private readonly lines: AsyncIterator<string>) {}

  /** @returns the next message the worker sends, or undefined once it closes the channel. */
  async next(): Promise<WorkerMessage | undefined> {
    const line = await this.lines.next()
    if (line.done === true) return undefined
    return JSON.parse(line.value) as WorkerMessage
  }

  /** Route the worker's tool results to their callers until the channel closes. */
  async pump(): Promise<void> {
    for (let message = await this.next(); message !== undefined; message = await this.next()) {
      if (message.type === 'result') this.pending.get(message.id)?.(message.output)
    }
    this.closed = true
    for (const resolve of this.pending.values()) resolve('El motor terminó antes de responder esta herramienta.')
    this.pending.clear()
  }

  /** Run one engine tool and wait for its output. */
  call(id: string, tool: string, args: unknown): Promise<string> {
    if (this.closed) return Promise.resolve('El motor ya no está disponible.')
    return new Promise((resolve) => {
      this.pending.set(id, (output) => {
        this.pending.delete(id)
        resolve(output)
      })
      this.send({ type: 'call', id, tool, arguments: JSON.stringify(args ?? {}) })
    })
  }

  send(message: object): void {
    if (!this.closed) this.input.write(`${JSON.stringify(message)}\n`)
  }
}

/** A started worker whose planning agent is waiting to be hosted. */
interface StartedWorker {
  readonly spec: AgentSpec
  readonly channel: WorkerChannel
  /** Resolves once the worker exits and its log is closed. */
  readonly closed: Promise<void>
}

/** A planning run hosted by a chat Session's agent. */
interface ChatRun {
  readonly job: string
  readonly sessionId: string
  readonly worker: StartedWorker
  readonly fold: AssistantOutputFold
  readonly disposers: (() => void)[]
  calls: number
  overBudget: boolean
}

/** Model-facing note appended to `ask_operator` results when the planning runs in the chat. */
const CHAT_QUESTION_NOTE = 'En esta conversación no termines el turno: si hay un plan auditado guárdalo con save_previewed_plan; '
  + 'después pregunta ya al usuario con ask_user_question, con la propuesta como opción recomendada y las alternativas reales, '
  + 'y llama fiscalcfdi_responder con su respuesta (aprueba_propuesta=true solo si eligió la propuesta). '
  + 'fiscalcfdi_responder abre el siguiente intento y te devuelve las herramientas del agente contable.'

/** Model-facing note appended once the importable is exported and the month is recorded as completed. */
const CHAT_EXPORTED_NOTE = 'El mes quedó registrado como terminado: las herramientas del agente contable ya no están disponibles. '
  + 'Muestra la cobertura con fiscalcfdi_cobertura, entrega el importable con fiscalcfdi_importable y present, y resume en pocas líneas.'

/** Whether a `generate_importable` output reports an exported file. */
function exported(output: string): boolean {
  try {
    return (JSON.parse(output) as { exported?: unknown }).exported === true
  } catch {
    // Error texts from the engine are not JSON: nothing was exported.
    return false
  }
}

/**
 * Starts the engine's workers and hosts their planning agents: on the chat
 * Session that asked for the run (its agent becomes the accounting agent and
 * works in the conversation), or, for runs started without a chat, on a
 * background Session the user can open. At most one run per month.
 */
export class AccountingRunner {
  private readonly chatRuns = new Map<string, ChatRun>()
  private readonly background = new Map<string, Promise<void>>()

  constructor(private readonly ctx: Context, private readonly options: RunnerOptions) {}

  /**
   * Start a month's worker and give its planning tools to a chat agent.
   * @param launch - the job, its worker and its log, as the bridge reported them.
   * @param agent - the chat agent that asked for the run.
   * @returns the planning agent's instructions, opening message and tool names, or undefined when preparation failed.
   */
  async attach(launch: EngineLaunch, agent: Agent): Promise<AgentSpec | undefined> {
    await this.finish(launch.trabajo, 'Corrida reemplazada por un nuevo intento.')
    const worker = await this.spawnWorker(launch)
    if (worker === undefined) return undefined
    const run: ChatRun = {
      job: launch.trabajo, sessionId: agent.session.id, worker, fold: new AssistantOutputFold(), disposers: [], calls: 0, overBudget: false,
    }
    this.chatRuns.set(launch.trabajo, run)
    void worker.channel.pump()
    for (const tool of worker.spec.tools) {
      run.disposers.push(agent.ctx.tools.register(this.chatTool(run, tool)))
    }
    // The run ends with the chat turn that hosts it: the worker then records the result, questions or stop.
    run.disposers.push(agent.ctx.on('session/event', (_session: unknown, event: SessionEvent) => {
      run.fold.push(event)
      if (event.type === 'turn/end') void this.finish(run.job)
    }))
    return worker.spec
  }

  /**
   * End a month's chat-hosted run: the worker records how it ended and exits.
   * @param job - the engine job.
   * @param reason - when set, the run stopped without finishing (the worker records a stop with this reason).
   */
  async finish(job: string, reason?: string): Promise<void> {
    const run = this.chatRuns.get(job)
    if (run === undefined) return
    this.chatRuns.delete(job)
    for (const dispose of run.disposers.splice(0)) dispose()
    const text = (run.fold.collect() ?? []).map(block => block.type === 'text' ? block.text : '').join('').trim()
    const selection = this.ctx.agentDefaultModel.currentSelection()
    run.worker.channel.send(reason === undefined && !run.overBudget
      ? { type: 'finish', text, model: `${selection.provider}/${selection.model}` }
      : { type: 'failed', reason: run.overBudget ? 'se agotó el presupuesto de pasos.' : reason })
    await run.worker.closed
  }

  /**
   * @param sessionId - a chat Session.
   * @returns whether that Session's agent is hosting a planning run now.
   */
  hosts(sessionId: string): boolean {
    return [...this.chatRuns.values()].some(run => run.sessionId === sessionId)
  }

  /**
   * End every chat-hosted run of a Session, so the worker records questions or results before the next attempt.
   * @param sessionId - the chat Session.
   */
  async finishSession(sessionId: string): Promise<void> {
    const jobs = [...this.chatRuns.values()].filter(run => run.sessionId === sessionId).map(run => run.job)
    for (const job of jobs) await this.finish(job)
  }

  /**
   * Start a month's worker and host its planning agent on a background Session; a month already running here is left alone.
   * @param launch - the job, its worker and its log, as the bridge reported them.
   */
  start(launch: EngineLaunch): void {
    if (this.background.has(launch.trabajo) || this.chatRuns.has(launch.trabajo)) return
    const run = this.runInBackground(launch)
      .catch((error: unknown) => { this.ctx.logger.warn(`fiscalcfdi: accounting run ${launch.trabajo} failed: ${String(error)}`) })
      .finally(() => { this.background.delete(launch.trabajo) })
    this.background.set(launch.trabajo, run)
  }

  /** One engine tool on the chat agent; calls beyond the step budget are refused. */
  private chatTool(run: ChatRun, tool: AgentSpec['tools'][number]): ToolDefinition {
    const budget = run.worker.spec.settings.max_turns
    return {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }] },
      execute: async (args, exec) => {
        run.calls += 1
        if (run.calls > budget) {
          run.overBudget = true
          return 'Se agotó el presupuesto de pasos de este intento. Explica al usuario dónde quedó el mes y termina el turno.'
        }
        const output = await run.worker.channel.call(exec.callId, tool.name, args)
        if (tool.name === 'ask_operator') return `${output}\n${CHAT_QUESTION_NOTE}`
        // An exported importable closes the attempt now, so the month is completed for the rest of this turn.
        if (tool.name === 'generate_importable' && exported(output)) {
          await this.finish(run.job)
          return `${output}\n${CHAT_EXPORTED_NOTE}`
        }
        return output
      },
    }
  }

  /** Spawn the worker; @returns its planning agent once preparation succeeds, or undefined when it fails. */
  private async spawnWorker(launch: EngineLaunch): Promise<StartedWorker | undefined> {
    const env = await this.options.environment()
    const log = await open(launch.log, 'a')
    const child = spawn(this.options.python, [launch.worker, launch.trabajo], { stdio: ['ignore', log.fd, log.fd, 'pipe', 'pipe'], env })
    const closed = new Promise<void>((resolve) => { child.once('close', () => { resolve() }) }).then(() => log.close())
    const lines = createInterface({ input: child.stdio[4] as Readable, crlfDelay: Infinity })[Symbol.asyncIterator]()
    const channel = new WorkerChannel(child.stdio[3] as Writable, lines)
    // The worker prepares the month first; it closes the channel without a request when preparation fails.
    const first = await channel.next()
    if (first?.type !== 'agent') {
      await closed
      return undefined
    }
    return { spec: first, channel, closed }
  }

  private async runInBackground(launch: EngineLaunch): Promise<void> {
    const worker = await this.spawnWorker(launch)
    if (worker === undefined) return
    const pump = worker.channel.pump()
    worker.channel.send(await this.host(worker.spec, worker.channel))
    await pump
    await worker.closed
  }

  /** Run the planning agent as a native Session and tell how it ended. */
  private async host(spec: AgentSpec, channel: WorkerChannel): Promise<object> {
    const { ctx } = this
    const selection = ctx.agentDefaultModel.currentSelection()
    const folder = join(this.options.home, 'fiscalcfdi', 'contabilidad')
    await mkdir(folder, { recursive: true })
    const workspace = await ctx.workspaceRegistry.create(folder)
    const sessionId = brandString<SessionId>(`fiscalcfdi-${randomUUID()}`)
    const fold = new AssistantOutputFold()
    const progress: { end?: TurnEndReason; calls: number; overBudget: boolean } = { calls: 0, overBudget: false }
    const names = spec.tools.map(tool => tool.name)
    const handle = await ctx.agents.create({
      sessionId,
      meta: { cwd: folder },
      agentOptions: {
        provider: selection.provider,
        model: selection.model,
        reasoningEffort: ReasoningEffortId(spec.settings.reasoning_effort),
        maxTokens: spec.settings.max_tokens,
      },
      setup: (agentCtx, agent: Agent) => {
        // The engine's instructions are the whole system prompt, as they were with its own client.
        agentCtx.effect(() => agentCtx.systemPrompt.section({
          name: PERSONA_PREFIX_SECTION,
          order: agentCtx.systemPrompt.getSectionOrder('DEPLOYMENT_PERSONA_PREFIX'),
          text: spec.instructions,
          complete: true,
        }), 'fiscalcfdi: planning instructions')
        for (const tool of spec.tools) {
          const definition: ToolDefinition = {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters,
            output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }] },
            execute: async (args, exec) => {
              progress.calls += 1
              if (progress.calls > spec.settings.max_turns) {
                progress.overBudget = true
                agent.cancel({ kind: 'hook', reason: 'step budget' })
                return 'Se agotó el presupuesto de pasos de esta corrida.'
              }
              return channel.call(exec.callId, tool.name, args)
            },
          }
          agentCtx.effect(() => agentCtx.tools.register(definition), `fiscalcfdi: ${tool.name}`)
        }
        agentCtx.effect(() => agentCtx.tools.restrict({ allow: names }), 'fiscalcfdi: engine tools only')
        // Same sampling as the engine's own client: deterministic plans.
        agentCtx.on('agent/request', async (_payload, next) => ({ ...await next(), temperature: spec.settings.temperature }))
        agentCtx.on('session/event', (_session: unknown, event: SessionEvent) => {
          fold.push(event)
          if (event.type === 'turn/end') progress.end = event.data.reason
        })
      },
    })
    try {
      await workspace.attachSession(sessionId)
      if (spec.title !== undefined) ctx.sessionTitle.rename(handle.agent.session, spec.title)
      handle.agent.followup(createUserMessage({ content: [{ type: 'text', text: spec.message }], source: { kind: 'user' } }))
      await handle.agent.whenIdle()
      const text = (fold.collect() ?? []).map(block => block.type === 'text' ? block.text : '').join('').trim()
      const end = progress.end
      if (end?.kind === 'completed') return { type: 'finish', text, model: `${selection.provider}/${selection.model}` }
      return { type: 'failed', reason: progress.overBudget ? 'se agotó el presupuesto de pasos.' : `la corrida terminó sin completar (${end?.kind ?? 'sin respuesta del modelo'}).` }
    } finally {
      await handle.dispose()
    }
  }
}
