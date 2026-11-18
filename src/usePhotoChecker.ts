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
import type { PhotoWorkerMessage, PhotoWorkerRequest } from './photo-issue.worker'

/** At most this many photos of one batch are read; the first is usually the clearest. */
const MAX_PHOTOS_CHECKED = 3

/** Whether this browser can run the photo checker at all. */
export const photoCheckerSupported = typeof window !== 'undefined'
  && typeof Worker !== 'undefined'
  && typeof WebAssembly !== 'undefined'
  && typeof createImageBitmap === 'function'
  && Boolean(window.crypto?.subtle)

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
    if (!context) throw new Error('This browser cannot read the photo.')
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

  const failAll = useCallback((message: string) => {
    for (const request of requests.current.values()) request.reject(new Error(message))
    requests.current.clear()
  }, [])

  const stop = useCallback(() => {
    worker.current?.terminate()
    worker.current = undefined
    failAll('The photo check was stopped.')
    setDownloadProgress(undefined)
  }, [failAll])

  const getWorker = useCallback(() => {
    if (worker.current) return worker.current
    const created = new Worker(new URL('./photo-issue.worker.ts', import.meta.url), { type: 'module' })
    created.onmessage = (event: MessageEvent<PhotoWorkerMessage>) => {
      const message = event.data
      if (message.type === 'progress') {
        const progress = message.total ? message.loaded / message.total : 0
        setDownloadProgress(progress >= 1 ? undefined : progress)
        return
      }
      const request = requests.current.get(message.id)
      if (!request) return
      requests.current.delete(message.id)
      if (message.type === 'error') setDownloadProgress(undefined)
      if (message.type === 'result') request.resolve(message.guess)
      else request.reject(new Error(message.message))
    }
    created.onerror = () => {
      failAll('The photo checker could not start in this browser.')
      created.terminate()
      if (worker.current === created) worker.current = undefined
      setDownloadProgress(undefined)
    }
    worker.current = created
    return created
  }, [failAll])

  const classify = useCallback(async (photo: ImageBitmapSource) => {
    const pixels = await photoPixels(photo)
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
        if (error instanceof DOMException || (error instanceof Error && error.message === 'This browser cannot read the photo.')) continue
        throw error
      }
      read += 1
      guesses.push(guess)
      if (guess.category && guess.confidence >= CONFIDENT_GUESS) break
    }
    if (!read && photos.length) throw new Error('This photo could not be read. Try another photo.')
    return pickPhotoGuess(guesses)
  }, [classify])

  useEffect(() => stop, [stop])

  return useMemo(() => ({ downloadProgress, classify, checkPhotos, stop }), [downloadProgress, classify, checkPhotos, stop])
}
