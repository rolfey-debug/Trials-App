"""One-page 'programs and yield' sheet from rows.json written by render_report.ts.
   python3 -I tools/report/onepager.py rows.json out.html --title T --sub S [--foot F] [--brand path/to/modules.html]
"""
import argparse, json, re
ap = argparse.ArgumentParser(); ap.add_argument('rows'); ap.add_argument('out'); ap.add_argument('--title', required=True); ap.add_argument('--sub', default=''); ap.add_argument('--foot', default=''); ap.add_argument('--brand', default='shared/brand/modules.html'); ap.add_argument('--font', type=float, default=9.6)
a = ap.parse_args()
j = json.load(open(a.rows)); rows = sorted(j['rows'], key=lambda r: -(r['mean'] or 0)); unt = j['unt'] or 0
tpl = open(a.brand).read()
logo = re.search(r'src="(data:image/png;base64,[^"]+)"', tpl).group(1)
css = tpl[tpl.index('<style>') + 7:tpl.index('</style>')].replace('margin-top: 40mm;', 'margin-top: 4mm;')
css += f'''
h1.t{{font-size:20px;margin:2px 0 4px}} .sub{{font-size:10px;color:#58585B;margin-bottom:8px}}
table.y{{width:100%;border-collapse:collapse;font-size:{a.font}px}} table.y th{{background:#007749;color:#fff;text-align:left;padding:4px 6px;font-weight:700}}
table.y td{{padding:3.4px 6px;border-bottom:1px solid #E1E3E1;vertical-align:top}} table.y tr.unt td{{background:#F3F4F3;font-weight:700}}
td.num{{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}} .star{{color:#007749;font-weight:800}} s{{color:#B0413E}}
.foot{{font-size:9px;color:#58585B;margin-top:8px;line-height:1.45}}'''
def cell(r):
    if r['n'] == 1 or r['mean'] is None: return ''
    diff = r['mean'] - unt; star = ' <span class=star>*</span>' if r['lsdU'] is not None and diff > r['lsdU'] else ''
    return f'{diff:+.2f}{star}'
tr = ''.join(f'<tr class="{"unt" if r["n"] == 1 else ""}"><td>T{r["n"]}</td><td><b>{r["name"]}</b></td><td>{r["a"]}</td><td>{r["b"]}</td><td class="num">{(r["mean"] or 0):.2f}</td><td class="num">{cell(r)}</td><td style="color:#58585B">{r["plots"]}</td></tr>' for r in rows)
stats = f"Trial mean {j['grand']:.2f} t/ha" + (f" · LSD (5%) {j['lsd']:.2f} t/ha between treatments · CV {j['cv']:.0f}% · F {j['f']:.2f}" if j.get('lsd') else '') + " · * clears the untreated by more than the LSD."
html = f'''<!doctype html><html><head><meta charset="utf-8"><title>{a.title}</title><style>{css}</style></head><body><section class="page">
<div class="band"></div><img class="logo" src="{logo}"><div class="eyebrow">AGnVET SERVICES · TRIAL WORK · DRAFT</div>
<h1 class="t">{a.title}</h1><div class="sub">{a.sub}</div>
<table class="y"><tr><th>Trt</th><th>Program</th><th>A (GS31)</th><th>B (GS39)</th><th style="text-align:right">Yield t/ha</th><th style="text-align:right">vs untreated</th><th>Plots (t/ha)</th></tr>{tr}</table>
<div class="foot">Rates are per hectare. {stats} {a.foot} Yield is derived in the office from bucket weight, harvested area and moisture; the bucket weight is the record. AGnVET Services · internal.</div>
</section></body></html>'''
open(a.out, 'w').write(html); print('wrote', a.out, len(rows), 'rows')
