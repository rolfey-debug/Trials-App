import React, { useEffect, useRef, useState } from 'react'
import { C, MONO } from '../theme'
import { useApp } from '../store/store'
import { PulseDot } from '../components/bits'
import { BaseStation as Base, SETTLE_S, vlen, type Vec } from '../guidance/engine'
import { fmtCode, openLink, type Link, type LinkState } from '../guidance/link'
import { useWakeLock } from '../guidance/wakeLock'

/**
 * GPS base station — the second phone. Parked with a clear view of the sky, it
 * watches its own GPS wander (it knows it isn't moving) and broadcasts it to
 * the bike. Reachable from the sign-in screen: no account needed, just the
 * pair code shown on the bike's phone.
 */

const CODE_KEY = 'tw.guide.baseCode'
const SEND_EVERY_MS = 2000

export function BaseStation() {
  const { go } = useApp()
  const fromUrl = new URLSearchParams(location.search).get('base')?.replace(/\D/g, '').slice(0, 6) ?? ''
  const [code, setCode] = useState(() => fromUrl || localStorage.getItem(CODE_KEY) || '')
  const [running, setRunning] = useState(fromUrl.length === 6)
  const [link, setLink] = useState<LinkState>('down')
  const [gps, setGps] = useState<'starting' | 'live' | 'denied' | 'unavailable'>('starting')
  const [view, setView] = useState({ state: 'settle' as 'settle' | 'locked', left: SETTLE_S, acc: 0, off: { e: 0, n: 0 } as Vec, moved: false, sent: 0, roverAgoS: Infinity })
  const trail = useRef<Vec[]>([])
  const plot = useRef<HTMLCanvasElement>(null)
  useWakeLock(running)

  useEffect(() => {
    if (!running) return
    try {
      localStorage.setItem(CODE_KEY, code)
    } catch {
      /* private mode */
    }
    const base = new Base()
    let lastRover = 0
    let lastSend = 0
    let sent = 0
    trail.current = []
    const ln: Link = openLink(
      code,
      (m: any) => {
        if (m && m.k === 'r') lastRover = Date.now()
      },
      setLink
    )
    if (!('geolocation' in navigator)) {
      setGps('unavailable')
      return () => ln.close()
    }
    const id = navigator.geolocation.watchPosition(
      (p) => {
        const now = Date.now()
        const msg = base.onFix({ lat: p.coords.latitude, lng: p.coords.longitude }, p.coords.accuracy ?? 5, p.coords.speed != null && p.coords.speed >= 0 ? p.coords.speed : null, now)
        if (msg.s === 'locked') trail.current = [...trail.current.slice(-600), base.off]
        else trail.current = []
        // the rover low-passes over ~12 s, so one message every 2 s loses nothing and halves the traffic
        if (now - lastSend >= SEND_EVERY_MS - 200) {
          ln.send(msg)
          lastSend = now
          sent++
        }
        setGps('live')
        setView({ state: base.state, left: msg.left, acc: base.acc, off: base.off, moved: base.moved, sent, roverAgoS: lastRover ? (now - lastRover) / 1000 : Infinity })
      },
      (err) => setGps(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable'),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
    )
    return () => {
      navigator.geolocation.clearWatch(id)
      ln.close()
    }
  }, [running, code])

  // the wander it is measuring, drawn live — this is the error being taken off the bike
  useEffect(() => {
    const cv = plot.current
    if (!cv) return
    const dpr = window.devicePixelRatio || 1
    const w = cv.clientWidth
    const h = cv.clientHeight
    cv.width = Math.round(w * dpr)
    cv.height = Math.round(h * dpr)
    const ctx = cv.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)
    const pts = trail.current
    const span = Math.max(2, ...pts.map((p) => Math.max(Math.abs(p.e), Math.abs(p.n)))) * 1.15
    const ringM = span > 6 ? 5 : span > 2.5 ? 2 : 1
    const sc = Math.min(w, h) / 2 / span
    const cx = w / 2
    const cy = h / 2
    ctx.strokeStyle = C.hairline
    ctx.lineWidth = 1
    for (let r = ringM; r <= span; r += ringM) {
      ctx.beginPath()
      ctx.arc(cx, cy, r * sc, 0, Math.PI * 2)
      ctx.stroke()
    }
    ctx.beginPath()
    ctx.moveTo(cx - span * sc, cy)
    ctx.lineTo(cx + span * sc, cy)
    ctx.moveTo(cx, cy - span * sc)
    ctx.lineTo(cx, cy + span * sc)
    ctx.stroke()
    ctx.fillStyle = C.muted
    ctx.font = `500 9.5px ${MONO}`
    ctx.fillText(`${ringM} m`, cx + ringM * sc + 3, cy - 3)
    if (pts.length) {
      ctx.strokeStyle = 'rgba(0,119,73,.45)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      pts.forEach((p, i) => (i ? ctx.lineTo(cx + p.e * sc, cy - p.n * sc) : ctx.moveTo(cx + p.e * sc, cy - p.n * sc)))
      ctx.stroke()
      const p = pts[pts.length - 1]
      ctx.fillStyle = C.green
      ctx.beginPath()
      ctx.arc(cx + p.e * sc, cy - p.n * sc, 5, 0, Math.PI * 2)
      ctx.fill()
    }
  }, [view])

  const card: React.CSSProperties = { background: '#fff', border: `1px solid ${C.hairline}`, borderRadius: 14, padding: 16, marginBottom: 10 }
  const eyebrow: React.CSSProperties = { font: `600 10px ${MONO}`, color: C.green, letterSpacing: '.08em', marginBottom: 5 }
  const roverOn = view.roverAgoS < 15
  const linkOk = link === 'open' || link === 'local'

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '6px 16px 20px', display: 'flex', flexDirection: 'column' }}>
      <div onClick={() => go('home')} style={{ fontSize: 13, fontWeight: 700, color: C.green, cursor: 'pointer', padding: '0 0 8px' }}>
        ‹ Back
      </div>
      <div style={{ fontSize: 19, fontWeight: 800, marginBottom: 1 }}>GPS base station</div>
      <div style={{ fontSize: 11.5, color: C.grey, marginBottom: 12 }}>This phone stays put and tells the bike how far GPS is wandering</div>

      {!running ? (
        <>
          <div style={card}>
            <div style={eyebrow}>PAIR CODE FROM THE BIKE'S PHONE</div>
            <div style={{ fontSize: 12, color: C.grey, lineHeight: 1.5, marginBottom: 10 }}>On the bike: Spray → Bike guidance → tap the GPS / BASE chips up top. The six-digit code is there.</div>
            <input
              value={fmtCode(code)}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              placeholder="000 000"
              aria-label="Pair code"
              style={{ font: `700 30px ${MONO}`, letterSpacing: 3, textAlign: 'center', padding: '12px 0', background: C.appBg, borderRadius: 11, border: 'none', outline: 'none', width: '100%', boxSizing: 'border-box', color: C.ink }}
            />
          </div>
          <div
            onClick={() => code.length === 6 && setRunning(true)}
            style={{ background: code.length === 6 ? C.green : C.disabled, color: '#fff', borderRadius: 12, padding: '15px 0', textAlign: 'center', fontSize: 15, fontWeight: 800, cursor: 'pointer', marginBottom: 12 }}
          >
            Start base station
          </div>
          <div style={{ ...card, fontSize: 12, color: C.body, lineHeight: 1.6 }}>
            <div style={eyebrow}>SET IT UP WELL</div>
            • Flat on its back, up high with open sky — ute roof, strainer post, top of the Starlink box. Not on the dash, not under a tree.
            <br />• On charge, on the Starlink Wi-Fi (or mobile data).
            <br />• Leave this screen open. It keeps the display awake — a phone that sleeps stops sending.
            <br />• Don't move it mid-job. If it is bumped it notices and re-anchors by itself.
          </div>
        </>
      ) : (
        <>
          <div style={{ ...card, border: `1.5px solid ${view.state === 'locked' && linkOk ? C.green : C.hairline}`, textAlign: 'center' }}>
            {gps !== 'live' ? (
              <>
                <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 4 }}>{gps === 'denied' ? 'Location is blocked' : gps === 'unavailable' ? 'No GPS fix' : 'Waiting for GPS…'}</div>
                <div style={{ fontSize: 12, color: C.grey, lineHeight: 1.5 }}>{gps === 'denied' ? 'Allow location for this site in the browser settings and start again.' : 'Needs a clear view of the sky.'}</div>
              </>
            ) : view.state === 'settle' ? (
              <>
                <div style={{ font: `700 44px ${MONO}`, color: C.burnt, lineHeight: 1 }}>{view.left}</div>
                <div style={{ fontSize: 15, fontWeight: 800, margin: '6px 0 2px' }}>{view.moved ? 'Moved — settling again' : 'Settling — hands off'}</div>
                <div style={{ fontSize: 12, color: C.grey }}>Letting the GPS steady before it drops anchor</div>
              </>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 4 }}>
                  <PulseDot size={10} />
                  <div style={{ fontSize: 19, fontWeight: 800, color: C.greenDark }} data-testid="base-state">
                    Anchored · broadcasting
                  </div>
                </div>
                <div style={{ font: `500 11.5px ${MONO}`, color: C.body }}>
                  GPS reads {vlen(view.off).toFixed(1)} m off the anchor right now · ±{view.acc.toFixed(0)} m
                </div>
              </>
            )}
          </div>

          <div style={card}>
            <div style={eyebrow}>GPS WANDER SEEN FROM HERE</div>
            <canvas ref={plot} style={{ width: '100%', height: 190, display: 'block' }} />
            <div style={{ fontSize: 11.5, color: C.grey, lineHeight: 1.5, marginTop: 6 }}>This phone hasn't moved — the trace is pure GPS error. The bike subtracts the part of it both phones share.</div>
          </div>

          <div style={{ ...card, font: `500 11.5px ${MONO}`, color: C.body, lineHeight: 1.8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Pair code</span>
              <b>{fmtCode(code)}</b>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Link</span>
              <b style={{ color: linkOk ? C.greenDark : C.burntDark }}>{link === 'open' ? 'online' : link === 'local' ? 'same device' : link === 'connecting' ? 'connecting…' : 'no internet'}</b>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Bike</span>
              <b style={{ color: roverOn ? C.greenDark : C.grey }} data-testid="rover-state">
                {roverOn ? 'listening ✓' : 'not heard yet'}
              </b>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Updates sent</span>
              <b>{view.sent}</b>
            </div>
          </div>

          <div
            onClick={() => setRunning(false)}
            style={{ textAlign: 'center', padding: '12px 0', borderRadius: 12, border: `1.5px solid ${C.ghostBorder}`, fontSize: 13, fontWeight: 700, color: C.body, background: '#fff', cursor: 'pointer' }}
          >
            Stop base station
          </div>
        </>
      )}
    </div>
  )
}
