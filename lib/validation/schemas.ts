import { z } from 'zod'

/**
 * An empty form field means "not recorded", never zero. Coercing '' to 0 would
 * silently claim a trip burned no fuel or covered no distance.
 */
const optionalNumber = (label: string, min?: number, max?: number) =>
  z.preprocess(
    (raw) => {
      if (raw === '' || raw === null || raw === undefined) return null
      const parsed = Number(raw)
      return Number.isFinite(parsed) ? parsed : raw
    },
    z
      .number({ message: `${label} must be a number` })
      .refine((v) => min === undefined || v >= min, `${label} cannot be below ${min}`)
      .refine((v) => max === undefined || v <= max, `${label} cannot be above ${max}`)
      .nullable(),
  )

const optionalText = z.preprocess(
  (raw) => (typeof raw === 'string' && raw.trim() === '' ? null : raw),
  z.string().trim().max(5000).nullable(),
)

const optionalTime = z.preprocess(
  (raw) => (raw === '' || raw === null || raw === undefined ? null : raw),
  z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, 'Use a 24-hour time like 07:30')
    .nullable(),
)

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date')

export const tripSchema = z
  .object({
    id: z.preprocess(
      (raw) => (raw === '' || raw === undefined ? null : raw),
      z.uuid().nullable(),
    ),
    trip_date: isoDate,
    departure_time: optionalTime,
    return_time: optionalTime,
    engine_hours_start: optionalNumber('Engine hours at start', 0),
    engine_hours_end: optionalNumber('Engine hours at end', 0),
    fuel_from_full_start_gal: optionalNumber('Gallons used at start', 0),
    fuel_added_gal: optionalNumber('Fuel added', 0),
    fuel_from_full_end_gal: optionalNumber('Gallons used at end', 0),
    fuel_price_per_gal: optionalNumber('Fuel price', 0),
    distance_nm: optionalNumber('Distance', 0),
    start_lat: optionalNumber('Start latitude', -90, 90),
    start_lng: optionalNumber('Start longitude', -180, 180),
    end_lat: optionalNumber('End latitude', -90, 90),
    end_lng: optionalNumber('End longitude', -180, 180),
    notes: optionalText,
  })
  .refine(
    (data) =>
      data.engine_hours_start === null ||
      data.engine_hours_end === null ||
      data.engine_hours_end >= data.engine_hours_start,
    {
      message: 'Engine hours at end cannot be lower than at start',
      path: ['engine_hours_end'],
    },
  )

export type TripInput = z.infer<typeof tripSchema>

export const poiSchema = z.object({
  id: z.preprocess(
    (raw) => (raw === '' || raw === undefined ? null : raw),
    z.uuid().nullable(),
  ),
  name: z.string().trim().min(1, 'Give the site a name').max(120),
  category: z.enum(['dive site', 'anchorage', 'fishing spot', 'other']),
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  depth_ft: optionalNumber('Depth', 0),
  notes: optionalText,
})

export const maintenanceLogSchema = z.object({
  id: z.preprocess(
    (raw) => (raw === '' || raw === undefined ? null : raw),
    z.uuid().nullable(),
  ),
  service_date: isoDate,
  service_type: z.string().trim().min(1, 'Pick a service type').max(120),
  engine_hours_at_service: optionalNumber('Engine hours', 0),
  cost: optionalNumber('Cost', 0),
  performed_by: optionalText,
  notes: optionalText,
})

export const documentSchema = z.object({
  id: z.preprocess(
    (raw) => (raw === '' || raw === undefined ? null : raw),
    z.uuid().nullable(),
  ),
  type: z.string().trim().min(1, 'Pick a document type').max(80),
  label: optionalText,
  expires_on: z.preprocess(
    (raw) => (raw === '' || raw === null || raw === undefined ? null : raw),
    isoDate.nullable(),
  ),
})

export const allowedEmailSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email('Enter a valid email address')),
  role: z.enum(['crew', 'viewer']),
  note: optionalText,
})

export const crewSchema = z.object({
  id: z.preprocess(
    (raw) => (raw === '' || raw === undefined ? null : raw),
    z.uuid().nullable(),
  ),
  name: z.string().trim().min(1, 'Enter a name').max(120),
  emergency_contact_name: optionalText,
  emergency_contact_phone: optionalText,
})

export const floatPlanSchema = z.object({
  departure_at: z.string().min(1, 'Set a departure time'),
  planned_return_at: z.string().min(1, 'Set a planned return time'),
  departure_point: optionalText,
  destination_notes: optionalText,
  shore_contact_name: optionalText,
})

/* ------------------------------------------------------------------ auth -- */

/**
 * Must match Authentication → Providers → Email → Minimum password length in
 * the Supabase dashboard. The server enforces its own copy; this one is here
 * so a short password is caught before the request rather than after.
 */
export const PASSWORD_MIN = 10

/** bcrypt, which Supabase hashes with, ignores everything past 72 bytes. */
export const PASSWORD_MAX = 72

const emailField = z
  .string({ message: 'Enter your email address' })
  .trim()
  .toLowerCase()
  .pipe(z.email('Enter a valid email address'))

const newPassword = z
  .string({ message: 'Choose a password' })
  .min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters`)
  .refine(
    (value) => new TextEncoder().encode(value).length <= PASSWORD_MAX,
    `Keep it under ${PASSWORD_MAX} characters`,
  )

/**
 * Sign-in deliberately checks nothing about the password beyond its presence.
 * Applying the length rule here would tell someone guessing that a short
 * password cannot be right, and would lock out an account whose password
 * predates a change to the minimum.
 */
export const signInSchema = z.object({
  email: emailField,
  password: z.string({ message: 'Enter your password' }).min(1, 'Enter your password'),
})

const passwordPair = z.object({
  password: newPassword,
  confirm_password: z.string({ message: 'Type the password again' }),
})

const pairMatches = (data: { password: string; confirm_password: string }) =>
  data.password === data.confirm_password

const mismatch = {
  message: 'The two passwords don’t match',
  path: ['confirm_password'],
}

export const signUpSchema = passwordPair
  .extend({ email: emailField })
  .refine(pairMatches, mismatch)

export const forgotPasswordSchema = z.object({ email: emailField })

export const updatePasswordSchema = passwordPair.refine(pairMatches, mismatch)

/** The first message for each field, which is all a form shows at once. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? 'form')
    out[key] ??= issue.message
  }
  return out
}
