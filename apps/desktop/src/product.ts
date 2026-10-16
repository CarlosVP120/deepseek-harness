/**
 * Runtime identity of FiscalCFDI AI, the product this Desktop shell ships: its
 * name, its data root and the profile its Host runs. The build records the
 * product in the packaged manifest (`dshDesktopProduct`); development and build
 * scripts may name it with DSH_DESKTOP_PRODUCT.
 */

/** Products this shell can ship. */
export type DesktopProductId = 'fiscalcfdi'

/** Runtime facts of one product. */
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
  fiscalcfdi: {
    id: 'fiscalcfdi', name: 'FiscalCFDI AI', homeDirectory: '.fiscalcfdi-ai', homeVariable: 'FISCALCFDI_AI_HOME', profile: 'fiscalcfdi',
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
 * @returns the selected product; FiscalCFDI AI when none is named.
 * @throws Error when DSH_DESKTOP_PRODUCT names an unknown product.
 */
export function resolveDesktopProduct(environment: ProductEnvironment | undefined = processEnvironment()): DesktopProduct {
  const selected = environment?.[DESKTOP_PRODUCT_ENV]?.trim()
  if (selected === undefined || selected === '') return DESKTOP_PRODUCTS.fiscalcfdi
  if (!isProductId(selected)) throw new Error(`desktop: ${DESKTOP_PRODUCT_ENV} must be one of ${Object.keys(DESKTOP_PRODUCTS).join(', ')}`)
  return DESKTOP_PRODUCTS[selected]
}
