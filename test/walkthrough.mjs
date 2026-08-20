/* Full app walkthrough: drives every screen, exercises key flows, screenshots. */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const BASE = 'http://localhost:4173'
const OUT = process.env.SHOT_DIR || './shots'
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const page = await browser.newPage({ viewport: { width: 430, height: 920 }, deviceScaleFactor: 2 })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
// resource-load failures (font CDN offline etc.) aren't app errors — the PWA
// falls back to Arial per the brand guidelines
page.on('console', (m) => m.type() === 'error' && !/net::|Failed to load resource/.test(m.text()) && errors.push(m.text()))

const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png` })
const tapText = async (text, exact = false) => {
  await page.getByText(text, { exact }).first().click()
  await page.waitForTimeout(250)
}

await page.goto(BASE)
await page.waitForTimeout(1200)

// 1. Login
await shot('01-login')
await page.getByText('Sign in', { exact: true }).click()
await page.waitForTimeout(400)

// 2. Today / Home
await shot('02-today')

// 3. Assess flow
await tapText('Resume Assessment 1')
await shot('03-assess')
// key in a score: 1, 5 on the pad
await page.getByText('1', { exact: true }).last().click()
await page.getByText('5', { exact: true }).last().click()
await page.waitForTimeout(150)
// switch measure via last pad key, then Same as last, then Save
await tapText('Same as last')
await shot('03b-assess-entered')
await page.getByText(/^Save · /).click()
await page.waitForTimeout(250)
// measure picker
await tapText('Edit list')
await shot('03c-measure-picker')
await tapText('Powdery mildew')
await tapText('Done — back to scoring')
// blind toggle
await tapText('Blind · off')
await shot('03d-assess-blind')
await tapText('Blind · ON')

// 4. Map
await tapText('Map', true)
await shot('04-map')
await page.getByText('5', { exact: true }).nth(2).click().catch(() => {})
await page.waitForTimeout(300)
await shot('04b-map-sheet')

// 5. Spray day
await tapText('Walk', true) // move off map first
await tapText('Spray', true)
await shot('05-spray-mix')
await tapText('Order', true)
await shot('05b-spray-order')
await tapText('Record', true)
await shot('05c-spray-record')
await page.getByText(/Issues/).click()
await page.waitForTimeout(250)
await shot('06-issues')
// resolve the wrong-bottle issue via relabel
await tapText('Relabel 505 as T20 — as applied')
await shot('06b-issue-fixed')

// 7. Add a trial — parse the real fixture PDF through the browser
await tapText('Today', true)
await tapText('＋ Add a trial')
await shot('07-add')
const chooser = page.waitForEvent('filechooser')
await tapText('Spray map PDF')
await (await chooser).setFiles('fixtures/Matong_Wheat_Spray_Map.pdf')
await page.waitForTimeout(1600)
await shot('07b-add-parsed')
await tapText('Looks right — create trial')
await page.waitForTimeout(300)
await shot('07c-add-success')

// 8. Site setup (GPS corner mapping — demo corners without live GPS)
await tapText('Next: map the site with GPS →')
await shot('08-setup')
await tapText('Mark corner A')
await shot('08b-setup-b')
await tapText('Mark corner B')
await shot('08c-setup-review')
await tapText('Looks right — pin the grid')
await shot('08d-setup-done')
await tapText('Done', true)

// back onto the Matong trial (the parsed one became active; switch back)
await page.getByText('Matong — Wheat Fungicide').first().click().catch(() => {})
await page.waitForTimeout(300)

// 9. Site details
await tapText('Site details')
await shot('09-site')
await tapText('＋ Add application')
await shot('09b-site-fert')

// 10. Photos
await tapText('‹ Today')
await tapText('Photos', true)
await shot('10-photos')
await page.getByText(/^Flagged · /).click()
await page.waitForTimeout(200)
await shot('10b-photos-flagged')

// 11. Storage & sync
await tapText('‹ Today')
await page.getByText(/waiting for signal|queue clear/).click()
await page.waitForTimeout(300)
await shot('11-storage')
await page.getByText('Sync now').click().catch(() => {})
await page.waitForTimeout(300)
await shot('11b-storage-synced')

// 12. Team
await tapText('‹ Today')
await tapText('Team', true)
await shot('12-team')
await page.locator('input[type=email]').fill('s.byrne@bayer.com')
await tapText('Send invite link')
await shot('12b-team-invite')

// 13. Reports
await tapText('‹ Today')
await tapText('Reports', true)
await shot('13-reports')

// 14. Walk
await tapText('‹ Today')
await tapText('Walk', true)
await shot('14-walk')
await tapText('Next plot →')
await tapText('Next plot →')
await shot('14b-walk-next')

await browser.close()
if (errors.length) {
  console.error('PAGE ERRORS:\n' + errors.join('\n'))
  process.exit(1)
}
console.log('walkthrough complete, no page errors')
