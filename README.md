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
node test/guidance-drive.mjs  # scripted bike + second phone drive the guidance screen (needs preview running)
```

Deploy `dist/` to any static host. The service worker caches the app shell + assets on first visit; everything after that works with no signal. Install to home screen from the browser menu.

**Sign in:** any email/password works (offline auth stub — see *Backend* below). The app boots into the seeded Matong trial with demo scores; **Storage & sync → reset demo data** clears to a clean season.

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

## Bike guidance (Spray → Bike guidance)

Swath guidance for the sprayer bike — **6 m rear boom** and **2 m shielded front boom** (widths, boom positions and lap are editable under ⚙). Lightbar + cross-track readout, pass counter, speed-hold tile (boom sprayers without a rate controller apply ∝ 1/speed, so the tile shows the L/ha actually going on), heading-up swath map, and an as-applied sprayed map with area and double-spray tally. On a pinned trial the plot grid is drawn underneath, the plot under the active boom is named with its treatment, and with a *treatment in the tank* selected the badge turns red over any other plot.

A phone is a ±2–4 m position source; a 6 m boom needs better than that pass-to-pass. What the screen does about it, cheapest first:

1. **Doppler-aided track filter** — the receiver's speed/course (cm/s-grade) carries the position between fixes and the noisy fixes only trim it. Cross-track jitter drops ≥2× in simulation, and the lightbar looks ahead (default 1.2 s) and animates at 20 fps off a 1 Hz receiver.
2. **Best-fit AB line** — mark A, drive the first pass, mark B: the line is a least-squares fit through every fix of the pass, not a ruler between two noisy points (≈3× tighter heading on a 120 m run).
3. **Second phone as a base station** — any phone opens the app → *GPS base station* on the sign-in screen (no account) → enters the bike's six-digit pair code. Parked, it knows it isn't moving, so the movement its GPS reports is error; it broadcasts that over Supabase Realtime (Starlink Wi-Fi or mobile data) and the bike subtracts the shared part. Phones expose positions, not raw satellite data, so how much two phones share is **measured, not assumed**: whenever the bike is parked (every refill) its own wander is regressed against the base's, and only the fitted fraction is applied. Phones that don't wander together ⇒ gain → 0, base ignored. The Accuracy sheet reports the measured cut.
4. **"I'm on the line"** — at the start of a pass, line up on the last pass's edge by eye and tap: zeroes whatever drift is left. ± 10 cm nudges alongside.
5. **RTK-ready** — a Bluetooth RTK receiver set as the phone's mock-location source (NTRIP over the Starlink) flows through unchanged: the filter steps aside when reported accuracy is ≪ 1 m.

The base link needs the Supabase project awake — free-tier projects pause after a week idle (guidance itself runs fine without it; the chip reads *BASE · NO LINK*).

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
  guidance/
    engine.ts          pure maths: local frame, swaths/steer, line fit, Doppler track
                       filter, base-station differential (self-tuning gain), coverage raster
    link.ts            base ⇄ rover channel (Supabase Realtime broadcast, zero-dep)
    useGuidance.ts     GPS watch + engine + job persistence for the screen
    job.ts / sim.ts    boom settings + resumable job (localStorage); demo drive
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
  guidance.test.ts     simulated bike + GPS error: filter, line fit, two-phone
                       differential (helps when shared, backs off when not), coverage
  guidance-drive.mjs   Playwright: two passes, reload, pair a second "phone" as base,
                       trial plots under the boom (LIVE_LINK=1 pairs over real Realtime)
```

**Offline-first**: all writes land in IndexedDB immediately; the sync queue tracks what still needs the portal. **Backend**: not wired — the queue shape, role model and entity types are laid out for the handoff's recommended Supabase/Postgres backend (auth, row-level security, file storage); `syncNow()` is the single integration point. Conflict policy per the spec: last-write-wins per field with full history.

## Decisions & deviations

- **Wordmark, not logo**: the prototypes use a text wordmark; the brand logo (`docs/handoff/brand/AGnVET-logo.pdf`) should replace it in production per the guidelines (coloured logo on white only).
- **Fonts**: Mulish + IBM Plex Mono from Google Fonts (the handoff's web stand-ins for Proxima Nova); Arial is the approved fallback and is what renders offline before the font cache fills.
- **Parsing runs on-device** rather than server-side (no backend in this repo). The PDF text extractor covers ReportLab/print-style PDFs; scanned maps would need the portal's OCR.
- **Client PDF report** renders to a print window (print → save as PDF) instead of a server-generated file; the Excel export is a true `.xlsx`.
- **Demo seed**: the app first-runs with the design's demo state (12 plots scored, 2 spray issues) so every screen shows its intended content; *reset demo data* clears it.

## Fixtures

Real documents from the handoff, used as parser inputs and test oracles — see [`fixtures/`](fixtures/): the Matong spray map PDF, mixing plan rev. D, the Junee assessment workbook (export shape), and `matong-trial.json` (canonical trial data).
