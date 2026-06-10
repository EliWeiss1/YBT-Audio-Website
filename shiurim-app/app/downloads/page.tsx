'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { formatDuration } from '@/lib/lecture-utils'
import { usePlayer } from '@/lib/player-context'
import {
  listDownloads,
  deleteDownload,
  verifyDownloads,
  onDownloadsChanged,
  totalDownloadedBytes,
  getStorageEstimate,
  formatBytes,
  type DownloadRecord,
} from '@/lib/downloads'

export default function DownloadsPage() {
  const { play, pause, isPlaying, lecture: activeLecture } = usePlayer()
  const [records, setRecords] = useState<DownloadRecord[] | null>(null)
  const [estimate, setEstimate] = useState<{ usage: number; quota: number } | null>(null)
  const [offline, setOffline] = useState(false)
  const [confirming, setConfirming] = useState<string | null>(null)

  const refresh = useCallback(() => {
    setRecords(listDownloads())
    getStorageEstimate().then(setEstimate)
  }, [])

  useEffect(() => {
    // Reconcile metadata with what's actually in the cache, then render.
    verifyDownloads().then(() => refresh()).catch(() => refresh())
    const unsub = onDownloadsChanged(refresh)

    setOffline(!navigator.onLine)
    const onOnline = () => setOffline(false)
    const onOffline = () => setOffline(true)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      unsub()
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [refresh])

  const handleDelete = async (lectureId: string) => {
    if (confirming !== lectureId) {
      setConfirming(lectureId)
      setTimeout(() => setConfirming(c => (c === lectureId ? null : c)), 3000)
      return
    }
    setConfirming(null)
    await deleteDownload(lectureId)
  }

  const totalBytes = totalDownloadedBytes()

  return (
    <div className="px-4 py-6 sm:p-8 max-w-3xl mx-auto">

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-stone-900">Downloads</h1>
        <p className="text-sm text-stone-400 mt-1">
          Saved to this device — they play anywhere, even with no connection.
        </p>
      </div>

      {/* Offline banner */}
      {offline && (
        <div className="mb-5 flex items-center gap-2.5 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
          <span className="text-base">📡</span>
          You&apos;re offline — your downloaded shiurim still play below.
        </div>
      )}

      {/* Storage summary */}
      {records !== null && records.length > 0 && (
        <div className="mb-6 rounded-xl border border-stone-200 bg-white px-4 py-3 flex items-center justify-between gap-4">
          <div className="text-sm text-stone-600">
            <span className="font-semibold text-stone-800">{records.length}</span>
            {records.length === 1 ? ' shiur' : ' shiurim'}
            <span className="text-stone-300 mx-1.5">·</span>
            <span className="tabular-nums">{formatBytes(totalBytes)}</span>
          </div>
          {estimate && estimate.quota > 0 && (
            <div className="text-xs text-stone-400 tabular-nums shrink-0">
              {formatBytes(estimate.usage)} of {formatBytes(estimate.quota)} device storage used
            </div>
          )}
        </div>
      )}

      {/* Loading */}
      {records === null && (
        <div className="flex items-center justify-center py-16 text-stone-300 text-sm">Loading…</div>
      )}

      {/* Empty state */}
      {records !== null && records.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
          <div className="w-16 h-16 rounded-full bg-stone-100 flex items-center justify-center">
            <svg className="w-7 h-7 text-stone-300" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v10m0 0l-3.5-3.5M12 13l3.5-3.5M4 17.5V19a2 2 0 002 2h12a2 2 0 002-2v-1.5" />
            </svg>
          </div>
          <p className="text-sm font-medium text-stone-600">No downloads yet</p>
          <p className="text-xs text-stone-400 max-w-xs leading-relaxed">
            Tap the <span className="inline-flex items-center justify-center w-4 h-4 align-middle rounded-full bg-stone-100 text-stone-400 mx-0.5">
              <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v10m0 0l-3.5-3.5M12 13l3.5-3.5M4 17.5V19a2 2 0 002 2h12a2 2 0 002-2v-1.5" />
              </svg>
            </span> icon on any shiur to save it for offline listening.
          </p>
          <Link
            href="/lectures"
            className="mt-2 px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-medium transition-colors"
          >
            Browse shiurim
          </Link>
        </div>
      )}

      {/* Download list */}
      {records !== null && records.length > 0 && (
        <div className="space-y-2">
          {records.map(rec => {
            const isActive = activeLecture?.id === rec.lectureId
            const isThisPlaying = isActive && isPlaying
            const breadcrumb = rec.breadcrumb.length > 1
              ? rec.breadcrumb.slice(0, -1).join(' › ')
              : rec.speaker

            return (
              <div
                key={rec.lectureId}
                className={`group flex items-start gap-3 rounded-xl border p-4 transition-all
                  ${isActive ? 'border-emerald-300 bg-emerald-50/50' : 'border-stone-100 bg-white'}`}
              >
                <button
                  onClick={() => isThisPlaying ? pause() : play(rec.lectureId, 0)}
                  className={`mt-0.5 w-9 h-9 rounded-full shrink-0 flex items-center justify-center
                    text-sm transition-colors
                    ${isActive
                      ? 'bg-emerald-700 text-white'
                      : 'bg-stone-100 text-stone-400 hover:bg-emerald-100 hover:text-emerald-700'}`}
                  aria-label={isThisPlaying ? 'Pause' : 'Play'}
                >
                  {isThisPlaying ? '⏸' : '▶'}
                </button>

                <Link href={`/lectures/${encodeURIComponent(rec.lectureId)}`} className="flex-1 min-w-0">
                  <p className={`text-sm font-medium leading-snug
                    ${isActive ? 'text-emerald-800' : 'text-stone-800'}`}>
                    {rec.title}
                  </p>
                  {breadcrumb && (
                    <p className="text-xs text-stone-400 truncate mt-0.5">{breadcrumb}</p>
                  )}
                  <p className="text-xs text-stone-300 mt-1 tabular-nums">
                    {rec.duration > 0 && <>{formatDuration(rec.duration)}<span className="mx-1.5">·</span></>}
                    {formatBytes(rec.bytes)}
                    <span className="mx-1.5">·</span>
                    <span className="inline-flex items-center gap-1 text-emerald-600/80">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      offline
                    </span>
                  </p>
                </Link>

                <button
                  onClick={() => handleDelete(rec.lectureId)}
                  className={`shrink-0 p-1.5 rounded-lg transition-colors
                    ${confirming === rec.lectureId
                      ? 'text-red-500 bg-red-50 ring-1 ring-red-200'
                      : 'text-stone-300 hover:text-red-400 hover:bg-red-50'}`}
                  title={confirming === rec.lectureId ? 'Tap again to remove' : 'Remove download'}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Storage note */}
      {records !== null && records.length > 0 && (
        <p className="mt-6 text-[11px] text-stone-300 leading-relaxed">
          Downloads are stored by your browser on this device. Clearing site data removes them.
        </p>
      )}
    </div>
  )
}
