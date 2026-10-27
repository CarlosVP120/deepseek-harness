import { useEffect, useState } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {
  FiscalcfdiCompanyRefresh, FiscalcfdiSqlCheck, FiscalcfdiSqlConnection, FiscalcfdiSqlRequest,
} from '@deepseek-ai/dsh-fiscalcfdi-tools/types'
import type { NS } from './locales.ts'
import css from './sql.module.css'

/** Engine calls the section receives from the plugin; each rejects with the engine's message. */
export interface SqlSectionInjected {
  /** The saved connection, without its password. */
  loadSql: () => Promise<FiscalcfdiSqlConnection>
  /** Connect with these values; `save` keeps them only when the server answers. */
  checkSql: (request: FiscalcfdiSqlRequest, save: boolean) => Promise<FiscalcfdiSqlCheck>
  /** Re-read the companies from the saved server. */
  refreshCompanies: () => Promise<FiscalcfdiCompanyRefresh>
}

type Props = PropsRuntime<'settings.section'> & PropsLocale<typeof NS> & InjectFace<SqlSectionInjected>

type Status = { tone: 'ok' | 'error' | 'busy'; text: string } | undefined

function message(error: unknown): string {
  return error instanceof Error ? error.message : typeof error === 'object' && error !== null && 'message' in error
    ? String((error).message) : String(error)
}

const EMPTY: FiscalcfdiSqlRequest = { server: '', port: 1433, user: '', database: 'master', password: '' }

/**
 * Settings page for the CONTPAQi SQL Server the engine reads: edit the
 * connection, test it, save it once it answers, and re-read the companies.
 * The password is write-only; an empty field keeps the saved one.
 */
export function SqlSection({ loadSql, checkSql, refreshCompanies, t }: Props) {
  const [form, setForm] = useState<FiscalcfdiSqlRequest>(EMPTY)
  const [saved, setSaved] = useState<FiscalcfdiSqlConnection | undefined>()
  const [loadError, setLoadError] = useState<string | undefined>()
  const [status, setStatus] = useState<Status>()
  const [companies, setCompanies] = useState<Status>()
  useEffect(() => {
    loadSql().then((connection) => {
      setSaved(connection)
      setForm({ server: connection.server, port: connection.port, user: connection.user, database: connection.database, password: '' })
    }, (error: unknown) => { setLoadError(message(error)) })
  }, [loadSql])

  const busy = status?.tone === 'busy' || companies?.tone === 'busy'
  const filled = form.server.trim() !== '' && form.user.trim() !== '' && (form.password !== '' || saved?.passwordConfigured === true)
  const edit = (patch: Partial<FiscalcfdiSqlRequest>) => {
    setForm(current => ({ ...current, ...patch }))
    setStatus(undefined)
  }
  const refresh = async () => {
    setCompanies({ tone: 'busy', text: t('sql.refreshing') })
    try {
      const result = await refreshCompanies()
      setCompanies({ tone: 'ok', text: t('sql.refreshed', { count: result.companies, unavailable: result.unavailable }) })
    } catch (error) {
      setCompanies({ tone: 'error', text: message(error) })
    }
  }
  const check = async (save: boolean) => {
    setStatus({ tone: 'busy', text: t('sql.testing') })
    try {
      const result = await checkSql(form, save)
      setSaved(result.connection)
      setForm(current => ({ ...current, password: '' }))
      const version = result.version === null ? '' : ` ${t('sql.version', { version: result.version.split('.')[0] ?? result.version })}`
      setStatus({ tone: 'ok', text: (save ? t('sql.saved') : t('sql.connected')) + version })
    } catch (error) {
      setStatus({ tone: 'error', text: message(error) })
      return
    }
    // A saved connection can name another server: its companies replace the list right away.
    if (save) await refresh()
  }

  return <section className={css.section} data-fiscalcfdi-sql="">
    <h2 className={css.title}>{t('sql.title')}</h2>
    <p className={css.intro}>{t('sql.intro')}</p>
    {loadError !== undefined && <p className={css.error}>{loadError}</p>}

    <form className={css.form} onSubmit={(event) => { event.preventDefault(); if (filled && !busy) void check(true) }}>
      <label className={css.field}>
        <span>{t('sql.server')}</span>
        <input value={form.server} placeholder={t('sql.serverPlaceholder')} autoComplete="off" spellCheck={false} disabled={busy}
          onChange={(event) => { edit({ server: event.target.value }) }} />
      </label>
      <label className={`${css.field} ${css.port}`}>
        <span>{t('sql.port')}</span>
        <input type="number" min={1} max={65535} value={form.port} disabled={busy}
          onChange={(event) => { edit({ port: Number(event.target.value) }) }} />
      </label>
      <label className={css.field}>
        <span>{t('sql.user')}</span>
        <input value={form.user} autoComplete="off" spellCheck={false} disabled={busy}
          onChange={(event) => { edit({ user: event.target.value }) }} />
      </label>
      <label className={css.field}>
        <span>{t('sql.password')}</span>
        <input type="password" value={form.password} autoComplete="new-password" disabled={busy}
          placeholder={saved?.passwordConfigured === true ? t('sql.passwordKept') : ''}
          onChange={(event) => { edit({ password: event.target.value }) }} />
      </label>
      <label className={`${css.field} ${css.wideField}`}>
        <span>{t('sql.database')}</span>
        <input value={form.database} autoComplete="off" spellCheck={false} disabled={busy}
          onChange={(event) => { edit({ database: event.target.value }) }} />
      </label>
      <div className={css.actions}>
        <button type="button" className={css.secondary} disabled={!filled || busy} onClick={() => { void check(false) }}>{t('sql.test')}</button>
        <button type="submit" className={css.primary} disabled={!filled || busy}>{t('sql.save')}</button>
      </div>
      {status !== undefined && <p className={status.tone === 'error' ? css.error : status.tone === 'ok' ? css.ok : css.muted} role="status">{status.text}</p>}
      <p className={css.muted}>{t('sql.tailscaleHint')}</p>
    </form>

    <div className={css.block}>
      <h3 className={css.subtitle}>{t('sql.companiesTitle')}</h3>
      <p className={css.muted}>{t('sql.companiesHint')}</p>
      <div className={css.actions}>
        <button type="button" className={css.secondary} disabled={busy || saved?.server === ''} onClick={() => { void refresh() }}>{t('sql.refresh')}</button>
      </div>
      {companies !== undefined && <p className={companies.tone === 'error' ? css.error : companies.tone === 'ok' ? css.ok : css.muted} role="status">{companies.text}</p>}
    </div>
  </section>
}
