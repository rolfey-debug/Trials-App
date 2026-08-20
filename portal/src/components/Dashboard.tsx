import { DASH_TRIALS, STATUS_CHIP } from '../data'
import { MONO, useApp } from '../state'

export default function Dashboard() {
  const { s, set, nav } = useApp()
  const inSeason = DASH_TRIALS.filter((t) => s.season === 'All' || t.season === s.season)
  const statuses = ['All', 'Draft', 'In review', 'Approved', 'Active', 'Complete']
  const q = s.q.toLowerCase()
  const rows = inSeason
    .filter((t) => s.statusF === 'All' || t.status === s.statusF)
    .filter((t) => !q || (t.name + t.client + t.crop).toLowerCase().includes(q))
  const sub = `${rows.length} of ${DASH_TRIALS.length} trials · Riverina trial program · winter ${s.season === 'All' ? '& summer seasons' : s.season.slice(1)}`

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
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {statuses.map((st) => {
          const count = st === 'All' ? inSeason.length : inSeason.filter((t) => t.status === st).length
          const on = s.statusF === st
          return (
            <div
              key={st}
              onClick={() => set({ statusF: st })}
              style={{
                padding: '5px 11px',
                fontSize: 12,
                fontWeight: 700,
                borderRadius: 999,
                border: `1px solid ${on ? '#141414' : '#E4E4E6'}`,
                background: on ? '#141414' : '#FFFFFF',
                color: on ? '#FFFFFF' : '#3E403E',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {st === 'All' ? `All · ${count}` : `${st} · ${count}`}
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
      <div style={{ background: '#fff', border: '1px solid #E4E4E6', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2.1fr) minmax(0,1.05fr) 88px 104px minmax(0,1.5fr) 64px 96px', gap: 12, padding: '10px 18px', fontSize: 10.5, fontWeight: 800, letterSpacing: '.11em', color: '#8A8C8A', borderBottom: '1px solid #EDEEED' }}>
          <div>TRIAL</div>
          <div>CROP</div>
          <div>TYPE</div>
          <div>STATUS</div>
          <div>PROGRESS</div>
          <div>SEASON</div>
          <div style={{ textAlign: 'right' }}>UPDATED</div>
        </div>
        {rows.map((t) => {
          const c = STATUS_CHIP[t.status]
          return (
            <div
              key={t.name}
              onClick={t.review ? () => nav('review') : undefined}
              className="hv-row"
              style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2.1fr) minmax(0,1.05fr) 88px 104px minmax(0,1.5fr) 64px 96px', gap: 12, alignItems: 'center', padding: '14px 18px', borderTop: '1px solid #F0F1F0', cursor: t.review ? 'pointer' : 'default', background: '#fff' }}
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
        {rows.length === 0 && <div style={{ padding: 44, textAlign: 'center', fontSize: 13, color: '#8A8C8A' }}>Nothing matches — clear the search or switch season.</div>}
      </div>
      <div style={{ marginTop: 12, fontSize: 11.5, color: '#8A8C8A' }}>Active trials sync live from field phones — progress updates as plots are scored, even when devices come back from offline.</div>
    </div>
  )
}
