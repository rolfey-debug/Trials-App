/** RCBD ANOVA + LSD letters against a hand-computed example. */
import { rcbdAnova, tCrit05 } from '../portal/src/lib/stats'

let passed = 0
function check(name: string, cond: boolean) {
  if (!cond) {
    console.error('FAIL', name)
    process.exitCode = 1
  } else {
    passed++
  }
}
const near = (a: number, b: number, eps = 0.01) => Math.abs(a - b) < eps

// Hand-computed: 3 treatments × 3 blocks.
// A: 10,12,14 (mean 12) · B: 20,22,24 (mean 22) · C: 10,13,13 (mean 12)
// grand 15.333; SS_trt 200; SS_block 20.667; SS_error 1.333; df_err 4;
// MSE 0.3333; LSD = 2.776·√(2·0.3333/3) = 1.3087
const a = rcbdAnova({ A: [10, 12, 14], B: [20, 22, 24], C: [10, 13, 13] })!
check('anova returns', !!a)
check('SS treatment = 200', near(a.ssTrt, 200))
check('SS block = 20.667', near(a.ssBlock, 20.667))
check('SS error = 1.333', near(a.ssError, 1.333))
check('df error = 4', a.dfError === 4)
check('LSD(5%) = 1.309', near(a.lsd05, 1.309))
check('B alone in top group', a.letters['B'] === 'a')
check('A and C share a letter', a.letters['A'] === a.letters['C'] && a.letters['A'] === 'b')

// all-equal means → everything shares one letter
const flat = rcbdAnova({ A: [5, 6, 7], B: [5, 6, 7], C: [5, 6, 7] })!
check('flat data: one letter for all', flat.letters['A'] === 'a' && flat.letters['B'] === 'a' && flat.letters['C'] === 'a')

// unbalanced input is refused rather than mis-analysed
check('unbalanced returns null', rcbdAnova({ A: [1, 2, 3], B: [1, 2] }) === null)

// one missing plot: Yates estimate (3·38 + 3·23 − 125) / 4 = 14.5, error df down by one
const miss = rcbdAnova({ A: [10, 12, 14], B: [20, 22, 24], C: [10, 13, null] })!
check('missing plot analysed', !!miss && miss.missing === 1 && miss.estimated.C?.[0] === 2)
check('missing plot estimate 14.5', near(miss.means.find((x) => x.key === 'C')!.mean, (10 + 13 + 14.5) / 3))
check('error df reduced to 3', miss.dfError === 3)
check('B still alone on top with a missing plot', miss.letters['B'] === 'a' && miss.letters['A'] === miss.letters['C'])
check('too many missing refused', rcbdAnova({ A: [1, null, 3], B: [null, 2, 3], C: [1, 2, null] }) === null)
check('a treatment with one value refused', rcbdAnova({ A: [1, null, null], B: [2, 2, 3], C: [1, 2, 3], D: [4, 5, 6], E: [1, 1, 2] }) === null)
check('single rep returns null', rcbdAnova({ A: [1], B: [2] }) === null)

// t table: exact rows and interpolation stay sane
check('t(4) = 2.776', near(tCrit05(4), 2.776, 0.001))
check('t(46) ≈ 2.013', near(tCrit05(46), 2.013, 0.01))
check('t(very large) → 1.96', near(tCrit05(5000), 1.96, 0.005))

console.log(`${passed} stats checks passed`)
