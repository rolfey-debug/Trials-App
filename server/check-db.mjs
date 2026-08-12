#!/usr/bin/env node
/** Report the Supabase project's state: reachability, migration, seed rows. */
const URL = 'https://lwudweiuihcdksageaxs.supabase.co'
const KEY = 'sb_publishable_bE8diDIr1jSVGxUZlRZuog_Tx-Ddct5'
const h = { apikey: KEY, Authorization: `Bearer ${KEY}` }

const get = async (path) => {
  const r = await fetch(`${URL}${path}`, { headers: h })
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
  const r = await fetch(`${URL}/rest/v1/${t}?select=*`, { headers: { ...h, Prefer: 'count=exact', Range: '0-0' } })
  const count = r.headers.get('content-range')?.split('/')[1] ?? '?'
  console.log(`${t}: ${r.ok ? `visible-to-anon count ${count}` : `RLS-protected (${r.status})`}`)
}
const settings = await get('/auth/v1/settings')
console.log(`email signup: ${settings.body?.external?.email ? 'on' : 'off'} · autoconfirm: ${settings.body?.mailer_autoconfirm}`)
