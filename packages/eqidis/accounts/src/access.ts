/**
 * The `peerAccess` policy of a shared Host: a person sees and reaches only the
 * Sessions and Workspaces inside their own folder; administrators and the
 * in-process operator reach everything. Host-wide administration (settings
 * changes, credentials, plugins, terminals, native opening) is administrators'.
 */

import { resolve, sep } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-query'
import type {} from '@deepseek-ai/dsh-workspace'
import { RemoteError, type PeerAccess, type PeerAccessCall, type PeerScope } from '@deepseek-ai/dsh-typert-protocol'
import { AccountPeer } from './peer.ts'

/** Endpoints only administrators may call: they change the Host for everyone or act on the server itself. */
const ADMIN_ENDPOINTS: ReadonlySet<string> = new Set([
  'settings/update', 'settings/replace', 'settings/mutate', 'settings/openSettingsDocument',
  'credentials/set', 'credentials/unset',
  'pluginManager/setVersionExemption', 'pluginManager/setPluginEnabled', 'pluginManager/setBundleEnabled',
  'pluginManager/installBundle', 'pluginManager/cancelInstall', 'pluginManager/removeBundle',
  'dynamicCordisRunner/runHostHalf', 'dynamicCordisRunner/invoke', 'dynamicCordisRunner/resolveRequestRun',
  'dynamicCordisRunner/settleUserRun', 'dynamicCordisRunner/undefineFromPanel', 'dynamicCordisRunner/stopFromPanel',
  'account/startSignIn', 'account/cancelSignIn', 'account/signOut',
  'session/openWorkspacePath', 'session/workspacePathApplications',
  'directoryPicker/pick',
])

/** Namespaces only administrators may call at all. */
const ADMIN_NAMESPACES: ReadonlySet<string> = new Set(['terminal'])

/** Endpoints whose `path` or `cwd` argument names a directory on the server that must lie in the caller's folder. */
const PATH_ENDPOINTS: ReadonlySet<string> = new Set([
  'workspace/create', 'session/create', 'directoryPicker/list', 'directoryPicker/createDirectory',
])

/** Fetch routes that act on the server's own desktop. */
const ADMIN_FETCH_PATHS: ReadonlySet<string> = new Set(['/api/present.open', '/api/changes.open'])

const SESSION_KEYS: ReadonlySet<string> = new Set(['sessionId', 'agentId', 'parentSessionId'])
const MAX_ARGUMENT_DEPTH = 4
const SESSION_REFRESH_MS = 2000

function forbidden(message: string): RemoteError<'access/forbidden'> {
  return new RemoteError('access/forbidden', message, {})
}

/** Every string under one of `keys` in a wire argument tree, to a bounded depth. */
function collect(value: unknown, keys: ReadonlySet<string>, found: string[], depth = 0): string[] {
  if (depth > MAX_ARGUMENT_DEPTH || value === null || typeof value !== 'object') return found
  if (Array.isArray(value)) {
    for (const item of value) collect(item, keys, found, depth + 1)
    return found
  }
  for (const [key, item] of Object.entries(value)) {
    if (keys.has(key) && typeof item === 'string') found.push(item)
    else collect(item, keys, found, depth + 1)
  }
  return found
}

/**
 * Whether a path lies in a folder, after resolving `..` segments.
 * @param path - absolute path to test.
 * @param folder - absolute folder.
 * @returns whether the path is the folder or below it.
 */
export function inside(path: string, folder: string): boolean {
  const target = resolve(path)
  return target === folder || target.startsWith(folder.endsWith(sep) ? folder : folder + sep)
}

/** The `peerAccess` provider for signed-in accounts. */
export class AccountAccess implements PeerAccess {
  /** Session directories learned from live Sessions, Workspaces, and the Session index. */
  private readonly sessionDirectories = new Map<string, string | undefined>()
  private lastRefresh = 0
  private refreshing: Promise<void> | undefined

  /** @param ctx - Host context carrying the Session, Session-query, and Workspace services. */
  constructor(private readonly ctx: Context) {}

  /** The account a Peer speaks for; undefined for the operator, who reaches everything. */
  private restricted(peer: PeerScope): AccountPeer | undefined {
    return peer instanceof AccountPeer && peer.account.role !== 'admin' ? peer : undefined
  }

  async authorize(call: PeerAccessCall): Promise<void> {
    const peer = this.restricted(call.peer)
    if (peer === undefined) return
    const endpoint = `${call.namespace}/${call.method}`
    if (ADMIN_NAMESPACES.has(call.namespace) || ADMIN_ENDPOINTS.has(endpoint)) {
      throw forbidden(`${endpoint} is reserved to administrators`)
    }
    if (PATH_ENDPOINTS.has(endpoint)) {
      for (const path of collect(call.args, new Set(['path', 'cwd']), [])) {
        if (!inside(path, peer.home)) throw forbidden(`${path} is outside your folder`)
      }
      if (endpoint === 'session/create' && collect(call.args, new Set(['workspaceId', 'cwd']), []).length === 0) {
        throw forbidden('a new conversation needs a project in your folder')
      }
    }
    for (const workspaceId of collect(call.args, new Set(['workspaceId']), [])) {
      if (!this.visible(peer, this.ctx.get('workspaceRegistry')?.get(workspaceId as never)?.path)) {
        throw forbidden(`project ${workspaceId} is not yours`)
      }
    }
    for (const sessionId of collect(call.args, SESSION_KEYS, [])) {
      if (await this.sessionVisible(peer, sessionId)) continue
      // Creation may name the identity of a Session that does not exist yet.
      if (endpoint === 'session/create' && !this.sessionDirectories.has(sessionId)) continue
      throw forbidden(`conversation ${sessionId} is not yours`)
    }
  }

  async authorizeFetch(request: Request, peer: PeerScope): Promise<boolean> {
    const account = this.restricted(peer)
    if (account === undefined) return true
    const url = new URL(request.url)
    if (ADMIN_FETCH_PATHS.has(url.pathname)) return false
    const path = url.searchParams.get('path')
    if (url.pathname === '/api/file' && (path === null || !inside(path, account.home))) return false
    const sessionId = url.searchParams.get('sessionId')
    return sessionId === null || await this.sessionVisible(account, sessionId)
  }

  visible(peer: PeerScope, path: string | undefined): boolean {
    const account = this.restricted(peer)
    return account === undefined || (path !== undefined && inside(path, account.home))
  }

  visibleSession(peer: PeerScope, sessionId: string): boolean {
    const account = this.restricted(peer)
    return account === undefined || this.visible(account, this.directoryOf(sessionId))
  }

  home(peer: PeerScope): string | undefined {
    return peer instanceof AccountPeer ? peer.home : undefined
  }

  /** Visibility after refreshing the Session index once for a Session not known yet. */
  private async sessionVisible(peer: AccountPeer, sessionId: string): Promise<boolean> {
    if (!this.sessionDirectories.has(sessionId) && this.directoryOf(sessionId) === undefined) await this.refresh()
    return this.visibleSession(peer, sessionId)
  }

  /** A Session's directory from its live header, its Workspace, or the last Session index read. */
  private directoryOf(sessionId: string): string | undefined {
    const live = this.ctx.get('sessions')?.get(sessionId as never)
    if (live !== undefined) {
      const parent = live.header.parentSession
      const cwd = live.header.cwd ?? (parent === undefined ? undefined : this.directoryOf(parent))
      this.sessionDirectories.set(sessionId, cwd)
      return cwd
    }
    if (this.sessionDirectories.has(sessionId)) return this.sessionDirectories.get(sessionId)
    for (const workspace of this.ctx.get('workspaceRegistry')?.list() ?? []) {
      if (workspace.sessionIds.some(id => id === sessionId)) {
        this.sessionDirectories.set(sessionId, workspace.path)
        return workspace.path
      }
    }
    return undefined
  }

  /** Re-read the Session index, at most once per {@link SESSION_REFRESH_MS}; concurrent callers share one read. */
  private refresh(): Promise<void> {
    if (this.refreshing !== undefined) return this.refreshing
    if (Date.now() - this.lastRefresh < SESSION_REFRESH_MS) return Promise.resolve()
    const query = this.ctx.get('sessionQuery')
    if (query === undefined) return Promise.resolve()
    this.refreshing = query.listSessions().then((records) => {
      for (const record of records) {
        const parent = record.header.parentSession
        this.sessionDirectories.set(record.header.id, record.header.cwd
          ?? (parent === undefined ? undefined : this.sessionDirectories.get(parent)))
      }
    }).finally(() => {
      this.lastRefresh = Date.now()
      this.refreshing = undefined
    })
    return this.refreshing
  }
}
