import { ASSESS_ROWS_WIZ, DESIGN_NOTES, TRIAL_TYPES } from '../data'
import { cellColors, decorateBands, layout, randomSeed, type Design } from '../lib/layout'
import { MONO, useApp, type Step } from '../state'

const STEP_META: Record<string, { title: string; hint: string; count: string; next: string; back: Step | null; to: Step | null }> = {
  aim: { title: 'Aim & basics', hint: 'what kind of trial, and why', count: 'Step 1 of 6', next: 'Save & continue →', back: null, to: 'treatments' },
  treatments: { title: 'Treatments', hint: 'what goes on each plot, and when', count: 'Step 3 of 6', next: 'Save & continue →', back: 'aim', to: 'rand' },
  rand: { title: 'Randomisation', hint: 'design and plot layout', count: 'Step 4 of 6', next: 'Save & continue →', back: 'treatments', to: 'assess' },
  assess: { title: 'Assessments', hint: 'what gets scored, and when', count: 'Step 5 of 6', next: 'Save & continue →', back: 'rand', to: 'review' },
  review: { title: 'Review & submit', hint: 'final check before approval', count: 'Step 6 of 6', next: 'Submit for approval →', back: 'assess', to: null },
}

const sectionLabel: React.CSSProperties = { fontSize: 10.5, fontWeight: 800, letterSpacing: '.11em', color: '#8A8C8A' }
const inputStyle: React.CSSProperties = { width: '100%', padding: '9px 12px', fontSize: 13, fontWeight: 600, border: '1px solid #D8DAD8', borderRadius: 8, outline: 'none', color: '#141414', background: '#fff' }

function Stepper() {
  const { s, set, allT } = useApp()
  const unconf = 8 - Object.keys(s.confirmed).length
  void allT
  const defs: Array<{ id: Step; label: string; sub: string; done?: boolean }> = [
    { id: 'aim', label: 'Aim & basics', sub: `${s.trialType} · field-day focus` },
    { id: 'site', label: 'Site', sub: '‘Glenview’, Matong NSW', done: true },
    { id: 'treatments', label: 'Treatments', sub: `8 treatments · ${unconf ? unconf + ' to check' : 'all checked ✓'}` },
    { id: 'rand', label: 'Randomisation', sub: `${s.design} · ${s.reps} reps · seed #${s.seed}` },
    { id: 'assess', label: 'Assessments', sub: '4 timings from protocol' },
    { id: 'review', label: 'Review & submit', sub: '' },
  ]
  return (
    <div style={{ width: 248, flex: 'none', borderRight: '1px solid #E4E4E6', background: '#FBFCFB', padding: '20px 14px', overflow: 'auto' }}>
      <BackToTrials />
      <div style={{ margin: '0 8px 4px', fontSize: 10, fontWeight: 800, letterSpacing: '.14em', color: '#8A8C8A' }}>NEW TRIAL · DRAFT</div>
      <div style={{ margin: '0 8px 18px', fontSize: 14.5, fontWeight: 800, color: '#141414', lineHeight: 1.3 }}>Matong Wheat Fungicide Demo 2026</div>
      {defs.map((d, i) => {
        const cur = s.step === d.id
        return (
          <div key={d.id} onClick={d.done ? undefined : () => set({ step: d.id })} style={{ display: 'flex', gap: 11, padding: '9px 8px', borderRadius: 8, cursor: d.done ? 'default' : 'pointer', background: cur ? '#E3F1EA' : 'transparent', marginBottom: 2, alignItems: 'flex-start' }}>
            <div style={{ width: 22, height: 22, flex: 'none', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, background: cur ? '#007749' : d.done ? '#E3F1EA' : '#fff', color: cur ? '#fff' : d.done ? '#00623C' : '#8A8C8A', border: `1px solid ${cur ? '#007749' : d.done ? '#BCDCCB' : '#D8DAD8'}` }}>
              {d.done ? '✓' : i + 1}
            </div>
            <div style={{ minWidth: 0, paddingTop: 2 }}>
              <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.2, color: cur ? '#00512F' : d.done ? '#141414' : '#6B6D6B' }}>{d.label}</div>
              {d.sub && <div style={{ fontSize: 11, color: '#8A8C8A', marginTop: 2, lineHeight: 1.35 }}>{d.sub}</div>}
            </div>
          </div>
        )
      })}
      <div style={{ margin: '16px 8px 0', padding: '10px 12px', background: '#fff', border: '1px solid #EDEEED', borderRadius: 8, fontSize: 11, color: '#8A8C8A', lineHeight: 1.5 }}>
        Everything saves as you go. Steps unlock the field app once the trial is approved.
      </div>
    </div>
  )
}

function BackToTrials() {
  const { nav } = useApp()
  return (
    <div onClick={() => nav('trials')} className="hv-green-text" style={{ fontSize: 12, fontWeight: 700, color: '#8A8C8A', cursor: 'pointer', margin: '0 8px 16px' }}>
      ← All trials
    </div>
  )
}

function StepAim() {
  const { s, set } = useApp()
  return (
    <div style={{ maxWidth: 780 }}>
      <div style={{ ...sectionLabel, marginBottom: 9 }}>TRIAL TYPE</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 10 }}>
        {TRIAL_TYPES.map(([name, desc, meta]) => {
          const on = s.trialType === name
          return (
            <div key={name} onClick={() => set({ trialType: name })} style={{ border: on ? '1.5px solid #007749' : '1px solid #E4E4E6', background: on ? '#F7FAF8' : '#FFFFFF', borderRadius: 10, padding: '14px 15px', cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 15, height: 15, flex: 'none', borderRadius: '50%', border: `1.5px solid ${on ? '#007749' : '#C7CAC7'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {on && <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#007749' }} />}
                </div>
                <div style={{ fontSize: 13.5, fontWeight: 800, color: '#141414' }}>{name}</div>
              </div>
              <div style={{ fontSize: 11.5, color: '#6B6D6B', lineHeight: 1.5, marginTop: 8 }}>{desc}</div>
              <div style={{ fontFamily: MONO, fontSize: 9.5, color: '#8A8C8A', marginTop: 9 }}>{meta}</div>
            </div>
          )
        })}
      </div>
      <div style={{ fontSize: 11.5, color: '#8A8C8A', marginTop: 10, lineHeight: 1.5 }}>
        The type sets the defaults ahead — demonstrations keep replication light and build a field-day pack; plot trials get full stats; paddock scale swaps small plots for strips scored by header and imagery.
      </div>
      <div style={{ height: 1, background: '#EDEEED', margin: '20px 0' }} />
      <div style={{ display: 'flex', gap: 12 }}>
        <div style={{ flex: 2, minWidth: 0 }}>
          <div style={{ ...sectionLabel, letterSpacing: '.1em', marginBottom: 5 }}>TRIAL NAME</div>
          <input value={s.trialName} onChange={(e) => set({ trialName: e.target.value })} className="focus-green" style={inputStyle} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ ...sectionLabel, letterSpacing: '.1em', marginBottom: 5 }}>SEASON</div>
          <select value={s.tSeason} onChange={(e) => set({ tSeason: e.target.value })} style={{ ...inputStyle, padding: '9px 10px' }}>
            <option>Winter 2026</option>
            <option>Summer 2026–27</option>
            <option>Winter 2027</option>
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ ...sectionLabel, letterSpacing: '.1em', marginBottom: 5 }}>CROP &amp; VARIETY</div>
          <input value={s.tCrop} onChange={(e) => set({ tCrop: e.target.value })} className="focus-green" style={inputStyle} />
        </div>
      </div>
      <div style={{ marginTop: 14 }}>
        <div style={{ ...sectionLabel, letterSpacing: '.1em', marginBottom: 5 }}>WHAT IS THIS TRIAL TESTING?</div>
        <textarea value={s.aimText} onChange={(e) => set({ aimText: e.target.value })} rows={3} className="focus-green" style={{ ...inputStyle, fontWeight: 400, fontSize: 12.5, lineHeight: 1.55, padding: '10px 12px', resize: 'vertical' }} />
        <div style={{ fontSize: 11, color: '#8A8C8A', marginTop: 5 }}>Plain English is fine — this line opens the report and the field-day handout.</div>
      </div>
    </div>
  )
}

function StepTreatments() {
  const { s, set, nav, allT } = useApp()
  const unconf = 8 - Object.keys(s.confirmed).length
  const rows = allT()
  return (
    <div style={{ maxWidth: 940 }}>
      {unconf > 0 ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 16px', background: '#E3F1EA', border: '1px solid #BCDCCB', borderRadius: 10, marginBottom: 16 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#00623C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none' }}>
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#00512F' }}>Prefilled from “Matong Demo Protocol v3.pdf”</div>
            <div style={{ fontSize: 12, color: '#2F6B4F', marginTop: 1 }}>
              8 treatments with rates and timings were read from the document — {unconf} {unconf === 1 ? 'row still needs' : 'rows still need'} a check. Dashed values need a look before you continue.
            </div>
          </div>
          <div onClick={() => nav('docs')} className="hv-border-only" style={{ flex: 'none', padding: '7px 12px', background: '#fff', border: '1px solid #BCDCCB', borderRadius: 7, fontSize: 12, fontWeight: 700, color: '#00623C', cursor: 'pointer' }}>
            View source
          </div>
          <div onClick={() => set({ confirmed: { 0: 1, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1, 7: 1 } })} className="hv-primary" style={{ flex: 'none', padding: '7px 12px', background: '#007749', borderRadius: 7, fontSize: 12, fontWeight: 700, color: '#fff', cursor: 'pointer' }}>
            Confirm all
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', border: '1px solid #BCDCCB', borderRadius: 10, marginBottom: 16, background: '#fff' }}>
          <span style={{ color: '#007749', fontWeight: 800, fontSize: 13 }}>✓</span>
          <div style={{ fontSize: 12.5, color: '#00512F', fontWeight: 600 }}>All imported treatments checked — ready for randomisation.</div>
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        {(
          [
            ['A', 'GS31 · first node', 'target 14 Jul'],
            ['B', 'GS39 · flag leaf', 'target 18 Aug'],
          ] as const
        ).map(([letter, stage, target]) => (
          <div key={letter} style={{ display: 'flex', gap: 8, alignItems: 'baseline', padding: '8px 12px', background: '#fff', border: '1px solid #E4E4E6', borderRadius: 8 }}>
            <span style={{ display: 'inline-flex', width: 18, height: 18, borderRadius: 5, background: '#141414', color: '#fff', fontSize: 10.5, fontWeight: 800, alignItems: 'center', justifyContent: 'center', transform: 'translateY(3px)' }}>{letter}</span>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: '#141414' }}>{stage}</span>
            <span style={{ fontFamily: MONO, fontSize: 11, color: '#8A8C8A' }}>{target}</span>
          </div>
        ))}
        <div style={{ fontSize: 11.5, color: '#8A8C8A' }}>Application timings — each treatment picks A, B or both</div>
      </div>
      <div style={{ background: '#fff', border: '1px solid #E4E4E6', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '50px minmax(0,1.1fr) minmax(0,1.55fr) 92px 126px', gap: 12, padding: '10px 18px', fontSize: 10.5, fontWeight: 800, letterSpacing: '.11em', color: '#8A8C8A', borderBottom: '1px solid #EDEEED' }}>
          <div>NO.</div>
          <div>TREATMENT</div>
          <div>PRODUCTS &amp; RATES</div>
          <div>TIMING</div>
          <div style={{ textAlign: 'right' }}>IMPORTED</div>
        </div>
        {rows.map((t, i) => {
          const auto = i < 8
          const conf = !!s.confirmed[i]
          return (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '50px minmax(0,1.1fr) minmax(0,1.55fr) 92px 126px', gap: 12, alignItems: 'center', padding: '14px 18px', borderTop: '1px solid #F0F1F0', background: i === s.lastAdded ? '#F0F8F3' : '#FFFFFF' }}>
              <div style={{ fontFamily: MONO, fontSize: 12.5, fontWeight: 600, color: '#141414' }}>T{i + 1}</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#141414' }}>{t.name}</span>
                  {t.exp && <span style={{ flex: 'none', fontSize: 9, fontWeight: 800, letterSpacing: '.08em', color: '#cf4520', border: '1px solid #cf4520', background: '#FBEDE8', borderRadius: 4, padding: '1px 5px' }}>EXP</span>}
                </div>
                {t.note && <div style={{ fontSize: 11, color: '#8A8C8A', marginTop: 1 }}>{t.note}</div>}
              </div>
              <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                {t.lines.length === 0 && <div style={{ fontSize: 12.5, color: '#8A8C8A' }}>— nil applied</div>}
                {t.lines.map((l, j) => (
                  <div key={j} style={{ display: 'flex', gap: 7, alignItems: 'baseline', minWidth: 0 }}>
                    <span style={{ fontSize: 12.5, color: '#141414', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l[0]}</span>
                    <span style={{ fontFamily: MONO, fontSize: 12, color: '#3E403E', whiteSpace: 'nowrap', borderBottom: auto && !conf ? '1px dashed #A9ABA9' : 'none' }}>{l[1]}</span>
                    <span style={{ fontFamily: MONO, fontSize: 10, color: '#8A8C8A' }}>{l[2]}</span>
                  </div>
                ))}
              </div>
              <div>
                <span style={{ display: 'inline-block', fontFamily: MONO, fontSize: 11, fontWeight: 600, padding: '3px 8px', border: '1px solid #D8DAD8', borderRadius: 6, color: '#141414', background: '#F7F8F7', whiteSpace: 'nowrap' }}>{t.timing}</span>
              </div>
              <div style={{ textAlign: 'right' }}>
                {auto && !conf && (
                  <div onClick={() => set((st) => ({ confirmed: { ...st.confirmed, [i]: 1 } }))} className="hv-confirm" style={{ display: 'inline-block', fontSize: 11, fontWeight: 800, color: '#6B6D6B', border: '1px dashed #B9BBB9', padding: '4px 9px', borderRadius: 6, cursor: 'pointer' }}>
                    Auto · confirm
                  </div>
                )}
                {auto && conf && <div style={{ fontSize: 11, fontWeight: 800, color: '#007749' }}>✓ Checked</div>}
                {t.fromPicker && <div style={{ fontSize: 11, fontWeight: 800, color: '#cf4520' }}>set rate &amp; timing</div>}
              </div>
            </div>
          )
        })}
        <div onClick={() => set({ picker: true })} className="hv-tint" style={{ padding: '12px 18px', fontSize: 13, fontWeight: 700, color: '#007749', cursor: 'pointer', borderTop: '1px solid #EDEEED', display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 15, lineHeight: 1 }}>+</span>Add treatment from product list
        </div>
      </div>
      <div style={{ marginTop: 12, fontSize: 11.5, color: '#8A8C8A' }}>Rates are product per hectare. Water rate and nozzles are set in the spray record — 100 L/ha flat fan by default.</div>
    </div>
  )
}

function StepRandomisation() {
  const { s, set, allT } = useApp()
  const n = allT().length
  const latin = s.design === 'Latin square'
  const bands = decorateBands(layout(s.seed, s.design, s.reps, n))
  const legend: Array<{ t: string; name: string; bg: string; border: string }> = []
  for (let t = 1; t <= n; t++) {
    const cc = cellColors(t)
    legend.push({ t: 'T' + t, name: allT()[t - 1].name, bg: cc.bg, border: cc.border })
  }
  if (!latin) {
    const sp = cellColors(0)
    legend.push({ t: 'SP', name: 'Spare / buffer', bg: sp.bg, border: sp.border })
  }
  const cw = latin ? Math.max(54, Math.floor(700 / n)) : Math.max(58, Math.min(80, Math.floor(730 / (n + 1))))
  return (
    <div style={{ maxWidth: 960 }}>
      <div style={{ background: '#fff', border: '1px solid #E4E4E6', borderRadius: 10, padding: '18px 20px', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ ...sectionLabel, width: 64 }}>DESIGN</div>
          <div style={{ display: 'flex', border: '1px solid #D8DAD8', borderRadius: 8, overflow: 'hidden' }}>
            {(['RCBD', 'Latin square', 'Split-plot'] as Design[]).map((d, i) => (
              <div key={d} onClick={() => set({ design: d })} style={{ padding: '8px 14px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', background: s.design === d ? '#141414' : '#FFFFFF', color: s.design === d ? '#FFFFFF' : '#3E403E', borderLeft: i ? '1px solid #E4E4E6' : 'none' }}>
                {d}
              </div>
            ))}
          </div>
          <div onClick={() => set((st) => ({ fact: !st.fact }))} className="hv-green-text" style={{ fontSize: 12.5, fontWeight: 700, color: '#007749', cursor: 'pointer' }}>
            + Add factorial structure
          </div>
        </div>
        {s.fact && (
          <div style={{ marginTop: 14, padding: '13px 16px', background: '#FBFCFB', border: '1px dashed #D8DAD8', borderRadius: 8, display: 'flex', gap: 26, alignItems: 'center', flexWrap: 'wrap' }}>
            <div>
              <div style={{ ...sectionLabel, letterSpacing: '.1em' }}>FACTOR A</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#141414', marginTop: 3 }}>
                Product <span style={{ fontWeight: 400, color: '#8A8C8A' }}>· 7 levels from treatments</span>
              </div>
            </div>
            <div style={{ fontSize: 14, color: '#B8BAB8' }}>×</div>
            <div>
              <div style={{ ...sectionLabel, letterSpacing: '.1em' }}>FACTOR B</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#141414', marginTop: 3 }}>
                Timing <span style={{ fontWeight: 400, color: '#8A8C8A' }}>· A, B</span>
              </div>
            </div>
            <div style={{ fontSize: 12, color: '#6B6D6B', flex: 1, minWidth: 180 }}>= 14 combinations + control. Applying rebuilds the treatment list and this map.</div>
            <div style={{ padding: '7px 12px', background: '#fff', border: '1px solid #D8DAD8', borderRadius: 7, fontSize: 12, fontWeight: 700, color: '#8A8C8A' }}>Apply structure</div>
          </div>
        )}
        <div style={{ height: 1, background: '#F0F1F0', margin: '16px 0' }} />
        <div style={{ display: 'flex', gap: 34, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div>
            <div style={{ ...sectionLabel, marginBottom: 7 }}>REPS</div>
            <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #D8DAD8', borderRadius: 8, overflow: 'hidden' }}>
              <div onClick={() => set((st) => ({ reps: Math.max(2, st.reps - 1) }))} className="hv-soft" style={{ width: 30, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, color: '#3E403E', cursor: 'pointer' }}>−</div>
              <div style={{ width: 36, textAlign: 'center', fontFamily: MONO, fontSize: 14, fontWeight: 600, color: '#141414' }}>{s.reps}</div>
              <div onClick={() => set((st) => ({ reps: Math.min(6, st.reps + 1) }))} className="hv-soft" style={{ width: 30, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, color: '#3E403E', cursor: 'pointer' }}>+</div>
            </div>
          </div>
          <div>
            <div style={{ ...sectionLabel, marginBottom: 7 }}>PLOT SIZE</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <input value={s.plotW} onChange={(e) => set({ plotW: e.target.value })} className="focus-green" style={{ width: 44, height: 32, textAlign: 'center', fontFamily: MONO, fontSize: 13, border: '1px solid #D8DAD8', borderRadius: 8, outline: 'none', color: '#141414' }} />
              <span style={{ fontSize: 12, color: '#8A8C8A' }}>m ×</span>
              <input value={s.plotL} onChange={(e) => set({ plotL: e.target.value })} className="focus-green" style={{ width: 44, height: 32, textAlign: 'center', fontFamily: MONO, fontSize: 13, border: '1px solid #D8DAD8', borderRadius: 8, outline: 'none', color: '#141414' }} />
              <span style={{ fontSize: 12, color: '#8A8C8A' }}>m</span>
            </div>
          </div>
          <div>
            <div style={{ ...sectionLabel, marginBottom: 7 }}>FIELD GRID</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#141414', paddingTop: 5 }}>{latin ? `${n} rows × ${n} ranges` : `${n + 1} rows × ${s.reps} ranges`}</div>
            <div style={{ fontSize: 11.5, color: '#8A8C8A', marginTop: 3 }}>{latin ? `= ${n * n} plots, no spares` : `= ${n * s.reps} plots + ${s.reps} spares — ${(n + 1) * s.reps} total`}</div>
          </div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ ...sectionLabel, marginBottom: 7 }}>HOW IT RANDOMISES</div>
            <div style={{ fontSize: 12, color: '#6B6D6B', lineHeight: 1.55 }}>{DESIGN_NOTES[s.design](n)}</div>
          </div>
        </div>
      </div>
      <div style={{ background: '#fff', border: '1px solid #E4E4E6', borderRadius: 10, padding: '18px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#141414' }}>Layout preview</div>
            <div style={{ fontSize: 11.5, color: '#8A8C8A', marginTop: 3 }}>
              Seeded <span style={{ fontFamily: MONO, fontWeight: 600, color: '#141414' }}>#{s.seed}</span> — reproducible: the same seed always regenerates this exact layout. Re-randomising records a new seed in the change log.
            </div>
          </div>
          <div onClick={() => set({ seed: randomSeed() })} className="hv-green-border" style={{ flex: 'none', display: 'flex', gap: 7, alignItems: 'center', padding: '8px 14px', background: '#fff', border: '1px solid #D8DAD8', borderRadius: 8, fontSize: 12.5, fontWeight: 700, color: '#141414', cursor: 'pointer' }}>
            <span style={{ fontSize: 14, lineHeight: 1 }}>↻</span>Re-randomise
          </div>
        </div>
        <div style={{ display: 'flex', gap: 16, fontFamily: MONO, fontSize: 10.5, color: '#8A8C8A', margin: '14px 0 8px' }}>
          <span>N ↑</span>
          <span>sprayer runs W → E</span>
          <span>plot {s.plotW} m × {s.plotL} m</span>
        </div>
        <div style={{ overflow: 'auto', paddingBottom: 4 }}>
          {bands.map((bd) => (
            <div key={bd.label} style={{ display: 'flex', alignItems: 'stretch', gap: 5, padding: 5, background: bd.rowBg, borderRadius: 9, marginBottom: 4, width: 'max-content' }}>
              <div style={{ width: 50, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: MONO, fontSize: 10, fontWeight: 600, color: '#6B6D6B' }}>{bd.label}</div>
              {bd.cells.map((cl) => (
                <div key={cl.num} style={{ width: cw, height: 56, flex: 'none', borderRadius: 7, background: cl.bg, border: cl.border, color: cl.fg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
                  <div style={{ fontFamily: MONO, fontSize: 9.5, opacity: 0.72 }}>{cl.num}</div>
                  <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 600, letterSpacing: '-.02em' }}>{cl.t}</div>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: '7px 18px', marginTop: 12 }}>
          {legend.map((lg) => (
            <div key={lg.t} style={{ display: 'flex', gap: 8, alignItems: 'center', minWidth: 0 }}>
              <div style={{ width: 12, height: 12, flex: 'none', borderRadius: 4, background: lg.bg, border: lg.border }} />
              <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 600, color: '#141414' }}>{lg.t}</span>
              <span style={{ fontSize: 11.5, color: '#6B6D6B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{lg.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function StepAssess() {
  return (
    <div style={{ maxWidth: 820 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', border: '1px solid #BCDCCB', borderRadius: 10, marginBottom: 16, background: '#fff' }}>
        <span style={{ color: '#007749', fontWeight: 800, fontSize: 13 }}>✓</span>
        <div style={{ fontSize: 12.5, color: '#00512F', fontWeight: 600 }}>Schedule prefilled from the protocol — confirm methods with the field team.</div>
      </div>
      <div style={{ background: '#fff', border: '1px solid #E4E4E6', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '44px 92px minmax(0,1.6fr) minmax(0,1.3fr) 76px', gap: 12, padding: '10px 18px', fontSize: 10.5, fontWeight: 800, letterSpacing: '.11em', color: '#8A8C8A', borderBottom: '1px solid #EDEEED' }}>
          <div>NO.</div>
          <div>STAGE</div>
          <div>WHAT GETS SCORED</div>
          <div>METHOD</div>
          <div style={{ textAlign: 'right' }}>TARGET</div>
        </div>
        {ASSESS_ROWS_WIZ.map((it) => (
          <div key={it.a} style={{ display: 'grid', gridTemplateColumns: '44px 92px minmax(0,1.6fr) minmax(0,1.3fr) 76px', gap: 12, alignItems: 'baseline', padding: '13px 18px', borderTop: '1px solid #F0F1F0' }}>
            <div style={{ fontFamily: MONO, fontSize: 12.5, fontWeight: 600, color: '#141414' }}>{it.a}</div>
            <div style={{ fontFamily: MONO, fontSize: 11.5, color: '#3E403E' }}>{it.stage}</div>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: '#141414' }}>{it.what}</div>
            <div style={{ fontSize: 11.5, color: '#6B6D6B' }}>{it.method}</div>
            <div style={{ fontFamily: MONO, fontSize: 11.5, color: '#3E403E', textAlign: 'right' }}>{it.date}</div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 12, fontSize: 11.5, color: '#8A8C8A' }}>Scoring screens live in the field app — this schedule drives its assessment order, pick-lists and photo prompts.</div>
    </div>
  )
}

function StepReviewBridge() {
  const { nav } = useApp()
  return (
    <div style={{ maxWidth: 600, background: '#fff', border: '1px solid #E4E4E6', borderRadius: 10, padding: '26px 28px' }}>
      <div style={{ fontSize: 15, fontWeight: 800, color: '#141414' }}>Almost there — review happens on the trial page</div>
      <div style={{ fontSize: 12.5, color: '#3E403E', lineHeight: 1.6, marginTop: 7 }}>
        Submitting sends the full protocol — aim, site, treatments, layout and schedule — to a senior agronomist for sign-off. Nothing reaches the field app until they approve.
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
        <div onClick={() => nav('review')} className="hv-primary" style={{ padding: '9px 16px', background: '#007749', color: '#fff', fontSize: 13, fontWeight: 700, borderRadius: 8, cursor: 'pointer' }}>
          See what the approver sees →
        </div>
        <div style={{ padding: '9px 16px', background: '#fff', border: '1px solid #D8DAD8', color: '#8A8C8A', fontSize: 13, fontWeight: 700, borderRadius: 8 }}>Submit for approval</div>
      </div>
    </div>
  )
}

export default function Wizard() {
  const { s, set, nav } = useApp()
  const m = STEP_META[s.step] ?? STEP_META.treatments
  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', overflow: 'hidden' }}>
      <Stepper />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '16px 30px', borderBottom: '1px solid #E4E4E6', background: '#fff', flex: 'none' }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#141414' }}>{m.title}</div>
          <div style={{ fontSize: 12, color: '#8A8C8A' }}>{m.hint}</div>
          <div style={{ flex: 1 }} />
          <div style={{ fontSize: 11.5, color: '#8A8C8A' }}>Draft saved just now</div>
        </div>
        <div style={{ flex: 1, minWidth: 0, overflow: 'auto', padding: '22px 30px 30px' }}>
          {s.step === 'aim' && <StepAim />}
          {s.step === 'treatments' && <StepTreatments />}
          {s.step === 'rand' && <StepRandomisation />}
          {s.step === 'assess' && <StepAssess />}
          {s.step === 'review' && <StepReviewBridge />}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 30px', borderTop: '1px solid #E4E4E6', background: '#fff', flex: 'none' }}>
          <div style={{ fontSize: 12, color: '#8A8C8A' }}>{m.count}</div>
          <div style={{ flex: 1 }} />
          <div onClick={m.back ? () => set({ step: m.back! }) : undefined} style={{ padding: '9px 16px', background: '#fff', border: '1px solid #D8DAD8', color: '#3E403E', fontSize: 13, fontWeight: 700, borderRadius: 8, cursor: m.back ? 'pointer' : 'default', opacity: m.back ? 1 : 0.45 }}>
            Back
          </div>
          <div onClick={m.to ? () => set({ step: m.to! }) : () => nav('review')} className="hv-primary" style={{ padding: '9px 18px', background: '#007749', color: '#fff', fontSize: 13, fontWeight: 700, borderRadius: 8, cursor: 'pointer' }}>
            {m.next}
          </div>
        </div>
      </div>
    </div>
  )
}
