import { t } from './i18n'

/**
 * Text the database writes in English (notification titles and messages, timeline entries,
 * comment author labels), shown in the current language.
 *
 * Fixed text is looked up as it is. Text with a report title or a status inside it is matched
 * against the patterns below, which mirror the SQL that writes it (`create_report_notifications`,
 * `record_report_event`, `record_report_comment`, `raise_report_sla_escalation` and the other
 * notification triggers). Anything unrecognised is shown unchanged, so new SQL wording never
 * breaks the screen; add a pattern here when you add one there.
 */
type Pattern = [RegExp, string, string[], ((value: string) => string)?]

const asIs = (value: string) => value
const translated = (value: string) => t(value)

// [pattern, English template, names of the captured parts, how to show the parts]
const PATTERNS: Pattern[] = [
  [/^Your report "(.+)" was submitted\.$/s, 'Your report "{title}" was submitted.', ['title'], asIs],
  [/^A new report needs review: (.+)\.$/s, 'A new report needs review: {title}.', ['title'], asIs],
  [/^High-urgency report received: (.+)\.$/s, 'High-urgency report received: {title}.', ['title'], asIs],
  [/^This report has no responder assigned: (.+)\.$/s, 'This report has no responder assigned: {title}.', ['title'], asIs],
  [/^This report has no responder or team assigned: (.+)\.$/s, 'This report has no responder or team assigned: {title}.', ['title'], asIs],
  [/^Review the proposed resolution for: (.+)\.$/s, 'Review the proposed resolution for: {title}.', ['title'], asIs],
  [/^A responder has been assigned to "(.+)"\.$/s, 'A responder has been assigned to "{title}".', ['title'], asIs],
  [/^You have been assigned to: (.+)\.$/s, 'You have been assigned to: {title}.', ['title'], asIs],
  [/^The responder assignment for "(.+)" was removed\.$/s, 'The responder assignment for "{title}" was removed.', ['title'], asIs],
  [/^The response team for "(.+)" was updated\.$/s, 'The response team for "{title}" was updated.', ['title'], asIs],
  [/^Your resolution for "(.+)" was approved\.$/s, 'Your resolution for "{title}" was approved.', ['title'], asIs],
  [/^Review feedback for "(.+)": (.*)$/s, 'Review feedback for "{title}": {note}', ['title', 'note'], asIs],
  [/^Immediate attention needed: (.+)\. Assign a response team\.$/s, 'Immediate attention needed: {title}. Assign a response team.', ['title'], asIs],
  [/^The high-urgency response deadline has passed for "(.+)"\. Review or assign this report\.$/s, 'The high-urgency response deadline has passed for "{title}". Review or assign this report.', ['title'], asIs],
  [/^The response deadline has passed for "(.+)"\. Review or assign this report\.$/s, 'The response deadline has passed for "{title}". Review or assign this report.', ['title'], asIs],
  [/^This report is still open after the second escalation window: "(.+)"\. A supervisor should review the assignment and response plan\.$/s, 'This report is still open after the second escalation window: "{title}". A supervisor should review the assignment and response plan.', ['title'], asIs],
  [/^"(.+)" has a new public comment\.$/s, '"{title}" has a new public comment.', ['title'], asIs],
  [/^A community member confirmed that "(.+)" is still present\.$/s, 'A community member confirmed that "{title}" is still present.', ['title'], asIs],
  [/^Review the resident follow-up for "(.+)"\.$/s, 'Review the resident follow-up for "{title}".', ['title'], asIs],
  [/^Open report needs attention: (.+)\.$/s, 'Open report needs attention: {title}.', ['title'], asIs],
  // Statuses, categories and urgencies inside the text are translated too.
  [/^"(.+)" is now (.+)\.$/s, '"{title}" is now {status}.', ['title', 'status']],
  [/^Status changed from (.+) to (.+)$/s, 'Status changed from {from} to {to}', ['from', 'to'], translated],
  [/^Category changed from (.+) to (.+)$/s, 'Category changed from {from} to {to}', ['from', 'to'], translated],
  [/^Urgency changed from (.+) to (.+)$/s, 'Urgency changed from {from} to {to}', ['from', 'to'], translated],
  [/^Task priority set to (.+)$/s, 'Task priority set to {priority}', ['priority'], translated],
  [/^Due date set to (.+)$/s, 'Due date set to {date}', ['date'], asIs],
  [/^Marked as a duplicate of report (.+)$/s, 'Marked as a duplicate of report {report}', ['report'], asIs],
  [/^Verification note: (.*)$/s, 'Verification note: {note}', ['note'], asIs],
  [/^Resolution rejected: (.*)$/s, 'Resolution rejected: {note}', ['note'], asIs],
  [/^Additional action requested: (.*)$/s, 'Additional action requested: {note}', ['note'], asIs],
  [/^Reporter replied with (\d+) photo\(s\)$/s, 'Reporter replied with {count} photo(s)', ['count'], asIs],
  [/^Escalation stage (\d+) raised: response deadline passed$/s, 'Escalation stage {stage} raised: response deadline passed', ['stage'], asIs],
  [/^Escalation stage (\d+) raised: second escalation window passed$/s, 'Escalation stage {stage} raised: second escalation window passed', ['stage'], asIs],
]

// "is now {status}": the title stays as written, the status is translated.
const PART_FORMAT: Record<string, (value: string) => string> = { status: translated }

/** `text` from the database in the current language; unknown text comes back unchanged. */
export function translateServerText(text: string | null | undefined): string {
  if (!text) return ''
  const exact = t(text)
  if (exact !== text) return exact
  for (const [pattern, template, names, format] of PATTERNS) {
    const match = pattern.exec(text)
    if (!match) continue
    const vars: Record<string, string> = {}
    names.forEach((name, index) => {
      const value = match[index + 1] ?? ''
      vars[name] = (format ?? PART_FORMAT[name] ?? asIs)(value)
    })
    return t(template, vars)
  }
  return text
}

/** Every English template above, for the dictionary test. */
export const SERVER_TEXT_TEMPLATES = PATTERNS.map(([, template]) => template)

/** Fixed text the database writes, for the dictionary test. */
export const SERVER_TEXT_FIXED = [
  // Notification titles
  'Report submitted', 'New report', 'Critical report', 'Unassigned report', 'Report verified', 'Report rejected',
  'Report resolved', 'Report closed', 'Additional information requested', 'Resolution awaiting verification',
  'Report status changed', 'Report assigned', 'Task assigned', 'Assignment changed', 'Report assignment changed',
  'Resolution approved', 'Resolution sent back', 'Additional action requested', 'Reporter replied',
  'New comment on your report', 'Critical flooding escalated', 'Response deadline missed',
  'Escalated response deadline missed', 'New community comment', 'Status update on your report',
  'Status update on an assigned report', 'Issue confirmed by a resident', 'Resident says issue persists', 'Overdue task',
  // Timeline entries
  'A community member added a public comment.', 'A community member confirmed this issue is still present',
  'After-photos added', 'Assignment removed', 'Due date cleared', 'Escalated for immediate attention (critical flooding)',
  'Report assigned to a responder', 'Report assigned to a team', 'Report reassigned to another responder',
  'Resolution details updated', 'Status update posted', 'Task instructions updated', 'Team assignment removed',
  'Additional information requested from the reporter', 'Admin comment added', 'Responder comment added',
  'Reporter confirmed the issue was fixed', 'Reporter said the issue remains',
  // Comment authors and reporter labels
  'Community member', 'Reporter', 'Administrator', 'Responder', 'Guest reporter',
  // Errors the database raises that reach the screen
  'Feedback is available after a report is resolved.', 'This report is no longer open for confirmations.',
  'This report is closed to new comments.', 'Comments must be between 1 and 1000 characters.',
  'Only the assigned responder or team can comment on this report.', 'Only administrators can request additional information.',
  'Information cannot be requested on a finished report.', 'Status updates cannot be posted on rejected or duplicate reports.',
]
