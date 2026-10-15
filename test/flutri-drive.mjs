import { chromium } from 'playwright'
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const page = await browser.newPage({ viewport: { width: 430, height: 920 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
let passed = 0
const check = (n, c) => { if (!c) { console.error('FAIL', n); process.exitCode = 1 } else { console.log('ok', n); passed++ } }

await page.goto('http://localhost:4173')
await page.waitForTimeout(1200)
await page.getByText('Sign in', { exact: true }).click()
await page.waitForTimeout(500)

check('home lists flutriafol block', await page.locator('text=Ringwood — Flutriafol Breakdown Block').count() > 0)
await page.locator('text=Ringwood — Flutriafol Breakdown Block').first().click()
await page.waitForTimeout(400)

const nav = async (label) => { await page.getByText(label, { exact: true }).last().click(); await page.waitForTimeout(500) }
await nav('Assess')
check('first stop is 0 ml/ha', await page.locator('text=Flutriafol 0 ml/ha').count() >= 1)
check('walk pairs varieties: next stop 201', await page.locator('text=Save · 201 →').count() === 1)

// simulate an existing install that predates the block: remove it from the
// persisted doc, reload, and expect upgrade() to inject it back
await page.evaluate(async () => {
  const db = await new Promise((res, rej) => {
    const r = indexedDB.open('agnvet-trialwork')
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
  const st = await new Promise((res, rej) => {
    const t = db.transaction('state', 'readonly').objectStore('state').get('app')
    t.onsuccess = () => res(t.result)
    t.onerror = () => rej(t.error)
  })
  delete st.trials['ringwood-flutriafol-breakdown-2026']
  delete st.trialState['ringwood-flutriafol-breakdown-2026']
  st.activeTrialId = 'matong-wheat-fungicide-2026'
  st.screen = 'home'
  await new Promise((res, rej) => {
    const t = db.transaction('state', 'readwrite').objectStore('state').put(st, 'app')
    t.onsuccess = () => res()
    t.onerror = () => rej(t.error)
  })
  db.close()
})
await page.reload()
await page.waitForTimeout(1500)
check('upgrade() re-injects the block on an old install', await page.locator('text=Ringwood — Flutriafol Breakdown Block').count() > 0)

check('no page errors', errors.length === 0)
if (errors.length) console.error(errors.slice(0, 5))
console.log(passed, 'flutriafol drive checks passed')
await browser.close()
