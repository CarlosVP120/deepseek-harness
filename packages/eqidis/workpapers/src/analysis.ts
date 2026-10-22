/**
 * Compact views of large workbooks for the workpaper agent: formulas repeated down a column
 * collapse into one pattern, repeated column blocks (one per month) are recognised, two blocks
 * are compared by key, and the formulas that read an area are found without reading every sheet.
 */
import type ExcelJS from 'exceljs'
import {
  type CellView, columnFromLetters, decodeRange, formulaOf, type Grid, lettersOf, load, plain, sheetOf, view,
} from './workbook.ts'

// ── formula patterns ──────────────────────────────────────────────────────────

const CELL_REF = /(?<![A-Za-z0-9_.$])(\$?)([A-Z]{1,3})(\$?)(\d{1,7})(?![A-Za-z0-9_(])/gu

/** Apply `edit` outside double-quoted string literals only. */
function outsideStrings(formula: string, edit: (part: string) => string): string {
  return formula.split('"').map((part, i) => i % 2 === 0 ? edit(part) : part).join('"')
}

/**
 * The formula with relative references written as offsets from its own cell, so formulas that
 * Excel would fill down or across compare equal.
 */
export function formulaSignature(formula: string, row: number, column: number): string {
  // Rows count as offsets even when written absolute ($C$7, $C$8, …): workbooks often spell a
  // filled-down lookup that way. A truly fixed row then just stops the run.
  return outsideStrings(formula, part => part.replace(CELL_REF, (_whole, colAbs: string, col: string, _rowAbs: string, r: string) =>
    `${colAbs === '' ? `C[${columnFromLetters(col) - column}]` : `C${col}`}R[${Number(r) - row}]`))
}

/** Several cells down one column sharing the same filled-down formula. */
export interface FormulaRun {
  /** Area, for example T7:T14. */
  celdas: string
  /** The formula of the first cell; each following cell is the same formula one row further down. */
  formula: string
  /** Calculated values in row order. */
  valores: (string | number | boolean | null)[]
}

/** Collapse runs of three or more filled-down formulas in the same column into one entry each. */
export function compactCells(cells: readonly CellView[]): (CellView | FormulaRun)[] {
  const byColumn = new Map<string, CellView[]>()
  for (const cell of cells) {
    const col = /^[A-Z]+/u.exec(cell.cell)?.[0] ?? ''
    byColumn.set(col, [...byColumn.get(col) ?? [], cell])
  }
  const runOf = new Map<string, FormulaRun>()
  const inRun = new Set<string>()
  for (const [col, column] of byColumn) {
    const sorted = [...column].sort((a, b) => Number(/\d+$/u.exec(a.cell)?.[0]) - Number(/\d+$/u.exec(b.cell)?.[0]))
    let start = 0
    while (start < sorted.length) {
      const first = sorted[start] as CellView
      const firstRow = Number(/\d+$/u.exec(first.cell)?.[0])
      const signature = first.formula === undefined ? undefined : formulaSignature(first.formula, firstRow, columnFromLetters(col))
      let end = start
      while (signature !== undefined && end + 1 < sorted.length) {
        const next = sorted[end + 1] as CellView
        const nextRow = Number(/\d+$/u.exec(next.cell)?.[0])
        if (nextRow !== firstRow + (end + 1 - start) || next.formula === undefined
          || formulaSignature(next.formula, nextRow, columnFromLetters(col)) !== signature) break
        end += 1
      }
      if (signature !== undefined && end - start >= 2) {
        const run = sorted.slice(start, end + 1)
        runOf.set(first.cell, { celdas: `${first.cell}:${(run.at(-1) as CellView).cell}`, formula: first.formula as string, valores: run.map(cell => cell.value) })
        for (const cell of run) inRun.add(cell.cell)
      }
      start = end + 1
    }
  }
  const out: (CellView | FormulaRun)[] = []
  for (const cell of cells) {
    const run = runOf.get(cell.cell)
    if (run !== undefined) out.push(run)
    else if (!inRun.has(cell.cell)) out.push(cell)
  }
  return out
}

// ── repeated blocks ───────────────────────────────────────────────────────────

/** The same set of columns repeated across a sheet, for example one trial balance per month. */
export interface RepeatedBlock {
  /** Header label that starts every block. */
  etiqueta: string
  /** Row of that header. */
  fila: number
  /** Columns between the start of two blocks. */
  ancho: number
  /** Each block: its first and last column and the longest title above its header. */
  bloques: { columnas: string; titulo: string | null }[]
}

/** Find header labels repeated at a constant column spacing in the first rows of a sheet. */
export function repeatedBlocks(sheet: ExcelJS.Worksheet): RepeatedBlock[] {
  const found: RepeatedBlock[] = []
  for (let r = 1; r <= Math.min(sheet.rowCount, 15); r += 1) {
    const columns = new Map<string, number[]>()
    sheet.getRow(r).eachCell((cell, c) => {
      const value = plain(cell.value)
      if (typeof value === 'string' && value.trim().length > 1) columns.set(value.trim(), [...columns.get(value.trim()) ?? [], c])
    })
    for (const [label, cols] of columns) {
      if (cols.length < 3) continue
      const width = (cols[1] as number) - (cols[0] as number)
      if (width < 2 || !cols.every((c, i) => i === 0 || c - (cols[i - 1] as number) === width)) continue
      if (found.some(block => block.fila < r && block.ancho === width)) continue
      found.push({
        etiqueta: label, fila: r, ancho: width,
        bloques: cols.map((c) => {
          // The block's title: the longest text near the header, preferring one with a date or number.
          let title: string | null = null
          let score = -1
          for (let rr = 1; rr <= r + 3; rr += 1) {
            for (let cc = c; cc < c + width; cc += 1) {
              const text = plain(sheet.getCell(rr, cc).value)
              if (typeof text !== 'string' || text.trim() === label) continue
              const value = text.trim().length + (/\d/u.test(text) ? 1000 : 0)
              if (value > score) { score = value; title = text.trim().slice(0, 80) }
            }
          }
          return { columnas: `${lettersOf(c)}:${lettersOf(c + width - 1)}`, titulo: title }
        }),
      })
    }
  }
  return found
}

/** @returns repeated column blocks of every sheet that has them. */
export async function sheetBlocks(path: string): Promise<Record<string, RepeatedBlock[]>> {
  const workbook = await load(path)
  const out: Record<string, RepeatedBlock[]> = {}
  for (const sheet of workbook.worksheets) {
    const blocks = repeatedBlocks(sheet)
    if (blocks.length > 0) out[sheet.name] = blocks
  }
  return out
}

/** A rectangle of one sheet with filled-down formulas collapsed. */
export interface CompactRead {
  sheet: string
  range: string
  entries: (CellView | FormulaRun)[]
  truncated: boolean
}

/** Read a rectangle compactly: repeated formulas collapse into patterns. */
export async function readCompact(path: string, sheetName: string, range: string | undefined, limit = 600): Promise<CompactRead> {
  const workbook = await load(path)
  const sheet = sheetOf(workbook, sheetName)
  const area = decodeRange(range ?? sheet.dimensions.range)
  const cells: CellView[] = []
  for (let r = area.top; r <= area.bottom; r += 1) {
    for (let c = area.left; c <= area.right; c += 1) {
      const { format: _format, fill, ...seen } = view(sheet.getCell(r, c))
      if ((seen.value === null || seen.value === '') && seen.formula === undefined && fill === undefined) continue
      // Shading tells input cells apart; on formula cells it only repeats the sheet's styling.
      cells.push(seen.formula !== undefined || fill === undefined ? seen : { ...seen, fill })
    }
  }
  const entries = compactCells(cells)
  return { sheet: sheet.name, range: range ?? sheet.dimensions.range, entries: entries.slice(0, limit), truncated: entries.length > limit }
}

// ── comparing blocks ──────────────────────────────────────────────────────────

/** Differences between two blocks of rows. */
export interface Comparison {
  filas_a: number
  filas_b: number
  iguales: number
  con_diferencias: number
  solo_en_a: (string | number)[]
  solo_en_b: (string | number)[]
  diferencias: { fila: string | number; columna: number; a: string | number | null; b: string | number | null }[]
}

function same(a: string | number | null | undefined, b: string | number | null | undefined): boolean {
  const x = typeof a === 'string' ? a.trim() : a ?? null
  const y = typeof b === 'string' ? b.trim() : b ?? null
  if ((x === null || x === '') && (y === null || y === '')) return true
  if (typeof x === 'number' && typeof y === 'number') return Math.abs(x - y) < 0.005
  return x === y
}

/**
 * Compare two grids row by row, matching rows by the value of a key column when given
 * (for example the account number) and by position otherwise.
 * @param key - 1-based column inside the grids that identifies a row.
 */
export function compareGrids(a: Grid, b: Grid, key: number | undefined, limit = 60): Comparison {
  const keyed = (grid: Grid) => {
    const rows = new Map<string | number, (number | string | null)[]>()
    grid.rows.forEach((row, i) => {
      const id = key === undefined ? i + 1 : row[key - 1]
      if (id === null || id === undefined || (typeof id === 'string' && id.trim() === '')) return
      const name = typeof id === 'string' ? id.trim() : id
      if (!rows.has(name)) rows.set(name, row)
    })
    return rows
  }
  const left = keyed(a)
  const right = keyed(b)
  const result: Comparison = {
    filas_a: left.size, filas_b: right.size, iguales: 0, con_diferencias: 0, solo_en_a: [], solo_en_b: [], diferencias: [],
  }
  for (const [id, row] of left) {
    const other = right.get(id)
    if (other === undefined) { if (result.solo_en_a.length < limit) result.solo_en_a.push(id); continue }
    let differs = false
    for (let c = 0; c < Math.max(row.length, other.length); c += 1) {
      if (same(row[c], other[c])) continue
      differs = true
      if (result.diferencias.length < limit) result.diferencias.push({ fila: id, columna: c + 1, a: row[c] ?? null, b: other[c] ?? null })
    }
    if (differs) result.con_diferencias += 1
    else result.iguales += 1
  }
  for (const id of right.keys()) if (!left.has(id) && result.solo_en_b.length < limit) result.solo_en_b.push(id)
  return result
}

// ── dependents ────────────────────────────────────────────────────────────────

interface Area { sheet: string; top: number; left: number; bottom: number; right: number }

const REFERENCE = new RegExp([
  String.raw`(?<![A-Za-z0-9_.$])`,
  String.raw`(?:(?:'((?:[^']|'')+)'|([A-Za-z0-9_.]+))!)?`,
  String.raw`(\$?[A-Z]{1,3}\$?\d{1,7}(?::\$?[A-Z]{1,3}\$?\d{1,7})?|\$?[A-Z]{1,3}:\$?[A-Z]{1,3}|\$?\d{1,7}:\$?\d{1,7})`,
  String.raw`(?![A-Za-z0-9_(!])`,
].join(''), 'gu')

function areaOf(sheet: string, text: string): Area {
  const parts = text.replaceAll('$', '').split(':')
  const corner = (part: string, end: boolean) => {
    const col = /^[A-Z]+/u.exec(part)?.[0]
    const row = /\d+$/u.exec(part)?.[0]
    return {
      col: col === undefined ? (end ? Number.POSITIVE_INFINITY : 1) : columnFromLetters(col),
      row: row === undefined ? (end ? Number.POSITIVE_INFINITY : 1) : Number(row),
    }
  }
  const from = corner(parts[0] as string, false)
  const to = corner(parts[1] ?? (parts[0] as string), true)
  return { sheet, top: from.row, left: from.col, bottom: to.row, right: to.col }
}

/** Areas a formula on `sheet` reads. */
export function referencedAreas(sheet: string, formula: string): Area[] {
  const areas: Area[] = []
  outsideStrings(formula, (part) => {
    for (const match of part.matchAll(REFERENCE)) {
      const target = (match[1]?.replaceAll("''", "'") ?? match[2] ?? sheet)
      areas.push(areaOf(target, match[3] as string))
    }
    return part
  })
  return areas
}

function overlaps(a: Area, b: Area): boolean {
  return a.sheet.toLowerCase() === b.sheet.toLowerCase()
    && a.left <= b.right && b.left <= a.right && a.top <= b.bottom && b.top <= a.bottom
}

/** Formulas that read an area, by sheet. */
export interface Dependents {
  total: number
  hojas: Record<string, (CellView | FormulaRun)[]>
}

/**
 * Formulas anywhere in the workbook that read an area, grouped by sheet with filled-down
 * formulas collapsed.
 * @param reference - `Hoja!A1`, `Hoja!A1:H40` or whole columns such as `Hoja!BU:CB`.
 */
export async function dependents(path: string, reference: string, limitPerSheet = 40): Promise<Dependents> {
  const bang = reference.lastIndexOf('!')
  if (bang < 0) throw new Error('Usa Hoja!Rango, por ejemplo TB!BU:CB.')
  const target = areaOf(reference.slice(0, bang).replace(/^'|'$/gu, ''), reference.slice(bang + 1).toUpperCase())
  const workbook = await load(path)
  const hojas: Record<string, (CellView | FormulaRun)[]> = {}
  let total = 0
  for (const sheet of workbook.worksheets) {
    const hits: CellView[] = []
    sheet.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell((cell) => {
        const formula = formulaOf(cell)
        if (formula === undefined) return
        if (!referencedAreas(sheet.name, formula).some(area => overlaps(area, target))) return
        const { format: _format, fill: _fill, ...seen } = view(cell)
        hits.push(seen)
      })
    })
    if (hits.length === 0) continue
    total += hits.length
    hojas[sheet.name] = compactCells(hits).slice(0, limitPerSheet)
  }
  return { total, hojas }
}

// ── account-grouped ledgers ───────────────────────────────────────────────────

const ACCOUNT = /^\s*(\d{2,6}(?:[-.]\d{1,6}){1,4})\s*$/u

/** One account section of a ledger report: its header and the rows under it. */
export interface LedgerSection {
  cuenta: string
  fila: number
  encabezado: (string | number | null)[]
  movimientos: { fila: number; valores: (string | number | null)[] }[]
  /** Exact sum of each numeric column of the movements, by column number. */
  sumas: Record<number, number>
}

/** The account sections found in a ledger report. */
export interface LedgerRead {
  hoja: string
  secciones: LedgerSection[]
  truncado: boolean
}

/**
 * Read the sections of a report grouped by account (ledger details as accounting systems print
 * them: an account header row, then its movements) whose account starts with `account`.
 */
export async function ledger(path: string, sheetName: string | undefined, account: string, limit = 300): Promise<LedgerRead> {
  const workbook = await load(path)
  const sheet = sheetName === undefined ? workbook.worksheets[0] : sheetOf(workbook, sheetName)
  if (sheet === undefined) throw new Error('El libro no tiene hojas.')
  const wanted = account.trim()
  const sections: LedgerSection[] = []
  let current: LedgerSection | undefined
  let rows = 0
  for (let r = 1; r <= sheet.rowCount; r += 1) {
    const values: (string | number | null)[] = []
    for (let c = 1; c <= sheet.columnCount; c += 1) {
      const value = plain(sheet.getCell(r, c).value)
      values.push(typeof value === 'boolean' ? String(value) : value)
    }
    const code = typeof values[0] === 'string' ? ACCOUNT.exec(values[0])?.[1] : undefined
    if (code !== undefined) {
      current = code.startsWith(wanted) ? { cuenta: code, fila: r, encabezado: values, movimientos: [], sumas: {} } : undefined
      if (current !== undefined) sections.push(current)
      continue
    }
    if (current === undefined || values.every(value => value === null || value === '')) continue
    if (rows >= limit) return { hoja: sheet.name, secciones: sections, truncado: true }
    rows += 1
    current.movimientos.push({ fila: r, valores: values })
    const sums = current.sumas
    values.forEach((value, i) => {
      if (typeof value === 'number') sums[i + 1] = Math.round(((sums[i + 1] ?? 0) + value) * 100) / 100
    })
  }
  return { hoja: sheet.name, secciones: sections, truncado: false }
}
