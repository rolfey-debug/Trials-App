import React from 'react'
import { C, MONO } from '../theme'
import { useApp } from '../store/store'
import { ScreenTitle } from '../components/bits'
import { mixNote, plotsByTreatment, treatmentByN } from '../lib/trial'
import type { Issue } from '../store/types'

/** Spray day (design screens 2d + 2e) — Mix / Order / Record / Issues. */
export function Spray() {
  const { st, doc, ts, mutTrial, mut } = useApp()
  const tab = st.sprayTab
  const openCount = ts.issues.filter((i) => i.status === 'open').length
  const pbt = plotsByTreatment(doc)

  const setTab = (t: typeof tab) => mut(null, (d) => void (d.sprayTab = t))

  const segSt = (act: boolean): React.CSSProperties => ({
    flex: 1, textAlign: 'center', padding: '7px 0', borderRadius: 8, fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
    ...(act ? { background: '#fff', color: C.ink, boxShadow: '0 1px 3px rgba(20,20,20,.12)' } : { color: C.grey }),
  })
  const rowSt = (done: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 10, background: done ? '#F7F8F7' : '#fff',
    border: `1px solid ${C.hairline}`, borderRadius: 11, padding: '9px 12px', cursor: 'pointer',
    opacity: done ? 0.62 : 1,
  })
  const ckSt = (done: boolean): React.CSSProperties => ({
    width: 22, height: 22, borderRadius: '50%', flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 11, boxSizing: 'border-box',
    ...(done ? { background: C.green, color: '#fff' } : { border: `1.5px solid ${C.disabled}`, color: 'transparent' }),
  })

  const resolveIssue = (id: number, fix: string, corr: string, relabelPid?: number, relabelTrt?: number, exclude?: number) =>
    mutTrial({ kind: 'issue', label: `Issue #${id} resolved` }, (t) => {
      t.issues = t.issues.map((i) => (i.id === id ? { ...i, status: 'fixed' as const, fix, corr } : i))
      if (relabelPid && relabelTrt) t.relabel[relabelPid] = relabelTrt
      if (exclude) t.excluded = [...t.excluded, exclude]
    })

  const fixBtn = (primary: boolean): React.CSSProperties => ({
    textAlign: 'center', padding: '10px 0', borderRadius: 10, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
    ...(primary ? { background: C.green, color: '#fff' } : { border: `1.5px solid ${C.ghostBorder}`, color: C.body, background: '#fff' }),
  })

  const issueCard = (iu: Issue) => {
    const open = iu.status === 'open'
    const fixes: { t: string; primary: boolean; on: () => void }[] = []
    if (open && iu.wb) {
      const applied = iu.wb.applied
      const intended = iu.wb.intended
      const appliedName = treatmentByN(doc, applied)?.name ?? `T${applied}`
      fixes.push({
        t: `Relabel ${iu.pid} as T${applied} — as applied`,
        primary: true,
        on: () =>
          resolveIssue(
            iu.id,
            `Relabelled T${intended} → T${applied} as applied · T${intended} runs n=2`,
            `${iu.pid} · was T${intended} → now T${applied} as applied (${appliedName}) · issue #${iu.id}`,
            iu.pid,
            applied
          ),
      })
      fixes.push({
        t: `Exclude ${iu.pid} from analysis`,
        primary: false,
        on: () =>
          resolveIssue(iu.id, `Plot excluded from analysis · T${intended} runs n=2`, `${iu.pid} · excluded from analysis · issue #${iu.id}`, undefined, undefined, iu.pid),
      })
    } else if (open) {
      fixes.push({
        t: 'Mark resolved',
        primary: false,
        on: () => resolveIssue(iu.id, 'Resolved in field', `${iu.pid} · resolved · field note`),
      })
    }
    return (
      <div key={iu.id} style={{ background: '#fff', border: `1px solid ${C.hairline}`, borderRadius: 12, padding: '11px 13px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
            <span style={{ font: `700 14px ${MONO}` }}>{iu.pid}</span>
            <span style={{ fontSize: 12.5, fontWeight: 800, color: C.burnt }}>{iu.type}</span>
          </div>
          <span
            style={{
              font: `700 9px ${MONO}`, padding: '3px 7px', borderRadius: 5,
              ...(open ? { background: C.burnt, color: '#fff' } : { background: C.greenTint, color: C.greenDark }),
            }}
          >
            {open ? 'OPEN' : 'FIXED'}
          </span>
        </div>
        <div style={{ fontSize: 12, color: C.body, lineHeight: 1.45 }}>{iu.txt}</div>
        <div style={{ font: `400 10px ${MONO}`, color: C.muted, marginTop: 3 }}>{iu.when}</div>
        {open && fixes.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 9 }}>
            {fixes.map((f) => (
              <div key={f.t} style={fixBtn(f.primary)} onClick={f.on}>
                {f.t}
              </div>
            ))}
            <div style={{ fontSize: 10.5, color: C.muted }}>Either way it writes to the correction log.</div>
          </div>
        )}
        {iu.status === 'fixed' && iu.fix && (
          <div style={{ marginTop: 8, background: C.greenTint, borderRadius: 8, padding: '7px 10px', fontSize: 11.5, fontWeight: 700, color: C.greenDark }}>
            ✓ {iu.fix}
          </div>
        )}
      </div>
    )
  }

  const mixCount = Object.keys(ts.mixDone).length
  const corrLines = ts.issues.filter((i) => i.corr).map((i) => i.corr!)
  const recKeys = ['Date', 'Start', 'Finish', 'Operator', 'Temp', 'RH', 'Wind', 'Nozzle', 'Pressure', 'Speed']

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '10px 14px 12px' }}>
      <ScreenTitle
        title="Spray day — App A"
        sub={`6 Aug ${doc.trial.season} · hand boom 2 m · ${doc.trial.waterRateLPerHa} L/ha · ${doc.trial.sprayVolumePerPlotMl} mL/plot`}
      />
      <div style={{ display: 'flex', background: '#E0E1E0', borderRadius: 10, padding: 3, marginBottom: 12 }}>
        {(
          [
            ['mix', 'Mix'],
            ['order', 'Order'],
            ['rec', 'Record'],
            ['issues', openCount ? `Issues · ${openCount}` : 'Issues'],
          ] as const
        ).map(([k, lbl]) => (
          <div key={k} style={segSt(tab === k)} onClick={() => setTab(k)}>
            {lbl}
          </div>
        ))}
      </div>

      {tab === 'mix' && (
        <>
          <div style={{ background: C.greenTint, borderRadius: 10, padding: '9px 12px', fontSize: 11.5, color: C.greenDark, marginBottom: 10 }}>
            <b>{doc.trial.batchVolumeL} L bottle per treatment</b> · covers {doc.trial.reps} reps + overage. Adjuvant last, agitate. Under 2 mL —
            use a syringe.
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', margin: '0 2px 7px' }}>
            <span style={{ font: `600 10.5px ${MONO}`, color: C.muted, letterSpacing: '.08em' }}>MIX CHECKLIST</span>
            <span style={{ font: `600 11px ${MONO}`, color: C.green }}>
              {mixCount} / {doc.treatments.length} MIXED
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {doc.treatments.map((t) => {
              const done = !!ts.mixDone[t.n]
              return (
                <div
                  key={t.n}
                  style={rowSt(done)}
                  onClick={() =>
                    mutTrial({ kind: 'spray', label: `Mix T${t.n} ${done ? 'unchecked' : 'checked'}` }, (s) => {
                      if (s.mixDone[t.n]) delete s.mixDone[t.n]
                      else s.mixDone[t.n] = `${new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })} · ${st.session.name}`
                    })
                  }
                >
                  <div style={ckSt(done)}>✓</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{t.name}</div>
                    <div style={{ fontSize: 11, color: C.grey }}>{mixNote(t)}</div>
                  </div>
                  <div style={{ font: `500 10px ${MONO}`, color: C.muted }}>T{t.n}</div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {tab === 'order' && (
        <>
          <div style={{ background: C.greenTint, borderRadius: 10, padding: '9px 12px', fontSize: 11.5, color: C.greenDark, marginBottom: 10 }}>
            <b>Water first</b> — clean boom for T1, then work down. Each bottle sprays its {doc.trial.reps} plots before the next mix.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {doc.treatments.map((t) => {
              const done = !!ts.sprDone[t.n]
              return (
                <div
                  key={t.n}
                  style={rowSt(done)}
                  onClick={() =>
                    mutTrial({ kind: 'spray', label: `Sprayed T${t.n} ${done ? 'unchecked' : 'checked'}` }, (s) => {
                      if (s.sprDone[t.n]) delete s.sprDone[t.n]
                      else s.sprDone[t.n] = `${new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })} · ${st.session.name}`
                    })
                  }
                >
                  <div style={ckSt(done)}>✓</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>
                      T{t.n} · {t.name}
                    </div>
                    <div style={{ font: `500 11px ${MONO}`, color: C.grey }}>{(pbt[t.n] ?? t.plots).join(' · ')}</div>
                  </div>
                  {!t.bSpray && (
                    <span style={{ font: `600 9px ${MONO}`, background: C.chipBg, color: C.grey, padding: '3px 6px', borderRadius: 5, flex: 'none' }}>
                      A ONLY
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}

      {tab === 'rec' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 10 }}>
            {recKeys.map((k) => (
              <div key={k} style={{ background: '#fff', border: `1px solid ${C.hairline}`, borderRadius: 10, padding: '9px 12px' }}>
                <div style={{ fontSize: 10, color: C.muted, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase' }}>{k}</div>
                <input
                  value={ts.conditions[k] ?? ''}
                  placeholder="—"
                  onChange={(e) => mutTrial({ kind: 'spray', label: `Conditions · ${k}` }, (s) => void (s.conditions[k] = e.target.value))}
                  style={{ font: `500 14px ${MONO}`, marginTop: 2, border: 'none', outline: 'none', width: '100%', background: 'transparent', padding: 0, color: C.ink }}
                />
              </div>
            ))}
          </div>
          <div style={{ background: '#fff', border: `1px solid ${C.hairline}`, borderRadius: 10, padding: '10px 12px', fontSize: 12, color: C.body }}>
            <b style={{ fontSize: 11, color: C.muted, letterSpacing: '.04em' }}>NOTES</b>
            <br />
            Conditions auto-filled from phone GPS + BOM at start of run. App B gets its own record at GS39.
          </div>
        </>
      )}

      {tab === 'issues' && (
        <>
          <div style={{ background: C.burntTint, borderRadius: 10, padding: '9px 12px', fontSize: 11.5, color: C.burntDark, marginBottom: 10 }}>
            Anything off-plan gets logged here on the spot — and lands in the <b>correction log</b> so the analysis stays honest.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>{ts.issues.map(issueCard)}</div>
          {corrLines.length > 0 && (
            <>
              <div style={{ font: `600 10.5px ${MONO}`, color: C.muted, letterSpacing: '.08em', margin: '0 2px 6px' }}>CORRECTION LOG</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
                {corrLines.map((l, i) => (
                  <div key={i} style={{ background: '#fff', border: `1px solid ${C.hairline}`, borderRadius: 9, padding: '8px 11px', font: `500 11px ${MONO}`, color: C.body }}>
                    {l}
                  </div>
                ))}
              </div>
            </>
          )}
          <div style={{ fontSize: 11, color: C.muted, margin: '0 2px' }}>
            To flag a new one: open the <b>Map</b>, tap the plot, ⚑ Log spray issue.
          </div>
        </>
      )}
    </div>
  )
}
