import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'
import type { WorkpaperResult } from '@deepseek-ai/dsh-eqidis-workpapers/types'
import { IconCheckOutlineRegular, IconWarningTriangleOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import { type FollowUp, PendingList, pendingItems } from './PendingList.tsx'
import type { NS } from './locales.ts'
import css from './eqidis.module.css'

type Props = ToolCallViewProps & PropsLocale<typeof NS> & { follow?: FollowUp }

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

/** The card payload: presentation meta when the Host projected it, else the tool's JSON text. */
export function workpaperResult(meta: unknown, content: readonly { type: string; text?: string }[]): WorkpaperResult | undefined {
  let data = record(meta)
  if (data === undefined) {
    try {
      const parsed = record(JSON.parse(content.map(block => block.type === 'text' ? block.text ?? '' : '').join('')))
      data = record(parsed?.tarjeta) ?? parsed
    } catch {
      return undefined
    }
  }
  return data !== undefined && Array.isArray(data.resultados) ? data as unknown as WorkpaperResult : undefined
}

/** `2026-09` → «septiembre de 2026»; any other label is shown as is. */
export function periodLabel(period: string, locale: string): string {
  const match = /^(\d{4})-(\d{2})$/u.exec(period)
  if (match === null) return period
  return new Date(Number(match[1]), Number(match[2]) - 1, 1).toLocaleDateString(locale, { month: 'long', year: 'numeric' })
}

function figure(value: number | string | null, locale: string, empty: string): string {
  if (value === null || value === '') return empty
  if (typeof value === 'number') return value.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return value
}

/**
 * Result of `workpaper_finish`: the official workpaper's key figures as it
 * calculated them, the checks the agent ran and what the accountant must review.
 */
export function WorkpaperCard(props: Props) {
  const { t } = props
  const locale = t('time.locale')
  if (props.phase !== 'result') {
    return <div className={`${css.card} ${css.compact}`} data-eqidis-card="workpaper"><span className={css.pulse} /><span>{t('card.working')}</span></div>
  }
  const data = workpaperResult(props.block.meta, props.block.content)
  if (props.block.isError || data === undefined) {
    const text = props.block.content.map(block => block.type === 'text' ? block.text : '').join(' ').trim()
    return <div className={`${css.card} ${css.compact} ${css.errorCard}`} data-eqidis-card="workpaper">
      <span>{t('card.error')}</span>{text !== '' && <span className={css.muted}>{text.slice(0, 240)}</span>}
    </div>
  }
  const errors = data.errores.length
  const items = pendingItems(data.pendientes)
  const pending = items.filter(item => item.estado === 'abierto').length
  const tone = errors > 0 ? css.toneError : pending > 0 ? css.toneWarn : css.toneOk
  const chip = errors > 0 ? t('card.errors', { count: errors }) : pending > 0 ? t('card.pending', { count: pending }) : t('card.clean')
  return <div className={css.card} data-eqidis-card="workpaper">
    <header className={css.head}>
      <div className={css.titleBlock}>
        <span className={css.eyebrow}>{t('card.eyebrow', { period: periodLabel(data.periodo, locale) })}</span>
        <span className={css.title}>{data.plantilla}</span>
      </div>
      <span className={`${css.chip} ${tone}`}>{chip}</span>
    </header>
    <section aria-label={t('card.figures')}>
      <dl className={css.figures}>
        {data.resultados.map(item => <div className={css.figure} key={`${item.concepto}-${item.celda ?? ''}`}>
          <dt><span>{item.concepto}</span>{item.celda !== undefined && <span className={css.cell}>{item.celda}</span>}</dt>
          <dd className={css.num}>{figure(item.valor, locale, t('card.empty'))}</dd>
        </div>)}
      </dl>
    </section>
    {errors > 0 && <section className={css.block} aria-label={t('card.errorTitle')}>
      <h4 className={css.blockTitle}>{t('card.errorTitle')}</h4>
      <ul className={css.list}>{data.errores.map(item =>
        <li key={item} className={css.errorText}><IconWarningTriangleOutlineRegular size={14} /><span>{item}</span></li>)}</ul>
    </section>}
    <PendingList items={items} file={data.archivo} workpaper={data.plantilla} period={periodLabel(data.periodo, locale)}
      follow={props.follow} t={t} />
    {data.verificaciones.length > 0 && <section className={css.block} aria-label={t('card.checks')}>
      <h4 className={css.blockTitle}>{t('card.checks')}</h4>
      <ul className={css.list}>{data.verificaciones.map(item =>
        <li key={item}><IconCheckOutlineRegular size={14} className={css.okText} /><span>{item}</span></li>)}</ul>
    </section>}
    <footer className={css.foot}>
      <span className={css.muted}>{t('card.file')}: <span className={css.path}>{data.archivo}</span>
        {props.follow !== undefined && <> · <button type="button" className={css.panelLink} onClick={props.follow.openFiles}>{t('card.files')}</button></>}
      </span>
      <span className={css.muted}>{t('card.captured', { count: data.capturas })}</span>
    </footer>
  </div>
}
