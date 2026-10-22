/** Browser-safe vocabulary shared by the workpaper tools and their result card. @module */

/** One figure the workpaper produced. */
export interface WorkpaperFigure {
  /** Concept as the workpaper names it, e.g. "ISR a cargo". */
  concepto: string
  /** Value as calculated by the workpaper. */
  valor: number | string | null
  /** `Hoja!A1` cell that holds it. */
  celda?: string | undefined
}

/** One item the accountant follows up after a workpaper is closed. */
export interface WorkpaperPending {
  /** Stable id within the workpaper copy, e.g. "P3". */
  id: string
  /** What to review, in the accountant's terms. */
  texto: string
  /** Whether it is still open. */
  estado: 'abierto' | 'resuelto'
  /** How it was settled, once resolved. */
  resolucion?: string | undefined
  /** ISO-8601 instant it was resolved. */
  resuelto_en?: string | undefined
}

/** The card a finished workpaper shows in the chat. */
export interface WorkpaperResult {
  /** Workpaper template name. */
  plantilla: string
  /** Period it covers, e.g. "2026-09". */
  periodo: string
  /** Project-relative path of the filled workpaper. */
  archivo: string
  /** Key results, in the order the workpaper presents them. */
  resultados: WorkpaperFigure[]
  /** Checks performed (balanza cuadrada, totales conciliados, …). */
  verificaciones: string[]
  /** Items the accountant must review, with their follow-up state when the card was made. */
  pendientes: WorkpaperPending[]
  /** Formula cells whose result is an error, if any. */
  errores: string[]
  /** Cells written, with the source each value came from. */
  capturas: number
}
