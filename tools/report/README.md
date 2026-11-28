# Trial report tooling

Builds the printed outputs from the office database without the portal UI:
the full trial report, the one-page "programs and yield" sheet, and PDFs.
No trial data lives in this folder. Pull a data pack from the database first.

## 1. Data pack

Run `pack.sql` against the project database with the trial id substituted
(through the Supabase connector in a Claude session, or psql). Save the JSON
it returns as `pack.json`. The two optional queries at the bottom of the file
return the stored plot polygons (`plots.json`) and the site weather
(`weather.json`); the third returns the measure definitions (`measures.json`).

Large results from the connector are saved to a file; parse the `result`
field and take the JSON between `[{"json_build_object"` and `</untrusted-data-`.

## 2. Render

```
npx tsx tools/report/render_report.ts pack.json measures.json out/ [plots.json] [weather.json]
```

Writes `out/report.html`, `out/tiles.txt` (satellite tiles the map needs),
`out/rows.json` (per-treatment yield rows for the one-pager) and prints the
yield ANOVA. The agronomist's read comes from `design.commentary` in the pack;
exclusions and value corrections come from the corrections table in the pack,
so a provisional exclusion logged in the office is honoured here too.

Yield is derived at render time from bucket weight, grain moisture and
`design.harvest` (cut width, length, moisture standard), exactly as the portal
does. Nothing derived is stored.

## 3. Map tiles and PDF

```
python3 -I tools/report/inline_tiles.py out/report.html out/tiles.txt out/report_inline.html
node tools/report/pdf.mjs out/report_inline.html out/Report.pdf --footer "AGnVET Services · <trial> · DRAFT · internal"
python3 -I tools/report/onepager.py out/rows.json out/onepager.html --title "<trial> — programs and yield" --sub "<variety · design · harvest note>" --foot "<extra footnote>"
node tools/report/pdf.mjs out/onepager.html out/Onepager.pdf --sheet
```

The one-pager needs the `shared/brand/modules.html` CSS and logo; pass
`--brand path` if the training module template lives elsewhere.
