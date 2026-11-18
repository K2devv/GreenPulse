import { useCallback, useRef, useState } from 'react'
import type { PhotoIssueGuess } from './lib/photo-issue-classifier'
import { photoCheckerSupported, photoModelIsCached, photoModelMayDownloadNow, type PhotoChecker } from './usePhotoChecker'

export type PhotoSuggestionState =
  | { status: 'idle' }
  /** The model is not cached and the connection may be metered: the reporter is asked first. */
  | { status: 'ask' }
  | { status: 'downloading'; progress: number }
  | { status: 'checking' }
  | { status: 'suggested'; guess: PhotoIssueGuess }
  /** The photos were read, but none clearly shows a reportable issue. */
  | { status: 'unclear' }
  | { status: 'failed'; message: string }

type InternalState = Exclude<PhotoSuggestionState, { status: 'downloading' }>

/**
 * Suggests a category and issue type from photos added to the report form.
 *
 * - `analyze(photos)` checks newly added photos. On a phone without Wi-Fi, or with the data saver
 *   on, the reporter is asked before the model is downloaded.
 * - `onGuess` is called once per batch with the best guess that names a category.
 * - `present(guess)` shows a guess made before the form opened, from the photo start screen.
 * - `reset()` stops any check and frees the model; call it when the form closes.
 */
export function usePhotoIssueSuggestion(checker: PhotoChecker, onGuess: (guess: PhotoIssueGuess) => void) {
  const [internal, setInternal] = useState<InternalState>({ status: 'idle' })
  // Each check gets a number; a reset or newer check makes older results stale.
  const run = useRef(0)
  // Photos waiting for the reporter's yes, or kept for "Try again".
  const waiting = useRef<Blob[]>([])
  const onGuessRef = useRef(onGuess)
  onGuessRef.current = onGuess
  const { checkPhotos, stop } = checker

  const check = useCallback(async (photos: Blob[]) => {
    const id = run.current += 1
    waiting.current = photos
    setInternal({ status: 'checking' })
    let guess: PhotoIssueGuess | undefined
    try {
      guess = await checkPhotos(photos, () => run.current !== id)
    } catch (error) {
      if (run.current === id) setInternal({ status: 'failed', message: error instanceof Error ? error.message : 'The photo could not be checked.' })
      return
    }
    if (run.current !== id) return
    if (!guess) {
      setInternal({ status: 'unclear' })
      return
    }
    setInternal({ status: 'suggested', guess })
    onGuessRef.current(guess)
  }, [checkPhotos])

  const analyze = useCallback(async (photos: Blob[]) => {
    if (!photoCheckerSupported || !photos.length) return
    const id = run.current += 1
    const allowed = await photoModelIsCached() || photoModelMayDownloadNow()
    if (run.current !== id) return
    if (allowed) {
      void check(photos)
      return
    }
    waiting.current = photos
    setInternal({ status: 'ask' })
  }, [check])

  const reset = useCallback(() => {
    run.current += 1
    waiting.current = []
    stop()
    setInternal({ status: 'idle' })
  }, [stop])

  // A first check shows the model download until it finishes.
  const state: PhotoSuggestionState = internal.status === 'checking' && checker.downloadProgress !== undefined
    ? { status: 'downloading', progress: checker.downloadProgress }
    : internal

  return {
    state,
    analyze,
    /** The reporter agreed to the download, or asked to try again: check the waiting photos. */
    accept: useCallback(() => { void check(waiting.current) }, [check]),
    /** Hides the prompt or result without changing the form. */
    dismiss: useCallback(() => {
      run.current += 1
      waiting.current = []
      setInternal({ status: 'idle' })
    }, []),
    present: useCallback((guess: PhotoIssueGuess) => {
      run.current += 1
      waiting.current = []
      setInternal({ status: 'suggested', guess })
    }, []),
    reset,
  }
}
