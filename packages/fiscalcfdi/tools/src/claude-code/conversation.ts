/**
 * One chat Session's live Claude Code process. The harness keeps the agent loop: each model request becomes
 * one stretch of Claude Code's own turn, from the request's new input to the next tool calls or the end of
 * the turn. Tool calls reach Claude Code as MCP tools through the {@link ToolGateway}; each call waits there
 * until the next harness request carries the tool's result, so Claude Code keeps its own context and cache
 * across the whole turn while the harness runs, records and shows every tool call as usual.
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  ToolCallId, type ContentBlock, type ContentBlockType, type LlmFailure, type RequestMessage, type StreamChunk,
  type TokenUsage, type ToolSchema,
} from '@deepseek-ai/dsh-llm'
import { claudeEnvironment } from './cli.ts'
import { SERVER, type GatewayChannel, type GatewayToolResult, type ToolGateway } from './gateway.ts'

/** What a conversation needs to start Claude Code. */
export interface ConversationOptions {
  executable: string
  /** Working directory of the process; holds nothing of the user's. */
  cwd: string
  model: string
  effort: string | undefined
  /** The harness system prompt; Claude Code's own is replaced. */
  system: string
  gateway: ToolGateway
}

/** Claude Code's stream-json events, as far as this adapter reads them. */
type ClaudeEvent =
  | { type: 'stream_event'; event: AnthropicEvent }
  | { type: 'result'; subtype: string; is_error: boolean; result?: string; usage?: Record<string, number> }
  | { type: 'exit'; detail: string }
  | { type: string }

type AnthropicEvent =
  | { type: 'message_start'; message: { usage?: Record<string, number> } }
  | { type: 'content_block_start'; index: number; content_block: { type: string; id?: string; name?: string } }
  | { type: 'content_block_delta'; index: number; delta: { type: string; text?: string; thinking?: string; partial_json?: string } }
  | { type: 'content_block_stop'; index: number }
  | { type: 'message_delta'; delta: { stop_reason?: string | null }; usage?: Record<string, number> }
  | { type: 'message_stop' }

const PREFIX = `mcp__${SERVER}__`

/** Extra system prompt text telling the model how its tools are named inside Claude Code. */
export const TOOL_NAMING = `\n\nTus herramientas están disponibles con el prefijo ${PREFIX}: por ejemplo, una herramienta llamada `
  + `fiscalcfdi_procesar se invoca como ${PREFIX}fiscalcfdi_procesar. Usa solo esas herramientas.`

/** The visible text of message content, with tool calls and attachments named. */
export function contentText(content: readonly ContentBlock[]): string {
  return content.map((block) => {
    switch (block.type) {
      case 'text': return block.text
      case 'tool-call': return `[Llamada a la herramienta ${block.name} con ${block.arguments}]`
      case 'image': return '[Imagen adjunta]'
      case 'file': return `[Archivo adjunto: ${block.attachment.name}]`
      default: return ''
    }
  }).filter(text => text !== '').join('\n')
}

/**
 * Render earlier conversation as one text message for a fresh Claude Code process: after an app restart, a
 * changed model, or history the live process does not hold.
 * @param messages - the request's messages after the system prompt.
 * @returns the text Claude Code receives as its first user message.
 */
export function transcript(messages: readonly RequestMessage[]): string {
  const last = messages.at(-1)
  if (messages.length === 1 && last?.role === 'user') return contentText(last.content)
  const names = new Map<string, string>()
  const lines = messages.map((message) => {
    switch (message.role) {
      case 'user': return `Usuario:\n${contentText(message.content)}`
      case 'assistant':
        for (const block of message.content) if (block.type === 'tool-call') names.set(block.id, block.name)
        return `Asistente:\n${contentText(message.content)}`
      case 'tool': return `[Resultado de ${names.get(message.toolCallId) ?? 'la herramienta'}${message.isError === true ? ' (error)' : ''}]\n${contentText(message.content)}`
      case 'system': return `[Sistema]\n${contentText(message.content)}`
      default: return ''
    }
  }).filter(text => text !== '')
  return 'Esta conversación continúa una anterior. Este es el historial hasta ahora:\n<historial>\n'
    + `${lines.join('\n\n')}\n</historial>\nContinúa desde aquí.`
}

interface PendingCall {
  id: string
  name: string
  args: unknown
  /** Claude Code's MCP call for it has arrived. */
  matched: boolean
  /** The harness has handed back its result. */
  answered: boolean
}

/** A live Claude Code process for one Session. */
export class ClaudeConversation {
  /** Text of the last stretch's reply, which identifies it in the next request. */
  lastText = ''
  /** Tool calls Claude Code has requested and not yet both called and been answered; it calls them one at a time. */
  private calls: PendingCall[] = []
  private readonly results = new Map<string, PromiseWithResolvers<GatewayToolResult>>()
  /** MCP calls that arrived before the stretch that requested them was read to its end. */
  private waiting: { name: string; args: Record<string, unknown>; settle: PromiseWithResolvers<GatewayToolResult> }[] = []
  private readonly events: ClaudeEvent[] = []
  private wake: (() => void) | undefined
  private stderr = ''
  private exited = false
  private child: ChildProcessWithoutNullStreams | undefined
  private channel: GatewayChannel | undefined
  private tools: readonly ToolSchema[] = []
  /** The model, effort and system prompt this process runs with. */
  readonly identity: string

  /** @param options - executable, model and system prompt. */
  constructor(private readonly options: ConversationOptions) {
    this.identity = JSON.stringify([options.model, options.effort, options.system])
  }

  /** Whether the process is still running. */
  get alive(): boolean {
    return !this.exited
  }

  /** Tool call ids the last stretch ended with. */
  get openCalls(): readonly string[] {
    return this.calls.filter(call => !call.answered).map(call => call.id)
  }

  /** Start Claude Code with its MCP channel. */
  async start(): Promise<void> {
    this.channel = await this.options.gateway.open((name, args) => this.called(name, args))
    this.channel.setTools(this.tools)
    await mkdir(this.options.cwd, { recursive: true })
    // The prompt and MCP configuration go in files: long or quoted arguments are fragile on Windows.
    const stem = join(this.options.cwd, `session-${process.pid}-${Date.now()}`)
    const prompt = `${stem}.md`
    const mcp = `${stem}.mcp.json`
    await writeFile(prompt, this.options.system + TOOL_NAMING)
    await writeFile(mcp, this.channel.config)
    const args = [
      '-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--include-partial-messages',
      '--strict-mcp-config', '--mcp-config', mcp, '--setting-sources', '', '--tools', '',
      '--allowedTools', `mcp__${SERVER}`, '--permission-mode', 'dontAsk', '--no-session-persistence',
      '--model', this.options.model, '--system-prompt-file', prompt,
      ...this.options.effort === undefined ? [] : ['--effort', this.options.effort],
    ]
    const child = spawn(this.options.executable, args, { cwd: this.options.cwd, env: claudeEnvironment(), windowsHide: true })
    this.child = child
    let buffer = ''
    child.stdout.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8')
      let end: number
      while ((end = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, end).trim()
        buffer = buffer.slice(end + 1)
        if (line === '') continue
        try {
          this.push(JSON.parse(line) as ClaudeEvent)
        } catch {
          // A non-JSON line is Claude Code diagnostics, not protocol; it is kept with stderr for failures.
          this.stderr = `${this.stderr}${line}\n`.slice(-4000)
        }
      }
    })
    child.stderr.on('data', (chunk: Buffer) => { this.stderr = `${this.stderr}${chunk.toString('utf8')}`.slice(-4000) })
    child.once('error', (error) => { this.exit(String(error)) })
    child.once('close', (code) => {
      this.exit(`Claude Code terminó (código ${String(code)})`)
      for (const file of [prompt, mcp]) void rm(file, { force: true })
    })
  }

  /** Offer the request's tools; Claude Code relists them when they changed. */
  setTools(tools: readonly ToolSchema[]): void {
    this.tools = tools
    this.channel?.setTools(tools)
  }

  /** Send user input to Claude Code. */
  send(text: string): void {
    this.child?.stdin.write(`${JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'text', text }] } })}\n`)
  }

  /** Answer one tool call of the last stretch; Claude Code continues once every call is answered. */
  answer(id: string, result: GatewayToolResult): void {
    this.result(id).resolve(result)
    for (const call of this.calls) if (call.id === id) call.answered = true
    this.prune()
  }

  /** Stop the process and its channel. */
  dispose(): void {
    this.exit('La conversación con Claude Code terminó')
    this.child?.kill()
    for (const pending of this.results.values()) pending.resolve({ text: 'La conversación terminó.', isError: true })
    for (const call of this.waiting) call.settle.resolve({ text: 'La conversación terminó.', isError: true })
    this.waiting = []
  }

  /**
   * Read Claude Code until it calls tools or ends its turn, as one harness model response.
   * @param signal - the request's cancellation; it ends the process.
   * @yields the response's stream chunks, ending with exactly one `finish`.
   */
  async *stretch(signal: AbortSignal | undefined): AsyncGenerator<StreamChunk> {
    const onAbort = () => { this.dispose() }
    signal?.addEventListener('abort', onAbort, { once: true })
    const blocks = new Map<number, { index: number; type: ContentBlockType; text: string; id?: string; name?: string }>()
    let next = 0
    const usage: TokenUsage = { inputTokens: 0, outputTokens: 0 }
    let stop: string | null | undefined
    const calls: PendingCall[] = []
    let text = ''
    try {
      for (;;) {
        const event = await this.take()
        if (signal?.aborted === true) {
          yield { type: 'finish', reason: { kind: 'aborted', failure: { code: 'ABORTED', message: 'Solicitud cancelada' } } }
          return
        }
        if (event.type === 'exit') {
          yield { type: 'finish', reason: { kind: 'error', failure: this.failure((event as { detail: string }).detail) } }
          return
        }
        if (event.type === 'result') {
          const result = event as Extract<ClaudeEvent, { type: 'result' }>
          if (result.is_error || result.subtype !== 'success') {
            yield { type: 'finish', reason: { kind: 'error', failure: this.failure(result.result ?? result.subtype) } }
            return
          }
          this.lastText = text
          yield { type: 'usage', usage }
          yield { type: 'finish', reason: { kind: 'stop' } }
          return
        }
        if (event.type !== 'stream_event') continue
        const raw = (event as Extract<ClaudeEvent, { type: 'stream_event' }>).event
        switch (raw.type) {
          case 'message_start':
            blocks.clear()
            stop = undefined
            addUsage(usage, raw.message.usage)
            break
          case 'content_block_start': {
            const kind = raw.content_block.type
            const type: ContentBlockType | undefined = kind === 'text' ? 'text' : kind === 'thinking' ? 'reasoning' : kind === 'tool_use' ? 'tool-call' : undefined
            if (type === undefined) break
            const native = raw.content_block.name
            const name = native?.startsWith(PREFIX) === true ? native.slice(PREFIX.length) : native
            const block = { index: next++, type, text: '', ...raw.content_block.id === undefined ? {} : { id: raw.content_block.id }, ...name === undefined ? {} : { name } }
            blocks.set(raw.index, block)
            yield { type: 'block-start', index: block.index, blockType: type }
            break
          }
          case 'content_block_delta': {
            const block = blocks.get(raw.index)
            if (block === undefined) break
            const delta = raw.delta
            if (block.type === 'text' && delta.text !== undefined) {
              block.text += delta.text
              yield { type: 'text-delta', index: block.index, text: delta.text }
            } else if (block.type === 'reasoning' && delta.thinking !== undefined) {
              block.text += delta.thinking
              yield { type: 'reasoning-delta', index: block.index, text: delta.thinking }
            } else if (block.type === 'tool-call' && delta.partial_json !== undefined) {
              const first = block.text === ''
              block.text += delta.partial_json
              yield { type: 'tool-call-delta', index: block.index, id: ToolCallId(block.id ?? ''), ...first ? { name: block.name ?? '' } : {}, argumentsDelta: delta.partial_json }
            }
            break
          }
          case 'content_block_stop': {
            const block = blocks.get(raw.index)
            if (block === undefined) break
            if (block.type === 'tool-call') {
              const args = block.text === '' ? '{}' : block.text
              calls.push({ id: block.id ?? '', name: block.name ?? '', args: parse(args), matched: false, answered: false })
              yield { type: 'block-end', index: block.index, block: { type: 'tool-call', id: ToolCallId(block.id ?? ''), name: block.name ?? '', arguments: args } }
            } else if (block.type === 'reasoning') {
              yield { type: 'block-end', index: block.index, block: { type: 'reasoning', text: block.text } }
            } else {
              text += block.text
              yield { type: 'block-end', index: block.index, block: { type: 'text', text: block.text } }
            }
            break
          }
          case 'message_delta':
            stop = raw.delta.stop_reason
            addUsage(usage, raw.usage)
            break
          case 'message_stop':
            if (stop === 'tool_use' && calls.length > 0) {
              this.lastText = text
              this.calls = [...this.calls, ...calls]
              this.bind()
              yield { type: 'usage', usage }
              yield { type: 'finish', reason: { kind: 'tool-calls' } }
              return
            }
            break
          default:
            break
        }
      }
    } finally {
      signal?.removeEventListener('abort', onAbort)
    }
  }

  /** Claude Code called a tool: wait for the harness result of the matching tool call. */
  private called(name: string, args: Record<string, unknown>): Promise<GatewayToolResult> {
    if (this.exited) return Promise.resolve({ text: 'La conversación terminó.', isError: true })
    const settle = Promise.withResolvers<GatewayToolResult>()
    this.waiting.push({ name, args, settle })
    this.bind()
    return settle.promise
  }

  /** Pair each waiting MCP call with the tool call of the stretch it belongs to, by name and arguments. */
  private bind(): void {
    this.waiting = this.waiting.filter(({ name, args, settle }) => {
      const open = (call: PendingCall) => !call.matched && call.name === name
      const call = this.calls.find(candidate => open(candidate) && JSON.stringify(candidate.args) === JSON.stringify(args))
        ?? this.calls.find(open)
      if (call === undefined) return true
      call.matched = true
      this.result(call.id).promise.then(settle.resolve, settle.reject)
      return false
    })
    this.prune()
  }

  /** Forget calls that are both called and answered. */
  private prune(): void {
    this.calls = this.calls.filter(call => !(call.matched && call.answered))
  }

  private result(id: string): PromiseWithResolvers<GatewayToolResult> {
    let pending = this.results.get(id)
    if (pending === undefined) {
      pending = Promise.withResolvers<GatewayToolResult>()
      this.results.set(id, pending)
    }
    return pending
  }

  private push(event: ClaudeEvent): void {
    this.events.push(event)
    this.wake?.()
  }

  private exit(detail: string): void {
    if (this.exited) return
    this.exited = true
    this.channel?.close()
    this.push({ type: 'exit', detail })
  }

  private async take(): Promise<ClaudeEvent> {
    for (;;) {
      const event = this.events.shift()
      if (event !== undefined) return event
      if (this.exited) return { type: 'exit', detail: 'Claude Code no está en ejecución' }
      await new Promise<void>((resolve) => { this.wake = resolve })
      this.wake = undefined
    }
  }

  private failure(detail: string): LlmFailure {
    const text = `${detail}\n${this.stderr}`.trim()
    if (/usage limit|rate limit|límite/i.test(text)) return { code: 'QUOTA', message: `Se alcanzó el límite de uso de tu plan de Claude. ${detail}`.trim() }
    if (/login|log in|auth|401|invalid api key/i.test(text)) {
      return { code: 'AUTH', message: 'Claude Code no tiene una sesión iniciada. Conéctalo en Ajustes → Modelos → Claude.' }
    }
    return { code: 'PROVIDER_ERROR', message: `Claude Code: ${text.slice(-800)}` }
  }
}

function parse(json: string): unknown {
  try {
    return JSON.parse(json)
  } catch {
    // Arguments Claude Code streamed incompletely are matched by tool name only.
    return json
  }
}

function addUsage(usage: TokenUsage, raw: Record<string, number> | undefined): void {
  if (raw === undefined) return
  if (raw.input_tokens !== undefined) usage.inputTokens += raw.input_tokens
  if (raw.output_tokens !== undefined) usage.outputTokens = raw.output_tokens
  if (raw.cache_read_input_tokens !== undefined) usage.cacheReadTokens = (usage.cacheReadTokens ?? 0) + raw.cache_read_input_tokens
  if (raw.cache_creation_input_tokens !== undefined) {
    usage.cacheWriteTokens = (usage.cacheWriteTokens ?? 0) + raw.cache_creation_input_tokens
  }
}
