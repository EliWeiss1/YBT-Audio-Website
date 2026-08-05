// =============================================================================
// dropbox-auth.mjs — one-time helper to mint a long-lived Dropbox refresh token.
//
// The dropbox-sync worker authenticates with the app key/secret + a refresh token
// (access tokens expire in ~4h). Run this once to obtain that refresh token:
//
//   1. Set DROPBOX_APP_KEY and DROPBOX_APP_SECRET (in .env.local or the shell).
//   2. `node scripts/dropbox-auth.mjs`  → prints an authorize URL. Open it, click
//      Allow, and copy the short code Dropbox shows you.
//   3. `node scripts/dropbox-auth.mjs <code>`  → exchanges the code and prints the
//      refresh_token. Add it as the DROPBOX_REFRESH_TOKEN GitHub Actions secret.
// =============================================================================
import { config } from 'dotenv'
config({ path: '.env.local' })

const { DROPBOX_APP_KEY, DROPBOX_APP_SECRET } = process.env
if (!DROPBOX_APP_KEY || !DROPBOX_APP_SECRET) {
  console.error('Set DROPBOX_APP_KEY and DROPBOX_APP_SECRET first (in .env.local or the shell).')
  process.exit(1)
}

const code = process.argv[2]

if (!code) {
  const url = `https://www.dropbox.com/oauth2/authorize?client_id=${encodeURIComponent(DROPBOX_APP_KEY)}`
    + `&response_type=code&token_access_type=offline`
  console.log('\n1) Open this URL, click Allow, and copy the code Dropbox shows you:\n')
  console.log('   ' + url)
  console.log('\n2) Then run:  node scripts/dropbox-auth.mjs <code>\n')
  process.exit(0)
}

const body = new URLSearchParams({ code, grant_type: 'authorization_code' })
const basic = Buffer.from(`${DROPBOX_APP_KEY}:${DROPBOX_APP_SECRET}`).toString('base64')

const res = await fetch('https://api.dropbox.com/oauth2/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${basic}` },
  body,
})
const json = await res.json().catch(() => ({}))
if (!res.ok || !json.refresh_token) {
  console.error(`Token exchange failed (HTTP ${res.status}):`, JSON.stringify(json))
  console.error('Codes are single-use and expire quickly — re-run without a code to get a fresh URL.')
  process.exit(1)
}

console.log('\nSuccess. Add this as the DROPBOX_REFRESH_TOKEN secret:\n')
console.log('   ' + json.refresh_token + '\n')
