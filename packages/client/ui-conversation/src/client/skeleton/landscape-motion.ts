/** Bounded decorative playback that suspends work outside the visible home. */
export function landscapeMotion(surface: HTMLCanvasElement, draw: (seconds: number) => void): () => void {
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
  let visible = true
  let frame: number | undefined
  let previous: number | undefined
  let elapsed = 0
  let painted = -Infinity
  const stop = () => {
    if (frame !== undefined) cancelAnimationFrame(frame)
    frame = undefined
    previous = undefined
  }
  const tick = (now: number) => {
    if (previous !== undefined) elapsed += Math.min(now - previous, 100)
    previous = now
    // Cached bitmap compositing at 24 fps; never resample the image per frame.
    if (elapsed - painted >= 1000 / 24) {
      draw(elapsed / 1000)
      painted = elapsed
    }
    frame = requestAnimationFrame(tick)
  }
  const sync = () => {
    stop()
    if (preference.matches) {
      draw(0)
    } else if (!document.hidden && visible) {
      frame = requestAnimationFrame(tick)
    }
  }
  const observer = new IntersectionObserver((entries) => {
    const entry = entries[0]
    if (entry === undefined) return
    visible = entry.isIntersecting
    sync()
  })
  observer.observe(surface)
  preference.addEventListener('change', sync)
  document.addEventListener('visibilitychange', sync)
  sync()
  return () => {
    stop()
    observer.disconnect()
    preference.removeEventListener('change', sync)
    document.removeEventListener('visibilitychange', sync)
  }
}
