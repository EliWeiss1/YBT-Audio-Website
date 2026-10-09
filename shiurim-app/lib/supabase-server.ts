import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { fetchWithTimeout } from '@/lib/supabase-fetch'

// Every page render awaits Supabase (the root layout calls auth.getUser()),
// so a stalled Supabase must not hang the whole site: give up after this long
// and let callers fall through to their error path (e.g. render logged-out).
const SUPABASE_TIMEOUT_MS = 5000

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { fetch: fetchWithTimeout(SUPABASE_TIMEOUT_MS) },
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {}
        },
      },
    }
  )
}
