import { useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react'
import { ArrowLeft, Check, Mail, RotateCw } from 'lucide-react'
import { OTP_CODE_LENGTH, clearDigit, codeValue, emptyCode, fillDigits, formatCountdown, isCodeComplete } from './lib/otp-code'

export type CodeStatus = 'waiting' | 'verifying' | 'error' | 'success'

type EmailCodeStepProps = {
  email: string
  status: CodeStatus
  /** The error to show; a new `errorNonce` clears the boxes and shakes them. */
  errorMessage?: string
  errorNonce: number
  /** A short confirmation, such as "A new code is on its way." */
  notice?: string
  resendSeconds: number
  cooldownSeconds: number
  resendBusy: boolean
  onComplete: (code: string) => void
  onResend: () => void
  onChangeEmail: () => void
}

const RING_RADIUS = 9
const RING_LENGTH = 2 * Math.PI * RING_RADIUS

/** The "enter the 6-digit code we emailed you" step of sign-up. */
export function EmailCodeStep({ email, status, errorMessage, errorNonce, notice, resendSeconds, cooldownSeconds, resendBusy, onComplete, onResend, onChangeEmail }: EmailCodeStepProps) {
  const [digits, setDigits] = useState(() => emptyCode())
  const [shake, setShake] = useState(0)
  const inputs = useRef<Array<HTMLInputElement | null>>([])
  const submitted = useRef('')
  const locked = status === 'verifying' || status === 'success'

  const focusBox = (index: number) => {
    const input = inputs.current[Math.min(Math.max(index, 0), OTP_CODE_LENGTH - 1)]
    input?.focus()
    input?.select()
  }

  useEffect(() => { focusBox(0) }, [])

  // A rejected code empties the boxes, shakes them, and puts the cursor back in the first one.
  useEffect(() => {
    if (!errorNonce) return
    setDigits(emptyCode())
    submitted.current = ''
    setShake((current) => current + 1)
    focusBox(0)
  }, [errorNonce])

  // The code is sent as soon as the last box is filled.
  useEffect(() => {
    if (locked || !isCodeComplete(digits)) return
    const code = codeValue(digits)
    if (code === submitted.current) return
    submitted.current = code
    inputs.current.forEach((input) => input?.blur())
    onComplete(code)
  }, [digits, locked, onComplete])

  function apply(edit: { digits: string[]; focusIndex: number }) {
    setDigits(edit.digits)
    focusBox(edit.focusIndex)
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>, index: number) {
    if (locked) return
    if (/^\d$/.test(event.key)) {
      event.preventDefault()
      apply(fillDigits(digits, index, event.key))
    } else if (event.key === 'Backspace') {
      event.preventDefault()
      apply(clearDigit(digits, index))
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault()
      focusBox(index - 1)
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      focusBox(index + 1)
    }
  }

  // Mobile keyboards and one-time-code autofill arrive as input changes rather than key presses.
  function onChange(value: string, index: number) {
    if (locked) return
    const typed = value.replace(/\D/g, '')
    if (!typed) {
      const next = [...digits]
      next[index] = ''
      setDigits(next)
      return
    }
    const previous = digits[index]
    const fresh = previous && typed.length === 2 ? (typed.startsWith(previous) ? typed.slice(1) : typed.slice(0, 1)) : typed
    apply(fillDigits(digits, index, fresh))
  }

  function onPaste(event: ClipboardEvent<HTMLInputElement>, index: number) {
    event.preventDefault()
    if (!locked) apply(fillDigits(digits, index, event.clipboardData.getData('text')))
  }

  const ringOffset = cooldownSeconds > 0 ? RING_LENGTH * (1 - Math.min(resendSeconds / cooldownSeconds, 1)) : RING_LENGTH
  const filledCount = digits.filter(Boolean).length

  return <div className={`email-code-step is-${status}`}>
    <div className="email-code-art" aria-hidden="true">
      <span className="email-code-ripple" />
      <span className="email-code-ripple" />
      <span className="email-code-orb">{status === 'success' ? <Check size={30} strokeWidth={2.6} /> : <Mail size={28} />}</span>
      <span className="email-code-spark" />
      <span className="email-code-spark" />
      <span className="email-code-spark" />
    </div>
    <p className="eyebrow">VERIFY YOUR EMAIL</p>
    <h2 id="auth-title">{status === 'success' ? 'Email confirmed' : 'Enter your 6-digit code'}</h2>
    <p className="email-code-lead">{status === 'success' ? 'Your account is ready. Signing you in…' : <>We sent a code to <strong>{email}</strong>. It can take a minute to arrive; check your spam folder too.</>}</p>

    <div className="email-code-boxes" role="group" aria-label="6-digit confirmation code" key={shake} data-shake={shake > 0 ? 'true' : undefined}>
      {digits.map((digit, index) => <input
        key={index}
        ref={(element) => { inputs.current[index] = element }}
        className={`email-code-box${digit ? ' is-filled' : ''}`}
        style={{ ['--i' as string]: index }}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete={index === 0 ? 'one-time-code' : 'off'}
        maxLength={OTP_CODE_LENGTH}
        value={digit}
        aria-label={`Digit ${index + 1} of ${OTP_CODE_LENGTH}`}
        aria-invalid={status === 'error' || undefined}
        disabled={locked}
        onKeyDown={(event) => onKeyDown(event, index)}
        onChange={(event) => onChange(event.target.value, index)}
        onPaste={(event) => onPaste(event, index)}
        onFocus={(event) => event.target.select()}
      />)}
    </div>

    <div className="email-code-status" aria-live="polite">
      {status === 'verifying' ? <span className="email-code-checking"><span className="email-code-spinner" aria-hidden="true" />Checking your code…</span>
        : status === 'success' ? <span className="email-code-done"><Check size={15} aria-hidden="true" />Confirmed</span>
          : status === 'error' && errorMessage ? <span className="email-code-error" role="alert">{errorMessage}</span>
            : notice ? <span className="email-code-notice">{notice}</span>
              : <span className="email-code-waiting">{filledCount ? `${OTP_CODE_LENGTH - filledCount} more digit${OTP_CODE_LENGTH - filledCount === 1 ? '' : 's'}` : 'Waiting for your code'}<span className="email-code-dots" aria-hidden="true"><i /><i /><i /></span></span>}
    </div>

    {status !== 'success' && <div className="email-code-footer">
      <div className="email-code-resend">
        <span>Didn't get it?</span>
        {resendSeconds > 0
          ? <span className="email-code-countdown" aria-label={`You can request a new code in ${resendSeconds} seconds`}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle className="email-code-ring-track" cx="12" cy="12" r={RING_RADIUS} /><circle className="email-code-ring-fill" cx="12" cy="12" r={RING_RADIUS} strokeDasharray={RING_LENGTH} strokeDashoffset={ringOffset} /></svg>
            Resend in {formatCountdown(resendSeconds)}
          </span>
          : <button className="text-button email-code-resend-button" type="button" onClick={onResend} disabled={resendBusy || locked}><RotateCw size={13} className={resendBusy ? 'is-spinning' : undefined} />{resendBusy ? 'Sending…' : 'Send a new code'}</button>}
      </div>
      <button className="text-button email-code-change" type="button" onClick={onChangeEmail} disabled={locked}><ArrowLeft size={13} />Use a different email</button>
    </div>}
  </div>
}
