/** Where a project keeps its official workpapers, criteria and filled copies. */
import { createHash } from 'node:crypto'
import type { WorkpaperPending } from './types.ts'
import { copyFile, constants, lstat, mkdir, readdir, readFile, realpath, writeFile } from 'node:fs/promises'
import { basename, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'

/** Templates uploaded in the project settings. */
export const TEMPLATES_DIR = join('.eqidis-workpapers', 'plantillas')
/** Criteria the accountant confirmed for this client, reused every period. */
export const CRITERIA_FILE = join('.eqidis-workpapers', 'criterios.md')
/** Filled copies, one folder per period. */
export const OUTPUT_DIR = 'Papeles de trabajo'
/** Trial balances and ledger details the calculation used, one folder per period. */
export const INPUT_DIR = 'Insumos'
const SPREADSHEET = /\.(xlsx|xlsm|xls|ods|csv)$/iu

/** A path inside the project, refusing anything that escapes it. */
export async function inside(root: string, path: string): Promise<string> {
  const base = await realpath(root)
  const target = resolve(base, path)
  const rel = relative(base, target)
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) throw new Error(`La ruta «${path}» está fuera del proyecto.`)
  return target
}

/**
 * A spreadsheet the agent may read: inside the project, or a read-only copy of a
 * file the user attached to the chat (those live outside the project).
 */
export async function readable(root: string, path: string): Promise<string> {
  if (!isAbsolute(path)) return inside(root, path)
  const info = await lstat(path).catch(() => undefined)
  if (info === undefined || !info.isFile() || info.isSymbolicLink()) throw new Error(`No existe el archivo «${path}».`)
  if (!SPREADSHEET.test(path)) throw new Error('Solo se leen libros de Excel (xlsx, xlsm, xls, ods) o csv.')
  return path
}

/**
 * Keep a copy of an input file with the period it was used for, never replacing an existing one.
 * @returns the project path of the stored copy.
 */
export async function storeInput(root: string, source: string, label: string, name?: string): Promise<string> {
  const from = await readable(root, source)
  const folder = await inside(root, join(INPUT_DIR, label))
  await mkdir(folder, { recursive: true })
  const wanted = (name?.trim() ?? '') === '' ? basename(from) : `${name?.trim() ?? ''}${extname(from)}`
  if (/[\\/\x00-\x1f]/u.test(wanted) || wanted.startsWith('.')) throw new Error('Nombre de archivo inválido.')
  for (let attempt = 1; attempt < 100; attempt++) {
    const file = attempt === 1 ? wanted : `${basename(wanted, extname(wanted))} (${attempt})${extname(wanted)}`
    const target = join(folder, file)
    if (target === from) return target
    try {
      await copyFile(from, target, constants.COPYFILE_EXCL)
      return target
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    }
  }
  throw new Error('Demasiados archivos con el mismo nombre en Insumos.')
}

/** Project-relative display path. */
export async function shown(root: string, path: string): Promise<string> {
  return relative(await realpath(root), path).split(sep).join('/')
}

/** @returns template file names uploaded to the project. */
export async function templates(root: string): Promise<string[]> {
  try {
    const entries = await readdir(join(await realpath(root), TEMPLATES_DIR), { withFileTypes: true })
    return entries.filter(entry => entry.isFile() && !entry.name.startsWith('.') && /\.(xlsx|xlsm|xls|ods)$/iu.test(entry.name))
      .map(entry => entry.name).sort((a, b) => a.localeCompare(b, 'es'))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
}

/** @returns periods that already have a folder of filled workpapers. */
export async function periods(root: string): Promise<string[]> {
  try {
    const entries = await readdir(join(await realpath(root), OUTPUT_DIR), { withFileTypes: true })
    return entries.filter(entry => entry.isDirectory()).map(entry => entry.name).sort().reverse()
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
}

/** @returns the client's saved criteria, or an empty string. */
export async function readCriteria(root: string): Promise<string> {
  try {
    return await readFile(join(await realpath(root), CRITERIA_FILE), 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return ''
    throw error
  }
}

/** Replace the client's criteria document. */
export async function saveCriteria(root: string, text: string): Promise<void> {
  if (Buffer.byteLength(text) > 64 * 1024) throw new Error('Los criterios exceden 64 KiB; resúmelos.')
  const path = join(await realpath(root), CRITERIA_FILE)
  await mkdir(join(path, '..'), { recursive: true })
  await writeFile(path, text, { mode: 0o600 })
}

/** @returns whether the path is a filled copy the agent may write. */
export async function isOutput(root: string, path: string): Promise<boolean> {
  const rel = await shown(root, path)
  if (!rel.startsWith(`${OUTPUT_DIR}/`) || !/\.xlsx$/iu.test(rel)) return false
  try {
    const info = await lstat(path)
    return info.isFile() && !info.isSymbolicLink()
  } catch {
    return false
  }
}

/** A file-name-safe period, YYYY-MM or a short free label. */
export function period(value: string): string {
  const text = value.trim()
  if (!/^[\p{L}\p{N} ._-]{2,40}$/u.test(text)) throw new Error('Periodo inválido; usa AAAA-MM, por ejemplo 2026-09.')
  return text
}

/** Where the agent keeps what it learned about each template: how it is fed and where its results are. */
export const MAPS_DIR = join('.eqidis-workpapers', 'mapas')

async function fingerprint(path: string): Promise<string> {
  return createHash('sha256').update(await readFile(path)).digest('hex').slice(0, 16)
}

/** One saved work-paper map and whether the template is still the one it describes. */
export interface WorkpaperMap { plantilla: string; vigente: boolean; contenido: string }

/** @returns the saved map of each project template. */
export async function readMaps(root: string): Promise<WorkpaperMap[]> {
  const base = await realpath(root)
  const maps: WorkpaperMap[] = []
  for (const file of await templates(root)) {
    const text = await readFile(join(base, MAPS_DIR, `${basename(file, extname(file))}.md`), 'utf8').catch(() => undefined)
    if (text === undefined) continue
    const stamp = /^<!-- huella: ([0-9a-f]+) -->\n/u.exec(text)
    maps.push({
      plantilla: file,
      vigente: stamp?.[1] === await fingerprint(join(base, TEMPLATES_DIR, file)),
      contenido: stamp === null ? text : text.slice(stamp[0].length),
    })
  }
  return maps
}

/** Replace the map of a template, stamped with the template's current content. */
export async function saveMap(root: string, template: string, text: string): Promise<string> {
  if (Buffer.byteLength(text) > 32 * 1024) throw new Error('El mapa excede 32 KiB; resúmelo.')
  const base = await realpath(root)
  const file = (await templates(root)).find(name => name === basename(template))
  if (file === undefined) throw new Error(`No existe la plantilla «${template}» en el proyecto.`)
  const path = join(base, MAPS_DIR, `${basename(file, extname(file))}.md`)
  await mkdir(join(path, '..'), { recursive: true })
  await writeFile(path, `<!-- huella: ${await fingerprint(join(base, TEMPLATES_DIR, file))} -->\n${text}`, { mode: 0o600 })
  return path
}

/** Follow-up items of each filled copy, one JSON file per copy. */
export const PENDINGS_DIR = join('.eqidis-workpapers', 'pendientes')

function pendingsFile(base: string, copy: string): string {
  return join(base, PENDINGS_DIR, `${basename(copy, extname(copy))}.json`)
}

/** @returns the follow-up items of a filled copy, oldest first. */
export async function readPendings(root: string, copy: string): Promise<WorkpaperPending[]> {
  const text = await readFile(pendingsFile(await realpath(root), copy), 'utf8').catch(() => undefined)
  if (text === undefined) return []
  const parsed = JSON.parse(text) as unknown
  return Array.isArray(parsed) ? parsed as WorkpaperPending[] : []
}

async function writePendings(root: string, copy: string, items: readonly WorkpaperPending[]): Promise<void> {
  const path = pendingsFile(await realpath(root), copy)
  await mkdir(join(path, '..'), { recursive: true })
  await writeFile(path, JSON.stringify(items, null, 1), { mode: 0o600 })
}

/**
 * Record the open items of a closing: resolved items stay with their resolution, the previous
 * open ones are replaced by `open`, and new items continue the numbering.
 * @returns the complete list.
 */
export async function recordPendings(root: string, copy: string, open: readonly string[]): Promise<WorkpaperPending[]> {
  const resolved = (await readPendings(root, copy)).filter(item => item.estado === 'resuelto')
  let next = Math.max(0, ...(await readPendings(root, copy)).map(item => Number(item.id.slice(1)) || 0))
  const items: WorkpaperPending[] = [...resolved, ...open.map(texto => ({ id: `P${++next}`, texto, estado: 'abierto' as const }))]
  await writePendings(root, copy, items)
  return items
}

/** Mark one item resolved with how it was settled. */
export async function resolvePending(root: string, copy: string, id: string, resolution: string): Promise<WorkpaperPending> {
  const items = await readPendings(root, copy)
  const item = items.find(entry => entry.id.toLowerCase() === id.trim().toLowerCase())
  if (item === undefined) throw new Error(`No existe el pendiente «${id}». Pendientes: ${items.map(entry => `${entry.id} (${entry.estado})`).join(', ') || 'ninguno'}.`)
  if (resolution.trim() === '') throw new Error('Indica cómo se resolvió.')
  item.estado = 'resuelto'
  item.resolucion = resolution.trim()
  item.resuelto_en = new Date().toISOString()
  await writePendings(root, copy, items)
  return item
}

/** @returns the open follow-up items of every filled copy in the project. */
export async function openPendings(root: string): Promise<{ copia: string; pendientes: WorkpaperPending[] }[]> {
  const base = await realpath(root)
  const files = await readdir(join(base, PENDINGS_DIR)).catch(() => [] as string[])
  const out: { copia: string; pendientes: WorkpaperPending[] }[] = []
  for (const file of files.filter(name => name.endsWith('.json'))) {
    const label = / - ([^/]+)\.json$/u.exec(file)?.[1]
    const copy = join(OUTPUT_DIR, label ?? '', `${basename(file, '.json')}.xlsx`)
    const open = (await readPendings(root, copy)).filter(item => item.estado === 'abierto')
    if (open.length > 0) out.push({ copia: copy.split(sep).join('/'), pendientes: open })
  }
  return out
}
