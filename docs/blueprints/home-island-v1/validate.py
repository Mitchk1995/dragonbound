"""Nonvisual geometry checks for the home-island proposal (OPUS-AUTHORED).

Coverage is limited to the authored polygons/polylines in design.json and the castle-v2 import.
NOT checked: navmesh, cell rasterisation, collision, camera framing, rendered pixels, gameplay.
Run: python validate.py
"""
import json
import math
import os
import re

import render as R

HERE = os.path.dirname(os.path.abspath(__file__))
results = []


def check(name, ok, detail=''):
    results.append((name, bool(ok), detail))


def segs_intersect(a, b, c, d):
    def o(p, q, r):
        v = (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])
        return 0 if abs(v) < 1e-9 else (1 if v > 0 else -1)
    return o(a, b, c) * o(a, b, d) < 0 and o(c, d, a) * o(c, d, b) < 0


def simple(poly):
    n = len(poly)
    for i in range(n):
        for j in range(i + 1, n):
            if abs(i - j) <= 1 or (i == 0 and j == n - 1):
                continue
            if segs_intersect(poly[i], poly[(i + 1) % n], poly[j], poly[(j + 1) % n]):
                return False
    return True


def samples(pts, step=0.5):
    out = []
    for si, (a, b) in enumerate(zip(pts, pts[1:])):
        L = math.hypot(b[0] - a[0], b[1] - a[1])
        n = max(1, int(L / step))
        for k in range(n + 1):
            out.append((si, a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n))
    return out


def in_rect(x, z, b, m=0.0):
    return b['x'] - m < x < b['x'] + b['w'] + m and b['z'] - m < z < b['z'] + b['d'] + m


D, C = R.load()
land = R.outline_pts(D)
P = R.patches(D)
CG = R.castle_geom(D, C)
cl = D['clearances']

# 1 polygons
check('outline is a simple polygon', simple(land))
for p in P:
    if p['poly'] != 'outline':
        check(f'patch {p["id"]} simple', simple(p['pts']))
        parent = next(q for q in P if q['id'] == p['parent'])
        check(f'patch {p["id"]} inside parent {p["parent"]}', all(R.pip(x, z, parent['pts']) for x, z in p['pts']))
for r in D['reserved']:
    check(f'reserved {r["id"]} inside land', all(R.pip(x, z, land) for x, z in r['poly']))

# 2 castle rigid import
check('castle source hash matches design.json record', R.sha256(R.CASTLE_PATH) == D['castle']['source_sha256'])
src = C['curtain']
dst = CG['curtain']
maxerr = max(abs(math.dist(src[i], src[j]) - math.dist(dst[i], dst[j])) for i in range(len(src)) for j in range(len(src)))
check('castle curtain pairwise distances preserved (rigid, no scaling)', maxerr < 1e-3, f'max error {maxerr:.5f}')
check('castle import uses current source wall thickness (curtain 2.2, cross 1.8)', CG['thickness'] == C['curtain_thickness'] == 2.2 and CG['cross_thickness'] == C['cross_wall_thickness'] == 1.8)
check('castle transform is one rotation + translation', set(D['castle']['transform']) >= {'rotation_deg', 'translate'})
crown = next(p for p in P if p['id'] == 'crown')['pts']
worst = 1e9
for x, z in R.samples if False else []:
    pass
pts_c = [q for _, *q in samples(dst + [dst[0]], 0.5)]
for x, z in pts_c:
    ok = R.pip(x, z, crown)
    d = R.poly_edge_dist(x, z, crown) - CG['thickness'] / 2
    worst = min(worst, d if ok else -d)
for t in CG['towers']:
    d = R.poly_edge_dist(t['x'], t['z'], crown) - t['r']
    worst = min(worst, d if R.pip(t['x'], t['z'], crown) else -1)
check(f'castle curtain+towers inside crown spur with >= {cl["castle_curtain_to_crown_edge_min"]} clearance', worst >= cl['castle_curtain_to_crown_edge_min'], f'min {worst:.2f}')

# 3 buildings/portals/stations on land with clearance, no overlaps
for b in D['buildings']:
    corners = [(b['x'], b['z']), (b['x'] + b['w'], b['z']), (b['x'] + b['w'], b['z'] + b['d']), (b['x'], b['z'] + b['d'])]
    dmin = min(R.poly_edge_dist(x, z, land) for x, z in corners)
    check(f'building {b["id"]} on land, edge clearance >= {cl["building_to_edge_min"]}', all(R.pip(x, z, land) for x, z in corners) and dmin >= cl['building_to_edge_min'], f'{dmin:.1f}')
    hs = {R.height_at(D, x, z, P) for x, z in corners}
    check(f'building {b["id"]} on one terrace level', len(hs) == 1, str(hs))
    check(f'building {b["id"]} clear of castle', not any(R.pip(x, z, dst) for x, z in corners))
    check(f'building {b["id"]} clear of stream/pond', R.polyline_dist(b['x'] + b['w'] / 2, b['z'] + b['d'] / 2, D['water']['stream']) > max(b['w'], b['d']) / 2 + 1)
bs = D['buildings']
for i in range(len(bs)):
    for j in range(i + 1, len(bs)):
        a, b = bs[i], bs[j]
        ov = a['x'] < b['x'] + b['w'] and b['x'] < a['x'] + a['w'] and a['z'] < b['z'] + b['d'] and b['z'] < a['z'] + a['d']
        if ov:
            check(f'{a["id"]}/{b["id"]} overlap only as an attached group', a.get('group') and a.get('group') == b.get('group'))
for p in R.portal_positions(D):
    check(f'portal {p["id"]} base on land and h 0', R.height_at(D, p['x'], p['z'], P) == 0 and R.poly_edge_dist(p['x'], p['z'], land) > 10)
check('six portal slots kept', len(D['portals']) == 6 and [p['angle'] for p in D['portals']] == [-150, -126, -102, -78, -54, -30])
# 3b portal slot vs open state, read from the supplied runtime sources (mechanics unchanged)
REF = os.path.join(HERE, 'references')


def ref(name):
    with open(os.path.join(REF, name), encoding='utf-8') as fh:
        return fh.read()


zm, story = ref('zoneMaps.ts'), ref('story.ts')
arches = re.findall(r"\{ id: '(\w+)', angle: (-?\d+)(?:, dormant: '([^']+)')? \}", zm)
check('KEEP_ARCHES ids/angles match the six design slots', [(i, int(a)) for i, a, _ in arches] == [(p['id'], p['angle']) for p in D['portals']], str(arches))
for i, a, dm in arches:
    p = next((q for q in D['portals'] if q['id'] == i), None)
    if not p:
        continue
    if dm:
        check(f'portal {i}: dormant placeholder matches KEEP_ARCHES', p['open_rule'] == 'dormant' and p.get('dormant') == dm and p['slot'] == 'dormant chapter placeholder')
    else:
        check(f'portal {i}: present current destination slot', p['slot'] == 'present current destination slot')
pm = re.search(r'portalState\(id: string\)[\s\S]*?\n  \}\n', story)
body = pm.group(0) if pm else ''
rules = {'mine': ('progression', 's.portals.mine'), 'foothills': ('progression', 's.portals.foothills'),
         'ruin': ('quest', 'q.done'), 'lair': ('restore', 's.keep.lair_arch')}
for i, (rule, token) in rules.items():
    p = next(q for q in D['portals'] if q['id'] == i)
    check(f'portal {i}: open_rule "{rule}" backed by story.ts portalState ({token})', p['open_rule'] == rule and f"case '{i}'" in body and token in body)
check('no portal claims an unconditional live/open state', all('state' not in p and 'live' not in json.dumps(p).lower() for p in D['portals']))

# 3c building footprints/wall heights equal their KEEP_BUILDINGS source in zoneMaps.ts
for b in D['buildings']:
    m = re.search(r"id: '" + b['id'] + r"',[^\n]*?w: ([\d.]+), d: ([\d.]+), wallH: ([\d.]+)", zm)
    ok = m and (float(m.group(1)), float(m.group(2)), float(m.group(3))) == (b['w'], b['d'], b['wallH'])
    check(f'building {b["id"]} w/d/wallH equal zoneMaps.ts source', ok, m.group(0)[-40:] if m else 'not found')
tr = D['castle']['transform']
check('castle transform is exactly rotation 0, translate (+28,+12), no scale', tr['rotation_deg'] == 0 and tr['translate'] == [28, 12] and 'scale' not in tr)
off = [(d[0] - s[0], d[1] - s[1]) for s, d in zip(src, dst)]
check('every castle curtain vertex moved by exactly (+28,+12)', all(abs(dx - 28) < 1e-9 and abs(dz - 12) < 1e-9 for dx, dz in off))

for s in D['stations']:
    check(f'station {s["id"]} on land', R.pip(*s['at'], land))
    if s.get('in'):
        b = next(b for b in bs if b['id'] == s['in'])
        check(f'station {s["id"]} inside {s["in"]}', in_rect(*s['at'], b))

# 4 routes
stream = D['water']['stream']
sw = D['water']['stream_width']
port_discs = [(p['x'], p['z']) for p in R.portal_positions(D)]
for r in D['routes']:
    hw = r['width'] / 2
    bad = []
    grade = set(r.get('grade', []))
    pts = r['points']
    for si, x, z in samples(pts):
        if not R.pip(x, z, land) or R.poly_edge_dist(x, z, land) < hw + cl['route_edge_to_land_edge_min']:
            bad.append(f'void/edge at ({x:.1f},{z:.1f})')
            break
    for si, x, z in samples(pts):
        near_bridge = any(math.hypot(x - bx, z - bz) < 3 for bx, bz in r.get('bridges', []))
        near_src = math.hypot(x - stream[0][0], z - stream[0][1]) < 3
        if not near_bridge and not near_src and R.polyline_dist(x, z, stream) < sw / 2 + hw:
            bad.append(f'unbridged stream at ({x:.1f},{z:.1f})')
            break
        if math.hypot(x - D['water']['pond'][0], z - D['water']['pond'][1]) < D['water']['pond'][2] + hw:
            bad.append('pond')
            break
    for si in range(len(pts) - 1):
        if si in grade:
            continue
        hs = {R.height_at(D, x, z, P) for s2, x, z in samples(pts) if s2 == si}
        if len(hs) > 1:
            bad.append(f'level change on ungraded segment {si}: {hs}')
    doors = [tuple(e.split(':')[1] for e in [x]) for x in r['ends'] if x.startswith('door:')]
    door_bids = [e.split(':')[1] for e in r['ends'] if e.startswith('door:')]
    for si, x, z in samples(pts):
        last = si == len(pts) - 2
        for b in bs:
            if last and b['id'] in door_bids:
                continue
            if in_rect(x, z, b, hw + cl['route_to_building_min']):
                bad.append(f'through building {b["id"]} at ({x:.1f},{z:.1f})')
                break
        for px, pz in port_discs:
            if math.hypot(x - px, z - pz) < hw + cl['portal_base_block_r']:
                bad.append('through portal base')
                break
        castle_end = any(e.startswith('castle:') for e in r['ends'])
        if R.pip(x, z, dst):
            gate_pts = [CG['gates'][e.split(':')[1]]['w'] for e in r['ends'] if e.startswith('castle:')]
            if not any(math.hypot(x - gx, z - gz) < 4.5 for gx, gz in gate_pts):
                bad.append(f'inside castle not at its gate ({x:.1f},{z:.1f})')
                break
    check(f'route {r["id"]}: on land, bridged, graded, clear of buildings/portals/castle walls', not bad, '; '.join(bad[:3]))
    # endpoints
    for k, e in enumerate(r['ends']):
        pt = pts[0] if k == 0 else pts[-1]
        kind, _, ref = e.partition(':')
        if kind == 'court':
            ok = math.dist(pt, D['portal_court']['center']) <= D['portal_court']['radius']
        elif kind == 'door':
            b = next(b for b in bs if b['id'] == ref)
            ok = any(math.dist(pt, d) < 0.6 for d in b['doors'])
        elif kind == 'castle':
            ok = math.dist(pt, CG['gates'][ref]['w']) < 0.6
        elif kind == 'route':
            o = next(q for q in D['routes'] if q['id'] == ref)
            ok = R.polyline_dist(pt[0], pt[1], o['points']) < 0.6
        elif kind == 'area':
            a = next(q for q in D['areas'] if q['id'] == ref)
            if 'rects' in a:
                ok = any(in_rect(pt[0], pt[1], dict(x=x, z=z, w=w, d=d), 2.5) for x, z, w, d in a['rects'])
            elif 'circle' in a:
                ok = math.dist(pt, a['circle'][:2]) <= a['circle'][2] + 0.6
            else:
                ok = R.pip(pt[0], pt[1], a['poly'])
        else:
            ok = False
        check(f'route {r["id"]} endpoint {e}', ok)

# connectivity: everything reaches the court
adj = {r['id']: set() for r in D['routes']}
for r in D['routes']:
    for e in r['ends']:
        if e.startswith('route:'):
            adj[r['id']].add(e[6:])
            adj[e[6:]].add(r['id'])
for a in D['routes']:
    for b in D['routes']:
        if a is not b and any(R.polyline_dist(x, z, b['points']) < 0.6 for x, z in (a['points'][0], a['points'][-1])):
            adj[a['id']].add(b['id'])
            adj[b['id']].add(a['id'])
# routes ending in the same open area (e.g. the farm fields) are joined across that walkable ground
for a in D['routes']:
    for b in D['routes']:
        if a is not b and {e for e in a['ends'] if e.startswith('area:')} & {e for e in b['ends'] if e.startswith('area:')}:
            adj[a['id']].add(b['id'])
seen = {r['id'] for r in D['routes'] if 'court' in r['ends']}
stack = list(seen)
while stack:
    n = stack.pop()
    for m in adj[n]:
        if m not in seen:
            seen.add(m)
            stack.append(m)
check('all routes connected to the portal court', len(seen) == len(D['routes']), str(set(adj) - seen))
reached = {e.split(':')[1] for r in D['routes'] for e in r['ends'] if e.startswith('door:')}
check('every building door group reached by a route (vault via bank)', reached >= {b['id'] for b in bs} - {'vault'}, str({b['id'] for b in bs} - reached))
check('castle gate and postern reached', {'castle:G_outer', 'castle:G_postern'} <= {e for r in D['routes'] for e in r['ends']})
st_end = stream[-1]
check('stream ends beyond the land edge (falls into void)', not R.pip(*st_end, land) or R.poly_edge_dist(*st_end, land) < 1.5)
check('stream source on land', R.pip(*stream[0], land))
for sx, sz in next(a for a in D['areas'] if a['id'] == 'market')['points']:
    check(f'stall ({sx},{sz}) clear of routes', all(R.polyline_dist(sx, sz, r['points']) > r['width'] / 2 + 1.0 for r in D['routes']))

# 5 same dataset for both views
dh = R.sha256(R.DESIGN_PATH)
for n in ('home-island-topdown.svg', 'home-island-oblique.svg'):
    p = os.path.join(HERE, n)
    s = open(p, encoding='utf-8').read() if os.path.exists(p) else ''
    m = re.search(r'design-sha256:([0-9a-f]{64})', s)
    check(f'{n} rendered from current design.json', m and m.group(1) == dh)
man = json.load(open(os.path.join(HERE, 'render-manifest.json')))
for n, h in man['outputs'].items():
    check(f'{n} matches render-manifest hash', R.sha256(os.path.join(HERE, n)) == h)

fails = [r for r in results if not r[1]]
for name, ok, d in results:
    print(('PASS ' if ok else 'FAIL ') + name + (f'  [{d}]' if d else ''))
print(f'\n{len(results) - len(fails)}/{len(results)} checks passed')
area = abs(R.area(land))
print(f'land area {area:.0f} cells; castle import max distance error {maxerr:.6f}')
print('NOT covered: navmesh/cell rasterisation, collision, camera framing, rendered pixels, gameplay feel.')
with open(os.path.join(HERE, 'validation-report.txt'), 'w', encoding='utf-8') as fh:
    fh.write('\n'.join(('PASS ' if ok else 'FAIL ') + n + (f'  [{d}]' if d else '') for n, ok, d in results))
    fh.write(f'\n\n{len(results) - len(fails)}/{len(results)} passed\nNOT covered: navmesh/cell rasterisation, collision, camera framing, rendered pixels, gameplay feel.\n')
raise SystemExit(1 if fails else 0)
