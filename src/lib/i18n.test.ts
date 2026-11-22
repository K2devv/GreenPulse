import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'
import { afterEach, describe, expect, it } from 'vitest'
import { getLanguage, readLanguageChoice, setLanguageForTest, t, tn } from './i18n'
import { fil } from './i18n-fil'
import { SERVER_TEXT_FIXED, SERVER_TEXT_TEMPLATES, translateServerText } from './server-text'
import { TIMELINE_LABELS } from './report-timeline'
import { issueTypesByCategory, reportCategories } from './report-categories'
import { SYNC_LABELS } from './sync-status'
import { DESCRIPTIVE_NOTE, FOCUS_LABELS } from './report-summary'
import { ALL_STATUSES, FOLLOWED_UP, OPEN_REPORTS } from './report-quick-filters'
import { PHOTO_UNREADABLE_MESSAGE } from './photo-check-failure'
import { publicGuestOutcome } from './guest-tracking'
import { publicProgressEvents } from './report-progress'
import { verificationState } from './report-workflow'
import { NO_BARANGAY_LABEL } from './report-analytics'
import photoLabels from '../data/photo-issue-labels.json'
import { PHOTO_SHARING_BADGES } from '../ReportPhotoStrip'
import { toneForMessage } from '../Toaster'
import { UI_COPY } from './ui-copy'

const STATUSES = ['Submitted', 'Under review', 'Additional information requested', 'Verified', 'In progress', 'Awaiting verification', 'Resolved', 'Rejected', 'Closed', 'Duplicate']
const CATEGORIES = [...reportCategories, 'Water pollution', 'Air pollution']
const URGENCIES = ['High', 'Medium', 'Low']

afterEach(() => setLanguageForTest('en', null))

/** Every English key passed literally to t() or tn() in src, including both sides of `cond ? 'a' : 'b'`. */
function literalKeys() {
  const root = join(__dirname, '..')
  const files = [...readdirSync(root).map((name) => join(root, name)), ...readdirSync(__dirname).map((name) => join(__dirname, name))]
    .filter((file) => /\.tsx?$/.test(file) && !/\.test\.|i18n-fil|\.d\.ts$/.test(file))
  const keys = new Map<string, string>()
  const collect = (node: ts.Node, file: string) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) keys.set(node.text, file)
    else if (ts.isConditionalExpression(node)) { collect(node.whenTrue, file); collect(node.whenFalse, file) }
    else if (ts.isParenthesizedExpression(node)) collect(node.expression, file)
  }
  for (const file of files) {
    const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && (node.expression.text === 't' || node.expression.text === 'tn')) {
        node.arguments.slice(0, node.expression.text === 'tn' ? 2 : 1).forEach((argument) => collect(argument, file))
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
  }
  return keys
}

/**
 * Text kept in English in lists and maps (`{ label: 'Daily' }`, `{ title: 'Spot it', text: … }`) and
 * passed through t() where it is shown. Property names that hold identifiers are left out.
 */
function labelProperties() {
  const names = new Set(['label', 'title', 'subtitle', 'eyebrow', 'detail', 'hint', 'text', 'description', 'note'])
  const root = join(__dirname, '..')
  const files = readdirSync(root).filter((name) => name.endsWith('.tsx') && !name.includes('.test.')).map((name) => join(root, name))
  const values = new Map<string, string>()
  for (const file of files) {
    const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    const visit = (node: ts.Node) => {
      if (ts.isPropertyAssignment(node) && names.has(node.name.getText()) && (ts.isStringLiteral(node.initializer) || ts.isNoSubstitutionTemplateLiteral(node.initializer))) {
        const text = node.initializer.text
        // Demo reports are sample content, not interface text.
        if (/[A-Za-z]{2}/.test(text) && !/^(Demo|Sample data only)/.test(text)) values.set(text, file)
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
  }
  return values
}

/** Values the screens pass to t() at display time: statuses, categories, labels kept in English in the data. */
function displayValues() {
  const photoIssueTypes = (photoLabels.labels as { issueType?: string | null }[]).flatMap((label) => label.issueType ? [label.issueType] : [])
  return [
    ...Object.values(UI_COPY), ...STATUSES, ...CATEGORIES, ...URGENCIES,
    ...Object.values(issueTypesByCategory).flat(), ...photoIssueTypes, 'Other issue',
    ...Object.values(SYNC_LABELS),
    ...Object.values(PHOTO_SHARING_BADGES).flatMap((badge) => [badge.label, badge.title]),
    ...SERVER_TEXT_FIXED, ...SERVER_TEXT_TEMPLATES, ...TIMELINE_LABELS,
    ...Object.values(FOCUS_LABELS), DESCRIPTIVE_NOTE,
    ALL_STATUSES, OPEN_REPORTS, FOLLOWED_UP, PHOTO_UNREADABLE_MESSAGE, NO_BARANGAY_LABEL,
    ...STATUSES.flatMap((status) => publicGuestOutcome(status) ?? []),
    ...STATUSES.flatMap((status) => publicProgressEvents(status).flatMap((event) => [event.title, event.detail])),
    ...STATUSES.map((status) => verificationState(status)),
  ]
}

describe('readLanguageChoice', () => {
  const storage = (value: string | null) => ({ getItem: () => value })

  it('uses a saved choice first', () => {
    expect(readLanguageChoice(storage('fil'), ['en-US'])).toBe('fil')
    expect(readLanguageChoice(storage('en'), ['fil-PH'])).toBe('en')
  })

  it('follows the browser when nothing is saved', () => {
    expect(readLanguageChoice(storage(null), ['fil-PH', 'en'])).toBe('fil')
    expect(readLanguageChoice(storage(null), ['tl'])).toBe('fil')
    expect(readLanguageChoice(storage(null), ['en-PH', 'fil'])).toBe('en')
    expect(readLanguageChoice(undefined, [])).toBe('en')
  })

  it('ignores unknown or unreadable values', () => {
    expect(readLanguageChoice(storage('es'), ['en'])).toBe('en')
    expect(readLanguageChoice({ getItem: () => { throw new Error('blocked') } }, ['fil'])).toBe('fil')
  })
})

describe('t', () => {
  it('shows English by default, so tests and English readers see the source text', () => {
    expect(getLanguage()).toBe('en')
    expect(t('Report an issue')).toBe('Report an issue')
    expect(t('{count} open', { count: 3 })).toBe('3 open')
  })

  it('shows Filipino once it is chosen, and English for text it does not know', () => {
    setLanguageForTest('fil', fil)
    expect(t('Report an issue')).toBe('Mag-ulat ng problema')
    expect(t('{count} open', { count: 3 })).toBe('3 bukas')
    expect(t('Not in the dictionary')).toBe('Not in the dictionary')
  })

  it('gives an empty string for an empty value and leaves unknown placeholders alone', () => {
    expect(t(undefined)).toBe('')
    expect(t(null)).toBe('')
    expect(t('{count} of {total}', { count: 1 })).toBe('1 of {total}')
  })

  it('picks the singular or plural English wording by count', () => {
    expect(tn('{count} report', '{count} reports', 1)).toBe('1 report')
    expect(tn('{count} report', '{count} reports', 2)).toBe('2 reports')
    setLanguageForTest('fil', fil)
    expect(tn('{count} report', '{count} reports', 2)).toBe('2 ulat')
  })
})

describe('Filipino dictionary', () => {
  it('has an entry for every literal key in the code', () => {
    const missing = [...literalKeys()].filter(([key]) => !(key in fil)).map(([key, file]) => `${key}  (${file.split('/src/')[1]})`)
    expect(missing).toEqual([])
  })

  it('has an entry for the label text kept in lists and maps', () => {
    const missing = [...labelProperties()].filter(([text]) => !(text in fil)).map(([text, file]) => `${text}  (${file.split('/src/')[1]})`)
    expect(missing).toEqual([])
  })

  it('has an entry for every value shown through t()', () => {
    expect([...new Set(displayValues())].filter((value) => !(value in fil))).toEqual([])
  })

  it('keeps every placeholder of the English text', () => {
    const names = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort()
    const mismatched = Object.entries(fil).filter(([english, filipino]) => names(english).join() !== names(filipino).join())
    expect(mismatched).toEqual([])
  })

  it('words failures so toasts that take their tone from the text keep it', () => {
    // App.tsx passes these messages through toneForMessage to pick a success or error toast.
    const app = readFileSync(join(__dirname, '..', 'App.tsx'), 'utf8')
    const toned = [...app.matchAll(/set(?:FormNotice|ResponseSettingsMessage|SlaEscalationMessage)\(([^\n]*)/g)]
      .flatMap((match) => [...match[1].matchAll(/\bt?n?\('([^']+)'/g)].map((key) => key[1]))
    expect(toned.length).toBeGreaterThan(10)
    const mismatched = toned.filter((english) => toneForMessage(english) !== toneForMessage(fil[english] ?? english))
    expect(mismatched).toEqual([])
    expect(toneForMessage(fil['The report could not be saved. Please try again.'])).toBe('error')
    expect(toneForMessage(fil['{count} email batch needs attention.'])).toBe('error')
  })
})

describe('translateServerText', () => {
  it('returns database text unchanged in English', () => {
    expect(translateServerText('"Blocked drain" is now In progress.')).toBe('"Blocked drain" is now In progress.')
    expect(translateServerText(undefined)).toBe('')
  })

  it('translates fixed text and patterns, keeping report titles as written', () => {
    setLanguageForTest('fil', fil)
    expect(translateServerText('Task assigned')).toBe('May bagong gawain para sa iyo')
    expect(translateServerText('You have been assigned to: Blocked drain.')).toBe('Na-assign ka sa: Blocked drain.')
    expect(translateServerText('"Blocked drain" is now In progress.')).toBe('Ang "Blocked drain" ay Inaaksyunan na ngayon.')
    expect(translateServerText('Status changed from Verified to In progress')).toBe('Nagbago ang status mula Napatunayan patungong Inaaksyunan')
    expect(translateServerText('Something new from the database')).toBe('Something new from the database')
  })
})
