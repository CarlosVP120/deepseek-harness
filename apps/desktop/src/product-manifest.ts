/** Product recorded in a packaged application's manifest (main process only). */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isProductId, type DesktopProductId } from './product.ts'

/**
 * Read the product a packaged application recorded in its manifest.
 * @param appPath - Electron's application path (the asar root when packaged).
 * @returns the recorded product, or undefined when the manifest names none.
 */
export function packagedDesktopProduct(appPath: string): DesktopProductId | undefined {
  try {
    const manifest = JSON.parse(readFileSync(join(appPath, 'package.json'), 'utf8')) as { dshDesktopProduct?: unknown }
    return isProductId(manifest.dshDesktopProduct) ? manifest.dshDesktopProduct : undefined
  } catch {
    return undefined
  }
}

/** Engine location a product reads from its data root, as `engine.json`. */
interface EngineFile {
  readonly python?: unknown
  readonly bridge?: unknown
}

function engineFile(path: string): EngineFile | undefined {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as EngineFile
  } catch {
    // A missing or unreadable file names no engine.
    return undefined
  }
}

/**
 * Environment the FiscalCFDI AI tools need to reach the accounting engine. An
 * engine named in `<home>/engine.json` wins (a separate installation, such as a
 * development checkout, keeping its own data). Otherwise the engine the
 * installer carries in `<resources>/engine` runs, with its interpreter,
 * worker and bridge there and its data in `<home>/motor`. Variables already
 * set in the launch environment win.
 * @param home - the product's data root.
 * @param environment - launch environment.
 * @param resources - the packaged application's resources directory; omitted in development.
 * @returns variables to add to the Host environment; empty when no engine is available.
 */
export function fiscalcfdiEngineEnvironment(
  home: string,
  environment: NodeJS.ProcessEnv = process.env,
  resources?: string,
): Record<string, string> {
  const result: Record<string, string> = {}
  const set = (name: string, value: string): void => {
    if (environment[name] === undefined) result[name] = value
  }
  const own = engineFile(join(home, 'engine.json'))
  if (own !== undefined) {
    if (typeof own.python === 'string') set('FISCALCFDI_ENGINE_PYTHON', own.python)
    if (typeof own.bridge === 'string') set('FISCALCFDI_ENGINE_BRIDGE', own.bridge)
    return result
  }
  const root = resources === undefined ? undefined : join(resources, 'engine')
  const bundled = root === undefined ? undefined : engineFile(join(root, 'engine.json'))
  if (root === undefined || typeof bundled?.python !== 'string' || typeof bundled.bridge !== 'string') return result
  const python = join(root, bundled.python)
  set('FISCALCFDI_ENGINE_PYTHON', python)
  set('FISCALCFDI_ENGINE_BRIDGE', join(root, bundled.bridge))
  set('ACCOUNTING_ENGINE_PYTHON', python)
  set('ACCOUNTING_UI_DATA', join(home, 'motor'))
  // The installed engine is read-only: no bytecode next to its sources, no user site-packages.
  set('PYTHONDONTWRITEBYTECODE', '1')
  set('PYTHONNOUSERSITE', '1')
  set('PYTHONUTF8', '1')
  return result
}
