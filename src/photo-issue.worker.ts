// Reads report photos on the reporter's device, off the main thread so the form stays responsive.
// The photo never leaves the device: only the model file is downloaded, once, then cached.
//
// Messages in:  { type: 'classify', id, pixels } (pixels from toModelInput)
// Messages out: { type: 'ready' } once this script has loaded, { type: 'progress', loaded, total },
//               { type: 'result', id, guess },
//               { type: 'error', id, failure, message } (failure says why, see photo-check-failure)
import * as ort from 'onnxruntime-web/wasm'
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url'
import labelData from './data/photo-issue-labels.json'
import { PhotoCheckError, photoCheckFailureOf, type PhotoCheckFailure } from './lib/photo-check-failure'
import { PHOTO_MODEL, PHOTO_MODEL_CACHE, guessPhotoIssue, type PhotoIssueLabel } from './lib/photo-issue-classifier'

export type PhotoWorkerRequest = { type: 'classify'; id: number; pixels: Float32Array }
export type PhotoWorkerMessage =
  | { type: 'ready' }
  | { type: 'progress'; loaded: number; total: number }
  | { type: 'result'; id: number; guess: ReturnType<typeof guessPhotoIssue> }
  | { type: 'error'; id: number; failure: PhotoCheckFailure; message: string }

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

const messageOf = (error: unknown, fallback: string) => error instanceof Error && error.message ? error.message : fallback

/** Whether the runtime's own file can still be fetched from GreenPulse; after a site update it can't. */
const runtimeFileReachable = () => fetch(wasmUrl, { method: 'HEAD', cache: 'no-store' }).then((response) => response.ok, () => false)

/** Downloads (or reads from the cache) the model, then starts the runtime. Errors say which step failed. */
async function createSession(): Promise<ort.InferenceSession> {
  let bytes: Uint8Array
  try {
    bytes = await modelBytes()
  } catch (error) {
    throw new PhotoCheckError('download', messageOf(error, 'The photo checker could not be downloaded.'))
  }
  try {
    return await ort.InferenceSession.create(bytes, { executionProviders: ['wasm'] })
  } catch (error) {
    // The runtime fetches its .wasm file from GreenPulse first. If that file is gone (the site was
    // updated) or unreachable, a reload fixes it; otherwise this device could not run the model.
    throw new PhotoCheckError(await runtimeFileReachable() ? 'device' : 'app', messageOf(error, 'The photo checker could not start.'))
  }
}

function loadSession(): Promise<ort.InferenceSession> {
  session ??= createSession()
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
    // Anything not sorted above failed while running the model, which is down to the device.
    scope.postMessage({ type: 'error', id: request.id, failure: photoCheckFailureOf(error), message: messageOf(error, 'The photo could not be checked.') })
  }
}

// This script and everything it imports have loaded. A crash after this point is the device's,
// not a missing file's (see the worker's error handler in usePhotoChecker).
scope.postMessage({ type: 'ready' })
