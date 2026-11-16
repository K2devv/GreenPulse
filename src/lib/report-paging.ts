/**
 * Loading reports a page at a time instead of all at once, and keeping the loaded set current
 * without downloading it again: a refresh re-reads only the newest page, plus any rows known to
 * have changed.
 */

/** Rows fetched per request. The first page is what a visitor sees straight away. */
export const REPORT_PAGE_SIZE = 200
/** The most reports kept in the browser. Beyond this only the newest are shown, and the view says so. */
export const REPORT_LOAD_LIMIT = 2000

type Row = { id: string; created_at: string }
type PageFetch<T> = (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>

export type PagedLoad<T> = {
  rows: T[]
  /** Set when a page failed. The rows loaded before it are still returned. */
  error?: string
  /** True when the limit was reached and older rows may exist that were not loaded. */
  truncated: boolean
}

/**
 * Fetches rows newest first, one page per request, until a short page, the limit, an error, or
 * cancellation. `onPage` is called with everything loaded so far after each page.
 */
export async function loadInPages<T>(fetchPage: PageFetch<T>, options: { pageSize?: number; limit?: number; onPage?: (rowsSoFar: T[]) => void; isCancelled?: () => boolean } = {}): Promise<PagedLoad<T>> {
  const pageSize = options.pageSize ?? REPORT_PAGE_SIZE
  const limit = options.limit ?? REPORT_LOAD_LIMIT
  const rows: T[] = []
  while (rows.length < limit) {
    const size = Math.min(pageSize, limit - rows.length)
    const { data, error } = await fetchPage(rows.length, rows.length + size - 1)
    if (options.isCancelled?.()) return { rows, truncated: false }
    if (error) return { rows, error: error.message, truncated: false }
    const page = data ?? []
    rows.push(...page)
    options.onPage?.([...rows])
    if (page.length < size) return { rows, truncated: false }
  }
  return { rows, truncated: true }
}

const newestFirst = (first: Row, second: Row) => Date.parse(second.created_at) - Date.parse(first.created_at) || (first.id < second.id ? 1 : -1)

/**
 * Lays a freshly fetched newest page over the rows already held. A held row that is newer than the
 * page's oldest row but missing from the page has been removed or hidden, so it is dropped. Older
 * rows are outside the page's window and are kept as they are.
 */
export function mergeNewestPage<T extends Row>(held: readonly T[], page: readonly T[], pageSize = REPORT_PAGE_SIZE, limit = REPORT_LOAD_LIMIT): T[] {
  // A short page is everything there is.
  if (page.length < pageSize) return [...page]
  const windowStart = Date.parse(page[page.length - 1].created_at)
  const inPage = new Set(page.map((row) => row.id))
  const older = held.filter((row) => !inPage.has(row.id) && Date.parse(row.created_at) <= windowStart)
  return [...page, ...older].slice(0, limit)
}

/**
 * Applies a targeted re-read of some rows: `ids` were asked for and `fetched` is what came back.
 * An id that did not come back is no longer visible to this viewer, so it is removed.
 */
export function applyRowChanges<T extends Row>(held: readonly T[], ids: readonly string[], fetched: readonly T[]): T[] {
  if (ids.length === 0) return [...held]
  const asked = new Set(ids)
  return [...held.filter((row) => !asked.has(row.id)), ...fetched.filter((row) => asked.has(row.id))].sort(newestFirst)
}
