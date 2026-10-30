import type { TrialDoc, TrialState } from '../store/types'
import { fieldDayStops, measureFlat, repOf, treatmentByN, unitOf } from '../lib/trial'
import { SAMPLE_SEV, rankedControl } from '../lib/results'

/** Client-facing printouts rendered to a print window (print → Save as PDF).
 * Cover · site + conditions · means table · ranked chart · photo pages. */

/** Escape user- and document-sourced text before HTML interpolation — the
 * print window is same-origin, so this is hardening, not a live exploit fix
 * (ITSP 11.0 secure-coding: context-sensitive escaping). */
const esc = (v: string | number | null | undefined): string =>
  String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const BASE_CSS = `
  * { box-sizing: border-box; }
  body { font-family: 'Mulish', Arial, sans-serif; color: #141414; margin: 0; padding: 32px 40px; }
  h1 { font-size: 26px; letter-spacing: -0.3px; margin: 0 0 2px; }
  h2 { font-size: 15px; margin: 26px 0 8px; }
  .green { color: #007749; }
  .grey { color: #58585B; }
  .mono { font-family: 'IBM Plex Mono', monospace; }
  .eyebrow { font: 600 10px 'IBM Plex Mono', monospace; color: #8A8C8A; letter-spacing: .08em; }
  table { border-collapse: collapse; width: 100%; font-size: 11px; }
  th, td { border: 1px solid #E4E4E6; padding: 4px 7px; text-align: left; }
  th { background: #F4F5F4; font-weight: 700; }
  .bar { height: 9px; background: #007749; border-radius: 4px; }
  .barbg { background: #EEEFEE; border-radius: 4px; overflow: hidden; width: 100%; }
  .page { page-break-after: always; }
  .wm { position: fixed; top: 40%; left: 10%; font-size: 64px; color: rgba(207,69,32,.08); transform: rotate(-24deg); }
  @media print { body { padding: 18mm 16mm; } }
`

function openPrint(title: string, body: string) {
  const w = window.open('', '_blank')
  if (!w) return
  // The print window is about:blank, so relative URLs are unreliable — resolve
  // the self-hosted stylesheet against this document instead. Same URL as the
  // app already loaded, so it comes straight from cache.
  const fontsHref = new URL('fonts/fonts.css', document.baseURI).href
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
    <link href="${fontsHref}" rel="stylesheet">
    <style>${BASE_CSS}</style></head><body>${body}</body></html>`)
  w.document.close()
  w.focus()
  setTimeout(() => w.print(), 400)
}

export function printClientReport(doc: TrialDoc, ts: TrialState, opts: { blindCodes: boolean; watermark?: boolean }) {
  const flat = measureFlat(doc.measures)
  const primary = ts.activeMeasures[0]
  const { bars, live } = rankedControl(doc, ts)
  const nameOf = (n: number) => (opts.blindCodes ? `T${n}` : `T${n} · ${esc(treatmentByN(doc, n)?.name ?? '')}`)

  const pids = Object.keys(doc.cells).map(Number).filter((p) => typeof doc.cells[p] === 'number').sort((a, b) => a - b)
  const scored = pids.filter((p) => ts.scores[p])

  const meansRows = doc.treatments
    .map((t) => {
      const tp = pids.filter((p) => (ts.relabel[p] ?? doc.cells[p]) === t.n && !ts.excluded.includes(p))
      const vals = tp.map((p) => ts.scores[p]?.v[primary]).filter((v): v is number => v !== undefined)
      const mean = vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : '—'
      return `<tr><td class="mono">${t.n}</td><td>${opts.blindCodes ? `T${t.n}` : esc(t.name)}</td><td>${opts.blindCodes ? '—' : esc(t.recipe)}</td><td class="mono">${vals.length}</td><td class="mono">${mean}</td></tr>`
    })
    .join('')

  const barRows = bars
    .map(
      (b) => `<div style="margin-bottom:7px"><div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:2px">
      <span style="font-weight:700">${opts.blindCodes ? `T${b.n}` : nameOf(b.n)}</span><span class="mono">${b.ctl}%</span></div>
      <div class="barbg"><div class="bar" style="width:${b.ctl}%"></div></div></div>`
    )
    .join('')

  const photoRows = ts.photos
    .slice(0, 12)
    .map(
      (p) =>
        `<td style="width:33%;padding:8px"><div style="height:110px;background:repeating-linear-gradient(45deg,#DCE4DE 0 8px,#D0DAD3 8px 16px);border-radius:8px"></div>
        <div class="mono" style="font-size:10px;margin-top:3px">${p.pid} · T${p.trt} · ${esc(p.date)}${p.flagged ? ' · ⚑' : ''}</div></td>`
    )
    .join('')

  const body = `
  ${opts.watermark ? '<div class="wm">DRAFT — NOT FINAL</div>' : ''}
  <div class="page">
    <div class="eyebrow">AGnVET SERVICES — IK CALDWELL · ${doc.trial.season} SEASON</div>
    <h1><span class="green">${esc(doc.trial.name)}</span></h1>
    <div class="grey" style="font-size:13px">${doc.treatments.length} treatments · ${doc.trial.reps} reps · ${pids.length} plots · ${doc.trial.plot.widthM} × ${doc.trial.plot.lengthM} m · ${doc.trial.waterRateLPerHa} L/ha</div>
    <div style="margin-top:16px;font-size:12px">Source: ${esc(doc.trial.sourceDocument)}</div>
    <h2>Site & paddock</h2>
    <table>${[...ts.site.cooperator, ...ts.site.paddock].map(([k, v]) => `<tr><th style="width:32%">${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}
    <tr><th>Site notes</th><td>${esc(ts.site.notes) || '—'}</td></tr></table>
    <h2>Application A — conditions record</h2>
    <table><tr>${Object.keys(ts.conditions).map((k) => `<th>${esc(k)}</th>`).join('')}</tr>
    <tr>${Object.values(ts.conditions).map((v) => `<td class="mono">${esc(v)}</td>`).join('')}</tr></table>
  </div>
  <div class="page">
    <h2>Treatment means — ${esc(flat[primary][1])} ${esc(unitOf(flat[primary]))} <span class="grey">(${scored.length} of ${pids.length} plots scored)</span></h2>
    <table><tr><th>Trt #</th><th>Treatment</th><th>Application</th><th>n</th><th>Mean</th></tr>${meansRows}</table>
    <h2>Ranked control vs untreated ${live ? '' : '<span style="font-size:10px;background:#EEEFEE;padding:2px 6px;border-radius:4px">SAMPLE DATA</span>'}</h2>
    ${barRows}
    <div class="grey" style="font-size:10px;margin-top:8px">Corrections applied per the trial correction log — see the Excel export for plot-level data.</div>
  </div>
  <div>
    <h2>Plot photos</h2>
    <table style="border:none"><tr>${photoRows || '<td class="grey">No photos yet</td>'}</tr></table>
  </div>`
  openPrint(`${doc.trial.name} — Client report`, body)
}

export function printFieldDayHandout(doc: TrialDoc, ts: TrialState) {
  const stops = fieldDayStops(doc)
  const rows = stops
    .map((pid, i) => {
      const trt = (ts.relabel[pid] ?? doc.cells[pid]) as number
      const t = treatmentByN(doc, trt)
      return `<tr><td class="mono">${i + 1}</td><td class="mono">${pid}</td><td class="mono">R${Math.floor(pid / 100)} · P${pid % 100} · Rep ${repOf(doc, pid)}</td>
        <td style="font-weight:700">${esc(t?.name ?? `T${trt}`)}</td><td class="grey">${esc(t?.recipe ?? '')}</td></tr>`
    })
    .join('')
  const body = `
    <div class="eyebrow">AGnVET SERVICES — IK CALDWELL · FIELD DAY</div>
    <h1><span class="green">${esc(doc.trial.name)}</span> — Rep 1 walk</h1>
    <div class="grey" style="font-size:12px;margin-bottom:12px">Rep 1 runs the treatment list in order across the front: position 1 rows 1→${doc.trial.grid.rows}, then position 2 back. Reps 2–3 are randomised — quote treatment means, not single plots.</div>
    <table style="font-size:12px"><tr><th>Stop</th><th>Plot</th><th>Where</th><th>Treatment</th><th>Applied</th></tr>${rows}</table>`
  openPrint(`${doc.trial.name} — Field-day handout`, body)
}

export { SAMPLE_SEV }
