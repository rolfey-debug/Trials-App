/** Harvest entry — the office's way to record bucket weights, moisture and a
 * per-plot harvested area, in harvester order, when the phone wasn't used or
 * the paper labels come back from the paddock. Plots the phone already synced
 * show its values; changing one goes through the correction log with a
 * reason, never a silent overwrite. Yield in t/ha is derived live from the
 * bucket weight, the plot's area and moisture (lib/harvest.ts). */
import { useEffect, useMemo, useState } from 'react'
import { correctScore, ensureHarvestRound, loadAssessments, loadLiveTrials, loadScores, loadTreatments, portalToken, saveHarvestSettings, saveOfficeScores, type AssessmentRow, type LiveTrial, type ScoreRow, type TreatmentRow } from '../lib/db'
import { AREA_KEY, BUCKET_KEY, MOISTURE_KEY, YIELD_KEY, harvestedAreaM2, moistureStandard, yieldFromBucket } from '../lib/harvest'
import { serpentine } from '../lib/printouts'

const GREEN = '#007749'
const GREY = '#8A8C8A'
const HAIR = '#E4E4E6'
const BURNT = '#cf4520'
const card: React.CSSProperties = { background: '#fff', border: `1px solid ${HAIR}`, borderRadius: 12, padding: '14px 16px', marginBottom: 12 }
const inp: React.CSSProperties = { font: 'inherit', fontSize: 13, padding: '5px 8px', borderRadius: 7, border: `1px solid ${HAIR}`, width: 78, textAlign: 'right' }
const th: React.CSSProperties = { fontSize: 10.5, fontWeight: 800, letterSpacing: '.08em', color: GREY, textAlign: 'left', padding: '6px 8px', borderBottom: `1px solid ${HAIR}`, whiteSpace: 'nowrap' }
const td: React.CSSProperties = { padding: '5px 8px', borderBottom: `1px solid #F0F1F0`, fontSize: 13, verticalAlign: 'middle' }

interface Row {
  plot: number
  t: TreatmentRow
  rep: string | null
}
type Field = 'kg' | 'm' | 'len' | 'wid'
type Entry = Partial<Record<Field, string>>

export default function Harvest() {
  const [trials, setTrials] = useState<LiveTrial[]>([])
  const [trialId, setTrialId] = useState<string | null>(null)
  const [trts, setTrts] = useState<TreatmentRow[]>([])
  const [assess, setAssess] = useState<AssessmentRow[]>([])
  const [scores, setScores] = useState<ScoreRow[]>([])
  const [round, setRound] = useState<AssessmentRow | null>(null)
  const [entries, setEntries] = useState<Record<number, Entry>>({})
  const [reason, setReason] = useState('')
  const [settings, setSettings] = useState<{ cutWidthM: string; lengthM: string; moistureStdPct: string }>({ cutWidthM: '', lengthM: '', moistureStdPct: '' })
  const [state, setState] = useState<'loading' | 'ready' | 'signedout' | 'saving'>('loading')
  const [msg, setMsg] = useState('')

  const trial = trials.find((t) => t.id === trialId) ?? null

  useEffect(() => {
    void (async () => {
      const token = await portalToken()
      if (!token) return setState('signedout')
      const t = (await loadLiveTrials(token)) ?? []
      setTrials(t)
      const first = t.find((x) => /harvest/i.test(x.status)) ?? t.find((x) => x.status === 'active') ?? t[0]
      if (first) setTrialId(first.id)
    })()
  }, [])

  useEffect(() => {
    if (!trialId) return
    void (async () => {
      setState('loading')
      setMsg('')
      setEntries({})
      const token = await portalToken()
      if (!token) return setState('signedout')
      const [tr, as, sc] = await Promise.all([loadTreatments(trialId, token), loadAssessments(trialId, token), loadScores(trialId, token)])
      setTrts(tr ?? [])
      setAssess(as ?? [])
      setScores(sc ?? [])
      setRound((as ?? []).find((a) => /harvest/i.test(a.timing ?? '')) ?? null)
      const h = trials.find((t) => t.id === trialId)?.design?.harvest ?? {}
      setSettings({ cutWidthM: h.cutWidthM != null ? String(h.cutWidthM) : '', lengthM: h.lengthM != null ? String(h.lengthM) : '', moistureStdPct: h.moistureStdPct != null ? String(h.moistureStdPct) : '' })
      setState('ready')
    })()
    // trials is only read for the saved settings; it does not change after load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trialId])

  /** Plots in harvester order, extra sprayed plots included. */
  const rows = useMemo<Row[]>(() => {
    const trtOf = new Map<number, TreatmentRow>()
    const repOf = new Map<number, string>()
    for (const t of trts) {
      for (const p of t.components?.plots ?? []) trtOf.set(p, t)
      for (const [rep, p] of Object.entries(t.components?.plotsByRep ?? {})) repOf.set(Number(p), rep)
      for (const p of ((t.components as { extraPlots?: number[] } | null)?.extraPlots ?? [])) if (!trtOf.has(p)) {
        trtOf.set(p, t)
        repOf.set(p, 'extra')
      }
    }
    const plots = trtOf.size ? serpentine([...trtOf.keys()]) : []
    return plots.map((plot) => ({ plot, t: trtOf.get(plot)!, rep: repOf.get(plot) ?? null }))
  }, [trts])

  const roundN = round?.n ?? null
  const existing = useMemo(() => {
    const m = new Map<string, ScoreRow>()
    if (roundN === null) return m
    for (const s of scores) if (s.assessment === roundN && !s.id.startsWith('derived-')) m.set(`${s.plot}:${s.measure}`, s)
    return m
  }, [scores, roundN])
  const ex = (plot: number, measure: string) => existing.get(`${plot}:${measure}`)

  const plotW = trial?.design?.plot?.widthM ?? 2
  const plotL = trial?.design?.plot?.lengthM ?? 12
  const defW = Number(settings.cutWidthM) || plotW
  const defL = Number(settings.lengthM) || plotL
  const defArea = harvestedAreaM2({ crop: trial?.crop, design: { plot: trial?.design?.plot, harvest: { cutWidthM: Number(settings.cutWidthM) || undefined, lengthM: Number(settings.lengthM) || undefined } } })
  const std = Number(settings.moistureStdPct) || moistureStandard(trial?.crop)

  /** What the row reads now: typed value, else the synced score. */
  const val = (plot: number, f: Field): string => {
    const typed = entries[plot]?.[f]
    if (typed !== undefined) return typed
    if (f === 'kg') return ex(plot, BUCKET_KEY)?.value?.toString() ?? ''
    if (f === 'm') return ex(plot, MOISTURE_KEY)?.value?.toString() ?? ''
    const a = ex(plot, AREA_KEY)
    if (!a) return ''
    // a stored area is shown as its note's length × width when it has one
    const mm = /([\d.]+) m × ([\d.]+) m/.exec(a.note ?? '')
    return f === 'len' ? (mm?.[2] ?? '') : (mm?.[1] ?? '')
  }
  const areaOf = (plot: number): number => {
    const w = Number(val(plot, 'wid')) || defW
    const l = Number(val(plot, 'len')) || defL
    const stored = ex(plot, AREA_KEY)
    if (!entries[plot]?.len && !entries[plot]?.wid && stored) return Number(stored.value)
    return +(w * l).toFixed(2)
  }
  const yieldOf = (plot: number): number | null => {
    const kg = Number(val(plot, 'kg'))
    if (!kg) return null
    const m = val(plot, 'm') === '' ? undefined : Number(val(plot, 'm'))
    return yieldFromBucket(kg, areaOf(plot), m, std)
  }
  const set = (plot: number, f: Field, v: string) => setEntries((e) => ({ ...e, [plot]: { ...e[plot], [f]: v } }))

  const changes = useMemo(() => {
    const inserts: Array<{ plot: number; measure: string; value: number; note: string | null }> = []
    const corrections: Array<{ row: ScoreRow; value: number }> = []
    for (const r of rows) {
      const e = entries[r.plot]
      if (!e) continue
      const consider = (measure: string, raw: string | undefined, note: string | null) => {
        if (raw === undefined || raw.trim() === '') return
        const v = Number(raw)
        if (!Number.isFinite(v)) return
        const cur = ex(r.plot, measure)
        if (cur) {
          if (Number(cur.value) !== v) corrections.push({ row: cur, value: v })
        } else inserts.push({ plot: r.plot, measure, value: v, note })
      }
      consider(BUCKET_KEY, e.kg, 'office entry from harvest label')
      consider(MOISTURE_KEY, e.m, 'office entry from harvest label')
      if (e.len !== undefined || e.wid !== undefined) {
        const w = Number(val(r.plot, 'wid')) || defW
        const l = Number(val(r.plot, 'len')) || defL
        const area = +(w * l).toFixed(2)
        if (area !== defArea || ex(r.plot, AREA_KEY)) consider(AREA_KEY, String(area), `${w} m × ${l} m, office entry`)
      }
    }
    return { inserts, corrections }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, rows, existing, defW, defL, defArea])

  const save = async () => {
    if (!trialId) return
    const token = await portalToken()
    if (!token) return setState('signedout')
    if (changes.corrections.length && reason.trim().length < 4) return setMsg('Changing a value the phone synced needs a reason for the correction log.')
    setState('saving')
    let r = round
    if (!r) {
      r = await ensureHarvestRound(trialId, assess, [...new Set(scores.map((s) => s.assessment))], token)
      if (!r) {
        setState('ready')
        return setMsg('Could not create the harvest round.')
      }
      setRound(r)
      setAssess((a) => [...a, r!])
    }
    let ok = await saveOfficeScores(trialId, r.n, changes.inserts, token)
    for (const c of changes.corrections) ok = (await correctScore(c.row.id, trialId, c.row.plot, c.row.measure, Number(c.row.value), c.value, reason.trim(), token)) && ok
    const sc = (await loadScores(trialId, token)) ?? []
    setScores(sc)
    setEntries({})
    setReason('')
    setState('ready')
    setMsg(ok ? `Saved ${changes.inserts.length} value${changes.inserts.length === 1 ? '' : 's'}${changes.corrections.length ? ` and ${changes.corrections.length} correction${changes.corrections.length === 1 ? '' : 's'}` : ''} to round ${r.n}.` : 'Some values did not save. Check the connection and try again.')
  }

  const saveSettings = async () => {
    if (!trial) return
    const token = await portalToken()
    if (!token) return setState('signedout')
    const harvest = { cutWidthM: Number(settings.cutWidthM) || undefined, lengthM: Number(settings.lengthM) || undefined, moistureStdPct: Number(settings.moistureStdPct) || undefined }
    const ok = await saveHarvestSettings(trial.id, trial.design, harvest, token)
    setTrials((ts) => ts.map((t) => (t.id === trial.id ? { ...t, design: { ...(t.design ?? {}), harvest } } : t)))
    setMsg(ok ? `Harvest settings saved: ${defW} × ${defL} m = ${defArea} m² per plot, corrected to ${std}% moisture.` : 'Settings did not save.')
  }

  const done = rows.filter((r) => val(r.plot, 'kg') !== '').length
  const pending = changes.inserts.length + changes.corrections.length

  if (state === 'signedout') return <div style={{ padding: 24, color: GREY }}>Sign in to record harvest data.</div>
  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '18px 22px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 20, fontWeight: 800 }}>Harvest</div>
        <select value={trialId ?? ''} onChange={(e) => setTrialId(e.target.value)} style={{ font: 'inherit', fontSize: 13, fontWeight: 600, padding: '6px 10px', borderRadius: 8, border: `1px solid ${HAIR}`, background: '#fff', maxWidth: 420 }}>
          {trials.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <div style={{ fontSize: 12, color: GREY }}>{round ? `Round ${round.n} · ${round.timing}` : 'No harvest round yet: one is created on the first save'} · {done} of {rows.length} plots weighed</div>
      </div>

      <div style={card}>
        <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.11em', color: GREY, marginBottom: 8 }}>HARVEST SETTINGS FOR THIS TRIAL</div>
        <div style={{ display: 'flex', gap: 18, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label style={{ fontSize: 12, color: '#3E403E' }}>
            Cut width (m)<br />
            <input value={settings.cutWidthM} placeholder={String(plotW)} onChange={(e) => setSettings((s) => ({ ...s, cutWidthM: e.target.value }))} style={inp} />
          </label>
          <label style={{ fontSize: 12, color: '#3E403E' }}>
            Harvested length (m)<br />
            <input value={settings.lengthM} placeholder={String(plotL)} onChange={(e) => setSettings((s) => ({ ...s, lengthM: e.target.value }))} style={inp} />
          </label>
          <label style={{ fontSize: 12, color: '#3E403E' }}>
            Moisture standard (%)<br />
            <input value={settings.moistureStdPct} placeholder={String(moistureStandard(trial?.crop))} onChange={(e) => setSettings((s) => ({ ...s, moistureStdPct: e.target.value }))} style={inp} />
          </label>
          <div style={{ fontSize: 12.5, color: '#3E403E', paddingBottom: 6 }}>
            = <b>{defArea} m²</b> per plot unless a row says otherwise · yield quoted at {std}% moisture
          </div>
          <button onClick={() => void saveSettings()} style={{ font: 'inherit', fontSize: 12.5, fontWeight: 700, padding: '7px 14px', borderRadius: 8, border: `1.5px solid ${GREEN}`, color: GREEN, background: '#fff', cursor: 'pointer' }}>
            Save settings
          </button>
        </div>
        <div style={{ fontSize: 11, color: GREY, marginTop: 8, lineHeight: 1.45 }}>Blank means the plot's own size ({plotW} × {plotL} m). Change a plot's length or width in its row when it was trimmed or part-harvested; that plot keeps its own area and the rest use the default. Yield t/ha = kg ÷ m² × 10, corrected to the moisture standard when a reading is given.</div>
      </div>

      <div style={card}>
        {state === 'loading' ? (
          <div style={{ color: GREY, fontSize: 13 }}>Loading…</div>
        ) : !rows.length ? (
          <div style={{ color: GREY, fontSize: 13 }}>No plots allocated on this trial yet.</div>
        ) : (
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                <th style={th}>#</th>
                <th style={th}>PLOT</th>
                <th style={th}>TREATMENT</th>
                <th style={th}>REP</th>
                <th style={{ ...th, textAlign: 'right' }}>BUCKET kg</th>
                <th style={{ ...th, textAlign: 'right' }}>MOISTURE %</th>
                <th style={{ ...th, textAlign: 'right' }}>LENGTH m</th>
                <th style={{ ...th, textAlign: 'right' }}>WIDTH m</th>
                <th style={{ ...th, textAlign: 'right' }}>AREA m²</th>
                <th style={{ ...th, textAlign: 'right' }}>YIELD t/ha</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const synced = ex(r.plot, BUCKET_KEY)
                const typed = entries[r.plot]
                const y = yieldOf(r.plot)
                const real = ex(r.plot, YIELD_KEY)
                const area = areaOf(r.plot)
                return (
                  <tr key={r.plot} style={{ background: typed ? '#FFF8E8' : undefined }}>
                    <td style={{ ...td, color: GREY, fontSize: 11 }}>{i + 1}</td>
                    <td style={{ ...td, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, color: GREEN }}>{r.plot}</td>
                    <td style={td}>
                      <b>T{r.t.n}</b> {r.t.name}
                    </td>
                    <td style={{ ...td, color: GREY }}>{r.rep === 'extra' ? 'extra' : r.rep ?? ''}</td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      <input inputMode="decimal" value={val(r.plot, 'kg')} onChange={(e) => set(r.plot, 'kg', e.target.value)} style={inp} />
                    </td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      <input inputMode="decimal" value={val(r.plot, 'm')} onChange={(e) => set(r.plot, 'm', e.target.value)} style={inp} />
                    </td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      <input inputMode="decimal" value={val(r.plot, 'len')} placeholder={String(defL)} onChange={(e) => set(r.plot, 'len', e.target.value)} style={{ ...inp, width: 62 }} />
                    </td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      <input inputMode="decimal" value={val(r.plot, 'wid')} placeholder={String(defW)} onChange={(e) => set(r.plot, 'wid', e.target.value)} style={{ ...inp, width: 62 }} />
                    </td>
                    <td style={{ ...td, textAlign: 'right', color: area !== defArea ? BURNT : GREY }}>{area}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{real ? `${Number(real.value).toFixed(2)}*` : y !== null ? y.toFixed(2) : ''}</td>
                    <td style={{ ...td, fontSize: 11, color: GREY }}>{synced ? (synced.note?.startsWith('office') ? 'office' : 'phone') : ''}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <div style={{ ...card, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <button disabled={!pending || state !== 'ready'} onClick={() => void save()} style={{ font: 'inherit', fontSize: 13, fontWeight: 700, padding: '9px 18px', borderRadius: 9, border: 'none', color: '#fff', background: pending && state === 'ready' ? GREEN : '#B8BAB8', cursor: pending ? 'pointer' : 'default' }}>
          {state === 'saving' ? 'Saving…' : pending ? `Save ${pending} change${pending === 1 ? '' : 's'}` : 'Nothing to save'}
        </button>
        {changes.corrections.length > 0 && (
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={`Reason for changing ${changes.corrections.length} synced value${changes.corrections.length === 1 ? '' : 's'} (goes in the correction log)`} style={{ ...inp, width: 420, textAlign: 'left' }} />
        )}
        <div style={{ fontSize: 12, color: msg.startsWith('Saved') || msg.startsWith('Harvest settings') ? GREEN : BURNT }}>{msg}</div>
        <div style={{ fontSize: 11, color: GREY, marginLeft: 'auto' }}>* a real yield score on the record; the derived value is not used for that plot</div>
      </div>
    </div>
  )
}
