import React, { useState } from 'react'
import { C, MONO } from '../theme'
import { useApp } from '../store/store'
import { Flash, ScreenTitle, Toggle } from '../components/bits'
import { rankedControl } from '../lib/results'
import { treatmentByN } from '../lib/trial'
import { buildAssessmentWorkbook } from '../exports/assessmentExport'
import { downloadBlob } from '../exports/xlsxWrite'
import { printClientReport, printFieldDayHandout } from '../exports/printouts'

/** Reports & export (design screen 3g). */
export function Reports() {
  const { st, doc, ts, mut } = useApp()
  const [pdfFlash, setPdfFlash] = useState('')
  const [xlFlash, setXlFlash] = useState('')
  const { bars, live } = rankedControl(doc, ts)
  const blind = st.repBlind

  const exportExcel = () => {
    const bytes = buildAssessmentWorkbook(doc, ts, { blindCodes: blind })
    const name = `${doc.trial.name.replace(/[^\w]+/g, '_')}_Assessment.xlsx`
    downloadBlob(bytes, name, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    setXlFlash(`✓ ${name} saved — one tab per assessment + correction log`)
  }

  const card: React.CSSProperties = { background: '#fff', border: `1px solid ${C.hairline}`, borderRadius: 13, padding: '13px 15px' }

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '4px 16px 12px' }}>
      <ScreenTitle title={`Reports & export — ${doc.trial.name.split('—')[0].trim()}`} sub="Built from live data the moment you sync" />

      <div
        onClick={() => mut({ kind: 'settings', label: 'Blind codes toggled' }, (d) => void (d.repBlind = !d.repBlind))}
        style={{ ...card, borderRadius: 12, padding: '10px 13px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', marginBottom: 12 }}
      >
        <div>
          <div style={{ fontSize: 13, fontWeight: 700 }}>Blind codes on rep copies</div>
          <div style={{ fontSize: 11, color: C.grey }}>T-numbers instead of product names</div>
        </div>
        <Toggle on={blind} />
      </div>

      <div style={{ ...card, marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
          <span style={{ font: `600 10px ${MONO}`, color: C.muted, letterSpacing: '.08em' }}>RANKED CONTROL — PREVIEW</span>
          <span style={{ font: `600 9px ${MONO}`, background: live ? C.greenTint : C.chipBg, color: live ? C.greenDark : C.grey, padding: '3px 6px', borderRadius: 5 }}>
            {live ? 'LIVE DATA' : 'SAMPLE DATA'}
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {bars.map((b) => (
            <div key={b.n}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 2 }}>
                <span style={{ fontWeight: 700 }}>{blind ? `T${b.n}` : `T${b.n} ${treatmentByN(doc, b.n)?.name ?? ''}`}</span>
                <span style={{ font: `600 11px ${MONO}` }}>{b.ctl}%</span>
              </div>
              <div style={{ height: 8, background: C.chipBg, borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ width: `${b.ctl}%`, height: '100%', background: C.green }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 8 }}>
        <div style={card}>
          <div style={{ fontSize: 14, fontWeight: 800 }}>Client PDF report</div>
          <div style={{ fontSize: 11.5, color: C.grey, margin: '2px 0 9px' }}>Cover · site + conditions · means table · ranked chart · photo pages</div>
          <div
            onClick={() => {
              printClientReport(doc, ts, { blindCodes: blind, watermark: blind })
              setPdfFlash('✓ Report opened — print or save as PDF · the portal emails clients the filed copy')
            }}
            style={{ textAlign: 'center', padding: '11px 0', borderRadius: 10, background: C.green, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
          >
            Generate PDF
          </div>
          {pdfFlash && <Flash style={{ marginTop: 7 }}>{pdfFlash}</Flash>}
        </div>

        <div onClick={exportExcel} style={{ ...card, display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800 }}>Excel / ARM export</div>
            <div style={{ fontSize: 11.5, color: C.grey }}>Plot-level data · one tab per assessment — matches your workbooks</div>
          </div>
          <span style={{ fontSize: 16, color: C.muted }}>›</span>
        </div>
        {xlFlash && <Flash>{xlFlash}</Flash>}

        <div
          onClick={() => printFieldDayHandout(doc, ts)}
          style={{ ...card, display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
        >
          <div>
            <div style={{ fontSize: 14, fontWeight: 800 }}>Field-day handout</div>
            <div style={{ fontSize: 11.5, color: C.grey }}>One page · Rep 1 walk order · big type</div>
          </div>
          <span style={{ fontSize: 16, color: C.muted }}>›</span>
        </div>
      </div>
      <div style={{ fontSize: 11, color: C.muted }}>Rep copies respect access rules — coded treatments, no competitor rates.</div>
    </div>
  )
}
