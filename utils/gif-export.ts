import { GIFEncoder } from 'gifenc'
import { fromUint8Array } from 'js-base64'
import { encode } from 'uqr'
import { binaryToBlock, blockToBinary, createDecoder, createEncoder } from '../packages/luby-transform/src'
import { GIF_PALETTE, qrMatrixToIndexedPixels } from './gif'

interface GifExportOptions {
  data: Uint8Array
  sliceSize: number
  frames: number
  fps: number
  size: number
  prefix: string
  signal?: AbortSignal
  onProgress?: (frames: number) => void
}

/** Verify the exact exported blocks with the receiver's decoder; cancellation produces no file. */
export async function encodeGif({ data, sliceSize, frames, fps, size, prefix, signal, onProgress }: GifExportOptions) {
  if (signal?.aborted)
    return

  const encoder = createEncoder(data, sliceSize)
  const decoder = createDecoder()
  const recoveryError = 'This sequence cannot recover the file. Increase the multiplier or frame count and try again.'
  if (frames < encoder.k)
    throw new Error(recoveryError)

  const gif = GIFEncoder()
  const delay = Math.round(1000 / fps)
  let recovered = false

  for (let frame = 0; frame < frames; frame++) {
    if (signal?.aborted)
      return

    const binary = blockToBinary(encoder.fountain().next().value)
    const qr = encode(prefix + fromUint8Array(binary))
    const pixels = qrMatrixToIndexedPixels(qr.data, size, 5)
    gif.writeFrame(pixels, size, size, {
      palette: frame === 0 ? GIF_PALETTE : undefined,
      delay,
      repeat: 0,
    })
    if (!recovered)
      recovered = decoder.addBlock(binaryToBlock(binary))

    onProgress?.(frame + 1)
    if (frame % 4 === 3)
      await new Promise(resolve => setTimeout(resolve, 0))
  }

  if (signal?.aborted)
    return
  if (!recovered)
    throw new Error(recoveryError)

  const decoded = decoder.getDecoded()
  if (!decoded || decoded.length !== data.length || !decoded.every((byte, index) => byte === data[index]))
    throw new Error(recoveryError)

  gif.finish()
  return gif.bytes()
}
