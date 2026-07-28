-- Alice May Logbook — full schema, mirroring the migrations applied to
-- Supabase project fyvvyjsninswdxnzwpdg in order. The authoritative history is
-- the project's migration table; this file exists so the schema, and above all
-- the RLS policies, are reviewable in the repository.
--
--   20260726160847  core_access
--   20260726160857  access_helpers
--   20260726160914  membership_triggers
--   20260726160924  core_access_rls
--   20260726160940  seed_boat_and_allowlist
--   20260726161012  trips
--   20260726161231  feature_tables
--   20260726161255  feature_tables_rls
--   20260726161309  float_plan_public_rpc
--   20260726161318  storage_buckets
--   20260726161326  seed_maintenance_schedule
--   20260726165505  split_write_policies_off_select
--   20260727010614  maintenance_log_performed_by
--   20260727181616  anode_interval_and_battery_schedules
--   20260728002216  trips_distance_statute_miles
--   20260728002946  fuel_readings_as_used_from_full

-- ============================================================ core_access ==

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
create index boat_members_boat_id_idx on public.boat_members (boat_id);

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

-- ========================================================= access_helpers ==

-- security definer so that a policy on boat_members can query boat_members
-- without recursing. search_path is pinned empty, so everything is qualified.
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

-- ===================================================== membership_triggers ==

-- Membership can be established in either order: a person can be allowlisted
-- before they ever sign in, or they can have attempted a sign-in before being
-- allowlisted. Handling only the first case leaves the second permanently and
-- silently broken.

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

-- Signed in first, allowlisted later. Also propagates a role change.
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

-- Removing an address revokes that person's access immediately.
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

-- ======================================================== core_access_rls ==

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
create policy crew_insert on public.crew
  for insert to authenticated with check (app.is_crew(boat_id));
create policy crew_update on public.crew
  for update to authenticated using (app.is_crew(boat_id)) with check (app.is_crew(boat_id));
create policy crew_delete on public.crew
  for delete to authenticated using (app.is_crew(boat_id));

-- New public tables are not auto-exposed to the Data API on this project;
-- without these grants every query fails as a permission error.
grant select, update on public.boats to authenticated;
grant select on public.boat_members to authenticated;
grant select, insert, update, delete on public.allowed_emails to authenticated;
grant select, insert, update, delete on public.crew to authenticated;

-- ================================================= seed_boat_and_allowlist ==

insert into public.boats (name, make_model, year, engine_make_model,
                          fuel_capacity_gal, home_port, home_lat, home_lng, tide_station_id)
select 'Alice May', 'Jeanneau Merry Fisher 795', 2009, 'Yamaha F200',
       72, 'Monterey Harbor', 36.6045, -121.8918, '9413450'
where not exists (select 1 from public.boats);

-- Inserting here fires the trigger, so if the owner has already signed in
-- once, this grants membership without any further step.
insert into public.allowed_emails (email, role, note)
values ('samuel.smith2204@gmail.com', 'crew', 'Owner')
on conflict (email) do nothing;

-- ================================================================== trips ==

create table public.trips (
  id uuid primary key default gen_random_uuid(),
  boat_id uuid not null references public.boats(id) on delete cascade,
  trip_date date not null,
  departure_time time,
  return_time time,
  engine_hours_start numeric(8,2),
  engine_hours_end numeric(8,2),
  hours_run numeric(8,2) generated always as (engine_hours_end - engine_hours_start) stored,
  -- Gallons used since the tank was last full, matching the helm gauge —
  -- NOT gallons remaining. Renamed and re-meaning'd by a later migration.
  fuel_from_full_start_gal numeric(6,2),
  fuel_added_gal numeric(6,2),
  fuel_from_full_end_gal numeric(6,2),
  -- Tank capacity cancels out of this, so consumption needs no reference to it.
  fuel_used_gal numeric(6,2) generated always as (
    coalesce(fuel_added_gal, 0) + (fuel_from_full_end_gal - fuel_from_full_start_gal)
  ) stored,
  fuel_price_per_gal numeric(6,3),
  -- Money actually handed over at the pump, so fuel_added rather than fuel_used.
  fuel_cost_usd numeric(10,2) generated always as (
    coalesce(fuel_added_gal, 0) * coalesce(fuel_price_per_gal, 0)
  ) stored,
  distance_nm numeric(8,2),
  -- Statute miles for readers who think in them. Generated, so it cannot
  -- drift from distance_nm, which stays canonical for NM/gal and stats.
  -- Added by a later migration.
  distance_mi numeric(8,2) generated always as (round(distance_nm * 1.15078, 2)) stored,
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
create index trip_passengers_crew_idx on public.trip_passengers (crew_id);

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
create policy trips_insert on public.trips
  for insert to authenticated with check (app.is_crew(boat_id));
create policy trips_update on public.trips
  for update to authenticated using (app.is_crew(boat_id)) with check (app.is_crew(boat_id));
create policy trips_delete on public.trips
  for delete to authenticated using (app.is_crew(boat_id));

create policy trip_passengers_select on public.trip_passengers
  for select to authenticated using (app.is_member(app.trip_boat(trip_id)));
create policy trip_passengers_insert on public.trip_passengers
  for insert to authenticated with check (app.is_crew(app.trip_boat(trip_id)));
create policy trip_passengers_update on public.trip_passengers
  for update to authenticated
  using (app.is_crew(app.trip_boat(trip_id)))
  with check (app.is_crew(app.trip_boat(trip_id)));
create policy trip_passengers_delete on public.trip_passengers
  for delete to authenticated using (app.is_crew(app.trip_boat(trip_id)));

grant select, insert, update, delete on public.trips to authenticated;
grant select, insert, update, delete on public.trip_passengers to authenticated;

-- ========================================================= feature_tables ==

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
create index maintenance_schedule_boat_idx on public.maintenance_schedule (boat_id);

create table public.maintenance_log (
  id uuid primary key default gen_random_uuid(),
  boat_id uuid not null references public.boats(id) on delete cascade,
  service_date date not null,
  engine_hours_at_service numeric(8,2),
  service_type text not null,
  notes text,
  cost numeric(10,2),
  -- Free text: who did the work or where. Distinct from created_by, which is
  -- the auth user who typed the entry in. Added by a later migration.
  performed_by text,
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
create index documents_boat_idx on public.documents (boat_id, expires_on);

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
  created_at timestamptz not null default now(),
  constraint poi_lat_range check (lat between -90 and 90),
  constraint poi_lng_range check (lng between -180 and 180)
);
create index poi_boat_idx on public.points_of_interest (boat_id);

create table public.trip_sites (
  trip_id uuid not null references public.trips(id) on delete cascade,
  site_id uuid not null references public.points_of_interest(id) on delete cascade,
  primary key (trip_id, site_id)
);
create index trip_sites_site_idx on public.trip_sites (site_id);

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
create index float_plans_boat_idx on public.float_plans (boat_id, departure_at desc);

create table public.float_plan_crew (
  float_plan_id uuid not null references public.float_plans(id) on delete cascade,
  crew_id uuid not null references public.crew(id) on delete cascade,
  primary key (float_plan_id, crew_id)
);
create index float_plan_crew_crew_idx on public.float_plan_crew (crew_id);

-- ===================================================== feature_tables_rls ==

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
create policy sched_insert on public.maintenance_schedule
  for insert to authenticated with check (app.is_crew(boat_id));
create policy sched_update on public.maintenance_schedule
  for update to authenticated using (app.is_crew(boat_id)) with check (app.is_crew(boat_id));
create policy sched_delete on public.maintenance_schedule
  for delete to authenticated using (app.is_crew(boat_id));

create policy mlog_select on public.maintenance_log
  for select to authenticated using (app.is_member(boat_id));
create policy mlog_insert on public.maintenance_log
  for insert to authenticated with check (app.is_crew(boat_id));
create policy mlog_update on public.maintenance_log
  for update to authenticated using (app.is_crew(boat_id)) with check (app.is_crew(boat_id));
create policy mlog_delete on public.maintenance_log
  for delete to authenticated using (app.is_crew(boat_id));

create policy docs_select on public.documents
  for select to authenticated using (app.is_member(boat_id));
create policy docs_insert on public.documents
  for insert to authenticated with check (app.is_crew(boat_id));
create policy docs_update on public.documents
  for update to authenticated using (app.is_crew(boat_id)) with check (app.is_crew(boat_id));
create policy docs_delete on public.documents
  for delete to authenticated using (app.is_crew(boat_id));

create policy poi_select on public.points_of_interest
  for select to authenticated using (app.is_member(boat_id));
create policy poi_insert on public.points_of_interest
  for insert to authenticated with check (app.is_crew(boat_id));
create policy poi_update on public.points_of_interest
  for update to authenticated using (app.is_crew(boat_id)) with check (app.is_crew(boat_id));
create policy poi_delete on public.points_of_interest
  for delete to authenticated using (app.is_crew(boat_id));

create policy trip_sites_select on public.trip_sites
  for select to authenticated using (app.is_member(app.trip_boat(trip_id)));
create policy trip_sites_insert on public.trip_sites
  for insert to authenticated with check (app.is_crew(app.trip_boat(trip_id)));
create policy trip_sites_update on public.trip_sites
  for update to authenticated
  using (app.is_crew(app.trip_boat(trip_id)))
  with check (app.is_crew(app.trip_boat(trip_id)));
create policy trip_sites_delete on public.trip_sites
  for delete to authenticated using (app.is_crew(app.trip_boat(trip_id)));

create policy trip_photos_select on public.trip_photos
  for select to authenticated using (app.is_member(app.trip_boat(trip_id)));
create policy trip_photos_insert on public.trip_photos
  for insert to authenticated with check (app.is_crew(app.trip_boat(trip_id)));
create policy trip_photos_update on public.trip_photos
  for update to authenticated
  using (app.is_crew(app.trip_boat(trip_id)))
  with check (app.is_crew(app.trip_boat(trip_id)));
create policy trip_photos_delete on public.trip_photos
  for delete to authenticated using (app.is_crew(app.trip_boat(trip_id)));

create policy fp_select on public.float_plans
  for select to authenticated using (app.is_member(boat_id));
create policy fp_insert on public.float_plans
  for insert to authenticated with check (app.is_crew(boat_id));
create policy fp_update on public.float_plans
  for update to authenticated using (app.is_crew(boat_id)) with check (app.is_crew(boat_id));
create policy fp_delete on public.float_plans
  for delete to authenticated using (app.is_crew(boat_id));

create policy fpc_select on public.float_plan_crew
  for select to authenticated
  using (exists (select 1 from public.float_plans f
                 where f.id = float_plan_id and app.is_member(f.boat_id)));
create policy fpc_insert on public.float_plan_crew
  for insert to authenticated
  with check (exists (select 1 from public.float_plans f
                 where f.id = float_plan_id and app.is_crew(f.boat_id)));
create policy fpc_update on public.float_plan_crew
  for update to authenticated
  using (exists (select 1 from public.float_plans f
                 where f.id = float_plan_id and app.is_crew(f.boat_id)))
  with check (exists (select 1 from public.float_plans f
                 where f.id = float_plan_id and app.is_crew(f.boat_id)));
create policy fpc_delete on public.float_plan_crew
  for delete to authenticated
  using (exists (select 1 from public.float_plans f
                 where f.id = float_plan_id and app.is_crew(f.boat_id)));

grant select, insert, update, delete on public.maintenance_schedule to authenticated;
grant select, insert, update, delete on public.maintenance_log to authenticated;
grant select, insert, update, delete on public.documents to authenticated;
grant select, insert, update, delete on public.points_of_interest to authenticated;
grant select, insert, update, delete on public.trip_sites to authenticated;
grant select, insert, update, delete on public.trip_photos to authenticated;
grant select, insert, update, delete on public.float_plans to authenticated;
grant select, insert, update, delete on public.float_plan_crew to authenticated;

-- ==================================================== float_plan_public_rpc ==

-- anon never receives a select grant on float_plans. This function is the only
-- anonymous door and it returns exactly one plan or nothing, so a leaked token
-- exposes that one plan and no others.
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
    'expires_at', f.expires_at,
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

-- ======================================================== storage_buckets ==

insert into storage.buckets (id, name, public)
values ('trip-photos', 'trip-photos', false), ('boat-documents', 'boat-documents', false)
on conflict (id) do nothing;

-- Object paths are namespaced by boat id, so membership resolves from the
-- first path segment: <boat_id>/<scope>/<uuid>-<name>.
create policy storage_read on storage.objects
  for select to authenticated
  using (
    bucket_id in ('trip-photos','boat-documents')
    and app.is_member(((storage.foldername(name))[1])::uuid)
  );

create policy storage_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('trip-photos','boat-documents')
    and app.is_crew(((storage.foldername(name))[1])::uuid)
  );

create policy storage_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id in ('trip-photos','boat-documents')
    and app.is_crew(((storage.foldername(name))[1])::uuid)
  );

-- ================================================ seed_maintenance_schedule ==

insert into public.maintenance_schedule (boat_id, service_type, interval_hours, interval_months)
select b.id, s.service_type, s.interval_hours, s.interval_months
from public.boats b
cross join (values
  ('Engine oil & filter', 100::numeric, 12),
  ('Lower unit gear oil', 100::numeric, 12),
  ('Water pump impeller', null::numeric, 12),
  ('Spark plugs', 400::numeric, null::integer),
  ('Fuel filter', 200::numeric, 12),
  -- Anodes moved 6 -> 3 months by a later migration: the boat corrodes on a
  -- mooring whether or not the engine runs, and a lower unit was already lost
  -- to galvanic corrosion in 2025.
  ('Anodes / zincs', null::numeric, 3),
  -- Batteries: three-year replacement, time-based only.
  ('House battery', null::numeric, 36),
  ('Motor battery', null::numeric, 36),
  ('Thruster battery', null::numeric, 36)
) as s(service_type, interval_hours, interval_months)
where not exists (select 1 from public.maintenance_schedule);
