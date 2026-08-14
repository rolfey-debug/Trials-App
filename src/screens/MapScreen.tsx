import React, { useState } from 'react'
import { C, MONO } from '../theme'
import { useApp } from '../store/store'
import { ScreenTitle } from '../components/bits'
import { posOf, repOf, rowOf, treatmentByN, measureFlat } from '../lib/trial'

/** Spray map (design screen 2c) — the real layout grid with all cell states,
 * tap → sticky bottom sheet with status + issue logging. */
export function MapScreen() {
  const { st, doc, ts, mutTrial } = useApp()
  const [sel, setSel] = useState<number | null>(null)
  const flat = measureFlat(doc.measures)
  const { rows, positions } = doc.trial.grid
  const issuePids = new Set(ts.issues.map((i) => i.pid))
  const eff = (pid: number) => ts.relabel[pid] ?? doc.cells[pid]

  const cellStyle = (pid: number): [React.CSSProperties, string] => {
    const v = doc.cells[pid]
    const base: React.CSSProperties = {
      flex: 1, height: 26, borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center',
      font: `600 10.5px ${MONO}`, cursor: 'pointer', boxSizing: 'border-box',
    }
    let s: React.CSSProperties = { ...base }
    let t = ''
    if (v === 'out') {
      s.background = C.outFill
      s.color = C.burntDark
      t = '✕'
    } else if (v === 'skip') {
      s.background = 'repeating-linear-gradient(45deg,#ECECEA 0 3px,#E0E0DE 3px 6px)'
      s.color = '#9A9C9A'
    } else if (v === 'spare') {
      s.background = '#ECEDEC'
      s.color = C.disabled
      t = '–'
    } else if (v === 'reserve') {
      s.background = '#fff'
      s.border = `1.5px dashed ${C.disabled}`
      s.color = C.muted
      t = 'R'
    } else if (typeof v === 'number') {
      const e = eff(pid) as number
      t = String(e)
      if (ts.scores[pid]) {
        s.background = C.assessedFill
        s.color = C.greenDark
      } else {
        s.background = '#fff'
        s.border = `1px solid ${C.hairline}`
        s.color = C.ink
      }
      const trt = treatmentByN(doc, e)
      if (trt && !trt.bSpray) s.boxShadow = `inset 0 -2px 0 ${C.green}` // A-only bottom edge
      if (doc.marginalPlots.includes(pid)) s.border = `1.5px dashed ${C.burnt}`
    }
    if (issuePids.has(pid)) s.border = `1.5px solid ${C.burnt}`
    if (sel === pid) {
      s.outline = `2px solid ${C.ink}`
      s.outlineOffset = 1
    }
    return [s, t]
  }

  const legendSw = (s: React.CSSProperties): React.CSSProperties => ({ width: 10, height: 10, borderRadius: 3, boxSizing: 'border-box', ...s })
  const legend: [string, React.CSSProperties][] = [
    ['treated', { background: '#fff', border: `1px solid ${C.ghostBorder}` }],
    ['assessed', { background: C.assessedFill }],
    ['A only', { background: '#fff', border: `1px solid ${C.ghostBorder}`, boxShadow: `inset 0 -2px 0 ${C.green}` }],
    ['issue', { border: `1.5px solid ${C.burnt}` }],
    ['marginal', { border: `1.5px dashed ${C.burnt}` }],
    ['reserve', { border: `1.5px dashed ${C.disabled}` }],
    ['OUT', { background: C.outFill }],
    ['skip/spare', { background: '#ECEDEC' }],
  ]

  // rep band header widths from the trial's bands; row-blocked trials label
  // reps down the side instead (bands are rows, not positions)
  const rowBlocked = doc.trial.blocking === 'row'
  const bands = Object.entries(doc.trial.repBands).sort((a, b) => Number(a[0]) - Number(b[0]))
  const hasReserves = Object.values(doc.cells).includes('reserve')
  /** Row label suffix: the rep band(s) this row sits in ('2/3' where bands share a row). */
  const rowBandLabel = (r: number): string =>
    bands
      .filter(([, band]) => band.includes(r))
      .map(([rep]) => rep)
      .join('/')

  // ---- bottom sheet ------------------------------------------------------
  let sheet: React.ReactNode = null
  if (sel !== null) {
    const v = doc.cells[sel]
    const lines: string[] = []
    let trtLine: React.ReactNode = null
    let canFlag = false
    if (typeof v === 'number') {
      const e = eff(sel) as number
      const trt = treatmentByN(doc, e)
      canFlag = !ts.issues.find((x) => x.pid === sel)
      trtLine = (
        <>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.green }}>
            T{e} · {trt?.name}
          </div>
          <div style={{ fontSize: 11.5, color: C.grey, marginBottom: 6 }}>{trt?.recipe}</div>
        </>
      )
      if (ts.relabel[sel] !== undefined) lines.push(`↺  Relabelled from T${v} on spray day — in the correction log`)
      const tim = doc.trial.timings
      lines.push(tim.A.sprayed ? `✓  App A sprayed — ${tim.A.sprayed.slice(5)}` : `○  App A — ${tim.A.due ?? 'to schedule'}`)
      lines.push(trt?.bSpray ? `○  App B — ${tim.B.due ?? tim.B.sprayed ?? 'to schedule'}` : '—  A only · skip this plot at B')
      const iu = ts.issues.find((x) => x.pid === sel)
      if (iu) lines.push(`${iu.status === 'open' ? '⚑  OPEN ISSUE: ' : '⚑  Issue (fixed): '}${iu.type} — see Spray › Issues`)
      if (ts.excluded.includes(sel)) lines.push('✕  Excluded from analysis — see correction log')
      const s2 = ts.scores[sel]
      if (s2) {
        const parts = ts.activeMeasures.filter((k) => s2.v[k] !== undefined).map((k) => `${s2.v[k]} ${flat[k][1].toLowerCase()}`)
        if (parts.length) lines.push(`✓  Assessed: ${parts.join(' · ')}`)
      }
      if (doc.marginalPlots.includes(sel))
        lines.push(
          hasReserves ? `⚠  Marginal plot — reserve held one across (${sel + 1})` : '⚠  Marginal plot carrying a treatment — flag at assessment',
        )
    } else if (v === 'reserve') lines.push(`Reserve — held as rep-1 substitute for ${sel - 1}. Sits in rep 2’s band; note if used.`)
    else if (v === 'out') lines.push('Ruled right out — do not spray, do not assess.')
    else if (v === 'skip') lines.push('Marginal ground left empty — no treatment. Design is balanced without it.')
    else lines.push('Spare — no treatment assigned. Do not spray.')

    sheet = (
      <div
        style={{
          position: 'sticky', bottom: 0, marginTop: 12, background: '#fff', border: `1px solid ${C.ghostBorder}`,
          borderRadius: 16, padding: '14px 16px', boxShadow: '0 -6px 20px rgba(20,20,20,.09)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div style={{ font: `700 20px ${MONO}` }}>{sel}</div>
          <div onClick={() => setSel(null)} style={{ fontSize: 11, fontWeight: 700, color: C.muted, cursor: 'pointer', padding: '4px 6px' }}>
            CLOSE ✕
          </div>
        </div>
        <div style={{ font: `500 10.5px ${MONO}`, color: C.grey, marginBottom: 7 }}>
          ROW {rowOf(sel)} · POS {posOf(sel)} · REP {repOf(doc, sel)}
        </div>
        {trtLine}
        {lines.map((l, i) => (
          <div key={i} style={{ fontSize: 12, color: C.body, padding: '2px 0' }}>
            {l}
          </div>
        ))}
        {canFlag && (
          <div
            onClick={() =>
              mutTrial({ kind: 'issue', label: `Issue flagged · plot ${sel}` }, (t) => {
                t.issues.push({
                  id: Date.now(),
                  pid: sel,
                  type: 'Flagged in field',
                  txt: 'Logged from the map — add detail back at the ute.',
                  when: `${new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })} · now · ${st.session.name}`,
                  status: 'open',
                })
              })
            }
            style={{
              marginTop: 8, textAlign: 'center', padding: '10px 0', borderRadius: 10,
              border: `1.5px solid ${C.burnt}`, color: C.burnt, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
            }}
          >
            ⚑ Log spray issue on {sel}
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '10px 14px 12px' }}>
      <ScreenTitle
        title={`Spray map — ${doc.trial.name.split('—')[0].trim()}`}
        sub={`${rows} rows × ${positions} positions · ${rowBlocked ? 'reps run as row bands' : 'reps run as vertical bands'}`}
      />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
        {legend.map(([t, sw]) => (
          <span
            key={t}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, color: C.grey,
              background: '#fff', border: `1px solid ${C.hairline}`, borderRadius: 6, padding: '3px 6px',
            }}
          >
            <span style={legendSw(sw)} />
            {t}
          </span>
        ))}
      </div>
      {!rowBlocked && (
        <div style={{ display: 'flex', marginBottom: 3, paddingLeft: 24 }}>
          {bands.map(([rep, band], i) => (
            <div
              key={rep}
              style={{
                flex: band.length, textAlign: 'center', font: `500 9.5px ${MONO}`,
                color: i === 0 ? C.greenDark : C.grey, background: i === 0 ? C.greenTint : C.chipBg,
                borderRadius: 4, padding: '2px 0', marginRight: i < bands.length - 1 ? 2 : 0,
              }}
            >
              REP {rep}
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {Array.from({ length: rows }, (_, ri) => ri + 1).map((r) => (
          <div key={r} style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
            <div style={{ width: rowBlocked ? 38 : 22, font: `500 9.5px ${MONO}`, color: rowBlocked && rowBandLabel(r) === '1' ? C.greenDark : C.muted, flex: 'none' }}>
              R{r}
              {rowBlocked && rowBandLabel(r) && <span style={{ color: C.disabled }}>·{rowBandLabel(r)}</span>}
            </div>
            {Array.from({ length: positions }, (_, pi) => pi + 1).map((p) => {
              const pid = r * 100 + p
              const [s, t] = cellStyle(pid)
              return (
                <div key={pid} style={s} onClick={() => setSel(pid)}>
                  {t}
                </div>
              )
            })}
          </div>
        ))}
      </div>
      {sheet}
    </div>
  )
}
