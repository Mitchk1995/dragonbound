"""Parts library for the dragons in dragons.py: the drakeling, Cinderwing and the Ember Whelp.

Blocky, modular parts: box beams between two points, wedge horns and claws, glowing seams and crack ribbons, faceted
membrane panels with scalloped edges, bat wings (the whelp's) and raised wings (the drakeling's and Cinderwing's),
chains of rig pivots for necks and tails, lofted solids through rings of points, exact boolean carving, legs standing in
paws whose claws grow out of the toes, gilt bands, chest scutes, dorsal spikes and plates, eyes and hexagonal shoulder
plates. All coordinates are three.js: Y up, +Z forward; right-side parts at -X, left at +X.
"""
import math
import _common
from _common import *   # dragons.py reloads _common before it imports this

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
# gilt fittings, one eye a side sunk in a socket (carved into the drakeling's one-piece skull; walled with blocks on
# Cinderwing: a brow ridge above it, a cheek below, a wall in front) so it reads only from the side and the brow never
# covers it, paws with toes and claws, and raised bat wings rooted on the shoulder blades.

def obox(parent, size, centre, xdir, ydir, color, bevel=0.0, taper=None, emissive=None, strength=2.0):
    """Box whose local X and Y run along `xdir` and `ydir` (Y is squared up to X; Z completes the frame)."""
    x = Vector(xdir).normalized()
    y = Vector(ydir)
    y = (y - x * y.dot(x)).normalized()
    e = Matrix((x, y, x.cross(y))).transposed().to_euler('ZYX')
    return box(parent, size, tuple(Vector(centre)), color, rot=(e.x, e.y, e.z), bevel=bevel, taper=taper,
               emissive=emissive, strength=strength)


def crack(parent, origin, u, n, length, w, rng, steps=5, branches=1, color=0xFFB848, path=None):
    """A glowing crack across a flat face (outward normal `n`): a jagged path from `origin` along `u`, each step kinked
    sideways at random, thinning toward its end, with short forks. Drawn as one thin ribbon lying just off the face
    (two triangles a segment), so a boss covered in cracks stays inside its triangle budget. The path's points are
    added to the list `path`, if given, so other cracks can fork off it."""
    origin, u, n = Vector(origin), Vector(u).normalized(), Vector(n).normalized()
    v = n.cross(u)
    step = length / steps
    pts = [origin]
    side = rng.choice((-1, 1))
    for i in range(steps):
        side = -side if rng.random() < 0.75 else side
        pts.append(pts[-1] + u * step * rng.uniform(0.7, 1.3) + v * side * step * rng.uniform(0.25, 0.7))
    if path is not None:
        path.extend(pts)
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


def oct_ring(c, xd, yd, w, h, k=0.28):
    """Eight points round centre `c` in the plane of the unit directions `xd` (across) and `yd` (up): a w x h rectangle
    with its corners cut by k of its smaller side, in order round the ring (k = 0: just the rectangle's four corners)."""
    c, xd, yd = Vector(c), Vector(xd).normalized(), Vector(yd).normalized()
    a, b, e = w / 2, h / 2, k * min(w, h)
    if not k:   # square corners: just the four
        return [c + xd * x + yd * y for x, y in ((a, -b), (a, b), (-a, b), (-a, -b))]
    return [c + xd * x + yd * y for x, y in ((a, e - b), (a, b - e), (a - e, b), (e - a, b), (-a, b - e), (-a, e - b),
                                             (e - a, -b), (a - e, -b))]


def loft(parent, rings, color, emissive=None, strength=2.0):
    """Closed solid through rings of points (each the same count, in the same order round), capped flat at both ends; a
    ring of one point ends the solid in a tip there. Rings that are scaled and shifted copies of each other give flat
    faces between them."""
    bm = bmesh.new()
    vs = [[bm.verts.new(Vector(p)) for p in r] for r in rings]
    for r0, r1 in zip(vs, vs[1:]):
        if len(r0) == 1 or len(r1) == 1:
            ring, tip = (r1, r0[0]) if len(r0) == 1 else (r0, r1[0])
            for i in range(len(ring)):
                bm.faces.new((ring[i], ring[(i + 1) % len(ring)], tip))
            continue
        for i in range(len(r0)):
            j = (i + 1) % len(r0)
            bm.faces.new((r0[i], r0[j], r1[j], r1[i]))
    for r in (vs[0], vs[-1]):
        if len(r) > 2:
            bm.faces.new(r)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _common._mesh_obj(bm, parent, (0, 0, 0), (0, 0, 0), color, emissive, strength)


def carve(base, *cutters):
    """Cut the cutters out of `base` (exact boolean difference) and remove them: sockets and nostrils sunk into one solid
    skull, with no separate blocks stuck on round them."""
    bpy.context.view_layer.update()
    for o in cutters:
        m = base.modifiers.new('carve', 'BOOLEAN')
        m.operation = 'DIFFERENCE'
        m.solver = 'EXACT'
        m.object = o
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(base.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
    for p in me.polygons:
        p.use_smooth = False
    old = [base.data] + [o.data for o in cutters]
    base.modifiers.clear()
    base.data = me
    for o in cutters:
        bpy.data.objects.remove(o, do_unlink=True)
    for m in old:
        bpy.data.meshes.remove(m)
    return base


def inflate(parent, keep, k):
    """Grow every mesh built on `parent` since `keep` (its children before) by k = (x, y, z) about the parent's origin,
    baking it into the meshes: the assembly grows as one built thing, every part still meeting the next."""
    S = Matrix.Diagonal((k[0], k[1], k[2], 1.0))
    for o in parent.children:
        if o not in keep and o.type == 'MESH':
            o.data.transform(S @ o.matrix_basis)
            o.matrix_basis = Matrix.Identity(4)


def talon(parent, root, fwd, w, h, reach, ground, color):
    """Hooked claw growing out of a toe's front face, pointing along the level direction `fwd`: `root` is the middle of
    its underside where it leaves the toe. A blocky wedge `w` wide and `h` tall there, its top curving down to a blunt
    tip on the ground (y = `ground`) `reach` ahead. Its sections stand square to `fwd`, so every face is flat."""
    root, f = Vector(root), Vector(fwd).normalized()
    x, up = Vector((0, 1, 0)).cross(f).normalized(), Vector((0, 1, 0))
    at = lambda d, y: Vector((root.x, ground + y, root.z)) + f * d
    lo = root.y - ground
    return loft(parent, [oct_ring(at(-0.03, lo + h / 2), x, up, w, h, 0),
                         oct_ring(at(reach * 0.5, lo * 0.4 + h * 0.35), x, up, w * 0.85, h * 0.7, 0),
                         oct_ring(at(reach, h * 0.15 + 0.004), x, up, w * 0.55, h * 0.3, 0)], color)   # blunt tip


def paw(l, g, z, r, main, toe, claw, claw_k=1.0):
    """Paw on the ground (y = g) under a leg whose ankle is at depth z: a chamfered block the leg stands in, the main mass
    of the foot, with three toe knuckles across its front (the outer two splayed a little) and a hooked claw growing out
    of each toe, narrower and lower than the toe it grows from (`claw_k` sizes the claws). Returns the paw's height."""
    pw, ph, pl = 0.22 * r, 0.11 * r, 0.24 * r
    cz = z + 0.03 * r
    box(l, (pw, ph, pl), (0, g + ph / 2, cz), main, bevel=0.024 * r)
    front = cz + pl / 2
    tw, th, tl = 0.3 * pw, 0.76 * ph, 0.42 * pl
    for k in (-1, 0, 1):
        a = k * 0.17
        f = Vector((math.sin(a), 0, math.cos(a)))
        c = Vector((k * pw * 0.33, g + th / 2, front + tl * (0.56 if k == 0 else 0.46) - tl / 2))
        box(l, (tw, th, tl), tuple(c), toe, rot=(0, a, 0), bevel=0, taper=(0.8, 0.55))   # knuckle: top drawn in
        foot = c + f * (0.3 * tl)   # the claw's root, back inside the toe's sloping front
        # Never wider than the toe where the claw's top leaves it (the toe narrows toward its top).
        talon(l, (foot.x, g + th * 0.1, foot.z), f, tw * min(0.72 * claw_k, 0.8), th * 0.5 * claw_k, th * 0.7 * claw_k + 0.2 * tl,
              g, claw)
    return ph


def level_band(l, a, b, y, w, d, taper, color, length):
    """Gilt bracelet hugging the leg beam a->b (`w` x `d` across, its far end `taper` of that) at height y: a level
    collar, long enough front to back to close round the beam where it slants."""
    a, b = Vector(a), Vector(b)
    t = (a.y - y) / (a.y - b.y)
    slant = abs((b - a).normalized().y)
    k = 1 - (1 - taper) * t
    box(l, (w * k * 1.14, length, d * k * 1.14 / slant), tuple(a.lerp(b, t)), color, bevel=0.012)


def band(parent, a, b, t, w, d, color, length=0.07):
    """Collar `length` long round the beam a->b at fraction t, `w` x `d` across in the beam's own frame (the gilt bands
    on Cinderwing's horns and cheek spikes)."""
    a, b = Vector(a), Vector(b)
    c, u = a.lerp(b, t), (b - a).normalized()
    return beam(parent, c - u * (length / 2), c + u * (length / 2), w, d, color)


def chest_band(parent, C, face, top, bottom, front, side, color, lift=(0.015, 0.06), thick=0.07, shrink=0.94):
    """Band wrapping round a chest's front between the heights `top` and `bottom` of the chest's frame (`C(x, y, z)` is a
    point in it, its front face at z `face`): a flat front `front` wide with its ends turned back at 45 degrees for `side`
    more each way. Its outer face stands `lift[0]` off the chest at the top and `lift[1]` at the bottom, so a scute's
    lower edge stands proud over the next one; the lower edge is the upper one scaled by `shrink`, so every face stays
    flat."""
    def ring(y, n0, k):
        b, a, t = front / 2, front / 2 + side, thick
        pts = ((-a, -side), (-b, 0), (b, 0), (a, -side), (a - 0.7 * t, -side - 0.7 * t), (b - 0.4 * t, -t),
               (0.4 * t - b, -t), (0.7 * t - a, -side - 0.7 * t))
        return [C(k * u, y, n0 + k * n) for u, n in pts]
    return loft(parent, [ring(top, face + lift[0], 1.0), ring(bottom, face + lift[1], shrink)], color)


def dorsal(parent, base, up, back, w, d, color, taper=(0.2, 0.08)):
    """Wedge spike or crystal standing on `base` (sunk a little into it), `up` high with its tip leaning `back` toward the
    tail, `w` thick across the body and `d` long along it at the foot; a blunter `taper` makes it a plate."""
    base = Vector(base)
    return beam(parent, base - Vector((0, 0.03, 0)), base + Vector((0, up, -back)), w, d, color, taper=taper)


def almond(head, s, x, y, z, h, l, depth, color, glow=None, strength=1.0, k=0.3, slant=-0.12):
    """Flat almond (pointed fore and aft, its front a little lower) lying on the side of the head at |x| = x, `depth`
    thick across the head."""
    pts = [(-l / 2, 0), (-l * k, h / 2), (l * k, h / 2), (l / 2, 0), (l * k, -h / 2), (-l * k, -h / 2)]
    return prism(head, pts, depth, (s * x, y, z), color, rot=(slant, s * PI / 2, 0), emissive=glow, strength=strength)


def eye(head, s, x, y, z, h, l, iris, pupil, lining, glow=None, strength=1.0):
    """One almond eye on the socket floor at |x| = x (side s): a dark lining round it, the iris a little proud of that
    and a narrow pointed slit pupil a little forward of the middle, all inside the socket walls."""
    almond(head, s, x + 0.006, y, z, h + 0.03, l + 0.045, 0.012, lining, k=0.32)
    almond(head, s, x + 0.012, y, z, h, l, 0.016, iris, glow=glow, strength=strength)
    w, a = l * 0.055, h * 0.47
    prism(head, [(0, a), (w, 0), (0, -a), (-w, 0)], 0.016, (s * (x + 0.016), y, z + l * 0.07), pupil, rot=(-0.12, s * PI / 2, 0))


def hex_plate(parent, p, n, r, rim, boss):
    """Hexagonal shoulder plate on the face at `p` (outward normal `n`): a gilt rim half sunk into the face (straps pass
    under it) and a raised faceted boss."""
    n = Vector(n).normalized()
    p = Vector(p)
    cyl(parent, r, r, 0.09, tuple(p + n * 0.005), rim, rot=rot_to(n), seg=6)
    cyl(parent, r * 0.4, r * 0.8, 0.07, tuple(p + n * 0.06), boss, rot=rot_to(n), seg=6)


# Raised bat wing (left wing: +X out, +Y up, +Z forward), in units of span: the arm climbs from the shoulder blade to a
# high wrist, three fingers fan back and down from it, and the membrane runs down to the back behind the shoulder. The
# wing is then tilted forward about the shoulder (raised_wing `tilt`), which brings the wrist up over the shoulder and
# lifts the trailing edge, so the membrane shows its face to the overhead game camera instead of its edge.
RW_ELBOW = (0.2, 0.28, -0.16)
RW_WRIST = (0.46, 0.5, -0.2)
RW_TIPS = ((0.96, 0.36, -0.42), (0.86, 0.06, -0.76), (0.54, -0.04, -0.94))


def raised_wing(body, side, pos, span, bone, skin, cap, claw, root_at, thick=1.0, tilt=0.3, raise_=0.0,
                scallop_depth=0.2, edge=None, lift=0.8, tips=RW_TIPS):
    """Bat wing raised off the shoulder blade: box arm bones to a gilt wrist cap with a thumb claw, three box fingers with
    gilt tip caps, one membrane slab per gap with a scalloped trailing edge. The membrane's inner edge runs from the
    shoulder back to `root_at` (a point on the back, in the body's space), so it is joined to the body all the way.
    `edge` (a colour) gilds the trailing edge and the outer finger. `tilt` turns the whole wing forward (positive) about
    the shoulder; the rig flaps it about its own Z. `lift` is a faint glow in the membrane's own colour, so its shaded
    underside still reads as wing and not as a black hole. `tips` (in units of span) places the finger tips."""
    s = 1 if side == 'L' else -1
    wing = pivot(body, f'wing{side}', pos, (tilt, 0, s * raise_))
    P = lambda p: Vector((s * p[0] * span, p[1] * span, p[2] * span))
    S, E, W = Vector((0, 0, 0)), P(RW_ELBOW), P(RW_WRIST)
    tips = [P(t) for t in tips]
    root = Matrix.Rotation(-tilt, 3, 'X') @ (Vector(root_at) - Vector(pos))
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
    horn(wing, [W + P((0.01, 0.02, 0.04)), W + P((0.02, 0.06, 0.15))], 0.07 * r, claw)  # thumb claw, forward
    camber = 0.04 * span
    edges = []
    for a, b in zip(tips, tips[1:]):
        edges.append([a] + scallop(a, b, W, scallop_depth) + [b])
        panel(wing, [W] + edges[-1], skin, camber, thick=0.014 * span, emissive=skin, strength=lift)
    edges.append([tips[-1]] + scallop(tips[-1], root, E, scallop_depth * 0.8) + [root])
    panel(wing, [W] + edges[-1] + [S, E], skin, camber, thick=0.014 * span, emissive=skin, strength=lift)
    if edge is not None:
        for pts in edges:
            for a, b in zip(pts, pts[1:]):
                beam(wing, a, b, 0.03 * r, 0.03 * r, edge, over=0.03 * r)
        up = Vector((0, 0.045 * r, 0))
        beam(wing, S + up, E + up, 0.05 * r, 0.04 * r, edge, over=0.03 * r)            # gilt leading edge
        beam(wing, E + up, W + up * 0.8, 0.045 * r, 0.035 * r, edge, over=0.03 * r)
    return wing


def limb(inner, name, pos, main, pad, claw, r=1.0, back=False, toe=None, gilt=None, glow=None, rng=None, claw_k=1.0,
         girth=1.0, paw_r=None):
    """Blocky leg on a hip/shoulder pivot, standing in a paw on the ground (y = -pos.y in pivot space): a dark pad on the
    outside of the elbow or knee, the paw with its toes (`toe`, a colour, else the leg's) and claws (`claw_k` sizes them),
    and optionally a gilt band round the leg just above the paw (`gilt`) and a glowing crack down the outside of the
    upper leg (`glow`). `r` sets the leg's build; `girth` thickens its blocks on top of that and `paw_r` sizes the paw
    (default `r`), so a heavy leg still stands in a paw bigger than the leg."""
    l = pivot(inner, name, pos)
    g = -pos[1]
    s = 1 if pos[0] > 0 else -1
    q, pr = r * girth, paw_r or r   # the blocks' thickness and the paw's size
    lift = max(0.13, 0.068 * pr)    # the ankle, inside the top of the paw
    if back:   # a heavy thigh slab forward to the knee, shin back to the hock, then straight down to the paw
        top, joint = Vector((0, 0.12, -0.02 * r)), Vector((0, -0.24, 0.13 * r))
        low = Vector((0, g + 0.3 + 0.06 * (r - 1), -0.08 * r))
        ankle = Vector((0, g + lift, low.z))
        beam(l, top, joint, 0.34 * q, 0.42 * q, main, taper=(0.62, 0.55), over=0.06, bevel=0.03)
        beam(l, joint, low, 0.18 * q, 0.17 * q, main, taper=(0.85, 0.85), over=0.08, bevel=0.02)
        beam(l, low, ankle, 0.15 * q, 0.14 * q, main, taper=(0.95, 0.95), over=0.06)
        uw = 0.34 * q * 0.62
    else:      # upper arm back to the elbow, forearm straight down to the wrist
        top, joint, low = Vector((0, 0.08, 0.02)), Vector((0, -0.28, -0.05 * r)), None
        ankle = Vector((0, g + lift, 0.03 * r))
        beam(l, top, joint, 0.28 * q, 0.3 * q, main, taper=(0.68, 0.62), over=0.06, bevel=0.03)
        beam(l, joint, ankle, 0.19 * q, 0.19 * q, main, taper=(0.9, 0.9), over=0.08, bevel=0.02)
        uw = 0.28 * q * 0.68
    box(l, (0.05 * q, 0.14 * q, 0.17 * q), (s * (uw / 2 + 0.02 * q), joint.y, joint.z), pad, bevel=0)  # pad
    ph = paw(l, g, ankle.z, pr, main, toe or main, claw, claw_k)
    if gilt is not None:   # a level bracelet round the leg a little above the paw, with the leg showing between them
        if back:
            level_band(l, low, ankle, g + ph + 0.065, 0.15 * q, 0.14 * q, 0.95, gilt, 0.045 * r)
        else:
            level_band(l, joint, ankle, g + ph + 0.12, 0.19 * q, 0.19 * q, 0.9, gilt, 0.055 * r)
    if glow is not None:   # a crack across the outer face of the upper leg, near its top
        w0 = 0.34 * q * 0.88 if back else 0.28 * q * 0.9
        p = top.lerp(joint, 0.25)
        crack(l, (s * (w0 / 2 + 0.006), p.y, p.z - 0.1 * r), (0, -0.35, 1), (s, 0, 0), 0.22 * r, 0.03 * r, rng, steps=4, color=glow)
    return l


GLOW_E, GLOW_S = 0xFF8A1A, 2.2
MOUTH = 0x3A0E0A
