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
