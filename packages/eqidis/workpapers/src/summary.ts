/**
 * The client-facing executive summary of a filled workpaper: a formatted one-page workbook
 * and its PDF. Amounts are read from the recalculated workpaper by cell, never typed.
 */
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import ExcelJS from 'exceljs'
import { calculate, converter } from './workbook.ts'

/** One line of the summary: a concept and the workpaper cell its amount comes from. */
export interface SummaryLine {
  readonly concepto: string
  readonly celda: string
  readonly nota?: string | undefined
  /** Highlight as the amount the client pays or receives. */
  readonly destacado?: boolean | undefined
}

/** What the summary shows. */
export interface SummaryRequest {
  readonly cliente: string
  readonly periodo: string
  readonly titulo: string
  readonly lineas: readonly SummaryLine[]
  readonly observaciones: readonly string[]
  readonly proximos_pasos: readonly string[]
  readonly preparado_por?: string | undefined
  readonly fuente: string
}

const ACCENT = 'FF664899'
const ACCENT_SOFT = 'FFF1ECF8'
const INK = 'FF2C2C34'
const MUTED = 'FF6B6B76'

function amount(value: string | number | boolean | null | undefined): number | string {
  return typeof value === 'number' ? value : value === null || value === undefined ? '—' : String(value)
}

/** The written summary and the amounts it shows. */
export interface SummaryFiles {
  xlsx: string
  pdf: string
  importes: { concepto: string; celda: string; valor: number | string }[]
}

/**
 * Build the summary next to the workpaper copy.
 * @param copy - recalculated source: the filled workpaper copy.
 * @param folder - where to write both files.
 * @param stem - file name without extension.
 * @returns the written workbook and PDF paths and the amounts used.
 */
export async function writeSummary(copy: string, folder: string, stem: string, request: SummaryRequest): Promise<SummaryFiles> {
  if (request.lineas.length === 0) throw new Error('El resumen necesita al menos una línea con su celda.')
  const calc = await calculate(copy, request.lineas.map(line => line.celda))
  const importes = request.lineas.map((line, i) => ({ concepto: line.concepto, celda: line.celda, valor: amount(calc.values[i]?.value) }))
  const broken = importes.filter(item => typeof item.valor === 'string' && item.valor.startsWith('#'))
  if (broken.length > 0) throw new Error(`Celdas con error en el papel: ${broken.map(item => `${item.celda} ${String(item.valor)}`).join(', ')}.`)

  const workbook = new ExcelJS.Workbook()
  workbook.creator = request.preparado_por ?? 'EQIDIS AI'
  const sheet = workbook.addWorksheet('Resumen ejecutivo', {
    pageSetup: { paperSize: 1 as ExcelJS.PaperSize, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: {
      left: 0.6, right: 0.6, top: 0.7, bottom: 0.7, header: 0.3, footer: 0.3,
    } },
    views: [{ showGridLines: false }],
  })
  sheet.columns = [{ width: 3 }, { width: 46 }, { width: 22 }, { width: 40 }]
  const font = (size: number, bold = false, color = INK): Partial<ExcelJS.Font> => ({ name: 'Calibri', size, bold, color: { argb: color } })
  let row = 2
  const put = (text: string, style: Partial<ExcelJS.Font>, height?: number) => {
    sheet.mergeCells(row, 2, row, 4)
    const cell = sheet.getCell(row, 2)
    cell.value = text
    cell.font = style
    cell.alignment = { wrapText: true, vertical: 'middle' }
    if (height !== undefined) sheet.getRow(row).height = height
    row += 1
  }
  put(request.titulo, font(18, true, ACCENT), 28)
  put(`${request.cliente} · ${request.periodo}`, font(12, true), 18)
  put(`Fecha de elaboración: ${new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}`, font(10, false, MUTED))
  row += 1

  const header = sheet.getRow(row)
  ;['Concepto', 'Importe (MXN)', 'Nota'].forEach((text, i) => {
    const cell = header.getCell(i + 2)
    cell.value = text
    cell.font = font(11, true, 'FFFFFFFF')
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ACCENT } }
    cell.alignment = { vertical: 'middle', horizontal: i === 1 ? 'right' : 'left', indent: 1 }
  })
  header.height = 22
  row += 1
  request.lineas.forEach((line, i) => {
    const current = sheet.getRow(row)
    const value = importes[i]?.valor ?? '—'
    current.getCell(2).value = line.concepto
    current.getCell(3).value = value
    current.getCell(3).numFmt = '$#,##0.00;[Red]-$#,##0.00'
    current.getCell(4).value = line.nota ?? ''
    for (let c = 2; c <= 4; c += 1) {
      const cell = current.getCell(c)
      cell.font = font(11, line.destacado === true)
      cell.alignment = { vertical: 'middle', wrapText: true, horizontal: c === 3 ? 'right' : 'left', indent: 1 }
      cell.border = { bottom: { style: 'hair', color: { argb: 'FFD9D6E0' } } }
      if (line.destacado === true) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ACCENT_SOFT } }
        cell.border = { top: { style: 'thin', color: { argb: ACCENT } }, bottom: { style: 'thin', color: { argb: ACCENT } } }
      }
    }
    current.height = line.nota !== undefined && line.nota.length > 40 ? 32 : 20
    row += 1
  })
  const section = (title: string, items: readonly string[]) => {
    if (items.length === 0) return
    row += 1
    put(title, font(12, true, ACCENT), 20)
    for (const item of items) put(`•  ${item}`, font(11), Math.max(18, Math.ceil(item.length / 95) * 15))
  }
  section('Observaciones', request.observaciones)
  section('Próximos pasos', request.proximos_pasos)
  row += 1
  put(`Cifras tomadas del papel de trabajo «${request.fuente}». ${request.preparado_por === undefined ? '' : `Elaboró: ${request.preparado_por}.`}`, font(9, false, MUTED))
  sheet.pageSetup.printArea = `B2:D${row}`

  await mkdir(folder, { recursive: true })
  const xlsx = join(folder, `${stem}.xlsx`)
  const pdf = join(folder, `${stem}.pdf`)
  await workbook.xlsx.writeFile(xlsx)
  await (await converter()).convert({ inputPath: xlsx, outputPath: pdf })
  return { xlsx, pdf, importes }
}
