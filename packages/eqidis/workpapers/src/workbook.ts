/**
 * Structure-agnostic access to Excel workbooks for the workpaper agent: read any
 * layout (values, formulas, input-looking cells, merged areas), search labels,
 * aggregate ledger-like tables, write values into a working copy without
 * rewriting the workbook, and recalculate it with the bundled LibreOffice.
 */
import { copyFile, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, extname, join } from 'node:path'
import ExcelJS from 'exceljs'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { createConverter, type Converter } from '@deepseek-ai/libreoffice-kit'

/** One cell as the agent sees it. */
export interface CellView {
  /** A1 address. */
  readonly cell: string
  /** Shown value: the cached result of a formula, a number, text or a date. */
  readonly value: string | number | boolean | null
  /** Formula without the leading `=`, when the cell has one. */
  readonly formula?: string
  /** Fill color (ARGB) when the cell is shaded: templates often mark input cells this way. */
  readonly fill?: string
  /** Number format when it is not General. */
  readonly format?: string
  /** Address of the merged area's top-left cell when this cell is inside a merge. */
  readonly mergedInto?: string
}

/** One worksheet's overview. */
export interface SheetOverview {
  readonly name: string
  readonly dimension: string
  readonly cells: number
  readonly formulas: number
  readonly shadedEmpty: number
  readonly sample: string[]
}

const CONVERTIBLE = new Set(['.xls', '.ods', '.csv', '.xlsm'])

/** @returns the 1-based column number of A1 column letters. */
export function columnFromLetters(letters: string): number {
  let n = 0
  for (let i = 0; i < letters.length; i += 1) n = n * 26 + letters.charCodeAt(i) - 64
  return n
}

let converterPromise: Promise<Converter> | undefined

/** @returns the shared LibreOffice converter, created on first use. */
export function converter(): Promise<Converter> {
  converterPromise ??= createConverter({ timeoutMs: 180_000 })
  return converterPromise
}

/** Dispose the shared converter (plugin teardown). */
export async function disposeConverter(): Promise<void> {
  const pending = converterPromise
  converterPromise = undefined
  if (pending !== undefined) await (await pending).dispose()
}

async function scratch(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'eqidis-workbook-'))
}

/**
 * An `.xlsx` path for reading any spreadsheet: `.xls`, `.ods`, `.csv` and `.xlsm` are converted
 * to a temporary `.xlsx` with LibreOffice.
 * @returns the readable path and a cleanup.
 */
export async function asXlsx(path: string): Promise<{ path: string; cleanup: () => Promise<void> }> {
  const extension = extname(path).toLowerCase()
  if (!CONVERTIBLE.has(extension)) return { path, cleanup: async () => {} }
  const dir = await scratch()
  const input = join(dir, `input${extension}`)
  await copyFile(path, input)
  const output = join(dir, `${basename(path, extension)}.xlsx`)
  await (await converter()).convert({ inputPath: input, outputPath: output })
  return { path: output, cleanup: () => rm(dir, { recursive: true, force: true }) }
}

export async function load(path: string): Promise<ExcelJS.Workbook> {
  const readable = await asXlsx(path)
  try {
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.readFile(readable.path)
    return workbook
  } finally {
    await readable.cleanup()
  }
}

export function plain(value: ExcelJS.CellValue): string | number | boolean | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') return value
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (typeof value === 'object') {
    if ('result' in value) return plain(value.result)
    if ('richText' in value) return value.richText.map(part => part.text).join('')
    if ('text' in value && typeof value.text === 'string') return value.text
    if ('error' in value) return value.error
    if ('formula' in value || 'sharedFormula' in value) return null
  }
  return JSON.stringify(value)
}

export function formulaOf(cell: ExcelJS.Cell): string | undefined {
  const formula = cell.formula
  return typeof formula === 'string' && formula !== '' ? formula : undefined
}

function fillOf(cell: ExcelJS.Cell): string | undefined {
  const fill = cell.fill as ExcelJS.FillPattern | undefined
  if (fill?.type !== 'pattern' || fill.pattern === 'none') return undefined
  const color = fill.fgColor?.argb ?? (fill.fgColor?.theme !== undefined ? `tema${fill.fgColor.theme}` : undefined)
  return color === undefined || color === 'FFFFFFFF' ? undefined : color
}

function shown(cell: ExcelJS.Cell): string | number | boolean | null {
  // A formula's cached result lives on `cell.result` (ExcelJS omits falsy results from the value object).
  if (formulaOf(cell) !== undefined) return plain((cell as unknown as { result?: ExcelJS.CellValue }).result ?? null)
  return plain(cell.value)
}

export function view(cell: ExcelJS.Cell): CellView {
  const formula = formulaOf(cell)
  const fill = fillOf(cell)
  const format = cell.numFmt && cell.numFmt !== 'General' ? cell.numFmt : undefined
  const mergedInto = cell.isMerged && cell.master.address !== cell.address ? cell.master.address : undefined
  return {
    cell: cell.address,
    value: shown(cell),
    ...(formula === undefined ? {} : { formula }),
    ...(fill === undefined ? {} : { fill }),
    ...(format === undefined ? {} : { format }),
    ...(mergedInto === undefined ? {} : { mergedInto }),
  }
}

/** @returns sheet overviews of any spreadsheet. */
export async function describe(path: string): Promise<{ sheets: SheetOverview[]; definedNames: string[] }> {
  const workbook = await load(path)
  const sheets: SheetOverview[] = workbook.worksheets.map((sheet) => {
    let cells = 0
    let formulas = 0
    let shadedEmpty = 0
    const sample: string[] = []
    sheet.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: true }, (cell) => {
        const value = plain(cell.value)
        if (formulaOf(cell) !== undefined) formulas += 1
        if (value !== null && value !== '') {
          cells += 1
          if (typeof value === 'string' && sample.length < 12 && value.trim().length > 2) sample.push(`${cell.address}: ${value.slice(0, 60)}`)
        } else if (fillOf(cell) !== undefined && formulaOf(cell) === undefined) {
          shadedEmpty += 1
        }
      })
    })
    return { name: sheet.name, dimension: sheet.dimensions.range, cells, formulas, shadedEmpty, sample }
  })
  const definedNames = (workbook.definedNames as unknown as { model: { name: string; ranges: string[] }[] }).model
    .map(entry => `${entry.name} = ${entry.ranges.join(', ')}`).slice(0, 50)
  return { sheets, definedNames }
}

export function decodeRange(range: string): { top: number; left: number; bottom: number; right: number } {
  const match = /^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/u.exec(range.toUpperCase().replaceAll('$', ''))
  if (match === null) throw new Error(`Rango inválido: ${range}. Usa el formato A1:H40.`)
  const top = Number(match[2])
  const left = columnFromLetters(match[1] ?? 'A')
  return { top, left, bottom: Number(match[4] ?? match[2]), right: match[3] === undefined ? left : columnFromLetters(match[3]) }
}

export function sheetOf(workbook: ExcelJS.Workbook, name: string): ExcelJS.Worksheet {
  const sheet = workbook.getWorksheet(name)
    ?? workbook.worksheets.find(candidate => candidate.name.trim().toLowerCase() === name.trim().toLowerCase())
  if (sheet === undefined) throw new Error(`No existe la hoja «${name}». Hojas: ${workbook.worksheets.map(s => s.name).join(', ')}`)
  return sheet
}

/**
 * Read a rectangle of one sheet: non-empty cells, plus empty shaded cells (likely input cells).
 * @returns the cells and whether the limit truncated them.
 */
/** A rectangle of cells read from one sheet. */
export interface RangeRead { sheet: string; range: string; cells: CellView[]; truncated: boolean }

export async function readRange(path: string, sheetName: string, range: string | undefined, limit = 600): Promise<RangeRead> {
  const workbook = await load(path)
  const sheet = sheetOf(workbook, sheetName)
  const area = decodeRange(range ?? sheet.dimensions.range)
  const cells: CellView[] = []
  let truncated = false
  for (let r = area.top; r <= area.bottom && !truncated; r += 1) {
    for (let c = area.left; c <= area.right; c += 1) {
      const cell = sheet.getCell(r, c)
      const seen = view(cell)
      if ((seen.value === null || seen.value === '') && seen.formula === undefined && seen.fill === undefined) continue
      if (cells.length >= limit) { truncated = true; break }
      cells.push(seen)
    }
  }
  return { sheet: sheet.name, range: range ?? sheet.dimensions.range, cells, truncated }
}

function normalize(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/\s+/gu, ' ').trim()
}

/** @returns cells whose text contains every word of the query, across all sheets. */
/** A label found by text search, with the cells to its right. */
export interface FoundLabel { sheet: string; cell: string; text: string; right: CellView[] }

export async function find(path: string, query: string, limit = 40): Promise<FoundLabel[]> {
  const workbook = await load(path)
  const words = normalize(query).split(' ').filter(Boolean)
  const hits: FoundLabel[] = []
  for (const sheet of workbook.worksheets) {
    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      row.eachCell((cell, colNumber) => {
        const value = plain(cell.value)
        if (hits.length >= limit || typeof value !== 'string') return
        const text = normalize(value)
        if (!words.every(word => text.includes(word))) return
        // The cells to the right usually hold the figure or the input for a label.
        const right: CellView[] = []
        for (let c = colNumber + 1; c <= Math.min(colNumber + 6, sheet.columnCount + 1); c += 1) {
          const neighbour = view(sheet.getCell(rowNumber, c))
          if (neighbour.value !== null || neighbour.formula !== undefined || neighbour.fill !== undefined) right.push(neighbour)
        }
        hits.push({ sheet: sheet.name, cell: cell.address, text: value, right })
      })
    })
  }
  return hits
}

/** One table row: its sheet row number and cells by column header. */
export interface TableRow { readonly row: number; readonly values: Record<string, string | number | null> }

/** Options of a table read. */
export interface TableOptions {
  headerRow?: number | undefined
  contains?: string | undefined
  limit?: number | undefined
  offset?: number | undefined
}

/** A row that sums others («Sumas iguales», «Total cuenta», «Totales»); summing it again would double count. */
const SUMMARY = /^(sumas?\b|totale?s?\b|gran total\b)/u

/**
 * Read a ledger-like table (trial balance, ledger details): header detection, optional
 * filter by text in any column, and column totals computed exactly. The table's own
 * total rows are left out of the totals and returned apart, to cross-check them.
 */
export async function table(path: string, sheetName: string | undefined, options: TableOptions): Promise<{
  sheet: string
  headerRow: number
  columns: string[]
  rows: TableRow[]
  matched: number
  totals: Record<string, number>
  summaryRows: TableRow[]
}> {
  const workbook = await load(path)
  const sheet = sheetName === undefined ? workbook.worksheets[0] : sheetOf(workbook, sheetName)
  if (sheet === undefined) throw new Error('El libro no tiene hojas.')
  let headerRow = options.headerRow ?? 0
  if (headerRow === 0) {
    // The header is the first row with at least three text cells followed by a row with numbers.
    for (let r = 1; r <= Math.min(sheet.rowCount, 40) && headerRow === 0; r += 1) {
      const texts = (sheet.getRow(r).values as ExcelJS.CellValue[]).filter(v => typeof plain(v) === 'string' && String(plain(v)).trim() !== '')
      if (texts.length >= 3) headerRow = r
    }
  }
  if (headerRow === 0) throw new Error('No encontré una fila de encabezados; indica headerRow.')
  const header = sheet.getRow(headerRow)
  const columns: string[] = []
  const index: number[] = []
  header.eachCell({ includeEmpty: false }, (cell, col) => {
    const name = String(plain(cell.value) ?? '').trim()
    if (name !== '') { columns.push(columns.includes(name) ? `${name} (${cell.address})` : name); index.push(col) }
  })
  const needle = options.contains === undefined ? undefined : normalize(options.contains)
  const rows: TableRow[] = []
  const totals: Record<string, number> = {}
  const summaryRows: TableRow[] = []
  let matched = 0
  const offset = options.offset ?? 0
  const limit = options.limit ?? 200
  for (let r = headerRow + 1; r <= sheet.rowCount; r += 1) {
    const values: Record<string, string | number | null> = {}
    for (const [i, col] of index.entries()) {
      const value = plain(sheet.getCell(r, col).value)
      values[columns[i] as string] = typeof value === 'boolean' ? String(value) : value
    }
    if (Object.values(values).every(value => value === null || value === '')) continue
    if (needle !== undefined && !Object.values(values).some(v => v !== null && normalize(String(v)).includes(needle))) continue
    if (Object.values(values).some(v => typeof v === 'string' && SUMMARY.test(normalize(v).trim()))) {
      summaryRows.push({ row: r, values })
      continue
    }
    matched += 1
    for (const [key, value] of Object.entries(values)) if (typeof value === 'number') totals[key] = Math.round(((totals[key] ?? 0) + value) * 100) / 100
    if (matched > offset && rows.length < limit) rows.push({ row: r, values })
  }
  return { sheet: sheet.name, headerRow, columns, rows, matched, totals, summaryRows }
}

// ── writing: edit only the target cells inside the package ────────────────────

function escapeXml(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}

function columnNumber(address: string): number {
  return columnFromLetters(/^[A-Z]+/u.exec(address)?.[0] ?? 'A')
}

function sheetPaths(files: Record<string, Uint8Array>): Map<string, string> {
  const workbook = strFromU8(files['xl/workbook.xml'] as Uint8Array)
  const rels = strFromU8(files['xl/_rels/workbook.xml.rels'] as Uint8Array)
  const targets = new Map<string, string>()
  for (const match of rels.matchAll(/<Relationship\b[^>]*>/gu)) {
    const id = /\bId="([^"]+)"/u.exec(match[0])?.[1]
    const target = /\bTarget="([^"]+)"/u.exec(match[0])?.[1]
    if (id !== undefined && target !== undefined) targets.set(id, target.startsWith('/') ? target.slice(1) : `xl/${target}`)
  }
  const sheets = new Map<string, string>()
  for (const match of workbook.matchAll(/<sheet\b[^>]*>/gu)) {
    const name = /\bname="([^"]+)"/u.exec(match[0])?.[1]
    const id = /\br:id="([^"]+)"/u.exec(match[0])?.[1]
    const target = id === undefined ? undefined : targets.get(id)
    if (name !== undefined && target !== undefined) {
      sheets.set(name.replaceAll('&amp;', '&').replaceAll('&quot;', '"').replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&apos;', "'"), target)
    }
  }
  return sheets
}

/** One value to write. */
export interface CellWrite { readonly sheet: string; readonly cell: string; readonly value: number | string | null }

function cellXml(address: string, style: string, value: number | string | null): string {
  const s = style === '' ? '' : ` s="${style}"`
  if (value === null || value === '') return `<c r="${address}"${s}/>`
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`Valor no numérico para ${address}.`)
    return `<c r="${address}"${s}><v>${value}</v></c>`
  }
  return `<c r="${address}"${s} t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`
}

function writeIntoSheet(xml: string, address: string, value: number | string | null, allowFormula: boolean,
  build: (style: string) => string = style => cellXml(address, style, value)): string {
  const row = Number(/\d+$/u.exec(address)?.[0])
  const cellPattern = new RegExp(`<c r="${address}"(?=[\\s/>])[^>]*?(?:/>|>[\\s\\S]*?</c>)`, 'u')
  const existing = cellPattern.exec(xml)
  if (existing !== null) {
    if (!allowFormula && /<f[\s>/]/u.test(existing[0])) {
      throw new Error(`${address} tiene una fórmula del papel de trabajo; no se sobrescribe.`)
    }
    const style = /\bs="(\d+)"/u.exec(existing[0])?.[1] ?? ''
    return xml.replace(existing[0], build(style))
  }
  const rowPattern = new RegExp(`<row r="${row}"(?=[\\s/>])[^>]*?(?:/>|>[\\s\\S]*?</row>)`, 'u')
  const rowMatch = rowPattern.exec(xml)
  const fresh = build('')
  if (rowMatch !== null) {
    const rowXml = rowMatch[0]
    if (rowXml.endsWith('/>')) return xml.replace(rowXml, `${rowXml.slice(0, -2)}>${fresh}</row>`)
    const column = columnNumber(address)
    // Insert before the first cell to the right, keeping the row ordered.
    let insertAt = rowXml.lastIndexOf('</row>')
    for (const cell of rowXml.matchAll(/<c r="([A-Z]+)\d+"/gu)) {
      if (columnNumber(cell[1] as string) > column) { insertAt = cell.index; break }
    }
    return xml.replace(rowXml, `${rowXml.slice(0, insertAt)}${fresh}${rowXml.slice(insertAt)}`)
  }
  const sheetData = /<sheetData\s*\/>|<sheetData>([\s\S]*?)<\/sheetData>/u.exec(xml)
  if (sheetData === null) throw new Error('La hoja no tiene datos editables.')
  const newRow = `<row r="${row}">${fresh}</row>`
  if (sheetData[0].startsWith('<sheetData/') || sheetData[0].startsWith('<sheetData /')) return xml.replace(sheetData[0], `<sheetData>${newRow}</sheetData>`)
  const body = sheetData[1] ?? ''
  let insertAt = body.length
  for (const existingRow of body.matchAll(/<row r="(\d+)"/gu)) {
    if (Number(existingRow[1]) > row) { insertAt = existingRow.index; break }
  }
  return xml.replace(sheetData[0], `<sheetData>${body.slice(0, insertAt)}${newRow}${body.slice(insertAt)}</sheetData>`)
}

/**
 * Write values into an `.xlsx` in place, touching only the target cells: styles, formulas,
 * charts and every other part of the company's workbook stay as they are. Excel recalculates
 * the whole workbook when the file is opened.
 */
export async function writeCells(path: string, writes: readonly CellWrite[], allowFormula = false): Promise<void> {
  if (extname(path).toLowerCase() !== '.xlsx') throw new Error('Solo se escribe en copias .xlsx de papeles de trabajo.')
  const files = unzipSync(new Uint8Array(await readFile(path)))
  const sheets = sheetPaths(files)
  const edits = new Map<string, string>()
  for (const write of writes) {
    const name = [...sheets.keys()].find(key => key === write.sheet)
      ?? [...sheets.keys()].find(key => key.trim().toLowerCase() === write.sheet.trim().toLowerCase())
    if (name === undefined) throw new Error(`No existe la hoja «${write.sheet}». Hojas: ${[...sheets.keys()].join(', ')}`)
    const part = sheets.get(name) as string
    const address = write.cell.toUpperCase().replaceAll('$', '')
    if (!/^[A-Z]{1,3}\d{1,7}$/u.test(address)) throw new Error(`Celda inválida: ${write.cell}`)
    edits.set(part, writeIntoSheet(edits.get(part) ?? strFromU8(files[part] as Uint8Array), address, write.value, allowFormula))
  }
  for (const [part, xml] of edits) files[part] = strToU8(xml)
  await savePackage(path, files)
}

/** Ask Excel to recalculate on open, drop the stale calculation chain and save the package. */
async function savePackage(path: string, files: Record<string, Uint8Array>): Promise<void> {
  let workbook = strFromU8(files['xl/workbook.xml'] as Uint8Array)
  workbook = /<calcPr\b/u.test(workbook)
    ? workbook.replace(/<calcPr\b([^>]*?)\/?>/u, (tag, attrs: string) => tag.includes('fullCalcOnLoad') ? tag : `<calcPr${attrs} fullCalcOnLoad="1"/>`)
    : workbook.replace('</workbook>', '<calcPr fullCalcOnLoad="1"/></workbook>')
  files['xl/workbook.xml'] = strToU8(workbook)
  // A stale calculation chain can make Excel repair the file; it is rebuilt on open.
  delete files['xl/calcChain.xml']
  if (files['[Content_Types].xml'] !== undefined) {
    files['[Content_Types].xml'] = strToU8(strFromU8(files['[Content_Types].xml']).replace(/<Override PartName="\/xl\/calcChain\.xml"[^>]*\/>/u, ''))
  }
  const rels = strFromU8(files['xl/_rels/workbook.xml.rels'] as Uint8Array)
  files['xl/_rels/workbook.xml.rels'] = strToU8(rels.replace(/<Relationship\b[^>]*Target="calcChain\.xml"[^>]*\/>/u, ''))
  await writeFile(path, zipSync(files, { level: 6 }))
}

function sheetPart(files: Record<string, Uint8Array>, sheet: string): string {
  const sheets = sheetPaths(files)
  const name = [...sheets.keys()].find(key => key === sheet)
    ?? [...sheets.keys()].find(key => key.trim().toLowerCase() === sheet.trim().toLowerCase())
  if (name === undefined) throw new Error(`No existe la hoja «${sheet}». Hojas: ${[...sheets.keys()].join(', ')}`)
  return sheets.get(name) as string
}

export function lettersOf(column: number): string {
  let letters = ''
  for (let n = column; n > 0; n = Math.floor((n - 1) / 26)) letters = String.fromCharCode(65 + ((n - 1) % 26)) + letters
  return letters
}

/** A rectangular block of cell values read from a sheet. */
export interface Grid { sheet: string; range: string; rows: (number | string | null)[][] }

/** Cell values of a sheet area as a grid (formula cells give their cached result). */
export async function readGrid(path: string, sheetName: string | undefined, range: string | undefined): Promise<Grid> {
  const workbook = await load(path)
  const sheet = sheetName === undefined ? workbook.worksheets[0] : sheetOf(workbook, sheetName)
  if (sheet === undefined) throw new Error('El libro no tiene hojas.')
  let top = 1, left = 1, bottom = sheet.rowCount, right = sheet.columnCount
  if (range !== undefined && range.trim() !== '') {
    const match = /^\$?([A-Z]+)\$?(\d+):\$?([A-Z]+)\$?(\d+)$/u.exec(range.trim().toUpperCase())
    if (match === null) throw new Error(`Rango inválido: ${range}`)
    left = columnFromLetters(match[1] as string)
    top = Number(match[2])
    right = columnFromLetters(match[3] as string)
    bottom = Number(match[4])
  }
  const rows: (number | string | null)[][] = []
  for (let r = top; r <= bottom; r += 1) {
    const row: (number | string | null)[] = []
    for (let c = left; c <= right; c += 1) {
      const value = plain(sheet.getCell(r, c).value)
      row.push(typeof value === 'boolean' ? String(value) : value)
    }
    rows.push(row)
  }
  return { sheet: sheet.name, range: `${lettersOf(left)}${top}:${lettersOf(right)}${bottom}`, rows }
}

/**
 * Paste a grid of values into a sheet of an `.xlsx` in one pass, starting at `start`, and blank the
 * rest of that column span down to `clearToRow` so a shorter grid leaves no stale rows behind.
 * Refuses to touch formula cells; keeps each cell's style.
 * @returns the area written.
 */
export async function pasteGrid(path: string, sheet: string, start: string, grid: readonly (readonly (number | string | null)[])[],
  clearToRow?: number): Promise<{ range: string; cells: number }> {
  if (extname(path).toLowerCase() !== '.xlsx') throw new Error('Solo se escribe en copias .xlsx de papeles de trabajo.')
  const anchor = /^\$?([A-Z]{1,3})\$?(\d{1,7})$/u.exec(start.trim().toUpperCase())
  if (anchor === null) throw new Error(`Celda inválida: ${start}`)
  const left = columnFromLetters(anchor[1] as string)
  const top = Number(anchor[2])
  const width = Math.max(0, ...grid.map(row => row.length))
  const bottom = Math.max(top + grid.length - 1, clearToRow ?? 0)
  const files = unzipSync(new Uint8Array(await readFile(path)))
  const part = sheetPart(files, sheet)
  const xml = strFromU8(files[part] as Uint8Array)
  const data = /<sheetData\s*\/>|<sheetData>([\s\S]*?)<\/sheetData>/u.exec(xml)
  if (data === null) throw new Error('La hoja no tiene datos editables.')
  const rows = new Map<number, { attrs: string; cells: Map<number, string> }>()
  for (const match of (data[1] ?? '').matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/gu)) {
    const number = Number(/\br="(\d+)"/u.exec(match[1] as string)?.[1])
    const cells = new Map<number, string>()
    for (const cell of (match[2] ?? '').matchAll(/<c\b[^>]*?(?:\/>|>[\s\S]*?<\/c>)/gu)) {
      const address = /\br="([A-Z]+)\d+"/u.exec(cell[0])?.[1]
      if (address !== undefined) cells.set(columnFromLetters(address), cell[0])
    }
    rows.set(number, { attrs: (match[1] as string).replace(/\s+spans="[^"]*"/u, ''), cells })
  }
  let written = 0
  for (let r = top; r <= bottom; r += 1) {
    const source = grid[r - top]
    for (let c = left; c < left + width; c += 1) {
      const value = source?.[c - left] ?? null
      const row = rows.get(r) ?? { attrs: ` r="${r}"`, cells: new Map<number, string>() }
      const existing = row.cells.get(c)
      if (existing === undefined && (value === null || value === '')) continue
      if (existing !== undefined && /<f[\s>/]/u.test(existing)) {
        throw new Error(`${lettersOf(c)}${r} tiene una fórmula del papel de trabajo; no se sobrescribe.`)
      }
      const style = existing === undefined ? '' : /\bs="(\d+)"/u.exec(existing)?.[1] ?? ''
      if ((value === null || value === '') && style === '') row.cells.delete(c)
      else row.cells.set(c, cellXml(`${lettersOf(c)}${r}`, style, value))
      rows.set(r, row)
      if (value !== null && value !== '') written += 1
    }
  }
  const body = [...rows.entries()].sort(([a], [b]) => a - b).map(([, row]) => {
    const cells = [...row.cells.entries()].sort(([a], [b]) => a - b).map(([, cell]) => cell).join('')
    return cells === '' ? `<row${row.attrs}/>` : `<row${row.attrs}>${cells}</row>`
  }).join('')
  files[part] = strToU8(xml.replace(data[0], `<sheetData>${body}</sheetData>`))
  await savePackage(path, files)
  return { range: `${lettersOf(left)}${top}:${lettersOf(left + width - 1)}${bottom}`, cells: written }
}

/**
 * Excel answers `XLOOKUP` of a blank lookup value with the blank's row (0) where LibreOffice answers
 * `#N/A`, which then spreads through every total. Rewrite each `XLOOKUP(value, …)` whose value is a
 * plain cell reference as `IF(ISBLANK(value), 0, XLOOKUP(…))`, only in the scratch copy LibreOffice recalculates.
 */
export function excelLookupCompat(formula: string): string {
  const name = '_xlfn.XLOOKUP('
  let out = ''
  let i = 0
  while (i < formula.length) {
    const at = formula.indexOf(name, i)
    if (at < 0) { out += formula.slice(i); break }
    out += formula.slice(i, at)
    let depth = 0
    let end = -1
    let quoted = false
    for (let j = at + name.length - 1; j < formula.length; j += 1) {
      const ch = formula[j]
      if (ch === '"') quoted = !quoted
      if (quoted) continue
      if (ch === '(') depth += 1
      if (ch === ')') { depth -= 1; if (depth === 0) { end = j; break } }
    }
    if (end < 0) { out += formula.slice(at); break }
    const call = formula.slice(at, end + 1)
    const inner = excelLookupCompat(call.slice(name.length, -1))
    const first = /^\s*((?:'[^']+'|[A-Za-z_][\w. ]*)!)?\$?[A-Z]{1,3}\$?\d+(?=\s*,)/u.exec(inner)?.[0]
    out += first === undefined ? `${name}${inner})` : `IF(ISBLANK(${first.trim()}),0,${name}${inner}))`
    i = end + 1
  }
  return out
}

function shimFormulas(files: Record<string, Uint8Array>): boolean {
  let changed = false
  for (const [part, bytes] of Object.entries(files)) {
    if (!/^xl\/worksheets\/sheet\d+\.xml$/u.test(part)) continue
    const xml = strFromU8(bytes)
    if (!xml.includes('_xlfn.XLOOKUP(')) continue
    const unescaped = (text: string) => text.replaceAll('&quot;', '"').replaceAll('&apos;', "'").replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&')
    files[part] = strToU8(xml.replace(/(<f\b[^>]*>)([^<]*)(<\/f>)/gu, (_whole, open: string, body: string, close: string) =>
      body.includes('_xlfn.XLOOKUP(') ? `${open}${escapeXml(excelLookupCompat(unescaped(body)))}${close}` : `${open}${body}${close}`))
    changed = true
  }
  return changed
}

/** One formula to set. */
export interface FormulaWrite { readonly sheet: string; readonly cell: string; readonly formula: string }

/**
 * Set formulas in an `.xlsx` in place (for example, to point a summary sheet at the new month's column),
 * keeping each cell's style. Refuses the head cell of a shared or array formula, whose neighbours depend on it.
 * @returns the formula each cell had before, `null` when it held a value or nothing.
 */
export async function writeFormulas(path: string, writes: readonly FormulaWrite[]): Promise<Record<string, string | null>> {
  if (extname(path).toLowerCase() !== '.xlsx') throw new Error('Solo se escribe en copias .xlsx de papeles de trabajo.')
  const files = unzipSync(new Uint8Array(await readFile(path)))
  const edits = new Map<string, string>()
  const previous: Record<string, string | null> = {}
  for (const write of writes) {
    const part = sheetPart(files, write.sheet)
    const address = write.cell.toUpperCase().replaceAll('$', '')
    if (!/^[A-Z]{1,3}\d{1,7}$/u.test(address)) throw new Error(`Celda inválida: ${write.cell}`)
    const formula = write.formula.trim().replace(/^=/u, '')
    if (formula === '') throw new Error(`Fórmula vacía para ${address}.`)
    const xml = edits.get(part) ?? strFromU8(files[part] as Uint8Array)
    const existing = new RegExp(`<c r="${address}"(?=[\\s/>])[^>]*?(?:/>|>[\\s\\S]*?</c>)`, 'u').exec(xml)?.[0]
    const head = existing === undefined ? undefined : /<f\b([^>]*)>([^<]*)<\/f>|<f\b([^>]*)\/>/u.exec(existing)
    if (head !== undefined && head !== null) {
      const attrs = head[1] ?? head[3] ?? ''
      if (/\bt="array"/u.test(attrs) || (/\bt="shared"/u.test(attrs) && /\bref="/u.test(attrs))) {
        throw new Error(`${write.sheet}!${address} es la celda principal de una fórmula compartida o matricial; escribe cada celda del rango por separado.`)
      }
    }
    previous[`${write.sheet}!${address}`] = head?.[2] === undefined || head[2] === '' ? null : head[2]
      .replaceAll('&quot;', '"').replaceAll('&apos;', "'").replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&')
    edits.set(part, writeIntoSheet(xml, address, null, true, style =>
      `<c r="${address}"${style === '' ? '' : ` s="${style}"`}><f>${escapeXml(formula)}</f></c>`))
  }
  for (const [part, xml] of edits) files[part] = strToU8(xml)
  await savePackage(path, files)
  return previous
}

/** Result of recalculating a workbook. */
export interface Calculation {
  /** Requested cells with their recalculated values. */
  readonly values: CellView[]
  /** Every formula cell whose result is an error (#REF!, #DIV/0!, …). */
  readonly errors: CellView[]
}

/**
 * Recalculate a copy of the workbook with LibreOffice and read results; the file itself is untouched.
 * @param cells - `Hoja!A1` addresses or `Hoja!A1:B9` ranges to report.
 */
export async function calculate(path: string, cells: readonly string[]): Promise<Calculation> {
  const dir = await scratch()
  try {
    const input = join(dir, `entrada${extname(path).toLowerCase()}`)
    await copyFile(path, input)
    if (extname(path).toLowerCase() === '.xlsx') {
      const files = unzipSync(new Uint8Array(await readFile(input)))
      if (shimFormulas(files)) await writeFile(input, zipSync(files, { level: 1 }))
    }
    const output = join(dir, 'calculado.xlsx')
    await (await converter()).recalculate({ inputPath: input, outputPath: output })
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.readFile(output)
    const values: CellView[] = []
    for (const reference of cells) {
      const bang = reference.lastIndexOf('!')
      if (bang < 0) throw new Error(`Usa Hoja!Celda: ${reference}`)
      const sheet = sheetOf(workbook, reference.slice(0, bang).replace(/^'|'$/gu, ''))
      const area = decodeRange(reference.slice(bang + 1))
      for (let r = area.top; r <= area.bottom; r += 1) {
        for (let c = area.left; c <= area.right; c += 1) values.push({ ...view(sheet.getCell(r, c)), cell: `${sheet.name}!${sheet.getCell(r, c).address}` })
      }
    }
    const errors: CellView[] = []
    for (const sheet of workbook.worksheets) {
      sheet.eachRow({ includeEmpty: false }, (row) =>{  row.eachCell((cell) => {
        const value = cell.value as { result?: unknown } | null
        const result = value !== null && typeof value === 'object' ? value.result : undefined
        if (result !== null && typeof result === 'object' && 'error' in (result)) {
          errors.push({ ...view(cell), cell: `${sheet.name}!${cell.address}` })
        }
      }) })
    }
    return { values, errors }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

/**
 * Make an `.xlsx` working copy of a template (an `.xls` or `.ods` template is converted).
 * Refuses to overwrite an existing copy.
 */
export async function copyTemplate(template: string, destination: string): Promise<void> {
  await mkdir(join(destination, '..'), { recursive: true })
  try {
    await stat(destination)
    throw new Error(`Ya existe ${basename(destination)}; elige otro nombre o continúa sobre esa copia.`)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  const readable = await asXlsx(template)
  try {
    await copyFile(readable.path, destination)
  } finally {
    await readable.cleanup()
  }
}
