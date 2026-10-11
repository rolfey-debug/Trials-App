import Sidebar from './components/Sidebar'
import Dashboard from './components/Dashboard'
import Wizard from './components/Wizard'
import TrialBuilder from './components/TrialBuilder'
import Picker from './components/Picker'
import Docs from './components/Docs'
import Review from './components/Review'
import LiveMap from './components/LiveMap'
import SitePlanner from './components/SitePlanner'
import MapScreen from './components/MapScreen'
import Results from './components/Results'
import AuditLog from './components/AuditLog'
import { useApp } from './state'

export default function App() {
  const { s } = useApp()
  return (
    <div style={{ display: 'flex', height: '100vh', minHeight: 620, overflow: 'hidden', background: '#F4F5F4' }}>
      <Sidebar />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', overflow: 'hidden' }}>
        {s.screen === 'trials' && <Dashboard />}
        {s.screen === 'wizard' && <Wizard />}
        {s.screen === 'builder' && <TrialBuilder />}
        {s.screen === 'docs' && <Docs />}
        {s.screen === 'review' && <Review />}
        {s.screen === 'map' && <LiveMap />}
        {s.screen === 'planner' && <SitePlanner />}
        {s.screen === 'plotmap' && <MapScreen />}
        {s.screen === 'results' && <Results />}
        {s.screen === 'audit' && <AuditLog />}
      </div>
      <Picker />
    </div>
  )
}
