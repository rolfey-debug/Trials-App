/**
 * Trial geometry — pure functions shared by the field app, the portal and
 * the server-side generators. No dependencies, no DOM.
 *
 * A trial block is placed on a site by an origin (the front-left corner of
 * plot 101), a bearing along the positions axis, plot size and a grid.
 * Rows run perpendicular to the positions axis, plot length each. Plot ids
 * are row × 100 + position, the convention everything downstream uses.
 *
 * Output polygons are WGS84 lat/lng corners, front-left first, clockwise,
 * plus WKT (EWKT with SRID 4326) for writing straight into PostGIS columns
 * through PostgREST.
 */

export interface LatLng {
  lat: number
  lng: number
}

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
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng))
  return (deg(Math.atan2(y, x)) + 360) % 360
}

/** Point `distM` metres from `p` along `bearing` (degrees clockwise from north). */
export function destination(p: LatLng, bearing: number, distM: number): LatLng {
  const br = rad(bearing)
  const dr = distM / R
  const lat1 = rad(p.lat)
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(dr) + Math.cos(lat1) * Math.sin(dr) * Math.cos(br))
  const lng2 = rad(p.lng) + Math.atan2(Math.sin(br) * Math.sin(dr) * Math.cos(lat1), Math.cos(dr) - Math.sin(lat1) * Math.sin(lat2))
  return { lat: deg(lat2), lng: deg(lng2) }
}

/** Cell kinds a block can hold; anything but a number is a non-treatment cell. */
export type BlockCell = number | 'out' | 'skip' | 'spare' | 'reserve' | 'buffer'

export interface BlockSpec {
  /** Front-left corner of plot 101 (row 1, position 1). */
  origin: LatLng
  /** Bearing of the positions axis, degrees clockwise from north. */
  bearingDeg: number
  /** Plot width along the positions axis, m. */
  plotW: number
  /** Plot length along the rows axis, m. */
  plotL: number
  rows: number
  positions: number
  /** Gap between adjacent positions, m (sprayer overlap, wheel track). Default 0. */
  posGapM?: number
  /** Gap between adjacent rows, m (alley, headland). Default 0. */
  rowGapM?: number
}

export interface PlotShape {
  plot: number
  row: number
  position: number
  kind: 'plot' | 'strip' | 'buffer' | 'out' | 'reserve' | 'spare'
  treatment: number | null
  /** 4 corners, front-left first, clockwise. */
  corners: LatLng[]
  centre: LatLng
}

/** Lay every cell of a block as a polygon. `cells` (plot id → cell kind) says
 * which cells carry a treatment; cells marked `skip` are left out entirely,
 * `out`/`spare`/`reserve`/`buffer` keep their footprint with that kind, and
 * cells absent from `cells` are plain plots with no treatment yet. */
export function blockPlots(spec: BlockSpec, cells: Record<string, BlockCell> = {}, strip = false): PlotShape[] {
  const posBearing = ((spec.bearingDeg % 360) + 360) % 360
  const rowBearing = (posBearing + 90) % 360
  const stepP = spec.plotW + (spec.posGapM ?? 0)
  const stepR = spec.plotL + (spec.rowGapM ?? 0)
  const out: PlotShape[] = []
  for (let r = 1; r <= spec.rows; r++) {
    for (let p = 1; p <= spec.positions; p++) {
      const plot = r * 100 + p
      const cell = cells[plot]
      if (cell === 'skip') continue
      const o = destination(destination(spec.origin, posBearing, (p - 1) * stepP), rowBearing, (r - 1) * stepR)
      const c2 = destination(o, posBearing, spec.plotW)
      const c3 = destination(c2, rowBearing, spec.plotL)
      const c4 = destination(o, rowBearing, spec.plotL)
      const kind: PlotShape['kind'] = typeof cell === 'number' || cell === undefined ? (strip ? 'strip' : 'plot') : cell
      out.push({
        plot,
        row: r,
        position: p,
        kind,
        treatment: typeof cell === 'number' ? cell : null,
        corners: [o, c2, c3, c4],
        centre: destination(destination(o, posBearing, spec.plotW / 2), rowBearing, spec.plotL / 2),
      })
    }
  }
  return out
}

/** The block's outer rectangle, front-left first, clockwise. */
export function blockOutline(spec: BlockSpec): LatLng[] {
  const posBearing = ((spec.bearingDeg % 360) + 360) % 360
  const rowBearing = (posBearing + 90) % 360
  const wide = spec.positions * spec.plotW + (spec.positions - 1) * (spec.posGapM ?? 0)
  const long = spec.rows * spec.plotL + (spec.rows - 1) * (spec.rowGapM ?? 0)
  const o = spec.origin
  const c2 = destination(o, posBearing, wide)
  return [o, c2, destination(c2, rowBearing, long), destination(o, rowBearing, long)]
}

/** Recover a block spec from two pegged corners: A = front-left of plot 101,
 * B = the end of the front edge past the last position. Plot width is what
 * was measured, so the gap share is absorbed into it. */
export function blockFromCorners(A: LatLng, B: LatLng, rows: number, positions: number, plotL: number): BlockSpec {
  const frontEdgeM = haversineM(A, B)
  return { origin: A, bearingDeg: bearingDeg(A, B), plotW: frontEdgeM / positions, plotL, rows, positions }
}

/** Move a block so its origin lands on `to` (same bearing and size). */
export function moveBlock(spec: BlockSpec, to: LatLng): BlockSpec {
  return { ...spec, origin: to }
}

/** Rotate a block about its centre by `deltaDeg` (clockwise positive). */
export function rotateBlock(spec: BlockSpec, deltaDeg: number): BlockSpec {
  const outline = blockOutline(spec)
  const centre = centroid(outline)
  const d = haversineM(centre, spec.origin)
  const b = bearingDeg(centre, spec.origin)
  return { ...spec, bearingDeg: (spec.bearingDeg + deltaDeg + 360) % 360, origin: destination(centre, b + deltaDeg, d) }
}

export function centroid(poly: LatLng[]): LatLng {
  const n = poly.length
  return { lat: poly.reduce((s, p) => s + p.lat, 0) / n, lng: poly.reduce((s, p) => s + p.lng, 0) / n }
}

/** Planar area of a small polygon in m², via a local equirectangular projection. */
export function areaM2(poly: LatLng[]): number {
  if (poly.length < 3) return 0
  const lat0 = rad(centroid(poly).lat)
  // metres per degree on the WGS84 ellipsoid at this latitude
  const ky = 111132.954 - 559.822 * Math.cos(2 * lat0) + 1.175 * Math.cos(4 * lat0)
  const kx = 111412.84 * Math.cos(lat0) - 93.5 * Math.cos(3 * lat0)
  let s = 0
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].lng * kx
    const yi = poly[i].lat * ky
    const xj = poly[j].lng * kx
    const yj = poly[j].lat * ky
    s += xj * yi - xi * yj
  }
  return Math.abs(s) / 2
}

export function pointInPolygon(pt: LatLng, poly: LatLng[]): boolean {
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

/** EWKT polygon for a PostGIS geometry(Polygon, 4326) column. Closes the ring. */
export function polygonWkt(poly: LatLng[]): string {
  const ring = [...poly, poly[0]].map((p) => `${p.lng.toFixed(8)} ${p.lat.toFixed(8)}`).join(', ')
  return `SRID=4326;POLYGON((${ring}))`
}

export function pointWkt(p: LatLng): string {
  return `SRID=4326;POINT(${p.lng.toFixed(8)} ${p.lat.toFixed(8)})`
}

/** GeoJSON Polygon → lat/lng ring (outer ring only, closing point dropped). */
export function ringFromGeoJson(g: { type: string; coordinates: number[][][] } | null | undefined): LatLng[] {
  if (!g || g.type !== 'Polygon' || !g.coordinates?.[0]) return []
  const ring = g.coordinates[0].map(([lng, lat]) => ({ lat, lng }))
  if (ring.length > 1 && ring[0].lat === ring[ring.length - 1].lat && ring[0].lng === ring[ring.length - 1].lng) ring.pop()
  return ring
}

export function polygonGeoJson(poly: LatLng[]): { type: 'Polygon'; coordinates: number[][][] } {
  return { type: 'Polygon', coordinates: [[...poly, poly[0]].map((p) => [p.lng, p.lat])] }
}
