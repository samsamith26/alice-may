# Alice May Logbook

A trip logbook for *Alice May* — a 2009 Jeanneau Merry Fisher 795 with a Yamaha
F200, moored in Monterey Harbor.

Each trip records the mechanics: hours, fuel, distance, who was aboard, what
happened. The app then attaches the wind, swell, sea temperature, and tides for
that date, time, and place on its own, and stores them permanently — forecast
models get overwritten, and the point of a logbook is what the conditions
actually were.

## Adding a family member

This is the part worth knowing, and it needs no SQL.

1. Open **More → Crew &amp; access**.
2. Enter their email, pick **Crew** (can log and edit trips) or **Viewer**
   (read-only).
3. They go to the site, enter the same address, and follow the link they're sent.

That's it. Membership is granted by a database trigger, in either order — they
can be added before or after they first try to sign in. Removing an address
revokes their access immediately.

## What's in it

- **Trips** — hours, fuel, distance, crew, sites visited, notes, photos, GPS.
- **Conditions** — wind, waves, swell, sea temperature and the day's tides,
  captured automatically on save and frozen into the record.
- **Service** — due and overdue tracking against both engine hours and the
  calendar, whichever falls first.
- **Fuel &amp; cost** — nautical miles per gallon over time, which is where a
  fouled prop shows up before it shows up in a repair bill.
- **Map** — dive sites, anchorages, and fishing spots on OpenStreetMap with the
  OpenSeaMap seamark overlay, linked both ways to the trips that visited them.
- **Float plan** — a link you can text to someone ashore showing who's aboard,
  their emergency contacts, and whether you're overdue. No sign-in needed, and
  it expires on its own.
- **Documents** — registration, insurance, documentation, towing cover, with
  expiry warnings 60 days out.
- **Tides** — the next week at Monterey, for checking before you leave the house.
- Installable on a phone, dark mode, and trip drafts that survive having no
  signal and upload themselves when you're back in range.

## Running it locally

```bash
npm install
npm run dev
```

`.env.local` needs three values:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

The service-role key is for seeding and admin scripts only. It is never used in
a request path.

No API keys are needed for weather, tides, or maps — Open-Meteo, NOAA CO-OPS,
OpenStreetMap, and OpenSeaMap are all keyless.

```bash
npm test          # Vitest over the pure logic
npm run lint
npm run build
```

## Schema

Applied to Supabase as migrations through the Supabase MCP, never by hand.
`supabase/schema.sql` mirrors every applied migration in order so the tables and
especially the RLS policies are reviewable here rather than only in a dashboard.

Row-level security is on for every table, and it is the real enforcement — the
UI only hides what a viewer cannot do. Read requires boat membership, write
requires the `crew` role. `test/rls.md` records the verification, including the
cases that would break the zero-SQL promise if the triggers were wrong.

## Notes for future work

Things deliberately not built, with the reasoning:

- **NDBC buoy 46042** as a second conditions source. NOAA CO-OPS station 9413450
  already supplies observed water temperature for the same bay, and the buoy's
  fixed-width text format would need its own parser for marginal gain. Worth
  adding if the modelled swell ever looks wrong against reality.
- **Full offline-first sync.** Trip drafts survive being offline, which covers
  the case that actually happens. Mirroring all data locally would add a sync
  engine and its failure modes for very little more.
