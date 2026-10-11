/** Yield map CSV parsing: column detection, unit conversion, cleaning. */
import { buPerAcreToTHa, parseYieldCsv } from '../portal/src/lib/yieldImport'

let passed = 0
function check(name: string, cond: boolean) {
  if (!cond) {
    console.error('FAIL', name)
    process.exitCode = 1
  } else {
    passed++
  }
}
const near = (a: number, b: number, tol = 0.01) => Math.abs(a - b) <= tol

// A John Deere style export in t/ha with a moisture column and a few bad rows.
const rows = ['Longitude,Latitude,Time,Yield (t/ha),Moisture (%),Speed (km/h)']
for (let i = 0; i < 200; i++) rows.push(`${(147.5 + i * 0.00001).toFixed(6)},${(-34.72 - (i % 10) * 0.00001).toFixed(6)},2026-12-01T03:${String(i % 60).padStart(2, '0')}:00Z,${(3.2 + Math.sin(i) * 0.3).toFixed(3)},${(11 + (i % 3) * 0.2).toFixed(1)},6.5`)
rows.push('147.51,-34.72,2026-12-01T04:00:00Z,0,11,6.5') // zero
rows.push('0,0,2026-12-01T04:01:00Z,3.1,11,6.5') // no position
rows.push('147.51,-34.72,2026-12-01T04:02:00Z,29.0,11,6.5') // spike
rows.push('147.51,-34.72,2026-12-01T04:03:00Z,abc,11,6.5') // no yield
const p = parseYieldCsv(rows.join('\n'), 'Wheat')
check('columns found', p.columns.lat === 'Latitude' && p.columns.lng === 'Longitude' && p.columns.yield === 'Yield (t/ha)' && p.columns.moisture === 'Moisture (%)' && p.columns.time === 'Time')
check('unit t/ha, no factor', p.unit === 't/ha' && p.factor === 1)
check('200 good points kept', p.points.length === 200)
check('bad rows dropped by reason', p.dropped['zero yield'] === 1 && p.dropped['no position'] === 1 && p.dropped['outlier'] === 1 && p.dropped['no yield'] === 1)
check('median near 3.2', near(p.median, 3.2, 0.15))
check('moisture and time carried', p.points[0].moisturePct === 11 && p.points[0].recordedAt === '2026-12-01T03:00:00Z')
check('lat/lng as numbers', near(p.points[0].lat, -34.72, 1e-6) && near(p.points[0].lng, 147.5, 1e-6))

// Bushels per acre, semicolon separated, Lat/Long names.
const bu = ['Lat;Long;Dry Yield (bu/ac)', '-34.7;147.5;60', '-34.7001;147.5001;62', '-34.7002;147.5002;58'].join('\n')
const b = parseYieldCsv(bu, 'wheat')
check('bu/ac detected with the wheat bushel weight', b.unit === 'bu/ac' && near(b.factor, 0.0673, 0.0005))
check('60 bu/ac ≈ 4.04 t/ha', near(b.points[0].yieldTHa, 4.04, 0.01))
check('canola bushel is lighter', buPerAcreToTHa('Canola') < buPerAcreToTHa('Wheat'))
check('unknown crop falls back to wheat', near(buPerAcreToTHa('Lucerne'), buPerAcreToTHa('wheat'), 1e-9))

// kg/ha and X/Y columns, quoted header.
const kg = ['"X","Y","YIELD_KGHA"', '147.5,-34.7,3200', '147.5001,-34.7001,3300'].join('\n')
const k = parseYieldCsv(kg)
check('kg/ha → t/ha', k.unit === 'kg/ha' && near(k.points[0].yieldTHa, 3.2))
check('X/Y mapped to lng/lat', near(k.points[0].lng, 147.5) && near(k.points[0].lat, -34.7))

let threw = false
try {
  parseYieldCsv('a,b,c\n1,2,3')
} catch {
  threw = true
}
check('missing columns throw', threw)

console.log(`yieldImport: ${passed} checks passed`)
