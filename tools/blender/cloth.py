"""Cloth the way a cloth artist makes it (the model methods audit, October 4): mantles, capes and the like start as a
low cage, shaped by modifiers (Mirror, Subdivision with creased edges, Shrinkwrap so it starts outside a stand-in of
the body it lies on), then a short cloth simulation pinned where the garment is held lets gravity settle real drape
and folds over the stand-in. The simulation is baked at its last frame and made exactly symmetric, then reduced to the
game's chunky faceted look (Decimate) and given its thickness (Solidify); rolled bindings (binding()) finish its open
edges, the cloth cut back to meet them and whatever it lies on (clear()).

Everything is fixed (frames, quality, stiffness, the cage), so a re-export gives the same cloth; drape() keeps each
result while this module stays loaded (reloading it, as cult.py does when it is itself reloaded, starts afresh), so a
script that builds the same character many times (the fit and clip audits) simulates it once.

Coordinates are three.js (Y up, +Z forward), as in every model script; the simulation runs in its own scene in
Blender's frame (Z up) and its result comes back in three.js coordinates.
"""
import hashlib
import math

import bmesh
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree

from _common import _mesh_obj


def to_blender(p):
    """three.js (Y up, +Z forward) -> Blender (Z up): the frame the model scripts' root turns into."""
    x, y, z = p
    return Vector((x, -z, y))


def to_three(v):
    return Vector((v.x, v.z, -v.y))


def _spow(v, p):
    return math.copysign(abs(v) ** p, v)


def _box(bm, size, pos, taper=None):
    for v in bmesh.ops.create_cube(bm, size=1.0)['verts']:
        x, y, z = v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]
        if taper and y > 0:
            x, z = x * taper[0], z * taper[1]
        v.co = to_blender((x + pos[0], y + pos[1], z + pos[2]))


def _blob(bm, centre, radii, e, nu=40, nv=24):
    """A superellipsoid (e = 2 is an ellipsoid; larger is boxier) as a closed mesh."""
    cx, cy, cz = centre
    top = bm.verts.new(to_blender((cx, cy + radii[1], cz)))
    bot = bm.verts.new(to_blender((cx, cy - radii[1], cz)))
    rings = []
    for j in range(1, nv):
        th = math.pi * j / nv - math.pi / 2
        r, h = _spow(math.cos(th), 2 / e), _spow(math.sin(th), 2 / e)
        rings.append([bm.verts.new(to_blender((cx + radii[0] * r * _spow(math.sin(2 * math.pi * i / nu), 2 / e),
                                                cy + radii[1] * h,
                                                cz + radii[2] * r * _spow(math.cos(2 * math.pi * i / nu), 2 / e))))
                      for i in range(nu)])
    for a, b in zip(rings, rings[1:]):
        for i in range(nu):
            bm.faces.new((a[i], a[(i + 1) % nu], b[(i + 1) % nu], b[i]))
    for i in range(nu):
        bm.faces.new((bot, rings[0][(i + 1) % nu], rings[0][i]))
        bm.faces.new((top, rings[-1][i], rings[-1][(i + 1) % nu]))


def stand_in(scene, boxes=(), blobs=(), voxel=0.012):
    """The body the cloth lies on, as one closed surface (overlapping boxes and blobs fused by a voxel remesh, so the
    cloth sees no buried faces): boxes (size, centre, taper or None) and blobs (centre, radii, exponent)."""
    bm = bmesh.new()
    for size, pos, taper in boxes:
        _box(bm, size, pos, taper)
    for centre, radii, e in blobs:
        _blob(bm, centre, radii, e)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new('cloth_stand')
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new('cloth_stand', me)
    scene.collection.objects.link(o)
    m = o.modifiers.new('fuse', 'REMESH')
    m.mode, m.voxel_size, m.adaptivity = 'VOXEL', voxel, 0.0
    bpy.context.view_layer.update()
    fused = bpy.data.meshes.new_from_object(o.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    o.modifiers.clear()
    o.data = fused
    bpy.data.meshes.remove(me)
    return o


def cage(scene, rows, pins):
    """Half a garment's cage (x >= 0), mirrored by drape(): `rows` of three.js points from its hem up, each running from
    the open front edge (column 0) round to the back's centre line (x = 0). Points on x = 0 are joined to their mirror.
    `pins` (same layout) weight how firmly each point is held in the simulation. The open front edge is creased so the
    subdivision keeps its line, and its top (the last row's first point) stays a corner."""
    n = len(rows[0])
    bm = bmesh.new()
    vs = [[bm.verts.new(to_blender(p)) for p in row] for row in rows]
    for j in range(len(rows) - 1):
        for i in range(n - 1):
            bm.faces.new((vs[j][i], vs[j][i + 1], vs[j + 1][i + 1], vs[j + 1][i]))
    bm.normal_update()
    # Outward: away from the middle of the cage.
    mid = sum((v.co for v in bm.verts), Vector()) / len(bm.verts)
    mid.x = 0.0
    if sum((f.calc_center_median() - mid).dot(f.normal) for f in bm.faces) < 0:
        bmesh.ops.reverse_faces(bm, faces=list(bm.faces))
    me = bpy.data.meshes.new('cloth_cage')
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new('cloth_cage', me)
    scene.collection.objects.link(o)
    g = o.vertex_groups.new(name='pin')
    for j, row in enumerate(pins):
        for i, w in enumerate(row):
            if w > 0:
                g.add([j * n + i], float(w), 'REPLACE')
    edge = me.attributes.new('crease_edge', 'FLOAT', 'EDGE')
    for e in me.edges:
        a, b = e.vertices
        if a % n == 0 and b % n == 0:
            edge.data[e.index].value = 1.0
    vert = me.attributes.new('crease_vert', 'FLOAT', 'POINT')
    vert.data[(len(rows) - 1) * n].value = 1.0
    return o


CLOTH = dict(quality=12, mass=0.4, air_damping=1.0, tension_stiffness=25, compression_stiffness=20, shear_stiffness=10,
             bending_stiffness=10, tension_damping=10, compression_damping=10, shear_damping=10, bending_damping=1.0)

_baked = {}


def drape(name, rows, pins, boxes=(), blobs=(), frames=120, levels=2, cloth=None, pin_stiffness=2.0, offset=0.02,
          faces=360, thick=0.03):
    """Simulate the garment over the stand-in (`boxes`, `blobs`: stand_in()) from its cage (`rows`, `pins`: cage())
    and return it baked, symmetric, reduced and thickened, in three.js coordinates: {'shell': (verts, faces), the
    finished cloth; 'sim': (verts, faces), the simulated cloth before it was reduced (smooth: what bindings are laid
    on); 'edges': its open edge in runs of one kind ('front' | 'hem' | 'top': along the cage's first column, mirrored,
    its first row or its last), each run the simulated cloth's points along it, in order round the edge, starting
    where the run before it ends}. `faces` is the reduced cloth's triangle budget (Decimate's ratio comes from it)."""
    key = hashlib.md5(repr((rows, pins, boxes, blobs, frames, levels, cloth, pin_stiffness, offset, faces,
                            thick)).encode()).hexdigest()
    if key in _baked:
        return _baked[key]
    home = bpy.context.window.scene
    scene = bpy.data.scenes.new(f'DB_cloth_{name}')
    bpy.context.window.scene = scene
    scene.render.fps = 24
    scene.frame_start, scene.frame_end = 1, frames
    scene.use_gravity = True
    scene.gravity = (0.0, 0.0, -9.81)
    stand = stand_in(scene, boxes, blobs)
    stand.modifiers.new('collision', 'COLLISION')
    stand.collision.thickness_outer = 0.008
    stand.collision.cloth_friction = 3.0
    o = cage(scene, rows, pins)
    m = o.modifiers.new('mirror', 'MIRROR')
    m.use_axis = (True, False, False)
    m.use_clip, m.use_mirror_merge, m.merge_threshold = True, True, 1e-4
    s = o.modifiers.new('subdivide', 'SUBSURF')
    s.levels = s.render_levels = levels
    s.boundary_smooth, s.use_creases = 'PRESERVE_CORNERS', True
    w = o.modifiers.new('fit', 'SHRINKWRAP')
    w.target, w.wrap_method, w.wrap_mode, w.offset = stand, 'NEAREST_SURFACEPOINT', 'OUTSIDE', offset
    c = o.modifiers.new('cloth', 'CLOTH')
    for k, v in dict(CLOTH, **(cloth or {})).items():
        setattr(c.settings, k, v)
    c.settings.vertex_group_mass = 'pin'
    c.settings.pin_stiffness = pin_stiffness
    cc = c.collision_settings
    cc.use_collision, cc.distance_min, cc.collision_quality = True, 0.01, 4
    cc.use_self_collision = False
    c.point_cache.frame_start, c.point_cache.frame_end = 1, frames
    # The garment as it starts, before the simulation moves it.
    c.show_viewport = False
    scene.frame_set(1)
    pre = bpy.data.meshes.new_from_object(o.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    c.show_viewport = True
    # Which open edge each stretch of the garment's border lies along: its front (the cage's first column, mirrored),
    # its hem (the first row) or its top (the last row); and each point's mirror image. The simulation keeps the points
    # in order, so these follow.
    mirrored = lambda pts: [Vector((-v.x, v.y, v.z)) for v in reversed(pts)] + pts
    lines = {k: mirrored([to_blender(p) for p in pts]) for k, pts in
             (('front', [r[0] for r in rows]), ('hem', rows[0]), ('top', rows[-1]))}
    kinds = {k: _nearest((pre.vertices[k[0]].co + pre.vertices[k[1]].co) / 2, lines) for k in _open_edges(pre)}
    tree = KDTree(len(pre.vertices))
    for v in pre.vertices:
        tree.insert(v.co, v.index)
    tree.balance()
    twin = [tree.find(Vector((-v.co.x, v.co.y, v.co.z)))[1] for v in pre.vertices]
    bpy.data.meshes.remove(pre)
    for f in range(1, frames + 1):
        scene.frame_set(f)
    # Bake: the cloth as it lies at the last frame, frozen into a mesh of its own, each point and its mirror image
    # averaged so it is exactly symmetric.
    dg = bpy.context.evaluated_depsgraph_get()
    baked = bpy.data.objects.new('cloth_baked', bpy.data.meshes.new_from_object(o.evaluated_get(dg)))
    scene.collection.objects.link(baked)
    co = [v.co.copy() for v in baked.data.vertices]
    for v in baked.data.vertices:
        m = co[twin[v.index]]
        v.co = (co[v.index] + Vector((-m.x, m.y, m.z))) / 2
    sim = ([tuple(to_three(v.co)) for v in baked.data.vertices], [tuple(p.vertices) for p in baked.data.polygons])
    # Reduced to the faceted look, thickened inward.
    d = baked.modifiers.new('reduce', 'DECIMATE')
    d.decimate_type = 'COLLAPSE'
    d.use_symmetry, d.symmetry_axis = True, 'X'
    d.ratio = min(1.0, faces / max(1, sum(len(f) - 2 for f in sim[1])))
    th = baked.modifiers.new('thickness', 'SOLIDIFY')
    th.thickness, th.offset, th.use_even_offset, th.use_rim = thick, -1.0, True, True
    me = bpy.data.meshes.new_from_object(baked.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    shell = ([tuple(to_three(v.co)) for v in me.vertices], [tuple(p.vertices) for p in me.polygons])
    bpy.data.meshes.remove(me)
    for ob in (o, stand, baked):
        _remove(ob)
    bpy.context.window.scene = home
    bpy.data.scenes.remove(scene)
    out = {'shell': shell, 'sim': sim, 'edges': _runs(sim, kinds)}
    _baked[key] = out
    return out


def _runs(mesh, kinds):
    """A surface's open edge in runs of one kind (`kinds`, by edge: its two vertices' indices, the lower first), each
    run the points along it in order round the edge, starting where the run before it ends."""
    runs = []
    for loop in loops(mesh):
        n = len(loop)
        ks = [kinds.get(tuple(sorted((loop[j], loop[(j + 1) % n]))), 'hem') for j in range(n)]
        cut = next((j for j in range(n) if ks[j] != ks[j - 1]), 0)
        for j in range(cut, cut + n):
            if j == cut or ks[j % n] != ks[(j - 1) % n]:
                runs.append((ks[j % n], [Vector(mesh[0][loop[j % n]])]))
            runs[-1][1].append(Vector(mesh[0][loop[(j + 1) % n]]))
    return runs


def _even(pts, step):
    """Points along a path at even spacing (about `step`), its ends kept."""
    run = [0.0]
    for a, b in zip(pts, pts[1:]):
        run.append(run[-1] + (b - a).length)
    n = max(1, round(run[-1] / step))
    out, k = [], 0
    for i in range(n + 1):
        t = run[-1] * i / n
        while k < len(pts) - 2 and run[k + 1] < t:
            k += 1
        f = (t - run[k]) / max(1e-9, run[k + 1] - run[k])
        out.append(tuple(pts[k].lerp(pts[k + 1], min(1.0, max(0.0, f)))))
    return out


def _open_edges(me):
    """A mesh's open edges, each as its two vertices' indices, the lower first."""
    count = {e.key: 0 for e in me.edges}
    for p in me.polygons:
        for k in p.edge_keys:
            count[k] += 1
    return [k for k, n in count.items() if n == 1]


def _seg_dist(p, a, b):
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / max(ab.length_squared, 1e-12)))
    return (a + ab * t - p).length


def _nearest(p, lines):
    return min(lines, key=lambda k: min(_seg_dist(p, a, b) for a, b in zip(lines[k], lines[k][1:])))


def binding(parent, path, surface, color, width=0.065, proud=0.022, thick=0.03, lap=0.014, step=0.05, smooth=0,
            ease=6, cloth=None, against=(), reach=0.08):
    """A rolled binding over a cloth edge, in one piece: along `path` (points on the open edge of `surface`, the
    simulated cloth (drape()'s 'sim', its faces turned outward), in order: drape()'s edge runs, joined; laid every
    `step`, then `smooth` passes of averaging round off its corners, its ends kept, the points laid back onto the cloth
    before the last pass) it lies `width` onto the outside, stands `proud` off it, rolls over the edge and tucks back
    under the inside (`thick` in from the outside), so the edge reads as a sewn hem; its inner side steps down into the
    cloth. It is one cross-section swept along the edge, turning as the cloth turns there, its turn eased along the edge
    over `ease` passes, so where the cloth twists quickly (a lapel rising into a collar) the binding turns smoothly. Its
    outside faces away from the line up through the wearer's middle (x = z = 0), even where the cloth folds back on
    itself.
    Given the cloth's part (`cloth`, as place() makes it), the binding cuts the cloth back to itself (clear()), and from
    the solids `against` it (what the cloth rests on or under) in the same cut: whatever of the cloth lies inside the
    binding, or over it or past the edge it runs along (up to `reach` out), is cut away, so the cloth ends under the
    binding's inner side, meeting it without passing into it, and none of it shows through the binding or past it, even
    where the smoothing takes the binding in across a corner of the cloth."""
    tree = surface_tree(surface)
    pts = [Vector(p) for p in _even([Vector(p) for p in path], step)]
    for k in range(smooth):
        pts = [pts[0]] + [(a + b * 2 + c) / 4 for a, b, c in zip(pts, pts[1:], pts[2:])] + [pts[-1]]
        if k == smooth - 2:   # back onto the cloth before the last pass, so the binding lies on it, not sunk into it
            pts = [tree.find_nearest(p)[0] for p in pts]
    mids = [sum((Vector(surface[0][i]) for i in f), Vector()) / len(f) for f in surface[1]]
    # Each point's frame: in across the cloth from the edge (b) and the cloth's outward normal there (n), eased along
    # the edge; every b turned the same way as the one before it, all of them the way most of the cloth lies.
    ts, ns, inward = [], [], []
    for i, p in enumerate(pts):
        ts.append((pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized())
        _, n, face, _ = tree.find_nearest(p)
        ns.append(n if n.dot(Vector((p.x, 0.0, p.z))) >= 0 else -n)
        inward.append(mids[face] - p)
    for _ in range(ease):
        ns = [ns[max(i - 1, 0)] + ns[i] * 2 + ns[min(i + 1, len(ns) - 1)] for i in range(len(ns))]
    frames = []
    for t, n in zip(ts, ns):
        n = (n - t * n.dot(t)).normalized()
        b = n.cross(t)
        frames.append((b if not frames or b.dot(frames[-1][0]) >= 0 else -b, n))
    if sum(1 if b.dot(d) > 0 else -1 for (b, _), d in zip(frames, inward)) < 0:
        frames = [(-b, n) for b, n in frames]
    profile = [(-lap, proud * 0.4), (width * 0.35, proud), (width, proud * 0.7), (width + 0.004, -0.4 * thick),
               (width * 0.5, -thick - proud * 0.5), (-lap * 0.6, -thick - proud * 0.4)]
    gold = _sweep(parent, pts, frames, profile, color, smooth=True)
    if cloth is not None:
        # The binding's inner side, and beyond it everything over, past and under the edge, `reach` out.
        cut = [(-reach, reach), (width, reach)] + profile[2:5] + [(-reach, -reach)]
        cutter = _sweep(parent, pts, frames, cut, color)
        clear(cloth, cutter, *against)
        _remove(cutter)
    return gold


def _sweep(parent, pts, frames, profile, color, smooth=False):
    """A cross-section (`profile`: points in across the cloth and out off it) swept through `frames` ((b, n) at each
    of `pts`), as one closed solid of triangles (so a solid swept the same way to cut by matches it exactly). With
    `smooth`, each side of it is shaded smoothly along its length, the edges between sides kept sharp."""
    bm = bmesh.new()
    rings = [[bm.verts.new(p + b * pb + n * pn) for pb, pn in profile] for p, (b, n) in zip(pts, frames)]
    k = len(profile)
    for a, c in zip(rings, rings[1:]):
        for j in range(k):
            bm.faces.new((a[j], c[j], c[(j + 1) % k]))
            bm.faces.new((a[j], c[(j + 1) % k], a[(j + 1) % k]))
    sides = len(bm.faces)
    caps = [bm.faces.new(rings[0]), bm.faces.new(list(reversed(rings[-1])))]
    bmesh.ops.triangulate(bm, faces=caps, ngon_method='EAR_CLIP')
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = _mesh_obj(bm, parent, (0, 0, 0), (0, 0, 0), color)
    if smooth:
        for i, p in enumerate(o.data.polygons):
            p.use_smooth = i < sides
        for e in o.data.edges:
            a, b = sorted(e.vertices)
            e.use_edge_sharp = b - a == k        # along the sweep, between two of its sides
    return o


# What clear() cuts back stops this far short of what it meets: touching, but never sharing a face with it, so the two
# stay two closed shapes and neither passes inside the other.
GAP = 0.0005


def clear(part, *others):
    """`part` cut back wherever it passes inside any of `others`, a hair (GAP) clear of them (an exact boolean
    difference with each of them swollen by GAP; they stay as they are), so it meets them without passing into them:
    one shape never buried in another (AGENTS.md)."""
    bpy.context.view_layer.update()

    def bounds(o):
        pts = [o.matrix_world @ Vector(c) for c in o.bound_box]
        return Vector([min(p[i] for p in pts) for i in range(3)]), Vector([max(p[i] for p in pts) for i in range(3)])
    lo, hi = bounds(part)
    tools = bpy.data.collections.new('clear_tools')
    bpy.context.scene.collection.children.link(tools)
    for o in others:
        olo, ohi = bounds(o)
        if any(olo[i] > hi[i] + GAP or ohi[i] < lo[i] - GAP for i in range(3)):
            continue                                 # nowhere near it
        bm = bmesh.new()
        bm.from_mesh(o.data)
        bm.transform(o.matrix_world)
        bm.normal_update()
        for v in bm.verts:
            v.co += v.normal * GAP
        me = bpy.data.meshes.new('clear_tool')
        bm.to_mesh(me)
        bm.free()
        tools.objects.link(bpy.data.objects.new('clear_tool', me))
    if tools.objects:   # all of them cut at once
        m = part.modifiers.new('clear', 'BOOLEAN')
        m.operation, m.solver, m.operand_type, m.collection = 'DIFFERENCE', 'EXACT', 'COLLECTION', tools
        m.use_self, m.use_hole_tolerant = True, True
        bpy.context.view_layer.update()
        dg = bpy.context.evaluated_depsgraph_get()
        me = bpy.data.meshes.new_from_object(part.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
        _tidy(me)
        old = part.data
        part.modifiers.clear()
        part.data = me
        bpy.data.meshes.remove(old)
    for tool in list(tools.objects):
        _remove(tool)
    bpy.data.collections.remove(tools)
    return part


def _tidy(me, share=0.05):
    """Tidy what a cut leaves: points within a fifth of a millimetre welded and the slivers between them dissolved
    (the model check welds points that close); two sheets left touching along an edge parted, each point there moved
    a third of a millimetre into its own sheet; the loose bits dropped (pieces of `me`, faces joined by edges, with
    under `share` of its faces); every face made a triangle, cracks closed and fins dropped."""
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=2e-4)
    bmesh.ops.dissolve_degenerate(bm, edges=bm.edges, dist=2e-4)
    for v in {v for e in bm.edges if len(e.link_faces) > 2 for v in e.verts}:
        pinched = [e for e in v.link_edges if len(e.link_faces) > 2] if v.is_valid else []
        if pinched:
            for w in bmesh.utils.vert_separate(v, pinched):
                mid = sum((f.calc_center_median() for f in w.link_faces), Vector()) / max(1, len(w.link_faces))
                w.co += (mid - w.co).normalized() * 3e-4
    seen, pieces = set(), []
    for f in bm.faces:
        if f in seen:
            continue
        piece, todo = [], [f]
        seen.add(f)
        while todo:
            g = todo.pop()
            piece.append(g)
            for e in g.edges:
                for h in e.link_faces:
                    if h not in seen:
                        seen.add(h)
                        todo.append(h)
        pieces.append(piece)
    small = [f for piece in pieces if len(piece) < share * len(bm.faces) for f in piece]
    bmesh.ops.delete(bm, geom=small, context='FACES')
    bmesh.ops.delete(bm, geom=[e for e in bm.edges if not e.link_faces], context='EDGES')
    # The cut's many-sided faces split into triangles here, where a concave one is split properly; then any triangle
    # with a corner lying on its opposite edge (a crack the check would see) is closed: that edge is split at the
    # corner and welded to it. A repair that only brings the same sliver back is not tried again: a sliver whose sides
    # all have their two faces leaves the part closed.
    bmesh.ops.triangulate(bm, faces=bm.faces, quad_method='BEAUTY', ngon_method='EAR_CLIP')
    key = lambda c: (c[3].co.to_tuple(6), frozenset(v.co.to_tuple(6) for v in c[0].verts))
    tried = set()
    for _ in range(len(bm.faces)):
        crack = next((c for c in _cracks(bm) if key(c) not in tried), None)
        if crack is None:
            break
        tried.add(key(crack))
        edge, end, t, corner = crack
        _, mid = bmesh.utils.edge_split(edge, end, t)
        bmesh.ops.weld_verts(bm, targetmap={mid: corner})
        bmesh.ops.dissolve_degenerate(bm, edges=bm.edges, dist=2e-4)
        bmesh.ops.triangulate(bm, faces=bm.faces, quad_method='BEAUTY', ngon_method='EAR_CLIP')
    # Fins: a triangle hanging off an edge other faces share, its other two edges free.
    fins = [f for f in bm.faces if sum(len(e.link_faces) == 1 for e in f.edges) == 2
            and any(len(e.link_faces) > 2 for e in f.edges)]
    bmesh.ops.delete(bm, geom=fins, context='FACES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    if any(len(e.link_faces) != 2 for e in bm.edges):
        print(f'cloth: {me.name} is left open after tidying (the model check cannot see inside it): check the cut')
    bm.to_mesh(me)
    bm.free()


def _cracks(bm, tol=2e-4):
    """Triangles of `bm` with a corner within `tol` of its opposite edge, inside it: (that edge, its end the split is
    measured from, how far along, the corner)."""
    for f in bm.faces:
        for i in range(3):
            c, a, b = f.verts[i], f.verts[(i + 1) % 3], f.verts[(i + 2) % 3]
            ab = b.co - a.co
            if ab.length_squared < 1e-12:
                continue
            t = (c.co - a.co).dot(ab) / ab.length_squared
            edge = bm.edges.get((a, b))
            if edge is not None and 0.01 < t < 0.99 and (a.co + ab * t - c.co).length < tol:
                yield edge, a, t, c


def _remove(o):
    me = o.data
    bpy.data.objects.remove(o, do_unlink=True)
    bpy.data.meshes.remove(me)


def place(parent, mesh, color):
    """A baked mesh (verts, faces) as one flat-shaded part in `color` under `parent`, whose frame is the three.js frame
    the mesh was authored in."""
    verts, faces = mesh
    bm = bmesh.new()
    vs = [bm.verts.new(v) for v in verts]
    for f in faces:
        bm.faces.new([vs[i] for i in f])
    return _mesh_obj(bm, parent, (0, 0, 0), (0, 0, 0), color)


def loops(mesh):
    """The open edges of a surface (verts, faces) as closed loops of vertex indices."""
    verts, faces = mesh
    count = {}
    for f in faces:
        for a, b in zip(f, f[1:] + f[:1]):
            k = (min(a, b), max(a, b))
            count[k] = count.get(k, 0) + 1
    nxt = {}
    for f in faces:
        for a, b in zip(f, f[1:] + f[:1]):
            if count[(min(a, b), max(a, b))] == 1:
                nxt[a] = b
    out, seen = [], set()
    for start in nxt:
        if start in seen:
            continue
        loop, v = [], start
        while v not in seen:
            seen.add(v)
            loop.append(v)
            v = nxt[v]
        out.append(loop)
    return out


def surface_tree(mesh):
    verts, faces = mesh
    return BVHTree.FromPolygons([Vector(v) for v in verts], [list(f) for f in faces])
