/** Live trial data for the portal — reads/writes the real backend as the
 * signed-in user (RLS scopes everything to the org). The session is the one
 * the sidebar sign-in (or the field app, same origin) saved to localStorage. */
import { refresh, remove, select, update, type Session } from '../../../shared/supa'

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
