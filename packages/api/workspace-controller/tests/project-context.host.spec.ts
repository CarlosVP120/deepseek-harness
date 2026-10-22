import { afterEach, beforeEach, expect, it } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ProjectContextFiles } from '../src/project-context.ts'

let root: string
let files: ProjectContextFiles
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'eqidis-project-')); files = new ProjectContextFiles() })
afterEach(async () => { await rm(root, { recursive: true, force: true }) })
it('saves existing instructions and makes uploaded documents discoverable without erasing local guidance', async () => {
  await writeFile(join(root, 'AGENTS.md'), 'Existing rules')
  await writeFile(join(root, 'AGENTS.local.md'), 'Local rules')
  expect((await files.read(root)).instructions).toBe('Existing rules')
  await files.save(root, 'Updated rules')
  await files.upload(root, 'Company policy.pdf', Buffer.from('document').toString('base64'))
  const fresh = new ProjectContextFiles()
  expect(await fresh.read(root)).toEqual({ maxDocumentBytes: 30 * 1024 * 1024, instructions: 'Updated rules', files: [{ name: 'Company policy.pdf', bytes: 8 }], workpapers: [] })
  const index = await readFile(join(root, 'AGENTS.local.md'), 'utf8')
  expect(index).toContain('Local rules')
  expect(index).toContain('Company policy.pdf')
  await files.remove(root, 'Company policy.pdf')
  expect((await fresh.read(root)).files).toEqual([])
  expect(await readFile(join(root, 'AGENTS.local.md'), 'utf8')).toBe('Local rules')
})
it('refuses paths outside the managed folder, duplicate uploads, and instruction symlinks', async () => {
  await expect(files.upload(root, '../outside.txt', 'YQ==')).rejects.toThrow('valid name')
  await files.upload(root, 'policy.txt', 'YQ==')
  await expect(files.upload(root, 'policy.txt', 'Yg==')).rejects.toThrow()
  expect(await readFile(join(root, '.eqidis-context', 'policy.txt'), 'utf8')).toBe('a')
  await writeFile(join(root, 'original.txt'), 'original')
  await symlink(join(root, 'original.txt'), join(root, 'AGENTS.md'))
  await expect(files.save(root, 'replacement')).rejects.toThrow('regular file')
  expect(await readFile(join(root, 'original.txt'), 'utf8')).toBe('original')
})
it('refuses linked context directories and oversized instructions', async () => {
  await symlink(root, join(root, '.eqidis-context'))
  await expect(files.read(root)).rejects.toThrow('symbolic link')
  await expect(files.save(root, 'a'.repeat(48 * 1024 + 1))).rejects.toThrow('48 KiB')
})
it('serializes document updates and retains every reference', async () => {
  await Promise.all([files.upload(root, 'one.txt', 'YQ=='), files.upload(root, 'two.txt', 'Yg==')])
  const index = await readFile(join(root, 'AGENTS.local.md'), 'utf8')
  expect(index).toContain('one.txt')
  expect(index).toContain('two.txt')
})

it('accepts documents above the old 10 MiB limit and honors the configured upload limit', async () => {
  const document = Buffer.alloc(11 * 1024 * 1024, 97)
  const result = await files.upload(root, 'large.txt', document.toString('base64'))
  expect(result.files[0]?.bytes).toBe(document.length)
  const small = new ProjectContextFiles(2)
  expect((await small.read(root)).maxDocumentBytes).toBe(2)
  await expect(small.upload(root, 'too-large.txt', 'YWJj')).rejects.toThrow('2 bytes')
})
it('keeps more than 64 project document references', async () => {
  for (let i = 0; i < 65; i++) await files.upload(root, `document-${i}.txt`, 'YQ==')
  expect((await files.read(root)).files).toHaveLength(65)
})
it('keeps official workpapers apart from documents and indexes both', async () => {
  await expect(files.upload(root, 'notes.pdf', 'YQ==', 'workpaper')).rejects.toThrow('Excel')
  await files.upload(root, 'policy.txt', 'YQ==')
  const result = await files.upload(root, 'Pagos provisionales.xlsx', 'Yg==', 'workpaper')
  expect(result.workpapers).toEqual([{ name: 'Pagos provisionales.xlsx', bytes: 1 }])
  expect(result.files).toEqual([{ name: 'policy.txt', bytes: 1 }])
  expect(await readFile(join(root, '.eqidis-workpapers', 'plantillas', 'Pagos provisionales.xlsx'), 'utf8')).toBe('b')
  const index = await readFile(join(root, 'AGENTS.local.md'), 'utf8')
  expect(index).toContain('.eqidis-workpapers/plantillas/"Pagos provisionales.xlsx"')
  expect(index).toContain('.eqidis-context/"policy.txt"')
  expect((await files.remove(root, 'Pagos provisionales.xlsx', 'workpaper')).workpapers).toEqual([])
})
it('keeps calculation inputs per period without replacing earlier copies', async () => {
  expect(await files.storeInput(root, '2026-09', 'Balanza.xlsx', 'YQ==')).toEqual({ path: 'Insumos/2026-09/Balanza.xlsx' })
  expect(await files.storeInput(root, '2026-09', 'Balanza.xlsx', 'Yg==')).toEqual({ path: 'Insumos/2026-09/Balanza (2).xlsx' })
  expect(await readFile(join(root, 'Insumos', '2026-09', 'Balanza.xlsx'), 'utf8')).toBe('a')
  await expect(files.storeInput(root, '../x', 'Balanza.xlsx', 'YQ==')).rejects.toThrow('period')
  await expect(files.storeInput(root, '2026-09', '../Balanza.xlsx', 'YQ==')).rejects.toThrow('valid name')
})
it('reads the follow-up items of a filled workpaper by its file name only', async () => {
  expect(await files.pendings(root, 'Papeles de trabajo/2026-09/Papel - 2026-09.xlsx')).toEqual([])
  await mkdir(join(root, '.eqidis-workpapers', 'pendientes'), { recursive: true })
  const items = [{ id: 'P1', texto: 'Revisar IVA', estado: 'resuelto', resolucion: 'Cuadra' }]
  await writeFile(join(root, '.eqidis-workpapers', 'pendientes', 'Papel - 2026-09.json'), JSON.stringify(items))
  expect(await files.pendings(root, 'Papeles de trabajo/2026-09/Papel - 2026-09.xlsx')).toEqual(items)
  expect(await files.allPendings(root)).toEqual([{ file: 'Papeles de trabajo/2026-09/Papel - 2026-09.xlsx', items }])
  await expect(files.pendings(root, '..')).rejects.toThrow('valid name')
})
