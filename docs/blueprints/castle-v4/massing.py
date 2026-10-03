"""Massing renders of castle v4, built from design.json (Blender 5.2, headless):

    blender -b --python massing.py -- <output folder> [overview] [camera] [climb] [extra]

castle-v4-massing.png is the overview angle of the bailey suite (src/dev/castleInspect.ts), framed on
today's curtain exactly as the review picture v5-overview.jpg. camera-*.png are the game's own camera
(game.ts updateCamera: 21 up and 14 back per zoom step, 42 degree field of view) at the avenue, the
great door, the bridge and the stables' door, and with `climb` at the stair's foot and head; plan.py lays
them out with captions, with `lookout` (the play camera on the south-west knoll) and `north` (from above the
Veil to the north-west: the moat behind the keep and the slate roofs). `extra` adds check
views (from the farm, the landing, the north, the west, and the play camera at the great hall's dais,
where it lands inside the keep's front turret). Plain blocks, cylinders and cones in the castle's
colours (trim in the same stone, a shade darker); the blue post is the 2 m hero.
"""
import bpy, json, math, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
D = json.load(open(os.path.join(HERE, 'design.json'), encoding='utf-8'))
CY = D['conventions']['crown_world_y']
ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = ARGS[0] if ARGS else HERE
ONLY = set(ARGS[1:]) or {'overview', 'camera', 'climb', 'lookout', 'north'}

# ── scene, materials ───────────────────────────────────────────────────────
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
for eng in ('BLENDER_EEVEE', 'BLENDER_EEVEE_NEXT'):
    try:
        sc.render.engine = eng
        break
    except TypeError:
        pass
sc.view_settings.view_transform = 'Standard'
try:
    sc.eevee.taa_render_samples = 32
except AttributeError:
    pass
world = bpy.data.worlds.new('veil')
sc.world = world
if world.node_tree is None:
    world.use_nodes = True
bg = world.node_tree.nodes.get('Background')
bg.inputs[0].default_value = (0.62, 0.52, 0.60, 1.0)
bg.inputs[1].default_value = 0.9


def lin(c):
    c /= 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def mat(name, rgb, rough=0.85, metal=0.0):
    m = bpy.data.materials.new(name)
    if m.node_tree is None:
        m.use_nodes = True
    b = m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = (lin(rgb[0]), lin(rgb[1]), lin(rgb[2]), 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    return m


M = {k: mat(k, *v) for k, v in {
    'meadow': ((104, 146, 76),), 'lawn': ((112, 168, 82),), 'rock': ((94, 101, 114),), 'water': ((70, 140, 196), 0.15),
    'foam': ((224, 240, 250), 0.4), 'pave': ((176, 170, 162),), 'setts': ((156, 146, 128),), 'earth': ((150, 124, 86),),
    'curtain': ((197, 183, 155),), 'cream': ((224, 212, 186),), 'keep': ((236, 224, 196),), 'trim': ((172, 156, 128),),
    'navy': ((61, 90, 142), 0.6), 'gold': ((214, 166, 70), 0.35, 0.8), 'lead': ((88, 108, 140), 0.6), 'deck': ((138, 132, 120),),
    'box': ((54, 100, 52),), 'leaf': ((70, 128, 60),), 'blossom': ((236, 170, 196),), 'bed': ((110, 82, 56),), 'fence': ((110, 76, 48),),
    'flag': ((47, 90, 208), 0.7), 'bronze': ((150, 98, 48), 0.4, 0.7), 'hero': ((40, 90, 230), 0.5), 'flower': ((226, 110, 150),),
    'farm': ((122, 96, 62),), 'horse': ((120, 76, 44),), 'glass': ((60, 78, 104), 0.3), 'slate': ((70, 90, 132), 0.55),
}.items()}


def V(x, z, h):
    """design (x east, z south, h up) to Blender (x, -z, h)"""
    return (x, -z, h)


def Y(h):
    """crown-relative height to world"""
    return CY + h


def mesh_obj(name, verts, faces, m):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    ob = bpy.data.objects.new(name, me)
    ob.data.materials.append(m)
    sc.collection.objects.link(ob)
    return ob


def prism(poly, h0, h1, m, name='prism'):
    n = len(poly)
    if sum(poly[i][0] * -poly[(i + 1) % n][1] - poly[(i + 1) % n][0] * -poly[i][1] for i in range(n)) < 0:
        poly = poly[::-1]
    v = [V(x, z, h0) for x, z in poly] + [V(x, z, h1) for x, z in poly]
    f = [tuple(range(n - 1, -1, -1)), tuple(range(n, 2 * n))] + [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
    return mesh_obj(name, v, f, m)


def box(x0, z0, x1, z1, h0, h1, m, name='box'):
    return prism([(x0, z0), (x1, z0), (x1, z1), (x0, z1)], h0, h1, m, name)


def obox(ax, az, bx, bz, t, h0, h1, m, name='wall'):
    L = math.hypot(bx - ax, bz - az)
    nx, nz = -(bz - az) / L * t / 2, (bx - ax) / L * t / 2
    return prism([(ax + nx, az + nz), (bx + nx, bz + nz), (bx - nx, bz - nz), (ax - nx, az - nz)], h0, h1, m, name)


def cyl(x, z, r, h0, h1, m, n=28, name='cyl'):
    return prism([(x + r * math.cos(2 * math.pi * i / n), z + r * math.sin(2 * math.pi * i / n)) for i in range(n)], h0, h1, m, name)


def cone(x, z, r, h0, h1, m, n=28, name='cone'):
    v = [V(x + r * math.cos(2 * math.pi * i / n), z - r * math.sin(2 * math.pi * i / n), h0) for i in range(n)] + [V(x, z, h1)]
    return mesh_obj(name, v, [tuple(range(n - 1, -1, -1))] + [(i, (i + 1) % n, n) for i in range(n)], m)


def ball(x, z, r, h, m, name='ball'):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=r, location=V(x, z, h))
    ob = bpy.context.active_object
    ob.name = name
    ob.data.materials.append(m)
    return ob


def flat(poly, h, m, name='flat'):
    return prism(poly, h - 0.03, h, m, name)


def rp(r):
    x0, z0, x1, z1 = r
    return [(x0, z0), (x1, z0), (x1, z1), (x0, z1)]


def crenels(ax, az, bx, bz, t, h, m, step=1.6):
    L = math.hypot(bx - ax, bz - az)
    n = max(1, int(L / step))
    for i in range(n):
        u0, u1 = (i + 0.2) / n, (i + 0.65) / n
        obox(ax + (bx - ax) * u0, az + (bz - az) * u0, ax + (bx - ax) * u1, az + (bz - az) * u1, t, h, h + 0.9, m, 'merlon')


def ring_merlons(x, z, r, h, m, n=12):
    for i in range(n):
        a = 2 * math.pi * i / n
        cx, cz = x + (r - 0.3) * math.cos(a), z + (r - 0.3) * math.sin(a)
        box(cx - 0.4, cz - 0.4, cx + 0.4, cz + 0.4, h, h + 0.9, m, 'merlon')


def cut_out(obj, cutter):
    mod = obj.modifiers.new('cut', 'BOOLEAN')
    mod.object = cutter
    mod.operation = 'DIFFERENCE'
    for o in sc.objects:
        o.select_set(False)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.modifier_apply(modifier='cut')


# ── the island and the crown ───────────────────────────────────────────────
island = [tuple(p) for p in D['island']['outline']]
prism(island, -16, 0, M['rock'], 'island-side')
flat(island, 0.0, M['meadow'], 'lowland')
for h, poly in ((3, [[206, 104], [262, 100], [270, 130], [256, 156], [214, 160], [206, 132]]),
                (5, [[25, 46], [26, 26], [40, 12], [60, 8], [84, 7], [100, 11.5], [118, 10], [134, 18], [130, 32], [127.5, 42], [133, 50], [142, 58], [139, 66], [131, 72], [127.5, 80], [129, 90], [124, 100], [100, 108], [66, 108], [44, 106], [30, 100], [22, 90], [20, 66]]),
                (8, [[125, 50], [131, 53], [136, 58.5], [132.5, 63], [125, 62]]),
                (7, [[156, 20], [186, 20], [220, 28], [232, 40], [226, 58], [200, 64], [170, 60], [156, 44]])):
    prism([tuple(p) for p in poly], 0, h - 0.04, M['rock'], f'level{h}')
    flat([tuple(p) for p in poly], h, M['meadow'], f'level{h}-top')
crown = [tuple(p) for p in D['crown']['outline']]
Wt = D['water']
moat = [tuple(p) for p in Wt['moat']['counterscarp']]
mo = Wt['moat']['outer']
rock = prism(crown, 0, CY - 0.02, M['rock'], 'crown-rock')
turf = prism(crown, CY - 0.4, CY, M['lawn'], 'crown-turf')
# the moat rings the castle: cut everything inside its outer bank, then put back the bailey's rock inside the curtain
cutter = prism(moat, Y(Wt['moat']['bed']), Y(1), M['water'], 'moat-cut')
for ob in (rock, turf):
    cut_out(ob, cutter)
bpy.data.objects.remove(cutter)
cf = D['curtain']['faces']['outer']
bailey_rock = [(cf['west_x'] + 0.1, cf['north_z'] + 0.1), (cf['east_x'] - 0.1, cf['north_z'] + 0.1), (cf['east_x'] - 0.1, cf['south_z'] - 0.1), (cf['west_x'] + 0.1, cf['south_z'] - 0.1)]
prism(bailey_rock, Y(Wt['moat']['bed']), CY - 0.42, M['rock'], 'bailey-rock')
prism(bailey_rock, CY - 0.4, CY, M['lawn'], 'bailey-turf')
flat(moat, Y(Wt['moat']['surface']), M['water'], 'moat-water')
for (ax, az), (bx, bz) in zip(moat, moat[1:] + moat[:1]):
    obox(ax, az, bx, bz, 0.7, Y(-0.4), Y(0.3), M['trim'], 'coping')

# falls, springs, pool, stream
for f in Wt['falls']:
    if f['id'] == 'south-fall':
        box(f['x'] - f['w'] / 2, f['z'] - 0.1, f['x'] + f['w'] / 2, f['z'] + 1.4, 0.05, Y(f['top']), M['foam'], 'south-fall')
    else:
        box(f['x'] - 0.5, f['z'] - f['w'] / 2, mo['west_x'], f['z'] + f['w'] / 2, Y(-2.6), Y(f['top']), M['water'], 'overflow')
        box(f['x'] - 1.2, f['z'] - f['w'] / 2, f['x'] - 0.5, f['z'] + f['w'] / 2, -14, Y(f['top']), M['foam'], 'west-fall')
for s in Wt['springs']:
    box(s['x'] - 0.7, s['z'] - 0.1, s['x'] + 0.7, s['z'] + 0.5, Y(Wt['moat']['surface']), Y(-0.5), M['foam'], 'spring')
    box(s['x'] - 1.1, s['z'] + 0.5, s['x'] + 1.1, s['z'] + 2.0, Y(Wt['moat']['surface']), Y(Wt['moat']['surface']) + 0.05, M['foam'], 'spring-foam')
pl = Wt['pool']
cyl(pl['x'], pl['z'], pl['r'], 0.0, 0.08, M['water'], 32, 'pool')
for (ax, az), (bx, bz) in zip(Wt['stream'], Wt['stream'][1:]):
    obox(ax, az, bx, bz, 2.2, 0.0, 0.06, M['water'], 'stream')
    cyl(bx, bz, 1.1, 0.0, 0.06, M['water'], 12, 'stream')

# the farm, moved south, for context
for x in (58, 62, 66, 70):
    for z in (130, 134, 144, 148):
        box(x - 1.5, z - 1.2, x + 1.5, z + 1.2, 0, 0.35, M['farm'], 'plot')
for (ax, az, bx, bz) in ((44, 126, 58.4, 126), (58.4, 126, 58.4, 138.4), (58.4, 138.4, 44, 138.4), (44, 138.4, 44, 126)):
    obox(ax, az, bx, bz, 0.15, 0, 1.2, M['fence'], 'fence')

# ── the approach ───────────────────────────────────────────────────────────
A = D['approach']
ms = mo['south_z']


def parapet(ax, az, bx, bz, h=1.1):
    obox(ax, az, bx, bz, 0.6, Y(0), Y(h - 0.15), M['curtain'], 'parapet')
    obox(ax, az, bx, bz, 0.72, Y(h - 0.15), Y(h), M['trim'], 'coping')


for key in ('ledge_road', 'ledge_walk', 'landing', 'lookout'):
    flat([tuple(p) for p in A[key]['paving']], Y(0.04), M['pave'], key)
flat(rp(A['gate_terrace']['rect']), Y(0.04), M['pave'], 'gate_terrace')
# the gate bastion: built masonry from the rock at the cliff's foot, projecting beyond the natural brink
box(*A['gate_terrace']['bastion'], 0.0, Y(0.0), M['curtain'], 'bastion')
PA = A['parapets']
pt = PA['top_world'] - PA['base_world']
for ln in PA['lines']:
    pts = ln['pts']
    for (ax, az), (bx, bz) in zip(pts, pts[1:]):
        parapet(ax, az, bx, bz, pt)
# the bridge: deck on two arches and a pier with cutwaters, parapets; banner poles at its foot
B_ = A['bridge']
br = B_['rect']
box(br[0], br[1], br[2], br[3], Y(B_['soffit_crown']), Y(0.05), M['curtain'], 'bridge-deck')
for za, zb in B_['arches']:
    for xx in (br[0], br[2] - 0.5):
        box(xx, za, xx + 0.5, zb, Y(B_['springing']), Y(B_['soffit_crown']), M['curtain'], 'spandrel')
pz0, pz1 = B_['pier'][1], B_['pier'][3]
box(br[0], pz0, br[2], pz1, Y(Wt['moat']['bed']), Y(B_['soffit_crown']), M['curtain'], 'bridge-pier')
for sgn, xe in ((-1, br[0]), (1, br[2])):
    prism([(xe, pz0), (xe + sgn * B_['cutwaters'], (pz0 + pz1) / 2), (xe, pz1)], Y(Wt['moat']['bed']), Y(-1.0), M['curtain'], 'cutwater')
for ln in PA['bridge']:
    (ax, az), (bx, bz) = ln['pts']
    obox(ax, az, bx, bz, B_['parapet_t'], Y(0), Y(1.0), M['curtain'], 'parapet')
for x, z in A['gate_terrace']['banner_poles']:
    cyl(x, z, 0.12, Y(0), Y(7.5), M['deck'], 8, 'pole')
    box(x - 0.05, z - 0.6, x + 0.05, z + 0.6, Y(3.6), Y(7.2), M['flag'], 'banner')
for x, z in PA['lamps'] + A['gate_terrace']['lamps']:
    cyl(x, z, 0.1, Y(0), Y(3.2), M['deck'], 6, 'lamp')

# the climb: four flights of solid steps and their landings, walls raking with each flight
CL = A['climb']
n = CL['risers_per_flight']
for fl in CL['flights']:
    x0, z0, x1, z1 = fl['rect']
    h0, h1 = fl['from_world'], fl['to_world']
    for k in range(n):
        top = h0 + (h1 - h0) * (k + 1) / n
        u0, u1 = k / n, (k + 1) / n
        if fl['up'] == 'n':     # climbing north: the first step at the south end
            r = (x0, z1 - (z1 - z0) * u1, x1, z1 - (z1 - z0) * u0)
        else:                   # climbing west: the first step at the east end
            r = (x1 - (x1 - x0) * u1, z0, x1 - (x1 - x0) * u0, z1)
        box(*r, 0.0, top, M['pave'], 'step')
for ld in CL['landings']:
    box(*ld['rect'], 0.0, ld['world'], M['pave'], 'landing')
for w in CL['walls']:
    for (ax, az, ah), (bx, bz, bh) in zip(w['pts'], w['pts'][1:]):
        L = math.hypot(bx - ax, bz - az)
        if L < 0.01:
            continue
        m = max(1, int(L / 0.25))
        for i in range(m):
            u0, u1 = i / m, (i + 1) / m
            obox(ax + (bx - ax) * u0, az + (bz - az) * u0, ax + (bx - ax) * u1, az + (bz - az) * u1, CL['wall_t'], CL['wall_base_world'], ah + (bh - ah) * (u0 + u1) / 2, M['curtain'], 'climb-wall')
for x, z in CL['buttresses']:
    box(x - 0.6, z - 0.3, x + 0.6, z + 0.9, 0.0, 10.5, M['curtain'], 'buttress')
for x, z in CL['lamps']:
    h = max([p[2] for w in CL['walls'] for p in w['pts'] if math.hypot(p[0] - x, p[1] - z) < 0.8] or [CY + 1.1])
    cyl(x, z, 0.1, h, h + 1.8, M['deck'], 6, 'lamp')

# ── the bailey ─────────────────────────────────────────────────────────────
cu = D['curtain']['centre_lines']
flat(rp([cu['west_x'], cu['north_z'], cu['east_x'], cu['south_z']]), Y(0.02), M['lawn'], 'bailey')
for r in D['terrace']['parts']:
    box(*r, Y(0), Y(D['terrace']['level']), M['pave'], 'terrace')
for wk in D['walks']:
    flat(rp(wk['rect']), Y(0.05), M['pave'], wk['id'])
Z = {z['id']: z for z in D['zones']}
for zid in ('cour', 'forecourt'):
    flat(rp(Z[zid]['rect']), Y(0.05), M['pave'], zid)
for zid in ('stable-yard', 'muster-yard'):
    flat(rp(Z[zid]['rect']), Y(0.06), M['setts'], zid)
flat(rp(Z['training-yard']['rect']), Y(0.06), M['earth'], 'training')
for zid in ('paddock', 'training-yard'):
    x0, z0, x1, z1 = Z[zid]['rect']
    gx, gz = Z[zid]['gate']
    obox(gx, z0, gx, gz - 1.6, 0.15, Y(0), Y(1.2), M['fence'], 'fence')
    obox(gx, gz + 1.6, gx, z1, 0.15, Y(0), Y(1.2), M['fence'], 'fence')
for (x, z) in ((40, 82), (46, 89), (49.5, 80.5)):
    box(x - 1.1, z - 0.35, x + 1.1, z + 0.35, Y(0.6), Y(1.6), M['horse'], 'horse')
for x in (102, 105, 111, 114):
    cyl(x, 80, 0.25, Y(0), Y(1.8), M['navy'], 8, 'pell')
for x in (102.5, 108, 113.5):
    box(x - 1.0, 96.0, x + 1.0, 96.6, Y(0), Y(1.6), M['earth'], 'butt')
obox(98.5, 89, 117.5, 89, 0.12, Y(0), Y(0.9), M['fence'], 'shooting-line')
# walled gardens
for zid in ('kitchen-garden', 'privy-garden'):
    x0, z0, x1, z1 = Z[zid]['rect']
    cx_, cz_ = (x0 + x1) / 2, (z0 + z1) / 2
    for side in Z[zid]['walls']:
        g = next(g for g in Z[zid]['gates'] if g[2] == side)
        if side == 's':
            segs = ((x0, z1 - 0.25, g[0] - 1.2, z1 - 0.25), (g[0] + 1.2, z1 - 0.25, x1, z1 - 0.25))
        else:
            xx = x1 - 0.25 if side == 'e' else x0 + 0.25
            segs = ((xx, z0, xx, g[1] - 1.2), (xx, g[1] + 1.2, xx, z1))
        for seg in segs:
            obox(*seg, 0.5, Y(0), Y(Z[zid]['wall_top']), M['curtain'], 'garden-wall')
    flat(rp([cx_ - 1.2, z0 + 3, cx_ + 1.2, z1]), Y(0.05), M['pave'], 'garden-walk')
    flat(rp([x0 + 0.5, cz_ - 1.0, x1 - 0.5, cz_ + 1.0]), Y(0.05), M['pave'], 'garden-walk')
    if zid == 'kitchen-garden':
        for qx0, qx1 in ((x0 + 1.5, cx_ - 2.0), (cx_ + 2.0, x1 - 1.5)):
            for qz0, qz1 in ((z0 + 3.5, cz_ - 1.5), (cz_ + 1.5, z1 - 1.5)):
                box(qx0, qz0, qx1, qz1, Y(0), Y(0.6), M['box'], 'box')
                box(qx0 + 0.5, qz0 + 0.5, qx1 - 0.5, qz1 - 0.5, Y(0), Y(0.65), M['bed'], 'bed')
        cyl(cx_, cz_, 0.9, Y(0), Y(1.0), M['curtain'], 12, 'well')
    else:
        for qx0, qx1 in ((x0 + 1.5, cx_ - 2.0), (cx_ + 2.0, x1 - 1.5)):
            for qz0, qz1 in ((z0 + 3.5, cz_ - 1.5), (cz_ + 1.5, z1 - 1.5)):
                box(qx0, qz0, qx1, qz1, Y(0), Y(0.5), M['box'], 'box')
                box(qx0 + 0.6, qz0 + 0.6, qx1 - 0.6, qz1 - 0.6, Y(0), Y(0.7), M['flower'], 'flowers')
        cyl(cx_, cz_, 1.2, Y(0), Y(0.6), M['curtain'], 16, 'basin')
        cyl(cx_, cz_, 0.9, Y(0.6), Y(0.62), M['water'], 16, 'basin-water')
# parterre, fountain, trees, lamps
for r in Z['parterre']['panels']:
    x0, z0, x1, z1 = r
    for (ax, az, bx, bz) in ((x0, z0, x1, z0), (x1, z0, x1, z1), (x1, z1, x0, z1), (x0, z1, x0, z0)):
        obox(ax, az, bx, bz, 0.5, Y(0), Y(0.6), M['box'], 'box')
    for cx_, cz_ in ((x0 + 2.2, z0 + 1.5), (x1 - 2.2, z0 + 1.5), (x0 + 2.2, z1 - 1.5), (x1 - 2.2, z1 - 1.5)):
        cone(cx_, cz_, 0.6, Y(0), Y(2.2), M['box'], 10, 'topiary')
fp = Z['fountain-plaza']
fx, fz, fr = fp['centre'][0], fp['centre'][1], fp['r']
cyl(fx, fz, fr, Y(0.05), Y(0.08), M['pave'], 48, 'plaza')
fo = next(f for f in D['features'] if f['id'] == 'dragon-fountain')
cyl(fx, fz, fo['basin_r'], Y(0), Y(0.8), M['curtain'], 40, 'basin')
cyl(fx, fz, fo['basin_r'] - 0.5, Y(0.8), Y(0.82), M['water'], 40, 'basin-water')
cyl(fx, fz, 1.9, Y(0), Y(2.6), M['curtain'], 8, 'pedestal')
box(fx - 1.1, fz - 1.4, fx + 1.1, fz + 1.4, Y(2.6), Y(7.6), M['bronze'], 'dragon')
box(fx - 0.7, fz + 0.7, fx + 0.7, fz + 2.2, Y(7.0), Y(9.2), M['bronze'], 'dragon-head')
F = {f['id']: f for f in D['features']}
for x, z in F['yews']['pts']:
    cone(x, z, 0.8, Y(0), Y(3.4), M['box'], 10, 'yew')
for x, z in F['blossom-trees']['pts']:
    cyl(x, z, 0.18, Y(0), Y(2.0), M['fence'], 6, 'trunk')
    ball(x, z, 1.6, Y(3.2), M['blossom'], 'blossom')
for x, z in F['shade-trees']['pts']:
    cyl(x, z, 0.3, Y(0), Y(3.0), M['fence'], 6, 'trunk')
    ball(x, z, 3.0, Y(5.6), M['leaf'], 'shade-tree')
for x, z in F['lamps']['pts']:
    cyl(x, z, 0.1, Y(0), Y(3.2), M['deck'], 6, 'lamp')
ax_, az_ = F['rose-arbour']['x'], F['rose-arbour']['z']
box(ax_ - 1.0, az_ - 2.5, ax_ + 1.0, az_ + 2.5, Y(2.4), Y(2.8), M['leaf'], 'arbour')

# ── buildings ──────────────────────────────────────────────────────────────


def building(r, floor, top, m):
    x0, z0, x1, z1 = r
    box(x0, z0, x1, z1, Y(floor), Y(top - 1.0), m, 'walls')
    flat(rp([x0 + 0.5, z0 + 0.5, x1 - 0.5, z1 - 0.5]), Y(top - 1.0) + 0.04, M['lead'], 'roof')
    box(x0 - 0.05, z0 - 0.05, x1 + 0.05, z1 + 0.05, Y(top - 1.7), Y(top - 1.35), M['trim'], 'band')
    for (ax, az, bx, bz) in ((x0, z0 + 0.3, x1, z0 + 0.3), (x0, z1 - 0.3, x1, z1 - 0.3), (x0 + 0.3, z0, x0 + 0.3, z1), (x1 - 0.3, z0, x1 - 0.3, z1)):
        crenels(ax, az, bx, bz, 0.6, Y(top - 1.0), m)


def slate_building(b):
    """walls to the eaves, a steep slate roof along x between stone-coped gables, the gutter parapet on the north wall"""
    x0, z0, x1, z1 = b['rect']
    rf = b['roof']
    ev, rg, zr = rf['eaves'], rf['ridge'], rf['ridge_z']
    box(x0, z0, x1, z1, Y(b['floor']), Y(ev), M['cream'], 'walls')
    box(x0 - 0.05, z1 - 0.1, x1 + 0.05, z1 + 0.35, Y(ev - 0.7), Y(ev), M['trim'], 'cornice')
    sl = (rg - ev) / (zr - z0)
    ov = 0.5
    sec = [(z1 + ov, Y(ev - ov * sl)), (zr, Y(rg)), (z0 + 0.6, Y(ev + 0.6 * sl))]
    gx0, gx1 = x0 + 0.6, x1 - 0.6
    verts = [V(gx0, z, h) for z, h in sec] + [V(gx1, z, h) for z, h in sec]
    mesh_obj('slate-roof', verts, [(0, 3, 4, 1), (1, 4, 5, 2), (0, 2, 5, 3), (0, 1, 2), (3, 5, 4)], M['slate'])
    # the gables: wall triangles rising 0.35 above the slate, coped
    tri = [(z0, Y(ev)), (z1, Y(ev)), (zr, Y(rg + 0.35))]
    for gx in (x0, x1 - 0.6):
        verts = [V(gx, z, h) for z, h in tri] + [V(gx + 0.6, z, h) for z, h in tri]
        mesh_obj('gable', verts, [(0, 1, 2), (3, 5, 4), (0, 3, 4, 1), (1, 4, 5, 2), (2, 5, 3, 0)], M['cream'])
    # the north parapet over the walk, the gutter behind it
    box(x0, z0, x1, z0 + 0.6, Y(ev), Y(rf['north_parapet']), M['cream'], 'gutter-parapet')


IN = {b['id']: b for b in D['interiors']['buildings']}
for b in D['buildings']:
    rf = b.get('roof', {})
    if rf.get('kind') == 'slate':
        slate_building(b)
    else:
        building(b['rect'], b['floor'], b['parapet_top'], M['cream'])
    for (x, z, h) in b.get('chimneys', []):
        box(x - 0.6, z - 0.6, x + 0.6, z + 0.6, Y(b['floor']), Y(h), M['cream'], 'chimney')
    if 'lantern' in b:
        x, z, h = b['lantern']
        box(x - 1.3, z - 1.3, x + 1.3, z + 1.3, Y(rf['ridge'] - 1.5), Y(h - 2.0), M['cream'], 'lantern')
        cone(x, z, 1.9, Y(h - 2.0), Y(h), M['slate'], 4, 'lantern-cap')
    if 'fleche' in b:
        x, z, h = b['fleche']
        box(x - 0.7, z - 0.7, x + 0.7, z + 0.7, Y(rf['ridge'] - 1.0), Y(rf['ridge'] + 2.2), M['cream'], 'fleche')
        cone(x, z, 0.95, Y(rf['ridge'] + 2.2), Y(h), M['slate'], 8, 'fleche-spire')
    x0, z0, x1, z1 = b['rect']
    ib = IN.get(b['id'], {})
    for w in ib.get('windows', []):
        for xw in w['xs']:
            hw = 1.6 if w.get('round') else (1.2 if w.get('oriel') else (0.9 if w['h'] > 4 else 0.6))
            box(xw - hw, z1, xw + hw, z1 + (0.9 if w.get('oriel') else 0.08), Y(w['sill']), Y(w['sill'] + w['h']), M['glass'], 'window')
    for dd in ib.get('doors', []):
        if dd['side'] == 's' and 'at' in dd:
            box(dd['at'][0] - dd['w'] / 2, z1, dd['at'][0] + dd['w'] / 2, z1 + 0.1, Y(dd['level']), Y(dd['level'] + dd.get('h', 4.0)), M['navy'], 'door')
    if b['role'] in ('hall', 'chapel'):
        xs = sorted(x for w in ib['windows'] if not w.get('round') for x in w['xs'])
        for xa, xb in zip(xs, xs[1:]):
            if xb - xa > 2.5 and not any(xa < dd['at'][0] < xb and abs(dd['at'][0] - (xa + xb) / 2) < 1.5 for dd in ib['doors'] if 'at' in dd):
                box((xa + xb) / 2 - 0.4, z1, (xa + xb) / 2 + 0.4, z1 + 0.6, Y(b['floor']), Y(rf.get('eaves', b['parapet_top']) - 1.2), M['cream'], 'buttress')

# ── the keep ───────────────────────────────────────────────────────────────
K = D['keep']
building(K['rect'], K['floor'], K['parapet_top'], M['keep'])
# the back half stands in the moat: a battered plinth from the bed, the walls on it up to the terrace's level
kx0, kz0, kx1, _ = K['rect']
box(kx0 - 0.4, kz0 - 0.4, kx1 + 0.4, cf['north_z'] + 0.6, Y(Wt['moat']['bed']), Y(-0.6), M['trim'], 'keep-plinth')
box(kx0, kz0, kx1, cf['north_z'] + 1.0, Y(-0.6), Y(K['floor']), M['keep'], 'keep-footing')
for t in K['turrets']:
    top = t['parapet_top'] - 1.0
    back = t['z'] < cf['north_z']
    if back:
        cyl(t['x'], t['z'], t['r'] + 0.4, Y(Wt['moat']['bed']), Y(-0.6), M['trim'], 32, 'plinth')
    cyl(t['x'], t['z'], t['r'], Y(-0.6 if back else 0), Y(top - 1.8), M['keep'], 32, 'turret')
    cyl(t['x'], t['z'], t['r'] + 0.15, Y(top - 1.8), Y(top - 1.4), M['trim'], 32, 'corbels')
    cyl(t['x'], t['z'], t['r'] + 0.5, Y(top - 1.4), Y(top), M['keep'], 32, 'crown')
    ring_merlons(t['x'], t['z'], t['r'] + 0.5, Y(top), M['keep'], 14)
    cone(t['x'], t['z'], t['r'] + 0.2, Y(top + 0.1), Y(t['spire_tip']), M['navy'], 32, 'spire')
    cyl(t['x'], t['z'], 0.25, Y(t['spire_tip'] - 0.4), Y(t['spire_tip'] + 1.2), M['gold'], 8, 'finial')
fs = K['frontispiece']
x0, z0, x1, z1 = fs['rect']
building([x0, z0 - 1.0, x1, z1], K['floor'], fs['top'], M['keep'])
for pn in fs['pinnacles']:
    cyl(pn['x'], pn['z'], pn['r'], Y(0), Y(pn['top']), M['keep'], 8, 'pinnacle')
    cone(pn['x'], pn['z'], pn['r'] + 0.1, Y(pn['top']), Y(pn['spire_tip']), M['navy'], 8, 'pinnacle-spire')
gd = K['great_door']
box(gd['x'] - gd['w'] / 2, z1 - 0.05, gd['x'] + gd['w'] / 2, z1 + 0.06, Y(K['floor']), Y(K['floor'] + gd['h']), M['navy'], 'great-door')
show = next(w for w in K['windows_south'] if w['where'] == 'frontispiece')
box(76 - show['w'] / 2, z1 - 0.05, 76 + show['w'] / 2, z1 + 0.06, Y(show['sill']), Y(show['sill'] + show['h']), M['glass'], 'showpiece')
box(75.0, z1 - 0.05, 77.0, z1 + 0.07, Y(show['sill'] + show['h'] + 1.2), Y(show['sill'] + show['h'] + 3.4), M['gold'], 'crest')
for bn in K['banners']:
    box(bn['x'] - 0.9, z1 - 1.4, bn['x'] + 0.9, z1 - 1.3, Y(bn['bottom']), Y(bn['top']), M['flag'], 'banner')
kz1 = K['rect'][3]
for x in (67.4, 69.6, 82.4, 84.6):
    box(x - 0.7, kz1, x + 0.7, kz1 + 0.08, Y(9.5), Y(13.9), M['glass'], 'lancet')
for x in (68.5, 83.5):
    box(x - 1.1, kz1, x + 1.1, kz1 + 0.08, Y(15.5), Y(18.3), M['glass'], 'pair')
    box(x - 0.5, kz1, x + 0.5, kz1 + 0.08, Y(21.0), Y(22.4), M['glass'], 'light')
    box(x - 0.45, kz1, x + 0.45, kz1 + 0.08, Y(5.5), Y(7.9), M['glass'], 'low-lancet')
gf = K['great_flag']
cyl(gf['x'], gf['z'], 0.15, Y(K['parapet_top'] - 1.0), Y(gf['pole_top']), M['deck'], 8, 'pole')
fw, fh = gf['flag']
box(gf['x'], gf['z'] - 0.05, gf['x'] + fw, gf['z'] + 0.05, Y(gf['pole_top'] - fh), Y(gf['pole_top'] - 0.2), M['flag'], 'great-flag')

# ── curtain, towers, gatehouse ─────────────────────────────────────────────
for run in D['curtain']['runs']:
    (ax, az), (bx, bz) = run['a'], run['b']
    obox(ax, az, bx, bz, 2.2, Y(Wt['moat']['surface'] - 0.1), Y(7.0), M['curtain'], 'curtain')
    obox(ax, az, bx, bz, 2.3, Y(5.5), Y(5.8), M['trim'], 'string')
    L = math.hypot(bx - ax, bz - az)
    nx, nz = -(bz - az) / L * 0.8, (bx - ax) / L * 0.8
    for sgn in (1, -1):
        crenels(ax + nx * sgn, az + nz * sgn, bx + nx * sgn, bz + nz * sgn, 0.6, Y(7.0), M['curtain'])
for t in D['towers']:
    top = t['parapet_top'] - 1.0
    cyl(t['x'], t['z'], t['r'] + 0.4, Y(Wt['moat']['bed']), Y(-0.6), M['trim'], 28, 'plinth')
    cyl(t['x'], t['z'], t['r'], Y(-0.6), Y(top - 1.6), M['curtain'], 28, 'tower')
    cyl(t['x'], t['z'], t['r'] + 0.12, Y(top - 1.6), Y(top - 1.25), M['trim'], 28, 'corbels')
    cyl(t['x'], t['z'], t['r'] + 0.45, Y(top - 1.25), Y(top), M['curtain'], 28, 'crown')
    ring_merlons(t['x'], t['z'], t['r'] + 0.45, Y(top), M['curtain'], 12)
    if t['kind'] == 'corner':
        cone(t['x'], t['z'], t['r'] + 0.2, Y(top + 0.2), Y(t['spire_tip']), M['navy'], 28, 'spire')
        cyl(t['x'], t['z'], 0.2, Y(t['spire_tip'] - 0.3), Y(t['spire_tip'] + 0.9), M['gold'], 8, 'finial')
G = D['gatehouse']
box(G['x'] - 6, G['z'] - 1.9, G['x'] + 6, G['z'] + 1.9, Y(-0.6), Y(G['block_top'] - 1.0), M['curtain'], 'gate-block')
crenels(G['x'] - 6, G['z'] + 1.6, G['x'] + 6, G['z'] + 1.6, 0.6, Y(G['block_top'] - 1.0), M['curtain'])
box(G['x'] - 2.0, G['z'] + 1.88, G['x'] + 2.0, G['z'] + 1.98, Y(0), Y(5.0), M['navy'], 'gate-arch')
for dr in G['drums']:
    cyl(dr['x'], dr['z'], dr['r'] + 0.4, Y(Wt['moat']['bed']), Y(-0.6), M['trim'], 24, 'plinth')
    cyl(dr['x'], dr['z'], dr['r'], Y(-0.6), Y(G['drum_parapet'] - 1.0), M['curtain'], 24, 'drum')
    ring_merlons(dr['x'], dr['z'], dr['r'], Y(G['drum_parapet'] - 1.0), M['curtain'], 10)
    cyl(dr['x'], dr['z'] + 0.6, 0.08, Y(G['drum_parapet'] - 1.0), Y(G['drum_flag_top']), M['deck'], 6, 'pole')
    box(dr['x'], dr['z'] + 0.55, dr['x'] + 2.3 * (1 if dr['x'] > G['x'] else -1), dr['z'] + 0.65, Y(G['drum_flag_top'] - 1.4), Y(G['drum_flag_top']), M['flag'], 'flag')

# stairs (each step from the upper level down to the ground) and the champions
for s in D['stairs']:
    x0, z0, x1, z1 = s['rect']
    n = s['risers']
    dz, dh = (z1 - z0) / n, (s['to'] - s['from']) / n
    for k in range(n):
        box(x0, z0 + k * dz, x1, z0 + (k + 1) * dz, Y(0), Y(s['to'] - k * dh), M['pave'], 'step')
    if s['id'] == 'grand-stair':
        for xx in (x0 - 0.5, x1 + 0.5):
            box(xx - 0.5, z0, xx + 0.5, z1, Y(0), Y(2.6), M['curtain'], 'cheek')
for side in ('west', 'east'):
    f = F[f'champion-{side}']
    box(f['x'] - 0.8, f['z'] - 0.8, f['x'] + 0.8, f['z'] + 0.8, Y(0), Y(2.2), M['curtain'], 'plinth')
    box(f['x'] - 0.45, f['z'] - 0.3, f['x'] + 0.45, f['z'] + 0.3, Y(2.2), Y(f['top']), M['cream'], 'champion')
# the terrace's balustrade
T = D['terrace']
for (xa, za), (xb, zb) in zip(T['edge'], T['edge'][1:]):
    segs = [(xa, za, xb, zb)]
    if za == zb:
        x, segs = min(xa, xb), []
        for o in sorted(o for o in T['stair_openings'] if min(xa, xb) <= o[0] and o[1] <= max(xa, xb)):
            segs.append((x, za, o[0], za))
            x = o[1]
        segs.append((x, za, max(xa, xb), za))
    for (ax, az, bx, bz) in segs:
        obox(ax, az + (0.2 if za == zb else 0), bx, bz + (0.2 if za == zb else 0), 0.4, Y(T['level']), Y(T['edge_top']), M['curtain'], 'balustrade')

# ── light and cameras ──────────────────────────────────────────────────────
sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
sun.data.energy, sun.data.color, sun.data.angle = 4.2, (1.0, 0.86, 0.72), math.radians(2.5)
sc.collection.objects.link(sun)
d = (14, -10, 28)   # game.ts: the sun sits at (+14, +28, +10) from the hero (three.js axes)
L = math.sqrt(sum(c * c for c in d))
sun.rotation_euler = (math.acos(d[2] / L), 0, math.atan2(d[1], d[0]) + math.pi / 2)
fill = bpy.data.objects.new('fill', bpy.data.lights.new('fill', 'SUN'))
fill.data.energy, fill.data.color, fill.data.use_shadow = 0.9, (0.78, 0.74, 0.95), False
sc.collection.objects.link(fill)
fill.rotation_euler = (math.radians(60), 0, math.radians(-120))
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
cam.data.sensor_fit, cam.data.angle_y, cam.data.clip_start, cam.data.clip_end = 'VERTICAL', math.radians(42), 0.5, 900
sc.collection.objects.link(cam)
sc.camera = cam
target = bpy.data.objects.new('target', None)
sc.collection.objects.link(target)
track = cam.constraints.new('TRACK_TO')
track.target, track.track_axis, track.up_axis = target, 'TRACK_NEGATIVE_Z', 'UP_Y'
hero = cyl(0, 0, 0.35, 0, 2.0, M['hero'], 12, 'hero')


def shoot(name, eye, look, w=1600, h=900):
    sc.render.resolution_x, sc.render.resolution_y = w, h
    cam.location, target.location = V(*eye), V(*look)
    sc.render.filepath = os.path.join(OUT, name)
    bpy.ops.render.render(write_still=True)
    print('rendered', sc.render.filepath)


def play(name, x, z, h, zoom):
    hero.location = V(x, z, Y(h))
    shoot(name, (x, z + 14 * zoom, Y(h) + 21 * zoom), (x, z, Y(h) + 1), 1200, 675)


if 'overview' in ONLY:
    c = (75.5, 61.25)   # today's curtain centre, so the framing matches v5-overview.jpg
    hero.location = V(76, 82, Y(0))
    shoot('castle-v4-massing.png', (c[0] + 70, c[1] + 92, Y(92)), (c[0] - 2, c[1] + 4, Y(0)))
if 'camera' in ONLY:
    play('camera-avenue.png', 76, 60, 0.0, 1.35)
    play('camera-door.png', 76, 46, 2.0, 1.0)
    play('camera-bridge.png', 76, 106, 0.0, 1.0)
    play('camera-yards.png', 56, 72, 0.0, 1.2)
if 'lookout' in ONLY:
    play('camera-lookout.png', *D['camera']['views_rendered']['lookout'])
if 'north' in ONLY:
    hero.location = V(76, 82, Y(0))
    shoot('view-north.png', (18, -34, Y(36)), (74, 24, Y(8)), 1200, 675)
if 'climb' in ONLY:
    for name, key in (('camera-stair-foot.png', 'stair_foot'), ('camera-stair-head.png', 'stair_head')):
        play(name, *D['camera']['views_rendered'][key])
if 'extra' in ONLY:
    shoot('check-south.png', (80, 152, 3), (80, 109, 9))
    shoot('check-landing.png', (150, 134, Y(10)), (122, 108, Y(0)), 1200, 675)
    shoot('check-north.png', (40, -40, Y(30)), (76, 30, Y(10)), 1200, 675)
    shoot('check-west.png', (-30, 60, Y(10)), (40, 62, Y(4)), 1200, 675)
    play('check-hall.png', 62, 28, 2.0, 1.0)
