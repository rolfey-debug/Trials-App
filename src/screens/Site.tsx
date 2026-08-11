import React, { useState } from 'react'
import { C, MONO, SANS } from '../theme'
import { useApp } from '../store/store'
import { Eyebrow, ScreenTitle } from '../components/bits'

/** Site details (design screen 3c) — cooperator + paddock context; all of it
 * feeds the report's site page. */
export function Site() {
  const { doc, ts, mutTrial } = useApp()
  const [notesOpen, setNotesOpen] = useState(false)

  const kvCard = (pairs: [string, string][], section: 'cooperator' | 'paddock') => (
    <div style={{ background: '#fff', border: `1px solid ${C.hairline}`, borderRadius: 13, padding: '4px 14px', marginBottom: 12 }}>
      {pairs.map(([k, v], i) => (
        <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '9px 0', borderBottom: i < pairs.length - 1 ? '1px solid #F0F1F0' : 'none' }}>
          <span style={{ fontSize: 11.5, color: C.muted, flex: 'none' }}>{k}</span>
          <input
            value={v}
            onChange={(e) =>
              mutTrial({ kind: 'site', label: `Site · ${k}` }, (t) => {
                const list = section === 'cooperator' ? t.site.cooperator : t.site.paddock
                const row = list.find((p) => p[0] === k)
                if (row) row[1] = e.target.value
              })
            }
            style={{ fontSize: 12.5, fontWeight: 700, textAlign: 'right', border: 'none', outline: 'none', background: 'transparent', flex: 1, fontFamily: SANS, color: C.ink, padding: 0 }}
          />
        </div>
      ))}
    </div>
  )

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '4px 16px 12px' }}>
      <ScreenTitle title={`Site — ${doc.trial.name.split('—')[0].trim()}`} sub="Cooperator + paddock context — flows straight into the report" />

      <Eyebrow>COOPERATOR</Eyebrow>
      {kvCard(ts.site.cooperator, 'cooperator')}

      <Eyebrow>PADDOCK &amp; SOWING</Eyebrow>
      {kvCard(ts.site.paddock, 'paddock')}

      <Eyebrow>FERTILISER &amp; PADDOCK INPUTS</Eyebrow>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 8 }}>
        {ts.site.fert.map((fe, i) => (
          <div key={i} style={{ background: '#fff', border: `1px solid ${C.hairline}`, borderRadius: 11, padding: '10px 13px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{fe.t}</div>
              <div style={{ fontSize: 11, color: C.grey }}>{fe.s}</div>
            </div>
            <span style={{ font: `500 10px ${MONO}`, color: C.muted }}>{fe.d}</span>
          </div>
        ))}
      </div>
      <div
        onClick={() =>
          mutTrial({ kind: 'site', label: 'Fertiliser application added' }, (t) => {
            t.site.fert.push({
              t: 'Urea 60 kg/ha',
              s: 'Draft — confirm rate with grower',
              d: new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }).toUpperCase(),
            })
          })
        }
        style={{ border: `1.5px dashed ${C.disabled}`, borderRadius: 11, padding: 10, textAlign: 'center', fontSize: 12.5, fontWeight: 700, color: C.green, cursor: 'pointer', marginBottom: 12 }}
      >
        ＋ Add application
      </div>

      <Eyebrow>SITE NOTES</Eyebrow>
      {notesOpen ? (
        <textarea
          autoFocus
          defaultValue={ts.site.notes}
          onBlur={(e) => {
            mutTrial({ kind: 'site', label: 'Site notes' }, (t) => void (t.site.notes = e.target.value))
            setNotesOpen(false)
          }}
          style={{
            width: '100%', boxSizing: 'border-box', background: '#fff', border: `1.5px solid ${C.green}`, borderRadius: 13,
            padding: '11px 14px', fontSize: 12.5, color: C.body, lineHeight: 1.55, fontFamily: SANS, minHeight: 90, outline: 'none', resize: 'vertical',
          }}
        />
      ) : (
        <div
          onClick={() => setNotesOpen(true)}
          style={{ background: '#fff', border: `1px solid ${C.hairline}`, borderRadius: 13, padding: '11px 14px', fontSize: 12.5, color: C.body, lineHeight: 1.55, cursor: 'text' }}
        >
          {ts.site.notes || 'Tap to add site notes…'}
        </div>
      )}
    </div>
  )
}
