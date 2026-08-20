/** Parser validation against the real handoff fixtures.
 * Run: npm test  (node --experimental-strip-types test/parsers.test.ts) */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import assert from 'node:assert/strict'

import { parseSprayMapPdf } from '../src/parsers/sprayMapPdf.ts'
import { parseMixingPlan } from '../src/parsers/mixingPlan.ts'
import { readXlsx } from '../src/parsers/xlsxRead.ts'
import { buildAssessmentWorkbook } from '../src/exports/assessmentExport.ts'
import { assessmentOrder, fieldDayStops } from '../src/lib/trial.ts'
import { gridFromCorners, locate } from '../src/gps/geo.ts'
import type { TrialDoc, TrialState } from '../src/store/types.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const fixture = (name: string) => new Uint8Array(readFileSync(join(root, 'fixtures', name)))
const expected = JSON.parse(readFileSync(join(root, 'fixtures', 'matong-trial.json'), 'utf8'))

let passed = 0
const test = (name: string, fn: () => void) => {
  try {
    fn()
    passed++
    console.log(`  ✓ ${name}`)
  } catch (e) {
    console.error(`  ✗ ${name}`)
    throw e
  }
}

// ---- spray map PDF parser --------------------------------------------------
console.log('spray map PDF parser')
const { doc, stats } = parseSprayMapPdf(fixture('Matong_Wheat_Spray_Map.pdf'), 'Matong_Wheat_Spray_Map.pdf')

test('cell grid matches matong-trial.json exactly (96 cells)', () => {
  const want: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(expected.cells)) {
    want[k] = v === 'sp' ? 'spare' : v === 'sk' ? 'skip' : v === 'res' ? 'reserve' : v
  }
  assert.equal(Object.keys(doc.cells).length, 96)
  assert.deepEqual(doc.cells, want)
})

test('24 treatments with correct names, plots and B flags', () => {
  assert.equal(doc.treatments.length, 24)
  for (const t of expected.treatments) {
    const got = doc.treatments.find((x) => x.n === t.n)!
    assert.ok(got, `T${t.n} missing`)
    assert.equal(got.name, t.name, `T${t.n} name`)
    assert.deepEqual(got.plots, t.plots, `T${t.n} plots`)
    assert.equal(got.bSpray, t.bSpray, `T${t.n} bSpray`)
  }
})

test('marginal plots 702/802, 5 OUT, grid 12×8, rep bands', () => {
  assert.deepEqual([...doc.marginalPlots].sort(), [702, 802])
  assert.equal(stats.out, 5)
  assert.deepEqual(doc.trial.grid, { rows: 12, positions: 8 })
  assert.deepEqual(doc.trial.repBands, expected.trial.repBands)
})

test('plot spec + water rate parsed', () => {
  assert.equal(doc.trial.plot.widthM, 2)
  assert.equal(doc.trial.plot.lengthM, 12)
  assert.equal(doc.trial.waterRateLPerHa, 100)
})

// ---- walk orders -----------------------------------------------------------
console.log('walk orders')
test('assessment serpentine = 72 stops, starts 101…1201, then 1202 back down', () => {
  const order = assessmentOrder(doc)
  assert.equal(order.length, 72)
  assert.equal(order[0], 101)
  assert.equal(order[11], 1201)
  assert.equal(order[12], 1202)
})

test('field-day walk = 24 stops of rep 1', () => {
  const stops = fieldDayStops(doc)
  assert.equal(stops.length, 24)
  assert.equal(stops[0], 101)
  assert.equal(stops[12], 1202)
  assert.equal(stops[23], 102)
})

// ---- mixing plan parser ----------------------------------------------------
console.log('mixing plan parser')
const mix = parseMixingPlan(fixture('Fungicide_Mixing_Plan_revD.xlsx'), 'Fungicide_Mixing_Plan_revD.xlsx')
test('24 treatments from the Wheat Mixing sheet', () => {
  assert.equal(mix.stats.sheet, 'Wheat Mixing')
  assert.equal(mix.doc.treatments.length, 24)
})
test('batch volume math: Aviator Xpro 500 mL/ha → 7.5 mL per 1.5 L batch', () => {
  const t2 = mix.doc.treatments.find((t) => t.n === 2)!
  assert.equal(t2.name, 'Aviator Xpro')
  assert.deepEqual(t2.perBatchMl, [7.5])
  assert.equal(mix.stats.batchL, 1.5)
})
test('multi-product treatment 5 has 3 per-batch volumes', () => {
  const t5 = mix.doc.treatments.find((t) => t.n === 5)!
  assert.deepEqual(t5.perBatchMl, [4.8, 1.875, 7.5])
})
test('B-timing rows mark bSpray (T2 yes, T22 A-only … per sheet)', () => {
  assert.equal(mix.doc.treatments.find((t) => t.n === 2)!.bSpray, true)
  assert.equal(mix.doc.treatments.find((t) => t.n === 22)!.bSpray, false)
})

// ---- xlsx round trip -------------------------------------------------------
console.log('excel export')
test('assessment workbook round-trips with Junee-shaped columns', () => {
  const ts: TrialState = {
    scores: { 101: { v: { rust: 5, phy: 0 }, photoIds: ['x'], ts: 1, by: 'A. Rolfe' } },
    activeMeasures: ['rust', 'phy'],
    assessIdx: 0,
    assessField: 'rust',
    blind: false,
    issues: [{ id: 1, pid: 505, type: 'Wrong bottle', txt: '', when: '', status: 'fixed', corr: '505 · was T14 → now T20 as applied · issue #1' }],
    relabel: { 505: 20 },
    excluded: [],
    mixDone: {},
    sprDone: {},
    conditions: { Date: '6 Aug 2026' },
    walkI: 0,
    photos: [],
    site: { cooperator: [], paddock: [], fert: [], notes: '', pinned: false },
  }
  const bytes = buildAssessmentWorkbook(doc as TrialDoc, ts)
  const back = readXlsx(bytes)
  assert.deepEqual(back.map((s) => s.name), ['Assessment 1', 'Treatment Data', 'Correction Log'])
  const head = back[0].rows[2]
  assert.deepEqual(head.slice(0, 6), ['Plot #', 'Block', 'Trt #', 'Treatment', 'App A', 'App B'])
  const r101 = back[0].rows.find((r) => r[0] === '101')!
  assert.equal(r101[6], '5') // rust
  assert.equal(head[6], 'Stripe rust %')
  const r505 = back[0].rows.find((r) => r[0] === '505')!
  assert.equal(r505[2], '20') // corrected treatment
  assert.match(String(r505.at(-1)), /was T14, now T20/)
  const corr = back[2].rows
  assert.deepEqual(corr[1], ['Plot #', 'Was Trt #', 'Was labelled', 'Corrected Trt #', 'Corrected treatment', 'Source'])
  assert.equal(corr[2][0], '505')
  assert.equal(corr[2][2], 'Experimental 4 A')
  assert.equal(corr[2][4], 'Experimental 4 B')
})

// ---- GPS grid --------------------------------------------------------------
console.log('gps grid')
test('two corners lay 72 treatment + 2 reserve footprints; locate finds the plot', () => {
  const A = { lat: -34.7085, lng: 146.9241, accuracy: 1.9 }
  const grid0 = gridFromCorners(A, { lat: -34.70864, lng: 146.92428, accuracy: 2.1 }, doc as TrialDoc)
  assert.equal(grid0.polygons.length, 74)
  const p101 = grid0.polygons.find((p) => p.pid === 101)!
  const hit = locate({ ...p101.centre, accuracy: 1.5 }, grid0)
  assert.equal(hit.pid, 101)
  assert.equal(hit.confidence, 'plot')
  const coarse = locate({ ...p101.centre, accuracy: 8 }, grid0)
  assert.equal(coarse.confidence, 'row')
})

console.log(`\n${passed} tests passed`)
