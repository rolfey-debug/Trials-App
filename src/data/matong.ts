import matongJson from '../../fixtures/matong-trial.json'
import type { TrialDoc } from '../store/types'

/** The real Matong wheat fungicide trial (handoff fixture) — seed trial and the
 * expected output of the spray-map parser. The JSON's tuple types are widened
 * by TS's JSON inference, hence the deliberate cast. */
export const MATONG_BASE = matongJson as unknown as Omit<TrialDoc, 'id'>
