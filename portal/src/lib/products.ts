/**
 * Product picker data: the full APVMA PubCRIS database (7,841 registered
 * crop-protection products with actives), lazily fetched from
 * public/products.json, searched the way the handoff specifies —
 * substring over product name, company and actives, with the actives
 * match highlighted.
 */
import { activesLabel, type RegisteredProduct } from '../../../shared/products/search'

export interface PickerProduct {
  name: string
  co: string
  cat: 'Fungicide' | 'Herbicide' | 'Insecticide' | 'Other'
  actives: string // display line e.g. "bixafen 75 g/L + prothioconazole 150 g/L"
}

const CAT_MAP: Record<string, PickerProduct['cat']> = {
  FUNGICIDE: 'Fungicide',
  HERBICIDE: 'Herbicide',
  INSECTICIDE: 'Insecticide',
  MITICIDE: 'Insecticide',
}

const title = (s: string) =>
  s.toLowerCase().replace(/(^|[\s(/-])([a-z])/g, (m, a: string, b: string) => a + b.toUpperCase())

let cache: PickerProduct[] | null = null
let inflight: Promise<PickerProduct[]> | null = null

export function loadProducts(): Promise<PickerProduct[]> {
  if (cache) return Promise.resolve(cache)
  if (!inflight) {
    inflight = fetch('./products.json')
      .then((r) => r.json())
      .then((db: { products: RegisteredProduct[] }) => {
        cache = db.products.map((p) => ({
          name: title(p.name),
          co: title(p.company),
          cat: CAT_MAP[p.category] ?? 'Other',
          actives: activesLabel(p),
        }))
        return cache
      })
  }
  return inflight
}

export const CAT_CHIP: Record<PickerProduct['cat'], { bg: string; fg: string; bd: string }> = {
  Fungicide: { bg: '#E3F1EA', fg: '#00623C', bd: '#BCDCCB' },
  Herbicide: { bg: 'oklch(0.93 0.05 85)', fg: 'oklch(0.42 0.08 85)', bd: 'oklch(0.85 0.06 85)' },
  Insecticide: { bg: 'oklch(0.93 0.04 250)', fg: 'oklch(0.42 0.07 250)', bd: 'oklch(0.85 0.05 250)' },
  Other: { bg: '#F0F1F0', fg: '#6B6D6B', bd: '#E0E1E0' },
}

export interface Seg {
  t: string
  fg: string
  fw: number
}

/** Split an actives line into segments with the query match highlighted. */
export function segs(str: string, q: string): Seg[] {
  if (!q) return [{ t: str, fg: '#6B6D6B', fw: 400 }]
  const out: Seg[] = []
  const low = str.toLowerCase()
  let i = 0
  for (;;) {
    const j = low.indexOf(q, i)
    if (j < 0) {
      if (i < str.length) out.push({ t: str.slice(i), fg: '#6B6D6B', fw: 400 })
      break
    }
    if (j > i) out.push({ t: str.slice(i, j), fg: '#6B6D6B', fw: 400 })
    out.push({ t: str.slice(j, j + q.length), fg: '#00623C', fw: 600 })
    i = j + q.length
  }
  return out
}

export function searchPicker(products: PickerProduct[], query: string, limit = 60): PickerProduct[] {
  const q = query.trim().toLowerCase()
  if (!q) return products.slice(0, limit)
  const starts: PickerProduct[] = []
  const rest: PickerProduct[] = []
  for (const p of products) {
    const name = p.name.toLowerCase()
    if (name.startsWith(q)) starts.push(p)
    else if ((name + ' ' + p.co + ' ' + p.actives).toLowerCase().includes(q)) rest.push(p)
    if (starts.length >= limit) break
  }
  return starts.concat(rest).slice(0, limit)
}
