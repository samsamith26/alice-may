import { createClient } from '@/lib/supabase/server'

export {
  PHOTO_BUCKET,
  DOCUMENT_BUCKET,
  MAX_UPLOAD_BYTES,
  ALLOWED_IMAGE_TYPES,
  ALLOWED_DOCUMENT_TYPES,
  objectPath,
  isPathWithinBoat,
} from './paths'

const DEFAULT_TTL_SECONDS = 3600

/**
 * Both buckets are private, so nothing renders a bucket URL directly — a raw
 * URL would 404 anyway. Every read goes through a short-lived signed link.
 */
export async function signedUrl(
  bucket: string,
  path: string,
  expiresIn = DEFAULT_TTL_SECONDS,
): Promise<string | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn)
  if (error) return null
  return data.signedUrl
}

export async function signedUrls(
  bucket: string,
  paths: string[],
  expiresIn = DEFAULT_TTL_SECONDS,
): Promise<Map<string, string>> {
  if (paths.length === 0) return new Map()

  const supabase = await createClient()
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrls(paths, expiresIn)

  if (error || !data) return new Map()

  const pairs: Array<[string, string]> = []
  for (const row of data) {
    if (row.path && row.signedUrl) pairs.push([row.path, row.signedUrl])
  }
  return new Map(pairs)
}
