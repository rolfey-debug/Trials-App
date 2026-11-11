/**
 * Guidance controller — owns the GPS watch, the engine objects and the job,
 * and hands the screen a once-per-fix snapshot plus a `live` ref the canvas
 * reads at animation rate.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { LatLng, TrialDoc, TrialState } from '../store/types'
import { gridFromCorners, haversineM } from '../gps/geo'
import {
  BaseCorrector, Coverage, Frame, TrackFilter,
  crossTrack, fitLine, pickSwath, plotAt, rightOf, steer, unit, vadd, vlen, vmul, vsub,
  type BaseMsg, type BoomId, type CorrectorStatus, type Line, type PlotEN, type Steer, type Vec,
} from './engine'
import { loadJob, loadSettings, saveJob, saveSettings, spacingOf, type GuideSettings, type SavedLine } from './job'
import { openLink, type Link, type LinkState } from './link'
import { DemoDrive } from './sim'

export type GpsState = 'starting' | 'live' | 'denied' | 'unavailable' | 'demo'

export interface LineInfo extends Line {
  kind: 'fit' | 'ab'
  rmsM?: number
  lengthM: number
}

export interface Snap {
  gps: GpsState
  accM: number | null
  /** fixes per second, measured */
  hz: number
  doppler: boolean
  speedKmh: number
  stillS: number
  hasFix: boolean
  steer: Steer | null
  line: LineInfo | null
  spacing: number
  spraying: boolean
  areaM2: number
  overlapM2: number
  base: CorrectorStatus
  link: LinkState
  /** manual drift fix currently applied, metres */
  driftM: number
  /** A is down, B pending: metres driven so far */
  markingM: number | null
  plot: { pid: number; trt: number | null } | null
  msg: string | null
}

/** What the canvas needs at 20 fps — mutated in place, never triggers a render. */
export interface Live {
  filter: TrackFilter
  cov: Coverage
  frame: Frame | null
  drift: Vec
  line: LineInfo | null
  swath: number | null
  markA: Vec | null
  plots: PlotEN[]
  settings: GuideSettings
  spraying: boolean
}

const OFF: CorrectorStatus = { state: 'off', ageS: Infinity, settleLeftS: 0, gain: 0.5, cutPct: null, learnedS: 0, applyingM: 0, baseAccM: 0 }
const DRIFT_TTL = 15 * 60 * 1000

export function useGuidance(doc: TrialDoc, ts: TrialState) {
  const [settings, setSettingsState] = useState<GuideSettings>(loadSettings)
  const [demo, setDemo] = useState(false)
  const [snap, setSnap] = useState<Snap>({
    gps: 'starting', accM: null, hz: 0, doppler: false, speedKmh: 0, stillS: 0, hasFix: false, steer: null, line: null,
    spacing: spacingOf(settings.booms[settings.active]), spraying: false, areaM2: 0, overlapM2: 0, base: OFF, link: 'down', driftM: 0,
    markingM: null, plot: null, msg: null,
  })

  const live = useRef<Live>({
    filter: new TrackFilter(), cov: new Coverage(), frame: null, drift: { e: 0, n: 0 }, line: null, swath: null, markA: null, plots: [], settings, spraying: false,
  }).current
  live.settings = settings

  const corr = useRef(new BaseCorrector())
  const linkState = useRef<LinkState>('down')
  const gpsState = useRef<GpsState>('starting')
  const savedLine = useRef<SavedLine | null>(null)
  const markPts = useRef<Vec[]>([])
  const sprayCount = useRef(0)
  const fixTimes = useRef<number[]>([])
  const msg = useRef<{ text: string; until: number } | null>(null)
  const lastSave = useRef(0)
  // the store hands out fresh objects on every mutation — read them through refs so the GPS watch never restarts
  const docRef = useRef(doc)
  docRef.current = doc
  const tsRef = useRef(ts)
  tsRef.current = ts
  const pinnedCorners = () => (tsRef.current.site.pinned ? tsRef.current.site.corners : undefined)

  const flash = (text: string, ms = 4000) => {
    msg.current = { text, until: Date.now() + ms }
  }

  const demoRef = useRef(demo)
  demoRef.current = demo

  const persist = useCallback(() => {
    if (!live.frame || demoRef.current) return // a demo drive never overwrites the real job
    saveJob(doc.id, {
      origin: live.frame.origin,
      line: savedLine.current,
      strips: live.cov.strips,
      drift: vlen(live.drift) > 0 ? { ...live.drift, ts: Date.now() } : null,
    })
    lastSave.current = Date.now()
  }, [doc.id, live])

  /** First fix: adopt the saved job's frame if we're still in the same paddock. */
  const boot = useCallback(
    (here: LatLng) => {
      const job = loadJob(doc.id)
      const resume = job.origin && haversineM(job.origin, here) < 5000
      live.frame = new Frame(resume ? job.origin! : here)
      if (resume) {
        live.cov.load(job.strips)
        if (job.line) {
          savedLine.current = job.line
          live.line = { a: live.frame.toEN(job.line.a), headingDeg: job.line.headingDeg, kind: job.line.kind, rmsM: job.line.rmsM, lengthM: job.line.lengthM }
        }
        if (job.drift && Date.now() - job.drift.ts < DRIFT_TTL) live.drift = { e: job.drift.e, n: job.drift.n }
      }
      const corners = pinnedCorners()
      if (corners) {
        const f = live.frame
        live.plots = gridFromCorners(corners.A, corners.B, docRef.current).polygons.map((p) => ({ pid: p.pid, poly: p.corners.map((c) => f.toEN(c)), centre: f.toEN(p.centre) }))
      }
    },
    [doc.id, live]
  )

  const onFix = useCallback(
    (lat: number, lng: number, acc: number, speed: number | null, heading: number | null, tFix: number, source: GpsState) => {
      const now = Date.now()
      const t = Math.abs(now - tFix) < 3000 ? tFix : now
      if (!live.frame) boot({ lat, lng })
      const frame = live.frame!
      const s = live.settings
      const raw = frame.toEN({ lat, lng })
      const c = s.baseOn ? corr.current.correction(now) : { e: 0, n: 0 }
      const st = live.filter.update(vsub(raw, c), acc, speed != null && speed >= 0 ? speed : null, heading != null && heading >= 0 && !Number.isNaN(heading) ? heading : null, t)
      corr.current.onRover(raw, st.stillS, now)
      const pos = vadd(st.pos, live.drift)

      fixTimes.current = [...fixTimes.current.filter((x) => now - x < 5000), now]
      const hz = fixTimes.current.length > 1 ? (fixTimes.current.length - 1) / ((now - fixTimes.current[0]) / 1000) : 0

      const boom = s.booms[s.active]
      const spacing = spacingOf(boom)
      const boomAt = st.courseDeg != null ? vadd(pos, vmul(unit(st.courseDeg), boom.offsetM)) : pos

      // A is down — gather the pass for the best-fit line
      if (live.markA && st.speed > 0.5) markPts.current.push(pos)

      let sr: Steer | null = null
      if (live.line) {
        live.swath = pickSwath(crossTrack(pos, live.line), spacing, live.swath)
        sr = steer(pos, st.courseDeg, st.speed, live.line, spacing, s.lookaheadS, live.swath)
      }

      if (live.spraying && st.speed > 0.3 && st.courseDeg != null) {
        live.cov.add(boomAt, st.courseDeg, boom.widthM, s.active, sprayCount.current * 4096 + (live.swath ?? 0) + 2048)
        if (now - lastSave.current > 20000) persist()
      }

      let plot: Snap['plot'] = null
      if (live.plots.length) {
        const hit = plotAt(boomAt, live.plots)
        if (hit) {
          const cell = docRef.current.cells[hit.pid]
          plot = { pid: hit.pid, trt: typeof cell === 'number' ? (tsRef.current.relabel[hit.pid] ?? cell) : null }
        }
      }

      gpsState.current = source
      setSnap({
        gps: source, accM: acc, hz, doppler: st.doppler, speedKmh: st.speed * 3.6, stillS: st.stillS, hasFix: true, steer: sr, line: live.line, spacing,
        spraying: live.spraying, areaM2: live.cov.areaM2, overlapM2: live.cov.overlapM2,
        base: s.baseOn ? corr.current.status(now) : OFF, link: linkState.current, driftM: vlen(live.drift),
        markingM: live.markA ? vlen(vsub(pos, live.markA)) : null, plot,
        msg: msg.current && msg.current.until > now ? msg.current.text : null,
      })
    },
    [boot, live, persist]
  )
  const onFixRef = useRef(onFix)
  onFixRef.current = onFix

  // --- GPS: the real receiver, or the demo drive ---------------------------
  useEffect(() => {
    if (demo) {
      const origin = pinnedCorners()?.A ?? { lat: -35.9937, lng: 146.3921 }
      const sim = new DemoDrive(origin, 24, 70, spacingOf(loadSettings().booms.rear))
      const id = window.setInterval(() => {
        const f = sim.step(1, Date.now())
        onFixRef.current(f.lat, f.lng, f.acc, f.speed, f.heading, f.t, 'demo')
      }, 1000)
      return () => window.clearInterval(id)
    }
    if (!('geolocation' in navigator)) {
      gpsState.current = 'unavailable'
      setSnap((p) => ({ ...p, gps: 'unavailable' }))
      return
    }
    const id = navigator.geolocation.watchPosition(
      (p) => onFixRef.current(p.coords.latitude, p.coords.longitude, p.coords.accuracy ?? 5, p.coords.speed, p.coords.heading, p.timestamp, 'live'),
      (err) => {
        gpsState.current = err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable'
        setSnap((p) => (p.hasFix && gpsState.current !== 'denied' ? p : { ...p, gps: gpsState.current }))
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [demo])

  // Switching between demo and the real receiver starts a clean slate.
  const toggleDemo = useCallback(() => {
    persist()
    live.filter.reset()
    live.frame = null
    live.cov.clear()
    live.line = null
    live.swath = null
    live.markA = null
    live.drift = { e: 0, n: 0 }
    live.spraying = false
    savedLine.current = null
    setDemo((d) => !d)
  }, [live, persist])

  // --- base link ----------------------------------------------------------------
  useEffect(() => {
    if (!settings.baseOn) {
      linkState.current = 'down'
      return
    }
    let link: Link | null = openLink(
      settings.pairCode,
      (m: BaseMsg) => {
        if (m && m.k === 'b') corr.current.onBase(m, Date.now())
      },
      (s) => {
        linkState.current = s
        setSnap((p) => ({ ...p, link: s }))
      }
    )
    // let the base know a rover is listening (so its screen can say so)
    const ping = window.setInterval(() => link?.send({ k: 'r' }), 5000)
    return () => {
      window.clearInterval(ping)
      link?.close()
      link = null
    }
  }, [settings.baseOn, settings.pairCode])

  useEffect(() => () => persist(), [persist])

  // --- actions --------------------------------------------------------------------
  const setSettings = useCallback((patch: Partial<GuideSettings>) => {
    setSettingsState((prev) => {
      const next = { ...prev, ...patch }
      saveSettings(next)
      return next
    })
  }, [])

  const here = (): Vec | null => (live.filter.s ? vadd(live.filter.s.pos, live.drift) : null)

  const markA = useCallback(() => {
    const p = here()
    if (!p) return
    live.markA = p
    markPts.current = []
    flash('A is down — drive the first pass, then mark B')
  }, [live])

  const markB = useCallback((): string | null => {
    const p = here()
    if (!p || !live.markA || !live.frame) return 'No GPS fix yet'
    const run = vlen(vsub(p, live.markA))
    if (run < 8) return 'Drive at least 8 m from A before marking B'
    const pts = [live.markA, ...markPts.current, p]
    const fit = pts.length >= 10 ? fitLine(pts) : null
    let line: LineInfo
    if (fit && fit.rmsM < 2 && fit.lengthM > run * 0.8) {
      line = { a: fit.a, headingDeg: fit.headingDeg, kind: 'fit', rmsM: fit.rmsM, lengthM: fit.lengthM }
    } else {
      const d = vsub(p, live.markA)
      line = { a: live.markA, headingDeg: ((Math.atan2(d.e, d.n) * 180) / Math.PI + 360) % 360, kind: 'ab', lengthM: run }
    }
    live.line = line
    live.swath = 0
    live.markA = null
    markPts.current = []
    savedLine.current = { a: live.frame.toLL(line.a), headingDeg: line.headingDeg, kind: line.kind, rmsM: line.rmsM, lengthM: line.lengthM }
    persist()
    flash(line.kind === 'fit' ? `Line fitted through ${pts.length} fixes · ±${line.rmsM!.toFixed(1)} m scatter over ${Math.round(line.lengthM)} m` : `AB line set · ${Math.round(run)} m`, 6000)
    return null
  }, [live, persist])

  const clearLine = useCallback(() => {
    live.line = null
    live.swath = null
    live.markA = null
    savedLine.current = null
    live.drift = { e: 0, n: 0 }
    persist()
  }, [live, persist])

  const setSpray = useCallback(
    (on: boolean) => {
      if (on && !live.spraying) sprayCount.current++
      live.spraying = on
      setSnap((p) => ({ ...p, spraying: on }))
      if (!on) persist()
    },
    [live, persist]
  )

  /** Slide the guidance line under the bike: `steps` × 10 cm to the driver's right (−ve = left). */
  const nudge = useCallback(
    (steps: number) => {
      if (!live.line) return
      const c = live.filter.s?.courseDeg
      const reversed = c != null && Math.abs(((c - live.line.headingDeg + 540) % 360) - 180) > 90
      // line moves right ⇔ believed position moves left
      live.drift = vadd(live.drift, vmul(rightOf(live.line.headingDeg), -0.1 * steps * (reversed ? -1 : 1)))
      setSnap((p) => ({ ...p, driftM: vlen(live.drift) }))
    },
    [live]
  )

  /** "I'm on the line now" — zero the cross-track error against what the operator can see on the ground. */
  const snapToLine = useCallback(() => {
    const p = here()
    if (!p || !live.line || live.swath == null) return
    const off = crossTrack(p, live.line) - live.swath * spacingOf(live.settings.booms[live.settings.active])
    live.drift = vadd(live.drift, vmul(rightOf(live.line.headingDeg), -off))
    flash(`Drift zeroed — took out ${Math.abs(off).toFixed(1)} m`)
    setSnap((s) => ({ ...s, driftM: vlen(live.drift) }))
    persist()
  }, [live, persist])

  const resetDrift = useCallback(() => {
    live.drift = { e: 0, n: 0 }
    setSnap((s) => ({ ...s, driftM: 0 }))
    persist()
  }, [live, persist])

  const clearCoverage = useCallback(() => {
    live.cov.clear()
    setSnap((s) => ({ ...s, areaM2: 0, overlapM2: 0 }))
    persist()
  }, [live, persist])

  const actions = useMemo(
    () => ({ setSettings, markA, markB, clearLine, setSpray, nudge, snapToLine, resetDrift, clearCoverage, toggleDemo }),
    [setSettings, markA, markB, clearLine, setSpray, nudge, snapToLine, resetDrift, clearCoverage, toggleDemo]
  )

  return { snap, live, settings, demo, actions }
}
