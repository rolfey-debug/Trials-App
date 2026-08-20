#!/usr/bin/env node
/**
 * Build the crop-protection product database from APVMA PubCRIS
 * (data.gov.au, CC-BY 3.0 AU, updated weekly by the APVMA).
 *
 * Usage:
 *   node shared/products/build-products.mjs            # download fresh CSVs
 *   node shared/products/build-products.mjs <dir>      # use CSVs already in <dir>
 *
 * Writes shared/products/products.json — the seed for the portal's product
 * search and, later, the products table in Postgres.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = join(dirname(fileURLToPath(import.meta.url)), 'products.json')

const DATASET = '0de37904-43e0-4814-b21b-5b64fafefe6f'
const RESOURCES = {
  'product.csv': 'b4bb5394-b60b-4602-8bde-2e206ffc498f',
  'constit.csv': 'de913672-c51a-483a-b467-f2f9df51f671',
  'prodcon.csv': 'eb08d8fc-bb61-4191-9a4b-a20ee44dac1f',
}

// hlevel1 categories relevant to field-trial work; everything else
// (pool chemicals, dairy cleansers, household...) is dropped.
const CATEGORIES = new Set([
  'HERBICIDE',
  'INSECTICIDE',
  'FUNGICIDE',
  'MIXED FUNCTION PESTICIDE',
  'ADJUVANT',
  'WETTING AGENT',
  'SURFACTANT',
  'PLANT REGULATOR',
  'GROWTH REGULATOR',
  'MITICIDE',
  'MOLLUSCICIDE',
  'NEMATICIDE',
  'MIXED FUNCTION SEED TREAT',
  'FUMIGANT',
  'BACTERICIDE',
  'MARKER',
])

/** Minimal RFC-4180 CSV parser (PubCRIS files quote with embedded commas/newlines). */
function parseCsv(text) {
  const rows = []
  let row = [], field = '', inQ = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else inQ = false
      } else field += c
    } else if (c === '"') inQ = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = '' }
    else field += c
  }
  if (field || row.length) { row.push(field.replace(/\r$/, '')); rows.push(row) }
  const header = rows.shift()
  return rows.filter((r) => r.length === header.length).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])))
}

async function load(name, localDir) {
  if (localDir) {
    const p = join(localDir, name)
    if (existsSync(p)) return parseCsv(readFileSync(p, 'utf8'))
  }
  const url = `https://data.gov.au/data/dataset/${DATASET}/resource/${RESOURCES[name]}/download/${name}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`)
  return parseCsv(await res.text())
}

const localDir = process.argv[2]
const [products, constituents, prodcon] = await Promise.all(
  ['product.csv', 'constit.csv', 'prodcon.csv'].map((n) => load(n, localDir)),
)

const constByCode = new Map(constituents.map((c) => [c.ccode.trim(), c.cname.trim()]))
const activesByProduct = new Map()
for (const pc of prodcon) {
  if (pc.ctype.trim() !== 'A') continue // active constituents only
  const pcode = pc.pcode.trim()
  const name = constByCode.get(pc.ccode.trim())
  if (!name) continue
  const amount = parseFloat(pc.camount)
  const entry = { name, ...(Number.isFinite(amount) && amount > 0 ? { amount, unit: pc.cucode.trim() } : {}) }
  if (!activesByProduct.has(pcode)) activesByProduct.set(pcode, [])
  activesByProduct.get(pcode).push(entry)
}

const title = (s) =>
  s.trim().replace(/\s+/g, ' ').toLowerCase().replace(/(^|[\s(/-])([a-z])/g, (m, a, b) => a + b.toUpperCase())

const out = []
for (const p of products) {
  if (!p.typedesc.startsWith('A')) continue // agricultural only
  if (p.regcode.trim() !== 'R') continue // currently registered
  const category = p.hlevel1.trim()
  if (!CATEGORIES.has(category)) continue
  out.push({
    pcode: Number(p.pcode),
    name: title(p.fpname),
    company: title(p.sname),
    category,
    formulation: p.fdesc.trim() || undefined,
    schedule: p.psched.trim() || undefined,
    actives: activesByProduct.get(p.pcode.trim()) ?? [],
  })
}
out.sort((a, b) => a.name.localeCompare(b.name))

writeFileSync(
  OUT,
  JSON.stringify(
    {
      source: 'APVMA PubCRIS via data.gov.au (CC-BY 3.0 AU) — registered agricultural products',
      generated: new Date().toISOString().slice(0, 10),
      count: out.length,
      products: out,
    },
    null,
    0,
  ),
)
console.log(`wrote ${OUT}: ${out.length} products`)
