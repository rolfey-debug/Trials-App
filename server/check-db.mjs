#!/usr/bin/env node
/** Report the Supabase project's state: reachability, migration, seed rows. */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Single source of truth for the project URL/key is shared/supa.ts — read the
// constants out of it so a project swap is a one-file edit. Env overrides let
// you probe a new project before committing to it:
//   SUPA_URL=... SUPA_KEY=... node server/check-db.mjs
const supaTs = readFileSync(fileURLToPath(import.meta.resolve('../shared/supa.ts')), 'utf8')
const constant = (name) => supaTs.match(new RegExp(`${name} = '([^']+)'`))?.[1]
const BASE = process.env.SUPA_URL ?? constant('SUPA_URL')
const KEY = process.env.SUPA_KEY ?? constant('SUPA_KEY')
if (!BASE || !KEY) throw new Error('could not resolve SUPA_URL / SUPA_KEY')
console.log(`project: ${BASE}${process.env.SUPA_URL ? ' (env override)' : ''}`)
const h = { apikey: KEY, Authorization: `Bearer ${KEY}` }

const get = async (path) => {
  const r = await fetch(`${BASE}${path}`, { headers: h })
  return { status: r.status, body: await r.json().catch(() => null) }
}

const health = await get('/auth/v1/health')
console.log(`auth health: ${health.status === 200 ? 'ok' : health.status}`)

const orgs = await get('/rest/v1/orgs?select=id,name')
if (orgs.body?.code === 'PGRST205') {
  console.log('migration: NOT APPLIED — paste server/migrations/001_init.sql into the SQL editor')
  process.exit(1)
}
console.log(`migration: applied`)
// RLS hides org rows from anon — count via the public products table + seeded trials via a HEAD probe
for (const t of ['orgs', 'sites', 'trials', 'scores', 'sync_log']) {
  const r = await fetch(`${BASE}/rest/v1/${t}?select=*`, { headers: { ...h, Prefer: 'count=exact', Range: '0-0' } })
  const count = r.headers.get('content-range')?.split('/')[1] ?? '?'
  console.log(`${t}: ${r.ok ? `visible-to-anon count ${count}` : `RLS-protected (${r.status})`}`)
}
const settings = await get('/auth/v1/settings')
console.log(`email signup: ${settings.body?.external?.email ? 'on' : 'off'} · autoconfirm: ${settings.body?.mailer_autoconfirm}`)
