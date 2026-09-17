import { expect, it } from 'vitest'
import { resolveGifFrameCount } from '../utils/gif'

it('rounds fractional block multiples up to complete frames', () => {
  expect(resolveGifFrameCount(21, 'multiplier', 1.5)).toBe(32)
  expect(resolveGifFrameCount(21, 'multiplier', 2)).toBe(42)
})

it('keeps explicit frame counts independent of block count', () => {
  expect(resolveGifFrameCount(100, 'frames', 60)).toBe(60)
  expect(resolveGifFrameCount(200, 'frames', 60)).toBe(60)
})

it('preserves small and large frame counts without clamping', () => {
  expect(resolveGifFrameCount(1, 'multiplier', 1.5)).toBe(2)
  expect(resolveGifFrameCount(400, 'multiplier', 2)).toBe(800)
})

it('rejects empty, non-finite, negative and fractional explicit frame inputs', () => {
  for (const value of ['', 0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    expect(resolveGifFrameCount(20, 'multiplier', value)).toBeUndefined()
  }
  expect(resolveGifFrameCount(20, 'frames', 10.5)).toBeUndefined()
})

it('accepts one frame and counts above 500 in exact mode', () => {
  expect(resolveGifFrameCount(1, 'frames', 1)).toBe(1)
  expect(resolveGifFrameCount(400, 'frames', 1200)).toBe(1200)
})

it('rejects counts outside the safe integer range', () => {
  expect(resolveGifFrameCount(400, 'multiplier', Number.MAX_VALUE)).toBeUndefined()
  expect(resolveGifFrameCount(1, 'frames', Number.MAX_SAFE_INTEGER + 1)).toBeUndefined()
})
