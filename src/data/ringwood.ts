import ringwoodJson from '../../fixtures/ringwood-trial.json'
import type { TrialDoc } from '../store/types'

/** The real Ringwood (Corowa) wheat fungicide trial — parsed from
 * Ringwood_Fungicide_trial_2026.xlsx. Row-blocked RCB: rep 1 rows 1–4,
 * rep 2 rows 6–9, rep 3 rows 9–12; 68 clean plots + 4 marginals carry
 * the 72 treatment plots. */
export const RINGWOOD_BASE = ringwoodJson as unknown as Omit<TrialDoc, 'id'>
