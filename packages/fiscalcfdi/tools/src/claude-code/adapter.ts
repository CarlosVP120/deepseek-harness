/**
 * The `claude-code` model route: chat requests run on the user's own Claude subscription through the
 * official Claude Code program installed on this computer, signed in with Anthropic's own flow. Each chat
 * Session keeps one live Claude Code process (see {@link ClaudeConversation}); auxiliary one-shot requests
 * (titles, summaries) run a short `claude -p` without tools.
 */
import { spawn } from 'node:child_process'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  LlmAdapter, ReasoningEffortId, type GenerateOptions, type LlmModelInfo, type LlmProviderInfo, type LlmResolvedModelInfo,
  type RequestMessage, type StreamChunk,
} from '@deepseek-ai/dsh-llm'
import { claudeEnvironment, claudeStatus, locateClaude } from './cli.ts'
import { ClaudeConversation, contentText, transcript } from './conversation.ts'
import { ToolGateway } from './gateway.ts'

/** Route key of the Claude subscription models. */
export const CLAUDE_CODE_PROVIDER = 'claude-code'

/** Models offered through Claude Code, by the aliases Claude Code resolves to the latest version. */
const MODELS = [
  { id: 'opus', name: 'Claude Opus' },
  { id: 'sonnet', name: 'Claude Sonnet' },
  { id: 'haiku', name: 'Claude Haiku' },
] as const

const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const
const EFFORT_NAMES: Record<(typeof EFFORTS)[number], string> = { low: 'Baja', medium: 'Media', high: 'Alta', xhigh: 'Muy alta', max: 'Máxima' }

/** A Session's process is stopped after this long without requests; the next request starts it again. */
const IDLE_MS = 20 * 60 * 1000

/** How long a sign-in check answers the model catalog before Claude Code is asked again. */
const STATUS_MS = 30 * 1000

/** What the adapter needs from its plugin. */
export interface ClaudeCodeAdapterOptions {
  /** Configured executable; empty finds the official install. */
  executable: string
  /** Data home; Claude Code runs in a private folder inside it. */
  home: string
  /** Whether the user connected Claude in this app. */
  linked: () => boolean
}

/** The `claude-code` adapter. */
export class ClaudeCodeAdapter extends LlmAdapter {
  private readonly gateway = new ToolGateway()
  private readonly conversations = new Map<string, { conversation: ClaudeConversation; idle?: NodeJS.Timeout }>()
  private signedIn: { at: number; value: Promise<boolean> } | undefined

  /** @param options - executable and data home. */
  constructor(private readonly options: ClaudeCodeAdapterOptions) {
    super()
  }

  override providerInfo(provider: string): LlmProviderInfo {
    return { id: provider, name: 'Claude (tu suscripción)' }
  }

  /** The models, offered only while Claude is connected in this app with a Claude subscription, as a configured provider's are. */
  override async listModels(provider: string): Promise<readonly LlmModelInfo[]> {
    if (!this.options.linked() || !await this.subscribed()) return []
    return MODELS.map(model => ({
      provider, id: model.id, name: model.name, description: 'Con tu suscripción de Claude, mediante Claude Code', inputModalities: ['text'] as const,
    }))
  }

  /** Forget the cached sign-in state, after the user connected or disconnected. */
  forgetStatus(): void {
    this.signedIn = undefined
  }

  private subscribed(): Promise<boolean> {
    if (this.signedIn === undefined || Date.now() - this.signedIn.at > STATUS_MS) {
      this.signedIn = {
        at: Date.now(),
        value: claudeStatus(this.options.executable).then(status => status.loggedIn && status.method === 'claude.ai', () => false),
      }
    }
    return this.signedIn.value
  }

  override resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    const known = MODELS.find(entry => entry.id === model)
    return Promise.resolve({
      provider, id: model, name: known?.name ?? model, inputModalities: ['text'],
      // Claude Code keeps and compacts its own context; a large window keeps the harness from compacting too.
      context: { contextWindow: 1000000 },
      reasoning: { efforts: EFFORTS.map(effort => ({ id: ReasoningEffortId(effort), name: EFFORT_NAMES[effort] })) },
    })
  }

  /** Stop every Claude Code process and the tool gateway. */
  async dispose(): Promise<void> {
    for (const { conversation, idle } of this.conversations.values()) {
      clearTimeout(idle)
      conversation.dispose()
    }
    this.conversations.clear()
    await this.gateway.dispose()
  }

  async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const executable = locateClaude(this.options.executable)
    if (executable === undefined) {
      yield {
        type: 'finish',
        reason: { kind: 'error', failure: { code: 'MISSING_CREDENTIAL', message: 'Claude Code no está instalado. Instálalo y conéctalo en Ajustes → Modelos → Claude.' } },
      }
      return
    }
    if (!this.options.linked()) {
      yield {
        type: 'finish',
        reason: { kind: 'error', failure: { code: 'AUTH', message: 'Claude no está conectado en FiscalCFDI AI. Conéctalo en Ajustes → Modelos → Claude.' } },
      }
      return
    }
    const leading = options.messages[0]?.role === 'system' ? options.messages[0] : undefined
    const system = [options.system ?? '', leading === undefined ? '' : contentText(leading.content)].filter(text => text !== '').join('\n\n')
    const messages = leading === undefined ? options.messages : options.messages.slice(1)
    if (options.sessionId === undefined || options.purpose !== undefined) {
      yield* this.once(executable, options, system, messages)
      return
    }
    const sessionId: string = options.sessionId
    const effort = options.reasoningEffort === undefined ? undefined : String(options.reasoningEffort)
    const entry = this.conversations.get(sessionId)
    clearTimeout(entry?.idle)
    let conversation = entry?.conversation
    const continued = conversation === undefined ? undefined : this.continuation(conversation, messages)
    const identity = JSON.stringify([options.model, effort, system])
    if (conversation === undefined || continued === undefined || !conversation.alive || conversation.identity !== identity) {
      conversation?.dispose()
      conversation = new ClaudeConversation({
        executable, cwd: join(this.options.home, 'claude-code'), model: options.model, effort, system, gateway: this.gateway,
      })
      this.conversations.set(sessionId, { conversation })
      conversation.setTools(options.tools ?? [])
      await conversation.start()
      conversation.send(transcript(messages))
    } else {
      conversation.setTools(options.tools ?? [])
      for (const message of continued) {
        if (message.role === 'tool') conversation.answer(message.toolCallId, { text: contentText(message.content), isError: message.isError === true })
        else if (message.role === 'user') conversation.send(contentText(message.content))
      }
    }
    const live = conversation
    try {
      yield* live.stretch(options.signal)
    } finally {
      if (live.alive) {
        const idle = setTimeout(() => {
          live.dispose()
          if (this.conversations.get(sessionId)?.conversation === live) this.conversations.delete(sessionId)
        }, IDLE_MS)
        this.conversations.set(sessionId, { conversation: live, idle })
      } else if (this.conversations.get(sessionId)?.conversation === live) {
        this.conversations.delete(sessionId)
      }
    }
  }

  /**
   * The messages a live process has not seen yet: everything after the request's last assistant message,
   * when that message is the process's last reply. Claude Code holds the whole conversation itself, so
   * earlier history the harness compacted or rewrote does not matter; only the reply must match: the same
   * open tool calls, or the same text when the turn ended.
   * @returns the new messages, or undefined when the process must be started again from the transcript.
   */
  private continuation(conversation: ClaudeConversation, messages: readonly RequestMessage[]): RequestMessage[] | undefined {
    const index = messages.findLastIndex(message => message.role === 'assistant')
    const reply = messages[index]
    if (reply?.role !== 'assistant') return undefined
    const open = new Set(conversation.openCalls)
    const calls = reply.content.flatMap(block => block.type === 'tool-call' ? [String(block.id)] : [])
    if (calls.length !== open.size || calls.some(id => !open.has(id))) return undefined
    const text = reply.content.flatMap(block => block.type === 'text' ? [block.text] : []).join('')
    if (open.size === 0 && text.trim() !== conversation.lastText.trim()) return undefined
    const rest = messages.slice(index + 1)
    if (rest.some(message => message.role === 'tool' && !open.has(String(message.toolCallId)))) return undefined
    const answered = new Set(rest.flatMap(message => message.role === 'tool' ? [String(message.toolCallId)] : []))
    if ([...open].some(id => !answered.has(id))) return undefined
    return rest
  }

  /** One request with no live conversation: titles and summaries. */
  private async *once(
    executable: string, options: GenerateOptions, system: string, messages: readonly RequestMessage[],
  ): AsyncGenerator<StreamChunk> {
    const cwd = join(this.options.home, 'claude-code')
    await mkdir(cwd, { recursive: true })
    const prompt = join(cwd, `once-${process.pid}-${Date.now()}.md`)
    await writeFile(prompt, system === '' ? 'Responde con precisión y brevedad.' : system)
    const args = ['-p', '--output-format', 'json', '--tools', '', '--strict-mcp-config', '--setting-sources', '', '--no-session-persistence',
      '--model', options.model, '--system-prompt-file', prompt]
    const child = spawn(executable, args, { cwd, env: claudeEnvironment(), windowsHide: true })
    const abort = () => { child.kill() }
    options.signal?.addEventListener('abort', abort, { once: true })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8') })
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8') })
    child.stdin.end(transcript(messages))
    const code = await new Promise<number | null>((resolve) => {
      child.once('error', () => { resolve(null) })
      child.once('close', resolve)
    })
    options.signal?.removeEventListener('abort', abort)
    await rm(prompt, { force: true })
    if (options.signal?.aborted === true) {
      yield { type: 'finish', reason: { kind: 'aborted', failure: { code: 'ABORTED', message: 'Solicitud cancelada' } } }
      return
    }
    let parsed: { result?: string; is_error?: boolean; usage?: Record<string, number> } = {}
    try {
      parsed = JSON.parse(stdout) as typeof parsed
    } catch {
      // Without JSON output the run failed before answering; stderr below says why.
    }
    if (code !== 0 || parsed.is_error === true || typeof parsed.result !== 'string') {
      yield { type: 'finish', reason: { kind: 'error', failure: { code: 'PROVIDER_ERROR', message: `Claude Code: ${(parsed.result ?? stderr).slice(-600)}` } } }
      return
    }
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text: parsed.result }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: parsed.result } }
    yield { type: 'usage', usage: { inputTokens: parsed.usage?.input_tokens ?? 0, outputTokens: parsed.usage?.output_tokens ?? 0 } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}
