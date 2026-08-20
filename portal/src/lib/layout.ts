/**
 * Seeded layout + plot-map colour coding, ported verbatim from the design
 * handoff so the same seed regenerates the exact prototype layouts
 * (hash(seed+design+reps+n) → PRNG → Fisher–Yates per rep; shuffled
 * row/column permutations for latin square).
 */

export type Design = 'RCBD' | 'Latin square' | 'Split-plot'

export interface LayoutCell {
  num: string
  t: number // 0 = spare
}

export interface LayoutBand {
  label: string
  cells: LayoutCell[]
}

export function rngFor(str: string): () => number {
  let h = 1779033703 ^ str.length
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    h = (h ^ (h >>> 16)) >>> 0
    return h / 4294967296
  }
}

export function shuffle<T>(input: T[], r: () => number): T[] {
  const a = input.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1))
    const t = a[i]
    a[i] = a[j]
    a[j] = t
  }
  return a
}

export function layout(seed: string, design: Design, reps: number, n: number): LayoutBand[] {
  const r = rngFor(seed + design + reps + 'x' + n)
  const bands: LayoutBand[] = []
  if (design === 'Latin square') {
    const idx = [...Array(n).keys()]
    const rp = shuffle(idx, r)
    const cp = shuffle(idx, r)
    for (let i = 0; i < n; i++) {
      const cells: LayoutCell[] = []
      for (let c = 0; c < n; c++) cells.push({ num: String((i + 1) * 100 + c + 1), t: ((rp[i] + cp[c]) % n) + 1 })
      bands.push({ label: 'ROW ' + (i + 1), cells })
    }
  } else {
    for (let b = 0; b < reps; b++) {
      const ord = shuffle([...Array(n).keys()].map((x) => x + 1), r)
      const cells: LayoutCell[] = ord.map((t, c) => ({ num: String((b + 1) * 100 + c + 1), t }))
      cells.push({ num: String((b + 1) * 100 + n + 1), t: 0 })
      bands.push({ label: 'REP ' + (b + 1), cells })
    }
  }
  return bands
}

export interface CellColors {
  bg: string
  fg: string
  border: string
}

export function cellColors(t: number, mapStyle: 'colour' | 'print' = 'colour'): CellColors {
  if (t === 0) return { bg: '#EEF0EE', fg: '#A9ABA9', border: '1px solid #E4E4E6' }
  if (mapStyle === 'print') return { bg: '#FFFFFF', fg: '#141414', border: '1px solid #B9BBB9' }
  if (t === 1) return { bg: '#FFFFFF', fg: '#6B6D6B', border: '1px dashed #B9BBB9' }
  const hues = [0, 0, 25, 65, 105, 150, 195, 240, 290, 330, 15, 60, 205, 85, 265]
  const h = hues[t] || (t * 47) % 360
  return {
    bg: 'oklch(0.9 0.055 ' + h + ')',
    fg: 'oklch(0.41 0.095 ' + h + ')',
    border: '1px solid oklch(0.83 0.07 ' + h + ')',
  }
}

export interface DecoratedBand {
  label: string
  rowBg: string
  cells: Array<{ num: string; t: string; bg: string; fg: string; border: string }>
}

export function decorateBands(bands: LayoutBand[]): DecoratedBand[] {
  return bands.map((b, i) => ({
    label: b.label,
    rowBg: i % 2 ? '#FBFCFB' : '#F5F7F5',
    cells: b.cells.map((c) => {
      const cc = cellColors(c.t)
      return { num: c.num, t: c.t === 0 ? 'SP' : 'T' + c.t, bg: cc.bg, fg: cc.fg, border: cc.border }
    }),
  }))
}

const HEX = '0123456789ABCDEF'
export const randomSeed = () => [0, 0, 0, 0].map(() => HEX[Math.floor(Math.random() * 16)]).join('')
