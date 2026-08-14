/**
 * Seeded fixture data, ported from the design handoff prototype
 * (mirrors docs/handoff-office/fixtures/trials.json).
 */

export interface DashTrial {
  name: string
  client: string
  crop: string
  type: string
  status: 'Draft' | 'In review' | 'Approved' | 'Active' | 'Complete'
  season: string
  updated: string
  pct?: number
  main: string
  sub?: string
  live?: boolean
  review?: boolean
}

export const DASH_TRIALS: DashTrial[] = [
  { name: 'Matong Wheat Fungicide Demo', client: 'Doyle Bros · ‘Glenview’, Matong', crop: 'Wheat · Scepter', type: 'FUNGICIDE', status: 'Active', season: 'W2026', updated: '24 min ago', pct: 68, main: 'Assessment 2 of 4 · 68% scored', sub: '2 phones in field · Timing B spray due Fri', live: true },
  { name: 'Ringwood Wheat Fungicide', client: '‘Ringwood’, Corowa', crop: 'Wheat', type: 'FUNGICIDE', status: 'Active', season: 'W2026', updated: 'Today', main: 'App A pending · 24 trts × 3 reps · mix plan loaded', sub: 'Sequential A + B · experimentals G295 / Vimoy / CUF37', live: true },
  { name: 'Coolamon Canola Sclerotinia Timing', client: 'A & J Pertzel · Coolamon', crop: 'Canola · 45Y28', type: 'FUNGICIDE', status: 'Active', season: 'W2026', updated: '2 h ago', pct: 33, main: 'Assessment 1 of 3 · bloom scoring', sub: 'Synced 2 h ago · 1 phone' },
  { name: 'Ganmain Barley Net Blotch', client: 'L & K Hardy · ‘Hillview’, Ganmain', crop: 'Barley · Spartacus CL', type: 'FUNGICIDE', status: 'In review', season: 'W2026', updated: 'Yesterday', main: 'Submitted Mon · awaiting I. McPherson', review: true },
  { name: 'Ardlethan Faba Chocolate Spot', client: '‘Mirrool Creek’ · Ardlethan', crop: 'Faba bean · Amberley', type: 'FUNGICIDE', status: 'Approved', season: 'W2026', updated: '3 d ago', main: 'Locked · first spray booked 15 Aug' },
  { name: 'Wagga Aphid Threshold Screen', client: 'Kooringal Ag · Wagga Wagga', crop: 'Wheat · Sunmaster', type: 'INSECTICIDE', status: 'Draft', season: 'W2026', updated: '5 d ago', main: 'Treatments 60% entered' },
  { name: 'Junee Ryegrass Pre-em Screen', client: '‘Illabo Park’ · Junee', crop: 'Wheat · LRPB Lancer', type: 'HERBICIDE', status: 'Draft', season: 'W2027', updated: '1 w ago', main: 'Aim & site entered' },
  { name: 'Matong Wheat Fungicide Demo 2025', client: 'Doyle Bros · ‘Glenview’, Matong', crop: 'Wheat · Scepter', type: 'FUNGICIDE', status: 'Complete', season: 'W2025', updated: '12 Jan', main: 'Report sent · ranked by yield' },
  { name: 'Coolamon Broadleaf Herbicide', client: 'A & J Pertzel · Coolamon', crop: 'Canola · 44Y27', type: 'HERBICIDE', status: 'Complete', season: 'W2025', updated: '20 Dec', main: 'Report sent' },
]

export const STATUS_CHIP: Record<DashTrial['status'], { bg: string; fg: string; bd: string }> = {
  Draft: { bg: '#F0F1F0', fg: '#6B6D6B', bd: '#E0E1E0' },
  'In review': { bg: '#FFFFFF', fg: '#141414', bd: '#B9BBB9' },
  Approved: { bg: '#FFFFFF', fg: '#00623C', bd: '#9CC9B4' },
  Active: { bg: '#007749', fg: '#FFFFFF', bd: '#007749' },
  Complete: { bg: '#F0F1F0', fg: '#8A8C8A', bd: '#E4E4E6' },
}

export interface Treatment {
  name: string
  exp?: boolean
  note?: string
  lines: Array<[name: string, rate: string, tim: string]>
  timing: string
  fromPicker?: boolean
}

export const BASE_TREATMENTS: Treatment[] = [
  { name: 'Untreated control', lines: [], timing: '—' },
  { name: 'Prosaro — single spray', lines: [['Prosaro 420 SC', '300 mL/ha', 'A']], timing: 'A' },
  { name: 'Aviator Xpro — timing A', lines: [['Aviator Xpro', '500 mL/ha', 'A']], timing: 'A' },
  { name: 'Aviator Xpro — timing B', lines: [['Aviator Xpro', '500 mL/ha', 'B']], timing: 'B' },
  { name: 'Two-spray program', lines: [['Elatus Ace', '400 mL/ha', 'A'], ['Prosaro 420 SC', '300 mL/ha', 'B']], timing: 'A + B' },
  { name: 'Maxentis — single spray', lines: [['Maxentis', '750 mL/ha', 'A']], timing: 'A' },
  { name: 'AGV-X24 — candidate SDHI', exp: true, note: 'Evaluation sample — not for sale', lines: [['AGV-X24', '400 mL/ha', 'A']], timing: 'A' },
  { name: 'District practice', lines: [['Tilt 250 EC', '500 mL/ha', 'A']], timing: 'A' },
]

export const ASSESS_ROWS_WIZ = [
  { a: 'A1', stage: 'GS30–31', what: 'Disease baseline — stripe rust & septoria incidence', method: '% plants infected · 10 plants/plot', date: '26 Jun' },
  { a: 'A2', stage: 'GS39', what: 'Severity on top 3 leaves + NDVI', method: '0–100% leaf area · Greenseeker pass', date: '10 Aug' },
  { a: 'A3', stage: 'GS65', what: 'Green leaf retention · phytotoxicity check', method: '0–9 scale · photos per plot', date: '15 Sep' },
  { a: 'A4', stage: 'Harvest', what: 'Yield, protein, screenings', method: 'Plot harvester + grain samples', date: '8 Dec' },
]

export interface DocFile {
  ext: 'PDF' | 'XLSX' | 'DOCX'
  name: string
  size: string
  st: 'parsed' | 'parsing' | 'error'
  text: string
  kind: 'pdf' | 'xlsx' | 'docx'
  page: string
  hi?: boolean
}

export const DOC_FILES: DocFile[] = [
  { ext: 'PDF', name: 'Matong Demo Protocol v3.pdf', size: '1.2 MB', st: 'parsed', text: 'Parsed — 8 treatments found → used in wizard', kind: 'pdf', page: 'p 2 / 6', hi: true },
  { ext: 'XLSX', name: 'Spray map W2026.xlsx', size: '86 KB', st: 'parsed', text: 'Parsed — 36-plot layout matched to randomisation', kind: 'xlsx', page: 'Sheet 1 · Layout' },
  { ext: 'XLSX', name: 'Mixing plan — Timing A.xlsx', size: '64 KB', st: 'parsing', text: 'Parsing — reading mix rates…', kind: 'xlsx', page: 'Sheet 1 · Mix' },
  { ext: 'DOCX', name: 'Field day run sheet.docx', size: '310 KB', st: 'error', text: 'Couldn’t read tables — open & mark up', kind: 'docx', page: 'p 1 / 3' },
]

export const EXT_CHIP: Record<DocFile['ext'], { bg: string; fg: string }> = {
  PDF: { bg: '#141414', fg: '#fff' },
  XLSX: { bg: '#E3F1EA', fg: '#00623C' },
  DOCX: { bg: '#F0F1F0', fg: '#6B6D6B' },
}

export const SITE_ROWS_WIZ = [
  { l: 'GROWER', v: 'Doyle Bros — ‘Glenview’' },
  { l: 'LOCATION', v: 'Matong NSW · −34.768, 146.929' },
  { l: 'CROP', v: 'Wheat cv. Scepter · sown 12 May' },
  { l: 'PADDOCK', v: 'Church block · red-brown earth' },
  { l: 'PLOTS', v: '2 m × 10 m · 32 + 4 spare' },
  { l: 'PREV CROP', v: 'Canola 2025 · stubble retained' },
]

export const SITE_ROWS_REV = [
  { l: 'GROWER', v: 'L & K Hardy — ‘Hillview’' },
  { l: 'LOCATION', v: 'Ganmain NSW · −34.792, 147.041' },
  { l: 'CROP', v: 'Barley cv. Spartacus CL · sown 8 May @ 70 kg/ha' },
  { l: 'PADDOCK', v: 'Racecourse block · pH 5.4 (CaCl₂)' },
  { l: 'PLOTS', v: '2 m × 10 m · 32 + 4 spare' },
  { l: 'PREV CROP', v: 'Wheat 2025 — stubble retained, NFNB carryover risk' },
]

export const ASSESS_ROWS_REV = [
  { a: 'A1', stage: 'GS37–39', what: 'Net blotch baseline — % leaf area, top 3 leaves', date: '18 Aug', status: 'Booked', stFg: '#007749' },
  { a: 'A2', stage: 'GS55 +10d', what: 'Severity + green leaf retention', date: '14 Sep', status: '—', stFg: '#B8BAB8' },
  { a: 'A3', stage: 'GS71', what: 'Final severity · phytotoxicity check', date: '28 Sep', status: '—', stFg: '#B8BAB8' },
  { a: 'A4', stage: 'Harvest', what: 'Yield, test weight, retention & screenings', date: 'w/c 24 Nov', status: '—', stFg: '#B8BAB8' },
]

export const REV_DOCS = [
  { ext: 'PDF' as const, name: 'Net blotch demo protocol.pdf', st: 'Parsed — 8 treatments → wizard' },
  { ext: 'XLSX' as const, name: 'Spray map — Hillview.xlsx', st: 'Parsed — layout matched' },
  { ext: 'PDF' as const, name: 'Chem labels pack.pdf', st: 'Stored — 6 labels attached' },
]

export const BASE_LOG = [
  { when: 'Mon 10 Aug · 9:41', what: 'Submitted for approval → Ian McPherson', who: 'Sam Kelleher' },
  { when: 'Mon 10 Aug · 9:38', what: 'Randomisation generated — RCBD · 4 reps · seed #A7F3', who: 'Sam Kelleher' },
  { when: 'Sun 9 Aug · 16:12', what: '8 treatments imported from “Net blotch demo protocol.pdf” · 2 rates edited', who: 'Sam Kelleher' },
  { when: 'Sun 9 Aug · 15:47', what: 'Site added — ‘Hillview’, Ganmain · GPS pinned', who: 'Sam Kelleher' },
  { when: 'Sun 9 Aug · 15:30', what: 'Trial created from template “Cereal fungicide demo”', who: 'Sam Kelleher' },
]

export const TRIAL_TYPES: Array<[name: string, desc: string, meta: string]> = [
  ['Demonstration', 'Products side by side for growers to walk — light or no replication.', 'field days · visual scoring'],
  ['Plot trial', 'Replicated small plots with stats — the standard for product comparisons.', 'RCBD · ranked by yield'],
  ['Paddock scale', 'Grower-run strips across the paddock — scored by header and imagery.', 'strips · yield maps · drone'],
]

export const DESIGN_NOTES: Record<string, (n: number) => string> = {
  RCBD: () => 'Complete blocks — every treatment appears once per rep, order shuffled within each range. The workhorse for product demos.',
  'Latin square': (n) => `Each treatment once per row AND once per range — controls fertility gradients both ways. Needs ${n} × ${n} = ${n * n} plots.`,
  'Split-plot': () => 'Main plots split by application timing, products randomised within — fewer sprayer turns, right for timing comparisons.',
}
