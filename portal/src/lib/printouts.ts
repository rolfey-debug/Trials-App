/** Office printouts from the trial record: trial plan, spray and mixing plan,
 * plot and site signs, and blank assessment sheets. Pure HTML builders (so the
 * maths is testable in test/printouts.test.ts) plus a print-window opener;
 * the browser's print dialog gives the PDF. Same approach as the field app's
 * client report. */
import { cellColors } from './layout'
import type { AssessmentRow, LiveTrial, MeasureDef, TreatmentLine, TreatmentRow } from './db'

export const esc = (v: string | number | null | undefined): string => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const fmt = (n: number, d = 1) => (Number.isFinite(n) ? n.toLocaleString('en-AU', { maximumFractionDigits: d }) : '—')
const today = () => new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })

const BASE_CSS = `
  * { box-sizing: border-box; }
  body { font-family: 'Mulish', Arial, sans-serif; color: #141414; margin: 0; padding: 28px 36px; font-size: 12px; }
  h1 { font-size: 24px; letter-spacing: -0.3px; margin: 0 0 2px; }
  h2 { font-size: 14px; margin: 22px 0 7px; color: #00512F; }
  h3 { font-size: 12.5px; margin: 14px 0 5px; }
  p { margin: 0 0 6px; line-height: 1.45; }
  .green { color: #007749; }
  .grey { color: #58585B; }
  .muted { color: #8A8C8A; }
  .mono { font-family: 'IBM Plex Mono', ui-monospace, monospace; }
  .eyebrow { font: 600 9.5px 'IBM Plex Mono', monospace; color: #8A8C8A; letter-spacing: .1em; text-transform: uppercase; }
  table { border-collapse: collapse; width: 100%; font-size: 10.5px; }
  th, td { border: 1px solid #D8DAD8; padding: 3px 6px; text-align: left; vertical-align: top; }
  th { background: #F4F5F4; font-weight: 700; }
  td.num, th.num { text-align: right; font-family: 'IBM Plex Mono', monospace; }
  .kv { display: grid; grid-template-columns: 130px 1fr; gap: 2px 10px; font-size: 11.5px; }
  .kv b { color: #58585B; font-weight: 600; }
  .page { page-break-after: always; }
  .grid { display: grid; gap: 3px; }
  .cell { height: 34px; border-radius: 4px; display: flex; flex-direction: column; align-items: center; justify-content: center; line-height: 1.05; font-size: 10px; }
  .cell b { font-size: 11.5px; }
  .tick { width: 22px; height: 16px; border: 1.5px solid #B9BBB9; border-radius: 3px; display: inline-block; }
  .exp { color: #cf4520; border: 1px solid #cf4520; border-radius: 3px; padding: 0 4px; font-weight: 800; font-size: 9px; letter-spacing: .08em; }
  .foot { position: fixed; bottom: 8mm; left: 36px; right: 36px; font-size: 9px; color: #8A8C8A; display: flex; justify-content: space-between; }
  @media print { body { padding: 14mm 14mm 18mm; } .page { page-break-after: always; } }
`

export function printHtml(title: string, body: string, extraCss = ''): HTMLIFrameElement | null {
  const html = documentHtml(title, body, extraCss)
  const w = window.open('', '_blank')
  if (!w) return null
  w.document.write(html)
  w.document.close()
  setTimeout(() => w.print(), 500)
  return null
}

/** A full document: fonts resolve against the portal, not about:blank. */
export function documentHtml(title: string, body: string, extraCss = ''): string {
  const fontsHref = typeof document !== 'undefined' ? new URL('fonts/fonts.css', document.baseURI).href : 'fonts/fonts.css'
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><link rel="stylesheet" href="${esc(fontsHref)}"><style>${BASE_CSS}${extraCss}</style></head><body>${body}</body></html>`
}

// --- Treatment lines ---------------------------------------------------------

const RATE_RE = /^(.*?)\s+(\d+(?:\.\d+)?)\s*(mL|ml|L|l|g|kg)\s*\/\s*ha\b(.*)$/

/** Every product line of a treatment with its timing. Builder trials carry
 * `lines`; workbook imports carry per-timing arrays or a recipe string, which
 * is parsed for "product 500 mL/ha" patterns. */
export function treatmentLines(t: TreatmentRow): TreatmentLine[] {
  const c = t.components ?? {}
  if (Array.isArray(c.lines) && c.lines.length) return c.lines
  const out: TreatmentLine[] = []
  for (const tm of ['A', 'B', 'C', 'D']) {
    const arr = c[tm]
    if (Array.isArray(arr)) {
      for (const x of arr as Array<{ product?: string; rate?: number | null; unit?: string; exp?: boolean }>) {
        if (!x?.product) continue
        out.push({ timing: tm, product: x.product, rate: x.rate ?? null, unit: normaliseUnit(x.unit ?? ''), exp: x.exp })
      }
    }
  }
  if (out.length) return out
  const str = (k: string) => (typeof c[k] === 'string' ? (c[k] as string) : null)
  for (const [tm, s] of [['A', str('aTiming')], ['B', str('bTiming')]] as Array<[string, string | null]>) {
    if (!s) continue
    for (const part of s.split(/\s*\+\s*/)) {
      const m = RATE_RE.exec(part.trim())
      if (m) out.push({ timing: tm, product: m[1].trim(), rate: Number(m[2]), unit: normaliseUnit(`${m[3]}/ha`) })
      else out.push({ timing: tm, product: part.trim(), rate: null, unit: '' })
    }
  }
  if (out.length) return out
  if (t.recipe && !/untreated|water only|^nil/i.test(t.recipe)) {
    for (const seg of t.recipe.split(/\s*·\s*/)) {
      const m2 = /^([A-D]):\s*(.*)$/.exec(seg)
      const tm = m2 ? m2[1] : 'A'
      for (const part of (m2 ? m2[2] : seg).split(/\s*\+\s*/)) {
        const m = RATE_RE.exec(part.trim())
        if (m) out.push({ timing: tm, product: m[1].trim(), rate: Number(m[2]), unit: normaliseUnit(`${m[3]}/ha`) })
        else if (part.trim()) out.push({ timing: tm, product: part.trim(), rate: null, unit: '' })
      }
    }
  }
  return out
}

export function normaliseUnit(u: string): string {
  const k = u.trim().toLowerCase().replace(/\s+/g, '')
  if (k === 'ml/ha') return 'mL/ha'
  if (k === 'l/ha') return 'L/ha'
  if (k === 'g/ha') return 'g/ha'
  if (k === 'kg/ha') return 'kg/ha'
  if (k === '%v/v' || k === '%') return '% v/v'
  if (k === 'ml/100l') return 'mL/100 L'
  if (k === 'g/100l') return 'g/100 L'
  return u.trim()
}

export const timingsOf = (trts: TreatmentRow[]): string[] => [...new Set(trts.flatMap((t) => treatmentLines(t).map((l) => l.timing)))].sort()

// --- Spray and mixing maths --------------------------------------------------

export interface MixInput {
  waterRateLPerHa: number
  plotAreaM2: number
  plots: number
  /** Extra mixed beyond the plots, as a fraction (0.3 = 30 %). */
  overage: number
}

export interface MixResult {
  perPlotMl: number
  batchL: number
  batchHa: number
}

export function batchFor(i: MixInput): MixResult {
  const perPlotMl = (i.waterRateLPerHa * i.plotAreaM2) / 10
  const batchHa = (i.plotAreaM2 * i.plots * (1 + i.overage)) / 10000
  return { perPlotMl, batchHa, batchL: Math.round(perPlotMl * i.plots * (1 + i.overage)) / 1000 }
}

/** Product in the batch for one line, in a sensible unit. */
export function productInBatch(l: TreatmentLine, b: MixResult): { amount: number; unit: string } | null {
  if (l.rate == null) return null
  switch (normaliseUnit(l.unit)) {
    case 'mL/ha':
      return { amount: l.rate * b.batchHa, unit: 'mL' }
    case 'L/ha':
      return { amount: l.rate * b.batchHa * 1000, unit: 'mL' }
    case 'g/ha':
      return { amount: l.rate * b.batchHa, unit: 'g' }
    case 'kg/ha':
      return { amount: l.rate * b.batchHa * 1000, unit: 'g' }
    case '% v/v':
      return { amount: (l.rate / 100) * b.batchL * 1000, unit: 'mL' }
    case 'mL/100 L':
      return { amount: (l.rate * b.batchL) / 100, unit: 'mL' }
    case 'g/100 L':
      return { amount: (l.rate * b.batchL) / 100, unit: 'g' }
    default:
      return null
  }
}

const amt = (x: { amount: number; unit: string } | null) => (x ? `${fmt(x.amount, x.amount < 10 ? 2 : 1)} ${x.unit}` : 'as per recipe')

// --- Shared pieces -----------------------------------------------------------

function header(trial: LiveTrial, kind: string): string {
  const logo = typeof document !== 'undefined' ? new URL('assets/agnvet-logo.png', document.baseURI).href : ''
  return `<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px">
    <div><div class="eyebrow">${esc(kind)}</div><h1>${esc(trial.name)}</h1>
    <div class="grey">${esc([trial.season ? `Season ${trial.season}` : null, trial.trial_type, [trial.crop, trial.variety].filter(Boolean).join(' '), trial.site ? [trial.site.property, trial.site.town].filter(Boolean).join(', ') : null].filter(Boolean).join(' · '))}</div></div>
    ${logo ? `<img src="${esc(logo)}" alt="AGnVET" style="height:30px">` : ''}
  </div>`
}

const footer = (trial: LiveTrial, extra = '') => `<div class="foot"><span>${esc(trial.name)} · AGnVET Trial Work · printed ${today()}</span><span>${esc(extra)}</span></div>`

function recipeByTiming(lines: TreatmentLine[], t: TreatmentRow): string {
  if (!lines.length) return esc(t.recipe || 'Untreated')
  const by = new Map<string, string[]>()
  for (const l of lines) (by.get(l.timing) ?? by.set(l.timing, []).get(l.timing)!).push(`${esc(l.product)}${l.rate != null ? ` ${fmt(l.rate, 2)} ${esc(l.unit)}` : ''}${l.exp ? ' <span class="exp">EXP</span>' : ''}`)
  return [...by.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([tm, ps]) => `<b>${tm}:</b> ${ps.join(' + ')}`).join('<br>')
}

export interface PlanData {
  trial: LiveTrial
  treatments: TreatmentRow[]
  assessments: AssessmentRow[]
  measures: Map<string, MeasureDef>
}

function gridHtml(trial: LiveTrial, trts: TreatmentRow[], small = false): string {
  const trtOf = new Map<number, number>()
  for (const t of trts) for (const p of t.components?.plots ?? []) trtOf.set(p, t.n)
  const plots = [...trtOf.keys()]
  if (!plots.length) return '<p class="muted">No plot allocation on the record yet.</p>'
  const rows = trial.design?.grid?.rows ?? Math.max(...plots.map((p) => Math.floor(p / 100)))
  const positions = trial.design?.grid?.positions ?? Math.max(...plots.map((p) => p % 100))
  const reserve = new Set((trial.design as { reservePlots?: number[] } | null)?.reservePlots ?? [])
  const marginal = new Set((trial.design as { marginalPlots?: number[] } | null)?.marginalPlots ?? [])
  const spare = new Set((trial.design as { sparePlots?: number[] } | null)?.sparePlots ?? [])
  const cells: string[] = []
  for (let r = 1; r <= rows; r++) {
    for (let p = 1; p <= positions; p++) {
      const pid = r * 100 + p
      const t = trtOf.get(pid)
      const cc = cellColors(t ?? 0)
      const tag = t ? `T${t}` : reserve.has(pid) ? 'RES' : spare.has(pid) ? 'SP' : '·'
      cells.push(`<div class="cell" style="background:${cc.bg};color:${cc.fg};border:${cc.border}${marginal.has(pid) ? ';outline:2px dashed #cf4520;outline-offset:-2px' : ''}"><span class="mono" style="opacity:.75">${pid}</span><b>${tag}</b></div>`)
    }
  }
  return `<div class="grid" style="grid-template-columns:repeat(${positions},1fr);max-width:${Math.min(positions * (small ? 54 : 70), 720)}px">${cells.join('')}</div>
  <p class="muted" style="margin-top:6px">Rows run down the page (row 1 at the top), positions across. Plot = row × 100 + position${marginal.size ? '; dashed = marginal' : ''}${reserve.size ? '; RES = reserve' : ''}.</p>`
}

// --- 1. Trial plan -----------------------------------------------------------

export function trialPlanHtml(d: PlanData): string {
  const { trial, treatments, assessments, measures } = d
  const design = trial.design ?? {}
  const timings = timingsOf(treatments)
  const kv: Array<[string, string | null | undefined]> = [
    ['Client', trial.client?.name],
    ['Site', trial.site ? [trial.site.property, trial.site.town].filter(Boolean).join(', ') : null],
    ['Crop', [trial.crop, trial.variety].filter(Boolean).join(' · ')],
    ['Sown', trial.sown_date],
    ['Design', [design.type, design.reps ? `${design.reps} reps` : null, design.grid ? `${design.grid.rows} × ${design.grid.positions} plots` : null, design.plot ? `${design.plot.widthM} × ${design.plot.lengthM} m (${design.plot.areaM2} m²)` : null].filter(Boolean).join(' · ')],
    ['Status', trial.status],
    ['Timings', timings.length ? timings.map((tm) => `${tm}${trial.spraying?.timings?.[tm]?.due ? ` (${trial.spraying.timings[tm].due})` : ''}`).join(', ') : null],
  ]
  const trtRows = treatments
    .map((t) => {
      const lines = treatmentLines(t)
      return `<tr><td class="mono"><b>T${t.n}</b></td><td><b>${esc(t.name)}</b></td><td>${recipeByTiming(lines, t)}</td><td class="mono">${(t.components?.plots ?? []).join(' ')}</td></tr>`
    })
    .join('')
  const assessRows = assessments
    .map((a) => {
      const ms = a.measures.map((k) => {
        const m = measures.get(k)
        return m ? `${esc(m.label)}${m.target ? ` <span class="mono muted">${esc(m.target)}</span>` : ''}` : esc(k)
      })
      return `<tr><td class="mono">A${a.n}</td><td>${esc(a.timing ?? '')}${a.blind ? ' <span class="muted">(blind)</span>' : ''}</td><td>${ms.join(', ')}</td></tr>`
    })
    .join('')
  const notes = design.notes ?? []
  return `${header(trial, 'Trial plan')}
  ${trial.aim ? `<p style="font-size:13px;font-style:italic;margin-bottom:10px">${esc(trial.aim)}</p>` : ''}
  <div class="kv">${kv.filter(([, v]) => v).map(([k, v]) => `<b>${k}</b><span>${esc(v)}</span>`).join('')}</div>
  <h2>Treatments</h2>
  <table><thead><tr><th>#</th><th>Treatment</th><th>Products and rates by timing</th><th>Plots</th></tr></thead><tbody>${trtRows}</tbody></table>
  <h2>Plot plan</h2>
  ${gridHtml(trial, treatments)}
  <h2>Assessments</h2>
  ${assessments.length ? `<table><thead><tr><th>#</th><th>Timing</th><th>Measures (EPPO target code where it applies)</th></tr></thead><tbody>${assessRows}</tbody></table>` : '<p class="muted">No assessment plan on the record.</p>'}
  ${notes.length ? `<h2>Notes</h2><ul style="margin:0;padding-left:18px">${notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
  ${footer(trial, 'Trial plan')}`
}

// --- 2. Spray and mixing plan ------------------------------------------------

export interface SprayOpts {
  timing: string
  waterRateLPerHa: number
  overage: number
}

export function sprayPlanHtml(d: PlanData, o: SprayOpts): string {
  const { trial, treatments } = d
  const area = trial.design?.plot?.areaM2 ?? 24
  const sprayed = treatments.filter((t) => treatmentLines(t).some((l) => l.timing === o.timing))
  const unsprayed = treatments.filter((t) => !sprayed.includes(t))
  const rows = sprayed
    .map((t) => {
      const lines = treatmentLines(t).filter((l) => l.timing === o.timing)
      const plots = t.components?.plots ?? []
      const b = batchFor({ waterRateLPerHa: o.waterRateLPerHa, plotAreaM2: area, plots: plots.length, overage: o.overage })
      return `<tr>
        <td class="mono"><b>T${t.n}</b></td>
        <td><b>${esc(t.name)}</b><br><span class="mono muted">${plots.join(' ')}</span></td>
        <td>${lines.map((l) => `${esc(l.product)}${l.exp ? ' <span class="exp">EXP</span>' : ''}<br><span class="muted">${l.rate != null ? `${fmt(l.rate, 2)} ${esc(l.unit)}` : 'rate per recipe'}</span>`).join('<br>')}</td>
        <td class="num">${lines.map((l) => `<b>${amt(productInBatch(l, b))}</b>`).join('<br><br>')}</td>
        <td class="num">${plots.length}</td>
        <td class="num">${fmt(b.batchL, 2)} L</td>
        <td><span class="tick"></span></td><td><span class="tick"></span></td>
      </tr>`
    })
    .join('')
  const perPlot = batchFor({ waterRateLPerHa: o.waterRateLPerHa, plotAreaM2: area, plots: 1, overage: 0 }).perPlotMl
  const order = sprayed.flatMap((t) => (t.components?.plots ?? []).map((p) => ({ p, t: t.n }))).sort((a, b) => a.p - b.p)
  return `${header(trial, `Spray and mixing plan · timing ${o.timing}`)}
  <div class="kv">
    <b>Due</b><span>${esc(trial.spraying?.timings?.[o.timing]?.due ?? '—')}</span>
    <b>Water rate</b><span>${fmt(o.waterRateLPerHa, 0)} L/ha · ${fmt(perPlot, 0)} mL per ${area} m² plot</span>
    <b>Batches</b><span>one per treatment, ${Math.round(o.overage * 100)}% over the plots sprayed (rinse, priming, overlap)</span>
    <b>Order</b><span>Water first, then products in the order listed, adjuvant last. Agitate between plots. Triple rinse between treatments.</span>
  </div>
  <h2>Mixing</h2>
  <table><thead><tr><th>#</th><th>Treatment · plots</th><th>Product · rate</th><th class="num">In the batch</th><th class="num">Plots</th><th class="num">Batch</th><th>Mixed</th><th>Sprayed</th></tr></thead><tbody>${rows}</tbody></table>
  ${unsprayed.length ? `<p class="muted" style="margin-top:6px">Not sprayed at ${esc(o.timing)}: ${unsprayed.map((t) => `T${t.n} ${esc(t.name)}`).join(', ')}.</p>` : ''}
  <h2>Spraying order</h2>
  <p class="mono" style="font-size:11px;line-height:1.7">${order.map((x) => `${x.p}<span class="muted">·T${x.t}</span>`).join(' &nbsp; ')}</p>
  <h2>Application record</h2>
  <table><thead><tr><th>Date</th><th>Start</th><th>Finish</th><th>Operator</th><th>Boom / nozzles</th><th>Pressure</th><th>Temp °C</th><th>RH %</th><th>Wind km/h · dir</th><th>Cloud</th><th>Soil / crop</th></tr></thead>
  <tbody><tr>${'<td style="height:30px"></td>'.repeat(11)}</tr><tr>${'<td style="height:30px"></td>'.repeat(11)}</tr></tbody></table>
  <p class="muted" style="margin-top:6px">Deviations (plot reassigned, wrong bottle, missed plot) go on the phone as issues so the record carries the correction and the reason.</p>
  ${footer(trial, `Spray plan ${o.timing}`)}`
}

// --- 3. Signs ----------------------------------------------------------------

export interface SignOpts {
  /** 'a6' = 4 per A4 (stake signs), 'a5' = 2 per A4. */
  size: 'a6' | 'a5'
  /** Rep 1 only (field-day row), or every plot. */
  repOneOnly: boolean
  blind: boolean
}

const SIGN_CSS = `
  body { padding: 0; }
  .sheet { display: grid; page-break-after: always; padding: 8mm; gap: 6mm; height: 297mm; width: 210mm; }
  .a6 { grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; }
  .a5 { grid-template-columns: 1fr; grid-template-rows: 1fr 1fr; }
  .sign { border: 1.5px solid #141414; border-radius: 6px; padding: 6mm 7mm; display: flex; flex-direction: column; position: relative; overflow: hidden; }
  .sign .trial { font-size: 11px; color: #58585B; }
  .sign .plot { font: 700 54px 'IBM Plex Mono', monospace; color: #007749; line-height: 1; margin: 4px 0 2px; }
  .a5 .sign .plot { font-size: 84px; }
  .sign .t { font-size: 13px; font-weight: 800; color: #58585B; }
  .sign .name { font-size: 22px; font-weight: 800; line-height: 1.1; margin: 6px 0 4px; }
  .a5 .sign .name { font-size: 30px; }
  .sign .recipe { font-size: 12px; color: #3E403E; line-height: 1.4; }
  .a5 .sign .recipe { font-size: 15px; }
  .sign .exp { position: absolute; top: 6mm; right: 7mm; font-size: 10px; letter-spacing: .04em; padding: 2px 5px; white-space: nowrap; }
  .sign .foot { position: absolute; bottom: 5mm; left: 7mm; right: 7mm; font-size: 9.5px; color: #8A8C8A; display: flex; justify-content: space-between; }
  @media print { .sheet { height: auto; min-height: 280mm; } }
`

export function plotSignsHtml(d: PlanData, o: SignOpts): string {
  const { trial, treatments } = d
  const items: Array<{ plot: number; t: TreatmentRow }> = []
  for (const t of treatments) {
    const plots = t.components?.plots ?? []
    const byRep = t.components?.plotsByRep
    const chosen = o.repOneOnly ? (byRep?.['1'] != null ? [byRep['1']] : plots.slice(0, 1)) : plots
    for (const p of chosen) items.push({ plot: p, t })
  }
  items.sort((a, b) => a.plot - b.plot)
  const per = o.size === 'a6' ? 4 : 2
  const sheets: string[] = []
  for (let i = 0; i < items.length; i += per) {
    const signs = items.slice(i, i + per).map(({ plot, t }) => {
      const lines = treatmentLines(t)
      const exp = lines.some((l) => l.exp)
      return `<div class="sign">
        <div class="trial">${esc(trial.name)}</div>
        <div class="plot">${plot}</div>
        ${o.blind ? '' : `<div class="t">TREATMENT ${t.n}</div><div class="name">${esc(t.name)}</div><div class="recipe">${recipeByTiming(lines, t)}</div>`}
        ${exp && !o.blind ? '<span class="exp">EXPERIMENTAL</span>' : ''}
        <div class="foot"><span>${esc([trial.site?.property, trial.season].filter(Boolean).join(' · '))}</span><span>AGnVET Trial Work</span></div>
      </div>`
    })
    sheets.push(`<div class="sheet ${o.size}">${signs.join('')}</div>`)
  }
  return sheets.join('') || '<p class="muted">No plots allocated yet.</p>'
}

export const signCss = SIGN_CSS

export function siteSignHtml(d: PlanData, lsdNote = true): string {
  const { trial, treatments } = d
  const rows = treatments.map((t) => `<tr><td class="mono" style="font-size:14px"><b>T${t.n}</b></td><td style="font-size:14px"><b>${esc(t.name)}</b></td><td style="font-size:12px">${recipeByTiming(treatmentLines(t), t)}</td></tr>`).join('')
  const logo = typeof document !== 'undefined' ? new URL('assets/agnvet-logo.png', document.baseURI).href : ''
  return `<div style="border:2px solid #007749;border-radius:10px;padding:18px 22px;min-height:270mm;position:relative">
    <div style="display:flex;justify-content:space-between;align-items:flex-start">
      <div><div class="eyebrow">Field trial</div><div style="font-size:34px;font-weight:800;line-height:1.1;letter-spacing:-.3px">${esc(trial.name)}</div>
      <div style="font-size:15px;color:#58585B;margin-top:4px">${esc([trial.client?.name, trial.site ? [trial.site.property, trial.site.town].filter(Boolean).join(', ') : null, [trial.crop, trial.variety].filter(Boolean).join(' '), trial.sown_date ? `sown ${trial.sown_date}` : null].filter(Boolean).join(' · '))}</div></div>
      ${logo ? `<img src="${esc(logo)}" alt="AGnVET" style="height:44px">` : ''}
    </div>
    ${trial.aim ? `<p style="font-size:17px;line-height:1.4;margin:16px 0 10px">${esc(trial.aim)}</p>` : ''}
    <div class="grey" style="font-size:13px;margin-bottom:12px">${esc([trial.design?.type, trial.design?.reps ? `${trial.design.reps} replicates` : null, trial.design?.plot ? `${trial.design.plot.widthM} × ${trial.design.plot.lengthM} m plots` : null].filter(Boolean).join(' · '))}</div>
    <table style="font-size:13px"><thead><tr><th>#</th><th>Treatment</th><th>Products and rates</th></tr></thead><tbody>${rows}</tbody></table>
    ${lsdNote ? '<p class="grey" style="font-size:12px;margin-top:14px">Treatments are compared statistically at harvest. Differences you can see between plots are not a result until they clear the least significant difference (LSD 5%). Please keep to the pathways; do not enter the plots. Products marked EXPERIMENTAL are not registered for this use.</p>' : ''}
    <div style="position:absolute;bottom:14px;left:22px;right:22px;display:flex;justify-content:space-between;font-size:12px;color:#58585B"><span>Agronomist: Andrew Rolfe · AGnVET Services</span><span>Member of AgLink Australia</span></div>
  </div>`
}

// --- 4. Assessment sheet -----------------------------------------------------

/** Serpentine order: position 1 rows 1→n, position 2 rows n→1, and so on. */
export function serpentine(plots: number[]): number[] {
  const rows = Math.max(...plots.map((p) => Math.floor(p / 100)))
  const positions = Math.max(...plots.map((p) => p % 100))
  const set = new Set(plots)
  const out: number[] = []
  for (let pos = 1; pos <= positions; pos++) {
    const rr = Array.from({ length: rows }, (_, i) => i + 1)
    if (pos % 2 === 0) rr.reverse()
    for (const r of rr) if (set.has(r * 100 + pos)) out.push(r * 100 + pos)
  }
  return out
}

export function assessmentSheetHtml(d: PlanData, a: AssessmentRow): string {
  const { trial, treatments, measures } = d
  const trtOf = new Map<number, number>()
  for (const t of treatments) for (const p of t.components?.plots ?? []) trtOf.set(p, t.n)
  const plots = serpentine([...trtOf.keys()])
  const cols = a.measures.map((k) => {
    const m = measures.get(k)
    return m ? `${esc(m.label)}${m.unit ? `<br><span class="muted">${esc(m.unit)}</span>` : ''}` : esc(k)
  })
  const rows = plots.map((p) => `<tr><td class="mono"><b>${p}</b></td><td class="mono">${a.blind ? '' : `T${trtOf.get(p)}`}</td>${cols.map(() => '<td style="height:22px"></td>').join('')}<td></td></tr>`).join('')
  return `${header(trial, `Assessment ${a.n} · ${a.timing ?? ''}`)}
  <div class="kv"><b>Date</b><span>________________</span><b>Assessor</b><span>________________</span><b>Growth stage</b><span>________________</span>${a.blind ? '<b>Blind</b><span>treatment column left blank on purpose</span>' : ''}</div>
  <p class="muted" style="margin:8px 0">Walk order is serpentine by position. ${a.measures.map((k) => measures.get(k)?.sample).filter(Boolean).map((s) => esc(s)).join(' · ')}</p>
  <table><thead><tr><th>Plot</th><th>Trt</th>${cols.map((c) => `<th>${c}</th>`).join('')}<th style="width:28%">Notes</th></tr></thead><tbody>${rows}</tbody></table>
  ${footer(trial, `Assessment ${a.n}`)}`
}
