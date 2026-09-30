"""Dragons: Drakeling (minion), Cinderwing (boss) and the Ember Whelp pet.

A shared parts library (lofted hulls, bones, bat wings, legs, horns) plus one builder per creature.
Faces +Z; right-side parts (legFR/legBR/wingR) at -X, left at +X. Rig names match src/render/anim.ts:
body, neck1.., head, jaw, tail1.., wingL/wingR, legFL/legFR/legBL/legBR, all under a scaled 'inner'
empty (the animation's flight lift and bob are in that scaled space).
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

def _loft(frames, sides):
    """Closed loft through cross-sections (centre, x axis, y axis, rx, ry); a zero radius is a point."""
    bm = bmesh.new()
    loops = []
    for ctr, ax, ay, rx, ry in frames:
        if rx < 1e-4 and ry < 1e-4:
            loops.append([bm.verts.new(ctr)])
            continue
        loops.append([bm.verts.new(ctr + ax * (math.cos(a) * rx) + ay * (math.sin(a) * ry))
                      for a in ((i + 0.5) * 2 * PI / sides for i in range(sides))])
    for l0, l1 in zip(loops, loops[1:]):
        for i in range(sides):
            j = (i + 1) % sides
            if len(l0) == 1:
                bm.faces.new((l0[0], l1[j], l1[i]))
            elif len(l1) == 1:
                bm.faces.new((l0[i], l0[j], l1[0]))
            else:
                bm.faces.new((l0[i], l0[j], l1[j], l1[i]))
    if len(loops[0]) > 1:
        bm.faces.new(loops[0])
    if len(loops[-1]) > 1:
        bm.faces.new(list(reversed(loops[-1])))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def hull(parent, rings, color, sides=8, pos=(0, 0, 0), rot=(0, 0, 0), emissive=None, strength=2.0):
    """Chunky lofted body along local Z through (z, y, rx, ry) cross-sections (flat top and bottom faces)."""
    frames = [(Vector((0, y, z)), Vector((1, 0, 0)), Vector((0, 1, 0)), rx, ry) for z, y, rx, ry in rings]
    return _common._mesh_obj(_loft(frames, sides), parent, pos, rot, color, emissive, strength)


def ellipsoid(parent, pos, radii, color, rot=(0, 0, 0), sides=8, bands=5, emissive=None, strength=2.0):
    """Low-poly rounded blob with radii (x, y, z): `bands` rings along Z, flat caps front and back."""
    rx, ry, rz = radii
    rings = []
    for k in range(1, bands + 1):
        t = PI * k / (bands + 1)
        rings.append((-rz * math.cos(t), 0, rx * math.sin(t), ry * math.sin(t)))
    return hull(parent, rings, color, sides, pos, rot, emissive, strength)


def tube(parent, pts, radii, color, sides=5, emissive=None, strength=2.0):
    """Tapered tube along a polyline (bones, horns, claws); a zero end radius makes a point."""
    pts = [Vector(p) for p in pts]
    tangents = []
    for i in range(len(pts)):
        a, b = pts[max(0, i - 1)], pts[min(len(pts) - 1, i + 1)]
        tangents.append((b - a).normalized())
    up = Vector((0, 1, 0)) if abs(tangents[0].y) < 0.9 else Vector((1, 0, 0))
    nx = tangents[0].cross(up).normalized()
    frames = []
    for i, (p, t) in enumerate(zip(pts, tangents)):
        if i:
            nx = tangents[i - 1].rotation_difference(t) @ nx
        frames.append((p, nx, t.cross(nx).normalized(), radii[i], radii[i]))
    return _common._mesh_obj(_loft(frames, sides), parent, (0, 0, 0), (0, 0, 0), color, emissive, strength)


def curve(a, b, bend, n=4):
    """Points from a to b bowed by the offset `bend` at the middle (quadratic Bezier)."""
    a, b = Vector(a), Vector(b)
    m = (a + b) / 2 + Vector(bend)
    return [a * (1 - t) ** 2 + m * 2 * t * (1 - t) + b * t * t for t in (k / (n - 1) for k in range(n))]


def horn(parent, base, tip, bend, r, color, sides=5, n=4):
    """Curved horn or claw, thick at `base` and pointed at `tip`."""
    return tube(parent, curve(base, tip, bend, n), [r * (1 - k / (n - 1)) ** 0.8 for k in range(n)], color, sides)


def panel(parent, outline, color, camber=0.0, emissive=None, strength=2.0):
    """Thin double-sided sheet over a closed outline, fanned from a centre pushed `camber` downward (billow)."""
    pts = [Vector(p) for p in outline]
    n = Vector((0, 0, 0))
    for i, p in enumerate(pts):
        n += p.cross(pts[(i + 1) % len(pts)])
    n.normalize()
    if n.y > 0:
        n = -n
    bm = bmesh.new()
    vs = [bm.verts.new(p) for p in pts]
    ctr = bm.verts.new(sum(pts, Vector((0, 0, 0))) / len(pts) + n * camber)
    for i in range(len(vs)):
        bm.faces.new((vs[i], vs[(i + 1) % len(vs)], ctr))
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


def fin(parent, pos, length, height, color, sweep=0.5, thick=0.05):
    """Swept-back dorsal plate standing on `pos`: base `length` along Z, tip leaning back by `sweep` of the length."""
    h2 = length / 2
    # Prism outline is (x, y); rotated +90 deg about Y, outline x becomes -Z, so x here measures backward.
    return prism(parent, [(-h2, 0), (h2, 0), (h2 * 0.2 + sweep * length, height)], thick, pos, color, rot=(0, PI / 2, 0))


# Bat wing layout in units of span (left wing, +X out, +Z forward): elbow, raised wrist, finger tips fanning back.
WING_ELBOW = (0.28, 0.2, -0.14)
WING_WRIST = (0.52, 0.42, 0.06)
WING_TIPS = {
    4: ((1.1, 0.32, -0.16), (1.02, 0.12, -0.58), (0.78, 0.0, -0.86), (0.46, -0.04, -0.94)),
    3: ((0.98, 0.3, -0.22), (0.84, 0.08, -0.64), (0.5, -0.02, -0.86)),
}


def bat_wing(body, side, pos, span, bone, skin, claw, fingers=4, raise_=0.2, thick=1.0, skin_glow=None, scallop_depth=0.24):
    """Shared bat wing: humerus and forearm up/out to a raised wrist with a thumb claw, fingers fanning
    back from the wrist, one cambered membrane panel per gap with a scalloped trailing edge."""
    s = 1 if side == 'L' else -1
    wing = pivot(body, f'wing{side}', pos, (0, 0, s * raise_))
    P = lambda p: Vector((s * p[0] * span, p[1] * span, p[2] * span))
    S, E, W = Vector((0, 0, 0)), P(WING_ELBOW), P(WING_WRIST)
    tips = [P(t) for t in WING_TIPS[fingers]]
    root = P((0.05, -0.06, -0.6))
    r = span * thick
    tube(wing, [S, E], [0.05 * r, 0.04 * r], bone, sides=6)
    tube(wing, [E, W], [0.042 * r, 0.032 * r], bone, sides=6)
    for p, k in ((E, 0.05), (W, 0.045)):
        ellipsoid(wing, p, (k * r, k * r, k * r), bone, sides=6, bands=3)
    for t in tips:
        tube(wing, [W, W.lerp(t, 0.5) + Vector((0, 0.03 * span, 0)), t], [0.024 * r, 0.018 * r, 0.006 * r], bone, sides=4)
    horn(wing, W, W + P((0.02, 0.1, 0.16)), P((0, 0.03, 0)), 0.03 * r, claw, sides=4, n=3)  # thumb claw
    horn(wing, tips[0], tips[0] + P((0.08, -0.04, 0.02)), (0, 0, 0), 0.012 * r, claw, sides=4, n=2)
    camber = 0.05 * span
    # A faint self-glow in the skin colour lifts the shaded side, so the membrane reads thin and backlit.
    glow = dict(emissive=skin_glow, strength=0.5) if skin_glow is not None else {}
    for a, b in zip(tips, tips[1:]):
        panel(wing, [W, a] + scallop(a, b, W, scallop_depth) + [b], skin, camber, **glow)
    panel(wing, [W, tips[-1]] + scallop(tips[-1], root, E, scallop_depth * 0.8) + [root, S, E], skin, camber, **glow)
    return wing


def leg(inner, name, pos, main, dark, claw, r=1.0, back=False, toes=3):
    """Leg on a hip/shoulder pivot; the foot sole sits on the ground (y = -pos.y in pivot space)."""
    l = pivot(inner, name, pos)
    g = -pos[1]
    ankle = Vector((0, g + 0.12, 0.0))
    if back:  # digitigrade: heavy thigh forward to the knee, shin back to the hock, then down
        knee, hock = Vector((0, -0.24, 0.13 * r)), Vector((0, g + 0.3, -0.1 * r))
        tube(l, [(0, 0.1, -0.06 * r), knee], [0.2 * r, 0.1 * r], main, sides=7)
        tube(l, [knee, hock], [0.09 * r, 0.07 * r], main, sides=6)
        tube(l, [hock, ankle], [0.07 * r, 0.065 * r], dark, sides=6)
    else:  # upper arm back to the elbow, forearm forward to the wrist
        elbow = Vector((0, -0.28, -0.06 * r))
        tube(l, [(0, 0.08, 0.02), elbow], [0.15 * r, 0.09 * r], main, sides=7)
        tube(l, [elbow, ankle], [0.09 * r, 0.07 * r], main, sides=6)
        ellipsoid(l, elbow, (0.09 * r, 0.09 * r, 0.09 * r), main, sides=6, bands=3)
    hull(l, [(-0.1 * r, 0, 0.1 * r, 0.06), (0.06 * r, 0, 0.12 * r, 0.06), (0.16 * r, -0.01, 0.1 * r, 0.04)], dark, sides=6, pos=(0, g + 0.06, ankle.z))
    for k in range(toes):
        x = (k - (toes - 1) / 2) * 0.08 * r
        horn(l, (x, g + 0.05, ankle.z + 0.15 * r), (x * 1.2, g + 0.005, ankle.z + 0.25 * r), (0, 0.02, 0), 0.03 * r, claw, sides=4, n=3)
    return l


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


# ─── Drakeling: a lean small dragon, clean shapes ────────────────────────────

def drakeling():
    main, dark, belly, horn_col, bone, skin = 0xC9442A, 0x8E2A1A, 'belly', 'bone', 0x5A1A10, 0x9A3020
    scene, root = fresh_scene('DB_drakeling')
    inner = pivot(root, 'inner')
    inner.scale = (0.8, 0.8, 0.8)
    for name, x, z, back in (('legFL', 0.3, 0.42, False), ('legFR', -0.3, 0.42, False), ('legBL', 0.32, -0.42, True), ('legBR', -0.32, -0.42, True)):
        leg(inner, name, (x, 0.7, z), main, dark, horn_col, back=back)

    body = pivot(inner, 'body', (0, 0.92, 0))
    hull(body, [(-0.7, 0.04, 0.18, 0.18), (-0.42, 0.04, 0.33, 0.3), (0.02, 0.05, 0.4, 0.34), (0.44, 0.1, 0.37, 0.32), (0.8, 0.24, 0.24, 0.22)], main)
    for i in range(5):  # belly plates, chest to hips
        z = 0.52 - i * 0.24
        box(body, (0.44 - abs(i - 1.5) * 0.04, 0.08, 0.2), (0, -0.26 + (0.05 if i == 0 else 0), z), belly, rot=(-0.25 if i == 0 else 0, 0, 0), bevel=0.03)
    for i in range(3):
        fin(body, (0, 0.34 - i * 0.015, 0.3 - i * 0.34), 0.24, 0.2 - i * 0.03, dark)

    def neck(n, i):
        hull(n, [(-0.12, 0, 0.21, 0.21), (0.46, 0, 0.18, 0.18)], main)
        box(n, (0.26, 0.07, 0.3), (0, -0.17, 0.18), belly, bevel=0.02)
    last = segments(body, 'neck', 2, (0, 0.3, 0.72), (0.4, 0.4), (-0.35, -0.35), neck)

    head = pivot(last, 'head', (0, 0.02, 0.42), (0.4, 0, 0))
    hull(head, [(-0.16, 0.08, 0.2, 0.18), (0.1, 0.1, 0.24, 0.21), (0.34, 0.06, 0.19, 0.15), (0.64, 0.02, 0.14, 0.1), (0.78, 0.0, 0.1, 0.07)], main)
    for s in (-1, 1):
        box(head, (0.13, 0.05, 0.26), (s * 0.13, 0.25, 0.24), dark, rot=(0.2, 0, s * -0.3), bevel=0.02)  # brow
        box(head, (0.1, 0.045, 0.04), (s * 0.19, 0.18, 0.35), 'eye', emissive='eye', strength=4, rot=(0, s * 0.5, s * 0.25), bevel=0)
        box(head, (0.05, 0.03, 0.04), (s * 0.06, 0.1, 0.8), 0x3A120C, bevel=0)  # nostril
        horn(head, (s * 0.13, 0.22, -0.02), (s * 0.24, 0.3, -0.5), (s * 0.02, 0.1, 0.02), 0.07, horn_col)
        cone(head, 0.025, 0.09, (s * 0.1, -0.08, 0.62), horn_col, rot=(PI, 0, 0), seg=3)  # fang
    jaw = pivot(head, 'jaw', (0, -0.1, 0.24))
    hull(jaw, [(-0.2, -0.02, 0.17, 0.07), (0.3, -0.04, 0.14, 0.06), (0.5, -0.03, 0.09, 0.04)], belly)
    box(jaw, (0.2, 0.03, 0.3), (0, 0.03, 0.2), 'fire', emissive='fire', strength=3, bevel=0)

    def tail(t, i):
        w = 0.22 - i * 0.045
        hull(t, [(0.1, 0, w + 0.02, w + 0.02), (-0.52, 0, w - 0.03, w - 0.03)], main)
    last = segments(body, 'tail', 3, (0, 0.02, -0.62), (-0.48, -0.48), (0.2, 0.05, 0.05), tail)
    prism(last, [(0, 0.2), (-0.14, 0), (0, -0.12), (0.14, 0)], 0.04, (0, 0, -0.56), dark, rot=(-PI / 2, 0, 0))  # tail spade

    for side, s in (('L', 1), ('R', -1)):
        bat_wing(body, side, (s * 0.3, 0.3, 0.3), 0.95, bone, skin, horn_col, skin_glow=0x5A1008)
    finish('DB_drakeling', 'drakeling.glb')


# ─── Cinderwing: the boss ─────────────────────────────────────────────────────

def cinderwing():
    main, dark, belly, horn_col, bone, skin, frill = 0x8E2618, 0x3C1410, 0xE08A3A, 0xE6D6B4, 0x2A0E0A, 0x6A1C14, 0x5A1A10
    ember = dict(emissive=0xFF7A1A, strength=2.5)
    hot = 0xFFA040
    scene, root = fresh_scene('DB_cinderwing')
    inner = pivot(root, 'inner')
    inner.scale = (2.4, 2.4, 2.4)
    for name, x, z, back in (('legFL', 0.36, 0.44, False), ('legFR', -0.36, 0.44, False), ('legBL', 0.4, -0.44, True), ('legBR', -0.4, -0.44, True)):
        leg(inner, name, (x, 0.7, z), main, dark, horn_col, r=1.3, back=back)

    body = pivot(inner, 'body', (0, 0.94, 0))
    hull(body, [(-0.74, 0.04, 0.22, 0.22), (-0.44, 0.05, 0.42, 0.36), (0.02, 0.08, 0.5, 0.42), (0.46, 0.14, 0.48, 0.42), (0.84, 0.3, 0.32, 0.3)], main, sides=10)
    for i in range(5):  # chest plates glow like a furnace; belly plates behind them cool
        z = 0.56 - i * 0.24
        box(body, (0.5 - abs(i - 1.5) * 0.05, 0.08, 0.2), (0, -0.33 + (0.06 if i == 0 else 0), z), hot if i < 2 else belly,
            rot=(-0.3 if i == 0 else 0, 0, 0), bevel=0.03, taper=(0.8, 0.8), **(ember if i < 2 else {}))
    for i in range(5):
        fin(body, (0, 0.44 - abs(i - 1) * 0.02, 0.5 - i * 0.28), 0.26, 0.3 - abs(i - 1) * 0.03, dark, thick=0.07)

    def neck(n, i):
        w = 0.32 - i * 0.03
        hull(n, [(-0.14, 0, w, w), (0.46, 0, w - 0.03, w - 0.03)], main)
        box(n, (w * 1.1, 0.07, 0.3), (0, -w + 0.03, 0.18), hot, bevel=0.02, taper=(0.8, 0.8), **ember)  # glowing throat
        fin(n, (0, w - 0.03, 0.16), 0.24, 0.2, dark, thick=0.06)
    last = segments(body, 'neck', 3, (0, 0.32, 0.76), (0.4, 0.4, 0.4), (-0.35, -0.35, -0.35), neck)

    head = pivot(last, 'head', (0, 0.02, 0.44), (0.4, 0, 0))
    # Heavy wedge: broad flat skull narrowing to a blunt snout.
    hull(head, [(-0.2, 0.1, 0.24, 0.22), (0.06, 0.12, 0.33, 0.25), (0.34, 0.08, 0.28, 0.19), (0.7, 0.03, 0.2, 0.13), (0.9, 0.0, 0.16, 0.1)], main)
    for s in (-1, 1):
        box(head, (0.18, 0.08, 0.36), (s * 0.16, 0.28, 0.26), 0x6A1C12, rot=(0.22, s * 0.1, s * -0.3), bevel=0.03)  # heavy brow
        box(head, (0.12, 0.07, 0.05), (s * 0.24, 0.2, 0.38), 0xFFC050, emissive=0xFFB040, strength=6, rot=(0, s * 0.55, 0), bevel=0)  # eye
        box(head, (0.06, 0.04, 0.05), (s * 0.08, 0.1, 0.91), hot, bevel=0, **ember)  # nostril
        # Crown: two great swept-back horns, two shorter ones below them.
        horn(head, (s * 0.16, 0.28, -0.06), (s * 0.34, 0.46, -0.78), (s * 0.04, 0.16, 0.02), 0.1, horn_col, sides=6, n=5)
        horn(head, (s * 0.26, 0.16, -0.1), (s * 0.52, 0.16, -0.58), (s * 0.04, 0.1, 0.04), 0.07, horn_col, sides=5)
        for k in range(3):
            cone(head, 0.03, 0.12, (s * (0.12 + k * 0.05), -0.07, 0.8 - k * 0.14), horn_col, rot=(PI, 0, 0), seg=3)  # upper fangs
    horn(head, (0, 0.33, -0.1), (0, 0.4, -0.6), (0, 0.1, 0), 0.07, horn_col, sides=5)  # centre crest horn
    for s in (-1, 1):  # cheek frills flaring back from the jaw hinge (on the skull, so they stay put when the jaw opens)
        a = Vector((s * 0.22, -0.06, 0.0))
        tips = (Vector((s * 0.5, 0.26, -0.3)), Vector((s * 0.62, 0.06, -0.46)), Vector((s * 0.52, -0.18, -0.58)))
        panel(head, [a, tips[0]] + scallop(tips[0], tips[1], a, 0.3, 1) + [tips[1]] + scallop(tips[1], tips[2], a, 0.3, 1) + [tips[2], a.lerp(tips[2], 0.5) + Vector((0, 0.04, 0.06))], frill, 0.02)
        for t in tips:
            horn(head, a, t, (0, 0.02, 0), 0.035, horn_col, sides=4, n=3)
    jaw = pivot(head, 'jaw', (0, -0.1, 0.22))
    # Strong jaw: deep lower mandible and a heavy chin.
    hull(jaw, [(-0.24, -0.04, 0.26, 0.11), (0.3, -0.07, 0.2, 0.1), (0.62, -0.06, 0.13, 0.07)], dark)
    box(jaw, (0.24, 0.04, 0.44), (0, 0.04, 0.26), hot, bevel=0, **ember)  # molten mouth
    for s in (-1, 1):
        for k in range(2):
            cone(jaw, 0.028, 0.1, (s * (0.1 + k * 0.05), 0.07, 0.56 - k * 0.16), horn_col, seg=3)  # lower fangs

    def tail(t, i):
        w = 0.3 - i * 0.045
        hull(t, [(0.1, 0, w + 0.02, w + 0.02), (-0.52, 0, w - 0.03, w - 0.03)], main)
        fin(t, (0, w - 0.02, -0.22), 0.22, 0.24 - i * 0.03, dark, thick=0.06)
    last = segments(body, 'tail', 5, (0, 0.03, -0.66), (-0.48,) * 4, (0.18, 0.05, 0.05, 0.05, 0.05), tail)
    prism(last, [(0, 0.28), (-0.2, 0.02), (0, -0.12), (0.2, 0.02)], 0.06, (0, 0, -0.56), dark, rot=(-PI / 2, 0, 0))  # tail blade
    for s in (-1, 1):
        horn(last, (s * 0.06, 0, -0.36), (s * 0.34, 0.06, -0.6), (0, 0.04, 0), 0.05, horn_col, sides=4)

    for side, s in (('L', 1), ('R', -1)):
        bat_wing(body, side, (s * 0.36, 0.36, 0.34), 2.0, bone, skin, horn_col, skin_glow=0x4A0C06)
    finish('DB_cinderwing', 'cinderwing.glb')


# ─── Ember Whelp: the chibi pet ──────────────────────────────────────────────

def whelp():
    main, dark, belly, cream, skin = 0xFF8A2A, 0xD8601C, 0xFFD27A, 0xFFF0C8, 0xFFB45C
    scene, root = fresh_scene('DB_whelp')
    inner = pivot(root, 'inner')
    inner.scale = (0.42, 0.42, 0.42)
    for name, x, z in (('legFL', 0.22, 0.24), ('legFR', -0.22, 0.24), ('legBL', 0.25, -0.2), ('legBR', -0.25, -0.2)):
        l = pivot(inner, name, (x, 0.36, z))
        ellipsoid(l, (0, -0.12, 0), (0.13, 0.17, 0.14), main)
        ellipsoid(l, (0, -0.29, 0.05), (0.14, 0.08, 0.17), main, sides=8, bands=4)
        for k in (-1, 0, 1):
            ellipsoid(l, (k * 0.07, -0.3, 0.2), (0.035, 0.035, 0.035), cream, sides=6, bands=3)

    body = pivot(inner, 'body', (0, 0.66, 0))
    ellipsoid(body, (0, 0, 0), (0.36, 0.34, 0.44), main, sides=10, bands=6)
    ellipsoid(body, (0, -0.07, 0.12), (0.27, 0.26, 0.34), belly, sides=10, bands=5)  # round belly
    for i in range(3):  # three soft back nubs
        ellipsoid(body, (0, 0.32 - i * 0.02, 0.06 - i * 0.18), (0.05, 0.07, 0.07), dark, sides=6, bands=3)

    def neck(n, i):
        ellipsoid(n, (0, 0, 0.05), (0.2, 0.2, 0.16), main)
    last = segments(body, 'neck', 2, (0, 0.2, 0.3), (0.1, 0.1), (-0.35, -0.35), neck)

    head = pivot(last, 'head', (0, 0.04, 0.1), (0.4, 0, 0))
    ellipsoid(head, (0, 0.2, 0.08), (0.36, 0.32, 0.33), main, sides=10, bands=6)
    ellipsoid(head, (0, 0.08, 0.34), (0.22, 0.15, 0.16), main, sides=10, bands=4)  # short round snout
    for s in (-1, 1):
        # Big eyes: white, a large dark pupil set slightly in and down, a white catch-light; each layer
        # stands a little proud of the last along the eye's facing direction.
        yaw = s * 0.42
        face = Vector((math.sin(yaw), 0, math.cos(yaw)))
        eye = Vector((s * 0.16, 0.24, 0.33))
        ellipsoid(head, eye, (0.1, 0.12, 0.06), 'white', rot=(0, yaw, 0), sides=8, bands=4)
        ellipsoid(head, eye + face * 0.035 + Vector((-s * 0.012, -0.012, 0)), (0.072, 0.09, 0.035), 0x24160F, rot=(0, yaw, 0), sides=8, bands=3)
        ellipsoid(head, eye + face * 0.07 + Vector((s * 0.02, 0.035, 0)), (0.024, 0.024, 0.02), 'white', sides=6, bands=2)
        ellipsoid(head, (s * 0.24, 0.1, 0.29), (0.06, 0.035, 0.04), 0xFF6A4A, rot=(0, yaw, 0), sides=6, bands=2)  # blush
        ellipsoid(head, (s * 0.06, 0.13, 0.49), (0.02, 0.015, 0.012), 0x8A3A14, sides=6, bands=2)  # nostril
        ellipsoid(head, (s * 0.14, 0.52, -0.03), (0.06, 0.09, 0.06), cream, rot=(-0.4, 0, s * -0.25), sides=6, bands=3)  # nub horn
    jaw = pivot(head, 'jaw', (0, 0.0, 0.26))
    ellipsoid(jaw, (0, -0.01, 0.06), (0.16, 0.05, 0.12), belly, sides=8, bands=3)

    def tail(t, i):
        r = 0.15 - i * 0.035
        hull(t, [(0.06, 0, r, r), (-0.24, 0, r * 0.75, r * 0.75)], main, sides=8)
    last = segments(body, 'tail', 3, (0, -0.02, -0.38), (-0.17, -0.15), (0.15, 0.55, 0.8), tail)
    # Flame tuft: a bright core and two licks splaying out, pointing on along the tail.
    for x, yaw, r, h, col in ((0, 0, 0.08, 0.24, 0xFFD040), (0.05, 0.5, 0.055, 0.16, 0xFF8A20), (-0.05, -0.5, 0.055, 0.16, 0xFF8A20)):
        cone(last, r, h, (x, 0, -0.22 - h / 2), col, rot=(-PI / 2, 0, -yaw), emissive=col, strength=2.5, seg=5)

    for side, s in (('L', 1), ('R', -1)):
        bat_wing(body, side, (s * 0.2, 0.24, 0.06), 0.6, dark, skin, cream, fingers=3, raise_=0.4, thick=1.5, scallop_depth=0.3)
    finish('DB_whelp', 'whelp.glb')


drakeling()
cinderwing()
whelp()
result = {'ok': True}
