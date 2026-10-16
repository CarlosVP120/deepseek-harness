/** Which company month each chat Session works on, kept in the product data root. */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { ContabiliaiBinding } from './types.ts'

/** Session → company month, persisted as one small JSON file. */
export class SessionBindings {
  private readonly path: string
  private readonly entries: Map<string, ContabiliaiBinding>

  /** @param home - product data root (DSH_HOME); defaults to ~/.contabiliai. */
  constructor(home: string = process.env.DSH_HOME ?? join(homedir(), '.contabiliai')) {
    this.path = join(home, 'contabiliai', 'sessions.json')
    let stored: Record<string, ContabiliaiBinding> = {}
    try {
      stored = JSON.parse(readFileSync(this.path, 'utf8')) as Record<string, ContabiliaiBinding>
    } catch {
      stored = {}
    }
    this.entries = new Map(Object.entries(stored))
  }

  /** @returns the Session's company month, if it has one. */
  get(sessionId: string): ContabiliaiBinding | undefined {
    return this.entries.get(sessionId)
  }

  /**
   * Bind a Session to a company month; a repeated binding writes nothing.
   * @returns whether the binding changed.
   */
  set(sessionId: string, binding: ContabiliaiBinding): boolean {
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

  private save(): void {
    mkdirSync(dirname(this.path), { recursive: true })
    const temporary = `${this.path}.tmp`
    writeFileSync(temporary, JSON.stringify(Object.fromEntries(this.entries), null, 1))
    renameSync(temporary, this.path)
  }
}
