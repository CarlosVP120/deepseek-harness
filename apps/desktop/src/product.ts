/**
 * Runtime identity of the product this Desktop build ships. One Electron
 * shell serves several products of the fork; the build records its product in
 * the packaged manifest (`dshDesktopProduct`), and development and build
 * scripts select it with DSH_DESKTOP_PRODUCT. EQIDIS AI is the default.
 */

/** Products this shell can ship. */
export type DesktopProductId = 'eqidis' | 'contabiliai'

/** Runtime facts that differ between products. */
export interface DesktopProduct {
  readonly id: DesktopProductId
  /** Display name: menus, dialogs, About panel, welcome window. */
  readonly name: string
  /** Packaged data root under the user's home directory. */
  readonly homeDirectory: string
  /** Explicit override of the packaged data root. */
  readonly homeVariable: string
  /** Profile template whose bundles the Desktop profile runs. */
  readonly profile: string
}

/** Every product's runtime identity. */
export const DESKTOP_PRODUCTS: Readonly<Record<DesktopProductId, DesktopProduct>> = {
  eqidis: { id: 'eqidis', name: 'EQIDIS AI', homeDirectory: '.eqidis-ai', homeVariable: 'EQIDIS_AI_HOME', profile: 'web' },
  contabiliai: {
    id: 'contabiliai', name: 'ContabiliAI', homeDirectory: '.contabiliai', homeVariable: 'CONTABILIAI_HOME', profile: 'contabiliai',
  },
}

/** Environment variable selecting the product outside a packaged application. */
export const DESKTOP_PRODUCT_ENV = 'DSH_DESKTOP_PRODUCT'

/** Environment variables as both Node and this module's browser-safe readers see them. */
type ProductEnvironment = Readonly<Record<string, string | undefined>>

/** @returns the process environment, absent outside Node (this module also compiles for the welcome renderer). */
function processEnvironment(): ProductEnvironment | undefined {
  return (globalThis as { process?: { env?: ProductEnvironment } }).process?.env
}

/** @returns whether the value names a shipped product. */
export function isProductId(value: unknown): value is DesktopProductId {
  return typeof value === 'string' && Object.hasOwn(DESKTOP_PRODUCTS, value)
}

/**
 * Select the product from the environment.
 * @param environment - launch or build environment.
 * @returns the selected product; EQIDIS AI when none is named.
 * @throws Error when DSH_DESKTOP_PRODUCT names an unknown product.
 */
export function resolveDesktopProduct(environment: ProductEnvironment | undefined = processEnvironment()): DesktopProduct {
  const selected = environment?.[DESKTOP_PRODUCT_ENV]?.trim()
  if (selected === undefined || selected === '') return DESKTOP_PRODUCTS.eqidis
  if (!isProductId(selected)) throw new Error(`desktop: ${DESKTOP_PRODUCT_ENV} must be one of ${Object.keys(DESKTOP_PRODUCTS).join(', ')}`)
  return DESKTOP_PRODUCTS[selected]
}

/**
 * Replace the default product name in shell copy.
 * @param text - copy written for EQIDIS AI.
 * @param product - product being shown.
 * @returns the copy naming the selected product.
 */
export function productCopy(text: string, product: DesktopProduct = resolveDesktopProduct()): string {
  if (product.id === 'eqidis') return text
  // Spanish copy contracts "de EQIDIS AI" to "dEQIDIS AI" (as in "d'EQIDIS"); a consonant-initial name needs the full word.
  return text.replaceAll('dEQIDIS AI', `de ${product.name}`).replaceAll('EQIDIS AI', product.name)
}
