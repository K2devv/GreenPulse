export type Theme = 'light' | 'dark'

// Holds only a theme the user picked. With no choice stored, the app follows the system setting.
export const THEME_CHOICE_KEY = 'greenpulse-theme-choice'
// Older builds wrote the active theme here on every visit, so only a stored 'dark' reflects a real choice.
export const LEGACY_THEME_KEY = 'greenpulse-theme'

type ThemeStorage = Pick<Storage, 'getItem'>

export function readThemeChoice(storage: ThemeStorage | undefined): Theme | null {
  if (!storage) return null
  try {
    const choice = storage.getItem(THEME_CHOICE_KEY)
    if (choice === 'light' || choice === 'dark') return choice
    return storage.getItem(LEGACY_THEME_KEY) === 'dark' ? 'dark' : null
  } catch {
    return null
  }
}

export function resolveTheme(choice: Theme | null, systemPrefersDark: boolean): Theme {
  return choice ?? (systemPrefersDark ? 'dark' : 'light')
}

export function oppositeTheme(theme: Theme): Theme {
  return theme === 'dark' ? 'light' : 'dark'
}
