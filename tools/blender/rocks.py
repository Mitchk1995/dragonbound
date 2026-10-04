"""The rock and cliff kit (the methods audit's J3): boulders, stones, slabs, rock masses, cliff modules and the five ore
rocks, each grown by the geometry-nodes rock generator (rock_nodes.py) and finished through the shared UV and bake
pipeline (rock_bake.py on bake.py and bake_uv.py), exported as public/models/rock_<name>.glb with its baked map
rock_<name>.bake.webp. Each rock is one closed piece. Fixed seeds: a re-export makes the same kit.

Every rock is a recipe in KIT: its class, its base shape and what the generator does to it. Base shapes:
  blob    a convex hull of seeded points on a superellipsoid (exponent `e`: 2 round, 3 to 4 blocky), jittered in,
          leaning, tapering or spreading at the foot: a broken, rounded block of stone before weathering;
  prism   a polygon outline (cliff modules: their run, corners and lips) extruded up, its corners jittered.
The rock's own space is three.js's: Y up, +Z its front (a cliff module's face), origin at its foot's centre.

    set DRAGONBOUND_ROOT=<this checkout>
    node tools/heavy.cjs "D:/pokemon/tools/blender-5.2.2/blender.exe -b --factory-startup --python
                          tools/blender/rocks.py"
(DB_ONLY=rock_boulder_a,rock_ore_tin in the environment exports only those.)
"""
import math
import os
import sys
import time

import bmesh
import bpy
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import rock_bake  # noqa: E402
import rock_nodes  # noqa: E402

ROOT = os.environ.get('DRAGONBOUND_ROOT') or os.path.dirname(os.path.dirname(HERE))
OUT_DIR = os.path.join(ROOT, 'public', 'models')

# What each class of rock gets unless its recipe says otherwise (metres; see rock_nodes.py for each step, and
# rock_bake.py for the bake's `ao`, `edge`, `edge_lift`, `moss_scale` and `cage`).
CLASS = {
    'boulder': dict(voxel=0.01, slices=(3, 0.06, 0.2, 0.3), band=0.3, wear=(2, 3), warp=(0.05, 0.9), lump=(0.05, 1.3),
                    noise=(0.02, 4.5, 4.0, 0.55), chips=(2.6, 0.08, 0.55, 0.4), cracks=(1.8, 0.025, 0.012, 0.35),
                    ao=0.45, edge=0.02, edge_lift=0.4, moss_scale=1.6, cage=0.06, tris=320, atlas=256),
    'stone': dict(voxel=0.012, slices=(3, 0.08, 0.25, 0.3), band=0.3, wear=(2, 2), warp=(0.05, 1.1), lump=(0.03, 1.6),
                  noise=(0.02, 5.0, 3.0, 0.5), chips=(3.0, 0.1, 0.6, 0.4), cracks=None,
                  ao=0.35, edge=0.025, edge_lift=0.4, moss_scale=2.0, cage=0.06, tris=72, atlas=128),
    'slab': dict(voxel=0.01, slices=(2, 0.05, 0.15, 0.1), band=0.3, wear=(2, 2), warp=(0.035, 1.0), lump=(0.03, 1.4),
                 noise=(0.014, 5.0, 4.0, 0.55), chips=(2.4, 0.06, 0.5, 0.25), cracks=(2.0, 0.02, 0.01, 0.3),
                 ao=0.4, edge=0.02, edge_lift=0.45, moss_scale=1.6, cage=0.05, tris=64, atlas=256),
    'mass': dict(voxel=0.02, slices=(4, 0.05, 0.14, 0.0), band=0.5, wear=(2, 4), warp=(0.09, 0.6), lump=(0.08, 0.8),
                 noise=(0.03, 2.8, 4.0, 0.55), chips=(1.3, 0.16, 0.5, 0.35), cracks=(0.9, 0.05, 0.022, 0.35),
                 ao=0.9, edge=0.04, edge_lift=0.35, moss_scale=0.9, cage=0.12, tris=600, atlas=512),
    'cliff': dict(voxel=0.028, slices=None, band=0.7, wear=(2, 3), warp=(0.12, 0.45), lump=(0.2, 0.45),
                  noise=(0.03, 2.2, 4.0, 0.55), chips=(0.7, 0.24, 0.5, 0.3), cracks=(0.7, 0.06, 0.028, 0.3),
                  ao=1.4, edge=0.05, edge_lift=0.4, moss_scale=0.7, cage=0.16, tris=1800, atlas=512),
    'ore': dict(voxel=0.011, slices=(3, 0.05, 0.15, 0.25), band=0.35, wear=(2, 3), warp=(0.06, 0.8), lump=(0.05, 1.1),
                noise=(0.016, 5.0, 3.0, 0.55), chips=(2.2, 0.08, 0.5, 0.4), cracks=None,
                ao=0.5, edge=0.02, edge_lift=0.4, moss_scale=1.6, cage=0.06, tris=1400, atlas=512),
}


def beds(thick, groove, recess, under, tilt=0.06, azimuth=0.0, wander=0.25, wander_scale=0.5, groove_w=None):
    return dict(thick=thick, groove=groove, recess=recess, under=under, tilt=tilt, azimuth=azimuth, wander=wander,
                wander_scale=wander_scale, groove_w=groove_w or thick * 0.18)


def blob(half, mid_y, e=2.4, n=28, jit=0.12, lean=(0.0, 0.0), taper=0.0, flare=0.0):
    return dict(kind='blob', half=half, mid_y=mid_y, e=e, n=n, jit=jit, lean=lean, taper=taper, flare=flare)


def prism(outline, height, jit=0.14, top_in=0.06):
    return dict(kind='prism', outline=outline, height=height, jit=jit, top_in=top_in)


def rect(x0, x1, z0, z1, n=3):
    """A rectangle's outline with `n` points along each side (so its sides can wander)."""
    pts = []
    for (ax, az), (bx, bz) in (((x0, z0), (x1, z0)), ((x1, z0), (x1, z1)), ((x1, z1), (x0, z1)), ((x0, z1), (x0, z0))):
        pts += [(ax + (bx - ax) * i / n, az + (bz - az) * i / n) for i in range(n)]
    return pts


FOOT = ('y', -1, 0.0)
CLIFF_BEDS = dict(groove=0.02, recess=0.06, under=0.05, tilt=0.1, wander=0.5)
KIT = [
    # Boulders: fallen and weathered blocks in the open and at the foot of the cliffs.
    dict(name='boulder_a', cls='boulder', seed=11, shape=blob((0.62, 0.48, 0.55), 0.36, e=2.3, n=16, jit=0.18),
         wear=(2, 4)),
    dict(name='boulder_b', cls='boulder', seed=12, shape=blob((0.74, 0.36, 0.62), 0.26, e=2.6, n=18, jit=0.16),
         wear=(2, 4)),
    dict(name='boulder_c', cls='boulder', seed=13, shape=blob((0.6, 0.5, 0.52), 0.4, e=3.4, n=12, jit=0.12),
         chips=(2.8, 0.06, 0.6, 0.35), wear=(1, 2), strata=beds(0.22, 0.008, 0.01, 0.02)),
    dict(name='boulder_d', cls='boulder', seed=14, shape=blob((0.64, 0.46, 0.56), 0.36, e=2.8, n=10, jit=0.24),
         chips=(1.6, 0.1, 0.6, 0.3), wear=(1, 3)),
    dict(name='boulder_e', cls='boulder', seed=15,
         shape=blob((0.48, 0.64, 0.45), 0.5, e=2.5, n=14, jit=0.18, lean=(0.08, 0.04)),
         strata=beds(0.16, 0.008, 0.012, 0.022, tilt=1.25, azimuth=0.6)),
    dict(name='boulder_f', cls='boulder', seed=16, shape=blob((0.66, 0.42, 0.56), 0.32, e=3.0, n=16, jit=0.15),
         strata=beds(0.13, 0.01, 0.016, 0.03, tilt=0.12, azimuth=1.1)),
    # Stones: scree, rubble and cave-floor pebbles (laid small and in their hundreds, so few triangles).
    dict(name='stone_a', cls='stone', seed=21, shape=blob((0.55, 0.36, 0.48), 0.26, e=2.3, n=12, jit=0.15)),
    dict(name='stone_b', cls='stone', seed=22, shape=blob((0.52, 0.4, 0.5), 0.3, e=3.2, n=10, jit=0.15),
         chips=(2.6, 0.08, 0.6, 0.3)),
    dict(name='stone_c', cls='stone', seed=23, shape=blob((0.6, 0.22, 0.5), 0.16, e=2.6, n=12, jit=0.15)),
    # Slabs: flat beds of stone with sheer sides (the cave walls' stacked strata, ledges, stepping stones).
    dict(name='slab_a', cls='slab', seed=31, shape=blob((0.64, 0.3, 0.58), 0.22, e=4.5, n=22, jit=0.06),
         cuts=[FOOT, ('y', 1, 0.46)], strata=beds(0.12, 0.008, 0.012, 0.025)),
    dict(name='slab_b', cls='slab', seed=32, shape=blob((0.62, 0.32, 0.56), 0.24, e=4.0, n=18, jit=0.1),
         cuts=[FOOT, ('y', 1, 0.48)], chips=(2.2, 0.08, 0.6, 0.3), strata=beds(0.15, 0.008, 0.01, 0.02, tilt=0.1)),
    dict(name='slab_c', cls='slab', seed=33, shape=blob((0.6, 0.36, 0.55), 0.28, e=4.5, n=22, jit=0.08),
         cuts=[FOOT, ('y', 1, 0.56)], strata=beds(0.14, 0.01, 0.016, 0.03, tilt=0.05)),
    # Rock masses: great weathered buttresses rising out of the ground along the cliffs, steep-sided like a bell and
    # rounding over at the crown (so seatMass seats them proud of the cliff face as it did the block masses' bells),
    # from broad low ones to a spire (seatMass stands each where its height fits).
    dict(name='mass_low_a', cls='mass', seed=41,
         shape=blob((1.35, 0.93, 1.05), 0.14, e=3.4, n=22, jit=0.14, taper=0.12, flare=0.15),
         slices=(6, 0.06, 0.18, 0.12),
         strata=beds(0.45, 0.012, 0.02, 0.03, tilt=0.18, azimuth=2.0), joints=(0.8, 0.05, 0.035), cap=0.1),
    dict(name='mass_low_b', cls='mass', seed=42,
         shape=blob((1.2, 1.4, 1.0), 0.2, e=3.4, n=20, jit=0.15, taper=0.15, flare=0.15),
         slices=(6, 0.06, 0.18, 0.12),
         strata=beds(0.5, 0.012, 0.022, 0.035, tilt=0.2, azimuth=0.7), joints=(0.75, 0.05, 0.035), cap=0.12),
    dict(name='mass_a', cls='mass', seed=43,
         shape=blob((1.05, 1.48, 0.95), 0.2, e=3.2, n=20, jit=0.15, taper=0.15, flare=0.15),
         slices=(6, 0.06, 0.18, 0.12),
         strata=beds(0.55, 0.012, 0.022, 0.035, tilt=0.16), joints=(0.75, 0.05, 0.035), cap=0.14),
    dict(name='mass_b', cls='mass', seed=44,
         shape=blob((0.95, 1.69, 0.9), 0.22, e=3.5, n=22, jit=0.14, taper=0.15, flare=0.15),
         slices=(6, 0.06, 0.18, 0.12),
         strata=beds(0.6, 0.012, 0.022, 0.035, tilt=0.2, azimuth=2.6), joints=(0.75, 0.05, 0.035), cap=0.14),
    # (Thick, tilted beds broken by plumb joints and cut by fracture faces, so none reads as rings stacked up a cone.)
    dict(name='mass_c', cls='mass', seed=45,
         shape=blob((0.85, 2.0, 0.8), 0.24, e=3.2, n=20, jit=0.15, lean=(0.2, 0.08), taper=0.12, flare=0.18),
         strata=beds(0.44, 0.012, 0.025, 0.04, tilt=0.28, azimuth=0.4), joints=(0.9, 0.06, 0.04), cap=0.12),
    dict(name='mass_d', cls='mass', seed=46,
         shape=blob((0.75, 2.3, 0.72), 0.26, e=3.4, n=22, jit=0.12, taper=0.12, flare=0.18),
         strata=beds(0.5, 0.012, 0.025, 0.04, tilt=0.22), joints=(1.0, 0.07, 0.04), cap=0.12, tris=640),
    dict(name='mass_e', cls='mass', seed=47,
         shape=blob((0.62, 2.65, 0.6), 0.28, e=3.2, n=22, jit=0.12, taper=0.18, lean=(-0.1, 0.12), flare=0.2),
         strata=beds(0.55, 0.012, 0.02, 0.035, tilt=0.3, azimuth=1.4), joints=(1.1, 0.07, 0.04), cap=0.12,
         tris=640),
    dict(name='spire_a', cls='mass', seed=48,
         shape=blob((0.5, 2.9, 0.48), 0.3, e=2.9, n=20, jit=0.12, taper=0.28, lean=(0.12, -0.06), flare=0.25),
         strata=beds(0.5, 0.01, 0.02, 0.03, tilt=0.35, azimuth=2.6), joints=(1.2, 0.06, 0.04), cap=0.08,
         tris=620),
    # Cliff modules: 4 m of rock face each (+Z), flat backs sunk into the hill, to build heights and cliffs from: thick,
    # tilted, wandering beds split by joints a few metres apart into great blocks, each set a little in or out on its
    # own (little enough that the beds run on across them, never coursed like masonry).
    dict(name='cliff_straight', cls='cliff', seed=51, shape=prism(rect(-2.1, 2.1, -1.25, 1.25, 5), 4.6),
         cuts=[FOOT, ('z', -1, -1.05)], front=(0.5, 0.25), joints=(0.38, 0.07, 0.05),
         strata=beds(0.62, **CLIFF_BEDS)),
    dict(name='cliff_tall', cls='cliff', seed=52, shape=prism(rect(-2.1, 2.1, -1.3, 1.3, 5), 9.6, top_in=0.12),
         cuts=[FOOT, ('z', -1, -1.1)], front=(0.55, 0.22), joints=(0.35, 0.08, 0.05), voxel=0.032,
         strata=beds(0.7, **dict(CLIFF_BEDS, groove=0.022, recess=0.07, under=0.06, azimuth=0.3)),
         tris=2400, atlas=1024),
    dict(name='cliff_corner_out', cls='cliff', seed=53, shape=prism(rect(-1.6, 1.6, -1.6, 1.6, 4), 4.6),
         cuts=[FOOT, ('z', -1, -1.35), ('x', -1, -1.35)], joints=(0.4, 0.07, 0.05),
         strata=beds(0.62, **dict(CLIFF_BEDS, azimuth=0.8))),
    dict(name='cliff_corner_in', cls='cliff', seed=54,
         shape=prism([(-2.1, -1.25), (0.0, -1.3), (2.1, -1.25), (2.15, 0.9), (2.1, 3.0), (1.5, 3.05), (0.85, 3.0),
                      (0.9, 2.1), (0.85, 1.25), (-0.6, 1.3), (-2.1, 1.25), (-2.15, 0.0)], 4.6),
         cuts=[FOOT, ('z', -1, -1.05), ('x', 1, 1.9)], joints=(0.38, 0.07, 0.05),
         strata=beds(0.62, **dict(CLIFF_BEDS, azimuth=-0.7)), tris=2000),
    dict(name='cliff_cap', cls='cliff', seed=55, shape=prism(rect(-2.1, 2.1, -1.5, 1.5, 5), 1.35, top_in=0.25),
         cuts=[FOOT, ('z', -1, -1.3), ('y', 1, 1.22)], wear=(2, 6), front=(0.3, 0.32),
         strata=beds(0.32, 0.015, 0.04, 0.08, tilt=0.04), tris=1100),
    # Ore rocks: one ore per rock, in veins through it (the game paints the vein mask in the ore's colour).
    dict(name='ore_copper', cls='ore', seed=61, shape=blob((1.15, 0.7, 1.0), 0.52, e=2.6, n=18, jit=0.15),
         vein=dict(style='branch', scale=1.3, width=0.024, patch_scale=0.9, patch=(0.25, 0.45), lift=0.012)),
    dict(name='ore_tin', cls='ore', seed=62, shape=blob((1.1, 0.74, 0.98), 0.54, e=3.2, n=16, jit=0.14),
         vein=dict(style='branch', scale=1.7, width=0.02, patch_scale=0.8, patch=(0.2, 0.4), lift=0.014)),
    dict(name='ore_iron', cls='ore', seed=63, shape=blob((1.15, 0.72, 1.0), 0.52, e=2.9, n=18, jit=0.14),
         strata=beds(0.2, 0.006, 0.01, 0.02, tilt=0.35, azimuth=0.9),
         vein=dict(style='branch', scale=1.05, width=0.034, halo=2.6, patch_scale=0.7, patch=(0.2, 0.4), lift=0.01)),
    dict(name='ore_coal', cls='ore', seed=64, shape=blob((1.15, 0.66, 1.0), 0.48, e=3.4, n=18, jit=0.12),
         strata=beds(0.18, 0.008, 0.014, 0.025, tilt=0.08),
         vein=dict(style='branch', scale=1.0, width=0.036, stretch=(0.45, 2.4, 0.45), patch_scale=0.6,
                   patch=(0.15, 0.35), lift=-0.014)),
    dict(name='ore_emberite', cls='ore', seed=65, shape=blob((1.1, 0.76, 0.98), 0.56, e=2.9, n=14, jit=0.18),
         chips=(1.8, 0.1, 0.6, 0.3),
         vein=dict(style='crack', scale=2.0, width=0.022, patch_scale=0.7, patch=(0.12, 0.3), lift=-0.02)),
]


# ─── Base shapes ─────────────────────────────────────────────────────────────

def blob_points(rng, s):
    """Seeded points on a superellipsoid (half extents, exponent), jittered in, leaning, tapering and spreading."""
    h, n = np.array(s['half']), s['n']
    # (Directions spread evenly over the sphere, a golden spiral turned and shaken at random, so the hull reaches its
    # crown and every side; random directions alone leave whole sides short.)
    i = np.arange(n) + 0.5
    polar, turn = np.arccos(1 - 2 * i / n), np.pi * (1 + 5 ** 0.5) * i + rng.uniform(0, 2 * np.pi)
    d = np.stack([np.sin(polar) * np.cos(turn), np.cos(polar), np.sin(polar) * np.sin(turn)], 1)
    d += rng.normal(scale=0.16, size=(n, 3))
    d /= np.linalg.norm(d, axis=1, keepdims=True)
    # (Laid on the unit superellipsoid along each direction, then stretched to the half extents: points spread evenly
    # down a tall spire too, not crowded round its waist.)
    t = np.sum(np.abs(d) ** s['e'], axis=1) ** (-1.0 / s['e'])
    p = d * (t * (1.0 - s['jit'] * rng.random(n)))[:, None] * h
    up = (p[:, 1] + h[1]) / (2 * h[1])                       # 0 at its foot .. 1 at its crown
    p[:, [0, 2]] *= (1.0 - s['taper'] * up)[:, None]
    p[:, 0] += s['lean'][0] * h[0] * up
    p[:, 2] += s['lean'][1] * h[2] * up
    p[:, 1] += s['mid_y']
    # A skirt: the foot spreads out into the ground (most at the ground, gone well before the crown), as a rock rising
    # out of a slope does, so a mass seats against a cliff without standing sheer over the walk below it.
    vis = np.clip(p[:, 1] / (h[1] + s['mid_y']), 0, 1)
    p[:, [0, 2]] *= (1.0 + s['flare'] * np.clip(1 - vis / 0.6, 0, 1) ** 2)[:, None]
    return p


def hull_mesh(name, pts):
    bm = bmesh.new()
    for p in pts:
        bm.verts.new(tuple(p))
    bmesh.ops.convex_hull(bm, input=list(bm.verts))
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    return me


def prism_mesh(name, rng, s):
    """A closed prism: the outline (x, z) at the foot, the same outline jittered and drawn in at the top."""
    out = np.array(s['outline'], dtype=float)
    mid = out.mean(axis=0)
    bm = bmesh.new()
    rings = []
    for y, k in ((-0.3, 0.0), (s['height'], 1.0)):
        ring = []
        for x, z in out:
            j = rng.uniform(-s['jit'], s['jit'], 2)
            px, pz = x + j[0] - (x - mid[0]) * s['top_in'] * k / 2, z + j[1] - (z - mid[1]) * s['top_in'] * k / 2
            ring.append(bm.verts.new((px, y + (rng.uniform(-s['jit'], s['jit']) * 2 if k else 0.0), pz)))
        rings.append(ring)
    n = len(out)
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[1])
    for i in range(n):
        bm.faces.new((rings[0][i], rings[0][(i + 1) % n], rings[1][(i + 1) % n], rings[1][i]))
    bmesh.ops.triangulate(bm, faces=list(bm.faces))
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    return me


def fracture_planes(rng, co, middle, slices):
    """A few big fracture planes across a rock: each faces a seeded way round its sides, tipped up or down by at most
    `tilt` (a tall mass's planes stand plumb, so none shears its crown away), and stands a share of the rock's reach
    that way in from its outermost point, so it shears a flat broken face off its side."""
    if not slices:
        return []
    count, lo, hi, tilt = slices
    out = []
    for _ in range(count):
        a = rng.uniform(0, 2 * math.pi)
        n = np.array([math.cos(a), rng.uniform(-0.3, 1.0) * tilt, math.sin(a)])
        n /= np.linalg.norm(n)
        reach = float(np.max((co - np.array(middle)) @ n))
        out.append((tuple(float(x) for x in n), reach * (1.0 - rng.uniform(lo, hi))))
    return out


def recipe(spec):
    """The full recipe: the class defaults under the rock's own, its base mesh, bounds and seeded offsets."""
    r = dict(CLASS[spec['cls']], cuts=[FOOT], clean=1, strata=None, joints=None, front=None, vein=None)
    r.update(spec)
    rng = np.random.default_rng(r['seed'])
    s = r['shape']
    if s['kind'] == 'blob':
        pts = blob_points(rng, s)
        me = hull_mesh(f"DB_rock_{r['name']}_base", pts)
        r['half'], r['middle'] = tuple(s['half']), (0.0, s['mid_y'], 0.0)
    else:
        me = prism_mesh(f"DB_rock_{r['name']}_base", rng, s)
        out = np.array(s['outline'])
        lo, hi = out.min(axis=0), out.max(axis=0)
        r['half'] = (float(hi[0] - lo[0]) / 2, s['height'] / 2, float(hi[1] - lo[1]) / 2)
        r['middle'] = (float(hi[0] + lo[0]) / 2, s['height'] / 2, float(hi[1] + lo[1]) / 2)
    co = np.array([v.co for v in me.vertices])
    # (The grid reaches past the base by as far as anything can push the surface out.)
    reach = (r['warp'][0] + r['lump'][0] + r['noise'][0] + (r['front'] or (0, 0))[0]
             + (r['strata']['recess'] if r['strata'] else 0) + max(0.0, (r['vein'] or {}).get('lift', 0))
             + 4 * r['voxel'] + 0.05)
    lo, hi = co.min(axis=0) - reach, co.max(axis=0) + reach
    lo[1] = -2 * r['voxel']
    r['bounds'] = (tuple(lo), tuple(hi))
    r['offset'] = tuple(rng.uniform(-40, 40, 3))
    r['planes'] = fracture_planes(rng, co, r['middle'], r['slices'])
    r['chip_offset'] = tuple(rng.uniform(-40, 40, 3))
    if r.get('cap'):
        # A caprock crown: the top sheared off along the bedding, a plane `cap` of the rock's reach above its middle
        # (about half a mass's height) down from its crown, and weathered with the sides after as every fracture face
        # is, so a mass stands with a broad crown for moss, not a point.
        st = r['strata'] or {}
        n = np.array(rock_nodes.bed_normal(st.get('tilt', 0.0), st.get('azimuth', 0.0)))
        reach = float(np.max((co - np.array(r['middle'])) @ n))
        r['planes'].append((tuple(float(x) for x in n), reach * (1.0 - r['cap'])))
    return r, me


# ─── Building one rock ───────────────────────────────────────────────────────

def fresh_scene(name):
    old = bpy.data.scenes.get(name)
    if old:
        bpy.data.scenes.remove(old)
    scene = bpy.data.scenes.new(name)
    bpy.context.window.scene = scene
    root = bpy.data.objects.new(f'{name}_root', None)
    root.rotation_euler = (math.radians(90), 0, 0)   # (three.js axes inside: Y up, +Z forward)
    scene.collection.objects.link(root)
    return scene, root


def build(spec):
    """Grow, finish, bake and export one rock; returns its report line."""
    t0 = time.time()
    r, base_me = recipe(spec)
    name = f"rock_{r['name']}"
    scene, root = fresh_scene(f'DB_{name}')
    base = bpy.data.objects.new(f'{name}_base', base_me)
    scene.collection.objects.link(base)
    base.parent = root
    mod = base.modifiers.new('rock', 'NODES')
    mod.node_group = rock_nodes.build_tree(r)
    bpy.context.view_layer.update()
    high = rock_bake.evaluated(base, f'{name}_high', root)
    crumbs = rock_bake.keep_largest(high.data)
    dense = rock_bake.require_solid(high.data, f'{name} (dense)')
    low, tris = rock_bake.decimate(high, r['tris'], 'rock', root)
    rock_bake.unwrap(low, root, r['atlas'])
    path = os.path.join(OUT_DIR, f'{name}.glb')
    rock_bake.bake_maps(low, high, scene, r, r['atlas'], os.path.splitext(path)[0] + '.bake.webp')
    for o in (base, high):
        bpy.data.objects.remove(o, do_unlink=True)
    size = rock_bake.export(root, low, path)
    dims = [round(x, 2) for x in low.dimensions]
    return (f'{name}: {dense} dense triangles ({crumbs} crumbs dropped) -> {tris}, {r["atlas"]} atlas, '
            f'{size // 1024} KB, size {dims}, {time.time() - t0:.1f} s')


def main():
    only = [n for n in os.environ.get('DB_ONLY', '').split(',') if n]
    os.makedirs(OUT_DIR, exist_ok=True)
    for spec in KIT:
        if only and f"rock_{spec['name']}" not in only:
            continue
        print('ROCK', build(spec), flush=True)


if globals().get('DB_RUN', True):
    main()
