"""The minifigure body every humanoid shares (owner, October 4: every humanoid matches the hero's style the way LEGO
does it). It is the hero's body (hero.py) at the hero's sizes, so a piece of gear made for the hero fits any humanoid
built on it; hero.py itself is left as it is, and tests/character-art.test.ts keeps the two in step.

A figure is the hero's parts in its own colours:
  torso   a block flaring a little to the shoulders, a belt line under it and the hips below
  legs    the hero's legs ('normal': hinged under his hips at their hem, the hips on the hero's level hips socket,
          sock_hips, as hero.py and hips.py build them), LEGO-style short legs for short races ('short': about half the
          hero's legs below the hips, built the same way: hinged under the hips at their hem, the thighs' tops rounded
          about the hinge inside them, the hips level on sock_hips), or none, for a figure whose robe or skirt piece
          stands in their place ('robe': the body's pivot is then on the ground, so the robe stays on it when the
          figure leans)
  arms    an upper arm, a forearm and a LEGO C-hand on the hero's three pivots (shoulder, elbow, wrist)
  neck    and the head's pivot at its top: the hero's head cube, or the character's own head
Each character gets its identity from what it adds: its head, headgear, hair or beard, colours, a robe or skirt piece
and accessories, hung on these attachment points (empties; three.js coordinates on the parts named):
  sock_head         head centre (head)                       headgear, hair, beards: the hero's helms and hair
  sock_neck         top of the torso round the neck (body)   mantles, collars, capes, things worn round the neck
  sock_chest        torso centre (body)                      body armour (the hero's)
  sock_back         middle of the torso's back (body)        back plates, quivers, things slung on the back
  sock_belt         centre of the belt line (body)           belts, buckles, pouches, sashes
  sock_hips         the hip axis (body), with legs: the hero's hips socket, level with the legs however the body
                    leans (anim.ts levelHips): everything below the belt, armour's skirts and loincloths included
  sock_skirt        the hip line (body), with a robe: robes and skirts
  sock_shoulderL/R  top of each shoulder (body)              shoulder pads: they follow the arm by 3/4 (anim.ts)
  sock_upperL/R, sock_cuffL/R, sock_handL, sock_gloveR, sock_handR, sock_footL/R: the hero's arm and foot sockets
finish() fuses what a character hung on a fixed point into the part it rides (everything but the shoulder pads, the
level hips, what the right hand holds and outfit pieces), so a figure costs no more draw calls than its rig parts.
"""
import math
import re

import bmesh
import bpy
from mathutils import Vector

from _common import box, clip_hand, fresh_scene, joint_limb, pivot, _mesh_obj
from hips import hip_skirt

PI = math.pi
HIP = 0.9                  # the hip axis over the ground (the body's pivot), the hero's legs
LEG_HINGE = 0.725          # where the hero's legs hinge, under his hips at their hem (hero.py)
SHORT_HIP = 0.53           # short legs: the hip axis
SHORT_HINGE = 0.36         # and where they hinge, under the hips at their hem
LEG_X = 0.19
ANKLE = 0.18               # the ankle (sock_foot) over the ground
ARM_X, ARM_Y = 0.47, 0.62  # shoulder pivots, over the hip line
NECK_Y = 0.78              # the head's pivot, over the hip line
HEAD = 0.46                # the hero's head cube; sock_head at its centre
ELBOW, WRIST, HOLE = 0.28, 0.52, 0.655   # below the shoulder, the arm hanging straight (hero.py)
HAND = dict(outer=0.135, inner=0.07, depth=0.22, gap=0.07, gap_tilt=0.6, stub=(0.12, 0.08, 0.13))
TORSO_Y, TORSO = 0.42, (0.68, 0.66, 0.42)   # centre height and size; it flares a little to the shoulders
TORSO_FLARE = (1.03, 1.04)
BELT_Y, BELT = 0.07, (0.72, 0.12, 0.46)
# The hero's hips (his tunic's skirt, hero.py): half width and depth at the hip axis, hem, the belt over its round top
# and the flare to the hem (hips.py hip_skirt).
HIPS = dict(half_w=0.34, half_d=0.2138, hem=-0.17, belt=(0.01, 0.13), flare=(0.0099, 0.0062))
UPPER = (0.25, 0.32, 0.27)                  # upper arm (the hero's sleeve), from just above the shoulder pivot
FOREARM = (0.18, 0.21)                      # forearm width and depth, its top rounded about the elbow

# Attachment points on the body, over the hip line (sock_hips with legs, sock_skirt with a robe).
BODY_SOCKETS = {
    'sock_neck': (0, 0.75, 0), 'sock_chest': (0, 0.44, 0), 'sock_back': (0, 0.42, -0.21),
    'sock_belt': (0, BELT_Y, 0), 'sock_hips': (0, 0, 0), 'sock_skirt': (0, 0, 0),
    'sock_shoulderL': (0.46, 0.72, 0), 'sock_shoulderR': (-0.46, 0.72, 0),
}
# Shoulder pads follow the arm by 3/4 (anim.ts followShoulders), the hips stay level (levelHips) and what the right
# hand holds moves with it: they keep their own parts. Everything else a character hangs on the figure is fused into
# the part it rides.
MOVING = ('sock_shoulderL', 'sock_shoulderR', 'sock_hips', 'sock_handR')
RIG = ('body', 'head', 'armL', 'armR', 'elbowL', 'elbowR', 'handL', 'handR', 'legL', 'legR', 'weapon', 'staffbody',
       'sling') + MOVING


def contract(o):
    """An object's contract name: Blender keeps names unique per file, so a second figure's parts are 'body.001'...;
    the game strips that suffix too."""
    return re.sub(r'\.\d{3}$', '', o.name)


COLORS = {'torso': 0x808080, 'hips': 0x606060, 'belt': 0x5A3A22, 'neck': 0xE0AC84, 'head': 0xE0AC84,
          'upper': 0x808080, 'forearm': 0xE0AC84, 'hand': 0xE0AC84,
          'thigh': 0x4B4B58, 'shin': 0x4B4B58, 'foot': 0x5A3A22, 'sole': 0x2E1E14}


class Figure:
    """A built figure: the scene, its root and body, its rig parts and attachment points by name (fig['armL'])."""

    def __init__(self, scene, root):
        self.scene, self.root, self.body = scene, root, None
        self.parts = {}
        self.drop = 0.0   # how far the legs' hinge is under the hip axis: a height from the hip axis is y + drop on a leg

    def __getitem__(self, name):
        return self.parts[name]

    def add(self, o):
        self.parts[contract(o)] = o
        return o


def figure(scene_name, colors=None, legs='normal', head=True, dressable=False):
    """The shared body in `colors` (keys of COLORS), with 'normal', 'short' or 'robe' legs and, unless head=False (the
    character brings its own), the hero's head cube. A `dressable` figure wears gear as the hero does: its upper arms
    and feet are outfit pieces (`outfit_body_sleeveL/R`, `outfit_boots_L/R`, as the hero's sleeves and boots) that come
    off under the body armour and boots that cover them (registry.ts HeroDresser)."""
    unknown = set(colors or {}) - set(COLORS)
    if unknown:
        raise ValueError(f'unknown figure colours {sorted(unknown)}; the parts are {sorted(COLORS)}')
    col = dict(COLORS, **(colors or {}))
    scene, root = fresh_scene(scene_name)
    fig = Figure(scene, root)
    hip = {'normal': HIP, 'short': SHORT_HIP, 'robe': 0.0}[legs]
    y0 = HIP if legs == 'robe' else 0.0          # the hip line in the body's frame
    if legs != 'robe':
        hinge = LEG_HINGE if legs == 'normal' else SHORT_HINGE
        fig.drop = hip - hinge
        for name, x in (('legL', LEG_X), ('legR', -LEG_X)):
            leg = fig.add(pivot(root, name, (x, hinge, 0)))
            if legs == 'normal':   # the hero's: the thigh's top rounded about the hinge, the shin down into the foot
                joint_limb(leg, 0.29, 0.31, 0.0, 0.48 - hinge, col['thigh'], round_top=True, bevel=0.04)
                box(leg, (0.26, 0.37, 0.28), (0, 0.345 - hinge, 0), col['shin'], bevel=0.035)
            else:   # LEGO's short legs: a short thigh (its top rounded about the hinge as the hero's), a shin, the same foot
                joint_limb(leg, 0.29, 0.31, 0.0, 0.28 - hinge, col['thigh'], round_top=True, bevel=0.04)
                box(leg, (0.27, 0.15, 0.29), (0, 0.22 - hinge, 0), col['shin'], bevel=0.035)
            foot = pivot(leg, 'outfit_boots_' + name[-1]) if dressable else leg
            box(foot, (0.31, 0.13, 0.42), (0, ANKLE - hinge - 0.075, 0.05), col['foot'], bevel=0.04)    # foot
            box(foot, (0.32, 0.045, 0.44), (0, 0.0225 - hinge, 0.055), col['sole'], bevel=0.012)        # sole
            fig.add(pivot(leg, 'sock_foot' + name[-1], (0, ANKLE - hinge, 0)))
    body = fig.add(pivot(root, 'body', (0, hip, 0)))
    fig.body = body
    box(body, TORSO, (0, y0 + TORSO_Y, 0), col['torso'], taper=TORSO_FLARE, bevel=0.05)
    # The belt (an outfit piece on a dressable figure, as the hero's: armour has its own).
    box(pivot(body, 'outfit_body_belt') if dressable else body, BELT, (0, y0 + BELT_Y, 0), col['belt'], bevel=0.03)
    box(body, (0.2, 0.12, 0.2), (0, y0 + 0.8, 0), col['neck'], bevel=0.03)
    for name, p in BODY_SOCKETS.items():
        if name != ('sock_hips' if legs == 'robe' else 'sock_skirt'):
            fig.add(pivot(body, name, (p[0], y0 + p[1], p[2])))
    if legs == 'normal':   # the hero's hips, on the level hips socket (an outfit piece on a dressable figure)
        h = fig['sock_hips']
        hip_skirt(pivot(h, 'outfit_body_skirt') if dressable else h, HIPS['half_w'], HIPS['half_d'], HIPS['hem'],
                  col['hips'], HIPS['belt'], flare=HIPS['flare'], bevel=0.04)
    elif legs == 'short':   # level, the legs hinged at their hem (under a robe the robe is the hips)
        box(fig['sock_hips'], (0.7, 0.24, 0.44), (0, SHORT_HINGE - SHORT_HIP + 0.12, 0), col['hips'], taper=(0.96, 0.96),
            bevel=0.04)
    hd = fig.add(pivot(body, 'head', (0, y0 + NECK_Y, 0)))
    if head:
        box(hd, (HEAD, HEAD, HEAD), (0, 0.24, 0), col['head'], bevel=0.06)
    fig.add(pivot(hd, 'sock_head', (0, 0.24, 0)))
    for name, x in (('armL', ARM_X), ('armR', -ARM_X)):
        s, S = (1, 'L') if x > 0 else (-1, 'R')
        a = fig.add(pivot(body, name, (x, y0 + ARM_Y, 0)))
        box(pivot(a, 'outfit_body_sleeve' + S) if dressable else a, UPPER, (0, 0.03 - UPPER[1] / 2, 0), col['upper'], bevel=0.04)
        fig.add(pivot(a, 'sock_upper' + S, (0, -HOLE, 0)))
        e = fig.add(pivot(a, 'elbow' + S, (0, -ELBOW, 0)))
        joint_limb(e, FOREARM[0], FOREARM[1], 0.0, ELBOW - WRIST, col['forearm'], round_top=True)
        fig.add(pivot(e, 'sock_cuff' + S, (0, ELBOW - HOLE, 0)))
        h = fig.add(pivot(e, 'hand' + S, (0, ELBOW - WRIST, 0)))
        clip_hand(h, (0, WRIST - HOLE, 0), col['hand'], s, **HAND)
        if s > 0:
            fig.add(pivot(h, 'sock_handL', (0, WRIST - HOLE, 0)))
        else:
            fig.add(pivot(h, 'sock_gloveR', (0, WRIST - HOLE, 0)))
            fig.add(pivot(h, 'sock_handR', (0, WRIST - HOLE, 0), (PI / 2, 0, 0)))
    return fig


def finish(fig):
    """Fuse what the character hung on fixed attachment points into the parts they ride: every mesh moves up to its
    nearest rig part, a shoulder pad or what the right hand holds, keeping where it is; the helper empties go. The
    attachment points stay, empty, for gear."""
    bpy.context.view_layer.update()
    keep = lambda o: contract(o) in RIG or contract(o).startswith('outfit_')
    for o in [o for o in fig.scene.objects if o.type == 'MESH']:
        a = o.parent
        while a is not None and not keep(a):
            a = a.parent
        if a is not None and a is not o.parent:
            mw = o.matrix_world.copy()
            o.parent = a
            o.matrix_world = mw
    helper = lambda o: (o.type == 'EMPTY' and not keep(o) and not contract(o).startswith('sock_')
                        and not contract(o).endswith('_root') and not o.children)
    while True:   # emptied helpers nested in helpers go in turn
        gone = [o for o in fig.scene.objects if helper(o)]
        if not gone:
            break
        for o in gone:
            bpy.data.objects.remove(o, do_unlink=True)
    bpy.context.view_layer.update()
    return fig


# ─── Pieces laid along the body ──────────────────────────────────────────────

def cut(base, *cutters):
    """`base` with the `cutters` carved out of it (exact boolean difference), the cutters removed: one closed solid."""
    bpy.context.view_layer.update()
    for o in cutters:
        m = base.modifiers.new('cut', 'BOOLEAN')
        m.operation = 'DIFFERENCE'
        m.solver = 'EXACT'
        m.object = o
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(base.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
    for p in me.polygons:
        p.use_smooth = False
    old = [base.data] + [o.data for o in cutters]
    base.modifiers.clear()
    base.data = me
    for o in cutters:
        bpy.data.objects.remove(o, do_unlink=True)
    for m in old:
        bpy.data.meshes.remove(m)
    return base


def ribbon(parent, pts, normals, w, t, color, w1=None):
    """A strap, sash or trim laid along a path on a surface, as one continuous piece: `pts` run along its middle on the
    surface, `normals` are the surface's outward normals there; it is `w` wide (tapering to w1 at the end) and stands
    `t` proud of the surface. Turning over an edge, it bends with the surface instead of being cut and butted."""
    pts = [Vector(p) for p in pts]
    ns = [Vector(n).normalized() for n in normals]
    n = len(pts)
    w1 = w if w1 is None else w1
    bm = bmesh.new()
    rings = []
    for i, (p, nn) in enumerate(zip(pts, ns)):
        tng = (pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]).normalized()
        side = nn.cross(tng).normalized()
        hw = (w + (w1 - w) * i / (n - 1)) / 2
        rings.append([bm.verts.new(p + side * hw), bm.verts.new(p + side * hw + nn * t),
                      bm.verts.new(p - side * hw + nn * t), bm.verts.new(p - side * hw)])
    for a, b in zip(rings, rings[1:]):
        for k in range(4):
            bm.faces.new((a[k], b[k], b[(k + 1) % 4], a[(k + 1) % 4]))
    bm.faces.new(rings[0])
    bm.faces.new(list(reversed(rings[-1])))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _mesh_obj(bm, parent, (0, 0, 0), (0, 0, 0), color)


def torso_surface(y, x, side, lift=0.0, y0=0.0):
    """A point on the torso's front (side=1) or back (side=-1) face at height y and across x, with its outward normal,
    `lift` off the face (body frame, the hip line at y0)."""
    (_, h, d), (_, fz) = TORSO, TORSO_FLARE
    k = (y - y0 - (TORSO_Y - h / 2)) / h               # 0 at the torso's foot, 1 at its top
    half_d = d / 2 * (1 + (fz - 1) * k)
    tilt = d / 2 * (fz - 1) / h                        # either face leans out this much per unit up
    nrm = Vector((0, -tilt, side)).normalized()
    return Vector((x, y, side * half_d)) + nrm * lift, nrm
