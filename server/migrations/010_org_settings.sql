-- ===========================================================================
-- 010 — Org settings: a jsonb bag on `orgs` for office-side configuration
-- ---------------------------------------------------------------------------
-- First use: the Google OAuth client id the portal signs in with to push
-- saved printouts into Drive (`{"googleClientId": "...", "driveFolder": "..."}`).
-- A client id is public by design (it ships in the page); no secret lives
-- here. Anyone in the org may update it for now, matching the org-scoped
-- policies that are live (migration 005's role functions are not applied on
-- the Sydney project yet); tighten to is_planner() when 005 goes live.
-- Additive only.
-- ===========================================================================

alter table public.orgs add column if not exists settings jsonb not null default '{}';

drop policy if exists orgs_org_update on public.orgs;
create policy orgs_org_update on public.orgs for update
  using (id = current_org()) with check (id = current_org());
