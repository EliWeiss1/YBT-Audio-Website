import { Suspense } from 'react'
import LecturesClient, { LoadingSkeleton } from './LecturesClient'

export const dynamic = 'force-static'

export default function LecturesPage() {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <LecturesClient />
    </Suspense>
  )
}
