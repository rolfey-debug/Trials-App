-- ===========================================================================
-- Fix: current_org() must be SECURITY DEFINER — without it the people RLS
-- policy calls back into current_org() and recurses (stack depth errors on
-- every query). Run once in the SQL editor; also prints seed verification.
-- ===========================================================================

create or replace function current_org() returns uuid
language sql stable security definer set search_path = public as
  $$ select org_id from public.people where id = auth.uid() $$;

-- Verification (runs as postgres, bypasses RLS): expect 1 org, 2 sites, 2 trials
select
  (select count(*) from orgs)   as orgs,
  (select count(*) from sites)  as sites,
  (select count(*) from trials) as trials,
  (select count(*) from people) as people;
