-- 013: keep a photo's own timestamp whatever the phone sends.
--
-- Phone photo ids end in the epoch ms the photo was taken, and the storage
-- path carries the id. A phone running a build older than 29 Oct 2026 sends
-- the sync time as taken_at on every push and overwrote the real dates for
-- three trials twice (29 Oct and 5 Nov 2026, restored by hand both times).
-- This trigger derives taken_at from the path on every insert or update, so
-- a stale build can no longer move a photo's date. Photos whose id has no
-- epoch (seed photos) are left as sent.

create or replace function public.photo_taken_at_from_path() returns trigger
language plpgsql as $$
declare
  ms text;
begin
  ms := (regexp_match(new.storage_path, '-(\d{13})\.jpg$'))[1];
  if ms is not null then
    new.taken_at := to_timestamp(ms::bigint / 1000.0);
  end if;
  return new;
end;
$$;

drop trigger if exists photos_taken_at_guard on public.photos;
create trigger photos_taken_at_guard
  before insert or update of taken_at, storage_path on public.photos
  for each row execute function public.photo_taken_at_from_path();
