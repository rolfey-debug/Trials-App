-- ===========================================================================
-- 012 — Yield map points for paddock-scale strips
-- ---------------------------------------------------------------------------
-- A header's yield map (CSV export) is loaded as points against a trial,
-- cleaned on the way in by the portal, assigned to the plot or strip polygon
-- each point falls in (PostGIS contains, same geometry the site planner
-- stores), and summarised per plot. Plot means are then written beside the
-- assessor scores as the `yield_map_t_ha` measure, never over them.
-- Additive only. Trial-scoped RLS like plots.
-- ===========================================================================

create table if not exists public.yield_points (
  id          bigserial primary key,
  trial_id    uuid not null references public.trials on delete cascade,
  source      text not null,                 -- file name of the export
  geom        geometry(Point, 4326) not null,
  yield_t_ha  numeric not null,
  moisture_pct numeric,
  recorded_at timestamptz,
  plot        integer,                       -- assigned by assign_yield_points
  props       jsonb not null default '{}',
  created_at  timestamptz not null default now()
);
create index if not exists yield_points_geom_gix on public.yield_points using gist (geom);
create index if not exists yield_points_trial on public.yield_points (trial_id, source);

alter table public.yield_points enable row level security;
drop policy if exists yield_points_trial_all on public.yield_points;
create policy yield_points_trial_all on public.yield_points for all
  using (trial_id in (select id from public.trials where org_id = current_org()))
  with check (trial_id in (select id from public.trials where org_id = current_org()));

-- Drop every point into the plot or strip it sits in. Returns points assigned.
create or replace function public.assign_yield_points(p_trial uuid)
returns integer
language plpgsql security invoker set search_path = public, extensions as $$
declare n integer;
begin
  update public.yield_points y
     set plot = p.plot
    from public.plots p
   where y.trial_id = p_trial and p.trial_id = p_trial
     and p.kind in ('plot','strip')
     and st_contains(p.geom, y.geom);
  get diagnostics n = row_count;
  return n;
end $$;

-- Per-plot summary of the assigned points.
create or replace function public.plot_yield_means(p_trial uuid)
returns table (plot integer, treatment integer, n bigint, mean numeric, sd numeric, moisture numeric)
language sql stable security invoker set search_path = public as $$
  select y.plot, p.treatment, count(*) as n,
         round(avg(y.yield_t_ha)::numeric, 3) as mean,
         round(coalesce(stddev_samp(y.yield_t_ha), 0)::numeric, 3) as sd,
         round(avg(y.moisture_pct)::numeric, 2) as moisture
    from public.yield_points y
    join public.plots p on p.trial_id = y.trial_id and p.plot = y.plot
   where y.trial_id = p_trial and y.plot is not null
   group by y.plot, p.treatment
   order by y.plot
$$;

insert into public.measures (key, label, rating, unit, target, part, sample, higher_better, min, max, group_key, canonical, note)
values ('yield_map_t_ha', 'Grain yield from yield map', 'yield', 't/ha', null, 'plot', 'header yield monitor points inside the plot, cleaned, mean', true, 0, null, 'yield', null, 'Machine measure: sits beside plot-harvester or hand yield, never replaces it')
on conflict (key) do nothing;
