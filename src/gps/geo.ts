import type { Corner, LatLng, StoredPlot, TrialDoc } from '../store/types'
import { isTreatmentCell } from '../lib/trial'

// Distance, bearing and projection live in the shared geometry library so the
// portal's site planner and the phone lay plots with the same maths.
import { bearingDeg, destination, haversineM, pointInPolygon } from '../../shared/geometry'
export { bearingDeg, destination, haversineM }

/** Average a set of GPS fixes; accuracy tightens roughly with sqrt(n). */
export function averageFixes(fixes: Corner[]): Corner {
  const n = fixes.length
  if (n === 0) return { lat: 0, lng: 0, accuracy: 99 }
  const lat = fixes.reduce((s, f) => s + f.lat, 0) / n
  const lng = fixes.reduce((s, f) => s + f.lng, 0) / n
  const acc = fixes.reduce((s, f) => s + f.accuracy, 0) / n / Math.sqrt(Math.max(1, n / 2))
  return { lat, lng, accuracy: +acc.toFixed(1) }
}

export interface PlotPolygon {
  pid: number
  corners: LatLng[] // 4 corners, front-left first, clockwise
  centre: LatLng
}

export interface SiteGrid {
  bearingDeg: number
  frontEdgeM: number
  plotW: number
  plotL: number
  polygons: PlotPolygon[]
}

/**
 * Lay the whole grid from two corners (handoff spec, screen 3b):
 * A = front-left corner of Plot 101 (row 1, pos 1); B = end of the front edge past the last position.
 * A→B vector = front edge bearing (positions axis); rows run perpendicular, plot length each.
 */
export function gridFromCorners(A: Corner, B: Corner, doc: TrialDoc): SiteGrid {
  const { rows, positions } = doc.trial.grid
  const plotL = doc.trial.plot.lengthM
  const frontEdgeM = haversineM(A, B)
  const posBearing = bearingDeg(A, B)
  const rowBearing = (posBearing + 90) % 360
  const plotW = frontEdgeM / positions // measured width incl. inter-plot gap share
  const polygons: PlotPolygon[] = []
  for (let r = 1; r <= rows; r++) {
    for (let p = 1; p <= positions; p++) {
      const pid = r * 100 + p
      if (!isTreatmentCell(doc.cells[pid])) continue // OUT/skip/spare stay off; reserves keep theirs
      const o = destination(destination(A, posBearing, (p - 1) * plotW), rowBearing, (r - 1) * plotL)
      const c1 = o
      const c2 = destination(o, posBearing, plotW)
      const c3 = destination(c2, rowBearing, plotL)
      const c4 = destination(o, rowBearing, plotL)
      polygons.push({ pid, corners: [c1, c2, c3, c4], centre: destination(destination(o, posBearing, plotW / 2), rowBearing, plotL / 2) })
    }
  }
  // reserves keep their footprint too
  for (const [k, v] of Object.entries(doc.cells)) {
    if (v === 'reserve') {
      const pid = Number(k)
      const r = Math.floor(pid / 100)
      const p = pid % 100
      const o = destination(destination(A, posBearing, (p - 1) * plotW), rowBearing, (r - 1) * plotL)
      const c2 = destination(o, posBearing, plotW)
      polygons.push({
        pid,
        corners: [o, c2, destination(c2, rowBearing, plotL), destination(o, rowBearing, plotL)],
        centre: destination(destination(o, posBearing, plotW / 2), rowBearing, plotL / 2),
      })
    }
  }
  return { bearingDeg: Math.round(posBearing), frontEdgeM: +frontEdgeM.toFixed(1), plotW, plotL, polygons }
}

/** A grid from plot polygons stored by the office site planner: same
 * SiteGrid shape as gridFromCorners, so locate() works unchanged. */
export function gridFromStored(stored: StoredPlot[], doc: TrialDoc): SiteGrid {
  const polygons: PlotPolygon[] = stored
    .filter((p) => isTreatmentCell(doc.cells[p.pid]) || doc.cells[p.pid] === 'reserve')
    .map((p) => ({ pid: p.pid, corners: p.corners, centre: p.centre }))
  const first = stored[0]
  const plotW = first ? haversineM(first.corners[0], first.corners[1]) : doc.trial.plot.widthM
  const plotL = first ? haversineM(first.corners[1], first.corners[2]) : doc.trial.plot.lengthM
  const bearing = first ? bearingDeg(first.corners[0], first.corners[1]) : 0
  return { bearingDeg: Math.round(bearing), frontEdgeM: +(plotW * doc.trial.grid.positions).toFixed(1), plotW, plotL, polygons }
}

export interface Locate {
  pid: number | null
  row: number | null
  pos: number | null
  /** 'plot' when accuracy resolves a single plot; 'row' when it only resolves the row */
  confidence: 'plot' | 'row' | 'none'
  distM: number
}

/**
 * Locate = point-in-polygon, degrading to row-level confidence when GPS accuracy
 * exceeds the plot width (handoff spec, screen 3b).
 */
export function locate(fix: Corner, grid: SiteGrid): Locate {
  let hit: PlotPolygon | null = null
  let best: PlotPolygon | null = null
  let bestD = Infinity
  for (const p of grid.polygons) {
    const d = haversineM(fix, p.centre)
    if (d < bestD) {
      bestD = d
      best = p
    }
    if (!hit && pointInPolygon(fix, p.corners)) hit = p
  }
  const found = hit ?? (bestD < grid.plotL ? best : null)
  if (!found) return { pid: null, row: null, pos: null, confidence: 'none', distM: bestD }
  const conf = fix.accuracy <= grid.plotW ? 'plot' : fix.accuracy <= grid.plotL ? 'row' : 'none'
  return { pid: found.pid, row: Math.floor(found.pid / 100), pos: found.pid % 100, confidence: conf, distM: bestD }
}

/** Distance from a fix to the site (nearest plot centre); used for nearest-trial geofences. */
export function distToSiteM(fix: LatLng, grid: SiteGrid): number {
  let best = Infinity
  for (const p of grid.polygons) best = Math.min(best, haversineM(fix, p.centre))
  return best
}
