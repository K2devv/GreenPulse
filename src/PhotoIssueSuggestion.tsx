import { Check, RefreshCw, ScanSearch, Sparkles, TriangleAlert, X } from 'lucide-react'
import { PHOTO_MODEL_MEGABYTES } from './lib/photo-issue-classifier'
import type { PhotoSuggestionState } from './usePhotoIssueSuggestion'

type PhotoIssueSuggestionProps = {
  state: PhotoSuggestionState
  /** Whether the suggestion was filled into the form; false when the reporter had already chosen a category. */
  applied: boolean
  onAccept: () => void
  onDismiss: () => void
  /** Fills the form with a suggestion that was not applied automatically. */
  onApply: () => void
}

const privacyLine = 'Your photo stays on this device.'

/** The photo checker's status under the report photos: asking, working, or what it found. */
export function PhotoIssueSuggestion({ state, applied, onAccept, onDismiss, onApply }: PhotoIssueSuggestionProps) {
  if (state.status === 'idle') return null

  if (state.status === 'ask') {
    return <div className="photo-ai is-ask" role="status">
      <span className="photo-ai-icon" aria-hidden="true"><Sparkles size={16} /></span>
      <div className="photo-ai-copy">
        <strong>Fill in the issue from your photo?</strong>
        <span>GreenPulse can suggest the category and issue type. It needs a one-time {PHOTO_MODEL_MEGABYTES} MB download. {privacyLine}</span>
        <div className="photo-ai-actions">
          <button className="secondary-button photo-ai-button" type="button" onClick={onAccept}><ScanSearch size={15} />Suggest from photo</button>
          <button className="text-button" type="button" onClick={onDismiss}>Not now</button>
        </div>
      </div>
    </div>
  }

  if (state.status === 'downloading' || state.status === 'checking') {
    const percent = state.status === 'downloading' ? Math.round(state.progress * 100) : undefined
    return <div className="photo-ai is-busy" role="status">
      <span className="photo-ai-icon" aria-hidden="true"><span className="search-spinner" /></span>
      <div className="photo-ai-copy">
        <strong>{percent === undefined ? 'Checking your photo…' : `Getting the photo checker ready… ${percent}%`}</strong>
        <span>{percent === undefined ? privacyLine : `One-time ${PHOTO_MODEL_MEGABYTES} MB download. ${privacyLine}`}</span>
        {percent !== undefined && <span className="photo-ai-progress" aria-hidden="true"><i style={{ width: `${percent}%` }} /></span>}
      </div>
    </div>
  }

  if (state.status === 'suggested') {
    const { category, issueType } = state.guess
    const found = issueType ? `${category} · ${issueType}` : category
    return <div className={`photo-ai is-found${applied ? ' is-applied' : ''}`} role="status">
      <span className="photo-ai-icon" aria-hidden="true">{applied ? <Check size={16} /> : <Sparkles size={16} />}</span>
      <div className="photo-ai-copy">
        <strong>Looks like {found}</strong>
        <span>{applied
          ? `Filled in above from your photo. Change it if it looks wrong.`
          : 'You chose a different category, so nothing was changed.'}</span>
        {!applied && <div className="photo-ai-actions"><button className="secondary-button photo-ai-button" type="button" onClick={onApply}>Use this instead</button></div>}
      </div>
      <button className="icon-button photo-ai-close" type="button" onClick={onDismiss} aria-label="Hide photo suggestion"><X size={14} /></button>
    </div>
  }

  if (state.status === 'unclear') {
    return <div className="photo-ai is-unclear" role="status">
      <span className="photo-ai-icon" aria-hidden="true"><ScanSearch size={16} /></span>
      <div className="photo-ai-copy">
        <strong>Couldn't tell the issue from this photo</strong>
        <span>Choose the category and issue type yourself.</span>
      </div>
      <button className="icon-button photo-ai-close" type="button" onClick={onDismiss} aria-label="Hide photo suggestion"><X size={14} /></button>
    </div>
  }

  return <div className="photo-ai is-failed" role="status">
    <span className="photo-ai-icon" aria-hidden="true"><TriangleAlert size={16} /></span>
    <div className="photo-ai-copy">
      <strong>Photo suggestions aren't available right now</strong>
      <span>Choose the category yourself, or try again when you're online.</span>
      <div className="photo-ai-actions"><button className="text-button" type="button" onClick={onAccept}><RefreshCw size={14} />Try again</button></div>
    </div>
    <button className="icon-button photo-ai-close" type="button" onClick={onDismiss} aria-label="Hide photo suggestion"><X size={14} /></button>
  </div>
}
