import { useEffect, useRef, useState } from 'react'

const HIGHLIGHT_MS = 1800

// Returns the ids of reports whose status changed since the previous render, for a short highlight.
export function useStatusChanges(reports: { id: string; status: string }[]) {
  const previous = useRef<Map<string, string> | null>(null)
  const [changed, setChanged] = useState<ReadonlySet<string>>(new Set())

  useEffect(() => {
    const next = new Map(reports.map((report) => [report.id, report.status]))
    const before = previous.current
    previous.current = next
    if (!before) return
    const ids = reports.filter((report) => before.has(report.id) && before.get(report.id) !== report.status).map((report) => report.id)
    if (!ids.length) return
    setChanged((current) => new Set([...current, ...ids]))
    const timer = window.setTimeout(() => setChanged((current) => new Set([...current].filter((id) => !ids.includes(id)))), HIGHLIGHT_MS)
    return () => window.clearTimeout(timer)
  }, [reports])

  return changed
}
