-- Migration: before_user_created_hook
--
-- NOT YET APPLIED. Apply through the Supabase MCP (apply_migration, name
-- "before_user_created_hook") with exactly this body, then delete this file
-- and add the version to the list at the top of supabase/schema.sql. The same
-- SQL is mirrored there under its own section.

-- The allowlist, enforced by Supabase Auth itself. Auth calls this before it
-- writes any new auth.users row, whatever created it: signUp with a password,
-- a passwordless OTP, OAuth, or the admin API. An address that is not in
-- allowed_emails never becomes an account.
--
-- Existing users signing in do not reach this: nothing is being created.
-- Security invoker, as Supabase advises for hooks; it runs as
-- supabase_auth_admin, which is granted exactly what it reads below.
create or replace function public.hook_before_user_created(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_email text := lower(trim(event -> 'user' ->> 'email'));
begin
  if v_email is not null and v_email <> '' and exists (
    select 1 from public.allowed_emails a where a.email = v_email
  ) then
    return '{}'::jsonb;
  end if;

  -- The phrase "not approved for this logbook" is matched by the signup
  -- action (lib/auth/links.ts, NOT_APPROVED_MARKER). Keep them in step.
  return jsonb_build_object(
    'error', jsonb_build_object(
      'http_code', 403,
      'message', 'This email address is not approved for this logbook.'
    )
  );
end;
$$;

-- Only Auth may call it. Functions in public are executable by PUBLIC, and
-- Supabase's default privileges grant anon and authenticated directly, so all
-- three are revoked; otherwise it would be an allowlist oracle over /rpc.
grant usage on schema public to supabase_auth_admin;
grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;
revoke execute on function public.hook_before_user_created(jsonb) from authenticated, anon, public;

-- The hook reads allowed_emails, which has RLS on. supabase_auth_admin does
-- not bypass RLS, so it needs the grant and a policy of its own. Select only.
grant select on table public.allowed_emails to supabase_auth_admin;
create policy allowed_emails_auth_admin_select on public.allowed_emails
  for select to supabase_auth_admin using (true);
