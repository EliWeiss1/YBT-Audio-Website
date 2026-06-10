'use client'

import { useEffect } from 'react'

const SHELL_REFRESHED_KEY = 'shell-refreshed-at:v1'
const SHELL_REFRESH_INTERVAL = 24 * 60 * 60 * 1000

/** Ask the worker to re-precache the app shell so the offline copies of
 *  /, /offline and /downloads track new deploys (chunk hashes change every
 *  build). Throttled to once per 24h. */
function refreshShell(registration: ServiceWorkerRegistration) {
  if (!navigator.onLine) return
  try {
    const last = Number(localStorage.getItem(SHELL_REFRESHED_KEY) ?? 0)
    if (Date.now() - last < SHELL_REFRESH_INTERVAL) return
    const worker = registration.active ?? navigator.serviceWorker.controller
    if (!worker) return
    worker.postMessage({ type: 'refresh-shell' })
    localStorage.setItem(SHELL_REFRESHED_KEY, String(Date.now()))
  } catch {
    /* localStorage unavailable — skip */
  }
}

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
    // `ready` resolves once a worker is active — safe point to message it.
    navigator.serviceWorker.ready.then(refreshShell).catch(() => {})
  }, [])

  return null
}
