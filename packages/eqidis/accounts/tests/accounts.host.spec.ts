import { mkdtemp, readFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { OperatorPeer } from '@deepseek-ai/dsh-client-connection'
import { beforeEach, describe, expect, it } from 'vitest'
import { AccountAccess, inside } from '../src/access.ts'
import { COOKIE_NAME, SignInCookies, signingKey } from '../src/cookie.ts'
import { AccountPeer } from '../src/peer.ts'
import { AccountError, AccountStore } from '../src/store.ts'
import type { AccountView } from '../src/types.ts'

let dir: string
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'eqidis-accounts-')) })

const PASSWORD = 'contraseña-segura'

describe('account store', () => {
  it('keeps accounts in an owner-only file and checks passwords', async () => {
    const file = join(dir, 'cuentas.json')
    const store = await AccountStore.open(file)
    expect(store.empty).toBe(true)
    const admin = await store.create({ username: ' Ana ', name: 'Ana López', password: PASSWORD, role: 'admin' })
    expect(admin.username).toBe('ana')
    expect((await stat(file)).mode & 0o777).toBe(0o600)
    expect(await readFile(file, 'utf8')).not.toContain(PASSWORD)

    const reopened = await AccountStore.open(file)
    expect((await reopened.verify('ANA', PASSWORD))?.id).toBe(admin.id)
    expect(await reopened.verify('ana', 'otra-contraseña')).toBeUndefined()
    expect(await reopened.verify('nadie', PASSWORD)).toBeUndefined()
  })

  it('refuses invalid accounts and ends sign-ins on password change and disabling', async () => {
    const store = await AccountStore.open(join(dir, 'cuentas.json'))
    await expect(store.create({ username: 'a b', name: 'X', password: PASSWORD, role: 'user' })).rejects.toBeInstanceOf(AccountError)
    await expect(store.create({ username: 'juan', name: 'Juan', password: 'corta', role: 'user' })).rejects.toBeInstanceOf(AccountError)
    const admin = await store.create({ username: 'ana', name: 'Ana', password: PASSWORD, role: 'admin' })
    const juan = await store.create({ username: 'juan', name: 'Juan', password: PASSWORD, role: 'user' })
    await expect(store.create({ username: 'juan', name: 'Otro', password: PASSWORD, role: 'user' })).rejects.toBeInstanceOf(AccountError)

    await store.setPassword(juan.id, 'nueva-contraseña')
    expect(store.sessionVersion(juan.id)).toBe(2)
    expect(await store.verify('juan', PASSWORD)).toBeUndefined()
    await store.setDisabled(juan.id, true)
    expect(await store.verify('juan', 'nueva-contraseña')).toBeUndefined()
    await expect(store.setDisabled(admin.id, true)).rejects.toBeInstanceOf(AccountError)
  })

  it('applies concurrent changes without losing one', async () => {
    const store = await AccountStore.open(join(dir, 'cuentas.json'))
    await Promise.all(['uno', 'dos', 'tres'].map(username => store.create({ username, name: username, password: PASSWORD, role: 'user' })))
    expect((await AccountStore.open(join(dir, 'cuentas.json'))).list().map(account => account.username)).toEqual(['dos', 'tres', 'uno'])
  })
})

describe('sign-in cookie', () => {
  it('reads back what it issues and rejects forged or foreign cookies', async () => {
    const key = await signingKey(join(dir, 'sign-in.key'))
    expect(await signingKey(join(dir, 'sign-in.key'))).toEqual(key)
    const cookies = new SignInCookies(key, 7, true)
    const header = cookies.issue('account-1', 3)
    expect(header).toContain('HttpOnly')
    expect(header).toContain('Secure')
    const value = header.split(';')[0] as string
    expect(cookies.read(`other=1; ${value}`)).toMatchObject({ accountId: 'account-1', sessionVersion: 3 })
    const [body, signature] = value.slice(COOKIE_NAME.length + 1).split('.') as [string, string]
    const forged = Buffer.from(JSON.stringify({ v: 1, uid: 'account-2', sv: 3, iat: 0, exp: Date.now() + 1000 })).toString('base64url')
    expect(cookies.read(`${COOKIE_NAME}=${forged}.${signature}`)).toBeUndefined()
    const otherKey = new SignInCookies(await signingKey(join(dir, 'other.key')), 7, false)
    expect(otherKey.read(`${COOKIE_NAME}=${body}.${signature}`)).toBeUndefined()
    expect(cookies.read(undefined)).toBeUndefined()
  })
})

describe('account access', () => {
  const account = (role: AccountView['role']): AccountView => ({
    id: role as AccountView['id'], username: role, name: role, role, disabled: false, createdAt: 0,
  })

  function setup() {
    const root = new Context()
    const sessions = new Map([
      ['mine', { header: { id: 'mine', cwd: '/srv/usuarios/juan/Cliente A' } }],
      ['child', { header: { id: 'child', parentSession: 'mine' } }],
      ['theirs', { header: { id: 'theirs', cwd: '/srv/usuarios/ana/Cliente B' } }],
    ])
    const workspaces = [
      { id: 'w-mine', path: '/srv/usuarios/juan/Cliente A', sessionIds: ['cold-mine'] },
      { id: 'w-theirs', path: '/srv/usuarios/ana/Cliente B', sessionIds: [] },
    ]
    root.provide('sessions', { get: (id: string) => sessions.get(id) })
    root.provide('workspaceRegistry', { list: () => workspaces, get: (id: string) => workspaces.find(item => item.id === id) })
    root.provide('sessionQuery', { listSessions: () => Promise.resolve([]) })
    const access = new AccountAccess(root)
    const user = new AccountPeer(root, account('user'), '/srv/usuarios/juan')
    const admin = new AccountPeer(root, account('admin'), '/srv/usuarios/admin')
    const operator = new OperatorPeer(root)
    return { access, user, admin, operator }
  }

  it('shows a person only their own folder, Sessions, and Workspaces', () => {
    const { access, user, admin, operator } = setup()
    expect(access.visible(user, '/srv/usuarios/juan/Cliente A')).toBe(true)
    expect(access.visible(user, '/srv/usuarios/juan-otro')).toBe(false)
    expect(access.visible(user, undefined)).toBe(false)
    expect(access.visibleSession(user, 'mine')).toBe(true)
    expect(access.visibleSession(user, 'child')).toBe(true)
    expect(access.visibleSession(user, 'cold-mine')).toBe(true)
    expect(access.visibleSession(user, 'theirs')).toBe(false)
    expect(access.visibleSession(user, 'unknown')).toBe(false)
    expect(access.visibleSession(admin, 'theirs')).toBe(true)
    expect(access.visibleSession(operator, 'theirs')).toBe(true)
    expect(access.home(user)).toBe('/srv/usuarios/juan')
    expect(access.home(operator)).toBeUndefined()
  })

  it('refuses calls on other people\'s conversations and projects and on Host administration', async () => {
    const { access, user, admin } = setup()
    const call = (namespace: string, method: string, args: Record<string, unknown>, peer = user) =>
      access.authorize({ namespace, method, args, peer })
    await expect(call('session', 'prompt', { request: { sessionId: 'mine' } })).resolves.toBeUndefined()
    await expect(call('session', 'follow', { address: { sessionId: 'theirs' } })).rejects.toMatchObject({ code: 'access/forbidden' })
    await expect(call('goal', 'get', { agentId: 'theirs' })).rejects.toMatchObject({ code: 'access/forbidden' })
    await expect(call('workspace', 'getProjectContext', { request: { workspaceId: 'w-theirs' } })).rejects.toMatchObject({ code: 'access/forbidden' })
    await expect(call('workspace', 'create', { request: { path: '/srv/usuarios/ana/x' } })).rejects.toMatchObject({ code: 'access/forbidden' })
    await expect(call('workspace', 'create', { request: { path: '/srv/usuarios/juan/Nuevo' } })).resolves.toBeUndefined()
    await expect(call('session', 'create', { request: { workspaceId: 'w-mine', sessionId: 'brand-new' } })).resolves.toBeUndefined()
    await expect(call('session', 'create', { request: {} })).rejects.toMatchObject({ code: 'access/forbidden' })
    await expect(call('terminal', 'create', {})).rejects.toMatchObject({ code: 'access/forbidden' })
    await expect(call('credentials', 'set', {})).rejects.toMatchObject({ code: 'access/forbidden' })
    await expect(call('settings', 'describe', {})).resolves.toBeUndefined()
    await expect(call('terminal', 'create', {}, admin)).resolves.toBeUndefined()
  })

  it('refuses Fetch routes addressing other people\'s files or conversations', async () => {
    const { access, user } = setup()
    const fetch = (path: string) => access.authorizeFetch(new Request(`http://host${path}`), user)
    expect(await fetch('/api/file?path=/srv/usuarios/juan/Cliente%20A/a.png')).toBe(true)
    expect(await fetch('/api/file?path=/etc/passwd')).toBe(false)
    expect(await fetch('/api/session/uploadFileBinary?sessionId=mine')).toBe(true)
    expect(await fetch('/api/session/uploadFileBinary?sessionId=theirs')).toBe(false)
    expect(await fetch('/api/present.open?sessionId=mine')).toBe(false)
  })

  it('treats a path as inside a folder only below its separator', () => {
    expect(inside('/srv/a/b', '/srv/a')).toBe(true)
    expect(inside('/srv/a', '/srv/a')).toBe(true)
    expect(inside('/srv/ab', '/srv/a')).toBe(false)
    expect(inside('/srv/a/../b', '/srv/a')).toBe(false)
  })
})
