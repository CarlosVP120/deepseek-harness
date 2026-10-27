import { useCallback, useEffect, useState } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { ClaudeCodeLogin, ClaudeCodeStatus } from '@deepseek-ai/dsh-fiscalcfdi-tools/types'
import type { NS } from './locales.ts'
import css from './sql.module.css'

/** Claude Code calls the section receives from the plugin; each rejects with the Host's message. */
export interface ClaudeSectionInjected {
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

type Props = PropsRuntime<'settings.section'> & PropsLocale<typeof NS> & InjectFace<ClaudeSectionInjected>

type Busy = 'check' | 'install' | 'login' | 'code' | 'logout' | 'use' | undefined

/** Claude models offered for the chat, by the aliases Claude Code resolves. */
const MODELS = ['opus', 'sonnet', 'haiku'] as const

function message(error: unknown): string {
  return error instanceof Error ? error.message : typeof error === 'object' && error !== null && 'message' in error
    ? String((error).message) : String(error)
}

/** While a sign-in is open, how often the section checks whether it finished in the browser. */
const POLL_MS = 3000

/**
 * Settings page that connects the user's Claude subscription: install Claude Code, start its own sign-in,
 * accept the code the Claude page may show, and sign out. The account's credentials never pass through it.
 */
export function ClaudeSection({ claudeStatus, claudeInstall, claudeLogin, claudeLoginCode, claudeLogout, claudeUse, t }: Props) {
  const [status, setStatus] = useState<ClaudeCodeStatus | undefined>()
  const [busy, setBusy] = useState<Busy>('check')
  const [error, setError] = useState<string | undefined>()
  const [login, setLogin] = useState<ClaudeCodeLogin | undefined>()
  const [code, setCode] = useState('')
  const [model, setModel] = useState<string>('opus')
  const act = useCallback(async (kind: Busy, action: () => Promise<ClaudeCodeStatus | undefined>) => {
    setBusy(kind)
    setError(undefined)
    try {
      const next = await action()
      if (next !== undefined) setStatus(next)
      if (next?.loggedIn === true) setLogin(undefined)
    } catch (failure) {
      setError(message(failure))
    } finally {
      setBusy(undefined)
    }
  }, [])
  useEffect(() => { void act('check', claudeStatus) }, [act, claudeStatus])
  // The sign-in usually finishes in the browser; the status says when.
  useEffect(() => {
    if (login === undefined) return
    const timer = setInterval(() => {
      claudeStatus().then((next) => {
        if (!next.loggedIn) return
        setStatus(next)
        setLogin(undefined)
      }, () => undefined)
    }, POLL_MS)
    return () => { clearInterval(timer) }
  }, [login, claudeStatus])

  const connect = () => act('login', async () => {
    setCode('')
    setLogin(await claudeLogin())
    return undefined
  })
  const subscription = status?.method === 'claude.ai'
  const plan = status?.plan === null || status?.plan === undefined ? '' : status.plan.charAt(0).toUpperCase() + status.plan.slice(1)

  return <section className={css.section} data-fiscalcfdi-claude="">
    <h2 className={css.title}>{t('claude.title')}</h2>
    <p className={css.intro}>{t('claude.intro')}</p>

    <div className={css.block}>
      {status === undefined && <p className={css.muted} role="status">{t('claude.checking')}</p>}
      {status?.installed === false && <>
        <p className={css.muted}>{busy === 'install' ? t('claude.installing') : t('claude.missing')}</p>
        <div className={css.actions}>
          <button type="button" className={css.primary} disabled={busy !== undefined} onClick={() => { void act('install', claudeInstall) }}>
            {t('claude.install')}</button>
        </div>
      </>}
      {status?.installed === true && !status.loggedIn && login === undefined && <>
        <p className={css.muted}>{t('claude.signedOut', { version: status.version ?? '' })}</p>
        <div className={css.actions}>
          <button type="button" className={css.primary} disabled={busy !== undefined} onClick={() => { void connect() }}>
            {busy === 'login' ? t('claude.opening') : t('claude.connect')}</button>
        </div>
      </>}
      {status?.installed === true && !status.loggedIn && login !== undefined && <>
        <p className={css.muted} role="status">{t('claude.waiting')}</p>
        {login.url !== null && <p className={css.muted}><a href={login.url} target="_blank" rel="noreferrer">{t('claude.reopen')}</a></p>}
        <form className={css.form} onSubmit={(event) => {
          event.preventDefault()
          if (code.trim() !== '' && busy === undefined) void act('code', () => claudeLoginCode(code))
        }}>
          <label className={`${css.field} ${css.wideField}`}>
            <span>{t('claude.code')}</span>
            <input value={code} autoComplete="off" spellCheck={false} disabled={busy !== undefined} onChange={(event) => { setCode(event.target.value) }} />
          </label>
          <div className={css.actions}>
            <button type="button" className={css.secondary} disabled={busy !== undefined} onClick={() => { setLogin(undefined) }}>{t('claude.cancel')}</button>
            <button type="submit" className={css.primary} disabled={code.trim() === '' || busy !== undefined}>{t('claude.sendCode')}</button>
          </div>
        </form>
      </>}
      {status?.loggedIn === true && <>
        <p className={subscription ? css.ok : css.error} role="status">
          {subscription ? `${t('claude.connected', { email: status.email ?? '' })}${plan === '' ? '' : ` · ${t('claude.plan', { plan })}`}` : t('claude.apiKey')}
        </p>
        {subscription && <p className={css.muted}>{t('claude.useHint')}</p>}
        <div className={css.actions}>
          <button type="button" className={css.secondary} disabled={busy !== undefined} onClick={() => { void act('logout', claudeLogout) }}>
            {t('claude.disconnect')}</button>
        </div>
      </>}
      {status?.loggedIn === true && subscription && <div className={css.block}>
        <h3 className={css.subtitle}>{t('claude.modelTitle')}</h3>
        <p className={status.active === null ? css.muted : css.ok} role="status">
          {status.active === null ? t('claude.inactive') : t('claude.active', { model: t(`claude.model.${status.active}` as 'claude.model.opus').split(' — ')[0] ?? status.active })}
        </p>
        <div className={css.choices} role="radiogroup" aria-label={t('claude.modelTitle')}>
          {MODELS.map(id => <label key={id} className={css.choice}>
            <input type="radio" name="claude-model" value={id} checked={(status.active ?? model) === id} disabled={busy !== undefined}
              onChange={() => { setModel(id); if (status.active !== null) void act('use', () => claudeUse(id)) }} />
            <span>{t(`claude.model.${id}`)}</span>
          </label>)}
        </div>
        <p className={css.muted}>{t('claude.limitHint')}</p>
        <div className={css.actions}>
          {status.active === null
            ? <button type="button" className={css.primary} disabled={busy !== undefined} onClick={() => { void act('use', () => claudeUse(model)) }}>{t('claude.use')}</button>
            : <button type="button" className={css.secondary} disabled={busy !== undefined} onClick={() => { void act('use', () => claudeUse(null)) }}>{t('claude.stop')}</button>}
        </div>
      </div>}
      {error !== undefined && <p className={css.error}>{error}</p>}
      {status !== undefined && <div className={css.actions}>
        <button type="button" className={css.secondary} disabled={busy !== undefined} onClick={() => { void act('check', claudeStatus) }}>
          {t('claude.refresh')}</button>
      </div>}
    </div>
  </section>
}
