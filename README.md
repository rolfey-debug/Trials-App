# AGnVET Trial Work

A mobile-first, **offline-first PWA** for AGnVET Services (IK Caldwell) small-plot trial work — **spray** (mixing checklists, spray order, conditions records, issue logging), **assess** (GPS-assisted plot-by-plot scoring, photos, voice) and **present** (field-day walk mode, reports, exports).

The core promise: *stand in a plot and the app knows which one* — GPS surfaces the nearest trial and checks the assessor's row while the walk order auto-advances.

Built from the design handoff in [`docs/handoff/`](docs/handoff/HANDOFF.md) — all 14 screens of `design/Phone.dc.html` recreated pixel-faithfully, seeded with the real Matong wheat fungicide trial (`fixtures/matong-trial.json`).

**Also in this repo — the office portal** ([`portal/`](portal), design handoff in [`docs/handoff-office/`](docs/handoff-office/README.md)): the desktop companion where trials are planned — dashboard, 6-step trial wizard, product picker over the full APVMA register (7,841 registered products with actives, `shared/products/`), seeded randomisation with layout preview (`shared/randomisation.ts`), documents/protocol workspace, review-and-approve flow, and a trial map with imagery layers. Deployed at **`/office/`** next to the field app.

```bash
npm run portal:dev            # portal dev server
npm run portal:build          # → portal/dist
node test/portal-walkthrough.mjs   # Playwright walkthrough of all 8 portal screens
```

## Run it

```bash
npm install
npm run dev        # dev server
npm run build      # type-check + production build → dist/
npm run preview    # serve the production build
npm test           # parser + geometry tests against the real fixtures
node test/walkthrough.mjs   # Playwright end-to-end walkthrough (needs `npm run preview` running)
```

Deploy `dist/` to any static host. The service worker caches the app shell + assets on first visit; everything after that works with no signal. Install to home screen from the browser menu.

**Sign in:** a password of 6+ characters signs in against the live Supabase project (see *Backend* below); anything shorter enters the offline demo without touching the backend. The app boots into the seeded Matong trial with demo scores; **Storage & sync → reset demo data** clears to a clean season.

## The 14 screens

| Screen | What's real |
| --- | --- |
| **Login** | Session persists offline in IndexedDB; role explainer |
| **Today** | Live GPS pill, nearest-trial distance from pinned site geofence, real sync-queue counts, trial switcher, add-a-trial |
| **Assess** | The deep flow: serpentine walk order (72 stops), measure chips + editable measure library, 3×4 pad with per-measure caps (% = 100, counts = 999), *Same as last*, photo capture (compressed ~300 KB to IndexedDB), voice fill (Web Speech API, demo fallback), notes, blind-scoring toggle, GPS row verification — ≤6 m green "on walk order", >6 m amber "row check only", row-mismatch warning when the pinned grid disagrees |
| **Map** | Full cell-state rendering (treated / assessed / A-only edge / OUT / skip / spare / reserve / marginal / issue / selected), rep bands from the trial spec, bottom sheet with status lines, ⚑ log spray issue |
| **Spray day** | Mix checklist with per-batch mL derived from recipes (`rate ÷ water × batch`), spray order with plot lists + A-ONLY chips, editable conditions record, issues tab with badge |
| **Spray issues** | Wrong-bottle fix actions — *relabel as applied* updates the plot's effective treatment **everywhere** (map cell, assess header, exports flag original + corrected) — or *exclude from analysis*; every fix appends to the correction log |
| **Add a trial** | Real on-device parsers: **spray-map PDF** (text extraction + grid/allocation-table reconstruction — parsing `fixtures/Matong_Wheat_Spray_Map.pdf` reproduces `matong-trial.json` exactly, verified in tests), **mixing plan .xlsx** (treatments, rates, per-batch volumes, A/B timings), **ARM .csv**, **protocol .docx** (best-effort), start blank |
| **Site setup** | Two-corner GPS mapping with fix averaging; A→B = front-edge bearing; every plot gets a lat/lng polygon; locate = point-in-polygon with row-level confidence when accuracy exceeds plot width; demo corners when GPS is unavailable so the flow still works |
| **Site details** | Editable cooperator / paddock / fertiliser / notes — feeds the report's site page |
| **Plot photos** | Real captures render from IndexedDB blobs; flag filter; tap to flag for the report |
| **Storage & sync** | Real queue counts by kind, on-phone stats, rules toggles, reset demo data |
| **Team & access** | Role pills with per-role descriptions, invite flow appends pending logins |
| **Reports & export** | Blind-codes toggle; ranked-control preview flips from labelled SAMPLE DATA to live means once enough real scores exist; **Excel export** is a real `.xlsx` matching `fixtures/Junee_Field_Assessment.xlsx` (Plot #, Block, Trt #, Treatment, App A/B, measure columns, Assessor, Photo?, Notes + Treatment Data + Correction Log tabs); client PDF report + field-day handout render to print views (print → save as PDF) |
| **Field-day walk** | Rep 1 walk (24 stops), severity comparison vs untreated, % control strip, GPS position line |

## Architecture

```
src/
  theme.ts             design tokens (AGnVET brand May 2026)
  store/
    types.ts           entities per the handoff spec (Org→…→SyncQueueItem)
    idb.ts             IndexedDB wrapper (state doc + photo blobs)
    seed.ts            Matong seed + demo state
    store.tsx          React context; every mutation writes locally (<100 ms)
                       and enqueues a sync item
  gps/
    geo.ts             haversine/bearing/destination, two-corner grid layout,
                       point-in-polygon locate with row-level confidence
    useGps.tsx         watchPosition + fix averaging; simulated ±4 m fallback
  lib/                 walk orders, measure library, batch math, photo compression,
                       ranked-control results
  parsers/             pdfText (Flate/ASCII85 streams → text items), sprayMapPdf,
                       xlsxRead (fflate + minimal XML), mixingPlan, ARM csv, docx
  exports/             xlsxWrite (minimal writer), assessmentExport (Junee-shaped
                       workbook), printouts (client report + handout)
  screens/             one component per design screen
test/
  parsers.test.ts      fixture-validated: PDF parse ≡ matong-trial.json, mixing
                       plan volumes, export round-trip, grid locate
  walkthrough.mjs      Playwright drive-through of every screen and key flow
```

**Offline-first**: all writes land in IndexedDB immediately; the sync queue tracks what still needs the portal. **Backend**: Supabase (Postgres + Auth + Storage) is wired for the field app — real sign-in, and `Sync now` pushes scores, corrections, photo *metadata* and spray records as idempotent upserts under org-scoped row-level security (`shared/supa.ts`, `src/lib/backend.ts`, `docs/portal/BACKEND.md`). Still outstanding: photo *blobs* stay on the phone, and the portal renders fixture data rather than reading Postgres. Conflict policy per the spec: last-write-wins per field with full history.

**Not production-ready yet** — see [`docs/HOSTING-BRIEF.md`](docs/HOSTING-BRIEF.md) for the open access-control, hosting and governance items to settle before this runs on real trials beyond the pilot.

## Decisions & deviations

- **Wordmark, not logo**: the prototypes use a text wordmark; the brand logo (`docs/handoff/brand/AGnVET-logo.pdf`) should replace it in production per the guidelines (coloured logo on white only).
- **Fonts**: Mulish + IBM Plex Mono from Google Fonts (the handoff's web stand-ins for Proxima Nova); Arial is the approved fallback and is what renders offline before the font cache fills.
- **Parsing runs on-device** rather than server-side (no backend in this repo). The PDF text extractor covers ReportLab/print-style PDFs; scanned maps would need the portal's OCR.
- **Client PDF report** renders to a print window (print → save as PDF) instead of a server-generated file; the Excel export is a true `.xlsx`.
- **Demo seed**: the app first-runs with the design's demo state (12 plots scored, 2 spray issues) so every screen shows its intended content; *reset demo data* clears it.

## Fixtures

Real documents from the handoff, used as parser inputs and test oracles — see [`fixtures/`](fixtures/): the Matong spray map PDF, mixing plan rev. D, the Junee assessment workbook (export shape), and `matong-trial.json` (canonical trial data).
