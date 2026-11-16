import { describe, expect, it } from 'vitest'
import { applyRowChanges, loadInPages, mergeNewestPage } from './report-paging'

const row = (id: string, minutesAgo: number) => ({ id, created_at: new Date(Date.UTC(2026, 10, 16, 12, 0) - minutesAgo * 60_000).toISOString() })
/** A table of `total` rows, newest first, read through `range` like PostgREST. */
function table(total: number) {
  const rows = Array.from({ length: total }, (_, index) => row(`r${index}`, index))
  const calls: Array<[number, number]> = []
  const fetchPage = async (from: number, to: number) => {
    calls.push([from, to])
    return { data: rows.slice(from, to + 1), error: null }
  }
  return { rows, calls, fetchPage }
}

describe('loadInPages', () => {
  it('stops at the first short page', async () => {
    const { calls, fetchPage } = table(5)
    const result = await loadInPages(fetchPage, { pageSize: 2, limit: 100 })
    expect(result.rows.map((item) => item.id)).toEqual(['r0', 'r1', 'r2', 'r3', 'r4'])
    expect(result.truncated).toBe(false)
    expect(calls).toEqual([[0, 1], [2, 3], [4, 5]])
  })

  it('makes one request when everything fits in a page', async () => {
    const { calls, fetchPage } = table(3)
    await loadInPages(fetchPage, { pageSize: 10, limit: 100 })
    expect(calls).toEqual([[0, 9]])
  })

  it('stops at the limit and says older rows were left out', async () => {
    const { calls, fetchPage } = table(50)
    const result = await loadInPages(fetchPage, { pageSize: 4, limit: 10 })
    expect(result.rows).toHaveLength(10)
    expect(result.truncated).toBe(true)
    expect(calls).toEqual([[0, 3], [4, 7], [8, 9]])
  })

  it('reports each page as it arrives', async () => {
    const { fetchPage } = table(5)
    const seen: number[] = []
    await loadInPages(fetchPage, { pageSize: 2, limit: 100, onPage: (rows) => seen.push(rows.length) })
    expect(seen).toEqual([2, 4, 5])
  })

  it('keeps the rows loaded before a failed page', async () => {
    const { fetchPage } = table(6)
    const failing = async (from: number, to: number) => from >= 2 ? { data: null, error: { message: 'offline' } } : fetchPage(from, to)
    const result = await loadInPages(failing, { pageSize: 2, limit: 100 })
    expect(result.rows).toHaveLength(2)
    expect(result.error).toBe('offline')
  })

  it('stops when cancelled', async () => {
    const { calls, fetchPage } = table(10)
    await loadInPages(fetchPage, { pageSize: 2, limit: 100, isCancelled: () => true })
    expect(calls).toHaveLength(1)
  })
})

describe('mergeNewestPage', () => {
  const held = [row('a', 1), row('b', 2), row('c', 3), row('d', 4), row('e', 5)]

  it('replaces everything when the page is short', () => {
    expect(mergeNewestPage(held, [row('a', 1), row('c', 3)], 3).map((item) => item.id)).toEqual(['a', 'c'])
  })

  it('adds new rows and keeps the ones older than the page', () => {
    const page = [row('new', 0), row('a', 1), row('b', 2)]
    expect(mergeNewestPage(held, page, 3).map((item) => item.id)).toEqual(['new', 'a', 'b', 'c', 'd', 'e'])
  })

  it('drops a row inside the page window that the page no longer has', () => {
    // b was hidden, so the page reaches one row further back.
    const page = [row('a', 1), row('c', 3), row('d', 4)]
    expect(mergeNewestPage(held, page, 3).map((item) => item.id)).toEqual(['a', 'c', 'd', 'e'])
  })

  it('takes the page version of a row it already held', () => {
    const page = [{ ...row('a', 1), status: 'Resolved' }, row('b', 2), row('c', 3)]
    const merged = mergeNewestPage<{ id: string; created_at: string; status?: string }>(held, page, 3)
    expect(merged[0].status).toBe('Resolved')
    expect(merged).toHaveLength(5)
  })

  it('never holds more than the limit', () => {
    expect(mergeNewestPage(held, [row('new', 0), row('a', 1), row('b', 2)], 3, 4)).toHaveLength(4)
  })
})

describe('applyRowChanges', () => {
  const held = [row('a', 1), row('b', 2), row('c', 3)]

  it('updates a row that came back and removes one that did not', () => {
    const changed = applyRowChanges<{ id: string; created_at: string; status?: string }>(held, ['b', 'c'], [{ ...row('c', 3), status: 'Verified' }])
    expect(changed.map((item) => item.id)).toEqual(['a', 'c'])
    expect(changed[1].status).toBe('Verified')
  })

  it('puts a newly visible row in date order', () => {
    expect(applyRowChanges(held, ['x'], [row('x', 1.5)]).map((item) => item.id)).toEqual(['a', 'x', 'b', 'c'])
  })

  it('ignores rows that were not asked for', () => {
    expect(applyRowChanges(held, ['a'], [row('a', 1), row('z', 0)]).map((item) => item.id)).toEqual(['a', 'b', 'c'])
  })
})
