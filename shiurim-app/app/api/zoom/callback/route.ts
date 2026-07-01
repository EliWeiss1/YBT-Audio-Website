import { NextRequest, NextResponse } from 'next/server'
import { storeToken } from '@/lib/zoom/oauth'

export const runtime = 'nodejs'

function html(body: string, status = 200) {
  return new NextResponse(
    `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:2rem">${body}</body></html>`,
    { status, headers: { 'Content-Type': 'text/html' } }
  )
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const state = req.nextUrl.searchParams.get('state')
  const error = req.nextUrl.searchParams.get('error')

  if (error) {
    return html(`<h1>Authorization denied</h1><p>${error}</p>`, 400)
  }
  if (!code || !state) {
    return html('<h1>Missing code or state</h1>', 400)
  }

  let email: string
  try {
    email = Buffer.from(state, 'base64').toString('utf8')
  } catch {
    return html('<h1>Invalid state parameter</h1>', 400)
  }

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/zoom/callback`
  const creds = Buffer.from(
    `${process.env.ZOOM_CLIENT_ID}:${process.env.ZOOM_CLIENT_SECRET}`
  ).toString('base64')

  const tokenRes = await fetch(
    `https://zoom.us/oauth/token?grant_type=authorization_code&code=${encodeURIComponent(code)}&redirect_uri=${encodeURIComponent(redirectUri)}`,
    { method: 'POST', headers: { Authorization: `Basic ${creds}` } }
  )
  if (!tokenRes.ok) {
    const text = await tokenRes.text()
    return html(`<h1>Token exchange failed</h1><pre>${text}</pre>`, 500)
  }
  const tokens = await tokenRes.json() as {
    access_token: string; refresh_token: string; expires_in: number
  }

  const userRes = await fetch('https://api.zoom.us/v2/users/me', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  })
  if (!userRes.ok) {
    return html('<h1>Failed to get Zoom user info</h1>', 500)
  }
  const user = await userRes.json() as { id: string; email: string }

  try {
    await storeToken(email, user.id, tokens.access_token, tokens.refresh_token, tokens.expires_in)
  } catch (err) {
    return html(`<h1>Failed to save Zoom connection</h1><pre>${err instanceof Error ? err.message : String(err)}</pre>`, 500)
  }

  return html(
    `<h1>&#10003; Connected</h1>
     <p>Zoom account <strong>${user.email}</strong> is now connected for ingest email <strong>${email}</strong>.</p>
     <p>You can close this tab.</p>`
  )
}
