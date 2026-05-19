import { getAllLectures, FlatLecture } from '@/lib/lectures'
import { normalizeRabbi, getRawVariants } from '@/lib/rabbi-normalization'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import RabbiPageClient from './RabbiPageClient'

export const revalidate = 3600

export function generateStaticParams() {
  const all = getAllLectures()
  const canonical = Array.from(
    new Set(all.map(l => normalizeRabbi(l.speaker)).filter(Boolean))
  )
  return canonical.map(name => ({ name: encodeURIComponent(name) }))
}

type Props = { params: Promise<{ name: string }> }

export default async function RabbiPage({ params }: Props) {
  const { name: rawName } = await params
  const canonicalName = decodeURIComponent(rawName)

  // Fetch all speaker overrides so we can apply them to the JSON data
  const supabase = await createClient()
  const { data: overridesData } = await supabase
    .from('speaker_overrides')
    .select('lecture_id, speaker')
  const overrideMap = new Map<string, string>(
    (overridesData ?? []).map((o: { lecture_id: string; speaker: string }) => [o.lecture_id, o.speaker])
  )

  const rawVariants = new Set(getRawVariants(canonicalName))

  // A lecture belongs to this rabbi if:
  // - it has an override pointing to canonicalName, OR
  // - its JSON speaker normalizes to canonicalName AND it has no override pointing elsewhere
  const rabbiLectures = getAllLectures().filter(l => {
    const override = overrideMap.get(l.id)
    if (override !== undefined) return override === canonicalName
    return rawVariants.has(l.speaker)
  })

  if (rabbiLectures.length === 0) notFound()

  // Group by top-level category (first breadcrumb item), sorted by count desc
  const categoryMap = new Map<string, FlatLecture[]>()
  for (const lec of rabbiLectures) {
    const cat = lec.breadcrumb[0] ?? 'Other'
    if (!categoryMap.has(cat)) categoryMap.set(cat, [])
    categoryMap.get(cat)!.push(lec)
  }
  const categories = Array.from(categoryMap.entries())
    .map(([label, lectures]) => ({ label, lectures }))
    .sort((a, b) => b.lectures.length - a.lectures.length)

  return (
    <RabbiPageClient
      canonicalName={canonicalName}
      allLectures={rabbiLectures}
      categories={categories}
    />
  )
}
