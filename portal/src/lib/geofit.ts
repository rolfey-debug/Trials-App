/** Fit the trial's plot grid to GPS-tagged photo points. Each photo knows its
 * plot (row, position); the grid is a rigid lattice centre(row, pos) =
 * origin + (pos−1)·u + (row−1)·v. Solving u, v and origin by least squares
 * over hundreds of ±5 m phone fixes recovers the paddock-true grid without
 * pegging corners. Validated in test/geofit.test.ts. */

export interface GeoPoint {
  lat: number
  lng: number
  row: number
  pos: number
}

export interface GridFit {
  /** plot centre in lat/lng for a given row/position */
  centre: (row: number, pos: number) => { lat: number; lng: number }
  /** polygon (4 corners, lat/lng) for a plot cell */
  cell: (row: number, pos: number) => Array<[number, number]>
  /** RMS residual of the fit, metres */
  rmsM: number
  points: number
}

/** 3×3 linear solve (Gaussian elimination, partial pivot). */
function solve3(a: number[][], b: number[]): number[] | null {
  const m = a.map((r, i) => [...r, b[i]])
  for (let c = 0; c < 3; c++) {
    let piv = c
    for (let r = c + 1; r < 3; r++) if (Math.abs(m[r][c]) > Math.abs(m[piv][c])) piv = r
    if (Math.abs(m[piv][c]) < 1e-9) return null
    ;[m[c], m[piv]] = [m[piv], m[c]]
    for (let r = 0; r < 3; r++) {
      if (r === c) continue
      const f = m[r][c] / m[c][c]
      for (let k = c; k < 4; k++) m[r][k] -= f * m[c][k]
    }
  }
  return [m[0][3] / m[0][0], m[1][3] / m[1][1], m[2][3] / m[2][2]]
}

export function fitGrid(pts: GeoPoint[], minPoints = 20, maxRmsM = 15): GridFit | null {
  if (pts.length < minPoints) return null
  const lat0 = pts.reduce((a, p) => a + p.lat, 0) / pts.length
  const lng0 = pts.reduce((a, p) => a + p.lng, 0) / pts.length
  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180)
  const ky = 110574
  const toXY = (lat: number, lng: number) => ({ x: (lng - lng0) * kx, y: (lat - lat0) * ky })
  const toLL = (x: number, y: number) => ({ lat: lat0 + y / ky, lng: lng0 + x / kx })

  // predictors p = pos−1, r = row−1; fit x and y independently:
  // x = Ox + p·ux + r·vx  (and likewise for y)
  let sp = 0
  let sr = 0
  let spp = 0
  let srr = 0
  let spr = 0
  const n = pts.length
  for (const q of pts) {
    const p = q.pos - 1
    const r = q.row - 1
    sp += p
    sr += r
    spp += p * p
    srr += r * r
    spr += p * r
  }
  const A = [
    [n, sp, sr],
    [sp, spp, spr],
    [sr, spr, srr],
  ]
  const bx = [0, 0, 0]
  const by = [0, 0, 0]
  for (const q of pts) {
    const { x, y } = toXY(q.lat, q.lng)
    const p = q.pos - 1
    const r = q.row - 1
    bx[0] += x
    bx[1] += x * p
    bx[2] += x * r
    by[0] += y
    by[1] += y * p
    by[2] += y * r
  }
  const X = solve3(A, bx)
  const Y = solve3(A, by)
  if (!X || !Y) return null
  const [ox, ux, vx] = X
  const [oy, uy, vy] = Y

  // degenerate fits (single row/column, or a collapsed axis) are refused
  const uLen = Math.hypot(ux, uy)
  const vLen = Math.hypot(vx, vy)
  if (uLen < 0.5 || vLen < 0.5) return null

  let ss = 0
  for (const q of pts) {
    const { x, y } = toXY(q.lat, q.lng)
    const p = q.pos - 1
    const r = q.row - 1
    ss += (x - (ox + p * ux + r * vx)) ** 2 + (y - (oy + p * uy + r * vy)) ** 2
  }
  const rmsM = Math.sqrt(ss / n)
  if (rmsM > maxRmsM) return null

  const centreXY = (row: number, pos: number) => ({ x: ox + (pos - 1) * ux + (row - 1) * vx, y: oy + (pos - 1) * uy + (row - 1) * vy })
  return {
    rmsM,
    points: n,
    centre: (row, pos) => {
      const c = centreXY(row, pos)
      return toLL(c.x, c.y)
    },
    cell: (row, pos) => {
      const c = centreXY(row, pos)
      const corners: Array<[number, number]> = []
      for (const [su, sv] of [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]] as const) {
        const ll = toLL(c.x + su * ux + sv * vx, c.y + su * uy + sv * vy)
        corners.push([ll.lat, ll.lng])
      }
      return corners
    },
  }
}
