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
    'kobold': 0xC77B3A, 'koboldDark': 0x8F5222, 'belly': 0xF2B45A, 'robe': 0x5B1A2C,
    'robeDark': 0x3A0F1C, 'fire': 0xFF7A1A, 'ember': 0xFFB040, 'bone': 0xEEE4CC,
    'black': 0x1A1414, 'eye': 0xFFE070, 'arcane': 0x6AA8FF, 'white': 0xFFFFFF,
}


def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_rgba(h):
    return tuple(srgb_to_linear(((h >> s) & 255) / 255) for s in (16, 8, 0)) + (1.0,)


def mat(color, emissive=None, strength=2.0, double_sided=False):
    key = f'db_{color:06x}_{emissive or 0:06x}_{strength}_{int(double_sided)}'
    m = bpy.data.materials.get(key)
    if m:
        return m
    m = bpy.data.materials.new(key)
    m.use_nodes = True
    m.use_backface_culling = not double_sided
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = hex_rgba(color)
    bsdf.inputs['Roughness'].default_value = 0.75
    bsdf.inputs['Metallic'].default_value = 0.0
    if emissive is not None:
        bsdf.inputs['Emission Color'].default_value = hex_rgba(emissive)
        bsdf.inputs['Emission Strength'].default_value = strength
    return m


def c(name):
    return PAL[name] if isinstance(name, str) else name


# ─── Role materials (recoloured at runtime, see docs/ART_CONTRACT.md) ─────────
# Neutral placeholder colours; the game replaces them per skin tone / cloth dye / gear tier.
ROLE_COLORS = {
    'skin': 0xE0AC84, 'hair': 0x5A3A22, 'cloth': 0x3A6EA5, 'cloth2': 0x4B4B58, 'leather': 0x6A4428,
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
    """Colour spec -> material. Accepts a PAL key, a hex int, 'ROLE:<name>' or a bpy Material."""
    if isinstance(color, bpy.types.Material):
        return color
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


def tri_count(scene=None):
    scene = scene or bpy.context.scene
    return sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in scene.objects if o.type == 'MESH')


def export(scene_name, file_name):
    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, file_name)
    scene = bpy.data.scenes[scene_name]
    with bpy.context.temp_override(scene=scene, view_layer=scene.view_layers[0]):
        bpy.ops.export_scene.gltf(
            filepath=path, export_format='GLB', use_active_scene=True, export_yup=True,
            export_apply=True, export_materials='EXPORT', export_extras=False,
            export_animations=False, export_cameras=False, export_lights=False,
        )
    return path


def preview(file_name, target=(0, 1, 0), dist=5.0, yaw=35, pitch=20, res=512):
    """Render a quick EEVEE preview from a 3/4 angle (three.js coords for target)."""
    os.makedirs(PREVIEW_DIR, exist_ok=True)
    scene = bpy.context.scene
    tx, ty, tz = target
    tgt = Vector((tx, -tz, ty))  # three.js -> Blender world
    yaw_r, pitch_r = math.radians(yaw), math.radians(pitch)
    # Camera sits in front of the model (+Z in game = -Y in Blender).
    offset = Vector((math.sin(yaw_r) * math.cos(pitch_r), -math.cos(yaw_r) * math.cos(pitch_r), math.sin(pitch_r))) * dist
    cam_data = bpy.data.cameras.get('db_preview_cam') or bpy.data.cameras.new('db_preview_cam')
    cam = scene.objects.get('db_preview_cam')
    if not cam:
        cam = bpy.data.objects.new('db_preview_cam', cam_data)
        scene.collection.objects.link(cam)
    cam.location = tgt + offset
    cam.rotation_mode = 'QUATERNION'
    cam.rotation_quaternion = (tgt - cam.location).to_track_quat('-Z', 'Y')
    cam_data.lens = 50
    scene.camera = cam
    sun_data = bpy.data.lights.get('db_preview_sun') or bpy.data.lights.new('db_preview_sun', 'SUN')
    sun_data.energy = 3.5
    sun = scene.objects.get('db_preview_sun')
    if not sun:
        sun = bpy.data.objects.new('db_preview_sun', sun_data)
        scene.collection.objects.link(sun)
    sun.rotation_euler = (math.radians(50), math.radians(10), math.radians(30))
    if not scene.world:
        scene.world = bpy.data.worlds.new('db_world')
    scene.world.use_nodes = True
    bg = scene.world.node_tree.nodes.get('Background')
    bg.inputs['Color'].default_value = (0.08, 0.07, 0.07, 1)
    bg.inputs['Strength'].default_value = 1.2
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.resolution_x = res
    scene.render.resolution_y = res
    scene.render.film_transparent = False
    scene.view_settings.view_transform = 'Standard'
    path = os.path.join(PREVIEW_DIR, file_name)
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    # Preview helpers must not end up in the exported model.
    return path


def preview_sheet(file_name, target=(0, 1, 0), dist=5.0, views=((0, 12), (40, 20), (180, 15), (30, 55)), res=384):
    """Render several angles and paste them side by side into one PNG (front, 3/4, back, game-cam)."""
    import numpy as np
    tiles = []
    for i, (yaw, pitch) in enumerate(views):
        p = preview(f'_tile{i}.png', target=target, dist=dist, yaw=yaw, pitch=pitch, res=res)
        img = bpy.data.images.load(p, check_existing=False)
        px = np.array(img.pixels[:], dtype=np.float32).reshape(img.size[1], img.size[0], 4)
        tiles.append(px)
        bpy.data.images.remove(img)
        os.remove(p)
    sheet = np.concatenate(tiles, axis=1)
    h, w = sheet.shape[:2]
    out = bpy.data.images.new('db_sheet', w, h, alpha=True)
    out.pixels = sheet.ravel()
    path = os.path.join(PREVIEW_DIR, file_name)
    out.filepath_raw = path
    out.file_format = 'PNG'
    out.save()
    bpy.data.images.remove(out)
    return path


def preview_auto(file_name, views=((0, 12), (40, 20), (180, 15), (30, 55)), res=320):
    """preview_sheet framed on the bounds of the current scene's meshes."""
    bpy.context.view_layer.update()
    pts = [o.matrix_world @ Vector(c) for o in bpy.context.scene.objects if o.type == 'MESH' for c in o.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    mid = (lo + hi) / 2
    ext = max(hi - lo)
    return preview_sheet(file_name, target=(mid.x, mid.z, -mid.y), dist=ext * 2.3 + 0.4, views=views, res=res)


def remove_preview_rig():
    for n in ('db_preview_cam', 'db_preview_sun'):
        o = bpy.context.scene.objects.get(n)
        if o:
            bpy.data.objects.remove(o, do_unlink=True)
