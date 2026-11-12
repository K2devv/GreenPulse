import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Map as MapView, Marker, Popup, type ErrorEvent as MapErrorEvent, type MapInstance, type MapRef, type PopupInstance } from '@vis.gl/react-maplibre'
import { MapPin as MapPinIcon, MessageSquare, UserRound, X, type LucideIcon } from 'lucide-react'
import { GPUInitializationError, mapLib } from './map-engine'
import { ClusterBubble, MAP_FOCUS_ZOOM, MAP_MAX_ZOOM, MapPin, MapUnavailable, MapZoomControls, PIN_OFFSET, UserDot, cameraDuration, lockNorthUp, statusSlug, useDistrictLock } from './MapParts'
import { barangayBounds, barangayCamera } from './lib/barangay-camera'
import { districtFeatures, type DistrictOutline } from './lib/district-outline'
import { CLUSTER_MAX_ZOOM, clusterRingGradient, createClusterIndex, type MapClusterItem, type MapPoint } from './lib/map-clusters'
import { buildMapStyle, VECTOR_SOURCE_ID, type Basemap, type HeatCell, type MapTheme } from './lib/map-style'
import type { Bounds, Padding } from './lib/map-viewport'

/** A report as the incident map draws it. */
export type MapReport = {
  id: string
  title: string
  category: string
  status: string
  description: string
  reporterName?: string
  /** Generalized place label, for example "Barangay Gulod". */
  place: string
  createdLabel: string
  /** Where the pin is drawn, as [latitude, longitude]. Already approximate. */
  position: [number, number]
  /** Open and high urgency. */
  urgent: boolean
  /** False for resolved, closed, rejected and duplicate reports. */
  open: boolean
  color: string
  icon: LucideIcon
}

type ReportMapProps = {
  theme: MapTheme
  outline: DistrictOutline
  reports: readonly MapReport[]
  /** Category colors and legend order, for the cluster rings. */
  categoryColors: Readonly<Record<string, string>>
  categoryOrder: readonly string[]
  selectedId?: string
  /** A place to center on, as [latitude, longitude]. Ignored while a report is selected. */
  focus?: [number, number]
  /**
   * Fit the map to a barangay ('' fits the whole district). Each request has its own `seq`, so
   * choosing the same barangay again after moving the map fits it again.
   */
  fitBarangay?: { seq: number; barangay: string }
  /** Report density cells; empty hides them. */
  heatCells: readonly HeatCell[]
  gpsLocation?: [number, number]
  /** Phone layout: the app shows its own bottom sheet, so pins do not open a popup. */
  compact: boolean
  onSelect: (id: string) => void
  onDiscuss: (id: string) => void
}

type View = { zoom: number; bounds: Bounds }

// Room for the search box and buttons along the top and the legend and attribution along the bottom.
const DESKTOP_PADDING: Padding = { top: 64, right: 24, bottom: 46, left: 24 }
const COMPACT_PADDING: Padding = { top: 58, right: 12, bottom: 42, left: 12 }
const GPS_ACCURACY_METERS = 55
// Where a selected pin lands, relative to the middle of the map: lower on large screens so its
// popup fits above it, higher on phones so the bottom sheet does not cover it.
const DESKTOP_FOCUS_OFFSET: [number, number] = [0, 90]
const COMPACT_FOCUS_OFFSET: [number, number] = [0, -70]
/** Pins within this share of a screen outside the view stay mounted, so short pans do not pop them in. */
const VIEW_MARGIN = 0.3
// Clears the selected pin, which is drawn larger (about 62 px tall) and lifted.
const POPUP_OFFSET = {
  bottom: [0, -68], 'bottom-left': [12, -62], 'bottom-right': [-12, -62],
  top: [0, 10], 'top-left': [8, 8], 'top-right': [-8, 8],
  left: [28, -36], right: [-28, -36], center: [0, -36],
} satisfies Record<string, [number, number]>

function readView(map: MapInstance): View {
  const bounds = map.getBounds()
  const marginX = (bounds.getEast() - bounds.getWest()) * VIEW_MARGIN
  const marginY = (bounds.getNorth() - bounds.getSouth()) * VIEW_MARGIN
  return { zoom: map.getZoom(), bounds: [bounds.getWest() - marginX, bounds.getSouth() - marginY, bounds.getEast() + marginX, bounds.getNorth() + marginY] }
}

export default function ReportMap({ theme, outline, reports, categoryColors, categoryOrder, selectedId, focus, fitBarangay, heatCells, gpsLocation, compact, onSelect, onDiscuss }: ReportMapProps) {
  const mapRef = useRef<MapRef>(null)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const [basemap, setBasemap] = useState<Basemap>('vector')
  const vectorTileLoaded = useRef(false)
  const [view, setView] = useState<View | null>(null)
  const [popupId, setPopupId] = useState<string>()
  // A popup opened from the keyboard takes focus, so its buttons are the next thing reached.
  const [popupFromKeyboard, setPopupFromKeyboard] = useState(false)
  const popupRef = useRef<PopupInstance>(null)
  // Pins arrive in a short stagger on first load; later ones (after a zoom or filter change) just pop in.
  const [introduced, setIntroduced] = useState(false)
  const padding = compact ? COMPACT_PADDING : DESKTOP_PADDING
  const { lock, measure } = useDistrictLock(outline.bounds, padding)

  const district = useMemo(() => districtFeatures(outline), [outline])
  const gps = useMemo(() => (gpsLocation ? { latitude: gpsLocation[0], longitude: gpsLocation[1], accuracyMeters: GPS_ACCURACY_METERS } : null), [gpsLocation])
  const mapStyle = useMemo(
    () => buildMapStyle({ theme, basemap, district, heatCells, gps, latitude: (outline.bounds[1] + outline.bounds[3]) / 2 }),
    [theme, basemap, district, heatCells, gps, outline.bounds],
  )

  const reportsById = useMemo(() => new Map(reports.map((report) => [report.id, report])), [reports])
  const selected = selectedId ? reportsById.get(selectedId) : undefined
  // The selected report is left out of the clusters so its pin is always visible.
  const clusterIndex = useMemo(() => createClusterIndex(reports.filter((report) => report.id !== selectedId).map((report): MapPoint => ({
    id: report.id, latitude: report.position[0], longitude: report.position[1], category: report.category, urgent: report.urgent,
  }))), [reports, selectedId])
  const { clusters, pins } = useMemo(() => {
    const items = view ? clusterIndex.itemsAt(view.zoom, view.bounds) : []
    const single: MapReport[] = []
    const grouped: MapClusterItem[] = []
    for (const item of items) {
      if (item.kind === 'cluster') grouped.push(item)
      else {
        const report = reportsById.get(item.id)
        if (report) single.push(report)
      }
    }
    if (selected) single.push(selected)
    // North to south, so a pin lower on the screen overlaps the one behind it.
    single.sort((first, second) => second.position[0] - first.position[0])
    return { clusters: grouped, pins: single }
  }, [clusterIndex, reportsById, selected, view])

  const refreshView = useCallback(() => {
    const map = mapRef.current?.getMap()
    if (map) setView(readView(map))
  }, [])

  const handleLoad = useCallback(() => {
    const map = mapRef.current?.getMap()
    if (!map) return
    lockNorthUp(map)
    measure(map)
    setView(readView(map))
    setReady(true)
  }, [measure])

  useEffect(() => {
    if (!ready) return
    const timer = window.setTimeout(() => setIntroduced(true), 900)
    return () => window.clearTimeout(timer)
  }, [ready])

  // A new outline or layout (for example boundaries arriving from the database, or the phone
  // layout switching) changes the lock, so fit the district again.
  const fittedFor = useRef<{ bounds: Bounds; padding: Padding } | null>(null)
  useEffect(() => {
    const map = mapRef.current?.getMap()
    if (!map || !ready) return
    const previous = fittedFor.current
    fittedFor.current = { bounds: outline.bounds, padding }
    if (!previous || (previous.bounds === outline.bounds && previous.padding === padding)) return
    const next = measure(map)
    if (next) map.jumpTo({ center: next.center, zoom: next.zoom })
  }, [measure, outline.bounds, padding, ready])

  const selectedLatitude = selected?.position[0]
  const selectedLongitude = selected?.position[1]
  const focusLatitude = focus?.[0]
  const focusLongitude = focus?.[1]
  const hasSelection = Boolean(selected)
  const fitSeq = fitBarangay?.seq ?? 0
  // The most recent user intent wins the camera. Each input is stamped when it changes (before the
  // map is ready too), and an older intent does not move the camera over a newer one.
  const intentClock = useRef(0)
  const intentStamp = useRef({ selection: 0, focus: 0, fit: 0 })
  useEffect(() => { if (selectedId) intentStamp.current.selection = ++intentClock.current }, [selectedId])
  useEffect(() => { if (focusLatitude !== undefined) intentStamp.current.focus = ++intentClock.current }, [focusLatitude, focusLongitude])
  useEffect(() => { if (fitSeq) intentStamp.current.fit = ++intentClock.current }, [fitSeq])

  useEffect(() => {
    const map = mapRef.current?.getMap()
    if (!map || !ready || selectedLatitude === undefined || selectedLongitude === undefined) return
    if (intentStamp.current.fit > intentStamp.current.selection) return
    map.flyTo({
      center: [selectedLongitude, selectedLatitude],
      zoom: Math.max(map.getZoom(), MAP_FOCUS_ZOOM),
      offset: compact ? COMPACT_FOCUS_OFFSET : DESKTOP_FOCUS_OFFSET,
      duration: cameraDuration(650),
    })
    // The layout is read when the selection changes; switching layouts should not move the map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, selectedId, selectedLatitude, selectedLongitude])

  useEffect(() => {
    const map = mapRef.current?.getMap()
    if (!map || !ready || hasSelection || focusLatitude === undefined || focusLongitude === undefined) return
    if (intentStamp.current.fit > intentStamp.current.focus) return
    map.flyTo({ center: [focusLongitude, focusLatitude], zoom: Math.max(map.getZoom(), MAP_FOCUS_ZOOM), duration: cameraDuration(650) })
    // Clearing a selection should not send the map back to an old search result, so the
    // selection is deliberately not a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, focusLatitude, focusLongitude])

  // A barangay filter fits the map to that barangay, or back to the district for "All barangays".
  // It runs once per request, so a resize or a new outline does not re-run it and move the map.
  const fittedSeq = useRef(0)
  useEffect(() => {
    const map = mapRef.current?.getMap()
    if (!map || !ready || !lock || !fitBarangay || fitBarangay.seq === fittedSeq.current) return
    const stamp = intentStamp.current
    // A newer pin selection (or search result while nothing is selected) already took the camera.
    if ((hasSelection && stamp.selection > stamp.fit) || (!hasSelection && stamp.focus > stamp.fit)) { fittedSeq.current = fitBarangay.seq; return }
    fittedSeq.current = fitBarangay.seq
    if (!fitBarangay.barangay) {
      map.easeTo({ center: lock.center, zoom: lock.zoom, duration: cameraDuration(650) })
      return
    }
    const bounds = barangayBounds(outline.barangays, fitBarangay.barangay)
    const { clientWidth, clientHeight } = map.getContainer()
    if (!bounds || !clientWidth || !clientHeight) return
    const camera = barangayCamera(bounds, clientWidth, clientHeight, padding, lock, MAP_MAX_ZOOM)
    map.easeTo({ center: camera.center, zoom: camera.zoom, duration: cameraDuration(650) })
    // Only a new request moves the camera; the layout and selection are read as they are then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, lock, fitBarangay])

  // The popup belongs to the selected pin: it closes when the selection moves on or the layout turns compact.
  useEffect(() => {
    if (popupId && (popupId !== selectedId || compact)) setPopupId(undefined)
  }, [compact, popupId, selectedId])

  const handleError = useCallback((event: MapErrorEvent) => {
    const error = event.error as (Error & { url?: string }) | undefined
    // No target means the map never started, which is how a missing WebGL2 context shows up.
    if (!event.target || error instanceof GPUInitializationError) {
      setFailed(true)
      return
    }
    const sourceId = (event as { sourceId?: string }).sourceId
    const fromBasemap = sourceId === VECTOR_SOURCE_ID || /openfreemap/i.test(`${error?.url ?? ''} ${error?.message ?? ''}`)
    // OpenFreeMap unreachable before anything was drawn: use OpenStreetMap image tiles instead.
    if (fromBasemap && !vectorTileLoaded.current) setBasemap('raster')
  }, [])

  const zoomBy = (delta: number) => {
    const map = mapRef.current?.getMap()
    if (map) map.easeTo({ zoom: map.getZoom() + delta, duration: cameraDuration(260) })
  }
  const fitDistrict = () => {
    const map = mapRef.current?.getMap()
    if (map && lock) map.easeTo({ center: lock.center, zoom: lock.zoom, duration: cameraDuration(520) })
  }
  const openCluster = (cluster: MapClusterItem) => {
    const map = mapRef.current?.getMap()
    if (!map) return
    // A group at one shared point never splits by zooming alone; past the clustering zoom its reports are drawn fanned out.
    const zoom = Math.min(Math.max(cluster.expansionZoom, map.getZoom() + 1), CLUSTER_MAX_ZOOM + 1, MAP_MAX_ZOOM)
    map.easeTo({ center: [cluster.longitude, cluster.latitude], zoom, duration: cameraDuration(480) })
  }
  const choosePin = (report: MapReport, fromKeyboard: boolean) => {
    onSelect(report.id)
    if (compact) return
    setPopupFromKeyboard(fromKeyboard)
    setPopupId(report.id)
  }

  const zoom = view?.zoom ?? lock?.zoom ?? 0
  const popupReport = !compact && popupId && popupId === selectedId ? selected : undefined
  const popupColor = popupReport?.color
  // The popup's pointer is drawn by MapLibre outside the card, so it gets the category color here.
  useEffect(() => {
    if (popupColor) popupRef.current?.getElement()?.style.setProperty('--pin-color', popupColor)
  }, [popupColor, popupId])

  if (failed) return <MapUnavailable detail="This browser or device could not start the map. You can still browse and submit reports." />

  return <div className={`map-canvas ${ready ? 'is-ready' : ''}`} role="region" aria-label="Incident map of District 5">
    <MapView
      ref={mapRef}
      mapLib={mapLib}
      mapStyle={mapStyle}
      initialViewState={{ bounds: outline.bounds, fitBoundsOptions: { padding } }}
      minZoom={lock ? lock.zoom - 0.01 : undefined}
      maxZoom={MAP_MAX_ZOOM}
      maxBounds={lock?.view}
      maxPitch={0}
      dragRotate={false}
      pitchWithRotate={false}
      touchPitch={false}
      renderWorldCopies={false}
      attributionControl={{ compact: true }}
      onLoad={handleLoad}
      onResize={(event) => { measure(event.target) }}
      onMoveEnd={refreshView}
      onZoom={(event) => { if (!view || Math.floor(event.viewState.zoom) !== Math.floor(view.zoom)) refreshView() }}
      onSourceData={(event) => { if (event.sourceId === VECTOR_SOURCE_ID && event.tile) vectorTileLoaded.current = true }}
      onError={handleError}
    >
      {clusters.map((cluster) => (
        <Marker key={`c${cluster.id}`} longitude={cluster.longitude} latitude={cluster.latitude} anchor="center" style={{ zIndex: 3 }} onClick={(event) => { event.originalEvent.stopPropagation(); openCluster(cluster) }}>
          <ClusterBubble count={cluster.count} urgent={cluster.urgent} ring={clusterRingGradient(cluster.mix, categoryColors, categoryOrder)} />
        </Marker>
      ))}
      {pins.map((report, index) => {
        const isSelected = report.id === selectedId
        return <Marker
          key={`p${report.id}`}
          longitude={report.position[1]}
          latitude={report.position[0]}
          anchor="bottom"
          offset={PIN_OFFSET}
          style={{ zIndex: isSelected ? 5 : report.urgent ? 2 : report.open ? 1 : 0 }}
          onClick={(event) => { event.originalEvent.stopPropagation(); choosePin(report, event.originalEvent.detail === 0) }}
        >
          <MapPin
            color={report.color}
            icon={report.icon}
            label={`${report.title}. ${report.category} report, ${report.status}${report.urgent ? ', high urgency' : ''}.`}
            title={report.title}
            status={report.status}
            urgent={report.urgent}
            muted={!report.open}
            selected={isSelected}
            delay={introduced ? 0 : Math.min(index, 14) * 28}
          />
        </Marker>
      })}
      {gpsLocation && <Marker longitude={gpsLocation[1]} latitude={gpsLocation[0]} anchor="center" style={{ zIndex: 0, pointerEvents: 'none' }}><UserDot /></Marker>}
      {popupReport && <Popup
        key={popupReport.id}
        ref={popupRef}
        focusAfterOpen={popupFromKeyboard}
        longitude={popupReport.position[1]}
        latitude={popupReport.position[0]}
        offset={POPUP_OFFSET}
        closeButton={false}
        maxWidth="296px"
        className="report-map-popup"
        onClose={() => setPopupId(undefined)}
      >
        <article className="map-popup-card" style={{ '--pin-color': popupReport.color } as CSSProperties}>
          <header>
            <span className="map-popup-category"><popupReport.icon size={13} aria-hidden="true" />{popupReport.category}</span>
            <span className={`status-pill status-${statusSlug(popupReport.status)}`}><i />{popupReport.status}</span>
            <button className="icon-button map-popup-close" type="button" onClick={() => setPopupId(undefined)} aria-label="Close report preview"><X size={14} /></button>
          </header>
          <strong>{popupReport.title}</strong>
          <small><MapPinIcon size={12} aria-hidden="true" />{popupReport.place} · {popupReport.createdLabel}</small>
          <small><UserRound size={12} aria-hidden="true" />Reported by {popupReport.reporterName || 'Community resident'}</small>
          <p>{popupReport.description}</p>
          <button className="popup-discussion-button" type="button" onClick={() => onDiscuss(popupReport.id)}><MessageSquare size={12} aria-hidden="true" /> Comments and discussion</button>
        </article>
      </Popup>}
    </MapView>
    <MapZoomControls onZoomIn={() => zoomBy(1)} onZoomOut={() => zoomBy(-1)} onFit={fitDistrict} canZoomIn={zoom < MAP_MAX_ZOOM - 0.01} canZoomOut={!lock || zoom > lock.zoom + 0.01} />
  </div>
}
