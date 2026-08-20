/** Portal-side phenology: fetch site weather fixtures, run the shared engine. */
import { predictStages, fmtShort, type SiteWeather, type StagePrediction, type Crop } from '../../../shared/phenology/engine'

export type { StagePrediction }
export { fmtShort }

const cache = new Map<string, Promise<SiteWeather>>()

export function loadWeather(site: string): Promise<SiteWeather> {
  if (!cache.has(site)) {
    cache.set(
      site,
      fetch(`./weather/${site}.json`).then((r) => {
        if (!r.ok) throw new Error(`weather ${site}: ${r.status}`)
        return r.json()
      }),
    )
  }
  return cache.get(site)!
}

export interface TrialPhenology {
  site: string
  sowing: string
  crop: Crop
  variety: string
  updated: string | null
  stages: StagePrediction[]
}

export async function trialPhenology(site: string, sowing: string, crop: Crop, variety: string): Promise<TrialPhenology> {
  const weather = await loadWeather(site)
  return { site, sowing, crop, variety, updated: weather.updated, stages: predictStages({ weather, sowing, crop, variety }) }
}
