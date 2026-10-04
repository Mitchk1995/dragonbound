"""Weapons and their shape helpers.

Loaded by gear.py in its shared namespace; re-executed on every load for Blender iteration.
"""

# ─── Weapons (sock_handR) ────────────────────────────────────────────────────

def blade(h, y0, length, w, tip, depth=0.05):
    """Sword blade along +Y from y0: a bright bevelled edge (ROLE_trim) all round a raised metal spine, with a thin
    bright fuller down the spine, so the blade reads as polished steel with a cutting edge at game size (a dark
    fuller made it read as a dull grey bar)."""
    y1, yt = y0 + length - tip, y0 + length
    prism(h, [(-w / 2, y0), (w / 2, y0), (w * 0.43, y1), (0.0, yt), (-w * 0.43, y1)], depth * 0.7, (0, 0, 0), R.trim, bevel=0.006)
    sw = w * 0.52
    prism(h, [(-sw / 2, y0), (sw / 2, y0), (sw * 0.4, y1 + tip * 0.1), (0.0, yt - tip * 0.35), (-sw * 0.4, y1 + tip * 0.1)],
          depth, (0, 0, 0), R.metal, bevel=0.008)
    fl = length - tip * 1.2
    box(h, (w * 0.12, fl, depth + 0.012), (0, y0 + fl / 2 + 0.02, 0), R.trim, bevel=0)             # fuller


def crossguard(h, y, width, color=R.trim, block=R.metal, gem=0.035):
    """Straight crossguard bar with flared block ends over a centre block with a small gem."""
    box(h, (0.15, 0.12, 0.14), (0, y - 0.01, 0), block, bevel=0.03)                     # centre block
    box(h, (width, 0.07, 0.1), (0, y, 0), color, bevel=0.022)                          # bar
    for s in (-1, 1):
        box(h, (0.07, 0.11, 0.12), (s * (width / 2 - 0.02), y + 0.01, 0), color, bevel=0.022)   # flared ends
    facet_gem(h, gem, (0, y - 0.01, 0.075), R.glow)


# Every grip runs through the hand's hole (hero.py HAND, gloves a hair tighter): square grips up to 0.12 across with
# their corners chamfered, a little longer than the hand is deep (0.22), so they show either side of it.

def sword(S):
    """Arming sword, ~1.45 long: square grip through the hand, block pommel, a proper crossguard and a long
    bright-edged blade."""
    h = S('sock_handR')
    grip(h, -0.15, 0.15, 0.12, R.leather)
    box(h, (0.14, 0.08, 0.14), (0, -0.19, 0), R.trim, bevel=0.025)                 # pommel block
    box(h, (0.09, 0.04, 0.09), (0, -0.245, 0), R.trim, bevel=0.012)
    crossguard(h, 0.19, 0.5)
    blade(h, 0.22, 0.98, 0.15, 0.2)


def longsword(S):
    """Longsword, ~1.85 long: long two-hand grip, heavier pommel, a wide crossguard and a long, broad blade."""
    h = S('sock_handR')
    grip(h, -0.21, 0.21, 0.12, R.leather, (-0.16, 0.16))
    box(h, (0.12, 0.06, 0.12), (0, -0.24, 0), R.trim, taper=(0.75, 0.75), bevel=0.015)
    box(h, (0.14, 0.1, 0.14), (0, -0.31, 0), R.trim, bevel=0.03)                   # pommel block
    crossguard(h, 0.25, 0.64, gem=0.045)
    box(h, (0.14, 0.1, 0.07), (0, 0.33, 0), R.metal, bevel=0.02)                   # ricasso
    blade(h, 0.3, 1.26, 0.18, 0.24, depth=0.06)


def pickaxe(S):
    h = S('sock_handR')
    box(h, (0.1, 1.05, 0.1), (0, 0.37, 0), WOOD, taper=(0.85, 0.85), bevel=0.02)  # haft
    box(h, (0.12, 0.26, 0.12), (0, -0.02, 0), R.leather, bevel=0.02)               # grip wrap
    box(h, (0.13, 0.06, 0.13), (0, -0.17, 0), R.dark, bevel=0.015)
    box(h, (0.16, 0.2, 0.16), (0, 0.84, 0), R.dark, bevel=0.03)                    # head collar
    prism(h, [(-0.54, 0.74), (-0.3, 0.87), (-0.08, 0.93), (0.08, 0.93), (0.3, 0.87), (0.54, 0.74),
              (0.3, 0.8), (0.08, 0.83), (-0.08, 0.83), (-0.3, 0.8)], 0.1, (0, 0, 0), R.metal, bevel=0.015)
    box(h, (0.2, 0.05, 0.13), (0, 0.95, 0), R.trim, bevel=0.015)
    for s in (-1, 1):
        rivet(h, (s * 0.12, 0.87, 0.055), R.trim, 0.022)
        box(h, (0.05, 0.12, 0.12), (s * 0.18, 0.86, 0), R.dark, rot=(0, 0, s * -0.2), bevel=0.01)  # binding


# Limb profile as (y, z) in the bow's frame: Y along the bow, Z from the grip toward the string (the limbs sweep that
# way to their tips). The frame is turned in the hand so the bow runs through the hole (the socket's +Y) with the
# string off to the hand's side (bow_frame), and the hand holds it BOW_MID below its middle, so the arrow, drawn through
# the middle of the string, passes just over the hand. The grip is centred on the hand (grip_stack), at most 0.12 across
# so it passes through the hand's hole; its bands and rings, wider than the hole, lie beyond the hand either side (the
# hand closes 0.11 either side of its hole), and the limbs run on from them (limbs_round_grip).
BOW_Z = 0.08
BOW_MID = 0.15


def grip_stack(b, parts):
    """The grip and its bands, stacked along the bow and centred on the hand's hole (the frame's y = -BOW_MID): each
    part (length, (width, depth), colour[, name]) a box touching the next end to end. The part named bow_grip is the
    one the hand holds, which the game's checks find (render/bowMeasure.ts: the hand on the grip, at its middle).
    Returns where the stack starts and ends along the bow, for the limbs to run on from (limbs_round_grip)."""
    y = lo = -BOW_MID - sum(p[0] for p in parts) / 2
    for length, (w, d), color, *name in parts:
        o = box(b, (w, length, d), (0, y + length / 2, BOW_Z), color, bevel=0.03)
        if name:
            o.name = name[0]
        y += length
    return lo, y


def bow_frame(S):
    """The bow's frame in the right hand: the bow upright through the hole, turned a quarter round in the hand so its
    string lies off to the hand's side (socket +X: inward, toward the body, when the forearm points forward). Carried
    upright, the string so runs in front of the body beside the forearm instead of back through it; the game turns the
    hand in the draw so the string faces the archer (anim.ts BOW_STRING)."""
    return pivot(S('sock_handR'), 'bowbody', (-BOW_Z, BOW_MID, 0), (0, PI / 2, 0))


def bow_string(b, tip):
    """The static string, tip to tip. BowDraw (render/bowDraw.ts) finds it by its long, thin shape and replaces it
    with a string that follows the draw hand."""
    y, z = tip
    box(b, (0.018, 2 * y, 0.018), (0, 0, BOW_Z + z), STRING, bevel=0)


def limb_tube(b, pts, w, t, color, w1, t1, smooth=True, seg=6, n=5, ends=False, knuckle=0.0):
    """A bow's limbs as one piece: a faceted tube through (y, z) points in the bow's YZ plane, run tip to tip, `w`
    wide (X) and `t` deep at the grip, tapering to w1 x t1 at the tips (ends=True: from the first point to the last,
    for a sheath over a tip). smooth=False keeps straight segments with sharp joints (bone), each joint swollen by
    `knuckle`."""
    return _tube(b, _limb_rings(pts, w, t, w1, t1, smooth, seg, n, ends, knuckle), color)


def limbs_round_grip(b, pts, w, t, color, w1, t1, lo, hi, **kw):
    """The limbs as limb_tube runs them tip to tip, cut away between y = lo and y = hi where the grip and its bands
    stack (grip_stack): each limb ends flat against the stack, touching it, nothing passing inside anything."""
    rings = _limb_rings(pts, w, t, w1, t1, **kw)
    ys = [sum(v.y for v in r) / len(r) for r in rings]

    def at(y):   # where the tube crosses y: the ring there, flattened onto it
        i = next(k for k in range(len(ys) - 1) if ys[k] <= y <= ys[k + 1])
        s = (y - ys[i]) / (ys[i + 1] - ys[i])
        return i, [Vector((a.x + (c.x - a.x) * s, y, a.z + (c.z - a.z) * s)) for a, c in zip(rings[i], rings[i + 1])]

    i, ring_lo = at(lo)
    j, ring_hi = at(hi)
    # A ring that reaches past the cut (where a short last step of the profile kinks the curve) is left out: the limb
    # runs straight on to the cut.
    below = [r for r in rings[:i + 1] if max(v.y for v in r) <= lo]
    above = [r for r in rings[j + 1:] if min(v.y for v in r) >= hi]
    return _tube(b, below + [ring_lo], color), _tube(b, [ring_hi] + above, color)


def _tube(b, rings, color):
    """A closed tube through `rings` (the same number of points round each), capped at both ends."""
    bm = bmesh.new()
    vs = [[bm.verts.new(v) for v in r] for r in rings]
    seg = len(rings[0])
    for r0, r1 in zip(vs, vs[1:]):
        for k in range(seg):
            bm.faces.new((r0[k], r0[(k + 1) % seg], r1[(k + 1) % seg], r1[k]))
    bm.faces.new(vs[0])
    bm.faces.new(list(reversed(vs[-1])))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _mesh_obj(bm, b, (0, 0, 0), (0, 0, 0), color)


def _limb_rings(pts, w, t, w1, t1, smooth=True, seg=6, n=5, ends=False, knuckle=0.0):
    """limb_tube's rings: `seg` points round the tube at each step along it."""
    if smooth:   # Catmull-Rom through the points
        ext = [pts[0]] + list(pts) + [pts[-1]]
        P = []
        for i in range(1, len(ext) - 2):
            p0, p1, p2, p3 = (Vector((0, *ext[k])) for k in range(i - 1, i + 3))
            for j in range(n):
                s = j / n
                P.append(0.5 * (2 * p1 + (p2 - p0) * s + (2 * p0 - 5 * p1 + 4 * p2 - p3) * s * s + (3 * p1 - p0 - 3 * p2 + p3) * s ** 3))
        P.append(Vector((0, *pts[-1])))
        joints = []
    else:        # straight segments, split so the knuckles can swell
        Q = [Vector((0, *q)) for q in pts]
        P = []
        for a, c in zip(Q, Q[1:]):
            P += [a + (c - a) * (j / 4) for j in range(4)]
        P.append(Q[-1])
        joints = [q for q in Q[1:-1] if abs(q.y) > 1e-6]   # the grip covers the middle
    L = [0.0]
    for a, c in zip(P, P[1:]):
        L.append(L[-1] + (c - a).length)
    rings = []
    for i, p in enumerate(P):
        T = (P[min(i + 1, len(P) - 1)] - P[max(i - 1, 0)]).normalized()
        N = Vector((0, -T.z, T.y))
        f = L[i] / L[-1] if ends else abs(2 * L[i] / L[-1] - 1)   # 0 at the grip (or start), 1 at the tips
        k = 1 + knuckle * max([0.0] + [1 - (p - j).length / 0.07 for j in joints])
        ww, tt = (w + (w1 - w) * f) * k, (t + (t1 - t) * f) * k
        rings.append([p + Vector((math.cos(a) * ww / 2, 0, 0)) + N * (math.sin(a) * tt / 2)
                      for a in (k_ * 2 * PI / seg + PI / seg for k_ in range(seg))])
    return rings

def limb_band(b, pts, k, w, h, d, color, s=1):
    """A band round the limb at point k of a half profile (s = -1: the lower limb), square to the limb."""
    (y0, z0), (y1, z1) = pts[max(k - 1, 0)], pts[min(k + 1, len(pts) - 1)]
    y, z = pts[k]
    box(b, (w, h, d), (0, s * y, z), color, rot=(s * math.atan2(z1 - z0, y1 - y0), 0, 0), bevel=0.01)


def bow_tip(b, pts, length, w, color, s=1, w1=0.008, straight=False):
    """A pointed cap carrying on from the limb's last point (straight: along the bow, so a limb that meets its string
    at a steep angle ends there instead of reaching on past the string toward the archer)."""
    (y0, z0), (y1, z1) = pts[-2], pts[-1]
    d = Vector((0, 1, 0)) if straight else Vector((0, y1 - y0, z1 - z0)).normalized()
    a = Vector((0, s * y1, z1))
    beam(b, tuple(a - Vector((0, s * d.y, d.z)) * 0.02), tuple(a + Vector((0, s * d.y, d.z)) * length), w, color, w1=w1, d1=w1)


# The bow runs straight through the hand: every profile keeps a straight riser RISER either side of the middle (the
# hand, held below the middle, needs it straight through its hole) and curves from there to the same tips.
RISER = 0.28


def half_pts(half, H):
    """A half profile, grip to tip, as (fraction of the half length, depth as a fraction of the full length) -> points
    in the bow's frame, straightened over the riser."""
    f0 = RISER / H
    (fa, da), (fb, db) = next((p, q) for p, q in zip(half, half[1:]) if p[0] <= f0 <= q[0])
    d0 = da + (db - da) * (f0 - fa) / (fb - fa)
    prof = [(0.0, 0.0), (f0, 0.0)] + [(f, d - d0 * (1 - f) / (1 - f0)) for f, d in half if f > f0 + 0.02]
    return [(f * H, BOW_Z + d * 2 * H) for f, d in prof]


def bow_shape(half, H):
    """The full limb line, tip to tip."""
    pts = half_pts(half, H)
    return [(-y, z) for y, z in reversed(pts[1:])] + pts


# One model per bow, built from its turnaround sheet (docs/concepts/bow-*.jpg, drawn from the approved icon); the item
# palette colours it (main = limbs, trim / dark = accents). Profiles: (fraction of the half length, depth as a
# fraction of the full length), grip to tip; the string runs between the tips, toward the archer.
HUNTER_WRAP = 0x3D7A46     # the Hunter's Bow's green grip wrap

WORN = [(0, 0), (0.13, 0.008), (0.34, 0.033), (0.58, 0.082), (0.76, 0.153), (0.906, 0.235), (0.98, 0.3)]


def bow_worn(S):
    """Worn Shortbow: a deep D of weathered grey wood, a tan rope wrap at the grip between dark turns, rope whipping
    and small dark caps at the tips."""
    b, H = bow_frame(S), 0.8
    turn = (0.014, (0.15, 0.15), R.dark)
    lo, hi = grip_stack(b, [turn, (0.272, (0.12, 0.12), R.trim, 'bow_grip'), turn])   # rope wrap and its last turns
    limbs_round_grip(b, bow_shape(WORN, H), 0.12, 0.12, R.metal, 0.06, 0.065, lo, hi)
    pts = half_pts(WORN, H)
    for s in (-1, 1):
        limb_band(b, pts, len(pts) - 2, 0.09, 0.06, 0.1, R.trim, s)                    # whipping
        bow_tip(b, pts, 0.09, 0.07, R.dark, s, w1=0.006)
    bow_string(b, (pts[-1][0], pts[-1][1] - BOW_Z))


HUNTER = [(0, 0), (0.135, 0), (0.38, 0.017), (0.61, 0.084), (0.79, 0.146), (0.89, 0.197)]


def bow_hunter(S):
    """Hunter's Bow: a tall, slender bow of orange wood swelling mid-limb, a green grip wrap between steel rings and
    pointed steel tips."""
    b, H = bow_frame(S), 0.85
    ring = (0.035, (0.15, 0.165), R.dark)
    lo, hi = grip_stack(b, [ring, (0.23, (0.12, 0.12), HUNTER_WRAP, 'bow_grip'), ring])  # green wrap, steel rings
    limbs_round_grip(b, bow_shape(HUNTER, H), 0.115, 0.12, R.metal, 0.045, 0.05, lo, hi)
    pts = half_pts(HUNTER, H)
    for s in (-1, 1):
        bow_tip(b, pts, 0.11, 0.06, R.dark, s, w1=0.004, straight=True)
    bow_string(b, (pts[-1][0], pts[-1][1] - BOW_Z))


# The Recurve and Drakebone profiles are traced from their icons: the limbs swing toward the string, which lies along
# them near the ends, and the tips curl away from it. `*_STRING` is the string's depth (fraction of the full length),
# `*_NOCK` where along the limb it meets them.
RECURVE = [(0, 0), (0.3, 0.003), (0.38, 0.008), (0.46, 0.023), (0.54, 0.041), (0.62, 0.056), (0.7, 0.066), (0.78, 0.059),
           (0.86, 0.038), (0.94, 0.011), (0.98, 0.004)]
RECURVE_STRING, RECURVE_NOCK = 0.092, 0.78


def bow_recurve(S):
    """Recurve Bow: red-brown limbs that swing toward the string and curl away at the tips, a dark ribbed grip between
    gold bands, and long gold sheaths over the curled tips coming to a point."""
    b, H = bow_frame(S), 0.84
    pts = half_pts(RECURVE, H)
    band, grip, rib = (0.05, (0.17, 0.18), R.trim), (0.03, (0.12, 0.12), R.dark), (0.012, (0.15, 0.148), 0x1A1210)
    lo, hi = grip_stack(b, [band, grip, rib, (0.226, (0.12, 0.12), R.dark, 'bow_grip'), rib, grip, band])  # ribbed grip
    limbs_round_grip(b, bow_shape(RECURVE[:9], H), 0.12, 0.115, R.metal, 0.08, 0.085, lo, hi)  # to the sheaths
    for s in (-1, 1):
        limb_tube(b, [(s * y, z) for y, z in pts[8:]], 0.1, 0.1, R.trim, 0.012, 0.012, n=3, ends=True)  # gold sheath
    bow_string(b, (RECURVE_NOCK * H, RECURVE_STRING * 2 * H))


DRAKE = [(0, 0), (0.22, 0.003), (0.56, 0.078), (0.74, 0.097), (0.9, 0.053)]
DRAKE_STRING, DRAKE_NOCK = 0.135, 0.76


def bow_drakebone(S):
    """Drakebone Bow: bone limbs in straight segments with knuckled joints, swinging toward the string and curling away
    at the tips, a dark grip between red bands, red bands mid-limb and red pointed tips."""
    b, H = bow_frame(S), 0.82
    pts = half_pts(DRAKE, H)
    band = (0.05, (0.18, 0.19), R.trim)
    lo, hi = grip_stack(b, [band, (0.23, (0.12, 0.12), R.dark, 'bow_grip'), band])    # dark grip, red bands
    limbs_round_grip(b, bow_shape(DRAKE, H), 0.12, 0.12, R.metal, 0.09, 0.08, lo, hi, smooth=False, seg=5, knuckle=0.22)
    for s in (-1, 1):
        limb_band(b, pts, 2, 0.18, 0.06, 0.17, R.trim, s)                               # red band mid-limb
        bow_tip(b, pts, 0.11, 0.1, R.trim, s, w1=0.004)                                  # red point
    bow_string(b, (DRAKE_NOCK * H, DRAKE_STRING * 2 * H))

# Staffs run along the hand's hole (socket +Y), their grip in the hand: the game holds a staff's forearm forward
# (anim.ts 'upright' hold), so the staff stands upright through the hole. Grip wraps are at most 0.125 across.


def staff_frame(S, grip=0.0):
    """The staff's frame in the right hand, its shaft along +Y with the point `grip` (staff-local y) in the hole."""
    return pivot(S('sock_handR'), 'staffbody', (0, -grip, 0))


def grip_wraps(b, ys, w=0.125):
    for y in ys:
        box(b, (w, 0.05, w), (0, y, 0), R.dark, bevel=0.012)


# One model per staff, each drawn from its approved icon (main = shaft, trim = bands and settings, glow = the stone).

def staff_apprentice(S):
    """Apprentice Staff: a straight wooden shaft with dark grip wraps, two blue bands and a blue crystal point."""
    b = staff_frame(S)
    box(b, (0.1, 1.9, 0.1), (0, 0.3, 0), R.metal, taper=(0.85, 0.85), bevel=0.02)
    grip_wraps(b, (-0.15, -0.05, 0.05, 0.15))
    for y in (0.62, 1.1):
        box(b, (0.125, 0.05, 0.125), (0, y, 0), R.trim, bevel=0.012)                    # blue bands
    box(b, (0.12, 0.08, 0.12), (0, -0.64, 0), R.trim, bevel=0.015)                      # butt cap
    box(b, (0.13, 0.06, 0.13), (0, 1.24, 0), R.trim, bevel=0.015)                       # crystal collar
    beam(b, (0, 1.26, 0), (0, 1.62, 0), 0.11, R.glow, w1=0.012, d=0.11, d1=0.012, bevel=0)   # crystal point
    beam(b, (0, 1.3, 0), (0, 1.22, 0), 0.11, R.glow, w1=0.05, d=0.11, d1=0.05, bevel=0)


OAK_SHAFT = [(0, -0.72), (0.02, -0.2), (-0.02, 0.3), (0.02, 0.8), (0, 1.2), (0.04, 1.4)]
OAK_CROOK = [(0.04, 1.4), (0.1, 1.55), (0.22, 1.6), (0.3, 1.5), (0.27, 1.39), (0.19, 1.37)]


def staff_oak(S):
    """Oak Staff: a gnarled oak shaft ending in a curled crook, green bands and a dark grip wrap."""
    b = staff_frame(S)
    for (x0, y0), (x1, y1) in zip(OAK_SHAFT, OAK_SHAFT[1:]):
        beam(b, (x0, y0 - 0.03, 0), (x1, y1, 0), 0.12, R.metal, w1=0.115, d=0.12, d1=0.115)   # gnarled shaft
    for (x0, y0), (x1, y1), w in zip(OAK_CROOK, OAK_CROOK[1:], (0.14, 0.135, 0.13, 0.12, 0.11)):
        beam(b, (x0, y0, 0), (x1, y1, 0), w, R.metal, w1=w - 0.01, d=w, d1=w - 0.01)              # crook
    grip_wraps(b, (-0.12, -0.02, 0.08, 0.18), w=0.125)
    for x, y in ((0.02, 0.72), (0.0, 1.16)):
        box(b, (0.14, 0.05, 0.14), (x, y, 0), R.trim, bevel=0.012)                      # green bands
    box(b, (0.13, 0.08, 0.13), (0, -0.74, 0), R.dark, bevel=0.02)                       # butt


RUNE_DIAMOND = [(0, 1.7), (0.14, 1.43), (0, 1.18), (-0.14, 1.43), (0, 1.7)]


def staff_runed(S):
    """Runed Staff: a slender dark shaft with purple bands, a pointed iron foot and a pointed diamond frame holding a
    purple stone."""
    b = staff_frame(S)
    box(b, (0.09, 1.86, 0.09), (0, 0.28, 0), R.metal, taper=(0.9, 0.9), bevel=0.018)
    grip_wraps(b, (-0.1, 0.0, 0.1), w=0.11)
    for y in (-0.46, 0.42, 0.86):
        box(b, (0.115, 0.045, 0.115), (0, y, 0), R.trim, bevel=0.01)                    # purple bands
    beam(b, (0, -0.62, 0), (0, -0.86, 0), 0.1, R.trim, w1=0.012)                        # pointed foot
    box(b, (0.12, 0.06, 0.12), (0, 1.16, 0), R.trim, bevel=0.012)                       # frame collar
    for (x0, y0), (x1, y1) in zip(RUNE_DIAMOND, RUNE_DIAMOND[1:]):
        beam(b, (x0, y0, 0), (x1, y1, 0), 0.045, R.dark, d=0.06, bevel=0.01)            # diamond frame
    facet_gem(b, 0.075, (0, 1.43, 0), R.glow, rot=corner_up(), depth=0.11)              # purple stone


def staff_ember(S):
    """Emberwood Staff: a dark shaft with orange bands and black grip wraps, an orange cup holding a flame crystal."""
    b = staff_frame(S)
    box(b, (0.1, 1.9, 0.1), (0, 0.3, 0), R.metal, taper=(0.85, 0.85), bevel=0.02)
    grip_wraps(b, (-0.15, -0.05, 0.05, 0.15))
    for y in (-0.46, 0.55, 0.98):
        box(b, (0.125, 0.05, 0.125), (0, y, 0), R.trim, bevel=0.012)                    # orange bands
    box(b, (0.12, 0.08, 0.12), (0, -0.64, 0), R.trim, bevel=0.015)                      # butt cap
    box(b, (0.15, 0.1, 0.15), (0, 1.22, 0), R.trim, taper=(1.3, 1.3), bevel=0.015)      # cup
    beam(b, (0, 1.26, 0), (0, 1.68, 0), 0.12, R.glow, w1=0.01, d=0.12, d1=0.01, bevel=0)   # flame crystal
    for s in (-1, 1):
        beam(b, (s * 0.05, 1.28, 0), (s * 0.1, 1.47, 0), 0.06, R.glow, w1=0.008, d=0.06, d1=0.008, bevel=0)  # side flames
