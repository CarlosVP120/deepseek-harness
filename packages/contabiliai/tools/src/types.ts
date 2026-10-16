/** Browser-safe ContabiliAI vocabulary shared by the Host service and the Client panels. @module */

/** Lifecycle of one company month in the ContabiliAI engine. */
export type ContabiliaiMonthState = 'draft' | 'ready' | 'running' | 'waiting' | 'completed' | 'blocked' | 'failed' | 'cancelled'

/** One company month as the start-page panel lists it. */
export interface ContabiliaiMonth {
  /** Company RFC, the engine's company key. */
  rfc: string
  /** Company display name. */
  empresa: string
  /** Accounting month as YYYY-MM. */
  periodo: string
  /** Engine job state. */
  estado: string
  /** Last engine activity, `YYYY-MM-DD HH:MM:SS`. */
  actualizado: string
  /** Questions waiting for the user. */
  preguntas: number
  /** Files loaded into the month. */
  archivos: number
  /** Journals of the audited result, when there is one. */
  polizas: number | null
  /** Bank movements with a journal. */
  cubiertos: number | null
  /** Bank movements in the loaded statements. */
  total: number | null
}
