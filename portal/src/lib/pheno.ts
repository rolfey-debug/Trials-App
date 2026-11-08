/**
 * Portal adapter for the shared phenology engine (shared/phenology/engine.ts).
 * Live site_weather actuals from the database are merged over the static
 * fixture, which carries the 10-year day-of-year normals that projections
 * run on. The engine does the thermal-time staging; this file just feeds it.
 */
import {
  BASE_TEMP,
  CROP_STAGES,
  predictStages,
  registerCalibration,
  thermalSeries,
  type Crop,
  type SiteWeather,
  type StagePrediction,
} from '../../../shared/phenology/engine'
import type { Calibration, WeatherDay } from './db'

export type { StagePrediction }

/** Trial sites with a weather fixture (normals) shipped in the bundle. */
const FIXTURE_BY_SITE: Record<string, string> = {
  '00000000-0000-0000-0000-000000000011': 'matong',
  '00000000-0000-0000-0000-000000000013': 'ringwood',
}

export async function loadFixture(siteId: string): Promise<SiteWeather | null> {
  const name = FIXTURE_BY_SITE[siteId]
  if (!name) return null
  try {
    const r = await fetch(`weather/${name}.json`)
    return r.ok ? ((await r.json()) as SiteWeather) : null
  } catch {
    return null
  }
}

/** Feed org calibrations (variety → speed factor) into the engine. */
export function applyCalibrations(cals: Calibration[]) {
  for (const c of cals) if (c.variety !== '*' && c.factor) registerCalibration(c.variety, Number(c.factor))
}

export interface SeasonSummary {
  stages: StagePrediction[]
  /** where the crop sits now, e.g. "GS71–GS87" */
  currentGS: string
  currentLabel: string
  ttNow: number
  rainSinceSowing: number
  asOf: string
}

export function seasonSummary(
  fixture: SiteWeather,
  live: WeatherDay[],
  sowing: string,
  crop: string | null,
  variety: string | null
): SeasonSummary | null {
  const cropKey = (crop ?? 'wheat').toLowerCase() as Crop
  if (!(cropKey in CROP_STAGES)) return null

  // live DB rows override and extend the fixture's season actuals
  const byDate = new Map<string, readonly [number, number]>(fixture.actuals.map(([d, mn, mx]) => [d, [mn, mx] as const]))
  let last = fixture.updated ?? ''
  let rain = 0
  for (const d of live) {
    if (d.min_temp == null || d.max_temp == null) continue
    byDate.set(d.date, [Number(d.min_temp), Number(d.max_temp)] as const)
    if (d.date > last) last = d.date
    if (d.date >= sowing) rain += Number(d.rain ?? 0)
  }
  const weather: SiteWeather = {
    ...fixture,
    updated: last || null,
    actuals: [...byDate.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([d, [mn, mx]]) => [d, mn, mx]),
  }

  const stages = predictStages({ weather, sowing, crop: cropKey, variety: variety ?? undefined })
  if (!stages.length) return null
  const series = thermalSeries(weather, sowing, BASE_TEMP[cropKey])
  const atToday = series.filter((p) => p.date <= last)
  const ttNow = Math.round(atToday.length ? atToday[atToday.length - 1].cum : 0)

  const reached = stages.filter((s) => s.status === 'observed')
  const next = stages.find((s) => s.status === 'predicted')
  const currentGS = reached.length ? (next ? `${reached[reached.length - 1].code}–${next.code}` : `${reached[reached.length - 1].code}+`) : `pre-${stages[0].code}`
  const currentLabel = reached.length ? reached[reached.length - 1].label : 'before emergence'

  return { stages, currentGS, currentLabel, ttNow, rainSinceSowing: Math.round(rain * 10) / 10, asOf: last }
}
