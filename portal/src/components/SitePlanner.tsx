/** Site planner — sketch where a trial goes before anyone drives out, and
 * keep several trials at one site on one map. Satellite imagery underneath,
 * a block of real-sized plots on top: click to drop plot 101's corner, click
 * again (or drag the slider) to set the direction, save. Plots are stored as
 * polygons the phone can read, flagged `planned` until the corners are
 * pegged on site. The site outline is drawn the same way. */
import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { areaM2, bearingDeg, blockOutline, blockPlots, haversineM, ringFromGeoJson, type BlockCell, type BlockSpec, type LatLng } from '../../../shared/geometry'
import { cellsFromTreatments, clearPlacement, loadLiveTrials, loadSitePlots, loadTreatments, portalToken, savePlacement, saveSiteOutline, type LiveTrial, type PlotRow } from '../lib/db'
import { MONO } from '../state'

const GREEN = '#007749'
const INK = '#141414'
const GREY = '#8A8C8A'
const HAIR = '#E4E4E6'
const TRIAL_COLOURS = ['#007749', '#2C6E8F', '#9C6212', '#7B3FA0', '#B8372E', '#2E7D7D', '#8A6D1F', '#4A4F8C']
const TRT_COLOURS = ['#4C9A6B', '#5B8DB8', '#C98A3C', '#9A6BB0', '#D0605A', '#4FA3A3', '#A9A04C', '#7C82C4', '#C06B9A', '#6E9E3A', '#C4833E', '#5C7A99']

interface SiteGroup {
  id: string
  label: string
  lat: number | null
  lng: number | null
  outline: LatLng[]
  planned: boolean
  trials: LiveTrial[]
}

interface Placing {
  trial: LiveTrial
  spec: BlockSpec
  cells: Record<string, BlockCell>
  repOf: (plot: number) => number | null
  dirty: boolean
}

type Mode = 'idle' | 'origin' | 'direction' | 'outline'

const inputStyle: React.CSSProperties = { width: '100%', padding: '6px 8px', fontSize: 12.5, fontWeight: 600, border: `1px solid ${HAIR}`, borderRadius: 7, outline: 'none', color: INK, background: '#fff', font: 'inherit' }
const btn = (primary = false, danger = false): React.CSSProperties => ({
  padding: '6px 11px',
  fontSize: 12,
  fontWeight: 700,
  borderRadius: 8,
  cursor: 'pointer',
  border: `1.5px solid ${danger ? '#E0B4B0' : primary ? GREEN : HAIR}`,
  background: danger ? '#FBEAE3' : primary ? GREEN : '#fff',
  color: danger ? '#A93414' : primary ? '#fff' : INK,
  whiteSpace: 'nowrap',
})

/** Default block from what the trial record already says about its grid. */
function defaultSpec(t: LiveTrial, cells: Record<string, BlockCell>, at: LatLng): BlockSpec {
  const g = (t.design?.grid ?? null) as { rows?: number; positions?: number; cols?: number; rowsPerCol?: number } | null
  let rows = g?.rows ?? g?.cols ?? 0
  let positions = g?.positions ?? g?.rowsPerCol ?? 0
  if (!rows || !positions) {
    const ids = Object.keys(cells).map(Number)
    if (ids.length) {
      rows = Math.max(...ids.map((p) => Math.floor(p / 100)))
      positions = Math.max(...ids.map((p) => p % 100))
    } else {
      rows = t.design?.reps ?? 3
      positions = 10
    }
  }
  return { origin: at, bearingDeg: 90, plotW: t.design?.plot?.widthM ?? 2, plotL: t.design?.plot?.lengthM ?? 12, rows, positions, posGapM: 0, rowGapM: 0 }
}

export default function SitePlanner() {
  const divRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const pinsRef = useRef<L.LayerGroup | null>(null)
  const storedRef = useRef<L.LayerGroup | null>(null)
  const draftRef = useRef<L.LayerGroup | null>(null)
  const outlineRef = useRef<L.LayerGroup | null>(null)
  const modeRef = useRef<Mode>('idle')
  const placingRef = useRef<Placing | null>(null)
  const draftOutlineRef = useRef<LatLng[]>([])

  const [state, setState] = useState<'loading' | 'ready' | 'signedout'>('loading')
  const [trials, setTrials] = useState<LiveTrial[]>([])
  const [selSite, setSelSite] = useState<string | null>(null)
  const [stored, setStored] = useState<PlotRow[]>([])
  const [placing, setPlacing] = useState<Placing | null>(null)
  const [mode, setMode] = useState<Mode>('idle')
  const [draftOutline, setDraftOutline] = useState<LatLng[]>([])
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  modeRef.current = mode
  placingRef.current = placing
  draftOutlineRef.current = draftOutline

  const sites = useMemo<SiteGroup[]>(() => {
    const m = new Map<string, SiteGroup>()
    for (const t of trials) {
      if (!t.site) continue
      const cur = m.get(t.site.id) ?? {
        id: t.site.id,
        label: [t.site.property, t.site.town].filter(Boolean).join(', ') || 'Site',
        lat: t.site.lat,
        lng: t.site.lng,
        outline: ringFromGeoJson(t.site.boundary_geojson),
        planned: t.site.planned,
        trials: [],
      }
      cur.trials.push(t)
      m.set(t.site.id, cur)
    }
    return [...m.values()].sort((a, b) => a.label.localeCompare(b.label))
  }, [trials])
  const site = sites.find((s) => s.id === selSite) ?? null

  const reload = async () => {
    const token = await portalToken()
    if (!token) {
      setState('signedout')
      return null
    }
    const t = await loadLiveTrials(token)
    setTrials(t ?? [])
    setState('ready')
    return token
  }

  useEffect(() => {
    void reload()
  }, [])

  // stored plots for every trial at the selected site
  useEffect(() => {
    if (!site) {
      setStored([])
      return
    }
    void (async () => {
      const token = await portalToken()
      if (!token) return
      const rows = await loadSitePlots(
        site.trials.map((t) => t.id),
        token
      )
      setStored(rows ?? [])
    })()
  }, [selSite, trials])

  // the map
  useEffect(() => {
    if (state !== 'ready' || !divRef.current || mapRef.current) return
    const esri = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxNativeZoom: 18, maxZoom: 21, attribution: 'Imagery © Esri & contributors' })
    const nsw = L.tileLayer('https://maps.six.nsw.gov.au/arcgis/rest/services/public/NSW_Imagery/MapServer/tile/{z}/{y}/{x}', { maxNativeZoom: 18, maxZoom: 21, attribution: 'Aerial imagery © NSW Spatial Services' })
    const map = L.map(divRef.current, { layers: [esri], zoomControl: true, doubleClickZoom: false })
    mapRef.current = map
    L.control.layers({ 'Satellite (Esri)': esri, 'NSW aerial': nsw }, {}, { collapsed: true }).addTo(map)
    L.control.scale({ imperial: false }).addTo(map)
    pinsRef.current = L.layerGroup().addTo(map)
    outlineRef.current = L.layerGroup().addTo(map)
    storedRef.current = L.layerGroup().addTo(map)
    draftRef.current = L.layerGroup().addTo(map)

    map.on('click', (e: L.LeafletMouseEvent) => {
      const at = { lat: e.latlng.lat, lng: e.latlng.lng }
      const m = modeRef.current
      const p = placingRef.current
      if (m === 'origin' && p) {
        setPlacing({ ...p, spec: { ...p.spec, origin: at }, dirty: true })
        setMode('direction')
        setMsg('Now click where the row of plots should run towards (sets the direction).')
      } else if (m === 'direction' && p) {
        setPlacing({ ...p, spec: { ...p.spec, bearingDeg: Math.round(bearingDeg(p.spec.origin, at) * 10) / 10 }, dirty: true })
        setMode('idle')
        setMsg('')
      } else if (m === 'outline') {
        setDraftOutline([...draftOutlineRef.current, at])
      }
    })
    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [state])

  // site pins
  useEffect(() => {
    const map = mapRef.current
    const layer = pinsRef.current
    if (!map || !layer) return
    layer.clearLayers()
    const pts: L.LatLngExpression[] = []
    for (const s of sites) {
      if (s.lat == null || s.lng == null) continue
      pts.push([s.lat, s.lng])
      L.circleMarker([s.lat, s.lng], { radius: 7, color: '#fff', weight: 2, fillColor: s.id === selSite ? '#F2A900' : GREEN, fillOpacity: 0.95 })
        .addTo(layer)
        .bindTooltip(`${s.label} · ${s.trials.length} trial${s.trials.length === 1 ? '' : 's'}`)
        .on('click', () => setSelSite(s.id))
    }
    if (!selSite) {
      if (pts.length) map.fitBounds(L.latLngBounds(pts).pad(0.3))
      else map.setView([-35.2, 146.7], 8)
    }
  }, [sites, selSite])

  // fly to the selected site
  useEffect(() => {
    const map = mapRef.current
    if (!map || !site) return
    if (site.outline.length) map.fitBounds(L.latLngBounds(site.outline.map((p) => [p.lat, p.lng] as L.LatLngExpression)).pad(0.2))
    else if (site.lat != null && site.lng != null) map.setView([site.lat, site.lng], 17)
  }, [selSite])

  // site outline, saved and draft
  useEffect(() => {
    const layer = outlineRef.current
    if (!layer) return
    layer.clearLayers()
    if (site?.outline.length) {
      L.polygon(
        site.outline.map((p) => [p.lat, p.lng] as L.LatLngExpression),
        { color: '#F2A900', weight: 2, dashArray: site.planned ? '6 4' : undefined, fill: false }
      )
        .addTo(layer)
        .bindTooltip(`${site.label} · ${(areaM2(site.outline) / 10000).toFixed(2)} ha${site.planned ? ' · planned' : ''}`)
    }
    if (draftOutline.length) {
      for (const p of draftOutline) L.circleMarker([p.lat, p.lng], { radius: 4, color: '#F2A900', fillColor: '#fff', fillOpacity: 1, weight: 2 }).addTo(layer)
      if (draftOutline.length >= 2) L.polyline(draftOutline.map((p) => [p.lat, p.lng] as L.LatLngExpression), { color: '#F2A900', weight: 2, dashArray: '4 4' }).addTo(layer)
      if (draftOutline.length >= 3) L.polygon(draftOutline.map((p) => [p.lat, p.lng] as L.LatLngExpression), { color: '#F2A900', weight: 1, fillOpacity: 0.08 }).addTo(layer)
    }
  }, [site, draftOutline])

  // stored plots for the site, one colour per trial
  useEffect(() => {
    const layer = storedRef.current
    if (!layer || !site) return
    layer.clearLayers()
    const order = site.trials.map((t) => t.id)
    for (const r of stored) {
      if (placing && r.trial_id === placing.trial.id) continue // the draft replaces it while editing
      const ring = ringFromGeoJson(r.geojson)
      if (!ring.length) continue
      const colour = TRIAL_COLOURS[Math.max(0, order.indexOf(r.trial_id)) % TRIAL_COLOURS.length]
      const t = site.trials.find((x) => x.id === r.trial_id)
      const faint = r.kind !== 'plot' && r.kind !== 'strip'
      L.polygon(
        ring.map((p) => [p.lat, p.lng] as L.LatLngExpression),
        { color: colour, weight: 1, fillColor: colour, fillOpacity: faint ? 0.08 : 0.3, dashArray: r.planned ? '3 3' : undefined }
      )
        .addTo(layer)
        .bindTooltip(`${t?.name ?? ''} · plot ${r.plot}${r.treatment != null ? ` · T${r.treatment}` : ''}${r.kind !== 'plot' ? ` · ${r.kind}` : ''}${r.planned ? ' · planned' : ''}`)
    }
  }, [stored, site, placing?.trial.id])

  // draft block while placing
  useEffect(() => {
    const layer = draftRef.current
    const map = mapRef.current
    if (!layer || !map) return
    layer.clearLayers()
    if (!placing) return
    const { spec, cells } = placing
    const shapes = blockPlots(spec, cells)
    for (const s of shapes) {
      const colour = s.treatment != null ? TRT_COLOURS[(s.treatment - 1) % TRT_COLOURS.length] : s.kind === 'plot' ? '#ffffff' : '#000000'
      L.polygon(
        s.corners.map((p) => [p.lat, p.lng] as L.LatLngExpression),
        { color: '#fff', weight: 1, fillColor: colour, fillOpacity: s.kind === 'plot' || s.kind === 'strip' ? 0.45 : 0.15 }
      )
        .addTo(layer)
        .bindTooltip(`plot ${s.plot}${s.treatment != null ? ` · T${s.treatment}` : ''}${s.kind !== 'plot' ? ` · ${s.kind}` : ''}`)
    }
    const outline = blockOutline(spec)
    L.polygon(
      outline.map((p) => [p.lat, p.lng] as L.LatLngExpression),
      { color: '#F2A900', weight: 2, fill: false }
    ).addTo(layer)
    // direction arrow along the front edge, plot 101 marked
    L.polyline([[outline[0].lat, outline[0].lng], [outline[1].lat, outline[1].lng]], { color: '#F2A900', weight: 4 }).addTo(layer)
    const handle = L.divIcon({ className: 'planner-handle', html: '<div style="width:18px;height:18px;border-radius:50%;background:#F2A900;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.5)"></div>', iconSize: [18, 18], iconAnchor: [9, 9] })
    const origin = L.marker([spec.origin.lat, spec.origin.lng], { draggable: true, icon: handle, title: 'Plot 101 corner — drag to move the block' }).addTo(layer)
    origin.bindTooltip('101', { permanent: true, direction: 'top', className: 'planner-label' })
    origin.on('dragend', () => {
      const ll = origin.getLatLng()
      const p = placingRef.current
      if (p) setPlacing({ ...p, spec: { ...p.spec, origin: { lat: ll.lat, lng: ll.lng } }, dirty: true })
    })
  }, [placing])

  const startPlacing = async (t: LiveTrial) => {
    setMsg('')
    const token = await portalToken()
    if (!token) return
    const trts = (await loadTreatments(t.id, token)) ?? []
    const cells = cellsFromTreatments(trts)
    const repOf = (plot: number): number | null => {
      for (const tr of trts) {
        const byRep = tr.components?.plotsByRep
        if (byRep) {
          for (const [rep, p] of Object.entries(byRep)) if (p === plot) return Number(rep)
          continue
        }
        const i = (tr.components?.plots ?? []).indexOf(plot)
        if (i >= 0) return i + 1
      }
      return null
    }
    const map = mapRef.current
    const centre = map ? { lat: map.getCenter().lat, lng: map.getCenter().lng } : { lat: t.site?.lat ?? -35, lng: t.site?.lng ?? 147 }
    const at = t.site?.lat != null && t.site?.lng != null && !t.layout ? { lat: t.site.lat, lng: t.site.lng } : centre
    const spec: BlockSpec = t.layout
      ? { origin: t.layout.origin, bearingDeg: t.layout.bearingDeg, plotW: t.layout.plotW, plotL: t.layout.plotL, rows: t.layout.rows, positions: t.layout.positions, posGapM: t.layout.posGapM ?? 0, rowGapM: t.layout.rowGapM ?? 0 }
      : defaultSpec(t, cells, at)
    setPlacing({ trial: t, spec, cells, repOf, dirty: false })
    if (!t.layout) {
      setMode('origin')
      setMsg('Click the map where the front-left corner of plot 101 goes.')
    } else {
      setMode('idle')
    }
    if (map && t.layout) map.fitBounds(L.latLngBounds(blockOutline(spec).map((p) => [p.lat, p.lng] as L.LatLngExpression)).pad(0.5))
  }

  const setSpec = (patch: Partial<BlockSpec>) => {
    if (!placing) return
    setPlacing({ ...placing, spec: { ...placing.spec, ...patch }, dirty: true })
  }

  const save = async () => {
    if (!placing) return
    setBusy(true)
    const token = await portalToken()
    if (!token) {
      setBusy(false)
      return
    }
    const ok = await savePlacement(placing.trial.id, placing.spec, placing.cells, placing.repOf, token)
    setBusy(false)
    if (!ok) {
      setMsg('Could not save the placement. Check you are signed in and try again.')
      return
    }
    setPlacing(null)
    setMode('idle')
    setMsg(`Saved ${placing.trial.name}: ${blockPlots(placing.spec, placing.cells).length} plots stored as planned geometry.`)
    await reload()
  }

  const clear = async () => {
    if (!placing) return
    if (!window.confirm(`Remove the stored placement for ${placing.trial.name}? Scores and photos are untouched.`)) return
    setBusy(true)
    const token = await portalToken()
    if (token) await clearPlacement(placing.trial.id, token)
    setBusy(false)
    setPlacing(null)
    setMode('idle')
    await reload()
  }

  const finishOutline = async (save: boolean) => {
    if (!site) return
    if (save && draftOutline.length >= 3) {
      const token = await portalToken()
      if (token) {
        const ok = await saveSiteOutline(site.id, draftOutline, token)
        setMsg(ok ? `Site outline saved: ${(areaM2(draftOutline) / 10000).toFixed(2)} ha, marked planned.` : 'Could not save the outline.')
        await reload()
      }
    }
    setDraftOutline([])
    setMode('idle')
  }

  const removeOutline = async () => {
    if (!site || !window.confirm(`Remove the saved outline for ${site.label}?`)) return
    const token = await portalToken()
    if (token) await saveSiteOutline(site.id, [], token)
    await reload()
  }

  const shapes = placing ? blockPlots(placing.spec, placing.cells) : []
  const outline = placing ? blockOutline(placing.spec) : []
  const blockW = outline.length ? haversineM(outline[0], outline[1]) : 0
  const blockL = outline.length ? haversineM(outline[1], outline[2]) : 0
  const fromPin = placing && site?.lat != null && site?.lng != null ? haversineM({ lat: site.lat, lng: site.lng }, placing.spec.origin) : null

  if (state === 'signedout')
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: GREY, fontSize: 13 }}>
        Sign in (bottom left) to plan sites.
      </div>
    )

  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', overflow: 'hidden' }}>
      <div style={{ width: 332, flex: 'none', borderRight: `1px solid ${HAIR}`, background: '#fff', overflow: 'auto', padding: '18px 16px 30px' }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: INK }}>Site planner</div>
        <div style={{ fontSize: 11.5, color: GREY, marginTop: 3, marginBottom: 14, lineHeight: 1.45 }}>
          Sketch blocks on satellite before going out. Everything placed here is marked planned until the corners are pegged in the ute.
        </div>

        {!site && (
          <>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.12em', color: GREY, marginBottom: 6 }}>SITES · {sites.length}</div>
            {sites.map((s) => (
              <div key={s.id} onClick={() => setSelSite(s.id)} style={{ padding: '8px 10px', borderRadius: 8, border: `1px solid ${HAIR}`, marginBottom: 6, cursor: 'pointer' }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: INK }}>{s.label}</div>
                <div style={{ fontSize: 11, color: GREY, marginTop: 2 }}>
                  {s.trials.length} trial{s.trials.length === 1 ? '' : 's'} · {s.trials.filter((t) => t.layout).length} placed{s.outline.length ? ' · outline drawn' : ''}
                  {s.lat == null ? ' · no coordinates' : ''}
                </div>
              </div>
            ))}
          </>
        )}

        {site && !placing && (
          <>
            <div onClick={() => { setSelSite(null); setMode('idle'); setDraftOutline([]) }} style={{ fontSize: 11.5, fontWeight: 700, color: GREEN, cursor: 'pointer', marginBottom: 8 }}>
              ← All sites
            </div>
            <div style={{ fontSize: 14.5, fontWeight: 800, color: INK }}>{site.label}</div>
            <div style={{ fontSize: 11, color: GREY, marginTop: 2, fontFamily: MONO }}>
              {site.lat != null && site.lng != null ? `${site.lat.toFixed(5)}, ${site.lng.toFixed(5)}` : 'no coordinates yet'}
            </div>

            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.12em', color: GREY, margin: '14px 0 6px' }}>SITE OUTLINE</div>
            {mode !== 'outline' ? (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <span onClick={() => { setMode('outline'); setDraftOutline([]); setMsg('Click around the site boundary. Finish when the shape is closed enough.') }} style={btn()}>
                  {site.outline.length ? 'Redraw outline' : 'Draw outline'}
                </span>
                {site.outline.length > 0 && (
                  <>
                    <span style={{ fontSize: 11, color: GREY }}>{(areaM2(site.outline) / 10000).toFixed(2)} ha{site.planned ? ' · planned' : ''}</span>
                    <span onClick={removeOutline} style={btn(false, true)}>Remove</span>
                  </>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: GREY }}>{draftOutline.length} point{draftOutline.length === 1 ? '' : 's'}{draftOutline.length >= 3 ? ` · ${(areaM2(draftOutline) / 10000).toFixed(2)} ha` : ''}</span>
                <span onClick={() => setDraftOutline(draftOutline.slice(0, -1))} style={btn()}>Undo point</span>
                <span onClick={() => finishOutline(true)} style={btn(draftOutline.length >= 3)}>Finish and save</span>
                <span onClick={() => finishOutline(false)} style={btn()}>Cancel</span>
              </div>
            )}

            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.12em', color: GREY, margin: '16px 0 6px' }}>TRIALS AT THIS SITE · {site.trials.length}</div>
            {site.trials.map((t, i) => {
              const n = stored.filter((r) => r.trial_id === t.id).length
              return (
                <div key={t.id} style={{ padding: '9px 10px', borderRadius: 8, border: `1px solid ${HAIR}`, marginBottom: 6, borderLeft: `4px solid ${TRIAL_COLOURS[i % TRIAL_COLOURS.length]}` }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: INK }}>{t.name}</div>
                  <div style={{ fontSize: 11, color: GREY, marginTop: 2 }}>
                    {t.status}
                    {t.design?.plot ? ` · ${t.design.plot.widthM} × ${t.design.plot.lengthM} m plots` : ''}
                    {t.layout ? ` · ${n} plots placed${t.layout.planned ? ' (planned)' : ''}` : ' · not placed'}
                  </div>
                  <div style={{ marginTop: 6 }}>
                    <span onClick={() => startPlacing(t)} style={btn(!t.layout)}>{t.layout ? 'Adjust block' : 'Place block'}</span>
                  </div>
                </div>
              )
            })}
          </>
        )}

        {placing && (
          <>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.12em', color: GREY, marginBottom: 4 }}>PLACING</div>
            <div style={{ fontSize: 13.5, fontWeight: 800, color: INK, lineHeight: 1.25 }}>{placing.trial.name}</div>
            <div style={{ fontSize: 11, color: GREY, marginTop: 4, marginBottom: 10 }}>
              {shapes.length} plots · block {blockW.toFixed(0)} × {blockL.toFixed(0)} m · {(areaM2(outline) / 10000).toFixed(2)} ha
              {fromPin != null ? ` · ${fromPin < 1000 ? `${fromPin.toFixed(0)} m` : `${(fromPin / 1000).toFixed(1)} km`} from the site pin` : ''}
            </div>

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
              <span onClick={() => { setMode('origin'); setMsg('Click the map where the front-left corner of plot 101 goes.') }} style={btn(mode === 'origin')}>Set corner</span>
              <span onClick={() => { setMode('direction'); setMsg('Click where the row of plots should run towards.') }} style={btn(mode === 'direction')}>Set direction</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {(
                [
                  ['Rows', 'rows', 1, 1],
                  ['Positions', 'positions', 1, 1],
                  ['Plot width m', 'plotW', 0.1, 0.1],
                  ['Plot length m', 'plotL', 0.1, 0.5],
                  ['Gap between positions m', 'posGapM', 0, 0.1],
                  ['Gap between rows m', 'rowGapM', 0, 0.5],
                ] as Array<[string, keyof BlockSpec, number, number]>
              ).map(([label, key, min, step]) => (
                <label key={key} style={{ fontSize: 10.5, fontWeight: 700, color: GREY }}>
                  {label}
                  <input
                    type="number"
                    min={min}
                    step={step}
                    value={(placing.spec[key] as number | undefined) ?? 0}
                    onChange={(e) => setSpec({ [key]: Math.max(min, Number(e.target.value) || 0) } as Partial<BlockSpec>)}
                    style={{ ...inputStyle, marginTop: 3 }}
                  />
                </label>
              ))}
            </div>
            <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: GREY, marginTop: 10 }}>
              Direction of positions · {placing.spec.bearingDeg.toFixed(0)}° from north
              <input type="range" min={0} max={359} step={1} value={Math.round(placing.spec.bearingDeg)} onChange={(e) => setSpec({ bearingDeg: Number(e.target.value) })} style={{ width: '100%', marginTop: 4 }} />
            </label>
            <div style={{ fontSize: 10.5, color: GREY, marginTop: 6, lineHeight: 1.45 }}>
              Rows run to the right of the direction. Plot numbers are row × 100 + position, so 101 is the corner marker and 102 is next along the arrow. Drag the marker to move the whole block.
            </div>

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 14 }}>
              <span onClick={busy ? undefined : save} style={{ ...btn(true), opacity: busy ? 0.5 : 1 }}>{busy ? 'Saving…' : 'Save placement'}</span>
              <span onClick={() => { setPlacing(null); setMode('idle'); setMsg('') }} style={btn()}>Cancel</span>
              {placing.trial.layout && <span onClick={clear} style={btn(false, true)}>Remove placement</span>}
            </div>
            {Object.keys(placing.cells).length === 0 && (
              <div style={{ fontSize: 10.5, color: '#9C6212', marginTop: 8 }}>No plot allocations on this trial's treatments yet, so plots are stored without treatment numbers.</div>
            )}
          </>
        )}

        {msg && <div style={{ marginTop: 12, padding: '8px 10px', borderRadius: 8, background: '#F7FAF8', border: '1px solid #BCDCCB', fontSize: 11.5, color: '#00512F', lineHeight: 1.45 }}>{msg}</div>}
      </div>
      <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
        <div ref={divRef} style={{ position: 'absolute', inset: 0, cursor: mode === 'idle' ? undefined : 'crosshair' }} />
        <style>{`.planner-label { font: 700 11px Mulish, sans-serif; padding: 1px 5px; }`}</style>
      </div>
    </div>
  )
}
