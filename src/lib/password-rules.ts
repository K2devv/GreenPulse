import { t } from './i18n'
/** Rules for a new sign-in password, shared by the password reset and Profile settings. */

/** Supabase's minimum password length (Authentication → Providers → Email). Keep the two equal. */
export const PASSWORD_MIN_LENGTH = 8
/** Supabase hashes passwords with bcrypt, which reads at most 72 bytes, and refuses anything longer. */
export const PASSWORD_MAX_BYTES = 72

export type NewPasswordCheck = {
  longEnough: boolean
  tooLong: boolean
  /** The confirmation has been typed and is identical to the password. */
  matches: boolean
  /** The first problem, worded for the form; undefined when the password can be saved. */
  error?: string
}

export function checkNewPassword(password: string, confirmation: string): NewPasswordCheck {
  const longEnough = password.length >= PASSWORD_MIN_LENGTH
  const tooLong = new TextEncoder().encode(password).length > PASSWORD_MAX_BYTES
  const matches = confirmation.length > 0 && password === confirmation
  const error = !longEnough ? t('Use at least 8 characters.')
    : tooLong ? t('That password is too long. Use 72 characters or fewer.')
      : !matches ? t('The passwords do not match.')
        : undefined
  return { longEnough, tooLong, matches, error }
}
