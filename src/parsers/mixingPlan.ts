import type { TrialDoc, Treatment } from '../store/types'
import { readXlsx } from './xlsxRead'
import { perBatchMl } from '../lib/trial'
import { MATONG_BASE } from '../data/matong'

export interface MixingPlanResult {
  doc: TrialDoc
  stats: { treatments: number; batchL: number; waterL: number; source: string; sheet: string }
}

interface ProductRow {
  product: string
  rate: number
  unit: string
  perBatch: number
}

/** Parse a mixing plan workbook (fixtures/Fungicide_Mixing_Plan_revD.xlsx shape):
 * per-treatment product rows with rates and per-batch mL, A/B timings. */
export function parseMixingPlan(data: Uint8Array, fileName = 'mixing-plan.xlsx'): MixingPlanResult {
  const sheets = readXlsx(data)
  // prefer a Wheat sheet, else the first sheet with a Trt header
  const sheet =
    sheets.find((s) => /wheat/i.test(s.name) && hasHeader(s.rows)) ??
    sheets.find((s) => hasHeader(s.rows))
  if (!sheet) throw new Error('No mixing sheet found (expected Trt / Treatment / Product columns)')

  const rows = sheet.rows
  let batchL = 1.5
  let waterPerPlotL = 0.24
  for (const r of rows) {
    const bi = r.findIndex((c) => /batch volume/i.test(c))
    if (bi >= 0 && r[bi + 1]) batchL = Number(r[bi + 1]) || batchL
    const wi = r.findIndex((c) => /water per plot/i.test(c))
    if (wi >= 0 && r[wi + 1]) waterPerPlotL = Number(r[wi + 1]) || waterPerPlotL
  }
  const headerIdx = rows.findIndex((r) => r[0] === 'Trt')
  const byTrt = new Map<number, { name: string; timing: string; products: ProductRow[] }[]>()
  let cur: { name: string; timing: string; products: ProductRow[] } | null = null
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i]
    if (!r || r.every((c) => !c)) {
      cur = null
      continue
    }
    if (/Total product required/i.test(r[0] ?? '')) break
    const n = /^\d+$/.test(r[0] ?? '') ? Number(r[0]) : null
    if (n !== null) {
      cur = { name: r[1] ?? `Treatment ${n}`, timing: r[2] || 'A', products: [] }
      if (!byTrt.has(n)) byTrt.set(n, [])
      byTrt.get(n)!.push(cur)
    }
    if (!cur) continue
    const product = r[3] ?? ''
    if (product) {
      cur.products.push({ product, rate: Number(r[4]) || 0, unit: r[5] ?? '', perBatch: Number(r[6]) || 0 })
    }
  }
  if (!byTrt.size) throw new Error('No treatments found in the mixing sheet')

  const treatments: Treatment[] = [...byTrt.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([n, timings]) => {
      const a = timings.find((t) => t.timing === 'A') ?? timings[0]
      const b = timings.find((t) => t.timing === 'B')
      const recipe =
        n === 1
          ? 'Water only'
          : a.products.map((p) => `${p.product} ${p.rate} ${p.unit}`.trim()).join(' + ') || 'Per mixing plan'
      return {
        n,
        name: a.name,
        recipe,
        perBatchMl: a.products.length ? a.products.map((p) => p.perBatch) : undefined,
        bSpray: !!b,
        plots: [],
      }
    })

  const waterRate = Math.round((waterPerPlotL / (MATONG_BASE.trial.plot.areaM2 / 10000)) * 1) || 100
  const title = rows.find((r) => /Trial/i.test(r[0] ?? ''))?.[0] ?? sheet.name
  const season = Number(/\b(20\d\d)\b/.exec(title)?.[1] ?? new Date().getFullYear())
  const name = title.replace(/\s*(—|-)\s*Mixing Plan.*$/i, '').trim() || sheet.name

  const doc: TrialDoc = {
    id: `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${season}`,
    trial: {
      name,
      org: 'AGnVET Services — IK Caldwell',
      season,
      design: 'RCB',
      reps: 3,
      grid: { rows: 12, positions: 8 },
      repBands: MATONG_BASE.trial.repBands,
      plot: MATONG_BASE.trial.plot,
      waterRateLPerHa: waterRate,
      sprayVolumePerPlotMl: Math.round(waterPerPlotL * 1000),
      batchVolumeL: batchL,
      timings: { A: {}, B: { due: 'GS39' } },
      sourceDocument: fileName,
    },
    treatments,
    cells: {},
    marginalPlots: [],
    walkOrders: MATONG_BASE.walkOrders,
    measures: MATONG_BASE.measures,
  }
  return { doc, stats: { treatments: treatments.length, batchL, waterL: waterPerPlotL, source: fileName, sheet: sheet.name } }
}

const hasHeader = (rows: string[][]) => rows.some((r) => r[0] === 'Trt' && /treatment/i.test(r[1] ?? ''))

/** Batch-volume check per the handoff: rate mL/ha ÷ water L/ha × batch L. */
export function checkBatchMath(rateMlHa: number, waterLHa: number, batchL: number): number {
  return perBatchMl(rateMlHa, waterLHa, batchL)
}
