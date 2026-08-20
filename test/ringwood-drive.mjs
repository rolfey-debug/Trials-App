import { chromium } from 'playwright'
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const page = await browser.newPage({ viewport: { width: 430, height: 920 }, deviceScaleFactor: 2 })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => m.type() === 'error' && !/net::|Failed to load resource/.test(m.text()) && errors.push(m.text()))
let passed = 0
const check = (n, c) => { if (!c) { console.error('FAIL', n); process.exitCode = 1 } else { console.log('ok', n); passed++ } }

await page.goto('http://localhost:4173')
await page.waitForTimeout(1200)
await page.getByText('Sign in', { exact: true }).click()
await page.waitForTimeout(500)

// Ringwood listed on home
check('home lists Ringwood trial', await page.locator('text=Ringwood (Corowa) — Wheat Fungicide').count() > 0)
// switch to it
await page.locator('text=Ringwood (Corowa) — Wheat Fungicide').first().click()
await page.waitForTimeout(400)
check('Ringwood active: 24 trts · 3 reps · 72 plots line', await page.locator('text=24 treatments · 3 reps · 72 plots · 2 × 12 m · 100 L/ha').count() === 1)
check('App A shows pending (not sprayed)', await page.locator('text=App A — Timing per site sheet').count() === 1)
check('App B line from doc', await page.locator('text=App B — Trts 2–21 only').count() === 1)
check('resume shows 0 of 72', await page.locator('text=Resume Assessment 1 — 0 of 72 done').count() === 1)
await page.screenshot({ path: 'shots-ringwood/1-home.png' })

// map
await page.locator('text=Map', { exact: false }).last().click()
await page.waitForTimeout(600)
await page.screenshot({ path: 'shots-ringwood/2-map.png' })
// bottom nav may label differently; verify cells by tapping known plot text later

// spray screen — mix checklist
const nav = async (label) => { await page.getByText(label, { exact: true }).last().click(); await page.waitForTimeout(500) }
await nav('Spray')
check('mix list shows T5 Radial Opti', await page.locator('text=Radial Opti (made up)').count() >= 1)
check('per-batch mLs derived (4.03 mL appears)', (await page.locator('text=/4\\.03/').count()) >= 1)
await page.screenshot({ path: 'shots-ringwood/3-spray.png' })

// assess
await nav('Assess')
check('assess opens on walk stop 101 · T1 Untreated', await page.locator('text=T1 · Untreated').count() >= 1)
check('walk order skips written-off 201 (next stop 301)', await page.locator('text=Save · 301 →').count() === 1)
check('rep chip derives from row blocking (REP 1)', await page.locator('text=REP 1').count() >= 1)
await page.screenshot({ path: 'shots-ringwood/4-assess.png' })

check('no page errors', errors.length === 0)
if (errors.length) console.error(errors.slice(0, 5))
console.log(passed, 'ringwood drive checks passed')
await browser.close()
