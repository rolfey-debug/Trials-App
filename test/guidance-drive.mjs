/* Bike-guidance drive: a scripted bike with phone-like GPS error works two
 * passes, then a second "phone" (another tab) is paired as the base station.
 * Needs `npm run preview` running. Time is fast-forwarded with Playwright's
 * clock so ten minutes of paddock take a few seconds.
 *
 *   node test/guidance-drive.mjs            # pairs over the same-device mirror
 *   LIVE_LINK=1 node test/guidance-drive.mjs  # also pairs two separate browsers over Supabase Realtime
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const BASE = 'http://localhost:4173'
const OUT = process.env.SHOT_DIR || './shots'
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  ...(process.env.LIVE_LINK && process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY, bypass: 'localhost' } } : {}),
})
const errors = []
let passed = 0
const check = (n, c, d) => {
  if (!c) {
    console.error('FAIL', n, d ?? '')
    process.exitCode = 1
  } else {
    console.log('ok', n)
    passed++
  }
}

/** A fake receiver: true position integrates speed/heading, the reported fix adds a slow wander both "phones" share. */
const gpsMock = () => {
  const R = 6371000
  const lat0 = -35.9937
  const lng0 = 146.3921
  const st = { e: 0, n: 0, heading: 0, speed: 0, turn: 0, own: 0 }
  window.__gps = st
  const wander = (t) => ({ e: 1.3 * Math.sin(t / 70000), n: 1.0 * Math.cos(t / 55000) })
  let seed = 42
  const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0), seed / 4294967296 - 0.5)
  // one receiver, any number of watchers (the app shell and the guidance screen both listen)
  const subs = new Map()
  let nextId = 1
  setInterval(() => {
    st.heading = (st.heading + st.turn + 360) % 360
    st.e += Math.sin((st.heading * Math.PI) / 180) * st.speed
    st.n += Math.cos((st.heading * Math.PI) / 180) * st.speed
    const w = wander(Date.now())
    const e = st.e + w.e + rnd() * 0.5 + st.own
    const n = st.n + w.n + rnd() * 0.5
    const fix = {
      coords: {
        latitude: lat0 + (n / R) * (180 / Math.PI),
        longitude: lng0 + (e / (R * Math.cos((lat0 * Math.PI) / 180))) * (180 / Math.PI),
        accuracy: 3,
        speed: st.speed,
        heading: st.speed > 0 ? st.heading : null,
      },
      timestamp: Date.now(),
    }
    for (const ok of subs.values()) ok(fix)
  }, 1000)
  navigator.geolocation.watchPosition = (ok) => (subs.set(nextId, ok), nextId++)
  navigator.geolocation.clearWatch = (id) => subs.delete(id)
}

/** Open a phone. The fake clock belongs to the browser context, so only the first phone in a context installs it. */
async function phone(ctx, url, time = new Date('2026-11-11T08:00:00+11:00')) {
  const first = ctx.pages().length === 0
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => m.type() === 'error' && !/net::|Failed to load resource|WebSocket/.test(m.text()) && errors.push(m.text()))
  if (first) await page.clock.install({ time })
  await page.addInitScript(gpsMock)
  await page.goto(url)
  // freeze time: from here it only moves when the test says so
  if (first) await page.clock.pauseAt(new Date(+time + 3000))
  return page
}
const run = (page, s) => page.clock.runFor(s * 1000)
const set = (page, patch) => page.evaluate((p) => Object.assign(window.__gps, p), patch)
const text = (page, id) => page.getByTestId(id).innerText()

const ctx = await browser.newContext({ viewport: { width: 412, height: 880 }, deviceScaleFactor: 2 })
const bike = await phone(ctx, BASE)

await bike.getByText('Sign in', { exact: true }).click()
await run(bike, 1)
await bike.getByText('Spray', { exact: true }).last().click()
await run(bike, 1)
await bike.getByText('Bike guidance', { exact: true }).click()
await run(bike, 6)
check('guidance opens with a GPS fix', (await text(bike, 'acc-chips')).includes('GPS ±3 m'))
check('no line yet', (await text(bike, 'pass')).trim() === '—')
await bike.screenshot({ path: `${OUT}/g1-waiting.png` })

// --- first pass: mark A, drive 150 m north, mark B --------------------------------
await bike.getByTestId('line').click()
await run(bike, 0.5)
await bike.screenshot({ path: `${OUT}/g2-line-sheet.png` })
await bike.getByText('Mark A here', { exact: true }).click()
await set(bike, { speed: 2.5, heading: 2 })
await bike.getByTestId('spray').click()
await run(bike, 30)
await bike.screenshot({ path: `${OUT}/g3-first-pass.png` })
await run(bike, 30)
await bike.getByText(/^Mark B — /).click()
await run(bike, 1.2)
check('line fitted through the driven pass', await bike.getByText(/Line fitted through \d+ fixes/).count() === 1)
check('on the AB pass', (await text(bike, 'pass')).trim() === 'AB')

// --- headland turn onto the next swath (5.7 m over), drive back ------------------------
await set(bike, { turn: 45 }) // 180° in 4 s, ~6 m across at 2.5 m/s
await run(bike, 4)
await set(bike, { turn: 0 })
await run(bike, 25)
check('picked up the next swath on the way back', (await text(bike, 'pass')).trim() === '1R', await text(bike, 'pass'))
const off = await text(bike, 'off')
const offM = parseFloat(off.replace(/[^\d.]/g, ''))
check('cross-track readout is live and sane (< 2 m off after an unsteered turn)', offM < 2, off)
await bike.screenshot({ path: `${OUT}/g4-return-pass.png` })
await run(bike, 30)

const area = await text(bike, 'area')
check('sprayed area tallied (~2 passes × 6 m × 150 m)', /0\.1[5-9] ha|0\.2\d ha/.test(area), area)
check('speed shown, on target colour band', (await text(bike, 'speed')).startsWith('9.0'))

// drift fix: "I'm on the line" zeroes the readout
await bike.getByText("I'm on the line", { exact: true }).click()
await run(bike, 1.2)
check('snap reports the drift it took out', await bike.getByText(/Drift zeroed — took out/).count() === 1)

// front boom: 2 m swaths
await bike.getByTestId('boom').click()
await run(bike, 1.2)
check('front boom selected — 2 m swath', (await text(bike, 'boom')).includes('Front 2 m'))
await bike.screenshot({ path: `${OUT}/g5-front-boom.png` })
await bike.getByTestId('boom').click()

// reload mid-job (phone browsers do this when they come back from a nap)
await bike.reload()
await run(bike, 4)
check('job resumes after a reload — line and sprayed area kept', (await text(bike, 'pass')).trim() !== '—' && /ha/.test(await text(bike, 'area')))
await bike.screenshot({ path: `${OUT}/g5b-resumed.png` })

// --- park, pair the second phone as base ---------------------------------------------------
await bike.getByTestId('spray').click()
await set(bike, { speed: 0 })
await run(bike, 2)
await bike.getByTestId('acc-chips').click()
await run(bike, 0.5)
const code = (await text(bike, 'pair-code')).replace(/\D/g, '')
check('pair code shown', code.length === 6, code)

// second tab = second phone; it shares the context's clock, so both see the same sky
const base = await phone(ctx, `${BASE}/?base=${code}`)
await run(bike, 2)
check('share link opens straight into the base station, no sign-in', await base.getByText('GPS base station', { exact: true }).count() === 1)
// One clock drives both phones — step it a second at a time so their messages interleave as they would live.
const both = async (s) => {
  for (let i = 0; i < s; i++) await run(bike, 1)
}
await both(10)
await base.screenshot({ path: `${OUT}/g6-base-settling.png` })
await both(10)
check('base anchors after settling', (await text(base, 'base-state')).includes('Anchored'))
check('base hears the bike', (await text(base, 'rover-state')).includes('listening'))
check('bike shows the base as linked', /Linked and correcting/.test(await text(bike, 'base-status')), await text(bike, 'base-status'))

// parked for five minutes (a refill): the bike measures what the base is worth
await both(300)
const status = await text(bike, 'base-status')
check('gain learned while parked, benefit reported', /cuts this phone's drift by \d+%/.test(status), status)
const cut = Number(status.match(/drift by (\d+)%/)?.[1] ?? 0)
check('shared wander is mostly removed (> 50% drift cut)', cut > 50, status)
await bike.screenshot({ path: `${OUT}/g7-accuracy-sheet.png` })
await base.screenshot({ path: `${OUT}/g8-base-anchored.png` })
await bike.getByText('Done', { exact: true }).click()
await run(bike, 1)
check('header chip shows the measured cut', /BASE −\d+% DRIFT/.test(await text(bike, 'acc-chips')), await text(bike, 'acc-chips'))
await bike.screenshot({ path: `${OUT}/g9-parked-linked.png` })

// settings sheet renders
await bike.getByLabel('Settings').click()
await run(bike, 0.5)
await bike.screenshot({ path: `${OUT}/g10-setup.png`, fullPage: false })
check('bike setup lists both booms', (await bike.getByText('REAR BOOM').count()) === 1 && (await bike.getByText('FRONT BOOM — SHIELDED').count()) === 1)
await bike.getByText('Done', { exact: true }).click()
await run(bike, 0.5)

// --- optional: two separate browsers over the real Supabase Realtime channel -------------------
if (process.env.LIVE_LINK) {
  const ctxB = await browser.newContext({ viewport: { width: 412, height: 880 } })
  const far = await phone(ctxB, `${BASE}/?base=${code}`, new Date(await bike.evaluate(() => Date.now())))
  await run(bike, 3)
  await base.close() // only the far phone is a base now
  let linked = false
  await bike.bringToFront()
  for (let i = 0; i < 30 && !linked; i++) {
    await run(far, 2)
    await run(bike, 2)
    await new Promise((r) => setTimeout(r, 400)) // real network time for the socket
    linked = /online/.test(await far.locator('text=Link').locator('..').innerText().catch(() => ''))
  }
  check('LIVE: base joins the Supabase Realtime channel', linked)
  for (let i = 0; i < 20; i++) {
    await run(far, 2)
    await run(bike, 2)
    await new Promise((r) => setTimeout(r, 300))
  }
  check('LIVE: base in another browser hears the bike over the internet', (await text(far, 'rover-state')).includes('listening'))
  await bike.getByTestId('acc-chips').click()
  await run(bike, 0.5)
  check('LIVE: bike is being corrected by it', /Linked and correcting|Measured over/.test(await text(bike, 'base-status')), await text(bike, 'base-status'))
}

// --- trial work: pin the site, then the boom knows which plot it is over ------------------------
{
  const ctxT = await browser.newContext({ viewport: { width: 412, height: 880 }, deviceScaleFactor: 2 })
  const t = await phone(ctxT, BASE)
  await t.getByText('Sign in', { exact: true }).click()
  await run(t, 1)
  await t.getByText('Site details', { exact: true }).click()
  await run(t, 1)
  await t.getByText(/Re-mark the corners|Map the site — mark corner A/).first().click()
  await run(t, 8) // parked on corner A, averaging
  await t.getByText('Mark corner A', { exact: true }).click()
  await set(t, { e: 24, n: 0 }) // walk the front edge east
  await run(t, 45)
  await t.getByText('Mark corner B', { exact: true }).click()
  await run(t, 1)
  await t.getByText('Looks right — pin the grid', { exact: true }).click()
  await run(t, 1)
  await t.getByText('Done', { exact: true }).click()
  await run(t, 1)
  await t.getByText('Spray', { exact: true }).last().click()
  await run(t, 1)
  await t.getByText('Bike guidance', { exact: true }).click()
  // rows run south of an east-running front edge: drive south through the second column
  await set(t, { e: 3.2, n: 4, heading: 180, speed: 2 })
  await run(t, 8)
  const chip = await text(t, 'plot-chip')
  check('pinned trial: plot under the front of the bike is named with its treatment', /PLOT \d{3} · T\d+/.test(chip), chip)
  await t.getByLabel('Settings').click()
  await run(t, 0.3)
  const wrong = Number(chip.match(/T(\d+)/)[1]) === 1 ? '2' : '1'
  await t.locator('select').selectOption(wrong)
  await t.getByText('Done', { exact: true }).click()
  await set(t, { speed: 0 })
  await run(t, 2)
  check('wrong treatment in the tank → plot badge warns', new RegExp(`NOT T${wrong}`).test(await text(t, 'plot-chip')), await text(t, 'plot-chip'))
  await t.screenshot({ path: `${OUT}/g12-trial-plots.png` })
  await ctxT.close()
}

check('no page errors', errors.length === 0, errors.slice(0, 5))
console.log(passed, 'guidance drive checks passed')
await browser.close()
