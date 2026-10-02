import { useState } from 'react'
import { MONO } from '../state'
import type { LiveTrial } from '../lib/db'

/** Overview map — every current trial pinned where it actually is, coloured by
 * status. Distance-true local projection (1° lat ≈ 110.6 km, lng scaled by
 * cos φ), so spacing between sites reads honestly. The ground is a neutral
 * paddock tone until a Maps API key connects live imagery — same placeholder
 * contract as the single-trial map screen. */

const STATUS_PIN: Record<string, string> = {
  draft: '#8A8C8A',
  review: '#9C6212',
  approved: '#2C6E8F',
  active: '#007749',
  complete: '#58585B',
  archived: '#B9BBB9',
}

export default function TrialsMap({ trials }: { trials: LiveTrial[] }) {
  const [sel, setSel] = useState<string | null>(null)
  const sited = trials.filter((t) => t.site?.lat != null && t.site?.lng != null)
  if (!sited.length) return null

  // local km grid around the centroid
  const lat0 = sited.reduce((a, t) => a + t.site!.lat!, 0) / sited.length
  const lng0 = sited.reduce((a, t) => a + t.site!.lng!, 0) / sited.length
  const kx = 111.32 * Math.cos((lat0 * Math.PI) / 180)
  const pts = sited.map((t) => ({ t, x: (t.site!.lng! - lng0) * kx, y: -(t.site!.lat! - lat0) * 110.57 }))
  const spanX = Math.max(20, ...pts.map((p) => Math.abs(p.x) * 2))
  const spanY = Math.max(20, ...pts.map((p) => Math.abs(p.y) * 2))
  const W = 860
  const H = 300
  const pad = 64
  const scale = Math.min((W - pad * 2) / spanX, (H - pad * 2) / spanY)
  const px = (v: number) => W / 2 + v * scale
  const py = (v: number) => H / 2 + v * scale
  // scale bar: a round number of km that fits ~120px
  const targetKm = 120 / scale
  const barKm = [1, 2, 5, 10, 20, 50, 100, 200].find((k) => k >= targetKm) ?? 200
  const selected = pts.find((p) => p.t.id === sel)

  return (
    <div style={{ background: '#fff', border: '1px solid #E4E4E6', borderRadius: 10, overflow: 'hidden', marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '12px 18px 0' }}>
        <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.11em', color: '#8A8C8A' }}>WHERE THE TRIALS ARE</div>
        <div style={{ fontSize: 11, color: '#8A8C8A' }}>
          {sited.length} sited trial{sited.length === 1 ? '' : 's'} · distances to scale
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', width: '100%' }}>
        <rect width={W} height={H} fill="#EEF2ED" />
        {/* subtle km grid */}
        {Array.from({ length: 13 }, (_, i) => (
          <line key={`v${i}`} x1={(W / 12) * i} y1={0} x2={(W / 12) * i} y2={H} stroke="#E2E7E1" strokeWidth={1} />
        ))}
        {Array.from({ length: 6 }, (_, i) => (
          <line key={`h${i}`} x1={0} y1={(H / 5) * i} x2={W} y2={(H / 5) * i} stroke="#E2E7E1" strokeWidth={1} />
        ))}
        {pts.map(({ t, x, y }) => {
          const c = STATUS_PIN[t.status] ?? '#8A8C8A'
          const on = sel === t.id
          return (
            <g key={t.id} onClick={() => setSel(on ? null : t.id)} style={{ cursor: 'pointer' }}>
              {t.status === 'active' && <circle cx={px(x)} cy={py(y)} r={13} fill={c} opacity={0.14} />}
              <circle cx={px(x)} cy={py(y)} r={on ? 8 : 6} fill={c} stroke="#fff" strokeWidth={2} />
              <text x={px(x)} y={py(y) - 13} textAnchor="middle" style={{ font: `700 11px Mulish, sans-serif`, fill: '#141414' }}>
                {t.site!.property ?? t.name}
              </text>
              <text x={px(x)} y={py(y) + 21} textAnchor="middle" style={{ font: `500 9px ${MONO}`, fill: '#8A8C8A' }}>
                {t.site!.town ?? ''}
              </text>
            </g>
          )
        })}
        {/* scale bar */}
        <g>
          <line x1={18} y1={H - 18} x2={18 + barKm * scale} y2={H - 18} stroke="#58585B" strokeWidth={2} />
          <line x1={18} y1={H - 23} x2={18} y2={H - 13} stroke="#58585B" strokeWidth={2} />
          <line x1={18 + barKm * scale} y1={H - 23} x2={18 + barKm * scale} y2={H - 13} stroke="#58585B" strokeWidth={2} />
          <text x={18 + (barKm * scale) / 2} y={H - 26} textAnchor="middle" style={{ font: `600 10px ${MONO}`, fill: '#58585B' }}>
            {barKm} km
          </text>
        </g>
      </svg>
      {selected ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 18px', borderTop: '1px solid #EDEEED' }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: STATUS_PIN[selected.t.status] ?? '#8A8C8A', flex: 'none' }} />
          <div style={{ fontSize: 12.5, fontWeight: 700, color: '#141414', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{selected.t.name}</div>
          <div style={{ fontSize: 11.5, color: '#3E403E', whiteSpace: 'nowrap' }}>
            {selected.t.plotsScored} plots scored · {selected.t.scores} scores · {selected.t.sprayTicks} spray ticks
          </div>
          <div style={{ marginLeft: 'auto', fontFamily: MONO, fontSize: 10.5, color: '#8A8C8A', whiteSpace: 'nowrap' }}>
            {selected.t.site!.lat!.toFixed(3)}, {selected.t.site!.lng!.toFixed(3)}
          </div>
        </div>
      ) : (
        <div style={{ padding: '9px 18px', borderTop: '1px solid #EDEEED', fontSize: 10.5, color: '#8A8C8A' }}>
          Tap a pin for progress · neutral ground until a Maps API key connects satellite imagery
        </div>
      )}
    </div>
  )
}
