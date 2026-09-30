"""Fit check (never exported): dress the base hero with gear/hair scenes the way the game does.

The game moves every child of a gear file's `sock_X` empty under the hero's `sock_X` with its local
transform unchanged (registry.ts buildGear/attachParts). We do the same with object copies.
Run the builder scripts first so their DB_* scenes exist in this .blend.

    exec(open(r'D:\\gameplanning\\tools\\blender\\fitcheck.py').read())
    fit('plate', ['DB_gear_body_plate', 'DB_gear_longsword'])
"""
import re
import sys

sys.path.insert(0, r'D:\gameplanning\tools\blender')
import importlib
import _common
importlib.reload(_common)
from _common import *
from mathutils import Matrix

_g = {'DB_RUN': False, '__name__': 'db_fit'}
exec(open(r'D:\gameplanning\tools\blender\hero.py').read(), _g)
build_hero = _g['build_hero']

_strip = lambda n: re.sub(r'\.\d{3}$', '', n)


def _copy_tree(o, parent, scene):
    n = o.copy()
    scene.collection.objects.link(n)
    n.parent = parent
    n.matrix_parent_inverse = Matrix.Identity(4)
    n.matrix_basis = o.matrix_basis.copy()
    for ch in o.children:
        _copy_tree(ch, n, scene)


def dress(scene, sources):
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
                _copy_tree(ch, socks[name], scene)
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
