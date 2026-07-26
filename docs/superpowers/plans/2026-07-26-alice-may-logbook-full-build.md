# Alice May Logbook — Full Build Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete Alice May Logbook — trip CRUD with automatic sea/wind/tide capture, maintenance tracking, fuel and cost dashboards, a dive-site map, float plans, a document vault, photos, dark mode, and PWA offline drafts — in one pass.

**Architecture:** A Next.js 16 App Router application over Supabase Postgres, where row-level security is the single enforcement point for a `crew`/`viewer` split and membership is granted by database triggers rather than by hand. Trip conditions are fetched server-side from keyless public APIs and frozen into a versioned JSONB snapshot at save time, because forecast models are overwritten and the logbook needs a permanent record. All derived logic — fuel maths, maintenance due dates, conditions parsing — lives in pure modules with no database access so it can be unit-tested directly.

**Tech Stack:** Next.js 16.2, TypeScript (strict), Tailwind v4, Supabase (Postgres/Auth/Storage), `@supabase/ssr`, Zod, Vitest, Leaflet + OpenStreetMap + OpenSeaMap, `idb-keyval`, deployed on Vercel.

## Global Constraints

- **Supabase project ID is `fyvvyjsninswdxnzwpdg`** (name `alice-may`, region `ca-central-1`, Postgres 17.6). All schema work goes through the Supabase MCP `apply_migration` tool as named migrations. Never use `execute_sql` for DDL.
- **Next.js 16 uses `proxy.ts`, not `middleware.ts`.** The root file exports `proxy()`, not `middleware()`. The `edge` runtime is not supported in `proxy`; it runs on Node.
- **Call `supabase.auth.getClaims()` in the proxy, never `getUser()`.** Run no code between `createServerClient` and that call — it causes intermittent random logouts.
- **Magic links use the PKCE flow.** The link lands on `/auth/callback?code=…` and is redeemed with `exchangeCodeForSession`. Do not use `token_hash` + `verifyOtp`: that requires a customised email template, and this project is on the Supabase free plan where auth email templates cannot be customised.
- **Every new `public` table needs an explicit `grant … to authenticated`.** New tables are not auto-exposed to the Data API on this project. Missing grants fail as permission errors that look like RLS bugs.
- **Every table has RLS enabled.** Read requires boat membership, write requires the `crew` role. No exceptions.
- **All `SECURITY DEFINER` functions set `search_path = ''`** and fully qualify every identifier.
- **The service-role key is never used in a request path.** It is for seeding and admin scripts only.
- **Open-Meteo's `archive-api` lags by several days.** Trips dated within 5 days of today use `api.open-meteo.com/v1/forecast`, which also serves past days. Older trips use `archive-api.open-meteo.com/v1/archive`.
- **`sea_surface_temperature` returns °C even when `length_unit=imperial`.** Convert explicitly.
- **A conditions fetch failure must never fail a trip save.**
- **Storage buckets are private.** Files are served through signed URLs.
- **Mobile-first.** The primary device is a phone at the helm, in sun, with wet hands.
- **Boat seed values (exact):** name `Alice May`, make/model `Jeanneau Merry Fisher 795`, year `2009`, engine `Yamaha F200`, fuel capacity `72` gal, home port `Monterey Harbor`, home position `36.6045, -121.8918`, tide station `9413450`.
- **Initial allowlist (exact):** `samuel.smith2204@gmail.com`, role `crew`. No other rows.

## File Structure

```
proxy.ts                          Next.js 16 root proxy — session refresh only
app/
  layout.tsx                      Root layout, theme class from cookie, fonts
  globals.css                     Tailwind v4 + design tokens
  login/page.tsx                  Magic-link request form
  auth/callback/route.ts          PKCE code exchange
  auth/signout/route.ts           Sign out
  no-access/page.tsx              Authenticated but not on the crew list
  fp/[token]/page.tsx             PUBLIC float plan — no auth
  (app)/
    layout.tsx                    Membership gate + nav shell
    page.tsx                      Dashboard
    trips/page.tsx                Trip list
    trips/new/page.tsx            Trip entry form
    trips/[id]/page.tsx           Trip detail
    trips/[id]/edit/page.tsx      Trip edit
    maintenance/page.tsx          Due/overdue + service log
    fuel/page.tsx                 Fuel & cost dashboard
    stats/page.tsx                Lifetime stats
    map/page.tsx                  POI + trip map
    sites/[id]/page.tsx           POI detail + visiting trips
    tides/page.tsx                Tide planning view
    documents/page.tsx            Document vault
    float-plan/page.tsx           Create/manage float plans
    boat/page.tsx                 Boat specs
    access/page.tsx               Crew & access admin (crew only)
lib/
  supabase/client.ts              createBrowserClient
  supabase/server.ts              createServerClient for RSC/actions
  supabase/proxy.ts               updateSession
  supabase/admin.ts               service-role client (seed scripts only)
  auth/membership.ts              getMembership() — cached per request
  conditions/open-meteo.ts        Marine + weather fetchers
  conditions/noaa.ts              CO-OPS tides + observed water temp
  conditions/snapshot.ts          Assemble + summarise the snapshot
  conditions/types.ts             ConditionsSnapshot v1
  maintenance/due.ts              computeDueStatus — pure
  trips/derive.ts                 Fuel/efficiency maths — pure
  format/units.ts                 Conversions + compass points — pure
  format/dates.ts                 Date/time helpers — pure
  offline/drafts.ts               IndexedDB draft queue
  validation/schemas.ts           Zod schemas shared by forms + actions
components/
  charts/                         Hand-rolled SVG chart primitives
  trips/                          Trip form, cards, conditions card
  map/                            Leaflet wrappers (client-only)
  ui/                             Buttons, fields, banners, theme toggle
test/fixtures/                    Real captured API responses
supabase/migrations/              Mirrored copies of applied migrations
```

---

### Task 1: Scaffold, tooling, and design tokens

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts`, `app/layout.tsx`, `app/globals.css`, `app/page.tsx`, `lib/env.ts`, `test/setup.ts`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: nothing.
- Produces: `lib/env.ts` exporting `env: { SUPABASE_URL: string; SUPABASE_ANON_KEY: string }` — throws at import time if either is missing. Tailwind design tokens named `--color-hull`, `--color-chart`, `--color-brass`, `--color-depth` available as `bg-hull` etc.

- [ ] **Step 1: Scaffold the app**

Run in the repo root. The directory already contains `alice-may-logbook-spec.md`, `CLAUDE.md`, `docs/`, and `.env.local`, so scaffold in place rather than into a subdirectory:

```bash
npx --yes create-next-app@latest . --ts --tailwind --app --eslint --src-dir=false --import-alias "@/*" --turbopack --no-git --yes
```

If it refuses because the directory is non-empty, scaffold into `.scaffold/` and move the generated files up, then delete `.scaffold/`.

- [ ] **Step 2: Add remaining dependencies**

```bash
npm install @supabase/ssr @supabase/supabase-js zod idb-keyval leaflet
npm install -D vitest @vitejs/plugin-react vite-tsconfig-paths @types/leaflet jsdom
```

- [ ] **Step 3: Verify the versions actually installed**

```bash
npm ls next @supabase/ssr typescript tailwindcss --depth=0
```

Expected: `next@16.x`. If npm resolved Next 15, stop — the whole `proxy.ts` convention in this plan assumes 16. Install `next@latest` explicitly and re-check.

- [ ] **Step 4: Add the Vitest config**

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    include: ['**/*.test.ts'],
    exclude: ['node_modules/**', '.next/**'],
  },
})
```

Add to `package.json` scripts: `"test": "vitest run"`, `"test:watch": "vitest"`.

- [ ] **Step 5: Write the env guard with a failing test**

Create `lib/env.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { readEnv } from './env'

describe('readEnv', () => {
  it('returns the values when both are present', () => {
    expect(
      readEnv({
        NEXT_PUBLIC_SUPABASE_URL: 'https://x.supabase.co',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon',
      }),
    ).toEqual({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon' })
  })

  it('names the specific missing variable', () => {
    expect(() => readEnv({ NEXT_PUBLIC_SUPABASE_URL: 'https://x.supabase.co' })).toThrow(
      /NEXT_PUBLIC_SUPABASE_ANON_KEY/,
    )
  })
})
```

- [ ] **Step 6: Run it and watch it fail**

Run: `npm test -- lib/env.test.ts`
Expected: FAIL — cannot resolve `./env`.

- [ ] **Step 7: Implement `lib/env.ts`**

```ts
type RawEnv = Record<string, string | undefined>

export function readEnv(raw: RawEnv) {
  const url = raw.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = raw.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const missing = [
    !url && 'NEXT_PUBLIC_SUPABASE_URL',
    !anonKey && 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  ].filter(Boolean)
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`)
  }
  return { SUPABASE_URL: url!, SUPABASE_ANON_KEY: anonKey! }
}

export const env = readEnv({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
})
```

- [ ] **Step 8: Run the test again**

Run: `npm test -- lib/env.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 9: Define the design tokens**

Replace `app/globals.css`. Tailwind v4 uses `@theme`, not a JS config. The palette is the nautical-instrument direction: deep navy hull, chart-paper cream, brass accent, and a deep teal for water.

```css
@import "tailwindcss";

@custom-variant dark (&:where(.dark, .dark *));

@theme {
  --color-hull-950: #06131f;
  --color-hull-900: #0b2033;
  --color-hull-800: #123048;
  --color-hull-700: #1b4666;
  --color-chart-50:  #fbf8f0;
  --color-chart-100: #f4eddc;
  --color-chart-200: #e6d9bd;
  --color-brass-400: #d9a441;
  --color-brass-500: #bf8a2c;
  --color-depth-400: #3d8ea3;
  --color-depth-600: #1f5f72;
  --color-alarm-500: #c2452d;
  --color-ok-500:    #2f7d54;

  --font-sans: var(--font-inter), ui-sans-serif, system-ui, sans-serif;
  --font-mono: var(--font-mono-numeric), ui-monospace, monospace;
}

:root { color-scheme: light; }
.dark { color-scheme: dark; }

body {
  @apply bg-chart-50 text-hull-950 antialiased;
}
.dark body {
  @apply bg-hull-950 text-chart-100;
}

/* Numeric readouts — hours, fuel, distance — align in columns */
.tabular { font-variant-numeric: tabular-nums; }
```

- [ ] **Step 10: Confirm the app builds and typechecks**

```bash
npx tsc --noEmit && npm run build
```

Expected: both succeed. `npm run build` will warn about no pages beyond the default; that is fine.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "Scaffold Next.js 16 app with Tailwind v4 tokens and Vitest"
```

---

### Task 2: Core schema — boats, membership, and the zero-SQL triggers

**Files:**
- Create: `supabase/migrations/0001_core_access.sql` (mirror of the applied migration, for reference)

**Interfaces:**
- Consumes: nothing.
- Produces: tables `public.boats`, `public.allowed_emails`, `public.boat_members`, `public.crew`; enum `public.app_role` with values `crew` and `viewer`; helpers `app.is_member(uuid) → boolean`, `app.is_crew(uuid) → boolean`, `app.is_crew_any() → boolean`. Every later task's RLS policies call these three helpers.

- [ ] **Step 1: Apply the core access migration**

Use the Supabase MCP `apply_migration` tool against project `fyvvyjsninswdxnzwpdg`, name `core_access`:

```sql
create schema if not exists app;
create type public.app_role as enum ('crew', 'viewer');

create table public.boats (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  make_model text,
  year integer,
  engine_make_model text,
  fuel_capacity_gal numeric(6,2),
  home_port text,
  home_lat double precision,
  home_lng double precision,
  tide_station_id text,
  created_at timestamptz not null default now()
);

create table public.allowed_emails (
  email text primary key,
  role public.app_role not null default 'crew',
  note text,
  added_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint allowed_emails_lowercase check (email = lower(email))
);

create table public.boat_members (
  user_id uuid not null references auth.users(id) on delete cascade,
  boat_id uuid not null references public.boats(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  primary key (user_id, boat_id)
);

create table public.crew (
  id uuid primary key default gen_random_uuid(),
  boat_id uuid not null references public.boats(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  name text not null,
  emergency_contact_name text,
  emergency_contact_phone text,
  created_at timestamptz not null default now()
);
create index crew_boat_id_idx on public.crew (boat_id);
```

- [ ] **Step 2: Apply the RLS helper functions**

`apply_migration`, name `access_helpers`. These are `security definer` so that policies on `boat_members` can query `boat_members` without infinite recursion. `search_path = ''` forces full qualification.

```sql
create or replace function app.is_member(p_boat uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.boat_members m
    where m.boat_id = p_boat and m.user_id = (select auth.uid())
  );
$$;

create or replace function app.is_crew(p_boat uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.boat_members m
    where m.boat_id = p_boat
      and m.user_id = (select auth.uid())
      and m.role = 'crew'
  );
$$;

create or replace function app.is_crew_any()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.boat_members m
    where m.user_id = (select auth.uid()) and m.role = 'crew'
  );
$$;

grant usage on schema app to authenticated;
grant execute on function app.is_member(uuid) to authenticated;
grant execute on function app.is_crew(uuid) to authenticated;
grant execute on function app.is_crew_any() to authenticated;
```

- [ ] **Step 3: Apply the membership triggers**

`apply_migration`, name `membership_triggers`. Two triggers, because membership can be established in either order — the person can be allowlisted before they ever sign in, or they can have attempted a sign-in before being allowlisted. Only handling the first case leaves the second permanently and silently broken.

```sql
create or replace function app.grant_membership(p_user_id uuid, p_email text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_role public.app_role;
begin
  select a.role into v_role
  from public.allowed_emails a
  where a.email = lower(p_email);

  if v_role is null then
    return;
  end if;

  insert into public.boat_members (user_id, boat_id, role)
  select p_user_id, b.id, v_role from public.boats b
  on conflict (user_id, boat_id) do update set role = excluded.role;
end;
$$;

-- Allowlisted first, signs in later.
create or replace function app.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform app.grant_membership(new.id, new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function app.handle_new_user();

-- Signed in first, allowlisted later. Also handles a role change.
create or replace function app.handle_allowed_email_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid;
begin
  select u.id into v_user_id
  from auth.users u
  where lower(u.email) = new.email
  limit 1;

  if v_user_id is not null then
    perform app.grant_membership(v_user_id, new.email);
  end if;
  return new;
end;
$$;

create trigger on_allowed_email_upserted
after insert or update of role on public.allowed_emails
for each row execute function app.handle_allowed_email_change();

-- Removing someone from the allowlist revokes their membership.
create or replace function app.handle_allowed_email_delete()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  delete from public.boat_members m
  where m.user_id in (select u.id from auth.users u where lower(u.email) = old.email);
  return old;
end;
$$;

create trigger on_allowed_email_deleted
after delete on public.allowed_emails
for each row execute function app.handle_allowed_email_delete();
```

- [ ] **Step 4: Apply RLS and grants for the core tables**

`apply_migration`, name `core_access_rls`:

```sql
alter table public.boats enable row level security;
alter table public.allowed_emails enable row level security;
alter table public.boat_members enable row level security;
alter table public.crew enable row level security;

create policy boats_select on public.boats
  for select to authenticated using (app.is_member(id));
create policy boats_update on public.boats
  for update to authenticated using (app.is_crew(id)) with check (app.is_crew(id));

create policy members_select on public.boat_members
  for select to authenticated using (app.is_member(boat_id));

create policy allowed_emails_select on public.allowed_emails
  for select to authenticated using (app.is_crew_any());
create policy allowed_emails_insert on public.allowed_emails
  for insert to authenticated with check (app.is_crew_any());
create policy allowed_emails_update on public.allowed_emails
  for update to authenticated using (app.is_crew_any()) with check (app.is_crew_any());
create policy allowed_emails_delete on public.allowed_emails
  for delete to authenticated using (app.is_crew_any());

create policy crew_select on public.crew
  for select to authenticated using (app.is_member(boat_id));
create policy crew_write on public.crew
  for all to authenticated using (app.is_crew(boat_id)) with check (app.is_crew(boat_id));

grant select, update on public.boats to authenticated;
grant select on public.boat_members to authenticated;
grant select, insert, update, delete on public.allowed_emails to authenticated;
grant select, insert, update, delete on public.crew to authenticated;
```

- [ ] **Step 5: Seed the boat and the allowlist**

`apply_migration`, name `seed_boat_and_allowlist`. The allowlist insert fires the trigger, so if the owner has already signed in once, membership is granted by this migration alone.

```sql
insert into public.boats (name, make_model, year, engine_make_model,
                          fuel_capacity_gal, home_port, home_lat, home_lng, tide_station_id)
select 'Alice May', 'Jeanneau Merry Fisher 795', 2009, 'Yamaha F200',
       72, 'Monterey Harbor', 36.6045, -121.8918, '9413450'
where not exists (select 1 from public.boats);

insert into public.allowed_emails (email, role, note)
values ('samuel.smith2204@gmail.com', 'crew', 'Owner')
on conflict (email) do nothing;
```

- [ ] **Step 6: Verify the schema landed**

Use MCP `list_tables` on schema `public` with `verbose: true`, and `execute_sql`:

```sql
select (select count(*) from public.boats) as boats,
       (select count(*) from public.allowed_emails) as allowed,
       (select fuel_capacity_gal from public.boats limit 1) as fuel_cap;
```

Expected: `boats = 1`, `allowed = 1`, `fuel_cap = 72.00`.

- [ ] **Step 7: Mirror the migrations into the repo and commit**

Write each applied migration verbatim to `supabase/migrations/` using the names above with a numeric prefix, so the schema history is readable without opening the dashboard.

```bash
git add -A && git commit -m "Add core access schema with zero-SQL membership triggers"
```

---

### Task 3: Trips schema

**Files:**
- Create: `supabase/migrations/0005_trips.sql`

**Interfaces:**
- Consumes: `app.is_member`, `app.is_crew`, `public.boats` from Task 2.
- Produces: `public.trips` with generated columns `hours_run`, `fuel_used_gal`, `fuel_cost_usd`; `public.trip_passengers`; helper `app.trip_boat(uuid) → uuid` used by every trip-child table's policies in Task 4.

- [ ] **Step 1: Apply the trips migration**

`apply_migration`, name `trips`. Generated columns mean the derived numbers cannot drift from their inputs. `fuel_cost_usd` deliberately multiplies `fuel_added_gal` — money actually handed over at the pump — not `fuel_used_gal`.

```sql
create table public.trips (
  id uuid primary key default gen_random_uuid(),
  boat_id uuid not null references public.boats(id) on delete cascade,
  trip_date date not null,
  departure_time time,
  return_time time,
  engine_hours_start numeric(8,2),
  engine_hours_end numeric(8,2),
  hours_run numeric(8,2) generated always as (engine_hours_end - engine_hours_start) stored,
  fuel_level_start_gal numeric(6,2),
  fuel_added_gal numeric(6,2),
  fuel_level_end_gal numeric(6,2),
  fuel_used_gal numeric(6,2) generated always as (
    (coalesce(fuel_level_start_gal, 0) + coalesce(fuel_added_gal, 0)) - fuel_level_end_gal
  ) stored,
  fuel_price_per_gal numeric(6,3),
  fuel_cost_usd numeric(10,2) generated always as (
    coalesce(fuel_added_gal, 0) * coalesce(fuel_price_per_gal, 0)
  ) stored,
  distance_nm numeric(8,2),
  start_lat double precision,
  start_lng double precision,
  end_lat double precision,
  end_lng double precision,
  route_points jsonb,
  notes text,
  conditions_snapshot jsonb,
  conditions_status text check (conditions_status in ('pending','ok','partial','failed')),
  conditions_fetched_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trips_hours_forward check (
    engine_hours_end is null or engine_hours_start is null
    or engine_hours_end >= engine_hours_start
  )
);
create index trips_boat_date_idx on public.trips (boat_id, trip_date desc);

create table public.trip_passengers (
  trip_id uuid not null references public.trips(id) on delete cascade,
  crew_id uuid not null references public.crew(id) on delete cascade,
  primary key (trip_id, crew_id)
);

create or replace function app.trip_boat(p_trip uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select t.boat_id from public.trips t where t.id = p_trip;
$$;
grant execute on function app.trip_boat(uuid) to authenticated;

create or replace function app.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
create trigger trips_touch_updated_at
before update on public.trips
for each row execute function app.touch_updated_at();

alter table public.trips enable row level security;
alter table public.trip_passengers enable row level security;

create policy trips_select on public.trips
  for select to authenticated using (app.is_member(boat_id));
create policy trips_write on public.trips
  for all to authenticated using (app.is_crew(boat_id)) with check (app.is_crew(boat_id));

create policy trip_passengers_select on public.trip_passengers
  for select to authenticated using (app.is_member(app.trip_boat(trip_id)));
create policy trip_passengers_write on public.trip_passengers
  for all to authenticated
  using (app.is_crew(app.trip_boat(trip_id)))
  with check (app.is_crew(app.trip_boat(trip_id)));

grant select, insert, update, delete on public.trips to authenticated;
grant select, insert, update, delete on public.trip_passengers to authenticated;
```

- [ ] **Step 2: Verify the generated columns compute correctly**

MCP `execute_sql` — insert a probe row, check the maths, then remove it:

```sql
with b as (select id from public.boats limit 1),
ins as (
  insert into public.trips (boat_id, trip_date, engine_hours_start, engine_hours_end,
                            fuel_level_start_gal, fuel_added_gal, fuel_level_end_gal,
                            fuel_price_per_gal)
  select b.id, '2026-07-01', 412.5, 417.0, 30, 25, 42, 5.499 from b
  returning hours_run, fuel_used_gal, fuel_cost_usd, id
)
select hours_run, fuel_used_gal, fuel_cost_usd from ins;
```

Expected: `hours_run = 4.50`, `fuel_used_gal = 13.00`, `fuel_cost_usd = 137.48`.

Then: `delete from public.trips where trip_date = '2026-07-01';`

- [ ] **Step 3: Mirror the migration and commit**

```bash
git add -A && git commit -m "Add trips schema with generated hours, fuel, and cost columns"
```

---

### Task 4: Remaining schema — maintenance, POIs, documents, photos, float plans, storage

**Files:**
- Create: `supabase/migrations/0006_features.sql`, `supabase/migrations/0007_storage.sql`

**Interfaces:**
- Consumes: `app.is_member`, `app.is_crew`, `app.trip_boat` from Tasks 2–3.
- Produces: tables `maintenance_schedule`, `maintenance_log`, `documents`, `points_of_interest`, `trip_sites`, `trip_photos`, `float_plans`; the public RPC `public.get_float_plan(text) → jsonb`; private storage buckets `trip-photos` and `boat-documents`.

- [ ] **Step 1: Apply the feature tables migration**

`apply_migration`, name `feature_tables`:

```sql
create table public.maintenance_schedule (
  id uuid primary key default gen_random_uuid(),
  boat_id uuid not null references public.boats(id) on delete cascade,
  service_type text not null,
  interval_hours numeric(8,2),
  interval_months integer,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint maintenance_schedule_has_interval check (
    interval_hours is not null or interval_months is not null
  )
);

create table public.maintenance_log (
  id uuid primary key default gen_random_uuid(),
  boat_id uuid not null references public.boats(id) on delete cascade,
  service_date date not null,
  engine_hours_at_service numeric(8,2),
  service_type text not null,
  notes text,
  cost numeric(10,2),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index maintenance_log_boat_idx on public.maintenance_log (boat_id, service_date desc);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  boat_id uuid not null references public.boats(id) on delete cascade,
  type text not null,
  label text,
  expires_on date,
  storage_path text,
  file_name text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.points_of_interest (
  id uuid primary key default gen_random_uuid(),
  boat_id uuid not null references public.boats(id) on delete cascade,
  name text not null,
  category text not null default 'other'
    check (category in ('dive site','anchorage','fishing spot','other')),
  lat double precision not null,
  lng double precision not null,
  depth_ft numeric(6,1),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.trip_sites (
  trip_id uuid not null references public.trips(id) on delete cascade,
  site_id uuid not null references public.points_of_interest(id) on delete cascade,
  primary key (trip_id, site_id)
);

create table public.trip_photos (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  storage_path text not null,
  caption text,
  sort_order integer not null default 0,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index trip_photos_trip_idx on public.trip_photos (trip_id, sort_order);

create table public.float_plans (
  id uuid primary key default gen_random_uuid(),
  boat_id uuid not null references public.boats(id) on delete cascade,
  trip_id uuid references public.trips(id) on delete set null,
  token text not null unique,
  departure_at timestamptz not null,
  planned_return_at timestamptz not null,
  departure_point text,
  destination_notes text,
  shore_contact_name text,
  expires_at timestamptz not null,
  closed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.float_plan_crew (
  float_plan_id uuid not null references public.float_plans(id) on delete cascade,
  crew_id uuid not null references public.crew(id) on delete cascade,
  primary key (float_plan_id, crew_id)
);
```

- [ ] **Step 2: Apply RLS and grants for the feature tables**

`apply_migration`, name `feature_tables_rls`:

```sql
alter table public.maintenance_schedule enable row level security;
alter table public.maintenance_log enable row level security;
alter table public.documents enable row level security;
alter table public.points_of_interest enable row level security;
alter table public.trip_sites enable row level security;
alter table public.trip_photos enable row level security;
alter table public.float_plans enable row level security;
alter table public.float_plan_crew enable row level security;

create policy sched_select on public.maintenance_schedule
  for select to authenticated using (app.is_member(boat_id));
create policy sched_write on public.maintenance_schedule
  for all to authenticated using (app.is_crew(boat_id)) with check (app.is_crew(boat_id));

create policy mlog_select on public.maintenance_log
  for select to authenticated using (app.is_member(boat_id));
create policy mlog_write on public.maintenance_log
  for all to authenticated using (app.is_crew(boat_id)) with check (app.is_crew(boat_id));

create policy docs_select on public.documents
  for select to authenticated using (app.is_member(boat_id));
create policy docs_write on public.documents
  for all to authenticated using (app.is_crew(boat_id)) with check (app.is_crew(boat_id));

create policy poi_select on public.points_of_interest
  for select to authenticated using (app.is_member(boat_id));
create policy poi_write on public.points_of_interest
  for all to authenticated using (app.is_crew(boat_id)) with check (app.is_crew(boat_id));

create policy trip_sites_select on public.trip_sites
  for select to authenticated using (app.is_member(app.trip_boat(trip_id)));
create policy trip_sites_write on public.trip_sites
  for all to authenticated
  using (app.is_crew(app.trip_boat(trip_id)))
  with check (app.is_crew(app.trip_boat(trip_id)));

create policy trip_photos_select on public.trip_photos
  for select to authenticated using (app.is_member(app.trip_boat(trip_id)));
create policy trip_photos_write on public.trip_photos
  for all to authenticated
  using (app.is_crew(app.trip_boat(trip_id)))
  with check (app.is_crew(app.trip_boat(trip_id)));

create policy fp_select on public.float_plans
  for select to authenticated using (app.is_member(boat_id));
create policy fp_write on public.float_plans
  for all to authenticated using (app.is_crew(boat_id)) with check (app.is_crew(boat_id));

create policy fpc_select on public.float_plan_crew
  for select to authenticated
  using (exists (select 1 from public.float_plans f
                 where f.id = float_plan_id and app.is_member(f.boat_id)));
create policy fpc_write on public.float_plan_crew
  for all to authenticated
  using (exists (select 1 from public.float_plans f
                 where f.id = float_plan_id and app.is_crew(f.boat_id)))
  with check (exists (select 1 from public.float_plans f
                 where f.id = float_plan_id and app.is_crew(f.boat_id)));

grant select, insert, update, delete on public.maintenance_schedule to authenticated;
grant select, insert, update, delete on public.maintenance_log to authenticated;
grant select, insert, update, delete on public.documents to authenticated;
grant select, insert, update, delete on public.points_of_interest to authenticated;
grant select, insert, update, delete on public.trip_sites to authenticated;
grant select, insert, update, delete on public.trip_photos to authenticated;
grant select, insert, update, delete on public.float_plans to authenticated;
grant select, insert, update, delete on public.float_plan_crew to authenticated;
```

- [ ] **Step 3: Apply the public float-plan RPC**

`apply_migration`, name `float_plan_public_rpc`. `anon` never receives a `select` grant on `float_plans`; this function is the only anonymous door, and it returns exactly one plan or nothing. A leaked token therefore exposes one plan and no others.

```sql
create or replace function public.get_float_plan(p_token text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'boat_name', b.name,
    'departure_at', f.departure_at,
    'planned_return_at', f.planned_return_at,
    'departure_point', f.departure_point,
    'destination_notes', f.destination_notes,
    'shore_contact_name', f.shore_contact_name,
    'closed_at', f.closed_at,
    'crew', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', c.name,
        'emergency_contact_name', c.emergency_contact_name,
        'emergency_contact_phone', c.emergency_contact_phone
      ) order by c.name)
      from public.float_plan_crew fc
      join public.crew c on c.id = fc.crew_id
      where fc.float_plan_id = f.id
    ), '[]'::jsonb)
  )
  from public.float_plans f
  join public.boats b on b.id = f.boat_id
  where f.token = p_token
    and f.expires_at > now();
$$;

revoke all on function public.get_float_plan(text) from public;
grant execute on function public.get_float_plan(text) to anon, authenticated;
```

- [ ] **Step 4: Apply the storage buckets and their policies**

`apply_migration`, name `storage_buckets`. Both buckets are private; paths are namespaced by boat id so the policy can resolve membership from the first path segment.

```sql
insert into storage.buckets (id, name, public)
values ('trip-photos', 'trip-photos', false), ('boat-documents', 'boat-documents', false)
on conflict (id) do nothing;

create policy storage_read on storage.objects
  for select to authenticated
  using (
    bucket_id in ('trip-photos','boat-documents')
    and app.is_member((storage.foldername(name))[1]::uuid)
  );

create policy storage_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('trip-photos','boat-documents')
    and app.is_crew((storage.foldername(name))[1]::uuid)
  );

create policy storage_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id in ('trip-photos','boat-documents')
    and app.is_crew((storage.foldername(name))[1]::uuid)
  );
```

- [ ] **Step 5: Seed the default F200 maintenance schedule**

`apply_migration`, name `seed_maintenance_schedule`:

```sql
insert into public.maintenance_schedule (boat_id, service_type, interval_hours, interval_months)
select b.id, s.service_type, s.interval_hours, s.interval_months
from public.boats b
cross join (values
  ('Engine oil & filter', 100::numeric, 12),
  ('Lower unit gear oil', 100::numeric, 12),
  ('Water pump impeller', null::numeric, 12),
  ('Spark plugs', 400::numeric, null),
  ('Fuel filter', 200::numeric, 12),
  ('Anodes / zincs', null::numeric, 6)
) as s(service_type, interval_hours, interval_months)
where not exists (select 1 from public.maintenance_schedule);
```

- [ ] **Step 6: Check the security advisors**

Run MCP `get_advisors` with `type: "security"`. Expected: no errors about RLS-disabled tables and no `security definer` view warnings. Fix anything it reports before committing — the common miss is a table created without `enable row level security`.

- [ ] **Step 7: Generate TypeScript types**

Run MCP `generate_typescript_types` and write the output to `lib/supabase/database.types.ts`.

- [ ] **Step 8: Mirror migrations and commit**

```bash
git add -A && git commit -m "Add maintenance, POI, document, photo, and float plan schema"
```

---

### Task 5: Supabase clients, proxy session refresh, and magic-link auth

**Files:**
- Create: `lib/supabase/client.ts`, `lib/supabase/server.ts`, `lib/supabase/proxy.ts`, `lib/supabase/admin.ts`, `proxy.ts`, `app/login/page.tsx`, `app/login/actions.ts`, `app/auth/callback/route.ts`, `app/auth/signout/route.ts`, `app/no-access/page.tsx`, `lib/auth/membership.ts`

**Interfaces:**
- Consumes: `lib/env.ts` from Task 1; `boat_members` and `boats` from Task 2.
- Produces:
  - `createClient()` from `lib/supabase/server.ts` — async, returns a `SupabaseClient<Database>` bound to the request's cookies.
  - `createClient()` from `lib/supabase/client.ts` — synchronous browser client.
  - `getMembership(): Promise<Membership | null>` from `lib/auth/membership.ts` where `Membership = { userId: string; email: string; boatId: string; role: 'crew' | 'viewer' }`. Returns `null` when signed out **or** signed in without a membership row.
  - `requireMembership(): Promise<Membership>` — redirects to `/login` when signed out, to `/no-access` when signed in without membership.
  - `requireCrew(): Promise<Membership>` — as above, plus redirects to `/` when the role is `viewer`.

Every server component and server action in later tasks calls one of these three. None of them re-implements the check.

- [ ] **Step 1: Write the browser and server clients**

`lib/supabase/client.ts`:

```ts
import { createBrowserClient } from '@supabase/ssr'
import type { Database } from './database.types'
import { env } from '@/lib/env'

export function createClient() {
  return createBrowserClient<Database>(env.SUPABASE_URL, env.SUPABASE_ANON_KEY)
}
```

`lib/supabase/server.ts`. The `setAll` try/catch is required: server components cannot set cookies, and the proxy has already refreshed the session, so swallowing the error there is correct rather than lazy.

```ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from './database.types'
import { env } from '@/lib/env'

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient<Database>(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          )
        } catch {
          // Called from a Server Component. The proxy refreshes the session,
          // so there is nothing to recover here.
        }
      },
    },
  })
}
```

`lib/supabase/admin.ts` — service role, never imported by a page or action:

```ts
import 'server-only'
import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

/** Bypasses RLS. Seeding and admin scripts only — never a request path. */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
```

Run `npm install server-only`.

- [ ] **Step 2: Write the proxy session refresher**

`lib/supabase/proxy.ts`. Nothing may run between `createServerClient` and `getClaims()`.

```ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { env } from '@/lib/env'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        supabaseResponse = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        )
      },
    },
  })

  // Do not run code between createServerClient and getClaims().
  // Removing this call causes users to be randomly logged out.
  await supabase.auth.getClaims()

  return supabaseResponse
}
```

- [ ] **Step 3: Write the root proxy**

`proxy.ts` at the repo root — the file name and the export name are both `proxy` in Next.js 16:

```ts
import type { NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/proxy'

export async function proxy(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
```

- [ ] **Step 4: Write the membership helpers**

`lib/auth/membership.ts`. `cache` deduplicates the query across a single render pass, so a page and its layout do not both hit the database.

```ts
import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export type Membership = {
  userId: string
  email: string
  boatId: string
  role: 'crew' | 'viewer'
}

export const getMembership = cache(async (): Promise<Membership | null> => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('boat_members')
    .select('boat_id, role')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()

  if (!data) return null
  return {
    userId: user.id,
    email: user.email ?? '',
    boatId: data.boat_id,
    role: data.role,
  }
})

export async function requireMembership(): Promise<Membership> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const membership = await getMembership()
  if (!membership) redirect('/no-access')
  return membership
}

export async function requireCrew(): Promise<Membership> {
  const membership = await requireMembership()
  if (membership.role !== 'crew') redirect('/')
  return membership
}
```

- [ ] **Step 5: Write the login page and its action**

`app/login/actions.ts`:

```ts
'use server'

import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

export async function requestMagicLink(_prev: unknown, formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  if (!email || !email.includes('@')) {
    return { status: 'error' as const, message: 'Enter a valid email address.' }
  }

  const origin = (await headers()).get('origin') ?? ''
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origin}/auth/callback` },
  })

  if (error) return { status: 'error' as const, message: error.message }
  return { status: 'sent' as const, message: `Check ${email} for a sign-in link.` }
}
```

`app/login/page.tsx` is a client component using `useActionState` over that action: a single email field, a submit button, and the returned message. Style it against the Task 1 tokens — dark hull background, chart-cream card, brass submit button, large touch targets.

- [ ] **Step 6: Write the PKCE callback route**

`app/auth/callback/route.ts`. This is the half that only works because `@supabase/ssr` defaults to PKCE:

```ts
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`)
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    return NextResponse.redirect(`${origin}/login?error=exchange_failed`)
  }

  return NextResponse.redirect(`${origin}${next}`)
}
```

`app/auth/signout/route.ts` is a `POST` handler calling `supabase.auth.signOut()` then redirecting to `/login`.

- [ ] **Step 7: Write the no-access page**

`app/no-access/page.tsx` — a server component. It reads the signed-in email and explains that the address is not on the crew list, with a sign-out button. No technical error text; the person reading it is family, not an engineer.

- [ ] **Step 8: Verify the auth wiring builds**

```bash
npx tsc --noEmit && npm run build
```

Expected: PASS. A build failure mentioning `middleware` means the root file is still misnamed — it must be `proxy.ts` exporting `proxy`.

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "Add Supabase clients, proxy session refresh, and magic-link auth"
```

---

### Task 6: Pure formatting and derivation modules

**Files:**
- Create: `lib/format/units.ts`, `lib/format/units.test.ts`, `lib/format/dates.ts`, `lib/trips/derive.ts`, `lib/trips/derive.test.ts`

**Interfaces:**
- Consumes: nothing — these modules must not import Supabase or React.
- Produces:
  - `cToF(c: number): number`
  - `msToKnots(ms: number): number`
  - `metersToFeet(m: number): number`
  - `compassPoint(deg: number): string` — 16-point, e.g. `315 → 'NW'`
  - `formatDistance(nm: number | null): string`, `formatHours(h: number | null): string`
  - `nmPerGallon(distanceNm, fuelUsedGal): number | null`
  - `gallonsPerHour(fuelUsedGal, hoursRun): number | null`
  - `summariseFleet(trips): { totalHours, totalNm, totalFuelGal, totalCostUsd, tripCount, avgNmPerGal }`

- [ ] **Step 1: Write the failing unit tests**

`lib/format/units.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { cToF, compassPoint, metersToFeet, msToKnots } from './units'

describe('unit conversions', () => {
  it('converts celsius to fahrenheit', () => {
    expect(cToF(0)).toBe(32)
    expect(Math.round(cToF(15.5) * 10) / 10).toBe(59.9)
  })

  it('converts metres per second to knots', () => {
    expect(Math.round(msToKnots(10) * 10) / 10).toBe(19.4)
  })

  it('converts metres to feet', () => {
    expect(Math.round(metersToFeet(1) * 100) / 100).toBe(3.28)
  })

  it('names 16 compass points and wraps at 360', () => {
    expect(compassPoint(0)).toBe('N')
    expect(compassPoint(315)).toBe('NW')
    expect(compassPoint(360)).toBe('N')
    expect(compassPoint(371)).toBe('N')
    expect(compassPoint(203)).toBe('SSW')
  })
})
```

`lib/trips/derive.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { gallonsPerHour, nmPerGallon, summariseFleet } from './derive'

describe('trip derivations', () => {
  it('computes nautical miles per gallon', () => {
    expect(nmPerGallon(26, 13)).toBe(2)
  })

  it('returns null rather than Infinity when no fuel was used', () => {
    expect(nmPerGallon(26, 0)).toBeNull()
    expect(nmPerGallon(26, null)).toBeNull()
  })

  it('computes gallons per hour', () => {
    expect(gallonsPerHour(13, 4)).toBe(3.25)
  })

  it('summarises a fleet of trips, ignoring null fields', () => {
    const result = summariseFleet([
      { hours_run: 4, distance_nm: 26, fuel_used_gal: 13, fuel_cost_usd: 70 },
      { hours_run: 2, distance_nm: null, fuel_used_gal: 7, fuel_cost_usd: null },
    ])
    expect(result.totalHours).toBe(6)
    expect(result.totalNm).toBe(26)
    expect(result.totalFuelGal).toBe(20)
    expect(result.totalCostUsd).toBe(70)
    expect(result.tripCount).toBe(2)
  })
})
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npm test -- lib/format lib/trips`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement the modules**

`lib/format/units.ts` — `cToF` is `c * 9 / 5 + 32`; `msToKnots` is `ms * 1.943844`; `metersToFeet` is `m * 3.280839895`. `compassPoint` normalises with `((deg % 360) + 360) % 360`, then indexes `['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW']` at `Math.round(normalised / 22.5) % 16`.

`lib/trips/derive.ts` — `nmPerGallon` and `gallonsPerHour` both return `null` when either argument is null, zero, or negative, so a divide-by-zero never reaches a chart as `Infinity`. `summariseFleet` reduces with `?? 0` per field but counts every trip.

- [ ] **Step 4: Run the tests again**

Run: `npm test -- lib/format lib/trips`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "Add pure unit conversion and trip derivation modules"
```

---

### Task 7: Conditions capture

**Files:**
- Create: `lib/conditions/types.ts`, `lib/conditions/open-meteo.ts`, `lib/conditions/noaa.ts`, `lib/conditions/snapshot.ts`, `lib/conditions/snapshot.test.ts`, `test/fixtures/marine.json`, `test/fixtures/weather.json`, `test/fixtures/tides.json`

**Interfaces:**
- Consumes: `lib/format/units.ts` from Task 6.
- Produces:
  - `type ConditionsSnapshot` (version 1) as defined below.
  - `buildSnapshot(input: SnapshotInput): Promise<{ snapshot: ConditionsSnapshot | null; status: 'ok' | 'partial' | 'failed' }>` where `SnapshotInput = { date: string; time: string | null; lat: number; lng: number; tideStationId: string }`.
  - `assembleSnapshot(raw, input)` — the **pure** half, parsing already-fetched payloads. This is what the tests exercise.

- [ ] **Step 1: Capture real fixtures from the live APIs**

Do not hand-write these. Run each command and save the response verbatim — a fixture invented by the same person who wrote the parser only proves the parser agrees with its author.

```bash
mkdir -p test/fixtures
curl -s "https://marine-api.open-meteo.com/v1/marine?latitude=36.6045&longitude=-121.8918&start_date=2026-07-01&end_date=2026-07-01&hourly=wave_height,wave_direction,wave_period,swell_wave_height,swell_wave_direction,swell_wave_period,sea_surface_temperature&timezone=America%2FLos_Angeles&length_unit=imperial" > test/fixtures/marine.json
curl -s "https://archive-api.open-meteo.com/v1/archive?latitude=36.6045&longitude=-121.8918&start_date=2026-07-01&end_date=2026-07-01&hourly=temperature_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m,pressure_msl&timezone=America%2FLos_Angeles&wind_speed_unit=kn&temperature_unit=fahrenheit" > test/fixtures/weather.json
curl -s "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?product=predictions&application=alice-may-logbook&begin_date=20260701&end_date=20260701&datum=MLLW&station=9413450&time_zone=lst_ldt&units=english&interval=hilo&format=json" > test/fixtures/tides.json
```

Confirm each file is real JSON and not an error page before continuing.

- [ ] **Step 2: Define the snapshot type**

`lib/conditions/types.ts`:

```ts
export type TideExtreme = { time: string; height_ft: number; type: 'H' | 'L' }

export type ConditionsSnapshot = {
  version: 1
  captured_at: string
  location: { lat: number; lng: number }
  at_hour: string | null
  wind: { speed_kn: number | null; dir_deg: number | null; gust_kn: number | null }
  waves: { height_ft: number | null; period_s: number | null; dir_deg: number | null }
  swell: { height_ft: number | null; period_s: number | null; dir_deg: number | null }
  sst_f: number | null
  air_temp_f: number | null
  pressure_hpa: number | null
  tides: TideExtreme[]
  sources: {
    marine: boolean
    weather: boolean
    tides: boolean
    weather_endpoint: 'archive' | 'forecast' | null
  }
  summary: string
}
```

- [ ] **Step 3: Write the failing snapshot tests**

`lib/conditions/snapshot.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { assembleSnapshot, pickHourIndex, summarise } from './snapshot'

const marine = JSON.parse(readFileSync('test/fixtures/marine.json', 'utf8'))
const weather = JSON.parse(readFileSync('test/fixtures/weather.json', 'utf8'))
const tides = JSON.parse(readFileSync('test/fixtures/tides.json', 'utf8'))

const input = {
  date: '2026-07-01', time: '09:00',
  lat: 36.6045, lng: -121.8918, tideStationId: '9413450',
}

describe('assembleSnapshot', () => {
  it('picks the hour nearest the departure time', () => {
    expect(pickHourIndex(marine.hourly.time, '2026-07-01', '09:00')).toBe(9)
  })

  it('falls back to midday when no departure time was recorded', () => {
    expect(pickHourIndex(marine.hourly.time, '2026-07-01', null)).toBe(12)
  })

  it('produces a complete snapshot from real API payloads', () => {
    const snap = assembleSnapshot({ marine, weather, tides, weatherEndpoint: 'archive' }, input)
    expect(snap.version).toBe(1)
    expect(snap.at_hour).toBe('2026-07-01T09:00')
    expect(snap.waves.height_ft).toBeGreaterThan(0)
    expect(snap.wind.speed_kn).not.toBeNull()
    expect(snap.tides.length).toBeGreaterThan(0)
    expect(snap.tides[0]).toHaveProperty('type')
    expect(snap.sources).toEqual({
      marine: true, weather: true, tides: true, weather_endpoint: 'archive',
    })
  })

  it('converts sea surface temperature from celsius even under imperial units', () => {
    const snap = assembleSnapshot({ marine, weather, tides, weatherEndpoint: 'archive' }, input)
    const rawC = marine.hourly.sea_surface_temperature[9]
    if (rawC !== null) {
      expect(snap.sst_f).toBeCloseTo(rawC * 9 / 5 + 32, 1)
      expect(snap.sst_f!).toBeGreaterThan(40)
    }
  })

  it('degrades to a partial snapshot when marine data is missing', () => {
    const snap = assembleSnapshot({ marine: null, weather, tides, weatherEndpoint: 'archive' }, input)
    expect(snap.waves.height_ft).toBeNull()
    expect(snap.sources.marine).toBe(false)
    expect(snap.wind.speed_kn).not.toBeNull()
  })

  it('summarises wind, swell, and the next high tide in one line', () => {
    const summary = summarise({
      wind: { speed_kn: 12, dir_deg: 315, gust_kn: 18 },
      waves: { height_ft: 3, period_s: 9, dir_deg: 290 },
      tides: [{ time: '2026-07-01T14:14', height_ft: 3.7, type: 'H' }],
    })
    expect(summary).toContain('12kt NW')
    expect(summary).toContain('3ft')
    expect(summary).toContain('9s')
  })
})
```

- [ ] **Step 4: Run and watch them fail**

Run: `npm test -- lib/conditions`
Expected: FAIL — `./snapshot` not found.

- [ ] **Step 5: Implement the fetchers**

`lib/conditions/open-meteo.ts` exports:

- `chooseWeatherEndpoint(date: string, today: Date): 'archive' | 'forecast'` — returns `'forecast'` when the date is within 5 days of today or in the future, `'archive'` otherwise. This exists because `archive-api` lags several days and silently returns nulls for recent dates.
- `fetchMarine(lat, lng, date)` — GETs `https://marine-api.open-meteo.com/v1/marine` with `hourly=wave_height,wave_direction,wave_period,swell_wave_height,swell_wave_direction,swell_wave_period,sea_surface_temperature`, `length_unit=imperial`, `timezone=America/Los_Angeles`.
- `fetchWeather(lat, lng, date, endpoint)` — GETs either `https://archive-api.open-meteo.com/v1/archive` or `https://api.open-meteo.com/v1/forecast` with `hourly=temperature_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m,pressure_msl`, `wind_speed_unit=kn`, `temperature_unit=fahrenheit`.

Every fetch uses `{ cache: 'no-store', signal: AbortSignal.timeout(8000) }` and returns `null` on any non-OK response or thrown error. A slow third-party API must not hold a trip save open.

`lib/conditions/noaa.ts` exports `fetchTides(stationId, date)` hitting `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter` with `product=predictions`, `interval=hilo`, `datum=MLLW`, `time_zone=lst_ldt`, `units=english`, `format=json`, `application=alice-may-logbook`, and dates formatted `YYYYMMDD`. It returns `null` on failure. Also export `fetchObservedWaterTempF(stationId, date)` using `product=water_temperature`, used as a cross-check when Open-Meteo's modelled SST is absent.

- [ ] **Step 6: Implement the pure assembly**

`lib/conditions/snapshot.ts` exports `pickHourIndex`, `summarise`, `assembleSnapshot`, and `buildSnapshot`.

- `pickHourIndex(times, date, time)` — finds the index of `${date}T${hh}:00` where `hh` is the hour of `time` rounded to nearest, defaulting to `12` when `time` is null. Returns `0` when not found.
- `assembleSnapshot(raw, input)` — reads that index out of each payload, converting SST with `cToF`, mapping NOAA predictions to `{ time: t.replace(' ', 'T'), height_ft: Number(v), type }`, and setting each `sources` flag from whether that payload was non-null. Never throws on missing data; it writes `null`.
- `summarise(parts)` — `"12kt NW · 3ft @ 9s · high 2:14pm"`, omitting any clause whose data is missing.
- `buildSnapshot(input)` — the impure wrapper: `Promise.all` over the fetchers, then `assembleSnapshot`. Status is `'ok'` when all three sources returned, `'partial'` when some did, `'failed'` when none did (in which case `snapshot` is `null`).

- [ ] **Step 7: Run the tests**

Run: `npm test -- lib/conditions`
Expected: PASS, 6 tests.

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "Add conditions capture with real-payload fixtures and tests"
```

---

### Task 8: Trip CRUD

**Files:**
- Create: `lib/validation/schemas.ts`, `app/(app)/layout.tsx`, `app/(app)/page.tsx`, `app/(app)/trips/page.tsx`, `app/(app)/trips/new/page.tsx`, `app/(app)/trips/[id]/page.tsx`, `app/(app)/trips/[id]/edit/page.tsx`, `app/(app)/trips/actions.ts`, `components/trips/TripForm.tsx`, `components/trips/TripCard.tsx`, `components/trips/ConditionsCard.tsx`, `components/ui/`

**Interfaces:**
- Consumes: `requireMembership`/`requireCrew` from Task 5, `buildSnapshot` from Task 7, `nmPerGallon` from Task 6.
- Produces: server actions `saveTrip(prev, formData)`, `deleteTrip(id)`, `refetchConditions(tripId)`. `tripSchema` in `lib/validation/schemas.ts`, shared by the client form and the server action so validation cannot diverge.

- [ ] **Step 1: Define the Zod schema**

`lib/validation/schemas.ts` — `tripSchema` covers every trip field. Numeric fields accept `''` and coerce to `null`, because an empty form field is not zero. `engine_hours_end >= engine_hours_start` is enforced with `.refine`, mirroring the database check constraint so the user sees a field error rather than a Postgres error.

- [ ] **Step 2: Build the app shell**

`app/(app)/layout.tsx` calls `requireMembership()`, then renders the nav shell: a bottom tab bar on mobile (Trips, Map, Fuel, Maintenance, More) and a sidebar from `md:` up. Crew-only destinations are hidden for viewers. Leave a slot for the theme toggle, wired in Task 15.

- [ ] **Step 3: Write the trip save action**

`app/(app)/trips/actions.ts`. The ordering here is the whole point — **the trip is written and committed first, then conditions are attached in a second update**. If Open-Meteo is down, the trip still saves and the detail page offers a retry.

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireCrew } from '@/lib/auth/membership'
import { createClient } from '@/lib/supabase/server'
import { tripSchema } from '@/lib/validation/schemas'

export async function saveTrip(_prev: unknown, formData: FormData) {
  const membership = await requireCrew()
  const parsed = tripSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    return { status: 'error' as const, fieldErrors: parsed.error.flatten().fieldErrors }
  }

  const supabase = await createClient()
  const { id, ...values } = parsed.data

  const { data: trip, error } = id
    ? await supabase.from('trips').update(values).eq('id', id).select('id').single()
    : await supabase
        .from('trips')
        .insert({
          ...values,
          boat_id: membership.boatId,
          created_by: membership.userId,
          conditions_status: 'pending',
        })
        .select('id')
        .single()

  if (error) return { status: 'error' as const, message: error.message }

  await attachConditions(trip.id)
  revalidatePath('/trips')
  redirect(`/trips/${trip.id}`)
}
```

`attachConditions(tripId)` is a non-exported helper that reads the trip plus its boat's `home_lat`, `home_lng`, and `tide_station_id`, prefers the trip's own `start_lat`/`start_lng` when present, calls `buildSnapshot`, and writes `conditions_snapshot`, `conditions_status`, and `conditions_fetched_at`. It is wrapped in try/catch and, on any throw, records status `'failed'` rather than propagating.

`refetchConditions(tripId)` is an exported action calling the same helper and revalidating — this is what the retry button calls.

- [ ] **Step 4: Build the trip form**

`components/trips/TripForm.tsx`, a client component over `useActionState(saveTrip, null)`. Mobile-first: single column, `inputMode="decimal"` on every numeric field so phones show a number pad, `text-lg` inputs and `min-h-12` targets. A "Use current location" button per coordinate pair calls `navigator.geolocation.getCurrentPosition` and fills the lat/lng fields. Crew and site pickers are multi-selects sourced from `crew` and `points_of_interest`.

- [ ] **Step 5: Build list, detail, and edit pages**

- `trips/page.tsx` — server component, newest first, showing date, hours, distance, fuel, and the conditions summary line per row.
- `trips/[id]/page.tsx` — full detail, the `ConditionsCard`, passengers, sites, photos, and crew-only Edit/Delete.
- `trips/[id]/edit/page.tsx` — the same `TripForm` seeded with existing values.

`ConditionsCard` renders the stored snapshot: wind with a rotated arrow glyph, wave height and period, SST, and the day's tides. When `conditions_status` is `failed` or `partial` it shows a retry button bound to `refetchConditions`.

- [ ] **Step 6: Verify end to end against the real database**

```bash
npm run dev
```

Sign in with the magic link, create a trip dated a week ago, and confirm the detail page shows real wind and tide values. Then confirm with MCP `execute_sql`:

```sql
select trip_date, conditions_status,
       conditions_snapshot->'wind'->>'speed_kn' as wind_kn,
       jsonb_array_length(conditions_snapshot->'tides') as tide_count
from public.trips order by created_at desc limit 1;
```

Expected: `conditions_status = 'ok'`, a non-null wind speed, and `tide_count` of 3 or 4.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "Add trip CRUD with automatic conditions capture on save"
```

---

### Task 9: Maintenance tracker

**Files:**
- Create: `lib/maintenance/due.ts`, `lib/maintenance/due.test.ts`, `app/(app)/maintenance/page.tsx`, `app/(app)/maintenance/actions.ts`, `components/maintenance/DueBanner.tsx`

**Interfaces:**
- Consumes: `requireMembership`/`requireCrew` from Task 5.
- Produces: `computeDueStatus(schedules, log, currentHours, today): DueItem[]` where `DueItem = { serviceType: string; lastServiceDate: string | null; lastServiceHours: number | null; dueAtHours: number | null; dueOnDate: string | null; hoursRemaining: number | null; daysRemaining: number | null; status: 'ok' | 'soon' | 'overdue' }`. `DueBanner` consumes this array and is also rendered on the dashboard.

- [ ] **Step 1: Write the failing tests**

`lib/maintenance/due.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { computeDueStatus } from './due'

const today = new Date('2026-07-26T12:00:00Z')

describe('computeDueStatus', () => {
  it('flags a service never performed as overdue', () => {
    const [item] = computeDueStatus(
      [{ service_type: 'Engine oil & filter', interval_hours: 100, interval_months: 12, active: true }],
      [], 412, today,
    )
    expect(item.status).toBe('overdue')
    expect(item.lastServiceDate).toBeNull()
  })

  it('reports ok when well inside both intervals', () => {
    const [item] = computeDueStatus(
      [{ service_type: 'Engine oil & filter', interval_hours: 100, interval_months: 12, active: true }],
      [{ service_type: 'Engine oil & filter', service_date: '2026-06-01', engine_hours_at_service: 400 }],
      420, today,
    )
    expect(item.status).toBe('ok')
    expect(item.dueAtHours).toBe(500)
    expect(item.hoursRemaining).toBe(80)
  })

  it('warns when within 10 percent of the hour interval', () => {
    const [item] = computeDueStatus(
      [{ service_type: 'Engine oil & filter', interval_hours: 100, interval_months: 12, active: true }],
      [{ service_type: 'Engine oil & filter', service_date: '2026-06-01', engine_hours_at_service: 400 }],
      495, today,
    )
    expect(item.status).toBe('soon')
  })

  it('goes overdue on hours even when the calendar interval is fine', () => {
    const [item] = computeDueStatus(
      [{ service_type: 'Engine oil & filter', interval_hours: 100, interval_months: 12, active: true }],
      [{ service_type: 'Engine oil & filter', service_date: '2026-07-01', engine_hours_at_service: 400 }],
      505, today,
    )
    expect(item.status).toBe('overdue')
  })

  it('goes overdue on the calendar even when hours are fine', () => {
    const [item] = computeDueStatus(
      [{ service_type: 'Water pump impeller', interval_hours: null, interval_months: 12, active: true }],
      [{ service_type: 'Water pump impeller', service_date: '2025-01-01', engine_hours_at_service: 300 }],
      310, today,
    )
    expect(item.status).toBe('overdue')
    expect(item.dueOnDate).toBe('2026-01-01')
  })

  it('uses the most recent service when several are logged', () => {
    const [item] = computeDueStatus(
      [{ service_type: 'Engine oil & filter', interval_hours: 100, interval_months: null, active: true }],
      [
        { service_type: 'Engine oil & filter', service_date: '2025-01-01', engine_hours_at_service: 200 },
        { service_type: 'Engine oil & filter', service_date: '2026-06-01', engine_hours_at_service: 400 },
      ],
      420, today,
    )
    expect(item.lastServiceHours).toBe(400)
    expect(item.status).toBe('ok')
  })

  it('skips inactive schedules', () => {
    expect(
      computeDueStatus(
        [{ service_type: 'Spark plugs', interval_hours: 400, interval_months: null, active: false }],
        [], 900, today,
      ),
    ).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run and watch them fail**

Run: `npm test -- lib/maintenance`
Expected: FAIL — `./due` not found.

- [ ] **Step 3: Implement `computeDueStatus`**

Pure, no database access. For each active schedule, find the most recent matching log row by `service_date`. Compute `dueAtHours = lastServiceHours + interval_hours` and `dueOnDate = lastServiceDate + interval_months`, skipping whichever interval is null. With no log row at all the item is `overdue` — an unserviced 2009 engine is not "ok". Status is `overdue` if either limit is passed, `soon` if within 10% of the hour interval or 30 days of the date, otherwise `ok`. Return sorted worst-first.

- [ ] **Step 4: Run the tests**

Run: `npm test -- lib/maintenance`
Expected: PASS, 7 tests.

- [ ] **Step 5: Build the maintenance page**

Server component reading schedules, the log, and the highest `engine_hours_end` across trips as current hours. Renders `DueBanner` (overdue in `alarm-500`, soon in `brass-500`, ok in `ok-500`), the service log, a crew-only "Log service" form, and a crew-only schedule editor. Also render `DueBanner` on the dashboard.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "Add maintenance tracker with hour and calendar due logic"
```

---

### Task 10: Charts, fuel & cost dashboard, and lifetime stats

**Files:**
- Create: `components/charts/LineChart.tsx`, `components/charts/BarChart.tsx`, `components/charts/Sparkline.tsx`, `components/charts/scale.ts`, `components/charts/scale.test.ts`, `app/(app)/fuel/page.tsx`, `app/(app)/stats/page.tsx`, `components/ui/StatTile.tsx`

**Interfaces:**
- Consumes: `nmPerGallon`, `gallonsPerHour`, `summariseFleet` from Task 6; `requireMembership` from Task 5.
- Produces:
  - `linearScale(domain: [number, number], range: [number, number]): (v: number) => number` from `components/charts/scale.ts`
  - `niceTicks(min: number, max: number, count: number): number[]`
  - `<LineChart series={{label, points: {x: number, y: number}[]}[]} height={number} yLabel={string} />`
  - `<BarChart bars={{label: string, value: number}[]} height={number} />`
  - `<StatTile label={string} value={string} sub={string?} />`

Charts are hand-rolled SVG rather than a charting library: a smaller mobile bundle, and marks that match the instrument aesthetic instead of overriding a library's defaults.

- [ ] **Step 1: Write the failing scale tests**

`components/charts/scale.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { linearScale, niceTicks } from './scale'

describe('linearScale', () => {
  it('maps the domain onto the range', () => {
    const s = linearScale([0, 10], [0, 100])
    expect(s(0)).toBe(0)
    expect(s(5)).toBe(50)
    expect(s(10)).toBe(100)
  })

  it('inverts for SVG y-axes where the range runs downward', () => {
    const s = linearScale([0, 10], [200, 0])
    expect(s(0)).toBe(200)
    expect(s(10)).toBe(0)
  })

  it('does not divide by zero on a flat domain', () => {
    const s = linearScale([5, 5], [0, 100])
    expect(Number.isFinite(s(5))).toBe(true)
  })
})

describe('niceTicks', () => {
  it('produces round numbers covering the range', () => {
    const ticks = niceTicks(0, 97, 5)
    expect(ticks[0]).toBeLessThanOrEqual(0)
    expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(97)
    expect(ticks.every((t) => Number.isFinite(t))).toBe(true)
  })

  it('handles a zero-width range without looping forever', () => {
    expect(niceTicks(4, 4, 5).length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run and watch them fail**

Run: `npm test -- components/charts`
Expected: FAIL — `./scale` not found.

- [ ] **Step 3: Implement `scale.ts`**

`linearScale` returns `(v) => range[0] + ((v - domain[0]) / span) * (range[1] - range[0])`, where a zero `span` is replaced by `1` so a flat series renders on a line instead of producing `NaN`. `niceTicks` rounds the step to the nearest 1, 2, or 5 times a power of ten, and always returns at least two ticks.

- [ ] **Step 4: Run the tests**

Run: `npm test -- components/charts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Build the chart components**

All three are server-safe (no hooks, no event handlers) so they render inside server components. They accept a `height` and stretch to `width: 100%` via `viewBox` plus `preserveAspectRatio="none"` on the plot area only — never on text. Axis labels use `class="tabular"`. Lines are `stroke-depth-400`, bars `fill-brass-500`, gridlines `stroke-hull-800/20`. Every chart renders an explicit empty state ("No trips logged yet") rather than an empty box.

- [ ] **Step 6: Build the fuel & cost dashboard**

`app/(app)/fuel/page.tsx` — a server component reading all trips for the boat. It shows:

- **Nautical miles per gallon over time** as the headline `LineChart`, one point per trip that has both distance and fuel. This is the chart that earns its place: a fouled prop or a sick injector shows up here before it shows up in a repair bill.
- Gallons per hour over time on the same chart as a second series.
- Cost per trip as a `BarChart`.
- Annual spend as a `BarChart` grouped by year, combining `fuel_cost_usd` from trips with `cost` from `maintenance_log`.
- `StatTile` row: average nm/gal, total spend this year, most expensive trip.

Trips missing distance or fuel are skipped from the efficiency series, not plotted as zero.

- [ ] **Step 7: Build the lifetime stats page**

`app/(app)/stats/page.tsx` uses `summariseFleet` for total hours, total nautical miles, total fuel burned, and trip count, plus a `BarChart` of trips per year and the current engine hours reading.

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "Add SVG charts, fuel and cost dashboard, and lifetime stats"
```

---

### Task 11: Map and points of interest

**Files:**
- Create: `components/map/MapCanvas.tsx`, `components/map/PoiMarkers.tsx`, `app/(app)/map/page.tsx`, `app/(app)/map/actions.ts`, `app/(app)/sites/[id]/page.tsx`, `components/map/leaflet.css`

**Interfaces:**
- Consumes: `requireMembership`/`requireCrew` from Task 5.
- Produces: server actions `savePoi(prev, formData)` and `deletePoi(id)`; `<MapCanvas center={[lat, lng]} zoom={number} markers={MapMarker[]} onMapClick={(lat, lng) => void} />` where `MapMarker = { id: string; lat: number; lng: number; label: string; category: string; href?: string }`.

- [ ] **Step 1: Build the Leaflet canvas as a client-only component**

`components/map/MapCanvas.tsx` starts with `'use client'`. Leaflet touches `window` at import time, so it must never be imported by a server component — import it into pages with `dynamic(() => import('...'), { ssr: false })`.

Two tile layers, both keyless:

```ts
// Base map
'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
// attribution: '© OpenStreetMap contributors'

// Nautical overlay — buoys, beacons, harbour detail
'https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png'
// attribution: '© OpenSeaMap contributors'
```

Both attributions are required by the tile providers' terms and must render on the map. Import Leaflet's stylesheet, and fix its default marker-icon paths, which break under bundlers — supply explicit `L.divIcon` markers coloured by category instead: dive site `depth-600`, anchorage `hull-700`, fishing spot `brass-500`, other `hull-800`.

- [ ] **Step 2: Write the POI actions**

`app/(app)/map/actions.ts` — `savePoi` calls `requireCrew()`, validates with a `poiSchema` (name required, lat in −90..90, lng in −180..180, category one of the four enumerated values, depth optional), and inserts or updates. `deletePoi` calls `requireCrew()` and deletes.

- [ ] **Step 3: Build the map page**

`app/(app)/map/page.tsx` loads every POI plus every trip with a start coordinate, and renders `MapCanvas` centred on the boat's home position. Adding a site has two entry points, because the moment you want to save a spot is usually the moment you are sitting on it:

- Tap the map to drop a pin, which opens the new-site sheet pre-filled with those coordinates.
- A "Use my current location" button calling `navigator.geolocation.getCurrentPosition`.

A category filter toggles marker groups. Trip start pins render in a distinct shape from POI pins. Viewers see the map and pins but get no add or edit affordances.

- [ ] **Step 4: Build the site detail page**

`app/(app)/sites/[id]/page.tsx` shows the site's name, category, depth, notes, a small locator map, and **every trip that visited it**, newest first, via `trip_sites`. Header reads e.g. "Metridium — 7 visits, last 12 June".

- [ ] **Step 5: Verify the map renders without a server-side crash**

```bash
npm run build && npm run dev
```

Expected: build succeeds. A `window is not defined` error means Leaflet leaked into a server component — wrap that import in `dynamic(..., { ssr: false })`.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "Add Leaflet map with OpenSeaMap overlay and points of interest"
```

---

### Task 12: Float plan

**Files:**
- Create: `app/(app)/float-plan/page.tsx`, `app/(app)/float-plan/actions.ts`, `app/fp/[token]/page.tsx`, `lib/float-plan/expiry.ts`, `lib/float-plan/expiry.test.ts`

**Interfaces:**
- Consumes: `requireCrew` from Task 5; the `public.get_float_plan(text)` RPC from Task 4.
- Produces: `createFloatPlan(prev, formData)` and `closeFloatPlan(id)` server actions; `floatPlanState(plan, now): 'active' | 'overdue' | 'closed' | 'expired'` — pure and tested.

- [ ] **Step 1: Write the failing expiry tests**

`lib/float-plan/expiry.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { floatPlanState } from './expiry'

const base = {
  departure_at: '2026-07-26T08:00:00Z',
  planned_return_at: '2026-07-26T16:00:00Z',
  expires_at: '2026-07-27T16:00:00Z',
  closed_at: null as string | null,
}

describe('floatPlanState', () => {
  it('is active before the planned return', () => {
    expect(floatPlanState(base, new Date('2026-07-26T12:00:00Z'))).toBe('active')
  })

  it('is overdue after the planned return with no close', () => {
    expect(floatPlanState(base, new Date('2026-07-26T17:00:00Z'))).toBe('overdue')
  })

  it('is closed once checked in, even past the return time', () => {
    expect(
      floatPlanState({ ...base, closed_at: '2026-07-26T15:30:00Z' }, new Date('2026-07-26T17:00:00Z')),
    ).toBe('closed')
  })

  it('is expired past the expiry timestamp', () => {
    expect(floatPlanState(base, new Date('2026-07-28T00:00:00Z'))).toBe('expired')
  })
})
```

- [ ] **Step 2: Run and watch them fail**

Run: `npm test -- lib/float-plan`
Expected: FAIL — `./expiry` not found.

- [ ] **Step 3: Implement `floatPlanState`**

Precedence, highest first: `closed_at` set → `closed`; `now > expires_at` → `expired`; `now > planned_return_at` → `overdue`; otherwise `active`. Checking `closed` before `expired` matters — a plan the skipper closed on time should never later read as a problem.

- [ ] **Step 4: Run the tests**

Run: `npm test -- lib/float-plan`
Expected: PASS, 4 tests.

- [ ] **Step 5: Write the create action**

`app/(app)/float-plan/actions.ts` — `createFloatPlan` calls `requireCrew()`, generates the token with `crypto.randomBytes(32).toString('base64url')`, sets `expires_at = planned_return_at + 24 hours`, inserts the plan, then inserts the selected crew into `float_plan_crew`. It returns the absolute share URL. `closeFloatPlan(id)` sets `closed_at = now()` — the "I'm back safe" check-in.

Do not use `Math.random()` for the token. It is not cryptographically random, and this token is the only thing standing between a URL and a list of emergency phone numbers.

- [ ] **Step 6: Build the crew-facing page**

`app/(app)/float-plan/page.tsx` — a one-tap departure screen: pick who is aboard, departure point, destination notes, planned return time. On save it shows the share link with a copy button and a `navigator.share` button where supported, so it can go straight into a text message. Active plans list with their live state and a prominent "Check in — I'm back" button.

- [ ] **Step 7: Build the public page**

`app/fp/[token]/page.tsx` — **not** inside `(app)`, so it never hits the membership gate. It creates a Supabase client and calls the RPC:

```ts
const { data } = await supabase.rpc('get_float_plan', { p_token: token })
```

An unknown, expired, or malformed token returns null and the page renders a neutral "This float plan is no longer available" — never a distinction between "wrong token" and "expired token", which would let someone probe for valid ones.

The page shows the boat name, who is aboard with their emergency contacts, departure point and time, planned return, and the live state. When overdue it leads with an unmissable banner: "Overdue — expected back at 4:30pm". Set `export const dynamic = 'force-dynamic'` so the overdue state is never served stale from cache. Add `<meta name="robots" content="noindex, nofollow" />`.

- [ ] **Step 8: Verify anonymous access works and the table stays sealed**

With MCP `execute_sql`, confirm the RPC is reachable as `anon` but the table is not:

```sql
select has_function_privilege('anon', 'public.get_float_plan(text)', 'execute') as rpc_ok,
       has_table_privilege('anon', 'public.float_plans', 'select') as table_leak;
```

Expected: `rpc_ok = true`, `table_leak = false`. A `true` in the second column is a security defect — find the stray grant before continuing.

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "Add float plan with auto-expiring public share link"
```

---

### Task 13: Documents, photos, and the boat page

**Files:**
- Create: `app/(app)/documents/page.tsx`, `app/(app)/documents/actions.ts`, `app/(app)/boat/page.tsx`, `components/trips/PhotoGallery.tsx`, `components/trips/PhotoUpload.tsx`, `lib/storage/signed.ts`, `lib/documents/expiry.ts`, `lib/documents/expiry.test.ts`

**Interfaces:**
- Consumes: `requireMembership`/`requireCrew` from Task 5; the private buckets from Task 4.
- Produces: `signedUrl(bucket, path, seconds = 3600): Promise<string | null>`; `documentStatus(expiresOn, today): 'ok' | 'expiring' | 'expired'`; server actions `uploadDocument`, `deleteDocument`, `uploadTripPhoto`, `deleteTripPhoto`.

- [ ] **Step 1: Write the failing document expiry tests**

`lib/documents/expiry.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { documentStatus } from './expiry'

const today = new Date('2026-07-26T00:00:00Z')

describe('documentStatus', () => {
  it('is ok when far from expiry', () => {
    expect(documentStatus('2027-01-01', today)).toBe('ok')
  })

  it('warns within 60 days', () => {
    expect(documentStatus('2026-08-15', today)).toBe('expiring')
  })

  it('is expired the day after the expiry date', () => {
    expect(documentStatus('2026-07-25', today)).toBe('expired')
  })

  it('treats a missing expiry date as ok', () => {
    expect(documentStatus(null, today)).toBe('ok')
  })
})
```

- [ ] **Step 2: Run and watch them fail**

Run: `npm test -- lib/documents`
Expected: FAIL.

- [ ] **Step 3: Implement `documentStatus` and run the tests**

`expired` when the date is before today, `expiring` within 60 days, otherwise `ok`; a null date is `ok`.

Run: `npm test -- lib/documents`
Expected: PASS, 4 tests.

- [ ] **Step 4: Implement signed URLs**

`lib/storage/signed.ts` — `createSignedUrl` against the private bucket, one hour by default. Every read path for photos and documents goes through this; nothing renders a bucket URL directly, because both buckets are private and a raw URL would 400 anyway.

- [ ] **Step 5: Build the upload actions**

Object paths are `${boatId}/${scope}/${crypto.randomUUID()}-${safeName}`, because the storage policies from Task 4 resolve membership from the first path segment. Getting this wrong silently denies every upload.

Both actions call `requireCrew()`, reject files over 10 MB, and restrict types: images for photos, images plus PDF for documents. On delete, remove the storage object **and** the row.

- [ ] **Step 6: Build the pages**

- `documents/page.tsx` — table of documents grouped by type with a status pill from `documentStatus`, expiring items surfaced first, and a crew-only upload form. Expiring or expired documents also raise a banner on the dashboard.
- `boat/page.tsx` — boat specs (name, make/model, year, engine, fuel capacity, home port), current engine hours from the latest trip, and a crew-only edit form.
- `PhotoGallery` / `PhotoUpload` — mount on the trip detail page. Gallery is a responsive grid of signed thumbnails with a tap-to-enlarge dialog; upload accepts multiple files with a progress state.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "Add document vault, trip photos, and boat specs page"
```

---

### Task 14: Crew and access administration

**Files:**
- Create: `app/(app)/access/page.tsx`, `app/(app)/access/actions.ts`, `app/(app)/crew/page.tsx`, `app/(app)/crew/actions.ts`

**Interfaces:**
- Consumes: `requireCrew` from Task 5; `allowed_emails` and the triggers from Task 2.
- Produces: server actions `addAllowedEmail`, `updateAllowedEmailRole`, `removeAllowedEmail`, `saveCrewMember`, `deleteCrewMember`.

This task is what makes the zero-SQL promise real. Without it, adding the next family member still means opening the dashboard.

- [ ] **Step 1: Write the access actions**

`app/(app)/access/actions.ts` — each action calls `requireCrew()` first. `addAllowedEmail` lowercases and trims the address before inserting, because `allowed_emails` carries a `check (email = lower(email))` constraint and a stray capital letter would otherwise surface as a raw Postgres error. On unique-violation, return "That address is already on the list" rather than the driver's message.

`removeAllowedEmail` must warn in the UI that removing an address also revokes that person's access immediately, since the delete trigger from Task 2 cascades to `boat_members`.

- [ ] **Step 2: Build the access page**

`app/(app)/access/page.tsx` — crew-only, reached from the More menu. Lists each allowed email with its role, whether that person has signed in yet (joined against `boat_members`), and controls to change role or remove. The add form is an email field plus a crew/viewer choice, with one line of explanation: they get in by requesting a magic link, no further setup.

Guard the page with `requireCrew()` — RLS already blocks a viewer's writes, but a viewer should not see the page at all.

- [ ] **Step 3: Build the crew roster page**

`app/(app)/crew/page.tsx` — the `crew` table: name, emergency contact name and phone. These are the people who appear in trip passenger lists and float plans, which is a different concept from who can log in, and the page should say so in a sentence.

- [ ] **Step 4: Verify the trigger path end to end**

Add a test address through the UI, then confirm with MCP `execute_sql`:

```sql
select email, role from public.allowed_emails order by created_at;
```

Then remove it through the UI and confirm it is gone from both `allowed_emails` and `boat_members`.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "Add crew roster and zero-SQL access administration"
```

---

### Task 15: Dark mode and tide planning

**Files:**
- Create: `components/ui/ThemeToggle.tsx`, `app/theme/actions.ts`, `app/(app)/tides/page.tsx`
- Modify: `app/layout.tsx`

**Interfaces:**
- Consumes: `fetchTides` from Task 7.
- Produces: `setTheme(theme: 'light' | 'dark' | 'system')` server action writing a `theme` cookie; `<ThemeToggle current={theme} />`.

- [ ] **Step 1: Wire the theme through the server**

`app/layout.tsx` reads the `theme` cookie and puts `class="dark"` on `<html>` during server rendering. This is the whole reason for a cookie rather than `localStorage`: the server already knows the theme, so there is no flash of the wrong palette on load. Add `suppressHydrationWarning` to `<html>`.

`setTheme` writes the cookie with a one-year `maxAge` and calls `revalidatePath('/', 'layout')`.

- [ ] **Step 2: Build the toggle**

Three-state control — Light, Dark, System — in the More menu and on the login page. System resolves through `matchMedia('(prefers-color-scheme: dark)')` on the client and updates the class without a round trip.

- [ ] **Step 3: Audit every surface in both themes**

Walk each page in light and dark. Dark mode here is a working requirement, not decoration — it is what gets used logging a trip at dusk. Check contrast on the `alarm-500` overdue banner and the chart gridlines specifically; those are the two that typically fail in one theme.

- [ ] **Step 4: Build the tide planning page**

`app/(app)/tides/page.tsx` — tides for the days ahead, before a trip exists. Calls `fetchTides` for the boat's `tide_station_id` across today plus the next six days, and renders high and low times per day with a marker for the current time. This is checked from the car park before heading down to the ramp, so it must be legible in one glance on a phone.

Cache the fetch with `next: { revalidate: 3600 }` — tide predictions for a fixed station do not change hour to hour, and this page will be refreshed repeatedly.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "Add cookie-backed dark mode and tide planning view"
```

---

### Task 16: PWA and offline draft capture

**Files:**
- Create: `app/manifest.ts`, `public/sw.js`, `components/pwa/ServiceWorkerRegistrar.tsx`, `components/pwa/DraftSyncBanner.tsx`, `lib/offline/drafts.ts`, `lib/offline/drafts.test.ts`, `public/icons/icon-192.png`, `public/icons/icon-512.png`, `public/icons/apple-touch-icon.png`
- Modify: `app/layout.tsx`, `components/trips/TripForm.tsx`

**Interfaces:**
- Consumes: `saveTrip` from Task 8.
- Produces: `saveDraft(draft: TripDraft): Promise<void>`, `listDrafts(): Promise<TripDraft[]>`, `deleteDraft(id: string): Promise<void>`, `isSyncable(draft, now): boolean` — where `TripDraft = { id: string; values: Record<string, string>; savedAt: number; attempts: number }`.

- [ ] **Step 1: Write the failing draft-queue tests**

`lib/offline/drafts.test.ts` tests the pure decision logic, with the `idb-keyval` store injected so the tests need no browser:

```ts
import { describe, expect, it } from 'vitest'
import { isSyncable, nextAttemptDelayMs } from './drafts'

describe('draft sync policy', () => {
  it('syncs a fresh draft immediately', () => {
    expect(isSyncable({ id: 'a', values: {}, savedAt: 0, attempts: 0 }, 1000)).toBe(true)
  })

  it('backs off after a failed attempt', () => {
    expect(isSyncable({ id: 'a', values: {}, savedAt: 0, attempts: 1 }, 1000)).toBe(false)
  })

  it('retries once the backoff window has passed', () => {
    expect(isSyncable({ id: 'a', values: {}, savedAt: 0, attempts: 1 }, 60_000)).toBe(true)
  })

  it('gives up after five attempts so a bad draft never loops forever', () => {
    expect(isSyncable({ id: 'a', values: {}, savedAt: 0, attempts: 5 }, 10_000_000)).toBe(false)
  })

  it('backs off exponentially', () => {
    expect(nextAttemptDelayMs(1)).toBeLessThan(nextAttemptDelayMs(2))
    expect(nextAttemptDelayMs(2)).toBeLessThan(nextAttemptDelayMs(3))
  })
})
```

- [ ] **Step 2: Run and watch them fail**

Run: `npm test -- lib/offline`
Expected: FAIL.

- [ ] **Step 3: Implement the draft queue**

`lib/offline/drafts.ts` wraps `idb-keyval` with a `trip-drafts` store. `nextAttemptDelayMs(attempts)` is `Math.min(30_000 * 2 ** (attempts - 1), 15 * 60_000)`. `isSyncable` returns false past five attempts, and otherwise true once `now - savedAt` exceeds the backoff for the current attempt count. A draft that has exhausted its attempts is kept, not discarded — it stays visible in the banner so the trip is never silently lost.

Run: `npm test -- lib/offline`
Expected: PASS, 5 tests.

- [ ] **Step 4: Wire drafts into the trip form**

`TripForm` writes the current field values to IndexedDB on change, debounced to about a second. On submit while `navigator.onLine` is false, it queues the draft and shows "Saved on this phone — will upload when you have signal" rather than an error. A successful online submit clears the draft for that form.

- [ ] **Step 5: Build the sync banner**

`DraftSyncBanner` mounts in the app layout, listens for the `online` event plus a 60-second interval, and flushes syncable drafts through `saveTrip`. It shows the pending count and a manual "Upload now" button. On success it removes the draft; on failure it increments `attempts`.

- [ ] **Step 6: Write the manifest and icons**

`app/manifest.ts` returns a `MetadataRoute.Manifest`: name "Alice May Logbook", short name "Alice May", `display: 'standalone'`, `start_url: '/'`, `background_color: '#06131f'`, `theme_color: '#0b2033'`, portrait orientation, and both icon sizes with `purpose: 'maskable'` variants. Generate the icons as a simple mark against the hull navy — a compass rose or the boat's initials. Add `apple-touch-icon` and `appleWebApp` metadata in `app/layout.tsx`, since iOS ignores the manifest for the home-screen icon.

- [ ] **Step 7: Write the service worker**

`public/sw.js`, hand-written rather than a plugin, because PWA plugins reliably lag Next.js major versions.

- Precache the app shell and static assets on `install`; bump `CACHE_VERSION` to invalidate.
- **Never cache anything under `/auth/`, `/api/`, or any non-GET request.** Caching an auth response is how a service worker serves one person's session to another.
- Navigation requests: network-first with a cached offline fallback page.
- Static assets: cache-first.
- Clean up old cache versions on `activate`.

`ServiceWorkerRegistrar` is a small client component that registers `/sw.js` on mount in production only — registering in development produces confusing stale-asset behaviour.

- [ ] **Step 8: Verify installability and offline behaviour**

```bash
npm run build && npm start
```

In Chrome DevTools → Application: the manifest parses with no errors, the service worker is activated, and the install prompt is offered. Then, with DevTools set to Offline: load a previously-visited page and confirm it renders, fill in the trip form and submit, confirm the "saved on this phone" message, go back online, and confirm the banner uploads it and it appears in the trip list.

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "Add PWA manifest, service worker, and offline trip drafts"
```

---

### Task 17: Security verification, full test pass, and deployment prep

**Files:**
- Create: `test/rls.md` (recorded results), `README.md`
- Modify: whatever the checks turn up

**Interfaces:**
- Consumes: everything.
- Produces: a verified security posture and a deployable app.

- [ ] **Step 1: Assert RLS behaviour directly against the database**

Do not assume the policies work because they were written. Run each check with MCP `execute_sql`, impersonating roles with `set local`. Record actual output in `test/rls.md`.

```sql
-- A viewer must not be able to insert a trip.
begin;
set local role authenticated;
set local request.jwt.claims to '{"sub":"<viewer-user-uuid>","role":"authenticated"}';
insert into public.trips (boat_id, trip_date) values ('<boat-uuid>', '2026-07-26');
rollback;
```

Expected: `new row violates row-level security policy for table "trips"`.

```sql
-- A signed-in non-member must see nothing.
begin;
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000000","role":"authenticated"}';
select count(*) as visible_trips from public.trips;
rollback;
```

Expected: `visible_trips = 0`.

```sql
-- anon must not read any application table directly.
begin;
set local role anon;
select count(*) from public.trips;
rollback;
```

Expected: permission denied or zero rows — never actual trip data.

To create a viewer to test against, insert an allowlist row with role `viewer` for an address you control, sign in as it once, and use its user id above.

- [ ] **Step 2: Run the advisors and fix what they report**

Run MCP `get_advisors` with `type: "security"`, then again with `type: "performance"`. Fix every security finding. The performance list will suggest indexes on foreign keys used by RLS policies — add the ones on `trips.boat_id`, `trip_passengers.trip_id`, and `trip_photos.trip_id`, since those are evaluated on every policy check.

- [ ] **Step 3: Run the whole test suite and the production build**

```bash
npm test && npx tsc --noEmit && npm run lint && npm run build
```

Expected: all four pass. Do not proceed past a failure — record the actual output.

- [ ] **Step 4: Regenerate types and confirm they are current**

Run MCP `generate_typescript_types`, overwrite `lib/supabase/database.types.ts`, and re-run `npx tsc --noEmit`. A type error here means the schema drifted from the checked-in types.

- [ ] **Step 5: Write the README**

Cover: what the app is, local setup, the three environment variables, how migrations are applied, and — most usefully — how to add a family member (add their email on the Access page, they request a magic link, done).

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "Verify RLS policies, fix advisor findings, and add README"
```

- [ ] **Step 7: Hand the deployment steps to the owner**

These require account access and cannot be done from here. Present them as an explicit list:

1. **Supabase dashboard → Authentication → URL Configuration**: set Site URL to the Vercel production URL and add `https://<domain>/auth/callback` plus `http://localhost:3000/auth/callback` to the redirect allowlist. Magic links fail silently without this.
2. **Vercel**: import the repository and set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`.
3. Sign in once on production to confirm the magic link round-trips.

---

## Self-Review

**Spec coverage.** Every numbered item in section 6 of the source spec maps to a task: schema to Tasks 2–4, trip CRUD to Task 8, auto conditions to Tasks 7–8, maintenance to Task 9, dashboards to Task 10, map and POIs to Task 11, and the nice-to-haves to Tasks 12–16. Section 4's confirmed features each have a home: maintenance tracker (9), fuel and cost dashboard (10), tide table for planning (15), lifetime stats (10), photos (13), dark mode (15), document vault (13), dive site map (11), trip map (11), float plan (12), PWA (16). Section 3's storage requirement — that the snapshot is written permanently rather than fetched on view — is enforced in Task 8 Step 3.

**Placeholders.** None. Every SQL statement, test body, and interface signature is written out in full.

**Type consistency.** `Membership` is defined once in Task 5 and consumed unchanged thereafter. `ConditionsSnapshot` is defined in Task 7 and read in Task 8. `DueItem` is defined in Task 9 and consumed by `DueBanner`. `MapMarker` is defined in Task 11. `TripDraft` is defined in Task 16. The three RLS helpers `app.is_member`, `app.is_crew`, and `app.is_crew_any` are created in Task 2 and referenced by exactly those names in Tasks 3, 4, and the storage policies.

**Known gap, deliberate.** NDBC buoy 46042 is described in the source spec as a secondary comparison source. NOAA CO-OPS station 9413450 already supplies observed water temperature for the same bay, and the buoy's fixed-width text format would add a parser for marginal gain. Not built. If the modelled swell ever looks wrong against reality, that is when to add it.
