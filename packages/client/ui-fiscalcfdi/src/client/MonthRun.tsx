import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { FiscalcfdiMonthDetail } from '@deepseek-ai/dsh-fiscalcfdi-tools/types'
import { money } from './format.ts'
import { CoverageBar, StateChip } from './MonthCard.tsx'
import type { MonthState, SessionMonth } from './month-store.ts'
import type { NS } from './locales.ts'
import css from './guided.module.css'
import panel from './panel.module.css'

type T = PropsLocale<typeof NS>['t']

/** States after which the month can be started again. */
const RETRYABLE = new Set(['failed', 'blocked', 'cancelled'])

/**
 * A started month inside the guided start: the engine's steps and live bank
 * coverage, the audited result with the importable, and the next step —
 * answering the agent's question or retrying — handed to the chat.
 */
export function MonthRun({ detail, state, month, t, onChat }: {
  detail: FiscalcfdiMonthDetail
  state: MonthState
  month: SessionMonth
  t: T
  /** Send the request for this step to the chat. */
  onChat: (prompt: 'run.continuePrompt' | 'run.retryPrompt') => void
}) {
  const locale = t('time.locale')
  const busy = state.busy !== undefined
  const result = detail.resultado
  return <div className={css.run} data-fiscalcfdi-run={detail.estado}>
    <div className={css.runHead}>
      <StateChip state={detail.estado} t={t} />
      {detail.intento > 0 && <span className={css.muted}>{t('panel.attempt', { count: detail.intento })}{detail.descripcion !== '' ? ` · ${detail.descripcion}` : ''}</span>}
    </div>

    {detail.pasos.length > 0 && <ol className={`${panel.stepList} ${css.steps}`}>
      {detail.pasos.map(step => <li key={step.clave} data-state={step.estado}>
        <span className={panel.stepDot} aria-hidden="true">{step.estado === 'hecho' ? '✓' : ''}</span>{step.titulo}
      </li>)}
    </ol>}
    {detail.total !== null && <div className={css.coverage}>
      <div className={css.coverageLine}>
        <span className={css.muted}>{t('metric.coverage')}</span><span className={panel.num}>{detail.cubiertos ?? 0} / {detail.total}</span>
      </div>
      <CoverageBar covered={detail.cubiertos} total={detail.total} />
    </div>}

    {detail.preguntas.map(question => <div key={question.id} className={css.question}><p>{question.pregunta}</p></div>)}

    {result !== null && <div className={css.result}>
      <span className={result.auditoria_aprobada ? panel.okText : panel.warnText}>
        {t(result.auditoria_aprobada ? 'card.audit.passed' : 'card.audit.failed')}</span>
      <dl className={css.metrics}>
        <div><dt>{t('metric.journals')}</dt><dd className={panel.num}>{result.polizas ?? '—'}</dd></div>
        <div><dt>{t('metric.vatPaid')}</dt><dd className={panel.num}>{money(result.iva_acreditable, locale)}</dd></div>
        <div><dt>{t('metric.vatCollected')}</dt><dd className={panel.num}>{money(result.iva_trasladado, locale)}</dd></div>
      </dl>
    </div>}

    {detail.error !== null && detail.estado !== 'completed' && <p className={css.error}>{detail.error}</p>}
    {state.error !== undefined && state.busy === undefined && <p className={css.error}>{state.error}</p>}

    <div className={css.footer}>
      <span className={css.muted}>{t(detail.estado === 'running' ? 'run.runningHint' : detail.estado === 'waiting'
        ? 'run.waitingHint' : detail.estado === 'completed' ? 'run.doneHint' : 'run.stoppedHint')}</span>
      {detail.importable && <button type="button" className={`${css.primary} ${css.start}`} disabled={busy} onClick={() => { void month.download() }}>
        {state.busy === 'download' ? t('panel.downloading') : `⬇ ${t('panel.download')}`}</button>}
      {detail.estado === 'waiting' && <button type="button" className={`${css.primary} ${css.start}`} onClick={() => { onChat('run.continuePrompt') }}>
        {t('run.answerInChat')}</button>}
      {RETRYABLE.has(detail.estado) && <button type="button" className={`${css.primary} ${css.start}`} onClick={() => { onChat('run.retryPrompt') }}>
        {t('run.retry')}</button>}
    </div>
  </div>
}
