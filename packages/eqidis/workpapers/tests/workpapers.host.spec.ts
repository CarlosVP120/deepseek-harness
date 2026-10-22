import { mkdir, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import ExcelJS from 'exceljs'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { calculate, copyTemplate, describe, disposeConverter, excelLookupCompat, find, pasteGrid, readGrid, table, writeCells, writeFormulas } from '../src/workbook.ts'
import { inside, isOutput, readable, storeInput, templates, TEMPLATES_DIR } from '../src/project.ts'

let root: string
const INPUT = { argb: 'FFFFF2CC' }

beforeAll(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'eqidis-workpapers-')))
  await mkdir(join(root, TEMPLATES_DIR), { recursive: true })
  // A template with an unusual layout: labels in column B, captures shaded in D.
  const template = new ExcelJS.Workbook()
  const sheet = template.addWorksheet('Cálculo')
  sheet.getCell('B3').value = 'Ingresos del mes'
  sheet.getCell('B4').value = 'Coeficiente de utilidad'
  sheet.getCell('B6').value = 'Utilidad estimada'
  for (const cell of ['D3', 'D4']) sheet.getCell(cell).fill = { type: 'pattern', pattern: 'solid', fgColor: INPUT }
  sheet.getCell('D6').value = { formula: 'D3*D4' }
  await template.xlsx.writeFile(join(root, TEMPLATES_DIR, 'Utilidad.xlsx'))
  // A trial balance with its header below a title block.
  const balance = new ExcelJS.Workbook()
  const rows = balance.addWorksheet('BC')
  rows.getCell('A1').value = 'Balanza de comprobación'
  rows.addRow([])
  rows.getRow(3).values = ['Cuenta', 'Nombre', 'Saldo final']
  rows.getRow(4).values = ['401-01', 'Ventas nacionales', 1000]
  rows.getRow(5).values = ['401-02', 'Ventas extranjeras', 250.5]
  rows.getRow(6).values = ['501-01', 'Costo de ventas', 600]
  rows.getRow(7).values = ['', 'Sumas iguales', 1850.5]
  await balance.xlsx.writeFile(join(root, 'attachment-balanza.xlsx'))
})
afterAll(async () => { await disposeConverter() })

it('reads an unknown template and trial balance without assuming their layout', async () => {
  expect(await templates(root)).toEqual(['Utilidad.xlsx'])
  const overview = await describe(join(root, TEMPLATES_DIR, 'Utilidad.xlsx'))
  expect(overview.sheets[0]?.name).toBe('Cálculo')
  const found = await find(join(root, TEMPLATES_DIR, 'Utilidad.xlsx'), 'coeficiente utilidad')
  expect(found[0]?.cell).toBe('B4')
  const sales = await table(join(root, 'attachment-balanza.xlsx'), undefined, { contains: '401-' })
  expect(sales.headerRow).toBe(3)
  expect(sales.matched).toBe(2)
  expect(sales.totals['Saldo final']).toBeCloseTo(1250.5)
  const all = await table(join(root, 'attachment-balanza.xlsx'), 'BC', {})
  expect(all.totals['Saldo final']).toBeCloseTo(1850.5)
  expect(all.summaryRows.map(row => row.row)).toEqual([7])
})

it('fills only capture cells of a dated copy and recalculates it', async () => {
  const copy = join(root, 'Papeles de trabajo', '2026-09', 'Utilidad - 2026-09.xlsx')
  await copyTemplate(join(root, TEMPLATES_DIR, 'Utilidad.xlsx'), copy)
  await expect(copyTemplate(join(root, TEMPLATES_DIR, 'Utilidad.xlsx'), copy)).rejects.toThrow('Ya existe')
  expect(await isOutput(root, copy)).toBe(true)
  expect(await isOutput(root, join(root, TEMPLATES_DIR, 'Utilidad.xlsx'))).toBe(false)
  await writeCells(copy, [{ sheet: 'Cálculo', cell: 'D3', value: 1250.5 }, { sheet: 'Cálculo', cell: 'D4', value: 0.2 }])
  await expect(writeCells(copy, [{ sheet: 'Cálculo', cell: 'D6', value: 1 }])).rejects.toThrow('fórmula')
  const result = await calculate(copy, ['Cálculo!D6'])
  expect(result.values[0]?.value).toBeCloseTo(250.1)
  expect(result.errors).toEqual([])
}, 60_000)

it('reads chat attachments outside the project and archives them per period', async () => {
  const outside = await mkdtemp(join(tmpdir(), 'eqidis-attachment-'))
  const attached = join(outside, 'balanza.xlsx')
  await writeFile(attached, await readFile(join(root, 'attachment-balanza.xlsx')))
  expect(await readable(root, attached)).toBe(attached)
  await expect(readable(root, join(outside, 'notes.txt'))).rejects.toThrow()
  await expect(inside(root, attached)).rejects.toThrow('fuera del proyecto')
  const first = await storeInput(root, attached, '2026-09', 'Balanza 2026-09')
  const second = await storeInput(root, attached, '2026-09', 'Balanza 2026-09')
  expect(first).toBe(join(root, 'Insumos', '2026-09', 'Balanza 2026-09.xlsx'))
  expect(second).toBe(join(root, 'Insumos', '2026-09', 'Balanza 2026-09 (2).xlsx'))
})

it('pastes a whole trial balance block in one pass and blanks the stale rows below it', async () => {
  const copy = join(root, 'Papeles de trabajo', '2026-09', 'Bloque - 2026-09.xlsx')
  await copyTemplate(join(root, TEMPLATES_DIR, 'Utilidad.xlsx'), copy)
  await writeCells(copy, [{ sheet: 'Cálculo', cell: 'H9', value: 'viejo' }])
  const grid = await readGrid(join(root, 'attachment-balanza.xlsx'), 'BC', 'A3:C5')
  expect(await pasteGrid(copy, 'Cálculo', 'F7', grid.rows, 9)).toEqual({ range: 'F7:H9', cells: 9 })
  const pasted = await readGrid(copy, 'Cálculo', 'F7:H9')
  expect(pasted.rows).toEqual([['Cuenta', 'Nombre', 'Saldo final'], ['401-01', 'Ventas nacionales', 1000], ['401-02', 'Ventas extranjeras', 250.5]])
  await expect(pasteGrid(copy, 'Cálculo', 'D6', [[1]])).rejects.toThrow('fórmula')
})

it('makes XLOOKUP of a blank value answer 0 as Excel does, only for recalculation', () => {
  expect(excelLookupCompat('_xlfn.XLOOKUP($C$8,TB!BU:BU,TB!BZ:BZ)')).toBe('IF(ISBLANK($C$8),0,_xlfn.XLOOKUP($C$8,TB!BU:BU,TB!BZ:BZ))')
  expect(excelLookupCompat('ROUND(_xlfn.XLOOKUP(C15,TB!BL:BL,TB!BQ:BQ,0),0)/0.16'))
    .toBe('ROUND(IF(ISBLANK(C15),0,_xlfn.XLOOKUP(C15,TB!BL:BL,TB!BQ:BQ,0)),0)/0.16')
  expect(excelLookupCompat('_xlfn.XLOOKUP("x",A:A,B:B)')).toBe('_xlfn.XLOOKUP("x",A:A,B:B)')
})

it('updates formulas in a copy, keeping their style and reporting what each cell had before', async () => {
  const copy = join(root, 'Papeles de trabajo', '2026-09', 'Formulas - 2026-09.xlsx')
  await copyTemplate(join(root, TEMPLATES_DIR, 'Utilidad.xlsx'), copy)
  await writeCells(copy, [{ sheet: 'Cálculo', cell: 'D3', value: 1000 }, { sheet: 'Cálculo', cell: 'D4', value: 0.2 }])
  expect(await writeFormulas(copy, [{ sheet: 'Cálculo', cell: 'D6', formula: '=ROUND(D3*D4*2,0)' }, { sheet: 'Cálculo', cell: 'E6', formula: 'D6+1' }]))
    .toEqual({ 'Cálculo!D6': 'D3*D4', 'Cálculo!E6': null })
  const result = await calculate(copy, ['Cálculo!D6:E6'])
  expect(result.values.map(cell => cell.value)).toEqual([400, 401])
  await expect(writeFormulas(copy, [{ sheet: 'Cálculo', cell: 'D7', formula: '=' }])).rejects.toThrow('vacía')
}, 60_000)
