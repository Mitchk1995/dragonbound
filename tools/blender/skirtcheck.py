"""Legs against what hangs from the hips (never exported): every outfit on the hero and every creature with legs,
posed through the whole stride at every lean the body takes in it and in every attack, the legs tested against every
skirt, flap, tasset, tabard, hem and loincloth over them (fitcheck.py builds and dresses the characters).

    exec(open(os.path.join(os.environ['DRAGONBOUND_ROOT'], 'tools', 'blender', 'skirtcheck.py')).read())
    report = skirt_clip_all()          # every outfit and creature; who={'hero:chain'} for one
"""
import os
import sys

# Repo root: DRAGONBOUND_ROOT, else two levels above this script (when run as a file), else the old fixed path.
_ROOT = os.environ.get('DRAGONBOUND_ROOT') or (os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
                                               if '__file__' in globals() else r'D:\gameplanning')
sys.path.insert(0, os.path.join(_ROOT, 'tools', 'blender'))
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

_p = os.path.join(_ROOT, 'tools', 'blender', 'fitcheck.py')
_f = {'__name__': 'db_fit', '__file__': _p}
exec(open(_p, encoding='utf-8').read(), _f)
build_hero, dress, HELD, _minion_builders = _f['build_hero'], _f['dress'], _f['HELD'], _f['_minion_builders']
_ancestor, _hero_part, _within, _strip = _f['_ancestor'], _f['_hero_part'], _f['_within'], _f['_strip']
anim_pose, pose_scene, stride_poses, STRIDE_STEPS = _f['anim_pose'], _f['pose_scene'], _f['stride_poses'], _f['STRIDE_STEPS']

# ─── Legs against what hangs from the hips ───────────────────────────────────
# The owner never wants a leg showing through what hangs over it: the tunic's skirt, an armour's skirt and its flaps,
# tassets and tabard, a robe's hem or a loincloth. Each leg is tested against everything the body carries but the arms,
# the head and what the hands hold (skirt_clip); only the underside of a hem may meet a leg, which is where the leg
# comes out from under it.

LEGS = ('legL', 'legR')
NOT_HIPS = ('armL', 'armR', 'head') + HELD
RAY = Vector((0.0013, 0.0007, 1.0)).normalized()    # parity rays, turned off every axis so they never run along an edge


def _closed(o):
    """Whether a mesh is a closed solid (every edge shared by two faces); flat details (mail links, stitches) are not."""
    count = {}
    for p in o.data.polygons:
        for k in p.edge_keys:
            count[k] = count.get(k, 0) + 1
    return bool(count) and all(n == 2 for n in count.values())


def _dense_samples(o, step=0.02):
    """Points over every face of o, no more than about `step` apart, with the face's outward normal (world space)."""
    mw = o.matrix_world
    r3 = mw.to_3x3().inverted().transposed()
    me = o.data
    out = []
    for p in me.polygons:
        n = (r3 @ p.normal).normalized()
        vs = [mw @ me.vertices[i].co for i in p.vertices]
        for a, b, c_ in ((vs[0], vs[i], vs[i + 1]) for i in range(1, len(vs) - 1)):
            k = max(1, int(max((b - a).length, (c_ - a).length, (c_ - b).length) / step))
            for i in range(k + 1):
                for j in range(k + 1 - i):
                    u, v = (i + 0.2) / (k + 0.6), (j + 0.2) / (k + 0.6)
                    out.append((a + (b - a) * u + (c_ - a) * v, n))
    return out


def _solids(objs):
    """Closed meshes to test points against, each with its own world-space bounds and BVH (one tree per mesh, so faces
    two meshes share never upset the count of crossings)."""
    out = []
    for o in objs:
        if not _closed(o):
            continue
        mw = o.matrix_world
        vs = [mw @ v.co for v in o.data.vertices]
        lo = Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs)))
        hi = Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs)))
        out.append((o, lo, hi, BVHTree.FromPolygons(vs, [list(p.vertices) for p in o.data.polygons])))
    return out


def _inside(P, solids):
    """The closed meshes of `solids` that P lies inside: an odd number of crossings along RAY."""
    out = []
    for o, lo, hi, tree in solids:
        if not _within(P, lo, hi):
            continue
        n, q = 0, P.copy()
        for _ in range(16):
            loc = tree.ray_cast(q, RAY, 10.0)[0]
            if loc is None:
                break
            n += 1
            q = loc + RAY * 1e-5
        if n % 2:
            out.append(o)
    return out


def _frame_of(o):
    """The frame a piece hangs in: its socket's or rig part's, whose local +Y is up when the character stands."""
    a = o.parent
    while a is not None and not (_strip(a.name).startswith('sock_') or _strip(a.name) in ('body',) + LEGS):
        a = a.parent
    return a or o


def _underside(o, n):
    """Whether a face of piece o with world normal n faces down in the piece's own frame: the underside of a hem."""
    return (_frame_of(o).matrix_world.to_3x3().inverted() @ n).normalized().y < -0.5


def _meet(a, b, pad=0.0):
    """Whether two world-space bounds (lo, hi) overlap (grown by pad)."""
    return all(a[0][k] - pad <= b[1][k] and b[0][k] - pad <= a[1][k] for k in range(3))


def skirt_clip(scene):
    """How far a leg stands out through what hangs from the hips in one pose: (depth, where), or None for a character
    without legs. Wherever the outer surface of a piece (a face turned out, away from the body's upright middle line:
    not the back of a flap, nor a top or the underside of a hem) lies inside a leg, the leg has gone through it there; it
    stands out of the piece as far as the leg runs on past that surface, straight out from the middle line, and it shows
    unless it ends inside another piece (a tunic's skirt under an armour's, say)."""
    bpy.context.view_layer.update()
    meshes = [o for o in scene.objects if o.type == 'MESH' and len(o.data.polygons)]
    legs = _solids([o for o in meshes if _ancestor(o, LEGS)])
    if not legs:
        return None
    reach = max(hi.z for _, _, hi, _ in legs) + 0.05
    hips = _solids([o for o in meshes if not _ancestor(o, LEGS) and not _ancestor(o, NOT_HIPS)
                    and min((o.matrix_world @ Vector(c)).z for c in o.bound_box) < reach])
    body = next(o for o in scene.objects if _strip(o.name) == 'body')
    to_body, turn = body.matrix_world.inverted(), body.matrix_world.to_3x3()

    def out_of(P, n):
        """The way straight out from the middle line at P (world), if the face's normal n turns out that way."""
        q = to_body @ P
        r = Vector((q.x, 0.0, q.z))
        if r.length < 1e-6:
            return None
        r = (turn @ r).normalized()
        return r if n.dot(r) > 0.15 else None
    worst = (0.0, None)
    for leg, llo, lhi, ltree in legs:
        me = [(leg, llo, lhi, ltree)]
        for o, lo, hi, tree in hips:
            if not _meet((llo, lhi), (lo, hi)) or not ltree.overlap(tree):
                continue
            for P, n in _dense_samples(o, 0.015):
                if not _within(P, llo, lhi) or _underside(o, n):
                    continue
                r = out_of(P, n)
                if r is None or not _inside(P, me):
                    continue
                hit = ltree.ray_cast(P, r, 1.0)
                if hit[0] is None or hit[3] <= worst[0] or _inside(hit[0] + r * 0.002, hips):
                    continue
                at = tuple(round(c_, 2) for c_ in (hit[0].x, hit[0].z, -hit[0].y))
                worst = (round(hit[3], 3), f'{_hero_part(leg)} out through {_hero_part(o)} at {at}')
    return worst


# Every outfit's body piece on the hero (the skirt hangs from it), as the fit sets wear them.
SKIRT_SETS = {'tunic': [], 'chain': ['body_chain'], 'leather': ['body_leather'], 'plate': ['body_plate'],
              'plate_p': ['pv_p_body_plate'], 'plate_e': ['pv_e_body_plate'], 'wyrmbone': ['u_wyrmbone']}
HERO_ATTACKS = ('swing', 'slam', 'cast', 'bow')


def skirt_clip_all(limit=0.0, steps=STRIDE_STEPS, who=None):
    """Every outfit on the hero and every creature with legs, through the whole stride at every lean and in every
    attack: {name: (depth, where, pose, poses checked)} plus 'fails', where a leg stands out of anything hanging over it
    by more than `limit`. Town NPCs never walk: they are checked standing."""
    out, fails = {}, []
    want = lambda n: who is None or n in who

    def check(name, scene, poses):
        if name.startswith('hero:'):
            # Everything the hero wears on the hips must be a closed solid, or the check would pass over it (only
            # flat details lying on a surface, mail links and stitches, are not).
            for o in scene.objects:
                if o.type == 'MESH' and _ancestor(o, ('sock_hips',)) and not _strip(o.name).startswith(('mail_link', 'stitch')) \
                        and not _closed(o):
                    fails.append(f'{name}: {_hero_part(o)} on the hips is not a closed solid')
        worst = (0.0, None, None)
        for pose, offs in poses:
            pose_scene(scene, offs)
            r = skirt_clip(scene)
            if r is None:
                if name.startswith('hero:'):
                    fails.append(f'{name}: no legs to check')
                out[name] = 'no legs'
                return
            if r[0] > worst[0]:
                worst = (*r, pose)
        out[name] = (*worst, len(poses))
        if worst[0] > limit:
            fails.append(f'{name}: {worst}')

    if any(want(f'hero:{k}') for k in SKIRT_SETS):
        gp = os.path.join(_ROOT, 'tools', 'blender', 'gear.py')
        g = {'DB_RUN': False, '__name__': 'db_gear', '__file__': gp}
        exec(open(gp, encoding='utf-8').read(), g)
        vp = os.path.join(_ROOT, 'tools', 'blender', 'plate_variants.py')
        v = {'__name__': 'db_plate', '__file__': vp}
        exec(open(vp, encoding='utf-8').read(), v)
        for label, models in SKIRT_SETS.items():
            if not want(f'hero:{label}'):
                continue
            for mdl in models:
                if mdl.startswith('pv_'):
                    v['build_piece'](mdl.split('_')[1], mdl.split('_', 2)[2])
                else:
                    g['build'](mdl)
            scene, _ = build_hero('DB_fitcheck')
            missing = dress(scene, [f'DB_{m}' if m.startswith('pv_') else f'DB_gear_{m}' for m in models])
            if missing:
                fails.append(f'hero:{label}: sockets the hero lacks: {missing}')
            check(f'hero:{label}', scene, stride_poses(HERO_ATTACKS, 'side', steps))
    for name, (fn, kinds, hold) in _minion_builders().items():
        if want(name):
            check(name, fn(), stride_poses(kinds, hold, steps) if name not in ('warden', 'quartermaster')
                  else [('idle', anim_pose(hold=hold))])
    out['fails'] = fails
    return out
