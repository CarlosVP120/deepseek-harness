/** Account values shared by the Host plugin and the Web client's account menu. */

import type { Branded } from '@deepseek-ai/dsh-brand'

/** Opaque identity of one account. */
export type AccountId = Branded<'EqidisAccountId'>

/** `admin` manages accounts and sees every project; `user` sees only the projects in their own folder. */
export type AccountRole = 'admin' | 'user'

/** One account without its password hash. */
export interface AccountView {
  readonly id: AccountId
  /** Sign-in name; also the name of the person's folder under the Host's homes root. */
  readonly username: string
  /** Display name. */
  readonly name: string
  readonly role: AccountRole
  readonly disabled: boolean
  /** Epoch milliseconds. */
  readonly createdAt: number
}

/** The answer of `GET /api/accounts/me`: who the browser is signed in as. */
export interface AccountMe {
  readonly username: string
  readonly name: string
  readonly role: AccountRole
  /** The person's own folder, where their projects live. */
  readonly home: string
}
