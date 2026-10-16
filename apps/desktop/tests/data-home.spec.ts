/** Installed FiscalCFDI AI must not adopt another Harness installation's configuration. */
import { homedir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { resolveDesktopHome, resolveDesktopPaths } from '../src/paths.ts'

it('ignores the official Harness home in installed FiscalCFDI AI', () => {
  const environment = { DSH_HOME: join(homedir(), '.dsh') }
  const home = resolveDesktopHome(true, environment)
  expect(home).toBe(join(homedir(), '.fiscalcfdi-ai'))
  expect(resolveDesktopPaths(home).profile).toBe(join(home, 'profiles', 'desktop'))
  expect(environment.DSH_HOME).toBe(join(homedir(), '.dsh'))
})

it('accepts only the FiscalCFDI-specific override for installed application data', () => {
  const home = join(homedir(), 'fiscalcfdi-test')
  expect(resolveDesktopHome(true, { DSH_HOME: '/unrelated', FISCALCFDI_AI_HOME: home })).toBe(home)
  expect(resolveDesktopHome(true, { FISCALCFDI_AI_HOME: '  ' })).toBe(join(homedir(), '.fiscalcfdi-ai'))
})

it('preserves the isolated development home', () => {
  const home = join(homedir(), 'development-test')
  expect(resolveDesktopHome(false, { DSH_HOME: home, FISCALCFDI_AI_HOME: '/packaged-only' })).toBe(home)
})
