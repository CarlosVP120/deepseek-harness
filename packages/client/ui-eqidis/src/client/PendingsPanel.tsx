import { useEffect, useState } from 'react'
import { IconCheckOutlineRegular, IconWarningTriangleOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type { WorkpaperPending } from '@deepseek-ai/dsh-eqidis-workpapers/types'
import { periodLabel } from './WorkpaperCard.tsx'
import type { NS } from './locales.ts'
import css from './eqidis.module.css'

/** One filled workpaper and its follow-up items. */
export interface WorkpaperPendings {
  readonly file: string
  readonly items: readonly WorkpaperPending[]
}

/** What the panel needs for the conversation it sits beside. */
export interface PendingsPanelInjected {
  /** Every filled workpaper of the conversation's project with its items; `null` without a project. */
  readonly list: (sessionId: string) => Promise<readonly WorkpaperPendings[] | null>
  /** Put a follow-up request in that conversation's composer, without sending it. */
  readonly prepare: (sessionId: string, text: string) => void
}

type Props = PropsRuntime<'sidebar.right.pane.tab'> & PropsLocale<typeof NS> & InjectFace<PendingsPanelInjected>

const REFRESH_MS = 4000

/** «Papel - 2026-09.xlsx» → the workpaper name and its period. */
function describeFile(file: string): { name: string; period: string } {
  const stem = (file.split('/').pop() ?? file).replace(/\.[^.]+$/u, '')
  const match = /^(.*) - ([^-]+(?:-\d+)?)$/u.exec(stem)
  return match === null ? { name: stem, period: '' } : { name: match[1] as string, period: match[2] as string }
}

/**
 * The project's follow-up items beside the conversation: per filled workpaper, its progress,
 * the open items with a «Resolver» button and the resolved ones with their resolution.
 */
export function PendingsPanel({ sessionId, list, prepare, t }: Props) {
  const locale = t('time.locale')
  const [groups, setGroups] = useState<readonly WorkpaperPendings[] | null | 'error' | undefined>()
  useEffect(() => {
    let current = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const refresh = () => {
      list(sessionId).then((next) => {
        if (!current) return
        setGroups(next)
        timer = setTimeout(refresh, REFRESH_MS)
      }, () => { if (current) { setGroups('error'); timer = setTimeout(refresh, REFRESH_MS * 3) } })
    }
    refresh()
    return () => { current = false; if (timer !== undefined) clearTimeout(timer) }
  // The loader is recreated per render; the panel follows its conversation only.
  }, [sessionId])

  if (groups === undefined) return <div className={css.panel}><p className={css.muted}>{t('panel.loading')}</p></div>
  if (groups === 'error') return <div className={css.panel}><p className={css.errorText}>{t('panel.error')}</p></div>
  if (groups === null) return <div className={css.panel}><p className={css.muted}>{t('panel.noProject')}</p></div>
  const open = groups.reduce((sum, group) => sum + group.items.filter(item => item.estado === 'abierto').length, 0)
  const done = groups.reduce((sum, group) => sum + group.items.filter(item => item.estado === 'resuelto').length, 0)
  return <div className={css.panel} data-eqidis-pendings="">
    <header className={css.panelHead}>
      <h3 className={css.panelTitle}>{t('panel.title')}</h3>
      <span className={`${css.chip} ${open > 0 ? css.toneWarn : css.toneOk}`}>
        {open > 0 ? t('panel.open', { count: open }) : t('panel.allDone')}
      </span>
    </header>
    {groups.length === 0 && <p className={css.muted}>{t('panel.empty')}</p>}
    {groups.length > 0 && <p className={css.muted}>{t('panel.summary', { open, done })}</p>}
    {groups.map((group) => {
      const { name, period } = describeFile(group.file)
      const label = period === '' ? '' : periodLabel(period, locale)
      const solved = group.items.filter(item => item.estado === 'resuelto')
      const pending = group.items.filter(item => item.estado === 'abierto')
      return <section key={group.file} className={css.panelGroup} aria-label={name}>
        <div className={css.pendingHead}>
          <div className={css.titleBlock}>
            <span className={css.eyebrow}>{label}</span>
            <span className={css.groupTitle}>{name}</span>
          </div>
          <span className={css.muted}>{t('pending.progress', { done: solved.length, total: group.items.length })}</span>
        </div>
        <div className={css.progress} role="progressbar" aria-valuemin={0} aria-valuemax={group.items.length} aria-valuenow={solved.length}>
          <span style={{ width: `${Math.round(100 * solved.length / Math.max(1, group.items.length))}%` }} />
        </div>
        <ul className={css.list}>{pending.map(item => <li key={item.id} className={css.panelItem}>
          <IconWarningTriangleOutlineRegular size={14} className={css.warnText} />
          <span className={css.pendingText}><span className={css.pendingId}>{item.id}</span> {item.texto}</span>
          <button type="button" className={css.resolve}
            onClick={() => { prepare(sessionId, t('pending.prompt', { id: item.id, workpaper: name, period: label, text: item.texto })) }}>
            {t('pending.resolve')}
          </button>
        </li>)}</ul>
        {solved.length > 0 && <details className={css.solved}>
          <summary>{t('panel.resolved', { count: solved.length })}</summary>
          <ul className={css.list}>{solved.map(item => <li key={item.id} className={css.resolved}>
            <IconCheckOutlineRegular size={14} className={css.okText} />
            <span><span className={css.pendingId}>{item.id}</span> {item.texto}
              {item.resolucion !== undefined && <span className={css.resolution}>{t('pending.resolution', { text: item.resolucion })}</span>}</span>
          </li>)}</ul>
        </details>}
      </section>
    })}
  </div>
}
