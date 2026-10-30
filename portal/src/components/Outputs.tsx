/** Plans and signs — printable documents straight from the trial record:
 * trial plan, spray and mixing plan per timing, plot signs, site sign and
 * blank assessment sheets. Preview on the right, print (or save as PDF)
 * from the browser's dialog. */
import { useEffect, useMemo, useRef, useState } from 'react'
import { loadAssessments, loadLiveTrials, loadMeasureLibrary, loadOperations, loadOrgSettings, loadPeople, loadPlots, loadScores, loadSiteFeatures, loadSiteWeather, loadTreatments, loadTrialCorrections, loadTrialPhotos, markDocumentDrive, photoDataUrl, portalToken, saveOrgSettings, savePrintout, type AssessmentRow, type LiveTrial, type MeasureDef, type OperationRow, type OrgSettings, type PersonRow, type PlotRow, type PrintKind, type ScoreRow, type SiteFeatureRow, type TreatmentRow, type WeatherDay } from '../lib/db'
import { trialReportHtml, type ReportCorrection, type ReportPhoto } from '../lib/report'
import { forgetDriveToken, pushPrintoutToDrive } from '../lib/gdrive'
import { agreementHtml, assessmentSheetHtml, documentHtml, growerInfoHtml, plotSignsHtml, signCss, siteSignHtml, sprayPlanHtml, timingsOf, trialPlanHtml, whsPackHtml, type DocsData } from '../lib/printouts'
import { MONO, useApp } from '../state'

const GREEN = '#007749'
const GREY = '#8A8C8A'
const INK = '#141414'
const HAIR = '#E4E4E6'

type Kind = 'report' | 'plan' | 'spray' | 'signs' | 'site' | 'sheet' | 'agreement' | 'grower' | 'whs'
const KINDS: Array<{ id: Kind; label: string; blurb: string }> = [
  { id: 'report', label: 'Trial report', blurb: 'results per assessment with LSD letters, ranked bars, plot map, season, observations' },
  { id: 'plan', label: 'Trial plan', blurb: 'aim, site, treatments, plot plan, assessment schedule' },
  { id: 'spray', label: 'Spray and mixing plan', blurb: 'batch volumes and product amounts per treatment, tick boxes, application record' },
  { id: 'signs', label: 'Plot signs', blurb: 'one per plot or rep 1 only, 2 or 4 per A4 sheet' },
  { id: 'site', label: 'Site sign', blurb: 'A4 or A3 board at the gate: aim, treatments, LSD note' },
  { id: 'sheet', label: 'Assessment sheet', blurb: 'pen-and-paper scoring sheet in walk order, per timing' },
  { id: 'agreement', label: 'Trial site agreement (draft)', blurb: 'parties, access, obligations, unregistered products, compensation, data, signatures' },
  { id: 'grower', label: 'Grower information sheet (draft)', blurb: 'plain-language summary for the grower and their contractor' },
  { id: 'whs', label: 'WHS site pack (draft)', blurb: 'risk assessment, emergency plan, chemical register, SWMS, sign-on, accreditation' },
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
  const [features, setFeatures] = useState<SiteFeatureRow[]>([])
  const [people, setPeople] = useState<PersonRow[]>([])
  const [scores, setScores] = useState<ScoreRow[]>([])
  const [weather, setWeather] = useState<WeatherDay[]>([])
  const [ops, setOps] = useState<OperationRow[]>([])
  const [corrections, setCorrections] = useState<ReportCorrection[]>([])
  const [photosByPlot, setPhotosByPlot] = useState<Record<number, number>>({})
  const [photoPoints, setPhotoPoints] = useState<Array<{ plot: number; lat: number; lng: number }>>([])
  const [plots, setPlots] = useState<PlotRow[]>([])
  const [reportDraft, setReportDraft] = useState(true)
  const [reportBlind, setReportBlind] = useState(false)
  const [reportPhotos, setReportPhotos] = useState(false)
  const [photoRows, setPhotoRows] = useState<Array<{ plot: number; storage_path: string; taken_at: string; label?: string | null }>>([])
  const [photos, setPhotos] = useState<ReportPhoto[]>([])
  const [photoProgress, setPhotoProgress] = useState('')
  const [reportPrimary, setReportPrimary] = useState('')
  const [kind, setKind] = useState<Kind>('plan')
  const [timing, setTiming] = useState('A')
  const [water, setWater] = useState(100)
  const [overage, setOverage] = useState(30)
  const [signSize, setSignSize] = useState<'a6' | 'a5'>('a6')
  const [repOne, setRepOne] = useState(false)
  const [blind, setBlind] = useState(false)
  const [sheetN, setSheetN] = useState(1)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle')
  const [saveNote, setSaveNote] = useState('')
  const [org, setOrg] = useState<OrgSettings>({})
  const [driveOn, setDriveOn] = useState(() => {
    try {
      return localStorage.getItem('tw.driveOn') !== 'off'
    } catch {
      return true
    }
  })
  const [driveSetup, setDriveSetup] = useState<{ clientId: string; folder: string } | null>(null)
  const frame = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    void (async () => {
      const token = await portalToken()
      if (!token) {
        setAuth('signedout')
        return
      }
      const [t, lib, settings, ppl] = await Promise.all([loadLiveTrials(token), loadMeasureLibrary(token), loadOrgSettings(token), loadPeople(token)])
      setOrg(settings)
      setPeople(ppl ?? [])
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
      const siteId = trials.find((x) => x.id === trialId)?.site_id ?? null
      const [tr, as, fe, sc, wx, op, co, ph, pl] = await Promise.all([
        loadTreatments(trialId, token), loadAssessments(trialId, token), siteId ? loadSiteFeatures(siteId, token) : Promise.resolve([]),
        loadScores(trialId, token), siteId ? loadSiteWeather(siteId, token) : Promise.resolve([]), loadOperations(trialId, token), loadTrialCorrections(trialId, token), loadTrialPhotos(trialId, token),
        loadPlots(trialId, token),
      ])
      setTrts(tr ?? [])
      setAssess(as ?? [])
      setFeatures(fe ?? [])
      setScores((sc ?? []).map((x) => ({ ...x, value: Number(x.value) })))
      setWeather(wx ?? [])
      setOps(op ?? [])
      setCorrections(co ?? [])
      const counts: Record<number, number> = {}
      for (const p of ph ?? []) counts[p.plot] = (counts[p.plot] ?? 0) + 1
      setPhotosByPlot(counts)
      setPhotoPoints((ph ?? []).filter((p) => p.meta?.lat != null && p.meta?.lng != null).map((p) => ({ plot: p.plot, lat: Number(p.meta!.lat), lng: Number(p.meta!.lng) })))
      setPhotoRows((ph ?? []).map((p) => ({ plot: p.plot, storage_path: p.storage_path, taken_at: p.taken_at, label: p.meta?.label ?? null })))
      setPhotos([])
      setPhotoProgress('')
      setPlots(pl ?? [])
      setSheetN(as?.[0]?.n ?? 1)
    })()
  }, [trialId]) // eslint-disable-line react-hooks/exhaustive-deps

  const trial = trials.find((t) => t.id === trialId) ?? null
  useEffect(() => {
    if (trial?.spraying?.waterRateLPerHa) setWater(trial.spraying.waterRateLPerHa)
  }, [trial])

  // the latest photo of each plot, downsized and inlined, once the report asks for photos
  useEffect(() => {
    if (!reportPhotos || kind !== 'report' || photos.length || !photoRows.length) return
    let cancelled = false
    void (async () => {
      const token = await portalToken()
      if (!token) return
      const latest = new Map<number, (typeof photoRows)[number]>()
      for (const p of photoRows) if (!latest.has(p.plot) || p.taken_at > latest.get(p.plot)!.taken_at) latest.set(p.plot, p)
      const todo = [...latest.values()].sort((a, b) => a.plot - b.plot)
      const out: ReportPhoto[] = []
      for (let i = 0; i < todo.length; i++) {
        if (cancelled) return
        setPhotoProgress(`Preparing photos ${i + 1} of ${todo.length}`)
        const url = await photoDataUrl(todo[i].storage_path, token)
        if (url) out.push({ plot: todo[i].plot, url, takenAt: todo[i].taken_at, label: todo[i].label })
      }
      if (cancelled) return
      setPhotos(out)
      setPhotoProgress(out.length ? `${out.length} plot photos in the report` : 'No photos could be loaded')
    })()
    return () => {
      cancelled = true
    }
  }, [reportPhotos, kind, photoRows]) // eslint-disable-line react-hooks/exhaustive-deps
  const timings = useMemo(() => timingsOf(trts), [trts])
  useEffect(() => {
    if (timings.length && !timings.includes(timing)) setTiming(timings[0])
  }, [timings]) // eslint-disable-line react-hooks/exhaustive-deps

  const html = useMemo(() => {
    if (!trial) return ''
    const d: DocsData = { trial, treatments: trts, assessments: assess, measures, features, applicators: people.filter((p) => ['admin', 'agronomist', 'team'].includes(p.role)).map((p) => ({ name: p.name, role: p.role })) }
    switch (kind) {
      case 'report':
        return documentHtml(`${trial.name} — trial report`, trialReportHtml({ trial, treatments: trts, scores, measures, weather, operations: ops, corrections, photosByPlot, photoPoints, plots, features, photos: reportPhotos ? photos : [], options: { draft: reportDraft, blind: reportBlind, primary: reportPrimary || undefined } }))
      case 'plan':
        return documentHtml(`${trial.name} — trial plan`, trialPlanHtml(d))
      case 'spray':
        return documentHtml(`${trial.name} — spray plan ${timing}`, sprayPlanHtml(d, { timing, waterRateLPerHa: water, overage: overage / 100 }))
      case 'signs':
        return documentHtml(`${trial.name} — plot signs`, plotSignsHtml(d, { size: signSize, repOneOnly: repOne, blind }), signCss)
      case 'site':
        return documentHtml(`${trial.name} — site sign`, siteSignHtml(d))
      case 'agreement':
        return documentHtml(`${trial.name} — draft site agreement`, agreementHtml(d))
      case 'grower':
        return documentHtml(`${trial.name} — grower information`, growerInfoHtml(d))
      case 'whs':
        return documentHtml(`${trial.name} — WHS site pack`, whsPackHtml(d))
      case 'sheet': {
        const a = assess.find((x) => x.n === sheetN) ?? assess[0]
        return a ? documentHtml(`${trial.name} — assessment ${a.n}`, assessmentSheetHtml(d, a)) : documentHtml(trial.name, '<p class="muted">No assessment timings on this trial yet. Add them in the builder or the trial editor.</p>')
      }
    }
  }, [trial, trts, assess, measures, features, people, scores, weather, ops, corrections, photosByPlot, photoPoints, plots, photos, reportPhotos, reportDraft, reportBlind, reportPrimary, kind, timing, water, overage, signSize, repOne, blind, sheetN])

  useEffect(() => {
    setSaveState('idle')
  }, [html])

  const saveToDocuments = async () => {
    if (!trial || !html || saveState === 'saving') return
    setSaveState('saving')
    const token = await portalToken()
    if (!token) {
      setSaveState('failed')
      return
    }
    const kindOf: Record<Kind, PrintKind> = { report: 'report', plan: 'trial-plan', spray: 'spray-plan', signs: 'plot-signs', site: 'site-sign', sheet: 'assessment-sheet', agreement: 'agreement', grower: 'grower-info', whs: 'whs' }
    const label = kind === 'spray' ? `Spray plan ${timing}` : kind === 'sheet' ? `Assessment sheet A${sheetN}` : KINDS.find((k) => k.id === kind)?.label ?? kind
    const options = kind === 'report' ? { draft: reportDraft, blind: reportBlind, primary: reportPrimary || null } : kind === 'spray' ? { timing, waterRateLPerHa: water, overagePct: overage } : kind === 'signs' ? { size: signSize, repOneOnly: repOne, blind } : kind === 'sheet' ? { assessment: sheetN } : {}
    const filename = `${label} · ${new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}.html`
    const docId = await savePrintout(trial.id, kindOf[kind], filename, html, options, token)
    if (!docId) {
      setSaveState('failed')
      setSaveNote('')
      return
    }
    if (driveOn && org.googleClientId) {
      try {
        const drive = await pushPrintoutToDrive(org.googleClientId, org.driveFolder || 'AGnVET Trial Work', trial.name, filename, html)
        await markDocumentDrive(docId, drive, token)
        setSaveNote(`In Drive: ${org.driveFolder || 'AGnVET Trial Work'} / ${trial.name}`)
      } catch (e) {
        setSaveNote(`Saved to documents, but not to Drive: ${e instanceof Error ? e.message : 'unknown error'}`)
      }
    } else setSaveNote('')
    setSaveState('saved')
  }

  const saveDriveSetup = async () => {
    if (!driveSetup) return
    const token = await portalToken()
    if (!token) return
    const patch: OrgSettings = { googleClientId: driveSetup.clientId.trim(), driveFolder: driveSetup.folder.trim() || 'AGnVET Trial Work' }
    if (await saveOrgSettings(patch, token)) {
      setOrg({ ...org, ...patch })
      setDriveSetup(null)
      forgetDriveToken()
    }
  }
  const toggleDrive = (on: boolean) => {
    setDriveOn(on)
    try {
      localStorage.setItem('tw.driveOn', on ? 'on' : 'off')
    } catch {
      /* ignore */
    }
  }

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
        {kind === 'report' && (
          <div style={card}>
            <div style={sectionLabel}>REPORT OPTIONS</div>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5, color: '#3E403E', marginBottom: 6 }}>
              <input type="checkbox" checked={reportDraft} onChange={(e) => setReportDraft(e.target.checked)} /> Draft band (plot means as recorded, not for distribution)
            </label>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5, color: '#3E403E', marginBottom: 8 }}>
              <input type="checkbox" checked={reportBlind} onChange={(e) => setReportBlind(e.target.checked)} /> Treatment codes only (blind copy)
            </label>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5, color: '#3E403E', marginBottom: 2 }}>
              <input type="checkbox" checked={reportPhotos} onChange={(e) => setReportPhotos(e.target.checked)} disabled={!photoRows.length} /> Plot photos (latest of each plot, {Object.keys(photosByPlot).length} plots)
            </label>
            {reportPhotos && photoProgress && <div style={{ fontSize: 11, color: '#58585B', margin: '0 0 8px 24px' }}>{photoProgress}</div>}
            {!reportPhotos && <div style={{ height: 6 }} />}
            <div style={{ ...sectionLabel, fontSize: 9.5 }}>RANK AND MAP BY</div>
            <select value={reportPrimary} onChange={(e) => setReportPrimary(e.target.value)} style={inputStyle}>
              <option value="">Auto (fullest disease measure per round)</option>
              {[...new Set(scores.map((s) => s.measure))].sort().map((m) => (
                <option key={m} value={m}>{measures.get(m)?.label ?? m}</option>
              ))}
            </select>
            <div style={{ fontSize: 11, color: GREY, marginTop: 8, lineHeight: 1.4 }}>{scores.length ? `${scores.length} synced scores across ${new Set(scores.map((s) => s.assessment + ':' + s.recorded_at.slice(0, 10))).size} scoring days.` : 'No synced scores yet: the report prints the plan, season and treatments only.'}</div>
          </div>
        )}
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
        <div onClick={saveToDocuments} style={{ padding: '9px 14px', background: '#fff', color: saveState === 'failed' ? '#A93414' : '#3E403E', fontSize: 12.5, fontWeight: 700, borderRadius: 8, cursor: 'pointer', textAlign: 'center', border: `1px solid ${saveState === 'saved' ? GREEN : '#D8DAD8'}`, opacity: saveState === 'saving' ? 0.6 : 1 }}>
          {saveState === 'saving' ? (driveOn && org.googleClientId ? 'Saving and pushing to Drive…' : 'Saving…') : saveState === 'saved' ? 'Saved to the trial’s documents ✓' : saveState === 'failed' ? 'Could not save — try again' : 'Save a copy to the trial’s documents'}
        </div>
        {saveNote && <div style={{ fontSize: 11.5, color: saveNote.startsWith('In Drive') ? '#00623C' : '#A93414', lineHeight: 1.4 }}>{saveNote}</div>}
        <div style={card}>
          <div style={sectionLabel}>GOOGLE DRIVE</div>
          {driveSetup ? (
            <div style={{ display: 'grid', gap: 8 }}>
              <input value={driveSetup.clientId} onChange={(e) => setDriveSetup({ ...driveSetup, clientId: e.target.value })} placeholder="OAuth client ID (…apps.googleusercontent.com)" style={{ ...inputStyle, fontFamily: MONO, fontSize: 11.5 }} />
              <input value={driveSetup.folder} onChange={(e) => setDriveSetup({ ...driveSetup, folder: e.target.value })} placeholder="Top folder in Drive" style={inputStyle} />
              <div style={{ display: 'flex', gap: 8 }}>
                <div onClick={saveDriveSetup} style={{ padding: '7px 12px', background: GREEN, color: '#fff', fontSize: 12, fontWeight: 700, borderRadius: 8, cursor: 'pointer', opacity: driveSetup.clientId.trim().endsWith('apps.googleusercontent.com') ? 1 : 0.5 }}>Save</div>
                <div onClick={() => setDriveSetup(null)} style={{ padding: '7px 12px', background: '#fff', color: '#3E403E', fontSize: 12, fontWeight: 700, borderRadius: 8, cursor: 'pointer', border: '1px solid #D8DAD8' }}>Cancel</div>
              </div>
              <div style={{ fontSize: 11, color: GREY, lineHeight: 1.45 }}>
                In Google Cloud Console: new project, enable the Google Drive API, OAuth consent screen (External, add yourself as a test user), then Credentials → OAuth client ID → Web application with <span style={{ fontFamily: MONO }}>https://rolfey-debug.github.io</span> as an authorised JavaScript origin. Paste the client ID here. The app only sees files it creates. Moving to IT's Workspace later is a new client ID in their project.
              </div>
            </div>
          ) : org.googleClientId ? (
            <>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5, color: '#3E403E' }}>
                <input type="checkbox" checked={driveOn} onChange={(e) => toggleDrive(e.target.checked)} /> Also push saved copies to Drive
              </label>
              <div style={{ fontSize: 11, color: GREY, marginTop: 6, lineHeight: 1.4 }}>
                Folder: {org.driveFolder || 'AGnVET Trial Work'} / trial name. Google asks you to sign in the first time each session. <span onClick={() => setDriveSetup({ clientId: org.googleClientId ?? '', folder: org.driveFolder ?? 'AGnVET Trial Work' })} style={{ color: GREEN, fontWeight: 700, cursor: 'pointer' }}>Change</span>
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 12, color: '#3E403E', lineHeight: 1.45 }}>Not connected. Saved copies stay in the trial's documents only.</div>
              <div onClick={() => setDriveSetup({ clientId: '', folder: 'AGnVET Trial Work' })} style={{ marginTop: 8, display: 'inline-block', padding: '6px 11px', background: '#fff', color: GREEN, fontSize: 12, fontWeight: 700, borderRadius: 8, cursor: 'pointer', border: `1px solid ${GREEN}` }}>Connect Google Drive</div>
            </>
          )}
        </div>
        <div style={{ fontSize: 11, color: GREY, lineHeight: 1.45 }}>
          A saved copy is the exact page that went to the printer, listed under the trial in Results and, when Drive is connected, in Drive. The agreement, grower sheet and WHS pack are drafts: every page says so until you have reviewed the wording. <span onClick={() => nav('builder', { editTrialId: null })} style={{ color: GREEN, fontWeight: 700, cursor: 'pointer' }}>New trial</span> builds the record these documents come from.
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 0, background: '#E9EBE9', padding: 18, overflow: 'hidden' }}>
        <iframe ref={frame} title="preview" srcDoc={html} style={{ width: '100%', height: '100%', border: `1px solid ${HAIR}`, borderRadius: 10, background: '#fff' }} />
      </div>
    </div>
  )
}
