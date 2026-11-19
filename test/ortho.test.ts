/** Drone ortho ingestion: a synthetic UTM GeoTIFF with a known NDVI gradient
 * parses, reprojects and samples correctly. */
import { writeArrayBuffer } from 'geotiff'
import proj4 from 'proj4'
import { parseOrtho, sampleMean } from '../portal/src/lib/ortho'

let passed = 0
function check(name: string, cond: boolean) {
  if (!cond) {
    console.error('FAIL', name)
    process.exitCode = 1
  } else {
    passed++
  }
}

// 200×100 raster in EPSG:32755 (WGS84 UTM 55S) near Corowa: 1 m pixels,
// NDVI 0.2 on the west half, 0.8 on the east half.
const W = 200
const H = 100
const utm = '+proj=utm +zone=55 +south +datum=WGS84 +units=m +no_defs'
const [ox, oy] = proj4('EPSG:4326', utm).forward([146.39, -35.99])
const values = new Float32Array(W * H)
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) values[y * W + x] = x < W / 2 ? 0.2 : 0.8

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- writer takes typed arrays, its types say number[]
const buf = (await writeArrayBuffer(values as any, {
  width: W,
  height: H,
  BitsPerSample: [32],
  SampleFormat: [3], // IEEE float — the writer's default is uint8
  ModelTiepoint: [0, 0, 0, ox, oy + H, 0], // NW corner, 1 m pixels
  ModelPixelScale: [1, 1, 0],
  ProjectedCSTypeGeoKey: 32755,
} as never)) as ArrayBuffer

const o = await parseOrtho(buf)
check('dimensions kept', o.width === W && o.height === H)
check('value range', Math.abs(o.min - 0.2) < 1e-6 && Math.abs(o.max - 0.8) < 1e-6)

// NW corner lat/lng maps back to pixel (0, 0); SE to (W, H)
const nw = o.toPixel(o.bounds[1][0], o.bounds[0][1])
const se = o.toPixel(o.bounds[0][0], o.bounds[1][1])
check('NW corner → (0,0)', Math.hypot(nw.x, nw.y) < 1.5)
check('SE corner → (W,H)', Math.hypot(se.x - W, se.y - H) < 1.5)

// polygon in lat/lng over a patch of the west half → mean 0.2
const toLL = proj4(utm, 'EPSG:4326')
const llPoly = (x0: number, y0: number, x1: number, y1: number): Array<[number, number]> =>
  (
    [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
    ] as Array<[number, number]>
  ).map(([px, py]) => {
    const [lng, lat] = toLL.forward([ox + px, oy + H - py])
    return [lat, lng] as [number, number]
  })
const west = sampleMean(o, llPoly(10, 10, 60, 60))!
check('west patch samples', !!west && west.pixels > 2000)
check('west patch mean 0.2', Math.abs(west.mean - 0.2) < 0.01)
const east = sampleMean(o, llPoly(140, 10, 190, 60))!
check('east patch mean 0.8', Math.abs(east.mean - 0.8) < 0.01)

// straddling patch averages the halves
const mid = sampleMean(o, llPoly(75, 10, 125, 60))!
check('straddle mean 0.5', Math.abs(mid.mean - 0.5) < 0.02)

// polygon fully off the raster → null
check('off-raster → null', sampleMean(o, llPoly(-300, -300, -250, -250)) === null)

console.log(`${passed} ortho checks passed`)
