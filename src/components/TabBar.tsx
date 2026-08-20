import React from 'react'
import { C } from '../theme'
import type { Screen } from '../store/types'
import { useApp } from '../store/store'

/** Bottom tab bar — Today · Assess · Map · Spray · Walk. Icons are the design's
 * simple geometric shapes (no icon font). */

function Icon({ k, color }: { k: string; color: string }) {
  const A: React.CSSProperties = { position: 'absolute' }
  const shapes: Record<string, [React.CSSProperties, React.CSSProperties]> = {
    home: [{ ...A, left: 3, top: 3, width: 10, height: 10, border: `2px solid ${color}`, borderRadius: 4 }, {}],
    assess: [
      { ...A, left: 2, top: 2, width: 10, height: 10, border: `2px solid ${color}`, borderRadius: '50%' },
      { ...A, left: 6, top: 6, width: 6, height: 6, background: color, borderRadius: '50%' },
    ],
    map: [{ ...A, left: 4, top: 4, width: 9, height: 9, border: `2px solid ${color}`, transform: 'rotate(45deg)' }, {}],
    spray: [
      { ...A, left: 4, top: 6, width: 6, height: 8, border: `2px solid ${color}`, borderRadius: '2px 2px 4px 4px' },
      { ...A, left: 7, top: 2, width: 4, height: 3, background: color },
    ],
    walk: [
      { ...A, left: 5, top: 2, width: 2, height: 14, background: color },
      { ...A, left: 7, top: 3, width: 8, height: 6, background: color },
    ],
  }
  const [a, b] = shapes[k]
  return (
    <div style={{ position: 'relative', width: 18, height: 18 }}>
      <div style={a} />
      <div style={b} />
    </div>
  )
}

const TABS: [Screen, string][] = [
  ['home', 'Today'],
  ['assess', 'Assess'],
  ['map', 'Map'],
  ['spray', 'Spray'],
  ['walk', 'Walk'],
]

export function TabBar() {
  const { st, go } = useApp()
  return (
    <div style={{ display: 'flex', borderTop: `1px solid ${C.hairline}`, background: '#FBFCFB', padding: '6px 8px calc(10px + env(safe-area-inset-bottom, 12px))', gap: 2, flex: 'none' }}>
      {TABS.map(([k, lbl]) => {
        const act = st.screen === k
        const color = act ? C.green : C.muted
        return (
          <div
            key={k}
            onClick={() => go(k)}
            style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
              padding: '6px 0 4px', borderRadius: 10, cursor: 'pointer', minHeight: 44, boxSizing: 'border-box',
              background: act ? C.greenTint : undefined,
            }}
          >
            <Icon k={k} color={color} />
            <div style={{ fontSize: 9.5, fontWeight: 700, color }}>{lbl}</div>
          </div>
        )
      })}
    </div>
  )
}
