// node tools/report/pdf.mjs in.html out.pdf [--footer "text"] [--sheet]
import { chromium } from 'playwright'
const [html, pdf, ...rest] = process.argv.slice(2)
const sheet = rest.includes('--sheet')
const fi = rest.indexOf('--footer'); const footer = fi >= 0 ? rest[fi + 1] : ''
const b = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
const p = await b.newPage()
await p.goto(`file://${html.startsWith('/') ? html : process.cwd() + '/' + html}`, { waitUntil: 'load' })
await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(500)
if (sheet) await p.pdf({ path: pdf, format: 'A4', printBackground: true, margin: { top: '0', bottom: '0', left: '0', right: '0' } })
else await p.pdf({ path: pdf, format: 'A4', printBackground: true, margin: { top: '14mm', bottom: '16mm', left: '14mm', right: '14mm' }, displayHeaderFooter: true, headerTemplate: '<div></div>', footerTemplate: `<div style="width:100%;font-family:Arial,sans-serif;font-size:8px;color:#58585B;padding:0 14mm;display:flex;justify-content:space-between"><span>${footer}</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>` })
await b.close(); console.log('wrote', pdf)
