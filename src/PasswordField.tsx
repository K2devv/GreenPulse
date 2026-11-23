import { useId, useState, type InputHTMLAttributes, type ReactNode } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { t } from './lib/i18n'

type PasswordFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'id'> & { label: ReactNode }

/**
 * A labelled password input with a show/hide button, so a password typed on a phone keyboard can
 * be checked before it is saved. The button sits outside the <label> so it doesn't become part of
 * the input's accessible name.
 */
export function PasswordField({ label, className, ...input }: PasswordFieldProps) {
  const id = useId()
  const [visible, setVisible] = useState(false)
  return <div className={className ? `field-label password-field ${className}` : 'field-label password-field'}>
    <label htmlFor={id}>{label}</label>
    <span className="password-input">
      {/* Shown as text, a phone keyboard would otherwise capitalize and autocorrect the password. */}
      <input {...input} id={id} type={visible ? 'text' : 'password'} autoCapitalize="off" autoCorrect="off" spellCheck={false} />
      <button className="password-toggle" type="button" aria-label={t('Show password')} aria-pressed={visible} aria-controls={id} onClick={() => setVisible((current) => !current)}>
        {visible ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
      </button>
    </span>
  </div>
}
