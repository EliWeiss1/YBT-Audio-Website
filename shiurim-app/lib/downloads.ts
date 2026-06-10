// Offline download manager. Audio bytes live in the Cache Storage cache
// 'audio-downloads-v1' (read by public/sw.js, written ONLY here); metadata
// lives in localStorage so list/lookup stay synchronous for the UI.
//
// Downloads go through the same-origin /api/download/[id] proxy — required
// because the upstream hosts (ybt.org, yutorah.org) don't send CORS headers,
// and a same-origin response is fully cacheable + sliceable for seeking.

import type { FlatLecture } from '@/lib/lecture-utils'

const AUDIO_CACHE = 'audio-downloads-v1'
const META_KEY = 'downloads:v1'
const CHANGED_EVENT = 'ybt-downloads-changed'

export type DownloadRecord = {
  lectureId: string
  title: string
  speaker: string
  breadcrumb: string[]
  duration: number
  bytes: number
  downloadedAt: string
}

export function downloadUrl(lectureId: string): string {
  return `/api/download/${encodeURIComponent(lectureId)}`
}

export function isDownloadSupported(): boolean {
  return typeof window !== 'undefined' && 'caches' in window
}

// ── Metadata ─────────────────────────────────────────────────────────────────

export function listDownloads(): DownloadRecord[] {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(localStorage.getItem(META_KEY) ?? '[]')
  } catch {
    return []
  }
}

function writeRecords(records: DownloadRecord[]) {
  localStorage.setItem(META_KEY, JSON.stringify(records))
  window.dispatchEvent(new CustomEvent(CHANGED_EVENT))
}

export function isDownloaded(lectureId: string): boolean {
  return listDownloads().some(r => r.lectureId === lectureId)
}

/** Subscribe to download list changes. Returns an unsubscribe function. */
export function onDownloadsChanged(handler: () => void): () => void {
  window.addEventListener(CHANGED_EVENT, handler)
  return () => window.removeEventListener(CHANGED_EVENT, handler)
}

// ── Download / delete ────────────────────────────────────────────────────────

export async function downloadLecture(
  lecture: Pick<FlatLecture, 'id' | 'title' | 'speaker' | 'duration'> & { breadcrumb?: string[] },
  onProgress?: (receivedBytes: number, totalBytes: number) => void
): Promise<void> {
  if (!isDownloadSupported()) throw new Error('Downloads are not supported in this browser')

  const res = await fetch(downloadUrl(lecture.id))
  if (!res.ok || !res.body) throw new Error(`Download failed (${res.status})`)

  const totalBytes = Number(res.headers.get('Content-Length') ?? 0)
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let receivedBytes = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    receivedBytes += value.length
    onProgress?.(receivedBytes, totalBytes)
  }

  const blob = new Blob(chunks as BlobPart[], {
    type: res.headers.get('Content-Type') ?? 'audio/mpeg',
  })
  const cache = await caches.open(AUDIO_CACHE)
  await cache.put(
    downloadUrl(lecture.id),
    new Response(blob, {
      headers: {
        'Content-Type': blob.type,
        'Content-Length': String(blob.size),
        'Accept-Ranges': 'bytes',
      },
    })
  )

  const records = listDownloads().filter(r => r.lectureId !== lecture.id)
  records.unshift({
    lectureId: lecture.id,
    title: lecture.title,
    speaker: lecture.speaker,
    breadcrumb: lecture.breadcrumb ?? [],
    duration: lecture.duration,
    bytes: blob.size,
    downloadedAt: new Date().toISOString(),
  })
  writeRecords(records)

  // Ask the browser to protect our storage from automatic eviction.
  // Best-effort; Chrome on Android honors this for installed PWAs.
  try {
    await navigator.storage?.persist?.()
  } catch {
    /* unsupported — fine */
  }
}

export async function deleteDownload(lectureId: string): Promise<void> {
  if (isDownloadSupported()) {
    const cache = await caches.open(AUDIO_CACHE)
    await cache.delete(downloadUrl(lectureId))
  }
  writeRecords(listDownloads().filter(r => r.lectureId !== lectureId))
}

// ── Playback resolution ──────────────────────────────────────────────────────

/** The src the player should use: the cached same-origin copy when this
 *  lecture is downloaded AND a service worker is in control (it serves the
 *  cache, with Range support); otherwise the original streaming URL. */
export function resolveAudioSrc(lecture: Pick<FlatLecture, 'id' | 'audioUrl'>): string {
  if (
    isDownloaded(lecture.id) &&
    typeof navigator !== 'undefined' &&
    navigator.serviceWorker?.controller
  ) {
    return downloadUrl(lecture.id)
  }
  return lecture.audioUrl
}

// ── Storage info / hygiene ───────────────────────────────────────────────────

export function totalDownloadedBytes(): number {
  return listDownloads().reduce((acc, r) => acc + (r.bytes ?? 0), 0)
}

export async function getStorageEstimate(): Promise<{ usage: number; quota: number } | null> {
  try {
    const est = await navigator.storage?.estimate?.()
    if (!est) return null
    return { usage: est.usage ?? 0, quota: est.quota ?? 0 }
  } catch {
    return null
  }
}

/** Reconcile metadata with the actual cache (e.g. after the browser evicted
 *  storage). Returns the verified list. */
export async function verifyDownloads(): Promise<DownloadRecord[]> {
  if (!isDownloadSupported()) return []
  const records = listDownloads()
  const cache = await caches.open(AUDIO_CACHE)
  const keys = await cache.keys()
  const cachedUrls = new Set(keys.map(req => new URL(req.url).pathname))
  const verified = records.filter(r => cachedUrls.has(downloadUrl(r.lectureId)))
  if (verified.length !== records.length) writeRecords(verified)
  return verified
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} B`
}
