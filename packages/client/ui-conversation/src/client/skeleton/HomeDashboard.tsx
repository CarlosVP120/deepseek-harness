import { useState } from 'react'
import { IconFolderOpenRegular, IconClockOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import { workspaceDisplayTitle } from '@deepseek-ai/dsh-api-workspace-controller/default-workspace'
import type { SessionSummary } from '@deepseek-ai/dsh-api-session-controller/client'
import type { WorkspaceSnapshot } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { ConversationContentProps } from '../contract/slots.ts'
import css from './HomeDashboard.module.css'

interface HomeDashboardProps {
  sessions: readonly SessionSummary[]
  workspaces: WorkspaceSnapshot
  t: ConversationContentProps['t']
  selectWorkspace: ConversationContentProps['selectWorkspace']
  openRecentSession: ConversationContentProps['openRecentSession']
}

/**
 * Present actual local projects and Session summaries without opening their history.
 * @param props - framework-derived catalog data and existing navigation callbacks.
 * @returns the start-page dashboard, including loading and empty states.
 */
export function HomeDashboard({ sessions, workspaces, t, selectWorkspace, openRecentSession }: HomeDashboardProps) {
  const [pending, setPending] = useState<string>()
  const [error, setError] = useState(false)
  const visible = sessions.filter(session => !session.blank && session.origin !== 'subagent'
    && !workspaces.archivedSessionIds.includes(session.id))
  const recent = [...visible].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 6)
  const running = visible.filter(session => session.running)
  const conversationCount = (count: number) => count === 1 ? t('home.oneConversation') : t('home.conversations', { count })
  return <div className={css.dashboard} data-home-dashboard="">
    <section className={css.panel}>
      <h2 className={css.panelTitle}><span className={running.length === 0 ? css.idleDot : css.liveDot} />{t('home.working')}<span className={css.count}>{running.length}</span></h2>
      {running.length === 0 ? <p className={css.empty}>{t('home.noWorking')}</p> : running.slice(0, 3).map(session =>
        <button type="button" className={css.row} key={session.id} onClick={() => { openRecentSession(session.id) }}>
          <span className={css.liveDot} /><span className={css.rowText}>{session.displayTitle}</span><span className={css.rowMeta}>{t('home.running')}</span>
        </button>)}
    </section>
    <section className={`${css.panel} ${css.recent}`}>
      <h2 className={css.panelTitle}>{t('home.recent')}<span className={css.count}>{visible.length}</span></h2>
      {recent.length === 0 ? <p className={css.empty}>{t('home.noRecent')}</p> : recent.map(session =>
        <button type="button" className={css.row} key={session.id} onClick={() => { openRecentSession(session.id) }}>
          <IconClockOutlineRegular size={14} className={css.rowIcon} />
          <span className={css.rowText}>{session.displayTitle}</span>
          <span className={css.rowMeta}>{new Date(session.updatedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>
        </button>)}
    </section>
    <section className={css.panel}>
      <h2 className={css.panelTitle}><IconFolderOpenRegular size={14} />{t('home.projects')}<span className={css.count}>{workspaces.items.length}</span></h2>
      {workspaces.phase !== 'ready' ? <p className={css.empty}>{t('home.loading')}</p> : workspaces.items.length === 0 ?
        <p className={css.empty}>{t('home.noProjects')}</p> : workspaces.items.slice(0, 4).map(workspace =>
          <button type="button" className={css.row} key={workspace.workspaceId} disabled={pending !== undefined}
            onClick={() => {
              setPending(workspace.workspaceId)
              setError(false)
              void selectWorkspace(workspace.workspaceId).catch(() => { setError(true) }).finally(() => { setPending(undefined) })
            }}>
            <IconFolderOpenRegular size={14} className={css.rowIcon} />
            <span className={css.rowText}>{workspaceDisplayTitle(workspace.title, t('workspace.defaultName'))}</span>
            <span className={css.rowMeta}>{pending === workspace.workspaceId ? t('home.opening') :
              conversationCount(workspace.sessionIds.filter(id => visible.some(session => session.id === id)).length)}</span>
          </button>)}
      {error && <p className={css.error} role="alert">{t('home.openError')}</p>}
    </section>
  </div>
}
