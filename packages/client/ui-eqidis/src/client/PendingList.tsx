import { useEffect, useState } from 'react'
import { IconCheckOutlineRegular, IconWarningTriangleOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { WorkpaperPending } from '@deepseek-ai/dsh-eqidis-workpapers/types'
import type { NS } from './locales.ts'
import css from './eqidis.module.css'

/** What a workpaper card needs to follow up its pending items in the current conversation. */
export interface FollowUp {
  /** Current state of a filled workpaper's items, by its project-relative path. */
  readonly load: (file: string) => Promise<readonly WorkpaperPending[]>
  /** Put a follow-up request in the composer, without sending it. */
  readonly prepare: (text: string) => void
  /** Show the pending-items panel beside the conversation. */
  readonly openPanel: () => void
  /** Show the calculation's files beside the conversation. */
  readonly openFiles: () => void
  /** Show the panel once per conversation, the first time a card with open items appears. */
  readonly revealOnce: () => void
}

/** How often the card refreshes while some item is still open. */
const REFRESH_MS = 4000

/** Items as the card recorded them: older cards carry plain texts. */
export function pendingItems(items: readonly (WorkpaperPending | string)[]): WorkpaperPending[] {
  return items.map((item, i) => typeof item === 'string' ? { id: `P${i + 1}`, texto: item, estado: 'abierto' } : item)
}

type Props = PropsLocale<typeof NS> & {
  readonly items: readonly WorkpaperPending[]
  readonly file: string
  readonly workpaper: string
  readonly period: string
  readonly follow: FollowUp | undefined
}

/**
 * The workpaper's follow-up items: each open one has a «Resolver» button that prepares the
 * request in the composer, and the list refreshes as the agent closes them.
 */
export function PendingList({ items, file, workpaper, period, follow, t }: Props) {
  const [live, setLive] = useState<readonly WorkpaperPending[]>(items)
  useEffect(() => {
    if (follow === undefined) return
    let current = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const refresh = () => {
      follow.load(file).then((next) => {
        if (!current) return
        if (next.length > 0) setLive(next)
        const anyOpen = (next.length > 0 ? next : items).some(item => item.estado === 'abierto')
        if (anyOpen) {
          follow.revealOnce()
          timer = setTimeout(refresh, REFRESH_MS)
        }
      }, () => { if (current) timer = setTimeout(refresh, REFRESH_MS * 3) })
    }
    refresh()
    return () => { current = false; if (timer !== undefined) clearTimeout(timer) }
  // The loader is recreated per render; the list follows the file only.
  }, [file])
  if (live.length === 0) return null
  const done = live.filter(item => item.estado === 'resuelto').length
  return <section className={css.block} aria-label={t('card.pendingTitle')}>
    <div className={css.pendingHead}>
      <h4 className={css.blockTitle}>{t('card.pendingTitle')}</h4>
      <span className={css.muted}>
        {t('pending.progress', { done, total: live.length })}
        {follow !== undefined && <> · <button type="button" className={css.panelLink} onClick={follow.openPanel}>{t('pending.panel')}</button></>}
      </span>
    </div>
    <div className={css.progress} role="progressbar" aria-valuemin={0} aria-valuemax={live.length} aria-valuenow={done}>
      <span style={{ width: `${Math.round(100 * done / live.length)}%` }} />
    </div>
    <ul className={css.list}>{live.map(item => item.estado === 'resuelto'
      ? <li key={item.id} className={css.resolved}>
        <IconCheckOutlineRegular size={14} className={css.okText} />
        <span><span className={css.pendingId}>{item.id}</span> {item.texto}
          {item.resolucion !== undefined && <span className={css.resolution}>{t('pending.resolution', { text: item.resolucion })}</span>}</span>
      </li>
      : <li key={item.id} className={css.warnText}>
        <IconWarningTriangleOutlineRegular size={14} />
        <span className={css.pendingText}><span className={css.pendingId}>{item.id}</span> {item.texto}</span>
        {follow !== undefined && <button type="button" className={css.resolve}
          onClick={() => { follow.prepare(t('pending.prompt', { id: item.id, workpaper, period, text: item.texto })) }}>{t('pending.resolve')}</button>}
      </li>)}</ul>
  </section>
}
