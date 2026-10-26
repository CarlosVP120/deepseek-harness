import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { FiscalcfdiCompany, FiscalcfdiMonthFile } from '@deepseek-ai/dsh-fiscalcfdi-tools/types'
import { FiscalcfdiMark } from './brand-mark.tsx'
import { monthLabel } from './format.ts'
import { MonthRun } from './MonthRun.tsx'
import type { MonthRegistry, SessionMonth } from './month-store.ts'
import type { NS } from './locales.ts'
import css from './guided.module.css'

/** What the guided start receives from the plugin. */
export interface GuidedStartInjected {
  readonly months: MonthRegistry
}

type Props = PropsRuntime<'conversation.composer'> & PropsLocale<typeof NS> & InjectFace<GuidedStartInjected>
type T = Props['t']

/** The three places files go, matching how the engine classifies them. */
type Zone = 'documents' | 'bank' | 'extra'

/** Engine role → the section that shows the file. */
function zoneOf(file: FiscalcfdiMonthFile): Zone {
  if (file.rol === 'documents') return 'documents'
  if (file.rol === 'bank') return 'bank'
  return 'extra'
}

const ZONES: readonly Zone[] = ['documents', 'bank', 'extra']

function normalize(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}

function previousMonth(): { year: number; month: number } {
  const now = new Date()
  const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  return { year: previous.getFullYear(), month: previous.getMonth() + 1 }
}

/** Step one: the company and the month, chosen in place. */
function CompanyMonth({ month, months, t }: { month: SessionMonth; months: MonthRegistry; t: T }) {
  const state = useSyncExternalStore(month.subscribe, month.getSnapshot)
  const locale = t('time.locale')
  const [editing, setEditing] = useState(false)
  const [companies, setCompanies] = useState<FiscalcfdiCompany[] | 'error' | undefined>()
  const [query, setQuery] = useState('')
  const [company, setCompany] = useState<FiscalcfdiCompany | undefined>()
  const [{ year, month: monthNumber }, setPeriod] = useState(previousMonth)
  const bound = state.binding
  const open = editing || bound === null
  useEffect(() => {
    if (open && companies === undefined) months.listCompanies().then(setCompanies, () => { setCompanies('error') })
  }, [open, companies, months])
  const visible = useMemo(() => {
    if (!Array.isArray(companies)) return []
    const needle = normalize(query.trim())
    return needle === '' ? companies : companies.filter(c => normalize(`${c.nombre} ${c.rfc}`).includes(needle))
  }, [companies, query])
  const monthNames = useMemo(() => Array.from({ length: 12 }, (_, i) =>
    new Date(2000, i, 1).toLocaleDateString(locale, { month: 'short' }).replace('.', '')), [locale])
  const periodo = `${year}-${String(monthNumber).padStart(2, '0')}`

  if (bound === undefined) return <section className={css.step}><p className={css.muted}>{t('panel.loading')}</p></section>
  if (bound !== null && !editing) {
    return <section className={`${css.step} ${css.stepDone}`}>
      <span className={css.stepNumber} aria-hidden="true">✓</span>
      <div className={css.stepBody}>
        <span className={css.stepLabel}>{t('guided.companyMonth')}</span>
        <span className={css.chosen}>{bound.empresa} · {monthLabel(bound.periodo, locale)}</span>
      </div>
      <button type="button" className={css.link} onClick={() => {
        setCompany({ rfc: bound.rfc, nombre: bound.empresa })
        const [y, m] = bound.periodo.split('-').map(Number)
        if (y !== undefined && m !== undefined) setPeriod({ year: y, month: m })
        setEditing(true)
      }}>{t('guided.change')}</button>
    </section>
  }
  const confirm = async () => {
    if (company === undefined) return
    if (await month.select(company, periodo)) setEditing(false)
  }
  return <section className={css.step}>
    <span className={css.stepNumber} aria-hidden="true">1</span>
    <div className={css.stepBody}>
      <span className={css.stepLabel}>{t('guided.companyMonthQuestion')}</span>
      <div className={css.picker}>
        <div className={css.companies}>
          <input className={css.search} type="search" value={query} placeholder={t('select.search')} aria-label={t('select.company')}
            onChange={(event) => { setQuery(event.target.value) }} />
          <div className={css.companyList} role="listbox" aria-label={t('select.company')}>
            {companies === undefined && <p className={css.muted}>{t('select.loading')}</p>}
            {companies === 'error' && <p className={css.error}>{t('months.error')}</p>}
            {Array.isArray(companies) && visible.length === 0 && <p className={css.muted}>{t('select.noCompanies')}</p>}
            {visible.map(c => <button key={c.rfc} type="button" role="option" aria-selected={company?.rfc === c.rfc}
              className={css.companyRow} onClick={() => { setCompany(c) }}>
              <span className={css.companyName}>{c.nombre}</span><span className={css.muted}>{c.rfc}</span>
            </button>)}
          </div>
        </div>
        <div className={css.months}>
          <div className={css.yearRow}>
            <button type="button" aria-label={t('select.previousYear')} onClick={() => { setPeriod({ year: year - 1, month: monthNumber }) }}>‹</button>
            <span className={css.year}>{year}</span>
            <button type="button" aria-label={t('select.nextYear')} onClick={() => { setPeriod({ year: year + 1, month: monthNumber }) }}>›</button>
          </div>
          <div className={css.monthGrid}>
            {monthNames.map((name, index) => <button key={name} type="button" aria-pressed={monthNumber === index + 1}
              className={css.monthCell} onClick={() => { setPeriod({ year, month: index + 1 }) }}>{name}</button>)}
          </div>
        </div>
      </div>
      {state.error !== undefined && state.busy === undefined && <p className={css.error}>{state.error}</p>}
      <div className={css.stepActions}>
        {bound !== null && <button type="button" className={css.secondary} onClick={() => { setEditing(false) }}>{t('guided.cancel')}</button>}
        <button type="button" className={css.primary} disabled={company === undefined || state.busy === 'select'} onClick={() => { void confirm() }}>
          {state.busy === 'select' ? t('select.opening') : company === undefined
            ? t('guided.chooseCompany') : `${t('select.open')} · ${company.nombre} · ${monthLabel(periodo, locale)}`}
        </button>
      </div>
    </div>
  </section>
}

/** One drop section: what goes here, what already arrived, and the drop target. */
function DropZone({ zone, files, ready, disabled, onFiles, t }: {
  zone: Zone
  files: readonly FiscalcfdiMonthFile[]
  ready: boolean
  disabled: boolean
  onFiles: (zone: Zone, files: File[]) => void
  t: T
}) {
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const take = (list: FileList | null) => {
    const picked = list === null ? [] : [...list]
    if (picked.length > 0) onFiles(zone, picked)
  }
  const number = zone === 'documents' ? 2 : zone === 'bank' ? 3 : 4
  return <div className={`${css.zone} ${ready ? css.zoneReady : ''} ${over ? css.zoneOver : ''} ${disabled ? css.zoneDisabled : ''}`}
    data-zone={zone}
    onDragEnter={(event) => { event.preventDefault(); event.stopPropagation() }}
    onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); if (!disabled) setOver(true) }}
    onDragLeave={() => { setOver(false) }}
    onDrop={(event) => { event.preventDefault(); event.stopPropagation(); setOver(false); if (!disabled) take(event.dataTransfer.files) }}>
    <div className={css.zoneHead}>
      <span className={css.zoneNumber} aria-hidden="true">{ready ? '✓' : number}</span>
      <span className={css.zoneTitle}>{t(`guided.${zone}.title`)}</span>
      <span className={zone === 'extra' ? css.optional : css.required}>{t(zone === 'extra' ? 'guided.optionalPdt' : 'guided.required')}</span>
    </div>
    <p className={css.zoneHint}>{t(`guided.${zone}.hint`)}</p>
    {files.length > 0 && <ul className={css.files}>
      {files.map(file => <li key={file.nombre} title={file.estado}><span aria-hidden="true">▤</span><span className={css.fileName}>{file.nombre}</span></li>)}
    </ul>}
    <button type="button" className={css.zoneButton} disabled={disabled} onClick={() => input.current?.click()}>
      {files.length > 0 ? t('guided.addMore') : t('guided.choose')}
    </button>
    <input ref={input} type="file" multiple hidden accept=".xlsx,.xls,.csv,.pdf,.xml,.zip,.png,.jpg,.jpeg"
      onChange={(event) => { take(event.target.files); event.target.value = '' }} />
  </div>
}

/**
 * The start page of a blank chat, in place of the open composer: choose the
 * company and month, drop the month's files in three labelled sections, and
 * post. Contabilizar starts the engine directly, and the same card then
 * follows the run, takes the engine's questions and offers the importable, so
 * no chat turn is spent on it; the question box hands anything else to the chat.
 */
export function GuidedStart({ sessionId, inputActions, months, t }: Props) {
  const month = months.for(sessionId)
  const state = useSyncExternalStore(month.subscribe, month.getSnapshot)
  const [notice, setNotice] = useState<string | undefined>()
  const [question, setQuestion] = useState('')
  const [reply, setReply] = useState('')
  const detail = state.binding === null ? undefined : state.detail
  const byZone = useMemo(() => {
    const groups: Record<Zone, FiscalcfdiMonthFile[]> = { documents: [], bank: [], extra: [] }
    for (const file of detail?.archivos ?? []) groups[zoneOf(file)].push(file)
    return groups
  }, [detail])
  const requirement = (key: string) => detail?.requisitos.find(item => item.clave === key)?.listo === true
  const ready: Record<Zone, boolean> = { documents: requirement('facturas'), bank: requirement('bancos'), extra: requirement('pdt') }
  const bound = state.binding !== null && state.binding !== undefined
  const busy = state.busy !== undefined
  const send = (text: string) => {
    inputActions.setDraft(text)
    inputActions.submit()
  }
  // Month tiles on the start page open their month here.
  useEffect(() => months.showGuided(sessionId), [months, sessionId])

  const upload = async (zone: Zone, files: File[]) => {
    setNotice(undefined)
    if (!await month.upload(files)) return
    const loaded = month.getSnapshot().detail?.archivos ?? []
    const moved = files.flatMap((file) => {
      const found = loaded.find(item => item.nombre === file.name)
      return found !== undefined && zoneOf(found) !== zone ? [{ name: file.name, to: zoneOf(found) }] : []
    })
    if (moved.length > 0) {
      setNotice(moved.map(m => t('guided.moved', { file: m.name, zone: t(`guided.${m.to}.title`) })).join(' '))
    }
  }

  const missing = [
    !ready.documents && t('guided.documents.title'),
    !ready.bank && t('guided.bank.title'),
    !ready.extra && t('guided.pdt'),
  ].filter((item): item is string => typeof item === 'string')
  const engineAsks = detail !== undefined && detail.estado === 'draft' && !detail.listo && detail.mensaje !== null
    && detail.mensaje.includes('¿') && missing.length === 0
  const canStart = detail !== undefined && detail.listo && !busy
  const started = detail !== undefined && detail.estado !== 'draft'

  return <div className={css.root} data-fiscalcfdi-guided="">
    <h1 className={css.headline}><FiscalcfdiMark size={34} /><span>{t('guided.headline')} <em>{t('guided.headlineAccent')}</em></span></h1>
    <div className={css.card}>
      <CompanyMonth month={month} months={months} t={t} />
      {started ? <MonthRun detail={detail} state={state} month={month} t={t} /> : <>
        <div className={`${css.zones} ${bound ? '' : css.zonesLocked}`}>
          {ZONES.map(zone => <DropZone key={zone} zone={zone} files={byZone[zone]} ready={ready[zone]} disabled={!bound || state.busy === 'upload'}
            onFiles={(z, files) => { void upload(z, files) }} t={t} />)}
        </div>
        {state.busy === 'upload' && <p className={css.status}>{t('panel.uploading')}</p>}
        {notice !== undefined && <p className={css.notice}>{notice}</p>}
        {engineAsks && <div className={css.question}>
          <p>{detail.mensaje}</p>
          <div className={css.questionActions}>
            <button type="button" className={css.primary} disabled={busy} onClick={() => { void month.answer('Sí, úsalas') }}>{t('guided.yesUseThem')}</button>
            <input className={css.search} value={reply} placeholder={t('panel.replyPlaceholder')} disabled={busy}
              onChange={(event) => { setReply(event.target.value) }}
              onKeyDown={(event) => { if (event.key === 'Enter' && reply.trim() !== '') { void month.answer(reply.trim()); setReply('') } }} />
          </div>
        </div>}
        {state.error !== undefined && state.busy === undefined && bound && <p className={css.error}>{state.error}</p>}
        <div className={css.footer}>
          <span className={css.muted}>{!bound ? t('guided.firstChoose') : missing.length > 0
            ? t('guided.missing', { items: missing.join(', ') }) : engineAsks ? t('guided.answerFirst') : t('guided.readyHint')}</span>
          <button type="button" className={`${css.primary} ${css.start}`} disabled={!canStart} onClick={() => { void month.process() }}>
            {state.busy === 'process' ? t('panel.processing') : t('guided.start')}
          </button>
        </div>
      </>}
    </div>
    <form className={css.ask} onSubmit={(event) => { event.preventDefault(); if (question.trim() !== '') send(question.trim()) }}>
      <input className={css.askInput} value={question} placeholder={t('guided.askPlaceholder')} aria-label={t('guided.askPlaceholder')}
        onChange={(event) => { setQuestion(event.target.value) }} />
      <button type="submit" className={css.secondary} disabled={question.trim() === ''}>{t('guided.askSend')}</button>
    </form>
  </div>
}
