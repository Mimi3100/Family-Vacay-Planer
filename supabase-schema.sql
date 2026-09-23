-- NUESTRA AVENTURA · SUPABASE DATABASE
-- Ejecuta este archivo completo en Supabase > SQL Editor.
-- Después activa Realtime para: events, packing, messages, locations.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 email text,
 name text,
 created_at timestamptz default now()
);

create table if not exists public.groups (
 id uuid primary key default gen_random_uuid(),
 name text not null,
 destination text default '',
 start_date date,
 end_date date,
 flight_number text default '',
 invite_code text unique not null,
 owner_id uuid references auth.users(id) on delete set null,
 created_at timestamptz default now()
);

create table if not exists public.members (
 id uuid primary key default gen_random_uuid(),
 group_id uuid not null references public.groups(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 role text not null default 'adult',
 created_at timestamptz default now(),
 unique(group_id,user_id)
);

create table if not exists public.events (
 id uuid primary key default gen_random_uuid(), group_id uuid not null references groups(id) on delete cascade,
 day text, date date, time text, title text not null, description text default '', tag text default 'CUSTOM', created_at timestamptz default now()
);
create table if not exists public.packing (
 id uuid primary key default gen_random_uuid(), group_id uuid not null references groups(id) on delete cascade,
 name text not null, done boolean default false, created_at timestamptz default now()
);
create table if not exists public.places (
 id uuid primary key default gen_random_uuid(), group_id uuid not null references groups(id) on delete cascade,
 name text not null, description text default '', category text default 'FAMILY', created_at timestamptz default now()
);
create table if not exists public.food (
 id uuid primary key default gen_random_uuid(), group_id uuid not null references groups(id) on delete cascade,
 name text not null, description text default '', category text default 'FOOD', created_at timestamptz default now()
);
create table if not exists public.activities (
 id uuid primary key default gen_random_uuid(), group_id uuid not null references groups(id) on delete cascade,
 name text not null, description text default '', category text default 'FAMILY', created_at timestamptz default now()
);
create table if not exists public.messages (
 id uuid primary key default gen_random_uuid(), group_id uuid not null references groups(id) on delete cascade,
 user_id uuid references auth.users(id) on delete set null, body text not null, created_at timestamptz default now()
);
create table if not exists public.locations (
 id uuid primary key default gen_random_uuid(), group_id uuid not null references groups(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade, lat double precision not null, lon double precision not null,
 name text default '', updated_at timestamptz default now(), unique(group_id,user_id)
);
create table if not exists public.parking (
 group_id uuid primary key references groups(id) on delete cascade,
 user_id uuid references auth.users(id) on delete set null, lat double precision not null, lon double precision not null, updated_at timestamptz default now()
);
create table if not exists public.travel_status (
 group_id uuid primary key references groups(id) on delete cascade,
 tsa boolean default false, boarding boolean default false, landed boolean default false, bags boolean default false
);

alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.members enable row level security;
alter table public.events enable row level security;
alter table public.packing enable row level security;
alter table public.places enable row level security;
alter table public.food enable row level security;
alter table public.activities enable row level security;
alter table public.messages enable row level security;
alter table public.locations enable row level security;
alter table public.parking enable row level security;
alter table public.travel_status enable row level security;

create or replace function public.is_group_member(g uuid)
returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from members where group_id=g and user_id=auth.uid());
$$;

create or replace function public.is_group_admin(g uuid)
returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from members where group_id=g and user_id=auth.uid() and role in ('owner','admin'));
$$;

-- Profiles
create policy "profiles self or group" on profiles for select using (
 id=auth.uid() or exists(select 1 from members m join members mine on mine.group_id=m.group_id where m.user_id=profiles.id and mine.user_id=auth.uid())
);
create policy "profile insert self" on profiles for insert with check(id=auth.uid());
create policy "profile update self" on profiles for update using(id=auth.uid()) with check(id=auth.uid());

-- Groups/members
create policy "members can read groups" on groups for select using(is_group_member(id) or owner_id=auth.uid());
create policy "owner creates group" on groups for insert with check(owner_id=auth.uid());
create policy "admins update group" on groups for update using(is_group_admin(id));
create policy "members read members" on members for select using(is_group_member(group_id));
create policy "self join group" on members for insert with check(user_id=auth.uid());
create policy "admins remove members" on members for delete using(is_group_admin(group_id) or user_id=auth.uid());

-- Generic group tables
create policy "group read events" on events for select using(is_group_member(group_id));
create policy "group add events" on events for insert with check(is_group_member(group_id));
create policy "group edit events" on events for update using(is_group_member(group_id));
create policy "group delete events" on events for delete using(is_group_member(group_id));

create policy "group read packing" on packing for select using(is_group_member(group_id));
create policy "group add packing" on packing for insert with check(is_group_member(group_id));
create policy "group edit packing" on packing for update using(is_group_member(group_id));
create policy "group delete packing" on packing for delete using(is_group_member(group_id));

create policy "group read places" on places for select using(is_group_member(group_id));
create policy "group add places" on places for insert with check(is_group_member(group_id));
create policy "group edit places" on places for update using(is_group_member(group_id));
create policy "group delete places" on places for delete using(is_group_member(group_id));

create policy "group read food" on food for select using(is_group_member(group_id));
create policy "group add food" on food for insert with check(is_group_member(group_id));
create policy "group edit food" on food for update using(is_group_member(group_id));
create policy "group delete food" on food for delete using(is_group_member(group_id));

create policy "group read activities" on activities for select using(is_group_member(group_id));
create policy "group add activities" on activities for insert with check(is_group_member(group_id));
create policy "group edit activities" on activities for update using(is_group_member(group_id));
create policy "group delete activities" on activities for delete using(is_group_member(group_id));

create policy "group read messages" on messages for select using(is_group_member(group_id));
create policy "group add messages" on messages for insert with check(is_group_member(group_id) and user_id=auth.uid());
create policy "group delete messages" on messages for delete using(user_id=auth.uid() or is_group_admin(group_id));

create policy "group read locations" on locations for select using(is_group_member(group_id));
create policy "self write location" on locations for insert with check(is_group_member(group_id) and user_id=auth.uid());
create policy "self update location" on locations for update using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy "self delete location" on locations for delete using(user_id=auth.uid());

create policy "group read parking" on parking for select using(is_group_member(group_id));
create policy "self write parking" on parking for insert with check(is_group_member(group_id) and user_id=auth.uid());
create policy "self update parking" on parking for update using(user_id=auth.uid());

create policy "group read status" on travel_status for select using(is_group_member(group_id));
create policy "group write status" on travel_status for insert with check(is_group_member(group_id));
create policy "group update status" on travel_status for update using(is_group_member(group_id));

-- Enable realtime
alter publication supabase_realtime add table events;
alter publication supabase_realtime add table packing;
alter publication supabase_realtime add table messages;
alter publication supabase_realtime add table locations;
