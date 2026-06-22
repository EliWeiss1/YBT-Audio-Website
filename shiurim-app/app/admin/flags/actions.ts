'use server'

import { createClient } from '@/lib/supabase-server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'

function svc() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

async function assertAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.id !== process.env.ADMIN_USER_ID) redirect('/auth')
}

export async function dismissFlag(flagId: string) {
  await assertAdmin()
  await svc().from('categorization_flags').update({
    status: 'dismissed',
    resolved_at: new Date().toISOString(),
  }).eq('id', flagId)
}

export async function moveFlag(flagId: string, shiurId: string, newPath: string[]) {
  await assertAdmin()
  const db = svc()
  await db.from('categorization_flags').update({
    status: 'moved',
    resolved_at: new Date().toISOString(),
  }).eq('id', flagId)
  await db.from('pending_lectures').update({ node_path: newPath }).eq('id', shiurId)
  // Trigger rebuild so the move takes effect
  const hookUrl = process.env.VERCEL_DEPLOY_HOOK_URL
  if (hookUrl) await fetch(hookUrl, { method: 'POST' })
}
