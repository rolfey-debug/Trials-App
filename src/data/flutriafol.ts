import flutriJson from '../../fixtures/ringwood-flutriafol.json'
import type { TrialDoc } from '../store/types'

/** The flutriafol breakdown block on the western edge of the Ringwood site —
 * Scepter and Beckom strips, 8 rates (0–800 ml/ha) along the plot positions.
 * Outside the fungicide trial; shows where flutriafol protection breaks down
 * (31 Aug 2026: rust at 300 ml, clean at 400). */
export const FLUTRI_BASE = flutriJson as unknown as Omit<TrialDoc, 'id'>
