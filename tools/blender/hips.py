"""The hips: what hangs below the belt (hero.py, gear.py, uniques.py).

Like a LEGO minifigure's, the hero's legs hinge under his hips, at the tunic's hem (hero.py LEG_HINGE), each thigh's top
rounded about the hinge, and everything hanging below the belt rides the hips socket, sock_hips: the tunic's skirt,
every armour's skirt and the flaps, tassets and tabards hanging from its belt. The hips stay level with the legs while
the body leans over them (anim.ts Rig.levelHips) and the whole hero turns into a sword swing, so a striding leg only
ever swings below them and never shows through them (skirtcheck.py skirt_clip_all checks every outfit in every pose).

The body leans about the hip axis, sock_hips' origin, so a belt (on the body) rides up and down a little over what
hangs from it: 2-3 cm in the walk and the sword's wind-up, up to 8 cm when the hero is hit. A skirt's top is therefore
round about the axis, up inside the belt (hip_skirt), and every plate, flap and strip hanging from a belt starts behind
it, TUCK above its lower edge (a tabard hanging in front of it starts a little over it), so no gap opens under the belt
in the walk.
"""
import math

import bmesh
from _common import _mesh_obj, pivot

CHEST_Y = 0.44            # sock_chest above the hip axis (hero.py)
TUCK = 0.04


def at_chest(hips):
    """A frame on the hips laid out in sock_chest's coordinates, so what hangs there lines up with the cuirass."""
    return pivot(hips, 'hips', (0, CHEST_Y, 0))


def band(y, h):
    """The (bottom, top) of a belt h tall at y in sock_chest's coordinates, above the hip axis (for hip_skirt)."""
    return (y - h / 2 + CHEST_Y, y + h / 2 + CHEST_Y)


def hip_skirt(parent, half_w, half_d, hem, color, belt, flare=(0.0, 0.0), bevel=0.03, inset=0.04, seg=12):
    """A skirt in one piece on the hips (its parent's origin on the hip axis, the X axis the body leans about), under
    a belt that spans `belt` = (bottom, top) above the axis. Below the axis it is a block 2 x half_w wide and 2 x half_d
    deep at the axis, flaring by `flare` (x, z) more each side down to the hem at y = hem (< 0). Above the axis its top
    is round about the axis (radius half_d), up into the belt and a little past its top, where it is cut flat; from the
    belt's lower edge up its sides draw in by `inset`, so it stays inside the waist above the belt. However the body
    leans, its belt turns over this round top: it never opens a gap above the skirt or catches its corner."""
    dx, dz = flare
    fold, top = belt[0], belt[1] + 0.02
    assert 0 < fold < top < half_d, f'the belt {belt} must sit above the hip axis and below the top of the round, {half_d}'
    rise = lambda y: math.asin(y / half_d)
    marks = (rise(fold), rise(top))
    # The round's facets, every pi/seg up to its flat top, and its fold at the belt's lower edge (no sliver beside it).
    ups = sorted(set(marks) | {a for a in (math.pi * k / seg for k in range(1, seg))
                               if a < marks[1] and min(abs(a - m) for m in marks) > 0.02})
    front = [(half_d * math.cos(a), half_d * math.sin(a)) for a in ups]                   # (z, y) up the round top
    prof = [(half_d + dz, hem), (half_d, 0.0)] + front + [(-z, y) for z, y in reversed(front)] + [(-half_d, 0.0), (-half_d - dz, hem)]
    below = lambda y: half_w + dx * y / hem                                               # the sides flare to the hem
    width = lambda y: below(y) if y <= fold + 1e-9 else below(fold) - inset * (y - fold) / (top - fold)
    bm = bmesh.new()
    sides = [[bm.verts.new((s * width(y), y, z)) for z, y in prof] for s in (1, -1)]
    n = len(prof)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((sides[0][i], sides[1][i], sides[1][j], sides[0][j]))
    # Each side in two flat faces, folding in along the belt's lower edge.
    low = [i for i, (z, y) in enumerate(prof) if y <= fold + 1e-9]
    high = [i for i, (z, y) in enumerate(prof) if y >= fold - 1e-9]
    for ring, rev in ((sides[0], False), (sides[1], True)):
        for part in (low, high):
            f = [ring[i] for i in part]
            bm.faces.new(list(reversed(f)) if rev else f)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if bevel > 0:   # chamfer the block's edges, not the facets of its round top nor the fold
        sharp = [e for e in bm.edges if e.calc_face_angle(0.0) > 0.6]
        bmesh.ops.bevel(bm, geom=sharp, offset=bevel, segments=1, affect='EDGES', profile=0.5, clamp_overlap=True)
    return _mesh_obj(bm, parent, (0, 0, 0), (0, 0, 0), color)
