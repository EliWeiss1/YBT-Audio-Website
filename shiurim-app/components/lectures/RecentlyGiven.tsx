import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import type { FlatLecture } from '@/lib/lecture-utils'

/** Homepage "Recently Given" list — the newest shiurim by delivery date.
 *  Presentational server component; the caller passes an already-sorted,
 *  deduped, top-N slice of lectures (newest first). */
export default function RecentlyGiven({ lectures }: { lectures: FlatLecture[] }) {
  if (lectures.length === 0) return null

  return (
    <section>
      <h2 className="text-lg font-semibold text-stone-700 mb-4">Recently Given</h2>

      <div className="bg-white rounded-xl border border-stone-200 divide-y divide-stone-100
                      overflow-hidden">
        {lectures.map((lec, i) => {
          const category = lec.breadcrumb[0]
          const when = formatDistanceToNow(new Date(lec.date), { addSuffix: true })

          return (
            <Link
              key={lec.id}
              href={`/lectures/${lec.id}`}
              className="flex items-start gap-3 px-5 py-3.5 hover:bg-stone-50
                         focus-visible:bg-stone-50 focus-visible:outline-none transition-colors group"
            >
              {/* Freshest marker: only the single newest shiur gets the accent dot. */}
              <span
                aria-hidden
                className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                  i === 0 ? 'bg-emerald-500' : 'bg-transparent'
                }`}
              />
              <div className="min-w-0">
                <p className="text-stone-900 font-medium group-hover:text-emerald-800
                              transition-colors truncate">
                  {lec.title}
                </p>
                <p className="text-sm text-stone-400 truncate">
                  {lec.speaker}
                  {category && <> · {category}</>}
                  {' · '}
                  {when}
                </p>
              </div>
            </Link>
          )
        })}
      </div>

      <Link
        href="/lectures"
        className="inline-block mt-3 text-sm font-medium text-emerald-700 hover:text-emerald-800
                   transition-colors"
      >
        Browse all shiurim →
      </Link>
    </section>
  )
}
