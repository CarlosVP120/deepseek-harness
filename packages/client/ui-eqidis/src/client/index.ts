/**
 * EQIDIS AI workpaper views: the required intake that starts every
 * conversation (official workpapers, period, balanza and auxiliares) and the
 * result card of `workpaper_finish`. The project's templates come from the
 * Workspace Controller's project context, the same list the project settings
 * manage; the inputs are stored in the project's period folder.
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-api-workspace-controller/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type {} from '@deepseek-ai/dsh-client-ui-tool/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { PendingsPanel, type PendingsPanelInjected } from './PendingsPanel.tsx'
import { IntakePanel, type IntakeInjected, type IntakeProject } from './IntakePanel.tsx'
import type { FollowUp } from './PendingList.tsx'
import { TurnCards } from './TurnCards.tsx'
import { workpaperTurnDefinition } from './turn.ts'
import { WorkpaperCard } from './WorkpaperCard.tsx'
import { en, es, NS, zh, type EqidisKey } from './locales.ts'

/** The pending-items panel's identity in the right Sidebar's tab system. */
const PENDINGS_TAB_ID = '@deepseek-ai/dsh-client-ui-eqidis/pendings'
/** The pending-items panel's tab kind. */
const PENDINGS_TAB_KIND = 'eqidisPendings'

declare module '@deepseek-ai/dsh-client-ui-sidebar-right/client' {
  interface SidebarRightTabParamsMap {
    /** The conversation whose project's pending items the panel shows. */
    eqidisPendings: { sessionId: SessionId }
  }
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** EQIDIS AI workpaper card and new-calculation copy. */
    'eqidis': EqidisKey
  }
}

/** Required services: Remote, Workspace state, dictionaries, Sessions and UI slots. */
export const inject = ['remote', 'remote.workspace', 'workspaces', 'slots', 'locale', 'sessions', 'uiConversation', 'sidebarRight', 'sidebarRightTabs']

/**
 * Register the card and the chip.
 * @param ctx - Client runtime.
 */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en, es }), 'ui-eqidis: dictionaries')

  // Inside the Tool group each call keeps its card; the Turn's results repeat
  // beneath the closing reply, where the accountant reads them.
  ctx.uiConversation.events.register(workpaperTurnDefinition)

  const projectOf = (sessionId: SessionId): IntakeProject | null => {
    const found = ctx.workspaces.list.getSnapshot().items.find(item => item.sessionIds.includes(sessionId))
    return found === undefined ? null : { workspaceId: found.workspaceId, title: found.title }
  }
  // The project answer is cached per snapshot so the panel's external store stays stable.
  const projects = new Map<SessionId, { snapshot: unknown; value: IntakeProject | null }>()
  const project = (sessionId: SessionId): IntakeProject | null => {
    const snapshot = ctx.workspaces.list.getSnapshot()
    const cached = projects.get(sessionId)
    if (cached?.snapshot === snapshot) return cached.value
    const value = projectOf(sessionId)
    const same = cached !== undefined && cached.value?.workspaceId === value?.workspaceId && cached.value?.title === value?.title
    projects.set(sessionId, { snapshot, value: same ? cached.value : value })
    return same ? cached.value : value
  }
  type Result<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: { message: string } }
  const unwrap = async <T>(call: Promise<Result<T>>): Promise<T> => {
    const result = await call
    if (!result.ok) throw new Error(result.error.message)
    return result.value
  }
  const id = (workspaceId: string) => workspaceId as Parameters<typeof ctx.remote.workspace.getProjectContext>[0]['workspaceId']
  const prepare = (sessionId: SessionId, text: string, send: boolean) => {
    const actx = ctx.sessions.scope(sessionId)
    const input = actx === undefined ? undefined : actx.get('conversation')?.input.for(actx)
    input?.setDraft(text)
    if (send) input?.submit()
    else input?.focus()
  }
  const t = ctx.locale.bind(NS)
  ctx.effect(() => ctx.sidebarRightTabs.register({
    id: PENDINGS_TAB_ID, kind: PENDINGS_TAB_KIND, priority: 'builtin', title: () => t('panel.title'),
  }), 'ui-eqidis: pending-items tab type')
  const openPanel = (sessionId: SessionId) => {
    const existing = ctx.sidebarRight.tabsIn(sessionId).find(tab => tab.kind === PENDINGS_TAB_KIND)
    if (existing === undefined) {
      ctx.sidebarRight.openTab(PENDINGS_TAB_KIND, { params: { sessionId } })
      return
    }
    if (!ctx.sidebarRight.isExpanded()) ctx.sidebarRight.toggleExpanded()
    ctx.sidebarRight.focus(existing.id)
  }
  // Shown by itself once per conversation; after that the accountant decides.
  const revealed = new Set<SessionId>()
  const panel: PendingsPanelInjected = {
    list: async (sessionId) => {
      const found = project(sessionId as SessionId)
      return found === null ? null : unwrap(ctx.remote.workspace.listWorkpaperPendings({ workspaceId: id(found.workspaceId) }))
    },
    prepare: (sessionId, text) => { prepare(sessionId as SessionId, text, false) },
  }
  ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab', key: PENDINGS_TAB_ID, locale: NS, inject: () => panel,
  }, PendingsPanel))
  const followUp = (sessionId: SessionId): FollowUp => ({
    openPanel: () => { openPanel(sessionId) },
    revealOnce: () => {
      if (revealed.has(sessionId)) return
      revealed.add(sessionId)
      if (!ctx.sidebarRight.tabsIn(sessionId).some(tab => tab.kind === PENDINGS_TAB_KIND)) openPanel(sessionId)
    },
    load: async (file) => {
      const found = project(sessionId)
      return found === null ? [] : unwrap(ctx.remote.workspace.getWorkpaperPendings({ workspaceId: id(found.workspaceId), file }))
    },
    prepare: (text) => { prepare(sessionId, text, false) },
  })
  // The card follows its pending items live; inside the Tool group and again beneath the reply.
  ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({
    name: 'tool.call.toolview', key: 'workpaper_finish', locale: NS, inject: (sessionId: SessionId) => ({ follow: followUp(sessionId) }),
  }, WorkpaperCard))
  ctx.slots.inject('conversation.chat.turnTail', () => ctx.slots.register({
    name: 'conversation.chat.turnTail', id: 'eqidis-workpapers', order: 10, locale: NS,
    inject: (sessionId: SessionId) => ({ follow: followUp(sessionId) }),
  }, TurnCards))

  // Every new conversation starts from the intake: workpapers, period, balanza and auxiliares.
  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock', id: 'eqidis-intake', order: -10, locale: NS,
    inject: (sessionId: SessionId): IntakeInjected => ({
      subscribeProject: listener => ctx.workspaces.list.subscribe(listener),
      project: () => project(sessionId),
      workpapers: async (workspaceId) => {
        const context = await unwrap(ctx.remote.workspace.getProjectContext({ workspaceId: id(workspaceId) }))
        return { names: context.workpapers.map(file => file.name), maxBytes: context.maxDocumentBytes }
      },
      addWorkpaper: async (workspaceId, name, base64) => {
        const context = await unwrap(ctx.remote.workspace.uploadProjectDocument({ workspaceId: id(workspaceId), name, base64, kind: 'workpaper' }))
        return context.workpapers.map(file => file.name)
      },
      storeInput: async (workspaceId, period, name, base64) =>
        (await unwrap(ctx.remote.workspace.storeProjectInput({ workspaceId: id(workspaceId), period, name, base64 }))).path,
      start: (text) => { prepare(sessionId, text, true) },
    }),
  }, IntakePanel))
}
