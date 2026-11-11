/**
 * Guidance settings + the in-progress job, kept in localStorage (not the app
 * store — coverage strips churn every second and never need to sync).
 */
import type { LatLng } from '../store/types'
import type { BoomId, Strip, Vec } from './engine'
import { newPairCode } from './link'

export interface BoomCfg {
  widthM: number
  /** metres from the phone to the boom along the bike: +ve ahead, −ve behind */
  offsetM: number
  /** deliberate lap between passes */
  overlapM: number
}

export interface GuideSettings {
  booms: Record<BoomId, BoomCfg>
  active: BoomId
  /** speed the sprayer was calibrated at — holding it holds the rate */
  targetKmh: number
  /** how far ahead the lightbar looks, seconds */
  lookaheadS: number
  pairCode: string
  baseOn: boolean
  /** treatment in the tank (trial work) — its plots light up */
  loadedTrt: number | null
}

export const DEFAULT_SETTINGS = (): GuideSettings => ({
  booms: {
    rear: { widthM: 6, offsetM: -1.2, overlapM: 0.3 },
    front: { widthM: 2, offsetM: 0.9, overlapM: 0 },
  },
  active: 'rear',
  targetKmh: 8,
  lookaheadS: 1.2,
  pairCode: newPairCode(),
  baseOn: true,
  loadedTrt: null,
})

export interface SavedLine {
  a: LatLng
  headingDeg: number
  kind: 'fit' | 'ab'
  rmsM?: number
  lengthM: number
}

export interface SavedJob {
  origin: LatLng | null
  line: SavedLine | null
  strips: Strip[]
  /** manual drift fix (snap / nudges) — only trusted for a few minutes */
  drift: (Vec & { ts: number }) | null
}

const SKEY = 'tw.guide.settings'
const jkey = (trialId: string) => `tw.guide.job.${trialId}`

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}
function write(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v))
  } catch {
    /* private mode / quota — the job simply isn't resumable */
  }
}

export function loadSettings(): GuideSettings {
  const d = DEFAULT_SETTINGS()
  const s = read<Partial<GuideSettings>>(SKEY)
  if (!s) {
    write(SKEY, d)
    return d
  }
  return { ...d, ...s, booms: { rear: { ...d.booms.rear, ...s.booms?.rear }, front: { ...d.booms.front, ...s.booms?.front } } }
}
export const saveSettings = (s: GuideSettings) => write(SKEY, s)

export function loadJob(trialId: string): SavedJob {
  return read<SavedJob>(jkey(trialId)) ?? { origin: null, line: null, strips: [], drift: null }
}
export function saveJob(trialId: string, j: SavedJob) {
  // round to the centimetre — a morning's strips stay well under a megabyte
  const r = (v: Vec): Vec => ({ e: Math.round(v.e * 100) / 100, n: Math.round(v.n * 100) / 100 })
  write(jkey(trialId), { ...j, strips: j.strips.map((s) => ({ ...s, pts: s.pts.map((p) => ({ l: r(p.l), r: r(p.r) })) })) })
}

export const spacingOf = (b: BoomCfg) => Math.max(0.5, b.widthM - b.overlapM)
