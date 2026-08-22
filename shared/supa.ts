/**
 * Minimal Supabase REST client shared by the field app and portal.
 * Zero dependencies — plain fetch against Auth (GoTrue) and PostgREST.
 * The publishable key is safe to embed: it only grants what RLS allows.
 */

// Sydney (ap-southeast-2) project — the original was created in the wrong
// region and region is fixed at creation; see docs/REGION-MOVE.md.
export const SUPA_URL = 'https://ebhsnggwekhfcpgnyxxs.supabase.co'
export const SUPA_KEY = 'sb_publishable_jqRJrNZiyAqE5wcH23Oo3g_JlQqcFWk'

/** Fixed ids seeded by server/migrations/001_init.sql */
export const ORG_ID = '00000000-0000-0000-0000-000000000001'
export const SITE_IDS = {
  matong: '00000000-0000-0000-0000-000000000011',
  ganmain: '00000000-0000-0000-0000-000000000012',
  ringwood: '00000000-0000-0000-0000-000000000013',
}
export const TRIAL_IDS = {
  matong: '00000000-0000-0000-0000-000000000101',
  ganmain: '00000000-0000-0000-0000-000000000102',
  ringwood: '00000000-0000-0000-0000-000000000103',
}

export interface Session {
  access_token: string
  refresh_token: string
  expires_at: number // epoch seconds
  email: string
}

export type AuthResult =
  | { mode: 'online'; session: Session }
  | { mode: 'confirm-email' } // account created, confirmation pending
  | { mode: 'bad-credentials' } // account exists, wrong password
  | { mode: 'unreachable' } // offline / project down — fall back to demo

const headers = (token?: string) => ({
  apikey: SUPA_KEY,
  Authorization: `Bearer ${token ?? SUPA_KEY}`,
  'Content-Type': 'application/json',
})

const toSession = (d: any, email: string): Session => ({
  access_token: d.access_token,
  refresh_token: d.refresh_token,
  expires_at: Math.floor(Date.now() / 1000) + (d.expires_in ?? 3600) - 60,
  email,
})

/** Sign in; on unknown credentials, try to self-provision (single-org tool). */
export async function signInOrUp(email: string, password: string): Promise<AuthResult> {
  try {
    const r = await fetch(`${SUPA_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ email, password }),
    })
    if (r.ok) return { mode: 'online', session: toSession(await r.json(), email) }
    const err = await r.json().catch(() => ({}))
    const code = err.error_code ?? err.code ?? ''
    if (code === 'email_not_confirmed') return { mode: 'confirm-email' }
    if (r.status === 400 || r.status === 403) {
      // Unknown user or wrong password — attempt signup; existing users get rejected.
      const s = await fetch(`${SUPA_URL}/auth/v1/signup`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ email, password }),
      })
      if (s.ok) {
        const d = await s.json()
        if (d.access_token) return { mode: 'online', session: toSession(d, email) }
        return { mode: 'confirm-email' }
      }
      return { mode: 'bad-credentials' }
    }
    return { mode: 'unreachable' }
  } catch {
    return { mode: 'unreachable' }
  }
}

export async function refresh(session: Session): Promise<Session | null> {
  try {
    const r = await fetch(`${SUPA_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    })
    if (!r.ok) return null
    return toSession(await r.json(), session.email)
  } catch {
    return null
  }
}

/** Insert rows; upsert=true resolves conflicts on the primary key (last write wins). */
export async function insert(table: string, rows: unknown[], token: string, opts: { upsert?: boolean } = {}): Promise<boolean> {
  if (!rows.length) return true
  const r = await fetch(`${SUPA_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      ...headers(token),
      Prefer: opts.upsert ? 'resolution=merge-duplicates,return=minimal' : 'return=minimal',
    },
    body: JSON.stringify(rows),
  })
  return r.ok
}

export async function select<T = unknown>(table: string, query: string, token?: string): Promise<T[] | null> {
  try {
    const r = await fetch(`${SUPA_URL}/rest/v1/${table}?${query}`, { headers: headers(token) })
    if (!r.ok) return null
    return (await r.json()) as T[]
  } catch {
    return null
  }
}

export type BackendState = 'connected' | 'migration-pending' | 'unreachable'

/** Is the project reachable, and has the migration been applied? */
export async function backendState(): Promise<BackendState> {
  try {
    const r = await fetch(`${SUPA_URL}/rest/v1/products?select=pcode&limit=1`, { headers: headers() })
    if (r.ok) return 'connected'
    const err = await r.json().catch(() => ({}))
    if (err.code === 'PGRST205') return 'migration-pending'
    return 'migration-pending'
  } catch {
    return 'unreachable'
  }
}

/** Deterministic UUID from parts — idempotent client-side row ids for sync. */
export function stableId(...parts: Array<string | number>): string {
  const s = parts.join('|')
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = (Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)) >>> 0
  h2 = (Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)) >>> 0
  const hex = (n: number) => n.toString(16).padStart(8, '0')
  const a = hex(h1)
  const b = hex(h2)
  const c = hex(Math.imul(h1, 31) >>> 0)
  const d = hex(Math.imul(h2, 31) >>> 0)
  // 8-4-4-4-12, RFC-4122 shaped (version 4 / variant 8 nibbles fixed)
  return `${a}-${b.slice(0, 4)}-4${b.slice(4, 7)}-8${c.slice(0, 3)}-${c.slice(3)}${d.slice(0, 7)}`
}
