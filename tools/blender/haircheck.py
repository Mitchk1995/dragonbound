"""Hair and beard fit audit (never exported): every hair style and beard (hair.py) on the hero as the game wears them,
measured for clipping.

    exec(open(os.path.join(os.environ['DRAGONBOUND_ROOT'], 'tools', 'blender', 'haircheck.py')).read())
    report = hair_clip_all()                 # every style, headgear, armour, weapon and pose
    report = hair_clip_all(['beard_2'])      # one style

Two checks:
- on the head, under each headgear that shows it (registry.ts HeroDresser: the open helm hides the hair, the full helm
  hides hair and beard, the Ashen Crown hides neither; every tier of a helm is the same model): how deep the piece runs
  into the head, the ears and the brows, and whether it comes out through the headgear (hair pressed in under a band,
  inside its walls, is covered by it and fine);
- on the hero in every body armour with each kind of weapon, posed as anim.ts poses him (animpose.py pose_list: idle,
  both walk extremes and the frames of each attack, the bow shot's head turn included; and thrown back by a hit, the
  body leaning back over the hips), the tied style's tail swung as the game swings it (animpose.py ponytail): how deep
  the piece runs into anything that moves apart from the head (the body, its armour, the arms and gloves, and what the
  hands carry), and how deep the tail runs into the head and the rest of the hair. The bow shot turns the head a quarter
  round inside the collar, so there the head's own corners are measured too, to compare.
A sample counts as inside a part only if a ray out from it crosses that part an odd number of times (fitcheck.py).
The strip along the moulding's edge, tucked under the skin on purpose (hair_cage.TUCK), is left out of both.
"""
import os
import re
import sys

# Repo root: DRAGONBOUND_ROOT, else two levels above this script (when run as a file), else the old fixed path.
_ROOT = os.environ.get('DRAGONBOUND_ROOT') or (os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
                                               if '__file__' in globals() else r'D:\gameplanning')
sys.path.insert(0, os.path.join(_ROOT, 'tools', 'blender'))
import bpy
from mathutils import Vector


def _load(name):
    p = os.path.join(_ROOT, 'tools', 'blender', name)
    g = {'DB_RUN': False, '__name__': f'db_{name[:-3]}', '__file__': p}
    exec(open(p, encoding='utf-8').read(), g)
    return g


_fit = _load('fitcheck.py')
_strip = lambda n: re.sub(r'\.\d{3}$', '', n)
_samples, _ancestor = _fit['_surface_samples'], _fit['_ancestor']

STYLES = ('hair_1', 'hair_2', 'hair_3', 'hair_4', 'beard_1', 'beard_2', 'beard_3')
# Headgear that leaves each kind of piece showing (registry.ts HAIR_HIDDEN_BY).
HEADGEAR = {'hair': (None, 'u_ashen_crown'), 'beard': (None, 'helm_open', 'u_ashen_crown')}
# Every body the hero can wear (the starting outfit, each body armour) with a weapon of each kind.
BODIES = (None, 'body_chain', 'body_leather', 'pv_p_body_plate', 'pv_e_body_plate', 'u_wyrmbone')
WEAPONS = ('sword', 'staff_apprentice', 'bow_worn')


def _scene_of(model):
    return f'DB_{model}' if model.startswith('pv_') else f'DB_gear_{model}'


def _build_sources(models):
    """Build every gear scene the audit dresses the hero in (gear.py, plate_variants.py), once."""
    g, v, built = None, None, set()
    for m in models:
        if not m or _scene_of(m) in bpy.data.scenes:
            continue
        if m.startswith('pv_'):
            v = v or _load('plate_variants.py')
            vid = m.split('_')[1]
            if vid not in built:
                v['build_variant'](vid)
                built.add(vid)
        else:
            g = g or _load('gear.py')
            g['build'](m)


def _deepest(points, solids):
    """The deepest any point runs inside any solid: (depth, the solid's label)."""
    worst = (0.0, None)
    for P in points:
        for o, to_local, lo, hi, tree in solids:
            if not _fit['_within'](to_local @ P, lo, hi):
                continue
            loc, nor, _, d = tree.find_nearest(P)
            if loc is None or (P - loc).dot(nor) >= -1e-4 or d <= worst[0]:
                continue
            if _fit['_crossed_odd'](tree, P):
                worst = (d, _fit['_hero_part'](o) + '/' + _strip(o.name))
    return worst


def _piece(scene, style):
    """The hair or beard meshes in a dressed scene (copied from the style's scene: their 'pv' is its scene)."""
    return [o for o in scene.objects if o.type == 'MESH' and o.get('pv') == f'DB_{style}']


def _head_parts(scene):
    """The meshes riding the head: the head, ears, eyes and brows, the headgear and the piece itself."""
    return [o for o in scene.objects if o.type == 'MESH' and len(o.data.polygons) and _ancestor(o, ('head',))]


EDGE_BAND = 0.015   # the moulding's edge is tucked under the skin (hair_cage.TUCK): samples this near it are left out


def _away_from_edge(piece, pts, step=0.003):
    """The samples further than EDGE_BAND from the piece's open edge (where it is tucked into the skin on purpose)."""
    from mathutils.kdtree import KDTree
    edge = []
    for o in piece:
        mw, me = o.matrix_world, o.data
        count = {}
        for p in me.polygons:
            for k in p.edge_keys:
                count[k] = count.get(k, 0) + 1
        for (a, b), n in count.items():
            if n != 1:
                continue
            pa, pb = mw @ me.vertices[a].co, mw @ me.vertices[b].co
            k = max(1, int((pb - pa).length / step))
            edge += [pa.lerp(pb, t / k) for t in range(k + 1)]       # (points all along the edge, not just its corners)
    if not edge:
        return pts
    tree = KDTree(len(edge))
    for i, p in enumerate(edge):
        tree.insert(p, i)
    tree.balance()
    return [P for P in pts if tree.find(P)[2] > EDGE_BAND]


POKE = 0.03        # hair this close beyond the headgear's outer surface has come out through it


def _through(points, gear, axis):
    """How far the hair comes out through the headgear `gear` (meshes): a point whose level line in from the head's
    upright axis (`axis`: a point on it and its direction) crosses the headgear's surface an even, nonzero number of
    times lies outside it, and if it lies no more than POKE beyond the last crossing, the hair surface has come out
    through the headgear there (a point inside the headgear's walls is covered by them; one well beyond it, behind a
    horn, is not touching it). (depth, where)."""
    from mathutils.bvhtree import BVHTree
    verts, polys, owner = [], [], []
    for o in gear:
        mw, base = o.matrix_world, len(verts)
        verts += [mw @ v.co for v in o.data.vertices]
        for p in o.data.polygons:
            polys.append([base + i for i in p.vertices])
            owner.append(o)
    tree = BVHTree.FromPolygons(verts, polys)
    origin, up = axis
    worst = (0.0, None)
    for P in points:
        foot = origin + up * (P - origin).dot(up)
        d = P - foot
        if d.length < 1e-6:
            continue
        u, far, crossings, last, q = d.normalized(), d.length, 0, None, foot.copy()
        for _ in range(12):
            hit = tree.ray_cast(q, u, far - (q - foot).length)
            if hit[0] is None:
                break
            crossings, last = crossings + 1, hit
            q = hit[0] + u * 1e-5
        if crossings and crossings % 2 == 0:
            depth = (P - last[0]).length
            if worst[0] < depth <= POKE:
                worst = (depth, _strip(owner[last[2]].name))
    return worst


def head_fit(style, helm=None):
    """The style on the resting hero under `helm` (a gear model or None): how deep it runs into the head (its tucked
    edge left out), how deep into the headgear (covered by it: hidden) and how far it stands out through the headgear
    (showing through it). {'head': ..., 'helm': ..., 'through': ...}, each (depth, where)."""
    scene, _ = _fit['build_hero']('DB_haircheck')
    _fit['dress'](scene, [f'DB_{style}'] + ([_scene_of(helm)] if helm else []))
    bpy.context.view_layer.update()
    piece = _piece(scene, style)
    pts = [P for o in piece for P in _samples(o)]
    others = [o for o in _head_parts(scene) if o not in piece]
    gear = [o for o in others if 'pv' in o]
    head = [o for o in others if 'pv' not in o]
    sock = next(o for o in scene.objects if _strip(o.name) == 'sock_head').matrix_world
    axis = (sock.translation, (sock.to_3x3() @ Vector((0, 1, 0))).normalized())
    return {'head': _deepest(_away_from_edge(piece, pts), [_fit['_solid'](o) for o in head]),
            'helm': _deepest(pts, [_fit['_solid'](o) for o in gear]) if gear else (0.0, None),
            'through': _through(pts, gear, axis) if gear else (0.0, None)}


def poses(weapon):
    """The poses the hero takes with `weapon`: animpose.py pose_list, and thrown back by a hit, standing and mid-stride."""
    hold = _fit['hold_of'](weapon)
    hurt = [('stand hurt', _fit['anim_pose'](hold=hold, hurt=1.0))]
    hurt += [(f'walk hurt{"+" if sw > 0 else "-"}', _fit['anim_pose'](sw=sw, hold=hold, hurt=1.0)) for sw in (1.0, -1.0)]
    return _fit['pose_list'](_fit['hero_kinds'](weapon) if weapon else (), hold) + hurt


def posed_fit(style, body=None, weapon=None):
    """The style on the hero in `body` armour with `weapon`, in every pose (poses): {pose: (depth, where)} for the
    piece in anything not riding the head; 'tail <pose>' for the tied style's tail in the head and the rest of the hair;
    and, in the bow shot, 'head <pose>' for the head's own corners in the parts the piece is measured against (the bow
    shot turns the head inside the collar)."""
    scene, _ = _fit['build_hero']('DB_haircheck')
    _fit['dress'](scene, [f'DB_{style}'] + [_scene_of(m) for m in (body, weapon) if m])
    out = {}
    for pose, offs in poses(weapon):
        _fit['pose_scene'](scene, offs)
        meshes = [o for o in scene.objects if o.type == 'MESH' and len(o.data.polygons)]
        piece = _piece(scene, style)
        rest = [o for o in meshes if not _ancestor(o, ('head',))]
        solids = [_fit['_solid'](o) for o in rest]
        # (The edge tucked under the skin is inside the head, and inside whatever the head itself sinks into: left out.)
        out[pose] = _deepest(_away_from_edge(piece, [P for o in piece for P in _samples(o)]), solids)
        tail = [o for o in piece if _ancestor(o, ('ponytail',))]
        if tail:
            # The tail into the head, and the rest of the hair into the tail (a closed solid; the rest is an open shell).
            skull = [o for o in _head_parts(scene) if 'pv' not in o]
            cap = [o for o in piece if o not in tail]
            into_head = _deepest([P for o in tail for P in _samples(o)], [_fit['_solid'](o) for o in skull])
            into_tail = _deepest(_away_from_edge(cap, [P for o in cap for P in _samples(o)]), [_fit['_solid'](o) for o in tail])
            out[f'tail {pose}'] = max(into_head, into_tail, key=lambda x: x[0])
        if pose.startswith('bow'):
            # The head's own corners in the same parts (the neck, which runs up inside the head, left out).
            skull = [o for o in meshes if _ancestor(o, ('head',)) and o not in piece and 'pv' not in o]
            collar = [s for s in solids if _fit['_hero_part'](s[0]) != 'body/skin']
            out[f'head {pose}'] = _deepest([P for o in skull for P in _samples(o)], collar)
    return out


def hair_clip_all(styles=STYLES, bodies=BODIES, weapons=WEAPONS, limit=0.003):
    """Every style under every headgear that shows it, and on the posed hero in every body with every weapon:
    {style: {'head': {helm: ...}, 'posed': {(body, weapon): {pose: (depth, where)}}}} plus 'fails': the cases deeper
    than `limit` (the bow shot's measured beside the head's own depth in the same pose)."""
    hp = _load('hair.py')
    _build_sources([m for k in HEADGEAR.values() for m in k] + list(bodies) + list(weapons))
    out, fails = {}, []
    for style in styles:
        hp['build'](style)
        kind = 'beard' if style.startswith('beard') else 'hair'
        rep = {'head': {}, 'posed': {}}
        for helm in HEADGEAR[kind]:
            r = head_fit(style, helm)
            rep['head'][helm or 'bare'] = r
            for what in ('head', 'through'):                  # (inside the headgear's walls is covered: not a fail)
                d, where = r[what]
                if d > limit:
                    fails.append(f'{style} under {helm or "nothing"}: {d * 1000:.0f} mm {"into the head" if what == "head" else "out through the headgear"} ({where})')
        for body in bodies:
            for weapon in weapons:
                r = posed_fit(style, body, weapon)
                rep['posed'][(body or 'outfit', weapon)] = r
                for pose, (d, where) in r.items():
                    if pose.startswith('head ') or d <= limit:
                        continue
                    own = r.get(f'head {pose}', (0.0, None))[0]
                    note = f' (the head itself: {own * 1000:.0f} mm)' if f'head {pose}' in r else ''
                    fails.append(f'{style} {body or "outfit"} {weapon} {pose}: {d * 1000:.0f} mm into {where}{note}')
        out[style] = rep
    out['fails'] = fails
    return out
