/**
 * Storage constants and path building. Pure — safe to import from client
 * components, unlike lib/storage/signed.ts which pulls in the server client.
 */

export const PHOTO_BUCKET = 'trip-photos'
export const DOCUMENT_BUCKET = 'boat-documents'

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

export const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
]

export const ALLOWED_DOCUMENT_TYPES = ['application/pdf', ...ALLOWED_IMAGE_TYPES]

/**
 * Storage policies resolve membership from the FIRST path segment, so the boat
 * id must lead. Getting this wrong denies every upload with no useful error.
 */
export function objectPath(boatId: string, scope: string, fileName: string): string {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80)
  return `${boatId}/${scope}/${crypto.randomUUID()}-${safeName}`
}

/** Guards the boat-id prefix the storage policy depends on. */
export function isPathWithinBoat(path: string, boatId: string): boolean {
  return path.startsWith(`${boatId}/`)
}

export function describeUploadProblem(file: File, allowed: string[]): string | null {
  if (file.size > MAX_UPLOAD_BYTES) {
    return `${file.name} is larger than 10 MB.`
  }
  if (!allowed.includes(file.type)) {
    return `${file.name} is not a supported file type.`
  }
  return null
}
