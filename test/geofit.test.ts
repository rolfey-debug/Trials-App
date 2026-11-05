/** Grid fit from noisy GPS points: recovers a synthetic lattice. */
import { fitGrid, type GeoPoint } from '../portal/src/lib/geofit'

let passed = 0
function check(name: string, cond: boolean) {
  if (!cond) {
    console.error('FAIL', name)
    process.exitCode = 1
  } else {
    passed++
  }
}

// Synthetic Ringwood-like lattice: origin near Corowa, u ≈ 2 m east,
// v ≈ 14 m north, 12 rows × 8 positions, 5 photos per plot, ±4 m noise.
const lat0 = -35.99
const lng0 = 146.39
const kx = 111320 * Math.cos((lat0 * Math.PI) / 180)
const ky = 110574
let seed = 42
const rand = () => {
  // deterministic LCG so the test never flakes
  seed = (seed * 1664525 + 1013904223) % 4294967296
  return seed / 4294967296 - 0.5
}
const pts: GeoPoint[] = []
for (let row = 1; row <= 12; row++)
  for (let pos = 1; pos <= 8; pos++)
    for (let k = 0; k < 5; k++) {
      const x = (pos - 1) * 2 + rand() * 8
      const y = (row - 1) * 14 + rand() * 8
      pts.push({ row, pos, lat: lat0 + y / ky, lng: lng0 + x / kx })
    }

const fit = fitGrid(pts)!
check('fit returns', !!fit)
check('rms within noise scale', fit.rmsM < 4)

// recovered centre of plot (6, 4) lands within a metre of truth
const c = fit.centre(6, 4)
const dx = (c.lng - (lng0 + ((4 - 1) * 2) / kx)) * kx
const dy = (c.lat - (lat0 + ((6 - 1) * 14) / ky)) * ky
check('plot centre within 1 m of truth', Math.hypot(dx, dy) < 1)

// cell polygon spans ≈ 2 m × 14 m
const cell = fit.cell(6, 4)
const w = Math.hypot((cell[1][1] - cell[0][1]) * kx, (cell[1][0] - cell[0][0]) * ky)
const h = Math.hypot((cell[3][1] - cell[0][1]) * kx, (cell[3][0] - cell[0][0]) * ky)
check('cell width ≈ 2 m', Math.abs(w - 2) < 0.5)
check('cell height ≈ 14 m', Math.abs(h - 14) < 1)

// refusals: too few points, and a single-row (degenerate) layout
check('too few points → null', fitGrid(pts.slice(0, 10)) === null)
check('single row → null', fitGrid(pts.filter((p) => p.row === 1)) === null)

console.log(`${passed} geofit checks passed`)
