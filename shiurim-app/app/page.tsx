import { categories, getAllLectures } from '@/lib/lectures'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase-server'
import MyShiurim from '@/components/lectures/MyShiurim'
import RecentlyGiven from '@/components/lectures/RecentlyGiven'

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [progressResult, savedResult] = user
    ? await Promise.all([
        supabase
          .from('progress')
          .select('lecture_id, position_seconds, completed, last_listened_at, duration_seconds')
          .eq('user_id', user.id)
          .eq('completed', false)
          .gt('position_seconds', 0)
          .order('last_listened_at', { ascending: false })
          .limit(5),
        supabase
          .from('saved_lectures')
          .select('lecture_id')
          .eq('user_id', user.id)
          .order('saved_at', { ascending: false })
          .limit(5),
      ])
    : [{ data: [] }, { data: [] }]

  const recentProgressRows = progressResult.data ?? []
  const savedIds = (savedResult.data ?? []).map((r: { lecture_id: string }) => r.lecture_id)

  const allLectures = getAllLectures()
  const totalLectures = allLectures.length

  // "Recently Given" = newest by the shiur's delivery date. Drop entries with
  // no date (can't claim to be recently given); ISO YYYY-MM-DD sorts
  // chronologically. getAllLectures() already dedups cross-listed shiurim.
  const recentlyGiven = allLectures
    .filter(l => l.date)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 15)

  return (
    <div className="p-8 max-w-4xl mx-auto">

      {/* Hero */}
      <div className="mb-12">
        <div className="flex items-center gap-3 mb-3">
          <Image src="/YBT_Logo.gif" alt="YBT Logo" width={52} height={52} className="rounded" unoptimized />
          <div>
            <h1 className="text-4xl font-bold text-stone-900">YBT Shiurim</h1>
            <p className="text-xs text-stone-400 tracking-widest uppercase mt-0.5">Yeshiva Bnei Torah</p>
          </div>
        </div>
        <p className="text-stone-500 text-lg">
          {totalLectures.toLocaleString()} shiurim across {categories.length} categories.
          Browse, listen, and join the discussion.
        </p>
        <div className="flex gap-3 mt-6">
          <Link
            href="/lectures"
            className="px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-medium
                       rounded-lg text-sm transition-colors"
          >
            Browse All Shiurim
          </Link>
          <Link
            href="/feed"
            className="px-5 py-2.5 border border-stone-200 hover:border-stone-300 text-stone-700
                       font-medium rounded-lg text-sm transition-colors"
          >
            Discussion Feed
          </Link>
        </div>
      </div>

      {/* My Shiurim strip — progress and/or saved, shown when user has either */}
      {user && (recentProgressRows.length > 0 || savedIds.length > 0) && (
        <MyShiurim
          progressRows={recentProgressRows}
          savedIds={savedIds}
          userId={user.id}
        />
      )}

      {/* Recently Given — newest shiurim by delivery date */}
      <RecentlyGiven lectures={recentlyGiven} userId={user?.id ?? null} />
    </div>
  )
}
