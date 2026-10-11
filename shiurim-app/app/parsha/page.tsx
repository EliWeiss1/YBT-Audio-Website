import Link from 'next/link'
import { getWeeklyParshiyot, formatParshaTitle } from '@/lib/parsha'
import { getParshaLectures } from '@/lib/parsha-server'
import { getMyShiurimData } from '@/lib/my-shiurim-server'
import ParshaShiurim from '@/components/lectures/ParshaShiurim'

export const metadata = { title: 'Parsha of the Week · YBT Shiurim' }

// The parsha turns over on Sunday, so this must be computed per request, not
// frozen at build time.
export const dynamic = 'force-dynamic'

export default async function ParshaPage() {
  const { user } = await getMyShiurimData()
  const parshiyot = getWeeklyParshiyot()
  const sections = parshiyot.map(p => ({ ...p, lectures: getParshaLectures(p) }))

  return (
    <div className="px-4 py-6 sm:p-8 max-w-4xl mx-auto">
      <p className="text-xs text-stone-400 tracking-widest uppercase mb-1">Parsha of the week</p>
      <h1 className="text-3xl font-bold text-stone-900 mb-1">
        {parshiyot.length ? `Parshas ${formatParshaTitle(parshiyot)}` : 'Parsha of the week'}
      </h1>
      <p className="text-stone-500 mb-6">
        Shiurim on this week&apos;s parsha, newest first.{' '}
        {parshiyot.map((p, i) => (
          <span key={p.nodeId}>
            {i > 0 && ' · '}
            <Link
              href={`/lectures?node=${p.nodeId}`}
              className="text-emerald-700 hover:text-emerald-800"
            >
              All of {p.name} →
            </Link>
          </span>
        ))}
      </p>

      {parshiyot.length === 0 ? (
        <p className="text-sm text-stone-400">Couldn&apos;t work out this week&apos;s parsha.</p>
      ) : (
        <ParshaShiurim sections={sections} userId={user?.id ?? null} />
      )}
    </div>
  )
}
