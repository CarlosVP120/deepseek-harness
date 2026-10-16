import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'
import { callArgs, monthLabel, money, percent, resultData, type MonthCardData } from './format.ts'
import css from './fiscalcfdi.module.css'

type Props = ToolCallViewProps & PropsLocale<'fiscalcfdi'>

const STATE_TONE: Record<string, string | undefined> = {
  running: css.toneRunning, waiting: css.toneWarn, completed: css.toneOk, blocked: css.toneError, failed: css.toneError,
}

/** State chip shared by the month card and the months panel. */
export function StateChip({ state, t }: { state: string | undefined; t: Props['t'] }) {
  const key = `state.${state ?? 'draft'}` as Parameters<Props['t']>[0]
  return <span className={`${css.chip} ${STATE_TONE[state ?? ''] ?? ''}`}>{state === 'running' && <span className={css.pulse} />}{t(key)}</span>
}

/** Horizontal coverage bar with its count. */
export function CoverageBar({ covered, total }: { covered: number | null | undefined; total: number | null | undefined }) {
  const pct = percent(covered, total)
  if (pct === undefined) return null
  return <div className={css.bar} role="meter" aria-valuemin={0} aria-valuemax={total ?? 0} aria-valuenow={covered ?? 0}>
    <span className={`${css.barFill} ${pct === 100 ? css.barDone : ''}`} style={{ width: `${pct}%` }} />
  </div>
}

/**
 * The accounting month as a card: state, the engine's steps, live bank
 * coverage and, once audited, journals and VAT.
 */
export function MonthCard(props: Props) {
  const { t, toolName } = props
  const locale = t('time.locale')
  const args = callArgs(props.phase === 'result' ? props.block.call?.argsRaw : props.phase === 'start' ? props.block.argsRaw : undefined)
  if (props.phase !== 'result') {
    return <div className={`${css.card} ${css.compact}`} data-fiscalcfdi-card="month">
      <span className={css.pulse} />
      <span>{t(toolName === 'fiscalcfdi_procesar' ? 'card.starting' : 'card.reading')}</span>
      {args.periodo !== undefined && <span className={css.muted}>{monthLabel(args.periodo, locale)}</span>}
    </div>
  }
  const raw = resultData(props.block.meta, props.block.content) ?? {}
  // Results recorded before the card metadata carry the full file and question lists.
  const count = (value: unknown) => Array.isArray(value) ? value.length : typeof value === 'number' ? value : undefined
  const data = { ...raw, archivos: count(raw.archivos), preguntas: count(raw.preguntas) } as MonthCardData
  if (props.block.isError || data.estado === undefined) {
    const text = props.block.content.map(block => block.type === 'text' ? block.text : '').join(' ').trim()
    return <div className={`${css.card} ${css.compact} ${css.errorCard}`} data-fiscalcfdi-card="month">
      <span>{t('card.error')}</span>{text !== '' && <span className={css.muted}>{text.slice(0, 240)}</span>}
    </div>
  }
  const result = data.resultado ?? undefined
  const live = data.avance?.cobertura ?? {}
  const covered = result?.movimientos_bancarios_cubiertos ?? live.movimientos_bancarios_cubiertos
  const total = result?.movimientos_bancarios_total ?? live.movimientos_bancarios_total
  const steps = data.estado === 'draft' || data.estado === 'ready' ? [] : data.avance?.pasos ?? []
  return <div className={css.card} data-fiscalcfdi-card="month">
    <header className={css.head}>
      <div className={css.titleBlock}>
        <span className={css.eyebrow}>{data.empresa}</span>
        <span className={css.title}>{monthLabel(data.periodo, locale)}</span>
      </div>
      <StateChip state={data.estado} t={t} />
    </header>
    <div className={css.facts}>
      {data.archivos !== undefined && <span>{t('card.files', { count: data.archivos })}</span>}
      {(data.intento ?? 0) > 0 && <span>{t('card.attempt', { count: data.intento ?? 0 })}</span>}
      {(data.preguntas ?? 0) > 0 && <span className={css.warnText}>{t('card.questions', { count: data.preguntas ?? 0 })}</span>}
      {result !== undefined && <span className={result.auditoria_aprobada ? css.okText : css.warnText}>
        {t(result.auditoria_aprobada ? 'card.audit.passed' : 'card.audit.failed')}</span>}
    </div>
    {steps.length > 0 && <ol className={css.steps}>
      {steps.map(step => <li key={step.clave} className={css.step} data-state={step.estado}>
        <span className={css.stepDot}>{step.estado === 'hecho' ? '✓' : ''}</span>
        <span className={css.stepLabel}>{step.titulo}</span>
      </li>)}
    </ol>}
    {total !== undefined && total !== null && <div className={css.coverage}>
      <div className={css.coverageHead}>
        <span>{t('metric.coverage')}</span>
        <span className={css.num}>{covered ?? 0} / {total}</span>
      </div>
      <CoverageBar covered={covered} total={total} />
    </div>}
    {result !== undefined && <dl className={css.metrics}>
      <div><dt>{t('metric.journals')}</dt><dd className={css.num}>{result.polizas ?? '—'}</dd></div>
      <div><dt>{t('metric.vatPaid')}</dt><dd className={css.num}>{money(result.iva_acreditable_pagado, locale)}</dd></div>
      <div><dt>{t('metric.vatCollected')}</dt><dd className={css.num}>{money(result.iva_trasladado_cobrado, locale)}</dd></div>
    </dl>}
    {data.mensaje !== undefined && data.estado !== 'completed' && <p className={css.note}>{data.mensaje}</p>}
    {data.error !== undefined && data.error !== null && data.error !== '' && <p className={`${css.note} ${css.errorText}`}>{data.error}</p>}
  </div>
}
