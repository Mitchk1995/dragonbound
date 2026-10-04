"""The moulding kit hair.py builds every hairstyle and beard with, the way a professional models a moulded LEGO hair
piece: a low-poly cage box-modelled over a proxy of the head, its locks parted by grooves pressed into it and creased,
then a modifier stack applied into one mesh: Subdivision Surface at one level with the creases on, so it stays chunky
(the art contract bans smooth domes); Shrinkwrap of its edge onto the head (a wall's foot set on the skin, an edge
with no wall tucked just under it, so the moulding comes out of the head with no gap or shadow under it); and
Shrinkwrap keeping the rest of it clear of the head. The grooves are real geometry, so the bake (bake.py) shades them
into the model's map, under the painted hair texture. No hair curves or strands: LEGO hair is one moulded piece.

Coordinates are sock_head space (three.js axes: Y up, +Z the face): the hero's head is a 0.46 cube with 0.06 chamfers
centred on the socket, the ears at x +-0.245 (hero.py).
"""
import math

import bmesh
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

from _common import R, _mesh_obj, box, resolve_mat, union

HEAD_HALF, HEAD_BEVEL = 0.23, 0.06
# The parts of the head the hair and beards are fitted to (hero.py): the cube, the ears and the brows.
EARS = [((s * 0.245, -0.02, -0.01), (0.05, 0.13, 0.1), 0.015) for s in (-1, 1)]
BROWS = [((s * 0.1, 0.105, 0.232), (0.11, 0.03, 0.03), (0, 0, s * 0.08)) for s in (-1, 1)]
SKIN_LIFT = 0.002          # the foot of a moulding's edge wall stands this far off the skin
TUCK = 0.004               # an edge with no wall is tucked this far under it
CLEAR = 0.006              # and nothing else of it comes nearer the head (rounded: Head.clear) than this
DOWN = Vector((0, -1, 0))


# ─── The head ────────────────────────────────────────────────────────────────

def _head_solid(parent, segments, name):
    """The hero's head (cube, ears, brows) as one closed solid, its cube's edges bevelled in `segments`."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=2 * HEAD_HALF)
    bmesh.ops.bevel(bm, geom=list(bm.edges), offset=HEAD_BEVEL, segments=segments, affect='EDGES', profile=0.5)
    head = _mesh_obj(bm, parent, (0, 0, 0), (0, 0, 0), R.skin, name=name)
    parts = [box(parent, size, pos, R.skin, bevel=bv) for pos, size, bv in EARS]
    parts += [box(parent, size, pos, R.skin, rot=rot, bevel=0.008) for pos, size, rot in BROWS]
    return union(head, *parts)


class Head:
    """The hero's head as a moulding is fitted to it (hero.py's head: the cube with its chamfered edges, the ears and
    the brows): `skin`, the head itself, that the moulding's edge is shrinkwrapped onto (and `surface` to lay a cage's
    edge on it); `clear`, the same head with its edges rounded instead of chamfered, that the rest of the moulding is
    kept clear of, so no face of it cuts across a sharp corner of the head. remove() both before export."""

    def __init__(self, parent):
        self.skin = _head_solid(parent, 1, 'head_proxy')
        self.clear = _head_solid(parent, 4, 'head_proxy_round')
        self.surface = Skin(self.skin)

    def remove(self):
        for o in (self.skin, self.clear):
            bpy.data.objects.remove(o, do_unlink=True)


def head_sdf(p, r=0.06):
    """Signed distance to a rounded box just enclosing the chamfered head cube (its corners rounded by r): the smooth
    surface the cages are laid out over, at a thickness above it."""
    q = Vector((abs(p.x), abs(p.y), abs(p.z))) - Vector((HEAD_HALF - r,) * 3)
    out = Vector((max(q.x, 0.0), max(q.y, 0.0), max(q.z, 0.0)))
    return out.length + min(max(q.x, q.y, q.z), 0.0) - r


def head_normal(p, k=1e-4):
    g = Vector([head_sdf(p + ax * k) - head_sdf(p - ax * k) for ax in (Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1)))])
    return g.normalized()


def shell(d, t):
    """The point on the surface `t` out from the head (head_sdf = t) straight out from its centre along direction d."""
    d = Vector(d).normalized()
    lo, hi = 0.0, 1.0
    for _ in range(40):
        mid = (lo + hi) / 2
        lo, hi = (mid, hi) if head_sdf(d * mid) < t else (lo, mid)
    return d * lo


def off_head(p, least=0.01):
    """p, pushed straight out from the head until it stands at least `least` off it (the cage's faces then never cut
    in across the head's chamfered corners once subdivided)."""
    p = Vector(p)
    for _ in range(8):
        gap = head_sdf(p)
        if gap >= least:
            break
        p = p + head_normal(p) * (least - gap + 1e-4)
    return p


def bearing(p):
    """Compass bearing of a point round the head, in degrees from the face (+Z): 90 is the left ear (+X)."""
    return math.degrees(math.atan2(p.x, p.z))


def ramp(x, keys):
    """Piecewise-linear value at x through (x, value) keys (held flat past either end)."""
    if x <= keys[0][0]:
        return keys[0][1]
    for (x0, y0), (x1, y1) in zip(keys, keys[1:]):
        if x <= x1:
            return y0 + (y1 - y0) * (x - x0) / (x1 - x0)
    return keys[-1][1]


def keyed(keys):
    """A function of bearing from (bearing, value) keys, mirrored left and right, eased between keys."""
    def f(deg):
        deg = abs((deg + 180) % 360 - 180)
        for (d0, y0), (d1, y1) in zip(keys, keys[1:]):
            if deg <= d1:
                s = (deg - d0) / (d1 - d0)
                return y0 + (y1 - y0) * s * s * (3 - 2 * s)
        return keys[-1][1]
    return f


class Skin:
    """The head proxy's surface, for laying the cage's edge on the skin: `on(p)` is the point of the head straight out
    from its centre through p, SKIN_LIFT out from it."""

    def __init__(self, proxy):
        me, mw = proxy.data, proxy.matrix_world
        bpy.context.view_layer.update()
        local = (proxy.parent.matrix_world if proxy.parent else mw).inverted() @ mw     # (in the socket's own space)
        self.tree = BVHTree.FromPolygons([local @ v.co for v in me.vertices], [list(p.vertices) for p in me.polygons])

    def on(self, p, lift=SKIN_LIFT):
        d = Vector(p).normalized()
        hit, nor, _, _ = self.tree.ray_cast(d * 0.6, -d, 0.6)
        if hit is None:
            raise ValueError(f'no head under {tuple(round(x, 3) for x in p)}')
        return hit + nor * lift


def jaw(beta, y, depth=0.0, r=0.08):
    """The point `depth` out from the side of the head at bearing beta (degrees from the face) and height y, the head
    taken as a prism: its chamfered square carried straight down past the chin, so whatever hangs below the chin hangs
    straight down in front of it (clear of every collar and gorget, which wrap the head's lower edge). The depth is
    measured along the square's rounded (radius r) outward normal, so a beard's surface turns the corners smoothly."""
    b = math.radians(beta)
    d = Vector((math.sin(b), 0.0, math.cos(b)))
    t = min(HEAD_HALF / max(abs(d.x), 1e-9), HEAD_HALF / max(abs(d.z), 1e-9), (2 * HEAD_HALF - HEAD_BEVEL) / (abs(d.x) + abs(d.z)))
    base = Vector((d.x * t, y, d.z * t))
    q = (abs(base.x) - (HEAD_HALF - r), abs(base.z) - (HEAD_HALF - r))
    if q[0] > 0 and q[1] > 0:
        n = Vector((math.copysign(q[0], base.x), 0.0, math.copysign(q[1], base.z))).normalized()
    else:
        n = Vector((math.copysign(1.0, base.x), 0.0, 0.0)) if q[0] > q[1] else Vector((0.0, 0.0, math.copysign(1.0, base.z)))
    return base + n * depth


def sheet_cage(skin, points, on_skin, skip=lambda r, c: False, mat=lambda r, c: 0):
    """A cage over a patch of the head from a grid of points (points[r][c], rows top to bottom, columns left to
    right): on_skin(r, c) marks the vertices tucked under the skin (the patch's whole edge, so it rises out of the
    head with no gap under it); the face below and right of (r, c) is left out where skip(r, c) (a hole, or where a
    braid grows from), and takes material slot mat(r, c). Returns (cage, the grid of vertices)."""
    cage = Cage()
    vs = [[cage.v(skin.on(p) if on_skin(r, c) else Vector(p), skin='tuck' if on_skin(r, c) else None)
           for c, p in enumerate(row)] for r, row in enumerate(points)]
    for r in range(len(vs) - 1):
        for c in range(len(vs[r]) - 1):
            if not skip(r, c):
                cage.face((vs[r][c], vs[r][c + 1], vs[r + 1][c + 1], vs[r + 1][c]), mat(r, c))
    return cage, vs


def head_points(n=20):
    """Points over the hero's head (sock_head space): a grid on each face of the cube pulled onto its chamfers, and
    every corner of its chamfers, where a head pokes through hair first."""
    h, r, pts = HEAD_HALF, HEAD_BEVEL, []
    for i in range(n + 1):
        for j in range(n + 1):
            u, v = -h + 2 * h * i / n, -h + 2 * h * j / n
            for p in ((u, v, h), (u, v, -h), (h, u, v), (-h, u, v), (u, h, v)):
                q = list(p)
                for a, b in ((0, 1), (0, 2), (1, 2)):      # onto the chamfer planes
                    ex = abs(q[a]) + abs(q[b]) - (2 * h - r)
                    if ex > 0:
                        q[a] -= math.copysign(ex / 2, q[a])
                        q[b] -= math.copysign(ex / 2, q[b])
                pts.append(Vector(q))
    for sx in (-1, 1):
        for sy in (-1, 1):
            for sz in (-1, 1):
                for c in ((h - r, h, h - r), (h, h - r, h - r), (h - r, h - r, h)):
                    pts.append(Vector((sx * c[0], sy * c[1], sz * c[2])))
    return pts


def bald_spots(obj, above, lift=0.0015):
    """Head points the hair `obj` leaves showing: every point of head_points() that `above` (point -> bool) says the
    hair should cover, where a ray from the head's centre out through it meets no hair beyond it. Returns them."""
    me, mw = obj.data, obj.matrix_local
    tree = BVHTree.FromPolygons([mw @ v.co for v in me.vertices], [list(p.vertices) for p in me.polygons])
    bad = []
    for p in head_points():
        if not above(p):
            continue
        d = p.normalized()
        hit = tree.ray_cast(Vector(), d, 1.0)
        far = hit[0] is not None and hit[0].length > p.length + lift
        # (the hair beyond the skin: its outermost crossing along the ray must lie outside the head point)
        while hit[0] is not None and not far:
            hit = tree.ray_cast(hit[0] + d * 1e-4, d, 1.0)
            far = hit[0] is not None and hit[0].length > p.length + lift
        if not far:
            bad.append(p)
    return bad


# ─── A hair cap's layout ─────────────────────────────────────────────────────

class Cap:
    """How a hairstyle's cage lies over the head: flow lines (the cage's columns) running from the hairline up to one
    pole (the crown whorl, or the back of the head where the hair is gathered), and rings (its rows) across them. The
    hairline is a height by bearing (`line`, keys for keyed()). `ref` turns the flow lines round the pole so that
    psi = 0 reaches the hairline at the front centre; the layout is mirrored left and right."""

    def __init__(self, line, pole, ref=(0, 0, 1)):
        self.line = keyed(line)
        self.a = Vector(pole).normalized()
        r = Vector(ref)
        self.e1 = (r - self.a * r.dot(self.a)).normalized()
        self.e2 = self.a.cross(self.e1)
        self._edge = {}

    def dir(self, psi, phi):
        """The direction from the head's centre at angle psi round the pole and phi down from it."""
        return (self.a * math.cos(phi) + (self.e1 * math.cos(psi) + self.e2 * math.sin(psi)) * math.sin(phi)).normalized()

    def bare(self, d):
        p = shell(d, 0.0)
        return p.y < self.line(bearing(p))

    def edge(self, psi):
        """How far down from the pole (phi) the flow line at psi meets the hairline."""
        k = round(psi, 7)
        if k not in self._edge:
            th = 0.02
            while th < math.pi and not self.bare(self.dir(psi, th)):
                th += 0.02
            lo, hi = th - 0.02, th
            for _ in range(30):
                mid = (lo + hi) / 2
                lo, hi = (lo, mid) if self.bare(self.dir(psi, mid)) else (mid, hi)
            self._edge[k] = lo
        return self._edge[k]

    def columns(self, n, samples=1440):
        """n flow-line angles spaced evenly along the hairline, the first at the front centre (so with n even the
        layout is symmetric and column n / 2 is at the back centre)."""
        psis = [2 * math.pi * k / samples for k in range(samples + 1)]
        pts = [shell(self.dir(p, self.edge(p)), 0.0) for p in psis]
        acc = [0.0]
        for p0, p1 in zip(pts, pts[1:]):
            acc.append(acc[-1] + (p1 - p0).length)
        out = []
        for c in range(n):
            t = acc[-1] * c / n
            k = max(0, min(samples - 1, next(i for i, a in enumerate(acc) if a >= t) - 1)) if t > 0 else 0
            f = (t - acc[k]) / max(1e-12, acc[k + 1] - acc[k])
            out.append(psis[k] + (psis[k + 1] - psis[k]) * f)
        return out

    def at(self, psi, s):
        """The direction of the point a fraction s of the way up the flow line psi, from the hairline (0) to the pole."""
        return self.dir(psi, self.edge(psi) * (1 - s))

    def from_hairline(self, p, samples=720):
        """How far the point p (on or near the head) lies from the nearest point of the hairline: a measure of how far
        into the hair it is that does not depend on which flow line it is on (flow lines that bunch together, running
        level to a low pole, reach the hairline far apart, so a fraction along each would not agree)."""
        if not hasattr(self, '_line_tree'):
            from mathutils.kdtree import KDTree
            tree = KDTree(samples)
            for k in range(samples):                  # (sampled round the head by bearing, evenly along the hairline)
                b = 2 * math.pi * k / samples
                want, lo, hi = self.line(math.degrees(b)), -3.0, 3.0
                for _ in range(30):                   # the slope of the direction that meets the head at that height
                    mid = (lo + hi) / 2
                    lo, hi = (mid, hi) if shell(Vector((math.sin(b), mid, math.cos(b))), 0.0).y < want else (lo, mid)
                tree.insert(shell(Vector((math.sin(b), lo, math.cos(b))), 0.0), k)
            tree.balance()
            self._line_tree = tree
        return self._line_tree.find(p)[2]


# ─── The cage ────────────────────────────────────────────────────────────────

class Cage:
    """A subdivision cage being box-modelled: vertices, faces (each with a material slot), creased edges, corner
    vertices, and the vertices snapped onto the head: `lift`, the foot of a wall, set on the skin (SKIN_LIFT out), and
    `tuck`, an edge the moulding runs down to with no wall, tucked just under the skin (TUCK in), so the surface comes
    out of the head cleanly instead of standing off it with a shadow under its edge."""

    def __init__(self):
        self.bm = bmesh.new()
        self.ecrease = self.bm.edges.layers.float.new('crease_edge')
        self.vcrease = self.bm.verts.layers.float.new('crease_vert')
        self.skin = {'lift': [], 'tuck': []}

    def v(self, co, skin=None, corner=False):
        vert = self.bm.verts.new(Vector(co))
        if skin:
            self.skin[skin].append(vert)
        if corner:
            vert[self.vcrease] = 1.0
        return vert

    def face(self, verts, mat=0):
        f = self.bm.faces.new(verts)
        f.material_index = mat
        return f

    def crease(self, a, b, value):
        e = self.bm.edges.get((a, b))
        if e is not None:
            e[self.ecrease] = max(e[self.ecrease], value)

    def ring_faces(self, lo, hi, mat=0, closed=True):
        """Quads between two rows of vertices (equal counts)."""
        n = len(lo)
        for i in range(n if closed else n - 1):
            j = (i + 1) % n
            self.face((lo[i], lo[j], hi[j], hi[i]), mat)


def cap_cage(cap, skin, n, rows, point, crown, flush=False):
    """A hair cap's cage over `cap`: n flow-line columns (Cap.columns) by the row fractions `rows` (rows[0] = 0, the
    hairline, up toward the pole; close enough together that no band of the cage spans more than a few centimetres of
    the head, or its faces would cut across the head's chamfered edges), the vertex at column i, row fraction s being
    point(i, s, psi, d) (d: the direction of its spot from the head's centre), never nearer the head than off_head
    allows; a wall from the hairline row in to the skin under it (except at the columns where `flush(i, psi)` holds:
    there the hairline row itself lies on the skin, so the hair runs down onto the head with no edge to it); and the
    last row closed over the crown point `crown` (None: left open, for a tail to carry on from). Returns (cage, psis,
    rows of vertices, the skin row, the crown vertex)."""
    cage = Cage()
    psis = cap.columns(n)
    flat = [bool(flush and flush(i, psi)) for i, psi in enumerate(psis)]
    inner = [cage.v(skin.on(shell(cap.at(psi, 0.0), 0.0)), skin='tuck' if flat[i] else 'lift') for i, psi in enumerate(psis)]
    vs = [[inner[i] if flat[i] and s == 0 else cage.v(off_head(point(i, s, psi, cap.at(psi, s))))
           for i, psi in enumerate(psis)] for s in rows]
    for i in range(n):                            # the wall, where there is one (a triangle where it meets a flush column)
        j = (i + 1) % n
        if not (flat[i] and flat[j]):
            corners = [inner[i], inner[j]] + ([] if flat[j] else [vs[0][j]]) + ([] if flat[i] else [vs[0][i]])
            cage.face(corners)
    for lo, hi in zip(vs, vs[1:]):
        cage.ring_faces(lo, hi)
    top = None
    if crown is not None:
        top = cage.v(crown)
        for i in range(n):
            cage.face((vs[-1][i], vs[-1][(i + 1) % n], top))
    for row in (inner, vs[0]):
        for i in range(n):
            cage.crease(row[i], row[(i + 1) % n], 1.0)
    return cage, psis, vs, inner, top


def tube(cage, first, axis, e1, e2, psis, path, radii, mats=None, lobes=None, tip=None):
    """Carry a ring of the cage on as a tube (a tail, a braid): `first` is the ring it grows from, its columns at
    angles `psis` in the frame (e1, e2) round `axis`; each point of `path` gets a ring of radius `radii[k]`, its frame
    turned from the last one's to follow the path (so the columns run on untwisted), the faces between ring k and the
    one before it in material `mats[k]`. `lobes(i, k)` scales column i's radius on ring k (lock ridges along the
    tube); `tip` closes the tube to a point. Returns the rings (the first included)."""
    rings, axis = [first], Vector(axis).normalized()
    for k, (c, r) in enumerate(zip(path, radii)):
        c = Vector(c)
        d = (c - Vector(path[k - 1])).normalized() if k else axis
        turn = axis.rotation_difference(d)
        f1, f2 = turn @ e1, turn @ e2
        ring = [cage.v(c + (f1 * math.cos(p) + f2 * math.sin(p)) * r * (lobes(i, k) if lobes else 1.0)) for i, p in enumerate(psis)]
        cage.ring_faces(rings[-1], ring, mats[k] if mats else 0)
        rings.append(ring)
    if tip is not None:
        end = cage.v(tip, corner=True)
        n = len(psis)
        for i in range(n):
            cage.face((rings[-1][i], rings[-1][(i + 1) % n], end), mats[-1] if mats else 0)
    return rings


def grow(cage, ring, path, scales, mats=None, tip=None, corner_tip=True):
    """Box-model a tube out of a ring of cage vertices (a face left out of the cage, in that face's order): ring k is
    the first ring's shape (its vertices about its centre) scaled by scales[k] and moved to path[k]; the faces between
    ring k and the one before take mats[k]; `tip` closes it to a point. Returns the rings (the first included)."""
    c0 = sum((v.co for v in ring), Vector()) / len(ring)
    offs = [v.co - c0 for v in ring]
    rings = [list(ring)]
    for k, (c, s) in enumerate(zip(path, scales)):
        new = [cage.v(Vector(c) + o * s) for o in offs]
        cage.ring_faces(rings[-1], new, mats[k] if mats else 0)
        rings.append(new)
    if tip is not None:
        end = cage.v(tip, corner=corner_tip)
        n = len(ring)
        for i in range(n):
            cage.face((rings[-1][i], rings[-1][(i + 1) % n], end), mats[-1] if mats else 0)
    return rings


def lock_creases(cage, vs, rows, grooves, groove=((0.0, 1.0), (0.5, 1.0), (0.8, 0.3)), ridge=0.15, pointed=True,
                 scale=None):
    """Part a cap's cage into locks: the flow lines in `grooves` (column indices) creased into grooves, as sharp as
    `groove` (ramp keys over the row fraction, from the hairline up), the others softly into the crest of each lock
    (`ridge`), every crease times scale(i, s) if given (softer where the locks are narrow); with `pointed`, every
    hairline vertex is a corner, so the lock tips and the notches between them stay sharp."""
    n = len(vs[0])
    for i in range(n):
        for j in range(len(vs) - 1):
            s = (rows[j] + rows[j + 1]) / 2
            value = ramp(s, groove) if i in grooves else ridge
            cage.crease(vs[j][i], vs[j + 1][i], value * (scale(i, s) if scale else 1.0))
        if pointed:
            vs[0][i][cage.vcrease] = 1.0


def mould(cage, parent, color, head, extra=(), name='hair'):
    """The cage as a game mesh: Subdivision Surface at one level (creases on) over it, then its snapped vertices
    shrinkwrapped onto the head (`head`: a Head; the walls' feet SKIN_LIFT off its skin, the tucked edges TUCK under
    it) and everything else kept CLEAR of it, all applied. `extra` are more colour specs for the material slots the
    cage's faces use beyond the first. Returns the object."""
    bm = cage.bm
    bm.normal_update()
    # Outward: the faces point away from the head's centre.
    if sum(f.calc_center_median().dot(f.normal) * f.calc_area() for f in bm.faces) < 0:
        bmesh.ops.reverse_faces(bm, faces=list(bm.faces))
    bm.verts.index_update()
    snapped = {k: [v.index for v in vs] for k, vs in cage.skin.items()}
    o = _mesh_obj(bm, parent, (0, 0, 0), (0, 0, 0), color, name=name)
    for spec in extra:
        o.data.materials.append(resolve_mat(spec))
    for k, idx in list(snapped.items()) + [('edge', snapped['lift'] + snapped['tuck'])]:
        o.vertex_groups.new(name=k).add(idx, 1.0, 'REPLACE')
    sub = o.modifiers.new('subdivide', 'SUBSURF')
    sub.levels = sub.render_levels = 1
    # (Vertices where one subdivision step puts them, not pushed on to the limit surface: the moulding keeps its volume.)
    sub.use_creases, sub.use_limit_surface, sub.quality = True, False, 3
    sub.boundary_smooth = 'PRESERVE_CORNERS'
    # Subdivision spreads the weights onto the vertices next to the edge; only the edge itself (still fully weighted)
    # is snapped onto the head, so the moulding's lower rows are never dragged down toward it.
    for k in ('lift', 'tuck', 'edge'):
        only = o.modifiers.new(f'only the edge ({k})', 'VERTEX_WEIGHT_EDIT')
        only.vertex_group, only.use_remove, only.remove_threshold = k, True, 0.999
    for k, mode, offset in (('lift', 'OUTSIDE_SURFACE', SKIN_LIFT), ('tuck', 'ON_SURFACE', -TUCK)):
        snap = o.modifiers.new(f'onto the skin ({k})', 'SHRINKWRAP')
        snap.target, snap.vertex_group = head.skin, k
        snap.wrap_method, snap.wrap_mode, snap.offset = 'NEAREST_SURFACEPOINT', mode, offset
    keep = o.modifiers.new('clear of the head', 'SHRINKWRAP')
    keep.target, keep.vertex_group, keep.invert_vertex_group = head.clear, 'edge', True
    keep.wrap_method, keep.wrap_mode, keep.offset = 'NEAREST_SURFACEPOINT', 'OUTSIDE', CLEAR
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(o.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
    old = o.data
    o.modifiers.clear()
    o.data = me
    bpy.data.meshes.remove(old)
    o.vertex_groups.clear()
    for a in ('crease_edge', 'crease_vert'):
        if me.attributes.get(a):
            me.attributes.remove(me.attributes[a])
    for p in me.polygons:
        p.use_smooth = False
    return o
