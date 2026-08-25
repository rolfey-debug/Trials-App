import { useEffect, useState } from 'react'
import { DASH_TRIALS, STATUS_CHIP } from '../data'
import { MONO, useApp } from '../state'
import { deleteTrial, loadLiveTrials, portalToken, saveTrial, type LiveTrial, type TrialPatch } from '../lib/db'
import { exportTrialData } from '../lib/exportXlsx'
import TrialsMap from './TrialsMap'

/** DB status → the display vocabulary the filter chips use. */
const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  review: 'In review',
  approved: 'Approved',
  active: 'Active',
  complete: 'Complete',
  archived: 'Complete',
}
const STATUSES = ['draft', 'review', 'approved', 'active', 'complete', 'archived']

const ago = (iso: string | null): string => {
  if (!iso) return '—'
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (mins < 60) return `${mins} min ago`
  if (mins < 60 * 24) return `${Math.round(mins / 60)} h ago`
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

const field: React.CSSProperties = { width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #D8DAD8', borderRadius: 8, outline: 'none', color: '#141414', background: '#fff', boxSizing: 'border-box' }
const lbl: React.CSSProperties = { fontSize: 10, fontWeight: 800, letterSpacing: '.1em', color: '#8A8C8A', margin: '10px 0 4px' }

function EditModal({ trial, token, onDone }: { trial: LiveTrial; token: string; onDone: (changed: boolean) => void }) {
  const [f, setF] = useState<TrialPatch>({
    name: trial.name, season: trial.season, status: trial.status, crop: trial.crop,
    variety: trial.variety, sown_date: trial.sown_date, aim: trial.aim,
  })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const save = async () => {
    if (busy) return
    setBusy(true)
    const ok = await saveTrial(trial.id, { ...f, season: f.season ? Number(f.season) : null }, token)
    setBusy(false)
    if (ok) onDone(true)
    else setErr('Save failed — check the connection and try again.')
  }
  const del = async () => {
    if (!window.confirm(`Delete “${trial.name}” from the office database?\n\nAll its synced field data (scores, spray records, photo entries) goes with it. Phones keep their local copies, but their syncs for this trial will fail until it exists again.`)) return
    setBusy(true)
    const ok = await deleteTrial(trial.id, token)
    setBusy(false)
    if (ok) onDone(true)
    else setErr('Delete failed — check the connection and try again.')
  }

  return (
    <div onClick={() => onDone(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(20,20,20,.38)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 30 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 520, maxWidth: '94vw', maxHeight: '88vh', overflow: 'auto', background: '#fff', borderRadius: 14, padding: '18px 22px 20px', boxShadow: '0 24px 64px rgba(10,26,18,.25)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#141414', flex: 1 }}>Edit trial</div>
          <div onClick={() => onDone(false)} className="hv-close" style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 7, fontSize: 16, color: '#8A8C8A', cursor: 'pointer' }}>×</div>
        </div>
        <div style={lbl}>NAME</div>
        <input value={f.name ?? ''} onChange={(e) => setF({ ...f, name: e.target.value })} style={field} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <div style={lbl}>STATUS</div>
            <select value={f.status ?? 'draft'} onChange={(e) => setF({ ...f, status: e.target.value })} style={field}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>{STATUS_LABEL[s]}{s === 'archived' ? ' (archived)' : ''}</option>
              ))}
            </select>
          </div>
          <div>
            <div style={lbl}>SEASON</div>
            <input type="number" value={f.season ?? ''} onChange={(e) => setF({ ...f, season: e.target.value ? Number(e.target.value) : null })} style={field} />
          </div>
          <div>
            <div style={lbl}>CROP</div>
            <input value={f.crop ?? ''} onChange={(e) => setF({ ...f, crop: e.target.value || null })} style={field} />
          </div>
          <div>
            <div style={lbl}>VARIETY</div>
            <input value={f.variety ?? ''} onChange={(e) => setF({ ...f, variety: e.target.value || null })} style={field} />
          </div>
        </div>
        <div style={lbl}>SOWN DATE</div>
        <input type="date" value={f.sown_date ?? ''} onChange={(e) => setF({ ...f, sown_date: e.target.value || null })} style={field} />
        <div style={lbl}>AIM</div>
        <textarea value={f.aim ?? ''} onChange={(e) => setF({ ...f, aim: e.target.value || null })} rows={3} style={{ ...field, resize: 'vertical', fontFamily: 'inherit' }} />
        {err && <div style={{ marginTop: 10, fontSize: 12, color: '#A93414' }}>{err}</div>}
        <div style={{ display: 'flex', gap: 14, marginTop: 16, alignItems: 'center' }}>
          <div
            onClick={async () => {
              setErr('')
              const res = await exportTrialData(trial, token)
              if (res === 'empty') setErr('Nothing synced yet for this trial — score or spray on a phone first.')
              else if (res === 'failed') setErr('Export failed — check the connection and try again.')
            }}
            style={{ fontSize: 12, fontWeight: 700, color: '#007749', cursor: 'pointer', padding: '8px 0' }}
          >
            Export field data (.xlsx)
          </div>
          <div onClick={del} style={{ fontSize: 12, fontWeight: 700, color: '#A93414', cursor: 'pointer', padding: '8px 0' }}>
            Delete trial…
          </div>
          <div style={{ flex: 1 }} />
          <div onClick={() => onDone(false)} style={{ padding: '9px 16px', borderRadius: 8, border: '1.5px solid #D6D7D6', fontSize: 13, fontWeight: 700, color: '#3E403E', cursor: 'pointer', background: '#fff' }}>
            Cancel
          </div>
          <div onClick={save} className="hv-primary" style={{ padding: '9px 18px', borderRadius: 8, background: busy ? '#B9BBB9' : '#007749', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            {busy ? 'Saving…' : 'Save changes'}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const { s, set, nav } = useApp()
  const [token, setToken] = useState<string | null>(null)
  const [live, setLive] = useState<LiveTrial[] | null>(null)
  const [checked, setChecked] = useState(false)
  const [editing, setEditing] = useState<LiveTrial | null>(null)

  const reload = async () => {
    const t = await portalToken()
    setToken(t)
    if (t) setLive(await loadLiveTrials(t))
    setChecked(true)
  }
  useEffect(() => {
    reload()
  }, [])

  const isLive = !!token && live !== null

  // ---- live rows -----------------------------------------------------------
  const q = s.q.toLowerCase()
  const liveRows = (live ?? [])
    .filter((t) => s.season === 'All' || `W${t.season}` === s.season)
    .filter((t) => s.statusF === 'All' || STATUS_LABEL[t.status] === s.statusF)
    .filter((t) => !q || `${t.name} ${t.site?.property ?? ''} ${t.site?.town ?? ''} ${t.crop ?? ''}`.toLowerCase().includes(q))

  // ---- demo rows (signed out only) ----------------------------------------
  const inSeason = DASH_TRIALS.filter((t) => s.season === 'All' || t.season === s.season)
  const demoRows = inSeason
    .filter((t) => s.statusF === 'All' || t.status === s.statusF)
    .filter((t) => !q || (t.name + t.client + t.crop).toLowerCase().includes(q))

  const statuses = ['All', 'Draft', 'In review', 'Approved', 'Active', 'Complete']
  const countFor = (st: string) =>
    isLive
      ? st === 'All'
        ? (live ?? []).length
        : (live ?? []).filter((t) => STATUS_LABEL[t.status] === st).length
      : st === 'All'
        ? inSeason.length
        : inSeason.filter((t) => t.status === st).length

  const sub = isLive
    ? `${liveRows.length} of ${(live ?? []).length} trials · live from the office database`
    : `${demoRows.length} of ${DASH_TRIALS.length} trials · demo data`

  const grid = 'minmax(0,2.1fr) minmax(0,1.05fr) 88px 104px minmax(0,1.5fr) 64px 96px'

  return (
    <div style={{ flex: 1, minWidth: 0, overflow: 'auto', padding: '26px 34px 44px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, marginBottom: 18 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#141414', letterSpacing: '-.01em' }}>Trials</h1>
          <div style={{ marginTop: 3, fontSize: 12.5, color: '#8A8C8A' }}>{sub}</div>
        </div>
        <input
          value={s.q}
          onChange={(e) => set({ q: e.target.value })}
          placeholder="Search trials, growers, crops…"
          className="focus-green"
          style={{ width: 252, padding: '9px 12px', fontSize: 13, border: '1px solid #E4E4E6', borderRadius: 8, background: '#fff', color: '#141414', outline: 'none' }}
        />
        <div onClick={() => nav('wizard', { step: 'treatments' })} className="hv-primary" style={{ padding: '9px 16px', background: '#007749', color: '#fff', fontSize: 13, fontWeight: 700, borderRadius: 8, cursor: 'pointer', whiteSpace: 'nowrap' }}>
          + New trial
        </div>
      </div>

      {checked && !token && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#F6EBD8', border: '1px solid #E8D5B5', borderRadius: 9, padding: '9px 14px', marginBottom: 14, fontSize: 12.5, color: '#9C6212' }}>
          <b>Demo data.</b> Sign in (bottom of the sidebar) to load and edit the real trials.
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {statuses.map((st) => {
          const on = s.statusF === st
          return (
            <div
              key={st}
              onClick={() => set({ statusF: st })}
              style={{
                padding: '5px 11px', fontSize: 12, fontWeight: 700, borderRadius: 999,
                border: `1px solid ${on ? '#141414' : '#E4E4E6'}`,
                background: on ? '#141414' : '#FFFFFF', color: on ? '#FFFFFF' : '#3E403E',
                cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              {st === 'All' ? `All · ${countFor(st)}` : `${st} · ${countFor(st)}`}
            </div>
          )
        })}
        <div style={{ flex: 1 }} />
        <select value={s.season} onChange={(e) => set({ season: e.target.value })} style={{ padding: '8px 10px', fontSize: 12.5, fontWeight: 700, color: '#141414', border: '1px solid #E4E4E6', borderRadius: 8, background: '#fff', outline: 'none' }}>
          <option value="All">All seasons</option>
          <option value="W2027">Winter 2027</option>
          <option value="W2026">Winter 2026</option>
          <option value="W2025">Winter 2025</option>
        </select>
      </div>

      {isLive && <TrialsMap trials={live ?? []} />}

      <div style={{ background: '#fff', border: '1px solid #E4E4E6', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: grid, gap: 12, padding: '10px 18px', fontSize: 10.5, fontWeight: 800, letterSpacing: '.11em', color: '#8A8C8A', borderBottom: '1px solid #EDEEED' }}>
          <div>TRIAL</div>
          <div>CROP</div>
          <div>TYPE</div>
          <div>STATUS</div>
          <div>PROGRESS</div>
          <div>SEASON</div>
          <div style={{ textAlign: 'right' }}>UPDATED</div>
        </div>

        {isLive &&
          liveRows.map((t) => {
            const label = STATUS_LABEL[t.status] ?? t.status
            const c = STATUS_CHIP[label as keyof typeof STATUS_CHIP] ?? STATUS_CHIP.Draft
            const activeNow = t.status === 'active'
            return (
              <div
                key={t.id}
                onClick={() => setEditing(t)}
                className="hv-row"
                style={{ display: 'grid', gridTemplateColumns: grid, gap: 12, alignItems: 'center', padding: '14px 18px', borderTop: '1px solid #F0F1F0', cursor: 'pointer', background: '#fff' }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 700, color: '#141414', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</span>
                    <span style={{ flex: 'none', fontSize: 11, fontWeight: 800, color: '#007749' }}>Edit ›</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: '#8A8C8A', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {[t.site?.property, t.site?.town].filter(Boolean).join(' · ') || 'no site linked'}
                  </div>
                </div>
                <div style={{ fontSize: 12.5, color: '#3E403E', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {[t.crop, t.variety].filter(Boolean).join(' · ') || '—'}
                </div>
                <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.1em', color: '#8A8C8A' }}>{(t.trial_type ?? '—').toUpperCase()}</div>
                <div>
                  <span style={{ display: 'inline-block', padding: '3px 9px', borderRadius: 999, fontSize: 11, fontWeight: 800, background: c.bg, color: c.fg, border: `1px solid ${c.bd}`, whiteSpace: 'nowrap' }}>{label}</span>
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#141414', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {activeNow && t.lastActivity && <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: '#007749', animation: 'ompulse 1.8s ease-in-out infinite', marginRight: 7, verticalAlign: 1 }} />}
                    {t.scores ? `${t.plotsScored} plots scored · ${t.scores} scores` : activeNow ? 'No field data yet' : '—'}
                  </div>
                  {t.sprayTicks > 0 && <div style={{ fontSize: 11, color: '#8A8C8A', marginTop: 4 }}>{t.sprayTicks} spray ticks recorded</div>}
                </div>
                <div style={{ fontFamily: MONO, fontSize: 11, color: '#6B6D6B' }}>{t.season ? `W${t.season}` : '—'}</div>
                <div style={{ fontSize: 11.5, color: '#8A8C8A', textAlign: 'right', whiteSpace: 'nowrap' }}>{ago(t.lastActivity)}</div>
              </div>
            )
          })}

        {!isLive &&
          demoRows.map((t) => {
            const c = STATUS_CHIP[t.status]
            return (
              <div
                key={t.name}
                onClick={t.review ? () => nav('review') : undefined}
                className="hv-row"
                style={{ display: 'grid', gridTemplateColumns: grid, gap: 12, alignItems: 'center', padding: '14px 18px', borderTop: '1px solid #F0F1F0', cursor: t.review ? 'pointer' : 'default', background: '#fff' }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 700, color: '#141414', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</span>
                    {t.review && <span style={{ flex: 'none', fontSize: 11, fontWeight: 800, color: '#007749' }}>Open review →</span>}
                  </div>
                  <div style={{ fontSize: 11.5, color: '#8A8C8A', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.client}</div>
                </div>
                <div style={{ fontSize: 12.5, color: '#3E403E', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.crop}</div>
                <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.1em', color: '#8A8C8A' }}>{t.type}</div>
                <div>
                  <span style={{ display: 'inline-block', padding: '3px 9px', borderRadius: 999, fontSize: 11, fontWeight: 800, background: c.bg, color: c.fg, border: `1px solid ${c.bd}`, whiteSpace: 'nowrap' }}>{t.status}</span>
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#141414', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {t.live && <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: '#007749', animation: 'ompulse 1.8s ease-in-out infinite', marginRight: 7, verticalAlign: 1 }} />}
                    {t.main}
                  </div>
                  {t.pct != null && (
                    <div style={{ width: 116, height: 4, background: '#E8EAE8', borderRadius: 99, marginTop: 5 }}>
                      <div style={{ height: 4, borderRadius: 99, background: '#007749', width: `${t.pct}%` }} />
                    </div>
                  )}
                  {t.sub && <div style={{ fontSize: 11, color: '#8A8C8A', marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.sub}</div>}
                </div>
                <div style={{ fontFamily: MONO, fontSize: 11, color: '#6B6D6B' }}>{t.season}</div>
                <div style={{ fontSize: 11.5, color: '#8A8C8A', textAlign: 'right', whiteSpace: 'nowrap' }}>{t.updated}</div>
              </div>
            )
          })}

        {isLive && liveRows.length === 0 && (
          <div style={{ padding: 44, textAlign: 'center', fontSize: 13, color: '#8A8C8A' }}>
            {(live ?? []).length === 0 ? 'No trials in the database yet — the wizard will create them here.' : 'Nothing matches — clear the search or switch season.'}
          </div>
        )}
        {!isLive && demoRows.length === 0 && <div style={{ padding: 44, textAlign: 'center', fontSize: 13, color: '#8A8C8A' }}>Nothing matches — clear the search or switch season.</div>}
      </div>

      <div style={{ marginTop: 12, fontSize: 11.5, color: '#8A8C8A' }}>
        {isLive
          ? 'Live from the office database — progress updates as phones sync scores and spray records.'
          : 'Active trials sync live from field phones — progress updates as plots are scored, even when devices come back from offline.'}
      </div>

      {editing && token && (
        <EditModal
          trial={editing}
          token={token}
          onDone={(changed) => {
            setEditing(null)
            if (changed) reload()
          }}
        />
      )}
    </div>
  )
}
