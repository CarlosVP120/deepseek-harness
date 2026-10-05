/** Installed EQIDIS must not adopt another Harness installation's configuration. */
import { homedir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { resolveDesktopHome, resolveDesktopPaths } from '../src/paths.ts'

it('ignores the official Harness home in installed EQIDIS', () => {
  const environment = { DSH_HOME: join(homedir(), '.dsh') }
  const home = resolveDesktopHome(true, environment)
  expect(home).toBe(join(homedir(), '.eqidis-ai'))
  expect(resolveDesktopPaths(home).profile).toBe(join(home, 'profiles', 'desktop'))
  expect(environment.DSH_HOME).toBe(join(homedir(), '.dsh'))
})

it('accepts only the EQIDIS-specific override for installed application data', () => {
  const home = join(homedir(), 'eqidis-test')
  expect(resolveDesktopHome(true, { DSH_HOME: '/unrelated', EQIDIS_AI_HOME: home })).toBe(home)
  expect(resolveDesktopHome(true, { EQIDIS_AI_HOME: '  ' })).toBe(join(homedir(), '.eqidis-ai'))
})

it('preserves the isolated development home', () => {
  const home = join(homedir(), 'development-test')
  expect(resolveDesktopHome(false, { DSH_HOME: home, EQIDIS_AI_HOME: '/packaged-only' })).toBe(home)
})
