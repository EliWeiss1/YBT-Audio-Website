import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import FlagsClient from './FlagsClient'
import folderHierarchy from '@/data/folder-hierarchy.json'

export default async function AdminFlagsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user || user.id !== process.env.ADMIN_USER_ID) {
    redirect('/auth')
  }

  const svc = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: flags } = await svc
    .from('categorization_flags')
    .select('*, pending_lectures(*)')
    .eq('status', 'open')
    .order('created_at', { ascending: false })

  return <FlagsClient flags={flags ?? []} hierarchy={folderHierarchy} />
}
