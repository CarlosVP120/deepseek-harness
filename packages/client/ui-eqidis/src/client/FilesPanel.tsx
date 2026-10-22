import { type ReactNode, useEffect, useRef, useState } from 'react'
import { IconPaperclipOutlineRegular, IconPlusOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type { ProjectFileEntry, ProjectFilesView } from '@deepseek-ai/dsh-api-workspace-controller/types'
import { periodLabel } from './WorkpaperCard.tsx'
import type { NS } from './locales.ts'
import css from './eqidis.module.css'

/** What the files panel needs for the conversation it sits beside. */
export interface FilesPanelInjected {
  /** The conversation's calculation files and every project file; `null` without a project. */
  readonly list: (sessionId: string) => Promise<ProjectFilesView | null>
  /** Show a file in the app's document preview. */
  readonly preview: (sessionId: string, file: string) => void
  /** Open a file in its default application, or show it in Finder / Explorer. */
  readonly open: (sessionId: string, absolute: string, reveal: boolean) => Promise<void>
  /** Save a copy of a file wherever the user chooses. */
  readonly download: (sessionId: string, file: string) => Promise<void>
  /** Add files to the conversation's calculation; returns their project paths. */
  readonly add: (sessionId: string, section: 'ledgers' | 'others', files: readonly File[]) => Promise<readonly string[]>
  /** Put a message in the conversation's composer, without sending it. */
  readonly prepare: (sessionId: string, text: string) => void
}

type Props = PropsRuntime<'sidebar.right.pane.tab'> & PropsLocale<typeof NS> & InjectFace<FilesPanelInjected>

const REFRESH_MS = 5000
const SPREADSHEET = '.xlsx,.xlsm,.xls,.ods,.csv'

function size(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`
}

/**
 * Everything a calculation used and produced, beside the conversation: the workpapers to fill,
 * the filled ones, the balanza, the auxiliares and other documents, each one to preview, open,
 * show in Finder or download; and below, every file of the project by period.
 */
export function FilesPanel({ sessionId, list, preview, open, download, add, prepare, t }: Props) {
  const locale = t('time.locale')
  const [view, setView] = useState<ProjectFilesView | null | 'error' | undefined>()
  const [busy, setBusy] = useState<string>()
  const [error, setError] = useState<string>()
  const [tick, setTick] = useState(0)
  const pickLedgers = useRef<HTMLInputElement>(null)
  const pickOthers = useRef<HTMLInputElement>(null)
  useEffect(() => {
    let current = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const refresh = () => {
      list(sessionId).then((next) => {
        if (!current) return
        setView(next)
        timer = setTimeout(refresh, REFRESH_MS)
      }, () => { if (current) { setView('error'); timer = setTimeout(refresh, REFRESH_MS * 3) } })
    }
    refresh()
    return () => { current = false; if (timer !== undefined) clearTimeout(timer) }
  // The loaders are recreated per render; the panel follows its conversation and explicit refreshes.
  }, [sessionId, tick])

  if (view === undefined) return <div className={css.panel}><p className={css.muted}>{t('files.loading')}</p></div>
  if (view === 'error') return <div className={css.panel}><p className={css.errorText}>{t('files.error')}</p></div>
  if (view === null) return <div className={css.panel}><p className={css.muted}>{t('panel.noProject')}</p></div>

  const act = async (label: string, run: () => Promise<void>) => {
    setBusy(label); setError(undefined)
    try { await run() }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { setBusy(undefined) }
  }
  const absolute = (file: ProjectFileEntry) => `${view.root.replace(/[\\/]+$/u, '')}/${file.path}`
  const row = (file: ProjectFileEntry) => <li key={file.path} className={css.fileRow}>
    <IconPaperclipOutlineRegular size={14} className={css.fileIcon} />
    <button type="button" className={css.fileOpen} title={file.path} onClick={() => { preview(sessionId, file.path) }}>
      <span className={css.fileName}>{file.name}</span>
      <span className={css.muted}>{size(file.bytes)}</span>
    </button>
    <span className={css.fileActions}>
      <button type="button" className={css.fileAction} disabled={busy !== undefined}
        onClick={() => { void act(file.path, () => open(sessionId, absolute(file), false)) }}>{t('files.open')}</button>
      <button type="button" className={css.fileAction} disabled={busy !== undefined}
        onClick={() => { void act(file.path, () => open(sessionId, absolute(file), true)) }}>{t('files.reveal')}</button>
      <button type="button" className={css.fileAction} disabled={busy !== undefined}
        onClick={() => { void act(file.path, () => download(sessionId, file.path)) }}>{t('files.download')}</button>
    </span>
  </li>
  const section = (title: string, files: readonly ProjectFileEntry[], empty: string, extra?: ReactNode) =>
    <section className={css.fileSection}>
      <h4 className={css.label}>{title}</h4>
      {files.length === 0 ? <p className={css.muted}>{empty}</p> : <ul className={css.fileList}>{files.map(row)}</ul>}
      {extra}
    </section>
  const addFiles = (section: 'ledgers' | 'others', files: FileList | null) => {
    const picked = Array.from(files ?? [])
    if (picked.length === 0) return
    void act(section, async () => {
      const paths = await add(sessionId, section, picked)
      prepare(sessionId, t(section === 'ledgers' ? 'files.addedLedgers' : 'files.addedOthers', { files: paths.map(path => path.split('/').pop()).join(', ') }))
      setTick(value => value + 1)
    })
  }
  const calc = view.calculation
  return <div className={css.panel} data-eqidis-files="">
    <header className={css.panelHead}>
      <h3 className={css.panelTitle}>{t('files.title')}</h3>
      {calc !== null && <span className={css.chip}>{periodLabel(calc.period, locale)}</span>}
    </header>
    {busy !== undefined && <p role="status" className={css.muted}>{t('files.working')}</p>}
    {error !== undefined && <p role="alert" className={css.errorText}>{error}</p>}
    {calc === null
      ? <p className={css.muted}>{t('files.noCalculation')}</p>
      : <>
        {section(t('files.workpapers'), calc.workpaperFiles, t('files.none'))}
        {section(t('files.filled'), calc.filled, t('files.notFilled'))}
        {calc.deliverables.length > 0 && section(t('files.deliverables'), calc.deliverables, t('files.none'))}
        {section(t('files.balance'), calc.balanceFile === null ? [] : [calc.balanceFile], t('files.none'))}
        {section(t('files.ledgers'), calc.ledgerFiles, t('files.none'), <>
          <button type="button" className={css.link} disabled={busy !== undefined} onClick={() => pickLedgers.current?.click()}>
            <IconPlusOutlineRegular size={14} />{t('files.addLedger')}
          </button>
          <input ref={pickLedgers} className={css.hidden} type="file" multiple accept={SPREADSHEET} aria-label={t('files.addLedger')}
            onChange={(event) => { addFiles('ledgers', event.target.files); event.target.value = '' }} />
        </>)}
        {section(t('files.others'), calc.otherFiles, t('files.none'), <>
          <button type="button" className={css.link} disabled={busy !== undefined} onClick={() => pickOthers.current?.click()}>
            <IconPlusOutlineRegular size={14} />{t('files.addOther')}
          </button>
          <input ref={pickOthers} className={css.hidden} type="file" multiple aria-label={t('files.addOther')}
            onChange={(event) => { addFiles('others', event.target.files); event.target.value = '' }} />
        </>)}
      </>}
    <details className={css.solved}>
      <summary>{t('files.project')}</summary>
      {section(t('files.official'), view.workpapers, t('files.none'))}
      {view.periods.map(period => <div key={period.period} className={css.panelGroup}>
        <span className={css.groupTitle}>{periodLabel(period.period, locale)}</span>
        {section(t('files.filled'), period.filled, t('files.notFilled'))}
        {section(t('files.inputs'), period.inputs, t('files.none'))}
      </div>)}
    </details>
  </div>
}
