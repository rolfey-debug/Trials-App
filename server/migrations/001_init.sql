-- ===========================================================================
-- AGnVET Trial Work — initial migration (run ONCE in the Supabase SQL editor)
-- Creates the full schema, row-level security, the signup trigger, the photo
-- storage bucket, and seeds the org + the two 2026 sites/trials with the
-- fixed ids the apps reference (shared/supa.ts).
-- ===========================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Core tables

create table orgs (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

create table people (
  id          uuid primary key,
  org_id      uuid not null references orgs,
  name        text not null,
  email       text not null,
  role        text not null check (role in ('admin','agronomist','team','grower','rep')),
  created_at  timestamptz not null default now()
);

create table clients (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs,
  name        text not null,
  contact     jsonb,
  created_at  timestamptz not null default now()
);

create table sites (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs,
  client_id   uuid references clients,
  property    text not null,
  town        text,
  lat         double precision,
  lng         double precision,
  paddock     text,
  soil        text,
  ph          numeric,
  bearing     numeric,
  corners     jsonb,
  history     jsonb not null default '[]',
  created_at  timestamptz not null default now()
);

create table products (
  pcode       integer primary key,
  name        text not null,
  company     text not null,
  category    text not null,
  formulation text,
  schedule    text,
  actives     jsonb not null default '[]',
  updated_at  timestamptz not null default now()
);

create table experimental_products (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs,
  name        text not null,
  company     text,
  category    text,
  actives     jsonb not null default '[]',
  notes       text,
  created_by  uuid references people,
  created_at  timestamptz not null default now()
);

create table protocols (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs,
  name        text not null,
  crop        text,
  treatments  jsonb not null default '[]',
  assessments jsonb not null default '[]',
  created_by  uuid references people,
  created_at  timestamptz not null default now()
);

create table trial_groups (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs,
  name        text not null,
  protocol_id uuid references protocols,
  created_at  timestamptz not null default now()
);

create table trials (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs,
  client_id   uuid references clients,
  site_id     uuid references sites,
  group_id    uuid references trial_groups,
  protocol_id uuid references protocols,
  name        text not null,
  season      integer not null,
  status      text not null default 'draft'
              check (status in ('draft','review','approved','active','complete','archived')),
  trial_type  text not null default 'plot'
              check (trial_type in ('demonstration','plot','paddock_scale')),
  aim         text,
  crop        text,
  variety     text,
  sown_date   date,
  design      jsonb not null default '{}',
  layout      jsonb,
  spraying    jsonb,
  created_by  uuid references people,
  approved_by uuid references people,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table treatments (
  id          uuid primary key default gen_random_uuid(),
  trial_id    uuid not null references trials on delete cascade,
  n           integer not null,
  name        text not null,
  b_spray     boolean not null default false,
  components  jsonb not null default '[]',
  recipe      text,
  unique (trial_id, n)
);

create table assessments (
  id          uuid primary key default gen_random_uuid(),
  trial_id    uuid not null references trials on delete cascade,
  n           integer not null,
  timing      text,
  measures    jsonb not null default '[]',
  blind       boolean not null default false,
  unique (trial_id, n)
);

create table documents (
  id          uuid primary key default gen_random_uuid(),
  trial_id    uuid references trials on delete cascade,
  org_id      uuid not null references orgs,
  kind        text not null check (kind in ('spray-map','mixing-plan','arm-export','protocol','other')),
  filename    text not null,
  storage_path text not null,
  parsed      jsonb,
  uploaded_by uuid references people,
  created_at  timestamptz not null default now()
);

create table operations (
  id          uuid primary key default gen_random_uuid(),
  trial_id    uuid not null references trials on delete cascade,
  kind        text not null check (kind in ('sow','fertilise','spray')),
  timing      text,
  detail      jsonb not null default '{}',
  performed_at timestamptz,
  performed_by uuid references people,
  conditions  jsonb
);

create table fert_products (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs,
  name        text not null,
  analysis    jsonb not null default '{}',
  form        text,
  notes       text
);

create table site_weather (
  site_id     uuid not null references sites on delete cascade,
  date        date not null,
  min_temp    numeric not null,
  max_temp    numeric not null,
  rain        numeric,
  source      text not null default 'silo',
  primary key (site_id, date)
);

create table phenology_calibrations (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs,
  crop        text not null,
  variety     text not null,
  factor      numeric,
  stage_tt    jsonb,
  source      text,
  unique (org_id, crop, variety)
);

create table scores (
  id          uuid primary key,
  trial_id    uuid not null references trials on delete cascade,
  assessment  integer not null,
  plot        integer not null,
  measure     text not null,
  value       numeric,
  note        text,
  assessor    uuid references people,
  recorded_at timestamptz not null,
  synced_at   timestamptz not null default now()
);
create index scores_trial on scores (trial_id, assessment, plot);

create table photos (
  id          uuid primary key,
  trial_id    uuid not null references trials on delete cascade,
  plot        integer,
  storage_path text not null,
  taken_by    uuid references people,
  taken_at    timestamptz not null,
  meta        jsonb
);

create table corrections (
  id          uuid primary key,
  trial_id    uuid not null references trials on delete cascade,
  plot        integer not null,
  kind        text not null check (kind in ('relabel','exclude')),
  original_t  integer,
  effective_t integer,
  reason      text,
  made_by     uuid references people,
  made_at     timestamptz not null
);

create table sync_log (
  id          bigint generated always as identity primary key,
  org_id      uuid not null references orgs,
  device      text,
  person_id   uuid references people,
  pushed_at   timestamptz not null default now(),
  items       integer not null,
  payload     jsonb
);

-- ---------------------------------------------------------------------------
-- Signup → people row (everyone joins the AGnVET org as agronomist; adjust
-- roles later from the people table)

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.people (id, org_id, name, email, role)
  values (
    new.id,
    '00000000-0000-0000-0000-000000000001',
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email,
    'agronomist'
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row-level security

-- security definer: the people policy references this function; without
-- definer rights the lookup recurses through RLS.
create function current_org() returns uuid
language sql stable security definer set search_path = public as
  $$ select org_id from public.people where id = auth.uid() $$;

alter table orgs enable row level security;
create policy orgs_read on orgs for select using (id = current_org());

alter table people enable row level security;
create policy people_read on people for select using (org_id = current_org());

alter table products enable row level security;
create policy products_public_read on products for select using (true);

-- org-scoped tables: full access within your org
do $$
declare t text;
begin
  foreach t in array array['clients','sites','experimental_products','protocols','trial_groups','trials','documents','fert_products','phenology_calibrations','sync_log']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I_org_all on %I for all using (org_id = current_org()) with check (org_id = current_org())', t, t);
  end loop;
end $$;

-- trial-scoped tables: access follows the trial's org
do $$
declare t text;
begin
  foreach t in array array['treatments','assessments','operations','scores','photos','corrections']
  loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy %I_trial_all on %I for all using (trial_id in (select id from trials where org_id = current_org())) with check (trial_id in (select id from trials where org_id = current_org()))',
      t, t);
  end loop;
end $$;

alter table site_weather enable row level security;
create policy site_weather_all on site_weather for all
  using (site_id in (select id from sites where org_id = current_org()))
  with check (site_id in (select id from sites where org_id = current_org()));

-- ---------------------------------------------------------------------------
-- Photo storage bucket

insert into storage.buckets (id, name, public) values ('photos', 'photos', false)
on conflict (id) do nothing;

create policy photos_bucket_rw on storage.objects for all to authenticated
  using (bucket_id = 'photos') with check (bucket_id = 'photos');

-- ---------------------------------------------------------------------------
-- Seed: org, sites, trials (fixed ids referenced by shared/supa.ts)

insert into orgs (id, name)
values ('00000000-0000-0000-0000-000000000001', 'AGnVET Services — IK Caldwell')
on conflict (id) do nothing;

insert into sites (id, org_id, property, town, lat, lng, paddock, soil)
values
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001',
   '‘Glenview’', 'Matong NSW', -34.768, 146.929, 'Church block', 'red-brown earth'),
  ('00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000001',
   '‘Hillview’', 'Ganmain NSW', -34.792, 147.041, 'Racecourse block', 'pH 5.4 (CaCl2)')
on conflict (id) do nothing;

insert into trials (id, org_id, site_id, name, season, status, trial_type, crop, variety, sown_date, aim)
values
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000011', 'Matong Wheat Fungicide Demo 2026', 2026, 'active',
   'demonstration', 'Wheat', 'Scepter', '2026-05-12',
   'Compare label-rate foliar fungicide programs for stripe rust and septoria in Scepter wheat, and show the timing response (GS31 vs GS39) at the Matong field day.'),
  ('00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000012', 'Ganmain Barley Net Blotch 2026', 2026, 'review',
   'plot', 'Barley', 'Spartacus CL', '2026-05-08',
   'Compare registered foliar fungicides and one experimental SDHI for net form net blotch in Spartacus CL barley.')
on conflict (id) do nothing;
