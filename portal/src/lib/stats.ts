/** RCBD analysis of variance with LSD(5%) mean separation — the ARM-parity
 * numbers (F32). Pure functions, no DOM; validated in test/stats.test.ts
 * against a hand-computed example. Requires a balanced, complete table
 * (every treatment scored in every block); callers skip letters otherwise. */

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
}

/** data: treatment key → one value per block, same block order everywhere.
 * Returns null unless every treatment has the same ≥2 complete blocks. */
export function rcbdAnova(data: Record<string, number[]>): Anova | null {
  const keys = Object.keys(data)
  const t = keys.length
  if (t < 2) return null
  const r = data[keys[0]].length
  if (r < 2 || keys.some((k) => data[k].length !== r || data[k].some((v) => !Number.isFinite(v)))) return null

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
  const dfError = dfTrt * dfBlock
  const msError = ssError / dfError
  const fTrt = msError > 0 ? ssTrt / dfTrt / msError : Infinity
  const lsd05 = tCrit05(dfError) * Math.sqrt((2 * msError) / r)
  const cv = grand !== 0 ? (Math.sqrt(msError) / grand) * 100 : 0

  const means = keys.map((key) => ({ key, mean: trtMean(key) })).sort((a, b) => b.mean - a.mean)

  // LSD letter display: in the descending order, each maximal run whose ends
  // differ by ≤ LSD is one group; a treatment carries every group it sits in.
  const runs: Array<[number, number]> = []
  for (let i = 0; i < means.length; i++) {
    let j = i
    while (j + 1 < means.length && means[i].mean - means[j + 1].mean <= lsd05 + 1e-9) j++
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
  return { ssTrt, ssBlock, ssError, dfTrt, dfBlock, dfError, msError, fTrt, lsd05, cv, means, letters }
}
