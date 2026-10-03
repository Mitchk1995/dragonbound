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
island = [(14, 96), (18, 80), (12, 66), (20, 54), (21, 40), (19.5, 22), (23, 6), (40, 3.5), (58, 4), (84, 4), (100, 10), (118, 6), (132, 12),
          (138, 10), (141, 30), (144, 46), (147, 30), (150, 10), (170, 9), (170, 150), (126, 200), (112, 204), (96, 198), (74, 190), (60, 184),
          (46, 170), (34, 158), (28, 140), (20, 124), (24, 108)]
d.polygon([P(*p) for p in island], fill=C['meadow'])
crown = [tuple(p) for p in D['crown']['outline']]
d.polygon([P(*p) for p in crown], fill=C['rock'])
# (the turf drawn a little inside the rock's edge, so the cliff's lip shows as a dark rim)
inset = [(x - (x - AX) * 1.3 / math.hypot(x - AX, z - 62), z - (z - 62) * 1.3 / math.hypot(x - AX, z - 62)) for x, z in crown]
d.polygon([P(*p) for p in inset], fill=C['crown'])

# the farm, moved south (context)
for x in (58, 62, 66, 70):
    for z in (130, 134, 144, 148):
        rect([x - 1.5, z - 1.2, x + 1.5, z + 1.2], C['farm'])
rect([44, 126, 58.4, 138.4], None, C['fence'], 2)

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
cl = A['climb']['pts']
line(cl, C['pave_edge'], 5.4 * PX)
line(cl, C['road'], 4.4 * PX)


def parapet(a, b):
    line([a, b], C['stone'], 0.7 * PX)
    line([a, b], C['ink'], 1 * SS)


for key in ('ledge_road', 'ledge_walk'):
    x0, z0, x1, z1 = A[key]['rect']
    parapet((x0, z0 + 0.3), (x1, z0 + 0.3))
    parapet((x0, z1 - 0.3), (x1, z1 - 0.3))
gx0, gz0, gx1, gz1 = A['gate_terrace']['rect']
br = A['bridge']['rect']
parapet((gx0, gz1 - 0.3), (gx1, gz1 - 0.3))
for xx in (gx0 + 0.3, gx1 - 0.3):
    parapet((xx, 115.0), (xx, gz1))
parapet((gx0, gz0 + 0.3), (br[0], gz0 + 0.3))
parapet((br[2], gz0 + 0.3), (gx1, gz0 + 0.3))
lx0, lz0, lx1, lz1 = A['landing']['rect']
parapet((lx0, lz0 + 0.3), (lx1, lz0 + 0.3))
parapet((lx1 - 0.3, lz0), (lx1 - 0.3, 114.0))
parapet((lx0, lz1 - 0.3), (lx1 - 5.5, lz1 - 0.3))
parapet((lx0 + 0.3, 115.0), (lx0 + 0.3, lz1))
ox0, oz0, ox1, oz1 = A['lookout']['rect']
parapet((ox0, oz0 + 0.3), (ox1, oz0 + 0.3))
parapet((ox0 + 0.3, oz0), (ox0 + 0.3, oz1))
parapet((ox0, oz1 - 0.3), (ox1, oz1 - 0.3))
parapet((ox1 - 0.3, 115.0), (ox1 - 0.3, oz1))
rect(br, C['pave'], C['ink'], 2)
for xx in (71.0, 81.0):
    disc(xx, gz0 + 1.2, 0.45, C['flag'])

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
    far, near = (x0 + 0.2, x1 - 0.2) if zid == 'paddock' else (x1 - 0.2, x0 + 0.2)
    for a, b in (((x0, z1 - 0.2), (x1, z1 - 0.2)), ((far, z0), (far, z1)), ((near, z0), (near, gz - 1.6)), ((near, gz + 1.6), (near, z1))):
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
    # walls, open at the gates
    t = 0.5
    gates = Z[zid]['gates']
    s_gate = next(g for g in gates if g[2] == 's')
    e_gate = next(g for g in gates if g[2] in 'ew')
    for a, b in (((x0, z1), (s_gate[0] - 1.2, z1)), ((s_gate[0] + 1.2, z1), (x1, z1))):
        line([a, b], C['stone'], t * PX)
        line([a, b], C['ink'], 1 * SS)
    for xx in (x0 + 0.25, x1 - 0.25):
        if abs(xx - e_gate[0]) < 1:
            segs = (((xx, z0), (xx, e_gate[1] - 1.2)), ((xx, e_gate[1] + 1.2), (xx, z1)))
        else:
            segs = (((xx, z0), (xx, z1)),)
        for a, b in segs:
            line([a, b], C['stone'], t * PX)
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
    n = s.get('steps', 8)
    for k in range(1, n):
        z = z0 + (z1 - z0) * k / n
        line([(x0, z), (x1, z)], C['pave_edge'], 1 * SS)
for side in ('west', 'east'):
    f = F[f'champion-{side}']
    rect([f['x'] - 0.8, f['z'] - 0.8, f['x'] + 0.8, f['z'] + 0.8], C['stone'], C['ink'], 1)
# the terrace's edge: a retaining wall with a balustrade
for a, b in (((33.6, 44), (42, 44)), ((46, 44), (60, 44)), ((60, 44), (60, 48)), ((60, 48), (69.5, 48)), ((82.5, 48), (92, 48)), ((92, 48), (92, 44)), ((92, 44), (106, 44)), ((110, 44), (118.4, 44))):
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
tag(44, 61.5, 'stable yard', 10)
tag(108, 61.5, 'muster yard', 10)
tag(44, 70.0, 'STABLES  6.5 m', 10, True)
tag(108, 70.0, 'BARRACKS  6.5 m', 10, True)
tag(44, 94.5, 'PADDOCK', 12, True)
tag(108, 93.0, 'TRAINING YARD', 11, True)
tag(76, 59.6, 'DRAGON FOUNTAIN', 10, True)
tag(76, 92.0, 'forecourt', 10)
tag(76, 113.5, 'GATE TERRACE', 10, True)
tag(101.5, 112.2, 'LEDGE ROAD', 11, True)
tag(50.5, 112.2, 'LEDGE WALK', 11, True)
tag(124, 115.2, 'LANDING', 10, True)
tag(28, 115.2, 'LOOKOUT', 10, True)
tag(124.4, 50, 'MOAT', 12, True, fill=C['blue_tag'])
tag(27.6, 50, 'MOAT', 12, True, fill=C['blue_tag'])
tag(76, 105.2, 'bridge', 9, fill=C['blue_tag'])
tag(86.5, 122.8, 'fall and pool', 10, fill=C['blue_tag'], anchor='lm')
tag(14.0, 84.6, 'overflow fall', 9, fill=C['blue_tag'], anchor='lm')
tag(27.5, 7.0, 'spring', 9, fill=C['blue_tag'])
tag(124.5, 7.0, 'spring', 9, fill=C['blue_tag'])
tag(132.5, 136.5, 'climb to the portal court', 10)
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


def floorplan(ox, oy, s, upper):
    rooms = K['rooms']['upper' if upper else 'ground']
    x0, z0, x1, z1 = K['rect']

    def Q(x, dz):
        return (ox + (x - x0) * s, oy + dz * s)

    def box(r, fill, outline=None):
        d.rectangle([*Q(r[0], r[1] - z0), *Q(r[2], r[3] - z0)], fill=fill, outline=outline)

    d.rectangle([*Q(x0, 0), *Q(x1, z1 - z0)], fill=(232, 222, 200), outline=C['ink'], width=int(3 * SS))
    for t in K['turrets']:
        cx, cz = Q(t['x'], t['z'] - z0)
        r = t['r'] * s
        d.ellipse([cx - r, cz - r, cx + r, cz + r], fill=(222, 210, 186), outline=C['ink'], width=int(2 * SS))
    if upper:
        v = next(r for r in rooms if r['id'] == 'void')['rect']
        box(v, (72, 66, 60))
        d.text(Q(76, (v[1] + v[3]) / 2 - z0), 'open to\nthe hall', font=font(10), fill=(240, 232, 214), anchor='mm', align='center')
        d.text(Q(76, 21.5), 'gallery', font=font(10), fill=C['text'], anchor='mm')
        d.text(Q(76, 3.0), 'council gallery', font=font(10), fill=C['text'], anchor='mm')
    else:
        box(next(r for r in rooms if r['id'] == 'dais')['rect'], (200, 180, 140), C['ink'])
        box([75.2, z0 + 1.6, 76.8, z0 + 3.0], C['gold'])
        box([75.2, z0 + 4.0, 76.8, z1 - 1.0], (150, 40, 40))
        for (px, pz) in ((69.5, 9.5), (82.5, 9.5), (69.5, 16.5), (82.5, 16.5)):
            d.rectangle([*Q(px - 0.9, pz - 0.9), *Q(px + 0.9, pz + 0.9)], fill=(170, 160, 140), outline=C['ink'])
        d.text(Q(72.2, 13), 'throne\nhall', font=font(11, True), fill=C['text'], anchor='mm', align='center')
        for (pa, pb) in (((74, 23), (78, 24.2)), ((63.8, 10.5), (65, 12.5)), ((87, 10.5), (88.2, 12.5))):
            d.rectangle([*Q(*pa), *Q(*pb)], fill=(232, 222, 200))
        d.text(Q(76, 26.6), 'great door', font=font(10), fill=C['text'], anchor='mm')
        d.text(Q(61.0, 11.5), 'hall', font=font(10), fill=C['text'], anchor='mm')
        d.text(Q(91.0, 11.5), 'chapel', font=font(10), fill=C['text'], anchor='mm')
    for sid in ('stair-west', 'stair-east'):
        box(next(r for r in K['rooms']['ground'] if r['id'] == sid)['rect'], (214, 155, 57), C['ink'])


fy = TOP + 410 * SS
d.text((SX, fy), 'Inside the keep', font=font(17, True), fill=C['text'], anchor='lm')
s = 7.4 * SS
floorplan(SX + 30 * SS, fy + 46 * SS, s, False)
floorplan(SX + 30 * SS + 24 * s + 70 * SS, fy + 46 * SS, s, True)
yy = fy + 46 * SS + 24 * s + 44 * SS
d.text((SX + 30 * SS + 12 * s, yy), 'ground floor, +2', font=font(12), fill=C['text'], anchor='mm')
d.text((SX + 30 * SS + 24 * s + 70 * SS + 12 * s, yy), 'upper floor, +8', font=font(12), fill=C['text'], anchor='mm')
d.text((SX, yy + 30 * SS), 'gold: the two stairs. The storeys above stay closed for now.', font=font(11), fill=C['text'], anchor='lm')

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

# ── the massing pictures, from massing.py's renders ────────────────────────
if len(sys.argv) > 1:
    src = sys.argv[1]
    save(Image.open(os.path.join(src, 'castle-v4-massing.png')), 'castle-v4-massing.png', True)
    views = [('camera-avenue.png', 'On the avenue by the fountain, camera zoomed out: the keep is beyond the top of the screen'),
             ('camera-door.png', 'At the great door: the front turrets and the frontispiece frame the door'),
             ('camera-bridge.png', 'On the bridge: the moat, the gate drums and the gate terrace'),
             ('camera-yards.png', 'At the stables\' door: stable yard, kitchen garden, paddock, parterre')]
    tw, th, cap, gap = 960, 540, 40, 12
    sheet = Image.new('RGB', (2 * tw + 3 * gap, 2 * (th + cap) + 3 * gap + 56), C['paper'])
    sd = ImageDraw.Draw(sheet)
    sd.rectangle([0, 0, sheet.width, 56], fill=C['title'])
    f1 = ImageFont.truetype('georgiab.ttf', 24)
    f2 = ImageFont.truetype('georgia.ttf', 17)
    sd.text((gap + 4, 28), 'CASTLE v4 from the play camera (massing; the blue post is the 2 m hero)', font=f1, fill=(248, 236, 210), anchor='lm')
    for k, (name, text) in enumerate(views):
        x = gap + (k % 2) * (tw + gap)
        y = 56 + gap + (k // 2) * (th + cap + gap)
        sheet.paste(Image.open(os.path.join(src, name)).convert('RGB').resize((tw, th), Image.LANCZOS), (x, y))
        sd.text((x + 4, y + th + cap / 2), text, font=f2, fill=C['text'], anchor='lm')
    save(sheet, 'castle-v4-massing-camera.png', True)
    print('saved castle-v4-massing.png and castle-v4-massing-camera.png')
