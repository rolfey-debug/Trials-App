/** Block geometry: plots land where the spec says, areas and ids hold, the
 * two-corner recovery round-trips, and WKT/GeoJSON serialise cleanly. */
import { areaM2, blockFromCorners, blockOutline, blockPlots, haversineM, pointInPolygon, polygonGeoJson, polygonWkt, ringFromGeoJson, rotateBlock, type BlockSpec } from '../shared/geometry'

let passed = 0
function check(name: string, cond: boolean) {
  if (!cond) {
    console.error('FAIL', name)
    process.exitCode = 1
  } else {
    passed++
  }
}
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol

// Junee Reefs: 6 rows × 14 positions of 2 m × 12 m, positions axis due east.
const spec: BlockSpec = { origin: { lat: -34.71992, lng: 147.50966 }, bearingDeg: 90, plotW: 2, plotL: 12, rows: 6, positions: 14 }
const plots = blockPlots(spec)
check('84 plots', plots.length === 84)
check('first plot is 101', plots[0].plot === 101 && plots[0].row === 1 && plots[0].position === 1)
check('last plot is 614', plots[plots.length - 1].plot === 614)
const p101 = plots[0]
check('plot 101 starts at origin', near(haversineM(p101.corners[0], spec.origin), 0, 0.01))
check('plot width 2 m', near(haversineM(p101.corners[0], p101.corners[1]), 2, 0.01))
check('plot length 12 m', near(haversineM(p101.corners[1], p101.corners[2]), 12, 0.01))
check('plot area 24 m²', near(areaM2(p101.corners), 24, 0.2))
check('centre inside plot', pointInPolygon(p101.centre, p101.corners))
const p102 = plots[1]
check('plot 102 is 2 m east of 101', near(haversineM(p101.corners[0], p102.corners[0]), 2, 0.01) && p102.corners[0].lng > p101.corners[0].lng)
const p201 = plots.find((p) => p.plot === 201)!
check('row 2 is 12 m south of row 1 (east-facing positions → rows run south)', near(haversineM(p101.corners[0], p201.corners[0]), 12, 0.01) && p201.corners[0].lat < p101.corners[0].lat)

// outline
const outline = blockOutline(spec)
check('outline 28 m × 72 m', near(haversineM(outline[0], outline[1]), 28, 0.02) && near(haversineM(outline[1], outline[2]), 72, 0.05))
check('outline area 2016 m²', near(areaM2(outline), 2016, 5))

// gaps push neighbours apart but keep plot size
const gapped = blockPlots({ ...spec, posGapM: 0.5, rowGapM: 3 })
check('gap: 102 is 2.5 m from 101', near(haversineM(gapped[0].corners[0], gapped[1].corners[0]), 2.5, 0.01))
check('gap: row 2 is 15 m from row 1', near(haversineM(gapped[0].corners[0], gapped.find((p) => p.plot === 201)!.corners[0]), 15, 0.01))
check('gap: plot still 2 m wide', near(haversineM(gapped[0].corners[0], gapped[0].corners[1]), 2, 0.01))

// cells: skips vanish, outs and reserves keep footprint with their kind, numbers become treatments
const withCells = blockPlots(spec, { 101: 7, 102: 'out', 103: 'skip', 104: 'reserve' })
check('skip removed', !withCells.some((p) => p.plot === 103) && withCells.length === 83)
check('treatment carried', withCells.find((p) => p.plot === 101)!.treatment === 7)
check('out kind', withCells.find((p) => p.plot === 102)!.kind === 'out')
check('reserve kind', withCells.find((p) => p.plot === 104)!.kind === 'reserve')

// two-corner recovery round-trips the bearing and width
const B = outline[1]
const rec = blockFromCorners(spec.origin, B, 6, 14, 12)
check('recovered bearing 90', near(rec.bearingDeg, 90, 0.01))
check('recovered plot width 2', near(rec.plotW, 2, 0.001))

// rotation keeps the centre and size
const rot = rotateBlock(spec, 30)
const ro = blockOutline(rot)
const c0 = { lat: outline.reduce((s, p) => s + p.lat, 0) / 4, lng: outline.reduce((s, p) => s + p.lng, 0) / 4 }
const c1 = { lat: ro.reduce((s, p) => s + p.lat, 0) / 4, lng: ro.reduce((s, p) => s + p.lng, 0) / 4 }
check('rotation keeps centre', near(haversineM(c0, c1), 0, 0.02))
check('rotation keeps size', near(haversineM(ro[0], ro[1]), 28, 0.02) && near(areaM2(ro), 2016, 5))
check('rotation sets bearing', near(rot.bearingDeg, 120, 0.001))

// bearing 0 (north) lays rows to the east
const north = blockPlots({ ...spec, bearingDeg: 0 })
check('north-facing: 102 is north of 101', north[1].corners[0].lat > north[0].corners[0].lat)
check('north-facing: row 2 is east of row 1', north.find((p) => p.plot === 201)!.corners[0].lng > north[0].corners[0].lng)

// serialisation
const wkt = polygonWkt(p101.corners)
check('WKT has SRID and closed ring', wkt.startsWith('SRID=4326;POLYGON((') && wkt.split(',').length === 5)
const gj = polygonGeoJson(p101.corners)
const back = ringFromGeoJson(gj)
check('GeoJSON round-trips 4 corners', back.length === 4 && near(back[2].lat, p101.corners[2].lat, 1e-9) && near(back[2].lng, p101.corners[2].lng, 1e-9))

console.log(`geometry: ${passed} checks passed`)
