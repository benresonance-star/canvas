import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { MusicKernelProvider } from './features/music/kernel/MusicKernelProvider.jsx'

// Host / extension API compatibility: map to localStorage in the browser.
if (typeof window !== 'undefined' && !window.storage) {
  window.storage = {
    async get(key) {
      const value = localStorage.getItem(key)
      return value != null ? { value } : null
    },
    async set(key, value) {
      localStorage.setItem(key, value)
    },
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <MusicKernelProvider>
      <App />
    </MusicKernelProvider>
  </StrictMode>,
)
