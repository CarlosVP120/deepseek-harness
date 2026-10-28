/** Reconnect-safe Workspace baseline and increment producer. */

import type { Context } from '@deepseek-ai/cordis'
import { Deque } from '@deepseek-ai/dsh-deque'
import type { DomainChanged } from '@deepseek-ai/dsh-storage-domain'
import type { Workspace, WorkspaceRecord } from '@deepseek-ai/dsh-workspace'
import {
  workspaceDomainState,
  workspaceRecord,
  WorkspaceId,
} from '@deepseek-ai/dsh-workspace'
import type {
  WorkspaceBaseline,
  WorkspaceFollowFrame,
  WorkspaceView,
} from './types.ts'

/**
 * Project one authoritative Workspace entity into its Remote value.
 * @param workspace - authoritative registry entity.
 * @returns detached Workspace projection for Remote consumers.
 */
export function workspaceView(workspace: Workspace): WorkspaceView {
  return {
    workspaceId: workspace.id,
    path: workspace.path,
    title: workspace.title,
    sessionIds: [...workspace.sessionIds],
    createdAt: workspace.createdAt,
    updatedAt: workspace.updatedAt,
  }
}

function changedWorkspaceView(workspaceId: string, value: unknown): WorkspaceView {
  const record: WorkspaceRecord = workspaceRecord.parse(value)
  return {
    workspaceId: WorkspaceId(workspaceId),
    path: record.path,
    title: record.title,
    sessionIds: [...record.sessionIds],
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }
}

/** Which Workspaces and Sessions one follow generation may show. */
export interface WorkspaceAudience {
  /** @returns whether the follower may see the Workspace rooted at `path`. */
  readonly workspace: (path: string) => boolean
  /** @returns whether the follower may see the Session. */
  readonly session: (sessionId: string) => boolean
}

/** One frame as an audience may see it; `undefined` when it shows nothing the audience may see. */
function frameFor(
  frame: WorkspaceFollowFrame,
  audience: WorkspaceAudience,
  pathOf: (workspaceId: string) => string | undefined,
): WorkspaceFollowFrame | undefined {
  switch (frame.type) {
    case 'baseline':
      return {
        type: 'baseline',
        value: {
          items: frame.value.items.filter(item => audience.workspace(item.path)),
          archivedSessionIds: frame.value.archivedSessionIds.filter(id => audience.session(id)),
          pinnedSessionIds: frame.value.pinnedSessionIds.filter(id => audience.session(id)),
        },
      }
    case 'upsert':
      return audience.workspace(frame.workspace.path) ? frame : undefined
    case 'remove':
      return frame
    case 'order':
      return { type: 'order', workspaceIds: frame.workspaceIds.filter((id) => {
        const path = pathOf(id)
        return path !== undefined && audience.workspace(path)
      }) }
    case 'archived':
      return { type: 'archived', archivedSessionIds: frame.archivedSessionIds.filter(id => audience.session(id)) }
    case 'pinned':
      return { type: 'pinned', pinnedSessionIds: frame.pinnedSessionIds.filter(id => audience.session(id)) }
    default:
      return assertNever(frame)
  }
}

function assertNever(value: never): never {
  throw new Error(`unexpected Workspace follow frame ${JSON.stringify(value)}`)
}

/** Owns Workspace domain observation and all active follow generations. */
export class WorkspaceFeed {
  private readonly followers = new Set<WorkspaceFollower>()
  private knownIds: Set<string>
  private order: readonly string[]
  private archived: readonly string[]
  private pinned: readonly string[]

  /** @param ctx - Host context containing the authoritative Workspace registry. */
  constructor(private readonly ctx: Context) {
    const baseline = ctx.workspaceRegistry.list()
    this.knownIds = new Set(baseline.map(workspace => String(workspace.id)))
    this.order = baseline.map(workspace => String(workspace.id))
    this.archived = ctx.workspaceRegistry.archivedSessionIds.map(String)
    this.pinned = ctx.workspaceRegistry.pinnedSessionIds.map(String)
    ctx.on('domain/changed', (change: DomainChanged) => { this.changed(change) })
    ctx.effect(() => () => {
      for (const follower of this.followers) follower.close()
      this.followers.clear()
    }, 'workspace-controller.feed')
  }

  /**
   * Read the complete current projection synchronously.
   * @returns all active Workspaces plus archived and pinned Session identities.
   */
  baseline(): WorkspaceBaseline {
    return {
      items: this.ctx.workspaceRegistry.list().map(workspaceView),
      archivedSessionIds: [...this.ctx.workspaceRegistry.archivedSessionIds],
      pinnedSessionIds: [...this.ctx.workspaceRegistry.pinnedSessionIds],
    }
  }

  /**
   * Open one generation beginning with a complete baseline.
   * @param signal - generation cancellation.
   * @param audience - which Workspaces and Sessions this generation may show; everything when omitted.
   * @returns baseline followed by ordered Workspace increments.
   */
  async *follow(signal: AbortSignal, audience?: WorkspaceAudience): AsyncIterable<WorkspaceFollowFrame> {
    signal.throwIfAborted()
    const follower = new WorkspaceFollower()
    this.followers.add(follower)
    const pathOf = (id: string): string | undefined => this.ctx.workspaceRegistry.get(WorkspaceId(id))?.path
    const shown = (frame: WorkspaceFollowFrame): WorkspaceFollowFrame | undefined =>
      audience === undefined ? frame : frameFor(frame, audience, pathOf)
    try {
      const baseline = shown({ type: 'baseline', value: this.baseline() })
      if (baseline !== undefined) yield baseline
      for await (const frame of follower.read(signal)) {
        const visible = shown(frame)
        if (visible !== undefined) yield visible
      }
    } finally {
      this.followers.delete(follower)
      follower.close()
    }
  }

  private changed(change: DomainChanged): void {
    if (change.domain !== 'workspace') return
    if (change.table === '') {
      if (change.operation !== 'put') return
      const state = workspaceDomainState.parse(change.value)
      const nextOrder = state.workspaceIds.map(String)
      const orderChanged = !sameStrings(this.order, nextOrder)
      for (const id of state.workspaceIds) {
        if (this.knownIds.has(id)) continue
        const workspace = this.ctx.workspaceRegistry.get(id)
        if (workspace === undefined) {
          throw new Error(`committed Workspace registry references missing Workspace "${id}"`)
        }
        this.knownIds.add(id)
        this.publish({ type: 'upsert', workspace: workspaceView(workspace) })
      }
      this.order = nextOrder
      if (orderChanged) this.publish({ type: 'order', workspaceIds: [...state.workspaceIds] })
      const nextArchived = state.archivedSessionIds.map(String)
      if (!sameStrings(this.archived, nextArchived)) {
        this.archived = nextArchived
        this.publish({ type: 'archived', archivedSessionIds: [...state.archivedSessionIds] })
      }
      const nextPinned = state.pinnedSessionIds.map(String)
      if (!sameStrings(this.pinned, nextPinned)) {
        this.pinned = nextPinned
        this.publish({ type: 'pinned', pinnedSessionIds: [...state.pinnedSessionIds] })
      }
      return
    }
    if (change.table !== 'workspaces') return
    if (change.operation === 'deleted') {
      if (!this.knownIds.delete(change.key)) return
      this.publish({ type: 'remove', workspaceId: WorkspaceId(change.key) })
      return
    }
    if (!this.knownIds.has(change.key)) return
    this.publish({
      type: 'upsert',
      workspace: changedWorkspaceView(change.key, change.value),
    })
  }

  private publish(frame: Exclude<WorkspaceFollowFrame, { readonly type: 'baseline' }>): void {
    for (const follower of this.followers) follower.push(frame)
  }
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

class WorkspaceFollower {
  private readonly frames = new Deque<WorkspaceFollowFrame>()
  private waiting: (() => void) | undefined
  private closed = false

  push(frame: WorkspaceFollowFrame): void {
    /* v8 ignore next -- closed followers are removed before later publication can reach them. */
    if (this.closed) return
    this.frames.pushBack(frame)
    this.waiting?.()
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    this.waiting?.()
  }

  async *read(signal: AbortSignal): AsyncIterable<WorkspaceFollowFrame> {
    while (!this.closed && !signal.aborted) {
      const frame = this.frames.popFront()
      if (frame !== undefined) {
        yield frame
        continue
      }
      await this.wait(signal)
    }
  }

  private wait(signal: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
      const finish = (): void => {
        signal.removeEventListener('abort', finish)
        /* v8 ignore next -- one read owns the sole installed wait callback. */
        if (this.waiting === finish) this.waiting = undefined
        resolve()
      }
      this.waiting = finish
      signal.addEventListener('abort', finish, { once: true })
      /* v8 ignore next -- native signals and the private queue cannot change during this synchronous setup. */
      if (signal.aborted || this.closed || this.frames.size > 0) finish()
    })
  }
}
