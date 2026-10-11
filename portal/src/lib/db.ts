/** Live trial data for the portal — reads/writes the real backend as the
 * signed-in user (RLS scopes everything to the org). The session is the one
 * the sidebar sign-in (or the field app, same origin) saved to localStorage. */
import { fetchObject, insert, refresh, remove, select, stableId, update, upsertOn, SUPA_URL, type Session } from '../../../shared/supa'
import { blockPlots, polygonWkt, type BlockCell, type BlockSpec, type LatLng } from '../../../shared/geometry'

const SESSION_KEY = 'tw.supaSession'

function saved(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    return raw ? (JSON.parse(raw) as Session) : null
  } catch {
    return null
  }
}

/** Valid access token, refreshing near expiry; null = not signed in. */
export async function portalToken(): Promise<string | null> {
  let s = saved()
  if (!s) return null
  if (s.expires_at * 1000 < Date.now()) {
    const next = await refresh(s)
    if (!next) return null
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(next))
    } catch {
      /* private mode */
    }
    s = next
  }
  return s.access_token
}

export interface LiveTrial {
  id: string
  site_id: string | null
  name: string
  season: number | null
  status: string
  trial_type: string | null
  crop: string | null
  variety: string | null
  sown_date: string | null
  aim: string | null
  design: {
    type?: string
    reps?: number
    blocking?: string
    grid?: { rows: number; positions: number }
    plot?: { widthM: number; lengthM: number; areaM2: number }
    notes?: string[]
  } | null
  spraying: {
    waterRateLPerHa?: number
    sprayVolumePerPlotMl?: number
    batchVolumeL?: number
    timings?: Record<string, { due?: string; applied?: string }>
  } | null
  site: { id: string; property: string | null; town: string | null; lat: number | null; lng: number | null; boundary_geojson: GeoPolygon | null; planned: boolean } | null
  /** Block placement on the site map (see server/migrations/007_geometry.sql). */
  layout: BlockLayout | null
  scores: number
  plotsScored: number
  sprayTicks: number
  lastActivity: string | null
}

interface TrialRow {
  id: string
  site_id: string | null
  name: string
  season: number | null
  status: string
  trial_type: string | null
  crop: string | null
  variety: string | null
  sown_date: string | null
  aim: string | null
  design: LiveTrial['design']
  spraying: LiveTrial['spraying']
  layout: BlockLayout | null
  sites: LiveTrial['site']
}

export interface GeoPolygon {
  type: 'Polygon'
  coordinates: number[][][]
}

/** What trials.layout holds once a block has been placed. */
export interface BlockLayout extends BlockSpec {
  planned: boolean
  placedAt: string
  placedBy?: string
}

export async function loadLiveTrials(token: string): Promise<LiveTrial[] | null> {
  const [trials, scores, ops] = await Promise.all([
    select<TrialRow>('trials', 'select=id,site_id,name,season,status,trial_type,crop,variety,sown_date,aim,design,spraying,layout,sites(id,property,town,lat,lng,boundary_geojson,planned)&order=season.desc,name.asc', token),
    select<{ trial_id: string; plot: number; recorded_at: string }>('scores', 'select=trial_id,plot,recorded_at', token),
    select<{ trial_id: string; detail: { sprayed?: number[] } | null; performed_at: string }>('operations', 'select=trial_id,detail,performed_at', token),
  ])
  if (!trials) return null
  return trials.map((t) => {
    const sc = (scores ?? []).filter((s) => s.trial_id === t.id)
    const op = (ops ?? []).filter((o) => o.trial_id === t.id)
    const stamps = [...sc.map((s) => s.recorded_at), ...op.map((o) => o.performed_at)].sort()
    return {
      ...t,
      site: t.sites,
      scores: sc.length,
      plotsScored: new Set(sc.map((s) => s.plot)).size,
      sprayTicks: op.reduce((n, o) => n + (o.detail?.sprayed?.length ?? 0), 0),
      lastActivity: stamps.length ? stamps[stamps.length - 1] : null,
    }
  })
}

export type TrialPatch = Partial<Pick<LiveTrial, 'name' | 'season' | 'status' | 'crop' | 'variety' | 'sown_date' | 'aim'>>

export function saveTrial(id: string, patch: TrialPatch, token: string): Promise<boolean> {
  return update('trials', `id=eq.${id}`, patch, token)
}

/** Deletes the trial; scores/photos/operations/treatments cascade with it. */
export function deleteTrial(id: string, token: string): Promise<boolean> {
  return remove('trials', `id=eq.${id}`, token)
}

// --- Results screen loaders -------------------------------------------------

export interface ScoreRow {
  id: string
  assessment: number
  plot: number
  measure: string
  value: number
  note: string | null
  recorded_at: string
}

export interface TreatmentRow {
  n: number
  name: string
  recipe: string
  b_spray: boolean
  /** `plots` is always a plain list here; imports that stored rep→plot objects
   * are normalised on load and keep the rep mapping in `plotsByRep`. */
  components: { plots?: number[]; plotsByRep?: Record<string, number>; aTiming?: string | null; bTiming?: string | null } | null
}

export interface PhotoRow {
  plot: number
  storage_path: string
  taken_at: string
  meta: { flagged?: boolean; trt?: number; label?: string; lat?: number | null; lng?: number | null } | null
}

export function loadScores(trialId: string, token: string): Promise<ScoreRow[] | null> {
  return select<ScoreRow>('scores', `select=id,assessment,plot,measure,value,note,recorded_at&trial_id=eq.${trialId}&order=assessment.asc,plot.asc`, token)
}

export async function loadTreatments(trialId: string, token: string): Promise<TreatmentRow[] | null> {
  const rows = await select<TreatmentRow>('treatments', `select=n,name,recipe,b_spray,components&trial_id=eq.${trialId}&order=n.asc`, token)
  if (!rows) return null
  return rows.map((r) => {
    const raw = r.components?.plots as unknown
    if (!raw || Array.isArray(raw)) return r
    const entries = Object.entries(raw as Record<string, number>).sort((a, b) => Number(a[0]) - Number(b[0]))
    return { ...r, components: { ...r.components, plots: entries.map((e) => Number(e[1])), plotsByRep: Object.fromEntries(entries) } }
  })
}

export interface OperationRow {
  kind: string
  timing: string | null
  performed_at: string
  detail: { sprayed?: number[]; mixed?: number[]; note?: string } | null
  conditions: Record<string, string> | null
  equipment_id: { name: string; detail: EquipmentDetail | null } | null
}

export function loadOperations(trialId: string, token: string): Promise<OperationRow[] | null> {
  return select<OperationRow>(
    'operations',
    `select=kind,timing,performed_at,detail,conditions,equipment_id(name,detail)&trial_id=eq.${trialId}&order=performed_at.asc`,
    token
  )
}

// --- Site planning: weather, phenology, soil, equipment ---------------------

export interface WeatherDay {
  date: string
  min_temp: number | null
  max_temp: number | null
  rain: number | null
  source: string
}

/** Daily weather for a site, oldest first — SILO grid rows and any station
 * rows side by side (one row per day; station wins where both exist). */
export function loadSiteWeather(siteId: string, token: string): Promise<WeatherDay[] | null> {
  return select<WeatherDay>('site_weather', `select=date,min_temp,max_temp,rain,source&site_id=eq.${siteId}&order=date.asc`, token)
}

export interface Calibration {
  crop: string
  variety: string
  factor: number
  stage_tt: Record<string, number>
  source: string | null
}

export function loadCalibrations(token: string): Promise<Calibration[] | null> {
  return select<Calibration>('phenology_calibrations', 'select=crop,variety,factor,stage_tt,source', token)
}

export interface SoilTestRow {
  id: string
  sampled_on: string
  depth_from_cm: number
  depth_to_cm: number
  lab: string | null
  results: Record<string, number | string>
  note: string | null
}

export function loadSoilTests(siteId: string, token: string): Promise<SoilTestRow[] | null> {
  return select<SoilTestRow>(
    'soil_tests',
    `select=id,sampled_on,depth_from_cm,depth_to_cm,lab,results,note&site_id=eq.${siteId}&order=sampled_on.desc,depth_from_cm.asc`,
    token
  )
}

export interface EquipmentDetail {
  boomWidthM?: number
  waterRateLPerHa?: number
  sprayVolumePerPlotMl?: number
  batchVolumeL?: number
  nozzles?: string
  pressureBar?: number | null
  notes?: string
}

/** Ask the weather-sync edge function to refresh SILO grid weather. */
export async function refreshWeather(token: string): Promise<string | null> {
  try {
    const r = await fetch(`${SUPA_URL}/functions/v1/weather-sync`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!r.ok) return `sync failed (${r.status})`
    return null
  } catch {
    return 'sync failed (offline?)'
  }
}

export function loadTrialPhotos(trialId: string, token: string): Promise<PhotoRow[] | null> {
  return select<PhotoRow>('photos', `select=plot,storage_path,taken_at,meta&trial_id=eq.${trialId}&order=plot.asc`, token)
}

/** Object URL for a photo in the org bucket; null = not uploaded yet. */
export async function photoObjectUrl(path: string): Promise<string | null> {
  const token = await portalToken()
  if (!token) return null
  const blob = await fetchObject('photos', path, token)
  return blob ? URL.createObjectURL(blob) : null
}

/** Write machine-derived plot values (e.g. drone NDVI) as scores, beside the
 * assessor's eye scores, never in place of them. Deterministic ids (same
 * scheme as the field app: trial/round/plot/measure) make re-running an
 * ortho an upsert, not a duplicate. */
export async function saveMachineScores(
  trialId: string,
  measure: string,
  rows: Array<{ plot: number; value: number; note: string }>,
  token: string
): Promise<boolean> {
  return insert(
    'scores',
    rows.map((r) => ({
      id: stableId(trialId, 1, String(r.plot), measure),
      trial_id: trialId,
      assessment: 1,
      plot: r.plot,
      measure,
      value: r.value,
      note: r.note,
      assessor: jwtSub(token),
      recorded_at: new Date().toISOString(),
    })),
    token,
    { upsert: true }
  )
}

// --- Audit log --------------------------------------------------------------

export interface CorrectionRow {
  id: string
  plot: number
  kind: 'relabel' | 'exclude' | 'value'
  original_t: number | null
  effective_t: number | null
  measure: string | null
  old_value: number | null
  new_value: number | null
  reason: string | null
  made_at: string
  made_by: { name: string | null } | null
  trial_id: { name: string } | null
}

/** Every correction in the org, newest first, with who and which trial
 * embedded via the FK columns. */
export function loadCorrections(token: string): Promise<CorrectionRow[] | null> {
  return select<CorrectionRow>(
    'corrections',
    'select=id,plot,kind,original_t,effective_t,measure,old_value,new_value,reason,made_at,made_by(name),trial_id(name)&order=made_at.desc',
    token
  )
}

/** auth uid baked into the JWT — used as made_by on corrections. */
function jwtSub(token: string): string | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return typeof payload.sub === 'string' ? payload.sub : null
  } catch {
    return null
  }
}

/** Correct a score value: updates the row and writes an audit-trail
 * correction (who, when, old, new, why) in the same breath. */
export async function correctScore(
  scoreId: string,
  trialId: string,
  plot: number,
  measure: string,
  oldValue: number,
  newValue: number,
  reason: string,
  token: string
): Promise<boolean> {
  const ok = await update('scores', `id=eq.${scoreId}`, { value: newValue }, token)
  if (!ok) return false
  await insert(
    'corrections',
    [
      {
        id: crypto.randomUUID(),
        trial_id: trialId,
        plot,
        kind: 'value',
        measure,
        old_value: oldValue,
        new_value: newValue,
        reason,
        made_by: jwtSub(token),
        made_at: new Date().toISOString(),
      },
    ],
    token
  )
  return true
}

// --- Documents index (Drive files, uploaded sheets, reports) ------------------

export interface DocumentRow {
  id: string
  kind: string
  filename: string
  storage_path: string
  created_at: string
  parsed: {
    folder?: string
    status?: string
    note?: string
    plot?: number
    timing?: string
    leaf?: string
    drone?: boolean
    takenAt?: string
    camera?: string
    flight?: { flightDate?: string; flightStart?: string; maxAltM?: number; site?: string }
  } | null
}

export function loadDocuments(trialId: string, token: string): Promise<DocumentRow[] | null> {
  return select<DocumentRow>('documents', `select=id,kind,filename,storage_path,created_at,parsed&trial_id=eq.${trialId}&order=filename.asc`, token)
}

/** Where a document lives: Drive files open in Drive, anything else has no
 * public link yet. storage_path for Drive is `gdrive:<file id>`. */
export function documentUrl(d: Pick<DocumentRow, 'storage_path' | 'filename'>): string | null {
  if (d.storage_path.startsWith('gdrive:')) {
    const id = d.storage_path.slice(7)
    return d.filename.endsWith('(folder)') ? `https://drive.google.com/drive/folders/${id}` : `https://drive.google.com/file/d/${id}/view`
  }
  return null
}

// --- Site planner: stored plot geometry -------------------------------------

export interface PlotRow {
  trial_id: string
  plot: number
  row: number | null
  position: number | null
  kind: 'plot' | 'strip' | 'buffer' | 'out' | 'reserve' | 'spare'
  treatment: number | null
  rep: number | null
  geojson: GeoPolygon
  area_m2: number | null
  planned: boolean
}

export function loadPlots(trialId: string, token: string): Promise<PlotRow[] | null> {
  return select<PlotRow>('plots', `select=trial_id,plot,row,position,kind,treatment,rep,geojson,area_m2,planned&trial_id=eq.${trialId}&order=plot.asc`, token)
}

/** Every stored plot for every trial at a site, so the planner shows all blocks together. */
export function loadSitePlots(trialIds: string[], token: string): Promise<PlotRow[] | null> {
  if (!trialIds.length) return Promise.resolve([])
  return select<PlotRow>('plots', `select=trial_id,plot,row,position,kind,treatment,rep,geojson,area_m2,planned&trial_id=in.(${trialIds.join(',')})&order=plot.asc`, token)
}

/** Treatment number per plot id, from the treatments' plot allocations
 * (which come as either a rep→plot object or a plain list). */
export function cellsFromTreatments(trts: Array<{ n: number; components: { plots?: number[] | Record<string, number> } | null }>): Record<string, BlockCell> {
  const cells: Record<string, BlockCell> = {}
  for (const t of trts) {
    const plots = t.components?.plots
    const list = Array.isArray(plots) ? plots : plots ? Object.values(plots) : []
    for (const p of list) cells[p] = t.n
  }
  return cells
}

/** Save a block placement: trials.layout plus one plots row per cell. Stale
 * plot rows from an earlier, larger placement are removed. Geometry goes in
 * as EWKT, which the PostGIS geometry column reads directly. */
export async function savePlacement(trialId: string, spec: BlockSpec, cells: Record<string, BlockCell>, repOf: (plot: number) => number | null, token: string, by?: string): Promise<boolean> {
  const layout: BlockLayout = { ...spec, planned: true, placedAt: new Date().toISOString(), placedBy: by }
  const shapes = blockPlots(spec, cells)
  const rows = shapes.map((p) => ({
    trial_id: trialId,
    plot: p.plot,
    row: p.row,
    position: p.position,
    kind: p.kind,
    treatment: p.treatment,
    rep: repOf(p.plot),
    geom: polygonWkt(p.corners),
    planned: true,
    source: 'block',
    updated_at: new Date().toISOString(),
  }))
  const ok1 = await update('trials', `id=eq.${trialId}`, { layout }, token)
  if (!ok1) return false
  const ok2 = await upsertOn('plots', rows, 'trial_id,plot', token)
  if (!ok2) return false
  const keep = shapes.map((p) => p.plot).join(',')
  await remove('plots', `trial_id=eq.${trialId}&plot=not.in.(${keep})`, token)
  return true
}

/** Clear a placement: layout back to null and the plot rows gone. */
export async function clearPlacement(trialId: string, token: string): Promise<boolean> {
  const ok = await update('trials', `id=eq.${trialId}`, { layout: null }, token)
  if (!ok) return false
  return remove('plots', `trial_id=eq.${trialId}`, token)
}

/** Save a sketched site outline (planned until the corners are pegged). */
export function saveSiteOutline(siteId: string, ring: LatLng[], token: string): Promise<boolean> {
  return update('sites', `id=eq.${siteId}`, ring.length >= 3 ? { boundary: polygonWkt(ring), planned: true } : { boundary: null }, token)
}

// --- Assessment library: standard measures with EPPO-coded targets ----------

/** One row of the shared `measures` library, with its target taxon joined.
 * `canonical` points at the current key when this one is an older alias. */
export interface MeasureDef {
  key: string
  label: string
  rating: string
  unit: string | null
  target: string | null
  part: string | null
  sample: string | null
  higher_better: boolean
  min: number | null
  max: number | null
  decimals: number
  group_key: string | null
  canonical: string | null
  note: string | null
  taxa: { scientific: string; common: string | null; kind: string } | null
}

export function loadMeasureLibrary(token: string): Promise<MeasureDef[] | null> {
  return select<MeasureDef>('measures', 'select=key,label,rating,unit,target,part,sample,higher_better,min,max,decimals,group_key,canonical,note,taxa(scientific,common,kind)&active=is.true&order=group_key.asc,label.asc', token)
}
