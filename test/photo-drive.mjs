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
await page.locator('text=Ringwood (Corowa) — Wheat Fungicide').first().click()
await page.waitForTimeout(400)

const nav = async (label) => { await page.getByText(label, { exact: true }).last().click(); await page.waitForTimeout(500) }
await nav('Assess')

// fabricate a camera shot in-page (green canvas JPEG) and feed it to the photo input
const b64 = await page.evaluate(() => {
  const c = document.createElement('canvas')
  c.width = 800; c.height = 600
  const x = c.getContext('2d')
  x.fillStyle = '#2d7a4f'; x.fillRect(0, 0, 800, 600)
  return c.toDataURL('image/jpeg', 0.9).split(',')[1]
})
await page.locator('input[type="file"]').first().setInputFiles({ name: 'shot.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(b64, 'base64') })
await page.waitForTimeout(900)
check('photo chip counts 1', await page.locator('text=Photo · 1').count() >= 1)

await nav('Today')
await page.getByText('Photos', { exact: true }).first().click()
await page.waitForTimeout(600)
check('tile shows plot 101', await page.locator('text=101 · T1').count() >= 1)
const btn = page.locator('text=⬇').first()
check('save button renders', await btn.count() === 1)

const dl = page.waitForEvent('download', { timeout: 8000 })
await btn.click()
const download = await dl
check('download fires with plot filename', /^plot-101-/.test(download.suggestedFilename()))
const path = await download.path()
const { statSync, readFileSync } = await import('node:fs')
const buf = readFileSync(path)
check('file is a JPEG with content', buf[0] === 0xff && buf[1] === 0xd8 && statSync(path).size > 5000)

check('no page errors', errors.length === 0)
if (errors.length) console.error(errors.slice(0, 5))
console.log(passed, 'photo drive checks passed')
await browser.close()
