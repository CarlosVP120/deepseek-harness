import { expect, it } from 'vitest'
import { compactCells, compareGrids, formulaSignature, referencedAreas } from '../src/analysis.ts'

it('treats a lookup filled down with absolute rows as one pattern', () => {
  expect(formulaSignature('_xlfn.XLOOKUP($C$7,TB!BU:BU,TB!BZ:BZ)', 7, 20)).toBe(formulaSignature('_xlfn.XLOOKUP($C$8,TB!BU:BU,TB!BZ:BZ)', 8, 20))
  expect(formulaSignature('SUM(T7:T15)', 16, 20)).toBe(formulaSignature('SUM(U7:U15)', 16, 21))
  expect(formulaSignature('"A1"&B2', 1, 1)).toContain('"A1"')
})

it('collapses three or more filled-down formulas and keeps the others as cells', () => {
  const cells = [
    { cell: 'T7', value: 1, formula: 'XLOOKUP($C$7,A:A,B:B)' }, { cell: 'T8', value: 2, formula: 'XLOOKUP($C$8,A:A,B:B)' },
    { cell: 'T9', value: 3, formula: 'XLOOKUP($C$9,A:A,B:B)' }, { cell: 'T10', value: 4, formula: 'XLOOKUP($C$10,A:A,B:B)+1' },
    { cell: 'B7', value: 'Ventas' },
  ]
  expect(compactCells(cells)).toEqual([
    { celdas: 'T7:T9', formula: 'XLOOKUP($C$7,A:A,B:B)', valores: [1, 2, 3] },
    { cell: 'T10', value: 4, formula: 'XLOOKUP($C$10,A:A,B:B)+1' },
    { cell: 'B7', value: 'Ventas' },
  ])
})

it('compares two blocks by account and reports only what differs', () => {
  const a = { sheet: 'TB', range: 'BU1:BW4', rows: [['Cuenta', 'Nombre', 'Saldo'], ['101', 'Caja', 10], ['102', 'Bancos', 20], ['103', 'Clientes', 5]] }
  const b = { sheet: 'Balanza', range: 'A1:C4', rows: [['Cuenta', 'Nombre', 'Saldo'], ['102', 'Bancos', 20.001], ['101', 'Caja', 12], ['104', 'Otros', 1]] }
  expect(compareGrids(a, b, 1)).toEqual({
    filas_a: 4, filas_b: 4, iguales: 2, con_diferencias: 1, solo_en_a: ['103'], solo_en_b: ['104'],
    diferencias: [{ fila: '101', columna: 3, a: 10, b: 12 }],
  })
})

it('finds the areas a formula reads, including other sheets and whole columns', () => {
  expect(referencedAreas('Income Tax', "_xlfn.XLOOKUP($C$7,TB!BU:BU,TB!BZ:BZ)+'Pérdidas Ej'!L28+LOG10(2)").map(area => `${area.sheet}:${area.left}-${area.right}:${area.top}`))
    .toEqual(['Income Tax:3-3:7', 'TB:73-73:1', 'TB:78-78:1', 'Pérdidas Ej:12-12:28'])
})
