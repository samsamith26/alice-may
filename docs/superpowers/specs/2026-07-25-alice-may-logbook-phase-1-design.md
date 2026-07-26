# Alice May Logbook — Phase 1 Design

**Date:** 2026-07-25
**Phase:** 1 of 6 (see `alice-may-logbook-spec.md` §6)
**Supabase project:** `alice-may` / `fyvvyjsninswdxnzwpdg` (ca-central-1, Postgres 17.6) — currently empty

---

## 1. Scope

**In scope**

- Next.js App Router + TypeScript + Tailwind scaffold
- Supabase schema migration: `boats`, `boat_members`, `allowed_emails`, `crew`, `trips`, `trip_passengers`
- RLS enabled on every table, with a three-tier role model
- Magic-link auth via `@supabase/ssr` (browser client, server client, middleware session refresh)
- Trip entry form, trip list, trip detail — mobile-first
- Vitest tests over validation and derived-value logic; SQL tests proving RLS holds
- Deployed to Vercel

**Explicitly out of scope this phase** (later phases per spec §6)

Weather/tide auto-fetch (Phase 2) · maintenance tracker (3) · fuel and cost dashboards, lifetime stats (4) · map and points of interest (5) · float plan, document vault, photo upload, PWA manifest, dark mode (6) · crew CRUD screens · boat editing UI.

---

## 2. Decisions made during brainstorming

| Decision | Choice | Why |
|---|---|---|
| Access control | `boat_members` join table, RLS keyed on membership | Survives adding a second boat; revoking someone is one row; access control lives in the schema rather than the dashboard |
| Roles | `owner` / `crew` / `viewer` | Family who want to follow along get the full history and later the dashboards, but cannot alter the log |
| Trip entry flow | Single form, everything optional but `trip_date`, editable later | No in-progress state to manage; a half-filled trip saved at the dock is just a trip you finish editing later |
| Form layout | Sectioned single scroll | Nothing hidden behind disclosures when logging in a hurry; live derived values let the numbers be sanity-checked before saving |
| Data access | Server Components read, Server Actions write | Minimal client JS on marginal harbour LTE; Phase 2's weather fetch drops into the same server action with the service-role key never leaving the server |
| Testing | Vitest on pure logic + SQL RLS assertions | The RLS boundary is the one bug class that clicking around cannot reveal |

---

## 3. Data model

Deviations from spec §2 are called out inline; everything else follows it.

```sql
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

-- NOT IN SPEC. Required by the access model: maps auth users to a boat with a role.
create table public.boat_members (
  boat_id    uuid not null references public.boats(id) on delete cascade,
  user_id    uuid not null references auth.users(id)   on delete cascade,
  role       text not null default 'viewer'
             check (role in ('owner','crew','viewer')),
  created_at timestamptz not null default now(),
  primary key (boat_id, user_id)
);

-- NOT IN SPEC. Control surface for granting access before a person has an auth user.
create table public.allowed_emails (
  email      text not null check (email = lower(email)),
  boat_id    uuid not null references public.boats(id) on delete cascade,
  role       text not null default 'viewer'
             check (role in ('owner','crew','viewer')),
  created_at timestamptz not null default now(),
  primary key (email, boat_id)
);

-- DEVIATION: spec has no boat_id. RLS needs something to scope the roster against,
-- otherwise it is either world-readable to any signed-in user or requires a join
-- through trips to answer "may this person read this crew row?".
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
  route_points         jsonb,          -- unused until Phase 5
  notes                text,
  conditions_snapshot  jsonb,          -- unused until Phase 2
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
```

**Indexes**

```sql
create index on public.trips (boat_id, trip_date desc);
create index on public.trips (created_by);
create index on public.crew (boat_id);
create index on public.trip_passengers (crew_id);   -- PK already covers trip_id
create index on public.boat_members (user_id);
```

### Notes on the model

- **Every trip field except `trip_date` is nullable**, per the save-anytime flow. The generated columns evaluate to `NULL` when their inputs are missing, which is correct: a trip with only a start reading reports no hours-run rather than a misleading zero.
- **No constraint on `return_time` vs `departure_time`** — an overnight run would violate it.
- **`route_points` and `conditions_snapshot` are created now** though nothing writes them until Phases 5 and 2. They cost nothing and make Phase 2 a pure code change.
- **`created_by` is attribution, not authorisation.** Any crew member may edit any trip; this is a shared logbook, not a set of private journals.
- **`updated_at`** is maintained by a `before update` trigger.
- **Times are stored as local wall-clock `time` values with a `date`**, matching the spec. Phase 2 will combine them at `America/Los_Angeles` when calling the weather APIs.

---

## 4. Row-level security

RLS is enabled on all six tables. There is no permissive fallback policy anywhere.

```sql
create function public.is_boat_member(b uuid) returns boolean
  language sql security definer stable set search_path = ''
as $$ select exists (
  select 1 from public.boat_members m
  where m.boat_id = b and m.user_id = (select auth.uid())
) $$;

create function public.can_edit_boat(b uuid) returns boolean
  language sql security definer stable set search_path = ''
as $$ select exists (
  select 1 from public.boat_members m
  where m.boat_id = b and m.user_id = (select auth.uid())
    and m.role in ('owner','crew')
) $$;
```

`security definer` is load-bearing — without it, a policy on `boat_members` that queries `boat_members` recurses. `(select auth.uid())` rather than bare `auth.uid()` is evaluated once per query instead of once per row.

| Table | SELECT | INSERT / UPDATE / DELETE |
|---|---|---|
| `boats` | `is_boat_member(id)` | none (managed by migration / service role) |
| `crew` | `is_boat_member(boat_id)` | `can_edit_boat(boat_id)` |
| `trips` | `is_boat_member(boat_id)` | `can_edit_boat(boat_id)` |
| `trip_passengers` | parent trip's boat passes `is_boat_member` | parent trip's boat passes `can_edit_boat` |
| `boat_members` | `is_boat_member(boat_id)` | none — service role only |
| `allowed_emails` | requester is an `owner` of that boat | none — service role only |

Granting no write policy on `boat_members` means a crew member cannot quietly add their friend, and cannot promote themselves.

**A user with no membership row is not blocked at the door.** They authenticate successfully and then see an application containing nothing they can read or write. Phase 1 gives them `/no-access` rather than a broken-looking empty list.

---

## 5. Access provisioning

`auth.users` rows do not exist until first sign-in, so a migration cannot seed `boat_members` directly. Two triggers close that gap and make `allowed_emails` the single place access is managed.

```sql
-- On signup: if the email is on the list, grant the membership it specifies.
create function public.handle_new_user() returns trigger
  language plpgsql security definer set search_path = ''
as $$
declare a record;
begin
  select * into a from public.allowed_emails
   where email = lower(new.email);
  if found then
    insert into public.boat_members (boat_id, user_id, role)
    values (a.boat_id, new.id, a.role)
    on conflict (boat_id, user_id) do nothing;
  end if;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- On role change: propagate to anyone who has already signed up.
create function public.sync_member_role() returns trigger
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
  for each row execute function public.sync_member_role();
```

Without the second trigger, editing a role after someone has joined would silently do nothing — a confusing failure six months from now.

**To add someone:** insert their lowercased email into `allowed_emails` with a role. They magic-link in and are provisioned automatically. New signups default to `viewer` so that a forgotten role fails safe.

**To change someone's role:** update the `allowed_emails` row.

**To revoke:** delete the `boat_members` row (and the `allowed_emails` row so they cannot re-provision by signing up again).

---

## 6. Application architecture

Server Components read; Server Actions write.

```
app/
  layout.tsx
  page.tsx                  redirect → /trips
  login/page.tsx            magic-link request form
  auth/confirm/route.ts     token exchange → session cookie
  auth/signout/route.ts
  no-access/page.tsx
  trips/
    page.tsx                list
    new/page.tsx            form            (crew+ only)
    [id]/page.tsx           detail
    [id]/edit/page.tsx      form            (crew+ only)
components/
  trip-form.tsx             client — live math, chips, geolocation
  trip-card.tsx
  ...
lib/
  supabase/{client,server,middleware}.ts
  trips/{schema.ts, actions.ts, queries.ts}
  derive.ts                 pure hours/fuel math, shared by form and display
middleware.ts               session refresh + redirect unauthenticated → /login
```

- Reads happen in async server components through the `@supabase/ssr` server client.
- Writes go through Server Actions: zod validation → insert/update → `revalidatePath` → `redirect`.
- `trip-form.tsx` is the only substantial client component, shared between create and edit.
- `lib/derive.ts` holds the hours-run and fuel-used arithmetic in pure functions, so the form's live preview and the list/detail rendering agree with what Postgres computes. This is directly unit-tested.

### Auth flow

Magic link via `signInWithOtp`. The confirmation route uses `token_hash` + `verifyOtp` at `/auth/confirm`, which is Supabase's current documented pattern for `@supabase/ssr` and keeps the exchange server-side. This will be checked against live Supabase docs at implementation time before the route is written; if the guidance has moved to `code` + `exchangeCodeForSession`, that is a same-sized change to one route file and the email template step below drops away.

**Dashboard steps required, not achievable from code:**

1. Site URL and redirect allowlist must include `http://localhost:3000` and the Vercel production domain.
2. The magic-link email template must point at
   `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`.

Both are manual steps for you in the Supabase dashboard; I will call them out at the point they are needed rather than leaving sign-in mysteriously broken.

---

## 7. UI

Mobile-first throughout; desktop is a widened version of the same layout, not a separate design.

**`/trips` — list.** One card per trip, newest first, grouped under year headings. Each card shows date and times, plus whichever of hours-run, fuel-used and distance are actually present, a truncated note, and the names aboard. Cards rather than a table because this is a phone first. Viewers do not see the "New trip" button.

**`/trips/[id]` — detail.** Full figures, crew aboard with their emergency contacts, GPS points as plain coordinates. A placeholder region marks where the Phase 2 conditions card will land. Edit affordance shown to crew and owners only.

**`/trips/new` and `/trips/[id]/edit` — the form.** Sectioned single scroll: *when* → *engine* → *fuel* → *trip* → *aboard* → *notes*.

- Native `date` and `time` inputs, for the platform pickers
- `inputMode="decimal"` on every numeric field, so the keypad appears rather than the full keyboard
- Live hours-run and fuel-used rendered beneath their sections as values are entered
- Passenger selection as toggle chips against the crew roster
- A `navigator.geolocation` button per position pair
- Sticky save bar

Role enforcement in the UI is a courtesy, not the boundary — RLS is the boundary. Hiding the buttons only avoids offering a viewer an action that would fail.

---

## 8. Testing

**Vitest — pure logic.**

- `lib/derive.ts`: hours-run and fuel-used, including the null cases and the `fuel_added` coalesce, asserted to agree with the generated-column semantics
- zod trip schema: `trip_date` required; empty form strings coerced to `null` rather than `0` or `NaN`; negatives rejected; `engine_hours_end >= engine_hours_start`
- form-data parsing into the insert payload

**SQL — RLS assertions.** A script creating four test users (owner, crew, viewer, non-member) against the boat, then asserting for each: read allowed or denied, insert allowed or denied, update allowed or denied on `trips`, `crew`, and `trip_passengers`; plus that nobody can write `boat_members` or `allowed_emails`. Impersonation via `set local role authenticated` and `set local request.jwt.claims`. The whole script runs inside a transaction ending in `ROLLBACK`, so it can be executed against the remote project without leaving residue and without paying for a branch.

The specific assertion worth having: **a viewer's `insert` into `trips` fails with `42501`.**

---

## 9. Deployment

Vercel, connected to the Git repository. Environment variables per spec §7: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.

`.env.local` already exists in the working directory **and contains the service role key**. A `.gitignore` covering `.env*.local` must be in place before the first commit.

Migrations are applied through the Supabase MCP, and the SQL is also kept in `supabase/migrations/` in the repository so the schema is version-controlled rather than existing only in the remote project.

---

## 10. Open items

These block the migration and need answers before implementation:

1. **`fuel_capacity_gal` for Alice May** — asked three times during brainstorming, still unanswered. Sources disagree on the Merry Fisher 795's tank, so this will be seeded `NULL` and must be filled in before the Phase 4 fuel dashboard is meaningful. Nothing in Phase 1 depends on it.
2. **Allowlist seed** — which emails, at which roles. Default assumption absent an answer: seed `samuel.smith2204@gmail.com` as `owner` and nobody else; further emails added by SQL later.
3. **Crew roster seed** — names for the initial `crew` rows. Default assumption: seed none, add via SQL, since there is no crew CRUD screen this phase.

The boat row itself is seeded from spec §2: name "Alice May", make/model "Jeanneau Merry Fisher 795", year 2009, engine "Yamaha F200", home port "Monterey Harbor".

---

## 11. Definition of done

- Migration applied; `list_tables` shows all six tables with RLS enabled
- `get_advisors` reports no security findings
- Vitest suite passes
- RLS assertion script passes, including the viewer-cannot-insert case
- Magic-link sign-in works end to end on a phone
- A trip can be created, appears in the list, opens in detail, and can be edited
- A viewer sees the trip but no create or edit affordance
- Deployed to Vercel and reachable
- `/code-review` run before Phase 2 begins, per spec §8
