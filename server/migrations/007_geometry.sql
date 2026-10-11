-- ===========================================================================
-- 007: geometry foundation for the trial builder.
-- Applied to the live project 11 Oct 2026. Additive only: enables PostGIS,
-- adds paddocks, plots and site_features, and planning columns on sites.
-- Nothing existing is changed or dropped. trials.layout (jsonb, unused until
-- now) carries the block placement: origin, bearing, plot size, grid, gaps.
-- ===========================================================================

create extension if not exists postgis with schema extensions;

-- A paddock is the grower's field: the outer boundary a site sits inside.
-- One paddock can hold several sites over the years; a site holds several
-- trials. Boundary comes from Agworld, a shapefile or a drawn outline.
create table if not exists public.paddocks (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.orgs,
  client_id        uuid references public.clients,
  name             text not null,
  farm             text,
  boundary         geometry(Polygon, 4326),
  boundary_geojson jsonb generated always as (case when boundary is null then null else st_asgeojson(boundary)::jsonb end) stored,
  area_ha          numeric generated always as (case when boundary is null then null else round((st_area(boundary::geography) / 10000)::numeric, 2) end) stored,
  source           text,            -- drawn | agworld | shapefile | kml
  agworld_field_id text,
  props            jsonb not null default '{}',
  created_at       timestamptz not null default now()
);
create index if not exists paddocks_boundary_gix on public.paddocks using gist (boundary);

-- Sites gain a paddock and an outline. `planned` is true while the outline
-- is a sketch on satellite imagery and false once the corners are pegged.
alter table public.sites add column if not exists paddock_id uuid references public.paddocks;
alter table public.sites add column if not exists boundary geometry(Polygon, 4326);
alter table public.sites add column if not exists boundary_geojson jsonb generated always as (case when boundary is null then null else st_asgeojson(boundary)::jsonb end) stored;
alter table public.sites add column if not exists planned boolean not null default false;
create index if not exists sites_boundary_gix on public.sites using gist (boundary);

-- One row per plot (or strip, buffer, out, reserve, spare) with its polygon.
-- Generated from the trial's block placement, then stored so the office can
-- nudge a plot and the phone sees the same shape. `planned` is true until
-- the block is confirmed against pegged corners.
create table if not exists public.plots (
  id           uuid primary key default gen_random_uuid(),
  trial_id     uuid not null references public.trials on delete cascade,
  plot         integer not null,
  row          integer,
  position     integer,
  kind         text not null default 'plot' check (kind in ('plot', 'strip', 'buffer', 'out', 'reserve', 'spare')),
  treatment    integer,
  rep          integer,
  geom         geometry(Polygon, 4326) not null,
  geojson      jsonb generated always as (st_asgeojson(geom)::jsonb) stored,
  centre       geometry(Point, 4326) generated always as (st_centroid(geom)) stored,
  area_m2      numeric generated always as (round(st_area(geom::geography)::numeric, 1)) stored,
  planned      boolean not null default true,
  confirmed_at timestamptz,
  source       text,                -- block | pegged | drawn | as-applied
  props        jsonb not null default '{}',
  updated_at   timestamptz not null default now(),
  unique (trial_id, plot)
);
create index if not exists plots_geom_gix on public.plots using gist (geom);
create index if not exists plots_trial_idx on public.plots (trial_id);

-- Things on a site that are not plots: buffers, tracks, gates, photo-point
-- pegs, weather station, soil sample points, hazards for the WHS pack.
create table if not exists public.site_features (
  id         uuid primary key default gen_random_uuid(),
  site_id    uuid not null references public.sites on delete cascade,
  kind       text not null,          -- buffer | track | gate | photo_point | weather_station | soil_sample | hazard | note
  name       text,
  geom       geometry(Geometry, 4326) not null,
  geojson    jsonb generated always as (st_asgeojson(geom)::jsonb) stored,
  props      jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists site_features_geom_gix on public.site_features using gist (geom);

-- Row-level security follows the existing patterns: org-scoped, trial-scoped,
-- site-scoped.
alter table public.paddocks enable row level security;
drop policy if exists paddocks_org_all on public.paddocks;
create policy paddocks_org_all on public.paddocks for all
  using (org_id = current_org()) with check (org_id = current_org());

alter table public.plots enable row level security;
drop policy if exists plots_trial_all on public.plots;
create policy plots_trial_all on public.plots for all
  using (trial_id in (select id from public.trials where org_id = current_org()))
  with check (trial_id in (select id from public.trials where org_id = current_org()));

alter table public.site_features enable row level security;
drop policy if exists site_features_all on public.site_features;
create policy site_features_all on public.site_features for all
  using (site_id in (select id from public.sites where org_id = current_org()))
  with check (site_id in (select id from public.sites where org_id = current_org()));

-- Which plot is a point in? Used by the phone to confirm the plot it is
-- standing in and by yield ingest to assign points to strips.
create or replace function public.plot_at(p_trial uuid, p_lat double precision, p_lng double precision)
returns integer
language sql stable security invoker set search_path = public, extensions as $$
  select plot from public.plots
  where trial_id = p_trial and st_contains(geom, st_setsrid(st_makepoint(p_lng, p_lat), 4326))
  limit 1
$$;

comment on column public.trials.layout is 'Block placement for the site map: {origin:{lat,lng}, bearingDeg, plotW, plotL, rows, positions, rowGapM, posGapM, planned, placedAt, placedBy}. Plots are generated from it into public.plots.';
