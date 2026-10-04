"""The Ember Cultist and the Cinder Priest, from their approved concept sheets (October 3): the cult's colours, hoods,
horns, staffs and robes. The cultist is built on the minifigure body every humanoid shares (minifig.py, owner,
October 4). minions.py exports them with the goblin and the kobold. Faces +Z; right-side parts at -X."""
import math

from _common import *
from _common import _mesh_obj
from minifig import HIP, figure, finish, ribbon, torso_surface

PI = math.pi


# ─── Ember Cultist and Cinder Priest ─────────────────────────────────────────
ROBE = 0x7A1E2E
ROBE_DK = 0x4C1220
HOOD_EDGE = 0xA83A4A     # lighter crimson lip round the face opening, so the hood reads in the dark
GOLD = 0xE2B04A
HORN = 0x2E2220
POUCH = 0x4A3226
SKIN = 0xE8C49A
STAFF = 0x3A2418
EMBER = 0xFF7A1A


def hood_fn(rows, e=3.0):
    """A hood as one surface over rows of (y, half width, half depth, z offset, half-angle of the front opening): u runs
    round from the left edge of the opening, round the back, to its right edge; v climbs the rows. Where the opening
    closes the two edges meet, so above it the hood is one closed shell. `e` squares off its section (2 is round)."""
    def fn(u, v):
        k = v * (len(rows) - 1)
        i = min(int(k), len(rows) - 2)
        f = k - i
        y, a, b, dz, op = [p + (q - p) * f for p, q in zip(rows[i], rows[i + 1])]
        al = math.radians(op)
        t = al + (2 * PI - 2 * al) * u
        return (a * ssin(t, e), y, dz + b * scos(t, e))
    return fn


# The priest's cowl (head space, y up from the neck): drawn up into a tall pointed hood.
PRIEST_HOOD = ((-0.2, 0.375, 0.36, -0.02, 9), (-0.05, 0.35, 0.33, -0.01, 18), (0.1, 0.31, 0.32, 0.02, 42),
               (0.26, 0.3, 0.32, 0.04, 40), (0.4, 0.28, 0.31, 0.06, 26), (0.52, 0.24, 0.28, 0.06, 0),
               (0.68, 0.17, 0.21, 0.04, 0), (0.86, 0.09, 0.12, 0.0, 0), (0.98, 0.0, 0.0, -0.03, 0))


def cowl(head, rows, arch_v):
    """The priest's hood: a rounded shell over its rows (hood_fn), a lighter lip along the face opening up to its arch
    (`arch_v` of the way up), a dark void inside with two glowing eyes set back."""
    inside, shadow = (0, 0.15, -0.02), 0.46
    fn = hood_fn(rows, 2.6)
    surf(head, fn, 12, 2 * len(rows) - 8, 0.035, ROBE_DK, inside=inside, bevel=0.01)
    for u0, u1 in ((0.0, 0.045), (0.955, 1.0)):
        surf(head, grow(sub(fn, u0, u1, 0.0, arch_v), 0.004, inside), 1, 7, 0.03, HOOD_EDGE, inside=inside)
    box(head, (0.4, shadow, 0.3), (0, shadow / 2 - 0.03, 0.03), 'black', taper=(0.7, 1), bevel=0.03)   # face shadow
    for s in (-1, 1):
        box(head, (0.07, 0.05, 0.02), (s * 0.07, 0.17, 0.185), EMBER, emissive=EMBER, strength=6, bevel=0)


def curved_horn(head, s, base, pts, w0, color=HORN):
    """A horn of tapering beams through `pts` (offsets from base, mirrored by s), from w0 thick at the root to a point."""
    prev = base
    n = len(pts)
    for i, (dx, dy, dz) in enumerate(pts):
        nxt = (base[0] + s * dx, base[1] + dy, base[2] + dz)
        wa = w0 * (1 - i / n) + 0.01
        wb = w0 * (1 - (i + 1) / n) + 0.01
        beam(head, prev, nxt, wa, color, w1=wb)
        prev = nxt


def gold_framed(p, size, pos, inner, rot=(0, 0, 0), rim=0.035, depth=0.03, bevel=0.012):
    """A gold-bordered panel: a gold slab with a coloured panel standing just proud inside its rim."""
    w, h, d = size
    box(p, (w, h, d), pos, GOLD, rot=rot, bevel=bevel)
    box(p, (w - 2 * rim, h - 2 * rim, d + depth * 0.4), pos, inner, rot=rot, bevel=bevel * 0.6)


def staff_shaft(w, length, bands, low=0.35):
    """A cult staff's shaft along +Y from `low` below the hand, gold bands at `bands`, and a dark wrap where the hand
    holds it, filling the hand's hole."""
    box(w, (0.09, length, 0.09), (0, length / 2 - low, 0), STAFF, taper=(0.85, 0.85), bevel=0.018)
    box(w, (0.12, 0.27, 0.12), (0, 0.015, 0), POUCH, bevel=0.02)                            # grip wrap
    for y in bands:
        box(w, (0.12, 0.05, 0.12), (0, y, 0), GOLD, bevel=0.012)


# The priest's LEGO hands (_common.clip_hand); his staff runs up through the right one, on a sock_handR empty in the
# hand with its own frame named 'staffbody', so the game knows to carry it upright (anim.ts Hold).
PRIEST_HAND = dict(outer=0.13, inner=(0.068, 0.082), depth=0.22, gap=0.065, gap_tilt=0.6, stub=(0.12, 0.08, 0.13))


def robe_arm(a, s, w, d, elb, wr, hand, color=ROBE):
    """A robe sleeve in two pieces about the elbow (both rounded about it, so it bends without a seam) down to the
    wrist, and a LEGO hand below. Returns (elbow, hand) pivots."""
    side = 'L' if s > 0 else 'R'
    joint_limb(a, w, d, 0.02, -elb, color, round_bottom=True, bevel=0.04)
    e = pivot(a, 'elbow' + side, (0, -elb, 0))
    joint_limb(e, w * 1.06, d * 1.06, 0.0, elb - wr, color, round_top=True, bevel=0.04)
    h = pivot(e, 'hand' + side, (0, elb - wr, 0))
    clip_hand(h, (0, -hand['outer'], 0), SKIN, s, **hand)
    return e, h


def tube(p, pts, radii, color, sides=6):
    """A horn, claw or tusk as one tapering piece along a curve through `pts`, `radii` thick there (the last one a
    point): rings carried along the curve without twisting, so it bends smoothly with no joints."""
    pts = [Vector(q) for q in pts]
    n = len(pts)
    tangents = [(pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]).normalized() for i in range(n)]
    ref = Vector((0, 0, 1)) if abs(tangents[0].z) < 0.9 else Vector((1, 0, 0))
    u = (ref - tangents[0] * ref.dot(tangents[0])).normalized()
    bm = bmesh.new()
    rings = []
    for i, (q, t) in enumerate(zip(pts, tangents)):
        u = (u - t * u.dot(t)).normalized()
        w = t.cross(u)
        if radii[i] < 1e-4:
            rings.append([bm.verts.new(q)])
            continue
        rings.append([bm.verts.new(q + (u * math.cos(k * 2 * PI / sides) + w * math.sin(k * 2 * PI / sides)) * radii[i])
                      for k in range(sides)])
    for a, b in zip(rings, rings[1:]):
        for k in range(sides):
            if len(b) == 1:
                bm.faces.new((a[k], a[(k + 1) % sides], b[0]))
            else:
                bm.faces.new((a[k], a[(k + 1) % sides], b[(k + 1) % sides], b[k]))
    bm.faces.new(list(reversed(rings[0])))
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    return _mesh_obj(bm, p, (0, 0, 0), (0, 0, 0), color)


def shell(p, fn, nu, nv, thick, color, inside, lining=None, bevel=0.008, walls=(0, 1)):
    """A cloth shell: its outer skin and edges in `color`; with `lining`, its inside lined in that colour (a thin
    closed skin, seen through the openings, a little coarser than the outside it lies under), else in `color`. `walls`
    as surf(): leave out the edge another shell carries on from, so the two join without a seam."""
    surf(p, fn, nu, nv, thick, color, inside=inside, bevel=bevel, inner=lining is None, walls=walls)
    if lining is not None:
        surf(p, grow(fn, -thick, inside), max(8, nu - 6), nv, 0.003, lining, inside=inside)


# ─── Ember Cultist ───────────────────────────────────────────────────────────
# On the minifigure body (minifig.py), a robe standing in for her legs, from her approved sheet (October 3): a tall hood
# rising well above her head, its peak tipping forward over a deep dark face opening where her eyes glow, dark horns
# out of its sides in gold collars; a mantle over her shoulders closing in a V on the chest, a gold amulet at its foot;
# gold-rimmed pauldrons with ember stones; a gold belt and buckle with pouches; the robe flaring to the ground in two
# gold-banded tiers, a gold-bordered stole down the front with an ember gem and another behind; sleeves with gold
# cuffs; a strap across her back; the cult staff through her right hand.
FACE = 0x120A0C          # the face in the hood's shadow, and the hood's lining round it
EYE_GLOW = 0xFFD65A
# The hood (head space, y up from the head's centre; the head is the hero's 0.46 cube): (y, half width, half depth,
# z offset, half-angle of the face opening), from the chin up. It rises well above the head, 0.44 over its top; its
# back climbs in one long curve to a peak at the very front, which tips forward past the face opening's rim, so the
# hood hangs over a deep, dark face. Its outline narrows to a point.
CULT_HOOD = ((-0.2, 0.365, 0.343, -0.017, 22), (-0.05, 0.395, 0.3435, 0.0085, 23), (0.1, 0.395, 0.336, 0.031, 23),
             (0.24, 0.38, 0.324, 0.059, 21), (0.36, 0.35, 0.3025, 0.1025, 17), (0.46, 0.3, 0.271, 0.151, 10),
             (0.54, 0.23, 0.235, 0.205, 0), (0.6, 0.155, 0.1875, 0.2575, 0), (0.645, 0.075, 0.12, 0.32, 0),
             (0.67, 0.0, 0.0, 0.41, 0))
HOOD_ARCH = 6            # the row where the face opening closes (its pointed top)
# Below the chin the hood spreads into a mantle over the shoulders: its hem low over the chest and back, high at the
# sides (above the arms), open in front in a V down to the chest.
MANTLE_HEM = (-0.54, 0.24, 0.4, 0.245)   # (front and back hem height, rise at the sides, half width, half depth)


def mantle_fn(chin, e_hem=5.0, e_chin=3.0):
    """The mantle from its hem up to the hood's chin row, which it shares (so the two are one cloth): nearly square in
    section at the hem, so it lies close on the torso, rounding to the hood's section at the chin. The V's edges run
    straight up from its foot to the face opening's."""
    y_c, a_c, b_c, dz_c, op_c = chin
    y0, rise, a_h, b_h = MANTLE_HEM
    x_c = a_c * ssin(math.radians(op_c), e_chin)

    def fn(u, v):
        e = e_hem + (e_chin - e_hem) * v
        a, b, dz = a_h + (a_c - a_h) * v, b_h + (b_c - b_h) * v, dz_c * v
        op = math.asin(min(1.0, (x_c * v / a) ** (e / 2)))
        t = op + (2 * PI - 2 * op) * u
        y_hem = y0 + rise * abs(math.sin(t))
        return (a * ssin(t, e), y_hem + (y_c - y_hem) * v, dz + b * scos(t, e))
    return fn


def cult_hood(sock):
    """The hood and its mantle as one cloth on the head, a lighter lip all down the opening, the horns."""
    inside = (0, 0.0, 0)
    hood, mantle = hood_fn(CULT_HOOD), mantle_fn(CULT_HOOD[0])
    nv = len(CULT_HOOD) - 1
    shell(sock, hood, 14, nv, 0.035, ROBE, inside, lining=FACE, walls=(1,))
    shell(sock, mantle, 14, 4, 0.035, ROBE, (0, -0.4, 0), walls=(0,))
    for u0, u1 in ((0.0, 0.04), (0.96, 1.0)):
        surf(sock, grow(sub(hood, u0, u1, 0.0, HOOD_ARCH / nv), 0.004, inside), 1, HOOD_ARCH, 0.03, HOOD_EDGE, inside=inside)
        surf(sock, grow(sub(mantle, u0, u1, 0.0, 1.0), 0.004, (0, -0.4, 0)), 1, 4, 0.03, HOOD_EDGE, inside=(0, -0.4, 0))
    box(sock, (0.12, 0.12, 0.03), (0, MANTLE_HEM[0] + 0.01, MANTLE_HEM[3] + 0.012), GOLD, rot=(0, 0, PI / 4), bevel=0.012)
    for s in (-1, 1):   # dark horns out of the hood's sides, curling up, gold collars round their roots
        curve = ((0.3, 0.3, 0.02), (0.4, 0.33, 0.02), (0.46, 0.4, 0.0), (0.485, 0.5, -0.02), (0.47, 0.6, -0.04),
                 (0.43, 0.68, -0.06))
        tube(sock, [(s * x, y, z) for x, y, z in curve], (0.065, 0.06, 0.05, 0.038, 0.022, 0.0), HORN)
        box(sock, (0.11, 0.15, 0.16), (s * 0.35, 0.31, 0.02), GOLD, rot=(0, 0, -s * 0.3), bevel=0.025)


def robe_front(y, side=1):
    """The robe's surface down its front (side 1) or back middle, sock_skirt space: (z, outward normal) at height y."""
    if y > -0.3975:     # the upper tier, flaring out from under the belt
        k = (y + 0.44) / 0.46
        return side * (0.33 + (0.221 - 0.33) * k), Vector((0, 0.231, 0.973 * side))
    if y > -0.4425:     # the gold band at its hem
        return side * 0.37, Vector((0, 0, side))
    k = (y + 0.85) / 0.4  # the lower tier
    return side * (0.4 + (0.36 - 0.4) * k), Vector((0, 0.0995, 0.995 * side))


def stole(skirt, side, bottom, gem):
    """A gold-bordered crimson stole hanging from the belt down the robe's front (side 1) or back, lying on it over the
    band, pointed at the foot."""
    pts, ns = [], []
    for y in (0.03, -0.39, -0.4, -0.44, -0.45, bottom):   # down the upper tier, over the band, down the lower tier
        z, n = robe_front(y, side)
        pts.append(Vector((0, y, z)))
        ns.append(n)
    ribbon(skirt, pts, ns, 0.25, 0.016, GOLD)
    ribbon(skirt, pts[1:], ns[1:], 0.17, 0.024, ROBE_DK)
    z, n = robe_front(bottom - 0.05, side)
    tilt = math.atan2(n.y, abs(n.z))
    for w, t, color in ((0.25, 0.016, GOLD), (0.17, 0.024, ROBE_DK)):
        prism(skirt, [(-w / 2, 0.0), (w / 2, 0.0), (0.0, -w * 0.45)], t, (0, bottom + 0.004, z + side * t / 2), color,
              rot=(-tilt, 0 if side > 0 else PI, 0))
    if gem:
        z, _ = robe_front(bottom + 0.08, side)
        facet_gem(skirt, 0.045, (0, bottom + 0.08, z + side * 0.035), EMBER, emissive=EMBER, strength=4)


def cultist():
    fig = figure('DB_cultist', dict(torso=ROBE, belt=GOLD, neck=ROBE_DK, head=FACE, upper=ROBE, forearm=ROBE, hand=SKIN),
                 legs='robe')
    # The face: dark in the hood's shadow, two eyes glowing.
    for s in (-1, 1):
        box(fig['head'], (0.075, 0.065, 0.02), (s * 0.09, 0.25, 0.235), EYE_GLOW, emissive=EYE_GLOW, strength=5, bevel=0)
    # The hood and its mantle (headgear: they turn with the head), the amulet at the foot of the mantle's V.
    cult_hood(fig['sock_head'])
    # Pauldrons: a crimson block framed in gold over each shoulder (they follow the arms by 3/4), a gold-rimmed plate
    # with an ember stone down the outside of each upper arm.
    for S, s in (('L', 1), ('R', -1)):
        pad = pivot(fig['sock_shoulder' + S], 'pad', (s * 0.08, 0.0, 0), (0, 0, -s * 0.26))
        box(pad, (0.42, 0.12, 0.48), (0, -0.02, 0), GOLD, bevel=0.03)
        box(pad, (0.34, 0.1, 0.4), (0, 0.035, 0), ROBE, bevel=0.025)
        arm = fig['arm' + S]
        box(arm, (0.06, 0.24, 0.4), (s * 0.158, -0.08, 0), GOLD, rot=(0, 0, -s * 0.1), bevel=0.02)
        box(arm, (0.065, 0.17, 0.32), (s * 0.159, -0.08, 0), ROBE, rot=(0, 0, -s * 0.1), bevel=0)
        box(arm, (0.06, 0.08, 0.08), (s * 0.19, -0.075, 0), EMBER, emissive=EMBER, strength=3, rot=(0, 0, -s * 0.1), bevel=0.012)
        # Sleeves widening to the wrist under a gold cuff.
        c = fig['sock_cuff' + S]
        box(c, (0.235, 0.14, 0.26), (0, 0.225, 0), ROBE, bevel=0.02)
        box(c, (0.25, 0.05, 0.275), (0, 0.17, 0), GOLD, bevel=0)
    # The belt's buckle and the pouches on both hips.
    belt = fig['sock_belt']
    box(belt, (0.16, 0.15, 0.03), (0, 0, 0.24), GOLD, bevel=0.012)
    box(belt, (0.08, 0.07, 0.034), (0, 0, 0.243), ROBE_DK, bevel=0)
    for s in (-1, 1):
        box(belt, (0.15, 0.17, 0.12), (s * 0.27, -0.07, 0.285), POUCH, bevel=0.03)
        box(belt, (0.16, 0.06, 0.13), (s * 0.27, 0.0, 0.288), POUCH, rot=(0.15, 0, 0), bevel=0.012)
        box(belt, (0.04, 0.04, 0.02), (s * 0.27, -0.04, 0.35), GOLD, bevel=0)
    # A strap across the back, from under the mantle at the left shoulder down to the belt at the right hip, buckled.
    body = fig.body
    y0 = HIP
    pts, ns = [], []
    for k in range(6):
        f = k / 5
        p, n = torso_surface(y0 + 0.6 + (0.06 - 0.6) * f, 0.2 + (-0.22 - 0.2) * f, -1, y0=y0)
        pts.append(p)
        ns.append(n)
    ribbon(body, pts, ns, 0.07, 0.025, POUCH)
    p, _ = torso_surface(y0 + 0.33, 0.2 + (-0.22 - 0.2) * 0.5, -1, lift=0.03, y0=y0)
    turn = -math.atan2(0.42, 0.54)
    box(body, (0.1, 0.1, 0.02), tuple(p), GOLD, rot=(0, 0, turn), bevel=0.01)
    box(body, (0.045, 0.045, 0.024), tuple(p), POUCH, rot=(0, 0, turn), bevel=0)
    # The robe: two tiers flaring to the ground, a gold band at each hem, a dark step underfoot; the stoles on it.
    skirt = fig['sock_skirt']
    box(skirt, (0.9, 0.46, 0.66), (0, -0.21, 0), ROBE, taper=(0.78, 0.67), bevel=0.04)
    box(skirt, (0.96, 0.045, 0.74), (0, -0.42, 0), GOLD, bevel=0.012)
    box(skirt, (1.0, 0.4, 0.8), (0, -0.65, 0), ROBE, taper=(0.94, 0.9), bevel=0.04)
    box(skirt, (1.025, 0.03, 0.825), (0, -0.835, 0), GOLD, bevel=0.008)
    box(skirt, (1.04, 0.05, 0.84), (0, -0.875, 0), ROBE_DK, bevel=0.015)
    stole(skirt, 1, -0.74, True)
    stole(skirt, -1, -0.66, False)
    # The staff runs through the right hand's hole, its butt by the ground and its gem above the hood; the game carries
    # it upright with the forearm level, and keeps it upright in the raised hand in the cast (anim.ts Hold).
    w = pivot(fig['sock_handR'], 'staffbody')
    staff_shaft(w, 2.25, (1.08,), low=1.1)
    beam(w, (0, -1.08, 0), (0, -1.17, 0), 0.1, 'black', w1=0.02)                       # butt cap
    box(w, (0.16, 0.08, 0.16), (0, 1.15, 0), GOLD, bevel=0.015)                         # socket
    for k in (-1, 1):   # two iron prongs curling up and in round the gem
        box(w, (0.05, 0.22, 0.06), (k * 0.11, 1.28, 0), HORN, rot=(0, 0, -k * 0.45), bevel=0.012)
        box(w, (0.045, 0.2, 0.055), (k * 0.12, 1.46, 0), HORN, rot=(0, 0, k * 0.55), bevel=0.012)
    facet_gem(w, 0.12, (0, 1.36, 0), 0xFFD86A, emissive=0xFFC040, strength=2.2, rot=corner_up(), depth=0.17)
    finish(fig)
    return fig.scene


def priest():
    """Cinder Priest: the cult's leader, a head taller than his cultists: a tall pointed hood with a gold crown band and
    great dark horns, a gold collar with an ember gem, stepped gold-rimmed pauldrons, long sleeves, a floor-length robe
    in gold-banded tiers with a broad gold stole, and a tall staff carrying a flame crystal in two dark prongs."""
    scene, root = fresh_scene('DB_priest')
    body = pivot(root, 'body', (0, 0, 0))
    box(body, (1.18, 0.07, 0.96), (0, 0.035, 0), ROBE_DK, bevel=0.02)
    box(body, (1.16, 0.03, 0.94), (0, 0.085, 0), GOLD, bevel=0.008)
    box(body, (1.14, 0.5, 0.92), (0, 0.34, 0), ROBE, taper=(0.88, 0.88), bevel=0.05)
    box(body, (1.02, 0.06, 0.82), (0, 0.6, 0), ROBE_DK, bevel=0.015)
    box(body, (1.02, 0.03, 0.825), (0, 0.645, 0), GOLD, bevel=0.008)
    box(body, (0.96, 0.46, 0.76), (0, 0.88, 0), ROBE, taper=(0.88, 0.88), bevel=0.05)
    box(body, (0.86, 0.05, 0.68), (0, 1.12, 0), GOLD, bevel=0.012)
    box(body, (0.76, 0.14, 0.66), (0, 1.2, 0), 0x3A2418, bevel=0.03)                         # belt
    box(body, (0.74, 0.42, 0.62), (0, 1.47, 0), ROBE, bevel=0.05)
    box(body, (0.74, 0.36, 0.62), (0, 1.84, 0), ROBE, taper=(0.92, 0.92), bevel=0.05)
    # The broad gold stole from the collar to the hem, pointed at the end, an ember gem at the chest; behind, a
    # gold-bordered back panel.
    st = pivot(body, 'stole', (0, 1.98, 0.32), (-0.03, 0, 0))
    box(st, (0.2, 0.86, 0.05), (0, -0.43, 0), GOLD, bevel=0.012)
    lo = pivot(body, 'stole', (0, 1.13, 0.345), (-0.14, 0, 0))
    box(lo, (0.22, 0.98, 0.05), (0, -0.49, 0), GOLD, bevel=0.012)
    prism(lo, [(-0.11, 0.0), (0.0, -0.1), (0.11, 0.0)], 0.05, (0, -0.98, 0), GOLD)
    box(st, (0.11, 0.11, 0.04), (0, -0.2, 0.035), GOLD, rot=(0, 0, PI / 4), bevel=0.012)
    facet_gem(st, 0.06, (0, -0.2, 0.055), EMBER, emissive=EMBER, strength=5)
    bk = pivot(body, 'stole', (0, 1.12, -0.345), (0.14, PI, 0))
    gold_framed(bk, (0.3, 1.0, 0.05), (0, -0.5, 0), ROBE_DK)
    # Harness straps from the shoulders to the belt behind, gold buckles where they meet it.
    for s in (-1, 1):
        box(body, (0.08, 0.72, 0.03), (s * 0.2, 1.62, -0.322), 0x3A2418, bevel=0.008)
        box(body, (0.1, 0.07, 0.03), (s * 0.2, 1.28, -0.34), GOLD, bevel=0.01)
        box(body, (0.08, 0.06, 0.66), (s * 0.2, 2.0, 0), 0x3A2418, bevel=0.008)               # over the shoulder
    for s in (-1, 1):
        box(body, (0.17, 0.19, 0.13), (s * 0.3, 1.11, 0.33), POUCH, bevel=0.03)
        box(body, (0.18, 0.07, 0.14), (s * 0.3, 1.19, 0.335), POUCH, rot=(0.15, 0, 0), bevel=0.012)
        box(body, (0.045, 0.045, 0.02), (s * 0.3, 1.15, 0.405), GOLD, bevel=0.006)
    head = pivot(body, 'head', (0, 2.0, 0))
    cowl(head, PRIEST_HOOD, 4 / 8)
    # Gold collar round the mantle with an ember gem; the crown band across the brow with a gold diamond, a gold band
    # up the hood's front to its peak, and great dark horns sweeping out and up from the band.
    box(head, (0.5, 0.08, 0.1), (0, -0.04, 0.33), GOLD, bevel=0.02)
    box(head, (0.12, 0.12, 0.04), (0, -0.04, 0.39), GOLD, rot=(0, 0, PI / 4), bevel=0.012)
    facet_gem(head, 0.05, (0, -0.04, 0.41), EMBER, emissive=EMBER, strength=5)
    box(head, (0.62, 0.09, 0.07), (0, 0.48, 0.3), GOLD, bevel=0.02)
    for s in (-1, 1):
        box(head, (0.07, 0.09, 0.4), (s * 0.3, 0.48, 0.1), GOLD, rot=(0, -s * 0.08, 0), bevel=0.02)
    box(head, (0.16, 0.16, 0.05), (0, 0.5, 0.345), GOLD, rot=(0, 0, PI / 4), bevel=0.02)
    beam(head, (0, 0.55, 0.32), (0, 0.73, 0.18), 0.09, GOLD, d=0.04, bevel=0.01)
    beam(head, (0, 0.73, 0.18), (0, 0.93, 0.03), 0.08, GOLD, w1=0.05, d=0.04, bevel=0.01)
    for s in (-1, 1):
        box(head, (0.11, 0.12, 0.14), (s * 0.31, 0.5, 0.05), GOLD, bevel=0.02)
        curved_horn(head, s, (s * 0.33, 0.52, 0.04), ((0.12, 0.08, -0.02), (0.2, 0.24, -0.05), (0.18, 0.42, -0.07),
                                                       (0.12, 0.54, -0.07)), 0.12)
    # Long sleeves hanging against the robe's sides (and swinging past them), bending at the elbow. Authored straight;
    # the game bends the elbows and carries the staff upright (anim.ts).
    elb, wr = 0.36, 0.7
    for name, x in (('armL', 0.52), ('armR', -0.52)):
        s = 1 if x > 0 else -1
        a = pivot(body, name, (x, 1.9, 0))
        e, h = robe_arm(a, s, 0.28, 0.31, elb, wr, PRIEST_HAND)
        box(e, (0.35, 0.07, 0.36), (0, elb - 0.62, 0), GOLD, bevel=0.015)                      # cuff bands
        box(e, (0.35, 0.07, 0.36), (0, elb - 0.49, 0), GOLD, bevel=0.015)
        box(e, (0.33, 0.06, 0.34), (0, elb - 0.555, 0), ROBE, bevel=0.015)
        # Stepped pauldron: a gold-rimmed crimson block over a second step down the arm.
        box(a, (0.42, 0.17, 0.46), (s * 0.05, 0.04, 0), GOLD, rot=(0, 0, -s * 0.26), bevel=0.03)
        box(a, (0.38, 0.19, 0.42), (s * 0.05, 0.055, 0), ROBE, rot=(0, 0, -s * 0.26), bevel=0.03)
        box(a, (0.32, 0.12, 0.44), (s * 0.1, -0.1, 0), GOLD, rot=(0, 0, -s * 0.2), bevel=0.025)
        box(a, (0.28, 0.13, 0.4), (s * 0.1, -0.09, 0), ROBE, rot=(0, 0, -s * 0.2), bevel=0.025)
        if s < 0:
            # As the cultist's: the staff upright through the hand (carried upright by the game, raised in the cast),
            # its gold foot carried just off the ground, clear of the robe when the staff is raised; its head sits as
            # high as it always did.
            w = pivot(pivot(h, 'sock_handR', (0, -PRIEST_HAND['outer'], 0), (PI / 2, 0, 0)), 'staffbody')
            top = -0.37                     # the staff's head, lowered so it stands no taller now the hand holds it higher
            staff_shaft(w, 2.78, (-0.23, 1.55 + top, 1.7 + top), low=1.25)
            box(w, (0.13, 0.16, 0.13), (0, -1.27, 0), GOLD, bevel=0.02)                         # gold foot
            box(w, (0.17, 0.1, 0.17), (0, 1.84 + top, 0), GOLD, bevel=0.02)                     # socket
            box(w, (0.11, 0.06, 0.11), (0, 1.91 + top, 0), GOLD, bevel=0.012)
            for k in (-1, 1):   # two dark prongs curving out and back in round the crystal
                box(w, (0.06, 0.22, 0.07), (k * 0.13, 1.98 + top, 0), HORN, rot=(0, 0, -k * 0.55), bevel=0.014)
                box(w, (0.055, 0.22, 0.065), (k * 0.19, 2.17 + top, 0), HORN, rot=(0, 0, k * 0.15), bevel=0.014)
                box(w, (0.05, 0.14, 0.06), (k * 0.14, 2.32 + top, 0), HORN, rot=(0, 0, k * 0.75), bevel=0.012)
            # The flame crystal: a tall faceted diamond flaring from the socket and drawn up into a flame's tip.
            beam(w, (0, 1.93 + top, 0), (0, 2.08 + top, 0), 0.06, EMBER, w1=0.19, d=0.06, d1=0.19, emissive=EMBER, strength=2.5)
            beam(w, (0, 2.08 + top, 0), (0, 2.42 + top, 0), 0.19, 0xFF9A2A, w1=0.012, d=0.19, d1=0.012, emissive=0xFF8A20, strength=2.5)
    return scene
