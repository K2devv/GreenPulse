import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type SyntheticEvent } from 'react'
import { createPortal } from 'react-dom'
import { Camera, ChevronLeft, ChevronRight, ChevronsLeftRight, Columns2, ImageOff, Lock, Maximize2, Minimize2, RotateCw, Sun, X, ZoomIn, ZoomOut } from 'lucide-react'
import { motionIsReduced } from './display-prefs'
import { FITTED, MAX_ZOOM, TAP_ZOOM, centerOn, clampPan, fitSize, panBy, pinchZoom, quarterTurns, rotatedSize, stepZoom, visibleRegion, zoomAt, zoomLabel, type Point, type Size, type ZoomState } from './lib/photo-zoom'
import { SPLIT_MAX, SPLIT_MIN, dismissProgress, dragAxis, shouldDismiss, splitAfterKey, splitAt } from './lib/photo-viewer-gestures'
import { t } from './lib/i18n'

/** Photos of the same report to show beside the viewer's own, and which side they go on. */
export type PhotoComparison = { label: string; urls: readonly string[]; side: 'before' | 'after' }

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
  /** Another set of the report's photos to compare with, such as the after-photos. */
  compareWith?: PhotoComparison
  /** Opens with the comparison showing. */
  startComparing?: boolean
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
/** How long a rotation eases, in ms (matches --dur-med), while the photo's box resizes with it. */
const ROTATE_MS = 340
/** How far an arrow key moves a zoomed photo, in CSS pixels (three times as far with Shift). */
const PAN_STEP = 80
/** The zoom navigator's largest size, in CSS pixels. */
const NAVIGATOR_MAX: Size = { width: 132, height: 96 }
/** How much a photo shrinks as it is swiped down to close. */
const DISMISS_SHRINK = 0.15

type Loaded = { natural: Size } | 'failed'
type Gesture =
  | { kind: 'press'; startClient: Point; startTime: number; startZoom: ZoomState; onPhoto: boolean; onContent: boolean; moved: boolean; touch: boolean; axis?: 'x' | 'y' }
  | { kind: 'pinch'; startZoom: ZoomState; startMid: Point; startSpread: number }
type CompareView = 'side' | 'slider'
/** One set in the comparison, with the photo it is on and how to move to the next. */
type CompareSide = { side: 'before' | 'after'; label: string; urls: readonly string[]; index: number; onStep: (delta: 1 | -1) => void }

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
const clamp01 = (value: number) => Math.max(0, Math.min(1, value))
const fullscreenSupported = () => typeof document !== 'undefined' && document.fullscreenEnabled === true
const sideName = (side: 'before' | 'after') => side === 'before' ? t('Before') : t('After')
const photoAlt = (label: string, index: number, count: number) => count > 1 ? t('{label} {number} of {total}', { label, number: index + 1, total: count }) : label

/** A set's name tag, its label, and arrows when it has more than one photo. */
function CompareSetBar({ set, onRotate }: { set: CompareSide; onRotate?: () => void }) {
  const count = set.urls.length
  return <div className={`photo-viewer-pane-bar is-${set.side}`}>
    <span className="photo-viewer-pane-side">{sideName(set.side)}</span>
    <span className="photo-viewer-pane-label">{set.label}</span>
    {count > 1 && <span className="photo-viewer-pane-nav">
      <button type="button" onClick={() => set.onStep(-1)} aria-label={t('Previous photo')}><ChevronLeft size={15} aria-hidden="true" /></button>
      <span className="photo-viewer-pane-count">{set.index + 1} / {count}</span>
      <button type="button" onClick={() => set.onStep(1)} aria-label={t('Next photo')}><ChevronRight size={15} aria-hidden="true" /></button>
    </span>}
    {onRotate && <button className="photo-viewer-pane-rotate" type="button" onClick={onRotate} aria-label={t('Rotate')} title={t('Rotate')}><RotateCw size={14} aria-hidden="true" /></button>}
  </div>
}

/** One side of the side-by-side comparison: the photo fitted in its half, with its own arrows. */
function ComparePane({ set, turn, onRotate }: { set: CompareSide; turn: number; onRotate: () => void }) {
  const [failed, setFailed] = useState<ReadonlySet<string>>(new Set())
  const url = set.urls[set.index]
  return <section className={`photo-viewer-pane is-${set.side}`} aria-label={`${sideName(set.side)}: ${set.label}`}>
    <div className="photo-viewer-pane-frame">
      {!url || failed.has(url)
        ? <p className="photo-viewer-pane-missing"><ImageOff size={22} aria-hidden="true" />{t('This photo could not be loaded')}</p>
        : <img
          key={url}
          className={quarterTurns(turn) % 2 === 1 ? 'is-sideways' : undefined}
          src={url}
          alt={photoAlt(set.label, set.index, set.urls.length)}
          draggable={false}
          style={{ rotate: `${turn * 90}deg` }}
          onError={() => setFailed((value) => new Set(value).add(url))}
        />}
    </div>
    <CompareSetBar set={set} onRotate={onRotate} />
  </section>
}

type SliderCompareProps = {
  before: CompareSide
  after: CompareSide
  turns: Readonly<Record<string, number>>
  split: number
  onSplit: (value: number) => void
}

/**
 * The before photo and the after photo laid over each other in one frame, with a divider that is
 * dragged (or moved with the arrow keys) to show more of one or the other. The frame takes the
 * before photo's shape; the after photo fills the same frame.
 */
function SliderCompare({ before, after, turns, split, onSplit }: SliderCompareProps) {
  const [ratios, setRatios] = useState<Readonly<Record<string, number>>>({})
  const dragging = useRef<number>(undefined)
  const beforeUrl = before.urls[before.index]
  const afterUrl = after.urls[after.index]
  const turnOf = (url: string | undefined) => url ? turns[url] ?? 0 : 0
  const naturalRatio = beforeUrl ? ratios[beforeUrl] : undefined
  const ratio = naturalRatio ? (quarterTurns(turnOf(beforeUrl)) % 2 === 1 ? 1 / naturalRatio : naturalRatio) : 4 / 3
  const remember = (url: string, image: HTMLImageElement) => {
    if (image.naturalWidth > 0 && image.naturalHeight > 0) setRatios((value) => ({ ...value, [url]: image.naturalWidth / image.naturalHeight }))
  }
  const move = (event: ReactPointerEvent<HTMLDivElement>) => onSplit(splitAt(event.clientX, event.currentTarget.getBoundingClientRect()))
  const release = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.stopPropagation()
    if (dragging.current === event.pointerId) dragging.current = undefined
  }
  const layer = (url: string | undefined, set: CompareSide) => url && <img
    key={url}
    className={quarterTurns(turnOf(url)) % 2 === 1 ? 'is-sideways' : undefined}
    src={url}
    alt={`${sideName(set.side)}: ${photoAlt(set.label, set.index, set.urls.length)}`}
    draggable={false}
    style={{ rotate: `${turnOf(url) * 90}deg` }}
    onLoad={(event) => remember(url, event.currentTarget)}
  />
  return <div className="photo-viewer-slider">
    <div className="photo-viewer-slider-area">
      <div
        className="photo-viewer-slider-frame"
        style={{ '--ratio': ratio } as CSSProperties}
        onPointerDown={(event) => {
          event.stopPropagation()
          if (event.pointerType === 'mouse' && event.button !== 0) return
          try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* the pointer is already gone */ }
          dragging.current = event.pointerId
          move(event)
        }}
        onPointerMove={(event) => { if (dragging.current === event.pointerId) move(event) }}
        onPointerUp={release}
        onPointerCancel={release}
      >
        <div className="photo-viewer-slider-layer">{layer(beforeUrl, before)}</div>
        <div className="photo-viewer-slider-layer is-after" style={{ clipPath: `inset(0 0 0 ${split}%)` }}>{layer(afterUrl, after)}</div>
        <span className="photo-viewer-slider-tag is-before" aria-hidden="true">{sideName('before')}</span>
        <span className="photo-viewer-slider-tag is-after" aria-hidden="true">{sideName('after')}</span>
        <div className="photo-viewer-slider-divider" style={{ left: `${split}%` }}>
          <div
            className="photo-viewer-slider-handle"
            role="slider"
            tabIndex={0}
            aria-label={t('Divider between before and after')}
            aria-valuemin={SPLIT_MIN}
            aria-valuemax={SPLIT_MAX}
            aria-valuenow={Math.round(split)}
            aria-valuetext={t('{percent}% before', { percent: Math.round(split) })}
          ><ChevronsLeftRight size={18} aria-hidden="true" /></div>
        </div>
      </div>
    </div>
    <div className="photo-viewer-slider-bar">
      <CompareSetBar set={before} />
      <CompareSetBar set={after} />
    </div>
  </div>
}

/**
 * A report photo shown full size over the page, instead of opening it in a new tab. The photo's own
 * colors glow softly behind it. Arrows, the arrow keys, a swipe or the filmstrip move between photos;
 * a click, double tap, pinch, Ctrl+scroll or the zoom buttons zoom in, and a zoomed photo can be
 * dragged, moved with the arrow keys, or moved from the navigator in the corner. Photos can be
 * rotated, brightened, shown full screen, and compared with another set (the report photos and the
 * after-photos) side by side or under a slider. On a phone, a tap hides the controls and a swipe
 * down closes. Escape, the close button or a tap outside the photo closes it, and focus goes back
 * to the thumbnail that opened it. ? lists every shortcut.
 */
export function PhotoViewer({ urls, startIndex = 0, label, caption, isPrivate = false, compareWith, startComparing = false, onClose }: PhotoViewerProps) {
  const count = urls.length
  const titleId = useId()
  const shortcutsId = useId()
  const canCompare = Boolean(compareWith && compareWith.urls.length > 0)
  const canFullscreen = fullscreenSupported()
  const [index, setIndex] = useState(() => Math.max(0, Math.min(count - 1, startIndex)))
  const [direction, setDirection] = useState<'open' | 'next' | 'prev'>('open')
  const [loaded, setLoaded] = useState<Readonly<Record<string, Loaded>>>({})
  const [attempts, setAttempts] = useState<Readonly<Record<string, number>>>({})
  const [turns, setTurns] = useState<Readonly<Record<string, number>>>({})
  const [zoom, setZoom] = useState<ZoomState>(FITTED)
  const [stage, setStage] = useState<Size & { left: number; top: number }>({ width: 0, height: 0, left: 0, top: 0 })
  const [drag, setDrag] = useState(0)
  const [dismiss, setDismiss] = useState(0)
  const [gesturing, setGesturing] = useState(false)
  const [rotating, setRotating] = useState(false)
  const [bright, setBright] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [immersive, setImmersive] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [comparing, setComparing] = useState(() => canCompare && startComparing)
  const [compareView, setCompareView] = useState<CompareView>('side')
  const [compareIndex, setCompareIndex] = useState(0)
  const [split, setSplit] = useState(50)
  const [announcement, setAnnouncement] = useState({ text: '', id: 0 })
  const [closing, setClosing] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const shortcutsCloseRef = useRef<HTMLButtonElement>(null)
  const shortcutsOpenerRef = useRef<HTMLElement | null>(null)
  const pointers = useRef(new Map<number, Point>())
  const gesture = useRef<Gesture>(undefined)
  const lastTap = useRef<{ at: number; point: Point }>(undefined)
  const tapTimer = useRef<number>(undefined)
  const navigatorPointer = useRef<number>(undefined)
  const wheelTimer = useRef<number>(undefined)
  const rotateTimer = useRef<number>(undefined)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  const current = Math.max(0, Math.min(count - 1, index))
  const url = urls[current] as string | undefined
  const state = url ? loaded[url] : 'failed'
  const natural = state && state !== 'failed' ? state.natural : undefined
  const turn = url ? turns[url] ?? 0 : 0
  // `photo` is the box the turned photo takes up; `element` is the <img> itself before it turns.
  const photo = natural ? fitSize(rotatedSize(natural, turn), stage) : { width: 0, height: 0 }
  const element = rotatedSize(photo, turn)
  const ready = Boolean(natural) && photo.width > 0
  const zoomed = zoom.scale > 1.001
  // The photo is fitted inside the stage's padding, but once zoomed it may fill the whole stage,
  // so zooming and panning are measured against the full box (both share the same middle).
  const view: Size = { width: stage.width + stage.left * 2, height: stage.height + stage.top * 2 }
  // The latest sizes and modes, for the window listeners and gestures that outlive a render.
  const live = useRef({ photo, stage: view, zoom, comparing, compareView, url, ready, bright, split, shortcutsOpen, immersive })
  live.current = { photo, stage: view, zoom, comparing, compareView, url, ready, bright, split, shortcutsOpen, immersive }

  /** Tells screen readers what a button or key just changed. */
  const announce = useCallback((text: string) => setAnnouncement((value) => ({ text, id: value.id + 1 })), [])

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
  const setZoomAndSay = useCallback((next: ZoomState) => {
    setZoom(next)
    announce(next.scale > 1.001 ? t('Zoomed to {zoom}', { zoom: zoomLabel(next.scale) }) : t('Showing the whole photo'))
  }, [announce])
  const zoomBy = useCallback((way: 1 | -1) => {
    const { photo: size, stage: area, zoom: now, comparing: sideBySide } = live.current
    if (size.width === 0 || sideBySide) return
    setZoomAndSay(zoomAt(now, stepZoom(now.scale, way), { x: 0, y: 0 }, size, area))
  }, [setZoomAndSay])
  // Each photo keeps its own turn, so going back to one shows it the way it was left.
  const rotate = useCallback((photoUrl: string | undefined, way: 1 | -1 = 1) => {
    if (!photoUrl) return
    setTurns((value) => ({ ...value, [photoUrl]: (value[photoUrl] ?? 0) + way }))
    setZoom(FITTED)
    setRotating(true)
    window.clearTimeout(rotateTimer.current)
    rotateTimer.current = window.setTimeout(() => setRotating(false), ROTATE_MS)
    announce(t('Photo rotated'))
  }, [announce])
  const rotateMain = useCallback((way: 1 | -1 = 1) => {
    const { url: photoUrl, ready: shown, comparing: sideBySide } = live.current
    if (shown && !sideBySide) rotate(photoUrl, way)
  }, [rotate])
  const toggleBright = useCallback(() => {
    const next = !live.current.bright
    setBright(next)
    announce(next ? t('Brighten on') : t('Brighten off'))
  }, [announce])
  const toggleCompare = useCallback(() => {
    if (!canCompare) return
    const next = !live.current.comparing
    setComparing(next)
    setZoom(FITTED)
    setDrag(0)
    announce(next ? t('Comparing before and after') : t('Showing one photo'))
  }, [canCompare, announce])
  const chooseCompareView = useCallback((next: CompareView) => {
    setCompareView(next)
    announce(next === 'slider' ? t('Slider view') : t('Side by side view'))
  }, [announce])
  const toggleFullscreen = useCallback(() => {
    const root = rootRef.current
    if (!fullscreenSupported() || !root) return
    if (document.fullscreenElement === root) void document.exitFullscreen().catch(() => undefined)
    else void root.requestFullscreen().catch(() => undefined)
  }, [])
  const toggleImmersive = useCallback(() => {
    const next = !live.current.immersive
    // The controls are about to disappear, so focus waits on the viewer itself.
    if (next) rootRef.current?.focus({ preventScroll: true })
    setImmersive(next)
    announce(next ? t('Controls hidden') : t('Controls shown'))
  }, [announce])
  const openShortcuts = useCallback(() => {
    shortcutsOpenerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setImmersive(false)
    setShortcutsOpen(true)
  }, [])
  const closeShortcuts = useCallback(() => {
    setShortcutsOpen(false)
    const opener = shortcutsOpenerRef.current
    window.requestAnimationFrame(() => (opener?.isConnected ? opener : rootRef.current)?.focus({ preventScroll: true }))
  }, [])

  // Focus moves into the viewer, and back to whatever opened it once it closes.
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    closeRef.current?.focus({ preventScroll: true })
    closeOpenViewer = requestClose
    return () => {
      if (closeOpenViewer === requestClose) closeOpenViewer = undefined
      window.clearTimeout(rotateTimer.current)
      window.clearTimeout(tapTimer.current)
      opener?.focus({ preventScroll: true })
    }
  }, [requestClose])

  useEffect(() => {
    if (shortcutsOpen) shortcutsCloseRef.current?.focus({ preventScroll: true })
  }, [shortcutsOpen])

  // Full screen follows the browser (Escape leaves it there too) and ends with the viewer.
  useEffect(() => {
    const root = rootRef.current
    if (!root || !fullscreenSupported()) return
    const onChange = () => setFullscreen(document.fullscreenElement === root)
    document.addEventListener('fullscreenchange', onChange)
    return () => {
      document.removeEventListener('fullscreenchange', onChange)
      if (document.fullscreenElement === root) void document.exitFullscreen().catch(() => undefined)
    }
  }, [])

  // Escape closes only the viewer (or the shortcut list first), not the dialog or page behind it.
  // Left and right change the photo, or move it once zoomed; plus, minus and 0 zoom; R rotates,
  // B brightens, F goes full screen, C compares, S switches the comparison, H hides the controls,
  // and ? lists all of them. On the slider's divider, the arrows move the divider.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // Tab goes on to the app's focus trap (useDialogFocusTrap), which keeps focus in the viewer.
      if (event.key === 'Tab') return
      // Nothing behind the viewer answers the keyboard while it is open: not the staff queue's
      // shortcuts, the command palette, or the Escape handling of the layers underneath.
      event.stopPropagation()
      if (event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return
      const key = event.key
      const { photo: size, stage: area, zoom: now, comparing: sideBySide, split: divider, shortcutsOpen: listing } = live.current
      const onSlider = event.target instanceof Element && event.target.closest('.photo-viewer-slider-handle')
      const slid = onSlider ? splitAfterKey(divider, key, event.shiftKey) : undefined
      if (slid !== undefined) setSplit(slid)
      else if (key === 'Escape') {
        if (listing) closeShortcuts()
        else requestClose()
      } else if (key === '?') {
        if (listing) closeShortcuts()
        else openShortcuts()
      } else if (key.startsWith('Arrow') && now.scale > 1.001 && !sideBySide) {
        const amount = event.shiftKey ? PAN_STEP * 3 : PAN_STEP
        const dx = key === 'ArrowLeft' ? amount : key === 'ArrowRight' ? -amount : 0
        const dy = key === 'ArrowUp' ? amount : key === 'ArrowDown' ? -amount : 0
        setZoom(panBy(now, dx, dy, size, area))
      } else if (key === 'ArrowLeft' && count > 1) step(-1)
      else if (key === 'ArrowRight' && count > 1) step(1)
      else if (key === '+' || key === '=') zoomBy(1)
      else if (key === '-' || key === '_') zoomBy(-1)
      else if (key === '0') {
        if (now.scale > 1.001) setZoomAndSay(FITTED)
      } else if (key === 'r' || key === 'R') rotateMain(key === 'R' ? -1 : 1)
      else if (key === 'b' || key === 'B') toggleBright()
      else if (key === 'f' || key === 'F') toggleFullscreen()
      else if (key === 'c' || key === 'C') toggleCompare()
      else if ((key === 's' || key === 'S') && sideBySide) chooseCompareView(live.current.compareView === 'side' ? 'slider' : 'side')
      else if (key === 'h' || key === 'H') toggleImmersive()
      else return
      event.preventDefault()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [count, requestClose, step, zoomBy, setZoomAndSay, rotateMain, toggleBright, toggleFullscreen, toggleCompare, chooseCompareView, toggleImmersive, openShortcuts, closeShortcuts])

  // The page behind never scrolls under the viewer. Over the photo, Ctrl+scroll (and a trackpad
  // pinch, which arrives the same way) zooms at the pointer, and scrolling moves a zoomed photo.
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const area = stageRef.current
      const { photo: size, stage: box, zoom: now, comparing: sideBySide } = live.current
      if (!area || size.width === 0 || sideBySide || !area.contains(event.target as Node)) return
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
      const next = clampPan(now, { width: photo.width, height: photo.height }, { width: view.width, height: view.height })
      return next.scale === now.scale && next.x === now.x && next.y === now.y ? now : next
    })
  }, [photo.width, photo.height, view.width, view.height])

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
    if (target.closest('button, .photo-viewer-navigator, .photo-viewer-pane-bar, .photo-viewer-slider') || (event.pointerType === 'mouse' && event.button !== 0)) return
    try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* the pointer is already gone */ }
    pointers.current.set(event.pointerId, stagePoint(event.clientX, event.clientY))
    if (pointers.current.size === 1) {
      gesture.current = {
        kind: 'press',
        startClient: { x: event.clientX, y: event.clientY },
        startTime: event.timeStamp,
        startZoom: live.current.zoom,
        onPhoto: Boolean(target.closest('img')),
        onContent: Boolean(target.closest('img, .photo-viewer-missing, .photo-viewer-pane-missing')),
        moved: false,
        touch: event.pointerType !== 'mouse',
      }
    } else if (pointers.current.size === 2 && live.current.photo.width > 0 && !comparing) {
      const { mid, spread } = firstTwo()
      gesture.current = { kind: 'pinch', startZoom: live.current.zoom, startMid: mid, startSpread: spread }
      setDrag(0)
      setDismiss(0)
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
    if (comparing) return
    if (now.startZoom.scale > 1.001) {
      setGesturing(true)
      setZoom(panBy(now.startZoom, dx, dy, size, box))
      return
    }
    if (!now.touch) return
    // At the whole-photo view a finger drag goes one way only: sideways to change the photo, which
    // follows the finger, or down to close, with the viewer fading as the photo is pulled away.
    now.axis ??= dragAxis(dx, dy)
    if (now.axis === 'x' && count > 1) {
      setGesturing(true)
      setDrag(dx)
    } else if (now.axis === 'y') {
      setGesturing(true)
      setDismiss(Math.max(0, dy))
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
        gesture.current = { kind: 'press', startClient: client, startTime: event.timeStamp, startZoom: live.current.zoom, onPhoto: true, onContent: true, moved: true, touch: true }
      } else if (pointers.current.size === 0) {
        gesture.current = undefined
        setGesturing(false)
      }
      return
    }
    gesture.current = undefined
    setGesturing(false)
    setDrag(0)
    if (now?.kind !== 'press' || event.type === 'pointercancel') {
      setDismiss(0)
      return
    }
    const dx = event.clientX - now.startClient.x
    const dy = event.clientY - now.startClient.y
    if (now.axis === 'y') {
      // A swipe down far or fast enough closes; the photo stays where it was let go while it fades.
      if (shouldDismiss(dy, dy / Math.max(1, event.timeStamp - now.startTime))) requestClose()
      else setDismiss(0)
      return
    }
    if (!comparing && now.axis === 'x' && count > 1 && Math.abs(dx) >= SWIPE_DISTANCE) {
      step(dx < 0 ? 1 : -1)
      return
    }
    if (now.moved) return
    if (!now.onContent) {
      requestClose()
      return
    }
    if (!now.onPhoto || comparing) return
    const point = stagePoint(event.clientX, event.clientY)
    if (!now.touch) {
      toggleZoomAt(point)
      return
    }
    // On a touch screen one tap hides or shows the controls, and two taps zoom. The single tap
    // waits until a second one can no longer come.
    const previous = lastTap.current
    const at = event.timeStamp
    window.clearTimeout(tapTimer.current)
    if (previous && at - previous.at < DOUBLE_TAP_MS && Math.hypot(point.x - previous.point.x, point.y - previous.point.y) < DOUBLE_TAP_SLOP) {
      lastTap.current = undefined
      toggleZoomAt(point)
    } else {
      lastTap.current = { at, point }
      tapTimer.current = window.setTimeout(() => {
        lastTap.current = undefined
        setImmersive((value) => !value)
      }, DOUBLE_TAP_MS)
    }
  }

  // The navigator: a small copy of the photo with the part on screen outlined. Pressing or dragging
  // on it moves that part.
  const navigatorScale = ready ? Math.min(NAVIGATOR_MAX.width / photo.width, NAVIGATOR_MAX.height / photo.height) : 0
  const navigatorBox = { width: photo.width * navigatorScale, height: photo.height * navigatorScale }
  const navigatorImage = rotatedSize(navigatorBox, turn)
  const region = visibleRegion(zoom, photo, view)
  const panFromNavigator = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const { photo: size, stage: area, zoom: now } = live.current
    setZoom(centerOn(now, { x: clamp01((event.clientX - rect.left) / rect.width), y: clamp01((event.clientY - rect.top) / rect.height) }, size, area))
  }
  const releaseNavigator = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.stopPropagation()
    if (navigatorPointer.current !== event.pointerId) return
    navigatorPointer.current = undefined
    setGesturing(false)
  }

  const alt = photoAlt(label, current, count)
  const attempt = attempts[url] ?? 0
  const photoClass = [ready ? 'is-loaded' : '', `is-from-${direction}`, zoomed ? 'is-zoomed' : '', rotating ? 'is-rotating' : ''].filter(Boolean).join(' ')
  const zoomDisabled = !ready || comparing
  const dismissing = dismissProgress(dismiss)
  const compareSet = compareWith && canCompare ? compareWith : undefined
  const compareSides: CompareSide[] = compareSet ? [
    { side: compareSet.side, label: compareSet.label, urls: compareSet.urls, index: Math.min(compareIndex, compareSet.urls.length - 1), onStep: (delta) => setCompareIndex((value) => (value + delta + compareSet.urls.length) % compareSet.urls.length) },
    { side: compareSet.side === 'before' ? 'after' : 'before', label, urls, index: current, onStep: step },
  ] : []
  const beforeSide = compareSides.find((set) => set.side === 'before')
  const afterSide = compareSides.find((set) => set.side === 'after')
  const rootClass = ['photo-viewer', closing ? 'is-closing' : '', gesturing ? 'is-gesturing' : '', bright ? 'is-brightened' : '', comparing ? 'is-comparing' : '', immersive ? 'is-immersive' : ''].filter(Boolean).join(' ')
  const shortcuts: [string[], string][] = [
    ...(count > 1 ? [[['←', '→'], t('Previous or next photo')] as [string[], string]] : []),
    [['+', '−'], t('Zoom in or out')],
    [['0'], t('Fit the whole photo')],
    [['↑', '↓', '←', '→'], t('Move a zoomed photo')],
    [['R'], t('Rotate')],
    [['Shift', 'R'], t('Rotate the other way')],
    [['B'], t('Brighten')],
    ...(canCompare ? [[['C'], t('Compare before and after')] as [string[], string], [['S'], t('Switch between side by side and slider')] as [string[], string]] : []),
    ...(canFullscreen ? [[['F'], t('Full screen')] as [string[], string]] : []),
    [['H'], t('Hide or show the controls')],
    [['?'], t('Show these shortcuts')],
    [['Esc'], t('Close')],
  ]

  return createPortal(<div
    ref={rootRef}
    className={rootClass}
    role="dialog"
    aria-modal="true"
    aria-labelledby={titleId}
    tabIndex={-1}
    style={{ '--dismiss': dismissing } as CSSProperties}
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
        <span className="photo-viewer-icon" aria-hidden="true">{comparing ? <Columns2 size={18} /> : <Camera size={18} />}</span>
        <div className="photo-viewer-titles">
          <h2 id={titleId} className="photo-viewer-title">
            <span>{comparing ? t('Before and after') : label}</span>
            {count > 1 && !comparing && <span className="photo-viewer-count" aria-label={t('Photo {number} of {total}', { number: current + 1, total: count })}>{current + 1} / {count}</span>}
          </h2>
          {caption && <p className="photo-viewer-caption">{caption}</p>}
        </div>
      </div>
      <div className="photo-viewer-tools">
        {comparing && <div className="photo-viewer-segmented" role="group" aria-label={t('Comparison view')}>
          <button type="button" onClick={() => chooseCompareView('side')} aria-pressed={compareView === 'side'} title={t('Side by side (S)')}><Columns2 size={16} aria-hidden="true" /><span>{t('Side by side')}</span></button>
          <button type="button" onClick={() => chooseCompareView('slider')} aria-pressed={compareView === 'slider'} title={t('Slider (S)')}><ChevronsLeftRight size={16} aria-hidden="true" /><span>{t('Slider')}</span></button>
        </div>}
        {canCompare && <button className="photo-viewer-compare-toggle" type="button" onClick={toggleCompare} aria-pressed={comparing} title={t('Compare before and after (C)')}><Columns2 size={17} aria-hidden="true" /><span>{t('Compare')}</span></button>}
        <div className="photo-viewer-group photo-viewer-actions" role="group" aria-label={t('Photo tools')}>
          <button type="button" onClick={() => rotateMain()} aria-disabled={!ready || comparing} aria-label={t('Rotate')} title={t('Rotate (R)')}><RotateCw size={17} aria-hidden="true" /></button>
          <button type="button" onClick={toggleBright} aria-pressed={bright} aria-label={t('Brighten')} title={t('Brighten (B)')}><Sun size={17} aria-hidden="true" /></button>
          {canFullscreen && <button className="photo-viewer-fullscreen" type="button" onClick={toggleFullscreen} aria-pressed={fullscreen} aria-label={t('Full screen')} title={fullscreen ? t('Exit full screen (F)') : t('Full screen (F)')}>{fullscreen ? <Minimize2 size={17} aria-hidden="true" /> : <Maximize2 size={17} aria-hidden="true" />}</button>}
        </div>
        <div className="photo-viewer-group photo-viewer-zoom" role="group" aria-label={t('Zoom')}>
          <button type="button" onClick={() => zoomBy(-1)} aria-disabled={zoomDisabled || !zoomed} aria-label={t('Zoom out')} title={t('Zoom out (−)')}><ZoomOut size={17} aria-hidden="true" /></button>
          <button className="photo-viewer-zoom-level" type="button" onClick={() => { if (zoomed) setZoomAndSay(FITTED) }} aria-disabled={zoomDisabled || !zoomed} aria-label={zoomed ? t('Zoomed to {zoom}. Fit the whole photo', { zoom: zoomLabel(zoom.scale) }) : t('Showing the whole photo')} title={t('Fit the whole photo (0)')}>{zoomLabel(zoom.scale)}</button>
          <button type="button" onClick={() => zoomBy(1)} aria-disabled={zoomDisabled || zoom.scale >= MAX_ZOOM - 0.001} aria-label={t('Zoom in')} title={t('Zoom in (+)')}><ZoomIn size={17} aria-hidden="true" /></button>
        </div>
        <button ref={closeRef} className="photo-viewer-close" type="button" onClick={requestClose} aria-label={t('Close photo')} title={t('Close (Esc)')}><X size={20} aria-hidden="true" /></button>
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
      {comparing && beforeSide && afterSide ? (compareView === 'slider'
        ? <SliderCompare before={beforeSide} after={afterSide} turns={turns} split={split} onSplit={setSplit} />
        : <div className="photo-viewer-compare">
          {[beforeSide, afterSide].map((set) => <ComparePane key={set.side} set={set} turn={turns[set.urls[set.index]] ?? 0} onRotate={() => rotate(set.urls[set.index])} />)}
        </div>
      ) : <>
        {state === 'failed'
          ? <div className="photo-viewer-missing">
            <span className="photo-viewer-missing-icon" aria-hidden="true"><ImageOff size={26} /></span>
            <strong>{t('This photo could not be loaded')}</strong>
            <span>{t('Check your connection, then try again.')}</span>
            <button type="button" onClick={() => retry(url)}><RotateCw size={15} aria-hidden="true" /> {t('Try again')}</button>
          </div>
          : <img
            key={`${url}#${attempt}`}
            className={photoClass}
            src={url}
            alt={alt}
            decoding="async"
            draggable={false}
            style={ready ? {
              width: element.width,
              height: element.height,
              left: stage.left + (stage.width - element.width) / 2,
              top: stage.top + (stage.height - element.height) / 2,
              transform: `translate3d(${zoom.x + drag}px, ${zoom.y + dismiss}px, 0) scale(${zoom.scale * (1 - dismissing * DISMISS_SHRINK)}) rotate(${turn * 90}deg)`,
            } : undefined}
            onLoad={(event) => mark(url, { natural: { width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight } })}
            onError={() => mark(url, 'failed')}
          />}
        {!state && <div className="photo-viewer-loading" role="status"><span className="photo-viewer-spinner" aria-hidden="true" />{t('Loading photo…')}</div>}
        {count > 1 && <>
          <button className="photo-viewer-nav is-prev" type="button" onClick={() => step(-1)} aria-label={t('Previous photo')} title={t('Previous (←)')}><ChevronLeft size={26} aria-hidden="true" /></button>
          <button className="photo-viewer-nav is-next" type="button" onClick={() => step(1)} aria-label={t('Next photo')} title={t('Next (→)')}><ChevronRight size={26} aria-hidden="true" /></button>
        </>}
        {ready && zoomed && <div
          className="photo-viewer-navigator"
          aria-hidden="true"
          style={{ width: navigatorBox.width, height: navigatorBox.height }}
          onPointerDown={(event) => {
            event.stopPropagation()
            try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* the pointer is already gone */ }
            navigatorPointer.current = event.pointerId
            setGesturing(true)
            panFromNavigator(event)
          }}
          onPointerMove={(event) => { if (navigatorPointer.current === event.pointerId) panFromNavigator(event) }}
          onPointerUp={releaseNavigator}
          onPointerCancel={releaseNavigator}
        >
          <img src={url} alt="" draggable={false} style={{ width: navigatorImage.width, height: navigatorImage.height, rotate: `${turn * 90}deg` }} />
          <span className="photo-viewer-navigator-view" style={{ left: `${region.left * 100}%`, top: `${region.top * 100}%`, width: `${region.width * 100}%`, height: `${region.height * 100}%` }} />
        </div>}
      </>}
    </div>

    <footer className="photo-viewer-footer">
      {isPrivate && <span className="photo-viewer-private"><Lock size={12} strokeWidth={2.4} aria-hidden="true" />{t('Private')}<span className="photo-viewer-private-detail"> {t('· only staff and the reporter can see this photo')}</span></span>}
      {count > 1 && <div className="photo-viewer-filmstrip" role="group" aria-label={t('All photos')}>
        {urls.map((thumb, photoIndex) => <button
          key={thumb}
          type="button"
          className={photoIndex === current ? 'is-active' : undefined}
          onClick={() => { if (photoIndex !== current) show(photoIndex, photoIndex > current ? 'next' : 'prev') }}
          aria-label={t('Show photo {number} of {total}', { number: photoIndex + 1, total: count })}
          aria-current={photoIndex === current ? 'true' : undefined}
        >
          {loaded[thumb] === 'failed' ? <ImageOff size={16} aria-hidden="true" /> : <img src={thumb} alt="" draggable={false} />}
        </button>)}
      </div>}
      <div className="photo-viewer-hints is-pointer">
        {/* Zoom and rotate work on the single photo, so those hints step aside while comparing. */}
        {!comparing && <span aria-hidden="true">{t('Click or')} <kbd>+</kbd><kbd>−</kbd> {t('Zoom')}</span>}
        {!comparing && <span aria-hidden="true"><kbd>R</kbd> {t('Rotate')}</span>}
        <button className="photo-viewer-shortcuts-button" type="button" onClick={openShortcuts} aria-haspopup="dialog" aria-expanded={shortcutsOpen}><kbd aria-hidden="true">?</kbd> {t('All shortcuts')}</button>
      </div>
      {!comparing && <p className="photo-viewer-hints is-touch" aria-hidden="true">
        <span>{count > 1 ? `${t('Swipe to browse')} · ` : ''}{t('Double-tap or pinch to zoom')} · {t('Swipe down to close')}</span>
      </p>}
    </footer>

    {shortcutsOpen && <div className="photo-viewer-shortcuts-scrim" onPointerDown={(event) => { if (event.target === event.currentTarget) closeShortcuts() }}>
      <section className="photo-viewer-shortcuts" role="dialog" aria-labelledby={shortcutsId}>
        <header>
          <h3 id={shortcutsId}>{t('Keyboard shortcuts')}</h3>
          <button ref={shortcutsCloseRef} type="button" onClick={closeShortcuts} aria-label={t('Close shortcuts')}><X size={16} aria-hidden="true" /></button>
        </header>
        <dl>
          {shortcuts.map(([keys, action]) => <div key={action}>
            <dt>{keys.map((key) => <kbd key={key}>{key}</kbd>)}</dt>
            <dd>{action}</dd>
          </div>)}
        </dl>
      </section>
    </div>}

    <p className="sr-only" aria-live="polite" aria-atomic="true"><span key={announcement.id}>{announcement.text}</span></p>
  </div>, document.body)
}
