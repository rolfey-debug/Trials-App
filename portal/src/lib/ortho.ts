/** Drone ortho (GeoTIFF) ingestion — the plot-level NDVI path (F28).
 * Parses a single-band NDVI GeoTIFF in the browser (geotiff.js), reprojects
 * the common Australian CRSs to WGS84 (proj4), and samples mean NDVI inside
 * each GPS-fitted plot polygon. Pure data code — no DOM — so it runs in the
 * node test too (test/ortho.test.ts). */
import { fromArrayBuffer } from 'geotiff'
import proj4 from 'proj4'

export interface Ortho {
  width: number
  height: number
  /** band-0 value per pixel, row-major from the NW corner; NaN = nodata */
  values: Float32Array
  /** value range actually present (after nodata removal) */
  min: number
  max: number
  /** axis-aligned WGS84 bounds [[south, west], [north, east]] */
  bounds: [[number, number], [number, number]]
  /** raster pixel coordinates for a lat/lng (fractional; may fall outside) */
  toPixel: (lat: number, lng: number) => { x: number; y: number }
}

/** proj4 string for the EPSG codes drone orthos around here come in:
 * WGS84 UTM south (327xx), GDA94 MGA (283xx) and GDA2020 MGA (78xx).
 * GDA94/GDA2020 vs WGS84 datum shift is well under plot size. */
function projFor(epsg: number | undefined): string | null {
  if (!epsg || epsg === 4326 || epsg === 4283 || epsg === 7844) return null // already geographic
  const utm = (zone: number, grs80: boolean) =>
    `+proj=utm +zone=${zone} +south +${grs80 ? 'ellps=GRS80' : 'datum=WGS84'} +units=m +no_defs`
  if (epsg >= 32748 && epsg <= 32758) return utm(epsg - 32700, false)
  if (epsg >= 28348 && epsg <= 28358) return utm(epsg - 28300, true)
  if (epsg >= 7846 && epsg <= 7859) return utm(epsg - 7800, true)
  throw new Error(`Unsupported CRS EPSG:${epsg} — export the ortho in WGS84 or UTM/MGA`)
}

const MAX_DIM = 4096 // drone orthos run to 10k+ px a side; resample on read

export async function parseOrtho(buf: ArrayBuffer): Promise<Ortho> {
  const tiff = await fromArrayBuffer(buf)
  const image = await tiff.getImage()
  const fullW = image.getWidth()
  const fullH = image.getHeight()
  const scale = Math.min(1, MAX_DIM / Math.max(fullW, fullH))
  const width = Math.max(1, Math.round(fullW * scale))
  const height = Math.max(1, Math.round(fullH * scale))
  const keys = image.getGeoKeys() as { ProjectedCSTypeGeoKey?: number; GeographicTypeGeoKey?: number } | null
  const proj = projFor(keys?.ProjectedCSTypeGeoKey ?? keys?.GeographicTypeGeoKey)
  const [x0, y0, x1, y1] = image.getBoundingBox() // CRS units, [minx,miny,maxx,maxy]

  const rasters = await image.readRasters({ samples: [0], width, height, resampleMethod: 'nearest' })
  const band = rasters[0] as ArrayLike<number>
  const nodata = image.getGDALNoData()

  const values = new Float32Array(width * height)
  let min = Infinity
  let max = -Infinity
  for (let i = 0; i < values.length; i++) {
    let v: number = band[i]
    if (v === nodata || !Number.isFinite(v)) v = NaN
    values[i] = v
    if (!Number.isNaN(v)) {
      if (v < min) min = v
      if (v > max) max = v
    }
  }
  if (min === Infinity) throw new Error('Ortho contains no data pixels')
  // uint8 NDVI exports map 0..255 onto −1..1
  if (max > 1.5 && max <= 255 && min >= 0) {
    for (let i = 0; i < values.length; i++) values[i] = (values[i] / 255) * 2 - 1
    min = (min / 255) * 2 - 1
    max = (max / 255) * 2 - 1
  }

  const toCrs = proj ? proj4('EPSG:4326', proj) : null
  const toLL = proj ? proj4(proj, 'EPSG:4326') : null
  const toPixel = (lat: number, lng: number) => {
    const [x, y] = toCrs ? toCrs.forward([lng, lat]) : [lng, lat]
    return { x: ((x - x0) / (x1 - x0)) * width, y: ((y1 - y) / (y1 - y0)) * height }
  }
  // WGS84 bounds from the 4 CRS corners (UTM edges bow very slightly; the
  // axis-aligned hull is fine at paddock scale)
  const cornersLL = (
    [
      [x0, y1],
      [x1, y1],
      [x1, y0],
      [x0, y0],
    ] as Array<[number, number]>
  ).map(([x, y]) => (toLL ? toLL.forward([x, y]) : [x, y]))
  const lats = cornersLL.map((c) => c[1])
  const lngs = cornersLL.map((c) => c[0])
  return {
    width,
    height,
    values,
    min,
    max,
    bounds: [
      [Math.min(...lats), Math.min(...lngs)],
      [Math.max(...lats), Math.max(...lngs)],
    ],
    toPixel,
  }
}

/** Mean band value inside a lat/lng polygon (plot cell): point-in-polygon
 * over the covered pixel centres. Returns null when fewer than minPixels
 * data pixels land inside (plot outside the flight, or all nodata). */
export function sampleMean(o: Ortho, poly: Array<[number, number]>, minPixels = 4): { mean: number; pixels: number } | null {
  const px = poly.map(([lat, lng]) => o.toPixel(lat, lng))
  const xs = px.map((p) => p.x)
  const ys = px.map((p) => p.y)
  const xMin = Math.max(0, Math.floor(Math.min(...xs)))
  const xMax = Math.min(o.width - 1, Math.ceil(Math.max(...xs)))
  const yMin = Math.max(0, Math.floor(Math.min(...ys)))
  const yMax = Math.min(o.height - 1, Math.ceil(Math.max(...ys)))
  if (xMax < xMin || yMax < yMin) return null

  let sum = 0
  let n = 0
  for (let y = yMin; y <= yMax; y++) {
    for (let x = xMin; x <= xMax; x++) {
      // ray cast against the polygon in pixel space
      let inside = false
      for (let i = 0, j = px.length - 1; i < px.length; j = i++) {
        const xi = px[i].x
        const yi = px[i].y
        const xj = px[j].x
        const yj = px[j].y
        if (yi > y + 0.5 !== yj > y + 0.5 && x + 0.5 < ((xj - xi) * (y + 0.5 - yi)) / (yj - yi) + xi) inside = !inside
      }
      if (!inside) continue
      const v = o.values[y * o.width + x]
      if (!Number.isNaN(v)) {
        sum += v
        n++
      }
    }
  }
  return n >= minPixels ? { mean: sum / n, pixels: n } : null
}
