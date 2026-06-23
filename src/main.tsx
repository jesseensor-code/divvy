import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { ensureSession } from './lib/auth'

function render() {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>
  )
}

ensureSession().then(render).catch(err => {
  console.error('Failed to start anonymous session:', err)
  render()
})
