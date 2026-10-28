/**
 * Accounts for a Web Host shared by several people. Each person signs in with
 * a username and password, works in their own folder under `homesRoot`, and
 * sees only the projects and conversations inside it; administrators see
 * everything and manage the accounts. Mounting this plugin replaces the Web
 * launch-token sign-in with these accounts.
 * @module @deepseek-ai/dsh-eqidis-accounts
 */

import { randomBytes } from 'node:crypto'
import { mkdir, realpath } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { dirname, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-client-connection'
import type { ConnectionAuthenticator, ConnectionTrustRequest } from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { AccountAccess } from './access.ts'
import { SignInCookies, signingKey } from './cookie.ts'
import { accountsPage, ownAccountPage, setupClosedPage, setupPage, signInPage } from './pages.ts'
import { AccountPeer } from './peer.ts'
import { AccountError, AccountStore } from './store.ts'
import type { AccountMe, AccountView } from './types.ts'

export type { AccountId, AccountMe, AccountRole, AccountView } from './types.ts'

/** Stable Cordis plugin name. */
export const name = 'eqidis-accounts'

/** The Web server and Connection carry the sign-in pages and the authenticator. */
export const inject = ['connection', 'webServer']

/** Where accounts and people's folders live, and how long a sign-in lasts. */
export interface Config {
  /** Absolute path of the accounts file; the signing key is kept beside it. */
  accountsFile: string
  /** Absolute folder holding one folder per person, named by username. */
  homesRoot: string
  /** Days a sign-in lasts before the person must enter their password again. */
  signInDays?: number
  /** Send the sign-in cookie only over HTTPS; enable when a TLS proxy fronts the Host. */
  secureCookies?: boolean
}

export const Config: z<Config> = z.object({
  accountsFile: z.string().required(),
  homesRoot: z.string().required(),
  signInDays: z.natural().min(1).default(7),
  secureCookies: z.boolean().default(false),
})

/** Path of the JSON endpoint telling the Web client who is signed in. */
export const ME_PATH = '/api/accounts/me'
const MAX_FORM_BYTES = 16 * 1024
const MAX_FAILURES = 5
const LOCKOUT_MS = 5 * 60 * 1000

interface Failures { count: number; until: number }

function header(request: ConnectionTrustRequest, name: string): string | undefined {
  const value = request.headers instanceof Headers ? request.headers.get(name) ?? undefined : request.headers[name]
  return typeof value === 'string' ? value : undefined
}

/** A form post sent by this Host's own pages: same-origin, never a cross-site submission. */
function sameOrigin(req: IncomingMessage): boolean {
  const site = req.headers['sec-fetch-site']
  if (site !== undefined && site !== 'same-origin' && site !== 'none') return false
  const origin = req.headers.origin
  if (origin === undefined || origin === 'null') return origin === undefined || site === 'same-origin'
  try {
    return new URL(origin).host === req.headers.host
  } catch {
    // An unparsable Origin cannot match this Host.
    return false
  }
}

async function readForm(req: IncomingMessage): Promise<URLSearchParams | undefined> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    size += (chunk as Buffer).byteLength
    if (size > MAX_FORM_BYTES) return undefined
    chunks.push(chunk as Buffer)
  }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'))
}

function send(res: ServerResponse, status: number, html: string, headers: Record<string, string> = {}): void {
  res.writeHead(status, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'",
    'referrer-policy': 'same-origin',
    'x-content-type-options': 'nosniff',
    ...headers,
  })
  res.end(html)
}

function redirect(res: ServerResponse, location: string, headers: Record<string, string> = {}): void {
  res.writeHead(303, { 'cache-control': 'no-store', location, ...headers })
  res.end()
}

/**
 * Load the accounts, then register the sign-in authenticator, the access policy,
 * the sign-in and account pages, and the client's who-am-I endpoint.
 * @param ctx - Host plugin context.
 * @param config - resolved plugin config.
 */
export async function apply(ctx: Context, config: Config): Promise<void> {
  const store = await AccountStore.open(config.accountsFile)
  await mkdir(config.homesRoot, { recursive: true, mode: 0o750 })
  const homesRoot = await realpath(config.homesRoot)
  const cookies = new SignInCookies(
    await signingKey(join(dirname(config.accountsFile), 'sign-in.key')),
    config.signInDays ?? 7,
    config.secureCookies ?? false,
  )
  const homeOf = (account: AccountView): string => join(homesRoot, account.username)
  for (const account of store.list()) await mkdir(homeOf(account), { recursive: true, mode: 0o750 })

  const setupToken = randomBytes(24).toString('base64url')
  const peers = new Map<string, AccountPeer>()
  const failures = new Map<string, Failures>()
  ctx.effect(() => () => {
    for (const peer of peers.values()) void peer.dispose()
    peers.clear()
  }, 'eqidis-accounts: account Peers')

  const signedIn = (request: ConnectionTrustRequest): AccountPeer | undefined => {
    const signIn = cookies.read(header(request, 'cookie'))
    if (signIn === undefined) return undefined
    const account = store.get(signIn.accountId)
    if (account === undefined || account.disabled || store.sessionVersion(account.id) !== signIn.sessionVersion) return undefined
    let peer = peers.get(account.id)
    if (peer === undefined) {
      peer = new AccountPeer(ctx, account, homeOf(account))
      peers.set(account.id, peer)
    }
    return peer
  }
  /** End every stream an account holds, so a password change or disabling takes effect at once. */
  const endSignIns = (id: string): void => {
    const peer = peers.get(id)
    peers.delete(id)
    void peer?.dispose()
  }

  const authenticator: ConnectionAuthenticator = {
    peerOf: signedIn,
    rejectIndex: (_request, response) => {
      response.writeHead(303, { 'cache-control': 'no-store', location: 'login' })
      response.end()
    },
    launchUrl: baseUrl => store.empty ? new URL(`login?setup=${setupToken}`, baseUrl).href : baseUrl,
  }
  ctx.effect(() => ctx.connection.registerAuthenticator(authenticator), 'eqidis-accounts: authenticator')
  ctx.effect(() => ctx.provide('peerAccess', new AccountAccess(ctx)), 'eqidis-accounts: peerAccess')

  const locked = (key: string): boolean => (failures.get(key)?.until ?? 0) > Date.now()
  const fail = (key: string): void => {
    const current = failures.get(key)
    const count = (current?.until ?? 0) > 0 && (current?.until ?? 0) <= Date.now() ? 1 : (current?.count ?? 0) + 1
    failures.set(key, { count, until: count >= MAX_FAILURES ? Date.now() + LOCKOUT_MS : 0 })
  }

  const signInRoute = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const url = new URL(req.url ?? '/', 'http://eqidis.invalid')
    if (req.method === 'GET' || req.method === 'HEAD') {
      if (store.empty) {
        const token = url.searchParams.get('setup')
        send(res, token === setupToken ? 200 : 403, token === setupToken ? setupPage({ token }) : setupClosedPage())
        return
      }
      if (signedIn(req) !== undefined) { redirect(res, './'); return }
      send(res, 200, signInPage({}))
      return
    }
    if (req.method !== 'POST' || !sameOrigin(req)) { send(res, 403, signInPage({ error: 'Solicitud rechazada.' })); return }
    const form = await readForm(req)
    if (form === undefined) { send(res, 413, signInPage({ error: 'Solicitud demasiado grande.' })); return }
    const username = form.get('username') ?? ''
    const password = form.get('password') ?? ''
    if (store.empty) {
      const token = form.get('setup') ?? ''
      if (token !== setupToken) { send(res, 403, setupClosedPage()); return }
      const name = form.get('name') ?? ''
      if (password !== form.get('confirm')) {
        send(res, 400, setupPage({ token, username, name, error: 'Las contraseñas no coinciden.' }))
        return
      }
      try {
        const account = await store.create({ username, name, password, role: 'admin' })
        await mkdir(homeOf(account), { recursive: true, mode: 0o750 })
        ctx.logger('eqidis-accounts').info('created the first administrator, %s', account.username)
        redirect(res, './', { 'set-cookie': cookies.issue(account.id, store.sessionVersion(account.id) ?? 1) })
        return
      } catch (error: unknown) {
        if (!(error instanceof AccountError)) throw error
        send(res, 400, setupPage({ token, username, name, error: error.message }))
        return
      }
    }
    const key = `${username.trim().toLowerCase()}|${req.socket.remoteAddress ?? ''}`
    if (locked(key)) {
      send(res, 429, signInPage({ username, error: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.' }))
      return
    }
    const account = await store.verify(username, password)
    if (account === undefined) {
      fail(key)
      send(res, 401, signInPage({ username, error: 'Usuario o contraseña incorrectos.' }))
      return
    }
    failures.delete(key)
    redirect(res, './', { 'set-cookie': cookies.issue(account.id, store.sessionVersion(account.id) ?? 1) })
  }

  const signOutRoute = (req: IncomingMessage, res: ServerResponse): void => {
    if (req.method !== 'POST' || !sameOrigin(req)) { send(res, 405, signInPage({})); return }
    redirect(res, 'login', { 'set-cookie': cookies.clear() })
  }

  /** Run one account page for a signed-in person, sending strangers to the sign-in page. */
  const accountRoute = (
    handle: (req: IncomingMessage, res: ServerResponse, peer: AccountPeer) => Promise<void>,
  ) => async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const peer = signedIn(req)
    if (peer === undefined) { redirect(res, 'login'); return }
    if (req.method === 'POST' && !sameOrigin(req)) { send(res, 403, signInPage({ error: 'Solicitud rechazada.' })); return }
    await handle(req, res, peer)
  }

  const accountsRoute = accountRoute(async (req, res, peer) => {
    const current = store.get(peer.account.id) ?? peer.account
    if (current.role !== 'admin') { redirect(res, 'cuenta'); return }
    if (req.method !== 'POST') { send(res, 200, accountsPage(current, store.list(), {})); return }
    const form = await readForm(req)
    if (form === undefined) { send(res, 413, accountsPage(current, store.list(), { error: 'Solicitud demasiado grande.' })); return }
    const id = form.get('id') ?? ''
    try {
      let message: string
      switch (form.get('action')) {
        case 'create': {
          const role = form.get('role') === 'admin' ? 'admin' : 'user'
          const account = await store.create({
            username: form.get('username') ?? '', name: form.get('name') ?? '', password: form.get('password') ?? '', role,
          })
          await mkdir(homeOf(account), { recursive: true, mode: 0o750 })
          message = `Se creó la cuenta de ${account.name} (${account.username}). Su carpeta es ${homeOf(account)}.`
          break
        }
        case 'password':
          await store.setPassword(id, form.get('password') ?? '')
          endSignIns(id)
          message = `Se cambió la contraseña de ${store.get(id)?.username ?? ''}.`
          break
        case 'disable':
          await store.setDisabled(id, true)
          endSignIns(id)
          message = `Se desactivó la cuenta de ${store.get(id)?.username ?? ''}.`
          break
        case 'enable':
          await store.setDisabled(id, false)
          message = `Se activó la cuenta de ${store.get(id)?.username ?? ''}.`
          break
        default:
          throw new AccountError('Acción desconocida.')
      }
      if (id === current.id && form.get('action') === 'password') {
        redirect(res, 'login', { 'set-cookie': cookies.clear() })
        return
      }
      send(res, 200, accountsPage(current, store.list(), { message }))
    } catch (error: unknown) {
      if (!(error instanceof AccountError)) throw error
      send(res, 400, accountsPage(current, store.list(), { error: error.message }))
    }
  })

  const ownAccountRoute = accountRoute(async (req, res, peer) => {
    const current = store.get(peer.account.id) ?? peer.account
    if (req.method !== 'POST') { send(res, 200, ownAccountPage(current, peer.home, {})); return }
    const form = await readForm(req)
    const password = form?.get('password') ?? ''
    const refuse = (error: string): void => { send(res, 400, ownAccountPage(current, peer.home, { error })) }
    if (await store.verify(current.username, form?.get('current') ?? '') === undefined) {
      refuse('La contraseña actual no es correcta.')
      return
    }
    if (password !== form?.get('confirm')) { refuse('Las contraseñas nuevas no coinciden.'); return }
    try {
      await store.setPassword(current.id, password)
    } catch (error: unknown) {
      if (!(error instanceof AccountError)) throw error
      refuse(error.message)
      return
    }
    endSignIns(current.id)
    redirect(res, './', { 'set-cookie': cookies.issue(current.id, store.sessionVersion(current.id) ?? 1) })
  })

  const routes: [string, (req: IncomingMessage, res: ServerResponse) => void | Promise<void>][] = [
    ['/login', signInRoute], ['/logout', signOutRoute], ['/cuentas', accountsRoute], ['/cuenta', ownAccountRoute],
  ]
  for (const [path, handler] of routes) {
    ctx.effect(() => ctx.webServer.register({ kind: 'exact', path, handler }), `eqidis-accounts: ${path}`)
  }
  ctx.effect(() => ctx.connection.fetch.register({
    path: ME_PATH,
    methods: ['GET'],
    requestBody: 'buffered',
    fetch: (request) => {
      const peer = ctx.connection.peerOf(request)
      if (!(peer instanceof AccountPeer)) return Promise.resolve(new Response('not signed in', { status: 404 }))
      const account = store.get(peer.account.id) ?? peer.account
      const me: AccountMe = { username: account.username, name: account.name, role: account.role, home: peer.home }
      return Promise.resolve(Response.json(me, { headers: { 'cache-control': 'no-store' } }))
    },
  }), 'eqidis-accounts: who-am-I endpoint')
}
