/** FiscalCFDI AI ships from this shell with its own name, data, profile, artwork and package identity. */
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { resolveDesktopHome } from '../src/paths.ts'
import { resolveDesktopProduct } from '../src/product.ts'
import { fiscalcfdiEngineEnvironment, packagedDesktopProduct } from '../src/product-manifest.ts'
import { resolveDesktopLocale } from '../src/locale.ts'

it('ships FiscalCFDI AI with its own data root, apart from DeepSeek Harness', () => {
  expect(resolveDesktopProduct({}).id).toBe('fiscalcfdi')
  expect(resolveDesktopProduct({}).profile).toBe('fiscalcfdi')
  expect(resolveDesktopHome(true, { DSH_HOME: '/unrelated' })).toBe(join(homedir(), '.fiscalcfdi-ai'))
  expect(resolveDesktopHome(true, { FISCALCFDI_AI_HOME: '/data/fiscalcfdi' })).toBe('/data/fiscalcfdi')
  expect(() => resolveDesktopProduct({ DSH_DESKTOP_PRODUCT: 'other' })).toThrow(/DSH_DESKTOP_PRODUCT/u)
})

it('names FiscalCFDI AI in shell copy, including Spanish', () => {
  const messages = resolveDesktopLocale('es').messages
  expect(messages.quitTitle).toBe('¿Salir de FiscalCFDI AI?')
  expect(Object.values(messages).join('\n')).not.toMatch(/EQIDIS/u)
})

it('reads the recorded product and the engine location from the data root', () => {
  const root = mkdtempSync(join(tmpdir(), 'fiscalcfdi-product-'))
  try {
    expect(packagedDesktopProduct(root)).toBeUndefined()
    writeFileSync(join(root, 'package.json'), JSON.stringify({ dshDesktopProduct: 'fiscalcfdi' }))
    expect(packagedDesktopProduct(root)).toBe('fiscalcfdi')
    expect(fiscalcfdiEngineEnvironment(root, {})).toEqual({})
    writeFileSync(join(root, 'engine.json'), JSON.stringify({ python: '/engine/bin/python', bridge: '/engine/bridge.py' }))
    expect(fiscalcfdiEngineEnvironment(root, {})).toEqual({
      FISCALCFDI_ENGINE_PYTHON: '/engine/bin/python', FISCALCFDI_ENGINE_BRIDGE: '/engine/bridge.py',
    })
    expect(fiscalcfdiEngineEnvironment(root, { FISCALCFDI_ENGINE_BRIDGE: '/override.py' })).toEqual({
      FISCALCFDI_ENGINE_PYTHON: '/engine/bin/python',
    })
    // Without its own engine.json, the data root runs the engine the installer carries.
    rmSync(join(root, 'engine.json'))
    const resources = join(root, 'resources')
    mkdirSync(join(resources, 'engine'), { recursive: true })
    expect(fiscalcfdiEngineEnvironment(root, {}, resources)).toEqual({})
    writeFileSync(join(resources, 'engine', 'engine.json'), JSON.stringify({ python: 'python/bin/python3', bridge: 'motor/bridge.py' }))
    expect(fiscalcfdiEngineEnvironment(root, {}, resources)).toEqual({
      FISCALCFDI_ENGINE_PYTHON: join(resources, 'engine', 'python/bin/python3'),
      FISCALCFDI_ENGINE_BRIDGE: join(resources, 'engine', 'motor/bridge.py'),
      ACCOUNTING_ENGINE_PYTHON: join(resources, 'engine', 'python/bin/python3'),
      ACCOUNTING_UI_DATA: join(root, 'motor'),
      PYTHONDONTWRITEBYTECODE: '1', PYTHONNOUSERSITE: '1', PYTHONUTF8: '1',
    })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

it('packages FiscalCFDI AI under its own name, manifest, artifacts and artwork', async () => {
  const { createElectronBuilderConfig } = await import('../scripts/electron-builder-config.mjs')
  const config = createElectronBuilderConfig({ DSH_DESKTOP_APP_ID: 'mx.fiscalcfdi.ai', DSH_DESKTOP_UNSIGNED: '1' }, 'darwin', 'arm64')
  expect(config.appId).toBe('mx.fiscalcfdi.ai')
  expect(config.extraMetadata).toMatchObject({ name: '@fiscalcfdi/ai-desktop', productName: 'FiscalCFDI AI', dshDesktopProduct: 'fiscalcfdi' })
  expect(config.artifactName.startsWith('fiscalcfdi-ai-')).toBe(true)
  expect(config.protocols[0].name).toBe('FiscalCFDI AI')
  expect(config.mac.extendInfo.NSMicrophoneUsageDescription).toContain('FiscalCFDI AI')
  // Read destinations as plain text: the inferred config type omits the product-conditional engine entry.
  const destination = (resource: { readonly to: string }): string => resource.to
  for (const resource of config.extraResources) expect(existsSync(resource.from) || ['runtime', 'engine'].includes(destination(resource))).toBe(true)
  expect(config.extraResources.map(destination)).toContain('engine')
})
