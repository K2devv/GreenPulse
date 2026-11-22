import type { ReportCategory } from './report-categories'

/**
 * The image model that reads report photos on the reporter's own device: OpenAI CLIP ViT-B/32
 * (MIT license), 4-bit ONNX build, pinned to one revision. The label vectors in
 * src/data/photo-issue-labels.json were made from the same revision; regenerate them with
 * scripts/build-photo-issue-labels.mjs if this changes.
 */
export const PHOTO_MODEL = {
  url: 'https://huggingface.co/Xenova/clip-vit-base-patch32/resolve/6b7c523703ae26e39be4b03774966f8571c7f523/onnx/vision_model_q4.onnx',
  /** Checked after every download and cache read, so a damaged or swapped file is never run. */
  sha256: '0769eb1d2f6f68927bbfa6e5330df4c4c3c112f89cd43eae28baafa9e6bd34b4',
  bytes: 63_642_858,
  /** CLIP looks at a 224 × 224 square, normalized with the mean and spread of its training images. */
  inputSize: 224,
  mean: [0.48145466, 0.4578275, 0.40821073],
  std: [0.26862954, 0.26130258, 0.27577711],
} as const

/** Cache Storage name for the downloaded model. Bump it to drop copies of an older model. */
export const PHOTO_MODEL_CACHE = 'greenpulse-photo-model-v1'

/** The download size shown to reporters, in whole megabytes. */
export const PHOTO_MODEL_MEGABYTES = Math.round(PHOTO_MODEL.bytes / 1_000_000)

export type PhotoIssueLabel = {
  /** Null for labels that describe photos without a reportable issue, such as people or pets. */
  category: ReportCategory | null
  /** The issue type the form is filled with; only set on labels that have a category. */
  issueType?: string
  vector: readonly number[]
}

export type PhotoIssueGuess = {
  /** Undefined when the photo does not clearly show a reportable issue. */
  category?: ReportCategory
  /** Only given when one issue type clearly leads within the category. */
  issueType?: string
  /** The share of the match that went to the best category, 0 to 1. */
  confidence: number
}

/** CLIP's learned temperature: cosine similarities are multiplied by this before softmax. */
const LOGIT_SCALE = 100
/**
 * A category is suggested only when the issue labels together take at least this share of the
 * match, so "no issue" has at most the rest. The leading category is then suggested even when it
 * holds less than half: trash in water, say, splits between Waste, Water pollution and Blocked
 * canal, and asking each one for half left such photos with no suggestion at all.
 */
export const MIN_ISSUE_SHARE = 0.7
/** An issue type is filled in only when it takes at least this share of its category. */
export const MIN_ISSUE_TYPE_SHARE = 0.5
/** A photo this sure of its category ends the search; later photos are not checked. */
export const CONFIDENT_GUESS = 0.8

function unitLength(values: ArrayLike<number>): number[] {
  let sum = 0
  for (let index = 0; index < values.length; index += 1) sum += values[index] * values[index]
  const length = Math.sqrt(sum) || 1
  return Array.from(values, (value) => value / length)
}

/**
 * Turns a photo's image embedding into a guess: the closest labels, by softmax over cosine
 * similarity, summed per category. Labels without a category pull the guess toward "no issue";
 * when they take more than 1 − MIN_ISSUE_SHARE, nothing is suggested.
 */
export function guessPhotoIssue(embedding: ArrayLike<number>, labels: readonly PhotoIssueLabel[]): PhotoIssueGuess {
  if (!labels.length || !embedding.length) return { confidence: 0 }
  const image = unitLength(embedding)
  const logits = labels.map((label) => LOGIT_SCALE * label.vector.reduce((sum, value, index) => sum + value * (image[index] ?? 0), 0))
  const top = Math.max(...logits)
  const weights = logits.map((logit) => Math.exp(logit - top))
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  const probabilities = weights.map((weight) => weight / total)

  const byCategory = new Map<ReportCategory | null, number>()
  labels.forEach((label, index) => byCategory.set(label.category, (byCategory.get(label.category) ?? 0) + probabilities[index]))
  let best: ReportCategory | undefined
  let bestShare = 0
  for (const [category, share] of byCategory) {
    if (category && share > bestShare) {
      best = category
      bestShare = share
    }
  }
  const noIssue = byCategory.get(null) ?? 0
  if (!best || 1 - noIssue < MIN_ISSUE_SHARE) return { confidence: bestShare }

  let issueType: string | undefined
  let issueShare = 0
  labels.forEach((label, index) => {
    if (label.category === best && label.issueType && probabilities[index] > issueShare) {
      issueType = label.issueType
      issueShare = probabilities[index]
    }
  })
  return {
    category: best,
    issueType: issueShare / bestShare >= MIN_ISSUE_TYPE_SHARE ? issueType : undefined,
    confidence: bestShare,
  }
}

/** The most confident guess that names a category, from several photos of one report. */
export function pickPhotoGuess(guesses: readonly PhotoIssueGuess[]): PhotoIssueGuess | undefined {
  let pick: PhotoIssueGuess | undefined
  for (const guess of guesses) {
    if (guess.category && (!pick || guess.confidence > pick.confidence)) pick = guess
  }
  return pick
}

/**
 * The square CLIP looks at: it scales the short side to the input size, then cuts the centre.
 * Returned in the source image's pixels, ready for canvas drawImage.
 */
export function centerSquare(width: number, height: number): { x: number; y: number; size: number } {
  const size = Math.min(width, height)
  return { x: Math.floor((width - size) / 2), y: Math.floor((height - size) / 2), size }
}

/**
 * RGBA canvas pixels to the model input: three planes (red, green, blue), each value scaled to
 * 0–1 and then normalized with CLIP's mean and spread. Alpha is ignored.
 */
export function toModelInput(rgba: ArrayLike<number>, size: number = PHOTO_MODEL.inputSize): Float32Array {
  const pixels = size * size
  if (rgba.length < pixels * 4) throw new Error(`Expected ${pixels * 4} RGBA values, got ${rgba.length}.`)
  const input = new Float32Array(pixels * 3)
  for (let channel = 0; channel < 3; channel += 1) {
    const mean = PHOTO_MODEL.mean[channel]
    const std = PHOTO_MODEL.std[channel]
    const offset = channel * pixels
    for (let pixel = 0; pixel < pixels; pixel += 1) input[offset + pixel] = (rgba[pixel * 4 + channel] / 255 - mean) / std
  }
  return input
}

export type ConnectionHints = {
  /** The browser's data saver setting (navigator.connection.saveData). */
  saveData?: boolean
  /** navigator.connection.type: only some browsers report it, mostly on Android. */
  type?: string
  /** True on phones and tablets (a coarse pointer), where data is more often metered. */
  touchDevice: boolean
}

/**
 * Whether the model may be downloaded without asking first. Phones on mobile data, or with
 * the data saver on, are asked: the download is about 64 MB. Once it is cached, nobody is asked.
 */
export function mayDownloadWithoutAsking(hints: ConnectionHints): boolean {
  if (hints.saveData) return false
  if (hints.type === 'wifi' || hints.type === 'ethernet') return true
  if (hints.type === 'cellular') return false
  return !hints.touchDevice
}
