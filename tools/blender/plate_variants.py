"""Plate armour sets: P (plate: bronze, iron and steel share it, only the palette changes) and E (Emberforged:
the same plate silhouette forged from dragon parts).

Each set is a full kit with the same socket contract as gear.py (body_plate on sock_chest + sock_shoulderL/R,
helm_full on sock_head, gloves on sock_handL + sock_gloveR, boots on sock_footL/R) and only role materials,
so the tier palette recolours it. The game loads public/models/gear_<piece>_<set>.glb (items.ts PLATE_STYLE).

    exec(open(os.path.join(os.environ['DRAGONBOUND_ROOT'], 'tools', 'blender', 'plate_variants.py')).read())
    build_variant('p'); report = audit_variant('p'); render_variant('p'); export_variant('p')

Pose checks are numeric, not eyeballed: `audit_variant` dresses the hero the way the game does
(including anim.ts followShoulders: the shoulder socket orbits the arm pivot by 75% of the arm's
rotation), then for every pose in POSES (idle, walk, windup, slam, cast) reports:
  hero_pokes      hero surface points sitting outside a plate that is right behind them, not buried in
                  another mesh and not covered by anything else = visibly poking through the armour
  pauldron_cuts   pauldron surfaces intersecting cuirass/helm surfaces (resting on them is fine)
  pauldron_geo    pauldron extents in torso space and its gap to the cuirass (> 0.02 reads as floating)
  pauldron_cap    the `cap` metric of dev/poseCheck.ts __shoulderReport
  floating        armour pieces touching nothing (idle only)
  handR_blade_dir world direction of sock_handR +Y (a held sword's blade), three.js coords
"""
import math
import os
import re
import sys

# Repo root: DRAGONBOUND_ROOT, else two levels above this script (when run as a file), else the old fixed path.
_ROOT = os.environ.get('DRAGONBOUND_ROOT') or (os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
                                               if '__file__' in globals() else r'D:\gameplanning')
sys.path.insert(0, os.path.join(_ROOT, 'tools', 'blender'))
import importlib
import _common
importlib.reload(_common)
from _common import *
from mathutils import Euler, Quaternion, Vector
from mathutils.bvhtree import BVHTree

_p = os.path.join(_ROOT, 'tools', 'blender', 'gear.py')
_g = {'DB_RUN': False, '__name__': 'db_gear', '__file__': _p}
exec(open(_p, encoding='utf-8').read(), _g)
SOCKET_POS = _g['SOCKET_POS']
body_plate, helm_full, plate_torso, block_pauldron = _g['body_plate'], _g['helm_full'], _g['plate_torso'], _g['block_pauldron']
plate_gauntlet, plate_sabaton, faces, scale_plate = _g['plate_gauntlet'], _g['plate_sabaton'], _g['faces'], _g['scale_plate']
PAULDRON_STEPS = _g['PAULDRON_STEPS']
_p = os.path.join(_ROOT, 'tools', 'blender', 'fitcheck.py')
_f = {'__name__': 'db_fit', '__file__': _p}
exec(open(_p, encoding='utf-8').read(), _f)
build_hero, dress = _f['build_hero'], _f['dress']

PI = math.pi
PIECES = ('body_plate', 'helm_full', 'gloves', 'boots')
SHOULDER_FOLLOW = 0.75          # src/render/anim.ts
# Tier palettes for the Blender renders (src/data/items.ts TIERS).
STEEL = {'metal': 0x9AA4B0, 'trim': 0xD4DCE6, 'dark': 0x3E444C, 'leather': 0x3E444C, 'glow': 0xD4DCE6}
EMBER = {'metal': 0x3A3336, 'trim': 0xFF7A1A, 'dark': 0x171112, 'leather': 0x171112, 'glow': 0xFF7A1A}
PALETTES = {'p': STEEL, 'e': EMBER}

VARIANTS = {}

_strip = lambda n: re.sub(r'\.\d{3}$', '', n)


def build_piece(vid, piece):
    scene, root = fresh_scene(f'DB_pv_{vid}_{piece}')
    socks = {}

    def S(name):
        if name not in socks:
            socks[name] = pivot(root, name, SOCKET_POS[name])
        return socks[name]
    VARIANTS[vid][piece](S)
    for o in scene.objects:
        if o.type == 'MESH':
            o['pv'] = piece
            sk = o.parent
            while sk and not _strip(sk.name).startswith('sock_'):
                sk = sk.parent
            o['pv_sock'] = _strip(sk.name) if sk else ''
    return scene


def build_variant(vid):
    return {piece: tri_count(build_piece(vid, piece)) for piece in PIECES}


def export_variant(vid):
    """Write public/models/gear_<piece>_<vid>.glb, the files the game loads for this set."""
    return [export(f'DB_pv_{vid}_{piece}', f'gear_{piece}_{vid}.glb') for piece in PIECES]


# ─── Dressing + posing exactly like the game ─────────────────────────────────

def part(scene, name):
    return next(o for o in scene.objects if _strip(o.name) == name)


SOCK_REST = {'sock_shoulderL': (0.46, 0.72, 0), 'sock_shoulderR': (-0.46, 0.72, 0)}   # hero.py, body space
ARM_REST = {'armL': (0.47, 0.62, 0), 'armR': (-0.47, 0.62, 0)}

# anim.ts rot() offsets. idle/walk: humanoid block; windup = swing a=0.4; slam a=0.5; cast a=0.5.
POSES = {
    'idle': {'armL': (0, 0, -0.08), 'armR': (0, 0, 0.08)},
    'walk': {'armL': (-0.5, 0, -0.08), 'armR': (0.5, 0, 0.08), 'legL': (0.7, 0, 0), 'legR': (-0.7, 0, 0)},
    'windup': {'armL': (0, 0, -0.08), 'armR': (-3.2, 0, 0.1)},
    'slam': {'armL': (-3.0, 0, 0), 'armR': (-3.0, 0, 0)},
    'cast': {'armL': (-1.8, 0, 0), 'armR': (-2.2, 0, 0)},
}


def apply_pose(scene, pose):
    """Add pose offsets to the rest rotations, then anim.ts followShoulders(): each shoulder socket
    orbits its arm pivot and turns by SHOULDER_FOLLOW of the arm's rotation (slerp from identity)."""
    for name, r in (pose or {}).items():
        o = part(scene, name)
        o.rotation_euler = tuple(a + b for a, b in zip(o.rotation_euler, r))
    for side in ('L', 'R'):
        arm, sock = part(scene, f'arm{side}'), part(scene, f'sock_shoulder{side}')
        delta = Euler(arm.rotation_euler, 'ZYX').to_quaternion()      # hero arms rest at identity
        turn = Quaternion().slerp(delta, SHOULDER_FOLLOW)
        sock_rest, arm_rest = Vector(SOCK_REST[f'sock_shoulder{side}']), Vector(ARM_REST[f'arm{side}'])
        sock.location = arm_rest + turn @ (sock_rest - arm_rest)
        sock.rotation_mode = 'QUATERNION'
        sock.rotation_quaternion = turn
    bpy.context.view_layer.update()


def dress_variant(vid, pose='idle', extra=(), scene_name='DB_pv_fit'):
    scene, root = build_hero(scene_name)
    missing = dress(scene, [f'DB_pv_{vid}_{p}' for p in PIECES] + list(extra))
    apply_pose(scene, POSES[pose] if isinstance(pose, str) else pose)
    return scene, missing


# ─── Numeric audit ───────────────────────────────────────────────────────────

def _bvh(objs):
    verts, polys, owner = [], [], []
    for o in objs:
        mw = o.matrix_world
        base = len(verts)
        verts += [mw @ v.co for v in o.data.vertices]
        for p in o.data.polygons:
            polys.append([base + i for i in p.vertices])
            owner.append(o)
    return BVHTree.FromPolygons(verts, polys), owner


def _hero_label(o):
    a = o
    while a and _strip(a.name) not in ('head', 'armL', 'armR', 'legL', 'legR', 'body'):
        a = a.parent
    m = o.data.materials[0].name if o.data.materials else '?'
    m = {'db_d9a640_000000_2.0_0': 'buckle', 'db_3a2618_000000_2.0_0': 'sole'}.get(m, m.replace('ROLE_', ''))
    return f'{_strip(a.name) if a else "?"}:{m}'


def _arm_label(o):
    return f'{o["pv_sock"].replace("sock_", "")}:{_strip(o.name)}'


def _samples(o):
    """Points spread over every face (3x3 grid on quads, corners/centre on tris), with world normals."""
    mw = o.matrix_world
    r3 = mw.to_3x3().normalized()
    me = o.data
    out = []
    for p in me.polygons:
        n = (r3 @ p.normal).normalized()
        vs = [mw @ me.vertices[i].co for i in p.vertices]
        if len(vs) == 4:
            for a in (0.08, 0.5, 0.92):
                for b in (0.08, 0.5, 0.92):
                    out.append((vs[0].lerp(vs[1], a).lerp(vs[3].lerp(vs[2], a), b), n))
        else:
            c_ = sum(vs, Vector()) / len(vs)
            out.append((c_, n))
            out += [(v.lerp(c_, 0.1), n) for v in vs]
    return out


def pokes(samplers, tree, owner, label, occ=None, depth=0.1, clear=0.2):
    """Surface points of `samplers` that sit in FRONT of an armour plate from `tree` (the plate is just
    behind them and faces them) while nothing else covers them (`occ`: every mesh, the sample's own
    object excluded), i.e. something visibly poking out through the plate. Returns
    {'<what> > <plate>': (samples, max depth, example point in three.js world coords)}."""
    occ_t, occ_own = occ if occ else (tree, owner)
    res = {}
    for o in samplers:
        for P, n in _samples(o):
            loc, nor, idx, dist = tree.ray_cast(P + n * 0.002, -n, depth)
            if loc is None or nor.dot(-n) >= 0 or owner[idx] is o:
                continue
            q, hidden = P + n * 0.002, False
            # buried inside another mesh (nearest foreign surface faces away from the point)?
            near = [(d_, l_, n_) for (l_, n_, i_, d_) in occ_t.find_nearest_range(P, 0.25) if occ_own[i_] is not o]
            if near:
                d_, l_, n_ = min(near, key=lambda r: r[0])
                if (P - l_).dot(n_) < -1e-4:
                    continue
            for _ in range(4):          # step past hits on the sample's own mesh
                loc2, nor2, idx2, d2 = occ_t.ray_cast(q, n, clear)
                if loc2 is None:
                    break
                if occ_own[idx2] is not o:
                    hidden = True
                    break
                q = loc2 + n * 0.001
            if hidden:
                continue
            k = f'{label(o)} > {_arm_label(owner[idx])}'
            cnt, mx, ex = res.get(k, (0, 0.0, None))
            res[k] = (cnt + 1, round(max(mx, dist), 3), ex if ex and mx >= dist else to_three(P))
    return res


def floating(armour, everything, near=0.015):
    tree, owner = _bvh(everything)
    trees = {o.name: _bvh([o])[0] for o in everything}
    out = []
    for o in armour:
        mw = o.matrix_world
        if any(trees[o.name].overlap(trees[x.name]) for x in everything if x is not o):
            continue
        if not any(owner[i] is not o for v in o.data.vertices for (_, _, i, _) in tree.find_nearest_range(mw @ v.co, near)):
            out.append(_arm_label(o))
    return out


def to_three(v):
    return (round(v.x, 2), round(v.z, 2), round(-v.y, 2))


def audit_scene(scene, check_float=True):
    bpy.context.view_layer.update()
    meshes = [o for o in scene.objects if o.type == 'MESH']
    armour = [o for o in meshes if 'pv' in o]
    hero = [o for o in meshes if 'pv' not in o]
    at, aown = _bvh(armour)
    occ = _bvh(meshes)
    rep = {'hero_pokes': pokes(hero, at, aown, _hero_label, occ)}
    # armour through armour across sockets (pauldron vs cuirass/helm) -- both directions
    sh = [o for o in armour if o['pv_sock'].startswith('sock_shoulder')]
    rest = [o for o in armour if not o['pv_sock'].startswith('sock_shoulder')]
    t1, o1 = _bvh(rest)
    t2, o2 = _bvh(sh)
    # pauldron surfaces cutting through cuirass / helm surfaces (resting on them is fine)
    cuts = {}
    for o in sh:
        ob, _ = _bvh([o])
        for _, j in ob.overlap(t1):
            if o1[j]['pv_sock'] in ('sock_chest', 'sock_head'):
                k = f'{_arm_label(o)} x {_arm_label(o1[j])}'
                cuts[k] = cuts.get(k, 0) + 1
    rep['pauldron_cuts'] = cuts
    if check_float:
        rep['floating'] = floating(armour, meshes)
    capm = {}
    for side in ('L', 'R'):
        arm = part(scene, f'arm{side}')
        joint = arm.matrix_world.translation
        down = (arm.matrix_world.to_3x3() @ Vector((0, -1, 0))).normalized()
        ps = [o for o in sh if o['pv_sock'] == f'sock_shoulder{side}']
        pts = [o.matrix_world @ Vector(cc) for o in ps for cc in o.bound_box]
        mid = sum(pts, Vector()) / len(pts)
        to = mid - joint
        capm[side] = {'cap': round(to.normalized().dot(down), 2), 'dist': round(to.length, 2)}
    rep['pauldron_cap'] = capm
    # pauldron placement in the torso's frame (three.js, sock_chest-relative): extents + gap to the chest
    # plate (> 0.02 reads as floating) + how far it reaches in toward the neck
    chest = [o for o in armour if o['pv_sock'] == 'sock_chest']
    ct, cown = _bvh(chest)
    cs = part(scene, 'sock_chest').matrix_world
    inv = cs.inverted()
    geo = {}
    for side in ('L', 'R'):
        ps = [o for o in sh if o['pv_sock'] == f'sock_shoulder{side}']
        vs = [o.matrix_world @ v.co for o in ps for v in o.data.vertices]
        gap = min(ct.find_nearest(v)[3] for v in vs)
        loc = [inv @ v for v in vs]   # sock_chest local == three.js torso coords
        xs, ys, zs = [p.x for p in loc], [p.y for p in loc], [p.z for p in loc]
        geo[side] = {'gap': round(gap, 3), 'x': (round(min(xs), 2), round(max(xs), 2)), 'y': (round(min(ys), 2), round(max(ys), 2)),
                     'z': (round(min(zs), 2), round(max(zs), 2))}
    rep['pauldron_geo'] = geo
    hr = part(scene, 'sock_handR')
    rep['handR_blade_dir'] = to_three((hr.matrix_world.to_3x3() @ Vector((0, 1, 0))).normalized())
    return rep


def audit_variant(vid, poses=('idle', 'walk', 'windup', 'slam', 'cast')):
    out = {}
    for p in poses:
        scene, missing = dress_variant(vid, p)
        out[p] = audit_scene(scene, check_float=(p == 'idle'))
        if missing:
            out[p]['missing'] = missing
    return out


def tri_report(vid, top=10):
    rows = {}
    for piece in PIECES:
        sc = bpy.data.scenes[f'DB_pv_{vid}_{piece}']
        rows[piece] = sorted(((_strip(o.name), sum(len(p.vertices) - 2 for p in o.data.polygons)) for o in sc.objects if o.type == 'MESH'), key=lambda r: -r[1])[:top]
    return rows


# ─── Rendering ───────────────────────────────────────────────────────────────

def set_palette(pal):
    for k, v in pal.items():
        role(k).node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = hex_rgba(v)


def restore_palette():
    set_palette({k: ROLE_COLORS[k] for k in ('metal', 'trim', 'dark', 'leather', 'glow')})


def _light_rig(scene):
    for n, (rx, rz, e) in {'pv_key': (50, 35, 2.4), 'pv_fill': (60, 200, 0.7), 'pv_rim': (15, 150, 1.1)}.items():
        d = bpy.data.lights.get(n) or bpy.data.lights.new(n, 'SUN')
        d.energy = e
        o = scene.objects.get(n)
        if not o:
            o = bpy.data.objects.new(n, d)
            scene.collection.objects.link(o)
        o.rotation_euler = (math.radians(rx), 0, math.radians(rz))
    if not scene.world:
        scene.world = bpy.data.worlds.new('pv_world')
    scene.world.use_nodes = True
    bg = scene.world.node_tree.nodes.get('Background')
    bg.inputs['Color'].default_value = (0.11, 0.1, 0.1, 1)
    bg.inputs['Strength'].default_value = 0.55
    scene.render.engine = 'BLENDER_EEVEE'
    scene.view_settings.view_transform = 'Standard'
    scene.render.film_transparent = False


def shot(path, target=(0, 1.1, 0), dist=4.4, yaw=0, pitch=12, res=384, fov=None, resx=None, ortho=None):
    """yaw 0 = camera in front of the hero (+Z), 90 = on the hero's left (+X), 180 = behind."""
    scene = bpy.context.scene
    _light_rig(scene)
    tx, ty, tz = target
    tgt = Vector((tx, -tz, ty))
    yr, pr = math.radians(yaw), math.radians(pitch)
    off = Vector((math.sin(yr) * math.cos(pr), -math.cos(yr) * math.cos(pr), math.sin(pr))) * dist
    cd = bpy.data.cameras.get('pv_cam') or bpy.data.cameras.new('pv_cam')
    cam = scene.objects.get('pv_cam')
    if not cam:
        cam = bpy.data.objects.new('pv_cam', cd)
        scene.collection.objects.link(cam)
    cam.location = tgt + off
    cam.rotation_mode = 'QUATERNION'
    cam.rotation_quaternion = (tgt - cam.location).to_track_quat('-Z', 'Y')
    cd.type = 'ORTHO' if ortho else 'PERSP'
    if ortho:
        cd.ortho_scale = ortho
    elif fov:
        cd.sensor_fit = 'VERTICAL'
        cd.angle = math.radians(fov)
    else:
        cd.sensor_fit = 'AUTO'
        cd.lens = 50
    scene.camera = cam
    scene.render.resolution_x = resx or res
    scene.render.resolution_y = res
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    return path


def _load_px(p):
    import numpy as np
    img = bpy.data.images.load(p, check_existing=False)
    px = np.array(img.pixels[:], dtype=np.float32).reshape(img.size[1], img.size[0], 4)
    bpy.data.images.remove(img)
    return px


def _save_px(px, file_name):
    out = bpy.data.images.new('pv_sheet', px.shape[1], px.shape[0], alpha=True)
    out.pixels = px.ravel()
    path = os.path.join(PREVIEW_DIR, file_name)
    out.filepath_raw = path
    out.file_format = 'PNG'
    out.save()
    bpy.data.images.remove(out)
    return path


def sheet(file_name, views, **kw):
    import numpy as np
    tiles = []
    for i, v in enumerate(views):
        p = shot(os.path.join(PREVIEW_DIR, f'_pv_tile{i}.png'), **{**kw, **v})
        tiles.append(_load_px(p))
        os.remove(p)
    return _save_px(np.concatenate(tiles, axis=1), file_name)


def _cleanup(scene):
    for n in ('pv_cam', 'pv_key', 'pv_fill', 'pv_rim'):
        o = scene.objects.get(n)
        if o:
            bpy.data.objects.remove(o, do_unlink=True)


GAME_PITCH = math.degrees(math.atan2(21, 14))   # game.ts camera offset (0, 21z, 14z) -> ~56 deg, fov 42


def render_variant(vid, which=('sheet', 'gamecam', 'armup')):
    set_palette(PALETTES[vid])
    out = {}
    if 'sheet' in which or 'gamecam' in which:
        scene, _ = dress_variant(vid, 'idle')
        if 'sheet' in which:
            out['sheet'] = sheet(f'plate_{vid}_sheet.png', [dict(yaw=0, pitch=8), dict(yaw=40, pitch=16), dict(yaw=180, pitch=10),
                                                             dict(yaw=180, pitch=GAME_PITCH, fov=42, dist=4.3)],
                                 target=(0, 1.05, 0), dist=4.6, res=440)
        if 'gamecam' in which:
            out['gamecam'] = sheet(f'plate_{vid}_gamecam.png', [dict(yaw=180), dict(yaw=35), dict(yaw=-100)], target=(0, 1.0, 0),
                                   dist=5.0, pitch=GAME_PITCH, fov=42, res=440)
        _cleanup(scene)
    if 'armup' in which:
        scene, _ = dress_variant(vid, 'windup', ['DB_gear_longsword'])
        out['armup'] = sheet(f'plate_{vid}_armup.png', [dict(yaw=0, pitch=8), dict(yaw=-90, pitch=8), dict(yaw=-35, pitch=25),
                                                        dict(yaw=180, pitch=GAME_PITCH, fov=42, dist=6.2)], target=(0, 1.35, 0), dist=5.4, res=440)
        _cleanup(scene)
    restore_palette()
    return out


def closeup(vid, file_name, pose='idle', views=(dict(yaw=0, pitch=8), dict(yaw=40, pitch=20)), target=(0, 1.55, 0), dist=2.6, res=480):
    """Debug close-ups (not part of the deliverables)."""
    set_palette(PALETTES[vid])
    scene, _ = dress_variant(vid, pose)
    p = sheet(file_name, list(views), target=target, dist=dist, res=res)
    _cleanup(scene)
    restore_palette()
    return p


# ═══ P: plate (bronze, iron, steel) ══════════════════════════════════════════
# OSRS-style plate in modular blocks (gear.py plate kit): a broad chest block with a raised breastplate,
# stepped lames, belt and box tassets; pauldrons of blocks stepping down the shoulder; a cube-over-cube full
# helm whose eye slit is the gap between brow band and face plates; box gauntlets and sabatons. Trim is a
# lighter tint of the same metal (tier palette).

def P_gloves(S):
    for name, s in (('sock_handL', 1), ('sock_gloveR', -1)):
        plate_gauntlet(S(name), s)


def P_boots(S):
    for name in ('sock_footL', 'sock_footR'):
        plate_sabaton(S(name))


VARIANTS['p'] = {'name': 'Plate', 'body_plate': body_plate, 'helm_full': helm_full, 'gloves': P_gloves, 'boots': P_boots}


# ═══ E: Emberforged ══════════════════════════════════════════════════════════
# The same block plate forged from dragon parts: obsidian slabs split by glowing ember seams, staggered rows of
# small pointed scales over the breast either side of a scute column, a dragon-heart gem in a claw setting,
# pauldrons of stacked blocks tipped with wedge claws, and a blocky dragon-skull helm (long box snout, brow
# ridge over angled glowing eye slits, segmented horns swept back and low).
SLIT_E = 0x0C0A0A


def E_body(S):
    c = S('sock_chest')
    plate_torso(c, seam=R.glow, trim=R.dark, centre=False)
    box(c, (0.57, 0.02, 0.51), (0, 0.32, 0), R.glow, bevel=0)                                  # gorget seam
    box(c, (0.6, 0.26, 0.012), (0, 0.12, 0.292), R.dark, bevel=0)                               # dark bed under the scales
    fr = faces(c, 0.41, 0.29, sides=False)[0][0]
    for j, y in enumerate((0.25, 0.175, 0.1, 0.025)):
        for i in range(4):
            x = 0.115 + 0.074 * i + 0.037 * (j % 2)
            if x < 0.37:
                for s in (-1, 1):
                    scale_plate(fr, s * x, y, R.metal, w=0.076, hgt=0.1, tilt=-0.4)
    for y in (0.03, -0.1, -0.21):                                                                # scute column
        box(c, (0.12, 0.08, 0.05), (0, y, 0.3), R.dark, bevel=0.015)
    # dragon heart at the sternum, in a square setting held by four wedge claws
    box(c, (0.17, 0.17, 0.04), (0, 0.2, 0.305), R.dark, rot=(0, 0, PI / 4), bevel=0.012)
    facet_gem(c, 0.075, (0, 0.2, 0.335), R.glow)
    for a in range(4):
        d = Vector((math.cos(a * PI / 2), math.sin(a * PI / 2), 0))
        beam(c, tuple(Vector((0, 0.2, 0.31)) + d * 0.13), tuple(Vector((0, 0.2, 0.37)) + d * 0.07), 0.04, R.trim, w1=0.01, d=0.03, d1=0.012)
    for y in (0.24, 0.1, -0.04):                                                                  # dorsal fins
        beam(c, (0, y - 0.03, -0.29), (0, y + 0.05, -0.43), 0.03, R.dark, d=0.11, w1=0.012, d1=0.02)
    for name, s in (('sock_shoulderL', 1), ('sock_shoulderR', -1)):
        claw_pauldron(S(name), s)


def claw_pauldron(sh, s):
    fr = block_pauldron(sh, s, top=R.dark, edge=R.dark, seam=R.glow)
    (w, _, _), _, _ = PAULDRON_STEPS[-1]
    for z in (-0.13, 0.0, 0.13):                                   # claws off the lowest block's edge
        beam(fr[-1], (s * (w / 2 - 0.03), 0.0, z), (s * (w / 2 + 0.1), -0.035, z), 0.05, R.trim, d=0.05, w1=0.01, d1=0.012)
    (w, _, _), _, _ = PAULDRON_STEPS[1]
    for z in (-0.1, 0.1):
        beam(fr[1], (s * (w / 2 - 0.03), 0.0, z), (s * (w / 2 + 0.07), -0.02, z), 0.045, R.trim, d=0.045, w1=0.01, d1=0.01)
    top = fr[0]                                                    # wing claw sweeping back off the top block
    beam(top, (-s * 0.03, 0.07, -0.1), (s * 0.03, 0.17, -0.26), 0.08, R.dark, w1=0.055)
    beam(top, (s * 0.025, 0.16, -0.25), (s * 0.06, 0.18, -0.4), 0.055, R.trim, w1=0.01)


def E_helm(S):
    """Blocky dragon skull: cube shell and top block, heavy V brow over angled ember eye slits, a long box
    snout with nostrils and a nose horn over a lower jaw with teeth, and three-segment horns that start at the
    back of the skull and sweep back and low (behind the head from the front, long and clear from above)."""
    h = S('sock_head')
    box(h, (0.58, 0.46, 0.6), (0, 0.03, 0.0), R.metal, bevel=0.04)                             # skull
    box(h, (0.44, 0.08, 0.5), (0, 0.29, -0.03), R.metal, bevel=0.024)                           # top block
    box(h, (0.6, 0.05, 0.62), (0, -0.19, 0.0), R.dark, bevel=0.012)                             # neck rim
    box(h, (0.585, 0.018, 0.605), (0, -0.157, 0.0), R.glow, bevel=0)                            # ember seam
    box(h, (0.5, 0.14, 0.02), (0, 0.07, 0.3), SLIT_E, bevel=0)                                  # shadow behind the eyes
    for s in (-1, 1):
        box(h, (0.3, 0.085, 0.17), (s * 0.145, 0.15, 0.29), R.dark, rot=(0, 0, s * 0.22), bevel=0.02)   # brow ridge
        box(h, (0.13, 0.035, 0.03), (s * 0.135, 0.075, 0.305), R.glow, rot=(0, 0, s * 0.3), bevel=0)   # eye slit
        box(h, (0.2, 0.2, 0.05), (s * 0.19, -0.07, 0.29), R.metal, rot=(0, s * 0.35, 0), bevel=0.015)  # cheek plate
        horn = [(s * 0.2, 0.15, -0.14), (s * 0.29, 0.13, -0.36), (s * 0.34, 0.03, -0.54), (s * 0.36, -0.12, -0.68)]
        for (a, b), (w0, w1) in zip(zip(horn, horn[1:]), ((0.14, 0.11), (0.11, 0.075), (0.075, 0.012))):
            beam(h, tuple(Vector(a) - (Vector(b) - Vector(a)).normalized() * 0.03), b, w0, R.dark, w1=w1)
        beam(h, (s * 0.27, -0.06, -0.04), (s * 0.35, -0.1, -0.28), 0.05, R.dark, d=0.1, w1=0.01, d1=0.03)   # cheek frill
        box(h, (0.05, 0.028, 0.03), (s * 0.055, -0.012, 0.7), SLIT_E, bevel=0)                      # nostril
        for z in (0.38, 0.48, 0.58):
            x = s * (0.13 - 0.12 * (z - 0.3))
            beam(h, (x, -0.11, z), (x, -0.2, z + 0.01), 0.032, R.trim, w1=0.006)                   # teeth
    beam(h, (0, -0.02, 0.22), (0, -0.07, 0.72), 0.34, R.dark, d=0.2, w1=0.2, d1=0.12)           # snout
    beam(h, (0, -0.2, 0.2), (0, -0.215, 0.62), 0.28, R.dark, d=0.08, w1=0.16, d1=0.05)           # lower jaw
    for z, hh in ((0.34, 0.065), (0.46, 0.055)):                                                  # nubs down the snout
        beam(h, (0, 0.04 - (z - 0.22) * 0.1, z), (0, 0.04 - (z - 0.22) * 0.1 + hh, z - 0.045), 0.055, R.metal, w1=0.012)
    beam(h, (0, -0.02, 0.655), (0, 0.1, 0.69), 0.065, R.trim, w1=0.012)                             # nose horn
    for z, hh in ((0.1, 0.07), (-0.06, 0.08), (-0.22, 0.07)):                                     # crest fins
        beam(h, (0, 0.31, z + 0.03), (0, 0.33 + hh, z - 0.07), 0.028, R.dark, d=0.1, w1=0.01, d1=0.02)


def E_gloves(S):
    for name, s in (('sock_handL', 1), ('sock_gloveR', -1)):
        g = S(name)
        plate_gauntlet(g, s, cuff_rim=R.glow)
        for x in (-0.08, 0.0, 0.08):
            beam(g, (x, -0.12, 0.12), (x, -0.2, 0.23), 0.045, R.trim, w1=0.01)                     # claws
        beam(g, (s * 0.18, -0.06, 0), (s * 0.2, 0.14, -0.02), 0.03, R.dark, d=0.14, w1=0.012, d1=0.06)   # back scale


def E_boots(S):
    for name in ('sock_footL', 'sock_footR'):
        f = S(name)
        plate_sabaton(f, rim=R.glow)
        for x in (-0.1, 0.0, 0.1):
            beam(f, (x, -0.1, 0.28), (x, -0.14, 0.4), 0.06, R.trim, w1=0.012)                    # talons
        beam(f, (0, 0.47, 0.19), (0, 0.56, 0.3), 0.07, R.dark, w1=0.012)                          # knee spike


VARIANTS['e'] = {'name': 'Emberforged', 'body_plate': E_body, 'helm_full': E_helm, 'gloves': E_gloves, 'boots': E_boots}


