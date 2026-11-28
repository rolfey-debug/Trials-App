import React, { useEffect, useRef, useState } from 'react'
import { C, MONO } from '../theme'
import { useApp } from '../store/store'
import { Toggle } from '../components/bits'
import { treatmentByN } from '../lib/trial'
import { alongTrack, crossTrack, rateAtSpeed, rightOf, steer, unit, vadd, vdot, vmul, vsub, type BoomId, type Vec } from '../guidance/engine'
import { spacingOf, type GuideSettings } from '../guidance/job'
import { fmtCode, newPairCode } from '../guidance/link'
import { useGuidance, type Live, type Snap } from '../guidance/useGuidance'
import { useWakeLock } from '../guidance/wakeLock'
import type { TrialDoc, TrialState } from '../store/types'

/**
 * Sprayer-bike guidance — lightbar, swath map, speed hold and as-applied
 * coverage for the 6 m rear boom and the 2 m shielded front boom.
 * Built to be read at arm's length on the handlebars: big type, few words.
 */

const AMBER = '#D99A00'
const LED_OFF = '#34373A'
const ZOOMS = [5, 9, 17] // swaths across the screen

const swathLabel = (k: number) => (k === 0 ? 'AB' : k > 0 ? `${k}R` : `${-k}L`)
const fmtArea = (m2: number) => (m2 < 1000 ? `${Math.round(m2)} m²` : `${(m2 / 10000).toFixed(2)} ha`)

function baseLine(s: Snap, on: boolean): { text: string; tone: 'ok' | 'warn' | 'idle' } {
  if (!on) return { text: 'BASE OFF', tone: 'idle' }
  const b = s.base
  if (b.state === 'live') {
    if (b.learnedS >= 120 && b.gain < 0.1) return { text: 'BASE · NO GAIN', tone: 'idle' }
    if (b.cutPct != null && b.cutPct > 0) return { text: `BASE −${b.cutPct}% DRIFT`, tone: 'ok' }
    return { text: 'BASE LIVE', tone: 'ok' }
  }
  if (b.state === 'settle') return { text: `BASE · ${b.settleLeftS}s`, tone: 'warn' }
  if (b.state === 'stale') return { text: 'BASE LOST', tone: 'warn' }
  return { text: s.link === 'open' || s.link === 'local' ? 'BASE · WAITING' : 'BASE · NO LINK', tone: 'idle' }
}

// ---------------------------------------------------------------- drawing ---

function drawBar(cv: HTMLCanvasElement, aheadM: number | null, stepM: number) {
  const dpr = window.devicePixelRatio || 1
  const w = cv.clientWidth
  const h = cv.clientHeight
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
    cv.width = Math.round(w * dpr)
    cv.height = Math.round(h * dpr)
  }
  const ctx = cv.getContext('2d')!
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)
  const N = 21
  const gap = 3
  const lw = (w - gap * (N - 1)) / N
  // lights run toward the line: bike right of line (+) → lights on the left → steer left
  const lit = aheadM == null ? 0 : Math.min(10, Math.round(Math.abs(aheadM) / stepM))
  const side = aheadM != null && aheadM > 0 ? -1 : 1
  for (let i = 0; i < N; i++) {
    const k = i - 10
    let col = LED_OFF
    if (aheadM != null) {
      if (k === 0) col = lit <= 1 ? '#19C37D' : '#1E6B4A'
      else if (Math.sign(k) === side && Math.abs(k) <= lit) col = Math.abs(k) <= 3 ? '#19C37D' : Math.abs(k) <= 6 ? '#F2B01E' : '#F0562B'
    }
    ctx.fillStyle = col
    const x = i * (lw + gap)
    const hh = k === 0 ? h : h * 0.72
    ctx.beginPath()
    ctx.roundRect(x, (h - hh) / 2, lw, hh, 2.5)
    ctx.fill()
  }
}

function drawMap(cv: HTMLCanvasElement, live: Live, zoom: number, now: number, doc: TrialDoc, ts: TrialState) {
  const dpr = window.devicePixelRatio || 1
  const w = cv.clientWidth
  const h = cv.clientHeight
  if (!w || !h) return
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
    cv.width = Math.round(w * dpr)
    cv.height = Math.round(h * dpr)
  }
  const ctx = cv.getContext('2d')!
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.fillStyle = '#EEF0EE'
  ctx.fillRect(0, 0, w, h)
  const fs = live.filter.s
  const p0 = live.filter.at(now)
  if (!fs || !p0) return
  const pos = vadd(p0, live.drift)
  const s = live.settings
  const boom = s.booms[s.active]
  const spacing = spacingOf(boom)
  const course = fs.courseDeg ?? live.line?.headingDeg ?? 0
  const scale = w / (spacing * zoom)
  const cx = w / 2
  const cy = h * 0.68
  const ux = rightOf(course)
  const uy = unit(course)
  const S = (v: Vec): [number, number] => {
    const r = vsub(v, pos)
    return [cx + vdot(r, ux) * scale, cy - vdot(r, uy) * scale]
  }
  const reach = Math.hypot(w, h) / scale

  // trial plots
  if (live.plots.length) {
    ctx.lineWidth = 1
    ctx.font = `500 ${Math.min(11, Math.max(8, scale * 0.5))}px ${MONO}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (const pl of live.plots) {
      if (Math.abs(pl.centre.e - pos.e) > reach + 15 || Math.abs(pl.centre.n - pos.n) > reach + 15) continue
      const cell = doc.cells[pl.pid]
      const trt = typeof cell === 'number' ? (ts.relabel[pl.pid] ?? cell) : null
      const target = s.loadedTrt != null && trt === s.loadedTrt
      ctx.beginPath()
      pl.poly.forEach((q, i) => {
        const [x, y] = S(q)
        if (i) ctx.lineTo(x, y)
        else ctx.moveTo(x, y)
      })
      ctx.closePath()
      ctx.fillStyle = target ? '#FFE9A8' : '#FBFCFB'
      ctx.fill()
      ctx.strokeStyle = target ? '#B8860B' : '#CBCDCB'
      ctx.stroke()
      if (scale > 9) {
        const [x, y] = S(pl.centre)
        ctx.fillStyle = target ? '#7A5A00' : '#9A9C9A'
        ctx.fillText(trt != null ? `${pl.pid}·T${trt}` : String(pl.pid), x, y)
      }
    }
  }

  // target band for the current swath
  if (live.line && live.swath != null) {
    const along = alongTrack(pos, live.line)
    const c = vadd(live.line.a, vmul(rightOf(live.line.headingDeg), live.swath * spacing))
    const d = unit(live.line.headingDeg)
    const half = vmul(rightOf(live.line.headingDeg), boom.widthM / 2)
    const q = [vadd(vadd(c, vmul(d, along - reach)), half), vadd(vadd(c, vmul(d, along + reach)), half), vsub(vadd(c, vmul(d, along + reach)), half), vsub(vadd(c, vmul(d, along - reach)), half)]
    ctx.beginPath()
    q.forEach((v, i) => {
      const [x, y] = S(v)
      if (i) ctx.lineTo(x, y)
      else ctx.moveTo(x, y)
    })
    ctx.closePath()
    ctx.fillStyle = 'rgba(0,119,73,.07)'
    ctx.fill()
  }

  // coverage
  for (const st of live.cov.strips) {
    if (st.pts.length < 2) continue
    ctx.beginPath()
    for (let i = 0; i < st.pts.length; i++) {
      const [x, y] = S(st.pts[i].l)
      if (i) ctx.lineTo(x, y)
      else ctx.moveTo(x, y)
    }
    for (let i = st.pts.length - 1; i >= 0; i--) {
      const [x, y] = S(st.pts[i].r)
      ctx.lineTo(x, y)
    }
    ctx.closePath()
    ctx.fillStyle = st.boom === 'rear' ? 'rgba(0,119,73,.34)' : 'rgba(0,82,140,.38)'
    ctx.fill()
  }

  // swath lines
  if (live.line) {
    const xt = crossTrack(pos, live.line)
    const along = alongTrack(pos, live.line)
    const d = unit(live.line.headingDeg)
    const k0 = Math.max(Math.floor((xt - reach) / spacing), Math.round(xt / spacing) - 30)
    const k1 = Math.min(Math.ceil((xt + reach) / spacing), Math.round(xt / spacing) + 30)
    for (let k = k0; k <= k1; k++) {
      const c = vadd(live.line.a, vmul(rightOf(live.line.headingDeg), k * spacing))
      const [x1, y1] = S(vadd(c, vmul(d, along - reach)))
      const [x2, y2] = S(vadd(c, vmul(d, along + reach)))
      const cur = k === live.swath
      ctx.beginPath()
      ctx.moveTo(x1, y1)
      ctx.lineTo(x2, y2)
      ctx.setLineDash(cur ? [] : [6, 6])
      ctx.lineWidth = cur ? 3 : 1.2
      ctx.strokeStyle = cur ? C.green : '#9EA19E'
      ctx.stroke()
    }
    ctx.setLineDash([])
    const [ax, ay] = S(live.line.a)
    ctx.fillStyle = C.ink
    ctx.beginPath()
    ctx.arc(ax, ay, 9, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.font = `700 10px ${MONO}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('A', ax, ay + 0.5)
  }

  // A is down, B pending
  if (live.markA) {
    const [ax, ay] = S(live.markA)
    ctx.strokeStyle = C.burnt
    ctx.lineWidth = 2
    ctx.setLineDash([5, 5])
    ctx.beginPath()
    ctx.moveTo(ax, ay)
    ctx.lineTo(cx, cy)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = C.burnt
    ctx.beginPath()
    ctx.arc(ax, ay, 9, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.font = `700 10px ${MONO}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('A', ax, ay + 0.5)
  }

  // the bike: both booms, then the body
  const ids: BoomId[] = ['rear', 'front']
  for (const id of ids) {
    const b = s.booms[id]
    const act = id === s.active
    const y = cy - b.offsetM * scale
    const half = (b.widthM / 2) * scale
    ctx.strokeStyle = act ? (live.spraying ? '#19A866' : C.ink) : '#B4B7B4'
    ctx.lineWidth = act ? 5 : 2.5
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(cx - half, y)
    ctx.lineTo(cx + half, y)
    ctx.stroke()
    if (id === 'front') {
      // shields
      ctx.lineWidth = act ? 3 : 2
      ctx.beginPath()
      ctx.moveTo(cx - half, y - 5)
      ctx.lineTo(cx - half, y + 5)
      ctx.moveTo(cx + half, y - 5)
      ctx.lineTo(cx + half, y + 5)
      ctx.stroke()
    }
  }
  ctx.lineCap = 'butt'
  const bw = Math.max(10, 0.9 * scale)
  const bl = Math.max(18, 1.9 * scale)
  ctx.fillStyle = C.ink
  ctx.beginPath()
  ctx.moveTo(cx, cy - bl * 0.62)
  ctx.lineTo(cx + bw / 2, cy - bl * 0.1)
  ctx.lineTo(cx + bw / 2, cy + bl * 0.38)
  ctx.lineTo(cx - bw / 2, cy + bl * 0.38)
  ctx.lineTo(cx - bw / 2, cy - bl * 0.1)
  ctx.closePath()
  ctx.fill()

  // scale bar
  const barM = scale * 5 < w * 0.4 ? 5 : scale * 2 < w * 0.4 ? 2 : 1
  ctx.strokeStyle = C.grey
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(12, h - 12)
  ctx.lineTo(12 + barM * scale, h - 12)
  ctx.stroke()
  ctx.fillStyle = C.grey
  ctx.font = `600 10px ${MONO}`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'bottom'
  ctx.fillText(`${barM} m`, 12, h - 16)
}

// ------------------------------------------------------------------ screen ---

type Sheet = 'line' | 'acc' | 'set' | null

export function Guidance() {
  const { doc, ts, go } = useApp()
  const { snap, live, settings, demo, actions } = useGuidance(doc, ts)
  const [sheet, setSheet] = useState<Sheet>(null)
  const [zoomI, setZoomI] = useState(0)
  const [err, setErr] = useState<string | null>(null)
  const mapRef = useRef<HTMLCanvasElement>(null)
  const barRef = useRef<HTMLCanvasElement>(null)
  const offRef = useRef<HTMLDivElement>(null)
  const numRef = useRef<HTMLDivElement>(null)
  const hintRef = useRef<HTMLDivElement>(null)
  const leftRef = useRef<HTMLDivElement>(null)
  const rightRef = useRef<HTMLDivElement>(null)
  const docRef = useRef({ doc, ts })
  docRef.current = { doc, ts }
  useWakeLock(true)

  const boom = settings.booms[settings.active]
  const spacing = spacingOf(boom)

  // 20 fps: map + lightbar run off the filter's extrapolated position, so they
  // move smoothly between 1 Hz fixes instead of ticking.
  useEffect(() => {
    let raf = 0
    let last = 0
    let lastTxt = 0
    const loop = (ts0: number) => {
      raf = requestAnimationFrame(loop)
      if (ts0 - last < 50) return
      last = ts0
      const now = Date.now()
      if (mapRef.current) drawMap(mapRef.current, live, ZOOMS[zoomI], now, docRef.current.doc, docRef.current.ts)
      const fs = live.filter.s
      const p0 = live.filter.at(now)
      let ahead: number | null = null
      let off: number | null = null
      if (fs && p0 && live.line && live.swath != null) {
        const s = live.settings
        const st = steer(vadd(p0, live.drift), fs.courseDeg, fs.speed, live.line, spacingOf(s.booms[s.active]), s.lookaheadS, live.swath)
        ahead = st.aheadOffM
        off = st.offM
      }
      if (barRef.current) drawBar(barRef.current, ahead, live.settings.active === 'front' ? 0.1 : 0.2)
      if (ts0 - lastTxt > 240 && offRef.current && numRef.current && hintRef.current && leftRef.current && rightRef.current) {
        lastTxt = ts0
        const show = (el: HTMLElement, on: boolean) => (el.style.visibility = on ? 'visible' : 'hidden')
        numRef.current.style.display = off == null ? 'none' : 'flex'
        hintRef.current.style.display = off == null ? 'block' : 'none'
        if (off == null) {
          hintRef.current.textContent = live.markA ? 'DRIVE THE FIRST PASS' : live.filter.s ? 'NO LINE SET' : 'WAITING FOR GPS'
          show(leftRef.current, false)
          show(rightRef.current, false)
        } else {
          const on = Math.abs(off) < 0.1
          offRef.current.textContent = Math.abs(off).toFixed(1)
          offRef.current.style.color = on ? '#19C37D' : '#fff'
          show(leftRef.current, !on && off > 0)
          show(rightRef.current, !on && off < 0)
        }
      }
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [live, zoomI])

  const moving = snap.speedKmh > 1
  const spdDev = moving ? (snap.speedKmh - settings.targetKmh) / settings.targetKmh : 0
  const spdCol = !moving ? C.ink : Math.abs(spdDev) <= 0.05 ? C.green : Math.abs(spdDev) <= 0.1 ? AMBER : C.burnt
  const rate = rateAtSpeed(doc.trial.waterRateLPerHa, settings.targetKmh, snap.speedKmh)
  const base = baseLine(snap, settings.baseOn)
  const lapPct = snap.areaM2 > 0 ? Math.round((snap.overlapM2 / snap.areaM2) * 100) : 0
  const trtName = (n: number) => treatmentByN(doc, n)?.name ?? `T${n}`
  const plotWrong = snap.plot && settings.loadedTrt != null && snap.plot.trt !== settings.loadedTrt

  const gpsText =
    snap.gps === 'demo' ? 'DEMO DRIVE'
    : snap.gps === 'denied' ? 'GPS BLOCKED'
    : snap.gps === 'unavailable' ? 'NO GPS'
    : snap.accM == null ? 'GPS…'
    : `GPS ±${snap.accM < 1 ? snap.accM.toFixed(2) : snap.accM.toFixed(0)} m`

  const chip = (text: string, tone: 'ok' | 'warn' | 'idle'): React.ReactNode => (
    <span
      style={{
        font: `600 10px ${MONO}`, padding: '4px 7px', borderRadius: 6, whiteSpace: 'nowrap',
        background: tone === 'ok' ? C.greenTint : tone === 'warn' ? C.burntTint : C.chipBg,
        color: tone === 'ok' ? C.greenDark : tone === 'warn' ? C.burntDark : C.grey,
      }}
    >
      {text}
    </span>
  )
  const tile: React.CSSProperties = { flex: 1, background: '#fff', border: `1px solid ${C.hairline}`, borderRadius: 11, padding: '6px 9px 7px', minWidth: 0 }
  const tileLbl: React.CSSProperties = { font: `600 9px ${MONO}`, color: C.muted, letterSpacing: '.08em' }
  const tileSub: React.CSSProperties = { font: `500 9.5px ${MONO}`, color: C.grey, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }
  const btn = (primary = false): React.CSSProperties => ({
    flex: 1, textAlign: 'center', padding: '12px 0', borderRadius: 11, fontSize: 12.5, fontWeight: 800, cursor: 'pointer', userSelect: 'none',
    ...(primary ? { background: C.green, color: '#fff' } : { background: '#fff', border: `1.5px solid ${C.ghostBorder}`, color: C.body }),
  })

  const onMarkB = () => {
    const e = actions.markB()
    setErr(e)
    if (!e) setSheet(null)
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, position: 'relative' }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 12px 6px', flex: 'none' }}>
        <div onClick={() => go('spray')} style={{ fontSize: 13, fontWeight: 700, color: C.green, cursor: 'pointer', padding: '4px 4px 4px 0' }}>
          ‹ Spray
        </div>
        <div style={{ flex: 1 }} />
        <div onClick={() => setSheet('acc')} style={{ display: 'flex', gap: 5, cursor: 'pointer' }} data-testid="acc-chips">
          {chip(gpsText, snap.gps === 'live' ? 'ok' : snap.gps === 'demo' ? 'warn' : snap.gps === 'starting' ? 'idle' : 'warn')}
          {chip(base.text, base.tone)}
        </div>
        <div onClick={() => setSheet('set')} style={{ fontSize: 17, padding: '0 2px 2px 6px', cursor: 'pointer', color: C.grey }} aria-label="Settings">
          ⚙
        </div>
      </div>

      {/* lightbar */}
      <div style={{ background: '#17191A', borderRadius: 14, margin: '0 10px 7px', padding: '9px 11px 8px', flex: 'none' }}>
        <canvas ref={barRef} style={{ width: '100%', height: 30, display: 'block' }} />
        <div style={{ display: 'flex', alignItems: 'center', marginTop: 5, minHeight: 36 }}>
          <div ref={leftRef} style={{ flex: 1, textAlign: 'right', font: `700 12px ${MONO}`, color: '#fff', letterSpacing: '.06em', whiteSpace: 'nowrap', visibility: 'hidden' }}>
            <span style={{ fontSize: 22, verticalAlign: -3 }}>◀</span> STEER LEFT
          </div>
          <div ref={numRef} style={{ display: 'none', alignItems: 'baseline', gap: 5, padding: '0 14px' }}>
            <div ref={offRef} data-testid="off" style={{ font: `700 34px ${MONO}`, color: '#fff', lineHeight: 1, letterSpacing: -1 }}>
              0.0
            </div>
            <div style={{ font: `600 11px ${MONO}`, color: '#8F9391' }}>m</div>
          </div>
          <div ref={hintRef} style={{ font: `700 12px ${MONO}`, color: '#C9CCCA', letterSpacing: '.08em', padding: '0 14px', whiteSpace: 'nowrap' }}>
            WAITING FOR GPS
          </div>
          <div ref={rightRef} style={{ flex: 1, textAlign: 'left', font: `700 12px ${MONO}`, color: '#fff', letterSpacing: '.06em', whiteSpace: 'nowrap', visibility: 'hidden' }}>
            STEER RIGHT <span style={{ fontSize: 22, verticalAlign: -3 }}>▶</span>
          </div>
        </div>
      </div>

      {/* stats */}
      <div style={{ display: 'flex', gap: 6, margin: '0 10px 7px', flex: 'none' }}>
        <div style={tile}>
          <div style={tileLbl}>SPEED KM/H</div>
          <div style={{ font: `700 24px ${MONO}`, color: spdCol, lineHeight: 1.15 }} data-testid="speed">
            {snap.speedKmh.toFixed(1)}
            {moving && Math.abs(spdDev) > 0.05 && <span style={{ fontSize: 14 }}>{spdDev > 0 ? ' ▼' : ' ▲'}</span>}
          </div>
          <div style={tileSub}>{moving ? `≈${Math.round(rate)} L/ha · aim ${settings.targetKmh}` : `aim ${settings.targetKmh} for ${doc.trial.waterRateLPerHa} L/ha`}</div>
        </div>
        <div style={{ ...tile, flex: 0.72 }}>
          <div style={tileLbl}>PASS</div>
          <div style={{ font: `700 24px ${MONO}`, lineHeight: 1.15 }} data-testid="pass">
            {snap.steer ? swathLabel(snap.steer.swath) : '—'}
          </div>
          <div style={tileSub}>{snap.line ? `${Math.round(snap.line.headingDeg)}° · ${spacing.toFixed(1)} m` : `${spacing.toFixed(1)} m swath`}</div>
        </div>
        <div style={tile}>
          <div style={tileLbl}>SPRAYED</div>
          <div style={{ font: `700 ${snap.areaM2 >= 1000 ? 21 : 19}px ${MONO}`, lineHeight: 1.3 }} data-testid="area">
            {fmtArea(snap.areaM2)}
          </div>
          <div style={{ ...tileSub, color: lapPct > 12 ? C.burntDark : C.grey }}>{snap.areaM2 > 0 ? `${lapPct}% double-sprayed` : 'boom off'}</div>
        </div>
      </div>

      {/* map */}
      <div style={{ flex: 1, minHeight: 0, margin: '0 10px', borderRadius: 14, overflow: 'hidden', position: 'relative', border: `1px solid ${C.hairline}`, background: '#EEF0EE' }}>
        <canvas ref={mapRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
        {!snap.hasFix && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24, textAlign: 'center' }}>
            <div style={{ fontSize: 15, fontWeight: 800 }}>
              {snap.gps === 'denied' ? 'Location is blocked for this app' : snap.gps === 'unavailable' ? 'No GPS fix yet' : 'Waiting for a GPS fix…'}
            </div>
            <div style={{ fontSize: 12, color: C.grey, lineHeight: 1.5 }}>
              {snap.gps === 'denied'
                ? 'Allow location for this site in the browser settings, then reopen guidance.'
                : 'Needs a clear view of the sky. First fix can take half a minute.'}
            </div>
            {snap.gps !== 'starting' && (
              <div onClick={actions.toggleDemo} style={{ ...btn(), flex: 'none', padding: '10px 18px' }}>
                Try a demo drive
              </div>
            )}
          </div>
        )}
        {snap.hasFix && !snap.line && snap.markingM == null && (
          <div style={{ position: 'absolute', left: 70, right: 14, bottom: 10, textAlign: 'right', fontSize: 11.5, color: C.grey, lineHeight: 1.45 }}>
            <b style={{ color: C.body }}>Set line</b> for pass-to-pass guidance — or just switch the boom on to map what's been sprayed.
          </div>
        )}
        {snap.plot && (
          <div
            data-testid="plot-chip"
            style={{
              position: 'absolute', left: 8, top: 8, borderRadius: 9, padding: '6px 10px', maxWidth: '70%',
              background: plotWrong ? C.burnt : settings.loadedTrt != null ? C.green : '#fff',
              color: plotWrong || settings.loadedTrt != null ? '#fff' : C.ink, border: `1px solid ${plotWrong ? C.burntDark : C.hairline}`,
            }}
          >
            <div style={{ font: `700 13px ${MONO}` }}>
              PLOT {snap.plot.pid}
              {snap.plot.trt != null ? ` · T${snap.plot.trt}` : ''}
              {plotWrong ? ` — NOT T${settings.loadedTrt}` : ''}
            </div>
            {snap.plot.trt != null && <div style={{ fontSize: 10.5, fontWeight: 600, opacity: 0.85, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{trtName(snap.plot.trt)}</div>}
          </div>
        )}
        <div
          onClick={() => setZoomI((z) => (z + 1) % ZOOMS.length)}
          style={{ position: 'absolute', right: 8, top: 8, background: '#fff', border: `1px solid ${C.hairline}`, borderRadius: 9, padding: '7px 10px', font: `700 11px ${MONO}`, cursor: 'pointer' }}
        >
          {Math.round(spacing * ZOOMS[zoomI])} m ⤢
        </div>
        {demo && (
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, background: C.burnt, color: '#fff', font: `700 10.5px ${MONO}`, textAlign: 'center', padding: '4px 0', letterSpacing: '.08em' }}>
            DEMO DRIVE — NOT YOUR GPS
          </div>
        )}
        {snap.msg && (
          <div style={{ position: 'absolute', left: 10, right: 10, bottom: demo ? 30 : 10, background: 'rgba(20,20,20,.9)', color: '#fff', borderRadius: 9, padding: '8px 11px', fontSize: 12, fontWeight: 700, textAlign: 'center' }}>
            {snap.msg}
          </div>
        )}
      </div>

      {/* controls */}
      <div style={{ padding: '8px 10px calc(10px + env(safe-area-inset-bottom, 0px))', flex: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {snap.markingM != null ? (
          <div style={{ display: 'flex', gap: 6 }}>
            <div style={{ ...btn(true), flex: 2, background: C.burnt, padding: '14px 0', fontSize: 14 }} onClick={onMarkB}>
              Mark B — {Math.round(snap.markingM)} m driven
            </div>
            <div style={btn()} onClick={actions.clearLine}>
              Cancel
            </div>
          </div>
        ) : snap.line ? (
          <div style={{ display: 'flex', gap: 6 }}>
            <div style={btn()} onClick={() => actions.nudge(-1)}>
              ◀ Line 10 cm
            </div>
            <div style={{ ...btn(), flex: 1.15, borderColor: C.green, color: C.greenDark }} onClick={actions.snapToLine}>
              I'm on the line
            </div>
            <div style={btn()} onClick={() => actions.nudge(1)}>
              Line 10 cm ▶
            </div>
          </div>
        ) : null}
        {err && <div style={{ fontSize: 11.5, fontWeight: 700, color: C.burntDark, textAlign: 'center' }}>{err}</div>}
        <div style={{ display: 'flex', gap: 6 }}>
          <div
            style={{ ...btn(), flex: 0.9, padding: '8px 0', lineHeight: 1.25 }}
            onClick={() => actions.setSettings({ active: settings.active === 'rear' ? 'front' : 'rear' })}
            data-testid="boom"
          >
            <div style={{ font: `600 9px ${MONO}`, color: C.muted, letterSpacing: '.08em' }}>BOOM ⇄</div>
            {settings.active === 'rear' ? `Rear ${boom.widthM} m` : `Front ${boom.widthM} m`}
          </div>
          <div
            onClick={() => actions.setSpray(!snap.spraying)}
            data-testid="spray"
            style={{
              flex: 1.5, textAlign: 'center', padding: '8px 0', borderRadius: 11, fontSize: 15.5, fontWeight: 800, cursor: 'pointer', userSelect: 'none',
              background: snap.spraying ? '#19A866' : C.ink, color: '#fff', lineHeight: 1.25,
            }}
          >
            {snap.spraying ? 'SPRAYING' : 'Boom off'}
            <div style={{ font: `600 9.5px ${MONO}`, letterSpacing: '.06em', opacity: 0.8 }}>{snap.spraying ? "TAP WHEN IT'S OFF" : "TAP WHEN IT'S ON"}</div>
          </div>
          <div style={{ ...btn(), flex: 0.9, padding: '8px 0', lineHeight: 1.25 }} onClick={() => (setErr(null), setSheet('line'))} data-testid="line">
            <div style={{ font: `600 9px ${MONO}`, color: C.muted, letterSpacing: '.08em' }}>GUIDANCE</div>
            {snap.line ? 'Line ✓' : 'Set line'}
          </div>
        </div>
      </div>

      {sheet && (
        <div onClick={() => setSheet(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(20,20,20,.38)', display: 'flex', alignItems: 'flex-end', zIndex: 5 }}>
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: C.appBg, borderRadius: '18px 18px 0 0', width: '100%', maxHeight: '86%', overflow: 'auto', padding: '14px 14px calc(16px + env(safe-area-inset-bottom, 0px))', boxSizing: 'border-box' }}
          >
            {sheet === 'line' && <LineSheet snap={snap} err={err} onA={() => (actions.markA(), setSheet(null))} onB={onMarkB} onClear={() => (actions.clearLine(), setSheet(null))} />}
            {sheet === 'acc' && <AccuracySheet snap={snap} settings={settings} set={actions.setSettings} resetDrift={actions.resetDrift} />}
            {sheet === 'set' && (
              <SettingsSheet settings={settings} set={actions.setSettings} doc={doc} demo={demo} toggleDemo={() => (actions.toggleDemo(), setSheet(null))} clearCoverage={actions.clearCoverage} area={snap.areaM2} />
            )}
            <div style={{ ...btn(sheet !== 'line'), marginTop: 12 }} onClick={() => setSheet(null)}>
              {sheet === 'line' ? 'Close' : 'Done'}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ------------------------------------------------------------------ sheets ---

const card: React.CSSProperties = { background: '#fff', border: `1px solid ${C.hairline}`, borderRadius: 13, padding: '12px 13px', marginBottom: 8 }
const h1: React.CSSProperties = { fontSize: 17, fontWeight: 800, marginBottom: 2 }
const sub: React.CSSProperties = { fontSize: 11.5, color: C.grey, marginBottom: 11, lineHeight: 1.45 }
const eyebrow: React.CSSProperties = { font: `600 10px ${MONO}`, color: C.green, letterSpacing: '.08em', marginBottom: 4 }
const para: React.CSSProperties = { fontSize: 12, color: C.body, lineHeight: 1.5 }
const kv: React.CSSProperties = { font: `500 11px ${MONO}`, color: C.body, lineHeight: 1.7 }

function LineSheet({ snap, err, onA, onB, onClear }: { snap: Snap; err: string | null; onA: () => void; onB: () => void; onClear: () => void }) {
  const big: React.CSSProperties = { borderRadius: 12, padding: '15px 0', textAlign: 'center', fontSize: 14.5, fontWeight: 800, cursor: 'pointer', color: '#fff' }
  return (
    <>
      <div style={h1}>Guidance line</div>
      <div style={sub}>Drive the first pass by eye. Every pass after it runs parallel, one boom width apart.</div>
      {snap.line && (
        <div style={{ ...card, borderColor: C.green }}>
          <div style={eyebrow}>CURRENT LINE</div>
          <div style={kv}>
            Heading {snap.line.headingDeg.toFixed(1)}° · {Math.round(snap.line.lengthM)} m run
            <br />
            {snap.line.kind === 'fit' ? `Best fit through the pass · ±${(snap.line.rmsM ?? 0).toFixed(1)} m scatter` : 'Straight A → B (pass too short to fit)'}
          </div>
        </div>
      )}
      <div style={card}>
        <div style={eyebrow}>{snap.markingM != null ? 'STEP 2 — END OF THE PASS' : 'STEP 1 — START OF THE PASS'}</div>
        <div style={{ ...para, marginBottom: 10 }}>
          {snap.markingM != null
            ? `A is down, ${Math.round(snap.markingM)} m driven. Mark B at the far end — the line is fitted through every fix along the way, not just the two ends, so a longer pass gives a truer line.`
            : 'Stop at the start of your first pass for a few seconds (parked fixes average tighter), mark A, then drive it straight.'}
        </div>
        {snap.markingM != null ? (
          <div style={{ ...big, background: C.burnt }} onClick={onB}>
            Mark B here
          </div>
        ) : (
          <div style={{ ...big, background: snap.hasFix ? C.green : C.disabled }} onClick={snap.hasFix ? onA : undefined}>
            {snap.line ? 'Mark a new A' : 'Mark A here'}
          </div>
        )}
        {err && <div style={{ fontSize: 11.5, fontWeight: 700, color: C.burntDark, marginTop: 8 }}>{err}</div>}
      </div>
      {(snap.line || snap.markingM != null) && (
        <div style={{ textAlign: 'center', fontSize: 12.5, fontWeight: 700, color: C.burntDark, padding: '6px 0', cursor: 'pointer' }} onClick={onClear}>
          Clear the line
        </div>
      )}
    </>
  )
}

function AccuracySheet({ snap, settings, set, resetDrift }: { snap: Snap; settings: GuideSettings; set: (p: Partial<GuideSettings>) => void; resetDrift: () => void }) {
  const b = snap.base
  const [copied, setCopied] = useState(false)
  const url = `${location.origin}${location.pathname}?base=${settings.pairCode}`
  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: 'Base station', text: `Open on the base phone — pair code ${fmtCode(settings.pairCode)}`, url })
      else {
        await navigator.clipboard.writeText(url)
        setCopied(true)
      }
    } catch {
      /* dismissed */
    }
  }
  const tier = snap.accM == null ? '—' : snap.accM <= 0.3 ? 'survey-grade — an RTK receiver is feeding this phone' : snap.accM <= 1.5 ? 'good — dual-band phone, open sky' : 'standard phone GPS'
  const linkTxt = snap.link === 'open' ? 'connected' : snap.link === 'local' ? 'paired on this device' : snap.link === 'connecting' ? 'connecting…' : 'no internet path'
  let baseTxt: React.ReactNode
  if (b.state === 'off') baseTxt = 'Not hearing a base phone yet.'
  else if (b.state === 'settle') baseTxt = `Base phone found — its GPS is settling (${b.settleLeftS}s).`
  else if (b.state === 'stale') baseTxt = `Base went quiet ${Math.round(b.ageS)}s ago — holding the last correction until it's back.`
  else if (b.learnedS < 60)
    baseTxt = `Linked and correcting at a cautious ${Math.round(b.gain * 100)}%. It tunes itself whenever the bike is parked — ${Math.max(0, 60 - b.learnedS)}s more parked time for a first measurement.`
  else if (b.gain < 0.1) baseTxt = `Measured over ${Math.round(b.learnedS / 60)} min parked: these two phones don't wander together, so the base is being ignored (no harm done).`
  else baseTxt = `Measured over ${Math.round(b.learnedS / 60)} min parked: removing ${Math.round(b.gain * 100)}% of the base's wander cuts this phone's drift by ${Math.max(0, b.cutPct ?? 0)}%.`
  return (
    <>
      <div style={h1}>Accuracy</div>
      <div style={sub}>A phone alone is good to a few metres. These stack on top to get the passes to line up.</div>

      <div style={card}>
        <div style={eyebrow}>1 · THIS PHONE</div>
        <div style={kv}>
          {snap.accM != null ? `±${snap.accM < 1 ? snap.accM.toFixed(2) : snap.accM.toFixed(1)} m` : 'no fix'} · {snap.hz.toFixed(1)} fixes/s · {tier}
          <br />
          Doppler speed + course: {snap.doppler ? 'yes — used to smooth and look ahead' : snap.hasFix ? 'not reported — derived from fixes' : '—'}
        </div>
      </div>

      <div style={{ ...card, borderColor: b.state === 'live' ? C.green : C.hairline }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <div style={{ ...eyebrow, marginBottom: 0 }}>2 · SECOND PHONE AS A BASE STATION</div>
          <Toggle on={settings.baseOn} onClick={() => set({ baseOn: !settings.baseOn })} />
        </div>
        <div style={{ ...para, marginBottom: 9 }}>
          Leave the other phone parked with a clear sky view. It knows it isn't moving, so any movement its GPS reports is error — and it sends that error here to be taken out.
        </div>
        {settings.baseOn && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: C.appBg, borderRadius: 10, padding: '9px 12px', marginBottom: 9 }}>
              <div style={{ flex: 1 }}>
                <div style={{ font: `600 9px ${MONO}`, color: C.muted, letterSpacing: '.08em' }}>PAIR CODE</div>
                <div style={{ font: `700 24px ${MONO}`, letterSpacing: 1 }} data-testid="pair-code">
                  {fmtCode(settings.pairCode)}
                </div>
              </div>
              <div onClick={share} style={{ fontSize: 12, fontWeight: 800, color: C.green, cursor: 'pointer', padding: '6px 4px' }}>
                {copied ? 'Link copied ✓' : 'Send link ›'}
              </div>
              <div onClick={() => set({ pairCode: newPairCode() })} style={{ fontSize: 12, fontWeight: 700, color: C.grey, cursor: 'pointer', padding: '6px 0' }}>
                New
              </div>
            </div>
            <div style={{ ...para, fontSize: 11.5, color: C.grey, marginBottom: 8 }}>
              On the other phone: open this app → <b>GPS base station</b> on the sign-in screen → enter the code. Both phones need internet (Starlink Wi-Fi or mobile data).
            </div>
            <div style={kv}>Link: {linkTxt}</div>
            <div style={{ ...para, fontWeight: 700, color: b.state === 'live' && b.gain >= 0.1 ? C.greenDark : C.body, marginTop: 3 }} data-testid="base-status">
              {baseTxt}
            </div>
          </>
        )}
      </div>

      <div style={card}>
        <div style={eyebrow}>3 · WHAT YOU CAN SEE BEATS WHAT GPS THINKS</div>
        <div style={para}>
          At the start of a pass, line the boom up on the last pass's edge by eye and tap <b>I'm on the line</b>. That zeroes whatever the GPS has drifted since the line was set.
        </div>
        <div style={{ ...kv, marginTop: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Drift fix applied: {snap.driftM.toFixed(1)} m</span>
          {snap.driftM > 0 && (
            <span onClick={resetDrift} style={{ fontFamily: 'inherit', fontWeight: 700, color: C.burntDark, cursor: 'pointer' }}>
              Reset
            </span>
          )}
        </div>
      </div>

      <div style={card}>
        <div style={eyebrow}>4 · THE CENTIMETRE STEP</div>
        <div style={para}>
          A Bluetooth RTK receiver paired to this phone (set as the Android mock-location source) takes corrections over the Starlink and gives 2–3 cm. This screen needs no changes for it — it just reads ±0.02 m above and the passes close up.
        </div>
      </div>
    </>
  )
}

function Num({ label, value, step, min, max, unit: u, onChange }: { label: string; value: number; step: number; min: number; max: number; unit: string; onChange: (v: number) => void }) {
  const clamp = (v: number) => Math.min(max, Math.max(min, +v.toFixed(2)))
  const b: React.CSSProperties = { width: 34, height: 34, borderRadius: 9, border: `1.5px solid ${C.ghostBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, fontWeight: 700, cursor: 'pointer', userSelect: 'none', background: '#fff' }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0' }}>
      <div style={{ flex: 1, fontSize: 12.5, fontWeight: 600 }}>{label}</div>
      <div style={b} onClick={() => onChange(clamp(value - step))}>
        −
      </div>
      <div style={{ font: `700 13px ${MONO}`, minWidth: 68, textAlign: 'center' }}>
        {value.toFixed(step < 1 ? (step < 0.1 ? 2 : 1) : 0)} {u}
      </div>
      <div style={b} onClick={() => onChange(clamp(value + step))}>
        +
      </div>
    </div>
  )
}

function SettingsSheet({
  settings, set, doc, demo, toggleDemo, clearCoverage, area,
}: {
  settings: GuideSettings
  set: (p: Partial<GuideSettings>) => void
  doc: TrialDoc
  demo: boolean
  toggleDemo: () => void
  clearCoverage: () => void
  area: number
}) {
  const setBoom = (id: BoomId, patch: Partial<GuideSettings['booms'][BoomId]>) => set({ booms: { ...settings.booms, [id]: { ...settings.booms[id], ...patch } } })
  const [confirmClear, setConfirmClear] = useState(false)
  return (
    <>
      <div style={h1}>Bike setup</div>
      <div style={sub}>Measure once with a tape. Boom position is from the phone mount, along the bike.</div>
      {(['rear', 'front'] as BoomId[]).map((id) => {
        const b = settings.booms[id]
        return (
          <div key={id} style={card}>
            <div style={eyebrow}>{id === 'rear' ? 'REAR BOOM' : 'FRONT BOOM — SHIELDED'}</div>
            <Num label="Spray width" value={b.widthM} step={0.1} min={0.5} max={36} unit="m" onChange={(v) => setBoom(id, { widthM: v })} />
            <Num
              label={id === 'rear' ? 'Behind the phone' : 'Ahead of the phone'}
              value={Math.abs(b.offsetM)} step={0.1} min={0} max={6} unit="m"
              onChange={(v) => setBoom(id, { offsetM: id === 'rear' ? -v : v })}
            />
            <Num label="Lap between passes" value={b.overlapM} step={0.05} min={0} max={Math.max(0, b.widthM - 0.5)} unit="m" onChange={(v) => setBoom(id, { overlapM: v })} />
          </div>
        )
      })}
      <div style={card}>
        <div style={eyebrow}>SPEED = RATE</div>
        <div style={{ ...para, fontSize: 11.5, color: C.grey, marginBottom: 4 }}>
          Without a rate controller the L/ha goes up as the bike slows. Set the speed the boom was calibrated at; the speed tile turns amber/red when you're off it.
        </div>
        <Num label={`Calibrated speed (${doc.trial.waterRateLPerHa} L/ha)`} value={settings.targetKmh} step={0.5} min={2} max={30} unit="km/h" onChange={(v) => set({ targetKmh: v })} />
        <Num label="Lightbar look-ahead" value={settings.lookaheadS} step={0.2} min={0} max={3} unit="s" onChange={(v) => set({ lookaheadS: v })} />
      </div>
      <div style={card}>
        <div style={eyebrow}>TREATMENT IN THE TANK</div>
        <div style={{ ...para, fontSize: 11.5, color: C.grey, marginBottom: 7 }}>Its plots light up on the map, and the plot badge goes red if the boom is over anything else. Needs the site grid pinned.</div>
        <select
          value={settings.loadedTrt ?? ''}
          onChange={(e) => set({ loadedTrt: e.target.value === '' ? null : Number(e.target.value) })}
          style={{ width: '100%', padding: '10px 8px', borderRadius: 9, border: `1.5px solid ${C.ghostBorder}`, font: `600 12.5px ${MONO}`, background: '#fff', color: C.ink }}
        >
          <option value="">None — blanket spray</option>
          {doc.treatments.map((t) => (
            <option key={t.n} value={t.n}>
              T{t.n} · {t.name}
            </option>
          ))}
        </select>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <div
          onClick={() => {
            if (!confirmClear && area > 0) return setConfirmClear(true)
            clearCoverage()
            setConfirmClear(false)
          }}
          style={{ flex: 1, textAlign: 'center', padding: '11px 0', borderRadius: 11, border: `1.5px solid ${confirmClear ? C.burnt : C.ghostBorder}`, fontSize: 12.5, fontWeight: 700, color: confirmClear ? C.burntDark : C.body, background: '#fff', cursor: 'pointer' }}
        >
          {confirmClear ? 'Tap again to wipe the sprayed map' : 'Clear sprayed map'}
        </div>
        <div onClick={toggleDemo} style={{ flex: 1, textAlign: 'center', padding: '11px 0', borderRadius: 11, border: `1.5px solid ${C.ghostBorder}`, fontSize: 12.5, fontWeight: 700, color: C.body, background: '#fff', cursor: 'pointer' }}>
          {demo ? 'Stop demo drive' : 'Demo drive'}
        </div>
      </div>
    </>
  )
}
