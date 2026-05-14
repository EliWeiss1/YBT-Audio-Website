import { categories, getAllLectures, flattenLectures } from '@/lib/lectures'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase-server'
import ContinueListening from '@/components/lectures/ContinueListening'

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: recentProgress } = user
    ? await supabase
        .from('progress')
        .select('lecture_id, position_seconds, completed, last_listened_at, duration_seconds')
        .eq('user_id', user.id)
        .eq('completed', false)
        .gt('position_seconds', 0)
        .order('last_listened_at', { ascending: false })
        .limit(5)
    : { data: [] }
  const recentProgressRows = recentProgress ?? []

  const totalLectures = getAllLectures().length

  return (
    <div className="p-8 max-w-4xl mx-auto">

      {/* Hero */}
      <div className="mb-12">
        <div className="flex items-center gap-3 mb-3">
          <Image src="/YBT_Logo.gif" alt="YBT Logo" width={52} height={52} className="rounded" unoptimized />
          <h1 className="text-4xl font-bold text-stone-900">YBT Shiurim</h1>
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

      {/* Continue listening strip — only shown when the user has in-progress shiurim */}
      {recentProgressRows.length > 0 && (
        <ContinueListening rows={recentProgressRows} />
      )}

      {/* Category grid */}
      <h2 className="text-lg font-semibold text-stone-700 mb-4">Browse by Category</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {categories.map(cat => {
          const total = flattenLectures(cat).length
          if (total === 0) return null  // hide empty categories

          // Show top-level children labels as preview chips
          const childLabels = cat.children
            ? cat.children.slice(0, 4).map(c => c.label)
            : []
          const extraChildren = cat.children && cat.children.length > 4
            ? cat.children.length - 4
            : 0

          return (
            <Link
              key={cat.id}
              href={`/lectures?node=${cat.id}`}
              className="bg-white rounded-xl border border-stone-200 p-5 hover:border-emerald-200
                         hover:shadow-sm transition-all group"
            >
              {/* Icon + title */}
              <div className="text-3xl mb-3">{cat.icon}</div>
              <h3 className="font-semibold text-stone-900 group-hover:text-emerald-800
                             transition-colors mb-1">
                {cat.label}
              </h3>
              <p className="text-sm text-stone-400 mb-3">
                {total.toLocaleString()} shiurim
              </p>

              {/* Child labels as chips */}
              {childLabels.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {childLabels.map(label => (
                    <span key={label}
                      className="text-xs px-2 py-0.5 bg-stone-100 text-stone-500 rounded-full">
                      {label}
                    </span>
                  ))}
                  {extraChildren > 0 && (
                    <span className="text-xs px-2 py-0.5 bg-stone-100 text-stone-400 rounded-full">
                      +{extraChildren} more
                    </span>
                  )}
                </div>
              )}
            </Link>
          )
        })}
      </div>
    </div>
  )
}