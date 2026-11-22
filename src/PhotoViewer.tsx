import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type SyntheticEvent } from 'react'
import { createPortal } from 'react-dom'
import { Camera, ChevronLeft, ChevronRight, ImageOff, Lock, RotateCw, X, ZoomIn, ZoomOut } from 'lucide-react'
import { motionIsReduced } from './display-prefs'
import { FITTED, MAX_ZOOM, TAP_ZOOM, clampPan, fitSize, panBy, pinchZoom, stepZoom, zoomAt, zoomLabel, type Point, type Size, type ZoomState } from './lib/photo-zoom'

type PhotoViewerProps = {
  /** The photo links, in the order they are shown. */
  urls: readonly string[]
  /** The photo to open on. */
  startIndex?: number
  /** What the photos are, such as "Photo from the reporter": the viewer's heading and each photo's alt text. */
  label: string
  /** A line of context under the heading, such as the report's ID and category. */
  caption?: string
  /** Shows that the photo is not public: only staff and the reporter can see it. */
  isPrivate?: boolean
  onClose: () => void
}

/** How far a finger must travel sideways for a swipe to change the photo, in CSS pixels. */
const SWIPE_DISTANCE = 56
/** A press that moves less than this is a tap or click, not a drag. */
const TAP_SLOP = 8
/** Two taps this close together, in time and place, are a double tap. */
const DOUBLE_TAP_MS = 320
const DOUBLE_TAP_SLOP = 32
/** How long the closing fade runs before the viewer is removed, in ms (matches --dur-fast). */
const CLOSE_MS = 160

type Loaded = { natural: Size } | 'failed'
type Gesture =
  | { kind: 'press'; startClient: Point; startZoom: ZoomState; onPhoto: boolean; onContent: boolean; moved: boolean; touch: boolean }
  | { kind: 'pinch'; startZoom: ZoomState; startMid: Point; startSpread: number }

let closeOpenViewer: (() => void) | undefined

/** Closes the open photo viewer and returns true, or returns false when none is open. For the Android back button. */
export function closePhotoViewer(): boolean {
  if (!closeOpenViewer) return false
  closeOpenViewer()
  return true
}

// The viewer is drawn on document.body, outside the React tree's DOM, but React still bubbles its
// events up through the components that opened it (a map popup, a staff form). Stop pointer events
// here. Not keydown: stopping it would also stop the native event before the document-level focus
// trap sees Tab; keys are handled by the capture listener below instead.
const stop = (event: SyntheticEvent) => event.stopPropagation()

/**
 * A report photo shown full size over the page, instead of opening it in a new tab. The photo's own
 * colors glow softly behind it. Arrows, the arrow keys, a swipe or the filmstrip move between photos;
 * a click, double tap, pinch, Ctrl+scroll or the zoom buttons zoom in, and a zoomed photo can be
 * dragged. Escape, the close button or a tap outside the photo closes it, and focus goes back to the
 * thumbnail that opened it.
 */
export function PhotoViewer({ urls, startIndex = 0, label, caption, isPrivate = false, onClose }: PhotoViewerProps) {
  const count = urls.length
  const titleId = useId()
  const [index, setIndex] = useState(() => Math.max(0, Math.min(count - 1, startIndex)))
  const [direction, setDirection] = useState<'open' | 'next' | 'prev'>('open')
  const [loaded, setLoaded] = useState<Readonly<Record<string, Loaded>>>({})
  const [attempts, setAttempts] = useState<Readonly<Record<string, number>>>({})
  const [zoom, setZoom] = useState<ZoomState>(FITTED)
  const [stage, setStage] = useState<Size & { left: number; top: number }>({ width: 0, height: 0, left: 0, top: 0 })
  const [drag, setDrag] = useState(0)
  const [gesturing, setGesturing] = useState(false)
  const [closing, setClosing] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const pointers = useRef(new Map<number, Point>())
  const gesture = useRef<Gesture>(undefined)
  const lastTap = useRef<{ at: number; point: Point }>(undefined)
  const wheelTimer = useRef<number>(undefined)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  const current = Math.max(0, Math.min(count - 1, index))
  const url = urls[current] as string | undefined
  const state = url ? loaded[url] : 'failed'
  const natural = state && state !== 'failed' ? state.natural : undefined
  const photo = natural ? fitSize(natural, stage) : { width: 0, height: 0 }
  const zoomed = zoom.scale > 1.001
  // The latest sizes and zoom, for the window listeners and gestures that outlive a render.
  const live = useRef({ photo, stage, zoom })
  live.current = { photo, stage, zoom }

  // The viewer fades out first, unless motion is reduced.
  const closingRef = useRef(false)
  const requestClose = useCallback(() => {
    if (closingRef.current) return
    closingRef.current = true
    if (motionIsReduced()) {
      onCloseRef.current()
      return
    }
    setClosing(true)
    window.setTimeout(() => onCloseRef.current(), CLOSE_MS)
  }, [])

  const show = useCallback((next: number, way: 'next' | 'prev') => {
    if (count < 2) return
    setIndex((next + count) % count)
    setDirection(way)
    setZoom(FITTED)
    setDrag(0)
  }, [count])
  const step = useCallback((delta: 1 | -1) => show(current + delta, delta > 0 ? 'next' : 'prev'), [show, current])
  const zoomBy = useCallback((way: 1 | -1) => {
    const { photo: size, stage: area, zoom: now } = live.current
    if (size.width === 0) return
    setZoom(zoomAt(now, stepZoom(now.scale, way), { x: 0, y: 0 }, size, area))
  }, [])

  // Focus moves into the viewer, and back to whatever opened it once it closes.
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    closeRef.current?.focus({ preventScroll: true })
    closeOpenViewer = requestClose
    return () => {
      if (closeOpenViewer === requestClose) closeOpenViewer = undefined
      opener?.focus({ preventScroll: true })
    }
  }, [requestClose])

  // Escape closes only the viewer, not the dialog or page behind it. Left and right change the
  // photo; plus, minus and 0 zoom.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // Tab goes on to the app's focus trap (useDialogFocusTrap), which keeps focus in the viewer.
      if (event.key === 'Tab') return
      // Nothing behind the viewer answers the keyboard while it is open: not the staff queue's
      // shortcuts, the command palette, or the Escape handling of the layers underneath.
      event.stopPropagation()
      if (event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return
      if (event.key === 'Escape') requestClose()
      else if (event.key === 'ArrowLeft' && count > 1) step(-1)
      else if (event.key === 'ArrowRight' && count > 1) step(1)
      else if (event.key === '+' || event.key === '=') zoomBy(1)
      else if (event.key === '-' || event.key === '_') zoomBy(-1)
      else if (event.key === '0') setZoom(FITTED)
      else return
      event.preventDefault()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [count, requestClose, step, zoomBy])

  // The page behind never scrolls under the viewer. Over the photo, Ctrl+scroll (and a trackpad
  // pinch, which arrives the same way) zooms at the pointer, and scrolling moves a zoomed photo.
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const area = stageRef.current
      const { photo: size, stage: box, zoom: now } = live.current
      if (!area || size.width === 0 || !area.contains(event.target as Node)) return
      const scale = event.deltaMode === 0 ? 1 : 16
      let next: ZoomState
      if (event.ctrlKey || event.metaKey) {
        const rect = area.getBoundingClientRect()
        const point = { x: event.clientX - rect.left - rect.width / 2, y: event.clientY - rect.top - rect.height / 2 }
        next = zoomAt(now, now.scale * Math.exp(-event.deltaY * scale * 0.01), point, size, box)
      } else if (now.scale > 1.001) {
        next = panBy(now, -event.deltaX * scale, -event.deltaY * scale, size, box)
      } else return
      setZoom(next)
      // Wheel steps arrive fast, so the transform follows them directly instead of easing.
      setGesturing(true)
      window.clearTimeout(wheelTimer.current)
      wheelTimer.current = window.setTimeout(() => setGesturing(false), 140)
    }
    root.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      root.removeEventListener('wheel', onWheel)
      window.clearTimeout(wheelTimer.current)
    }
  }, [])

  // The stage's inner box (inside its padding, which leaves room for the arrows) decides how large
  // the fitted photo is. The padding is the same on opposite sides, so both boxes share a middle.
  useLayoutEffect(() => {
    const area = stageRef.current
    if (!area) return
    const measure = () => {
      const style = getComputedStyle(area)
      const left = parseFloat(style.paddingLeft) || 0
      const top = parseFloat(style.paddingTop) || 0
      const next = { width: Math.max(0, area.clientWidth - left * 2), height: Math.max(0, area.clientHeight - top * 2), left, top }
      setStage((now) => now.width === next.width && now.height === next.height && now.left === next.left && now.top === next.top ? now : next)
    }
    measure()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure)
      return () => window.removeEventListener('resize', measure)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(area)
    return () => observer.disconnect()
  }, [])

  // A resize can leave a zoomed photo past its edges; pull it back.
  useEffect(() => {
    setZoom((now) => {
      const next = clampPan(now, { width: photo.width, height: photo.height }, { width: stage.width, height: stage.height })
      return next.scale === now.scale && next.x === now.x && next.y === now.y ? now : next
    })
  }, [photo.width, photo.height, stage.width, stage.height])

  if (!url) return null

  const mark = (photoUrl: string, result: Loaded) => setLoaded((value) => ({ ...value, [photoUrl]: result }))
  const retry = (photoUrl: string) => {
    setLoaded(({ [photoUrl]: _dropped, ...rest }) => rest)
    setAttempts((value) => ({ ...value, [photoUrl]: (value[photoUrl] ?? 0) + 1 }))
  }
  const stagePoint = (clientX: number, clientY: number): Point => {
    const rect = stageRef.current?.getBoundingClientRect()
    return rect ? { x: clientX - rect.left - rect.width / 2, y: clientY - rect.top - rect.height / 2 } : { x: 0, y: 0 }
  }
  const toggleZoomAt = (point: Point) => {
    const { photo: size, stage: box, zoom: now } = live.current
    if (size.width === 0) return
    setZoom(now.scale > 1.001 ? FITTED : zoomAt(FITTED, TAP_ZOOM, point, size, box))
  }
  const firstTwo = () => {
    const [a, b] = [...pointers.current.values()]
    return { mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, spread: Math.hypot(a.x - b.x, a.y - b.y) }
  }

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.stopPropagation()
    const target = event.target as Element
    if (target.closest('button') || (event.pointerType === 'mouse' && event.button !== 0)) return
    try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* the pointer is already gone */ }
    pointers.current.set(event.pointerId, stagePoint(event.clientX, event.clientY))
    if (pointers.current.size === 1) {
      gesture.current = {
        kind: 'press',
        startClient: { x: event.clientX, y: event.clientY },
        startZoom: live.current.zoom,
        onPhoto: Boolean(target.closest('img')),
        onContent: Boolean(target.closest('img, .photo-viewer-missing')),
        moved: false,
        touch: event.pointerType !== 'mouse',
      }
    } else if (pointers.current.size === 2 && live.current.photo.width > 0) {
      const { mid, spread } = firstTwo()
      gesture.current = { kind: 'pinch', startZoom: live.current.zoom, startMid: mid, startSpread: spread }
      setDrag(0)
      setGesturing(true)
    }
  }
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId)) return
    pointers.current.set(event.pointerId, stagePoint(event.clientX, event.clientY))
    const now = gesture.current
    const { photo: size, stage: box } = live.current
    if (now?.kind === 'pinch' && pointers.current.size >= 2) {
      const { mid, spread } = firstTwo()
      setZoom(pinchZoom(now.startZoom, now.startMid, now.startSpread, mid, spread, size, box))
      return
    }
    if (now?.kind !== 'press') return
    const dx = event.clientX - now.startClient.x
    const dy = event.clientY - now.startClient.y
    if (!now.moved && Math.hypot(dx, dy) < TAP_SLOP) return
    now.moved = true
    if (now.startZoom.scale > 1.001) {
      setGesturing(true)
      setZoom(panBy(now.startZoom, dx, dy, size, box))
    } else if (now.touch && count > 1 && Math.abs(dx) > Math.abs(dy)) {
      // The photo follows the finger, so a swipe feels like moving it aside.
      setGesturing(true)
      setDrag(dx)
    }
  }
  const endPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.stopPropagation()
    if (!pointers.current.delete(event.pointerId)) return
    const now = gesture.current
    if (now?.kind === 'pinch') {
      if (pointers.current.size === 1) {
        // One finger stays down after a pinch: it carries on as a drag, never as a tap.
        const [rest] = [...pointers.current.values()]
        const rect = stageRef.current?.getBoundingClientRect()
        const client = rect ? { x: rest.x + rect.left + rect.width / 2, y: rest.y + rect.top + rect.height / 2 } : rest
        gesture.current = { kind: 'press', startClient: client, startZoom: live.current.zoom, onPhoto: true, onContent: true, moved: true, touch: true }
      } else if (pointers.current.size === 0) {
        gesture.current = undefined
        setGesturing(false)
      }
      return
    }
    gesture.current = undefined
    setGesturing(false)
    setDrag(0)
    if (now?.kind !== 'press' || event.type === 'pointercancel') return
    const dx = event.clientX - now.startClient.x
    const dy = event.clientY - now.startClient.y
    if (now.touch && now.startZoom.scale <= 1.001 && count > 1 && Math.abs(dx) >= SWIPE_DISTANCE && Math.abs(dx) > Math.abs(dy)) {
      step(dx < 0 ? 1 : -1)
      return
    }
    if (now.moved) return
    if (!now.onContent) {
      requestClose()
      return
    }
    if (!now.onPhoto) return
    const point = stagePoint(event.clientX, event.clientY)
    if (!now.touch) {
      toggleZoomAt(point)
      return
    }
    const previous = lastTap.current
    const at = event.timeStamp
    if (previous && at - previous.at < DOUBLE_TAP_MS && Math.hypot(point.x - previous.point.x, point.y - previous.point.y) < DOUBLE_TAP_SLOP) {
      lastTap.current = undefined
      toggleZoomAt(point)
    } else {
      lastTap.current = { at, point }
    }
  }

  const alt = count > 1 ? `${label} ${current + 1} of ${count}` : label
  const ready = Boolean(natural) && photo.width > 0
  const attempt = attempts[url] ?? 0
  const photoClass = [ready ? 'is-loaded' : '', `is-from-${direction}`, zoomed ? 'is-zoomed' : ''].filter(Boolean).join(' ')
  const zoomDisabled = !ready

  return createPortal(<div
    ref={rootRef}
    className={`photo-viewer${closing ? ' is-closing' : ''}${gesturing ? ' is-gesturing' : ''}`}
    role="dialog"
    aria-modal="true"
    aria-labelledby={titleId}
    onClick={stop}
    onMouseDown={stop}
    onPointerDown={stop}
    onPointerUp={stop}
  >
    <div className="photo-viewer-ambient" aria-hidden="true">
      {ready && <img key={url} src={url} alt="" draggable={false} />}
    </div>

    <header className="photo-viewer-bar">
      <div className="photo-viewer-heading">
        <span className="photo-viewer-icon" aria-hidden="true"><Camera size={18} /></span>
        <div className="photo-viewer-titles">
          <h2 id={titleId} className="photo-viewer-title">
            <span>{label}</span>
            {count > 1 && <span className="photo-viewer-count" aria-live="polite" aria-label={`Photo ${current + 1} of ${count}`}>{current + 1} / {count}</span>}
          </h2>
          {caption && <p className="photo-viewer-caption">{caption}</p>}
        </div>
      </div>
      <div className="photo-viewer-tools">
        <div className="photo-viewer-zoom" role="group" aria-label="Zoom">
          <button type="button" onClick={() => zoomBy(-1)} aria-disabled={zoomDisabled || !zoomed} aria-label="Zoom out" title="Zoom out (−)"><ZoomOut size={17} aria-hidden="true" /></button>
          <button className="photo-viewer-zoom-level" type="button" onClick={() => setZoom(FITTED)} aria-disabled={zoomDisabled || !zoomed} aria-label={zoomed ? `Zoomed to ${zoomLabel(zoom.scale)}. Fit the whole photo` : 'Showing the whole photo'} title="Fit the whole photo (0)">{zoomLabel(zoom.scale)}</button>
          <button type="button" onClick={() => zoomBy(1)} aria-disabled={zoomDisabled || zoom.scale >= MAX_ZOOM - 0.001} aria-label="Zoom in" title="Zoom in (+)"><ZoomIn size={17} aria-hidden="true" /></button>
        </div>
        <button ref={closeRef} className="photo-viewer-close" type="button" onClick={requestClose} aria-label="Close photo" title="Close (Esc)"><X size={20} aria-hidden="true" /></button>
      </div>
    </header>

    <div
      ref={stageRef}
      className="photo-viewer-stage"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
    >
      {state === 'failed'
        ? <div className="photo-viewer-missing">
          <span className="photo-viewer-missing-icon" aria-hidden="true"><ImageOff size={26} /></span>
          <strong>This photo could not be loaded</strong>
          <span>Check your connection, then try again.</span>
          <button type="button" onClick={() => retry(url)}><RotateCw size={15} aria-hidden="true" /> Try again</button>
        </div>
        : <img
          key={`${url}#${attempt}`}
          className={photoClass}
          src={url}
          alt={alt}
          decoding="async"
          draggable={false}
          style={ready ? {
            width: photo.width,
            height: photo.height,
            left: stage.left + (stage.width - photo.width) / 2,
            top: stage.top + (stage.height - photo.height) / 2,
            transform: `translate3d(${zoom.x + drag}px, ${zoom.y}px, 0) scale(${zoom.scale})`,
          } : undefined}
          onLoad={(event) => mark(url, { natural: { width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight } })}
          onError={() => mark(url, 'failed')}
        />}
      {!state && <div className="photo-viewer-loading" role="status"><span className="photo-viewer-spinner" aria-hidden="true" />Loading photo…</div>}
      {count > 1 && <>
        <button className="photo-viewer-nav is-prev" type="button" onClick={() => step(-1)} aria-label="Previous photo" title="Previous (←)"><ChevronLeft size={26} aria-hidden="true" /></button>
        <button className="photo-viewer-nav is-next" type="button" onClick={() => step(1)} aria-label="Next photo" title="Next (→)"><ChevronRight size={26} aria-hidden="true" /></button>
      </>}
    </div>

    <footer className="photo-viewer-footer">
      {isPrivate && <span className="photo-viewer-private"><Lock size={12} strokeWidth={2.4} aria-hidden="true" />Private<span className="photo-viewer-private-detail"> · only staff and the reporter can see this photo</span></span>}
      {count > 1 && <div className="photo-viewer-filmstrip" role="group" aria-label="All photos">
        {urls.map((thumb, photoIndex) => <button
          key={thumb}
          type="button"
          className={photoIndex === current ? 'is-active' : undefined}
          onClick={() => { if (photoIndex !== current) show(photoIndex, photoIndex > current ? 'next' : 'prev') }}
          aria-label={`Show photo ${photoIndex + 1} of ${count}`}
          aria-current={photoIndex === current ? 'true' : undefined}
        >
          {loaded[thumb] === 'failed' ? <ImageOff size={16} aria-hidden="true" /> : <img src={thumb} alt="" draggable={false} />}
        </button>)}
      </div>}
      <p className="photo-viewer-hints is-pointer" aria-hidden="true">
        {count > 1 && <span><kbd>←</kbd><kbd>→</kbd> Browse</span>}
        <span>Click or <kbd>+</kbd><kbd>−</kbd> Zoom</span>
        <span><kbd>Esc</kbd> Close</span>
      </p>
      <p className="photo-viewer-hints is-touch" aria-hidden="true">
        <span>{count > 1 ? 'Swipe to browse · ' : ''}Double-tap or pinch to zoom</span>
      </p>
    </footer>
  </div>, document.body)
}
