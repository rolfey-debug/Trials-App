/** LAI: canopy classification, Beer's law inversion, keypad entry. */
import { canopyStats, isCanopyPixel, laiBackspace, laiFromCover, laiKeyDigit, LAI_MAX } from '../src/lib/lai'

let passed = 0
function ok(cond: boolean, msg: string) {
  if (!cond) {
    console.error(`FAIL ${msg}`)
    process.exit(1)
  }
  passed++
  console.log(`ok ${msg}`)
}

// --- pixel classification (Canopeo criteria) ------------------------------
ok(isCanopyPixel(40, 140, 50), 'classifier: healthy leaf green is canopy')
ok(isCanopyPixel(80, 120, 60), 'classifier: darker shaded leaf is canopy')
ok(!isCanopyPixel(120, 100, 80), 'classifier: soil brown is not canopy')
ok(!isCanopyPixel(180, 170, 90), 'classifier: senesced yellow leaf is not canopy')
ok(!isCanopyPixel(200, 200, 200), 'classifier: grey stubble/sky is not canopy')
ok(!isCanopyPixel(0, 0, 0), 'classifier: black (g=0 guard) is not canopy')
ok(!isCanopyPixel(30, 38, 28), 'classifier: dark shadow below the ExG noise floor is not canopy')

// --- cover fraction over synthetic image data -----------------------------
function rgba(pixels: Array<[number, number, number]>): Uint8ClampedArray {
  const a = new Uint8ClampedArray(pixels.length * 4)
  pixels.forEach(([r, g, b], i) => {
    a[i * 4] = r
    a[i * 4 + 1] = g
    a[i * 4 + 2] = b
    a[i * 4 + 3] = 255
  })
  return a
}
const half = rgba([
  [40, 140, 50],
  [40, 140, 50],
  [120, 100, 80],
  [120, 100, 80],
])
const stats = canopyStats(half)
ok(stats.total === 4 && stats.canopy === 2 && stats.fraction === 0.5, 'canopyStats: 2 leaf + 2 soil = 50% cover')
const mask = new Uint8Array(4)
canopyStats(half, mask)
ok(mask[0] === 1 && mask[1] === 1 && mask[2] === 0 && mask[3] === 0, 'canopyStats: mask marks exactly the canopy pixels')
ok(canopyStats(new Uint8ClampedArray(0)).fraction === 0, 'canopyStats: empty image is 0, not NaN')

// --- Beer's law inversion (k = 0.5) ---------------------------------------
// FC = 1 − e^(−k·LAI): LAI 1 → 39.3% cover; LAI 3 → 77.7%; LAI 6 → 95.0%
ok(laiFromCover(0.393).lai === 1.0, 'inversion: 39.3% cover → LAI 1.0')
ok(laiFromCover(0.777).lai === 3.0, 'inversion: 77.7% cover → LAI 3.0')
ok(laiFromCover(0).lai === 0, 'inversion: bare ground → LAI 0')
ok(!laiFromCover(0.9).saturated && laiFromCover(0.96).saturated, 'inversion: saturation flag switches at ~95% cover')
ok(laiFromCover(1).lai <= LAI_MAX, 'inversion: full cover clamps instead of Infinity')
{
  const round = laiFromCover(1 - Math.exp(-0.5 * 4.2)).lai
  ok(round === 4.2, 'inversion: round-trips LAI 4.2 through cover and back')
}

// --- keypad fixed-point entry ---------------------------------------------
ok(laiKeyDigit(undefined, 3) === 0.3, 'keypad: first digit lands in tenths')
ok(laiKeyDigit(0.3, 4) === 3.4, 'keypad: "3" then "4" reads 3.4')
ok(laiKeyDigit(3.4, 9) === LAI_MAX, 'keypad: overflow clamps at 9.9')
ok(laiBackspace(3.4) === 0.3, 'keypad: backspace drops the last digit')
ok(laiBackspace(0.3) === undefined, 'keypad: backspace on last digit clears the field')

console.log(`\n${passed} LAI checks passed`)
