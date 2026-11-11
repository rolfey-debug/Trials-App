/** Guidance engine tests — simulated bike, simulated GPS error, real maths. */
import {
  Frame, TrackFilter, BaseStation, BaseCorrector, Coverage, SETTLE_S,
  angDiff, crossTrack, fitLine, pickSwath, plotAt, rateAtSpeed, steer, unit, vadd, vlen, vmul, vsub, rightOf,
  type Vec,
} from '../src/guidance/engine'

let passed = 0
function check(name: string, cond: boolean, detail?: unknown) {
  if (!cond) {
    console.error(`FAIL ${name}`, detail ?? '')
    process.exit(1)
  }
  console.log(`ok ${name}`)
  passed++
}

// seeded RNG + gaussian, so every run is the same paddock
function rng(seed: number) {
  let s = seed >>> 0
  const u = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0), s / 4294967296)
  return { u, g: () => Math.sqrt(-2 * Math.log(u() + 1e-12)) * Math.cos(2 * Math.PI * u()) }
}
/** Slow wander (Ornstein–Uhlenbeck): the multi-minute GPS drift. */
function wander(r: ReturnType<typeof rng>, sigma: number, tau: number) {
  let v: Vec = { e: r.g() * sigma, n: r.g() * sigma }
  return (dt: number): Vec => {
    const a = Math.exp(-dt / tau)
    const k = sigma * Math.sqrt(1 - a * a)
    v = { e: v.e * a + r.g() * k, n: v.n * a + r.g() * k }
    return v
  }
}
const rms = (xs: number[]) => Math.sqrt(xs.reduce((s, x) => s + x * x, 0) / xs.length)

// --- frame / geometry ----------------------------------------------------------

{
  const f = new Frame({ lat: -35.99, lng: 146.39 }) // Corowa
  const p = { lat: -35.9891, lng: 146.3912 }
  const v = f.toEN(p)
  const back = f.toLL(v)
  check('frame: lat/lng → EN → lat/lng round-trips', Math.abs(back.lat - p.lat) < 1e-10 && Math.abs(back.lng - p.lng) < 1e-10)
  check('frame: 0.0009° lat ≈ 100 m north', Math.abs(v.n - 100.08) < 0.1, v)
  check('angDiff wraps', angDiff(350, 10) === -20 && angDiff(10, 350) === 20 && angDiff(180, 0) === -180)
}

{
  const line = { a: { e: 0, n: 0 }, headingDeg: 0 } // due north
  check('crossTrack: east of a north line is right (+)', crossTrack({ e: 2, n: 50 }, line) === 2)
  check('pickSwath: 6 m swaths', pickSwath(13, 6, null) === 2 && pickSwath(-4, 6, null) === -1)
  check('pickSwath: hysteresis holds the current swath through the half-way point', pickSwath(9.5, 6, 1) === 1 && pickSwath(10, 6, 1) === 2)
  // on swath 2 (centre e=12), sitting at e=12.4 heading north → right of line → +0.4
  const s = steer({ e: 12.4, n: 10 }, 0, 2.5, line, 6, 1.5, 2)
  check('steer: right of line driving A→B reads +', Math.abs(s.offM - 0.4) < 1e-9 && !s.reversed)
  // same spot heading south: the line is now on the driver's right → −0.4
  const r = steer({ e: 12.4, n: 10 }, 180, 2.5, line, 6, 1.5, 2)
  check('steer: flips for the return pass', Math.abs(r.offM + 0.4) < 1e-9 && r.reversed)
  // heading 5° right of line: lookahead grows the error
  const h = steer({ e: 12.4, n: 10 }, 5, 2.5, line, 6, 1.5, 2)
  check('steer: lookahead projects the heading error', h.aheadOffM > h.offM + 0.3 && Math.abs(h.headingErrDeg - 5) < 1e-9)
}

{
  // A driven pass: 120 m on heading 37°, ±1 m GPS scatter. Fit vs two-point.
  const r = rng(7)
  const u = unit(37)
  const errsFit: number[] = []
  const errsTwo: number[] = []
  for (let trial = 0; trial < 40; trial++) {
    const pts: Vec[] = []
    for (let d = 0; d <= 120; d += 2.5) pts.push(vadd(vmul(u, d), { e: r.g() * 1.0, n: r.g() * 1.0 }))
    const fit = fitLine(pts)!
    errsFit.push(angDiff(fit.headingDeg, 37))
    const two = vsub(pts[pts.length - 1], pts[0])
    errsTwo.push(angDiff((Math.atan2(two.e, two.n) * 180) / Math.PI, 37))
  }
  check('fitLine: heading within 0.3° RMS from ±1 m fixes', rms(errsFit) < 0.3, rms(errsFit))
  check('fitLine: ≥2.5× tighter than a two-point AB line', rms(errsTwo) > 2.5 * rms(errsFit), [rms(errsTwo), rms(errsFit)])
  const fit = fitLine([{ e: 0, n: 0 }, { e: 0, n: 50 }, { e: 0, n: 100 }])!
  check('fitLine: oriented first → last, starts at the first point', Math.abs(fit.headingDeg) < 1e-6 && Math.abs(fit.lengthM - 100) < 1e-6 && vlen(fit.a) < 1e-6)
}

// --- track filter ----------------------------------------------------------------

{
  // Bike at 9 km/h up a north line; fixes jitter ±1.2 m; Doppler is clean.
  const r = rng(11)
  const f = new TrackFilter()
  const raw: number[] = []
  const filt: number[] = []
  for (let t = 0; t < 120; t++) {
    const truth: Vec = { e: 0, n: 2.5 * t }
    const z = vadd(truth, { e: r.g() * 1.2, n: r.g() * 1.2 })
    const s = f.update(z, 3, 2.5 + r.g() * 0.05, r.g() * 0.4, t * 1000)
    if (t > 20) {
      raw.push(z.e)
      filt.push(s.pos.e)
    }
  }
  check('filter: cross-track jitter cut ≥2× using Doppler velocity', rms(filt) < rms(raw) / 2, [rms(raw), rms(filt)])
  const ahead = f.at(119_500)!
  check('filter: extrapolates between fixes on the last velocity', Math.abs(ahead.n - f.s!.pos.n - 1.25) < 0.1)
}

{
  // A headland turn (90° over 6 s) must be followed, not smoothed away.
  const f = new TrackFilter()
  let truth: Vec = { e: 0, n: 0 }
  let hd = 0
  for (let i = 0; i <= 400; i++) {
    const t = i / 10
    if (t > 20 && hd < 90) hd += 1.5
    if (i % 10 === 0) f.update(truth, 3, 2.5, hd, t * 1000)
    truth = vadd(truth, vmul(unit(hd), 0.25))
  }
  truth = vsub(truth, vmul(unit(hd), 0.25))
  check('filter: follows a headland turn on velocity, no smoothing lag', vlen(vsub(f.s!.pos, truth)) < 0.15, vlen(vsub(f.s!.pos, truth)))
}

{
  // No Doppler (speed/heading null): still usable, derives course from the fixes.
  const f = new TrackFilter()
  for (let t = 0; t < 30; t++) f.update({ e: 2.5 * t, n: 0 }, 3, null, null, t * 1000)
  check('filter: derives course when the browser gives none', Math.abs(angDiff(f.s!.courseDeg!, 90)) < 1 && !f.s!.doppler && Math.abs(f.s!.speed - 2.5) < 0.1)
  // RTK-grade accuracy: filter must not smooth a good receiver
  const g = new TrackFilter()
  g.update({ e: 0, n: 0 }, 0.02, 2, 0, 0)
  const s = g.update({ e: 0.3, n: 2 }, 0.02, 2, 0, 1000)
  check('filter: trusts an RTK-grade fix almost completely', Math.abs(s.pos.e - 0.3) < 0.03)
  // parked counter
  const h = new TrackFilter()
  for (let t = 0; t < 12; t++) h.update({ e: 0, n: 0 }, 3, 0, null, t * 1000)
  check('filter: counts parked seconds', Math.abs(h.s!.stillS - 11) < 1e-9)
}

// --- two-phone differential -------------------------------------------------------

/**
 * Park-and-drive day. Both phones see a shared slow wander (`common`) plus
 * their own (`own`). Returns the rover's error with and without the base.
 */
function differentialDay(seed: number, commonSigma: number, ownSigma: number) {
  const r = rng(seed)
  const common = wander(r, commonSigma, 240)
  const ownR = wander(r, ownSigma, 180)
  const ownB = wander(r, ownSigma, 180)
  const base = new BaseStation()
  const corr = new BaseCorrector()
  const filt = new TrackFilter()
  const baseLL = { lat: -35.99, lng: 146.39 }
  const bf = new Frame(baseLL)
  const errRaw: number[] = []
  const errFix: number[] = []
  let truth: Vec = { e: 40, n: 0 }
  for (let t = 0; t < 3600; t++) {
    const c = common(1)
    const bErr = vadd(c, vadd(ownB(1), { e: r.g() * 0.3, n: r.g() * 0.3 }))
    const rErr = vadd(c, vadd(ownR(1), { e: r.g() * 0.3, n: r.g() * 0.3 }))
    if (t % 2 === 0) corr.onBase(base.onFix(bf.toLL(bErr), 3, 0, t * 1000), t * 1000)
    // rover: 4 min parked (refill), 6 min spraying, repeat
    const parked = t % 600 < 240
    const speed = parked ? 0 : 2.5
    if (!parked) truth = vadd(truth, vmul(unit(Math.floor(t / 60) % 2 ? 180 : 0), speed))
    const raw = vadd(truth, rErr)
    const st = filt.update(raw, 3, speed, 0, t * 1000)
    corr.onRover(raw, st.stillS, t * 1000)
    const fixed = vsub(raw, corr.correction(t * 1000))
    if (t > 1200) {
      // judge the slow drift relative to where it stood at t=1200 (pass-to-pass is what guidance needs)
      errRaw.push(rErr.e, rErr.n)
      errFix.push(vsub(fixed, truth).e, vsub(fixed, truth).n)
    }
  }
  const spread = (xs: number[]) => {
    // e and n carry different constant offsets — centre each axis on its own
    const ax = (k: number) => xs.filter((_, i) => i % 2 === k)
    const c = (v: number[]) => {
      const m = v.reduce((s, x) => s + x, 0) / v.length
      return v.map((x) => x - m)
    }
    return rms([...c(ax(0)), ...c(ax(1))])
  }
  return { raw: spread(errRaw), fixed: spread(errFix), status: corr.status(3600_000) }
}

{
  const b = new BaseStation()
  const ll = { lat: -35.99, lng: 146.39 }
  const at = (e: number, n: number) => new Frame(ll).toLL({ e, n })
  let m = b.onFix(ll, 3, 0, 0)
  check('base: settles first, counting down', m.s === 'settle' && m.left === SETTLE_S)
  for (let t = 1; t <= SETTLE_S; t++) m = b.onFix(ll, 3, 0, t * 1000)
  check('base: drops its anchor once settled', b.state === 'locked' && m.s === 'locked' && m.id.length > 0 && Math.abs(m.e) < 1e-6)
  const id = m.id
  m = b.onFix(at(1.5, -0.5), 3, 0, 17_000)
  check('base: reports each fix as an offset from the anchor', Math.abs(m.e - 1.5) < 0.01 && Math.abs(m.n + 0.5) < 0.01)
  // someone drives off with it
  for (let t = 18; t < 25; t++) m = b.onFix(at(40, 0), 3, 3, t * 1000)
  check('base: notices it has been moved and starts over', b.state === 'settle' && b.moved && m.s === 'settle')
  for (let t = 25; t < 45; t++) m = b.onFix(at(60, 0), 3, 0, t * 1000)
  check('base: re-anchors under a new id where it was put down', m.s === 'locked' && m.id !== id && Math.abs(m.e) < 0.01)
}

{
  // Phones that share most of their wander: the correction should clearly help.
  const d = differentialDay(3, 1.5, 0.5)
  check('differential: shared wander → drift cut by more than a third', d.fixed < d.raw * 0.66, d)
  check('differential: learns a high gain and reports the measured cut', d.status.gain > 0.6 && (d.status.cutPct ?? 0) > 30, d.status)
}

{
  // Phones that share nothing: the rover must learn to ignore the base.
  const d = differentialDay(5, 0, 1.5)
  check('differential: unrelated wander → gain learned down toward zero', d.status.gain < 0.2, d.status)
  check('differential: …and does no real harm', d.fixed < d.raw * 1.08, d)
}

{
  const c = new BaseCorrector()
  const msg = (e: number, id = 'r1') => ({ k: 'b' as const, s: 'locked' as const, e, n: 0, acc: 3, id, left: 0 })
  check('corrector: silent base → off, zero correction', c.status(0).state === 'off' && vlen(c.correction(1000)) === 0)
  c.onBase({ k: 'b', s: 'settle', e: 0, n: 0, acc: 3, id: '', left: 9 }, 1000)
  check('corrector: reports the settle countdown', c.status(1500).state === 'settle' && c.status(1500).settleLeftS === 9)
  // link comes up while the base already reads 3 m off its anchor: no jump
  c.onBase(msg(3), 2000)
  c.correction(2000)
  check('corrector: linking mid-job moves nothing', vlen(c.correction(3000)) === 0)
  // the base then wanders a further 2 m east
  for (let t = 4; t < 80; t += 2) {
    c.onBase(msg(5), t * 1000)
    c.correction(t * 1000)
  }
  check('corrector: follows the change at gain × Δ (prior gain 0.5 before any parked data)', Math.abs(c.correction(80_000).e - 1.0) < 0.02, c.correction(80_000))
  // a sudden 4 m base jump is fed in gently
  c.onBase(msg(9), 82_000)
  c.onBase(msg(9), 84_000)
  const before = c.correction(84_000).e
  const after = c.correction(85_000).e
  check('corrector: slew-limited to 0.25 m/s', after - before <= 0.2501, [before, after])
  check('corrector: live while the base is talking', c.status(85_000).state === 'live')
  check('corrector: stale after 10 s of silence — holds, does not snap back', c.status(100_000).state === 'stale' && c.correction(100_000).e > 0.9)
  // base moved: new anchor, wildly different offset — still no jump
  const held = c.correction(101_000).e
  c.onBase(msg(-30, 'r2'), 102_000)
  check('corrector: a re-anchored base never jumps the frame', Math.abs(c.correction(103_000).e - held) < 0.26 && Math.abs(c.correction(200_000).e - c.correction(103_000).e) < 2)
}

// --- coverage -----------------------------------------------------------------------

{
  const cov = new Coverage()
  for (let n = 0; n <= 100; n += 2.5) cov.add({ e: 0, n }, 0, 6, 'rear', 1)
  check('coverage: 6 m × 100 m pass ≈ 600 m²', Math.abs(cov.areaM2 - 600) < 30 && cov.overlapM2 === 0, cov.areaM2)
  // return pass 5 m over → 1 m double-sprayed strip
  for (let n = 100; n >= 0; n -= 2.5) cov.add({ e: 5, n }, 180, 6, 'rear', 2)
  check('coverage: second pass adds only new ground', Math.abs(cov.areaM2 - 1100) < 50, cov.areaM2)
  check('coverage: 1 m lap shows as ~100 m² double-sprayed', Math.abs(cov.overlapM2 - 100) < 40, cov.overlapM2)
  const again = new Coverage()
  again.load(JSON.parse(JSON.stringify(cov.strips)))
  check('coverage: reload from saved strips rebuilds the same tally', again.areaM2 === cov.areaM2 && again.overlapM2 === cov.overlapM2)
  const front = new Coverage()
  for (let n = 0; n <= 12; n += 1) front.add({ e: 1, n }, 0, 2, 'front', 1)
  check('coverage: 2 m shielded boom over one 12 m plot ≈ 24 m²', Math.abs(front.areaM2 - 24) < 4, front.areaM2)
}

// --- plots / rate ------------------------------------------------------------------

{
  const sq = (e: number, n: number, pid: number) => ({ pid, centre: { e: e + 1, n: n + 6 }, poly: [{ e, n }, { e: e + 2, n }, { e: e + 2, n: n + 12 }, { e, n: n + 12 }] })
  const plots = [sq(0, 0, 101), sq(2, 0, 102), sq(0, 12, 201)]
  check('plotAt: finds the plot under the boom', plotAt({ e: 2.6, n: 5 }, plots)?.pid === 102 && plotAt({ e: 1, n: 13 }, plots)?.pid === 201 && plotAt({ e: 9, n: 9 }, plots) === null)
  check('rate: 100 L/ha calibrated at 8 km/h is 80 L/ha at 10 km/h', Math.abs(rateAtSpeed(100, 8, 10) - 80) < 1e-9)
  check('rightOf: east is right of north', Math.abs(rightOf(0).e - 1) < 1e-12)
}

console.log(`${passed} guidance checks passed`)
