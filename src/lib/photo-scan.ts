import { CONFIDENT_GUESS, type PhotoIssueGuess } from './photo-issue-classifier'

/**
 * Live camera scanning: the camera's frames are read one after another, and the scan stops on
 * its own once it is sure enough that the camera shows an issue.
 */

/** Frames in a row that must name the same category before the scan stops on a less certain guess. */
export const SCAN_AGREEING_FRAMES = 2
/** Frames read without finding anything before the reporter is told to move closer or take the photo. */
export const SCAN_HINT_AFTER = 6
/**
 * The shortest time a scan or photo check stays on screen, in milliseconds: one full pass of the
 * sweep line (keep it equal to the scan-sweep animation in styles.css). A cached model answers in
 * about a second, which would otherwise cut the scanning animation short.
 */
export const MIN_SCAN_MS = 1800

/** How much longer a scan that started at `startedAt` must keep going before showing its result. */
export const remainingScanTime = (startedAt: number, now: number) => Math.max(0, MIN_SCAN_MS - (now - startedAt))

export type ScanProgress = {
  /** The category the last frame named, if any. */
  category?: string
  /** How many frames in a row have named that category. */
  streak: number
  /** Frames read so far. */
  checked: number
}

export const startScan = (): ScanProgress => ({ streak: 0, checked: 0 })

/**
 * Adds one frame's guess to the scan. `found` is set when the scan should stop: the frame is
 * confident on its own, or it agrees with the frames just before it.
 */
export function scanFrame(progress: ScanProgress, guess: PhotoIssueGuess): { progress: ScanProgress; found?: PhotoIssueGuess } {
  const checked = progress.checked + 1
  if (!guess.category) return { progress: { streak: 0, checked } }
  const streak = guess.category === progress.category ? progress.streak + 1 : 1
  const found = guess.confidence >= CONFIDENT_GUESS || streak >= SCAN_AGREEING_FRAMES ? guess : undefined
  return { progress: { category: guess.category, streak, checked }, found }
}

/** Whether to suggest moving closer or taking the photo by hand. */
export const scanNeedsHint = (progress: ScanProgress) => progress.checked >= SCAN_HINT_AFTER
