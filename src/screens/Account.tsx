import React, { useState } from 'react'
import { C, MONO, SANS } from '../theme'
import { useApp } from '../store/store'
import { Eyebrow, Flash, ScreenTitle } from '../components/bits'
import { changePassword, savedSession } from '../lib/backend'

const card: React.CSSProperties = { background: '#fff', border: `1px solid ${C.hairline}`, borderRadius: 14, padding: '14px 16px', marginBottom: 12 }
const input: React.CSSProperties = {
  font: `500 13px ${MONO}`, padding: '10px 12px', background: C.appBg, borderRadius: 9,
  color: C.ink, border: 'none', outline: 'none', width: '100%', boxSizing: 'border-box',
}

/** Account — who this phone is, what name goes on scores, password, sign out. */
export function Account() {
  const { st, mut, signOut } = useApp()
  const online = !!savedSession()
  const [name, setName] = useState(st.session.name)
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [busy, setBusy] = useState(false)
  const [flash, setFlash] = useState<{ msg: string; err?: boolean } | null>(null)

  const initials = st.session.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase()

  const saveName = () => {
    const v = name.trim()
    if (!v || v === st.session.name) return
    mut({ kind: 'settings', label: `Display name → ${v}` }, (d) => void (d.session = { ...d.session, name: v }))
    setFlash({ msg: `✓ Scores and spray records will now read “${v}”` })
  }

  const doPassword = async () => {
    if (busy) return
    // ASVS 2.1.1: new passwords 12+ characters (existing sign-ins unaffected)
    if (pw.length < 12) {
      setFlash({ msg: 'Password needs at least 12 characters.', err: true })
      return
    }
    if (pw !== pw2) {
      setFlash({ msg: 'Passwords don’t match.', err: true })
      return
    }
    setBusy(true)
    const res = await changePassword(pw)
    setBusy(false)
    if (res === 'ok') {
      setFlash({ msg: '✓ Password changed — use it from your next sign-in' })
      setPw('')
      setPw2('')
    } else if (res === 'offline') {
      setFlash({ msg: 'Needs signal and an online sign-in — try again with reception.', err: true })
    } else {
      setFlash({ msg: 'The backend rejected that change — try again.', err: true })
    }
  }

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '4px 14px 8px' }}>
      <ScreenTitle title="Account" sub="Who this phone records as — name on scores, password, sign out" />

      {/* identity */}
      <div style={card}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{ width: 44, height: 44, flex: 'none', borderRadius: '50%', background: C.greenTint, color: C.greenDark, fontWeight: 800, fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {initials}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 800 }}>{st.session.name}</div>
            <div style={{ font: `500 11.5px ${MONO}`, color: C.grey, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {st.session.email ?? 'offline demo'}
            </div>
          </div>
          <span style={{ marginLeft: 'auto', font: `600 10px ${MONO}`, background: online ? C.greenTint : C.chipBg, color: online ? C.greenDark : C.grey, padding: '3px 8px', borderRadius: 5, flex: 'none' }}>
            {online ? 'SYNCED' : 'OFFLINE'}
          </span>
        </div>
      </div>

      {/* display name */}
      <div style={card}>
        <Eyebrow>DISPLAY NAME</Eyebrow>
        <div style={{ fontSize: 11.5, color: C.grey, margin: '6px 0 8px', lineHeight: 1.5 }}>
          Stamped on every score, spray tick and issue you record.
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={name} onChange={(e) => setName(e.target.value)} onBlur={saveName} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} style={{ ...input, fontFamily: SANS }} />
        </div>
      </div>

      {/* password */}
      <div style={card}>
        <Eyebrow>PASSWORD</Eyebrow>
        {online ? (
          <>
            <input type="password" placeholder="new password (12+ characters)" value={pw} onChange={(e) => setPw(e.target.value)} style={{ ...input, margin: '8px 0' }} />
            <input type="password" placeholder="repeat it" value={pw2} onChange={(e) => setPw2(e.target.value)} style={{ ...input, marginBottom: 10 }} />
            <div
              onClick={doPassword}
              style={{ textAlign: 'center', padding: '11px 0', borderRadius: 11, background: busy ? C.disabled : C.green, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
            >
              {busy ? 'Changing…' : 'Change password'}
            </div>
          </>
        ) : (
          <div style={{ fontSize: 11.5, color: C.grey, marginTop: 6, lineHeight: 1.5 }}>
            You’re in the offline demo — sign out and sign in with your account (needs signal) to change a password.
          </div>
        )}
      </div>

      {flash && (
        <Flash style={{ marginBottom: 12, ...(flash.err ? { background: C.burntTint, color: C.burntDark } : {}) }}>{flash.msg}</Flash>
      )}

      {/* sign out */}
      <div style={card}>
        <Eyebrow>THIS PHONE</Eyebrow>
        <div style={{ fontSize: 11.5, color: C.grey, margin: '6px 0 10px', lineHeight: 1.5 }}>
          Trial data stays on the phone — signing out only stops syncing until the next person signs in.
        </div>
        <div
          onClick={() => {
            if (window.confirm('Sign out of this phone? Trial data stays; syncing stops until someone signs in.')) signOut()
          }}
          style={{ textAlign: 'center', padding: '12px 0', borderRadius: 11, border: `1.5px solid ${C.ghostBorder}`, fontSize: 13, fontWeight: 700, color: C.burntDark, background: '#fff', cursor: 'pointer' }}
        >
          Sign out
        </div>
      </div>
    </div>
  )
}
