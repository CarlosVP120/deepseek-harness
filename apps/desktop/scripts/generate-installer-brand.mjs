/** Render the existing EQIDIS wordmark with margins for both native installer themes. */
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const original = await readFile(new URL('../renderer/assets/welcome-brand.svg', import.meta.url), 'utf8')
for (const [name, ink] of [['brand', '#2B2B2B'], ['brand-dark', '#FFFFFF']]) {
  const logo = original.replace(/<style>[\s\S]*?<\/style>/, '').replaceAll('var(--eqidis-ink)', ink)
    .replace('<svg width="224" height="30"', '<svg x="80" y="68.5" width="440" height="59"')
  const vector = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="196" viewBox="0 0 600 196">${logo}</svg>`
  const asset = suffix => new URL(`../installer/assets/${name}${suffix}`, import.meta.url)
  await writeFile(asset('.svg'), `${vector}\n`)
  await sharp(Buffer.from(vector)).png().toFile(fileURLToPath(asset('.png')))
  await sharp(Buffer.from(vector), { density: 144 }).png().toFile(fileURLToPath(asset('-2x.png')))
}
