import { useEffect, useRef, useState } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { AccountMe } from '@deepseek-ai/dsh-eqidis-accounts/types'
import type { NS } from './locales.ts'
import css from './eqidis.module.css'

type Props = PropsRuntime<'sidebar.footer.action'> & PropsLocale<typeof NS>

/** Path of the Host's who-am-I endpoint, relative to the application's base URL. */
const ME_PATH = 'api/accounts/me'

/** Who the browser is signed in as; `null` on a Host without accounts. */
async function loadMe(): Promise<AccountMe | null> {
  const response = await fetch(new URL(ME_PATH, document.baseURI), { credentials: 'same-origin', cache: 'no-store' })
  return response.ok ? await response.json() as AccountMe : null
}

function initials(name: string): string {
  return name.split(/\s+/u).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase() ?? '').join('')
}

/**
 * The signed-in person at the sidebar foot, on a Host shared through accounts:
 * their name and a menu to their account page, the user administration
 * (administrators), and sign-out. Renders nothing on a Host without accounts.
 */
export function AccountMenu({ wide, t }: Props) {
  const [me, setMe] = useState<AccountMe | null>(null)
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let current = true
    loadMe().then((value) => { if (current) setMe(value) }, () => { if (current) setMe(null) })
    return () => { current = false }
  }, [])
  useEffect(() => {
    if (!open) return
    const close = (event: Event) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !root.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])
  if (me === null) return null
  const base = document.baseURI
  return <div ref={root} className={css.account} data-eqidis-account="">
    {open && <div className={css.accountMenu} role="menu">
      <div className={css.accountWho}>
        <span className={css.accountName}>{me.name}</span>
        <span className={css.muted}>{me.username} · {t(me.role === 'admin' ? 'account.admin' : 'account.user')}</span>
      </div>
      <a role="menuitem" className={css.accountItem} href={new URL('cuenta', base).href}>{t('account.myAccount')}</a>
      {me.role === 'admin' && <a role="menuitem" className={css.accountItem} href={new URL('cuentas', base).href}>{t('account.users')}</a>}
      <form method="post" action={new URL('logout', base).href} className={css.accountForm}>
        <button role="menuitem" type="submit" className={css.accountItem}>{t('account.signOut')}</button>
      </form>
    </div>}
    <button type="button" className={css.accountTrigger} data-wide={wide} aria-haspopup="menu" aria-expanded={open}
      aria-label={t('account.menu', { name: me.name })} title={wide ? undefined : me.name} onClick={() => { setOpen(value => !value) }}>
      <span className={css.accountAvatar} aria-hidden="true">{initials(me.name)}</span>
      {wide && <span className={css.accountName}>{me.name}</span>}
    </button>
  </div>
}
