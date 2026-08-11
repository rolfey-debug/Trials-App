import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { AppState, Screen, SyncItem, TrialDoc, TrialState } from './types'
import { idb } from './idb'
import { seedState } from './seed'

interface StoreCtx {
  st: AppState
  doc: TrialDoc
  ts: TrialState
  ready: boolean
  go: (s: Screen) => void
  /** Mutate app state; when label given, the mutation is queued for portal sync. */
  mut: (sync: { kind: SyncItem['kind']; label: string } | null, fn: (draft: AppState) => void) => void
  /** Mutate the active trial's state slice. */
  mutTrial: (sync: { kind: SyncItem['kind']; label: string } | null, fn: (ts: TrialState, draft: AppState) => void) => void
  syncNow: () => void
  resetDemo: () => void
  signOut: () => void
}

const Ctx = createContext<StoreCtx | null>(null)

export function useApp(): StoreCtx {
  const c = useContext(Ctx)
  if (!c) throw new Error('useApp outside provider')
  return c
}

let syncId = 1000

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [st, setSt] = useState<AppState | null>(null)
  const persistTimer = useRef<number | undefined>(undefined)

  // boot: hydrate from IndexedDB, else seed
  useEffect(() => {
    let alive = true
    idb
      .getState<AppState>()
      .then((saved) => {
        if (!alive) return
        if (saved && saved.schema === 1) setSt(saved)
        else setSt(seedState())
      })
      .catch(() => setSt(seedState()))
    return () => {
      alive = false
    }
  }, [])

  // write-through persistence (local first — the phone is the primary store)
  useEffect(() => {
    if (!st) return
    window.clearTimeout(persistTimer.current)
    persistTimer.current = window.setTimeout(() => {
      idb.putState(st).catch(() => {})
    }, 150)
  }, [st])

  const mut = useCallback<StoreCtx['mut']>((sync, fn) => {
    setSt((prev) => {
      if (!prev) return prev
      const draft = structuredClone(prev)
      fn(draft)
      if (sync) draft.syncQueue = [...draft.syncQueue, { id: syncId++, kind: sync.kind, label: sync.label, ts: Date.now(), synced: false }]
      return draft
    })
  }, [])

  const mutTrial = useCallback<StoreCtx['mutTrial']>(
    (sync, fn) => {
      mut(sync, (draft) => {
        const ts = draft.trialState[draft.activeTrialId]
        if (ts) fn(ts, draft)
      })
    },
    [mut]
  )

  const go = useCallback((s: Screen) => mut(null, (d) => void (d.screen = s)), [mut])

  const syncNow = useCallback(() => {
    // No portal backend wired yet: when online, the queue drains and the local
    // copy is authoritative. The queue shape matches what a Supabase push needs.
    mut(null, (d) => {
      if (!navigator.onLine) return
      d.syncQueue = d.syncQueue.map((q) => ({ ...q, synced: true }))
      d.lastSyncTs = Date.now()
    })
  }, [mut])

  const resetDemo = useCallback(() => {
    idb.clearPhotos().catch(() => {})
    const fresh = seedState()
    fresh.screen = 'storage'
    const ts = fresh.trialState[fresh.activeTrialId]
    ts.scores = {}
    ts.photos = []
    ts.assessIdx = 0
    ts.issues = []
    ts.mixDone = {}
    ts.sprDone = {}
    fresh.syncQueue = []
    fresh.session = { email: 'andrew.rolfe@agnvet.com.au', name: 'A. Rolfe', role: 'admin' }
    setSt(fresh)
  }, [])

  const signOut = useCallback(() => mut(null, (d) => void ((d.session = { ...d.session, email: null }), (d.screen = 'login'))), [mut])

  const value = useMemo<StoreCtx | null>(() => {
    if (!st) return null
    const doc = st.trials[st.activeTrialId]
    const ts = st.trialState[st.activeTrialId]
    return { st, doc, ts, ready: true, go, mut, mutTrial, syncNow, resetDemo, signOut }
  }, [st, go, mut, mutTrial, syncNow, resetDemo, signOut])

  if (!value) return null
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
