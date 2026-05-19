'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { FlatLecture } from '@/lib/lectures'
import LectureListWithProgress from '@/components/lectures/LectureListWithProgress'

type CategoryGroup = { label: string; lectures: FlatLecture[] }

type Props = {
  canonicalName: string
  allLectures: FlatLecture[]
  categories: CategoryGroup[]
}

export default function RabbiPageClient({ canonicalName, allLectures, categories }: Props) {
  const [activeTab, setActiveTab] = useState<string>('All')

  const visibleLectures = activeTab === 'All'
    ? allLectures
    : (categories.find(c => c.label === activeTab)?.lectures ?? [])

  const tabs = ['All', ...categories.map(c => c.label)]

  return (
    <div className="px-4 py-6 sm:p-8 max-w-4xl mx-auto">

      {/* Back link */}
      <Link
        href="/lectures"
        className="inline-flex items-center gap-1.5 text-sm text-stone-400 hover:text-stone-600 transition-colors mb-6"
      >
        ← All Shiurim
      </Link>

      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-800 flex items-center
                          justify-content-center font-medium text-sm shrink-0 flex items-center justify-center">
            {canonicalName.split(' ').map(w => w[0]).slice(0, 2).join('')}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-stone-900">{canonicalName}</h1>
            <p className="text-sm text-stone-400">
              {allLectures.length} shiur{allLectures.length !== 1 ? 'im' : ''}
              {' · '}{categories.length} categor{categories.length !== 1 ? 'ies' : 'y'}
            </p>
          </div>
        </div>
      </div>

      {/* Category tabs */}
      <div className="flex gap-0 overflow-x-auto mb-6 border-b border-stone-200 -mx-4 px-4 sm:mx-0 sm:px-0">
        {tabs.map(tab => {
          const count = tab === 'All'
            ? allLectures.length
            : (categories.find(c => c.label === tab)?.lectures.length ?? 0)
          const isActive = tab === activeTab
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`shrink-0 px-3 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap
                ${isActive
                  ? 'border-emerald-600 text-emerald-700'
                  : 'border-transparent text-stone-400 hover:text-stone-600 hover:border-stone-300'}`}
            >
              {tab}
              <span className={`ml-1.5 text-xs ${isActive ? 'text-emerald-500' : 'text-stone-300'}`}>
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {/* Lecture list */}
      <LectureListWithProgress
        lectures={visibleLectures}
        nodeId={`rabbi-${canonicalName}-${activeTab}`}
      />

    </div>
  )
}
