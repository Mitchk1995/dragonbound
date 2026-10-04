"""Cloth the way a cloth artist makes it (the model methods audit, October 4): hoods, mantles and capes start as a low
cage, shaped by modifiers (Mirror, Subdivision with creased edges, Shrinkwrap so it starts outside a stand-in of the
body it lies on), then a short cloth simulation pinned where the garment is held lets gravity settle real drape and
folds over the stand-in. The simulation is baked at its last frame and made exactly symmetric, then reduced to the
game's chunky faceted look (Decimate) and given its thickness (Solidify); rolled bindings (binding()) finish its open
edges.

Everything is fixed (frames, quality, stiffness, the cage), so a re-export gives the same cloth; drape() keeps each
result for the rest of the Blender session, so a script that builds the same character many times (the fit and clip
audits) simulates it once.

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


def cage(scene, rows, pins, crease_rim=1.0, apex=True):
    """Half a garment's cage (x >= 0), mirrored by drape(): `rows` of three.js points from its hem up, each running from
    the open front edge (column 0) round to the back's centre line (x = 0). Points on x = 0 are joined to their mirror.
    `pins` (same layout) weight how firmly each point is held in the simulation. The open front edge is creased so the
    subdivision keeps its line; with `apex`, the top of that edge (the last row's first point) stays a point."""
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
            edge.data[e.index].value = crease_rim
    if apex:
        vert = me.attributes.new('crease_vert', 'FLOAT', 'POINT')
        vert.data[(len(rows) - 1) * n].value = 1.0
    return o


CLOTH = dict(quality=12, mass=0.4, air_damping=1.0, tension_stiffness=25, compression_stiffness=20, shear_stiffness=10,
             bending_stiffness=10, tension_damping=10, compression_damping=10, shear_damping=10, bending_damping=1.0)

_baked = {}


def drape(name, rows, pins, boxes=(), blobs=(), frames=120, levels=2, cloth=None, pin_stiffness=2.0, offset=0.02,
          faces=360, thick=0.03, crease_rim=1.0, open_top=False, spacing=0.05):
    """Simulate the garment over the stand-in (`boxes`, `blobs`: stand_in()) from its cage (`rows`, `pins`: cage())
    and return it baked, symmetric, reduced and thickened, in three.js coordinates: {'shell': (verts, faces, slots), the
    finished cloth, slot 0 its outside, 1 its inside, 2 its edges; 'surface': (verts, faces), the reduced surface before
    it was thickened (the cloth's outside: the thickness is laid inward from it); 'sim': (verts, faces), the simulated
    cloth before it was reduced (smooth, for what follows it: bindings); 'edges': its open edge in runs of one kind,
    ('front' | 'hem' | 'top', points along it), 'top' only with `open_top` (the cage's last row an open edge, not a
    seam)}. `faces` is the reduced surface's triangle budget (Decimate's ratio comes from it)."""
    key = hashlib.md5(repr((rows, pins, boxes, blobs, frames, levels, cloth, pin_stiffness, offset, faces, thick,
                            crease_rim, open_top, spacing)).encode()).hexdigest()
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
    o = cage(scene, rows, pins, crease_rim)
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
    # Which open edge each point of the garment starts on: its front (the cage's first column, mirrored), its hem (the
    # first row) or its top; and each point's mirror image. The simulation keeps the points in order, so these follow.
    c.show_viewport = False
    scene.frame_set(1)
    pre = bpy.data.meshes.new_from_object(o.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    c.show_viewport = True
    mirrored = lambda pts: [Vector((-v.x, v.y, v.z)) for v in reversed(pts)] + pts
    lines = {'front': mirrored([to_blender(r[0]) for r in rows]), 'hem': mirrored([to_blender(p) for p in rows[0]])}
    if open_top:
        lines['top'] = mirrored([to_blender(p) for p in rows[-1]])
    kinds = {i: _nearest(pre.vertices[i].co, lines) for i in _open_verts(pre)}
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
    th.material_offset, th.material_offset_rim = 1, 2

    def grab():
        me = bpy.data.meshes.new_from_object(baked.evaluated_get(bpy.context.evaluated_depsgraph_get()))
        out = ([tuple(to_three(v.co)) for v in me.vertices], [tuple(p.vertices) for p in me.polygons],
               [p.material_index for p in me.polygons])
        bpy.data.meshes.remove(me)
        return out
    th.show_viewport = False
    surface = grab()
    th.show_viewport = True
    shell = grab()
    for ob in (o, stand, baked):
        me = ob.data
        bpy.data.objects.remove(ob, do_unlink=True)
        bpy.data.meshes.remove(me)
    bpy.context.window.scene = home
    bpy.data.scenes.remove(scene)
    # The open edge, in runs of one kind each, in order round it, followed along the simulated cloth (smooth) and
    # spaced evenly.
    edges = []
    for loop in loops(sim):
        ks = [kinds.get(i, 'hem') for i in loop]
        cut = next((j for j in range(len(loop)) if ks[j] != ks[j - 1]), 0)
        loop, ks = loop[cut:] + loop[:cut], ks[cut:] + ks[:cut]
        for j, i in enumerate(loop):
            if not edges or j == 0 or ks[j] != ks[j - 1]:
                edges.append((ks[j], []))
            edges[-1][1].append(Vector(sim[0][i]))
    edges = [(k, _even(pts, spacing)) for k, pts in edges if len(pts) > 1]
    out = {'shell': shell, 'surface': surface[:2], 'sim': sim, 'edges': edges}
    _baked[key] = out
    return out


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


def _open_verts(me):
    count = {}
    for e in me.edges:
        count[e.key] = 0
    for p in me.polygons:
        for k in p.edge_keys:
            count[k] += 1
    return sorted({v for k, n in count.items() if n == 1 for v in k})


def _seg_dist(p, a, b):
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / max(ab.length_squared, 1e-12)))
    return (a + ab * t - p).length


def _nearest(p, lines):
    return min(lines, key=lambda k: min(_seg_dist(p, a, b) for a, b in zip(lines[k], lines[k][1:])))


def binding(parent, path, surface, color, width=0.065, proud=0.022, thick=0.03, lap=0.014, smooth=2):
    """A rolled binding over a cloth edge, in one piece: along `path` (points on the open edge of `surface`, the cloth's
    outside, in order; `smooth` passes of averaging take the ripples out of it, its ends kept) it lies `width` onto the
    outside, stands `proud` off it, rolls over the edge and tucks back under the inside (`thick` in from the outside),
    so the edge reads as a sewn hem; its inner side steps down into the cloth, so the faceted cloth never shows through
    it. Across its width it follows the cloth's curve. Give it the simulated cloth (drape()'s 'sim') as `surface`: its
    turns are smooth."""
    pts = [Vector(p) for p in path]
    for _ in range(smooth):
        pts = [pts[0]] + [(a + b * 2 + c) / 4 for a, b, c in zip(pts, pts[1:], pts[2:])] + [pts[-1]]
    tree = surface_tree(surface)
    centre = sum((Vector(v) for v in surface[0]), Vector()) / len(surface[0])
    profile = [(-lap, proud * 0.4), (width * 0.35, proud), (width, proud * 0.7), (width + 0.004, -0.4 * thick),
               (width * 0.5, -thick - proud * 0.5), (-lap * 0.6, -thick - proud * 0.4)]

    def lay(p, b, n, pb, pn):
        """A profile point: over the cloth, `pn` off the cloth's surface where it lies `pb` in from the edge."""
        if pb <= 0:
            return p + b * pb + n * pn
        s, ns = tree.find_nearest(p + b * pb)[:2]
        return s + (ns if ns.dot(n) > 0 else -ns) * pn
    bm = bmesh.new()
    rings, last = [], None
    n_pts = len(pts)
    for i, p in enumerate(pts):
        t = (pts[min(i + 1, n_pts - 1)] - pts[max(i - 1, 0)]).normalized()
        n = tree.find_nearest(p)[1]
        if n.dot(p - centre) < 0:
            n = -n
        b = n.cross(t).normalized()
        if last is not None:
            if b.dot(last) < 0:
                b = -b                               # keep turning the same way along the edge
        elif (tree.find_nearest(p + b * 0.04)[3] or 0) > (tree.find_nearest(p - b * 0.04)[3] or 0):
            b = -b                                   # into the cloth, away from the edge
        last = b
        n = (n - t * n.dot(t) - b * n.dot(b)).normalized()
        rings.append([bm.verts.new(lay(p, b, n, pb, pn)) for pb, pn in profile])
    k = len(profile)
    for a, c in zip(rings, rings[1:]):
        for j in range(k):
            bm.faces.new((a[j], c[j], c[(j + 1) % k], a[(j + 1) % k]))
    bm.faces.new(rings[0])
    bm.faces.new(list(reversed(rings[-1])))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _mesh_obj(bm, parent, (0, 0, 0), (0, 0, 0), color)


def place(parent, mesh, colors):
    """A baked mesh (verts, faces[, slot per face]) as flat-shaded parts under `parent` (whose frame is the three.js
    frame the mesh was authored in): one part per slot k, in colors[k] (one colour to a part, so the game merges each
    into the part it rides)."""
    verts, faces = mesh[0], mesh[1]
    slots = mesh[2] if len(mesh) > 2 else [0] * len(faces)
    out = []
    for k, color in enumerate(colors):
        bm = bmesh.new()
        vs = {}
        for f, slot in zip(faces, slots):
            if slot != k:
                continue
            for i in f:
                if i not in vs:
                    vs[i] = bm.verts.new(verts[i])
            try:
                bm.faces.new([vs[i] for i in f])
            except ValueError:
                pass
        if bm.faces:
            out.append(_mesh_obj(bm, parent, (0, 0, 0), (0, 0, 0), color))
        else:
            bm.free()
    return out


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
