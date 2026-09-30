"""Town NPCs (Warden, Quartermaster) and Pebble the rock golem pet.

Humanoid rig names body/head/armL/armR/legL/legR/weapon (golem: no weapon). Faces +Z; right side at -X.
NPCs use their own authored colours (no ROLE_ materials).
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
SKIN_OLD = 0xE2B48E
SKIN = 0xE8B48A
GOLD = 0xD9A640
EYE = 0x1E1614
WHITE = 0xF4EEE4


def face(head, skin, brow, y=0.24, brow_h=0.05):
    """Eyes, brows, nose and ears on a 0.46 head centred at y."""
    for s in (-1, 1):
        box(head, (0.1, 0.09, 0.02), (s * 0.1, y + 0.03, 0.232), WHITE, bevel=0)
        box(head, (0.055, 0.07, 0.02), (s * 0.095, y + 0.025, 0.24), EYE, bevel=0)
        box(head, (0.15, brow_h, 0.05), (s * 0.1, y + 0.11, 0.235), brow, rot=(0, 0, s * 0.18), bevel=0.012)
        box(head, (0.05, 0.13, 0.1), (s * 0.245, y - 0.02, -0.01), skin, bevel=0.015)
    box(head, (0.1, 0.15, 0.1), (0, y - 0.04, 0.26), skin, taper=(0.7, 0.6), bevel=0.025)


def boot_leg(root, name, x, hip, trouser, boot, w=0.28):
    leg = pivot(root, name, (x, hip, 0))
    box(leg, (w, hip - 0.16, w + 0.02), (0, -(hip - 0.16) / 2, 0), trouser, bevel=0.035)
    box(leg, (w + 0.04, 0.2, 0.42), (0, -hip + 0.1, 0.05), boot, bevel=0.045)
    box(leg, (w + 0.05, 0.05, w + 0.06), (0, -hip + 0.2, 0), boot, bevel=0.015)
    return leg


def warden():
    scene, root = fresh_scene('DB_warden')
    robe, robe_dk, beard, wood, gem_c = 0x4E6078, 0x2E3A4E, 0xECEAE4, 0x5A3A22, 0x6AB8FF
    hip = 0.9
    for name, x in (('legL', 0.17), ('legR', -0.17)):
        boot_leg(root, name, x, hip, robe_dk, 0x3A2A20, w=0.26)
    body = pivot(root, 'body', (0, hip, 0))
    box(body, (0.7, 0.68, 0.44), (0, 0.42, 0), robe, taper=(1.06, 1.04), bevel=0.05)          # robe torso
    box(body, (0.76, 0.8, 0.52), (0, -0.38, 0), robe, taper=(0.86, 0.84), bevel=0.05)         # long skirt
    box(body, (0.78, 0.07, 0.54), (0, -0.74, 0), GOLD, bevel=0.02)                            # hem trim
    box(body, (0.12, 1.1, 0.03), (0, -0.12, 0.262), GOLD, taper=(0.9, 1), rot=(-0.07, 0, 0), bevel=0.01)  # front trim
    box(body, (0.72, 0.08, 0.47), (0, 0.06, 0), 0xB89A5A, bevel=0.02)                         # rope belt
    for s in (-1, 1):
        box(body, (0.04, 0.26, 0.04), (s * 0.1, -0.1, 0.25), 0xB89A5A, rot=(0, 0, s * 0.1), bevel=0.01)
    box(body, (0.86, 0.2, 0.56), (0, 0.66, 0), robe_dk, taper=(0.82, 0.86), bevel=0.05)       # mantle
    box(body, (0.88, 0.04, 0.58), (0, 0.57, 0), GOLD, bevel=0.01)
    gem(body, 0.05, (0, 0.62, 0.29), gem_c, emissive=gem_c, strength=3)                         # clasp

    head = pivot(body, 'head', (0, 0.78, 0))
    box(head, (0.44, 0.44, 0.44), (0, 0.24, 0), SKIN_OLD, bevel=0.06)
    face(head, SKIN_OLD, beard, brow_h=0.06)
    # Beard: one long wedge (no stacked slabs, so no seams across it) tipped forward, plus the point.
    box(head, (0.18, 0.78, 0.1), (0, -0.22, 0.235), beard, taper=(2.35, 1.45), rot=(-0.14, 0, 0), bevel=0.04)
    cone(head, 0.08, 0.2, (0, -0.68, 0.31), beard, rot=(PI - 0.14, 0, 0), seg=4)
    box(head, (0.34, 0.07, 0.07), (0, 0.13, 0.26), beard, bevel=0.02)                         # moustache
    for s in (-1, 1):
        box(head, (0.07, 0.16, 0.06), (s * 0.16, 0.05, 0.26), beard, rot=(0, 0, s * 0.25), bevel=0.02)
    # Hood: one lofted cloth shell, open at the face, tucked into the mantle, its crown rising to a soft
    # point swept back. Gold trim follows the face opening and the brow.
    ins = (0, 0.24, -0.03)
    side = loft_fn([(-0.08, 0.32, 0.33, 0, 0, -0.03), (0.2, 0.31, 0.31, 0, 0, -0.03), (0.44, 0.29, 0.3, 0, 0, -0.04)],
                   2.6, t0=0.8, t1=2 * PI - 0.8)
    surf(head, side, 10, 2, 0.04, robe, inside=ins)
    crown = loft_fn([(0.42, 0.29, 0.3, 0, 0, -0.04), (0.52, 0.26, 0.28, 0, 0.03, -0.07), (0.59, 0.19, 0.21, 0, 0.06, -0.12),
                     (0.64, 0.1, 0.12, 0, 0.06, -0.19), (0.67, 0, 0, 0, 0, -0.28)], 2.6)
    surf(head, crown, 12, 4, 0.04, robe, closed_u=True, inside=ins, inner=False, walls=(0,))
    for u0, u1 in ((0, 0.05), (0.95, 1)):
        surf(head, grow(sub(side, u0, u1, 0, 1), 0.008, ins), 1, 2, 0.02, GOLD, inside=ins)
    surf(head, grow(loft_fn([(0.42, 0.29, 0.3, 0, 0, -0.04), (0.48, 0.265, 0.28, 0, 0, -0.055)], 2.6, t0=-0.85, t1=0.85),
                    0.008, ins), 6, 1, 0.02, GOLD, inside=ins)

    for name, x in (('armL', 0.47), ('armR', -0.47)):
        a = pivot(body, name, (x, 0.62, 0))
        box(a, (0.25, 0.44, 0.27), (0, -0.2, 0), robe, bevel=0.04)
        box(a, (0.33, 0.18, 0.35), (0, -0.46, 0), robe_dk, taper=(0.85, 0.85), bevel=0.04)    # bell sleeve
        box(a, (0.34, 0.04, 0.36), (0, -0.54, 0), GOLD, bevel=0.01)
        box(a, (0.24, 0.22, 0.24), (0, -0.66, 0), SKIN_OLD, bevel=0.06)
        if name == 'armR':
            w = pivot(a, 'weapon', (0, -0.66, 0.04))
            cyl(w, 0.05, 0.06, 2.2, (0, 0.35, 0.1), wood, seg=6)                             # tall staff
            for y in (-0.2, 1.2):
                cyl(w, 0.068, 0.068, 0.05, (0, y, 0.1), GOLD, seg=6)
            cyl(w, 0.08, 0.06, 0.1, (0, 1.48, 0.1), GOLD, seg=6)
            for i in range(3):
                ang = i * 2 * PI / 3
                cx, cz = math.cos(ang), math.sin(ang)
                box(w, (0.045, 0.28, 0.045), (cx * 0.1, 1.64, 0.1 + cz * 0.1), wood, rot=(cz * 0.3, 0, -cx * 0.3), bevel=0.012)
            gem(w, 0.14, (0, 1.68, 0.1), gem_c, emissive=gem_c, strength=4)
    return scene


def quartermaster():
    scene, root = fresh_scene('DB_quartermaster')
    tunic, apron, trousers, beard, skin = 0x7A5230, 0x4E3322, 0x4A3E36, 0x7A4420, SKIN
    hip = 0.8
    for name, x in (('legL', 0.21), ('legR', -0.21)):
        boot_leg(root, name, x, hip, trousers, 0x3A2A20, w=0.3)
    body = pivot(root, 'body', (0, hip, 0))
    box(body, (0.86, 0.7, 0.54), (0, 0.4, 0), tunic, taper=(1.02, 0.96), bevel=0.06)          # stout torso
    box(body, (0.7, 0.4, 0.14), (0, 0.24, 0.24), tunic, bevel=0.06)                           # belly
    box(body, (0.84, 0.24, 0.5), (0, -0.04, 0), tunic, taper=(0.96, 0.96), bevel=0.05)
    box(body, (0.9, 0.1, 0.58), (0, 0.1, 0.0), 0x3A2618, bevel=0.025)                         # belt
    box(body, (0.12, 0.1, 0.04), (0, 0.1, 0.3), 0xB8B0A0, bevel=0.012)
    # Leather apron with pocket and straps
    box(body, (0.6, 0.86, 0.04), (0, 0.18, 0.325), apron, taper=(0.82, 1), rot=(-0.06, 0, 0), bevel=0.015)
    box(body, (0.4, 0.16, 0.03), (0, -0.02, 0.35), 0x3A2618, bevel=0.01)                      # pocket
    box(body, (0.04, 0.16, 0.03), (0.08, 0.1, 0.36), 0xE8DDC4, rot=(0, 0, 0.2), bevel=0)      # quill
    box(body, (0.15, 0.2, 0.035), (-0.09, 0.04, 0.34), 0x6A2A1E, rot=(0, 0, -0.08), bevel=0.01)  # ledger in the pocket
    box(body, (0.13, 0.02, 0.025), (-0.082, 0.14, 0.34), 0xE8DDC4, rot=(0, 0, -0.08), bevel=0)
    for s in (-1, 1):
        box(body, (0.06, 0.08, 0.3), (s * 0.24, 0.73, 0.12), apron, bevel=0.01)              # neck straps
    box(body, (0.44, 0.08, 0.34), (0, 0.76, 0), tunic, bevel=0.02)

    head = pivot(body, 'head', (0, 0.78, 0))
    box(head, (0.46, 0.46, 0.46), (0, 0.24, 0), skin, bevel=0.07)                             # bald head
    box(head, (0.3, 0.04, 0.3), (0, 0.47, -0.02), 0xF0C49A, bevel=0.015)                      # shine
    face(head, skin, beard, brow_h=0.07)
    box(head, (0.52, 0.3, 0.2), (0, 0.02, 0.18), beard, bevel=0.06)                           # bushy beard
    box(head, (0.44, 0.16, 0.18), (0, -0.18, 0.2), beard, taper=(1.15, 1), bevel=0.05)
    for s in (-1, 1):
        box(head, (0.08, 0.26, 0.24), (s * 0.24, 0.12, 0.08), beard, bevel=0.03)              # mutton chops
        box(head, (0.14, 0.07, 0.08), (s * 0.08, 0.12, 0.28), beard, rot=(0, 0, s * -0.2), bevel=0.025)  # moustache
    box(head, (0.1, 0.03, 0.02), (0, 0.06, 0.285), 0x5A2E24, bevel=0)

    for name, x in (('armL', 0.53), ('armR', -0.53)):
        a = pivot(body, name, (x, 0.62, 0))
        box(a, (0.28, 0.26, 0.3), (0, -0.1, 0), tunic, bevel=0.04)
        box(a, (0.3, 0.1, 0.32), (0, -0.25, 0), 0x9A7248, bevel=0.03)                        # rolled sleeve
        box(a, (0.22, 0.26, 0.24), (0, -0.42, 0), skin, bevel=0.04)                           # forearm
        box(a, (0.28, 0.24, 0.28), (0, -0.64, 0), skin, bevel=0.06)
        if name == 'armR':
            # Smith's hammer gripped near the butt, head hanging forward and down.
            w = pivot(a, 'weapon', (0, -0.66, 0.02), (PI / 2 + 0.7, 0, 0))
            cyl(w, 0.036, 0.042, 0.74, (0, 0.13, 0), 0x6B4426, seg=6)                           # handle
            cyl(w, 0.048, 0.048, 0.04, (0, -0.22, 0), 0x3A2618, seg=6)                           # butt knob
            box(w, (0.075, 0.07, 0.075), (0, 0.44, 0), 0x3E4248, bevel=0.012)                   # iron collar
            box(w, (0.15, 0.15, 0.22), (0, 0.55, 0.01), 0x5E636B, bevel=0.02)                   # head
            box(w, (0.17, 0.17, 0.05), (0, 0.55, 0.13), 0x3E4248, bevel=0.015)                  # striking face
            box(w, (0.1, 0.11, 0.08), (0, 0.55, -0.13), 0x5E636B, bevel=0.012)                  # peen
    return scene


def golem():
    scene, root = fresh_scene('DB_golem')
    rock, dark, light, moss, ember = 0x7E766A, 0x5A544C, 0x9E968A, 0x6E8E3A, 0xFF6A1A
    for name, x in (('legL', 0.13), ('legR', -0.13)):
        l = pivot(root, name, (x, 0.25, 0))
        box(l, (0.17, 0.18, 0.19), (0, -0.1, 0), dark, bevel=0.04)
        box(l, (0.21, 0.09, 0.25), (0, -0.2, 0.03), rock, bevel=0.03)
    body = pivot(root, 'body', (0, 0.25, 0))
    box(body, (0.5, 0.38, 0.4), (0, 0.2, 0), rock, taper=(1.12, 1.05), bevel=0.08)            # boulder torso
    box(body, (0.3, 0.14, 0.2), (0, 0.39, -0.08), light, bevel=0.04)                          # back ridge
    box(body, (0.26, 0.1, 0.08), (0.02, 0.06, -0.19), moss, bevel=0.02)
    for s in (-1, 1):
        box(body, (0.2, 0.12, 0.26), (s * 0.25, 0.36, 0), light, rot=(0, 0, s * -0.35), bevel=0.04)  # shoulder stones
    # Ember core sunk in an octagonal stone rim, with two short fissures running out from the rim.
    ring(body, 0.105, 0.072, 0.05, (0, 0.2, 0.2), dark, rot=(PI / 2, PI / 8, 0), seg=8)
    gem(body, 0.078, (0, 0.2, 0.155), ember, emissive=ember, strength=4)
    crack = [(0, -0.013), (0.05, 0.012), (0.09, 0.0), (0.05, 0.03), (0, 0.013)]
    for ang in (0.35, PI + 0.45):
        prism(body, crack, 0.02, (math.cos(ang) * 0.095, 0.2 + math.sin(ang) * 0.095, 0.205), ember,
              rot=(0, 0, ang), emissive=ember, strength=1.5)

    head = pivot(body, 'head', (0, 0.4, 0.05))
    box(head, (0.3, 0.22, 0.27), (0, 0.1, 0), light, bevel=0.06)
    box(head, (0.32, 0.06, 0.12), (0, 0.16, 0.1), rock, bevel=0.02)                           # brow ledge
    for s in (-1, 1):
        box(head, (0.06, 0.04, 0.02), (s * 0.07, 0.1, 0.136), 0xFFD060, emissive=0xFFB040, strength=4, bevel=0)
    box(head, (0.16, 0.06, 0.14), (0.04, 0.23, -0.02), moss, bevel=0.02)                      # moss tuft
    box(head, (0.08, 0.05, 0.08), (-0.08, 0.22, 0.03), moss, bevel=0.015)

    for name, x in (('armL', 0.31), ('armR', -0.31)):
        a = pivot(body, name, (x, 0.34, 0))
        box(a, (0.13, 0.16, 0.14), (0, -0.07, 0), dark, bevel=0.035)
        box(a, (0.22, 0.2, 0.22), (0, -0.24, 0.01), rock, bevel=0.06)                         # big stone fists
        box(a, (0.1, 0.06, 0.1), (0, -0.14, 0.08), light, bevel=0.02)
    return scene


if globals().get('DB_RUN', True):
    tris = {}
    for fn, file, tgt, dist in ((warden, 'warden', (0, 1.1, 0), 4.6), (quartermaster, 'quartermaster', (0, 1.0, 0), 4.4),
                                (golem, 'golem', (0, 0.42, 0), 2.2)):
        scene = fn()
        tris[file] = tri_count(scene)
        export(f'DB_{file}', f'{file}.glb')
        preview_sheet(f'{file}.png', target=tgt, dist=dist)
        remove_preview_rig()
    result = {'ok': True, 'tris': tris}
