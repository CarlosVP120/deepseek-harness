/**
 * People who may sign in to a shared EQIDIS AI Host, kept in one JSON file
 * with scrypt password hashes. The file is the only record; every change
 * rewrites it atomically with owner-only permissions.
 */

import { randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import type { AccountId, AccountRole, AccountView } from './types.ts'

const FILE_VERSION = 1
const SCRYPT_COST = 16384
const SCRYPT_BLOCK = 8
const SCRYPT_PARALLEL = 1
const KEY_BYTES = 64
const SALT_BYTES = 16
/** Usernames double as folder names, so they stay lowercase ASCII words. */
const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{1,31}$/
/** Minimum password length accepted when creating or changing a password. */
export const MIN_PASSWORD_LENGTH = 10

/** One stored account, including its password hash. */
interface StoredAccount extends AccountView {
  readonly password: string
  /** Bumped on password change or disabling; a sign-in from an older version is refused. */
  readonly sessionVersion: number
}

interface StoredFile {
  readonly version: typeof FILE_VERSION
  readonly accounts: readonly StoredAccount[]
}

/** A request the store refuses, with a message the sign-in pages show as is. */
export class AccountError extends Error {}

function hash(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_BYTES, { N: SCRYPT_COST, r: SCRYPT_BLOCK, p: SCRYPT_PARALLEL }, (error, key) => {
      if (error === null) resolve(key)
      else reject(error)
    })
  })
}

async function encodePassword(password: string): Promise<string> {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new AccountError(`La contraseña debe tener al menos ${String(MIN_PASSWORD_LENGTH)} caracteres.`)
  }
  const salt = randomBytes(SALT_BYTES)
  const key = await hash(password, salt)
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`
}

async function passwordMatches(password: string, encoded: string): Promise<boolean> {
  const [scheme, salt, key] = encoded.split('$')
  if (scheme !== 'scrypt' || salt === undefined || key === undefined) return false
  const expected = Buffer.from(key, 'base64')
  const actual = await hash(password, Buffer.from(salt, 'base64'))
  return actual.byteLength === expected.byteLength && timingSafeEqual(actual, expected)
}

function view(account: StoredAccount): AccountView {
  const { id, username, name, role, disabled, createdAt } = account
  return { id, username, name, role, disabled, createdAt }
}

function parseFile(text: string, file: string): StoredFile {
  const parsed = JSON.parse(text) as Partial<StoredFile> | null
  if (parsed === null || parsed.version !== FILE_VERSION || !Array.isArray(parsed.accounts)) {
    throw new Error(`eqidis-accounts: ${file} is not an accounts file of version ${String(FILE_VERSION)}`)
  }
  return { version: FILE_VERSION, accounts: parsed.accounts }
}

/** The accounts file and the operations the sign-in and administration pages perform on it. */
export class AccountStore {
  private accounts: StoredAccount[]
  private writes: Promise<void> = Promise.resolve()

  private constructor(private readonly file: string, accounts: readonly StoredAccount[]) {
    this.accounts = [...accounts]
  }

  /**
   * Read the accounts file, or start empty when it does not exist yet.
   * @param file - absolute path of the accounts file.
   * @returns the loaded store.
   */
  static async open(file: string): Promise<AccountStore> {
    let text: string
    try {
      text = await readFile(file, 'utf8')
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return new AccountStore(file, [])
      throw error
    }
    return new AccountStore(file, parseFile(text, file).accounts)
  }

  /** Whether no account exists yet, so the first administrator must be created. */
  get empty(): boolean {
    return this.accounts.length === 0
  }

  /**
   * List every account.
   * @returns every account, administrators first, then by username.
   */
  list(): AccountView[] {
    return this.accounts.map(view).sort((left, right) =>
      left.role === right.role ? left.username.localeCompare(right.username) : left.role === 'admin' ? -1 : 1)
  }

  /**
   * Find one account.
   * @param id - account identity.
   * @returns the account, or undefined when none has the identity.
   */
  get(id: string): AccountView | undefined {
    const account = this.accounts.find(item => item.id === id)
    return account === undefined ? undefined : view(account)
  }

  /**
   * Read an account's session version.
   * @param id - account identity.
   * @returns the account's current session version, or undefined when none has the identity.
   */
  sessionVersion(id: string): number | undefined {
    return this.accounts.find(item => item.id === id)?.sessionVersion
  }

  /**
   * Check a username and password.
   * @param username - username as typed; compared lowercase.
   * @param password - password as typed.
   * @returns the enabled account they belong to, or undefined.
   */
  async verify(username: string, password: string): Promise<AccountView | undefined> {
    const account = this.accounts.find(item => item.username === username.trim().toLowerCase())
    if (account === undefined) {
      // Spend the same time on unknown usernames so timing does not reveal which exist.
      await hash(password, randomBytes(SALT_BYTES))
      return undefined
    }
    if (!await passwordMatches(password, account.password) || account.disabled) return undefined
    return view(account)
  }

  /**
   * Create an account.
   * @param request - username, display name, password, and role.
   * @returns the created account.
   */
  async create(request: { username: string; name: string; password: string; role: AccountRole }): Promise<AccountView> {
    const password = await encodePassword(request.password)
    return this.exclusive(async () => {
      const username = request.username.trim().toLowerCase()
      if (!USERNAME_PATTERN.test(username)) {
        throw new AccountError('El usuario debe tener de 2 a 32 caracteres: letras minúsculas, números, punto, guion o guion bajo.')
      }
      if (this.accounts.some(item => item.username === username)) throw new AccountError(`Ya existe el usuario «${username}».`)
      const name = request.name.trim()
      if (name === '') throw new AccountError('Escribe el nombre de la persona.')
      const account: StoredAccount = {
        id: randomUUID() as AccountId,
        username,
        name,
        role: request.role,
        disabled: false,
        createdAt: Date.now(),
        password,
        sessionVersion: 1,
      }
      await this.commit([...this.accounts, account])
      return view(account)
    })
  }

  /**
   * Replace an account's password and end its existing sign-ins.
   * @param id - account identity.
   * @param password - new password.
   */
  async setPassword(id: string, password: string): Promise<void> {
    const encoded = await encodePassword(password)
    await this.exclusive(() =>
      this.update(id, account => ({ ...account, password: encoded, sessionVersion: account.sessionVersion + 1 })))
  }

  /**
   * Enable or disable an account; disabling ends its existing sign-ins.
   * @param id - account identity.
   * @param disabled - whether the account may no longer sign in.
   */
  async setDisabled(id: string, disabled: boolean): Promise<void> {
    await this.exclusive(async () => {
      if (disabled && this.accounts.filter(item => item.role === 'admin' && !item.disabled && item.id !== id)
        .length === 0 && this.get(id)?.role === 'admin') {
        throw new AccountError('No se puede desactivar al único administrador activo.')
      }
      await this.update(id, account => ({ ...account, disabled, sessionVersion: account.sessionVersion + 1 }))
    })
  }

  private async update(id: string, change: (account: StoredAccount) => StoredAccount): Promise<void> {
    const index = this.accounts.findIndex(item => item.id === id)
    if (index === -1) throw new AccountError('La cuenta ya no existe.')
    const next = [...this.accounts]
    next[index] = change(next[index] as StoredAccount)
    await this.commit(next)
  }

  /** Run one read-modify-write after every earlier one settles, so concurrent changes never drop each other. */
  private exclusive<T>(run: () => Promise<T>): Promise<T> {
    const result = this.writes.then(run)
    this.writes = result.then(() => undefined, () => undefined)
    return result
  }

  private async commit(next: StoredAccount[]): Promise<void> {
    const body: StoredFile = { version: FILE_VERSION, accounts: next }
    await writeFileAtomic(this.file, `${JSON.stringify(body, null, 2)}\n`, { mode: 0o600, dirMode: 0o700 })
    this.accounts = next
  }
}
