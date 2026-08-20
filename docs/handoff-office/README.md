# Handoff: AGnVET Trial Work — Office portal

## Overview
Desktop web portal for agronomists at AGnVET (rural agronomy, NSW Riverina) who plan and manage small-plot field trials — fungicide, herbicide and insecticide work on broadacre crops. It is the office companion to an existing mobile field app (spray, assess, present; GPS auto-advance through plots). This package specifies 7 screens: trials dashboard, trial wizard (aim & basics, treatments, randomisation, assessments), product picker, protocol/documents workspace, trial review & approve, and a trial map with imagery layers.

Start here: **read this README, open `AGnVET Trial Work Office.dc.html` in a browser, and click through every screen before writing code.**

## About the design files
The HTML file in this bundle is a **design reference** — an interactive prototype showing intended look and behaviour, not production code. Recreate these designs in the target codebase's environment and patterns. If no codebase exists yet, recommended stack: **React + TypeScript, Tailwind, Supabase (Postgres + auth + storage) and Vercel**, sharing one database with the mobile field app. The portal itself can assume connectivity (office use); the shared data model must tolerate late-arriving field-app writes (offline sync).

## Fidelity
**High-fidelity.** Colors, type, spacing and copy are intentional — recreate pixel-perfectly with the given tokens. All copy in the prototype is production-quality placeholder for the seeded Matong/Ganmain fixtures.

## Global layout
- Desktop-first, designed at 1440 px. App background `#F4F5F4`.
- Left sidebar 228 px, white, 1 px right border `#E4E4E6`: AGnVET logo (126 px) + "TRIAL WORK · OFFICE" wordmark (10.5 px / 800 / letter-spacing .15em / `#007749`), then nav: Trials, New trial, Map, Products, Documents, Reports, Team. Nav item: 13.5 px / 700, 9 px vertical padding, radius 8; active = bg `#E3F1EA`, text `#00512F`; hover = `#F2F4F2`. 16 px feather-style stroke icons.
- Sidebar footer: AgLink Australia logo (14 px high, member co-brand) above user chip (32 px round avatar with initials on `#E3F1EA`, name 12.5/700 `#141414`, role 11 px `#8A8C8A`).
- Content headers: h1 22 px / 800 / `#141414` / letter-spacing -.01em, sub-line 12.5 px `#8A8C8A`. Cards: white, 1 px `#E4E4E6`, radius 10. Section labels: 10.5 px / 800 / letter-spacing .11em / `#8A8C8A`, uppercase.

## Screens

### 1. Trials dashboard (`Trials` nav)
- Header row: title + count sub-line, search input (252 px, filters name/client/crop as you type), primary button "+ New trial" → wizard.
- Filter row: status chips (All / Draft / In review / Approved / Active / Complete, each with count within the season filter; active chip = solid `#141414` white text) + season select (All / Winter 2027 / Winter 2026 / Winter 2025; default W2026).
- Table card, 7 columns: TRIAL (name 13.5/700 + client/property sub-line) / CROP / TYPE (9.5 px 800 letterspaced uppercase, e.g. FUNGICIDE) / STATUS chip / PROGRESS / SEASON (mono) / UPDATED (right-aligned). Row padding 14 px (8 px in compact density), hover `#FAFBFA`.
- Status chip styles (pill, 11 px / 800): Draft `#F0F1F0`/`#6B6D6B`; In review white/`#141414` border `#B9BBB9`; Approved white/`#00623C` border `#9CC9B4`; Active solid `#007749` white; Complete `#F0F1F0`/`#8A8C8A`.
- PROGRESS cell: Active trials show a pulsing 7 px green dot, main line (e.g. "Assessment 2 of 4 · 68% scored"), a 116×4 px progress bar (`#007749` on `#E8EAE8`) and a sub-line synced from field phones ("2 phones in field · Timing B spray due Fri"). Other statuses show one text line.
- "In review" rows are clickable (whole row + inline "Open review →" link) → review screen. Empty state: centered "Nothing matches — clear the search or switch season."

### 2. Trial wizard (`New trial`)
Shell: left stepper rail 248 px (`#FBFCFB`, right border) with "← All trials", NEW TRIAL · DRAFT label, trial name, and 6 steps: Aim & basics → Site → Treatments → Randomisation → Assessments → Review & submit. Step item: 22 px number circle (done = ✓ on `#E3F1EA`/`#00623C`; current = solid `#007749` white; todo = white, border `#D8DAD8`, grey text), label 13/700, live sub-line (e.g. "8 treatments · 4 to check", "RCBD · 4 reps · seed #A7F3"). Content column: top bar (step title + hint + "Draft saved just now"), scrollable body, footer bar ("Step N of 6", Back, primary "Save & continue →"; on Review step the primary reads "Submit for approval →").

**Step 1 — Aim & basics.** TRIAL TYPE radio cards, 3-across grid: **Demonstration** ("Products side by side for growers to walk — light or no replication." / meta "field days · visual scoring"), **Plot trial** ("Replicated small plots with stats — the standard for product comparisons." / "RCBD · ranked by yield"), **Paddock scale** ("Grower-run strips across the paddock — scored by header and imagery." / "strips · yield maps · drone"). Selected card: 1.5 px `#007749` border, bg `#F7FAF8`, filled radio dot. Helper line explains the type sets downstream defaults (demo = light replication + field-day pack; plot = full stats; paddock scale = strips scored by header/imagery). Below divider: TRIAL NAME input, SEASON select, CROP & VARIETY input, then "WHAT IS THIS TRIAL TESTING?" textarea with helper "Plain English is fine — this line opens the report and the field-day handout."

**Step 3 — Treatments.** Import banner (bg `#E3F1EA`, border `#BCDCCB`): "Prefilled from “Matong Demo Protocol v3.pdf”" + "8 treatments with rates and timings were read from the document — N rows still need a check." Buttons: "View source" (→ Documents screen) and "Confirm all". When all confirmed the banner collapses to a slim "All imported treatments checked — ready for randomisation." Timing legend chips: A = GS31 · first node · target 14 Jul; B = GS39 · flag leaf · target 18 Aug. Table columns: NO. (mono T1–T8) / TREATMENT (name + optional EXP chip + note) / PRODUCTS & RATES (per line: product name, mono rate e.g. `300 mL/ha`, mono timing letter; imported-unconfirmed rates get a dashed underline `#A9ABA9`) / TIMING (mono chip A, B, A + B, —) / IMPORTED (per-row "Auto · confirm" dashed button → "✓ Checked" green). T1 is "Untreated control — nil applied". Footer row: "+ Add treatment from product list" → opens product picker. Footnote: water rate/nozzles live in the spray record.

### 3. Product picker (modal over wizard, also `Products` nav)
Centered modal 664 px, radius 14, overlay `rgba(20,20,20,.38)`. Header: "Add product — treatment T9" + sub "Registered products · search by product or active ingredient". Search input (autofocus) matches product name, company **or active ingredient** (prototype preloads "prothio"). Result row: name 13.5/800 + company muted; actives line in mono 11.5 `#6B6D6B` with the matched substring highlighted (`#00623C`, weight 600) — e.g. "bixafen 75 g/L + **prothio**conazole 150 g/L"; category chip (Fungicide green tint / Herbicide straw `oklch(0.93 0.05 85)` / Insecticide slate `oklch(0.93 0.04 250)`); "Add +" affordance; hover `#F5F8F6`. Clicking adds the product as the next treatment row (flagged "set rate & timing" in orange) and closes. No-results state offers the experimental path.
Bottom section (separated, bg `#FBFCFB`): "Add an experimental product" with EXP chip — collapsed row expands to a form: CODE NAME, CATEGORY select, ACTIVES (optional, addable name+concentration rows, removable), NOTES, and footer note "Will appear as {code} with an EXP flag in tables, plot maps and reports" + primary "Add experimental product". EXP chip style everywhere: 9 px 800, `#cf4520` text/border on `#FBEDE8`.

### 4. Wizard step 4 — Randomisation
Controls card: DESIGN segmented control (RCBD / Latin square / Split-plot; active solid `#141414`) + "+ Add factorial structure" disclosure (Factor A: Product · 7 levels × Factor B: Timing · A, B = 14 combinations + control; "Apply structure" stub). Second row: REPS stepper (− 4 +, clamp 2–6), PLOT SIZE inputs (2 m × 10 m, mono), FIELD GRID computed label ("9 rows × 4 ranges" / "= 32 plots + 4 spares — 36 total"), HOW IT RANDOMISES design note (RCBD: complete blocks, shuffled within range; Latin square: once per row and range, n×n; Split-plot: main plots by timing, products within).
Map card: "Layout preview" + "Seeded **#A7F3** — reproducible: the same seed always regenerates this exact layout. Re-randomising records a new seed in the change log." + "↻ Re-randomise" button (new 4-hex seed). Mono annotations: `N ↑`, `sprayer runs W → E`, `plot 2 m × 10 m`. Grid: one band per rep (label REP 1…, alternating band bg `#F5F7F5`/`#FBFCFB`), cells ~80×56 radius 7: small mono plot number (101…) + large mono treatment number (T3, 16 px/600). Colour coding: T1 (untreated) white with dashed border; T2+ pastel `oklch(0.9 0.055 H)` bg / `oklch(0.41 0.095 H)` text, hues [25, 65, 105, 150, 195, 240, 290, 330]; spare cells grey `#EEF0EE` "SP". Legend grid maps T# → name (+ SP = Spare / buffer). A "print" map variant renders all cells white with `#B9BBB9` borders.
**Randomisation must be seeded & reproducible**: hash(seed + design + reps + nTreatments) → PRNG → Fisher–Yates per rep (RCBD) or shuffled row/column permutations (Latin square). Persist the seed; log re-randomisation in the change log.

### 5. Wizard step 5 — Assessments (light)
Confirmation banner ("Schedule prefilled from the protocol — confirm methods with the field team."), table NO./STAGE/WHAT GETS SCORED/METHOD/TARGET: A1 GS30–31 disease baseline (% plants infected, 10 plants/plot, 26 Jun); A2 GS39 severity top-3 leaves + NDVI (10 Aug); A3 GS65 green leaf retention + phyto (15 Sep); A4 Harvest yield/protein/screenings (8 Dec). Footnote: this schedule drives the field app's assessment order, pick-lists and photo prompts. Step 6 is a bridge card linking to the review screen.

### 6. Protocol workspace (`Documents`)
Three columns: **files rail 264 px** — dashed drop-zone ("Drop files here or browse — PDF · XLSX · DOCX — sheets and protocols parse automatically") + file cards (ext chip: PDF solid ink, XLSX green tint, DOCX grey; name; size; parse status line): "✓ Parsed — 8 treatments found → used in wizard" (green), "✓ Parsed — 36-plot layout matched to randomisation", spinner + "Parsing — reading mix rates…", "⚑ Couldn't read tables — open & mark up" (orange). Selected card: green border + `#F7FAF8`.
**Document preview ~398 px** — page rendered on `#F0F1F0` desk with pager (`p 2 / 6`) and "Open original ↗". In the prototype pages are placeholders; in production render real PDF/XLSX previews. The key idea: parsed regions are outlined on the page (dashed `#007749` box with corner tag "8 TREATMENTS → WIZARD"; unreadable tables get an orange "TABLE UNREADABLE" box and a drag-to-mark-up affordance for re-parse).
**Generated protocol (flex)** — header + "Export ▾" menu (Protocol PDF / Excel workbook (.xlsx) / ARM study definition). Sections AIM, SITE (2-col label/value grid), TREATMENTS (compact T#/name/mono rate/timing rows), ASSESSMENTS — each with a mono source chip ("PDF · P2"). Footer: "Exports match the ARM study format — treatments, layout and schedule stay linked to this trial."

### 7. Trial review & approve (reached from dashboard "In review" row)
Read-only page for the approving senior agronomist (example: Ganmain Barley Net Blotch 2026). Header: name + status chip + "Submitted for approval by Sam Kelleher · Mon 10 Aug, 9:41 am · Ganmain branch · read-only until signed off".
Main column: AIM card; SITE card (3-col grid: grower, location + GPS, crop/sowing, paddock + pH, plots, previous crop); TREATMENTS card (compact table + timing legend A GS39 · 20 Aug, B GS55 · 4 Sep); PLOT LAYOUT card (same seeded map, 64×46 cells, + legend); ASSESSMENT SCHEDULE (with status column — A1 "Booked" green, rest —); DOCUMENTS list with "Open ↗".
Right rail 296 px (sticky): **Approval card** — explainer ("Approving locks treatments and the layout, and opens the trial to the field app for spraying and scoring."), reviewer identity, checkbox "I've checked products, rates and timings against current labels and permits." The **Approve trial** button stays disabled (bg `#B7C9C0`, not-allowed cursor) until checked, then `#007749`. Approving: swaps the card for a green confirmation panel (signed, date/time), sets the header chip to solid "Approved ✓", prepends "Approved & locked — signed" to the change log. Secondary action "⚑ Request changes" in `#cf4520`. **At a glance** card: 8 treatments · 4 reps · 36 plots; spray dates; first assessment; harvest; note "1 experimental product — EXP flagged, excluded from grower report by default."
Bottom: **CHANGE LOG strip** — horizontal entries (mono timestamp / event / author): submitted → randomisation seed → treatments imported (with source doc + edits) → site added → created from template.

### 8. Trial map (`Map`)
Header: trial context, "‘Glenview’, Matong NSW · −34.768, 146.929 · Open in Google Maps ↗".
**Map canvas** (flex, ~100vh−220px): Google Maps **satellite basemap** (prototype uses a placeholder with the label "google maps satellite · placeholder — API key connects the live basemap" — production uses the Maps JS API, satellite/roadmap types). Overlaid, georeferenced to the plot corner pegs and rotated to the true bearing (−4° in the prototype):
- **Plot boundaries** — the 36-plot grid as polygons, 1.5 px white borders, mono plot number + treatment number in each cell; white text with shadow when unfilled, treatment pastel fills when "Treatment colours" is on; spares dark-translucent "SP".
- **Drone imagery layer** — beneath the plot outlines, with a label chip ("NDVI · 12 Aug · drone") and adjustable opacity.
- **Live field marker** — pulsing green GPS dot + chip "Sam's phone · plot 214" from field-app positions.
Map chrome: N ↑ chip, zoom +/− stack, "⌖ Centre on trial" pill.
**Layers panel 262 px**: BASE segmented (Satellite/Roads); TRIAL OVERLAY toggles (Plot boundaries, Treatment colours) + "36 plots · seed #A7F3 · corners pegged from the spray map"; DRONE IMAGERY radio list (None / RGB ortho / NDVI, mono meta "12 Aug · 4 cm/px · DJI M3M") with OPACITY slider (20–100%, accent `#007749`) and a dashed "+ Add flight — GeoTIFF, JPG or Ag Leader export" upload row ("Imagery georeferences to the plot corners automatically and stays with the trial."); GPS status row ("2 phones in field · last fix 24 min ago").

## Interactions & behaviour (summary)
- Sidebar navigation swaps screens; Products opens the wizard with the picker modal; Reports/Team are out of scope (inert).
- Dashboard: live search, status-chip and season filtering; In-review rows open the review screen.
- Wizard: stepper items are clickable (Site is shown pre-completed); Back/Continue walk Aim → Treatments → Randomisation → Assessments → Review.
- Per-row confirm + Confirm-all resolve the import banner; adding from the picker appends a highlighted row needing rate & timing.
- Re-randomise regenerates the layout with a new persisted seed; reps/design changes re-layout immediately.
- Approve gate: checkbox → enabled button → approved state + change-log entry. Approval locks treatments/layout and unlocks the trial in the field app.
- Map: base/overlay/drone layer toggles and opacity are instant; plot fills reuse the treatment palette.
- Transitions: none needed beyond 150 ms toggle switches; pulse animation (1.8 s ease-in-out, opacity 1→.3) for live dots; 0.9 s spinner for parsing.

## State & data model
Entities (Supabase tables): `trials` (id, name, type: demonstration|plot|paddock_scale, status: draft|in_review|approved|active|complete, season, crop, variety, aim, client, branch, created_from_template), `sites` (trial_id, grower, property, town, lat, lng, paddock, soil, ph, sown_date, seed_rate, prev_crop, bearing, corner_pegs[]), `treatments` (trial_id, number, name, is_experimental, note, timing[]), `treatment_products` (treatment_id, product_id|exp_product_id, rate, unit, timing), `products` (name, company, category, actives[{name, concentration}], registered: bool), `randomisations` (trial_id, design, reps, plot_w, plot_l, seed, layout_json, created_by, created_at — append-only), `assessments` (trial_id, number, stage, what, method, target_date, status, pct_scored), `documents` (trial_id, filename, kind, size, parse_status: parsed|parsing|error, parse_result_json, page_regions[]), `drone_flights` (trial_id, date, kind: rgb|ndvi, resolution, file_url), `approvals` (trial_id, reviewer_id, ack_labels: bool, signed_at), `change_log` (trial_id, at, event, actor), `users` (role: agronomist|senior_agronomist|operator|chem_rep). Field-app tables (plots, scores, photos, spray_records, device positions) feed dashboard progress and map markers.

## Design tokens
- **Colors**: primary `#007749` (AGnVET "Field", PMS 3415C); dark `#00623C`; deep text-on-tint `#00512F`; tint `#E3F1EA`; tint-border `#BCDCCB` / `#9CC9B4`; warning/flag ONLY `#cf4520` ("Land Burnt", PMS 173C) + tint `#FBEDE8`; ink `#141414`; body `#3E403E`; muted `#8A8C8A` / `#6B6D6B`; faint `#A9ABA9` / `#B8BAB8`; borders `#E4E4E6` / `#EDEEED` / `#F0F1F0`; inputs border `#D8DAD8`; app bg `#F4F5F4`; hover bg `#F2F4F2` / `#FAFBFA` / `#F5F8F6`; selected bg `#F7FAF8`. Treatment palette: `oklch(0.9 0.055 H)` bg / `oklch(0.41 0.095 H)` fg, H ∈ [25, 65, 105, 150, 195, 240, 290, 330].
- **Type**: Mulish (400/600/700/800/900) — substitute for brand Proxima Nova; IBM Plex Mono (400/500/600) for plot numbers, rates, seeds, coordinates, timestamps. Scale: 22 h1 / 16 modal & step titles / 14 card titles / 13.5–12.5 body / 11.5–11 secondary / 10.5 section labels (800, .11em) / 9.5–8.5 chips.
- **Radius**: 999 pills/chips · 14 modal · 10 cards · 8 buttons/inputs · 7 map cells · 4–5 tags. **Borders** 1 px hairlines; dashed for drop-zones, unconfirmed values, untreated plots. **Shadows**: modal `0 24px 64px rgba(10,26,18,.25)`; menus `0 10px 30px rgba(20,20,20,.13)`; map chrome `0 1px 5px rgba(0,0,0,.15)`; cards flat.
- **Spacing**: screen padding 26/34; card padding 16–20; table row 14 (compact 8); grids gap 10–18.

## Assets
- `brand/agnvet-logo.png` — extracted from the supplied logo PDF (colour logo must sit on white).
- `brand/aglink-logo.jpg` — AgLink Australia member co-brand (sidebar footer).
- `brand/AVS Style guidelines May 2026.pdf` — source brand guidelines (colours p13, typefaces p14, logo rules).
- Icons: 16 px stroke icons (feather-style: clipboard, plus-circle, map, box, file-text, bar-chart, users). Use lucide-react or equivalent.

## Fixtures
- `fixtures/trials.json` — the seeded Matong demonstration (active) and Ganmain barley trial (in review), with sites, treatments, timings, assessments, documents and change log.
- `fixtures/products.json` — registered product list with companies, categories and actives (source of the picker search).

## Files
- `AGnVET Trial Work Office.dc.html` — the interactive prototype (all 8 screens; open directly in a browser).
- `brand/`, `fixtures/` — as above.
