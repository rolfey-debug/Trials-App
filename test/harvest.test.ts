/** Harvest: yield derived in the office from the phone's bucket weights. */
import { deriveYield, harvestedAreaM2, moistureStandard, yieldFromBucket } from '../portal/src/lib/harvest'
import { decimalsFor, fixedBackspace, fixedKeyDigit, fmtVal } from '../src/lib/trial'
import type { ScoreRow } from '../portal/src/lib/db'

let passed = 0
function check(name: string, cond: boolean) {
  if (!cond) {
    console.error('FAIL', name)
    process.exitCode = 1
  } else passed++
}
const near = (a: number, b: number, tol = 0.005) => Math.abs(a - b) <= tol

check('receival standards', moistureStandard('Wheat') === 12.5 && moistureStandard('Canola') === 8 && moistureStandard('Lupins') === 14 && moistureStandard(null) === 12.5)
const wheat = { crop: 'Wheat', design: { plot: { widthM: 2, lengthM: 12, areaM2: 24 } } }
check('harvested area defaults to the plot', harvestedAreaM2(wheat) === 24)
check('cut width and trimmed length override', harvestedAreaM2({ ...wheat, design: { ...wheat.design, harvest: { cutWidthM: 1.5, lengthM: 10 } } }) === 15)
check('explicit area wins', harvestedAreaM2({ ...wheat, design: { ...wheat.design, harvest: { areaM2: 20, cutWidthM: 1.5 } } }) === 20)
check('7.85 kg over 24 m² at 12.5% = 3.27 t/ha', near(yieldFromBucket(7.85, 24, 12.5, 12.5), 3.27))
check('wetter grain corrects down', near(yieldFromBucket(7.85, 24, 14, 12.5), 3.21) && near(yieldFromBucket(7.85, 24, undefined, 12.5), 3.27))

const row = (assessment: number, plot: number, measure: string, value: number): ScoreRow => ({ id: `${assessment}-${plot}-${measure}`, assessment, plot, measure, value, note: null, recorded_at: '2026-11-12T03:00:00Z' })
const scores = [row(4, 101, 'plot_weight_kg', 7.85), row(4, 101, 'grain_moisture_pct', 11.2), row(4, 102, 'plot_weight_kg', 9.6), row(4, 103, 'plot_weight_kg', 8), row(4, 103, 'yield_t_ha', 3.5), row(2, 101, 'rust_plot', 20)]
const out = deriveYield(scores, wheat)
const y = (p: number) => out.find((s) => s.measure === 'yield_t_ha' && s.plot === p)
check('derived yield for bucket with moisture', near(y(101)!.value, 3.32) && /11\.2% moisture, corrected to 12\.5%, over 24 m²/.test(y(101)!.note ?? ''))
check('derived yield without moisture says so', near(y(102)!.value, 4) && /as weighed/.test(y(102)!.note ?? ''))
check('a real yield score is left alone', y(103)!.value === 3.5 && y(103)!.id === '4-103-yield_t_ha')
check('other scores untouched, ids deterministic', out.length === scores.length + 2 && y(101)!.id === 'derived-yield-4-101' && y(101)!.assessment === 4)
const perPlot = deriveYield([row(4, 101, 'plot_weight_kg', 7.85), row(4, 101, 'harvest_area_m2', 18)], wheat)
check('per-plot harvested area overrides the default', near(perPlot.find((s) => s.measure === 'yield_t_ha')!.value, 4.36) && /over 18 m²/.test(perPlot[2].note ?? ''))
check('no buckets: same array back', deriveYield([row(2, 101, 'rust_plot', 20)], wheat).length === 1)

// --- phone keypad fixed point --------------------------------------------------
const bucket: [string, string, string, number] = ['plot_weight_kg', 'Bucket weight', 'kg/plot', 2]
const moist: [string, string, string, number] = ['grain_moisture_pct', 'Grain moisture', '%', 1]
check('decimals from the office library, LAI tenths, else whole', decimalsFor(bucket) === 2 && decimalsFor(moist) === 1 && decimalsFor(['x', 'x', 'LAI']) === 1 && decimalsFor(['x', 'x', '%']) === 0 && decimalsFor(['x', 'x', 'kg/plot']) === 2)
let v: number | undefined
for (const d of [7, 8, 5]) v = fixedKeyDigit(v, d, 2, 999.99)
check('7, 8, 5 reads 7.85', v === 7.85 && fmtVal(bucket, v) === '7.85')
v = fixedKeyDigit(v, 0, 2, 999.99)
check('then 0 reads 78.50', v === 78.5 && fmtVal(bucket, v) === '78.50')
check('backspace steps back', fixedBackspace(78.5, 2) === 7.85 && fixedBackspace(0.07, 2) === undefined)
check('moisture tenths: 1, 1, 2 reads 11.2', fixedKeyDigit(fixedKeyDigit(fixedKeyDigit(undefined, 1, 1, 100), 1, 1, 100), 2, 1, 100) === 11.2)
check('cap holds', fixedKeyDigit(99.9, 9, 1, 100) === 100)
console.log(`harvest: ${passed} checks passed`)
