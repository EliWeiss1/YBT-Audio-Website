import { Suspense } from 'react'
import TtlClient, { LoadingSkeleton } from './TtlClient'

export const dynamic = 'force-static'

export default function TtlPage() {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <TtlClient />
    </Suspense>
  )
}
