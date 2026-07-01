import { createClient } from '@supabase/supabase-js'

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export interface TokenRow {
  sender_email: string
  zoom_user_id: string
  access_token: string
  refresh_token: string
  expires_at: string
}

export async function getStoredToken(email: string): Promise<TokenRow | null> {
  const { data, error } = await db()
    .from('zoom_oauth_tokens')
    .select('*')
    .eq('sender_email', email.toLowerCase())
    .single()
  if (error) {
    if (error.code === 'PGRST116') return null // no matching row
    throw new Error(`Failed to read Zoom token for ${email}: ${error.message}`)
  }
  return data ?? null
}

export async function storeToken(
  email: string,
  zoomUserId: string,
  accessToken: string,
  refreshToken: string,
  expiresIn: number
): Promise<void> {
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString()
  const { error } = await db().from('zoom_oauth_tokens').upsert(
    {
      sender_email: email.toLowerCase(),
      zoom_user_id: zoomUserId,
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'sender_email' }
  )
  if (error) {
    throw new Error(`Failed to store Zoom token for ${email}: ${error.message}`)
  }
}

async function doRefresh(row: TokenRow): Promise<string> {
  const creds = Buffer.from(
    `${process.env.ZOOM_CLIENT_ID}:${process.env.ZOOM_CLIENT_SECRET}`
  ).toString('base64')
  const res = await fetch(
    `https://zoom.us/oauth/token?grant_type=refresh_token&refresh_token=${encodeURIComponent(row.refresh_token)}`,
    { method: 'POST', headers: { Authorization: `Basic ${creds}` } }
  )
  if (!res.ok) throw new Error(`Zoom token refresh failed: ${res.status}`)
  const data = await res.json() as { access_token: string; refresh_token: string; expires_in: number }
  await storeToken(row.sender_email, row.zoom_user_id, data.access_token, data.refresh_token, data.expires_in)
  return data.access_token
}

// Returns a valid access token, refreshing if expiring within 5 minutes. Returns null if none stored.
export async function getValidAccessToken(email: string): Promise<string | null> {
  const row = await getStoredToken(email)
  if (!row) return null
  const expiresAt = new Date(row.expires_at).getTime()
  if (Date.now() + 5 * 60 * 1000 < expiresAt) return row.access_token
  return doRefresh(row)
}
