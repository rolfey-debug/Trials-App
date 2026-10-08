/** Live trial data for the portal — reads/writes the real backend as the
 * signed-in user (RLS scopes everything to the org). The session is the one
 * the sidebar sign-in (or the field app, same origin) saved to localStorage. */
import { fetchObject, insert, refresh, remove, select, update, type Session } from '../../../shared/supa'

const SESSION_KEY = 'tw.supaSession'

function saved(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    return raw ? (JSON.parse(raw) as Session) : null
  } catch {
    return null
  }
}

/** Valid access token, refreshing near expiry; null = not signed in. */
export async function portalToken(): Promise<string | null> {
  let s = saved()
  if (!s) return null
  if (s.expires_at * 1000 < Date.now()) {
    const next = await refresh(s)
    if (!next) return null
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(next))
    } catch {
      /* private mode */
    }
    s = next
  }
  return s.access_token
}

export interface LiveTrial {
  id: string
  name: string
  season: number | null
  status: string
  trial_type: string | null
  crop: string | null
  variety: string | null
  sown_date: string | null
  aim: string | null
  site: { property: string | null; town: string | null; lat: number | null; lng: number | null } | null
  scores: number
  plotsScored: number
  sprayTicks: number
  lastActivity: string | null
}

interface TrialRow {
  id: string
  name: string
  season: number | null
  status: string
  trial_type: string | null
  crop: string | null
  variety: string | null
  sown_date: string | null
  aim: string | null
  sites: LiveTrial['site']
}

export async function loadLiveTrials(token: string): Promise<LiveTrial[] | null> {
  const [trials, scores, ops] = await Promise.all([
    select<TrialRow>('trials', 'select=id,name,season,status,trial_type,crop,variety,sown_date,aim,sites(property,town,lat,lng)&order=season.desc,name.asc', token),
    select<{ trial_id: string; plot: number; recorded_at: string }>('scores', 'select=trial_id,plot,recorded_at', token),
    select<{ trial_id: string; detail: { sprayed?: number[] } | null; performed_at: string }>('operations', 'select=trial_id,detail,performed_at', token),
  ])
  if (!trials) return null
  return trials.map((t) => {
    const sc = (scores ?? []).filter((s) => s.trial_id === t.id)
    const op = (ops ?? []).filter((o) => o.trial_id === t.id)
    const stamps = [...sc.map((s) => s.recorded_at), ...op.map((o) => o.performed_at)].sort()
    return {
      ...t,
      site: t.sites,
      scores: sc.length,
      plotsScored: new Set(sc.map((s) => s.plot)).size,
      sprayTicks: op.reduce((n, o) => n + (o.detail?.sprayed?.length ?? 0), 0),
      lastActivity: stamps.length ? stamps[stamps.length - 1] : null,
    }
  })
}

export type TrialPatch = Partial<Pick<LiveTrial, 'name' | 'season' | 'status' | 'crop' | 'variety' | 'sown_date' | 'aim'>>

export function saveTrial(id: string, patch: TrialPatch, token: string): Promise<boolean> {
  return update('trials', `id=eq.${id}`, patch, token)
}

/** Deletes the trial; scores/photos/operations/treatments cascade with it. */
export function deleteTrial(id: string, token: string): Promise<boolean> {
  return remove('trials', `id=eq.${id}`, token)
}

// --- Results screen loaders -------------------------------------------------

export interface ScoreRow {
  id: string
  plot: number
  measure: string
  value: number
  note: string | null
  recorded_at: string
}

export interface TreatmentRow {
  n: number
  name: string
  recipe: string
  b_spray: boolean
  components: { plots?: number[] } | null
}

export interface PhotoRow {
  plot: number
  storage_path: string
  taken_at: string
  meta: { flagged?: boolean; trt?: number; label?: string; lat?: number | null; lng?: number | null } | null
}

export function loadScores(trialId: string, token: string): Promise<ScoreRow[] | null> {
  return select<ScoreRow>('scores', `select=id,plot,measure,value,note,recorded_at&trial_id=eq.${trialId}&order=plot.asc`, token)
}

export function loadTreatments(trialId: string, token: string): Promise<TreatmentRow[] | null> {
  return select<TreatmentRow>('treatments', `select=n,name,recipe,b_spray,components&trial_id=eq.${trialId}&order=n.asc`, token)
}

export function loadTrialPhotos(trialId: string, token: string): Promise<PhotoRow[] | null> {
  return select<PhotoRow>('photos', `select=plot,storage_path,taken_at,meta&trial_id=eq.${trialId}&order=plot.asc`, token)
}

/** Object URL for a photo in the org bucket; null = not uploaded yet. */
export async function photoObjectUrl(path: string): Promise<string | null> {
  const token = await portalToken()
  if (!token) return null
  const blob = await fetchObject('photos', path, token)
  return blob ? URL.createObjectURL(blob) : null
}

// --- Audit log --------------------------------------------------------------

export interface CorrectionRow {
  id: string
  plot: number
  kind: 'relabel' | 'exclude' | 'value'
  original_t: number | null
  effective_t: number | null
  measure: string | null
  old_value: number | null
  new_value: number | null
  reason: string | null
  made_at: string
  made_by: { name: string | null } | null
  trial_id: { name: string } | null
}

/** Every correction in the org, newest first, with who and which trial
 * embedded via the FK columns. */
export function loadCorrections(token: string): Promise<CorrectionRow[] | null> {
  return select<CorrectionRow>(
    'corrections',
    'select=id,plot,kind,original_t,effective_t,measure,old_value,new_value,reason,made_at,made_by(name),trial_id(name)&order=made_at.desc',
    token
  )
}

/** auth uid baked into the JWT — used as made_by on corrections. */
function jwtSub(token: string): string | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return typeof payload.sub === 'string' ? payload.sub : null
  } catch {
    return null
  }
}

/** Correct a score value: updates the row and writes an audit-trail
 * correction (who, when, old, new, why) in the same breath. */
export async function correctScore(
  scoreId: string,
  trialId: string,
  plot: number,
  measure: string,
  oldValue: number,
  newValue: number,
  reason: string,
  token: string
): Promise<boolean> {
  const ok = await update('scores', `id=eq.${scoreId}`, { value: newValue }, token)
  if (!ok) return false
  await insert(
    'corrections',
    [
      {
        id: crypto.randomUUID(),
        trial_id: trialId,
        plot,
        kind: 'value',
        measure,
        old_value: oldValue,
        new_value: newValue,
        reason,
        made_by: jwtSub(token),
        made_at: new Date().toISOString(),
      },
    ],
    token
  )
  return true
}
