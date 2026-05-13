import { getNodeByPath, getPathToNode, flattenLectures, categories, TreeNode } from '@/lib/lectures'
import LectureCard from '@/components/lectures/LectureCard'
import { createClient } from '@/lib/supabase-server'
import { getAllProgress } from '@/lib/supabase'
import Link from 'next/link'

type Props = {
  searchParams: Promise<{ node?: string }>
}

export default async function LecturesPage({ searchParams }: Props) {
  const { node: nodeId } = await searchParams

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const progress = user ? await getAllProgress(user.id) : []
  const progressMap = Object.fromEntries(progress.map(p => [p.lecture_id, p]))

  const path = nodeId ? getPathToNode(nodeId) : null
  const activeNode = path ? getNodeByPath(path) : null
  const breadcrumb = path ?? []

  return (
    <div className="px-4 py-6 sm:p-8 max-w-4xl mx-auto">
      {/* Header + breadcrumb */}
      <div className="mb-8">
        {breadcrumb.length > 1 && (
          <div className="flex items-center gap-1.5 text-sm text-stone-400 mb-2 flex-wrap">
            <Link href="/lectures" className="hover:text-stone-600">All</Link>
            {breadcrumb.slice(0, -1).map((id, i) => {
              const partialPath = breadcrumb.slice(0, i + 1)
              const node = getNodeByPath(partialPath)
              return node ? (
                <span key={id} className="flex items-center gap-1.5">
                  <span>›</span>
                  <Link href={`/lectures?node=${id}`} className="hover:text-stone-600">
                    {node.label}
                  </Link>
                </span>
              ) : null
            })}
            <span>›</span>
          </div>
        )}
        <h1 className="text-3xl font-bold text-stone-900">
          {activeNode?.label ?? 'All Shiurim'}
        </h1>
        {activeNode && (
          <p className="text-stone-400 text-sm mt-1">
            {flattenLectures(activeNode).length} shiurim
          </p>
        )}
      </div>

      {activeNode ? (
        <NodeContent node={activeNode} progressMap={progressMap} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {categories.map(cat => {
            const total = flattenLectures(cat).length
            return (
              <Link
                key={cat.id}
                href={`/lectures?node=${cat.id}`}
                className="bg-white rounded-xl border border-stone-200 p-5 hover:border-emerald-200 hover:shadow-sm transition-all group"
              >
                <div className="text-3xl mb-3">{cat.icon ?? '📁'}</div>
                <h3 className="font-semibold text-stone-900 group-hover:text-emerald-800 transition-colors mb-1">
                  {cat.label}
                </h3>
                <p className="text-sm text-stone-400">{total} shiurim</p>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

function NodeContent({
  node,
  progressMap,
}: {
  node: TreeNode
  progressMap: Record<string, { position_seconds: number; completed: boolean }>
}) {
  const hasChildren = node.children && node.children.length > 0
  const hasLectures = node.lectures && node.lectures.length > 0

  return (
    <div className="space-y-8">
      {hasChildren && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {node.children!.map(child => {
            const count = flattenLectures(child).length
            const isLeaf = !!child.lectures
            return (
              <Link
                key={child.id}
                href={`/lectures?node=${child.id}`}
                className="bg-white rounded-xl border border-stone-200 p-5 hover:border-emerald-200 hover:shadow-sm transition-all group"
              >
                <h3 className="font-semibold text-stone-900 group-hover:text-emerald-800 transition-colors mb-1">
                  {child.label}
                </h3>
                <p className="text-sm text-stone-400">
                  {count} shiur{count !== 1 ? 'im' : ''}
                  {!isLeaf && child.children && (
                    <span className="ml-1 text-stone-300">
                      · {child.children.length} sections
                    </span>
                  )}
                </p>
              </Link>
            )
          })}
        </div>
      )}

      {hasLectures && (
        <div>
          {hasChildren && (
            <h2 className="text-sm font-semibold text-stone-500 uppercase tracking-wide mb-3">
              General
            </h2>
          )}
          <div className="space-y-2">
            {node.lectures!.map((lecture, i) => (
              <LectureCard
                key={`${node.id}-${lecture.id}`}
                lecture={lecture}
                index={i + 1}
                progress={progressMap[lecture.id]}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}