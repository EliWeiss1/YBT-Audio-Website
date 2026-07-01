import { createClient } from '@supabase/supabase-js'

type ApiLogEntry = {
  endpoint: string
  query_params?: Record<string, string>
  result_count?: number
  response_ms: number
  ip?: string | null
}

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/** Fire-and-forget: do NOT await this. It writes to api_logs with zero latency impact. */
export function logApiCall(entry: ApiLogEntry): void {
  const client = getServiceClient()
  if (!client) return

  void Promise.resolve(client.from('api_logs').insert(entry))
    .then(({ error }) => { if (error) console.error('[api-logger]', error.message) })
    .catch((err) => console.error('[api-logger] unexpected:', err))
}
