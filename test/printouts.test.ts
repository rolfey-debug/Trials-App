/** Printouts: treatment-line parsing across record shapes, mixing maths,
 * serpentine walk order and the HTML carrying the right facts. */
import { assessmentSheetHtml, batchFor, normaliseUnit, plotSignsHtml, productInBatch, serpentine, sprayPlanHtml, timingsOf, treatmentLines, trialPlanHtml, type PlanData } from '../portal/src/lib/printouts'
import type { LiveTrial, MeasureDef, TreatmentRow } from '../portal/src/lib/db'

let passed = 0
function check(name: string, cond: boolean) {
  if (!cond) {
    console.error('FAIL', name)
    process.exitCode = 1
  } else {
    passed++
  }
}
const near = (a: number, b: number, tol = 0.01) => Math.abs(a - b) <= tol

// --- treatment lines from the three record shapes ---------------------------
const builder: TreatmentRow = { n: 2, name: 'Prosaro then Aviator', recipe: 'A: Prosaro 300 mL/ha · B: Aviator Xpro 500 mL/ha', b_spray: true, components: { plots: [102, 203, 301], plotsByRep: { '1': 102, '2': 203, '3': 301 }, lines: [{ timing: 'A', product: 'Prosaro 420 SC', rate: 300, unit: 'mL/ha' }, { timing: 'B', product: 'Aviator Xpro', rate: 500, unit: 'mL/ha', exp: false }] } }
const matong: TreatmentRow = { n: 3, name: 'Aviator Xpro', recipe: 'A: Aviator Xpro 500 ml/ha · B: Soprano 500 125 ml/ha', b_spray: true, components: { plots: [205, 906], A: [{ product: 'Aviator Xpro', rate: 500, unit: 'ml/ha' }], B: [{ product: 'Soprano 500', rate: 125, unit: 'ml/ha' }] } }
const ringwood: TreatmentRow = { n: 4, name: 'Aviator Xpro', recipe: 'Aviator Xpro 500 mL/ha', b_spray: true, components: { plots: [102, 902, 1002], aTiming: 'Aviator Xpro 500 ml', bTiming: 'Soprano 500 125 ml' } }
const recipeOnly: TreatmentRow = { n: 5, name: 'Mix', recipe: 'A: Prosaro 300 mL/ha + Hasten 1 L/ha · B: Opus 500 g/ha', b_spray: true, components: { plots: [103] } }
const untreated: TreatmentRow = { n: 1, name: 'Untreated', recipe: 'Untreated', b_spray: false, components: { plots: [101, 202, 303] } }

const bl = treatmentLines(builder)
check('builder lines pass through', bl.length === 2 && bl[0].product === 'Prosaro 420 SC' && bl[1].timing === 'B')
const ml = treatmentLines(matong)
check('timing arrays become lines with normalised units', ml.length === 2 && ml[0].unit === 'mL/ha' && ml[1].product === 'Soprano 500' && ml[1].rate === 125)
const rl = treatmentLines(ringwood)
check('aTiming strings without /ha stay product-only', rl.length === 2 && rl[0].product === 'Aviator Xpro 500 ml' && rl[0].rate === null && rl[1].timing === 'B')
const ro = treatmentLines(recipeOnly)
check('recipe string parsed per timing and product', ro.length === 3 && ro[0].product === 'Prosaro' && ro[0].rate === 300 && ro[1].product === 'Hasten' && ro[1].unit === 'L/ha' && ro[2].timing === 'B' && ro[2].unit === 'g/ha')
check('untreated has no lines', treatmentLines(untreated).length === 0)
check('timings union', timingsOf([untreated, builder, matong]).join() === 'A,B')
check('unit normalisation', normaliseUnit('ml/ha') === 'mL/ha' && normaliseUnit('KG/HA') === 'kg/ha' && normaliseUnit('%') === '% v/v')

// --- mixing maths ------------------------------------------------------------
const b = batchFor({ waterRateLPerHa: 100, plotAreaM2: 24, plots: 3, overage: 0.3 })
check('240 mL per 24 m² plot at 100 L/ha', near(b.perPlotMl, 240))
check('batch 3 plots + 30% = 0.936 L', near(b.batchL, 0.936, 0.001))
check('batch area ha', near(b.batchHa, 0.00936, 1e-6))
const p = productInBatch({ timing: 'A', product: 'x', rate: 500, unit: 'mL/ha' }, b)
check('500 mL/ha → 4.68 mL in the batch', p !== null && near(p.amount, 4.68, 0.001) && p.unit === 'mL')
const l = productInBatch({ timing: 'A', product: 'x', rate: 1, unit: 'L/ha' }, b)
check('1 L/ha → 9.36 mL', l !== null && near(l.amount, 9.36, 0.001))
const g = productInBatch({ timing: 'A', product: 'x', rate: 500, unit: 'g/ha' }, b)
check('500 g/ha → 4.68 g', g !== null && near(g.amount, 4.68, 0.001) && g.unit === 'g')
const v = productInBatch({ timing: 'A', product: 'BS1000', rate: 0.1, unit: '% v/v' }, b)
check('0.1 % v/v of 0.936 L → 0.936 mL', v !== null && near(v.amount, 0.936, 0.001))
const h = productInBatch({ timing: 'A', product: 'x', rate: 200, unit: 'mL/100 L' }, b)
check('200 mL/100 L → 1.872 mL', h !== null && near(h.amount, 1.872, 0.001))
check('no rate → null', productInBatch({ timing: 'A', product: 'x', rate: null, unit: 'mL/ha' }, b) === null)

// --- serpentine --------------------------------------------------------------
check('serpentine order', serpentine([101, 102, 201, 202, 301, 302]).join() === '101,201,301,302,202,102')

// --- HTML carries the facts -------------------------------------------------
const trial: LiveTrial = {
  id: 't', site_id: 's', name: 'Test Trial <2027>', season: 2027, status: 'draft', trial_type: 'plot', crop: 'Wheat', variety: 'Scepter', sown_date: '2027-05-01', aim: 'See what works.',
  design: { type: 'RCBD', reps: 3, grid: { rows: 3, positions: 3 }, plot: { widthM: 2, lengthM: 12, areaM2: 24 }, notes: ['note one'] },
  spraying: { waterRateLPerHa: 100, timings: { A: { due: 'GS31' } } },
  site: { id: 's', property: 'Glenview', town: 'Matong', lat: null, lng: null, boundary_geojson: null, planned: true },
  client: { name: 'G. Hamilton', contact: null }, layout: null, scores: 0, plotsScored: 0, sprayTicks: 0, lastActivity: null,
}
const measures = new Map<string, MeasureDef>([
  ['rust_plot', { key: 'rust_plot', label: 'Stripe rust % whole plot', rating: 'pct_severity', unit: '%', target: 'PUCCST', part: 'plot', sample: null, higher_better: false, min: 0, max: 100, decimals: 1, group_key: 'disease', canonical: null, note: null, taxa: { scientific: 'Puccinia striiformis', common: 'stripe rust', kind: 'pathogen' } }],
])
const d: PlanData = { trial, treatments: [untreated, builder, matong], assessments: [{ n: 1, timing: 'GS39', measures: ['rust_plot', 'vigour'], blind: true }], measures }
const plan = trialPlanHtml(d)
check('plan escapes the name', plan.includes('Test Trial &lt;2027&gt;') && !plan.includes('<2027>'))
check('plan lists treatments, EPPO code and notes', plan.includes('Prosaro 420 SC') && plan.includes('PUCCST') && plan.includes('note one') && plan.includes('G. Hamilton'))
check('plan grid has 9 cells', (plan.match(/class="cell"/g) ?? []).length === 9)
const spray = sprayPlanHtml(d, { timing: 'B', waterRateLPerHa: 100, overage: 0.3 })
check('spray plan B lists both sprayed treatments and not the untreated', spray.includes('Soprano 500') && spray.includes('Aviator Xpro') && spray.includes('Not sprayed at B: T1 Untreated'))
check('spray plan B amount for Soprano 125 mL/ha over 2 plots + 30%', spray.includes('0.78 mL'))
const signs = plotSignsHtml(d, { size: 'a6', repOneOnly: false, blind: false })
check('8 plot signs over 2 sheets', (signs.match(/class="sign"/g) ?? []).length === 8 && (signs.match(/class="sheet a6"/g) ?? []).length === 2)
const rep1 = plotSignsHtml(d, { size: 'a5', repOneOnly: true, blind: true })
check('rep 1 only, blind: 3 signs without names', (rep1.match(/class="sign"/g) ?? []).length === 3 && !rep1.includes('Prosaro'))
const sheet = assessmentSheetHtml(d, d.assessments[0])
check('sheet has a row per plot in walk order and blank trt when blind', (sheet.match(/<tr><td class="mono"><b>\d+<\/b><\/td><td class="mono"><\/td>/g) ?? []).length === 8 && sheet.includes('Stripe rust % whole plot'))

console.log(`printouts: ${passed} checks passed`)
