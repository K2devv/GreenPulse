import { describe, expect, it } from 'vitest'
import { filterCommands, type PaletteCommand } from './command-palette'

const command = (id: string, label: string, group = 'Actions', keywords?: string): PaletteCommand => ({ id, label, group, keywords, run: () => undefined })
const commands = [command('a', 'Open staff desk', 'Go to'), command('b', 'Report an issue'), command('c', 'Toggle dark mode', 'Display', 'theme'), command('d', 'Water pooling after rain', 'Reports', 'flooding')]

describe('filterCommands', () => {
  it('returns everything (capped) for an empty query', () => {
    expect(filterCommands(commands, '  ')).toHaveLength(4)
  })

  it('matches every word against label, group and keywords', () => {
    expect(filterCommands(commands, 'theme').map((item) => item.id)).toEqual(['c'])
    expect(filterCommands(commands, 'go desk').map((item) => item.id)).toEqual(['a'])
    expect(filterCommands(commands, 'zzz')).toEqual([])
  })

  it('ranks label prefix matches first', () => {
    expect(filterCommands(commands, 're').map((item) => item.id)[0]).toBe('b')
  })
})
