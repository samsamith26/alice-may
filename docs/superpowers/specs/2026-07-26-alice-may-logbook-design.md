# Alice May Logbook — Design

**Date:** 2026-07-26
**Status:** Approved
**Source spec:** `alice-may-logbook-spec.md`

A personal boat logbook for a 2009 Jeanneau Merry Fisher 795 with a Yamaha F200,
moored in Monterey Harbor. Each trip records the mechanics — hours, fuel, distance,
crew, notes — and the app automatically attaches the sea, wind, and tide conditions for
that date, time, and place, so nobody has to look them up.

Built in one pass. Section 6 of the source spec lists six phases; they are build order,
not release gates.

## 1. Decisions

Four decisions were taken with the owner before design:

| Decision | Choice | Reason |
| --- | --- | --- |
| Map stack | Leaflet + OSM + OpenSeaMap overlay | No API key, no account, no billing exposure. OpenSeaMap contributes free nautical seamarks — buoys, depth marks, harbour detail — which matter for this use case. |
| Float plan sharing | Unguessable auto-expiring public link | The shore contact may be a neighbour or the marina office, not family. Requiring a login makes the feature useless in the case it exists for. |
| Offline depth | Offline draft capture | Covers the real failure case — logging a trip out of signal range — without a full bidirectional sync engine and its failure modes. |
| Visual direction | Nautical instrument | Read at the helm, in sun, with wet hands. Glanceability beats decoration. |

Two values seeded from the owner: fuel capacity is **72 gal**, and the initial allowlist
holds **one crew email**, `samuel.smith2204@gmail.com`. Further members are added
through the in-app Crew & Access page rather than by hand in SQL.

## 2. Stack

Next.js 16.2 App Router with TypeScript in strict mode, Tailwind v4, Supabase for
Postgres/Auth/Storage, Vitest for pure logic, Leaflet for maps, deployed on Vercel.

Schema changes go through the Supabase MCP as named migrations. No hand-applied DDL.

## 3. Access model

Two roles in an `app_role` enum: `crew` may log and edit; `viewer` is read-only across
boat specs, trip history, stats, and float plans.

Membership is granted by two triggers, so no SQL is ever needed to add a person:

- **On `auth.users` insert** — match `lower(email)` against `allowed_emails` and insert
  the corresponding `boat_members` row. This covers "allowlisted first, signs in later."
- **On `allowed_emails` insert** — if an `auth.users` row already exists for that
  address, grant membership immediately. This covers "signed in first, allowlisted
  later." Without it, anyone who ever attempted a login before being added would be
  permanently stuck, and the failure would be silent.

Both are `SECURITY DEFINER` with a pinned `search_path`.

Someone who signs in without an allowlist match gets an auth user but no membership,
and lands on a "not on the crew list" page. Anonymous sign-up cannot be prevented at the
Supabase level on this plan; membership, not authentication, is what grants access.

### Row-level security

RLS is enabled on every table. Policies call two `SECURITY DEFINER STABLE` helpers in a
private `app` schema with pinned `search_path`:

- `app.is_member(boat uuid) → boolean`
- `app.is_crew(boat uuid) → boolean`

The rule is uniform: **read requires membership, write requires crew.** The UI hides
what viewers cannot do, but the database is what enforces it.

Every table also needs an explicit `grant ... to authenticated`. New `public` tables are
not automatically exposed to the Data API on this project, and the resulting failure
looks like a permissions bug rather than a missing grant.

## 4. Data model

Section 2 of the source spec, with these additions:

| Table | Beyond the source spec | Why |
| --- | --- | --- |
| `boats` | `home_lat`, `home_lng`, `tide_station_id` (default `9413450`) | Conditions lookup reads its location and tide station from the boat row instead of hardcoding Monterey. A second boat elsewhere then works without a code change. |
| `trips` | `fuel_price_per_gal`, `fuel_cost_usd` (generated), `conditions_fetched_at`, `conditions_status` | Cost dashboard needs a price; conditions need a recorded outcome so a failed fetch can be retried rather than looking like missing data. |
| `crew` | nullable `user_id` | Links a crew member to their auth account where one exists, without requiring it. |
| `maintenance_schedule` | `interval_hours` **and** `interval_months` | Oil is measured in hours, impellers in seasons. Whichever comes first triggers. |
| `trip_photos` | new table | `storage_path`, `caption`, `sort_order`. |
| `float_plans` | new table | `token`, `departure_at`, `planned_return_at`, `expires_at`, `closed_at`. |
| `documents` | `storage_path` + `file_name` instead of `file_url` | Keeps files in a private bucket behind signed URLs. |

Generated columns cover `hours_run`, `fuel_used_gal`, and `fuel_cost_usd`, so the
derived numbers cannot drift from their inputs.

Both storage buckets — `trip-photos` and `boat-documents` — are private and served via
signed URLs. A boat registration and an insurance certificate should not sit behind a
guessable public URL.

## 5. Automatic conditions

The defining feature. `lib/conditions/` runs server-side when a trip is saved, issuing
four requests in parallel, selecting the hour nearest departure, and writing a permanent
versioned snapshot. Snapshots are stored, never re-derived on view: forecast models are
overwritten over time, and the point is a permanent record of what the conditions
actually were.

```
{ version: 1, captured_at, location: {lat, lng}, at_hour,
  wind:  {speed_kn, dir_deg, gust_kn},
  waves: {height_ft, period_s, dir_deg},
  swell: {height_ft, period_s, dir_deg},
  sst_f, air_temp_f, pressure_hpa,
  tides: [{time, height_ft, type}],
  sources: {...},
  summary: "12kt NW · 3ft @ 9s · high 2:14pm" }
```

Sources, all keyless and all verified against live responses during design:

- `marine-api.open-meteo.com/v1/marine` — wave height/period/direction, swell, SST.
- `archive-api.open-meteo.com/v1/archive` — historical wind, air temp, pressure.
- `api.open-meteo.com/v1/forecast` — the same weather fields for recent and future dates.
- `api.tidesandcurrents.noaa.gov/.../datagetter` — NOAA CO-OPS station 9413450, for
  `predictions` at `interval=hilo` and for observed `water_temperature`.

Three findings from live testing shape the implementation:

- **The weather source depends on the trip's age.** `archive-api` lags by several days,
  so a trip logged the same day returns nothing. Dates within roughly five days route to
  the forecast endpoint, which also serves past days; older dates use the archive.
- **`sea_surface_temperature` comes back in °C even with `length_unit=imperial`.** It
  must be converted explicitly, and it is cross-checked against NOAA's observed water
  temperature, which is a real measurement rather than a model output.
- **NOAA hi/lo predictions** return a compact `{t, v, type: "H"|"L"}` shape, which maps
  directly onto the tide array with no reshaping.

**A conditions failure must never fail a trip save.** The trip is written first and the
snapshot attaches afterwards. A failed or partial fetch is recorded in
`conditions_status`, and the trip detail page offers a retry. Nothing in this path uses
the service-role key — it runs as the signed-in user, so RLS still applies.

## 6. Feature areas

**Trips.** Mobile-first CRUD over every field in the source spec. "Use current location"
captures GPS at departure and return. Crew are attached from the `crew` table; sites
visited are attached from saved points of interest.

**Maintenance.** `computeDueStatus(schedules, log, currentHours, today)` is a pure
function with no database access, evaluating each service against both its hour interval
and its calendar interval and returning whichever falls due first. Seeded with F200
defaults — oil 100h/12mo, lower unit 100h/12mo, impeller 12mo, plugs 400h, anodes 6mo —
all editable in-app. Overdue items raise a banner on the dashboard.

**Fuel and cost.** Nautical miles per gallon over time is the headline chart: a fouled
prop or a sick injector shows up there before it shows up in a repair bill. Plus cost
per trip and spend by year.

**Stats.** Lifetime hours, distance, fuel burned, trips per year.

**Map and points of interest.** A persistent map of dive sites, anchorages, and fishing
spots, built up over time and browsable on its own. Sites are added by tapping the map
or from current location — the case that matters is being anchored over a spot and
wanting to save it before forgetting. Sites link to trips both ways: a trip lists the
sites visited, a site lists every trip that visited it.

**Float plan.** A public page at `/fp/<token>` with a 32-byte random token. Anonymous
reads go through a single `SECURITY DEFINER` function taking the token and returning
that one plan; `anon` never holds a `select` grant on `float_plans`, so a leaked token
exposes exactly one plan and nothing else. Auto-expires 24 hours after planned return
and shows a live overdue state, so the shore contact does not have to work out whether
the boat is late.

**Documents.** Registration, insurance, USCG documentation, towing membership, with
expiry tracking and a warning ahead of each date.

**Photos.** A few per trip, in the private bucket.

**Charts.** Hand-rolled SVG components rather than a charting library — a smaller mobile
bundle, and charts that match the instrument aesthetic instead of overriding a library's
defaults.

**PWA.** A hand-written service worker rather than a plugin, since plugins lag Next.js
major versions. It caches the app shell. The trip form autosaves continuously to
IndexedDB; saving without signal queues the draft and flushes it automatically on
reconnect, with an unsynced badge so a queued trip is never silently lost.

**Dark mode.** Cookie-backed class strategy, so server rendering knows the theme and
there is no flash on load.

## 7. Testing

Vitest covers the pure logic: derivation math, conditions parsing, maintenance due
dates, float-plan expiry, and unit conversion. Conditions parsing is tested against real
captured API responses in `test/fixtures/`, not hand-written JSON — invented fixtures
only prove the parser agrees with its author.

RLS gets explicit assertions rather than assumption: a viewer JWT attempting a write, a
non-member attempting a read, an anonymous request against `float_plans`.

## 8. Owner actions

Two steps cannot be performed from here:

1. Set the Site URL and redirect allowlist in the Supabase dashboard. Auth configuration
   is not exposed through the MCP.
2. Connect the Vercel project and set the three environment variables.
