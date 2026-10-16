import { useRef, useState, useSyncExternalStore } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type { FiscalcfdiMonthDetail } from '@deepseek-ai/dsh-fiscalcfdi-tools/types'
import { money, monthLabel } from './format.ts'
import { CoverageBar, StateChip } from './MonthCard.tsx'
import type { MonthRegistry, SessionMonth } from './month-store.ts'
import type { NS } from './locales.ts'
import css from './panel.module.css'

/** What the panel receives from the plugin. */
export interface MonthPanelInjected {
  readonly months: MonthRegistry
}

type Props = PropsRuntime<'sidebar.right.pane.tab'> & PropsLocale<typeof NS> & InjectFace<MonthPanelInjected> & { sessionId: string }
type T = Props['t']

const FILE_ROLE: Record<string, string> = {
  documents: 'Facturas', bank: 'Estado de cuenta', workpaper: 'PDT', history: 'Pólizas anteriores', reference: 'Referencia',
}

function Reply({ t, busy, onSend, quick }: { t: T; busy: boolean; onSend: (text: string) => void; quick?: string | undefined }) {
  const [text, setText] = useState('')
  return <div className={css.reply}>
    {quick !== undefined && <button type="button" className={css.primary} disabled={busy} onClick={() => { onSend(quick) }}>{quick}</button>}
    <textarea className={css.replyInput} rows={2} value={text} placeholder={t('panel.replyPlaceholder')} disabled={busy}
      onChange={(event) => { setText(event.target.value) }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && !event.shiftKey && text.trim() !== '') { event.preventDefault(); onSend(text.trim()); setText('') }
      }} />
    <button type="button" className={css.secondary} disabled={busy || text.trim() === ''} onClick={() => { onSend(text.trim()); setText('') }}>{t('panel.reply')}</button>
  </div>
}

function Files({ detail, month, t }: { detail: FiscalcfdiMonthDetail; month: SessionMonth; t: T }) {
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const uploading = month.getSnapshot().busy === 'upload'
  const send = (list: FileList | null) => {
    const files = list === null ? [] : [...list]
    if (files.length > 0) void month.upload(files)
  }
  return <section className={css.section}>
    <h3 className={css.sectionTitle}>{t('panel.files')}<span className={css.muted}>{detail.archivos.length}</span></h3>
    {detail.archivos.length === 0 ? <p className={css.muted}>{t('panel.noFiles')}</p> : <ul className={css.fileList}>
      {detail.archivos.map(file => <li key={file.nombre} className={css.fileRow}>
        <span className={css.fileIcon} aria-hidden="true">▤</span>
        <span className={css.fileBody}>
          <span className={css.fileName} title={file.nombre}>{file.nombre}</span>
          <span className={css.muted} title={file.estado}>{FILE_ROLE[file.rol ?? ''] ?? file.tipo ?? ''}{file.estado !== '' ? ` · ${file.estado}` : ''}</span>
        </span>
      </li>)}
    </ul>}
    <button type="button" className={`${css.drop} ${over ? css.dropOver : ''}`} disabled={uploading}
      onClick={() => input.current?.click()}
      // The chat accepts dropped files too: a drop here belongs to the month only.
      onDragEnter={(event) => { event.preventDefault(); event.stopPropagation() }}
      onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); setOver(true) }}
      onDragLeave={() => { setOver(false) }}
      onDrop={(event) => { event.preventDefault(); event.stopPropagation(); setOver(false); send(event.dataTransfer.files) }}>
      {uploading ? t('panel.uploading') : over ? t('panel.dropActive') : t('panel.dropHint')}
    </button>
    <input ref={input} type="file" multiple hidden accept=".xlsx,.xls,.xml,.pdf,.csv,.zip"
      onChange={(event) => { send(event.target.files); event.target.value = '' }} />
  </section>
}

/**
 * The right-Sidebar page of a chat's company month: what it needs, its files,
 * the engine's next step, the agent's questions, progress, result and the
 * importable — each with the action that moves the month forward.
 */
export function MonthPanel({ sessionId, months, t }: Props) {
  const month = months.for(sessionId)
  const state = useSyncExternalStore(month.subscribe, month.getSnapshot)
  const locale = t('time.locale')
  const detail = state.detail
  if (state.binding === undefined) return <div className={css.panel}><p className={css.muted}>{t('panel.loading')}</p></div>
  if (state.binding === null || detail === undefined) {
    return <div className={css.panel}>
      <div className={css.emptyState}>
        <p>{t('panel.empty')}</p>
        <p className={css.muted}>{t('panel.emptyHint')}</p>
      </div>
    </div>
  }
  const busy = state.busy !== undefined
  const waitingForUser = detail.estado === 'draft' && !detail.listo && detail.mensaje !== null
  const isQuestion = waitingForUser && detail.mensaje?.includes('¿') === true
  const steps = detail.estado === 'draft' ? [] : detail.pasos
  return <div className={css.panel} data-fiscalcfdi-panel="">
    <header className={css.panelHead}>
      <div className={css.titleBlock}>
        <span className={css.eyebrow} title={`${detail.empresa} · ${detail.rfc}`}>{detail.empresa}</span>
        <span className={css.title}>{monthLabel(detail.periodo, locale)}</span>
      </div>
      <StateChip state={detail.estado} t={t} />
    </header>
    {detail.intento > 0 && <p className={css.muted}>{t('panel.attempt', { count: detail.intento })} · {detail.descripcion}</p>}

    {detail.estado === 'draft' && <section className={css.section}>
      <h3 className={css.sectionTitle}>{t('panel.requirements')}</h3>
      <ul className={css.checklist}>
        {detail.requisitos.map(item => <li key={item.clave} data-done={item.listo}>
          <span className={css.check} aria-hidden="true">{item.listo ? '✓' : ''}</span>{item.titulo}
        </li>)}
      </ul>
    </section>}

    <Files detail={detail} month={month} t={t} />

    {detail.estado === 'draft' && (waitingForUser || detail.listo) && <section className={`${css.section} ${css.nextStep}`}>
      <h3 className={css.sectionTitle}>{t('panel.next')}</h3>
      {detail.mensaje !== null && <p className={css.message}>{detail.mensaje}</p>}
      {isQuestion && <Reply t={t} busy={busy} quick="Sí, úsalas" onSend={(text) => { void month.answer(text) }} />}
      {detail.listo && <button type="button" className={`${css.primary} ${css.wide}`} disabled={busy} onClick={() => { void month.process() }}>
        {state.busy === 'process' ? t('panel.processing') : t('panel.process')}</button>}
    </section>}

    {detail.preguntas.length > 0 && <section className={`${css.section} ${css.nextStep}`}>
      <h3 className={css.sectionTitle}>{t('panel.questions')}<span className={css.muted}>{detail.preguntas.length}</span></h3>
      {detail.preguntas.map(question => <div key={question.id} className={css.question}>
        <p className={css.message}>{question.pregunta}</p>
        <Reply t={t} busy={busy} onSend={(text) => { void month.answer(text, question.id) }} />
      </div>)}
    </section>}

    {steps.length > 0 && <section className={css.section}>
      <h3 className={css.sectionTitle}>{t('panel.progress')}</h3>
      <ol className={css.stepList}>
        {steps.map(step => <li key={step.clave} data-state={step.estado}>
          <span className={css.stepDot} aria-hidden="true">{step.estado === 'hecho' ? '✓' : ''}</span>{step.titulo}
        </li>)}
      </ol>
      {detail.total !== null && <div className={css.coverageLine}>
        <span className={css.muted}>{t('metric.coverage')}</span><span className={css.num}>{detail.cubiertos ?? 0} / {detail.total}</span>
      </div>}
      {detail.total !== null && <CoverageBar covered={detail.cubiertos} total={detail.total} />}
    </section>}

    {detail.resultado !== null && <section className={css.section}>
      <h3 className={css.sectionTitle}>{t('panel.result')}
        <span className={detail.resultado.auditoria_aprobada ? css.okText : css.warnText}>
          {t(detail.resultado.auditoria_aprobada ? 'card.audit.passed' : 'card.audit.failed')}</span></h3>
      <dl className={css.metrics}>
        <div><dt>{t('metric.journals')}</dt><dd className={css.num}>{detail.resultado.polizas ?? '—'}</dd></div>
        <div><dt>{t('metric.vatPaid')}</dt><dd className={css.num}>{money(detail.resultado.iva_acreditable, locale)}</dd></div>
        <div><dt>{t('metric.vatCollected')}</dt><dd className={css.num}>{money(detail.resultado.iva_trasladado, locale)}</dd></div>
      </dl>
      {detail.importable && <button type="button" className={`${css.primary} ${css.wide}`} disabled={busy} onClick={() => { void month.download() }}>
        {state.busy === 'download' ? t('panel.downloading') : `⬇ ${t('panel.download')}`}</button>}
    </section>}

    {detail.error !== null && detail.estado !== 'completed' && <p className={css.errorText}>{detail.error}</p>}
    {state.error !== undefined && <p className={css.errorText}>{state.error}</p>}
    <footer className={css.panelFoot}>
      <span className={css.muted}>{t('panel.chatHint')}</span>
      <button type="button" className={css.linkButton} disabled={busy} onClick={() => { void month.refresh() }}>{t('panel.refresh')}</button>
    </footer>
  </div>
}
