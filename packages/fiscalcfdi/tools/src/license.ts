/**
 * Per-computer licenses that need no server. The owner's admin panel signs a code for one computer's
 * equipment code and a paid-until date with an Ed25519 key that exists only on the owner's computer; the app
 * checks the signature with {@link PUBLIC_KEY}, so a code cannot be made up, and checks the equipment code,
 * so it works on that computer only. After the paid-until date a grace period runs; then new accounting work
 * is refused while reading months and downloading finished importables stay available.
 */
import { createHash, createPrivateKey, createPublicKey, randomBytes, sign, verify, type KeyObject } from 'node:crypto'
import { execFile } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { FiscalcfdiIssuedLicense, FiscalcfdiLicense, FiscalcfdiLicenseIssue } from './types.ts'

/** Public half of the owner's signing key (Ed25519, SPKI DER, base64). Codes signed by any other key are refused. */
const PUBLIC_KEY = 'MCowBQYDK2VwAyEAEoJmd/7ROGdwOu/sRjE/QFgBTayJoqw8wDyfqKyYRNw='

const PREFIX = 'FCAI-'
const BASE32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
/** Days before the paid-until date from which the app warns that the license is about to end. */
const WARN_DAYS = 5

/** What a license code carries. */
export interface LicensePayload {
  v: 1
  /** Serial of the code, unique per issue. */
  id: string
  /** Equipment code it is valid on. */
  equipo: string
  /** Customer name. */
  cliente: string
  /** Last paid day, YYYY-MM-DD. */
  hasta: string
  /** Days after `hasta` during which the app still works with a warning. */
  gracia: number
  /** Day it was issued, YYYY-MM-DD. */
  emitida: string
}

/** The license saved on this computer and the latest day the app has seen, which a turned-back clock cannot undo. */
interface SavedLicense {
  codigo: string
  visto: string
}

function exec(file: string, args: string[]): Promise<string> {
  return new Promise((resolve) => {
    execFile(file, args, { timeout: 5000, windowsHide: true }, (error, stdout) => { resolve(error === null ? stdout : '') })
  })
}

/** The operating system's identifier of this computer, or undefined when it cannot be read. */
async function systemId(): Promise<string | undefined> {
  if (process.platform === 'darwin') {
    return /"IOPlatformUUID" = "([^"]+)"/.exec(await exec('/usr/sbin/ioreg', ['-rd1', '-c', 'IOPlatformExpertDevice']))?.[1]
  }
  if (process.platform === 'win32') {
    return /MachineGuid\s+REG_SZ\s+(\S+)/.exec(await exec('reg', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid']))?.[1]
  }
  try {
    return readFileSync('/etc/machine-id', 'utf8').trim() || undefined
  } catch {
    // No machine-id on this system: the caller falls back to an identifier kept in the data home.
    return undefined
  }
}

/**
 * This computer's equipment code, `EQ-XXXX-XXXX-XXXX-XXXX`: a digest of the operating system's computer
 * identifier, so reinstalling the app keeps it. Without one, a random identifier kept in the data home is used.
 * @param home - the data home.
 * @returns the equipment code.
 */
export async function machineCode(home: string): Promise<string> {
  let id = await systemId()
  if (id === undefined) {
    const file = join(home, 'fiscalcfdi', 'equipo-id')
    if (!existsSync(file)) {
      await mkdir(dirname(file), { recursive: true })
      await writeFile(file, randomBytes(16).toString('hex'))
    }
    id = (await readFile(file, 'utf8')).trim()
  }
  const digest = createHash('sha256').update(`fiscalcfdi-equipo:${id}`).digest()
  let bits = 0
  let value = 0
  let code = ''
  for (const byte of digest) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5 && code.length < 16) {
      code += BASE32.charAt((value >>> (bits - 5)) & 31)
      bits -= 5
    }
    if (code.length === 16) break
  }
  return `EQ-${code.match(/.{4}/g)?.join('-') ?? code}`
}

/** Today in this computer's time zone, YYYY-MM-DD. */
export function today(now = new Date()): string {
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}

function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000)
}

const OWNER_KEY = createPublicKey({ key: Buffer.from(PUBLIC_KEY, 'base64'), format: 'der', type: 'spki' })

/**
 * Sign a license payload.
 * @param payload - what the code carries.
 * @param key - the owner's private signing key.
 * @returns the code to send to the customer.
 */
export function signLicense(payload: LicensePayload, key: KeyObject): string {
  const body = Buffer.from(JSON.stringify(payload))
  return `${PREFIX}${body.toString('base64url')}.${sign(null, body, key).toString('base64url')}`
}

/** Read a code: its payload when the owner's key signed it, otherwise undefined. */
function decode(code: string, key: KeyObject): LicensePayload | undefined {
  const compact = code.replace(/\s+/g, '')
  if (!compact.startsWith(PREFIX)) return undefined
  const [body, signature] = compact.slice(PREFIX.length).split('.')
  if (body === undefined || signature === undefined) return undefined
  try {
    if (!verify(null, Buffer.from(body, 'base64url'), key, Buffer.from(signature, 'base64url'))) return undefined
    // A later code format carries another version; this app does not read it.
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Omit<LicensePayload, 'v'> & { v: number }
    return payload.v === 1 ? { ...payload, v: 1 } : undefined
  } catch {
    // A truncated or edited code does not decode; it is simply not a license.
    return undefined
  }
}

/**
 * The license state of this computer for a code.
 * @param code - the saved code, or undefined when none is saved.
 * @param machine - this computer's equipment code.
 * @param day - today, never earlier than the latest day seen.
 * @param required - whether this installation requires a license.
 * @param key - the public key codes must be signed with; the owner's by default.
 * @returns the state the settings page shows and the engine gate applies.
 */
export function licenseState(
  code: string | undefined, machine: string, day: string, required: boolean, key: KeyObject = OWNER_KEY,
): Omit<FiscalcfdiLicense, 'admin'> {
  const base = { machine, required, customer: null, until: null, graceUntil: null, daysLeft: null }
  if (code === undefined) return { ...base, state: 'sin_licencia', allowed: !required }
  const payload = decode(code, key)
  if (payload?.equipo !== machine) return { ...base, state: 'invalida', allowed: !required }
  const graceUntil = addDays(payload.hasta, payload.gracia)
  const known = { ...base, customer: payload.cliente, until: payload.hasta, graceUntil, daysLeft: daysBetween(day, payload.hasta) }
  if (day <= payload.hasta) return { ...known, state: known.daysLeft <= WARN_DAYS ? 'por_vencer' : 'activa', allowed: true }
  if (day <= graceUntil) return { ...known, state: 'gracia', allowed: true }
  return { ...known, state: 'vencida', allowed: !required }
}

/** The license file of this computer, in the data home. */
export class LicenseStore {
  private readonly file: string
  private readonly keyFile: string
  private readonly ledger: string

  /** @param home - the data home. */
  constructor(home: string) {
    this.file = join(home, 'fiscalcfdi', 'licencia.json')
    this.keyFile = join(home, 'fiscalcfdi', 'admin', 'firma-licencias.pem')
    this.ledger = join(home, 'fiscalcfdi', 'admin', 'emitidas.json')
  }

  /** The saved license, or undefined. */
  load(): SavedLicense | undefined {
    try {
      return JSON.parse(readFileSync(this.file, 'utf8')) as SavedLicense
    } catch {
      // No license saved yet (or an unreadable file): the computer is unlicensed.
      return undefined
    }
  }

  /**
   * The state now; moves the latest day seen forward.
   * @param machine - this computer's equipment code.
   * @param required - whether this installation requires a license.
   * @returns the state, with whether this computer holds the owner's signing key.
   */
  async state(machine: string, required: boolean): Promise<FiscalcfdiLicense> {
    const saved = this.load()
    const now = today()
    const day = saved !== undefined && saved.visto > now ? saved.visto : now
    if (saved !== undefined && saved.visto < now) await this.write({ ...saved, visto: now })
    return { ...licenseState(saved?.codigo, machine, day, required), admin: existsSync(this.keyFile) }
  }

  /**
   * Save a code after checking it belongs to this computer and has not run out.
   * @param code - the code the owner sent.
   * @param machine - this computer's equipment code.
   * @param required - whether this installation requires a license.
   * @returns the state with the new code.
   */
  async activate(code: string, machine: string, required: boolean): Promise<FiscalcfdiLicense> {
    const compact = code.replace(/\s+/g, '')
    const saved = this.load()
    const day = saved !== undefined && saved.visto > today() ? saved.visto : today()
    const state = licenseState(compact, machine, day, true)
    if (state.state === 'invalida') {
      throw new Error(decode(compact, OWNER_KEY) === undefined
        ? 'El código de licencia no es válido. Cópialo completo, tal como te lo enviaron.'
        : 'Este código de licencia es de otro equipo. Envía a tu proveedor el código de este equipo.')
    }
    if (state.state === 'vencida') throw new Error(`Este código de licencia ya venció (pagado hasta ${state.until}). Pide uno nuevo.`)
    await this.write({ codigo: compact, visto: day })
    return this.state(machine, required)
  }

  private async write(saved: SavedLicense): Promise<void> {
    await mkdir(dirname(this.file), { recursive: true })
    const temporary = `${this.file}.${process.pid}.tmp`
    await writeFile(temporary, JSON.stringify(saved))
    await rename(temporary, this.file)
  }

  /** The owner's signing key; only the owner's computer has it. */
  private signingKey(): KeyObject {
    if (!existsSync(this.keyFile)) throw new Error('Este equipo no tiene la llave para emitir licencias.')
    return createPrivateKey(readFileSync(this.keyFile))
  }

  /** Every license issued from this computer, newest first. */
  async issued(): Promise<FiscalcfdiIssuedLicense[]> {
    this.signingKey()
    try {
      return (JSON.parse(await readFile(this.ledger, 'utf8')) as FiscalcfdiIssuedLicense[]).sort((a, b) => b.issued.localeCompare(a.issued))
    } catch {
      // No license issued yet.
      return []
    }
  }

  /**
   * Sign a code for one computer and record it.
   * @param request - customer, equipment code, computer name, paid-until date and grace days.
   * @returns the issued license with its code.
   */
  async issue(request: FiscalcfdiLicenseIssue): Promise<FiscalcfdiIssuedLicense> {
    const key = this.signingKey()
    const machine = request.machine.trim().toUpperCase()
    if (!/^EQ-[0-9A-Z]{4}(-[0-9A-Z]{4}){3}$/.test(machine)) throw new Error('El código de equipo debe verse así: EQ-XXXX-XXXX-XXXX-XXXX.')
    const customer = request.customer.trim()
    if (customer === '') throw new Error('Indica el nombre del cliente.')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(request.until) || Number.isNaN(Date.parse(request.until))) throw new Error('Indica la fecha «pagado hasta».')
    if (!Number.isInteger(request.graceDays) || request.graceDays < 0 || request.graceDays > 60) throw new Error('Los días de gracia van de 0 a 60.')
    const payload: LicensePayload = {
      v: 1, id: randomBytes(6).toString('hex'), equipo: machine, cliente: customer, hasta: request.until, gracia: request.graceDays, emitida: today(),
    }
    const code = signLicense(payload, key)
    const entry: FiscalcfdiIssuedLicense = {
      id: payload.id, customer, machine, device: request.device.trim(), until: request.until, graceDays: request.graceDays,
      issued: new Date().toISOString(), code, retired: false,
    }
    await this.record(list => [...list, entry])
    return entry
  }

  /**
   * Take a computer off the customer's list (it was replaced or the customer left); its code keeps working until its date.
   * @param id - the issued license.
   */
  async retire(id: string): Promise<void> {
    this.signingKey()
    await this.record(list => list.map(entry => entry.id === id ? { ...entry, retired: true } : entry))
  }

  private async record(change: (list: FiscalcfdiIssuedLicense[]) => FiscalcfdiIssuedLicense[]): Promise<void> {
    const next = change(await this.issued())
    const temporary = `${this.ledger}.${process.pid}.tmp`
    await writeFile(temporary, JSON.stringify(next, null, 1), { mode: 0o600 })
    await rename(temporary, this.ledger)
    await chmod(this.ledger, 0o600)
  }
}
