import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Map as MapView, Marker, type ErrorEvent as MapErrorEvent, type MapRef } from '@vis.gl/react-maplibre'
import type { LucideIcon } from 'lucide-react'
import { GPUInitializationError, mapLib } from './map-engine'
import { MAP_FOCUS_ZOOM, MAP_MAX_ZOOM, MapPin, MapUnavailable, MapZoomControls, PIN_OFFSET, cameraDuration, lockNorthUp, useDistrictLock } from './MapParts'
import { districtFeatures, type DistrictOutline } from './lib/district-outline'
import { buildMapStyle, VECTOR_SOURCE_ID, type Basemap, type MapTheme } from './lib/map-style'
import type { Padding } from './lib/map-viewport'

type LocationPickerMapProps = {
  theme: MapTheme
  outline: DistrictOutline
  /** The pinned spot, as [latitude, longitude]. */
  location: [number, number]
  /** The chosen category's color and icon, previewed on the pin. */
  color: string
  icon: LucideIcon
  /** Called with [latitude, longitude] after a click or drag. Return false to reject the spot. */
  onSelect: (coordinates: [number, number]) => boolean
}

const PADDING: Padding = { top: 12, right: 12, bottom: 12, left: 12 }

/** The small map in the report form: click the map or drag the pin to set the report's location. */
export default function LocationPickerMap({ theme, outline, location, color, icon, onSelect }: LocationPickerMapProps) {
  const mapRef = useRef<MapRef>(null)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const [basemap, setBasemap] = useState<Basemap>('vector')
  const vectorTileLoaded = useRef(false)
  const [dragging, setDragging] = useState(false)
  const [zoom, setZoom] = useState(MAP_FOCUS_ZOOM)
  const { lock, measure } = useDistrictLock(outline.bounds, PADDING)

  const district = useMemo(() => districtFeatures(outline), [outline])
  const mapStyle = useMemo(
    () => buildMapStyle({ theme, basemap, district, latitude: (outline.bounds[1] + outline.bounds[3]) / 2 }),
    [theme, basemap, district, outline.bounds],
  )

  const [latitude, longitude] = location
  useEffect(() => {
    const map = mapRef.current?.getMap()
    if (!map || !ready) return
    map.flyTo({ center: [longitude, latitude], zoom: Math.max(map.getZoom(), MAP_FOCUS_ZOOM), duration: cameraDuration(350) })
  }, [latitude, longitude, ready])

  const handleError = useCallback((event: MapErrorEvent) => {
    const error = event.error as (Error & { url?: string }) | undefined
    if (!event.target || error instanceof GPUInitializationError) {
      setFailed(true)
      return
    }
    const sourceId = (event as { sourceId?: string }).sourceId
    const fromBasemap = sourceId === VECTOR_SOURCE_ID || /openfreemap/i.test(`${error?.url ?? ''} ${error?.message ?? ''}`)
    if (fromBasemap && !vectorTileLoaded.current) setBasemap('raster')
  }, [])

  const zoomBy = (delta: number) => {
    const map = mapRef.current?.getMap()
    if (map) map.easeTo({ zoom: map.getZoom() + delta, duration: cameraDuration(260) })
  }

  if (failed) return <MapUnavailable detail="Search for a place or use your current location instead." />

  return <div className={`map-canvas ${ready ? 'is-ready' : ''}`} role="region" aria-label="Map for choosing the report location">
    <MapView
      ref={mapRef}
      mapLib={mapLib}
      mapStyle={mapStyle}
      initialViewState={{ longitude, latitude, zoom: MAP_FOCUS_ZOOM }}
      minZoom={lock ? lock.zoom - 0.01 : undefined}
      maxZoom={MAP_MAX_ZOOM}
      maxBounds={lock?.view}
      maxPitch={0}
      dragRotate={false}
      pitchWithRotate={false}
      touchPitch={false}
      renderWorldCopies={false}
      attributionControl={{ compact: true }}
      cursor="crosshair"
      onLoad={(event) => { lockNorthUp(event.target); measure(event.target); setZoom(event.target.getZoom()); setReady(true) }}
      onResize={(event) => { measure(event.target) }}
      onZoomEnd={(event) => setZoom(event.viewState.zoom)}
      onClick={(event) => { onSelect([event.lngLat.lat, event.lngLat.lng]) }}
      onSourceData={(event) => { if (event.sourceId === VECTOR_SOURCE_ID && event.tile) vectorTileLoaded.current = true }}
      onError={handleError}
    >
      <Marker
        longitude={longitude}
        latitude={latitude}
        anchor="bottom"
        offset={PIN_OFFSET}
        draggable
        // A click on the pin itself must not count as a click on the map underneath it.
        onClick={(event) => event.originalEvent.stopPropagation()}
        onDragStart={() => setDragging(true)}
        onDragEnd={(event) => {
          setDragging(false)
          // A rejected spot (outside the district) sends the pin back where it was.
          if (!onSelect([event.lngLat.lat, event.lngLat.lng])) event.target.setLngLat([longitude, latitude])
        }}
      >
        <MapPin variant="location" color={color} icon={icon} label="Report location. Drag to adjust." dragging={dragging} />
      </Marker>
    </MapView>
    <MapZoomControls onZoomIn={() => zoomBy(1)} onZoomOut={() => zoomBy(-1)} canZoomIn={zoom < MAP_MAX_ZOOM - 0.01} canZoomOut={!lock || zoom > lock.zoom + 0.01} />
  </div>
}
