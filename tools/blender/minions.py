"""Goblin Grunt, Kobold Slinger, Ember Cultist and Cinder Priest, from their approved concept sheets (October 3); the
cult's two are built in cult.py. The goblin and the cultist are built on the minifigure body every humanoid shares
(minifig.py, owner, October 4). Faces +Z; right-side parts (armR/legR) at -X. Rig names per src/render/anim.ts (body,
head, armL/R, elbowL/R, handL/R, legL/R, tail1..; a staff on sock_handR framed by staffbody, a club on weapon, the
kobold's sling on sling)."""
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
import minifig
importlib.reload(minifig)
from minifig import TORSO_FLARE, cut, figure, finish, ribbon, torso_surface
import cult
importlib.reload(cult)
from cult import cultist, priest

PI = math.pi


def ear_wedge(head, s, base, span, up, depth, color, inner_color):
    """A flat wedge ear swept out from the side of the head, a darker inner ear laid on its front."""
    pts = [(0.0, -0.1), (s * span, up), (0.0, 0.11)]
    prism(head, pts if s > 0 else [pts[0], pts[2], pts[1]], depth, base, color, bevel=0.012)
    ipts = [(0.0, -0.05), (s * span * 0.74, up * 0.85), (0.0, 0.07)]
    prism(head, ipts if s > 0 else [ipts[0], ipts[2], ipts[1]], 0.02, (base[0] + s * 0.02, base[1] + 0.005, base[2] + depth / 2),
          inner_color)


# ─── Goblin Grunt ────────────────────────────────────────────────────────────
# On the minifigure body (minifig.py) with short legs, from his approved sheet (October 3): his own big flat-topped
# head under a heavy brow in two blocks, a big nose, tusks jutting up from the underbite and long wedge ears; an open
# leather vest over the green chest; a baldric from the belt across the chest, over the left shoulder under his red
# hide shoulder pad and down the back into the belt; the pad strapped on the shoulder; a wide studded belt with pouches
# and torn flaps; studded wrist bands; boots with dark wraps; a spiked wooden club through his right hand.
GOB = 0x7CBA3E
GOB_DK = 0x4F8A2C
HIDE = 0x9E3D26        # red hide: the shoulder pad and the flaps
LEATHER = 0x7A4A2A
LEATHER_DK = 0x4A2E1A
VEST = 0x94643A
IRON = 0x4A4A52
BONE = 0xEDE0C4
GOB_EYE = 0xF4EAC4
MOUTH = 0x4A3020
CLUB = 0x6E4426
# The baldric: up the chest from the belt at the right hip to the left shoulder, over it, and down the back to the belt.
BALDRIC_LOW, BALDRIC_HIGH, BALDRIC_X = (-0.21, 0.04), (0.29, 0.68), 0.3


def baldric(body):
    """The baldric as one strap: up the chest from behind the belt at the right hip, over the left shoulder (on the
    vest's shoulder, under the pad) and down the back into the belt again."""
    (x0, y0), (x1, y1) = BALDRIC_LOW, BALDRIC_HIGH
    front, back = [], []
    for k in range(7):
        f = k / 6
        p, n = torso_surface(y0 + (y1 - y0) * f, x0 + (x1 - x0) * f, 1)
        front.append((p, n))
        p, n = torso_surface(y0 + (y1 - y0) * f, x0 + (x1 - x0) * f, -1)
        back.append((p, n))
    r = 0.7071
    over = [((BALDRIC_X, 0.725, 0.193), (0, r, r)), ((BALDRIC_X, 0.75, 0.12), (0, 1, 0)), ((BALDRIC_X, 0.75, -0.12), (0, 1, 0)),
            ((BALDRIC_X, 0.725, -0.193), (0, r, -r))]
    path = front + [(Vector(p), Vector(n)) for p, n in over] + list(reversed(back))
    ribbon(body, [p for p, _ in path], [n for _, n in path], 0.08, 0.04, LEATHER_DK)
    # An iron ring on the chest and an iron keeper where the strap goes into the belt, both turned with the strap.
    turn = -math.atan2(x1 - x0, y1 - y0)
    for f, size, color in ((0.55, (0.13, 0.13, 0.025), IRON), (0.55, (0.065, 0.065, 0.03), LEATHER_DK),
                           (0.155, (0.12, 0.035, 0.03), IRON)):
        p, _ = torso_surface(y0 + (y1 - y0) * f, x0 + (x1 - x0) * f, 1, lift=0.045)
        box(body, size, tuple(p), color, rot=(0, 0, turn), bevel=0.008)


def leg_flap(leg, s, z, color):
    """A torn flap hanging from under the belt over the front (z > 0) or back of a thigh, riding the leg."""
    box(leg, (0.19, 0.2, 0.025), (s * 0.01, -0.09, z), color, bevel=0.008)
    prism(leg, [(-0.095, 0.0), (0.095, 0.0), (s * 0.03, -0.06)], 0.025, (s * 0.01, -0.19, z), color)


def goblin():
    fig = figure('DB_goblin', dict(torso=GOB, hips=LEATHER_DK, belt=LEATHER, neck=GOB, upper=GOB, forearm=GOB, hand=GOB,
                                   thigh=GOB, shin=LEATHER, foot=LEATHER, sole=0x2A1E16), legs='short', head=False)
    body = fig.body
    # Boots: dark wraps round each shaft; torn red flaps over the thighs, front and back, riding the legs.
    for S, s in (('L', 1), ('R', -1)):
        leg = fig['leg' + S]
        for y in (-0.27, -0.34):
            box(leg, (0.285, 0.035, 0.305), (0, y, 0), LEATHER_DK, bevel=0.008)
        leg_flap(leg, s, 0.235, HIDE)
        leg_flap(leg, s, -0.235, LEATHER_DK)
    # Head: big and flat-topped, a little forward, sitting low on a short neck.
    head = fig['head']
    box(head, (0.56, 0.48, 0.52), (0, 0.26, 0.04), GOB, bevel=0.08)
    for s in (-1, 1):
        box(head, (0.23, 0.1, 0.1), (s * 0.135, 0.38, 0.28), GOB_DK, rot=(0, 0, s * 0.1), bevel=0.03)        # brow
        box(head, (0.12, 0.085, 0.02), (s * 0.14, 0.295, 0.305), GOB_EYE, bevel=0)                          # eye
        beam(head, (s * 0.15, 0.06, 0.3), (s * 0.165, 0.18, 0.31), 0.055, BONE, d=0.04, w1=0.012, d1=0.012)   # tusk
        ear_wedge(pivot(head, 'ear', (s * 0.26, 0.3, -0.04), (0, s * 0.5, 0)), s, (0, 0, 0), 0.42, 0.14, 0.07, GOB, GOB_DK)
    box(head, (0.17, 0.24, 0.18), (0, 0.2, 0.33), GOB_DK, taper=(0.8, 0.8), bevel=0.04)                    # nose
    box(head, (0.4, 0.07, 0.05), (0, 0.09, 0.29), MOUTH, bevel=0.015)                                       # mouth
    # The open vest: a leather shell over the torso, open down the front over the green chest and round the neck.
    vest = box(body, (0.72, 0.68, 0.462), (0, 0.43, 0), VEST, taper=TORSO_FLARE, bevel=0.05)
    cut(vest, box(body, (0.684, 0.69, 0.424), (0, 0.405, 0), VEST, taper=TORSO_FLARE, bevel=0.05),
        prism(body, [(-0.19, 0.05), (0.19, 0.05), (0.21, 0.82), (-0.21, 0.82)], 0.4, (0, 0, 0.25), VEST),
        box(body, (0.42, 0.12, 0.3), (0, 0.78, -0.02), VEST, bevel=0))
    # A red hide plate sewn on the vest between the shoulder blades, studded at its corners; the baldric runs over it.
    back = fig['sock_back']
    box(back, (0.3, 0.24, 0.018), (0, 0.04, -0.029), HIDE, bevel=0.006)
    for x in (-0.1, 0.1):
        for y in (-0.04, 0.12):
            box(back, (0.035, 0.035, 0.02), (x, y, -0.04), IRON, rot=(0, 0, PI / 4), bevel=0)
    baldric(body)
    # The belt: wide and studded, a pouch on the left hip in front and one behind, a torn flap down the middle.
    belt = fig['sock_belt']
    box(belt, (0.76, 0.14, 0.52), (0, 0, 0), LEATHER, bevel=0.03)
    for x in (-0.3, 0.08, 0.32):
        box(belt, (0.035, 0.035, 0.02), (x, 0, 0.265), IRON, rot=(0, 0, PI / 4), bevel=0)
    for z in (1, -1):
        box(belt, (0.16, 0.18, 0.1), (0.2, -0.08, z * 0.3), LEATHER, bevel=0.03)                              # pouch
        box(belt, (0.17, 0.07, 0.11), (0.2, -0.01, z * 0.305), LEATHER_DK, rot=(z * 0.15, 0, 0), bevel=0.015)  # flap
        box(belt, (0.03, 0.06, 0.02), (0.2, -0.06, z * 0.355), IRON, bevel=0)                                   # clasp
    box(belt, (0.08, 0.26, 0.025), (0, -0.18, 0.235), LEATHER_DK, bevel=0.008)
    prism(belt, [(-0.04, 0.0), (0.04, 0.0), (0.0, -0.05)], 0.025, (0, -0.31, 0.235), LEATHER_DK)
    # The shoulder pad: a red hide block over the left shoulder on the shoulder's attachment point (it follows the arm
    # by 3/4), the baldric running under it; a side plate down the arm, strapped round the upper arm below it.
    pad = pivot(fig['sock_shoulderL'], 'pad', (0.04, -0.02, 0), (0, 0, -0.26))
    box(pad, (0.36, 0.16, 0.42), (0, 0, 0), HIDE, bevel=0.04)
    for z in (-0.12, 0.12):
        box(pad, (0.035, 0.02, 0.035), (0.04, 0.085, z), IRON, rot=(0, PI / 4, 0), bevel=0)
    arm = fig['armL']
    box(arm, (0.07, 0.2, 0.35), (0.158, -0.07, 0), HIDE, rot=(0, 0, -0.1), bevel=0.025)
    box(arm, (0.02, 0.035, 0.035), (0.198, -0.03, 0.1), IRON, rot=(0, 0, -0.1), bevel=0)
    box(arm, (0.27, 0.04, 0.29), (0, -0.14, 0), LEATHER_DK, bevel=0.01)                 # the strap round the arm,
    box(arm, (0.016, 0.04, 0.1), (0.2, -0.14, 0), LEATHER_DK, rot=(0, 0, -0.1), bevel=0)  # across the plate
    box(arm, (0.012, 0.055, 0.045), (0.21, -0.14, 0), IRON, rot=(0, 0, -0.1), bevel=0)   # and its buckle
    # Wrist bands, studded on the outside.
    for S, s in (('L', 1), ('R', -1)):
        c = fig['sock_cuff' + S]
        box(c, (0.235, 0.13, 0.25), (0, 0.215, 0), LEATHER, bevel=0.02)
        for z in (-0.07, 0.07):
            box(c, (0.012, 0.035, 0.035), (s * 0.122, 0.215, z), IRON, bevel=0)
    # The club through the right hand, carried at the side (a 'weapon' part: anim.ts Hold).
    w = pivot(fig['sock_handR'], 'weapon')
    box(w, (0.1, 0.92, 0.1), (0, 0.38, 0), CLUB, taper=(1.4, 1.4), bevel=0.02)                             # haft
    box(w, (0.12, 0.28, 0.12), (0, 0.01, 0), LEATHER_DK, bevel=0.02)                                        # grip wrap
    box(w, (0.16, 0.05, 0.16), (0, 0.5, 0), LEATHER, bevel=0.012)                                           # bands
    box(w, (0.17, 0.05, 0.17), (0, 0.66, 0), LEATHER, bevel=0.012)
    box(w, (0.32, 0.3, 0.32), (0, 0.86, 0), CLUB, rot=(0, PI / 4, 0), bevel=0.07)                          # octagonal head
    box(w, (0.3, 0.06, 0.3), (0, 0.72, 0), 0x55341C, rot=(0, PI / 4, 0), bevel=0.02)
    for ang, y in ((0.0, 0.88), (2.1, 0.84), (4.2, 0.9), (1.05, 0.98)):
        d = (math.cos(ang), 0, math.sin(ang))
        tip_y = y + (0.18 if ang == 1.05 else 0.04)
        r0, r1 = (0.06, 0.12) if ang == 1.05 else (0.13, 0.29)
        beam(w, (d[0] * r0, y, d[2] * r0), (d[0] * r1, tip_y, d[2] * r1), 0.075, BONE, w1=0.014)
    finish(fig)
    return fig.scene


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


# name: (builder, glb, preview target, preview distance)
MINIONS = {'goblin': (goblin, 'goblin', (0, 0.9, 0), 4.0), 'kobold': (kobold, 'kobold', (0, 0.5, 0), 2.6),
           'cultist': (cultist, 'cultist', (0, 1.3, 0), 5.2), 'priest': (priest, 'priest', (0, 1.35, 0), 5.4)}

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
