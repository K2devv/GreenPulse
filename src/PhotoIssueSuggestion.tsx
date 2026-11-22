import { Check, RefreshCw, ScanSearch, Sparkles, TriangleAlert, X } from 'lucide-react'
import type { PhotoCheckFailure } from './lib/photo-check-failure'
import { PHOTO_MODEL_MEGABYTES } from './lib/photo-issue-classifier'
import type { PhotoSuggestionState } from './usePhotoIssueSuggestion'
import { t } from './lib/i18n'

type PhotoIssueSuggestionProps = {
  state: PhotoSuggestionState
  /** Whether the suggestion was filled into the form; false when the reporter had already chosen a category. */
  applied: boolean
  onAccept: () => void
  onDismiss: () => void
  /** Fills the form with a suggestion that was not applied automatically. */
  onApply: () => void
}

const PRIVACY_LINE = 'Checked on this device. Photos are only sent when you submit the report.'

/** What a failed check says, by why it failed. Only a failed download is worth trying again from here. */
const failedCopy: Record<PhotoCheckFailure, { title: string; detail: string }> = {
  download: { title: "Photo suggestions aren't available right now", detail: "Choose the category yourself, or try again when you're online." },
  app: { title: "Photo suggestions didn't load", detail: 'GreenPulse may have just been updated. Choose the category yourself; reloading the page later brings suggestions back.' },
  device: { title: "This device can't suggest from photos", detail: 'Choose the category and issue type yourself.' },
  photo: { title: "Couldn't read this photo", detail: 'Choose the category yourself, or add a different photo.' },
}

/** The photo checker's status under the report photos: asking, working, or what it found. */
export function PhotoIssueSuggestion({ state, applied, onAccept, onDismiss, onApply }: PhotoIssueSuggestionProps) {
  if (state.status === 'idle') return null
  const privacyLine = t(PRIVACY_LINE)

  if (state.status === 'ask') {
    return <div className="photo-ai is-ask" role="status">
      <span className="photo-ai-icon" aria-hidden="true"><Sparkles size={16} /></span>
      <div className="photo-ai-copy">
        <strong>{t('Fill in the issue from your photo?')}</strong>
        <span>{t('GreenPulse can suggest the category and issue type. It needs a one-time {size} MB download.', { size: PHOTO_MODEL_MEGABYTES })} {privacyLine}</span>
        <div className="photo-ai-actions">
          <button className="secondary-button photo-ai-button" type="button" onClick={onAccept}><ScanSearch size={15} />{t('Suggest from photo')}</button>
          <button className="text-button" type="button" onClick={onDismiss}>{t('Not now')}</button>
        </div>
      </div>
    </div>
  }

  if (state.status === 'downloading' || state.status === 'checking') {
    const percent = state.status === 'downloading' ? Math.round(state.progress * 100) : undefined
    return <div className="photo-ai is-busy" role="status">
      <span className="photo-ai-icon" aria-hidden="true"><span className="search-spinner" /></span>
      <div className="photo-ai-copy">
        <strong>{percent === undefined ? t('Checking your photo…') : t('Getting the photo checker ready… {percent}%', { percent })}</strong>
        <span>{percent === undefined ? privacyLine : `${t('One-time {size} MB download.', { size: PHOTO_MODEL_MEGABYTES })} ${privacyLine}`}</span>
        {percent !== undefined && <span className="photo-ai-progress" aria-hidden="true"><i style={{ width: `${percent}%` }} /></span>}
      </div>
    </div>
  }

  if (state.status === 'suggested') {
    const { category, issueType } = state.guess
    const found = issueType ? `${t(category)} · ${t(issueType)}` : t(category)
    return <div className={`photo-ai is-found${applied ? ' is-applied' : ''}`} role="status">
      <span className="photo-ai-icon" aria-hidden="true">{applied ? <Check size={16} /> : <Sparkles size={16} />}</span>
      <div className="photo-ai-copy">
        <strong>{t('Looks like {issue}', { issue: found })}</strong>
        <span>{applied
          ? t('Filled in above from your photo. Change it if it looks wrong.')
          : t('You chose a different category, so nothing was changed.')}</span>
        {!applied && <div className="photo-ai-actions"><button className="secondary-button photo-ai-button" type="button" onClick={onApply}>{t('Use this instead')}</button></div>}
      </div>
      <button className="icon-button photo-ai-close" type="button" onClick={onDismiss} aria-label={t('Hide photo suggestion')}><X size={14} /></button>
    </div>
  }

  if (state.status === 'unclear') {
    return <div className="photo-ai is-unclear" role="status">
      <span className="photo-ai-icon" aria-hidden="true"><ScanSearch size={16} /></span>
      <div className="photo-ai-copy">
        <strong>{t('Couldn\'t tell the issue from this photo')}</strong>
        <span>{t('Choose the category and issue type yourself.')}</span>
      </div>
      <button className="icon-button photo-ai-close" type="button" onClick={onDismiss} aria-label={t('Hide photo suggestion')}><X size={14} /></button>
    </div>
  }

  const failed = failedCopy[state.failure]
  return <div className="photo-ai is-failed" role="status">
    <span className="photo-ai-icon" aria-hidden="true"><TriangleAlert size={16} /></span>
    <div className="photo-ai-copy">
      <strong>{t(failed.title)}</strong>
      <span>{t(failed.detail)}</span>
      {state.failure === 'download' && <div className="photo-ai-actions"><button className="text-button" type="button" onClick={onAccept}><RefreshCw size={14} />{t('Try again')}</button></div>}
    </div>
    <button className="icon-button photo-ai-close" type="button" onClick={onDismiss} aria-label={t('Hide photo suggestion')}><X size={14} /></button>
  </div>
}
