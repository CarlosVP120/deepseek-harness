/**
 * Prepare the FiscalCFDI AI accounting engine that the installer carries:
 * a portable CPython for the target (python-build-standalone, pinned by
 * SHA-256), the engine's binary wheels for that target installed into it, and
 * the engine's tracked sources without tests or test data. The packaged app
 * runs this engine whenever its data home names no other one in `engine.json`.
 *
 * Inputs: FISCALCFDI_ENGINE_SOURCE (the engine checkout; defaults to `../motor`
 * beside this repository), the target from the usual Desktop target variables,
 * and Python with pip on PATH (`python3`; `python` on Windows) to install the target's wheels.
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { desktopTargetBuildPaths, resolveDesktopBuildTarget } from './desktop-build-paths.mjs'

const REPOSITORY_ROOT = resolve(import.meta.dirname, '../../..')
const RELEASE = '20261009'
const VERSION = '3.14.8'

/** Pinned interpreter archives, wheel platform tags and interpreter paths per target. */
const TARGETS = {
  'mac-arm64': {
    archive: `cpython-${VERSION}+${RELEASE}-aarch64-apple-darwin-install_only.tar.gz`,
    sha256: 'ff8e1ddc02a9df3190b62d5af475cb642a02cfc77901ef780f9826cc23b51934',
    platform: 'macosx_14_0_arm64',
    python: 'python/bin/python3',
    sitePackages: 'python/lib/python3.14/site-packages',
  },
  'mac-x64': {
    archive: `cpython-${VERSION}+${RELEASE}-x86_64-apple-darwin-install_only.tar.gz`,
    sha256: '9694bf8c8c1fb1250dd6f05e7914ebbbe7180e0f11b7feaf5edb2f6acebe4153',
    // pymssql publishes Intel macOS wheels for macOS 15 and later only.
    platform: 'macosx_15_0_x86_64',
    python: 'python/bin/python3',
    sitePackages: 'python/lib/python3.14/site-packages',
  },
  'win-x64': {
    archive: `cpython-${VERSION}+${RELEASE}-x86_64-pc-windows-msvc-install_only.tar.gz`,
    sha256: '6c03535bfa5888dd73b0c0ebd91b76a2fdfa06eedaa411b0c4c9e664db6b4bb4',
    platform: 'win_amd64',
    python: 'python/python.exe',
    sitePackages: 'python/Lib/site-packages',
  },
} as const

/** Tracked engine paths the installer leaves out: tests, the legacy web client and sample inputs. */
function shipped(path: string): boolean {
  return !/^(tests\/|webapp\/|ui\/test_|harness\/test-|proposal-demo\.json$|companies\.example\.json$|\.env\.example$)/.test(path)
}

function run(command: string, args: string[], options: { cwd?: string; env?: NodeJS.ProcessEnv } = {}): string {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...options })
  if (result.status !== 0) {
    throw new Error(`prepare-fiscalcfdi-engine: ${command} ${args.join(' ')} failed (${String(result.status)}): ${result.stderr || result.stdout}`)
  }
  return result.stdout
}

async function download(url: string, file: string, sha256: string): Promise<void> {
  if (existsSync(file) && createHash('sha256').update(readFileSync(file)).digest('hex') === sha256) return
  const response = await fetch(url)
  if (!response.ok) throw new Error(`prepare-fiscalcfdi-engine: download ${url} failed with ${response.status}`)
  const bytes = Buffer.from(await response.arrayBuffer())
  const digest = createHash('sha256').update(bytes).digest('hex')
  if (digest !== sha256) throw new Error(`prepare-fiscalcfdi-engine: ${url} has sha256 ${digest}, expected ${sha256}`)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, bytes)
}

async function main(): Promise<void> {
  const target = resolveDesktopBuildTarget()
  const spec = TARGETS[target]
  const paths = desktopTargetBuildPaths(target)
  const engine = join(paths.root, 'engine')
  const source = resolve(process.env.FISCALCFDI_ENGINE_SOURCE ?? join(REPOSITORY_ROOT, '..', 'motor'))
  if (!existsSync(join(source, 'harness', 'fiscalcfdi-plugin', 'bridge.py'))) {
    throw new Error(`prepare-fiscalcfdi-engine: no engine checkout at ${source}; set FISCALCFDI_ENGINE_SOURCE`)
  }
  rmSync(engine, { recursive: true, force: true })
  mkdirSync(engine, { recursive: true })

  const archive = join(paths.downloads, 'python-build-standalone', spec.archive)
  await download(`https://github.com/astral-sh/python-build-standalone/releases/download/${RELEASE}/${encodeURIComponent(spec.archive)}`, archive, spec.sha256)
  // Windows: the system bsdtar; Git's GNU tar reads `C:` in a path as a remote host.
  run(process.platform === 'win32' ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar', ['-xzf', archive, '-C', engine])
  // Debug symbols only add size to the Windows installer.
  for (const entry of readdirSync(join(engine, 'python'), { recursive: true, encoding: 'utf8' })) {
    if (entry.endsWith('.pdb')) rmSync(join(engine, 'python', entry))
  }

  // Wheels for the target, installed into the bundled interpreter's own site-packages.
  run(process.platform === 'win32' ? 'python' : 'python3', ['-m', 'pip', 'install', '--disable-pip-version-check', '--no-compile', '--only-binary=:all:',
    '--platform', spec.platform, '--python-version', '3.14', '--implementation', 'cp',
    '--target', join(engine, spec.sitePackages), '-r', join(source, 'requirements.txt')])

  const files = run('git', ['-C', source, 'ls-files', '-z']).split('\0').filter(path => path !== '' && shipped(path))
  for (const path of files) {
    mkdirSync(dirname(join(engine, 'motor', path)), { recursive: true })
    cpSync(join(source, path), join(engine, 'motor', path))
  }
  const commit = run('git', ['-C', source, 'rev-parse', 'HEAD']).trim()
  writeFileSync(join(engine, 'engine.json'), `${JSON.stringify({ commit, python: spec.python, bridge: 'motor/harness/fiscalcfdi-plugin/bridge.py' }, null, 1)}\n`)

  // On a host that can run the target interpreter, the engine must import and answer a bridge call.
  const host = resolveDesktopBuildTarget({}, process.platform, process.arch)
  if (host === target) {
    const data = join(paths.root, 'engine-smoke-data')
    rmSync(data, { recursive: true, force: true })
    const env = { ...process.env, ACCOUNTING_UI_DATA: data, PYTHONDONTWRITEBYTECODE: '1', PYTHONNOUSERSITE: '1' }
    const python = join(engine, spec.python)
    run(python, ['-c', 'import agents, openai, pymssql, openpyxl, pypdf, xlrd, xlwt, sqlglot'], { env })
    const answer = spawnSync(python, [join(engine, 'motor', 'harness', 'fiscalcfdi-plugin', 'bridge.py'), 'empresas'], { input: '{}', encoding: 'utf8', env })
    if (!answer.stdout.includes('"ok": true')) throw new Error(`prepare-fiscalcfdi-engine: bridge smoke failed: ${answer.stdout} ${answer.stderr}`)
    rmSync(data, { recursive: true, force: true })
  }
  process.stdout.write(`prepare-fiscalcfdi-engine: ${target} engine ${commit.slice(0, 10)} with Python ${VERSION}\n`)
}

await main()
