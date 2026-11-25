/** Audit log — every correction ever made, newest first. Nothing in the
 * system is silently fixed: relabels, exclusions and value edits each leave
 * a row here with the original, the change, who made it and why. */
import { useEffect, useState } from 'react'
import { loadCorrections, portalToken, type CorrectionRow } from '../lib/db'
import { card, label } from '../state'

const GREEN = '#007749'
const KIND: Record<CorrectionRow['kind'], { chip: string; bg: string; fg: string }> = {
  value: { chip: 'VALUE EDIT', bg: '#E3F1EA', fg: '#00623C' },
  relabel: { chip: 'RELABEL', bg: '#FBEAE3', fg: '#A93414' },
  exclude: { chip: 'EXCLUDE', bg: '#EFEFF1', fg: '#58585B' },
}

function detail(c: CorrectionRow): string {
  if (c.kind === 'value') return `${c.measure ?? 'value'}: ${c.old_value ?? '—'} → ${c.new_value ?? '—'}`
  if (c.kind === 'relabel') return `treatment T${c.original_t ?? '—'} → T${c.effective_t ?? '—'}`
  return 'plot excluded from analysis'
}

export default function AuditLog() {
  const [state, setState] = useState<'loading' | 'ready' | 'signedout'>('loading')
  const [rows, setRows] = useState<CorrectionRow[]>([])

  useEffect(() => {
    void (async () => {
      const token = await portalToken()
      if (!token) {
        setState('signedout')
        return
      }
      setRows((await loadCorrections(token)) ?? [])
      setState('ready')
    })()
  }, [])

  if (state === 'signedout')
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8A8C8A', fontSize: 14 }}>
        Sign in (bottom left) to see the audit log.
      </div>
    )

  return (
    <div style={{ flex: 1, minWidth: 0, overflow: 'auto', padding: '16px 22px 30px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 4 }}>
        <div style={{ fontSize: 21, fontWeight: 800, color: '#141414' }}>Audit log</div>
        <div style={{ fontSize: 12, color: '#8A8C8A' }}>
          {state === 'loading' ? 'loading…' : `${rows.length} correction${rows.length === 1 ? '' : 's'} — originals are never deleted, only corrected`}
        </div>
      </div>
      <div style={{ ...card, marginTop: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead>
            <tr style={{ background: '#FAFBFA' }}>
              {['When', 'Trial', 'Plot', 'Kind', 'Change', 'Reason', 'By'].map((h) => (
                <th key={h} style={{ textAlign: 'left', padding: '9px 12px', borderBottom: '1px solid #E4E4E6', ...label(0) }}>
                  {h.toUpperCase()}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const k = KIND[c.kind] ?? KIND.exclude
              return (
                <tr key={c.id} style={{ borderBottom: '1px solid #F0F1F0' }}>
                  <td style={{ padding: '9px 12px', whiteSpace: 'nowrap', color: '#58585B' }}>
                    {new Date(c.made_at).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td style={{ padding: '9px 12px', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.trial_id?.name ?? '—'}
                  </td>
                  <td style={{ padding: '9px 12px', fontWeight: 700 }}>{c.plot}</td>
                  <td style={{ padding: '9px 12px' }}>
                    <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.08em', padding: '3px 8px', borderRadius: 99, whiteSpace: 'nowrap', background: k.bg, color: k.fg }}>{k.chip}</span>
                  </td>
                  <td style={{ padding: '9px 12px', fontWeight: 600 }}>{detail(c)}</td>
                  <td style={{ padding: '9px 12px', color: '#58585B', maxWidth: 320 }}>{c.reason ?? '—'}</td>
                  <td style={{ padding: '9px 12px', whiteSpace: 'nowrap', color: '#58585B' }}>{c.made_by?.name ?? '—'}</td>
                </tr>
              )
            })}
            {state === 'ready' && rows.length === 0 && (
              <tr>
                <td colSpan={7} style={{ padding: '26px 12px', textAlign: 'center', color: '#8A8C8A' }}>
                  No corrections yet — every relabel, exclusion or value edit will appear here.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: 10, fontSize: 11.5, color: '#8A8C8A' }}>
        Value edits are made from the Results screen (✎ in the plot drawer) and always require a reason.{' '}
        <span style={{ color: GREEN, fontWeight: 700 }}>Original values stay in this log permanently.</span>
      </div>
    </div>
  )
}
