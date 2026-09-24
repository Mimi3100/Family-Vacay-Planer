-- =========================================================
-- NUESTRA AVENTURA · SUPABASE V4 MIGRATION
-- Ejecuta este archivo DESPUÉS de tu schema anterior.
-- Es seguro para volver a ejecutarlo: usa IF NOT EXISTS / CREATE OR REPLACE.
-- =========================================================

-- Rich itinerary fields
alter table public.events add column if not exists departure_time text;
alter table public.events add column if not exists arrival_time text;
alter table public.events add column if not exists duration_minutes integer;
alter table public.events add column if not exists drive_minutes integer;
alter table public.events add column if not exists location text default '';
alter table public.events add column if not exists maps_url text default '';
alter table public.events add column if not exists family_friendly boolean default true;
alter table public.events add column if not exists baby_friendly boolean default false;
alter table public.events add column if not exists stroller boolean default false;
alter table public.events add column if not exists parking text default '';
alter table public.events add column if not exists restrooms text default '';
alter table public.events add column if not exists wear text default '';

-- Rich place / food / activity fields
alter table public.places add column if not exists maps_url text default '';
alter table public.places add column if not exists rating numeric;
alter table public.places add column if not exists review_count integer;
alter table public.places add column if not exists family_friendly boolean default true;
alter table public.places add column if not exists baby_friendly boolean default false;
alter table public.places add column if not exists stroller boolean default false;
alter table public.places add column if not exists parking text default '';
alter table public.places add column if not exists restrooms text default '';

alter table public.food add column if not exists maps_url text default '';
alter table public.food add column if not exists rating numeric;
alter table public.food add column if not exists review_count integer;

alter table public.activities add column if not exists maps_url text default '';
alter table public.activities add column if not exists duration_minutes integer;
alter table public.activities add column if not exists family_friendly boolean default true;
alter table public.activities add column if not exists baby_friendly boolean default false;
alter table public.activities add column if not exists stroller boolean default false;

-- ---------------------------------------------------------
-- REAL JOIN BY INVITE CODE
-- A non-member cannot read groups directly under RLS.
-- This controlled RPC looks up the code and creates the
-- authenticated user's membership without exposing the table.
-- ---------------------------------------------------------
create or replace function public.join_group_by_invite(p_invite_code text)
returns public.groups
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  g public.groups;
  normalized text := upper(trim(p_invite_code));
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select * into g
  from public.groups
  where upper(invite_code) = normalized
  limit 1;

  if g.id is null then
    raise exception 'invalid_invite_code';
  end if;

  insert into public.members(group_id, user_id, role)
  values (g.id, auth.uid(), 'adult')
  on conflict (group_id, user_id) do nothing;

  return g;
end;
$$;

grant execute on function public.join_group_by_invite(text) to authenticated;

-- ---------------------------------------------------------
-- REALTIME additions, safely.
-- ---------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'members'
  ) then
    alter publication supabase_realtime add table public.members;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'travel_status'
  ) then
    alter publication supabase_realtime add table public.travel_status;
  end if;
end $$;

-- Helpful indexes for the shared-trip queries.
create index if not exists idx_members_user_id on public.members(user_id);
create index if not exists idx_members_group_id on public.members(group_id);
create index if not exists idx_events_group_date on public.events(group_id, date, time);
create index if not exists idx_messages_group_created on public.messages(group_id, created_at);
create index if not exists idx_locations_group_user on public.locations(group_id, user_id);
