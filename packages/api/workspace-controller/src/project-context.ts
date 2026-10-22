/** Local project instructions and documents owned by an existing Workspace. */
import { lstat, mkdir, readFile, readdir, realpath, rename, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { ProjectContext, ProjectContextFile, ProjectFileKind, ProjectInputValue, ProjectPending, ProjectWorkpaperPendings } from './types.ts'

const DIRECTORY = '.eqidis-context'
/** Official workpaper templates the workpaper agent fills, one copy per period. */
const WORKPAPER_DIRECTORY = join('.eqidis-workpapers', 'plantillas')
const WORKPAPER_EXTENSIONS = /\.(xlsx|xlsm|xls|ods)$/iu
/** Calculation inputs, one folder per period; the workpaper tools read them there. */
const INPUT_DIRECTORY = 'Insumos'
/** Follow-up items the workpaper tools keep for each filled copy. */
const PENDINGS_DIRECTORY = join('.eqidis-workpapers', 'pendientes')
/** How the agent works whenever the project has official workpapers; the results must always come out in them. */
const WORKPAPER_PROCEDURE = `Este proyecto trabaja con los papeles de trabajo oficiales de la empresa. Todo cálculo de impuestos se entrega llenando una copia del papel oficial que corresponda; no entregues cálculos en otro formato ni inventes plantillas.
Procedimiento cuando el usuario sube balanza, auxiliares u otros insumos o pide un cálculo:
1. Llama a workpaper_overview: plantillas disponibles, mapa guardado de cada plantilla, criterios ya confirmados de este cliente y periodos trabajados. Si la plantilla tiene un mapa vigente, síguelo: no vuelvas a explorarla completa, solo confirma con lecturas puntuales lo que el mapa indica.
2. El cálculo empieza con un mensaje «Nuevo cálculo» que indica el periodo, los papeles a llenar y las rutas de la balanza, los auxiliares y otros documentos, ya guardados en «Insumos/<periodo>/»: trabaja sobre esas rutas. Solo si llegan archivos adjuntos al chat, archívalos con workpaper_store_inputs.
3. No supongas ninguna estructura: explora la plantilla (excel_describe, excel_find, excel_read) para entender cómo se alimenta. Hay dos formas comunes: celdas de captura (vacías y con relleno de color) que se llenan con workpaper_write, u hojas de datos donde se pega la balanza o el auxiliar de cada mes tal como los exporta el sistema contable (por ejemplo un bloque de columnas por mes) y las fórmulas los buscan por número de cuenta; en ese caso pega el insumo completo en el bloque del periodo con workpaper_paste, en la misma posición y forma que los meses anteriores. Para no leer hojas grandes completas: excel_describe muestra los bloques que se repiten por mes, excel_dependents dice qué fórmulas leen un bloque, excel_compare compara un insumo contra el bloque que ya trae el papel, excel_ledger da el detalle de una cuenta en los auxiliares y excel_table da totales de los insumos. Lee y escribe los libros solo con estas herramientas; no uses la terminal ni scripts para abrirlos.
4. Relaciona cada celda de captura con las cuentas o datos de los insumos, aplicando primero los criterios guardados del cliente. Antes de dar un impuesto o concepto por cero, busca en la balanza y los auxiliares cuentas de gasto, provisión o por pagar relacionadas (excel_find, excel_ledger). Todo lo que pueda cambiar un impuesto a pagar o a favor y no esté resuelto por los archivos o por un criterio confirmado del cliente (por ejemplo, si un impuesto aplica, si un concepto suma o resta a la base, un dato que no viene en los archivos) se decide preguntando: reúne esas decisiones y pregúntalas juntas con ask_user_question, cada una con tu recomendación y su efecto en pesos; no las dejes como pendientes ni inventes cifras. Los criterios guardados como «por confirmar» cuentan como no resueltos.
5. Guarda con client_criteria_save las clasificaciones y datos que el contador confirmó, para repetirlos igual en el siguiente periodo.
6. Para cada papel pedido: crea la copia con workpaper_start (si es un libro anual acumulativo, con partir_de «periodo_anterior»), captura con workpaper_write (cada valor con su origen), revisa con workpaper_calculate que no haya errores nuevos y que las cifras cuadren con la balanza (los errores que la plantilla ya traía, como meses futuros sin datos, no son tuyos), y cierra con workpaper_finish; al final entrega los archivos con present.
7. Guarda o actualiza con workpaper_map_save el mapa de cada plantilla que llenaste (cómo se alimenta, columnas de cada mes, fórmulas que avanzan, celdas de resultados y particularidades), para que el siguiente periodo no tenga que explorarla de nuevo.
8. Cuando el contador pida resolver un pendiente de un papel cerrado (P1, P2, …), atiende solo ese punto: investígalo con las herramientas, pregunta lo que dependa de él, aplica los cambios y regístralo con workpaper_resolve; si cambió alguna cifra, vuelve a cerrar el papel con workpaper_finish.
Si el papel necesita que una fórmula avance al nuevo mes (por ejemplo, una hoja de resumen o explicativa que apunta a la columna del mes anterior), actualízala con workpaper_formula. Nunca edites los archivos con comandos, scripts ni editando su contenido interno: usa solo las herramientas de papeles de trabajo. No cambies formatos ni la plantilla original. Si el usuario pide algo ajeno a la contabilidad y los impuestos de este cliente, indícale amablemente que este espacio es para sus papeles de trabajo.
Papeles de trabajo oficiales:`
const MAX_INSTRUCTION_BYTES = 48 * 1024
const BEGIN = '<!-- EQIDIS project context -->'
const END = '<!-- /EQIDIS project context -->'

/** Reject links before reading or replacing project-owned files. */
async function regular(path: string): Promise<boolean> {
  try {
    const info = await lstat(path)
    if (!info.isFile() || info.isSymbolicLink()) throw new Error('Project context requires a regular file.')
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}

/** Serialize mutations so instruction and document updates cannot overwrite each other. */
export class ProjectContextFiles {
  /**
   * @param maxDocumentBytes - upload limit; local workspace files are not uploaded.
   */
  constructor(private readonly maxDocumentBytes = 30 * 1024 * 1024) {}

  private tail: Promise<void> = Promise.resolve()

  private enqueue<T>(action: () => Promise<T>): Promise<T> {
    const result = this.tail.then(action)
    this.tail = result.then(() => undefined, () => undefined)
    return result
  }

  private async directory(root: string, kind: ProjectFileKind = 'document', create = true): Promise<string> {
    const path = join(await realpath(root), kind === 'workpaper' ? WORKPAPER_DIRECTORY : DIRECTORY)
    if (create) await mkdir(path, { recursive: true })
    else if (!await lstat(path).then(() => true, () => false)) return path
    const info = await lstat(path)
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Project context folder must not be a symbolic link.')
    return path
  }

  private filename(name: string): string {
    if (!name || name.length > 200 || name === '.' || name === '..' || /[\\/\x00-\x1f]/.test(name) || name.startsWith('.')) {
      throw new Error('Choose a file with a valid name.')
    }
    return name
  }

  private async atomic(path: string, value: string): Promise<void> {
    await regular(path)
    const temporary = `${path}.${randomUUID()}.tmp`
    try {
      await writeFile(temporary, value, { flag: 'wx', mode: 0o600 })
      await rename(temporary, path)
    } finally {
      await unlink(temporary).catch((error: unknown) => {
        if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error
      })
    }
  }

  /**
   * Read instructions and metadata without returning document contents.
   * @param root - registered project folder.
   * @returns instructions and uploaded document metadata.
   */
  async read(root: string): Promise<ProjectContext> {
    const directory = await this.directory(root)
    const instructionPath = join(root, 'AGENTS.md')
    let instructions = ''
    if (await regular(instructionPath)) {
      if ((await lstat(instructionPath)).size > MAX_INSTRUCTION_BYTES) throw new Error('Project instructions exceed 48 KiB.')
      instructions = await readFile(instructionPath, 'utf8')
    }
    const list = async (folder: string): Promise<ProjectContextFile[]> => {
      const found: ProjectContextFile[] = []
      const entries = await readdir(folder, { withFileTypes: true }).catch((error: unknown) => {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
        throw error
      })
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue
        const path = join(folder, entry.name)
        if (await regular(path)) found.push({ name: entry.name, bytes: (await lstat(path)).size })
      }
      return found.sort((a, b) => a.name.localeCompare(b.name))
    }
    const files = await list(directory)
    const workpapers = await list(await this.directory(root, 'workpaper', false))
    return { instructions, files, workpapers, maxDocumentBytes: this.maxDocumentBytes }
  }

  private async refreshIndex(root: string): Promise<void> {
    const { files, workpapers } = await this.read(root)
    const path = join(root, 'AGENTS.local.md')
    const original = await regular(path) ? await readFile(path, 'utf8') : ''
    const start = original.indexOf(BEGIN)
    const end = original.indexOf(END, start)
    if (start !== -1 && end === -1) throw new Error('The project context index is incomplete; repair AGENTS.local.md before updating documents.')
    const retained = start === -1 ? original : original.slice(0, start) + original.slice(end + END.length)
    const documents = files.length === 0 ? '' : `# Project reference documents\nConsult the relevant project documents below before answering questions about this project. Use file tools to read them; do not assume their contents.\n${files.map(file => `- ${DIRECTORY}/${JSON.stringify(file.name)}`).join('\n')}\n`
    const templates = workpapers.length === 0 ? '' : `# Official workpapers\n${WORKPAPER_PROCEDURE}\n${workpapers.map(file => `- ${WORKPAPER_DIRECTORY.split('\\').join('/')}/${JSON.stringify(file.name)}`).join('\n')}\n`
    const block = documents === '' && templates === '' ? '' : `${BEGIN}\n${documents}${documents !== '' && templates !== '' ? '\n' : ''}${templates}${END}\n`
    await this.atomic(path, `${retained.trimEnd()}${retained.trim() && block ? '\n\n' : ''}${block}`)
  }

  /**
   * Save the instructions read automatically by the agent.
   * @param root - registered project folder.
   * @param instructions - complete instruction document.
   * @returns saved context metadata.
   */
  save(root: string, instructions: string): Promise<ProjectContext> {
    return this.enqueue(async () => {
      if (Buffer.byteLength(instructions) > MAX_INSTRUCTION_BYTES) throw new Error('Project instructions exceed 48 KiB.')
      await this.atomic(join(root, 'AGENTS.md'), instructions)
      return this.read(root)
    })
  }

  /**
   * Copy an uploaded document into the project; refuse overwriting existing files.
   * @param root - registered project folder.
   * @param name - filename inside the managed directory.
   * @param base64 - encoded document bytes.
   * @returns updated context metadata.
   */
  upload(root: string, name: string, base64: string, kind: ProjectFileKind = 'document'): Promise<ProjectContext> {
    return this.enqueue(async () => {
      this.filename(name)
      if (kind === 'workpaper' && !WORKPAPER_EXTENSIONS.test(name)) throw new Error('A workpaper must be an Excel workbook (.xlsx, .xlsm, .xls or .ods).')
      if (base64.length > Math.ceil(this.maxDocumentBytes / 3) * 4 || (base64.length % 4 !== 0 || /[^A-Za-z0-9+/]/.test(base64.replace(/={1,2}$/, '')))) throw new Error(`Choose a file of at most ${this.maxDocumentBytes} bytes.`)
      const bytes = Buffer.from(base64, 'base64')
      if (bytes.length > this.maxDocumentBytes) throw new Error(`Choose a file of at most ${this.maxDocumentBytes} bytes.`)
      const directory = await this.directory(root, kind)
      const path = join(directory, name)
      await writeFile(path, bytes, { flag: 'wx', mode: 0o600 })
      try { await this.refreshIndex(root) } catch (error) { await unlink(path); throw error }
      return this.read(root)
    })
  }

  /**
   * Read the follow-up items of a filled workpaper.
   * @param root - registered project folder.
   * @param file - project-relative path of the filled copy.
   * @returns its items, or none when it has no follow-up file.
   */
  async pendings(root: string, file: string): Promise<ProjectPending[]> {
    const name = file.split(/[\\/]/u).pop() ?? ''
    this.filename(name)
    const path = join(await realpath(root), PENDINGS_DIRECTORY, `${name.replace(/\.[^.]+$/u, '')}.json`)
    if (!await regular(path)) return []
    const parsed = JSON.parse(await readFile(path, 'utf8')) as unknown
    return Array.isArray(parsed) ? parsed as ProjectPending[] : []
  }

  /**
   * List the follow-up items of every filled workpaper in the project, newest period first.
   * @param root - registered project folder.
   * @returns each workpaper's project-relative path and items.
   */
  async allPendings(root: string): Promise<ProjectWorkpaperPendings[]> {
    const folder = join(await realpath(root), PENDINGS_DIRECTORY)
    const names = await readdir(folder).catch(() => [] as string[])
    const out: ProjectWorkpaperPendings[] = []
    for (const name of names.filter(entry => entry.endsWith('.json') && !entry.startsWith('.'))) {
      const stem = name.slice(0, -'.json'.length)
      const period = / - ([^/\\]+)$/u.exec(stem)?.[1] ?? ''
      const items = await this.pendings(root, `${stem}.xlsx`)
      if (items.length > 0) out.push({ file: `Papeles de trabajo/${period}/${stem}.xlsx`, items })
    }
    return out.sort((a, b) => b.file.localeCompare(a.file))
  }

  /**
   * Keep a calculation input in `Insumos/<period>/`, adding « (2)» rather than replacing a same-named file.
   * @param root - registered project folder.
   * @param period - period label such as 2026-09.
   * @param name - original filename.
   * @param base64 - encoded file bytes.
   * @returns the stored file's project-relative path.
   */
  storeInput(root: string, period: string, name: string, base64: string): Promise<ProjectInputValue> {
    return this.enqueue(async () => {
      this.filename(name)
      if (!/^[\p{L}\p{N} ._-]{2,40}$/u.test(period) || period.startsWith('.')) throw new Error('Choose a valid period, for example 2026-09.')
      if (base64.length > Math.ceil(this.maxDocumentBytes / 3) * 4) throw new Error(`Choose a file of at most ${this.maxDocumentBytes} bytes.`)
      const bytes = Buffer.from(base64, 'base64')
      if (bytes.length > this.maxDocumentBytes) throw new Error(`Choose a file of at most ${this.maxDocumentBytes} bytes.`)
      const folder = join(await realpath(root), INPUT_DIRECTORY, period)
      await mkdir(folder, { recursive: true })
      const dot = name.lastIndexOf('.')
      const [stem, extension] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, '']
      for (let attempt = 1; attempt < 100; attempt++) {
        const file = attempt === 1 ? name : `${stem} (${attempt})${extension}`
        try {
          await writeFile(join(folder, file), bytes, { flag: 'wx', mode: 0o600 })
          // A calculation is starting: bring the agent's workpaper procedure up to date.
          await this.refreshIndex(root)
          return { path: `${INPUT_DIRECTORY}/${period}/${file}` }
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
        }
      }
      throw new Error('Too many files with the same name for this period.')
    })
  }

  /**
   * Remove only an uploaded project-context document.
   * @param root - registered project folder.
   * @param name - uploaded filename.
   * @returns remaining context metadata.
   */
  remove(root: string, name: string, kind: ProjectFileKind = 'document'): Promise<ProjectContext> {
    return this.enqueue(async () => {
      this.filename(name)
      const path = join(await this.directory(root, kind), name)
      if (!await regular(path)) throw new Error('Project document was not found.')
      const bytes = await readFile(path)
      await unlink(path)
      try { await this.refreshIndex(root) } catch (error) { await writeFile(path, bytes, { flag: 'wx', mode: 0o600 }); throw error }
      return this.read(root)
    })
  }
}
