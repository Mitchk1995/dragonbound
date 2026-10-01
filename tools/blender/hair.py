"""Hair (hair_1..4) and beards (beard_1..3) for the hero base.

Each file is one `sock_head` empty whose children are ROLE_hair meshes, authored relative to the
head centre (the base head is a 0.46 cube centred on sock_head; face at +Z, ears at +-0.245 X).
Every hairstyle is ONE sculpted mesh (Mass): a grid of flow lines over the scalp running from the hairline to a
pole (the crown whorl, or the nape where the hair is gathered). A style is made only by moving that grid's points
(volume, lock ridges, tips along the edge, spikes, a tail that carries on from the pole), never by stacking extra
pieces on a base cap, so it reads as one cohesive mass of hair from the gameplay camera above.
"""
import math
import os
import sys

# Repo root: DRAGONBOUND_ROOT, else two levels above this script (when run as a file), else the old fixed path.
_ROOT = os.environ.get('DRAGONBOUND_ROOT') or (os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
                                               if '__file__' in globals() else r'D:\gameplanning')
sys.path.insert(0, os.path.join(_ROOT, 'tools', 'blender'))
import importlib
import _common
importlib.reload(_common)
from _common import *
from _common import _mesh_obj
import bmesh
from mathutils import Vector

PI = math.pi
H = R.hair
BAND = 0x5A3A22   # leather hair tie (authored colour)
BEAD = 0xD9A640   # braid beads (authored colour)

# The head the hair sits on (sock_head space): a 0.46 cube with 0.06 chamfers, centred on the socket.
HEAD_HALF, HEAD_BEVEL = 0.23, 0.06


class Scalp:
    """Rounded box the hair is shaped on: centre (0, yc, dz), half-widths a (x) and b (z), crown at y = top.
    `e` squares off the plan view, `ev` the profile. The head is a cube, so the scalp is boxy enough (e, ev
    around 5 and 4) to wrap its corners: a rounder shell lets the cube's corners poke through at the temples
    and above the ears, which read as bald patches. Angles t run round from the forehead (0) to +X (pi/2)."""

    def __init__(self, a=0.266, b=0.272, top=0.315, yc=0.0, dz=-0.004, e=5.0, ev=4.0):
        self.a, self.b, self.hgt, self.e, self.ev = a, b, top - yc, e, ev
        self.c = Vector((0, yc, dz))

    def gauge(self, d):
        """1 on the surface, growing linearly with distance from the centre (d is centre-relative)."""
        flat = (abs(d.x / self.a) ** self.e + abs(d.z / self.b) ** self.e) ** (self.ev / self.e)
        return (flat + abs(d.y / self.hgt) ** self.ev) ** (1 / self.ev)

    def at(self, t, phi):
        """Surface point at angle t and elevation phi (-pi/2 bottom .. pi/2 crown)."""
        r = scos(phi, self.ev)
        return self.c + Vector((self.a * r * ssin(t, self.e), self.hgt * ssin(phi, self.ev), self.b * r * scos(t, self.e)))

    def bearing(self, t):
        """Real compass bearing (degrees from the forehead) of the surface point at angle t."""
        return math.degrees(math.atan2(self.a * ssin(t, self.e), self.b * scos(t, self.e)))

    def elevation(self, y):
        s = max(-0.99, min(0.99, (y - self.c.y) / self.hgt))
        return math.copysign(math.asin(abs(s) ** (self.ev / 2)), s)

    def normal(self, q):
        d, k = q - self.c, 1e-4
        g = Vector([self.gauge(d + ax * k) - self.gauge(d - ax * k) for ax in (Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1)))])
        return g.normalized()

    def on(self, p, lift=0.0):
        """The surface point straight out from the centre through p, pushed `lift` along the normal."""
        d = Vector(p) - self.c
        q = self.c + d / self.gauge(d)
        return q + self.normal(q) * lift


def hairline(keys):
    """Hairline height at a bearing (degrees from the forehead: 45 = front corner of the head, 90 = over the ear,
    180 = nape) from (bearing, y) keys, mirrored left/right, eased between keys."""
    def y(deg):
        deg = abs((deg + 180) % 360 - 180)
        for (d0, y0), (d1, y1) in zip(keys, keys[1:]):
            if deg <= d1:
                s = (deg - d0) / (d1 - d0)
                return y0 + (y1 - y0) * s * s * (3 - 2 * s)
        return keys[-1][1]
    return y


def head_points(n=16):
    """Points over the chamfered head cube (sock_head space)."""
    h, r, pts = HEAD_HALF, HEAD_BEVEL, []
    for i in range(n + 1):
        for j in range(n + 1):
            u, v = -h + 2 * h * i / n, -h + 2 * h * j / n
            for p in ((u, v, h), (u, v, -h), (h, u, v), (-h, u, v), (u, h, v)):
                q = list(p)
                for a, b in ((0, 1), (0, 2), (1, 2)):      # pull onto the chamfer planes
                    ex = abs(q[a]) + abs(q[b]) - (2 * h - r)
                    if ex > 0:
                        q[a] -= math.copysign(ex / 2, q[a])
                        q[b] -= math.copysign(ex / 2, q[b])
                pts.append(Vector(q))
    return pts


def head_depth(p):
    """How far the point p (sock_head space) lies inside the chamfered head cube (negative outside)."""
    h, r = HEAD_HALF, HEAD_BEVEL
    a = [abs(p[0]), abs(p[1]), abs(p[2])]
    d = min(h - a[0], h - a[1], h - a[2])
    for i, j in ((0, 1), (0, 2), (1, 2)):
        d = min(d, (2 * h - r - a[i] - a[j]) / math.sqrt(2))
    return d


def to_head(q, c, lift=0.004):
    """The point where the line from the scalp centre c out through q crosses the head surface, `lift` outside it:
    where a hairline has to sit so the hair meets the skin instead of floating off it."""
    d = (q - c).normalized()
    lo, hi = 0.0, 0.6
    for _ in range(30):
        mid = (lo + hi) / 2
        lo, hi = (mid, hi) if head_depth(c + d * mid) > 0 else (lo, mid)
    return c + d * (lo + lift)


def hug(q, o, m, band=0.16, keep=0.0):
    """The grid offset `o` of the scalp point q, blended toward the head surface the closer q lies to the hairline of
    the mass m (fully on it, fading out `band` above it): the rim meets the skin at the temples and sides, with no dark
    gap under a floating shell, and the hair swells from there into its volume instead of stepping out in a brim.
    Measured by height above the hairline, not by grid row, because along the sides the lower edge of a mass whose
    pole is at the back is a flow line (it runs over the ear to the temple), not the first row. `keep` (0..1) spares
    part of the volume above the hairline row itself (a quiff rising off the forehead)."""
    above = q.y - m.lo(math.degrees(math.atan2(q.x, q.z - m.sc.c.z)))
    f = max(0.0, 1 - above / band)
    f = 1.0 if above < 0.01 else f * f * (3 - 2 * f) * (1 - keep)
    # Above the rim the target stands a little off the skin (more the higher it is), so the mass never cuts in
    # across the head's chamfered corners between two grid points.
    return o + (to_head(q, m.sc.c, 0.004 + 0.35 * max(0.0, above)) - (q + o)) * f


class Mass:
    """One cohesive mass of hair over the scalp `sc`, down to the (bearing, y) hairline `line`, laid out as a grid of
    flow lines that all run from the hairline to one `pole` on the scalp (the crown whorl, or the nape where the hair
    is gathered): column i is a flow line at angle psi round the pole, row j a ring at fraction j/nv of the way from
    the hairline (row 0) to the pole. The style shapes it only by moving those grid points (volume, lock ridges, tips
    along the edge, spikes), so it stays a single sculpted piece with no add-ons. `ref` picks where psi = 0 points."""

    def __init__(self, sc, line, pole, ref=(0, 0, 1)):
        self.sc, self.lo = sc, hairline(line)
        a = (Vector(pole) - sc.c).normalized()
        r = Vector(ref)
        self.a = a
        self.e1 = (r - a * r.dot(a)).normalized()
        self.e2 = a.cross(self.e1)
        self._edge = {}
        self.warp = None

    def even_rim(self, samples=720):
        """Space the flow lines evenly along the hairline instead of evenly round the pole. A pole far back (a nape or
        a tie) otherwise bunches the columns at the back and leaves a few long straight rim segments across the
        temples, which cut the corners and float off the head."""
        psis = [2 * PI * k / samples for k in range(samples + 1)]
        pts = [self.point(ps, self.edge(ps)) for ps in psis]
        acc = [0.0]
        for p0, p1 in zip(pts, pts[1:]):
            acc.append(acc[-1] + (p1 - p0).length)
        total = acc[-1]

        def warp(u):
            t = (u % 1.0) * total
            k = max(0, min(samples - 1, next((i for i, a in enumerate(acc) if a >= t), samples) - 1))
            f = (t - acc[k]) / max(1e-9, acc[k + 1] - acc[k])
            return psis[k] + (psis[k + 1] - psis[k]) * f + (2 * PI if u >= 1.0 else 0.0)
        self.warp = warp
        return self

    def point(self, psi, th):
        d = self.a * math.cos(th) + (self.e1 * math.cos(psi) + self.e2 * math.sin(psi)) * math.sin(th)
        return self.sc.on(self.sc.c + d)

    def bare(self, q):
        return q.y < self.lo(math.degrees(math.atan2(q.x, q.z - self.sc.c.z)))

    def edge(self, psi):
        """Angle from the pole at which the flow line at psi reaches the hairline."""
        k = round(psi, 6)
        if k not in self._edge:
            th = 0.02
            while th < PI and not self.bare(self.point(psi, th)):
                th += 0.02
            lo, hi = th - 0.02, th
            for _ in range(24):
                mid = (lo + hi) / 2
                lo, hi = (lo, mid) if self.bare(self.point(psi, mid)) else (mid, hi)
            self._edge[k] = lo
        return self._edge[k]

    def grid(self, nu, nv, shape, v_end=1.0):
        """fn(u, v) for surf(): shape(i, j, psi, s, q, n) -> offset vector for grid point (i, j), where s runs from 1
        on the hairline to 0 at the pole, q is the scalp point and n its normal. Rows stop `v_end` of the way to the
        pole (below 1 they end on a ring round it, for a tail to continue from)."""
        def fn(u, v):
            i, j = round(u * nu), round(v * nv)
            psi = self.warp(u) if self.warp else 2 * PI * u
            s = 1 - v * v_end
            th = self.edge(psi) * s
            q = self.point(psi, th)
            n = self.sc.normal(q)
            return tuple(q + shape(i, j, psi, s, q, n))
        return fn


def build_mass(h, m, nu, nv, shape, thick=0.05):
    """The mass as one shell (its rim is the hairline); raises if the head would show through above the hairline."""
    fn = m.grid(nu, nv, shape)
    check_cover(m, fn, nu, nv)
    return surf(h, fn, nu, nv, thick, H, closed_u=True, inside=tuple(m.sc.c), inner=False, walls=(0,))


def check_cover(m, fn, nu, nv, skip_pole=0.0):
    """Head points above the hairline must lie inside the shaped mass (a ray from the scalp centre through each
    meets the mass beyond the head surface): no bald patches. Points within `skip_pole` radians of the pole are left
    to whatever grows out of it (a tail)."""
    from mathutils.bvhtree import BVHTree
    pts = [[Vector(fn(i / nu, j / nv)) for i in range(nu)] for j in range(nv + 1)]
    bm = bmesh.new()
    vs = [[bm.verts.new(p) for p in row] for row in pts]
    for j in range(nv):
        for i in range(nu):
            f = [vs[j][i], vs[j][(i + 1) % nu], vs[j + 1][(i + 1) % nu], vs[j + 1][i]]
            if len({id(x) for x in f}) == 4:
                bm.faces.new(f)
    tree = BVHTree.FromBMesh(bm)
    bm.free()
    bad = []
    for p in head_points(10):
        if p.y < m.lo(math.degrees(math.atan2(p.x, p.z - m.sc.c.z))) + 0.03:
            continue
        d = p - m.sc.c
        if d.angle(m.a) < skip_pole:
            continue
        hit = tree.ray_cast(m.sc.c, d.normalized(), 2.0)
        if hit[0] is None or (hit[0] - m.sc.c).length < d.length + 0.004:
            bad.append(tuple(round(x, 2) for x in p))
    if bad:
        raise ValueError(f'hair mass leaves {len(bad)} head points showing, e.g. {bad[:4]}')


def ridge(i, s, amp, fade=0.35):
    """Lock ridges: every other flow line stands proud of its neighbours, fading out toward the pole."""
    return amp * min(1.0, s / fade) if i % 2 == 0 else 0.0


# Shared hairline (bearing from the forehead in degrees, y): high over the forehead, down at the temples into a
# sideburn in front of the ear, up and over the ear, down behind it and low at the nape.
LINE = [(0, 0.155), (28, 0.145), (45, 0.1), (68, -0.03), (80, 0.065), (102, 0.065), (114, -0.03), (145, -0.1), (180, -0.13)]
DOWN = Vector((0, -1, 0))


def facing(q, want):
    """1 where the scalp point q faces the horizontal bearing `want` (degrees from the forehead), easing to 0 at 60
    degrees away."""
    b = math.degrees(math.atan2(q.x, q.z))
    d = abs((b - want + 180) % 360 - 180)
    return max(0.0, 1 - d / 60) ** 1.5


def hair_1(h):
    """Short crop: a close cap whose flow lines radiate from a whorl at the back of the crown, the ridged locks
    ending in short points all round and a slightly longer fringe brushed over the forehead."""
    sc = Scalp(top=0.305)
    m = Mass(sc, LINE, (0, 0.33, -0.1))

    def shape(i, j, psi, s, q, n):
        o = n * (0.006 + ridge(i, s, 0.016))
        if j == 0 and i % 2 == 0:                                   # lock tips along the hairline
            front = facing(q, 0)
            o += DOWN * (0.03 + 0.012 * front) + n * 0.012 + Vector((0.025 * front, 0, 0))
        return o
    build_mass(h, m, 24, 6, shape)


# Every point of a hairline has to be reachable along a flow line from the pole without crossing bare skin first,
# or the rim cuts straight across the gap. A pole low behind the head makes the side lines run level, so the temple
# fill could not come down past the height it has over the ear; the swept style therefore combs to a whorl at the back
# of the crown and the tied style's tie sits high, and the side hairline runs over the ear at the top of the ear.
# Swept back: a clear forehead with the hairline sitting on it, temple fill to the top of the ear, over the ear and
# down behind it to the nape.
LINE_COMB = [(0, 0.16), (14, 0.172), (30, 0.19), (45, 0.13), (62, 0.064), (78, 0.058), (104, 0.058), (118, -0.04),
             (145, -0.1), (180, -0.13)]
# Long and tied: parted in the middle, the hair frames the face down to the temples, runs back over the ear and falls
# behind it to the jaw, then round to the nape and the tie.
LINE_LONG = [(0, 0.205), (7, 0.16), (28, 0.11), (45, 0.072), (60, 0.058), (106, 0.058), (120, -0.2), (138, -0.2),
             (165, -0.12), (180, -0.11)]


def hair_2(h):
    """Swept back: every flow line runs from the brow over the crown to the nape; the front rises off the forehead in
    a tall combed-back wave (clear forehead below it), ridged like combed locks, down to the
    nape. The rim meets the head all round: short temple fill in front of the ear, no gap at the sides."""
    sc = Scalp(a=0.256, top=0.33, dz=-0.012)
    m = Mass(sc, LINE_COMB, (0, 0.3, -0.2)).even_rim()          # whorl at the back of the crown: every line is combed to it
    nv = 10

    def shape(i, j, psi, s, q, n):
        front = max(0.0, 1 - abs(math.degrees(math.atan2(q.x, q.z))) / 80) ** 0.8   # broad: the wave spans the brow
        # The combed-back wave: it rises from the hairline (a slope up off the forehead, not a brim over it), is
        # highest a little behind it and settles toward the crown.
        rise = min(1.0, (1 - s) / 0.3)
        wave = front * rise * rise * (3 - 2 * rise) * max(0.0, min(1.0, (s - 0.3) / 0.35)) * 0.05
        # The wave leans back (more back than up), so from the front the hair reads combed back over the crown
        # instead of standing up as a tall rounded quiff; the sides lie flat to the head.
        o = n * (0.006 + ridge(i, s, 0.017) + wave * 0.25) + Vector((0, wave * 0.8, -wave * 0.7))
        return hug(q, o, m, keep=front * 0.45)
    build_mass(h, m, 48, nv, shape)


def hair_3(h):
    """Long and tied back: a clear centre parting, the hair framing the face down to the temples, running back over
    each ear and falling behind it to the jaw in a full side mass that shows from the front; every flow line runs back to a tie at
    the back of the head and carries on, unbroken, into a thick tail hanging down the back (one piece: the tail is
    the same surface as the cap)."""
    sc = Scalp(top=0.315)
    pole = Vector((0, 0.14, -0.33))                     # a high tie: the side lines slope down to the temples
    m = Mass(sc, LINE_LONG, pole, ref=(0, 1, 0)).even_rim()
    nu, nv_cap, v_end = 36, 10, 0.8
    # Tail rings after the cap: (centre, radius), ending in the tip.
    tail = [((0, 0.14, -0.37), 0.075), ((0, 0.08, -0.43), 0.1), ((0, -0.06, -0.46), 0.1), ((0, -0.22, -0.44), 0.08),
            ((0, -0.37, -0.4), 0.05), ((0, -0.49, -0.36), 0.0)]
    nv = nv_cap + len(tail)

    def cap_shape(i, j, psi, s, q, n):
        k = min(i % nu, nu - i % nu)                                                 # columns from the centre line
        front = facing(q, 0)
        part = front * min(1.0, s / 0.25) * (-0.06 if k == 0 else 0.04 if k in (1, 2) else 0.015 if k == 3 else 0.0)  # centre parting
        side = max(facing(q, 125), facing(q, -125))                                 # the fall behind the ears
        o = n * (0.012 + part + ridge(i, s, 0.02, 0.2) + 0.03 * max(0, 0.45 - s) + 0.035 * side * min(1.0, s / 0.4))
        return hug(q, o, m)
    cap = m.grid(nu, nv_cap, cap_shape, v_end)
    check_cover(m, cap, nu, nv_cap, skip_pole=0.5)
    a = m.a

    def fn(u, v):
        j = round(v * nv)
        if j <= nv_cap:
            return cap(u, j / nv_cap)
        k = j - nv_cap - 1
        c, r = Vector(tail[k][0]), tail[k][1]
        prev = Vector(tail[k - 1][0]) if k else pole
        rot = a.rotation_difference((c - prev).normalized())
        e1, e2 = rot @ m.e1, rot @ m.e2
        psi = m.warp(u)                                  # the same columns as the cap, so the tail joins untwisted
        rr = r * (1.08 if round(u * nu) % 2 == 0 else 0.92)
        return tuple(c + (e1 * math.cos(psi) + e2 * math.sin(psi)) * rr)
    surf(h, fn, nu, nv, 0.05, H, closed_u=True, inside=tuple(sc.c), inner=False, walls=(0,))
    cyl(h, 0.088, 0.088, 0.05, (0, 0.14, -0.37), BAND, rot=(PI / 2, 0, 0), seg=10)       # the tie


def hair_4(h):
    """Wild mane: one faceted mass whose flow lines radiate from the crown; eight of its grid points are pulled out
    into big spikes sweeping up and back (two rings of four, staggered), and the hairline breaks into long points."""
    sc = Scalp(top=0.32, dz=-0.01)
    m = Mass(sc, LINE, (0, 0.33, -0.04))
    nu, nv = 16, 5
    spikes = {}                                  # (column, row) -> length: spikes pulled out of the grid itself
    for i in range(0, nu, 4):
        spikes[(i, 2)] = 0.15 if i == 0 else 0.24
        spikes[(i + 2, 3)] = 0.22

    def shape(i, j, psi, s, q, n):
        o = n * 0.012
        ln = spikes.get((i % nu, j))
        if ln:
            o += (n + Vector((0, 0.6, -0.9))).normalized() * ln
        if j == 0 and i % 2 == 0:
            o += DOWN * (0.075 - 0.035 * facing(q, 0)) + n * 0.03
        return o
    build_mass(h, m, nu, nv, shape)


def beard_1(h):  # stubble
    box(h, (0.3, 0.1, 0.025), (0, -0.19, 0.236), H, bevel=0.006)                    # chin
    for s in (-1, 1):
        box(h, (0.1, 0.07, 0.025), (s * 0.15, -0.14, 0.236), H, rot=(0, 0, s * 0.35), bevel=0.006)
        box(h, (0.025, 0.16, 0.12), (s * 0.237, -0.12, 0.16), H, bevel=0.006)        # jaw line
    box(h, (0.22, 0.035, 0.025), (0, -0.108, 0.244), H, bevel=0.006)                # moustache shadow
    box(h, (0.34, 0.025, 0.2), (0, -0.237, 0.12), H, bevel=0.006)                   # under chin


def moustache(h, w=0.3, droop=0.1):
    box(h, (w, 0.065, 0.07), (0, -0.105, 0.27), H, bevel=0.02)
    for s in (-1, 1):
        box(h, (0.07, droop + 0.05, 0.06), (s * (w / 2 - 0.01), -0.13 - droop / 2, 0.27), H, rot=(0, 0, s * 0.2), bevel=0.018)


def beard_2(h):  # full beard: one broad block over the jaw narrowing to a clean, square-cut chin
    box(h, (0.46, 0.25, 0.14), (0, -0.21, 0.225), H, bevel=0.04)
    beam(h, (0, -0.31, 0.235), (0, -0.46, 0.25), 0.4, H, w1=0.24, d=0.13, d1=0.1, bevel=0.03)
    for s in (-1, 1):
        box(h, (0.05, 0.22, 0.17), (s * 0.24, -0.08, 0.14), H, bevel=0.015)        # sideburns
    moustache(h)
    box(h, (0.11, 0.035, 0.02), (0, -0.17, 0.296), 0x5A2E24, bevel=0)              # mouth gap


def beard_3(h):  # braided beard: a trimmed beard with a neat braid hanging from each corner of the jaw
    box(h, (0.44, 0.22, 0.13), (0, -0.2, 0.225), H, bevel=0.035)
    for s in (-1, 1):
        box(h, (0.05, 0.2, 0.16), (s * 0.238, -0.08, 0.14), H, bevel=0.015)
        x = s * 0.165
        for i in range(3):                                                          # three even plaits
            box(h, (0.08 - i * 0.008, 0.085, 0.08 - i * 0.008), (x, -0.335 - i * 0.075, 0.25), H, rot=(0, PI / 4, 0), bevel=0.02)
        box(h, (0.075, 0.04, 0.075), (x, -0.53, 0.25), BEAD, rot=(0, PI / 4, 0), bevel=0.01)
        beam(h, (x, -0.55, 0.25), (x, -0.62, 0.25), 0.05, H, w1=0.012)
    moustache(h, w=0.28, droop=0.06)
    box(h, (0.1, 0.03, 0.02), (0, -0.17, 0.29), 0x5A2E24, bevel=0)


BUILDERS = {'hair_1': hair_1, 'hair_2': hair_2, 'hair_3': hair_3, 'hair_4': hair_4,
            'beard_1': beard_1, 'beard_2': beard_2, 'beard_3': beard_3}


def build(name):
    scene, root = fresh_scene(f'DB_{name}')
    # Socket sits where the base hero's head centre is, so the file previews sensibly on its own.
    sock = pivot(root, 'sock_head', (0, 1.92, 0))
    BUILDERS[name](sock)
    return scene


if globals().get('DB_RUN', True):
    tris = {}
    for name in globals().get('DB_ONLY') or list(BUILDERS):   # e.g. DB_ONLY = ['hair_1'] to export only those
        scene = build(name)
        tris[name] = tri_count(scene)
        export(f'DB_{name}', f'{name}.glb')
        if globals().get('DB_PREVIEW', True):   # DB_PREVIEW = False: export only (no EEVEE render)
            preview_auto(f'{name}.png')
        remove_preview_rig()
    result = {'ok': True, 'tris': tris}
    print('HAIR', result)
