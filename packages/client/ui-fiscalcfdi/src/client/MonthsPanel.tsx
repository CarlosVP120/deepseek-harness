import { useCallback, useEffect, useState } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { FiscalcfdiMonth } from '@deepseek-ai/dsh-fiscalcfdi-tools/types'
import { monthLabel } from './format.ts'
import { CoverageBar, StateChip } from './MonthCard.tsx'
import type { NS } from './locales.ts'
import css from './fiscalcfdi.module.css'

/** Business callbacks the panel receives from the plugin. */
export interface MonthsPanelInjected {
  /** Read every company month from the engine. */
  loadMonths: () => Promise<FiscalcfdiMonth[]>
  /** Open a month in the guided start; false when none is showing. */
  openMonth: (month: FiscalcfdiMonth) => boolean
  /** Return the guided start to choosing a month; false when none is showing. */
  startMonth: () => boolean
}

type Props = PropsRuntime<'conversation.home.panels'> & PropsLocale<typeof NS> & InjectFace<MonthsPanelInjected>

const VISIBLE = 6
const REFRESH_MS = 8000

type Load = { phase: 'loading' } | { phase: 'error' } | { phase: 'ready'; months: FiscalcfdiMonth[] }

/**
 * Start-page panel listing the accounting months by company with their state
 * and bank coverage. Choosing one opens it in the guided start without a chat
 * turn; only without a guided start does the request go to the chat.
 */
export function MonthsPanel({ compose, loadMonths, openMonth, startMonth, t }: Props) {
  const [load, setLoad] = useState<Load>({ phase: 'loading' })
  const [all, setAll] = useState(false)
  const locale = t('time.locale')
  const refresh = useCallback(() => {
    loadMonths().then((months) => { setLoad({ phase: 'ready', months }) }, () => { setLoad(current => current.phase === 'ready' ? current : { phase: 'error' }) })
  }, [loadMonths])
  useEffect(() => {
    refresh()
    window.addEventListener('focus', refresh)
    return () => { window.removeEventListener('focus', refresh) }
  }, [refresh])
  const working = load.phase === 'ready' && load.months.some(m => m.estado === 'running')
  useEffect(() => {
    // Months open from any chat (its selector or the agent): fast while one is being posted, slow otherwise.
    const timer = window.setInterval(refresh, working ? REFRESH_MS : REFRESH_MS * 2)
    return () => { window.clearInterval(timer) }
  }, [working, refresh])

  const months = load.phase === 'ready' ? load.months : []
  const shown = all ? months : months.slice(0, VISIBLE)
  return <section className={css.monthsPanel} data-fiscalcfdi-months="">
    <header className={css.monthsHead}>
      <h2 className={css.monthsTitle}>{t('months.title')}{load.phase === 'ready' && <span className={css.muted}>{months.length}</span>}</h2>
      <button type="button" className={css.newMonth} onClick={() => { if (!startMonth()) compose(t('months.newPrompt'), false) }}>+ {t('months.new')}</button>
    </header>
    {load.phase === 'loading' && <p className={css.note}>{t('months.loading')}</p>}
    {load.phase === 'error' && <p className={css.note}>{t('months.error')} <button type="button" className={css.link} onClick={refresh}>{t('months.retry')}</button></p>}
    {load.phase === 'ready' && months.length === 0 && <p className={css.note}>{t('months.empty')}</p>}
    {shown.length > 0 && <div className={css.monthGrid}>
      {shown.map(m => <button type="button" key={`${m.rfc}-${m.periodo}`} className={css.monthTile}
        onClick={() => {
          if (openMonth(m)) return
          compose(t('months.prompt', { periodo: monthLabel(m.periodo, locale).toLowerCase(), empresa: m.empresa, rfc: m.rfc }), true)
        }}>
        <span className={css.tileTop}>
          <span className={css.tilePeriod}>{monthLabel(m.periodo, locale)}</span>
          <StateChip state={m.estado} t={t} />
        </span>
        <span className={css.tileCompany} title={m.empresa}>{m.empresa}</span>
        <span className={css.tileFacts}>
          {m.polizas !== null ? <span>{t('months.journals', { count: m.polizas })}</span>
            : <span>{m.archivos === 0 ? t('months.noFiles') : t('months.files', { count: m.archivos })}</span>}
          {m.preguntas > 0 && <span className={css.warnText}>{t('months.questions', { count: m.preguntas })}</span>}
          {m.total !== null && <span className={css.num}>{m.cubiertos ?? 0}/{m.total}</span>}
        </span>
        <CoverageBar covered={m.cubiertos} total={m.total} />
      </button>)}
    </div>}
    {months.length > VISIBLE && <button type="button" className={css.link} onClick={() => { setAll(value => !value) }}>
      {all ? t('months.showLess') : t('months.showAll', { count: months.length })}</button>}
  </section>
}
