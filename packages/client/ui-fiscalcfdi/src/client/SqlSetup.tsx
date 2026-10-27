import { useState } from 'react'
import { CodeBlock, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type {
  FiscalcfdiSqlReader, FiscalcfdiSqlReaderRequest, FiscalcfdiSqlScript, FiscalcfdiSqlServer,
} from '@deepseek-ai/dsh-fiscalcfdi-tools/types'
import type { NS } from './locales.ts'
import css from './sql.module.css'

type T = PropsLocale<typeof NS>['t']

/** A status line under an action. */
export type Status = { tone: 'ok' | 'error' | 'busy'; text: string } | undefined

/** The text of a rejected engine call. */
export function message(error: unknown): string {
  return error instanceof Error ? error.message : typeof error === 'object' && error !== null && 'message' in error
    ? String((error).message) : String(error)
}

/** Render a {@link Status}. */
export function StatusLine({ status }: { status: Status }) {
  if (status === undefined) return null
  return <p className={status.tone === 'error' ? css.error : status.tone === 'ok' ? css.ok : css.muted} role="status">{status.text}</p>
}

const ORIGIN = {
  equipo: 'sql.find.origin.equipo', red: 'sql.find.origin.red', tailscale: 'sql.find.origin.tailscale',
} as const satisfies Record<FiscalcfdiSqlServer['origin'], string>

/**
 * The SQL Server instances found on this computer, the local network and Tailscale; choosing one fills the
 * connection form's server and port.
 */
export function ServerSearch({ servers, status, current, busy, onSearch, onChoose, t }: {
  servers: FiscalcfdiSqlServer[] | undefined
  status: Status
  current: { server: string; port: number }
  busy: boolean
  onSearch: () => void
  onChoose: (server: FiscalcfdiSqlServer) => void
  t: T
}) {
  return <div className={css.block}>
    <h3 className={css.subtitle}>{t('sql.find.title')}</h3>
    <p className={css.muted}>{t('sql.find.hint')}</p>
    {servers !== undefined && servers.length > 0 && <ul className={css.servers}>
      {servers.map((server) => {
        const using = server.server === current.server && server.port === current.port
        const problem = server.port === null ? t('sql.find.noTcp') : server.reachable ? undefined : t('sql.find.closed', { port: server.port })
        return <li key={`${server.server}/${server.instance}`} className={css.server}>
          <div className={css.serverText}>
            <span className={css.serverName}>
              {server.name} · {server.instance}
              {server.instance.toUpperCase() === 'COMPAC' && <Tag tone="info">{t('sql.find.contpaqi')}</Tag>}
              <Tag tone="neutral">{t(ORIGIN[server.origin])}</Tag>
            </span>
            <span className={css.muted}>
              {server.server}{server.port === null ? '' : `:${server.port}`}
              {server.version === null ? '' : ` · ${t('sql.find.version', { version: server.version.split('.')[0] ?? server.version })}`}
            </span>
            {problem !== undefined && <span className={css.warning}>{problem}</span>}
          </div>
          <button type="button" className={css.secondary} disabled={busy || server.port === null || using}
            onClick={() => { onChoose(server) }}>{using ? t('sql.find.inUse') : t('sql.find.use')}</button>
        </li>
      })}
    </ul>}
    {servers?.length === 0 && <p className={css.warning}>{t('sql.find.none')}</p>}
    <div className={css.actions}>
      <button type="button" className={css.secondary} disabled={busy} onClick={onSearch}>
        {servers === undefined ? t('sql.find.run') : t('sql.find.again')}
      </button>
    </div>
    <StatusLine status={status} />
  </div>
}

/** Create the read-only login with the SQL Server administrator, used once and never saved. */
export function ReaderCreate({ target, busy, onCreate, t }: {
  target: { server: string; port: number }
  busy: boolean
  onCreate: (request: FiscalcfdiSqlReaderRequest) => Promise<FiscalcfdiSqlReader>
  t: T
}) {
  const [adminUser, setAdminUser] = useState('sa')
  const [adminPassword, setAdminPassword] = useState('')
  const [status, setStatus] = useState<Status>()
  const ready = target.server.trim() !== '' && adminUser.trim() !== '' && adminPassword !== ''
  const create = async () => {
    setStatus({ tone: 'busy', text: t('sql.reader.creating') })
    try {
      const result = await onCreate({ server: target.server, port: target.port, adminUser, adminPassword })
      setAdminPassword('')
      setStatus({ tone: 'ok', text: t('sql.reader.created', { user: result.user, count: result.databases }) })
    } catch (error) {
      setStatus({ tone: 'error', text: message(error) })
    }
  }
  const working = busy || status?.tone === 'busy'
  return <form className={css.block} onSubmit={(event) => { event.preventDefault(); if (ready && !working) void create() }}>
    <h3 className={css.subtitle}>{t('sql.reader.title')}</h3>
    <p className={css.muted}>{t('sql.reader.hint')}</p>
    <div className={css.pair}>
      <label className={css.field}>
        <span>{t('sql.reader.adminUser')}</span>
        <input value={adminUser} autoComplete="off" spellCheck={false} disabled={working}
          onChange={(event) => { setAdminUser(event.target.value); setStatus(undefined) }} />
      </label>
      <label className={css.field}>
        <span>{t('sql.reader.adminPassword')}</span>
        <input type="password" value={adminPassword} autoComplete="off" disabled={working}
          onChange={(event) => { setAdminPassword(event.target.value); setStatus(undefined) }} />
      </label>
    </div>
    {target.server.trim() === '' && <p className={css.muted}>{t('sql.reader.needServer')}</p>}
    <div className={css.actions}>
      <button type="submit" className={css.primary} disabled={!ready || working}>{t('sql.reader.create')}</button>
    </div>
    <StatusLine status={status} />
  </form>
}

/**
 * Step-by-step instructions for the CONTPAQi computer, with the read-only login script for SQL Server
 * Management Studio; generating the script writes its login and password into the connection form.
 */
export function ManualGuide({ busy, onScript, t }: {
  busy: boolean
  onScript: () => Promise<FiscalcfdiSqlScript>
  t: T
}) {
  const [script, setScript] = useState<FiscalcfdiSqlScript | undefined>()
  const [status, setStatus] = useState<Status>()
  const generate = async () => {
    setStatus({ tone: 'busy', text: t('sql.guide.user.generating') })
    try {
      const result = await onScript()
      setScript(result)
      setStatus({ tone: 'ok', text: t('sql.guide.user.filled', { user: result.user }) })
    } catch (error) {
      setStatus({ tone: 'error', text: message(error) })
    }
  }
  const steps = ['tcp', 'firewall', 'network'] as const
  return <details className={css.guide}>
    <summary>{t('sql.guide.title')}</summary>
    <p className={css.muted}>{t('sql.guide.intro')}</p>
    <ol className={css.steps}>
      {steps.map(step => <li key={step}>
        <strong>{t(`sql.guide.${step}.title`)}</strong>
        <p>{t(`sql.guide.${step}.body`)}</p>
      </li>)}
      <li>
        <strong>{t('sql.guide.user.title')}</strong>
        <p>{t('sql.guide.user.body')}</p>
        {script !== undefined && <CodeBlock code={script.script} lang="sql" copyLabel={t('sql.guide.copy')} copiedLabel={t('sql.guide.copied')} />}
        <div className={css.actions}>
          <button type="button" className={css.secondary} disabled={busy || status?.tone === 'busy'} onClick={() => { void generate() }}>
            {script === undefined ? t('sql.guide.user.generate') : t('sql.guide.user.again')}
          </button>
        </div>
        <StatusLine status={status} />
      </li>
      <li>
        <strong>{t('sql.guide.save.title')}</strong>
        <p>{t('sql.guide.save.body')}</p>
      </li>
    </ol>
    <p className={css.muted}>{t('sql.guide.newCompany')}</p>
  </details>
}
