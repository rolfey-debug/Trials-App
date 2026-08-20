/** Phenology engine tests against the real SILO fixtures. */
import { readFileSync } from 'node:fs'
import {
  predictStages,
  predictStage,
  thermalSeries,
  registerCalibration,
  type SiteWeather,
} from '../shared/phenology/engine'

let passed = 0
function check(name: string, cond: boolean) {
  if (!cond) {
    console.error(`FAIL ${name}`)
    process.exit(1)
  }
  console.log(`ok ${name}`)
  passed++
}

const load = (site: string): SiteWeather =>
  JSON.parse(readFileSync(new URL(`../shared/phenology/weather/${site}.json`, import.meta.url), 'utf8'))

const matong = load('matong')
const ganmain = load('ganmain')

check('fixtures: matong has season actuals and full-year normals', matong.actuals.length > 100 && matong.normals.length === 366)
check('fixtures: coordinates match the trial sites', Math.abs(matong.lat + 34.768) < 1e-6 && Math.abs(ganmain.lon - 147.041) < 1e-6)

{
  const series = thermalSeries(matong, '2026-05-12', 0)
  check('thermal series: cumulative and monotonic', series.length > 200 && series.every((p, i) => i === 0 || p.cum >= series[i - 1].cum))
}

{
  const stages = predictStages({ weather: matong, sowing: '2026-05-12', crop: 'wheat', variety: 'Scepter' })
  check('wheat: full stage ladder predicted', stages.length >= 9)
  check('wheat: stages strictly ordered in time', stages.every((s, i) => i === 0 || s.date >= stages[i - 1].date))
  const gs31 = stages.find((s) => s.code === 'GS31')!
  const gs39 = stages.find((s) => s.code === 'GS39')!
  check('wheat: GS31 lands mid-winter (Jul–Aug)', gs31.date >= '2026-07-01' && gs31.date <= '2026-08-31')
  check('wheat: GS39 lands late winter/early spring (Aug–Sep)', gs39.date >= '2026-08-01' && gs39.date <= '2026-09-30')
  check('wheat: windows bracket the estimate', gs39.window[0] <= gs39.date && gs39.date <= gs39.window[1])
  check(
    'wheat: observed/predicted split at the last SILO day',
    stages.every((s) => (s.date <= matong.updated! ? s.status === 'observed' : s.status === 'predicted')),
  )
  const again = predictStages({ weather: matong, sowing: '2026-05-12', crop: 'wheat', variety: 'Scepter' })
  check('deterministic', JSON.stringify(stages) === JSON.stringify(again))
}

{
  const barley = predictStage({ weather: ganmain, sowing: '2026-05-08', crop: 'barley', variety: 'Spartacus CL' }, 'GS55')!
  check('barley: Ganmain GS55 predicted in Aug–Sep', barley.date >= '2026-08-01' && barley.date <= '2026-09-30')
  const wheatSame = predictStage({ weather: ganmain, sowing: '2026-05-08', crop: 'wheat' }, 'GS55')!
  check('barley (quick) reaches GS55 before wheat default', barley.date < wheatSame.date)
}

{
  const before = predictStage({ weather: matong, sowing: '2026-05-12', crop: 'wheat', variety: 'TestVar' }, 'GS39')!
  registerCalibration('TestVar', 0.85)
  const after = predictStage({ weather: matong, sowing: '2026-05-12', crop: 'wheat', variety: 'TestVar' }, 'GS39')!
  check('org calibration overrides defaults', after.date < before.date)
}

console.log(`\n${passed} phenology checks passed`)
