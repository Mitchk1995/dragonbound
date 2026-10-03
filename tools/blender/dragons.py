"""Dragons: Drakeling (minion), Cinderwing (boss) and the Ember Whelp pet.

Blocky, modular build: bodies are stacked chamfered slabs (hips, belly, chest, withers), necks and tails are
chains of shrinking boxes, heads are a box skull with a tapered box snout and jaw, legs are box segments,
horns and claws are angled wedge segments. Only the bat-wing membranes, the whelp's flame and the glowing cracks
are flat faceted panels. The drakeling and Cinderwing follow their approved concept sheets (docs/concepts). Faces +Z; right-side parts (legFR/legBR/wingR) at -X, left at +X. Rig names match
src/render/anim.ts: body, neck1.., head, jaw, tail1.., wingL/wingR, legFL/legFR/legBL/legBR, all under a
scaled 'inner' empty (the animation's flight lift and bob are in that scaled space).
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

PI = math.pi


# ─── Parts library ───────────────────────────────────────────────────────────

def beam(parent, a, b, w, d, color, taper=None, bevel=0.0, over=0.0, emissive=None, strength=2.0):
    """Box from point a to point b (its local +Y runs a->b): `w` wide across, `d` deep the other way (for a
    level beam `w` is the width and `d` the height). `taper` (w, d) shrinks the b end; `over` lengthens it
    at both ends so chained beams overlap at the joints."""
    a, b = Vector(a), Vector(b)
    y = (b - a).normalized()
    h = Vector((0, 1, 0)) if abs(y.y) < 0.9 else Vector((0, 0, 1))
    x = h.cross(y).normalized()
    z = x.cross(y).normalized()
    e = Matrix((x, y, z)).transposed().to_euler('ZYX')
    return box(parent, (w, (b - a).length + over, d), tuple((a + b) / 2), color, rot=(e.x, e.y, e.z), bevel=bevel, taper=taper,
               emissive=emissive, strength=strength)


def curve(a, b, bend, n=3):
    """Points from a to b bowed by the offset `bend` at the middle (quadratic Bezier)."""
    a, b = Vector(a), Vector(b)
    m = (a + b) / 2 + Vector(bend)
    return [a * (1 - t) ** 2 + m * 2 * t * (1 - t) + b * t * t for t in (k / (n - 1) for k in range(n))]


def horn(parent, pts, w, color, tip=0.15):
    """Horn or claw of angled wedge segments through `pts`: `w` thick at the base, down to `tip` of that."""
    n = len(pts) - 1
    for i in range(n):
        w0, w1 = w * (1 - (1 - tip) * i / n), w * (1 - (1 - tip) * (i + 1) / n)
        beam(parent, pts[i], pts[i + 1], w0, w0, color, taper=(w1 / w0, w1 / w0), over=w0 * 0.4 if i < n - 1 else w0 * 0.2)


def seam(parent, pts, r, color, emissive=0xFF7A1A, strength=2.5):
    """Glowing seam (cracks, smouldering wing edges): thin three-sided emissive rods through `pts`."""
    for a, b in zip(pts, pts[1:]):
        a, b = Vector(a), Vector(b)
        cyl(parent, r / 2, r / 2, (b - a).length + r, tuple((a + b) / 2), color, rot=rot_to(b - a), seg=3, emissive=emissive, strength=strength)


def panel(parent, outline, color, camber=0.0, emissive=None, strength=2.0, thick=0.0):
    """Double-sided sheet over a closed outline, fanned from a centre pushed `camber` downward (billow). With `thick`
    it is a slab that deep, so a membrane keeps a real edge side-on instead of vanishing like paper."""
    pts = [Vector(p) for p in outline]
    n = Vector((0, 0, 0))
    for i, p in enumerate(pts):
        n += p.cross(pts[(i + 1) % len(pts)])
    n.normalize()
    if n.y > 0:
        n = -n
    ctr = sum(pts, Vector((0, 0, 0))) / len(pts) + n * camber
    bm = bmesh.new()
    if thick:
        top = [bm.verts.new(p - n * (thick / 2)) for p in pts]
        bot = [bm.verts.new(p + n * (thick / 2)) for p in pts]
        ct, cb = bm.verts.new(ctr - n * (thick / 2)), bm.verts.new(ctr + n * (thick / 2))
        for i in range(len(pts)):
            j = (i + 1) % len(pts)
            bm.faces.new((top[i], top[j], ct))
            bm.faces.new((bot[j], bot[i], cb))
            bm.faces.new((top[j], top[i], bot[i], bot[j]))
    else:
        vs = [bm.verts.new(p) for p in pts]
        c = bm.verts.new(ctr)
        for i in range(len(vs)):
            bm.faces.new((vs[i], vs[(i + 1) % len(vs)], c))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _common._mesh_obj(bm, parent, (0, 0, 0), (0, 0, 0), color, emissive, strength, double_sided=True)


def scallop(a, b, toward, depth, n=3):
    """Trailing-edge points strictly between a and b, curving in toward `toward` (membrane scallops)."""
    a, b, toward = Vector(a), Vector(b), Vector(toward)
    out = []
    for k in range(1, n + 1):
        t = k / (n + 1)
        p = a.lerp(b, t)
        out.append(p.lerp(toward, depth * math.sin(PI * t)))
    return out


# Bat wing layout in units of span (left wing, +X out, +Z forward): elbow, raised wrist, finger tips fanning back.
WING_ELBOW = (0.28, 0.2, -0.14)
WING_WRIST = (0.52, 0.42, 0.06)
WING_TIPS = {
    4: ((1.1, 0.32, -0.16), (1.02, 0.12, -0.58), (0.78, 0.0, -0.86), (0.46, -0.04, -0.94)),
    3: ((0.98, 0.3, -0.22), (0.84, 0.08, -0.64), (0.5, -0.02, -0.86)),
}


def bat_wing(body, side, pos, span, bone, skin, claw, fingers=4, raise_=0.2, thick=1.0, skin_glow=None, scallop_depth=0.24, edge=None):
    """Shared bat wing: box humerus and forearm up/out to a raised wrist with a wedge thumb claw, box finger
    bones fanning back from the wrist, one cambered membrane panel per gap with a scalloped trailing edge.
    `edge` (a colour, drawn emissive) traces the trailing edge with a thin glowing seam."""
    s = 1 if side == 'L' else -1
    wing = pivot(body, f'wing{side}', pos, (0, 0, s * raise_))
    P = lambda p: Vector((s * p[0] * span, p[1] * span, p[2] * span))
    S, E, W = Vector((0, 0, 0)), P(WING_ELBOW), P(WING_WRIST)
    tips = [P(t) for t in WING_TIPS[fingers]]
    root = P((0.05, -0.06, -0.6))
    r = span * thick
    beam(wing, S, E, 0.1 * r, 0.09 * r, bone, taper=(0.8, 0.8), over=0.05 * r)
    beam(wing, E, W, 0.08 * r, 0.07 * r, bone, taper=(0.8, 0.8), over=0.05 * r)
    for p, k in ((E, 0.11), (W, 0.1)):  # knuckles
        box(wing, (k * r, k * r, k * r), tuple(p), bone, bevel=0)
    for t in tips:
        m = W.lerp(t, 0.5) + Vector((0, 0.03 * span, 0))
        beam(wing, W, m, 0.045 * r, 0.04 * r, bone, taper=(0.75, 0.75), over=0.02 * r)
        beam(wing, m, t, 0.034 * r, 0.03 * r, bone, taper=(0.35, 0.35), over=0.01 * r)
    horn(wing, curve(W, W + P((0.02, 0.1, 0.16)), P((0, 0.03, 0))), 0.06 * r, claw)  # thumb claw
    horn(wing, [tips[0], tips[0] + P((0.08, -0.04, 0.02))], 0.028 * r, claw)
    camber = 0.05 * span
    # A faint self-glow in the skin colour lifts the shaded side, so the membrane reads thin and backlit.
    glow = dict(emissive=skin_glow, strength=0.5) if skin_glow is not None else {}
    edges = []
    for a, b in zip(tips, tips[1:]):
        edges.append([a] + scallop(a, b, W, scallop_depth) + [b])
        panel(wing, [W] + edges[-1], skin, camber, **glow)
    edges.append([tips[-1]] + scallop(tips[-1], root, E, scallop_depth * 0.8) + [root])
    panel(wing, [W] + edges[-1] + [S, E], skin, camber, **glow)
    if edge is not None:
        for pts in edges:
            seam(wing, pts, 0.022 * r, edge, emissive=edge, strength=1.6)
    return wing


def segments(parent, prefix, count, start, lengths, rots, build):
    """Chain of rig pivots (neck1.., tail1..); each next pivot sits `lengths[i]` along the previous one's local Z.
    `build(pivot, i)` adds each segment's meshes."""
    pos = start
    for i in range(1, count + 1):
        parent = pivot(parent, f'{prefix}{i}', pos, (rots[i - 1], 0, 0))
        build(parent, i)
        if i < count:
            pos = (0, 0, lengths[i - 1])
    return parent


def finish(scene_name, file_name):
    export(scene_name, file_name)
    print(f'{file_name}: {tri_count()} triangles')
    preview_auto(file_name.replace('.glb', '.png'))
    remove_preview_rig()


# ─── Parts for the drakeling and Cinderwing (their approved sheets, October 3) ──
# Both are built from docs/concepts/drakeling.jpg and cinderwing.jpg: chamfered block bodies in a leather harness with
# gilt fittings, one eye a side sunk in a socket of blocks (a brow ridge above it, a cheek below, a wall in front) so
# it reads only from the side and the brow never covers it, and raised bat wings rooted on the shoulder blades.

def obox(parent, size, centre, xdir, ydir, color, bevel=0.0, taper=None, emissive=None, strength=2.0):
    """Box whose local X and Y run along `xdir` and `ydir` (Y is squared up to X; Z completes the frame)."""
    x = Vector(xdir).normalized()
    y = Vector(ydir)
    y = (y - x * y.dot(x)).normalized()
    e = Matrix((x, y, x.cross(y))).transposed().to_euler('ZYX')
    return box(parent, size, tuple(Vector(centre)), color, rot=(e.x, e.y, e.z), bevel=bevel, taper=taper,
               emissive=emissive, strength=strength)


def crack(parent, origin, u, n, length, w, rng, steps=5, branches=1, color=0xFFB848):
    """A glowing crack across a flat face (outward normal `n`): a jagged path from `origin` along `u`, each step kinked
    sideways at random, thinning toward its end, with short forks. Drawn as one thin ribbon lying just off the face
    (two triangles a segment), so a boss covered in cracks stays inside its triangle budget."""
    origin, u, n = Vector(origin), Vector(u).normalized(), Vector(n).normalized()
    v = n.cross(u)
    step = length / steps
    pts = [origin]
    side = rng.choice((-1, 1))
    for i in range(steps):
        side = -side if rng.random() < 0.75 else side
        pts.append(pts[-1] + u * step * rng.uniform(0.7, 1.3) + v * side * step * rng.uniform(0.25, 0.7))
    segs = [(a, b, w * (1 - 0.5 * i / steps)) for i, (a, b) in enumerate(zip(pts, pts[1:]))]
    for k in range(branches):
        i = rng.randint(1, steps - 1)
        segs.append((pts[i], pts[i] + u * step * 0.5 + v * rng.choice((-1, 1)) * step * rng.uniform(0.6, 1.0), w * 0.6))
    bm = bmesh.new()
    lift = n * 0.008
    for a, b, ww in segs:
        d = (b - a).normalized()
        a, b = a - d * ww * 0.5 + lift, b + d * ww * 0.5 + lift   # overlap the neighbours at the bends
        x = n.cross(d) * (ww / 2)
        bm.faces.new([bm.verts.new(q) for q in (a - x, b - x, b + x, a + x)])
    return _common._mesh_obj(bm, parent, (0, 0, 0), (0, 0, 0), color, GLOW_E, GLOW_S)


def band(parent, a, b, t, w, d, color, length=0.07):
    """Collar `length` long round the beam a->b at fraction t, `w` x `d` across in the beam's own frame (gilt horn
    bands, ankle bands, the tail's cuff)."""
    a, b = Vector(a), Vector(b)
    c, u = a.lerp(b, t), (b - a).normalized()
    return beam(parent, c - u * (length / 2), c + u * (length / 2), w, d, color)


def dorsal(parent, base, up, back, w, d, color):
    """Wedge spike or crystal standing on `base` (sunk a little into it), `up` high with its tip leaning `back` toward the
    tail, `w` thick across the body and `d` long along it at the foot."""
    base = Vector(base)
    return beam(parent, base - Vector((0, 0.03, 0)), base + Vector((0, up, -back)), w, d, color, taper=(0.2, 0.08))


def eye(head, s, x, y, z, h, l, iris, pupil, lining, glow=None, strength=1.0):
    """An eye on the socket floor at |x| = x (side s): a dark lining, the iris standing a little proud of it and a thin
    slit pupil a little forward of its middle (a wide pupil would split the iris into what reads as two eyes), all
    inside the socket walls."""
    box(head, (0.012, h + 0.028, l + 0.028), (s * (x + 0.006), y, z), lining, bevel=0)
    box(head, (0.016, h, l), (s * (x + 0.012), y, z), iris, bevel=0, emissive=glow, strength=strength)
    box(head, (0.016, h * 0.9, l * 0.09), (s * (x + 0.016), y, z + l * 0.12), pupil, taper=(1.0, 0.35), bevel=0)


def hex_plate(parent, p, n, r, rim, boss):
    """Hexagonal shoulder plate on the face at `p` (outward normal `n`): a gilt rim half sunk into the face (straps pass
    under it) and a raised faceted boss."""
    n = Vector(n).normalized()
    p = Vector(p)
    cyl(parent, r, r, 0.09, tuple(p + n * 0.005), rim, rot=rot_to(n), seg=6)
    cyl(parent, r * 0.4, r * 0.8, 0.07, tuple(p + n * 0.06), boss, rot=rot_to(n), seg=6)


# Raised bat wing (left wing: +X out, +Y up, +Z forward), in units of span: the arm climbs from the shoulder blade to a
# high wrist, three fingers fan back and down from it, and the membrane runs back to the back behind the shoulder. The
# wing is then tilted forward about the shoulder (raised_wing `tilt`), which brings the wrist up over the shoulder and
# lifts the trailing edge, so the membrane shows its face to the overhead game camera instead of its edge.
RW_ELBOW = (0.2, 0.28, -0.16)
RW_WRIST = (0.46, 0.5, -0.2)
RW_TIPS = ((0.96, 0.36, -0.42), (0.86, 0.06, -0.76), (0.54, -0.04, -0.94))
RW_ROOT = (0.04, -0.02, -0.56)


def raised_wing(body, side, pos, span, bone, skin, cap, claw, thick=1.0, tilt=0.3, raise_=0.0, scallop_depth=0.2,
                edge=None):
    """Bat wing raised off the shoulder blade: box arm bones to a gilt wrist cap with a thumb claw, three box fingers with
    gilt tip caps, one membrane slab per gap with a scalloped trailing edge. `edge` (a colour) gilds the trailing edge
    and the outer finger. `tilt` turns the whole wing forward (positive) about the shoulder; the rig flaps it about its own Z."""
    s = 1 if side == 'L' else -1
    wing = pivot(body, f'wing{side}', pos, (tilt, 0, s * raise_))
    P = lambda p: Vector((s * p[0] * span, p[1] * span, p[2] * span))
    S, E, W = Vector((0, 0, 0)), P(RW_ELBOW), P(RW_WRIST)
    tips = [P(t) for t in RW_TIPS]
    root = P(RW_ROOT)
    r = span * thick
    beam(wing, S, E, 0.12 * r, 0.11 * r, bone, taper=(0.8, 0.8), over=0.05 * r, bevel=0.015 * r)
    beam(wing, E, W, 0.095 * r, 0.085 * r, bone, taper=(0.8, 0.8), over=0.05 * r, bevel=0.012 * r)
    box(wing, (0.12 * r,) * 3, tuple(E), bone, bevel=0)                               # elbow knuckle
    box(wing, (0.13 * r, 0.12 * r, 0.13 * r), tuple(W), cap, bevel=0.02 * r)         # gilt wrist cap
    for t in tips:
        m = W.lerp(t, 0.5) + Vector((0, 0.02 * span, 0))
        beam(wing, W, m, 0.05 * r, 0.045 * r, bone, taper=(0.8, 0.8), over=0.02 * r)
        beam(wing, m, t, 0.04 * r, 0.036 * r, bone, taper=(0.7, 0.7), over=0.01 * r)
        d = (t - m).normalized()
        beam(wing, t - d * 0.05 * r, t + d * 0.08 * r, 0.065 * r, 0.055 * r, cap, taper=(0.15, 0.15))  # gilt tip cap
    horn(wing, [W + P((0.01, 0.03, 0.03)), W + P((0.03, 0.11, 0.13))], 0.07 * r, claw)  # thumb claw
    camber = 0.04 * span
    edges = []
    for a, b in zip(tips, tips[1:]):
        edges.append([a] + scallop(a, b, W, scallop_depth) + [b])
        panel(wing, [W] + edges[-1], skin, camber, thick=0.014 * span)
    edges.append([tips[-1]] + scallop(tips[-1], root, E, scallop_depth * 0.8) + [root])
    panel(wing, [W] + edges[-1] + [S, E], skin, camber, thick=0.014 * span)
    if edge is not None:
        for pts in edges:
            for a, b in zip(pts, pts[1:]):
                beam(wing, a, b, 0.03 * r, 0.03 * r, edge, over=0.03 * r)
        up = Vector((0, 0.045 * r, 0))
        beam(wing, S + up, E + up, 0.05 * r, 0.04 * r, edge, over=0.03 * r)            # gilt leading edge
        beam(wing, E + up, W + up * 0.8, 0.045 * r, 0.035 * r, edge, over=0.03 * r)
    return wing


def limb(inner, name, pos, main, pad, claw, r=1.0, back=False, toes=3, foot=None, gilt=None, glow=None, rng=None):
    """Blocky leg on a hip/shoulder pivot, the foot block's sole on the ground (y = -pos.y in pivot space): a dark pad on
    the outside of the elbow or knee, big wedge claws, and optionally a gilt band round the ankle (`gilt`) and a glowing
    crack down the outside of the upper leg (`glow`, a colour)."""
    l = pivot(inner, name, pos)
    g = -pos[1]
    s = 1 if pos[0] > 0 else -1
    if back:   # a heavy thigh slab forward to the knee, shin back to the hock, then down
        top, joint, low = Vector((0, 0.12, -0.02 * r)), Vector((0, -0.24, 0.13 * r)), Vector((0, g + 0.3, -0.08 * r))
        ankle = Vector((0, g + 0.13, 0.0))
        beam(l, top, joint, 0.34 * r, 0.42 * r, main, taper=(0.62, 0.55), over=0.06, bevel=0.03)
        beam(l, joint, low, 0.18 * r, 0.17 * r, main, taper=(0.85, 0.85), over=0.08, bevel=0.02)
        beam(l, low, ankle, 0.15 * r, 0.14 * r, main, taper=(0.95, 0.95), over=0.06)
        uw = 0.34 * r * 0.62
    else:      # upper arm back to the elbow, forearm straight down to the wrist
        top, joint, low = Vector((0, 0.08, 0.02)), Vector((0, -0.28, -0.05 * r)), None
        ankle = Vector((0, g + 0.13, 0.03 * r))
        beam(l, top, joint, 0.28 * r, 0.3 * r, main, taper=(0.68, 0.62), over=0.06, bevel=0.03)
        beam(l, joint, ankle, 0.19 * r, 0.19 * r, main, taper=(0.9, 0.9), over=0.08, bevel=0.02)
        uw = 0.28 * r * 0.68
    box(l, (0.05 * r, 0.14 * r, 0.17 * r), (s * (uw / 2 + 0.02 * r), joint.y, joint.z), pad, bevel=0)  # pad
    fz = ankle.z + 0.04 * r
    box(l, (0.27 * r, 0.12, 0.3 * r), (0, g + 0.06, fz), foot or main, bevel=0.02)
    front = fz + 0.15 * r
    for k in range(toes):
        x = (k - (toes - 1) / 2) * 0.085 * r
        beam(l, (x, g + 0.07, front - 0.06 * r), (x * 1.12, g + 0.012, front + 0.14 * r), 0.075 * r, 0.09 * r, claw,
             taper=(0.35, 0.15))
    if gilt is not None:
        a, b = (low, ankle) if back else (joint, ankle)
        band(l, a, b, 0.72, (0.15 if back else 0.19) * r * 1.22, (0.14 if back else 0.19) * r * 1.22, gilt, length=0.07 * r)
    if glow is not None:   # a crack across the outer face of the upper leg, near its top
        w0 = 0.34 * r * 0.88 if back else 0.28 * r * 0.9
        p = top.lerp(joint, 0.25)
        crack(l, (s * (w0 / 2 + 0.006), p.y, p.z - 0.1 * r), (0, -0.35, 1), (s, 0, 0), 0.22 * r, 0.03 * r, rng, steps=4, color=glow)
    return l


GLOW_E, GLOW_S = 0xFF8A1A, 2.2
MOUTH = 0x3A0E0A


# ─── Drakeling (docs/concepts/drakeling.jpg) ──────────────────────────────────

def drakeling():
    """A young red dragon in a harness: bright red chamfered blocks, a cream jaw, throat and belly, dark red brow, spikes,
    pads and wing bones, cream horns and claws, a leather girth and breast collar with gilt buckles and hexagonal gilt
    shoulder plates, a pouch on the left flank, raised wings with gilt caps and an arrowhead tail with a gilt band."""
    main, dark, cream, horn_col = 0xCF3826, 0x861E1A, 0xE8C48E, 0xF2E2C4
    skin, gold, leather, pouch = 0xB42A20, 0xE6A83A, 0x5E3B26, 0x7A5036
    scene, root = fresh_scene('DB_drakeling')
    inner = pivot(root, 'inner')
    inner.scale = (0.8, 0.8, 0.8)
    for name, x, z, back in (('legFL', 0.27, 0.36, False), ('legFR', -0.27, 0.36, False), ('legBL', 0.29, -0.42, True), ('legBR', -0.29, -0.42, True)):
        limb(inner, name, (x, 0.68, z), main, dark, horn_col, r=1.0, back=back)

    body = pivot(inner, 'body', (0, 0.92, 0))
    box(body, (0.6, 0.54, 0.46), (0, 0.03, -0.46), main, bevel=0.06)                     # hips
    box(body, (0.7, 0.62, 0.58), (0, 0.04, -0.04), main, bevel=0.07)                     # belly block
    box(body, (0.7, 0.7, 0.46), (0, 0.08, 0.38), main, rot=(-0.15, 0, 0), bevel=0.07)   # deep chest
    box(body, (0.5, 0.44, 0.32), (0, 0.25, 0.66), main, rot=(-0.38, 0, 0), bevel=0.05)  # withers into the neck
    # Cream underside: a breast plate on the chest's front face and a belly plate under the belly block.
    obox(body, (0.44, 0.56, 0.05), (0, 0.08 + 0.036, 0.38 + 0.233), (1, 0, 0), (0, 0.989, -0.149), cream, bevel=0.02)
    box(body, (0.46, 0.06, 0.8), (0, -0.285, 0.0), cream, bevel=0.02)
    for z, y, h in ((0.44, 0.42, 0.17), (0.14, 0.36, 0.15), (-0.18, 0.35, 0.14), (-0.46, 0.3, 0.12)):  # dorsal spikes
        dorsal(body, (0, y, z), h, 0.1, 0.08, 0.18, dark)

    # Harness: a girth behind the forelegs, a breast collar across the chest and straps between them along the sides,
    # gilt buckles where they meet, a hexagonal gilt shoulder plate each side and a pouch hanging on the left flank.
    box(body, (0.74, 0.72, 0.1), (0, 0.04, 0.0), leather, bevel=0.015)                                     # girth
    obox(body, (0.74, 0.09, 0.04), (0, 0.08 + 0.119 + 0.04, 0.38 - 0.018 + 0.262), (1, 0, 0), (0, 0.989, -0.149), leather)  # collar
    obox(body, (0.12, 0.12, 0.05), (0, 0.08 + 0.119 + 0.042, 0.38 - 0.018 + 0.272), (1, 0, 0), (0, 0.989, -0.149), gold)  # buckle
    obox(body, (0.06, 0.06, 0.05), (0, 0.08 + 0.119 + 0.044, 0.38 - 0.018 + 0.284), (1, 0, 0), (0, 0.989, -0.149), leather)
    for s in (-1, 1):
        box(body, (0.03, 0.09, 0.64), (s * 0.364, 0.235, 0.3), leather, bevel=0)                          # side strap
        box(body, (0.03, 0.12, 0.13), (s * 0.378, 0.235, 0.05), gold, bevel=0)                            # strap buckle
        box(body, (0.03, 0.06, 0.06), (s * 0.386, 0.235, 0.05), leather, bevel=0)
        hex_plate(body, (s * 0.35, 0.2, 0.42), (s, 0.2, 0), 0.17, gold, dark)                            # shoulder plate
    box(body, (0.07, 0.2, 0.2), (0.39, -0.08, -0.16), pouch, bevel=0)                                     # pouch
    box(body, (0.08, 0.07, 0.21), (0.395, 0.035, -0.16), leather, bevel=0)                               # its flap
    box(body, (0.03, 0.07, 0.07), (0.432, -0.02, -0.16), gold, bevel=0)                                  # gilt clasp
    box(body, (0.03, 0.035, 0.035), (0.438, -0.02, -0.16), leather, bevel=0)

    def neck(n, i):
        beam(n, (0, 0, -0.1), (0, 0, 0.36), 0.4, 0.4, main, taper=(0.9, 0.9), bevel=0.04)
        box(n, (0.27, 0.06, 0.34), (0, -0.19, 0.13), cream, bevel=0)                         # cream throat
        dorsal(n, (0, 0.18, 0.12), 0.15, 0.1, 0.07, 0.16, dark)
    # The neck rises steeply from the chest, so the head is carried high over the cream breast (the rig levels it).
    last = segments(body, 'neck', 2, (0, 0.3, 0.66), (0.3, 0.3), (-0.7, -0.4), neck)

    head = pivot(last, 'head', (0, 0.02, 0.32), (0.75, 0, 0))
    # The skull is built round the eye sockets: a core, a broader back of the head behind the eye, a cheek below it,
    # a wall in front of it and a dark brow ridge above it; the eye sits on the core's side, inside those walls.
    box(head, (0.4, 0.34, 0.5), (0, 0.13, 0.0), main, bevel=0.04)                     # core (eye floor at |x| 0.2)
    box(head, (0.47, 0.3, 0.26), (0, 0.14, -0.11), main, bevel=0.04)                  # back of the head
    box(head, (0.47, 0.13, 0.28), (0, 0.02, 0.16), main, bevel=0.03)                  # cheek, under the eye
    box(head, (0.46, 0.13, 0.07), (0, 0.15, 0.275), main, bevel=0)                    # wall in front of the eye
    beam(head, (0, 0.1, 0.2), (0, 0.085, 0.7), 0.36, 0.2, main, taper=(0.86, 0.86), bevel=0.035)   # snout
    box(head, (0.26, 0.02, 0.38), (0, 0.014, 0.46), MOUTH, bevel=0)                    # roof of the mouth
    for s in (-1, 1):
        beam(head, (s * 0.185, 0.27, -0.01), (s * 0.19, 0.255, 0.31), 0.1, 0.07, dark, taper=(0.7, 0.6), bevel=0.015)  # brow ridge
        eye(head, s, 0.2, 0.15, 0.14, 0.085, 0.17, 0xF6BA38, 0x1A0A06, 0x3A0C08, glow=0xF0A020, strength=0.5)
        box(head, (0.06, 0.016, 0.02), (s * 0.07, 0.045, 0.705), MOUTH, bevel=0)      # nostril: a low slit
        horn(head, [(s * 0.12, 0.27, -0.06), (s * 0.17, 0.44, -0.28), (s * 0.21, 0.58, -0.5)], 0.12, horn_col, tip=0.12)
    jaw = pivot(head, 'jaw', (0, -0.02, 0.18))
    beam(jaw, (0, -0.02, -0.34), (0, -0.025, 0.5), 0.35, 0.11, cream, taper=(0.86, 0.8), bevel=0.03)
    box(jaw, (0.24, 0.02, 0.44), (0, 0.028, 0.26), MOUTH, bevel=0)                    # floor of the mouth

    # Tail: three thinning segments with a spike each, then a dark cuff, a gilt band and a red arrowhead.
    def tail(t, i):
        w = 0.2 - (i - 1) * 0.04
        beam(t, (0, 0, 0.1), (0, 0, -0.4), 2 * (w + 0.02), 2 * (w + 0.02), main, taper=((w - 0.03) / (w + 0.02),) * 2, bevel=0.03)
        dorsal(t, (0, w, -0.14), 0.13 - i * 0.015, 0.09, 0.07, 0.15, dark)
    last = segments(body, 'tail', 3, (0, 0.03, -0.62), (-0.36, -0.36), (0.16, 0.04, -0.1), tail)
    box(last, (0.17, 0.15, 0.12), (0, 0, -0.44), dark, bevel=0)                                    # cuff
    box(last, (0.2, 0.18, 0.05), (0, 0, -0.37), gold, bevel=0)                                     # gilt band
    beam(last, (0, 0, -0.48), (0, 0.03, -0.86), 0.22, 0.12, main, taper=(0.04, 0.1))              # arrowhead
    for s in (-1, 1):
        beam(last, (s * 0.06, 0, -0.46), (s * 0.19, 0.0, -0.6), 0.07, 0.06, dark, taper=(0.2, 0.3))   # its barbs

    for side, s in (('L', 1), ('R', -1)):
        # Wide enough apart that the gilt wrist caps clear each other at the top of the flight flap.
        raised_wing(body, side, (s * 0.28, 0.3, 0.22), 1.45, dark, skin, gold, horn_col, thick=0.85)
    finish('DB_drakeling', 'drakeling.glb')


# ─── Cinderwing: the boss (docs/concepts/cinderwing.jpg) ─────────────────────

def cinderwing():
    """The boss: a heavy dark oxblood dragon with a furnace inside, glowing through zigzag cracks down the throat and
    across the chest, flanks and legs; an ivory breastplate in a leather harness with gilt buckles and saddle packs;
    bright red crystals down the spine and tail; ivory horns and cheek spikes in gilt bands; one glowing eye a side
    under a dark brow; big raised wings with gilt bones and edges; gilt ankle bands and an ivory tail spike."""
    import random
    rng = random.Random(11)
    main, dark, ivory, crystal = 0x5A2422, 0x3A1715, 0xE4D8BE, 0xC21C1E
    skin, gold, leather, glow = 0x4A2220, 0xD9A040, 0x5A361E, 0xFFB848
    scene, root = fresh_scene('DB_cinderwing')
    inner = pivot(root, 'inner')
    inner.scale = (2.4, 2.4, 2.4)
    for name, x, z, back in (('legFL', 0.4, 0.46, False), ('legFR', -0.4, 0.46, False), ('legBL', 0.42, -0.5, True), ('legBR', -0.42, -0.5, True)):
        limb(inner, name, (x, 0.7, z), main, dark, ivory, r=1.6, back=back, foot=dark, gilt=gold, glow=glow, rng=rng)

    body = pivot(inner, 'body', (0, 0.94, 0))
    box(body, (0.8, 0.66, 0.5), (0, 0.04, -0.56), main, bevel=0.07)                     # hips
    box(body, (1.0, 0.84, 0.64), (0, 0.06, -0.06), main, bevel=0.08)                     # belly block
    box(body, (1.0, 0.96, 0.6), (0, 0.11, 0.42), main, rot=(-0.18, 0, 0), bevel=0.08)   # deep chest
    box(body, (0.72, 0.6, 0.4), (0, 0.36, 0.66), main, rot=(-0.55, 0, 0), bevel=0.06)   # withers into the neck
    yd, zd = (0, 0.984, -0.179), (0, 0.179, 0.984)   # the chest's local Y and Z (it is turned -0.18 about X)
    C = lambda y, z: Vector((0, 0.11, 0.42)) + Vector(yd) * y + Vector(zd) * z + Vector(zd) * 0.02   # chest frame
    obox(body, (0.66, 0.7, 0.07), C(-0.1, 0.3), (1, 0, 0), yd, ivory, bevel=0.025)           # ivory breastplate
    box(body, (0.6, 0.07, 0.86), (0, -0.37, -0.02), ivory, bevel=0.025)                   # ivory belly plate
    for z, y, h in ((0.66, 0.6, 0.24), (0.3, 0.54, 0.24), (-0.06, 0.5, 0.22), (-0.42, 0.46, 0.2), (-0.7, 0.4, 0.17)):
        dorsal(body, (0, y, z), h, 0.06, 0.13, 0.22, crystal)                          # red crystals down the spine
    # Furnace cracks: down each side of the chest beside the breastplate, across each flank and each haunch.
    for s in (-1, 1):
        crack(body, C(0.4, 0.295) + Vector((s * 0.38, 0, 0)), -Vector(yd), zd, 0.6, 0.045, rng, steps=5, color=glow)
        crack(body, (s * 0.506, 0.1, 0.58), (0, -0.3, -1), (s, 0, 0), 0.45, 0.04, rng, steps=4, color=glow)
        crack(body, (s * 0.406, 0.2, -0.4), (0, -0.4, -1), (s, 0, 0), 0.34, 0.035, rng, steps=3, branches=0, color=glow)
    # Harness: a girth, a strap across the breastplate with a gilt buckle, straps along the sides to the girth and a
    # saddle pack hanging behind the girth on each flank, below the wing.
    box(body, (1.07, 0.88, 0.12), (0, 0.06, 0.02), leather, bevel=0.02)                                   # girth
    obox(body, (1.04, 0.11, 0.05), C(0.12, 0.33), (1, 0, 0), yd, leather)                                  # chest strap
    obox(body, (0.16, 0.16, 0.06), C(0.12, 0.345), (1, 0, 0), yd, gold, bevel=0.01)                       # buckle
    obox(body, (0.08, 0.08, 0.06), C(0.12, 0.36), (1, 0, 0), yd, leather)
    for s in (-1, 1):
        f = C(0.12, 0.31)
        beam(body, (s * 0.515, f.y, f.z), (s * 0.515, 0.2, 0.06), 0.035, 0.11, leather)             # side strap
        box(body, (0.035, 0.15, 0.15), (s * 0.545, 0.2, 0.02), gold, bevel=0)                         # girth buckle
        box(body, (0.035, 0.07, 0.07), (s * 0.555, 0.2, 0.02), leather, bevel=0)
        box(body, (0.14, 0.28, 0.34), (s * 0.5, 0.04, -0.24), leather, bevel=0.02)                  # saddle pack
        box(body, (0.15, 0.09, 0.35), (s * 0.505, 0.17, -0.24), 0x4A2A16, bevel=0)                  # its flap
        for z in (-0.32, -0.16):
            box(body, (0.03, 0.08, 0.06), (s * 0.58, 0.1, z), gold, bevel=0)                        # gilt clasps
            box(body, (0.03, 0.04, 0.03), (s * 0.586, 0.1, z), leather, bevel=0)

    def neck(n, i):
        w = 0.36 - i * 0.03
        beam(n, (0, 0, -0.14), (0, 0, 0.4), 2 * w, 2 * w, main, taper=((w - 0.03) / w,) * 2, bevel=0.04)
        dorsal(n, (0, w - 0.01, 0.12), 0.2, 0.05, 0.11, 0.2, crystal)
        if i < 3:   # a crack running up the throat, and one up a side
            crack(n, (0.03, -w + 0.006, -0.1), (0, 0, 1), (0, -1, 0), 0.5, 0.042, rng, steps=4, branches=0, color=glow)
            s = 1 if i == 1 else -1
            crack(n, (s * (w - 0.006), -w * 0.6, 0.02), (0, 0.45, 1), (s, 0, 0), 0.36, 0.035, rng, steps=3, branches=0, color=glow)
    # The neck rises steeply out of the shoulders, so the head is carried high and the breastplate shows under it.
    last = segments(body, 'neck', 3, (0, 0.46, 0.66), (0.34, 0.34, 0.34), (-0.65, -0.45, -0.25), neck)

    head = pivot(last, 'head', (0, 0.02, 0.4), (0.7, 0, 0))
    # Skull built round the eye sockets, as the drakeling's: core, back of the head, cheek, front wall, brow ridge.
    box(head, (0.56, 0.46, 0.6), (0, 0.14, 0.0), main, bevel=0.05)                    # core (eye floor at |x| 0.28)
    box(head, (0.65, 0.42, 0.34), (0, 0.15, -0.13), main, bevel=0.05)                 # back of the head
    box(head, (0.65, 0.17, 0.36), (0, 0.0, 0.2), main, bevel=0.04)                    # cheek
    box(head, (0.64, 0.17, 0.08), (0, 0.17, 0.35), main, bevel=0)                     # wall in front of the eye
    beam(head, (0, 0.13, 0.26), (0, 0.1, 0.86), 0.52, 0.28, main, taper=(0.84, 0.82), bevel=0.04)  # snout
    box(head, (0.36, 0.02, 0.5), (0, 0.008, 0.55), 0xE8601C, bevel=0, emissive=0xC03A0A, strength=1.2)  # molten roof of the mouth
    for s in (-1, 1):
        beam(head, (s * 0.255, 0.31, -0.04), (s * 0.26, 0.29, 0.4), 0.15, 0.09, dark, taper=(0.7, 0.6), bevel=0.02)  # brow ridge
        eye(head, s, 0.28, 0.17, 0.175, 0.11, 0.22, 0xFF8A1C, 0x140806, 0x1A0806, glow=0xFF5A08, strength=1.4)
        box(head, (0.08, 0.02, 0.02), (s * 0.1, 0.05, 0.865), MOUTH, bevel=0)            # nostril: a low slit
        horn(head, [(s * 0.235, 0.04, 0.72), (s * 0.235, -0.08, 0.73)], 0.045, ivory)    # upper fang
        dorsal(head, (s * 0.15, 0.37, -0.02), 0.13, 0.06, 0.08, 0.14, crystal)            # red crystal crest
        a, m, b = Vector((s * 0.17, 0.34, -0.14)), Vector((s * 0.28, 0.6, -0.5)), Vector((s * 0.34, 0.76, -0.92))
        horn(head, [a, m, b], 0.17, ivory, tip=0.1)                                       # great horn
        band(head, a, m, 0.62, 0.17 * 0.72, 0.17 * 0.72, gold, length=0.07)
        for k, (base, tip) in enumerate((((0.31, 0.22, -0.22), (0.5, 0.34, -0.66)), ((0.31, 0.06, -0.2), (0.5, 0.08, -0.6)),
                                          ((0.29, -0.08, -0.14), (0.44, -0.16, -0.48)))):
            base, tip = Vector((s * base[0], base[1], base[2])), Vector((s * tip[0], tip[1], tip[2]))
            horn(head, [base, tip], 0.1 - k * 0.015, ivory, tip=0.15)                     # cheek spikes
            band(head, base, tip, 0.4, (0.1 - k * 0.015) * 0.75, (0.1 - k * 0.015) * 0.75, gold, length=0.05)
    jaw = pivot(head, 'jaw', (0, -0.06, 0.22))
    beam(jaw, (0, -0.02, -0.4), (0, -0.012, 0.62), 0.5, 0.15, main, taper=(0.82, 0.8), bevel=0.03)
    box(jaw, (0.32, 0.02, 0.54), (0, 0.048, 0.27), 0xE8601C, bevel=0, emissive=0xC03A0A, strength=1.2)   # molten floor of the mouth

    def tail(t, i):
        w = 0.33 - (i - 1) * 0.045
        beam(t, (0, 0, 0.1), (0, 0, -0.42), 2 * (w + 0.02), 2 * (w + 0.02), main, taper=((w - 0.03) / (w + 0.02),) * 2, bevel=0.03)
        dorsal(t, (0, w, -0.18), 0.2 - i * 0.02, 0.05, 0.11 - i * 0.008, 0.2 - i * 0.015, crystal)
    last = segments(body, 'tail', 5, (0, 0.04, -0.74), (-0.36,) * 4, (0.16, 0.05, 0.02, -0.04, -0.06), tail)
    box(last, (0.22, 0.21, 0.07), (0, 0, -0.4), gold, bevel=0)                                    # gilt band
    beam(last, (0, 0, -0.42), (0, 0.02, -0.86), 0.21, 0.21, ivory, taper=(0.06, 0.06))           # ivory spike

    for side, s in (('L', 1), ('R', -1)):
        raised_wing(body, side, (s * 0.4, 0.44, 0.26), 2.1, dark, skin, gold, ivory, thick=0.78, edge=gold)
    finish('DB_cinderwing', 'cinderwing.glb')


# ─── Ember Whelp: the chibi pet ──────────────────────────────────────────────

def whelp():
    main, dark, belly, cream, skin = 0xFF8A2A, 0xD8601C, 0xFFD27A, 0xFFF0C8, 0xFFB45C
    scene, root = fresh_scene('DB_whelp')
    inner = pivot(root, 'inner')
    inner.scale = (0.42, 0.42, 0.42)
    for name, x, z in (('legFL', 0.22, 0.24), ('legFR', -0.22, 0.24), ('legBL', 0.25, -0.2), ('legBR', -0.25, -0.2)):
        l = pivot(inner, name, (x, 0.36, z))
        box(l, (0.24, 0.3, 0.26), (0, -0.13, 0), main, bevel=0.05)             # stubby leg
        box(l, (0.28, 0.14, 0.34), (0, -0.29, 0.05), main, bevel=0.04)         # foot, sole on the ground
        for k in (-1, 0, 1):
            box(l, (0.06, 0.06, 0.05), (k * 0.08, -0.32, 0.23), cream, bevel=0.01)  # toe nubs

    body = pivot(inner, 'body', (0, 0.66, 0))
    box(body, (0.7, 0.64, 0.84), (0, 0, 0), main, bevel=0.1)
    box(body, (0.5, 0.46, 0.66), (0, -0.1, 0.1), belly, bevel=0.08)  # belly patch showing under and in front
    for i in range(3):  # three soft back nubs
        box(body, (0.09, 0.1, 0.12), (0, 0.33 - i * 0.02, 0.06 - i * 0.18), dark, bevel=0.02)

    def neck(n, i):
        box(n, (0.44, 0.42, 0.36), (0, -0.01, 0.05), main, bevel=0.07)
    last = segments(body, 'neck', 2, (0, 0.2, 0.3), (0.1, 0.1), (-0.35, -0.35), neck)

    # Head sits down on the short neck (no gap under the chin in profile).
    head = pivot(last, 'head', (0, -0.03, 0.0), (0.4, 0, 0))
    box(head, (0.72, 0.64, 0.66), (0, 0.2, 0.08), main, bevel=0.1)       # big cube head
    box(head, (0.44, 0.26, 0.24), (0, 0.06, 0.4), main, bevel=0.06)      # short square snout
    for s in (-1, 1):
        # Big square eyes on the face: white square, a large dark pupil set slightly in, a white catch-light.
        box(head, (0.2, 0.22, 0.03), (s * 0.17, 0.33, 0.415), 'white', bevel=0.01)
        box(head, (0.13, 0.16, 0.03), (s * 0.15, 0.31, 0.43), 0x24160F, bevel=0)
        box(head, (0.05, 0.05, 0.02), (s * 0.18, 0.36, 0.45), 'white', bevel=0)
        box(head, (0.1, 0.05, 0.02), (s * 0.27, 0.17, 0.415), 0xFF6A4A, bevel=0)  # blush
        box(head, (0.04, 0.03, 0.02), (s * 0.07, 0.12, 0.525), 0x8A3A14, bevel=0)  # nostril
        beam(head, (s * 0.14, 0.5, -0.02), (s * 0.19, 0.66, -0.1), 0.1, 0.1, cream, taper=(0.6, 0.6), bevel=0.015)  # nub horn
    jaw = pivot(head, 'jaw', (0, 0.0, 0.26))
    box(jaw, (0.36, 0.08, 0.24), (0, -0.07, 0.1), belly, bevel=0.02)

    def tail(t, i):
        r = 0.15 - i * 0.035
        beam(t, (0, 0, 0.06), (0, 0, -0.26), 2 * r, 2 * r, main, taper=(0.75, 0.75), bevel=0.02)
    last = segments(body, 'tail', 3, (0, -0.02, -0.38), (-0.17, -0.15), (0.15, 0.55, 0.8), tail)
    # Flame tuft: a bright core and two licks splaying out, pointing on along the tail.
    for d, r, h, col in (((0, 0, -1), 0.08, 0.26, 0xFFD040), ((0.5, 0.1, -1), 0.055, 0.18, 0xFF8A20), ((-0.5, 0.1, -1), 0.055, 0.18, 0xFF8A20)):
        a = Vector((0, 0, -0.2))
        beam(last, a, a + Vector(d).normalized() * h, 2 * r, 2 * r, col, taper=(0.1, 0.1), emissive=col, strength=2.5)

    for side, s in (('L', 1), ('R', -1)):
        bat_wing(body, side, (s * 0.2, 0.24, 0.06), 0.6, dark, skin, cream, fingers=3, raise_=0.4, thick=1.5, scallop_depth=0.3)
    finish('DB_whelp', 'whelp.glb')


for _build in (drakeling, cinderwing, whelp):   # DB_ONLY = ['drakeling'] exports only those
    if _build.__name__ in (globals().get('DB_ONLY') or ('drakeling', 'cinderwing', 'whelp')):
        _build()
result = {'ok': True}
