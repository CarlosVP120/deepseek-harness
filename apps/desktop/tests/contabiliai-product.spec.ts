/** ContabiliAI ships from the same shell with its own name, data, profile, artwork and package identity. */
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { resolveDesktopHome } from '../src/paths.ts'
import { productCopy, resolveDesktopProduct } from '../src/product.ts'
import { contabiliaiEngineEnvironment, packagedDesktopProduct } from '../src/product-manifest.ts'

afterEach(() => { vi.unstubAllEnvs() })

it('keeps EQIDIS AI as the default product', () => {
  expect(resolveDesktopProduct({}).id).toBe('eqidis')
  expect(resolveDesktopHome(true, {})).toBe(join(homedir(), '.eqidis-ai'))
  expect(() => resolveDesktopProduct({ DSH_DESKTOP_PRODUCT: 'other' })).toThrow(/DSH_DESKTOP_PRODUCT/u)
})

it('gives installed ContabiliAI its own data root and override, apart from EQIDIS and Harness', () => {
  const environment = { DSH_DESKTOP_PRODUCT: 'contabiliai', DSH_HOME: '/unrelated', EQIDIS_AI_HOME: '/eqidis' }
  expect(resolveDesktopHome(true, environment)).toBe(join(homedir(), '.contabiliai'))
  expect(resolveDesktopHome(true, { ...environment, CONTABILIAI_HOME: '/data/contabiliai' })).toBe('/data/contabiliai')
  expect(resolveDesktopProduct(environment).profile).toBe('contabiliai')
})

it('names ContabiliAI in shell copy, including contracted Spanish', async () => {
  const contabiliai = resolveDesktopProduct({ DSH_DESKTOP_PRODUCT: 'contabiliai' })
  expect(productCopy('¿Salir dEQIDIS AI?', contabiliai)).toBe('¿Salir de ContabiliAI?')
  expect(productCopy('Quit EQIDIS AI', contabiliai)).toBe('Quit ContabiliAI')
  vi.stubEnv('DSH_DESKTOP_PRODUCT', 'contabiliai')
  const { resolveDesktopLocale } = await import('../src/locale.ts')
  const messages = resolveDesktopLocale('es').messages
  expect(messages.quitTitle).toBe('¿Salir de ContabiliAI?')
  expect(Object.values(messages).join('\n')).not.toContain('EQIDIS')
})

it('reads the recorded product and the engine location from the data root', () => {
  const root = mkdtempSync(join(tmpdir(), 'contabiliai-product-'))
  try {
    expect(packagedDesktopProduct(root)).toBeUndefined()
    writeFileSync(join(root, 'package.json'), JSON.stringify({ dshDesktopProduct: 'contabiliai' }))
    expect(packagedDesktopProduct(root)).toBe('contabiliai')
    expect(contabiliaiEngineEnvironment(root, {})).toEqual({})
    writeFileSync(join(root, 'engine.json'), JSON.stringify({ python: '/engine/bin/python', bridge: '/engine/bridge.py' }))
    expect(contabiliaiEngineEnvironment(root, {})).toEqual({
      CONTABILIAI_ENGINE_PYTHON: '/engine/bin/python', CONTABILIAI_ENGINE_BRIDGE: '/engine/bridge.py',
    })
    expect(contabiliaiEngineEnvironment(root, { CONTABILIAI_ENGINE_BRIDGE: '/override.py' })).toEqual({
      CONTABILIAI_ENGINE_PYTHON: '/engine/bin/python',
    })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

it('packages ContabiliAI under its own name, manifest, artifacts and artwork', async () => {
  const { createElectronBuilderConfig } = await import('../scripts/electron-builder-config.mjs')
  const config = createElectronBuilderConfig({
    DSH_DESKTOP_PRODUCT: 'contabiliai', DSH_DESKTOP_APP_ID: 'mx.contabiliai.app', DSH_DESKTOP_UNSIGNED: '1',
  }, 'darwin', 'arm64')
  expect(config.appId).toBe('mx.contabiliai.app')
  expect(config.extraMetadata).toMatchObject({ name: '@contabiliai/desktop', productName: 'ContabiliAI', dshDesktopProduct: 'contabiliai' })
  expect(config.artifactName.startsWith('contabiliai-')).toBe(true)
  expect(config.protocols[0].name).toBe('ContabiliAI')
  expect(config.mac.extendInfo.NSMicrophoneUsageDescription).toContain('ContabiliAI')
  const brand = config.files.flatMap(entry => typeof entry === 'object' && entry.to === 'renderer/assets' ? [entry.from] : [])
  expect(brand).toHaveLength(1)
  expect(brand[0]).toMatch(/resources\/contabiliai$/u)
  for (const resource of config.extraResources) expect(existsSync(resource.from) || resource.to === 'runtime').toBe(true)
  expect(config.extraResources.some(resource => resource.from.endsWith(join('contabiliai', 'icon-windows.png')))).toBe(true)
})
