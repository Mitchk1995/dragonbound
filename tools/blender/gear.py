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
from mathutils import Matrix

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


# ─── Helms (sock_head) ───────────────────────────────────────────────────────

def helm_open(S):
    h = S('sock_head')
    box(h, (0.55, 0.22, 0.55), (0, 0.235, -0.005), R.metal, taper=(0.78, 0.78), bevel=0.06)  # dome
    box(h, (0.585, 0.085, 0.585), (0, 0.135, 0), R.trim, bevel=0.022)                        # brow band
    box(h, (0.07, 0.1, 0.46), (0, 0.35, -0.01), R.trim, bevel=0.02)                          # crest
    for s in (-1, 1):
        box(h, (0.055, 0.3, 0.4), (s * 0.285, -0.03, -0.02), R.metal, rot=(0, 0, s * 0.06), taper=(1, 1.12), bevel=0.02)  # cheek guard
        box(h, (0.06, 0.035, 0.36), (s * 0.3, -0.17, -0.02), R.trim, rot=(0, 0, s * 0.06), bevel=0)
        rivet(h, (s * 0.315, 0.05, 0.12), R.trim, 0.022)
        rivet(h, (s * 0.2, 0.135, 0.295), R.dark, 0.022)
        rivet(h, (s * 0.3, 0.135, -0.1), R.dark, 0.022)
    box(h, (0.55, 0.27, 0.06), (0, 0.0, -0.28), R.metal, rot=(-0.15, 0, 0), bevel=0.02)       # neck guard
    box(h, (0.075, 0.22, 0.045), (0, 0.04, 0.305), R.metal, bevel=0.015)                      # nose guard
    rivet(h, (0, 0.135, 0.3), R.glow, 0.03)


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

def band(p, y, w, d, h, color, t=0.0):
    box(p, (w, h, d), (0, y, 0), color, bevel=0 if h < 0.04 else 0.012)


def body_chain(S):
    c = S('sock_chest')
    box(c, (0.76, 0.66, 0.53), (0, 0.0, 0), R.metal, taper=(1.08, 1.04), bevel=0.05)       # hauberk
    for i, y in enumerate((-0.2, -0.06, 0.08, 0.22)):
        k = 1 + 0.08 * (y + 0.33) / 0.66
        band(c, y, 0.77 * k, 0.545 * (1 + 0.04 * (y + 0.33) / 0.66), 0.022, R.dark)         # mail ridges
    box(c, (0.46, 0.11, 0.38), (0, 0.33, 0), R.metal, bevel=0.03)                          # coif collar
    box(c, (0.48, 0.035, 0.4), (0, 0.29, 0), R.dark, bevel=0)
    box(c, (0.76, 0.29, 0.52), (0, -0.47, 0), R.metal, taper=(0.96, 0.96), bevel=0.035)    # mail skirt
    box(c, (0.78, 0.04, 0.54), (0, -0.6, 0), R.dark, bevel=0)
    box(c, (0.8, 0.1, 0.56), (0, -0.33, 0), R.leather, bevel=0.025)                        # belt
    box(c, (0.13, 0.12, 0.04), (0, -0.33, 0.285), R.trim, bevel=0.015)
    for s in (-1, 1):
        box(c, (0.08, 0.66, 0.035), (s * 0.19, 0.02, 0.27), R.leather, rot=(0, 0, s * -0.06), bevel=0.01)  # harness straps
        rivet(c, (s * 0.2, 0.22, 0.29), R.trim, 0.022)
    for name, s in (('sock_shoulderL', 1), ('sock_shoulderR', -1)):
        sh = S(name)
        box(sh, (0.32, 0.18, 0.36), (s * 0.03, 0.02, 0), R.metal, rot=(0, 0, s * -0.22), bevel=0.05)
        box(sh, (0.33, 0.03, 0.37), (s * 0.05, -0.04, 0), R.dark, rot=(0, 0, s * -0.22), bevel=0)
        box(sh, (0.2, 0.06, 0.3), (s * -0.02, 0.1, 0), R.leather, rot=(0, 0, s * -0.22), bevel=0.015)  # padding


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
EMBER = 0xFF6A1A
EMBER_HOT = 0xFFC050
CHAR = 0x2A2326
CHAR2 = 0x3E3436
GOLD = 0xD9A640
BRONZE = 0x9A6432
SCALE = 0xB42A1E
SCALE_DK = 0x6E1812


def u_cinderfang(S):
    h = S('sock_handR')
    cyl(h, 0.05, 0.05, 0.42, (0, 0, 0), 0x4A1614, seg=6)                           # blood-red grip
    for y in (-0.13, -0.01, 0.11):
        cyl(h, 0.058, 0.058, 0.03, (0, y, 0), CHAR, seg=6)
    cone(h, 0.08, 0.16, (0, -0.3, 0), CHAR2, rot=(PI, 0, 0), seg=4)                # claw pommel
    gem(h, 0.065, (0, -0.25, 0), EMBER, emissive=EMBER, strength=4)
    box(h, (0.2, 0.17, 0.16), (0, 0.24, 0), CHAR, bevel=0.04)                     # jaw guard
    for s in (-1, 1):
        prism(h, [(0, -0.05), (0.34, 0.04), (0.42, 0.2), (0.3, 0.1), (0, 0.07)], 0.1, (s * 0.06, 0.24, 0), CHAR2, rot=(0, 0 if s > 0 else PI, 0), bevel=0.012)  # horn quillons
        cone(h, 0.03, 0.09, (s * 0.07, 0.35, 0.07), 0xEEE4CC, seg=3)              # fangs
    gem(h, 0.05, (0, 0.24, 0.085), EMBER, emissive=EMBER, strength=5)
    blade = [(-0.1, 0.3), (0.1, 0.3), (0.13, 0.52), (0.1, 0.56), (0.13, 0.78), (0.09, 0.82), (0.11, 1.02),
             (0.06, 1.2), (-0.02, 1.38), (-0.1, 1.46), (-0.07, 1.3), (-0.09, 1.1), (-0.12, 0.9), (-0.09, 0.86),
             (-0.12, 0.66), (-0.09, 0.62), (-0.12, 0.42)]
    prism(h, blade, 0.06, (0, 0, 0), CHAR2, bevel=0.012)
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
        box(b, (0.12, 0.05, 0.14), (0, s * 0.14, z0), GOLD, bevel=0.015)
        limb_chain(b, [(s * y, z + z0) for y, z in BOW_LIMB], 0.1, 0.08, CHAR2)
        for (y, z) in BOW_LIMB[1:4]:
            cone(b, 0.035, 0.14, (0, s * y, z + z0 - 0.07), GOLD, rot=(-1.17 if s > 0 else -PI + 1.17, 0, 0), seg=3)  # back barbs
        cone(b, 0.055, 0.2, (0, s * 0.84, z0 + 0.08), EMBER, rot=(-0.5 if s > 0 else PI + 0.5, 0, 0), seg=4, emissive=EMBER, strength=4)  # flame tips
        box(b, (0.09, 0.07, 0.1), (0, s * 0.74, z0 + 0.14), GOLD, bevel=0.015)
    box(b, (0.026, 1.24, 0.026), (0, 0, z0 + 0.195), EMBER_HOT, emissive=EMBER, strength=6, bevel=0)  # burning string


def u_kindled_ash(S):
    h = S('sock_handR')
    b = pivot(h, 'staffbody', STAFF_GRIP, STAFF_LEAN)
    cyl(b, 0.05, 0.064, 1.86, (0, 0.28, 0), 0x9A9088, seg=6)                       # pale ash wood
    for y in (-0.45, 0.35, 0.8):
        cyl(b, 0.07, 0.07, 0.05, (0, y, 0), CHAR, seg=6)
    cyl(b, 0.07, 0.07, 0.24, (0, 0.0, 0), 0x4A1614, seg=6)
    cone(b, 0.06, 0.18, (0, -0.74, 0), CHAR, rot=(PI, 0, 0), seg=4)
    for i in range(4):                                                             # ash branches cradle
        a = i * PI / 2 + PI / 4
        x, z = math.cos(a), math.sin(a)
        box(b, (0.05, 0.36, 0.05), (x * 0.11, 1.34, z * 0.11), 0x9A9088, rot=(z * 0.35, 0, -x * 0.35), bevel=0.015)
        box(b, (0.045, 0.3, 0.045), (x * 0.15, 1.62, z * 0.15), CHAR, rot=(-z * 0.35, 0, x * 0.35), bevel=0.012)
        gem(b, 0.03, (x * 0.1, 1.77, z * 0.1), EMBER, emissive=EMBER, strength=4)
    ring(b, 0.2, 0.16, 0.045, (0, 1.48, 0), CHAR, seg=8)                           # cage hoop
    cyl(b, 0.09, 0.06, 0.1, (0, 1.2, 0), CHAR, seg=6)
    gem(b, 0.13, (0, 1.48, 0), EMBER, emissive=EMBER, strength=5)                  # ember heart
    gem(b, 0.07, (0, 1.5, 0.06), EMBER_HOT, emissive=EMBER_HOT, strength=6)
    cone(b, 0.07, 0.2, (0, 1.66, 0), EMBER_HOT, seg=4, emissive=EMBER, strength=5)  # flame tongue


def u_ashen_crown(S):
    h = S('sock_head')
    box(h, (0.57, 0.26, 0.57), (0, 0.2, 0), CHAR, taper=(0.82, 0.82), bevel=0.06)  # charred skullcap
    box(h, (0.62, 0.11, 0.62), (0, 0.15, 0), BRONZE, bevel=0.025)                  # crown band
    for i in range(10):
        a = i * 2 * PI / 10 + PI / 2
        x, z = math.cos(a) * 0.3, math.sin(a) * 0.3
        tall = 0.3 if i == 0 else (0.24 if i in (1, 9) else 0.17)
        cone(h, 0.06, tall, (x, 0.2 + tall / 2, z), BRONZE, rot=(math.sin(a) * 0.18, 0, -math.cos(a) * 0.18), seg=4)
    gem(h, 0.05, (0, 0.17, 0.315), EMBER, emissive=EMBER, strength=5)
    box(h, (0.5, 0.2, 0.06), (0, 0.02, 0.285), CHAR2, taper=(1.05, 1), bevel=0.02)  # half mask (jaw stays open)
    prism(h, [(-0.05, 0.0), (0.05, 0.0), (0.0, -0.12)], 0.06, (0, -0.07, 0.3), CHAR2)  # beak
    for s in (-1, 1):
        box(h, (0.13, 0.045, 0.02), (s * 0.1, 0.035, 0.318), EMBER, rot=(0, 0, s * -0.2), emissive=EMBER, strength=6, bevel=0)  # ember eyes
        box(h, (0.055, 0.3, 0.36), (s * 0.29, 0.0, -0.03), CHAR, bevel=0.018)       # cheek plates
        box(h, (0.02, 0.2, 0.02), (s * 0.318, 0.0, 0.04), EMBER, rot=(0.3, 0, 0), emissive=EMBER, strength=3, bevel=0)  # glowing crack
    box(h, (0.55, 0.28, 0.06), (0, 0.0, -0.28), CHAR, rot=(-0.15, 0, 0), bevel=0.02)
    for a in (0.4, 1.9, 3.3, 4.9):                                                 # cracks glowing through the cap
        box(h, (0.022, 0.012, 0.17), (math.sin(a) * 0.1, 0.331, math.cos(a) * 0.1), EMBER, rot=(0, a, 0), emissive=EMBER, strength=3, bevel=0)
    gem(h, 0.06, (0, 0.335, 0), EMBER_HOT, emissive=EMBER, strength=5)


def rot_of(*steps):
    """Compose rotations applied in order (parent frame) into the ZYX Euler that _link uses."""
    m = Matrix.Identity(3)
    for axis, ang in steps:
        m = Matrix.Rotation(ang, 3, axis) @ m
    e = m.to_euler('ZYX')
    return (e.x, e.y, e.z)


def scale(p, pos, w, hgt, color, rot=(0, 0, 0)):
    return prism(p, [(-w / 2, hgt / 2), (w / 2, hgt / 2), (w / 2, 0), (0, -hgt / 2), (-w / 2, 0)], 0.035, pos, color, rot=rot)


def u_scaleguard(S):
    c = S('sock_chest')
    box(c, (0.76, 0.66, 0.53), (0, 0.0, 0), 0x5A5E66, taper=(1.08, 1.04), bevel=0.05)  # mail under the scales
    box(c, (0.46, 0.11, 0.38), (0, 0.33, 0), GOLD, bevel=0.03)
    box(c, (0.76, 0.29, 0.52), (0, -0.47, 0), 0x5A5E66, taper=(0.96, 0.96), bevel=0.035)
    box(c, (0.8, 0.1, 0.56), (0, -0.33, 0), 0x3A2A22, bevel=0.025)
    box(c, (0.14, 0.12, 0.05), (0, -0.33, 0.285), GOLD, bevel=0.015)
    for face in (1, -1):
        for r, y in enumerate((0.2, 0.06, -0.08, -0.21)):
            n = 5 if r % 2 == 0 else 4
            k = 1 + 0.08 * (y + 0.33) / 0.66
            half_d = 0.265 * (1 + 0.04 * (y + 0.33) / 0.66)
            for i in range(n):
                x = (i - (n - 1) / 2) * 0.15 * k
                col = SCALE if (i + r) % 2 == 0 else SCALE_DK
                scale(c, (x, y, face * (half_d + 0.01)), 0.15, 0.17, col, rot=(face * -0.22, 0 if face > 0 else PI, 0))
        for i in range(5):
            x = (i - 2) * 0.15
            scale(c, (x, -0.5, face * 0.27), 0.14, 0.2, SCALE_DK if i % 2 else SCALE, rot=(face * -0.12, 0 if face > 0 else PI, 0))
    gem(c, 0.07, (0, 0.14, 0.31), EMBER, emissive=EMBER, strength=5)
    box(c, (0.14, 0.14, 0.04), (0, 0.14, 0.29), GOLD, rot=(0, 0, PI / 4), bevel=0.012)
    for name, s in (('sock_shoulderL', 1), ('sock_shoulderR', -1)):
        sh = S(name)
        box(sh, (0.36, 0.2, 0.44), (s * 0.04, 0.03, 0), SCALE_DK, rot=(0, 0, s * -0.25), bevel=0.06)
        for i, (dx, dy, rz) in enumerate(((-0.05, 0.16, 0.35), (0.07, 0.12, 0.45), (0.18, 0.05, 0.6))):
            for j, z in enumerate((-0.13, 0.0, 0.13)):
                scale(sh, (s * dx, dy, z), 0.15, 0.2, SCALE if (i + j) % 2 == 0 else SCALE_DK,
                      rot=rot_of(('X', -PI / 2), ('Y', s * PI / 2), ('Z', s * -rz)))
        box(sh, (0.38, 0.05, 0.46), (s * 0.06, -0.03, 0), GOLD, rot=(0, 0, s * -0.25), bevel=0.012)
        cone(sh, 0.06, 0.3, (s * 0.1, 0.24, -0.06), 0xEEE4CC, rot=(-0.4, 0, s * -0.7), seg=4)  # horn
        cone(sh, 0.045, 0.2, (s * 0.14, 0.16, 0.1), 0xEEE4CC, rot=(0.2, 0, s * -0.9), seg=4)


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
