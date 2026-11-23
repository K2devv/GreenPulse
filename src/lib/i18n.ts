import { useSyncExternalStore } from 'react'

/**
 * English and Filipino UI text.
 *
 * Text is written in English in the code and wrapped in `t()`: the English text is the key, and
 * `i18n-fil.ts` maps it to Filipino. Text with no Filipino entry shows in English, so a missing
 * entry never breaks the screen (`i18n.test.ts` checks that every literal `t()` key has one).
 *
 * - Values go in `{name}` placeholders: `t('{count} open', { count })`.
 * - Counts that change the English wording use `tn()`: `tn('{count} report', '{count} reports', n)`.
 * - Database values shown as text (status, category, urgency) are passed through `t()` where they
 *   are displayed, never where they are compared or saved. A `<select>` option keeps its English
 *   `value` for the same reason.
 * - Text the database writes (notifications, timeline entries) is translated by `server-text.ts`.
 *
 * The Filipino dictionary is loaded only when Filipino is picked, so English readers never
 * download it. `main.tsx` waits for it before the first render when Filipino is already chosen.
 */
export type Language = 'en' | 'fil'
export type TextVars = Record<string, string | number>

export const LANGUAGE_KEY = 'greenpulse-language'
export const LANGUAGES: { code: Language; label: string; short: string }[] = [
  { code: 'en', label: 'English', short: 'EN' },
  { code: 'fil', label: 'Filipino', short: 'FIL' },
]

type LanguageStorage = Pick<Storage, 'getItem'>

/** The language the user picked, or, with no choice stored, Filipino when the browser asks for it. */
export function readLanguageChoice(storage: LanguageStorage | undefined, browserLanguages: readonly string[] = []): Language {
  try {
    const stored = storage?.getItem(LANGUAGE_KEY)
    if (stored === 'en' || stored === 'fil') return stored
  } catch {
    // Storage can be blocked; fall back to the browser's languages.
  }
  const first = browserLanguages[0]?.toLowerCase() ?? ''
  return first.startsWith('fil') || first.startsWith('tl') ? 'fil' : 'en'
}

function browserStorage() {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage
  } catch {
    return undefined
  }
}

function browserLanguages(): readonly string[] {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return []
  return navigator.languages?.length ? navigator.languages : [navigator.language]
}

let dictionary: Readonly<Record<string, string>> | null = null
let loading: Promise<void> | null = null
let current: Language = typeof window === 'undefined' ? 'en' : readLanguageChoice(browserStorage(), browserLanguages())
const listeners = new Set<() => void>()

function notify() {
  for (const listener of listeners) listener()
}

function applyDocumentLanguage(language: Language) {
  if (typeof document !== 'undefined') document.documentElement.lang = language
}

/** Loads the Filipino dictionary once; resolves at once when it is already loaded. */
export function loadFilipino(): Promise<void> {
  if (dictionary) return Promise.resolve()
  loading ??= import('./i18n-fil').then((module) => {
    dictionary = module.fil
  }).catch((error: unknown) => {
    // Offline before the dictionary was ever cached: the app stays readable in English.
    loading = null
    console.warn('GreenPulse could not load the Filipino text.', error)
  })
  return loading
}

/** Gets the chosen language's text ready. `main.tsx` awaits it before the first render. */
export async function prepareLanguage() {
  if (current === 'fil') await loadFilipino()
  // Offline before the dictionary was ever cached: show English rather than a mix.
  if (current === 'fil' && !dictionary) current = 'en'
  applyDocumentLanguage(current)
}

export function getLanguage(): Language {
  return current
}

/**
 * Switches the whole app; the choice is remembered on this device. Filipino switches once its
 * dictionary has loaded, so the screen never shows a half-switched mix. Resolves false when the
 * dictionary could not be loaded (offline before it was ever cached).
 */
export async function setLanguage(next: Language): Promise<boolean> {
  if (next === 'fil') await loadFilipino()
  if (next === 'fil' && !dictionary) return false
  try {
    browserStorage()?.setItem(LANGUAGE_KEY, next)
  } catch {
    // The language still changes for this visit when storage is unavailable.
  }
  if (next === current) return true
  current = next
  applyDocumentLanguage(next)
  notify()
  return true
}

/** For tests: sets the language and dictionary directly. */
export function setLanguageForTest(language: Language, filipino: Readonly<Record<string, string>> | null) {
  current = language
  dictionary = filipino
  notify()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

function fill(template: string, vars?: TextVars) {
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) => name in vars ? String(vars[name]) : match)
}

/**
 * The text in the current language. `text` is the English wording, with `{name}` placeholders for
 * `vars`. An empty or missing value (an optional status, say) gives an empty string.
 */
export function t(text: string | null | undefined, vars?: TextVars): string {
  if (!text) return ''
  const template = current === 'fil' && dictionary ? dictionary[text] ?? text : text
  return fill(template, vars)
}

/** Like `t()`, choosing the English singular or plural wording by `count` (also passed as `{count}`). */
export function tn(one: string, other: string, count: number, vars?: TextVars): string {
  return t(count === 1 ? one : other, { count: count.toLocaleString(), ...vars })
}

/** The locale for dates and numbers: the browser's own in English, Philippine Filipino in Filipino. */
export function dateLocale(): string | undefined {
  return current === 'fil' ? 'fil-PH' : undefined
}

/** The current language, re-rendering the component when it changes. */
export function useLanguage(): Language {
  return useSyncExternalStore(subscribe, getLanguage, getLanguage)
}
