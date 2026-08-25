-- ===========================================================================
-- 004 — Close open signup, scope the photo bucket, least-privilege roles
--
--   *** PREPARED, NOT YET APPLIED. Read docs/HOSTING-BRIEF.md first. ***
--
-- What 001 does today, and why it has to change before anyone else touches
-- the project:
--
--   * `handle_new_user()` puts EVERY new auth user into the AGnVET org as
--     `agronomist`. Email signup is on with autoconfirm, so anyone who finds
--     the project URL + publishable key (both public, in the deployed JS
--     bundle) can create an account and read/write every trial, site, client,
--     score and photo record in the org. RLS is working exactly as written —
--     the problem is that the front door lets anyone become an org member.
--   * `photos_bucket_rw` grants any authenticated user full access to the
--     whole bucket with no org scoping.
--
-- This migration replaces both with invite-only provisioning and an
-- org-partitioned bucket. Run it in the Supabase SQL editor, then ALSO turn
-- OFF Authentication → Sign In / Up → "Allow new users to sign up" in the
-- dashboard: the trigger is defence in depth, the dashboard toggle is the
-- actual front door.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Who is allowed in, and as what

create table if not exists allowed_signups (
  email       text primary key,
  org_id      uuid not null references orgs,
  role        text not null default 'team' check (role in ('admin','agronomist','team','grower','rep')),
  invited_by  text,
  invited_at  timestamptz not null default now(),
  claimed_at  timestamptz
);

alter table allowed_signups enable row level security;

-- Only admins of the org can see or manage invitations.
drop policy if exists allowed_signups_admin on allowed_signups;
create policy allowed_signups_admin on allowed_signups for all
  using (org_id = current_org()
         and exists (select 1 from people p where p.id = auth.uid() and p.role = 'admin'))
  with check (org_id = current_org()
         and exists (select 1 from people p where p.id = auth.uid() and p.role = 'admin'));

-- Seed the invitations you actually want. Add one row per real person —
-- replace these with the pilot list before running.
--
-- insert into allowed_signups (email, org_id, role, invited_by) values
--   ('andrewrolfe@agnvet.com.au', '00000000-0000-0000-0000-000000000001', 'admin',      'setup'),
--   ('someone.else@agnvet.com.au', '00000000-0000-0000-0000-000000000001', 'agronomist', 'setup')
-- on conflict (email) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Signup trigger: invited addresses only, role from the invitation
--
-- An uninvited signup no longer becomes an org member. The auth user is
-- still created (Auth owns that table), but with no `people` row
-- current_org() returns null and every RLS policy denies — they see nothing.

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare inv allowed_signups%rowtype;
begin
  select * into inv from public.allowed_signups
   where lower(email) = lower(new.email);

  if not found then
    -- Uninvited: no org membership, therefore no data access.
    return new;
  end if;

  insert into public.people (id, org_id, name, email, role)
  values (
    new.id,
    inv.org_id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email,
    inv.role
  )
  on conflict (id) do nothing;

  update public.allowed_signups set claimed_at = now() where email = inv.email;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Retro-check: who is already in the org?
--
-- 001 has been live with open signup, so review the existing membership and
-- remove anyone who should not be there. Run this SELECT first, then delete.
--
--   select id, email, role, created_at from people order by created_at;
--   delete from people where email not in (select email from allowed_signups);
--
-- Deleting the `people` row revokes all data access. Also delete the matching
-- auth user (Authentication → Users) so the login itself stops working.

-- ---------------------------------------------------------------------------
-- 4. Photo bucket: partition by org, not "any authenticated user"
--
-- Object paths become `{org_id}/{trial_id}/{photo_id}.jpg` (see
-- src/lib/backend.ts). The first path segment is the org, so the policy can
-- scope on it. No blobs have been uploaded yet, so there is nothing to move.

drop policy if exists photos_bucket_rw on storage.objects;

create policy photos_bucket_org_read on storage.objects for select to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = current_org()::text);

create policy photos_bucket_org_write on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = current_org()::text);

create policy photos_bucket_org_update on storage.objects for update to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = current_org()::text)
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = current_org()::text);

-- Deliberately no delete policy: field photos are trial evidence. Removal is
-- an admin action through the dashboard, not something a phone can do.
