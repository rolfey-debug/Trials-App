import { ASSESS_ROWS_WIZ, BASE_TREATMENTS, DOC_FILES, EXT_CHIP, SITE_ROWS_WIZ } from '../data'
import { MONO, useApp } from '../state'

const sectionChip = (src: string) => (
  <span style={{ fontFamily: MONO, fontSize: 9, color: '#6B6D6B', background: '#F0F1F0', borderRadius: 4, padding: '1px 6px' }}>{src}</span>
)
const sectionLabel: React.CSSProperties = { fontSize: 10.5, fontWeight: 800, letterSpacing: '.11em', color: '#8A8C8A' }
const ruled = 'repeating-linear-gradient(180deg,#F2F3F2 0 7px,#fff 7px 15px)'

export default function Docs() {
  const { s, set, nav } = useApp()
  const cur = DOC_FILES[s.selDoc] ?? DOC_FILES[0]
  return (
    <div style={{ flex: 1, minWidth: 0, overflow: 'auto', padding: '26px 34px 44px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, marginBottom: 20 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.12em', color: '#8A8C8A' }}>MATONG WHEAT FUNGICIDE DEMO 2026</div>
          <h1 style={{ margin: '4px 0 0', fontSize: 22, fontWeight: 800, color: '#141414', letterSpacing: '-.01em' }}>Documents &amp; protocol</h1>
          <div style={{ marginTop: 3, fontSize: 12.5, color: '#8A8C8A' }}>Drop what the client or chem rep sent you — the wizard builds from whatever parses.</div>
        </div>
        <div onClick={() => nav('wizard', { step: 'treatments' })} className="hv-green-border" style={{ padding: '9px 16px', background: '#fff', border: '1px solid #D8DAD8', color: '#141414', fontSize: 13, fontWeight: 700, borderRadius: 8, cursor: 'pointer', whiteSpace: 'nowrap' }}>
          Open in wizard →
        </div>
      </div>
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        <div style={{ width: 264, flex: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="hv-drop" style={{ border: '1.5px dashed #C7CAC7', borderRadius: 10, padding: '20px 16px', textAlign: 'center', background: '#FBFCFB', cursor: 'pointer' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#007749" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <div style={{ fontSize: 12.5, fontWeight: 800, color: '#141414', marginTop: 7 }}>Drop files here or browse</div>
            <div style={{ fontSize: 11, color: '#8A8C8A', marginTop: 3 }}>PDF · XLSX · DOCX — sheets and protocols parse automatically</div>
          </div>
          {DOC_FILES.map((f, i) => {
            const ext = EXT_CHIP[f.ext]
            const selected = s.selDoc === i
            return (
              <div key={f.name} onClick={() => set({ selDoc: i })} style={{ padding: '11px 13px', borderRadius: 9, border: `1px solid ${selected ? '#007749' : '#E4E4E6'}`, background: selected ? '#F7FAF8' : '#FFFFFF', cursor: 'pointer' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', minWidth: 0 }}>
                  <span style={{ flex: 'none', fontFamily: MONO, fontSize: 8.5, fontWeight: 600, letterSpacing: '.06em', padding: '2px 5px', borderRadius: 4, background: ext.bg, color: ext.fg }}>{f.ext}</span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 700, color: '#141414', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</span>
                  <span style={{ flex: 'none', fontSize: 10, color: '#A9ABA9' }}>{f.size}</span>
                </div>
                {f.st === 'parsed' && <div style={{ marginTop: 6, fontSize: 11, fontWeight: 600, color: '#007749', lineHeight: 1.4 }}>✓ {f.text}</div>}
                {f.st === 'parsing' && (
                  <div style={{ marginTop: 6, fontSize: 11, fontWeight: 600, color: '#6B6D6B', lineHeight: 1.4 }}>
                    <span style={{ display: 'inline-block', width: 10, height: 10, border: '2px solid #C7CAC7', borderTopColor: '#007749', borderRadius: '50%', animation: 'omspin .9s linear infinite', marginRight: 6, verticalAlign: -1 }} />
                    {f.text}
                  </div>
                )}
                {f.st === 'error' && <div style={{ marginTop: 6, fontSize: 11, fontWeight: 700, color: '#cf4520', lineHeight: 1.4 }}>⚑ {f.text}</div>}
              </div>
            )
          })}
          <div style={{ fontSize: 11, color: '#8A8C8A', lineHeight: 1.5, padding: '0 2px' }}>Parsed tables stay linked — fix a rate in the wizard and the source page is one click away.</div>
        </div>
        <div style={{ width: 398, flex: 'none', background: '#fff', border: '1px solid #E4E4E6', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', borderBottom: '1px solid #EDEEED' }}>
            <span style={{ flex: 1, minWidth: 0, fontFamily: MONO, fontSize: 11, color: '#3E403E', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cur.name}</span>
            <span className="hv-green-text" style={{ flex: 'none', fontSize: 11, fontWeight: 700, color: '#007749', cursor: 'pointer' }}>Open original ↗</span>
          </div>
          <div style={{ padding: 22, background: '#F0F1F0', display: 'flex', justifyContent: 'center' }}>
            <div style={{ width: 318, background: '#fff', border: '1px solid #E4E4E6', borderRadius: 3, boxShadow: '0 2px 10px rgba(20,20,20,.07)', padding: '24px 22px', minHeight: 400 }}>
              {cur.kind === 'pdf' && (
                <>
                  <div style={{ height: 11, width: '62%', background: '#E0E1E0', borderRadius: 3 }} />
                  <div style={{ height: 7, width: '38%', background: '#EDEEED', borderRadius: 3, marginTop: 8 }} />
                  <div style={{ height: 44, marginTop: 18, borderRadius: 3, background: ruled }} />
                  {cur.hi && (
                    <div style={{ marginTop: 16, border: '1.5px dashed #007749', borderRadius: 6, padding: 9, position: 'relative' }}>
                      <div style={{ position: 'absolute', top: -9, right: 8, background: '#007749', color: '#fff', fontSize: 8.5, fontWeight: 800, letterSpacing: '.07em', padding: '2px 7px', borderRadius: 4 }}>8 TREATMENTS → WIZARD</div>
                      <div style={{ height: 9, background: '#E3F1EA', borderRadius: 2 }} />
                      <div style={{ height: 104, marginTop: 5, borderRadius: 2, background: 'repeating-linear-gradient(180deg,#F2F3F2 0 8px,#fff 8px 16px)' }} />
                    </div>
                  )}
                  <div style={{ height: 44, marginTop: 16, borderRadius: 3, background: ruled }} />
                  <div style={{ marginTop: 14, fontFamily: MONO, fontSize: 9.5, color: '#A9ABA9', textAlign: 'center' }}>pdf page preview</div>
                </>
              )}
              {cur.kind === 'xlsx' && (
                <>
                  <div style={{ height: 9, width: '44%', background: '#E0E1E0', borderRadius: 3, marginBottom: 12 }} />
                  <div style={{ height: 236, border: '1px solid #EDEEED', background: 'repeating-linear-gradient(180deg,#fff 0 19px,#F4F6F4 19px 20px),repeating-linear-gradient(90deg,#fff 0 45px,#F4F6F4 45px 46px)' }} />
                  <div style={{ marginTop: 14, fontFamily: MONO, fontSize: 9.5, color: '#A9ABA9', textAlign: 'center' }}>spreadsheet preview</div>
                </>
              )}
              {cur.kind === 'docx' && (
                <>
                  <div style={{ height: 11, width: '56%', background: '#E0E1E0', borderRadius: 3 }} />
                  <div style={{ height: 70, marginTop: 14, borderRadius: 3, background: ruled }} />
                  <div style={{ marginTop: 14, border: '1.5px dashed #cf4520', borderRadius: 6, padding: 9, position: 'relative' }}>
                    <div style={{ position: 'absolute', top: -9, right: 8, background: '#cf4520', color: '#fff', fontSize: 8.5, fontWeight: 800, letterSpacing: '.07em', padding: '2px 7px', borderRadius: 4 }}>TABLE UNREADABLE</div>
                    <div style={{ height: 64, borderRadius: 2, background: 'repeating-linear-gradient(180deg,#F7F0EE 0 8px,#fff 8px 16px)' }} />
                  </div>
                  <div style={{ height: 44, marginTop: 14, borderRadius: 3, background: ruled }} />
                  <div style={{ marginTop: 14, fontFamily: MONO, fontSize: 9.5, color: '#A9ABA9', textAlign: 'center' }}>document preview — drag a box around the table to re-parse</div>
                </>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 9, borderTop: '1px solid #EDEEED', fontFamily: MONO, fontSize: 11, color: '#6B6D6B' }}>
            <span className="hv-ink-text" style={{ cursor: 'pointer' }}>‹</span>
            <span>{cur.page}</span>
            <span className="hv-ink-text" style={{ cursor: 'pointer' }}>›</span>
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 300, background: '#fff', border: '1px solid #E4E4E6', borderRadius: 10, padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#141414' }}>Generated protocol</div>
              <div style={{ fontSize: 11.5, color: '#8A8C8A', marginTop: 2 }}>Builds from parsed documents · wizard edits win</div>
            </div>
            <div style={{ position: 'relative' }}>
              <div onClick={() => set((st) => ({ expMenu: !st.expMenu }))} className="hv-primary" style={{ padding: '8px 14px', background: '#007749', color: '#fff', fontSize: 12.5, fontWeight: 700, borderRadius: 8, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                Export ▾
              </div>
              {s.expMenu && (
                <div style={{ position: 'absolute', right: 0, top: 38, zIndex: 20, background: '#fff', border: '1px solid #E4E4E6', borderRadius: 9, boxShadow: '0 10px 30px rgba(20,20,20,.13)', width: 196, overflow: 'hidden' }}>
                  {['Protocol PDF', 'Excel workbook (.xlsx)', 'ARM study definition'].map((m, i) => (
                    <div key={m} onClick={() => set({ expMenu: false })} className="hv-pick" style={{ padding: '10px 14px', fontSize: 12.5, fontWeight: 600, color: '#141414', cursor: 'pointer', borderTop: i ? '1px solid #F0F1F0' : 'none' }}>
                      {m}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '12px 0 6px' }}>
            <div style={sectionLabel}>AIM</div>
            {sectionChip('PDF · P1')}
          </div>
          <div style={{ fontSize: 12.5, color: '#141414', lineHeight: 1.6 }}>
            Compare label-rate foliar fungicide programs for stripe rust and septoria in Scepter wheat, and show the timing response (GS31 vs GS39) for the Matong grower group field day.
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '16px 0 8px' }}>
            <div style={sectionLabel}>SITE</div>
            {sectionChip('PDF · P1')}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px' }}>
            {SITE_ROWS_WIZ.map((sr) => (
              <div key={sr.l} style={{ minWidth: 0 }}>
                <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.1em', color: '#A9ABA9' }}>{sr.l}</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#141414', marginTop: 2, lineHeight: 1.4 }}>{sr.v}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '16px 0 8px' }}>
            <div style={sectionLabel}>TREATMENTS</div>
            {sectionChip('PDF · P2')}
          </div>
          <div style={{ border: '1px solid #EDEEED', borderRadius: 8, overflow: 'hidden' }}>
            {BASE_TREATMENTS.map((t, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'baseline', padding: '6px 12px', borderTop: i ? '1px solid #F5F6F5' : 'none' }}>
                <span style={{ flex: 'none', width: 26, fontFamily: MONO, fontSize: 11, fontWeight: 600, color: '#141414' }}>T{i + 1}</span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 11.5, fontWeight: 600, color: '#3E403E', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</span>
                <span style={{ flex: 'none', fontFamily: MONO, fontSize: 10.5, color: '#6B6D6B' }}>{t.lines.map((l) => l[1]).join(' + ') || '—'}</span>
                <span style={{ flex: 'none', width: 34, textAlign: 'right', fontFamily: MONO, fontSize: 10, color: '#8A8C8A' }}>{t.timing}</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '16px 0 8px' }}>
            <div style={sectionLabel}>ASSESSMENTS</div>
            {sectionChip('PDF · P4')}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {ASSESS_ROWS_WIZ.map((ar) => (
              <div key={ar.a} style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
                <span style={{ flex: 'none', width: 26, fontFamily: MONO, fontSize: 11, fontWeight: 600, color: '#141414' }}>{ar.a}</span>
                <span style={{ flex: 'none', width: 64, fontFamily: MONO, fontSize: 10.5, color: '#6B6D6B' }}>{ar.stage}</span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 11.5, color: '#3E403E', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ar.what}</span>
                <span style={{ flex: 'none', fontFamily: MONO, fontSize: 10.5, color: '#6B6D6B' }}>{ar.date}</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid #F0F1F0', fontSize: 11, color: '#8A8C8A', lineHeight: 1.5 }}>
            Exports match the ARM study format — treatments, layout and schedule stay linked to this trial.
          </div>
        </div>
      </div>
    </div>
  )
}
