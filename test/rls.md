# RLS verification

Run against project `fyvvyjsninswdxnzwpdg` on 2026-07-26 via the Supabase MCP,
impersonating roles with `set local role` and `set_config('request.jwt.claims', …)`.
All probe rows were removed afterwards; the database is back to its seeded state
(1 boat, 1 allowlist entry, 6 maintenance schedules, 0 auth users).

## Membership triggers

The zero-SQL promise only holds if membership can be established in either
order. Both were verified end to end.

| Scenario | Result |
| --- | --- |
| Allowlisted first, then signs in | `boat_members` row created with role `viewer` |
| Signs in first, then allowlisted | 0 rows before; role `crew` immediately after |
| Removed from the allowlist | membership dropped to 0 rows immediately |

The second row is the one a single trigger on `auth.users` would miss. Without
it, anyone who ever attempted a sign-in before being added would be permanently
and silently locked out.

## Policy enforcement

| Check | Expected | Actual |
| --- | --- | --- |
| Viewer inserts a trip | blocked | blocked, `42501` insufficient_privilege |
| Viewer reads `allowed_emails` (crew-only) | 0 rows | 0 rows |
| Viewer reads `boats` | 1 row | 1 row |
| Crew inserts a trip | allowed | allowed |
| Signed-in non-member reads `trips` | 0 rows | 0 rows |
| Signed-in non-member reads `boats` | 0 rows | 0 rows |
| `anon` reads `trips` | 0 rows | 0 rows |
| `anon` reads `float_plans` | 0 rows | 0 rows |

### A note on the first combined run

Running every check in one `DO` block reported the crew insert as blocked with
`22P02`. That was an artefact of the test, not a policy defect: the caught
exception from the viewer's failed insert rolled back the subtransaction,
which discarded the transaction-local `request.jwt.claims` setting, so
`auth.uid()` had nothing valid left to parse. Re-run in isolation, the crew
insert succeeds. Worth recording because the same trap will catch the next
person who writes RLS tests this way.

## Float plan exposure

`float_plans` is invisible to `anon`. The only anonymous route to a plan is
`public.get_float_plan(text)`, which is `security definer`, takes a 32-byte
token, and returns exactly one plan or nothing.

    select has_function_privilege('anon', 'public.get_float_plan(text)', 'execute');  -- true
    select has_table_privilege('anon', 'public.float_plans', 'select');               -- false

The two security advisor warnings both concern that function being callable by
`anon` and by `authenticated`. Both are accepted by design — a float plan that
required a login would be useless to the neighbour or marina office it exists
for. No advisor errors.

## Replacing a trip's crew and sites

Run 2026-07-28 as the owner (`set local role authenticated` plus their real
`sub`), so RLS applied throughout, inside a transaction that was rolled back.

`public.set_trip_links(trip, crew[], sites[])` replaces both lists in one
transaction. Previously this was a DELETE request followed by an INSERT request:
when the insert failed the delete had already committed, and a trip that had
people aboard was left with none while the form reported only an error.

| Step | Passed in | Aboard afterwards |
| --- | --- | --- |
| Initial save | Becca, Chris | Becca, Chris |
| Re-save the identical list | Becca, Chris | Becca, Chris |
| Overlapping list | Chris, Lilly | Chris, Lilly |
| Same person listed twice | Chris, Chris | Chris |
| Empty list | — | nobody |

Rows two and four are the ones that used to fail: both collided with
`trip_passengers_pkey` and returned 409, which aborted the save after the delete
had already emptied the table.

## Allowlist enforced at signup (before-user-created hook)

Migration `20261113161427 before_user_created_hook` applied 2026-11-13.
Database checks below were run that day and pass. The end-to-end table still
needs the hook enabled under Authentication → Hooks.

### At the database (verified 2026-11-13)

| Check | Expected | Actual |
| --- | --- | --- |
| `public.hook_before_user_created(jsonb)` exists, returns `jsonb`, security invoker | yes | yes |
| `supabase_auth_admin` execute | true | true |
| `anon` / `authenticated` execute | false | false / false |
| `supabase_auth_admin` select on `allowed_emails` | true | true (insert: false) |
| `supabase_auth_admin` bypasses RLS | — | false, so `allowed_emails_auth_admin_select` policy is required, and present |
| Hook with `stranger@example.com` | 403 error object | 403, "not approved for this logbook" |
| Hook with an allowlisted address, uppercased and space-padded | `{}` | `{}` |
| Hook with no email | 403 error object | 403 |

The MCP cannot `set role supabase_auth_admin` (42501), so the hook's output
was checked as the MCP's role and the auth admin's access via
`has_*_privilege` and `pg_policies`. The real proof is the end-to-end run.

Equivalent SQL, as Auth would call it (needs a role allowed to switch):

    begin;
    set local role supabase_auth_admin;
    select public.hook_before_user_created(
      '{"user": {"email": "stranger@example.com"}}'::jsonb);   -- expect error object, http_code 403
    select public.hook_before_user_created(
      '{"user": {"email": "Samuel.Smith2204@Gmail.com"}}'::jsonb); -- expect {} (case-insensitive)
    select public.hook_before_user_created('{"user": {}}'::jsonb);  -- expect error (no email)
    rollback;

    -- Nobody but Auth can call it
    select has_function_privilege('anon', 'public.hook_before_user_created(jsonb)', 'execute');          -- false
    select has_function_privilege('authenticated', 'public.hook_before_user_created(jsonb)', 'execute'); -- false
    select has_function_privilege('supabase_auth_admin', 'public.hook_before_user_created(jsonb)', 'execute'); -- true

### End to end (through /signup, hook enabled)

| Scenario | Expected | Actual |
| --- | --- | --- |
| Non-approved address signs up | "isn't on the crew list" message; no `auth.users` row created | 2026-11-13, hook enabled: `POST /auth/v1/signup` → 403 `{"msg":"This email address is not approved for this logbook."}`; 0 rows. supabase-js surfaces `msg` as `error.message`, which the signup action matches |
| Approved address signs up | "Check your email"; unconfirmed `auth.users` row; membership row via `on_auth_user_created`; confirm link → button → signed in | |
| Approved address removed on /access, then signs up again (never had an account) | refused, no `auth.users` row | |
| Approved address removed on /access *after* creating an account | membership dropped at once; signup creates nothing (user already exists); sign-in works but lands on `/no-access` | |
| Existing magic-link-era user uses "Set a password" | reset email → button → `/auth/update-password` → sign in with the new password; same `auth.users.id` as before | |

The fourth row is the honest limit of the hook: it guards *creation*. A removed
person's old account still exists and can still authenticate, but RLS is keyed
on `boat_members`, which the delete trigger has already emptied, so they see
nothing.

### Existing accounts outside the allowlist (read-only audit)

    select u.id, u.email, u.created_at, u.last_sign_in_at
    from auth.users u
    left join public.allowed_emails a on a.email = lower(u.email)
    where a.email is null
    order by u.created_at;
