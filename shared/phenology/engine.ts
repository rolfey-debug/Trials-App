/**
 * Phenology engine — predicts crop growth stages from sowing date, variety
 * and daily temperature (SILO actuals to date, then 10-year day-of-year
 * normals) using accumulated thermal time (growing degree days).
 *
 * Calibration: the thermal-time targets below are DEFAULTS from published
 * cereal development work. They are deliberately structured so AGnVET's own
 * historical stage observations can replace them per variety — see
 * `VARIETY_FACTORS` and `registerCalibration()`.
 */

export interface SiteWeather {
  site: string
  lat: number
  lon: number
  updated: string | null
  actuals: Array<[iso: string, minT: number, maxT: number]>
  normals: Array<[doy: number, minT: number, maxT: number]>
}

export interface StageDef {
  code: string
  label: string
  /** thermal time from sowing, °C·days above base */
  tt: number
}

export type Crop = 'wheat' | 'barley' | 'canola'

/** Base temperature per crop for GDD accumulation. */
export const BASE_TEMP: Record<Crop, number> = { wheat: 0, barley: 0, canola: 0 }

/** Default thermal-time targets (base 0 °C) — replace with org calibration. */
export const CROP_STAGES: Record<Crop, StageDef[]> = {
  wheat: [
    { code: 'GS10', label: 'Emergence', tt: 130 },
    { code: 'GS30', label: 'Start stem elongation', tt: 750 },
    { code: 'GS31', label: 'First node', tt: 850 },
    { code: 'GS32', label: 'Second node', tt: 950 },
    { code: 'GS39', label: 'Flag leaf', tt: 1200 },
    { code: 'GS49', label: 'First awns', tt: 1350 },
    { code: 'GS55', label: 'Half ear emerged', tt: 1450 },
    { code: 'GS65', label: 'Flowering', tt: 1600 },
    { code: 'GS71', label: 'Grain watery ripe', tt: 1750 },
    { code: 'GS87', label: 'Hard dough', tt: 2100 },
  ],
  barley: [
    { code: 'GS10', label: 'Emergence', tt: 120 },
    { code: 'GS30', label: 'Start stem elongation', tt: 700 },
    { code: 'GS31', label: 'First node', tt: 790 },
    { code: 'GS32', label: 'Second node', tt: 880 },
    { code: 'GS39', label: 'Flag leaf', tt: 1120 },
    { code: 'GS49', label: 'First awns', tt: 1260 },
    { code: 'GS55', label: 'Half ear emerged', tt: 1350 },
    { code: 'GS65', label: 'Flowering', tt: 1500 },
    { code: 'GS71', label: 'Grain watery ripe', tt: 1650 },
    { code: 'GS87', label: 'Hard dough', tt: 2000 },
  ],
  canola: [
    { code: 'CE', label: 'Emergence', tt: 150 },
    { code: 'BUD', label: 'Bud visible', tt: 900 },
    { code: 'FLW', label: 'Start flowering', tt: 1250 },
    { code: '50F', label: '50% bloom', tt: 1450 },
    { code: 'POD', label: 'Pod fill', tt: 1750 },
    { code: 'MAT', label: 'Maturity', tt: 2300 },
  ],
}

/**
 * Relative development speed by variety (1 = crop default; <1 = quicker).
 * Defaults from public maturity ratings — the slot AGnVET's calibration fills.
 */
export const VARIETY_FACTORS: Record<string, number> = {
  scepter: 1.0, // mid-fast spring wheat
  sunmaster: 1.03,
  'lrpb lancer': 1.06, // mid-slow
  'spartacus cl': 0.94, // quick barley
  '45y28': 1.0,
}

const calibrations = new Map<string, number>()
/** Load org-specific calibration (variety → speed factor) at runtime. */
export function registerCalibration(variety: string, factor: number) {
  calibrations.set(variety.toLowerCase(), factor)
}

export interface StagePrediction {
  code: string
  label: string
  tt: number
  date: string
  /** ±window from thermal-time uncertainty (±7%) */
  window: [string, string]
  /** 'observed' = reached within the actuals record; 'predicted' = projected on normals */
  status: 'observed' | 'predicted'
}

const isoAdd = (iso: string, days: number) => {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
const doyOf = (iso: string) => {
  const d = new Date(iso + 'T00:00:00Z')
  return Math.floor((d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 0)) / 86400000)
}

/**
 * Daily GDD series from sowing: actuals while available, then day-of-year
 * normals. Returns cumulative thermal time per day for `horizon` days.
 */
export function thermalSeries(weather: SiteWeather, sowing: string, base: number, horizon = 300): Array<{ date: string; cum: number }> {
  const byDate = new Map(weather.actuals.map(([d, mn, mx]) => [d, [mn, mx] as const]))
  const byDoy = new Map(weather.normals.map(([k, mn, mx]) => [k, [mn, mx] as const]))
  const out: Array<{ date: string; cum: number }> = []
  let cum = 0
  for (let i = 0; i < horizon; i++) {
    const date = isoAdd(sowing, i)
    const t = byDate.get(date) ?? byDoy.get(Math.min(doyOf(date), 365)) ?? byDoy.get(1)
    if (!t) break
    const gdd = Math.max(0, (t[0] + t[1]) / 2 - base)
    cum += gdd
    out.push({ date, cum })
  }
  return out
}

export interface PredictOptions {
  weather: SiteWeather
  sowing: string // ISO date
  crop: Crop
  variety?: string
}

export function predictStages({ weather, sowing, crop, variety }: PredictOptions): StagePrediction[] {
  const factor = (variety && (calibrations.get(variety.toLowerCase()) ?? VARIETY_FACTORS[variety.toLowerCase()])) || 1
  const series = thermalSeries(weather, sowing, BASE_TEMP[crop])
  const lastActual = weather.updated
  const dateAt = (tt: number): string | null => {
    for (const p of series) if (p.cum >= tt) return p.date
    return null
  }
  const out: StagePrediction[] = []
  for (const st of CROP_STAGES[crop]) {
    const tt = st.tt * factor
    const date = dateAt(tt)
    if (!date) continue
    const lo = dateAt(tt * 0.93) ?? date
    const hi = dateAt(tt * 1.07) ?? series[series.length - 1].date
    out.push({
      code: st.code,
      label: st.label,
      tt: Math.round(tt),
      date,
      window: [lo, hi],
      status: lastActual && date <= lastActual ? 'observed' : 'predicted',
    })
  }
  return out
}

/** Convenience: the prediction for one stage code, e.g. 'GS39'. */
export function predictStage(opts: PredictOptions, code: string): StagePrediction | undefined {
  return predictStages(opts).find((s) => s.code === code)
}

export const fmtShort = (iso: string) => {
  const d = new Date(iso + 'T00:00:00Z')
  return `${d.getUTCDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()]}`
}
