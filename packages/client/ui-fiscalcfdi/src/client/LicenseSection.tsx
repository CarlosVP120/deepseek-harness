import { useEffect, useMemo, useState } from 'react'
import { Tag, writeClipboard, type TagTone } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { FiscalcfdiIssuedLicense, FiscalcfdiLicense, FiscalcfdiLicenseIssue } from '@deepseek-ai/dsh-fiscalcfdi-tools/types'
import type { NS } from './locales.ts'
import { StatusLine, message, type Status } from './SqlSetup.tsx'
import css from './sql.module.css'

/** Engine calls the license page receives from the plugin; each rejects with a readable message. */
export interface LicenseSectionInjected {
  /** This computer's license. */
  license: () => Promise<FiscalcfdiLicense>
  /** Save a license code for this computer. */
  activateLicense: (code: string) => Promise<FiscalcfdiLicense>
  /** Licenses issued from this computer (owner only). */
  issuedLicenses: () => Promise<FiscalcfdiIssuedLicense[]>
  /** Sign a license for a customer's computer (owner only). */
  issueLicense: (request: FiscalcfdiLicenseIssue) => Promise<FiscalcfdiIssuedLicense>
  /** Take a computer off its customer's list (owner only). */
  retireLicense: (id: string) => Promise<void>
}

type Props = PropsRuntime<'settings.section'> & PropsLocale<typeof NS> & InjectFace<LicenseSectionInjected>
type T = Props['t']

const TONE: Record<FiscalcfdiLicense['state'], TagTone> = {
  activa: 'success', por_vencer: 'warning', gracia: 'warning', vencida: 'danger', sin_licencia: 'neutral', invalida: 'danger',
}
const STATE = {
  activa: 'license.state.activa', por_vencer: 'license.state.por_vencer', gracia: 'license.state.gracia',
  vencida: 'license.state.vencida', sin_licencia: 'license.state.sin_licencia', invalida: 'license.state.invalida',
} as const satisfies Record<FiscalcfdiLicense['state'], string>

/** Today in this computer's time zone, YYYY-MM-DD. */
function today(): string {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

/** The same day one month later, YYYY-MM-DD (the month's last day when it has fewer days). */
function nextMonth(day: string): string {
  const [year, month, date] = day.split('-').map(Number) as [number, number, number]
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  return new Date(Date.UTC(year, month, Math.min(date, last))).toISOString().slice(0, 10)
}

function CopyButton({ text, t }: { text: string; t: T }) {
  const [copied, setCopied] = useState(false)
  return <button type="button" className={css.secondary} onClick={() => {
    void writeClipboard(text).then((ok) => {
      if (!ok) return
      setCopied(true)
      window.setTimeout(() => { setCopied(false) }, 1200)
    })
  }}>{copied ? t('license.copied') : t('license.copy')}</button>
}

/**
 * Settings page for this computer's license: its state, the equipment code to send to the owner, and the
 * field for the license code. On the owner's computer it also shows the admin panel that issues codes.
 */
export function LicenseSection({ license, activateLicense, issuedLicenses, issueLicense, retireLicense, t }: Props) {
  const [current, setCurrent] = useState<FiscalcfdiLicense | undefined>()
  const [loadError, setLoadError] = useState<string | undefined>()
  const [code, setCode] = useState('')
  const [status, setStatus] = useState<Status>()
  useEffect(() => {
    license().then(setCurrent, (error: unknown) => { setLoadError(message(error)) })
  }, [license])
  const activate = async () => {
    setStatus({ tone: 'busy', text: t('license.activating') })
    try {
      setCurrent(await activateLicense(code))
      setCode('')
      setStatus({ tone: 'ok', text: t('license.activated') })
    } catch (error) {
      setStatus({ tone: 'error', text: message(error) })
    }
  }

  return <section className={css.section} data-fiscalcfdi-license="">
    <h2 className={css.title}>{t('license.title')}</h2>
    <p className={css.intro}>{t('license.intro')}</p>
    {loadError !== undefined && <p className={css.error}>{loadError}</p>}
    {current !== undefined && <>
      <div className={css.block}>
        <span className={css.serverName}>
          {t('license.stateLabel')} <Tag tone={TONE[current.state]}>{t(STATE[current.state])}</Tag>
        </span>
        <p className={css.muted}>{summary(current, t)}</p>
        {!current.required && <p className={css.muted}>{t('license.notRequired')}</p>}
      </div>

      <div className={css.block}>
        <h3 className={css.subtitle}>{t('license.machineTitle')}</h3>
        <p className={css.muted}>{t('license.machineHint')}</p>
        <div className={css.server}>
          <code className={css.code}>{current.machine}</code>
          <CopyButton text={current.machine} t={t} />
        </div>
      </div>

      <form className={css.block} onSubmit={(event) => { event.preventDefault(); if (code.trim() !== '') void activate() }}>
        <h3 className={css.subtitle}>{t('license.activateTitle')}</h3>
        <p className={css.muted}>{t('license.activateHint')}</p>
        <label className={css.field}>
          <span>{t('license.codeLabel')}</span>
          <textarea value={code} rows={3} spellCheck={false} placeholder={t('license.codePlaceholder')} disabled={status?.tone === 'busy'}
            onChange={(event) => { setCode(event.target.value); setStatus(undefined) }} />
        </label>
        <div className={css.actions}>
          <button type="submit" className={css.primary} disabled={code.trim() === '' || status?.tone === 'busy'}>{t('license.activate')}</button>
        </div>
        <StatusLine status={status} />
      </form>

      {current.admin && <LicenseAdmin issuedLicenses={issuedLicenses} issueLicense={issueLicense} retireLicense={retireLicense} t={t} />}
    </>}
  </section>
}

function summary(license: FiscalcfdiLicense, t: T): string {
  switch (license.state) {
    case 'activa':
    case 'por_vencer':
      return t('license.summary.active', { customer: license.customer ?? '', until: license.until ?? '', days: license.daysLeft ?? 0 })
    case 'gracia':
      return t('license.summary.grace', { customer: license.customer ?? '', until: license.until ?? '', grace: license.graceUntil ?? '' })
    case 'vencida':
      return t('license.summary.expired', { customer: license.customer ?? '', until: license.until ?? '' })
    case 'invalida':
      return t('license.summary.invalid')
    case 'sin_licencia':
      return t('license.summary.none')
  }
}

const EMPTY_ISSUE = (): FiscalcfdiLicenseIssue => ({ customer: '', machine: '', device: '', until: nextMonth(today()), graceDays: 5 })

/** The owner's panel: issue, renew and list the licenses of every customer's computers. */
function LicenseAdmin({ issuedLicenses, issueLicense, retireLicense, t }: Omit<LicenseSectionInjected, 'license' | 'activateLicense'> & { t: T }) {
  const [issued, setIssued] = useState<FiscalcfdiIssuedLicense[]>([])
  const [form, setForm] = useState<FiscalcfdiLicenseIssue>(EMPTY_ISSUE)
  const [status, setStatus] = useState<Status>()
  const [made, setMade] = useState<FiscalcfdiIssuedLicense | undefined>()
  const reload = () => { issuedLicenses().then(setIssued, (error: unknown) => { setStatus({ tone: 'error', text: message(error) }) }) }
  useEffect(reload, [issuedLicenses])
  // Each customer's computers, with the newest license of each computer.
  const customers = useMemo(() => {
    const latest = new Map<string, FiscalcfdiIssuedLicense>()
    for (const entry of issued) if (!latest.has(`${entry.customer}\n${entry.machine}`)) latest.set(`${entry.customer}\n${entry.machine}`, entry)
    const groups = new Map<string, FiscalcfdiIssuedLicense[]>()
    for (const entry of latest.values()) {
      if (entry.retired) continue
      groups.set(entry.customer, [...groups.get(entry.customer) ?? [], entry])
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [issued])
  const edit = (patch: Partial<FiscalcfdiLicenseIssue>) => {
    setForm(current => ({ ...current, ...patch }))
    setStatus(undefined)
  }
  const issue = async () => {
    setStatus({ tone: 'busy', text: t('license.admin.issuing') })
    try {
      const entry = await issueLicense(form)
      setMade(entry)
      setForm(EMPTY_ISSUE())
      setStatus({ tone: 'ok', text: t('license.admin.issued', { customer: entry.customer, until: entry.until }) })
      reload()
    } catch (error) {
      setStatus({ tone: 'error', text: message(error) })
    }
  }
  const renew = (entry: FiscalcfdiIssuedLicense) => {
    const from = entry.until > today() ? entry.until : today()
    setForm({ customer: entry.customer, machine: entry.machine, device: entry.device, until: nextMonth(from), graceDays: entry.graceDays })
    setMade(undefined)
    setStatus({ tone: 'ok', text: t('license.admin.renewing', { device: entry.device || entry.machine }) })
  }
  const retire = async (entry: FiscalcfdiIssuedLicense) => {
    try {
      await retireLicense(entry.id)
      reload()
    } catch (error) {
      setStatus({ tone: 'error', text: message(error) })
    }
  }
  const ready = form.customer.trim() !== '' && form.machine.trim() !== '' && form.until !== ''
  const day = today()

  return <div className={css.block}>
    <h3 className={css.subtitle}>{t('license.admin.title')}</h3>
    <p className={css.muted}>{t('license.admin.hint')}</p>
    <form className={css.form} onSubmit={(event) => { event.preventDefault(); if (ready && status?.tone !== 'busy') void issue() }}>
      <label className={css.field}>
        <span>{t('license.admin.customer')}</span>
        <input value={form.customer} list="fiscalcfdi-license-customers" autoComplete="off" onChange={(event) => { edit({ customer: event.target.value }) }} />
        <datalist id="fiscalcfdi-license-customers">{customers.map(([name]) => <option key={name} value={name} />)}</datalist>
      </label>
      <label className={css.field}>
        <span>{t('license.admin.device')}</span>
        <input value={form.device} autoComplete="off" placeholder={t('license.admin.devicePlaceholder')} onChange={(event) => { edit({ device: event.target.value }) }} />
      </label>
      <label className={`${css.field} ${css.wideField}`}>
        <span>{t('license.admin.machine')}</span>
        <input value={form.machine} autoComplete="off" spellCheck={false} placeholder={t('license.admin.machinePlaceholder')}
          onChange={(event) => { edit({ machine: event.target.value }) }} />
      </label>
      <label className={css.field}>
        <span>{t('license.admin.until')}</span>
        <input type="date" value={form.until} onChange={(event) => { edit({ until: event.target.value }) }} />
      </label>
      <label className={css.field}>
        <span>{t('license.admin.grace')}</span>
        <input type="number" min={0} max={60} value={form.graceDays} onChange={(event) => { edit({ graceDays: Number(event.target.value) }) }} />
      </label>
      <div className={css.actions}>
        <button type="submit" className={css.primary} disabled={!ready || status?.tone === 'busy'}>{t('license.admin.issue')}</button>
      </div>
      <StatusLine status={status} />
    </form>
    {made !== undefined && <div className={css.made}>
      <p className={css.muted}>{t('license.admin.send', { device: made.device || made.machine })}</p>
      <code className={css.codeBlock}>{made.code}</code>
      <div className={css.actions}><CopyButton text={made.code} t={t} /></div>
    </div>}

    {customers.length === 0 ? <p className={css.muted}>{t('license.admin.empty')}</p> : customers.map(([customer, devices]) =>
      <div key={customer} className={css.customer}>
        <span className={css.serverName}>{customer} <Tag tone="neutral">{devices.length === 1 ? t('license.admin.oneDevice') : t('license.admin.devices', { count: devices.length })}</Tag></span>
        <ul className={css.servers}>
          {devices.map((entry) => {
            const expired = entry.until < day
            return <li key={entry.id} className={css.server}>
              <div className={css.serverText}>
                <span className={css.serverName}>
                  {entry.device || entry.machine}
                  <Tag tone={expired ? 'danger' : 'success'}>{expired ? t('license.admin.expired') : t('license.admin.current')}</Tag>
                </span>
                <span className={css.muted}>{entry.machine} · {t('license.admin.paidUntil', { until: entry.until })}</span>
              </div>
              <div className={css.rowActions}>
                <button type="button" className={css.secondary} onClick={() => { renew(entry) }}>{t('license.admin.renew')}</button>
                <CopyButton text={entry.code} t={t} />
                <button type="button" className={css.secondary} onClick={() => { void retire(entry) }}>{t('license.admin.retire')}</button>
              </div>
            </li>
          })}
        </ul>
      </div>)}
  </div>
}
