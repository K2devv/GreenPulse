import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CONFIDENT_GUESS,
  PHOTO_MODEL,
  PHOTO_MODEL_CACHE,
  centerSquare,
  mayDownloadWithoutAsking,
  pickPhotoGuess,
  toModelInput,
  type PhotoIssueGuess,
} from './lib/photo-issue-classifier'
import { PHOTO_UNREADABLE_MESSAGE, PhotoCheckError, isPhotoCheckFailure, photoCheckFailureOf, supportsModuleWorkers, supportsWasmSimd } from './lib/photo-check-failure'
import type { PhotoWorkerMessage, PhotoWorkerRequest } from './photo-issue.worker'

/** At most this many photos of one batch are read; the first is usually the clearest. */
const MAX_PHOTOS_CHECKED = 3

/**
 * Whether this browser can run the photo checker at all. Older browsers (before Chrome 91 or
 * Safari 16.4) lack WebAssembly SIMD or module workers; they go straight to the form instead of
 * failing after the reporter picks a photo.
 */
export const photoCheckerSupported = typeof window !== 'undefined'
  && typeof Worker !== 'undefined'
  && typeof WebAssembly !== 'undefined'
  && typeof createImageBitmap === 'function'
  && Boolean(window.crypto?.subtle)
  && supportsWasmSimd()
  && supportsModuleWorkers()

/** Leaves the real reason in the browser console, where the screens' short messages leave it out. */
const logFailure = (error: PhotoCheckError) => console.warn(`GreenPulse photo checker (${error.failure}):`, error.message)

/** Whether the model is already on this device, so using it costs no download. */
export async function photoModelIsCached(): Promise<boolean> {
  try {
    if (!('caches' in window) || !(await caches.has(PHOTO_MODEL_CACHE))) return false
    return Boolean(await (await caches.open(PHOTO_MODEL_CACHE)).match(PHOTO_MODEL.url))
  } catch {
    return false
  }
}

/** Whether the model may be downloaded without asking: not on mobile data, a phone that does not say, or with the data saver on. */
export function photoModelMayDownloadNow(): boolean {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean; type?: string } }).connection
  let touchDevice = false
  try {
    touchDevice = window.matchMedia('(pointer: coarse)').matches
  } catch {
    // No media queries: treat it as a computer.
  }
  return mayDownloadWithoutAsking({ saveData: connection?.saveData, type: connection?.type, touchDevice })
}

/** The centre square of a photo or camera frame, scaled to the model's input size and normalized. */
async function photoPixels(photo: ImageBitmapSource): Promise<Float32Array> {
  const bitmap = await createImageBitmap(photo)
  try {
    const target = PHOTO_MODEL.inputSize
    const { x, y, size } = centerSquare(bitmap.width, bitmap.height)
    const canvas = document.createElement('canvas')
    canvas.width = target
    canvas.height = target
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new PhotoCheckError('photo', 'This browser cannot read the photo.')
    context.imageSmoothingQuality = 'high'
    let source: CanvasImageSource = bitmap
    let crop = { x, y, size }
    // Shrinking in two steps keeps fine detail that one large jump would lose in some browsers.
    if (size > target * 2) {
      const middle = document.createElement('canvas')
      middle.width = target * 2
      middle.height = target * 2
      const middleContext = middle.getContext('2d')
      if (middleContext) {
        middleContext.imageSmoothingQuality = 'high'
        middleContext.drawImage(bitmap, x, y, size, size, 0, 0, middle.width, middle.height)
        source = middle
        crop = { x: 0, y: 0, size: middle.width }
      }
    }
    context.drawImage(source, crop.x, crop.y, crop.size, crop.size, 0, 0, target, target)
    return toModelInput(context.getImageData(0, 0, target, target).data, target)
  } finally {
    bitmap.close()
  }
}

export type PhotoChecker = {
  /** From 0 to 1 while the model downloads (first use only); undefined otherwise. */
  downloadProgress: number | undefined
  /** Reads one photo or camera frame. The first call downloads the model if it is not cached. */
  classify: (photo: ImageBitmapSource) => Promise<PhotoIssueGuess>
  /**
   * Reads up to three photos, stopping early on a confident one, and returns the best guess that
   * names a category, or undefined when none shows an issue. `stale` ends the check early.
   */
  checkPhotos: (photos: Blob[], stale?: () => boolean) => Promise<PhotoIssueGuess | undefined>
  /** Stops any check and frees the model's memory. */
  stop: () => void
}

/**
 * The photo checker: CLIP running in a Web Worker on the reporter's own device. One checker is
 * shared by everything that reads photos, so the model is loaded into memory only once.
 */
export function usePhotoChecker(): PhotoChecker {
  const [downloadProgress, setDownloadProgress] = useState<number>()
  const worker = useRef<Worker | undefined>(undefined)
  const requests = useRef(new Map<number, { resolve: (guess: PhotoIssueGuess) => void; reject: (error: Error) => void }>())
  const nextRequest = useRef(0)

  const failAll = useCallback((error: Error) => {
    for (const request of requests.current.values()) request.reject(error)
    requests.current.clear()
  }, [])

  const stop = useCallback(() => {
    worker.current?.terminate()
    worker.current = undefined
    failAll(new Error('The photo check was stopped.'))
    setDownloadProgress(undefined)
  }, [failAll])

  const getWorker = useCallback(() => {
    if (worker.current) return worker.current
    const created = new Worker(new URL('./photo-issue.worker.ts', import.meta.url), { type: 'module' })
    // Set once the worker's script has loaded; an error before that means the script never arrived.
    let loaded = false
    created.onmessage = (event: MessageEvent<PhotoWorkerMessage>) => {
      const message = event.data
      if (message.type === 'ready') {
        loaded = true
        return
      }
      if (message.type === 'progress') {
        const progress = message.total ? message.loaded / message.total : 0
        setDownloadProgress(progress >= 1 ? undefined : progress)
        return
      }
      const request = requests.current.get(message.id)
      if (!request) return
      requests.current.delete(message.id)
      if (message.type === 'result') {
        request.resolve(message.guess)
        return
      }
      setDownloadProgress(undefined)
      const error = new PhotoCheckError(isPhotoCheckFailure(message.failure) ? message.failure : 'device', message.message)
      logFailure(error)
      request.reject(error)
    }
    // Before the worker's script has loaded, an error means the file did not arrive: the site was
    // updated while this page was open (the old file is gone), or the connection to GreenPulse
    // dropped. A reload fixes both. After it loaded, the model crashed on this device.
    created.onerror = (event) => {
      const error = loaded
        ? new PhotoCheckError('device', event.message || 'The photo checker stopped unexpectedly.')
        : new PhotoCheckError('app', 'The photo checker script could not be loaded.')
      logFailure(error)
      failAll(error)
      created.terminate()
      if (worker.current === created) worker.current = undefined
      setDownloadProgress(undefined)
    }
    worker.current = created
    return created
  }, [failAll])

  const classify = useCallback(async (photo: ImageBitmapSource) => {
    let pixels: Float32Array
    try {
      pixels = await photoPixels(photo)
    } catch (error) {
      // createImageBitmap throws a DOMException for a file the browser cannot decode.
      if (error instanceof PhotoCheckError) throw error
      throw new PhotoCheckError('photo', error instanceof Error ? error.message : 'The photo could not be read.')
    }
    return new Promise<PhotoIssueGuess>((resolve, reject) => {
      const id = nextRequest.current += 1
      requests.current.set(id, { resolve, reject })
      getWorker().postMessage({ type: 'classify', id, pixels } satisfies PhotoWorkerRequest, [pixels.buffer])
    })
  }, [getWorker])

  const checkPhotos = useCallback(async (photos: Blob[], stale?: () => boolean) => {
    const guesses: PhotoIssueGuess[] = []
    let read = 0
    for (const photo of photos.slice(0, MAX_PHOTOS_CHECKED)) {
      if (stale?.()) return undefined
      let guess: PhotoIssueGuess
      try {
        guess = await classify(photo)
      } catch (error) {
        // A photo the browser cannot decode is skipped; a checker that cannot run is an error.
        if (photoCheckFailureOf(error) === 'photo') continue
        throw error
      }
      read += 1
      guesses.push(guess)
      if (guess.category && guess.confidence >= CONFIDENT_GUESS) break
    }
    if (!read && photos.length) throw new PhotoCheckError('photo', PHOTO_UNREADABLE_MESSAGE)
    return pickPhotoGuess(guesses)
  }, [classify])

  useEffect(() => stop, [stop])

  return useMemo(() => ({ downloadProgress, classify, checkPhotos, stop }), [downloadProgress, classify, checkPhotos, stop])
}
