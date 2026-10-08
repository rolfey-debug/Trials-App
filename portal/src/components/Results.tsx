/** Results — the live field data, explorable: treatment means, a plot heat
 * map, a measure-vs-measure scatter, and per-plot detail with photos. Reads
 * the real backend under RLS; everything renders from scores + treatments. */
import { useEffect, useMemo, useRef, useState } from 'react'
import { correctScore, loadLiveTrials, loadOperations, loadScores, loadTreatments, loadTrialPhotos, photoObjectUrl, portalToken, type LiveTrial, type OperationRow, type PhotoRow, type ScoreRow, type TreatmentRow } from '../lib/db'
import { exportResults } from '../lib/exportXlsx'
import { rcbdAnova, type Anova } from '../lib/stats'

const GREEN = '#007749'
const INK = '#141414'
const GREY = '#8A8C8A'
const HAIR = '#E4E4E6'

/** Friendly labels for measure keys that come up from the field app. */
const MEASURE_LABEL: Record<string, string> = {
  dmg_f: 'Leaf damage F %',
  dmg_f1: 'Leaf damage F-1 %',
  pgreen: 'Photo green cover %',
  lai: 'Leaf area index',
  rust: 'Stripe rust %',
  lrust: 'Leaf rust %',
  sept: 'Septoria %',
  phy: 'Phytotox %',
}
const label = (k: string) => MEASURE_LABEL[k] ?? k

/** Sequential single-hue ramps (light→dark, lightness-monotonic). Damage
 * reads in the burnt hue, canopy/greenness in the field green. */
export function rampColor(key: string, t: number): string {
  const stops: [number, number, number][] = /pgreen|lai|bio/.test(key)
    ? [[227, 241, 234], [0, 81, 47]]
    : [[251, 234, 227], [126, 36, 6]]
  const [a, b] = stops
  const mix = (i: number) => Math.round(a[i] + (b[i] - a[i]) * t)
  return `rgb(${mix(0)},${mix(1)},${mix(2)})`
}

function pearson(xs: number[], ys: number[]): number | null {
  const n = xs.length
  if (n < 3) return null
  const mx = xs.reduce((s, v) => s + v, 0) / n
  const my = ys.reduce((s, v) => s + v, 0) / n
  let sxy = 0
  let sxx = 0
  let syy = 0
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my)
    sxx += (xs[i] - mx) ** 2
    syy += (ys[i] - my) ** 2
  }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null
}

const card: React.CSSProperties = { background: '#fff', border: `1px solid ${HAIR}`, borderRadius: 12, padding: '14px 16px' }
const eyebrow: React.CSSProperties = { fontSize: 10, fontWeight: 800, letterSpacing: '.12em', color: GREY, marginBottom: 8 }

interface Tip {
  x: number
  y: number
  lines: string[]
}

export default function Results() {
  const [trials, setTrials] = useState<LiveTrial[] | null>(null)
  const [trialId, setTrialId] = useState<string | null>(null)
  const [scores, setScores] = useState<ScoreRow[]>([])
  const [trts, setTrts] = useState<TreatmentRow[]>([])
  const [photos, setPhotos] = useState<PhotoRow[]>([])
  const [ops, setOps] = useState<OperationRow[]>([])
  const [detOpen, setDetOpen] = useState(false)
  const [measure, setMeasure] = useState('dmg_f1')
  const [xM, setXM] = useState('pgreen')
  const [yM, setYM] = useState('dmg_f1')
  const [selPlot, setSelPlot] = useState<number | null>(null)
  const [selTrt, setSelTrt] = useState<number | null>(null)
  const [tip, setTip] = useState<Tip | null>(null)
  const [thumbs, setThumbs] = useState<Record<string, string>>({})
  const [bigPhoto, setBigPhoto] = useState<string | null>(null)
  const [edit, setEdit] = useState<{ measure: string; val: string; reason: string; busy: boolean } | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'signedout'>('loading')
  const urlsRef = useRef<string[]>([])

  useEffect(() => {
    void (async () => {
      const token = await portalToken()
      if (!token) {
        setState('signedout')
        return
      }
      const t = await loadLiveTrials(token)
      if (t) {
        setTrials(t)
        const first = t.find((x) => x.scores > 0) ?? t[0]
        if (first) setTrialId(first.id)
      }
    })()
  }, [])

  useEffect(() => {
    if (!trialId) return
    setSelPlot(null)
    setSelTrt(null)
    setThumbs({})
    urlsRef.current.forEach((u) => URL.revokeObjectURL(u))
    urlsRef.current = []
    void (async () => {
      setState('loading')
      const token = await portalToken()
      if (!token) {
        setState('signedout')
        return
      }
      const [sc, tr, ph, op] = await Promise.all([loadScores(trialId, token), loadTreatments(trialId, token), loadTrialPhotos(trialId, token), loadOperations(trialId, token)])
      setScores(sc ?? [])
      setTrts(tr ?? [])
      setPhotos(ph ?? [])
      setOps(op ?? [])
      setState('ready')
    })()
  }, [trialId])

  // ---- derived shape ------------------------------------------------------
  const measures = useMemo(() => [...new Set(scores.map((s) => s.measure))].sort(), [scores])
  const byPlot = useMemo(() => {
    const m = new Map<number, Record<string, number>>()
    const notes = new Map<number, string[]>()
    for (const s of scores) {
      const v = m.get(s.plot) ?? {}
      v[s.measure] = Number(s.value)
      m.set(s.plot, v)
      if (s.note) {
        const l = notes.get(s.plot) ?? []
        l.push(`${label(s.measure)}: ${s.note}`)
        notes.set(s.plot, l)
      }
    }
    return { values: m, notes }
  }, [scores])
  const trtOf = useMemo(() => {
    const m = new Map<number, TreatmentRow>()
    for (const t of trts) for (const p of t.components?.plots ?? []) m.set(p, t)
    return m
  }, [trts])
  const grid = useMemo(() => {
    const plots = [...byPlot.values.keys()]
    const rows = [...new Set(plots.map((p) => Math.floor(p / 100)))].sort((a, b) => a - b)
    const maxPos = Math.max(0, ...plots.map((p) => p % 100))
    return { rows, maxPos }
  }, [byPlot])

  const range = useMemo(() => {
    const vals = [...byPlot.values.values()].map((v) => v[measure]).filter((v) => v !== undefined)
    return vals.length ? { min: Math.min(...vals), max: Math.max(...vals) } : null
  }, [byPlot, measure])

  const meansRows = useMemo(() => {
    return trts
      .map((t) => {
        const plots = t.components?.plots ?? []
        const cells: Record<string, { mean: number; sd: number | null; vals: Array<[number, number]> } | null> = {}
        for (const m of measures) {
          const vals = plots.map((p) => [p, byPlot.values.get(p)?.[m]] as [number, number | undefined]).filter((x): x is [number, number] => x[1] !== undefined)
          if (!vals.length) {
            cells[m] = null
            continue
          }
          const mean = vals.reduce((a, [, v]) => a + v, 0) / vals.length
          const sd = vals.length > 1 ? Math.sqrt(vals.reduce((a, [, v]) => a + (v - mean) ** 2, 0) / (vals.length - 1)) : null
          cells[m] = { mean, sd, vals }
        }
        return { t, cells, plots }
      })
      .sort((a, b) => a.t.n - b.t.n)
  }, [trts, measures, byPlot])

  /** RCBD ANOVA per measure, when every treatment carries the same complete
   * block count (block = position in the treatment's plot list). */
  const anovas = useMemo(() => {
    const out: Record<string, Anova> = {}
    for (const m of measures) {
      const data: Record<string, number[]> = {}
      let ok = trts.length >= 2
      let r: number | null = null
      for (const t of trts) {
        const plots = t.components?.plots ?? []
        const vals = plots.map((p) => byPlot.values.get(p)?.[m])
        if (vals.some((v) => v === undefined) || !vals.length) {
          ok = false
          break
        }
        if (r === null) r = vals.length
        if (vals.length !== r) {
          ok = false
          break
        }
        data[`T${t.n}`] = vals as number[]
      }
      if (!ok) continue
      const a = rcbdAnova(data)
      if (a) out[m] = a
    }
    return out
  }, [measures, trts, byPlot])

  /** Plant-level readings and provisional flags live in the score notes —
   * surface them structurally rather than as prose. */
  const plantDetail = (plot: number, m: string): { plants: string[] | null; provisional: boolean; rest: string | null } => {
    const row = scores.find((s) => s.plot === plot && s.measure === m)
    if (!row?.note) return { plants: null, provisional: false, rest: null }
    const provisional = /PROVISIONAL/i.test(row.note)
    const match = row.note.match(/plants\s+([^—[]+)/i)
    const plants = match ? match[1].trim().replace(/\s+$/, '').split('/').map((s) => s.trim()) : null
    return { plants, provisional, rest: row.note }
  }
  const plotProvisional = (plot: number) => scores.some((s) => s.plot === plot && s.note && /PROVISIONAL/i.test(s.note))

  const scatter = useMemo(() => {
    const pts: Array<{ plot: number; x: number; y: number; trt: TreatmentRow | undefined }> = []
    for (const [plot, v] of byPlot.values) {
      if (v[xM] !== undefined && v[yM] !== undefined) pts.push({ plot, x: v[xM], y: v[yM], trt: trtOf.get(plot) })
    }
    const r = pearson(pts.map((p) => p.x), pts.map((p) => p.y))
    return { pts, r }
  }, [byPlot, xM, yM, trtOf])

  // lazy thumbnails for the selected plot
  useEffect(() => {
    if (selPlot === null) return
    const want = photos.filter((p) => p.plot === selPlot).slice(0, 12)
    void (async () => {
      for (const p of want) {
        if (thumbs[p.storage_path]) continue
        const url = await photoObjectUrl(p.storage_path)
        if (url) {
          urlsRef.current.push(url)
          setThumbs((cur) => ({ ...cur, [p.storage_path]: url }))
        }
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selPlot, photos])

  const showTip = (e: React.MouseEvent, lines: string[]) => setTip({ x: e.clientX + 14, y: e.clientY + 10, lines })

  const saveEdit = async () => {
    if (!edit || selPlot === null || !trialId || edit.busy) return
    const row = scores.find((s) => s.plot === selPlot && s.measure === edit.measure)
    const newVal = Number(edit.val)
    if (!row || !Number.isFinite(newVal) || !edit.reason.trim()) return
    setEdit({ ...edit, busy: true })
    const token = await portalToken()
    if (!token) {
      setEdit(null)
      return
    }
    const ok = await correctScore(row.id, trialId, selPlot, edit.measure, Number(row.value), newVal, edit.reason.trim(), token)
    if (ok) {
      const sc = await loadScores(trialId, token)
      if (sc) setScores(sc)
    }
    setEdit(null)
  }

  if (state === 'signedout')
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: GREY, fontSize: 14 }}>
        Sign in (bottom left) to see live results.
      </div>
    )

  const trial = trials?.find((t) => t.id === trialId)
  const selPhotos = selPlot !== null ? photos.filter((p) => p.plot === selPlot) : []
  const cell = 46

  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', overflow: 'hidden' }}>
      <div style={{ flex: 1, minWidth: 0, overflow: 'auto', padding: '22px 24px 30px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 4 }}>
          <div style={{ fontSize: 21, fontWeight: 800, color: INK }}>Results</div>
          <select value={trialId ?? ''} onChange={(e) => setTrialId(e.target.value)} style={{ font: 'inherit', fontSize: 13, fontWeight: 600, padding: '6px 10px', borderRadius: 8, border: `1px solid ${HAIR}`, background: '#fff', maxWidth: 420 }}>
            {(trials ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          {state === 'loading' && <span style={{ fontSize: 12, color: GREY }}>Loading…</span>}
          {scores.length > 0 && (
            <span
              onClick={() =>
                exportResults(
                  trial?.name ?? 'trial',
                  measures,
                  label,
                  meansRows.map((r) => ({ n: r.t.n, name: r.t.name, recipe: r.t.recipe, plots: r.plots, cells: r.cells })),
                  Object.fromEntries(measures.map((m) => [m, anovas[m]?.letters ?? {}])),
                  Object.fromEntries(measures.map((m) => [m, anovas[m] ? { lsd05: anovas[m].lsd05, cv: anovas[m].cv } : undefined])),
                  [...byPlot.values.entries()].sort((a, b) => a[0] - b[0]).map(([plot, values]) => ({
                    plot,
                    trt: trtOf.get(plot) ? `T${trtOf.get(plot)!.n} ${trtOf.get(plot)!.name}` : '',
                    values,
                    note: (byPlot.notes.get(plot) ?? []).join(' | '),
                  }))
                )
              }
              style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: GREEN, cursor: 'pointer', border: `1.5px solid #9CC7B2`, borderRadius: 8, padding: '6px 12px', background: '#E3F1EA' }}
            >
              Export results (.xlsx)
            </span>
          )}
        </div>
        <div style={{ fontSize: 12, color: GREY, marginBottom: 16 }}>
          {scores.length} synced scores · {new Set(scores.map((s) => s.plot)).size} plots · {photos.length} photo records — tap a plot anywhere for detail and photos
          <span onClick={() => setDetOpen(!detOpen)} style={{ marginLeft: 10, fontWeight: 700, color: GREEN, cursor: 'pointer' }}>
            {detOpen ? 'Hide trial details ▴' : 'Trial details ▾'}
          </span>
        </div>

        {/* trial details: agronomy, design, spray history */}
        {detOpen && trial && (
          <div style={{ ...card, marginBottom: 16, padding: '14px 16px' }}>
            <div style={{ display: 'flex', gap: 26, flexWrap: 'wrap', marginBottom: 12 }}>
              {(
                [
                  ['CROP', [trial.crop, trial.variety].filter(Boolean).join(' · ') || '—'],
                  ['SOWN', trial.sown_date ?? '—'],
                  ['SITE', [trial.site?.property, trial.site?.town].filter(Boolean).join(', ') || '—'],
                  ['SEASON', `${trial.season ?? '—'} · ${trial.status}`],
                  [
                    'DESIGN',
                    trial.design?.type
                      ? [trial.design.type, trial.design.reps && `${trial.design.reps} reps`, trial.design.grid && `${trial.design.grid.rows} × ${trial.design.grid.positions} grid`, trial.design.plot && `${trial.design.plot.widthM} × ${trial.design.plot.lengthM} m plots`].filter(Boolean).join(' · ')
                      : '—',
                  ],
                  ['SPRAY SETUP', trial.spraying?.waterRateLPerHa ? `${trial.spraying.waterRateLPerHa} L/ha water · ${trial.spraying.sprayVolumePerPlotMl} mL/plot · ${trial.spraying.batchVolumeL} L batches` : '—'],
                ] as Array<[string, string]>
              ).map(([k, v]) => (
                <div key={k}>
                  <div style={eyebrow}>{k}</div>
                  <div style={{ fontSize: 12.5, color: INK, fontWeight: 600 }}>{v}</div>
                </div>
              ))}
            </div>
            <div style={eyebrow}>SPRAY HISTORY</div>
            {ops.filter((o) => o.kind === 'spray').length === 0 && <div style={{ fontSize: 12, color: GREY }}>No spray operations recorded yet.</div>}
            {ops
              .filter((o) => o.kind === 'spray')
              .map((o, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap', padding: '5px 0', borderBottom: '1px solid #F2F3F2', fontSize: 12.5 }}>
                  <b style={{ color: GREEN }}>{o.timing ?? '—'} spray</b>
                  <span style={{ fontWeight: 700 }}>{o.conditions?.Date ?? new Date(o.performed_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                  {o.detail?.sprayed && <span style={{ color: GREY }}>{o.detail.sprayed.length} plots</span>}
                  {Object.entries(o.conditions ?? {})
                    .filter(([k]) => k !== 'Date')
                    .map(([k, v]) => (
                      <span key={k} style={{ fontSize: 11, color: GREY }}>
                        {k} <b style={{ color: '#3E403E' }}>{v}</b>
                      </span>
                    ))}
                  {o.detail?.note && <span style={{ fontSize: 11, color: GREY, width: '100%' }}>{o.detail.note}</span>}
                </div>
              ))}
            {(trial.design?.notes?.length ?? 0) > 0 && (
              <>
                <div style={{ ...eyebrow, marginTop: 12 }}>DESIGN NOTES</div>
                {trial.design!.notes!.map((n, i) => (
                  <div key={i} style={{ fontSize: 11.5, color: '#3E403E', lineHeight: 1.5, marginBottom: 3 }}>
                    · {n}
                  </div>
                ))}
              </>
            )}
            {trial.aim && (
              <>
                <div style={{ ...eyebrow, marginTop: 12 }}>AIM</div>
                <div style={{ fontSize: 12, color: '#3E403E', lineHeight: 1.55 }}>{trial.aim}</div>
              </>
            )}
          </div>
        )}

        {/* treatment means */}
        <div style={{ ...card, marginBottom: 16, overflow: 'auto' }}>
          <div style={eyebrow}>TREATMENT MEANS — ACROSS REPS</div>
          <table style={{ borderCollapse: 'collapse', fontSize: 12.5, minWidth: 560 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '5px 10px 5px 2px', color: GREY, fontWeight: 700 }}>Trt</th>
                <th style={{ textAlign: 'left', padding: '5px 14px 5px 2px', color: GREY, fontWeight: 700 }}>Treatment</th>
                {measures.map((m) => (
                  <th key={m} style={{ textAlign: 'right', padding: '5px 12px', color: measure === m ? GREEN : GREY, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }} onClick={() => setMeasure(m)} title="Colour the plot map by this measure">
                    {label(m)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {meansRows.map(({ t, cells }) => {
                const sel = selTrt === t.n
                return (
                  <tr
                    key={t.n}
                    onClick={() => setSelTrt(sel ? null : t.n)}
                    style={{ cursor: 'pointer', background: sel ? '#E3F1EA' : t.n === 1 ? '#FAFAF8' : undefined }}
                    onMouseEnter={(e) => showTip(e, [t.name, t.recipe, `plots ${(t.components?.plots ?? []).join(' · ')}`])}
                    onMouseLeave={() => setTip(null)}
                  >
                    <td style={{ padding: '5px 10px 5px 2px', fontWeight: 700, color: INK, borderTop: `1px solid #F0F1F0`, verticalAlign: 'top' }}>T{t.n}</td>
                    <td style={{ padding: '5px 14px 5px 2px', color: INK, borderTop: `1px solid #F0F1F0`, whiteSpace: 'nowrap' }}>
                      {t.name}
                      {t.n !== 1 && (
                        <span style={{ marginLeft: 7, fontSize: 9, fontWeight: 800, letterSpacing: '.05em', padding: '2px 6px', borderRadius: 99, background: t.b_spray ? '#E3F1EA' : '#FBEAE3', color: t.b_spray ? '#00623C' : '#A93414' }}>
                          {t.b_spray ? 'A + B' : 'A ONLY'}
                        </span>
                      )}
                      <div style={{ fontSize: 10.5, color: GREY, whiteSpace: 'normal', maxWidth: 250, lineHeight: 1.35 }}>{t.recipe}</div>
                    </td>
                    {measures.map((m) => (
                      <td key={m} style={{ textAlign: 'right', padding: '5px 12px', fontVariantNumeric: 'tabular-nums', color: INK, borderTop: `1px solid #F0F1F0`, whiteSpace: 'nowrap' }}>
                        {cells[m] === null ? (
                          <span style={{ color: '#C8CAC8' }}>—</span>
                        ) : (
                          <>
                            {cells[m]!.mean.toFixed(1)}
                            {anovas[m] && <b style={{ color: GREEN, fontSize: 11 }}> {anovas[m].letters[`T${t.n}`] ?? ''}</b>}
                            {cells[m]!.sd !== null && <span style={{ color: GREY, fontSize: 10.5 }}> ±{cells[m]!.sd!.toFixed(1)}</span>}
                          </>
                        )}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div style={{ fontSize: 11, color: GREY, marginTop: 8 }}>
            Mean ± SD across reps; letters from RCBD ANOVA + LSD 5% (treatments sharing a letter do not differ).
            {anovas[measure] && (
              <>
                {' '}For {label(measure)}: LSD <b style={{ color: '#3E403E' }}>{anovas[measure].lsd05.toFixed(1)}</b> · CV {anovas[measure].cv.toFixed(0)}% · F {Number.isFinite(anovas[measure].fTrt) ? anovas[measure].fTrt.toFixed(1) : '∞'} on {anovas[measure].dfTrt},{anovas[measure].dfError} df.
              </>
            )}{' '}
            Click a column header to map it; click a row for the rep breakdown.
          </div>

          {/* rep breakdown for the selected treatment */}
          {selTrt !== null &&
            (() => {
              const row = meansRows.find((r) => r.t.n === selTrt)
              if (!row) return null
              return (
                <div style={{ marginTop: 12, padding: '12px 14px', borderRadius: 10, background: '#FAFBFA', border: `1px solid #EDEEED` }}>
                  <div style={{ ...eyebrow, marginBottom: 6 }}>
                    T{row.t.n} {row.t.name.toUpperCase()} — PLOT BY PLOT
                  </div>
                  <table style={{ borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left', padding: '3px 12px 3px 0', color: GREY, fontWeight: 700 }}>Measure</th>
                        {row.plots.map((p) => (
                          <th key={p} style={{ textAlign: 'right', padding: '3px 12px', color: GREEN, fontWeight: 700, cursor: 'pointer' }} onClick={() => setSelPlot(p)}>
                            {p}
                          </th>
                        ))}
                        <th style={{ textAlign: 'right', padding: '3px 12px', color: GREY, fontWeight: 700 }}>mean</th>
                        <th style={{ textAlign: 'right', padding: '3px 12px', color: GREY, fontWeight: 700 }}>CV%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {measures.map((m) => {
                        const c = row.cells[m]
                        if (!c) return null
                        const byP = new Map(c.vals)
                        const cv = c.sd !== null && c.mean ? (c.sd / c.mean) * 100 : null
                        return (
                          <tr key={m}>
                            <td style={{ padding: '3px 12px 3px 0', color: '#3E403E', whiteSpace: 'nowrap' }}>{label(m)}</td>
                            {row.plots.map((p) => (
                              <td key={p} style={{ textAlign: 'right', padding: '3px 12px', fontVariantNumeric: 'tabular-nums' }}>
                                {byP.has(p) ? byP.get(p) : <span style={{ color: '#C8CAC8' }}>—</span>}
                              </td>
                            ))}
                            <td style={{ textAlign: 'right', padding: '3px 12px', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{c.mean.toFixed(1)}</td>
                            <td style={{ textAlign: 'right', padding: '3px 12px', color: GREY, fontVariantNumeric: 'tabular-nums' }}>{cv === null ? '—' : cv.toFixed(0)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  <div style={{ fontSize: 11, color: GREY, marginTop: 6 }}>{row.t.recipe}</div>
                </div>
              )
            })()}
        </div>

        {/* plot heat map */}
        <div style={{ ...card, marginBottom: 16 }}>
          <div style={eyebrow}>PLOT MAP — {label(measure).toUpperCase()}</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            {measures.map((m) => (
              <span key={m} onClick={() => setMeasure(m)} style={{ fontSize: 11.5, fontWeight: 700, padding: '4px 10px', borderRadius: 99, cursor: 'pointer', border: `1.5px solid ${measure === m ? GREEN : HAIR}`, color: measure === m ? GREEN : '#3E403E', background: measure === m ? '#E3F1EA' : '#fff' }}>
                {label(m)}
              </span>
            ))}
          </div>
          <svg width={(grid.maxPos + 1.4) * cell} height={(grid.rows.length + 0.6) * cell} style={{ maxWidth: '100%' }}>
            {grid.rows.map((row, ri) =>
              Array.from({ length: grid.maxPos }, (_, pi) => {
                const plot = row * 100 + pi + 1
                const vals = byPlot.values.get(plot)
                const v = vals?.[measure]
                const t = trtOf.get(plot)
                const dim = selTrt !== null && t?.n !== selTrt
                const fill = v === undefined || !range ? '#F2F3F2' : rampColor(measure, range.max === range.min ? 0.5 : (v - range.min) / (range.max - range.min))
                const light = v !== undefined && range && (v - range.min) / (range.max - range.min || 1) > 0.55
                return (
                  <g
                    key={plot}
                    opacity={dim ? 0.25 : 1}
                    style={{ cursor: vals ? 'pointer' : 'default' }}
                    onClick={() => vals && setSelPlot(plot)}
                    onMouseEnter={(e) =>
                      vals &&
                      showTip(e, [
                        `Plot ${plot}${t ? ` · T${t.n} ${t.name}` : ''}`,
                        ...Object.entries(vals).map(([k, val]) => `${label(k)}: ${val}`),
                      ])
                    }
                    onMouseLeave={() => setTip(null)}
                  >
                    <rect x={(pi + 0.3) * cell} y={(ri + 0.3) * cell} width={cell - 2} height={cell - 2} rx={5} fill={fill} stroke={selPlot === plot ? INK : '#fff'} strokeWidth={selPlot === plot ? 2 : 1} />
                    <text x={(pi + 0.3) * cell + 5} y={(ri + 0.3) * cell + 13} fontSize={8.5} fontWeight={600} fill={v === undefined ? '#C0C2C0' : light ? '#fff' : '#5A5C5A'}>
                      {plot}
                    </text>
                    {v !== undefined && (
                      <text x={(pi + 0.3) * cell + 5} y={(ri + 0.3) * cell + 32} fontSize={12} fontWeight={700} fill={light ? '#fff' : INK}>
                        {Number.isInteger(v) ? v : v.toFixed(1)}
                      </text>
                    )}
                    {vals && plotProvisional(plot) && <circle cx={(pi + 0.3) * cell + cell - 10} cy={(ri + 0.3) * cell + 9} r={3.5} fill="#E8A13C" stroke="#fff" strokeWidth={1} />}
                  </g>
                )
              })
            )}
          </svg>
          {range && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: GREY, marginTop: 6 }}>
              {range.min.toFixed(0)}
              <div style={{ width: 120, height: 8, borderRadius: 4, background: `linear-gradient(to right, ${rampColor(measure, 0)}, ${rampColor(measure, 1)})` }} />
              {range.max.toFixed(0)} · grey = no data
            </div>
          )}
        </div>

        {/* scatter */}
        <div style={card}>
          <div style={eyebrow}>PLAY — ONE MEASURE AGAINST ANOTHER, PER PLOT</div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8, fontSize: 12.5 }}>
            <select value={xM} onChange={(e) => setXM(e.target.value)} style={{ font: 'inherit', fontSize: 12.5, padding: '4px 8px', borderRadius: 7, border: `1px solid ${HAIR}` }}>
              {measures.map((m) => (
                <option key={m} value={m}>
                  x · {label(m)}
                </option>
              ))}
            </select>
            <select value={yM} onChange={(e) => setYM(e.target.value)} style={{ font: 'inherit', fontSize: 12.5, padding: '4px 8px', borderRadius: 7, border: `1px solid ${HAIR}` }}>
              {measures.map((m) => (
                <option key={m} value={m}>
                  y · {label(m)}
                </option>
              ))}
            </select>
            {scatter.r !== null && (
              <span style={{ color: GREY }}>
                r = <b style={{ color: INK }}>{scatter.r.toFixed(2)}</b> across {scatter.pts.length} plots
              </span>
            )}
          </div>
          {(() => {
            const W = 560
            const H = 300
            const P = 38
            const xs = scatter.pts.map((p) => p.x)
            const ys = scatter.pts.map((p) => p.y)
            if (!xs.length) return <div style={{ fontSize: 12, color: GREY, padding: '20px 0' }}>No plots carry both measures yet.</div>
            const xmin = Math.min(...xs)
            const xmax = Math.max(...xs)
            const ymin = Math.min(...ys)
            const ymax = Math.max(...ys)
            const X = (v: number) => P + ((v - xmin) / (xmax - xmin || 1)) * (W - P - 14)
            const Y = (v: number) => H - P + ((v - ymax) / (ymax - ymin || 1)) * (H - P - 14) * -1 - (H - P - 14)
            return (
              <svg width={W} height={H} style={{ maxWidth: '100%' }}>
                <line x1={P} y1={H - P} x2={W - 10} y2={H - P} stroke={HAIR} />
                <line x1={P} y1={14} x2={P} y2={H - P} stroke={HAIR} />
                <text x={(W + P) / 2} y={H - 8} fontSize={10.5} fill={GREY} textAnchor="middle">
                  {label(xM)}
                </text>
                <text x={12} y={(H - P) / 2} fontSize={10.5} fill={GREY} textAnchor="middle" transform={`rotate(-90 12 ${(H - P) / 2})`}>
                  {label(yM)}
                </text>
                {[xmin, xmax].map((v, i) => (
                  <text key={i} x={X(v)} y={H - P + 14} fontSize={9.5} fill={GREY} textAnchor="middle">
                    {v.toFixed(0)}
                  </text>
                ))}
                {[ymin, ymax].map((v, i) => (
                  <text key={i} x={P - 6} y={Y(v) + 3} fontSize={9.5} fill={GREY} textAnchor="end">
                    {v.toFixed(0)}
                  </text>
                ))}
                {scatter.pts.map((p) => {
                  const unt = p.trt?.n === 1
                  const sel = selTrt !== null && p.trt?.n === selTrt
                  const dim = selTrt !== null && !sel
                  return (
                    <circle
                      key={p.plot}
                      cx={X(p.x)}
                      cy={Y(p.y)}
                      r={sel ? 7 : 5}
                      fill={unt ? INK : GREEN}
                      opacity={dim ? 0.22 : 0.82}
                      stroke="#fff"
                      strokeWidth={1.5}
                      style={{ cursor: 'pointer' }}
                      onClick={() => setSelPlot(p.plot)}
                      onMouseEnter={(e) => showTip(e, [`Plot ${p.plot}${p.trt ? ` · T${p.trt.n} ${p.trt.name}` : ''}`, `${label(xM)}: ${p.x}`, `${label(yM)}: ${p.y}`])}
                      onMouseLeave={() => setTip(null)}
                    />
                  )
                })}
                {(() => {
                  const u = scatter.pts.find((p) => p.trt?.n === 1)
                  return u ? (
                    <text x={X(u.x) + 9} y={Y(u.y) - 7} fontSize={10} fontWeight={700} fill={INK}>
                      untreated
                    </text>
                  ) : null
                })()}
              </svg>
            )
          })()}
        </div>
      </div>

      {/* plot detail drawer */}
      {selPlot !== null && (
        <div style={{ width: 320, flex: 'none', borderLeft: `1px solid ${HAIR}`, background: '#fff', overflow: 'auto', padding: '20px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline' }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: INK }}>Plot {selPlot}</div>
            <div onClick={() => setSelPlot(null)} style={{ marginLeft: 'auto', cursor: 'pointer', color: GREY, fontSize: 13, fontWeight: 700 }}>
              Close ✕
            </div>
          </div>
          {trtOf.get(selPlot) && (
            <div style={{ fontSize: 12.5, color: '#3E403E', margin: '2px 0 12px' }}>
              <b>T{trtOf.get(selPlot)!.n} · {trtOf.get(selPlot)!.name}</b>
              {trtOf.get(selPlot)!.n !== 1 && (
                <span style={{ marginLeft: 7, fontSize: 9, fontWeight: 800, letterSpacing: '.05em', padding: '2px 6px', borderRadius: 99, background: trtOf.get(selPlot)!.b_spray ? '#E3F1EA' : '#FBEAE3', color: trtOf.get(selPlot)!.b_spray ? '#00623C' : '#A93414' }}>
                  {trtOf.get(selPlot)!.b_spray ? 'A + B' : 'A ONLY'}
                </span>
              )}
              <div style={{ fontSize: 11.5, color: GREY }}>{trtOf.get(selPlot)!.recipe}</div>
              {ops
                .filter((o) => o.kind === 'spray')
                .map((o, i) => {
                  const hit = o.detail?.sprayed?.includes(selPlot)
                  return (
                    <div key={i} style={{ fontSize: 11, marginTop: 3, color: hit ? '#00623C' : GREY }}>
                      {hit ? '✓' : '—'} {o.timing} spray {o.conditions?.Date ?? new Date(o.performed_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                      {hit ? ' · this plot sprayed' : ' · this plot skipped'}
                    </div>
                  )
                })}
            </div>
          )}
          <div style={eyebrow}>SCORES</div>
          {Object.entries(byPlot.values.get(selPlot) ?? {}).map(([k, v]) => {
            const d = plantDetail(selPlot, k)
            const editing = edit?.measure === k
            return (
              <div key={k} style={{ padding: '6px 0', borderBottom: '1px solid #F2F3F2' }}>
                <div style={{ display: 'flex', fontSize: 13, alignItems: 'center', gap: 6 }}>
                  <span style={{ color: '#3E403E' }}>{label(k)}</span>
                  {d.provisional && (
                    <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '.06em', color: '#8A5A00', background: '#FDF2DC', borderRadius: 4, padding: '2px 5px' }}>PROVISIONAL</span>
                  )}
                  <b style={{ marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>{v}</b>
                  <span title="Correct this value (logged)" onClick={() => setEdit(editing ? null : { measure: k, val: String(v), reason: '', busy: false })} style={{ cursor: 'pointer', color: editing ? INK : GREY, fontSize: 12 }}>
                    ✎
                  </span>
                </div>
                {editing && (
                  <div style={{ margin: '6px 0 2px', padding: '8px 9px', borderRadius: 8, background: '#FAFBFA', border: `1px solid #EDEEED` }}>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                      <input type="number" value={edit.val} onChange={(e) => setEdit({ ...edit, val: e.target.value })} style={{ width: 70, font: 'inherit', fontSize: 12.5, padding: '5px 7px', borderRadius: 6, border: `1px solid ${HAIR}` }} />
                      <input placeholder="why (goes in the correction log)" value={edit.reason} onChange={(e) => setEdit({ ...edit, reason: e.target.value })} style={{ flex: 1, font: 'inherit', fontSize: 12, padding: '5px 7px', borderRadius: 6, border: `1px solid ${HAIR}` }} />
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span onClick={() => void saveEdit()} style={{ fontSize: 12, fontWeight: 700, color: edit.reason.trim() ? GREEN : '#B8BAB8', cursor: edit.reason.trim() ? 'pointer' : 'default' }}>
                        {edit.busy ? 'Saving…' : 'Save correction'}
                      </span>
                      <span onClick={() => setEdit(null)} style={{ fontSize: 12, color: GREY, cursor: 'pointer' }}>
                        Cancel
                      </span>
                    </div>
                    <div style={{ fontSize: 10, color: GREY, marginTop: 5, lineHeight: 1.4 }}>
                      Old value, new value, who and why are written to the correction log. Measures the phone also holds (pgreen, lai) can be overwritten by its next sync.
                    </div>
                  </div>
                )}
                {d.plants && (
                  <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                    {d.plants.map((p, i) => (
                      <span key={i} title={`plant ${i + 1}`} style={{ fontSize: 10.5, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: '#3E403E', background: '#F2F3F2', borderRadius: 5, padding: '2px 7px' }}>
                        {p}
                      </span>
                    ))}
                    <span style={{ fontSize: 10, color: GREY, alignSelf: 'center' }}>per plant</span>
                  </div>
                )}
              </div>
            )
          })}
          {(byPlot.notes.get(selPlot) ?? []).length > 0 && (
            <>
              <div style={{ ...eyebrow, marginTop: 14 }}>FIELD NOTES</div>
              {(byPlot.notes.get(selPlot) ?? []).map((n, i) => (
                <div key={i} style={{ fontSize: 11.5, color: '#3E403E', lineHeight: 1.5, marginBottom: 6 }}>
                  {n}
                </div>
              ))}
            </>
          )}
          <div style={{ ...eyebrow, marginTop: 14 }}>PHOTOS · {selPhotos.length}</div>
          {selPhotos.length === 0 && <div style={{ fontSize: 11.5, color: GREY }}>No photo records for this plot.</div>}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 5 }}>
            {selPhotos.slice(0, 12).map((p) => (
              <div key={p.storage_path} onClick={() => thumbs[p.storage_path] && setBigPhoto(thumbs[p.storage_path])} style={{ aspectRatio: '1', borderRadius: 8, background: thumbs[p.storage_path] ? `url(${thumbs[p.storage_path]}) center/cover` : 'repeating-linear-gradient(45deg,#F0F1F0 0 8px,#E8E9E8 8px 16px)', cursor: thumbs[p.storage_path] ? 'zoom-in' : 'default' }} title={thumbs[p.storage_path] ? 'View full size' : 'Not uploaded from the phone yet'} />
            ))}
          </div>
          {selPhotos.length > 0 && Object.keys(thumbs).length === 0 && (
            <div style={{ fontSize: 11, color: GREY, marginTop: 8 }}>Striped tiles = the file hasn’t been uploaded from the phone yet (sync with the latest app build uploads them).</div>
          )}
        </div>
      )}

      {/* full-size photo */}
      {bigPhoto && (
        <div onClick={() => setBigPhoto(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(10,10,10,.8)', zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out' }}>
          <img src={bigPhoto} style={{ maxWidth: '92%', maxHeight: '92%', borderRadius: 10 }} />
        </div>
      )}

      {/* tooltip */}
      {tip && (
        <div style={{ position: 'fixed', left: tip.x, top: tip.y, zIndex: 90, background: INK, color: '#fff', borderRadius: 8, padding: '7px 10px', fontSize: 11.5, pointerEvents: 'none', maxWidth: 300 }}>
          {tip.lines.map((l, i) => (
            <div key={i} style={{ fontWeight: i === 0 ? 700 : 500, opacity: i === 0 ? 1 : 0.85 }}>
              {l}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
