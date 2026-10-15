-- ===========================================================================
-- 009 — Generated documents: wider `documents.kind` and a private bucket
-- ---------------------------------------------------------------------------
-- The office portal now prints the trial plan, spray plan, signs and
-- assessment sheets from the record. Saving a printout keeps the exact page
-- that went to the printer beside the trial: the HTML goes to a private,
-- org-partitioned `documents` bucket (same policy shape as `photos`, 004)
-- and a `documents` row indexes it with kind + options in `parsed`.
-- Additive only: the check constraint gains values, nothing is dropped.
-- ===========================================================================

alter table public.documents drop constraint if exists documents_kind_check;
alter table public.documents add constraint documents_kind_check
  check (kind in ('spray-map','mixing-plan','arm-export','protocol','other',
                  'trial-plan','spray-plan','plot-signs','site-sign','assessment-sheet','report'));

insert into storage.buckets (id, name, public) values ('documents', 'documents', false)
  on conflict (id) do nothing;

drop policy if exists documents_bucket_org_read on storage.objects;
create policy documents_bucket_org_read on storage.objects for select to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = current_org()::text);
drop policy if exists documents_bucket_org_write on storage.objects;
create policy documents_bucket_org_write on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = current_org()::text);
drop policy if exists documents_bucket_org_update on storage.objects;
create policy documents_bucket_org_update on storage.objects for update to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = current_org()::text);
