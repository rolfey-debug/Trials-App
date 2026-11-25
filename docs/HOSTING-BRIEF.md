# Taking Trial Work to IT — readiness brief

**Status:** working prototype, deployed publicly, backed by a live database.
**Purpose of this doc:** everything to settle before, during and after the conversation with IT.
**Last reviewed:** 20 August 2026 · against commit `4d5bc88`

---

## 1. The 60-second version

We have two working web apps sharing one Postgres database:

| | What it is | Where it runs today |
|---|---|---|
| **Field app** | Offline-first phone PWA — spray checklists, GPS plot-by-plot assessment, photos, field-day walk mode, Excel/PDF export | `rolfey-debug.github.io/Trials-App/` |
| **Office portal** | Desktop companion — trial wizard, randomisation, APVMA product picker, protocol docs, review & approve, trial map | `rolfey-debug.github.io/Trials-App/office/` |
| **Backend** | Supabase (managed Postgres + Auth + file storage), org-scoped row-level security | project `ebhsnggwekhfcpgnyxxs` (Sydney) |

It is real software, not a clickable mock-up: ~7,800 lines of TypeScript, 44 automated
checks plus three end-to-end browser walkthroughs, both apps building green in CI. The
Ringwood (Corowa) 2026 fungicide trial — 24 treatments × 3 reps — is loaded end to end
from the office workbook, with per-batch mixing volumes verified to the millilitre
against the source spreadsheet.

**What it is not yet:** hosted anywhere AGnVET controls, protected by AGnVET identity,
backed up on any agreed schedule, or supported by anyone but me.

That gap is the entire agenda for the IT meeting.

---

## 2. Three things to fix *before* you walk in

These are live right now. Two of them are the kind of thing an IT person will find in
the first ten minutes, and finding them yourself first changes the tone of the whole
conversation.

### 2.1 Anyone on the internet can create an account with full access 🔴

The database is reachable at a public URL with a publishable key that ships inside the
JavaScript bundle — that part is by design and is fine, because row-level security is
supposed to be the gate. The problem is the gate itself:

- Email signup is **on**, with **auto-confirm on** (verified against the live project).
- The signup trigger in `001_init.sql` puts *every* new account into the AGnVET org as
  `agronomist`.
- Row-level security then correctly grants org members full read/write to every trial,
  site, client, score, photo record and spray record.

So: sign up with any email address, no confirmation step, and you are inside. There is
no evidence anyone has, and the data currently in there is two demo trials and one real
one — but it needs closing before it is discussed in a room, and certainly before real
grower data goes in.

**Fix, prepared and ready to paste:** [`server/migrations/004_close_open_signup.sql`](../server/migrations/004_close_open_signup.sql).
It replaces open signup with an invitation allowlist, takes the default role down from
`agronomist` to `team`, and partitions the photo bucket by org instead of granting every
authenticated user the whole bucket. Running it is a manual step in the Supabase SQL
editor — I have not applied it, because it changes who can log in and that is your call.

Also required, and **not** something SQL can do: in the Supabase dashboard, turn off
**Authentication → Sign In / Up → Allow new users to sign up**. The trigger is defence in
depth; the dashboard toggle is the actual front door.

And review who is already in there — `select id, email, role, created_at from people order by created_at;`

### 2.2 The repository is public, and it has real customer data in it 🟠

`github.com/rolfey-debug/Trials-App` is a **public** repo on a personal account. In it:

- Named cooperators and properties — *Doyle Bros · 'Glenview', Matong*; *'Ringwood', Corowa*
- Site coordinates (−34.768, 146.929)
- A staff email address pre-filled in the login screen
- The AGnVET brand style guidelines PDF and logo artwork
- Real trial workbooks: the Ringwood 2026 fungicide plan, the Matong spray map, the Junee assessment sheet

None of it is catastrophic, but it is client information and company brand assets sitting
on the open internet under a personal account, and it is exactly what a security review
will pick up.

**Fix:** make the repo private. One caveat worth knowing before you do it — GitHub Pages
serving from a *private* repo needs a paid GitHub plan (Pro/Team/Enterprise). On the free
plan, making it private takes the site down. So sequence it: decide hosting (§3.2) first,
or accept a short outage.

Note that making a repo private does **not** erase the history from anyone who already
cloned or from forks. For the brand assets and workbooks that is an acceptable risk; if
IT disagrees, the answer is a fresh repo with a clean history, not a rewrite.

### 2.3 Everything is owned by one personal account 🟠

The GitHub repo, the Supabase project, the deployment, the domain-that-doesn't-exist-yet
— all of it sits under personal logins. If you are unavailable, nobody can patch it, and
if you leave, it leaves with you. IT will ask this question within the first five
minutes, so bring the answer rather than receiving it.

**Fix:** transfer both into AGnVET-owned org accounts. This is a genuine agenda item for
the meeting rather than something to do beforehand, because it needs their tenancy.

---

## 3. The decisions IT actually owns

Bring these as decisions to be *made*, with a recommendation attached to each. That is a
much better meeting than "here's an app, what do you think".

### 3.1 Identity — how do people sign in?

Today it is email + password held in Supabase, self-provisioned. That is a parallel
identity system, which IT will not love: no offboarding, no MFA policy, no central
control.

| Option | Pros | Cons |
|---|---|---|
| Keep Supabase email/password + invite allowlist | Zero dependency on their systems; works for growers and reps who have no AGnVET account | Second password for staff; manual offboarding |
| **Microsoft Entra ID (M365) SSO** ← recommended for staff | Existing accounts, existing MFA, offboarding is automatic when the account is disabled | Needs an app registration from IT; external users (growers, reps) still need the local path |
| Both, by role | Staff via SSO, external viewers via invited local accounts | Two code paths to maintain |

**Recommendation:** ask for an Entra ID app registration for staff, keep invited local
accounts for growers/reps/contractors. Supabase supports Azure/Entra as an OIDC provider,
so this is configuration rather than a rewrite. Worth confirming AGnVET is an M365 shop
before recommending it — if they run Google Workspace, the same argument applies with
Google as the provider.

**Ask IT:** who creates and removes accounts, what MFA is required, what happens to a
casual/seasonal worker's access at the end of the season.

### 3.2 Where does the web app live?

It is a static site — HTML, JS, CSS, no server to run. That makes it cheap and portable
almost anywhere.

| Option | Fit | Rough cost |
|---|---|---|
| GitHub Pages (today) | Works, but tied to a personal account; needs a paid plan once the repo is private; no access control in front of it | Free–US$4/user/mo |
| **Azure Static Web Apps** | Natural if they are a Microsoft shop; Entra ID auth built in; custom domain + certificate included | Free tier, or ~US$9/app/mo |
| Cloudflare Pages + Access | Cheapest way to put SSO in front of the *office portal* specifically | Free at this scale |
| Their existing web hosting | Uses what exists; may not do SPA routing or auto-deploy | — |

**Recommendation:** Azure Static Web Apps if they are on Microsoft, Cloudflare Pages
otherwise. Either way the build stays in GitHub Actions and just publishes somewhere else
— that is a ten-line change to the workflow.

One thing to raise explicitly: **the field app must stay publicly reachable** (no VPN, no
network restriction) because it has to load in a paddock on mobile data. Authentication
happens *inside* the app. The office portal is a different matter and could reasonably sit
behind SSO at the network edge.

### 3.3 Where does the database live? — *confirmed wrong, rebuild in progress*

Supabase runs on AWS, and **the region is chosen at project creation and cannot be
changed afterwards**. The live project has been checked and **is not in Sydney**, so it
is being recreated in `ap-southeast-2` before real data accumulates — the runbook is
[`docs/REGION-MOVE.md`](REGION-MOVE.md) and the one-paste setup SQL is
[`server/fresh-project.sql`](../server/fresh-project.sql). The move is cheap precisely
because it is happening now: phones hold the authoritative data and re-push idempotently,
so nothing is exported — and retiring the old project closes the §2.1 signup hole with it.
By the time of the IT meeting the answer to "where is the data?" should simply be
"Sydney".

Data residency will be the first question from anyone who has been through a privacy
review, so have the answer in hand.

Also worth settling: free tier vs Pro. The free tier pauses projects after a week of
inactivity and has no point-in-time recovery — neither is acceptable for a system holding
season-long trial records. Assume Pro.

**Alternative worth naming, so it doesn't get raised as a gotcha:** the schema is plain
Postgres. If IT would rather host it themselves (Azure Database for PostgreSQL, or an
existing server), the tables and row-level security move across; what you would lose is
Supabase's auth and file storage, which would then need replacing. My recommendation is
managed Supabase — but knowing the exit path is what makes that a decision rather than a
lock-in.

### 3.4 Domain and certificate

Something like `trials.agnvet.com.au` — a DNS record IT creates, plus a certificate the
host issues automatically. Small, but it needs to be on the list, and it should happen
before phones start installing the app to their home screens: a PWA's stored data is tied
to its origin, so **changing the domain later means every phone re-installs and loses its
local queue**. Get the address right before the pilot, not after.

### 3.5 Devices

- Which phones? Company-issued or personal (BYOD)? BYOD raises the question of company data on a personal device, and of what happens to it when someone leaves.
- Are they managed (Intune or similar)? Can the app be pushed to the home screen centrally, or does each person install it themselves?
- **iOS is the constraint to check.** Home-screen PWAs on iOS have historically had tighter limits on background behaviour and on how long stored data survives when storage runs low. Our data lives in IndexedDB until it syncs, so this matters: confirm the iOS version in the field, and treat "sync before you leave the paddock" as an operating procedure, not just a nicety.
- Camera, GPS and microphone permissions — the app needs all three. On managed devices these can be policy-blocked.
- What happens when a phone is lost? Unsynced assessments are gone; anything already synced is safe. Remote wipe is IT's answer, if the devices are managed.

### 3.6 Backup, recovery and retention

Currently: none of this is agreed. Supabase Pro takes daily backups and offers
point-in-time recovery as an add-on, but nobody has decided the requirement or tested a
restore.

**Bring a proposal:** daily backup, 30-day retention, point-in-time recovery on, and a
restore actually tested once before the pilot ends. Untested backups are not backups.

Retention is a business question too: trial records support product recommendations and
sometimes disputes, so they are probably kept for years, not months. That should be a
stated policy rather than an accident of whatever the platform defaults to.

### 3.7 Monitoring and support

Nobody is watching this. There is no error tracking, no uptime alerting, and no support
path beyond "text Andrew". For a pilot that is survivable if it is *stated*; for anything
wider it is not.

**Bring a proposal:** error tracking (Sentry's free tier is enough at this size), an
uptime check on both URLs, and an agreed answer to "the app won't sync and I'm standing in
a paddock at 6am" — who gets called, and what they can actually do.

### 3.8 Environments and releases

Right now there is one environment, and a push to the branch deploys straight to the thing
people would be using. That is fine for a prototype and not fine once someone depends on
it.

**Bring a proposal:** a staging deployment plus a separate Supabase project for test data,
so nothing gets tried out against real trials. Note that service workers roll updates out
automatically on next load — good for shipping fixes, but it means a bad release reaches
every phone quickly, which is the argument for staging.

---

## 4. What IT will ask you — with draft answers

Have these ready. They are the standard shape of a vendor/security review, and most of
them have good answers already.

**"What data does it hold, and is any of it personal information?"**
Trial designs, treatments and products; plot-level assessment scores; photos of crops;
GPS coordinates of trial sites; spray records including operator, date, weather
conditions; user accounts (name, email, role). Cooperator/grower names, properties and
contact details are **personal information** under the Privacy Act, so the app is in scope
for the Australian Privacy Principles. No payment data, no health data.

**"Where is it stored, and does it leave Australia?"**
Postgres in Supabase (AWS). The original project was created in the wrong region; it is
being rebuilt in Sydney (`ap-southeast-2`) per [`docs/REGION-MOVE.md`](REGION-MOVE.md),
so the answer at meeting time is "Sydney". Photo *files* currently never leave the phone;
only metadata syncs. Keeping the region pinned onshore closes the APP 8 (cross-border
disclosure) question before it is asked.

**"Who can see what?"**
Row-level security scopes every table to the user's organisation, enforced by the database
rather than the app, so a compromised client can't read past it. Five roles are defined
(admin, agronomist, team, grower, rep). **Honest caveat:** the roles exist in the schema
and in the UI, but the per-role restrictions are not yet enforced in the database policies
— today any org member effectively has agronomist-level access. That is on the gap list
(§6) and should be closed before growers or reps are given logins.

**"What third parties are involved?"**
See the register in §5. Short version: at runtime, Supabase (database/auth/storage)
and GitHub (hosting) — nothing else; the webfonts that used to load from Google are now
self-hosted. Build-time only, no runtime dependency: APVMA product register via
data.gov.au, and SILO climate data from the Queensland Government for the phenology
model.

**"What happens if it breaks, or if you're not here?"**
Currently: it stays broken. This is the honest weak point and it is better to say so than
to be caught. The mitigations to propose are the code and infrastructure sitting in
AGnVET-owned accounts, documentation in the repo, and an agreed second pair of hands —
internal or contracted.

**"What does it cost?"**
See §7. Order of magnitude: a few hundred dollars a year in infrastructure. The real cost
is maintenance time.

**"Has it been security reviewed / penetration tested?"**
No. For a pilot with a handful of internal users that is a reasonable position to state
plainly. Offer instead: the open-signup fix (§2.1), role enforcement in the database (§6),
and a review before external users get access.

**"Is there record-keeping law involved?"**
Worth raising before they do. The spray conditions record the app captures — product,
rate, date, time, wind, temperature, operator — is close to what state control-of-use
legislation requires for agricultural chemical application (NSW and Victoria both mandate
records be made promptly and retained for a period of years). If the app becomes the place
those records live, its retention, backup and tamper-evidence requirements go up. Check the
exact obligations with whoever owns chemical compliance — but flag it as a design input
now, because it is much cheaper to build for than to retrofit.

---

## 5. Dependency register

For the security questionnaire.

| Service | Used for | Runtime or build | Data it sees | Where |
|---|---|---|---|---|
| Supabase | Postgres, auth, file storage | Runtime | All trial + user data | AWS — region TBC |
| GitHub | Source, CI, Pages hosting | Build + runtime | Source code; the site | US |
| data.gov.au (APVMA PubCRIS) | Product register — 7,841 products | Build only | Nothing | AU |
| SILO / Long Paddock (QLD Gov) | Daily climate for phenology model | Build only | Site coordinates | AU |
| Google Maps | Satellite basemap in portal | **Not yet wired** | Would see map requests | — |

Two items closed since the first draft of this brief:

- **Google Fonts is gone from the register.** The two brand faces are now self-hosted (`npm run fonts:build`, files in `public/fonts/`), precached by the service worker, and redistributed under their SIL Open Font License with the licence text alongside. The apps make no runtime request to any third party except Supabase.
- **The APVMA CC-BY attribution** now appears in the product picker, linking the PubCRIS dataset on data.gov.au.

---

## 6. Known gaps — the honest list

Bring this. Volunteering the gaps is what makes the rest of the pitch credible, and every
one of these is a normal prototype-to-production item rather than a design flaw.

**Security and access**
- Open signup (§2.1) — fix prepared, not applied
- Roles defined but not enforced in database policies — every org member has full access
- Photo storage bucket not org-scoped until migration 004 runs
- No error monitoring, no audit trail of who viewed what

**Functional**
- **The office portal renders fixture data, not the database.** The dashboard, wizard and map all work as interfaces, but they read from a seeded file; only the connection-status chip actually talks to Postgres. Wiring the portal to real data is the single largest remaining piece of work.
- Photo *files* stay on the phone — only metadata syncs, so photos are not backed up anywhere and are lost with the device
- Trials created on a phone stay on that phone (only the three seeded trials have backend IDs)
- Google Maps basemap in the portal is a placeholder pending an API key and billing account
- Reports and PDFs render through the browser's print dialogue rather than being generated server-side
- Phenology model uses placeholder crop coefficients until calibrated against AGnVET's own stage observations
- Brand: the apps use a text wordmark; the guidelines require the supplied logo artwork

**Operational**
- One environment — no staging
- No backup policy, and no restore ever tested
- No automated dependency updates or vulnerability scanning
- Default branch is a feature branch; PR #1 is still open with the entire application in it (see §8)

---

## 7. Cost estimate

Order of magnitude, annual, for a pilot-to-small-production footprint. Verify current
pricing at signup.

| Item | Estimate |
|---|---|
| Supabase Pro | ~US$25/mo — needed for backups and to stop the project pausing |
| Point-in-time recovery add-on | Optional, meaningful uplift — decide against the retention requirement |
| Static hosting (Azure SWA / Cloudflare / GitHub) | Free to ~US$9/mo |
| GitHub plan, if the repo goes private with Pages | ~US$4/user/mo |
| Domain (or free as a subdomain of the existing one) | ~AU$20–40/yr |
| Error tracking | Free at this volume |
| Google Maps, if the portal map goes live | Pay-as-you-go with a monthly free allowance; needs a billing account and a restricted key |

**Infrastructure is roughly AU$600–900/year.** That is not the number that matters — the
real cost is who maintains it, and that belongs in the conversation as a resourcing
question rather than a line item.

**Storage sizing**, since it will come up: assessment scores are negligible (a 96-plot
trial with 4 assessments is well under a megabyte). Photos are the driver — about 300 KB
each compressed, so roughly 115 MB per trial-season if assessors photograph every plot at
every assessment. Ten trials a season is a bit over a gigabyte: past the free tier,
comfortably inside Pro.

---

## 8. Tidy-up, in the repo itself

Done in this change:

- Corrected the README — it still claimed the backend was not wired and that any password would sign you in, neither of which has been true since the Supabase work landed
- Stopped tracking TypeScript build artefacts (`*.tsbuildinfo`) that were committed by accident
- Added migration `004_close_open_signup.sql` — prepared, deliberately not applied
- Moved synced photo paths to `{org}/{trial}/{photo}.jpg` so the org-scoped bucket policy in 004 has something to scope on (no photo files exist yet, so nothing to migrate)
- **Merged PR #1** — `main` now carries the whole application, CI deploys from it, and the superseded feature branch was removed from the deploy trigger
- **Self-hosted the two webfonts** (`npm run fonts:build`) — no runtime third party except Supabase, and the brand faces now render offline from the first visit
- **Added the APVMA CC-BY attribution** to the product picker

Still needs a human (repo settings, no API for it here):

- **Flip the default branch to `main`** — Settings → General → Default branch → switch icon → `main`; then delete the old `claude/build-app-from-readme-e1hq80` branch
- **Make the repo private** — sequenced against the hosting decision (§2.2)

---

## 9. Your homework, before the meeting

The technical answers above are the easy half. These are the ones only you can answer, and
IT will ask all of them.

1. **Who is the business owner?** Not the builder — the person accountable for it existing. If that is you, say so; if it should be someone more senior, get them in the room.
2. **What exactly is the pilot?** How many trials, which sites, which people, over what period. "Ringwood and Matong, three assessors, the rest of the 2026 winter season" is a proposal. "We'd like to roll it out" is not.
3. **Timing against the season.** Ringwood's timing A spray is still pending. Decide honestly whether the pilot starts this season or next — an IT process that takes six weeks will not fit inside a spray window, and it is better to plan for that than to be disappointed by it.
4. **What does success look like?** Something measurable: assessments captured without paper, hours saved per trial, errors caught by the correction log. Without this the pilot ends in a vibe rather than a decision.
5. **Why this instead of what we do now?** Have the comparison ready — the current spreadsheet-and-paper process, and any commercial trial software that was considered. The strongest argument here is specific: the app reproduces the office mixing plan's per-batch volumes exactly, and it catches wrong-bottle errors at the plot with a correction log that follows through to the export. That is a quality-of-data argument, not a convenience one.
6. **Who maintains it?** The honest answer today is "me, informally". Decide what you are actually proposing — a supported internal tool, a contracted arrangement, or an experiment that is allowed to stop.
7. **Whose data is it?** Grower and cooperator data collected on their properties. Worth knowing whether existing trial agreements cover storing it in a system like this, and whether cooperators should be told.
8. **What's the budget ask, and who signs it?** §7 gives the infrastructure figure. The maintenance figure is the one that needs a sponsor.

---

## 10. Questions to ask them

Read these out. They make it a two-way conversation, and each one has a real decision
behind it.

1. Are we a Microsoft 365 shop? Can we get an Entra ID app registration for staff sign-in?
2. Where do you want a static site hosted — do we already have somewhere, or do we stand something up?
3. What is our position on customer data in a cloud service outside our tenancy? Does it have to be in Australia?
4. Can we get an AGnVET-owned GitHub organisation and a company-owned Supabase account, and transfer these into them?
5. Can you create `trials.agnvet.com.au` (or whatever we agree) and issue the certificate?
6. What is your requirement for backup frequency, retention and tested restore?
7. Are field phones managed? Can we push a home-screen app to them, and what are the camera/GPS/microphone permission policies?
8. What is your process for approving a new system like this — is there a form, a review, an approval board? How long does it take?
9. Who would be the IT contact if something breaks mid-season?
10. Would you rather we bring this in-house long-term, or contract the maintenance?

---

## Appendix — verifying the current state yourself

```bash
npm ci
npm test                     # 44 checks: parsers, randomisation, phenology, fixtures
npm run build:all            # type-check + both production builds
node server/check-db.mjs     # live backend: reachability, migration, signup settings
```

`check-db.mjs` is the one to run before the meeting — it prints the signup configuration
described in §2.1, so you can confirm for yourself whether it has been closed.
