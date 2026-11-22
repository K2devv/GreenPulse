import { Check, ChevronRight, ClipboardList, ImageUp, RefreshCw, RotateCw, ScanLine, SearchX, ShieldCheck, Sparkles, TriangleAlert, X } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { CameraScan, ScanPoints } from './CameraScan'
import { motionIsReduced } from './display-prefs'
import { PHOTO_UNREADABLE_MESSAGE, photoCheckFailureOf, type PhotoCheckFailure } from './lib/photo-check-failure'
import { PHOTO_MODEL_MEGABYTES, type PhotoIssueGuess } from './lib/photo-issue-classifier'
import { REPORT_PHOTO_TYPES, reportPhotoProblem, type PreparedReportPhoto } from './lib/report-photos'
import { remainingScanTime } from './lib/photo-scan'
import { photoModelIsCached, type PhotoChecker } from './usePhotoChecker'

type ReportStartProps = {
  checker: PhotoChecker
  /** Guests may attach smaller photos than signed-in reporters. */
  guest: boolean
  /** Checks and compresses chosen photos; throws an Error with a message for the reporter. */
  preparePhotos: (files: File[]) => Promise<PreparedReportPhoto[]>
  /** Opens the form, keeping any photos already taken. */
  onForm: (photos: PreparedReportPhoto[]) => void
  /** The photos show an issue: open the form filled in from the guess. */
  onFound: (guess: PhotoIssueGuess, photos: PreparedReportPhoto[]) => void
  onClose: () => void
}

type View =
  | { name: 'choose' }
  | { name: 'camera' }
  /** `photos` is empty while the chosen photos are still being compressed. */
  | { name: 'checking'; photos: PreparedReportPhoto[] }
  | { name: 'found'; photos: PreparedReportPhoto[]; guess: PhotoIssueGuess }
  | { name: 'none'; photos: PreparedReportPhoto[] }
  /** The checker could not run. An unreadable photo goes back to the start instead. */
  | { name: 'failed'; photos: PreparedReportPhoto[]; failure: Exclude<PhotoCheckFailure, 'photo'> }

const headings: Record<View['name'], { eyebrow: string; title: string; subtitle: string }> = {
  choose: { eyebrow: 'COMMUNITY REPORT', title: 'Report an issue', subtitle: 'Show us the problem with a photo, or fill in the form yourself.' },
  camera: { eyebrow: 'REPORT WITH A PHOTO', title: 'Scan the issue', subtitle: 'Point your camera at the problem. GreenPulse looks for it while you aim.' },
  checking: { eyebrow: 'REPORT WITH A PHOTO', title: 'Checking your photo…', subtitle: 'Looking for waste, pollution, flooding and drainage problems.' },
  found: { eyebrow: 'REPORT WITH A PHOTO', title: 'Issue found', subtitle: 'Opening the report form with the details filled in.' },
  none: { eyebrow: 'REPORT WITH A PHOTO', title: 'No issue found', subtitle: "GreenPulse couldn't spot an issue in this photo." },
  failed: { eyebrow: 'REPORT WITH A PHOTO', title: "Couldn't check the photo", subtitle: "The photo checker couldn't load right now." },
}

/** Why the check failed decides what the reporter is told and which button comes first. */
const failedCopy: Record<Exclude<PhotoCheckFailure, 'photo'>, { subtitle: string; detail: string }> = {
  download: {
    subtitle: "The photo checker couldn't be downloaded.",
    detail: `The photo checker needs a one-time ${PHOTO_MODEL_MEGABYTES} MB download. Check your connection and try again, or fill in the form yourself.`,
  },
  app: {
    subtitle: "Part of GreenPulse didn't load.",
    detail: 'This usually happens right after GreenPulse is updated, or when the connection drops. Reload the page and try again, or fill in the form yourself.',
  },
  device: {
    subtitle: "This device couldn't run the photo checker.",
    detail: 'This can happen on phones with little free memory. Fill in the form yourself instead.',
  },
}

const pause = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))

const describeGuess = (guess: PhotoIssueGuess) => guess.issueType ? `${guess.category} · ${guess.issueType}` : guess.category

/** The three parts of the flow; moving between them slides the new content in. */
const stageOf = (view: View['name']) => view === 'choose' || view === 'camera' ? view : 'photo'

/**
 * The first screen of a new report: report with a photo (scan with the camera or upload), which
 * fills in the form from what the photo shows, or go straight to the form.
 */
export default function ReportStart({ checker, guest, preparePhotos, onForm, onFound, onClose }: ReportStartProps) {
  const [view, setView] = useState<View>({ name: 'choose' })
  const [error, setError] = useState('')
  const [downloadNeeded, setDownloadNeeded] = useState(false)
  // The photo being checked, shown at once from the original file while it is compressed.
  const [preview, setPreview] = useState<string>()
  const previewUrl = useRef<string | undefined>(undefined)
  const sectionRef = useRef<HTMLElement>(null)
  const uploadRef = useRef<HTMLInputElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  // Each check gets a number; going back or starting another makes older results stale.
  const run = useRef(0)
  const { checkPhotos } = checker
  const onFoundRef = useRef(onFound)
  onFoundRef.current = onFound

  useEffect(() => {
    let current = true
    void photoModelIsCached().then((cached) => { if (current) setDownloadNeeded(!cached) })
    return () => { current = false }
  }, [view.name])

  // Each screen announces itself, and keyboard focus starts at its heading.
  const firstView = useRef(true)
  useEffect(() => {
    if (firstView.current) {
      firstView.current = false
      return
    }
    headingRef.current?.focus()
  }, [view.name])

  // The dialog grows or shrinks smoothly to each screen instead of jumping.
  const lastHeight = useRef(0)
  const resizing = useRef<Animation | undefined>(undefined)
  useEffect(() => {
    const section = sectionRef.current
    if (!section || typeof ResizeObserver === 'undefined') return
    lastHeight.current = section.offsetHeight
    const observer = new ResizeObserver(() => { if (!resizing.current) lastHeight.current = section.offsetHeight })
    observer.observe(section)
    return () => observer.disconnect()
  }, [])
  useLayoutEffect(() => {
    const section = sectionRef.current
    const from = lastHeight.current
    if (!section || !from || typeof section.animate !== 'function' || motionIsReduced()) return
    const to = section.offsetHeight
    if (Math.abs(from - to) < 2) return
    resizing.current?.cancel()
    const overflow = section.style.overflowY
    section.style.overflowY = 'hidden'
    const animation = section.animate([{ height: `${from}px` }, { height: `${to}px` }], { duration: 340, easing: 'cubic-bezier(.22, 1, .36, 1)' })
    resizing.current = animation
    const done = () => {
      if (resizing.current !== animation) return
      resizing.current = undefined
      section.style.overflowY = overflow
      lastHeight.current = section.offsetHeight
    }
    animation.onfinish = done
    animation.oncancel = done
  }, [view.name])

  // A found issue shows for a moment, then the form opens.
  useEffect(() => {
    if (view.name !== 'found') return
    const timer = window.setTimeout(() => onFoundRef.current(view.guess, view.photos), 900)
    return () => window.clearTimeout(timer)
  }, [view])

  useEffect(() => () => { if (previewUrl.current) URL.revokeObjectURL(previewUrl.current) }, [])

  function showPreview(photo: File | undefined) {
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current)
    previewUrl.current = photo ? URL.createObjectURL(photo) : undefined
    setPreview(previewUrl.current)
  }

  function backToStart(message = '') {
    run.current += 1
    setError(message)
    setView({ name: 'choose' })
    showPreview(undefined)
  }

  /** Compresses the photos and checks them. A guess the camera already made skips the check. */
  async function readPhotos(files: File[], cameraGuess?: PhotoIssueGuess) {
    const problem = reportPhotoProblem(files, 0, guest)
    if (problem) {
      backToStart(problem)
      return
    }
    const id = run.current += 1
    const startedAt = performance.now()
    setError('')
    if (!cameraGuess) {
      showPreview(files[0])
      setView({ name: 'checking', photos: [] })
    }
    let photos: PreparedReportPhoto[]
    try {
      photos = await preparePhotos(files)
    } catch (failure) {
      if (run.current === id) backToStart(failure instanceof Error ? failure.message : 'The photo could not be prepared.')
      return
    }
    if (run.current !== id) return
    if (cameraGuess) {
      onFound(cameraGuess, photos)
      return
    }
    setView({ name: 'checking', photos })
    let outcome: View
    try {
      const guess = await checkPhotos(photos.map((photo) => photo.file), () => run.current !== id)
      outcome = guess ? { name: 'found', photos, guess } : { name: 'none', photos }
    } catch (failure) {
      const reason = photoCheckFailureOf(failure)
      if (reason === 'photo') {
        if (run.current === id) backToStart(PHOTO_UNREADABLE_MESSAGE)
        return
      }
      outcome = { name: 'failed', photos, failure: reason }
    }
    if (run.current !== id) return
    // A quick answer waits for the sweep to finish its pass, so the check is seen happening.
    await pause(remainingScanTime(startedAt, performance.now()))
    if (run.current === id) setView(outcome)
  }

  const heading = view.name === 'failed' ? { ...headings.failed, subtitle: failedCopy[view.failure].subtitle } : headings[view.name]
  const photos = 'photos' in view ? view.photos : []
  const preparing = view.name === 'checking' && !photos.length

  return <section ref={sectionRef} className={`report-modal report-start-modal is-${view.name}`} role="dialog" aria-modal="true" aria-labelledby="report-start-title">
    <div className="modal-header">
      <div key={view.name} className="report-start-heading">
        <p className="eyebrow">{heading.eyebrow}</p>
        <h2 id="report-start-title" ref={headingRef} tabIndex={-1}>{heading.title}</h2>
        <p>{heading.subtitle}</p>
      </div>
      <button className="icon-button" type="button" onClick={onClose} aria-label="Close report form"><X size={19} /></button>
    </div>

    <div key={stageOf(view.name)} className={`report-start-stage is-${stageOf(view.name)}`}>
      {view.name === 'choose' && <div className="report-start">
        <input ref={uploadRef} type="file" accept={REPORT_PHOTO_TYPES.join(',')} multiple hidden onChange={(event) => { const files = Array.from(event.target.files ?? []); event.currentTarget.value = ''; if (files.length) void readPhotos(files) }} />
        <section className="report-start-photo" aria-labelledby="report-start-photo-title">
          <div className="report-start-photo-head">
            <span className="report-start-mark" aria-hidden="true"><Sparkles size={21} /></span>
            <div>
              <h3 id="report-start-photo-title">Report with a photo <span className="report-start-badge">Quickest</span></h3>
              <p>Scan the area with your camera or upload a photo. GreenPulse spots the issue and fills in the form for you.</p>
            </div>
          </div>
          <div className="report-start-actions">
            <button className="primary-button" type="button" onClick={() => { setError(''); setView({ name: 'camera' }) }}><ScanLine size={17} />Scan with camera</button>
            <button className="secondary-button" type="button" onClick={() => uploadRef.current?.click()}><ImageUp size={17} />Upload a photo</button>
          </div>
          <p className="report-start-note"><ShieldCheck size={14} aria-hidden="true" />The issue check runs on this device. Photos are only sent when you submit the report.{downloadNeeded ? ` First use downloads ${PHOTO_MODEL_MEGABYTES} MB.` : ''}</p>
        </section>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="report-start-or" aria-hidden="true">or</div>
        <button className="report-start-form" type="button" onClick={() => onForm([])}>
          <span className="report-start-form-icon" aria-hidden="true"><ClipboardList size={19} /></span>
          <span className="report-start-form-copy"><strong>Fill in the form</strong><small>Choose the category and describe the issue yourself.</small></span>
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      </div>}

      {view.name === 'camera' && <CameraScan
        checker={checker}
        onCapture={(photo, guess) => void readPhotos([photo], guess)}
        onFiles={(files) => void readPhotos(files)}
        onError={(failure) => failure === 'photo' ? backToStart(PHOTO_UNREADABLE_MESSAGE) : setView({ name: 'failed', photos: [], failure })}
        onBack={() => backToStart()}
      />}

      {stageOf(view.name) === 'photo' && <>
        <div className={`scan-viewport is-photo is-${view.name}`}>
          {preview ? <img src={preview} alt="Your report photo" /> : <div className="scan-viewport-empty" aria-hidden="true" />}
          <div className="scan-frame" aria-hidden="true"><i /><i /><i /><i /></div>
          {view.name === 'checking' && <><div className="scan-sweep" aria-hidden="true" /><ScanPoints /></>}
          {view.name === 'found' && <span className="scan-ripple" aria-hidden="true" />}
          {photos.length > 1 && <span className="scan-count">{photos.length} photos</span>}
          {view.name === 'none' && <span className="scan-badge" aria-hidden="true"><SearchX size={26} /></span>}
          {view.name === 'failed' && <span className="scan-badge is-warn" aria-hidden="true"><TriangleAlert size={26} /></span>}
          {(view.name === 'checking' || view.name === 'found') && <p className={`scan-status${view.name === 'found' ? ' is-found' : ''}`} role="status">
            {view.name === 'found'
              ? <span key="found" className="scan-status-line"><Check size={15} aria-hidden="true" />Found {describeGuess(view.guess)}</span>
              : checker.downloadProgress !== undefined
                ? <span key="download" className="scan-status-download">
                  <span><span className="search-spinner" aria-hidden="true" />Getting the photo checker ready… {Math.round(checker.downloadProgress * 100)}%</span>
                  <span className="scan-status-bar" aria-hidden="true"><i style={{ width: `${Math.round(checker.downloadProgress * 100)}%` }} /></span>
                </span>
                : <span key={preparing ? 'preparing' : 'checking'} className="scan-status-line"><span className="search-spinner" aria-hidden="true" />{preparing ? 'Preparing your photo' : 'Checking'}<span className="scan-dots" aria-hidden="true"><i /><i /><i /></span></span>}
          </p>}
        </div>

        {view.name === 'checking' && <div className="report-start-result">
          <button className="text-button" type="button" onClick={() => backToStart()}>Cancel</button>
        </div>}
        {view.name === 'none' && <div className="report-start-result" role="status">
          <p>No waste, pollution, flooding or drainage problem was found in this photo. Try again with a closer, clearer photo of the issue, or fill in the form yourself.</p>
          <div className="report-start-result-actions"><button className="primary-button" type="button" onClick={() => backToStart()}><RefreshCw size={16} />Try again</button></div>
        </div>}
        {view.name === 'failed' && <div className="report-start-result" role="status">
          <p>{failedCopy[view.failure].detail}{photos.length ? ' The form keeps your photo.' : ''}</p>
          <div className="report-start-result-actions">
            {view.failure === 'download' && <button className="primary-button" type="button" onClick={() => backToStart()}><RefreshCw size={16} />Try again</button>}
            {view.failure === 'app' && <button className="primary-button" type="button" onClick={() => window.location.reload()}><RotateCw size={16} />Reload page</button>}
            <button className={view.failure === 'device' ? 'primary-button' : 'secondary-button'} type="button" onClick={() => onForm(photos)}><ClipboardList size={16} />Fill in the form</button>
            {view.failure === 'device' && <button className="secondary-button" type="button" onClick={() => backToStart()}><RefreshCw size={16} />Try again</button>}
          </div>
        </div>}
      </>}
    </div>
  </section>
}
