/** Trial report: rounds split by date gap, balanced ANOVA letters, blind
 * mode, flagged-plot digest. */
import { anovaFor, pickPrimary, splitRounds, treatmentStats, trialReportHtml, type ReportData } from '../portal/src/lib/report'
import type { LiveTrial, MeasureDef, ScoreRow, TreatmentRow } from '../portal/src/lib/db'

let passed = 0
function check(name: string, cond: boolean) {
  if (!cond) {
    console.error('FAIL', name)
    process.exitCode = 1
  } else {
    passed++
  }
}

const trts: TreatmentRow[] = [
  { n: 1, name: 'Untreated', recipe: 'Untreated', b_spray: false, components: { plots: [101, 202, 303] } },
  { n: 2, name: 'Prosaro', recipe: 'A: Prosaro 300 mL/ha', b_spray: false, components: { plots: [102, 203, 301], lines: [{ timing: 'A', product: 'Prosaro', rate: 300, unit: 'mL/ha' }] } },
  { n: 3, name: 'Aviator', recipe: 'A: Aviator 500 mL/ha', b_spray: false, components: { plots: [103, 201, 302], lines: [{ timing: 'A', product: 'Aviator', rate: 500, unit: 'mL/ha' }] } },
]
const sc = (assessment: number, day: string, plot: number, measure: string, value: number, note: string | null = null): ScoreRow => ({ id: `${assessment}-${day}-${plot}-${measure}`, assessment, plot, measure, value, note, recorded_at: `${day}T02:00:00Z` })
const vals: Record<number, number> = { 101: 40, 202: 45, 303: 50, 102: 10, 203: 12, 301: 14, 103: 20, 201: 22, 302: 24 }
const scores: ScoreRow[] = [
  ...Object.entries(vals).map(([p, v]) => sc(1, '2026-09-02', Number(p), 'sept_a1', v)),
  ...Object.entries(vals).map(([p, v]) => sc(1, '2026-10-08', Number(p), 'dmg_f1', v / 2, Number(p) === 303 ? 'plants 10/20/30 — PLOT DAMAGE: back half missing [voice transcript 8 Oct]' : null)),
  sc(1, '2026-10-08', 101, 'pgreen', 40),
]
const measures = new Map<string, MeasureDef>([
  ['sept_a1', { key: 'sept_a1', label: 'Septoria tritici blotch % leaf area, F-3 at A1', rating: 'pct_lai', unit: '%', target: 'SEPTTR', part: 'F-3', sample: '4 plants per plot', higher_better: false, min: 0, max: 100, decimals: 1, group_key: 'disease', canonical: null, note: null, taxa: null }],
  ['dmg_f1', { key: 'dmg_f1', label: 'Total disease % leaf area, F-1', rating: 'pct_lai', unit: '%', target: null, part: 'F-1', sample: null, higher_better: false, min: 0, max: 100, decimals: 1, group_key: 'disease', canonical: null, note: null, taxa: null }],
  ['pgreen', { key: 'pgreen', label: 'Green cover % from plot photos', rating: 'pct', unit: '%', target: null, part: 'plot', sample: null, higher_better: true, min: 0, max: 100, decimals: 1, group_key: 'crop', canonical: null, note: null, taxa: null }],
])

const rounds = splitRounds(scores, measures)
check('one assessment number split into two rounds by date', rounds.length === 2 && rounds[0].label === 'Assessment 1a' && rounds[1].label === 'Assessment 1b')
check('round dates', rounds[0].from === '2026-09-02' && rounds[1].from === '2026-10-08')
check('round measures ordered disease first', rounds[1].measures.join() === 'dmg_f1,pgreen')
const st = treatmentStats(trts, rounds[0].scores, 'sept_a1')
check('means per treatment', st[0].mean === 45 && st[1].mean === 12 && st[2].mean === 22)
const an = anovaFor(st)
check('balanced data gives an ANOVA with letters', an !== null && an.letters.T1 !== an.letters.T2)
check('unbalanced measure gives no ANOVA', anovaFor(treatmentStats(trts, rounds[1].scores, 'pgreen')) === null)
check('primary measure is the fuller disease one', pickPrimary(rounds[1], measures) === 'dmg_f1')

const trial: LiveTrial = { id: 't', site_id: 's', client_id: null, approved_by: null, group_id: null, protocol_id: null, name: 'Report Test <2026>', season: 2026, status: 'active', trial_type: 'plot', crop: 'Wheat', variety: 'Scepter', sown_date: '2026-05-01', aim: 'Test aim.', design: { type: 'RCBD', reps: 3, grid: { rows: 3, positions: 3 }, plot: { widthM: 2, lengthM: 12, areaM2: 24 }, notes: ['a record note'] }, spraying: { waterRateLPerHa: 100 }, site: { id: 's', property: 'Glenview', town: 'Matong', lat: -34.8, lng: 146.9, boundary_geojson: null, planned: false }, client: { name: 'G. Hamilton', contact: null }, layout: null, scores: 0, plotsScored: 0, sprayTicks: 0, lastActivity: null }
const d: ReportData = { trial, treatments: trts, scores, measures, weather: [{ date: '2026-05-02', min_temp: 4, max_temp: 18, rain: 12, source: 'silo' }, { date: '2026-06-02', min_temp: -1, max_temp: 31, rain: 0, source: 'silo' }], operations: [{ kind: 'spray', timing: 'A', performed_at: '2026-08-06T02:00:00Z', detail: { sprayed: [101, 102], note: 'A pass' }, conditions: { Operator: 'A. Rolfe' }, equipment_id: null }], corrections: [{ plot: 303, kind: 'value', measure: 'dmg_f1', old_value: 30, new_value: 25, reason: 'recheck', made_at: '2026-10-09T00:00:00Z' }], photosByPlot: { 101: 3 }, options: { draft: true } }
const html = trialReportHtml(d)
check('report escapes and carries the name', html.includes('Report Test &lt;2026&gt;') && !html.includes('<2026>'))
check('five pages: cover, season, two rounds, observations', (html.match(/class="page"/g) ?? []).length === 4 && html.includes('Field observations and data notes'))
check('draft band present', html.includes('DRAFT · PLOT MEANS'))
check('weather table with frost and hot days', html.includes('June 2026') && html.includes('<td class="num">1</td><td class="num">1</td>'))
check('operations row', html.includes('Application A') && html.includes('2 plots'))
check('LSD line in the means table', /LSD 5% · CV/.test(html) && /\d+\.\d · \d+%/.test(html))
check('ranked bars svg', html.includes('<svg') && html.includes('lower is better'))
check('plot map drawn', (html.match(/class="cell"/g) ?? []).length >= 9)
check('flagged plot and correction listed', html.includes('PLOT DAMAGE: back half missing') && html.includes('1 correction') && html.includes('30.0 → 25.0'))
check('summary names the best treatment', html.includes('best Prosaro'))
const blind = trialReportHtml({ ...d, options: { blind: true } })
check('blind report hides names and recipes', !blind.includes('Prosaro') && blind.includes('T2'))
const outTrial: LiveTrial = { ...trial, design: { ...trial.design!, outPlots: [303] } }
const outHtml = trialReportHtml({ ...d, trial: outTrial })
check('out plot dropped from means and shown on the map', outHtml.includes('1 plot excluded from the analysis (303)') && outHtml.includes('>OUT</b>') && /untreated 42\.5/.test(outHtml))
check('every field note is listed, office notes are not', outHtml.includes('PLOT DAMAGE: back half missing') && !trialReportHtml({ ...d, scores: [...scores, sc(1, '2026-10-08', 102, 'pgreen', 50, 'Derived in the office as (q1 + q2) x 5')] }).includes('Derived in the office'))
const rowsM = new Map(measures)
rowsM.set('till_q1', { ...measures.get('dmg_f1')!, key: 'till_q1', part: 'quadrat', group_key: 'weed' })
rowsM.set('till_m2', { ...measures.get('dmg_f1')!, key: 'till_m2', part: 'plot', group_key: 'weed' })
const rr = splitRounds([sc(4, '2026-10-22', 101, 'till_q1', 3), sc(4, '2026-10-22', 101, 'till_m2', 40), sc(4, '2026-10-22', 102, 'till_q1', 1)], rowsM)
check('per-plot measure beats the raw quadrat count as primary', pickPrimary(rr[0], rowsM) === 'till_m2')
check('bare plant readings are not observations', !trialReportHtml({ ...d, scores: [...scores, sc(1, '2026-10-08', 102, 'dmg_f', 5, 'plants 5/5/5')] }).includes('plants 5/5/5'))
const shared = trialReportHtml({ ...d, scores: [...scores, ...[101, 102, 103, 201].map((p) => sc(1, '2026-09-02', p, 'rust_a1', 1, 'sheet column X, confirm'))] })
check('a note shared by four plots is listed once with its plots', (shared.match(/sheet column X, confirm/g) ?? []).length === 1 && shared.includes('4 plots') && shared.includes('(101, 102, 103, 201)'))
check('a measure scored on one plot is not a results column', !trialReportHtml({ ...d, scores: [...scores, sc(1, '2026-09-02', 101, 'rust_a1', 1)] }).includes('<th class="num" colspan="2">rust_a1'))
// the agronomist's read prints on the cover only when given
const withRead = trialReportHtml({ ...d, options: { commentary: ['Two-pass programs held the ryegrass.', 'Check the <crop> safety on T4.'] } })
check('commentary printed and escaped', withRead.includes("Agronomist's read") && withRead.includes('Two-pass programs held the ryegrass.') && withRead.includes('&lt;crop&gt;'))
check('no commentary section without entries', !html.includes("Agronomist's read"))
// an operation with no date yet prints as pending instead of crashing the report
const pending = trialReportHtml({ ...d, operations: [...(d.operations ?? []), { kind: 'spray', timing: 'C', performed_at: null as unknown as string, detail: { note: 'third pass, date to come' }, conditions: {}, equipment_id: null }] })
check('undated operation prints as pending', pending.includes('date pending') && pending.includes('third pass, date to come'))
console.log(`report: ${passed} checks passed`)
