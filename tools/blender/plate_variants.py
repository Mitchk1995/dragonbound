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
SOCKET_POS, SLIT = _g['SOCKET_POS'], _g['SLIT']
CHEST_IN, HELM_IN, CUIRASS, GREAT_HELM, PAULDRON = _g['CHEST_IN'], _g['HELM_IN'], _g['CUIRASS'], _g['GREAT_HELM'], _g['PAULDRON']
mp, row_v, cuirass, band_on, tasset, helm_shell = _g['mp'], _g['row_v'], _g['cuirass'], _g['band_on'], _g['tasset'], _g['helm_shell']
pauldron, pauldron_trim, scale_row = _g['pauldron'], _g['pauldron_trim'], _g['scale_row']
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


# ═══ Shared plate parts ══════════════════════════════════════════════════════

LAMES = ((-0.39, -0.295), (-0.465, -0.37))


def plate_waist(c, seam=None, rim=R.trim):
    """Two abdominal lames, belt and buckle, a short mail fauld, two-lame front tassets and a culet with rolled
    `rim`s. `seam` (a colour) adds a thin line where each lame tucks under the plate above it."""
    for i, (y0, y1) in enumerate(LAMES):
        a, b = 0.41 - 0.005 * i, 0.305 - 0.004 * i
        hoop(c, y0, y1, (a, b), (a - 0.01, b - 0.008), 0.024, R.metal, nu=12, e=3.6, rf=(0.02, 0.02), rw=0.6, nm=f'lame{i}', walls=(0,))
        if seam:
            hoop(c, y0 - 0.012, y0 + 0.004, (a - 0.004, b - 0.004), (a - 0.004, b - 0.004), 0.02, seam, nu=12, e=3.6, nm=f'lame_seam{i}')
    hoop(c, -0.53, -0.465, (0.405, 0.3), (0.405, 0.3), 0.025, R.leather, nu=12, e=3.6, nm='belt')
    tag(box(c, (0.14, 0.09, 0.03), (0, -0.497, 0.315), R.trim, bevel=0.01), 'buckle')
    hoop(c, -0.66, -0.52, (0.425, 0.3), (0.41, 0.295), 0.02, R.dark, nu=12, e=5.0, nm='fauld_mail', walls=(0,))
    for s in (-1, 1):
        t0, t1 = (0.2, 1.25) if s > 0 else (-1.25, -0.2)
        sd = 'LR'[s < 0]
        tasset(c, t0, t1, -0.52, -0.65, 0.435, 0.315, rim=None, nm=f'tasset_up{sd}', e=5.0)
        tasset(c, t0, t1, -0.62, -0.76, 0.45, 0.33, rim=rim, nm=f'tasset_lo{sd}', e=5.0)
    tasset(c, PI - 1.0, PI + 1.0, -0.52, -0.72, 0.435, 0.315, rim=rim, nm='culet', e=5.0, nu=4)


def gorget(c, rim=R.trim):
    hoop(c, 0.34, 0.415, (0.305, 0.295), (0.29, 0.28), 0.03, R.metal, nu=10, e=2.6, bevel=0.012, nm='gorget', walls=(1,))
    hoop(c, 0.405, 0.43, (0.297, 0.287), (0.292, 0.282), 0.03, rim, nu=10, e=2.6, nm='gorget_rim')


def gauntlet(g, s, cuff_rim=R.trim):
    tag(box(g, (0.31, 0.26, 0.31), (0, -0.01, 0), R.metal, bevel=0.05), 'fist')
    tag(box(g, (0.325, 0.08, 0.325), (0, -0.11, 0.005), R.metal, bevel=0.012), 'finger_lame')
    tag(box(g, (0.33, 0.03, 0.33), (0, -0.06, 0.005), R.dark, bevel=0), 'knuckle_gap')
    tag(box(g, (0.125, 0.185, 0.135), (-s * 0.07, 0.03, 0.168), R.metal, rot=(0.3, 0, 0), bevel=0.03), 'thumb')
    cf = loft_fn([(0.1, 0.14, 0.145, 0, 0), (0.3, 0.158, 0.165, 0, 0)], 2.4)
    surf(g, cf, 8, 1, 0.025, R.metal, closed_u=True, inside=(0, 0.2, 0), nm='cuff', inner=False)
    band_on(g, cf, 0.8, 1.0, color=cuff_rim, nu=8, lift=0.004, nm='cuff_roll', ins=(0, 0.2, 0))
    return cf


def sabaton(f, knee=True):
    tag(box(f, (0.34, 0.195, 0.44), (0, -0.08, 0.055), R.metal, bevel=0.05), 'foot')
    tag(box(f, (0.31, 0.12, 0.14), (0, -0.06, 0.24), R.metal, rot=(-0.3, 0, 0), bevel=0.03), 'sabaton_toe')
    tag(box(f, (0.36, 0.035, 0.46), (0, -0.166, 0.055), R.dark, bevel=0), 'sole')
    gi = (0, 0.15, 0)
    gf = loft_fn([(0.035, 0.18, 0.185, 0.02, 0), (0.34, 0.17, 0.175, 0.035, 0)], 2.6)
    surf(f, gf, 8, 1, 0.025, R.metal, closed_u=True, inside=gi, nm='greave', inner=False)
    if knee:
        kf = loft_fn([(0.32, 0.2, 0.2, 0.02, 0), (0.47, 0.205, 0.205, 0.04, 0)], 2.4, t0=-1.8, t1=1.8)
        surf(f, kf, 5, 1, 0.025, R.metal, inside=(0, 0.39, 0), bevel=0.01, nm='poleyn', inner=False)
    return gf


def front(fn, half, v0, v1):
    """Patch of a lofted surface around its front (u in -half..half turns)."""
    return lambda u, v: fn((-half + 2 * half * u) % 1.0, v0 + (v1 - v0) * v)


# ═══ P: plate (bronze, iron, steel) ══════════════════════════════════════════
# OSRS-style plate: a rounded cuirass with a soft centre ridge and a slight chest swell, rolled rims at the
# neck and waist, plain lames, belt and tassets; rounded pauldrons hugging the arm; a rounded great helm with
# one clean visor slit; plain gauntlets and sabatons. Trim is a lighter tint of the same metal (tier palette).

def P_body(S):
    c = S('sock_chest')
    fn = cuirass(c)
    band_on(c, fn, 0.0, 0.035, nm='waist_roll')
    # plackart: the lower breastplate laid over the cuirass, its top edge a shallow V, rolled
    pl = lambda u, v: fn((-0.16 + 0.32 * u) % 1.0, 0.02 + (0.42 - 0.13 * abs(2 * u - 1) - 0.02) * v)
    surf(c, grow(pl, 0.012, CHEST_IN), 6, 2, 0.02, R.metal, inside=CHEST_IN, inner=False, nm='plackart')
    surf(c, grow(lambda u, v: pl(u, 0.88 + 0.12 * v), 0.016, CHEST_IN), 6, 1, 0.022, R.trim, inside=CHEST_IN, inner=False, nm='plackart_roll')
    gorget(c)
    tag(box(c, (0.04, 0.44, 0.02), (0, 0.0, -0.328), R.dark, bevel=0), 'spine')
    plate_waist(c)
    for name, s in (('sock_shoulderL', 1), ('sock_shoulderR', -1)):
        pauldron(S(name), s)


def P_helm(S):
    h = S('sock_head')
    fn = helm_shell(h)
    band_on(h, fn, 0.0, 0.06, nm='helm_rim', ins=HELM_IN, thick=0.035)
    vs0, vs1 = row_v(GREAT_HELM, 0.035), row_v(GREAT_HELM, 0.085)
    surf(h, grow(front(fn, 0.15, vs0, vs1), 0.004, HELM_IN), 6, 1, 0.02, SLIT, inside=HELM_IN, inner=False, nm='eye_slit')
    surf(h, grow(front(fn, 0.16, 0.06, vs0), 0.012, HELM_IN), 6, 2, 0.024, R.metal, inside=HELM_IN, bevel=0.008, inner=False, nm='visor')
    surf(h, grow(front(fn, 0.16, vs1, row_v(GREAT_HELM, 0.13)), 0.012, HELM_IN), 6, 1, 0.024, R.trim, inside=HELM_IN, inner=False, nm='brow')
    for u in (0.25, 0.75):
        tag(stud_on(h, fn, u, vs0, HELM_IN, R.dark), 'visor_rivet')


def P_gloves(S):
    for name, s in (('sock_handL', 1), ('sock_gloveR', -1)):
        gauntlet(S(name), s)


def P_boots(S):
    for name in ('sock_footL', 'sock_footR'):
        sabaton(S(name))


VARIANTS['p'] = {'name': 'Plate', 'body_plate': P_body, 'helm_full': P_helm, 'gloves': P_gloves, 'boots': P_boots}


# ═══ E: Emberforged ══════════════════════════════════════════════════════════
# The plate silhouette forged from dragon parts: obsidian plates split by thin glowing ember seams, rows of
# overlapping dragon scales over the breast either side of a smooth scute column, a dragon-heart gem in a claw
# setting at the sternum, pauldrons of folded wing plates with a wing bone and claws, and a dragon-skull helm
# (long snout visor, brow ridges over glowing eyes, horns swept straight back).

def snout_fn(rows, e=2.6):
    """Tapering muzzle lofted along +Z. rows: (z, centre y, half width, half height); u goes round from the top."""
    def fn(u, v):
        k = v * (len(rows) - 1)
        i = min(int(k), len(rows) - 2)
        f = k - i
        z, yc, w, hh = [a + (b - a) * f for a, b in zip(rows[i], rows[i + 1])]
        t = 2 * PI * u
        return (w * ssin(t, e), yc + hh * scos(t, e), z)
    return fn


def E_body(S):
    c = S('sock_chest')
    fn = cuirass(c)
    band_on(c, fn, 0.0, 0.035, color=R.dark, nm='waist_roll')
    # scale field: ember glows through the gaps between the scales
    surf(c, grow(front(fn, 0.26, row_v(CUIRASS, -0.17), row_v(CUIRASS, 0.12)), 0.004, CHEST_IN), 12, 3, 0.01, R.glow,
         inside=CHEST_IN, inner=False, nm='scale_glow')
    for j, (ya, yb) in enumerate(((0.14, 0.3), (0.03, 0.19), (-0.08, 0.08), (-0.19, -0.03))):
        v0, v1 = row_v(CUIRASS, ya), row_v(CUIRASS, yb)
        u_mid = (0.0 if j % 2 else 0.0375) + 1.5 * 0.075
        for s in (-1, 1):
            scale_row(c, fn, u_mid if s > 0 else 1 - u_mid, 3, 0.075, v0, v1, R.metal, CHEST_IN, point=0.05, lift=0.008 + 0.004 * j,
                      flare=0.028, nm='scale')
    for y in (0.05, -0.05, -0.15, -0.25):
        scale_row(c, fn, 0.0, 1, 0.085, row_v(CUIRASS, y), row_v(CUIRASS, y + 0.1), R.metal, CHEST_IN, point=0.02, lift=0.03,
                  flare=0.012, nm='scute')
    # dragon heart at the sternum, held in a ring and four claws
    v = row_v(CUIRASS, 0.17)
    n = surf_normal(fn, 0.0, v, CHEST_IN)
    ctr = V(fn(0.0, v)) + n * 0.05
    tag(gem(c, 0.07, tuple(ctr), R.glow), 'heart')
    tag(ring(c, 0.1, 0.07, 0.045, tuple(ctr - n * 0.02), R.dark, rot=rot_to(n), seg=8), 'heart_ring')
    for k in range(3):
        a = PI / 2 + k * 2 * PI / 3
        r_ = Vector((math.cos(a), math.sin(a), 0))
        horn(c, [tuple(ctr + r_ * 0.1 - n * 0.02), tuple(ctr + r_ * 0.095 + n * 0.04), tuple(ctr + r_ * 0.045 + n * 0.08)],
             (0.028, 0.02, 0.004), R.dark, seg=4)
    gorget(c, rim=R.dark)
    hoop(c, 0.328, 0.345, (0.304, 0.296), (0.304, 0.296), 0.02, R.glow, nu=10, e=2.6, nm='gorget_seam')
    for y, hgt in ((0.26, 0.12), (0.1, 0.14), (-0.06, 0.12), (-0.2, 0.09)):
        tag(prism(c, [(-0.07, 0.0), (0.07, 0.0), (-0.04, hgt)], 0.035, (0, y, -0.325), R.dark, rot=(0, PI / 2, 0.5)), 'dorsal')
    plate_waist(c, seam=R.glow, rim=R.dark)
    for name, s in (('sock_shoulderL', 1), ('sock_shoulderR', -1)):
        wing_pauldron(S(name), s)


def wing_pauldron(sh, s):
    """Pauldron dome under a folded wing: finger plates fan down over the outside of the shoulder, a wing bone
    runs front to back over the top with a thumb claw forward and the wing's elbow claw behind."""
    capf, _ = pauldron(sh, s, roll=R.dark, lame_edge=R.glow)
    O = PAULDRON[0]
    ins = (O[0], O[1] - 0.04, 0)
    th1 = 1.2

    def at(a, th, d=0.0):
        u, v = (a + PI) / (2 * PI), th / th1
        return V(capf(u, v)) + surf_normal(capf, u, v, ins) * d
    for i, a in enumerate((0.75, 0.0, -0.75)):
        base = at(a, 0.55, 0.02)
        nrm = (base - V(ins)).normalized()
        d = V((0.22, -0.9, -0.28 - 0.08 * i + a * 0.35))
        bf, bi = blade_fn(tuple(base), tuple(d), tuple(nrm), 0.28, 0.12, curl=0.05, bulge=0.025, taper=0.7, tipw=0.012)
        surf(sh, mirror(bf, s), 2, 3, 0.022, R.metal, inside=mp(bi, s), inner=True, nm=f'wing_plate{i}')
        tip, back = V(bf(0.5, 1.0)), V(bf(0.5, 0.8))
        tag(spike(sh, mp(tuple(tip), s), mp(tuple((tip - back).normalized()), s), 0.02, 0.07, R.trim, seg=4), 'wing_claw')
    bone = [at(PI / 2, 1.0, 0.03), at(PI / 2, 0.45, 0.035), at(0.0, 0.0, 0.04), at(-PI / 2, 0.45, 0.035), at(-PI / 2, 0.95, 0.03)]
    bone.append(bone[-1] + V((0.02, 0.04, -0.12)))
    horn(sh, [mp(tuple(p), s) for p in bone], (0.04, 0.042, 0.045, 0.042, 0.035, 0.012), R.dark, seg=5)
    tag(spike(sh, mp(tuple(bone[0]), s), mp((0.1, 0.55, 1.0), s), 0.03, 0.12, R.trim), 'thumb_claw')


# A low, long skull: the brow ridges run back along its sides into the horns.
DRAGON_HELM = [(-0.25, 0.32, 0.33, 0.02, 0), (0.0, 0.315, 0.33, 0.03, 0), (0.15, 0.3, 0.315, 0.03, 0), (0.24, 0.25, 0.27, 0.02, 0),
               (0.285, 0.15, 0.17, 0.0, 0), (0.3, 0.0, 0.0, 0, 0)]


def E_helm(S):
    h = S('sock_head')
    fn = helm_shell(h, rows=DRAGON_HELM)
    band_on(h, fn, 0.0, 0.06, color=R.dark, nm='helm_rim', ins=HELM_IN, thick=0.035)
    band_on(h, fn, 0.06, 0.075, color=R.glow, nm='helm_seam', ins=HELM_IN, thick=0.02, lift=0.002)
    # long wedge snout over a lower jaw, with nostrils and a row of short teeth
    up = [(0.18, 0.02, 0.14, 0.15), (0.34, -0.02, 0.125, 0.13), (0.46, -0.07, 0.1, 0.095), (0.56, -0.11, 0.07, 0.065),
          (0.62, -0.13, 0.04, 0.04), (0.63, -0.13, 0.0, 0.0)]
    surf(h, snout_fn(up, e=2.0), 10, len(up) - 1, 0.03, R.dark, closed_u=True, inside=(0, -0.08, 0.4), nm='snout', inner=False, walls=(0,))
    jaw = [(0.24, -0.19, 0.14, 0.045), (0.38, -0.205, 0.115, 0.04), (0.52, -0.215, 0.07, 0.03), (0.55, -0.215, 0.0, 0.0)]
    surf(h, snout_fn(jaw), 8, len(jaw) - 1, 0.03, R.dark, closed_u=True, inside=(0, -0.2, 0.35), nm='jaw', inner=False, walls=(0,))
    for i, (y, z, hgt) in enumerate(((0.12, 0.31, 0.07), (0.07, 0.4, 0.06), (0.0, 0.49, 0.05))):   # ridge of nubs down the snout
        tag(spike(h, (0, y, z), (0, 1, 0.5), 0.03, hgt, R.metal, seg=4), 'snout_nub')
    tag(spike(h, (0, -0.1, 0.57), (0, 1, 0.35), 0.035, 0.1, R.metal, seg=5), 'nose_horn')
    for s in (-1, 1):
        tag(box(h, (0.035, 0.02, 0.04), (s * 0.035, -0.087, 0.6), R.dark, rot=(0.6, 0, 0), bevel=0), 'nostril')
        for k, z in enumerate((0.34, 0.42, 0.5)):
            tag(spike(h, (s * (0.1 - 0.022 * k), -0.175, z), (0, -1, 0.15), 0.016, 0.05, R.trim, seg=3), 'tooth')
        # glowing eyes; horns rise from the brow above them and sweep back over the skull
        tag(box(h, (0.12, 0.035, 0.03), (s * 0.15, 0.12, 0.31), R.glow, rot=(0, s * 0.35, s * 0.25), bevel=0), 'eye')
        horn(h, [(s * 0.1, 0.2, 0.3), (s * 0.17, 0.29, 0.19), (s * 0.24, 0.35, -0.01), (s * 0.3, 0.39, -0.25), (s * 0.33, 0.38, -0.49),
                 (s * 0.33, 0.34, -0.7)], (0.04, 0.06, 0.065, 0.05, 0.03, 0.006), R.dark, seg=6)
        for k in (-1, 0, 1):     # cheek frill
            horn(h, [(s * 0.3, 0.0 + 0.04 * k, 0.06), (s * (0.42 - 0.03 * abs(k)), 0.02 + 0.08 * k, -0.2 - 0.03 * k)], (0.04, 0.004), R.dark, seg=4)
    for i, (z, y) in enumerate(((-0.04, 0.28), (-0.19, 0.25))):
        tag(prism(h, [(-0.05, 0.0), (0.05, 0.0), (-0.035, 0.08 - 0.012 * i)], 0.03, (0, y, z), R.dark, rot=(0, PI / 2, 0)), 'crest_spine')


def E_gloves(S):
    for name, s in (('sock_handL', 1), ('sock_gloveR', -1)):
        g = S(name)
        gauntlet(g, s, cuff_rim=R.glow)
        for x in (-0.08, 0.0, 0.08):
            tag(spike(g, (x, -0.13, 0.12), (0, -1, 0.5), 0.022, 0.09, R.trim, seg=3), 'claw')
        tag(prism(g, [(-0.07, 0.07), (0.07, 0.07), (0.07, -0.01), (0.0, -0.08), (-0.07, -0.01)], 0.025, (s * 0.165, 0.0, 0), R.dark,
                  rot=(0, PI / 2, 0), bevel=0.006), 'hand_scale')


def E_boots(S):
    for name in ('sock_footL', 'sock_footR'):
        f = S(name)
        gf = sabaton(f)
        band_on(f, gf, 0.9, 0.98, color=R.glow, nu=8, lift=0.003, thick=0.02, nm='greave_seam', ins=(0, 0.15, 0))
        for x in (-0.1, 0.0, 0.1):
            tag(spike(f, (x, -0.1, 0.28), (0, -0.3, 1), 0.03, 0.1, R.trim, seg=3), 'talon')
        tag(spike(f, (0, 0.42, 0.22), (0, 0.4, 1), 0.035, 0.12, R.dark, seg=4), 'knee_spike')


VARIANTS['e'] = {'name': 'Emberforged', 'body_plate': E_body, 'helm_full': E_helm, 'gloves': E_gloves, 'boots': E_boots}
