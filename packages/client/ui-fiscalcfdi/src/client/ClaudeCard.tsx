import { useCallback, useEffect, useState } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-settings-models/client'
import type { ClaudeCodeLogin, ClaudeCodeStatus } from '@deepseek-ai/dsh-fiscalcfdi-tools/types'
import type { NS } from './locales.ts'
import css from './claude.module.css'

/** Claude Code calls the card receives from the plugin; each rejects with the Host's message. */
export interface ClaudeCardInjected {
  /** Whether Claude Code is installed and signed in. */
  claudeStatus: () => Promise<ClaudeCodeStatus>
  /** Install Claude Code with Anthropic's official installer. */
  claudeInstall: () => Promise<ClaudeCodeStatus>
  /** Start Claude Code's own sign-in in the browser. */
  claudeLogin: () => Promise<ClaudeCodeLogin>
  /** Hand the sign-in page's code to the waiting sign-in. */
  claudeLoginCode: (code: string) => Promise<ClaudeCodeStatus>
  /** Sign Claude Code out. */
  claudeLogout: () => Promise<ClaudeCodeStatus>
  /** Make a Claude model the chats' default, or null to go back to the previous model. */
  claudeUse: (model: string | null) => Promise<ClaudeCodeStatus>
}

type Props = PropsRuntime<'settings.models.cards'> & PropsLocale<typeof NS> & InjectFace<ClaudeCardInjected>

type Busy = 'check' | 'install' | 'login' | 'code' | 'logout' | undefined

function message(error: unknown): string {
  return error instanceof Error ? error.message : typeof error === 'object' && error !== null && 'message' in error
    ? String((error).message) : String(error)
}

/** While a sign-in is open, how often the card checks whether it finished in the browser. */
const POLL_MS = 3000
/** The model a new connection makes the chats' default; the chat's model picker changes it like any other. */
const FIRST_MODEL = 'opus'

/**
 * The Claude subscription as one more provider card on the Models page: install Claude Code, connect the
 * Claude account through Claude Code's own sign-in, and disconnect. Its models are chosen in the chat's
 * model picker like every provider's; connecting makes Claude the default for new chats, as an account
 * sign-in does, and disconnecting restores the model used before.
 */
export function ClaudeCard({ classes: c, claudeStatus, claudeInstall, claudeLogin, claudeLoginCode, claudeLogout, claudeUse, t }: Props) {
  const [status, setStatus] = useState<ClaudeCodeStatus | undefined>()
  const [busy, setBusy] = useState<Busy>('check')
  const [error, setError] = useState<string | undefined>()
  const [login, setLogin] = useState<ClaudeCodeLogin | undefined>()
  const [code, setCode] = useState('')
  const act = useCallback(async (kind: Busy, action: () => Promise<ClaudeCodeStatus | undefined>) => {
    setBusy(kind)
    setError(undefined)
    try {
      const next = await action()
      if (next !== undefined) setStatus(next)
    } catch (failure) {
      setError(message(failure))
    } finally {
      setBusy(undefined)
    }
  }, [])
  useEffect(() => { void act('check', claudeStatus) }, [act, claudeStatus])
  /** A sign-in that just finished: Claude becomes the chats' default unless it already is. */
  const connected = useCallback(async (next: ClaudeCodeStatus) => {
    setLogin(undefined)
    return next.method === 'claude.ai' && next.active === null ? claudeUse(FIRST_MODEL) : next
  }, [claudeUse])
  // The sign-in usually finishes in the browser; the status says when.
  useEffect(() => {
    if (login === undefined) return
    const timer = setInterval(() => {
      claudeStatus().then((next) => {
        if (next.loggedIn) void act('login', () => connected(next))
      }, () => undefined)
    }, POLL_MS)
    return () => { clearInterval(timer) }
  }, [login, claudeStatus, act, connected])

  const subscription = status?.loggedIn === true && status.method === 'claude.ai'
  const plan = status?.plan === null || status?.plan === undefined ? '' : status.plan.charAt(0).toUpperCase() + status.plan.slice(1)
  const disabled = busy !== undefined
  const hint = status === undefined ? t('claude.checking')
    : !status.installed ? (busy === 'install' ? t('claude.installing') : t('claude.missing'))
      : !status.loggedIn ? (login === undefined ? t('claude.signedOut') : t('claude.waiting'))
        : !subscription ? t('claude.apiKey')
          : [
            t('claude.connected', { email: status.email ?? '' }) + (plan === '' ? '' : ` · ${t('claude.plan', { plan })}`),
            status.active === null ? t('claude.inactive') : t('claude.active', { model: t(`claude.model.${status.active}` as 'claude.model.opus') }),
          ].join('. ')

  return <li className={c.card} data-fiscalcfdi-claude="">
    <div className={c.head}>
      <span className={c.identity}>
        <span className={c.name}>{t('claude.name')}</span>
        <span className={c.tag}>{t('claude.tag')}</span>
        {status !== undefined && <span className={`${c.dot} ${subscription ? c.dotConfigured : c.dotMissing}`} role="img"
          aria-label={subscription ? t('claude.dotConnected') : t('claude.dotMissing')} title={subscription ? t('claude.dotConnected') : t('claude.dotMissing')} />}
      </span>
      <span className={c.actions}>
        {status?.installed === false && <button type="button" className={c.secondaryButton} disabled={disabled}
          onClick={() => { void act('install', claudeInstall) }}>{t('claude.install')}</button>}
        {status?.installed === true && !status.loggedIn && login === undefined && <button type="button" className={c.secondaryButton} disabled={disabled}
          onClick={() => { void act('login', async () => { setCode(''); setLogin(await claudeLogin()); return undefined }) }}>
          {busy === 'login' ? t('claude.opening') : t('claude.connect')}</button>}
        {status?.loggedIn === true && <button type="button" className={c.dangerButton} disabled={disabled}
          onClick={() => {
            void act('logout', async () => {
              const out = await claudeLogout()
              return out.active === null ? out : claudeUse(null)
            })
          }}>{t('claude.disconnect')}</button>}
      </span>
    </div>
    <p className={c.hint}>{hint}</p>
    {status?.installed === true && !status.loggedIn && login !== undefined && <form className={c.editor} onSubmit={(event) => {
      event.preventDefault()
      if (code.trim() === '' || disabled) return
      void act('code', async () => {
        const next = await claudeLoginCode(code)
        return next.loggedIn ? connected(next) : next
      })
    }}>
      {login.url !== null && <a className={css.link} href={login.url} target="_blank" rel="noreferrer">{t('claude.reopen')}</a>}
      <input className={css.code} value={code} placeholder={t('claude.code')} aria-label={t('claude.code')} autoComplete="off" spellCheck={false}
        disabled={disabled} onChange={(event) => { setCode(event.target.value) }} />
      <span className={c.actions}>
        <button type="button" className={c.secondaryButton} disabled={disabled} onClick={() => { setLogin(undefined) }}>{t('claude.cancel')}</button>
        <button type="submit" className={c.primaryButton} disabled={code.trim() === '' || disabled}>{t('claude.sendCode')}</button>
      </span>
    </form>}
    {error !== undefined && <p className={c.error} role="alert">{error}</p>}
  </li>
}
