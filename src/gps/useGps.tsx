import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { Corner } from '../store/types'

export interface GpsReading {
  fix: Corner | null
  /** rounded metres for display; when no real fix, the simulated default (4 m) */
  accuracy: number
  live: boolean
  status: 'live' | 'denied' | 'unavailable' | 'starting'
}

const DEFAULT_ACC = 4

const Ctx = createContext<GpsReading>({ fix: null, accuracy: DEFAULT_ACC, live: false, status: 'starting' })

export const useGps = () => useContext(Ctx)

/** watchPosition wrapper with a rolling window of fixes. Where geolocation is
 * unavailable (desktop demo, permission denied) the app degrades to the design's
 * simulated ±4 m so every flow still works; screens label live vs demo. */
export function GpsProvider({ children }: { children: React.ReactNode }) {
  const [reading, setReading] = useState<GpsReading>({ fix: null, accuracy: DEFAULT_ACC, live: false, status: 'starting' })
  const recent = useRef<Corner[]>([])

  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setReading({ fix: null, accuracy: DEFAULT_ACC, live: false, status: 'unavailable' })
      return
    }
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const fix: Corner = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy ?? DEFAULT_ACC }
        recent.current = [...recent.current.slice(-9), fix]
        setReading({ fix, accuracy: Math.max(1, Math.round(fix.accuracy)), live: true, status: 'live' })
      },
      (err) => {
        setReading({ fix: null, accuracy: DEFAULT_ACC, live: false, status: err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable' })
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 }
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [])

  const value = useMemo(() => reading, [reading])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

/** Collect fixes for corner averaging (site setup): returns latest averaged corner. */
export function useFixAveraging(active: boolean): { avg: Corner | null; n: number } {
  const gps = useGps()
  const [fixes, setFixes] = useState<Corner[]>([])
  useEffect(() => {
    if (!active) {
      setFixes([])
      return
    }
    if (gps.fix) setFixes((f) => [...f.slice(-40), gps.fix!])
  }, [active, gps.fix])
  return useMemo(() => {
    if (!fixes.length) return { avg: null, n: 0 }
    const lat = fixes.reduce((s, f) => s + f.lat, 0) / fixes.length
    const lng = fixes.reduce((s, f) => s + f.lng, 0) / fixes.length
    const acc = fixes.reduce((s, f) => s + f.accuracy, 0) / fixes.length / Math.sqrt(Math.max(1, fixes.length / 2))
    return { avg: { lat, lng, accuracy: +acc.toFixed(1) }, n: fixes.length }
  }, [fixes])
}
