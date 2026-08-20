# Backend setup (Supabase)

Project: `https://lwudweiuihcdksageaxs.supabase.co` — the publishable key is
embedded in the apps (`shared/supa.ts`); it is public by design and only
grants what row-level security allows.

> **Region move in progress:** this project is in the wrong AWS region and is
> being replaced by a fresh one in Sydney — see [`docs/REGION-MOVE.md`](../REGION-MOVE.md).
> For a brand-new project, skip the migration steps below and run
> `server/fresh-project.sql` (`npm run sql:fresh`) instead; it is 001+003+004
> in one paste, invite-only from the start.

## One manual step: apply the migration

1. Open the project's **SQL editor** (supabase.com dashboard → SQL editor).
2. Paste the whole of [`server/migrations/001_init.sql`](../../server/migrations/001_init.sql).
3. Run. (Once — it creates the schema, RLS, signup trigger, photo bucket,
   and seeds the AGnVET org + the Matong and Ganmain sites/trials.)

Optional but recommended for a smoother first sign-in:
**Authentication → Sign In / Up → Email → turn OFF "Confirm email"** —
otherwise the first sign-in from the field app sends a confirmation email
that must be clicked before the session goes live.

Check status any time with `node server/check-db.mjs`.

## How the apps use it

- **Field app**: the login screen now does real Supabase auth — an unknown
  email self-provisions an account (everyone lands in the AGnVET org as
  `agronomist`; adjust roles in the `people` table). Passwords shorter than
  6 characters skip the backend entirely and enter the offline demo, so
  nothing ever blocks field work. **Storage & sync → Sync now** pushes
  scores, corrections and photo metadata as idempotent upserts (stable ids,
  last-write-wins) plus a `sync_log` entry — safe to repeat after days
  offline. The local IndexedDB copy remains authoritative on the phone.
- **Portal**: the sidebar shows live backend state (connected / migration
  pending / offline). Reading trials + field data into the dashboard is the
  next wiring step now the tables exist.
- Seeded fixed ids (org, sites, the two 2026 trials) live in
  `shared/supa.ts` so field pushes land against the right rows.

## What stays client-side for now

- The APVMA product database ships as static JSON in both apps (fast,
  offline-friendly). Seeding the `products` table for server-side search
  needs a service-role key and can wait.
- Photo *blobs* stay in IndexedDB; only metadata syncs. Uploading originals
  to the `photos` storage bucket is wired-ready (bucket + policies exist).
