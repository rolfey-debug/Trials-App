/** Printable satellite map: tile arithmetic, zoom fitting, overlay content,
 * and the report's site-map section from stored plots or photo-fitted grid. */
import { bounds, fitZoom, latToY, lngToX, metresPerPixel, satelliteMapHtml } from '../portal/src/lib/sitemap'
import { siteMapHtml, type ReportData } from '../portal/src/lib/report'
import type { LiveTrial, PlotRow, TreatmentRow } from '../portal/src/lib/db'

let passed = 0
function check(name: string, cond: boolean) {
  if (!cond) {
    console.error('FAIL', name)
    process.exitCode = 1
  } else {
    passed++
  }
}

check('lng 0 is the middle tile column', lngToX(0, 4) === 8)
check('lat 0 is the middle tile row', Math.abs(latToY(0, 4) - 8) < 1e-9)
check('tile y grows southward', latToY(-35, 10) > latToY(-34, 10))
check('metres per pixel at the equator, zoom 0', Math.abs(metresPerPixel(0, 0) - 156543.03) < 0.1)
check('zoom 18 near Ringwood is about half a metre', Math.abs(metresPerPixel(-35.83, 18) - 0.484) < 0.01)

const b = bounds([{ lat: -35.828, lng: 146.2694 }, { lat: -35.8272, lng: 146.2699 }])
check('bounds', b.minLat === -35.828 && b.maxLng === 146.2699)
check('a 90 m block fits at zoom 18', fitZoom(b, 700, 500, 20) === 18)
check('a 5 km block needs a lower zoom', fitZoom(bounds([{ lat: -35.85, lng: 146.25 }, { lat: -35.80, lng: 146.30 }]), 700, 500, 20) < 15)

const ring = [{ lat: -35.8279, lng: 146.2694 }, { lat: -35.8279, lng: 146.26943 }, { lat: -35.8278, lng: 146.26943 }, { lat: -35.8278, lng: 146.2694 }]
const html = satelliteMapHtml([{ ring, fill: '#ff0000', label: '101', title: 'Plot 101' }], { pins: [{ at: { lat: -35.8275, lng: 146.2696 }, label: 'Gate' }], lines: [{ pts: [{ lat: -35.828, lng: 146.2693 }, { lat: -35.827, lng: 146.27 }], label: 'Track' }], tileUrl: (z, x, y) => `tile://${z}/${x}/${y}` })
check('tiles come from the override', /src="tile:\/\/18\/\d+\/\d+"/.test(html))
check('polygon, rotated label and title', html.includes('<polygon points=') && /rotate\(-?\d+\.\d\)/.test(html) && html.includes('<title>Plot 101</title>') && html.includes('>101</text>'))
check('pin and line drawn', html.includes('>Gate</text>') && html.includes('<polyline') && html.includes('>Track</text>'))
check('scale bar, north arrow and attribution', / m<\/text>/.test(html) && html.includes('>N</text>') && html.includes('Esri'))
check('escapes', satelliteMapHtml([{ ring, fill: '"><b>', label: '<x>' }], { tileUrl: () => 't' }).includes('&lt;x&gt;') && !satelliteMapHtml([{ ring, fill: '"><b>' }], { tileUrl: () => 't' }).includes('"><b>'))
check('nothing to draw gives nothing', satelliteMapHtml([]) === '')

// report section
const trts: TreatmentRow[] = [
  { n: 1, name: 'Untreated', recipe: 'Untreated', b_spray: false, components: { plots: [101, 202, 303] } },
  { n: 2, name: 'Prosaro', recipe: 'A: Prosaro', b_spray: false, components: { plots: [102, 203, 301] } },
  { n: 3, name: 'Aviator', recipe: 'A: Aviator', b_spray: false, components: { plots: [103, 201, 302] } },
]
const trial: LiveTrial = { id: 't', site_id: 's', client_id: null, approved_by: null, group_id: null, protocol_id: null, name: 'Map Test', season: 2026, status: 'active', trial_type: 'plot', crop: 'Wheat', variety: null, sown_date: null, aim: null, design: { type: 'RCBD', reps: 3, grid: { rows: 3, positions: 3 }, marginalPlots: [104] }, spraying: null, site: { id: 's', property: 'Glenview', town: 'Matong', lat: -34.8, lng: 146.9, boundary_geojson: null, planned: false }, client: null, layout: null, scores: 0, plotsScored: 0, sprayTicks: 0, lastActivity: null }
const base: ReportData = { trial, treatments: trts, scores: [], measures: new Map() }

const pinOnly = siteMapHtml(base)
check('no plots and no photos: site pin only', pinOnly.includes('>Site</text>') && pinOnly.includes('Site pin only'))

// a 3 × 3 grid, 2 m across positions (east) and 12 m along rows (south), with ±2 m noise
const kx = 111320 * Math.cos((-34.8 * Math.PI) / 180)
let seed = 7
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648 - 0.5) * 4
const photoPoints: ReportData['photoPoints'] = []
for (let row = 1; row <= 3; row++) for (let pos = 1; pos <= 3; pos++) for (let k = 0; k < 4; k++) photoPoints.push({ plot: row * 100 + pos, lat: -34.8 - ((row - 1) * 12 + rnd()) / 110574, lng: 146.9 + ((pos - 1) * 2 + rnd()) / kx })
const fitted = siteMapHtml({ ...base, photoPoints })
check('photo-fitted grid draws every plot including the marginal one', (fitted.match(/<title>Plot /g) ?? []).length === 10 && fitted.includes('<title>Plot 104 · plot</title>'))
check('fitted caption says how many photos and that it is not surveyed', /fitted to the GPS positions of 36 plot photos/.test(fitted) && fitted.includes('not surveyed'))
check('untreated plots are left clear', fitted.includes('fill="#ffffff"'))
check('plot title names the treatment', fitted.includes('<title>Plot 102 · T2 Prosaro</title>'))
check('blind map hides names', !siteMapHtml({ ...base, photoPoints, options: { blind: true } }).includes('Prosaro'))

const plots: PlotRow[] = [101, 102].map((p) => ({ trial_id: 't', plot: p, row: 1, position: p % 100, kind: 'plot', treatment: p === 101 ? 1 : 2, rep: 1, geojson: { type: 'Polygon', coordinates: [[[146.9 + (p % 100) * 0.00002, -34.8], [146.9 + (p % 100) * 0.00002 + 0.00002, -34.8], [146.9 + (p % 100) * 0.00002 + 0.00002, -34.8001], [146.9 + (p % 100) * 0.00002, -34.8001], [146.9 + (p % 100) * 0.00002, -34.8]]] }, area_m2: 24, planned: true }))
const placed = siteMapHtml({ ...base, plots, photoPoints, features: [{ id: 'f', site_id: 's', kind: 'gate', name: null, geojson: { type: 'Point', coordinates: [146.9001, -34.8002] }, props: {}, created_at: '' }] })
check('stored plots win over the photo fit', placed.includes('as placed in the site planner') && (placed.match(/<title>Plot /g) ?? []).length === 2)
check('point feature becomes a pin', placed.includes('>gate</text>'))
console.log(`sitemap: ${passed} checks passed`)
