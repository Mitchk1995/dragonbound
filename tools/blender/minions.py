"""Goblin Grunt, Kobold Slinger and Ember Cultist."""
import math
import sys

sys.path.insert(0, r'D:\gameplanning\tools\blender')
import importlib
import _common
importlib.reload(_common)
from _common import *

PI = math.pi


def leg(parent, name, x, hip, pants, boot, length):
    l = pivot(parent, name, (x, hip, 0))
    box(l, (0.26, length, 0.28), (0, -length / 2, 0), pants, bevel=0.04)
    box(l, (0.32, 0.22, 0.42), (0, -hip + 0.11, 0.06), boot, bevel=0.05)
    return l


def arm(parent, name, x, y, sleeve, hand, length):
    a = pivot(parent, name, (x, y, 0))
    box(a, (0.2, length, 0.22), (0, -length / 2, 0), sleeve, bevel=0.04)
    box(a, (0.26, 0.24, 0.26), (0, -length - 0.08, 0), hand, bevel=0.06)
    return a


def goblin():
    scene, root = fresh_scene('DB_goblin')
    hip = 0.55
    leg(root, 'legL', -0.15, hip, 'goblinDark', 'leatherDark', 0.4)
    leg(root, 'legR', 0.15, hip, 'goblinDark', 'leatherDark', 0.4)
    body = pivot(root, 'body', (0, hip, 0))
    box(body, (0.58, 0.22, 0.38), (0, 0.02, 0), 'leather', bevel=0.04)
    box(body, (0.5, 0.26, 0.12), (0, -0.12, 0.14), 'leatherDark', taper=(1.2, 1), bevel=0.02)  # loincloth
    box(body, (0.62, 0.52, 0.42), (0, 0.34, 0.02), 'goblin', rot=(0.22, 0, 0), taper=(1.12, 1.05), bevel=0.06)
    box(body, (0.4, 0.3, 0.1), (0, 0.3, 0.22), 'goblinDark', rot=(0.22, 0, 0), bevel=0.03)  # belly
    box(body, (0.08, 0.6, 0.06), (0.1, 0.36, 0.22), 'leatherDark', rot=(0.22, 0, 0.6), bevel=0)  # strap
    head = pivot(body, 'head', (0, 0.62, 0.1))
    box(head, (0.58, 0.46, 0.5), (0, 0.2, 0), 'goblin', bevel=0.08)
    box(head, (0.16, 0.22, 0.18), (0, 0.13, 0.3), 'goblinDark', taper=(0.7, 0.8), bevel=0.04)  # nose
    box(head, (0.46, 0.08, 0.1), (0, 0.33, 0.24), 'goblinDark', bevel=0.02)  # brow
    for s in (-1, 1):
        cone(head, 0.12, 0.5, (s * 0.42, 0.28, -0.02), 'goblin', rot=(0, 0, -s * 1.25), seg=4)
        box(head, (0.11, 0.08, 0.02), (s * 0.14, 0.25, 0.255), 'eye', emissive='eye', strength=3, bevel=0)
        cone(head, 0.035, 0.1, (s * 0.1, 0.0, 0.25), 'bone', rot=(PI, 0, 0), seg=4)  # tusks
    box(head, (0.32, 0.05, 0.04), (0, 0.04, 0.26), 'black', bevel=0)
    arm(body, 'armL', -0.38, 0.5, 'goblin', 'goblinDark', 0.42)
    armR = arm(body, 'armR', 0.38, 0.5, 'goblin', 'goblinDark', 0.42)
    w = pivot(armR, 'weapon', (0, -0.5, 0.04), (PI / 2, 0, 0))
    cyl(w, 0.08, 0.05, 0.85, (0, 0.36, 0), 'wood', seg=6)
    gem(w, 0.17, (0, 0.76, 0), 'wood')
    for a in range(3):
        ang = a * 2.1
        cone(w, 0.05, 0.16, (math.cos(ang) * 0.15, 0.78, math.sin(ang) * 0.15), 'bone', rot=(0, -ang, -PI / 2), seg=4)
    box(w, (0.2, 0.06, 0.2), (0, 0.55, 0), 'leather', bevel=0.02)
    export('DB_goblin', 'goblin.glb')
    preview('goblin.png', target=(0, 0.7, 0), dist=3.6)
    remove_preview_rig()


def kobold():
    scene, root = fresh_scene('DB_kobold')
    hip = 0.5
    leg(root, 'legL', -0.14, hip, 'koboldDark', 'koboldDark', 0.36)
    leg(root, 'legR', 0.14, hip, 'koboldDark', 'koboldDark', 0.36)
    body = pivot(root, 'body', (0, hip, 0))
    box(body, (0.46, 0.5, 0.36), (0, 0.26, 0), 'kobold', rot=(0.15, 0, 0), taper=(1.1, 1), bevel=0.05)
    box(body, (0.3, 0.38, 0.08), (0, 0.26, 0.19), 'belly', rot=(0.15, 0, 0), bevel=0.03)
    box(body, (0.5, 0.14, 0.4), (0, 0.04, 0), 'leather', bevel=0.03)
    box(body, (0.22, 0.3, 0.14), (-0.1, 0.3, -0.22), 'leatherDark', bevel=0.03)  # stone pouch
    t1 = pivot(body, 'tail1', (0, 0.05, -0.2))
    box(t1, (0.18, 0.16, 0.42), (0, 0, -0.2), 'kobold', rot=(-0.3, 0, 0), taper=(0.8, 1), bevel=0.04)
    t2 = pivot(t1, 'tail2', (0, -0.1, -0.38))
    box(t2, (0.12, 0.11, 0.38), (0, 0, -0.18), 'koboldDark', rot=(-0.2, 0, 0), bevel=0.03)
    cone(t2, 0.07, 0.18, (0, -0.02, -0.42), 'bone', rot=(-PI / 2, 0, 0), seg=4)
    head = pivot(body, 'head', (0, 0.54, 0.06))
    box(head, (0.42, 0.36, 0.38), (0, 0.16, 0), 'kobold', bevel=0.06)
    box(head, (0.28, 0.2, 0.36), (0, 0.09, 0.3), 'kobold', taper=(0.8, 1), bevel=0.04)
    box(head, (0.24, 0.06, 0.32), (0, 0.0, 0.3), 'belly', bevel=0.02)
    for s in (-1, 1):
        box(head, (0.09, 0.08, 0.02), (s * 0.13, 0.24, 0.195), 'eye', emissive='eye', strength=3, bevel=0)
        cone(head, 0.06, 0.3, (s * 0.12, 0.4, -0.08), 'bone', rot=(-0.7, 0, s * -0.2), seg=4)
        box(head, (0.03, 0.03, 0.02), (s * 0.06, 0.16, 0.48), 'black', bevel=0)
    for i in range(3):
        cone(head, 0.04, 0.14, (0, 0.36, -0.05 - i * 0.12), 'koboldDark', seg=4)
    arm(body, 'armL', -0.3, 0.42, 'kobold', 'koboldDark', 0.36)
    armR = arm(body, 'armR', 0.3, 0.42, 'kobold', 'koboldDark', 0.36)
    w = pivot(armR, 'weapon', (0, -0.44, 0), (PI / 2, 0, 0))
    box(w, (0.025, 0.42, 0.025), (0.05, 0.2, 0), 'leather', bevel=0)
    box(w, (0.025, 0.42, 0.025), (-0.05, 0.2, 0), 'leather', bevel=0)
    box(w, (0.16, 0.12, 0.12), (0, 0.44, 0), 'leatherDark', bevel=0.03)
    gem(w, 0.07, (0, 0.5, 0), 'steelDark')
    export('DB_kobold', 'kobold.glb')
    preview('kobold.png', target=(0, 0.6, 0), dist=3.2)
    remove_preview_rig()


def cultist():
    scene, root = fresh_scene('DB_cultist')
    body = pivot(root, 'body', (0, 0, 0))
    cyl(body, 0.3, 0.56, 1.2, (0, 0.6, 0), 'robe', seg=8)
    cyl(body, 0.57, 0.6, 0.1, (0, 0.05, 0), 'robeDark', seg=8)
    box(body, (0.2, 1.0, 0.06), (0, 0.55, 0.42), 'gold', rot=(-0.22, 0, 0), taper=(1.3, 1), bevel=0.01)  # sash
    box(body, (0.64, 0.12, 0.52), (0, 0.8, 0), 'gold', bevel=0.03)
    box(body, (0.68, 0.32, 0.52), (0, 1.28, 0), 'robe', taper=(0.9, 0.9), bevel=0.05)
    for s in (-1, 1):
        box(body, (0.26, 0.14, 0.44), (s * 0.34, 1.44, 0), 'robeDark', rot=(0, 0, s * -0.3), bevel=0.04)
    gem(body, 0.08, (0, 1.3, 0.27), 'fire', emissive='fire', strength=5)  # amulet
    head = pivot(body, 'head', (0, 1.42, 0))
    cone(head, 0.36, 0.78, (0, 0.34, -0.06), 'robeDark', rot=(-0.12, 0, 0), seg=6)
    box(head, (0.4, 0.34, 0.2), (0, 0.16, 0.14), 'robeDark', bevel=0.04)
    box(head, (0.32, 0.26, 0.1), (0, 0.16, 0.22), 'black', bevel=0.02)
    for s in (-1, 1):
        box(head, (0.07, 0.05, 0.02), (s * 0.08, 0.2, 0.28), 'fire', emissive='fire', strength=6, bevel=0)
    for name, x in (('armL', -0.4), ('armR', 0.4)):
        a = pivot(body, name, (x, 1.32, 0))
        box(a, (0.24, 0.62, 0.28), (0, -0.3, 0), 'robe', taper=(1.2, 1.2), bevel=0.04)
        box(a, (0.3, 0.1, 0.32), (0, -0.6, 0), 'gold', bevel=0.02)
        gem(a, 0.12, (0, -0.72, 0), 'skin')
        gem(a, 0.09, (0, -0.84, 0.05), 'fire', emissive='fire', strength=5)
        if name == 'armR':
            w = pivot(a, 'weapon', (0, -0.7, 0))
            cyl(w, 0.04, 0.05, 1.8, (0, 0.2, 0), 'black', seg=6)
            for s in (-1, 1):
                box(w, (0.05, 0.3, 0.05), (s * 0.1, 1.2, 0), 'black', rot=(0, 0, s * 0.4), bevel=0.01)
            cone(w, 0.12, 0.32, (0, 1.2, 0), 'fire', rot=(PI, 0, 0), seg=4, emissive='fire', strength=5)
    export('DB_cultist', 'cultist.glb')
    preview('cultist.png', target=(0, 1.0, 0), dist=4.2)
    remove_preview_rig()


goblin()
kobold()
cultist()
result = {'ok': True}
