/** Harvest: grain yield derived in the office from the bucket weight the
 * phone records per plot. The bucket weight stays the record (phone is the
 * source of truth); yield_t_ha is computed from it every time scores load,
 * so a corrected weight, moisture or harvested area flows through without
 * anyone editing a yield. A real yield_t_ha score for the same plot and
 * round (plot harvester, hand entry) always wins over the derived one. */
import type { ScoreRow } from './db'

export const BUCKET_KEY = 'plot_weight_kg'
export const MOISTURE_KEY = 'grain_moisture_pct'
export const YIELD_KEY = 'yield_t_ha'

export interface HarvestSettings {
  /** Header cut width, when narrower than the plot (m). */
  cutWidthM?: number
  /** Harvested length, when the plot was trimmed (m). */
  lengthM?: number
  /** Harvested area per plot (m²); overrides width × length when set. */
  areaM2?: number
  /** Receival moisture standard the weights are corrected to (%). */
  moistureStdPct?: number
}

export interface HarvestTrial {
  crop?: string | null
  design?: { plot?: { widthM: number; lengthM: number; areaM2: number }; harvest?: HarvestSettings } | null
}

/** Australian receival standards the yield is quoted at. */
export function moistureStandard(crop: string | null | undefined): number {
  const c = (crop ?? '').toLowerCase()
  if (/canola/.test(c)) return 8
  if (/lupin|faba|chickpea|lentil|field pea|pea/.test(c)) return 14
  return 12.5 // wheat, barley, oats, triticale
}

export function harvestedAreaM2(t: HarvestTrial): number {
  const h = t.design?.harvest ?? {}
  if (h.areaM2 && h.areaM2 > 0) return h.areaM2
  const plot = t.design?.plot
  const w = h.cutWidthM ?? plot?.widthM
  const l = h.lengthM ?? plot?.lengthM
  if (w && l) return +(w * l).toFixed(3)
  return plot?.areaM2 ?? 24
}

/** t/ha from a bucket weight: kg over m² × 10, corrected to the standard
 * moisture when a reading is given. */
export function yieldFromBucket(kg: number, areaM2: number, moisturePct: number | undefined, stdPct: number): number {
  const corr = moisturePct !== undefined && moisturePct >= 0 && moisturePct < 100 ? (100 - moisturePct) / (100 - stdPct) : 1
  return +((kg * corr * 10) / areaM2).toFixed(2)
}

/** Append derived yield rows for every bucket weight that has no real
 * yield score beside it. Ids are deterministic so re-loads replace, not stack. */
export function deriveYield(scores: ScoreRow[], t: HarvestTrial): ScoreRow[] {
  const buckets = scores.filter((s) => s.measure === BUCKET_KEY)
  if (!buckets.length) return scores
  const area = harvestedAreaM2(t)
  const std = t.design?.harvest?.moistureStdPct ?? moistureStandard(t.crop)
  const key = (a: number, p: number) => `${a}:${p}`
  const real = new Set(scores.filter((s) => s.measure === YIELD_KEY).map((s) => key(s.assessment, s.plot)))
  const moisture = new Map(scores.filter((s) => s.measure === MOISTURE_KEY).map((s) => [key(s.assessment, s.plot), Number(s.value)]))
  const derived: ScoreRow[] = []
  for (const b of buckets) {
    const k = key(b.assessment, b.plot)
    if (real.has(k)) continue
    const m = moisture.get(k)
    const kg = Number(b.value)
    if (!Number.isFinite(kg)) continue
    const value = yieldFromBucket(kg, area, m, std)
    const note = m !== undefined ? `Derived: ${kg} kg at ${m}% moisture, corrected to ${std}%, over ${area} m²` : `Derived: ${kg} kg over ${area} m², as weighed (no moisture reading)`
    derived.push({ id: `derived-yield-${b.assessment}-${b.plot}`, assessment: b.assessment, plot: b.plot, measure: YIELD_KEY, value, note, recorded_at: b.recorded_at })
  }
  return derived.length ? [...scores, ...derived] : scores
}
