"""Hero BASE: plain clothes, big hands, sockets for gear/hair (see docs/ART_CONTRACT.md).

No armour, weapon, hair or helmet: those are separate gear_*.glb / hair_*.glb / beard_*.glb files
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
BUCKLE = 0xD9A640   # authored (not recoloured)
EYE = 0x1E1614
WHITE = 0xF4EEE4
MOUTH = 0x8A4A3A


def build_hero(scene_name='DB_hero'):
    scene, root = fresh_scene(scene_name)

    # Legs: trousers (cloth2) + shoes (leather). legL on +X, legR on -X.
    for name, x in (('legL', 0.19), ('legR', -0.19)):
        s = 1 if x > 0 else -1
        leg = pivot(root, name, (x, HIP, 0))
        box(leg, (0.29, 0.44, 0.31), (0, -0.2, 0), R.cloth2, bevel=0.04)          # thigh
        box(leg, (0.26, 0.3, 0.28), (0, -0.52, 0), R.cloth2, bevel=0.035)          # shin
        box(leg, (0.28, 0.07, 0.3), (0, -0.66, 0), R.leather, bevel=0.02)          # shoe cuff
        box(leg, (0.3, 0.17, 0.4), (0, -0.805, 0.05), R.leather, bevel=0.045)      # shoe
        box(leg, (0.3, 0.035, 0.4), (0, -0.885, 0.05), 0x3A2618, bevel=0.01)       # sole
        pivot(leg, 'sock_footL' if x > 0 else 'sock_footR', (0, -0.72, 0))

    body = pivot(root, 'body', (0, HIP, 0))
    # Tunic torso (flares to the shoulders), skirt below the belt, V-neck, collar, hem.
    box(body, (0.68, 0.66, 0.42), (0, 0.42, 0), R.cloth, taper=(1.08, 1.04), bevel=0.05)
    box(body, (0.7, 0.24, 0.44), (0, -0.05, 0), R.cloth, taper=(0.96, 0.96), bevel=0.04)
    box(body, (0.72, 0.05, 0.46), (0, -0.15, 0), R.cloth2, bevel=0.015)            # hem stripe
    # V-neck: skin wedge tucked under the collar, deep enough to fill the tunic's top edge, apex on the placket.
    prism(body, [(-0.11, 0), (0, -0.17), (0.11, 0)], 0.08, (0, 0.758, 0.185), R.skin)
    for s in (-1, 1):
        box(body, (0.03, 0.21, 0.02), (s * 0.058, 0.672, 0.224), R.cloth2, rot=(0, 0, -s * 0.576), bevel=0.006)  # piping
    box(body, (0.06, 0.36, 0.03), (0, 0.38, 0.222), R.cloth2, bevel=0.01)            # placket
    for y in (0.3, 0.42):
        box(body, (0.05, 0.05, 0.03), (0, y, 0.24), R.leather, bevel=0.01)          # toggles
    box(body, (0.4, 0.06, 0.3), (0, 0.76, 0), R.cloth2, bevel=0.02)                 # collar
    cyl(body, 0.1, 0.11, 0.12, (0, 0.8, 0), R.skin, seg=6)                           # neck
    # Belt + buckle + pouch
    box(body, (0.72, 0.12, 0.46), (0, 0.07, 0), R.leather, bevel=0.03)
    box(body, (0.13, 0.11, 0.04), (0, 0.07, 0.235), BUCKLE, bevel=0.015)
    box(body, (0.14, 0.14, 0.08), (0.25, -0.02, 0.2), R.leather, bevel=0.03)        # pouch (left hip)
    box(body, (0.14, 0.05, 0.09), (0.25, 0.05, 0.2), R.cloth2, bevel=0.01)
    pivot(body, 'sock_chest', (0, 0.44, 0))
    pivot(body, 'sock_shoulderL', (0.46, 0.72, 0))
    pivot(body, 'sock_shoulderR', (-0.46, 0.72, 0))

    # Head: 0.46 cube centred on sock_head.
    head = pivot(body, 'head', (0, 0.78, 0))
    box(head, (0.46, 0.46, 0.46), (0, 0.24, 0), R.skin, bevel=0.06)
    for s in (-1, 1):
        box(head, (0.1, 0.1, 0.02), (s * 0.1, 0.265, 0.232), WHITE, bevel=0)         # eye white
        box(head, (0.055, 0.075, 0.02), (s * 0.095, 0.26, 0.24), EYE, bevel=0)       # pupil
        box(head, (0.13, 0.035, 0.04), (s * 0.1, 0.345, 0.232), R.hair, rot=(0, 0, s * 0.12), bevel=0.008)  # brow
        box(head, (0.05, 0.13, 0.1), (s * 0.245, 0.22, -0.01), R.skin, bevel=0.015)  # ear
    box(head, (0.08, 0.12, 0.08), (0, 0.2, 0.25), R.skin, taper=(0.7, 0.6), bevel=0.02)  # nose
    box(head, (0.12, 0.025, 0.02), (0, 0.11, 0.232), MOUTH, bevel=0)                 # mouth
    pivot(head, 'sock_head', (0, 0.24, 0))

    # Arms: short sleeve, bare forearm, big hands with thumbs. armL on +X, armR on -X.
    for name, x in (('armL', 0.47), ('armR', -0.47)):
        s = 1 if x > 0 else -1
        a = pivot(body, name, (x, 0.62, 0))
        box(a, (0.25, 0.32, 0.27), (0, -0.13, 0), R.cloth, bevel=0.04)             # sleeve
        box(a, (0.26, 0.05, 0.28), (0, -0.28, 0), R.cloth2, bevel=0.015)            # sleeve band
        box(a, (0.19, 0.26, 0.21), (0, -0.41, 0), R.skin, bevel=0.03)               # forearm
        box(a, (0.2, 0.05, 0.22), (0, -0.5, 0), R.leather, bevel=0.012)             # wrist wrap
        box(a, (0.26, 0.24, 0.26), (0, -0.64, 0), R.skin, bevel=0.06)               # hand
        box(a, (0.08, 0.13, 0.09), (-s * 0.07, -0.6, 0.14), R.skin, rot=(0.3, 0, 0), bevel=0.025)  # thumb
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
    preview_sheet('hero.png', target=(0, 1.05, 0), dist=4.2)
    remove_preview_rig()
    result = {'ok': True, 'objects': len(scene.objects), 'tris': tris}
