// Reads report photos on the reporter's device, off the main thread so the form stays responsive.
// The photo never leaves the device: only the model file is downloaded, once, then cached.
//
// Messages in:  { type: 'classify', id, pixels } (pixels from toModelInput)
// Messages out: { type: 'progress', loaded, total }, { type: 'result', id, guess },
//               { type: 'error', id, message }
import * as ort from 'onnxruntime-web/wasm'
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url'
import labelData from './data/photo-issue-labels.json'
import { PHOTO_MODEL, PHOTO_MODEL_CACHE, guessPhotoIssue, type PhotoIssueLabel } from './lib/photo-issue-classifier'

export type PhotoWorkerRequest = { type: 'classify'; id: number; pixels: Float32Array }
export type PhotoWorkerMessage =
  | { type: 'progress'; loaded: number; total: number }
  | { type: 'result'; id: number; guess: ReturnType<typeof guessPhotoIssue> }
  | { type: 'error'; id: number; message: string }

// The project is typed for the page (DOM), not for workers; these are the two worker members used.
const scope = self as unknown as {
  postMessage(message: PhotoWorkerMessage): void
  onmessage: ((event: MessageEvent<PhotoWorkerRequest>) => void) | null
}

ort.env.wasm.wasmPaths = { wasm: wasmUrl }
// Threads need cross-origin isolation, which the site does not have; one thread is enough here.
ort.env.wasm.numThreads = 1

const labels = labelData.labels as PhotoIssueLabel[]
let session: Promise<ort.InferenceSession> | undefined

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function openCache(): Promise<Cache | undefined> {
  try {
    return await caches.open(PHOTO_MODEL_CACHE)
  } catch {
    return undefined
  }
}

/** Streams the model into one buffer, reporting progress; the size is known, so nothing is copied twice. */
async function download(): Promise<Uint8Array> {
  const response = await fetch(PHOTO_MODEL.url)
  if (!response.ok || !response.body) throw new Error(`The photo checker could not be downloaded (HTTP ${response.status}).`)
  const total = Number(response.headers.get('content-length')) || PHOTO_MODEL.bytes
  let buffer = new Uint8Array(total)
  let loaded = 0
  let reported = 0
  const reader = response.body.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (loaded + value.length > buffer.length) {
      const bigger = new Uint8Array(Math.max(buffer.length * 2, loaded + value.length))
      bigger.set(buffer.subarray(0, loaded))
      buffer = bigger
    }
    buffer.set(value, loaded)
    loaded += value.length
    if (loaded - reported > total / 100 || loaded === total) {
      reported = loaded
      scope.postMessage({ type: 'progress', loaded, total })
    }
  }
  return buffer.subarray(0, loaded)
}

async function modelBytes(): Promise<Uint8Array> {
  const cache = await openCache()
  const cached = await cache?.match(PHOTO_MODEL.url).catch(() => undefined)
  if (cached) {
    const bytes = new Uint8Array(await cached.arrayBuffer())
    if (await sha256(bytes) === PHOTO_MODEL.sha256) return bytes
    await cache?.delete(PHOTO_MODEL.url).catch(() => undefined)
  }
  const bytes = await download()
  if (await sha256(bytes) !== PHOTO_MODEL.sha256) throw new Error('The photo checker download was incomplete. Try again.')
  // A full or blocked storage only means the next form downloads it again.
  await cache?.put(PHOTO_MODEL.url, new Response(bytes, { headers: { 'Content-Type': 'application/octet-stream' } })).catch(() => undefined)
  return bytes
}

function loadSession(): Promise<ort.InferenceSession> {
  session ??= modelBytes().then((bytes) => ort.InferenceSession.create(bytes, { executionProviders: ['wasm'] }))
  // A failed load is not kept, so "Try again" starts over.
  session.catch(() => { session = undefined })
  return session
}

scope.onmessage = async (event) => {
  const request = event.data
  if (request.type !== 'classify') return
  try {
    const model = await loadSession()
    const size = PHOTO_MODEL.inputSize
    const input = new ort.Tensor('float32', request.pixels, [1, 3, size, size])
    const output = await model.run({ [model.inputNames[0]]: input })
    const embedding = output.image_embeds ?? output[model.outputNames[0]]
    const guess = guessPhotoIssue(embedding.data as Float32Array, labels)
    scope.postMessage({ type: 'result', id: request.id, guess })
  } catch (error) {
    scope.postMessage({ type: 'error', id: request.id, message: error instanceof Error ? error.message : 'The photo could not be checked.' })
  }
}
