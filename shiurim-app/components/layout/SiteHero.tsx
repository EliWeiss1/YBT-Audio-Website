import Link from 'next/link'
import Image from 'next/image'

/** The site's masthead — logo, name, library size, and the two primary
 *  actions. Shared by every library tab (the homepage and /ttl) so switching
 *  tabs never feels like landing on a different site. Server component: it
 *  renders the same markup everywhere and needs no client state. */
export default function SiteHero({
  totalLectures,
  categoryCount,
}: {
  totalLectures: number
  categoryCount: number
}) {
  return (
    <div className="mb-12">
      <div className="flex items-center gap-3 mb-3">
        <Image src="/YBT_Logo.gif" alt="YBT Logo" width={52} height={52} className="rounded" unoptimized />
        <div>
          <h1 className="text-4xl font-bold text-stone-900">YBT Shiurim</h1>
          <p className="text-xs text-stone-400 tracking-widest uppercase mt-0.5">Yeshiva Bnei Torah</p>
        </div>
      </div>
      <p className="text-stone-500 text-lg">
        {totalLectures.toLocaleString()} shiurim across {categoryCount} categories.
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
  )
}
