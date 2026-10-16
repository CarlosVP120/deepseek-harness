/**
 * Per-Session state of the selected company month: the Session's binding, the
 * engine's month detail, and the guided actions the selector and the month
 * panel run against the Host's `contabiliai` Remote namespace. Polls while a
 * view is subscribed: quickly while the agent works, slowly otherwise, so
 * changes the chat agent makes reach the panel too.
 */
import type {
  ContabiliaiBinding, ContabiliaiCompany, ContabiliaiImportable, ContabiliaiMonthDetail,
} from '@deepseek-ai/dsh-contabiliai-tools/types'

/** Remote calls this store uses; each rejects with the Host failure. */
export interface MonthRemote {
  companies(): Promise<ContabiliaiCompany[]>
  binding(sessionId: string): Promise<ContabiliaiBinding | null>
  bind(sessionId: string, rfc: string, periodo: string): Promise<ContabiliaiMonthDetail>
  unbind(sessionId: string): Promise<void>
  month(rfc: string, periodo: string): Promise<ContabiliaiMonthDetail>
  upload(rfc: string, periodo: string, files: { name: string; data: string }[]): Promise<ContabiliaiMonthDetail>
  answer(rfc: string, periodo: string, texto: string, preguntaId?: string): Promise<ContabiliaiMonthDetail>
  process(rfc: string, periodo: string): Promise<ContabiliaiMonthDetail>
  importable(rfc: string, periodo: string): Promise<ContabiliaiImportable>
}

/** What a view renders for one Session. */
export interface MonthState {
  /** undefined while the first read is pending; null when the Session has no month. */
  readonly binding: ContabiliaiBinding | null | undefined
  readonly detail: ContabiliaiMonthDetail | undefined
  /** The action in flight, if any: select, upload, answer, process, download. */
  readonly busy: string | undefined
  /** Last failure, in the engine's words. */
  readonly error: string | undefined
}

const FAST_MS = 4000
const SLOW_MS = 15000

function message(error: unknown): string {
  return error instanceof Error ? error.message : typeof error === 'object' && error !== null && 'message' in error
    ? String((error).message) : String(error)
}

async function base64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

/** One Session's month state with its subscriptions. */
export class SessionMonth {
  private state: MonthState = { binding: undefined, detail: undefined, busy: undefined, error: undefined }
  private readonly listeners = new Set<() => void>()
  private timer: ReturnType<typeof setTimeout> | undefined

  constructor(private readonly sessionId: string, private readonly remote: MonthRemote) {}

  readonly getSnapshot = (): MonthState => this.state

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    if (this.listeners.size === 1) void this.refresh()
    return () => {
      this.listeners.delete(listener)
      if (this.listeners.size === 0) this.stop()
    }
  }

  private set(patch: Partial<MonthState>): void {
    this.state = { ...this.state, ...patch }
    for (const listener of this.listeners) listener()
  }

  private stop(): void {
    if (this.timer !== undefined) clearTimeout(this.timer)
    this.timer = undefined
  }

  private schedule(): void {
    this.stop()
    if (this.listeners.size === 0) return
    this.timer = setTimeout(() => { void this.refresh() }, this.state.detail?.estado === 'running' ? FAST_MS : SLOW_MS)
  }

  /** Re-read the Session's binding and its month. */
  async refresh(): Promise<void> {
    try {
      const binding = await this.remote.binding(this.sessionId)
      const detail = binding === null ? undefined : await this.remote.month(binding.rfc, binding.periodo)
      this.set({ binding, detail, error: undefined })
    } catch (error) {
      this.set({ error: message(error), binding: this.state.binding ?? null })
    }
    this.schedule()
  }

  private async act(name: string, run: () => Promise<ContabiliaiMonthDetail | void>): Promise<boolean> {
    this.set({ busy: name, error: undefined })
    try {
      const detail = await run()
      if (detail !== undefined) this.set({ detail })
      return true
    } catch (error) {
      this.set({ error: message(error) })
      return false
    } finally {
      this.set({ busy: undefined })
      this.schedule()
    }
  }

  /** Bind the Session to a company month and open it. */
  select(company: ContabiliaiCompany, periodo: string): Promise<boolean> {
    return this.act('select', async () => {
      const detail = await this.remote.bind(this.sessionId, company.rfc, periodo)
      this.set({ binding: { rfc: company.rfc, empresa: detail.empresa, periodo } })
      return detail
    })
  }

  /** Clear the Session's company month. */
  clear(): Promise<boolean> {
    return this.act('select', async () => {
      await this.remote.unbind(this.sessionId)
      this.set({ binding: null, detail: undefined })
    })
  }

  private month(): ContabiliaiBinding {
    const binding = this.state.binding
    if (binding === null || binding === undefined) throw new Error('Elige primero la empresa y el mes.')
    return binding
  }

  /** Load files into the month; the engine recognizes each one by its content. */
  upload(files: readonly File[]): Promise<boolean> {
    return this.act('upload', async () => {
      const { rfc, periodo } = this.month()
      const encoded = await Promise.all(files.map(async file => ({ name: file.name, data: await base64(file) })))
      return this.remote.upload(rfc, periodo, encoded)
    })
  }

  /** Send the user's answer to the engine. */
  answer(texto: string, preguntaId?: string): Promise<boolean> {
    return this.act('answer', () => {
      const { rfc, periodo } = this.month()
      return this.remote.answer(rfc, periodo, texto, preguntaId)
    })
  }

  /** Start the posting run. */
  process(): Promise<boolean> {
    return this.act('process', () => {
      const { rfc, periodo } = this.month()
      return this.remote.process(rfc, periodo)
    })
  }

  /** Save the audited importable through the browser. */
  download(): Promise<boolean> {
    return this.act('download', async () => {
      const { rfc, periodo } = this.month()
      const file = await this.remote.importable(rfc, periodo)
      const bytes = Uint8Array.from(atob(file.data), char => char.charCodeAt(0))
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.ms-excel' }))
      const link = document.createElement('a')
      link.href = url
      link.download = file.nombre
      link.click()
      setTimeout(() => { URL.revokeObjectURL(url) }, 10000)
    })
  }
}

/** Every Session's month state, created on first use, plus the shared company list. */
export class MonthRegistry {
  private readonly sessions = new Map<string, SessionMonth>()
  private companies: Promise<ContabiliaiCompany[]> | undefined

  constructor(private readonly remote: MonthRemote) {}

  /** @returns the Session's month state. */
  for(sessionId: string): SessionMonth {
    let month = this.sessions.get(sessionId)
    if (month === undefined) {
      month = new SessionMonth(sessionId, this.remote)
      this.sessions.set(sessionId, month)
    }
    return month
  }

  /** @returns the companies, read once and retried after a failure. */
  listCompanies(): Promise<ContabiliaiCompany[]> {
    this.companies ??= this.remote.companies().catch((error: unknown) => {
      this.companies = undefined
      throw error
    })
    return this.companies
  }
}
