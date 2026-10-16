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
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { CoverageCard } from './CoverageCard.tsx'
import { MonthCard } from './MonthCard.tsx'
import { MonthsPanel, type MonthsPanelInjected } from './MonthsPanel.tsx'
import { contabiliaiTurnDefinition } from './turn.ts'
import { MonthRegistry, type MonthRemote } from './month-store.ts'
import { MonthSelector, type MonthSelectorInjected } from './MonthSelector.tsx'
import { MonthPanel, type MonthPanelInjected } from './MonthPanel.tsx'
import { TurnCards } from './TurnCards.tsx'
import { en, es, NS, zh, type ContabiliaiKey } from './locales.ts'

/** The month panel's identity in the right Sidebar's tab system. */
const MONTH_TAB_ID = '@deepseek-ai/dsh-client-ui-contabiliai/month'
/** The month panel's tab kind. */
const MONTH_TAB_KIND = 'contabiliaiMonth'

declare module '@deepseek-ai/dsh-client-ui-sidebar-right/client' {
  interface SidebarRightTabParamsMap {
    /** The chat whose company month the panel shows. */
    contabiliaiMonth: { sessionId: SessionId }
  }
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** FiscalCFDI AI chat cards and start-page panel copy. */
    'contabiliai': ContabiliaiKey
  }
}

/** Required services: the Remote mount, dictionaries and UI slots. */
export const inject = ['remote', 'slots', 'locale', 'uiConversation', 'sidebarRight', 'sidebarRightTabs']

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
  // The chat's company month: a composer chip that selects it and a right-Sidebar page that works it.
  type Result<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: unknown }
  const unwrap = async <T>(call: Promise<Result<T>>): Promise<T> => {
    const result = await call
    if (!result.ok) throw result.error
    return result.value
  }
  const remote: MonthRemote = {
    companies: () => unwrap(ctx.remote.contabiliai.companies()),
    binding: sessionId => unwrap(ctx.remote.contabiliai.binding({ sessionId })),
    bind: (sessionId, rfc, periodo) => unwrap(ctx.remote.contabiliai.bind({ sessionId, rfc, periodo })),
    unbind: async (sessionId) => { await unwrap(ctx.remote.contabiliai.unbind({ sessionId })) },
    month: (rfc, periodo) => unwrap(ctx.remote.contabiliai.month({ rfc, periodo })),
    upload: (rfc, periodo, files) => unwrap(ctx.remote.contabiliai.upload({ rfc, periodo, files })),
    answer: (rfc, periodo, texto, preguntaId) => unwrap(ctx.remote.contabiliai.answer({ rfc, periodo, texto, pregunta_id: preguntaId })),
    process: (rfc, periodo) => unwrap(ctx.remote.contabiliai.process({ rfc, periodo })),
    importable: (rfc, periodo) => unwrap(ctx.remote.contabiliai.importable({ rfc, periodo })),
  }
  const months = new MonthRegistry(remote)
  const openPanel = (sessionId: string) => {
    const existing = ctx.sidebarRight.tabsIn(sessionId as SessionId).find(tab => tab.kind === MONTH_TAB_KIND)
    if (existing === undefined) {
      ctx.sidebarRight.openTab(MONTH_TAB_KIND, { params: { sessionId: sessionId as SessionId } })
      return
    }
    if (!ctx.sidebarRight.isExpanded()) ctx.sidebarRight.toggleExpanded()
    ctx.sidebarRight.focus(existing.id)
  }
  const t = ctx.locale.bind(NS)
  ctx.effect(() => ctx.sidebarRightTabs.register({
    id: MONTH_TAB_ID, kind: MONTH_TAB_KIND, priority: 'builtin', title: () => t('panel.title'),
  }), 'ui-contabiliai: month tab type')
  ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab', key: MONTH_TAB_ID, locale: NS, inject: (): MonthPanelInjected => ({ months }),
  }, MonthPanel))
  ctx.slots.inject('conversation.input.left', () => ctx.slots.register({
    name: 'conversation.input.left', id: 'contabiliai-month', order: 0, locale: NS,
    inject: (): MonthSelectorInjected => ({ months, openPanel }),
  }, MonthSelector))

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
  const ui = ctx.inject(['remote.contabiliai', 'slots', 'locale', 'uiConversation', 'sidebarRight', 'sidebarRightTabs'], registerUi)
  try { await ui } catch (error) { await ui.dispose(); await disposeRemote(); throw error }
  return async () => { await ui.dispose(); await disposeRemote() }
}
