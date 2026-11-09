/** Normalize common Philippine mobile formats and international numbers to E.164. */
export function normalizePhoneNumber(value: string): string | undefined {
  const trimmed = value.trim()
  if (!trimmed || !/^\+?[\d\s().-]+$/.test(trimmed)) return undefined

  let digits = trimmed.replace(/\D/g, '')
  if (digits.startsWith('00')) digits = digits.slice(2)

  if (/^09\d{9}$/.test(digits)) digits = `63${digits.slice(1)}`
  else if (/^9\d{9}$/.test(digits)) digits = `63${digits}`
  else if (/^639\d{9}$/.test(digits)) digits = digits
  else if (!trimmed.startsWith('+') && !trimmed.startsWith('00')) return undefined

  return /^[1-9]\d{7,14}$/.test(digits) ? `+${digits}` : undefined
}
