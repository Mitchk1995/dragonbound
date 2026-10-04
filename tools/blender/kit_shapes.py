"""
Shape-making for the building kit's props (kit_props.py): blocks, extruded outlines, lathed and swept
shapes, booleans, soft furnishings, cloth draping and the bevelled finish, all in the kit's units.

Sizes are in kit units (U = 2.25 cm: a cell 20 U, a step 8 U) on three.js axes (x right, y up, z
toward the front), as in src/world/kit/. Blender is z up with the front toward -y; P() converts, so
the glTF exporter's y-up conversion brings every point back to the kit's axes.
"""
import math

import bmesh
import bpy
from mathutils import Matrix, Vector

U = 0.0225


def half(n):
    """Half a footprint `n` cells across, less the play between pieces (U)."""
    return n * 10 - 0.25


def P(x, y, z):
    """A point in kit units on three.js axes, in Blender's (metres, z up, the front toward -y)."""
    return Vector((x * U, -z * U, y * U))


def M(at=(0, 0, 0), rx=0.0, ry=0.0, rz=0.0, scale=(1, 1, 1)):
    """A move in Blender's space: scaled (kit axes), turned about the kit's x, then z, then y (radians), then moved to `at`."""
    s = Matrix.Diagonal((scale[0], scale[2], scale[1], 1.0))
    r = Matrix.Rotation(ry, 4, 'Z') @ Matrix.Rotation(-rz, 4, 'Y') @ Matrix.Rotation(rx, 4, 'X')
    return Matrix.Translation(P(*at)) @ r @ s


def material(name):
    return bpy.data.materials.get(name) or bpy.data.materials.new(name)


def _object(name, bm, mat):
    me = bpy.data.meshes.new(name)
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    me.materials.append(material(mat))
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def remove(ob):
    data = ob.data
    bpy.data.objects.remove(ob)
    if isinstance(data, bpy.types.Mesh) and data.users == 0:
        bpy.data.meshes.remove(data)


def transform(ob, m):
    ob.data.transform(m)
    ob.data.update()
    return ob


def smooth(ob):
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


def block(name, x0, y0, z0, x1, y1, z1, mat):
    """A box from (x0, y0, z0) to (x1, y1, z1)."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    lo, hi = P(x0, y0, z1), P(x1, y1, z0)
    for v in bm.verts:
        v.co = Vector(tuple(lo[k] + (v.co[k] + 0.5) * (hi[k] - lo[k]) for k in range(3)))
    return _object(name, bm, mat)


def prism(name, pts, axis, a0, a1, mat):
    """An outline `pts` extruded from a0 to a1 along `axis`: 'x' (the outline in z, y), 'z' (in x, y) or 'y' (in x, z)."""
    def at(u, v, a):
        return P(u, v, a) if axis == 'z' else P(a, v, u) if axis == 'x' else P(u, a, v)
    bm = bmesh.new()
    lo = [bm.verts.new(at(u, v, a0)) for u, v in pts]
    hi = [bm.verts.new(at(u, v, a1)) for u, v in pts]
    bm.faces.new(lo)
    bm.faces.new(hi)
    for i in range(len(pts)):
        j = (i + 1) % len(pts)
        bm.faces.new((lo[i], lo[j], hi[j], hi[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _object(name, bm, mat)


def lathe(name, prof, seg, mat, at=(0, 0, 0), squash=(1, 1)):
    """A shape turned about the vertical through `at`: `prof` [(r, y)] from the axis at its foot, up its outside, back to the axis at its top."""
    bm = bmesh.new()
    rings = []
    for r, y in prof:
        if r <= 1e-6:
            rings.append([bm.verts.new(P(at[0], at[1] + y, at[2]))])
        else:
            rings.append([bm.verts.new(P(at[0] + r * squash[0] * math.cos(a), at[1] + y, at[2] + r * squash[1] * math.sin(a)))
                          for a in (2 * math.pi * k / seg for k in range(seg))])
    for a, b in zip(rings, rings[1:]):
        if len(a) == 1 and len(b) == 1:
            continue
        for k in range(seg):
            k1 = (k + 1) % seg
            if len(a) == 1:
                bm.faces.new((a[0], b[k1], b[k]))
            elif len(b) == 1:
                bm.faces.new((a[k], a[k1], b[0]))
            else:
                bm.faces.new((a[k], a[k1], b[k1], b[k]))
    # (In triangles: a squashed turning's quads are not flat, and a cut through one must not fold it.)
    bmesh.ops.triangulate(bm, faces=bm.faces, quad_method='BEAUTY', ngon_method='BEAUTY')
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return smooth(_object(name, bm, mat))


def rod(name, a, b, r, mat, seg=12, r1=None):
    """A round bar from a to b (kit units), its ends cut square: `r` thick (tapering to `r1` at b)."""
    d = P(*b) - P(*a)
    ob = lathe(name, [(0, 0), (r, 0), (r if r1 is None else r1, d.length / U), (0, d.length / U)], seg, mat)
    q = Vector((0, 0, 1)).rotation_difference(d.normalized())
    return transform(ob, Matrix.Translation(P(*a)) @ q.to_matrix().to_4x4())


def band(name, path, x0, x1, t, mat):
    """
    A flat band from x0 to x1 laid on a surface: `path` [(z, y)] runs over the surface's outline with
    the solid on its right, and the band stands `t` out from it to the left.
    """
    n = len(path)
    out = []
    for i, (z, y) in enumerate(path):
        nz = ny = 0.0
        for j0, j1 in ((i - 1, i), (i, i + 1)):
            if 0 <= j0 and j1 < n:
                dz, dy = path[j1][0] - path[j0][0], path[j1][1] - path[j0][1]
                ln = math.hypot(dz, dy)
                nz, ny = nz - dy / ln, ny + dz / ln
        ln = math.hypot(nz, ny)
        out.append((z + nz / ln * t, y + ny / ln * t))
    bm = bmesh.new()
    rows = [[bm.verts.new(P(x, y, z)) for x in (x0, x1) for (z, y) in (inner, outer)] for inner, outer in zip(path, out)]
    for a, b in zip(rows, rows[1:]):
        for (i, j) in ((0, 1), (1, 3), (3, 2), (2, 0)):
            bm.faces.new((a[i], a[j], b[j], b[i]))
    for r in (rows[0], rows[-1]):
        bm.faces.new((r[0], r[1], r[3], r[2]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _object(name, bm, mat)


def apply_all(ob):
    """Makes an object's modifiers real."""
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
    old = ob.data
    ob.modifiers.clear()
    ob.data = me
    if old.users == 0:
        bpy.data.meshes.remove(old)
    return ob


def _boolean(target, others, op):
    for o in others:
        m = target.modifiers.new(o.name, 'BOOLEAN')
        m.operation = op
        m.solver = 'EXACT'
        m.material_mode = 'TRANSFER'
        m.object = o
        o.hide_set(True)
    apply_all(target)
    for o in others:
        remove(o)
    return target


def union(target, *others):
    """One watertight shape of them all (each face keeps its material)."""
    return _boolean(target, others, 'UNION')


def cut(target, *cutters):
    """The target less the cutters (the faces they leave take their material)."""
    return _boolean(target, cutters, 'DIFFERENCE')


def recolour(ob, mat, test):
    """Gives the faces `test` accepts (centre and normal, kit units and axes) the material `mat`."""
    me = ob.data
    if mat not in [m.name for m in me.materials]:
        me.materials.append(material(mat))
    k = [m.name for m in me.materials].index(mat)
    for p in me.polygons:
        c, n = p.center, p.normal
        if test((c.x / U, c.z / U, -c.y / U), (n.x, n.z, -n.y)):
            p.material_index = k
    return ob


def finish(ob, width=0.35, segments=2, angle=35):
    """
    Welded, its outside edges (where faces turn away from each other by more than `angle` degrees)
    bevelled as a joiner rounds them, its inside corners left as they meet; then made watertight and
    shaded (below).
    """
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    weight = bm.edges.layers.float.get('bevel_weight_edge') or bm.edges.layers.float.new('bevel_weight_edge')
    for e in bm.edges:
        turn = e.calc_face_angle_signed(0.0) if len(e.link_faces) == 2 else 0.0
        e[weight] = 1.0 if turn > math.radians(angle) else 0.0
    bm.to_mesh(ob.data)
    bm.free()
    # (Tagged as changed, so what is evaluated next sees it.)
    ob.data.update()
    b = ob.modifiers.new('bevel', 'BEVEL')
    b.width = width * U
    b.segments = segments
    b.limit_method = 'WEIGHT'
    b.use_clamp_overlap = True
    apply_all(ob)
    watertight(ob)
    return shade(ob)


def shade(ob, sharp=50):
    """
    Shaded as made: every edge where the faces turn by more than `sharp` degrees (an inside corner,
    an edge the bevel had no room to round) kept a crisp line, the rest smooth, and each corner's
    normal taken mostly from the broadest face there, so broad faces read flat and their rounded
    edges blend into them.
    """
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    for e in bm.edges:
        e.smooth = len(e.link_faces) == 2 and e.calc_face_angle(0.0) <= math.radians(sharp)
    for f in bm.faces:
        f.smooth = True
    bm.to_mesh(ob.data)
    bm.free()
    ob.data.update()
    wn = ob.modifiers.new('normals', 'WEIGHTED_NORMAL')
    wn.mode = 'FACE_AREA'
    wn.weight = 100
    wn.keep_sharp = True
    return apply_all(ob)


def watertight(ob):
    """
    Welds what the modelling left in one place twice, collapses the edges it left shorter than 0.2 mm
    (the model check, tools/one-piece-geometry.cjs, welds within 0.1 mm along each axis), splits every
    face into well-shaped triangles, and refuses a shape that is not closed all round.
    """
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bmesh.ops.dissolve_degenerate(bm, dist=2e-4, edges=bm.edges)
    bmesh.ops.triangulate(bm, faces=bm.faces, quad_method='BEAUTY', ngon_method='BEAUTY')
    bad = [(e.verts[0].co + e.verts[1].co) / 2 for e in bm.edges if not e.is_manifold]
    bm.to_mesh(ob.data)
    bm.free()
    ob.data.update()
    if bad:
        c = bad[0]
        raise RuntimeError(f'{ob.name} is not watertight: {len(bad)} open or shared edges, one at ({c.x / U:.1f}, {c.z / U:.1f}, {-c.y / U:.1f})')
    return ob


def elbow(name, x, z, y0, y, x1, r, mat, seg=16):
    """A pipe rising from y0 at (x, z), turning through a mitred elbow at height y, running along +x to x1: one closed shape."""
    bm = bmesh.new()
    ring = [(math.cos(a), math.sin(a)) for a in (2 * math.pi * k / seg for k in range(seg))]
    # (Both pipes meet on the plane at 45 degrees through the elbow's corner: the ring there is the same for both.)
    rings = [[bm.verts.new(P(x + r * c, y0, z + r * s)) for c, s in ring], [bm.verts.new(P(x + r * c, y - r * c, z + r * s)) for c, s in ring],
             [bm.verts.new(P(x1, y - r * c, z + r * s)) for c, s in ring]]
    for a, b in zip(rings, rings[1:]):
        for k in range(seg):
            bm.faces.new((a[k], a[(k + 1) % seg], b[(k + 1) % seg], b[k]))
    bm.faces.new(rings[0])
    bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return smooth(_object(name, bm, mat))


def soft(name, x0, y0, z0, x1, y1, z1, mat, r=2.0):
    """A soft, stuffed block (a mattress, a pillow): its edges rounded by subdivision, its foot flat at y0."""
    ob = block(name, x0, y0, z0, x1, y1, z1, mat)
    b = ob.modifiers.new('support', 'BEVEL')
    b.width = r * U
    b.segments = 1
    b.limit_method = 'NONE'
    s = ob.modifiers.new('subdivide', 'SUBSURF')
    s.levels = s.render_levels = 2
    apply_all(ob)
    return seat(smooth(ob), y0)


def seat(ob, y):
    """Moves an object up or down so its lowest point is at y."""
    low = min(v.co.z for v in ob.data.vertices) / U
    return transform(ob, Matrix.Translation((0, 0, (y - low) * U)))


def drape(name, x0, x1, z0, z1, y, colliders, mat, cuts=(28, 20), frames=60, thickness=0.5):
    """A cloth laid flat at height y over x0..x1, z0..z1, let fall over `colliders` by cloth simulation, then given its thickness."""
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=cuts[0], y_segments=cuts[1], size=0.5)
    for v in bm.verts:
        v.co = P(x0 + (v.co.x + 0.5) * (x1 - x0), y, z0 + (v.co.y + 0.5) * (z1 - z0))
    ob = _object(name, bm, mat)
    for c in colliders:
        c.modifiers.new('collision', 'COLLISION')
        c.collision.thickness_outer = 0.006
        c.collision.cloth_friction = 8
    cl = ob.modifiers.new('cloth', 'CLOTH')
    s = cl.settings
    s.quality = 8
    s.mass = 0.4
    s.tension_stiffness = s.compression_stiffness = 12
    s.shear_stiffness = 6
    s.bending_stiffness = 0.4
    s.air_damping = 2
    cl.collision_settings.distance_min = 0.006
    cl.collision_settings.collision_quality = 4
    scene = bpy.context.scene
    scene.frame_start, scene.frame_end = 1, frames
    cl.point_cache.frame_start, cl.point_cache.frame_end = 1, frames
    for f in range(1, frames + 1):
        scene.frame_set(f)
    apply_all(ob)
    # (Wherever the simulation let the cloth sink a little into what it lies on, it is lifted back out over it.)
    for c in colliders:
        c.modifiers.remove(c.modifiers['collision'])
        sw = ob.modifiers.new('lift', 'SHRINKWRAP')
        sw.target = c
        sw.wrap_method = 'NEAREST_SURFACEPOINT'
        sw.wrap_mode = 'OUTSIDE'
        sw.offset = 0.002
        apply_all(ob)
    so = ob.modifiers.new('thickness', 'SOLIDIFY')
    so.thickness = thickness * U
    so.offset = 1.0
    apply_all(ob)
    scene.frame_set(1)
    return smooth(ob)


def attach(child, parent):
    """Hangs a separate part on its prop (both stay where they are)."""
    child.parent = parent
    child.matrix_parent_inverse = Matrix.Identity(4)
    return child
