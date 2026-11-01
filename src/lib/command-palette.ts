export type PaletteCommand = {
  id: string
  label: string
  group: string
  keywords?: string
  hint?: string
  run: () => void
}

const MAX_RESULTS = 12

export function filterCommands(commands: PaletteCommand[], query: string): PaletteCommand[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return commands.slice(0, MAX_RESULTS)
  return commands
    .map((command) => {
      const label = command.label.toLowerCase()
      const haystack = `${label} ${command.group.toLowerCase()} ${(command.keywords ?? '').toLowerCase()}`
      if (!words.every((word) => haystack.includes(word))) return null
      const score = words.reduce((total, word) => total + (label.startsWith(word) ? 0 : label.includes(word) ? 1 : 2), 0)
      return { command, score }
    })
    .filter((entry): entry is { command: PaletteCommand; score: number } => entry !== null)
    .sort((first, second) => first.score - second.score)
    .slice(0, MAX_RESULTS)
    .map((entry) => entry.command)
}
