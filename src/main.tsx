import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { StoreProvider } from './store/store'
import { GpsProvider } from './gps/useGps'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <StoreProvider>
      <GpsProvider>
        <App />
      </GpsProvider>
    </StoreProvider>
  </React.StrictMode>
)

// Offline-first: register the service worker (production builds only —
// dev servers would fight the cache).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {})
  })
}
