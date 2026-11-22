import { useEffect, useState, type FormEvent } from 'react'
import { Check, Copy, LoaderCircle, X } from 'lucide-react'
import { apiUrl } from './lib/api-url'
import { t, dateLocale } from './lib/i18n'
import { translateServerText } from './lib/server-text'

type GuestReportState = {
  report: { id: string; title: string; status: string; outcome: string | null; resolved_at: string | null; updated_at: string }
  events: Array<{ id: number; event_type: string; message: string; created_at: string }>
  feedback: { feedback: 'fixed' | 'still_there'; message: string | null; updated_at: string } | null
}

type Props = {
  initialToken?: string
  emailSent?: boolean
  onClose: () => void
}

function displayCode(code: string) {
  const normalized = code.replace(/[^a-f0-9]/gi, '').toLowerCase()
  return normalized.match(/.{1,8}/g)?.join('-') ?? code
}

export function GuestReportTracking({ initialToken, emailSent = false, onClose }: Props) {
  const [token, setToken] = useState(initialToken ?? '')
  const [reportState, setReportState] = useState<GuestReportState>()
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  async function request(action: 'track' | 'feedback', feedback?: 'fixed' | 'still_there', note = '') {
    setBusy(true)
    setError('')
    try {
      const response = await fetch(apiUrl('/api/guest-reports'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, trackingCode: token, feedback, message: note }),
      })
      const body = await response.json() as GuestReportState & { error?: string }
      if (!response.ok) throw new Error(body.error ? t(body.error) : t('The report could not be loaded.'))
      setReportState(body)
      setMessage(body.feedback?.message ?? '')
      return true
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('The report could not be loaded.'))
      return false
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (initialToken) void request('track')
    // The initial token is intentionally loaded once when this modal opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function track(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void request('track')
  }

  async function sendFeedback(feedback: 'fixed' | 'still_there') {
    const saved = await request('feedback', feedback, message.trim())
    if (saved) setError('')
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(displayCode(token))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setError(t('Copy is unavailable here. Select the code and copy it manually.'))
    }
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="report-modal guest-tracking-modal" role="dialog" aria-modal="true" aria-labelledby="guest-tracking-title">
      <div className="modal-header"><div><p className="eyebrow">{t('GUEST REPORT')}</p><h2 id="guest-tracking-title">{t('Track your report')}</h2><p>{t('Keep your code private. Anyone who has it can view this report.')}</p></div><button className="icon-button" type="button" onClick={onClose} aria-label={t('Close report tracking')}><X size={19} /></button></div>
      {initialToken && <div className="guest-code-card"><div><strong>{t('Your tracking code')}</strong><code>{displayCode(initialToken)}</code><small>{t('Save this code so you can return to the report later.')}</small></div><button className="secondary-button" type="button" onClick={() => void copyCode()}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? t('Copied') : t('Copy code')}</button>{emailSent && <p>{t('A copy was also sent to your email address.')}</p>}</div>}
      {!initialToken && <form className="guest-track-form" onSubmit={track}><label className="field-label">{t('Tracking code')}<input value={token} onChange={(event) => setToken(event.target.value.replace(/[^a-f0-9-]/gi, '').slice(0, 53))} autoComplete="off" placeholder={t('Paste the code from your submission')} required /></label><button className="primary-button" type="submit" disabled={busy}>{busy ? <LoaderCircle className="spin" size={15} /> : null} {t('Track report')}</button></form>}
      {busy && !reportState && <p className="workflow-hint">{t('Looking up your report…')}</p>}
      {reportState && <div className="guest-report-result"><div className="guest-report-status"><div><small>{reportState.report.id.slice(0, 8).toUpperCase()}</small><strong>{reportState.report.title}</strong></div><span className={`status-pill status-${reportState.report.status.toLowerCase().replace(/ /g, '-')}`}><i />{t(reportState.report.status)}</span></div>
        {reportState.report.outcome && <p className="workflow-note-text"><strong>{t('Update')}</strong>{reportState.report.outcome}</p>}
        {['Resolved', 'Closed'].includes(reportState.report.status) && <section className="guest-feedback"><h3>{t('Was the issue fixed?')}</h3><p>{t('Let the response team know if it is still happening.')}</p><label className="field-label">{t('Optional note')}<textarea rows={2} maxLength={500} value={message} onChange={(event) => setMessage(event.target.value)} placeholder={t('Add a short update for the response team')} /></label>{reportState.feedback && <small className="workflow-hint">{t('Last response:')} {reportState.feedback.feedback === 'fixed' ? t('You confirmed it was fixed.') : t('You said it is still happening.')}</small>}<div className="workflow-actions"><button className="primary-button" type="button" disabled={busy} onClick={() => void sendFeedback('fixed')}>{busy ? t('Saving…') : t('It was fixed')}</button><button className="secondary-button" type="button" disabled={busy} onClick={() => void sendFeedback('still_there')}>{t('Still needs attention')}</button></div></section>}
        <div className="guest-history"><h3>{t('Report history')}</h3>{reportState.events.length ? <ol>{reportState.events.map((event) => <li key={event.id}><small>{new Date(event.created_at).toLocaleString(dateLocale())}</small><span>{translateServerText(event.message)}</span></li>)}</ol> : <p>{t('No updates yet.')}</p>}</div>
      </div>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </section>
  </div>
}
