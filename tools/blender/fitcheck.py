"""Fit check (never exported): dress the base hero with gear/hair scenes the way the game does.

The game moves every child of a gear file's `sock_X` empty under the hero's `sock_X` with its local
transform unchanged (registry.ts buildGear/attachParts), and takes off the starting outfit's
`outfit_<slot>_*` pieces under the gear that fills that slot (HeroDresser). We do the same with object copies.
Run the builder scripts first so their DB_* scenes exist in this .blend (fit_all() builds them itself).

    exec(open(os.path.join(os.environ['DRAGONBOUND_ROOT'], 'tools', 'blender', 'fitcheck.py')).read())
    fit('plate', ['DB_gear_body_plate', 'DB_gear_longsword'])
    report = fit_all()   # every gear piece on the hero, audited in every pose (plate_variants.py audit)
    report = fit_all(body=True)   # the same on a plain figure built on the minifigure body every humanoid shares
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
import animpose
importlib.reload(animpose)
from animpose import *
from animpose import _strip
from mathutils import Matrix
from mathutils.bvhtree import BVHTree

_p = os.path.join(_ROOT, 'tools', 'blender', 'hero.py')
_g = {'DB_RUN': False, '__name__': 'db_fit', '__file__': _p}
exec(open(_p, encoding='utf-8').read(), _g)
build_hero = _g['build_hero']
import minifig
importlib.reload(minifig)


def build_body(scene_name='DB_fitcheck'):
    """A plain figure on the minifigure body (minifig.py) with the hero's legs and head, dressable as the hero is."""
    f = minifig.figure(scene_name, legs='normal', dressable=True)
    return f.scene, f.root


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


def fit_all(poses=('idle', 'walk', 'windup', 'slam', 'cast'), render=False, body=False):
    """Build every gear model, dress the hero (or, with `body`, a plain figure on the minifigure body) in each set and
    audit it in every pose with plate_variants.py's numeric checks: hero surface poking out through gear (hero_pokes)
    and, at rest, gear touching nothing (floating). Returns {set: {pose: report}} plus the sockets any piece missed."""
    build = build_body if body else build_hero
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
            scene, root = build('DB_fitcheck')
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
# The owner: "the arms might be clipping to the sides". Every character is posed exactly as anim.ts poses it
# (animpose.py: idle, both walk extremes and the frames of its attacks) and every arm surface (sleeves, hands, the gear
# riding the arm) is tested against every other part of the body (torso, robe, belt, head, legs). Held items and the
# pauldron tops on the shoulder sockets (which cap the arm on purpose) are left out.


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


RAY = Vector((1, 0.0013, 0.0007))


def _crossed_odd(tree, P):
    """Whether P is inside a closed mesh: a ray out from it crosses the surface an odd number of times. The nearest
    surface facing away from a point is not enough on its own: under a cloth shell (a mantle, a hood) the nearest
    surface is the cloth's inner face, though the point is outside the cloth."""
    hits, q = 0, P.copy()
    for _ in range(16):
        h = tree.ray_cast(q, RAY, 5)
        if h[0] is None:
            break
        hits += 1
        q = h[0] + RAY * 1e-4
    return hits % 2 == 1


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
                    if loc is not None and (P - loc).dot(nor) < -1e-4 and dist > deep and _crossed_odd(tree, P):
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
    for b, to_local, lo, hi, tree in map(_solid, rest):
        for P in points:
            if not _within(to_local @ P, lo, hi):
                continue
            loc, nor, _, d = tree.find_nearest(P)
            if loc is None or (P - loc).dot(nor) >= -1e-4 or d <= worst[0]:
                continue
            if _crossed_odd(tree, P):
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
