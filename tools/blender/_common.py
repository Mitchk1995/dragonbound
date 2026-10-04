"""
Shared helpers for Dragonbound model scripts.

Every model is built from code so it can be tweaked and re-exported at will. Exports land in the
checkout named by DRAGONBOUND_ROOT (set it when working in a worktree), else the one holding this file:
    set DRAGONBOUND_ROOT=D:\\gameplanning\\.claude\\worktrees\\<name>
    blender -b --python-expr "exec(open(r'%DRAGONBOUND_ROOT%\\tools\\blender\\hero.py').read())"

Models are authored inside a root empty rotated +90 degrees about X, so all positions and
rotations below use three.js coordinates (Y up, +Z forward) and match the in-game rig.
Object names are the contract with src/render/anim.ts (body, head, armL, armR, legL, legR,
weapon, neck1.., tail1.., wingL/R, jaw, legFL..).
"""
import math
import os

import bmesh
import bpy
from mathutils import Matrix, Vector

ROOT = os.environ.get('DRAGONBOUND_ROOT') or os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT_DIR = os.path.join(ROOT, 'public', 'models')
PREVIEW_DIR = os.path.join(ROOT, 'tools', 'blender', 'previews')

PAL = {
    'skin': 0xF2C49B, 'steel': 0xB9C6D2, 'steelDark': 0x7D8A99, 'gold': 0xE8B64A,
    'leather': 0x8A5A34, 'leatherDark': 0x5A3A22, 'cloth': 0x2F6DB5, 'clothDark': 0x1F4A80,
    'red': 0xC0392B, 'wood': 0x6B4426, 'goblin': 0x74B347, 'goblinDark': 0x4E7F2C,
    'kobold': 0xC77B3A, 'koboldDark': 0x8F5222, 'belly': 0xF2B45A, 'robe': 0x762438,
    'robeDark': 0x4A1426, 'fire': 0xFF7A1A, 'ember': 0xFFB040, 'bone': 0xEEE4CC,
    'black': 0x1A1414, 'eye': 0xFFE070, 'arcane': 0x6AA8FF, 'white': 0xFFFFFF,
}


def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_rgba(h):
    return tuple(srgb_to_linear(((h >> s) & 255) / 255) for s in (16, 8, 0)) + (1.0,)


def mat(color, emissive=None, strength=2.0, double_sided=False, metal=False, kind=None):
    """Fixed-colour material. `metal` marks forged metal: the game gives it the shiny metal finish. `kind` names its
    painted material in the game (charSurfaces.ts SURFACES: 'wood', 'leather', 'plain'...), else judged by colour."""
    key = f'db_{color:06x}_{emissive or 0:06x}_{strength}_{int(double_sided)}' + ('_metal' if metal else '') + (f'_{kind}' if kind else '')
    m = bpy.data.materials.get(key)
    if m:
        return m
    m = bpy.data.materials.new(key)
    if kind:
        m['db_kind'] = kind
    m.use_nodes = True
    m.use_backface_culling = not double_sided
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = hex_rgba(color)
    bsdf.inputs['Roughness'].default_value = 0.35 if metal else 0.75
    bsdf.inputs['Metallic'].default_value = 1.0 if metal else 0.0
    if emissive is not None:
        bsdf.inputs['Emission Color'].default_value = hex_rgba(emissive)
        bsdf.inputs['Emission Strength'].default_value = strength
    return m


def c(name):
    return PAL[name] if isinstance(name, str) else name


def metallic(color):
    """Colour spec for a forged-metal part of a fixed colour (unique gear): pass it anywhere a colour is accepted."""
    return mat(c(color), metal=True)


# ─── Role materials (recoloured at runtime, see docs/ART_NAMES.md) ────────────
# Neutral placeholder colours; the game replaces them per skin tone / cloth dye / gear tier.
ROLE_COLORS = {
    'skin': 0xE0AC84, 'hair': 0x5A3A22, 'cloth': 0x3A6EA5, 'clothDark': 0x1F3F66, 'cloth2': 0x4B4B58, 'leather': 0x6A4428,
    'metal': 0xA9B3BD, 'trim': 0xD4A84A, 'dark': 0x3A3A44, 'glow': 0xFFB040,
}


def role(name):
    """Material named exactly ROLE_<name>; `glow` is emissive."""
    if name not in ROLE_COLORS:
        raise ValueError(f'unknown role {name}')
    key = f'ROLE_{name}'
    m = bpy.data.materials.get(key)
    if m:
        return m
    m = bpy.data.materials.new(key)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = hex_rgba(ROLE_COLORS[name])
    bsdf.inputs['Roughness'].default_value = 0.75
    bsdf.inputs['Metallic'].default_value = 0.0
    if name == 'glow':
        bsdf.inputs['Emission Color'].default_value = hex_rgba(ROLE_COLORS[name])
        bsdf.inputs['Emission Strength'].default_value = 3.0
    return m


class _Roles:
    """`R.metal` == 'ROLE:metal' -- pass anywhere a colour is accepted."""
    def __getattr__(self, n):
        if n.startswith('__'):
            raise AttributeError(n)
        return 'ROLE:' + n


R = _Roles()


def resolve_mat(color, emissive=None, strength=2.0, double_sided=False):
    """Colour spec -> material. Accepts a PAL key, a hex int, 'ROLE:<name>', a bpy Material or (colour, kind)."""
    if isinstance(color, bpy.types.Material):
        return color
    if isinstance(color, tuple):
        return mat(c(color[0]), c(emissive) if emissive is not None else None, strength, double_sided, kind=color[1])
    if isinstance(color, str) and color.startswith('ROLE:'):
        return role(color[5:])
    return mat(c(color), c(emissive) if emissive is not None else None, strength, double_sided)


def fresh_scene(name):
    """Build each asset in its own scene so the user's own scenes are never touched."""
    old = bpy.data.scenes.get(name)
    if old:
        for o in list(old.objects):
            bpy.data.objects.remove(o, do_unlink=True)
        scene = old
    else:
        scene = bpy.data.scenes.new(name)
    bpy.context.window.scene = scene
    root = bpy.data.objects.new(f'{name}_root', None)
    root.empty_display_size = 0.3
    root.rotation_euler = (math.radians(90), 0, 0)
    scene.collection.objects.link(root)
    return scene, root


def _link(obj, parent, pos, rot):
    bpy.context.scene.collection.objects.link(obj)
    obj.parent = parent
    obj.rotation_mode = 'ZYX'  # matches three.js Euler 'XYZ'
    obj.location = pos
    obj.rotation_euler = rot
    return obj


def pivot(parent, name, pos=(0, 0, 0), rot=(0, 0, 0)):
    e = bpy.data.objects.new(name, None)
    e.empty_display_size = 0.1
    return _link(e, parent, pos, rot)


_counter = [0]


def _mesh_obj(bm, parent, pos, rot, color, emissive=None, strength=2.0, name=None, double_sided=False):
    _counter[0] += 1
    me = bpy.data.meshes.new(f'm{_counter[0]}')
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = False
    me.materials.append(resolve_mat(color, emissive, strength, double_sided))
    obj = bpy.data.objects.new(name or f'p{_counter[0]}', me)
    return _link(obj, parent, pos, rot)


def box(parent, size, pos, color, rot=(0, 0, 0), bevel=0.025, emissive=None, strength=2.0, taper=None):
    """Chamfered box. `taper` scales the top face (x, z) for wedge/trapezoid shapes."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= size[0]
        v.co.y *= size[1]
        v.co.z *= size[2]
        if taper and v.co.y > 0:
            v.co.x *= taper[0]
            v.co.z *= taper[1]
    if bevel > 0:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=min(bevel, min(size) * 0.3), segments=1, affect='EDGES', profile=0.5)
    return _mesh_obj(bm, parent, pos, rot, color, emissive, strength)


def union(base, *others, colours=False):
    """Fuse meshes into `base` as one closed solid (exact boolean union), removing the others: one part, no seams or
    buried faces between the pieces, in one painted tone or, with `colours`, each piece keeping its own. Each piece's
    faces keep their shading."""
    bpy.context.view_layer.update()
    for o in others:
        m = base.modifiers.new('union', 'BOOLEAN')
        m.operation = 'UNION'
        m.solver = 'EXACT'
        m.material_mode = 'TRANSFER' if colours else 'INDEX'
        m.object = o
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(base.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
    old = [base.data] + [o.data for o in others]
    base.modifiers.clear()
    base.data = me
    for o in others:
        bpy.data.objects.remove(o, do_unlink=True)
    for m in old:
        bpy.data.meshes.remove(m)
    return base


def _oct(apothem):
    """An octagon with flats facing +-X, +-Y and the diagonals, as (axis apothem, diagonal apothem): a number is a
    regular octagon, a pair a square with its corners cut (a bigger diagonal apothem)."""
    a, d = (apothem, apothem) if isinstance(apothem, (int, float)) else apothem
    flats = [(k * math.pi / 4, a if k % 2 == 0 else d) for k in range(8)]
    # Corner k sits between flat k and flat k + 1: where their two lines meet.
    corners = []
    for k in range(8):
        (t0, p0), (t1, p1) = flats[k], flats[(k + 1) % 8]
        det = math.sin(t1 - t0)
        x = (p0 * math.sin(t1) - p1 * math.sin(t0)) / det
        y = (p1 * math.cos(t0) - p0 * math.cos(t1)) / det
        corners.append((math.atan2(y, x) % (2 * math.pi), math.hypot(x, y)))

    def r(t):   # distance from the centre to the outline along the direction at angle t
        return min(p / math.cos(t - tf) for tf, p in flats if math.cos(t - tf) > 1e-6)
    return r, sorted(c[0] for c in corners)


def clip_profile(outer, inner, gap, gap_at):
    """The C of a LEGO-style hand, in its own plane: an octagon `outer` round an octagonal hole `inner` (see _oct),
    cut through by a slot `gap` wide whose middle points along angle `gap_at` (0 = +X, pi/2 = +Y). Returns the outline
    as (x, y) points, counter-clockwise: round the outside from one wall of the slot to the other, then back round the
    hole."""
    ro, co = _oct(outer)
    ri, ci = _oct(inner)

    def wall(r_fn, side):
        d = 0.0
        for _ in range(8):   # the slot's walls are parallel: offset gap/2 from its middle at every radius
            d = math.asin(min(0.99, gap / 2 / r_fn(gap_at + side * d)))
        return gap_at + side * d
    o0, o1 = wall(ro, 1), wall(ro, -1) + 2 * math.pi
    i0, i1 = wall(ri, 1), wall(ri, -1) + 2 * math.pi
    turns = lambda cs: sorted(t + k * 2 * math.pi for t in cs for k in (-1, 0, 1, 2))
    pt = lambda r_fn, t: (r_fn(t) * math.cos(t), r_fn(t) * math.sin(t))
    out = [pt(ro, o0)] + [pt(ro, t) for t in turns(co) if o0 < t < o1] + [pt(ro, o1)]
    hole = [pt(ri, i1)] + [pt(ri, t) for t in reversed(turns(ci)) if i0 < t < i1] + [pt(ri, i0)]
    return out + hole


def clip_hand(parent, pos, color, s, outer=0.135, inner=0.07, depth=0.22, gap=0.05, gap_tilt=0.5, stub=(0.13, 0.09, 0.13),
              rot=(0, 0, 0), bevel=0.018):
    """A hand in one piece shaped like a LEGO minifigure's: a chunky C (an octagonal ring) with a hole that whatever it
    holds passes through, never a thumb. Its local frame is the hanging hand's: the wrist above (+Y), where a short
    stub carries it into the forearm; the hole runs front to back (local Z), so a held grip points forward; the slot of
    the C opens downward, tipped `gap_tilt` toward the body (side s: +1 for a left hand at +X, -1 for a right hand).
    `pos` is the centre of the hole."""
    gap_at = -math.pi / 2 - s * gap_tilt
    pts = clip_profile(outer, inner, gap, gap_at)
    bm = bmesh.new()
    front = [bm.verts.new((x, y, depth / 2)) for x, y in pts]
    back = [bm.verts.new((x, y, -depth / 2)) for x, y in pts]
    bm.faces.new(front)
    bm.faces.new(list(reversed(back)))
    n = len(pts)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((front[i], back[i], back[j], front[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if bevel > 0:   # chamfer the rims round the front and back faces (not along the depth), so it reads chunky and soft
        rims = [e for e in bm.edges if abs(e.verts[0].co.z - e.verts[1].co.z) < 1e-6]
        bmesh.ops.bevel(bm, geom=rims, offset=bevel, segments=1, affect='EDGES', profile=0.5, clamp_overlap=True)
    o = _mesh_obj(bm, parent, (0, 0, 0), (0, 0, 0), color)
    if stub:
        w, h, d = stub
        union(o, box(parent, (w, h + 0.02, d), (0, outer + h / 2 - 0.01, 0), color, bevel=0))
    o.location = pos
    o.rotation_euler = rot
    return o


def joint_limb(parent, w, d, y0, y1, color, round_top=False, round_bottom=False, bevel=0.03, z=0.0):
    """A limb block from height y0 down to y1 (y0 > y1), w wide (X) and d deep (Z), in its parent's frame. An end at a
    joint (`round_top` / `round_bottom`) is rounded about the joint's hinge (the X axis through that end's height): it
    runs on past it as half an octagon of radius d/2, so the block keeps its outline however far the joint bends and
    two limbs rounded about the same hinge meet in one seamless joint."""
    r = d / 2
    t = r * math.tan(math.pi / 8)

    def end(y, sgn, rounded):   # (z, y) points across one end, from +z to -z; sgn = +1 at the top
        if not rounded:
            return [(r, y), (-r, y)]
        return [(r, y + sgn * t), (t, y + sgn * r), (-t, y + sgn * r), (-r, y + sgn * t)]
    pts = end(y0, 1, round_top) + list(reversed(end(y1, -1, round_bottom)))
    # The outline lies in the YZ plane; the prism's depth runs along X (its local x becomes -z).
    return prism(parent, [(-zz, yy) for zz, yy in pts], w, (0, 0, z), color, rot=(0, math.pi / 2, 0), bevel=bevel)


def cyl(parent, r_top, r_bot, h, pos, color, rot=(0, 0, 0), seg=6, emissive=None, strength=2.0):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r_bot, radius2=r_top, depth=h)
    # create_cone builds along Z; rotate to three.js Y-up local space.
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.radians(-90), 3, 'X'))
    return _mesh_obj(bm, parent, pos, rot, color, emissive, strength)


def cone(parent, r, h, pos, color, rot=(0, 0, 0), seg=5, emissive=None, strength=2.0):
    return cyl(parent, 0.0001, r, h, pos, color, rot, seg, emissive, strength)


def gem(parent, r, pos, color, emissive=None, strength=2.0, rot=(0, 0, 0)):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=1, radius=r)
    return _mesh_obj(bm, parent, pos, rot, color, emissive, strength)


def membrane(parent, pts, color, y=0.0, thickness=0.03):
    """Flat wing membrane from a fan of (x, z) points, given a little thickness so both sides shade."""
    bm = bmesh.new()
    top = [bm.verts.new((x, y + thickness / 2, z)) for x, z in pts]
    bot = [bm.verts.new((x, y - thickness / 2, z)) for x, z in pts]
    bm.faces.new(top)
    bm.faces.new(list(reversed(bot)))
    n = len(pts)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((top[i], bot[i], bot[j], top[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _mesh_obj(bm, parent, (0, 0, 0), (0, 0, 0), color, double_sided=True)


def prism(parent, pts, depth, pos, color, rot=(0, 0, 0), emissive=None, strength=2.0, bevel=0.0):
    """Outline of (x, y) points (counter-clockwise) extruded +-depth/2 along local Z. Good for blades/spikes/scales."""
    bm = bmesh.new()
    front = [bm.verts.new((x, y, depth / 2)) for x, y in pts]
    back = [bm.verts.new((x, y, -depth / 2)) for x, y in pts]
    bm.faces.new(front)
    bm.faces.new(list(reversed(back)))
    n = len(pts)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((front[i], back[i], back[j], front[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if bevel > 0:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, segments=1, affect='EDGES', profile=0.5, clamp_overlap=True)
    return _mesh_obj(bm, parent, pos, rot, color, emissive, strength)


def beam(parent, a, b, w, color, w1=None, d=None, d1=None, bevel=0.015, emissive=None, strength=2.0):
    """Chamfered block from point a to point b: w wide (x-ish) and d deep at a, tapering to w1 x d1 at b.
    The building block for horns, claws, tines, spikes and limbs in the blocky style."""
    a, b = Vector(a), Vector(b)
    d = w if d is None else d
    w1 = w if w1 is None else w1
    d1 = d if d1 is None else d1
    tx, tz = w1 / w, d1 / d
    if min(tx, tz) < 0.4:   # near-pointed tips: a chamfer would fold over the tiny end face
        bevel = 0.0
    return box(parent, (w, (b - a).length, d), tuple((a + b) / 2), color, rot=rot_to(b - a), bevel=bevel,
               emissive=emissive, strength=strength, taper=(tx, tz))


def facet_gem(parent, r, pos, color, emissive=None, strength=2.0, rot=(0, 0, math.pi / 4), depth=None):
    """Cut gem: a square turned to a diamond with deep chamfers, so every face is a flat facet."""
    s = r * 1.45
    return box(parent, (s, s, depth or r * 1.2), pos, color, rot=rot, bevel=r * 0.34, emissive=emissive, strength=strength)


def ring(parent, r_out, r_in, h, pos, color, rot=(0, 0, 0), seg=8, emissive=None, strength=2.0):
    """Flat band / collar around local Y (rims, cage hoops, bracelets)."""
    bm = bmesh.new()
    rings = []
    for (r, y) in ((r_out, h / 2), (r_out, -h / 2), (r_in, -h / 2), (r_in, h / 2)):
        rings.append([bm.verts.new((math.cos(a) * r, y, math.sin(a) * r)) for a in (i * 2 * math.pi / seg for i in range(seg))])
    for k in range(4):
        a, b = rings[k], rings[(k + 1) % 4]
        for i in range(seg):
            j = (i + 1) % seg
            bm.faces.new((a[i], a[j], b[j], b[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _mesh_obj(bm, parent, pos, rot, color, emissive, strength)


# ─── Curved-surface kit ──────────────────────────────────────────────────────
# Parametric surfaces fn(u, v) -> (x, y, z) with u, v in [0, 1], turned into thick flat-shaded shells by
# surf(). loft_fn() builds rounded (superellipse) bodies from cross-section rows; bell_fn() builds shoulder
# domes; grow()/sub()/mirror() derive trims, straps and the other side from a surface.

def V(*a):
    return Vector(a if len(a) == 3 else a[0])


def rot_to(n):
    """ZYX euler (what _link uses) that turns local +Y onto direction n."""
    e = Vector((0, 1, 0)).rotation_difference(Vector(n).normalized()).to_euler('ZYX')
    return (e.x, e.y, e.z)


def face_rot(n):
    """ZYX euler that turns local +Z onto n (thin boxes lying on a surface)."""
    e = Vector((0, 0, 1)).rotation_difference(Vector(n).normalized()).to_euler('ZYX')
    return (e.x, e.y, e.z)


def corner_up():
    """ZYX euler that stands a cube on its corner (a floating orb gem: facet_gem(..., rot=corner_up(), depth=r * 1.45))."""
    e = Vector((1, 1, 1)).rotation_difference(Vector((0, 1, 0))).to_euler('ZYX')
    return (e.x, e.y, e.z)


def ssin(t, e):
    s = math.sin(t)
    return math.copysign(abs(s) ** (2 / e), s)


def scos(t, e):
    c_ = math.cos(t)
    return math.copysign(abs(c_) ** (2 / e), c_)


def surf_normal(fn, u, v, inside, h=1e-3):
    """Unit normal of fn at (u, v), pointing away from the point `inside`."""
    u0, u1 = max(0, u - h), min(1, u + h)
    v0, v1 = max(0, v - h), min(1, v + h)
    du = V(fn(u1, v)) - V(fn(u0, v))
    dv = V(fn(u, v1)) - V(fn(u, v0))
    n = du.cross(dv)
    p = V(fn(u, v))
    if n.length < 1e-9:
        n = p - V(inside)
    n.normalize()
    return n if n.dot(p - V(inside)) >= 0 else -n


def sub(fn, u0, u1, v0, v1):
    return lambda u, v: fn(u0 + (u1 - u0) * u, v0 + (v1 - v0) * v)


def grow(fn, d, inside=(0, 0, 0)):
    """Surface pushed d along its outward normal (for trims/straps laid on a plate)."""
    return lambda u, v: tuple(V(fn(u, v)) + surf_normal(fn, u, v, inside) * d)


def mirror(fn, s):
    """fn for the -X side when s < 0."""
    return fn if s > 0 else (lambda u, v: (lambda p: (-p[0], p[1], p[2]))(fn(u, v)))


def surf(p, fn, nu, nv, thick, color, closed_u=False, inside=(0, 0, 0), bevel=0.0, nm=None, inner=True, walls=(0, 1)):
    """Thick shell from a parametric surface fn(u, v) -> (x, y, z), u, v in [0, 1].

    Outer skin + side walls `thick` deep (+ inner skin unless inner=False, for plates whose inside is
    never seen, e.g. hoops around the torso), flat shaded. `inside` is any point on the inner side
    (orients normals). `bevel` chamfers the outer rim so edges read as rolled plate. Poles are welded.
    """
    ins = V(inside)
    U = nu if closed_u else nu + 1
    P = [[V(fn(i / nu, j / nv)) for i in range(U)] for j in range(nv + 1)]
    N = [[None] * U for _ in range(nv + 1)]
    tot = 0.0
    for j in range(nv + 1):
        for i in range(U):
            i0, i1 = ((i - 1) % U, (i + 1) % U) if closed_u else (max(i - 1, 0), min(i + 1, U - 1))
            j0, j1 = max(j - 1, 0), min(j + 1, nv)
            n = (P[j][i1] - P[j][i0]).cross(P[j1][i] - P[j0][i])
            if n.length > 1e-9:
                N[j][i] = n.normalized()
                tot += N[j][i].dot(P[j][i] - ins)
    sg = 1 if tot >= 0 else -1
    for j in range(nv + 1):
        adj = P[j + 1] if j < nv else P[j - 1]
        cen = sum(adj, Vector()) / len(adj)
        for i in range(U):
            if N[j][i] is None:      # pole
                N[j][i] = (P[j][i] - cen).normalized()
                if N[j][i].dot(P[j][i] - ins) < 0:
                    N[j][i] = -N[j][i]
            else:
                N[j][i] = N[j][i] * sg
    bm = bmesh.new()
    kind = bm.faces.layers.int.new('kind')
    O = [[bm.verts.new(P[j][i]) for i in range(U)] for j in range(nv + 1)]
    I = [[bm.verts.new(P[j][i] - N[j][i] * thick) for i in range(U)] for j in range(nv + 1)]

    def face(vs, k):
        try:
            f = bm.faces.new(vs)
            f[kind] = k
        except ValueError:
            pass
    cols = range(nu)
    nxt = (lambda i: (i + 1) % U) if closed_u else (lambda i: i + 1)
    for j in range(nv):
        for i in cols:
            face((O[j][i], O[j][nxt(i)], O[j + 1][nxt(i)], O[j + 1][i]), 1)
            if inner:
                face((I[j + 1][i], I[j + 1][nxt(i)], I[j][nxt(i)], I[j][i]), 2)
    for i in cols:   # walls (v = 0 row, v = 1 row), wound consistently with the outer skin
        if 0 in walls:
            face((I[0][i], I[0][nxt(i)], O[0][nxt(i)], O[0][i]), 3)
        if 1 in walls:
            face((O[nv][i], O[nv][nxt(i)], I[nv][nxt(i)], I[nv][i]), 3)
    if not closed_u:
        for j in range(nv):
            face((O[j][0], O[j + 1][0], I[j + 1][0], I[j][0]), 3)
            face((I[j][U - 1], I[j + 1][U - 1], O[j + 1][U - 1], O[j][U - 1]), 3)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    for f in [f for f in bm.faces if f.calc_area() < 1e-10]:
        bm.faces.remove(f)
    for v in [v for v in bm.verts if not v.link_faces]:
        bm.verts.remove(v)
    bm.normal_update()
    # outer skin must face away from `inside`
    s_ = sum((f.normal.dot(f.calc_center_median() - ins)) * f.calc_area() for f in bm.faces if f[kind] == 1)
    if s_ < 0:
        bmesh.ops.reverse_faces(bm, faces=list(bm.faces))
    if bevel > 0:
        edges = [e for e in bm.edges if len(e.link_faces) == 2 and {f[kind] for f in e.link_faces} == {1, 3}]
        if edges:
            bmesh.ops.bevel(bm, geom=edges, offset=bevel, segments=1, affect='EDGES', profile=0.5, clamp_overlap=True)
    o = _mesh_obj(bm, p, (0, 0, 0), (0, 0, 0), color)
    if nm:
        o.name = nm
    return o


def loft_fn(rows, e=3.0, rw=0.5, t0=0.0, t1=2 * math.pi, zig=None, chev=0.0):
    """Superellipse cross-sections lofted along Y. rows: (y, a, b, ridge_front, ridge_back[, dz]).
    u sweeps the angle t0..t1 (t = 0 is +Z front, t = pi/2 is +X); v walks the rows."""
    def fn(u, v):
        k = v * (len(rows) - 1)
        i = min(int(k), len(rows) - 2)
        f = k - i
        r = [a + (b - a) * f for a, b in zip(rows[i] + (0,) * (6 - len(rows[i])), rows[i + 1] + (0,) * (6 - len(rows[i + 1])))]
        y, a, b, rf, rb, dz = r
        t = t0 + (t1 - t0) * u
        tf = math.atan2(math.sin(t), math.cos(t))
        tb = math.atan2(math.sin(t - math.pi), math.cos(t - math.pi))
        z = b * scos(t, e) + rf * max(0.0, 1 - abs(tf) / rw) - rb * max(0.0, 1 - abs(tb) / rw) + dz
        y -= chev * max(0.0, 1 - abs(tf) / (rw * 2))   # chevron: the front dips down
        if zig:   # scalloped / toothed lower edge: (depth, teeth) -- teeth = nu / 2 puts a tip on every odd column
            x_ = u * zig[1]
            y -= zig[0] * (1 - abs(2 * (x_ - math.floor(x_)) - 1)) * (1 - v)
        return (a * ssin(t, e), y, z)
    return fn


def hoop(p, y0, y1, ab0, ab1, thick, color, nu=12, e=3.0, rf=(0, 0), bevel=0.0, t0=0.0, t1=2 * math.pi, nm=None, dz=0.0,
         inner=False, zig=None, rw=0.5, walls=(0, 1), chev=0.0):
    """Band around local Y from y0 (bottom) to y1 (top); ab = (half width, half depth) at each end."""
    rows = [(y0, ab0[0], ab0[1], rf[0], 0, dz), (y1, ab1[0], ab1[1], rf[1], 0, dz)]
    closed = abs(t1 - t0 - 2 * math.pi) < 1e-6
    return surf(p, loft_fn(rows, e, rw=rw, t0=t0, t1=t1, zig=zig, chev=chev), nu, 1, thick, color, closed_u=closed,
                inside=(0, (y0 + y1) / 2, dz), bevel=bevel, nm=nm, inner=inner, walls=walls)


def bell_fn(O, phi, R, Rh, th0, th1, a0, a1, flare=0.0, drop=0.0, inner_scale=1.0, front_scale=1.0, zig=None):
    """Shoulder bell (L side, socket space): dome/bands around an axis tilted outward by phi.
    theta th0..th1 from the axis (v), azimuth a0..a1 (u, 0 = outward-down, +pi/2 = +Z front)."""
    A = Vector((math.sin(phi), math.cos(phi), 0))
    X = Vector((math.cos(phi), -math.sin(phi), 0))
    Z = Vector((0, 0, 1))
    O = V(O)

    def fn(u, v):
        al = a0 + (a1 - a0) * u
        th = th0 + (th1 + drop * (1 - math.cos(al)) / 2 - th0) * v   # drop: reach further down on the neck side
        if zig:   # toothed lower edge (amount in radians, teeth)
            x_ = u * zig[1]
            th += zig[0] * (1 - abs(2 * (x_ - math.floor(x_)) - 1)) * v
        rh = Rh * math.sin(th) * (1 + flare * v) * (1 - (1 - inner_scale) * (1 - math.cos(al)) / 2)
        rh *= 1 - (1 - front_scale) * abs(math.sin(al))
        d = X * math.cos(al) + Z * math.sin(al)
        return tuple(O + A * (R * math.cos(th)) + d * rh)
    return fn


def blade_fn(base, d, up, length, width, curl=0.0, bulge=0.02, taper=0.8, tipw=0.004):
    """Long tapering curved plate (wing finger / feather / fin): v along its length, u across it.
    Returns (fn, a point on its inner side)."""
    base, d = V(base), V(d).normalized()
    side = d.cross(V(up)).normalized()
    up2 = side.cross(d).normalized()

    def fn(u, v):
        w = width * max(0.0, 1 - v) ** taper + tipw
        x = 2 * u - 1
        cen = base + d * (length * v) + up2 * (curl * v * v)
        return tuple(cen + side * (x * w) + up2 * (bulge * (1 - x * x) * (1 - v)))
    return fn, tuple(base - up2 * 0.08)


def stud(p, pos, n, color=R.trim, r=0.022, h=0.03):
    return cone(p, r, h, tuple(V(pos) + V(n).normalized() * (h * 0.3)), color, rot=rot_to(n), seg=4)


def stud_on(p, fn, u, v, inside, color=R.trim, r=0.022):
    n = surf_normal(fn, u, v, inside)
    return stud(p, V(fn(u, v)) + n * 0.004, n, color, r)


def strap(p, fn, u0, u1, v0, v1, inside, nv=2, color=R.leather, lift=0.008, thick=0.018, buckle=None):
    """Leather strap laid on a surface patch; optional buckle at v = buckle."""
    s = surf(p, grow(sub(fn, u0, u1, v0, v1), lift, inside), 1, nv, thick, color, inside=inside)
    if buckle is not None:
        um = (u0 + u1) / 2
        n = surf_normal(fn, um, buckle, inside)
        pos = V(fn(um, buckle)) + n * (lift + 0.01)
        w = (V(fn(u1, buckle)) - V(fn(u0, buckle))).length
        box(p, (w * 1.35, 0.055, 0.02), tuple(pos), R.trim, rot=face_rot(n), bevel=0.006)
    return s


def horn(p, pts, radii, color, seg=5):
    """Chain of tapered cylinders through points (horns, claws, bones)."""
    for (a, b), (ra, rb) in zip(zip(pts, pts[1:]), zip(radii, radii[1:])):
        a, b = V(a), V(b)
        d = b - a
        cyl(p, max(rb, 0.0015), ra, d.length * 1.08, tuple((a + b) / 2), color, rot=rot_to(d), seg=seg)


def spike(p, pos, d, r, h, color=R.trim, seg=4):
    d = V(d).normalized()
    return cone(p, r, h, tuple(V(pos) + d * (h / 2)), color, rot=rot_to(d), seg=seg)


def tag(o, nm):
    """Name a part (gear files merge every part, so names only help the Blender-side audits)."""
    o.name = nm
    return o


def tri_count(scene=None):
    scene = scene or bpy.context.scene
    return sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in scene.objects if o.type == 'MESH')


def export(scene_name, file_name):
    """Export a scene to public/models/<file_name>; a model in bake.BAKED first gets the bake finish (bake.py): UVs,
    weighted normals and its baked map beside the .glb. Material kinds (mat `kind`) go out as glTF extras."""
    import importlib
    import bake
    import bake_uv
    importlib.reload(bake_uv)
    importlib.reload(bake)
    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, file_name)
    scene = bpy.data.scenes[scene_name]
    baked = bake.takes_finish(file_name)
    if baked:
        bake.finish(scene, path)
    with bpy.context.temp_override(scene=scene, view_layer=scene.view_layers[0]):
        bpy.ops.export_scene.gltf(
            filepath=path, export_format='GLB', use_active_scene=True, export_yup=True,
            export_apply=True, export_materials='EXPORT', export_extras=True, export_tangents=baked,
            export_animations=False, export_cameras=False, export_lights=False,
        )
    return path


from preview import preview, preview_auto, preview_sheet, remove_preview_rig  # noqa: E402  (re-exported)
