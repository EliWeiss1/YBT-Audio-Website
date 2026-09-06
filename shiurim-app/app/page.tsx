import { categories, getAllLectures } from '@/lib/lectures'
import { getMyShiurimData } from '@/lib/my-shiurim-server'
import SiteHero from '@/components/layout/SiteHero'
import MyShiurim from '@/components/lectures/MyShiurim'
import RecentlyGiven from '@/components/lectures/RecentlyGiven'

export default async function HomePage() {
  const { user, progressRows, savedIds, hasAny } = await getMyShiurimData()

  const allLectures = getAllLectures()

  // "Recently Given" = newest by the shiur's delivery date. Drop entries with
  // no date (can't claim to be recently given); ISO YYYY-MM-DD sorts
  // chronologically. getAllLectures() already dedups cross-listed shiurim.
  const dated = allLectures
    .filter(l => l.date)
    .sort((a, b) => b.date.localeCompare(a.date))

  // Both pools are sent down so the "Shiurim in Yeshiva" / "All Community
  // Shiurim" tabs (lib/scope-context.tsx) can switch without a server round
  // trip. The yeshiva pool is the live email/Zoom pipeline's INGEST- ids only —
  // deliberately not MASORET- (Google Drive sync) or anything else.
  const recentPools = {
    all: dated.slice(0, 200),
    yeshiva: dated.filter(l => l.id.startsWith('INGEST-')).slice(0, 200),
  }

  return (
    <div className="px-4 py-6 sm:p-8 max-w-4xl mx-auto">

      <SiteHero totalLectures={allLectures.length} categoryCount={categories.length} />

      {/* My Shiurim strip — progress and/or saved, shown when user has either */}
      {user && hasAny && (
        <MyShiurim
          progressRows={progressRows}
          savedIds={savedIds}
          userId={user.id}
        />
      )}

      {/* Recently Given — newest shiurim by delivery date */}
      <RecentlyGiven
        pools={recentPools}
        userId={user?.id ?? null}
        folderOrder={categories.map(c => c.label)}
      />
    </div>
  )
}
