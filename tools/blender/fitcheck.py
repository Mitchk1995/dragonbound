"""Fit check (never exported): dress the base hero with gear/hair scenes the way the game does.

The game moves every child of a gear file's `sock_X` empty under the hero's `sock_X` with its local
transform unchanged (registry.ts buildGear/attachParts), and takes off the starting outfit's
`outfit_<slot>_*` pieces under the gear that fills that slot (HeroDresser). We do the same with object copies.
Run the builder scripts first so their DB_* scenes exist in this .blend (fit_all() builds them itself).

    exec(open(os.path.join(os.environ['DRAGONBOUND_ROOT'], 'tools', 'blender', 'fitcheck.py')).read())
    fit('plate', ['DB_gear_body_plate', 'DB_gear_longsword'])
    report = fit_all()   # every gear piece on the hero, audited in every pose (plate_variants.py audit)
    report = arm_clip_all()   # arms (and the gear on them) cutting into the body, every character and pose
"""
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
from mathutils import Euler, Matrix, Quaternion
from mathutils.bvhtree import BVHTree

_p = os.path.join(_ROOT, 'tools', 'blender', 'hero.py')
_g = {'DB_RUN': False, '__name__': 'db_fit', '__file__': _p}
exec(open(_p, encoding='utf-8').read(), _g)
build_hero = _g['build_hero']

_strip = lambda n: re.sub(r'\.\d{3}$', '', n)


def _copy_tree(o, parent, scene, src, sock):
    n = o.copy()
    scene.collection.objects.link(n)
    n.parent = parent
    n.matrix_parent_inverse = Matrix.Identity(4)
    n.matrix_basis = o.matrix_basis.copy()
    if n.type == 'MESH':
        n['pv'] = src          # gear, for the plate_variants.py audit
        n['pv_sock'] = sock
    for ch in o.children:
        _copy_tree(ch, n, scene, src, sock)


def slot_of(src):
    """The equipment slot a gear scene fills, from the sockets it uses (None for weapons, helms and hair)."""
    names = {_strip(o.name) for o in bpy.data.scenes[src].objects}
    if 'sock_chest' in names:
        return 'body'
    if 'sock_footL' in names:
        return 'boots'
    if 'sock_handL' in names:
        return 'gloves'
    return None


def dress(scene, sources):
    worn = {slot_of(src) for src in sources}
    off = set()
    for o in scene.objects:
        m = re.match(r'outfit_(body|gloves|boots)_', _strip(o.name))
        if m and m.group(1) in worn:
            off.update([o] + list(o.children_recursive))
    for d in off:
        bpy.data.objects.remove(d, do_unlink=True)
    socks = {_strip(o.name): o for o in scene.objects if _strip(o.name).startswith('sock_')}
    missing = []
    for src in sources:
        for o in bpy.data.scenes[src].objects:
            name = _strip(o.name)
            if not name.startswith('sock_'):
                continue
            if name not in socks:
                missing.append(f'{src}:{name}')
                continue
            for ch in o.children:
                _copy_tree(ch, socks[name], scene, src, name)
    return missing


def fit(label, sources, target=(0, 1.1, 0), dist=4.4, views=((0, 10), (40, 18), (150, 15), (30, 55)), res=384, pose=None):
    """`pose` = {part: (rx, ry, rz)} added to the rig's rest rotation, e.g. {'armR': (-1.57, 0, 0)} (bow shot)."""
    scene, root = build_hero('DB_fitcheck')
    missing = dress(scene, sources)
    for part, r in (pose or {}).items():
        o = next(o for o in scene.objects if _strip(o.name) == part)
        o.rotation_euler = tuple(a + b for a, b in zip(o.rotation_euler, r))
    path = preview_sheet(f'fit_{label}.png', target=target, dist=dist, views=views, res=res)
    remove_preview_rig()
    return {'path': path, 'missing': missing, 'tris': tri_count(scene)}


# Every gear piece the hero can wear, in the sets the game puts together; plate sets p/e come from plate_variants.py.
SETS = {
    'plain': ['sword'],
    'chain': ['helm_open', 'body_chain', 'gloves', 'boots', 'sword'],
    'leather': ['helm_open', 'body_leather', 'gloves', 'boots', 'bow_hunter'],
    'plate': ['helm_full', 'body_plate', 'gloves', 'boots', 'pickaxe'],
    'plate_p': ['pv_p_helm_full', 'pv_p_body_plate', 'pv_p_gloves', 'pv_p_boots', 'longsword'],
    'plate_e': ['pv_e_helm_full', 'pv_e_body_plate', 'pv_e_gloves', 'pv_e_boots', 'staff_ember'],
    'uniques': ['u_ashen_crown', 'u_wyrmbone', 'u_cinderfang'],
    'gloves_only': ['gloves', 'staff_oak'],
    'boots_only': ['boots', 'bow_worn'],
    'weapons': ['bow_recurve', 'bow_drakebone', 'staff_apprentice', 'staff_runed', 'u_emberstring', 'u_kindled_ash'],
}


def fit_all(poses=('idle', 'walk', 'windup', 'slam', 'cast'), render=False):
    """Build every gear model, dress the hero in each set and audit it in every pose with plate_variants.py's numeric
    checks: hero surface poking out through gear (hero_pokes) and, at rest, gear touching nothing (floating).
    Returns {set: {pose: report}} plus the sockets any piece missed."""
    gp = os.path.join(_ROOT, 'tools', 'blender', 'gear.py')
    g = {'DB_RUN': False, '__name__': 'db_gear', '__file__': gp}
    exec(open(gp, encoding='utf-8').read(), g)
    vp = os.path.join(_ROOT, 'tools', 'blender', 'plate_variants.py')
    v = {'__name__': 'db_plate', '__file__': vp}
    exec(open(vp, encoding='utf-8').read(), v)
    for model in g['GEAR']:
        g['build'](model)
    for s in ('p', 'e'):
        v['build_variant'](s)
    scene_of = lambda m: f'DB_{m}' if m.startswith('pv_') else f'DB_gear_{m}'
    out = {}
    for label, models in SETS.items():
        sources = [scene_of(m) for m in models]
        rep = {}
        for pose in poses:
            scene, root = build_hero('DB_fitcheck')
            missing = dress(scene, sources)
            v['apply_pose'](scene, v['POSES'][pose])
            bpy.context.view_layer.update()
            meshes = [o for o in scene.objects if o.type == 'MESH']
            gear = [o for o in meshes if 'pv' in o]
            hero = [o for o in meshes if 'pv' not in o]
            r = {}
            if gear:
                at, aown = v['_bvh'](gear)
                r['hero_pokes'] = v['pokes'](hero, at, aown, v['_hero_label'], v['_bvh'](meshes))
                if pose == 'idle':
                    r['floating'] = v['floating'](gear, meshes)
            if missing:
                r['missing'] = missing
            rep[pose] = r
            if render and pose == 'idle':
                r['sheet'] = preview_sheet(f'fit_{label}.png', target=(0, 1.1, 0), dist=4.4, views=((0, 10), (40, 18), (150, 15), (30, 55)), res=384)
                remove_preview_rig()
        out[label] = rep
    return out


# ─── Arms against the body ───────────────────────────────────────────────────
# The owner: "the arms might be clipping to the sides". Every character is posed exactly as anim.ts poses it (idle,
# both walk extremes and the frames of its attacks) and every arm surface (sleeves, fists, the gear riding the arm) is
# tested against every other part of the body (torso, robe, belt, head, legs). Held items and the pauldron tops on the
# shoulder sockets (which cap the arm on purpose) are left out.

IMPACT = 0.55                                  # src/data/tuning.ts COMBAT_TUNING.impact
SWING_WRIST = 1.23                             # anim.ts
BOW_SOCKET = (0, math.pi / 2, math.pi / 2)
BOW_ANCHOR = (-1.58, -1.51)
FOLLOW = 0.75                                  # anim.ts SHOULDER_FOLLOW
SPLAY = 0.1                                    # anim.ts ARM_SPLAY
_ease = lambda t: t * t * (3 - 2 * t)


def anim_pose(kind=None, a=-1.0, sw=0.0):
    """anim.ts Rig.update for a humanoid: rotation offsets {part: (x, y, z)} for the walk phase sw (sin of the stride,
    at full speed) and attack `kind` at progress a (-1: none)."""
    move = 1.0 if sw else 0.0
    p = {'armL': (-sw * 0.5 * move, 0, SPLAY), 'armR': (sw * 0.3 * move, 0, -SPLAY), 'sock_handR': (0, 0, 0),
         'legL': (sw * 0.7 * move, 0, 0), 'legR': (-sw * 0.7 * move, 0, 0)}
    if a < 0 or kind is None:
        return p
    if kind == 'swing':
        up, down = IMPACT - 0.1, IMPACT + 0.1
        x = (-3.2 * _ease(a / up) if a < up else -3.2 + 2.85 * _ease((a - up) / (down - up)) if a < down
             else -0.35 * (1 - _ease((a - down) / (1 - down))))
        wrist = SWING_WRIST * _ease(min(1, a / up)) if a < IMPACT else SWING_WRIST * (1 - _ease((a - IMPACT) / (1 - IMPACT)))
        p['armR'], p['sock_handR'] = (x, 0, -SPLAY), (wrist, 0, 0)
    elif kind == 'slam':
        x = -3.0 * _ease(a / IMPACT) if a < IMPACT else -3.0 + 2.8 * _ease((a - IMPACT) / (1 - IMPACT))
        p['armR'], p['armL'] = (x, 0, -SPLAY), (x, 0, SPLAY)
    elif kind == 'bow':
        r = _ease(min(1, a / 0.2))
        p['armR'], p['sock_handR'] = (0, 0, -math.pi / 2 * r), tuple(v * r for v in BOW_SOCKET)
        p['armL'] = (BOW_ANCHOR[0] * r, 0, BOW_ANCHOR[1] * r)
    elif kind == 'cast':
        lift = _ease(a / IMPACT) if a < IMPACT else 1 - _ease((a - IMPACT) / (1 - IMPACT))
        x = -1.2 - 1.0 * lift
        p['armR'], p['sock_handR'], p['armL'] = (x, 0, 0), (-x + 0.35, 0, 0), (-1.0 - 0.8 * lift, 0, 0)
    elif kind == 'throw':
        x = -2.6 * _ease(a / IMPACT) if a < IMPACT else -2.6 + 2.0 * _ease((a - IMPACT) / (1 - IMPACT))
        p['armR'] = (x, 0, 0)
    return p


# The frames each attack is checked at: wind-up, impact and follow-through.
ATTACK_FRAMES = {'swing': (0.36, 0.45, 0.55, 0.67), 'slam': (0.45, 0.6), 'cast': (0.4, 0.55, 0.8), 'throw': (0.36, 0.55),
                 'bow': (0.45,)}


def pose_list(kinds):
    out = [('idle', anim_pose()), ('walk+', anim_pose(sw=1.0)), ('walk-', anim_pose(sw=-1.0))]
    for k in kinds:
        out += [(f'{k}@{a}', anim_pose(k, a)) for a in ATTACK_FRAMES[k]]
    return out


def pose_scene(scene, offsets):
    """Rest rotation + offsets on every rig part present, then the shoulder sockets follow their arms (anim.ts
    followShoulders)."""
    parts = {_strip(o.name): o for o in scene.objects}
    rest = {}
    for name in ('armL', 'armR'):
        if name in parts:
            rest[name] = parts[name].location.copy()
    for name, r in offsets.items():
        o = parts.get(name)
        if o is None:
            continue
        base = o.get('rest_rot')
        if base is None:
            o['rest_rot'] = base = tuple(o.rotation_euler)
        o.rotation_euler = tuple(b + v for b, v in zip(base, r))
    for side in ('L', 'R'):
        arm, sock = parts.get(f'arm{side}'), parts.get(f'sock_shoulder{side}')
        if not arm or not sock or arm.parent is not sock.parent:
            continue
        if sock.get('rest_loc') is None:
            sock['rest_loc'] = tuple(sock.location)
        delta = Euler(arm.rotation_euler, 'ZYX').to_quaternion()
        turn = Quaternion().slerp(delta, FOLLOW)
        sock.location = rest[f'arm{side}'] + turn @ (Vector(sock['rest_loc']) - rest[f'arm{side}'])
        sock.rotation_mode = 'QUATERNION'
        sock.rotation_quaternion = turn
    bpy.context.view_layer.update()


def _ancestor(o, names):
    a = o.parent
    while a is not None:
        if _strip(a.name) in names:
            return _strip(a.name)
        a = a.parent
    return None


def _surface_samples(o):
    mw = o.matrix_world
    me = o.data
    out = []
    for p in me.polygons:
        vs = [mw @ me.vertices[i].co for i in p.vertices]
        c_ = sum(vs, Vector()) / len(vs)
        out.append(c_)
        out += [v.lerp(c_, 0.08) for v in vs]
        out += [vs[i].lerp(vs[(i + 1) % len(vs)], 0.5).lerp(c_, 0.08) for i in range(len(vs))]
    return out


HELD = ('sock_handR', 'weapon', 'sock_shoulderL', 'sock_shoulderR')


def arm_clip(scene, joint=0.1):
    """How deep each arm cuts into the rest of the body: {side: (max depth, where)} for the arm proper and, separately,
    for its root inside `joint` of the shoulder pivot (where the arm meets the body under the shoulder cap)."""
    bpy.context.view_layer.update()
    meshes = [o for o in scene.objects if o.type == 'MESH' and len(o.data.polygons)]
    arms = {'L': [], 'R': []}
    body = []
    for o in meshes:
        if _ancestor(o, HELD):
            continue
        side = _ancestor(o, ('armL', 'armR'))
        if side:
            arms[side[-1]].append(o)
        else:
            body.append(o)
    solids = []
    for o in body:
        mw = o.matrix_world
        vs = [mw @ v.co for v in o.data.vertices]
        lo = Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs)))
        hi = Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs)))
        tree = BVHTree.FromPolygons(vs, [list(p.vertices) for p in o.data.polygons])
        solids.append((o, lo, hi, tree))
    parts = {_strip(o.name): o for o in scene.objects}
    out = {}
    for side, objs in arms.items():
        arm = parts[f'arm{side}']
        inv = arm.matrix_world.inverted()
        worst = {'limb': (0.0, None), 'joint': (0.0, None)}
        for o in objs:
            for P in _surface_samples(o):
                deep = 0.0
                hit = None
                for b, lo, hi, tree in solids:
                    if not (lo.x <= P.x <= hi.x and lo.y <= P.y <= hi.y and lo.z <= P.z <= hi.z):
                        continue
                    loc, nor, _, dist = tree.find_nearest(P)
                    if loc is not None and (P - loc).dot(nor) < -1e-4 and dist > deep:
                        deep, hit = dist, b
                if not hit:
                    continue
                l = inv @ P
                zone = 'joint' if l.length < joint + 0.13 and l.y > -joint else 'limb'
                if deep > worst[zone][0]:
                    what = f'{_hero_part(o)} in {_hero_part(hit)} at arm y {l.y:.2f}'
                    worst[zone] = (round(deep, 3), what)
        out[side] = worst
    return out


def _hero_part(o):
    a = o
    while a and _strip(a.name) not in ('head', 'armL', 'armR', 'legL', 'legR', 'body') and not _strip(a.name).startswith(('sock_', 'outfit_')):
        a = a.parent
    m = o.data.materials[0].name if o.data.materials else '?'
    return f'{_strip(a.name) if a else "?"}/{m.replace("ROLE_", "")}'


def _minion_builders():
    mp = os.path.join(_ROOT, 'tools', 'blender', 'minions.py')
    m = {'DB_RUN': False, '__name__': 'db_minions', '__file__': mp}
    exec(open(mp, encoding='utf-8').read(), m)
    return {'goblin': (m['goblin'], ('swing',)), 'kobold': (m['kobold'], ('throw',)), 'cultist': (m['cultist'], ('cast',)),
            'priest': (m['priest'], ('cast',))}


HERO_CLIP_SETS = {k: SETS[k] for k in ('plain', 'chain', 'leather', 'plate', 'plate_p', 'plate_e', 'uniques', 'gloves_only')}
HERO_KINDS = ('swing', 'slam', 'cast', 'bow')
# The bow's draw arm reaches across the chest to the anchor under the chin: with no elbow, a rigid arm from the left
# shoulder can only get there through the front of the chest. Measured and reported, not failed.
EXEMPT = {(True, 'L')}
# The goblin's club arm, raised overhead, passes behind its big wedge ear (the ear is hidden by the arm, nothing pokes
# out): measured and reported, not failed.
EXEMPT_CHAR = {('goblin', 'swing', 'R')}


def arm_clip_all(limit=0.02, joint_limit=0.04, who=None):
    """Every character in every pose: {character: {pose: {side: {limb, joint}}}} plus 'fails', the poses where an arm
    cuts deeper than `limit` into the body (`joint_limit` at the shoulder root)."""
    out, fails = {}, []
    want = lambda n: who is None or n in who

    def check(name, build, kinds):
        rep = {}
        for pose, offs in pose_list(kinds):
            scene = build()
            pose_scene(scene, offs)
            r = arm_clip(scene)
            rep[pose] = r
            for side, w in r.items():
                if (pose.startswith('bow'), side) in EXEMPT or (name, pose.split('@')[0], side) in EXEMPT_CHAR:
                    continue
                if w['limb'][0] > limit or w['joint'][0] > joint_limit:
                    fails.append(f'{name} {pose} {side}: {w}')
        out[name] = rep

    if any(want(f'hero:{k}') for k in HERO_CLIP_SETS):
        gp = os.path.join(_ROOT, 'tools', 'blender', 'gear.py')
        g = {'DB_RUN': False, '__name__': 'db_gear', '__file__': gp}
        exec(open(gp, encoding='utf-8').read(), g)
        vp = os.path.join(_ROOT, 'tools', 'blender', 'plate_variants.py')
        v = {'__name__': 'db_plate', '__file__': vp}
        exec(open(vp, encoding='utf-8').read(), v)
        built = set()
        for label, models in HERO_CLIP_SETS.items():
            if not want(f'hero:{label}'):
                continue
            for mdl in models:
                if mdl.startswith('pv_'):
                    vid = mdl.split('_')[1]
                    if vid not in built:
                        v['build_variant'](vid)
                        built.add(vid)
                elif mdl not in built:
                    g['build'](mdl)
                    built.add(mdl)
            sources = [f'DB_{m}' if m.startswith('pv_') else f'DB_gear_{m}' for m in models]

            def build(sources=sources):
                scene, _ = build_hero('DB_fitcheck')
                dress(scene, sources)
                return scene
            check(f'hero:{label}', build, HERO_KINDS)
    for name, (fn, kinds) in _minion_builders().items():
        if want(name):
            check(name, fn, kinds)
    out['fails'] = fails
    return out
