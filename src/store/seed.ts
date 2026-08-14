import { MATONG_BASE } from '../data/matong'
import { RINGWOOD_BASE } from '../data/ringwood'
import type { AppState, Issue, PhotoMeta, Score, SyncItem, TrialDoc, TrialState } from './types'
import { assessmentOrder } from '../lib/trial'

export const MATONG_ID = 'matong-wheat-fungicide-2026'
export const RINGWOOD_ID = 'ringwood-wheat-fungicide-2026'

export function matongDoc(): TrialDoc {
  return structuredClone({ id: MATONG_ID, ...MATONG_BASE })
}

export function ringwoodDoc(): TrialDoc {
  return structuredClone({ id: RINGWOOD_ID, ...RINGWOOD_BASE })
}

/** Demo seed matching the design prototype: first 12 walk plots scored, T1–8 mixed,
 * T1–5 sprayed, one open + one fixed spray issue, photo tiles. `Reset demo data`
 * in Storage clears scores/photos back to a clean season. */
/** Ringwood ships clean — nothing sprayed or scored yet; site facts from the
 * workbook's application record. */
export function ringwoodTrialState(): TrialState {
  const ts = freshTrialState(ringwoodDoc())
  ts.site = {
    cooperator: [
      ['Grower', '—'],
      ['Property', '‘Ringwood’, Corowa NSW'],
      ['Phone', '—'],
      ['Agronomist', 'A. Rolfe — IK Caldwell'],
    ],
    paddock: [
      ['Crop / variety', 'Wheat'],
      ['Sown', '—'],
      ['Previous crop', '—'],
      ['Soil', '—'],
    ],
    fert: [],
    notes:
      'Flutriafol breakdown block beside row 1 — do not spray into it. Marginal plots carrying treatments: 105, 108, 704, 708 — flag at assessment. Row 5 written off entirely.',
    pinned: false,
  }
  return ts
}

export function seedState(): AppState {
  const doc = matongDoc()
  const ringwood = ringwoodDoc()
  const order = assessmentOrder(doc)
  const seedVals: [number, number, number][] = [
    [5, 0, 1], [10, 5, 0], [0, 0, 0], [5, 0, 1], [15, 5, 0], [5, 0, 0],
    [10, 0, 1], [5, 5, 0], [0, 0, 0], [10, 0, 0], [5, 0, 0], [15, 10, 1],
  ]
  const scores: Record<number, Score> = {}
  const now = Date.now()
  const photos: PhotoMeta[] = []
  seedVals.forEach(([rust, phy, ph], i) => {
    const pid = order[i]
    const photoIds = ph ? [`seed-${pid}`] : []
    scores[pid] = { v: { rust, phy }, photoIds, ts: now - (12 - i) * 90_000, by: 'A. Rolfe' }
  })
  // photo grid seed (design screen 3d): placeholder tiles; real captures replace these
  const PH: [number, number, string, boolean][] = [
    [101, 1, '6 Aug', false], [401, 4, '6 Aug', false], [701, 7, '6 Aug', false],
    [505, 14, '6 Aug', true], [702, 19, '6 Aug', true], [102, 13, '11 Aug', false],
    [1202, 24, '11 Aug', false], [902, 21, '11 Aug', false], [301, 3, '11 Aug', false],
  ]
  PH.forEach(([pid, trt, date, flagged], i) => {
    photos.push({ id: `seed-ph-${i}`, pid, trt, date, flagged, stored: false })
  })

  const issues: Issue[] = [
    {
      id: 1, pid: 505, type: 'Wrong bottle',
      txt: 'Bottle T20 sprayed onto 505 — should have been T14 (Experimental 4 A). Caught two plots later.',
      when: '6 Aug · 08:12 · A. Rolfe', status: 'open',
      wb: { applied: 20, intended: 14 },
    },
    {
      id: 2, pid: 702, type: 'Marginal plot',
      txt: '702 too patchy to carry T19 — moved across to reserve 703 as per the map note.',
      when: '6 Aug · 07:55 · A. Rolfe', status: 'fixed',
      fix: 'Substituted reserve 703 · logged',
      corr: '702 → 703 · T19 moved to reserve · spray day',
    },
  ]

  const mixDone: Record<number, string> = {}
  for (let t = 1; t <= 8; t++) mixDone[t] = '6 Aug · A. Rolfe'
  const sprDone: Record<number, string> = {}
  for (let t = 1; t <= 5; t++) sprDone[t] = '6 Aug · A. Rolfe'

  const conditions: Record<string, string> = {
    Date: '6 Aug 2026', Start: '07:40', Finish: '—', Operator: 'A. Rolfe',
    Temp: '9 °C', RH: '72 %', Wind: '6 km/h SW', Nozzle: 'Orange 01 AI',
    Pressure: '40 PSI', Speed: '4.5 km/h',
  }

  const trialState: TrialState = {
    scores,
    activeMeasures: [...doc.measures.defaultActive],
    assessIdx: 12,
    assessField: doc.measures.defaultActive[0],
    blind: false,
    issues,
    relabel: {},
    excluded: [],
    mixDone,
    sprDone,
    conditions,
    walkI: 4,
    photos,
    site: {
      cooperator: [
        ['Grower', 'G. Hamilton'],
        ['Property', 'Yarranlea Rd, Matong NSW'],
        ['Phone', '0427 ··· ···'],
        ['Agronomist', 'A. Rolfe — IK Caldwell'],
      ],
      paddock: [
        ['Crop / variety', 'Wheat · Scepter'],
        ['Sown', '12 May · 60 kg/ha'],
        ['Previous crop', 'Canola'],
        ['Soil', 'Red loam · pH 5.8 (CaCl₂)'],
      ],
      fert: [
        { t: 'MAP 80 kg/ha', s: 'At sowing, banded', d: '12 MAY' },
        { t: 'Urea 100 kg/ha', s: 'Topdressed at GS30', d: '18 JUL' },
      ],
      notes:
        'Waterlogged patch rows 10–11, pos 3–5 — the OUT plots. Watch 702 / 802 (marginal, reserves held at 703 / 803). Blocking runs across the rows this year.',
      pinned: false,
    },
  }

  // queue mirrors the design's pending state: 3 assessments + 21 photos waiting for signal
  const syncQueue: SyncItem[] = []
  let sid = 1
  for (let i = 0; i < 3; i++) syncQueue.push({ id: sid++, kind: 'assessment', label: `Assessment scores · plots ${order[9 + i]}`, ts: now - i * 60_000, synced: false })
  for (let i = 0; i < 21; i++) syncQueue.push({ id: sid++, kind: 'photo', label: `Photo upload`, ts: now - i * 30_000, synced: false })

  return {
    schema: 1,
    screen: 'login',
    sprayTab: 'mix',
    session: { email: null, name: 'A. Rolfe', role: 'admin' },
    activeTrialId: MATONG_ID,
    trials: { [MATONG_ID]: doc, [RINGWOOD_ID]: ringwood },
    trialState: { [MATONG_ID]: trialState, [RINGWOOD_ID]: ringwoodTrialState() },
    otherTrials: [
      { name: 'Junee Reefs — Knockdown', sub: '28 trts · Assessment 2 done', chip: 'REPORT', chipKind: 'green' },
      { name: 'Junee — Pre-em Wheat + Canola', sub: '192 plots · Count 2 in progress', chip: '42–56 DAB', chipKind: 'grey' },
    ],
    people: [
      { ini: 'AR', n: 'Andrew Rolfe', s: 'All trials · IK Caldwell', chip: 'ADMIN' },
      { ini: 'EJ', n: 'Elijah', s: 'Assessor · Junee + Matong', chip: 'TEAM' },
      { ini: 'TL', n: 'Trent Lindbeck', s: 'Grower · Junee Reefs only', chip: 'GROWER' },
      { ini: 'SB', n: 'S. Byrne — Bayer', s: 'Rep · Matong fungicide only', chip: 'LIMITED' },
    ],
    invites: [],
    rules: { wifi: true, offline: true, backup: true },
    repBlind: true,
    photoFilter: 'all',
    syncQueue,
    lastSyncTs: null,
  }
}

/** Fresh per-trial state for a newly created trial (Add a trial flow). */
export function freshTrialState(doc: TrialDoc): TrialState {
  return {
    scores: {},
    activeMeasures: [...doc.measures.defaultActive],
    assessIdx: 0,
    assessField: doc.measures.defaultActive[0],
    blind: false,
    issues: [],
    relabel: {},
    excluded: [],
    mixDone: {},
    sprDone: {},
    conditions: {},
    walkI: 0,
    photos: [],
    site: {
      cooperator: [
        ['Grower', '—'],
        ['Property', '—'],
        ['Phone', '—'],
        ['Agronomist', 'A. Rolfe — IK Caldwell'],
      ],
      paddock: [
        ['Crop / variety', '—'],
        ['Sown', '—'],
        ['Previous crop', '—'],
        ['Soil', '—'],
      ],
      fert: [],
      notes: '',
      pinned: false,
    },
  }
}
