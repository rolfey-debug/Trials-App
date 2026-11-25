import React, { useState } from 'react'
import { C, MONO } from '../theme'
import { useApp } from '../store/store'
import { Eyebrow, Flash, ScreenTitle } from '../components/bits'
import type { Role } from '../store/types'

const ROLES: Record<Role, [string, string]> = {
  admin: ['Admin', 'Everything — trials, treatments, team, exports. For trial coordinators.'],
  team: ['Assessor', 'Score and photograph assigned trials. Can’t edit treatments or invite people.'],
  grower: ['Grower', 'Their own site only — results, photos, spray records. No other trials, no rates for experimental products.'],
  rep: ['Chem rep · limited', 'Invited trials only, treatments coded until released, no competitor rates, watermarked reports.'],
}

const CHIP_STYLES: Record<string, { av: [string, string]; chip: [string, string] }> = {
  ADMIN: { av: [C.green, '#fff'], chip: [C.greenTint, C.greenDark] },
  TEAM: { av: [C.assessedFill, C.greenDark], chip: [C.chipBg, C.grey] },
  GROWER: { av: [C.chipBg, C.grey], chip: [C.chipBg, C.grey] },
  LIMITED: { av: [C.burntTint, C.burntDark], chip: [C.burntTint, C.burntDark] },
}

/** Team & access (design screen 3f). */
export function Team() {
  const { st, mut, signOut } = useApp()
  const [role, setRole] = useState<Role>('rep')
  const [email, setEmail] = useState('')
  const [flash, setFlash] = useState('')

  const invite = () => {
    if (!email.includes('@')) {
      setFlash('')
      return
    }
    mut({ kind: 'settings', label: `Invite sent · ${email} (${ROLES[role][0]})` }, (d) => {
      d.invites.push({ role, email, ts: Date.now() })
    })
    setFlash('✓ Link created — expires in 7 days · you approve the first sign-in')
    setEmail('')
  }

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '4px 16px 12px' }}>
      <ScreenTitle title="Team & access" sub="Everyone signs in — their role decides what they see" />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
        {st.people.map((pe) => {
          const cs = CHIP_STYLES[pe.chip]
          return (
            <div key={pe.n} style={{ background: '#fff', border: `1px solid ${C.hairline}`, borderRadius: 12, padding: '10px 13px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  width: 34, height: 34, borderRadius: '50%', flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 800, background: cs.av[0], color: cs.av[1],
                }}
              >
                {pe.ini}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700 }}>{pe.n}</div>
                <div style={{ fontSize: 11, color: C.grey }}>{pe.s}</div>
              </div>
              <span style={{ font: `700 9px ${MONO}`, padding: '3px 7px', borderRadius: 5, background: cs.chip[0], color: cs.chip[1] }}>{pe.chip}</span>
            </div>
          )
        })}
        {st.invites.map((iv) => (
          <div key={iv.ts} style={{ background: '#fff', border: `1px dashed ${C.disabled}`, borderRadius: 12, padding: '10px 13px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: '50%', flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, background: C.chipBg, color: C.grey }}>
              ✉
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700 }}>{iv.email}</div>
              <div style={{ fontSize: 11, color: C.grey }}>{ROLES[iv.role][0]} · invited, not yet signed in</div>
            </div>
            <span style={{ font: `700 9px ${MONO}`, padding: '3px 7px', borderRadius: 5, background: C.chipBg, color: C.grey }}>PENDING</span>
          </div>
        ))}
      </div>

      <div style={{ background: C.burntTint, borderRadius: 12, padding: '11px 14px', fontSize: 11.5, color: C.burntDark, lineHeight: 1.6, marginBottom: 14 }}>
        <b>What a rep login sees:</b> only trials you invite them to · treatments as codes (T1–T24) until you release names · no rates or mixes
        for other companies' products · charts and photos yes, raw plot data no · everything watermarked until you mark the trial final.
      </div>

      <Eyebrow>NEW LOGIN</Eyebrow>
      <div style={{ background: '#fff', border: `1px solid ${C.hairline}`, borderRadius: 13, padding: '13px 14px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 9 }}>
          {(Object.keys(ROLES) as Role[]).map((k) => (
            <div
              key={k}
              onClick={() => {
                setRole(k)
                setFlash('')
              }}
              style={{
                padding: '7px 12px', borderRadius: 99, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                ...(role === k ? { background: C.green, color: '#fff' } : { background: '#fff', border: `1px solid ${C.ghostBorder}`, color: C.body }),
              }}
            >
              {ROLES[k][0]}
            </div>
          ))}
        </div>
        <div style={{ fontSize: 11.5, color: C.grey, lineHeight: 1.55, marginBottom: 10 }}>{ROLES[role][1]}</div>
        <input
          type="email"
          placeholder="name@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{
            font: `500 13px ${MONO}`, padding: '10px 12px', background: C.appBg, borderRadius: 9, marginBottom: 10,
            color: C.ink, border: 'none', outline: 'none', width: '100%', boxSizing: 'border-box',
          }}
        />
        <div
          onClick={invite}
          style={{ textAlign: 'center', padding: '12px 0', borderRadius: 11, background: C.green, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
        >
          Send invite link
        </div>
        {flash && <Flash style={{ marginTop: 8 }}>{flash}</Flash>}
      </div>

      {/* signed-in account */}
      <div style={{ background: '#fff', border: `1px solid ${C.hairline}`, borderRadius: 14, padding: '14px 16px', marginTop: 12 }}>
        <Eyebrow>THIS PHONE</Eyebrow>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ font: `500 13px ${MONO}`, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {st.session.email ?? 'not signed in'}
            </div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
              Name, password and sign-out live in Account (Today › Account).
            </div>
          </div>
          <div
            onClick={() => {
              if (window.confirm('Sign out of this phone? Trial data stays; syncing stops until someone signs in.')) signOut()
            }}
            style={{
              flex: 'none', padding: '9px 16px', borderRadius: 10, border: `1.5px solid ${C.ghostBorder}`,
              fontSize: 12.5, fontWeight: 700, color: C.burntDark, background: '#fff', cursor: 'pointer',
            }}
          >
            Sign out
          </div>
        </div>
      </div>
    </div>
  )
}
