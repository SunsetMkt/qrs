<script lang="ts" setup>
import { fromUint8Array } from 'js-base64'
import { blockToBinary, createEncoder, type EncodedBlock, type LtEncoder } from 'luby-transform'
import { renderSVG } from 'uqr'
import { gifFilename, resolveGifFrameCount } from '~~/utils/gif'
import { useKiloBytesNumberFormat } from '~/composables/intlNumberFormat'

const props = withDefaults(defineProps<{
  data: Uint8Array
  filename?: string
  contentType?: string
  maxScansPerSecond: number
  sliceSize: number
  prefix?: string
}>(), {
  maxScansPerSecond: 20,
  sliceSize: 1000,
  prefix: '',
})

const count = ref(0)
const blockCount = ref(0)
let encoder: LtEncoder
watch(() => [props.data, props.sliceSize], () => {
  encoder = createEncoder(props.data, props.sliceSize)
  blockCount.value = encoder.k
}, { immediate: true })
const svg = ref<string>()
const block = shallowRef<EncodedBlock>()

const renderTime = ref(0)
const framePerSecond = computed(() => 1000 / renderTime.value)
const bytes = useKiloBytesNumberFormat(computed(() => ((block.value?.bytes || 0) / 1024).toFixed(2)))

const GIF_SIZE_OPTIONS = [256, 384, 512, 768, 1024]
const DEFAULT_GIF_SIZE = 512
const frameMode = ref<'multiplier' | 'frames'>('multiplier')
const gifMultiplier = ref<number | string>(1.5)
const customFrameCount = ref<number | string>(60)
const frameModes = [{ value: 'multiplier', label: 'By multiplier' }, { value: 'frames', label: 'Exact frames' }] as const
const gifFrameCount = computed(() => resolveGifFrameCount(
  blockCount.value,
  frameMode.value,
  frameMode.value === 'multiplier' ? gifMultiplier.value : customFrameCount.value,
) ?? 0)
const gifFps = ref(10)
const gifSize = ref(DEFAULT_GIF_SIZE)
const isExporting = ref(false)
const exportProgress = ref(0)
const exportError = ref('')
const exportSize = ref(0)
let exportController: AbortController | undefined
let isMounted = false
const exportDuration = computed(() => gifFrameCount.value / gifFps.value)

let pauseLive = () => {}
let resumeLive = () => {}

let previousFrameTime = 0

function renderNextFrame() {
  const data = encoder.fountain().next().value
  block.value = data
  const binary = blockToBinary(data)
  const str = fromUint8Array(binary)
  svg.value = renderSVG(props.prefix + str, { border: 5 })
  const now = performance.now()
  renderTime.value = now - previousFrameTime
  previousFrameTime = now
  count.value++
}

/** Seed exact mode from the current count while retaining the multiplier on return. */
function setFrameMode(mode: 'multiplier' | 'frames') {
  if (mode === 'frames' && frameMode.value !== mode)
    customFrameCount.value = gifFrameCount.value || 60
  frameMode.value = mode
}

function cancelExport() {
  exportController?.abort()
}

function download(bytes: Uint8Array) {
  const blob = new Blob([bytes], { type: 'image/gif' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = gifFilename(props.filename)
  anchor.click()
  URL.revokeObjectURL(url)
}

async function exportGif() {
  if (isExporting.value || !gifFrameCount.value)
    return

  const frames = gifFrameCount.value
  gifFps.value = Math.min(30, Math.max(1, Math.round(Number(gifFps.value) || 10)))
  if (!GIF_SIZE_OPTIONS.includes(gifSize.value))
    gifSize.value = DEFAULT_GIF_SIZE

  isExporting.value = true
  const controller = new AbortController()
  exportController = controller
  exportProgress.value = 0
  exportError.value = ''
  exportSize.value = 0
  pauseLive()

  try {
    const options = {
      data: props.data,
      sliceSize: props.sliceSize,
      frames,
      fps: gifFps.value,
      size: gifSize.value,
      prefix: props.prefix,
      signal: controller.signal,
      onProgress: (frames: number) => { exportProgress.value = frames },
    }
    const { encodeGif } = await import('~~/utils/gif-export')
    const output = await encodeGif(options)
    if (!output || controller.signal.aborted)
      return
    exportSize.value = output.byteLength
    download(output)
  }
  catch (error) {
    if (!controller.signal.aborted)
      exportError.value = error instanceof Error ? error.message : String(error)
  }
  finally {
    isExporting.value = false
    exportController = undefined
    if (isMounted) {
      previousFrameTime = performance.now()
      resumeLive()
    }
  }
}

onMounted(() => {
  isMounted = true
  previousFrameTime = performance.now()
  const controls = useIntervalFn(renderNextFrame, () => 1000 / props.maxScansPerSecond)
  pauseLive = controls.pause
  resumeLive = controls.resume
})

watch(() => [props.data, props.sliceSize, props.prefix], cancelExport)

onBeforeUnmount(() => {
  isMounted = false
  exportController?.abort()
  pauseLive()
})
</script>

<template>
  <div w-full flex flex-col items-center gap-4>
    <Collapsable w-full>
      <div grid-cols="[150px_1fr]" font="mono!" grid w-full gap-x-4 gap-y-2 overflow-x-auto whitespace-nowrap p2 text-sm>
        <span text-neutral-500>Indices</span>
        <span text-right md:text-left>{{ block?.indices }}</span>
        <span text-neutral-500>Total</span>
        <span text-right md:text-left>{{ block?.k }}</span>
        <span text-neutral-500>Bytes</span>
        <span text-right md:text-left>{{ bytes }}</span>
        <span text-neutral-500>Bitrate</span>
        <span text-right md:text-left>{{ ((block?.bytes || 0) / 1024 * framePerSecond).toFixed(2) }} Kbps</span>
        <span text-neutral-500>Frame Count</span>
        <span text-right md:text-left>{{ count }}</span>
        <span text-neutral-500>FPS</span>
        <span text-right md:text-left>{{ framePerSecond.toFixed(2) }}</span>
        <span text-neutral-500>Filename</span>
        <span text-right md:text-left>{{ props.filename }}</span>
        <span text-neutral-500>Content Type</span>
        <span text-right md:text-left>{{ props.contentType }}</span>
      </div>
    </Collapsable>
    <Collapsable w-full>
      <template #label>
        <span flex items-center gap-2>
          <span i-carbon:gif inline-block />
          Save QR sequence as GIF
        </span>
      </template>
      <div flex flex-col gap-4 p-4>
        <fieldset :disabled="isExporting" flex flex-col gap-3>
          <legend mb-2 text-sm font-medium>
            Sequence length
          </legend>
          <div flex flex-wrap gap-2>
            <label
              v-for="option in frameModes" :key="option.value"
              :class="frameMode === option.value ? 'border-blue bg-blue/10 text-blue' : 'border-gray/25 text-neutral-500'"
              flex cursor-pointer items-center gap-2 border rounded-lg px-3 py-2 text-sm
            >
              <input type="radio" name="gif-frame-mode" :value="option.value" :checked="frameMode === option.value" @change="setFrameMode(option.value)">
              {{ option.label }}
            </label>
          </div>
          <div v-if="frameMode === 'multiplier'" flex flex-col gap-2>
            <label flex flex-col gap-1 text-sm>
              <span text-neutral-500>Frames per data block</span>
              <div flex items-center gap-2>
                <input v-model.number="gifMultiplier" type="number" min="0.1" step="any" border="~ gray/25 rounded-lg" w-28 bg-transparent px-3 py-2>
                <span text-neutral-500>× {{ blockCount }} blocks</span>
              </div>
            </label>
            <div flex flex-wrap gap-2>
              <button
                v-for="multiple in [1.5, 2, 3]" :key="multiple" type="button"
                :class="gifMultiplier === multiple ? 'bg-blue/15 text-blue' : 'bg-gray/10 text-neutral-500'"
                rounded-md px-3 py-1 text-sm disabled:op-40 @click="gifMultiplier = multiple"
              >
                {{ multiple }}×{{ multiple === 1.5 ? ' · Default' : '' }}
              </button>
            </div>
          </div>
          <label v-else flex flex-col gap-1 text-sm>
            <span text-neutral-500>Number of frames</span>
            <input v-model.number="customFrameCount" type="number" min="1" step="1" border="~ gray/25 rounded-lg" w-28 bg-transparent px-3 py-2>
          </label>
        </fieldset>
        <div grid="~ cols-1 sm:cols-2" gap-4>
          <label flex flex-col gap-1 text-sm>
            <span text-neutral-500>Playback FPS</span>
            <input
              v-model.number="gifFps"
              type="number"
              min="1"
              max="30"
              :disabled="isExporting"
              border="~ gray/25 rounded-lg"
              bg-transparent px-2 py-1
            >
          </label>
          <label flex flex-col gap-1 text-sm>
            <span text-neutral-500>Image size</span>
            <select
              v-model.number="gifSize"
              :disabled="isExporting"
              border="~ gray/25 rounded-lg"
              bg="transparent dark:neutral-900" px-2 py-1
            >
              <option v-for="size in GIF_SIZE_OPTIONS" :key="size" :value="size">
                {{ size }} × {{ size }}
              </option>
            </select>
          </label>
        </div>
        <div aria-live="polite" rounded-lg bg-gray:10 p-3 text-sm>
          <template v-if="gifFrameCount">
            <p font-medium>
              {{ gifFrameCount }} frames · {{ exportDuration.toFixed(1) }}s
            </p>
            <p text-neutral-500>
              {{ blockCount }} data blocks · {{ (gifFrameCount / blockCount).toFixed(2) }}× effective
            </p>
          </template>
          <p v-else text-red role="alert">
            Enter a positive {{ frameMode === 'multiplier' ? 'multiplier' : 'whole number of frames' }}.
          </p>
        </div>
        <div v-if="isExporting" flex flex-col gap-2>
          <div h-2 overflow-hidden rounded-full bg-gray:20>
            <div
              h-full bg-blue transition="width 150ms"
              :style="{ width: `${exportProgress / gifFrameCount * 100}%` }"
            />
          </div>
          <div flex items-center justify-between text-sm>
            <span text-neutral-500>Encoding {{ exportProgress }} / {{ gifFrameCount }}</span>
            <button type="button" text-red hover="text-red-400" @click="cancelExport">
              Cancel
            </button>
          </div>
        </div>
        <p v-if="exportError" role="alert" text-sm text-red>
          {{ exportError }}
        </p>
        <p v-else-if="exportSize" text-sm text-green>
          Exported {{ (exportSize / 1024 / 1024).toFixed(2) }} MB
        </p>
        <button
          v-if="!isExporting"
          type="button"
          bg="neutral-800 dark:neutral-100"
          text="white dark:neutral-900"

          :disabled="!gifFrameCount"
          flex items-center justify-center gap-2 rounded-lg px-4 py-2 disabled:cursor-not-allowed disabled:op-40 hover:op-85
          @click="exportGif"
        >
          <span i-carbon:download inline-block />
          Export GIF
        </button>
      </div>
    </Collapsable>
    <div
      w-full flex flex-col items-center
      max-h="[calc(100vh-250px)]"
      max-w="[calc(100vh-250px)]"
    >
      <div relative w-full>
        <div
          class="aspect-square [&>svg]:h-full [&>svg]:w-full"

          h-full w-full overflow-hidden rounded="~ sm:lg"
          v-html="svg"
        />
      </div>
    </div>
  </div>
</template>

<style>
.arc {
  box-sizing: border-box;
  border-radius: 50%;
  background: #285655;
  mix-blend-mode: lighten;
  mask:
    linear-gradient(#000 0 0) content-box intersect,
    conic-gradient(#000 var(--deg), #0000 0);
}
</style>
