/**
 * Render ContabiliAI's Desktop artwork from the FiscalCFDI symbol: application
 * icons, the Windows tray icon, the welcome wordmark and the installer brand.
 * Output goes to resources/contabiliai, which the packager selects when
 * DSH_DESKTOP_PRODUCT=contabiliai. Run: node scripts/generate-contabiliai-assets.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

/** Petals of the FiscalCFDI symbol in its own 100-unit space (from ui-brand-contabiliai). */
const PETALS = [
  'M32.628212,8.6361885c-1.3350086,2.6396627-2.1030216,5.61516-2.1008072,8.7757549c0.0030556,8.8963432,5.9801903,16.3825207,14.1322403,18.705534c3.6843719-7.3044529,2.4856567-16.4400749-3.6176529-22.5373764C38.6159935,11.1556845,35.708065,9.5134058,32.628212,8.6361885z',
  'M36.6367226,44.4209976c-2.2498589-8.2716866-9.7946415-14.3607674-18.7788963-14.3561306C14.4649076,30.0661316,11.2771158,30.9387112,8.5,32.4654617c0.8604574,3.1732445,2.5209713,6.1744614,5.014431,8.6644402C19.7794399,47.3903809,29.2442551,48.4790459,36.6367226,44.4209976z',
  'M55.8574944,63.100174c-4.2872086,7.4469681-3.2679024,17.1136398,3.1020927,23.474884c2.2940254,2.2922363,5.0209694,3.880127,7.9149857,4.7891769c1.6449127-2.858284,2.5996017-6.1639252,2.5978088-9.6987228C69.4694366,72.9555359,63.745388,65.5863647,55.8574944,63.100174z',
  'M63.6276436,55.5768967c2.5443764,7.7994499,9.8681145,13.438858,18.5163231,13.4329529c3.2794952-0.0010529,6.3647232-0.8215637,9.0758514-2.254921c-0.9208527-2.8249702-2.486496-5.485714-4.7325592-7.7296715C80.2964554,52.8389931,70.9795303,51.6921387,63.6276436,55.5768967z',
  'M30.5274048,81.6813278c0.0012646,3.5291061,0.9556408,6.8292618,2.5986557,9.6833267c2.8991814-0.9107361,5.6306572-2.5032654,7.9271049-4.8024521c6.3580856-6.3627243,7.3740196-16.0220184,3.0891266-23.4626579C36.2468147,65.587204,30.5213947,72.9648132,30.5274048,81.6813278z',
  'M36.3721466,55.576683c-7.3567352-3.8893929-16.6797752-2.7372704-22.8689957,3.4578514c-2.241004,2.242691-3.8027496,4.9006958-4.72192,7.7218742c2.7157688,1.4356766,5.8073206,2.2557602,9.0932493,2.2534409C26.5151005,69.006897,33.8301964,63.3696022,36.3721466,55.576683z',
  'M69.4723816,17.3963432c-0.0010529-3.1555357-0.7696991-6.1255512-2.1030197-8.7609978c-3.0833282,0.8789034-5.9938965,2.5245552-8.4208412,4.9538212c-6.0945625,6.0989876-7.2872696,15.2284966-3.6074257,22.5278873C63.4990463,33.7925644,69.4770203,26.2994328,69.4723816,17.3963432z',
  'M63.3639107,44.4203644c7.3991051,4.060791,16.8699303,2.9689598,23.1346245-3.3035316c2.4859772-2.4876633,4.1424866-5.4840279,5.0014648-8.6517944c-2.7815399-1.5288563-5.9742889-2.4018574-9.3726883-2.4001713C73.1491699,30.0682411,65.6136627,36.1560555,63.3639107,44.4203644z',
]
const ORANGE = '#E48B59'
const petals = (fill = ORANGE) => PETALS.map(d => `<path d="${d}" fill="${fill}"/>`).join('')
const out = name => new URL(`../resources/contabiliai/${name}`, import.meta.url)
const installer = name => new URL(`../resources/contabiliai/installer/${name}`, import.meta.url)
await mkdir(installer(''), { recursive: true })

// Application icon: the symbol on the same white rounded tile the EQIDIS icons use.
const icon = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><rect x="80" y="80" width="864" height="864" rx="190" fill="#FFFFFF"/><g transform="translate(162 162) scale(7)">${petals()}</g></svg>`
await writeFile(out('icon.svg'), `${icon}\n`)
for (const name of ['icon.png', 'icon-macos.png', 'icon-windows.png']) await sharp(Buffer.from(icon)).png().toFile(fileURLToPath(out(name)))

// Windows tray: the bare symbol, as a PNG-entry ICO.
const glyph = size => sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="6 6 88 88">${petals()}</svg>`)).png().toBuffer()
const sizes = [16, 20, 24, 32, 40, 48, 64]
const images = await Promise.all(sizes.map(glyph))
const header = Buffer.alloc(6 + 16 * sizes.length)
header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4)
let offset = header.length
sizes.forEach((size, i) => {
  const at = 6 + 16 * i
  header.writeUInt8(size, at); header.writeUInt8(size, at + 1)
  header.writeUInt16LE(1, at + 4); header.writeUInt16LE(32, at + 6)
  header.writeUInt32LE(images[i].length, at + 8); header.writeUInt32LE(offset, at + 12)
  offset += images[i].length
})
await writeFile(out('tray-windows.ico'), Buffer.concat([header, ...images]))

// Wordmark: symbol + name, in the 224x30 frame of the EQIDIS welcome wordmark.
const wordmark = ink => `<g transform="translate(0 0) scale(0.3)">${petals()}</g><text x="38" y="22.5" font-family="-apple-system, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif" font-size="22" font-weight="600" letter-spacing="-0.3" fill="${ink}">ContabiliAI</text>`
await writeFile(out('welcome-brand.svg'), `<svg width="224" height="30" viewBox="0 0 224 30" fill="none" xmlns="http://www.w3.org/2000/svg">
<style>:root { --brand-ink: #2B2B2B; } @media (prefers-color-scheme: dark) { :root { --brand-ink: #FFFFFF; } }</style>
${wordmark('var(--brand-ink)')}
</svg>
`)
for (const [name, ink] of [['brand', '#2B2B2B'], ['brand-dark', '#FFFFFF']]) {
  const vector = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="196" viewBox="0 0 600 196"><svg x="80" y="68.5" width="440" height="59" viewBox="0 0 224 30">${wordmark(ink)}</svg></svg>`
  await writeFile(installer(`${name}.svg`), `${vector}\n`)
  await sharp(Buffer.from(vector)).png().toFile(fileURLToPath(installer(`${name}.png`)))
  await sharp(Buffer.from(vector), { density: 144 }).png().toFile(fileURLToPath(installer(`${name}-2x.png`)))
}
// Uninstaller sidebar: the symbol centered on white.
const sidebar = `<svg xmlns="http://www.w3.org/2000/svg" width="164" height="314" viewBox="0 0 164 314"><rect width="164" height="314" fill="#FFFFFF"/><g transform="translate(42 117) scale(0.8)">${petals()}</g></svg>`
await sharp(Buffer.from(sidebar)).flatten({ background: '#FFFFFF' }).png().toFile(fileURLToPath(installer('uninstaller-sidebar.png')))
