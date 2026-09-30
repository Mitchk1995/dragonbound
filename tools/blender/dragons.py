"""Dragons: Drakeling (minion), Cinderwing (boss) and the Ember Whelp pet.

Blocky, modular build: bodies are stacked chamfered slabs (hips, belly, chest, withers), necks and tails are
chains of shrinking boxes, heads are a box skull with a tapered box snout and jaw, legs are box segments,
horns and claws are angled wedge segments. Only the bat-wing membranes, frills, flame and glow seams are flat
faceted panels. Faces +Z; right-side parts (legFR/legBR/wingR) at -X, left at +X. Rig names match
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


def leg(inner, name, pos, main, dark, claw, r=1.0, back=False, toes=3):
    """Blocky leg on a hip/shoulder pivot; the foot block's sole sits on the ground (y = -pos.y in pivot space)."""
    l = pivot(inner, name, pos)
    g = -pos[1]
    ankle = Vector((0, g + 0.13, 0.0))
    if back:  # digitigrade: a heavy thigh slab forward to the knee, shin back to the hock, then down
        knee, hock = Vector((0, -0.24, 0.13 * r)), Vector((0, g + 0.3, -0.1 * r))
        beam(l, (0, 0.14, -0.06 * r), knee, 0.34 * r, 0.42 * r, main, taper=(0.6, 0.55), over=0.06)
        beam(l, knee, hock, 0.17 * r, 0.16 * r, main, taper=(0.8, 0.8), over=0.08)
        beam(l, hock, ankle, 0.14 * r, 0.13 * r, dark, taper=(0.9, 0.9), over=0.06)
    else:  # upper arm back to the elbow, forearm forward to the wrist
        elbow = Vector((0, -0.28, -0.06 * r))
        beam(l, (0, 0.1, 0.02), elbow, 0.28 * r, 0.3 * r, main, taper=(0.65, 0.6), over=0.06)
        beam(l, elbow, ankle, 0.17 * r, 0.17 * r, main, taper=(0.85, 0.85), over=0.08)
        box(l, (0.19 * r, 0.17 * r, 0.19 * r), tuple(elbow), main, bevel=0.02)
    box(l, (0.25 * r, 0.12, 0.3 * r), (0, g + 0.06, ankle.z + 0.04 * r), dark, bevel=0.02)
    for k in range(toes):
        x = (k - (toes - 1) / 2) * 0.08 * r
        horn(l, [(x, g + 0.07, ankle.z + 0.15 * r), (x * 1.2, g + 0.02, ankle.z + 0.28 * r)], 0.065 * r, claw)
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
    box(body, (0.58, 0.5, 0.4), (0, 0.04, -0.5), main, bevel=0.05)                        # hips
    box(body, (0.76, 0.64, 0.56), (0, 0.06, -0.04), main, bevel=0.06)                     # belly block
    box(body, (0.7, 0.62, 0.46), (0, 0.13, 0.42), main, rot=(-0.14, 0, 0), bevel=0.06)    # chest
    box(body, (0.46, 0.42, 0.32), (0, 0.25, 0.74), main, rot=(-0.35, 0, 0), bevel=0.04)   # withers into the neck
    for i in range(5):  # belly plates, chest to hips
        z = 0.52 - i * 0.24
        box(body, (0.44 - abs(i - 1.5) * 0.04, 0.08, 0.2), (0, -0.27 + (0.06 if i == 0 else 0), z), belly, rot=(-0.25 if i == 0 else 0, 0, 0), bevel=0.02)
    for i in range(3):
        fin(body, (0, 0.36 - i * 0.015, 0.3 - i * 0.34), 0.24, 0.2 - i * 0.03, dark)

    def neck(n, i):
        beam(n, (0, 0, -0.12), (0, 0, 0.46), 0.38, 0.38, main, taper=(0.85, 0.85), bevel=0.04)
        box(n, (0.26, 0.07, 0.3), (0, -0.18, 0.18), belly, bevel=0.02)
    last = segments(body, 'neck', 2, (0, 0.3, 0.72), (0.4, 0.4), (-0.35, -0.35), neck)

    head = pivot(last, 'head', (0, 0.02, 0.42), (0.4, 0, 0))
    box(head, (0.44, 0.36, 0.46), (0, 0.12, 0.04), main, bevel=0.05)                               # skull
    beam(head, (0, 0.06, 0.2), (0, 0.02, 0.8), 0.32, 0.23, main, taper=(0.72, 0.7), bevel=0.03)   # snout
    for s in (-1, 1):
        box(head, (0.15, 0.06, 0.24), (s * 0.13, 0.29, 0.2), dark, rot=(0.2, 0, s * -0.3), bevel=0.015)  # brow
        box(head, (0.12, 0.06, 0.04), (s * 0.13, 0.22, 0.27), 'eye', emissive='eye', strength=4, rot=(0, s * 0.3, s * 0.2), bevel=0)
        box(head, (0.05, 0.03, 0.04), (s * 0.06, 0.1, 0.8), 0x3A120C, bevel=0)  # nostril
        horn(head, curve((s * 0.13, 0.24, -0.04), (s * 0.24, 0.32, -0.5), (s * 0.02, 0.1, 0.02)), 0.11, horn_col)
        horn(head, [(s * 0.1, -0.04, 0.6), (s * 0.1, -0.14, 0.62)], 0.045, horn_col)  # fang
    jaw = pivot(head, 'jaw', (0, -0.1, 0.24))
    beam(jaw, (0, -0.02, -0.2), (0, -0.03, 0.52), 0.32, 0.13, belly, taper=(0.6, 0.7), bevel=0.02)
    box(jaw, (0.2, 0.03, 0.3), (0, 0.035, 0.2), 'fire', emissive='fire', strength=3, bevel=0)

    def tail(t, i):
        w = 0.22 - i * 0.045
        beam(t, (0, 0, 0.1), (0, 0, -0.54), 2 * (w + 0.02), 2 * (w + 0.02), main, taper=((w - 0.03) / (w + 0.02),) * 2, bevel=0.03)
    last = segments(body, 'tail', 3, (0, 0.02, -0.62), (-0.48, -0.48), (0.2, 0.05, 0.05), tail)
    prism(last, [(0, 0.2), (-0.14, 0), (0, -0.12), (0.14, 0)], 0.04, (0, 0, -0.56), dark, rot=(-PI / 2, 0, 0))  # tail spade

    for side, s in (('L', 1), ('R', -1)):
        bat_wing(body, side, (s * 0.3, 0.3, 0.3), 0.95, bone, skin, horn_col, skin_glow=0x5A1008)
    finish('DB_drakeling', 'drakeling.glb')


# ─── Cinderwing: the boss ─────────────────────────────────────────────────────

def cinderwing():
    # Unlike the bright red drakeling: charcoal black-red scales, ember-orange belly plates, a furnace glowing through
    # cracks in the throat and chest, near-black wings whose trailing edges smoulder. Ash-pale horns keep the
    # silhouette readable in the dark lair.
    main, dark, belly, horn_col, bone, skin, frill = 0x3A1B18, 0x170C0B, 0xC8561C, 0xD2C4AC, 0x1A0D0B, 0x2A1411, 0x221010
    ember = dict(emissive=0xFF7A1A, strength=2.5)
    hot = 0xFFA040
    scene, root = fresh_scene('DB_cinderwing')
    inner = pivot(root, 'inner')
    inner.scale = (2.4, 2.4, 2.4)
    for name, x, z, back in (('legFL', 0.36, 0.44, False), ('legFR', -0.36, 0.44, False), ('legBL', 0.4, -0.44, True), ('legBR', -0.4, -0.44, True)):
        leg(inner, name, (x, 0.7, z), main, dark, horn_col, r=1.3, back=back)

    body = pivot(inner, 'body', (0, 0.94, 0))
    box(body, (0.74, 0.62, 0.44), (0, 0.05, -0.52), main, bevel=0.06)                      # hips
    box(body, (1.0, 0.82, 0.6), (0, 0.08, -0.04), main, bevel=0.07)                       # belly block
    box(body, (0.96, 0.84, 0.5), (0, 0.15, 0.44), main, rot=(-0.14, 0, 0), bevel=0.07)    # chest
    box(body, (0.62, 0.56, 0.36), (0, 0.29, 0.8), main, rot=(-0.35, 0, 0), bevel=0.05)    # withers into the neck
    for i in range(5):  # chest plates glow like a furnace; belly plates behind them are ember orange
        z = 0.56 - i * 0.24
        box(body, (0.52 - abs(i - 1.5) * 0.05, 0.08, 0.2), (0, -0.35 + (0.07 if i == 0 else 0), z), hot if i < 2 else belly,
            rot=(-0.3 if i == 0 else 0, 0, 0), bevel=0, taper=(0.8, 0.8), **(ember if i < 2 else {}))
    for i in range(5):
        fin(body, (0, 0.46 - abs(i - 1) * 0.02, 0.5 - i * 0.28), 0.26, 0.3 - abs(i - 1) * 0.03, dark, thick=0.07)
    for s in (-1, 1):
        # furnace cracks across each flank, and seams either side of the spine for the top-down camera
        x = s * 0.505
        seam(body, [(x, -0.24, 0.26), (x, -0.04, 0.14), (x, -0.12, 0.02), (x, 0.1, -0.12), (x, 0.0, -0.26)], 0.04, hot)
        y = 0.495
        seam(body, [(s * 0.14, y, 0.24), (s * 0.2, y, 0.08), (s * 0.12, y, -0.08), (s * 0.19, y, -0.26)], 0.035, hot)

    def neck(n, i):
        w = 0.32 - i * 0.03
        beam(n, (0, 0, -0.14), (0, 0, 0.46), 2 * w, 2 * w, main, taper=((w - 0.03) / w,) * 2, bevel=0.04)
        box(n, (w * 1.2, 0.07, 0.34), (0, -w + 0.01, 0.18), hot, bevel=0.015, taper=(0.8, 0.8), **ember)  # glowing throat
        for s in (-1, 1):  # cracks running up the sides from the throat, and along the top
            x = s * (w - 0.005)
            seam(n, [(x, -w * 0.8, 0.34), (x, -w * 0.35, 0.18), (x, w * 0.05, 0.3)], 0.035, hot)
            seam(n, [(s * w * 0.45, w - 0.005, 0.36), (s * w * 0.6, w - 0.005, 0.14), (s * w * 0.4, w - 0.005, -0.08)], 0.03, hot)
        fin(n, (0, w - 0.03, 0.16), 0.24, 0.2, dark, thick=0.06)
    last = segments(body, 'neck', 3, (0, 0.32, 0.76), (0.4, 0.4, 0.4), (-0.35, -0.35, -0.35), neck)

    head = pivot(last, 'head', (0, 0.02, 0.44), (0.4, 0, 0))
    # Heavy wedge: a broad box skull and a long tapering snout block; angled brow slabs over the eyes.
    box(head, (0.62, 0.46, 0.56), (0, 0.13, 0.04), main, bevel=0.06)
    beam(head, (0, 0.07, 0.26), (0, 0.02, 0.94), 0.46, 0.3, main, taper=(0.72, 0.66), bevel=0.04)
    for s in (-1, 1):
        box(head, (0.22, 0.09, 0.38), (s * 0.18, 0.36, 0.22), frill, rot=(0.25, s * 0.1, s * -0.32), bevel=0.02)  # heavy brow
        box(head, (0.17, 0.08, 0.05), (s * 0.19, 0.27, 0.33), 0xFFC050, emissive=0xFFB040, strength=6, rot=(0, s * 0.45, s * 0.25), bevel=0)  # eye
        box(head, (0.07, 0.04, 0.06), (s * 0.08, 0.11, 0.92), hot, bevel=0, **ember)  # nostril
        # Crown: two great swept-back horns, two shorter ones below them.
        horn(head, curve((s * 0.18, 0.3, -0.08), (s * 0.36, 0.48, -0.8), (s * 0.04, 0.16, 0.02), 4), 0.19, horn_col)
        horn(head, curve((s * 0.28, 0.16, -0.12), (s * 0.54, 0.16, -0.6), (s * 0.04, 0.1, 0.04)), 0.13, horn_col)
        for k in range(2):
            horn(head, [(s * (0.13 + k * 0.06), -0.06, 0.8 - k * 0.2), (s * (0.13 + k * 0.06), -0.19, 0.78 - k * 0.2)], 0.055, horn_col)  # upper fangs
        # cheek frills flaring back from the jaw hinge: flat blades tipped with horn (on the skull, so they stay put when the jaw opens)
        a = Vector((s * 0.26, -0.04, 0.0))
        for t in (Vector((s * 0.52, 0.26, -0.3)), Vector((s * 0.64, 0.06, -0.46)), Vector((s * 0.54, -0.18, -0.58))):
            beam(head, a, a.lerp(t, 0.7), 0.035, 0.2, frill, taper=(1.0, 0.35))
            horn(head, [a.lerp(t, 0.6), t], 0.06, horn_col)
    horn(head, curve((0, 0.35, -0.12), (0, 0.42, -0.62), (0, 0.1, 0)), 0.13, horn_col)  # centre crest horn
    jaw = pivot(head, 'jaw', (0, -0.1, 0.22))
    # Strong jaw: a deep lower mandible block with a heavy chin.
    beam(jaw, (0, -0.05, -0.26), (0, -0.06, 0.66), 0.5, 0.22, dark, taper=(0.55, 0.65), bevel=0.03)
    box(jaw, (0.26, 0.04, 0.46), (0, 0.06, 0.24), hot, bevel=0, **ember)  # molten mouth
    for s in (-1, 1):
        for k in range(2):
            horn(jaw, [(s * (0.1 + k * 0.05), 0.04, 0.56 - k * 0.16), (s * (0.1 + k * 0.05), 0.15, 0.56 - k * 0.16)], 0.05, horn_col)  # lower fangs

    def tail(t, i):
        w = 0.3 - i * 0.045
        beam(t, (0, 0, 0.1), (0, 0, -0.54), 2 * (w + 0.02), 2 * (w + 0.02), main, taper=((w - 0.03) / (w + 0.02),) * 2, bevel=0.03)
        fin(t, (0, w - 0.02, -0.22), 0.22, 0.24 - i * 0.03, dark, thick=0.06)
    last = segments(body, 'tail', 5, (0, 0.03, -0.66), (-0.48,) * 4, (0.18, 0.05, 0.05, 0.05, 0.05), tail)
    prism(last, [(0, 0.28), (-0.2, 0.02), (0, -0.12), (0.2, 0.02)], 0.06, (0, 0, -0.56), dark, rot=(-PI / 2, 0, 0))  # tail blade
    for s in (-1, 1):
        horn(last, curve((s * 0.06, 0, -0.36), (s * 0.34, 0.06, -0.6), (0, 0.04, 0)), 0.09, horn_col)

    for side, s in (('L', 1), ('R', -1)):
        bat_wing(body, side, (s * 0.36, 0.36, 0.34), 2.0, bone, skin, horn_col, edge=0xFF6A1A)
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
        box(n, (0.38, 0.38, 0.3), (0, 0, 0.05), main, bevel=0.06)
    last = segments(body, 'neck', 2, (0, 0.2, 0.3), (0.1, 0.1), (-0.35, -0.35), neck)

    head = pivot(last, 'head', (0, 0.04, 0.1), (0.4, 0, 0))
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


drakeling()
cinderwing()
whelp()
result = {'ok': True}
