import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { useAnchoredPosition, useDismissOnOutsidePointer } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { FiscalcfdiCompany } from '@deepseek-ai/dsh-fiscalcfdi-tools/types'
import { monthLabel } from './format.ts'
import type { MonthRegistry } from './month-store.ts'
import type { NS } from './locales.ts'
import css from './panel.module.css'

/** What the selector receives from the plugin. */
export interface MonthSelectorInjected {
  readonly months: MonthRegistry
  /** Reveal the month panel of a Session. */
  readonly openPanel: (sessionId: string) => void
}

type Props = PropsRuntime<'conversation.input.left'> & PropsLocale<typeof NS> & InjectFace<MonthSelectorInjected> & { sessionId: string }

function currentPeriod(): { year: number; month: number } {
  const now = new Date()
  // Accounting closes the month that just ended.
  const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  return { year: previous.getFullYear(), month: previous.getMonth() + 1 }
}

function normalize(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}

/**
 * Composer chip naming the company month this chat works on; its popover picks
 * the company and the month, opens the month in the engine and reveals the
 * month panel.
 */
export function MonthSelector({ sessionId, months, openPanel, t }: Props) {
  const store = months.for(sessionId)
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot)
  const locale = t('time.locale')
  const anchor = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [companies, setCompanies] = useState<FiscalcfdiCompany[] | 'error' | undefined>()
  const [query, setQuery] = useState('')
  const [company, setCompany] = useState<FiscalcfdiCompany | undefined>()
  const [{ year, month }, setPeriod] = useState(currentPeriod)
  useDismissOnOutsidePointer(anchor, open, () => { setOpen(false) }, panelRef)
  const position = useAnchoredPosition({ open, anchorRef: anchor, panelRef, side: 'top', gap: 6, margin: 12 })

  useEffect(() => {
    if (!open) return
    months.listCompanies().then(setCompanies, () => { setCompanies('error') })
    const bound = state.binding
    if (bound !== null && bound !== undefined) {
      setCompany({ rfc: bound.rfc, nombre: bound.empresa })
      const [y, m] = bound.periodo.split('-').map(Number)
      if (y !== undefined && m !== undefined) setPeriod({ year: y, month: m })
    }
  }, [open])

  const visible = useMemo(() => {
    if (!Array.isArray(companies)) return []
    const needle = normalize(query.trim())
    return needle === '' ? companies : companies.filter(c => normalize(`${c.nombre} ${c.rfc}`).includes(needle))
  }, [companies, query])

  const bound = state.binding
  const label = bound === null || bound === undefined
    ? t('select.empty')
    : `${bound.empresa} · ${monthLabel(bound.periodo, locale)}`
  const monthNames = useMemo(() => Array.from({ length: 12 }, (_, i) =>
    new Date(2000, i, 1).toLocaleDateString(locale, { month: 'short' }).replace('.', '')), [locale])
  const periodo = `${year}-${String(month).padStart(2, '0')}`

  const confirm = async () => {
    if (company === undefined) return
    if (await store.select(company, periodo)) {
      setOpen(false)
      openPanel(sessionId)
    }
  }

  return <>
    <button ref={anchor} type="button" className={`${css.chip} ${bound ? css.chipBound : ''}`} aria-haspopup="dialog" aria-expanded={open}
      title={t('select.label')} onClick={() => { setOpen(value => !value) }}>
      <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M3 2.5A1.5 1.5 0 0 1 4.5 1h7A1.5 1.5 0 0 1 13 2.5V14h1v1H2v-1h1V2.5ZM4.5 2a.5.5 0 0 0-.5.5V14h3v-3h2v3h3V2.5a.5.5 0 0 0-.5-.5h-7ZM6 4h1.5v1.5H6V4Zm2.5 0H10v1.5H8.5V4ZM6 7h1.5v1.5H6V7Zm2.5 0H10v1.5H8.5V7Z" /></svg>
      <span className={css.chipText}>{label}</span>
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.3" /></svg>
    </button>
    {open && createPortal(
      <div ref={panelRef} className={css.popover} style={position ?? { visibility: 'hidden', left: 0, top: 0 }} role="dialog"
        aria-label={t('select.label')} onClick={(event) => { event.stopPropagation() }}>
        <div className={css.popoverSection}>
          <span className={css.popoverLabel}>{t('select.company')}</span>
          <input className={css.popoverSearch} type="search" autoFocus value={query} placeholder={t('select.search')}
            onChange={(event) => { setQuery(event.target.value) }} />
          <div className={css.companyList} role="listbox" aria-label={t('select.company')}>
            {companies === undefined && <p className={css.muted}>{t('select.loading')}</p>}
            {companies === 'error' && <p className={css.errorText}>{t('months.error')}</p>}
            {Array.isArray(companies) && visible.length === 0 && <p className={css.muted}>{t('select.noCompanies')}</p>}
            {visible.map(c => <button key={c.rfc} type="button" role="option" aria-selected={company?.rfc === c.rfc}
              className={css.companyRow} onClick={() => { setCompany(c) }}
              onDoubleClick={() => { setCompany(c); void confirm() }}>
              <span className={css.companyName}>{c.nombre}</span><span className={css.muted}>{c.rfc}</span>
            </button>)}
          </div>
        </div>
        <div className={css.popoverSection}>
          <div className={css.yearRow}>
            <span className={css.popoverLabel}>{t('select.month')}</span>
            <span className={css.yearStepper}>
              <button type="button" aria-label={t('select.previousYear')} onClick={() => { setPeriod({ year: year - 1, month }) }}>‹</button>
              <span className={css.num}>{year}</span>
              <button type="button" aria-label={t('select.nextYear')} onClick={() => { setPeriod({ year: year + 1, month }) }}>›</button>
            </span>
          </div>
          <div className={css.monthGrid}>
            {monthNames.map((name, index) => <button key={name} type="button" aria-pressed={month === index + 1}
              className={css.monthCell} onClick={() => { setPeriod({ year, month: index + 1 }) }}>{name}</button>)}
          </div>
        </div>
        {state.error !== undefined && state.busy === undefined && <p className={css.errorText}>{state.error}</p>}
        <div className={css.popoverActions}>
          {bound ? <button type="button" className={css.linkButton} onClick={() => { setOpen(false); openPanel(sessionId) }}>{t('select.viewPanel')}</button> : <span />}
          <button type="button" className={css.primary} disabled={company === undefined || state.busy === 'select'} onClick={() => { void confirm() }}>
            {state.busy === 'select' ? t('select.opening') : company === undefined
              ? t('select.open') : `${t('select.open')} · ${monthLabel(periodo, locale)}`}
          </button>
        </div>
      </div>,
      document.body,
    )}
  </>
}
