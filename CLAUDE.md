# Alice May Logbook

Personal boat logbook for a 2009 Jeanneau Merry Fisher 795 (Yamaha F200) moored in
Monterey Harbor. Solo/personal project — one owner, a handful of family members.

Full product spec: `alice-may-logbook-spec.md`.
Design: `docs/superpowers/specs/2026-07-26-alice-may-logbook-design.md`.

## How to work on this project

This is a solo project. Sam hired a developer, not a narrator.

**Execute approved plans fully and autonomously.** Once a plan is approved, build the
whole thing and show the finished result. This applies across subagent handoffs — a
subagent given a task from an approved plan executes it to completion and does not
come back for permission to continue.

Do not pause for:

- Implementation details — file layout, naming, component boundaries, library choice
  within an already-approved stack, error-handling strategy, test structure.
- Execution strategy — task ordering, whether to parallelise, when to commit, whether
  to refactor something you're already working in.
- Progress narration or "shall I continue?" checkpoints between tasks.

Routine engineering judgment calls are yours to make. Make them and move on.

**Interrupt only for genuine blockers** — things needing information only Sam has:

- Credentials, secrets, or account access.
- External account setup you cannot perform (Supabase dashboard settings, Vercel
  project connection, DNS).
- A real product-level tradeoff with no clear right answer. The calibration example:
  the crew/viewer access-tier split was worth asking about; which charting approach to
  use was not.

If you find yourself writing "should I…" about something you could just decide, decide.

## Stack

- Next.js 16 (App Router) + TypeScript strict + Tailwind v4, deployed on Vercel.
- Supabase (Postgres / Auth / Storage). All schema work goes through the Supabase MCP
  as migrations — never hand-applied SQL, never ad-hoc `execute_sql` for DDL.
- `@supabase/ssr` for auth. Not the deprecated `auth-helpers` package.
- Leaflet + OpenStreetMap + OpenSeaMap overlay for maps. No API keys, no map account.
- Vitest for pure-logic tests.

## Things that are easy to get wrong here

Verified against current docs — training data is stale on several of these:

- **Next.js 16 renamed `middleware.ts` to `proxy.ts`**, exporting `proxy()` rather than
  `middleware()`. Node runtime only; the edge runtime is not supported in `proxy`.
- **Use `supabase.auth.getClaims()` in the proxy**, not `getUser()`. Run nothing
  between `createServerClient` and that call — it causes random logouts.
- **Magic links use the PKCE flow** (`?code=` → `/auth/callback` →
  `exchangeCodeForSession`). The `token_hash` + `verifyOtp` pattern needs a customised
  email template, and this project is on the Supabase free plan where auth email
  templates cannot be customised.
- **New `public` tables are not auto-exposed to the Data API.** Every table needs an
  explicit `grant ... to authenticated` or queries fail with a permission error despite
  correct RLS policies.
- **Open-Meteo's `archive-api` lags by several days.** Trips within ~5 days must use
  `api.open-meteo.com/v1/forecast`, which serves past days too. Older trips use
  `archive-api`.
- **`sea_surface_temperature` returns °C even with `length_unit=imperial`.** Convert it
  explicitly.

## Conventions

- Mobile-first. The primary device is a phone at the helm, in sun, with wet hands.
- RLS enabled on every table. Read = boat member, write = crew. Enforced in the
  database, not just hidden in the UI.
- Never use the service-role key in a request path. It exists for seeding and admin
  scripts only.
- Conditions fetching must never fail a trip save. Write the trip, attach conditions
  after, record partial/failed status and offer a retry.
- Storage buckets are private. Serve files through signed URLs.
- Pure logic (derivation math, conditions parsing, maintenance due dates, unit
  conversion) lives in testable modules with no DB access.
- Test conditions parsing against real captured API responses in `test/fixtures/`, not
  hand-invented JSON.
