/** Office-side export: everything the phones have synced for one trial,
 * straight from Postgres to a real .xlsx — no phone required. Reuses the
 * field app's pure spreadsheet writer. */
import { downloadBlob, writeXlsx, type SheetSpec } from '../../../src/exports/xlsxWrite'
import { select } from '../../../shared/supa'
import type { LiveTrial } from './db'

interface ScoreRow {
  plot: number
  assessment: number
  measure: string
  value: number
  note: string | null
  recorded_at: string
}
interface OpRow {
  timing: string | null
  kind: string
  detail: { mixLog?: Record<string, string>; sprayLog?: Record<string, string> } | null
  conditions: Record<string, string | number> | null
  performed_at: string
}
interface PhotoRow {
  plot: number
  storage_path: string
  taken_at: string
  meta: { flagged?: boolean; trt?: number; label?: string } | null
}

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''

export async function exportTrialData(trial: LiveTrial, token: string): Promise<'ok' | 'empty' | 'failed'> {
  const filter = `trial_id=eq.${trial.id}`
  const [scores, ops, photos] = await Promise.all([
    select<ScoreRow>('scores', `select=plot,assessment,measure,value,note,recorded_at&${filter}&order=assessment.asc,plot.asc,measure.asc`, token),
    select<OpRow>('operations', `select=timing,kind,detail,conditions,performed_at&${filter}&order=performed_at.asc`, token),
    select<PhotoRow>('photos', `select=plot,storage_path,taken_at,meta&${filter}&order=plot.asc`, token),
  ])
  if (scores === null) return 'failed'
  if (!scores.length && !(ops ?? []).length && !(photos ?? []).length) return 'empty'

  const sheets: SheetSpec[] = [
    {
      name: 'Scores',
      colWidths: [8, 12, 16, 10, 34, 18],
      rows: [
        ['Plot', 'Assessment', 'Measure', 'Value', 'Note', 'Recorded'],
        ...scores.map((s): (string | number | null)[] => [s.plot, s.assessment, s.measure, s.value, s.note, when(s.recorded_at)]),
      ],
    },
  ]

  const sprayRows: (string | number | null)[][] = []
  const condRows: (string | number | null)[][] = []
  for (const o of ops ?? []) {
    const trts = new Set([...Object.keys(o.detail?.mixLog ?? {}), ...Object.keys(o.detail?.sprayLog ?? {})])
    for (const t of [...trts].map(Number).sort((a, b) => a - b)) {
      sprayRows.push([o.timing ?? '', t, o.detail?.mixLog?.[t] ?? '', o.detail?.sprayLog?.[t] ?? ''])
    }
    for (const [k, v] of Object.entries(o.conditions ?? {})) condRows.push([o.timing ?? '', k, v])
  }
  if (sprayRows.length)
    sheets.push({ name: 'Spray records', colWidths: [8, 8, 22, 22], rows: [['Timing', 'Trt #', 'Mixed', 'Sprayed'], ...sprayRows] })
  if (condRows.length)
    sheets.push({ name: 'Conditions', colWidths: [8, 16, 24], rows: [['Timing', 'Field', 'Value'], ...condRows] })
  if ((photos ?? []).length)
    sheets.push({
      name: 'Photos',
      colWidths: [8, 8, 10, 20, 30, 18],
      rows: [
        ['Plot', 'Trt', 'Flagged', 'Label', 'Storage path', 'Taken'],
        ...(photos ?? []).map((p): (string | number | null)[] => [p.plot, p.meta?.trt ?? null, p.meta?.flagged ? 'Yes' : '', p.meta?.label ?? '', p.storage_path, when(p.taken_at)]),
      ],
    })

  const safe = trial.name.replace(/[\\/:*?"<>|]+/g, ' ').trim()
  downloadBlob(writeXlsx(sheets), `${safe} — synced field data.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  return 'ok'
}
