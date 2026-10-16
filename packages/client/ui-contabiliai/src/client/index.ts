/**
 * FiscalCFDI AI browser views: the month card for `contabiliai_estado` and
 * `contabiliai_procesar`, the bank-coverage card for `contabiliai_cobertura`
 * and the start-page accounting months panel, which reads the Host's
 * `contabiliai` Remote namespace. This plugin mounts that namespace itself, so
 * the shared Remote assembly stays free of product packages.
 */
import type { Context } from '@deepseek-ai/cordis'
import contabiliaiRemote from '@deepseek-ai/dsh-contabiliai-tools/remote'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-tool/client'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import { CoverageCard } from './CoverageCard.tsx'
import { MonthCard } from './MonthCard.tsx'
import { MonthsPanel, type MonthsPanelInjected } from './MonthsPanel.tsx'
import { contabiliaiTurnDefinition } from './turn.ts'
import { TurnCards } from './TurnCards.tsx'
import { en, es, NS, zh, type ContabiliaiKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** FiscalCFDI AI chat cards and start-page panel copy. */
    'contabiliai': ContabiliaiKey
  }
}

/** Required services: the Remote mount, dictionaries and UI slots. */
export const inject = ['remote', 'slots', 'locale', 'uiConversation']

function registerUi(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en, es }), 'ui-contabiliai: dictionaries')
  const panel: MonthsPanelInjected = {
    loadMonths: async () => {
      const result = await ctx.remote.contabiliai.months()
      if (!result.ok) throw result.error
      return result.value
    },
  }
  // Inside the Tool group each call keeps its card; the Turn's latest ones
  // repeat beneath the closing reply, where the accountant reads the result.
  ctx.slots.inject('tool.call.toolview', function* () {
    yield ctx.slots.register({ name: 'tool.call.toolview', key: 'contabiliai_estado', locale: NS }, MonthCard)
    yield ctx.slots.register({ name: 'tool.call.toolview', key: 'contabiliai_procesar', locale: NS }, MonthCard)
    yield ctx.slots.register({ name: 'tool.call.toolview', key: 'contabiliai_cobertura', locale: NS }, CoverageCard)
  })
  ctx.uiConversation.events.register(contabiliaiTurnDefinition)
  ctx.slots.inject('conversation.chat.turnTail', () => ctx.slots.register({
    name: 'conversation.chat.turnTail', id: 'contabiliai-cards', order: 10, locale: NS,
  }, TurnCards))
  ctx.slots.inject('conversation.home.panels', () => ctx.slots.register({
    name: 'conversation.home.panels', id: 'contabiliai-months', order: 0, locale: NS, inject: () => panel,
  }, MonthsPanel))
}

/**
 * Mount the `contabiliai` Remote namespace, then the views that read it.
 * @param ctx - Client runtime.
 * @returns disposer withdrawing the views before the namespace.
 */
export async function apply(ctx: Context): Promise<() => Promise<void>> {
  const disposeRemote = await ctx.remote.$mount(contabiliaiRemote)
  const ui = ctx.inject(['remote.contabiliai', 'slots', 'locale', 'uiConversation'], registerUi)
  try { await ui } catch (error) { await ui.dispose(); await disposeRemote(); throw error }
  return async () => { await ui.dispose(); await disposeRemote() }
}
