import { randomBytes } from 'crypto'

// When a Zoom share link holds more than one recording, the rebbe can (optionally)
// tell the pipeline what to do with the extra clips via a keyword line in the email:
//   `merge`    → concatenate every clip into one shiur
//   `separate` → one shiur per clip, titled from `titles` in order
//   `only N`   → keep only the Nth recording (1-based) and discard the rest, e.g. the
//                first recording was a mistake — `index` holds N
// Absent entirely = today's single-recording behavior.
export type RecordingPlan = {
  mode: 'merge' | 'separate' | 'pick'
  titles: string[]    // merge/pick → [title]; separate → [line-1 title, ...each title line after the keyword]
  index?: number      // 'pick' only: 1-based recording to keep
}

export type IngestRequest = {
  title: string
  rabbi: string
  description: string
  recordingUrl: string
  date: string        // ISO date string from email Date header
  senderEmail: string
  multi?: RecordingPlan
}

export type CategorizeResult =
  | { tier: 1; nodePath: string[]; confidence: 'high' }
  | { tier: 2; nodePath: string[]; confidence: 'high' | 'low'; alternatives: string[][] }

export type UploadResult = {
  publicUrl: string
  duration: number    // seconds
  r2Key: string
}

export type ParseResult =
  | { ok: true; data: IngestRequest }
  | { ok: false; reason: 'no_title' | 'no_recording_url' | 'no_separate_titles'; senderEmail: string; subject: string }

export type IngestOutcome =
  | { status: 'success'; lectureId: string; nodePath: string[]; flagged: boolean }
  | { status: 'failed'; reason: string; recordingUrl?: string }

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
