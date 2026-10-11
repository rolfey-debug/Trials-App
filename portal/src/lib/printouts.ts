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
  .foot { margin-top: 28px; padding-top: 8px; border-top: 1px solid #E4E4E6; font-size: 9px; color: #8A8C8A; display: flex; justify-content: space-between; }
  .page + .page { margin-top: 36px; padding-top: 24px; border-top: 3px dashed #D8DAD8; }
  @media print { body { padding: 14mm 14mm 18mm; } .page { page-break-after: always; } .page + .page { margin-top: 0; padding-top: 0; border-top: 0; } .foot { position: fixed; bottom: 8mm; left: 14mm; right: 14mm; margin: 0; border: 0; } }
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

// --- 5. Draft grower documents and WHS pack ----------------------------------
// Wording below is a working draft for review: every page carries a DRAFT
// band and the agreement says it is not for signing until reviewed. The
// facts (parties, site, products, hazards) come from the record so the
// reviewer marks up language, not blanks.

const DRAFT_BAND = `<div style="margin:0 0 16px;padding:8px 14px;border-radius:6px;background:#FBEDE8;border-bottom:2px solid #cf4520;color:#A93414;font-size:11px;font-weight:800;letter-spacing:.08em">DRAFT WORDING · NOT YET REVIEWED · NOT FOR SIGNING</div>`
const blank = (w = 180) => `<span style="display:inline-block;min-width:${w}px;border-bottom:1px solid #141414">&nbsp;</span>`
const gap = (v: string | null | undefined, w = 160) => (v ? esc(v) : blank(w))

function dms(v: number, pos: string, neg: string): string {
  const a = Math.abs(v)
  const d = Math.floor(a)
  const m = Math.floor((a - d) * 60)
  const s = Math.round(((a - d) * 60 - m) * 60)
  return `${d}° ${m}′ ${s}″ ${v >= 0 ? pos : neg}`
}

export interface SiteFeatureLite {
  kind: string
  name: string | null
}

export interface DocsData extends PlanData {
  features?: SiteFeatureLite[]
  /** People who may apply product, from the people table, for the accreditation record. */
  applicators?: Array<{ name: string; role: string }>
}

const productList = (trts: TreatmentRow[]) => {
  const seen = new Map<string, { exp: boolean; rates: Set<string> }>()
  for (const t of trts) for (const l of treatmentLines(t)) {
    const e = seen.get(l.product) ?? { exp: false, rates: new Set<string>() }
    e.exp = e.exp || !!l.exp
    if (l.rate != null) e.rates.add(`${fmt(l.rate, 2)} ${l.unit}`)
    seen.set(l.product, e)
  }
  return [...seen.entries()].map(([product, e]) => ({ product, exp: e.exp, rates: [...e.rates] }))
}

export function agreementHtml(d: DocsData): string {
  const { trial, treatments } = d
  const products = productList(treatments)
  const exp = products.filter((p) => p.exp)
  const site = trial.site ? [trial.site.property, trial.site.town].filter(Boolean).join(', ') : ''
  const area = trial.design?.plot && trial.design.grid ? `${((trial.design.plot.areaM2 * trial.design.grid.rows * trial.design.grid.positions) / 10000).toFixed(2)} ha of plots plus access and buffer` : null
  return `${DRAFT_BAND}${header(trial, 'Trial site agreement')}
  <h2>1. Parties</h2>
  <p><b>AGnVET Services</b> (the Agronomy Provider), by its agronomist Andrew Rolfe, and <b>${gap(trial.client?.name, 220)}</b> (the Grower), owner or occupier of ${gap(site, 260)}.</p>
  <h2>2. Site and area</h2>
  <p>The Grower allows the trial known as <b>${esc(trial.name)}</b> on the paddock at ${gap(site, 220)} for the ${esc(String(trial.season ?? ''))} season. The trial area is ${gap(area, 220)}, as marked on the attached site plan. The trial plots are the Grower's crop${trial.crop ? ` (${esc([trial.crop, trial.variety].filter(Boolean).join(' '))})` : ''}, sown and managed by the Grower except as set out below.</p>
  <h2>3. Duration</h2>
  <p>From sowing or the first application, whichever is earlier, until harvest of the trial area and removal of signs and pegs, expected ${gap(null, 120)}. Either party may end the agreement earlier under clause 11.</p>
  <h2>4. Access</h2>
  <p>The Agronomy Provider and people working with it may enter the paddock on reasonable notice (a phone call or text on the day is enough) to apply treatments, assess, photograph, fly a drone over the trial area, host a field walk and harvest the plots. Vehicles keep to ${gap(null, 180)} and gates are left as found.</p>
  <h2>5. What the Agronomy Provider will do</h2>
  <ul>
    <li>Lay out, peg and sign the plots and keep the plan and the application records.</li>
    <li>Apply the treatments listed in the schedule, by accredited operators, according to product labels or the research permit.</li>
    <li>Assess the plots and provide the Grower with the results at the end of the season, including anything found that affects the Grower's own management of the paddock.</li>
    <li>Remove pegs, signs and any trial material at the end.</li>
  </ul>
  <h2>6. What the Grower agrees to</h2>
  <ul>
    <li>Manage the paddock around the trial area as normal, but <b>not spray, spread, graze, cultivate or harvest the trial plots</b> without first speaking to the Agronomy Provider, and tell any contractor the same.</li>
    <li>Tell the Agronomy Provider of any product applied to the paddock, with date, product and rate, so the record is complete.</li>
    <li>Allow the plots to be harvested separately where the plan says so, and the plot grain to be kept out of the Grower's delivery.</li>
  </ul>
  <h2>7. Unregistered or experimental products</h2>
  ${exp.length ? `<p>The following products are not registered for this use: ${exp.map((p) => `<b>${esc(p.product)}</b>`).join(', ')}. They are applied under APVMA research permit number ${blank(140)}. <b>Produce from plots treated with these products must not enter the food or feed chain.</b> The Agronomy Provider will destroy or dispose of that produce and tell the Grower when it is done.</p>` : '<p>No unregistered or experimental products are listed for this trial. If one is added, the Agronomy Provider will tell the Grower in writing and the produce from those plots will not enter the food or feed chain.</p>'}
  <h2>8. Crop damage and compensation</h2>
  <p>Where a treatment, the trial layout or trial activity causes a loss of yield or quality in the trial area beyond what the Grower would otherwise have had, the Agronomy Provider will compensate the Grower on the following basis: ${blank(300)} (for example, the untreated plot yield times the area affected at the delivered price for the Grower's grade). Normal seasonal loss, and loss outside the trial area, are not covered.</p>
  <h2>9. Data, results and publication</h2>
  <p>The trial data belongs to the Agronomy Provider and, where a product company sponsors the trial, to that company under its own agreement with AGnVET. The Grower receives the full results for this site. Results may be presented and published with the paddock identified by district only, unless the Grower agrees in writing to be named. The Grower's own farm records are not disclosed.</p>
  <h2>10. Insurance and responsibility</h2>
  <p>Each party keeps its own public liability insurance. The Agronomy Provider is responsible for the safety of its own people and visitors it brings to the site and will give the Grower the site safety sheet. The Grower will point out known hazards on the property (overhead lines, dams, chemical storage, stock) before work starts.</p>
  <h2>11. Ending the agreement</h2>
  <p>Either party may end the agreement with two weeks' notice. If the Grower ends it after treatments are applied, the Agronomy Provider may still complete the assessments and harvest already planned, and clause 7 continues to apply to treated produce.</p>
  <h2>12. Signatures</h2>
  <table style="margin-top:8px"><tbody>
    <tr><td style="width:50%;height:70px;vertical-align:bottom">Grower ${blank(200)}<br><span class="muted">name, signature, date</span></td><td style="vertical-align:bottom">AGnVET Services ${blank(200)}<br><span class="muted">name, signature, date</span></td></tr>
  </tbody></table>
  <h2>Schedule: treatments</h2>
  <table><thead><tr><th>#</th><th>Treatment</th><th>Products and rates by timing</th></tr></thead><tbody>${treatments.map((t) => `<tr><td class="mono">T${t.n}</td><td>${esc(t.name)}</td><td>${recipeByTiming(treatmentLines(t), t)}</td></tr>`).join('')}</tbody></table>
  ${footer(trial, 'Draft site agreement')}`
}

export function growerInfoHtml(d: DocsData): string {
  const { trial, treatments } = d
  const timings = timingsOf(treatments)
  const exp = productList(treatments).filter((p) => p.exp)
  return `${DRAFT_BAND}${header(trial, 'Grower information sheet')}
  <p style="font-size:13px">A plain-language summary of what is in your paddock and what it needs from you. Keep it with your spray records and give a copy to anyone who sprays or spreads for you.</p>
  <h2>What is out there</h2>
  <p>${esc(trial.aim ?? 'A replicated field trial comparing the treatments below.')}</p>
  <p>${treatments.length} treatments${trial.design?.reps ? ` × ${trial.design.reps} replicates` : ''}${trial.design?.plot ? `, plots ${trial.design.plot.widthM} × ${trial.design.plot.lengthM} m` : ''}, pegged and signed. The untreated plots are part of the trial: please leave them alone too.</p>
  <table><thead><tr><th>#</th><th>Treatment</th><th>Products and rates</th></tr></thead><tbody>${treatments.map((t) => `<tr><td class="mono">T${t.n}</td><td>${esc(t.name)}</td><td>${recipeByTiming(treatmentLines(t), t)}</td></tr>`).join('')}</tbody></table>
  <h2>When we will be in the paddock</h2>
  <ul>${timings.map((tm) => `<li>Application ${tm}: ${esc(trial.spraying?.timings?.[tm]?.due ?? 'timing to be confirmed')}${trial.spraying?.timings?.[tm]?.applied ? ` (applied ${esc(trial.spraying.timings[tm].applied)})` : ''}</li>`).join('')}
    <li>Assessments: ${d.assessments.length ? d.assessments.map((a) => esc(a.timing ?? '')).filter(Boolean).join(', ') : 'through the season'}</li>
    <li>Harvest of the plots: we will ring before.</li></ul>
  <h2>What we need from you</h2>
  <ul>
    <li>Please do not spray, spread, graze or cultivate over the plots. Tell your contractor the plots are there and where the buffer runs.</li>
    <li>Let us know what you put on the rest of the paddock (product, rate, date); it goes in the trial record.</li>
    <li>Ring if you see anything odd in the trial area: damage, stock in, a sign down.</li>
  </ul>
  ${exp.length ? `<h2>Experimental products</h2><p>${exp.map((p) => `<b>${esc(p.product)}</b>`).join(', ')} ${exp.length === 1 ? 'is' : 'are'} not registered for this use. Grain or hay from those plots cannot be sold or fed and we will remove it. Plots are signed EXPERIMENTAL.</p>` : ''}
  <h2>Who to call</h2>
  <p>Andrew Rolfe, AGnVET Services: ${blank(160)}. Office: ${blank(160)}.</p>
  ${footer(trial, 'Grower information sheet')}`
}

const HAZARD_ROWS: Array<[string, string, string]> = [
  ['Agricultural chemicals', 'Skin and eye contact, inhalation during mixing and spraying', 'Read the label and SDS; PPE by product (gloves, overalls, eye protection, respirator where required); mix in the open, upwind; wash facilities and clean water on the ute; triple rinse'],
  ['Vehicles and machinery', 'Ute and plot boom on uneven ground, reversing, moving parts', 'Walk the site first; spotter when reversing near people; machinery guards in place; no loose clothing'],
  ['Heat, sun and dehydration', 'Heat stress, sunburn', 'Water on hand, hat and sunscreen, shade breaks; reschedule heavy work above 35 °C'],
  ['Remote and lone work', 'Delayed help after an injury', 'Tell the office the plan and expected return; phone or UHF checked for coverage at the gate; first aid kit in the ute'],
  ['Fatigue and driving', 'Long days and early starts', 'Share driving on long runs; no spraying after a full day of travel'],
  ['Uneven ground, holes, stubble', 'Trips, ankle injuries', 'Boots; walk, do not run, between plots; mark holes found'],
  ['Livestock and dogs', 'Charging stock, bites', 'Check with the grower; keep vehicles between you and stock; gates closed'],
  ['Fire danger', 'Hot exhausts in dry stubble, total fire ban days', 'Check the fire danger rating; no vehicles in long dry grass on high days; extinguisher on the ute'],
  ['Snakes and insects', 'Bites and stings', 'Boots and long trousers; pressure bandage in the kit; know the nearest hospital'],
]

export function whsPackHtml(d: DocsData): string {
  const { trial, treatments } = d
  const features = d.features ?? []
  const site = trial.site
  const coords = site?.lat != null && site?.lng != null ? `${site.lat.toFixed(5)}, ${site.lng.toFixed(5)} · ${dms(site.lat, 'N', 'S')} ${dms(site.lng, 'E', 'W')}` : null
  const siteHazards: Array<[string, string, string]> = []
  if (features.some((f) => f.kind === 'power_line')) siteHazards.push(['Overhead power lines', `On this site: ${features.filter((f) => f.kind === 'power_line').map((f) => f.name || 'marked on the plan').join('; ')}`, 'No drone flights near the lines; boom and loader arms down when passing under; marked on the site plan'])
  if (features.some((f) => f.kind === 'water')) siteHazards.push(['Dams, channels and troughs', `On this site: ${features.filter((f) => f.kind === 'water').map((f) => f.name || 'marked on the plan').join('; ')}`, 'No vehicles on dam banks; children kept away at field days'])
  for (const f of features.filter((x) => x.kind === 'hazard')) siteHazards.push([`Hazard area: ${f.name || 'unnamed'}`, 'Marked on the site plan', 'Keep out; fenced or flagged for field days'])
  const products = productList(treatments)
  const applicators = d.applicators ?? []
  const pubcris = 'https://portal.apvma.gov.au/pubcris'
  const page = (title: string, body: string) => `<div class="page">${DRAFT_BAND}${header(trial, title)}${body}${footer(trial, 'WHS site pack')}</div>`
  return [
    page('WHS site pack · 1 Site risk assessment', `
      <div class="kv"><b>Site</b><span>${esc(site ? [site.property, site.town].filter(Boolean).join(', ') : '')}</span><b>Assessed by</b><span>${blank(160)}</span><b>Date</b><span>${blank(120)}</span><b>Reviewed</b><span>before each spray day and the field day</span></div>
      <h2>Site-specific hazards${siteHazards.length ? '' : ' (none drawn on the site plan yet)'}</h2>
      ${siteHazards.length ? `<table><thead><tr><th>Hazard</th><th>Where</th><th>Controls</th></tr></thead><tbody>${siteHazards.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>` : '<p class="muted">Draw power lines, water and hazard areas on the site planner and they list here.</p>'}
      <h2>General hazards for small-plot trial work</h2>
      <table><thead><tr><th style="width:22%">Hazard</th><th style="width:28%">Risk</th><th>Controls</th></tr></thead><tbody>${HAZARD_ROWS.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`),
    page('WHS site pack · 2 Emergency plan', `
      <h2>Where you are</h2>
      <div class="kv">
        <b>Property</b><span>${esc(site?.property ?? '')}</span>
        <b>Nearest town</b><span>${esc(site?.town ?? '')}</span>
        <b>Coordinates</b><span class="mono">${coords ? esc(coords) : blank(260)}</span>
        <b>Road access</b><span>${blank(300)}</span>
        <b>Gate</b><span>${features.some((f) => f.kind === 'gate') ? esc(features.filter((f) => f.kind === 'gate').map((f) => f.name || 'marked on the plan').join('; ')) : blank(260)}</span>
        <b>Phone coverage</b><span>${blank(120)} &nbsp; <b>UHF channel</b> ${blank(60)}</span>
        <b>Nearest hospital</b><span>${blank(300)}</span>
        <b>First aid kit</b><span>In the ute, driver's side rear</span>
        <b>Nearest water</b><span>${features.some((f) => f.kind === 'water') ? esc(features.filter((f) => f.kind === 'water').map((f) => f.name || 'marked on the plan').join('; ')) : 'Ute water drum'}</span>
      </div>
      <h2>If someone is hurt</h2>
      <ol style="margin:0;padding-left:18px;line-height:1.6">
        <li>Make the area safe; stop spraying, engines off.</li>
        <li>Call <b>000</b> (or <b>112</b> from a mobile with no coverage on your network). Give the coordinates above and the property name. Stay on the line.</li>
        <li>Chemical exposure: remove contaminated clothing, flush skin or eyes with clean water for 15 minutes, keep the product label for the ambulance. Poisons Information Centre <b>13 11 26</b>.</li>
        <li>Send someone to the gate to guide the ambulance in.</li>
        <li>Tell the office and the grower.</li>
      </ol>
      <h2>Contacts</h2>
      <table><thead><tr><th>Who</th><th>Phone</th></tr></thead><tbody>
        <tr><td>Andrew Rolfe, AGnVET Services</td><td>${blank(160)}</td></tr>
        <tr><td>Grower: ${esc(trial.client?.name ?? '')}</td><td>${gap(trial.client?.contact?.phone, 160)}</td></tr>
        <tr><td>AGnVET office</td><td>${blank(160)}</td></tr>
        <tr><td>Poisons Information Centre</td><td>13 11 26</td></tr>
        <tr><td>Emergency</td><td>000</td></tr>
      </tbody></table>`),
    page('WHS site pack · 3 Hazardous chemical register', `
      <p>Every product used on the trial. Safety data sheets travel in the ute and are linked from the APVMA product record.</p>
      <table><thead><tr><th>Product</th><th>Rates used</th><th>Status</th><th>SDS</th><th>Quantity on site</th><th>Storage</th></tr></thead><tbody>
        ${products.length ? products.map((p) => `<tr><td><b>${esc(p.product)}</b></td><td>${esc(p.rates.join(', '))}</td><td>${p.exp ? '<span class="exp">EXP</span> unregistered, research permit' : 'registered'}</td><td>${p.exp ? 'from the supplier' : `<a href="${pubcris}">APVMA PubCRIS</a> (search the product name)`}</td><td>${blank(70)}</td><td>${blank(90)}</td></tr>`).join('') : '<tr><td colspan="6" class="muted">No products on the treatment list.</td></tr>'}
      </tbody></table>
      <h2>Safe work method: mixing and spraying small plots</h2>
      <table><thead><tr><th style="width:26%">Step</th><th style="width:30%">Hazards</th><th>Controls</th></tr></thead><tbody>
        <tr><td>Check the plan and the weather</td><td>Drift, wrong product on a plot</td><td>Wind under 15 km/h and away from sensitive areas; Delta T in range; spray plan on the ute with plots and treatments; conditions written on the record before starting</td></tr>
        <tr><td>Set up and calibrate</td><td>Pressurised lines, nozzle checks at eye level</td><td>Calibrate with water first; check nozzles with the boom down; gloves and eye protection on from here</td></tr>
        <tr><td>Measure and mix each batch</td><td>Concentrate contact, splashes, inhalation</td><td>PPE per label (minimum: chemical gloves, overalls, eye protection; respirator where the label says); measure over a tray; water first, products in order, adjuvant last; label the bottle T-number</td></tr>
        <tr><td>Spray the plots</td><td>Walking into spray, tripping with the boom, bystanders</td><td>Walk upwind; one person sprays, one records; nobody else inside the trial area; tick each plot as sprayed</td></tr>
        <tr><td>Rinse and dispose</td><td>Contaminated rinsate and containers</td><td>Triple rinse between treatments, rinsate sprayed on the buffer or a spare plot, never to a drain or dam; empty containers to drumMUSTER or as the label says</td></tr>
        <tr><td>Finish</td><td>Residues on hands and clothing</td><td>Wash hands and face before eating or driving; overalls bagged for washing separately; record completed within 24 hours</td></tr>
      </tbody></table>`),
    page('WHS site pack · 4 Field day induction and sign-on', `
      <h2>Visitor induction (read out at the gate)</h2>
      <ul style="line-height:1.6">
        <li>This is a working paddock. Keep to the pathways between plots; do not enter the plots.</li>
        <li>${siteHazards.length ? `Keep-out areas today: ${esc(siteHazards.map((h) => h[0]).join('; '))}.` : 'Keep-out areas today: as flagged.'}</li>
        <li>Products marked EXPERIMENTAL are unregistered: do not handle plants or grain from those plots.</li>
        <li>Vehicles park where directed; no vehicles in long dry grass.</li>
        <li>Water, shade and the first aid kit are at the ute. In an emergency the meeting point is the gate.</li>
        <li>Children stay with an adult and away from water.</li>
      </ul>
      <h2>Sign-on</h2>
      <table><thead><tr><th>Name</th><th>Organisation</th><th>Phone</th><th>Time in</th><th>Time out</th><th>Inducted</th></tr></thead><tbody>
        ${Array.from({ length: 18 }, () => `<tr>${'<td style="height:24px"></td>'.repeat(6)}</tr>`).join('')}
      </tbody></table>`),
    page('WHS site pack · 5 Applicator accreditation record', `
      <p>Who applied what on this trial, and the chemical accreditation they hold. Fill in as each application is made.</p>
      <table><thead><tr><th>Name</th><th>Role</th><th>Accreditation (e.g. AQF3 chemical application, ChemCert)</th><th>Number</th><th>Expires</th><th>Applications (timing, date)</th></tr></thead><tbody>
        ${applicators.map((a) => `<tr><td>${esc(a.name)}</td><td>${esc(a.role)}</td><td style="height:26px"></td><td></td><td></td><td></td></tr>`).join('')}
        ${Array.from({ length: Math.max(0, 6 - applicators.length) }, () => `<tr>${'<td style="height:26px"></td>'.repeat(6)}</tr>`).join('')}
      </tbody></table>
      <p class="muted" style="margin-top:10px">Sources to check when this wording is reviewed: SafeWork NSW guidance on agricultural chemicals and farm safety; the NSW Pesticides Regulation record-keeping requirements (record within 24 hours, kept three years).</p>`),
  ].join('')
}
