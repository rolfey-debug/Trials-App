/** Central app state — a faithful port of the prototype's single state object. */
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { BASE_TREATMENTS, type Treatment } from './data'
import type { Design } from './lib/layout'

export type Screen = 'trials' | 'wizard' | 'docs' | 'review' | 'map'
export type Step = 'aim' | 'site' | 'treatments' | 'rand' | 'assess' | 'review'

export interface AppState {
  screen: Screen
  step: Step
  q: string
  season: string
  statusF: string
  picker: boolean
  pq: string
  exp: boolean
  expName: string
  expCat: string
  expNotes: string
  expRows: Array<{ n: string; r: string }>
  confirmed: Record<number, 1>
  extras: Array<{ name: string; exp: boolean }>
  lastAdded: number
  design: Design
  reps: number
  plotW: string
  plotL: string
  seed: string
  fact: boolean
  selDoc: number
  expMenu: boolean
  ack: boolean
  approved: boolean
  trialType: string
  trialName: string
  aimText: string
  tCrop: string
  tSeason: string
  mapBase: 'Satellite' | 'Roads'
  showPlots: boolean
  showFills: boolean
  drone: 'None' | 'RGB ortho' | 'NDVI'
  droneOp: number
}

const initial: AppState = {
  screen: 'trials',
  step: 'treatments',
  q: '',
  season: 'W2026',
  statusF: 'All',
  picker: false,
  pq: 'prothio',
  exp: true,
  expName: 'AGV-X31',
  expCat: 'Fungicide',
  expNotes: 'Sample from company rep — evaluation only, not for sale',
  expRows: [{ n: 'pydiflumetofen', r: '200 g/L' }],
  confirmed: { 0: 1, 1: 1, 4: 1, 7: 1 },
  extras: [],
  lastAdded: -1,
  design: 'RCBD',
  reps: 4,
  plotW: '2',
  plotL: '10',
  seed: 'A7F3',
  fact: false,
  selDoc: 0,
  expMenu: false,
  ack: false,
  approved: false,
  trialType: 'Demonstration',
  trialName: 'Matong Wheat Fungicide Demo 2026',
  aimText:
    'Compare label-rate foliar fungicide programs for stripe rust and septoria in Scepter wheat, and show the timing response (GS31 vs GS39) at the Matong field day.',
  tCrop: 'Wheat · Scepter',
  tSeason: 'Winter 2026',
  mapBase: 'Satellite',
  showPlots: true,
  showFills: false,
  drone: 'NDVI',
  droneOp: 65,
}

export interface Store {
  s: AppState
  set: (patch: Partial<AppState> | ((prev: AppState) => Partial<AppState>)) => void
  nav: (screen: Screen, more?: Partial<AppState>) => void
  allT: () => Treatment[]
}

const Ctx = createContext<Store | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [s, setS] = useState(initial)
  const store = useMemo<Store>(() => {
    const set: Store['set'] = (patch) =>
      setS((prev) => ({ ...prev, ...(typeof patch === 'function' ? patch(prev) : patch) }))
    return {
      s,
      set,
      nav: (screen, more) => set({ screen, picker: false, expMenu: false, ...more }),
      allT: () =>
        BASE_TREATMENTS.concat(
          s.extras.map((e) => ({
            name: e.name,
            exp: e.exp,
            fromPicker: true,
            lines: [[e.name, '—', '·'] as [string, string, string]],
            timing: '—',
            note: e.exp ? 'Experimental — flagged EXP in maps and reports' : 'Added from product list',
          })),
        ),
    }
  }, [s])
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>
}

export function useApp(): Store {
  const store = useContext(Ctx)
  if (!store) throw new Error('useApp outside provider')
  return store
}

/** Shared inline-style fragments used across screens. */
export const MONO = "'IBM Plex Mono',ui-monospace,monospace"
export const label = (mb = 9): React.CSSProperties => ({
  fontSize: 10.5,
  fontWeight: 800,
  letterSpacing: '.11em',
  color: '#8A8C8A',
  marginBottom: mb,
})
export const card: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #E4E4E6',
  borderRadius: 10,
}
