"""Gear for the hero base: weapons, helms, body armour, gloves, boots, and the hand-built uniques.

Each file holds socket-named empties (sock_handR, sock_head, sock_chest, sock_shoulderL/R, sock_handL,
sock_gloveR, sock_footL/R). The game moves each socket's children under the hero socket of the same
name with their local transform unchanged, so everything below is authored in socket-local space:

  sock_handR      palm centre, rotated +90 X: local +Y points forward, local +Z points down (arm hanging)
  sock_head       head centre (head = 0.46 cube)
  sock_chest      torso centre; tunic is 0.68 x 0.66 x 0.42 (flared to 1.08 x at the top), belt at y -0.37
  sock_shoulderX  top of the shoulder, sleeve below it
  sock_handL / sock_gloveR   palm centre, unrotated; the fist is a 0.25 x 0.25 x 0.26 block, thumb across its front (+Z)
  sock_footL/R    ankle; shoe below (0.3 x 0.17 x 0.4, toe at +Z), ground at y -0.18

Everything is modular blocks (docs/ART_CONTRACT.md, Style): chamfered boxes, stacked slabs, wedges.
Tier gear uses ROLE_metal / ROLE_trim / ROLE_dark (+ ROLE_leather, ROLE_glow) so one file serves every
palette. Uniques (u_*) use their own authored colours. Right side is -X.
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
from mathutils import Vector

PI = math.pi
WOOD = 0x6B4426
STRING = 0xE8DDC4
SLIT = 0x0C0A0A

# Where each socket sits on the base hero (world, three.js coords) -- only used so a gear file
# previews in a sensible place; the game discards the socket's own transform.
SOCKET_POS = {
    'sock_handR': (-0.47, 0.86, 0.04), 'sock_gloveR': (-0.47, 0.89, 0), 'sock_handL': (0.47, 0.89, 0),
    'sock_head': (0, 1.92, 0), 'sock_chest': (0, 1.34, 0),
    'sock_shoulderL': (0.46, 1.62, 0), 'sock_shoulderR': (-0.46, 1.62, 0),
    'sock_footL': (0.19, 0.18, 0), 'sock_footR': (-0.19, 0.18, 0),
}


def rivet(p, pos, color=R.trim, r=0.024, rot=(0, 0, PI / 4)):
    """Square rivet head (a small chamfered block, turned 45 degrees by default)."""
    return box(p, (r * 1.5, r * 1.5, r * 1.2), pos, color, rot=rot, bevel=r * 0.35)


def limb_chain(p, pts, w, t, color, x=0.0):
    """Boxes following a polyline of (y, z) points in the YZ plane (bow limbs)."""
    for (y0, z0), (y1, z1) in zip(pts, pts[1:]):
        ln = math.hypot(y1 - y0, z1 - z0)
        ang = math.atan2(z1 - z0, y1 - y0)
        box(p, (w, ln + t * 0.6, t), (x, (y0 + y1) / 2, (z0 + z1) / 2), color, rot=(ang, 0, 0), bevel=min(0.02, t * 0.3))
        w *= 0.88


def grip(p, y0, y1, w, color, wraps=(), wrap_color=R.dark):
    """Square grip from y0 to y1 along local Y with raised wrap bands at `wraps`."""
    box(p, (w, y1 - y0, w), (0, (y0 + y1) / 2, 0), color, bevel=w * 0.2)
    for y in wraps:
        box(p, (w * 1.2, 0.03, w * 1.2), (0, y, 0), wrap_color, bevel=0.006)


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


def sword(S):
    """Arming sword, ~1.45 long: square grip, block pommel, a proper crossguard and a long bright-edged blade."""
    h = S('sock_handR')
    grip(h, -0.15, 0.15, 0.085, R.leather, (-0.08, 0.06))
    box(h, (0.12, 0.08, 0.12), (0, -0.19, 0), R.trim, bevel=0.025)                 # pommel block
    box(h, (0.08, 0.04, 0.08), (0, -0.245, 0), R.trim, bevel=0.012)
    crossguard(h, 0.19, 0.5)
    blade(h, 0.22, 0.98, 0.15, 0.2)


def longsword(S):
    """Longsword, ~1.85 long: long two-hand grip, heavier pommel, a wide crossguard and a long, broad blade."""
    h = S('sock_handR')
    grip(h, -0.21, 0.21, 0.09, R.leather, (-0.12, 0.0, 0.12))
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


# Limb profile as (y, z) in the bow's frame (= arm frame: Y up, Z forward). The grip sits at the front
# of the fist and the limbs sweep forward, so the bow hangs clear of the forearm and the leg.
BOW_Z = 0.08
BOW_LIMB = [(0.1, 0.0), (0.26, 0.05), (0.42, 0.12), (0.56, 0.18), (0.66, 0.19), (0.74, 0.14)]


def bow_frame(S):
    """The bow's frame in the right hand, counter-rotated so the bow stands vertical in the fist."""
    return pivot(S('sock_handR'), 'bowbody', (0, 0, 0), (-PI / 2, 0, 0))


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
    bm = bmesh.new()
    rings = []
    for i, p in enumerate(P):
        T = (P[min(i + 1, len(P) - 1)] - P[max(i - 1, 0)]).normalized()
        N = Vector((0, -T.z, T.y))
        f = L[i] / L[-1] if ends else abs(2 * L[i] / L[-1] - 1)   # 0 at the grip (or start), 1 at the tips
        k = 1 + knuckle * max([0.0] + [1 - (p - j).length / 0.07 for j in joints])
        ww, tt = (w + (w1 - w) * f) * k, (t + (t1 - t) * f) * k
        rings.append([bm.verts.new(p + Vector((math.cos(a) * ww / 2, 0, 0)) + N * (math.sin(a) * tt / 2))
                      for a in (k_ * 2 * PI / seg + PI / seg for k_ in range(seg))])
    for r0, r1 in zip(rings, rings[1:]):
        for k in range(seg):
            bm.faces.new((r0[k], r0[(k + 1) % seg], r1[(k + 1) % seg], r1[k]))
    bm.faces.new(rings[0])
    bm.faces.new(list(reversed(rings[-1])))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _mesh_obj(bm, b, (0, 0, 0), (0, 0, 0), color)

def limb_band(b, pts, k, w, h, d, color, s=1):
    """A band round the limb at point k of a half profile (s = -1: the lower limb), square to the limb."""
    (y0, z0), (y1, z1) = pts[max(k - 1, 0)], pts[min(k + 1, len(pts) - 1)]
    y, z = pts[k]
    box(b, (w, h, d), (0, s * y, z), color, rot=(s * math.atan2(z1 - z0, y1 - y0), 0, 0), bevel=0.01)


def bow_tip(b, pts, length, w, color, s=1, w1=0.008):
    """A pointed cap carrying on from the limb's last point."""
    (y0, z0), (y1, z1) = pts[-2], pts[-1]
    d = Vector((0, y1 - y0, z1 - z0)).normalized()
    a = Vector((0, s * y1, z1))
    beam(b, tuple(a - Vector((0, s * d.y, d.z)) * 0.02), tuple(a + Vector((0, s * d.y, d.z)) * length), w, color, w1=w1, d1=w1)


def half_pts(half, H):
    """A half profile, grip to tip, as (fraction of the half length, depth as a fraction of the full length) -> points
    in the bow's frame."""
    return [(f * H, BOW_Z + d * 2 * H) for f, d in half]


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
    """Worn Shortbow: a deep D of weathered grey wood in one smooth piece, a tan rope wrap with a leather strip at the
    grip, rope whipping and small dark caps at the tips."""
    b, H = bow_frame(S), 0.8
    limb_tube(b, bow_shape(WORN, H), 0.14, 0.15, R.metal, 0.06, 0.065)
    box(b, (0.165, 0.26, 0.18), (0, 0, BOW_Z), R.trim, bevel=0.035)                   # rope wrap
    box(b, (0.1, 0.24, 0.02), (0, 0, BOW_Z - 0.093), R.dark, bevel=0.006)              # leather strip
    for y in (-0.08, 0, 0.08):
        box(b, (0.169, 0.012, 0.184), (0, y, BOW_Z), R.dark, bevel=0)                  # wrap turns
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
    limb_tube(b, bow_shape(HUNTER, H), 0.115, 0.13, R.metal, 0.045, 0.05)
    box(b, (0.135, 0.2, 0.15), (0, 0, BOW_Z), HUNTER_WRAP, bevel=0.03)                 # green wrap
    for s in (-1, 1):
        box(b, (0.15, 0.035, 0.165), (0, s * 0.115, BOW_Z), R.dark, bevel=0.01)           # steel rings
    pts = half_pts(HUNTER, H)
    for s in (-1, 1):
        bow_tip(b, pts, 0.11, 0.06, R.dark, s, w1=0.004)
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
    limb_tube(b, bow_shape(RECURVE[:9], H), 0.13, 0.115, R.metal, 0.08, 0.085)      # to the sheaths
    box(b, (0.15, 0.25, 0.16), (0, 0, BOW_Z), R.dark, bevel=0.03)                      # grip
    for y in (-0.075, -0.025, 0.025, 0.075):
        box(b, (0.154, 0.012, 0.164), (0, y, BOW_Z), 0x1A1210, bevel=0)                 # ribs
    for s in (-1, 1):
        box(b, (0.17, 0.05, 0.18), (0, s * 0.135, BOW_Z), R.trim, bevel=0.015)          # gold bands
        limb_tube(b, [(s * y, z) for y, z in pts[8:]], 0.1, 0.1, R.trim, 0.012, 0.012, n=3, ends=True)  # gold sheath
    bow_string(b, (RECURVE_NOCK * H, RECURVE_STRING * 2 * H))


DRAKE = [(0, 0), (0.22, 0.003), (0.56, 0.078), (0.74, 0.097), (0.9, 0.053)]
DRAKE_STRING, DRAKE_NOCK = 0.135, 0.76


def bow_drakebone(S):
    """Drakebone Bow: bone limbs in straight segments with knuckled joints, swinging toward the string and curling away
    at the tips, a dark grip between red bands, red bands mid-limb and red pointed tips."""
    b, H = bow_frame(S), 0.82
    pts = half_pts(DRAKE, H)
    limb_tube(b, bow_shape(DRAKE, H), 0.15, 0.125, R.metal, 0.09, 0.08, smooth=False, seg=5, knuckle=0.22)
    box(b, (0.16, 0.2, 0.17), (0, 0, BOW_Z), R.dark, bevel=0.03)                       # grip
    for s in (-1, 1):
        box(b, (0.18, 0.05, 0.19), (0, s * 0.11, BOW_Z), R.trim, bevel=0.015)           # red bands at the grip
        limb_band(b, pts, 2, 0.18, 0.06, 0.17, R.trim, s)                               # red band mid-limb
        bow_tip(b, pts, 0.11, 0.1, R.trim, s, w1=0.004)                                  # red point
    bow_string(b, (DRAKE_NOCK * H, DRAKE_STRING * 2 * H))

# Staffs run upright through the front of the fist (socket +Y), not down the forearm axis, with the top
# leaning forward and a touch outward so the shaft clears the forearm and sleeve.
STAFF_GRIP = (0, 0.1, 0)
STAFF_LEAN = (-PI / 2 + 0.2, 0, 0.05)


def staff_frame(S):
    return pivot(S('sock_handR'), 'staffbody', STAFF_GRIP, STAFF_LEAN)


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
    grip_wraps(b, (-0.12, -0.02, 0.08, 0.18), w=0.135)
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


# ─── Blocky plate kit ────────────────────────────────────────────────────────
# Shared by the med helm and chainbody below, the plate sets (plate_variants.py) and the uniques.
# sock_chest space: tunic 0.68 -> 0.73 wide, 0.42 deep, y -0.35..0.31; collar to 0.35 (= head bottom); sleeves
# x 0.345..0.595 at y -0.11..0.21; arm pivot (+-0.47, 0.18); hero belt y -0.37 (+-0.36 x, +-0.23 z) with a pouch
# on the left hip reaching z 0.24; skirt/hem to y -0.62 (+-0.36, +-0.23).
# Shoulder socket space: arm pivot (+-0.01, -0.10), sleeve top y -0.07, x -0.115..0.135 (L), z +-0.135.
# sock_head space: the head is a 0.46 cube centred here, ears out to x +-0.27, nose out to z 0.29, eyes y -0.03..0.08.

def faces(p, half_w, half_d, y=0.0, sides=True):
    """Frames on the front, back (and side) faces of a block centred on p: local +Z points out of the face,
    local +X runs along it. Yields (frame, face half-width)."""
    out = [(pivot(p, 'face', (0, y, half_d)), half_w), (pivot(p, 'face', (0, y, -half_d), (0, PI, 0)), half_w)]
    if sides:
        out += [(pivot(p, 'face', (half_w, y, 0), (0, PI / 2, 0)), half_d), (pivot(p, 'face', (-half_w, y, 0), (0, -PI / 2, 0)), half_d)]
    return out


# The cuirass is a few big clean slabs, readable at the gameplay camera (the owner's rule: fewer, bolder surfaces;
# no ridges, lames, grooves or trim bands): a broad chest block, one narrower waist block under it, a belt, a
# gorget, and single-slab tassets. (centre y, width, height, depth)
CHEST = (0.12, 0.74, 0.4, 0.58)
WAIST = (-0.17, 0.73, 0.2, 0.54)
BELT_Y = -0.3


INNER = 0x16120F          # the shadowed inside of every collar, cuff and boot top (fixed: no palette lights it)


def open_box(p, size, pos, color, inner=INNER, wall=0.07, sink=0.06, bevel=0.015):
    """A box with an open top, as the approved icons draw collars and cuffs: four closed walls on the outer
    footprint and, unless `inner` is None, a dark floor sunk `sink` below the rim. Closed solids only, so no inside
    faces ever show."""
    w, h, d = size
    x, y, z = pos
    for s in (-1, 1):
        box(p, (w, h, wall), (x, y, z + s * (d - wall) / 2), color, bevel=bevel)              # front / back wall
        box(p, (wall, h, d - 2 * wall), (x + s * (w - wall) / 2, y, z), color, bevel=bevel)   # side wall
    if inner is not None:
        box(p, (w - 2 * wall + 0.02, 0.04, d - 2 * wall + 0.02), (x, y + h / 2 - sink - 0.02, z), inner, bevel=0.01)


def open_gorget(c, color=R.metal, inner=INNER):
    """Hollow collar round an open neck on the gorget's 0.52 x 0.46 footprint."""
    open_box(c, (0.52, 0.13, 0.46), (0, 0.37, 0), color, inner)


def plate_torso(c, color=R.metal, belt=R.leather):
    """Plate cuirass in four slabs: chest block (a little broader at the top), waist block, belt and an open
    gorget, with single-slab tassets below."""
    y, w, hgt, d = CHEST
    box(c, (w, hgt, d), (0, y, 0), color, taper=(1.03, 1.0), bevel=0.06)
    y, w, hgt, d = WAIST
    box(c, (w, hgt, d), (0, y, 0), color, bevel=0.04)
    box(c, (0.76, 0.08, 0.57), (0, BELT_Y, 0), belt, bevel=0.02)                               # belt
    open_gorget(c, color)
    plate_tassets(c, color)


def plate_tassets(c, color=R.metal):
    """One plain slab over each thigh and one over the seat."""
    for s in (-1, 1):
        f = pivot(c, 'tasset', (s * 0.19, -0.33, 0.275), (-0.12, 0, s * 0.04))
        box(f, (0.3, 0.26, 0.05), (0, -0.13, 0), color, bevel=0.02)
    cul = pivot(c, 'tasset', (0, -0.33, -0.275), (0.12, 0, 0))
    box(cul, (0.6, 0.24, 0.05), (0, -0.12, 0), color, bevel=0.02)


# Pauldron cap (left side): a top block over the shoulder corner, sloping down with the shoulder, over an outer
# side block, the two forming one hard corner only a little wider than the arm. Each is (size, centre (x, y),
# outward tilt). The top block sits on the shoulder socket (shoulder-socket space), which follows the arm by 75%
# (anim.ts SHOULDER_FOLLOW), so it articulates over the joint. The side block and everything below it ride the arm
# itself (arm space, on the palm sockets), so nothing lags off the arm when it swings or goes overhead.
CAP_TOP = ((0.29, 0.13, 0.36), (0.04, 0.0), 0.26)
CAP_SIDE = ((0.075, 0.18, 0.36), (0.16, 0.045), 0.08)
SHOULDER_ARM = (('sock_shoulderL', 'sock_handL', 1), ('sock_shoulderR', 'sock_gloveR', -1))


def block_pauldron(S, s, color=R.metal, top=R.metal, edge=R.trim, rivets=R.dark):
    """Blocky shoulder cap for side s: a top block with a raised plate, and an outer side block with a rim along
    its lower edge. Returns the (top, side) frames: local +X runs outward along each block, +Y up out of it."""
    sh_name, palm_name, _ = next(r for r in SHOULDER_ARM if r[2] == s)
    (size, (x, y), tilt) = CAP_TOP
    ft = pivot(S(sh_name), 'pauldron_top', (s * x, y, 0), (0, 0, -s * tilt))
    box(ft, size, (0, 0, 0), color, bevel=0.035)
    if top:
        w, hgt, d = size
        box(ft, (w * 0.55, 0.045, d * 0.66), (-s * 0.02, hgt / 2 + 0.012, 0), top, bevel=0.014)
    (size, (x, y), tilt) = CAP_SIDE
    fs = pivot(S(palm_name), 'pauldron_side', (s * x, y + PALM, 0), (0, 0, -s * tilt))
    box(fs, size, (0, 0, 0), color, bevel=0.03)
    w, hgt, d = size
    if edge:
        box(fs, (w + 0.02, 0.04, d + 0.02), (s * 0.005, -hgt / 2 + 0.01, 0), edge, bevel=0.01)
    if rivets:
        for z in (-0.12, 0.12):
            rivet(fs, (s * (w / 2 + 0.002), 0.02, z), rivets, 0.018, rot=(PI / 4, PI / 2, 0))
    return ft, fs


# ─── Upper arm (body armour, on the palm sockets) ────────────────────────────
# Upper-arm armour hangs on the palm sockets (sock_handL / sock_gloveR: unrotated, PALM below the arm pivot), so
# it rides the upper arm exactly and never fans away from it. Authored in ARM space (origin = arm pivot, left arm,
# outer side +X) and mirrored for the right. Arm space: forearm x +-0.09 from y -0.28 down, the gauntlet cuff rises
# to y -0.33; the body armour's side is at x ARM_IN (below), where every armour sleeve starts.
ARM_SOCKS = (('sock_handL', 1), ('sock_gloveR', -1))
PALM = 0.63
# Lames under the cap stepping down the outside of the upper arm: (size, centre).
ARM_LAMES = (((0.25, 0.085, 0.35), (0.065, -0.07, 0)), ((0.235, 0.08, 0.335), (0.06, -0.14, 0)))


def arm_box(g, s, size, pos, color, rot=(0, 0, 0), **kw):
    """box() in arm space on a palm socket: pos/rot are for the left arm, mirrored when s < 0."""
    return box(g, size, (pos[0] * s, pos[1] + PALM, pos[2]), color, rot=(rot[0], rot[1] * s, rot[2] * s), **kw)


# Every body armour's sides stand at x +-0.38 at the arms' height (CHEST, hauberk, jerkin, Wyrmbone), and the arm
# pivots at +-0.47, so the armour's sleeves start at ARM_IN in arm space: they hang against the sides of the chest
# and swing past them without cutting in. (The starting tunic's own sleeves come off under body armour.)
ARM_IN = -0.09


def sleeve(g, s, hgt, y, depth, color, out=0.145, **kw):
    """A sleeve-like block round the upper arm, from the armour's side (ARM_IN) out to `out`, centred at height y."""
    return arm_box(g, s, (out - ARM_IN, hgt, depth), ((out + ARM_IN) / 2, y, 0), color, **kw)


def arm_lames(g, s, colors=(R.metal, R.metal), edge=R.dark):
    """The two lames stepping down the outside of the upper arm, each with a dark line under its lower edge."""
    for (size, pos), col in zip(ARM_LAMES, colors):
        arm_box(g, s, size, pos, col, rot=(0, 0, -0.06), bevel=0.025)
        if edge:
            w, h, d = size
            arm_box(g, s, (w - 0.012, 0.018, d - 0.012), (pos[0], pos[1] - h / 2 - 0.004, pos[2]), edge,
                    rot=(0, 0, -0.06), bevel=0)


def upper_arm_plate(S, color=R.metal, rim=None, edge=None, couter=False, lames=True):
    """Plate rerebrace round the upper arm down to the gauntlet cuff (optionally the pauldron's lames stepping down its
    outside, a lower rim and a couter over the elbow). Returns [(palm socket, side)]."""
    out = []
    for name, s in ARM_SOCKS:
        g = S(name)
        sleeve(g, s, 0.36, -0.14, 0.31, color, bevel=0.035)                                       # rerebrace
        if rim:
            sleeve(g, s, 0.04, -0.305, 0.325, rim, out=0.1525, bevel=0.012)
        if lames:
            arm_lames(g, s, (color, color), edge)
        if couter:
            arm_box(g, s, (0.17, 0.12, 0.06), (0.0, -0.27, -0.175), color, rot=(0.2, 0, 0), bevel=0.02)
        out.append((g, s))
    return out


def mail_sleeve(S, color=R.metal, hem=R.dark, link=R.dark):
    """Mail sleeve block round the upper arm, from under the cap to over the gauntlet cuff, with a dark hem and
    rows of mail links. Returns [(palm socket, side)]."""
    out = []
    for name, s in ARM_SOCKS:
        g = S(name)
        sleeve(g, s, 0.39, -0.15, 0.32, color, out=0.15, bevel=0.03)
        sleeve(g, s, 0.045, -0.325, 0.33, hem, out=0.155, bevel=0.01)
        for f, hw in faces(pivot(g, 'sleeve', (s * (0.15 + ARM_IN) / 2, PALM - 0.15, 0)), (0.15 - ARM_IN) / 2, 0.16):
            mail_links(f, hw - 0.02, [-0.14 + 0.05 * k for k in range(7)], link)
        out.append((g, s))
    return out


def mail_links(f, half_w, ys, color=R.dark, pitch=0.05, fill=0.55, hgt=0.009, z=0.002):
    """Mail read on a flat face (frame from faces(): local +Z out of the face): at each height in `ys` a row of
    short flat dashes `pitch` apart, alternate rows shifted half a pitch, lying just on the face -- fine rows of
    links, with no studs to catch the light. One mesh."""
    bm = bmesh.new()
    ln = pitch * fill
    n = int(half_w * 2 / pitch)
    for j, y in enumerate(ys):
        x0 = -n * pitch / 2 + (pitch / 2 if j % 2 else 0)
        for i in range(n):
            x = x0 + i * pitch + (pitch - ln) / 2
            if x < -half_w or x + ln > half_w:
                continue
            q = [(x, y, z), (x + ln, y, z), (x + ln, y + hgt, z), (x, y + hgt, z)]
            bm.faces.new([bm.verts.new(c_) for c_ in q])
    o = _common._mesh_obj(bm, f, (0, 0, 0), (0, 0, 0), color)
    o.name = 'mail_link'
    return o


def plate_gauntlet(g, s):
    """Box gauntlet, as in the approved icons: a mitten fist, deeper toward the front so the bare fist and its thumb
    stay covered, under an open cuff the forearm runs into (slim on the inner side, so it hangs clear of the hips)."""
    box(g, (0.32, 0.27, 0.38), (0, -0.01, 0.03), R.metal, bevel=0.055)
    open_box(g, (0.275, 0.21, 0.33), (s * 0.0175, 0.2, 0), R.metal, wall=0.05, sink=0.05, bevel=0.025)   # cuff


def plate_sabaton(f, knee=True):
    """Box sabaton and greave: a foot block with a tapered toe, an open-topped greave (as in the approved icons; the
    shin runs into it) and a block knee cop."""
    box(f, (0.34, 0.22, 0.48), (0, -0.08, 0.045), R.metal, bevel=0.035)
    box(f, (0.32, 0.15, 0.1), (0, -0.105, 0.265), R.metal, taper=(0.92, 0.7), bevel=0.03)      # toe
    open_box(f, (0.35, 0.34, 0.36), (0, 0.2, 0), R.metal, wall=0.035, sink=0.05, bevel=0.025)  # greave
    if knee:
        box(f, (0.27, 0.16, 0.08), (0, 0.45, 0.175), R.metal, bevel=0.03)                     # knee cop


# ─── Helms (sock_head) ───────────────────────────────────────────────────────

def open_helm(h, shell=R.metal, rim=R.trim, nasal=R.trim, stud=R.dark):
    """Boxy open-faced helm: a box bowl over the top of the head cube with a smaller block on top, a rim band
    over the brow, cheek guards over the ears and a neck guard. The face stays clear."""
    box(h, (0.56, 0.22, 0.58), (0, 0.2, -0.005), shell, bevel=0.04)                           # bowl
    box(h, (0.44, 0.07, 0.46), (0, 0.33, -0.005), shell, bevel=0.022)                         # top block
    box(h, (0.585, 0.065, 0.605), (0, 0.11, -0.005), rim, bevel=0.014)                        # rim band
    box(h, (0.56, 0.24, 0.07), (0, -0.03, -0.265), shell, bevel=0.022)                        # neck guard
    for s in (-1, 1):
        box(h, (0.07, 0.23, 0.26), (s * 0.28, -0.015, -0.07), shell, bevel=0.022)             # cheek guard
        if stud:
            rivet(h, (s * 0.2, 0.11, 0.304), stud, 0.018)
            rivet(h, (s * 0.2935, 0.11, 0.12), stud, 0.018, rot=(PI / 4, PI / 2, 0))
    if nasal:
        box(h, (0.07, 0.21, 0.04), (0, 0.0, 0.312), nasal, taper=(1.3, 1), bevel=0.012)      # nasal bar


def helm_open(S):
    """Med helm."""
    open_helm(S('sock_head'))


def slotted_plate(p, xs, ys, holes, depth, z, color, bevel=0.01):
    """A flat plate facing +Z (front at z + depth) over the grid of cells between the breakpoints xs, ys, with the
    cells in `holes` ((i, j) pairs) cut clean through: a real opening with walls, whose lower wall faces up and takes
    the light (a lit lip) while its upper wall faces down into shadow. One mesh; every edge lightly chamfered."""
    bm = bmesh.new()
    vf, vb = {}, {}

    def v(d, i, j, zz):
        if (i, j) not in d:
            d[(i, j)] = bm.verts.new((xs[i], ys[j], zz))
        return d[(i, j)]
    nx, ny = len(xs) - 1, len(ys) - 1
    keep = {(i, j) for i in range(nx) for j in range(ny) if (i, j) not in holes}
    for i, j in keep:
        bm.faces.new((v(vf, i, j, z + depth), v(vf, i + 1, j, z + depth), v(vf, i + 1, j + 1, z + depth), v(vf, i, j + 1, z + depth)))
        bm.faces.new((v(vb, i, j + 1, z), v(vb, i + 1, j + 1, z), v(vb, i + 1, j, z), v(vb, i, j, z)))
        for (di, dj), (a, b) in (((0, -1), ((i, j), (i + 1, j))), ((1, 0), ((i + 1, j), (i + 1, j + 1))),
                                 ((0, 1), ((i + 1, j + 1), (i, j + 1))), ((-1, 0), ((i, j + 1), (i, j)))):
            if (i + di, j + dj) not in keep:            # boundary: a wall between the front and the back
                bm.faces.new((v(vf, *b, z + depth), v(vf, *a, z + depth), v(vb, *a, z), v(vb, *b, z)))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if bevel > 0:
        edges = [e for e in bm.edges if len(e.link_faces) == 2 and abs(e.link_faces[0].normal.dot(e.link_faces[1].normal)) < 0.5]
        bmesh.ops.bevel(bm, geom=edges, offset=bevel, segments=1, affect='EDGES', profile=0.5, clamp_overlap=True)
    return _common._mesh_obj(bm, p, (0, 0, 0), (0, 0, 0), color)


def great_helm(h, crest=R.cloth, slit=SLIT):
    """Cube-over-cube great helm, kept bold and plain: a box shell over the head cube, a smaller block on top with a
    low crest, and a T visor: a face plate standing proud of the shell with the eye slit and the breathing slot below
    it cut right through it, so the T is a real recess (lit lower lip, shadowed upper wall) onto a dark lining
    (`slit`). Every heavy tier wears it."""
    box(h, (0.58, 0.5, 0.6), (0, 0.02, 0.01), R.metal, bevel=0.045)                          # shell
    box(h, (0.46, 0.08, 0.48), (0, 0.3, 0.01), R.metal, bevel=0.028)                          # top block
    if crest:
        box(h, (0.08, 0.12, 0.4), (0, 0.395, -0.02), crest, taper=(1, 0.8), bevel=0.022)       # crest
    # Face plate: columns / rows round the T (eye slit y 0.062..0.118 across x +-0.2, breathing slot x +-0.032
    # from the slit down to y -0.13).
    xs = (-0.255, -0.2, -0.032, 0.032, 0.2, 0.255)
    ys = (-0.2, -0.13, 0.062, 0.118, 0.245)
    holes = {(1, 2), (2, 2), (3, 2), (2, 1)}
    slotted_plate(h, xs, ys, holes, 0.04, 0.3, R.metal, bevel=0.009)
    box(h, (0.44, 0.1, 0.02), (0, 0.09, 0.305), slit, bevel=0)                                # dark lining: eye slit
    box(h, (0.1, 0.24, 0.02), (0, -0.04, 0.305), slit, bevel=0)                               # dark lining: breathing slot


def helm_full(S):
    """Full helm: the great helm with a low crest dyed like the wearer's tunic (ROLE_cloth)."""
    great_helm(S('sock_head'))


# ─── Body armour (sock_chest + shoulders) ────────────────────────────────────

# Mail link rows on the hauberk: body block and skirt block (the skirt tapers in, so its rows sit a little out).
MAIL_BODY_ROWS = [-0.3 + 0.05 * k for k in range(12)]
MAIL_SKIRT_ROWS = (-0.56, -0.51, -0.46)


def hauberk(c, mail=R.metal, dark=R.dark, belt=R.leather, buckle=R.trim, collar=None, links=True):
    """Box mail shirt from the collar to a short skirt block, with a belt, hem and collar, covered in fine
    staggered rows of flat links (mail on the metal tiers, stitched leather on the leather set)."""
    box(c, (0.76, 0.66, 0.52), (0, -0.01, 0), mail, bevel=0.045)
    box(c, (0.78, 0.26, 0.54), (0, -0.47, 0), mail, taper=(0.96, 0.96), bevel=0.035)          # skirt block
    box(c, (0.8, 0.04, 0.56), (0, -0.585, 0), dark, bevel=0.01)                             # hem
    open_box(c, (0.5, 0.1, 0.44), (0, 0.36, 0), collar or mail, sink=0.05, bevel=0.02)       # open collar
    box(c, (0.78, 0.085, 0.56), (0, -0.37, 0), belt, bevel=0.02)
    box(c, (0.13, 0.1, 0.03), (0, -0.37, 0.285), buckle, bevel=0.012)
    if not links:
        return
    for f, hw in faces(c, 0.38, 0.26):
        mail_links(f, hw - 0.03, MAIL_BODY_ROWS, dark)
        mail_links(pivot(f, 'skirt_face', (0, 0, 0.01)), hw - 0.03, MAIL_SKIRT_ROWS, dark)


def body_chain(S):
    """Mail shirt: box hauberk with a short skirt block, blocky mail shoulder caps and mail sleeves down to the
    gauntlets."""
    hauberk(S('sock_chest'))
    for s in (1, -1):
        block_pauldron(S, s, top=None, edge=R.dark, rivets=None)
    mail_sleeve(S)


STITCH = 0xD8C8A0
BRASS = 0xB08A48


def stitches(f, pts, color=STITCH, pitch=0.045, ln=0.024, t=0.008, z=0.002):
    """Running stitch along a polyline of (x, y) points on a face frame (local +Z out): short flat dashes
    `pitch` apart lying just on the face. One mesh."""
    bm = bmesh.new()
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        a, b = Vector((x0, y0, 0)), Vector((x1, y1, 0))
        d = b - a
        n = max(1, int(d.length / pitch))
        u = d.normalized()
        v = Vector((-u.y, u.x, 0)) * t / 2
        for i in range(n):
            p = a + d * ((i + 0.5) / n) - u * ln / 2
            q = p + u * ln
            bm.faces.new([bm.verts.new(tuple(c_ + Vector((0, 0, z)))) for c_ in (p - v, q - v, q + v, p + v)])
    o = _common._mesh_obj(bm, f, (0, 0, 0), (0, 0, 0), color)
    o.name = 'stitch'
    return o


def panel_stitched(f, x, y, w, hgt, color=R.metal, depth=0.035, inset=0.028):
    """Raised leather panel on a face frame with a running stitch just inside its edge."""
    box(f, (w, hgt, depth), (x, y, depth / 2), color, bevel=0.012)
    hw, hh = w / 2 - inset, hgt / 2 - inset
    stitches(f, [(x - hw, y - hh), (x + hw, y - hh), (x + hw, y + hh), (x - hw, y + hh), (x - hw, y - hh)], z=depth + 0.002)


def body_leather(S):
    """Leather jerkin: stitched leather panels over a dark underlayer (the gaps between them read as seams),
    a stand-up collar, a strap across the chest with a brass buckle, a belt, a skirt of hanging flaps, layered
    leather shoulder caps with studs and leather sleeves with a strap. Main leather is ROLE_metal (the leather
    palette's main colour), straps and collar trim are ROLE_trim (darker), the underlayer ROLE_dark."""
    c = S('sock_chest')
    box(c, (0.72, 0.64, 0.5), (0, -0.01, 0), R.dark, bevel=0.04)                               # underlayer
    fr, bk, sl, sr = faces(c, 0.36, 0.25)
    for s in (-1, 1):
        panel_stitched(fr[0], s * 0.18, 0.15, 0.33, 0.3)                                          # chest panels
        panel_stitched(fr[0], s * 0.18, -0.17, 0.33, 0.28)                                        # belly panels
        panel_stitched(bk[0], s * 0.18, -0.01, 0.33, 0.6)                                         # back panels
    for f, hw in (sl, sr):
        panel_stitched(f, 0, -0.01, 0.44, 0.6, depth=0.02)                                        # (sides at 0.38)
    # open stand-up collar with a darker rim over a shoulder yoke
    open_box(c, (0.52, 0.11, 0.44), (0, 0.35, -0.01), R.metal, wall=0.06, sink=0.05, bevel=0.02)
    open_box(c, (0.54, 0.035, 0.46), (0, 0.41, -0.01), R.trim, inner=None, wall=0.06, bevel=0.01)
    box(c, (0.68, 0.05, 0.46), (0, 0.32, -0.01), R.metal, bevel=0.018)                        # shoulder yoke
    # strap from the left shoulder across the chest to the right hip, with a brass buckle
    st = pivot(c, 'strap', (0, 0.02, 0.3), (0, 0, 0.62))
    box(st, (0.1, 0.72, 0.03), (0, 0, 0), R.trim, bevel=0.01)
    box(st, (0.13, 0.11, 0.03), (0, -0.05, 0.012), BRASS, bevel=0.012)
    box(st, (0.07, 0.05, 0.03), (0, -0.05, 0.02), R.trim, bevel=0)
    stb = pivot(c, 'strap', (0, 0.02, -0.3), (0, 0, 0.62))
    box(stb, (0.1, 0.72, 0.03), (0, 0, 0), R.trim, bevel=0.01)
    box(c, (0.76, 0.085, 0.54), (0, -0.33, 0), R.trim, bevel=0.02)                              # belt
    box(c, (0.12, 0.1, 0.03), (0, -0.33, 0.275), BRASS, bevel=0.012)
    # skirt: hanging flaps over a dark under-skirt
    box(c, (0.72, 0.24, 0.46), (0, -0.48, 0), R.dark, bevel=0.02)
    for z in (0.25, -0.25):
        for x in (-0.24, 0.0, 0.24):
            f = pivot(pivot(c, 'flap', (x, -0.37, z), (0, 0 if z > 0 else PI, 0)), 'flap_tilt', (0, 0, 0), (-0.1, 0, 0))
            box(f, (0.21, 0.26, 0.035), (0, -0.13, 0), R.metal, bevel=0.012)
            stitches(f, [(-0.075, -0.23), (-0.075, -0.03)], z=0.02)
            stitches(f, [(0.075, -0.23), (0.075, -0.03)], z=0.02)
    for s in (-1, 1):
        f = pivot(c, 'flap', (s * 0.37, -0.37, 0), (0, 0, s * 0.1))
        box(f, (0.035, 0.24, 0.36), (0, -0.12, 0), R.metal, bevel=0.012)
    # layered leather shoulder caps with studs, leather sleeves with a strap
    for s in (1, -1):
        top, side = block_pauldron(S, s, top=R.trim, edge=R.trim, rivets=BRASS)
    for name, s in ARM_SOCKS:
        g = S(name)
        sleeve(g, s, 0.38, -0.15, 0.31, R.metal, bevel=0.03)
        sleeve(g, s, 0.045, -0.325, 0.32, R.dark, out=0.15, bevel=0.01)
        sleeve(g, s, 0.05, -0.2, 0.325, R.trim, out=0.1525, bevel=0.01)                           # strap
        arm_lames(g, s, (R.metal, R.metal), R.dark)


def plate_accent(c, tabard=R.cloth, under=R.dark):
    """The plate's one accent: a plain tabard falling from the belt between the tassets (ROLE_cloth: it takes the
    wearer's tunic colour, so the knight is not one grey mass), over a plain dark under-skirt that shows between the
    plates at the hips."""
    box(c, (0.74, 0.28, 0.49), (0, -0.49, 0), under, bevel=0.02)
    f = pivot(c, 'tabard', (0, -0.34, 0.29), (-0.12, 0, 0))
    box(f, (0.24, 0.38, 0.03), (0, -0.19, 0.03), tabard, taper=(1.12, 1), bevel=0.01)


def body_plate(S):
    """Platebody (the plate sets in plate_variants.py build on this: set P is exactly it). Bold and plain, like a
    toy knight: a chest block over a waist block, belt, gorget, one tasset per thigh and one accent (a plain dyed
    tabard); block pauldron caps and a plain rerebrace down each upper arm. No lames, ridges, rivets or trim bands."""
    c = S('sock_chest')
    plate_torso(c)
    plate_accent(c)
    for s in (1, -1):
        block_pauldron(S, s, top=None, edge=None, rivets=None)
    upper_arm_plate(S, lames=False)


# ─── Gloves & boots ──────────────────────────────────────────────────────────

def gloves(S):
    for name, s in (('sock_handL', 1), ('sock_gloveR', -1)):
        g = S(name)
        box(g, (0.31, 0.28, 0.37), (0, -0.015, 0.03), R.metal, bevel=0.06)                # mitten fist
        box(g, (0.33, 0.06, 0.39), (0, -0.09, 0.03), R.dark, bevel=0.012)                 # knuckle band
        box(g, (0.03, 0.14, 0.2), (s * 0.165, 0.01, 0), R.trim, bevel=0.01)               # back plate
        # open cuff and its rim, slim on the inner side so they hang clear of the hips and armour skirts
        open_box(g, (0.275, 0.19, 0.33), (s * 0.0175, 0.2, 0), R.metal, wall=0.05, sink=0.05, bevel=0.025)
        open_box(g, (0.295, 0.045, 0.35), (s * 0.0175, 0.3, 0), R.trim, inner=None, wall=0.05, bevel=0.012)
        rivet(g, (s * 0.17, 0.2, 0), R.trim, 0.022, rot=(PI / 4, PI / 2, 0))


def boots(S):
    for name in ('sock_footL', 'sock_footR'):
        f = S(name)
        box(f, (0.35, 0.19, 0.46), (0, -0.075, 0.055), R.metal, bevel=0.05)                # foot
        box(f, (0.36, 0.04, 0.48), (0, -0.162, 0.055), R.dark, bevel=0.01)                 # sole
        box(f, (0.33, 0.13, 0.16), (0, -0.08, 0.235), R.metal, taper=(0.9, 0.8), bevel=0.04)  # toe cap
        box(f, (0.34, 0.035, 0.18), (0, -0.02, 0.23), R.trim, bevel=0.01)
        open_box(f, (0.35, 0.34, 0.36), (0, 0.15, 0), R.metal, wall=0.035, sink=0.05, bevel=0.03)  # open shaft
        box(f, (0.37, 0.04, 0.38), (0, 0.1, 0), R.dark, bevel=0)                           # strap
        box(f, (0.2, 0.26, 0.05), (0, 0.17, 0.185), R.metal, bevel=0.02)                   # shin plate
        open_box(f, (0.38, 0.08, 0.4), (0, 0.33, 0), R.trim, inner=None, wall=0.05, bevel=0.02)  # cuff
        rivet(f, (0, 0.2, 0.215), R.trim, 0.022)


# ─── Uniques: the Wyrmbone set ───────────────────────────────────────────────
# Every unique is cut from one dead wyrm: pale dragon BONE as the big shapes, OBSIDIAN-black plate under it, and one
# ember glow per piece (the skull's eyes and mouth, the crown's gem, the fang's molten core, the burning string, the
# staff's heart). The inverse of Emberforged (blackened steel with thin ember seams): light over dark, so the two
# never read alike. One strong silhouette idea per piece, big clean shapes, no scales, pouches or tassets.
# Own authored colours; obsidian parts are metallic() so the game gives them the forged-metal finish, and bone is
# painted as bone (registry.ts fixedPaint).
BONE = 0xDDCFAF           # pale dragon bone
BONE_DK = 0xBCA987        # bone in shade: the lower jaw, horn roots
OBSIDIAN = 0x2A2530       # the black plate under the bone
GRIP = 0x3E2218           # dark oxblood leather grips and belt
SOCKET = 0x140E0E         # eye sockets
EMBER = 0xFF6A1A
EMBER_HOT = 0xFFC050


def obsidian():
    return metallic(OBSIDIAN)


def dragon_skull(f):
    """A dragon's skull on frame f with its snout along local +X: a broad cranium block, a snout tapering out of
    it over a slightly open lower jaw with an ember glow between them, two fangs at the tip, heavy brows over
    burning eye sockets on both sides and two horns swept back level along the cranium (upright horns read as ears)."""
    box(f, (0.38, 0.24, 0.4), (0, 0, 0), BONE, bevel=0.06)                                          # cranium
    beam(f, (0.13, -0.01, 0), (0.56, -0.06, 0), 0.16, BONE, w1=0.1, d=0.3, d1=0.2, bevel=0.03)     # snout
    beam(f, (0.1, -0.13, 0), (0.5, -0.21, 0), 0.06, BONE_DK, w1=0.05, d=0.26, d1=0.16, bevel=0.015)  # lower jaw
    beam(f, (0.16, -0.1, 0), (0.5, -0.15, 0), 0.035, EMBER, w1=0.06, d=0.22, d1=0.13, bevel=0,
         emissive=EMBER, strength=3)                                                                # smoulder in the mouth
    for z in (-0.07, 0.07):
        beam(f, (0.5, -0.1, z), (0.52, -0.21, z), 0.035, BONE, w1=0.006, bevel=0)                    # fangs
    for z in (-1, 1):
        box(f, (0.12, 0.075, 0.02), (0.11, 0.03, z * 0.201), SOCKET, bevel=0)                        # eye socket
        box(f, (0.07, 0.032, 0.02), (0.12, 0.028, z * 0.207), EMBER, bevel=0, emissive=EMBER, strength=4)  # eye
        box(f, (0.2, 0.05, 0.07), (0.1, 0.1, z * 0.18), BONE, rot=(0, 0, -0.18), bevel=0.018)         # brow
        beam(f, (0.06, 0.07, z * 0.13), (-0.27, 0.12, z * 0.19), 0.1, BONE_DK, w1=0.012, bevel=0.012)  # horn swept back


def u_wyrmbone(S):
    """Wyrmbone Harness: a bone breastplate over obsidian plate, and ONE strong idea: a dragon's skull over the left
    shoulder, snout out over the arm, eyes and mouth smouldering. The right shoulder is a plain bone cap, the upper
    arms obsidian, the forearms bone. Below the chest it is all obsidian (waist, belt, a plain under-skirt), so the
    pale chest and skull carry the read. As in the approved icon: a bone chevron with an ember gem on the chest, an
    ember buckle and three bone strips down the skirt."""
    c = S('sock_chest')
    obs = obsidian()
    y, w, hgt, d = CHEST
    box(c, (w + 0.02, hgt + 0.02, d + 0.02), (0, y, 0), BONE, bevel=0.07)                        # breastplate
    y, w, hgt, d = WAIST
    box(c, (w, hgt, d), (0, y, 0), obs, bevel=0.04)                                                   # waist
    box(c, (0.77, 0.085, 0.58), (0, BELT_Y, 0), GRIP, bevel=0.02)                                     # belt
    box(c, (0.13, 0.11, 0.03), (0, BELT_Y, 0.29), obs, bevel=0.012)                                   # buckle
    facet_gem(c, 0.04, (0, BELT_Y, 0.31), EMBER, emissive=EMBER, strength=4)                          # ember in the buckle
    open_gorget(c, obs)                                                                               # gorget
    prism(c, [(-0.3, 0.3), (-0.17, 0.3), (0, 0.06), (0.17, 0.3), (0.3, 0.3), (0, -0.06)], 0.03, (0, 0, 0.305),
          BONE_DK, bevel=0.008)                                                                       # bone chevron
    box(c, (0.1, 0.1, 0.03), (0, 0.08, 0.322), obs, rot=(0, 0, PI / 4), bevel=0.01)                   # gem setting
    facet_gem(c, 0.045, (0, 0.08, 0.34), EMBER, emissive=EMBER, strength=4)                           # chest ember
    box(c, (0.76, 0.26, 0.55), (0, -0.47, 0), obs, bevel=0.03)                                        # under-skirt
    for x in (-0.26, 0, 0.26):
        box(c, (0.08, 0.24, 0.02), (x, -0.47, 0.283), BONE, bevel=0.008)                              # bone skirt strip
    # Keep the skull's rear edge within the shoulder envelope (-0.22 in socket-local Z).
    # A small forward seat preserves the skull and horn shapes without sweeping behind the hero.
    dragon_skull(pivot(S('sock_shoulderL'), 'skull', (0.08, 0.05, 0.03), (0, 0, -0.22)))
    block_pauldron(S, -1, color=BONE, top=None, edge=None, rivets=None)
    for name, s in ARM_SOCKS:
        g = S(name)
        sleeve(g, s, 0.36, -0.14, 0.31, obs, bevel=0.035)                                             # rerebrace
        arm_box(g, s, (0.265, 0.21, 0.285), (0, -0.41, 0), BONE, bevel=0.03)                         # vambrace


def horn_point(h, a, r, base_y, ln, w):
    """A dragon horn standing on the crown band at bearing a (radians from the front), r out from the centre:
    two blocks, flaring outward from the band and then turning up to a point."""
    out = Vector((math.sin(a), 0, math.cos(a)))
    b = Vector((0, base_y, 0)) + out * r
    m = b + Vector((0, ln * 0.45, 0)) + out * (ln * 0.3)
    t = b + Vector((0, ln, 0)) + out * (ln * 0.42)
    beam(h, tuple(b - Vector((0, 0.04, 0))), tuple(m), w, BONE, w1=w * 0.72, bevel=0.012)
    beam(h, tuple(m - (m - b).normalized() * 0.025), tuple(t), w * 0.72, BONE, w1=0.01, bevel=0)


def u_ashen_crown(S):
    """The Ashen Crown, as in the approved icon: an open circlet worn over the hair. A slim black band between two
    bone rims carries five short dragon horns (the tallest over the brow, a pair at the front corners, a shorter pair
    behind), an ember gem under the front horn and a small one under each corner horn. Sized to sit snugly on the
    hair, not to tower over the head."""
    h = S('sock_head')
    obs = obsidian()
    open_box(h, (0.64, 0.085, 0.66), (0, 0.15, -0.005), obs, inner=None, wall=0.05, bevel=0.015)    # band
    for y in (0.1, 0.2):
        open_box(h, (0.655, 0.02, 0.675), (0, y, -0.005), BONE, inner=None, wall=0.06, bevel=0.008)  # bone rims
    for deg, ln, w in ((0, 0.25, 0.085), (52, 0.19, 0.07), (-52, 0.19, 0.07), (128, 0.13, 0.06), (-128, 0.13, 0.06)):
        a = math.radians(deg)
        ca, sa = math.cos(a), math.sin(a)
        r = 1 / max(abs(sa) / 0.3, abs(ca) / 0.31)                                                    # onto the band's square
        horn_point(h, a, r, 0.19, ln, w)
    box(h, (0.09, 0.09, 0.025), (0, 0.15, 0.325), obs, rot=(0, 0, PI / 4), bevel=0.01)               # gem setting
    facet_gem(h, 0.038, (0, 0.15, 0.338), EMBER_HOT, emissive=EMBER, strength=5)                    # ember gem
    for x in (-0.18, 0.18):
        facet_gem(h, 0.024, (x, 0.15, 0.33), EMBER, emissive=EMBER, strength=4)                     # corner gems


def u_cinderfang(S):
    """Cinderfang, as in the approved icon: a broad straight dragon-fang blade of pale bone with a black channel and a
    burning ember line down its middle, set in an obsidian jaw guard with two bone horn quillons and an ember gem;
    an ember gem for a pommel. Big, clean shapes that read in the hand."""
    h = S('sock_handR')
    obs = obsidian()
    grip(h, -0.21, 0.21, 0.1, GRIP, (-0.13, -0.01, 0.11), obs)
    box(h, (0.13, 0.08, 0.13), (0, -0.25, 0), obs, bevel=0.02)                                        # pommel cap
    facet_gem(h, 0.07, (0, -0.33, 0), EMBER, emissive=EMBER, strength=4, rot=corner_up(), depth=0.1)  # ember pommel
    box(h, (0.24, 0.16, 0.18), (0, 0.24, 0), obs, bevel=0.04)                                         # jaw guard
    for s in (-1, 1):
        prism(h, [(0, -0.06), (0.32, -0.02), (0.44, 0.18), (0.29, 0.09), (0, 0.07)], 0.09, (s * 0.07, 0.24, 0), BONE,
              rot=(0, 0 if s > 0 else PI, 0), bevel=0.012)                                           # horn quillons
    facet_gem(h, 0.05, (0, 0.24, 0.095), EMBER, emissive=EMBER, strength=5)
    fang = [(-0.16, 0.3), (0.16, 0.3), (0.175, 0.62), (0.165, 1.0), (0.12, 1.3), (0, 1.6), (-0.12, 1.3),
            (-0.165, 1.0), (-0.175, 0.62)]
    prism(h, fang, 0.08, (0, 0, 0), BONE, bevel=0.016)                                               # the fang blade
    prism(h, [(-0.05, 0.33), (0.05, 0.33), (0.05, 1.16), (0, 1.36), (-0.05, 1.16)], 0.09, (0, 0, 0), obs,
          bevel=0.008)                                                                                # dark channel
    prism(h, [(-0.016, 0.36), (0.016, 0.36), (0.016, 1.14), (0, 1.27), (-0.016, 1.14)], 0.1, (0, 0, 0), EMBER,
          emissive=EMBER, strength=4)                                                                 # ember line


def u_emberstring(S):
    """Emberstring, as in the approved icon: a bone recurve with an ember inlay down the inside of each limb, obsidian
    horn tips, an ember gem in the grip and a burning string."""
    h = S('sock_handR')
    obs = obsidian()
    b = pivot(h, 'bowbody', (0, 0, 0), (-PI / 2, 0, 0))
    z0 = BOW_Z
    box(b, (0.12, 0.28, 0.14), (0, 0, z0), GRIP, bevel=0.03)                                          # grip
    facet_gem(b, 0.05, (0, 0, z0 - 0.075), EMBER, emissive=EMBER, strength=5, rot=(0, PI / 4, 0))
    for s in (-1, 1):
        box(b, (0.13, 0.05, 0.15), (0, s * 0.15, z0), obs, bevel=0.015)
        limb_chain(b, [(s * y, z + z0) for y, z in BOW_LIMB], 0.12, 0.09, BONE)
        beam(b, (0, s * 0.72, z0 + 0.16), (0, s * 0.9, z0 + 0.06), 0.08, obs, w1=0.015)               # horn tips
        for (y0, za), (y1, zb) in zip(BOW_LIMB, BOW_LIMB[1:]):
            beam(b, (0, s * y0, za + z0 + 0.047), (0, s * y1, zb + z0 + 0.047), 0.04, EMBER, d=0.012, bevel=0,
                 emissive=EMBER, strength=3)                                                          # ember inlay
    box(b, (0.026, 1.24, 0.026), (0, 0, z0 + 0.195), EMBER_HOT, emissive=EMBER, strength=6, bevel=0)  # burning string


def u_kindled_ash(S):
    """Staff of Kindled Ash, as in the approved icon: an obsidian shaft ringed with bone bands and an oxblood grip;
    four bone claws rise from a bone collar and bend in around a tall burning crystal."""
    h = S('sock_handR')
    obs = obsidian()
    b = pivot(h, 'staffbody', STAFF_GRIP, STAFF_LEAN)
    box(b, (0.11, 1.72, 0.11), (0, 0.21, 0), obs, taper=(0.85, 0.85), bevel=0.02)                   # obsidian shaft
    for y in (-0.5, -0.12, 0.12, 0.8):
        box(b, (0.14, 0.05, 0.14), (0, y, 0), BONE, bevel=0.012)                                     # bone bands
    box(b, (0.13, 0.2, 0.13), (0, -0.31, 0), GRIP, bevel=0.02)                                       # oxblood grip
    beam(b, (0, -0.66, 0), (0, -0.84, 0), 0.12, obs, w1=0.02)                                        # butt spike
    box(b, (0.19, 0.14, 0.19), (0, 1.12, 0), BONE, taper=(1.3, 1.3), bevel=0.02)                     # claw collar
    for i in range(4):
        a = i * PI / 2 + PI / 4
        d = Vector((math.cos(a), 0, math.sin(a)))
        pts = [d * 0.08 + Vector((0, 1.18, 0)), d * 0.18 + Vector((0, 1.32, 0)), d * 0.19 + Vector((0, 1.5, 0)), d * 0.07 + Vector((0, 1.7, 0))]
        for p0, p1, w0, w1 in zip(pts, pts[1:], (0.075, 0.065, 0.05), (0.065, 0.05, 0.012)):
            beam(b, tuple(p0 - (p1 - p0).normalized() * 0.02), tuple(p1), w0, BONE, w1=w1)
    beam(b, (0, 1.42, 0), (0, 1.8, 0), 0.15, EMBER_HOT, w1=0.01, d=0.15, d1=0.01, bevel=0,
         emissive=EMBER, strength=5)                                                                 # crystal, upper
    beam(b, (0, 1.42, 0), (0, 1.24, 0), 0.15, EMBER, w1=0.02, d=0.15, d1=0.02, bevel=0,
         emissive=EMBER, strength=4)                                                                 # crystal, lower


GEAR = {
    'sword': sword, 'longsword': longsword, 'pickaxe': pickaxe,
    'bow_worn': bow_worn, 'bow_hunter': bow_hunter, 'bow_recurve': bow_recurve, 'bow_drakebone': bow_drakebone,
    'staff_apprentice': staff_apprentice, 'staff_oak': staff_oak, 'staff_runed': staff_runed, 'staff_ember': staff_ember,
    'helm_open': helm_open, 'helm_full': helm_full, 'body_chain': body_chain, 'body_plate': body_plate,
    'body_leather': body_leather,
    'gloves': gloves, 'boots': boots,
    'u_cinderfang': u_cinderfang, 'u_emberstring': u_emberstring, 'u_kindled_ash': u_kindled_ash,
    'u_ashen_crown': u_ashen_crown, 'u_wyrmbone': u_wyrmbone,
}


def build(model):
    scene, root = fresh_scene(f'DB_gear_{model}')
    socks = {}

    def S(name):
        if name not in socks:
            socks[name] = pivot(root, name, SOCKET_POS[name])
        return socks[name]

    GEAR[model](S)
    return scene


if globals().get('DB_RUN', True):
    only = globals().get('DB_ONLY') or list(GEAR)
    tris = {}
    for model in only:
        scene = build(model)
        tris[model] = tri_count(scene)
        export(f'DB_gear_{model}', f'gear_{model}.glb')
        if globals().get('DB_PREVIEW', True):   # DB_PREVIEW = False: export only (no EEVEE render)
            preview_auto(f'gear_{model}.png')
        remove_preview_rig()
    result = {'ok': True, 'tris': tris}
