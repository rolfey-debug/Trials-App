-- ===========================================================================
-- 006: value corrections from the portal (score edits with an audit trail).
-- Applied to the live project 8 Oct 2026. Additive only: widens the kind
-- check and adds nullable columns; relabel/exclude rows are untouched.
-- ===========================================================================
alter table public.corrections drop constraint corrections_kind_check;
alter table public.corrections add constraint corrections_kind_check check (kind in ('relabel', 'exclude', 'value'));
alter table public.corrections add column if not exists measure text;
alter table public.corrections add column if not exists old_value numeric;
alter table public.corrections add column if not exists new_value numeric;
