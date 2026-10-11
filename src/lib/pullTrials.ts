/**
 * Pull trials built in the office portal down to the phone. The phone stays
 * local-first: a pulled trial becomes an ordinary TrialDoc in IndexedDB
 * (keyed by its backend uuid, so field data syncs straight back to it), and
 * nothing here is needed to keep working offline. Pure mapping functions are
 * exported for test/pullTrials.test.ts.
 */
import { select } from '../../shared/supa'
import { ringFromGeoJson } from '../../shared/geometry'
import type { LatLng, MeasureDef, MeasureLib, StoredPlot, TrialDoc, Treatment } from '../store/types'

export interface OfficeTreatment {
  n: number
  name: string
  recipe: string | null
  b_spray: boolean
  components: {
    plots?: number[] | Record<string, number>
    plotsByRep?: Record<string, number>
    perBatchMl?: number[] | null
    [k: string]: unknown
  } | null
}

export interface OfficeAssessment {
  n: number
  timing: string | null
  measures: string[]
  blind: boolean
}

export interface OfficeTrial {
  id: string
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
    reservePlots?: number[]
    marginalPlots?: number[]
    sparePlots?: number[]
    outPlots?: number[]
    notes?: string[]
    source?: string
  } | null
  spraying: {
    waterRateLPerHa?: number
    sprayVolumePerPlotMl?: number
    batchVolumeL?: number
    timings?: Record<string, { due?: string; applied?: string }>
  } | null
  sites: { property: string | null; town: string | null; paddock: string | null; soil: string | null; lat: number | null; lng: number | null } | null
  clients: { name: string; contact: { phone?: string } | null } | null
  treatments: OfficeTreatment[]
  assessments: OfficeAssessment[]
}

export interface OfficeMeasure {
  key: string
  label: string
  unit: string | null
  group_key: string | null
  canonical: string | null
}

export interface OfficePlot {
  plot: number
  geojson: { type: string; coordinates: number[][][] } | null
}

const TRIAL_SELECT =
  'select=id,name,season,status,trial_type,crop,variety,sown_date,aim,design,spraying,' +
  'sites(property,town,paddock,soil,lat,lng),clients(name,contact),' +
  'treatments(n,name,recipe,b_spray,components),assessments(n,timing,measures,blind)' +
  '&status=in.(approved,active)&order=season.desc,name.asc'

/** Approved and active trials in the org, with treatments and assessments. */
export function listOfficeTrials(token: string): Promise<OfficeTrial[] | null> {
  return select<OfficeTrial>('trials', TRIAL_SELECT, token)
}

export function loadOfficeMeasures(token: string): Promise<OfficeMeasure[] | null> {
  return select<OfficeMeasure>('measures', 'select=key,label,unit,group_key,canonical&active=is.true&order=label.asc', token)
}

export function loadOfficePlots(trialId: string, token: string): Promise<OfficePlot[] | null> {
  return select<OfficePlot>('plots', `select=plot,geojson&trial_id=eq.${trialId}&kind=in.(plot,strip)&order=plot.asc`, token)
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const isUuid = (s: string) => UUID.test(s)

export function plotList(c: OfficeTreatment['components']): number[] {
  const p = c?.plots
  if (Array.isArray(p)) return [...p].map(Number).filter((x) => Number.isFinite(x)).sort((a, b) => a - b)
  if (p && typeof p === 'object') return Object.values(p).map(Number).filter((x) => Number.isFinite(x)).sort((a, b) => a - b)
  return []
}

/** The phone's measure library for this trial: the assessment plan's keys
 * first, then the rest of the shared library, grouped the way the Assess
 * screen tabs them (disease / weeds / crop). */
export function measureLibFor(t: OfficeTrial, lib: OfficeMeasure[]): MeasureLib {
  const planned = [...new Set(t.assessments.slice().sort((a, b) => a.n - b.n).flatMap((a) => a.measures ?? []))]
  const byKey = new Map(lib.map((m) => [m.key, m]))
  const def = (m: OfficeMeasure): MeasureDef => [m.key, m.label, m.unit ?? '']
  const grouped = (keys: string[]): MeasureLib => {
    const out: MeasureLib = { disease: [], weeds: [], crop: [], defaultActive: [] }
    for (const k of keys) {
      const m = byKey.get(k)
      if (!m) {
        out.crop.push([k, k, ''])
        continue
      }
      const d = def(m)
      if (m.group_key === 'disease') out.disease.push(d)
      else if (m.group_key === 'weed') out.weeds.push(d)
      else out.crop.push(d)
    }
    return out
  }
  const rest = lib.filter((m) => !m.canonical && !planned.includes(m.key)).map((m) => m.key)
  const out = grouped([...planned, ...rest])
  const first = t.assessments.slice().sort((a, b) => a.n - b.n)[0]
  out.defaultActive = (first?.measures ?? planned).slice(0, 4)
  if (!out.defaultActive.length) out.defaultActive = [out.disease[0]?.[0] ?? out.crop[0]?.[0] ?? out.weeds[0]?.[0] ?? 'phytotox']
  return out
}

/** Rep bands by row, from the treatments' rep→plot maps (builder trials)
 * or by assuming one rep per row block when there is no map. */
function repBandsFor(t: OfficeTrial, rows: number, reps: number): Record<string, number[]> {
  const bands: Record<string, Set<number>> = {}
  for (const tr of t.treatments) {
    const byRep = tr.components?.plotsByRep
    if (!byRep) continue
    for (const [rep, plot] of Object.entries(byRep)) (bands[rep] ??= new Set()).add(Math.floor(Number(plot) / 100))
  }
  if (Object.keys(bands).length) return Object.fromEntries(Object.entries(bands).map(([r, s]) => [r, [...s].sort((a, b) => a - b)]))
  if (reps > 0 && rows >= reps) {
    const per = Math.floor(rows / reps)
    const out: Record<string, number[]> = {}
    for (let r = 1; r <= reps; r++) out[String(r)] = Array.from({ length: per }, (_, i) => (r - 1) * per + i + 1)
    return out
  }
  return { '1': Array.from({ length: rows }, (_, i) => i + 1) }
}

/** Build the phone's TrialDoc from an office trial row. */
export function trialDocFromOffice(t: OfficeTrial, lib: OfficeMeasure[]): TrialDoc {
  const treatments: Treatment[] = t.treatments
    .slice()
    .sort((a, b) => a.n - b.n)
    .map((tr) => ({
      n: tr.n,
      name: tr.name,
      recipe: tr.recipe ?? '',
      bSpray: tr.b_spray,
      plots: plotList(tr.components),
      ...(Array.isArray(tr.components?.perBatchMl) ? { perBatchMl: tr.components!.perBatchMl as number[] } : {}),
    }))
  const allPlots = treatments.flatMap((x) => x.plots)
  const d = t.design ?? {}
  const rows = d.grid?.rows ?? Math.max(1, ...allPlots.map((p) => Math.floor(p / 100)))
  const positions = d.grid?.positions ?? Math.max(1, ...allPlots.map((p) => p % 100))
  const plot = d.plot ?? { widthM: 2, lengthM: 12, areaM2: 24 }
  const reps = d.reps ?? Math.max(1, ...treatments.map((x) => x.plots.length))
  const cells: TrialDoc['cells'] = {}
  for (const tr of treatments) for (const p of tr.plots) cells[String(p)] = tr.n
  for (const p of d.reservePlots ?? []) cells[String(p)] ??= 'reserve'
  for (const p of d.sparePlots ?? []) cells[String(p)] ??= 'spare'
  for (const p of d.outPlots ?? []) cells[String(p)] = 'out'
  const s = t.spraying ?? {}
  const waterRateLPerHa = s.waterRateLPerHa ?? 100
  const sprayVolumePerPlotMl = s.sprayVolumePerPlotMl ?? Math.round((waterRateLPerHa * plot.areaM2) / 10)
  const batchVolumeL = s.batchVolumeL ?? Math.round(sprayVolumePerPlotMl * reps * 1.3) / 1000
  const tm = s.timings ?? {}
  const timing = (k: string) => ({ ...(tm[k]?.due ? { due: tm[k].due } : {}), ...(tm[k]?.applied ? { sprayed: tm[k].applied } : {}) })
  return {
    id: t.id,
    trial: {
      name: t.name,
      org: 'AGnVET Services',
      season: t.season ?? new Date().getFullYear(),
      design: d.type ?? 'RCBD',
      reps,
      blocking: 'row',
      grid: { rows, positions },
      repBands: repBandsFor(t, rows, reps),
      plot,
      waterRateLPerHa,
      sprayVolumePerPlotMl,
      batchVolumeL,
      timings: { A: timing('A'), B: timing('B') },
      sourceDocument: d.source ?? 'Office portal',
    },
    treatments,
    cells,
    marginalPlots: d.marginalPlots ?? [],
    plotIdRule: 'plot = rep × 100 + position',
    walkOrders: {
      assessment: 'Serpentine by position: pos 1 rows 1→n, pos 2 rows n→1, … treatment plots only.',
      fieldDay: d.type === 'Demo' ? 'Walk the single row in treatment order.' : 'Rep 1 display walk across the front rows.',
    },
    measures: measureLibFor(t, lib),
    notes: [...(t.aim ? [`Aim: ${t.aim}`] : []), ...(d.notes ?? [])],
  }
}

/** Site facts for the phone's Site screen, from the office record. */
export function siteInfoFromOffice(t: OfficeTrial): { cooperator: [string, string][]; paddock: [string, string][]; notes: string } {
  const s = t.sites
  const prop = [s?.property, s?.town && s.town !== s.property ? s.town : null].filter(Boolean).join(', ')
  return {
    cooperator: [
      ['Grower', t.clients?.name ?? '—'],
      ['Property', prop || '—'],
      ['Phone', t.clients?.contact?.phone ?? '—'],
      ['Agronomist', 'A. Rolfe — AGnVET'],
    ],
    paddock: [
      ['Crop / variety', [t.crop, t.variety].filter(Boolean).join(' · ') || '—'],
      ['Sown', t.sown_date ?? '—'],
      ['Paddock', s?.paddock ?? '—'],
      ['Soil', s?.soil ?? '—'],
    ],
    notes: t.aim ?? '',
  }
}

/** Stored plot polygons (from the office site planner) as the phone's shape. */
export function storedPlotsFrom(rows: OfficePlot[]): StoredPlot[] {
  const out: StoredPlot[] = []
  for (const r of rows) {
    const ring = ringFromGeoJson(r.geojson)
    if (ring.length < 4) continue
    const corners: LatLng[] = ring.slice(0, 4).map((p) => ({ lat: p.lat, lng: p.lng }))
    const centre = { lat: corners.reduce((a, c) => a + c.lat, 0) / 4, lng: corners.reduce((a, c) => a + c.lng, 0) / 4 }
    out.push({ pid: r.plot, corners, centre })
  }
  return out
}
