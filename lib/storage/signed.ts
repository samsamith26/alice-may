import { createClient } from '@/lib/supabase/server'

export const PHOTO_BUCKET = 'trip-photos'
export const DOCUMENT_BUCKET = 'boat-documents'

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

/**
 * Storage policies resolve membership from the first path segment, so the boat
 * id must lead. Getting this wrong denies every upload with no useful error.
 */
export function objectPath(boatId: string, scope: string, fileName: string): string {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80)
  return `${boatId}/${scope}/${crypto.randomUUID()}-${safeName}`
}
