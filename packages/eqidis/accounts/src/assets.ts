/**
 * Brand images and fonts for the account pages, served without a sign-in so
 * the sign-in page can show them. The files live in the package's `assets/`
 * directory, which sits next to both `src/` and `lib/`.
 */

import { readFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'

/** URL path, relative to the page, under which the account pages reference the assets. */
export const ASSETS_PATH = 'eqidis-recursos'

const TYPES: Record<string, string> = {
  'fondo-dia.webp': 'image/webp',
  'fondo-noche.webp': 'image/webp',
  'montserrat-regular.woff2': 'font/woff2',
  'montserrat-medium.woff2': 'font/woff2',
}

/** One asset route: its absolute path and the handler that sends the file. */
export interface AssetRoute {
  path: string
  handler: (req: IncomingMessage, res: ServerResponse) => void
}

/**
 * Read every asset into memory.
 * @returns one route per asset, each answering GET and HEAD with a long-lived cache.
 */
export async function assetRoutes(): Promise<AssetRoute[]> {
  return await Promise.all(Object.entries(TYPES).map(async ([name, type]) => {
    const body = await readFile(new URL(`../assets/${name}`, import.meta.url))
    return {
      path: `/${ASSETS_PATH}/${name}`,
      handler: (req: IncomingMessage, res: ServerResponse): void => {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          res.writeHead(405, { allow: 'GET, HEAD' })
          res.end()
          return
        }
        res.writeHead(200, {
          'content-type': type,
          'content-length': String(body.byteLength),
          'cache-control': 'public, max-age=86400',
          'x-content-type-options': 'nosniff',
        })
        res.end(req.method === 'HEAD' ? undefined : body)
      },
    }
  }))
}
