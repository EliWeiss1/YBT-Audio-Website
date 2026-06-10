'use client'

import { useEffect } from 'react'

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    if (process.env.NODE_ENV !== 'production') {
      // A worker left over from local production testing (`npm start`) would
      // serve stale cached pages against `next dev` — actively remove it.
      navigator.serviceWorker.getRegistrations()
        .then(regs => regs.forEach(r => r.unregister()))
        .catch(() => {})
      return
    }
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  }, [])

  return null
}
