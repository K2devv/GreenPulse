/** Editing rules for a one-time code typed into separate digit boxes. */

/** Supabase's email code length; Authentication → Providers → Email → Email OTP Length must match. */
export const OTP_CODE_LENGTH = 6

export type CodeEdit = { digits: string[]; focusIndex: number }

export function emptyCode(length = OTP_CODE_LENGTH): string[] {
  return Array.from({ length }, () => '')
}

/**
 * Writes typed or pasted text into the boxes starting at `index`. Non-digits are ignored, so a
 * pasted "123 456" or "Code: 123-456" fills all six boxes. Focus moves to the box after the last
 * digit written (or stays on the last box). Text with no digits changes nothing.
 */
export function fillDigits(digits: readonly string[], index: number, text: string): CodeEdit {
  const incoming = text.replace(/\D/g, '')
  const next = [...digits]
  const start = Math.min(Math.max(index, 0), next.length - 1)
  if (!incoming) return { digits: next, focusIndex: start }
  // A full-length paste always fills from the first box, wherever the cursor was.
  const from = incoming.length >= next.length ? 0 : start
  let position = from
  for (const digit of incoming) {
    if (position >= next.length) break
    next[position] = digit
    position += 1
  }
  return { digits: next, focusIndex: Math.min(position, next.length - 1) }
}

/** Backspace: clears the current box, or, when it is already empty, the one before it. */
export function clearDigit(digits: readonly string[], index: number): CodeEdit {
  const next = [...digits]
  const current = Math.min(Math.max(index, 0), next.length - 1)
  if (next[current]) {
    next[current] = ''
    return { digits: next, focusIndex: current }
  }
  const previous = Math.max(current - 1, 0)
  next[previous] = ''
  return { digits: next, focusIndex: previous }
}

export function codeValue(digits: readonly string[]): string {
  return digits.join('')
}

export function isCodeComplete(digits: readonly string[]): boolean {
  return digits.length > 0 && digits.every((digit) => /^\d$/.test(digit))
}

/** "0:42" for a countdown in seconds. */
export function formatCountdown(seconds: number): string {
  const safe = Math.max(0, Math.ceil(seconds))
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`
}
