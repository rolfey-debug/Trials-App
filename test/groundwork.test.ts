/** Groundwork tests: randomisation engine + product database/search. */
import { readFileSync } from 'node:fs'
import { crd, rcbd, latinSquare, splitPlot, factorial, layoutRcbd } from '../shared/randomisation'
import { searchProducts, byActive, activesLabel, type RegisteredProduct } from '../shared/products/search'

let passed = 0
function check(name: string, cond: boolean) {
  if (!cond) {
    console.error(`FAIL ${name}`)
    process.exit(1)
  }
  console.log(`ok ${name}`)
  passed++
}

// --- randomisation -----------------------------------------------------------

{
  const blocks = rcbd(24, 3, 'matong-2026')
  check(
    'rcbd: every treatment exactly once per block',
    blocks.length === 3 && blocks.every((b) => new Set(b).size === 24 && Math.min(...b) === 1 && Math.max(...b) === 24),
  )
  const again = rcbd(24, 3, 'matong-2026')
  check('rcbd: deterministic for same seed', JSON.stringify(blocks) === JSON.stringify(again))
  check('rcbd: different seed differs', JSON.stringify(rcbd(24, 3, 'other')) !== JSON.stringify(blocks))
}

{
  const pool = crd(10, 4, 'seed')
  const counts = new Map<number, number>()
  pool.forEach((t) => counts.set(t, (counts.get(t) ?? 0) + 1))
  check('crd: pool has reps of each treatment', pool.length === 40 && [...counts.values()].every((c) => c === 4))
}

{
  const sq = latinSquare(6, 'ls')
  const okRows = sq.every((r) => new Set(r).size === 6)
  const okCols = sq[0].every((_, c) => new Set(sq.map((r) => r[c])).size === 6)
  check('latin square: rows and columns each contain every treatment', okRows && okCols)
}

{
  const sp = splitPlot(4, 3, 2, 'sp')
  const okMains = sp.reps.every((r) => new Set(r.map((m) => m.main)).size === 4)
  const okSubs = sp.reps.every((r) => r.every((m) => new Set(m.subs).size === 3))
  check('split-plot: mains complete per rep, subs complete per main', okMains && okSubs)
}

{
  const combos = factorial([
    ['Product A', 'Product B'],
    ['0.5x', '1x', '2x'],
  ])
  check('factorial: 2×3 = 6 numbered combos', combos.length === 6 && combos[5].n === 6 && combos[0].name === 'Product A × 0.5x')
}

{
  // Matong-shaped layout: 12 rows × 8 positions, 24 treatments × 3 reps
  const layout = layoutRcbd({
    treatments: 24,
    reps: 3,
    grid: { rows: 12, positions: 8 },
    repBands: { 1: [1, 2], 2: [3, 4, 5], 3: [6, 7, 8] },
    seed: 'matong-2026',
  })
  check('layout: 96 cells total', Object.keys(layout.cells).length === 96)
  const spare = Object.values(layout.cells).filter((c) => c === 'spare').length
  check('layout: 72 treatment plots + 24 spares', spare === 24)
  const okPerTreatment = Object.values(layout.plots).every((p) => p.length === 3)
  check('layout: every treatment has one plot per rep', okPerTreatment)
  const band1 = new Set([1, 2])
  const rep1Plots = Object.values(layout.plots).map((p) => p[0])
  check(
    'layout: first plot of each treatment falls in rep-1 band',
    rep1Plots.every((id) => band1.has(id % 100)),
  )
  check('layout: walk order covers all 72 plots', new Set(layout.walkOrder).size === 72)
  const auto = layoutRcbd({ treatments: 10, reps: 3, grid: { rows: 10, positions: 6 }, seed: 's' })
  check('layout: auto rep bands split positions across reps', Object.keys(auto.repBands).length === 3)
}

// --- products ---------------------------------------------------------------

const db = JSON.parse(readFileSync(new URL('../shared/products/products.json', import.meta.url), 'utf8'))
const products: RegisteredProduct[] = db.products

check('products: several thousand registered crop-protection products', products.length > 5000)
check(
  'products: aviator xpro present with both actives',
  products.some(
    (p) =>
      p.name.toLowerCase().includes('aviator xpro') &&
      p.actives.some((a) => a.name === 'BIXAFEN') &&
      p.actives.some((a) => a.name === 'PROTHIOCONAZOLE'),
  ),
)

{
  const hits = searchProducts('aviator', products)
  check('search: "aviator" top hit is an Aviator product', hits.length > 0 && hits[0].name.toLowerCase().startsWith('aviator'))
}
{
  const hits = searchProducts('prothioconazole', products, [], { limit: 500 })
  check(
    'search: active-ingredient query returns products containing it',
    hits.length > 10 && hits.every((h) => 'actives' in h && h.actives.some((a) => a.name.includes('PROTHIOCONAZOLE'))),
  )
}
{
  const exp = [{ id: 'x1', name: 'AGV-EXP-24 Experimental', actives: [{ name: 'CODED ACTIVE' }] }]
  const hits = searchProducts('agv-exp', products, exp)
  check('search: experimental products are findable', hits.length === 1 && hits[0].kind === 'experimental')
}
{
  const withActive = byActive('mefentrifluconazole', products)
  check('byActive: finds Revystar family', withActive.some((p) => p.name.toLowerCase().includes('revystar')))
  const label = activesLabel(withActive[0])
  check('activesLabel: renders name + rate', /mefentrifluconazole \d/.test(label))
}


// --- ringwood fixture -------------------------------------------------------
{
  const rw = JSON.parse(readFileSync(new URL('../fixtures/ringwood-trial.json', import.meta.url), 'utf8'))
  const cells: Record<string, number | string> = rw.cells
  const vals = Object.values(cells)
  check('ringwood: 96 cells on the 12×8 grid', Object.keys(cells).length === 96)
  check(
    'ringwood: 72 treated + 5 write-offs + 19 marginal-unused',
    vals.filter((v) => typeof v === 'number').length === 72 &&
      vals.filter((v) => v === 'out').length === 5 &&
      vals.filter((v) => v === 'skip').length === 19,
  )
  check('ringwood: 24 treatments, each with one plot per rep', rw.treatments.length === 24 && rw.treatments.every((t: any) => t.plots.length === 3))
  const rowOk = rw.treatments.every((t: any) => {
    const [r1, r2, r3] = t.plots.map((p: number) => Math.floor(p / 100))
    return r1 >= 1 && r1 <= 4 && r2 >= 6 && r2 <= 9 && r3 >= 9 && r3 <= 12
  })
  check('ringwood: rep row bands hold (1–4 / 6–9 / 9–12)', rowOk)
  check(
    'ringwood: allocation and cells agree',
    rw.treatments.every((t: any) => t.plots.every((p: number) => cells[String(p)] === t.n)),
  )
  const aOnly = rw.treatments.filter((t: any) => !t.bSpray).map((t: any) => t.n)
  check('ringwood: A-only treatments are 1, 22, 23, 24', JSON.stringify(aOnly) === '[1,22,23,24]')
  const t5 = rw.treatments[4]
  check(
    'ringwood: per-batch mL match the workbook (trt 5 Radial Opti)',
    JSON.stringify(t5.perBatchMl) === '[4.032,1.575,6.3]' && rw.trial.batchVolumeL === 1.26,
  )
  check('ringwood: marginals carrying treatments flagged', JSON.stringify(rw.marginalPlots) === '[105,108,704,708]')
  check('ringwood: row-blocked design flagged for repOf', rw.trial.blocking === 'row')
}

// --- sync ids ---------------------------------------------------------------
{
  const { stableId } = await import('../shared/supa')
  const re = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/
  const ids = [stableId('t', 1, 101, 'gs'), stableId('t', 1, 101, 'ndvi'), stableId('t', 1, 102, 'gs')]
  check('stableId: valid RFC-4122-shaped uuids', ids.every((i) => re.test(i)))
  check('stableId: deterministic and distinct', stableId('t', 1, 101, 'gs') === ids[0] && new Set(ids).size === 3)
}

console.log(`\n${passed} groundwork checks passed`)
