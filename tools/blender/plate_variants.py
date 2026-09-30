"""Plate armour redesign: three candidate sets (A Knight of the Keep, B Warlord, C Dragonguard).

Each set is a full kit with the same socket contract as gear.py (body_plate on sock_chest +
sock_shoulderL/R, helm_full on sock_head, gloves on sock_handL + sock_gloveR, boots on sock_footL/R)
and only role materials, so any tier palette recolours it.

    exec(open(r'D:\\gameplanning\\tools\\blender\\plate_variants.py').read())
    build_variant('A'); report = audit_variant('A'); render_variant('A'); export_variant('A')

Pose checks are numeric, not eyeballed: `audit_variant` dresses the hero the way the game does
(including anim.ts followShoulders: the shoulder socket orbits the arm pivot by 75% of the arm's
rotation), then for every pose in POSES (idle, walk, windup, slam, cast) reports:
  hero_pokes      hero surface points sitting outside a plate that is right behind them, not buried in
                  another mesh and not covered by anything else = visibly poking through the armour
  pauldron_cuts   pauldron surfaces intersecting cuirass/helm surfaces (resting on them is fine)
  pauldron_geo    pauldron extents in torso space and its gap to the cuirass (> 0.02 reads as floating)
  pauldron_cap    the `cap` metric of dev/poseCheck.ts __shoulderReport
  floating        armour pieces touching nothing (idle only)
  handR_blade_dir world direction of sock_handR +Y (a held sword's blade), three.js coords
"""
import math
import os
import re
import sys

sys.path.insert(0, r'D:\gameplanning\tools\blender')
import importlib
import _common
importlib.reload(_common)
from _common import *
from _common import _mesh_obj
from mathutils import Euler, Matrix, Quaternion, Vector
from mathutils.bvhtree import BVHTree

_g = {'DB_RUN': False, '__name__': 'db_gear'}
exec(open(r'D:\gameplanning\tools\blender\gear.py').read(), _g)
SOCKET_POS = _g['SOCKET_POS']
_f = {'__name__': 'db_fit'}
exec(open(r'D:\gameplanning\tools\blender\fitcheck.py').read(), _f)
build_hero, dress = _f['build_hero'], _f['dress']

PI = math.pi
SLIT = 0x0C0A0A
VAR_DIR = os.path.join(ROOT, 'public', 'models', 'variants')
PIECES = ('body_plate', 'helm_full', 'gloves', 'boots')
SHOULDER_FOLLOW = 0.75          # src/render/anim.ts
STEEL = {'metal': 0x9AA4B0, 'trim': 0xD9B25A, 'dark': 0x3E444C, 'leather': 0x6A4428}

# ─── Geometry kit ────────────────────────────────────────────────────────────


def V(*a):
    return Vector(a if len(a) == 3 else a[0])


def rot_to(n, spin=0.0):
    """ZYX euler (what _link uses) that turns local +Y onto direction n, then spins about it."""
    q = Vector((0, 1, 0)).rotation_difference(Vector(n).normalized())
    q = q @ Quaternion((0, 1, 0), spin)
    e = q.to_euler('ZYX')
    return (e.x, e.y, e.z)


def ssin(t, e):
    s = math.sin(t)
    return math.copysign(abs(s) ** (2 / e), s)


def scos(t, e):
    c_ = math.cos(t)
    return math.copysign(abs(c_) ** (2 / e), c_)


def _normal(fn, u, v, inside, h=1e-3):
    u0, u1 = max(0, u - h), min(1, u + h)
    v0, v1 = max(0, v - h), min(1, v + h)
    du = V(fn(u1, v)) - V(fn(u0, v))
    dv = V(fn(u, v1)) - V(fn(u, v0))
    n = du.cross(dv)
    p = V(fn(u, v))
    if n.length < 1e-9:
        n = p - V(inside)
    n.normalize()
    return n if n.dot(p - V(inside)) >= 0 else -n


def sub(fn, u0, u1, v0, v1):
    return lambda u, v: fn(u0 + (u1 - u0) * u, v0 + (v1 - v0) * v)


def grow(fn, d, inside=(0, 0, 0)):
    """Surface pushed d along its outward normal (for trims/straps laid on a plate)."""
    return lambda u, v: tuple(V(fn(u, v)) + _normal(fn, u, v, inside) * d)


def mirror(fn, s):
    return fn if s > 0 else (lambda u, v: (lambda p: (-p[0], p[1], p[2]))(fn(u, v)))


def surf(p, fn, nu, nv, thick, color, closed_u=False, inside=(0, 0, 0), bevel=0.0, nm=None, inner=True, walls=(0, 1)):
    """Thick shell from a parametric surface fn(u, v) -> (x, y, z), u, v in [0, 1].

    Outer skin + side walls `thick` deep (+ inner skin unless inner=False, for plates whose inside is
    never seen, e.g. hoops around the torso), flat shaded. `inside` is any point on the inner side
    (orients normals). `bevel` chamfers the outer rim so edges read as rolled plate. Poles are welded.
    """
    ins = V(inside)
    U = nu if closed_u else nu + 1
    P = [[V(fn(i / nu, j / nv)) for i in range(U)] for j in range(nv + 1)]
    N = [[None] * U for _ in range(nv + 1)]
    tot = 0.0
    for j in range(nv + 1):
        for i in range(U):
            i0, i1 = ((i - 1) % U, (i + 1) % U) if closed_u else (max(i - 1, 0), min(i + 1, U - 1))
            j0, j1 = max(j - 1, 0), min(j + 1, nv)
            n = (P[j][i1] - P[j][i0]).cross(P[j1][i] - P[j0][i])
            if n.length > 1e-9:
                N[j][i] = n.normalized()
                tot += N[j][i].dot(P[j][i] - ins)
    sg = 1 if tot >= 0 else -1
    for j in range(nv + 1):
        adj = P[j + 1] if j < nv else P[j - 1]
        cen = sum(adj, Vector()) / len(adj)
        for i in range(U):
            if N[j][i] is None:      # pole
                N[j][i] = (P[j][i] - cen).normalized()
                if N[j][i].dot(P[j][i] - ins) < 0:
                    N[j][i] = -N[j][i]
            else:
                N[j][i] = N[j][i] * sg
    bm = bmesh.new()
    kind = bm.faces.layers.int.new('kind')
    O = [[bm.verts.new(P[j][i]) for i in range(U)] for j in range(nv + 1)]
    I = [[bm.verts.new(P[j][i] - N[j][i] * thick) for i in range(U)] for j in range(nv + 1)]

    def face(vs, k):
        try:
            f = bm.faces.new(vs)
            f[kind] = k
        except ValueError:
            pass
    cols = range(nu)
    nxt = (lambda i: (i + 1) % U) if closed_u else (lambda i: i + 1)
    for j in range(nv):
        for i in cols:
            face((O[j][i], O[j][nxt(i)], O[j + 1][nxt(i)], O[j + 1][i]), 1)
            if inner:
                face((I[j + 1][i], I[j + 1][nxt(i)], I[j][nxt(i)], I[j][i]), 2)
    for i in cols:   # walls (v = 0 row, v = 1 row), wound consistently with the outer skin
        if 0 in walls:
            face((I[0][i], I[0][nxt(i)], O[0][nxt(i)], O[0][i]), 3)
        if 1 in walls:
            face((O[nv][i], O[nv][nxt(i)], I[nv][nxt(i)], I[nv][i]), 3)
    if not closed_u:
        for j in range(nv):
            face((O[j][0], O[j + 1][0], I[j + 1][0], I[j][0]), 3)
            face((I[j][U - 1], I[j + 1][U - 1], O[j + 1][U - 1], O[j][U - 1]), 3)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    for f in [f for f in bm.faces if f.calc_area() < 1e-10]:
        bm.faces.remove(f)
    for v in [v for v in bm.verts if not v.link_faces]:
        bm.verts.remove(v)
    bm.normal_update()
    # outer skin must face away from `inside`
    s_ = sum((f.normal.dot(f.calc_center_median() - ins)) * f.calc_area() for f in bm.faces if f[kind] == 1)
    if s_ < 0:
        bmesh.ops.reverse_faces(bm, faces=list(bm.faces))
    if bevel > 0:
        edges = [e for e in bm.edges if len(e.link_faces) == 2 and {f[kind] for f in e.link_faces} == {1, 3}]
        if edges:
            bmesh.ops.bevel(bm, geom=edges, offset=bevel, segments=1, affect='EDGES', profile=0.5, clamp_overlap=True)
    o = _mesh_obj(bm, p, (0, 0, 0), (0, 0, 0), color)
    if nm:
        o.name = nm
    return o


def loft_fn(rows, e=3.0, rw=0.5, t0=0.0, t1=2 * PI, zig=None, chev=0.0):
    """Superellipse cross-sections lofted along Y. rows: (y, a, b, ridge_front, ridge_back[, dz]).
    u sweeps the angle t0..t1 (t = 0 is +Z front, t = pi/2 is +X); v walks the rows."""
    def fn(u, v):
        k = v * (len(rows) - 1)
        i = min(int(k), len(rows) - 2)
        f = k - i
        r = [a + (b - a) * f for a, b in zip(rows[i] + (0,) * (6 - len(rows[i])), rows[i + 1] + (0,) * (6 - len(rows[i + 1])))]
        y, a, b, rf, rb, dz = r
        t = t0 + (t1 - t0) * u
        tf = math.atan2(math.sin(t), math.cos(t))
        tb = math.atan2(math.sin(t - PI), math.cos(t - PI))
        z = b * scos(t, e) + rf * max(0.0, 1 - abs(tf) / rw) - rb * max(0.0, 1 - abs(tb) / rw) + dz
        y -= chev * max(0.0, 1 - abs(tf) / (rw * 2))   # chevron: the front dips down
        if zig:   # scalloped / toothed lower edge: (depth, teeth) -- teeth = nu / 2 puts a tip on every odd column
            x_ = u * zig[1]
            y -= zig[0] * (1 - abs(2 * (x_ - math.floor(x_)) - 1)) * (1 - v)
        return (a * ssin(t, e), y, z)
    return fn


def hoop(p, y0, y1, ab0, ab1, thick, color, nu=12, e=3.0, rf=(0, 0), bevel=0.0, t0=0.0, t1=2 * PI, nm=None, dz=0.0,
         inner=False, zig=None, rw=0.5, walls=(0, 1), chev=0.0):
    """Band around local Y from y0 (bottom) to y1 (top); ab = (half width, half depth) at each end."""
    rows = [(y0, ab0[0], ab0[1], rf[0], 0, dz), (y1, ab1[0], ab1[1], rf[1], 0, dz)]
    closed = abs(t1 - t0 - 2 * PI) < 1e-6
    return surf(p, loft_fn(rows, e, rw=rw, t0=t0, t1=t1, zig=zig, chev=chev), nu, 1, thick, color, closed_u=closed,
                inside=(0, (y0 + y1) / 2, dz), bevel=bevel, nm=nm, inner=inner, walls=walls)


def bell_fn(O, phi, R, Rh, th0, th1, a0, a1, flare=0.0, yaw=0.0, drop=0.0, inner_scale=1.0, front_scale=1.0, zig=None):
    """Shoulder bell (L side, socket space): dome/bands around an axis tilted outward by phi.
    theta th0..th1 from the axis (v), azimuth a0..a1 (u, 0 = outward-down, +pi/2 = +Z front)."""
    A = Vector((math.sin(phi), math.cos(phi), 0))
    X = Vector((math.cos(phi), -math.sin(phi), 0))
    Z = Vector((0, 0, 1))
    O = V(O)

    def fn(u, v):
        al = a0 + (a1 - a0) * u
        th = th0 + (th1 + drop * (1 - math.cos(al)) / 2 - th0) * v   # drop: reach further down on the neck side
        if zig:   # toothed lower edge (amount in radians, teeth)
            x_ = u * zig[1]
            th += zig[0] * (1 - abs(2 * (x_ - math.floor(x_)) - 1)) * v
        rh = Rh * math.sin(th) * (1 + flare * v) * (1 - (1 - inner_scale) * (1 - math.cos(al)) / 2)
        rh *= 1 - (1 - front_scale) * abs(math.sin(al))
        d = X * math.cos(al) + Z * math.sin(al)
        return tuple(O + A * (R * math.cos(th)) + d * rh)
    return fn


def stud(p, pos, n, color=R.trim, r=0.022, h=0.03):
    return cone(p, r, h, tuple(V(pos) + V(n).normalized() * (h * 0.3)), color, rot=rot_to(n), seg=4)


def stud_on(p, fn, u, v, inside, color=R.trim, r=0.022):
    n = _normal(fn, u, v, inside)
    return stud(p, V(fn(u, v)) + n * 0.004, n, color, r)


def strap(p, fn, u0, u1, v0, v1, inside, nv=2, color=R.leather, lift=0.008, thick=0.018, buckle=None):
    """Leather strap laid on a surface patch; optional buckle at v = buckle."""
    s = surf(p, grow(sub(fn, u0, u1, v0, v1), lift, inside), 1, nv, thick, color, inside=inside)
    if buckle is not None:
        um = (u0 + u1) / 2
        n = _normal(fn, um, buckle, inside)
        pos = V(fn(um, buckle)) + n * (lift + 0.01)
        w = (V(fn(u1, buckle)) - V(fn(u0, buckle))).length
        box(p, (w * 1.35, 0.055, 0.02), tuple(pos), R.trim, rot=_face_rot(n), bevel=0.006)
    return s


def _face_rot(n):
    """Euler that turns local +Z onto n (thin boxes lying on a surface)."""
    q = Vector((0, 0, 1)).rotation_difference(Vector(n).normalized())
    e = q.to_euler('ZYX')
    return (e.x, e.y, e.z)


def plate_on(p, fn, u, v, size, color, inside, lift=0.01, spin=0.0, bevel=0.012, taper=None):
    """Box lying flat on a surface point (local Z = surface normal)."""
    n = _normal(fn, u, v, inside)
    q = Vector((0, 0, 1)).rotation_difference(n) @ Quaternion((0, 0, 1), spin)
    e = q.to_euler('ZYX')
    return box(p, size, tuple(V(fn(u, v)) + n * (lift + size[2] / 2)), color, rot=(e.x, e.y, e.z), bevel=bevel, taper=taper)


def tag(o, nm):
    o.name = nm
    return o



# ─── Shared body helpers ─────────────────────────────────────────────────────
# sock_chest space. Tunic 0.68 -> 0.73 wide, 0.42 deep, y -0.35..0.31; collar to 0.35 (= head bottom);
# sleeves x 0.345..0.595 at y -0.11..0.21; arm pivot (+-0.47, 0.18); hero belt y -0.37 (+-0.36 x, +-0.23 z)
# with a pouch on the left hip reaching z 0.24; skirt/hem to y -0.62 (+-0.36, +-0.23).
# Shoulder socket space: arm pivot (+-0.01, -0.10), sleeve top y -0.07, x -0.115..0.135 (L), z +-0.135.
CHEST_IN = (0, 0.0, 0)


def T(o, nm):
    o.name = nm
    return o


def cuirass(c, rows, e, nu, rw=0.5, nm='cuirass', bevel=0.018, thick=0.03, zig=None, color=R.metal):
    fn = loft_fn(rows, e, rw=rw, zig=zig)
    surf(c, fn, nu, len(rows) - 1, thick, color, closed_u=True, inside=CHEST_IN, bevel=bevel, nm=nm, inner=False, walls=(0,))
    return fn


def band_on(c, fn, v0, v1, color=R.trim, nu=12, lift=0.006, thick=0.03, nm=None, inner=False, u0=0.0, u1=1.0, closed=True, ins=CHEST_IN):
    """Trim band laid on a lofted surface between rows v0..v1."""
    return surf(c, grow(sub(fn, u0, u1, v0, v1), lift, ins), nu, 1, thick, color, closed_u=closed, inside=ins, nm=nm, inner=inner)


def mp(p, s):
    return (p[0] * s, p[1], p[2])


def tasset(c, t0, t1, ya, yb, a, b, color=R.metal, trim=True, nm='tasset', e=3.0, nu=3, zig=None, flare=0.015):
    tf = loft_fn([(yb, a + flare, b + flare, 0, 0), (ya, a, b, 0, 0)], e, t0=t0, t1=t1, zig=zig)
    ins = (0, (ya + yb) / 2, 0)
    surf(c, tf, nu, 1, 0.022, color, inside=ins, bevel=0.01, nm=nm, inner=False)
    if trim:
        surf(c, grow(sub(tf, 0, 1, 0, 0.2), 0.004, ins), nu, 1, 0.026, R.trim, inside=ins, inner=False, nm=nm + '_rim')
    return tf


VARIANTS = {}

_strip = lambda n: re.sub(r'\.\d{3}$', '', n)


def build_piece(vid, piece):
    scene, root = fresh_scene(f'DB_pv_{vid}_{piece}')
    socks = {}

    def S(name):
        if name not in socks:
            socks[name] = pivot(root, name, SOCKET_POS[name])
        return socks[name]
    VARIANTS[vid][piece](S)
    for o in scene.objects:
        if o.type == 'MESH':
            o['pv'] = piece
            sk = o.parent
            while sk and not _strip(sk.name).startswith('sock_'):
                sk = sk.parent
            o['pv_sock'] = _strip(sk.name) if sk else ''
    return scene


def build_variant(vid):
    return {piece: tri_count(build_piece(vid, piece)) for piece in PIECES}


def export_variant(vid):
    out = os.path.join(VAR_DIR, vid)
    os.makedirs(out, exist_ok=True)
    paths = []
    for piece in PIECES:
        scene = bpy.data.scenes[f'DB_pv_{vid}_{piece}']
        path = os.path.join(out, f'gear_{piece}.glb')
        with bpy.context.temp_override(scene=scene, view_layer=scene.view_layers[0]):
            bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_active_scene=True, export_yup=True,
                                      export_apply=True, export_materials='EXPORT', export_extras=False,
                                      export_animations=False, export_cameras=False, export_lights=False)
        paths.append(path)
    return paths


# ─── Dressing + posing exactly like the game ─────────────────────────────────

def part(scene, name):
    return next(o for o in scene.objects if _strip(o.name) == name)


SOCK_REST = {'sock_shoulderL': (0.46, 0.72, 0), 'sock_shoulderR': (-0.46, 0.72, 0)}   # hero.py, body space
ARM_REST = {'armL': (0.47, 0.62, 0), 'armR': (-0.47, 0.62, 0)}

# anim.ts rot() offsets. idle/walk: humanoid block; windup = swing a=0.4; slam a=0.5; cast a=0.5.
POSES = {
    'idle': {'armL': (0, 0, -0.08), 'armR': (0, 0, 0.08)},
    'walk': {'armL': (-0.5, 0, -0.08), 'armR': (0.5, 0, 0.08), 'legL': (0.7, 0, 0), 'legR': (-0.7, 0, 0)},
    'windup': {'armL': (0, 0, -0.08), 'armR': (-3.2, 0, 0.1)},
    'slam': {'armL': (-3.0, 0, 0), 'armR': (-3.0, 0, 0)},
    'cast': {'armL': (-1.8, 0, 0), 'armR': (-2.2, 0, 0)},
}


def apply_pose(scene, pose):
    """Add pose offsets to the rest rotations, then anim.ts followShoulders(): each shoulder socket
    orbits its arm pivot and turns by SHOULDER_FOLLOW of the arm's rotation (slerp from identity)."""
    for name, r in (pose or {}).items():
        o = part(scene, name)
        o.rotation_euler = tuple(a + b for a, b in zip(o.rotation_euler, r))
    for side in ('L', 'R'):
        arm, sock = part(scene, f'arm{side}'), part(scene, f'sock_shoulder{side}')
        delta = Euler(arm.rotation_euler, 'ZYX').to_quaternion()      # hero arms rest at identity
        turn = Quaternion().slerp(delta, SHOULDER_FOLLOW)
        sock_rest, arm_rest = Vector(SOCK_REST[f'sock_shoulder{side}']), Vector(ARM_REST[f'arm{side}'])
        sock.location = arm_rest + turn @ (sock_rest - arm_rest)
        sock.rotation_mode = 'QUATERNION'
        sock.rotation_quaternion = turn
    bpy.context.view_layer.update()


def dress_variant(vid, pose='idle', extra=(), scene_name='DB_pv_fit'):
    scene, root = build_hero(scene_name)
    missing = dress(scene, [f'DB_pv_{vid}_{p}' for p in PIECES] + list(extra))
    apply_pose(scene, POSES[pose] if isinstance(pose, str) else pose)
    return scene, missing


# ─── Numeric audit ───────────────────────────────────────────────────────────

def _bvh(objs):
    verts, polys, owner = [], [], []
    for o in objs:
        mw = o.matrix_world
        base = len(verts)
        verts += [mw @ v.co for v in o.data.vertices]
        for p in o.data.polygons:
            polys.append([base + i for i in p.vertices])
            owner.append(o)
    return BVHTree.FromPolygons(verts, polys), owner


def _hero_label(o):
    a = o
    while a and _strip(a.name) not in ('head', 'armL', 'armR', 'legL', 'legR', 'body'):
        a = a.parent
    m = o.data.materials[0].name if o.data.materials else '?'
    m = {'db_d9a640_000000_2.0_0': 'buckle', 'db_3a2618_000000_2.0_0': 'sole'}.get(m, m.replace('ROLE_', ''))
    return f'{_strip(a.name) if a else "?"}:{m}'


def _arm_label(o):
    return f'{o["pv_sock"].replace("sock_", "")}:{_strip(o.name)}'


def _samples(o):
    """Points spread over every face (3x3 grid on quads, corners/centre on tris), with world normals."""
    mw = o.matrix_world
    r3 = mw.to_3x3().normalized()
    me = o.data
    out = []
    for p in me.polygons:
        n = (r3 @ p.normal).normalized()
        vs = [mw @ me.vertices[i].co for i in p.vertices]
        if len(vs) == 4:
            for a in (0.08, 0.5, 0.92):
                for b in (0.08, 0.5, 0.92):
                    out.append((vs[0].lerp(vs[1], a).lerp(vs[3].lerp(vs[2], a), b), n))
        else:
            c_ = sum(vs, Vector()) / len(vs)
            out.append((c_, n))
            out += [(v.lerp(c_, 0.1), n) for v in vs]
    return out


def pokes(samplers, tree, owner, label, occ=None, depth=0.1, clear=0.2):
    """Surface points of `samplers` that sit in FRONT of an armour plate from `tree` (the plate is just
    behind them and faces them) while nothing else covers them (`occ`: every mesh, the sample's own
    object excluded), i.e. something visibly poking out through the plate. Returns
    {'<what> > <plate>': (samples, max depth, example point in three.js world coords)}."""
    occ_t, occ_own = occ if occ else (tree, owner)
    res = {}
    for o in samplers:
        for P, n in _samples(o):
            loc, nor, idx, dist = tree.ray_cast(P + n * 0.002, -n, depth)
            if loc is None or nor.dot(-n) >= 0 or owner[idx] is o:
                continue
            q, hidden = P + n * 0.002, False
            # buried inside another mesh (nearest foreign surface faces away from the point)?
            near = [(d_, l_, n_) for (l_, n_, i_, d_) in occ_t.find_nearest_range(P, 0.25) if occ_own[i_] is not o]
            if near:
                d_, l_, n_ = min(near, key=lambda r: r[0])
                if (P - l_).dot(n_) < -1e-4:
                    continue
            for _ in range(4):          # step past hits on the sample's own mesh
                loc2, nor2, idx2, d2 = occ_t.ray_cast(q, n, clear)
                if loc2 is None:
                    break
                if occ_own[idx2] is not o:
                    hidden = True
                    break
                q = loc2 + n * 0.001
            if hidden:
                continue
            k = f'{label(o)} > {_arm_label(owner[idx])}'
            cnt, mx, ex = res.get(k, (0, 0.0, None))
            res[k] = (cnt + 1, round(max(mx, dist), 3), ex if ex and mx >= dist else to_three(P))
    return res


def floating(armour, everything, near=0.015):
    tree, owner = _bvh(everything)
    trees = {o.name: _bvh([o])[0] for o in everything}
    out = []
    for o in armour:
        mw = o.matrix_world
        if any(trees[o.name].overlap(trees[x.name]) for x in everything if x is not o):
            continue
        if not any(owner[i] is not o for v in o.data.vertices for (_, _, i, _) in tree.find_nearest_range(mw @ v.co, near)):
            out.append(_arm_label(o))
    return out


def to_three(v):
    return (round(v.x, 2), round(v.z, 2), round(-v.y, 2))


def audit_scene(scene, check_float=True):
    bpy.context.view_layer.update()
    meshes = [o for o in scene.objects if o.type == 'MESH']
    armour = [o for o in meshes if 'pv' in o]
    hero = [o for o in meshes if 'pv' not in o]
    at, aown = _bvh(armour)
    occ = _bvh(meshes)
    rep = {'hero_pokes': pokes(hero, at, aown, _hero_label, occ)}
    # armour through armour across sockets (pauldron vs cuirass/helm) -- both directions
    sh = [o for o in armour if o['pv_sock'].startswith('sock_shoulder')]
    rest = [o for o in armour if not o['pv_sock'].startswith('sock_shoulder')]
    t1, o1 = _bvh(rest)
    t2, o2 = _bvh(sh)
    # pauldron surfaces cutting through cuirass / helm surfaces (resting on them is fine)
    cuts = {}
    for o in sh:
        ob, _ = _bvh([o])
        for _, j in ob.overlap(t1):
            if o1[j]['pv_sock'] in ('sock_chest', 'sock_head'):
                k = f'{_arm_label(o)} x {_arm_label(o1[j])}'
                cuts[k] = cuts.get(k, 0) + 1
    rep['pauldron_cuts'] = cuts
    if check_float:
        rep['floating'] = floating(armour, meshes)
    capm = {}
    for side in ('L', 'R'):
        arm = part(scene, f'arm{side}')
        joint = arm.matrix_world.translation
        down = (arm.matrix_world.to_3x3() @ Vector((0, -1, 0))).normalized()
        ps = [o for o in sh if o['pv_sock'] == f'sock_shoulder{side}']
        pts = [o.matrix_world @ Vector(cc) for o in ps for cc in o.bound_box]
        mid = sum(pts, Vector()) / len(pts)
        to = mid - joint
        capm[side] = {'cap': round(to.normalized().dot(down), 2), 'dist': round(to.length, 2)}
    rep['pauldron_cap'] = capm
    # pauldron placement in the torso's frame (three.js, sock_chest-relative): extents + gap to the chest
    # plate (> 0.02 reads as floating) + how far it reaches in toward the neck
    chest = [o for o in armour if o['pv_sock'] == 'sock_chest']
    ct, cown = _bvh(chest)
    cs = part(scene, 'sock_chest').matrix_world
    inv = cs.inverted()
    geo = {}
    for side in ('L', 'R'):
        ps = [o for o in sh if o['pv_sock'] == f'sock_shoulder{side}']
        vs = [o.matrix_world @ v.co for o in ps for v in o.data.vertices]
        gap = min(ct.find_nearest(v)[3] for v in vs)
        loc = [inv @ v for v in vs]   # sock_chest local == three.js torso coords
        xs, ys, zs = [p.x for p in loc], [p.y for p in loc], [p.z for p in loc]
        geo[side] = {'gap': round(gap, 3), 'x': (round(min(xs), 2), round(max(xs), 2)), 'y': (round(min(ys), 2), round(max(ys), 2)),
                     'z': (round(min(zs), 2), round(max(zs), 2))}
    rep['pauldron_geo'] = geo
    hr = part(scene, 'sock_handR')
    rep['handR_blade_dir'] = to_three((hr.matrix_world.to_3x3() @ Vector((0, 1, 0))).normalized())
    return rep


def audit_variant(vid, poses=('idle', 'walk', 'windup', 'slam', 'cast')):
    out = {}
    for p in poses:
        scene, missing = dress_variant(vid, p)
        out[p] = audit_scene(scene, check_float=(p == 'idle'))
        if missing:
            out[p]['missing'] = missing
    return out


def tri_report(vid, top=10):
    rows = {}
    for piece in PIECES:
        sc = bpy.data.scenes[f'DB_pv_{vid}_{piece}']
        rows[piece] = sorted(((_strip(o.name), sum(len(p.vertices) - 2 for p in o.data.polygons)) for o in sc.objects if o.type == 'MESH'), key=lambda r: -r[1])[:top]
    return rows


# ─── Rendering ───────────────────────────────────────────────────────────────

def set_palette(pal):
    for k, v in pal.items():
        role(k).node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = hex_rgba(v)


def restore_palette():
    set_palette({k: ROLE_COLORS[k] for k in ('metal', 'trim', 'dark', 'leather')})


def _light_rig(scene):
    for n, (rx, rz, e) in {'pv_key': (50, 35, 2.4), 'pv_fill': (60, 200, 0.7), 'pv_rim': (15, 150, 1.1)}.items():
        d = bpy.data.lights.get(n) or bpy.data.lights.new(n, 'SUN')
        d.energy = e
        o = scene.objects.get(n)
        if not o:
            o = bpy.data.objects.new(n, d)
            scene.collection.objects.link(o)
        o.rotation_euler = (math.radians(rx), 0, math.radians(rz))
    if not scene.world:
        scene.world = bpy.data.worlds.new('pv_world')
    scene.world.use_nodes = True
    bg = scene.world.node_tree.nodes.get('Background')
    bg.inputs['Color'].default_value = (0.11, 0.1, 0.1, 1)
    bg.inputs['Strength'].default_value = 0.55
    scene.render.engine = 'BLENDER_EEVEE'
    scene.view_settings.view_transform = 'Standard'
    scene.render.film_transparent = False


def shot(path, target=(0, 1.1, 0), dist=4.4, yaw=0, pitch=12, res=384, fov=None, resx=None, ortho=None):
    """yaw 0 = camera in front of the hero (+Z), 90 = on the hero's left (+X), 180 = behind."""
    scene = bpy.context.scene
    _light_rig(scene)
    tx, ty, tz = target
    tgt = Vector((tx, -tz, ty))
    yr, pr = math.radians(yaw), math.radians(pitch)
    off = Vector((math.sin(yr) * math.cos(pr), -math.cos(yr) * math.cos(pr), math.sin(pr))) * dist
    cd = bpy.data.cameras.get('pv_cam') or bpy.data.cameras.new('pv_cam')
    cam = scene.objects.get('pv_cam')
    if not cam:
        cam = bpy.data.objects.new('pv_cam', cd)
        scene.collection.objects.link(cam)
    cam.location = tgt + off
    cam.rotation_mode = 'QUATERNION'
    cam.rotation_quaternion = (tgt - cam.location).to_track_quat('-Z', 'Y')
    cd.type = 'ORTHO' if ortho else 'PERSP'
    if ortho:
        cd.ortho_scale = ortho
    elif fov:
        cd.sensor_fit = 'VERTICAL'
        cd.angle = math.radians(fov)
    else:
        cd.sensor_fit = 'AUTO'
        cd.lens = 50
    scene.camera = cam
    scene.render.resolution_x = resx or res
    scene.render.resolution_y = res
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    return path


def _load_px(p):
    import numpy as np
    img = bpy.data.images.load(p, check_existing=False)
    px = np.array(img.pixels[:], dtype=np.float32).reshape(img.size[1], img.size[0], 4)
    bpy.data.images.remove(img)
    return px


def _save_px(px, file_name):
    out = bpy.data.images.new('pv_sheet', px.shape[1], px.shape[0], alpha=True)
    out.pixels = px.ravel()
    path = os.path.join(PREVIEW_DIR, file_name)
    out.filepath_raw = path
    out.file_format = 'PNG'
    out.save()
    bpy.data.images.remove(out)
    return path


def sheet(file_name, views, **kw):
    import numpy as np
    tiles = []
    for i, v in enumerate(views):
        p = shot(os.path.join(PREVIEW_DIR, f'_pv_tile{i}.png'), **{**kw, **v})
        tiles.append(_load_px(p))
        os.remove(p)
    return _save_px(np.concatenate(tiles, axis=1), file_name)


def _cleanup(scene):
    for n in ('pv_cam', 'pv_key', 'pv_fill', 'pv_rim'):
        o = scene.objects.get(n)
        if o:
            bpy.data.objects.remove(o, do_unlink=True)


GAME_PITCH = math.degrees(math.atan2(21, 14))   # game.ts camera offset (0, 21z, 14z) -> ~56 deg, fov 42


def render_variant(vid, which=('sheet', 'gamecam', 'armup')):
    set_palette(STEEL)
    out = {}
    if 'sheet' in which or 'gamecam' in which:
        scene, _ = dress_variant(vid, 'idle')
        if 'sheet' in which:
            out['sheet'] = sheet(f'plate_{vid}_sheet.png', [dict(yaw=0, pitch=8), dict(yaw=40, pitch=16), dict(yaw=180, pitch=10),
                                                             dict(yaw=180, pitch=GAME_PITCH, fov=42, dist=4.3)],
                                 target=(0, 1.05, 0), dist=4.6, res=440)
        if 'gamecam' in which:
            out['gamecam'] = sheet(f'plate_{vid}_gamecam.png', [dict(yaw=180), dict(yaw=35), dict(yaw=-100)], target=(0, 1.0, 0),
                                   dist=5.0, pitch=GAME_PITCH, fov=42, res=440)
        _cleanup(scene)
    if 'armup' in which:
        scene, _ = dress_variant(vid, 'windup', ['DB_gear_longsword'])
        out['armup'] = sheet(f'plate_{vid}_armup.png', [dict(yaw=0, pitch=8), dict(yaw=-90, pitch=8), dict(yaw=-35, pitch=25),
                                                        dict(yaw=180, pitch=GAME_PITCH, fov=42, dist=6.2)], target=(0, 1.35, 0), dist=5.4, res=440)
        _cleanup(scene)
    restore_palette()
    return out


def closeup(vid, file_name, pose='idle', views=(dict(yaw=0, pitch=8), dict(yaw=40, pitch=20)), target=(0, 1.55, 0), dist=2.6, res=480):
    """Debug close-ups (not part of the deliverables)."""
    set_palette(STEEL)
    scene, _ = dress_variant(vid, pose)
    p = sheet(file_name, list(views), target=target, dist=dist, res=res)
    _cleanup(scene)
    restore_palette()
    return p


def render_compare(vids=('A', 'B', 'C')):
    import numpy as np
    set_palette(STEEL)
    tiles = []
    for vid in vids:
        scene, _ = dress_variant(vid, 'idle')
        p = shot(os.path.join(PREVIEW_DIR, f'_pv_cmp_{vid}.png'), target=(0, 1.05, 0), dist=4.6, yaw=35, pitch=16, res=520, resx=420)
        tiles.append(_load_px(p))
        os.remove(p)
        _cleanup(scene)
    restore_palette()
    return _save_px(np.concatenate(tiles, axis=1), 'plate_compare.png')


# ─── Extra shapes ────────────────────────────────────────────────────────────

PAUL_O = (0.04, -0.12, 0)   # shoulder-socket anchor of every pauldron bell (over the arm pivot, a bit out)


def blade_fn(base, d, up, length, width, curl=0.0, bulge=0.02, taper=0.8, tipw=0.004):
    """Long tapering curved plate (wing finger / feather / fin): v along its length, u across it."""
    base, d = V(base), V(d).normalized()
    side = d.cross(V(up)).normalized()
    up2 = side.cross(d).normalized()

    def fn(u, v):
        w = width * max(0.0, 1 - v) ** taper + tipw
        x = 2 * u - 1
        cen = base + d * (length * v) + up2 * (curl * v * v)
        return tuple(cen + side * (x * w) + up2 * (bulge * (1 - x * x) * (1 - v)))
    return fn, tuple(base - up2 * 0.08)


def horn(p, pts, radii, color, seg=5):
    """Chain of tapered cylinders through three.js-space points."""
    for (a, b), (ra, rb) in zip(zip(pts, pts[1:]), zip(radii, radii[1:])):
        a, b = V(a), V(b)
        d = b - a
        cyl(p, max(rb, 0.0015), ra, d.length * 1.08, tuple((a + b) / 2), color, rot=rot_to(d), seg=seg)


def spike(p, pos, d, r, h, color=R.trim, seg=4):
    d = V(d).normalized()
    return cone(p, r, h, tuple(V(pos) + d * (h / 2)), color, rot=rot_to(d), seg=seg)


def pauldron_trim(sh, fn, s, ins, v0, v1, nu, color=R.trim, closed=False, lift=0.004, thick=0.03, nm=None):
    return surf(sh, grow(mirror(sub(fn, 0, 1, v0, v1), s), lift, ins), nu, 1, thick, color, closed_u=closed, inside=ins, inner=False, nm=nm)


def front_patch(fn, u_half, v0, v1, vtop=None):
    """Patch of a lofted torso around the front (u in [-u_half, u_half] turns); optional V-shaped top
    edge: vtop(k) with k in [-1, 1] across the patch."""
    def g(u, v):
        k = 2 * u - 1
        top = vtop(k) if vtop else v1
        return fn((k * u_half) % 1.0, v0 + (top - v0) * v)
    return g


# ═══ A: Knight of the Keep ═══════════════════════════════════════════════════
# Rounded, noble, clean. Barrel-chested squircle cuirass with a soft keel and a V plackart,
# heater-shield crest, tabard in the hero's cloth dye; big domed pauldrons with three lames and
# rolled gold edges; round great helm with a comb and plume.

def A_body(S):
    c = S('sock_chest')
    rows = [(-0.31, 0.385, 0.29, 0.03, 0.0), (-0.12, 0.395, 0.3, 0.045, 0.0), (0.08, 0.405, 0.315, 0.06, 0.015),
            (0.24, 0.4, 0.3, 0.035, 0.01), (0.325, 0.37, 0.265, 0, 0), (0.355, 0.31, 0.245, 0, 0), (0.37, 0.27, 0.235, 0, 0)]
    fn = cuirass(c, rows, 3.2, 12, rw=0.6)
    # plackart: lower breastplate with a V top edge, trimmed
    pl = front_patch(fn, 0.15, 0.02, 0.5, vtop=lambda k: 0.5 - 0.2 * abs(k))
    surf(c, grow(pl, 0.012, CHEST_IN), 6, 2, 0.02, R.metal, inside=CHEST_IN, nm='plackart', inner=False)
    surf(c, grow(lambda u, v: pl(u, 0.86 + 0.14 * v), 0.016, CHEST_IN), 6, 1, 0.022, R.trim, inside=CHEST_IN, inner=False, nm='plackart_rim')
    # gorget + rim
    hoop(c, 0.34, 0.415, (0.305, 0.295), (0.29, 0.28), 0.03, R.metal, nu=10, e=2.6, bevel=0.012, nm='gorget', walls=(1,))
    hoop(c, 0.405, 0.43, (0.297, 0.287), (0.292, 0.282), 0.03, R.trim, nu=10, e=2.6, nm='gorget_rim')
    # crest: heater shield on the breast
    shield = [(-0.1, 0.065), (0.1, 0.065), (0.1, -0.03), (0.045, -0.11), (0.0, -0.14), (-0.045, -0.11), (-0.1, -0.03)]
    T(prism(c, shield, 0.03, (0, 0.2, 0.37), R.trim), 'crest')
    T(prism(c, [(x * 0.78, y * 0.8 + 0.004) for x, y in shield], 0.03, (0, 0.2, 0.38), R.dark), 'crest_field')
    T(box(c, (0.032, 0.15, 0.02), (0, 0.185, 0.395), R.trim, bevel=0), 'crest_cross')
    T(box(c, (0.12, 0.032, 0.02), (0, 0.21, 0.395), R.trim, bevel=0), 'crest_bar')
    # three abdominal lames, upper ones overlapping the lower ones
    for i, (y0, y1) in enumerate(((-0.375, -0.29), (-0.44, -0.355), (-0.505, -0.42))):
        hoop(c, y0, y1, (0.41 - 0.005 * i, 0.305 - 0.004 * i), (0.4 - 0.005 * i, 0.297 - 0.004 * i), 0.024, R.metal, nu=12, e=4.0,
             rf=(0.02, 0.02), rw=0.6, nm=f'lame_{"abc"[i]}', walls=(0,), chev=0.015)
    # belt + buckle
    hoop(c, -0.555, -0.495, (0.41, 0.3), (0.41, 0.3), 0.025, R.leather, nu=12, e=4.0, nm='belt')
    T(box(c, (0.14, 0.1, 0.03), (0, -0.525, 0.32), R.trim, bevel=0.01), 'buckle')
    T(box(c, (0.08, 0.045, 0.02), (0, -0.525, 0.333), R.dark, bevel=0), 'buckle_hole')
    # faulds: mail skirt + two-lame front tassets + culet
    hoop(c, -0.68, -0.54, (0.43, 0.3), (0.415, 0.295), 0.02, R.dark, nu=12, e=5.0, nm='fauld_mail', walls=(0,))
    for s in (-1, 1):
        t0, t1 = (0.2, 1.25) if s > 0 else (-1.25, -0.2)
        sd = 'LR'[s < 0]
        tasset(c, t0, t1, -0.54, -0.67, 0.44, 0.32, trim=False, nm=f'tasset_up{sd}', e=5.0)
        tasset(c, t0, t1, -0.64, -0.78, 0.455, 0.335, nm=f'tasset_lo{sd}', e=5.0)
    tasset(c, PI - 1.0, PI + 1.0, -0.54, -0.74, 0.44, 0.32, nm='culet', e=5.0, nu=4)
    # tabard (hero cloth dye) between the tassets
    T(box(c, (0.19, 0.3, 0.02), (0, -0.7, 0.325), R.cloth, rot=(-0.05, 0, 0), taper=(1.12, 1), bevel=0), 'tabard')
    T(prism(c, [(-0.095, 0.0), (0.095, 0.0), (0.0, -0.08)], 0.02, (0, -0.85, 0.333), R.cloth, rot=(-0.05, 0, 0)), 'tabard_tip')
    # backplate: two shoulder-blade plates with rolled edges, a gold spine
    for s in (-1, 1):
        bp = lambda u, v, s=s: fn((0.5 + s * (0.02 + 0.14 * u)) % 1.0, 0.5 + 0.3 * v)
        surf(c, grow(bp, 0.016, CHEST_IN), 2, 2, 0.022, R.metal, inside=CHEST_IN, bevel=0.008, nm='scapula', inner=False)
    T(box(c, (0.05, 0.36, 0.03), (0, 0.02, -0.315), R.trim, bevel=0), 'spine')

    for name, s in (('sock_shoulderL', 1), ('sock_shoulderR', -1)):
        sh = S(name)
        # anchor over the arm; short on the neck side so it hugs the cuirass corner and clears the helm
        O, phi, Rv, Rh = PAUL_O, 0.2, 0.3, 0.27
        ins = mp((0.04, -0.14, 0), s)
        kw = dict(inner_scale=0.42, front_scale=1.3)
        capf = bell_fn(O, phi, Rv, Rh, 0.0, 1.22, -PI, PI, drop=0.1, **kw)
        surf(sh, mirror(capf, s), 8, 3, 0.03, R.metal, closed_u=True, inside=ins, bevel=0.016, nm='pauldron_cap', walls=(1,))
        pauldron_trim(sh, capf, s, ins, 0.88, 1.0, 8, closed=True, thick=0.036, nm='cap_roll')
        surf(sh, grow(mirror(bell_fn(O, phi, Rv, Rh, 0.0, 0.95, -0.07, 0.07, **kw), s), 0.006, ins), 1, 3, 0.035, R.trim, inside=ins, nm='cap_ridge', inner=False)
        for i in range(3):                                   # lames under the cap, outer side only
            th0, th1 = 1.1 + 0.2 * i, 1.4 + 0.2 * i
            k = 1 + 0.045 * (i + 1)
            lf = bell_fn(O, phi, Rv * k, Rh * k, th0, th1, -1.45 + 0.12 * i, 1.45 - 0.12 * i, **kw)
            surf(sh, mirror(lf, s), 6, 1, 0.022, R.metal, inside=ins, nm=f'p_lame_{"abc"[i]}', inner=True, walls=(1,))
            pauldron_trim(sh, lf, s, ins, 0.75, 1.0, 6, color=R.trim if i == 2 else R.dark, thick=0.026, nm=f'p_lame_edge{i}')
        for k in (3, 5):     # on mesh columns / rows so they sit on the faceted cap
            T(stud_on(sh, mirror(capf, s), k / 8, 2 / 3, ins), 'cap_rivet')
        sf = bell_fn(O, phi, Rv * 1.16, Rh * 1.16, 1.12, 1.85, -0.1, 0.1, **kw)
        strap(sh, mirror(sf, s), 0, 1, 0, 1, ins, nv=2, lift=0.006, buckle=0.4)


def A_helm(S):
    h = S('sock_head')
    ins = (0, 0.1, 0)
    rows = [(-0.21, 0.33, 0.33, 0.02, 0), (0.0, 0.315, 0.32, 0.03, 0), (0.2, 0.305, 0.31, 0.02, 0), (0.33, 0.245, 0.25, 0, 0),
            (0.42, 0.135, 0.14, 0, 0), (0.455, 0.0, 0.0, 0, 0)]
    fn = loft_fn(rows, 2.6, rw=0.6)
    surf(h, fn, 12, 5, 0.03, R.metal, closed_u=True, inside=ins, bevel=0.018, nm='helm_shell', inner=False, walls=(0,))
    band_on(h, fn, 0.0, 0.06, nm='helm_rim', ins=ins, thick=0.035)
    T(box(h, (0.42, 0.065, 0.02), (0, 0.075, 0.345), SLIT, bevel=0), 'eye_slit')
    T(box(h, (0.46, 0.045, 0.045), (0, 0.13, 0.337), R.metal, bevel=0.012), 'visor_brow')
    T(box(h, (0.05, 0.3, 0.05), (0, -0.07, 0.352), R.metal, bevel=0.012), 'visor_keel')
    for s in (-1, 1):
        for i in range(3):
            T(box(h, (0.022, 0.07, 0.04), (s * (0.08 + 0.045 * i), -0.06, 0.335 - 0.006 * i), SLIT, bevel=0), 'breath')
    T(prism(h, [(-0.25, 0.0), (0.25, 0.0), (0.21, 0.08), (0.0, 0.12), (-0.23, 0.09)], 0.05, (0, 0.43, 0), R.trim, rot=(0, PI / 2, 0)), 'crest_comb')
    T(prism(h, [(-0.04, 0.0), (0.2, 0.0), (0.36, -0.06), (0.42, 0.06), (0.3, 0.2), (0.08, 0.2), (-0.04, 0.1)], 0.07, (0, 0.47, 0.02), R.cloth, rot=(0, PI / 2, 0)), 'plume')


def A_gloves(S):
    for name, s in (('sock_handL', 1), ('sock_gloveR', -1)):
        g = S(name)
        T(box(g, (0.31, 0.26, 0.31), (0, -0.01, 0), R.metal, bevel=0.05), 'fist')
        T(box(g, (0.325, 0.08, 0.325), (0, -0.11, 0.005), R.metal, bevel=0), 'finger_lame')
        T(box(g, (0.33, 0.03, 0.33), (0, -0.06, 0.005), R.dark, bevel=0), 'knuckle_gap')
        T(box(g, (0.125, 0.185, 0.135), (-s * 0.07, 0.03, 0.168), R.metal, rot=(0.3, 0, 0), bevel=0.03), 'thumb')
        cf = loft_fn([(0.1, 0.14, 0.145, 0, 0), (0.3, 0.158, 0.165, 0, 0)], 2.4)
        surf(g, cf, 8, 1, 0.025, R.metal, closed_u=True, inside=(0, 0.2, 0), nm='cuff', inner=False)
        band_on(g, cf, 0.8, 1.0, nu=8, lift=0.004, nm='cuff_roll', ins=(0, 0.2, 0))


def A_boots(S):
    for name in ('sock_footL', 'sock_footR'):
        f = S(name)
        T(box(f, (0.34, 0.195, 0.44), (0, -0.08, 0.055), R.metal, bevel=0.05), 'foot')
        T(box(f, (0.31, 0.12, 0.14), (0, -0.06, 0.24), R.metal, rot=(-0.3, 0, 0), bevel=0.03), 'sabaton_toe')
        T(box(f, (0.36, 0.035, 0.46), (0, -0.166, 0.055), R.dark, bevel=0), 'sole')
        gi = (0, 0.15, 0)
        gf = loft_fn([(0.035, 0.18, 0.185, 0.02, 0), (0.34, 0.17, 0.175, 0.035, 0)], 2.6)
        surf(f, gf, 8, 1, 0.025, R.metal, closed_u=True, inside=gi, nm='greave', inner=False)
        ki = (0, 0.39, 0)
        kf = loft_fn([(0.32, 0.2, 0.2, 0.02, 0), (0.47, 0.205, 0.205, 0.04, 0)], 2.4, t0=-1.8, t1=1.8)
        surf(f, kf, 5, 1, 0.025, R.metal, inside=ki, bevel=0.01, nm='poleyn', inner=False)
        T(box(f, (0.1, 0.1, 0.03), (0, 0.39, 0.228), R.trim, rot=(0, 0, PI / 4), bevel=0), 'knee_boss')


VARIANTS['A'] = {'name': 'Knight of the Keep', 'body_plate': A_body, 'helm_full': A_helm, 'gloves': A_gloves, 'boots': A_boots}


# ═══ B: Warlord ══════════════════════════════════════════════════════════════
# Angular and heavy: octagonal cuirass with a hard keel and slab pectorals, chevron lames, a fanged
# maw buckle, crossed back straps; three stacked serrated pauldron tiers crowned with spikes;
# faceted bucket helm with an angry V brow, fanged jaw guard and a spiked crest.

def B_body(S):
    c = S('sock_chest')
    rows = [(-0.31, 0.385, 0.285, 0.03, 0.0), (-0.1, 0.4, 0.295, 0.06, 0.01), (0.12, 0.425, 0.31, 0.095, 0.02),
            (0.26, 0.42, 0.3, 0.06, 0.015), (0.33, 0.38, 0.27, 0, 0), (0.36, 0.31, 0.25, 0, 0), (0.372, 0.27, 0.24, 0, 0)]
    fn = cuirass(c, rows, 8.0, 8, rw=0.8, bevel=0.012)
    band_on(c, fn, 0.0, 0.05, nu=8, color=R.dark, nm='waist_edge')
    # slab pectorals either side of the keel, trimmed bottom edges
    for s in (-1, 1):
        pp = lambda u, v, s=s: fn((s * (0.015 + 0.12 * u)) % 1.0, 0.36 + 0.36 * v)
        surf(c, grow(pp, 0.028, CHEST_IN), 2, 2, 0.03, R.metal, inside=CHEST_IN, bevel=0.012, nm='pectoral', inner=False)
        surf(c, grow(lambda u, v, pp=pp: pp(u, 0.16 * v), 0.034, CHEST_IN), 2, 1, 0.03, R.trim, inside=CHEST_IN, nm='pectoral_edge', inner=False)
        u_ = (s * 0.1) % 1.0
        T(spike(c, V(fn(u_, 0.64)) + _normal(fn, u_, 0.64, CHEST_IN) * 0.03, _normal(fn, u_, 0.64, CHEST_IN), 0.03, 0.06, R.dark), 'pec_stud')
    # high angular collar, taller at the back
    hoop(c, 0.34, 0.45, (0.31, 0.3), (0.3, 0.29), 0.035, R.metal, nu=8, e=8.0, nm='gorget', walls=(1,), chev=0.05, rw=1.2, bevel=0.01)
    hoop(c, 0.435, 0.465, (0.305, 0.295), (0.3, 0.29), 0.03, R.dark, nu=8, e=8.0, nm='gorget_rim', chev=0.05, rw=1.2)
    # chevron lames
    for i, (y0, y1) in enumerate(((-0.385, -0.29), (-0.45, -0.36), (-0.515, -0.425))):
        hoop(c, y0, y1, (0.41 - 0.006 * i, 0.3 - 0.005 * i), (0.4 - 0.006 * i, 0.292 - 0.005 * i), 0.026, R.metal, nu=8, e=8.0,
             rf=(0.03, 0.03), rw=0.8, nm=f'lame_{"abc"[i]}', walls=(0,), chev=0.05, bevel=0.008)
    # heavy belt with a fanged maw buckle
    hoop(c, -0.575, -0.5, (0.415, 0.305), (0.415, 0.305), 0.028, R.leather, nu=8, e=8.0, nm='belt')
    T(prism(c, [(-0.1, 0.06), (0.1, 0.06), (0.12, -0.0), (0.06, -0.07), (-0.06, -0.07), (-0.12, 0.0)], 0.04, (0, -0.53, 0.33), R.trim, bevel=0.01), 'maw')
    T(box(c, (0.14, 0.035, 0.02), (0, -0.545, 0.353), R.dark, bevel=0), 'maw_mouth')
    for s in (-1, 1):
        T(box(c, (0.04, 0.025, 0.02), (s * 0.05, -0.505, 0.353), R.dark, rot=(0, 0, s * 0.35), bevel=0), 'maw_eye')
        T(spike(c, (s * 0.035, -0.53, 0.358), (0, -1, 0.15), 0.018, 0.08, R.trim, seg=3), 'fang')
        T(spike(c, (s * 0.1, -0.5, 0.34), (s * 0.7, 0.7, 0.2), 0.025, 0.09, R.trim, seg=3), 'maw_horn')
    # faulds: dark mail + angular tassets with spike studs + culet
    hoop(c, -0.7, -0.56, (0.435, 0.305), (0.42, 0.3), 0.02, R.dark, nu=8, e=8.0, nm='fauld_mail', walls=(0,))
    for s in (-1, 1):
        t0, t1 = (0.25, 1.3) if s > 0 else (-1.3, -0.25)
        sd = 'LR'[s < 0]
        tasset(c, t0, t1, -0.56, -0.7, 0.445, 0.325, trim=False, nm=f'tasset_up{sd}', e=8.0, nu=2)
        tasset(c, t0, t1, -0.66, -0.82, 0.46, 0.34, nm=f'tasset_lo{sd}', e=8.0, nu=2, zig=(0.05, 1))
        T(spike(c, (s * 0.25, -0.6, 0.3), (s * 0.3, 0, 1), 0.028, 0.09), f'tasset_spike{sd}')
    tasset(c, PI - 1.0, PI + 1.0, -0.56, -0.78, 0.445, 0.325, nm='culet', e=8.0, nu=2, zig=(0.06, 1))
    # back: crossed leather straps with a spiked boss
    for s in (-1, 1):
        T(box(c, (0.07, 0.66, 0.02), (0, 0.0, -0.325), R.leather, rot=(0, 0, s * 0.62), bevel=0), 'back_strap')
    T(cyl(c, 0.07, 0.085, 0.04, (0, 0.0, -0.34), R.trim, rot=(PI / 2, 0, 0), seg=6), 'back_boss')
    T(spike(c, (0, 0.0, -0.355), (0, 0, -1), 0.04, 0.1), 'back_spike')

    for name, s in (('sock_shoulderL', 1), ('sock_shoulderR', -1)):
        sh = S(name)
        O, phi, Rv, Rh = PAUL_O, 0.22, 0.29, 0.27
        ins = mp((0.04, -0.14, 0), s)
        kw = dict(inner_scale=0.42, front_scale=1.25)
        top = bell_fn(O, phi, Rv, Rh, 0.0, 1.12, -PI, PI, drop=0.12, **kw)
        surf(sh, mirror(top, s), 6, 2, 0.035, R.metal, closed_u=True, inside=ins, bevel=0.012, nm='tier_top', walls=(1,))
        pauldron_trim(sh, top, s, ins, 0.85, 1.0, 6, closed=True, color=R.trim, thick=0.04, nm='tier_top_rim')
        for i in range(2):                        # stacked serrated tiers below, stepping out
            k = 1.1 + 0.1 * i
            tf = bell_fn(O, phi, Rv * k, Rh * k, 1.0 + 0.28 * i, 1.4 + 0.3 * i, -1.9 + 0.2 * i, 1.9 - 0.2 * i, zig=(0.14, 3), **kw)
            surf(sh, mirror(tf, s), 6, 1, 0.03, R.metal, inside=ins, bevel=0.01, nm=f'tier_{i}', inner=True, walls=(1,))
            pauldron_trim(sh, tf, s, ins, 0.0, 0.2, 6, color=R.dark, thick=0.03, nm=f'tier_shadow{i}')
        # spikes: a big one up-and-out, two raking back/front
        A_ = Vector((math.sin(phi), math.cos(phi), 0))
        tip = V(O) + A_ * (Rv * 0.92)
        T(spike(sh, mp(tuple(tip), s), mp((0.8, 0.6, 0.0), s), 0.075, 0.36, R.trim), 'spike_main')
        for z in (-1, 1):
            T(spike(sh, mp(tuple(tip + Vector((-0.02, -0.04, 0.13 * z))), s), mp((0.5, 0.55, 0.65 * z), s), 0.05, 0.22, R.trim), 'spike_side')
        for a in (-1.0, 1.0):
            T(stud_on(sh, mirror(top, s), (a + PI) / (2 * PI), 0.6, ins, R.dark, r=0.03), 'tier_rivet')
        sf = bell_fn(O, phi, Rv * 1.32, Rh * 1.32, 1.1, 1.95, -0.1, 0.1, **kw)
        strap(sh, mirror(sf, s), 0, 1, 0, 1, ins, nv=2, lift=0.006, buckle=0.55)


def B_helm(S):
    h = S('sock_head')
    ins = (0, 0.1, 0)
    rows = [(-0.22, 0.335, 0.335, 0.06, 0), (0.0, 0.33, 0.33, 0.07, 0), (0.14, 0.3, 0.305, 0.05, 0), (0.24, 0.21, 0.22, 0.02, 0),
            (0.29, 0.0, 0.0, 0, 0)]
    fn = loft_fn(rows, 5.0, rw=0.8)
    surf(h, fn, 8, 4, 0.03, R.metal, closed_u=True, inside=ins, bevel=0.012, nm='helm_shell', inner=False, walls=(0,))
    band_on(h, fn, 0.0, 0.08, nu=8, color=R.dark, nm='helm_rim', ins=ins, thick=0.035)
    # V visor: two plates meeting in a prow, slits and a heavy brow slanting down to the centre (scowl)
    for s in (-1, 1):
        r_ = (0, s * 0.38, s * 0.2)
        T(box(h, (0.22, 0.2, 0.05), (s * 0.105, 0.03, 0.375), R.metal, rot=r_, bevel=0.012), 'visor')
        T(box(h, (0.16, 0.04, 0.02), (s * 0.1, 0.07, 0.405), SLIT, rot=r_, bevel=0), 'eye_slit')
        T(box(h, (0.23, 0.055, 0.06), (s * 0.105, 0.135, 0.39), R.trim, rot=r_, bevel=0.012), 'brow')
        T(spike(h, (s * 0.33, -0.08, 0.1), (s, -0.25, 0.35), 0.04, 0.15), 'cheek_spike')
    # jaw guard jutting forward with fangs
    T(box(h, (0.36, 0.13, 0.07), (0, -0.15, 0.39), R.metal, rot=(-0.35, 0, 0), taper=(1.15, 1), bevel=0.012), 'jaw')
    for x in (-0.11, -0.04, 0.04, 0.11):
        T(spike(h, (x, -0.1, 0.43 - abs(x) * 0.3), (0, 1, 0.25), 0.022, 0.09, R.trim, seg=3), 'fang')
    # blade crest raking back, with spikes
    T(prism(h, [(-0.2, 0.0), (0.28, 0.0), (0.42, 0.1), (0.1, 0.19), (-0.14, 0.1)], 0.05, (0, 0.25, 0.02), R.trim, rot=(0, PI / 2, 0)), 'crest_fin')
    for i, (z, hgt) in enumerate(((0.12, 0.16), (-0.04, 0.22))):
        T(spike(h, (0, 0.33, z), (0, 1, -0.6), 0.045, hgt, R.trim), f'crest_spike{i}')


def B_gloves(S):
    for name, s in (('sock_handL', 1), ('sock_gloveR', -1)):
        g = S(name)
        T(box(g, (0.31, 0.27, 0.31), (0, -0.015, 0), R.metal, bevel=0.03), 'fist')
        T(box(g, (0.335, 0.07, 0.335), (0, -0.06, 0.0), R.dark, bevel=0), 'knuckle_band')
        for z in (-0.08, 0.0, 0.08):
            T(spike(g, (s * 0.1, -0.1, z), (s * 0.2, -1, 0.35), 0.03, 0.08, R.trim, seg=4), 'knuckle_spike')
        T(box(g, (0.125, 0.185, 0.135), (-s * 0.07, 0.03, 0.168), R.metal, rot=(0.3, 0, 0), bevel=0.02), 'thumb')
        cf = loft_fn([(0.1, 0.15, 0.155, 0, 0), (0.3, 0.175, 0.18, 0, 0)], 8.0, t0=PI / 4, t1=PI / 4 + 2 * PI)
        surf(g, cf, 4, 1, 0.025, R.metal, closed_u=True, inside=(0, 0.2, 0), nm='cuff', inner=False, bevel=0.008)
        band_on(g, cf, 0.8, 1.0, nu=4, lift=0.004, nm='cuff_rim', ins=(0, 0.2, 0))
        T(spike(g, (s * 0.15, 0.22, 0), (s, 0.4, 0), 0.04, 0.15), 'cuff_spike')


def B_boots(S):
    for name in ('sock_footL', 'sock_footR'):
        f = S(name)
        T(box(f, (0.35, 0.2, 0.44), (0, -0.08, 0.05), R.metal, bevel=0.03), 'foot')
        T(prism(f, [(-0.17, 0.0), (0.17, 0.0), (0.12, 0.14), (0.0, 0.2), (-0.12, 0.14)], 0.14, (0, -0.1, 0.25), R.metal, rot=(PI / 2, 0, 0), bevel=0.012), 'toe')
        T(box(f, (0.37, 0.035, 0.46), (0, -0.166, 0.05), R.dark, bevel=0), 'sole')
        gi = (0, 0.18, 0)
        gf = loft_fn([(0.035, 0.18, 0.185, 0.04, 0), (0.36, 0.175, 0.18, 0.06, 0)], 8.0, rw=0.9)
        surf(f, gf, 6, 1, 0.025, R.metal, closed_u=True, inside=gi, nm='greave', inner=False, bevel=0.008)
        band_on(f, gf, 0.0, 0.12, nu=6, color=R.dark, lift=0.004, nm='greave_band', ins=gi)
        T(prism(f, [(-0.12, -0.05), (0.12, -0.05), (0.14, 0.08), (0.0, 0.16), (-0.14, 0.08)], 0.05, (0, 0.4, 0.22), R.metal, bevel=0.01), 'knee')
        T(spike(f, (0, 0.42, 0.25), (0, 0.35, 1), 0.04, 0.14), 'knee_spike')


VARIANTS['B'] = {'name': 'Warlord', 'body_plate': B_body, 'helm_full': B_helm, 'gloves': B_gloves, 'boots': B_boots}


# ═══ C: Dragonguard ══════════════════════════════════════════════════════════
# Draconic: dark under-shell covered in overlapping toothed scale rows, a column of belly scutes and
# dorsal spines; pauldrons are folded wings (layered finger plates sweeping back) with a claw at
# the wrist; dragon-skull helm with a snout visor, glowing eyes and back-swept horns.

def C_body(S):
    c = S('sock_chest')
    rows = [(-0.31, 0.385, 0.285, 0.02, 0.0), (-0.1, 0.395, 0.295, 0.03, 0.0), (0.1, 0.405, 0.305, 0.04, 0.01),
            (0.25, 0.4, 0.295, 0.03, 0.01), (0.325, 0.37, 0.265, 0, 0), (0.355, 0.31, 0.245, 0, 0), (0.37, 0.27, 0.235, 0, 0)]
    fn = cuirass(c, rows, 3.6, 12, rw=0.6, color=R.dark, bevel=0.0)
    # overlapping scale rows (toothed hoops), upper rows over lower rows
    for i, (y0, y1) in enumerate(((0.12, 0.25), (0.0, 0.16), (-0.13, 0.04), (-0.26, -0.09))):
        g = 0.012 + 0.004 * (3 - i)
        hoop(c, y0, y1, (0.405 + g, 0.3 + g), (0.395 + g, 0.29 + g), 0.02, R.metal, nu=16, e=3.6, rf=(0.03, 0.03), rw=0.6,
             nm=f'scales_{i}', walls=(0,), zig=(0.07, 8))
    # belly scutes down the front, gold edges
    for i, y in enumerate((0.22, 0.1, -0.02, -0.14, -0.26)):
        w = 0.2 - 0.018 * i
        T(box(c, (w, 0.1, 0.035), (0, y, 0.345), R.metal, rot=(-0.12, 0, 0), bevel=0.015), 'scute')
        T(box(c, (w + 0.01, 0.02, 0.03), (0, y - 0.048, 0.355), R.dark, rot=(-0.12, 0, 0), bevel=0), 'scute_edge')
    # collar of upswept scales
    hoop(c, 0.33, 0.42, (0.31, 0.295), (0.29, 0.28), 0.03, R.metal, nu=12, e=3.0, nm='gorget', walls=(1,), zig=(-0.05, 6))
    hoop(c, 0.41, 0.435, (0.295, 0.285), (0.29, 0.28), 0.025, R.trim, nu=12, e=3.0, nm='gorget_rim')
    # waist: toothed lames, belt with a dragon-eye buckle
    for i, (y0, y1) in enumerate(((-0.39, -0.3), (-0.46, -0.37))):
        hoop(c, y0, y1, (0.415 - 0.005 * i, 0.305 - 0.005 * i), (0.405 - 0.005 * i, 0.297 - 0.005 * i), 0.022, R.metal, nu=16, e=4.0,
             nm=f'lame_{"ab"[i]}', walls=(0,), zig=(0.05, 8), rf=(0.02, 0.02))
    hoop(c, -0.54, -0.475, (0.41, 0.3), (0.41, 0.3), 0.025, R.leather, nu=12, e=4.0, nm='belt')
    T(prism(c, [(-0.1, 0.0), (-0.05, 0.045), (0.05, 0.045), (0.1, 0.0), (0.05, -0.045), (-0.05, -0.045)], 0.035, (0, -0.508, 0.325), R.trim), 'eye_buckle')
    T(prism(c, [(-0.055, 0.0), (0.0, 0.028), (0.055, 0.0), (0.0, -0.028)], 0.03, (0, -0.508, 0.338), R.glow), 'eye_iris')
    T(box(c, (0.014, 0.05, 0.02), (0, -0.508, 0.352), R.dark, bevel=0), 'eye_pupil')
    # faulds: long pointed scale tassets all round over dark mail
    hoop(c, -0.68, -0.52, (0.43, 0.3), (0.415, 0.295), 0.02, R.dark, nu=12, e=5.0, nm='fauld_mail', walls=(0,))
    for j, (ya, yb, a, b) in enumerate(((-0.52, -0.7, 0.445, 0.322), (-0.6, -0.8, 0.46, 0.337))):
        for s in (-1, 1):
            t0, t1 = (0.2, 1.3) if s > 0 else (-1.3, -0.2)
            tasset(c, t0, t1, ya, yb, a, b, trim=False, nm=f'tasset{j}{"LR"[s < 0]}', e=5.0, nu=4, zig=(0.07, 2))
        if j == 1:
            tasset(c, PI - 1.1, PI + 1.1, ya, yb, 0.44, 0.31, trim=False, nm='culet', e=5.0, nu=6, zig=(0.07, 3))
    # dorsal spines down the back
    for i, (y, hgt) in enumerate(((0.3, 0.14), (0.14, 0.17), (-0.02, 0.15), (-0.18, 0.12))):
        T(prism(c, [(-0.06, 0.0), (0.06, 0.0), (-0.03, hgt)], 0.04, (0, y, -0.3), R.trim, rot=(0, PI / 2, 0.55)), f'dorsal{i}')

    for name, s in (('sock_shoulderL', 1), ('sock_shoulderR', -1)):
        sh = S(name)
        O, phi, Rv, Rh = PAUL_O, 0.25, 0.26, 0.23
        ins = mp((0.04, -0.14, 0), s)
        kw = dict(inner_scale=0.42, front_scale=1.2)
        capf = bell_fn(O, phi, Rv, Rh, 0.0, 1.25, -PI, PI, drop=0.04, zig=(0.14, 4), **kw)
        surf(sh, mirror(capf, s), 8, 2, 0.03, R.metal, closed_u=True, inside=ins, bevel=0.012, nm='wing_shoulder', walls=(1,))
        # folded wing: broad finger plates sweeping back and out, overlapping like a closed wing
        for i in range(3):
            base = (0.1 + 0.05 * i, 0.12 - 0.06 * i, 0.1 - 0.03 * i)
            d = (0.3 + 0.12 * i, 0.25 - 0.12 * i, -1.0)
            bf, bi = blade_fn(base, d, (0.2, 1, 0), 0.42 + 0.04 * i, 0.15, curl=0.06, bulge=0.03, taper=0.6, tipw=0.03)
            surf(sh, mirror(bf, s), 2, 3, 0.025, R.metal, inside=mp(bi, s), nm=f'wing_finger{i}', inner=True)
            surf(sh, grow(mirror(lambda u, v, bf=bf: bf(0.78 + 0.22 * u, v), s), 0.004, mp(bi, s)), 1, 3, 0.028, R.trim if i == 0 else R.dark,
                 inside=mp(bi, s), inner=False, nm=f'wing_edge{i}')
        # leading-edge bone and wrist claw at the front of the shoulder
        horn(sh, [mp((0.04, 0.16, 0.18), s), mp((0.2, 0.15, 0.16), s), mp((0.34, 0.04, 0.12), s)], (0.045, 0.04, 0.03), R.trim, seg=5)
        T(spike(sh, mp((0.04, 0.16, 0.2), s), mp((-0.3, 0.35, 1.0), s), 0.045, 0.18, R.trim), 'wrist_claw')
        T(spike(sh, mp((0.34, 0.04, 0.12), s), mp((0.6, -0.4, 0.6), s), 0.03, 0.12, R.trim), 'finger_claw')
        sf = bell_fn(O, phi, Rv * 1.1, Rh * 1.1, 1.05, 1.75, -0.1, 0.1, **kw)
        strap(sh, mirror(sf, s), 0, 1, 0, 1, ins, nv=2, lift=0.006, buckle=0.5)


def C_helm(S):
    h = S('sock_head')
    ins = (0, 0.1, 0)
    rows = [(-0.21, 0.325, 0.33, 0.02, 0), (0.02, 0.315, 0.325, 0.04, 0), (0.22, 0.3, 0.31, 0.03, 0), (0.34, 0.22, 0.25, 0.02, 0.0),
            (0.41, 0.0, 0.0, 0, 0)]
    fn = loft_fn(rows, 3.0, rw=0.6)
    surf(h, fn, 10, 4, 0.03, R.metal, closed_u=True, inside=ins, bevel=0.012, nm='helm_shell', inner=False, walls=(0,))
    band_on(h, fn, 0.0, 0.07, nu=10, color=R.dark, nm='helm_rim', ins=ins, thick=0.035, lift=0.005)
    # snout visor with fangs and nostrils
    T(box(h, (0.34, 0.2, 0.2), (0, -0.07, 0.38), R.metal, rot=(PI / 2 + 0.12, 0, 0), taper=(0.62, 0.7), bevel=0.02), 'snout')
    T(box(h, (0.07, 0.19, 0.05), (0, 0.02, 0.4), R.trim, rot=(PI / 2 + 0.35, 0, 0), bevel=0), 'snout_ridge')
    for s in (-1, 1):
        T(box(h, (0.035, 0.02, 0.03), (s * 0.05, -0.02, 0.48), R.dark, bevel=0), 'nostril')
        for i, z in enumerate((0.3, 0.37, 0.43)):
            T(spike(h, (s * (0.14 - 0.03 * i), -0.16, z), (0, -1, 0.1), 0.018, 0.07, R.trim, seg=3), 'fang')
        # glowing eye slits under heavy brow ridges
        T(box(h, (0.12, 0.032, 0.02), (s * 0.11, 0.09, 0.335), R.glow, rot=(0, 0, s * 0.3), bevel=0), 'eye')
        T(box(h, (0.17, 0.05, 0.08), (s * 0.12, 0.145, 0.32), R.metal, rot=(0.2, 0, s * 0.38), bevel=0), 'brow_ridge')
        # swept horns
        horn(h, [(s * 0.2, 0.3, 0.02), (s * 0.3, 0.45, -0.14), (s * 0.36, 0.53, -0.34), (s * 0.36, 0.5, -0.58)],
             (0.075, 0.056, 0.034, 0.006), R.dark, seg=5)
    for i, (z, y) in enumerate(((0.19, 0.33), (0.04, 0.38), (-0.12, 0.36))):
        T(prism(h, [(-0.06, 0.0), (0.06, 0.0), (-0.04, 0.1 - 0.01 * i)], 0.035, (0, y, z), R.trim, rot=(0, PI / 2, 0)), f'crest{i}')


def C_gloves(S):
    for name, s in (('sock_handL', 1), ('sock_gloveR', -1)):
        g = S(name)
        T(box(g, (0.31, 0.27, 0.31), (0, -0.015, 0), R.metal, bevel=0.045), 'fist')
        T(box(g, (0.325, 0.05, 0.325), (0, -0.07, 0.0), R.dark, bevel=0), 'knuckle_band')
        for z in (-0.08, 0.0, 0.08):
            T(spike(g, (-s * 0.02, -0.14, z + 0.05), (0, -1, 0.6), 0.025, 0.11, R.trim, seg=3), 'claw')
        T(box(g, (0.125, 0.185, 0.135), (-s * 0.07, 0.03, 0.168), R.metal, rot=(0.3, 0, 0), bevel=0.02), 'thumb')
        cf = loft_fn([(0.08, 0.145, 0.15, 0, 0), (0.3, 0.16, 0.165, 0, 0)], 3.0, zig=(0.05, 4))
        surf(g, cf, 8, 1, 0.025, R.metal, closed_u=True, inside=(0, 0.2, 0), nm='cuff', inner=False)
        T(spike(g, (s * 0.17, 0.28, 0), (s * 0.4, 1, -0.3), 0.035, 0.14, R.trim, seg=4), 'cuff_spine')


def C_boots(S):
    for name in ('sock_footL', 'sock_footR'):
        f = S(name)
        T(box(f, (0.34, 0.195, 0.44), (0, -0.08, 0.05), R.metal, bevel=0.045), 'foot')
        T(box(f, (0.36, 0.035, 0.44), (0, -0.166, 0.035), R.dark, bevel=0), 'sole')
        for x in (-0.1, 0.0, 0.1):
            T(spike(f, (x, -0.12, 0.23), (0, -0.25, 1), 0.035, 0.13, R.trim, seg=3), 'talon')
        T(spike(f, (0, -0.1, -0.17), (0, -0.2, -1), 0.03, 0.1, R.trim, seg=3), 'spur')
        gi = (0, 0.18, 0)
        gf = loft_fn([(0.035, 0.18, 0.185, 0.03, 0), (0.36, 0.17, 0.175, 0.04, 0)], 3.0, zig=(0.06, 4))
        surf(f, gf, 8, 1, 0.025, R.metal, closed_u=True, inside=gi, nm='greave', inner=False)
        T(prism(f, [(-0.11, -0.06), (0.11, -0.06), (0.12, 0.06), (0.0, 0.18), (-0.12, 0.06)], 0.05, (0, 0.4, 0.215), R.metal, bevel=0.01), 'knee')
        T(prism(f, [(-0.05, -0.02), (0.05, -0.02), (0.0, 0.11)], 0.03, (0, 0.42, 0.25), R.trim), 'knee_scale')


VARIANTS['C'] = {'name': 'Dragonguard', 'body_plate': C_body, 'helm_full': C_helm, 'gloves': C_gloves, 'boots': C_boots}
