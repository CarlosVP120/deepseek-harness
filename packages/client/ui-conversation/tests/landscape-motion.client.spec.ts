// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { landscapeMotion } from '../src/client/skeleton/landscape-motion.ts'

function environment(reduced = false) {
  const media = new EventTarget()
  Object.defineProperty(media, 'matches', { value: reduced, writable: true })
  vi.stubGlobal('matchMedia', () => media)
  const pending = new Map<number, FrameRequestCallback>()
  let next = 0
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    pending.set(++next, callback)
    return next
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => { pending.delete(id) })
  let notify: IntersectionObserverCallback | undefined
  const disconnect = vi.fn()
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback: IntersectionObserverCallback) { notify = callback }
    observe() {}
    disconnect = disconnect
  })
  const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
  return {
    pending, media, hidden, disconnect,
    frame(now: number) {
      const entry = pending.entries().next().value
      if (entry === undefined) throw new Error('No scheduled animation frame')
      pending.delete(entry[0])
      entry[1](now)
    },
    visible(value: boolean) {
      notify?.([{ isIntersecting: value } as IntersectionObserverEntry], {} as IntersectionObserver)
    },
    reduced(value: boolean) {
      Object.defineProperty(media, 'matches', { value, writable: true })
      media.dispatchEvent(new Event('change'))
    },
  }
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('Decorative landscape playback', () => {
  it('caps drawing at 24 fps and stops all work on unmount', () => {
    const env = environment()
    const draw = vi.fn()
    const stop = landscapeMotion(document.createElement('canvas'), draw)
    env.frame(0)
    env.frame(16)
    env.frame(32)
    expect(draw).toHaveBeenCalledTimes(1)
    env.frame(48)
    expect(draw).toHaveBeenLastCalledWith(0.048)
    stop()
    expect(env.pending.size).toBe(0)
    expect(env.disconnect).toHaveBeenCalledOnce()
    document.dispatchEvent(new Event('visibilitychange'))
    env.reduced(false)
    expect(env.pending.size).toBe(0)
  })

  it('pauses when hidden or scrolled away, resuming without a time jump', () => {
    const env = environment()
    const draw = vi.fn()
    const stop = landscapeMotion(document.createElement('canvas'), draw)
    env.frame(0)
    env.frame(50)
    env.hidden.mockReturnValue(true)
    document.dispatchEvent(new Event('visibilitychange'))
    expect(env.pending.size).toBe(0)
    env.hidden.mockReturnValue(false)
    document.dispatchEvent(new Event('visibilitychange'))
    env.frame(60_000)
    env.frame(60_050)
    expect(draw).toHaveBeenLastCalledWith(0.1)
    env.visible(false)
    expect(env.pending.size).toBe(0)
    env.visible(true)
    expect(env.pending.size).toBe(1)
    stop()
  })

  it('keeps a static scene for reduced motion, including live preference changes', () => {
    const env = environment(true)
    const draw = vi.fn()
    const stop = landscapeMotion(document.createElement('canvas'), draw)
    expect(draw).toHaveBeenLastCalledWith(0)
    expect(env.pending.size).toBe(0)
    env.reduced(false)
    expect(env.pending.size).toBe(1)
    env.frame(0)
    env.frame(50)
    env.reduced(true)
    expect(env.pending.size).toBe(0)
    expect(draw).toHaveBeenLastCalledWith(0)
    stop()
  })
})
