import type { TrialDoc, TrialState } from '../store/types'

/** Sample severity per treatment (T1..T24) from the design prototype — illustrative
 * only; always labelled SAMPLE DATA until real scores exist (handoff: Real Data). */
export const SAMPLE_SEV = [38, 14, 16, 15, 12, 13, 9, 8, 18, 17, 15, 11, 16, 15, 10, 14, 13, 10, 17, 16, 9, 12, 14, 19]

export interface RankedBar {
  n: number
  ctl: number
}

/** Ranked % control vs untreated. Uses live treatment means of the primary measure
 * once enough real scores exist (untreated + ≥5 treatments scored); until then the
 * labelled sample series. */
export function rankedControl(doc: TrialDoc, ts: TrialState): { bars: RankedBar[]; live: boolean } {
  const primary = ts.activeMeasures[0]
  const pids = Object.keys(doc.cells).map(Number).filter((p) => typeof doc.cells[p] === 'number')
  const meanOf = (n: number): number | null => {
    const tp = pids.filter((p) => (ts.relabel[p] ?? doc.cells[p]) === n && !ts.excluded.includes(p))
    const vals = tp.map((p) => ts.scores[p]?.v[primary]).filter((v): v is number => v !== undefined)
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null
  }
  const untreated = meanOf(1)
  const liveMeans = doc.treatments.filter((t) => t.n !== 1).map((t) => ({ n: t.n, mean: meanOf(t.n) }))
  const enough = untreated !== null && untreated > 0 && liveMeans.filter((m) => m.mean !== null).length >= 5
  if (enough) {
    const bars = liveMeans
      .filter((m) => m.mean !== null)
      .map((m) => ({ n: m.n, ctl: Math.max(0, Math.round(((untreated! - m.mean!) / untreated!) * 100)) }))
      .sort((a, b) => b.ctl - a.ctl)
      .slice(0, 5)
    return { bars, live: true }
  }
  const base = SAMPLE_SEV[0]
  const bars = doc.treatments
    .filter((t) => t.n !== 1 && t.n <= SAMPLE_SEV.length)
    .map((t) => ({ n: t.n, ctl: Math.round(((base - SAMPLE_SEV[t.n - 1]) / base) * 100) }))
    .sort((a, b) => b.ctl - a.ctl)
    .slice(0, 5)
  return { bars, live: false }
}
