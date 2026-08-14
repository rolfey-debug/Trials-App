-- ===========================================================================
-- Seed: Ringwood (Corowa) wheat fungicide trial 2026 — site + trial with the
-- fixed ids the apps reference (shared/supa.ts). Idempotent; safe to re-run.
-- The field app can also self-seed these rows through RLS, so this migration
-- is a fallback — run it once in the SQL editor if the rows aren't there.
-- ===========================================================================

insert into sites (id, org_id, property, town, lat, lng, paddock, soil)
values
  ('00000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000001',
   '‘Ringwood’', 'Corowa NSW', -35.99, 146.39, null, null)
on conflict (id) do nothing;

insert into trials (id, org_id, site_id, name, season, status, trial_type, crop, sown_date, aim)
values
  ('00000000-0000-0000-0000-000000000103', '00000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000013', 'Ringwood (Corowa) — Wheat Fungicide 2026', 2026, 'active',
   'plot', 'Wheat', null,
   'Sequential A+B foliar fungicide comparison in wheat: 24 treatments × 3 reps RCB, registered standards plus experimental actives (G295, Vimoy Iblon, CUF37) against the Soprano 500 base program.')
on conflict (id) do nothing;

-- Verification: expect 3 sites, 3 trials
select (select count(*) from sites) as sites, (select count(*) from trials) as trials;
