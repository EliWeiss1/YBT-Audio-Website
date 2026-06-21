import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { parseBuffer } from 'music-metadata'
import type { UploadResult } from './types'

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
})

export type UploadError =
  | { ok: false; reason: 'download_failed'; detail: string }
  | { ok: false; reason: 'upload_failed'; detail: string }

export async function uploadAudioToR2(
  downloadUrl: string,
  r2Key: string,
): Promise<UploadResult | UploadError> {
  let audioResponse: Response
  try {
    audioResponse = await fetch(downloadUrl)
    if (!audioResponse.ok) throw new Error(`HTTP ${audioResponse.status}`)
  } catch (e) {
    return { ok: false, reason: 'download_failed', detail: String(e) }
  }

  const audioBuffer = Buffer.from(await audioResponse.arrayBuffer())

  // Extract duration from audio metadata
  let duration = 0
  try {
    const meta = await parseBuffer(audioBuffer, { mimeType: 'audio/mpeg' })
    duration = Math.round(meta.format.duration ?? 0)
  } catch {
    // Duration is best-effort; 0 is acceptable
  }

  try {
    await r2.send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Key: r2Key,
      Body: audioBuffer,
      ContentType: 'audio/mpeg',
    }))
  } catch (e) {
    return { ok: false, reason: 'upload_failed', detail: String(e) }
  }

  const publicUrl = `${process.env.R2_PUBLIC_URL}/${r2Key}`
  return { publicUrl, duration, r2Key }
}
