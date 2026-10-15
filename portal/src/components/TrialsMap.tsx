import { useMemo, useState } from 'react'
import { MONO } from '../state'
import type { LiveTrial } from '../lib/db'

/** Overview map — every current trial pinned where it actually is, coloured by
 * status. Distance-true local projection (1° lat ≈ 110.6 km, lng scaled by
 * cos φ), so spacing between sites reads honestly. Trials that share a site
 * share a pin (the pin carries the count), pins closer together than a thumb
 * width merge, and labels are placed greedily around their pin so none sit on
 * top of each other — a label that has to move away from its pin gets a
 * leader line. The ground is a neutral paddock tone until a Maps API key
 * connects live imagery — same placeholder contract as the single-trial map
 * screen. */

const STATUS_PIN: Record<string, string> = {
  draft: '#8A8C8A',
  review: '#9C6212',
  approved: '#2C6E8F',
  active: '#007749',
  complete: '#58585B',
  archived: '#B9BBB9',
}
const STATUS_RANK = ['active', 'approved', 'review', 'draft', 'complete', 'archived']

const W = 860
const H = 420
const PAD = 56
const MERGE_PX = 16 // pins closer than this share one marker
const GROUND = '#EEF2ED'

type Pin = {
  key: string
  x: number // px
  y: number // px
  trials: LiveTrial[]
  label: string
  sub: string | null
  status: string
}
type Box = { x: number; y: number; w: number; h: number }
type Placed = Pin & { box: Box; anchor: 'start' | 'middle' | 'end'; leader: boolean; crowded: boolean }

const clean = (s: string | null | undefined) =>
  (s ?? '')
    .replace(/[‘’"']/g, '')
    .replace(/\s+(NSW|VIC|Vic)$/i, '')
    .trim()

const textW = (s: string, px: number) => s.length * px * 0.58 + 4

function overlaps(a: Box, b: Box, gap = 3) {
  return a.x < b.x + b.w + gap && a.x + a.w + gap > b.x && a.y < b.y + b.h + gap && a.y + a.h + gap > b.y
}
function overlapArea(a: Box, b: Box) {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
  return w > 0 && h > 0 ? w * h : 0
}

/** Candidate label slots around a pin, nearest first. */
function candidates(p: Pin, w: number, h: number, r: number) {
  const out: { box: Box; anchor: 'start' | 'middle' | 'end'; d: number }[] = []
  for (const d of [r + 5, r + 18, r + 32, r + 48]) {
    const o = d * 0.72
    out.push(
      { box: { x: p.x - w / 2, y: p.y - d - h, w, h }, anchor: 'middle', d }, // above
      { box: { x: p.x + d, y: p.y - h / 2, w, h }, anchor: 'start', d }, // right
      { box: { x: p.x - d - w, y: p.y - h / 2, w, h }, anchor: 'end', d }, // left
      { box: { x: p.x - w / 2, y: p.y + d, w, h }, anchor: 'middle', d }, // below
      { box: { x: p.x + o, y: p.y - o - h, w, h }, anchor: 'start', d },
      { box: { x: p.x - o - w, y: p.y - o - h, w, h }, anchor: 'end', d },
      { box: { x: p.x + o, y: p.y + o, w, h }, anchor: 'start', d },
      { box: { x: p.x - o - w, y: p.y + o, w, h }, anchor: 'end', d },
    )
  }
  return out
}

export function layout(trials: LiveTrial[]) {
  const sited = trials.filter((t) => t.site?.lat != null && t.site?.lng != null)
  if (!sited.length) return null

  // one node per distinct location (4 dp ≈ 11 m)
  const bySite = new Map<string, LiveTrial[]>()
  for (const t of sited) {
    const k = `${t.site!.lat!.toFixed(4)},${t.site!.lng!.toFixed(4)}`
    bySite.set(k, [...(bySite.get(k) ?? []), t])
  }
  const sites = [...bySite.entries()].map(([key, ts]) => ({ key, lat: ts[0].site!.lat!, lng: ts[0].site!.lng!, trials: ts }))

  // local km grid around the centroid of the sites (not the trials, so a busy
  // site doesn't drag the centre)
  const lat0 = sites.reduce((a, s) => a + s.lat, 0) / sites.length
  const lng0 = sites.reduce((a, s) => a + s.lng, 0) / sites.length
  const kx = 111.32 * Math.cos((lat0 * Math.PI) / 180)
  const km = sites.map((s) => ({ ...s, kx: (s.lng - lng0) * kx, ky: -(s.lat - lat0) * 110.57 }))
  const spanX = Math.max(20, ...km.map((p) => Math.abs(p.kx) * 2))
  const spanY = Math.max(20, ...km.map((p) => Math.abs(p.ky) * 2))
  const scale = Math.min((W - PAD * 2) / spanX, (H - PAD * 2) / spanY)
  const px = (v: number) => W / 2 + v * scale
  const py = (v: number) => H / 2 + v * scale

  // merge sites that would sit on top of each other into one pin
  const pins: Pin[] = []
  for (const s of km.sort((a, b) => b.trials.length - a.trials.length)) {
    const x = px(s.kx)
    const y = py(s.ky)
    const near = pins.find((p) => Math.hypot(p.x - x, p.y - y) < MERGE_PX)
    if (near) {
      const n = near.trials.length
      const m = s.trials.length
      near.x = (near.x * n + x * m) / (n + m)
      near.y = (near.y * n + y * m) / (n + m)
      near.trials = [...near.trials, ...s.trials]
    } else {
      pins.push({ key: s.key, x, y, trials: s.trials, label: '', sub: null, status: 'draft' })
    }
  }
  for (const p of pins) {
    // most common property name leads the label; the rest show as "+n"
    const props = new Map<string, number>()
    const towns = new Set<string>()
    for (const t of p.trials) {
      const pr = clean(t.site?.property) || clean(t.name)
      props.set(pr, (props.get(pr) ?? 0) + 1)
      if (clean(t.site?.town)) towns.add(clean(t.site?.town))
    }
    const ordered = [...props.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k)
    p.label = ordered[0] + (ordered.length > 1 ? ` +${ordered.length - 1}` : '')
    const town = towns.size === 1 ? [...towns][0] : null
    const n = p.trials.length
    const bits: string[] = []
    if (n > 1) bits.push(`${n} trials`)
    if (town && town !== ordered[0] && !ordered[0].includes(town)) bits.push(town)
    p.sub = bits.length ? bits.join(' · ') : null
    p.status = STATUS_RANK.find((st) => p.trials.some((t) => t.status === st)) ?? p.trials[0].status
  }

  // greedy label placement — crowded pins choose first
  const neighbours = (p: Pin) => pins.filter((q) => q !== p && Math.hypot(q.x - p.x, q.y - p.y) < 70).length
  const order = [...pins].sort((a, b) => neighbours(b) - neighbours(a) || a.y - b.y)
  const taken: Box[] = pins.map((p) => ({ x: p.x - 9, y: p.y - 9, w: 18, h: 18 }))
  const bounds: Box = { x: 4, y: 4, w: W - 8, h: H - 36 }
  const placed: Placed[] = []
  for (const p of order) {
    const r = p.trials.length > 1 ? 9 : 7
    const tryFit = (sub: string | null) => {
      const w = Math.max(textW(p.label, 11), sub ? textW(sub, 9) : 0)
      const h = sub ? 25 : 13
      let best: { box: Box; anchor: Placed['anchor']; d: number; cost: number } | null = null
      for (const c of candidates(p, w, h, r)) {
        const inside = c.box.x >= bounds.x && c.box.y >= bounds.y && c.box.x + c.box.w <= bounds.x + bounds.w && c.box.y + c.box.h <= bounds.y + bounds.h
        const hits = taken.filter((b) => overlaps(c.box, b))
        if (inside && hits.length === 0) return { ...c, cost: 0 }
        const cost = (inside ? 0 : 1e6) + hits.reduce((a, b) => a + overlapArea(c.box, b), 0) + c.d
        if (!best || cost < best.cost) best = { ...c, cost }
      }
      return best!
    }
    let fit = tryFit(p.sub)
    let sub = p.sub
    if (fit.cost > 0 && sub) {
      // no clean slot with two lines — try the name alone
      const alt = tryFit(null)
      if (alt.cost < fit.cost) {
        fit = alt
        sub = null
      }
    }
    taken.push(fit.box)
    placed.push({ ...p, sub, box: fit.box, anchor: fit.anchor, leader: fit.d > r + 5, crowded: fit.cost > 0 })
  }

  // scale bar: a round number of km that fits ~120px
  const targetKm = 120 / scale
  const barKm = [1, 2, 5, 10, 20, 50, 100, 200].find((k) => k >= targetKm) ?? 200
  return { pins: placed, scale, barKm, sitedCount: sited.length, siteCount: sites.length }
}

export default function TrialsMap({ trials }: { trials: LiveTrial[] }) {
  const [sel, setSel] = useState<string | null>(null)
  const lay = useMemo(() => layout(trials), [trials])
  if (!lay) return null
  const { pins, scale, barKm, sitedCount, siteCount } = lay
  const unsited = trials.length - sitedCount
  const selected = pins.find((p) => p.key === sel)

  return (
    <div style={{ background: '#fff', border: '1px solid #E4E4E6', borderRadius: 10, overflow: 'hidden', marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '12px 18px 0' }}>
        <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.11em', color: '#8A8C8A' }}>WHERE THE TRIALS ARE</div>
        <div style={{ fontSize: 11, color: '#8A8C8A' }}>
          {sitedCount} trial{sitedCount === 1 ? '' : 's'} at {siteCount} site{siteCount === 1 ? '' : 's'} · distances to scale
          {unsited > 0 ? ` · ${unsited} without a location` : ''}
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', width: '100%' }}>
        <rect width={W} height={H} fill={GROUND} />
        {/* subtle km grid */}
        {Array.from({ length: 13 }, (_, i) => (
          <line key={`v${i}`} x1={(W / 12) * i} y1={0} x2={(W / 12) * i} y2={H} stroke="#E2E7E1" strokeWidth={1} />
        ))}
        {Array.from({ length: 7 }, (_, i) => (
          <line key={`h${i}`} x1={0} y1={(H / 6) * i} x2={W} y2={(H / 6) * i} stroke="#E2E7E1" strokeWidth={1} />
        ))}
        {/* leader lines first so pins and labels sit on top */}
        {pins.filter((p) => p.leader).map((p) => {
          const tx = Math.max(p.box.x, Math.min(p.x, p.box.x + p.box.w))
          const ty = Math.max(p.box.y, Math.min(p.y, p.box.y + p.box.h))
          return <line key={`l${p.key}`} x1={p.x} y1={p.y} x2={tx} y2={ty} stroke="#8A8C8A" strokeWidth={1} strokeDasharray="2 2" />
        })}
        {pins.map((p) => {
          const c = STATUS_PIN[p.status] ?? '#8A8C8A'
          const on = sel === p.key
          const multi = p.trials.length > 1
          const r = (multi ? 9 : 7) + (on ? 2 : 0)
          const lx = p.anchor === 'start' ? p.box.x : p.anchor === 'end' ? p.box.x + p.box.w : p.box.x + p.box.w / 2
          return (
            <g key={p.key} onClick={() => setSel(on ? null : p.key)} style={{ cursor: 'pointer' }}>
              {p.status === 'active' && <circle cx={p.x} cy={p.y} r={r + 7} fill={c} opacity={0.14} />}
              <circle cx={p.x} cy={p.y} r={r} fill={c} stroke="#fff" strokeWidth={2} />
              {multi && (
                <text x={p.x} y={p.y + 3} textAnchor="middle" style={{ font: `800 9px ${MONO}`, fill: '#fff', pointerEvents: 'none' }}>
                  {p.trials.length}
                </text>
              )}
              <text
                x={lx}
                y={p.box.y + 11}
                textAnchor={p.anchor}
                style={{ font: `700 11px Mulish, sans-serif`, fill: '#141414', paintOrder: 'stroke', stroke: GROUND, strokeWidth: 3, strokeLinejoin: 'round' }}
              >
                {p.label}
              </text>
              {p.sub && (
                <text
                  x={lx}
                  y={p.box.y + 22}
                  textAnchor={p.anchor}
                  style={{ font: `500 9px ${MONO}`, fill: '#58585B', paintOrder: 'stroke', stroke: GROUND, strokeWidth: 3, strokeLinejoin: 'round' }}
                >
                  {p.sub}
                </text>
              )}
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
        <div style={{ borderTop: '1px solid #EDEEED' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '9px 18px 4px' }}>
            <div style={{ fontSize: 12.5, fontWeight: 800, color: '#141414' }}>{selected.label.replace(/ \+\d+$/, '')}</div>
            <div style={{ fontSize: 11, color: '#8A8C8A' }}>
              {selected.trials.length} trial{selected.trials.length === 1 ? '' : 's'}
            </div>
            <div style={{ marginLeft: 'auto', fontFamily: MONO, fontSize: 10.5, color: '#8A8C8A', whiteSpace: 'nowrap' }}>
              {selected.trials[0].site!.lat!.toFixed(3)}, {selected.trials[0].site!.lng!.toFixed(3)}
            </div>
          </div>
          {selected.trials.map((t) => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '4px 18px 6px' }}>
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: STATUS_PIN[t.status] ?? '#8A8C8A', flex: 'none' }} />
              <div style={{ fontSize: 12, fontWeight: 700, color: '#141414', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</div>
              {selected.trials.length > 1 && clean(t.site?.property) !== selected.label.replace(/ \+\d+$/, '') && (
                <div style={{ fontSize: 11, color: '#8A8C8A', whiteSpace: 'nowrap' }}>{clean(t.site?.property)}</div>
              )}
              <div style={{ marginLeft: 'auto', fontSize: 11, color: '#3E403E', whiteSpace: 'nowrap' }}>
                {t.plotsScored} plots scored · {t.scores} scores · {t.sprayTicks} spray ticks
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ padding: '9px 18px', borderTop: '1px solid #EDEEED', fontSize: 10.5, color: '#8A8C8A' }}>
          Tap a pin for the trials at that site · pins with a number hold several trials · neutral ground until a Maps API key connects satellite imagery
        </div>
      )}
    </div>
  )
}
