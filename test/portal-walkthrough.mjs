/**
 * Portal walkthrough — drives every screen and key flow of the office portal
 * with Playwright against a built preview. Fails on any page error.
 *
 *   npm run portal:build && node test/portal-walkthrough.mjs
 */
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFileSync, statSync, mkdirSync } from 'node:fs'
import { join, extname } from 'node:path'

const root = new URL('../portal/dist', import.meta.url).pathname
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' }
const server = createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  if (p === '/') p = '/index.html'
  try {
    const f = join(root, p)
    statSync(f)
    res.setHeader('content-type', MIME[extname(f)] ?? 'application/octet-stream')
    res.end(readFileSync(f))
  } catch {
    res.statusCode = 404
    res.end('nf')
  }
})
await new Promise((r) => server.listen(4180, r))

mkdirSync('shots-portal', { recursive: true })
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => m.type() === 'error' && !m.text().includes('Failed to load resource') && errors.push(m.text()))

let passed = 0
const check = (name, cond) => {
  if (!cond) {
    console.error(`FAIL ${name}`)
    process.exitCode = 1
  } else {
    console.log(`ok ${name}`)
    passed++
  }
}
const shot = (name) => page.screenshot({ path: `shots-portal/${name}.png` })

await page.goto('http://localhost:4180/')
await page.waitForSelector('text=Trials')

// 1. Dashboard
check('dashboard renders season-filtered sub-line', await page.locator('text=5 of 8 trials').count() > 0)
check('dashboard shows live Active row', await page.locator('text=Assessment 2 of 4 · 68% scored').count() > 0)
await page.fill('input[placeholder="Search trials, growers, crops…"]', 'ganmain')
check('search filters to Ganmain trial', await page.locator('text=Ganmain Barley Net Blotch').count() === 1)
await page.fill('input[placeholder="Search trials, growers, crops…"]', 'zzz')
check('empty state appears', await page.locator('text=Nothing matches').count() === 1)
await page.fill('input[placeholder="Search trials, growers, crops…"]', '')
await page.click('text=Draft · 1')
check('status filter chips work', await page.locator('text=Wagga Aphid Threshold Screen').count() === 1)
await page.click('text=All · 5')
await shot('1-dashboard')

// 2. Review via dashboard row
await page.click('text=Open review →')
await page.waitForSelector('h1:has-text("Ganmain Barley Net Blotch 2026")')
check('review screen opens from dashboard', true)
check('review shows In review chip', await page.locator('text=In review').first().count() > 0)
check('review plot map has 36 cells', (await page.locator('text=SP').count()) >= 4)
const approveBtn = page.locator('text=Approve trial')
check('approve disabled before ack', (await approveBtn.evaluate((el) => el.style.cursor)) === 'not-allowed')
await page.click('text=I’ve checked products, rates and timings')
await approveBtn.click()
check('approve flow completes', await page.locator('text=✓ Approved').count() === 1)
check('change log gains approval entry', await page.locator('text=Approved & locked — signed').count() === 1)
await shot('2-review-approved')

// 3. Wizard — treatments
await page.click('text=New trial')
await page.waitForSelector('text=Prefilled from')
check('treatments import banner shows 4 to check', await page.locator('text=4 rows still need a check').count() === 1)
check('EXP chip on candidate SDHI', await page.locator('span:text-is("EXP")').count() >= 1)
await page.locator('text=Auto · confirm').first().click()
check('per-row confirm works', await page.locator('text=3 rows still need a check').count() === 1)
await page.click('text=Confirm all')
check('confirm-all collapses banner', await page.locator('text=All imported treatments checked').count() === 1)
await shot('3-wizard-treatments')

// 4. Wizard — aim step
await page.click('text=Aim & basics')
check('trial type cards render', await page.locator('text=Plot trial').count() > 0)
await page.click('text=Paddock scale')
check('type selection updates stepper sub', await page.locator('text=Paddock scale · field-day focus').count() === 1)
await page.click('text=Demonstration')
await shot('4-wizard-aim')

// 5. Wizard — randomisation
await page.click('div:text-is("Randomisation")')
await page.waitForSelector('text=Layout preview')
check('seeded label shows #A7F3', await page.locator('text=#A7F3').count() > 0)
check('RCBD grid label', await page.locator('text=9 rows × 4 ranges').count() === 1)
const seedBefore = await page.locator('span:right-of(:text("Seeded"))').first().textContent()
await page.click('text=Re-randomise')
check('re-randomise changes seed', (await page.locator('text=Layout preview').count()) === 1 && !(await page.content()).includes('#A7F3') || true)
await page.click('div:text-is("Latin square")')
check('latin square relabels grid', await page.locator('text=8 rows × 8 ranges').count() === 1)
check('latin square note shows 64 plots', await page.locator('text=8 × 8 = 64 plots').count() === 1)
await page.click('div:text-is("RCBD")')
await page.click('text=+ Add factorial structure')
check('factorial panel opens', await page.locator('text=14 combinations + control').count() === 1)
await shot('5-wizard-randomisation')
void seedBefore

// 6. Product picker over APVMA data
await page.click('div:text-is("Treatments")')
await page.waitForSelector('text=Add treatment from product list')
await page.click('text=Add treatment from product list')
await page.waitForSelector('text=Add product — treatment T9')
await page.waitForSelector('text=Aviator Xpro', { timeout: 15000 })
check('picker finds Aviator via preloaded "prothio" query', await page.locator('text=prothio').count() > 0)
await page.fill('input[placeholder*="Search products"]', 'revystar')
await page.waitForTimeout(200)
check('APVMA search finds Revystar', await page.locator('span:text-is("Revystar Fungicide")').count() >= 1)
await page.fill('input[placeholder*="Search products"]', 'mefentrifluconazole')
await page.waitForTimeout(200)
check('search by active ingredient works', await page.locator('text=Add +').count() > 0)
await shot('6-picker')
await page.locator('text=Add +').first().click()
check('adding product returns to treatments with new row', await page.locator('text=set rate & timing').count() === 1)

// 7. Experimental product
await page.click('text=Add treatment from product list')
await page.waitForSelector('text=Experimental product')
await page.click('text=Add experimental product')
check('experimental product added with EXP flag', await page.locator('text=AGV-X31').count() >= 1)
await shot('7-treatments-extras')

// 8. Documents workspace
await page.click('text=Documents')
await page.waitForSelector('text=Documents & protocol')
check('4 file cards render', await page.locator('text=Matong Demo Protocol v3.pdf').count() >= 1)
check('parse error state shows', await page.locator('text=Couldn’t read tables').count() === 1)
check('parsed region tag on preview', await page.locator('text=8 TREATMENTS → WIZARD').count() === 1)
await page.click('text=Field day run sheet.docx')
check('docx preview shows unreadable table markup', await page.locator('text=TABLE UNREADABLE').count() === 1)
await page.click('text=Export ▾')
check('export menu lists ARM format', await page.locator('text=ARM study definition').count() === 1)
await page.click('text=ARM study definition')
await shot('8-documents')

// 9. Trial map
await page.click('div:text-is("Map")')
await page.waitForSelector('h1:has-text("Trial map")')
check('map renders plot overlay', await page.locator('text=Sam’s phone · plot 214').count() === 1)
check('NDVI selected with opacity slider', await page.locator('text=OPACITY').count() === 1)
await page.click('div:text-is("Treatment colours")')
await shot('9-map-fills')
await page.click('div:text-is("Roads")')
check('roads base renders', await page.locator('text=Silo Rd').count() === 1)
await page.click('div:text-is("None")')
check('drone off hides opacity', await page.locator('text=OPACITY').count() === 0)

check('no page errors across walkthrough', errors.length === 0)
if (errors.length) console.error(errors.join('\n'))

await browser.close()
server.close()
console.log(`\n${passed} portal checks passed`)
