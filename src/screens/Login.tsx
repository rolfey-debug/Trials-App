import React, { useState } from 'react'
import { C, MONO } from '../theme'
import { PrimaryBtn } from '../components/bits'
import { useApp } from '../store/store'
import { login } from '../lib/backend'

export function Login() {
  const { mut } = useApp()
  const [email, setEmail] = useState('andrew.rolfe@agnvet.com.au')
  const [pw, setPw] = useState('')
  const [linkFlash, setLinkFlash] = useState(false)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<{ msg: string; err?: boolean } | null>(null)

  const enter = () =>
    mut(null, (d) => {
      d.session = { ...d.session, email }
      d.screen = 'home'
    })

  const signIn = async () => {
    if (!email.includes('@') || busy) return
    if (pw.length < 6) {
      // Demo path — no backend call, no accidental signups.
      setStatus({ msg: 'Offline demo — use a password of 6+ characters to create a synced account.' })
      enter()
      return
    }
    setBusy(true)
    setStatus(null)
    // Real Supabase auth when reachable; the offline-first promise holds —
    // no signal (or no backend yet) still gets you into the app.
    const res = await login(email, pw)
    setBusy(false)
    if (res.mode === 'online') {
      enter()
    } else if (res.mode === 'confirm-email') {
      setStatus({ msg: 'Account created — confirm via the email we sent. Working locally meanwhile.' })
      enter()
    } else if (res.mode === 'bad-credentials') {
      setStatus({ msg: 'Wrong password for this account.', err: true })
    } else {
      setStatus({ msg: 'Backend unreachable — working offline; data syncs when you sign in online.' })
      enter()
    }
  }

  const inputStyle: React.CSSProperties = {
    font: `500 14px ${MONO}`,
    padding: '10px 12px',
    background: C.appBg,
    borderRadius: 9,
    border: 'none',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
    color: C.ink,
  }
  const label: React.CSSProperties = {
    fontSize: 10, color: C.muted, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', marginBottom: 3,
  }

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '34px 22px 20px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontSize: 31, fontWeight: 800, letterSpacing: -0.3, marginTop: 26 }}>
        <span style={{ color: C.green }}>AGnVET</span> Trial Work
      </div>
      <div style={{ fontSize: 13, color: C.grey, margin: '4px 0 26px' }}>Spray · assess · present — from the plot</div>
      <div style={{ background: '#fff', border: `1px solid ${C.hairline}`, borderRadius: 16, padding: 16, marginBottom: 14 }}>
        <div style={label}>Email</div>
        <div style={{ marginBottom: 12 }}>
          <input style={inputStyle} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </div>
        <div style={label}>Password</div>
        <div style={{ marginBottom: 14 }}>
          <input
            style={{ ...inputStyle, letterSpacing: 3 }}
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && signIn()}
            autoComplete="current-password"
          />
        </div>
        <PrimaryBtn onClick={signIn} style={{ borderRadius: 11, marginBottom: 8, opacity: busy ? 0.7 : 1 }}>
          {busy ? 'Signing in…' : 'Sign in'}
        </PrimaryBtn>
        {status && (
          <div style={{ background: status.err ? C.burntTint : C.greenTint, borderRadius: 8, padding: '7px 10px', fontSize: 11.5, fontWeight: 700, color: status.err ? C.burntDark : C.greenDark, marginBottom: 8 }}>
            {status.msg}
          </div>
        )}
        <div
          onClick={() => setLinkFlash(true)}
          style={{ textAlign: 'center', padding: 10, fontSize: 12.5, fontWeight: 700, color: C.green, cursor: 'pointer' }}
        >
          Email me a sign-in link instead
        </div>
        {linkFlash && (
          <div style={{ background: C.greenTint, borderRadius: 8, padding: '7px 10px', fontSize: 11.5, fontWeight: 700, color: C.greenDark }}>
            ✓ Link sent to {email || 'your email'} — check your inbox
          </div>
        )}
      </div>
      <div style={{ background: '#fff', border: `1px solid ${C.hairline}`, borderRadius: 12, padding: '11px 14px', fontSize: 11.5, color: C.grey, lineHeight: 1.55, marginBottom: 8 }}>
        Your login sets what you see — <b style={{ color: C.ink }}>trials team</b> gets everything, <b style={{ color: C.ink }}>growers</b> their
        own site, <b style={{ color: C.ink }}>chem reps</b> a limited view you control.
      </div>
      <div style={{ fontSize: 11, color: C.muted, textAlign: 'center', marginTop: 'auto' }}>
        Works offline once signed in — syncs when you're back in signal
      </div>
    </div>
  )
}
