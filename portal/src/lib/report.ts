/** Trial report from the record: cover, site and season, applications,
 * treatments, results per assessment round (treatment means with LSD
 * letters where the data are balanced, ranked bars, plot map), field
 * observations and data notes. Pure HTML builder, tested in
 * test/report.test.ts; the Plans and signs screen previews and prints it.
 * Numbers are plot means and RCBD ANOVA with LSD at 5%, nothing fancier. */
import { cellColors } from './layout'
import { rcbdAnova, type Anova } from './stats'
import { esc, treatmentLines } from './printouts'
import { fitGrid, type GeoPoint } from './geofit'
import { satelliteMapHtml, type MapOptions, type MapPolygon } from './sitemap'
import { pointsFromGeoJson, ringFromGeoJson, type LatLng } from '../../../shared/geometry'
import type { LiveTrial, MeasureDef, OperationRow, PlotRow, ScoreRow, SiteFeatureRow, TreatmentRow, WeatherDay } from './db'

export interface ReportCorrection {
  plot: number
  kind: string
  measure: string | null
  old_value: number | null
  new_value: number | null
  reason: string | null
  made_at: string
}

export interface ReportOptions {
  /** DRAFT band and watermark. */
  draft?: boolean
  /** Treatment codes only, for a blind read. */
  blind?: boolean
  /** Measure key to rank and map; default is chosen from the data. */
  primary?: string
  /** Who signs the report. */
  author?: string
}

export interface ReportData {
  trial: LiveTrial
  treatments: TreatmentRow[]
  scores: ScoreRow[]
  measures: Map<string, MeasureDef>
  weather?: WeatherDay[]
  operations?: OperationRow[]
  corrections?: ReportCorrection[]
  photosByPlot?: Record<number, number>
  /** Stored plot polygons from the site planner; drawn on the satellite map when present. */
  plots?: PlotRow[]
  /** GPS positions of plot photos; when no plots are stored, a grid is fitted to these. */
  photoPoints?: Array<{ plot: number; lat: number; lng: number }>
  /** Gates, tracks, hazards and the like, drawn on the map. */
  features?: SiteFeatureRow[]
  options?: ReportOptions
}

export interface Round {
  key: string
  assessment: number
  label: string
  from: string
  to: string
  measures: string[]
  scores: ScoreRow[]
}

const fmt = (n: number, d = 1) => (Number.isFinite(n) ? n.toFixed(d) : '—')
const dateAu = (iso: string) => new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
const dayOf = (iso: string) => iso.slice(0, 10)

/** Fallback labels and direction for keys the library does not know. */
const HIGHER_BETTER_FALLBACK = /^(pgreen|ndvi|vigour|cropsafe|control_pct|ctrl_|biomass|plants|plant_count|dm_|yield|pod_count|feed_)/

/** Rounds: scores grouped by assessment number, split again where the
 * recorded dates jump by more than a week (one number used for two visits). */
export function splitRounds(scores: ScoreRow[], measures: Map<string, MeasureDef>): Round[] {
  const byA = new Map<number, ScoreRow[]>()
  for (const s of scores) (byA.get(s.assessment) ?? byA.set(s.assessment, []).get(s.assessment)!).push(s)
  const rounds: Round[] = []
  for (const [a, rows] of [...byA.entries()].sort((x, y) => x[0] - y[0])) {
    const sorted = [...rows].sort((x, y) => x.recorded_at.localeCompare(y.recorded_at))
    let cur: ScoreRow[] = []
    let last = ''
    const flush = () => {
      if (!cur.length) return
      const days = [...new Set(cur.map((s) => dayOf(s.recorded_at)))].sort()
      const ms = [...new Set(cur.map((s) => s.measure))].sort((x, y) => groupRank(measures.get(x)) - groupRank(measures.get(y)) || x.localeCompare(y))
      rounds.push({ key: `${a}-${days[0]}`, assessment: a, label: '', from: days[0], to: days[days.length - 1], measures: ms, scores: cur })
      cur = []
    }
    for (const s of sorted) {
      const d = dayOf(s.recorded_at)
      if (last && (Date.parse(d) - Date.parse(last)) / 86400000 > 7) flush()
      cur.push(s)
      last = d
    }
    flush()
  }
  // label: Assessment n, with a letter when one number was split
  const seen = new Map<number, number>()
  for (const r of rounds) {
    const k = (seen.get(r.assessment) ?? 0) + 1
    seen.set(r.assessment, k)
    r.label = `Assessment ${r.assessment}${k > 1 ? String.fromCharCode(96 + k) : ''}`
  }
  const dup = new Set([...seen.entries()].filter(([, n]) => n > 1).map(([a]) => a))
  for (const r of rounds) if (dup.has(r.assessment) && !/[a-z]$/.test(r.label)) r.label += 'a'
  return rounds
}

const GROUP_ORDER = ['disease', 'weed', 'crop', 'yield', 'forage']
const groupRank = (m?: MeasureDef) => {
  const i = GROUP_ORDER.indexOf(m?.group_key ?? '')
  return i < 0 ? 9 : i
}

export function labelOf(k: string, measures: Map<string, MeasureDef>): string {
  return measures.get(k)?.label ?? k
}
export function higherBetter(k: string, measures: Map<string, MeasureDef>): boolean {
  const m = measures.get(k)
  return m ? m.higher_better : HIGHER_BETTER_FALLBACK.test(k)
}

export interface TrtStat {
  n: number
  name: string
  plots: number[]
  values: number[]
  mean: number | null
  sd: number | null
}

/** Per-treatment values for one measure in one round, in rep order (the
 * order of the treatment's plot list), with the mean of the plots scored. */
export function treatmentStats(trts: TreatmentRow[], scores: ScoreRow[], measure: string): TrtStat[] {
  const byPlot = new Map<number, number>()
  for (const s of scores) if (s.measure === measure && s.value != null) byPlot.set(s.plot, Number(s.value))
  return trts.map((t) => {
    const plots = t.components?.plots ?? []
    const values = plots.map((p) => byPlot.get(p)).filter((v): v is number => v !== undefined)
    const mean = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null
    const sd = values.length > 1 && mean !== null ? Math.sqrt(values.reduce((a, v) => a + (v - mean) ** 2, 0) / (values.length - 1)) : null
    return { n: t.n, name: t.name, plots, values, mean, sd }
  })
}

/** ANOVA when every treatment has the same complete set of reps. */
export function anovaFor(stats: TrtStat[]): Anova | null {
  const r = stats[0]?.plots.length ?? 0
  if (r < 2 || stats.some((s) => s.plots.length !== r || s.values.length !== r)) return null
  const data: Record<string, number[]> = {}
  for (const s of stats) data[`T${s.n}`] = s.values
  return rcbdAnova(data)
}

/** Pick the measure to rank and map: the one with most plots scored,
 * disease first. */
export function pickPrimary(round: Round, measures: Map<string, MeasureDef>): string {
  const counts = new Map<string, number>()
  for (const s of round.scores) counts.set(s.measure, (counts.get(s.measure) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => groupRank(measures.get(a[0])) - groupRank(measures.get(b[0])) || b[1] - a[1])[0]?.[0] ?? round.measures[0]
}

// --- pieces ------------------------------------------------------------------

function ramp(t: number, green: boolean): string {
  const a = green ? [227, 241, 234] : [251, 234, 227]
  const b = green ? [0, 81, 47] : [126, 36, 6]
  const mix = (i: number) => Math.round(a[i] + (b[i] - a[i]) * t)
  return `rgb(${mix(0)},${mix(1)},${mix(2)})`
}

function barsSvg(stats: TrtStat[], anova: Anova | null, better: boolean, unit: string, blind: boolean): string {
  const rows = stats.filter((s) => s.mean !== null).sort((a, b) => (better ? b.mean! - a.mean! : a.mean! - b.mean!))
  if (!rows.length) return ''
  const max = Math.max(...rows.map((r) => r.mean! + (r.sd ?? 0)), 1)
  const W = 700
  const labelW = blind ? 60 : 230
  const barW = W - labelW - 110
  const h = 18
  const lines = rows.map((r, i) => {
    const y = i * h
    const w = (r.mean! / max) * barW
    const sdw = r.sd ? (r.sd / max) * barW : 0
    const untreated = /untreated|nil|control/i.test(r.name) && r.n === 1
    const letter = anova?.letters[`T${r.n}`] ?? ''
    return `<text x="${labelW - 6}" y="${y + 13}" text-anchor="end" font-size="10.5" fill="#141414" font-weight="${untreated ? 400 : 600}">${esc(blind ? `T${r.n}` : `T${r.n} ${r.name}`.slice(0, 38))}</text>
      <rect x="${labelW}" y="${y + 3}" width="${w.toFixed(1)}" height="${h - 6}" rx="2" fill="${untreated ? '#B9BBB9' : '#007749'}"/>
      ${sdw ? `<line x1="${(labelW + w - sdw).toFixed(1)}" x2="${(labelW + w + sdw).toFixed(1)}" y1="${y + h / 2}" y2="${y + h / 2}" stroke="#141414" stroke-width="1"/>` : ''}
      <text x="${(labelW + w + sdw + 6).toFixed(1)}" y="${y + 13}" font-size="10.5" font-family="IBM Plex Mono, monospace" fill="#141414">${fmt(r.mean!)}${letter ? ` <tspan fill="#58585B">${esc(letter)}</tspan>` : ''}</text>`
  })
  return `<svg viewBox="0 0 ${W} ${rows.length * h + 18}" width="100%" style="max-width:${W}px;display:block">
    ${lines.join('')}
    <text x="${labelW}" y="${rows.length * h + 14}" font-size="9.5" fill="#8A8C8A">${esc(unit)} · ${better ? 'higher' : 'lower'} is better${anova ? ` · LSD 5% = ${fmt(anova.lsd05)} · CV ${fmt(anova.cv, 0)}% · treatments sharing a letter do not differ` : ' · unbalanced, no LSD'}</text>
  </svg>`
}

function plotMapHtml(trial: LiveTrial, trts: TreatmentRow[], scores: ScoreRow[], measure: string, better: boolean): string {
  const trtOf = new Map<number, number>()
  for (const t of trts) for (const p of t.components?.plots ?? []) trtOf.set(p, t.n)
  const val = new Map<number, number>()
  for (const s of scores) if (s.measure === measure && s.value != null) val.set(s.plot, Number(s.value))
  const plots = [...trtOf.keys()]
  if (!plots.length) return ''
  const rows = trial.design?.grid?.rows ?? Math.max(...plots.map((p) => Math.floor(p / 100)))
  const positions = trial.design?.grid?.positions ?? Math.max(...plots.map((p) => p % 100))
  const vals = [...val.values()]
  const lo = Math.min(...vals)
  const hi = Math.max(...vals)
  const cells: string[] = []
  for (let r = 1; r <= rows; r++) {
    for (let p = 1; p <= positions; p++) {
      const pid = r * 100 + p
      const t = trtOf.get(pid)
      const v = val.get(pid)
      if (t === undefined) {
        cells.push('<div class="cell" style="background:#F4F5F4;color:#B9BBB9"><span class="mono" style="font-size:9px">·</span></div>')
        continue
      }
      const tt = v === undefined ? 0 : hi > lo ? (v - lo) / (hi - lo) : 0.5
      const bg = v === undefined ? '#fff' : ramp(better ? tt : tt, !better ? false : true)
      const fg = tt > 0.55 ? '#fff' : '#141414'
      cells.push(`<div class="cell" style="background:${bg};color:${fg};border:1px solid #D8DAD8"><span class="mono" style="font-size:9px;opacity:.8">${pid}</span><b>T${t}</b><span style="font-size:9px">${v === undefined ? '' : fmt(v)}</span></div>`)
    }
  }
  return `<div class="grid" style="grid-template-columns:repeat(${positions},1fr);max-width:${Math.min(positions * 64, 720)}px">${cells.join('')}</div>
  <p class="muted" style="margin-top:6px">Shade = ${esc(measure)} from ${fmt(lo)} (light) to ${fmt(hi)} (dark). Rows down the page, positions across; plot = row × 100 + position.</p>`
}

/** Satellite map of the block. Plot polygons come from the stored placement
 * when the planner has one, otherwise from a least-squares grid fitted to the
 * GPS positions of the plot photos (labelled as such, never surveyed), and
 * failing both the site pin alone. Tiles are Esri World Imagery. */
export function siteMapHtml(d: ReportData): string {
  const { trial, treatments } = d
  const blind = !!d.options?.blind
  const trtOf = new Map<number, number>()
  for (const t of treatments) for (const p of t.components?.plots ?? []) trtOf.set(Number(p), t.n)
  const nameOf = new Map(treatments.map((t) => [t.n, blind ? `T${t.n}` : t.name]))
  const poly = (ring: LatLng[], plot: number, trt: number | null, kind: string): MapPolygon => {
    const cc = trt ? cellColors(trt) : cellColors(0)
    return { ring, fill: trt === 1 ? '#ffffff' : cc.bg, opacity: trt === 1 ? 0.35 : 0.6, label: String(plot), title: `Plot ${plot}${trt ? ` · T${trt} ${nameOf.get(trt) ?? ''}` : ` · ${kind}`}`.trim() }
  }
  let polygons: MapPolygon[] = []
  let caption = ''
  const stored = (d.plots ?? []).filter((p) => p.kind === 'plot' || p.kind === 'strip')
  if (stored.length) {
    polygons = stored.map((p) => poly(ringFromGeoJson(p.geojson), p.plot, p.treatment ?? trtOf.get(p.plot) ?? null, p.kind)).filter((p) => p.ring.length >= 3)
    caption = `${polygons.length} plots as placed in the site planner${trial.site?.planned ? '' : ' (planned, not pegged)'}.`
  } else if (d.photoPoints && d.photoPoints.length) {
    const pts: GeoPoint[] = d.photoPoints.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng)).map((p) => ({ lat: p.lat, lng: p.lng, row: Math.floor(p.plot / 100), pos: p.plot % 100 }))
    const fit = fitGrid(pts)
    if (fit) {
      const plots = [...new Set([...trtOf.keys(), ...(trial.design?.marginalPlots ?? []), ...(trial.design?.reservePlots ?? []), ...(trial.design?.sparePlots ?? [])])].sort((a, b) => a - b)
      polygons = plots.map((p) => poly(fit.cell(Math.floor(p / 100), p % 100).map(([lat, lng]) => ({ lat, lng })), p, trtOf.get(p) ?? null, 'plot'))
      caption = `Plot grid fitted to the GPS positions of ${fit.points} plot photos (fit error ${fit.rmsM.toFixed(1)} m RMS). Indicative only, not surveyed; the block has not been placed in the site planner.`
    }
  }
  const pins: NonNullable<MapOptions['pins']> = []
  const lines: NonNullable<MapOptions['lines']> = []
  if (!polygons.length && trial.site?.lat != null && trial.site?.lng != null) {
    pins.push({ at: { lat: trial.site.lat, lng: trial.site.lng }, label: 'Site' })
    caption = 'Site pin only: no plots placed and no GPS-tagged plot photos yet.'
  }
  for (const f of d.features ?? []) {
    const label = f.name ?? f.kind.replace(/_/g, ' ')
    if (f.geojson.type === 'Point') {
      const [lng, lat] = f.geojson.coordinates as number[]
      pins.push({ at: { lat, lng }, label, colour: f.kind === 'hazard' ? '#cf4520' : '#F2A900' })
    } else if (f.geojson.type === 'LineString') {
      lines.push({ pts: pointsFromGeoJson(f.geojson), label, colour: f.kind === 'power_line' ? '#cf4520' : '#F2A900', dash: f.kind !== 'track' })
    } else if (f.geojson.type === 'Polygon') {
      polygons.push({ ring: ringFromGeoJson(f.geojson as { type: string; coordinates: number[][][] }), fill: f.kind === 'hazard' ? '#cf4520' : '#F2A900', opacity: 0.2, stroke: '#F2A900', label, title: label })
    }
  }
  if (trial.site?.boundary_geojson) {
    const ring = ringFromGeoJson(trial.site.boundary_geojson)
    if (ring.length >= 3 && polygons.length) polygons.unshift({ ring, fill: 'none', opacity: 0, stroke: '#ffffff' })
  }
  const map = satelliteMapHtml(polygons, { width: 700, maxHeight: 560, maxScale: 4, padM: polygons.length ? 15 : 120, pins, lines, attribution: '' })
  if (!map) return ''
  const legend = polygons.length && trtOf.size
    ? `<div style="flex:1;min-width:180px;display:grid;grid-template-columns:${treatments.length > 12 ? '1fr 1fr' : '1fr'};gap:2px 12px;font-size:10px;line-height:1.3;align-content:start">${treatments.map((t) => { const cc = t.n === 1 ? { bg: '#fff', border: '1px dashed #B9BBB9' } : cellColors(t.n); return `<div style="display:flex;gap:6px;align-items:center"><span style="flex:none;width:11px;height:11px;border-radius:2px;background:${cc.bg};border:${cc.border}"></span><span class="mono" style="width:24px">T${t.n}</span><span>${blind ? '' : esc(t.name)}</span></div>` }).join('')}</div>`
    : ''
  return `<div class="keep"><h2>Site map</h2><div style="display:flex;gap:16px;align-items:flex-start">${map}${legend}</div><p class="muted" style="margin-top:4px">${esc(caption)} North is up; plot colours follow the treatment number, untreated plots are left clear. Imagery © Esri, Maxar, Earthstar Geographics.</p></div>`
}

function weatherHtml(weather: WeatherDay[], sown: string | null): string {
  if (!weather.length) return ''
  const from = sown ?? weather[0].date
  const rows = weather.filter((w) => w.date >= from)
  const months = new Map<string, { rain: number; min: number[]; max: number[]; days: number; hot: number; frost: number }>()
  for (const w of rows) {
    const k = w.date.slice(0, 7)
    const m = months.get(k) ?? { rain: 0, min: [], max: [], days: 0, hot: 0, frost: 0 }
    m.rain += w.rain ?? 0
    if (w.min_temp != null) m.min.push(w.min_temp)
    if (w.max_temp != null) m.max.push(w.max_temp)
    m.days++
    if ((w.max_temp ?? 0) >= 30) m.hot++
    if ((w.min_temp ?? 9) <= 0) m.frost++
    months.set(k, m)
  }
  const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN)
  const total = rows.reduce((a, w) => a + (w.rain ?? 0), 0)
  const src = [...new Set(rows.map((w) => w.source))]
  return `<table><thead><tr><th>Month</th><th class="num">Rain mm</th><th class="num">Mean min °C</th><th class="num">Mean max °C</th><th class="num">Days ≥ 30 °C</th><th class="num">Frost days (≤ 0 °C)</th></tr></thead><tbody>
    ${[...months.entries()].map(([k, m]) => `<tr><td>${new Date(k + '-01T00:00:00').toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })}${m.days < 28 ? ` <span class="muted">(${m.days} d)</span>` : ''}</td><td class="num">${fmt(m.rain, 0)}</td><td class="num">${fmt(avg(m.min))}</td><td class="num">${fmt(avg(m.max))}</td><td class="num">${m.hot}</td><td class="num">${m.frost}</td></tr>`).join('')}
    <tr><th>Total from ${sown ? 'sowing' : 'first record'}</th><th class="num">${fmt(total, 0)}</th><th colspan="4" style="font-weight:400" class="muted">${esc(src.includes('station') ? 'weather station, SILO grid where the station has gaps' : 'SILO 5 km grid (Queensland DES), not a site gauge')}</th></tr>
  </tbody></table>`
}

function applicationsHtml(ops: OperationRow[], trial: LiveTrial): string {
  const rows: string[] = []
  const sow = ops.find((o) => o.kind === 'sow')
  if (sow) {
    const d = (sow.detail ?? {}) as Record<string, string>
    rows.push(`<tr><td>Sowing</td><td>${esc(dateAu(sow.performed_at))}</td><td>${esc([d.variety && `variety ${d.variety}`, d.fert && `fertiliser ${d.fert}`, d.preEm && `pre-emergent ${d.preEm}`, d.stubble && `stubble ${d.stubble}`].filter(Boolean).join(' · '))}</td></tr>`)
  }
  for (const o of ops.filter((x) => x.kind === 'spray').sort((a, b) => a.performed_at.localeCompare(b.performed_at))) {
    const cond = Object.entries(o.conditions ?? {}).filter(([k]) => k !== 'Date').map(([k, v]) => `${k} ${v}`).join(', ')
    const planned = o.timing ? trial.spraying?.timings?.[o.timing] : undefined
    rows.push(`<tr><td>Application ${esc(o.timing ?? '')}</td><td>${esc(planned?.applied ? dateAu(planned.applied) : dateAu(o.performed_at))}</td><td>${esc([o.detail?.sprayed?.length ? `${o.detail.sprayed.length} plots` : null, cond || null, o.detail?.note ?? null, o.equipment_id?.name ?? null].filter(Boolean).join(' · '))}</td></tr>`)
  }
  if (!rows.length) return '<p class="muted">No operations on the record.</p>'
  return `<table><thead><tr><th style="width:18%">Operation</th><th style="width:16%">Date</th><th>Detail</th></tr></thead><tbody>${rows.join('')}</tbody></table>
  <p class="muted" style="margin-top:4px">Water rate ${esc(String(trial.spraying?.waterRateLPerHa ?? '—'))} L/ha${trial.design?.plot ? `, ${trial.design.plot.widthM} × ${trial.design.plot.lengthM} m plots` : ''}.</p>`
}

const FLAG_RE = /(PLOT DAMAGE|MARGINAL|recheck|Recheck|not called|garbled|unclear|excluded|reassigned|wrong bottle|scratch|discard)/

function observationsHtml(rounds: Round[], trts: TreatmentRow[], corrections: ReportCorrection[], blind: boolean): string {
  const trtOf = new Map<number, number>()
  for (const t of trts) for (const p of t.components?.plots ?? []) trtOf.set(p, t.n)
  const items: string[] = []
  for (const r of rounds) {
    const seen = new Set<string>()
    for (const s of r.scores) {
      if (!s.note || !FLAG_RE.test(s.note)) continue
      // keep the human part of the note, drop the plant readings prefix
      const text = s.note.replace(/^plants [^—|]*—\s*/, '').replace(/\s*\[voice transcript[^\]]*\]/g, '').trim()
      const key = `${s.plot}:${text}`
      if (seen.has(key)) continue
      seen.add(key)
      items.push(`<li><span class="mono">${s.plot}</span>${blind ? '' : ` <span class="muted">T${trtOf.get(s.plot) ?? '?'}</span>`} · ${esc(r.label)}: ${esc(text)}</li>`)
    }
  }
  const corr = corrections.length ? `<p style="margin-top:8px"><b>${corrections.length} correction${corrections.length === 1 ? '' : 's'}</b> on the record${corrections.length <= 12 ? ': ' + corrections.map((c) => `${c.plot} ${c.kind}${c.measure ? ` ${c.measure}` : ''}${c.old_value != null && c.new_value != null ? ` ${fmt(c.old_value)} → ${fmt(c.new_value)}` : ''}`).join('; ') : ', listed in the audit log'}. Every change keeps the old value, the new value, who made it and why.</p>` : ''
  return (items.length ? `<ul style="margin:0;padding-left:18px;line-height:1.5">${items.join('')}</ul>` : '<p class="muted">No flagged plots.</p>') + corr
}

// --- the report --------------------------------------------------------------

export function trialReportHtml(d: ReportData): string {
  const { trial, treatments, scores, measures } = d
  const o = d.options ?? {}
  const blind = !!o.blind
  const rounds = splitRounds(scores, measures)
  const site = trial.site ? [trial.site.property, trial.site.town].filter(Boolean).join(', ') : ''
  const logo = typeof document !== 'undefined' ? new URL('assets/agnvet-logo.png', document.baseURI).href : ''
  const plotsN = new Set(treatments.flatMap((t) => t.components?.plots ?? [])).size
  const draftBand = o.draft ? '<div style="margin:0 0 16px;padding:8px 14px;border-radius:6px;background:#FBEDE8;border-bottom:2px solid #cf4520;color:#A93414;font-size:11px;font-weight:800;letter-spacing:.08em">DRAFT · PLOT MEANS AND FIELD NOTES AS RECORDED · NOT FOR DISTRIBUTION</div>' : ''
  const page = (body: string) => `<div class="page">${body}</div>`
  const hdr = (kind: string) => `<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px"><div><div class="eyebrow">${esc(kind)}</div><div style="font-size:15px;font-weight:800">${esc(trial.name)}</div></div>${logo ? `<img src="${esc(logo)}" alt="AGnVET" style="height:26px">` : ''}</div>`

  // cover
  const cover = `${draftBand}
    <div style="display:flex;justify-content:space-between;align-items:flex-start">
      <div><div class="eyebrow">Trial report · ${esc(String(trial.season ?? ''))} season</div><h1 style="font-size:28px">${esc(trial.name)}</h1>
      <div class="grey" style="font-size:13px">${esc([site, [trial.crop, trial.variety].filter(Boolean).join(' '), trial.sown_date ? `sown ${dateAu(trial.sown_date)}` : null].filter(Boolean).join(' · '))}</div></div>
      ${logo ? `<img src="${esc(logo)}" alt="AGnVET" style="height:36px">` : ''}
    </div>
    ${trial.aim ? `<p style="font-size:13.5px;line-height:1.5;margin:14px 0 10px">${esc(trial.aim)}</p>` : ''}
    <div class="kv" style="margin-top:12px">
      <b>Client</b><span>${esc(trial.client?.name ?? '—')}</span>
      <b>Site</b><span>${esc(site || '—')}${trial.site?.lat != null && trial.site?.lng != null ? ` <span class="mono muted">${trial.site.lat.toFixed(5)}, ${trial.site.lng.toFixed(5)}</span>` : ''}</span>
      <b>Design</b><span>${esc([trial.design?.type, trial.design?.reps ? `${trial.design.reps} reps` : null, `${treatments.length} treatments`, `${plotsN} plots`, trial.design?.plot ? `${trial.design.plot.widthM} × ${trial.design.plot.lengthM} m` : null].filter(Boolean).join(' · '))}</span>
      <b>Assessments</b><span>${rounds.length ? rounds.map((r) => `${r.label} (${dateAu(r.from)}${r.to !== r.from ? ` to ${dateAu(r.to)}` : ''})`).join(', ') : 'none synced yet'}</span>
      <b>Agronomist</b><span>${esc(o.author ?? 'Andrew Rolfe, AGnVET Services')}</span>
      <b>Report date</b><span>${dateAu(new Date().toISOString())}</span>
    </div>
    <h2>Summary of results</h2>
    ${rounds.length ? rounds.map((r) => {
      const pm = o.primary && r.measures.includes(o.primary) ? o.primary : pickPrimary(r, measures)
      const stats = treatmentStats(treatments, r.scores, pm)
      const an = anovaFor(stats)
      const better = higherBetter(pm, measures)
      const ranked = stats.filter((s) => s.mean !== null).sort((a, b) => (better ? b.mean! - a.mean! : a.mean! - b.mean!))
      const unt = stats.find((s) => /untreated|nil|control/i.test(s.name)) ?? stats[0]
      const top = ranked.slice(0, 3)
      return `<p><b>${esc(r.label)}, ${esc(labelOf(pm, measures))}</b>: untreated ${unt?.mean != null ? fmt(unt.mean) : '—'}; best ${top.map((s) => `${blind ? `T${s.n}` : esc(s.name)} ${fmt(s.mean!)}${an?.letters[`T${s.n}`] ? ` ${an.letters[`T${s.n}`]}` : ''}`).join(', ')}${an ? `. LSD 5% ${fmt(an.lsd05)}, CV ${fmt(an.cv, 0)}%.` : '. Plot means only (unbalanced, no LSD).'}</p>`
    }).join('') : '<p class="muted">No assessment scores have synced for this trial.</p>'}
    ${trial.design?.notes?.length ? `<h2>Notes on the record</h2><ul style="margin:0;padding-left:18px;line-height:1.5">${trial.design.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
    ${footerLine(trial)}`

  // site and season
  const season = `${hdr('Site, season and applications')}
    ${siteMapHtml(d)}
    ${d.weather?.length ? `<h2>Weather at the site</h2>${weatherHtml(d.weather, trial.sown_date)}` : ''}
    <div class="keep"><h2>Operations</h2>${applicationsHtml(d.operations ?? [], trial)}</div>
    <h2>Treatments</h2>
    <table><thead><tr><th>#</th><th>Treatment</th><th>Products and rates by timing</th><th>Plots</th></tr></thead><tbody>
      ${treatments.map((t) => `<tr><td class="mono"><b>T${t.n}</b></td><td><b>${blind ? `T${t.n}` : esc(t.name)}</b></td><td>${blind ? '—' : recipe(t)}</td><td class="mono">${(t.components?.plots ?? []).join(' ')}</td></tr>`).join('')}
    </tbody></table>${footerLine(trial)}`

  // results per round
  const results = rounds.map((r) => {
    const pm = o.primary && r.measures.includes(o.primary) ? o.primary : pickPrimary(r, measures)
    const better = higherBetter(pm, measures)
    const primaryStats = treatmentStats(treatments, r.scores, pm)
    const primaryAnova = anovaFor(primaryStats)
    const cols = r.measures
    const statsBy = new Map(cols.map((m) => [m, treatmentStats(treatments, r.scores, m)]))
    const anovaBy = new Map(cols.map((m) => [m, anovaFor(statsBy.get(m)!)]))
    const plotsScored = new Set(r.scores.map((s) => s.plot)).size
    const method = [...new Set(cols.map((m) => measures.get(m)?.sample).filter(Boolean))].join('; ')
    return `${hdr(`${r.label} · ${dateAu(r.from)}${r.to !== r.from ? ` to ${dateAu(r.to)}` : ''}`)}
      <p class="muted">${plotsScored} of ${plotsN} plots scored · ${cols.map((m) => esc(labelOf(m, measures))).join(', ')}${method ? ` · ${esc(method)}` : ''}</p>
      <h2>Treatment means</h2>
      <table><thead><tr><th>#</th><th>Treatment</th>${cols.map((m) => `<th class="num" colspan="2">${esc(labelOf(m, measures))}${measures.get(m)?.unit ? `<br><span class="muted" style="font-weight:400">${esc(measures.get(m)!.unit!)}</span>` : ''}</th>`).join('')}</tr></thead><tbody>
        ${treatments.map((t) => `<tr><td class="mono">T${t.n}</td><td>${blind ? `T${t.n}` : esc(t.name)}</td>${cols.map((m) => { const s = statsBy.get(m)!.find((x) => x.n === t.n)!; const l = anovaBy.get(m)?.letters[`T${t.n}`] ?? ''; return `<td class="num"><b>${s.mean == null ? '—' : fmt(s.mean)}</b>${s.sd != null ? ` <span class="muted">±${fmt(s.sd)}</span>` : ''}${s.values.length && s.values.length !== s.plots.length ? ` <span class="muted">(${s.values.length}/${s.plots.length})</span>` : ''}</td><td style="width:28px;color:#58585B">${esc(l)}</td>` }).join('')}</tr>`).join('')}
        <tr><th colspan="2">LSD 5% · CV</th>${cols.map((m) => { const a = anovaBy.get(m); return `<th class="num" colspan="2" style="font-weight:600">${a ? `${fmt(a.lsd05)} · ${a.cv > 200 ? 'CV n/a (near zero)' : `${fmt(a.cv, 0)}%`}` : '<span class="muted">unbalanced</span>'}</th>` }).join('')}</tr>
      </tbody></table>
      <p class="muted" style="margin-top:4px">Mean ± SD across reps. Letters from RCBD ANOVA with LSD at 5%: treatments sharing a letter do not differ. A fraction after a mean is plots scored of plots allocated.</p>
      <div class="keep"><h2>Ranked · ${esc(labelOf(pm, measures))}</h2>
      ${barsSvg(primaryStats, primaryAnova, better, measures.get(pm)?.unit ?? '', blind)}</div>
      <div class="keep"><h2>Plot map · ${esc(labelOf(pm, measures))}</h2>
      ${plotMapHtml(trial, treatments, r.scores, pm, better)}</div>
      ${footerLine(trial)}`
  })

  const obs = `${hdr('Field observations and data notes')}
    <h2>Flagged plots</h2>${observationsHtml(rounds, treatments, d.corrections ?? [], blind)}
    ${d.photosByPlot && Object.keys(d.photosByPlot).length ? `<h2>Photos</h2><p>${Object.values(d.photosByPlot).reduce((a, b) => a + b, 0)} plot photos on the record across ${Object.keys(d.photosByPlot).length} plots; available on request or through the office portal.</p>` : ''}
    <h2>How to read this report</h2>
    <ul style="margin:0;padding-left:18px;line-height:1.5">
      <li>Scores are the assessor's plot readings as synced from the field, with corrections applied and logged. Machine measures (photo green cover, NDVI, yield map) are shown beside them and never replace them.</li>
      <li>Treatment means are across replicates. Where every treatment has the same complete set of replicates, letters come from a randomised complete block ANOVA with LSD at 5%; otherwise plot means are shown without letters.</li>
      <li>Visual differences smaller than the LSD are not a result. Products marked EXP are experimental and not registered for this use.</li>
      <li>Measures follow the AGnVET assessment library; target organisms carry EPPO codes in the data export so another company can read the file.</li>
    </ul>
    ${footerLine(trial)}`

  return [page(cover), page(season), ...results.map(page), obs].join('')
}

function recipe(t: TreatmentRow): string {
  const lines = treatmentLines(t)
  if (!lines.length) return esc(t.recipe || 'Untreated')
  const by = new Map<string, string[]>()
  for (const l of lines) (by.get(l.timing) ?? by.set(l.timing, []).get(l.timing)!).push(`${esc(l.product)}${l.rate != null ? ` ${fmt(l.rate, 2).replace(/\.?0+$/, '')} ${esc(l.unit)}` : ''}${l.exp ? ' <span class="exp">EXP</span>' : ''}`)
  return [...by.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([tm, ps]) => `<b>${tm}:</b> ${ps.join(' + ')}`).join('<br>')
}

const footerLine = (trial: LiveTrial) => `<div class="foot"><span>${esc(trial.name)} · AGnVET Trial Work</span><span>Report generated ${new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}</span></div>`
