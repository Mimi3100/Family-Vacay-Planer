-- NUESTRA AVENTURA · V4 DATABASE FIX

alter table public.events
  add column if not exists departure_time text,
  add column if not exists arrival_time text,
  add column if not exists duration_minutes integer,
  add column if not exists drive_minutes integer,
  add column if not exists location text default '',
  add column if not exists maps_url text default '',
  add column if not exists family_friendly boolean default true,
  add column if not exists baby_friendly boolean default false,
  add column if not exists stroller boolean default false,
  add column if not exists parking text default '',
  add column if not exists restrooms text default '',
  add column if not exists wear text default '';

alter table public.places
  add column if not exists maps_url text default '',
  add column if not exists rating numeric,
  add column if not exists review_count integer,
  add column if not exists family_friendly boolean default true,
  add column if not exists baby_friendly boolean default false,
  add column if not exists stroller boolean default false,
  add column if not exists parking text default '',
  add column if not exists restrooms text default '';

alter table public.food
  add column if not exists maps_url text default '',
  add column if not exists rating numeric,
  add column if not exists review_count integer;

alter table public.activities
  add column if not exists maps_url text default '',
  add column if not exists duration_minutes integer,
  add column if not exists family_friendly boolean default true,
  add column if not exists baby_friendly boolean default false,
  add column if not exists stroller boolean default false;
