/** The Peer one signed-in account speaks for. */

import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { createScope, type Scope } from '@deepseek-ai/dsh-scope'
import type { PeerId, PeerScope } from '@deepseek-ai/dsh-typert-protocol'
import type { AccountView } from './types.ts'

/**
 * One account's scope on the Host, shared by all its signed-in browsers.
 * Disposing it closes every stream those browsers hold, as when the account
 * changes password or is disabled.
 */
export class AccountPeer implements PeerScope {
  readonly id: PeerId = randomUUID() as PeerId
  readonly ctx: Context
  private readonly scope: Scope

  /**
   * @param owner - accounts plugin context the scope hangs under.
   * @param account - the signed-in account.
   * @param home - the account's own folder.
   */
  constructor(owner: Context, readonly account: AccountView, readonly home: string) {
    this.scope = createScope(owner, this)
    this.ctx = this.scope.ctx
  }

  /** Tear down every registration made through `ctx`; racing calls share one completion. */
  dispose(): Promise<void> {
    return this.scope.dispose()
  }
}
