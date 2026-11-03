import { generateKeyPairSync } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { LicenseStore, licenseState, machineCode, signLicense, type LicensePayload } from '../src/license.ts'

const { privateKey, publicKey } = generateKeyPairSync('ed25519')
const MACHINE = 'EQ-AAAA-BBBB-CCCC-DDDD'
const payload: LicensePayload = { v: 1, id: 'a1', equipo: MACHINE, cliente: 'Despacho', hasta: '2026-12-03', gracia: 5, emitida: '2026-11-03' }
const code = signLicense(payload, privateKey)
const homes: string[] = []
afterEach(() => { for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true }) })

describe('license state', () => {
  it('works until the paid-until date, warns in its last days, then runs a grace period before refusing work', () => {
    const at = (day: string) => {
      const { state, allowed } = licenseState(code, MACHINE, day, true, publicKey)
      return [state, allowed]
    }
    expect(at('2026-11-20')).toEqual(['activa', true])
    expect(at('2026-11-29')).toEqual(['por_vencer', true])
    expect(at('2026-12-03')).toEqual(['por_vencer', true])
    expect(at('2026-12-04')).toEqual(['gracia', true])
    expect(at('2026-12-08')).toEqual(['gracia', true])
    expect(at('2026-12-09')).toEqual(['vencida', false])
    expect(licenseState(code, MACHINE, '2026-12-08', true, publicKey)).toMatchObject({ customer: 'Despacho', until: '2026-12-03', graceUntil: '2026-12-08' })
  })

  it('refuses a code of another computer, an edited code and one signed by another key', () => {
    expect(licenseState(code, 'EQ-ZZZZ-ZZZZ-ZZZZ-ZZZZ', '2026-11-20', true, publicKey).state).toBe('invalida')
    const edited = code.replace(/\.(.)/, (_m, c: string) => `.${c === 'A' ? 'B' : 'A'}`)
    expect(licenseState(edited, MACHINE, '2026-11-20', true, publicKey).state).toBe('invalida')
    const other = generateKeyPairSync('ed25519').privateKey
    expect(licenseState(signLicense(payload, other), MACHINE, '2026-11-20', true, publicKey).state).toBe('invalida')
  })

  it('allows everything when the installation does not require a license', () => {
    expect(licenseState(undefined, MACHINE, '2026-11-20', false, publicKey)).toMatchObject({ state: 'sin_licencia', allowed: true })
    expect(licenseState(undefined, MACHINE, '2026-11-20', true, publicKey)).toMatchObject({ state: 'sin_licencia', allowed: false })
  })
})

describe('license store', () => {
  it('keeps the same equipment code for one computer and rejects codes it cannot verify', async () => {
    const home = mkdtempSync(join(tmpdir(), 'fiscalcfdi-license-'))
    homes.push(home)
    const machine = await machineCode(home)
    expect(machine).toMatch(/^EQ-[0-9A-Z]{4}(-[0-9A-Z]{4}){3}$/)
    expect(await machineCode(home)).toBe(machine)
    const store = new LicenseStore(home)
    expect(await store.state(machine, true)).toMatchObject({ state: 'sin_licencia', allowed: false, admin: false })
    await expect(store.activate('FCAI-no.valido', machine, true)).rejects.toThrow(/no es válido/)
    await expect(store.issue({ customer: 'X', machine, device: '', until: '2026-12-01', graceDays: 5 })).rejects.toThrow(/llave/)
  })
})
