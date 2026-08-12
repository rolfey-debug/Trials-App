import { ASSESS_ROWS_REV, BASE_LOG, BASE_TREATMENTS, EXT_CHIP, REV_DOCS, SITE_ROWS_REV } from '../data'
import { cellColors, decorateBands, layout } from '../lib/layout'
import { MONO, useApp } from '../state'

const sectionLabel: React.CSSProperties = { fontSize: 10.5, fontWeight: 800, letterSpacing: '.11em', color: '#8A8C8A' }
const card: React.CSSProperties = { background: '#fff', border: '1px solid #E4E4E6', borderRadius: 10 }

export default function Review() {
  const { s, set, nav } = useApp()
  const chip = s.approved
    ? { t: 'Approved ✓', bg: '#007749', fg: '#FFFFFF', bd: '#007749' }
    : { t: 'In review', bg: '#FFFFFF', fg: '#141414', bd: '#B9BBB9' }
  const bands = decorateBands(layout('A7F3', 'RCBD', 4, 8))
  const legend: Array<{ t: string; name: string; bg: string; border: string }> = []
  for (let t = 1; t <= 8; t++) {
    const cc = cellColors(t)
    legend.push({ t: 'T' + t, name: BASE_TREATMENTS[t - 1].name, bg: cc.bg, border: cc.border })
  }
  const sp = cellColors(0)
  legend.push({ t: 'SP', name: 'Spare / buffer', bg: sp.bg, border: sp.border })
  const log = (s.approved ? [{ when: 'Wed 12 Aug · 2:04 pm', what: 'Approved & locked — signed', who: 'Ian McPherson' }, ...BASE_LOG] : BASE_LOG)

  return (
    <div style={{ flex: 1, minWidth: 0, overflow: 'auto' }}>
      <div style={{ padding: '22px 34px 44px', maxWidth: 1200 }}>
        <div onClick={() => nav('trials')} className="hv-green-text" style={{ display: 'inline-block', fontSize: 12, fontWeight: 700, color: '#8A8C8A', cursor: 'pointer', marginBottom: 10 }}>
          ← All trials
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#141414', letterSpacing: '-.01em' }}>Ganmain Barley Net Blotch 2026</h1>
          <span style={{ display: 'inline-block', padding: '4px 11px', borderRadius: 999, fontSize: 11.5, fontWeight: 800, background: chip.bg, color: chip.fg, border: `1px solid ${chip.bd}` }}>{chip.t}</span>
        </div>
        <div style={{ marginTop: 5, fontSize: 12.5, color: '#8A8C8A' }}>Submitted for approval by Sam Kelleher · Mon 10 Aug, 9:41 am · Ganmain branch · read-only until signed off</div>
        <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start', marginTop: 18 }}>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ ...card, padding: '16px 20px' }}>
              <div style={{ ...sectionLabel, marginBottom: 7 }}>AIM</div>
              <div style={{ fontSize: 13.5, color: '#141414', lineHeight: 1.6 }}>
                Compare registered foliar fungicides and one experimental SDHI for net form net blotch in Spartacus CL barley — one- and two-spray programs, ranked by yield response for the Ganmain grower group.
              </div>
            </div>
            <div style={{ ...card, padding: '16px 20px' }}>
              <div style={{ ...sectionLabel, marginBottom: 10 }}>SITE</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: '12px 18px' }}>
                {SITE_ROWS_REV.map((sr) => (
                  <div key={sr.l} style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.1em', color: '#A9ABA9' }}>{sr.l}</div>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: '#141414', marginTop: 3, lineHeight: 1.45 }}>{sr.v}</div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ ...card, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px 0' }}>
                <div style={sectionLabel}>TREATMENTS</div>
                <div style={{ display: 'flex', gap: 12, fontFamily: MONO, fontSize: 10.5, color: '#6B6D6B' }}>
                  <span><b style={{ color: '#141414' }}>A</b> GS39 · 20 Aug</span>
                  <span><b style={{ color: '#141414' }}>B</b> GS55 · 4 Sep</span>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '44px minmax(0,1.15fr) minmax(0,1.6fr) 74px', gap: 12, padding: '10px 20px 8px', fontSize: 10, fontWeight: 800, letterSpacing: '.11em', color: '#A9ABA9', borderBottom: '1px solid #F0F1F0' }}>
                <div>NO.</div>
                <div>TREATMENT</div>
                <div>PRODUCTS &amp; RATES</div>
                <div>TIMING</div>
              </div>
              {BASE_TREATMENTS.map((t, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '44px minmax(0,1.15fr) minmax(0,1.6fr) 74px', gap: 12, alignItems: 'center', padding: '9px 20px', borderTop: '1px solid #F5F6F5' }}>
                  <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 600, color: '#141414' }}>T{i + 1}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: '#141414', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</span>
                    {t.exp && <span style={{ flex: 'none', fontSize: 8.5, fontWeight: 800, letterSpacing: '.08em', color: '#cf4520', border: '1px solid #cf4520', background: '#FBEDE8', borderRadius: 4, padding: '1px 5px' }}>EXP</span>}
                  </div>
                  <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {t.lines.length === 0 && <div style={{ fontSize: 12, color: '#8A8C8A' }}>— nil applied</div>}
                    {t.lines.map((l, j) => (
                      <div key={j} style={{ display: 'flex', gap: 7, alignItems: 'baseline', minWidth: 0 }}>
                        <span style={{ fontSize: 12, color: '#141414', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l[0]}</span>
                        <span style={{ fontFamily: MONO, fontSize: 11.5, color: '#3E403E', whiteSpace: 'nowrap' }}>{l[1]}</span>
                        <span style={{ fontFamily: MONO, fontSize: 9.5, color: '#8A8C8A' }}>{l[2]}</span>
                      </div>
                    ))}
                  </div>
                  <div>
                    <span style={{ display: 'inline-block', fontFamily: MONO, fontSize: 10.5, fontWeight: 600, padding: '2px 7px', border: '1px solid #E0E1E0', borderRadius: 5, color: '#141414', background: '#F7F8F7', whiteSpace: 'nowrap' }}>{t.timing}</span>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ ...card, padding: '16px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 12 }}>
                <div style={sectionLabel}>PLOT LAYOUT</div>
                <div style={{ fontFamily: MONO, fontSize: 10.5, color: '#6B6D6B' }}>RCBD · 4 reps · seed #A7F3 · plots 2 m × 10 m</div>
              </div>
              <div style={{ overflow: 'auto', paddingBottom: 4 }}>
                {bands.map((bd) => (
                  <div key={bd.label} style={{ display: 'flex', alignItems: 'stretch', gap: 4, padding: 4, background: bd.rowBg, borderRadius: 8, marginBottom: 3, width: 'max-content' }}>
                    <div style={{ width: 44, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: MONO, fontSize: 9, fontWeight: 600, color: '#6B6D6B' }}>{bd.label}</div>
                    {bd.cells.map((cl) => (
                      <div key={cl.num} style={{ width: 64, height: 46, flex: 'none', borderRadius: 6, background: cl.bg, border: cl.border, color: cl.fg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                        <div style={{ fontFamily: MONO, fontSize: 8.5, opacity: 0.72 }}>{cl.num}</div>
                        <div style={{ fontFamily: MONO, fontSize: 13.5, fontWeight: 600 }}>{cl.t}</div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: '6px 16px', marginTop: 10 }}>
                {legend.map((lg) => (
                  <div key={lg.t} style={{ display: 'flex', gap: 7, alignItems: 'center', minWidth: 0 }}>
                    <div style={{ width: 11, height: 11, flex: 'none', borderRadius: 3, background: lg.bg, border: lg.border }} />
                    <span style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 600, color: '#141414' }}>{lg.t}</span>
                    <span style={{ fontSize: 11, color: '#6B6D6B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{lg.name}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ ...card, padding: '16px 20px' }}>
              <div style={{ ...sectionLabel, marginBottom: 10 }}>ASSESSMENT SCHEDULE</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {ASSESS_ROWS_REV.map((ar) => (
                  <div key={ar.a} style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}>
                    <span style={{ flex: 'none', width: 26, fontFamily: MONO, fontSize: 11.5, fontWeight: 600, color: '#141414' }}>{ar.a}</span>
                    <span style={{ flex: 'none', width: 78, fontFamily: MONO, fontSize: 11, color: '#6B6D6B' }}>{ar.stage}</span>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: '#141414' }}>{ar.what}</span>
                    <span style={{ flex: 'none', fontFamily: MONO, fontSize: 11, color: '#3E403E' }}>{ar.date}</span>
                    <span style={{ flex: 'none', width: 52, textAlign: 'right', fontSize: 10.5, fontWeight: 800, color: ar.stFg }}>{ar.status}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ ...card, padding: '16px 20px' }}>
              <div style={{ ...sectionLabel, marginBottom: 10 }}>DOCUMENTS</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {REV_DOCS.map((d) => {
                  const ext = EXT_CHIP[d.ext]
                  return (
                    <div key={d.name} style={{ display: 'flex', gap: 9, alignItems: 'center', minWidth: 0 }}>
                      <span style={{ flex: 'none', fontFamily: MONO, fontSize: 8.5, fontWeight: 600, letterSpacing: '.06em', padding: '2px 5px', borderRadius: 4, background: ext.bg, color: ext.fg }}>{d.ext}</span>
                      <span style={{ flex: 'none', fontSize: 12.5, fontWeight: 700, color: '#141414' }}>{d.name}</span>
                      <span style={{ flex: 1, minWidth: 0, fontSize: 11, color: '#8A8C8A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.st}</span>
                      <span className="hv-green-text" style={{ flex: 'none', fontSize: 11, fontWeight: 700, color: '#007749', cursor: 'pointer' }}>Open ↗</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
          <div style={{ width: 296, flex: 'none', position: 'sticky', top: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {!s.approved ? (
              <div style={{ ...card, padding: 18 }}>
                <div style={{ fontSize: 13.5, fontWeight: 800, color: '#141414' }}>Approval</div>
                <div style={{ fontSize: 12, color: '#3E403E', lineHeight: 1.55, marginTop: 6 }}>Approving locks treatments and the layout, and opens the trial to the field app for spraying and scoring.</div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 14 }}>
                  <div style={{ width: 32, height: 32, flex: 'none', borderRadius: '50%', background: '#E3F1EA', color: '#00623C', fontWeight: 800, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>IM</div>
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: '#141414' }}>Ian McPherson</div>
                    <div style={{ fontSize: 11, color: '#8A8C8A' }}>Senior agronomist · reviewing</div>
                  </div>
                </div>
                <div onClick={() => set((st) => ({ ack: !st.ack }))} style={{ display: 'flex', gap: 10, marginTop: 14, cursor: 'pointer', alignItems: 'flex-start' }}>
                  <div style={{ width: 17, height: 17, flex: 'none', borderRadius: 5, border: `1.5px solid ${s.ack ? '#007749' : '#B9BBB9'}`, background: s.ack ? '#007749' : '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
                    {s.ack && <span style={{ color: '#fff', fontSize: 11, fontWeight: 800, lineHeight: 1 }}>✓</span>}
                  </div>
                  <div style={{ fontSize: 12, color: '#3E403E', lineHeight: 1.45 }}>I’ve checked products, rates and timings against current labels and permits.</div>
                </div>
                <div
                  onClick={() => {
                    if (s.ack) set({ approved: true })
                  }}
                  style={{ marginTop: 14, padding: 11, textAlign: 'center', background: s.ack ? '#007749' : '#B7C9C0', color: '#fff', fontSize: 13, fontWeight: 800, borderRadius: 8, cursor: s.ack ? 'pointer' : 'not-allowed' }}
                >
                  Approve trial
                </div>
                <div className="hv-flag" style={{ marginTop: 8, padding: 8, textAlign: 'center', fontSize: 12.5, fontWeight: 800, color: '#cf4520', borderRadius: 8, cursor: 'pointer' }}>⚑ Request changes</div>
              </div>
            ) : (
              <div style={{ background: '#E3F1EA', border: '1px solid #9CC9B4', borderRadius: 10, padding: 18 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#00512F' }}>✓ Approved</div>
                <div style={{ fontSize: 12, color: '#2F6B4F', marginTop: 6, lineHeight: 1.5 }}>
                  Signed Ian McPherson
                  <br />
                  Wed 12 Aug 2026 · 2:04 pm
                </div>
                <div style={{ fontSize: 11.5, color: '#2F6B4F', marginTop: 10, paddingTop: 10, borderTop: '1px solid #BCDCCB', lineHeight: 1.5 }}>
                  Treatments and layout are locked. The field app is now open for the spray record.
                </div>
              </div>
            )}
            <div style={{ ...card, padding: '16px 18px' }}>
              <div style={{ ...sectionLabel, marginBottom: 9 }}>AT A GLANCE</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7, fontSize: 12, color: '#3E403E' }}>
                <div>
                  <span style={{ fontFamily: MONO, fontWeight: 600, color: '#141414' }}>8</span> treatments · <span style={{ fontFamily: MONO, fontWeight: 600, color: '#141414' }}>4</span> reps · <span style={{ fontFamily: MONO, fontWeight: 600, color: '#141414' }}>36</span> plots
                </div>
                <div>
                  Sprays: A <span style={{ fontFamily: MONO, color: '#141414' }}>20 Aug</span> · B <span style={{ fontFamily: MONO, color: '#141414' }}>4 Sep</span>
                </div>
                <div>
                  First assessment <span style={{ fontFamily: MONO, color: '#141414' }}>18 Aug</span>
                </div>
                <div>
                  Harvest <span style={{ fontFamily: MONO, color: '#141414' }}>w/c 24 Nov</span>
                </div>
                <div style={{ paddingTop: 7, borderTop: '1px solid #F0F1F0', color: '#8A8C8A', fontSize: 11.5 }}>1 experimental product — EXP flagged, excluded from grower report by default.</div>
              </div>
            </div>
          </div>
        </div>
        <div style={{ marginTop: 18, ...card, padding: '14px 20px' }}>
          <div style={{ ...sectionLabel, marginBottom: 10 }}>CHANGE LOG</div>
          <div style={{ display: 'flex', gap: 0, overflow: 'auto', paddingBottom: 4 }}>
            {log.map((lg, i) => (
              <div key={lg.when + lg.what} style={{ flex: 'none', maxWidth: 230, padding: '0 18px', borderLeft: i ? '1px solid #F0F1F0' : 'none' }}>
                <div style={{ fontFamily: MONO, fontSize: 10, color: '#8A8C8A', whiteSpace: 'nowrap' }}>{lg.when}</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#141414', marginTop: 3, lineHeight: 1.4 }}>{lg.what}</div>
                <div style={{ fontSize: 10.5, color: '#8A8C8A', marginTop: 3 }}>{lg.who}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
