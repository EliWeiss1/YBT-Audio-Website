// A fetch for Supabase clients that gives up after `ms`, so a stalled Supabase
// can't hang a page render (or the build's static prerender of /feed) — the
// call fails fast and the caller falls through to its error/empty path.
export function fetchWithTimeout(ms: number): typeof fetch {
  return (input, init) => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(new DOMException('Supabase request timed out', 'TimeoutError')), ms)
    // Honor the caller's own signal too (AbortSignal.any is missing on older iOS).
    const outer = init?.signal
    if (outer) {
      if (outer.aborted) controller.abort(outer.reason)
      else outer.addEventListener('abort', () => controller.abort(outer.reason), { once: true })
    }
    return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer))
  }
}
