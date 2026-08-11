import type { TrialDoc, TrialState } from '../store/types'
import { measureFlat, repOf, treatmentByN, unitOf } from '../lib/trial'
import { writeXlsx, type Cell, type SheetSpec } from './xlsxWrite'

/** Excel / ARM export — plot-level, one tab per assessment, matching the shape of
 * fixtures/Junee_Field_Assessment.xlsx (Plot #, Block, Trt #, Treatment, App A,
 * App B, measure columns, Assessor, Photo?, Notes) plus its Correction Log tab.
 * Relabelled plots carry the corrected treatment with the original flagged. */
export function buildAssessmentWorkbook(doc: TrialDoc, ts: TrialState, opts?: { blindCodes?: boolean }): Uint8Array {
  const flat = measureFlat(doc.measures)
  const measures = ts.activeMeasures
  const blind = !!opts?.blindCodes

  const appA = (n: number) => {
    const t = treatmentByN(doc, n)
    if (!t) return '—'
    return n === 1 ? '—' : blind ? `T${n}` : t.recipe
  }
  const appB = (n: number) => {
    const t = treatmentByN(doc, n)
    return t?.bSpray ? (blind ? `T${n} · B` : `${t.name} at B`) : '—'
  }
  const nameOf = (n: number) => (blind ? `T${n}` : treatmentByN(doc, n)?.name ?? `T${n}`)

  const header: Cell[] = [
    'Plot #', 'Block', 'Trt #', 'Treatment', 'App A', 'App B',
    ...measures.map((k) => `${flat[k][1]} ${unitOf(flat[k])}`),
    'Assessor', 'Photo?', 'Notes / Observations',
  ]

  const plotRows: Cell[][] = []
  const pids = Object.keys(doc.cells)
    .map(Number)
    .filter((pid) => typeof doc.cells[pid] === 'number')
    .sort((a, b) => a - b)
  for (const pid of pids) {
    const original = doc.cells[pid] as number
    const eff = ts.relabel[pid] ?? original
    const sc = ts.scores[pid]
    const excluded = ts.excluded.includes(pid)
    const noteBits: string[] = []
    if (ts.relabel[pid]) noteBits.push(`Relabelled — was T${original}, now T${eff} as applied`)
    if (excluded) noteBits.push('EXCLUDED from analysis')
    if (sc?.note) noteBits.push(sc.note)
    plotRows.push([
      pid,
      repOf(doc, pid),
      eff,
      nameOf(eff) + (excluded ? ' (excluded)' : ''),
      appA(eff),
      appB(eff),
      ...measures.map((k) => (sc && sc.v[k] !== undefined ? sc.v[k] : '')),
      sc ? sc.by : '',
      sc && sc.photoIds.length ? 'Y' : '',
      noteBits.join(' · '),
    ])
  }

  const assessTab: SheetSpec = {
    name: 'Assessment 1',
    rows: [
      [`${doc.trial.org} — ${doc.trial.name} — Assessment 1 (14–21 DAA)`],
      [
        `${doc.trial.reps} reps · ${pids.length} plots · ${doc.trial.plot.widthM} × ${doc.trial.plot.lengthM} m · ${doc.trial.waterRateLPerHa} L/ha · exported ${new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}`,
      ],
      header,
      ...plotRows,
    ],
    colWidths: [8, 7, 7, 26, 34, 22, ...measures.map(() => 12), 12, 8, 40],
  }

  // Treatment means tab (like Junee 'Treatment Data')
  const primary = measures[0]
  const meansRows: Cell[][] = []
  for (const t of doc.treatments) {
    const tPlots = pids.filter((p) => (ts.relabel[p] ?? doc.cells[p]) === t.n && !ts.excluded.includes(p))
    const vals = tPlots.map((p) => ts.scores[p]?.v[primary]).filter((v): v is number => v !== undefined)
    const mean = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null
    meansRows.push([t.n, nameOf(t.n), appA(t.n), appB(t.n), vals.length, mean === null ? '' : +mean.toFixed(2)])
  }
  const meansTab: SheetSpec = {
    name: 'Treatment Data',
    rows: [
      [`${doc.trial.name} — treatment means (live from Assessment 1)`],
      [`Primary measure: ${flat[primary][1]} ${unitOf(flat[primary])} · n = plots scored (excluded plots dropped)`],
      ['Trt #', 'Treatment', 'App A', 'App B', 'n', `Mean ${flat[primary][1]}`],
      ...meansRows,
    ],
    colWidths: [7, 26, 34, 22, 6, 14],
  }

  // Correction Log tab — matches the Junee workbook's columns
  const corrRows: Cell[][] = ts.issues
    .filter((i) => i.corr)
    .map((i) => {
      const original = doc.cells[i.pid]
      const eff = ts.relabel[i.pid] ?? original
      return [
        i.pid,
        typeof original === 'number' ? original : '',
        typeof original === 'number' ? treatmentByN(doc, original)?.name ?? '' : '',
        typeof eff === 'number' ? eff : '',
        typeof eff === 'number' ? treatmentByN(doc, eff)?.name ?? '' : '',
        i.corr ?? '',
      ]
    })
  const corrTab: SheetSpec = {
    name: 'Correction Log',
    rows: [
      [`${doc.trial.name} — corrections (field-logged; analysis stays honest)`],
      ['Plot #', 'Was Trt #', 'Was labelled', 'Corrected Trt #', 'Corrected treatment', 'Source'],
      ...corrRows,
    ],
    colWidths: [8, 10, 26, 14, 26, 44],
  }

  return writeXlsx([assessTab, meansTab, corrTab])
}
