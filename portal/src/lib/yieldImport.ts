/** Yield map CSV parsing and cleaning for paddock-scale strips. Pure: the
 * portal reads the file, this turns it into points in t/ha with the rows
 * it dropped and why, and the database assigns points to strips. Tested
 * in test/yieldImport.test.ts. */

export interface YieldPoint {
  lat: number
  lng: number
  yieldTHa: number
  moisturePct: number | null
  recordedAt: string | null
}

export interface YieldParse {
  points: YieldPoint[]
  columns: { lat: string; lng: string; yield: string; moisture: string | null; time: string | null }
  unit: string
  factor: number
  rows: number
  dropped: Record<string, number>
  median: number
  note: string
}

const LB_PER_BU: Record<string, number> = { wheat: 60, barley: 48, canola: 50, oats: 32, lupin: 60, sorghum: 56, corn: 56, maize: 56, chickpea: 60, lentil: 60, faba: 60, pea: 60 }
const KG_PER_LB = 0.45359237
const M2_PER_ACRE = 4046.8564224

/** bu/ac → t/ha for a crop (bushel weight by crop; wheat when unknown). */
export function buPerAcreToTHa(crop: string | null | undefined): number {
  const key = Object.keys(LB_PER_BU).find((k) => (crop ?? '').toLowerCase().includes(k)) ?? 'wheat'
  return (LB_PER_BU[key] * KG_PER_LB) / 1000 / (M2_PER_ACRE / 10000)
}

function splitCsvLine(line: string, sep: string): string[] {
  const out: string[] = []
  let cur = ''
  let q = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      if (q && line[i + 1] === '"') {
        cur += '"'
        i++
      } else q = !q
    } else if (c === sep && !q) {
      out.push(cur)
      cur = ''
    } else cur += c
  }
  out.push(cur)
  return out.map((s) => s.trim())
}

const find = (cols: string[], tests: RegExp[]): string | null => {
  for (const t of tests) {
    const hit = cols.find((c) => t.test(c))
    if (hit) return hit
  }
  return null
}

/** Parse a header's CSV export. Column names vary by brand; the usual
 * ones are recognised (Latitude/Longitude, Lat/Long, X/Y, Yield, Wet Mass,
 * Moisture, Time). Yield unit is read from the column name when it says so. */
export function parseYieldCsv(text: string, crop?: string | null): YieldParse {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) throw new Error('The file has no data rows.')
  const sep = (lines[0].match(/;/g) ?? []).length > (lines[0].match(/,/g) ?? []).length ? ';' : lines[0].includes('\t') && !lines[0].includes(',') ? '\t' : ','
  const header = splitCsvLine(lines[0], sep)
  const low = header.map((h) => h.toLowerCase())
  const latCol = find(low, [/^lat(itude)?$/, /\blat(itude)?\b/, /^y$/, /^northing$/])
  const lngCol = find(low, [/^lon(g|gitude)?$/, /\blon(g|gitude)?\b/, /^x$/, /^easting$/])
  const yieldCol = find(low, [/dry.*yield|yield.*dry/, /^yield/, /\byield\b/, /yld/, /dry.?mass|dry.?weight/, /wet.?mass|crop.?flow/])
  const moistCol = find(low, [/moist/])
  const timeCol = find(low, [/^time|timestamp|date.?time|gps.?time|^date$/])
  if (!latCol || !lngCol || !yieldCol) throw new Error(`Could not find latitude, longitude and yield columns. Columns seen: ${header.join(', ')}`)
  const yi = low.indexOf(yieldCol)
  const li = low.indexOf(latCol)
  const gi = low.indexOf(lngCol)
  const mi = moistCol ? low.indexOf(moistCol) : -1
  const ti = timeCol ? low.indexOf(timeCol) : -1
  const yname = header[yi]
  let factor = 1
  let unit = 't/ha'
  if (/bu/i.test(yname)) {
    factor = buPerAcreToTHa(crop)
    unit = 'bu/ac'
  } else if (/kg\s*\/?\s*ha/i.test(yname)) {
    factor = 0.001
    unit = 'kg/ha'
  } else if (/lb/i.test(yname) && /ac/i.test(yname)) {
    factor = KG_PER_LB / 1000 / (M2_PER_ACRE / 10000)
    unit = 'lb/ac'
  }
  const dropped: Record<string, number> = {}
  const drop = (k: string) => (dropped[k] = (dropped[k] ?? 0) + 1)
  const raw: YieldPoint[] = []
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i], sep)
    const lat = Number(cells[li])
    const lng = Number(cells[gi])
    const y = Number(cells[yi]) * factor
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) {
      drop('no position')
      continue
    }
    if (!Number.isFinite(y)) {
      drop('no yield')
      continue
    }
    if (y <= 0) {
      drop('zero yield')
      continue
    }
    const m = mi >= 0 ? Number(cells[mi]) : NaN
    raw.push({ lat, lng, yieldTHa: y, moisturePct: Number.isFinite(m) ? m : null, recordedAt: ti >= 0 && cells[ti] ? cells[ti] : null })
  }
  // Outliers: beyond 3 × the median absolute deviation, or above 3 × median
  // (a header turning or a logger spike), are dropped as yield monitors do.
  const ys = raw.map((p) => p.yieldTHa).sort((a, b) => a - b)
  const median = ys.length ? ys[Math.floor(ys.length / 2)] : 0
  const mad = ys.length ? [...ys.map((v) => Math.abs(v - median))].sort((a, b) => a - b)[Math.floor(ys.length / 2)] : 0
  const lo = median - 3 * 1.4826 * mad
  const hi = Math.min(median + 3 * 1.4826 * mad, median * 3)
  const points = raw.filter((p) => {
    if (p.yieldTHa < lo || p.yieldTHa > hi) {
      drop('outlier')
      return false
    }
    return true
  })
  const note = `${header.length} columns · yield from "${yname}" (${unit}${factor !== 1 ? ` × ${factor.toFixed(4)}` : ''}) · position from "${header[li]}", "${header[gi]}"${moistCol ? ` · moisture from "${header[mi]}"` : ''}`
  return { points, columns: { lat: header[li], lng: header[gi], yield: yname, moisture: moistCol ? header[mi] : null, time: timeCol ? header[ti] : null }, unit, factor, rows: lines.length - 1, dropped, median, note }
}
