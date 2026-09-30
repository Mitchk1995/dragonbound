"""Dragons: Drakeling (minion), Cinderwing (boss) and the Ember Whelp pet, from one builder."""
import math
import sys

sys.path.insert(0, r'D:\gameplanning\tools\blender')
import importlib
import _common
importlib.reload(_common)
from _common import *

PI = math.pi


def dragon(scene_name, file_name, scale, main, dark, belly, glow, membrane_col, neck, tail, span, horns=2, spikes=4, detail=False):
    scene, root = fresh_scene(scene_name)
    inner = pivot(root, 'inner')
    inner.scale = (scale, scale, scale)
    leg_h = 0.62

    for name, x, z, front in (('legFL', -0.38, 0.42, True), ('legFR', 0.38, 0.42, True), ('legBL', -0.4, -0.45, False), ('legBR', 0.4, -0.45, False)):
        l = pivot(inner, name, (x, leg_h + 0.08, z))
        box(l, (0.3, 0.5, 0.36) if not front else (0.26, 0.5, 0.3), (0, -0.22, 0), main, bevel=0.05)
        box(l, (0.2, 0.36, 0.22), (0, -0.52, 0.04 if front else -0.04), dark, bevel=0.04)
        box(l, (0.32, 0.1, 0.38), (0, -0.68, 0.1), dark, bevel=0.03)
        for cx in (-0.1, 0, 0.1):
            cone(l, 0.045, 0.14, (cx, -0.7, 0.31), 'bone', rot=(PI / 2, 0, 0), seg=4)

    body = pivot(inner, 'body', (0, leg_h + 0.3, 0))
    box(body, (0.92, 0.72, 1.3), (0, 0.05, 0), main, taper=(0.9, 0.95), bevel=0.08)
    box(body, (0.72, 0.2, 1.1), (0, -0.32, 0.05), belly, bevel=0.05)
    for i in range(4 if detail else 0):
        box(body, (0.66, 0.04, 0.2), (0, -0.43, 0.45 - i * 0.26), dark, bevel=0.01)  # belly plates
    box(body, (0.78, 0.62, 0.52), (0, 0.12, 0.6), main, rot=(0.2, 0, 0), bevel=0.07)
    box(body, (0.52, 0.32, 0.38), (0, -0.1, 0.72), belly, rot=(0.2, 0, 0), bevel=0.05)
    for i in range(spikes):
        cone(body, 0.1, 0.34, (0, 0.5, 0.5 - i * 0.3), dark, rot=(-0.35, 0, 0), seg=4)
    box(body, (0.32, 0.06, 0.42), (0, -0.24, 0.2), glow, emissive=glow, strength=3, bevel=0)
    if detail:
        for s in (-1, 1):
            for i in range(3):
                box(body, (0.04, 0.3, 0.18), (s * 0.47, 0.05, 0.3 - i * 0.35), glow, emissive=glow, strength=2.5, rot=(0.3, 0, 0), bevel=0)  # glowing flank cracks

    parent, z, y = body, 0.8, 0.3
    for i in range(1, neck + 1):
        n = pivot(parent, f'neck{i}', (0, y, z), (-0.35, 0, 0))
        w = 0.48 - i * 0.05
        box(n, (w, w, 0.46), (0, 0, 0.18), main, bevel=0.05)
        box(n, (w * 0.7, 0.08, 0.42), (0, -w / 2, 0.18), belly, bevel=0.02)
        cone(n, 0.07, 0.22, (0, w / 2 + 0.07, 0.18), dark, seg=4)
        parent, z, y = n, 0.4, 0

    head = pivot(parent, 'head', (0, 0.02, 0.42), (0.4, 0, 0))
    box(head, (0.52, 0.42, 0.5), (0, 0.08, 0.1), main, bevel=0.07)
    box(head, (0.4, 0.24, 0.52), (0, 0.04, 0.5), main, taper=(0.85, 1), bevel=0.05)
    box(head, (0.46, 0.08, 0.3), (0, 0.24, 0.26), dark, bevel=0.02)  # brow ridge
    for s in (-1, 1):
        box(head, (0.08, 0.06, 0.06), (s * 0.12, 0.15, 0.76), dark, bevel=0.01)
        box(head, (0.11, 0.08, 0.04), (s * 0.21, 0.2, 0.36), 'eye', emissive='eye', strength=4, bevel=0)
        for h in range(horns):
            cone(head, 0.07 - h * 0.015, 0.5 - h * 0.12, (s * (0.18 + h * 0.08), 0.36 - h * 0.08, -0.2 - h * 0.05), 'bone', rot=(-1.1 + h * 0.2, 0, s * (-0.3 - h * 0.3)), seg=4)
        for t in range(3):
            cone(head, 0.025, 0.08, (s * (0.1 + t * 0.05), -0.08, 0.7 - t * 0.12), 'bone', rot=(PI, 0, 0), seg=3)  # teeth
    jaw = pivot(head, 'jaw', (0, -0.1, 0.24))
    box(jaw, (0.36, 0.1, 0.48), (0, -0.04, 0.22), belly, taper=(0.9, 1), bevel=0.03)
    box(jaw, (0.26, 0.04, 0.32), (0, 0.02, 0.24), glow, emissive=glow, strength=3, bevel=0)

    parent, z, y = body, -0.62, 0.0
    for i in range(1, tail + 1):
        t = pivot(parent, f'tail{i}', (0, y, z), (0.2 if i == 1 else 0.05, 0, 0))
        w = max(0.1, 0.46 - i * 0.07)
        box(t, (w, w, 0.52), (0, 0, -0.24), main, bevel=0.04)
        cone(t, 0.05, 0.18, (0, w / 2 + 0.05, -0.24), dark, seg=4)
        parent, z, y = t, -0.48, 0
    box(parent, (0.34, 0.06, 0.36), (0, 0, -0.62), dark, rot=(0, PI / 4, 0), bevel=0.02)  # tail blade

    for s in (-1, 1):
        wing = pivot(body, 'wingL' if s < 0 else 'wingR', (s * 0.4, 0.36, 0.3), (0, 0, s * 0.35))
        box(wing, (span, 0.09, 0.11), (s * span / 2, 0.02, 0), dark, bevel=0.03)
        for f, (ang, ln) in enumerate(((0.35, 0.72), (0.9, 0.8), (1.45, 0.62))):
            fx = s * span * (0.55 + f * 0.22)
            box(wing, (0.06, 0.06, span * ln), (fx, 0.02, -span * ln / 2), dark, rot=(0, s * (ang - 0.9) * 0.4, 0), bevel=0.01)
        cone(wing, 0.05, 0.16, (s * span, 0.06, 0.05), 'bone', rot=(PI / 2, 0, 0), seg=4)
        membrane(wing, [(0, 0), (s * span, 0), (s * span * 1.15, -span * 0.62), (s * span * 0.85, -span * 0.82), (s * span * 0.5, -span * 0.72), (s * 0.1, -0.7)], membrane_col)

    export(scene_name, file_name)
    h = (leg_h + 1.3) * scale
    preview(file_name.replace('.glb', '.png'), target=(0, h * 0.5, 0), dist=h * 2.6 + 1.5, yaw=40, pitch=22)
    remove_preview_rig()


dragon('DB_drakeling', 'drakeling.glb', 0.8, 0xC9442A, 0x8E2A1A, 'belly', 'fire', 0x7A2418, neck=2, tail=3, span=0.8)
dragon('DB_cinderwing', 'cinderwing.glb', 2.4, 0x8E2618, 0x3C1410, 0xE08A3A, 'fire', 0x5A1A10, neck=3, tail=5, span=2.0, horns=3, spikes=5, detail=True)
dragon('DB_whelp', 'whelp.glb', 0.42, 0xFF8A2A, 0xB04A14, 0xFFD070, 0xFFE070, 0xD0602A, neck=2, tail=3, span=0.9)
result = {'ok': True}
