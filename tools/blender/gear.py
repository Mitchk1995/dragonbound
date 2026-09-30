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
from mathutils import Matrix, Vector

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


def rivet(p, pos, color=R.trim, r=0.024):
    return gem(p, r, pos, color)


def limb_chain(p, pts, w, t, color, x=0.0):
    """Boxes following a polyline of (y, z) points in the YZ plane (bow limbs)."""
    for (y0, z0), (y1, z1) in zip(pts, pts[1:]):
        ln = math.hypot(y1 - y0, z1 - z0)
        ang = math.atan2(z1 - z0, y1 - y0)
        box(p, (w, ln + t * 0.6, t), (x, (y0 + y1) / 2, (z0 + z1) / 2), color, rot=(ang, 0, 0), bevel=min(0.02, t * 0.3))
        w *= 0.88


# ─── Weapons (sock_handR) ────────────────────────────────────────────────────

def sword(S):
    h = S('sock_handR')
    cyl(h, 0.045, 0.045, 0.3, (0, 0, 0), R.leather, seg=6)
    for y in (-0.08, 0.06):
        cyl(h, 0.053, 0.053, 0.03, (0, y, 0), R.dark, seg=6)                       # grip wraps
    gem(h, 0.075, (0, -0.2, 0), R.trim)                                            # pommel
    box(h, (0.14, 0.13, 0.13), (0, 0.17, 0), R.dark, bevel=0.03)                   # guard block
    box(h, (0.46, 0.07, 0.11), (0, 0.18, 0), R.trim, bevel=0.025)                  # crossguard
    for s in (-1, 1):
        box(h, (0.08, 0.12, 0.13), (s * 0.24, 0.2, 0), R.trim, rot=(0, 0, s * -0.3), bevel=0.025)
    gem(h, 0.035, (0, 0.17, 0.07), R.glow)
    prism(h, [(-0.075, 0.22), (0.075, 0.22), (0.065, 0.8), (0.0, 0.94), (-0.065, 0.8)], 0.05, (0, 0, 0), R.metal, bevel=0.012)
    box(h, (0.035, 0.5, 0.058), (0, 0.5, 0), R.dark, bevel=0)                     # fuller


def longsword(S):
    h = S('sock_handR')
    cyl(h, 0.048, 0.048, 0.42, (0, 0, 0), R.leather, seg=6)
    for y in (-0.12, 0.0, 0.12):
        cyl(h, 0.056, 0.056, 0.03, (0, y, 0), R.dark, seg=6)
    cyl(h, 0.06, 0.08, 0.06, (0, -0.24, 0), R.trim, seg=6)
    gem(h, 0.085, (0, -0.31, 0), R.trim)
    box(h, (0.17, 0.16, 0.15), (0, 0.24, 0), R.dark, bevel=0.035)
    box(h, (0.62, 0.08, 0.12), (0, 0.25, 0), R.trim, bevel=0.03)
    for s in (-1, 1):
        box(h, (0.09, 0.16, 0.13), (s * 0.33, 0.22, 0), R.trim, rot=(0, 0, s * 0.45), bevel=0.03)  # down-swept quillons
        rivet(h, (s * 0.2, 0.25, 0.065), R.dark, 0.02)
    gem(h, 0.045, (0, 0.24, 0.08), R.glow)
    box(h, (0.16, 0.12, 0.07), (0, 0.35, 0), R.metal, bevel=0.02)                  # ricasso
    prism(h, [(-0.09, 0.3), (0.09, 0.3), (0.085, 1.02), (0.0, 1.22), (-0.085, 1.02)], 0.06, (0, 0, 0), R.metal, bevel=0.014)
    box(h, (0.045, 0.72, 0.068), (0, 0.68, 0), R.dark, bevel=0)


def pickaxe(S):
    h = S('sock_handR')
    cyl(h, 0.045, 0.05, 1.05, (0, 0.37, 0), WOOD, seg=6)
    cyl(h, 0.058, 0.058, 0.26, (0, -0.02, 0), R.leather, seg=6)                    # grip wrap
    cyl(h, 0.06, 0.07, 0.06, (0, -0.17, 0), R.dark, seg=6)
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
        cone(b, 0.04, 0.1, (0, s * 0.8, BOW_Z + 0.12), R.trim, rot=(0 if s > 0 else PI, 0, 0), seg=4)
    box(b, (0.018, 1.24, 0.018), (0, 0, BOW_Z + 0.195), STRING, bevel=0)
    rivet(b, (0, 0, BOW_Z - 0.065), R.glow, 0.03)


# Staffs run upright through the front of the fist (socket +Y), not down the forearm axis, with the top
# leaning forward and a touch outward so the shaft clears the forearm and sleeve.
STAFF_GRIP = (0, 0.1, 0)
STAFF_LEAN = (-PI / 2 + 0.2, 0, 0.05)


def staff(S):
    h = S('sock_handR')
    b = pivot(h, 'staffbody', STAFF_GRIP, STAFF_LEAN)
    cyl(b, 0.05, 0.062, 1.9, (0, 0.3, 0), R.metal, seg=6)
    cyl(b, 0.068, 0.068, 0.24, (0, 0.0, 0), R.leather, seg=6)
    for y in (-0.5, 0.72):
        cyl(b, 0.072, 0.072, 0.05, (0, y, 0), R.trim, seg=6)
    cone(b, 0.06, 0.16, (0, -0.72, 0), R.dark, rot=(PI, 0, 0), seg=5)
    cyl(b, 0.1, 0.07, 0.12, (0, 1.28, 0), R.trim, seg=6)                           # head cup
    for i in range(3):
        a = i * 2 * PI / 3
        x, z = math.cos(a) * 0.1, math.sin(a) * 0.1
        box(b, (0.05, 0.3, 0.05), (x * 1.3, 1.44, z * 1.3), R.dark, rot=(-math.sin(a) * -0.3, 0, math.cos(a) * -0.3), bevel=0.015)
        cone(b, 0.03, 0.1, (x * 1.0, 1.62, z * 1.0), R.dark, rot=(-math.sin(a) * 0.5, 0, math.cos(a) * 0.5), seg=4)
    gem(b, 0.14, (0, 1.46, 0), R.glow)


# ─── Plate shapes ────────────────────────────────────────────────────────────
# Shared by the chainbody / med helm below, the plate sets (plate_variants.py) and the uniques built on them.
# sock_chest space: tunic 0.68 -> 0.73 wide, 0.42 deep, y -0.35..0.31; collar to 0.35 (= head bottom); sleeves
# x 0.345..0.595 at y -0.11..0.21; arm pivot (+-0.47, 0.18); hero belt y -0.37 (+-0.36 x, +-0.23 z) with a pouch
# on the left hip reaching z 0.24; skirt/hem to y -0.62 (+-0.36, +-0.23).
# Shoulder socket space: arm pivot (+-0.01, -0.10), sleeve top y -0.07, x -0.115..0.135 (L), z +-0.135.
# sock_head space: the head is a 0.46 cube centred here, ears out to x +-0.27, nose out to z 0.29.
CHEST_IN = (0, 0.0, 0)
HELM_IN = (0, 0.1, 0)
# Cuirass: rounded barrel, soft centre ridge, a slight swell over the chest. Rows: (y, half width, half depth,
# front ridge, back ridge).
CUIRASS = [(-0.31, 0.39, 0.29, 0.03, 0.0), (-0.12, 0.395, 0.3, 0.045, 0.0), (0.08, 0.41, 0.325, 0.055, 0.01),
           (0.22, 0.405, 0.315, 0.04, 0.01), (0.31, 0.375, 0.275, 0.0, 0.0), (0.35, 0.31, 0.25, 0, 0), (0.37, 0.27, 0.235, 0, 0)]
CUIRASS_E = 3.0
# Great helm: a rounded dome a little over the head.
GREAT_HELM = [(-0.25, 0.32, 0.33, 0.02, 0), (0.0, 0.315, 0.33, 0.03, 0), (0.15, 0.305, 0.32, 0.03, 0), (0.245, 0.27, 0.285, 0.02, 0),
              (0.3, 0.18, 0.19, 0.01, 0), (0.322, 0.0, 0.0, 0, 0)]
HELM_E = 2.6
# Pauldron dome (bell_fn, shoulder-socket space): centre, outward tilt, vertical and horizontal radius.
PAULDRON = ((0.0, -0.1, 0), 0.3, 0.25, 0.25)
PAULDRON_KW = dict(inner_scale=0.7, front_scale=1.1)


def mp(p, s):
    """Mirror a point to the -X side when s < 0."""
    return (p[0] * s, p[1], p[2])


def row_v(rows, y):
    """Loft parameter v of height y (rows ascend in y)."""
    for i in range(len(rows) - 1):
        if rows[i][0] <= y <= rows[i + 1][0]:
            return (i + (y - rows[i][0]) / (rows[i + 1][0] - rows[i][0])) / (len(rows) - 1)
    return 0.0 if y < rows[0][0] else 1.0


def cuirass(c, color=R.metal, rows=CUIRASS, e=CUIRASS_E, nu=12, bevel=0.018, thick=0.03, nm='cuirass'):
    fn = loft_fn(rows, e, rw=0.6)
    surf(c, fn, nu, len(rows) - 1, thick, color, closed_u=True, inside=CHEST_IN, bevel=bevel, nm=nm, inner=False, walls=(0,))
    return fn


def band_on(c, fn, v0, v1, color=R.trim, nu=12, lift=0.006, thick=0.03, nm=None, u0=0.0, u1=1.0, ins=CHEST_IN):
    """Trim band laid on a lofted surface between rows v0..v1 (all the way round unless u0..u1 is narrower)."""
    closed = abs(u1 - u0 - 1) < 1e-6
    return surf(c, grow(sub(fn, u0, u1, v0, v1), lift, ins), nu, 1, thick, color, closed_u=closed, inside=ins, nm=nm, inner=False)


def tasset(c, t0, t1, ya, yb, a, b, color=R.metal, rim=R.trim, nm='tasset', e=3.0, nu=3, flare=0.015):
    """Hanging plate around the hips from ya (top) down to yb, angles t0..t1, with an optional rolled lower rim."""
    tf = loft_fn([(yb, a + flare, b + flare, 0, 0), (ya, a, b, 0, 0)], e, t0=t0, t1=t1)
    ins = (0, (ya + yb) / 2, 0)
    surf(c, tf, nu, 1, 0.022, color, inside=ins, bevel=0.01, nm=nm, inner=False)
    if rim:
        surf(c, grow(sub(tf, 0, 1, 0, 0.2), 0.004, ins), nu, 1, 0.026, rim, inside=ins, inner=False, nm=nm + '_rim')
    return tf


def helm_shell(h, color=R.metal, rows=GREAT_HELM, nu=12, t0=0.0, t1=2 * PI, bevel=0.018, nm='helm_shell'):
    """Rounded helm dome (sock_head space); t0..t1 short of a full turn leaves the face open."""
    fn = loft_fn(rows, HELM_E, rw=0.6, t0=t0, t1=t1)
    closed = abs(t1 - t0 - 2 * PI) < 1e-6
    surf(h, fn, nu, len(rows) - 1, 0.03, color, closed_u=closed, inside=HELM_IN, bevel=bevel, nm=nm, inner=not closed, walls=(0,))
    return fn


def pauldron_trim(sh, fn, s, ins, v0, v1, nu, color=R.trim, closed=False, lift=0.004, thick=0.03, nm=None):
    return surf(sh, grow(mirror(sub(fn, 0, 1, v0, v1), s), lift, ins), nu, 1, thick, color, closed_u=closed, inside=ins, inner=False, nm=nm)


def pauldron(sh, s, color=R.metal, roll=R.trim, lame_edge=R.dark, lames=2, cap_th=1.2, nu=10):
    """Rounded shoulder dome hugging the arm with a rolled rim and `lames` bands below it on the outer side.
    Returns the (left-side) dome surface and its inside point."""
    O, phi, Rv, Rh = PAULDRON
    ins = mp((O[0], O[1] - 0.04, 0), s)
    capf = bell_fn(O, phi, Rv, Rh, 0.0, cap_th, -PI, PI, drop=0.08, **PAULDRON_KW)
    surf(sh, mirror(capf, s), nu, 3, 0.03, color, closed_u=True, inside=ins, bevel=0.014, nm='pauldron_cap', walls=(1,))
    if roll:
        pauldron_trim(sh, capf, s, ins, 0.84, 1.0, nu, color=roll, closed=True, thick=0.034, nm='cap_roll')
    for i in range(lames):
        th0, th1 = cap_th - 0.12 + 0.22 * i, cap_th + 0.2 + 0.22 * i
        k = 1 + 0.05 * (i + 1)
        lf = bell_fn(O, phi, Rv * k, Rh * k, th0, th1, -1.9 + 0.1 * i, 1.9 - 0.1 * i, **PAULDRON_KW)
        surf(sh, mirror(lf, s), 6, 1, 0.022, color, inside=ins, nm=f'p_lame{i}', inner=True, walls=(1,))
        if lame_edge:
            pauldron_trim(sh, lf, s, ins, 0.75, 1.0, 6, color=lame_edge, thick=0.026, nm=f'p_lame_edge{i}')
    return capf, ins


def scale_row(p, fn, u_mid, n, width, v0, v1, color, inside, point=0.06, lift=0.012, flare=0.03, thick=0.022, nm='scale'):
    """A row of `n` rounded-point scales laid on surface fn, centred on u_mid (turns), each `width` turns wide,
    spanning v0 (bottom edge, before the point) to v1. The bottom edge bulges down into a rounded point and
    stands off the surface (flare), so each row shingles over the row below."""
    for i in range(n):
        ua = u_mid + (i - n / 2) * width

        def g(u, v, ua=ua):
            k = 2 * u - 1
            vv = v0 - point * (1 - k * k) + (v1 - v0 + point * (1 - k * k)) * v
            uu = (ua + width * u) % 1.0
            return tuple(V(fn(uu, vv)) + surf_normal(fn, uu, vv, inside) * (lift + flare * (1 - v)))
        surf(p, g, 4, 1, thick, color, inside=inside, nm=nm, inner=False)


# ─── Helms (sock_head) ───────────────────────────────────────────────────────

MED_HELM = [(0.05, 0.28, 0.29, 0.0, 0), (0.17, 0.275, 0.285, 0.015, 0.015), (0.27, 0.225, 0.235, 0.015, 0.015),
            (0.33, 0.13, 0.14, 0.01, 0.01), (0.35, 0.0, 0.0, 0, 0)]


def helm_open(S):
    """Med helm: a rounded bowl with a soft centre ridge, one rim band and a nasal bar."""
    h = S('sock_head')
    fn = loft_fn(MED_HELM, HELM_E, rw=0.5)
    surf(h, fn, 12, len(MED_HELM) - 1, 0.03, R.metal, closed_u=True, inside=HELM_IN, bevel=0.014, nm='bowl', inner=False, walls=(0,))
    hoop(h, 0.03, 0.1, (0.3, 0.31), (0.297, 0.307), 0.03, R.trim, nu=12, e=HELM_E, nm='rim', bevel=0.008)
    box(h, (0.075, 0.2, 0.04), (0, -0.02, 0.318), R.trim, taper=(1.3, 1), bevel=0.014)        # nasal bar
    for s in (-1, 1):
        rivet(h, (s * 0.2, 0.065, 0.268), R.dark, 0.02)
        rivet(h, (s * 0.302, 0.065, 0.0), R.dark, 0.02)


def helm_full(S):
    h = S('sock_head')
    box(h, (0.59, 0.5, 0.59), (0, 0.03, 0), R.metal, bevel=0.06)                             # bucket
    box(h, (0.52, 0.13, 0.52), (0, 0.33, 0), R.metal, taper=(0.72, 0.72), bevel=0.05)        # dome
    box(h, (0.61, 0.06, 0.61), (0, 0.22, 0), R.trim, bevel=0.02)                             # crown rim
    prism(h, [(-0.18, 0.0), (0.2, 0.0), (0.12, 0.13), (-0.1, 0.1)], 0.07, (0, 0.37, 0), R.trim, rot=(0, PI / 2, 0), bevel=0.012)  # crest fin
    box(h, (0.44, 0.34, 0.05), (0, -0.02, 0.305), R.metal, taper=(0.9, 1), bevel=0.02)        # face plate
    box(h, (0.46, 0.05, 0.02), (0, 0.06, 0.332), SLIT, bevel=0)                              # visor slit
    box(h, (0.06, 0.26, 0.04), (0, -0.08, 0.34), R.trim, bevel=0.012)                        # face ridge
    for s in (-1, 1):
        for i in range(2):
            for j in range(2):
                box(h, (0.03, 0.03, 0.02), (s * (0.08 + j * 0.06), -0.06 - i * 0.07, 0.334), SLIT, bevel=0)  # breaths
        box(h, (0.05, 0.4, 0.3), (s * 0.3, -0.02, 0.1), R.metal, taper=(1, 0.85), bevel=0.015)  # cheek flares
        rivet(h, (s * 0.31, 0.22, 0.2), R.dark, 0.022)
        rivet(h, (s * 0.31, 0.22, -0.12), R.dark, 0.022)
    box(h, (0.52, 0.1, 0.5), (0, -0.27, 0), R.dark, bevel=0.03)                              # gorget


# ─── Body armour (sock_chest + shoulders) ────────────────────────────────────

# Mail shirt: a close rounded hauberk from the collar to a short skirt below the belt.
HAUBERK = [(-0.62, 0.415, 0.305, 0.0, 0.0), (-0.5, 0.405, 0.3, 0.0, 0.0), (-0.36, 0.395, 0.295, 0.0, 0.0), (-0.1, 0.395, 0.295, 0.015, 0.0),
           (0.12, 0.405, 0.31, 0.02, 0.0), (0.25, 0.4, 0.3, 0.015, 0.0), (0.315, 0.365, 0.27, 0, 0), (0.35, 0.29, 0.24, 0, 0)]


def body_chain(S):
    """Mail shirt: rounded hauberk with a short skirt, belt, collar and small rounded mail shoulders. Staggered
    ring studs read as mail on the metal tiers and as studded leather on the leather set."""
    c = S('sock_chest')
    fn = loft_fn(HAUBERK, CUIRASS_E, rw=0.6)
    surf(c, fn, 12, len(HAUBERK) - 1, 0.03, R.metal, closed_u=True, inside=CHEST_IN, bevel=0.012, nm='hauberk', inner=False, walls=(0,))
    band_on(c, fn, 0.0, 0.03, color=R.dark, nm='hem')
    band_on(c, fn, 0.96, 1.0, color=R.dark, nm='collar')
    hoop(c, -0.42, -0.33, (0.415, 0.315), (0.415, 0.315), 0.025, R.leather, nu=12, e=CUIRASS_E, nm='belt')
    box(c, (0.13, 0.11, 0.03), (0, -0.375, 0.33), R.trim, bevel=0.012)
    for j, y in enumerate((-0.54, -0.22, -0.06, 0.1, 0.24)):
        v = row_v(HAUBERK, y)
        for i in range(16):
            stud_on(c, fn, (i + 0.5 * (j % 2)) / 16, v, CHEST_IN, R.dark, r=0.02)
    for name, s in (('sock_shoulderL', 1), ('sock_shoulderR', -1)):     # short mail sleeves capping the shoulder
        sh = S(name)
        cf = bell_fn((0.0, -0.13, 0), 0.25, 0.2, 0.19, 0.0, 1.65, -PI, PI, inner_scale=0.8)
        ins = mp((0.0, -0.16, 0), s)
        surf(sh, mirror(cf, s), 8, 3, 0.025, R.metal, closed_u=True, inside=ins, bevel=0.01, nm='mail_cap', walls=(1,))
        pauldron_trim(sh, cf, s, ins, 0.88, 1.0, 8, color=R.dark, closed=True, nm='mail_hem')


def body_plate(S):
    c = S('sock_chest')
    box(c, (0.8, 0.66, 0.56), (0, 0.02, 0), R.metal, taper=(1.1, 1.04), bevel=0.06)       # cuirass
    box(c, (0.52, 0.38, 0.07), (0, 0.1, 0.275), R.metal, taper=(1.2, 1), bevel=0.03)       # pectoral plate
    box(c, (0.06, 0.46, 0.05), (0, 0.06, 0.315), R.trim, bevel=0.015)                      # keel
    box(c, (0.56, 0.07, 0.1), (0, 0.33, 0.24), R.trim, bevel=0.02)                         # neckline rim
    box(c, (0.5, 0.13, 0.44), (0, 0.37, -0.01), R.dark, bevel=0.035)                       # gorget
    for s in (-1, 1):
        rivet(c, (s * 0.26, 0.26, 0.3), R.trim)
        rivet(c, (s * 0.24, -0.08, 0.3), R.trim)
    for i, y in enumerate((-0.28, -0.38)):
        box(c, (0.8 - i * 0.02, 0.09, 0.57 - i * 0.02), (0, y, 0.005), R.metal, bevel=0.02)  # abdomen lames
    box(c, (0.84, 0.08, 0.6), (0, -0.46, 0), R.leather, bevel=0.02)                        # belt
    box(c, (0.14, 0.12, 0.05), (0, -0.46, 0.305), R.trim, bevel=0.015)
    for x in (-0.15, 0.15):                                                              # front tassets
        box(c, (0.27, 0.22, 0.05), (x, -0.6, 0.29), R.metal, rot=(-0.14, 0, 0), bevel=0.02)
        box(c, (0.28, 0.04, 0.06), (x, -0.7, 0.305), R.trim, rot=(-0.14, 0, 0), bevel=0)
        rivet(c, (x, -0.53, 0.32), R.trim, 0.02)
    box(c, (0.56, 0.22, 0.05), (0, -0.6, -0.29), R.metal, rot=(0.14, 0, 0), bevel=0.02)      # rear tasset
    for s in (-1, 1):
        box(c, (0.05, 0.22, 0.34), (s * 0.43, -0.6, 0), R.metal, rot=(0, 0, s * 0.14), bevel=0.02)  # hip tassets
        box(c, (0.06, 0.04, 0.35), (s * 0.445, -0.7, 0), R.trim, rot=(0, 0, s * 0.14), bevel=0)
    for name, s in (('sock_shoulderL', 1), ('sock_shoulderR', -1)):
        sh = S(name)
        box(sh, (0.46, 0.26, 0.6), (s * 0.06, 0.07, 0), R.metal, rot=(0, 0, s * -0.3), bevel=0.08)   # dome
        box(sh, (0.48, 0.05, 0.62), (s * 0.08, 0.0, 0), R.trim, rot=(0, 0, s * -0.3), bevel=0.015)  # rim
        box(sh, (0.36, 0.1, 0.54), (s * 0.16, -0.08, 0), R.metal, rot=(0, 0, s * -0.55), bevel=0.03)  # lame 1
        box(sh, (0.28, 0.09, 0.48), (s * 0.22, -0.16, 0), R.metal, rot=(0, 0, s * -0.7), bevel=0.03)  # lame 2
        box(sh, (0.07, 0.1, 0.46), (s * 0.02, 0.22, 0), R.trim, rot=(0, 0, s * -0.3), bevel=0.02)    # ridge
        for z in (-0.2, 0.2):
            rivet(sh, (s * 0.2, 0.02, z), R.dark, 0.024)
        cone(sh, 0.06, 0.18, (s * 0.12, 0.28, 0), R.trim, rot=(0, 0, s * -0.5), seg=4)              # spike


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
        rivet(g, (s * 0.17, 0.2, 0), R.trim, 0.022)


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


def u_cinderfang(S):
    h = S('sock_handR')
    cyl(h, 0.05, 0.05, 0.42, (0, 0, 0), 0x4A1614, seg=6)                           # blood-red grip
    for y in (-0.13, -0.01, 0.11):
        cyl(h, 0.058, 0.058, 0.03, (0, y, 0), metallic(CHAR), seg=6)
    cone(h, 0.08, 0.16, (0, -0.3, 0), metallic(CHAR2), rot=(PI, 0, 0), seg=4)       # claw pommel
    gem(h, 0.065, (0, -0.25, 0), EMBER, emissive=EMBER, strength=4)
    box(h, (0.2, 0.17, 0.16), (0, 0.24, 0), metallic(CHAR), bevel=0.04)            # jaw guard
    for s in (-1, 1):
        prism(h, [(0, -0.05), (0.34, 0.04), (0.42, 0.2), (0.3, 0.1), (0, 0.07)], 0.1, (s * 0.06, 0.24, 0), metallic(CHAR2),
              rot=(0, 0 if s > 0 else PI, 0), bevel=0.012)                           # horn quillons
        cone(h, 0.03, 0.09, (s * 0.07, 0.35, 0.07), BONE, seg=3)                    # fangs
    gem(h, 0.05, (0, 0.24, 0.085), EMBER, emissive=EMBER, strength=5)
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
    gem(b, 0.05, (0, 0, z0 - 0.07), EMBER, emissive=EMBER, strength=5)
    for s in (-1, 1):
        box(b, (0.12, 0.05, 0.14), (0, s * 0.14, z0), metallic(GOLD), bevel=0.015)
        limb_chain(b, [(s * y, z + z0) for y, z in BOW_LIMB], 0.1, 0.08, CHAR2)
        for (y, z) in BOW_LIMB[1:4]:
            cone(b, 0.035, 0.14, (0, s * y, z + z0 - 0.07), metallic(GOLD), rot=(-1.17 if s > 0 else -PI + 1.17, 0, 0), seg=3)  # back barbs
        cone(b, 0.055, 0.2, (0, s * 0.84, z0 + 0.08), EMBER, rot=(-0.5 if s > 0 else PI + 0.5, 0, 0), seg=4, emissive=EMBER, strength=4)  # flame tips
        box(b, (0.09, 0.07, 0.1), (0, s * 0.74, z0 + 0.14), metallic(GOLD), bevel=0.015)
    box(b, (0.026, 1.24, 0.026), (0, 0, z0 + 0.195), EMBER_HOT, emissive=EMBER, strength=6, bevel=0)  # burning string


def u_kindled_ash(S):
    """Pale ash staff; four blackened claws rise from a collar and curl in around a dragon's ember heart."""
    h = S('sock_handR')
    b = pivot(h, 'staffbody', STAFF_GRIP, STAFF_LEAN)
    cyl(b, 0.05, 0.064, 1.72, (0, 0.21, 0), 0x9A9088, seg=6)                       # pale ash wood
    for y in (-0.45, 0.35, 0.8):
        cyl(b, 0.07, 0.07, 0.05, (0, y, 0), metallic(CHAR), seg=6)
    cyl(b, 0.07, 0.07, 0.24, (0, 0.0, 0), 0x4A1614, seg=6)
    cone(b, 0.06, 0.18, (0, -0.74, 0), metallic(CHAR), rot=(PI, 0, 0), seg=4)
    cyl(b, 0.11, 0.07, 0.14, (0, 1.12, 0), metallic(CHAR), seg=8)                  # claw collar
    ring(b, 0.12, 0.08, 0.04, (0, 1.19, 0), metallic(BRONZE), seg=8)
    for i in range(4):
        a = i * PI / 2 + PI / 4
        d = Vector((math.cos(a), 0, math.sin(a)))
        pts = [d * 0.08 + Vector((0, 1.16, 0)), d * 0.17 + Vector((0, 1.3, 0)), d * 0.19 + Vector((0, 1.46, 0)),
               d * 0.13 + Vector((0, 1.6, 0)), d * 0.05 + Vector((0, 1.66, 0))]
        horn(b, [tuple(p) for p in pts], (0.042, 0.04, 0.034, 0.022, 0.006), metallic(CHAR), seg=5)
    gem(b, 0.13, (0, 1.42, 0), EMBER, emissive=EMBER, strength=5)                  # ember heart
    gem(b, 0.07, (0, 1.45, 0.07), EMBER_HOT, emissive=EMBER_HOT, strength=6)
    cone(b, 0.06, 0.2, (0, 1.62, 0), EMBER_HOT, seg=4, emissive=EMBER, strength=5)  # flame tongue


ASHEN_CAP = [(0.1, 0.305, 0.315, 0.02, 0.0), (0.18, 0.29, 0.3, 0.02, 0.0), (0.26, 0.24, 0.255, 0.015, 0.0), (0.315, 0.14, 0.15, 0.0, 0.0),
             (0.335, 0.0, 0.0, 0, 0)]
ASHEN_SIDES = [(-0.24, 0.31, 0.3, 0, 0), (-0.05, 0.315, 0.315, 0, 0), (0.12, 0.305, 0.315, 0, 0)]


def u_ashen_crown(S):
    """Open-faced charred helm: a rounded cap, cheek guards and nape down the sides, a bronze circlet crowned
    with flame tines leaning outward and an ember gem over the brow."""
    h = S('sock_head')
    cap = loft_fn(ASHEN_CAP, HELM_E, rw=0.6)
    surf(h, cap, 12, len(ASHEN_CAP) - 1, 0.03, metallic(CHAR), closed_u=True, inside=HELM_IN, bevel=0.014, nm='cap', inner=False, walls=(0,))
    sides = loft_fn(ASHEN_SIDES, HELM_E, t0=0.78, t1=2 * PI - 0.78)
    surf(h, sides, 10, len(ASHEN_SIDES) - 1, 0.03, metallic(CHAR), inside=HELM_IN, bevel=0.012, nm='cheeks')
    for u0, u1 in ((0.0, 0.05), (0.95, 1.0)):                                      # bronze edge round the face opening
        surf(h, grow(sub(sides, u0, u1, 0, 0.9), 0.006, HELM_IN), 1, 2, 0.02, metallic(BRONZE), inside=HELM_IN, nm='face_edge')
    band = loft_fn([(0.1, 0.32, 0.33, 0.02, 0), (0.18, 0.305, 0.315, 0.02, 0)], HELM_E, rw=0.6)
    surf(h, band, 14, 1, 0.03, metallic(BRONZE), closed_u=True, inside=HELM_IN, bevel=0.008, nm='circlet', inner=False)
    flame = [(-0.055, 0.0), (0.055, 0.0), (0.04, 0.07), (0.065, 0.12), (0.02, 0.2), (0.022, 0.12), (-0.02, 0.16), (-0.03, 0.08)]
    inner = [(-0.03, 0.0), (0.03, 0.0), (0.018, 0.07), (0.03, 0.11), (0.005, 0.15), (-0.012, 0.09)]
    for i in range(6):                                                             # tallest pair either side of the brow gem
        t = (i - 2.5) * 2 * PI / 6
        k = 1.2 if i in (2, 3) else (0.95 if i in (1, 4) else 0.8)
        n = Vector((math.sin(t), 0, math.cos(t)))
        pos = V(band(((t / (2 * PI)) % 1.0), 0.5)) + n * 0.01
        rot = rot_of(('X', 0.3), ('Y', t))
        prism(h, [(x * k, y * k) for x, y in flame], 0.03, tuple(pos), metallic(BRONZE), rot=rot, bevel=0.006)
        prism(h, [(x * k, y * k) for x, y in inner], 0.034, tuple(pos + n * 0.006), EMBER, rot=rot, emissive=EMBER, strength=2)
    fz = V(band(0.0, 0.5))
    box(h, (0.12, 0.1, 0.03), tuple(fz + Vector((0, 0, 0.012))), metallic(BRONZE), rot=(0, 0, PI / 4), bevel=0.01)   # gem setting
    gem(h, 0.05, tuple(fz + Vector((0, 0, 0.035))), EMBER_HOT, emissive=EMBER, strength=5)                             # brow gem
    for s in (-1, 1):                                                              # embers glowing through the charred cap
        box(h, (0.018, 0.012, 0.14), (s * 0.12, 0.29, -0.06), EMBER, rot=(0.45, s * 0.5, 0), emissive=EMBER, strength=3, bevel=0)


def rot_of(*steps):
    """Compose rotations applied in order (parent frame) into the ZYX Euler that _link uses."""
    m = Matrix.Identity(3)
    for axis, ang in steps:
        m = Matrix.Rotation(ang, 3, axis) @ m
    e = m.to_euler('ZYX')
    return (e.x, e.y, e.z)


def u_scaleguard(S):
    """Hauberk of shed dragon scales: overlapping rows of red scales all round a dark mail cuirass, a longer row
    over the mail skirt, gold collar and buckle, scale pauldrons with swept-back horns."""
    c = S('sock_chest')
    fn = cuirass(c, color=metallic(MAIL))
    hoop(c, -0.62, -0.3, (0.415, 0.31), (0.395, 0.295), 0.025, metallic(MAIL), nu=12, e=CUIRASS_E, nm='skirt', walls=(0,))
    for j, (ya, yb) in enumerate(((0.16, 0.33), (0.04, 0.21), (-0.08, 0.09), (-0.2, -0.03))):
        scale_row(c, fn, 0.5 / 12 * (j % 2), 12, 1 / 12, row_v(CUIRASS, ya), row_v(CUIRASS, yb), SCALE, CHEST_IN,
                  point=0.05, lift=0.006 + 0.004 * (3 - j), flare=0.03, nm='scale')
    skirt = loft_fn([(-0.62, 0.415, 0.31, 0, 0), (-0.3, 0.395, 0.295, 0, 0)], CUIRASS_E)
    scale_row(c, skirt, 0.0, 12, 1 / 12, 0.2, 0.95, SCALE, (0, -0.46, 0), point=0.12, lift=0.01, flare=0.03, nm='skirt_scale')
    hoop(c, -0.4, -0.31, (0.43, 0.325), (0.43, 0.325), 0.025, 0x3A2A22, nu=12, e=CUIRASS_E, nm='belt')
    box(c, (0.14, 0.12, 0.04), (0, -0.355, 0.345), metallic(GOLD), bevel=0.015)
    hoop(c, 0.34, 0.41, (0.3, 0.29), (0.285, 0.275), 0.03, metallic(GOLD), nu=10, e=2.6, bevel=0.01, nm='collar')
    for name, s in (('sock_shoulderL', 1), ('sock_shoulderR', -1)):
        sh = S(name)
        pauldron(sh, s, color=SCALE, roll=metallic(GOLD), lame_edge=SCALE_DK, lames=2)
        O, phi, Rv, Rh = PAULDRON
        top = Vector(O) + Vector((math.sin(phi), math.cos(phi), 0)) * Rv
        horn(sh, [mp(tuple(top + Vector(d)), s) for d in ((0.0, -0.03, 0.02), (0.04, 0.08, -0.1), (0.07, 0.12, -0.26))],
             (0.05, 0.03, 0.004), BONE, seg=5)


GEAR = {
    'sword': sword, 'longsword': longsword, 'pickaxe': pickaxe, 'bow': bow, 'staff': staff,
    'helm_open': helm_open, 'helm_full': helm_full, 'body_chain': body_chain, 'body_plate': body_plate,
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
