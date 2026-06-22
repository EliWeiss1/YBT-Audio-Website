import { randomBytes } from 'crypto'

export type IngestRequest = {
  title: string
  rabbi: string
  description: string
  zoomShareUrl: string
  date: string        // ISO date string from email Date header
  senderEmail: string
}

export type CategorizeResult =
  | { tier: 1; nodePath: string[]; confidence: 'high' }
  | { tier: 2; nodePath: string[]; confidence: 'high' | 'low'; alternatives: string[][] }

export type UploadResult = {
  publicUrl: string
  duration: number    // seconds
  r2Key: string
}

export type IngestOutcome =
  | { status: 'success'; lectureId: string; nodePath: string[]; flagged: boolean }
  | { status: 'failed'; reason: string; zoomShareUrl?: string }

export type PendingLecture = {
  id: string
  title: string
  speaker: string
  date: string
  description: string
  audio_url: string
  duration: number
  tags: string[]
  node_path: string[]
}

export function generateLectureId(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const rand = randomBytes(3).toString('hex')
  return `INGEST-${date}-${rand}`
}
