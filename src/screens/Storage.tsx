import React from 'react'
import { C, MONO } from '../theme'
import { useApp } from '../store/store'
import { Eyebrow, ScreenTitle, Toggle } from '../components/bits'

/** Storage & sync (design screen 3e) — phone first, portal second. Writes hit
 * the local store in <100 ms; the queue drains in the background when signal
 * returns; conflicts resolve last-write-wins per field with full history. */
export function Storage() {
  const { st, ts, mut, syncNow, resetDemo } = useApp()
  const pending = st.syncQueue.filter((q) => !q.synced)
  const pendA = pending.filter((q) => q.kind === 'assessment').length
  const pendP = pending.filter((q) => q.kind === 'photo').length
  const pendOther = pending.length - pendA - pendP
  const photoMB = (pendP * 0.3).toFixed(1)
  const scoresKB = Math.max(1, Math.round(JSON.stringify(st.trialState).length / 1024))
  const photoCount = ts.photos.length
  const photoStoreMB = Math.max(1, Math.round(ts.photos.reduce((s, p) => s + (p.sizeKB ?? 300), 0) / 1024))
  const lastSync = st.lastSyncTs
    ? `${new Date(st.lastSyncTs).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })} · today`
    : '07:42 · 4G'

  const ruleDefs: [keyof typeof st.rules, string, string][] = [
    ['wifi', 'Photos upload on Wi-Fi only', 'Scores + notes still sync on 4G'],
    ['offline', 'Keep every trial offline', 'Full copy on this phone, always'],
    ['backup', 'Nightly backup to portal', 'Kept 12 months'],
  ]

  const statCard = (k: string, v: string) => (
    <div key={k} style={{ background: '#fff', border: `1px solid ${C.hairline}`, borderRadius: 10, padding: '9px 12px' }}>
      <div style={{ fontSize: 10, color: C.muted, fontWeight: 700, textTransform: 'uppercase' }}>{k}</div>
      <div style={{ font: `500 14px ${MONO}`, marginTop: 2 }}>{v}</div>
    </div>
  )

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '4px 16px 12px' }}>
      <ScreenTitle title="Storage & sync" sub="Phone first, portal second — signal never blocks scoring" />

      {pending.length > 0 ? (
        <div style={{ background: '#fff', border: `1.5px solid ${C.burnt}`, borderRadius: 14, padding: '14px 16px', marginBottom: 10 }}>
          <div style={{ font: `600 10px ${MONO}`, color: C.burnt, letterSpacing: '.08em', marginBottom: 4 }}>WAITING FOR SIGNAL</div>
          <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 2 }}>
            {pendA} assessment{pendA === 1 ? '' : 's'} · {pendP} photo{pendP === 1 ? '' : 's'} ({photoMB} MB)
            {pendOther > 0 ? ` · ${pendOther} other` : ''}
          </div>
          <div style={{ fontSize: 11.5, color: C.grey, marginBottom: 10 }}>
            Saved safely on this phone — nothing is lost. Uploads itself when signal returns.
          </div>
          <div
            onClick={syncNow}
            style={{ textAlign: 'center', padding: '12px 0', borderRadius: 11, background: C.green, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
          >
            Sync now
          </div>
        </div>
      ) : (
        <div style={{ background: '#fff', border: `1.5px solid ${C.green}`, borderRadius: 14, padding: '14px 16px', marginBottom: 10 }}>
          <div style={{ font: `600 10px ${MONO}`, color: C.green, letterSpacing: '.08em', marginBottom: 4 }}>ALL SYNCED</div>
          <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 2 }}>
            ✓ Queue clear —{' '}
            {st.lastSyncTs
              ? new Date(st.lastSyncTs).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) +
                ', ' +
                new Date(st.lastSyncTs).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })
              : 'up to date'}
          </div>
          <div style={{ fontSize: 11.5, color: C.grey }}>Portal, team and client views are up to date.</div>
        </div>
      )}

      <Eyebrow>ON THIS PHONE</Eyebrow>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 12 }}>
        {statCard('Trials offline', `${Object.keys(st.trials).length + st.otherTrials.length} · full copy`)}
        {statCard('Scores DB', `${scoresKB > 1024 ? (scoresKB / 1024).toFixed(1) + ' MB' : scoresKB + ' KB'}`)}
        {statCard('Photos', `${photoCount} · ${photoStoreMB} MB`)}
        {statCard('Last full sync', lastSync)}
      </div>

      <Eyebrow>RULES</Eyebrow>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 12 }}>
        {ruleDefs.map(([k, t, s]) => (
          <div
            key={k}
            onClick={() => mut({ kind: 'settings', label: `Rule · ${t}` }, (d) => void (d.rules[k] = !d.rules[k]))}
            style={{ background: '#fff', border: `1px solid ${C.hairline}`, borderRadius: 11, padding: '10px 13px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
          >
            <div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{t}</div>
              <div style={{ fontSize: 11, color: C.grey }}>{s}</div>
            </div>
            <Toggle on={st.rules[k]} />
          </div>
        ))}
      </div>

      <div style={{ background: '#fff', border: `1px solid ${C.hairline}`, borderRadius: 12, padding: '11px 14px', fontSize: 11.5, color: C.grey, lineHeight: 1.6 }}>
        <b style={{ color: C.ink }}>The portal keeps the master copy.</b> Phones are disposable — lose one in a canola crop, sign in on another,
        everything's back. Nightly backups are kept for 12 months.
      </div>
      <div
        onClick={() => {
          if (window.confirm('Reset demo data? Clears scores, photos and issues back to a clean season.')) resetDemo()
        }}
        style={{ textAlign: 'center', font: `500 11px ${MONO}`, color: C.muted, padding: '14px 0 2px', cursor: 'pointer' }}
      >
        ↺ reset demo data
      </div>
    </div>
  )
}
