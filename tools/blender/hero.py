"""Hero BASE: the starting outfit, big hands, sockets for gear/hair (see docs/ART_CONTRACT.md).

Built from the approved concept sheet (October 3): a blue tunic with a dark standing collar and sleeve bands, a pale
trim down the split front of its skirt, a belt with a square gold buckle and a pouch, a strap over the right shoulder
with a gold clasp and a fang, one steel pauldron on the left shoulder, leather bracers and tall turned-down boots.

The skeleton, joints and sockets are unchanged from the earlier hero, so every gear piece keeps its fit. The starting
outfit's extra pieces live under `outfit_<slot>_*` empties that the game hides when gear fills that slot (registry.ts
HeroDresser): the collar, the skirt's split, the strap, clasp, buckle, pouch and pauldron under body armour, the bracers under gloves, the boots under
boots. No armour slot, weapon, hair or helmet here: those are separate gear_*.glb / hair_*.glb / beard_*.glb files
attached to the sock_* empties at runtime. Faces +Z; right side (armR/legR) is at -X.
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

PI = math.pi
HIP = 0.9
GOLD = 0xD9A640      # buckle, clasp and studs (authored, not recoloured)
EYE = 0x1E1614
TRIM = 0xA9B6C6      # the pale trim down the tunic's front and round its hem
UNDER = 0xC9CFD6     # the undershirt showing in the collar's V
FANG = 0xEDE3CB
STEEL = 0x808C9C     # the pauldron: painted steel
SOLE = 0x2E1E14


def build_hero(scene_name='DB_hero'):
    scene, root = fresh_scene(scene_name)

    # Legs: trousers (cloth2) in a thigh and a shin block. legL on +X, legR on -X. The tall boots (leather, under
    # outfit_boots_*) take the foot: a dark sole, the foot, a shaft round the shin and a turned-down cuff with a gold
    # stud on the outside. Gear boots replace them whole.
    for name, x in (('legL', 0.19), ('legR', -0.19)):
        s = 1 if x > 0 else -1
        leg = pivot(root, name, (x, HIP, 0))
        box(leg, (0.29, 0.44, 0.31), (0, -0.2, 0), R.cloth2, bevel=0.04)          # thigh
        box(leg, (0.26, 0.3, 0.28), (0, -0.52, 0), R.cloth2, bevel=0.035)          # shin
        boot = pivot(leg, 'outfit_boots_' + ('L' if s > 0 else 'R'))
        box(boot, (0.32, 0.045, 0.44), (0, -0.8775, 0.055), SOLE, bevel=0.012)    # sole
        box(boot, (0.31, 0.15, 0.42), (0, -0.785, 0.05), R.leather, bevel=0.045)  # foot
        box(boot, (0.28, 0.2, 0.3), (0, -0.62, 0), R.leather, bevel=0.035)        # shaft
        box(boot, (0.32, 0.11, 0.33), (0, -0.48, 0), R.leather, bevel=0.03)  # turned-down cuff
        box(boot, (0.012, 0.055, 0.055), (s * 0.163, -0.48, 0.02), GOLD, bevel=0.006)        # cuff stud
        pivot(leg, 'sock_footL' if x > 0 else 'sock_footR', (0, -0.72, 0))

    body = pivot(root, 'body', (0, HIP, 0))
    # Tunic torso (flares to the shoulders) and the skirt below the belt, its front split up to the belt, the pale trim
    # down both edges of the split and round the hem.
    box(body, (0.68, 0.66, 0.42), (0, 0.42, 0), R.cloth, taper=(1.08, 1.04), bevel=0.05)
    box(body, (0.7, 0.24, 0.44), (0, -0.05, 0), R.cloth, taper=(0.96, 0.96), bevel=0.04)
    box(body, (0.72, 0.05, 0.46), (0, -0.15, 0), TRIM, bevel=0.015)                 # hem trim
    lean = -0.0375                                                                    # the skirt front leans back
    split = pivot(body, 'outfit_body_split')                                          # (under armour's skirts)
    box(split, (0.07, 0.19, 0.03), (0, -0.07, 0.212), R.cloth2, rot=(lean, 0, 0), bevel=0.006)   # the split
    for s in (-1, 1):
        box(split, (0.04, 0.2, 0.03), (s * 0.052, -0.07, 0.218), TRIM, rot=(lean, 0, 0), bevel=0.008)
    box(body, (0.2, 0.12, 0.2), (0, 0.8, 0), R.skin, bevel=0.03)                     # neck
    # Standing collar in the tunic's darker shade, open in a V over the pale undershirt; armour hides it.
    col = pivot(body, 'outfit_body_collar')
    box(col, (0.42, 0.09, 0.08), (0, 0.79, -0.13), R.clothDark, bevel=0.02)          # back
    for s in (-1, 1):
        box(col, (0.08, 0.09, 0.3), (s * 0.17, 0.79, -0.02), R.clothDark, bevel=0.02)          # sides
        box(col, (0.065, 0.18, 0.025), (s * 0.075, 0.68, 0.226), R.clothDark, rot=(-0.04, 0, -s * 0.666), bevel=0.008)  # lapels
    box(col, (0.18, 0.13, 0.02), (0, 0.685, 0.212), UNDER, taper=(0.15, 1), rot=(-0.04, 0, PI), bevel=0)    # the V
    # Belt (kept under every armour) with its square gold buckle and the pouch (both hidden under armour).
    box(body, (0.72, 0.12, 0.46), (0, 0.07, 0), R.leather, bevel=0.03)
    kit = pivot(body, 'outfit_body_belt')
    box(kit, (0.16, 0.14, 0.03), (0, 0.07, 0.235), GOLD, bevel=0.012)               # buckle frame
    box(kit, (0.08, 0.06, 0.03), (0, 0.07, 0.24), R.leather, bevel=0)                # the strap end through it
    box(kit, (0.018, 0.06, 0.02), (-0.02, 0.07, 0.252), GOLD, bevel=0)                # tongue
    box(kit, (0.15, 0.17, 0.09), (0.225, -0.03, 0.2), R.leather, bevel=0.03)         # pouch (left hip)
    box(kit, (0.16, 0.08, 0.1), (0.225, 0.04, 0.205), R.leather, rot=(0.12, 0, 0), bevel=0.02)   # its flap
    box(kit, (0.04, 0.045, 0.02), (0.225, 0.005, 0.256), GOLD, bevel=0.006)           # clasp
    # Strap over the right shoulder to the left hip, front and back, with a gold clasp and a fang on the chest.
    st = pivot(body, 'outfit_body_strap')
    for z in (0.236, -0.236):
        box(st, (0.085, 0.82, 0.026), (0.015, 0.43, z), 0x5A3A22, rot=(0, 0, 0.775), bevel=0.008)
    box(st, (0.085, 0.026, 0.34), (-0.276, 0.758, 0), 0x5A3A22, bevel=0.008)   # over the shoulder
    for s in (-1, 1):                                                          # and over its chamfered edges
        box(st, (0.085, 0.075, 0.026), (-0.276, 0.735, s * 0.207), 0x5A3A22, rot=(-s * PI / 4, 0, 0), bevel=0.008)
    box(st, (0.1, 0.1, 0.03), (-0.07, 0.52, 0.252), GOLD, rot=(0, 0, PI / 4), bevel=0.012)       # clasp
    beam(st, (-0.07, 0.47, 0.252), (-0.055, 0.36, 0.256), 0.05, FANG, w1=0.008, d=0.03, d1=0.012)  # fang

    pivot(body, 'sock_chest', (0, 0.44, 0))
    shL = pivot(body, 'sock_shoulderL', (0.46, 0.72, 0))
    pivot(body, 'sock_shoulderR', (-0.46, 0.72, 0))
    # One steel pauldron over the left shoulder with a gold stud: its top block follows the shoulder socket (which turns
    # with most of the arm), its side plate rides the arm.
    pd = pivot(shL, 'outfit_body_pauldron', (0.04, -0.02, 0), (0, 0, -0.26))
    box(pd, (0.33, 0.15, 0.37), (0, 0, 0), STEEL, bevel=0.045)
    box(pd, (0.18, 0.04, 0.24), (-0.03, 0.085, 0), STEEL, bevel=0.015)
    box(pd, (0.055, 0.055, 0.025), (0.04, 0.02, 0.185), GOLD, rot=(0, 0, PI / 4), bevel=0.008)

    # Head: 0.46 cube centred on sock_head, a plain face: two tall dark eyes under calm brows, block ears.
    head = pivot(body, 'head', (0, 0.78, 0))
    box(head, (0.46, 0.46, 0.46), (0, 0.24, 0), R.skin, bevel=0.06)
    for s in (-1, 1):
        box(head, (0.06, 0.11, 0.02), (s * 0.1, 0.25, 0.232), EYE, bevel=0)                    # eye
        box(head, (0.11, 0.03, 0.03), (s * 0.1, 0.345, 0.232), R.hair, rot=(0, 0, s * 0.08), bevel=0.008)  # brow
        box(head, (0.05, 0.13, 0.1), (s * 0.245, 0.22, -0.01), R.skin, bevel=0.015)            # ear
    pivot(head, 'sock_head', (0, 0.24, 0))

    # Arms: short sleeve with a dark band, bare forearm under a leather bracer, a big thumbless fist (the back of the
    # hand over a row of curled fingers). armL on +X, armR on -X.
    for name, x in (('armL', 0.47), ('armR', -0.47)):
        s = 1 if x > 0 else -1
        a = pivot(body, name, (x, 0.62, 0))
        box(a, (0.25, 0.32, 0.27), (0, -0.13, 0), R.cloth, bevel=0.04)             # sleeve
        box(a, (0.26, 0.05, 0.28), (0, -0.28, 0), R.clothDark, bevel=0.015)       # sleeve band
        box(a, (0.19, 0.26, 0.21), (0, -0.41, 0), R.skin, bevel=0.03)               # forearm
        br = pivot(a, 'outfit_gloves_' + ('L' if s > 0 else 'R'))
        box(br, (0.235, 0.15, 0.25), (0, -0.43, 0), R.leather, bevel=0.025)        # bracer
        box(br, (0.245, 0.045, 0.26), (0, -0.435, 0), 0x3E2818, bevel=0.01)         # its dark strap
        box(br, (0.012, 0.045, 0.045), (s * 0.125, -0.435, 0.0), GOLD, bevel=0.005)   # stud
        if s > 0:   # the pauldron's side plate down the outside of the upper arm
            box(pivot(a, 'outfit_body_pauldronSide'), (0.07, 0.17, 0.35), (0.155, -0.06, 0), STEEL, rot=(0, 0, -0.1), bevel=0.025)
        box(a, (0.25, 0.19, 0.25), (0, -0.615, 0), R.skin, bevel=0.055)             # back of the fist
        box(a, (0.245, 0.09, 0.23), (0, -0.71, 0.03), R.skin, bevel=0.035)          # curled fingers
        if s > 0:
            pivot(a, 'sock_handL', (0, -0.63, 0))
        else:
            pivot(a, 'sock_gloveR', (0, -0.63, 0))
            pivot(a, 'sock_handR', (0, -0.66, 0.04), (PI / 2, 0, 0))
    return scene, root


if globals().get('DB_RUN', True):
    scene, root = build_hero()
    tris = tri_count(scene)
    export('DB_hero', 'hero.glb')
    if globals().get('DB_PREVIEW', True):
        preview_sheet('hero.png', target=(0, 1.05, 0), dist=4.2)
        remove_preview_rig()
    result = {'ok': True, 'objects': len(scene.objects), 'tris': tris}
