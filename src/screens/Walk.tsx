import React, { useMemo } from 'react'
import { C, MONO } from '../theme'
import { useApp } from '../store/store'
import { useGps } from '../gps/useGps'
import { PulseDot, ScreenTitle } from '../components/bits'
import { fieldDayStops, posOf, rowOf, treatmentByN } from '../lib/trial'
import { SAMPLE_SEV } from '../lib/results'
import { gridFromCorners, locate } from '../gps/geo'

/** Field-day walk (design screen 2g) — Rep 1 in treatment order across the front. */
export function Walk() {
  const { doc, ts, mutTrial } = useApp()
  const gps = useGps()
  const stops = useMemo(() => fieldDayStops(doc), [doc])
  const wi = Math.min(ts.walkI, stops.length - 1)
  const pid = stops[wi]
  const trtN = (ts.relabel[pid] ?? doc.cells[pid]) as number
  const t = treatmentByN(doc, trtN)
  const sev = SAMPLE_SEV[trtN - 1] ?? 15
  const untreated = SAMPLE_SEV[0]
  const ctl = Math.round(((untreated - sev) / untreated) * 100)

  // live GPS check when the grid is pinned; otherwise the stop's own position
  let gpsTxt = `You're at Row ${rowOf(pid)} · Pos ${posOf(pid)}  ✓`
  if (ts.site.pinned && ts.site.corners && gps.fix) {
    const grid = gridFromCorners(ts.site.corners.A, ts.site.corners.B, doc)
    const hit = locate(gps.fix, grid)
    if (hit.row) gpsTxt = `You're at Row ${hit.row} · Pos ${hit.pos}${hit.pid === pid ? '  ✓' : ` — stop ${wi + 1} is Row ${rowOf(pid)}`}`
  }

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '10px 16px 12px', display: 'flex', flexDirection: 'column' }}>
      <ScreenTitle title="Field day — Rep 1 walk" sub="Rep 1 runs the treatment list in order across the front" />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: C.greenTint, borderRadius: 10, padding: '8px 12px', marginBottom: 10, marginTop: -2 }}>
        <PulseDot size={8} />
        <div style={{ fontSize: 12, fontWeight: 600, color: C.greenDark }}>{gpsTxt}</div>
      </div>

      <div style={{ background: '#fff', border: `1px solid ${C.hairline}`, borderRadius: 16, padding: '18px 18px 16px', marginBottom: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
          <span style={{ font: `600 10px ${MONO}`, color: C.muted, letterSpacing: '.08em' }}>
            STOP {wi + 1} OF {stops.length}
          </span>
          <span style={{ font: `700 15px ${MONO}`, color: C.green }}>{pid}</span>
        </div>
        <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.15, letterSpacing: -0.3 }}>{t?.name}</div>
        <div style={{ fontSize: 12.5, color: C.grey, margin: '4px 0 14px' }}>{t?.recipe}</div>
        <div style={{ font: `600 10px ${MONO}`, color: C.muted, letterSpacing: '.08em', marginBottom: 7 }}>
          SEVERITY — ASSESSMENT 1 · SAMPLE DATA
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, marginBottom: 3 }}>
              <span style={{ fontWeight: 700 }}>This treatment</span>
              <span style={{ font: `600 12px ${MONO}` }}>{sev}%</span>
            </div>
            <div style={{ height: 10, background: C.chipBg, borderRadius: 5, overflow: 'hidden' }}>
              <div style={{ width: `${Math.round((sev / untreated) * 100)}%`, height: '100%', background: C.green }} />
            </div>
          </div>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, marginBottom: 3, color: C.grey }}>
              <span>Untreated check</span>
              <span style={{ font: `600 12px ${MONO}` }}>{untreated}%</span>
            </div>
            <div style={{ height: 10, background: C.chipBg, borderRadius: 5, overflow: 'hidden' }}>
              <div style={{ width: '100%', height: '100%', background: C.disabled }} />
            </div>
          </div>
        </div>
        <div style={{ marginTop: 12, background: C.greenTint, borderRadius: 9, padding: '8px 11px', fontSize: 13, fontWeight: 700, color: C.greenDark }}>
          {trtN === 1 ? 'This is the check — everything compares back here' : `${ctl}% control vs untreated (mean of ${doc.trial.reps} reps)`}
        </div>
      </div>

      <div style={{ fontSize: 11, color: C.muted, margin: '0 2px 10px' }}>Reps 2–3 are randomised — quote treatment means, not this plot.</div>

      <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
        <div
          onClick={() => mutTrial(null, (t2) => void (t2.walkI = Math.max(0, wi - 1)))}
          style={{ flex: 1, textAlign: 'center', padding: '15px 0', borderRadius: 12, border: `1.5px solid ${C.ghostBorder}`, fontSize: 14, fontWeight: 700, color: C.body, cursor: 'pointer', background: '#fff' }}
        >
          ← Prev
        </div>
        <div
          onClick={() => mutTrial(null, (t2) => void (t2.walkI = Math.min(stops.length - 1, wi + 1)))}
          style={{ flex: 1.4, textAlign: 'center', padding: '15px 0', borderRadius: 12, background: C.green, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
        >
          {wi < stops.length - 1 ? 'Next plot →' : 'End of walk'}
        </div>
      </div>
    </div>
  )
}
