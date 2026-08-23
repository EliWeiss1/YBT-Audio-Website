import { getLectureById, formatDuration, getAllLectures } from '@/lib/lectures'
import { isR2Hosted, lectureIdFromParam, lectureSharePath, parseLectureDate } from '@/lib/lecture-utils'
import { normalizeRabbi } from '@/lib/rabbi-normalization'
import { notFound } from 'next/navigation'
import LectureAuthSection from '@/components/lectures/LectureAuthSection'
import CommentsLoader from '@/components/discussions/CommentsLoader'
import SpeakerEditor from '@/components/lectures/SpeakerEditor'
import BookmarkButton from '@/components/lectures/BookmarkButton'
import ShareButton from '@/components/lectures/ShareButton'
import DownloadButton from '@/components/lectures/DownloadButton'
import BackButton from '@/components/lectures/BackButton'
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
  const decoded = decodeURIComponent(rawId)
  // Resolve either the bare-id form (older links) or the `{slug}--{id}` share
  // form. Try the whole param as an id first, then the id after the "--".
  const lecture = getLectureById(decoded) ?? getLectureById(lectureIdFromParam(decoded))
  if (!lecture) notFound()

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

      {/* Back */}
      <div className="mb-2">
        <BackButton />
      </div>

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
          <span>📅 {format(parseLectureDate(lecture.date), 'MMM d, yyyy')}</span>
        )}
        {lecture.audioUrl && (
          isR2Hosted(lecture.audioUrl) ? (
            <a
              href={`/api/download/${encodeURIComponent(lecture.id)}`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                         bg-stone-100 hover:bg-emerald-50 text-stone-600 hover:text-emerald-700
                         border border-stone-200 hover:border-emerald-300 transition-all
                         text-xs font-medium"
              title="Download MP3"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor"
                   className="w-3.5 h-3.5">
                <path d="M8 1a.75.75 0 0 1 .75.75v6.69l1.97-1.97a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.53a.75.75 0 0 1 1.06-1.06L7.25 8.44V1.75A.75.75 0 0 1 8 1ZM2.5 13.25a.75.75 0 0 1 .75-.75h9.5a.75.75 0 0 1 0 1.5h-9.5a.75.75 0 0 1-.75-.75Z" />
              </svg>
              Download
            </a>
          ) : (
            <span
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                         bg-stone-100 text-stone-400 border border-stone-200
                         cursor-not-allowed text-xs font-medium"
              title="Download is temporarily disabled for this shiur"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor"
                   className="w-3.5 h-3.5">
                <path d="M8 1a.75.75 0 0 1 .75.75v6.69l1.97-1.97a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.53a.75.75 0 0 1 1.06-1.06L7.25 8.44V1.75A.75.75 0 0 1 8 1ZM2.5 13.25a.75.75 0 0 1 .75-.75h9.5a.75.75 0 0 1 0 1.5h-9.5a.75.75 0 0 1-.75-.75Z" />
              </svg>
              Download
            </span>
          )
        )}
        {lecture.pdfUrl && (
          <a
            href={lecture.pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                       bg-stone-100 hover:bg-emerald-50 text-stone-600 hover:text-emerald-700
                       border border-stone-200 hover:border-emerald-300 transition-all
                       text-xs font-medium"
            title="View sources (PDF)"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor"
                 className="w-3.5 h-3.5">
              <path d="M4 1.75C4 .784 4.784 0 5.75 0h4.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0 1 13.25 16h-7.5A1.75 1.75 0 0 1 4 14.25Zm1.75-.25a.25.25 0 0 0-.25.25v12.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25V6h-2.75A1.75 1.75 0 0 1 9 4.25V1.5Zm3.5.311V4.25c0 .138.112.25.25.25h2.439a.25.25 0 0 0-.05-.077l-2.914-2.914a.25.25 0 0 0-.075-.05Z" />
            </svg>
            Sources
          </a>
        )}
        {/* Save offline — stores the audio in the browser cache for offline playback */}
        {lecture.audioUrl && (
          <DownloadButton
            withLabel
            lecture={{
              id: lecture.id,
              title: lecture.title,
              audioUrl: lecture.audioUrl,
              duration: lecture.duration,
              description: '',
              speaker: lecture.speaker,
              date: lecture.date,
              tags: [],
              breadcrumb: lecture.breadcrumb,
            }}
          />
        )}
        {/* Save for later — self-fetches auth + saved state client-side */}
        <BookmarkButton lectureId={lecture.id} size="md" />
        {/* Share — native share sheet on mobile, clipboard copy fallback on desktop */}
        <ShareButton title={lecture.title} sharePath={lectureSharePath(lecture.id, lecture.title)} />
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
        // Authoritative server lecture for the player. description is dropped —
        // it's already passed via jsonDescription and the player never uses it,
        // so this avoids duplicating it in the RSC payload.
        lecture={{ ...lecture, description: '' }}
      />

      {/* Comments — loads client-side after cache hit */}
      <CommentsLoader lectureId={lecture.id} />

    </div>
  )
}
