import React from 'react'
import { C } from './theme'
import { useApp } from './store/store'
import { TabBar } from './components/TabBar'
import { Login } from './screens/Login'
import { Home } from './screens/Home'
import { Assess } from './screens/Assess'
import { MapScreen } from './screens/MapScreen'
import { Spray } from './screens/Spray'
import { AddTrial } from './screens/AddTrial'
import { Setup } from './screens/Setup'
import { Site } from './screens/Site'
import { Photos } from './screens/Photos'
import { Storage } from './screens/Storage'
import { Team } from './screens/Team'
import { Reports } from './screens/Reports'
import { Walk } from './screens/Walk'
import { Guidance } from './screens/Guidance'
import { BaseStation } from './screens/BaseStation'
import type { Screen } from './store/types'

const SECONDARY: Screen[] = ['site', 'photos', 'storage', 'team', 'reports', 'setup', 'add']

const SCREENS: Record<Screen, React.ComponentType> = {
  login: Login,
  home: Home,
  assess: Assess,
  map: MapScreen,
  spray: Spray,
  add: AddTrial,
  setup: Setup,
  site: Site,
  photos: Photos,
  storage: Storage,
  team: Team,
  reports: Reports,
  walk: Walk,
  guide: Guidance,
  base: BaseStation,
}

export default function App() {
  const { st, go } = useApp()
  // ?base=123456 — the link the bike's phone shares to turn a second phone into its GPS base
  React.useEffect(() => {
    if (new URLSearchParams(location.search).has('base')) go('base')
  }, [go])
  // the base station needs no account: it only relays its own GPS wander
  const screen: Screen = st.session.email || st.screen === 'base' ? st.screen : 'login'
  const Body = SCREENS[screen]
  const showBack = SECONDARY.includes(screen)
  // guidance and the base station are full-screen, glance-at-arm's-length tools
  const showNav = screen !== 'login' && screen !== 'guide' && screen !== 'base'

  return (
    <div style={{ height: '100%', display: 'flex', justifyContent: 'center', background: '#EDEEED' }}>
      <div
        style={{
          height: '100%', width: '100%', maxWidth: 430, display: 'flex', flexDirection: 'column',
          background: C.appBg, color: C.ink, overflow: 'hidden',
          paddingTop: 'max(10px, env(safe-area-inset-top))', boxSizing: 'border-box',
        }}
      >
        {showBack && (
          <div onClick={() => go('home')} style={{ padding: '2px 16px 6px', fontSize: 13, fontWeight: 700, color: C.green, cursor: 'pointer', flex: 'none' }}>
            ‹ Today
          </div>
        )}
        <Body />
        {showNav && <TabBar />}
      </div>
    </div>
  )
}
