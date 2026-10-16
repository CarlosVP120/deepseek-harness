/** Filesystem ownership for the Electron-managed desktop installation. */

import { join } from 'node:path'
import { homedir } from 'node:os'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { resolveDesktopProduct } from './product.ts'

/** Stable desktop installation paths under the selected application home. */
export interface DesktopPaths {
  readonly profile: string
  readonly lock: string
}

/**
 * Select the packaged product's data root independently of DeepSeek Harness
 * and of the fork's other products. Development retains the launcher's
 * disposable DSH_HOME. Packaged applications ignore DSH_HOME; the product's
 * own variable (FISCALCFDI_AI_HOME) is the explicit override.
 * @param packaged - whether Electron is running an installed application.
 * @param environment - launch environment.
 * @returns absolute application data root without importing another product's data.
 */
export function resolveDesktopHome(packaged: boolean, environment: NodeJS.ProcessEnv = process.env): string {
  if (!packaged) return resolveDshHome(undefined, environment)
  const product = resolveDesktopProduct(environment)
  const configured = environment[product.homeVariable]?.trim()
  return resolveDshHome(configured || join(homedir(), product.homeDirectory), {})
}

/**
 * Resolve every Electron-owned path under the selected application home.
 * @param dshHome - selected application home.
 * @returns immutable desktop path set.
 */
export function resolveDesktopPaths(dshHome: string = resolveDshHome()): DesktopPaths {
  return {
    profile: join(dshHome, 'profiles', 'desktop'),
    lock: join(dshHome, 'profiles', 'desktop', 'lock'),
  }
}
