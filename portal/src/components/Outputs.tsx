/** Plans and signs — printable documents straight from the trial record:
 * trial plan, spray and mixing plan per timing, plot signs, site sign and
 * blank assessment sheets. Preview on the right, print (or save as PDF)
 * from the browser's dialog. */
import { useEffect, useMemo, useRef, useState } from 'react'
import { loadAssessments, loadLiveTrials, loadMeasureLibrary, loadTreatments, portalToken, type AssessmentRow, type LiveTrial, type MeasureDef, type TreatmentRow } from '../lib/db'
import { assessmentSheetHtml, documentHtml, plotSignsHtml, signCss, siteSignHtml, sprayPlanHtml, timingsOf, trialPlanHtml, type PlanData } from '../lib/printouts'
import { MONO, useApp } from '../state'

const GREEN = '#007749'
const GREY = '#8A8C8A'
const INK = '#141414'
const HAIR = '#E4E4E6'

type Kind = 'plan' | 'spray' | 'signs' | 'site' | 'sheet'
const KINDS: Array<{ id: Kind; label: string; blurb: string }> = [
  { id: 'plan', label: 'Trial plan', blurb: 'aim, site, treatments, plot plan, assessment schedule' },
  { id: 'spray', label: 'Spray and mixing plan', blurb: 'batch volumes and product amounts per treatment, tick boxes, application record' },
  { id: 'signs', label: 'Plot signs', blurb: 'one per plot or rep 1 only, 2 or 4 per A4 sheet' },
  { id: 'site', label: 'Site sign', blurb: 'A4 or A3 board at the gate: aim, treatments, LSD note' },
  { id: 'sheet', label: 'Assessment sheet', blurb: 'pen-and-paper scoring sheet in walk order, per timing' },
]

const sectionLabel: React.CSSProperties = { fontSize: 10.5, fontWeight: 800, letterSpacing: '.11em', color: GREY, marginBottom: 6 }
const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 11px', fontSize: 13, fontWeight: 600, border: '1px solid #D8DAD8', borderRadius: 8, outline: 'none', color: INK, background: '#fff', boxSizing: 'border-box' }
const card: React.CSSProperties = { background: '#fff', border: `1px solid ${HAIR}`, borderRadius: 12, padding: '14px 16px' }

export default function Outputs() {
  const { nav } = useApp()
  const [auth, setAuth] = useState<'loading' | 'ok' | 'signedout'>('loading')
  const [trials, setTrials] = useState<LiveTrial[]>([])
  const [trialId, setTrialId] = useState<string | null>(null)
  const [trts, setTrts] = useState<TreatmentRow[]>([])
  const [assess, setAssess] = useState<AssessmentRow[]>([])
  const [measures, setMeasures] = useState<Map<string, MeasureDef>>(new Map())
  const [kind, setKind] = useState<Kind>('plan')
  const [timing, setTiming] = useState('A')
  const [water, setWater] = useState(100)
  const [overage, setOverage] = useState(30)
  const [signSize, setSignSize] = useState<'a6' | 'a5'>('a6')
  const [repOne, setRepOne] = useState(false)
  const [blind, setBlind] = useState(false)
  const [sheetN, setSheetN] = useState(1)
  const frame = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    void (async () => {
      const token = await portalToken()
      if (!token) {
        setAuth('signedout')
        return
      }
      const [t, lib] = await Promise.all([loadLiveTrials(token), loadMeasureLibrary(token)])
      setTrials(t ?? [])
      setMeasures(new Map((lib ?? []).map((m) => [m.key, m])))
      const first = (t ?? []).find((x) => x.status === 'draft' || x.status === 'approved') ?? (t ?? [])[0]
      if (first) setTrialId(first.id)
      setAuth('ok')
    })()
  }, [])

  useEffect(() => {
    if (!trialId) return
    void (async () => {
      const token = await portalToken()
      if (!token) return
      const [tr, as] = await Promise.all([loadTreatments(trialId, token), loadAssessments(trialId, token)])
      setTrts(tr ?? [])
      setAssess(as ?? [])
      setSheetN(as?.[0]?.n ?? 1)
    })()
  }, [trialId])

  const trial = trials.find((t) => t.id === trialId) ?? null
  useEffect(() => {
    if (trial?.spraying?.waterRateLPerHa) setWater(trial.spraying.waterRateLPerHa)
  }, [trial])
  const timings = useMemo(() => timingsOf(trts), [trts])
  useEffect(() => {
    if (timings.length && !timings.includes(timing)) setTiming(timings[0])
  }, [timings]) // eslint-disable-line react-hooks/exhaustive-deps

  const html = useMemo(() => {
    if (!trial) return ''
    const d: PlanData = { trial, treatments: trts, assessments: assess, measures }
    switch (kind) {
      case 'plan':
        return documentHtml(`${trial.name} — trial plan`, trialPlanHtml(d))
      case 'spray':
        return documentHtml(`${trial.name} — spray plan ${timing}`, sprayPlanHtml(d, { timing, waterRateLPerHa: water, overage: overage / 100 }))
      case 'signs':
        return documentHtml(`${trial.name} — plot signs`, plotSignsHtml(d, { size: signSize, repOneOnly: repOne, blind }), signCss)
      case 'site':
        return documentHtml(`${trial.name} — site sign`, siteSignHtml(d))
      case 'sheet': {
        const a = assess.find((x) => x.n === sheetN) ?? assess[0]
        return a ? documentHtml(`${trial.name} — assessment ${a.n}`, assessmentSheetHtml(d, a)) : documentHtml(trial.name, '<p class="muted">No assessment timings on this trial yet. Add them in the builder or the trial editor.</p>')
      }
    }
  }, [trial, trts, assess, measures, kind, timing, water, overage, signSize, repOne, blind, sheetN])

  const print = () => {
    const w = frame.current?.contentWindow
    if (w) {
      w.focus()
      w.print()
    }
  }

  if (auth === 'signedout') {
    return (
      <div style={{ flex: 1, padding: 40 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: INK }}>Sign in to produce plans and signs</div>
        <div style={{ fontSize: 13, color: GREY, marginTop: 6 }}>Use the sign-in at the bottom of the sidebar.</div>
      </div>
    )
  }

  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', overflow: 'hidden' }}>
      <div style={{ width: 330, flex: 'none', borderRight: `1px solid ${HAIR}`, background: '#FBFCFB', padding: '20px 16px', overflow: 'auto', display: 'grid', gap: 12, alignContent: 'start' }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: INK }}>Plans and signs</div>
          <div style={{ fontSize: 12, color: GREY, marginTop: 2 }}>Printed straight from the record. Print, then save as PDF.</div>
        </div>
        <div>
          <div style={sectionLabel}>TRIAL</div>
          <select value={trialId ?? ''} onChange={(e) => setTrialId(e.target.value)} style={inputStyle}>
            {trials.map((t) => (
              <option key={t.id} value={t.id}>{t.name}{t.season ? ` · ${t.season}` : ''} · {t.status}</option>
            ))}
          </select>
          {trial && !trts.length && auth === 'ok' && <div style={{ fontSize: 11.5, color: '#A93414', marginTop: 6 }}>This trial has no treatments on the record yet.</div>}
        </div>
        <div>
          <div style={sectionLabel}>DOCUMENT</div>
          <div style={{ display: 'grid', gap: 6 }}>
            {KINDS.map((k) => {
              const on = kind === k.id
              return (
                <div key={k.id} onClick={() => setKind(k.id)} style={{ padding: '8px 11px', borderRadius: 9, cursor: 'pointer', border: `1.5px solid ${on ? GREEN : HAIR}`, background: on ? '#F3FAF6' : '#fff' }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: on ? '#00512F' : INK }}>{k.label}</div>
                  <div style={{ fontSize: 11, color: GREY, marginTop: 1 }}>{k.blurb}</div>
                </div>
              )
            })}
          </div>
        </div>
        {kind === 'spray' && (
          <div style={card}>
            <div style={sectionLabel}>SPRAY PLAN OPTIONS</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              <div>
                <div style={{ ...sectionLabel, fontSize: 9.5 }}>TIMING</div>
                <select value={timing} onChange={(e) => setTiming(e.target.value)} style={inputStyle}>
                  {(timings.length ? timings : ['A']).map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <div style={{ ...sectionLabel, fontSize: 9.5 }}>WATER L/HA</div>
                <input type="number" value={water} onChange={(e) => setWater(Number(e.target.value) || 100)} style={{ ...inputStyle, fontFamily: MONO }} />
              </div>
              <div>
                <div style={{ ...sectionLabel, fontSize: 9.5 }}>OVERAGE %</div>
                <input type="number" value={overage} onChange={(e) => setOverage(Math.max(0, Number(e.target.value) || 0))} style={{ ...inputStyle, fontFamily: MONO }} />
              </div>
            </div>
            <div style={{ fontSize: 11, color: GREY, marginTop: 8, lineHeight: 1.4 }}>Batch per treatment = plots × volume per plot × (1 + overage). Product amounts follow from the rate per hectare and the batch's area.</div>
          </div>
        )}
        {kind === 'signs' && (
          <div style={card}>
            <div style={sectionLabel}>SIGN OPTIONS</div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              {(['a6', 'a5'] as const).map((s) => (
                <span key={s} onClick={() => setSignSize(s)} style={{ fontSize: 11.5, fontWeight: 700, padding: '4px 10px', borderRadius: 99, cursor: 'pointer', border: `1.5px solid ${signSize === s ? GREEN : HAIR}`, color: signSize === s ? GREEN : '#3E403E', background: signSize === s ? '#E3F1EA' : '#fff' }}>{s === 'a6' ? 'A6 · 4 per sheet' : 'A5 · 2 per sheet'}</span>
              ))}
            </div>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5, color: '#3E403E', marginBottom: 6 }}>
              <input type="checkbox" checked={repOne} onChange={(e) => setRepOne(e.target.checked)} /> Rep 1 only (field-day row)
            </label>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5, color: '#3E403E' }}>
              <input type="checkbox" checked={blind} onChange={(e) => setBlind(e.target.checked)} /> Plot numbers only (blind assessment)
            </label>
          </div>
        )}
        {kind === 'sheet' && (
          <div style={card}>
            <div style={sectionLabel}>ASSESSMENT</div>
            <select value={sheetN} onChange={(e) => setSheetN(Number(e.target.value))} style={inputStyle}>
              {assess.map((a) => (
                <option key={a.n} value={a.n}>A{a.n} · {a.timing} · {a.measures.length} measures</option>
              ))}
            </select>
          </div>
        )}
        <div onClick={print} className="hv-primary" style={{ padding: '11px 14px', background: GREEN, color: '#fff', fontSize: 13, fontWeight: 700, borderRadius: 8, cursor: 'pointer', textAlign: 'center' }}>Print / save as PDF</div>
        <div style={{ fontSize: 11, color: GREY, lineHeight: 1.45 }}>
          Grower agreement and WHS site sheet are not here yet: their wording needs your sign-off before they print. <span onClick={() => nav('builder')} style={{ color: GREEN, fontWeight: 700, cursor: 'pointer' }}>New trial</span> builds the record these documents come from.
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 0, background: '#E9EBE9', padding: 18, overflow: 'hidden' }}>
        <iframe ref={frame} title="preview" srcDoc={html} style={{ width: '100%', height: '100%', border: `1px solid ${HAIR}`, borderRadius: 10, background: '#fff' }} />
      </div>
    </div>
  )
}
