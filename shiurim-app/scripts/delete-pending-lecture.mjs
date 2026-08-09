/**
 * delete-pending-lecture.mjs
 *
 * One-off: deletes a single row from pending_lectures (and any related
 * categorization_flags row) by lecture id. Uses the service role key so it
 * bypasses RLS.
 *
 * Run: node scripts/delete-pending-lecture.mjs <lectureId>
 */

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: join(__dirname, '../.env.local') })

const lectureId = process.argv[2]
if (!lectureId) {
  console.error('Usage: node scripts/delete-pending-lecture.mjs <lectureId>')
  process.exit(1)
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const { data: lecture, error: fetchErr } = await supabase
  .from('pending_lectures')
  .select('*')
  .eq('id', lectureId)
  .maybeSingle()

if (fetchErr) {
  console.error('Fetch error:', fetchErr)
  process.exit(1)
}
if (!lecture) {
  console.log(`No pending_lectures row found for id=${lectureId}`)
} else {
  console.log('Found lecture:', JSON.stringify(lecture, null, 2))
  const { error: delErr } = await supabase.from('pending_lectures').delete().eq('id', lectureId)
  if (delErr) {
    console.error('Delete error:', delErr)
    process.exit(1)
  }
  console.log(`Deleted pending_lectures row id=${lectureId}`)
}

const { data: flags, error: flagFetchErr } = await supabase
  .from('categorization_flags')
  .select('id')
  .eq('shiur_id', lectureId)

if (flagFetchErr) {
  console.error('Flag fetch error:', flagFetchErr)
} else if (flags && flags.length > 0) {
  const { error: flagDelErr } = await supabase.from('categorization_flags').delete().eq('shiur_id', lectureId)
  if (flagDelErr) {
    console.error('Flag delete error:', flagDelErr)
  } else {
    console.log(`Deleted ${flags.length} categorization_flags row(s) for shiur_id=${lectureId}`)
  }
} else {
  console.log('No categorization_flags rows found for this shiur')
}
