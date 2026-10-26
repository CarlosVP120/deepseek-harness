/** Which company month each chat Session works on, kept in the product data root. */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { FiscalcfdiBinding } from './types.ts'

/** Session → company month, persisted as one small JSON file. */
export class SessionBindings {
  private readonly path: string
  private readonly entries: Map<string, FiscalcfdiBinding>

  /** @param home - product data root (DSH_HOME); defaults to ~/.fiscalcfdi-ai. */
  constructor(home: string = process.env.DSH_HOME ?? join(homedir(), '.fiscalcfdi-ai')) {
    this.path = join(home, 'fiscalcfdi', 'sessions.json')
    let stored: Record<string, FiscalcfdiBinding> = {}
    try {
      stored = JSON.parse(readFileSync(this.path, 'utf8')) as Record<string, FiscalcfdiBinding>
    } catch {
      stored = {}
    }
    this.entries = new Map(Object.entries(stored))
  }

  /** @returns the Session's company month, if it has one. */
  get(sessionId: string): FiscalcfdiBinding | undefined {
    return this.entries.get(sessionId)
  }

  /**
   * Bind a Session to a company month; a repeated binding writes nothing.
   * @returns whether the binding changed.
   */
  set(sessionId: string, binding: FiscalcfdiBinding): boolean {
    const current = this.entries.get(sessionId)
    if (current?.rfc === binding.rfc && current.periodo === binding.periodo && current.empresa === binding.empresa) return false
    this.entries.set(sessionId, binding)
    this.save()
    return true
  }

  /** Remove a Session's binding. */
  delete(sessionId: string): void {
    if (this.entries.delete(sessionId)) this.save()
  }

  /**
   * Drop the bindings of Sessions that no longer exist.
   * @param live - every Session that still exists, archived ones included.
   * @returns the months that no remaining Session is bound to.
   */
  prune(live: ReadonlySet<string>): FiscalcfdiBinding[] {
    const dropped = [...this.entries].filter(([sessionId]) => !live.has(sessionId))
    if (dropped.length === 0) return []
    for (const [sessionId] of dropped) this.entries.delete(sessionId)
    this.save()
    const kept = new Set([...this.entries.values()].map(binding => `${binding.rfc}|${binding.periodo}`))
    const orphaned = new Map<string, FiscalcfdiBinding>()
    for (const [, binding] of dropped) {
      const key = `${binding.rfc}|${binding.periodo}`
      if (!kept.has(key)) orphaned.set(key, binding)
    }
    return [...orphaned.values()]
  }

  /** @returns the Session bound to a company month most recently, if any. */
  latestFor(rfc: string, periodo: string): string | undefined {
    let latest: string | undefined
    for (const [sessionId, binding] of this.entries) if (binding.rfc === rfc && binding.periodo === periodo) latest = sessionId
    return latest
  }

  private save(): void {
    mkdirSync(dirname(this.path), { recursive: true })
    const temporary = `${this.path}.tmp`
    writeFileSync(temporary, JSON.stringify(Object.fromEntries(this.entries), null, 1))
    renameSync(temporary, this.path)
  }
}
