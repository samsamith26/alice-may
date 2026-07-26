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
    fuel_level_start_gal: optionalNumber('Fuel at start', 0),
    fuel_added_gal: optionalNumber('Fuel added', 0),
    fuel_level_end_gal: optionalNumber('Fuel at end', 0),
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
