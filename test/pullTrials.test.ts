/** Office → phone mapping: a builder-made trial and a workbook-shaped one
 * both become a usable TrialDoc; stored plot polygons become a locate grid. */
import { measureLibFor, plotList, storedPlotsFrom, trialDocFromOffice, isUuid, type OfficeMeasure, type OfficeTrial } from '../src/lib/pullTrials'

let passed = 0
function check(name: string, cond: boolean) {
  if (!cond) {
    console.error('FAIL', name)
    process.exitCode = 1
  } else {
    passed++
  }
}

const lib: OfficeMeasure[] = [
  { key: 'rust_plot', label: 'Stripe rust % whole plot', unit: '%', group_key: 'disease', canonical: null },
  { key: 'rust', label: 'Stripe rust %', unit: '%', group_key: 'disease', canonical: 'rust_plot' },
  { key: 'ryegrass_m2', label: 'Annual ryegrass plants /m²', unit: 'plants/m²', group_key: 'weed', canonical: null },
  { key: 'vigour', label: 'Crop vigour score 0 to 10', unit: '0 to 10', group_key: 'crop', canonical: null },
  { key: 'yield_t_ha', label: 'Grain yield', unit: 't/ha', group_key: 'yield', canonical: null },
]

const builder: OfficeTrial = {
  id: '6f1c2a40-1b2c-4d5e-8f90-123456789abc',
  name: 'Lockhart Canola Fungicide 2027',
  season: 2027,
  status: 'approved',
  trial_type: 'plot',
  crop: 'Canola',
  variety: 'Hyola 970CL',
  sown_date: '2027-04-20',
  aim: 'Compare blackleg programs.',
  design: { type: 'RCBD', reps: 3, blocking: 'row', grid: { rows: 3, positions: 4 }, plot: { widthM: 2, lengthM: 10, areaM2: 20 }, sparePlots: [104, 204, 304], notes: ['seed A1B2'] },
  spraying: null,
  sites: { property: 'Hillview', town: 'Lockhart', paddock: 'Back 40', soil: 'Red loam', lat: -35.3, lng: 146.7 },
  clients: { name: 'J. Citizen', contact: { phone: '0400 000 000' } },
  treatments: [
    { n: 1, name: 'Untreated', recipe: 'Untreated', b_spray: false, components: { plots: [101, 202, 303], plotsByRep: { '1': 101, '2': 202, '3': 303 } } },
    { n: 2, name: 'Prosaro', recipe: 'A: Prosaro 300 mL/ha', b_spray: false, components: { plots: [102, 203, 301], plotsByRep: { '1': 102, '2': 203, '3': 301 } } },
    { n: 3, name: 'Aviator', recipe: 'A: Aviator 500 mL/ha · B: Aviator 500 mL/ha', b_spray: true, components: { plots: [103, 201, 302], plotsByRep: { '1': 103, '2': 201, '3': 302 } } },
  ],
  assessments: [
    { n: 2, timing: 'harvest', measures: ['yield_t_ha'], blind: false },
    { n: 1, timing: 'GS39', measures: ['rust_plot', 'vigour'], blind: true },
  ],
}

const doc = trialDocFromOffice(builder, lib)
check('id is the uuid', doc.id === builder.id && isUuid(doc.id))
check('grid from design', doc.trial.grid.rows === 3 && doc.trial.grid.positions === 4)
check('reps and design', doc.trial.reps === 3 && doc.trial.design === 'RCBD' && doc.trial.blocking === 'row')
check('rep bands from plotsByRep', JSON.stringify(doc.trial.repBands) === JSON.stringify({ '1': [1], '2': [2], '3': [3] }))
check('cells carry treatments', doc.cells['101'] === 1 && doc.cells['203'] === 2 && doc.cells['302'] === 3)
check('spare cells', doc.cells['104'] === 'spare' && doc.cells['304'] === 'spare')
check('treatment plots sorted', doc.treatments[1].plots.join() === '102,203,301' && doc.treatments[2].bSpray === true)
check('spray volume from water rate and area', doc.trial.waterRateLPerHa === 100 && doc.trial.sprayVolumePerPlotMl === 200)
check('batch volume covers reps with overage', doc.trial.batchVolumeL === 0.78)
check('measures grouped: planned first', doc.measures.disease[0][0] === 'rust_plot' && doc.measures.crop[0][0] === 'vigour')
check('yield lands in crop tab', doc.measures.crop.some((m) => m[0] === 'yield_t_ha'))
check('alias keys left out of the rest', !doc.measures.disease.some((m) => m[0] === 'rust'))
check('weeds from the library rest', doc.measures.weeds[0][0] === 'ryegrass_m2')
check('default active = first assessment', doc.measures.defaultActive.join() === 'rust_plot,vigour')
check('aim in notes', doc.notes?.[0] === 'Aim: Compare blackleg programs.' && doc.notes?.[1] === 'seed A1B2')

// Workbook-shaped record: plots stored as rep → plot objects, reserves, spraying block.
const workbook: OfficeTrial = {
  ...builder,
  id: 'a1a1a1a1-b2b2-4c3c-8d4d-e5e5e5e5e5e5',
  name: 'Matong style',
  design: { type: 'RCBD', reps: 3, grid: { rows: 12, positions: 8 }, plot: { widthM: 2, lengthM: 12, areaM2: 24 }, reservePlots: [703, 803], marginalPlots: [702, 802] },
  spraying: { waterRateLPerHa: 100, timings: { A: { applied: '2026-08-07' }, B: { due: 'GS39' } } },
  treatments: [
    { n: 1, name: 'Untreated', recipe: 'Water only', b_spray: false, components: { plots: { '1': 101, '2': 805, '3': 1007 } } },
    { n: 2, name: 'Aviator Xpro', recipe: 'A', b_spray: true, components: { plots: { '2': 205, '3': 906 }, perBatchMl: [6.3] } },
  ],
  assessments: [],
}
const wd = trialDocFromOffice(workbook, lib)
check('object plots become a list', wd.treatments[0].plots.join() === '101,805,1007' && plotList(workbook.treatments[1].components).join() === '205,906')
check('reserve cells', wd.cells['703'] === 'reserve' && wd.marginalPlots.join() === '702,802')
check('rep bands fall back to row blocks', JSON.stringify(wd.trial.repBands) === JSON.stringify({ '1': [1, 2, 3, 4], '2': [5, 6, 7, 8], '3': [9, 10, 11, 12] }))
check('timings map applied → sprayed and due', wd.trial.timings.A.sprayed === '2026-08-07' && wd.trial.timings.B.due === 'GS39')
check('perBatchMl carried', wd.treatments[1].perBatchMl?.[0] === 6.3)
check('no assessments: default active from library', wd.measures.defaultActive.length === 1 && wd.measures.defaultActive[0] === 'rust_plot')
check('measureLibFor alone', measureLibFor(workbook, lib).crop.length === 2)

// Stored plots: a 2 × 12 m polygon near Junee Reefs.
const stored = storedPlotsFrom([
  { plot: 101, geojson: { type: 'Polygon', coordinates: [[[147.50966, -34.71992], [147.50968, -34.71992], [147.50968, -34.71981], [147.50966, -34.71981], [147.50966, -34.71992]]] } },
  { plot: 102, geojson: null },
])
check('one polygon kept, null skipped', stored.length === 1 && stored[0].pid === 101)
check('corners are lat/lng', stored[0].corners.length === 4 && Math.abs(stored[0].corners[0].lat + 34.71992) < 1e-9 && Math.abs(stored[0].corners[0].lng - 147.50966) < 1e-9)
check('centre inside', stored[0].centre.lat > -34.71992 && stored[0].centre.lat < -34.71981)

console.log(`pullTrials: ${passed} checks passed`)
