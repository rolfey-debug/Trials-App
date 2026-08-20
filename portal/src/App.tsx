import Sidebar from './components/Sidebar'
import Dashboard from './components/Dashboard'
import Wizard from './components/Wizard'
import Picker from './components/Picker'
import Docs from './components/Docs'
import Review from './components/Review'
import MapScreen from './components/MapScreen'
import { useApp } from './state'

export default function App() {
  const { s } = useApp()
  return (
    <div style={{ display: 'flex', height: '100vh', minHeight: 620, overflow: 'hidden', background: '#F4F5F4' }}>
      <Sidebar />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', overflow: 'hidden' }}>
        {s.screen === 'trials' && <Dashboard />}
        {s.screen === 'wizard' && <Wizard />}
        {s.screen === 'docs' && <Docs />}
        {s.screen === 'review' && <Review />}
        {s.screen === 'map' && <MapScreen />}
      </div>
      <Picker />
    </div>
  )
}
