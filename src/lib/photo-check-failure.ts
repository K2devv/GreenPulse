/**
 * Why the photo checker could not give an answer. Each reason needs a different next step, so the
 * screens tell them apart instead of showing one message for all of them.
 *
 * - `download`: the one-time model download failed or was cut short. Checking the connection and
 *   trying again helps.
 * - `app`: part of GreenPulse itself did not load, usually because the site was updated while the
 *   page was open, or the connection to GreenPulse dropped. Reloading the page helps.
 * - `device`: the checker loaded but could not run here, for example when the phone ran out of
 *   memory. Trying again rarely helps; the form always works.
 * - `photo`: the photo itself could not be read. Another photo helps.
 */
export type PhotoCheckFailure = 'download' | 'app' | 'device' | 'photo'

const failures: readonly PhotoCheckFailure[] = ['download', 'app', 'device', 'photo']

export const isPhotoCheckFailure = (value: unknown): value is PhotoCheckFailure => failures.includes(value as PhotoCheckFailure)

/** An error from the photo checker that says which kind of failure it was. */
export class PhotoCheckError extends Error {
  readonly failure: PhotoCheckFailure

  constructor(failure: PhotoCheckFailure, message: string) {
    super(message)
    this.name = 'PhotoCheckError'
    this.failure = failure
  }
}

/** The kind of any error thrown while checking a photo. An unexpected error counts as the device. */
export const photoCheckFailureOf = (error: unknown): PhotoCheckFailure => error instanceof PhotoCheckError ? error.failure : 'device'

/** Shown on the start screen and kept short enough to read at a glance. */
export const PHOTO_UNREADABLE_MESSAGE = "This photo couldn't be read. Try another photo."

/**
 * The smallest WebAssembly module that uses SIMD instructions (from the wasm-feature-detect
 * project). The photo checker's runtime needs SIMD, which arrived in Chrome 91 and Safari 16.4.
 */
const SIMD_TEST_MODULE = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11])

/** Whether this browser's WebAssembly has SIMD, which the photo checker needs. */
export function supportsWasmSimd(wasm: Pick<typeof WebAssembly, 'validate'> | null | undefined = globalThis.WebAssembly): boolean {
  try {
    return Boolean(wasm?.validate(SIMD_TEST_MODULE))
  } catch {
    return false
  }
}

/**
 * Whether this browser can start a module worker, which the photo checker runs in. A browser
 * that knows the option reads `type` while checking its arguments; the invalid address then
 * stops it before any worker starts, so nothing is downloaded or run.
 */
export function supportsModuleWorkers(WorkerClass: (new (url: string, options?: WorkerOptions) => Worker) | null | undefined = globalThis.Worker): boolean {
  if (typeof WorkerClass !== 'function') return false
  let supported = false
  const options = { get type() { supported = true; return 'module' as const } }
  try {
    new WorkerClass('blob://', options).terminate()
  } catch {
    // Expected: the address is invalid on purpose.
  }
  return supported
}
