/** Live trial data for the portal — reads/writes the real backend as the
 * signed-in user (RLS scopes everything to the org). The session is the one
 * the sidebar sign-in (or the field app, same origin) saved to localStorage. */
import { fetchObject, insert, refresh, remove, rpc, select, stableId, update, uploadObject, upsertOn, ORG_ID, SUPA_URL, type Session } from '../../../shared/supa'
import { blockPlots, lineWkt, pointWkt, polygonWkt, type BlockCell, type BlockSpec, type LatLng } from '../../../shared/geometry'

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
  client_id: string | null
  approved_by: string | null
  group_id: string | null
  protocol_id: string | null
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
    reservePlots?: number[]
    marginalPlots?: number[]
    sparePlots?: number[]
    /** Plots taken out of the trial (damage, drift); never scored or analysed from then on. */
    outPlots?: number[]
  } | null
  spraying: {
    waterRateLPerHa?: number
    sprayVolumePerPlotMl?: number
    batchVolumeL?: number
    timings?: Record<string, { due?: string; applied?: string }>
  } | null
  site: { id: string; property: string | null; town: string | null; lat: number | null; lng: number | null; boundary_geojson: GeoPolygon | null; planned: boolean } | null
  client: { name: string; contact: { phone?: string; email?: string; address?: string } | null } | null
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
  client_id: string | null
  approved_by: string | null
  group_id: string | null
  protocol_id: string | null
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
  clients: LiveTrial['client']
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
    select<TrialRow>('trials', 'select=id,site_id,client_id,approved_by,group_id,protocol_id,name,season,status,trial_type,crop,variety,sown_date,aim,design,spraying,layout,sites(id,property,town,lat,lng,boundary_geojson,planned),clients(name,contact)&order=season.desc,name.asc', token),
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
      client: t.clients,
      scores: sc.length,
      plotsScored: new Set(sc.map((s) => s.plot)).size,
      sprayTicks: op.reduce((n, o) => n + (o.detail?.sprayed?.length ?? 0), 0),
      lastActivity: stamps.length ? stamps[stamps.length - 1] : null,
    }
  })
}

export type TrialPatch = Partial<Pick<LiveTrial, 'name' | 'season' | 'status' | 'crop' | 'variety' | 'sown_date' | 'aim'>>

/** `prevStatus` lets a status change stamp or clear the approver; an edit
 * that leaves the status alone leaves approved_by alone too. */
export function saveTrial(id: string, patch: TrialPatch, token: string, prevStatus?: string | null): Promise<boolean> {
  const changed = patch.status !== undefined && patch.status !== prevStatus
  const stamp = !changed ? {} : patch.status === 'approved' || patch.status === 'active' ? { approved_by: jwtSub(token) } : patch.status === 'draft' || patch.status === 'review' ? { approved_by: null } : {}
  return update('trials', `id=eq.${id}`, { ...patch, ...stamp, updated_at: new Date().toISOString() }, token)
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
  components: {
    plots?: number[]
    plotsByRep?: Record<string, number>
    aTiming?: string | null
    bTiming?: string | null
    /** Builder trials: every product line with its timing and rate. */
    lines?: TreatmentLine[]
    notes?: string[]
    [timing: string]: unknown
  } | null
}

export interface AssessmentRow {
  n: number
  timing: string | null
  measures: string[]
  blind: boolean
}

export function loadAssessments(trialId: string, token: string): Promise<AssessmentRow[] | null> {
  return select<AssessmentRow>('assessments', `select=n,timing,measures,blind&trial_id=eq.${trialId}&order=n.asc`, token)
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

/** A plot photo downsized to `maxPx` on its long side as a JPEG data URL, so a
 * report can carry its photos inline (prints without a live sign-in and keeps
 * them in a saved copy). Null when the object is missing or the browser cannot
 * decode it. */
export async function photoDataUrl(path: string, token: string, maxPx = 900, quality = 0.78): Promise<string | null> {
  const blob = await fetchObject('photos', path, token)
  if (!blob) return null
  try {
    const bmp = await createImageBitmap(blob)
    const k = Math.min(1, maxPx / Math.max(bmp.width, bmp.height))
    const w = Math.max(1, Math.round(bmp.width * k))
    const h = Math.max(1, Math.round(bmp.height * k))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(bmp, 0, 0, w, h)
    bmp.close()
    return canvas.toDataURL('image/jpeg', quality)
  } catch {
    return null
  }
}

/** Write machine-derived plot values (e.g. drone NDVI) as scores, beside the
 * assessor's eye scores, never in place of them. Deterministic ids (same
 * scheme as the field app: trial/round/plot/measure) make re-running an
 * ortho an upsert, not a duplicate. */
export async function saveMachineScores(
  trialId: string,
  measure: string,
  rows: Array<{ plot: number; value: number; note: string }>,
  token: string,
  assessment = 1
): Promise<boolean> {
  return insert(
    'scores',
    rows.map((r) => ({
      id: stableId(trialId, assessment, String(r.plot), measure),
      trial_id: trialId,
      assessment,
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
    drive?: { id: string; url: string }
  } | null
}

export function loadDocuments(trialId: string, token: string): Promise<DocumentRow[] | null> {
  return select<DocumentRow>('documents', `select=id,kind,filename,storage_path,created_at,parsed&trial_id=eq.${trialId}&order=filename.asc`, token)
}

/** Where a document lives: Drive files open in Drive, anything else has no
 * public link yet. storage_path for Drive is `gdrive:<file id>`. */
export function documentUrl(d: Pick<DocumentRow, 'storage_path' | 'filename'> & { parsed?: { drive?: { url: string } } | null }): string | null {
  if (d.parsed?.drive?.url) return d.parsed.drive.url
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

// --- Trial builder: clients, sites, protocols, groups and the save ------------

/** The signed-in person's id (people.id = auth.uid()), read from the JWT. */
export const userIdFromToken = (token: string): string | null => jwtSub(token)

export interface ClientRow {
  id: string
  name: string
  contact: { phone?: string; email?: string; address?: string; abn?: string } | null
}

export function loadClients(token: string): Promise<ClientRow[] | null> {
  return select<ClientRow>('clients', 'select=id,name,contact&order=name.asc', token)
}

export async function createClient(name: string, contact: ClientRow['contact'], token: string): Promise<string | null> {
  const id = crypto.randomUUID()
  const ok = await insert('clients', [{ id, org_id: ORG_ID, name, contact }], token)
  return ok ? id : null
}

export interface SiteRow {
  id: string
  client_id: string | null
  property: string
  town: string | null
  lat: number | null
  lng: number | null
  paddock: string | null
  soil: string | null
}

export function loadSites(token: string): Promise<SiteRow[] | null> {
  return select<SiteRow>('sites', 'select=id,client_id,property,town,lat,lng,paddock,soil&order=property.asc', token)
}

export async function createSite(row: Omit<SiteRow, 'id'>, token: string): Promise<string | null> {
  const id = crypto.randomUUID()
  const ok = await insert('sites', [{ id, org_id: ORG_ID, ...row }], token)
  return ok ? id : null
}

export interface AssessmentSet {
  key: string
  org_id: string | null
  trial_type: string
  name: string
  items: Array<{ measure: string; timing: string; note?: string }>
  note: string | null
}

export function loadAssessmentSets(token: string): Promise<AssessmentSet[] | null> {
  return select<AssessmentSet>('assessment_sets', 'select=key,org_id,trial_type,name,items,note&order=name.asc', token)
}

/** One line of a treatment: a product at a rate, applied at a timing. */
export interface TreatmentLine {
  timing: string
  product: string
  rate: number | null
  unit: string
  /** Experimental or unregistered product (flagged on maps and signs). */
  exp?: boolean
}

export interface TreatmentDraft {
  n: number
  /** When editing: the number this treatment had when its plots were allocated. */
  lockedN?: number
  name: string
  lines: TreatmentLine[]
  note?: string
}

export interface AssessmentDraft {
  n: number
  timing: string
  measures: string[]
  blind: boolean
  note?: string
}

export interface ProtocolRow {
  id: string
  name: string
  crop: string | null
  treatments: TreatmentDraft[]
  assessments: AssessmentDraft[]
  created_at: string
}

export function loadProtocols(token: string): Promise<ProtocolRow[] | null> {
  return select<ProtocolRow>('protocols', 'select=id,name,crop,treatments,assessments,created_at&order=created_at.desc', token)
}

export async function saveProtocol(name: string, crop: string | null, treatments: TreatmentDraft[], assessments: AssessmentDraft[], token: string): Promise<string | null> {
  const id = crypto.randomUUID()
  const ok = await insert('protocols', [{ id, org_id: ORG_ID, name, crop, treatments, assessments, created_by: userIdFromToken(token) }], token)
  return ok ? id : null
}

export interface TrialGroupRow {
  id: string
  name: string
  protocol_id: string | null
}

export function loadTrialGroups(token: string): Promise<TrialGroupRow[] | null> {
  return select<TrialGroupRow>('trial_groups', 'select=id,name,protocol_id&order=name.asc', token)
}

export async function createTrialGroup(name: string, protocolId: string | null, token: string): Promise<string | null> {
  const id = crypto.randomUUID()
  const ok = await insert('trial_groups', [{ id, org_id: ORG_ID, name, protocol_id: protocolId }], token)
  return ok ? id : null
}

/** Everything the builder collects before the first save. */
export interface TrialDraft {
  name: string
  season: number
  trialType: 'demonstration' | 'plot' | 'paddock_scale'
  crop: string
  variety: string
  sownDate: string
  aim: string
  clientId: string | null
  siteId: string | null
  protocolId: string | null
  groupId: string | null
  design: {
    type: string
    reps: number
    seed: string
    demoRep: boolean
    spare: number
    plotW: number
    plotL: number
    cv: number
    rows: number
    positions: number
  }
  treatments: TreatmentDraft[]
  assessments: AssessmentDraft[]
  /** Set when editing a saved trial. */
  editingId?: string
  /** The saved allocation, kept until the planner chooses to re-randomise. */
  lockedPlots?: Record<number, Array<{ rep: number; plot: number }>>
  lockedSpare?: number[]
  /** Scores already synced for the trial (re-randomising would orphan them). */
  scores?: number
  status?: string
}

/** Timing letters in application order (A first), for the recipe text. */
const timingOrder = (a: string, b: string) => a.localeCompare(b)

export function recipeText(t: TreatmentDraft): string {
  const byTiming = new Map<string, string[]>()
  for (const l of t.lines) {
    const rate = l.rate != null ? ` ${l.rate} ${l.unit}` : ''
    ;(byTiming.get(l.timing) ?? byTiming.set(l.timing, []).get(l.timing)!).push(`${l.product}${rate}${l.exp ? ' (EXP)' : ''}`)
  }
  if (!byTiming.size) return t.name.toLowerCase().includes('untreated') ? 'Untreated' : ''
  return [...byTiming.entries()].sort(([a], [b]) => timingOrder(a, b)).map(([tm, ps]) => `${tm}: ${ps.join(' + ')}`).join(' · ')
}

/** Create the trial as a draft with its treatments (plots allocated) and
 * assessments. Returns the new trial id. Partial failure leaves the trial
 * in place as a draft so nothing typed is lost; the builder reports it. */
/** The design json the record carries, from the draft. Existing notes and
 * any keys the builder does not own (reservePlots, marginalPlots, source)
 * are kept when `keep` is given. */
export function designJson(d: TrialDraft, sparePlots: number[], keep: Record<string, unknown> | null = null): Record<string, unknown> {
  const notes = Array.isArray(keep?.notes) ? [...(keep!.notes as string[])] : []
  if (!keep) notes.push(`Built in the office portal ${new Date().toISOString().slice(0, 10)}; randomised from seed ${d.design.seed}`)
  return {
    ...(keep ?? {}),
    type: d.design.type,
    reps: d.design.reps,
    seed: d.design.seed,
    demoRep: d.design.demoRep || undefined,
    blocking: 'row',
    grid: { rows: d.design.rows, positions: d.design.positions },
    plot: { widthM: d.design.plotW, lengthM: d.design.plotL, areaM2: Math.round(d.design.plotW * d.design.plotL * 100) / 100 },
    treatments: d.treatments.length,
    expectedCv: d.design.cv,
    spare: d.design.spare || undefined,
    sparePlots: sparePlots.length ? sparePlots : undefined,
    notes,
  }
}

export function treatmentRows(trialId: string, d: TrialDraft, byTrt: Record<number, Array<{ rep: number; plot: number }>>) {
  const timings = [...new Set(d.treatments.flatMap((t) => t.lines.map((l) => l.timing)))].sort(timingOrder)
  return d.treatments.map((t) => {
    const plots = (byTrt[t.n] ?? []).map((p) => p.plot).sort((a, b) => a - b)
    const plotsByRep: Record<string, number> = {}
    for (const p of byTrt[t.n] ?? []) plotsByRep[String(p.rep)] = p.plot
    const components: Record<string, unknown> = { plots, plotsByRep, lines: t.lines }
    for (const tm of timings) {
      const ls = t.lines.filter((l) => l.timing === tm)
      components[tm] = ls.map((l) => ({ product: l.product, rate: l.rate, unit: l.unit, exp: l.exp || undefined }))
      components[`${tm.toLowerCase()}Timing`] = ls.length ? ls.map((l) => `${l.product}${l.rate != null ? ` ${l.rate} ${l.unit}` : ''}`).join(' + ') : null
    }
    if (t.note) components.notes = [t.note]
    return { trial_id: trialId, n: t.n, name: t.name.trim(), b_spray: t.lines.some((l) => l.timing === 'B'), components, recipe: recipeText(t) }
  })
}

export const assessmentRows = (trialId: string, d: TrialDraft) => d.assessments.map((a) => ({ trial_id: trialId, n: a.n, timing: a.timing, measures: a.measures, blind: a.blind }))

function trialFields(d: TrialDraft) {
  return {
    client_id: d.clientId,
    site_id: d.siteId,
    group_id: d.groupId,
    protocol_id: d.protocolId,
    name: d.name.trim(),
    season: d.season,
    trial_type: d.trialType,
    aim: d.aim.trim() || null,
    crop: d.crop.trim() || null,
    variety: d.variety.trim() || null,
    sown_date: d.sownDate || null,
  }
}

export async function createTrial(
  d: TrialDraft,
  byTrt: Record<number, Array<{ rep: number; plot: number }>>,
  token: string,
  sparePlots: number[] = []
): Promise<{ id: string; ok: boolean; failed?: 'trial' | 'treatments' | 'assessments' }> {
  const id = crypto.randomUUID()
  const trial = { id, org_id: ORG_ID, status: 'draft', ...trialFields(d), design: designJson(d, sparePlots), created_by: userIdFromToken(token) }
  if (!(await insert('trials', [trial], token))) return { id, ok: false, failed: 'trial' }
  if (!(await insert('treatments', treatmentRows(id, d, byTrt), token))) return { id, ok: false, failed: 'treatments' }
  if (!(await insert('assessments', assessmentRows(id, d), token))) return { id, ok: false, failed: 'assessments' }
  return { id, ok: true }
}

/** Save edits to an existing trial: fields and design updated, treatments
 * and assessments upserted on (trial_id, n) with removed numbers deleted.
 * Status, created_by and approval are untouched. */
export async function updateTrial(
  id: string,
  d: TrialDraft,
  byTrt: Record<number, Array<{ rep: number; plot: number }>>,
  sparePlots: number[],
  keepDesign: Record<string, unknown> | null,
  token: string
): Promise<{ id: string; ok: boolean; failed?: 'trial' | 'treatments' | 'assessments' }> {
  const design = designJson(d, sparePlots, keepDesign)
  const notes = (design.notes as string[]).filter((n) => !/^Edited in the office portal /.test(n))
  notes.push(`Edited in the office portal ${new Date().toISOString().slice(0, 10)}`)
  design.notes = notes
  if (!(await update('trials', `id=eq.${id}`, { ...trialFields(d), design, updated_at: new Date().toISOString() }, token))) return { id, ok: false, failed: 'trial' }
  const trts = treatmentRows(id, d, byTrt)
  if (!(await upsertOn('treatments', trts, 'trial_id,n', token))) return { id, ok: false, failed: 'treatments' }
  await remove('treatments', `trial_id=eq.${id}&n=not.in.(${trts.map((t) => t.n).join(',') || 0})`, token)
  const rows = assessmentRows(id, d)
  if (rows.length && !(await upsertOn('assessments', rows, 'trial_id,n', token))) return { id, ok: false, failed: 'assessments' }
  await remove('assessments', `trial_id=eq.${id}&n=not.in.(${rows.map((a) => a.n).join(',') || 0})`, token)
  return { id, ok: true }
}

/** Load a saved trial back into the builder's draft shape. */
export function draftFromTrial(t: LiveTrial, trts: TreatmentRow[], assess: AssessmentRow[], lines: (t: TreatmentRow) => TreatmentLine[]): TrialDraft {
  const dz = (t.design ?? {}) as Record<string, unknown>
  const locked: Record<number, Array<{ rep: number; plot: number }>> = {}
  for (const tr of trts) {
    const byRep = tr.components?.plotsByRep
    const plots = tr.components?.plots ?? []
    locked[tr.n] = byRep ? Object.entries(byRep).map(([rep, plot]) => ({ rep: Number(rep), plot: Number(plot) })) : plots.map((plot, i) => ({ rep: i + 1, plot }))
  }
  const plotsAll = Object.values(locked).flat().map((p) => p.plot)
  const grid = (dz.grid as { rows?: number; positions?: number } | undefined) ?? {}
  const type = typeof dz.type === 'string' ? (dz.type === 'RCB' ? 'RCBD' : dz.type) : 'RCBD'
  return {
    name: t.name,
    season: t.season ?? new Date().getFullYear(),
    trialType: (t.trial_type as TrialDraft['trialType']) ?? 'plot',
    crop: t.crop ?? '',
    variety: t.variety ?? '',
    sownDate: t.sown_date ?? '',
    aim: t.aim ?? '',
    clientId: t.client_id,
    siteId: t.site_id,
    protocolId: t.protocol_id,
    groupId: t.group_id,
    design: {
      type: ['RCBD', 'CRD', 'Latin square', 'Strips', 'Demo'].includes(type) ? type : 'RCBD',
      reps: typeof dz.reps === 'number' ? dz.reps : Math.max(1, ...Object.values(locked).map((x) => x.length)),
      seed: typeof dz.seed === 'string' ? dz.seed : 'KEPT',
      demoRep: dz.demoRep === true,
      spare: typeof dz.spare === 'number' ? dz.spare : 0,
      plotW: t.design?.plot?.widthM ?? 2,
      plotL: t.design?.plot?.lengthM ?? 12,
      cv: typeof dz.expectedCv === 'number' ? dz.expectedCv : 15,
      rows: grid.rows ?? (plotsAll.length ? Math.max(...plotsAll.map((p) => Math.floor(p / 100))) : 0),
      positions: grid.positions ?? (plotsAll.length ? Math.max(...plotsAll.map((p) => p % 100)) : 0),
    },
    treatments: trts.map((tr) => ({ n: tr.n, lockedN: tr.n, name: tr.name, lines: lines(tr), note: Array.isArray(tr.components?.notes) ? (tr.components!.notes as string[]).join(' · ') || undefined : undefined })),
    assessments: assess.map((a) => ({ n: a.n, timing: a.timing ?? '', measures: a.measures ?? [], blind: a.blind })),
    editingId: t.id,
    lockedPlots: plotsAll.length ? locked : undefined,
    lockedSpare: Array.isArray(dz.sparePlots) ? (dz.sparePlots as number[]) : [],
    scores: t.scores,
    status: t.status,
  }
}

// --- Site features: tracks, gates, hazards and the like on the site map -------

export type FeatureKind = 'buffer' | 'track' | 'gate' | 'fence' | 'power_line' | 'water' | 'photo_point' | 'weather_station' | 'soil_sample' | 'hazard' | 'note'

export interface SiteFeatureRow {
  id: string
  site_id: string
  kind: FeatureKind
  name: string | null
  geojson: { type: 'Point' | 'LineString' | 'Polygon'; coordinates: unknown }
  props: Record<string, unknown>
  created_at: string
}

export function loadSiteFeatures(siteId: string, token: string): Promise<SiteFeatureRow[] | null> {
  return select<SiteFeatureRow>('site_features', `select=id,site_id,kind,name,geojson,props,created_at&site_id=eq.${siteId}&order=created_at.asc`, token)
}

/** Add a feature: one point, a line of points, or a closed ring. */
export async function addSiteFeature(siteId: string, kind: FeatureKind, name: string | null, shape: 'point' | 'line' | 'polygon', pts: LatLng[], props: Record<string, unknown>, token: string): Promise<string | null> {
  const id = crypto.randomUUID()
  const geom = shape === 'point' ? pointWkt(pts[0]) : shape === 'line' ? lineWkt(pts) : polygonWkt(pts)
  const ok = await insert('site_features', [{ id, site_id: siteId, kind, name, geom, props }], token)
  return ok ? id : null
}

export function renameSiteFeature(id: string, name: string | null, props: Record<string, unknown>, token: string): Promise<boolean> {
  return update('site_features', `id=eq.${id}`, { name, props }, token)
}

export function removeSiteFeature(id: string, token: string): Promise<boolean> {
  return remove('site_features', `id=eq.${id}`, token)
}

// --- Saved printouts -----------------------------------------------------------

export type PrintKind = 'trial-plan' | 'spray-plan' | 'plot-signs' | 'site-sign' | 'assessment-sheet' | 'report' | 'agreement' | 'grower-info' | 'whs'

/** Keep the exact page that went to the printer beside the trial: the HTML
 * lands in the private documents bucket and a documents row indexes it. */
export async function savePrintout(trialId: string, kind: PrintKind, filename: string, html: string, options: Record<string, unknown>, token: string): Promise<string | null> {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const path = `${ORG_ID}/${trialId}/${kind}-${stamp}.html`
  const up = await uploadObject('documents', path, new Blob([html], { type: 'text/html' }), token)
  if (!up) return null
  const id = crypto.randomUUID()
  const ok = await insert('documents', [{ id, trial_id: trialId, org_id: ORG_ID, kind, filename, storage_path: `supa:documents/${path}`, parsed: { status: 'generated', generatedAt: new Date().toISOString(), options, folder: 'Generated by the portal' }, uploaded_by: userIdFromToken(token) }], token)
  return ok ? id : null
}

/** Open a saved printout from the bucket in a new tab (signed-in read). */
export async function openStoredDocument(d: Pick<DocumentRow, 'storage_path'>, token: string, win?: Window | null): Promise<boolean> {
  const m = /^supa:([^/]+)\/(.+)$/.exec(d.storage_path)
  if (!m) {
    win?.close()
    return false
  }
  const blob = await fetchObject(m[1], m[2], token)
  if (!blob) {
    win?.close()
    return false
  }
  const url = URL.createObjectURL(blob.type.startsWith('text/html') ? blob : new Blob([blob], { type: 'text/html' }))
  // The caller opens the window inside the click so popup blockers allow it;
  // we only point it at the blob once the fetch is done.
  const target = win ?? window.open('', '_blank')
  if (!target) return false
  target.location.href = url
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
  return true
}

// --- Org settings (office configuration, no secrets) --------------------------

export interface OrgSettings {
  /** Google OAuth client id the portal uses to push printouts into Drive. */
  googleClientId?: string
  /** Top-level Drive folder the printouts go under. */
  driveFolder?: string
}

export async function loadOrgSettings(token: string): Promise<OrgSettings> {
  const rows = await select<{ settings: OrgSettings | null }>('orgs', `select=settings&id=eq.${ORG_ID}`, token)
  return rows?.[0]?.settings ?? {}
}

export async function saveOrgSettings(patch: OrgSettings, token: string): Promise<boolean> {
  const cur = await loadOrgSettings(token)
  return update('orgs', `id=eq.${ORG_ID}`, { settings: { ...cur, ...patch } }, token)
}

/** Record where a saved printout also landed in Drive. */
export function markDocumentDrive(docId: string, drive: { id: string; url: string }, token: string): Promise<boolean> {
  return select<{ parsed: Record<string, unknown> | null }>('documents', `select=parsed&id=eq.${docId}`, token).then((rows) =>
    update('documents', `id=eq.${docId}`, { parsed: { ...(rows?.[0]?.parsed ?? {}), drive } }, token)
  )
}

export interface PersonRow {
  id: string
  name: string
  role: string
}

export function loadPeople(token: string): Promise<PersonRow[] | null> {
  return select<PersonRow>('people', 'select=id,name,role&order=name.asc', token)
}

// --- Yield map points (paddock-scale strips) ----------------------------------

export interface YieldMeanRow {
  plot: number
  treatment: number | null
  n: number
  mean: number
  sd: number
  moisture: number | null
}

/** Insert cleaned points in batches. Returns the number inserted. */
export async function uploadYieldPoints(trialId: string, source: string, pts: Array<{ lat: number; lng: number; yieldTHa: number; moisturePct: number | null; recordedAt: string | null }>, token: string, onProgress?: (done: number) => void): Promise<number> {
  const size = 500
  let done = 0
  for (let i = 0; i < pts.length; i += size) {
    const rows = pts.slice(i, i + size).map((p) => ({ trial_id: trialId, source, geom: pointWkt(p), yield_t_ha: Math.round(p.yieldTHa * 1000) / 1000, moisture_pct: p.moisturePct, recorded_at: p.recordedAt && !Number.isNaN(Date.parse(p.recordedAt)) ? new Date(p.recordedAt).toISOString() : null }))
    if (!(await insert('yield_points', rows, token))) return done
    done += rows.length
    onProgress?.(done)
  }
  return done
}

export function clearYieldPoints(trialId: string, source: string, token: string): Promise<boolean> {
  return remove('yield_points', `trial_id=eq.${trialId}&source=eq.${encodeURIComponent(source)}`, token)
}

export const assignYieldPoints = (trialId: string, token: string) => rpc<number>('assign_yield_points', { p_trial: trialId }, token)
export const plotYieldMeans = (trialId: string, token: string) =>
  rpc<Array<Record<string, unknown>>>('plot_yield_means', { p_trial: trialId }, token).then((rows) =>
    rows ? rows.map((r): YieldMeanRow => ({ plot: Number(r.plot), treatment: r.treatment == null ? null : Number(r.treatment), n: Number(r.n), mean: Number(r.mean), sd: Number(r.sd), moisture: r.moisture == null ? null : Number(r.moisture) })) : null
  )

export function loadYieldSources(trialId: string, token: string): Promise<Array<{ source: string; n: number; assigned: number }> | null> {
  return select<{ source: string; plot: number | null }>('yield_points', `select=source,plot&trial_id=eq.${trialId}`, token).then((rows) => {
    if (!rows) return null
    const m = new Map<string, { n: number; assigned: number }>()
    for (const r of rows) {
      const e = m.get(r.source) ?? { n: 0, assigned: 0 }
      e.n++
      if (r.plot != null) e.assigned++
      m.set(r.source, e)
    }
    return [...m.entries()].map(([source, e]) => ({ source, ...e }))
  })
}

/** Corrections for one trial, oldest first, in the report's shape. */
export function loadTrialCorrections(trialId: string, token: string): Promise<Array<{ plot: number; kind: string; measure: string | null; old_value: number | null; new_value: number | null; reason: string | null; made_at: string }> | null> {
  return select('corrections', `select=plot,kind,measure,old_value,new_value,reason,made_at&trial_id=eq.${trialId}&order=made_at.asc`, token)
}
