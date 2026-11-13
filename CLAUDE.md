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
- **Sign-in is email + password; magic-link sign-in is gone.** Emailed links
  still exist for exactly two things: confirming a new account and setting or
  resetting a password. Accounts made in the magic-link era have no password;
  their owners use "Set a password" (`resetPasswordForEmail`), never signup.
- **The allowlist is enforced by Supabase Auth, not the app.** A "Before User
  Created" auth hook, `public.hook_before_user_created(jsonb)` (free plan), refuses
  any new `auth.users` row whose lowercased email isn't in `allowed_emails`. It runs
  as `supabase_auth_admin`, which does not bypass RLS — it needs its own grant *and*
  its own select policy on `allowed_emails`. Execute is revoked from
  anon/authenticated/public, or it becomes an allowlist oracle over `/rpc`. The
  hook must be switched on in the dashboard (Authentication → Hooks); the
  migration alone does nothing. The signup action matches the hook's message
  text (`NOT_APPROVED_MARKER` in `lib/auth/links.ts`) — change both together.
- **The hook only guards creation.** A person removed from `allowed_emails` keeps
  their `auth.users` row and can still sign in; they just have no membership and
  land on `/no-access`. That is intended — RLS keys off `boat_members`, not on
  having an account.
- **Sign-in failures all read "Email or password is incorrect."** Unknown,
  unapproved, unconfirmed, and no-password-yet are deliberately indistinguishable.
  The reset form likewise always says "If that address is approved, we've sent a
  link". Signup is the one place that says an address isn't approved — the hook's
  refusal already reveals it.
- **An emailed link must never do anything just by being fetched.** Mail clients
  build previews and company scanners check links, both by loading them, and a
  token works exactly once — so whatever loads it first spends it, and the real
  recipient is told the link expired. Links land on `/auth/confirm`, which reads
  the token, renders a button, and verifies nothing until that button is pressed.
  Anything that verifies on page load brings the bug straight back.
- **Auth email templates are editable on the free plan**, under Authentication →
  Emails (true for this project; Supabase's 2026-06 change blocks it only for *new*
  free projects on the default SMTP). "Confirm signup" and "Reset password" point at
  `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=…`, keeping Supabase's own
  verify endpoint out of the path so there is nothing spendable before the button.
  The reset template adds `&next=/auth/update-password`. `/auth/confirm` also accepts
  the `?code=` the default templates produce, and spots a reset from the session's
  `amr` claim since such links carry no `type`.
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
