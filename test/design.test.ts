/** Design advisor: LSD% arithmetic and the randomiser's guarantees. */
import { advise, errorDf, lsdPercent, plan } from '../portal/src/lib/design'

let passed = 0
function check(name: string, cond: boolean) {
  if (!cond) {
    console.error('FAIL', name)
    process.exitCode = 1
  } else {
    passed++
  }
}
const near = (a: number | null, b: number, tol: number) => a !== null && Math.abs(a - b) <= tol

// --- degrees of freedom and LSD% ---------------------------------------------
check('RCBD df (8 trt, 4 reps) = 21', errorDf('RCBD', 8, 4) === 21)
check('CRD df (8 trt, 4 reps) = 24', errorDf('CRD', 8, 4) === 24)
check('Latin square df (5) = 12', errorDf('Latin square', 5, 5) === 12)
check('Demo has no df', errorDf('Demo', 8, 1) === null)
check('one rep has no df', errorDf('RCBD', 8, 1) === null)

// t(21) = 2.080 · 10% · √(2/4) = 14.7%
check('LSD% 8 trt × 4 reps at CV 10 ≈ 14.7', near(lsdPercent('RCBD', 8, 4, 10), 14.7, 0.2))
// t(7) = 2.365 · 10 · √(2/2) = 23.7%
check('LSD% 8 trt × 2 reps at CV 10 ≈ 23.7', near(lsdPercent('RCBD', 8, 2, 10), 23.7, 0.2))
check('more reps, smaller LSD', (lsdPercent('RCBD', 8, 6, 10) ?? 99) < (lsdPercent('RCBD', 8, 3, 10) ?? 0))
check('higher CV, bigger LSD', (lsdPercent('RCBD', 8, 4, 25) ?? 0) > (lsdPercent('RCBD', 8, 4, 10) ?? 99))
check('Latin square uses nTrt as reps', near(lsdPercent('Latin square', 5, 1, 10), lsdPercent('RCBD', 5, 5, 10) ?? -1, 0.5))

const good = advise({ type: 'RCBD', nTrt: 8, reps: 4, cv: 8 })
check('good verdict at CV 8, 4 reps', good.verdict === 'good' && good.dfError === 21)
const weak = advise({ type: 'RCBD', nTrt: 6, reps: 2, cv: 25 })
check('weak verdict at CV 25, 2 reps', weak.verdict === 'weak')
check('weak advice mentions df', weak.lines.some((l) => /degrees of freedom/.test(l)))
const demo = advise({ type: 'Demo', nTrt: 8, reps: 1, cv: 15 })
check('demo verdict none with RCBD options', demo.verdict === 'none' && demo.lsdPct === null && demo.options.length === 3)
const demoRep = advise({ type: 'RCBD', nTrt: 8, reps: 2, cv: 15, demoRep: true })
check('demo rep with 2 reps is warned', demoRep.lines.some((l) => /only 2 reps/i.test(l)))
check('options exclude the current rep count', advise({ type: 'RCBD', nTrt: 8, reps: 4, cv: 10 }).options.every((o) => !(o.type === 'RCBD' && o.reps === 4)))

// --- randomiser ------------------------------------------------------------
const p = plan({ seed: 'A7F3', type: 'RCBD', nTrt: 8, reps: 4, spare: 1 })
check('4 bands', p.bands.length === 4 && p.rows === 4 && p.positions === 9)
check('plot numbers rep*100+position', p.bands[2].cells[4].plot === 305 && p.bands[0].cells[8].plot === 109)
check('spare cell is trt 0', p.bands.every((b) => b.cells[8].trt === 0))
check('every treatment once per rep', p.bands.every((b) => new Set(b.cells.filter((c) => c.trt).map((c) => c.trt)).size === 8))
check('byTrt has 4 plots each', Object.values(p.byTrt).every((x) => x.length === 4) && Object.keys(p.byTrt).length === 8)
check('deterministic', JSON.stringify(plan({ seed: 'A7F3', type: 'RCBD', nTrt: 8, reps: 4, spare: 1 })) === JSON.stringify(p))
check('seed changes the order', JSON.stringify(plan({ seed: 'B000', type: 'RCBD', nTrt: 8, reps: 4, spare: 1 }).bands[0]) !== JSON.stringify(p.bands[0]))
check('reps are not all identical', p.bands.some((b) => b.cells.map((c) => c.trt).join() !== p.bands[0].cells.map((c) => c.trt).join()))

const d = plan({ seed: 'A7F3', type: 'RCBD', nTrt: 6, reps: 3, demoRep: true })
check('demo rep 1 in treatment order', d.bands[0].cells.map((c) => c.trt).join() === '1,2,3,4,5,6')
check('demo rep 2 randomised', d.bands[1].cells.map((c) => c.trt).join() !== '1,2,3,4,5,6' && new Set(d.bands[1].cells.map((c) => c.trt)).size === 6)

const ls = plan({ seed: 'C1', type: 'Latin square', nTrt: 5, reps: 1 })
check('latin square 5 × 5', ls.rows === 5 && ls.positions === 5)
check('latin square columns complete', [0, 1, 2, 3, 4].every((c) => new Set(ls.bands.map((b) => b.cells[c].trt)).size === 5))
check('latin square rows complete', ls.bands.every((b) => new Set(b.cells.map((c) => c.trt)).size === 5))

const crd = plan({ seed: 'C1', type: 'CRD', nTrt: 4, reps: 3 })
check('CRD has every treatment 3 times', Object.values(crd.byTrt).every((x) => x.length === 3) && crd.rows === 3)

const demoPlan = plan({ seed: 'X', type: 'Demo', nTrt: 7, reps: 1 })
check('demo plan is one band in order', demoPlan.rows === 1 && demoPlan.bands[0].cells.map((c) => c.trt).join() === '1,2,3,4,5,6,7')
check('empty plan for no treatments', plan({ seed: 'X', type: 'RCBD', nTrt: 0, reps: 3 }).bands.length === 0)

console.log(`design: ${passed} checks passed`)
