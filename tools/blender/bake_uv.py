"""The bake finish's UVs (bake.py): which faces show, how each island is laid out and how the atlas is packed, and the
audits the export reports. Two maps on every part:
  `tile` (TEXCOORD_0): each island (Smart UV Project's, faces within ISLAND_ANGLE; a face turned more than 60 degrees
         from its island laid on its own) flat on its own plane at true size, in metres, square to its part (v up the
         part's sides, toward its back on top): the game's painted materials run at one texel density, one way up;
  `bake` (TEXCOORD_1): the same islands, unturned (one tangent frame for both maps), packed into one atlas of the whole
         model at TEXEL texels to the metre; small islands take SMALL_ZOOM times their share, and faces buried inside
         another part riding the same rig part take none.
"""
import math
import re

import bmesh
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

TEXEL = 200                  # bake texels per metre of surface (1:1 at the closest play camera)
SIZES = (256, 512, 1024)
FILL = 0.5                   # the share of the atlas its islands fill once packed with their margins
MARGIN_PX = 3                # the bake bleeds this far past each island; islands sit twice this apart
ISLAND_ANGLE = 58.0
SMALL_AREA, SMALL_ZOOM = 0.003, 2.0   # islands under this many m2 take this many times their share of the atlas
# Rig parts that move on their own (anim.ts, minifig.py RIG): a part's occlusion and island tones come only from the
# meshes riding the same one. Every socket counts too (gear on each rides a different part of the hero).
RIG = {'body', 'head', 'armL', 'armR', 'elbowL', 'elbowR', 'handL', 'handR', 'legL', 'legR', 'weapon', 'staffbody',
       'sling', 'ear', 'jaw'}


def contract(o):
    return re.sub(r'\.\d{3}$', '', o.name)


def group_of(o):
    """The rig part (or gear socket) a mesh rides: its nearest such ancestor, else the model's root."""
    a = o.parent
    while a is not None:
        n = contract(a)
        if n in RIG or n.startswith('sock_') or n.endswith('_root'):
            return n
        a = a.parent
    return 'root'


def model_root(scene):
    return next(o for o in scene.objects if o.parent is None and contract(o).endswith('_root'))


def rest(o, root):
    """Object -> the model's own frame (three.js axes: Y up, +Z forward), as authored."""
    return root.matrix_world.inverted() @ o.matrix_world


def select(objs):
    if bpy.context.object and bpy.context.object.mode != 'OBJECT':
        bpy.ops.object.mode_set(mode='OBJECT')
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]


# ─── 3. UVs ──────────────────────────────────────────────────────────────────

def islands(bm, uv):
    """Faces grouped into UV islands (faces joined across an edge whose two sides share UVs)."""
    seen, out = set(), []
    for f in bm.faces:
        if f.index in seen:
            continue
        stack, isl = [f], []
        seen.add(f.index)
        while stack:
            g = stack.pop()
            isl.append(g)
            for loop in g.loops:
                e = loop.edge
                for h in e.link_faces:
                    if h.index in seen:
                        continue
                    # Shared edge: same UV at both of its ends on both faces.
                    same = True
                    for v in e.verts:
                        a = next(l[uv].uv for l in g.loops if l.vert == v)
                        b = next(l[uv].uv for l in h.loops if l.vert == v)
                        if (a - b).length > 1e-5:
                            same = False
                    if same:
                        seen.add(h.index)
                        stack.append(h)
        out.append(isl)
    return out


def _frame(n, rot):
    """Upright axes (u, v) in the plane facing n, square to the part itself (`rot`: the part's own axes in the model's
    frame): v runs up the part's sides (along its own most upright axis, so a strap slung across the chest is
    textured along its length and its island is not a diagonal in the atlas), and toward its back on its top and
    underside."""
    axes = [rot.col[i].normalized() for i in range(3)]
    up = max(axes, key=lambda a: abs(a.y))
    up = up if up.y >= 0 else -up
    if abs(n.dot(up)) < 0.7:
        v = (up - n * n.dot(up)).normalized()
        return v.cross(n).normalized(), v
    side = max((a for a in axes if abs(a.dot(up)) < 0.5), key=lambda a: abs(a.x))
    side = side if side.x >= 0 else -side
    u = (side - n * n.dot(side)).normalized()
    return u, n.cross(u).normalized()


def _solid(o):
    """A part to test points against: (object, world -> its own space, its own bounds, a world-space BVH)."""
    co = [v.co for v in o.data.vertices]
    lo = Vector((min(v.x for v in co), min(v.y for v in co), min(v.z for v in co)))
    hi = Vector((max(v.x for v in co), max(v.y for v in co), max(v.z for v in co)))
    mw = o.matrix_world
    return o, mw.inverted(), lo, hi, BVHTree.FromPolygons([mw @ v for v in co], [list(p.vertices) for p in o.data.polygons])


_RAY = Vector((1, 0.0013, 0.0007))


def _inside(s, p):
    """Whether world point p is inside solid s: in its bounds, and a ray out from it crosses its surface an odd number
    of times."""
    _, inv, lo, hi, tree = s
    q = inv @ p
    if not (lo.x <= q.x <= hi.x and lo.y <= q.y <= hi.y and lo.z <= q.z <= hi.z):
        return False
    hits, q = 0, p.copy()
    for _ in range(16):
        h = tree.ray_cast(q, _RAY, 5)
        if h[0] is None:
            break
        hits += 1
        q = h[0] + _RAY * 1e-4
    return hits % 2 == 1


def _outfit(o):
    a = o
    while a is not None:
        if contract(a).startswith('outfit_'):
            return True
        a = a.parent
    return False


def hidden_faces(objs):
    """Faces buried inside another part riding the same rig part (a torso's sides under its belt, a neck inside its
    head): never seen, so they take no room in the atlas. Parts that move apart never hide each other, and outfit
    pieces hide nothing (the game takes them off). Returns {object: set of face indices}."""
    bpy.context.view_layer.update()
    solids = {}
    for o in objs:
        if not _outfit(o):
            solids.setdefault(group_of(o), []).append(_solid(o))
    out = {}
    for o in objs:
        others = [s for s in solids.get(group_of(o), []) if s[0] is not o]
        mw, me = o.matrix_world, o.data
        out[o] = set()
        for p in me.polygons if others else ():
            vs = [mw @ me.vertices[i].co for i in p.vertices]
            mid = sum(vs, Vector()) / len(vs)
            if all(any(_inside(s, q) for s in others) for q in [mid] + [v.lerp(mid, 0.12) for v in vs]):
                out[o].add(p.index)
    return out


def coplanar_overlaps(objs, tol=0.0005):
    """Faces of two parts lying in one plane over each other, facing the same way (a guard's side flush with its
    sleeve's): painted from different places in the atlas, they flicker against each other as the camera moves. Returns
    the pairs of parts, named for the export's report, so the model can be fixed."""
    buckets = {}
    for o in objs:
        mw, rot = o.matrix_world, o.matrix_world.to_3x3()
        for p in o.data.polygons:
            n = (rot @ p.normal).normalized()
            vs = [mw @ o.data.vertices[i].co for i in p.vertices]
            mid = sum(vs, Vector()) / len(vs)
            key = (round(n.x * 40), round(n.y * 40), round(n.z * 40))
            buckets.setdefault(key, []).append((o, n, n.dot(mid), vs, mid))

    def covers(face, q):   # q inside the (convex) face, in its plane
        n, vs = face[1], face[3]
        return all(n.dot((vs[(i + 1) % len(vs)] - vs[i]).cross(q - vs[i])) > 1e-7 for i in range(len(vs)))
    out = set()
    for faces in buckets.values():
        faces.sort(key=lambda f: f[2])
        for i, a in enumerate(faces):
            for b in faces[i + 1:]:
                if b[2] - a[2] > tol:
                    break
                if a[0] is not b[0] and (covers(b, a[4]) or covers(a, b[4])):
                    k = tuple(sorted((_where(a[0]), _where(b[0]))))
                    out.add(k)
    return out


def _where(o):
    """A part's name for a report: its rig part or pivot, its own name and its middle in the model's frame."""
    root = o
    while root.parent is not None:
        root = root.parent
    c = root.matrix_world.inverted() @ o.matrix_world @ (sum((Vector(b) for b in o.bound_box), Vector()) / 8)
    return f'{contract(o.parent) if o.parent else "-"}/{contract(o)} at ({c.x:.2f}, {c.y:.2f}, {c.z:.2f})'


def unwrap(objs, root, hidden):
    """Both UV maps on every part (see the module comment); hidden faces (hidden_faces) are left out of the atlas.
    Returns the total surface area (m^2) the atlas holds."""
    for o in objs:
        me = o.data
        while me.uv_layers:
            me.uv_layers.remove(me.uv_layers[0])
        me.uv_layers.new(name='tile')
        me.uv_layers.new(name='bake')
        me.uv_layers.active = me.uv_layers['bake']
    select(objs)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(ISLAND_ANGLE), island_margin=0.0, area_weight=0.0,
                             correct_aspect=True, scale_to_bounds=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    area, lo, hi = 0.0, Vector((1e9, 1e9)), Vector((-1e9, -1e9))
    for o in objs:
        m = rest(o, root)
        rot = m.to_3x3()
        bm = bmesh.new()
        bm.from_mesh(o.data)
        bm.faces.ensure_lookup_table()
        tile, bake = bm.loops.layers.uv['tile'], bm.loops.layers.uv['bake']
        for isl in islands(bm, bake):
            n = sum(((rot @ f.normal) * f.calc_area() for f in isl), Vector())
            n = n.normalized() if n.length > 1e-9 else Vector((0, 0, 1))
            # Laid on the island's own plane; a face turned more than 60 degrees from it (an island can bend round a
            # corner as Smart UV Project grows it) is laid on its own instead, so nothing is squashed.
            groups = [([f for f in isl if (rot @ f.normal).dot(n) >= 0.5], n)]
            groups += [([f], (rot @ f.normal).normalized()) for f in isl if (rot @ f.normal).dot(n) < 0.5]
            for faces, nn in (g for g in groups if g[0]):
                u, v = _frame(nn, rot)
                # A small island (a chamfer's corner, a stud) takes SMALL_ZOOM times its share of the atlas, so the
                # bake's texels never show on it close up (the tile map stays at true size).
                size = sum(f.calc_area() for f in faces) * area_scale(m)
                zoom = SMALL_ZOOM if size < SMALL_AREA else 1.0
                mid = sum((m @ f.calc_center_median() for f in faces), Vector()) / len(faces)
                c = Vector((mid.dot(u), mid.dot(v)))
                for f in faces:
                    seen = f.index not in hidden[o]
                    area += f.calc_area() * area_scale(m) * seen * zoom * zoom
                    for loop in f.loops:
                        p = m @ loop.vert.co
                        loop[tile].uv = (p.dot(u), p.dot(v))
                        loop[bake].uv = c + (loop[tile].uv - c) * zoom if seen else Vector((-1.0, -1.0))
                        if seen:
                            lo = Vector((min(lo.x, loop[bake].uv.x), min(lo.y, loop[bake].uv.y)))
                            hi = Vector((max(hi.x, loop[bake].uv.x), max(hi.y, loop[bake].uv.y)))
        bm.to_mesh(o.data)
        bm.free()
    # Into the atlas's square (at true relative size) before packing, so the packer starts from the first tile.
    k = 0.9 / max(hi.x - lo.x, hi.y - lo.y, 1e-6)
    for o in objs:
        for i, f in enumerate(o.data.polygons):
            if i in hidden[o]:
                continue
            for li in f.loop_indices:
                uv = o.data.uv_layers['bake'].data[li]
                uv.uv = ((uv.uv.x - lo.x) * k + 0.05, (uv.uv.y - lo.y) * k + 0.05)
        o.data.uv_layers.active = o.data.uv_layers['tile']
    return area


def area_scale(m):
    """The area scale of a transform (parts are authored unscaled; kept for safety)."""
    s = m.to_scale()
    return abs(s.x * s.y * s.z) ** (2 / 3)


def pack(objs, size, hidden):
    """The `bake` islands of every part (hidden faces left out) packed unturned into one atlas, MARGIN_PX * 2 texels
    apart."""
    for o in objs:
        o.data.uv_layers.active = o.data.uv_layers['bake']
        for p in o.data.polygons:
            p.select = p.index not in hidden[o]
    ts = bpy.context.scene.tool_settings
    sync, ts.use_uv_select_sync = ts.use_uv_select_sync, True
    select(objs)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.uv.pack_islands(udim_source='CLOSEST_UDIM', rotate=False, scale=True, margin_method='FRACTION',
                            margin=(2 * MARGIN_PX + 1) / size, shape_method='CONCAVE')
    bpy.ops.object.mode_set(mode='OBJECT')
    ts.use_uv_select_sync = sync
    for o in objs:
        o.data.uv_layers.active = o.data.uv_layers['tile']


def atlas_size(area):
    need = math.sqrt(area / FILL) * TEXEL
    return next((s for s in SIZES if s >= need), SIZES[-1])
