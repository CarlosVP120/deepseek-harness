// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { AsciiLandscape } from '../src/client/skeleton/AsciiLandscape.tsx'
import { LIGHTHOUSE_DAY_SCENERY, LIGHTHOUSE_SCENERY } from '../src/client/skeleton/scenery-data.ts'

afterEach(() => {
  cleanup()
  document.body.removeAttribute('data-ds-dark-theme')
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('loads the matching local scene on live theme changes and detaches on unmount', async () => {
  const images: HTMLImageElement[] = []
  const NativeImage = window.Image
  vi.stubGlobal('Image', function () {
    const image = new NativeImage()
    images.push(image)
    return image
  })
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  const view = render(<AsciiLandscape />)
  const image = images[0]!
  expect(image.src).toBe(LIGHTHOUSE_DAY_SCENERY)
  await act(async () => { document.body.setAttribute('data-ds-dark-theme', '') })
  expect(image.src).toBe(LIGHTHOUSE_SCENERY)
  await act(async () => { document.body.removeAttribute('data-ds-dark-theme') })
  expect(image.src).toBe(LIGHTHOUSE_DAY_SCENERY)
  view.unmount()
  await act(async () => { document.body.setAttribute('data-ds-dark-theme', '') })
  expect(image.src).toBe(LIGHTHOUSE_DAY_SCENERY)
  expect(image.onload).toBe(null)
})
