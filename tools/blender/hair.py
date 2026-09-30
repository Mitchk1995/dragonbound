"""Hair (hair_1..4) and beards (beard_1..3) for the hero base.

Each file is one `sock_head` empty whose children are ROLE_hair meshes, authored relative to the
head centre (the base head is a 0.46 cube centred on sock_head; face at +Z, ears at +-0.245 X).
"""
import math
import sys

sys.path.insert(0, r'D:\gameplanning\tools\blender')
import importlib
import _common
importlib.reload(_common)
from _common import *
from mathutils import Euler, Vector

PI = math.pi
H = R.hair
BAND = 0x5A3A22   # leather hair tie (authored colour)
BEAD = 0xD9A640   # braid beads (authored colour)


def spike(parent, r, h, pos, rot, seg=4):
    """Hair tuft: cone whose base sits at `pos` and points along the rotated +Y."""
    off = Euler(rot, 'ZYX').to_matrix() @ Vector((0, h / 2, 0))
    return cone(parent, r, h, (pos[0] + off.x, pos[1] + off.y, pos[2] + off.z), H, rot=rot, seg=seg)


def base_cap(h, top=0.2, height=0.13, width=0.5):
    box(h, (width, height, width), (0, top, -0.01), H, bevel=0.04)


def hair_1(h):  # short crop
    base_cap(h)
    for s in (-1, 1):
        box(h, (0.04, 0.14, 0.34), (s * 0.244, 0.13, -0.06), H, bevel=0.012)       # sides above the ears
    box(h, (0.5, 0.25, 0.05), (0, 0.085, -0.243), H, bevel=0.015)                  # back
    for i, x in enumerate((-0.14, 0, 0.14)):
        box(h, (0.15, 0.07, 0.07), (x, 0.17 + (i % 2) * 0.012, 0.236), H, rot=(0.25, 0, (i - 1) * 0.2), bevel=0.02)  # fringe


def hair_2(h):  # swept back
    base_cap(h, top=0.21, height=0.15)
    box(h, (0.46, 0.14, 0.2), (0, 0.29, 0.15), H, rot=(-0.4, 0, 0), bevel=0.04)    # raised quiff
    box(h, (0.47, 0.13, 0.36), (0, 0.3, -0.06), H, rot=(0.22, 0, 0), bevel=0.04)   # swept top
    box(h, (0.5, 0.32, 0.08), (0, 0.06, -0.25), H, taper=(1.04, 1), bevel=0.02)    # back
    for s in (-1, 1):
        box(h, (0.045, 0.16, 0.36), (s * 0.245, 0.14, -0.05), H, rot=(0.2, 0, 0), bevel=0.012)
        spike(h, 0.06, 0.2, (s * 0.2, 0.3, -0.12), (-2.1, 0, s * 0.25))            # side flicks
    for x in (-0.13, 0, 0.13):
        spike(h, 0.07, 0.2, (x, -0.06, -0.26), (2.6, 0, x * 1.2))                  # nape points


def hair_3(h):  # long & tied back
    base_cap(h, top=0.21, height=0.14)
    box(h, (0.5, 0.34, 0.06), (0, 0.05, -0.245), H, bevel=0.02)                    # back
    for s in (-1, 1):
        box(h, (0.05, 0.3, 0.2), (s * 0.248, 0.02, 0.09), H, taper=(1, 0.8), bevel=0.015)  # side locks framing the face
        box(h, (0.045, 0.14, 0.24), (s * 0.244, 0.13, -0.1), H, bevel=0.012)
    box(h, (0.17, 0.15, 0.12), (0, 0.13, -0.29), H, bevel=0.04)                   # bun knot
    box(h, (0.19, 0.05, 0.14), (0, 0.04, -0.3), BAND, bevel=0.012)                # tie
    box(h, (0.15, 0.22, 0.11), (0, -0.07, -0.31), H, rot=(-0.12, 0, 0), bevel=0.035)
    box(h, (0.13, 0.2, 0.1), (0, -0.26, -0.33), H, bevel=0.03)
    box(h, (0.15, 0.04, 0.12), (0, -0.37, -0.33), BAND, bevel=0.01)
    cone(h, 0.08, 0.18, (0, -0.46, -0.33), H, rot=(PI, 0, 0), seg=4)


def hair_4(h):  # wild mane
    box(h, (0.54, 0.17, 0.54), (0, 0.21, -0.02), H, bevel=0.05)
    box(h, (0.58, 0.46, 0.14), (0, -0.01, -0.25), H, taper=(0.92, 1), bevel=0.04)  # heavy back mane
    for s in (-1, 1):
        box(h, (0.07, 0.26, 0.34), (s * 0.255, 0.1, -0.06), H, bevel=0.02)
        spike(h, 0.08, 0.26, (s * 0.26, 0.02, -0.08), (0, 0, s * -2.2))             # side flares
        spike(h, 0.09, 0.3, (s * 0.24, -0.16, -0.24), (0.4, 0, s * -2.5))
    for x, z, rx, rz in ((-0.14, 0.14, 0.9, 0.5), (0.02, 0.18, 1.0, -0.1), (0.16, 0.12, 0.8, -0.6),
                         (-0.12, -0.06, -0.3, 0.5), (0.12, -0.04, -0.3, -0.5), (0, -0.1, -0.7, 0)):
        spike(h, 0.1, 0.3, (x, 0.26, z), (rx, 0, rz))                               # top spikes
    for x in (-0.2, -0.07, 0.07, 0.2):
        spike(h, 0.08, 0.26, (x, -0.2, -0.28), (2.75, 0, x * 1.3))                  # mane points down the back


def beard_1(h):  # stubble
    box(h, (0.3, 0.1, 0.025), (0, -0.19, 0.236), H, bevel=0.006)                    # chin
    for s in (-1, 1):
        box(h, (0.1, 0.07, 0.025), (s * 0.15, -0.14, 0.236), H, rot=(0, 0, s * 0.35), bevel=0.006)
        box(h, (0.025, 0.16, 0.12), (s * 0.237, -0.12, 0.16), H, bevel=0.006)        # jaw line
    box(h, (0.22, 0.035, 0.025), (0, -0.108, 0.244), H, bevel=0.006)                # moustache shadow
    box(h, (0.34, 0.025, 0.2), (0, -0.237, 0.12), H, bevel=0.006)                   # under chin


def moustache(h, w=0.3, droop=0.1):
    box(h, (w, 0.065, 0.07), (0, -0.105, 0.27), H, bevel=0.02)
    for s in (-1, 1):
        box(h, (0.07, droop + 0.05, 0.06), (s * (w / 2 - 0.01), -0.13 - droop / 2, 0.27), H, rot=(0, 0, s * 0.2), bevel=0.018)


def beard_2(h):  # full beard
    box(h, (0.46, 0.25, 0.14), (0, -0.21, 0.225), H, bevel=0.04)
    box(h, (0.36, 0.13, 0.13), (0, -0.37, 0.25), H, taper=(1.25, 1.05), bevel=0.035)
    box(h, (0.2, 0.1, 0.1), (0, -0.46, 0.27), H, taper=(1.6, 1.2), bevel=0.03)
    for s in (-1, 1):
        box(h, (0.05, 0.22, 0.17), (s * 0.24, -0.08, 0.14), H, bevel=0.015)        # sideburns
    moustache(h)
    box(h, (0.11, 0.035, 0.02), (0, -0.17, 0.296), 0x5A2E24, bevel=0)              # mouth gap


def beard_3(h):  # braided beard
    box(h, (0.44, 0.22, 0.13), (0, -0.2, 0.225), H, bevel=0.035)
    for s in (-1, 1):
        box(h, (0.05, 0.2, 0.16), (s * 0.238, -0.08, 0.14), H, bevel=0.015)
        x = s * 0.09
        for i in range(3):
            box(h, (0.085, 0.09, 0.08), (x, -0.335 - i * 0.085, 0.27 + i * 0.008), H, rot=(0, 0.6 * s, 0.15 * s * (1 if i % 2 else -1)), bevel=0.02)
        box(h, (0.08, 0.04, 0.08), (x, -0.585, 0.3), BEAD, bevel=0.01)
        cone(h, 0.045, 0.1, (x, -0.65, 0.3), H, rot=(PI, 0, 0), seg=4)
    moustache(h, w=0.28, droop=0.06)
    box(h, (0.1, 0.03, 0.02), (0, -0.17, 0.29), 0x5A2E24, bevel=0)


BUILDERS = {'hair_1': hair_1, 'hair_2': hair_2, 'hair_3': hair_3, 'hair_4': hair_4,
            'beard_1': beard_1, 'beard_2': beard_2, 'beard_3': beard_3}


def build(name):
    scene, root = fresh_scene(f'DB_{name}')
    # Socket sits where the base hero's head centre is, so the file previews sensibly on its own.
    sock = pivot(root, 'sock_head', (0, 1.92, 0))
    BUILDERS[name](sock)
    return scene


if globals().get('DB_RUN', True):
    tris = {}
    for name in BUILDERS:
        scene = build(name)
        tris[name] = tri_count(scene)
        export(f'DB_{name}', f'{name}.glb')
        preview_auto(f'{name}.png')
        remove_preview_rig()
    result = {'ok': True, 'tris': tris}
