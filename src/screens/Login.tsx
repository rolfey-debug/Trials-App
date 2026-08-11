import React, { useState } from 'react'
import { C, MONO } from '../theme'
import { PrimaryBtn } from '../components/bits'
import { useApp } from '../store/store'

export function Login() {
  const { mut } = useApp()
  const [email, setEmail] = useState('andrew.rolfe@agnvet.com.au')
  const [pw, setPw] = useState('')
  const [linkFlash, setLinkFlash] = useState(false)

  const signIn = () => {
    if (!email.includes('@')) return
    // Offline-capable auth stub — a Supabase session slot in the architecture.
    // The session persists locally so the phone works with no signal.
    mut(null, (d) => {
      d.session = { ...d.session, email }
      d.screen = 'home'
    })
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
        <PrimaryBtn onClick={signIn} style={{ borderRadius: 11, marginBottom: 8 }}>
          Sign in
        </PrimaryBtn>
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
