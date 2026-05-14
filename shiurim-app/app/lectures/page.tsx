import { getNodeByPath, getPathToNode, flattenLectures, categories, TreeNode, Lecture } from '@/lib/lectures'
import LectureCard from '@/components/lectures/LectureCard'
import { createClient } from '@/lib/supabase-server'
import { getAllProgress } from '@/lib/supabase'
import Link from 'next/link'

type Props = {
  searchParams: Promise<{ node?: string; rabbi?: string }>
}

export default async function LecturesPage({ searchParams }: Props) {
  const { node: nodeId, rabbi: rabbiParam } = await searchParams

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
        <NodeContent node={activeNode} progressMap={progressMap} rabbiFilter={rabbiParam} />
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

function RabbiFilter({
  lectures,
  nodeId,
  activeRabbi,
}: {
  lectures: Lecture[]
  nodeId: string
  activeRabbi: string | undefined
}) {
  const speakers = Array.from(new Set(lectures.map(l => l.speaker).filter(Boolean))).sort()
  if (speakers.length < 2) return null

  return (
    <div className="flex items-center gap-2 flex-wrap mb-5">
      <Link
        href={`/lectures?node=${nodeId}`}
        className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border transition-colors
          ${!activeRabbi
            ? 'bg-emerald-700 text-white border-emerald-700'
            : 'border-stone-200 text-stone-500 hover:border-stone-300 hover:text-stone-700'}`}
      >
        All
      </Link>
      {speakers.map(speaker => {
        const isActive = activeRabbi === speaker
        return (
          <Link
            key={speaker}
            href={`/lectures?node=${nodeId}&rabbi=${encodeURIComponent(speaker)}`}
            className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border transition-colors
              ${isActive
                ? 'bg-emerald-700 text-white border-emerald-700'
                : 'border-stone-200 text-stone-500 hover:border-stone-300 hover:text-stone-700'}`}
          >
            {speaker}
          </Link>
        )
      })}
    </div>
  )
}

function NodeContent({
  node,
  progressMap,
  rabbiFilter,
}: {
  node: TreeNode
  progressMap: Record<string, { position_seconds: number; completed: boolean }>
  rabbiFilter: string | undefined
}) {
  const hasChildren = node.children && node.children.length > 0
  const hasLectures = node.lectures && node.lectures.length > 0

  const filteredLectures = hasLectures
    ? (rabbiFilter
        ? node.lectures!.filter(l => l.speaker === rabbiFilter)
        : node.lectures!)
    : []

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

          <RabbiFilter
            lectures={node.lectures!}
            nodeId={node.id}
            activeRabbi={rabbiFilter}
          />

          {filteredLectures.length === 0 ? (
            <p className="text-sm text-stone-400 py-4">No shiurim found for this filter.</p>
          ) : (
            <div className="space-y-2">
              {filteredLectures.map((lecture, i) => (
                <LectureCard
                  key={`${node.id}-${lecture.id}`}
                  lecture={lecture}
                  index={i + 1}
                  progress={progressMap[lecture.id]}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
