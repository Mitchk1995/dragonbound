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


# The cuirass is a few big clean slabs, readable at the gameplay camera (the owner's rule: fewer, bolder surfaces;
# no ridges, lames, grooves or trim bands): a broad chest block, one narrower waist block under it, a belt, a
# gorget, and single-slab tassets. (centre y, width, height, depth)
CHEST = (0.12, 0.8, 0.4, 0.58)
WAIST = (-0.17, 0.74, 0.2, 0.54)
BELT_Y = -0.3


def plate_torso(c, color=R.metal, belt=R.leather):
    """Plate cuirass in four slabs: chest block (a little broader at the top), waist block, belt and gorget, with
    single-slab tassets below."""
    y, w, hgt, d = CHEST
    box(c, (w, hgt, d), (0, y, 0), color, taper=(1.06, 1.0), bevel=0.06)
    y, w, hgt, d = WAIST
    box(c, (w, hgt, d), (0, y, 0), color, bevel=0.04)
    box(c, (0.78, 0.08, 0.57), (0, BELT_Y, 0), belt, bevel=0.02)                               # belt
    box(c, (0.52, 0.13, 0.46), (0, 0.37, 0), color, bevel=0.035)                               # gorget
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


def upper_arm_plate(S, color=R.metal, rim=None, edge=None, couter=False, lames=True):
    """Plate rerebrace round the upper arm down to the gauntlet cuff (optionally the pauldron's lames stepping down its
    outside, a lower rim and a couter over the elbow). Returns [(palm socket, side)]."""
    out = []
    for name, s in ARM_SOCKS:
        g = S(name)
        arm_box(g, s, (0.29, 0.36, 0.31), (0, -0.14, 0), color, bevel=0.035)                    # rerebrace
        if rim:
            arm_box(g, s, (0.305, 0.04, 0.325), (0, -0.305, 0), rim, bevel=0.012)
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


def plate_gauntlet(g, s, cuff_rim=None):
    """Box gauntlet in three blocks: fist, square thumb and a flared cuff (optionally rimmed)."""
    box(g, (0.32, 0.27, 0.32), (0, -0.01, 0), R.metal, bevel=0.055)
    box(g, (0.125, 0.185, 0.135), (-s * 0.07, 0.03, 0.17), R.metal, rot=(0.3, 0, 0), bevel=0.03)   # thumb
    box(g, (0.29, 0.21, 0.31), (0, 0.2, 0), R.metal, taper=(1.14, 1.12), bevel=0.03)             # cuff
    if cuff_rim:
        box(g, (0.34, 0.04, 0.36), (0, 0.3, 0), cuff_rim, bevel=0.01)


def plate_sabaton(f, knee=True, rim=None):
    """Box sabaton and greave: a foot block with a tapered toe, a square greave and a block knee cop."""
    box(f, (0.34, 0.22, 0.48), (0, -0.08, 0.045), R.metal, bevel=0.035)
    box(f, (0.32, 0.15, 0.1), (0, -0.105, 0.265), R.metal, taper=(0.92, 0.7), bevel=0.03)      # toe
    box(f, (0.33, 0.34, 0.34), (0, 0.2, 0), R.metal, taper=(1.06, 1.06), bevel=0.035)         # greave
    if rim:
        box(f, (0.36, 0.04, 0.375), (0, 0.37, 0), rim, bevel=0.01)
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


def plate_accent(c, tabard=R.cloth, under=R.dark):
    """The plate's one accent: a plain tabard falling from the belt between the tassets (ROLE_cloth: it takes the
    wearer's tunic colour, so the knight is not one grey mass), over a plain dark under-skirt that shows between the
    plates at the hips."""
    box(c, (0.78, 0.28, 0.49), (0, -0.49, 0), under, bevel=0.02)
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
MEMBRANE = 0x4A2024       # Emberstring's wings: dark wyrm hide


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
    pale chest and skull carry the read; no tassets or front plates over the thighs."""
    c = S('sock_chest')
    obs = obsidian()
    y, w, hgt, d = CHEST
    box(c, (w + 0.02, hgt + 0.02, d + 0.02), (0, y, 0), BONE, taper=(1.06, 1.0), bevel=0.07)      # breastplate
    y, w, hgt, d = WAIST
    box(c, (w, hgt, d), (0, y, 0), obs, bevel=0.04)                                                   # waist
    box(c, (0.79, 0.085, 0.58), (0, BELT_Y, 0), GRIP, bevel=0.02)                                     # belt
    box(c, (0.12, 0.1, 0.03), (0, BELT_Y, 0.29), BONE, bevel=0.012)                                   # bone buckle
    box(c, (0.52, 0.13, 0.46), (0, 0.37, 0), obs, bevel=0.035)                                        # gorget
    box(c, (0.78, 0.26, 0.55), (0, -0.47, 0), obs, bevel=0.03)                                        # under-skirt
    # Keep the skull's rear edge within the shoulder envelope (-0.22 in socket-local Z).
    # A small forward seat preserves the skull and horn shapes without sweeping behind the hero.
    dragon_skull(pivot(S('sock_shoulderL'), 'skull', (0.08, 0.05, 0.03), (0, 0, -0.22)))
    block_pauldron(S, -1, color=BONE, top=None, edge=None, rivets=None)
    for name, s in ARM_SOCKS:
        g = S(name)
        arm_box(g, s, (0.29, 0.36, 0.31), (0, -0.14, 0), obs, bevel=0.035)                          # rerebrace
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
    """The Ashen Crown: a crown of five dragon horns on a broad bone band (the tallest over the brow, a pair
    flaring out at the front corners, a shorter pair behind), over a low obsidian cap with a neck guard and cheek
    plates; a bone plate tops the cap, so the head reads pale inside the ring of horns from the gameplay camera. One ember gem in the band under the front horn. The face stays open."""
    h = S('sock_head')
    obs = obsidian()
    box(h, (0.56, 0.2, 0.58), (0, 0.21, -0.005), obs, bevel=0.045)                                  # cap
    box(h, (0.44, 0.06, 0.46), (0, 0.32, -0.005), BONE_DK, bevel=0.02)                              # bone crown plate on top
    box(h, (0.56, 0.24, 0.07), (0, -0.03, -0.265), obs, bevel=0.022)                                # neck guard
    for s in (-1, 1):
        box(h, (0.07, 0.22, 0.25), (s * 0.28, -0.01, -0.075), obs, bevel=0.022)                     # cheek plate
    box(h, (0.63, 0.12, 0.65), (0, 0.14, -0.005), BONE, bevel=0.03)                                 # crown band
    for deg, ln, w in ((0, 0.42, 0.12), (52, 0.33, 0.1), (-52, 0.33, 0.1), (128, 0.22, 0.085), (-128, 0.22, 0.085)):
        a = math.radians(deg)
        ca, sa = math.cos(a), math.sin(a)
        r = 1 / max(abs(sa) / 0.29, abs(ca) / 0.3)                                                   # onto the band's square
        horn_point(h, a, r, 0.19, ln, w)
    box(h, (0.12, 0.12, 0.03), (0, 0.14, 0.327), obs, rot=(0, 0, PI / 4), bevel=0.012)               # gem setting
    facet_gem(h, 0.05, (0, 0.14, 0.345), EMBER_HOT, emissive=EMBER, strength=5)                     # ember gem


def u_cinderfang(S):
    """Cinderfang: one great dragon fang for a blade, pale bone curving gently to its point with a molten ember core
    showing down its middle, set in an obsidian jaw guard with two bone horn quillons and an ember gem; a bone claw
    pommel. Big, clean shapes that read in the hand."""
    h = S('sock_handR')
    obs = obsidian()
    grip(h, -0.21, 0.21, 0.1, GRIP, (-0.13, -0.01, 0.11), obs)
    beam(h, (0, -0.22, 0), (0, -0.4, 0), 0.14, BONE, w1=0.025)                                        # claw pommel
    box(h, (0.24, 0.16, 0.18), (0, 0.24, 0), obs, bevel=0.04)                                         # jaw guard
    for s in (-1, 1):
        prism(h, [(0, -0.06), (0.32, -0.02), (0.44, 0.18), (0.29, 0.09), (0, 0.07)], 0.09, (s * 0.07, 0.24, 0), BONE,
              rot=(0, 0 if s > 0 else PI, 0), bevel=0.012)                                           # horn quillons
    facet_gem(h, 0.05, (0, 0.24, 0.095), EMBER, emissive=EMBER, strength=5)
    fang = [(-0.15, 0.3), (0.15, 0.3), (0.17, 0.55), (0.16, 0.85), (0.12, 1.12), (0.05, 1.38), (-0.04, 1.58),
            (-0.08, 1.35), (-0.12, 1.08), (-0.15, 0.8), (-0.16, 0.55)]
    prism(h, fang, 0.08, (0, 0, 0), BONE, bevel=0.016)                                               # the fang
    prism(h, [(-0.035, 0.33), (0.035, 0.33), (0.05, 0.8), (0.03, 1.1), (-0.015, 1.3), (-0.045, 1.05), (-0.05, 0.75)],
          0.09, (0, 0, 0), EMBER, emissive=EMBER, strength=4)                                         # molten core


def u_emberstring(S):
    """Emberstring: a dragon-wing recurve: pale bone limbs, each carrying a dark hide wing along its back, obsidian
    horn tips and a burning string."""
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
        pts = [(0.16, 0.0), (0.4, 0.1), (0.62, 0.17), (0.7, 0.03), (0.55, -0.06), (0.42, -0.14), (0.27, -0.1),
               (0.17, -0.08)]
        prism(b, [(-(z + z0), s * y) for y, z in (pts if s < 0 else pts[::-1])], 0.024, (0, 0, 0), MEMBRANE,
              rot=(0, PI / 2, 0))                                                                     # wing
    box(b, (0.026, 1.24, 0.026), (0, 0, z0 + 0.195), EMBER_HOT, emissive=EMBER, strength=6, bevel=0)  # burning string


def u_kindled_ash(S):
    """Staff of Kindled Ash: a long dragon bone for a shaft, banded in obsidian; four obsidian claws rise from a
    collar and bend in around a dragon's ember heart."""
    h = S('sock_handR')
    obs = obsidian()
    b = pivot(h, 'staffbody', STAFF_GRIP, STAFF_LEAN)
    box(b, (0.12, 1.72, 0.12), (0, 0.21, 0), BONE, taper=(0.8, 0.8), bevel=0.02)                     # bone shaft
    for y in (-0.45, 0.8):
        box(b, (0.145, 0.05, 0.145), (0, y, 0), obs, bevel=0.012)
    box(b, (0.14, 0.24, 0.14), (0, 0.0, 0), GRIP, bevel=0.02)
    beam(b, (0, -0.66, 0), (0, -0.84, 0), 0.12, obs, w1=0.02)
    box(b, (0.19, 0.14, 0.19), (0, 1.12, 0), obs, taper=(1.3, 1.3), bevel=0.02)                      # claw collar
    for i in range(4):
        a = i * PI / 2 + PI / 4
        d = Vector((math.cos(a), 0, math.sin(a)))
        pts = [d * 0.08 + Vector((0, 1.18, 0)), d * 0.18 + Vector((0, 1.32, 0)), d * 0.19 + Vector((0, 1.48, 0)), d * 0.07 + Vector((0, 1.64, 0))]
        for p0, p1, w0, w1 in zip(pts, pts[1:], (0.075, 0.065, 0.05), (0.065, 0.05, 0.012)):
            beam(b, tuple(p0 - (p1 - p0).normalized() * 0.02), tuple(p1), w0, obs, w1=w1)
    facet_gem(b, 0.13, (0, 1.42, 0), EMBER, emissive=EMBER, strength=5, rot=corner_up(), depth=0.19)  # ember heart
    facet_gem(b, 0.06, (0, 1.45, 0.1), EMBER_HOT, emissive=EMBER_HOT, strength=6)
    beam(b, (0, 1.5, 0), (0, 1.7, 0), 0.09, EMBER_HOT, w1=0.015, emissive=EMBER, strength=5)          # flame tongue

GEAR = {
    'sword': sword, 'longsword': longsword, 'pickaxe': pickaxe, 'bow': bow, 'staff': staff,
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
