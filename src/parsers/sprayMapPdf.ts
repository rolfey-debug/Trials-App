import type { CellKind, TrialDoc, Treatment } from '../store/types'
import { pdfTextItems } from './pdfText'
import { MATONG_BASE } from '../data/matong'

export interface ParsedTrial {
  doc: TrialDoc
  stats: { treatments: number; reps: number; positions: number; out: number; marginal: number; hasB: boolean; source: string }
}

/** Parse a spray-map PDF (grid + plot-allocation tables) into a TrialDoc.
 * Built against the real Matong map (fixtures/Matong_Wheat_Spray_Map.pdf);
 * tolerant of the same layout for other sites. */
export function parseSprayMapPdf(data: Uint8Array, fileName = 'spray-map.pdf'): ParsedTrial {
  const items = pdfTextItems(data).map((s) => s.trim())
  if (!items.length) throw new Error('No readable text found in the PDF')

  // ---- header facts ----------------------------------------------------
  const joined = items.join(' | ')
  const nameM = /([A-Za-z() ]+?)\s+(?:Wheat|Barley|Canola)?\s*\w*\s*Trial\s*(?:—|-)?\s*Spray Map/i.exec(joined)
  const titleItem = items.find((s) => /Trial\s*(—|-)?\s*Spray Map$/i.test(s)) ?? items.find((s) => /Spray Map/i.test(s)) ?? ''
  const site = items[items.findIndex((s) => s === 'Site') + 1] || nameM?.[1] || 'New site'
  const gridTxt = items[items.findIndex((s) => s === 'Grid') + 1] || ''
  const gm = /(\d+)\s*rows?\s*[×x]\s*(\d+)\s*positions?/i.exec(gridTxt)
  const rows = gm ? Number(gm[1]) : 12
  const positions = gm ? Number(gm[2]) : 8
  const designTxt = items[items.findIndex((s) => s === 'Design') + 1] || ''
  const dm = /(\d+)\s*treatments?,?\s*([A-Z]+)/i.exec(designTxt)
  const plotIdx = items.findIndex((s) => s === 'Plot')
  const plotTxt = plotIdx >= 0 ? items[plotIdx + 1] : ''
  const pm = /([\d.]+)\s*m\s*[×x]\s*([\d.]+)\s*m(?:,\s*([\d.]+)\s*L\/ha)?/i.exec(plotTxt)
  const widthM = pm ? Number(pm[1]) : 2
  const lengthM = pm ? Number(pm[2]) : 12
  const water = pm && pm[3] ? Number(pm[3]) : 100
  const dateIdx = items.findIndex((s) => s === 'Date')
  const dateTxt = dateIdx >= 0 ? items[dateIdx + 1] : ''

  // ---- grid table ------------------------------------------------------
  // Rows look like: R1 | 1 | [A only] | 101 | 13 | 102 | 5 | 103 | — | 104 | ...
  const cells: Record<string, CellKind> = {}
  const marginal: number[] = []
  const rowStart = items.findIndex((s) => /^R1$/.test(s))
  if (rowStart < 0) throw new Error('Could not find the plot grid in this PDF')
  let i = rowStart
  let currentRow = 0
  let pending: CellKind | null = null
  let pendingMarginal = false
  while (i < items.length) {
    const it = items[i]
    const rm = /^R(\d+)$/.exec(it)
    if (rm && Number(rm[1]) === currentRow + 1) {
      currentRow = Number(rm[1])
      pending = null
      pendingMarginal = false
      i++
      continue
    }
    if (currentRow === 0) {
      i++
      continue
    }
    if (currentRow > rows) break
    const asNum = /^\d+$/.test(it) ? Number(it) : null
    const expectedBase = currentRow * 100
    if (asNum !== null && asNum > expectedBase && asNum <= expectedBase + positions) {
      // plot id token closes the current cell
      if (pending !== null) {
        cells[asNum] = pending
        if (pendingMarginal && typeof pending === 'number') marginal.push(asNum)
      }
      pending = null
      pendingMarginal = false
      if (asNum === expectedBase + positions && currentRow === rows) {
        i++
        break
      }
    } else if (asNum !== null && asNum < 100) {
      pending = asNum // treatment number — the next plot-id token closes the cell
    } else if (/^OUT$/i.test(it)) pending = 'out'
    else if (/^skip$/i.test(it)) pending = 'skip'
    else if (/^res(erve)?$/i.test(it)) pending = 'reserve'
    else if (it === '—' || it === '—' || it === '-') pending = 'spare'
    else if (/maybe/i.test(it)) pendingMarginal = true
    else if (/A only/i.test(it)) {
      /* informational — B flag comes from the allocation table */
    } else if (/^Number/.test(it)) break
    i++
  }

  // ---- treatment allocation table -------------------------------------
  const treatments: Treatment[] = []
  const bIdx = items.findIndex((s) => /^B spray\?$/i.test(s))
  if (bIdx >= 0) {
    let j = bIdx + 1
    while (j + 5 < items.length) {
      const n = /^\d+$/.test(items[j]) ? Number(items[j]) : null
      if (n === null || n > 200) break
      const name = items[j + 1]
      const plots = [items[j + 2], items[j + 3], items[j + 4]].map(Number)
      const b = /^yes$/i.test(items[j + 5])
      if (plots.some((p) => !Number.isFinite(p))) break
      treatments.push({ n, name, recipe: n === 1 ? 'Water only' : `See mixing plan`, bSpray: b, plots })
      j += 6
    }
  }
  if (!treatments.length) {
    // fall back: derive the treatment list from the grid
    const byN: Record<number, number[]> = {}
    for (const [k, v] of Object.entries(cells)) if (typeof v === 'number') (byN[v] = byN[v] || []).push(Number(k))
    for (const [n, plots] of Object.entries(byN)) treatments.push({ n: Number(n), name: `Treatment ${n}`, recipe: 'See mixing plan', bSpray: true, plots })
    treatments.sort((a, b) => a.n - b.n)
  }

  const outCount = Object.values(cells).filter((v) => v === 'out').length
  const season = Number(/\b(20\d\d)\b/.exec(dateTxt)?.[1] ?? new Date().getFullYear())
  const trialName = titleItem.replace(/\s*(—|-)?\s*Spray Map.*$/i, '').replace(/\s+Trial$/i, '').trim() || `${site} trial`

  // rep bands: prefer the Pos n | Rep n headers if present
  const repBands: Record<string, number[]> = {}
  for (let p = 1; p <= positions; p++) {
    const pi = items.findIndex((s) => s === `Pos ${p}`)
    const rep = pi >= 0 && /^Rep (\d+)$/.test(items[pi + 1] ?? '') ? Number(/^Rep (\d+)$/.exec(items[pi + 1])![1]) : 0
    if (rep) (repBands[rep] = repBands[rep] || []).push(p)
  }
  if (!Object.keys(repBands).length) Object.assign(repBands, MATONG_BASE.trial.repBands)
  const reps = Object.keys(repBands).length

  const doc: TrialDoc = {
    id: `${trialName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${season}`,
    trial: {
      name: trialName.includes('—') ? trialName : `${site} — ${trialName.replace(site, '').trim() || 'Trial'}`,
      org: 'AGnVET Services — IK Caldwell',
      season,
      design: dm?.[2]?.toUpperCase() ?? 'RCB',
      reps: reps || 3,
      grid: { rows, positions },
      repBands,
      plot: { widthM, lengthM, areaM2: widthM * lengthM },
      waterRateLPerHa: water,
      sprayVolumePerPlotMl: Math.round(((widthM * lengthM) / 10000) * water * 1000),
      batchVolumeL: 1.5,
      timings: { A: {}, B: { due: 'GS39' } },
      sourceDocument: `${fileName} (${dateTxt || 'parsed'})`,
    },
    treatments,
    cells,
    marginalPlots: marginal,
    walkOrders: MATONG_BASE.walkOrders,
    measures: MATONG_BASE.measures,
  }
  return {
    doc,
    stats: {
      treatments: treatments.length,
      reps: doc.trial.reps,
      positions: rows * positions,
      out: outCount,
      marginal: marginal.length,
      hasB: treatments.some((t) => t.bSpray),
      source: fileName,
    },
  }
}
