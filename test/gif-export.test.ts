import { expect, it, vi } from 'vitest'
import { encodeGif } from '../utils/gif-export'

const data = new TextEncoder().encode('A small GIF transfer')
const options = { data, sliceSize: 1000, frames: 1, fps: 10, size: 256, prefix: '' }

it('exports a recoverable single-frame transfer', async () => {
  const bytes = await encodeGif(options)
  expect(new TextDecoder().decode(bytes!.slice(0, 6))).toBe('GIF89a')
})

it('rejects sequences that cannot contain enough information', async () => {
  await expect(encodeGif({ ...options, sliceSize: 1 }))
    .rejects
    .toThrow('Increase the multiplier or frame count')
})

it('does not return a GIF when cancelled after the final frame', async () => {
  const controller = new AbortController()
  expect(await encodeGif({ ...options, signal: controller.signal, onProgress: () => controller.abort() }))
    .toBeUndefined()
})

it('rejects enough frames when they repeat the same block', async () => {
  const random = vi.spyOn(Math, 'random').mockReturnValue(0)
  try {
    await expect(encodeGif({ ...options, sliceSize: 16, frames: 10 }))
      .rejects
      .toThrow('Increase the multiplier or frame count')
  }
  finally {
    random.mockRestore()
  }
})

it('does no work when already cancelled', async () => {
  const controller = new AbortController()
  controller.abort()
  const onProgress = vi.fn()
  expect(await encodeGif({ ...options, signal: controller.signal, onProgress })).toBeUndefined()
  expect(onProgress).not.toHaveBeenCalled()
})
