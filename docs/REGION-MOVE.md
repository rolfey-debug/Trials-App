# Region move — rebuilding the backend in Sydney

**Why:** the live Supabase project is in the wrong AWS region, and Supabase pins
a project's region at creation — it cannot be changed. Trial data (grower names,
properties, site coordinates) belongs onshore, so the fix is a new project in
`ap-southeast-2` (Sydney) and a cutover.

**Why this is cheap right now:** the phones hold the authoritative copy of all
field data in IndexedDB, and every sync is an idempotent re-push by
deterministic row id. Nothing needs exporting from the old project — after the
swap, each phone's next **Sync now** rebuilds its rows in the new database.
The seeds (org, sites, trials) are recreated by the setup SQL.

**Bonus:** the old project is the one with the open-signup hole. The new
project is born locked (the setup SQL includes migration 004, and you turn the
signup toggle off before anyone knows the URL). Pausing/deleting the old
project then retires the hole rather than patching it.

## The steps

Human steps are marked 👤 (dashboard login required); everything else is done
in the repo.

1. 👤 **Create the project** — [supabase.com/dashboard/new](https://supabase.com/dashboard/new):
   pick the org, name it (e.g. `trials-app-au`), set **Region = Oceania (Sydney) /
   `ap-southeast-2`** — this is the whole point, double-check it — and generate a
   database password (store it in a password manager; the apps never use it, but
   admin tasks do).
2. 👤 **Close the front door before anything else** — in the new project:
   **Authentication → Sign In / Up → turn OFF "Allow new users to sign up"**.
3. 👤 **Run the setup SQL** — open the new project's **SQL editor**, paste the
   whole of [`server/fresh-project.sql`](../server/fresh-project.sql)
   (regenerate any time with `npm run sql:fresh`), **edit the INVITED PEOPLE
   block at the very end** (one row per real person, correct roles), Run.
4. 👤 **Copy the new credentials** — Project **Settings → API Keys**: the
   **Project URL** (`https://<ref>.supabase.co`) and the **publishable** key
   (`sb_publishable_…`). Only ever the publishable key — the secret/service
   key never goes near the repo.
5. **Swap the constants** — `SUPA_URL` and `SUPA_KEY` at the top of
   [`shared/supa.ts`](../shared/supa.ts) are the single source of truth for
   both apps and `server/check-db.mjs`. Verify before committing:

   ```bash
   SUPA_URL=https://<newref>.supabase.co SUPA_KEY=sb_publishable_… node server/check-db.mjs
   ```

   Expect: `auth health: ok`, `migration: applied`, `email signup: off`.
   Then commit the edit and deploy.
6. **Re-sign-in + re-sync** — everyone signs in again on their phone (sessions
   belong to the old project) and hits **Storage & sync → Sync now**. Check the
   rows arrived: `node server/check-db.mjs` after a sync, or look at the
   `scores` / `operations` tables in the dashboard.
7. 👤 **Retire the old project** — old project → **Settings → General →
   Pause project**. Delete it once you're comfortable (a week of the new one
   working is plenty). Deleting it closes the open-signup exposure for good.

## What carries over and what doesn't

| | Carries over? | How |
|---|---|---|
| Schema, RLS, seeds (org/sites/trials) | ✔ | `fresh-project.sql` |
| Field data (scores, corrections, spray records, photo metadata) | ✔ | phones re-push on next sync |
| Photo files | ✔ (trivially) | blobs never left the phones yet |
| User accounts | ✘ — recreated | people sign in once; the invite list assigns their role |
| Old project's synced rows | ✘ — abandoned | they are a copy of what the phones still hold |

One real loss: `sync_log` history in the old project (a handful of test pushes).
It is diagnostic, not trial data.
