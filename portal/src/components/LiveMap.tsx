/** Live site map — real basemaps under the real trials. Esri World Imagery /
 * OSM / NSW aerial as bases, NASA GIBS MODIS NDVI (16-day, 250 m) as a
 * toggleable overlay for district-level greenness — plot-level NDVI arrives
 * with drone orthos (F28). Tile fetches are read-only requests to the
 * providers listed in docs/SECURITY.md. */
import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { loadLiveTrials, loadScores, loadTreatments, loadTrialPhotos, portalToken, saveMachineScores, type LiveTrial } from '../lib/db'
import { fitGrid, type GridFit } from '../lib/geofit'
import { parseOrtho, sampleMean, type Ortho } from '../lib/ortho'
import { rampColor } from './Results'
import { useApp } from '../state'

const GREEN = '#007749'

interface TrialGrid {
  trial: LiveTrial
  fit: GridFit
  values: Map<number, Record<string, number>>
  trtName: Map<number, string>
  measures: string[]
}

export default function LiveMap() {
  const { nav } = useApp()
  const divRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const gridLayerRef = useRef<L.LayerGroup | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'signedout'>('loading')
  const [trials, setTrials] = useState<LiveTrial[]>([])
  const [grids, setGrids] = useState<TrialGrid[]>([])
  const [gMeasure, setGMeasure] = useState<string | null>(null)
  const [ortho, setOrtho] = useState<{ o: Ortho; name: string } | null>(null)
  const [orthoMsg, setOrthoMsg] = useState('')
  const [ndvi, setNdvi] = useState<Map<string, Map<number, { mean: number; pixels: number }>>>(new Map())
  const orthoLayerRef = useRef<L.ImageOverlay | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

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

      // fit each trial's plot grid from its GPS-tagged photos
      const found: TrialGrid[] = []
      for (const trial of t ?? []) {
        if (!trial.scores) continue
        const photos = await loadTrialPhotos(trial.id, token)
        const pts = (photos ?? [])
          .filter((p) => p.meta?.lat != null && p.meta?.lng != null)
          .map((p) => ({ lat: p.meta!.lat!, lng: p.meta!.lng!, row: Math.floor(p.plot / 100), pos: p.plot % 100 }))
        const fit = fitGrid(pts)
        if (!fit) continue
        const [sc, trts] = await Promise.all([loadScores(trial.id, token), loadTreatments(trial.id, token)])
        const values = new Map<number, Record<string, number>>()
        for (const s of sc ?? []) {
          const v = values.get(s.plot) ?? {}
          v[s.measure] = Number(s.value)
          values.set(s.plot, v)
        }
        const trtName = new Map<number, string>()
        for (const tr of trts ?? []) for (const pl of tr.components?.plots ?? []) trtName.set(pl, `T${tr.n} ${tr.name}`)
        const measures = [...new Set((sc ?? []).map((s) => s.measure))].sort()
        found.push({ trial, fit, values, trtName, measures })
      }
      setGrids(found)
      if (found.length) setGMeasure(found[0].measures.includes('dmg_f1') ? 'dmg_f1' : found[0].measures[0] ?? null)
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

    gridLayerRef.current = L.layerGroup().addTo(map)

    return () => {
      map.remove()
      mapRef.current = null
      gridLayerRef.current = null
    }
  }, [state, trials])

  // plot-grid overlay, redrawn when the fits land or the measure changes
  useEffect(() => {
    const layer = gridLayerRef.current
    if (!layer || !mapRef.current) return
    layer.clearLayers()
    if (!gMeasure) return
    for (const g of grids) {
      // ndvi comes from the loaded drone ortho; everything else from scores
      const vmap = new Map<number, number>()
      if (gMeasure === 'ndvi') {
        for (const [plot, s] of ndvi.get(g.trial.id) ?? []) vmap.set(plot, Math.round(s.mean * 1000) / 1000)
      } else {
        for (const [plot, v] of g.values) if (v[gMeasure] !== undefined) vmap.set(plot, v[gMeasure])
      }
      const plots = new Set<number>([...g.values.keys(), ...vmap.keys()])
      const vals = [...vmap.values()]
      if (!vals.length) continue
      const min = Math.min(...vals)
      const max = Math.max(...vals)
      for (const plot of plots) {
        const val = vmap.get(plot)
        const row = Math.floor(plot / 100)
        const pos = plot % 100
        const ramp = gMeasure === 'ndvi' ? 'pgreen' : gMeasure // ndvi reads green-is-good
        const poly = L.polygon(g.fit.cell(row, pos), {
          color: '#ffffff',
          weight: 1,
          fillColor: val === undefined ? '#9aa09a' : rampColor(ramp, max === min ? 0.5 : (val - min) / (max - min)),
          fillOpacity: val === undefined ? 0.25 : 0.78,
        }).addTo(layer)
        poly.bindTooltip(`Plot ${plot}${g.trtName.get(plot) ? ` · ${g.trtName.get(plot)}` : ''}${val !== undefined ? ` · ${val}` : ''}`)
      }
    }
  }, [grids, gMeasure, ndvi])

  // drone ortho: image overlay on the map, NDVI coloured burnt → green
  useEffect(() => {
    orthoLayerRef.current?.remove()
    orthoLayerRef.current = null
    const map = mapRef.current
    if (!map || !ortho) return
    const { o } = ortho
    const canvas = document.createElement('canvas')
    canvas.width = o.width
    canvas.height = o.height
    const ctx = canvas.getContext('2d')!
    const img = ctx.createImageData(o.width, o.height)
    const lo: [number, number, number] = [207, 69, 32] // Land Burnt
    const mid: [number, number, number] = [244, 239, 230]
    const hi: [number, number, number] = [0, 119, 73] // Field Green
    const span = o.max - o.min || 1
    for (let i = 0; i < o.values.length; i++) {
      const v = o.values[i]
      if (Number.isNaN(v)) continue // transparent
      const t = (v - o.min) / span
      const [a, b, tt] = t < 0.5 ? [lo, mid, t * 2] : [mid, hi, t * 2 - 1]
      img.data[i * 4] = a[0] + (b[0] - a[0]) * tt
      img.data[i * 4 + 1] = a[1] + (b[1] - a[1]) * tt
      img.data[i * 4 + 2] = a[2] + (b[2] - a[2]) * tt
      img.data[i * 4 + 3] = 215
    }
    ctx.putImageData(img, 0, 0)
    const ov = L.imageOverlay(canvas.toDataURL(), o.bounds, { opacity: 0.85, attribution: 'Drone NDVI (uploaded ortho)' }).addTo(map)
    orthoLayerRef.current = ov
    map.fitBounds(o.bounds)
    return () => {
      ov.remove()
    }
  }, [ortho, state])

  // sample mean NDVI inside every fitted plot polygon
  useEffect(() => {
    if (!ortho) {
      setNdvi(new Map())
      return
    }
    const all = new Map<string, Map<number, { mean: number; pixels: number }>>()
    for (const g of grids) {
      const per = new Map<number, { mean: number; pixels: number }>()
      for (const plot of new Set<number>([...g.values.keys(), ...g.trtName.keys()])) {
        const s = sampleMean(ortho.o, g.fit.cell(Math.floor(plot / 100), plot % 100))
        if (s) per.set(plot, s)
      }
      if (per.size) all.set(g.trial.id, per)
    }
    setNdvi(all)
    const n = [...all.values()].reduce((a, m) => a + m.size, 0)
    setOrthoMsg(n ? `${n} plots sampled from ${ortho.name}` : `${ortho.name} loaded — no fitted plot grid falls inside it`)
    if (n) setGMeasure('ndvi')
  }, [ortho, grids])

  const onOrthoFile = async (f: File) => {
    setOrthoMsg('Reading ortho…')
    try {
      setOrtho({ o: await parseOrtho(await f.arrayBuffer()), name: f.name })
    } catch (e) {
      setOrtho(null)
      setOrthoMsg(e instanceof Error ? e.message : 'Could not read that GeoTIFF')
    }
  }

  const saveNdvi = async () => {
    const token = await portalToken()
    if (!token || !ortho || !ndvi.size) return
    setOrthoMsg('Saving…')
    let ok = true
    let n = 0
    for (const [trialId, per] of ndvi) {
      const rows = [...per].map(([plot, s]) => ({
        plot,
        value: Math.round(s.mean * 1000) / 1000,
        note: `NDVI from drone ortho ${ortho.name} (${s.pixels} px)`,
      }))
      n += rows.length
      ok = (await saveMachineScores(trialId, 'ndvi', rows, token)) && ok
    }
    setOrthoMsg(ok ? `Saved ndvi for ${n} plots — it now shows beside the eye scores in Results` : 'Save failed — check sign-in and permissions')
  }

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
      {grids.length > 0 && (
        <div style={{ padding: '0 22px 10px', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.1em', color: '#8A8C8A' }}>PLOT GRID FROM PHOTO GPS</span>
          {[...new Set([...grids.flatMap((g) => g.measures), ...(ndvi.size ? ['ndvi'] : [])])].sort().map((m) => (
            <span key={m} onClick={() => setGMeasure(m)} style={{ fontSize: 11.5, fontWeight: 700, padding: '4px 10px', borderRadius: 99, cursor: 'pointer', border: `1.5px solid ${gMeasure === m ? GREEN : '#E4E4E6'}`, color: gMeasure === m ? GREEN : '#3E403E', background: gMeasure === m ? '#E3F1EA' : '#fff' }}>
              {m}
            </span>
          ))}
          <span style={{ fontSize: 11, color: '#8A8C8A' }}>
            {grids.map((g) => `${g.trial.name.split('—')[0].trim()}: ${g.fit.points} photos, ±${g.fit.rmsM.toFixed(1)} m`).join(' · ')}
          </span>
        </div>
      )}
      {state === 'ready' && (
        <div style={{ padding: '0 22px 10px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.1em', color: '#8A8C8A' }}>DRONE ORTHO</span>
          <input
            ref={fileRef}
            type="file"
            accept=".tif,.tiff,image/tiff"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void onOrthoFile(f)
              e.target.value = ''
            }}
          />
          <span onClick={() => fileRef.current?.click()} style={{ fontSize: 11.5, fontWeight: 700, padding: '4px 10px', borderRadius: 99, cursor: 'pointer', border: '1.5px solid #E4E4E6', color: '#3E403E', background: '#fff' }}>
            Load NDVI GeoTIFF…
          </span>
          {ndvi.size > 0 && (
            <span onClick={() => void saveNdvi()} style={{ fontSize: 11.5, fontWeight: 700, padding: '4px 10px', borderRadius: 99, cursor: 'pointer', background: GREEN, color: '#fff' }}>
              Save NDVI to database
            </span>
          )}
          {ortho && (
            <span onClick={() => { setOrtho(null); setOrthoMsg(''); if (gMeasure === 'ndvi') setGMeasure(null) }} style={{ fontSize: 11.5, fontWeight: 700, padding: '4px 10px', borderRadius: 99, cursor: 'pointer', border: '1.5px solid #E4E4E6', color: '#A93414', background: '#fff' }}>
              ✕ remove
            </span>
          )}
          <span data-testid="ortho-msg" style={{ fontSize: 11, color: '#8A8C8A' }}>{orthoMsg}</span>
        </div>
      )}
      <div ref={divRef} data-testid="live-map" style={{ flex: 1, minHeight: 0 }} />
    </div>
  )
}
