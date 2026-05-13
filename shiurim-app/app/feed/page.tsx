import { getFeedComments } from '@/lib/supabase'
import { getLectureById } from '@/lib/lectures'
import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'

export const revalidate = 60 // Revalidate every 60 seconds

export default async function FeedPage() {
  const comments = await getFeedComments(30)

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-stone-900">Discussion Feed</h1>
        <p className="text-stone-500 mt-1">Recent questions and comments across all shiurim</p>
      </div>

      <div className="space-y-4">
        {comments.length === 0 && (
          <div className="text-center py-16 text-stone-400">
            <div className="text-4xl mb-3">💬</div>
            <p>No discussions yet. Be the first to ask a question!</p>
          </div>
        )}

        {comments.map((comment: any) => {
          const lecture = getLectureById(comment.lecture_id)
          const initials = (comment.display_name ?? 'A')
            .split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()

          return (
            <Link
              key={comment.id}
              href={`/lectures/${comment.lecture_id}#comments`}
              className="block bg-white rounded-xl border border-stone-200 p-5 hover:border-emerald-200
                         hover:shadow-sm transition-all group"
            >
              {/* Lecture reference */}
              {lecture && (
                <div className="text-xs text-emerald-700 font-medium mb-3 flex items-center gap-1">
                  <span>📖</span>
                  <span>{lecture.categoryLabel} › {lecture.subcategoryLabel} › {lecture.title}</span>
                </div>
              )}

              {/* Comment body */}
              <p className="text-stone-800 text-sm leading-relaxed mb-3 line-clamp-3">
                {comment.body}
              </p>

              {/* Author + time */}
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold
                                flex items-center justify-center">
                  {initials}
                </div>
                <span className="text-xs font-medium text-stone-600">
                  {comment.display_name ?? 'Anonymous'}
                </span>
                <span className="text-xs text-stone-400">·</span>
                <span className="text-xs text-stone-400">
                  {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
                </span>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
