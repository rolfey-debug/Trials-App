/** Yield map import for a trial with stored plot or strip polygons: read a
 * header's CSV, clean it, load the points, assign each to the strip it
 * falls in, show strip means, and (on request) write those means as the
 * yield_map_t_ha machine measure beside the assessor scores. */
import { useEffect, useRef, useState } from 'react'
import { assignYieldPoints, clearYieldPoints, loadYieldSources, plotYieldMeans, portalToken, saveMachineScores, uploadYieldPoints, type LiveTrial, type YieldMeanRow } from '../lib/db'
import { parseYieldCsv, type YieldParse } from '../lib/yieldImport'

const GREEN = '#007749'
const GREY = '#8A8C8A'
const INK = '#141414'
const HAIR = '#E4E4E6'
const MONO = "'IBM Plex Mono',ui-monospace,monospace"
const card: React.CSSProperties = { background: '#fff', border: `1px solid ${HAIR}`, borderRadius: 12, padding: '14px 16px' }
const eyebrow: React.CSSProperties = { fontSize: 10, fontWeight: 800, letterSpacing: '.12em', color: GREY, marginBottom: 8 }
const btn = (primary = false, disabled = false): React.CSSProperties => ({ display: 'inline-block', padding: '7px 12px', fontSize: 12, fontWeight: 700, borderRadius: 8, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1, background: primary ? GREEN : '#fff', color: primary ? '#fff' : '#3E403E', border: primary ? `1px solid ${GREEN}` : '1px solid #D8DAD8', whiteSpace: 'nowrap' })

export default function YieldImport({ trial, hasPlots, rounds, onScoresWritten }: { trial: LiveTrial; hasPlots: boolean; rounds: number[]; onScoresWritten: () => void }) {
  const file = useRef<HTMLInputElement>(null)
  const [parsed, setParsed] = useState<(YieldParse & { name: string }) | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [sources, setSources] = useState<Array<{ source: string; n: number; assigned: number }>>([])
  const [means, setMeans] = useState<YieldMeanRow[] | null>(null)
  const [roundPick, setRoundPick] = useState<number | null>(null)
  const nextRound = Math.max(1, ...rounds) + (rounds.length ? 1 : 0)
  const round = roundPick ?? nextRound
  const [written, setWritten] = useState(false)

  const refresh = async () => {
    const token = await portalToken()
    if (!token) return
    const [s, m] = await Promise.all([loadYieldSources(trial.id, token), plotYieldMeans(trial.id, token)])
    setSources(s ?? [])
    setMeans(m)
  }
  useEffect(() => {
    setParsed(null)
    setErr('')
    setMeans(null)
    setWritten(false)
    void refresh()
  }, [trial.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const pick = async (f: File) => {
    setErr('')
    setParsed(null)
    try {
      const text = await f.text()
      setParsed({ ...parseYieldCsv(text, trial.crop), name: f.name })
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not read that file.')
    }
  }

  const importNow = async () => {
    if (!parsed || busy) return
    const token = await portalToken()
    if (!token) return
    setBusy('Loading points…')
    if (sources.some((s) => s.source === parsed.name)) await clearYieldPoints(trial.id, parsed.name, token)
    const n = await uploadYieldPoints(trial.id, parsed.name, parsed.points, token, (done) => setBusy(`Loading points… ${done} of ${parsed.points.length}`))
    if (n < parsed.points.length) {
      setErr(`Only ${n} of ${parsed.points.length} points loaded. Check the connection and import again; the file is replaced, not duplicated.`)
    }
    setBusy('Assigning points to strips…')
    const assigned = await assignYieldPoints(trial.id, token)
    setBusy(null)
    setParsed(null)
    await refresh()
    if (assigned === 0) setErr('No points fell inside the stored strips. Check the block is placed on the site planner where the strips really are, and that the file uses WGS84 latitude and longitude.')
  }

  const writeScores = async () => {
    if (!means?.length || busy) return
    const token = await portalToken()
    if (!token) return
    setBusy('Writing strip means…')
    const ok = await saveMachineScores(
      trial.id,
      'yield_map_t_ha',
      means.map((m) => ({ plot: m.plot, value: m.mean, note: `yield map: mean of ${m.n} cleaned points${m.sd ? ` ±${m.sd}` : ''}${m.moisture != null ? ` · ${m.moisture}% moisture` : ''} (${sources.map((s) => s.source).join(', ')})` })),
      token,
      round
    )
    setBusy(null)
    if (ok) {
      setWritten(true)
      onScoresWritten()
    } else setErr('Could not write the scores.')
  }

  const dropped = parsed ? Object.entries(parsed.dropped) : []
  return (
    <div style={{ ...card, marginBottom: 16 }}>
      <div style={eyebrow}>YIELD MAP{sources.length ? ` · ${sources.reduce((a, s) => a + s.n, 0)} points loaded` : ''}</div>
      {!hasPlots ? (
        <div style={{ fontSize: 12, color: GREY, lineHeight: 1.5 }}>Place this trial's strips on the site planner first; yield points are assigned to the stored strip polygons.</div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <input ref={file} type="file" accept=".csv,.txt,text/csv" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) void pick(f); e.target.value = '' }} />
            <span onClick={() => file.current?.click()} style={btn()}>Choose a yield map CSV</span>
            <span style={{ fontSize: 11.5, color: GREY }}>Header export with latitude, longitude and yield columns. Points are cleaned (zeros, spikes beyond 3 MAD, no position) before loading.</span>
          </div>
          {parsed && (
            <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 8, background: '#F7FAF8', border: '1px solid #BCDCCB', fontSize: 12, color: '#00512F', lineHeight: 1.5 }}>
              <b>{parsed.name}</b>: {parsed.rows} rows, {parsed.points.length} points kept{dropped.length ? ` (dropped ${dropped.map(([k, v]) => `${v} ${k}`).join(', ')})` : ''} · median {parsed.median.toFixed(2)} t/ha · {parsed.note}
              {parsed.unit === 'bu/ac' && <span> · bushels converted at the {trial.crop ?? 'wheat'} bushel weight</span>}
              <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                <span onClick={importNow} style={btn(true, !!busy)}>{busy ?? (sources.some((s) => s.source === parsed.name) ? 'Replace and assign to strips' : 'Load and assign to strips')}</span>
                <span onClick={() => setParsed(null)} style={btn()}>Cancel</span>
              </div>
            </div>
          )}
          {err && <div style={{ marginTop: 8, fontSize: 12, color: '#A93414', background: '#FBEDE8', border: '1px solid #F2C9BC', borderRadius: 8, padding: '7px 10px', lineHeight: 1.45 }}>{err}</div>}
          {sources.length > 0 && (
            <div style={{ marginTop: 10, fontSize: 11.5, color: GREY }}>
              {sources.map((s) => (
                <div key={s.source}>
                  <b style={{ color: INK }}>{s.source}</b> · {s.n} points · {s.assigned} inside strips
                  <span onClick={async () => { if (!confirm(`Remove the ${s.n} points from ${s.source}? Scores already written stay.`)) return; const token = await portalToken(); if (token) { await clearYieldPoints(trial.id, s.source, token); await refresh() } }} style={{ marginLeft: 8, color: '#A93414', fontWeight: 700, cursor: 'pointer' }}>remove</span>
                </div>
              ))}
            </div>
          )}
          {means && means.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={eyebrow}>STRIP MEANS · {means.length} strips</div>
              <table style={{ borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ color: GREY, fontSize: 10.5 }}><th style={{ textAlign: 'left', padding: '2px 12px 2px 0' }}>Strip</th><th style={{ textAlign: 'left', padding: '2px 12px 2px 0' }}>Trt</th><th style={{ textAlign: 'right', padding: '2px 12px 2px 0' }}>Points</th><th style={{ textAlign: 'right', padding: '2px 12px 2px 0' }}>t/ha</th><th style={{ textAlign: 'right', padding: '2px 12px 2px 0' }}>±SD</th><th style={{ textAlign: 'right', padding: '2px 0' }}>Moisture</th></tr>
                </thead>
                <tbody>
                  {means.map((m) => (
                    <tr key={m.plot} style={{ borderTop: '1px solid #F1F2F1' }}>
                      <td style={{ padding: '3px 12px 3px 0', fontFamily: MONO }}>{m.plot}</td>
                      <td style={{ padding: '3px 12px 3px 0', fontFamily: MONO }}>{m.treatment != null ? `T${m.treatment}` : '—'}</td>
                      <td style={{ padding: '3px 12px 3px 0', textAlign: 'right', fontFamily: MONO, color: m.n < 20 ? '#A93414' : INK }}>{m.n}</td>
                      <td style={{ padding: '3px 12px 3px 0', textAlign: 'right', fontFamily: MONO, fontWeight: 700 }}>{m.mean.toFixed(2)}</td>
                      <td style={{ padding: '3px 12px 3px 0', textAlign: 'right', fontFamily: MONO, color: GREY }}>{m.sd.toFixed(2)}</td>
                      <td style={{ padding: '3px 0', textAlign: 'right', fontFamily: MONO, color: GREY }}>{m.moisture != null ? `${m.moisture.toFixed(1)}%` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ marginTop: 10, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11.5, color: GREY }}>Write as assessment</span>
                <select value={round} onChange={(e) => setRoundPick(Number(e.target.value))} style={{ padding: '5px 8px', fontSize: 12, borderRadius: 7, border: `1px solid ${HAIR}` }}>
                  {[...new Set([...rounds, nextRound])].map((r) => (
                    <option key={r} value={r}>A{r}{rounds.includes(r) ? '' : ' (new)'}</option>
                  ))}
                </select>
                <span onClick={writeScores} style={btn(true, !!busy || written)}>{written ? 'Written as yield_map_t_ha ✓' : busy ?? 'Write strip means as yield-map scores'}</span>
                <span style={{ fontSize: 11, color: GREY }}>Strips under 20 points are flagged red: too thin to trust.</span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
