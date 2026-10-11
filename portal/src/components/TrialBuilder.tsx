/** Trial builder — the live wizard. Collects a trial in five steps (basics and
 * site, treatments, design, assessments, review) against the real tables:
 * clients and sites are picked or created, treatments can start from a saved
 * protocol, the design step runs the advisor and the seeded randomiser, and
 * assessments come from the shared library with EPPO-coded targets. Saving
 * writes a draft trial with its treatments (plots allocated) and assessment
 * timings; the site planner then places the block on the map. The draft is
 * kept in localStorage so navigating away or reloading does not lose it. */
import { useEffect, useMemo, useRef, useState } from 'react'
import { advise, DESIGN_BLURB, DESIGN_LABEL, plan, TYPICAL_CV, type DesignType } from '../lib/design'
import { cellColors, randomSeed } from '../lib/layout'
import { loadProducts, searchPicker, type PickerProduct } from '../lib/products'
import {
  createClient, createSite, createTrial, createTrialGroup, loadAssessmentSets, loadClients, loadMeasureLibrary, loadProtocols, loadSites, loadTrialGroups, portalToken, recipeText, saveProtocol,
  type AssessmentDraft, type AssessmentSet, type ClientRow, type MeasureDef, type ProtocolRow, type SiteRow, type TreatmentDraft, type TreatmentLine, type TrialDraft, type TrialGroupRow,
} from '../lib/db'
import { MONO, useApp } from '../state'

const GREEN = '#007749'
const GREY = '#8A8C8A'
const INK = '#141414'
const HAIR = '#E4E4E6'
const DRAFT_KEY = 'tw.builderDraft'

type BStep = 'basics' | 'treatments' | 'design' | 'assess' | 'review'
const STEPS: Array<{ id: BStep; label: string; hint: string }> = [
  { id: 'basics', label: 'Aim, client and site', hint: 'what kind of trial, for whom, where' },
  { id: 'treatments', label: 'Treatments', hint: 'what goes on each plot, at which timing' },
  { id: 'design', label: 'Design and randomisation', hint: 'reps, layout and what the stats can separate' },
  { id: 'assess', label: 'Assessments', hint: 'standard measures and when they are scored' },
  { id: 'review', label: 'Review and save', hint: 'checks, then a draft trial on the backend' },
]

const UNITS = ['mL/ha', 'L/ha', 'g/ha', 'kg/ha', '% v/v', 'mL/100 L', 'g/100 L', 'mL/100 kg seed', 'g/100 kg seed', 'seeds/m²', 'plants/ha']
const TIMINGS = ['A', 'B', 'C', 'D']
const TRIAL_TYPES: Array<{ id: TrialDraft['trialType']; label: string; blurb: string; design: DesignType; reps: number }> = [
  { id: 'demonstration', label: 'Demonstration', blurb: 'Products side by side for growers to walk. Light replication, visual scoring, a field day.', design: 'RCBD', reps: 2 },
  { id: 'plot', label: 'Replicated plot trial', blurb: 'Small plots, 3 or 4 reps, analysed with LSD letters. The standard for product comparisons.', design: 'RCBD', reps: 4 },
  { id: 'paddock_scale', label: 'Paddock scale', blurb: 'Grower-width strips, scored by yield map, drone and probe. Tracked here from this season.', design: 'Strips', reps: 2 },
]

function initialDraft(): TrialDraft {
  const y = new Date().getFullYear()
  return {
    name: '',
    season: y,
    trialType: 'plot',
    crop: '',
    variety: '',
    sownDate: '',
    aim: '',
    clientId: null,
    siteId: null,
    protocolId: null,
    groupId: null,
    design: { type: 'RCBD', reps: 4, seed: randomSeed(), demoRep: false, spare: 0, plotW: 2, plotL: 12, cv: 15, rows: 0, positions: 0 },
    treatments: [{ n: 1, name: 'Untreated control', lines: [] }],
    assessments: [],
  }
}

function loadDraft(): TrialDraft {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (raw) {
      const d = JSON.parse(raw) as TrialDraft
      if (d && d.design && Array.isArray(d.treatments)) return d
    }
  } catch {
    /* fall through */
  }
  return initialDraft()
}

const sectionLabel: React.CSSProperties = { fontSize: 10.5, fontWeight: 800, letterSpacing: '.11em', color: GREY, marginBottom: 6 }
const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 11px', fontSize: 13, fontWeight: 600, border: '1px solid #D8DAD8', borderRadius: 8, outline: 'none', color: INK, background: '#fff', boxSizing: 'border-box' }
const smallInput: React.CSSProperties = { ...inputStyle, padding: '6px 8px', fontSize: 12.5 }
const card: React.CSSProperties = { background: '#fff', border: `1px solid ${HAIR}`, borderRadius: 12, padding: '14px 16px' }
const btn = (primary = false, disabled = false): React.CSSProperties => ({
  padding: '8px 14px', fontSize: 12.5, fontWeight: 700, borderRadius: 8, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1, whiteSpace: 'nowrap',
  background: primary ? GREEN : '#fff', color: primary ? '#fff' : '#3E403E', border: primary ? `1px solid ${GREEN}` : '1px solid #D8DAD8',
})
const chip = (on: boolean): React.CSSProperties => ({ fontSize: 11.5, fontWeight: 700, padding: '3px 10px', borderRadius: 99, cursor: 'pointer', border: `1.5px solid ${on ? GREEN : HAIR}`, color: on ? GREEN : '#3E403E', background: on ? '#E3F1EA' : '#fff' })
const warn: React.CSSProperties = { fontSize: 12, color: '#A93414', background: '#FBEDE8', border: '1px solid #F2C9BC', borderRadius: 8, padding: '7px 10px' }

interface Ref {
  clients: ClientRow[]
  sites: SiteRow[]
  protocols: ProtocolRow[]
  groups: TrialGroupRow[]
  sets: AssessmentSet[]
  measures: MeasureDef[]
}

export default function TrialBuilder() {
  const { nav } = useApp()
  const [step, setStep] = useState<BStep>('basics')
  const [d, setD] = useState<TrialDraft>(loadDraft)
  const [ref, setRef] = useState<Ref | null>(null)
  const [auth, setAuth] = useState<'loading' | 'ok' | 'signedout'>('loading')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState<{ id: string; ok: boolean; failed?: string } | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(d))
    } catch {
      /* private mode */
    }
  }, [d])

  const reload = async () => {
    const token = await portalToken()
    if (!token) {
      setAuth('signedout')
      return null
    }
    const [clients, sites, protocols, groups, sets, measures] = await Promise.all([loadClients(token), loadSites(token), loadProtocols(token), loadTrialGroups(token), loadAssessmentSets(token), loadMeasureLibrary(token)])
    setRef({ clients: clients ?? [], sites: sites ?? [], protocols: protocols ?? [], groups: groups ?? [], sets: sets ?? [], measures: measures ?? [] })
    setAuth('ok')
    return token
  }
  useEffect(() => {
    void reload()
  }, [])

  const patch = (p: Partial<TrialDraft>) => setD((x) => ({ ...x, ...p }))
  const patchDesign = (p: Partial<TrialDraft['design']>) => setD((x) => ({ ...x, design: { ...x.design, ...p } }))

  const nTrt = d.treatments.length
  const planned = useMemo(() => plan({ seed: d.design.seed, type: d.design.type as DesignType, nTrt, reps: d.design.reps, demoRep: d.design.demoRep, spare: d.design.spare }), [d.design.seed, d.design.type, nTrt, d.design.reps, d.design.demoRep, d.design.spare])
  useEffect(() => {
    if (planned.rows !== d.design.rows || planned.positions !== d.design.positions) patchDesign({ rows: planned.rows, positions: planned.positions })
  }, [planned.rows, planned.positions]) // eslint-disable-line react-hooks/exhaustive-deps

  const problems = useMemo(() => {
    const p: string[] = []
    if (!d.name.trim()) p.push('The trial needs a name.')
    if (!d.siteId) p.push('Pick or create the site.')
    if (nTrt < 2) p.push('At least two treatments.')
    if (d.treatments.some((t) => !t.name.trim())) p.push('Every treatment needs a name.')
    if (d.treatments.some((t) => t.lines.some((l) => !l.product.trim()))) p.push('A treatment line has no product.')
    if (d.design.type !== 'Demo' && d.design.reps < 2) p.push('Fewer than two reps: choose the demonstration design or add a rep.')
    if (!d.assessments.length) p.push('Add at least one assessment timing.')
    if (d.assessments.some((a) => !a.measures.length)) p.push('An assessment timing has no measures.')
    return p
  }, [d, nTrt])

  const save = async () => {
    if (problems.length || saving) return
    setSaving(true)
    setMsg(null)
    const token = await portalToken()
    if (!token) {
      setAuth('signedout')
      setSaving(false)
      return
    }
    const r = await createTrial(d, planned.byTrt, token)
    setSaved(r)
    setSaving(false)
    if (r.ok) {
      try {
        localStorage.removeItem(DRAFT_KEY)
      } catch {
        /* ignore */
      }
    }
  }

  if (auth === 'signedout') {
    return (
      <div style={{ flex: 1, padding: 40 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: INK }}>Sign in to build a trial</div>
        <div style={{ fontSize: 13, color: GREY, marginTop: 6 }}>Use the sign-in at the bottom of the sidebar. Trials are created as drafts in your organisation.</div>
      </div>
    )
  }

  const idx = STEPS.findIndex((s) => s.id === step)
  const cur = STEPS[idx]

  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', overflow: 'hidden' }}>
      <div style={{ width: 248, flex: 'none', borderRight: `1px solid ${HAIR}`, background: '#FBFCFB', padding: '20px 14px', overflow: 'auto' }}>
        <div onClick={() => nav('trials')} style={{ margin: '0 8px 14px', fontSize: 12, fontWeight: 700, color: GREY, cursor: 'pointer' }}>← Trials</div>
        <div style={{ margin: '0 8px 4px', fontSize: 10, fontWeight: 800, letterSpacing: '.14em', color: GREY }}>NEW TRIAL · DRAFT</div>
        <div style={{ margin: '0 8px 18px', fontSize: 14.5, fontWeight: 800, color: INK, lineHeight: 1.3, minHeight: 19 }}>{d.name.trim() || 'Untitled trial'}</div>
        {STEPS.map((s, i) => {
          const on = s.id === step
          const sub =
            s.id === 'basics' ? `${TRIAL_TYPES.find((t) => t.id === d.trialType)?.label ?? ''}${d.siteId ? ' · site set' : ''}`
            : s.id === 'treatments' ? `${nTrt} treatment${nTrt === 1 ? '' : 's'}`
            : s.id === 'design' ? `${d.design.type} · ${d.design.type === 'Demo' ? '1 rep' : `${d.design.type === 'Latin square' ? nTrt : d.design.reps} reps`} · seed ${d.design.seed}`
            : s.id === 'assess' ? `${d.assessments.length} timing${d.assessments.length === 1 ? '' : 's'}`
            : problems.length ? `${problems.length} to fix` : 'ready to save'
          return (
            <div key={s.id} onClick={() => setStep(s.id)} style={{ display: 'flex', gap: 11, padding: '9px 8px', borderRadius: 8, cursor: 'pointer', background: on ? '#E3F1EA' : 'transparent', marginBottom: 2, alignItems: 'flex-start' }}>
              <div style={{ width: 22, height: 22, flex: 'none', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, background: on ? GREEN : '#fff', color: on ? '#fff' : GREY, border: `1px solid ${on ? GREEN : '#D8DAD8'}` }}>{i + 1}</div>
              <div style={{ minWidth: 0, paddingTop: 2 }}>
                <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.2, color: on ? '#00512F' : '#3E403E' }}>{s.label}</div>
                <div style={{ fontSize: 11, color: GREY, marginTop: 2 }}>{sub}</div>
              </div>
            </div>
          )
        })}
        <div onClick={() => { if (confirm('Clear this draft and start again?')) { setD(initialDraft()); setSaved(null); setStep('basics') } }} style={{ margin: '18px 8px 0', fontSize: 11.5, fontWeight: 700, color: '#A93414', cursor: 'pointer' }}>Clear draft</div>
      </div>

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '22px 28px 0', flex: 'none' }}>
          <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.12em', color: GREY }}>STEP {idx + 1} OF {STEPS.length}</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: INK, marginTop: 2 }}>{cur.label}</div>
          <div style={{ fontSize: 12.5, color: GREY, marginTop: 2 }}>{cur.hint}</div>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '18px 28px 28px' }}>
          {auth === 'loading' && !ref ? <div style={{ fontSize: 12.5, color: GREY }}>Loading clients, sites, protocols and the assessment library…</div> : null}
          {ref && step === 'basics' && <StepBasics d={d} patch={patch} patchDesign={patchDesign} ref_={ref} reload={reload} setMsg={setMsg} />}
          {ref && step === 'treatments' && <StepTreatments d={d} patch={patch} />}
          {ref && step === 'design' && <StepDesign d={d} patchDesign={patchDesign} planned={planned} measures={ref.measures} />}
          {ref && step === 'assess' && <StepAssess d={d} patch={patch} ref_={ref} />}
          {ref && step === 'review' && <StepReview d={d} planned={planned} problems={problems} saving={saving} saved={saved} save={save} reload={reload} setMsg={setMsg} ref_={ref} />}
          {msg && <div style={{ ...warn, marginTop: 14 }}>{msg}</div>}
        </div>
        <div style={{ padding: '12px 28px', borderTop: `1px solid ${HAIR}`, background: '#fff', display: 'flex', gap: 10, flex: 'none' }}>
          <div onClick={idx > 0 ? () => setStep(STEPS[idx - 1].id) : undefined} style={btn(false, idx === 0)}>← Back</div>
          <div style={{ flex: 1 }} />
          {idx < STEPS.length - 1 ? (
            <div onClick={() => setStep(STEPS[idx + 1].id)} className="hv-primary" style={btn(true)}>Continue →</div>
          ) : (
            <div onClick={save} className="hv-primary" style={btn(true, problems.length > 0 || saving || (saved?.ok ?? false))}>{saving ? 'Saving…' : saved?.ok ? 'Saved' : 'Create draft trial'}</div>
          )}
        </div>
      </div>
    </div>
  )
}

// --- Step 1: basics, client, site, protocol ----------------------------------

function StepBasics({ d, patch, patchDesign, ref_, reload, setMsg }: { d: TrialDraft; patch: (p: Partial<TrialDraft>) => void; patchDesign: (p: Partial<TrialDraft['design']>) => void; ref_: Ref; reload: () => Promise<string | null>; setMsg: (m: string | null) => void }) {
  const [newClient, setNewClient] = useState<{ name: string; phone: string; email: string } | null>(null)
  const [newSite, setNewSite] = useState<{ property: string; town: string; paddock: string; lat: string; lng: string } | null>(null)
  const [newGroup, setNewGroup] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const sites = d.clientId ? ref_.sites.filter((s) => s.client_id === d.clientId || s.client_id === null) : ref_.sites

  const addClient = async () => {
    if (!newClient?.name.trim()) return
    setBusy(true)
    const token = await portalToken()
    const id = token ? await createClient(newClient.name.trim(), { phone: newClient.phone || undefined, email: newClient.email || undefined }, token) : null
    if (id) {
      await reload()
      patch({ clientId: id })
      setNewClient(null)
    } else setMsg('Could not save the client. Check you are signed in as a planner (admin or agronomist).')
    setBusy(false)
  }
  const addSite = async () => {
    if (!newSite?.property.trim()) return
    setBusy(true)
    const token = await portalToken()
    const lat = newSite.lat.trim() ? Number(newSite.lat) : null
    const lng = newSite.lng.trim() ? Number(newSite.lng) : null
    const id = token
      ? await createSite({ client_id: d.clientId, property: newSite.property.trim(), town: newSite.town.trim() || null, paddock: newSite.paddock.trim() || null, lat: Number.isFinite(lat as number) ? lat : null, lng: Number.isFinite(lng as number) ? lng : null, soil: null }, token)
      : null
    if (id) {
      await reload()
      patch({ siteId: id })
      setNewSite(null)
    } else setMsg('Could not save the site.')
    setBusy(false)
  }
  const addGroup = async () => {
    if (!newGroup?.trim()) return
    setBusy(true)
    const token = await portalToken()
    const id = token ? await createTrialGroup(newGroup.trim(), d.protocolId, token) : null
    if (id) {
      await reload()
      patch({ groupId: id })
      setNewGroup(null)
    } else setMsg('Could not save the trial group.')
    setBusy(false)
  }
  const applyProtocol = (id: string) => {
    const p = ref_.protocols.find((x) => x.id === id)
    if (!p) {
      patch({ protocolId: null })
      return
    }
    patch({ protocolId: id, treatments: p.treatments.map((t, i) => ({ ...t, n: i + 1 })), assessments: p.assessments.map((a, i) => ({ ...a, n: i + 1 })), crop: d.crop || p.crop || '' })
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 340px', gap: 18, alignItems: 'start' }}>
      <div style={{ display: 'grid', gap: 14 }}>
        <div style={card}>
          <div style={sectionLabel}>TRIAL TYPE</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {TRIAL_TYPES.map((t) => {
              const on = d.trialType === t.id
              return (
                <div key={t.id} onClick={() => { patch({ trialType: t.id }); patchDesign({ type: t.design, reps: t.reps, demoRep: t.id === 'demonstration' }) }} style={{ padding: '10px 12px', borderRadius: 10, cursor: 'pointer', border: `1.5px solid ${on ? GREEN : HAIR}`, background: on ? '#F3FAF6' : '#fff' }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: on ? '#00512F' : INK }}>{t.label}</div>
                  <div style={{ fontSize: 11.5, color: '#3E403E', marginTop: 4, lineHeight: 1.4 }}>{t.blurb}</div>
                </div>
              )
            })}
          </div>
        </div>
        <div style={card}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
            <div>
              <div style={sectionLabel}>TRIAL NAME</div>
              <input value={d.name} onChange={(e) => patch({ name: e.target.value })} placeholder="e.g. Lockhart Canola Fungicide 2027" style={inputStyle} />
            </div>
            <div>
              <div style={sectionLabel}>SEASON (HARVEST YEAR)</div>
              <input type="number" value={d.season} onChange={(e) => patch({ season: Number(e.target.value) || d.season })} style={inputStyle} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginTop: 12 }}>
            <div>
              <div style={sectionLabel}>CROP</div>
              <input value={d.crop} onChange={(e) => patch({ crop: e.target.value })} placeholder="Wheat" style={inputStyle} />
            </div>
            <div>
              <div style={sectionLabel}>VARIETY</div>
              <input value={d.variety} onChange={(e) => patch({ variety: e.target.value })} placeholder="Scepter" style={inputStyle} />
            </div>
            <div>
              <div style={sectionLabel}>SOWN (OR PLANNED)</div>
              <input type="date" value={d.sownDate} onChange={(e) => patch({ sownDate: e.target.value })} style={inputStyle} />
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <div style={sectionLabel}>AIM</div>
            <textarea value={d.aim} onChange={(e) => patch({ aim: e.target.value })} rows={3} placeholder="What question does this trial answer, and for whom? One or two sentences; this goes on the plan and the sign." style={{ ...inputStyle, fontWeight: 500, resize: 'vertical', lineHeight: 1.45 }} />
          </div>
        </div>
        <div style={card}>
          <div style={sectionLabel}>START FROM A PROTOCOL (OPTIONAL)</div>
          {ref_.protocols.length ? (
            <select value={d.protocolId ?? ''} onChange={(e) => applyProtocol(e.target.value)} style={inputStyle}>
              <option value="">— build from scratch —</option>
              {ref_.protocols.map((p) => (
                <option key={p.id} value={p.id}>{p.name}{p.crop ? ` · ${p.crop}` : ''} · {p.treatments.length} trts, {p.assessments.length} timings</option>
              ))}
            </select>
          ) : (
            <div style={{ fontSize: 12.5, color: GREY }}>No saved protocols yet. On the review step you can save this trial's treatments and assessments as a protocol, so the same trial can be run at several sites.</div>
          )}
          <div style={{ ...sectionLabel, marginTop: 12 }}>TRIAL GROUP (SAME PROTOCOL ACROSS SITES, OPTIONAL)</div>
          {newGroup === null ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <select value={d.groupId ?? ''} onChange={(e) => patch({ groupId: e.target.value || null })} style={inputStyle}>
                <option value="">— none —</option>
                {ref_.groups.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
              <div onClick={() => setNewGroup('')} style={btn()}>+ New group</div>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              <input autoFocus value={newGroup} onChange={(e) => setNewGroup(e.target.value)} placeholder="e.g. Canola fungicide series 2027" style={inputStyle} />
              <div onClick={addGroup} style={btn(true, busy || !newGroup.trim())}>Save</div>
              <div onClick={() => setNewGroup(null)} style={btn()}>Cancel</div>
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gap: 14 }}>
        <div style={card}>
          <div style={sectionLabel}>CLIENT (GROWER)</div>
          {newClient === null ? (
            <>
              <select value={d.clientId ?? ''} onChange={(e) => patch({ clientId: e.target.value || null, siteId: null })} style={inputStyle}>
                <option value="">— no client recorded —</option>
                {ref_.clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <div onClick={() => setNewClient({ name: '', phone: '', email: '' })} style={{ ...btn(), marginTop: 8, display: 'inline-block' }}>+ New client</div>
            </>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              <input autoFocus value={newClient.name} onChange={(e) => setNewClient({ ...newClient, name: e.target.value })} placeholder="Grower or business name" style={inputStyle} />
              <input value={newClient.phone} onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })} placeholder="Phone" style={inputStyle} />
              <input value={newClient.email} onChange={(e) => setNewClient({ ...newClient, email: e.target.value })} placeholder="Email" style={inputStyle} />
              <div style={{ display: 'flex', gap: 8 }}>
                <div onClick={addClient} style={btn(true, busy || !newClient.name.trim())}>Save client</div>
                <div onClick={() => setNewClient(null)} style={btn()}>Cancel</div>
              </div>
            </div>
          )}
          <div style={{ fontSize: 11.5, color: GREY, marginTop: 8, lineHeight: 1.4 }}>The grower agreement and the site WHS sheet are produced per client once the trial is saved.</div>
        </div>
        <div style={card}>
          <div style={sectionLabel}>SITE</div>
          {newSite === null ? (
            <>
              <select value={d.siteId ?? ''} onChange={(e) => patch({ siteId: e.target.value || null })} style={inputStyle}>
                <option value="">— pick a site —</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>{s.property}{s.town && s.town !== s.property ? ` · ${s.town}` : ''}{s.paddock ? ` · ${s.paddock}` : ''}</option>
                ))}
              </select>
              <div onClick={() => setNewSite({ property: '', town: '', paddock: '', lat: '', lng: '' })} style={{ ...btn(), marginTop: 8, display: 'inline-block' }}>+ New site</div>
              <div style={{ fontSize: 11.5, color: GREY, marginTop: 8, lineHeight: 1.4 }}>Several trials can sit at one site. The outline and the block go on the site planner after saving.</div>
            </>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              <input autoFocus value={newSite.property} onChange={(e) => setNewSite({ ...newSite, property: e.target.value })} placeholder="Property name" style={inputStyle} />
              <input value={newSite.town} onChange={(e) => setNewSite({ ...newSite, town: e.target.value })} placeholder="Nearest town" style={inputStyle} />
              <input value={newSite.paddock} onChange={(e) => setNewSite({ ...newSite, paddock: e.target.value })} placeholder="Paddock name" style={inputStyle} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <input value={newSite.lat} onChange={(e) => setNewSite({ ...newSite, lat: e.target.value })} placeholder="Lat (-35.1234)" style={{ ...inputStyle, fontFamily: MONO }} />
                <input value={newSite.lng} onChange={(e) => setNewSite({ ...newSite, lng: e.target.value })} placeholder="Lng (147.1234)" style={{ ...inputStyle, fontFamily: MONO }} />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <div onClick={addSite} style={btn(true, busy || !newSite.property.trim())}>Save site</div>
                <div onClick={() => setNewSite(null)} style={btn()}>Cancel</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// --- Step 2: treatments ------------------------------------------------------

function StepTreatments({ d, patch }: { d: TrialDraft; patch: (p: Partial<TrialDraft>) => void }) {
  const [products, setProducts] = useState<PickerProduct[] | null>(null)
  useEffect(() => {
    let live = true
    loadProducts().then((p) => live && setProducts(p)).catch(() => {})
    return () => {
      live = false
    }
  }, [])

  const setT = (i: number, t: TreatmentDraft) => patch({ treatments: d.treatments.map((x, j) => (j === i ? t : x)) })
  const addT = () => {
    const last = d.treatments[d.treatments.length - 1]
    const lines: TreatmentLine[] = last && last.lines.length ? last.lines.map((l) => ({ ...l })) : [{ timing: 'A', product: '', rate: null, unit: 'mL/ha' }]
    patch({ treatments: [...d.treatments, { n: d.treatments.length + 1, name: '', lines }] })
  }
  const removeT = (i: number) => patch({ treatments: d.treatments.filter((_, j) => j !== i).map((t, j) => ({ ...t, n: j + 1 })) })
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= d.treatments.length) return
    const arr = [...d.treatments]
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
    patch({ treatments: arr.map((t, k) => ({ ...t, n: k + 1 })) })
  }
  const timings = [...new Set(d.treatments.flatMap((t) => t.lines.map((l) => l.timing)))].sort()

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ fontSize: 12.5, color: '#3E403E', lineHeight: 1.5 }}>
        Treatment 1 is normally the untreated control and the district standard sits next to it. Each line is one product at one timing; a two-spray program is two lines (A and B). Registered products come from the APVMA list as you type; anything else is saved as typed and flagged EXP on maps and signs.
        {timings.length ? <span style={{ color: GREY }}> Timings in use: {timings.join(', ')}.</span> : null}
      </div>
      {d.treatments.map((t, i) => (
        <div key={i} style={{ ...card, padding: '10px 14px' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div style={{ width: 34, height: 34, flex: 'none', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, ...cellColors(t.n), border: cellColors(t.n).border }}>T{t.n}</div>
            <input value={t.name} onChange={(e) => setT(i, { ...t, name: e.target.value })} placeholder={i === 0 ? 'Untreated control' : 'Treatment name, e.g. Prosaro 300 mL/ha at A'} style={{ ...inputStyle, flex: 1 }} />
            <div onClick={() => move(i, -1)} title="Move up" style={{ ...btn(), padding: '6px 9px' }}>↑</div>
            <div onClick={() => move(i, 1)} title="Move down" style={{ ...btn(), padding: '6px 9px' }}>↓</div>
            <div onClick={() => removeT(i)} title="Remove treatment" style={{ ...btn(), padding: '6px 9px', color: '#A93414' }}>×</div>
          </div>
          <div style={{ marginLeft: 44, marginTop: 8, display: 'grid', gap: 6 }}>
            {t.lines.map((l, k) => (
              <LineRow key={k} line={l} products={products} onChange={(nl) => setT(i, { ...t, lines: t.lines.map((x, m) => (m === k ? nl : x)) })} onRemove={() => setT(i, { ...t, lines: t.lines.filter((_, m) => m !== k) })} />
            ))}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div onClick={() => setT(i, { ...t, lines: [...t.lines, { timing: t.lines[t.lines.length - 1]?.timing ?? 'A', product: '', rate: null, unit: 'mL/ha' }] })} style={{ ...btn(), padding: '5px 10px', fontSize: 12 }}>+ Product line</div>
              <input value={t.note ?? ''} onChange={(e) => setT(i, { ...t, note: e.target.value || undefined })} placeholder="Note (adjuvant, water rate, why it is in)" style={{ ...smallInput, flex: 1, fontWeight: 500 }} />
            </div>
            {t.lines.length || /untreated|nil|control/i.test(t.name) ? <div style={{ fontSize: 11.5, color: GREY, fontFamily: MONO }}>{recipeText(t) || '—'}</div> : null}
          </div>
        </div>
      ))}
      <div>
        <div onClick={addT} style={{ ...btn(true), display: 'inline-block' }}>+ Add treatment</div>
      </div>
    </div>
  )
}

function LineRow({ line, products, onChange, onRemove }: { line: TreatmentLine; products: PickerProduct[] | null; onChange: (l: TreatmentLine) => void; onRemove: () => void }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const q = line.product.trim()
  const hits = useMemo(() => (open && products && q.length >= 2 ? searchPicker(products, q, 8) : []), [open, products, q])
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '56px minmax(0, 1fr) 90px 130px 28px', gap: 6, alignItems: 'center' }}>
      <select value={line.timing} onChange={(e) => onChange({ ...line, timing: e.target.value })} style={smallInput} title="Application timing">
        {TIMINGS.map((t) => (
          <option key={t} value={t}>{t}</option>
        ))}
      </select>
      <div ref={box} style={{ position: 'relative' }}>
        <input value={line.product} onChange={(e) => { onChange({ ...line, product: e.target.value, exp: false }); setOpen(true) }} onFocus={() => setOpen(true)} placeholder="Product (type to search the APVMA list)" style={{ ...smallInput, borderColor: line.exp ? '#cf4520' : '#D8DAD8' }} />
        {line.exp && <span style={{ position: 'absolute', right: 8, top: 7, fontSize: 9.5, fontWeight: 800, color: '#cf4520', letterSpacing: '.08em' }}>EXP</span>}
        {open && q.length >= 2 && (
          <div style={{ position: 'absolute', left: 0, right: 0, top: '100%', zIndex: 20, background: '#fff', border: `1px solid ${HAIR}`, borderRadius: 8, boxShadow: '0 8px 24px rgba(10,26,18,.14)', maxHeight: 260, overflow: 'auto' }}>
            {hits.map((p) => (
              <div key={p.name + p.co} onMouseDown={() => { onChange({ ...line, product: p.name, exp: false }); setOpen(false) }} style={{ padding: '7px 10px', cursor: 'pointer', borderBottom: `1px solid #F1F2F1` }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: INK }}>{p.name} <span style={{ fontWeight: 500, color: GREY }}>· {p.co}</span></div>
                <div style={{ fontSize: 11, color: '#3E403E' }}>{p.actives}</div>
              </div>
            ))}
            <div onMouseDown={() => { onChange({ ...line, exp: true }); setOpen(false) }} style={{ padding: '7px 10px', cursor: 'pointer', fontSize: 12, color: '#cf4520', fontWeight: 700 }}>
              Use “{q}” as typed — experimental or unregistered (EXP)
            </div>
            {!products && <div style={{ padding: '7px 10px', fontSize: 11.5, color: GREY }}>Loading the product list…</div>}
          </div>
        )}
      </div>
      <input type="number" step="any" value={line.rate ?? ''} onChange={(e) => onChange({ ...line, rate: e.target.value === '' ? null : Number(e.target.value) })} placeholder="Rate" style={{ ...smallInput, fontFamily: MONO }} />
      <select value={line.unit} onChange={(e) => onChange({ ...line, unit: e.target.value })} style={smallInput}>
        {UNITS.map((u) => (
          <option key={u} value={u}>{u}</option>
        ))}
      </select>
      <div onClick={onRemove} title="Remove line" style={{ fontSize: 14, color: GREY, cursor: 'pointer', textAlign: 'center' }}>×</div>
    </div>
  )
}

// --- Step 3: design and randomisation ---------------------------------------

function StepDesign({ d, patchDesign, planned, measures }: { d: TrialDraft; patchDesign: (p: Partial<TrialDraft['design']>) => void; planned: ReturnType<typeof plan>; measures: MeasureDef[] }) {
  const nTrt = d.treatments.length
  const type = d.design.type as DesignType
  const advice = useMemo(() => advise({ type, nTrt, reps: d.design.reps, cv: d.design.cv, demoRep: d.design.demoRep }), [type, nTrt, d.design.reps, d.design.cv, d.design.demoRep])

  /** The CV the chosen assessments suggest, from the library's measure groups. */
  const suggestedCv = useMemo(() => {
    const groups = d.assessments.flatMap((a) => a.measures.map((m) => measures.find((x) => x.key === m)?.group_key)).filter((g): g is string => !!g)
    if (!groups.length) return null
    const primary = groups.includes('yield') ? 'yield' : groups[0]
    return TYPICAL_CV[primary] ? { group: primary, ...TYPICAL_CV[primary] } : null
  }, [d.assessments, measures])

  const totalPlots = planned.bands.reduce((n, b) => n + b.cells.length, 0)
  const areaHa = (totalPlots * d.design.plotW * d.design.plotL) / 10000
  const verdictStyle: Record<string, { bg: string; fg: string; text: string }> = {
    good: { bg: '#E3F1EA', fg: '#00623C', text: 'Good separation' },
    fair: { bg: '#FFF4D6', fg: '#8A5A00', text: 'Fair: picks up moderate effects' },
    weak: { bg: '#FBEDE8', fg: '#A93414', text: 'Weak: only large effects' },
    none: { bg: '#EEF0EE', fg: '#6B6D6B', text: 'No statistics' },
  }
  const v = verdictStyle[advice.verdict]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 360px', gap: 18, alignItems: 'start' }}>
      <div style={{ display: 'grid', gap: 14 }}>
        <div style={card}>
          <div style={sectionLabel}>DESIGN</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
            {(Object.keys(DESIGN_LABEL) as DesignType[]).map((k) => {
              const on = type === k
              return (
                <div key={k} onClick={() => patchDesign({ type: k, reps: k === 'Demo' ? 1 : k === 'Latin square' ? nTrt : Math.max(2, d.design.reps), demoRep: k === 'RCBD' || k === 'Strips' ? d.design.demoRep : false })} style={{ padding: '9px 10px', borderRadius: 9, cursor: 'pointer', border: `1.5px solid ${on ? GREEN : HAIR}`, background: on ? '#F3FAF6' : '#fff' }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: on ? '#00512F' : INK, lineHeight: 1.2 }}>{DESIGN_LABEL[k]}</div>
                </div>
              )
            })}
          </div>
          <div style={{ fontSize: 12.5, color: '#3E403E', marginTop: 10, lineHeight: 1.5 }}>{DESIGN_BLURB[type]}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginTop: 14 }}>
            <div>
              <div style={sectionLabel}>REPS</div>
              <input type="number" min={1} max={8} value={type === 'Latin square' ? nTrt : d.design.reps} disabled={type === 'Demo' || type === 'Latin square'} onChange={(e) => patchDesign({ reps: Math.max(1, Math.min(8, Number(e.target.value) || 1)) })} style={{ ...inputStyle, fontFamily: MONO }} />
            </div>
            <div>
              <div style={sectionLabel}>SPARE / BUFFER</div>
              <input type="number" min={0} max={4} value={d.design.spare} onChange={(e) => patchDesign({ spare: Math.max(0, Math.min(4, Number(e.target.value) || 0)) })} style={{ ...inputStyle, fontFamily: MONO }} title="Spare cells at the end of each rep" />
            </div>
            <div>
              <div style={sectionLabel}>PLOT WIDTH M</div>
              <input type="number" step="0.1" value={d.design.plotW} onChange={(e) => patchDesign({ plotW: Number(e.target.value) || d.design.plotW })} style={{ ...inputStyle, fontFamily: MONO }} />
            </div>
            <div>
              <div style={sectionLabel}>PLOT LENGTH M</div>
              <input type="number" step="0.5" value={d.design.plotL} onChange={(e) => patchDesign({ plotL: Number(e.target.value) || d.design.plotL })} style={{ ...inputStyle, fontFamily: MONO }} />
            </div>
            <div>
              <div style={sectionLabel}>SEED</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <input value={d.design.seed} onChange={(e) => patchDesign({ seed: e.target.value.toUpperCase().slice(0, 8) })} style={{ ...inputStyle, fontFamily: MONO }} />
                <div onClick={() => patchDesign({ seed: randomSeed() })} title="Re-randomise" style={{ ...btn(), padding: '6px 9px' }}>↻</div>
              </div>
            </div>
          </div>
          {(type === 'RCBD' || type === 'Strips') && (
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12, fontSize: 12.5, color: '#3E403E', cursor: 'pointer' }}>
              <input type="checkbox" checked={d.design.demoRep} onChange={(e) => patchDesign({ demoRep: e.target.checked })} />
              Lay rep 1 out in treatment order (demonstration rep for the field day walk); reps 2 onwards randomised
            </label>
          )}
          <div style={{ fontSize: 11.5, color: GREY, marginTop: 10 }}>
            {planned.rows} rows × {planned.positions} positions · {totalPlots} plots of {d.design.plotW} × {d.design.plotL} m · {areaHa < 0.1 ? `${Math.round(areaHa * 10000)} m²` : `${areaHa.toFixed(2)} ha`} before alleys · plot = rep × 100 + position
          </div>
        </div>

        <div style={card}>
          <div style={sectionLabel}>PLOT PLAN · SEED {d.design.seed}</div>
          <div style={{ display: 'grid', gap: 4, overflow: 'auto' }}>
            {planned.bands.map((b) => (
              <div key={b.rep} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <div style={{ width: 86, flex: 'none', fontSize: 10, fontWeight: 800, letterSpacing: '.08em', color: GREY }}>{b.label}</div>
                {b.cells.map((c) => {
                  const cc = cellColors(c.trt)
                  return (
                    <div key={c.plot} title={c.trt ? `Plot ${c.plot} · T${c.trt} ${d.treatments[c.trt - 1]?.name ?? ''}` : `Plot ${c.plot} · spare`} style={{ width: 46, height: 40, flex: 'none', borderRadius: 6, background: cc.bg, color: cc.fg, border: cc.border, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', lineHeight: 1.1 }}>
                      <div style={{ fontSize: 9.5, fontFamily: MONO, opacity: 0.8 }}>{c.plot}</div>
                      <div style={{ fontSize: 12, fontWeight: 800 }}>{c.trt ? `T${c.trt}` : 'SP'}</div>
                    </div>
                  )
                })}
              </div>
            ))}
            {!planned.bands.length && <div style={{ fontSize: 12.5, color: GREY }}>Add treatments to see the plan.</div>}
          </div>
          <div style={{ fontSize: 11.5, color: GREY, marginTop: 10, lineHeight: 1.45 }}>
            The seed fixes the randomisation: the same seed gives the same plan on any machine, so the plan can be regenerated from the trial record. Change the seed if the draw puts the same treatments side by side in every rep.
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 14 }}>
        <div style={card}>
          <div style={sectionLabel}>DESIGN ADVISOR</div>
          <div style={{ display: 'inline-block', fontSize: 12, fontWeight: 800, padding: '4px 10px', borderRadius: 99, background: v.bg, color: v.fg }}>{v.text}</div>
          {advice.lsdPct !== null && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 30, fontWeight: 800, color: INK, fontFamily: MONO, lineHeight: 1 }}>{advice.lsdPct.toFixed(0)}%</div>
              <div style={{ fontSize: 11.5, color: GREY, marginTop: 3 }}>smallest difference separable at LSD 5%, as % of the mean · {advice.dfError} error df</div>
            </div>
          )}
          <div style={{ marginTop: 12 }}>
            <div style={sectionLabel}>EXPECTED CV %</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="number" min={2} max={60} value={d.design.cv} onChange={(e) => patchDesign({ cv: Math.max(1, Math.min(80, Number(e.target.value) || 1)) })} style={{ ...inputStyle, width: 80, fontFamily: MONO }} />
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                {Object.entries(TYPICAL_CV).map(([g, x]) => (
                  <span key={g} onClick={() => patchDesign({ cv: x.cv })} title={x.note} style={chip(d.design.cv === x.cv)}>{g} {x.cv}</span>
                ))}
              </div>
            </div>
            {suggestedCv && suggestedCv.cv !== d.design.cv && (
              <div style={{ fontSize: 11.5, color: '#3E403E', marginTop: 6 }}>
                Your assessments are mostly <b>{suggestedCv.group}</b> measures, which usually run about {suggestedCv.cv}% CV ({suggestedCv.note}). <span onClick={() => patchDesign({ cv: suggestedCv.cv })} style={{ color: GREEN, fontWeight: 700, cursor: 'pointer' }}>Use {suggestedCv.cv}%</span>
              </div>
            )}
          </div>
          <div style={{ marginTop: 12, display: 'grid', gap: 7 }}>
            {advice.lines.map((l, i) => (
              <div key={i} style={{ fontSize: 12.5, color: '#3E403E', lineHeight: 1.5, paddingLeft: 10, borderLeft: `3px solid ${i === 0 ? GREEN : HAIR}` }}>{l}</div>
            ))}
          </div>
          {advice.options.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={sectionLabel}>WHAT ELSE WOULD BUY</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <tbody>
                  {advice.options.map((o) => (
                    <tr key={o.label} onClick={() => patchDesign({ type: o.type, reps: o.reps, demoRep: o.type === 'RCBD' || o.type === 'Strips' ? d.design.demoRep : false })} style={{ cursor: 'pointer' }} className="hv-row">
                      <td style={{ padding: '4px 0', color: INK, fontWeight: 600, borderBottom: `1px solid #F1F2F1` }}>{o.label}</td>
                      <td style={{ padding: '4px 0', textAlign: 'right', fontFamily: MONO, color: o.lsdPct === null ? GREY : o.lsdPct <= 12 ? '#00623C' : o.lsdPct <= 25 ? '#8A5A00' : '#A93414', borderBottom: `1px solid #F1F2F1` }}>{o.lsdPct === null ? '—' : `${o.lsdPct.toFixed(0)}%`}</td>
                      <td style={{ padding: '4px 0 4px 8px', textAlign: 'right', fontFamily: MONO, color: GREY, borderBottom: `1px solid #F1F2F1` }}>{o.type === 'Latin square' ? nTrt * nTrt : nTrt * o.reps} plots</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ fontSize: 11, color: GREY, marginTop: 6 }}>Click a row to switch to it. Figures assume the same CV.</div>
            </div>
          )}
        </div>
        <div style={{ ...card, background: '#FBFCFB' }}>
          <div style={sectionLabel}>DEMONSTRATION VS STATISTICS</div>
          <div style={{ fontSize: 12, color: '#3E403E', lineHeight: 1.5 }}>
            A field day wants the untreated beside the standard and the products in a sensible order; the analysis wants every rep randomised. The compromise that keeps both honest: a systematic rep 1 along the road for walking, randomised reps behind it, and the untreated repeated as a spare at the far end so visitors see it twice. Signs quote the LSD so a visual difference smaller than it is not oversold.
          </div>
        </div>
      </div>
    </div>
  )
}

// --- Step 4: assessments -----------------------------------------------------

function StepAssess({ d, patch, ref_ }: { d: TrialDraft; patch: (p: Partial<TrialDraft>) => void; ref_: Ref }) {
  const [setKey, setSetKey] = useState('')
  const [adding, setAdding] = useState<number | null>(null)
  const [q, setQ] = useState('')
  const lib = ref_.measures
  const byKey = useMemo(() => new Map(lib.map((m) => [m.key, m])), [lib])
  const canonical = useMemo(() => lib.filter((m) => !m.canonical), [lib])

  const applySet = () => {
    const s = ref_.sets.find((x) => x.key === setKey)
    if (!s) return
    const order: string[] = []
    const byTiming = new Map<string, { measures: string[]; notes: string[] }>()
    for (const it of s.items) {
      if (!byTiming.has(it.timing)) {
        byTiming.set(it.timing, { measures: [], notes: [] })
        order.push(it.timing)
      }
      const g = byTiming.get(it.timing)!
      if (!g.measures.includes(it.measure)) g.measures.push(it.measure)
      if (it.note) g.notes.push(`${byKey.get(it.measure)?.label ?? it.measure}: ${it.note}`)
    }
    patch({ assessments: order.map((timing, i) => ({ n: i + 1, timing, measures: byTiming.get(timing)!.measures, blind: false, note: byTiming.get(timing)!.notes.join(' · ') || undefined })) })
  }
  const setA = (i: number, a: AssessmentDraft) => patch({ assessments: d.assessments.map((x, j) => (j === i ? a : x)) })
  const addA = () => patch({ assessments: [...d.assessments, { n: d.assessments.length + 1, timing: '', measures: [], blind: false }] })
  const removeA = (i: number) => patch({ assessments: d.assessments.filter((_, j) => j !== i).map((a, j) => ({ ...a, n: j + 1 })) })

  const groups = useMemo(() => {
    const g = new Map<string, MeasureDef[]>()
    const ql = q.trim().toLowerCase()
    for (const m of canonical) {
      if (ql && !`${m.label} ${m.key} ${m.taxa?.scientific ?? ''} ${m.taxa?.common ?? ''} ${m.target ?? ''}`.toLowerCase().includes(ql)) continue
      ;(g.get(m.group_key ?? 'other') ?? g.set(m.group_key ?? 'other', []).get(m.group_key ?? 'other')!).push(m)
    }
    return [...g.entries()]
  }, [canonical, q])

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={card}>
        <div style={sectionLabel}>START FROM A STANDARD SET</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <select value={setKey} onChange={(e) => setSetKey(e.target.value)} style={inputStyle}>
            <option value="">— choose a set —</option>
            {ref_.sets.map((s) => (
              <option key={s.key} value={s.key}>{s.name} · {s.items.length} items{s.org_id ? ' · ours' : ''}</option>
            ))}
          </select>
          <div onClick={applySet} style={btn(true, !setKey)}>Apply</div>
        </div>
        <div style={{ fontSize: 11.5, color: GREY, marginTop: 8, lineHeight: 1.45 }}>
          Sets group the library's standard measures by timing. Applying one replaces the timings below; then add, remove or rename as the trial needs. Each measure carries its EPPO-coded target and rating type, so exports read the same to another company.
        </div>
      </div>

      {d.assessments.map((a, i) => (
        <div key={i} style={{ ...card, padding: '10px 14px' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div style={{ width: 34, height: 34, flex: 'none', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, background: '#E3F1EA', color: '#00623C' }}>A{a.n}</div>
            <input value={a.timing} onChange={(e) => setA(i, { ...a, timing: e.target.value })} placeholder="Timing, e.g. 14 to 21 DAB or GS39" style={{ ...inputStyle, flex: 1 }} />
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: '#3E403E', whiteSpace: 'nowrap' }} title="Scorers see plot numbers only, not treatments">
              <input type="checkbox" checked={a.blind} onChange={(e) => setA(i, { ...a, blind: e.target.checked })} /> blind
            </label>
            <div onClick={() => removeA(i)} title="Remove timing" style={{ ...btn(), padding: '6px 9px', color: '#A93414' }}>×</div>
          </div>
          <div style={{ marginLeft: 44, marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {a.measures.map((k) => {
              const m = byKey.get(k)
              return (
                <span key={k} title={m ? [m.taxa?.scientific, m.target && `EPPO ${m.target}`, m.rating, m.unit, m.sample].filter(Boolean).join(' · ') : 'not in the library'} style={{ ...chip(true), cursor: 'default', display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                  {m?.label ?? k}
                  {m?.target && <span style={{ fontFamily: MONO, fontSize: 10, color: '#00623C', opacity: 0.8 }}>{m.target}</span>}
                  <span onClick={() => setA(i, { ...a, measures: a.measures.filter((x) => x !== k) })} style={{ cursor: 'pointer', color: GREY }}>×</span>
                </span>
              )
            })}
            <span onClick={() => { setAdding(adding === i ? null : i); setQ('') }} style={chip(false)}>{adding === i ? 'done' : '+ measure'}</span>
          </div>
          {adding === i && (
            <div style={{ marginLeft: 44, marginTop: 8, border: `1px solid ${HAIR}`, borderRadius: 10, padding: 10, background: '#FBFCFB' }}>
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search measures, targets or EPPO codes" style={{ ...smallInput, marginBottom: 8 }} />
              <div style={{ maxHeight: 260, overflow: 'auto', display: 'grid', gap: 8 }}>
                {groups.map(([g, ms]) => (
                  <div key={g}>
                    <div style={{ ...sectionLabel, marginBottom: 4 }}>{g.toUpperCase()}</div>
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                      {ms.map((m) => {
                        const on = a.measures.includes(m.key)
                        return (
                          <span key={m.key} onClick={() => setA(i, { ...a, measures: on ? a.measures.filter((x) => x !== m.key) : [...a.measures, m.key] })} title={[m.taxa?.scientific, m.rating, m.unit, m.sample].filter(Boolean).join(' · ')} style={chip(on)}>
                            {m.label}
                            {m.target ? <span style={{ fontFamily: MONO, fontSize: 10, marginLeft: 5, opacity: 0.7 }}>{m.target}</span> : null}
                          </span>
                        )
                      })}
                    </div>
                  </div>
                ))}
                {!groups.length && <div style={{ fontSize: 12, color: GREY }}>Nothing in the library matches. New measures are added to the shared library, not typed per trial, so they stay comparable.</div>}
              </div>
            </div>
          )}
          {a.note && <div style={{ marginLeft: 44, marginTop: 6, fontSize: 11.5, color: GREY }}>{a.note}</div>}
        </div>
      ))}
      <div>
        <div onClick={addA} style={{ ...btn(true), display: 'inline-block' }}>+ Add timing</div>
      </div>
    </div>
  )
}

// --- Step 5: review and save -------------------------------------------------

function StepReview({ d, planned, problems, saving, saved, save, reload, setMsg, ref_ }: { d: TrialDraft; planned: ReturnType<typeof plan>; problems: string[]; saving: boolean; saved: { id: string; ok: boolean; failed?: string } | null; save: () => void; reload: () => Promise<string | null>; setMsg: (m: string | null) => void; ref_: Ref }) {
  const { nav } = useApp()
  const [protoName, setProtoName] = useState('')
  const [protoBusy, setProtoBusy] = useState(false)
  const [protoSaved, setProtoSaved] = useState(false)
  const site = ref_.sites.find((s) => s.id === d.siteId)
  const client = ref_.clients.find((c) => c.id === d.clientId)
  const byKey = new Map(ref_.measures.map((m) => [m.key, m]))
  const totalPlots = planned.bands.reduce((n, b) => n + b.cells.length, 0)

  const saveProto = async () => {
    if (!protoName.trim()) return
    setProtoBusy(true)
    const token = await portalToken()
    const id = token ? await saveProtocol(protoName.trim(), d.crop || null, d.treatments, d.assessments, token) : null
    if (id) {
      setProtoSaved(true)
      await reload()
    } else setMsg('Could not save the protocol.')
    setProtoBusy(false)
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 340px', gap: 18, alignItems: 'start' }}>
      <div style={{ display: 'grid', gap: 14 }}>
        {saved?.ok ? (
          <div style={{ ...card, border: `1.5px solid ${GREEN}`, background: '#F3FAF6' }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#00512F' }}>Draft trial created</div>
            <div style={{ fontSize: 12.5, color: '#3E403E', marginTop: 4, lineHeight: 1.5 }}>
              {d.name} is on the backend as a draft with {d.treatments.length} treatments across {totalPlots} plots and {d.assessments.length} assessment timings. Next: place the block on the site map, then submit it for approval from the trials list.
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <div onClick={() => nav('planner')} style={btn(true)}>Place it on the site planner →</div>
              <div onClick={() => nav('trials')} style={btn()}>Open the trials list</div>
            </div>
          </div>
        ) : saved && !saved.ok ? (
          <div style={{ ...warn, lineHeight: 1.5 }}>
            {saved.failed === 'trial' ? 'The trial itself could not be saved. Check you are signed in as a planner (admin or agronomist) and try again.' : saved.failed === 'treatments' ? 'The trial was saved but its treatments were not. Open it from the trials list; nothing typed here is lost.' : 'The trial and treatments were saved but the assessments were not. Open it from the trials list to add them.'}
          </div>
        ) : null}
        {problems.length > 0 && !saved?.ok && (
          <div style={{ ...card, borderColor: '#F2C9BC' }}>
            <div style={{ ...sectionLabel, color: '#A93414' }}>BEFORE IT CAN BE SAVED</div>
            {problems.map((p) => (
              <div key={p} style={{ fontSize: 12.5, color: '#3E403E', padding: '3px 0' }}>· {p}</div>
            ))}
          </div>
        )}
        <div style={card}>
          <div style={sectionLabel}>TRIAL</div>
          <div style={{ fontSize: 15, fontWeight: 800, color: INK }}>{d.name || 'Untitled trial'}</div>
          <div style={{ fontSize: 12.5, color: '#3E403E', marginTop: 4 }}>
            {TRIAL_TYPES.find((t) => t.id === d.trialType)?.label} · season {d.season}{d.crop ? ` · ${d.crop}${d.variety ? ` ${d.variety}` : ''}` : ''}{d.sownDate ? ` · sown ${d.sownDate}` : ''}
          </div>
          {d.aim && <div style={{ fontSize: 12.5, color: '#3E403E', marginTop: 8, lineHeight: 1.5, fontStyle: 'italic' }}>{d.aim}</div>}
          <div style={{ fontSize: 12.5, color: '#3E403E', marginTop: 8 }}>
            <b>Client:</b> {client?.name ?? 'not recorded'} · <b>Site:</b> {site ? `${site.property}${site.town && site.town !== site.property ? `, ${site.town}` : ''}${site.paddock ? ` (${site.paddock})` : ''}` : 'not set'}
          </div>
        </div>
        <div style={card}>
          <div style={sectionLabel}>TREATMENTS · {d.treatments.length}</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <tbody>
              {d.treatments.map((t) => (
                <tr key={t.n}>
                  <td style={{ padding: '4px 8px 4px 0', fontWeight: 800, color: cellColors(t.n).fg, whiteSpace: 'nowrap', borderBottom: `1px solid #F1F2F1`, verticalAlign: 'top' }}>T{t.n}</td>
                  <td style={{ padding: '4px 8px 4px 0', fontWeight: 700, color: INK, borderBottom: `1px solid #F1F2F1`, verticalAlign: 'top' }}>{t.name}</td>
                  <td style={{ padding: '4px 8px 4px 0', color: '#3E403E', fontFamily: MONO, fontSize: 11.5, borderBottom: `1px solid #F1F2F1`, verticalAlign: 'top' }}>{recipeText(t) || '—'}</td>
                  <td style={{ padding: '4px 0', color: GREY, fontFamily: MONO, fontSize: 11.5, whiteSpace: 'nowrap', textAlign: 'right', borderBottom: `1px solid #F1F2F1`, verticalAlign: 'top' }}>{(planned.byTrt[t.n] ?? []).map((p) => p.plot).join(' ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={card}>
          <div style={sectionLabel}>DESIGN</div>
          <div style={{ fontSize: 12.5, color: '#3E403E', lineHeight: 1.5 }}>
            {DESIGN_LABEL[d.design.type as DesignType]} · {d.design.type === 'Demo' ? 'unreplicated' : `${d.design.type === 'Latin square' ? d.treatments.length : d.design.reps} reps`}{d.design.demoRep ? ' · rep 1 in treatment order' : ''} · {planned.rows} × {planned.positions} plots of {d.design.plotW} × {d.design.plotL} m · seed {d.design.seed} · expected CV {d.design.cv}%
          </div>
        </div>
        <div style={card}>
          <div style={sectionLabel}>ASSESSMENTS · {d.assessments.length}</div>
          {d.assessments.map((a) => (
            <div key={a.n} style={{ fontSize: 12.5, color: '#3E403E', padding: '4px 0', borderBottom: `1px solid #F1F2F1` }}>
              <b>A{a.n}</b> {a.timing || <span style={{ color: '#A93414' }}>no timing</span>}{a.blind ? ' · blind' : ''}: {a.measures.map((k) => byKey.get(k)?.label ?? k).join(', ') || <span style={{ color: '#A93414' }}>no measures</span>}
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: 'grid', gap: 14 }}>
        <div style={card}>
          <div style={sectionLabel}>SAVE AS A PROTOCOL</div>
          <div style={{ fontSize: 12, color: '#3E403E', lineHeight: 1.45, marginBottom: 8 }}>Keeps these treatments and assessments as a reusable protocol, so the same trial can be built at other sites in a few clicks and the sites analysed together.</div>
          {protoSaved ? (
            <div style={{ fontSize: 12.5, color: '#00623C', fontWeight: 700 }}>Protocol saved.</div>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={protoName} onChange={(e) => setProtoName(e.target.value)} placeholder={d.name ? `${d.name} protocol` : 'Protocol name'} style={inputStyle} />
              <div onClick={saveProto} style={btn(true, protoBusy || !protoName.trim() || d.treatments.length < 2)}>Save</div>
            </div>
          )}
        </div>
        <div style={{ ...card, background: '#FBFCFB' }}>
          <div style={sectionLabel}>WHAT HAPPENS NEXT</div>
          <div style={{ fontSize: 12, color: '#3E403E', lineHeight: 1.55 }}>
            1. The trial is saved as a <b>draft</b>: visible in the trials list and the site planner, not yet on phones.<br />
            2. Place the block on the site planner so plots have coordinates.<br />
            3. Submit for approval from the trials list; an approved trial syncs to the field app.<br />
            4. Plans, the spray plan, signs and the grower agreement are produced from the saved record.
          </div>
        </div>
        {!saved?.ok && (
          <div onClick={save} className="hv-primary" style={{ ...btn(true, problems.length > 0 || saving), textAlign: 'center', padding: '11px 14px' }}>{saving ? 'Saving…' : 'Create draft trial'}</div>
        )}
      </div>
    </div>
  )
}
