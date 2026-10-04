"""Hair (hair_1..4) and beards (beard_1..3) for the hero, each ONE moulded piece made as a LEGO hair piece is modelled
(hair_cage.py): a low-poly cage laid over the head, its locks parted by creased grooves, subdivided once and
shrinkwrapped onto the head, then finished by the bake (bake.py) like the hero, so the grooves are shaded into its map
under the painted hair texture.

Each file is one `sock_head` empty whose children are the piece (ROLE_hair; a tie, beads or a mouth may take faces of
the same mesh in their own colour), authored relative to the head centre (the hero's head is a 0.46 cube centred on
sock_head; face at +Z, ears at +-0.245 X).
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
import hair_cage
importlib.reload(hair_cage)
from hair_cage import (DOWN, Cage, Cap, Head, bald_spots, bearing, cap_cage, grow, head_normal, jaw, keyed, lock_creases,
                       mould, ramp, sheet_cage, shell, tube)
from mathutils import Vector

H = R.hair
UP = -DOWN


def facing(p, want, width=60.0):
    """1 where the point p faces the bearing `want` (degrees from the face), easing to 0 `width` degrees away."""
    d = abs((bearing(p) - want + 180) % 360 - 180)
    return max(0.0, 1 - d / width) ** 1.5


def covers(h, objs, line, margin=0.03):
    """Refuse a hairstyle (its parts `objs` under the head's socket `h`) that leaves the head showing anywhere more than
    `margin` above its hairline (`line`)."""
    lo = keyed(line)
    bad = bald_spots(h, objs, lambda p: p.y > lo(bearing(p)) + margin)
    if bad:
        raise ValueError(f'{objs[0].name} leaves {len(bad)} head points showing, e.g. {[tuple(round(x, 3) for x in p) for p in bad[:6]]}')


def crown_fit(p, lo=0.085, hi=0.215):
    """Hair at the height of the Ashen Crown's band (the one headgear worn over the hair: a thick band from y 0.09 to
    0.21, its walls from x +-0.2675 out to +-0.3275 and z 0.2725 / -0.2825 out to 0.3325 / -0.3425) is kept inside its
    outer faces, so with the crown on, the hair runs in under the band, pressed into it, and never shows through it.
    (Squeezing the hair inside the band's inner faces would leave a groove round every style worn without the crown.)"""
    w = ramp(p.y, ((lo - 0.04, 0.0), (lo, 1.0), (hi, 1.0), (hi + 0.04, 0.0)))
    if w == 0:
        return p
    q = Vector((max(-0.3, min(0.3, p.x)), p.y, max(-0.315, min(0.305, p.z))))
    return p.lerp(q, w)


# The hairline (bearing from the face in degrees, height): high over the forehead, down at the temples into a sideburn
# in front of the ear, up and over the ear, down behind it and low at the nape.
LINE = [(0, 0.155), (28, 0.145), (45, 0.1), (68, -0.03), (80, 0.065), (102, 0.065), (114, -0.03), (145, -0.1), (180, -0.13)]


def hair_1(h, head):
    """Short crop: fourteen chunky locks radiating from a whorl at the back of the crown, each ending in a short point
    round the hairline; the fringe a little longer, brushed to one side over the forehead."""
    cap = Cap(LINE, (0, 0.33, -0.1))
    n, rows = 28, (0.0, 0.12, 0.3, 0.52, 0.76)
    grooves = set(range(1, n, 2))

    def point(i, s, psi, d):
        base = shell(d, ramp(s, ((0, 0.02), (0.3, 0.048), (0.76, 0.072))))
        nrm = head_normal(base)
        ridge = i not in grooves
        p = base + nrm * ((0.012 if ridge else -0.022) * ramp(s, ((0.3, 1.0), (0.76, 0.4))))
        if s == 0:
            front = facing(base, 0)
            if ridge:      # the lock's tip, a little longer over the forehead and brushed to one side
                p += DOWN * (0.03 + 0.012 * front) + nrm * 0.014 + Vector((0.024 * front, 0, 0))
            else:          # the notch between two tips
                p += UP * 0.008
        return crown_fit(p)
    cage, vs = cap_cage(cap, head.surface, n, rows, point, shell(cap.dir(0, 0), 0.08))
    lock_creases(cage, vs, rows, grooves, ridge=0.3)
    covers(h, [mould(cage, h, H, head)], LINE)


# Swept back: a clear forehead with the hairline sitting on it, temple fill to the top of the ear, over the ear and down
# behind it to the nape. (Every hairline point has to be reachable from the pole along a flow line without crossing
# bare skin, so the swept style combs to a whorl at the back of the crown.)
LINE_COMB = [(0, 0.16), (14, 0.172), (30, 0.19), (45, 0.13), (62, 0.064), (78, 0.058), (104, 0.058), (118, -0.04),
             (145, -0.1), (180, -0.13)]


def hair_2(h, head):
    """Swept back: fourteen broad combed locks run from the brow back over the crown to a whorl behind it; over the
    forehead they rise in a wave that leans back (a slope up off the brow, the forehead clear below it), the sides lie
    flat to the head, and the edge meets the skin all round."""
    cap = Cap(LINE_COMB, (0, 0.3, -0.2))
    n, rows = 28, (0.0, 0.1, 0.24, 0.42, 0.62, 0.82)
    grooves = set(range(1, n, 2))

    def point(i, s, psi, d):
        base = shell(d, ramp(s, ((0, 0.01), (0.1, 0.024), (0.3, 0.042), (0.82, 0.055))))
        nrm = head_normal(base)
        front = max(0.0, 1 - abs(bearing(base)) / 80) ** 0.8          # the wave spans the brow
        wave = front * ramp(s, ((0, 0.0), (0.1, 0.45), (0.3, 1.0), (0.62, 0.55), (0.82, 0.2))) * 0.055
        lock = (0.011 if i not in grooves else -0.013) * ramp(s, ((0, 0.3), (0.1, 1.0), (0.62, 0.8), (0.82, 0.45)))
        # The wave leans back (more back than up), so from the front the hair reads combed back over the crown.
        return crown_fit(base + nrm * (lock + wave * 0.35) + Vector((0, wave * 0.75, -wave * 0.7)))
    cage, vs = cap_cage(cap, head.surface, n, rows, point, shell(cap.dir(0, 0), 0.062),
                        flush=lambda i, psi: True)                      # (combed down flat to the hairline)
    lock_creases(cage, vs, rows, grooves, groove=((0, 0.8), (0.2, 1.0), (0.5, 1.0), (0.8, 0.5)), ridge=0.2, pointed=False)
    covers(h, [mould(cage, h, H, head)], LINE_COMB)


# Long and tied: parted in the middle, the hair frames the face down to the temples, runs back over the ear and falls
# behind it, then round to the nape and the tie. (It ends above the collar line, -0.145, so no collar or gorget meets it.)
# Over the brows it stays above them (their outer ends reach 0.155 across the face, 0.125 up), and only beside them
# comes down. The tie is low, so the locks run level along the sides of the head to it: over the ear the hairline
# slopes a little down toward the back, or no lock could reach it (every hairline point has to be reachable along a
# lock from the tie).
LINE_LONG = [(0, 0.205), (7, 0.17), (22, 0.145), (33, 0.138), (45, 0.08), (60, 0.07), (106, 0.054), (120, -0.125),
             (138, -0.125), (165, -0.1), (180, -0.09)]
BAND = (0x5A3A22, 'leather')      # the leather tie
# The tie sits below the Ashen Crown's band (which rings the head from 0.09 to 0.21), so the crown never cuts it.
TIE = Vector((0, 0.0, -0.34))
# The leather band round the tie: its top and its foot (centre, radius).
BAND_RINGS = [((0, 0.0, -0.34), 0.075), ((0, -0.008, -0.382), 0.075)]
# The tail is a part of its own, hanging from a pivot at the band's foot (PONYTAIL), where the game swings it
# (src/render/ponytail.ts): its top is a ball centred on the pivot (TAIL_BALL its radius), sitting in the band's mouth
# however it turns. Then down the back to a point: (centre, radius).
PONYTAIL = 'ponytail'
TAIL_BALL = 0.068
TAIL = [((0, -0.04, -0.415), 0.085), ((0, -0.15, -0.44), 0.09), ((0, -0.26, -0.43), 0.072), ((0, -0.35, -0.4), 0.046)]
TAIL_TIP = (0, -0.44, -0.37)


def ponytail(h, head, cap, psis):
    """The tail on its pivot at the band's foot: a ball top inside the band's mouth, then the tail down the back, its
    locks running on from the cap's (the same columns round it)."""
    foot, top = Vector(BAND_RINGS[1][0]), Vector(BAND_RINGS[0][0])
    pv = pivot(h, PONYTAIL, tuple(foot))
    out = (foot - top).normalized()                                     # the band's axis, out of the head
    turn = cap.a.rotation_difference(out)
    f1, f2 = turn @ cap.e1, turn @ cap.e2
    cage = Cage()
    ring = lambda c, r: [cage.v(c + (f1 * math.cos(p) + f2 * math.sin(p)) * r) for p in psis]
    rel = lambda p: Vector(p) - foot                                     # (the part is built about its pivot)
    equator = ring(Vector(), TAIL_BALL)
    crown = ring(-out * TAIL_BALL * 0.7, TAIL_BALL * 0.71)               # the ball's top half, up inside the band
    cage.ring_faces(crown, equator)
    apex = cage.v(-out * TAIL_BALL)
    for i in range(len(psis)):
        cage.face((crown[(i + 1) % len(psis)], crown[i], apex))
    tube(cage, equator, cap.a, cap.e1, cap.e2, psis, [rel(c) for c, _ in TAIL], [r for _, r in TAIL],
         lobes=lambda i, k: 1.07 if i % 2 else 0.93, tip=rel(TAIL_TIP))
    return mould(cage, pv, H, head)


def hair_3(h, head):
    """Long and tied back: a clear centre parting, the hair framing the face down to the temples, running back over
    each ear and falling behind it in a full side mass; every lock runs back to a leather tie at the back of the head,
    and out of it hangs a thick tail down the back, a part of its own that swings at the tie (ponytail)."""
    cap = Cap(LINE_LONG, TIE, ref=(0, 1, 0))
    n, rows = 24, (0.0, 0.07, 0.17, 0.32, 0.5, 0.7, 0.86)
    grooves = set(range(0, n, 2))                                       # column 0, over the top, is the parting
    psis = cap.columns(n)
    # The locks run level along the sides to the low tie, so there they bunch together and reach the hairline far
    # apart: the hair's shape follows where a point is on the head (how far from the hairline and from the tie), never
    # how far along its lock, and a lock is never cut deeper than it is wide (or it would read as a thin cord).

    def width(i, s):
        """How far apart the locks either side of column i run where row s crosses it."""
        th = cap.edge(psis[i]) * (1 - s)
        at = lambda k: shell(cap.dir(psis[k % n], th), 0.0)
        return ((at(i - 1) - at(i)).length + (at(i + 1) - at(i)).length) / 2

    def point(i, s, psi, d):
        spot = shell(d, 0.0)
        into = cap.from_hairline(spot)                                   # how far into the hair
        tie = d.angle(cap.a) * 0.3                                       # how far from the tie
        base = shell(d, ramp(into, ((0, 0.012), (0.05, 0.036), (0.13, 0.05), (0.2, 0.06))))
        nrm = head_normal(base)
        front = facing(base, 0)
        k = min(i, n - i)                                                # columns from the parting
        part = (-0.03 if k == 0 else 0.012 if k == 1 else 0.0) * front * ramp(s, ((0.3, 1.0), (0.7, 0.0)))
        # The fall behind the ears: fullest low down, below the crown's band, easing into the skin at its edge.
        side = max(facing(base, 125), facing(base, -125)) * ramp(base.y, ((-0.03, 1.0), (0.09, 0.0))) * ramp(into, ((0, 0.3), (0.05, 1.0)))
        # The locks, smoothing out as the hair is drawn tight into the tie (so their grooves never meet round it).
        lock = (0.013 if i not in grooves else -0.013) * ramp(into, ((0, 0.4), (0.03, 1.0))) * ramp(tie, ((0.05, 0.0), (0.14, 0.9)))
        lock *= min(1.0, width(i, s) / 0.05)
        return crown_fit(base + nrm * (lock + part + 0.03 * side))
    # (Laid down flat to the hairline all round: the fall behind the ears swells from the skin, no edge standing off it.)
    cage, vs = cap_cage(cap, head.surface, n, rows, point, None, flush=lambda i, psi: True)
    lock_creases(cage, vs, rows, grooves, groove=((0, 0.8), (0.2, 1.0), (0.5, 1.0), (0.76, 0.0)), ridge=0.2, pointed=False,
                 scale=lambda i, s: min(1.0, width(i, s) / 0.05))
    # The hair gathered into the tie and the leather band round it, open at its foot, where the tail hangs from.
    rings = tube(cage, vs[-1], cap.a, cap.e1, cap.e2, psis, [c for c, _ in BAND_RINGS], [r for _, r in BAND_RINGS],
                 mats=[0, 1])
    for ring in rings[1:]:                                                # the band's crisp edges
        for i in range(n):
            cage.crease(ring[i], ring[(i + 1) % n], 1.0)
    covers(h, [mould(cage, h, H, head, extra=(BAND,)), ponytail(h, head, cap, psis)], LINE_LONG)


def hair_4(h, head):
    """Wild mane: one mass whose locks radiate from the crown, eight of them drawn out into big spikes sweeping up and
    back (two staggered rings of four), and the hairline breaking into long points all round."""
    cap = Cap(LINE, (0, 0.33, -0.04))
    # (The lower ring of spikes rises from above the Ashen Crown's band, so the crown never cuts through a spike.)
    n, rows = 24, (0.0, 0.15, 0.38, 0.64, 0.84)
    spikes = {}                                    # (column, row fraction) -> length: spikes drawn out of the cage itself
    for i in range(0, n, 6):
        spikes[(i, 0.64)] = 0.15 if i == 0 else 0.22
        spikes[(i + 3, 0.84)] = 0.2

    def point(i, s, psi, d):
        base = shell(d, ramp(s, ((0, 0.02), (0.35, 0.046), (0.8, 0.056))))
        nrm = head_normal(base)
        p = base + nrm * (0.012 if i % 2 == 0 else -0.008)
        ln = spikes.get((i, s))
        if ln:                                     # sweeping up and back
            p += (nrm + Vector((0, 0.8, -0.7))).normalized() * ln
        if s == 0 and i % 2 == 0:                  # long points round the hairline (shorter at the nape: the collar)
            drop = 0.07 - 0.03 * facing(base, 0) - 0.035 * facing(base, 180)
            p += DOWN * drop + nrm * 0.028
        return crown_fit(p) if not ln else p
    cage, vs = cap_cage(cap, head.surface, n, rows, point, shell(cap.dir(0, 0), 0.07))
    lock_creases(cage, vs, rows, set(range(1, n, 2)), groove=((0, 1.0), (0.4, 0.8), (0.8, 0.5)), ridge=0.25)
    for (i, s) in spikes:                          # each spike a sharp point with crisp edges
        v = vs[rows.index(s)][i]
        v[cage.vcrease] = 1.0
        for e in v.link_edges:
            e[cage.ecrease] = max(e[cage.ecrease], 0.6)
    covers(h, [mould(cage, h, H, head)], LINE)


# ─── Beards ──────────────────────────────────────────────────────────────────
# Each beard is one moulded patch over the jaw (beard_cage), its whole edge tucked into the skin. Whatever hangs below
# the chin hangs straight down in front of it (hair_cage.jaw), its back at least 4 mm in front of the face, so it rests
# in front of every collar and gorget (they wrap the head's lower edge, -0.145 down); at the sides, where the collars
# rise round the head, a beard ends above that. Nothing hangs below the chest's top line (-0.265), where armour begins.

MOUTH = (0x5A2E24, 'plain')       # the mouth, deep in a full beard
BEAD = (0xD9A640, 'gold')         # the braids' beads
BEARD_END = 74.0                  # the sideburns end here, in front of the ear (the open helm's cheek guards: from 80)
BEARINGS = (0, 6, 13, 21, 30, 40, 51, 62, 70)
COLLAR_TOP = -0.145               # collars and gorgets rise round the head to here
FRONT = 0.234                     # below it a beard keeps in front of this (the gorget's face is at 0.23)
HANG = 45.0                       # columns this far round from the face may hang below the collar line


def chin(b, y, depth):
    """A beard's point at bearing b, height y, `depth` out from the jaw (hair_cage.jaw); where it hangs below the
    collar line it is carried forward (easing in over the 2 cm above it) to stand in front of every collar, so the
    beard's lower part hangs as one block before the chin."""
    base, out = jaw(b, y, 0.0), jaw(b, y, 1.0) - jaw(b, y, 0.0)
    if abs(b) <= HANG:
        base.z += (max(base.z, FRONT) - base.z) * ramp(y, ((COLLAR_TOP, 1.0), (COLLAR_TOP + 0.02, 0.0)))
    return base + out * depth


def smooth(x, a, b):
    """0 below a, 1 above b, eased between."""
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def beard_cage(head, profile, skip=lambda r, c, cols: False, mat=lambda r, c, cols: 0):
    """A beard's cage over the jaw (hair_cage.sheet_cage): a column at each of BEARINGS from the face round to the
    sideburns, mirrored, and one tucked into the skin at each end (BEARD_END), whose faces close the sideburns; down
    each column the rows profile(b) gives, as (y, depth, tucked into the skin), at bearing b (the same number for every
    column, the first and last tucked): the top edge on the face, down the beard's front and round under its bottom
    edge back to the skin. `skip` and `mat` get (row, column, the columns' bearings). Returns (cage, vertices,
    bearings)."""
    cols = [-BEARD_END] + [-b for b in reversed(BEARINGS[1:])] + list(BEARINGS) + [BEARD_END]
    specs = [profile(abs(b)) for b in cols]
    ends = (0, len(cols) - 1)
    pts = [[jaw(b, specs[c][r][0]) if c in ends or specs[c][r][2] else chin(b, specs[c][r][0], specs[c][r][1])
            for c, b in enumerate(cols)] for r in range(len(specs[0]))]
    cage, vs = sheet_cage(head.surface, pts, lambda r, c: c in ends or specs[c][r][2],
                          lambda r, c: skip(r, c, cols), lambda r, c: mat(r, c, cols))
    return cage, vs, cols


def down_rows(ys, gap=0.004):
    """Heights kept falling row by row, at least `gap` apart."""
    out = [ys[0]]
    for y in ys[1:]:
        out.append(min(y, out[-1] - gap))
    return out


def beard_rows(b, top, bottom, middle, depths, centre_w):
    """A beard column's rows (see beard_cage): the top edge on the skin; seven rows down the front, blended from the
    centre's (`middle` heights and `depths`, by `centre_w`) to rows spaced evenly down the cheek at the column's own
    depth (depths' last); the bottom edge; the underside's back edge; and back up onto the skin: on the face just
    above the chin's lower edge where the beard hangs in front of the face, at the collar line where it hangs before
    the jaw's corner, else just above its bottom edge."""
    if b > HANG:                              # (where the collars rise round the head: kept above them)
        bottom = max(bottom, COLLAR_TOP + 0.012)
    side = [top - 0.01 - (top - 0.01 - bottom) * k / 7 for k in range(7)]
    ys = down_rows([top] + [centre_w * a + (1 - centre_w) * s for a, s in zip(middle, side)] + [bottom])
    d_side = [0.6 * depths[-1]] + [depths[-1]] * 6
    ds = [centre_w * a + (1 - centre_w) * s for a, s in zip(depths[:7], d_side)]
    rows = [(ys[0], 0.0, True)] + [(y, d, False) for y, d in zip(ys[1:8], ds)] + [(ys[8], depths[-1] * 0.92, False)]
    if bottom >= COLLAR_TOP:                  # ends on the jaw: a short wall in under its edge
        back = [(bottom - 0.004, 0.008, False), (bottom - 0.001, 0.004, False), (bottom + 0.004, 0.0, True)]
    elif b <= 36:                             # hangs in front of the face (which runs down to -0.17)
        back = [(bottom - 0.004, 0.006, False), ((bottom - 0.16) / 2, 0.004, False), (-0.16, 0.0, True)]
    else:                                     # hangs before the jaw's corner: its back stays in front of the collars
        back = [(bottom - 0.004, 0.006, False), (COLLAR_TOP - 0.003, 0.004, False), (COLLAR_TOP + 0.004, 0.0, True)]
    return rows + back


def lock_grooves(cage, vs, cols, rows, at, depth=0.012):
    """Chunky locks down a beard: the columns at bearings `at` creased into grooves over `rows` and pressed in."""
    for c, b in enumerate(cols):
        if abs(b) not in at:
            continue
        for r in rows:
            v = vs[r][c]
            v.co -= (jaw(b, v.co.y, 1.0) - jaw(b, v.co.y, 0.0)) * depth     # (the jaw's outward normal there)
        for r0, r1 in zip(rows, rows[1:]):
            cage.crease(vs[r0][c], vs[r1][c], 1.0)


def in_mouth(r, c, cols):
    """The faces of the mouth: between rows 4 and 5, across the middle."""
    return r == 4 and abs(cols[c]) <= 13 and abs(cols[c + 1]) <= 13


def beard_1(h, head):
    """Stubble: a thin moulded layer over the jaw and chin from sideburn to sideburn, a shadow of moustache over the
    lip and a shallow dark mouth set into it."""
    top = keyed([(0, -0.075), (14, -0.075), (26, -0.065), (38, -0.04), (52, -0.01), (64, 0.015), (74, 0.025)])
    bottom = keyed([(0, -0.166), (30, -0.166), (38, -0.152), (44, -0.148), (52, -0.133), (74, -0.12)])
    d = 0.013

    def profile(b):
        mouth = b <= 13
        return beard_rows(b, top(b), bottom(b), [-0.083, -0.096, -0.112, -0.118, -0.137, -0.143, -0.155],
                          [d * 0.7, d, d, 0.004 if mouth else d, 0.004 if mouth else d, d, d, d], 1 - smooth(b, 13, 24))
    cage, vs, cols = beard_cage(head, profile, mat=lambda r, c, cols: 1 if in_mouth(r, c, cols) else 0)
    mould(cage, h, H, head, extra=(MOUTH,), name='beard')


BEARD_TOP = keyed([(0, -0.068), (14, -0.068), (26, -0.058), (38, -0.03), (52, 0.005), (64, 0.025), (74, 0.035)])


def full_beard(head, bottom, depth, droop=0.026, skip=lambda r, c, cols: False):
    """A full beard's cage (beard_2, and beard_3 cut shorter): from sideburn to sideburn over the jaw, a moustache
    parted in the middle whose ends droop past the corners of a deep dark mouth, the beard below it thinner at the lip
    and full at the chin, down to `bottom` (keyed by bearing) at `depth`. Returns (cage, vertices, bearings)."""
    def profile(b):
        d, bot = depth(b), bottom(b)
        dr = droop * max(0.0, 1 - abs(b - 22) / 10)           # the moustache's ends, past the corners of the mouth
        mouth = b <= 13
        part = 0.012 if b == 0 else 0.0                       # the moustache's parting
        return beard_rows(b, BEARD_TOP(b), bot, [-0.08, -0.098, -0.13 - dr, -0.142 - dr, -0.165, -0.172, (-0.172 + bot) / 2],
                          [0.6 * d - part, 0.8 * d + 0.012 - part, 0.75 * d - part, 0.014 if mouth else 0.65 * d,
                           0.014 if mouth else 0.65 * d, 0.7 * d, 0.95 * d, d], 1 - smooth(b, 14, 32))
    cage, vs, cols = beard_cage(head, profile, skip=skip, mat=lambda r, c, cols: 1 if in_mouth(r, c, cols) else 0)
    mid = cols.index(0)
    for r in range(3):                                         # the parting, crisp
        cage.crease(vs[r][mid], vs[r + 1][mid], 1.0)
    for c in range(len(cols) - 1):                             # the moustache's lower edge and the beard's bottom, crisp
        for r in (3, 8):
            cage.crease(vs[r][c], vs[r][c + 1], 0.7)
    return cage, vs, cols


def beard_2(h, head):
    """Full beard: one broad mass over the jaw narrowing to a clean square-cut chin that hangs just below the head, in
    front of every collar; sideburns up to the ears, a parted moustache drooping past a deep dark mouth, and chunky
    locks down the beard."""
    cage, vs, cols = full_beard(
        head, keyed([(0, -0.262), (20, -0.262), (30, -0.245), (36, -0.19), (40, -0.152), (44, -0.148), (52, -0.133), (60, -0.128),
                      (74, -0.12)]),
        keyed([(0, 0.064), (24, 0.062), (36, 0.058), (50, 0.05), (62, 0.044), (74, 0.036)]))
    lock_grooves(cage, vs, cols, (6, 7, 8), (6, 21, 40, 62))
    mould(cage, h, H, head, extra=(MOUTH,), name='beard')


# A braid grown down out of the underside of the beard: per ring (down, forward, scale of the opening), plaits and
# pinches, a gold bead, then a short tuft to a point.
BRAID = [(-0.009, 0.004, 0.9), (-0.021, 0.008, 1.12), (-0.03, 0.011, 0.78), (-0.04, 0.014, 1.05), (-0.049, 0.017, 0.74),
         (-0.053, 0.018, 0.9), (-0.063, 0.02, 0.9), (-0.067, 0.021, 0.58), (-0.071, 0.022, 0.6)]
BRAID_MATS = [0, 0, 0, 0, 0, 2, 2, 2, 0]
BRAID_TIP = (-0.081, 0.024)


def beard_3(h, head):
    """Braided beard: a trimmed beard (the full beard's moustache, mouth and jaw, cut shorter) with a neat braid hanging
    from each corner of its chin: two plaits, a gold bead and a short tuft, grown out of the beard as one piece."""
    root = lambda r, c, cols: r == 8 and (cols[c], cols[c + 1]) in ((21, 30), (-30, -21))   # where the braids grow
    cage, vs, cols = full_beard(
        head, keyed([(0, -0.182), (20, -0.182), (30, -0.177), (36, -0.163), (40, -0.152), (44, -0.148), (52, -0.133), (74, -0.12)]),
        keyed([(0, 0.054), (24, 0.052), (36, 0.05), (50, 0.046), (62, 0.042), (74, 0.035)]), droop=0.02, skip=root)
    lock_grooves(cage, vs, cols, (6, 7, 8), (6, 40, 62))
    for c in range(len(cols) - 1):
        if root(8, c, cols):
            ring = [vs[8][c], vs[8][c + 1], vs[9][c + 1], vs[9][c]]
            c0 = sum((v.co for v in ring), Vector()) / 4
            rings = grow(cage, ring, [c0 + Vector((0, dy, dz)) for dy, dz, _ in BRAID], [s for _, _, s in BRAID],
                         BRAID_MATS, tip=c0 + Vector((0, *BRAID_TIP)))
            for k in (1, 3, 5, 6, 7, 8):                          # pinches between the plaits, and the bead's edges
                for i in range(4):
                    cage.crease(rings[k][i], rings[k][(i + 1) % 4], 1.0 if k >= 5 else 0.8)
    mould(cage, h, H, head, extra=(MOUTH, BEAD), name='beard')


BUILDERS = {'hair_1': hair_1, 'hair_2': hair_2, 'hair_3': hair_3, 'hair_4': hair_4,
            'beard_1': beard_1, 'beard_2': beard_2, 'beard_3': beard_3}


def build(name):
    scene, root = fresh_scene(f'DB_{name}')
    # Socket sits where the base hero's head centre is, so the file previews sensibly on its own.
    sock = pivot(root, 'sock_head', (0, 1.92, 0))
    head = Head(sock)
    BUILDERS[name](sock, head)
    head.remove()
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
