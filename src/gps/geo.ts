import type { Corner, LatLng, TrialDoc } from '../store/types'
import { isTreatmentCell } from '../lib/trial'

const R = 6371000 // earth radius, m
const rad = (d: number) => (d * Math.PI) / 180
const deg = (r: number) => (r * 180) / Math.PI

export function haversineM(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

export function bearingDeg(a: LatLng, b: LatLng): number {
  const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat))
  const x =
    Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng))
  return (deg(Math.atan2(y, x)) + 360) % 360
}

export function destination(p: LatLng, bearing: number, distM: number): LatLng {
  const br = rad(bearing)
  const dr = distM / R
  const lat1 = rad(p.lat)
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(dr) + Math.cos(lat1) * Math.sin(dr) * Math.cos(br))
  const lng2 = rad(p.lng) + Math.atan2(Math.sin(br) * Math.sin(dr) * Math.cos(lat1), Math.cos(dr) - Math.sin(lat1) * Math.sin(lat2))
  return { lat: deg(lat2), lng: deg(lng2) }
}

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

function pointInPolygon(pt: LatLng, poly: LatLng[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].lng
    const yi = poly[i].lat
    const xj = poly[j].lng
    const yj = poly[j].lat
    if (yi > pt.lat !== yj > pt.lat && pt.lng < ((xj - xi) * (pt.lat - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
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
