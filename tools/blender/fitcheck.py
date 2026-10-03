"""Fit check (never exported): dress the base hero with gear/hair scenes the way the game does.

The game moves every child of a gear file's `sock_X` empty under the hero's `sock_X` with its local
transform unchanged (registry.ts buildGear/attachParts), and takes off the starting outfit's
`outfit_<slot>_*` pieces under the gear that fills that slot (HeroDresser). We do the same with object copies.
Run the builder scripts first so their DB_* scenes exist in this .blend (fit_all() builds them itself).

    exec(open(os.path.join(os.environ['DRAGONBOUND_ROOT'], 'tools', 'blender', 'fitcheck.py')).read())
    fit('plate', ['DB_gear_body_plate', 'DB_gear_longsword'])
    report = fit_all()   # every gear piece on the hero, audited in every pose (plate_variants.py audit)
    report = arm_clip_all()   # arms (and the gear on them) cutting into the body, every character and pose
    report = held_clip_all()  # what the hands carry cutting into the body, every weapon, character and pose
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
from mathutils import Matrix, Quaternion
from mathutils.bvhtree import BVHTree

_p = os.path.join(_ROOT, 'tools', 'blender', 'hero.py')
_g = {'DB_RUN': False, '__name__': 'db_fit', '__file__': _p}
exec(open(_p, encoding='utf-8').read(), _g)
build_hero = _g['build_hero']

_strip = lambda n: re.sub(r'\.\d{3}$', '', n)


def _copy_tree(o, parent, scene, src, sock, turn=None):
    n = o.copy()
    scene.collection.objects.link(n)
    n.parent = parent
    n.matrix_parent_inverse = Matrix.Identity(4)
    n.matrix_basis = turn @ o.matrix_basis if turn else o.matrix_basis.copy()
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


# registry.ts turns blades edge-on in the hand (rotateY(PI / 2) on their sock_handR group), so the edge leads.
BLADES = ('DB_gear_sword', 'DB_gear_longsword', 'DB_gear_u_cinderfang')


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
            turn = Matrix.Rotation(math.pi / 2, 4, 'Y') if name == 'sock_handR' and src in BLADES else None
            for ch in o.children:
                _copy_tree(ch, socks[name], scene, src, name, turn)
    return missing


def fit(label, sources, target=(0, 1.1, 0), dist=4.4, views=((0, 10), (40, 18), (150, 15), (30, 55)), res=384, pose=None):
    """`pose` = {part: (rx, ry, rz)} added to the rig's rest rotation, e.g. {'armR': (-1.57, 0, 0)} (the arm raised
    forward)."""
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
# both walk extremes and the frames of its attacks) and every arm surface (sleeves, hands, the gear riding the arm) is
# tested against every other part of the body (torso, robe, belt, head, legs). Held items and the pauldron tops on the
# shoulder sockets (which cap the arm on purpose) are left out.

IMPACT = 0.55                                  # src/data/tuning.ts COMBAT_TUNING.impact
# src/render/anim.ts, mirrored: keep these in step with it.
FOLLOW = 0.75                                  # SHOULDER_FOLLOW
SPLAY = 0.1                                    # ARM_SPLAY
ELBOW_REST, HOLD_BEND, HOLD_WRIST, SIDE_WRIST = -0.25, -1.57, 0.17, 0.5
BOW_OUT, BOW_CARRY, BOW_PLUMB = 0.2, -0.5, -0.2
WIND_ARM, WIND_ELBOW, SWING_WRIST, STRIKE_ELBOW = 2.6, -1.0, 1.3, -0.15
CAST_ARM, CAST_ELBOW, CAST_WRIST, CAST_REACH = 2.1, -0.1, 0.885, 1.7
BOW_TURN, BOW_HEAD = math.pi / 2, 0.85
BOW_AIM = (-0.807, 0.07, 0.586)
BOW_ROLL = (0, 1, 0.3)
BOW_MID, DRAW_GRAB, DRAW_ANCHOR = 0.15, 1.29, 1.35
BOW_STRING = (1, 0, 0)
DRAW_POLE = (1, 0.1, 0.6)
RELEASE = IMPACT                               # bowDraw.ts
_ease = lambda t: t * t * (3 - 2 * t)
_lerp = lambda a, b, t: a + (b - a) * t


def draw_amount(a):
    """bowDraw.ts bowDrawAmount."""
    if a < 0:
        return 0.0
    if a < RELEASE:
        return _ease(max(0.0, (a - 0.12) / (RELEASE - 0.12)))
    return max(0.0, 1 - (a - RELEASE) / 0.06)


def hold_of(weapon):
    """registry.ts holdOf: how the hero's right hand carries a weapon model (anim.ts Hold)."""
    if not weapon:
        return 'empty'
    if weapon.startswith('bow_') or weapon == 'u_emberstring':
        return 'bow'
    return 'upright' if weapon.startswith('staff_') or weapon == 'u_kindled_ash' else 'side'


def anim_pose(kind=None, a=-1.0, sw=0.0, hold='empty'):
    """anim.ts Rig.update for a humanoid: rotation offsets {part: (x, y, z)} for the walk phase sw (sin of the stride,
    at full speed) and attack `kind` at progress a (-1: none), the right hand carrying in `hold`, and 'lift', how far
    the body (arms, torso and head; the legs hang from the root) rises in the stride. The bow shot's arms are placed
    by pose_scene (anim.ts bowPose), which this marks with 'bow': a."""
    move = 1.0 if sw else 0.0
    fore, bow = hold in ('upright', 'bow'), hold == 'bow'     # the forearm level and forward; a bow out from the body
    swl, swr = -sw * 0.5 * move, sw * (0.15 if fore else 0.3) * move
    p = {'body': (0.08 * move, 0, 0), 'lift': abs(sw) * 0.06 * move,
         'armL': (swl, 0, SPLAY), 'armR': (swr, 0, -SPLAY - (BOW_OUT if bow else 0)),
         'legL': (sw * 0.7 * move, 0, 0), 'legR': (-sw * 0.7 * move, 0, 0),
         'elbowL': (ELBOW_REST + min(0, swl) * 0.5, 0, 0),
         'elbowR': (HOLD_BEND - swr if fore else ELBOW_REST + min(0, swr) * 0.5, BOW_CARRY if bow else 0, 0),
         'handL': (0, 0, 0),
         'handR': (SIDE_WRIST - swr if hold == 'side' else HOLD_WRIST if hold == 'upright' else 0, BOW_PLUMB if bow else 0, 0)}
    if a < 0 or kind is None:
        return p
    e0 = HOLD_BEND if fore else ELBOW_REST
    w0 = SIDE_WRIST if hold == 'side' else HOLD_WRIST if hold == 'upright' else 0
    if kind == 'swing':
        up, down = IMPACT - 0.1, IMPACT + 0.1
        if a < up:
            k = _ease(a / up)
            x, e = -WIND_ARM * k, _lerp(e0, WIND_ELBOW, k)
        elif a < down:
            k = _ease((a - up) / (down - up))
            x, e = -WIND_ARM + (WIND_ARM - 0.35) * k, _lerp(WIND_ELBOW, STRIKE_ELBOW, k)
        else:
            k = _ease((a - down) / (1 - down))
            x, e = -0.35 * (1 - k), _lerp(STRIKE_ELBOW, e0, k)
        w = _lerp(w0, SWING_WRIST, _ease(min(1, a / up))) if a < IMPACT else _lerp(SWING_WRIST, w0, _ease((a - IMPACT) / (1 - IMPACT)))
        p['armR'], p['elbowR'], p['handR'] = (x, 0, -SPLAY), (e, 0, 0), (w, 0, 0)
        p['body'] = (-0.1, 0.3 * _ease(a / up), 0) if a < up else (0.15, -0.3 * (1 - a), 0)
    elif kind == 'slam':
        lift = _ease(a / IMPACT) if a < IMPACT else 1 - _ease((a - IMPACT) / (1 - IMPACT))
        x = -3.0 * _ease(a / IMPACT) if a < IMPACT else -3.0 + 2.8 * _ease((a - IMPACT) / (1 - IMPACT))
        p['armR'], p['armL'] = (x, 0, -SPLAY), (x, 0, SPLAY)
        p['elbowR'], p['elbowL'] = (_lerp(e0, -0.5, lift), 0, 0), (_lerp(ELBOW_REST, -0.5, lift), 0, 0)
        p['body'] = (-0.2 if a < IMPACT else 0.25, 0, 0)
    elif kind == 'bow':
        p['bow'] = a
        p['head'] = (0, -BOW_TURN * BOW_HEAD * _ease(min(1, a / 0.2)), 0)
    elif kind == 'cast':
        lift = _ease(a / IMPACT) if a < IMPACT else 1 - _ease((a - IMPACT) / (1 - IMPACT))
        p['armR'], p['elbowR'], p['handR'] = (-CAST_ARM * lift, 0, -SPLAY), (_lerp(e0, CAST_ELBOW, lift), 0, 0), (_lerp(w0, CAST_WRIST, lift), 0, 0)
        p['armL'], p['elbowL'] = (-CAST_REACH * lift, 0, SPLAY), (_lerp(ELBOW_REST, -0.35, lift), 0, 0)
        p['body'] = (-0.1 * lift, 0, 0)
    elif kind == 'throw':
        x = -2.6 * _ease(a / IMPACT) if a < IMPACT else -2.6 + 2.0 * _ease((a - IMPACT) / (1 - IMPACT))
        e = _lerp(e0, -1.1, _ease(a / IMPACT)) if a < IMPACT else _lerp(-1.1, e0, _ease((a - IMPACT) / (1 - IMPACT)))
        p['armR'], p['elbowR'] = (x, 0, 0), (e, 0, 0)
    return p


# The frames each attack is checked at: wind-up, impact and follow-through (the bow: taking the string, mid-draw, full
# draw and after the release). The bow coming up from the carry (before 0.2) is a quick blend, not checked: in it the
# draw arm's shoulder dips up to 0.075 into the chest, under the shoulder cap.
ATTACK_FRAMES = {'swing': (0.36, 0.45, 0.55, 0.67), 'slam': (0.45, 0.6), 'cast': (0.4, 0.55, 0.8), 'throw': (0.36, 0.55),
                 'bow': (0.2, 0.35, 0.5, 0.8)}


def pose_list(kinds, hold='empty'):
    out = [('idle', anim_pose(hold=hold)), ('walk+', anim_pose(sw=1.0, hold=hold)), ('walk-', anim_pose(sw=-1.0, hold=hold))]
    for k in kinds:
        out += [(f'{k}@{a}', anim_pose(k, a, hold=hold)) for a in ATTACK_FRAMES[k]]
    return out


def _quat(o):
    return o.rotation_quaternion.copy() if o.rotation_mode == 'QUATERNION' else o.rotation_euler.to_quaternion()


def _set_quat(o, q):
    o.rotation_mode = 'QUATERNION'
    o.rotation_quaternion = q


def _basis(x, y, z):
    """Rotation with local axes x, y, z (body space)."""
    return Matrix((x, y, z)).transposed().to_quaternion()


def _body_space(parts, o):
    bpy.context.view_layer.update()
    return parts['body'].matrix_world.inverted() @ o.matrix_world


def _point_arm(arm, d, front, k):
    """anim.ts Rig.pointArm."""
    y = -d.normalized()
    z = (front - y * front.dot(y)).normalized()
    _set_quat(arm, _quat(arm).slerp(_basis(y.cross(z), y, z), k))


def _reach(parts, side, target, pole, k):
    """anim.ts Rig.reach."""
    arm, elbow, hand = parts[f'arm{side}'], parts[f'elbow{side}'], parts[f'hand{side}']
    sock = parts['sock_handL' if side == 'L' else 'sock_gloveR']
    l1, l2 = elbow.location.length, (hand.location + sock.location).length
    to_t = target - Vector(arm['rest_loc'])
    dist = min(max(to_t.length, abs(l1 - l2) + 1e-3), l1 + l2 - 1e-3)
    t_dir = to_t.normalized()
    cos_b = min(1.0, max(-1.0, (l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist)))
    out = (pole - t_dir * pole.dot(t_dir)).normalized()
    u = t_dir * cos_b + out * math.sqrt(1 - cos_b * cos_b)
    f = (t_dir * dist - u * l1).normalized()
    bend = math.acos(min(1.0, max(-1.0, u.dot(f))))
    z = (f - u * f.dot(u)).normalized()
    y = -u
    _set_quat(arm, _quat(arm).slerp(_basis(y.cross(z), y, z), k))
    e = elbow.rotation_euler
    elbow.rotation_euler = (_lerp(e[0], elbow['rest_rot'][0] - bend, k), e[1], e[2])


def _orient_hand(parts, side, axis, along, k):
    """anim.ts Rig.orientHand."""
    hand = parts[f'hand{side}']
    fore = _body_space(parts, hand.parent).to_quaternion()
    if along is not None:
        z = axis.normalized()
        y = (along - z * along.dot(z)).normalized()
    else:
        y = fore @ Vector((0, 1, 0))
        z = (axis - y * axis.dot(y)).normalized()
    want = _basis(y.cross(z), y, z)
    _set_quat(hand, _quat(hand).slerp(fore.inverted() @ want, k))


def bow_pose(parts, a):
    """anim.ts Rig.bowPose (the body's own turn is left out: it moves nothing relative to the body)."""
    raise_ = _ease(min(1, a / 0.2))
    if not all(n in parts for n in ('body', 'armR', 'armL', 'elbowL', 'handL', 'handR', 'sock_handR')):
        return
    _point_arm(parts['armR'], Vector(BOW_AIM), Vector(BOW_ROLL), raise_)
    er = parts['elbowR']
    er.rotation_euler = (er['rest_rot'][0] + _lerp(HOLD_BEND, 0, raise_), er['rest_rot'][1] + _lerp(BOW_CARRY, 0, raise_),
                         er.rotation_euler[2])
    _orient_hand(parts, 'R', Vector((0, 1, 0)), Vector((0, 0, -1)), raise_)
    s = _body_space(parts, parts['sock_handR'])
    target = s @ Vector((0, BOW_MID, 0))
    back = (s.to_3x3() @ Vector(BOW_STRING)).normalized()
    target += back * _lerp(DRAW_GRAB, DRAW_ANCHOR, draw_amount(a) if a < IMPACT else 1)
    _reach(parts, 'L', target, Vector(DRAW_POLE).normalized(), raise_)
    s = _body_space(parts, parts['sock_handR'])
    _orient_hand(parts, 'L', s.to_3x3() @ Vector((0, 1, 0)), None, raise_)


def pose_scene(scene, offsets):
    """Rest rotation + offsets on every rig part present, the bow shot's arms (anim.ts bowPose), then the shoulder
    sockets follow their arms (anim.ts followShoulders)."""
    parts = {_strip(o.name): o for o in scene.objects}
    for name in ('armL', 'armR', 'body'):
        if name in parts and parts[name].get('rest_loc') is None:
            parts[name]['rest_loc'] = tuple(parts[name].location)
    if 'body' in parts:
        parts['body'].location = Vector(parts['body']['rest_loc']) + Vector((0, offsets.get('lift', 0.0), 0))
    for name, r in offsets.items():
        o = parts.get(name)
        if o is None or name in ('bow', 'lift'):
            continue
        base = o.get('rest_rot')
        if base is None:
            o['rest_rot'] = base = tuple(o.rotation_euler)
        # three.js Euler order 'XYZ' (Blender 'ZYX'); an elbow's is 'YXZ' (Blender 'ZXY'): it bends, then turns.
        o.rotation_mode = 'ZXY' if name in ('elbowL', 'elbowR') else 'ZYX'
        o.rotation_euler = tuple(b + v for b, v in zip(base, r))
    if 'bow' in offsets:
        bow_pose(parts, offsets['bow'])
    for side in ('L', 'R'):
        arm, sock = parts.get(f'arm{side}'), parts.get(f'sock_shoulder{side}')
        if not arm or not sock or arm.parent is not sock.parent:
            continue
        if sock.get('rest_loc') is None:
            sock['rest_loc'] = tuple(sock.location)
        turn = Quaternion().slerp(_quat(arm), FOLLOW)
        rest = Vector(arm['rest_loc'])
        sock.location = rest + turn @ (Vector(sock['rest_loc']) - rest)
        _set_quat(sock, turn)
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


HELD = ('sock_handR', 'weapon', 'sling', 'sock_shoulderL', 'sock_shoulderR')


def _solid(o):
    """A mesh to test points against: (object, world -> its own space, its own bounds, world-space BVH). Points are
    first checked against its bounds in its own space, so flat details (mail links, decals) never count as solid,
    however they are turned."""
    co = [v.co for v in o.data.vertices]
    lo = Vector((min(v.x for v in co), min(v.y for v in co), min(v.z for v in co)))
    hi = Vector((max(v.x for v in co), max(v.y for v in co), max(v.z for v in co)))
    mw = o.matrix_world
    return o, mw.inverted(), lo, hi, BVHTree.FromPolygons([mw @ v for v in co], [list(p.vertices) for p in o.data.polygons])


def _within(p, lo, hi):
    return lo.x <= p.x <= hi.x and lo.y <= p.y <= hi.y and lo.z <= p.z <= hi.z


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
    solids = [_solid(o) for o in body]
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
                for b, to_local, lo, hi, tree in solids:
                    if not _within(to_local @ P, lo, hi):
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
    """Every humanoid creature and NPC: {name: (builder, attacks, hold)}, the hold as anim.ts reads it from the model
    (a 'staffbody' part: upright; a 'weapon' part: at the side)."""
    mp = os.path.join(_ROOT, 'tools', 'blender', 'minions.py')
    m = {'DB_RUN': False, '__name__': 'db_minions', '__file__': mp}
    exec(open(mp, encoding='utf-8').read(), m)
    npp = os.path.join(_ROOT, 'tools', 'blender', 'npcs.py')
    n = {'DB_RUN': False, '__name__': 'db_npcs', '__file__': npp}
    exec(open(npp, encoding='utf-8').read(), n)
    return {'goblin': (m['goblin'], ('swing',), 'side'), 'kobold': (m['kobold'], ('throw',), 'empty'),
            'cultist': (m['cultist'], ('cast',), 'upright'), 'priest': (m['priest'], ('cast',), 'upright'),
            'warden': (n['warden'], (), 'upright'), 'quartermaster': (n['quartermaster'], (), 'side')}


# The fit sets, and a bow (carried out from the body and drawn) in each kind of armour the fit sets pair with blades.
HERO_CLIP_SETS = {**{k: SETS[k] for k in ('plain', 'chain', 'leather', 'plate', 'plate_p', 'plate_e', 'uniques', 'gloves_only')},
                  'chain_bow': ['body_chain', 'gloves', 'boots', 'bow_worn'],
                  'plate_bow': ['pv_e_body_plate', 'pv_e_gloves', 'pv_e_boots', 'bow_drakebone'],
                  'wyrm_bow': ['u_wyrmbone', 'u_emberstring']}


def hero_kinds(weapon):
    """The attacks the hero makes with a weapon: its style's (combat/stats.ts, data/abilities.ts)."""
    if weapon.startswith('bow_') or weapon == 'u_emberstring':
        return ('bow',)
    if weapon.startswith('staff_') or weapon == 'u_kindled_ash':
        return ('cast',)
    return ('swing', 'slam')


def _weapon(models):
    return next((m for m in models if m.startswith(('sword', 'longsword', 'pickaxe', 'bow_', 'staff_', 'u_cinderfang',
                                                    'u_emberstring', 'u_kindled_ash'))), None)


# The goblin's club arm, raised overhead, passes behind its big wedge ear (the ear is hidden by the arm, nothing pokes
# out): measured and reported, not failed.
EXEMPT_CHAR = {('goblin', 'swing', 'R')}


def arm_clip_all(limit=0.02, joint_limit=0.04, who=None):
    """Every character in every pose: {character: {pose: {side: {limb, joint}}}} plus 'fails', the poses where an arm
    cuts deeper than `limit` into the body (`joint_limit` at the shoulder root)."""
    out, fails = {}, []
    want = lambda n: who is None or n in who

    def check(name, build, kinds, hold):
        rep = {}
        for pose, offs in pose_list(kinds, hold):
            scene = build()
            pose_scene(scene, offs)
            r = arm_clip(scene)
            rep[pose] = r
            for side, w in r.items():
                if (name, pose.split('@')[0], side) in EXEMPT_CHAR:
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
            weapon = _weapon(models)
            check(f'hero:{label}', build, hero_kinds(weapon), hold_of(weapon))
    for name, (fn, kinds, hold) in _minion_builders().items():
        if want(name):
            check(name, fn, kinds, hold)
    out['fails'] = fails
    return out


# ─── Held things against the body ────────────────────────────────────────────
# What a hand carries runs through the hand's hole and may touch that hand; it must not cut into anything else: a bow's
# limbs into the striding leg, a staff into the robe, a sword's pommel into the forearm. Every hero weapon (in the
# starting outfit and in plate) and every creature's held thing, in every pose of pose_list. The bow's string is the
# model's static one (the game's follows the draw hand, through its hole).

HERO_WEAPONS = ('sword', 'longsword', 'pickaxe', 'u_cinderfang', 'bow_worn', 'bow_hunter', 'bow_recurve', 'bow_drakebone',
                'u_emberstring', 'staff_apprentice', 'staff_oak', 'staff_runed', 'staff_ember', 'u_kindled_ash')
HELD_ITEMS = ('sock_handR', 'weapon', 'sling')


def held_clip(scene):
    """How deep what the right hand carries cuts into the rest of the character (the hand holding it left out):
    (depth, where)."""
    bpy.context.view_layer.update()
    meshes = [o for o in scene.objects if o.type == 'MESH' and len(o.data.polygons)]
    held = [o for o in meshes if _ancestor(o, HELD_ITEMS)]
    rest = [o for o in meshes if not _ancestor(o, HELD_ITEMS) and not _ancestor(o, ('handR',))]
    points = []
    for o in held:
        mw = o.matrix_world
        points += [mw @ v.co for v in o.data.vertices] + [mw @ p.center for p in o.data.polygons]
    worst = (0.0, None)
    ray = Vector((1, 0.0013, 0.0007))
    for b, to_local, lo, hi, tree in map(_solid, rest):
        for P in points:
            if not _within(to_local @ P, lo, hi):
                continue
            loc, nor, _, d = tree.find_nearest(P)
            if loc is None or (P - loc).dot(nor) >= -1e-4 or d <= worst[0]:
                continue
            hits, q = 0, P.copy()                     # inside a closed mesh: an odd number of crossings out
            for _ in range(16):
                h = tree.ray_cast(q, ray, 5)
                if h[0] is None:
                    break
                hits += 1
                q = h[0] + ray * 1e-4
            if hits % 2:
                worst = (round(d, 3), _hero_part(b))
    return worst


def held_clip_all(limit=0.03, who=None):
    """Every hero weapon and every creature's held thing in every pose: {name: {pose: (depth, where)}} plus 'fails', the
    poses where it cuts deeper than `limit` into the character."""
    out, fails = {}, []
    want = lambda n: who is None or n in who

    def check(name, build, kinds, hold):
        rep = {}
        for pose, offs in pose_list(kinds, hold):
            scene = build()
            pose_scene(scene, offs)
            rep[pose] = held_clip(scene)
            if rep[pose][0] > limit:
                fails.append(f'{name} {pose}: {rep[pose]}')
        out[name] = rep

    gp = os.path.join(_ROOT, 'tools', 'blender', 'gear.py')
    g = {'DB_RUN': False, '__name__': 'db_gear', '__file__': gp}
    exec(open(gp, encoding='utf-8').read(), g)
    vp = os.path.join(_ROOT, 'tools', 'blender', 'plate_variants.py')
    v = {'__name__': 'db_plate', '__file__': vp}
    exec(open(vp, encoding='utf-8').read(), v)
    plate = [f'DB_pv_p_{piece}' for piece in ('body_plate', 'gloves', 'boots')]
    built = False
    for weapon in HERO_WEAPONS:
        for outfit, extra in (('plain', []), ('plate', plate)):
            name = f'hero:{weapon}:{outfit}'
            if not want(name):
                continue
            if extra and not built:
                v['build_variant']('p')
                built = True
            if f'DB_gear_{weapon}' not in bpy.data.scenes:
                g['build'](weapon)

            def build(sources=[f'DB_gear_{weapon}'] + extra):
                scene, _ = build_hero('DB_fitcheck')
                dress(scene, sources)
                return scene
            check(name, build, hero_kinds(weapon), hold_of(weapon))
    for name, (fn, kinds, hold) in _minion_builders().items():
        if want(name):
            check(name, fn, kinds, hold)
    out['fails'] = fails
    return out
