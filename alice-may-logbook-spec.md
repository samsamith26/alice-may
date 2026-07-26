# Alice May Logbook — Build Spec

**Boat:** 2009 Jeanneau Merry Fisher 795, Yamaha 200 HP outboard
**Home port:** Monterey Harbor, CA
**Stack:** Next.js (App Router, TypeScript) + Tailwind + Supabase (Postgres/Auth/Storage) + Vercel + PWA

---

## 1. Core concept

A trip logbook where each entry captures the mechanics of the trip (hours, fuel, distance, crew, notes) and the app *automatically* attaches sea/wind/tide conditions for that date, time, and location — so you never have to look it up yourself.

---

## 2. Data model (Supabase Postgres)

### `boats`
Single row for now, but modeled as a table so you can add a second boat later without a rewrite.
- `id`, `name` ("Alice May"), `make_model` ("Jeanneau Merry Fisher 795"), `year` (2009), `engine_make_model` ("Yamaha F200"), `fuel_capacity_gal`, `home_port` ("Monterey Harbor")

### `trips`
- `id`, `boat_id`, `trip_date`, `departure_time`, `return_time`
- `engine_hours_start`, `engine_hours_end` → `hours_run` (generated column: end − start)
- `fuel_level_start_gal`, `fuel_added_gal`, `fuel_level_end_gal` → `fuel_used_gal` (generated)
- `distance_nm` (manual entry, or computed from GPS track if you log one)
- `start_lat`, `start_lng`, `end_lat`, `end_lng` (optional GPS points — just tap "use current location" on phone)
- `route_points` (jsonb array of {lat,lng,timestamp} — optional, for a future live-tracking feature)
- `notes` (free text: what you did, fish caught, issues noticed)
- `conditions_snapshot` (jsonb — see §3, stored permanently at save time)
- `created_by` (auth user id)

### `trip_passengers`
- `trip_id`, `crew_id` (join table, many-to-many)

### `crew`
- `id`, `name`, `emergency_contact_name`, `emergency_contact_phone` (nice for float-plan use)

### `maintenance_log`
- `id`, `boat_id`, `date`, `engine_hours_at_service`, `service_type` (oil change, lower unit oil, impeller, spark plugs, zincs, filters, other), `notes`, `cost`
- Optional: `maintenance_schedule` table with interval rules (e.g. oil every 100 hrs) to power due/overdue alerts against current engine hours

### `documents`
- `id`, `boat_id`, `type` (registration, insurance, USCG documentation, towing membership), `expires_on`, `file_url` (Supabase Storage)

### `points_of_interest`
For dive sites, favorite anchorages, fishing spots, etc. — pins you build up over time and can browse on a map, independent of any single trip.
- `id`, `boat_id`, `name`, `category` (dive site, anchorage, fishing spot, other), `lat`, `lng`, `depth_ft` (optional, relevant for dive sites), `notes`

### `trip_sites`
Join table linking a trip to one or more POIs visited that day (e.g. "dove at Metridium, Monastery Beach" on this trip).
- `trip_id`, `site_id`

---

## 3. Automatic sea/wind conditions — the key feature

When you save a trip, the app calls a weather API server-side using the trip's date/time and location (default: Monterey Bay buoy position, or your logged GPS point if present), then **stores the result permanently** in `conditions_snapshot` — don't just fetch-on-view, because forecast models get overwritten with time; you want a permanent record of what conditions were.

Two good free data sources, worth wiring up both:

- **Open-Meteo Historical Marine + Weather API** — free, no API key, covers wave height/period/direction, wind speed/direction/gusts, and works for both recent and older historical dates. This is your primary source and the easiest to integrate (`archive-api.open-meteo.com` + `marine-api.open-meteo.com`).
- **NOAA NDBC Buoy 46042** (Monterey Bay buoy) — actual *observed* readings rather than modeled data, good as a secondary/comparison source or for recent trips. NOAA also has a **Tides & Currents** station right in Monterey Harbor (station 9413450) worth pulling tide highs/lows for the trip date — very useful for a small-boat logbook (launching/loading at the ramp, bar conditions, etc.).

Store in `conditions_snapshot`: wind speed/direction, wave height/period, swell direction, sea surface temp, and the day's tide highs/lows. Show it as a compact card on each trip entry ("12kt NW wind, 3ft swell, high tide 2:14pm").

---

## 4. Confirmed additional features

- **Maintenance tracker tied to engine hours** — set intervals (oil every 100 hrs, impeller every season, etc.) and get a "due soon / overdue" banner based on the latest logged engine hours. The single highest-value add for a boat this age.
- **Fuel & cost dashboard** — NM per gallon over time, fuel cost per trip, annual fuel spend. Useful for catching a fouled prop or bad injector before it becomes expensive.
- **Tide table for trip planning** — shown before you even log a trip, so you can check tomorrow's tides from your phone before heading down to the harbor.
- **Lifetime stats** — total hours, total NM, fuel burned, trips per year.
- **Photos per trip** — Supabase Storage bucket, attach a few photos to a trip entry.
- **Dark mode** — genuinely useful on the water in bright sun or logging a trip at dusk.
- **Document vault** — registration, insurance, USCG documentation, towing membership (BoatUS/Sea Tow) with expiration reminders.
- **Dive site / points of interest map** — a persistent map of dive sites, anchorages, and fishing spots (see `points_of_interest` table above) that you build up across trips and can browse independently, plus link to the specific trips where you visited each one. Pairs naturally with the trip map below.
- **Trip map** — pin start/end (and route if logged) on a map view, with POI pins overlaid; nice for browsing past trips and planning new ones.
- **Float plan / safety mode** — before departure, a one-tap screen showing who's aboard + emergency contacts + planned return time, shareable via text link to someone staying ashore.
- **PWA / "Add to Home Screen"** — since you want phone entry at the helm, this matters more than a native app and costs almost nothing to add on top of Next.js.

For the map itself, **Mapbox GL JS** or **Leaflet + OpenStreetMap** both work well and are free for this scale of usage — Leaflet/OSM is the simpler no-API-key option if you want to avoid signing up for another service.

---

## 5. Auth & access

Supabase Auth with magic-link email sign-in — no passwords to manage, works well on mobile. Add crew/family emails as allowed users if you want them logging trips too.

---

## 6. Suggested build order (phases)

1. **MVP**: Supabase schema + Next.js app scaffold, trip CRUD form (all your requested fields), trip list/detail view, deployed to Vercel.
2. **Auto conditions**: server-side function that calls Open-Meteo (+ NOAA tides) on trip save and stores the snapshot.
3. **Maintenance tracker**: log entries + due/overdue logic against current hours.
4. **Dashboards**: fuel/cost trends, lifetime stats.
5. **Map & POIs**: dive site / anchorage / fishing spot table, trip map with POI pins.
6. **Nice-to-haves**: float plan, document vault, photos, PWA polish.

---

## 7. Environment variables you'll need

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-side only, for the weather-fetch function)
- No API key needed for Open-Meteo or NOAA endpoints

---

## 8. Tooling & plugin strategy

You're running: **superpowers, supabase, context7, frontend-design, code-review**.

- **Superpowers** drives the default brainstorm → plan → execute → review loop for this project — no competing workflow framework running alongside it.
- **supabase plugin**: bundles the official Supabase MCP server + Supabase's own agent skills for migrations and RLS. Point Claude Code at this for all schema/migration work instead of hand-writing SQL — it knows current Supabase best practices (RLS patterns, `@supabase/ssr` auth setup) natively.
- **context7**: best invoked explicitly for fast-moving libraries, e.g. "use context7 for @supabase/ssr" or "use context7 for Next.js App Router" — keeps it from silently eating into shared anonymous rate limits.
- **frontend-design**: let it drive visual/layout decisions once you're past the schema/data-model phase — no need to invoke it for the initial scaffold.
- **code-review**: run `/code-review` after each phase (per section 6) before moving to the next, not just at the very end — catches drift early while context is still fresh.

## 9. Initial prompt for Claude Code

Paste this as your first message in the project directory:

> I'm building "Alice May Logbook" — a personal boat logbook web app for my 2009 Jeanneau Merry Fisher 795 (Yamaha F200), moored in Monterey Harbor. Full spec is in `alice-may-logbook-spec.md` in this repo — read it before starting.
>
> Stack: Next.js (App Router, TypeScript), Tailwind, Supabase (Postgres/Auth/Storage), deployed on Vercel. Use `@supabase/ssr` for auth (browser + server clients + middleware session refresh) — not the deprecated auth-helpers package. Use magic-link email auth.
>
> Use the supabase plugin/MCP for all schema and migration work — implement the schema exactly as described in section 2 of the spec, with RLS enabled on every table (this is a personal app, but a small number of family/crew emails should also be able to read/write).
>
> Start with Phase 1 from section 6 of the spec only: project scaffold, the Supabase schema migration for `boats`, `trips`, `crew`, and `trip_passengers`, and the trip entry form + trip list/detail view — mobile-first responsive, since I'll be logging trips from my phone at the helm. Don't build the weather auto-fetch, maintenance tracker, dashboards, or map yet — we'll do those as separate phases once this is reviewed and deployed.
>
> Brainstorm and plan this with me before writing code, per your usual workflow.

Then work phase by phase from section 6 — approve each plan before execution, and run `/code-review` before moving to the next phase.
