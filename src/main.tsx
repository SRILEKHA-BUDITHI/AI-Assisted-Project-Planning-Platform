import React from 'react'
import ReactDOM from 'react-dom/client'
import { envResult } from './lib/env'
import { ConfigErrorPage } from './components/ErrorPages'
import './index.css'

const root = ReactDOM.createRoot(document.getElementById('root')!)

if (envResult.ok) {
  // Loaded lazily so the Supabase client is never constructed with missing config.
  void import('./App').then(({ default: App }) => {
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    )
  })
} else {
  console.error('Missing or invalid configuration', envResult.problems)
  root.render(<ConfigErrorPage problems={envResult.problems} />)
}
