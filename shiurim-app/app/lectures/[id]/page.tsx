import { getLectureById, getAdjacentLectures, formatDuration, getAllLectures } from '@/lib/lectures'
import { normalizeRabbi } from '@/lib/rabbi-normalization'
import { notFound } from 'next/navigation'
import LectureAuthSection from '@/components/lectures/LectureAuthSection'
import CommentsLoader from '@/components/discussions/CommentsLoader'
import SpeakerEditor from '@/components/lectures/SpeakerEditor'
import Link from 'next/link'
import { format } from 'date-fns'

// Cache each lecture page for 1 hour — drastically reduces server function invocations.
// Auth, comments, and description load client-side after the cached shell is served.
export const revalidate = 3600

type Props = {
  params: Promise<{ id: string }>
}

export default async function LecturePage({ params }: Props) {
  const { id: rawId } = await params
  // Next.js 16 + Turbopack doesn't decode dynamic route params
  const id = decodeURIComponent(rawId)
  const lecture = getLectureById(id)
  if (!lecture) notFound()

  const { prev, next } = getAdjacentLectures(id)
  const breadcrumbItems = lecture.breadcrumb

  // Build the canonical rabbi list for the dropdown, sorted by shiur count (most first)
  const allLectures = getAllLectures()
  const rabbiCounts = new Map<string, number>()
  for (const l of allLectures) {
    const r = normalizeRabbi(l.speaker)
    if (r) rabbiCounts.set(r, (rabbiCounts.get(r) ?? 0) + 1)
  }
  const allRabbis = Array.from(rabbiCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name)

  return (
    <div className="px-4 py-6 sm:p-8 max-w-3xl mx-auto">

      {/* Breadcrumb */}
      <nav className="text-sm text-stone-400 mb-6 flex items-center gap-1.5 flex-wrap">
        <Link href="/lectures" className="hover:text-stone-600 transition-colors">
          All Shiurim
        </Link>
        {breadcrumbItems.map((crumb, i) => (
          <span key={i} className="flex items-center gap-1.5">
            <span>›</span>
            {i === breadcrumbItems.length - 1 ? (
              <Link
                href={`/lectures?node=${lecture.nodeId}`}
                className="hover:text-stone-600 transition-colors"
              >
                {crumb}
              </Link>
            ) : (
              <span>{crumb}</span>
            )}
          </span>
        ))}
      </nav>

      {/* Title */}
      <h1 className="text-3xl font-bold text-stone-900 mb-2">{lecture.title}</h1>

      {/* Meta row */}
      <div className="flex flex-wrap items-center gap-4 text-sm text-stone-500 mb-6">
        {lecture.speaker && (
          <SpeakerEditor
            lectureId={lecture.id}
            defaultSpeaker={normalizeRabbi(lecture.speaker)}
            allRabbis={allRabbis}
          />
        )}
        {lecture.duration > 0 && <span>⏱ {formatDuration(lecture.duration)}</span>}
        {lecture.date && (
          <span>📅 {format(new Date(lecture.date), 'MMM d, yyyy')}</span>
        )}
      </div>

      {/* Tags */}
      {lecture.tags?.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6">
          {lecture.tags.map(tag => (
            <span key={tag}
              className="px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-full text-xs font-medium">
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Description + player — loads client-side after cache hit */}
      <LectureAuthSection
        lectureId={lecture.id}
        jsonDescription={lecture.description ?? ''}
      />

      {/* Prev / Next navigation */}
      <div className="flex justify-between gap-4 my-8">
        {prev ? (
          <Link href={`/lectures/${encodeURIComponent(prev.id)}`}
            className="flex-1 p-4 rounded-xl border border-stone-200 hover:border-emerald-300
                       hover:bg-emerald-50 transition-all group">
            <div className="text-xs text-stone-400 mb-1">← Previous</div>
            <div className="text-sm font-medium text-stone-700 group-hover:text-emerald-800 line-clamp-2">
              {prev.title}
            </div>
            {prev.breadcrumb.length > 1 && (
              <div className="text-xs text-stone-300 mt-1 truncate">
                {prev.breadcrumb.slice(1).join(' › ')}
              </div>
            )}
          </Link>
        ) : <div className="flex-1" />}

        {next ? (
          <Link href={`/lectures/${encodeURIComponent(next.id)}`}
            className="flex-1 p-4 rounded-xl border border-stone-200 hover:border-emerald-300
                       hover:bg-emerald-50 transition-all group text-right">
            <div className="text-xs text-stone-400 mb-1">Next →</div>
            <div className="text-sm font-medium text-stone-700 group-hover:text-emerald-800 line-clamp-2">
              {next.title}
            </div>
            {next.breadcrumb.length > 1 && (
              <div className="text-xs text-stone-300 mt-1 truncate">
                {next.breadcrumb.slice(1).join(' › ')}
              </div>
            )}
          </Link>
        ) : <div className="flex-1" />}
      </div>

      {/* Comments — loads client-side after cache hit */}
      <CommentsLoader lectureId={lecture.id} />

    </div>
  )
}
