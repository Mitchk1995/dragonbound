"""Shared torso, shoulder, arm, glove and boot construction kit.

Loaded by gear.py in its shared namespace; re-executed on every load for Blender iteration.
"""

# ─── Blocky plate kit ────────────────────────────────────────────────────────
# Shared by gear_armour.py, the plate sets (plate_variants.py) and the uniques.
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


def plate_torso(c, hips, color=R.metal, belt=R.leather):
    """Plate cuirass in four slabs: chest block (a little broader at the top), waist block, belt and an open
    gorget, with single-slab tassets below (on the hips)."""
    y, w, hgt, d = CHEST
    box(c, (w, hgt, d), (0, y, 0), color, taper=(1.03, 1.0), bevel=0.06)
    y, w, hgt, d = WAIST
    box(c, (w, hgt, d), (0, y, 0), color, bevel=0.04)
    box(c, (0.76, 0.08, 0.57), (0, BELT_Y, 0), belt, bevel=0.02)                               # belt
    open_gorget(c, color)
    plate_tassets(at_chest(hips), color)


def plate_tassets(h, color=R.metal):
    """One plain slab over each thigh and one over the seat, each hanging from behind the belt (h: hips.at_chest)."""
    top = BELT_Y - 0.04 + TUCK
    for s in (-1, 1):
        f = pivot(h, 'tasset', (s * 0.19, top, 0.255), (-0.18, 0, s * 0.04))
        box(f, (0.3, 0.29, 0.05), (0, -0.145, 0), color, bevel=0.02)
    cul = pivot(h, 'tasset', (0, top, -0.255), (0.18, 0, 0))
    box(cul, (0.6, 0.27, 0.05), (0, -0.135, 0), color, bevel=0.02)


# Pauldron cap (left side): a top block over the shoulder corner, sloping down with the shoulder, over an outer
# side block, the two forming one hard corner only a little wider than the arm. Each is (size, centre (x, y),
# outward tilt). The top block sits on the shoulder socket (shoulder-socket space), which follows the arm by 75%
# (anim.ts SHOULDER_FOLLOW), so it articulates over the joint. The side block and everything below it ride the arm
# itself (arm space, on the upper-arm sockets), so nothing lags off the arm when it swings or goes overhead.
CAP_TOP = ((0.29, 0.13, 0.36), (0.04, 0.0), 0.26)
CAP_SIDE = ((0.075, 0.18, 0.36), (0.16, 0.045), 0.08)
SHOULDER_ARM = (('sock_shoulderL', 'sock_upperL', 1), ('sock_shoulderR', 'sock_upperR', -1))


def block_pauldron(S, s, color=R.metal, top=R.metal, edge=R.trim, rivets=R.dark):
    """Blocky shoulder cap for side s: a top block with a raised plate, and an outer side block with a rim along
    its lower edge. Returns the (top, side) frames: local +X runs outward along each block, +Y up out of it."""
    sh_name, upper_name, _ = next(r for r in SHOULDER_ARM if r[2] == s)
    (size, (x, y), tilt) = CAP_TOP
    ft = pivot(S(sh_name), 'pauldron_top', (s * x, y, 0), (0, 0, -s * tilt))
    box(ft, size, (0, 0, 0), color, bevel=0.035)
    if top:
        w, hgt, d = size
        box(ft, (w * 0.55, 0.045, d * 0.66), (-s * 0.02, hgt / 2 + 0.012, 0), top, bevel=0.014)
    (size, (x, y), tilt) = CAP_SIDE
    fs = pivot(S(upper_name), 'pauldron_side', (s * x, y + PALM, 0), (0, 0, -s * tilt))
    box(fs, size, (0, 0, 0), color, bevel=0.03)
    w, hgt, d = size
    if edge:
        box(fs, (w + 0.02, 0.04, d + 0.02), (s * 0.005, -hgt / 2 + 0.01, 0), edge, bevel=0.01)
    if rivets:
        for z in (-0.12, 0.12):
            rivet(fs, (s * (w / 2 + 0.002), 0.02, z), rivets, 0.018, rot=(PI / 4, PI / 2, 0))
    return ft, fs


# ─── Upper arm (body armour, on the upper-arm sockets) ───────────────────────
# Upper-arm armour hangs on the upper-arm sockets (sock_upperL / sock_upperR: unrotated, PALM below the arm pivot), so
# it rides the upper arm exactly and never fans away from it, and stays on the upper arm when the elbow bends.
# Authored in ARM space (origin = arm pivot, left arm, outer side +X) and mirrored for the right. Arm space: the
# elbow at y -0.28, forearm x +-0.09 below it, the gauntlet cuff rises to y -0.33; the body armour's side is at x
# ARM_IN (below), where every armour sleeve starts.
ARM_SOCKS = (('sock_upperL', 1), ('sock_upperR', -1))
# The hand sockets on the hero, by side: (forearm socket, hand socket, side).
HAND_SOCKS = (('sock_cuffL', 'sock_handL', 1), ('sock_cuffR', 'sock_gloveR', -1))
PALM = 0.655
# Lames under the cap stepping down the outside of the upper arm: (size, centre).
ARM_LAMES = (((0.25, 0.085, 0.35), (0.065, -0.07, 0)), ((0.235, 0.08, 0.335), (0.06, -0.14, 0)))


def arm_box(g, s, size, pos, color, rot=(0, 0, 0), **kw):
    """box() in arm space on an arm socket (PALM below the shoulder pivot): pos/rot are for the left arm, mirrored
    when s < 0."""
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


# The arm bends at the elbow (hero.py ELBOW, below the shoulder pivot). Every armour sleeve stops there and goes on as
# an elbow guard on the forearm socket, its top rounded about the elbow (_common.joint_limb), so the arm bends without
# opening a gap: the guard turns up inside the sleeve, and no bare forearm shows between the sleeve and the glove.
ELBOW, GUARD_INSET = 0.28, 0.004
SLEEVE = (0.32, -0.12)          # a sleeve from under the shoulder cap down to the elbow: (height, centre) in arm space


def elbow_guard(S, s, color, depth, out=0.145, bottom=-0.345, band=None):
    """An armour sleeve's forearm part on the forearm socket: from the elbow, rounded about it, down over the top of
    the glove's cuff, as wide as the sleeve above (ARM_IN to `out`) less GUARD_INSET a side, so its top never shares a
    face with the sleeve; with an optional band round its foot."""
    cuff = next(c for c, _, side in HAND_SOCKS if side == s)
    pv = pivot(S(cuff), 'elbow_guard', (s * (out + ARM_IN) / 2, PALM - ELBOW, 0))
    joint_limb(pv, out - ARM_IN - 2 * GUARD_INSET, depth - 2 * GUARD_INSET, 0.0, bottom + ELBOW, color, round_top=True, bevel=0.03)
    if band:
        sleeve(S(cuff), s, 0.045, bottom + 0.0225, depth + 0.01, band, out=out + 0.005, bevel=0.01)


def upper_arm_plate(S, color=R.metal, edge=None, lames=True):
    """Plate rerebrace round the upper arm to the elbow and its elbow guard over the gauntlet cuff (optionally the
    pauldron's lames stepping down its outside). Returns [(upper-arm socket, side)]."""
    out = []
    for name, s in ARM_SOCKS:
        g = S(name)
        sleeve(g, s, *SLEEVE, 0.31, color, bevel=0.035)                                           # rerebrace
        elbow_guard(S, s, color, 0.31)
        if lames:
            arm_lames(g, s, (color, color), edge)
        out.append((g, s))
    return out


def mail_sleeve(S, color=R.metal, hem=R.dark, link=R.dark):
    """Mail sleeve block round the upper arm, from under the cap to the elbow, with rows of mail links, going on over
    the elbow to the gauntlet cuff with a dark hem. Returns [(upper-arm socket, side)]."""
    out = []
    for name, s in ARM_SOCKS:
        g = S(name)
        sleeve(g, s, SLEEVE[0] - 0.005, SLEEVE[1] - 0.0025, 0.32, color, out=0.15, bevel=0.03)
        elbow_guard(S, s, color, 0.32, out=0.15, band=hem)
        for f, hw in faces(pivot(g, 'sleeve', (s * (0.15 + ARM_IN) / 2, PALM - 0.15, 0)), (0.15 - ARM_IN) / 2, 0.16):
            mail_links(f, hw - 0.02, [-0.09 + 0.05 * k for k in range(5)], link)
        out.append((g, s))
    return out


def mail_links(f, half_w, ys, color=R.dark, pitch=0.05, fill=0.55, hgt=0.009, z=0.002, stagger=0):
    """Mail read on a flat face (frame from faces(): local +Z out of the face): at each height in `ys` a row of
    short flat dashes `pitch` apart, alternate rows shifted half a pitch (the first is row number `stagger`), lying
    just on the face -- fine rows of links, with no studs to catch the light. One mesh."""
    bm = bmesh.new()
    ln = pitch * fill
    n = int(half_w * 2 / pitch)
    for j, y in enumerate(ys):
        x0 = -n * pitch / 2 + (pitch / 2 if (j + stagger) % 2 else 0)
        for i in range(n):
            x = x0 + i * pitch + (pitch - ln) / 2
            if x < -half_w or x + ln > half_w:
                continue
            q = [(x, y, z), (x + ln, y, z), (x + ln, y + hgt, z), (x, y + hgt, z)]
            bm.faces.new([bm.verts.new(c_) for c_ in q])
    o = _common._mesh_obj(bm, f, (0, 0, 0), (0, 0, 0), color)
    o.name = 'mail_link'
    return o


# Gloves and gauntlets are the hand's own LEGO C a size up (hero.py HAND), round a hole a hair smaller than the bare
# hand's, so the hand inside never shows; whatever the hero holds runs through it. The glove's hand rides the hand
# (sock_handL / sock_gloveR), its cuff the forearm (sock_cuffL / sock_cuffR), so a turned wrist never swings the cuff
# off the arm. Both are authored round the same origin, the centre of the hole.
GLOVE = dict(outer=0.15, inner=(0.064, 0.078), depth=0.25, gap=0.064, gap_tilt=0.6, stub=(0.15, 0.08, 0.16))
GAUNTLET = dict(outer=0.155, inner=(0.064, 0.078), depth=0.27, gap=0.064, gap_tilt=0.6, stub=(0.16, 0.08, 0.17))
CUFF_Y = 0.225     # a glove cuff's centre above the hole


def plate_gauntlet(h, c, s):
    """Plate gauntlet: the hand's C a size up in plate, under an open cuff the forearm runs into (slim on the inner
    side, so it hangs clear of the hips)."""
    clip_hand(h, (0, 0, 0), R.metal, s, **GAUNTLET)
    open_box(c, (0.275, 0.21, 0.33), (s * 0.0175, CUFF_Y, 0), R.metal, wall=0.05, sink=0.05, bevel=0.025)   # cuff


def plate_sabaton(f, knee=True):
    """Box sabaton and greave: a foot block with a tapered toe, an open-topped greave (as in the approved icons; the
    shin runs into it) and a block knee cop."""
    box(f, (0.34, 0.22, 0.48), (0, -0.08, 0.045), R.metal, bevel=0.035)
    box(f, (0.32, 0.15, 0.1), (0, -0.105, 0.265), R.metal, taper=(0.92, 0.7), bevel=0.03)      # toe
    open_box(f, (0.35, 0.34, 0.36), (0, 0.2, 0), R.metal, wall=0.035, sink=0.05, bevel=0.025)  # greave
    if knee:
        box(f, (0.27, 0.16, 0.08), (0, 0.45, 0.175), R.metal, bevel=0.03)                     # knee cop
