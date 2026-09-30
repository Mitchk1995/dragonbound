"""Gear for the hero base: weapons, helms, body armour, gloves, boots, and the hand-built uniques.

Each file holds socket-named empties (sock_handR, sock_head, sock_chest, sock_shoulderL/R, sock_handL,
sock_gloveR, sock_footL/R). The game moves each socket's children under the hero socket of the same
name with their local transform unchanged, so everything below is authored in socket-local space:

  sock_handR      palm centre, rotated +90 X: local +Y points forward, local +Z points down (arm hanging)
  sock_head       head centre (head = 0.46 cube)
  sock_chest      torso centre; tunic is 0.68 x 0.66 x 0.42 (flared to 1.08 x at the top), belt at y -0.37
  sock_shoulderX  top of the shoulder, sleeve below it
  sock_handL / sock_gloveR   palm centre, unrotated; hand is a 0.26 cube, thumb forward
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

def sword(S):
    h = S('sock_handR')
    grip(h, -0.15, 0.15, 0.085, R.leather, (-0.08, 0.06))
    box(h, (0.12, 0.08, 0.12), (0, -0.19, 0), R.trim, bevel=0.025)                 # pommel block
    box(h, (0.08, 0.04, 0.08), (0, -0.245, 0), R.trim, bevel=0.012)
    box(h, (0.14, 0.13, 0.13), (0, 0.17, 0), R.dark, bevel=0.03)                   # guard block
    box(h, (0.46, 0.07, 0.11), (0, 0.18, 0), R.trim, bevel=0.025)                  # crossguard
    for s in (-1, 1):
        box(h, (0.08, 0.12, 0.13), (s * 0.24, 0.2, 0), R.trim, rot=(0, 0, s * -0.3), bevel=0.025)
    facet_gem(h, 0.035, (0, 0.17, 0.07), R.glow)
    prism(h, [(-0.075, 0.22), (0.075, 0.22), (0.065, 0.8), (0.0, 0.94), (-0.065, 0.8)], 0.05, (0, 0, 0), R.metal, bevel=0.012)
    box(h, (0.035, 0.5, 0.058), (0, 0.5, 0), R.dark, bevel=0)                     # fuller


def longsword(S):
    h = S('sock_handR')
    grip(h, -0.21, 0.21, 0.09, R.leather, (-0.12, 0.0, 0.12))
    box(h, (0.12, 0.06, 0.12), (0, -0.24, 0), R.trim, taper=(0.75, 0.75), bevel=0.015)
    box(h, (0.14, 0.1, 0.14), (0, -0.31, 0), R.trim, bevel=0.03)                   # pommel block
    box(h, (0.17, 0.16, 0.15), (0, 0.24, 0), R.dark, bevel=0.035)
    box(h, (0.62, 0.08, 0.12), (0, 0.25, 0), R.trim, bevel=0.03)
    for s in (-1, 1):
        box(h, (0.09, 0.16, 0.13), (s * 0.33, 0.22, 0), R.trim, rot=(0, 0, s * 0.45), bevel=0.03)  # down-swept quillons
        rivet(h, (s * 0.2, 0.25, 0.065), R.dark, 0.02)
    facet_gem(h, 0.045, (0, 0.24, 0.08), R.glow)
    box(h, (0.16, 0.12, 0.07), (0, 0.35, 0), R.metal, bevel=0.02)                  # ricasso
    prism(h, [(-0.09, 0.3), (0.09, 0.3), (0.085, 1.02), (0.0, 1.22), (-0.085, 1.02)], 0.06, (0, 0, 0), R.metal, bevel=0.014)
    box(h, (0.045, 0.72, 0.068), (0, 0.68, 0), R.dark, bevel=0)


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


def bow(S):
    h = S('sock_handR')
    b = pivot(h, 'bowbody', (0, 0, 0), (-PI / 2, 0, 0))   # counter-rotate: vertical in the hand
    box(b, (0.1, 0.26, 0.12), (0, 0, BOW_Z), R.leather, bevel=0.03)                # grip
    for s in (-1, 1):
        box(b, (0.11, 0.05, 0.13), (0, s * 0.14, BOW_Z), R.trim, bevel=0.015)
        limb_chain(b, [(s * y, z + BOW_Z) for y, z in BOW_LIMB], 0.09, 0.075, R.metal)
        box(b, (0.08, 0.06, 0.09), (0, s * 0.74, BOW_Z + 0.14), R.trim, bevel=0.015)  # nocks
        beam(b, (0, s * 0.75, BOW_Z + 0.12), (0, s * 0.85, BOW_Z + 0.12), 0.07, R.trim, w1=0.015)
    box(b, (0.018, 1.24, 0.018), (0, 0, BOW_Z + 0.195), STRING, bevel=0)
    facet_gem(b, 0.03, (0, 0, BOW_Z - 0.065), R.glow)


# Staffs run upright through the front of the fist (socket +Y), not down the forearm axis, with the top
# leaning forward and a touch outward so the shaft clears the forearm and sleeve.
STAFF_GRIP = (0, 0.1, 0)
STAFF_LEAN = (-PI / 2 + 0.2, 0, 0.05)


def staff(S):
    h = S('sock_handR')
    b = pivot(h, 'staffbody', STAFF_GRIP, STAFF_LEAN)
    box(b, (0.11, 1.9, 0.11), (0, 0.3, 0), R.metal, taper=(0.82, 0.82), bevel=0.02)
    box(b, (0.13, 0.24, 0.13), (0, 0.0, 0), R.leather, bevel=0.02)
    for y in (-0.5, 0.72):
        box(b, (0.14, 0.05, 0.14), (0, y, 0), R.trim, bevel=0.012)
    beam(b, (0, -0.64, 0), (0, -0.8, 0), 0.11, R.dark, w1=0.02)                    # iron butt
    box(b, (0.14, 0.12, 0.14), (0, 1.28, 0), R.trim, taper=(1.4, 1.4), bevel=0.02)  # head cup
    for i in range(3):
        a = i * 2 * PI / 3
        x, z = math.cos(a) * 0.1, math.sin(a) * 0.1
        box(b, (0.05, 0.3, 0.05), (x * 1.3, 1.44, z * 1.3), R.dark, rot=(-math.sin(a) * -0.3, 0, math.cos(a) * -0.3), bevel=0.015)
        beam(b, (x * 1.15, 1.57, z * 1.15), (x * 0.8, 1.68, z * 0.8), 0.05, R.dark, w1=0.012)
    facet_gem(b, 0.14, (0, 1.46, 0), R.glow, rot=corner_up(), depth=0.2)


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


# Chest block and the two abdominal lames below it: (centre y, width, height, depth).
CHEST = (0.13, 0.82, 0.36, 0.58)
LAMES = ((-0.1, 0.78, 0.12, 0.56), (-0.21, 0.75, 0.12, 0.54))
BELT_Y = -0.315


def plate_torso(c, seam=R.dark, trim=R.trim, centre=True, back=True, groove=0.016):
    """Cuirass of stacked slabs: a broad chest block (raised centre plate), two stepped abdominal lames, belt,
    tassets and a box gorget. `seam` fills the grooves between the slabs: one colour for all three grooves
    (top first), or a tuple with one colour (or None) per groove; `groove` is how tall those lines are."""
    seams = tuple(seam) if isinstance(seam, (tuple, list)) else (seam,) * 3
    y, w, hgt, d = CHEST
    box(c, (w, hgt, d), (0, y, 0), R.metal, bevel=0.05)
    box(c, (w - 0.14, 0.05, d - 0.1), (0, y + hgt / 2 + 0.01, 0), R.metal, bevel=0.018)       # shoulder yoke step
    if centre:
        box(c, (0.36, 0.28, 0.05), (0, y + 0.01, d / 2 + 0.012), R.metal, taper=(1.4, 1), bevel=0.018)  # raised breastplate
        box(c, (0.06, 0.3, 0.04), (0, y + 0.0, d / 2 + 0.034), R.metal, bevel=0.014)          # keel
        box(c, (0.52, 0.035, 0.06), (0, y + 0.15, d / 2 + 0.014), trim, bevel=0.008)          # neckline edge
    if back:
        box(c, (0.46, 0.26, 0.04), (0, y + 0.01, -d / 2 - 0.008), R.metal, bevel=0.015)      # back plate
    for s in (-1, 1):
        rivet(c, (s * 0.3, y + 0.12, d / 2 + 0.004), trim, 0.02)
        rivet(c, (s * 0.3, y - 0.12, d / 2 + 0.004), trim, 0.02)
    prev = y - hgt / 2
    for i, (ly, lw, lh, ld) in enumerate(LAMES):
        box(c, (lw, lh, ld), (0, ly, 0), R.metal, bevel=0.03)
        if seams[i]:
            box(c, (lw - 0.02, groove, ld - 0.02), (0, prev, 0), seams[i], bevel=0)             # groove line
        prev = ly - lh / 2
    if seams[2]:
        box(c, (0.74, groove, 0.53), (0, prev, 0), seams[2], bevel=0)
    box(c, (0.8, 0.09, 0.57), (0, BELT_Y, 0), R.leather, bevel=0.02)                           # belt
    box(c, (0.13, 0.1, 0.03), (0, BELT_Y, 0.29), trim, bevel=0.012)                            # buckle
    gorget(c, trim)
    plate_tassets(c, trim)


def gorget(c, trim=R.trim, color=R.metal):
    box(c, (0.56, 0.09, 0.5), (0, 0.365, 0), color, bevel=0.028)
    box(c, (0.58, 0.03, 0.52), (0, 0.41, 0), trim, bevel=0.008)


def plate_tassets(c, trim=R.trim):
    """Box tassets hanging from the belt: two front plates of two lames each, hip plates and a rear culet."""
    for s in (-1, 1):
        f = pivot(c, 'tasset', (s * 0.175, -0.36, 0.275), (-0.12, 0, s * 0.03))
        box(f, (0.3, 0.19, 0.05), (0, -0.09, 0), R.metal, bevel=0.018)
        box(f, (0.28, 0.12, 0.05), (0, -0.22, 0.012), R.metal, bevel=0.016)
        box(f, (0.29, 0.03, 0.058), (0, -0.28, 0.012), trim, bevel=0.006)
        rivet(f, (0, -0.05, 0.028), trim, 0.018)
        hp = pivot(c, 'tasset', (s * 0.415, -0.36, 0), (0, 0, s * 0.12))
        box(hp, (0.05, 0.24, 0.36), (0, -0.11, 0), R.metal, bevel=0.016)
        box(hp, (0.058, 0.03, 0.37), (0, -0.225, 0), trim, bevel=0.006)
    cul = pivot(c, 'tasset', (0, -0.36, -0.275), (0.12, 0, 0))
    box(cul, (0.58, 0.2, 0.05), (0, -0.1, 0), R.metal, bevel=0.018)
    box(cul, (0.59, 0.03, 0.058), (0, -0.2, 0), trim, bevel=0.006)


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
# outer side +X) and mirrored for the right. Arm space: sleeve x +-0.125, y -0.29..0.03, z +-0.135, sleeve band at
# y -0.28; the gauntlet cuff rises to y -0.33; the chest block buries everything inside x -0.065.
ARM_SOCKS = (('sock_handL', 1), ('sock_gloveR', -1))
PALM = 0.63
# Lames under the cap stepping down the outside of the upper arm: (size, centre).
ARM_LAMES = (((0.25, 0.085, 0.35), (0.065, -0.07, 0)), ((0.235, 0.08, 0.335), (0.06, -0.14, 0)))


def arm_box(g, s, size, pos, color, rot=(0, 0, 0), **kw):
    """box() in arm space on a palm socket: pos/rot are for the left arm, mirrored when s < 0."""
    return box(g, size, (pos[0] * s, pos[1] + PALM, pos[2]), color, rot=(rot[0], rot[1] * s, rot[2] * s), **kw)


def arm_lames(g, s, colors=(R.metal, R.metal), edge=R.dark):
    """The two lames stepping down the outside of the upper arm, each with a dark line under its lower edge."""
    for (size, pos), col in zip(ARM_LAMES, colors):
        arm_box(g, s, size, pos, col, rot=(0, 0, -0.06), bevel=0.025)
        if edge:
            w, h, d = size
            arm_box(g, s, (w - 0.012, 0.018, d - 0.012), (pos[0], pos[1] - h / 2 - 0.004, pos[2]), edge,
                    rot=(0, 0, -0.06), bevel=0)


def upper_arm_plate(S, color=R.metal, rim=R.trim, edge=R.dark, couter=True):
    """Plate rerebrace round the upper arm down to the gauntlet cuff, the pauldron's lames stepping down its
    outside, a rolled lower rim and a couter over the elbow. Returns [(palm socket, side)]."""
    out = []
    for name, s in ARM_SOCKS:
        g = S(name)
        arm_box(g, s, (0.29, 0.36, 0.31), (0, -0.14, 0), color, bevel=0.035)                    # rerebrace
        if rim:
            arm_box(g, s, (0.305, 0.04, 0.325), (0, -0.305, 0), rim, bevel=0.012)
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
        arm_box(g, s, (0.3, 0.39, 0.32), (0, -0.15, 0), color, bevel=0.03)
        arm_box(g, s, (0.31, 0.045, 0.33), (0, -0.325, 0), hem, bevel=0.01)
        for f, hw in faces(pivot(g, 'sleeve', (0, PALM - 0.15, 0)), 0.15, 0.16):
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


def scale_rows(f, half_w, rows, colors, gap_color, w=0.1, lift=0.004, flare=0.026, gap=0.06, pattern=None, nm='scale'):
    """Overlapping rows of small flat scale plates on a flat face (frame from faces(): local +Z out). rows =
    [(bottom y, top y)]; plates `w` wide, alternate rows shifted half a plate. Each plate lies on the face at its
    top edge and stands `flare` off it at its bottom edge, so each row overlaps the top of the row below, and a
    `gap_color` lip closes its bottom edge (the dark gap between rows). `pattern(i, j)` picks each plate's colour.
    One mesh per colour."""
    polys = {}

    def add(col, pts, want):
        v = [Vector(p_) for p_ in pts]
        nrm = (v[1] - v[0]).cross(v[2] - v[0])
        polys.setdefault(col, []).append(pts if nrm.dot(Vector(want)) >= 0 else pts[::-1])
    for j, (y0, y1) in enumerate(rows):
        n = int(half_w * 2 / w) + 2
        x0 = -half_w - (w / 2 if j % 2 else 0)
        for i in range(n):
            a, b = x0 + i * w + gap * w / 2, x0 + (i + 1) * w - gap * w / 2
            a, b = max(a, -half_w), min(b, half_w)
            if b - a < w * 0.3:
                continue
            col = colors[(pattern(i, j) if pattern else 0) % len(colors)]
            cw, ch = (b - a) * 0.22, (y1 - y0) * 0.3                    # clipped lower corners: a scale, not a brick

            def z(y):
                return lift + flare * (y1 - y) / (y1 - y0)
            outline = [(a, y1), (a, y0 + ch), (a + cw, y0), (b - cw, y0), (b, y0 + ch), (b, y1)]
            add(col, [(x, y, z(y)) for x, y in outline], (0, flare, 1))
            mid = Vector(((a + b) / 2, (y0 + y1) / 2, 0))
            for (xa, ya), (xb, yb) in (outline[2:4],):                     # lip along the lower edge
                out_ = Vector(((xa + xb) / 2, (ya + yb) / 2, 0)) - mid
                add(gap_color, [(xa, ya, z(ya)), (xb, yb, z(yb)), (xb, yb, 0.0), (xa, ya, 0.0)], tuple(out_))
    out = []
    for col, ps in polys.items():
        bm = bmesh.new()
        for pts in ps:
            bm.faces.new([bm.verts.new(p_) for p_ in pts])
        o = _common._mesh_obj(bm, f, (0, 0, 0), (0, 0, 0), col)
        o.name = nm
        out.append(o)
    return out


def plate_gauntlet(g, s, cuff_rim=R.trim):
    """Box gauntlet: fist block, stepped knuckle plate, back plate, square thumb and a flared square cuff."""
    box(g, (0.31, 0.26, 0.31), (0, -0.01, 0), R.metal, bevel=0.05)
    box(g, (0.33, 0.08, 0.33), (0, -0.1, 0.005), R.metal, bevel=0.014)                         # knuckle lame
    box(g, (0.335, 0.025, 0.335), (0, -0.05, 0.005), R.dark, bevel=0)                          # knuckle gap
    box(g, (0.04, 0.15, 0.22), (s * 0.165, 0.0, 0), R.metal, bevel=0.012)                      # back-of-hand plate
    box(g, (0.125, 0.185, 0.135), (-s * 0.07, 0.03, 0.168), R.metal, rot=(0.3, 0, 0), bevel=0.03)  # thumb
    box(g, (0.28, 0.2, 0.3), (0, 0.2, 0), R.metal, taper=(1.12, 1.1), bevel=0.028)            # cuff
    box(g, (0.33, 0.04, 0.35), (0, 0.3, 0), cuff_rim, bevel=0.01)


def plate_sabaton(f, knee=True, rim=R.trim):
    """Box sabaton and greave: foot block with a stepped instep plate and toe, square greave with a shin ridge,
    rimmed top and a block knee cop."""
    box(f, (0.34, 0.19, 0.44), (0, -0.075, 0.055), R.metal, bevel=0.045)
    box(f, (0.3, 0.06, 0.22), (0, 0.035, 0.14), R.metal, bevel=0.018)                        # instep step
    box(f, (0.32, 0.13, 0.1), (0, -0.09, 0.265), R.metal, taper=(0.92, 0.7), bevel=0.025)      # toe
    box(f, (0.36, 0.035, 0.47), (0, -0.166, 0.06), R.dark, bevel=0)                          # sole
    box(f, (0.32, 0.32, 0.33), (0, 0.2, 0), R.metal, taper=(1.06, 1.06), bevel=0.03)         # greave
    box(f, (0.12, 0.28, 0.04), (0, 0.2, 0.175), R.metal, bevel=0.012)                        # shin ridge
    box(f, (0.35, 0.04, 0.365), (0, 0.365, 0), rim, bevel=0.01)
    if knee:
        box(f, (0.27, 0.15, 0.08), (0, 0.45, 0.175), R.metal, bevel=0.025)                  # knee cop
        box(f, (0.14, 0.07, 0.03), (0, 0.45, 0.22), rim, bevel=0.01)


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
        rivet(h, (s * 0.2, 0.11, 0.304), stud, 0.018)
        rivet(h, (s * 0.2935, 0.11, 0.12), stud, 0.018, rot=(PI / 4, PI / 2, 0))
    if nasal:
        box(h, (0.07, 0.21, 0.04), (0, 0.0, 0.312), nasal, taper=(1.3, 1), bevel=0.012)      # nasal bar


def helm_open(S):
    """Med helm."""
    open_helm(S('sock_head'))


def helm_full(S):
    """Full helm, cube over cube: a box shell over the head cube with a smaller block on top crowned by a low
    crest dyed like the wearer's tunic (ROLE_cloth), a riveted brow band and a visor of two face plates with a
    centre ridge and breaths; the eye slit is the gap between the blocks."""
    h = S('sock_head')
    box(h, (0.58, 0.5, 0.6), (0, 0.02, 0.01), R.metal, bevel=0.04)                           # shell
    box(h, (0.46, 0.08, 0.48), (0, 0.3, 0.01), R.metal, bevel=0.024)                          # top block
    box(h, (0.2, 0.035, 0.4), (0, 0.353, 0.0), R.trim, bevel=0.01)                            # top ridge
    box(h, (0.08, 0.12, 0.4), (0, 0.425, -0.02), R.cloth, taper=(1, 0.8), bevel=0.022)         # dyed crest
    box(h, (0.6, 0.065, 0.62), (0, 0.145, 0.01), R.trim, bevel=0.014)                         # brow band
    box(h, (0.6, 0.05, 0.62), (0, -0.205, 0.01), R.trim, bevel=0.012)                         # lower rim
    box(h, (0.5, 0.3, 0.02), (0, -0.03, 0.31), SLIT, bevel=0)                                 # slit backing
    box(h, (0.055, 0.27, 0.03), (0, -0.07, 0.356), R.trim, bevel=0.01)                        # centre ridge
    for s in (-1, 1):
        box(h, (0.242, 0.27, 0.045), (s * 0.133, -0.07, 0.325), R.metal, bevel=0.014)         # face plate
        for x in (0.08, 0.21):
            rivet(h, (s * x, 0.145, 0.323), R.dark, 0.018)
        for z in (-0.16, 0.16):
            rivet(h, (s * 0.303, 0.145, z), R.dark, 0.018, rot=(PI / 4, PI / 2, 0))
        for k in range(3):                                                                     # breaths
            box(h, (0.07, 0.02, 0.02), (s * 0.12, -0.11 - k * 0.045, 0.348), SLIT, bevel=0)


# ─── Body armour (sock_chest + shoulders) ────────────────────────────────────

# Mail link rows on the hauberk: body block and skirt block (the skirt tapers in, so its rows sit a little out).
MAIL_BODY_ROWS = [-0.3 + 0.05 * k for k in range(12)]
MAIL_SKIRT_ROWS = (-0.56, -0.51, -0.46)


def hauberk(c, mail=R.metal, dark=R.dark, belt=R.leather, buckle=R.trim, collar=None, links=True):
    """Box mail shirt from the collar to a short skirt block, with a belt, hem and collar, covered in fine
    staggered rows of flat links (mail on the metal tiers, stitched leather on the leather set)."""
    box(c, (0.78, 0.66, 0.52), (0, -0.01, 0), mail, bevel=0.045)
    box(c, (0.8, 0.26, 0.54), (0, -0.47, 0), mail, taper=(0.96, 0.96), bevel=0.035)          # skirt block
    box(c, (0.82, 0.04, 0.56), (0, -0.585, 0), dark, bevel=0.01)                             # hem
    box(c, (0.5, 0.07, 0.44), (0, 0.345, 0), collar or dark, bevel=0.02)                     # collar
    box(c, (0.82, 0.085, 0.56), (0, -0.37, 0), belt, bevel=0.02)
    box(c, (0.13, 0.1, 0.03), (0, -0.37, 0.285), buckle, bevel=0.012)
    if not links:
        return
    for f, hw in faces(c, 0.39, 0.26):
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
    box(c, (0.76, 0.64, 0.5), (0, -0.01, 0), R.dark, bevel=0.04)                               # underlayer
    fr, bk, sl, sr = faces(c, 0.38, 0.25)
    for s in (-1, 1):
        panel_stitched(fr[0], s * 0.18, 0.15, 0.33, 0.3)                                          # chest panels
        panel_stitched(fr[0], s * 0.18, -0.17, 0.33, 0.28)                                        # belly panels
        panel_stitched(bk[0], s * 0.18, -0.01, 0.33, 0.6)                                         # back panels
    for f, hw in (sl, sr):
        panel_stitched(f, 0, -0.01, 0.44, 0.6)
    # stand-up collar with a darker rim over a shoulder yoke
    box(c, (0.52, 0.11, 0.44), (0, 0.35, -0.01), R.metal, bevel=0.025)
    box(c, (0.54, 0.035, 0.46), (0, 0.41, -0.01), R.trim, bevel=0.01)
    box(c, (0.7, 0.05, 0.46), (0, 0.32, -0.01), R.metal, bevel=0.018)                        # shoulder yoke
    # strap from the left shoulder across the chest to the right hip, with a brass buckle
    st = pivot(c, 'strap', (0, 0.02, 0.3), (0, 0, 0.62))
    box(st, (0.1, 0.72, 0.03), (0, 0, 0), R.trim, bevel=0.01)
    box(st, (0.13, 0.11, 0.03), (0, -0.05, 0.012), BRASS, bevel=0.012)
    box(st, (0.07, 0.05, 0.03), (0, -0.05, 0.02), R.trim, bevel=0)
    stb = pivot(c, 'strap', (0, 0.02, -0.3), (0, 0, 0.62))
    box(stb, (0.1, 0.72, 0.03), (0, 0, 0), R.trim, bevel=0.01)
    box(c, (0.8, 0.085, 0.54), (0, -0.33, 0), R.trim, bevel=0.02)                              # belt
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
        arm_box(g, s, (0.29, 0.38, 0.31), (0, -0.15, 0), R.metal, bevel=0.03)
        arm_box(g, s, (0.3, 0.045, 0.32), (0, -0.325, 0), R.dark, bevel=0.01)
        arm_box(g, s, (0.305, 0.05, 0.325), (0, -0.2, 0), R.trim, bevel=0.01)                  # strap
        arm_lames(g, s, (R.metal, R.metal), R.dark)


def plate_crafting(c, trim=R.trim, dark=R.dark, cloth=R.cloth):
    """Smith's detail on the plate cuirass that still reads from the game camera: a trim ridge down the
    breastplate with a crest boss, trim edges along the breastplate's slanted sides and a trim band with dark
    rivets under the chest block, a dark mail skirt under the tassets, and a cloth tabard hanging from the belt
    (ROLE_cloth: it takes the wearer's tunic colour) so the knight is not one grey mass."""
    y, w, hgt, d = CHEST
    zf = d / 2
    box(c, (0.07, 0.3, 0.03), (0, y - 0.005, zf + 0.06), trim, bevel=0.01)                     # central ridge
    for s in (-1, 1):                                                                            # breastplate side edges
        box(c, (0.05, 0.3, 0.03), (s * 0.214, y + 0.005, zf + 0.03), trim, rot=(0, 0, -s * 0.25), bevel=0.01)
    box(c, (0.16, 0.16, 0.03), (0, y + 0.07, zf + 0.07), dark, rot=(0, 0, PI / 4), bevel=0.012)     # crest: dark lozenge
    box(c, (0.1, 0.1, 0.03), (0, y + 0.07, zf + 0.085), trim, rot=(0, 0, PI / 4), bevel=0.014)      # raised trim boss
    box(c, (0.06, 0.26, 0.02), (0, y + 0.01, -zf - 0.035), trim, bevel=0.008)                   # back ridge
    for s in (-1, 1):                                                                            # back straps and buckles
        box(c, (0.075, hgt + 0.02, 0.02), (s * 0.2, y, -zf - 0.05), R.leather, bevel=0.006)
        box(c, (0.1, 0.07, 0.02), (s * 0.2, y - 0.07, -zf - 0.062), trim, bevel=0.008)
    by = y - hgt / 2 + 0.03
    box(c, (w + 0.014, 0.05, d + 0.014), (0, by, 0), trim, bevel=0.012)                        # trim band under the chest
    for x in (-0.33, -0.2, 0.2, 0.33):
        rivet(c, (x, by, zf + 0.012), dark, 0.016)
    # dark mail skirt under the tassets: shows between the plates and at the hips
    sk = pivot(c, 'mail_skirt', (0, -0.49, 0))
    box(sk, (0.76, 0.26, 0.47), (0, 0, 0), dark, bevel=0.02)
    mail_links(faces(sk, 0.38, 0.235, sides=False)[0][0], 0.35, (-0.1, -0.04, 0.02), R.metal, hgt=0.012)
    # tabard: a cloth panel falling from the belt between the front tassets, a shorter one at the back
    for z, tilt, ln in ((0.29, -0.12, 0.34), (-0.29, 0.12, 0.28)):
        s = 1 if z > 0 else -1
        f = pivot(c, 'tabard', (0, -0.355, z), (tilt, 0, 0))
        box(f, (0.27, ln, 0.03), (0, -ln / 2, s * 0.045), cloth, bevel=0.01)
        box(f, (0.28, 0.04, 0.036), (0, -ln + 0.03, s * 0.045), trim, bevel=0.008)            # hem stripe
        if z > 0:
            box(f, (0.09, 0.09, 0.02), (0, -0.14, 0.064), trim, rot=(0, 0, PI / 4), bevel=0.008)  # device


def body_plate(S):
    """Platebody (the plate sets in plate_variants.py build on this: set P is exactly it): stacked-slab cuirass
    with a crested breastplate, trim bands and rivet rows, back straps, a dark mail skirt and a cloth tabard,
    pauldron caps with a trim ridge, and lames, rerebraces and couters down the upper arms."""
    c = S('sock_chest')
    plate_torso(c, groove=0.032)
    plate_crafting(c)
    for s in (1, -1):
        block_pauldron(S, s, top=R.trim)
    upper_arm_plate(S)


# ─── Gloves & boots ──────────────────────────────────────────────────────────

def gloves(S):
    for name, s in (('sock_handL', 1), ('sock_gloveR', -1)):
        g = S(name)
        box(g, (0.31, 0.28, 0.31), (0, -0.015, 0), R.metal, bevel=0.06)                   # fist
        box(g, (0.33, 0.06, 0.33), (0, -0.09, 0), R.dark, bevel=0.012)                    # knuckle band
        box(g, (0.03, 0.14, 0.2), (s * 0.165, 0.01, 0), R.trim, bevel=0.01)               # back plate
        box(g, (0.11, 0.16, 0.12), (-s * 0.07, 0.03, 0.155), R.metal, rot=(0.3, 0, 0), bevel=0.03)  # thumb
        box(g, (0.27, 0.19, 0.29), (0, 0.2, 0), R.metal, taper=(1.18, 1.14), bevel=0.035) # flared cuff
        box(g, (0.33, 0.045, 0.35), (0, 0.3, 0), R.trim, bevel=0.012)
        rivet(g, (s * 0.17, 0.2, 0), R.trim, 0.022, rot=(PI / 4, PI / 2, 0))


def boots(S):
    for name in ('sock_footL', 'sock_footR'):
        f = S(name)
        box(f, (0.35, 0.19, 0.46), (0, -0.075, 0.055), R.metal, bevel=0.05)                # foot
        box(f, (0.36, 0.04, 0.48), (0, -0.162, 0.055), R.dark, bevel=0.01)                 # sole
        box(f, (0.33, 0.13, 0.16), (0, -0.08, 0.235), R.metal, taper=(0.9, 0.8), bevel=0.04)  # toe cap
        box(f, (0.34, 0.035, 0.18), (0, -0.02, 0.23), R.trim, bevel=0.01)
        box(f, (0.32, 0.34, 0.34), (0, 0.15, 0), R.metal, taper=(1.08, 1.06), bevel=0.04)  # shaft
        box(f, (0.34, 0.04, 0.36), (0, 0.1, 0), R.dark, bevel=0)                           # strap
        box(f, (0.2, 0.26, 0.05), (0, 0.17, 0.185), R.metal, bevel=0.02)                   # shin plate
        box(f, (0.38, 0.08, 0.4), (0, 0.33, 0), R.trim, bevel=0.02)                        # cuff
        rivet(f, (0, 0.2, 0.215), R.trim, 0.022)


# ─── Uniques ─────────────────────────────────────────────────────────────────
# Own authored colours; metal parts are metallic() so the game gives them the forged-metal finish.
EMBER = 0xFF6A1A
EMBER_HOT = 0xFFC050
CHAR = 0x2A2326
CHAR2 = 0x3E3436
GOLD = 0xD9A640
BRONZE = 0x9A6432
MAIL = 0x5A5E66
BONE = 0xEEE4CC
SCALE = 0xB42A1E
SCALE_DK = 0x6E1812
SCALE_MID = 0x9A2218


def u_cinderfang(S):
    h = S('sock_handR')
    grip(h, -0.21, 0.21, 0.1, 0x4A1614, (-0.13, -0.01, 0.11), metallic(CHAR))       # blood-red grip
    beam(h, (0, -0.22, 0), (0, -0.38, 0), 0.13, metallic(CHAR2), w1=0.02)             # claw pommel
    facet_gem(h, 0.06, (0, -0.25, 0), EMBER, emissive=EMBER, strength=4, rot=corner_up(), depth=0.087)
    box(h, (0.2, 0.17, 0.16), (0, 0.24, 0), metallic(CHAR), bevel=0.04)            # jaw guard
    for s in (-1, 1):
        prism(h, [(0, -0.05), (0.34, 0.04), (0.42, 0.2), (0.3, 0.1), (0, 0.07)], 0.1, (s * 0.06, 0.24, 0), metallic(CHAR2),
              rot=(0, 0 if s > 0 else PI, 0), bevel=0.012)                           # horn quillons
        beam(h, (s * 0.07, 0.31, 0.07), (s * 0.07, 0.4, 0.07), 0.05, BONE, w1=0.01)     # fangs
    facet_gem(h, 0.05, (0, 0.24, 0.085), EMBER, emissive=EMBER, strength=5)
    blade = [(-0.1, 0.3), (0.1, 0.3), (0.13, 0.52), (0.1, 0.56), (0.13, 0.78), (0.09, 0.82), (0.11, 1.02),
             (0.06, 1.2), (-0.02, 1.38), (-0.1, 1.46), (-0.07, 1.3), (-0.09, 1.1), (-0.12, 0.9), (-0.09, 0.86),
             (-0.12, 0.66), (-0.09, 0.62), (-0.12, 0.42)]
    prism(h, blade, 0.06, (0, 0, 0), metallic(CHAR2), bevel=0.012)
    prism(h, [(-0.02, 0.32), (0.025, 0.32), (0.035, 0.8), (0.012, 1.1), (-0.04, 1.28), (-0.02, 1.0), (-0.03, 0.7)], 0.072, (0, 0, 0), EMBER, emissive=EMBER, strength=4)
    for y, s in ((0.54, 1), (0.8, 1), (0.64, -1), (0.88, -1)):
        box(h, (0.05, 0.022, 0.074), (s * 0.07, y, 0), EMBER_HOT, rot=(0, 0, s * 0.5), emissive=EMBER_HOT, strength=4, bevel=0)  # vein cracks


def u_emberstring(S):
    h = S('sock_handR')
    b = pivot(h, 'bowbody', (0, 0, 0), (-PI / 2, 0, 0))
    z0 = BOW_Z
    box(b, (0.11, 0.26, 0.13), (0, 0, z0), 0x4A1614, bevel=0.03)
    facet_gem(b, 0.05, (0, 0, z0 - 0.07), EMBER, emissive=EMBER, strength=5, rot=(0, PI / 4, 0))
    for s in (-1, 1):
        box(b, (0.12, 0.05, 0.14), (0, s * 0.14, z0), metallic(GOLD), bevel=0.015)
        limb_chain(b, [(s * y, z + z0) for y, z in BOW_LIMB], 0.1, 0.08, CHAR2)
        for (y, z) in BOW_LIMB[1:4]:
            beam(b, (0, s * y, z + z0 - 0.02), (0, s * (y + 0.05), z + z0 - 0.15), 0.06, metallic(GOLD), w1=0.012)  # back barbs
        beam(b, (0, s * 0.74, z0 + 0.12), (0, s * 0.92, z0 + 0.04), 0.09, EMBER, w1=0.02, emissive=EMBER, strength=4)  # flame tips
        box(b, (0.09, 0.07, 0.1), (0, s * 0.74, z0 + 0.14), metallic(GOLD), bevel=0.015)
    box(b, (0.026, 1.24, 0.026), (0, 0, z0 + 0.195), EMBER_HOT, emissive=EMBER, strength=6, bevel=0)  # burning string


def u_kindled_ash(S):
    """Pale ash staff; four blackened block claws rise from a collar and bend in around a dragon's ember heart."""
    h = S('sock_handR')
    b = pivot(h, 'staffbody', STAFF_GRIP, STAFF_LEAN)
    box(b, (0.12, 1.72, 0.12), (0, 0.21, 0), 0x9A9088, taper=(0.8, 0.8), bevel=0.02)  # pale ash wood
    for y in (-0.45, 0.35, 0.8):
        box(b, (0.14, 0.05, 0.14), (0, y, 0), metallic(CHAR), bevel=0.012)
    box(b, (0.14, 0.24, 0.14), (0, 0.0, 0), 0x4A1614, bevel=0.02)
    beam(b, (0, -0.66, 0), (0, -0.84, 0), 0.12, metallic(CHAR), w1=0.02)
    box(b, (0.18, 0.14, 0.18), (0, 1.12, 0), metallic(CHAR), taper=(1.3, 1.3), bevel=0.02)  # claw collar
    box(b, (0.26, 0.04, 0.26), (0, 1.2, 0), metallic(BRONZE), bevel=0.01)
    for i in range(4):
        a = i * PI / 2 + PI / 4
        d = Vector((math.cos(a), 0, math.sin(a)))
        pts = [d * 0.08 + Vector((0, 1.18, 0)), d * 0.18 + Vector((0, 1.32, 0)), d * 0.19 + Vector((0, 1.48, 0)), d * 0.07 + Vector((0, 1.64, 0))]
        for k, (p0, p1, w0, w1) in enumerate(zip(pts, pts[1:], (0.075, 0.065, 0.05), (0.065, 0.05, 0.012))):
            beam(b, tuple(p0 - (p1 - p0).normalized() * 0.02), tuple(p1), w0, metallic(CHAR), w1=w1)
    facet_gem(b, 0.13, (0, 1.42, 0), EMBER, emissive=EMBER, strength=5, rot=corner_up(), depth=0.19)  # ember heart
    facet_gem(b, 0.06, (0, 1.45, 0.1), EMBER_HOT, emissive=EMBER_HOT, strength=6)
    beam(b, (0, 1.5, 0), (0, 1.7, 0), 0.09, EMBER_HOT, w1=0.015, emissive=EMBER, strength=5)  # flame tongue


def flame_tine(f, k, lean):
    """Stepped block flame on a crown band (frame local: +Y up the flame, +Z out of the band)."""
    t = pivot(f, 'tine', (0, 0, 0), (lean, 0, 0))
    box(t, (0.08 * k, 0.1 * k, 0.03), (0, 0.05 * k, 0), metallic(BRONZE), bevel=0.01)
    box(t, (0.058 * k, 0.08 * k, 0.028), (0.012 * k, 0.13 * k, 0), metallic(BRONZE), rot=(0, 0, -0.12), bevel=0.009)
    beam(t, (0.014 * k, 0.16 * k, 0), (-0.012 * k, 0.25 * k, 0), 0.045 * k, metallic(BRONZE), d=0.026, w1=0.008, d1=0.02)
    box(t, (0.032 * k, 0.13 * k, 0.036), (0.004 * k, 0.09 * k, 0), EMBER, emissive=EMBER, strength=2, bevel=0)


def u_ashen_crown(S):
    """Open-faced charred helm with a bronze band crowned by stepped block flame tines (the tallest pair either
    side of an ember brow gem), embers glowing through the charred top."""
    h = S('sock_head')
    open_helm(h, shell=metallic(CHAR), rim=metallic(BRONZE), nasal=None, stud=metallic(BRONZE))
    band = pivot(h, 'band', (0, 0.143, -0.005))   # top of the rim band
    fr, bk, sl, sr = faces(band, 0.2925, 0.3025)
    for x, k in ((-0.2, 0.8), (-0.085, 1.15), (0.085, 1.15), (0.2, 0.8)):
        flame_tine(pivot(fr[0], 'tine_at', (x, 0, 0)), k, 0.22)
    for x in (-0.12, 0.12):
        flame_tine(pivot(bk[0], 'tine_at', (x, 0, 0)), 0.7, 0.22)
    for f, _ in (sl, sr):
        for x in (-0.12, 0.12):
            flame_tine(pivot(f, 'tine_at', (x, 0, 0)), 0.75, 0.22)
    box(h, (0.1, 0.1, 0.024), (0, 0.11, 0.31), metallic(BRONZE), rot=(0, 0, PI / 4), bevel=0.01)   # gem setting
    facet_gem(h, 0.048, (0, 0.11, 0.327), EMBER_HOT, emissive=EMBER, strength=5)                    # brow gem
    for x, z, ln in ((-0.1, 0.06, 0.14), (0.02, -0.02, 0.1), (0.11, -0.1, 0.12)):     # a crack of embers across the charred top
        box(h, (0.02, 0.012, ln), (x, 0.366, z), EMBER, rot=(0, 2.0 + x, 0), emissive=EMBER, strength=3, bevel=0)


def scale_plate(f, x, y, color, w=0.11, hgt=0.12, tilt=-0.28):
    """Pointed dragon scale laid on a face frame (local +Z out), its lower point standing off the surface."""
    pts = [(-w / 2, hgt * 0.42), (w / 2, hgt * 0.42), (w / 2, -hgt * 0.04), (0, -hgt * 0.62), (-w / 2, -hgt * 0.04)]
    return prism(f, pts, 0.024, (x, y, 0.016), color, rot=(tilt, 0, 0))


SCALE_GAP = 0x3A0E0A


def _scale_mix(i, j):
    """Two close reds scattered over the scales (no stripes or checks)."""
    return 1 if (i * 7 + j * 3) % 5 < 2 else 0


def u_scaleguard(S):
    """Hauberk of shed dragon scales: overlapping rows of small flat scale plates (two close reds, each standing
    out a little at its lower edge, a dark gap under every row) all round a dark mail box cuirass and over the
    skirt; gold collar and buckle; blocky scale shoulder caps with swept-back bone horns, red scale lames down a
    dark mail sleeve."""
    c = S('sock_chest')
    hauberk(c, mail=metallic(CHAR2), dark=metallic(CHAR), belt=0x3A2A22, buckle=metallic(GOLD), collar=metallic(GOLD), links=False)
    body = [(-0.33 + 0.09 * k, -0.33 + 0.09 * k + 0.115) for k in range(7)]
    skirt = [(-0.59, -0.49), (-0.505, -0.405)]
    for f, hw in faces(c, 0.39, 0.26):
        scale_rows(f, hw - 0.005, body, [SCALE, SCALE_MID], SCALE_GAP, w=0.13, flare=0.032, gap=0.04, pattern=_scale_mix)
        scale_rows(pivot(f, 'skirt_face', (0, 0, 0.01)), hw - 0.005, skirt, [SCALE, SCALE_MID], SCALE_GAP, w=0.13, flare=0.032, gap=0.04,
                   pattern=lambda i, j: _scale_mix(i, j + 1), nm='skirt_scale')
    for s in (1, -1):
        top = block_pauldron(S, s, color=SCALE, top=SCALE_DK, edge=metallic(GOLD), rivets=None)[0]
        beam(top, (-s * 0.04, 0.06, -0.08), (s * 0.02, 0.15, -0.24), 0.06, BONE, w1=0.03)        # swept-back horn
        beam(top, (s * 0.02, 0.145, -0.235), (s * 0.05, 0.16, -0.36), 0.035, BONE, w1=0.008)
    for g, s in mail_sleeve(S, color=metallic(CHAR2), hem=metallic(GOLD), link=metallic(CHAR)):
        arm_lames(g, s, (SCALE, SCALE_MID), SCALE_GAP)


GEAR = {
    'sword': sword, 'longsword': longsword, 'pickaxe': pickaxe, 'bow': bow, 'staff': staff,
    'helm_open': helm_open, 'helm_full': helm_full, 'body_chain': body_chain, 'body_plate': body_plate,
    'body_leather': body_leather,
    'gloves': gloves, 'boots': boots,
    'u_cinderfang': u_cinderfang, 'u_emberstring': u_emberstring, 'u_kindled_ash': u_kindled_ash,
    'u_ashen_crown': u_ashen_crown, 'u_scaleguard': u_scaleguard,
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
        preview_auto(f'gear_{model}.png')
        remove_preview_rig()
    result = {'ok': True, 'tris': tris}
