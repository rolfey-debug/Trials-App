# Office Portal — Groundwork

The portal is the desktop web app where trials are built, reviewed and
monitored; the existing phone PWA is where they're sprayed and assessed.
Both share one backend. This doc records the architecture decisions and
what's already built; the portal UI itself is being designed separately
and built from that handoff.

## Stack

- **Backend: Supabase** (Postgres + Auth + Storage + Realtime), as
  recommended in the original handoff. Schema: `server/schema.sql`.
  Row-level security scopes every table to the user's org; the APVMA
  product table is global read-only.
- **Portal frontend**: React + TypeScript + Vite (same toolchain as the
  phone app), desktop-first, living in this repo alongside the app so
  `shared/` is imported by both.
- **Shared logic** (`shared/`): randomisation engine, product search,
  entity types. Pure functions, fully tested, no framework dependencies.

## What's built (this commit)

| Piece | Where | Status |
|---|---|---|
| Postgres schema + RLS | `server/schema.sql` | ready to `supabase db push` |
| Randomisation engine | `shared/randomisation.ts` | CRD, RCBD, latin square, split-plot, factorial expansion; seedable + auditable; layout output matches the phone app's TrialDoc (rep bands, serpentine walk, spares) |
| Product database | `shared/products/products.json` | 7,841 registered ag products with actives + rates, generated from APVMA PubCRIS (CC-BY, updated weekly) via `npm run products:build` |
| Product search | `shared/products/search.ts` | ranked name/active/company search, experimental-product type, actives labels |
| Tests | `test/groundwork.test.ts` | 20 checks in `npm test` |

## Roles

| Role | Portal | Phone app |
|---|---|---|
| admin | everything + org/user management | everything |
| agronomist | build, review, approve trials; all data | everything |
| team | view protocols, enter data | spray + assess |
| grower | read-only: their trials' reports | walk mode |
| rep | read-only: shared trials | walk mode |

## Trial lifecycle

`draft → review → approved → active → complete → archived`

The wizard edits drafts. Approval locks design + treatments (changes after
approval go through the correction log, same as the field flow). Marking
**active** publishes the trial to phones: the app's existing `TrialDoc`
shape is generated server-side from `trials.design/layout` + `treatments`,
so the phone app needs no format changes.

## Sync protocol

The phone app already queues writes (scores, photos, corrections, spray
records) in IndexedDB. Sync = idempotent upsert by client-generated UUID
into `scores` / `photos` / `corrections`, one batch per push, logged in
`sync_log`. Conflicts: last-write-wins per (plot, measure, assessment) with
the losing value preserved in the audit payload — field data entry is
append-heavy, so this is safe in practice. Photos upload to Storage with
the row committed after the file lands.

## Products

- `npm run products:build` regenerates `products.json` from data.gov.au
  (weekly APVMA PubCRIS extract). The same script will feed the `products`
  table; the portal reads Postgres, the JSON is the seed + offline fixture.
- Experimental/coded products are org-scoped rows (`experimental_products`)
  with partial actives allowed; they appear in the same search results,
  flagged, and can be promoted to a registered pcode later without touching
  the trials that reference them (components store `{pcode|expId}`).

## Documents → wizard prefill

Uploaded sheets/docs/PDFs land in Storage with a `documents` row. The
existing on-device parsers (spray-map PDF, mixing-plan xlsx, ARM csv,
protocol docx) move server-side unchanged (they're pure TS) — parse output
is stored in `documents.parsed` and offered as wizard prefill, exactly like
the phone app's "Add a trial" flow but reviewable on a big screen.

## Next steps (after the design handoff)

1. Portal scaffold (`portal/`) + Supabase project provisioning (needs org
   Supabase account — user action).
2. Auth + org bootstrap, role-gated navigation.
3. Wizard screens per design → `trials.design` → randomisation engine →
   layout preview → approve/publish.
4. Product picker per design over `shared/products`.
5. Phone app: swap the auth stub + `syncNow()` to the Supabase client
   (queue shape already matches).
