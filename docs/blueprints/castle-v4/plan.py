"""The castle v4 blueprint pictures, drawn from design.json (Python 3 with Pillow):

    python plan.py [render folder]

Draws castle-v4-plan.png. Given the folder massing.py rendered into, it also copies the overview
massing (castle-v4-massing.png) and lays the four play-camera renders out as castle-v4-massing-camera.png.
"""
import json, math, os, sys
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
D = json.load(open(os.path.join(HERE, 'design.json'), encoding='utf-8'))
AX = D['axes']['main_x']
SS = 2                              # supersampling
PX = 9.0 * SS                       # pixels per cell
X0, Z0, X1, Z1 = 12, 0, 146, 140    # the plan's window, in cells

C = {
    'void': (43, 40, 62), 'meadow': (118, 156, 88), 'crown': (126, 168, 94), 'rock': (88, 96, 112), 'water': (78, 152, 212),
    'water_edge': (44, 106, 170), 'foam': (226, 242, 252), 'pave': (216, 208, 194), 'pave_edge': (150, 142, 130), 'lawn': (134, 186, 98),
    'box': (62, 110, 56), 'yew': (46, 90, 46), 'earth': (190, 160, 116), 'setts': (186, 176, 156), 'bed': (128, 98, 66), 'flower': (232, 120, 150),
    'blossom': (240, 176, 200), 'tree': (76, 136, 66), 'cream': (241, 230, 205), 'stone': (214, 198, 166), 'ink': (52, 42, 34), 'keep': (248, 238, 212),
    'navy': (52, 74, 128), 'gold': (210, 160, 60), 'terrace': (229, 222, 207), 'fence': (122, 84, 52), 'text': (40, 34, 30),
    'paper': (246, 240, 228), 'tag': (255, 252, 244), 'dark': (52, 46, 40), 'light': (255, 246, 226), 'axis': (196, 140, 40), 'road': (205, 197, 182),
    'farm': (150, 120, 80), 'title': (36, 30, 26), 'blue_tag': (222, 238, 250), 'flag': (47, 90, 208), 'horse': (124, 78, 44),
}


def save(img, name, few_colours=False):
    """the shaded renders keep 256 colours (no visible change, a third of the size); the plan keeps all its colours"""
    img = img.convert('RGB')
    if few_colours:
        img = img.quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.FLOYDSTEINBERG)
    img.save(os.path.join(HERE, name), optimize=True)


def font(size, bold=False):
    try:
        return ImageFont.truetype('georgiab.ttf' if bold else 'georgia.ttf', int(size * SS))
    except OSError:
        return ImageFont.load_default()


# ── the plan (its own image, so nothing spills outside the window) ─────────
PW, PH = int((X1 - X0) * PX), int((Z1 - Z0) * PX)
pim = Image.new('RGB', (PW, PH), C['void'])
d = ImageDraw.Draw(pim)


def P(x, z):
    return ((x - X0) * PX, (z - Z0) * PX)


def R(r):
    a, b = P(r[0], r[1]), P(r[2], r[3])
    return [a[0], a[1], b[0], b[1]]


def disc(x, z, r, fill, outline=None, width=1):
    d.ellipse(R([x - r, z - r, x + r, z + r]), fill=fill, outline=outline, width=int(width * SS))


def rect(r, fill, outline=None, width=1):
    d.rectangle(R(r), fill=fill, outline=outline, width=int(width * SS) if outline else 0)


def line(pts, fill, w):
    d.line([P(*p) for p in pts], fill=fill, width=int(w))


# the island's lowland and the crown on its rock
island = [tuple(p) for p in D['island']['outline']]
d.polygon([P(*p) for p in island], fill=C['meadow'])
crown = [tuple(p) for p in D['crown']['outline']]
d.polygon([P(*p) for p in crown], fill=C['rock'])
# (the turf drawn a little inside the rock's edge, so the cliff's lip shows as a dark rim)
inset = [(x - (x - AX) * 1.3 / math.hypot(x - AX, z - 62), z - (z - 62) * 1.3 / math.hypot(x - AX, z - 62)) for x, z in crown]
d.polygon([P(*p) for p in inset], fill=C['crown'])

# today's neighbours of the climb: the smelter and the ore lane from the portal court
cx_ = D['context']
rect(cx_['smelter']['rect'], (196, 186, 170), C['ink'], 1)
line(cx_['ore_lane'], C['road'], 5.0 * PX)

# the farm, moved south (context)
fm = cx_['farm']
for x in fm['plots_x']:
    for z in fm['plots_z']:
        rect([x - 1.5, z - 1.2, x + 1.5, z + 1.2], C['farm'])
rect(fm['fence'], None, C['fence'], 2)

# water
Wt = D['water']
mo = Wt['moat']['outer']
d.polygon([P(*p) for p in Wt['moat']['poly']], fill=C['water'])
line([(mo['west_x'], mo['north_z']), (mo['west_x'], mo['south_z']), (mo['east_x'], mo['south_z']), (mo['east_x'], mo['north_z'])], C['stone'], 0.7 * PX)
line([(mo['west_x'], mo['north_z']), (mo['west_x'], mo['south_z']), (mo['east_x'], mo['south_z']), (mo['east_x'], mo['north_z'])], C['ink'], 1 * SS)
pl = Wt['pool']
line(Wt['stream'], C['water'], 2.2 * PX)
disc(pl['x'], pl['z'], pl['r'], C['water'], C['water_edge'], 2)
for f in Wt['falls']:
    if f['id'] == 'south-fall':
        rect([f['x'] - f['w'] / 2, f['z'] - 0.2, f['x'] + f['w'] / 2, pl['z'] - pl['r'] + 0.6], C['foam'])
    else:
        rect([f['x'] - 0.5, f['z'] - f['w'] / 2, mo['west_x'], f['z'] + f['w'] / 2], C['water'])
        rect([f['x'] - 6.0, f['z'] - f['w'] / 2, f['x'] - 0.5, f['z'] + f['w'] / 2], C['foam'])
for s in Wt['springs']:
    rect([s['x'] - 0.8, s['z'] - 1.4, s['x'] + 0.8, s['z'] + 0.6], C['foam'])

# the approach outside the moat
A = D['approach']
for key in ('ledge_road', 'ledge_walk', 'landing', 'lookout'):
    rect(A[key]['rect'], C['road'])
rect(A['gate_terrace']['rect'], C['pave'])


def parapet(a, b, t=0.6):
    line([a, b], C['stone'], t * PX)
    line([a, b], C['ink'], 1 * SS)


def treads(r, up, n, col):
    """a flight: its outline and one line per riser, across the way it climbs"""
    x0, z0, x1, z1 = r
    rect(r, C['pave'], C['ink'], 1)
    for k in range(1, n):
        u = k / n
        if up in 'ns':
            z = z0 + (z1 - z0) * u
            line([(x0, z), (x1, z)], col, 1 * SS)
        else:
            x = x0 + (x1 - x0) * u
            line([(x, z0), (x, z1)], col, 1 * SS)
    # an arrow pointing up the flight
    cx, cz = (x0 + x1) / 2, (z0 + z1) / 2
    dx, dz = {'n': (0, -1), 's': (0, 1), 'e': (1, 0), 'w': (-1, 0)}[up]
    L = min(x1 - x0, z1 - z0) * 0.3 if up in 'ns' else min(x1 - x0, z1 - z0) * 0.3
    tip = (cx + dx * L * 1.6, cz + dz * L * 1.6)
    line([(cx - dx * L * 1.6, cz - dz * L * 1.6), tip], C['ink'], 1.5 * SS)
    d.polygon([P(*tip), P(tip[0] - dx * 0.7 - dz * 0.5, tip[1] - dz * 0.7 - dx * 0.5), P(tip[0] - dx * 0.7 + dz * 0.5, tip[1] - dz * 0.7 + dx * 0.5)], fill=C['ink'])


# the climb: four flights and their landings, its walls and buttresses
CL = A['climb']
for fl in CL['flights']:
    treads(fl['rect'], fl['up'], CL['risers_per_flight'], C['pave_edge'])
for ld in CL['landings']:
    rect(ld['rect'], C['pave'], C['ink'], 1)
for w in CL['walls']:
    pts = [(p[0], p[1]) for p in w['pts']]
    for a, b in zip(pts, pts[1:]):
        parapet(a, b, CL['wall_t'])
for x, z in CL['buttresses']:
    rect([x - 0.6, z - 0.3, x + 0.6, z + 0.9], C['stone'], C['ink'], 1)
for x, z in CL['lamps']:
    disc(x, z, 0.4, C['gold'], C['ink'], 1)

# the crown-level parapets: both walls of the ledge, round the bastion, the landing and the lookout, the bridge
PA = A['parapets']
for ln in PA['lines'] + PA['bridge']:
    pts = [tuple(p) for p in ln['pts']]
    for a, b in zip(pts, pts[1:]):
        parapet(a, b, PA['t'])
br = A['bridge']['rect']
rect(br, C['pave'], C['ink'], 2)
for ln in PA['bridge']:
    pts = [tuple(p) for p in ln['pts']]
    parapet(pts[0], pts[1], 0.5)
rect([br[0] - A['bridge']['cutwaters'], A['bridge']['pier'][1], br[2] + A['bridge']['cutwaters'], A['bridge']['pier'][3]], None, C['ink'], 1)
for x, z in A['gate_terrace']['banner_poles']:
    disc(x, z, 0.45, C['flag'])
for x, z in PA['lamps'] + A['gate_terrace']['lamps']:
    disc(x, z, 0.35, C['gold'], C['ink'], 1)

# the bailey: lawn everywhere a walk, yard or garden does not cover it
cu = D['curtain']['centre_lines']
rect([cu['west_x'] + 1.1, cu['north_z'] + 1.1, cu['east_x'] - 1.1, cu['south_z'] - 1.1], C['lawn'])
for r in D['terrace']['parts']:
    rect(r, C['terrace'])
for wk in D['walks']:
    rect(wk['rect'], C['pave'])
Z = {z['id']: z for z in D['zones']}
for zid in ('cour', 'forecourt'):
    rect(Z[zid]['rect'], C['pave'])
for zid in ('stable-yard', 'muster-yard'):
    rect(Z[zid]['rect'], C['setts'])
rect(Z['paddock']['rect'], (150, 198, 106))
rect(Z['training-yard']['rect'], C['earth'])
for zid in ('paddock', 'training-yard'):
    x0, z0, x1, z1 = Z[zid]['rect']
    gx, gz = Z[zid]['gate']
    for a, b in (((gx, z0), (gx, gz - 1.6)), ((gx, gz + 1.6), (gx, z1))):
        line([a, b], C['fence'], 2.5 * SS)
for (x, z) in ((40, 82), (46, 89), (49.5, 80.5)):
    rect([x - 1.1, z - 0.4, x + 1.1, z + 0.4], C['horse'])
for x in (102, 105, 111, 114):
    disc(x, 80, 0.45, C['navy'])
line([(98.5, 89), (117.5, 89)], C['fence'], 2 * SS)
for x in (102.5, 108, 113.5):
    rect([x - 1.0, 96.0, x + 1.0, 96.7], (170, 60, 60))

# walled gardens, each on its own axis with the stair from the terrace
for zid in ('kitchen-garden', 'privy-garden'):
    x0, z0, x1, z1 = Z[zid]['rect']
    cx, cz = (x0 + x1) / 2, (z0 + z1) / 2
    rect([x0, z0, x1, z1], C['lawn'] if zid == 'privy-garden' else (120, 168, 88))
    rect([cx - 1.2, z0 + 3, cx + 1.2, z1], C['pave'])
    rect([x0 + 0.5, cz - 1.0, x1 - 0.5, cz + 1.0], C['pave'])
    for qx0, qx1 in ((x0 + 1.5, cx - 2.0), (cx + 2.0, x1 - 1.5)):
        for qz0, qz1 in ((z0 + 3.5, cz - 1.5), (cz + 1.5, z1 - 1.5)):
            rect([qx0, qz0, qx1, qz1], C['box'])
            rect([qx0 + 0.55, qz0 + 0.55, qx1 - 0.55, qz1 - 0.55], C['bed'] if zid == 'kitchen-garden' else C['flower'])
    if zid == 'kitchen-garden':
        disc(cx, cz, 0.9, C['stone'], C['ink'], 1)
    else:
        disc(cx, cz, 1.2, C['water'], C['ink'], 1)
    # walls on the sides it builds (the curtain and the terrace close the others), open at the gates
    for side in Z[zid]['walls']:
        g = next(g for g in Z[zid]['gates'] if g[2] == side)
        if side == 's':
            segs = (((x0, z1 - 0.25), (g[0] - 1.2, z1 - 0.25)), ((g[0] + 1.2, z1 - 0.25), (x1, z1 - 0.25)))
        else:
            xx = x1 - 0.25 if side == 'e' else x0 + 0.25
            segs = (((xx, z0), (xx, g[1] - 1.2)), ((xx, g[1] + 1.2), (xx, z1)))
        for a, b in segs:
            line([a, b], C['stone'], 0.5 * PX)
            line([a, b], C['ink'], 1 * SS)

# parterre round the fountain plaza
fp = Z['fountain-plaza']
fx, fz, fr = fp['centre'][0], fp['centre'][1], fp['r']
for r in Z['parterre']['panels']:
    rect(r, C['box'])
    x0, z0, x1, z1 = r
    rect([x0 + 0.5, z0 + 0.5, x1 - 0.5, z1 - 0.5], C['lawn'])
    cx, cz = (x0 + x1) / 2, (z0 + z1) / 2
    d.polygon([P(cx, cz - 2.6), P(cx + 3.2, cz), P(cx, cz + 2.6), P(cx - 3.2, cz)], outline=C['box'], width=int(2 * SS))
    for cxx, czz in ((x0 + 2.2, z0 + 1.5), (x1 - 2.2, z0 + 1.5), (x0 + 2.2, z1 - 1.5), (x1 - 2.2, z1 - 1.5)):
        disc(cxx, czz, 0.6, C['yew'])
disc(fx, fz, fr + 1.0, C['box'])
disc(fx, fz, fr, C['pave'])
for wk in D['walks']:
    if wk['id'] in ('avenue', 'cross-walk'):
        rect(wk['rect'], C['pave'])
F = {f['id']: f for f in D['features']}
bf = F['dragon-fountain']
disc(fx, fz, bf['basin_r'], C['water'], C['ink'], 2)
d.regular_polygon((P(fx, fz)[0], P(fx, fz)[1], 1.9 * PX), 8, fill=C['stone'], outline=C['ink'])
disc(fx, fz, 1.0, (166, 108, 50))
for x, z in F['yews']['pts']:
    disc(x, z, 0.7, C['yew'])
for x, z in F['blossom-trees']['pts']:
    disc(x, z, 1.6, C['blossom'], (200, 120, 150), 1)
for x, z in F['shade-trees']['pts']:
    disc(x, z, 3.0, C['tree'], (52, 100, 48), 1)
for x, z in F['lamps']['pts']:
    disc(x, z, 0.35, C['ink'])
ax_, az_ = F['rose-arbour']['x'], F['rose-arbour']['z']
rect([ax_ - 1.0, az_ - 2.5, ax_ + 1.0, az_ + 2.5], (176, 120, 96), C['ink'], 1)

# buildings
for b in D['buildings']:
    rect(b['rect'], C['cream'], C['ink'], 2)
    for (x, z, h) in b.get('chimneys', []):
        rect([x - 0.6, z - 0.6, x + 0.6, z + 0.6], C['stone'], C['ink'], 1)
    if 'lantern' in b:
        x, z, h = b['lantern']
        rect([x - 1.3, z - 1.3, x + 1.3, z + 1.3], C['navy'])
    if 'bellcote' in b:
        x, z, h = b['bellcote']
        d.polygon([P(x, z - 1.3), P(x + 1.3, z), P(x, z + 1.3), P(x - 1.3, z)], fill=C['navy'])
for b in D['buildings']:
    if b['id'] in ('stables', 'barracks'):
        x0, z0, x1, z1 = b['rect']
        xd = x1 if b['id'] == 'stables' else x0
        rect([xd - 0.35, 69, xd + 0.35, 71], C['navy'])

# curtain
def wall(a, b, t=2.2):
    (xa, za), (xb, zb) = a, b
    L = math.hypot(xb - xa, zb - za)
    nx, nz = -(zb - za) / L * t / 2, (xb - xa) / L * t / 2
    d.polygon([P(xa + nx, za + nz), P(xb + nx, zb + nz), P(xb - nx, zb - nz), P(xa - nx, za - nz)], fill=C['stone'], outline=C['ink'])


for run in D['curtain']['runs']:
    wall(run['a'], run['b'])

# the keep
K = D['keep']
rect(K['rect'], C['keep'], C['ink'], 3)
kx0, kz0, kx1, kz1 = K['rect']
rect([kx0 + 1.6, kz0 + 1.6, kx1 - 1.6, kz1 - 1.6], None, C['gold'], 2)
fs = K['frontispiece']
rect(fs['rect'], C['keep'], C['ink'], 2)
for pn in fs['pinnacles']:
    disc(pn['x'], pn['z'], pn['r'], C['navy'], C['ink'], 1)
for t in K['turrets']:
    disc(t['x'], t['z'], t['r'] + 0.5, C['keep'], C['ink'], 3)
    disc(t['x'], t['z'], t['r'] * 0.62, C['navy'])
gf = K['great_flag']
disc(gf['x'], gf['z'], 0.5, C['gold'])

# towers and the gatehouse
for t in D['towers']:
    disc(t['x'], t['z'], t['r'] + 0.45, C['stone'], C['ink'], 2)
    if t['kind'] == 'corner':
        disc(t['x'], t['z'], t['r'] * 0.6, C['navy'])
G = D['gatehouse']
rect([G['x'] - 6, G['z'] - 1.9, G['x'] + 6, G['z'] + 1.9], C['stone'], C['ink'], 2)
rect([G['x'] - 2, G['z'] - 1.9, G['x'] + 2, G['z'] + 1.9], C['pave'])
for dr in G['drums']:
    disc(dr['x'], dr['z'], dr['r'], C['stone'], C['ink'], 2)

# stairs and the champions on the grand stair's cheeks
for s in D['stairs']:
    x0, z0, x1, z1 = s['rect']
    rect(s['rect'], C['terrace'], C['ink'], 1)
    n = s['risers']
    for k in range(1, n):
        z = z0 + (z1 - z0) * k / n
        line([(x0, z), (x1, z)], C['pave_edge'], 1 * SS)
for side in ('west', 'east'):
    f = F[f'champion-{side}']
    rect([f['x'] - 0.8, f['z'] - 0.8, f['x'] + 0.8, f['z'] + 0.8], C['stone'], C['ink'], 1)
# the terrace's edge: a retaining wall with a balustrade
def edge_segments():
    """the terrace's edge as segments, broken where the stairs come up"""
    T = D['terrace']
    out = []
    for (xa, za), (xb, zb) in zip(T['edge'], T['edge'][1:]):
        cuts = sorted(o for o in T['stair_openings'] if za == zb and min(xa, xb) <= o[0] and o[1] <= max(xa, xb))
        x = min(xa, xb)
        for o in cuts:
            out.append(((x, za), (o[0], za)))
            x = o[1]
        out.append(((x, za), (max(xa, xb), zb)) if za == zb else ((xa, za), (xb, zb)))
    return out


for a, b in edge_segments():
    line([a, b], C['ink'], 3 * SS)


# the axes
def dashed(a, b, dash=1.6, gap=1.0, w=2):
    (xa, za), (xb, zb) = a, b
    L = math.hypot(xb - xa, zb - za)
    t = 0.0
    while t < L:
        t1 = min(L, t + dash)
        d.line([P(xa + (xb - xa) * t / L, za + (zb - za) * t / L), P(xa + (xb - xa) * t1 / L, za + (zb - za) * t1 / L)], fill=C['axis'], width=int(w * SS))
        t += dash + gap


dashed((AX, 8), (AX, 126))
dashed((54, D['axes']['cross_z']), (98, D['axes']['cross_z']))


# labels
def tag(x, z, text, size=13, bold=False, fill=None, col=None, anchor='mm'):
    f = font(size, bold)
    px, pz = P(x, z)
    bb = d.textbbox((px, pz), text, font=f, anchor=anchor)
    pad = 4 * SS
    d.rounded_rectangle([bb[0] - pad, bb[1] - pad * 0.7, bb[2] + pad, bb[3] + pad * 0.7], radius=5 * SS, fill=fill or C['tag'])
    d.text((px, pz), text, font=f, fill=col or C['text'], anchor=anchor)


def htag(x, z, text):
    tag(x, z, text, 11, fill=C['dark'], col=C['light'])


tag(76, 24.0, 'GREAT KEEP', 17, True)
htag(76, 29.0, 'keep 28 m')
htag(76, 33.6, 'turrets 34.5, spires 44')
tag(53.5, 26.5, 'GREAT HALL', 12, True)
htag(53.5, 31.0, '14 m')
tag(38.5, 26.5, 'KITCHEN', 10, True)
htag(38.5, 31.0, '11.5')
tag(98.5, 26.5, 'CHAPEL', 12, True)
htag(98.5, 31.0, '14 m')
tag(113.5, 26.5, 'SOLAR', 10, True)
htag(113.5, 31.0, '11.5')
tag(48, 40.2, 'terrace, raised 2 m', 10)
tag(104, 40.2, 'terrace, raised 2 m', 10)
tag(76, 51.0, 'grand stair', 10)
tag(44, 53.2, 'KITCHEN GARDEN', 10, True)
tag(108, 53.2, 'PRIVY GARDEN', 10, True)
tag(44, 61.0, 'stable yard', 10)
tag(108, 61.0, 'muster yard', 10)
tag(44, 70.0, 'STABLES  7 m', 10, True)
tag(108, 70.0, 'BARRACKS  7 m', 10, True)
tag(44, 94.5, 'PADDOCK', 12, True)
tag(108, 93.0, 'TRAINING YARD', 11, True)
tag(76, 59.6, 'DRAGON FOUNTAIN', 10, True)
tag(76, 92.0, 'forecourt', 10)
tag(76, 113.5, 'GATE TERRACE', 10, True)
tag(101.5, 112.2, 'LEDGE ROAD', 11, True)
tag(50.5, 112.2, 'LEDGE WALK', 11, True)
tag(124.4, 112.4, 'LANDING', 10, True)
tag(27.6, 112.4, 'LOOKOUT', 10, True)
tag(124.4, 50, 'MOAT', 12, True, fill=C['blue_tag'])
tag(27.6, 50, 'MOAT', 12, True, fill=C['blue_tag'])
tag(76, 105.2, 'bridge', 9, fill=C['blue_tag'])
tag(86.5, 122.8, 'fall and pool', 10, fill=C['blue_tag'], anchor='lm')
tag(14.0, 84.6, 'overflow fall', 9, fill=C['blue_tag'], anchor='lm')
tag(27.5, 7.0, 'spring', 9, fill=C['blue_tag'])
tag(124.5, 7.0, 'spring', 9, fill=C['blue_tag'])
tag(139.5, 122.5, 'STAIR', 10, True)
tag(139.5, 125.6, '4 flights of 17', 9)
tag(139.5, 136.6, 'to the portal court', 9)
tag(114.5, 132.5, 'smelter', 9)
tag(64, 139.0, 'farm (moved 8 m south)', 10)
htag(22.6, 101.5, 'curtain 8.4')
for t in D['towers']:
    if t['kind'] == 'corner':
        htag(t['x'], t['z'] + (5.8 if t['z'] > 60 else -5.6), '21.5')
htag(22.4, 59.0, 'towers 13.8')
htag(76, 96.2, 'gate 12.6')

# scale bar and north arrow
sx, sz = 14.5, 129.5
for k in range(5):
    rect([sx + k * 5, sz, sx + (k + 1) * 5, sz + 1.0], C['ink'] if k % 2 == 0 else (250, 246, 236), C['ink'], 1)
tag(sx + 12.5, sz + 3.2, '25 m', 11)
nx, nz = 18, 119
d.polygon([P(nx, nz - 4), P(nx + 1.6, nz + 1.0), P(nx, nz), P(nx - 1.6, nz + 1.0)], fill=C['light'])
tag(nx, nz - 6.2, 'N', 12, True)

# ── the sheet: title, plan, and a side panel with heights, the keep's floors and the key ──
TOP, LEFT, SIDE = 84 * SS, 24 * SS, 600 * SS
WIDTH, HEIGHT = LEFT + PW + SIDE, TOP + PH + 26 * SS
im = Image.new('RGB', (WIDTH, HEIGHT), C['paper'])
im.paste(pim, (LEFT, TOP))
d = ImageDraw.Draw(im)
d.rectangle([0, 0, WIDTH, TOP], fill=C['title'])
d.text((LEFT, TOP * 0.5), 'CASTLE v4: THE GREAT KEEP', font=font(30, True), fill=(248, 236, 210), anchor='lm')
d.text((LEFT + 560 * SS, TOP * 0.5), 'north up; one square on the bar = 5 m; heights above the bailey', font=font(15), fill=(214, 200, 176), anchor='lm')

SX = LEFT + PW + 30 * SS
SW = SIDE - 60 * SS
d.text((SX, TOP + 24 * SS), 'Heights, seen from the south', font=font(17, True), fill=C['text'], anchor='lm')
ey0 = TOP + 330 * SS
sc = SW / 112.0


def E(x, h):
    return (SX + (x - 24) * sc, ey0 - h * sc)


def erect(x0, h0, x1, h1, fill, w=1):
    a, b = E(x0, h1), E(x1, h0)
    d.rectangle([a[0], a[1], b[0], b[1]], fill=fill, outline=C['ink'], width=int(w * SS))


def espire(x, r, h0, h1):
    d.polygon([E(x - r, h0), E(x + r, h0), E(x, h1)], fill=C['navy'], outline=C['ink'])


d.line([E(24, 0), E(128, 0)], fill=C['ink'], width=int(2 * SS))
erect(30, 0, 122, 8.4, C['stone'])
for b in D['buildings']:
    if b['floor'] > 0:
        erect(b['rect'][0], 0, b['rect'][2], b['parapet_top'], C['cream'])
erect(64, 0, 88, 28, C['keep'], 2)
erect(72, 0, 80, 30.5, C['keep'])
for x in (64, 88):
    erect(x - 3.6, 0, x + 3.6, 32.0, C['keep'], 2)
    erect(x - 4.1, 32.0, x + 4.1, 34.5, C['keep'], 2)
    espire(x, 3.8, 34.5, 44)
for x in (72, 80):
    erect(x - 0.9, 28, x + 0.9, 32.5, C['stone'])
    espire(x, 1.0, 32.5, 35.5)
d.line([E(76, 30.5), E(76, 40)], fill=C['ink'], width=int(2 * SS))
d.polygon([E(76, 40), E(82, 39), E(76, 36.4)], fill=C['flag'])
for x in (30.5, 121.5):
    erect(x - 3.8, 0, x + 3.8, 14.6, C['stone'])
    espire(x, 4.0, 14.6, 21.5)
for x in (53.25, 98.75):
    erect(x - 3.2, 0, x + 3.2, 13.8, C['stone'])
for x in (70, 82):
    erect(x - 2.6, 0, x + 2.6, 13.4, C['stone'])
erect(73, 0, 79, 12.6, C['stone'])
erect(45.7, 0, 46.3, 2.0, C['flag'])
for h in (8.4, 14, 28, 34.5, 44):
    d.line([E(126, h), E(128, h)], fill=C['ink'], width=int(1 * SS))
    d.text((E(128, h)[0] + 5 * SS, E(128, h)[1]), f'{h:g}', font=font(11), fill=C['text'], anchor='lm')
d.text((SX, ey0 + 18 * SS), 'curtain 8.4, wings 11.5 and 14, keep 28, turrets 34.5, spires 44', font=font(11), fill=C['text'], anchor='lm')
d.text((SX, ey0 + 36 * SS), 'the blue post is the 2 m hero', font=font(11), fill=C['text'], anchor='lm')


# ── inside the buildings: one drawer for the keep's plans here and the interiors sheet ──
IN = {b['id']: b for b in D['interiors']['buildings']}
BLD = {b['id']: b for b in D['buildings']}
IC = {'wall': (132, 118, 98), 'floor': (244, 236, 218), 'raised': (230, 214, 184), 'below': (206, 198, 184), 'void': (96, 88, 80),
      'stair': (222, 168, 72), 'door': (52, 74, 128), 'hatch': (196, 150, 84), 'hearth': (150, 66, 44), 'window': (110, 186, 236),
      'curtain': (196, 184, 160), 'terrace': (229, 222, 207), 'walk': (176, 160, 132), 'yard': (210, 202, 186)}


class View:
    """a plan drawn at s pixels a metre with (x0, z0) at (ox, oy)"""

    def __init__(self, dr, ox, oy, s, x0, z0):
        self.dr, self.ox, self.oy, self.s, self.x0, self.z0 = dr, ox, oy, s, x0, z0

    def Q(self, x, z):
        return (self.ox + (x - self.x0) * self.s, self.oy + (z - self.z0) * self.s)

    def box(self, r, fill, outline=None, w=1):
        a, b = self.Q(r[0], r[1]), self.Q(r[2], r[3])
        self.dr.rectangle([min(a[0], b[0]), min(a[1], b[1]), max(a[0], b[0]), max(a[1], b[1])], fill=fill, outline=outline, width=int(w * SS) if outline else 0)

    def disc(self, x, z, r, fill, outline=None, w=1):
        a, b = self.Q(x - r, z - r), self.Q(x + r, z + r)
        self.dr.ellipse([a[0], a[1], b[0], b[1]], fill=fill, outline=outline, width=int(w * SS) if outline else 0)

    def line(self, pts, fill, w):
        self.dr.line([self.Q(*p) for p in pts], fill=fill, width=int(w * SS))

    def text(self, x, z, t, size=10, bold=False, col=None, anchor='mm'):
        self.dr.text(self.Q(x, z), t, font=font(size, bold), fill=col or C['text'], anchor=anchor, align='center')

    def arrow(self, x, z, up, L):
        dx, dz = {'n': (0, -1), 's': (0, 1), 'e': (1, 0), 'w': (-1, 0)}[up]
        a, b = (x - dx * L / 2, z - dz * L / 2), (x + dx * L / 2, z + dz * L / 2)
        self.line([a, b], C['ink'], 1.5)
        h = min(0.5, L * 0.3)
        self.dr.polygon([self.Q(*b), self.Q(b[0] - dx * h - dz * h * 0.7, b[1] - dz * h - dx * h * 0.7), self.Q(b[0] - dx * h + dz * h * 0.7, b[1] - dz * h + dx * h * 0.7)], fill=C['ink'])


def flight(v, r, up, n):
    x0, z0, x1, z1 = r
    v.box(r, IC['stair'], C['ink'], 1)
    for k in range(1, n):
        u = k / n
        if up in 'ns':
            v.line([(x0, z0 + (z1 - z0) * u), (x1, z0 + (z1 - z0) * u)], C['ink'], 0.6)
        else:
            v.line([(x0 + (x1 - x0) * u, z0), (x0 + (x1 - x0) * u, z1)], C['ink'], 0.6)
    v.arrow((x0 + x1) / 2, (z0 + z1) / 2, up, (z1 - z0 if up in 'ns' else x1 - x0) * 0.6)


def stairs_of(b):
    out = []
    for st in b.get('stairs', []):
        fl = st.get('flights')
        if isinstance(fl, list):
            n = round(st['risers'] / len(fl))
            out += [(f['rect'], f['up'], n) for f in fl]
            out.append((st['landing'], None, 0))
        else:
            out.append((st['rect'], st['up'], st['risers']))
    return out


def door(v, dd, wall, upper):
    lv = dd['level']
    shown = (lv >= 2.9 and not dd.get('hatch')) if upper else (lv < 2.9 or dd.get('hatch'))
    if not shown:
        return
    col = IC['hatch'] if dd.get('hatch') or dd.get('h', 4) < 2.5 else IC['door']
    t = dd.get('depth', wall) / 2 + 0.15
    pts = [(x, dd['z']) for x in dd['xs']] if 'xs' in dd else [tuple(dd['at'])]
    for x, z in pts:
        if dd['side'] in 'ns':
            v.box([x - dd['w'] / 2, z - t, x + dd['w'] / 2, z + t], col)
        else:
            v.box([x - t, z - dd['w'] / 2, x + t, z + dd['w'] / 2], col)


def room_label(v, r, txt, size):
    x0, z0, x1, z1 = r['rect']
    v.text((x0 + x1) / 2, (z0 + z1) / 2, txt, size)


def nice(s):
    return s.replace('-', ' ')


def draw_building(v, bid, upper, size=10):
    """a building's plan at ground level or on its upper floors, its doors, stairs, hearths and windows"""
    b, ib = BLD[bid], IN[bid]
    wall = ib['walls']
    v.box(b['rect'], IC['wall'], C['ink'], 1.5)
    rooms = ib['rooms']
    for r in rooms:
        if r.get('upper'):
            continue
        open_up = upper and 'ceiling' not in r
        fill = IC['void'] if open_up else (IC['below'] if upper else (IC['raised'] if r['floor'] > min(q['floor'] for q in rooms) else IC['floor']))
        v.box(r['rect'], fill, C['ink'], 0.6)
    if upper:
        for r in rooms:
            if r.get('upper'):
                v.box(r['rect'], IC['floor'], C['ink'], 0.6)
    for (r, up, n) in stairs_of(ib):
        if up is None:
            v.box(r, IC['stair'], C['ink'], 1)
        else:
            flight(v, r, up, n)
    if not upper:
        for h in ib.get('hearths', []):
            v.box(h, IC['hearth'])
    for dd in ib.get('doors', []):
        door(v, dd, wall, upper)
    z1 = b['rect'][3]
    for w in ib.get('windows', []):
        for x in w['xs']:
            hw = 1.1 if w.get('round') or w.get('oriel') else 0.6
            v.box([x - hw, z1 - 0.35, x + hw, z1 + 0.1], IC['window'], C['ink'], 0.6)
    # labels
    for r in rooms:
        x0, z0, x1, z1_ = r['rect']
        if upper != bool(r.get('upper')):
            if upper and 'ceiling' not in r and (x1 - x0) > 4 and r['id'] not in ('dais',):
                v.text((x0 + x1) / 2, (z0 + z1_) / 2, 'open to\nthe roof', size - 1, col=(236, 228, 210))
            continue
        if r['id'] in ('passage', 'dais', 'aisle'):
            v.text((x0 + x1) / 2, (z0 + z1_) / 2 + (1.2 if r['id'] == 'dais' else 0), nice(r['id']), size - 2)
            continue
        txt = nice(r['id']) + ('' if r['floor'] in (0.0, 2.0) or not upper else f"\n+{r['floor']:g}")
        if r.get('bays'):
            xs = [x0 + (x1 - x0) * (k + 0.5) / r['bays'] for k in range(r['bays'])]
            for k in range(1, r['bays']):
                xx = x0 + (x1 - x0) * k / r['bays']
                v.line([(xx, z0), (xx, z1_)], C['ink'], 0.8)
            for xx in xs:
                v.text(xx, (z0 + z1_) / 2, 'stall', size - 2)
            continue
        v.text((x0 + x1) / 2, z0 + 2.2 if r['id'] == 'hall' else (z0 + z1_) / 2, txt, size)


def draw_keep(v, upper, size=10):
    K = D['keep']
    rooms = K['rooms']['upper' if upper else 'ground']
    for t in K['turrets']:
        v.disc(t['x'], t['z'], t['r'], IC['wall'], C['ink'], 1.5)
    v.box(K['rect'], IC['wall'], C['ink'], 2)
    v.box(K['frontispiece']['rect'], IC['wall'], C['ink'], 1.5)
    for t in K['turrets']:
        front = t['z'] > 30
        v.disc(t['x'], t['z'], t['r'] - 1.0, IC['stair'] if front else IC['floor'], C['ink'], 1)
        if front:
            v.disc(t['x'], t['z'], 0.35, C['ink'])
    G = {r['id']: r for r in K['rooms']['ground']}
    if upper:
        v.box(G['throne-hall']['rect'], IC['below'], C['ink'], 0.6)
        for r in rooms:
            v.box(r['rect'], IC['void'] if r['id'] == 'void' else IC['floor'], C['ink'], 0.6)
        vr = next(r for r in rooms if r['id'] == 'void')['rect']
        for a, b in (((vr[0], vr[1]), (vr[2], vr[1])), ((vr[0], vr[1]), (vr[0], 31.2)), ((vr[2], vr[1]), (vr[2], 31.2))):
            v.line([a, b], (230, 220, 200), 2)
        v.text(76, 29, 'open to +20', size, col=(236, 228, 210))
        v.text(76, 19, 'council gallery +7.06', size - 1)
        v.text(68, 26, 'west\ngallery', size - 2)
        v.text(84, 26, 'east\ngallery', size - 2)
    else:
        v.box(G['throne-hall']['rect'], IC['floor'], C['ink'], 0.6)
        v.box(G['dais']['rect'], IC['raised'], C['ink'], 0.8)
        v.box([75.3, 17.6, 76.7, 19.0], C['gold'])
        v.box([75.3, 21.0, 76.7, 37.0], (160, 48, 48))
        for px, pz in G['piers']['pts']:
            v.box([px - 0.9, pz - 0.9, px + 0.9, pz + 0.9], IC['wall'], C['ink'], 1)
        v.text(72.8, 28.0, 'throne\nhall', size, True)
    for sid in ('stair-west', 'stair-east'):
        st = G[sid]
        for f in st['flights']:
            flight(v, f['rect'], f['up'], st['risers'] // 2)
        v.box(st['landing'], IC['stair'], C['ink'], 1)
    for dd in IN['keep']['doors']:
        door(v, dd, 2.0, upper)


def range_context(v, upper):
    """the north curtain behind the range, its walk and the terrace in front"""
    f = D['curtain']['faces']
    o, i = f['outer'], f['inner']
    for xa, xb in ((o['west_x'], D['keep']['rect'][0]), (D['keep']['rect'][2], o['east_x'])):
        v.box([xa, o['north_z'], xb, i['north_z']], IC['curtain'], C['ink'], 1)
    for xa, xb in ((o['west_x'], i['west_x']), (i['east_x'], o['east_x'])):
        v.box([xa, o['north_z'], xb, 42.0], IC['curtain'], C['ink'], 1)
    v.box([i['west_x'], 36.0, i['east_x'], 42.0], IC['terrace'])
    if upper:
        for xa, xb in ((32.0, 64.0), (88.0, 120.0)):
            v.line([(xa, 21.0), (xb, 21.0)], IC['door'], 1.5)
        for x in (32.0, 120.0):
            v.line([(x, 21.0), (x, 42.0)], IC['door'], 1.5)
        v.text(48.0, 20.95, 'wall walk +7.06', 9, col=C['ink'])
        v.text(104.0, 20.95, 'wall walk +7.06', 9, col=C['ink'])
    else:
        v.text(48.0, 39.6, 'terrace +2', 10)
        v.text(104.0, 39.6, 'terrace +2', 10)


fy = TOP + 410 * SS
d.text((SX, fy), 'Inside the keep', font=font(17, True), fill=C['text'], anchor='lm')
s = 7.4 * SS
for k, upper in enumerate((False, True)):
    ox = SX + k * (34 * s + 36 * SS)
    v = View(d, ox, fy + 30 * SS, s, 59, 10)
    draw_keep(v, upper, 9)
    d.text((ox + 17 * s, fy + 30 * SS + 33 * s + 14 * SS), 'upper floor: galleries +7.06' if upper else 'ground floor +2', font=font(12), fill=C['text'], anchor='mm')
d.text((SX, fy + 30 * SS + 33 * s + 44 * SS), 'gold: stairs (the front turrets hold spiral stairs); blue: doors.', font=font(11), fill=C['text'], anchor='lm')
d.text((SX, fy + 30 * SS + 33 * s + 64 * SS), 'Every building inside: castle-v4-interiors.png', font=font(11), fill=C['text'], anchor='lm')

ly = TOP + 990 * SS
d.text((SX, ly), 'Key', font=font(17, True), fill=C['text'], anchor='lm')
items = [(C['lawn'], 'lawn and gardens'), (C['pave'], 'paving and walks'), (C['setts'], 'working yards'), (C['earth'], 'training ground'),
         (C['water'], 'moat and water'), (C['terrace'], 'terrace, raised 2 m'), (C['cream'], 'buildings'), (C['navy'], 'spires')]
for k, (col, txt) in enumerate(items):
    y = ly + 36 * SS + (k // 2) * 34 * SS
    x = SX + (k % 2) * 280 * SS
    d.rectangle([x, y - 10 * SS, x + 34 * SS, y + 10 * SS], fill=col, outline=C['ink'])
    d.text((x + 46 * SS, y), txt, font=font(13), fill=C['text'], anchor='lm')
y = ly + 36 * SS + 4 * 34 * SS
d.line([SX, y, SX + 34 * SS, y], fill=C['axis'], width=int(3 * SS))
d.text((SX + 46 * SS, y), 'the axes', font=font(13), fill=C['text'], anchor='lm')

out = im.resize((WIDTH // SS, HEIGHT // SS), Image.LANCZOS)
save(out, 'castle-v4-plan.png')
print('saved castle-v4-plan.png', out.size)


# ── the interiors sheet: every building the hero enters, inside its own walls ──
S2 = 21.0 * SS
MX, TT = 30 * SS, 84 * SS
W2 = int(2 * MX + 93 * S2)
row1, row2 = TT + 56 * SS, TT + 56 * SS + 31 * S2 + 76 * SS
row3 = row2 + 31 * S2 + 76 * SS
H2 = int(row3 + 15 * S2 + 150 * SS)
im2 = Image.new('RGB', (W2, H2), C['paper'])
d2 = ImageDraw.Draw(im2)
d2.rectangle([0, 0, W2, TT], fill=C['title'])
d2.text((MX, TT * 0.5), 'CASTLE v4: INSIDE THE BUILDINGS', font=font(30, True), fill=(248, 236, 210), anchor='lm')
d2.text((MX + 640 * SS, TT * 0.5), 'every door is one door from both sides; heights above the bailey', font=font(15), fill=(214, 200, 176), anchor='lm')
for k, (y, upper, title) in enumerate(((row1, False, "The north range at the terrace's level (+2): kitchen, great hall, keep, chapel, solar"),
                                       (row2, True, "Its upper floors: the minstrels' gallery +5.4, the keep's galleries +7.06 on the wall walk, the solar +6.4"))):
    d2.text((MX, y - 24 * SS), title, font=font(17, True), fill=C['text'], anchor='lm')
    v = View(d2, MX, y, S2, 30, 10)
    range_context(v, upper)
    for bid in ('kitchen', 'great-hall', 'chapel', 'solar'):
        draw_building(v, bid, upper, 12)
    draw_keep(v, upper, 12)
d2.text((MX, row3 - 24 * SS), 'The stables and the barracks (+0; lofts at +2.9 over the stalls and rooms), the gatehouse and a wall tower', font=font(17, True), fill=C['text'], anchor='lm')
v = View(d2, MX, row3, S2, 31, 63)
v.box([31, 63, 56, 64.6], IC['yard'])
v.text(43.5, 63.8, 'stable yard', 11)
v.box([31, 75.4, 56, 77], (176, 208, 140))
v.text(43.5, 76.2, 'paddock', 11)
v.box([30.9, 63, 33.1, 77], IC['curtain'], C['ink'], 1)
draw_building(v, 'stables', False, 12)
v = View(d2, MX + 27 * S2, row3, S2, 96, 63)
v.box([96, 63, 121, 64.6], IC['yard'])
v.text(108.5, 63.8, 'muster yard', 11)
v.box([96, 75.4, 121, 77], (214, 186, 140))
v.text(108.5, 76.2, 'training yard', 11)
v.box([118.9, 63, 121.1, 77], IC['curtain'], C['ink'], 1)
draw_building(v, 'barracks', False, 12)
# the gatehouse: the passage between the drums, a spiral stair in each
G = D['gatehouse']
v = View(d2, MX + 54 * S2, row3 + 1 * S2, S2, 66, 96)
v.box([66, 98.9, 86, 101.1], IC['curtain'], C['ink'], 1)
v.box([G['x'] - 6, G['z'] - 1.9, G['x'] + 6, G['z'] + 1.9], IC['wall'], C['ink'], 1.5)
v.box([G['x'] - 2, G['z'] - 1.9, G['x'] + 2, G['z'] + 1.9], IC['floor'], C['ink'], 0.6)
for dr_ in G['drums']:
    v.disc(dr_['x'], dr_['z'], dr_['r'], IC['wall'], C['ink'], 1.5)
    v.disc(dr_['x'], dr_['z'], dr_['r'] - 0.8, IC['stair'], C['ink'], 1)
    v.disc(dr_['x'], dr_['z'], 0.3, C['ink'])
    v.box([dr_['x'] - 0.6, dr_['z'] - dr_['r'] - 0.1, dr_['x'] + 0.6, dr_['z'] - dr_['r'] + 0.9], IC['door'])
v.box([66, 96, 86, 97.4], IC['terrace'])
v.text(76, 96.7, 'forecourt', 11)
v.text(76, 100, 'gate\npassage', 11)
v.text(76, 103.2, 'gatehouse: spiral stairs in the drums to the walk and the gate chamber (+7.06)', 11)
# a wall tower at the walk's level
t = next(t for t in D['towers'] if t['id'] == 'wall-W2')
v = View(d2, MX + 78 * S2, row3 + 1 * S2, S2, 24, 56)
v.box([30.9, 56, 33.1, 65], IC['curtain'], C['ink'], 1)
v.disc(t['x'], t['z'], t['r'], IC['wall'], C['ink'], 1.5)
v.disc(t['x'], t['z'], t['r'] - 0.9, IC['floor'], C['ink'], 1)
v.line([(31.6, 56), (31.6, 65)], IC['door'], 1.5)
hc = math.sqrt((t['r'] - 0.9) ** 2 - (31.6 - t['x']) ** 2)
for zz in (t['z'] - hc - 0.45, t['z'] + hc + 0.45):
    v.box([31.0, zz - 0.5, 32.2, zz + 0.5], IC['door'])
v.disc(t['x'] - 1.3, t['z'], 0.9, IC['stair'], C['ink'], 1)
v.disc(t['x'] - 1.3, t['z'], 0.2, C['ink'])
v.text(28.5, 66.2, 'wall tower at +7.06:\nthe walk passes through,\nits spiral to the platform', 11)
# the key
ky = row3 + 15 * S2 + 60 * SS
items = [(IC['floor'], 'floor'), (IC['raised'], 'dais, raised floor'), (IC['void'], 'open to the roof'), (IC['below'], 'the room below'),
         (IC['stair'], 'stair, arrow up'), (IC['door'], 'door'), (IC['hatch'], 'half-door, hatch'), (IC['hearth'], 'hearth'), (IC['window'], 'window')]
for k, (col, txt) in enumerate(items):
    x = MX + k * 220 * SS
    d2.rectangle([x, ky - 10 * SS, x + 30 * SS, ky + 10 * SS], fill=col, outline=C['ink'])
    d2.text((x + 40 * SS, ky), txt, font=font(13), fill=C['text'], anchor='lm')
out2 = im2.resize((W2 // SS, H2 // SS), Image.LANCZOS)
save(out2, 'castle-v4-interiors.png')
print('saved castle-v4-interiors.png', out2.size)

# ── the massing pictures, from massing.py's renders ────────────────────────
if len(sys.argv) > 1:
    src = sys.argv[1]
    save(Image.open(os.path.join(src, 'castle-v4-massing.png')), 'castle-v4-massing.png', True)
    views = [('camera-avenue.png', 'On the avenue by the fountain, camera zoomed out: the keep is beyond the top of the screen'),
             ('camera-door.png', 'At the great door: the front turrets and the frontispiece frame the door'),
             ('camera-bridge.png', 'On the bridge: the moat, the gate drums and the gate terrace'),
             ('camera-yards.png', 'At the stables\' door: stable yard, kitchen garden, paddock, parterre'),
             ('camera-stair-foot.png', "At the stair's foot: two flights up to the turning landing"),
             ('camera-stair-head.png', "At the stair's head: the ledge road between its two walls")]
    tw, th, cap, gap, cols = 800, 450, 40, 12, 3
    sheet = Image.new('RGB', (cols * tw + (cols + 1) * gap, 2 * (th + cap) + 3 * gap + 56), C['paper'])
    sd = ImageDraw.Draw(sheet)
    sd.rectangle([0, 0, sheet.width, 56], fill=C['title'])
    f1 = ImageFont.truetype('georgiab.ttf', 24)
    f2 = ImageFont.truetype('georgia.ttf', 17)
    sd.text((gap + 4, 28), 'CASTLE v4 from the play camera (massing; the blue post is the 2 m hero)', font=f1, fill=(248, 236, 210), anchor='lm')
    for k, (name, text) in enumerate(views):
        x = gap + (k % cols) * (tw + gap)
        y = 56 + gap + (k // cols) * (th + cap + gap)
        sheet.paste(Image.open(os.path.join(src, name)).convert('RGB').resize((tw, th), Image.LANCZOS), (x, y))
        sd.text((x + 4, y + th + cap / 2), text, font=f2, fill=C['text'], anchor='lm')
    save(sheet, 'castle-v4-massing-camera.png', True)
    print('saved castle-v4-massing.png and castle-v4-massing-camera.png')
