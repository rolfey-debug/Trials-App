/**
 * Product search over the APVMA-derived database (products.json) plus
 * org-defined experimental products. Pure functions — the portal calls
 * these against an in-memory index; the same ranking later moves into
 * Postgres full-text search unchanged.
 */

export interface Active {
  name: string
  amount?: number
  unit?: string
}

export interface RegisteredProduct {
  pcode: number
  name: string
  company: string
  category: string
  formulation?: string
  schedule?: string
  actives: Active[]
}

/** An unregistered/coded product entered by the org (numbered compound, experimental mix). */
export interface ExperimentalProduct {
  id: string
  name: string
  company?: string
  category?: string
  actives: Active[] // may be empty or partial — "actives where possible"
  notes?: string
  createdBy?: string
  createdAt?: string
}

export type AnyProduct =
  | (RegisteredProduct & { kind: 'registered' })
  | (ExperimentalProduct & { kind: 'experimental' })

export interface SearchOptions {
  category?: string
  limit?: number
}

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9 ]+/g, ' ')

/**
 * Rank: product-name prefix > product-name word > active-ingredient match
 * > company match. Experimental products rank alongside registered ones.
 */
export function searchProducts(
  query: string,
  registered: RegisteredProduct[],
  experimental: ExperimentalProduct[] = [],
  opts: SearchOptions = {},
): AnyProduct[] {
  const q = norm(query).trim()
  const limit = opts.limit ?? 25
  const all: AnyProduct[] = [
    ...experimental.map((p) => ({ ...p, kind: 'experimental' as const })),
    ...registered.map((p) => ({ ...p, kind: 'registered' as const })),
  ]
  const filtered = opts.category ? all.filter((p) => p.category === opts.category) : all
  if (!q) return filtered.slice(0, limit)

  const scored: Array<[number, AnyProduct]> = []
  for (const p of filtered) {
    const name = norm(p.name)
    const words = name.split(/\s+/)
    let score = 0
    if (name.startsWith(q)) score = 100
    else if (words.some((w) => w.startsWith(q))) score = 80
    else if (name.includes(q)) score = 60
    else if (p.actives.some((a) => norm(a.name).includes(q))) score = 40
    else if (p.company && norm(p.company).includes(q)) score = 20
    if (score > 0) {
      if (p.kind === 'experimental') score += 5 // org's own products float up on ties
      scored.push([score - name.length / 200, p])
    }
  }
  scored.sort((a, b) => b[0] - a[0])
  return scored.slice(0, limit).map(([, p]) => p)
}

/** All products containing a given active (for "what else has prothioconazole?"). */
export function byActive(active: string, registered: RegisteredProduct[]): RegisteredProduct[] {
  const q = norm(active)
  return registered.filter((p) => p.actives.some((a) => norm(a.name).includes(q)))
}

/** One-line label like "bixafen 75 g/L + prothioconazole 150 g/L". */
export function activesLabel(p: { actives: Active[] }): string {
  if (!p.actives.length) return 'actives not listed'
  return p.actives
    .map((a) => `${a.name.toLowerCase()}${a.amount ? ` ${a.amount} ${a.unit ?? ''}`.trimEnd() : ''}`)
    .join(' + ')
}
