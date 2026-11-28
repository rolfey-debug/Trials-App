import sys, base64, hashlib, subprocess, os, re
html_in, tiles_list, html_out = sys.argv[1:4]
cache = os.path.join(os.path.dirname(html_out), 'tiles'); os.makedirs(cache, exist_ok=True)
h = open(html_in).read()
for u in [x for x in open(tiles_list).read().split('\n') if x]:
    f = os.path.join(cache, hashlib.md5(u.encode()).hexdigest()[:16] + '.jpg')
    if not os.path.exists(f) or os.path.getsize(f) == 0:
        subprocess.run(['curl', '-sS', '--cacert', '/root/.ccr/ca-bundle.crt', '-o', f, u], check=True)
    b = base64.b64encode(open(f, 'rb').read()).decode()
    h = h.replace(f'src="{u}"', f'src="data:image/jpeg;base64,{b}"')
print('remaining remote tiles', len(re.findall(r'server\.arcgisonline', h)))
open(html_out, 'w').write(h)
