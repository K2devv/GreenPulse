import { useState } from 'react'
import { LANGUAGES, setLanguage, t, useLanguage, type Language } from './lib/i18n'

// Shown when the Filipino text cannot be downloaded, so it cannot come from the dictionary itself.
const LOAD_FAILED = 'Filipino could not be loaded. Check your connection and try again. · Hindi ma-load ang Filipino. Suriin ang koneksyon at subukang muli.'

/**
 * The English / Filipino switch in the header. Each button names its language in that language,
 * so a reader who does not understand the current one can still find their own.
 */
export function LanguageToggle({ onError }: { onError: (message: string) => void }) {
  const language = useLanguage()
  const [pending, setPending] = useState<Language>()

  async function choose(next: Language) {
    if (next === language || pending) return
    setPending(next)
    const switched = await setLanguage(next)
    setPending(undefined)
    if (!switched) onError(LOAD_FAILED)
  }

  return <div className="language-toggle" role="group" aria-label={t('Language')} data-active={language} aria-busy={pending ? true : undefined}>
    <span className="language-toggle-thumb" aria-hidden="true" />
    {LANGUAGES.map((option) => <button
      key={option.code}
      type="button"
      lang={option.code}
      aria-pressed={language === option.code}
      aria-label={option.label}
      title={option.label}
      onClick={() => void choose(option.code)}
    >{option.short}</button>)}
  </div>
}
