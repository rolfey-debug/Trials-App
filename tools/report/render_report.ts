/* Render a trial report from a data pack. See tools/report/README.md.
 *   npx tsx tools/report/render_report.ts pack.json measures.json out/ [plots.json] [weather.json]
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { trialReportHtml, treatmentStats, anovaFor, type ReportData, type ReportCorrection } from '../../portal/src/lib/report'
import { documentHtml } from '../../portal/src/lib/printouts'
import { deriveYield } from '../../portal/src/lib/harvest'
import { lsdBetween } from '../../portal/src/lib/stats'
import type { LiveTrial, MeasureDef, TreatmentRow, ScoreRow, PlotRow } from '../../portal/src/lib/db'

const [packPath, measuresPath, outDir, plotsPath, weatherPath] = process.argv.slice(2)
if (!packPath || !measuresPath || !outDir) {
  console.error('usage: render_report.ts pack.json measures.json out/ [plots.json] [weather.json]')
  process.exit(1)
}
;(globalThis as unknown as { document: unknown }).document = { baseURI: 'https://rolfey-debug.github.io/Trials-App/office/' }
const read = (p: string) => JSON.parse(readFileSync(p, 'utf8'))
const pack = read(packPath)
const measures = new Map<string, MeasureDef>((read(measuresPath) as MeasureDef[]).map((m) => [m.key, { taxa: null, ...m }]))
const plotList = (p: unknown): number[] =>
  Array.isArray(p) ? p.map(Number) : p && typeof p === 'object' ? Object.keys(p as object).sort((a, b) => Number(a) - Number(b)).map((k) => Number((p as Record<string, number>)[k])) : []

const t = pack.trial
const site = pack.site ?? {}
const trial: LiveTrial = { ...t, site: { id: site.id, property: site.property, town: site.town, lat: site.lat, lng: site.lng, boundary_geojson: null, planned: false }, client: null, layout: null, scores: 0, plotsScored: 0, sprayTicks: 0, lastActivity: null }
// Reps: an office plotsByRep map when the record has one, else plots in
// ascending order are reps 1..n (row blocking in a 12 x 8 grid).
const treatments: TreatmentRow[] = pack.treatments.map((x: { n: number; name: string; recipe?: string; b_spray?: boolean; components?: Record<string, unknown> }) => {
  const c = x.components ?? {}
  const ps = plotList(c.plots)
  const byRep = c.plots && !Array.isArray(c.plots) ? (c.plots as Record<string, number>) : (c.plotsByRep as Record<string, number> | undefined) ?? Object.fromEntries(ps.map((p, i) => [String(i + 1), p]))
  return { n: x.n, name: x.name, recipe: x.recipe ?? '', b_spray: !!x.b_spray, components: { ...c, plots: ps, plotsByRep: byRep } } as TreatmentRow
})
const scores: ScoreRow[] = deriveYield(
  (pack.scores ?? []).map((s: ScoreRow) => ({ id: s.id, assessment: s.assessment, plot: s.plot, measure: s.measure, value: Number(s.value), note: s.note, recorded_at: s.recorded_at })),
  { crop: t.crop, design: t.design },
)
const corrections: ReportCorrection[] = (pack.corrections ?? []).map((c: ReportCorrection) => ({ plot: c.plot, kind: c.kind, measure: c.measure ?? null, old_value: c.old_value ?? null, new_value: c.new_value ?? null, reason: c.reason, made_at: c.made_at }))
const photosByPlot: Record<number, number> = {}
for (const [p, n] of Object.entries(pack.photos ?? {})) photosByPlot[Number(p)] = n as number
const plots: PlotRow[] = plotsPath ? (read(plotsPath) ?? []).map((p: PlotRow) => ({ ...p, trial_id: t.id })) : []
const weather = weatherPath ? read(weatherPath) ?? [] : []
const commentary: string[] = t.design?.commentary ?? []

const data: ReportData = { trial, treatments, scores, measures, weather, operations: pack.operations ?? [], corrections, photosByPlot, plots, photoPoints: [], features: [], options: { draft: true, commentary } }
mkdirSync(outDir, { recursive: true })
const html = documentHtml(`${t.name} — trial report`, trialReportHtml(data)).replace('<head>', '<head><link rel="stylesheet" href="fonts/fonts.css">')
writeFileSync(`${outDir}/report.html`, html)
writeFileSync(`${outDir}/tiles.txt`, [...new Set([...html.matchAll(/src="(https:\/\/server\.arcgisonline\.com[^"]+)"/g)].map((m) => m[1]))].join('\n'))

// One-pager rows: yield per treatment with the same exclusions the report applies.
const excluded = new Set<number>([...(t.design?.outPlots ?? []), ...corrections.filter((c) => c.kind === 'exclude' && (!c.measure || c.measure === 'plot_weight_kg' || c.measure === 'yield_t_ha')).map((c) => c.plot)])
const st = treatmentStats(treatments, scores, 'yield_t_ha', excluded)
const an = anovaFor(st)
const Y = new Map(scores.filter((s) => s.measure === 'yield_t_ha').map((s) => [s.plot, Number(s.value)]))
const u = st.find((s) => s.n === 1) ?? st[0]
const fmt = (c: Array<{ product?: string; rate?: number; unit?: string }> | string | null | undefined) =>
  typeof c === 'string' ? c : (c ?? []).map((x) => [x.product, x.rate, x.unit].filter((v) => v != null).join(' ')).join(' + ') || '—'
const rows = st.map((s, i) => {
  const x = pack.treatments[i].components ?? {}
  const cells = s.plots.map((p) => (excluded.has(p) ? `<s>${p} ${Y.get(p)?.toFixed(2) ?? ''}</s>` : Y.has(p) ? `${p} ${Y.get(p)!.toFixed(2)}` : `${p} no weight`))
  const exv = s.extraPlots.map((p) => Y.get(p)).filter((v): v is number => v != null && !excluded.has(0))
  if (s.extraPlots.length) cells.push(s.extraPlots.length > 3 ? `extras ×${exv.length} mean ${(exv.reduce((a, b) => a + b, 0) / Math.max(1, exv.length)).toFixed(2)}` : s.extraPlots.map((p) => `${p}* ${Y.get(p)?.toFixed(2) ?? 'no weight'}`).join(', '))
  return { n: s.n, name: s.name, a: fmt(x.aTiming ?? x.A), b: pack.treatments[i].b_spray ? fmt(x.bTiming ?? x.B) : '—', mean: s.mean, nn: s.values.length, plots: cells.join(', '), lsdU: an ? lsdBetween(an, Math.max(1, s.values.length), Math.max(1, u.values.length)) : null }
})
writeFileSync(`${outDir}/rows.json`, JSON.stringify({ trial: t.name, rows, unt: u.mean, untN: u.values.length, f: an?.fTrt ?? null, lsd: an?.lsd05 ?? null, cv: an?.cv ?? null, dfErr: an?.dfError ?? null, grand: st.flatMap((s) => s.values).reduce((a, b) => a + b, 0) / Math.max(1, st.flatMap((s) => s.values).length) }, null, 1))
console.log(`${t.name}: ${scores.filter((s) => s.measure === 'yield_t_ha').length} yield rows; F ${an?.fTrt?.toFixed(2)} LSD ${an?.lsd05?.toFixed(2)} CV ${an?.cv?.toFixed(1)}; excluded ${[...excluded].join(' ') || 'none'}; tiles ${readFileSync(`${outDir}/tiles.txt`, 'utf8').split('\n').filter(Boolean).length}`)
