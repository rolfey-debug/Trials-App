-- AGnVET Trial Work — shared backend schema (Postgres / Supabase)
-- One database serves both the office portal and the field phone app.
-- Apply with: supabase db push  (or psql -f server/schema.sql)

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Organisations, people, roles

create table orgs (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

-- Mirrors Supabase auth.users; app-level profile + org membership.
create table people (
  id          uuid primary key,                -- = auth.users.id
  org_id      uuid not null references orgs,
  name        text not null,
  email       text not null,
  role        text not null check (role in ('admin','agronomist','team','grower','rep')),
  created_at  timestamptz not null default now()
);

create table clients (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs,
  name        text not null,                   -- grower/business the trial is for
  contact     jsonb,                           -- {name, phone, email}
  created_at  timestamptz not null default now()
);

-- A site (paddock) is first-class: pegged once, hosts many trials across
-- seasons, accumulates history, and anchors weather/phenology.
create table sites (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs,
  client_id   uuid references clients,
  property    text not null,                   -- ‘Glenview’
  town        text,
  lat         double precision,
  lng         double precision,
  paddock     text,
  soil        text,
  ph          numeric,
  bearing     numeric,                         -- front-edge bearing from corner pegs
  corners     jsonb,                           -- pegged GPS corners
  history     jsonb not null default '[]',     -- [{season, crop, notes}]
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Products (seeded from APVMA PubCRIS; experimental products are org-owned)

create table products (
  pcode       integer primary key,             -- APVMA product number
  name        text not null,
  company     text not null,
  category    text not null,                   -- HERBICIDE / FUNGICIDE / ...
  formulation text,
  schedule    text,
  actives     jsonb not null default '[]',     -- [{name, amount, unit}]
  updated_at  timestamptz not null default now()
);
create index products_name_trgm on products using gin (to_tsvector('simple', name));
create index products_actives on products using gin (actives jsonb_path_ops);

create table experimental_products (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs,
  name        text not null,
  company     text,
  category    text,
  actives     jsonb not null default '[]',     -- partial/coded actives allowed
  notes       text,
  created_by  uuid references people,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Trials

-- Protocol templates: a treatment set defined once and stamped onto many
-- trials ("2026 cereal fungicide program"). Trials created from the same
-- protocol share treatment identity, enabling cross-site analysis.
create table protocols (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs,
  name        text not null,
  crop        text,
  treatments  jsonb not null default '[]',     -- same shape as treatments rows
  assessments jsonb not null default '[]',
  created_by  uuid references people,
  created_at  timestamptz not null default now()
);

-- Linked trials for combined reporting (multi-environment analysis).
create table trial_groups (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs,
  name        text not null,                   -- "Cereal fungicide program 2026"
  protocol_id uuid references protocols,
  created_at  timestamptz not null default now()
);

create table trials (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs,
  client_id   uuid references clients,
  site_id     uuid references sites,           -- many trials per site
  group_id    uuid references trial_groups,    -- linked-trial reporting
  protocol_id uuid references protocols,       -- template it was stamped from
  name        text not null,
  season      integer not null,
  status      text not null default 'draft'
              check (status in ('draft','review','approved','active','complete','archived')),
  trial_type  text not null default 'plot'
              check (trial_type in ('demonstration','plot','paddock_scale')),
  aim         text,
  crop        text,
  variety     text,
  sown_date   date,                            -- drives phenology predictions
  design      jsonb not null default '{}',     -- {kind:'rcbd', treatments, reps, seed, grid, repBands}
  layout      jsonb,                           -- generated: {cells, plots, walkOrder} (TrialDoc shape)
  spraying    jsonb,                           -- {waterRateLPerHa, sprayVolumePerPlotMl, batchVolumeL, timings}
  created_by  uuid references people,
  approved_by uuid references people,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table treatments (
  id          uuid primary key default gen_random_uuid(),
  trial_id    uuid not null references trials on delete cascade,
  n           integer not null,                -- treatment number on maps/exports
  name        text not null,
  b_spray     boolean not null default false,
  components  jsonb not null default '[]',     -- [{pcode|expId, name, rate, rateUnit, timing}]
  recipe      text,                            -- rendered "Product 500 mL/ha + wetter 0.25%"
  unique (trial_id, n)
);

-- Planned assessments (what the wizard schedules; field scores link back here)
create table assessments (
  id          uuid primary key default gen_random_uuid(),
  trial_id    uuid not null references trials on delete cascade,
  n           integer not null,                -- Assessment 1, 2, ...
  timing      text,                            -- growth stage or date window
  measures    jsonb not null default '[]',     -- [[key,label,unit], ...] from measure library
  blind       boolean not null default false,
  unique (trial_id, n)
);

-- Protocol source documents (sheets/docs/PDFs uploaded in the portal;
-- files live in Supabase Storage, this row is the metadata + parse result)
create table documents (
  id          uuid primary key default gen_random_uuid(),
  trial_id    uuid references trials on delete cascade,
  org_id      uuid not null references orgs,
  kind        text not null check (kind in ('spray-map','mixing-plan','arm-export','protocol','other')),
  filename    text not null,
  storage_path text not null,
  parsed      jsonb,                           -- parser output used to prefill the wizard
  uploaded_by uuid references people,
  created_at  timestamptz not null default now()
);

-- Plot operations generalise beyond spraying: sowing (variety, seed rate,
-- depth) and fertiliser (product, rate, placement) trials use the same
-- treatments/plots machinery with a different operation kind.
create table operations (
  id          uuid primary key default gen_random_uuid(),
  trial_id    uuid not null references trials on delete cascade,
  kind        text not null check (kind in ('sow','fertilise','spray')),
  timing      text,                            -- 'A' / 'B' / date / growth stage
  detail      jsonb not null default '{}',     -- sow: {variety, seedRateKgHa, depthMm}
                                               -- fertilise: {product, analysis, rateKgHa, placement}
                                               -- spray: {waterRateLPerHa, nozzles}
  performed_at timestamptz,
  performed_by uuid references people,
  conditions  jsonb                            -- wind/temp/ΔT record from the field app
);

-- Fertiliser products are not APVMA-registered — org-curated list with
-- nutrient analysis, searchable in the same picker as chem products.
create table fert_products (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs,
  name        text not null,
  analysis    jsonb not null default '{}',     -- {N, P, K, S, Zn...} % w/w
  form        text,                            -- granular / liquid
  notes       text
);

-- ---------------------------------------------------------------------------
-- Phenology: SILO weather cache per site + org calibrations. Predictions are
-- computed by shared/phenology/engine.ts from these two tables.

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
  factor      numeric,                         -- relative development speed vs crop default
  stage_tt    jsonb,                           -- optional per-stage thermal-time overrides
  source      text,                            -- which season/observations calibrated it
  unique (org_id, crop, variety)
);

-- ---------------------------------------------------------------------------
-- Field data (written by the phone app through the sync queue)

create table scores (
  id          uuid primary key,                -- client-generated, idempotent upsert
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

-- Append-only audit of every sync push from a device (debugging + provenance)
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
-- Row-level security: everything is org-scoped; products are global read.

alter table orgs                  enable row level security;
alter table people                enable row level security;
alter table clients               enable row level security;
alter table sites                 enable row level security;
alter table protocols             enable row level security;
alter table trial_groups          enable row level security;
alter table operations            enable row level security;
alter table fert_products         enable row level security;
alter table site_weather          enable row level security;
alter table phenology_calibrations enable row level security;
alter table experimental_products enable row level security;
alter table trials                enable row level security;
alter table treatments            enable row level security;
alter table assessments           enable row level security;
alter table documents             enable row level security;
alter table scores                enable row level security;
alter table photos                enable row level security;
alter table corrections           enable row level security;
alter table sync_log              enable row level security;

-- security definer: the people policy references this function; without
-- definer rights the lookup recurses through RLS.
create function current_org() returns uuid
language sql stable security definer set search_path = public as
  $$ select org_id from public.people where id = auth.uid() $$;

create policy org_read  on trials for select using (org_id = current_org());
create policy org_write on trials for insert with check (org_id = current_org());
create policy org_update on trials for update using (org_id = current_org());
-- (equivalent org-scoped policies apply to every org table; growers/reps get
--  read-only policies filtered to their client_id — expanded in migration 002)

create policy products_public_read on products for select using (true);
alter table products enable row level security;
