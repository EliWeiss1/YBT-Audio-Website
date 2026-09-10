import { Suspense } from 'react'
import { getCategories, getAllLectures } from '@/lib/lectures'
import { getMyShiurimData } from '@/lib/my-shiurim-server'
import SiteHero from '@/components/layout/SiteHero'
import ScopeTabs from '@/components/layout/ScopeTabs'
import MyShiurim from '@/components/lectures/MyShiurim'
import TtlClient, { SectionSkeleton } from './TtlClient'

export default async function TtlPage() {
  const { user, progressRows, savedIds, hasAny } = await getMyShiurimData()
  const allLectures = getAllLectures()
  const categories = getCategories()

  return (
    <div className="px-4 py-6 sm:p-8 max-w-4xl mx-auto">

      {/* Same masthead and strip as the other library tabs, so switching tabs
          keeps you on the same site rather than dropping you into a bare list. */}
      <SiteHero totalLectures={allLectures.length} categoryCount={categories.length} />

      {user && hasAny && (
        <MyShiurim
          progressRows={progressRows}
          savedIds={savedIds}
          userId={user.id}
        />
      )}

      {/* Library switch — TTL / Shiurim in Yeshiva / All Community Shiurim. */}
      <ScopeTabs />

      {/* The TTL browser sits exactly where "Recently Given" does on the other
          tabs — section switcher first, then the list. */}
      <Suspense fallback={<SectionSkeleton />}>
        <TtlClient userId={user?.id ?? null} />
      </Suspense>
    </div>
  )
}
