import { useMemo, useState } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'
import { money, resultData, shortDate, type CoverageData, type Movement } from './format.ts'
import { CoverageBar } from './MonthCard.tsx'
import css from './contabiliai.module.css'

type Props = ToolCallViewProps & PropsLocale<'contabiliai'>
type Filter = 'all' | 'missing' | 'charges' | 'deposits'

const PAGE = 25
const FILTERS: Filter[] = ['all', 'missing', 'charges', 'deposits']

function matches(row: Movement, filter: Filter, bank: string, query: string): boolean {
  const amount = Number(row.importe)
  if (filter === 'missing' && row.poliza !== null) return false
  if (filter === 'charges' && !(amount < 0)) return false
  if (filter === 'deposits' && !(amount > 0)) return false
  if (bank !== '' && row.banco !== bank) return false
  if (query === '') return true
  const haystack = [row.concepto, row.importe, String(Math.abs(amount)), row.poliza?.tipo, ...(row.poliza?.cuentas ?? [])].join(' ').toLowerCase()
  return haystack.includes(query)
}

/**
 * Bank coverage of the audited attempt: one tile per statement and, on demand,
 * every movement with the journal and accounts that recorded it.
 */
export function CoverageCard(props: Props) {
  const { t } = props
  const locale = t('time.locale')
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState<Filter>('all')
  const [bank, setBank] = useState('')
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(PAGE)
  const data = props.phase === 'result' ? resultData(props.block.meta, props.block.content) as CoverageData | undefined : undefined
  const rows = useMemo(() => (data?.movimientos ?? []).filter(row => matches(row, filter, bank, query.trim().toLowerCase())),
    [data, filter, bank, query])
  if (props.phase !== 'result') {
    return <div className={`${css.card} ${css.compact}`} data-contabiliai-card="coverage"><span className={css.pulse} /><span>{t('coverage.reading')}</span></div>
  }
  if (props.block.isError || data === undefined || !Array.isArray(data.bancos)) {
    const text = props.block.content.map(block => block.type === 'text' ? block.text : '').join(' ').trim()
    return <div className={`${css.card} ${css.compact} ${css.errorCard}`} data-contabiliai-card="coverage">
      <span>{t('card.error')}</span>{text !== '' && <span className={css.muted}>{text.slice(0, 240)}</span>}
    </div>
  }
  const covered = data.bancos.reduce((sum, b) => sum + b.con_poliza, 0)
  const total = data.bancos.reduce((sum, b) => sum + b.movimientos, 0)
  const missing = total - covered
  return <div className={css.card} data-contabiliai-card="coverage">
    <header className={css.head}>
      <div className={css.titleBlock}>
        <span className={css.eyebrow}>{t('coverage.title')}</span>
        <span className={css.title}>{t('coverage.summary', { covered, total })}</span>
      </div>
      <span className={`${css.chip} ${missing === 0 ? css.toneOk : css.toneWarn}`}>{missing === 0 ? '100%' : `${missing} ${t('coverage.noJournal').toLowerCase()}`}</span>
    </header>
    <div className={css.banks}>
      {data.bancos.map(b => <section key={b.banco} className={css.bank}>
        <div className={css.bankHead}><span className={css.bankName}>{b.banco}</span><span className={css.muted}>{t('coverage.movements', { count: b.movimientos })}</span></div>
        <div className={css.bankFlows}>
          <div><span className={css.muted}>{t('coverage.charges')} · {b.cargos}</span><span className={`${css.num} ${css.charge}`}>{money(b.importe_cargos, locale)}</span></div>
          <div><span className={css.muted}>{t('coverage.deposits')} · {b.abonos}</span><span className={`${css.num} ${css.deposit}`}>{money(b.importe_abonos, locale)}</span></div>
        </div>
        <div className={css.coverageHead}><span className={css.muted}>{t('metric.coverage')}</span><span className={css.num}>{b.con_poliza} / {b.movimientos}</span></div>
        <CoverageBar covered={b.con_poliza} total={b.movimientos} />
      </section>)}
    </div>
    <button type="button" className={css.toggle} aria-expanded={open} onClick={() => { setOpen(value => !value) }}>
      {t(open ? 'coverage.hide' : 'coverage.show')} <span className={css.muted}>({total})</span>
    </button>
    {open && <div className={css.movements}>
      <div className={css.toolbar}>
        <div className={css.segmented} role="tablist">
          {FILTERS.map(f => <button key={f} type="button" role="tab" aria-selected={filter === f} className={css.segment}
            onClick={() => { setFilter(f); setLimit(PAGE) }}>{t(`coverage.filter.${f}`)}</button>)}
        </div>
        {data.bancos.length > 1 && <select className={css.select} value={bank}
          onChange={(event) => { setBank(event.target.value); setLimit(PAGE) }}>
          <option value="">{t('coverage.filter.allBanks')}</option>
          {data.bancos.map(b => <option key={b.banco} value={b.banco}>{b.banco}</option>)}
        </select>}
        <input className={css.search} type="search" value={query} placeholder={t('coverage.search')}
          onChange={(event) => { setQuery(event.target.value); setLimit(PAGE) }} />
      </div>
      {rows.length === 0 ? <p className={css.note}>{t(filter === 'missing' && missing === 0 && bank === '' && query === '' ? 'coverage.allCovered' : 'coverage.empty')}</p> : <table className={css.table}>
        <thead><tr>
          <th>{t('coverage.col.date')}</th><th>{t('coverage.col.concept')}</th>
          <th className={css.right}>{t('coverage.col.amount')}</th><th>{t('coverage.col.journal')}</th>
        </tr></thead>
        <tbody>{rows.slice(0, limit).map((row, index) => {
          const amount = Number(row.importe)
          return <tr key={`${row.fecha}-${row.banco}-${index}`}>
            <td className={css.nowrap}>
              {shortDate(row.fecha, locale)}{data.bancos.length > 1 && <span className={css.bankTag}>{row.banco}</span>}
            </td>
            <td className={css.concept} title={row.concepto}>{row.concepto}</td>
            <td className={`${css.right} ${css.num} ${amount < 0 ? css.charge : css.deposit}`}>{money(row.importe, locale)}</td>
            <td>{row.poliza === null
              ? <span className={`${css.chip} ${css.toneWarn}`}>{t('coverage.noJournal')}</span>
              : <span className={css.journal}><span className={css.journalType}>{row.poliza.tipo}</span><span className={css.accounts} title={row.poliza.cuentas.join(' · ')}>{row.poliza.cuentas.join(' · ')}</span></span>}</td>
          </tr>
        })}</tbody>
      </table>}
      {rows.length > limit && <button type="button" className={css.toggle} onClick={() => { setLimit(value => value + PAGE * 2) }}>
        {t('coverage.more', { count: Math.min(rows.length - limit, PAGE * 2) })}</button>}
    </div>}
  </div>
}
