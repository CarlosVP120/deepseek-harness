import { useEffect, useRef } from 'react'
import { LIGHTHOUSE_SCENERY, LIGHTHOUSE_DAY_SCENERY } from './scenery-data.ts'
import { landscapeMotion } from './landscape-motion.ts'
import css from './HomeDashboard.module.css'

/**
 * Cache the bundled panorama as glyphs, then composite quiet maritime motion.
 * Image sampling only runs on load/resize; playback needs no network or model.
 * @returns decorative landscape with a static image fallback.
 */
export function AsciiLandscape() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas === null) return
    const image = new Image()
    let stopMotion: (() => void) | undefined
    const paint = () => {
      const width = canvas.clientWidth
      const height = canvas.clientHeight
      if (width === 0 || height === 0 || !image.complete || image.naturalWidth === 0) return
      const context = canvas.getContext('2d')
      if (context === null) return
      stopMotion?.()
      const scale = Math.min(window.devicePixelRatio, 2)
      canvas.width = Math.round(width * scale)
      canvas.height = Math.round(height * scale)
      context.scale(scale, scale)
      // Match the fallback's cover crop, retaining the lighthouse on the left.
      const imageScale = Math.max(width / image.naturalWidth, height / image.naturalHeight)
      const sourceWidth = width / imageScale
      const sourceHeight = height / imageScale
      const sourceTop = (image.naturalHeight - sourceHeight) / 2
      const lampX = image.naturalWidth * 0.092 * imageScale
      const lampY = (image.naturalHeight * 0.59 - sourceTop) * imageScale
      const cellWidth = 4
      const cellHeight = 5
      const columns = Math.ceil(width / cellWidth)
      const rows = Math.ceil(height / cellHeight)
      const sample = document.createElement('canvas')
      sample.width = columns
      sample.height = rows
      const sampling = sample.getContext('2d', { willReadFrequently: true })
      if (sampling === null) return
      sampling.drawImage(image, 0, sourceTop, sourceWidth, sourceHeight, 0, 0, columns, rows)
      const pixels = sampling.getImageData(0, 0, columns, rows).data
      const artwork = document.createElement('canvas')
      artwork.width = canvas.width
      artwork.height = canvas.height
      const glyphs = artwork.getContext('2d')
      if (glyphs === null) return
      glyphs.scale(scale, scale)
      // Keep a color underpainting inside the animated cache: sparse glyphs alone
      // discard most of the source luminance and make the panorama look dull.
      glyphs.drawImage(image, 0, sourceTop, sourceWidth, sourceHeight, 0, 0, width, height)
      glyphs.font = '5px monospace'
      glyphs.textBaseline = 'top'
      const ramp = ' .:;+*x#%@'
      for (let row = 0; row < rows; row++) {
        for (let column = 0; column < columns; column++) {
          const offset = (row * columns + column) * 4
          const red = pixels[offset] ?? 0
          const green = pixels[offset + 1] ?? 0
          const blue = pixels[offset + 2] ?? 0
          const light = (red * 0.2126 + green * 0.7152 + blue * 0.0722) / 255
          const glyph = ramp.charAt(Math.min(ramp.length - 1, Math.floor(light * ramp.length * 1.8)))
          glyphs.fillStyle = `rgb(${Math.min(255, red * 1.25)}, ${Math.min(255, green * 1.25)}, ${Math.min(255, blue * 1.25)})`
          glyphs.fillText(glyph, column * cellWidth, row * cellHeight)
        }
      }
      // Complementary cached masks keep the moving sky's lower edge seamless.
      const sky = document.createElement('canvas')
      const coast = document.createElement('canvas')
      sky.width = coast.width = artwork.width
      sky.height = coast.height = artwork.height
      const skyContext = sky.getContext('2d')
      const coastContext = coast.getContext('2d')
      if (skyContext === null || coastContext === null) return
      const skyMask = skyContext.createLinearGradient(0, 0, 0, artwork.height)
      skyMask.addColorStop(0, 'rgba(0, 0, 0, 1)')
      skyMask.addColorStop(0.4, 'rgba(0, 0, 0, 1)')
      skyMask.addColorStop(0.55, 'rgba(0, 0, 0, 0)')
      skyMask.addColorStop(1, 'rgba(0, 0, 0, 0)')
      skyContext.drawImage(artwork, 0, 0)
      skyContext.globalCompositeOperation = 'destination-in'
      skyContext.fillStyle = skyMask
      skyContext.fillRect(0, 0, sky.width, sky.height)
      coastContext.drawImage(artwork, 0, 0)
      coastContext.globalCompositeOperation = 'destination-out'
      coastContext.fillStyle = skyMask
      coastContext.fillRect(0, 0, coast.width, coast.height)
      // The beam uses the lamp's own warm color and the same character grid.
      const beam = document.createElement('canvas')
      beam.width = Math.ceil(width * 0.42)
      beam.height = Math.ceil(height * 0.14)
      const light = beam.getContext('2d')
      if (light === null) return
      const lamp = (Math.floor(lampY / cellHeight) * columns + Math.floor(lampX / cellWidth)) * 4
      const lampChannels = [pixels[lamp] ?? 0, pixels[lamp + 1] ?? 0, pixels[lamp + 2] ?? 0]
      const lampBrightness = Math.max(...lampChannels, 1)
      const lampColor = lampChannels.map(channel => Math.round(channel * 255 / lampBrightness)).join(', ')
      light.font = '5px monospace'
      light.textBaseline = 'top'
      for (let y = 0; y < beam.height; y += cellHeight) {
        for (let x = 0; x < beam.width; x += cellWidth) {
          const distance = Math.abs(y - beam.height / 2) / (3 + x * 0.07)
          const opacity = Math.max(0, 1 - distance) * (1 - x / beam.width)
          light.fillStyle = `rgba(${lampColor}, ${opacity})`
          light.fillText(x % 12 === 0 ? '*' : ':', x, y)
        }
      }
      const draw = (seconds: number) => {
        context.clearRect(0, 0, width, height)
        if (seconds === 0) {
          context.drawImage(artwork, 0, 0, width, height)
          return
        }
        context.drawImage(coast, 0, 0, width, height)
        const drift = Math.sin(seconds / 4.5) * 16
        context.save()
        context.globalCompositeOperation = 'lighter'
        context.drawImage(sky, drift - 18, 0, width + 36, height)
        context.restore()
        // Small independent water bands ripple without disturbing the shore.
        for (let band = 0; band < 10; band++) {
          const y = height * (0.81 + band * 0.019)
          const size = Math.min(height * 0.019, height - y)
          const ripple = Math.sin(seconds * 1.8 + band * 0.8) * (1.4 + band * 0.24)
          context.clearRect(0, y, width, size)
          context.drawImage(artwork, 0, y * scale, width * scale, size * scale, ripple - 4, y, width + 8, size)
        }
        if (!document.body.hasAttribute('data-ds-dark-theme')) return
        context.save()
        context.translate(lampX, lampY)
        context.rotate(Math.sin(seconds / 1.6) * 0.18 - 0.04)
        context.globalAlpha = 0.85 + Math.sin(seconds / 1.6) * 0.15
        context.drawImage(beam, 0, -beam.height / 2)
        context.restore()
      }
      draw(0)
      stopMotion = landscapeMotion(canvas, draw)
      canvas.dataset.ready = 'true'
    }
    image.onload = paint
    const adoptTheme = () => {
      const source = document.body.hasAttribute('data-ds-dark-theme')
        ? LIGHTHOUSE_SCENERY : LIGHTHOUSE_DAY_SCENERY
      if (image.src === source) return
      stopMotion?.()
      delete canvas.dataset.ready
      contextReset()
      image.src = source
    }
    // Presentation follows the theme attribute maintained by ui-theme.
    const contextReset = () => canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)
    const themeObserver = new MutationObserver(adoptTheme)
    themeObserver.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] })
    adoptTheme()
    const observer = new ResizeObserver(paint)
    observer.observe(canvas)
    return () => {
      stopMotion?.()
      observer.disconnect()
      themeObserver.disconnect()
      image.onload = null
    }
  }, [])
  return <div className={css.landscape} aria-hidden="true">
    <img className={`${css.scenery} ${css.nightScenery}`} src={LIGHTHOUSE_SCENERY} alt="" />
    <img className={`${css.scenery} ${css.dayScenery}`} src={LIGHTHOUSE_DAY_SCENERY} alt="" />
    <canvas ref={canvasRef} className={css.ascii} />
  </div>
}
