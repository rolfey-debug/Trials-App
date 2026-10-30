/** RCBD analysis of variance with LSD(5%) mean separation — the ARM-parity
 * numbers (F32). Pure functions, no DOM; validated in test/stats.test.ts
 * against a hand-computed example. A complete table (every treatment scored
 * in every block) is analysed exactly; a few missing plots (damage, drift,
 * a lost sample) are filled by Yates' iterative missing-plot estimate with
 * the error df reduced by one per estimate and the LSD widened for pairs
 * that involve an estimated plot, the way ARM reports a trial with missing
 * values. More than 15% missing, an empty treatment or block, or a treatment
 * with a single observation is refused. */

/** Two-tailed Student's t critical values at α = 0.05, by error df. */
const T_05: Array<[number, number]> = [
  [1, 12.706], [2, 4.303], [3, 3.182], [4, 2.776], [5, 2.571], [6, 2.447],
  [7, 2.365], [8, 2.306], [9, 2.262], [10, 2.228], [12, 2.179], [14, 2.145],
  [16, 2.12], [18, 2.101], [20, 2.086], [24, 2.064], [30, 2.042], [40, 2.021],
  [60, 2.0], [120, 1.98], [1e9, 1.96],
]

export function tCrit05(df: number): number {
  if (df <= 1) return T_05[0][1]
  for (let i = 1; i < T_05.length; i++) {
    const [d1, t1] = T_05[i - 1]
    const [d2, t2] = T_05[i]
    if (df <= d2) {
      // interpolate on 1/df, the conventional approximation between table rows
      const f = (1 / df - 1 / d1) / (1 / d2 - 1 / d1)
      return t1 + (t2 - t1) * f
    }
  }
  return 1.96
}

export interface Anova {
  ssTrt: number
  ssBlock: number
  ssError: number
  dfTrt: number
  dfBlock: number
  dfError: number
  msError: number
  fTrt: number
  lsd05: number
  cv: number
  means: Array<{ key: string; mean: number }>
  /** key → significance letters (treatments sharing a letter do not differ at 5%) */
  letters: Record<string, string>
  /** plots estimated by the missing-plot formula (0 for a complete table) */
  missing: number
  /** key → block indices (0-based) that were estimated */
  estimated: Record<string, number[]>
}

/** data: treatment key → one value per block, same block order everywhere.
 * Returns null unless every treatment has the same ≥2 complete blocks. */
export function rcbdAnova(input: Record<string, Array<number | null | undefined>>): Anova | null {
  const keys = Object.keys(input)
  const t = keys.length
  if (t < 2) return null
  const r = input[keys[0]].length
  if (r < 2 || keys.some((k) => input[k].length !== r)) return null
  const data: Record<string, number[]> = {}
  const estimated: Record<string, number[]> = {}
  const missingCells: Array<[string, number]> = []
  for (const k of keys) {
    data[k] = input[k].map((v) => (typeof v === 'number' && Number.isFinite(v) ? v : NaN))
    for (let b = 0; b < r; b++) if (Number.isNaN(data[k][b])) missingCells.push([k, b])
  }
  const m = missingCells.length
  if (m) {
    if (m > Math.floor(0.15 * t * r)) return null
    if ((t - 1) * (r - 1) - m < 3) return null
    for (const k of keys) if (data[k].filter((v) => !Number.isNaN(v)).length < 2) return null
    for (let b = 0; b < r; b++) if (keys.every((k) => Number.isNaN(data[k][b]))) return null
    // start each gap at the mean of its treatment's observed values, then
    // iterate Yates: y = (r·B' + t·T' − G') / ((r − 1)(t − 1)) with the
    // primed totals excluding the cell itself
    for (const [k, b] of missingCells) {
      const obs = data[k].filter((v) => !Number.isNaN(v))
      data[k][b] = obs.reduce((a, v) => a + v, 0) / obs.length
      ;(estimated[k] ??= []).push(b)
    }
    for (let iter = 0; iter < 500; iter++) {
      let delta = 0
      for (const [k, b] of missingCells) {
        const T = data[k].reduce((a, v, i) => (i === b ? a : a + v), 0)
        const B = keys.reduce((a, kk) => (kk === k ? a : a + data[kk][b]), 0)
        const G = keys.reduce((a, kk) => a + data[kk].reduce((x, v, i) => (kk === k && i === b ? x : x + v), 0), 0)
        const y = (r * B + t * T - G) / ((r - 1) * (t - 1))
        delta = Math.max(delta, Math.abs(y - data[k][b]))
        data[k][b] = y
      }
      if (delta < 1e-7) break
    }
  }

  const all = keys.flatMap((k) => data[k])
  const grand = all.reduce((a, b) => a + b, 0) / (t * r)
  const trtMean = (k: string) => data[k].reduce((a, b) => a + b, 0) / r
  const blockMean = (b: number) => keys.reduce((a, k) => a + data[k][b], 0) / t

  const ssTotal = all.reduce((a, v) => a + (v - grand) ** 2, 0)
  const ssTrt = r * keys.reduce((a, k) => a + (trtMean(k) - grand) ** 2, 0)
  let ssBlock = 0
  for (let b = 0; b < r; b++) ssBlock += t * (blockMean(b) - grand) ** 2
  const ssError = Math.max(0, ssTotal - ssTrt - ssBlock)
  const dfTrt = t - 1
  const dfBlock = r - 1
  const dfError = dfTrt * dfBlock - m
  const msError = ssError / dfError
  const fTrt = msError > 0 ? ssTrt / dfTrt / msError : Infinity
  const tc = tCrit05(dfError)
  const lsd05 = tc * Math.sqrt((2 * msError) / r)
  // a pair with estimated plots gets the wider LSD of the missing-plot method
  const missOf = (k: string) => estimated[k]?.length ?? 0
  const lsdFor = (a: string, b: string) => {
    const mm = missOf(a) + missOf(b)
    return mm ? tc * Math.sqrt(msError * (2 / r + (mm * t) / (r * (r - 1) * (t - 1)))) : lsd05
  }
  const cv = grand !== 0 ? (Math.sqrt(msError) / grand) * 100 : 0

  const means = keys.map((key) => ({ key, mean: trtMean(key) })).sort((a, b) => b.mean - a.mean)

  // LSD letter display: in the descending order, each maximal run whose ends
  // differ by ≤ LSD is one group; a treatment carries every group it sits in.
  const runs: Array<[number, number]> = []
  for (let i = 0; i < means.length; i++) {
    let j = i
    while (j + 1 < means.length && means[i].mean - means[j + 1].mean <= lsdFor(means[i].key, means[j + 1].key) + 1e-9) j++
    runs.push([i, j])
  }
  const maximal = runs.filter(([a1, b1], i) => !runs.some(([a2, b2], j) => j !== i && a2 <= a1 && b1 <= b2 && (a2 < a1 || b2 > b1)))
  // de-duplicate identical runs
  const seen = new Set<string>()
  const groups = maximal.filter(([a, b]) => {
    const k = `${a}-${b}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
  const letters: Record<string, string> = {}
  groups.forEach(([a, b], gi) => {
    const ch = String.fromCharCode(97 + gi)
    for (let i = a; i <= b; i++) letters[means[i].key] = (letters[means[i].key] ?? '') + ch
  })
  return { ssTrt, ssBlock, ssError, dfTrt, dfBlock, dfError, msError, fTrt, lsd05, cv, means, letters, missing: m, estimated }
}
