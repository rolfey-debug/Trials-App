import React from 'react'
import { C, MONO } from '../theme'

export const Eyebrow = ({ children, color = C.muted, style }: { children: React.ReactNode; color?: string; style?: React.CSSProperties }) => (
  <div style={{ font: `600 10.5px ${MONO}`, color, letterSpacing: '.08em', margin: '0 0 6px', ...style }}>{children}</div>
)

export const PulseDot = ({ color = C.green, size = 7 }: { color?: string; size?: number }) => (
  <div style={{ width: size, height: size, borderRadius: '50%', background: color, animation: 'gpsPulse 1.6s infinite', flex: 'none' }} />
)

export const GpsPill = ({ text }: { text: string }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: C.greenTint, borderRadius: 99, padding: '5px 10px', marginTop: 4 }}>
    <PulseDot />
    <span style={{ font: `500 11px ${MONO}`, color: C.greenDark }}>{text}</span>
  </div>
)

export const Toggle = ({ on, onClick }: { on: boolean; onClick?: () => void }) => (
  <div
    onClick={onClick}
    style={{
      width: 40, height: 24, borderRadius: 12, flex: 'none', padding: 2, boxSizing: 'border-box',
      transition: 'background .15s', background: on ? C.green : C.ghostBorder, cursor: 'pointer',
    }}
  >
    <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'margin .15s', marginLeft: on ? 16 : 0 }} />
  </div>
)

export const Flash = ({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) => (
  <div style={{ background: C.greenTint, borderRadius: 8, padding: '7px 10px', fontSize: 11.5, fontWeight: 700, color: C.greenDark, ...style }}>
    {children}
  </div>
)

export const Chip = ({ children, burnt = false }: { children: React.ReactNode; burnt?: boolean }) => (
  <span
    style={{
      font: `500 10px ${MONO}`,
      background: burnt ? C.burntTint : C.chipBg,
      padding: '3px 7px',
      borderRadius: 5,
      color: burnt ? C.burntDark : C.grey,
    }}
  >
    {children}
  </span>
)

export const PrimaryBtn = ({ children, onClick, style }: { children: React.ReactNode; onClick?: () => void; style?: React.CSSProperties }) => (
  <div
    onClick={onClick}
    style={{ background: C.green, color: '#fff', borderRadius: 12, padding: '14px 0', textAlign: 'center', fontSize: 14, fontWeight: 700, cursor: 'pointer', minHeight: 20, ...style }}
  >
    {children}
  </div>
)

export const GhostBtn = ({ children, onClick, style }: { children: React.ReactNode; onClick?: () => void; style?: React.CSSProperties }) => (
  <div
    onClick={onClick}
    style={{
      textAlign: 'center', padding: '11px 0', borderRadius: 12, border: `1.5px solid ${C.ghostBorder}`,
      fontSize: 12.5, fontWeight: 700, color: C.body, background: '#fff', cursor: 'pointer', ...style,
    }}
  >
    {children}
  </div>
)

export const SuccessCard = ({ title, sub }: { title: string; sub: string }) => (
  <div style={{ background: '#fff', border: `1px solid ${C.hairline}`, borderRadius: 14, padding: '22px 18px', textAlign: 'center', marginBottom: 10 }}>
    <div style={{ width: 44, height: 44, borderRadius: '50%', background: C.green, color: '#fff', fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px' }}>
      ✓
    </div>
    <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 3 }}>{title}</div>
    <div style={{ fontSize: 12, color: C.grey, lineHeight: 1.5 }}>{sub}</div>
  </div>
)

export const ScreenTitle = ({ title, sub }: { title: string; sub: string }) => (
  <>
    <div style={{ fontSize: 19, fontWeight: 800, marginBottom: 1 }}>{title}</div>
    <div style={{ fontSize: 11.5, color: C.grey, marginBottom: 12 }}>{sub}</div>
  </>
)
