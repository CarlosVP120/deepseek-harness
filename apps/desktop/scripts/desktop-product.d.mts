/** Packaging identity of one product shipped by the Desktop shell. */
export interface DesktopPackagingProduct {
  readonly id: 'eqidis' | 'contabiliai'
  /** Application, bundle and installer name. */
  readonly productName: string
  /** Packaged manifest name; it also names the updater cache. */
  readonly packageName: string
  /** Artifact file-name prefix, e.g. `contabiliai-0.2.1-mac-arm64.dmg`. */
  readonly artifactPrefix: string
  /** Directory holding icon.png, icon-macos.png, icon-windows.png and tray-windows.ico. */
  readonly resources: string
  /** Welcome-window wordmark, served as renderer/assets/welcome-brand.svg. */
  readonly welcomeBrand: string
  /** Directory holding the NSIS brand and sidebar rasters. */
  readonly installerAssets: string
  /** macOS microphone permission text. */
  readonly microphoneUsage: string
  /** macOS application category. */
  readonly category: string
}

/** Every product's packaging identity. */
export const DESKTOP_PACKAGING_PRODUCTS: Readonly<Record<'eqidis' | 'contabiliai', DesktopPackagingProduct>>

/** Environment variable selecting the packaged product. */
export const DESKTOP_PRODUCT_ENV: 'DSH_DESKTOP_PRODUCT'

/**
 * Select the product being packaged.
 * @param env - Packaging environment.
 * @returns the product; EQIDIS AI when none is named.
 */
export function resolveDesktopPackagingProduct(env?: NodeJS.ProcessEnv): DesktopPackagingProduct
