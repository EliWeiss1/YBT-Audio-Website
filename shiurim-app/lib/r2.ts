import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
})

/** If `url` points at our R2 public bucket, return its object key (decoded); else null. */
export function r2KeyFromUrl(url: string): string | null {
  const publicUrl = (process.env.R2_PUBLIC_URL ?? '').replace(/\/$/, '')
  if (!publicUrl || !url.startsWith(`${publicUrl}/`)) return null
  return decodeURIComponent(url.slice(publicUrl.length + 1))
}

/** A short-lived signed URL that serves `key` directly from R2 with a forced download filename. */
export function presignR2Download(key: string, filename: string): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME!,
    Key: key,
    ResponseContentDisposition: `attachment; filename="${filename}"`,
    ResponseContentType: 'audio/mpeg',
  })
  return getSignedUrl(r2, command, { expiresIn: 60 })
}
