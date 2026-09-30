"""Hero: chunky adventurer-knight with sword / bow / staff variants on the `weapon` pivot."""
import math
import sys

sys.path.insert(0, r'D:\gameplanning\tools\blender')
import importlib
import _common
importlib.reload(_common)
from _common import *

scene, root = fresh_scene('DB_hero')
PI = math.pi
HIP = 0.9

# Legs
for name, x in (('legL', -0.19), ('legR', 0.19)):
    leg = pivot(root, name, (x, HIP, 0))
    box(leg, (0.3, 0.42, 0.32), (0, -0.2, 0), 'leatherDark')
    box(leg, (0.26, 0.3, 0.3), (0, -0.52, 0), 'clothDark')
    box(leg, (0.36, 0.3, 0.46), (0, -0.76, 0.05), 'leather', bevel=0.05)
    box(leg, (0.4, 0.08, 0.5), (0, -0.62, 0.04), 'leatherDark', bevel=0.02)  # boot cuff
    box(leg, (0.2, 0.12, 0.08), (0, -0.44, 0.17), 'steel', bevel=0.02)  # knee guard

body = pivot(root, 'body', (0, HIP, 0))
# Belt, tunic, chest plate
box(body, (0.68, 0.2, 0.42), (0, 0.04, 0), 'leather', bevel=0.03)
box(body, (0.16, 0.16, 0.06), (0, 0.04, 0.22), 'gold', bevel=0.02)
box(body, (0.16, 0.16, 0.1), (-0.26, -0.02, 0.18), 'leatherDark', bevel=0.03)  # pouch
box(body, (0.76, 0.34, 0.46), (0, -0.14, 0), 'cloth', taper=(0.9, 0.9), bevel=0.03)  # skirt
box(body, (0.76, 0.62, 0.46), (0, 0.44, 0), 'cloth', taper=(1.1, 1.05), bevel=0.04)
box(body, (0.64, 0.46, 0.12), (0, 0.5, 0.21), 'steel', taper=(1.08, 1), bevel=0.04)
box(body, (0.08, 0.36, 0.04), (0, 0.5, 0.28), 'steelDark', bevel=0.01)
for rx in (-0.2, 0.2):
    gem(body, 0.035, (rx, 0.66, 0.28), 'gold')
# Cape in two panels so it reads from behind
box(body, (0.7, 0.55, 0.05), (0, 0.5, -0.27), 'red', rot=(0.06, 0, 0), bevel=0.01)
box(body, (0.74, 0.55, 0.05), (0, -0.02, -0.31), 'red', rot=(0.12, 0, 0), taper=(0.95, 1), bevel=0.01)
# Pauldrons
for s in (-1, 1):
    box(body, (0.36, 0.22, 0.5), (s * 0.48, 0.74, 0), 'steel', rot=(0, 0, s * -0.25), bevel=0.06)
    box(body, (0.38, 0.06, 0.52), (s * 0.48, 0.64, 0), 'gold', rot=(0, 0, s * -0.25), bevel=0.02)
    gem(body, 0.04, (s * 0.52, 0.86, 0.2), 'gold')

head = pivot(body, 'head', (0, 0.78, 0))
box(head, (0.46, 0.46, 0.46), (0, 0.24, 0), 'skin', bevel=0.06)
box(head, (0.08, 0.09, 0.02), (-0.1, 0.27, 0.235), 'black', bevel=0)
box(head, (0.08, 0.09, 0.02), (0.1, 0.27, 0.235), 'black', bevel=0)
box(head, (0.24, 0.1, 0.1), (0, 0.12, 0.2), 'leatherDark', bevel=0.02)  # beard
box(head, (0.56, 0.24, 0.56), (0, 0.45, 0), 'steel', taper=(0.85, 0.85), bevel=0.05)
box(head, (0.58, 0.07, 0.58), (0, 0.34, 0), 'gold', bevel=0.02)
box(head, (0.08, 0.26, 0.06), (0, 0.28, 0.265), 'steel', bevel=0.02)  # nose guard
box(head, (0.1, 0.18, 0.46), (0, 0.66, -0.04), 'red', taper=(1, 0.7), bevel=0.03)  # plume
box(head, (0.08, 0.22, 0.14), (0, 0.6, -0.3), 'red', rot=(0.5, 0, 0), bevel=0.02)


def arm(name, x):
    a = pivot(body, name, (x, 0.62, 0))
    box(a, (0.22, 0.34, 0.24), (0, -0.16, 0), 'cloth', bevel=0.03)
    box(a, (0.24, 0.3, 0.26), (0, -0.44, 0), 'steelDark', bevel=0.04)  # vambrace
    box(a, (0.28, 0.26, 0.28), (0, -0.66, 0), 'leather', bevel=0.06)  # gauntlet
    return a


arm('armL', -0.47)
armR = arm('armR', 0.47)
weapon = pivot(armR, 'weapon', (0, -0.66, 0.04), (PI / 2, 0, 0))

sword = pivot(weapon, 'w_sword')
cyl(sword, 0.05, 0.05, 0.32, (0, 0, 0), 'leatherDark')
gem(sword, 0.07, (0, -0.18, 0), 'gold')
box(sword, (0.46, 0.08, 0.12), (0, 0.18, 0), 'gold', bevel=0.03)
box(sword, (0.16, 1.0, 0.05), (0, 0.72, 0), 'steel', bevel=0.015, taper=(0.75, 1))
box(sword, (0.04, 0.85, 0.06), (0, 0.66, 0), 'steelDark', bevel=0)
box(sword, (0.1, 0.1, 0.05), (0, 1.24, 0), 'steel', rot=(0, 0, PI / 4), bevel=0.01)

bow = pivot(weapon, 'w_bow', rot=(-PI / 2, 0, 0))
for s in (-1, 1):
    box(bow, (0.08, 0.36, 0.09), (0, s * 0.2, 0.06), 'wood', rot=(s * -0.2, 0, 0), bevel=0.02)
    box(bow, (0.07, 0.36, 0.08), (0, s * 0.52, 0.16), 'wood', rot=(s * -0.55, 0, 0), bevel=0.02)
    box(bow, (0.09, 0.08, 0.1), (0, s * 0.68, 0.26), 'gold', bevel=0.02)
box(bow, (0.1, 0.22, 0.11), (0, 0, 0.02), 'leather', bevel=0.03)
box(bow, (0.015, 1.32, 0.015), (0, 0, 0.26), 'bone', bevel=0)

staff = pivot(weapon, 'w_staff', rot=(-PI / 2, 0, 0))
cyl(staff, 0.055, 0.07, 1.9, (0, 0.35, 0), 'wood', seg=6)
for y in (-0.3, 0.9):
    cyl(staff, 0.08, 0.08, 0.08, (0, y, 0), 'gold', seg=6)
for s in (-1, 1):
    box(staff, (0.06, 0.34, 0.06), (s * 0.12, 1.36, 0), 'wood', rot=(0, 0, s * -0.35), bevel=0.02)
gem(staff, 0.17, (0, 1.48, 0), 'arcane', emissive='arcane', strength=4)

export('DB_hero', 'hero.glb')
preview('hero.png', target=(0, 1.1, 0), dist=5.2)
remove_preview_rig()
result = {'ok': True, 'objects': len(scene.objects)}
