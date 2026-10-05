/** Filesystem ownership for the Electron-managed desktop installation. */

import { join } from 'node:path'
import { homedir } from 'node:os'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'

/** Stable desktop installation paths under the selected application home. */
export interface DesktopPaths {
  readonly profile: string
  readonly lock: string
}

/**
 * Select the packaged EQIDIS data root independently of DeepSeek Harness.
 * Development retains the launcher's disposable DSH_HOME. Packaged applications
 * ignore DSH_HOME; EQIDIS_AI_HOME is the explicit EQIDIS-only override.
 * @param packaged - whether Electron is running an installed application.
 * @param environment - launch environment.
 * @returns absolute application data root without importing another product's data.
 */
export function resolveDesktopHome(packaged: boolean, environment: NodeJS.ProcessEnv = process.env): string {
  if (!packaged) return resolveDshHome(undefined, environment)
  const configured = environment.EQIDIS_AI_HOME?.trim()
  return resolveDshHome(configured || join(homedir(), '.eqidis-ai'), {})
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
