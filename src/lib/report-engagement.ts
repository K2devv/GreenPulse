/** Public counts shown on a community report card. */
export type ReportEngagement = { stillThere: number; comments: number }

/** The RPC caps a request at this many reports. */
export const ENGAGEMENT_BATCH_LIMIT = 500

const toCount = (value: unknown) => {
  const count = typeof value === 'string' ? Number(value) : value
  return typeof count === 'number' && Number.isFinite(count) && count >= 0 ? Math.floor(count) : 0
}

/** Indexes rows from the `community_report_engagement` RPC by report id, skipping malformed rows. */
export function indexEngagement(rows: unknown): Map<string, ReportEngagement> {
  const index = new Map<string, ReportEngagement>()
  if (!Array.isArray(rows)) return index
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    const { report_id: reportId, still_there: stillThere, comments } = row as Record<string, unknown>
    if (typeof reportId !== 'string' || !reportId) continue
    index.set(reportId, { stillThere: toCount(stillThere), comments: toCount(comments) })
  }
  return index
}
