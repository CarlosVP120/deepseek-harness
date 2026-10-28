/**
 * The sign-in cookie: an HMAC-signed account identity, session version, and
 * expiry. The signing key lives in its own owner-only file beside the accounts.
 */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'

/** Name of the sign-in cookie. */
export const COOKIE_NAME = 'eqidis-sesion'
const KEY_BYTES = 32
const PAYLOAD_VERSION = 1
const DAY_MILLISECONDS = 24 * 60 * 60 * 1000

/** What a valid sign-in cookie carries. */
export interface SignIn {
  readonly accountId: string
  /** The account's session version when it signed in. */
  readonly sessionVersion: number
  readonly expiresAt: number
}

interface Payload {
  readonly v: typeof PAYLOAD_VERSION
  readonly uid: string
  readonly sv: number
  readonly iat: number
  readonly exp: number
}

function base64url(bytes: Buffer): string {
  return bytes.toString('base64url')
}

/**
 * Read the signing key, creating it on first use.
 * @param file - absolute path of the key file.
 * @returns the key bytes.
 */
export async function signingKey(file: string): Promise<Buffer> {
  try {
    const key = Buffer.from((await readFile(file, 'utf8')).trim(), 'base64url')
    if (key.byteLength !== KEY_BYTES) throw new Error(`eqidis-accounts: ${file} does not hold a ${String(KEY_BYTES)}-byte key`)
    return key
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  const key = randomBytes(KEY_BYTES)
  await writeFileAtomic(file, `${base64url(key)}\n`, { mode: 0o600, dirMode: 0o700 })
  return key
}

/** Signs and verifies sign-in cookies with one key and lifetime. */
export class SignInCookies {
  private readonly maxAgeMilliseconds: number

  /**
   * Create the cookie signer.
   * @param key - HMAC key from {@link signingKey}.
   * @param maxAgeDays - how long a sign-in lasts.
   * @param secure - whether the cookie is only sent over HTTPS.
   */
  constructor(private readonly key: Buffer, maxAgeDays: number, private readonly secure: boolean) {
    this.maxAgeMilliseconds = maxAgeDays * DAY_MILLISECONDS
  }

  /**
   * Start a sign-in.
   * @param accountId - signed-in account.
   * @param sessionVersion - the account's current session version.
   * @returns the `Set-Cookie` header value starting a sign-in.
   */
  issue(accountId: string, sessionVersion: number): string {
    const iat = Date.now()
    const payload: Payload = { v: PAYLOAD_VERSION, uid: accountId, sv: sessionVersion, iat, exp: iat + this.maxAgeMilliseconds }
    const body = base64url(Buffer.from(JSON.stringify(payload), 'utf8'))
    const value = `${body}.${base64url(this.sign(body))}`
    return this.header(value, Math.floor(this.maxAgeMilliseconds / 1000))
  }

  /**
   * End a sign-in.
   * @returns the `Set-Cookie` header value ending a sign-in.
   */
  clear(): string {
    return this.header('', 0)
  }

  /**
   * Read the sign-in a request carries.
   * @param cookieHeader - the request's `Cookie` header.
   * @returns the sign-in it carries, or undefined when absent, forged, or expired.
   */
  read(cookieHeader: string | undefined): SignIn | undefined {
    if (cookieHeader === undefined) return undefined
    const value = cookieHeader.split(';').map(part => part.trim())
      .find(part => part.startsWith(`${COOKIE_NAME}=`))?.slice(COOKIE_NAME.length + 1)
    const [body, signature] = value?.split('.') ?? []
    if (body === undefined || signature === undefined || body === '') return undefined
    const expected = this.sign(body)
    const actual = Buffer.from(signature, 'base64url')
    if (actual.byteLength !== expected.byteLength || !timingSafeEqual(actual, expected)) return undefined
    let payload: Partial<Payload>
    try {
      payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Partial<Payload>
    } catch {
      // A correctly signed body is always JSON; anything else is not a sign-in.
      return undefined
    }
    const now = Date.now()
    if (payload.v !== PAYLOAD_VERSION || typeof payload.uid !== 'string' || typeof payload.sv !== 'number'
      || typeof payload.exp !== 'number' || typeof payload.iat !== 'number' || payload.iat > now || payload.exp <= now) {
      return undefined
    }
    return { accountId: payload.uid, sessionVersion: payload.sv, expiresAt: payload.exp }
  }

  private sign(body: string): Buffer {
    return createHmac('sha256', this.key).update(body).digest()
  }

  private header(value: string, maxAgeSeconds: number): string {
    return `${COOKIE_NAME}=${value}; Max-Age=${String(maxAgeSeconds)}; Path=/; HttpOnly; SameSite=Lax${this.secure ? '; Secure' : ''}`
  }
}
