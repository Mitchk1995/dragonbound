"""Fit check (never exported): dress the base hero with gear/hair scenes the way the game does.

The game moves every child of a gear file's `sock_X` empty under the hero's `sock_X` with its local
transform unchanged (registry.ts buildGear/attachParts), and takes off the starting outfit's
`outfit_<slot>_*` pieces under the gear that fills that slot (HeroDresser). We do the same with object copies.
Run the builder scripts first so their DB_* scenes exist in this .blend (fit_all() builds them itself).

    exec(open(os.path.join(os.environ['DRAGONBOUND_ROOT'], 'tools', 'blender', 'fitcheck.py')).read())
    fit('plate', ['DB_gear_body_plate', 'DB_gear_longsword'])
    report = fit_all()   # every gear piece on the hero, audited in every pose (plate_variants.py audit)
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
from mathutils import Matrix

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
