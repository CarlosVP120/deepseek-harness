/** Local project instructions and documents owned by an existing Workspace. */
import { lstat, mkdir, readFile, readdir, realpath, rename, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { ProjectContext, ProjectContextFile } from './types.ts'

const DIRECTORY = '.eqidis-context'
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

  private async directory(root: string): Promise<string> {
    const path = join(await realpath(root), DIRECTORY)
    await mkdir(path, { recursive: true })
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
    const files: ProjectContextFile[] = []
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue
      const path = join(directory, entry.name)
      if (await regular(path)) files.push({ name: entry.name, bytes: (await lstat(path)).size })
    }
    files.sort((a, b) => a.name.localeCompare(b.name))
    return { instructions, files, maxDocumentBytes: this.maxDocumentBytes }
  }

  private async refreshIndex(root: string): Promise<void> {
    const { files } = await this.read(root)
    const path = join(root, 'AGENTS.local.md')
    const original = await regular(path) ? await readFile(path, 'utf8') : ''
    const start = original.indexOf(BEGIN)
    const end = original.indexOf(END, start)
    if (start !== -1 && end === -1) throw new Error('The project context index is incomplete; repair AGENTS.local.md before updating documents.')
    const retained = start === -1 ? original : original.slice(0, start) + original.slice(end + END.length)
    const block = files.length === 0 ? '' : `${BEGIN}\n# Project reference documents\nConsult the relevant project documents below before answering questions about this project. Use file tools to read them; do not assume their contents.\n${files.map(file => `- ${DIRECTORY}/${JSON.stringify(file.name)}`).join('\n')}\n${END}\n`
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
  upload(root: string, name: string, base64: string): Promise<ProjectContext> {
    return this.enqueue(async () => {
      this.filename(name)
      if (base64.length > Math.ceil(this.maxDocumentBytes / 3) * 4 || (base64.length % 4 !== 0 || /[^A-Za-z0-9+/]/.test(base64.replace(/={1,2}$/, '')))) throw new Error(`Choose a file of at most ${this.maxDocumentBytes} bytes.`)
      const bytes = Buffer.from(base64, 'base64')
      if (bytes.length > this.maxDocumentBytes) throw new Error(`Choose a file of at most ${this.maxDocumentBytes} bytes.`)
      const directory = await this.directory(root)
      const path = join(directory, name)
      await writeFile(path, bytes, { flag: 'wx', mode: 0o600 })
      try { await this.refreshIndex(root) } catch (error) { await unlink(path); throw error }
      return this.read(root)
    })
  }

  /**
   * Remove only an uploaded project-context document.
   * @param root - registered project folder.
   * @param name - uploaded filename.
   * @returns remaining context metadata.
   */
  remove(root: string, name: string): Promise<ProjectContext> {
    return this.enqueue(async () => {
      this.filename(name)
      const path = join(await this.directory(root), name)
      if (!await regular(path)) throw new Error('Project document was not found.')
      const bytes = await readFile(path)
      await unlink(path)
      try { await this.refreshIndex(root) } catch (error) { await writeFile(path, bytes, { flag: 'wx', mode: 0o600 }); throw error }
      return this.read(root)
    })
  }
}
