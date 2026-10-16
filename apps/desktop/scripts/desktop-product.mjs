/**
 * Packaging identity of each product this Desktop shell ships. The runtime
 * half (data root, profile) lives in src/product.ts under the same ids; the
 * build records the id in the packaged manifest as `dshDesktopProduct`.
 * DSH_DESKTOP_PRODUCT may name the product; FiscalCFDI AI is the default.
 */
import { fileURLToPath } from 'node:url'

const resource = path => fileURLToPath(new URL(`../${path}`, import.meta.url))

/** @type {Readonly<Record<string, import('./desktop-product.d.mts').DesktopPackagingProduct>>} */
export const DESKTOP_PACKAGING_PRODUCTS = Object.freeze({
  fiscalcfdi: Object.freeze({
    id: 'fiscalcfdi',
    productName: 'FiscalCFDI AI',
    packageName: '@fiscalcfdi/ai-desktop',
    artifactPrefix: 'fiscalcfdi-ai',
    resources: resource('resources'),
    microphoneUsage: 'FiscalCFDI AI usa el micrófono para transcribir dictados.',
    category: 'public.app-category.finance',
  }),
})

/** Environment variable selecting the packaged product. */
export const DESKTOP_PRODUCT_ENV = 'DSH_DESKTOP_PRODUCT'

/**
 * Select the product being packaged.
 * @param {NodeJS.ProcessEnv} env - Packaging environment.
 * @returns {import('./desktop-product.d.mts').DesktopPackagingProduct} the product; FiscalCFDI AI when none is named.
 */
export function resolveDesktopPackagingProduct(env = process.env) {
  const selected = env[DESKTOP_PRODUCT_ENV]?.trim()
  if (selected === undefined || selected === '') return DESKTOP_PACKAGING_PRODUCTS.fiscalcfdi
  const product = DESKTOP_PACKAGING_PRODUCTS[selected]
  if (product === undefined || !Object.hasOwn(DESKTOP_PACKAGING_PRODUCTS, selected)) {
    throw new Error(`desktop package: ${DESKTOP_PRODUCT_ENV} must be one of ${Object.keys(DESKTOP_PACKAGING_PRODUCTS).join(', ')}`)
  }
  return product
}
