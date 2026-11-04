import { type EmailOtpType } from '@supabase/supabase-js'
import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/lectures'

  const supabase = await createClient()

  // PKCE flow (default Supabase email links carry a ?code=): exchange it for a session.
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(new URL(next, request.url))
    }
    // Typically "PKCE code verifier not found" = link opened in a different browser
    // than the one that requested it. Log it so failures are diagnosable.
    console.error('[auth/confirm] exchangeCodeForSession failed:', error.message)
  }

  // OTP / token_hash flow (used by custom email templates).
  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash })
    if (!error) {
      return NextResponse.redirect(new URL(next, request.url))
    }
    console.error('[auth/confirm] verifyOtp failed:', error.message)
  }

  if (!code && !(token_hash && type)) {
    console.error('[auth/confirm] no code or token_hash in request:', request.url.split('?')[0])
  }

  const isRecovery = type === 'recovery' || next.startsWith('/auth/update-password')
  return NextResponse.redirect(
    new URL(`/auth?error=invalid-link${isRecovery ? '&flow=reset' : ''}`, request.url)
  )
}
