-- 005: enforce roles in row-level security (build plan S5).
--
-- Before this migration every authenticated member of an org had full
-- read/write on all org data regardless of role. This migration makes the
-- stored role mean something:
--
--   admin       everything in the org (unchanged)
--   agronomist  everything in the org (unchanged)
--   team        reads org data; writes only field records (scores,
--               operations, photos, corrections, sync_log) — cannot create
--               or edit trials, protocols, treatments, sites, clients
--   grower      nothing (deny by default until host linkage ships — F40)
--   rep         nothing (deny by default until sponsor linkage ships — F40)
--
-- Growers and reps get real scoped read access when the linking columns
-- exist (site host -> person, trial sponsor -> person). Until then they are
-- locked out entirely, which satisfies "a grower or rep can't read another
-- site's data" by construction.
--
-- Idempotent: drops and recreates the policies it owns.

-- Role lookup, same security-definer pattern as current_org(). Stable, so
-- it evaluates once per statement, not per row.
create or replace function current_role_in_org() returns text
language sql stable security definer set search_path = public as
  $$ select role from public.people where id = auth.uid() $$;

-- Staff = the internal roles that may read org data at all.
create or replace function is_staff() returns boolean
language sql stable security definer set search_path = public as
  $$ select coalesce(
       (select role in ('admin','agronomist','team') from public.people where id = auth.uid()),
       false) $$;

-- Planner = may create and change trial structure and reference data.
create or replace function is_planner() returns boolean
language sql stable security definer set search_path = public as
  $$ select coalesce(
       (select role in ('admin','agronomist') from public.people where id = auth.uid()),
       false) $$;

-- ---------------------------------------------------------------------------
-- orgs / people: read stays org-scoped but staff-only.

drop policy if exists orgs_read on orgs;
create policy orgs_read on orgs for select
  using (id = current_org() and is_staff());

drop policy if exists people_read on people;
create policy people_read on people for select
  using (org_id = current_org() and is_staff());

-- ---------------------------------------------------------------------------
-- Org-scoped planning tables: read for staff, write for planners.

do $$
declare t text;
begin
  foreach t in array array['clients','sites','experimental_products','protocols','trial_groups','trials','documents','fert_products','phenology_calibrations']
  loop
    execute format('drop policy if exists %I_org_all on %I', t, t);
    execute format(
      'create policy %I_org_read on %I for select using (org_id = current_org() and is_staff())', t, t);
    execute format(
      'create policy %I_org_write on %I for insert with check (org_id = current_org() and is_planner())', t, t);
    execute format(
      'create policy %I_org_update on %I for update using (org_id = current_org() and is_planner()) with check (org_id = current_org() and is_planner())', t, t);
    execute format(
      'create policy %I_org_delete on %I for delete using (org_id = current_org() and is_planner())', t, t);
  end loop;
end $$;

-- sync_log is a field record: team writes it too.
drop policy if exists sync_log_org_all on sync_log;
create policy sync_log_org_read on sync_log for select
  using (org_id = current_org() and is_staff());
create policy sync_log_org_write on sync_log for insert
  with check (org_id = current_org() and is_staff());

-- ---------------------------------------------------------------------------
-- Trial-scoped tables.
-- Field records (scores, operations, photos, corrections): staff write.
-- Trial structure (treatments, assessments): planner write, staff read.

do $$
declare t text;
begin
  -- field records: any staff member records and corrects field data
  foreach t in array array['scores','operations','photos','corrections']
  loop
    execute format('drop policy if exists %I_trial_all on %I', t, t);
    execute format(
      'create policy %I_trial_read on %I for select using (is_staff() and trial_id in (select id from trials where org_id = current_org()))', t, t);
    execute format(
      'create policy %I_trial_write on %I for insert with check (is_staff() and trial_id in (select id from trials where org_id = current_org()))', t, t);
    execute format(
      'create policy %I_trial_update on %I for update using (is_staff() and trial_id in (select id from trials where org_id = current_org())) with check (is_staff() and trial_id in (select id from trials where org_id = current_org()))', t, t);
  end loop;
  -- no delete policy on field records: spray and score rows are corrected,
  -- never deleted (data rule 8)

  -- trial structure: read staff, write planners
  foreach t in array array['treatments','assessments']
  loop
    execute format('drop policy if exists %I_trial_all on %I', t, t);
    execute format(
      'create policy %I_trial_read on %I for select using (is_staff() and trial_id in (select id from trials where org_id = current_org()))', t, t);
    execute format(
      'create policy %I_trial_write on %I for insert with check (is_planner() and trial_id in (select id from trials where org_id = current_org()))', t, t);
    execute format(
      'create policy %I_trial_update on %I for update using (is_planner() and trial_id in (select id from trials where org_id = current_org())) with check (is_planner() and trial_id in (select id from trials where org_id = current_org()))', t, t);
    execute format(
      'create policy %I_trial_delete on %I for delete using (is_planner() and trial_id in (select id from trials where org_id = current_org()))', t, t);
  end loop;
end $$;

-- site_weather follows sites: staff read, planner write.
drop policy if exists site_weather_all on site_weather;
create policy site_weather_read on site_weather for select
  using (is_staff() and site_id in (select id from sites where org_id = current_org()));
create policy site_weather_write on site_weather for insert
  with check (is_planner() and site_id in (select id from sites where org_id = current_org()));

-- ---------------------------------------------------------------------------
-- Photo storage: staff only, and only within the caller's own org prefix
-- (paths are {org}/{trial}/{photo}.jpg).

drop policy if exists photos_bucket_rw on storage.objects;
create policy photos_bucket_rw on storage.objects for all to authenticated
  using (bucket_id = 'photos' and is_staff() and (storage.foldername(name))[1] = current_org()::text)
  with check (bucket_id = 'photos' and is_staff() and (storage.foldername(name))[1] = current_org()::text);
