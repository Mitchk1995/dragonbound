"""Goblin Grunt, Kobold Slinger and Ember Cultist. Faces +Z; right-side parts (armR/legR) at -X."""
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


def leg(parent, name, x, hip, pants, boot, length, shorts=None):
    l = pivot(parent, name, (x, hip, 0))
    box(l, (0.26, length, 0.28), (0, -length / 2, 0), pants, bevel=0.04)
    box(l, (0.32, 0.22, 0.42), (0, -hip + 0.11, 0.06), boot, bevel=0.05)
    if shorts:   # ragged leather shorts: a cuff over the thigh with torn tabs front and back
        box(l, (0.3, 0.2, 0.32), (0, -0.09, 0), shorts, bevel=0.04)
        for z in (-0.155, 0.155):
            for dx in (-0.07, 0.06):
                prism(l, [(-0.045, 0), (0.0, -0.075), (0.045, 0)], 0.02, (dx, -0.185, z), shorts)
    return l


def arm(parent, name, x, y, sleeve, hand, length):
    a = pivot(parent, name, (x, y, 0))
    box(a, (0.2, length, 0.22), (0, -length / 2, 0), sleeve, bevel=0.04)
    box(a, (0.26, 0.24, 0.26), (0, -length - 0.08, 0), hand, bevel=0.06)
    return a


def goblin():
    scene, root = fresh_scene('DB_goblin')
    hip = 0.55
    leg(root, 'legL', 0.15, hip, 'goblinDark', 'leatherDark', 0.4, shorts='leather')
    leg(root, 'legR', -0.15, hip, 'goblinDark', 'leatherDark', 0.4, shorts='leather')
    body = pivot(root, 'body', (0, hip, 0))
    box(body, (0.6, 0.3, 0.4), (0, -0.01, 0), 'leather', bevel=0.04)                          # seat of the shorts
    box(body, (0.5, 0.26, 0.12), (0, -0.12, 0.14), 'leatherDark', taper=(1.2, 1), bevel=0.02)  # loincloth
    box(body, (0.46, 0.3, 0.1), (0, -0.14, -0.16), 'leatherDark', taper=(1.2, 1), bevel=0.02)  # rear flap
    box(body, (0.62, 0.52, 0.42), (0, 0.34, 0.02), 'goblin', rot=(0.22, 0, 0), taper=(1.12, 1.05), bevel=0.06)
    box(body, (0.4, 0.3, 0.1), (0, 0.3, 0.22), 'goblinDark', rot=(0.22, 0, 0), bevel=0.03)  # belly
    box(body, (0.08, 0.6, 0.06), (0.1, 0.36, 0.22), 'leatherDark', rot=(0.22, 0, 0.6), bevel=0)  # strap
    head = pivot(body, 'head', (0, 0.62, 0.1))
    box(head, (0.58, 0.46, 0.5), (0, 0.2, 0), 'goblin', bevel=0.08)
    box(head, (0.16, 0.22, 0.18), (0, 0.13, 0.3), 'goblinDark', taper=(0.7, 0.8), bevel=0.04)  # nose
    box(head, (0.46, 0.08, 0.1), (0, 0.33, 0.24), 'goblinDark', bevel=0.02)  # brow
    for s in (-1, 1):
        # long flat wedge ears swept out and up, a darker inner ear laid on the front
        prism(head, [(0.0, -0.1), (s * 0.46, 0.1), (0.0, 0.11)] if s > 0 else [(0.0, -0.1), (0.0, 0.11), (s * 0.46, 0.1)],
              0.07, (s * 0.26, 0.26, -0.02), 'goblin', bevel=0.012)
        prism(head, [(0.0, -0.05), (s * 0.34, 0.085), (0.0, 0.07)] if s > 0 else [(0.0, -0.05), (0.0, 0.07), (s * 0.34, 0.085)],
              0.02, (s * 0.28, 0.265, 0.02), 'goblinDark')
        box(head, (0.11, 0.08, 0.02), (s * 0.14, 0.25, 0.255), 'eye', emissive='eye', strength=3, bevel=0)
        beam(head, (s * 0.1, 0.0, 0.262), (s * 0.115, 0.1, 0.27), 0.05, 'bone', d=0.035, w1=0.01, d1=0.01)  # tusks
    box(head, (0.32, 0.05, 0.04), (0, 0.04, 0.26), 'black', bevel=0)
    arm(body, 'armL', 0.38, 0.5, 'goblin', 'goblinDark', 0.42)
    armR = arm(body, 'armR', -0.38, 0.5, 'goblin', 'goblinDark', 0.42)
    w = pivot(armR, 'weapon', (0, -0.5, 0.04), (PI / 2, 0, 0))
    box(w, (0.1, 0.85, 0.1), (0, 0.36, 0), 'wood', taper=(1.5, 1.5), bevel=0.02)            # club
    box(w, (0.3, 0.28, 0.3), (0, 0.8, 0), 'wood', rot=(0.2, 0.4, 0.1), bevel=0.06)          # knotted head
    for a in range(3):
        ang = a * 2.1
        d = (math.cos(ang), 0.15, math.sin(ang))
        beam(w, (d[0] * 0.1, 0.8, d[2] * 0.1), (d[0] * 0.28, 0.84, d[2] * 0.28), 0.07, 'bone', w1=0.012)
    box(w, (0.2, 0.06, 0.2), (0, 0.55, 0), 'leather', bevel=0.02)
    export('DB_goblin', 'goblin.glb')
    preview_sheet('goblin.png', target=(0, 0.7, 0), dist=3.6)
    remove_preview_rig()


def kobold():
    scene, root = fresh_scene('DB_kobold')
    hip = 0.5
    leg(root, 'legL', 0.14, hip, 'koboldDark', 'koboldDark', 0.36)
    leg(root, 'legR', -0.14, hip, 'koboldDark', 'koboldDark', 0.36)
    body = pivot(root, 'body', (0, hip, 0))
    box(body, (0.46, 0.5, 0.36), (0, 0.26, 0), 'kobold', rot=(0.15, 0, 0), taper=(1.1, 1), bevel=0.05)
    box(body, (0.3, 0.38, 0.08), (0, 0.26, 0.19), 'belly', rot=(0.15, 0, 0), bevel=0.03)
    box(body, (0.5, 0.14, 0.4), (0, 0.04, 0), 'leather', bevel=0.03)
    box(body, (0.22, 0.3, 0.14), (-0.1, 0.3, -0.22), 'leatherDark', bevel=0.03)  # stone pouch
    t1 = pivot(body, 'tail1', (0, 0.05, -0.14))   # root sits inside the hips so the joint never opens
    box(t1, (0.18, 0.16, 0.48), (0, 0, -0.24), 'kobold', rot=(-0.3, 0, 0), taper=(0.8, 1), bevel=0.04)
    t2 = pivot(t1, 'tail2', (0, -0.1, -0.44))
    box(t2, (0.12, 0.11, 0.38), (0, 0, -0.18), 'koboldDark', rot=(-0.2, 0, 0), bevel=0.03)
    beam(t2, (0, -0.02, -0.34), (0, -0.02, -0.52), 0.1, 'bone', d=0.08, w1=0.015, d1=0.015)   # tail spike
    head = pivot(body, 'head', (0, 0.54, 0.06))
    box(head, (0.42, 0.36, 0.38), (0, 0.16, 0), 'kobold', bevel=0.06)
    box(head, (0.28, 0.2, 0.36), (0, 0.09, 0.3), 'kobold', taper=(0.8, 1), bevel=0.04)
    box(head, (0.24, 0.06, 0.32), (0, 0.0, 0.3), 'belly', bevel=0.02)
    for s in (-1, 1):
        box(head, (0.08, 0.08, 0.02), (s * 0.1, 0.24, 0.195), 'eye', emissive='eye', strength=3, bevel=0)
        horn = [(s * 0.12, 0.28, 0.02), (s * 0.15, 0.4, -0.1), (s * 0.17, 0.46, -0.26)]    # two-segment horns swept back
        beam(head, horn[0], horn[1], 0.08, 'bone', w1=0.06)
        beam(head, horn[1], horn[2], 0.06, 'bone', w1=0.012)
        box(head, (0.04, 0.03, 0.02), (s * 0.06, 0.12, 0.482), 'black', bevel=0)           # nostrils on the flat snout face
    for i, hgt in enumerate((0.13, 0.12, 0.1)):                                           # crest fins, bases sunk into the skull
        z = -i * 0.08
        beam(head, (0, 0.3, z + 0.02), (0, 0.3 + hgt, z - 0.05), 0.03, 'koboldDark', d=0.08, w1=0.01, d1=0.02)
    arm(body, 'armL', 0.3, 0.42, 'kobold', 'koboldDark', 0.36)
    armR = arm(body, 'armR', -0.3, 0.42, 'kobold', 'koboldDark', 0.36)
    w = pivot(armR, 'weapon', (0, -0.44, 0), (PI / 2, 0, 0))
    box(w, (0.025, 0.42, 0.025), (0.05, 0.2, 0), 'leather', bevel=0)
    box(w, (0.025, 0.42, 0.025), (-0.05, 0.2, 0), 'leather', bevel=0)
    box(w, (0.16, 0.12, 0.12), (0, 0.44, 0), 'leatherDark', bevel=0.03)
    box(w, (0.1, 0.09, 0.1), (0, 0.5, 0), 'steelDark', rot=(0.3, 0.5, 0.2), bevel=0.025)   # sling stone
    export('DB_kobold', 'kobold.glb')
    preview_sheet('kobold.png', target=(0, 0.6, 0), dist=3.2)
    remove_preview_rig()


HOOD_EDGE = 0xA83A4A     # lighter crimson lip round the face opening, so the hood reads in the dark
EMBROIDERY = 0x2A0A14    # near-black inlay in the back sigil


def cultist():
    scene, root = fresh_scene('DB_cultist')
    body = pivot(root, 'body', (0, 0, 0))
    # Robe: two flared slab tiers, each with a dark hem, a gold sash down the front and a gold belt.
    box(body, (0.96, 0.46, 0.78), (0, 0.23, 0), 'robe', taper=(0.86, 0.86), bevel=0.05)
    box(body, (1.0, 0.08, 0.82), (0, 0.04, 0), 'robeDark', bevel=0.02)
    box(body, (0.8, 0.42, 0.62), (0, 0.64, 0), 'robe', taper=(0.84, 0.84), bevel=0.045)
    box(body, (0.84, 0.07, 0.66), (0, 0.45, 0), 'robeDark', bevel=0.02)
    box(body, (0.2, 0.76, 0.06), (0, 0.43, 0.34), 'gold', rot=(-0.2, 0, 0), taper=(1.35, 1), bevel=0.01)  # sash
    box(body, (0.14, 0.62, 0.05), (0, 0.5, -0.33), 'gold', rot=(0.2, 0, 0), taper=(1.3, 1), bevel=0.01)  # back strip
    box(body, (0.95, 0.025, 0.78), (0, 0.09, 0), 'gold', bevel=0.006)                                  # hem piping
    box(body, (0.8, 0.025, 0.625), (0, 0.495, 0), 'gold', bevel=0.006)
    box(body, (0.72, 0.12, 0.56), (0, 0.84, 0), 'gold', bevel=0.03)
    box(body, (0.68, 0.34, 0.52), (0, 1.02, 0), 'robe', taper=(1.0, 1.0), bevel=0.045)
    box(body, (0.68, 0.32, 0.52), (0, 1.28, 0), 'robe', taper=(0.9, 0.9), bevel=0.05)
    # The hood's cape: a collar block under the cowl and a slab either side sloping on down over the shoulders,
    # continuing the hood's line (no flat brim).
    box(body, (0.52, 0.1, 0.46), (0, 1.44, -0.02), 'robeDark', bevel=0.03)
    for s in (-1, 1):
        box(body, (0.3, 0.08, 0.5), (s * 0.33, 1.4, -0.02), 'robeDark', rot=(0, 0, -s * 0.55), bevel=0.025)
    box(body, (0.12, 0.12, 0.03), (0, 1.3, 0.265), 'gold', rot=(0, 0, PI / 4), bevel=0.01)
    box(body, (0.16, 0.16, 0.03), (0, 1.2, -0.25), 'gold', rot=(0, 0, PI / 4), bevel=0.012)            # sigil on the back
    box(body, (0.08, 0.08, 0.03), (0, 1.2, -0.262), EMBROIDERY, rot=(0, 0, PI / 4), bevel=0)
    facet_gem(body, 0.07, (0, 1.3, 0.29), 'fire', emissive='fire', strength=5)  # amulet
    head = pivot(body, 'head', (0, 1.42, 0))
    # Hood: two angled side panels meeting at a peak that leans back (a hood's profile from the side), a filler
    # between them, a deep dark face opening framed by a lighter front edge, the glowing eyes set back in the
    # shadow. Panel outlines are (-z, y), turned to lie in the side plane.
    cowl = pivot(head, 'cowl', (0, 0.0, 0), (-0.06, 0, 0))
    side = [(-0.2, 0.0), (-0.16, 0.34), (0.1, 0.6), (0.26, 0.3), (0.27, 0.0)]
    edge = [(-0.235, 0.0), (-0.195, 0.36), (0.09, 0.635), (0.1, 0.6), (-0.16, 0.34), (-0.2, 0.0)]
    for s, nm in ((-1, 'cowlR'), (1, 'cowlL')):
        panel = pivot(cowl, nm, (s * 0.3, 0.0, 0), (0, 0, s * 0.44))
        prism(panel, side, 0.1, (-s * 0.05, 0, 0), 'robeDark', rot=(0, PI / 2, 0), bevel=0.02)
        prism(panel, edge, 0.106, (-s * 0.05, 0, 0), HOOD_EDGE, rot=(0, PI / 2, 0))                         # front edge
    prism(cowl, [(-0.02, 0.3), (0.08, 0.55), (0.24, 0.3), (0.25, 0.02), (0.02, 0.02)], 0.26, (0, 0, 0), 'robeDark',
          rot=(0, PI / 2, 0))                                                                                   # filler
    box(cowl, (0.3, 0.4, 0.3), (0, 0.2, -0.05), 'black', taper=(0.4, 1), bevel=0.03)                         # face shadow
    for s in (-1, 1):
        box(cowl, (0.07, 0.045, 0.02), (s * 0.07, 0.16, 0.105), 'fire', emissive='fire', strength=6, bevel=0)
    for name, x in (('armL', 0.4), ('armR', -0.4)):
        a = pivot(body, name, (x, 1.32, 0))
        box(a, (0.24, 0.62, 0.28), (0, -0.3, 0), 'robe', taper=(1.2, 1.2), bevel=0.04)
        box(a, (0.3, 0.1, 0.32), (0, -0.6, 0), 'gold', bevel=0.02)
        if name == 'armL':
            box(a, (0.22, 0.2, 0.24), (0, -0.75, 0.02), 'skin', bevel=0.05)                   # fist
        else:
            # Staff hand: the fist reaches forward so the shaft passes through its front, clear of the sleeve.
            box(a, (0.22, 0.2, 0.26), (0, -0.75, 0.1), 'skin', bevel=0.05)
            box(a, (0.07, 0.1, 0.08), (0.05, -0.7, 0.2), 'skin', rot=(0.3, 0, 0), bevel=0.02)  # thumb against the shaft
            w = pivot(a, 'weapon', (-0.04, -0.75, 0.2), (0.12, 0, -0.05))   # leans forward, butt out to the side
            box(w, (0.09, 1.6, 0.09), (0, 0.47, 0), 0x3A2418, taper=(0.85, 0.85), bevel=0.018)  # dark wood shaft
            beam(w, (0, -0.31, 0), (0, -0.42, 0), 0.1, 'black', w1=0.02)                       # butt cap
            box(w, (0.14, 0.06, 0.14), (0, 1.24, 0), 'gold', bevel=0.015)                       # collar
            for i in range(3):   # iron claws curl up and in around the orb
                ang = i * 2 * PI / 3 + PI / 2
                cx, cz = math.cos(ang), math.sin(ang)
                box(w, (0.045, 0.22, 0.045), (cx * 0.11, 1.34, cz * 0.11), 'black', rot=(cz * 0.5, 0, -cx * 0.5), bevel=0.012)
                box(w, (0.04, 0.2, 0.04), (cx * 0.11, 1.52, cz * 0.11), 'black', rot=(-cz * 0.6, 0, cx * 0.6), bevel=0.012)
            facet_gem(w, 0.11, (0, 1.44, 0), 'fire', emissive='fire', strength=5, rot=corner_up(), depth=0.16)  # ember orb
    export('DB_cultist', 'cultist.glb')
    preview_sheet('cultist.png', target=(0, 1.0, 0), dist=4.2)
    remove_preview_rig()


goblin()
kobold()
cultist()
result = {'ok': True}
