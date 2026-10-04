"""Gear for the hero base: weapons, helms, body armour, gloves, boots, and the hand-built uniques.

Each file holds socket-named empties (sock_handR, sock_head, sock_chest, sock_hips, sock_shoulderL/R, sock_upperL/R,
sock_cuffL/R, sock_handL, sock_gloveR, sock_footL/R). The game moves each socket's children under the hero socket of
the same name with their local transform unchanged, so everything below is authored in socket-local space:

  sock_handR      centre of the right hand's hole, rotated +90 X: local +Y runs forward through the hole, local +Z
                  points down (arm hanging); everything held runs along +Y through the hole (hero.py HAND)
  sock_head       head centre (head = 0.46 cube)
  sock_chest      torso centre; tunic is 0.68 x 0.66 x 0.42 (flared to 1.08 x at the top), belt at y -0.37
  sock_hips       the hip axis, 0.44 below sock_chest: everything hanging below the belt rides it (hips.py)
  sock_shoulderX  top of the shoulder, sleeve below it
  sock_upperX / sock_cuffX / sock_handL / sock_gloveR   unrotated, all at the centre of the hand's hole while the arm
                  hangs straight (PALM below the shoulder pivot), each riding its own part of the arm: the upper arm
                  (sleeves, rerebraces), the forearm below the elbow (glove cuffs, vambraces) and the hand (the glove's
                  hand). The hand is a LEGO C (hero.py HAND): a 0.27 octagonal ring round a 0.14 hole, 0.22 deep.
  sock_footL/R    ankle; shoe below (0.3 x 0.17 x 0.4, toe at +Z), ground at y -0.18

Everything is modular blocks (docs/ART_CONTRACT.md, Style): chamfered boxes, stacked slabs, wedges.
Tier gear uses ROLE_metal / ROLE_trim / ROLE_dark (+ ROLE_leather, ROLE_glow) so one file serves every
palette. Uniques (u_*) use their own authored colours. Right side is -X.
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
from _common import _mesh_obj
import hips as _hips
importlib.reload(_hips)
from hips import TUCK, at_chest, band, hip_skirt
from mathutils import Vector

PI = math.pi
WOOD = 0x6B4426
STRING = (0xE8DDC4, 'plain')
SLIT = 0x0C0A0A

# Where each socket sits on the base hero (world, three.js coords) -- only used so a gear file
# previews in a sensible place; the game discards the socket's own transform.
SOCKET_POS = {
    'sock_handR': (-0.47, 0.865, 0), 'sock_gloveR': (-0.47, 0.865, 0), 'sock_handL': (0.47, 0.865, 0),
    'sock_upperL': (0.47, 0.865, 0), 'sock_upperR': (-0.47, 0.865, 0), 'sock_cuffL': (0.47, 0.865, 0), 'sock_cuffR': (-0.47, 0.865, 0),
    'sock_head': (0, 1.92, 0), 'sock_chest': (0, 1.34, 0), 'sock_hips': (0, 0.9, 0),
    'sock_shoulderL': (0.46, 1.62, 0), 'sock_shoulderR': (-0.46, 1.62, 0),
    'sock_footL': (0.19, 0.18, 0), 'sock_footR': (-0.19, 0.18, 0),
}


def rivet(p, pos, color=R.trim, r=0.024, rot=(0, 0, PI / 4)):
    """Square rivet head (a small chamfered block, turned 45 degrees by default)."""
    return box(p, (r * 1.5, r * 1.5, r * 1.2), pos, color, rot=rot, bevel=r * 0.35)


def limb_chain(p, pts, w, t, color, x=0.0):
    """Boxes following a polyline of (y, z) points in the YZ plane (bow limbs)."""
    for (y0, z0), (y1, z1) in zip(pts, pts[1:]):
        ln = math.hypot(y1 - y0, z1 - z0)
        ang = math.atan2(z1 - z0, y1 - y0)
        box(p, (w, ln + t * 0.6, t), (x, (y0 + y1) / 2, (z0 + z1) / 2), color, rot=(ang, 0, 0), bevel=min(0.02, t * 0.3))
        w *= 0.88


def grip(p, y0, y1, w, color, wraps=(), wrap_color=R.dark):
    """Square grip from y0 to y1 along local Y with raised wrap bands at `wraps`."""
    box(p, (w, y1 - y0, w), (0, (y0 + y1) / 2, 0), color, bevel=w * 0.2)
    for y in wraps:
        box(p, (w * 1.2, 0.03, w * 1.2), (0, y, 0), wrap_color, bevel=0.006)


# Keep one namespace for public builders, plate variants and uniques. Reading each part on every
# load picks up edits during a running Blender session without stale module imports.
for _part in ('gear_weapons.py', 'gear_armour_kit.py', 'gear_armour.py'):
    _part_path = os.path.join(_ROOT, 'tools', 'blender', _part)
    with open(_part_path, encoding='utf-8') as _part_source:
        exec(compile(_part_source.read(), _part_path, 'exec'), globals())

# ─── Uniques: the Wyrmbone set (uniques.py, built with everything above) ─────
exec(open(os.path.join(_ROOT, 'tools', 'blender', 'uniques.py'), encoding='utf-8').read(), globals())


GEAR = {
    'sword': sword, 'longsword': longsword, 'pickaxe': pickaxe,
    'bow_worn': bow_worn, 'bow_hunter': bow_hunter, 'bow_recurve': bow_recurve, 'bow_drakebone': bow_drakebone,
    'staff_apprentice': staff_apprentice, 'staff_oak': staff_oak, 'staff_runed': staff_runed, 'staff_ember': staff_ember,
    'helm_open': helm_open, 'helm_full': helm_full, 'body_chain': body_chain, 'body_plate': body_plate,
    'body_leather': body_leather,
    'gloves': gloves, 'boots': boots,
    'u_cinderfang': u_cinderfang, 'u_emberstring': u_emberstring, 'u_kindled_ash': u_kindled_ash,
    'u_ashen_crown': u_ashen_crown, 'u_wyrmbone': u_wyrmbone,
}


def build(model):
    scene, root = fresh_scene(f'DB_gear_{model}')
    socks = {}

    def S(name):
        if name not in socks:
            socks[name] = pivot(root, name, SOCKET_POS[name])
        return socks[name]

    GEAR[model](S)
    return scene


if globals().get('DB_RUN', True):
    only = globals().get('DB_ONLY') or list(GEAR)
    tris = {}
    for model in only:
        scene = build(model)
        tris[model] = tri_count(scene)
        export(f'DB_gear_{model}', f'gear_{model}.glb')
        if globals().get('DB_PREVIEW', True):   # DB_PREVIEW = False: export only (no EEVEE render)
            preview_auto(f'gear_{model}.png')
        remove_preview_rig()
    result = {'ok': True, 'tris': tris}
