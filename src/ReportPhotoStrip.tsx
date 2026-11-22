import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Globe, Hourglass, ImageOff, Lock } from 'lucide-react'
import { motionIsReduced } from './display-prefs'
import { PhotoViewer } from './PhotoViewer'
import type { PhotoSharing, ReportPhotos } from './lib/report-photo-access'

type ReportPhotoStripProps = {
  reportId: string
  /** Resolves to the photo links this viewer may see, and how they are shared; no links shows nothing. */
  load: (reportId: string) => Promise<ReportPhotos>
  /** 'banner' runs edge to edge across the top of the map popup; 'inline' sits inside the phone's report sheet. */
  variant: 'banner' | 'inline'
  /** Called once it is known how many photos there are, after their space is laid out. */
  onReady?: (count: number) => void
  /** Context under the photo viewer's heading, such as the report's title. */
  caption?: string
}

/** The badge on a report photo: who can see it. */
export const PHOTO_SHARING_BADGES: Record<PhotoSharing, { label: string; title: string }> = {
  private: { label: 'Private', title: 'Only the reporter, responders and admins can see this photo. It is not shown to the public.' },
  public: { label: 'Public', title: 'The reporter shared this photo publicly. Anyone viewing the map can see it.' },
  'public-after-review': { label: 'Public after review', title: 'The reporter chose to share this photo publicly. Everyone will see it once staff verify the report; until then only the reporter, responders and admins can.' },
}

export function PhotoSharingBadge({ sharing, className }: { sharing: PhotoSharing; className: string }) {
  const badge = PHOTO_SHARING_BADGES[sharing]
  const Icon = sharing === 'private' ? Lock : sharing === 'public' ? Globe : Hourglass
  return <span className={`${className} is-${sharing}`} title={badge.title}><Icon size={10} strokeWidth={2.6} aria-hidden="true" />{badge.label}<span className="sr-only">: {badge.title}</span></span>
}

/**
 * The reporter's photos in a report preview: one at a time, swipeable, each opening full size in
 * the photo viewer. It shows nothing until the photos are known, and nothing at all for a viewer who may
 * not see them. A badge says who can see the photos.
 */
export function ReportPhotoStrip({ reportId, load, variant, onReady, caption }: ReportPhotoStripProps) {
  const [photos, setPhotos] = useState<{ reportId: string } & ReportPhotos>()
  const [index, setIndex] = useState(0)
  const [loaded, setLoaded] = useState<ReadonlySet<number>>(new Set())
  const [failed, setFailed] = useState<ReadonlySet<number>>(new Set())
  const [viewing, setViewing] = useState<number>()
  const trackRef = useRef<HTMLDivElement>(null)
  const onReadyRef = useRef(onReady)
  onReadyRef.current = onReady

  useEffect(() => {
    let active = true
    setIndex(0)
    setLoaded(new Set())
    setFailed(new Set())
    setViewing(undefined)
    load(reportId).then(
      (result) => { if (active) setPhotos({ reportId, ...result }) },
      () => { if (active) setPhotos({ reportId, urls: [], sharing: 'private' }) },
    )
    return () => { active = false }
  }, [reportId, load])

  const urls = photos?.reportId === reportId ? photos.urls : undefined
  const sharing = photos?.sharing ?? 'private'
  useLayoutEffect(() => {
    if (urls) onReadyRef.current?.(urls.length)
  }, [urls])
  if (!urls || urls.length === 0) return null

  const count = urls.length
  const go = (next: number) => {
    const track = trackRef.current
    if (!track) return
    const target = Math.max(0, Math.min(count - 1, next))
    // The arrows set the position themselves; scrolling keeps it in step for swipes.
    setIndex(target)
    track.scrollTo({ left: target * track.clientWidth, behavior: motionIsReduced() ? 'auto' : 'smooth' })
  }
  const mark = (set: (update: (current: ReadonlySet<number>) => ReadonlySet<number>) => void, photo: number) => set((current) => new Set(current).add(photo))

  return <div className={`report-photos is-${variant}`} role="group" aria-label={count > 1 ? `${count} photos from the reporter` : 'Photo from the reporter'}>
    <div className="report-photos-track" ref={trackRef} onScroll={(event) => setIndex(Math.round(event.currentTarget.scrollLeft / Math.max(1, event.currentTarget.clientWidth)))}>
      {urls.map((url, photo) => <button
        key={url}
        type="button"
        className={`report-photo${loaded.has(photo) ? ' is-loaded' : ''}${failed.has(photo) ? ' is-failed' : ''}`}
        onClick={() => { if (!failed.has(photo)) setViewing(photo) }}
        title={failed.has(photo) ? undefined : 'View the full photo'}
        tabIndex={photo === index ? 0 : -1}
      >
        {failed.has(photo)
          ? <span className="report-photo-missing"><ImageOff size={18} aria-hidden="true" />Photo unavailable</span>
          : <img src={url} alt={count > 1 ? `Photo ${photo + 1} of ${count} from the reporter` : 'Photo from the reporter'} loading={photo === 0 ? 'eager' : 'lazy'} decoding="async" draggable={false} onLoad={() => mark(setLoaded, photo)} onError={() => mark(setFailed, photo)} />}
      </button>)}
    </div>
    <PhotoSharingBadge sharing={sharing} className="report-photos-private" />
    {count > 1 && <>
      <span className="report-photos-count" aria-live="polite">{index + 1} / {count}</span>
      <button className="report-photos-nav is-prev" type="button" onClick={() => go(index - 1)} disabled={index === 0} aria-label="Previous photo"><ChevronLeft size={16} aria-hidden="true" /></button>
      <button className="report-photos-nav is-next" type="button" onClick={() => go(index + 1)} disabled={index === count - 1} aria-label="Next photo"><ChevronRight size={16} aria-hidden="true" /></button>
    </>}
    {viewing !== undefined && <PhotoViewer urls={urls} startIndex={viewing} label="Photo from the reporter" caption={caption} isPrivate={sharing !== 'public'} onClose={() => setViewing(undefined)} />}
  </div>
}
