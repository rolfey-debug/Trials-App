/** Live site map — real basemaps under the real trials. Esri World Imagery /
 * OSM / NSW aerial as bases, NASA GIBS MODIS NDVI (16-day, 250 m) as a
 * toggleable overlay for district-level greenness — plot-level NDVI arrives
 * with drone orthos (F28). Tile fetches are read-only requests to the
 * providers listed in docs/SECURITY.md. */
import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { loadLiveTrials, portalToken, type LiveTrial } from '../lib/db'
import { useApp } from '../state'

const GREEN = '#007749'

export default function LiveMap() {
  const { nav } = useApp()
  const divRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'signedout'>('loading')
  const [trials, setTrials] = useState<LiveTrial[]>([])

  useEffect(() => {
    void (async () => {
      const token = await portalToken()
      if (!token) {
        setState('signedout')
        return
      }
      const t = await loadLiveTrials(token)
      setTrials(t ?? [])
      setState('ready')
    })()
  }, [])

  useEffect(() => {
    if (state !== 'ready' || !divRef.current || mapRef.current) return

    const esri = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      attribution: 'Imagery © Esri & contributors',
    })
    const osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors',
    })
    const nsw = L.tileLayer('https://maps.six.nsw.gov.au/arcgis/rest/services/public/NSW_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      attribution: 'Aerial imagery © NSW Spatial Services',
    })
    // NASA GIBS MODIS Terra NDVI, 16-day composite, 250 m. 'default' time =
    // most recent composite; native tiles stop at z9, Leaflet upscales.
    const ndvi = L.tileLayer(
      'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_NDVI_16Day/default/default/GoogleMapsCompatible_Level9/{z}/{y}/{x}.png',
      { maxNativeZoom: 9, maxZoom: 19, opacity: 0.65, attribution: 'NDVI: NASA GIBS (MODIS, 16-day, 250 m)' }
    )

    const map = L.map(divRef.current, { layers: [esri], zoomControl: true })
    mapRef.current = map
    L.control.layers(
      { 'Satellite (Esri)': esri, 'NSW aerial': nsw, 'Streets (OSM)': osm },
      { 'NDVI — MODIS 16-day · 250 m (district scale)': ndvi },
      { collapsed: false }
    ).addTo(map)

    // one pin per site, all its trials in the popup
    const bySite = new Map<string, { lat: number; lng: number; label: string; trials: LiveTrial[] }>()
    for (const t of trials) {
      if (t.site?.lat == null || t.site?.lng == null) continue
      const key = `${t.site.lat},${t.site.lng}`
      const cur = bySite.get(key) ?? { lat: t.site.lat, lng: t.site.lng, label: [t.site.property, t.site.town].filter(Boolean).join(', '), trials: [] }
      cur.trials.push(t)
      bySite.set(key, cur)
    }
    const pts: L.LatLngExpression[] = []
    for (const s of bySite.values()) {
      pts.push([s.lat, s.lng])
      const html = `<b style="font-size:13px">${s.label || 'Site'}</b>` + s.trials.map((t) => `<div style="margin-top:5px;font-size:12px"><b>${t.name}</b><br/><span style="color:#667">${t.status} · ${t.scores} scores · ${t.plotsScored} plots scored</span></div>`).join('')
      L.circleMarker([s.lat, s.lng], { radius: 9, color: '#fff', weight: 2, fillColor: GREEN, fillOpacity: 0.95 })
        .addTo(map)
        .bindPopup(html)
        .bindTooltip(s.label || 'Site')
    }
    if (pts.length) map.fitBounds(L.latLngBounds(pts).pad(0.4))
    else map.setView([-35.2, 146.7], 8)

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [state, trials])

  if (state === 'signedout')
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8A8C8A', fontSize: 14 }}>
        Sign in (bottom left) to see the live site map.
      </div>
    )

  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '16px 22px 10px', display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <div style={{ fontSize: 21, fontWeight: 800, color: '#141414' }}>Site map</div>
        <div style={{ fontSize: 12, color: '#8A8C8A' }}>
          {trials.filter((t) => t.site?.lat != null).length} located trial{trials.filter((t) => t.site?.lat != null).length === 1 ? '' : 's'} · NDVI overlay is district-scale (250 m) — plot-level NDVI comes with drone imagery
        </div>
        <span onClick={() => nav('plotmap')} style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: GREEN, cursor: 'pointer' }}>
          Plot layout (schematic) →
        </span>
      </div>
      <div ref={divRef} data-testid="live-map" style={{ flex: 1, minHeight: 0 }} />
    </div>
  )
}
