"""Goblin Grunt, Kobold Slinger, Ember Cultist and Cinder Priest, from their approved concept sheets (October 3).
Faces +Z; right-side parts (armR/legR) at -X. Rig names per src/render/anim.ts (body, head, armL/R, elbowL/R, handL/R,
legL/R, tail1..; a staff on sock_handR framed by staffbody, a club on weapon, the kobold's sling on sling)."""
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

PI = math.pi


def ear_wedge(head, s, base, span, up, depth, color, inner_color):
    """A flat wedge ear swept out from the side of the head, a darker inner ear laid on its front."""
    pts = [(0.0, -0.1), (s * span, up), (0.0, 0.11)]
    prism(head, pts if s > 0 else [pts[0], pts[2], pts[1]], depth, base, color, bevel=0.012)
    ipts = [(0.0, -0.05), (s * span * 0.74, up * 0.85), (0.0, 0.07)]
    prism(head, ipts if s > 0 else [ipts[0], ipts[2], ipts[1]], 0.02, (base[0] + s * 0.02, base[1] + 0.005, base[2] + depth / 2),
          inner_color)


# ─── Goblin Grunt ────────────────────────────────────────────────────────────
# A squat green brute: a big flat-topped head under a heavy brow, a big nose, tusks jutting up from the underbite and
# wide wedge ears; a bare barrel chest with a strap and an iron ring across it, a red hide pauldron on the left
# shoulder and a red back plate on crossed straps; a studded belt with a pouch and torn red flaps; studded wrist bands;
# wrapped boots; a spiked wooden club.
GOB = 0x7CBA3E
GOB_DK = 0x4F8A2C
HIDE = 0x9E3D26        # red hide: pauldron, back plate, flaps
HIDE_DK = 0x6E2818
LEATHER = 0x7A4A2A
LEATHER_DK = 0x4A2E1A
IRON = 0x4A4A52
BONE = 0xEDE0C4
GOB_EYE = 0xF4EAC4
MOUTH = 0x4A3020
CLUB = 0x6E4426
# The goblin's LEGO hand: as the hero's (hero.py HAND), a little chunkier.
GOB_HAND = dict(outer=0.145, inner=(0.068, 0.082), depth=0.24, gap=0.07, gap_tilt=0.6, stub=(0.13, 0.08, 0.14))


def goblin():
    scene, root = fresh_scene('DB_goblin')
    hip = 0.55
    for name, x in (('legL', 0.16), ('legR', -0.16)):
        s = 1 if x > 0 else -1
        l = pivot(root, name, (x, hip, 0))
        box(l, (0.27, 0.22, 0.29), (0, -0.08, 0), GOB_DK, bevel=0.04)                     # thigh
        box(l, (0.24, 0.16, 0.26), (0, -0.23, 0), GOB, bevel=0.035)                       # knee
        box(l, (0.29, 0.17, 0.31), (0, -0.37, 0), LEATHER, bevel=0.035)                   # boot shaft
        box(l, (0.3, 0.045, 0.32), (0, -0.33, 0), LEATHER_DK, bevel=0.01)                 # wrap
        box(l, (0.3, 0.045, 0.32), (0, -0.4, 0), LEATHER_DK, bevel=0.01)
        box(l, (0.31, 0.14, 0.42), (0, -0.47, 0.05), LEATHER, bevel=0.04)                 # foot
        box(l, (0.32, 0.045, 0.43), (0, -0.5275, 0.05), 0x2A1E16, bevel=0.012)           # sole
    body = pivot(root, 'body', (0, hip, 0))
    # Belt, flaps and pouch.
    box(body, (0.62, 0.22, 0.44), (0, -0.02, 0), LEATHER_DK, bevel=0.04)                  # seat
    box(body, (0.66, 0.11, 0.48), (0, 0.06, 0.01), LEATHER, bevel=0.03)                   # belt
    for x in (-0.24, -0.08, 0.08, 0.24):
        box(body, (0.035, 0.035, 0.02), (x, 0.06, 0.252), IRON, rot=(0, 0, PI / 4), bevel=0.008)
    for x, w, ln, col in ((-0.17, 0.15, 0.12, HIDE), (0.0, 0.17, 0.2, LEATHER_DK), (0.16, 0.14, 0.1, HIDE)):   # torn flaps
        box(body, (w, ln, 0.035), (x, -ln / 2, 0.235), col, rot=(-0.08, 0, 0), bevel=0.01)
        prism(body, [(-w / 2 + 0.01, 0), (0.0, -0.05), (w / 2 - 0.01, 0)], 0.035, (x, -ln + 0.005, 0.235 + ln * 0.08), col,
              rot=(-0.08, 0, 0))
    for x in (-0.15, 0.13):                                                                 # and behind
        box(body, (0.2, 0.2, 0.035), (x, -0.1, -0.235), HIDE_DK, rot=(0.08, 0, 0), bevel=0.01)
    box(body, (0.16, 0.18, 0.11), (0.2, -0.02, 0.27), LEATHER, bevel=0.03)                # pouch
    box(body, (0.17, 0.07, 0.12), (0.2, 0.05, 0.275), LEATHER_DK, rot=(0.15, 0, 0), bevel=0.015)
    box(body, (0.03, 0.06, 0.02), (0.2, 0.0, 0.33), IRON, bevel=0.006)
    # Bare barrel chest leaning forward, shoulders broader than the waist.
    box(body, (0.64, 0.52, 0.44), (0, 0.36, 0.03), GOB, rot=(0.18, 0, 0), taper=(1.06, 1.05), bevel=0.07)
    box(body, (0.46, 0.18, 0.06), (0, 0.42, 0.26), GOB_DK, rot=(0.18, 0, 0), bevel=0.03)   # pecs
    # Strap from the right shoulder to the left hip, an iron ring on the chest; crossed straps and a red plate behind.
    box(body, (0.08, 0.72, 0.03), (0.0, 0.35, 0.27), LEATHER_DK, rot=(0.18, 0, 0.72), bevel=0.008)
    box(body, (0.11, 0.11, 0.03), (-0.04, 0.42, 0.29), IRON, rot=(0.18, 0, PI / 4), bevel=0.015)
    box(body, (0.05, 0.05, 0.03), (-0.04, 0.42, 0.3), LEATHER_DK, rot=(0.18, 0, PI / 4), bevel=0)
    for k in (-1, 1):
        box(body, (0.08, 0.72, 0.03), (0.0, 0.35, -0.21), LEATHER_DK, rot=(-0.16, 0, k * 0.72), bevel=0.008)
    box(body, (0.3, 0.24, 0.05), (0, 0.42, -0.23), HIDE, rot=(-0.16, 0, 0), bevel=0.02)
    for x in (-0.09, 0.09):
        for y in (0.35, 0.49):
            box(body, (0.04, 0.04, 0.02), (x, y, -0.26 + (y - 0.42) * 0.16), IRON, rot=(-0.16, 0, PI / 4), bevel=0.008)
    # Head: big and flat-topped, pushed forward of the chest.
    head = pivot(body, 'head', (0, 0.64, 0.14))
    box(head, (0.6, 0.5, 0.52), (0, 0.22, 0), GOB, bevel=0.08)
    box(head, (0.56, 0.1, 0.12), (0, 0.36, 0.23), GOB_DK, bevel=0.03)                     # heavy brow
    box(head, (0.17, 0.24, 0.18), (0, 0.17, 0.31), GOB_DK, taper=(0.8, 0.8), bevel=0.04)  # nose
    box(head, (0.4, 0.07, 0.05), (0, 0.06, 0.255), MOUTH, bevel=0.015)                    # mouth
    for s in (-1, 1):
        ear_wedge(head, s, (s * 0.27, 0.27, -0.03), 0.42, 0.13, 0.07, GOB, GOB_DK)
        box(head, (0.12, 0.085, 0.02), (s * 0.15, 0.27, 0.262), GOB_EYE, bevel=0)          # eyes under the brow
        beam(head, (s * 0.15, 0.03, 0.265), (s * 0.165, 0.15, 0.275), 0.055, BONE, d=0.04, w1=0.012, d1=0.012)  # tusks
    # Arms: thick, an elbow (upper arm and forearm rounded about it, one seamless joint), a studded wrist band and big
    # LEGO hands (_common.clip_hand). Red hide pauldron on the left. The arms hang against the chest's sides and swing
    # past them (fitcheck.py arm_clip_all). Authored straight; the game bends the elbows (anim.ts).
    elb, wr = 0.26, 0.42
    for name, x in (('armL', 0.46), ('armR', -0.46)):
        s = 1 if x > 0 else -1
        a = pivot(body, name, (x, 0.54, 0.02))
        joint_limb(a, 0.24, 0.27, 0.01, -elb, GOB, round_bottom=True, bevel=0.05)          # upper arm
        e = pivot(a, 'elbow' + ('L' if s > 0 else 'R'), (0, -elb, 0))
        joint_limb(e, 0.25, 0.27, 0.0, elb - wr, GOB, round_top=True, bevel=0.05)          # forearm
        box(e, (0.29, 0.1, 0.28), (0, elb - 0.36, 0), LEATHER, bevel=0.02)                 # wrist band
        for z in (-0.08, 0.08):
            box(e, (0.012, 0.035, 0.035), (s * 0.15, elb - 0.36, z), IRON, bevel=0.005)
        h = pivot(e, 'hand' + ('L' if s > 0 else 'R'), (0, elb - wr, 0))
        clip_hand(h, (0, -GOB_HAND['outer'], 0), GOB_DK, s, **GOB_HAND)                   # the club's haft through it
        if s > 0:
            box(a, (0.32, 0.15, 0.4), (0.07, 0.04, 0), HIDE, rot=(0, 0, -0.32), bevel=0.035)    # pauldron
            box(a, (0.07, 0.22, 0.4), (0.175, -0.08, 0), HIDE, rot=(0, 0, -0.1), bevel=0.025)
            for z in (-0.1, 0.1):
                box(a, (0.035, 0.035, 0.02), (0.1, 0.125, z), IRON, rot=(0, 0, -0.32), bevel=0.006)
                box(a, (0.02, 0.035, 0.035), (0.212, -0.08, z), IRON, rot=(0, 0, -0.1), bevel=0.006)
        else:
            w = pivot(h, 'weapon', (0, -GOB_HAND['outer'], 0), (PI / 2, 0, 0))
            box(w, (0.1, 0.92, 0.1), (0, 0.38, 0), CLUB, taper=(1.4, 1.4), bevel=0.02)       # haft
            box(w, (0.125, 0.28, 0.125), (0, 0.01, 0), LEATHER_DK, bevel=0.02)               # grip wrap, in the hand
            box(w, (0.16, 0.05, 0.16), (0, 0.5, 0), LEATHER, bevel=0.012)                    # band
            box(w, (0.17, 0.05, 0.17), (0, 0.66, 0), LEATHER, bevel=0.012)
            box(w, (0.32, 0.3, 0.32), (0, 0.86, 0), CLUB, rot=(0, PI / 4, 0), bevel=0.07)    # octagonal head
            box(w, (0.3, 0.06, 0.3), (0, 0.72, 0), 0x55341C, rot=(0, PI / 4, 0), bevel=0.02)
            for ang, y in ((0.0, 0.88), (2.1, 0.84), (4.2, 0.9), (1.05, 0.98)):
                d = (math.cos(ang), 0, math.sin(ang))
                tip_y = y + (0.18 if ang == 1.05 else 0.04)
                r0, r1 = (0.06, 0.12) if ang == 1.05 else (0.13, 0.29)
                beam(w, (d[0] * r0, y, d[2] * r0), (d[0] * r1, tip_y, d[2] * r1), 0.075, BONE, w1=0.014)
    return scene


# ─── Kobold Slinger ──────────────────────────────────────────────────────────
# A short rust-orange lizard with a big boxy head on a long snout, cream belly plates and jaw, two big bone horns bound
# in teal iron, a teal pauldron with a bone spike on the left shoulder, teal wrist bands, a strap and belt of pouches
# full of sling stones, a sling hanging from the right hand, clawed feet and a spiked tail.
KOB = 0xC8762F
KOB_DK = 0x8E4E1E
BELLY = 0xEBC57A
TEAL = 0x5E9A98
STONE = 0x8C9096
K_LEATHER = 0x6A4024
K_LEATHER_DK = 0x45291A
SPINE = 0x7A3C16


def kobold():
    scene, root = fresh_scene('DB_kobold')
    hip = 0.36
    for name, x in (('legL', 0.14), ('legR', -0.14)):
        l = pivot(root, name, (x, hip, 0))
        box(l, (0.24, 0.24, 0.28), (0, -0.07, 0), KOB, bevel=0.045)                          # thigh
        box(l, (0.19, 0.14, 0.2), (0, -0.21, -0.01), KOB, bevel=0.035)                        # shank
        box(l, (0.24, 0.12, 0.32), (0, -hip + 0.06, 0.05), KOB_DK, bevel=0.035)               # foot
        for dx in (-0.065, 0.0, 0.065):                                                       # three toe claws
            beam(l, (dx, -hip + 0.055, 0.19), (dx * 1.15, -hip + 0.008, 0.29), 0.05, BONE, w1=0.012, d=0.045, d1=0.01)
        beam(l, (0, -hip + 0.06, -0.1), (0, -hip + 0.01, -0.18), 0.045, BONE, w1=0.01, d=0.04, d1=0.01)   # heel spur
    body = pivot(root, 'body', (0, hip, 0))
    box(body, (0.48, 0.46, 0.38), (0, 0.23, 0), KOB, rot=(0.1, 0, 0), taper=(1.06, 1), bevel=0.06)
    for i, y in enumerate((0.1, 0.22, 0.34)):                                                 # belly plates
        box(body, (0.3 - i * 0.02, 0.11, 0.05), (0, y, 0.19 + y * 0.1), BELLY, rot=(0.1, 0, 0), bevel=0.02)
    box(body, (0.5, 0.09, 0.4), (0, 0.04, 0), K_LEATHER, bevel=0.025)                         # belt
    # Stone pouches: one on each hip at the front, one on the back of the strap.
    for x, z, yaw in ((0.19, 0.17, 0.3), (-0.19, 0.17, -0.3), (0.08, -0.22, PI + 0.2)):
        p = pivot(body, 'pouch', (x, 0.0, z), (0, yaw, 0))
        box(p, (0.15, 0.14, 0.11), (0, 0, 0), K_LEATHER, bevel=0.03)
        box(p, (0.16, 0.035, 0.12), (0, 0.06, 0.0), K_LEATHER_DK, bevel=0.01)
        box(p, (0.09, 0.085, 0.09), (0, 0.095, -0.005), STONE, rot=(0.4, 0.6, 0.3), bevel=0.025)
    # Strap from the left shoulder to the right hip, front and back.
    box(body, (0.07, 0.56, 0.03), (0.0, 0.25, 0.225), K_LEATHER_DK, rot=(0.1, 0, -0.75), bevel=0.008)
    box(body, (0.07, 0.56, 0.03), (0.0, 0.25, -0.2), K_LEATHER_DK, rot=(0.1, 0, -0.75), bevel=0.008)
    # Tail: three tapering segments to the ground, dark spikes along the top.
    t1 = pivot(body, 'tail1', (0, 0.07, -0.14))
    beam(t1, (0, 0.0, 0.05), (0, -0.09, -0.3), 0.24, KOB, w1=0.18, d=0.22, d1=0.16)
    t2 = pivot(t1, 'tail2', (0, -0.09, -0.3))
    beam(t2, (0, 0.01, 0.03), (0, -0.12, -0.28), 0.18, KOB, w1=0.12, d=0.16, d1=0.11)
    t3 = pivot(t2, 'tail3', (0, -0.12, -0.28))
    beam(t3, (0, 0.01, 0.03), (0, -0.03, -0.24), 0.12, KOB, w1=0.07, d=0.11, d1=0.06)
    beam(t3, (0, -0.03, -0.22), (0, 0.03, -0.4), 0.075, SPINE, w1=0.008, d=0.065, d1=0.008)    # spike tip
    for t, y0, z0, h in ((t1, 0.08, -0.1, 0.11), (t1, 0.04, -0.22, 0.1), (t2, 0.06, -0.08, 0.09), (t2, 0.02, -0.19, 0.08)):
        beam(t, (0, y0 - 0.03, z0 + 0.03), (0, y0 + h, z0 - 0.05), 0.035, SPINE, w1=0.008, d=0.09, d1=0.012)
    # Head: a big box skull over a long box snout with a cream jaw; white eyes high on the face; horns in teal bands.
    head = pivot(body, 'head', (0, 0.46, 0.05))
    box(head, (0.44, 0.4, 0.4), (0, 0.18, 0), KOB, bevel=0.06)
    box(head, (0.3, 0.19, 0.36), (0, 0.11, 0.33), KOB, taper=(0.92, 1), bevel=0.045)          # snout
    box(head, (0.27, 0.06, 0.34), (0, 0.0, 0.31), BELLY, bevel=0.02)                          # jaw
    box(head, (0.42, 0.06, 0.12), (0, 0.33, 0.17), KOB_DK, bevel=0.02)                        # brow
    for s in (-1, 1):
        box(head, (0.085, 0.085, 0.02), (s * 0.12, 0.26, 0.205), 0xF6F0E2, bevel=0)           # eyes
        box(head, (0.035, 0.04, 0.02), (s * 0.06, 0.14, 0.512), 0x1A1210, bevel=0)            # nostrils
        horn = [(s * 0.12, 0.33, 0.0), (s * 0.155, 0.43, -0.1), (s * 0.18, 0.47, -0.25)]
        beam(head, horn[0], horn[1], 0.1, BONE, w1=0.08)
        beam(head, horn[1], horn[2], 0.08, BONE, w1=0.012)
        beam(head, (s * 0.135, 0.38, -0.05), (s * 0.142, 0.41, -0.066), 0.12, TEAL, w1=0.115, bevel=0.01)  # band
    for i, hgt in enumerate((0.1, 0.09)):                                                     # small dark crest fins
        z = -0.02 - i * 0.1
        beam(head, (0, 0.36, z + 0.02), (0, 0.36 + hgt, z - 0.05), 0.035, SPINE, d=0.08, w1=0.01, d1=0.02)
    # Arms: stubby, an elbow, a teal band at the wrist, clawed hands (a lizard's, not the LEGO hand); teal pauldron
    # with a bone spike on the left. Authored straight; the game bends the elbows (anim.ts).
    elb, wr = 0.17, 0.29
    for name, x in (('armL', 0.36), ('armR', -0.36)):   # against the body's sides, clear of the hip pouches
        s = 1 if x > 0 else -1
        a = pivot(body, name, (x, 0.38, 0.0))
        joint_limb(a, 0.18, 0.2, 0.01, -elb, KOB, round_bottom=True, bevel=0.04)
        e = pivot(a, 'elbow' + ('L' if s > 0 else 'R'), (0, -elb, 0))
        joint_limb(e, 0.19, 0.21, 0.0, elb - wr, KOB, round_top=True, bevel=0.04)
        box(e, (0.22, 0.07, 0.23), (0, elb - 0.25, 0), TEAL, bevel=0.015)                     # wrist band
        h = pivot(e, 'hand' + ('L' if s > 0 else 'R'), (0, elb - wr, 0))
        box(h, (0.2, 0.16, 0.21), (0, wr - 0.37, 0.01), KOB_DK, bevel=0.05)                   # hand
        for dx in (-0.06, 0.0, 0.06):
            beam(h, (dx, wr - 0.43, 0.08), (dx, wr - 0.48, 0.12), 0.035, BONE, w1=0.01, d=0.03, d1=0.01)
        if s > 0:
            box(a, (0.28, 0.12, 0.3), (0.03, 0.02, 0), TEAL, rot=(0, 0, -0.3), bevel=0.035)
            box(a, (0.06, 0.16, 0.3), (0.13, -0.07, 0), TEAL, rot=(0, 0, -0.1), bevel=0.025)
            beam(a, (0.05, 0.08, 0), (0.12, 0.25, -0.02), 0.08, BONE, w1=0.012)              # spike
        else:
            # The sling hangs from the hand: two cords down to a cradle holding a stone (local +Z is down).
            w = pivot(h, 'sling', (0, wr - 0.38, 0.02), (PI / 2, 0, 0))
            for dx in (-0.045, 0.045):
                beam(w, (dx, 0.0, 0.05), (dx * 1.8, 0.0, 0.2), 0.032, K_LEATHER, bevel=0)
            box(w, (0.21, 0.15, 0.05), (0, 0.0, 0.27), K_LEATHER_DK, bevel=0.015)              # cradle floor
            for dx in (-0.095, 0.095):
                box(w, (0.035, 0.15, 0.1), (dx, 0.0, 0.235), K_LEATHER_DK, bevel=0.01)          # cradle sides
            box(w, (0.13, 0.13, 0.13), (0, 0.0, 0.215), STONE, rot=(0.4, 0.6, 0.3), bevel=0.035)
    return scene


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


def hood_rows_fn(rows, arch):
    """A cowl as one surface over (y, half width, half depth, z offset, half-angle of the front opening) rows: u runs
    round from the left edge of the face opening, round the back, to its right edge; v climbs the rows."""
    def fn(u, v):
        k = v * (len(rows) - 1)
        i = min(int(k), len(rows) - 2)
        f = k - i
        y, a, b, dz, op = [p + (q - p) * f for p, q in zip(rows[i], rows[i + 1])]
        al = math.radians(op)
        t = al + (2 * PI - 2 * al) * u
        return (a * ssin(t, 2.6), y, dz + b * scos(t, 2.6))
    return fn, arch


# The cultist's cowl (head space, y up from the neck): a mantle on the shoulders (inside the arms, which hang against
# the robe's sides), round the face, then a rounded crown over the head, as in the concept: a modest dome of cloth
# rising steadily from the back to a small soft peak that tips forward over the brow (never pulled back off a bald
# crown, never a spire). The opening is a V under the chin, widest round the face, closing in an arch under the peak.
CULT_HOOD = ((-0.2, 0.355, 0.33, -0.02, 9), (-0.05, 0.33, 0.31, -0.01, 18), (0.1, 0.3, 0.3, 0.02, 42),
             (0.26, 0.29, 0.31, 0.04, 40), (0.4, 0.28, 0.31, 0.06, 30), (0.5, 0.26, 0.3, 0.08, 14),
             (0.58, 0.22, 0.27, 0.09, 0), (0.64, 0.15, 0.2, 0.13, 0), (0.68, 0.07, 0.11, 0.2, 0), (0.7, 0.0, 0.0, 0.27, 0))
# The priest's: the same cowl drawn up into a tall pointed hood.
PRIEST_HOOD = ((-0.2, 0.375, 0.36, -0.02, 9), (-0.05, 0.35, 0.33, -0.01, 18), (0.1, 0.31, 0.32, 0.02, 42),
               (0.26, 0.3, 0.32, 0.04, 40), (0.4, 0.28, 0.31, 0.06, 26), (0.52, 0.24, 0.28, 0.06, 0),
               (0.68, 0.17, 0.21, 0.04, 0), (0.86, 0.09, 0.12, 0.0, 0), (0.98, 0.0, 0.0, -0.03, 0))


def cowl(head, rows, arch_v, inside=(0, 0.15, -0.02), shadow=0.46):
    """The hood shell, a lighter lip along the face opening, a dark void inside with two glowing eyes set back."""
    fn, _ = hood_rows_fn(rows, arch_v)
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


# The cult's LEGO hands (_common.clip_hand); a staff runs up through the right one. Each staff hangs on a sock_handR
# empty in the hand with its own frame named 'staffbody', so the game knows to carry it upright (anim.ts Hold).
CULT_HAND = dict(outer=0.125, inner=(0.068, 0.082), depth=0.21, gap=0.065, gap_tilt=0.6, stub=(0.12, 0.08, 0.13))
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


def cultist():
    scene, root = fresh_scene('DB_cultist')
    body = pivot(root, 'body', (0, 0, 0))
    # Robe in three flared tiers, each with a gold band, over a dark base step.
    box(body, (1.02, 0.07, 0.84), (0, 0.035, 0), ROBE_DK, bevel=0.02)                         # base step
    box(body, (1.0, 0.025, 0.82), (0, 0.08, 0), GOLD, bevel=0.006)
    box(body, (0.98, 0.36, 0.8), (0, 0.27, 0), ROBE, taper=(0.88, 0.88), bevel=0.045)
    box(body, (0.88, 0.05, 0.72), (0, 0.46, 0), ROBE_DK, bevel=0.015)
    box(body, (0.88, 0.025, 0.725), (0, 0.495, 0), GOLD, bevel=0.006)
    box(body, (0.82, 0.38, 0.64), (0, 0.67, 0), ROBE, taper=(0.86, 0.86), bevel=0.045)
    box(body, (0.72, 0.12, 0.56), (0, 0.86, 0), GOLD, bevel=0.03)                             # belt
    box(body, (0.68, 0.34, 0.52), (0, 1.04, 0), ROBE, bevel=0.045)
    box(body, (0.68, 0.32, 0.52), (0, 1.28, 0), ROBE, taper=(0.9, 0.9), bevel=0.05)
    gold_framed(body, (0.15, 0.14, 0.03), (0, 0.86, 0.285), ROBE_DK)                          # buckle
    # The front stole: a gold-bordered crimson panel from the belt to the hem with an ember gem, pointed at the end.
    st = pivot(body, 'stole', (0, 0.8, 0.31), (-0.15, 0, 0))
    gold_framed(st, (0.24, 0.66, 0.05), (0, -0.33, 0), ROBE_DK)
    prism(st, [(-0.12, 0.0), (0.0, -0.1), (0.12, 0.0)], 0.05, (0, -0.66, 0), GOLD)
    facet_gem(st, 0.045, (0, -0.56, 0.04), EMBER, emissive=EMBER, strength=4)
    bk = pivot(body, 'stole', (0, 0.8, -0.31), (0.15, PI, 0))                                 # and behind
    gold_framed(bk, (0.24, 0.62, 0.05), (0, -0.31, 0), ROBE_DK)
    # Pouches on both hips.
    for s in (-1, 1):
        box(body, (0.15, 0.17, 0.12), (s * 0.27, 0.76, 0.26), POUCH, bevel=0.03)
        box(body, (0.16, 0.06, 0.13), (s * 0.27, 0.83, 0.262), POUCH, rot=(0.15, 0, 0), bevel=0.012)
        box(body, (0.04, 0.04, 0.02), (s * 0.27, 0.79, 0.33), GOLD, bevel=0.006)
    head = pivot(body, 'head', (0, 1.42, 0))
    cowl(head, CULT_HOOD, 5 / 9, shadow=0.56)
    box(head, (0.12, 0.12, 0.03), (0, -0.06, 0.255), GOLD, rot=(0, 0, PI / 4), bevel=0.012)  # amulet in the mantle's V
    for s in (-1, 1):   # dark horns curling up out of the hood, gold-capped at the root
        base = (s * 0.27, 0.36, -0.04)
        box(head, (0.1, 0.06, 0.12), (s * 0.27, 0.34, -0.04), GOLD, rot=(0, 0, -s * 0.5), bevel=0.015)
        curved_horn(head, s, base, ((0.1, 0.06, -0.01), (0.14, 0.18, -0.03), (0.11, 0.3, -0.04)), 0.09)
    # Arms hang against the robe's sides (and swing past them): a sleeve bending at the elbow, a gold cuff and the
    # hands at the belt. Authored straight; the game bends the elbows and carries the staff upright (anim.ts).
    elb, wr = 0.27, 0.56
    for name, x in (('armL', 0.48), ('armR', -0.48)):
        s = 1 if x > 0 else -1
        a = pivot(body, name, (x, 1.32, 0))
        e, h = robe_arm(a, s, 0.25, 0.28, elb, wr, CULT_HAND)
        box(e, (0.3, 0.09, 0.32), (0, elb - 0.48, 0), GOLD, bevel=0.02)                        # cuff
        # Pauldron: a crimson block with a gold rim and an ember stone on its outer face.
        box(a, (0.36, 0.15, 0.4), (s * 0.04, 0.03, 0), GOLD, rot=(0, 0, -s * 0.28), bevel=0.03)
        box(a, (0.32, 0.17, 0.36), (s * 0.04, 0.045, 0), ROBE, rot=(0, 0, -s * 0.28), bevel=0.03)
        box(a, (0.075, 0.2, 0.38), (s * 0.17, -0.08, 0), GOLD, rot=(0, 0, -s * 0.12), bevel=0.02)
        box(a, (0.06, 0.08, 0.08), (s * 0.205, -0.07, 0), EMBER, emissive=EMBER, strength=3, rot=(0, 0, -s * 0.12), bevel=0.012)
        if s < 0:
            # The staff runs through the hand's hole, its butt by the ground and its gem above the hood; the game
            # holds the forearm forward so it stands upright, and keeps it upright in the raised hand in the cast.
            w = pivot(pivot(h, 'sock_handR', (0, -CULT_HAND['outer'], 0), (PI / 2, 0, 0)), 'staffbody')
            staff_shaft(w, 2.18, (1.18,), low=0.95)
            beam(w, (0, -0.91, 0), (0, -1.0, 0), 0.1, 'black', w1=0.02)                        # butt cap
            box(w, (0.16, 0.08, 0.16), (0, 1.25, 0), GOLD, bevel=0.015)                         # socket
            for k in (-1, 1):   # two iron prongs curling up and in round the gem
                box(w, (0.05, 0.22, 0.06), (k * 0.11, 1.38, 0), HORN, rot=(0, 0, -k * 0.45), bevel=0.012)
                box(w, (0.045, 0.2, 0.055), (k * 0.12, 1.56, 0), HORN, rot=(0, 0, k * 0.55), bevel=0.012)
            facet_gem(w, 0.12, (0, 1.46, 0), 0xFFD86A, emissive=0xFFC040, strength=2.2, rot=corner_up(), depth=0.17)
    return scene


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


# name: (builder, glb, preview target, preview distance)
MINIONS = {'goblin': (goblin, 'goblin', (0, 0.75, 0), 3.6), 'kobold': (kobold, 'kobold', (0, 0.5, 0), 2.6),
           'cultist': (cultist, 'cultist', (0, 1.0, 0), 4.2), 'priest': (priest, 'priest', (0, 1.35, 0), 5.4)}

if globals().get('DB_RUN', True):   # DB_ONLY = ['kobold'] exports only those; DB_RUN = False only defines the builders
    tris = {}
    for name in (globals().get('DB_ONLY') or list(MINIONS)):
        fn, file, tgt, dist = MINIONS[name]
        scene = fn()
        tris[name] = tri_count(scene)
        export(f'DB_{file}', f'{file}.glb')
        if globals().get('DB_PREVIEW', True):
            preview_sheet(f'{file}.png', target=tgt, dist=dist)
            remove_preview_rig()
    result = {'ok': True, 'tris': tris}
