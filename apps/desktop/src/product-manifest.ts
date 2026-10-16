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

/**
 * Environment the ContabiliAI tools need to reach the accounting engine. The
 * engine is a separate Python installation; its interpreter and bridge are
 * named in `<home>/engine.json` so the installed application never assumes
 * where it lives. Variables already set in the launch environment win.
 * @param home - the product's data root.
 * @param environment - launch environment.
 * @returns variables to add to the Host environment; empty when unconfigured.
 */
export function contabiliaiEngineEnvironment(home: string, environment: NodeJS.ProcessEnv = process.env): Record<string, string> {
  let file: EngineFile
  try {
    file = JSON.parse(readFileSync(join(home, 'engine.json'), 'utf8')) as EngineFile
  } catch {
    return {}
  }
  const result: Record<string, string> = {}
  if (environment.CONTABILIAI_ENGINE_PYTHON === undefined && typeof file.python === 'string') result.CONTABILIAI_ENGINE_PYTHON = file.python
  if (environment.CONTABILIAI_ENGINE_BRIDGE === undefined && typeof file.bridge === 'string') result.CONTABILIAI_ENGINE_BRIDGE = file.bridge
  return result
}
