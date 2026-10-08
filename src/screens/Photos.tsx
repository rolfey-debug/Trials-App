import React, { useEffect, useState } from 'react'
import { C, MONO } from '../theme'
import { useApp } from '../store/store'
import { ScreenTitle } from '../components/bits'
import { photoUrl, saveAllWatermarked, saveWatermarked } from '../lib/photo'
import type { PhotoMeta } from '../store/types'

const STRIPES = 'repeating-linear-gradient(45deg,#DCE4DE 0 8px,#D0DAD3 8px 16px)'

function Tile({ p, trialName, onFlag }: { p: PhotoMeta; trialName: string; onFlag: () => void }) {
  const [url, setUrl] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    let alive = true
    let obj: string | null = null
    if (p.stored)
      photoUrl(p.id).then((u) => {
        if (alive) {
          obj = u
          setUrl(u)
        } else if (u) URL.revokeObjectURL(u)
      })
    return () => {
      alive = false
      if (obj) URL.revokeObjectURL(obj)
    }
  }, [p.id, p.stored])

  return (
    <div
      onClick={onFlag}
      style={{
        aspectRatio: '1', borderRadius: 10, overflow: 'hidden', display: 'flex', flexDirection: 'column',
        background: url ? `url(${url}) center/cover` : STRIPES, cursor: 'pointer',
      }}
    >
      {p.flagged ? <div style={{ width: 8, height: 8, borderRadius: '50%', background: C.burnt, margin: '6px 6px 0 auto' }} /> : <div />}
      <div style={{ marginTop: 'auto', background: 'rgba(20,20,20,.72)', padding: '4px 7px', display: 'flex', alignItems: 'center' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ font: `600 10px ${MONO}`, color: '#fff' }}>
            {p.pid} · T{p.trt}
          </div>
          <div style={{ font: `400 9px ${MONO}`, color: 'rgba(255,255,255,.75)' }}>{p.date}</div>
        </div>
        {p.stored && (
          <div
            onClick={async (e) => {
              e.stopPropagation()
              if (saving) return
              setSaving(true)
              await saveWatermarked(p, trialName)
              setSaving(false)
            }}
            style={{ marginLeft: 'auto', flex: 'none', width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 7, background: 'rgba(255,255,255,.18)', color: '#fff', fontSize: 13 }}
          >
            {saving ? '…' : '⬇'}
          </div>
        )}
      </div>
    </div>
  )
}

/** Plot photos (design screen 3d) — geo-tagged tiles, flag filter, storage note.
 * Tap a tile to flag/unflag it for the report. */
export function Photos() {
  const { st, doc, ts, mut, mutTrial } = useApp()
  const [bulk, setBulk] = useState('')
  const filter = st.photoFilter
  const all = ts.photos
  const flagged = all.filter((p) => p.flagged)
  const shown = filter === 'all' ? all : flagged
  const storedShown = shown.filter((p) => p.stored)

  const saveAll = async () => {
    if (bulk) return
    setBulk('Preparing…')
    const n = await saveAllWatermarked(shown, doc.trial.name.split('—')[0].trim(), (done, total) => setBulk(`Saving ${done}/${total}…`))
    setBulk('')
    if (n > 0) setBulk(`✓ ${n} handed to the phone — tap “Save Images” in the share sheet if it's still open`)
    window.setTimeout(() => setBulk(''), 6000)
  }

  const pillSt = (act: boolean): React.CSSProperties => ({
    padding: '6px 12px', borderRadius: 99, fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
    ...(act ? { background: C.ink, color: '#fff' } : { background: '#fff', border: `1px solid ${C.ghostBorder}`, color: C.body }),
  })

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '4px 16px 12px' }}>
      <ScreenTitle title={`Plot photos — ${doc.trial.name.split('—')[0].trim()}`} sub="Geo-tagged to the plot from GPS + walk order" />
      <div style={{ display: 'flex', gap: 5, marginBottom: 10 }}>
        <div style={pillSt(filter === 'all')} onClick={() => mut(null, (d) => void (d.photoFilter = 'all'))}>
          All · {all.length}
        </div>
        <div style={pillSt(filter === 'flag')} onClick={() => mut(null, (d) => void (d.photoFilter = 'flag'))}>
          Flagged · {flagged.length}
        </div>
        {storedShown.length > 0 && (
          <div style={{ ...pillSt(false), marginLeft: 'auto', color: C.greenDark, borderColor: '#9CC7B2', background: C.greenTint }} onClick={saveAll}>
            {bulk && !bulk.startsWith('✓') ? bulk : `⬇ Save all · ${storedShown.length}`}
          </div>
        )}
      </div>
      {bulk.startsWith('✓') && (
        <div style={{ fontSize: 11.5, color: C.greenDark, margin: '-4px 0 10px' }}>{bulk}</div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 12 }}>
        {shown.map((p) => (
          <Tile
            key={p.id}
            p={p}
            trialName={doc.trial.name.split('—')[0].trim()}
            onFlag={() =>
              mutTrial(null, (t) => {
                const ph = t.photos.find((x) => x.id === p.id)
                if (ph) ph.flagged = !ph.flagged
              })
            }
          />
        ))}
      </div>
      {shown.length === 0 && (
        <div style={{ textAlign: 'center', fontSize: 12, color: C.muted, padding: '20px 0 32px' }}>
          No {filter === 'flag' ? 'flagged ' : ''}photos yet — take them from the Assess screen.
        </div>
      )}
      <div style={{ background: '#fff', border: `1px solid ${C.hairline}`, borderRadius: 12, padding: '11px 14px', fontSize: 11.5, color: C.grey, lineHeight: 1.6 }}>
        <b style={{ color: C.ink }}>Storage:</b> compressed to ~300 KB on the phone so a season fits easily. Tap a tile to flag it for the
        report; the ⬇ button saves a copy to the phone with the plot, trial and date stamped on it. Photo files stay on this phone for now —
        only their records sync.
      </div>
    </div>
  )
}
