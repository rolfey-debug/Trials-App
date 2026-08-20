import React, { useMemo, useState } from 'react'
import { C, MONO } from '../theme'
import { useApp } from '../store/store'
import { useGps, useFixAveraging } from '../gps/useGps'
import { GhostBtn, PrimaryBtn, PulseDot, ScreenTitle, SuccessCard } from '../components/bits'
import { destination, gridFromCorners } from '../gps/geo'
import type { Corner } from '../store/types'

/** Site setup — GPS corner mapping (design screen 3b). Two corners set the whole
 * grid: A→B = front edge bearing, plot polygons generated from the trial spec. */

// Demo corners (the design's coordinates) used when no live GPS is available,
// so the flow — and the whole locate pipeline — still works on a desktop.
const DEMO_A: Corner = { lat: -34.7085, lng: 146.9241, accuracy: 1.9 }

export function Setup() {
  const { doc, ts, go, mutTrial } = useApp()
  const gps = useGps()
  const [step, setStep] = useState(0)
  const [cornerA, setCornerA] = useState<Corner | null>(null)
  const [cornerB, setCornerB] = useState<Corner | null>(null)
  const averaging = useFixAveraging(step <= 1)

  const acc = averaging.avg?.accuracy ?? gps.accuracy
  const avgLine = gps.live
    ? `Averaging fixes… ±${(averaging.avg?.accuracy ?? gps.accuracy).toFixed(1)} m ${averaging.n > 5 ? 'and tightening' : `· ${averaging.n} fixes`}`
    : 'Averaging fixes… ±2.8 m and tightening (demo — GPS off)'

  const markA = () => {
    setCornerA(gps.live && averaging.avg ? averaging.avg : DEMO_A)
    setStep(1)
  }
  const markB = () => {
    const fallback = destination(cornerA ?? DEMO_A, 287, 16.4)
    setCornerB(gps.live && averaging.avg ? averaging.avg : { ...fallback, accuracy: 2.1 })
    setStep(2)
  }

  const grid = useMemo(() => {
    if (!cornerA || !cornerB) return null
    try {
      return gridFromCorners(cornerA, cornerB, doc)
    } catch {
      return null
    }
  }, [cornerA, cornerB, doc])

  const pin = () => {
    if (!cornerA || !cornerB || !grid) return
    mutTrial({ kind: 'site', label: 'Site grid pinned from 2 corners' }, (t) => {
      t.site.corners = { A: cornerA, B: cornerB }
      t.site.bearingDeg = grid.bearingDeg
      t.site.frontEdgeM = grid.frontEdgeM
      t.site.pinned = true
    })
    setStep(3)
  }

  const card: React.CSSProperties = { background: '#fff', border: `1px solid ${C.hairline}`, borderRadius: 14, padding: 16, marginBottom: 10 }
  const stepEyebrow: React.CSSProperties = { font: `600 10px ${MONO}`, color: C.green, letterSpacing: '.08em', marginBottom: 5 }
  const chip: React.CSSProperties = { font: `500 10px ${MONO}`, background: C.chipBg, padding: '3px 7px', borderRadius: 5, color: C.grey }

  const miniCell = (pid: number): string => {
    const v = doc.cells[pid]
    if (v === 'out') return '#E8B7A6'
    if (typeof v === 'number') return '#BFDCCD'
    return '#E4E5E4'
  }

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '4px 16px 12px', display: 'flex', flexDirection: 'column' }}>
      <ScreenTitle title={`Map the site — ${doc.trial.name.split('—')[0].trim()}`} sub="Two corners set the whole grid · do it once, at pegging" />

      {step === 0 && (
        <>
          <div style={card}>
            <div style={stepEyebrow}>STEP 1 OF 2</div>
            <div style={{ fontSize: 15, fontWeight: 800, lineHeight: 1.35, marginBottom: 6 }}>
              Stand on the front-left corner of Plot 101 — Row 1, Pos 1 — and hold still.
            </div>
            <div style={{ fontSize: 12, color: C.grey, lineHeight: 1.5 }}>
              The phone averages ~30 s of GPS fixes, so the pin lands well inside the ±{Math.round(gps.accuracy)} m a single fix gives you.
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: C.greenTint, borderRadius: 10, padding: '8px 12px', marginBottom: 10 }}>
            <PulseDot size={8} />
            <div style={{ fontSize: 12, fontWeight: 600, color: C.greenDark }}>{avgLine}</div>
          </div>
          <PrimaryBtn onClick={markA} style={{ padding: '15px 0' }}>
            Mark corner A
          </PrimaryBtn>
        </>
      )}

      {step === 1 && cornerA && (
        <>
          <div style={card}>
            <div style={stepEyebrow}>STEP 2 OF 2</div>
            <div style={{ fontSize: 15, fontWeight: 800, lineHeight: 1.35, marginBottom: 6 }}>
              Walk the front edge to the far end — past Pos {doc.trial.grid.positions} — and mark again.
            </div>
            <div style={{ fontSize: 12, color: C.grey, lineHeight: 1.5 }}>
              The A→B line gives the bearing; plot sizes from the trial spec lay out the rest of the grid.
            </div>
          </div>
          <div style={{ background: '#fff', border: `1px solid ${C.hairline}`, borderRadius: 10, padding: '9px 12px', marginBottom: 10, font: `500 11px ${MONO}`, color: C.body }}>
            ✓ Corner A locked · {Math.abs(cornerA.lat).toFixed(4)}° {cornerA.lat < 0 ? 'S' : 'N'}, {Math.abs(cornerA.lng).toFixed(4)}°{' '}
            {cornerA.lng < 0 ? 'W' : 'E'} · ±{cornerA.accuracy.toFixed(1)} m
          </div>
          <PrimaryBtn onClick={markB} style={{ padding: '15px 0' }}>
            Mark corner B
          </PrimaryBtn>
        </>
      )}

      {step === 2 && grid && (
        <>
          <div style={{ ...card, border: `1.5px solid ${C.green}`, padding: '14px 16px' }}>
            <div style={{ font: `600 10px ${MONO}`, color: C.green, letterSpacing: '.08em', marginBottom: 6 }}>GRID LAID FROM 2 CORNERS</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
              <span style={chip}>BEARING {grid.bearingDeg}°</span>
              <span style={chip}>FRONT EDGE {grid.frontEdgeM} M</span>
              <span style={chip}>
                {doc.trial.grid.rows} ROWS × {doc.trial.plot.lengthM} M
              </span>
              <span style={chip}>
                PLOTS {doc.trial.plot.widthM} × {doc.trial.plot.lengthM} M
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 8 }}>
              {Array.from({ length: doc.trial.grid.rows }, (_, ri) => ri + 1).map((r) => (
                <div key={r} style={{ display: 'flex', gap: 2 }}>
                  {Array.from({ length: doc.trial.grid.positions }, (_, pi) => pi + 1).map((p) => (
                    <div key={p} style={{ flex: 1, height: 9, borderRadius: 2, background: miniCell(r * 100 + p) }} />
                  ))}
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11.5, color: C.grey, lineHeight: 1.5 }}>
              Every plot now has a GPS footprint — standing in one brings it up. OUT positions stay off; reserves keep theirs.
            </div>
          </div>
          <PrimaryBtn onClick={pin} style={{ marginBottom: 7 }}>
            Looks right — pin the grid
          </PrimaryBtn>
          <GhostBtn
            onClick={() => {
              setStep(0)
              setCornerA(null)
              setCornerB(null)
            }}
          >
            Re-mark the corners
          </GhostBtn>
        </>
      )}

      {step === 3 && (
        <>
          <SuccessCard
            title="Site mapped"
            sub={`Average fix error ±${(cornerA?.accuracy ?? acc).toFixed(1)} m after averaging · plots surface by GPS from now on · corners saved to the portal`}
          />
          <PrimaryBtn onClick={() => go('home')}>Done</PrimaryBtn>
        </>
      )}
    </div>
  )
}
