/** Entities per the handoff spec (docs/handoff/HANDOFF.md — State Management). */

export type CellKind = number | 'out' | 'skip' | 'spare' | 'reserve'
export type Role = 'admin' | 'team' | 'grower' | 'rep'
export type Screen =
  | 'login'
  | 'home'
  | 'assess'
  | 'map'
  | 'spray'
  | 'add'
  | 'setup'
  | 'site'
  | 'photos'
  | 'storage'
  | 'team'
  | 'reports'
  | 'walk'

export interface Treatment {
  n: number
  name: string
  recipe: string
  perBatchMl?: number[]
  bSpray: boolean
  plots: number[]
}

export type MeasureDef = [key: string, label: string, unit: string]

export interface MeasureLib {
  disease: MeasureDef[]
  weeds: MeasureDef[]
  crop: MeasureDef[]
  defaultActive: string[]
}

/** Static trial definition — the shape of fixtures/matong-trial.json plus an id. */
export interface TrialDoc {
  id: string
  trial: {
    name: string
    org: string
    season: number
    design: string
    reps: number
    /** How reps block onto the grid: by position bands (default) or row bands. */
    blocking?: 'position' | 'row'
    grid: { rows: number; positions: number }
    repBands: Record<string, number[]>
    plot: { widthM: number; lengthM: number; areaM2: number }
    waterRateLPerHa: number
    sprayVolumePerPlotMl: number
    batchVolumeL: number
    timings: { A: { sprayed?: string; due?: string }; B: { sprayed?: string; due?: string } }
    sourceDocument: string
  }
  treatments: Treatment[]
  cells: Record<string, CellKind>
  marginalPlots: number[]
  reserveRule?: string
  plotIdRule?: string
  walkOrders: { assessment: string; fieldDay: string }
  measures: MeasureLib
  conditionsRecordA?: Record<string, string | number>
  /** Operational notes carried from the source workbook (mixing caveats etc.). */
  notes?: string[]
}

export interface Score {
  v: Record<string, number>
  note?: string
  photoIds: string[]
  ts: number
  by: string
}

export interface Issue {
  id: number
  pid: number
  type: string
  txt: string
  when: string
  status: 'open' | 'fixed'
  fix?: string
  corr?: string
  /** wrong-bottle metadata: enables the relabel / exclude fix actions */
  wb?: { applied: number; intended: number }
}

export interface PhotoMeta {
  id: string
  pid: number
  trt: number
  date: string
  flagged: boolean
  /** true when a real captured blob exists in IndexedDB under this id */
  stored: boolean
  sizeKB?: number
  lat?: number
  lng?: number
}

export interface LatLng {
  lat: number
  lng: number
}

export interface Corner extends LatLng {
  accuracy: number
}

export interface SiteInfo {
  cooperator: [string, string][]
  paddock: [string, string][]
  fert: { t: string; s: string; d: string }[]
  notes: string
  corners?: { A: Corner; B: Corner }
  bearingDeg?: number
  frontEdgeM?: number
  pinned: boolean
}

export interface Invite {
  role: Role
  email: string
  ts: number
}

export interface Person {
  ini: string
  n: string
  s: string
  chip: 'ADMIN' | 'TEAM' | 'GROWER' | 'LIMITED'
}

/** Per-trial mutable state. */
export interface TrialState {
  scores: Record<number, Score>
  activeMeasures: string[]
  assessIdx: number
  assessField: string
  blind: boolean
  issues: Issue[]
  relabel: Record<number, number>
  excluded: number[]
  mixDone: Record<number, string>
  sprDone: Record<number, string>
  conditions: Record<string, string>
  walkI: number
  photos: PhotoMeta[]
  site: SiteInfo
}

export interface SyncItem {
  id: number
  kind: 'assessment' | 'photo' | 'issue' | 'trial' | 'site' | 'settings' | 'spray'
  label: string
  ts: number
  synced: boolean
}

export interface TrialStub {
  name: string
  sub: string
  chip: string
  chipKind: 'green' | 'grey'
}

export interface AppState {
  schema: 1
  screen: Screen
  sprayTab: 'mix' | 'order' | 'rec' | 'issues'
  session: { email: string | null; name: string; role: Role }
  activeTrialId: string
  trials: Record<string, TrialDoc>
  trialState: Record<string, TrialState>
  otherTrials: TrialStub[]
  people: Person[]
  invites: Invite[]
  rules: { wifi: boolean; offline: boolean; backup: boolean }
  repBlind: boolean
  photoFilter: 'all' | 'flag'
  syncQueue: SyncItem[]
  lastSyncTs: number | null
}
