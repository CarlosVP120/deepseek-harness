/**
 * Turn-scoped workpaper results, so the result card renders beneath the
 * Turn's closing reply instead of inside the collapsed Tool group. Built from
 * the Session log alone (results and their presentation metadata), so replay
 * reproduces the cards.
 */
import { isAppendSurfaceEvent } from '@deepseek-ai/dsh-session/surface'
import { PartialArguments } from '@deepseek-ai/dsh-util-values'
import type { ConversationNodeDefinition, ToolResultNode } from '@deepseek-ai/dsh-client-ui-conversation/client'

/** Tool whose settled results in a Turn become result cards. */
export const FINISH_TOOL = 'workpaper_finish'

/** Every workpaper closed in one Turn, in order. */
export interface WorkpaperTurnData {
  readonly results: readonly ToolResultNode[]
}

declare module '@deepseek-ai/dsh-client-ui-conversation/client' {
  interface ConversationTurnDataMap {
    /** Workpapers closed in this Turn. */
    'eqidis-workpapers': WorkpaperTurnData
  }
}

interface Call { readonly argsRaw: string; readonly time: number }

interface State extends WorkpaperTurnData {
  readonly turn: number
  readonly calls: ReadonlyMap<string, Call>
}

/** Turn-local accumulator; it publishes no view Node. */
export const workpaperTurnDefinition: ConversationNodeDefinition<State> = {
  kind: 'eqidis-workpapers',
  match: (event) => {
    if (event.type === 'turn/start') return { id: String(event.data.turn), role: 'start' }
    if (event.type === 'tool/call') return { id: String(event.data.turn), role: 'update' }
    if (event.type === 'tool/result' && isAppendSurfaceEvent(event)) return { id: String(event.data.turn), role: 'update' }
    return null
  },
  start: (_context, match) => {
    if (match.event.type !== 'turn/start') throw new Error('eqidis-workpapers start requires turn/start')
    return { turn: match.event.data.turn, calls: new Map(), results: [] }
  },
  update: (context, match) => {
    const event = match.event
    if (event.type === 'tool/call') {
      if (event.data.name !== FINISH_TOOL) return context.state
      const calls = new Map(context.state.calls)
      calls.set(String(event.data.callId), { argsRaw: event.data.arguments, time: event.seq })
      return { ...context.state, calls }
    }
    if (event.type !== 'tool/result') return context.state
    const message = event.data.message
    const call = context.state.calls.get(String(message.source.callId))
    if (call === undefined || message.isError === true) return context.state
    const node: ToolResultNode = {
      kind: 'tool-result',
      seq: event.seq,
      time: event.time,
      callId: String(message.source.callId),
      name: FINISH_TOOL,
      args: PartialArguments.fromText(call.argsRaw),
      call: { name: FINISH_TOOL, argsRaw: call.argsRaw },
      callTime: call.time,
      content: message.content,
      isError: false,
      ...(event.data.meta === undefined ? {} : { meta: event.data.meta }),
      subCalls: [],
    }
    return { ...context.state, results: [...context.state.results, node] }
  },
  buildLocationData: (context, scope, previous) => {
    if (scope !== 'turn' || context.state === undefined) return null
    const { turn, results } = context.state
    if (results.length === 0) return null
    if (previous?.kind === 'turn' && previous.turn === turn && previous.key === 'eqidis-workpapers'
      && previous.value.results === results) return previous
    return { kind: 'turn', turn, key: 'eqidis-workpapers', value: { results } }
  },
}
