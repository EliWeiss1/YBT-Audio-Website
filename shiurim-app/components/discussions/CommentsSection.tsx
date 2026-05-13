'use client'

import { useState } from 'react'
import { postComment } from '@/lib/supabase'
import { formatDistanceToNow } from 'date-fns'

type Comment = {
  id: string
  body: string
  parent_id: string | null
  created_at: string
  profiles: { display_name: string; username: string; avatar_url: string | null }
}

type Props = {
  lectureId: string
  initialComments: Comment[]
  userId?: string
  userDisplayName?: string
}

export default function CommentsSection({ lectureId, initialComments, userId, userDisplayName }: Props) {
  const [comments, setComments] = useState<Comment[]>(initialComments)
  const [newComment, setNewComment] = useState('')
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const topLevel = comments.filter(c => !c.parent_id)
  const replies = (parentId: string) => comments.filter(c => c.parent_id === parentId)

  const handleSubmit = async (body: string, parentId?: string) => {
    if (!userId || !body.trim()) return
    setSubmitting(true)
    const { data, error } = await postComment(userId, lectureId, body.trim(), parentId)
    if (!error && data) {
      setComments(prev => [...prev, {
        ...data,
        profiles: { display_name: userDisplayName ?? 'You', username: '', avatar_url: null }
      }])
      if (parentId) { setReplyTo(null); setReplyText('') }
      else setNewComment('')
    }
    setSubmitting(false)
  }

  return (
    <div className="mt-2">
      <h2 className="text-xl font-bold text-stone-900 mb-6 flex items-center gap-2">
        💬 Discussion
        <span className="text-sm font-normal text-stone-400">{topLevel.length} questions/comments</span>
      </h2>

      {/* New comment box */}
      {userId ? (
        <div className="mb-8">
          <textarea
            value={newComment}
            onChange={e => setNewComment(e.target.value)}
            placeholder="Ask a question or share a thought about this shiur..."
            rows={3}
            className="w-full px-4 py-3 rounded-xl border border-stone-200 text-sm resize-none
                       focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400"
          />
          <div className="flex justify-end mt-2">
            <button
              onClick={() => handleSubmit(newComment)}
              disabled={!newComment.trim() || submitting}
              className="px-5 py-2 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50
                         text-white text-sm font-medium rounded-lg transition-colors"
            >
              {submitting ? 'Posting...' : 'Post'}
            </button>
          </div>
        </div>
      ) : (
        <div className="mb-8 p-4 bg-stone-50 rounded-xl border border-stone-200 text-sm text-stone-500 text-center">
          <a href="/auth" className="text-emerald-700 font-medium hover:underline">Sign in</a> to join the discussion
        </div>
      )}

      {/* Comment list */}
      <div className="space-y-6">
        {topLevel.length === 0 && (
          <p className="text-stone-400 text-sm text-center py-6">
            No comments yet — be the first to ask a question!
          </p>
        )}

        {topLevel.map(comment => (
          <div key={comment.id}>
            <CommentBubble comment={comment} />

            {/* Replies */}
            <div className="ml-10 mt-3 space-y-3">
              {replies(comment.id).map(reply => (
                <CommentBubble key={reply.id} comment={reply} isReply />
              ))}

              {/* Reply input */}
              {replyTo === comment.id ? (
                <div>
                  <textarea
                    value={replyText}
                    onChange={e => setReplyText(e.target.value)}
                    placeholder="Write a reply..."
                    rows={2}
                    autoFocus
                    className="w-full px-3 py-2 rounded-lg border border-stone-200 text-sm resize-none
                               focus:outline-none focus:border-emerald-400"
                  />
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => handleSubmit(replyText, comment.id)}
                      disabled={!replyText.trim() || submitting}
                      className="px-4 py-1.5 bg-emerald-700 text-white text-xs font-medium rounded-lg
                                 hover:bg-emerald-800 disabled:opacity-50 transition-colors"
                    >
                      Reply
                    </button>
                    <button
                      onClick={() => setReplyTo(null)}
                      className="px-4 py-1.5 text-stone-500 text-xs hover:text-stone-700 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : userId && (
                <button
                  onClick={() => setReplyTo(comment.id)}
                  className="text-xs text-stone-400 hover:text-emerald-700 transition-colors"
                >
                  ↩ Reply
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function CommentBubble({ comment, isReply = false }: { comment: Comment; isReply?: boolean }) {
  const initials = (comment.profiles.display_name ?? 'A')
    .split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()

  return (
    <div className="flex gap-3">
      <div className={`${isReply ? 'w-7 h-7 text-xs' : 'w-9 h-9 text-sm'} rounded-full bg-emerald-100
                      text-emerald-800 font-bold flex items-center justify-center shrink-0`}>
        {initials}
      </div>
      <div className="flex-1">
        <div className="flex items-baseline gap-2 mb-1">
          <span className="text-sm font-semibold text-stone-800">
            {comment.profiles.display_name ?? 'Anonymous'}
          </span>
          <span className="text-xs text-stone-400">
            {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
          </span>
        </div>
        <p className="text-sm text-stone-700 leading-relaxed">{comment.body}</p>
      </div>
    </div>
  )
}
