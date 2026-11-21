import { ArrowLeft, Camera, CameraOff, Check, ImageUp, ScanLine } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { photoCheckFailureOf, type PhotoCheckFailure } from './lib/photo-check-failure'
import type { PhotoIssueGuess } from './lib/photo-issue-classifier'
import { REPORT_PHOTO_TYPES } from './lib/report-photos'
import { remainingScanTime, scanFrame, scanNeedsHint, startScan } from './lib/photo-scan'
import type { PhotoChecker } from './usePhotoChecker'

type CameraScanProps = {
  checker: PhotoChecker
  /** A frame the scan found an issue in, with its guess, or one taken with the button (no guess yet). */
  onCapture: (photo: File, guess?: PhotoIssueGuess) => void
  /** Photos chosen instead of the live camera: uploaded, or taken with the phone's camera app. */
  onFiles: (files: File[]) => void
  /** The photo checker could not run; `failure` says why. */
  onError: (failure: PhotoCheckFailure) => void
  onBack: () => void
}

type CameraState = 'starting' | 'live' | 'blocked' | 'unavailable'
type ScanState = { phase: 'scanning'; hint: boolean } | { phase: 'found'; guess: PhotoIssueGuess }

const photoAccept = REPORT_PHOTO_TYPES.join(',')

/** Glowing points that blink across the frame while a photo or the camera is being read. */
export function ScanPoints() {
  return <div className="scan-points" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div>
}
const pause = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))

function grabFrame(video: HTMLVideoElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height)
  return canvas
}

function frameFile(canvas: HTMLCanvasElement): Promise<File> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob
      ? resolve(new File([blob], `camera-${Date.now()}.jpg`, { type: 'image/jpeg', lastModified: Date.now() }))
      : reject(new Error('The camera photo could not be saved.')), 'image/jpeg', 0.9)
  })
}

/**
 * The live camera: frames are read one after another while the reporter aims, and the scan stops on
 * its own when it sees an issue. The button takes the photo by hand. Frames never leave the device.
 */
export function CameraScan({ checker, onCapture, onFiles, onError, onBack }: CameraScanProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const uploadRef = useRef<HTMLInputElement>(null)
  const cameraAppRef = useRef<HTMLInputElement>(null)
  const [camera, setCamera] = useState<CameraState>('starting')
  // The first frame has been drawn, so the video can fade in.
  const [playing, setPlaying] = useState(false)
  // The shutter was pressed: the frame flashes before the photo is checked.
  const [capturing, setCapturing] = useState(false)
  const [scan, setScan] = useState<ScanState>({ phase: 'scanning', hint: false })
  // Set once the scan has ended, by a find or the button, so no later frame is used.
  const finished = useRef(false)
  const callbacks = useRef({ onCapture, onError })
  callbacks.current = { onCapture, onError }
  const { classify } = checker

  useEffect(() => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamera('unavailable')
      return
    }
    let stream: MediaStream | undefined
    let cancelled = false
    navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1600 }, height: { ideal: 1200 } },
    }).then((opened) => {
      if (cancelled) {
        opened.getTracks().forEach((track) => track.stop())
        return
      }
      stream = opened
      const video = videoRef.current
      if (video) {
        video.srcObject = opened
        void video.play().catch(() => undefined)
      }
      setCamera('live')
    }).catch((error: unknown) => {
      if (!cancelled) setCamera(error instanceof DOMException && error.name === 'NotAllowedError' ? 'blocked' : 'unavailable')
    })
    return () => {
      cancelled = true
      stream?.getTracks().forEach((track) => track.stop())
    }
  }, [])

  useEffect(() => {
    if (camera !== 'live') return
    let active = true
    void (async () => {
      let progress = startScan()
      let startedAt: number | undefined
      while (active && !finished.current) {
        const video = videoRef.current
        if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth) {
          await pause(150)
          continue
        }
        const frame = grabFrame(video)
        startedAt ??= performance.now()
        let guess: PhotoIssueGuess
        try {
          guess = await classify(frame)
        } catch (error) {
          if (active && !finished.current) callbacks.current.onError(photoCheckFailureOf(error))
          return
        }
        if (!active || finished.current) return
        const step = scanFrame(progress, guess)
        progress = step.progress
        if (step.found) {
          const photo = await frameFile(frame).catch(() => undefined)
          // A find in the first frame still lets the sweep finish a full pass first.
          await pause(remainingScanTime(startedAt, performance.now()))
          // The shutter may have been pressed while waiting; that photo wins.
          if (!active || finished.current) return
          finished.current = true
          setScan({ phase: 'found', guess: step.found })
          // A moment to see what was found before the form opens.
          await pause(900)
          if (!active) return
          if (photo) callbacks.current.onCapture(photo, step.found)
          else callbacks.current.onError('photo')
          return
        }
        setScan({ phase: 'scanning', hint: scanNeedsHint(progress) })
        await pause(250)
      }
    })()
    return () => { active = false }
  }, [camera, classify])

  async function takePhoto() {
    const video = videoRef.current
    if (!video || !video.videoWidth || finished.current) return
    finished.current = true
    setCapturing(true)
    try {
      const photo = await frameFile(grabFrame(video))
      // Long enough to see the flash.
      await pause(220)
      onCapture(photo)
    } catch {
      finished.current = false
      setCapturing(false)
    }
  }

  const fileInputs = <>
    <input ref={uploadRef} type="file" accept={photoAccept} multiple hidden onChange={(event) => { const files = Array.from(event.target.files ?? []); event.currentTarget.value = ''; if (files.length) onFiles(files) }} />
    <input ref={cameraAppRef} type="file" accept={photoAccept} capture="environment" hidden onChange={(event) => { const files = Array.from(event.target.files ?? []); event.currentTarget.value = ''; if (files.length) onFiles(files) }} />
  </>

  if (camera === 'blocked' || camera === 'unavailable') {
    return <div className="scan-fallback" role="status">
      {fileInputs}
      <span className="scan-fallback-icon" aria-hidden="true"><CameraOff size={22} /></span>
      <strong>{camera === 'blocked' ? 'Camera access is blocked' : "The live camera isn't available here"}</strong>
      <p>{camera === 'blocked'
        ? 'Allow camera access in your browser settings to scan, or take the photo with your camera app.'
        : 'Take the photo with your camera app, or upload one you already have.'}</p>
      <div className="scan-fallback-actions">
        <button className="primary-button" type="button" onClick={() => cameraAppRef.current?.click()}><Camera size={16} />Take a photo</button>
        <button className="secondary-button" type="button" onClick={() => uploadRef.current?.click()}><ImageUp size={16} />Upload a photo</button>
      </div>
      <button className="text-button scan-fallback-back" type="button" onClick={onBack}><ArrowLeft size={14} />Back</button>
    </div>
  }

  const downloading = checker.downloadProgress
  const found = scan.phase === 'found' ? scan.guess : undefined
  const hint = scan.phase === 'scanning' && scan.hint && !capturing
  // Each message slides in; the key changes only when the message does.
  let status: ReactNode
  if (camera === 'starting' || !playing) status = <span key="starting" className="scan-status-line"><span className="search-spinner" aria-hidden="true" />Starting the camera<span className="scan-dots" aria-hidden="true"><i /><i /><i /></span></span>
  else if (found) status = <span key="found" className="scan-status-line"><Check size={15} aria-hidden="true" />Found {found.issueType ? `${found.category} · ${found.issueType}` : found.category}</span>
  else if (capturing) status = <span key="capturing" className="scan-status-line"><Camera size={15} aria-hidden="true" />Photo taken</span>
  else if (downloading !== undefined) status = <span key="download" className="scan-status-download">
    <span><span className="search-spinner" aria-hidden="true" />Getting the photo checker ready… {Math.round(downloading * 100)}%</span>
    <span className="scan-status-bar" aria-hidden="true"><i style={{ width: `${Math.round(downloading * 100)}%` }} /></span>
  </span>
  else if (hint) status = <span key="hint" className="scan-status-line">Nothing spotted yet. Move closer, or tap the button to take the photo.</span>
  else status = <span key="looking" className="scan-status-line"><ScanLine size={15} aria-hidden="true" className="scan-status-icon" />Looking for an issue<span className="scan-dots" aria-hidden="true"><i /><i /><i /></span></span>
  const scanning = camera === 'live' && playing && !found && !capturing

  return <>
    {fileInputs}
    <div className={`scan-viewport is-camera${found ? ' is-found' : ''}${playing ? ' is-playing' : ''}${scanning ? ' is-scanning' : ''}${capturing ? ' is-capturing' : ''}`}>
      <video ref={videoRef} playsInline muted autoPlay aria-label="Camera view" onLoadedData={() => setPlaying(true)} onPlaying={() => setPlaying(true)} />
      {!playing && <span className="scan-placeholder" aria-hidden="true"><Camera size={30} /></span>}
      <div className="scan-frame" aria-hidden="true"><i /><i /><i /><i /></div>
      {scanning && <><div className="scan-sweep" aria-hidden="true" /><ScanPoints /></>}
      {found && <span className="scan-ripple" aria-hidden="true" />}
      <p className={`scan-status${found ? ' is-found' : ''}`} role="status">{status}</p>
    </div>
    <div className={`scan-controls${hint ? ' is-hint' : ''}`}>
      <button className="text-button" type="button" onClick={onBack}><ArrowLeft size={14} />Back</button>
      <button className="scan-shutter" type="button" onClick={() => void takePhoto()} disabled={camera !== 'live' || !playing || Boolean(found) || capturing} aria-label="Take the photo now"><Camera size={24} /></button>
      <button className="text-button" type="button" onClick={() => uploadRef.current?.click()}><ImageUp size={14} />Upload instead</button>
    </div>
  </>
}
