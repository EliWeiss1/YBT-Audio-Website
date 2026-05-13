import { getLectureById, getAdjacentLectures, formatDuration } from '@/lib/lectures'
import { getLectureComments } from '@/lib/supabase'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import LecturePlayer from '@/components/player/LecturePlayer'
import CommentsSection from '@/components/discussions/CommentsSection'
import DescriptionSection from '@/components/lectures/DescriptionSection'
import Link from 'next/link'
import { format } from 'date-fns'

type Props = {
  params: Promise<{ id: string }>
}

export default async function LecturePage({ params }: Props) {
  const { id: rawId } = await params
  // Next.js 16 + Turbopack doesn't decode dynamic route params, so do it ourselves
  const id = decodeURIComponent(rawId)
  const lecture = getLectureById(id)
  if (!lecture) notFound()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [comments, descriptionRow] = await Promise.all([
    getLectureComments(id),
    supabase
      .from('lecture_descriptions')
      .select('body')
      .eq('lecture_id', id)
      .maybeSingle(),
  ])

  // Supabase-stored description takes precedence over the JSON fallback
  const description = descriptionRow.data?.body ?? lecture.description ?? ''

  const { prev, next } = getAdjacentLectures(id)

  const breadcrumbItems = lecture.breadcrumb

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
        {lecture.speaker && <span>🎓 {lecture.speaker}</span>}
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

      {/* Description — editable by logged-in users */}
      <DescriptionSection
        lectureId={lecture.id}
        initialDescription={description}
        userId={user?.id}
      />

      {/* Audio player */}
      <LecturePlayer lectureId={lecture.id} userId={user?.id} />

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

      {/* Comments */}
      <CommentsSection
        lectureId={lecture.id}
        initialComments={comments}
        userId={user?.id}
        userDisplayName={user?.user_metadata?.full_name}
      />
    </div>
  )
}
