/**
 * Trial randomisation engine — seedable, so a design can be regenerated
 * (and audited) from its stored seed. Layout output matches the phone
 * app's TrialDoc shape: grid rows × positions, rep bands over position
 * columns, plot ids = row*100 + position, serpentine walk order.
 */

export type DesignKind = 'crd' | 'rcbd' | 'latin-square' | 'split-plot'

/** Deterministic PRNG from a string seed (mulberry32 over a string hash). */
export function rng(seed: string): () => number {
  let h = 1779033703 ^ seed.length
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  let a = h >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function shuffle<T>(items: T[], random: () => number): T[] {
  const a = items.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const seq = (n: number) => Array.from({ length: n }, (_, i) => i + 1)

/** Completely randomised design: reps × treatments in one shuffled pool. */
export function crd(treatments: number, reps: number, seed: string): number[] {
  const pool = seq(treatments).flatMap((t) => Array<number>(reps).fill(t))
  return shuffle(pool, rng(seed))
}

/** Randomised complete block: one independent shuffle per rep (block). */
export function rcbd(treatments: number, reps: number, seed: string): number[][] {
  const random = rng(seed)
  return Array.from({ length: reps }, () => shuffle(seq(treatments), random))
}

/** n×n latin square: every treatment once per row and once per column. */
export function latinSquare(n: number, seed: string): number[][] {
  const random = rng(seed)
  // random cyclic square, then shuffle rows and columns (standard, unbiased enough for field use)
  const base = seq(n).map((_, r) => seq(n).map((_, c) => ((r + c) % n) + 1))
  const rows = shuffle(seq(n).map((i) => i - 1), random)
  const cols = shuffle(seq(n).map((i) => i - 1), random)
  const relabel = shuffle(seq(n), random)
  return rows.map((r) => cols.map((c) => relabel[base[r][c] - 1]))
}

export interface SplitPlotResult {
  /** [rep][mainPlot] = { main, subs } — sub order randomised within each main plot */
  reps: Array<Array<{ main: number; subs: number[] }>>
}

/** Split-plot: main treatments randomised per rep, sub treatments within each main plot. */
export function splitPlot(mains: number, subs: number, reps: number, seed: string): SplitPlotResult {
  const random = rng(seed)
  return {
    reps: Array.from({ length: reps }, () =>
      shuffle(seq(mains), random).map((main) => ({ main, subs: shuffle(seq(subs), random) })),
    ),
  }
}

/** Expand factor level lists into numbered treatment combinations. */
export function factorial(factors: string[][]): Array<{ n: number; levels: string[]; name: string }> {
  let combos: string[][] = [[]]
  for (const levels of factors) combos = combos.flatMap((c) => levels.map((l) => [...c, l]))
  return combos.map((levels, i) => ({ n: i + 1, levels, name: levels.join(' × ') }))
}

// ---------------------------------------------------------------------------
// Field layout — maps a design onto the grid shape the phone app renders.

export type CellKind = number | 'out' | 'skip' | 'spare' | 'reserve'

export interface LayoutSpec {
  treatments: number
  reps: number
  grid: { rows: number; positions: number }
  /** position columns per rep, e.g. {1:[1,2], 2:[3,4,5], 3:[6,7,8]}; omitted = auto-split */
  repBands?: Record<string, number[]>
  seed: string
}

export interface Layout {
  cells: Record<string, CellKind>
  repBands: Record<string, number[]>
  /** plots per treatment number, one per rep, in rep order */
  plots: Record<number, number[]>
  walkOrder: number[]
}

const plotId = (row: number, pos: number) => row * 100 + pos

/** Serpentine walk over a set of position columns: odd columns go down, even go up. */
function serpentine(rows: number, positions: number[]): Array<[number, number]> {
  const cells: Array<[number, number]> = []
  positions.forEach((pos, i) => {
    const rws = seq(rows)
    if (i % 2 === 1) rws.reverse()
    for (const row of rws) cells.push([row, pos])
  })
  return cells
}

function autoBands(positions: number, reps: number): Record<string, number[]> {
  const bands: Record<string, number[]> = {}
  const per = Math.floor(positions / reps)
  let extra = positions % reps
  let next = 1
  for (let r = 1; r <= reps; r++) {
    const width = per + (extra-- > 0 ? 1 : 0)
    bands[String(r)] = seq(width).map((i) => next + i - 1)
    next += width
  }
  return bands
}

/**
 * RCBD layout: each rep band is a block; treatments are placed in randomised
 * order along the band's serpentine walk; leftover cells become spares at the
 * end of the walk (matching how AGnVET's paper maps are laid out).
 */
export function layoutRcbd(spec: LayoutSpec): Layout {
  const { treatments, reps, grid, seed } = spec
  const bands = spec.repBands ?? autoBands(grid.positions, reps)
  if (Object.keys(bands).length !== reps) throw new Error('repBands must have one entry per rep')
  for (const [rep, positions] of Object.entries(bands)) {
    if (positions.length * grid.rows < treatments)
      throw new Error(`rep ${rep} band has ${positions.length * grid.rows} cells for ${treatments} treatments`)
  }

  const order = rcbd(treatments, reps, seed)
  const cells: Record<string, CellKind> = {}
  const plots: Record<number, number[]> = Object.fromEntries(seq(treatments).map((t) => [t, []]))
  const walkOrder: number[] = []

  Object.entries(bands).forEach(([rep, positions], repIdx) => {
    const walk = serpentine(grid.rows, positions)
    walk.forEach(([row, pos], i) => {
      const id = plotId(row, pos)
      if (i < treatments) {
        const t = order[repIdx][i]
        cells[String(id)] = t
        plots[t].push(id)
        walkOrder.push(id)
      } else {
        cells[String(id)] = 'spare'
      }
    })
    void rep
  })

  return { cells, repBands: bands, plots, walkOrder }
}
