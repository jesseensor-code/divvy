import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { supabase } from './lib/supabase'

// Temporary connection check — remove once confirmed working
supabase.from('venues').select('count').then(({ data, error }) => {
  if (error) console.error('❌ Supabase connection failed:', error.message)
  else console.log('✅ Supabase connected:', data)
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
