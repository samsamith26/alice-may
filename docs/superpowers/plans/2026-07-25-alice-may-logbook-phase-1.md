# Alice May Logbook — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a deployed, mobile-first boat logbook where an authorised user signs in by magic link and can create, list, view and edit trips for Alice May, with row-level security enforcing owner/crew/viewer roles.

**Architecture:** Next.js App Router with Server Components for all reads and Server Actions for all writes, talking to Supabase Postgres through `@supabase/ssr`. Access control lives in the database: a `boat_members` table drives RLS policies via two `SECURITY DEFINER` helpers in a private schema. Pure arithmetic for engine hours and fuel lives in one unit-tested module shared between the form's live preview and the display pages.

**Tech Stack:** Next.js (App Router, TypeScript), Tailwind CSS, `@supabase/ssr` + `@supabase/supabase-js`, Zod, Vitest, Supabase Postgres 17, Vercel.

**Design doc:** `docs/superpowers/specs/2026-07-25-alice-may-logbook-phase-1-design.md`

## Global Constraints

- **Supabase project:** `alice-may`, ref `fyvvyjsninswdxnzwpdg`. Organisation is on the **free** plan.
- **Never use the deprecated `@supabase/auth-helpers-nextjs`.** Use `@supabase/ssr` only.
- **Never grant anything to `anon`.** There is no unauthenticated surface in this app.
- **RLS enabled on every table**, with no permissive fallback policy.
- **Every policy is written `to authenticated` plus an ownership predicate.** Never `to authenticated` alone; never `auth.role() = 'authenticated'` (deprecated, and passes for anonymous sign-ins).
- **Every UPDATE policy carries both `using` and `with check`.**
- **`SECURITY DEFINER` functions live in the `private` schema** with `EXECUTE` revoked from `public`, `anon`, `authenticated`.
- **Tables must be explicitly granted to `authenticated`.** Since 2026-05-30 new `public` tables are not auto-exposed to the Data API; this project was created 2026-07-25. Correct RLS with no grant means every query fails.
- **Auth uses `supabase.auth.getClaims()`**, never `getSession()`, for anything authorisation-related in server code.
- **Magic-link confirmation is `/auth/callback` + `exchangeCodeForSession`.** Do not use `token_hash` + `verifyOtp` — it needs an email-template edit this free-plan project cannot make.
- **Pin exact dependency versions and commit the lockfile.**
- **`.env.local` is already present and holds the service role key.** It is gitignored. Never commit it, never read it into client code, never log it.
- Schema changes are applied with MCP `execute_sql` while iterating, then written to `supabase/migrations/` in the repo. Do not use `apply_migration` to iterate.
- Units: gallons, nautical miles, decimal engine hours. Times are local wall-clock (`America/Los_Angeles`) stored as `date` + `time`.

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/0001_phase1_schema.sql` | All tables, constraints, indexes, RLS helpers, policies, grants, seed |
| `supabase/tests/rls.sql` | RLS assertion script, runs in a rolled-back transaction |
| `lib/supabase/client.ts` | Browser client factory |
| `lib/supabase/server.ts` | Server client factory (cookies) |
| `lib/supabase/middleware.ts` | Session refresh + route protection helper |
| `middleware.ts` | Next.js middleware entry point |
| `lib/auth.ts` | `getMembership()` / `canEdit()` — the app's view of role |
| `lib/derive.ts` | Pure hours-run and fuel-used arithmetic |
| `lib/trips/schema.ts` | Zod schema + form-data parsing |
| `lib/trips/queries.ts` | Read queries for list and detail |
| `lib/trips/actions.ts` | Server Actions: create, update |
| `lib/format.ts` | Display formatting (dates, times, numbers, coordinates) |
| `components/trip-form.tsx` | Client form component, shared by new and edit |
| `components/trip-card.tsx` | List row |
| `components/field.tsx` | Labelled input primitives |
| `app/...` | Routes per the design doc |

---

## Task 1: Scaffold, Tailwind, Vitest

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `app/layout.tsx`, `app/globals.css`, `vitest.config.ts`, `.env.example`
- Create: `lib/derive.ts`, `tests/derive.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: a booting Next.js app; `npm test` runs Vitest; `lib/derive.ts` exporting `hoursRun` and `fuelUsed` (defined in Task 3, stubbed here only so the toolchain has something to compile)

- [ ] **Step 1: Scaffold the app**

Run in `c:\Users\19254\Desktop\alice-may`:

```bash
npx create-next-app@latest . --typescript --tailwind --app --eslint --src-dir=false --import-alias "@/*" --no-turbopack
```

Answer "yes" to proceeding in a non-empty directory. It will not overwrite `.env.local`, `.gitignore`, `alice-may-logbook-spec.md`, or `docs/`.

- [ ] **Step 2: Verify the app boots**

Run: `npm run dev`
Expected: server starts, `http://localhost:3000` returns the Next.js starter page. Stop the server.

- [ ] **Step 3: Install pinned dependencies**

```bash
npm install --save-exact @supabase/ssr @supabase/supabase-js zod
npm install --save-exact --save-dev vitest
```

- [ ] **Step 4: Record the installed versions**

Run: `npm ls @supabase/ssr @supabase/supabase-js zod`

Write the exact versions into the plan's execution notes. **The `setAll` cookie signature changed across `@supabase/ssr` releases** — Task 4 checks this against the installed version rather than assuming.

- [ ] **Step 5: Add the Vitest config**

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
```

Only pure modules are unit-tested, so no jsdom or React plugin is needed.

- [ ] **Step 6: Add the test script**

In `package.json`, add to `"scripts"`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 7: Create a placeholder module and a smoke test**

Create `lib/derive.ts`:

```ts
export function hoursRun(start: number | null, end: number | null): number | null {
  return null
}
```

Create `tests/derive.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { hoursRun } from '@/lib/derive'

describe('hoursRun', () => {
  it('returns null when either reading is missing', () => {
    expect(hoursRun(null, 418.1)).toBeNull()
  })
})
```

- [ ] **Step 8: Make the `@/` alias work under Vitest**

Add to `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
```

- [ ] **Step 9: Run the test**

Run: `npm test`
Expected: PASS, 1 test.

- [ ] **Step 10: Create `.env.example`**

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

- [ ] **Step 11: Confirm `.env.local` is still ignored**

Run: `git status --short`
Expected: `.env.local` does **not** appear. If it does, stop and fix `.gitignore` before committing anything.

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "feat: scaffold Next.js app with Tailwind and Vitest"
```

---

## Task 2: Schema migration

**Files:**
- Create: `supabase/migrations/0001_phase1_schema.sql`

**Interfaces:**
- Consumes: nothing
- Produces: tables `boats`, `boat_members`, `allowed_emails`, `crew`, `trips`, `trip_passengers`; functions `private.is_boat_member(uuid)`, `private.can_edit_boat(uuid)`; a seeded boat row and an `allowed_emails` row for the owner

- [ ] **Step 1: Confirm the project is empty**

Use MCP `list_tables` with `project_id: fyvvyjsninswdxnzwpdg`, `schemas: ["public"]`.
Expected: `{"tables":[]}`. If not empty, stop and ask before proceeding.

- [ ] **Step 2: Write the migration file**

Create `supabase/migrations/0001_phase1_schema.sql`:

```sql
-- Alice May Logbook — Phase 1 schema
-- Tables, RLS, Data API grants, seed.

-- ---------------------------------------------------------------- schemas
create schema if not exists private;
revoke all on schema private from anon, authenticated;

-- ---------------------------------------------------------------- tables
create table public.boats (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  make_model         text,
  year               int,
  engine_make_model  text,
  fuel_capacity_gal  numeric(6,1),
  home_port          text,
  created_at         timestamptz not null default now()
);

create table public.boat_members (
  boat_id    uuid not null references public.boats(id) on delete cascade,
  user_id    uuid not null references auth.users(id)   on delete cascade,
  role       text not null default 'viewer'
             check (role in ('owner','crew','viewer')),
  created_at timestamptz not null default now(),
  primary key (boat_id, user_id)
);

create table public.allowed_emails (
  email      text not null check (email = lower(email)),
  boat_id    uuid not null references public.boats(id) on delete cascade,
  role       text not null default 'viewer'
             check (role in ('owner','crew','viewer')),
  created_at timestamptz not null default now(),
  primary key (email, boat_id)
);

create table public.crew (
  id                      uuid primary key default gen_random_uuid(),
  boat_id                 uuid not null references public.boats(id) on delete cascade,
  name                    text not null,
  emergency_contact_name  text,
  emergency_contact_phone text,
  created_at              timestamptz not null default now()
);

create table public.trips (
  id                   uuid primary key default gen_random_uuid(),
  boat_id              uuid not null references public.boats(id) on delete cascade,
  trip_date            date not null,
  departure_time       time,
  return_time          time,

  engine_hours_start   numeric(8,1),
  engine_hours_end     numeric(8,1),
  hours_run            numeric(8,1)
                       generated always as (engine_hours_end - engine_hours_start) stored,

  fuel_level_start_gal numeric(6,1),
  fuel_added_gal       numeric(6,1),
  fuel_level_end_gal   numeric(6,1),
  fuel_used_gal        numeric(6,1)
                       generated always as (
                         fuel_level_start_gal + coalesce(fuel_added_gal, 0) - fuel_level_end_gal
                       ) stored,

  distance_nm          numeric(7,1),
  start_lat            double precision,
  start_lng            double precision,
  end_lat              double precision,
  end_lng              double precision,
  route_points         jsonb,
  notes                text,
  conditions_snapshot  jsonb,
  created_by           uuid not null default auth.uid() references auth.users(id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint trips_hours_ordered check (
    engine_hours_start is null or engine_hours_end is null
    or engine_hours_end >= engine_hours_start
  )
);

create table public.trip_passengers (
  trip_id uuid not null references public.trips(id) on delete cascade,
  crew_id uuid not null references public.crew(id)  on delete cascade,
  primary key (trip_id, crew_id)
);

-- ---------------------------------------------------------------- indexes
create index trips_boat_date_idx      on public.trips (boat_id, trip_date desc);
create index trips_created_by_idx     on public.trips (created_by);
create index crew_boat_idx            on public.crew (boat_id);
create index trip_passengers_crew_idx on public.trip_passengers (crew_id);
create index boat_members_user_idx    on public.boat_members (user_id);

-- ---------------------------------------------------------------- updated_at
create function private.touch_updated_at() returns trigger
  language plpgsql set search_path = ''
as $$ begin new.updated_at := now(); return new; end $$;

create trigger trips_touch_updated_at
  before update on public.trips
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------- rls helpers
-- SECURITY DEFINER is required: a policy on boat_members that reads
-- boat_members would recurse. Kept in `private` and EXECUTE revoked so it is
-- not a callable endpoint for anon/authenticated.
create function private.is_boat_member(b uuid) returns boolean
  language sql security definer stable set search_path = ''
as $$ select exists (
  select 1 from public.boat_members m
  where m.boat_id = b and m.user_id = (select auth.uid())
) $$;

create function private.can_edit_boat(b uuid) returns boolean
  language sql security definer stable set search_path = ''
as $$ select exists (
  select 1 from public.boat_members m
  where m.boat_id = b and m.user_id = (select auth.uid())
    and m.role in ('owner','crew')
) $$;

revoke all on function private.is_boat_member(uuid) from public, anon, authenticated;
revoke all on function private.can_edit_boat(uuid)  from public, anon, authenticated;

-- ---------------------------------------------------------------- rls
alter table public.boats           enable row level security;
alter table public.boat_members    enable row level security;
alter table public.allowed_emails  enable row level security;
alter table public.crew            enable row level security;
alter table public.trips           enable row level security;
alter table public.trip_passengers enable row level security;

-- boats: readable by members, never writable through the API
create policy boats_select on public.boats
  for select to authenticated
  using (private.is_boat_member(id));

-- boat_members: readable by members, never writable through the API
create policy boat_members_select on public.boat_members
  for select to authenticated
  using (private.is_boat_member(boat_id));

-- allowed_emails: readable by owners only, never writable through the API
create policy allowed_emails_select on public.allowed_emails
  for select to authenticated
  using (exists (
    select 1 from public.boat_members m
    where m.boat_id = allowed_emails.boat_id
      and m.user_id = (select auth.uid())
      and m.role = 'owner'
  ));

-- crew
create policy crew_select on public.crew
  for select to authenticated
  using (private.is_boat_member(boat_id));

create policy crew_insert on public.crew
  for insert to authenticated
  with check (private.can_edit_boat(boat_id));

create policy crew_update on public.crew
  for update to authenticated
  using (private.can_edit_boat(boat_id))
  with check (private.can_edit_boat(boat_id));

create policy crew_delete on public.crew
  for delete to authenticated
  using (private.can_edit_boat(boat_id));

-- trips
create policy trips_select on public.trips
  for select to authenticated
  using (private.is_boat_member(boat_id));

create policy trips_insert on public.trips
  for insert to authenticated
  with check (private.can_edit_boat(boat_id));

create policy trips_update on public.trips
  for update to authenticated
  using (private.can_edit_boat(boat_id))
  with check (private.can_edit_boat(boat_id));

create policy trips_delete on public.trips
  for delete to authenticated
  using (private.can_edit_boat(boat_id));

-- trip_passengers: authority comes from the parent trip's boat
create policy trip_passengers_select on public.trip_passengers
  for select to authenticated
  using (exists (
    select 1 from public.trips t
    where t.id = trip_passengers.trip_id
      and private.is_boat_member(t.boat_id)
  ));

create policy trip_passengers_insert on public.trip_passengers
  for insert to authenticated
  with check (exists (
    select 1 from public.trips t
    where t.id = trip_passengers.trip_id
      and private.can_edit_boat(t.boat_id)
  ));

create policy trip_passengers_delete on public.trip_passengers
  for delete to authenticated
  using (exists (
    select 1 from public.trips t
    where t.id = trip_passengers.trip_id
      and private.can_edit_boat(t.boat_id)
  ));

-- ---------------------------------------------------------------- provisioning
create function private.handle_new_user() returns trigger
  language plpgsql security definer set search_path = ''
as $$
declare a record;
begin
  select * into a from public.allowed_emails where email = lower(new.email);
  if found then
    insert into public.boat_members (boat_id, user_id, role)
    values (a.boat_id, new.id, a.role)
    on conflict (boat_id, user_id) do nothing;
  end if;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

create function private.sync_member_role() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  update public.boat_members m set role = new.role
    from auth.users u
   where u.id = m.user_id
     and lower(u.email) = new.email
     and m.boat_id = new.boat_id;
  return new;
end $$;

create trigger on_allowed_email_updated
  after update of role on public.allowed_emails
  for each row execute function private.sync_member_role();

-- ---------------------------------------------------------------- data api grants
-- Since 2026-05-30 new public tables are NOT auto-exposed to the Data API.
-- Without these grants every query fails regardless of RLS. Never grant anon.
grant select on public.boats          to authenticated;
grant select on public.boat_members   to authenticated;
grant select on public.allowed_emails to authenticated;
grant select, insert, update, delete on public.crew            to authenticated;
grant select, insert, update, delete on public.trips           to authenticated;
grant select, insert, update, delete on public.trip_passengers to authenticated;

-- ---------------------------------------------------------------- seed
insert into public.boats (name, make_model, year, engine_make_model, home_port)
values ('Alice May', 'Jeanneau Merry Fisher 795', 2009, 'Yamaha F200', 'Monterey Harbor');

insert into public.allowed_emails (email, boat_id, role)
select 'samuel.smith2204@gmail.com', id, 'owner' from public.boats where name = 'Alice May';
```

`fuel_capacity_gal` is deliberately left `NULL` — the value is still an open item and nothing in Phase 1 reads it.

- [ ] **Step 3: Apply the SQL**

Use MCP `execute_sql` with `project_id: fyvvyjsninswdxnzwpdg` and the full contents of the file.

If it errors, fix the file and re-run against a clean slate — drop with `drop schema public cascade; create schema public; drop schema private cascade;` then re-apply. Do **not** patch forward with ad-hoc statements; the file must be the single source of truth.

- [ ] **Step 4: Verify the tables and RLS**

Use MCP `list_tables` with `verbose: true`.
Expected: all six tables present, each reporting RLS enabled.

- [ ] **Step 5: Verify the generated columns behave**

Use MCP `execute_sql`:

```sql
select
  hours_run, fuel_used_gal
from (
  select
    (418.1::numeric(8,1) - 412.3::numeric(8,1)) as hours_run,
    (48::numeric(6,1) + coalesce(20::numeric(6,1),0) - 31::numeric(6,1)) as fuel_used_gal
) t;
```

Expected: `hours_run = 5.8`, `fuel_used_gal = 37.0`. These are the exact numbers `tests/derive.test.ts` asserts against in Task 3.

- [ ] **Step 6: Run the security advisors**

Use MCP `get_advisors` with `type: "security"`.
Expected: no findings. If it reports a table without RLS or an exposed `SECURITY DEFINER` function, fix the migration and re-apply before continuing.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0001_phase1_schema.sql
git commit -m "feat: add Phase 1 schema with RLS, role model and Data API grants"
```

---

## Task 3: Pure derivation logic

**Files:**
- Modify: `lib/derive.ts`
- Modify: `tests/derive.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `hoursRun(start: number | null, end: number | null): number | null` and `fuelUsed(start: number | null, added: number | null, end: number | null): number | null` — used by `components/trip-form.tsx` (Task 7) for the live preview and by the list and detail pages for display

These must agree exactly with the generated columns, including the null cases. That agreement is the whole point of the module.

- [ ] **Step 1: Write the failing tests**

Replace `tests/derive.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { fuelUsed, hoursRun } from '@/lib/derive'

describe('hoursRun', () => {
  it('subtracts start from end', () => {
    expect(hoursRun(412.3, 418.1)).toBe(5.8)
  })

  it('returns null when the start reading is missing', () => {
    expect(hoursRun(null, 418.1)).toBeNull()
  })

  it('returns null when the end reading is missing', () => {
    expect(hoursRun(412.3, null)).toBeNull()
  })

  it('returns zero for a trip logged with identical readings', () => {
    expect(hoursRun(412.3, 412.3)).toBe(0)
  })
})

describe('fuelUsed', () => {
  it('adds fuel taken on aboard', () => {
    expect(fuelUsed(48, 20, 31)).toBe(37)
  })

  it('treats missing added fuel as zero, matching coalesce in the generated column', () => {
    expect(fuelUsed(48, null, 31)).toBe(17)
  })

  it('returns null when the start level is missing', () => {
    expect(fuelUsed(null, 20, 31)).toBeNull()
  })

  it('returns null when the end level is missing', () => {
    expect(fuelUsed(48, 20, null)).toBeNull()
  })

  it('does not accumulate floating point error', () => {
    expect(fuelUsed(48.1, 0.2, 31.2)).toBe(17.1)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `fuelUsed` is not exported, and `hoursRun` returns `null` for everything.

- [ ] **Step 3: Implement**

Replace `lib/derive.ts`:

```ts
/**
 * Mirrors the `hours_run` and `fuel_used_gal` generated columns in
 * `supabase/migrations/0001_phase1_schema.sql`, including their null
 * semantics, so the form preview and the stored value never disagree.
 */

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

export function hoursRun(start: number | null, end: number | null): number | null {
  if (start === null || end === null) return null
  return round1(end - start)
}

export function fuelUsed(
  start: number | null,
  added: number | null,
  end: number | null,
): number | null {
  if (start === null || end === null) return null
  return round1(start + (added ?? 0) - end)
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/derive.ts tests/derive.test.ts
git commit -m "feat: add engine hours and fuel derivation matching generated columns"
```

---

## Task 4: Supabase clients, middleware, magic-link auth

**Files:**
- Create: `lib/supabase/client.ts`, `lib/supabase/server.ts`, `lib/supabase/middleware.ts`, `middleware.ts`, `lib/auth.ts`
- Create: `app/login/page.tsx`, `app/login/actions.ts`, `app/auth/callback/route.ts`, `app/auth/signout/route.ts`, `app/no-access/page.tsx`
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: the schema from Task 2
- Produces:
  - `createClient()` from `lib/supabase/server` — async, returns a Supabase client bound to request cookies
  - `createClient()` from `lib/supabase/client` — sync, browser client
  - `getMembership(): Promise<{ boatId: string; role: Role } | null>` from `lib/auth`
  - `canEdit(role: Role): boolean` from `lib/auth`
  - `type Role = 'owner' | 'crew' | 'viewer'` from `lib/auth`

- [ ] **Step 1: Check the installed `@supabase/ssr` cookie signature**

Run: `cat node_modules/@supabase/ssr/dist/main/types.d.ts | grep -A 12 "setAll"`

Recent versions pass `setAll(cookiesToSet, headers)`; older ones pass only `cookiesToSet`. Write whichever the installed version declares. If `headers` is present, forward it in the middleware as shown in Step 4's comment.

- [ ] **Step 2: Create the browser client**

Create `lib/supabase/client.ts`:

```ts
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
```

- [ ] **Step 3: Create the server client**

Create `lib/supabase/server.ts`:

```ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
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
            // Called from a Server Component, which cannot set cookies.
            // The middleware refreshes the session, so this is safe to ignore.
          }
        },
      },
    },
  )
}
```

- [ ] **Step 4: Create the middleware session helper**

Create `lib/supabase/middleware.ts`:

```ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PUBLIC_PATHS = ['/login', '/auth/callback', '/auth/signout']

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        // If the installed @supabase/ssr passes a second `headers` argument,
        // accept it and copy entries onto supabaseResponse.headers as well.
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  // Do not insert any code between createServerClient and getClaims.
  // Anything that touches cookies in between will desynchronise the session
  // and produce users who are randomly logged out.
  const { data } = await supabase.auth.getClaims()

  const isPublic = PUBLIC_PATHS.some((p) =>
    request.nextUrl.pathname.startsWith(p),
  )

  if (!data?.claims && !isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Must return supabaseResponse itself so the refreshed cookies survive.
  return supabaseResponse
}
```

- [ ] **Step 5: Create the middleware entry point**

Create `middleware.ts`:

```ts
import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
```

- [ ] **Step 6: Create the membership helper**

Create `lib/auth.ts`:

```ts
import { createClient } from '@/lib/supabase/server'

export type Role = 'owner' | 'crew' | 'viewer'

export type Membership = {
  boatId: string
  role: Role
}

export function canEdit(role: Role): boolean {
  return role === 'owner' || role === 'crew'
}

/**
 * The app's single view of "who am I and what may I do".
 * Phase 1 assumes one boat, but reads it from boat_members so that
 * supporting a second boat later is a change to this function alone.
 */
export async function getMembership(): Promise<Membership | null> {
  const supabase = await createClient()

  const { data: claimsData } = await supabase.auth.getClaims()
  if (!claimsData?.claims) return null

  const { data } = await supabase
    .from('boat_members')
    .select('boat_id, role')
    .limit(1)
    .maybeSingle()

  if (!data) return null
  return { boatId: data.boat_id, role: data.role as Role }
}
```

- [ ] **Step 7: Create the login action**

Create `app/login/actions.ts`:

```ts
'use server'

import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

export type LoginState = { status: 'idle' | 'sent' | 'error'; message?: string }

export async function requestMagicLink(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  if (!email) return { status: 'error', message: 'Enter your email address.' }

  const origin = (await headers()).get('origin')
  const supabase = await createClient()

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origin}/auth/callback` },
  })

  if (error) return { status: 'error', message: error.message }
  return { status: 'sent' }
}
```

- [ ] **Step 8: Create the login page**

Create `app/login/page.tsx`:

```tsx
'use client'

import { useActionState } from 'react'
import { requestMagicLink, type LoginState } from './actions'

const initial: LoginState = { status: 'idle' }

export default function LoginPage() {
  const [state, action, pending] = useActionState(requestMagicLink, initial)

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6">
      <h1 className="text-2xl font-semibold">Alice May Logbook</h1>
      <p className="mt-1 text-sm text-slate-500">
        Sign in with a link sent to your email.
      </p>

      {state.status === 'sent' ? (
        <p className="mt-6 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-900">
          Check your email for the sign-in link.
        </p>
      ) : (
        <form action={action} className="mt-6 space-y-4">
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            className="w-full rounded-lg border border-slate-300 px-4 py-3 text-base"
          />
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-lg bg-slate-900 px-4 py-3 text-base font-medium text-white disabled:opacity-50"
          >
            {pending ? 'Sending…' : 'Send sign-in link'}
          </button>
          {state.status === 'error' && (
            <p className="text-sm text-red-600">{state.message}</p>
          )}
        </form>
      )}
    </main>
  )
}
```

- [ ] **Step 9: Create the callback route**

Create `app/auth/callback/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/trips'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      const forwardedHost = request.headers.get('x-forwarded-host')
      const isLocal = process.env.NODE_ENV === 'development'
      if (!isLocal && forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${next}`)
      }
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`)
}
```

- [ ] **Step 10: Create the sign-out route**

Create `app/auth/signout/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  await supabase.auth.signOut()
  return NextResponse.redirect(new URL('/login', request.url), { status: 303 })
}
```

- [ ] **Step 11: Create the no-access page**

Create `app/no-access/page.tsx`:

```tsx
export default function NoAccessPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6 text-center">
      <h1 className="text-xl font-semibold">No access</h1>
      <p className="mt-2 text-sm text-slate-500">
        You&rsquo;re signed in, but this account isn&rsquo;t on the crew list for
        Alice May. Ask the owner to add your email.
      </p>
      <form action="/auth/signout" method="post" className="mt-6">
        <button className="text-sm font-medium underline">Sign out</button>
      </form>
    </main>
  )
}
```

- [ ] **Step 12: Redirect the root**

Replace `app/page.tsx`:

```tsx
import { redirect } from 'next/navigation'

export default function Home() {
  redirect('/trips')
}
```

- [ ] **Step 13: Configure the Supabase redirect allowlist**

**This is a manual dashboard step and sign-in cannot work without it.** Ask the user to open
`https://supabase.com/dashboard/project/fyvvyjsninswdxnzwpdg/auth/url-configuration`
and set:

- Site URL: `http://localhost:3000`
- Redirect URLs: add `http://localhost:3000/**`

The Vercel production domain is added in Task 9, once it exists.

- [ ] **Step 14: Verify sign-in end to end**

Run: `npm run dev`, open `http://localhost:3000`.
Expected: redirected to `/login`. Submit `samuel.smith2204@gmail.com`, click the emailed link, and land on `/trips` (which 404s for now — that is expected, Task 6 builds it).

- [ ] **Step 15: Verify the membership trigger fired**

Use MCP `execute_sql`:

```sql
select u.email, m.role
  from public.boat_members m
  join auth.users u on u.id = m.user_id;
```

Expected: one row, `samuel.smith2204@gmail.com` with role `owner`. If empty, the `on_auth_user_created` trigger did not fire — check that the seeded `allowed_emails` row is lowercase and matches.

- [ ] **Step 16: Commit**

```bash
git add -A
git commit -m "feat: add Supabase clients, middleware and magic-link auth"
```

---

## Task 5: Trip validation schema

**Files:**
- Create: `lib/trips/schema.ts`, `tests/trip-schema.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `tripFormSchema` — Zod schema
  - `type TripInput = z.infer<typeof tripFormSchema>`
  - `parseTripForm(formData: FormData): { ok: true; data: TripInput } | { ok: false; errors: Record<string, string> }`

The critical behaviour: an untouched numeric input arrives as `""` and must become `null`, not `0`. A trip saved with an empty fuel field must record "unknown", never "zero gallons".

- [ ] **Step 1: Write the failing tests**

Create `tests/trip-schema.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { parseTripForm } from '@/lib/trips/schema'

function form(fields: Record<string, string | string[]>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) {
    if (Array.isArray(v)) v.forEach((item) => fd.append(k, item))
    else fd.set(k, v)
  }
  return fd
}

describe('parseTripForm', () => {
  it('accepts a trip with only a date', () => {
    const result = parseTripForm(form({ trip_date: '2026-07-25' }))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.trip_date).toBe('2026-07-25')
  })

  it('rejects a missing date', () => {
    const result = parseTripForm(form({ trip_date: '' }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.trip_date).toBeTruthy()
  })

  it('turns empty numeric fields into null rather than zero', () => {
    const result = parseTripForm(
      form({ trip_date: '2026-07-25', fuel_added_gal: '' }),
    )
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.fuel_added_gal).toBeNull()
  })

  it('turns empty time fields into null', () => {
    const result = parseTripForm(
      form({ trip_date: '2026-07-25', departure_time: '' }),
    )
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.departure_time).toBeNull()
  })

  it('parses numeric fields', () => {
    const result = parseTripForm(
      form({ trip_date: '2026-07-25', engine_hours_start: '412.3' }),
    )
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.engine_hours_start).toBe(412.3)
  })

  it('rejects non-numeric input in a numeric field', () => {
    const result = parseTripForm(
      form({ trip_date: '2026-07-25', distance_nm: 'twelve' }),
    )
    expect(result.ok).toBe(false)
  })

  it('rejects negative fuel', () => {
    const result = parseTripForm(
      form({ trip_date: '2026-07-25', fuel_added_gal: '-5' }),
    )
    expect(result.ok).toBe(false)
  })

  it('rejects end hours below start hours, matching the check constraint', () => {
    const result = parseTripForm(
      form({
        trip_date: '2026-07-25',
        engine_hours_start: '418.1',
        engine_hours_end: '412.3',
      }),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.engine_hours_end).toBeTruthy()
  })

  it('allows a return time before the departure time for an overnight trip', () => {
    const result = parseTripForm(
      form({
        trip_date: '2026-07-25',
        departure_time: '22:00',
        return_time: '05:30',
      }),
    )
    expect(result.ok).toBe(true)
  })

  it('collects passenger ids', () => {
    const a = '11111111-1111-4111-8111-111111111111'
    const b = '22222222-2222-4222-8222-222222222222'
    const result = parseTripForm(
      form({ trip_date: '2026-07-25', passenger_ids: [a, b] }),
    )
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.passenger_ids).toEqual([a, b])
  })

  it('turns an empty notes field into null', () => {
    const result = parseTripForm(form({ trip_date: '2026-07-25', notes: '   ' }))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.notes).toBeNull()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `lib/trips/schema` does not exist.

- [ ] **Step 3: Implement the schema**

Create `lib/trips/schema.ts`:

```ts
import { z } from 'zod'

/** Empty form inputs mean "not recorded", never zero. */
const emptyToNull = (v: unknown) =>
  v === '' || v === null || v === undefined ? null : v

const optionalNumber = z.preprocess(
  (v) => {
    const e = emptyToNull(v)
    return e === null ? null : Number(e)
  },
  z.number().finite().nonnegative().nullable(),
)

const optionalCoord = z.preprocess(
  (v) => {
    const e = emptyToNull(v)
    return e === null ? null : Number(e)
  },
  z.number().finite().nullable(),
)

const optionalTime = z.preprocess(
  emptyToNull,
  z
    .string()
    .regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Use a time like 08:15')
    .nullable(),
)

const optionalText = z.preprocess((v) => {
  const e = emptyToNull(v)
  if (e === null) return null
  const trimmed = String(e).trim()
  return trimmed === '' ? null : trimmed
}, z.string().nullable())

export const tripFormSchema = z
  .object({
    trip_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'A trip date is required'),
    departure_time: optionalTime,
    return_time: optionalTime,
    engine_hours_start: optionalNumber,
    engine_hours_end: optionalNumber,
    fuel_level_start_gal: optionalNumber,
    fuel_added_gal: optionalNumber,
    fuel_level_end_gal: optionalNumber,
    distance_nm: optionalNumber,
    start_lat: optionalCoord,
    start_lng: optionalCoord,
    end_lat: optionalCoord,
    end_lng: optionalCoord,
    notes: optionalText,
    passenger_ids: z.array(z.string().uuid()),
  })
  .refine(
    (d) =>
      d.engine_hours_start === null ||
      d.engine_hours_end === null ||
      d.engine_hours_end >= d.engine_hours_start,
    {
      message: 'Engine hours at return must be at least the hours at departure',
      path: ['engine_hours_end'],
    },
  )

export type TripInput = z.infer<typeof tripFormSchema>

export type ParseResult =
  | { ok: true; data: TripInput }
  | { ok: false; errors: Record<string, string> }

export function parseTripForm(formData: FormData): ParseResult {
  const raw = {
    trip_date: formData.get('trip_date') ?? '',
    departure_time: formData.get('departure_time') ?? '',
    return_time: formData.get('return_time') ?? '',
    engine_hours_start: formData.get('engine_hours_start') ?? '',
    engine_hours_end: formData.get('engine_hours_end') ?? '',
    fuel_level_start_gal: formData.get('fuel_level_start_gal') ?? '',
    fuel_added_gal: formData.get('fuel_added_gal') ?? '',
    fuel_level_end_gal: formData.get('fuel_level_end_gal') ?? '',
    distance_nm: formData.get('distance_nm') ?? '',
    start_lat: formData.get('start_lat') ?? '',
    start_lng: formData.get('start_lng') ?? '',
    end_lat: formData.get('end_lat') ?? '',
    end_lng: formData.get('end_lng') ?? '',
    notes: formData.get('notes') ?? '',
    passenger_ids: formData.getAll('passenger_ids').map(String),
  }

  const parsed = tripFormSchema.safeParse(raw)
  if (parsed.success) return { ok: true, data: parsed.data }

  const errors: Record<string, string> = {}
  for (const issue of parsed.error.issues) {
    const key = String(issue.path[0] ?? 'form')
    if (!errors[key]) errors[key] = issue.message
  }
  return { ok: false, errors }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, all tests across both files.

If the Zod version installed is v4 and `z.preprocess` or `parsed.error.issues` has changed shape, check the installed version's types before adapting — do not guess.

- [ ] **Step 5: Commit**

```bash
git add lib/trips/schema.ts tests/trip-schema.test.ts
git commit -m "feat: add trip form validation treating blank fields as unrecorded"
```

---

## Task 6: Trip queries and list page

**Files:**
- Create: `lib/trips/queries.ts`, `lib/format.ts`, `components/trip-card.tsx`, `app/trips/page.tsx`
- Modify: `app/layout.tsx`

**Interfaces:**
- Consumes: `getMembership`, `canEdit`, `Role` from `lib/auth`; `hoursRun`, `fuelUsed` from `lib/derive`
- Produces:
  - `type TripListItem` — `{ id, trip_date, departure_time, return_time, hours_run, fuel_used_gal, distance_nm, notes, passengers: { id, name }[] }`
  - `listTrips(boatId: string): Promise<TripListItem[]>`
  - `formatTripDate(iso: string): string`, `formatTime(t: string | null): string | null`, `formatNumber(n: number | null, unit: string): string | null` from `lib/format`

- [ ] **Step 1: Write the format helpers**

Create `lib/format.ts`:

```ts
export function formatTripDate(iso: string): string {
  // iso is a plain date string; parse as local to avoid a UTC day shift.
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

export function formatTime(t: string | null): string | null {
  if (!t) return null
  const [h, m] = t.split(':').map(Number)
  const date = new Date(2000, 0, 1, h, m)
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function formatNumber(n: number | null, unit: string): string | null {
  if (n === null || n === undefined) return null
  const trimmed = Number.isInteger(n) ? String(n) : n.toFixed(1)
  return `${trimmed} ${unit}`
}

export function formatCoord(lat: number | null, lng: number | null): string | null {
  if (lat === null || lng === null) return null
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`
}
```

- [ ] **Step 2: Write the query module**

Create `lib/trips/queries.ts`:

```ts
import { createClient } from '@/lib/supabase/server'

export type TripListItem = {
  id: string
  trip_date: string
  departure_time: string | null
  return_time: string | null
  hours_run: number | null
  fuel_used_gal: number | null
  distance_nm: number | null
  notes: string | null
  passengers: { id: string; name: string }[]
}

type PassengerRow = { crew: { id: string; name: string } | null }

export async function listTrips(boatId: string): Promise<TripListItem[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('trips')
    .select(
      `id, trip_date, departure_time, return_time,
       hours_run, fuel_used_gal, distance_nm, notes,
       trip_passengers ( crew ( id, name ) )`,
    )
    .eq('boat_id', boatId)
    .order('trip_date', { ascending: false })
    .order('departure_time', { ascending: false, nullsFirst: false })

  if (error) throw new Error(`Failed to load trips: ${error.message}`)

  return (data ?? []).map((t) => ({
    id: t.id,
    trip_date: t.trip_date,
    departure_time: t.departure_time,
    return_time: t.return_time,
    hours_run: t.hours_run,
    fuel_used_gal: t.fuel_used_gal,
    distance_nm: t.distance_nm,
    notes: t.notes,
    passengers: ((t.trip_passengers ?? []) as unknown as PassengerRow[])
      .map((p) => p.crew)
      .filter((c): c is { id: string; name: string } => c !== null),
  }))
}
```

- [ ] **Step 3: Write the trip card**

Create `components/trip-card.tsx`:

```tsx
import Link from 'next/link'
import type { TripListItem } from '@/lib/trips/queries'
import { formatNumber, formatTime, formatTripDate } from '@/lib/format'

export function TripCard({ trip }: { trip: TripListItem }) {
  const times = [formatTime(trip.departure_time), formatTime(trip.return_time)]
    .filter(Boolean)
    .join(' – ')

  const stats = [
    formatNumber(trip.hours_run, 'hrs'),
    formatNumber(trip.fuel_used_gal, 'gal'),
    formatNumber(trip.distance_nm, 'nm'),
  ].filter(Boolean) as string[]

  return (
    <Link
      href={`/trips/${trip.id}`}
      className="block rounded-xl border border-slate-200 bg-white p-4 active:bg-slate-50"
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-medium">{formatTripDate(trip.trip_date)}</span>
        {times && <span className="text-sm text-slate-500">{times}</span>}
      </div>

      {stats.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm text-slate-600">
          {stats.map((s) => (
            <span key={s}>{s}</span>
          ))}
        </div>
      )}

      {trip.passengers.length > 0 && (
        <div className="mt-2 text-sm text-slate-500">
          {trip.passengers.map((p) => p.name).join(', ')}
        </div>
      )}

      {trip.notes && (
        <p className="mt-2 line-clamp-2 text-sm text-slate-500">{trip.notes}</p>
      )}
    </Link>
  )
}
```

- [ ] **Step 4: Write the list page**

Create `app/trips/page.tsx`:

```tsx
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { canEdit, getMembership } from '@/lib/auth'
import { listTrips } from '@/lib/trips/queries'
import { TripCard } from '@/components/trip-card'

export default async function TripsPage() {
  const membership = await getMembership()
  if (!membership) redirect('/no-access')

  const trips = await listTrips(membership.boatId)
  const editable = canEdit(membership.role)

  const byYear = new Map<string, typeof trips>()
  for (const trip of trips) {
    const year = trip.trip_date.slice(0, 4)
    if (!byYear.has(year)) byYear.set(year, [])
    byYear.get(year)!.push(trip)
  }

  return (
    <main className="mx-auto max-w-2xl px-4 pb-24 pt-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Alice May</h1>
        <form action="/auth/signout" method="post">
          <button className="text-sm text-slate-500 underline">Sign out</button>
        </form>
      </header>

      {trips.length === 0 ? (
        <p className="mt-12 text-center text-sm text-slate-500">
          No trips logged yet.
        </p>
      ) : (
        [...byYear.entries()].map(([year, yearTrips]) => (
          <section key={year} className="mt-6">
            <h2 className="mb-2 text-sm font-medium text-slate-400">{year}</h2>
            <div className="space-y-3">
              {yearTrips.map((trip) => (
                <TripCard key={trip.id} trip={trip} />
              ))}
            </div>
          </section>
        ))
      )}

      {editable && (
        <Link
          href="/trips/new"
          className="fixed inset-x-0 bottom-0 mx-auto mb-6 block w-[calc(100%-2rem)] max-w-md rounded-full bg-slate-900 py-4 text-center text-base font-medium text-white shadow-lg"
        >
          Log a trip
        </Link>
      )}
    </main>
  )
}
```

- [ ] **Step 5: Set the page metadata and background**

In `app/layout.tsx`, set the metadata title to `Alice May Logbook`, add
`viewportFit` handling by adding to the `<body>` className `bg-slate-50 text-slate-900`, and export:

```ts
export const viewport = {
  themeColor: '#0f172a',
  width: 'device-width',
  initialScale: 1,
}
```

- [ ] **Step 6: Verify the empty state renders**

Run: `npm run dev`, sign in, visit `http://localhost:3000/trips`.
Expected: header, "No trips logged yet.", and a "Log a trip" button (you are `owner`).

**If instead you see a "Failed to load trips" error mentioning permissions, the Data API grants from Task 2 did not apply.** Re-check them before continuing.

- [ ] **Step 7: Insert a trip directly and confirm it appears**

Use MCP `execute_sql`:

```sql
insert into public.trips (boat_id, trip_date, departure_time, return_time,
                          engine_hours_start, engine_hours_end,
                          fuel_level_start_gal, fuel_added_gal, fuel_level_end_gal,
                          distance_nm, notes, created_by)
select b.id, '2026-07-20', '08:15', '14:30', 412.3, 418.1, 48, 20, 31, 24.5,
       'Shakedown run out past the breakwater.', m.user_id
  from public.boats b
  join public.boat_members m on m.boat_id = b.id
 where b.name = 'Alice May' limit 1;
```

Reload `/trips`.
Expected: one card reading "Mon, Jul 20", "8:15 AM – 2:30 PM", "5.8 hrs  37 gal  24.5 nm", and the note.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add trip list with server-rendered queries"
```

---

## Task 7: Trip form and create action

**Files:**
- Create: `components/field.tsx`, `components/trip-form.tsx`, `lib/trips/actions.ts`, `app/trips/new/page.tsx`
- Modify: `lib/trips/queries.ts` (add `listCrew`)

**Interfaces:**
- Consumes: `parseTripForm`, `TripInput` from `lib/trips/schema`; `hoursRun`, `fuelUsed` from `lib/derive`; `getMembership`, `canEdit` from `lib/auth`
- Produces:
  - `listCrew(boatId: string): Promise<{ id: string; name: string }[]>` in `lib/trips/queries.ts`
  - `createTrip(prevState: TripFormState, formData: FormData): Promise<TripFormState>` in `lib/trips/actions.ts`
  - `type TripFormState = { errors: Record<string, string> }`
  - `<TripForm action={...} crew={...} initial={...} />` in `components/trip-form.tsx` — `initial` is `Partial<TripInput> & { id?: string }` or `undefined` for a new trip

- [ ] **Step 1: Add the crew query**

Append to `lib/trips/queries.ts`:

```ts
export async function listCrew(
  boatId: string,
): Promise<{ id: string; name: string }[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('crew')
    .select('id, name')
    .eq('boat_id', boatId)
    .order('name')

  if (error) throw new Error(`Failed to load crew: ${error.message}`)
  return data ?? []
}
```

- [ ] **Step 2: Write the field primitives**

Create `components/field.tsx`:

```tsx
'use client'

import type { ReactNode } from 'react'

export function Section({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <section className="mt-6">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
        {title}
      </h2>
      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        {children}
      </div>
    </section>
  )
}

export function Field({
  label,
  name,
  type = 'text',
  defaultValue,
  error,
  numeric = false,
  onChange,
}: {
  label: string
  name: string
  type?: string
  defaultValue?: string | number | null
  error?: string
  numeric?: boolean
  onChange?: (value: string) => void
}) {
  return (
    <label className="block">
      <span className="text-sm text-slate-600">{label}</span>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue ?? ''}
        inputMode={numeric ? 'decimal' : undefined}
        step={numeric ? 'any' : undefined}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-base"
      />
      {error && <span className="mt-1 block text-sm text-red-600">{error}</span>}
    </label>
  )
}

export function Derived({ label, value }: { label: string; value: string }) {
  return (
    <p className="text-sm text-slate-500">
      {label}: <span className="font-medium text-slate-700">{value}</span>
    </p>
  )
}
```

- [ ] **Step 3: Write the form component**

Create `components/trip-form.tsx`:

```tsx
'use client'

import { useActionState, useState } from 'react'
import { Derived, Field, Section } from '@/components/field'
import { fuelUsed, hoursRun } from '@/lib/derive'
import type { TripFormState } from '@/lib/trips/actions'

type Crew = { id: string; name: string }

export type TripFormInitial = {
  id?: string
  trip_date?: string
  departure_time?: string | null
  return_time?: string | null
  engine_hours_start?: number | null
  engine_hours_end?: number | null
  fuel_level_start_gal?: number | null
  fuel_added_gal?: number | null
  fuel_level_end_gal?: number | null
  distance_nm?: number | null
  start_lat?: number | null
  start_lng?: number | null
  end_lat?: number | null
  end_lng?: number | null
  notes?: string | null
  passenger_ids?: string[]
}

const num = (v: string): number | null => {
  if (v.trim() === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export function TripForm({
  action,
  crew,
  initial,
}: {
  action: (state: TripFormState, formData: FormData) => Promise<TripFormState>
  crew: Crew[]
  initial?: TripFormInitial
}) {
  const [state, formAction, pending] = useActionState(action, { errors: {} })

  const [hStart, setHStart] = useState(String(initial?.engine_hours_start ?? ''))
  const [hEnd, setHEnd] = useState(String(initial?.engine_hours_end ?? ''))
  const [fStart, setFStart] = useState(
    String(initial?.fuel_level_start_gal ?? ''),
  )
  const [fAdded, setFAdded] = useState(String(initial?.fuel_added_gal ?? ''))
  const [fEnd, setFEnd] = useState(String(initial?.fuel_level_end_gal ?? ''))

  const [start, setStart] = useState({
    lat: initial?.start_lat ?? null,
    lng: initial?.start_lng ?? null,
  })
  const [end, setEnd] = useState({
    lat: initial?.end_lat ?? null,
    lng: initial?.end_lng ?? null,
  })

  const [selected, setSelected] = useState<string[]>(
    initial?.passenger_ids ?? [],
  )

  const runHours = hoursRun(num(hStart), num(hEnd))
  const usedFuel = fuelUsed(num(fStart), num(fAdded), num(fEnd))

  function capture(which: 'start' | 'end') {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition((pos) => {
      const point = {
        lat: Number(pos.coords.latitude.toFixed(5)),
        lng: Number(pos.coords.longitude.toFixed(5)),
      }
      if (which === 'start') setStart(point)
      else setEnd(point)
    })
  }

  const today = new Date()
  const defaultDate =
    initial?.trip_date ??
    `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
      today.getDate(),
    ).padStart(2, '0')}`

  return (
    <form action={formAction} className="pb-28">
      {initial?.id && <input type="hidden" name="id" value={initial.id} />}

      <Section title="When">
        <Field
          label="Date"
          name="trip_date"
          type="date"
          defaultValue={defaultDate}
          error={state.errors.trip_date}
        />
        <Field
          label="Departed"
          name="departure_time"
          type="time"
          defaultValue={initial?.departure_time ?? ''}
          error={state.errors.departure_time}
        />
        <Field
          label="Returned"
          name="return_time"
          type="time"
          defaultValue={initial?.return_time ?? ''}
          error={state.errors.return_time}
        />
      </Section>

      <Section title="Engine">
        <Field
          label="Hours at departure"
          name="engine_hours_start"
          numeric
          defaultValue={initial?.engine_hours_start ?? ''}
          onChange={setHStart}
          error={state.errors.engine_hours_start}
        />
        <Field
          label="Hours at return"
          name="engine_hours_end"
          numeric
          defaultValue={initial?.engine_hours_end ?? ''}
          onChange={setHEnd}
          error={state.errors.engine_hours_end}
        />
        {runHours !== null && <Derived label="Run" value={`${runHours} hrs`} />}
      </Section>

      <Section title="Fuel">
        <Field
          label="Level at departure (gal)"
          name="fuel_level_start_gal"
          numeric
          defaultValue={initial?.fuel_level_start_gal ?? ''}
          onChange={setFStart}
          error={state.errors.fuel_level_start_gal}
        />
        <Field
          label="Added (gal)"
          name="fuel_added_gal"
          numeric
          defaultValue={initial?.fuel_added_gal ?? ''}
          onChange={setFAdded}
          error={state.errors.fuel_added_gal}
        />
        <Field
          label="Level at return (gal)"
          name="fuel_level_end_gal"
          numeric
          defaultValue={initial?.fuel_level_end_gal ?? ''}
          onChange={setFEnd}
          error={state.errors.fuel_level_end_gal}
        />
        {usedFuel !== null && <Derived label="Used" value={`${usedFuel} gal`} />}
      </Section>

      <Section title="Trip">
        <Field
          label="Distance (nm)"
          name="distance_nm"
          numeric
          defaultValue={initial?.distance_nm ?? ''}
          error={state.errors.distance_nm}
        />

        <input type="hidden" name="start_lat" value={start.lat ?? ''} />
        <input type="hidden" name="start_lng" value={start.lng ?? ''} />
        <input type="hidden" name="end_lat" value={end.lat ?? ''} />
        <input type="hidden" name="end_lng" value={end.lng ?? ''} />

        {(['start', 'end'] as const).map((which) => {
          const point = which === 'start' ? start : end
          return (
            <button
              key={which}
              type="button"
              onClick={() => capture(which)}
              className="w-full rounded-lg border border-slate-300 px-3 py-3 text-left text-sm"
            >
              {point.lat !== null
                ? `${which === 'start' ? 'Start' : 'End'}: ${point.lat}, ${point.lng}`
                : `Use current location for ${which}`}
            </button>
          )
        })}
      </Section>

      {crew.length > 0 && (
        <Section title="Aboard">
          <div className="flex flex-wrap gap-2">
            {crew.map((c) => {
              const on = selected.includes(c.id)
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() =>
                    setSelected((prev) =>
                      on ? prev.filter((id) => id !== c.id) : [...prev, c.id],
                    )
                  }
                  className={`rounded-full px-4 py-2 text-sm ${
                    on
                      ? 'bg-slate-900 text-white'
                      : 'border border-slate-300 text-slate-700'
                  }`}
                >
                  {c.name}
                </button>
              )
            })}
          </div>
          {selected.map((id) => (
            <input key={id} type="hidden" name="passenger_ids" value={id} />
          ))}
        </Section>
      )}

      <Section title="Notes">
        <textarea
          name="notes"
          rows={4}
          defaultValue={initial?.notes ?? ''}
          className="w-full rounded-lg border border-slate-300 px-3 py-3 text-base"
        />
      </Section>

      {state.errors.form && (
        <p className="mt-4 text-sm text-red-600">{state.errors.form}</p>
      )}

      <div className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white p-4">
        <button
          type="submit"
          disabled={pending}
          className="mx-auto block w-full max-w-md rounded-full bg-slate-900 py-4 text-base font-medium text-white disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save trip'}
        </button>
      </div>
    </form>
  )
}
```

- [ ] **Step 4: Write the create action**

Create `lib/trips/actions.ts`:

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { canEdit, getMembership } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { parseTripForm } from '@/lib/trips/schema'

export type TripFormState = { errors: Record<string, string> }

export async function createTrip(
  _prev: TripFormState,
  formData: FormData,
): Promise<TripFormState> {
  const membership = await getMembership()
  if (!membership || !canEdit(membership.role)) {
    return { errors: { form: 'You do not have permission to log trips.' } }
  }

  const parsed = parseTripForm(formData)
  if (!parsed.ok) return { errors: parsed.errors }

  const { passenger_ids, ...trip } = parsed.data
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('trips')
    .insert({ ...trip, boat_id: membership.boatId })
    .select('id')
    .single()

  if (error) return { errors: { form: `Could not save the trip: ${error.message}` } }

  if (passenger_ids.length > 0) {
    const { error: paxError } = await supabase
      .from('trip_passengers')
      .insert(passenger_ids.map((crew_id) => ({ trip_id: data.id, crew_id })))

    if (paxError) {
      return { errors: { form: `Trip saved, but crew were not: ${paxError.message}` } }
    }
  }

  revalidatePath('/trips')
  redirect(`/trips/${data.id}`)
}
```

`redirect` throws internally, so no value is returned after it — that is expected in a Server Action.

- [ ] **Step 5: Write the new-trip page**

Create `app/trips/new/page.tsx`:

```tsx
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { TripForm } from '@/components/trip-form'
import { canEdit, getMembership } from '@/lib/auth'
import { createTrip } from '@/lib/trips/actions'
import { listCrew } from '@/lib/trips/queries'

export default async function NewTripPage() {
  const membership = await getMembership()
  if (!membership) redirect('/no-access')
  if (!canEdit(membership.role)) redirect('/trips')

  const crew = await listCrew(membership.boatId)

  return (
    <main className="mx-auto max-w-2xl px-4 pt-6">
      <header className="flex items-center gap-3">
        <Link href="/trips" className="text-sm text-slate-500">
          ← Back
        </Link>
        <h1 className="text-lg font-semibold">Log a trip</h1>
      </header>
      <TripForm action={createTrip} crew={crew} />
    </main>
  )
}
```

- [ ] **Step 6: Verify a trip can be created**

Run: `npm run dev`, sign in, tap "Log a trip".
Enter date `2026-07-24`, departure `09:00`, hours `100` and `103.5`, fuel `40` / `0` / `28`.
Expected: "Run: 3.5 hrs" and "Used: 12 gal" appear live as you type; saving redirects to a detail URL (which 404s until Task 8) and the trip appears on `/trips`.

- [ ] **Step 7: Verify validation surfaces**

Enter hours at return lower than hours at departure and save.
Expected: the form returns with "Engine hours at return must be at least the hours at departure" under that field, and nothing is written.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add mobile trip entry form with live derived values"
```

---

## Task 8: Trip detail and edit

**Files:**
- Create: `app/trips/[id]/page.tsx`, `app/trips/[id]/edit/page.tsx`
- Modify: `lib/trips/queries.ts` (add `getTrip`), `lib/trips/actions.ts` (add `updateTrip`)

**Interfaces:**
- Consumes: everything from Tasks 6 and 7
- Produces:
  - `getTrip(id: string): Promise<TripDetail | null>` where `TripDetail` includes every trip column plus `passengers: { id, name, emergency_contact_name, emergency_contact_phone }[]`
  - `updateTrip(prevState: TripFormState, formData: FormData): Promise<TripFormState>`

- [ ] **Step 1: Add the detail query**

Append to `lib/trips/queries.ts`:

```ts
export type TripDetail = {
  id: string
  trip_date: string
  departure_time: string | null
  return_time: string | null
  engine_hours_start: number | null
  engine_hours_end: number | null
  hours_run: number | null
  fuel_level_start_gal: number | null
  fuel_added_gal: number | null
  fuel_level_end_gal: number | null
  fuel_used_gal: number | null
  distance_nm: number | null
  start_lat: number | null
  start_lng: number | null
  end_lat: number | null
  end_lng: number | null
  notes: string | null
  passengers: {
    id: string
    name: string
    emergency_contact_name: string | null
    emergency_contact_phone: string | null
  }[]
}

export async function getTrip(id: string): Promise<TripDetail | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('trips')
    .select(
      `id, trip_date, departure_time, return_time,
       engine_hours_start, engine_hours_end, hours_run,
       fuel_level_start_gal, fuel_added_gal, fuel_level_end_gal, fuel_used_gal,
       distance_nm, start_lat, start_lng, end_lat, end_lng, notes,
       trip_passengers ( crew ( id, name, emergency_contact_name, emergency_contact_phone ) )`,
    )
    .eq('id', id)
    .maybeSingle()

  if (error) throw new Error(`Failed to load trip: ${error.message}`)
  if (!data) return null

  const { trip_passengers, ...trip } = data as never as TripDetail & {
    trip_passengers: { crew: TripDetail['passengers'][number] | null }[]
  }

  return {
    ...trip,
    passengers: (trip_passengers ?? [])
      .map((p) => p.crew)
      .filter((c): c is TripDetail['passengers'][number] => c !== null),
  }
}
```

- [ ] **Step 2: Write the detail page**

Create `app/trips/[id]/page.tsx`:

```tsx
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { canEdit, getMembership } from '@/lib/auth'
import { formatCoord, formatNumber, formatTime, formatTripDate } from '@/lib/format'
import { getTrip } from '@/lib/trips/queries'

function Row({ label, value }: { label: string; value: string | null }) {
  if (!value) return null
  return (
    <div className="flex justify-between border-b border-slate-100 py-2 text-sm last:border-0">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}

export default async function TripDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const membership = await getMembership()
  if (!membership) redirect('/no-access')

  const trip = await getTrip(id)
  if (!trip) notFound()

  return (
    <main className="mx-auto max-w-2xl px-4 pb-16 pt-6">
      <header className="flex items-center justify-between gap-3">
        <Link href="/trips" className="text-sm text-slate-500">
          ← Trips
        </Link>
        {canEdit(membership.role) && (
          <Link href={`/trips/${trip.id}/edit`} className="text-sm underline">
            Edit
          </Link>
        )}
      </header>

      <h1 className="mt-3 text-xl font-semibold">
        {formatTripDate(trip.trip_date)}
      </h1>

      <div className="mt-4 rounded-xl border border-slate-200 bg-white px-4">
        <Row label="Departed" value={formatTime(trip.departure_time)} />
        <Row label="Returned" value={formatTime(trip.return_time)} />
        <Row label="Engine hours out" value={formatNumber(trip.engine_hours_start, '')} />
        <Row label="Engine hours in" value={formatNumber(trip.engine_hours_end, '')} />
        <Row label="Hours run" value={formatNumber(trip.hours_run, 'hrs')} />
        <Row label="Fuel at departure" value={formatNumber(trip.fuel_level_start_gal, 'gal')} />
        <Row label="Fuel added" value={formatNumber(trip.fuel_added_gal, 'gal')} />
        <Row label="Fuel at return" value={formatNumber(trip.fuel_level_end_gal, 'gal')} />
        <Row label="Fuel used" value={formatNumber(trip.fuel_used_gal, 'gal')} />
        <Row label="Distance" value={formatNumber(trip.distance_nm, 'nm')} />
        <Row label="Start position" value={formatCoord(trip.start_lat, trip.start_lng)} />
        <Row label="End position" value={formatCoord(trip.end_lat, trip.end_lng)} />
      </div>

      {trip.passengers.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Aboard
          </h2>
          <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
            {trip.passengers.map((p) => (
              <div key={p.id} className="text-sm">
                <span className="font-medium">{p.name}</span>
                {p.emergency_contact_name && (
                  <span className="text-slate-500">
                    {' '}
                    — {p.emergency_contact_name}
                    {p.emergency_contact_phone
                      ? ` · ${p.emergency_contact_phone}`
                      : ''}
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {trip.notes && (
        <section className="mt-6">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Notes
          </h2>
          <p className="whitespace-pre-wrap rounded-xl border border-slate-200 bg-white p-4 text-sm">
            {trip.notes}
          </p>
        </section>
      )}

      {/* Phase 2 mounts the sea and tide conditions card here. */}
    </main>
  )
}
```

- [ ] **Step 3: Add the update action**

Append to `lib/trips/actions.ts`:

```ts
export async function updateTrip(
  _prev: TripFormState,
  formData: FormData,
): Promise<TripFormState> {
  const membership = await getMembership()
  if (!membership || !canEdit(membership.role)) {
    return { errors: { form: 'You do not have permission to edit trips.' } }
  }

  const id = String(formData.get('id') ?? '')
  if (!id) return { errors: { form: 'Missing trip id.' } }

  const parsed = parseTripForm(formData)
  if (!parsed.ok) return { errors: parsed.errors }

  const { passenger_ids, ...trip } = parsed.data
  const supabase = await createClient()

  const { error } = await supabase.from('trips').update(trip).eq('id', id)
  if (error) return { errors: { form: `Could not save the trip: ${error.message}` } }

  // Replace the passenger set wholesale — simpler and safe, the set is tiny.
  const { error: clearError } = await supabase
    .from('trip_passengers')
    .delete()
    .eq('trip_id', id)
  if (clearError) {
    return { errors: { form: `Could not update crew: ${clearError.message}` } }
  }

  if (passenger_ids.length > 0) {
    const { error: paxError } = await supabase
      .from('trip_passengers')
      .insert(passenger_ids.map((crew_id) => ({ trip_id: id, crew_id })))
    if (paxError) {
      return { errors: { form: `Could not update crew: ${paxError.message}` } }
    }
  }

  revalidatePath('/trips')
  revalidatePath(`/trips/${id}`)
  redirect(`/trips/${id}`)
}
```

- [ ] **Step 4: Write the edit page**

Create `app/trips/[id]/edit/page.tsx`:

```tsx
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { TripForm } from '@/components/trip-form'
import { canEdit, getMembership } from '@/lib/auth'
import { updateTrip } from '@/lib/trips/actions'
import { getTrip, listCrew } from '@/lib/trips/queries'

export default async function EditTripPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const membership = await getMembership()
  if (!membership) redirect('/no-access')
  if (!canEdit(membership.role)) redirect(`/trips/${id}`)

  const [trip, crew] = await Promise.all([
    getTrip(id),
    listCrew(membership.boatId),
  ])
  if (!trip) notFound()

  return (
    <main className="mx-auto max-w-2xl px-4 pt-6">
      <header className="flex items-center gap-3">
        <Link href={`/trips/${id}`} className="text-sm text-slate-500">
          ← Cancel
        </Link>
        <h1 className="text-lg font-semibold">Edit trip</h1>
      </header>
      <TripForm
        action={updateTrip}
        crew={crew}
        initial={{
          id: trip.id,
          trip_date: trip.trip_date,
          departure_time: trip.departure_time?.slice(0, 5) ?? null,
          return_time: trip.return_time?.slice(0, 5) ?? null,
          engine_hours_start: trip.engine_hours_start,
          engine_hours_end: trip.engine_hours_end,
          fuel_level_start_gal: trip.fuel_level_start_gal,
          fuel_added_gal: trip.fuel_added_gal,
          fuel_level_end_gal: trip.fuel_level_end_gal,
          distance_nm: trip.distance_nm,
          start_lat: trip.start_lat,
          start_lng: trip.start_lng,
          end_lat: trip.end_lat,
          end_lng: trip.end_lng,
          notes: trip.notes,
          passenger_ids: trip.passengers.map((p) => p.id),
        }}
      />
    </main>
  )
}
```

Postgres returns `time` as `HH:MM:SS`; the `<input type="time">` needs `HH:MM`, hence the `slice(0, 5)`.

- [ ] **Step 5: Seed crew so the chips can be exercised**

Use MCP `execute_sql`:

```sql
insert into public.crew (boat_id, name, emergency_contact_name, emergency_contact_phone)
select id, 'Sam', 'Shore contact', '555-0100' from public.boats where name = 'Alice May';
```

- [ ] **Step 6: Verify the round trip**

Run: `npm run dev`. Open a trip, tap Edit, change the note, toggle the Sam chip on, save.
Expected: back on detail with the new note and "Sam" under Aboard. Edit again — the date, times, numbers and the Sam chip are all pre-filled.

- [ ] **Step 7: Verify a bad edit is rejected**

In edit, set hours at return below hours at departure and save.
Expected: the field error appears and the stored trip is unchanged.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add trip detail and edit"
```

---

## Task 9: RLS assertions, advisors, deploy

**Files:**
- Create: `supabase/tests/rls.sql`

**Interfaces:**
- Consumes: the schema from Task 2
- Produces: a repeatable proof that the role model holds; a deployed application

- [ ] **Step 1: Write the RLS assertion script**

Create `supabase/tests/rls.sql`. It runs entirely inside a transaction that is rolled back, so it leaves no residue and can be run against the live project.

```sql
-- RLS assertions for Alice May Logbook.
-- Run inside a transaction and roll back; creates and discards test users.
begin;

do $$
declare
  v_boat   uuid;
  v_crewid uuid;
  v_trip   uuid;
  u_owner  uuid := '00000000-0000-4000-8000-00000000c001';
  u_crew   uuid := '00000000-0000-4000-8000-00000000c002';
  u_viewer uuid := '00000000-0000-4000-8000-00000000c003';
  u_out    uuid := '00000000-0000-4000-8000-00000000c004';
  n int;
begin
  select id into v_boat from public.boats where name = 'Alice May';

  -- Test users. instance_id and aud match Supabase defaults.
  insert into auth.users (id, instance_id, aud, role, email)
  values
    (u_owner,  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rlstest-owner@example.com'),
    (u_crew,   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rlstest-crew@example.com'),
    (u_viewer, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rlstest-viewer@example.com'),
    (u_out,    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rlstest-outsider@example.com');

  insert into public.boat_members (boat_id, user_id, role) values
    (v_boat, u_owner,  'owner'),
    (v_boat, u_crew,   'crew'),
    (v_boat, u_viewer, 'viewer')
  on conflict do nothing;

  insert into public.crew (boat_id, name) values (v_boat, 'RLS Test Crew')
    returning id into v_crewid;
  insert into public.trips (boat_id, trip_date, created_by)
    values (v_boat, '2026-01-01', u_owner) returning id into v_trip;

  -- ---------------------------------------------------------- viewer reads
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', u_viewer, 'role', 'authenticated')::text, true);

  select count(*) into n from public.trips where id = v_trip;
  if n <> 1 then raise exception 'FAIL: viewer cannot read trips'; end if;

  -- ------------------------------------------------- viewer cannot write
  begin
    insert into public.trips (boat_id, trip_date) values (v_boat, '2026-01-02');
    raise exception 'FAIL: viewer was able to insert a trip';
  exception when insufficient_privilege then
    null; -- 42501, expected
  end;

  begin
    update public.trips set notes = 'nope' where id = v_trip;
    if found then raise exception 'FAIL: viewer was able to update a trip'; end if;
  exception when insufficient_privilege then
    null;
  end;

  -- ------------------------------------------------------- crew can write
  perform set_config('request.jwt.claims',
    json_build_object('sub', u_crew, 'role', 'authenticated')::text, true);

  update public.trips set notes = 'crew edit' where id = v_trip;
  select count(*) into n from public.trips where id = v_trip and notes = 'crew edit';
  if n <> 1 then raise exception 'FAIL: crew cannot update a trip'; end if;

  insert into public.trip_passengers (trip_id, crew_id) values (v_trip, v_crewid);

  -- --------------------------------------------- outsider sees nothing
  perform set_config('request.jwt.claims',
    json_build_object('sub', u_out, 'role', 'authenticated')::text, true);

  select count(*) into n from public.trips;
  if n <> 0 then raise exception 'FAIL: non-member can read trips'; end if;

  select count(*) into n from public.crew;
  if n <> 0 then raise exception 'FAIL: non-member can read crew'; end if;

  select count(*) into n from public.boats;
  if n <> 0 then raise exception 'FAIL: non-member can read boats'; end if;

  begin
    insert into public.trips (boat_id, trip_date) values (v_boat, '2026-01-03');
    raise exception 'FAIL: non-member was able to insert a trip';
  exception when insufficient_privilege then
    null;
  end;

  -- ------------------------------------ nobody may grant themselves access
  perform set_config('request.jwt.claims',
    json_build_object('sub', u_crew, 'role', 'authenticated')::text, true);
  begin
    insert into public.boat_members (boat_id, user_id, role)
      values (v_boat, u_out, 'crew');
    raise exception 'FAIL: crew member was able to add a boat member';
  exception when insufficient_privilege then
    null;
  end;

  -- ------------------------------------ viewer cannot read the allowlist
  perform set_config('request.jwt.claims',
    json_build_object('sub', u_viewer, 'role', 'authenticated')::text, true);
  select count(*) into n from public.allowed_emails;
  if n <> 0 then raise exception 'FAIL: viewer can read allowed_emails'; end if;

  reset role;
  raise notice 'ALL RLS ASSERTIONS PASSED';
end $$;

rollback;
```

- [ ] **Step 2: Run the assertions**

Use MCP `execute_sql` with the full script.
Expected: notice `ALL RLS ASSERTIONS PASSED` and no exception.

**If the failure is in the `insert into auth.users` statement** — a not-null column this script does not populate — that is a fixture problem, not a policy bug. `auth.users` is Supabase-managed and its columns change between releases. Inspect the actual shape first:

```sql
select column_name, is_nullable, column_default
  from information_schema.columns
 where table_schema = 'auth' and table_name = 'users' and is_nullable = 'NO';
```

Add whatever additional columns it requires to the fixture and re-run.

**Any `FAIL:` exception is a real policy bug.** Fix `0001_phase1_schema.sql`, re-apply, and re-run. Never weaken an assertion to make it pass — the viewer-cannot-insert case in particular is the whole reason this file exists.

- [ ] **Step 3: Confirm the rollback left nothing behind**

Use MCP `execute_sql`:

```sql
select count(*) as leftover from auth.users where email like 'rlstest-%';
```

Expected: `0`.

- [ ] **Step 4: Run both advisor sets**

Use MCP `get_advisors` with `type: "security"`, then `type: "performance"`.
Expected: no security findings. Address any performance findings that concern missing indexes on the foreign keys defined in Task 2.

- [ ] **Step 5: Run the full test suite and a production build**

```bash
npm test
npm run build
```

Expected: all Vitest tests pass; the build completes with no type errors.

- [ ] **Step 6: Commit**

```bash
git add supabase/tests/rls.sql
git commit -m "test: add RLS assertions proving the owner/crew/viewer boundary"
```

- [ ] **Step 7: Push and deploy**

Ask the user to create the GitHub repository and connect it to Vercel, or do it with `gh` if they prefer. Set these environment variables in the Vercel project, taking values from `.env.local`:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

- [ ] **Step 8: Add the production URL to Supabase**

**Manual dashboard step.** At
`https://supabase.com/dashboard/project/fyvvyjsninswdxnzwpdg/auth/url-configuration`
add the Vercel production domain to the redirect allowlist, and set Site URL to it.

Magic-link sign-in on the deployed app fails until this is done.

- [ ] **Step 9: Verify on a phone**

On the actual phone, sign in by magic link, log a trip at a real dock or from the driveway, confirm the geolocation button fills in coordinates and the numeric keypad appears for the hours and fuel fields.

- [ ] **Step 10: Verify the viewer role for real**

Add a second email as a viewer:

```sql
insert into public.allowed_emails (email, boat_id, role)
select 'some-other-address@example.com', id, 'viewer'
  from public.boats where name = 'Alice May';
```

Sign in as that user in a private window.
Expected: the trip list renders, but there is no "Log a trip" button and no Edit link. Visiting `/trips/new` directly redirects to `/trips`.

- [ ] **Step 11: Run the code review**

Run `/code-review` per spec §8 before Phase 2 begins.

---

## Post-Phase Notes

Carry into Phase 2:

- `conditions_snapshot` and `route_points` columns already exist — Phase 2 needs no migration.
- The conditions card mounts at the marked comment in `app/trips/[id]/page.tsx`.
- `createTrip` and `updateTrip` in `lib/trips/actions.ts` are where the Open-Meteo and NOAA calls belong; they already run server-side with the trip's date and coordinates in hand.
- `fuel_capacity_gal` is still `NULL` and must be set before the Phase 4 fuel dashboard means anything.
