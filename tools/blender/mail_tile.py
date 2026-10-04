"""The mail texture's tile (the characters' material library, tools/char_textures.py): a patch of modelled rings in
rows, baked flat, so its rows meet exactly across the tile's edges. Not painted: mail is a pattern that must repeat
true, so it is built and baked, as a professional would make a tiling mail texture.

Rows of rings run across the tile, each row half a ring along from the one above and every ring tipped forward by TILT
over the row below, so each row's lower arcs lie over the next row's tops like shingles (the readable stylised mail:
rows of overlapping arcs; laid other ways, alternate rows tipped against each other or rings leaning sideways, the
rings read as knitting or a net at the play camera). The rings are laid over the tile and its eight neighbours, and a
plane covering one period takes the bake from above (bake.py's machinery): the rings' normal, their occlusion, height
and where they are at all. The tile is then lit softly from the upper left, with the gaps between the rings dark, and
written as (value, normal x, normal y) to OUT, which char_textures.py takes as the `mail` layer.

    blender -b --python tools/blender/mail_tile.py
"""
import math
import os
import sys

import bpy
import numpy as np
from mathutils import Matrix

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bake  # noqa: E402

OUT = 'D:/dragonbound-archive/mail-tile/mail.png'
RES = 1024
R, TUBE = 1.0, 0.22                # ring radius and wire radius (tile units)
ACROSS, ROWS = 6, 8                # rings across the tile and rows down it
PITCH, ROW = 1.6, 1.2              # ring spacing along a row and between rows: 6 x 1.6 = 8 x 1.2, a square tile
TILT = math.radians(32)
W, H = ACROSS * PITCH, ROWS * ROW


def ring(x, y):
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=TUBE, major_segments=40, minor_segments=12,
                                     location=(x, y, 0))
    o = bpy.context.object
    o.matrix_world = Matrix.Translation((x, y, 0)) @ Matrix.Rotation(TILT, 4, 'X')
    for p in o.data.polygons:
        p.use_smooth = True
    return o


def emit_material():
    """The rings emit (1 where they are, their height, their occlusion)."""
    em = bpy.data.materials.new('DB_mail_emit')
    nt = em.node_tree
    nt.nodes.clear()
    out, emit = nt.nodes.new('ShaderNodeOutputMaterial'), nt.nodes.new('ShaderNodeEmission')
    ao = nt.nodes.new('ShaderNodeAmbientOcclusion')
    ao.samples = 16
    ao.inputs['Distance'].default_value = 1.2
    geo = nt.nodes.new('ShaderNodeNewGeometry')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(geo.outputs['Position'], sep.inputs[0])
    hgt = nt.nodes.new('ShaderNodeMapRange')
    hgt.inputs['From Min'].default_value, hgt.inputs['From Max'].default_value = -R, R
    nt.links.new(sep.outputs['Z'], hgt.inputs['Value'])
    comb = nt.nodes.new('ShaderNodeCombineColor')
    comb.inputs[0].default_value = 1.0
    nt.links.new(hgt.outputs['Result'], comb.inputs[1])
    nt.links.new(ao.outputs['AO'], comb.inputs[2])
    nt.links.new(comb.outputs['Color'], emit.inputs['Color'])
    nt.links.new(emit.outputs['Emission'], out.inputs['Surface'])
    return em


def main():
    scene = bpy.data.scenes.new('DB_mail_tile')
    bpy.context.window.scene = scene
    rings = [ring((i + 0.5 * (j % 2)) * PITCH, j * ROW) for j in range(-2, ROWS + 2) for i in range(-2, ACROSS + 2)]
    bake.select(rings)
    bpy.ops.object.join()
    mail = bpy.context.view_layer.objects.active
    mail.data.materials.append(emit_material())
    bpy.ops.mesh.primitive_plane_add(size=1, location=(W / 2, H / 2, -2 * R))
    plane = bpy.context.object
    plane.scale = (W, H, 1)
    bpy.ops.object.transform_apply(scale=True)
    me = plane.data
    uv = me.uv_layers[0]            # the plane's own UVs: 0..1 over the one period it covers
    bake.use_cycles(scene)
    nimg, mimg = bake.new_image('DB_mail_n', RES), bake.new_image('DB_mail_m', RES)
    mat = bpy.data.materials.new('DB_mail_target')
    node = mat.node_tree.nodes.new('ShaderNodeTexImage')
    node.image = nimg
    mat.node_tree.nodes.active = node
    me.materials.append(mat)
    common = dict(use_selected_to_active=True, cage_extrusion=4 * R, max_ray_distance=8 * R, margin=0,
                  uv_layer=uv.name, use_clear=True, target='IMAGE_TEXTURES')
    bake.select([plane, mail])
    bpy.context.view_layer.objects.active = plane
    bpy.ops.object.bake(type='NORMAL', normal_space='TANGENT', **common)
    node.image = mimg
    bpy.ops.object.bake(type='EMIT', **common)
    n, m = bake.pixels(nimg), bake.pixels(mimg)
    cover, height, occl = m[..., 0], m[..., 1], m[..., 2]
    nx, ny, nz = n[..., 0] * 2 - 1, n[..., 1] * 2 - 1, n[..., 2] * 2 - 1
    light = np.clip(nx * -0.45 + ny * 0.55 + nz * 0.7, 0, 1)           # soft light from the upper left
    lit = (0.35 + 0.65 * light) * (0.45 + 0.55 * occl) * (0.75 + 0.25 * height)
    value = np.where(cover > 0.5, lit, 0.12)                           # the gaps between the rings are dark
    value = np.clip(0.5 + (value / value.mean() - 1) * 0.5, 0, 1)
    nx = np.where(cover > 0.5, n[..., 0], 0.5)
    ny = np.where(cover > 0.5, n[..., 1], 0.5)
    rgb = np.dstack([value, nx, ny, np.ones_like(value)])
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    img = bpy.data.images.new('DB_mail_out', RES, RES, alpha=False, float_buffer=False)
    img.colorspace_settings.name = 'Non-Color'
    img.pixels.foreach_set(rgb.astype(np.float32).ravel())
    img.filepath_raw, img.file_format = OUT, 'PNG'
    img.save()
    print('mail tile', OUT)


main()
