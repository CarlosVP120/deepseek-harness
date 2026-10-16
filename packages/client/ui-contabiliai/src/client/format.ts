/** Formatting and defensive reads shared by the ContabiliAI views. */

/** Bridge step as the engine reports it. */
export interface Step {
  clave: string
  titulo: string
  estado: 'hecho' | 'en_curso' | 'pendiente'
}

/** Month card data projected by the `contabiliai_estado` / `contabiliai_procesar` tools. */
export interface MonthCardData {
  rfc?: string
  empresa?: string
  periodo?: string
  estado?: string
  descripcion?: string
  intento?: number
  archivos?: number
  preguntas?: number
  error?: string | null
  mensaje?: string
  resultado?: {
    auditoria_aprobada: boolean
    polizas: number | null
    movimientos_bancarios_cubiertos: number | null
    movimientos_bancarios_total: number | null
    iva_acreditable_pagado: string | null
    iva_trasladado_cobrado: string | null
  } | null
  avance?: {
    pasos: Step[]
    cobertura: { movimientos_bancarios_cubiertos?: number | null; movimientos_bancarios_total?: number | null }
  }
}

/** One bank statement's totals. */
export interface BankTotals {
  banco: string
  movimientos: number
  cargos: number
  importe_cargos: string
  abonos: number
  importe_abonos: string
  con_poliza: number
}

/** One bank movement and the journal that recorded it. */
export interface Movement {
  fecha: string
  banco: string
  concepto: string
  importe: string
  poliza: { tipo: string; concepto: string; id: string; cuentas: string[] } | null
}

/** Coverage card data projected by `contabiliai_cobertura`. */
export interface CoverageData {
  bancos: BankTotals[]
  movimientos: Movement[]
}

/** @returns the value as a plain object, or undefined. */
export function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

/** @returns the call's arguments parsed from its raw JSON, or an empty object. */
export function callArgs(raw: string | undefined): { rfc?: string; periodo?: string } {
  if (raw === undefined) return {}
  try {
    return record(JSON.parse(raw)) ?? {}
  } catch {
    return {}
  }
}

/** @returns `2026-07` as `julio 2026` in the reader's language. */
export function monthLabel(period: string | undefined, locale: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(period ?? '')
  if (match === null) return period ?? ''
  const label = new Date(Number(match[1]), Number(match[2]) - 1, 1).toLocaleDateString(locale, { month: 'long', year: 'numeric' })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

/** @returns an amount as `12,345.60 MXN`; never a currency sign, which markdown views read as math. */
export function money(value: string | number | null | undefined, locale: string): string {
  if (value === null || value === undefined || value === '') return '—'
  const amount = Number(value)
  if (!Number.isFinite(amount)) return String(value)
  return `${amount.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN`
}

/** @returns `2026-07-01` as `1 jul`. */
export function shortDate(value: string, locale: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (match === null) return value
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).toLocaleDateString(locale, { day: 'numeric', month: 'short' })
}

/** @returns covered/total as a 0–100 percentage, or undefined without a total. */
export function percent(covered: number | null | undefined, total: number | null | undefined): number | undefined {
  if (total === null || total === undefined || total === 0 || covered === null || covered === undefined) return undefined
  return Math.round((covered / total) * 100)
}

/**
 * The card data of a settled call: its presentation metadata, or the JSON
 * text the engine returned when the call predates the metadata.
 * @returns the parsed object, or undefined.
 */
export function resultData(meta: unknown, content: readonly { type: string; text?: string }[]): Record<string, unknown> | undefined {
  const fromMeta = record(meta)
  if (fromMeta !== undefined) return fromMeta
  const text = content.map(block => block.type === 'text' ? block.text ?? '' : '').join('')
  try {
    return record(JSON.parse(text))
  } catch {
    return undefined
  }
}
