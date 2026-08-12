#!/usr/bin/env node
/**
 * Build per-site weather fixtures from SILO DataDrill (Qld Long Paddock —
 * free gridded daily climate for any Australian coordinate).
 *
 *   node shared/phenology/fetch-weather.mjs            # download fresh
 *   node shared/phenology/fetch-weather.mjs <dir>      # use CSVs in <dir>
 *                                                        (silo-<site>-2026.csv / -hist.csv)
 *
 * Output per site: shared/phenology/weather/<site>.json
 *   { site, lat, lon, updated, actuals: [[iso, minT, maxT], ...],
 *     normals: [[doy, minT, maxT], ...] }   // 10-year day-of-year means
 * Copies are written to portal/public/weather/ for the portal to fetch.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const SITES = [
  { site: 'matong', lat: -34.768, lon: 146.929 },
  { site: 'ganmain', lat: -34.792, lon: 147.041 },
]
const SEASON = { start: '20260401', finish: '20261231' }
const HIST = { start: '20160101', finish: '20251231' }

const localDir = process.argv[2]

function parseSilo(csv) {
  const rows = []
  for (const line of csv.split('\n').slice(1)) {
    const parts = line.split(',')
    if (parts.length < 9) continue
    const date = parts[2].trim()
    const maxT = parseFloat(parts[5])
    const minT = parseFloat(parts[7])
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(maxT) || !Number.isFinite(minT)) continue
    rows.push({ date, minT, maxT })
  }
  return rows
}

async function load(site, lat, lon, kind) {
  const local = localDir && join(localDir, `silo-${site}-${kind === 'season' ? '2026' : 'hist'}.csv`)
  if (local && existsSync(local)) return parseSilo(readFileSync(local, 'utf8'))
  const r = kind === 'season' ? SEASON : HIST
  const url =
    `https://www.longpaddock.qld.gov.au/cgi-bin/silo/DataDrillDataset.php` +
    `?lat=${lat}&lon=${lon}&start=${r.start}&finish=${r.finish}&format=csv&comment=RXN` +
    `&username=apirequest@agnvet.example&password=apirequest`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`SILO ${site} ${kind}: HTTP ${res.status}`)
  return parseSilo(await res.text())
}

const doy = (iso) => {
  const d = new Date(iso + 'T00:00:00Z')
  return Math.floor((d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 0)) / 86400000)
}

mkdirSync(join(HERE, 'weather'), { recursive: true })
for (const { site, lat, lon } of SITES) {
  const [season, hist] = await Promise.all([load(site, lat, lon, 'season'), load(site, lat, lon, 'hist')])
  const sums = new Map() // doy -> {min, max, n}
  for (const r of hist) {
    const k = doy(r.date)
    const s = sums.get(k) ?? { min: 0, max: 0, n: 0 }
    s.min += r.minT
    s.max += r.maxT
    s.n++
    sums.set(k, s)
  }
  const normals = [...sums.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([k, s]) => [k, +(s.min / s.n).toFixed(1), +(s.max / s.n).toFixed(1)])
  const out = {
    site,
    lat,
    lon,
    source: 'SILO DataDrill (longpaddock.qld.gov.au) — BoM gridded daily climate',
    updated: season.at(-1)?.date ?? null,
    actuals: season.map((r) => [r.date, r.minT, r.maxT]),
    normals,
  }
  const file = join(HERE, 'weather', `${site}.json`)
  writeFileSync(file, JSON.stringify(out))
  const pub = join(HERE, '../../portal/public/weather')
  mkdirSync(pub, { recursive: true })
  copyFileSync(file, join(pub, `${site}.json`))
  console.log(`${site}: ${season.length} season days (to ${out.updated}), ${normals.length} normal days`)
}
