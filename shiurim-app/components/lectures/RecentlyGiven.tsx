import Link from 'next/link'
import type { FlatLecture } from '@/lib/lecture-utils'
import LectureCard from './LectureCard'

/** Homepage "Recently Given" list — the newest shiurim by delivery date.
 *  Reuses LectureCard so each shiur is its own card with the full (wrapping)
 *  title, matching the list view on the navigation pages. The caller passes an
 *  already-sorted, deduped, top-N slice of lectures (newest first). */
export default function RecentlyGiven({
  lectures,
  userId,
}: {
  lectures: FlatLecture[]
  userId?: string | null
}) {
  if (lectures.length === 0) return null

  return (
    <section>
      <h2 className="text-lg font-semibold text-stone-700 mb-4">Recently Given</h2>

      <div className="space-y-2">
        {lectures.map((lec, i) => (
          <LectureCard key={lec.id} lecture={lec} index={i + 1} userId={userId} />
        ))}
      </div>

      <Link
        href="/lectures"
        className="inline-block mt-4 text-sm font-medium text-emerald-700 hover:text-emerald-800
                   transition-colors"
      >
        Browse all shiurim →
      </Link>
    </section>
  )
}
