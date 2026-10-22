import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import {
  IconCheckOutlineRegular, IconChecklistOutlineRegular, IconPaperclipOutlineRegular, IconPlusOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { periodLabel } from './WorkpaperCard.tsx'
import type { NS } from './locales.ts'
import css from './intake.module.css'

/** The project a blank Session belongs to. */
export interface IntakeProject {
  readonly workspaceId: string
  readonly title: string
}

/** The files a calculation starts with. */
export interface IntakeCalculation {
  readonly period: string
  readonly workpapers: readonly string[]
  readonly balance: string
  readonly ledgers: readonly string[]
  readonly others: readonly string[]
}

/** What the panel receives from the plugin for its Session. */
export interface IntakeInjected {
  /** Subscribe to changes of the Session's project (the user may switch it before starting). */
  readonly subscribeProject: (listener: () => void) => () => void
  /** The Session's project, `null` when it belongs to none. */
  readonly project: () => IntakeProject | null
  /** Official workpapers of a project and the largest file it accepts. */
  readonly workpapers: (workspaceId: string) => Promise<{ names: readonly string[]; maxBytes: number }>
  /** Add an official workpaper to the project; returns the updated list. */
  readonly addWorkpaper: (workspaceId: string, name: string, base64: string) => Promise<readonly string[]>
  /** Keep an input in the project's period folder; returns its project path. */
  readonly storeInput: (workspaceId: string, period: string, name: string, base64: string) => Promise<string>
  /** Record what the calculation started with, for the files panel. */
  readonly record: (workspaceId: string, calculation: IntakeCalculation) => Promise<void>
  /** Send the prepared request as the conversation's first message. */
  readonly start: (text: string) => void
}

type Props = PropsRuntime<'conversation.input.dock'> & PropsLocale<typeof NS> & InjectFace<IntakeInjected>

const SPREADSHEET = /\.(xlsx|xlsm|xls|ods|csv)$/iu
const WORKPAPER = /\.(xlsx|xlsm|xls|ods)$/iu

function previousMonth(): { year: number; month: number } {
  const now = new Date()
  // Taxes are calculated for the month that just closed.
  const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  return { year: previous.getFullYear(), month: previous.getMonth() + 1 }
}

function stem(name: string): string {
  return name.replace(/\.[^.]+$/u, '')
}

function base64Of(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => { resolve(typeof reader.result === 'string' ? reader.result.split(',')[1] ?? '' : '') }
    reader.onerror = () => { reject(reader.error ?? new Error('read failed')) }
    reader.readAsDataURL(file)
  })
}

/** Whether a blank Session still waits for its first request. */
export function awaitingIntake(session: Props['session']): boolean {
  return session.blank && !session.promptAttempted && session.pendingSubmissions.length === 0 && session.subagent === null
}

/**
 * The required start of every calculation: which official workpapers to fill,
 * the period, the trial balance and the ledger details. Nothing starts until
 * all of them are there; the files are kept in the project's period folder and
 * the agent receives one structured request. While the panel shows, the free
 * composer is hidden, so an accountant never has to remember what to upload.
 */
export function IntakePanel(props: Props) {
  const { t, session } = props
  const project = useSyncExternalStore(props.subscribeProject, props.project)
  const locale = t('time.locale')
  const [templates, setTemplates] = useState<readonly string[] | 'error' | undefined>()
  const [maxBytes, setMaxBytes] = useState(30 * 1024 * 1024)
  const [chosen, setChosen] = useState<readonly string[]>([])
  const [{ year, month }, setPeriod] = useState(previousMonth)
  const [balance, setBalance] = useState<File>()
  const [ledgers, setLedgers] = useState<readonly File[]>([])
  const [others, setOthers] = useState<readonly File[]>([])
  const [notes, setNotes] = useState('')
  const [summary, setSummary] = useState(true)
  const [busy, setBusy] = useState<string>()
  const [error, setError] = useState<string>()
  const pickWorkpaper = useRef<HTMLInputElement>(null)
  const pickBalance = useRef<HTMLInputElement>(null)
  const pickLedgers = useRef<HTMLInputElement>(null)
  const pickOthers = useRef<HTMLInputElement>(null)
  const workspaceId = project?.workspaceId

  useEffect(() => {
    if (workspaceId === undefined) return
    let current = true
    setTemplates(undefined)
    props.workpapers(workspaceId).then(({ names, maxBytes: limit }) => {
      if (!current) return
      setTemplates(names)
      setMaxBytes(limit)
      setChosen(names.length === 1 ? names : [])
    }, () => { if (current) setTemplates('error') })
    return () => { current = false }
  // The loaders are recreated per render; the list follows the project only.
  }, [workspaceId])

  const monthNames = useMemo(() => Array.from({ length: 12 }, (_, i) =>
    new Date(2000, i, 1).toLocaleDateString(locale, { month: 'short' }).replace('.', '')), [locale])

  if (!awaitingIntake(session)) return null
  const period = `${year}-${String(month).padStart(2, '0')}`
  const list: readonly string[] = typeof templates === 'object' ? templates : []
  const missing = [
    ...(chosen.length === 0 ? [t('intake.missing.workpaper')] : []),
    ...(balance === undefined ? [t('intake.missing.balance')] : []),
    ...(ledgers.length === 0 ? [t('intake.missing.ledgers')] : []),
  ]

  const tooLarge = (file: File) => file.size > maxBytes
  const accept = (files: FileList | null, pattern: RegExp | undefined): File[] => {
    const picked = Array.from(files ?? [])
    const wrong = picked.find(file => (pattern !== undefined && !pattern.test(file.name)) || tooLarge(file))
    if (wrong !== undefined) {
      setError(tooLarge(wrong)
        ? t('intake.error.size', { name: wrong.name, limit: String(Math.round(maxBytes / 1024 / 1024)) })
        : t('intake.error.type', { name: wrong.name }))
      return picked.filter(file => file !== wrong && (pattern === undefined || pattern.test(file.name)) && !tooLarge(file))
    }
    setError(undefined)
    return picked
  }

  const addWorkpapers = async (files: FileList | null) => {
    if (workspaceId === undefined) return
    const picked = accept(files, WORKPAPER)
    if (pickWorkpaper.current) pickWorkpaper.current.value = ''
    if (picked.length === 0) return
    setBusy(t('intake.busy.workpaper'))
    try {
      let names = list
      for (const file of picked) names = await props.addWorkpaper(workspaceId, file.name, await base64Of(file))
      setTemplates(names)
      setChosen(previous => [...new Set([...previous, ...picked.map(file => file.name)])])
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(undefined)
    }
  }

  const begin = async () => {
    if (workspaceId === undefined || balance === undefined || missing.length > 0) return
    setBusy(t('intake.busy.files'))
    setError(undefined)
    try {
      const store = async (file: File) => props.storeInput(workspaceId, period, file.name, await base64Of(file))
      const balancePath = await store(balance)
      const ledgerPaths: string[] = []
      for (const file of ledgers) ledgerPaths.push(await store(file))
      const otherPaths: string[] = []
      for (const file of others) otherPaths.push(await store(file))
      await props.record(workspaceId, { period, workpapers: chosen, balance: balancePath, ledgers: ledgerPaths, others: otherPaths })
      const bullet = (items: readonly string[]) => items.map(item => `• ${item}`).join('\n')
      const text = [
        t('intake.message.title', { label: periodLabel(period, locale), period }),
        '',
        t('intake.message.workpapers'),
        bullet(chosen.map(stem)),
        '',
        `${t('intake.message.balance')} ${balancePath}`,
        t('intake.message.ledgers'),
        bullet(ledgerPaths),
        ...(otherPaths.length === 0 ? [] : [t('intake.message.others'), bullet(otherPaths)]),
        ...(summary ? ['', t('intake.message.summary')] : []),
        ...(notes.trim() === '' ? [] : ['', `${t('intake.message.notes')} ${notes.trim()}`]),
        '',
        t('intake.message.stored'),
      ].join('\n')
      props.start(text)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
      setBusy(undefined)
    }
  }

  const fileChip = (file: File, remove: () => void) => <li key={`${file.name}-${file.size}`} className={css.file}>
    <IconPaperclipOutlineRegular size={14} /><span className={css.fileName}>{file.name}</span>
    <button type="button" className={css.remove} aria-label={t('intake.remove', { name: file.name })} disabled={busy !== undefined}
      onClick={remove}>×</button>
  </li>

  const step = (done: boolean, index: number) =>
    <span className={css.stepMark} data-done={done}>{done ? <IconCheckOutlineRegular size={12} /> : index}</span>

  if (project === null) {
    return <section className={css.panel} data-eqidis-intake="" aria-label={t('intake.title')}>
      <h2 className={css.title}>{t('intake.title')}</h2>
      <p className={css.lead}>{t('intake.noProject')}</p>
    </section>
  }

  return <section className={css.panel} data-eqidis-intake="" aria-label={t('intake.title')} aria-busy={busy !== undefined}>
    <header className={css.head}>
      <h2 className={css.title}>{t('intake.title')}</h2>
      <p className={css.lead}>{t('intake.lead')}</p>
    </header>

    <div className={css.step}>
      <div className={css.stepHead}>
        {step(chosen.length > 0, 1)}<span className={css.stepTitle}>{t('intake.workpapers')}</span>
        <span className={css.required}>{t('intake.required')}</span>
      </div>
      {templates === undefined && <p className={css.muted}>{t('intake.loading')}</p>}
      {templates === 'error' && <p className={css.errorText}>{t('intake.loadError')}</p>}
      {typeof templates === 'object' && list.length === 0 && <p className={css.muted}>{t('intake.noWorkpapers')}</p>}
      {list.length > 0 && <div className={css.options}>
        {list.map(name => <label key={name} className={css.option} data-checked={chosen.includes(name)}>
          <input type="checkbox" checked={chosen.includes(name)} disabled={busy !== undefined}
            onChange={(event) => {
              const on = event.target.checked
              setChosen(previous => on ? [...previous, name] : previous.filter(item => item !== name))
            }} />
          <IconChecklistOutlineRegular size={14} /><span className={css.optionName}>{stem(name)}</span>
        </label>)}
      </div>}
      <button type="button" className={css.link} disabled={busy !== undefined} onClick={() => pickWorkpaper.current?.click()}>
        <IconPlusOutlineRegular size={14} />{t('intake.addWorkpaper')}
      </button>
      <input ref={pickWorkpaper} className={css.hidden} type="file" multiple accept=".xlsx,.xlsm,.xls,.ods" aria-label={t('intake.addWorkpaper')}
        onChange={(event) => { void addWorkpapers(event.target.files) }} />
    </div>

    <div className={css.step}>
      <div className={css.stepHead}>{step(true, 2)}<span className={css.stepTitle}>{t('intake.period')}</span>
        <span className={css.stepper}>
          <button type="button" aria-label={t('intake.previousYear')} disabled={busy !== undefined} onClick={() => { setPeriod({ year: year - 1, month }) }}>‹</button>
          <span className={css.num}>{year}</span>
          <button type="button" aria-label={t('intake.nextYear')} disabled={busy !== undefined} onClick={() => { setPeriod({ year: year + 1, month }) }}>›</button>
        </span>
      </div>
      <div className={css.months} role="group" aria-label={t('intake.period')}>
        {monthNames.map((name, index) => <button key={name} type="button" aria-pressed={month === index + 1} className={css.month}
          disabled={busy !== undefined} onClick={() => { setPeriod({ year, month: index + 1 }) }}>{name}</button>)}
      </div>
    </div>

    <div className={css.step}>
      <div className={css.stepHead}>
        {step(balance !== undefined, 3)}<span className={css.stepTitle}>{t('intake.balance')}</span>
        <span className={css.required}>{t('intake.required')}</span>
      </div>
      {balance === undefined
        ? <button type="button" className={css.drop} disabled={busy !== undefined} onClick={() => pickBalance.current?.click()}>
          <IconPlusOutlineRegular size={14} />{t('intake.chooseBalance')}
        </button>
        : <ul className={css.files}>{fileChip(balance, () => { setBalance(undefined) })}</ul>}
      <input ref={pickBalance} className={css.hidden} type="file" accept=".xlsx,.xlsm,.xls,.ods,.csv" aria-label={t('intake.chooseBalance')}
        onChange={(event) => { setBalance(accept(event.target.files, SPREADSHEET)[0]); event.target.value = '' }} />
    </div>

    <div className={css.step}>
      <div className={css.stepHead}>
        {step(ledgers.length > 0, 4)}<span className={css.stepTitle}>{t('intake.ledgers')}</span>
        <span className={css.required}>{t('intake.required')}</span>
      </div>
      {ledgers.length > 0 && <ul className={css.files}>
        {ledgers.map(file => fileChip(file, () => { setLedgers(previous => previous.filter(item => item !== file)) }))}
      </ul>}
      <button type="button" className={ledgers.length === 0 ? css.drop : css.link} disabled={busy !== undefined} onClick={() => pickLedgers.current?.click()}>
        <IconPlusOutlineRegular size={14} />{ledgers.length === 0 ? t('intake.chooseLedgers') : t('intake.moreLedgers')}
      </button>
      <input ref={pickLedgers} className={css.hidden} type="file" multiple accept=".xlsx,.xlsm,.xls,.ods,.csv" aria-label={t('intake.chooseLedgers')}
        onChange={(event) => { const picked = accept(event.target.files, SPREADSHEET); setLedgers(previous => [...previous, ...picked]); event.target.value = '' }} />
    </div>

    <label className={css.deliverable}>
      <input type="checkbox" checked={summary} disabled={busy !== undefined} onChange={(event) => { setSummary(event.target.checked) }} />
      <span><span className={css.stepTitle}>{t('intake.summary')}</span><span className={css.muted}>{t('intake.summaryHelp')}</span></span>
    </label>

    <details className={css.optional}>
      <summary>{t('intake.optional')}</summary>
      <div className={css.step}>
        <span className={css.stepTitle}>{t('intake.others')}</span>
        <p className={css.muted}>{t('intake.othersHelp')}</p>
        {others.length > 0 && <ul className={css.files}>
          {others.map(file => fileChip(file, () => { setOthers(previous => previous.filter(item => item !== file)) }))}
        </ul>}
        <button type="button" className={css.link} disabled={busy !== undefined} onClick={() => pickOthers.current?.click()}>
          <IconPlusOutlineRegular size={14} />{t('intake.addOthers')}
        </button>
        <input ref={pickOthers} className={css.hidden} type="file" multiple aria-label={t('intake.addOthers')}
          onChange={(event) => { const picked = accept(event.target.files, undefined); setOthers(previous => [...previous, ...picked]); event.target.value = '' }} />
      </div>
      <label className={css.step}>
        <span className={css.stepTitle}>{t('intake.notes')}</span>
        <textarea className={css.notes} rows={2} value={notes} disabled={busy !== undefined} placeholder={t('intake.notesPlaceholder')}
          onChange={(event) => { setNotes(event.target.value) }} />
      </label>
    </details>

    {error !== undefined && <p role="alert" className={css.errorText}>{error}</p>}
    <footer className={css.foot}>
      <span className={css.muted} role="status">
        {busy ?? (missing.length > 0 ? t('intake.missing', { items: missing.join(', ') }) : t('intake.ready', { label: periodLabel(period, locale) }))}
      </span>
      <button type="button" className={css.primary} disabled={missing.length > 0 || busy !== undefined} onClick={() => { void begin() }}>
        {t('intake.start')}
      </button>
    </footer>
  </section>
}
