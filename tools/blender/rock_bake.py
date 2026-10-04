"""The rock kit's finish (rocks.py): the game mesh, its UVs and its baked map, made from the dense rock the generator
grows (rock_nodes.py) the way a professional finishes a sculpted rock.
 1. The dense rock is checked: one closed piece.
 2. The game mesh is that rock decimated (Decimate, collapse) to the recipe's triangle budget, checked again (one
    closed piece: the one-piece check reads it), shaded smooth with its sharpest edges kept hard.
 3. UVs through the shared bake pipeline (bake_uv.py): Smart UV Project islands laid flat and packed unturned into
    one atlas, MARGIN_PX apart; only the `bake` map is exported (TEXCOORD_0: the game lays its painted rock on from
    the world, so the rock needs no tiling map).
 4. The bake (Cycles on the CPU through bake.py's set-up: fixed samples and seed, no denoising, so a re-export
    reproduces the map), from the dense rock onto the game mesh: its tangent-space normal, and through an emission
    shader its painted value (broad occlusion deepened in the cracks, convex edges lifted where paint wears and
    light catches, tops lit and undersides in shade) and its mask (moss on what faces up, broken into patches; or
    the ore's veins, from the generator's `vein` attribute).
 5. One RGBA map beside the .glb, `<name>.bake.webp` (lossless): R, G the normal's x and y (z is rebuilt; green up,
    OpenGL), B the painted value at VALUE_SCALE, A = MASK_BASE + (1 - MASK_BASE) * mask (never under 0.5: browsers
    keep a texel's colour exactly only under an opaque enough alpha). src/render/rockMaterial.ts reads it.
"""
import math
import os

import bmesh
import bpy
import numpy as np

import bake
import bake_uv
from bake import VALUE_SCALE, _math

MASK_BASE = 0.5
SAMPLES = 48
SHARP = 72.0                 # degrees: edges sharper than this stay hard on the game mesh (the foot, a cliff's back)
EMPTY = (0.5, 0.5, VALUE_SCALE, MASK_BASE)
LIGHT = dict(up=1.07, side=1.0, down=0.78)


def solid_report(me):
    """(pieces, open edges, triangles) of a mesh: a rock must be one piece with no open or shared-by-three edges."""
    bm = bmesh.new()
    bm.from_mesh(me)
    bad = sum(1 for e in bm.edges if len(e.link_faces) != 2)
    bm.verts.index_update()
    seen, pieces = [False] * len(bm.verts), 0
    for v in bm.verts:
        if seen[v.index]:
            continue
        pieces += 1
        seen[v.index] = True
        stack = [v]
        while stack:
            for e in stack.pop().link_edges:
                for u in e.verts:
                    if not seen[u.index]:
                        seen[u.index] = True
                        stack.append(u)
    tris = sum(len(f.verts) - 2 for f in bm.faces)
    bm.free()
    return pieces, bad, tris


def keep_largest(me):
    """Drop every piece of a mesh but its largest: the dense rock's loose crumbs (a sliver the strata or a chip left
    standing free, a bubble inside the stone) go; the rock is the one big piece. Returns how many went."""
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.faces.ensure_lookup_table()
    seen, pieces = set(), []
    for f in bm.faces:
        if f.index in seen:
            continue
        piece, stack = [], [f]
        seen.add(f.index)
        while stack:
            g = stack.pop()
            piece.append(g)
            for e in g.edges:
                for h in e.link_faces:
                    if h.index not in seen:
                        seen.add(h.index)
                        stack.append(h)
        pieces.append(piece)
    pieces.sort(key=len, reverse=True)
    crumbs = [f for p in pieces[1:] for f in p]
    if crumbs:
        bmesh.ops.delete(bm, geom=crumbs, context='FACES')
        bm.to_mesh(me)
    bm.free()
    return len(pieces) - 1


def require_solid(me, what):
    pieces, bad, tris = solid_report(me)
    assert pieces == 1 and bad == 0, f'{what}: {pieces} pieces, {bad} open edges (a rock is one closed piece)'
    return tris


def evaluated(obj, name, parent):
    """`obj` with its modifiers applied (attributes kept), as a new object under `parent`."""
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(obj.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
    me.name = name
    out = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(out)
    out.parent = parent
    out.matrix_parent_inverse.identity()
    out.matrix_basis.identity()
    return out


def smooth_shade(me, sharp=SHARP):
    bm = bmesh.new()
    bm.from_mesh(me)
    for f in bm.faces:
        f.smooth = True
    for e in bm.edges:
        e.smooth = not (len(e.link_faces) == 2 and math.degrees(e.calc_face_angle(0.0)) > sharp)
    bm.to_mesh(me)
    bm.free()


def decimate(high, tris, name, parent):
    """The game mesh: the dense rock collapsed to about `tris` triangles, one closed piece."""
    have = require_solid(high.data, f'{name} (dense)')
    low = high.copy()
    low.data = high.data.copy()
    bpy.context.scene.collection.objects.link(low)
    low.name = name
    if 'vein' in low.data.attributes:
        low.data.attributes.remove(low.data.attributes['vein'])
    for ratio in (tris / have, tris * 0.96 / have, tris * 1.04 / have):
        m = low.modifiers.new('decimate', 'DECIMATE')
        m.decimate_type, m.ratio, m.use_collapse_triangulate = 'COLLAPSE', min(1.0, ratio), True
        out = evaluated(low, name + '_low', parent)
        low.modifiers.remove(m)
        pieces, bad, got = solid_report(out.data)
        if pieces == 1 and bad == 0:
            bpy.data.objects.remove(low, do_unlink=True)
            out.name = out.data.name = name
            smooth_shade(out.data)
            return out, got
        bpy.data.objects.remove(out, do_unlink=True)
    raise AssertionError(f'{name}: decimating left it in pieces or open')


def unwrap(low, root, size):
    """UVs through bake_uv: islands laid flat and packed into a `size` atlas; only the `bake` map is kept."""
    hidden = {low: set()}
    bake_uv.unwrap([low], root, hidden)
    bake_uv.pack([low], size, hidden)
    me = low.data
    me.uv_layers.remove(me.uv_layers['tile'])
    me.uv_layers.active = me.uv_layers['bake']


def _smooth(nt, x, e0, e1):
    n = nt.nodes.new('ShaderNodeMapRange')
    n.interpolation_type = 'SMOOTHSTEP'
    n.inputs['From Min'].default_value, n.inputs['From Max'].default_value = e0, e1
    nt.links.new(x, n.inputs['Value'])
    return n.outputs['Result']


def mask_material(r):
    """Emission = (painted value, mask, 0) on the dense rock: see the module comment, step 4."""
    m = bpy.data.materials.new(f"DB_rock_masks_{r['name']}")
    nt = m.node_tree
    nt.nodes.clear()
    N, L = nt.nodes.new, nt.links.new
    out, emit, geo = N('ShaderNodeOutputMaterial'), N('ShaderNodeEmission'), N('ShaderNodeNewGeometry')
    far, near = N('ShaderNodeAmbientOcclusion'), N('ShaderNodeAmbientOcclusion')
    for ao, dist, samples in ((far, r['ao'], 16), (near, r['ao'] * 0.14, 8)):
        ao.only_local, ao.samples = True, samples
        ao.inputs['Distance'].default_value = dist
    nrm = N('ShaderNodeSeparateXYZ')
    L(geo.outputs['Normal'], nrm.inputs[0])
    up = nrm.outputs['Z']               # (world Z: the root turns the rock's own Y up into it)
    # Convex edges: how far the rounded normal turns from the surface's, where nothing is near.
    bevel, dot = N('ShaderNodeBevel'), N('ShaderNodeVectorMath')
    bevel.samples = 12
    bevel.inputs['Radius'].default_value = r['edge']
    dot.operation = 'DOT_PRODUCT'
    L(bevel.outputs['Normal'], dot.inputs[0])
    L(geo.outputs['Normal'], dot.inputs[1])
    turn = _smooth(nt, dot.outputs['Value'], 0.995, 0.93)
    edge = _math(nt, 'MULTIPLY', turn, _smooth(nt, near.outputs['AO'], 0.7, 0.95))
    # The painted light: tops lit, undersides in shade.
    top, under = _smooth(nt, up, 0.45, 0.9), _smooth(nt, up, -0.35, -0.85)
    lit = _math(nt, 'MULTIPLY', top, LIGHT['up'] - LIGHT['side'])
    shade = _math(nt, 'MULTIPLY', under, LIGHT['side'] - LIGHT['down'])
    light = _math(nt, 'ADD', LIGHT['side'], _math(nt, 'SUBTRACT', lit, shade))
    crease = _math(nt, 'ADD', _math(nt, 'MULTIPLY', near.outputs['AO'], 0.5), 0.5)
    value = _math(nt, 'MULTIPLY', _math(nt, 'MULTIPLY', far.outputs['AO'], crease), light)
    value = _math(nt, 'MULTIPLY', value, _math(nt, 'ADD', 1.0, _math(nt, 'MULTIPLY', edge, r['edge_lift'])))
    if r.get('vein'):
        attr = N('ShaderNodeAttribute')
        attr.attribute_name = 'vein'
        mask = attr.outputs['Fac']
    else:
        # Moss on what faces up, in patches (a noise in the rock's own space), thinning on the steeper shoulders.
        tex = N('ShaderNodeTexNoise')
        tex.inputs['Scale'].default_value, tex.inputs['Detail'].default_value = r['moss_scale'], 3.0
        coord = N('ShaderNodeTexCoord')   # (object space: the patches stay with the rock)
        L(coord.outputs['Object'], tex.inputs['Vector'])
        patches = _smooth(nt, tex.outputs['Fac'], 0.47, 0.6)
        cover = _smooth(nt, up, 0.45, 0.9)
        # (Thicker where the top dips: moss gathers in its hollows and joints.)
        hollow = _math(nt, 'SUBTRACT', 1.0, near.outputs['AO'])
        grow = _math(nt, 'ADD', _math(nt, 'MULTIPLY', patches, 0.85), _math(nt, 'MULTIPLY', hollow, 0.6))
        mask = _math(nt, 'MULTIPLY', cover, grow)
    comb = N('ShaderNodeCombineColor')
    L(value, comb.inputs[0])
    L(mask, comb.inputs[1])
    L(comb.outputs['Color'], emit.inputs['Color'])
    emit.inputs['Strength'].default_value = 1.0
    L(emit.outputs['Emission'], out.inputs['Surface'])
    return m


def _target(low, image):
    mat = bpy.data.materials.new('DB_rock_target')
    node = mat.node_tree.nodes.new('ShaderNodeTexImage')
    node.image = image
    mat.node_tree.nodes.active = node
    low.data.materials.clear()
    low.data.materials.append(mat)
    return mat, node


def check(texels, path):
    """Refuse a bake that came out empty or flat."""
    assert len(texels) > 500, f'{path}: the bake reached almost nothing'
    assert texels[:, 0].std() > 0.01 and texels[:, 1].std() > 0.01, f'{path}: the baked normal is flat'
    value = texels[:, 2].mean() / VALUE_SCALE
    assert 0.4 < value < 1.15, f'{path}: the painted value is off ({value:.2f})'


def bake_maps(low, high, scene, r, size, path):
    """Bake the normal, the painted value and the mask from `high` onto `low` and write the packed map to `path`."""
    bake.use_cycles(scene)
    scene.cycles.samples = SAMPLES
    nimg, mimg = bake.new_image('DB_rock_normal', size), bake.new_image('DB_rock_masks', size)
    tmat, node = _target(low, nimg)
    masks = mask_material(r)
    high.data.materials.clear()
    high.data.materials.append(masks)
    for p in high.data.polygons:
        p.use_smooth = True
    common = dict(use_selected_to_active=True, cage_extrusion=r['cage'], max_ray_distance=r['cage'] * 3,
                  margin=bake_uv.MARGIN_PX, margin_type='EXTEND', uv_layer='bake', use_clear=True,
                  target='IMAGE_TEXTURES')
    bake_uv.select([low, high])
    bpy.context.view_layer.objects.active = low
    bpy.ops.object.bake(type='NORMAL', normal_space='TANGENT', **common)
    node.image = mimg
    bpy.ops.object.bake(type='EMIT', **common)
    n, m = bake.pixels(nimg), bake.pixels(mimg)
    out = np.empty_like(n)
    out[..., 0], out[..., 1] = n[..., 0], n[..., 1]
    out[..., 2] = np.clip(m[..., 0] * VALUE_SCALE, 0, 1)
    out[..., 3] = MASK_BASE + (1 - MASK_BASE) * np.clip(m[..., 1], 0, 1)
    empty = m[..., 0] <= 1e-6        # (no island reached it: every texel of the rock has some painted value)
    out[empty] = EMPTY
    check(out[~empty], path)
    img = bpy.data.images.new('DB_rock_out', size, size, alpha=True, float_buffer=False)
    img.colorspace_settings.name = 'Non-Color'
    img.alpha_mode = 'STRAIGHT'
    img.pixels.foreach_set(out.astype(np.float32).ravel())
    img.filepath_raw, img.file_format = path, 'WEBP'
    img.save(quality=100)   # (lossless: the channels are data)
    for x in (img, nimg, mimg):
        bpy.data.images.remove(x)
    for x in (tmat, masks):
        bpy.data.materials.remove(x)
    low.data.materials.clear()


def export(root, low, path):
    """The game mesh alone (under its root) as a .glb: positions, normals and the `bake` UVs; no materials."""
    bake_uv.select([root, low])
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_active_scene=True, use_selection=True, export_yup=True,
        export_apply=True,
        export_texcoords=True, export_normals=True, export_tangents=False, export_materials='NONE',
        export_animations=False, export_cameras=False, export_lights=False, export_extras=False,
    )
    return os.path.getsize(path)
