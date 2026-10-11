/** Trial design advisor and randomiser — pure functions behind the trial
 * builder. The advisor turns (treatments, reps, design, expected CV) into the
 * difference the trial can actually separate at LSD 5%, so a planner can see
 * the cost of a demonstration-friendly layout before committing to it. The
 * randomiser gives every design a deterministic plot plan from a seed, with
 * plot = rep * 100 + position so the field app, the site planner and the
 * stats all agree on numbering. Validated in test/design.test.ts. */
import { rngFor, shuffle } from './layout'
import { tCrit05 } from './stats'

export type DesignType = 'RCBD' | 'CRD' | 'Latin square' | 'Strips' | 'Demo'

export const DESIGN_LABEL: Record<DesignType, string> = {
  RCBD: 'Randomised complete blocks',
  CRD: 'Completely randomised',
  'Latin square': 'Latin square',
  Strips: 'Paddock strips',
  Demo: 'Demonstration (unreplicated)',
}

export const DESIGN_BLURB: Record<DesignType, string> = {
  RCBD: 'Every treatment once in each rep, order shuffled within the rep. Blocks soak up the fertility gradient across the site. The standard for product comparisons.',
  CRD: 'Treatments scattered at random across the whole block with no rep structure. Only sensible on a very uniform site; blocks are nearly always worth having.',
  'Latin square': 'Each treatment once per row and once per column, so gradients in both directions are controlled. Needs as many reps as treatments, so it suits 4 to 8 treatments.',
  Strips: 'Grower-width strips across the paddock, each treatment once per rep. Scored by header yield map, drone or probe. Reps are rarely replicated more than 2 or 3 times.',
  Demo: 'One plot per treatment in a sensible walking order. No statistics; the untreated and the standard anchor the comparison.',
}

/** Typical plot-to-plot coefficients of variation seen in this kind of work,
 * by the library's measure group. Starting points for the advisor only; the
 * live Results screen reports the CV each trial actually achieved. */
export const TYPICAL_CV: Record<string, { cv: number; note: string }> = {
  yield: { cv: 10, note: 'plot header yield, well run small plots' },
  disease: { cv: 25, note: 'visual % leaf area, assessor to assessor' },
  weed: { cv: 20, note: '% control against the untreated; raw counts run 30 to 40%' },
  crop: { cv: 15, note: 'establishment counts, vigour, NDVI' },
  forage: { cv: 18, note: 'quadrat cuts and calibrated probe' },
}

export interface DesignInput {
  type: DesignType
  nTrt: number
  reps: number
  /** Expected coefficient of variation, percent of the mean. */
  cv: number
  /** Rep 1 laid out in treatment order for walking (demonstration rep). */
  demoRep?: boolean
}

export interface Advice {
  dfError: number | null
  /** Smallest difference separable at LSD 5%, as % of the treatment mean. */
  lsdPct: number | null
  verdict: 'none' | 'weak' | 'fair' | 'good'
  lines: string[]
  /** What a few alternative choices would buy, for the same CV. */
  options: Array<{ label: string; reps: number; type: DesignType; lsdPct: number | null }>
}

/** Error degrees of freedom for the usual one-factor analyses. */
export function errorDf(type: DesignType, nTrt: number, reps: number): number | null {
  if (nTrt < 2) return null
  switch (type) {
    case 'Demo':
      return null
    case 'CRD':
      return reps >= 2 ? nTrt * (reps - 1) : null
    case 'Latin square':
      return nTrt >= 3 ? (nTrt - 1) * (nTrt - 2) : null
    case 'RCBD':
    case 'Strips':
      return reps >= 2 ? (nTrt - 1) * (reps - 1) : null
  }
}

/** LSD at 5% as a percentage of the mean: t(df) · CV · √(2 / r). */
export function lsdPercent(type: DesignType, nTrt: number, reps: number, cv: number): number | null {
  const r = type === 'Latin square' ? nTrt : reps
  const df = errorDf(type, nTrt, r)
  if (df === null || df < 1 || cv <= 0) return null
  return tCrit05(df) * cv * Math.sqrt(2 / r)
}

const verdictFor = (lsdPct: number | null): Advice['verdict'] => (lsdPct === null ? 'none' : lsdPct <= 12 ? 'good' : lsdPct <= 25 ? 'fair' : 'weak')

export function advise(d: DesignInput): Advice {
  const r = d.type === 'Latin square' ? d.nTrt : d.reps
  const df = errorDf(d.type, d.nTrt, r)
  const lsd = lsdPercent(d.type, d.nTrt, d.reps, d.cv)
  const lines: string[] = []
  const options: Advice['options'] = []
  const pct = (x: number | null) => (x === null ? 'no estimate' : `${x.toFixed(0)}%`)

  if (d.nTrt < 2) lines.push('Add at least two treatments (one of them untreated or the district standard) before the design means anything.')

  if (d.type === 'Demo') {
    lines.push('Unreplicated: differences between plots cannot be told from plot-to-plot noise, so results are observations, not evidence. Fine for a field day walk; say so on the sign.')
    if (d.nTrt >= 2) {
      for (const reps of [2, 3, 4]) options.push({ label: `${reps} reps RCBD`, reps, type: 'RCBD', lsdPct: lsdPercent('RCBD', d.nTrt, reps, d.cv) })
    }
    return { dfError: null, lsdPct: null, verdict: 'none', lines, options }
  }

  if (d.type === 'Latin square') {
    if (d.nTrt < 3) lines.push('A Latin square needs at least 3 treatments.')
    else if (d.nTrt > 8) lines.push(`A ${d.nTrt} × ${d.nTrt} square is ${d.nTrt * d.nTrt} plots; above 8 treatments an RCBD with 3 or 4 reps is the practical choice.`)
    else lines.push(`${d.nTrt} × ${d.nTrt} = ${d.nTrt * d.nTrt} plots, ${d.nTrt} reps. Controls gradients both ways; useful where the slope and the sowing direction disagree.`)
  }

  if (lsd !== null && df !== null) {
    lines.push(`With ${r} reps and a CV of ${d.cv}%, treatments must differ by about ${pct(lsd)} of the mean to separate at LSD 5% (${df} error df).`)
    if (df < 10) lines.push(`Only ${df} error degrees of freedom: the t value is inflated and a single odd plot moves the result. Aim for 12 or more.`)
    if (d.cv >= 20 && lsd > 25) lines.push('At this CV the trial will only pick up large effects. Either expect that, or tighten the measure (more quadrats or leaves per plot, one assessor, a yield map rather than a visual).')
  } else if (d.type !== 'Latin square') {
    lines.push('Fewer than 2 reps gives no error estimate: the analysis cannot run. Treat it as a demonstration or add a rep.')
  }

  if (d.demoRep && (d.type === 'RCBD' || d.type === 'Strips')) {
    lines.push('Rep 1 in treatment order makes the walk easy and still counts as a block, but a systematic rep can line a fertility trend up with the treatment order. Keep reps 2 onwards randomised and expect reviewers to ask about it; with 4 reps the cost is small.')
    if (d.reps < 3) lines.push('With only 2 reps a systematic rep 1 leaves one randomised rep: not enough to trust the result.')
  }

  if (d.type === 'CRD' && d.nTrt >= 4) lines.push('Blocks are nearly free: the same plots laid out as complete blocks give the same df and protect against a gradient. Pick RCBD unless the site is a uniform shed floor.')

  if (d.type !== 'Latin square') {
    for (const reps of [2, 3, 4, 5, 6]) if (reps !== d.reps) options.push({ label: `${reps} reps ${d.type}`, reps, type: d.type, lsdPct: lsdPercent(d.type, d.nTrt, reps, d.cv) })
    if (d.nTrt >= 3 && d.nTrt <= 8) options.push({ label: `${d.nTrt} × ${d.nTrt} Latin square`, reps: d.nTrt, type: 'Latin square', lsdPct: lsdPercent('Latin square', d.nTrt, d.nTrt, d.cv) })
  } else {
    for (const reps of [3, 4]) options.push({ label: `${reps} reps RCBD`, reps, type: 'RCBD', lsdPct: lsdPercent('RCBD', d.nTrt, reps, d.cv) })
  }

  return { dfError: df, lsdPct: lsd, verdict: verdictFor(lsd), lines, options }
}

// --- Randomisation -----------------------------------------------------------

export interface PlanCell {
  plot: number
  rep: number
  position: number
  /** Treatment number, 0 for a spare or buffer cell. */
  trt: number
}

export interface PlanBand {
  rep: number
  label: string
  cells: PlanCell[]
}

export interface PlanOpts {
  seed: string
  type: DesignType
  nTrt: number
  reps: number
  /** Rep 1 in treatment order (demonstration rep). RCBD and Strips only. */
  demoRep?: boolean
  /** Spare cells at the end of each rep (buffer or reserve plots). */
  spare?: number
}

export interface Plan {
  bands: PlanBand[]
  /** Treatment → its plots, in rep order. */
  byTrt: Record<number, Array<{ rep: number; plot: number }>>
  rows: number
  positions: number
}

/** Deterministic plot plan. Same seed, same plan, on any machine. */
export function plan(o: PlanOpts): Plan {
  const n = Math.max(0, Math.floor(o.nTrt))
  const spare = Math.max(0, Math.floor(o.spare ?? 0))
  const r = rngFor(`${o.seed}|${o.type}|${o.reps}x${n}|${o.demoRep ? 'demo' : ''}`)
  const bands: PlanBand[] = []
  const trts = [...Array(n).keys()].map((x) => x + 1)
  const cellsOf = (rep: number, order: number[]): PlanCell[] => {
    const cells = order.map((t, i) => ({ plot: rep * 100 + i + 1, rep, position: i + 1, trt: t }))
    for (let s = 0; s < spare; s++) cells.push({ plot: rep * 100 + order.length + s + 1, rep, position: order.length + s + 1, trt: 0 })
    return cells
  }

  if (n > 0) {
    if (o.type === 'Demo') {
      bands.push({ rep: 1, label: 'DEMO', cells: cellsOf(1, trts) })
    } else if (o.type === 'Latin square') {
      const idx = [...Array(n).keys()]
      const rp = shuffle(idx, r)
      const cp = shuffle(idx, r)
      for (let i = 0; i < n; i++) bands.push({ rep: i + 1, label: `ROW ${i + 1}`, cells: cellsOf(i + 1, idx.map((c) => ((rp[i] + cp[c]) % n) + 1)) })
    } else if (o.type === 'CRD') {
      const all = shuffle(trts.flatMap((t) => Array(Math.max(1, o.reps)).fill(t) as number[]), r)
      for (let b = 0; b < Math.max(1, o.reps); b++) bands.push({ rep: b + 1, label: `ROW ${b + 1}`, cells: cellsOf(b + 1, all.slice(b * n, (b + 1) * n)) })
    } else {
      for (let b = 0; b < Math.max(1, o.reps); b++) {
        const order = b === 0 && o.demoRep ? trts : shuffle(trts, r)
        bands.push({ rep: b + 1, label: o.type === 'Strips' ? `REP ${b + 1} STRIPS` : `REP ${b + 1}`, cells: cellsOf(b + 1, order) })
      }
    }
  }

  const byTrt: Plan['byTrt'] = {}
  for (const b of bands) for (const c of b.cells) if (c.trt) (byTrt[c.trt] ??= []).push({ rep: c.rep, plot: c.plot })
  return { bands, byTrt, rows: bands.length, positions: bands[0]?.cells.length ?? 0 }
}
