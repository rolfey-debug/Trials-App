import { useEffect, useState } from 'react'
import { backendState, signInOrUp, type BackendState } from '../../../shared/supa'
import { useApp } from '../state'

const BACKEND_LABEL: Record<BackendState, { dot: string; text: string; label: string }> = {
  connected: { dot: '#007749', text: '#00623C', label: 'Backend connected' },
  'migration-pending': { dot: '#cf4520', text: '#A93414', label: 'DB migration pending' },
  unreachable: { dot: '#B9BBB9', text: '#8A8C8A', label: 'Backend offline' },
}

function BackendChip() {
  const [state, setState] = useState<BackendState | null>(null)
  useEffect(() => {
    let live = true
    backendState().then((s) => live && setState(s))
    return () => {
      live = false
    }
  }, [])
  if (!state) return null
  const c = BACKEND_LABEL[state]
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6 }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: c.dot, flex: 'none' }} />
      <span style={{ fontSize: 9.5, fontWeight: 700, color: c.text }}>{c.label}</span>
    </div>
  )
}

const icons = {
  trials: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <rect x="8" y="2" width="8" height="4" rx="1" />
    </svg>
  ),
  new: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="16" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  ),
  map: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
      <line x1="8" y1="2" x2="8" y2="18" />
      <line x1="16" y1="6" x2="16" y2="22" />
    </svg>
  ),
  products: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  ),
  docs: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  ),
  reports: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  ),
  team: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
}

function NavItem({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div
      onClick={onClick}
      className={active ? undefined : 'hv-soft'}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        margin: '2px 10px',
        padding: '9px 10px',
        borderRadius: 8,
        cursor: 'pointer',
        fontSize: 13.5,
        fontWeight: 700,
        color: active ? '#00512F' : '#3E403E',
        background: active ? '#E3F1EA' : 'transparent',
      }}
    >
      {icon}
      {children}
    </div>
  )
}

/** Same localStorage key as the field app (src/lib/backend.ts) — same origin,
 * so one sign-in serves both apps in this browser. */
const SESSION_KEY = 'tw.supaSession'

function sessionEmail(): string | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    return raw ? (JSON.parse(raw).email as string) : null
  } catch {
    return null
  }
}

function nameFromEmail(email: string): string {
  return email
    .split('@')[0]
    .split(/[._-]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ')
}

function UserChip() {
  const [email, setEmail] = useState<string | null>(sessionEmail())
  const [open, setOpen] = useState(false)
  const [formEmail, setFormEmail] = useState('')
  const [formPw, setFormPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const signIn = async () => {
    if (busy) return
    if (!formEmail.includes('@') || formPw.length < 6) {
      setErr('Email and a password of 6+ characters.')
      return
    }
    setBusy(true)
    setErr('')
    const res = await signInOrUp(formEmail, formPw)
    setBusy(false)
    if (res.mode === 'online') {
      try {
        localStorage.setItem(SESSION_KEY, JSON.stringify(res.session))
      } catch {
        /* private mode */
      }
      setEmail(res.session.email)
      setOpen(false)
      setFormPw('')
    } else if (res.mode === 'bad-credentials') {
      setErr('Wrong password, or no account — accounts are created by an admin.')
    } else {
      setErr('Backend unreachable — check your connection.')
    }
  }

  const signOut = () => {
    try {
      localStorage.removeItem(SESSION_KEY)
    } catch {
      /* private mode */
    }
    setEmail(null)
  }

  if (!email) {
    return (
      <div style={{ padding: '10px 18px 16px' }}>
        {open ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <input
              value={formEmail}
              onChange={(e) => setFormEmail(e.target.value)}
              placeholder="name@company.com"
              style={{ padding: '7px 9px', fontSize: 12, border: '1px solid #D8DAD8', borderRadius: 7, outline: 'none' }}
            />
            <input
              type="password"
              value={formPw}
              onChange={(e) => setFormPw(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && signIn()}
              placeholder="password"
              style={{ padding: '7px 9px', fontSize: 12, border: '1px solid #D8DAD8', borderRadius: 7, outline: 'none' }}
            />
            {err && <div style={{ fontSize: 10.5, color: '#A93414', lineHeight: 1.4 }}>{err}</div>}
            <div style={{ display: 'flex', gap: 6 }}>
              <div onClick={signIn} style={{ flex: 1, textAlign: 'center', padding: '7px 0', borderRadius: 7, background: busy ? '#B9BBB9' : '#007749', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                {busy ? 'Signing in…' : 'Sign in'}
              </div>
              <div onClick={() => setOpen(false)} style={{ flex: 'none', padding: '7px 10px', borderRadius: 7, fontSize: 12, fontWeight: 700, color: '#8A8C8A', cursor: 'pointer' }}>
                ✕
              </div>
            </div>
          </div>
        ) : (
          <div onClick={() => setOpen(true)} style={{ textAlign: 'center', padding: '8px 0', borderRadius: 8, border: '1.5px solid #D6D7D6', fontSize: 12.5, fontWeight: 700, color: '#3E403E', cursor: 'pointer', background: '#fff' }}>
            Sign in
          </div>
        )}
      </div>
    )
  }

  const name = nameFromEmail(email)
  const initials = name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '12px 18px 16px' }}>
      <div style={{ width: 32, height: 32, flex: 'none', borderRadius: '50%', background: '#E3F1EA', color: '#00623C', fontWeight: 800, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {initials}
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: '#141414', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
        <div style={{ fontSize: 11, color: '#8A8C8A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{email}</div>
      </div>
      <div onClick={signOut} title="Sign out" style={{ flex: 'none', fontSize: 11, fontWeight: 700, color: '#A93414', cursor: 'pointer', padding: '4px 2px' }}>
        Sign out
      </div>
    </div>
  )
}

export default function Sidebar() {
  const { s, nav } = useApp()
  return (
    <div style={{ width: 228, flex: 'none', background: '#FFFFFF', borderRight: '1px solid #E4E4E6', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '20px 18px 13px' }}>
        <img src="./assets/agnvet-logo.png" alt="AGnVET" style={{ width: 126, display: 'block' }} />
        <div style={{ marginTop: 9, fontSize: 10.5, fontWeight: 800, letterSpacing: '.15em', color: '#007749' }}>TRIAL WORK · OFFICE</div>
        <BackendChip />
      </div>
      <div style={{ height: 1, background: '#EDEEED', margin: '0 18px 10px' }} />
      <NavItem active={s.screen === 'trials' || s.screen === 'review'} onClick={() => nav('trials')} icon={icons.trials}>
        Trials
      </NavItem>
      <NavItem active={s.screen === 'wizard' && !s.picker} onClick={() => nav('wizard', { step: 'treatments' })} icon={icons.new}>
        New trial
      </NavItem>
      <NavItem active={s.screen === 'map'} onClick={() => nav('map')} icon={icons.map}>
        Map
      </NavItem>
      <NavItem active={s.screen === 'wizard' && s.picker} onClick={() => nav('wizard', { step: 'treatments', picker: true })} icon={icons.products}>
        Products
      </NavItem>
      <NavItem active={s.screen === 'docs'} onClick={() => nav('docs')} icon={icons.docs}>
        Documents
      </NavItem>
      <div title="Not in this mockup" style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '2px 10px', padding: '9px 10px', borderRadius: 8, fontSize: 13.5, fontWeight: 700, color: '#B8BAB8' }}>
        {icons.reports}Reports
      </div>
      <div title="Not in this mockup" style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '2px 10px', padding: '9px 10px', borderRadius: 8, fontSize: 13.5, fontWeight: 700, color: '#B8BAB8' }}>
        {icons.team}Team
      </div>
      <div style={{ marginTop: 'auto' }}>
        <div style={{ padding: '12px 18px 0', borderTop: '1px solid #EDEEED' }}>
          <img src="./assets/aglink-logo.jpg" alt="Member of AgLink Australia" style={{ height: 14, display: 'block', opacity: 0.85 }} />
        </div>
        <UserChip />
      </div>
    </div>
  )
}
