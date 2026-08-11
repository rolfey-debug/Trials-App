import type { CellKind, MeasureDef, MeasureLib, TrialDoc } from '../store/types'

export const rowOf = (pid: number) => Math.floor(pid / 100)
export const posOf = (pid: number) => pid % 100

export function repOf(doc: TrialDoc, pid: number): number {
  const pos = posOf(pid)
  for (const [rep, band] of Object.entries(doc.trial.repBands)) {
    if (band.includes(pos)) return Number(rep)
  }
  return 0
}

export const isTreatmentCell = (v: CellKind | undefined): v is number => typeof v === 'number'

/** Serpentine assessment order: pos 1 rows 1→12, pos 2 rows 12→1, … treatment cells only. */
export function assessmentOrder(doc: TrialDoc): number[] {
  const { rows, positions } = doc.trial.grid
  const order: number[] = []
  for (let pos = 1; pos <= positions; pos++) {
    let rr = Array.from({ length: rows }, (_, i) => i + 1)
    if (pos % 2 === 0) rr = rr.reverse()
    for (const r of rr) {
      const pid = r * 100 + pos
      if (isTreatmentCell(doc.cells[pid])) order.push(pid)
    }
  }
  return order
}

/** Field-day display walk — Rep 1: pos 1 rows 1→12 (T1–12), then pos 2 rows 12→1 (T24…13). */
export function fieldDayStops(doc: TrialDoc): number[] {
  const { rows } = doc.trial.grid
  const stops: number[] = []
  for (let r = 1; r <= rows; r++) stops.push(r * 100 + 1)
  for (let r = rows; r >= 1; r--) stops.push(r * 100 + 2)
  return stops.filter((pid) => isTreatmentCell(doc.cells[pid]))
}

export function treatmentByN(doc: TrialDoc, n: number) {
  return doc.treatments.find((t) => t.n === n)
}

export function plotsByTreatment(doc: TrialDoc): Record<number, number[]> {
  const out: Record<number, number[]> = {}
  for (const [k, v] of Object.entries(doc.cells)) {
    if (typeof v === 'number') (out[v] = out[v] || []).push(Number(k))
  }
  for (const arr of Object.values(out)) arr.sort((a, b) => posOf(a) - posOf(b))
  return out
}

export interface MeasureGroup {
  title: string
  items: MeasureDef[]
}

const UNIT_DISPLAY: Record<string, string> = { '/m2': '/m²' }
export const unitOf = (m: MeasureDef) => UNIT_DISPLAY[m[2]] ?? m[2]

export function measureGroups(lib: MeasureLib): MeasureGroup[] {
  return [
    { title: 'DISEASE — SEVERITY', items: lib.disease },
    { title: 'WEEDS — QUADRAT COUNT', items: lib.weeds },
    { title: 'CROP', items: lib.crop },
  ]
}

export function measureFlat(lib: MeasureLib): Record<string, MeasureDef> {
  const flat: Record<string, MeasureDef> = {}
  for (const g of measureGroups(lib)) for (const m of g.items) flat[m[0]] = m
  return flat
}

/** Value cap while keying scores: % measures cap at 100, counts at 999. */
export function capFor(m: MeasureDef): number {
  return m[2] === '/m2' || m[2] === '/m²' ? 999 : m[2] === 'GS' ? 99 : 100
}

/** Per-batch mixing note for the Mix checklist, derived from recipe + perBatchMl. */
export function mixNote(t: { recipe: string; perBatchMl?: number[]; n: number }): string {
  if (t.n === 1) return 'Water only — spray first, clean boom'
  if (!t.perBatchMl || t.perBatchMl.length === 0) return 'Base cover at A — see rev. D'
  // pair each product fragment of the recipe with its per-batch volume
  const parts = t.recipe.split('+').map((s) => s.trim())
  if (parts.length === t.perBatchMl.length) {
    return parts
      .map((p, i) => {
        const name = p
          .replace(/\d+(\.\d+)?\s*(mL\/ha|g\/ha|%\s*v\/v|%)/gi, '')
          .replace(/\s+/g, ' ')
          .trim()
        return `${name} ${fmtMl(t.perBatchMl![i])}`
      })
      .join(' + ')
  }
  return t.perBatchMl.map(fmtMl).join(' + ')
}

const fmtMl = (v: number) => `${+v.toFixed(2)} mL`

/** Batch-volume math from the mixing plan: rate mL/ha ÷ water L/ha × batch L. */
export function perBatchMl(rateMlPerHa: number, waterLPerHa: number, batchL: number): number {
  return +((rateMlPerHa / waterLPerHa) * batchL).toFixed(3)
}
