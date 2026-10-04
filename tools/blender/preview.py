"""Quick EEVEE previews of a model, written to tools/blender/previews: one view, a sheet of views side by side, or a sheet
framed on the scene's meshes. `_common` re-exports these, so a script's `from _common import *` has them."""
import math
import os

import bpy
from mathutils import Vector


def _dir():
    from _common import PREVIEW_DIR
    return PREVIEW_DIR


def preview(file_name, target=(0, 1, 0), dist=5.0, yaw=35, pitch=20, res=512):
    """Render a quick EEVEE preview from a 3/4 angle (three.js coords for target)."""
    os.makedirs(_dir(), exist_ok=True)
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
    path = os.path.join(_dir(), file_name)
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
    path = os.path.join(_dir(), file_name)
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
