import { useEffect, useMemo, useRef, useState } from 'react'
import { CornerDownLeft, Search } from 'lucide-react'
import { filterCommands, type PaletteCommand } from './lib/command-palette'

export function CommandPalette({ open, commands, onClose }: { open: boolean; commands: PaletteCommand[]; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const returnFocus = useRef<HTMLElement | null>(null)
  const results = useMemo(() => filterCommands(commands, query), [commands, query])

  useEffect(() => {
    if (!open) return
    returnFocus.current = document.activeElement as HTMLElement | null
    setQuery('')
    setIndex(0)
    window.setTimeout(() => inputRef.current?.focus(), 0)
    return () => returnFocus.current?.focus?.()
  }, [open])

  useEffect(() => { setIndex(0) }, [query])
  useEffect(() => { listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }) }, [index, results])

  if (!open) return null

  const run = (command: PaletteCommand | undefined) => {
    if (!command) return
    onClose()
    command.run()
  }
  let lastGroup = ''

  return <div className="palette-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="palette" role="dialog" aria-modal="true" aria-label="Command palette">
      <label className="palette-input">
        <Search size={16} aria-hidden="true" />
        <input ref={inputRef} value={query} placeholder="Search reports, views and actions…" role="combobox" aria-expanded="true" aria-controls="palette-results" aria-activedescendant={results[index] ? `palette-${results[index].id}` : undefined} autoComplete="off"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') { event.preventDefault(); setIndex((current) => Math.min(results.length - 1, current + 1)) }
            else if (event.key === 'ArrowUp') { event.preventDefault(); setIndex((current) => Math.max(0, current - 1)) }
            else if (event.key === 'Enter') { event.preventDefault(); run(results[index]) }
            else if (event.key === 'Escape') { event.preventDefault(); onClose() }
          }} />
        <kbd>Esc</kbd>
      </label>
      <ul id="palette-results" className="palette-results" role="listbox" ref={listRef}>
        {results.length === 0 && <li className="palette-empty" role="presentation">No results for “{query}”.</li>}
        {results.map((command, position) => {
          const heading = command.group !== lastGroup ? command.group : ''
          lastGroup = command.group
          return <li key={command.id} role="presentation">
            {heading && <span className="palette-group" role="presentation">{heading}</span>}
            <button id={`palette-${command.id}`} type="button" role="option" aria-selected={position === index} className={position === index ? 'is-active' : ''} tabIndex={-1} onMouseMove={() => setIndex(position)} onClick={() => run(command)}>
              <span>{command.label}</span>{command.hint && <small>{command.hint}</small>}{position === index && <CornerDownLeft size={13} aria-hidden="true" />}
            </button>
          </li>
        })}
      </ul>
      <p className="palette-footer"><kbd>↑</kbd><kbd>↓</kbd> navigate <kbd>Enter</kbd> select</p>
    </section>
  </div>
}
