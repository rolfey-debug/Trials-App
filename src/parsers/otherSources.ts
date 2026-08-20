import { strFromU8, unzipSync } from 'fflate'
import type { CellKind, TrialDoc, Treatment } from '../store/types'
import { MATONG_BASE } from '../data/matong'

const M: Omit<TrialDoc, 'id'> = MATONG_BASE

/** ARM export (.csv study definition): expects columns including plot & treatment. */
export function parseArmCsv(data: Uint8Array, fileName = 'arm-export.csv'): { doc: TrialDoc; stats: string } {
  const text = strFromU8(data)
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (!lines.length) throw new Error('Empty file')
  const header = splitCsv(lines[0]).map((h) => h.toLowerCase())
  const pi = header.findIndex((h) => /plot/.test(h))
  const ti = header.findIndex((h) => /^trt|treatment ?#|treatment no/.test(h))
  const ni = header.findIndex((h) => /name|treatment$/.test(h))
  if (pi < 0 || ti < 0) throw new Error('Could not find plot / treatment columns')
  const cells: Record<string, CellKind> = {}
  const names: Record<number, string> = {}
  for (const line of lines.slice(1)) {
    const cols = splitCsv(line)
    const pid = Number(cols[pi])
    const trt = Number(cols[ti])
    if (Number.isFinite(pid) && Number.isFinite(trt)) {
      cells[pid] = trt
      if (ni >= 0 && cols[ni]) names[trt] = cols[ni]
    }
  }
  const byN: Record<number, number[]> = {}
  for (const [k, v] of Object.entries(cells)) if (typeof v === 'number') (byN[v] = byN[v] || []).push(Number(k))
  const treatments: Treatment[] = Object.entries(byN)
    .map(([n, plots]) => ({ n: Number(n), name: names[Number(n)] ?? `Treatment ${n}`, recipe: 'See protocol', bSpray: true, plots }))
    .sort((a, b) => a.n - b.n)
  const rows = Math.max(...Object.keys(cells).map((k) => Math.floor(Number(k) / 100)))
  const positions = Math.max(...Object.keys(cells).map((k) => Number(k) % 100))
  const doc: TrialDoc = {
    ...structuredClone(M),
    id: `arm-${Date.now()}`,
    trial: { ...structuredClone(M.trial), name: fileName.replace(/\.\w+$/, ''), grid: { rows, positions }, sourceDocument: fileName },
    treatments,
    cells,
    marginalPlots: [],
  }
  return { doc, stats: `${treatments.length} treatments · ${Object.keys(cells).length} plots` }
}

function splitCsv(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let q = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (q) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"'
        i++
      } else if (ch === '"') q = false
      else cur += ch
    } else if (ch === '"') q = true
    else if (ch === ',') {
      out.push(cur)
      cur = ''
    } else cur += ch
  }
  out.push(cur)
  return out
}

/** Protocol .docx — extract text and pull a treatment list (best-effort). */
export function parseProtocolDocx(data: Uint8Array, fileName = 'protocol.docx'): { doc: TrialDoc; stats: string } {
  const files = unzipSync(data)
  const xml = files['word/document.xml'] ? strFromU8(files['word/document.xml']) : ''
  if (!xml) throw new Error('Not a .docx document')
  const text = xml
    .replace(/<w:p[ >]/g, '\n<w:p ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  const treatments: Treatment[] = []
  for (const l of lines) {
    const m = /^(\d{1,2})[.)]?\s+(.{3,60})$/.exec(l)
    if (m && Number(m[1]) === treatments.length + 1) {
      treatments.push({ n: Number(m[1]), name: m[2].trim(), recipe: 'See protocol', bSpray: true, plots: [] })
    }
  }
  if (!treatments.length) throw new Error('No numbered treatment list found in the document')
  const title = lines[0] ?? fileName
  const doc: TrialDoc = {
    ...structuredClone(M),
    id: `protocol-${Date.now()}`,
    trial: { ...structuredClone(M.trial), name: title.slice(0, 60), sourceDocument: fileName },
    treatments,
    cells: {},
    marginalPlots: [],
  }
  return { doc, stats: `${treatments.length} treatments from the protocol text` }
}

/** Start blank: a typed-in trial, mapped later. */
export function blankTrial(name: string, treatmentCount: number, reps: number): TrialDoc {
  const treatments: Treatment[] = Array.from({ length: treatmentCount }, (_, i) => ({
    n: i + 1,
    name: i === 0 ? 'Untreated' : `Treatment ${i + 1}`,
    recipe: i === 0 ? 'Water only' : 'To be confirmed',
    bSpray: true,
    plots: [],
  }))
  return {
    ...structuredClone(M),
    id: `blank-${Date.now()}`,
    trial: {
      ...structuredClone(M.trial),
      name,
      reps,
      sourceDocument: 'Started blank in the ute',
    },
    treatments,
    cells: {},
    marginalPlots: [],
  }
}
