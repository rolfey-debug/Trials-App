/**
 * Sprayer-bike guidance engine — pure maths, no DOM, fully unit-tested
 * (test/guidance.test.ts).
 *
 * A phone on its own is a ±2–4 m position source. Everything here is about
 * squeezing guidance-grade *relative* accuracy out of that:
 *
 *  - TrackFilter      fuses the receiver's Doppler speed/course (cm/s-grade,
 *                     far better than its positions) with the position fixes,
 *                     so the cross-track readout is smooth and can be
 *                     projected ahead between 1 Hz fixes.
 *  - BaseStation /    a second, stationary phone measures the GPS wander it
 *    BaseCorrector    sees (it knows it is not moving) and the rover subtracts
 *                     the shared part. The gain is *learned* every time the
 *                     bike is parked, so the correction is only ever applied
 *                     as far as it is measured to help.
 *  - fitLine          the AB line is a least-squares fit through every fix of
 *                     the first pass, not a line through two noisy points.
 *  - Coverage         as-applied map with area + double-spray tally.
 */
import type { LatLng } from '../store/types'

const R = 6371000
const rad = (d: number) => (d * Math.PI) / 180
const deg = (r: number) => (r * 180) / Math.PI

// ---------------------------------------------------------------- vectors ---

/** Local east/north metres. */
export interface Vec {
  e: number
  n: number
}

export const vadd = (a: Vec, b: Vec): Vec => ({ e: a.e + b.e, n: a.n + b.n })
export const vsub = (a: Vec, b: Vec): Vec => ({ e: a.e - b.e, n: a.n - b.n })
export const vmul = (a: Vec, k: number): Vec => ({ e: a.e * k, n: a.n * k })
export const vdot = (a: Vec, b: Vec): number => a.e * b.e + a.n * b.n
export const vlen = (a: Vec): number => Math.hypot(a.e, a.n)
export const vlerp = (a: Vec, b: Vec, t: number): Vec => ({ e: a.e + (b.e - a.e) * t, n: a.n + (b.n - a.n) * t })
/** Unit vector along a compass heading (degrees clockwise from north). */
export const unit = (headingDeg: number): Vec => ({ e: Math.sin(rad(headingDeg)), n: Math.cos(rad(headingDeg)) })
/** Unit vector 90° to the right of a compass heading. */
export const rightOf = (headingDeg: number): Vec => ({ e: Math.cos(rad(headingDeg)), n: -Math.sin(rad(headingDeg)) })
export const headingOf = (v: Vec): number => (deg(Math.atan2(v.e, v.n)) + 360) % 360
/** a − b, wrapped to [−180, 180). */
export const angDiff = (a: number, b: number): number => ((((a - b + 180) % 360) + 360) % 360) - 180

/** Local tangent plane about an origin — millimetre-faithful over a paddock. */
export class Frame {
  private k: number
  constructor(public origin: LatLng) {
    this.k = Math.cos(rad(origin.lat))
  }
  toEN(p: LatLng): Vec {
    return { e: rad(p.lng - this.origin.lng) * R * this.k, n: rad(p.lat - this.origin.lat) * R }
  }
  toLL(v: Vec): LatLng {
    return { lat: this.origin.lat + deg(v.n / R), lng: this.origin.lng + deg(v.e / (R * this.k)) }
  }
}

// ------------------------------------------------------------ lines/steer ---

export interface Line {
  a: Vec
  headingDeg: number
}

/** Signed distance from the line: +ve = right of it, looking along its heading. */
export const crossTrack = (p: Vec, line: Line): number => vdot(vsub(p, line.a), rightOf(line.headingDeg))
export const alongTrack = (p: Vec, line: Line): number => vdot(vsub(p, line.a), unit(line.headingDeg))

/** Nearest swath, with hysteresis so the readout doesn't flap mid-headland. */
export function pickSwath(xt: number, spacing: number, prev: number | null): number {
  const f = xt / spacing
  if (prev != null && Math.abs(f - prev) < 0.62) return prev
  return Math.round(f)
}

export interface Steer {
  /** signed swath index — 0 is the AB line itself, +ve to its right */
  swath: number
  /** metres the bike sits off its line, in the DRIVER's frame: +ve = bike is right of the line → steer left */
  offM: number
  /** the same, projected `lookaheadS` down the current course — what the lightbar shows */
  aheadOffM: number
  /** driving against the A→B direction */
  reversed: boolean
  /** course − line direction as driven, degrees (+ve = pointing right of the line) */
  headingErrDeg: number
}

export function steer(p: Vec, courseDeg: number | null, speedMs: number, line: Line, spacing: number, lookaheadS: number, swath: number): Steer {
  const off = crossTrack(p, line) - swath * spacing
  const reversed = courseDeg != null && Math.abs(angDiff(courseDeg, line.headingDeg)) > 90
  const sign = reversed ? -1 : 1
  let ahead = off
  let headingErr = 0
  if (courseDeg != null) {
    const pa = vadd(p, vmul(unit(courseDeg), speedMs * lookaheadS))
    ahead = crossTrack(pa, line) - swath * spacing
    headingErr = angDiff(courseDeg, reversed ? line.headingDeg + 180 : line.headingDeg)
  }
  return { swath, offM: off * sign, aheadOffM: ahead * sign, reversed, headingErrDeg: headingErr }
}

export interface LineFit {
  a: Vec
  headingDeg: number
  /** RMS perpendicular scatter of the fixes about the fitted line */
  rmsM: number
  lengthM: number
}

/**
 * Total-least-squares line through a driven pass. Two single fixes 100 m apart
 * with ±2 m error each give a heading good to ~1.6° — 2.8 m out by the far end.
 * A fit through every fix of the pass averages the fix-to-fix noise down
 * (≈3× tighter on a 120 m run at 1 Hz, more on longer runs).
 */
export function fitLine(pts: Vec[]): LineFit | null {
  if (pts.length < 2) return null
  const m = pts.reduce((s, p) => vadd(s, p), { e: 0, n: 0 })
  m.e /= pts.length
  m.n /= pts.length
  let see = 0
  let sen = 0
  let snn = 0
  for (const p of pts) {
    const de = p.e - m.e
    const dn = p.n - m.n
    see += de * de
    sen += de * dn
    snn += dn * dn
  }
  const th = 0.5 * Math.atan2(2 * sen, see - snn) // principal axis, angle from east
  let d: Vec = { e: Math.cos(th), n: Math.sin(th) }
  if (vdot(vsub(pts[pts.length - 1], pts[0]), d) < 0) d = vmul(d, -1)
  const perp: Vec = { e: d.n, n: -d.e }
  let ss = 0
  for (const p of pts) ss += vdot(vsub(p, m), perp) ** 2
  const t0 = vdot(vsub(pts[0], m), d)
  const t1 = vdot(vsub(pts[pts.length - 1], m), d)
  if (t1 - t0 < 1e-6) return null
  return { a: vadd(m, vmul(d, t0)), headingDeg: headingOf(d), rmsM: Math.sqrt(ss / pts.length), lengthM: t1 - t0 }
}

// ------------------------------------------------------------ track filter --

export interface FilterState {
  pos: Vec
  vel: Vec
  /** m/s */
  speed: number
  /** course over ground; held from the last movement while parked */
  courseDeg: number | null
  /** seconds continuously stationary */
  stillS: number
  /** receiver supplied Doppler speed + course on the last fix */
  doppler: boolean
  /** ms timestamp of the last fix */
  t: number
}

const STILL_MS = 0.3 // m/s — below this the bike is treated as parked

/**
 * Complementary filter: dead-reckon on the receiver's velocity, pull gently
 * toward its positions. Phone positions jump about fix-to-fix; phone velocity
 * (Doppler) does not, so the blend follows real movement instantly while
 * averaging position noise over ~5–10 s. Parked, it averages much harder.
 * When the receiver is survey-grade (RTK via mock location, accuracy ≪ 1 m)
 * the gain rises on its own and the filter gets out of the way.
 */
export class TrackFilter {
  s: FilterState | null = null
  private P = 0
  private lastZ: Vec | null = null

  reset() {
    this.s = null
    this.lastZ = null
  }

  update(z: Vec, accM: number, speed: number | null, headingDeg: number | null, t: number): FilterState {
    const prev = this.s
    if (!prev || t - prev.t > 6000 || t <= prev.t) {
      this.P = Math.max(accM, 0.03) ** 2
      this.lastZ = z
      const sp = speed ?? 0
      const hd = headingDeg != null && !Number.isNaN(headingDeg) ? headingDeg : null
      this.s = { pos: z, vel: hd != null ? vmul(unit(hd), sp) : { e: 0, n: 0 }, speed: sp, courseDeg: sp > 0.5 ? hd : (prev?.courseDeg ?? null), stillS: 0, doppler: speed != null && hd != null, t }
      return this.s
    }
    const dt = (t - prev.t) / 1000
    const haveHeading = headingDeg != null && !Number.isNaN(headingDeg)
    const doppler = speed != null && (haveHeading || speed < STILL_MS)
    let vel: Vec
    let sp: number
    if (doppler) {
      sp = speed!
      vel = sp < STILL_MS ? { e: 0, n: 0 } : vmul(unit(headingDeg!), sp)
    } else {
      // No Doppler from this browser: derive velocity from the fixes themselves.
      const raw = vmul(vsub(z, this.lastZ ?? z), 1 / dt)
      vel = vlerp(prev.vel, raw, 0.45)
      sp = vlen(vel)
      if (sp < STILL_MS) vel = { e: 0, n: 0 }
    }
    const still = sp < STILL_MS
    const pred = vadd(prev.pos, vmul(vadd(prev.vel, vel), 0.5 * dt))
    const sigV = still ? 0.04 : doppler ? 0.25 : 0.8
    this.P += (sigV * dt) ** 2
    const Rm = Math.max(accM, 0.03) ** 2
    let K = this.P / (this.P + Rm)
    K = Math.min(0.95, Math.max(still ? 0.04 : doppler ? 0.1 : 0.35, K))
    const innov = vsub(z, pred)
    if (vlen(innov) > Math.max(3 * accM, 4)) K = Math.max(K, 0.7) // filter has lost the plot — catch up
    this.P = (1 - K) * this.P
    const pos = vadd(pred, vmul(innov, K))
    const courseDeg = sp > 0.5 ? (doppler ? headingDeg! : headingOf(vel)) : prev.courseDeg
    this.lastZ = z
    this.s = { pos, vel, speed: sp, courseDeg, stillS: still ? prev.stillS + dt : 0, doppler, t }
    return this.s
  }

  /** Position extrapolated to `t` (ms) on the last velocity — smooth display between fixes. */
  at(t: number): Vec | null {
    if (!this.s) return null
    const dt = Math.min(2, Math.max(0, (t - this.s.t) / 1000))
    return vadd(this.s.pos, vmul(this.s.vel, dt))
  }
}

// ------------------------------------------------------------- base station --

/** What the base phone broadcasts (kept tiny — one every couple of seconds). */
export interface BaseMsg {
  k: 'b'
  /** settle = GPS still settling after being put down; locked = offsets are usable */
  s: 'settle' | 'locked'
  /** this fix minus the base's anchor point, metres — its apparent movement, i.e. GPS error */
  e: number
  n: number
  acc: number
  /** anchor id — changes whenever the base is moved and re-anchors */
  id: string
  /** settle seconds remaining */
  left: number
}

export const SETTLE_S = 15

/**
 * The stationary phone. Once its GPS has settled it drops an anchor where it
 * is, then reports how far each new fix lands from that anchor. Because the
 * phone has not moved, any change in that offset *is* GPS error — and the part
 * of it both phones share (satellite orbit/clock, atmosphere) is what the
 * rover removes. Only changes are ever used, so the anchor needs no survey.
 */
export class BaseStation {
  state: 'settle' | 'locked' = 'settle'
  id = ''
  /** latest offset from the anchor */
  off: Vec = { e: 0, n: 0 }
  acc = 0
  settleS = 0
  /** the phone was picked up / driven off and has re-anchored */
  moved = false
  private frame: Frame | null = null
  private t0 = -1
  private far = 0
  private mean: Vec = { e: 0, n: 0 } // slow centre of the wander — the "has it moved?" yardstick

  restart() {
    this.state = 'settle'
    this.id = ''
    this.frame = null
    this.settleS = 0
    this.t0 = -1
    this.far = 0
    this.off = { e: 0, n: 0 }
    this.mean = { e: 0, n: 0 }
  }

  onFix(p: LatLng, accM: number, speed: number | null, t: number): BaseMsg {
    this.acc = accM
    const driving = speed != null && speed > 1.5
    if (this.state === 'settle') {
      if (driving || this.t0 < 0) this.t0 = t // being carried into place — wait until it is put down
      this.settleS = (t - this.t0) / 1000
      if (this.settleS < SETTLE_S) return { k: 'b', s: 'settle', e: 0, n: 0, acc: accM, id: '', left: Math.ceil(SETTLE_S - this.settleS) }
      this.frame = new Frame(p)
      this.id = Math.random().toString(36).slice(2, 8)
      this.state = 'locked'
    }
    this.off = this.frame!.toEN(p)
    this.mean = vlerp(this.mean, this.off, 0.01)
    // Moved off the mark? A parked phone never reads 12 m from its own average for long.
    this.far = vlen(vsub(this.off, this.mean)) > 12 || driving ? this.far + 1 : 0
    if (this.far >= 4) {
      this.restart()
      this.moved = true
      return { k: 'b', s: 'settle', e: 0, n: 0, acc: accM, id: '', left: SETTLE_S }
    }
    return { k: 'b', s: 'locked', e: +this.off.e.toFixed(3), n: +this.off.n.toFixed(3), acc: +accM.toFixed(1), id: this.id, left: 0 }
  }
}

export interface CorrectorStatus {
  /** off = no base heard; settle = base GPS settling; live = correcting; stale = base gone quiet, correction on hold */
  state: 'off' | 'settle' | 'live' | 'stale'
  ageS: number
  settleLeftS: number
  /** 0–1 — how much of the base's wander is being subtracted */
  gain: number
  /** measured cut in parked-drift variance, % (null until ~1 min of parked data) */
  cutPct: number | null
  /** seconds of parked data behind the gain */
  learnedS: number
  /** size of the correction being applied right now, metres */
  applyingM: number
  baseAccM: number
}

const TAU_SLOW = 12 // s — only the slow, shareable part of the wander is used
const PRIOR_GAIN = 0.5
const PRIOR_WEIGHT = 20 // m²·samples of belief in the prior
const MAX_STEP = 5 // m — a single base update can never move the rover further than this

interface Sums {
  n: number
  r: Vec
  b: Vec
  rb: number
  bb: number
  rr: number
}
const zeroSums = (): Sums => ({ n: 0, r: { e: 0, n: 0 }, b: { e: 0, n: 0 }, rb: 0, bb: 0, rr: 0 })

/**
 * Rover side of the two-phone differential.
 *
 * Phones give positions, not raw satellite measurements, so this is a
 * position-domain correction: it can only remove error the two receivers
 * share. How much they share depends on the pair of phones and the sky, so
 * rather than assume, the rover *measures* it — whenever the bike is parked
 * (every refill), its own apparent wander is regressed against the base's.
 * The fitted gain (0 = phones disagree, ignore the base; 1 = they wander
 * together, subtract it all) is what gets applied. Useless base ⇒ gain → 0.
 *
 * The correction is built from *changes* in the base's offset since the link
 * came up (gain × Δoffset, accumulated), so linking mid-job, a re-anchored
 * base, or the gain being re-learned never makes the guidance frame jump.
 */
export class BaseCorrector {
  private slow: Vec | null = null // low-passed base offset
  private lastMsgT = 0
  private anchorId = ''
  private settleLeft = 0
  private heard = false
  private baseAcc = 0
  private target: Vec = { e: 0, n: 0 }
  private applied: Vec = { e: 0, n: 0 }
  private appliedT = 0
  // learning
  private total = zeroSums() // centred sums over finished parked windows
  private totalS = 0
  private win = zeroSums()
  private winS = 0
  private roverSlow: Vec | null = null
  private roverT = 0

  /** Feed a base broadcast, stamped with the rover's own clock. */
  onBase(m: BaseMsg, t: number) {
    this.heard = true
    this.baseAcc = m.acc
    if (m.s !== 'locked') {
      this.settleLeft = m.left
      this.lastMsgT = t
      if (this.anchorId) {
        this.anchorId = ''
        this.slow = null
        this.closeWindow()
      }
      return
    }
    const off: Vec = { e: m.e, n: m.n }
    if (m.id !== this.anchorId || !this.slow) {
      // new anchor: start following from here — what is already applied stays put
      this.anchorId = m.id
      this.slow = off
      this.closeWindow()
    } else {
      const dt = Math.min(30, Math.max(0.1, (t - this.lastMsgT) / 1000))
      const next = vlerp(this.slow, off, 1 - Math.exp(-dt / TAU_SLOW))
      let d = vmul(vsub(next, this.slow), this.gain())
      if (vlen(d) > MAX_STEP) d = vmul(d, MAX_STEP / vlen(d))
      this.target = vadd(this.target, d)
      this.slow = next
    }
    this.settleLeft = 0
    this.lastMsgT = t
  }

  private centred(s: Sums) {
    if (s.n < 2) return { rb: 0, bb: 0, rr: 0 }
    return {
      rb: s.rb - (s.r.e * s.b.e + s.r.n * s.b.n) / s.n,
      bb: s.bb - (s.b.e * s.b.e + s.b.n * s.b.n) / s.n,
      rr: s.rr - (s.r.e * s.r.e + s.r.n * s.r.n) / s.n,
    }
  }

  private closeWindow() {
    if (this.winS >= 20) {
      const c = this.centred(this.win)
      this.total.rb += c.rb
      this.total.bb += c.bb
      this.total.rr += c.rr
      this.totalS += this.winS
    }
    this.win = zeroSums()
    this.winS = 0
    this.roverSlow = null
  }

  /**
   * Feed every raw rover fix. While parked, the rover's apparent movement is
   * pure GPS error — the only time truth is known — so that is when the gain
   * is learned. `stillS` = seconds stationary (from the TrackFilter).
   */
  onRover(raw: Vec, stillS: number, t: number) {
    const fresh = this.slow && this.anchorId && t - this.lastMsgT < 8000
    if (stillS < 4 || !fresh) {
      if (this.winS) this.closeWindow()
      this.roverT = t
      return
    }
    const dt = Math.min(5, Math.max(0.05, (t - this.roverT) / 1000))
    this.roverT = t
    this.roverSlow = this.roverSlow ? vlerp(this.roverSlow, raw, 1 - Math.exp(-dt / TAU_SLOW)) : raw
    const r = this.roverSlow
    const b = this.slow!
    const w = this.win
    w.n++
    w.r = vadd(w.r, r)
    w.b = vadd(w.b, b)
    w.rb += vdot(r, b)
    w.bb += vdot(b, b)
    w.rr += vdot(r, r)
    this.winS += dt
    if (this.winS > 600) this.closeWindow() // bank long stops in 10-minute blocks
  }

  private sums() {
    const c = this.winS >= 20 ? this.centred(this.win) : { rb: 0, bb: 0, rr: 0 }
    return { rb: this.total.rb + c.rb, bb: this.total.bb + c.bb, rr: this.total.rr + c.rr, s: this.totalS + (this.winS >= 20 ? this.winS : 0) }
  }

  gain(): number {
    const s = this.sums()
    return Math.max(0, Math.min(1, (s.rb + PRIOR_WEIGHT * PRIOR_GAIN) / (s.bb + PRIOR_WEIGHT)))
  }

  /** The vector to subtract from a raw rover fix at time `t` — slew-limited (0.25 m/s) so it never jumps. */
  correction(t: number): Vec {
    const dt = this.appliedT ? Math.min(5, Math.max(0, (t - this.appliedT) / 1000)) : 0
    this.appliedT = t
    const d = vsub(this.target, this.applied)
    const step = 0.25 * dt
    const L = vlen(d)
    if (L <= step) this.applied = this.target
    else if (step > 0) this.applied = vadd(this.applied, vmul(d, step / L))
    return this.applied
  }

  status(t: number): CorrectorStatus {
    const ageS = this.heard ? (t - this.lastMsgT) / 1000 : Infinity
    const s = this.sums()
    const g = this.gain()
    let cutPct: number | null = null
    if (s.s >= 60 && s.rr > 1e-6) cutPct = Math.round((1 - (s.rr - 2 * g * s.rb + g * g * s.bb) / s.rr) * 100)
    const state: CorrectorStatus['state'] = !this.heard || ageS > 600 ? 'off' : !this.anchorId ? (ageS > 15 ? 'off' : 'settle') : ageS > 10 ? 'stale' : 'live'
    return { state, ageS, settleLeftS: this.settleLeft, gain: g, cutPct, learnedS: Math.round(s.s), applyingM: vlen(this.applied), baseAccM: this.baseAcc }
  }
}

// ---------------------------------------------------------------- coverage --

export type BoomId = 'rear' | 'front'

export interface StripPt {
  l: Vec
  r: Vec
}
export interface Strip {
  boom: BoomId
  pass: number
  pts: StripPt[]
}

const CELL = 0.5 // m — raster for the area / double-spray tally

/** As-applied record: strips for drawing, a 0.5 m raster for area + overlap. */
export class Coverage {
  strips: Strip[] = []
  areaM2 = 0
  overlapM2 = 0
  private cells = new Map<number, number>()

  private mark(p: Vec, pass: number) {
    const key = (Math.floor(p.e / CELL) + 32768) * 65536 + (Math.floor(p.n / CELL) + 32768)
    const was = this.cells.get(key)
    if (was === undefined) this.areaM2 += CELL * CELL
    else if (was !== pass) this.overlapM2 += CELL * CELL
    else return
    this.cells.set(key, pass)
  }

  private raster(a: StripPt, b: StripPt, pass: number) {
    const along = Math.max(vlen(vsub(b.l, a.l)), vlen(vsub(b.r, a.r)))
    const width = Math.max(vlen(vsub(a.r, a.l)), vlen(vsub(b.r, b.l)))
    const na = Math.max(1, Math.ceil(along / (CELL / 2)))
    const nw = Math.max(1, Math.ceil(width / (CELL / 2)))
    for (let i = 0; i <= na; i++) {
      const l = vlerp(a.l, b.l, i / na)
      const r = vlerp(a.r, b.r, i / na)
      // sample cell-centre-ish points across the boom, inset so edges don't bleed a cell
      for (let j = 0; j < nw; j++) this.mark(vlerp(l, r, (j + 0.5) / nw), pass)
    }
  }

  /** Lay the boom down at `centre`. Call once per fix while spraying. */
  add(centre: Vec, headingDeg: number, widthM: number, boom: BoomId, pass: number) {
    const half = vmul(rightOf(headingDeg), widthM / 2)
    const pt: StripPt = { l: vsub(centre, half), r: vadd(centre, half) }
    const last = this.strips[this.strips.length - 1]
    const lp = last?.pts[last.pts.length - 1]
    const gap = lp ? vlen(vsub(vlerp(lp.l, lp.r, 0.5), centre)) : Infinity
    if (last && last.boom === boom && last.pass === pass && gap < 8) {
      if (gap < 0.25) return
      this.raster(lp!, pt, pass)
      last.pts.push(pt)
    } else {
      this.strips.push({ boom, pass, pts: [pt] })
      this.raster(pt, pt, pass)
    }
  }

  clear() {
    this.strips = []
    this.cells.clear()
    this.areaM2 = 0
    this.overlapM2 = 0
  }

  /** Rebuild the raster from saved strips (after a reload). */
  load(strips: Strip[]) {
    this.clear()
    for (const s of strips) {
      if (!s.pts.length) continue
      this.strips.push(s)
      this.raster(s.pts[0], s.pts[0], s.pass)
      for (let i = 1; i < s.pts.length; i++) this.raster(s.pts[i - 1], s.pts[i], s.pass)
    }
  }
}

// ------------------------------------------------------------ trial overlay --

export interface PlotEN {
  pid: number
  poly: Vec[]
  centre: Vec
}

export function plotAt(p: Vec, plots: PlotEN[]): PlotEN | null {
  for (const pl of plots) {
    let inside = false
    const q = pl.poly
    for (let i = 0, j = q.length - 1; i < q.length; j = i++) {
      if (q[i].n > p.n !== q[j].n > p.n && p.e < ((q[j].e - q[i].e) * (p.n - q[i].n)) / (q[j].n - q[i].n) + q[i].e) inside = !inside
    }
    if (inside) return pl
  }
  return null
}

// -------------------------------------------------------------------- rate ---

/** Boom sprayers without a rate controller apply ∝ 1/speed: the rate actually going on. */
export const rateAtSpeed = (calRateLPerHa: number, calSpeedKmh: number, speedKmh: number): number =>
  speedKmh > 0.2 ? (calRateLPerHa * calSpeedKmh) / speedKmh : 0
