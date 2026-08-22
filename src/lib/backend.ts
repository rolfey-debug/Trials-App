/**
 * Field-app backend bridge: real Supabase auth + sync push, always falling
 * back to the offline demo path — the app's offline-first promise is that
 * nothing here ever blocks field work.
 */
import { insert, refresh, signInOrUp, stableId, ORG_ID, TRIAL_IDS, type AuthResult, type Session } from '../../shared/supa'
import type { AppState, TrialState } from '../store/types'

const KEY = 'tw.supaSession'

export function savedSession(): Session | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Session) : null
  } catch {
    return null
  }
}

function persist(s: Session | null) {
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s))
    else localStorage.removeItem(KEY)
  } catch {
    /* private mode */
  }
}

export async function login(email: string, password: string): Promise<AuthResult> {
  const res = await signInOrUp(email, password)
  if (res.mode === 'online') persist(res.session)
  return res
}

export function logout() {
  persist(null)
}

/** Valid access token, refreshing when close to expiry; null = not signed in online. */
export async function activeToken(): Promise<string | null> {
  let s = savedSession()
  if (!s) return null
  if (s.expires_at * 1000 < Date.now()) {
    const next = await refresh(s)
    if (!next) return null
    persist(next)
    s = next
  }
  return s.access_token
}

/** Map a local trial id to its seeded backend uuid (locally-added trials stay
 * local). Staged rollout: only Matong syncs for now — the Sydney project keeps
 * just the Matong rows, and pushing an unmapped trial would fail its foreign
 * keys and mark the whole sync red. Re-add lines here as trials go live. */
function trialUuid(localId: string): string | null {
  const k = localId.toLowerCase()
  if (k.includes('matong')) return TRIAL_IDS.matong
  return null
}

/**
 * Push field data for every syncable trial to Supabase. Idempotent: row ids
 * are deterministic, upserts are last-write-wins — safe to call after every
 * change or after days offline. Best-effort by design.
 */
export async function pushToBackend(st: AppState): Promise<boolean> {
  const token = await activeToken()
  if (!token) return false
  const results: boolean[] = []
  const summary: Record<string, { scores: number; corrections: number; photos: number; spray: number }> = {}
  for (const localId of Object.keys(st.trials)) {
    const trial_id = trialUuid(localId)
    const ts = st.trialState[localId]
    if (!trial_id || !ts) continue
    const counts = await pushTrial(trial_id, ts, token)
    if (!counts) {
      results.push(false)
      continue
    }
    results.push(true)
    if (counts.scores + counts.corrections + counts.photos + counts.spray > 0) summary[localId] = counts
  }
  if (!results.length) return false
  await insert(
    'sync_log',
    [
      {
        org_id: ORG_ID,
        device: navigator.userAgent.slice(0, 120),
        items: st.syncQueue.filter((q) => !q.synced).length,
        payload: summary,
      },
    ],
    token,
  )
  return results.every(Boolean)
}

async function pushTrial(
  trial_id: string,
  ts: TrialState,
  token: string,
): Promise<{ scores: number; corrections: number; photos: number; spray: number } | null> {
  const assessment = ts.assessIdx + 1
  const scoreRows: unknown[] = []
  for (const [pid, sc] of Object.entries(ts.scores)) {
    for (const [measure, value] of Object.entries(sc.v)) {
      scoreRows.push({
        id: stableId(trial_id, assessment, pid, measure),
        trial_id,
        assessment,
        plot: Number(pid),
        measure,
        value,
        note: sc.note ?? null,
        recorded_at: new Date(sc.ts).toISOString(),
      })
    }
  }

  const correctionRows: unknown[] = [
    ...Object.entries(ts.relabel).map(([pid, t]) => ({
      id: stableId(trial_id, 'relabel', pid),
      trial_id,
      plot: Number(pid),
      kind: 'relabel',
      effective_t: t,
      made_at: new Date().toISOString(),
    })),
    ...ts.excluded.map((pid) => ({
      id: stableId(trial_id, 'exclude', pid),
      trial_id,
      plot: pid,
      kind: 'exclude',
      made_at: new Date().toISOString(),
    })),
  ]

  const photoRows = ts.photos.map((p) => ({
    id: stableId(trial_id, 'photo', p.id),
    trial_id,
    plot: p.pid,
    // Org-partitioned path: migration 004 scopes the bucket policy on the
    // first segment, so blobs can only ever be read within their own org.
    storage_path: `${ORG_ID}/${trial_id}/${p.id}.jpg`,
    taken_at: new Date().toISOString(),
    meta: { flagged: p.flagged, trt: p.trt, sizeKB: p.sizeKB ?? null, label: p.date },
  }))

  // Spray-day record: one operations row per timing, upserted on every push —
  // mix/spray ticks and the conditions record all live in it, so the office
  // sees spray progress the moment the phone syncs.
  const operationRows: unknown[] = []
  if (Object.keys(ts.mixDone).length || Object.keys(ts.sprDone).length || Object.keys(ts.conditions).length) {
    operationRows.push({
      id: stableId(trial_id, 'op', 'spray', 'A'),
      trial_id,
      kind: 'spray',
      timing: 'A',
      detail: {
        mixed: Object.keys(ts.mixDone).map(Number).sort((a, b) => a - b),
        sprayed: Object.keys(ts.sprDone).map(Number).sort((a, b) => a - b),
        mixLog: ts.mixDone,
        sprayLog: ts.sprDone,
      },
      performed_at: new Date().toISOString(),
      conditions: ts.conditions,
    })
  }

  const ok = await Promise.all([
    insert('scores', scoreRows, token, { upsert: true }),
    insert('corrections', correctionRows, token, { upsert: true }),
    insert('photos', photoRows, token, { upsert: true }),
    insert('operations', operationRows, token, { upsert: true }),
  ])
  if (!ok.every(Boolean)) return null
  return { scores: scoreRows.length, corrections: correctionRows.length, photos: photoRows.length, spray: operationRows.length }
}
