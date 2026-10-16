/**
 * Turn-scoped FiscalCFDI AI results, so the month and bank-coverage cards render
 * beneath the Turn's closing reply instead of inside the collapsed Tool group.
 * Built from the Session log alone (results and their presentation metadata),
 * so replay reproduces the cards.
 */
import { isAppendSurfaceEvent } from '@deepseek-ai/dsh-session/surface'
import { PartialArguments } from '@deepseek-ai/dsh-util-values'
import type { ConversationNodeDefinition, ToolResultNode } from '@deepseek-ai/dsh-client-ui-conversation/client'

/** Tools whose last settled result in a Turn becomes the month card. */
export const MONTH_TOOLS = new Set(['fiscalcfdi_estado', 'fiscalcfdi_procesar'])
/** Tool whose last settled result in a Turn becomes the coverage card. */
export const COVERAGE_TOOL = 'fiscalcfdi_cobertura'

/** Latest month and coverage results of one Turn. */
export interface FiscalcfdiTurnData {
  readonly month?: ToolResultNode
  readonly coverage?: ToolResultNode
}

declare module '@deepseek-ai/dsh-client-ui-conversation/client' {
  interface ConversationTurnDataMap {
    /** Latest FiscalCFDI AI month and coverage results settled in this Turn. */
    'fiscalcfdi-cards': FiscalcfdiTurnData
  }
}

interface Call { readonly name: string; readonly argsRaw: string; readonly time: number }

interface State extends FiscalcfdiTurnData {
  readonly turn: number
  readonly calls: ReadonlyMap<string, Call>
}

/** Turn-local accumulator; it publishes no view Node. */
export const fiscalcfdiTurnDefinition: ConversationNodeDefinition<State> = {
  kind: 'fiscalcfdi-cards',
  match: (event) => {
    if (event.type === 'turn/start') return { id: String(event.data.turn), role: 'start' }
    if (event.type === 'tool/call') return { id: String(event.data.turn), role: 'update' }
    if (event.type === 'tool/result' && isAppendSurfaceEvent(event)) return { id: String(event.data.turn), role: 'update' }
    return null
  },
  start: (_context, match) => {
    if (match.event.type !== 'turn/start') throw new Error('fiscalcfdi-cards start requires turn/start')
    return { turn: match.event.data.turn, calls: new Map() }
  },
  update: (context, match) => {
    const event = match.event
    if (event.type === 'tool/call') {
      if (!MONTH_TOOLS.has(event.data.name) && event.data.name !== COVERAGE_TOOL) return context.state
      const calls = new Map(context.state.calls)
      calls.set(String(event.data.callId), { name: event.data.name, argsRaw: event.data.arguments, time: event.seq })
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
      name: call.name,
      args: PartialArguments.fromText(call.argsRaw),
      call: { name: call.name, argsRaw: call.argsRaw },
      callTime: call.time,
      content: message.content,
      isError: false,
      ...(event.data.meta === undefined ? {} : { meta: event.data.meta }),
      subCalls: [],
    }
    return call.name === COVERAGE_TOOL ? { ...context.state, coverage: node } : { ...context.state, month: node }
  },
  buildLocationData: (context, scope, previous) => {
    if (scope !== 'turn' || context.state === undefined) return null
    const { turn, month, coverage } = context.state
    if (month === undefined && coverage === undefined) return null
    if (previous?.kind === 'turn' && previous.turn === turn && previous.key === 'fiscalcfdi-cards'
      && previous.value.month === month && previous.value.coverage === coverage) return previous
    return { kind: 'turn', turn, key: 'fiscalcfdi-cards', value: { ...(month === undefined ? {} : { month }), ...(coverage === undefined ? {} : { coverage }) } }
  },
}
