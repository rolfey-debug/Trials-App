import React from 'react'
import { C, MONO } from '../theme'
import { Eyebrow, GpsPill } from '../components/bits'
import { useApp } from '../store/store'
import { useGps } from '../gps/useGps'
import { assessmentOrder } from '../lib/trial'
import { distToSiteM, gridFromCorners } from '../gps/geo'

export function Home() {
  const { st, doc, ts, go, mut } = useApp()
  const gps = useGps()
  const order = assessmentOrder(doc)
  const scored = Object.keys(ts.scores).length
  const openCount = ts.issues.filter((i) => i.status === 'open').length
  const pending = st.syncQueue.filter((q) => !q.synced)
  const pendA = pending.filter((q) => q.kind === 'assessment').length
  const pendP = pending.filter((q) => q.kind === 'photo').length

  // nearest-trial detection from site corner geofences (when the grid is pinned + live fix)
  let eyebrow = "NEAREST · 40 M — YOU'RE STANDING IN IT"
  if (ts.site.pinned && ts.site.corners && gps.fix) {
    const grid = gridFromCorners(ts.site.corners.A, ts.site.corners.B, doc)
    const d = Math.round(distToSiteM(gps.fix, grid))
    eyebrow = d <= 15 ? `NEAREST · ${d} M — YOU'RE STANDING IN IT` : d < 2000 ? `NEAREST · ${d} M` : `NEAREST · ${(d / 1000).toFixed(1)} KM`
  } else if (!gps.live) {
    eyebrow = 'NEAREST · GPS OFF — LAST KNOWN SITE'
  }

  const today = new Date().toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' }).replace(',', '')
  const syncLine = pending.length
    ? `${pendA} assessment${pendA === 1 ? '' : 's'} + ${pendP} photo${pendP === 1 ? '' : 's'} waiting for signal`
    : `All synced — queue clear${st.lastSyncTs ? ` (${new Date(st.lastSyncTs).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })})` : ''}`

  const otherDocs = Object.values(st.trials).filter((t) => t.id !== st.activeTrialId)
  const fmtDay = (iso: string) =>
    new Date(iso + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
  // Spray progress: the fixture date, or the ticks made on the phone
  const sprCount = Object.keys(ts.sprDone).length
  const sprTotal = doc.treatments.length
  const aSprayed = doc.trial.timings.A.sprayed
  const aDone = !!aSprayed || sprCount >= sprTotal
  const aDoneLabel = aSprayed ? `App A sprayed — ${fmtDay(aSprayed)}` : `App A sprayed — all ${sprTotal} treatments`

  const statusRow = (icon: React.ReactNode, body: React.ReactNode) => (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      {icon}
      <span>{body}</span>
    </div>
  )

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '10px 16px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 23, fontWeight: 800, letterSpacing: -0.2 }}>
            <span style={{ color: C.green }}>AGnVET</span> Trials
          </div>
          <div style={{ fontSize: 12, color: C.grey }}>
            {today} · {doc.trial.season} season
          </div>
        </div>
        <GpsPill text={`GPS ±${gps.accuracy} m`} />
      </div>

      <div style={{ background: '#fff', border: `1.5px solid ${C.green}`, borderRadius: 16, padding: '16px 16px 14px', marginBottom: 10 }}>
        <div style={{ font: `600 10px ${MONO}`, color: C.green, letterSpacing: '.08em', marginBottom: 4 }}>{eyebrow}</div>
        <div style={{ fontSize: 19, fontWeight: 800, lineHeight: 1.2 }}>{doc.trial.name}</div>
        <div style={{ fontSize: 12, color: C.grey, margin: '3px 0 10px' }}>
          {doc.treatments.length} treatments · {doc.trial.reps} reps · {order.length} plots · {doc.trial.plot.widthM} × {doc.trial.plot.lengthM} m ·{' '}
          {doc.trial.waterRateLPerHa} L/ha
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5, marginBottom: 12 }}>
          {aDone
            ? statusRow(
                <span style={{ width: 16, height: 16, borderRadius: '50%', background: C.green, color: '#fff', fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>✓</span>,
                <>
                  {aDoneLabel} ·{' '}
                  <span style={{ color: openCount ? C.burnt : C.greenDark, fontWeight: 700 }}>
                    {openCount ? `${openCount} open issue${openCount === 1 ? '' : 's'}` : 'issues clear'}
                  </span>
                </>
              )
            : sprCount > 0
              ? statusRow(
                  <span style={{ width: 16, height: 16, borderRadius: '50%', background: C.burnt, color: '#fff', fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, flex: 'none' }}>!</span>,
                  <>App A underway — {sprCount} of {sprTotal} treatments sprayed</>
                )
              : statusRow(
                  <span style={{ width: 16, height: 16, borderRadius: '50%', background: C.burnt, color: '#fff', fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, flex: 'none' }}>!</span>,
                  <>App A — {doc.trial.timings.A.due ?? 'due'} · mix plan ready</>
                )}
          {aDone &&
            statusRow(
              <span style={{ width: 16, height: 16, borderRadius: '50%', background: C.burnt, color: '#fff', fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, flex: 'none' }}>!</span>,
              'Assessment 1 — open now (14–21 DAA)'
            )}
          {statusRow(
            <span style={{ width: 16, height: 16, borderRadius: '50%', border: `1.5px solid ${C.disabled}`, boxSizing: 'border-box', flex: 'none' }} />,
            <>App B — {doc.trial.timings.B.due ?? 'to schedule'}</>
          )}
        </div>
        <div
          onClick={() => go('assess')}
          style={{ background: C.green, color: '#fff', borderRadius: 12, padding: 14, textAlign: 'center', fontSize: 15, fontWeight: 700, cursor: 'pointer', marginBottom: 10 }}
        >
          Resume Assessment 1 — {scored} of {order.length} done
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 7, fontSize: 12, fontWeight: 700, color: C.green }}>
          <span onClick={() => go('site')} style={{ cursor: 'pointer', padding: '4px 0' }}>Site details</span>
          <span style={{ color: C.ghostBorder }}>·</span>
          <span onClick={() => go('photos')} style={{ cursor: 'pointer', padding: '4px 0' }}>Photos</span>
          <span style={{ color: C.ghostBorder }}>·</span>
          <span onClick={() => go('reports')} style={{ cursor: 'pointer', padding: '4px 0' }}>Reports</span>
          <span style={{ color: C.ghostBorder }}>·</span>
          <span onClick={() => go('team')} style={{ cursor: 'pointer', padding: '4px 0' }}>Team</span>
        </div>
      </div>

      <div
        onClick={() => go('storage')}
        style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: `1px solid ${C.hairline}`, borderRadius: 11, padding: '9px 13px', marginBottom: 14, cursor: 'pointer' }}
      >
        <div style={{ width: 7, height: 7, borderRadius: '50%', background: pending.length ? C.burnt : C.green, flex: 'none' }} />
        <div style={{ flex: 1, fontSize: 11.5, color: C.body }}>{syncLine}</div>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.green }}>Sync ›</div>
      </div>

      <Eyebrow style={{ margin: '0 0 8px' }}>ALL TRIALS</Eyebrow>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
        {otherDocs.map((t) => (
          <div
            key={t.id}
            onClick={() => mut(null, (d) => void (d.activeTrialId = t.id))}
            style={{ background: '#fff', border: `1px solid ${C.hairline}`, borderRadius: 13, padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
          >
            <div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{t.trial.name}</div>
              <div style={{ fontSize: 11.5, color: C.grey }}>
                {t.treatments.length} trts · {t.trial.reps} reps · {t.trial.sourceDocument}
              </div>
            </div>
            <span style={{ font: `500 10.5px ${MONO}`, background: C.greenTint, color: C.greenDark, padding: '4px 8px', borderRadius: 6 }}>OPEN</span>
          </div>
        ))}
        {st.otherTrials.map((t) => (
          <div
            key={t.name}
            style={{ background: '#fff', border: `1px solid ${C.hairline}`, borderRadius: 13, padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
          >
            <div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{t.name}</div>
              <div style={{ fontSize: 11.5, color: C.grey }}>{t.sub}</div>
            </div>
            <span
              style={{
                font: `500 10.5px ${MONO}`,
                background: t.chipKind === 'green' ? C.greenTint : C.chipBg,
                color: t.chipKind === 'green' ? C.greenDark : C.grey,
                padding: '4px 8px',
                borderRadius: 6,
              }}
            >
              {t.chip}
            </span>
          </div>
        ))}
      </div>
      <div
        onClick={() => go('add')}
        style={{ border: `1.5px dashed ${C.disabled}`, borderRadius: 13, padding: 12, textAlign: 'center', fontSize: 13, fontWeight: 700, color: C.green, cursor: 'pointer' }}
      >
        ＋ Add a trial — import protocol, map or ARM file
      </div>
    </div>
  )
}
