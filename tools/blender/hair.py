"""Hair (hair_1..4) and beards (beard_1..3) for the hero base.

Each file is one `sock_head` empty whose children are ROLE_hair meshes, authored relative to the
head centre (the base head is a 0.46 cube centred on sock_head; face at +Z, ears at +-0.245 X).
Every hairstyle is one rounded shell over the scalp (hair_shell) with chunky locks rooted in it (strand),
so it reads as a single mass of hair from the gameplay camera above.
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

# Lock cross-sections (side, up) in half-width units: a flat hexagon with ridged edges, or a diamond for spikes.
SECTION = {6: ((-1, 0), (-0.5, -1), (0.5, -1), (1, 0), (0.5, 1), (-0.5, 1)), 4: ((-1, 0), (0, -1), (1, 0), (0, 1))}


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


def coverage(sc, line, margin=0.012):
    """Worst gauge of the head surface above the hairline (bald-spot check): every point there has to sit inside
    the shell (gauge < 1, with room for the flat facets), or skin shows through the hair."""
    lo = hairline(line)
    worst = 0.0
    for p in head_points():
        if p.y < lo(math.degrees(math.atan2(p.x, p.z - sc.c.z))) + margin:
            continue
        worst = max(worst, sc.gauge(p - sc.c))
    return worst


def hair_shell(h, sc, line, nu=28, nv=8, thick=0.045, jag=0.035):
    """One continuous cap of hair: the scalp `sc` from the crown down to `line`, a (bearing, y) hairline that sits
    high at the forehead, comes down at the temples and in a sideburn, clears the ear and runs low at the nape.
    `jag` notches the lower edge into points all the way round, so it ends in hair tips rather than a helmet rim.
    Raises if the head cube would show through anywhere above the hairline."""
    lo = hairline(line)
    worst = coverage(sc, line)
    if worst > 0.955:
        raise ValueError(f'hair shell leaves the head showing (gauge {worst:.3f})')

    def fn(u, v):
        t = 2 * PI * u
        x = u * nu / 2
        tooth = jag * (1 - abs(2 * (x - math.floor(x)) - 1))
        p0 = sc.elevation(lo(sc.bearing(t)) - tooth)
        return tuple(sc.at(t, p0 + (PI / 2 - p0) * v))
    return surf(h, fn, nu, nv, thick, H, closed_u=True, inside=tuple(sc.c), bevel=0.012, inner=False, walls=(0,))


def lock(h, spine, w, d, n, sides=6, color=H):
    """Chunky lock along `spine` (root first): w wide and d thick at the root, thickness facing `n`, tapering
    to a point at the last spine point. A spine point may carry a 4th value, the width scale there."""
    pts = [Vector(p[:3]) for p in spine]
    k = len(pts)
    side = (pts[-1] - pts[0]).cross(Vector(n))
    side = side.normalized() if side.length > 1e-6 else Vector((1, 0, 0))
    bm = bmesh.new()
    rings = []
    for i, p in enumerate(pts[:-1]):
        tan = (pts[i + 1] - pts[max(i - 1, 0)]).normalized()
        up = tan.cross(side).normalized()
        sd = up.cross(tan)
        f = spine[i][3] if len(spine[i]) > 3 else 1 - (i / (k - 1)) ** 1.6
        rings.append([bm.verts.new(p + sd * (sx * w / 2 * f) + up * (sy * d / 2 * f)) for sx, sy in SECTION[sides]])
    tip = bm.verts.new(pts[-1])
    bm.faces.new(rings[0])
    for a, b in zip(rings, rings[1:]):
        for j in range(sides):
            bm.faces.new((a[j], a[(j + 1) % sides], b[(j + 1) % sides], b[j]))
    for j in range(sides):
        bm.faces.new((rings[-1][j], rings[-1][(j + 1) % sides], tip))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _mesh_obj(bm, h, (0, 0, 0), (0, 0, 0), color)


def strand(h, sc, guides, w, d, sides=6):
    """Lock laid over the scalp: guides are (x, y, z, lift[, width scale]); each is projected onto `sc` and raised
    `lift` off it. Give the first (the root) a negative lift so it grows out of the shell."""
    spine = [tuple(sc.on(g[:3], g[3])) + tuple(g[4:]) for g in guides]
    return lock(h, spine, w, d, sc.normal(sc.on(guides[0][:3])), sides)


def spike(h, sc, root, out, back, length, w, sides=4):
    """Big spike growing out of the shell at `root`: points along the scalp normal tipped `out` more up (+) and
    `back` more rearward (+), with a buried base as wide as the spike so neighbours merge into one mass."""
    base = sc.on(root, 0.02)
    n = sc.normal(base)
    dirn = (n + Vector((0, out, -back))).normalized()
    spine = [(*sc.on(root, -0.05), 1.0), (*base, 1.0), (*(base + dirn * length * 0.45 + n * 0.02), 0.62), tuple(base + dirn * length)]
    return lock(h, spine, w, w * 0.7, n, sides)


# Shared hairline (bearing from the forehead in degrees, y): high over the forehead, down at the temples into a
# sideburn in front of the ear, up and over the ear, down behind it and low at the nape.
LINE = [(0, 0.155), (28, 0.145), (45, 0.1), (68, -0.03), (80, 0.065), (102, 0.065), (114, -0.03), (145, -0.1), (180, -0.13)]


def side_locks(h, sc, s, n=3, y0=0.3, length=0.2, w=0.13, d=0.05, rake=0.08):
    """Locks lying over the side of the head from the crown edge down toward the ear, raked back: hair texture on
    what would otherwise be a smooth wall of shell."""
    for k in range(n):
        z = 0.14 - k * 0.14
        strand(h, sc, [(s * 0.16, y0, z, -0.02), (s * 0.27, y0 - length * 0.45, z - rake * 0.5, 0.02),
                       (s * 0.27, y0 - length, z - rake, 0.012)], w, d)


def hair_1(h):  # short crop: tight cap, short textured crown, fringe brushed to one side, locks over the temples
    sc = Scalp(top=0.305)
    hair_shell(h, sc, LINE, jag=0.03)
    for x in (-0.12, -0.01, 0.1):                                                       # fringe, brushed to one side
        strand(h, sc, [(x * 0.8, 0.3, 0.1, -0.03), (x, 0.25, 0.24, 0.022), (x + 0.06, 0.18, 0.3, 0.02)], 0.14, 0.055)
    for a in range(6):                                                                  # crown whorl
        t = a * PI / 3 + 0.3
        dx, dz = math.sin(t), math.cos(t)
        strand(h, sc, [(0, 0.35, -0.05, -0.015), (dx * 0.1, 0.33, -0.05 + dz * 0.1, 0.02), (dx * 0.22, 0.28, -0.05 + dz * 0.22, 0.008)], 0.13, 0.05)
    for s in (-1, 1):
        side_locks(h, sc, s, n=3, length=0.2)
    for t in (-2.3, -2.75, PI, 2.75, 2.3):                                              # nape
        dx, dz = math.sin(t), math.cos(t)
        strand(h, sc, [(dx * 0.25, 0.18, dz * 0.25, -0.02), (dx * 0.27, 0.02, dz * 0.27, 0.02), (dx * 0.25, -0.13, dz * 0.25, 0.01)], 0.14, 0.05)


def hair_2(h):  # swept back: a tall front rising off the brow, every lock raking back to the nape
    sc = Scalp(top=0.34, dz=-0.01)
    hair_shell(h, sc, LINE, jag=0.03)
    for x in (-0.16, -0.08, 0, 0.08, 0.16):
        strand(h, sc, [(x * 0.9, 0.2, 0.24, -0.03), (x, 0.3, 0.22, 0.07), (x * 1.05, 0.4, 0.02, 0.05),
                       (x * 1.15, 0.28, -0.2, 0.035), (x * 1.2, 0.08, -0.3, 0.03)], 0.14, 0.08)
    for s in (-1, 1):
        strand(h, sc, [(s * 0.24, 0.16, 0.14, -0.02), (s * 0.27, 0.16, 0.0, 0.035), (s * 0.26, 0.1, -0.2, 0.025),
                       (s * 0.2, 0.02, -0.3, 0.01)], 0.13, 0.07)
        strand(h, sc, [(s * 0.2, 0.24, 0.12, -0.02), (s * 0.27, 0.1, 0.1, 0.025), (s * 0.27, 0.0, -0.06, 0.015),
                       (s * 0.25, -0.06, -0.2, 0.008)], 0.12, 0.06)                     # over the temple, back past the ear
    for x in (-0.12, 0, 0.12):                                                          # ducktail flicks at the nape
        strand(h, sc, [(x, 0.1, -0.25, -0.02), (x * 1.1, -0.05, -0.28, 0.03), (x * 1.3, -0.14, -0.3, 0.07)], 0.12, 0.06)


def hair_3(h):  # long, parted and tied back: locks sweep from the part to a tail, side locks frame the face
    sc = Scalp(top=0.32)
    hair_shell(h, sc, LINE, jag=0.03)
    for s in (-1, 1):
        for z in (0.2, 0.06, -0.08):                                                    # from the part to the tie
            strand(h, sc, [(s * 0.03, 0.33, z, -0.03), (s * 0.14, 0.3, z - 0.03, 0.015), (s * 0.24, 0.15, z - 0.12, 0.015),
                           (s * 0.12, 0.1, -0.28, 0.01)], 0.17, 0.05)
        strand(h, sc, [(s * 0.2, 0.22, 0.2, -0.02), (s * 0.27, 0.1, 0.16, 0.03), (s * 0.28, -0.08, 0.15, 0.03),
                       (s * 0.27, -0.24, 0.14, 0.02)], 0.12, 0.07)                      # side lock framing the face
    box(h, (0.17, 0.15, 0.12), (0, 0.11, -0.29), H, bevel=0.04)                        # knot
    box(h, (0.19, 0.05, 0.14), (0, 0.03, -0.31), BAND, bevel=0.012)                     # tie
    lock(h, [(0, 0.06, -0.31), (0, -0.08, -0.34, 0.95), (0, -0.26, -0.35, 0.8), (0, -0.4, -0.34, 0.55), (0, -0.54, -0.31)],
         0.17, 0.12, (0, 0, -1))                                                        # tail
    box(h, (0.12, 0.04, 0.1), (0, -0.37, -0.343), BAND, bevel=0.01)


def hair_4(h):  # wild: one mass of big chunky spikes growing out of the shell and sweeping back
    sc = Scalp(top=0.33, dz=-0.01)
    hair_shell(h, sc, LINE, jag=0.035)
    for x, y, z, out, back, ln, w in ((0, 0.3, 0.18, 0.5, -0.3, 0.24, 0.2),              # over the brow
                                      (0, 0.35, 0.0, 0.2, 0.9, 0.27, 0.22),              # crown
                                      (0, 0.28, -0.2, 0.0, 0.6, 0.28, 0.2),
                                      (0, 0.05, -0.3, -0.5, 0.2, 0.24, 0.2)):             # nape
        spike(h, sc, (x, y, z), out, back, ln, w)
    for s in (-1, 1):
        for x, y, z, out, back, ln, w in ((0.15, 0.27, 0.17, 0.5, -0.2, 0.22, 0.18),
                                          (0.13, 0.35, 0.02, 0.3, 0.8, 0.26, 0.2),
                                          (0.24, 0.22, 0.06, 0.2, 0.5, 0.24, 0.18),
                                          (0.2, 0.26, -0.15, 0.1, 0.7, 0.26, 0.2),
                                          (0.25, 0.08, -0.12, -0.3, 0.6, 0.18, 0.17),
                                          (0.15, 0.02, -0.28, -0.4, 0.4, 0.22, 0.18)):
            spike(h, sc, (s * x, y, z), out, back, ln, w)


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


def beard_2(h):  # full beard
    box(h, (0.46, 0.25, 0.14), (0, -0.21, 0.225), H, bevel=0.04)
    box(h, (0.36, 0.13, 0.13), (0, -0.37, 0.25), H, taper=(1.25, 1.05), bevel=0.035)
    box(h, (0.2, 0.1, 0.1), (0, -0.46, 0.27), H, taper=(1.6, 1.2), bevel=0.03)
    for s in (-1, 1):
        box(h, (0.05, 0.22, 0.17), (s * 0.24, -0.08, 0.14), H, bevel=0.015)        # sideburns
    moustache(h)
    box(h, (0.11, 0.035, 0.02), (0, -0.17, 0.296), 0x5A2E24, bevel=0)              # mouth gap


def beard_3(h):  # braided beard
    box(h, (0.44, 0.22, 0.13), (0, -0.2, 0.225), H, bevel=0.035)
    for s in (-1, 1):
        box(h, (0.05, 0.2, 0.16), (s * 0.238, -0.08, 0.14), H, bevel=0.015)
        x = s * 0.09
        for i in range(3):
            box(h, (0.085, 0.09, 0.08), (x, -0.335 - i * 0.085, 0.27 + i * 0.008), H, rot=(0, 0.6 * s, 0.15 * s * (1 if i % 2 else -1)), bevel=0.02)
        box(h, (0.08, 0.04, 0.08), (x, -0.585, 0.3), BEAD, bevel=0.01)
        cone(h, 0.045, 0.1, (x, -0.65, 0.3), H, rot=(PI, 0, 0), seg=4)
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
        preview_auto(f'{name}.png')
        remove_preview_rig()
    result = {'ok': True, 'tris': tris}
    print('HAIR', result)
