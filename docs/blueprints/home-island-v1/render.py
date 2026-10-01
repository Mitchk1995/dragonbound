"""Dragonbound home-island proposal renderer (OPUS-AUTHORED, PROPOSAL - NOT IMPLEMENTED).

Reads design.json (this directory) and the provisional castle footprint from
references/castle-v2/design.json, applies the one documented rigid transform, and writes:
  home-island-topdown.svg/.png   plan view
  home-island-oblique.svg/.png   oblique massing view (same geometry, heights and units)
  render-manifest.json           hashes tying both views to the same dataset
Run: python render.py
"""
import hashlib
import json
import math
import os

HERE = os.path.dirname(os.path.abspath(__file__))
DESIGN_PATH = os.path.join(HERE, 'design.json')
CASTLE_PATH = os.path.join(HERE, 'references', 'castle-v2', 'design.json')
FONT = "Helvetica, Arial, sans-serif"
STATUS_COL = {'RELOCATED': '#2f6db5', 'LOCKED': '#7a4fb0', 'NEW': '#c9701e', 'RESERVED': '#6b6b6b'}
STATUS_TXT = {'RELOCATED': 'EXISTING FUNCTION RELOCATED', 'LOCKED': 'EXISTING LOCKED/RESTORABLE PLOT',
              'NEW': 'NEW PROPOSAL', 'RESERVED': 'RESERVED/UNDECIDED'}


def sha256(path):
    with open(path, 'rb') as f:
        return hashlib.sha256(f.read()).hexdigest()


def load():
    with open(DESIGN_PATH, encoding='utf-8') as f:
        D = json.load(f)
    with open(CASTLE_PATH, encoding='utf-8') as f:
        C = json.load(f)
    return D, C


# ─── geometry ────────────────────────────────────────────────────────────────

def outline_pts(D):
    return [(p[0], p[1]) for p in D['outline']]


def pip(x, z, poly):
    inside = False
    n = len(poly)
    for i in range(n):
        x1, z1 = poly[i]
        x2, z2 = poly[(i + 1) % n]
        if (z1 > z) != (z2 > z):
            xi = x1 + (z - z1) * (x2 - x1) / (z2 - z1)
            if x < xi:
                inside = not inside
    return inside


def seg_dist(px, pz, a, b):
    ax, az = a
    bx, bz = b
    dx, dz = bx - ax, bz - az
    L2 = dx * dx + dz * dz
    t = 0 if L2 == 0 else max(0, min(1, ((px - ax) * dx + (pz - az) * dz) / L2))
    return math.hypot(px - ax - t * dx, pz - az - t * dz)


def poly_edge_dist(px, pz, poly):
    return min(seg_dist(px, pz, poly[i], poly[(i + 1) % len(poly)]) for i in range(len(poly)))


def polyline_dist(px, pz, pts):
    return min(seg_dist(px, pz, pts[i], pts[i + 1]) for i in range(len(pts) - 1))


def area(poly):
    s = 0
    for i in range(len(poly)):
        x1, z1 = poly[i]
        x2, z2 = poly[(i + 1) % len(poly)]
        s += x1 * z2 - x2 * z1
    return s / 2


def patches(D):
    out = []
    for p in D['height_patches']:
        poly = outline_pts(D) if p['poly'] == 'outline' else [tuple(q) for q in p['poly']]
        out.append(dict(p, pts=poly))
    return out


def height_at(D, x, z, P=None):
    P = P or patches(D)
    h = None
    for p in P:
        if pip(x, z, p['pts']) and (h is None or p['h'] > h):
            h = p['h']
    return h  # None = void


def castle_xf(D):
    t = D['castle']['transform']
    a = math.radians(t['rotation_deg'])
    tx, tz = t['translate']
    ca, sa = math.cos(a), math.sin(a)
    return lambda x, y: (round(x * ca - y * sa + tx, 4), round(x * sa + y * ca + tz, 4))


def castle_geom(D, C):
    T = castle_xf(D)
    H = D['castle']['massing_heights']
    rooms = {r['id']: r for r in C['rooms'] if r['floor'] == 'G'}

    def union(ids):
        xs0 = min(rooms[i]['geom'][0] for i in ids)
        zs0 = min(rooms[i]['geom'][1] for i in ids)
        xs1 = max(rooms[i]['geom'][2] for i in ids)
        zs1 = max(rooms[i]['geom'][3] for i in ids)
        a, b = T(xs0, zs0), T(xs1, zs1)
        return min(a[0], b[0]), min(a[1], b[1]), max(a[0], b[0]), max(a[1], b[1])

    blocks = [
        dict(id='hall', name='Great Hall', rect=union(['hall']), eaves=H['hall_eaves'], ridge=H['hall_ridge'], axis='x', roof='#4e5564'),
        dict(id='service', name='screens/buttery/pantry', rect=union(['screens', 'buttery', 'svc', 'pantry']), eaves=H['service_eaves'], ridge=H['service_ridge'], axis='z', roof='#4e5564'),
        dict(id='kitchen', name='Kitchen', rect=union(['kitchen']), eaves=H['kitchen_eaves'], ridge=H['kitchen_ridge'], axis='z', roof='#3e4450'),
        dict(id='residence', name='L-residence wing', rect=union(['armory', 'chapel']), eaves=H['residence_eaves'], ridge=H['residence_ridge'], axis='z', roof='#4e5564'),
        dict(id='barracks', name='Barracks', rect=union(['barracks']), eaves=H['low_eaves'], ridge=H['low_ridge'], axis='x', roof='#3e4450'),
        dict(id='stable', name='Stables', rect=union(['stable']), eaves=H['low_eaves'], ridge=H['low_ridge'], axis='z', roof='#3e4450'),
        dict(id='smithy', name='Castle smithy', rect=union(['smithy']), eaves=H['low_eaves'], ridge=H['low_ridge'], axis='x', roof='#3e4450'),
    ]
    dj = rooms['donjon_g']['geom']
    djc = T(dj[0], dj[1])
    gates = {g['id']: dict(g, w=T(g['x'], g['y'])) for g in C['gates']}
    return dict(
        curtain=[T(x, y) for x, y in C['curtain']],
        thickness=C['curtain_thickness'],
        cross=[T(x, y) for x, y in C['cross_wall']],
        cross_thickness=C.get('cross_wall_thickness', C['curtain_thickness']),
        towers=[dict(name=t['name'], x=T(t['x'], t['y'])[0], z=T(t['x'], t['y'])[1], r=t['r'], h=t['h']) for t in C['towers']],
        donjon=dict(x=djc[0], z=djc[1], r=dj[2], h=H['donjon']),
        blocks=blocks,
        gates=gates,
        heights=H,
    )


def portal_positions(D):
    pc = D['portal_court']
    cx, cz = pc['center']
    out = []
    for i, p in enumerate(D['portals']):
        a = math.radians(p['angle'])
        x, z = cx + math.cos(a) * pc['ring_radius'], cz + math.sin(a) * pc['ring_radius']
        out.append(dict(p, n=i + 1, x=x, z=z, face=math.atan2(cx - x, cz - z)))
    return out


def portal_open_rule(p):
    return p.get('open_rule', 'dormant')


def R_title_lines(name, max_chars=11):
    """Port of portalFx.ts titleLines: one line if it fits, else the most balanced word split."""
    up = name.upper().strip()
    words = up.split()
    if len(up) <= max_chars or len(words) < 2:
        return [up]
    return min(([' '.join(words[:i]), ' '.join(words[i:])] for i in range(1, len(words))), key=lambda ab: max(len(ab[0]), len(ab[1])))


def portal_svg(cx, cy, rx, ry, p, detail=True):
    """Schematic stand-in for the portalFx.ts window: zone-colour halo (HALO 1.14), an oval
    showing a layered destination glimpse (sky, horizon, silhouettes, ground) from GLIMPSES, a
    bright energy rim. Dormant slots: a dark membrane with a dim cold rim, no halo. Not the shader."""
    o = []
    g = p.get('glimpse')
    if portal_open_rule(p) == 'dormant' or not g:
        o.append(f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(rx)}" ry="{f(ry)}" fill="#0c0c10" fill-opacity="0.94"/>')
        if detail:
            o.append(f'<ellipse cx="{f(cx)}" cy="{f(cy + ry * 0.1)}" rx="{f(rx * 0.55)}" ry="{f(ry * 0.5)}" fill="#1c1d24"/>')
        o.append(f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(rx)}" ry="{f(ry)}" fill="none" stroke="#5c5e68" stroke-width="{2 if detail else 1.2}"/>')
        return '\n'.join(o)
    col = p['color']
    o.append(f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(rx * 1.14)}" ry="{f(ry * 1.14)}" fill="{col}" fill-opacity="0.35"/>')
    o.append(f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(rx * 1.07)}" ry="{f(ry * 1.07)}" fill="{col}" fill-opacity="0.35"/>')

    def band(topf, botf, fill):
        n = 24 if detail else 10
        top, bot = [], []
        for i in range(n + 1):
            u = -1 + 2 * i / n
            u = max(-0.999, min(0.999, u))
            hh = ry * math.sqrt(1 - u * u)
            yt, yb = max(topf(u), cy - hh), min(botf(u), cy + hh)
            if yt < yb:
                top.append((cx + u * rx, yt))
                bot.append((cx + u * rx, yb))
        if len(top) > 1:
            o.append(poly_svg(top + bot[::-1], fill))
    st = g['style']
    if st == 'cave':
        sil = lambda u: cy - ry * (0.55 - 0.35 * abs(u) ** 0.6) if abs(u) > 0.25 else cy - ry * 0.75
    elif st == 'forest':
        sil = lambda u: cy + ry * (0.05 - 0.28 * abs(math.sin(u * 7.5)))
    elif st == 'water':
        sil = lambda u: cy - ry * (0.45 if any(abs(u - c) < 0.08 for c in (-0.5, -0.1, 0.35)) else -0.05)
    else:
        sil = lambda u: cy + ry * (0.15 - 0.55 * max(0, 1 - abs(((u * 3) % 1) - 0.5) * 3))
    inf = 1e9
    band(lambda u: -inf, lambda u: cy - ry * 0.25, g['skyTop'])
    band(lambda u: cy - ry * 0.3, lambda u: cy + ry * 0.2, g['skyLow'])
    if st == 'cave':
        band(lambda u: -inf, sil, g['sil'])
        band(lambda u: cy + ry * 0.3, lambda u: inf, g['ground'])
    else:
        band(sil, lambda u: cy + ry * 0.35, g['sil'])
        band(lambda u: cy + ry * 0.35, lambda u: inf, g['ground'])
    o.append(f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(rx * 0.93)}" ry="{f(ry * 0.93)}" fill="none" stroke="{col}" stroke-opacity="0.6" stroke-width="{3 if detail else 1.5}"/>')
    o.append(f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(rx)}" ry="{f(ry)}" fill="none" stroke="{col}" stroke-width="{3 if detail else 1.8}"/>')
    if detail:
        o.append(f'<path d="M {f(cx - rx * 0.7)} {f(cy - ry * 0.71)} A {f(rx)} {f(ry)} 0 0 1 {f(cx + rx * 0.2)} {f(cy - ry * 0.98)}" fill="none" stroke="#fff6dc" stroke-width="1.6" stroke-opacity="0.85"/>')
    return '\n'.join(o)


def hsh(*v):
    s = math.sin(sum((i + 1) * 12.9898 * x for i, x in enumerate(v)) + 78.233) * 43758.5453
    return s - math.floor(s)


def tree_points(D):
    land = outline_pts(D)
    P = patches(D)
    sp = D['tree_belts']['spacing']
    pts = []
    blockers = []
    for b in D['buildings']:
        blockers.append(('rect', b['x'] - 2.5, b['z'] - 2.5, b['x'] + b['w'] + 2.5, b['z'] + b['d'] + 2.5))
    res = [[tuple(q) for q in r['poly']] for r in D['reserved']]
    belts = [[tuple(q) for q in b] for b in D['tree_belts']['belts']]
    for bi, belt in enumerate(belts):
        xs = [p[0] for p in belt]
        zs = [p[1] for p in belt]
        z = min(zs)
        row = 0
        while z <= max(zs):
            x = min(xs) + (sp / 2 if row % 2 else 0)
            while x <= max(xs):
                jx = x + (hsh(x, z, bi) - 0.5) * 1.8
                jz = z + (hsh(z, x, bi + 3) - 0.5) * 1.8
                ok = pip(jx, jz, belt) and pip(jx, jz, land) and poly_edge_dist(jx, jz, land) > 3
                if ok:
                    for r in D['routes']:
                        if polyline_dist(jx, jz, r['points']) < r['width'] / 2 + 2:
                            ok = False
                            break
                if ok and polyline_dist(jx, jz, D['water']['stream']) < 3.5:
                    ok = False
                if ok:
                    for kind, a, b2, c, d in blockers:
                        if a <= jx <= c and b2 <= jz <= d:
                            ok = False
                if ok and any(pip(jx, jz, r) for r in res):
                    ok = False
                if ok:
                    pts.append((round(jx, 2), round(jz, 2), height_at(D, jx, jz, P)))
                x += sp
            z += sp * 0.87
            row += 1
    # orchard rows
    orch = next(a for a in D['areas'] if a['id'] == 'orchard')
    op = [tuple(q) for q in orch['poly']]
    orchard = []
    for z in range(72, 96, 5):
        for x in range(204, 238, 5):
            ok = pip(x, z, op) and all(polyline_dist(x, z, r['points']) > r['width'] / 2 + 1.6 for r in D['routes'])
            if ok:
                orchard.append((x, z, height_at(D, x, z, P)))
    return pts, orchard


def current_outline(D, n=240):
    cb = D['current_island_basis']
    cx, cz = cb['center']
    rim, e = cb['rim'], cb['exponent']
    pts = []
    for i in range(n):
        a = 2 * math.pi * i / n
        c, s = math.cos(a), math.sin(a)
        t = rim / ((abs(c) ** e + abs(s) ** e) ** (1 / e))
        pts.append((cx + c * t, cz + s * t))
    return pts


# ─── svg helpers ─────────────────────────────────────────────────────────────

def esc(s):
    return str(s).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def f(v):
    return f'{v:.1f}'


def poly_svg(pts, fill='none', stroke='none', sw=0, extra=''):
    p = ' '.join(f'{f(x)},{f(y)}' for x, y in pts)
    return f'<polygon points="{p}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}" stroke-linejoin="round" {extra}/>'


def line_svg(pts, stroke, sw, extra=''):
    p = ' '.join(f'{f(x)},{f(y)}' for x, y in pts)
    return f'<polyline points="{p}" fill="none" stroke="{stroke}" stroke-width="{sw}" stroke-linejoin="round" stroke-linecap="round" {extra}/>'


def text_svg(x, y, s, size=16, fill='#222', anchor='start', weight='normal', extra=''):
    return (f'<text x="{f(x)}" y="{f(y)}" font-family="{FONT}" font-size="{size}" fill="{fill}" '
            f'text-anchor="{anchor}" font-weight="{weight}" {extra}>{esc(s)}</text>')


def tw(s, size, bold=False):
    return len(s) * size * (0.66 if bold else 0.58)


def label_box(x, y, lines, size=15, fill='#fffdf6', stroke='#3a2e26', tag=None, anchor='start', bold_first=True):
    """Multi-line label with a solid backing box; (x, y) is the top-left (or top-centre)."""
    w = max(tw(l, size, bold_first and i == 0) for i, l in enumerate(lines)) + 14
    if tag:
        w = max(w, len(tag[0]) * (size - 3) * 0.74 + 14)  # tag = (text, colour); bold capitals run wider than tw()
    h = len(lines) * (size + 4) + 8 + (size + 1 if tag else 0)
    x0 = x - w / 2 if anchor == 'middle' else x
    out = [f'<rect x="{f(x0)}" y="{f(y)}" width="{f(w)}" height="{f(h)}" rx="4" fill="{fill}" stroke="{stroke}" stroke-width="1.4"/>']
    ty = y + size + 3
    for i, l in enumerate(lines):
        out.append(text_svg(x0 + 7, ty, l, size, '#1e1a16', weight='bold' if (bold_first and i == 0) else 'normal'))
        ty += size + 4
    if tag:
        col = tag[1]
        out.append(text_svg(x0 + 7, ty - 1, tag[0], size - 3, col, weight='bold'))
    return '\n'.join(out), (x0, y, w, h)


def wrap(s, n):
    words, lines, cur = s.split(), [], ''
    for w in words:
        if len(cur) + len(w) + 1 > n and cur:
            lines.append(cur)
            cur = w
        else:
            cur = (cur + ' ' + w).strip()
    if cur:
        lines.append(cur)
    return lines


def header(W, title, sub):
    return '\n'.join([
        f'<rect x="0" y="0" width="{W}" height="92" fill="#2b2220"/>',
        f'<rect x="0" y="92" width="{W}" height="5" fill="#b8322a"/>',
        text_svg(28, 44, title, 32, '#f6ecd8', weight='bold'),
        text_svg(28, 76, sub, 18, '#e2d3b8'),
        f'<rect x="{W - 560}" y="10" width="540" height="74" rx="6" fill="#b8322a" stroke="#f0c060" stroke-width="2.5"/>',
        text_svg(W - 290, 42, 'PROPOSAL - NOT IMPLEMENTED / OPUS-AUTHORED', 20, '#ffffff', 'middle', 'bold'),
        text_svg(W - 290, 70, 'CASTLE SITE PROVISIONAL  -  nothing approved to build', 17, '#ffe6a8', 'middle', 'bold'),
    ])


def footer(W, H, s):
    return '\n'.join([
        f'<rect x="0" y="{H - 34}" width="{W}" height="34" fill="#2b2220"/>',
        text_svg(20, H - 11, s, 15, '#e2d3b8'),
        text_svg(W - 20, H - 11, 'PROPOSAL - NOT IMPLEMENTED / OPUS-AUTHORED  |  CASTLE SITE PROVISIONAL', 15, '#f0c060', 'end', 'bold'),
    ])


GRASS = {0: '#6f9a4c', 3: '#7ea656', 5: '#86ab5a', 7: '#8fb262', 11: '#9cba6a'}


# ─── TOP-DOWN ────────────────────────────────────────────────────────────────

def render_topdown(D, C, dhash):
    W, H = 2400, 1420
    S = 4.85
    OX, OY = 8, 125

    def M(x, z):
        return (OX + x * S, OY + z * S)

    def MP(pts):
        return [M(x, z) for x, z in pts]

    land = outline_pts(D)
    P = patches(D)
    CG = castle_geom(D, C)
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">',
           f'<!-- design-sha256:{dhash} -->',
           f'<rect width="{W}" height="{H}" fill="#f3ead8"/>']
    # map frame: the sky void
    mx0, my0 = M(0, -4)
    mx1, my1 = M(292, 228)
    out.append(f'<rect x="{f(mx0)}" y="{f(my0)}" width="{f(mx1 - mx0)}" height="{f(my1 - my0)}" fill="#2a2140"/>')
    for i in range(140):
        sx = mx0 + hsh(i, 1) * (mx1 - mx0)
        sy = my0 + hsh(i, 2) * (my1 - my0)
        if not pip((sx - OX) / S, (sy - OY) / S, land):
            out.append(f'<circle cx="{f(sx)}" cy="{f(sy)}" r="{f(0.8 + hsh(i, 3) * 1.2)}" fill="#8f82b8"/>')
    # rock underside shadow (void below)
    out.append(poly_svg([(x + 9, y + 14) for x, y in MP(land)], '#17112a'))
    # base land + patches
    for p in sorted(P, key=lambda p: p['h']):
        pts = MP(p['pts'])
        out.append(poly_svg(pts, GRASS[p['h']], '#4b3a2a' if p['h'] else 'none', 2.2 if p['h'] else 0))
        if p['h']:
            # slope ticks pointing downhill (outward)
            sgn = 1 if area(p['pts']) > 0 else -1
            poly = p['pts']
            for i in range(len(poly)):
                a, b = poly[i], poly[(i + 1) % len(poly)]
                L = math.hypot(b[0] - a[0], b[1] - a[1])
                nx, nz = (b[1] - a[1]) / L * sgn * -1, -(b[0] - a[0]) / L * sgn * -1
                k = 0.0
                step = 2.4 if p['h'] >= 5 else 3.2
                while k < L:
                    px, pz = a[0] + (b[0] - a[0]) * k / L, a[1] + (b[1] - a[1]) * k / L
                    ln = 2.6 if p['h'] >= 5 else 1.6
                    out.append(line_svg([M(px, pz), M(px + nx * ln, pz + nz * ln)], '#5d4a36', 1.3))
                    k += step
    # reserved ground
    for r in D['reserved']:
        pts = MP(r['poly'])
        out.append(poly_svg(pts, '#e8e2d0', '#555555', 2.4, 'fill-opacity="0.38" stroke-dasharray="10,6"'))
    # areas
    for a in D['areas']:
        k = a['kind']
        if k == 'fields':
            for i, (x, z, w, d) in enumerate(a['rects']):
                out.append(poly_svg(MP([(x, z), (x + w, z), (x + w, z + d), (x, z + d)]), ['#c9b46a', '#b9a65a', '#a8b85e', '#c4b070'][i % 4], '#7a6640', 1.4))
                for j in range(1, int(d / 2)):
                    out.append(line_svg([M(x + 0.6, z + j * 2), M(x + w - 0.6, z + j * 2)], '#8f7c48', 0.9))
        elif k == 'orchard':
            out.append(poly_svg(MP(a['poly']), '#86b05e', '#56743a', 1.6, 'stroke-dasharray="4,3"'))
        elif k == 'green':
            x, z, r = a['circle']
            cx, cy = M(x, z)
            out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * S)}" fill="#98c66e" stroke="#56743a" stroke-width="1.6"/>')
            out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(1.1 * S)}" fill="#8a8a8a" stroke="#333" stroke-width="1.2"/>')
        elif k == 'garden':
            out.append(poly_svg(MP(a['poly']), '#a3c77a', '#5c7a3e', 1.6))
            for i in range(3):
                for j in range(2):
                    cx, cy = M(a['poly'][0][0] + 4 + i * 6, a['poly'][0][1] + 5 + j * 8)
                    out.append(f'<rect x="{f(cx - 4)}" y="{f(cy - 3)}" width="8" height="6" fill="#bdb6a6" stroke="#555" stroke-width="0.8"/>')
    # water
    st = D['water']['stream']
    out.append(line_svg(MP(st), '#2f5e85', D['water']['stream_width'] * S + 2.5))
    out.append(line_svg(MP(st), '#5aa0d0', D['water']['stream_width'] * S))
    px, pz, pr = D['water']['pond']
    cx, cy = M(px, pz)
    out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(pr * S)}" fill="#5aa0d0" stroke="#2f5e85" stroke-width="2"/>')
    ex, ey = M(*st[-1])
    for k in range(4):
        out.append(line_svg([(ex - 6 + k * 4, ey), (ex - 9 + k * 4, ey + 26 + k * 5)], '#8cc4e8', 2, 'stroke-dasharray="5,4"'))
    # court clearing
    pc = D['portal_court']
    cx, cy = M(*pc['center'])
    out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(pc["radius"] * S)}" fill="#cfc4ac" stroke="#7b6b55" stroke-width="2"/>')
    # routes
    for r in D['routes']:
        pts = MP(r['points'])
        wpx = r['width'] * S
        if r['kind'] == 'primary':
            out.append(line_svg(pts, '#6b5a46', wpx + 3))
            out.append(line_svg(pts, '#dcd0b6', wpx))
        else:
            out.append(line_svg(pts, '#6e5434', wpx + 2.4))
            out.append(line_svg(pts, '#c6a670', wpx))
        for g in r.get('grade', []):
            a, b = r['points'][g], r['points'][g + 1]
            n = 7
            for k in range(1, n):
                qx, qz = a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n
                L = math.hypot(b[0] - a[0], b[1] - a[1])
                nx, nz = -(b[1] - a[1]) / L, (b[0] - a[0]) / L
                hw = r['width'] / 2
                out.append(line_svg([M(qx - nx * hw, qz - nz * hw), M(qx + nx * hw, qz + nz * hw)], '#4b3a2a', 1.5))
        for bx, bz in r.get('bridges', []):
            ax, ay = M(bx, bz)
            out.append(f'<rect x="{f(ax - 2.2 * S)}" y="{f(ay - 1.6 * S)}" width="{f(4.4 * S)}" height="{f(3.2 * S)}" fill="#8a5a32" stroke="#3b2414" stroke-width="1.5"/>')
    # landing + stations
    lx, ly = M(*pc['landing'])
    out.append(f'<rect x="{f(lx - 2.5 * S)}" y="{f(ly - 2.5 * S)}" width="{f(5 * S)}" height="{f(5 * S)}" fill="#9fb8d8" stroke="#3c5a80" stroke-width="2"/>')
    # castle
    cur = MP(CG['curtain'])
    crown = next(p for p in P if p['id'] == 'crown')
    out.append(poly_svg(cur, '#d8c49e', 'none', 0))
    out.append(poly_svg(cur, 'none', '#3a2c22', CG['thickness'] * S + 2.5))
    out.append(poly_svg(cur, 'none', '#8a7660', CG['thickness'] * S))
    out.append(line_svg(MP(CG['cross']), '#3a2c22', CG['cross_thickness'] * S + 2.5))
    out.append(line_svg(MP(CG['cross']), '#8a7660', CG['cross_thickness'] * S))
    for b in CG['blocks']:
        x0, z0, x1, z1 = b['rect']
        out.append(poly_svg(MP([(x0, z0), (x1, z0), (x1, z1), (x0, z1)]), b['roof'], '#1f1f26', 1.6))
        if b['axis'] == 'x':
            out.append(line_svg([M(x0, (z0 + z1) / 2), M(x1, (z0 + z1) / 2)], '#9aa0b0', 1.2))
        else:
            out.append(line_svg([M((x0 + x1) / 2, z0), M((x0 + x1) / 2, z1)], '#9aa0b0', 1.2))
    dj = CG['donjon']
    cx, cy = M(dj['x'], dj['z'])
    out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(dj["r"] * S)}" fill="#5d5a62" stroke="#1f1f26" stroke-width="2"/>')
    for t in CG['towers']:
        cx, cy = M(t['x'], t['z'])
        out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(t["r"] * S)}" fill="#6c6470" stroke="#1f1f26" stroke-width="2"/>')
    for gid, g in CG['gates'].items():
        cx, cy = M(*g['w'])
        out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="7" fill="#f0c060" stroke="#7a1d18" stroke-width="2.5"/>')
    # buildings
    for b in D['buildings']:
        x, z, w, d = b['x'], b['z'], b['w'], b['d']
        out.append(poly_svg(MP([(x, z), (x + w, z), (x + w, z + d), (x, z + d)]), b['roof'], '#1e1a16', 2))
        if b.get('flat'):
            out.append(poly_svg(MP([(x + 1, z + 1), (x + w - 1, z + 1), (x + w - 1, z + d - 1), (x + 1, z + d - 1)]), 'none', '#9aa0b0', 1))
        elif w >= d:
            out.append(line_svg([M(x, z + d / 2), M(x + w, z + d / 2)], '#e6d2b0', 1.4))
        else:
            out.append(line_svg([M(x + w / 2, z), M(x + w / 2, z + d)], '#e6d2b0', 1.4))
        out.append(poly_svg(MP([(x, z), (x + w, z), (x + w, z + d), (x, z + d)]), 'none', STATUS_COL[b['status']], 2.6, 'stroke-dasharray="7,4"'))
        for dx, dz in b['doors']:
            cx, cy = M(dx, dz)
            out.append(f'<rect x="{f(cx - 5)}" y="{f(cy - 5)}" width="10" height="10" fill="#f7e27a" stroke="#1e1a16" stroke-width="1.5"/>')
    for s in D['stations']:
        cx, cy = M(*s['at'])
        if s['id'] == 'landing':
            continue
        col = STATUS_COL[s['status']]
        out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(max(3.5, s["r"] * S))}" fill="{col}" stroke="#fff" stroke-width="1.5"/>')
    # market stalls
    for sx, sz in next(a for a in D['areas'] if a['id'] == 'market')['points']:
        cx, cy = M(sx, sz)
        out.append(f'<rect x="{f(cx - 1.4 * S)}" y="{f(cy - 0.9 * S)}" width="{f(2.8 * S)}" height="{f(1.8 * S)}" fill="#b84a3a" stroke="#fff" stroke-width="1.2"/>')
    # lookout + spring
    for aid, col in (('lookout', '#cfc4ac'), ('spring', '#5aa0d0')):
        x, z, r = next(a for a in D['areas'] if a['id'] == aid)['circle']
        cx, cy = M(x, z)
        out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * S)}" fill="{col}" stroke="#4b3a2a" stroke-width="1.8"/>')
    # portals: base slab + oval seen edge-on (2.2 wide) + halo ring
    for p in portal_positions(D):
        cx, cy = M(p['x'], p['z'])
        ang = -math.degrees(p['face'])
        out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(1.4 * S + 3)}" fill="{p["color"]}" fill-opacity="0.35" stroke="{p["color"]}" stroke-width="2"/>')
        out.append(f'<g transform="translate({f(cx)},{f(cy)}) rotate({f(ang)})"><rect x="{f(-1.4 * S)}" y="{f(-0.8 * S)}" width="{f(2.8 * S)}" height="{f(1.6 * S)}" fill="#9d9282" stroke="#333" stroke-width="1"/>'
                   f'<rect x="{f(-1.1 * S)}" y="{f(-0.25 * S)}" width="{f(2.2 * S)}" height="{f(0.5 * S)}" fill="{p["color"]}" stroke="#111" stroke-width="0.8"/></g>')
    # trees
    trees, orchard = tree_points(D)
    for x, z, h in trees + orchard:
        cx, cy = M(x, z)
        col = '#3f7a32' if (x, z) not in [(o[0], o[1]) for o in orchard] else '#5a9a3c'
        out.append(f'<rect x="{f(cx - 1.2 * S)}" y="{f(cy - 1.2 * S)}" width="{f(2.4 * S)}" height="{f(2.4 * S)}" fill="{col}" stroke="#244a1e" stroke-width="1"/>')
        out.append(f'<rect x="{f(cx - 0.7 * S)}" y="{f(cy - 0.9 * S)}" width="{f(1.4 * S)}" height="{f(1.4 * S)}" fill="#6fb04a"/>')
    # coastline edges: torn vs old
    ol = D['outline']
    for i in range(len(ol)):
        a, b = ol[i], ol[(i + 1) % len(ol)]
        if a[2] == 'torn':
            out.append(line_svg([M(a[0], a[1]), M(b[0], b[1])], '#120d18', 7))
            out.append(line_svg([M(a[0], a[1]), M(b[0], b[1])], '#a8442c', 2.2))
        else:
            out.append(line_svg([M(a[0], a[1]), M(b[0], b[1])], '#6b5038', 4.5))
            out.append(line_svg([M(a[0], a[1]), M(b[0], b[1])], '#c8a878', 1.6))
    # elevation marks
    for (x, z, s) in [(70, 30, 'h +11 crown'), (34, 92, 'h +5'), (130, 30, 'h +5'), (196, 26, 'h +7 upland'), (244, 116, 'h +3'), (182, 100, 'h 0 lowland'), (95, 186, 'h 0'), (150, 168, 'h 0')]:
        cx, cy = M(x, z)
        out.append(f'<rect x="{f(cx - tw(s, 14, True) / 2 - 5)}" y="{f(cy - 14)}" width="{f(tw(s, 14, True) + 10)}" height="19" rx="9" fill="#2b2220" fill-opacity="0.78"/>')
        out.append(text_svg(cx, cy, s, 14, '#f6ecd8', 'middle', 'bold'))
    # district labels
    labels = [
        (54, 56, ['CASTLE-V2 FOOTPRINT (PROVISIONAL)', 'rigid move +28,+12, rotation 0, no scaling', 'courtyard/W2 detail omitted: separate castle-v2 task'], ('CASTLE SITE PROVISIONAL - not approved', '#b8322a'), None),
        (186, 112, ['Bank + side vault'], ('RELOCATED; vault LOCKED', STATUS_COL['RELOCATED']), (182, 122)),
        (182, 166, ['Quartermaster + stalls'], (STATUS_TXT['RELOCATED'], STATUS_COL['RELOCATED']), (172, 158)),
        (86, 116, ['Smelter + forge yard'], (STATUS_TXT['RELOCATED'], STATUS_COL['RELOCATED']), (108, 130)),
        (6, 148, ['Farm, fields, paddock'], (STATUS_TXT['RELOCATED'], STATUS_COL['RELOCATED']), (52, 140)),
        (66, 192, ['Alchemy lab plot + pond'], (STATUS_TXT['LOCKED'], STATUS_COL['LOCKED']), (100, 178)),
        (168, 184, ['Memorial garden, lookout'], (STATUS_TXT['RELOCATED'], STATUS_COL['RELOCATED']), (158, 190)),
        (102, 160, ['Green + well'], ('RELOCATED', STATUS_COL['RELOCATED']), (116, 158)),
        (210, 54, ['Orchard'], ('RELOCATED', STATUS_COL['RELOCATED']), (214, 72)),
        (242, 66, ['Rune altar plot'], ('LOCKED/RESTORABLE', STATUS_COL['LOCKED']), (246, 76)),
        (156, 62, ['Hatchery plot'], ('LOCKED/RESTORABLE', STATUS_COL['LOCKED']), (184, 42)),
        (220, 140, ['EAST SHELF'], ('RESERVED/UNDECIDED', STATUS_COL['RESERVED']), None),
        (170, 66, [], None, None),
        (40, 168, ['SW terrace'], ('RESERVED', STATUS_COL['RESERVED']), None),
        (166, 30, ['NE upland'], ('RESERVED', STATUS_COL['RESERVED']), None),
        (150, 84, ['PORTAL COURT', 'six slots, arrival, Warden, board'], (STATUS_TXT['RELOCATED'], STATUS_COL['RELOCATED']), None),
    ]
    for lx, lz, lines, tag, lead in labels:
        if not lines:
            continue
        x, y = M(lx, lz)
        s, (bx, by, bw, bh) = label_box(x, y, lines, 15, tag=tag)
        if lead:
            tx, ty = M(*lead)
            ax = min(max(tx, bx), bx + bw)
            ay = min(max(ty, by), by + bh)
            out.append(line_svg([(ax, ay), (tx, ty)], '#1e1a16', 1.6))
            out.append(f'<circle cx="{f(tx)}" cy="{f(ty)}" r="3" fill="#1e1a16"/>')
        out.append(s)
    # edge annotations
    for (x, z, s, col) in [(60, -0.8, 'FRESH TORN FACE - angular, sheer (N)', '#f3b8a8'), (1, 172, 'TORN FACE (W)', '#f3b8a8'),
                           (158, 225, 'OLDER WEATHERED EDGE - rounded lobes and headlands (S, E)', '#e8d6b0'),
                           (156, 6, 'fresh fracture, unbridged', '#f3b8a8'), (230, 6, 'SKY VOID - no sea', '#b8acd8'),
                           (44, 210, 'stream spills into the void', '#bfe0f4')]:
        cx, cy = M(x, z)
        out.append(text_svg(cx, cy, s, 15, col, 'start', 'bold'))
    # callout numbers
    for c in D['callouts']:
        cx, cy = M(*c['at'])
        out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="14" fill="#b8322a" stroke="#fff" stroke-width="2.5"/>')
        out.append(text_svg(cx, cy + 6, str(c['n']), 17, '#fff', 'middle', 'bold'))
    # portal numbers
    for p in portal_positions(D):
        a = math.radians(p['angle'])
        cx, cy = M(p['x'] + math.cos(a) * 3.6, p['z'] + math.sin(a) * 3.6)
        out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="9" fill="#1e1a16"/>')
        out.append(text_svg(cx, cy + 5, f'{p["n"]}', 13, p['color'] if portal_open_rule(p) != 'dormant' else '#d0d0d0', 'middle', 'bold'))
    # scale bar + north
    sx, sy = M(10, 222)
    out.append(f'<rect x="{f(sx - 6)}" y="{f(sy - 24)}" width="{f(50 * S + 150)}" height="48" rx="4" fill="#f3ead8" fill-opacity="0.92"/>')
    for k in range(5):
        out.append(f'<rect x="{f(sx + k * 10 * S)}" y="{f(sy - 4)}" width="{f(10 * S)}" height="8" fill="{"#1e1a16" if k % 2 == 0 else "#f3ead8"}" stroke="#1e1a16" stroke-width="1"/>')
    out.append(text_svg(sx, sy + 20, '0', 14, '#1e1a16'))
    out.append(text_svg(sx + 50 * S, sy + 20, '50 cells (1 cell = 1 world unit)', 14, '#1e1a16', 'middle'))
    out.append(text_svg(sx, sy - 9, 'N up  |  +z south = camera side', 14, '#1e1a16', 'start', 'bold'))

    # ── side panel
    px = 1440
    out.append(f'<rect x="{px}" y="106" width="{W - px - 14}" height="{H - 106 - 46}" fill="#fbf6ea" stroke="#3a2e26" stroke-width="1.5"/>')
    y = 136
    out.append(text_svg(px + 18, y, 'STATUS KEY', 19, '#1e1a16', weight='bold'))
    y += 10
    for i, k in enumerate(['RELOCATED', 'LOCKED', 'NEW', 'RESERVED']):
        cx = px + 18 + (i % 2) * 460
        cy = y + 12 + (i // 2) * 28
        dash = 'stroke-dasharray="7,4"' if k in ('RELOCATED', 'LOCKED', 'RESERVED') else ''
        out.append(f'<rect x="{cx}" y="{cy}" width="34" height="18" fill="#fff" stroke="{STATUS_COL[k]}" stroke-width="3" {dash}/>')
        out.append(text_svg(cx + 44, cy + 15, STATUS_TXT[k], 15, STATUS_COL[k], weight='bold'))
    y += 84
    out.append(text_svg(px + 18, y, 'All physical placements here are proposals. Routes are NEW PROPOSAL. Doors = yellow squares; ramps = cross-hatched.', 14, '#333'))
    y += 22
    out.append(text_svg(px + 18, y, 'Edges: dark + red line = fresh torn face; brown + tan = older weathered edge. Ticks = slope downhill.', 14, '#333'))
    y += 34
    out.append(text_svg(px + 18, y, 'WHY THIS SITE AND THESE ROUTES', 19, '#1e1a16', weight='bold'))
    y += 8
    for c in D['callouts']:
        lines = wrap(c['text'], 98)
        out.append(f'<circle cx="{px + 30}" cy="{y + 16}" r="11" fill="#b8322a"/>')
        out.append(text_svg(px + 30, y + 21, str(c['n']), 14, '#fff', 'middle', 'bold'))
        for i, l in enumerate(lines):
            out.append(text_svg(px + 50, y + 21 + i * 19, l, 15, '#1e1a16'))
        y += 19 * len(lines) + 8
    y += 16
    out.append(text_svg(px + 18, y, 'SERVICE / ACCESS INVENTORY (from zoneMaps.ts stations, KEEP_ARCHES, zones.ts)', 19, '#1e1a16', weight='bold'))
    y += 24
    out.append(text_svg(px + 18, y, 'Portal slots: all six PRESENT as current destination slots (ring, angles, 2.2 x 3.0 ovals kept).', 15, '#1e1a16', weight='bold'))
    y += 19
    out.append(text_svg(px + 18, y, 'CURRENT OPEN STATE is runtime save state (story.ts portalState), unchanged and not assumed here:', 14, '#5a2a20', weight='bold'))
    y += 21
    pp = portal_positions(D)
    for i in range(0, 6, 2):
        for j in range(2):
            p = pp[i + j]
            cx = px + 26 + j * 460
            out.append(f'<rect x="{cx}" y="{y - 13}" width="16" height="16" fill="{p["color"]}" stroke="#333"/>')
            out.append(text_svg(cx + 24, y, f'P{p["n"]} {p["name"]} - {p["short"]}', 15, '#1e1a16'))
        y += 21
    out.append(text_svg(px + 18, y, 'Destinations stay separate fragments: no mine, combat or boss loop is placed on this island.', 14, '#555'))
    y += 26
    lnd = D['portal_court']['landing']
    cap = D['current_access_points']

    def dist(a, b):
        return math.hypot(a[0] - b[0], a[1] - b[1])
    rows = [
        ('Warden (npc) + arrival landing', D['stations'][1]['at'], cap['warden'], 'RELOCATED'),
        ('Restoration board (now in keep)', D['stations'][2]['at'], None, 'RELOCATED'),
        ('Quartermaster shop door', D['buildings'][3]['doors'][0], cap['shop'], 'RELOCATED'),
        ('Smelter door (furnace); anvil, Emberforge', D['buildings'][0]['doors'][0], cap['smelter'], 'RELOCATED'),
        ('Bank door (vault restore inside)', D['buildings'][1]['doors'][0], cap['bank'], 'RELOCATED'),
        ('Alchemy lab plot door (restore)', D['buildings'][4]['doors'][0], cap['alchemy_plot'], 'LOCKED'),
        ('Rune altar plot (restore)', D['buildings'][5]['doors'][0], None, 'LOCKED'),
        ('Hatchery plot (restore)', D['buildings'][6]['doors'][0], None, 'LOCKED'),
    ]
    out.append(text_svg(px + 18, y, 'Plan distance to landing (straight line, cells)', 15, '#1e1a16', weight='bold'))
    out.append(text_svg(px + 600, y, 'proposed', 15, '#1e1a16', 'end', 'bold'))
    out.append(text_svg(px + 820, y, 'current', 15, '#555', 'end', 'bold'))
    y += 21
    for name, pnew, pold, stt in rows:
        out.append(f'<rect x="{px + 22}" y="{y - 12}" width="12" height="12" fill="{STATUS_COL[stt]}"/>')
        out.append(text_svg(px + 42, y, name, 15, '#1e1a16'))
        out.append(text_svg(px + 600, y, f'{dist(pnew, lnd):.0f}', 15, '#1e1a16', 'end', 'bold'))
        out.append(text_svg(px + 820, y, f'{dist(pold, cap["landing"]):.0f}' if pold else 'in bailey/keep', 15, '#555', 'end'))
        y += 20
    out.append(text_svg(px + 18, y + 2, 'Layout comparison only: NOT walking/route length, not gameplay proof; current land is nominal.', 14, '#5a2a20'))
    y += 30
    # size comparison inset
    out.append(text_svg(px + 18, y, 'SIZE COMPARISON (same scale, 1.15 px per cell)', 19, '#1e1a16', weight='bold'))
    y += 12
    k = 1.15
    curp = current_outline(D)
    cxs = [p[0] for p in curp]
    czs = [p[1] for p in curp]
    ox1, oy1 = px + 30, y + 10
    out.append(poly_svg([(ox1 + (x - min(cxs)) * k, oy1 + (z - min(czs)) * k) for x, z in curp], '#c9d6a8', '#4b3a2a', 2))
    cw, cd = max(cxs) - min(cxs), max(czs) - min(czs)
    ca = abs(area(curp))
    lxs = [p[0] for p in land]
    lzs = [p[1] for p in land]
    ox2 = ox1 + cw * k + 50
    out.append(poly_svg([(ox2 + (x - min(lxs)) * k, oy1 + (z - min(lzs)) * k) for x, z in land], '#a9c47e', '#4b3a2a', 2))
    out.append(poly_svg([(ox2 + (x - min(lxs)) * k, oy1 + (z - min(lzs)) * k) for x, z in CG['curtain']], '#d8c49e', '#3a2c22', 1.5))
    la = abs(area(land))
    tx = ox2 + (max(lxs) - min(lxs)) * k + 22
    yy = oy1 + 16
    for s, bold in [('CURRENT (left, nominal)', True), (f'~{cw:.0f} x {cd:.0f} cells, ~{ca:,.0f} cells land', False),
                    ('superellipse rim 64.5 on a 150x150 grid;', False), ('rim noise +/-6.5 and lookout spur ignored;', False),
                    ('the 150x150 grid is NOT all ground', False), ('', False),
                    ('PROPOSED (right)', True), (f'{max(lxs) - min(lxs):.0f} x {max(lzs) - min(lzs):.0f} cells bounding box', False),
                    (f'{la:,.0f} cells land = ~{la / ca:.1f}x nominal current', False), ('castle-v2 footprint shown in tan', False)]:
        out.append(text_svg(tx, yy, s, 15, '#1e1a16', weight='bold' if bold else 'normal'))
        yy += 19
    out.append(footer(W, H, f'Plan view. 1 cell = 1 world unit; x east, +z south (camera side). Heights h in world units above the portal-court datum. Schematic: not navmesh, collision or runtime shading. design.json sha256 {dhash[:12]}'))
    out.append(header(W, 'DRAGONBOUND HOME ISLAND v1 - TOP-DOWN PLAN: a torn crown-spur fragment',
                      'Castle-v2 footprint on the NW crown spur; portal court and grouped services in the low centre; reserved growth on the East Shelf, NE upland and SW terrace'))
    out.append('</svg>')
    return '\n'.join(out)


# ─── OBLIQUE ─────────────────────────────────────────────────────────────────

K_SKEW = 0.13
COS_EL = 0.866  # view elevation 30 deg: z foreshortened x0.5, heights x0.866 - same units, no exaggeration


def shade(hexc, k):
    hexc = hexc.lstrip('#')
    r, g, b = int(hexc[0:2], 16), int(hexc[2:4], 16), int(hexc[4:6], 16)
    return '#%02x%02x%02x' % tuple(max(0, min(255, int(c * k))) for c in (r, g, b))


def render_oblique(D, C, dhash):
    W, H = 2400, 1560
    land = outline_pts(D)
    P = patches(D)
    CG = castle_geom(D, C)
    S = 6.55
    OX, OY = 300, 330

    def Pj(x, z, h=0.0):
        return (OX + (x - K_SKEW * z) * S, OY + (z * 0.5 - h * COS_EL) * S)

    def HP(x, z):
        h = height_at(D, x, z, P)
        return 0 if h is None else h

    out = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">',
           f'<!-- design-sha256:{dhash} -->']
    # sky void bands
    bands = ['#2a1d44', '#33224f', '#3d2858', '#4a2f62', '#57366b', '#5f3a6f', '#56346a', '#47305e', '#3a2a52', '#2e2346']
    bh = H / len(bands)
    for i, c in enumerate(bands):
        out.append(f'<rect x="0" y="{f(i * bh)}" width="{W}" height="{f(bh + 1)}" fill="{c}"/>')
    for i in range(220):
        out.append(f'<circle cx="{f(hsh(i, 7) * W)}" cy="{f(hsh(i, 8) * H)}" r="{f(0.7 + hsh(i, 9) * 1.4)}" fill="#cfc2ee" fill-opacity="{f(0.3 + hsh(i, 5) * 0.5)}"/>')
    # rock underside: stacked chunky strata shrinking downward
    cx = sum(p[0] for p in land) / len(land)
    cz = sum(p[1] for p in land) / len(land)
    rings = 7
    for k in range(rings, 0, -1):
        sc = 1 - 0.125 * k
        ring = []
        for i, (x, z) in enumerate(land):
            j = (hsh(i, k) - 0.5) * 0.08
            ring.append((cx + (x - cx) * (sc + j), cz + (z - cz) * (sc + j), -(4 + 10.5 * k) - hsh(k, i) * 5))
        col = ['#4a3a30', '#55433a', '#4f3d32', '#5c4839', '#514034', '#5a4636', '#493a2f'][k % 7]
        out.append(poly_svg([Pj(x, z, h) for x, z, h in ring], col, '#2a201c', 1.2))
    # tip
    out.append(poly_svg([Pj(cx - 18, cz + 6, -78), Pj(cx + 14, cz + 10, -80), Pj(cx - 2, cz + 4, -104)], '#3e3029', '#2a201c', 1.2))
    # island skirt (exposed rock face below the lowland)
    for t, col in [(-6, '#6b5442'), (-3.5, '#7d634d'), (-1.5, '#8d7258')]:
        out.append(poly_svg([Pj(x, z, t) for x, z in land], col))
    # torn-face strata accents on visible west face
    # terrain tops with stepped rock skirts
    for p in sorted(P, key=lambda p: p['h']):
        if p['h'] > 0:
            ph = next(q['h'] for q in P if q['id'] == p['parent'])
            t = ph
            i = 0
            while t < p['h']:
                out.append(poly_svg([Pj(x, z, t) for x, z in p['pts']], '#8c7560' if i % 2 == 0 else '#7a6450'))
                t += 0.5
                i += 1
        out.append(poly_svg([Pj(x, z, p['h']) for x, z in p['pts']], GRASS[p['h']], '#556b38', 1.4))
    # waterfall off the old south edge
    sx, sz = D['water']['stream'][-1]
    for k in range(5):
        a = Pj(sx - 1.2 + k * 0.6, sz, 0)
        out.append(line_svg([a, (a[0] - 3 + k, a[1] + 120 + k * 18)], '#a8d8f4', 2.2, 'stroke-opacity="0.75"'))

    # ground-level features
    def gline(pts, col, wd, extra=''):
        return line_svg([Pj(x, z, HP(x, z) + 0.05) for x, z in pts], col, wd, extra)

    def dense(pts, step=1.5):
        o = [pts[0]]
        for a, b in zip(pts, pts[1:]):
            L = math.hypot(b[0] - a[0], b[1] - a[1])
            n = max(1, int(L / step))
            for k in range(1, n + 1):
                o.append((a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n))
        return o

    def route_pts(r):
        """Route points with heights; graded (ramp/stair) segments interpolate between the levels."""
        pts = r['points']
        res = []
        for si, (a, b) in enumerate(zip(pts, pts[1:])):
            L = math.hypot(b[0] - a[0], b[1] - a[1])
            n = max(1, int(L / 1.5))
            ha, hb = HP(*a), HP(*b)
            for k in range(0, n + 1):
                x, z = a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n
                h = ha + (hb - ha) * k / n if si in r.get('grade', []) else HP(x, z)
                res.append(Pj(x, z, h + 0.05))
        return res

    for r in D['reserved']:
        out.append(poly_svg([Pj(x, z, HP(x, z) + 0.05) for x, z in r['poly']], '#efe8d4', '#555', 2, 'fill-opacity="0.30" stroke-dasharray="9,6"'))
    for a in D['areas']:
        if a['kind'] == 'fields':
            for i, (x, z, w, d) in enumerate(a['rects']):
                out.append(poly_svg([Pj(px, pz, 0.05) for px, pz in [(x, z), (x + w, z), (x + w, z + d), (x, z + d)]], ['#c9b46a', '#b9a65a', '#a8b85e', '#c4b070'][i % 4], '#7a6640', 1))
        elif a['kind'] == 'orchard':
            out.append(poly_svg([Pj(x, z, 0.05) for x, z in a['poly']], '#86b05e'))
        elif a['kind'] == 'garden':
            out.append(poly_svg([Pj(x, z, 0.05) for x, z in a['poly']], '#a3c77a', '#5c7a3e', 1))
        elif a['kind'] == 'green':
            x, z, r = a['circle']
            out.append(poly_svg([Pj(x + math.cos(t / 12 * math.pi) * r, z + math.sin(t / 12 * math.pi) * r, 0.05) for t in range(24)], '#98c66e', '#56743a', 1))
    st = dense(D['water']['stream'])
    out.append(gline(st, '#2f5e85', D['water']['stream_width'] * S * 0.75 + 2))
    out.append(gline(st, '#6ab0e0', D['water']['stream_width'] * S * 0.75))
    px_, pz_, pr = D['water']['pond']
    out.append(poly_svg([Pj(px_ + math.cos(t / 12 * math.pi) * pr, pz_ + math.sin(t / 12 * math.pi) * pr, 0.05) for t in range(24)], '#6ab0e0', '#2f5e85', 1.5))
    pc = D['portal_court']
    out.append(poly_svg([Pj(pc['center'][0] + math.cos(t / 18 * math.pi) * pc['radius'], pc['center'][1] + math.sin(t / 18 * math.pi) * pc['radius'], 0.05) for t in range(36)], '#cfc4ac', '#7b6b55', 1.5))
    for r in D['routes']:
        pts = route_pts(r)
        wpx = r['width'] * S * 0.62
        if r['kind'] == 'primary':
            out.append(line_svg(pts, '#6b5a46', wpx + 2.5))
            out.append(line_svg(pts, '#dcd0b6', wpx))
        else:
            out.append(line_svg(pts, '#6e5434', wpx + 2))
            out.append(line_svg(pts, '#c6a670', wpx))
    # castle inner ground (paved wards)
    out.append(poly_svg([Pj(x, z, 11.05) for x, z in CG['curtain']], '#c8b28c'))

    # ── solids, painter-sorted by front z
    items = []

    def box(x0, z0, x1, z1, hb, he, wallc, roofc, ridge=None, axis='x', timber=False, flat=False, parapet=False):
        o = []
        o.append(poly_svg([Pj(x1, z0, hb), Pj(x1, z1, hb), Pj(x1, z1, he), Pj(x1, z0, he)], shade(wallc, 0.78), '#2a221c', 1))
        o.append(poly_svg([Pj(x0, z1, hb), Pj(x1, z1, hb), Pj(x1, z1, he), Pj(x0, z1, he)], wallc, '#2a221c', 1))
        if timber:
            for k in range(1, int(x1 - x0) // 3 + 1):
                xx = x0 + k * 3
                if xx < x1:
                    o.append(line_svg([Pj(xx, z1, hb), Pj(xx, z1, he)], '#4a3020', 1.6))
            o.append(line_svg([Pj(x0, z1, hb + (he - hb) * 0.5), Pj(x1, z1, hb + (he - hb) * 0.5)], '#4a3020', 1.6))
            o.append(poly_svg([Pj(x0, z1, hb), Pj(x1, z1, hb), Pj(x1, z1, hb + 0.8), Pj(x0, z1, hb + 0.8)], '#8a7a68', '#2a221c', 0.8))
        if flat or ridge is None:
            o.append(poly_svg([Pj(x0, z0, he), Pj(x1, z0, he), Pj(x1, z1, he), Pj(x0, z1, he)], roofc, '#1e1a16', 1))
            if parapet:
                n = int((x1 - x0) / 1.6)
                for k in range(n):
                    if k % 2 == 0:
                        xx = x0 + k * 1.6
                        o.append(poly_svg([Pj(xx, z1, he), Pj(xx + 1, z1, he), Pj(xx + 1, z1, he + 0.8), Pj(xx, z1, he + 0.8)], wallc, '#2a221c', 0.8))
        elif axis == 'x':
            zm = (z0 + z1) / 2
            o.append(poly_svg([Pj(x0, z0, he), Pj(x1, z0, he), Pj(x1, zm, ridge), Pj(x0, zm, ridge)], shade(roofc, 0.8), '#1e1a16', 1))
            o.append(poly_svg([Pj(x1, z0, he), Pj(x1, z1, he), Pj(x1, zm, ridge)], shade(wallc, 0.72), '#2a221c', 1))
            o.append(poly_svg([Pj(x0, z1, he), Pj(x1, z1, he), Pj(x1, zm, ridge), Pj(x0, zm, ridge)], roofc, '#1e1a16', 1))
            o.append(line_svg([Pj(x0, zm, ridge), Pj(x1, zm, ridge)], shade(roofc, 1.5), 1.4))
        else:
            xm = (x0 + x1) / 2
            o.append(poly_svg([Pj(x0, z0, he), Pj(x0, z1, he), Pj(xm, z1, ridge), Pj(xm, z0, ridge)], shade(roofc, 1.18), '#1e1a16', 1))
            o.append(poly_svg([Pj(x1, z0, he), Pj(x1, z1, he), Pj(xm, z1, ridge), Pj(xm, z0, ridge)], shade(roofc, 0.82), '#1e1a16', 1))
            o.append(poly_svg([Pj(x0, z1, he), Pj(x1, z1, he), Pj(xm, z1, ridge)], shade(wallc, 0.95), '#2a221c', 1))
            o.append(line_svg([Pj(xm, z0, ridge), Pj(xm, z1, ridge)], shade(roofc, 1.5), 1.4))
        return '\n'.join(o)

    def cyl(x, z, r, hb, ht, wallc, cap, capc='#4e5564'):
        o = []
        a, b = Pj(x, z, hb), Pj(x, z, ht)
        rx, ry = r * S, r * S * 0.5
        o.append(f'<ellipse cx="{f(a[0])}" cy="{f(a[1])}" rx="{f(rx)}" ry="{f(ry)}" fill="{shade(wallc, 0.8)}" stroke="#2a221c" stroke-width="1"/>')
        o.append(f'<rect x="{f(a[0] - rx)}" y="{f(b[1])}" width="{f(rx * 2)}" height="{f(a[1] - b[1])}" fill="{wallc}"/>')
        o.append(f'<rect x="{f(a[0] + rx * 0.35)}" y="{f(b[1])}" width="{f(rx * 0.65)}" height="{f(a[1] - b[1])}" fill="{shade(wallc, 0.8)}"/>')
        o.append(line_svg([(a[0] - rx, a[1]), (b[0] - rx, b[1])], '#2a221c', 1))
        o.append(line_svg([(a[0] + rx, a[1]), (b[0] + rx, b[1])], '#2a221c', 1))
        if cap == 'cone':
            o.append(f'<ellipse cx="{f(b[0])}" cy="{f(b[1])}" rx="{f(rx * 1.08)}" ry="{f(ry * 1.08)}" fill="{shade(wallc, 1.1)}" stroke="#2a221c" stroke-width="1"/>')
            apex = Pj(x, z, ht + r * 1.7)
            o.append(poly_svg([(b[0] - rx * 1.1, b[1]), (b[0] + rx * 1.1, b[1]), apex], capc, '#1e1a16', 1))
            o.append(poly_svg([(b[0] + rx * 0.2, b[1] + ry * 0.4), (b[0] + rx * 1.1, b[1]), apex], shade(capc, 0.75)))
        else:
            o.append(f'<ellipse cx="{f(b[0])}" cy="{f(b[1])}" rx="{f(rx)}" ry="{f(ry)}" fill="{shade(wallc, 0.65)}" stroke="#2a221c" stroke-width="1.2"/>')
            for k in range(14):
                t = math.pi * k / 7
                mx, my = b[0] + math.cos(t) * rx, b[1] + math.sin(t) * ry
                if math.sin(t) > -0.2:
                    o.append(f'<rect x="{f(mx - 3)}" y="{f(my - 6)}" width="6" height="6" fill="{wallc}" stroke="#2a221c" stroke-width="0.7"/>')
        return '\n'.join(o)

    def wall(a, b, hb, ht, th, col):
        L = math.hypot(b[0] - a[0], b[1] - a[1])
        nx, nz = -(b[1] - a[1]) / L * th / 2, (b[0] - a[0]) / L * th / 2
        s1 = [(a[0] + nx, a[1] + nz), (b[0] + nx, b[1] + nz)]
        s2 = [(a[0] - nx, a[1] - nz), (b[0] - nx, b[1] - nz)]
        if (s1[0][1] + s1[1][1]) < (s2[0][1] + s2[1][1]):
            s1, s2 = s2, s1  # s1 = camera-facing side
        o = []
        face = [Pj(s1[0][0], s1[0][1], hb), Pj(s1[1][0], s1[1][1], hb), Pj(s1[1][0], s1[1][1], ht), Pj(s1[0][0], s1[0][1], ht)]
        o.append(poly_svg(face, col, '#2a221c', 1.1))
        o.append(poly_svg([Pj(s1[0][0], s1[0][1], ht), Pj(s1[1][0], s1[1][1], ht), Pj(s2[1][0], s2[1][1], ht), Pj(s2[0][0], s2[0][1], ht)], shade(col, 1.15), '#2a221c', 1))
        n = int(L / 1.7)
        for k in range(n):
            if k % 2 == 0:
                t0, t1 = k / n, (k + 0.6) / n
                p0 = (s1[0][0] + (s1[1][0] - s1[0][0]) * t0, s1[0][1] + (s1[1][1] - s1[0][1]) * t0)
                p1 = (s1[0][0] + (s1[1][0] - s1[0][0]) * t1, s1[0][1] + (s1[1][1] - s1[0][1]) * t1)
                o.append(poly_svg([Pj(p0[0], p0[1], ht), Pj(p1[0], p1[1], ht), Pj(p1[0], p1[1], ht + 0.9), Pj(p0[0], p0[1], ht + 0.9)], shade(col, 1.08), '#2a221c', 0.7))
        return '\n'.join(o)

    STONE = '#b39a7a'
    hc = 11
    cur = CG['curtain']
    Hh = CG['heights']
    for i in range(len(cur)):
        a, b = cur[i], cur[(i + 1) % len(cur)]
        items.append((max(a[1], b[1]) - 0.5, wall(a, b, hc, hc + Hh['curtain'], CG['thickness'], STONE)))
    a, b = CG['cross']
    items.append(((a[1] + b[1]) / 2 + 3, wall(a, b, hc, hc + Hh['cross_wall'], CG['cross_thickness'], shade(STONE, 0.95))))
    for bl in CG['blocks']:
        x0, z0, x1, z1 = bl['rect']
        items.append((z1, box(x0, z0, x1, z1, hc, hc + bl['eaves'], STONE, bl['roof'], hc + bl['ridge'], bl['axis'])))
    dj = CG['donjon']
    items.append((dj['z'] + dj['r'], cyl(dj['x'], dj['z'], dj['r'], hc, hc + dj['h'], shade(STONE, 0.97), 'flat')))
    for t in CG['towers']:
        items.append((t['z'] + t['r'], cyl(t['x'], t['z'], t['r'], hc, hc + t['h'], STONE, 'cone')))
    gx, gz = CG['gates']['G_outer']['w']
    items.append((gz + 3.5, box(gx - 3.5, gz - 3, gx + 3.5, gz + 3, hc, hc + Hh['gatehouse'], shade(STONE, 1.02), '#9a8a70', None, flat=True, parapet=True)
                  + '\n' + f'<rect x="{f(Pj(gx - 1.5, gz + 3, hc)[0])}" y="{f(Pj(gx, gz + 3, hc + 3.2)[1])}" width="{f(3 * S)}" height="{f(3.2 * COS_EL * S)}" fill="#2a1c14"/>'
                  + '\n' + f'<rect x="{f(Pj(gx - 3, gz + 3, hc)[0])}" y="{f(Pj(gx, gz + 3, hc + 8)[1])}" width="{f(1.1 * S)}" height="{f(2.6 * S)}" fill="#a8241c"/>'
                  + f'<rect x="{f(Pj(gx + 1.9, gz + 3, hc)[0])}" y="{f(Pj(gx, gz + 3, hc + 8)[1])}" width="{f(1.1 * S)}" height="{f(2.6 * S)}" fill="#a8241c"/>'))
    # banners on hall
    hx0, hz0, hx1, hz1 = CG['blocks'][0]['rect']
    for bx in (hx0 + 5, hx1 - 5):
        p0 = Pj(bx, hz1, hc + 8.2)
        items.append((hz1 + 0.01, f'<rect x="{f(p0[0])}" y="{f(p0[1])}" width="{f(1.2 * S)}" height="{f(3 * S)}" fill="#a8241c" stroke="#e0b040" stroke-width="1.2"/>'))
    # settlement buildings
    TIMBER = {'smelter', 'shop', 'alchemy_plot', 'hatch_plot'}
    for b in D['buildings']:
        x, z, w, d = b['x'], b['z'], b['w'], b['d']
        hb = HP(x + w / 2, z + d / 2)
        timber = b['id'] in TIMBER
        wallc = '#d8c6a0' if timber else STONE
        ridge = None if b.get('flat') else hb + b['wallH'] + min(w, d) * 0.38
        items.append((z + d, box(x, z, x + w, z + d, hb, hb + b['wallH'], wallc, b['roof'], ridge, 'x' if w >= d else 'z', timber=timber, flat=b.get('flat', False), parapet=b.get('flat', False))))
        for dx, dz in b['doors']:
            if abs(dz - (z + d)) < 0.01:
                p0 = Pj(dx - 1, dz, hb)
                items.append((z + d + 0.01, f'<rect x="{f(p0[0])}" y="{f(Pj(dx, dz, hb + 2.4)[1])}" width="{f(2 * S)}" height="{f(2.4 * COS_EL * S)}" fill="#3a2414" stroke="#f7e27a" stroke-width="1"/>'))
    # forge canopy, stalls
    a = next(s for s in D['stations'] if s['id'] == 'emberforge')['at']
    items.append((a[1] + 1.5, box(a[0] - 3.6, a[1] - 1.4, a[0] + 3.6, a[1] + 1.4, 0, 2.6, '#6b4a30', '#9a5438', 3.2, 'x')))
    for sx, sz in next(a for a in D['areas'] if a['id'] == 'market')['points']:
        items.append((sz + 0.9, box(sx - 1.4, sz - 0.9, sx + 1.4, sz + 0.9, 0, 1.6, '#7a5a3a', '#b84a3a', 2.4, 'x')))
    # portals
    for p in portal_positions(D):
        x, z = p['x'], p['z']
        o = [box(x - 1.5, z - 1.5, x + 1.5, z + 1.5, 0, 0.62, '#8a8072', '#b0a594', None, flat=True)]
        c = Pj(x, z, 0.62 + 1.5)
        o.append(portal_svg(c[0], c[1], 1.1 * S, 1.5 * COS_EL * S, p, detail=False))
        items.append((z + 1.5, '\n'.join(o)))
    lx, lz = pc['landing']
    items.append((lz + 2.5, box(lx - 2.5, lz - 2.5, lx + 2.5, lz + 2.5, 0, 0.4, '#8ea4c0', '#b4c8e2', None, flat=True)))
    # trees (B style block canopies)
    trees, orchard = tree_points(D)
    greens = ['#4f8a3a', '#5a963e', '#467e34', '#629e44']
    for i, (x, z, h) in enumerate(trees + orchard):
        h = h or 0
        orch = i >= len(trees)
        g = greens[i % 4] if not (hsh(x, z) > 0.9 and not orch) else '#c86f8f'
        s = 0.8 if orch else 1.0
        o = [box(x - 0.25, z - 0.25, x + 0.25, z + 0.25, h, h + 1.3 * s, '#6a4a2e', '#6a4a2e', None, flat=True),
             box(x - 1.3 * s, z - 1.3 * s, x + 1.3 * s, z + 1.3 * s, h + 1.2 * s, h + 3.2 * s, g, shade(g, 1.2), None, flat=True),
             box(x - 0.8 * s, z - 0.8 * s, x + 0.8 * s, z + 0.8 * s, h + 3.2 * s, h + 4.3 * s, shade(g, 1.1), shade(g, 1.3), None, flat=True)]
        items.append((z + 1.3, '\n'.join(o)))
    for _, s in sorted(items, key=lambda t: t[0]):
        out.append(s)

    # ── labels (sparse) with leaders
    def lab(lines, at, box_xy, tag=None):
        s, (bx, by, bw, bh) = label_box(box_xy[0], box_xy[1], lines, 16, tag=tag)
        tx, ty = at
        ax = min(max(tx, bx), bx + bw)
        ay = min(max(ty, by), by + bh)
        out.append(line_svg([(ax, ay), (tx, ty)], '#f6ecd8', 3.2))
        out.append(line_svg([(ax, ay), (tx, ty)], '#1e1a16', 1.6))
        out.append(f'<circle cx="{f(tx)}" cy="{f(ty)}" r="4" fill="#1e1a16" stroke="#f6ecd8" stroke-width="1.5"/>')
        out.append(s)
    hall = CG['blocks'][0]['rect']
    lab(['CASTLE-V2 FOOTPRINT - PROVISIONAL MASSING', 'two wards, L-residence + round keep (donjon +13)', 'on crown spur h +11; rigid move only, not rotated'],
        Pj(hall[0] + 2, hall[1] + 4, hc + 12), (330, 112), ('CASTLE SITE PROVISIONAL - not approved', '#b8322a'))
    lab(['Two-stage approach ramp', 'court h 0 -> shoulder +5 -> SE gatehouse +11'], Pj(125, 92, 7), (990, 112))
    lab(['Portal court: six present destination slots', 'lit windows illustrative; opening stays under', 'current progression. Landing, Warden, board'], Pj(150, 126, 1.5), (1560, 112))
    lab(['Grouped services: smelter + forge yard,', 'bank + vault, Quartermaster'], Pj(176, 132, 5), (1830, 300))
    lab(['East Shelf h +3', 'RESERVED / UNDECIDED growth'], Pj(236, 132, 3), (2050, 470))
    lab(['NE upland h +7: hatchery plot', '(locked); rest reserved'], Pj(190, 30, 9), (1990, 160))
    lab(['Fresh fracture notch', '(unbridged, no route)'], Pj(144, 26, 0), (1470, 230))
    lab(['Spring -> stream -> pond -> falls', 'into the sky void (no sea)'], Pj(80, 193, 0), (60, 1130))
    lab(['Old weathered S headland:', 'memorial garden + lookout'], Pj(153, 208, 0), (980, 1180))
    lab(['Stepped rock underside: island floats', 'above the void; no surrounding water'], Pj(150, 150, -40), (1136, 1040))
    lab(['Fresh torn faces run along the far N and W', 'edges (behind the castle, away from camera)'], Pj(26, 60, 0), (20, 360))
    lab(['Farm, fields, paddock', '(existing, relocated)'], Pj(62, 134, 0), (30, 870))
    lab(['Alchemy lab plot (locked)'], Pj(106, 177, 4), (300, 1040))

    # ── detail inset: portal court at 4x the main scale
    ix, iy, iw, ih = 1540, 1078, 846, 438
    out.append(f'<rect x="{ix}" y="{iy}" width="{iw}" height="{ih}" fill="#3a2a52" stroke="#f6ecd8" stroke-width="2"/>')
    s2 = S * 3.0
    ccx, ccz = pc['center']
    oy = iy + 296

    def Q(x, z, h=0.0):
        return (ix + iw / 2 + ((x - ccx) - K_SKEW * (z - ccz)) * s2, oy + ((z - ccz) * 0.5 - h * COS_EL) * s2)
    out.append(poly_svg([Q(ccx + math.cos(t / 18 * math.pi) * pc['radius'], ccz + math.sin(t / 18 * math.pi) * pc['radius'] * 0.62) for t in range(36)], '#cfc4ac', '#7b6b55', 1.5))
    pps = portal_positions(D)
    slot_w = (iw - 24) / 6
    for p in sorted(pps, key=lambda p: p['z']):
        x, z = p['x'], p['z']
        # stepped 3.0 dais (props.ts dais: 3.0 / 2.44 / 1.88 steps, top 0.62)
        for sz, h0, h1, col in ((3.0, 0, 0.26, '#7c7266'), (2.44, 0.26, 0.48, '#9d9282'), (1.88, 0.48, 0.62, '#b4a995')):
            a0, a1 = Q(x - sz / 2, z + sz / 2, h0), Q(x + sz / 2, z - sz / 2, h1)
            out.append(f'<rect x="{f(a0[0])}" y="{f(a1[1])}" width="{f(sz * s2)}" height="{f(a0[1] - a1[1])}" fill="{col}" stroke="#2a221c" stroke-width="1"/>')
        lit = portal_open_rule(p) != 'dormant'
        for sx in (-1, 1):
            pb = Q(x + sx * 1.2, z + 1.2, 0.26)
            pt = Q(x + sx * 1.2, z + 1.2, 1.0)
            out.append(f'<rect x="{f(pb[0] - 4)}" y="{f(pt[1])}" width="8" height="{f(pb[1] - pt[1])}" fill="#5e564c" stroke="#2a221c" stroke-width="0.8"/>')
            out.append(f'<rect x="{f(pb[0] - 4)}" y="{f(pt[1])}" width="8" height="3" fill="{p["color"] if lit else "#2e2c34"}"/>')
        c = Q(x, z, 0.62 + 1.5)
        rx, ry = 1.1 * s2, 1.5 * COS_EL * s2
        out.append(portal_svg(c[0], c[1], rx, ry, p, detail=True))
        # floating title, moved into a row above the ring so neighbours never collide; leader to the oval top
        tx = ix + 12 + slot_w * (p['n'] - 0.5)
        ty = iy + 50
        lines = R_title_lines(p['name'])
        tcol = '#ffe6b0' if lit else '#a8a6ae'
        out.append(line_svg([(tx, ty + 46), (c[0], c[1] - ry * 1.14 - 2)], tcol, 1.2, 'stroke-dasharray="3,3"'))
        out.append(f'<rect x="{f(tx - slot_w / 2 + 4)}" y="{f(ty - 16)}" width="{f(slot_w - 8)}" height="62" rx="5" fill="#241a30" stroke="{p["color"] if lit else "#5c5e68"}" stroke-width="1.6"/>')
        for k, ln in enumerate(lines):
            out.append(text_svg(tx, ty + k * 16, ln.upper(), 13, tcol, 'middle', 'bold', 'letter-spacing="0.5"'))
        out.append(text_svg(tx, ty + 38, p['tag'], 12, '#d8cce8', 'middle'))
    lp = Q(lx, lz, 0)
    out.append(f'<rect x="{f(lp[0] - 2.5 * s2)}" y="{f(lp[1] - 1.25 * s2)}" width="{f(5 * s2)}" height="{f(2.5 * s2)}" fill="#8ea4c0" stroke="#2a221c"/>')
    out.append(text_svg(lp[0], lp[1] + 5, 'arrival landing', 13, '#1e1a16', 'middle', 'bold'))
    wp = Q(*next(s for s in D['stations'] if s['id'] == 'warden')['at'])
    out.append(f'<rect x="{f(wp[0] - 4)}" y="{f(wp[1] - 22)}" width="8" height="22" fill="#2f6db5" stroke="#1e1a16"/>')
    bp = Q(*next(s for s in D['stations'] if s['id'] == 'board')['at'])
    out.append(f'<rect x="{f(bp[0] - 10)}" y="{f(bp[1] - 20)}" width="20" height="14" fill="#8a5a32" stroke="#2a221c"/>')
    # station tags sit off the court, on the dark inset ground, with short leaders
    for (px_, py_), s, dx in ((wp, 'Warden', 150), (bp, 'Restoration board', -100)):
        tx = px_ + dx
        tyy = py_ - 2
        out.append(line_svg([(px_ + (8 if dx > 0 else -12), py_ - 10), (tx - (4 if dx > 0 else -4), tyy - 5)], '#fff3d0', 1.2))
        tw_ = tw(s, 13, True) + 12
        bx = tx if dx > 0 else tx - tw_
        out.append(f'<rect x="{f(bx)}" y="{f(tyy - 16)}" width="{f(tw_)}" height="22" rx="4" fill="#241a30" stroke="#f6ecd8" stroke-width="1"/>')
        out.append(text_svg(bx + 6, tyy, s, 13, '#fff3d0', 'start', 'bold'))
    out.append(f'<rect x="{ix}" y="{iy}" width="{iw}" height="30" fill="#2b2220"/>')
    out.append(text_svg(ix + 10, iy + 21, 'DETAIL INSET (3x main scale): portal court, ovals 2.2 x 3.0 true size on 3.0 stepped daises, ring r 10.5', 15, '#f6ecd8', 'start', 'bold'))
    out.append(f'<rect x="{ix + 1}" y="{iy + ih - 50}" width="{iw - 2}" height="49" fill="#2b2220"/>')
    out.append(text_svg(ix + 10, iy + ih - 31, 'Schematic stand-in for portalFx.ts / props.ts (glimpse window, zone halo, title, stone dais) - NOT the runtime shader.', 13, '#f6ecd8'))
    out.append(text_svg(ix + 10, iy + ih - 12, 'Slots 1-4 drawn lit for identity only: lighting is illustrative; opening stays under current progression. 5-6 dormant.', 13, '#ffd0a0', 'start', 'bold'))

    out.append(footer(W, H, f'Oblique massing from the south/camera side: view elevation 30 deg (z x0.5, heights x0.866), same cells and h as the plan, no exaggeration. Schematic, not a game screenshot. sha256 {dhash[:12]}'))
    out.append(header(W, 'DRAGONBOUND HOME ISLAND v1 - OBLIQUE SITE + MASSING (from the south)',
                      'Same dataset as the plan: castle-v2 provisional massing on the crown spur, ramp approach, portal court, grouped services, reserved shelves, floating rock underside'))
    out.append('</svg>')
    return '\n'.join(out)


def to_png(svg_path, png_path):
    import fitz
    doc = fitz.open(svg_path, filetype='svg')
    pix = doc[0].get_pixmap(alpha=False)
    pix.save(png_path)


def main():
    D, C = load()
    dhash = sha256(DESIGN_PATH)
    chash = sha256(CASTLE_PATH)
    if D['castle']['source_sha256'] not in ('FILLED_BY_RUN', chash):
        print('WARNING: castle source hash differs from design.json record')
    files = {}
    for name, fn in (('home-island-topdown', render_topdown), ('home-island-oblique', render_oblique)):
        svg = fn(D, C, dhash)
        sp = os.path.join(HERE, name + '.svg')
        with open(sp, 'w', encoding='utf-8') as fh:
            fh.write(svg)
        pp = os.path.join(HERE, name + '.png')
        to_png(sp, pp)
        files[name + '.svg'] = sha256(sp)
        files[name + '.png'] = sha256(pp)
    man = dict(design_sha256=dhash, castle_source_sha256=chash, outputs=files,
               note='Both sheets are generated by render.py from this one design.json and the castle-v2 source; each SVG embeds design-sha256.')
    with open(os.path.join(HERE, 'render-manifest.json'), 'w', encoding='utf-8') as fh:
        json.dump(man, fh, indent=2)
    print(json.dumps(man, indent=2))


if __name__ == '__main__':
    main()
