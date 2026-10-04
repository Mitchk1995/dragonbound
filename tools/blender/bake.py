"""The bake finish every textured model gets on export (the methods audit's J0), as a professional finishes low-poly
blocks: real UVs, weighted normals and a map baked from a high-poly copy. `_common.export` runs `finish()` for the models
in BAKED; a later job adds its models there (or calls `finish(scene, path)` itself) and needs nothing else.
docs/ART_FINISH.md is the guide; this is the reference. What a model gets, in order:
 1. Detail: parts modelled only for the bake go to the high-poly (BAKE_ONLY: stitching, widened DETAIL_WIDEN times so the
    atlas's texels hold it), and detail a tiling texture draws instead goes (DROP: mail rings).
 2. Normals: every part, split into triangles, shades smooth under a Weighted Normal modifier (face area), so its big
    faces stay flat while each chamfer rolls the light round the edge; edges sharper than SHARP stay hard.
 3. UVs (bake_uv.py): `tile`, each island flat at true size and square to its part, for the painted materials; `bake`,
    the same islands packed unturned into one atlas. Faces of two parts lying flush over each other are reported.
 4. High-poly: a copy of each part with its edges rounded (a Bevel modifier, HIGH_SEGMENTS segments) plus its
    BAKE_ONLY detail made solid, one per rig part (so a part's occlusion comes only from what moves with it).
 5. Bake (Cycles on the CPU: fixed samples and seed, no denoising, so a re-export reproduces the maps): the high-poly's
    tangent-space normal and, through an emission shader, the painted value (its occlusion, broad and near, times a tone
    of each island's own and the painted light: each face lighter at its top than its foot, tops lit and undersides
    shaded), its convex edges (the Bevel node's rounding against the surface where nothing is near: where paint wears
    first) and its baked-on detail.
 6. One RGBA map per model beside its .glb, `<name>.bake.webp` (lossless): R, G the normal's x and y (z is rebuilt), B
    the painted value at VALUE_SCALE, A EDGE_BASE plus a quarter of the convex edge, minus a quarter of the detail cover
    (never under 0.5: browsers keep a texel's colour exactly only under an opaque enough alpha). The game paints from
    it (src/render/charBake.ts), tinting it by the role colours under the painted material library.
"""
import math
import os

import bmesh
import bpy
import numpy as np

from bake_uv import (MARGIN_PX, SMALL_AREA, area_scale, atlas_size, contract, coplanar_overlaps, group_of, hidden_faces,
                     islands, model_root, pack, select, unwrap)

BAKED = ('hero', 'goblin', 'gear_', 'hair_', 'beard_')   # models (file names) that get the finish
BAKE_ONLY = {'stitch'}       # modelled only for the bake: baked into the part under it, then removed
DROP = {'mail_link'}         # drawn by a tiling texture instead (the mail texture's rings)
DETAIL_WIDEN = 1.7           # baked-only detail is widened this much, so the atlas's texels hold it
SHARP = 50.0                 # degrees: edges sharper than this stay hard
HIGH_BEVEL, HIGH_SEGMENTS = 0.007, 3
AO_FAR, AO_NEAR = 0.28, 0.04
EDGE_RADIUS = 0.024
# The painted light (see _mask_material) and the scale the painted value is stored at (charBake.ts reads it back).
LIGHT = dict(foot=0.84, top=1.06, up=1.05, down=0.8)
VALUE_SCALE = 0.8
EDGE_BASE = 0.75             # the baked map's alpha where there is neither a worn edge nor baked-on detail
TONE = 0.06                  # each island's own tone, up to this much lighter or darker
SAMPLES = 24
CAGE, RAY = 0.008, 0.026        # the bake's rays start CAGE out (above any baked-on detail) and reach RAY in


def takes_finish(file_name):
    return os.path.splitext(os.path.basename(file_name))[0].startswith(BAKED)


# ─── 2. Normals ──────────────────────────────────────────────────────────────

def weighted_normals(o):
    """Smooth shading under a face-area Weighted Normal modifier: flat big faces, chamfers that roll the light. The part
    is split into triangles first (each lies flat on its own plane for the UVs, and gives the tangent frame)."""
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.triangulate(bm, faces=list(bm.faces), quad_method='BEAUTY', ngon_method='BEAUTY')
    for f in bm.faces:
        f.smooth = True
    for e in bm.edges:
        e.smooth = not (len(e.link_faces) == 2 and math.degrees(e.calc_face_angle(0.0)) > SHARP)
    bm.to_mesh(o.data)
    bm.free()
    m = o.modifiers.new('weighted', 'WEIGHTED_NORMAL')
    m.mode, m.weight, m.keep_sharp, m.thresh = 'FACE_AREA', 100, True, 0.01


# ─── 4. High-poly ────────────────────────────────────────────────────────────

def tones(objs, seed=7):
    """A tone of its own for each island (within TONE, `db_tone`) and the island's height range in the world (`db_lo`,
    `db_hi`: the painted light runs up each face from its foot to its top), kept on its faces for the bake."""
    rng = np.random.default_rng(seed)
    for o in objs:
        me, mw = o.data, o.matrix_world
        bm = bmesh.new()
        bm.from_mesh(me)
        isl_of, ranges, areas = {}, [], []
        for k, isl in enumerate(islands(bm, bm.loops.layers.uv['bake'])):
            zs = [(mw @ v.co).z for f in isl for v in f.verts]
            ranges.append((min(zs), max(max(zs), min(zs) + 0.01)))   # (flat islands: never an empty range)
            areas.append(sum(f.calc_area() for f in isl) * area_scale(mw))
            for f in isl:
                isl_of[f.index] = k
        bm.free()
        # (Chamfers, corners and studs keep the plain tone, so a big face's tone never stops in a band at its edge.)
        vals = [rng.uniform(1 - TONE, 1 + TONE) if a >= SMALL_AREA else 1.0 for a in areas] or [1.0]
        per_island = {'db_tone': vals, 'db_lo': [r[0] for r in ranges] or [0.0], 'db_hi': [r[1] for r in ranges] or [1.0]}
        for name, values in per_island.items():
            attr = me.attributes.get(name) or me.attributes.new(name, 'FLOAT', 'FACE')
            attr.data.foreach_set('value', [float(values[isl_of.get(i, 0)]) for i in range(len(me.polygons))])


def _widen(o, k):
    """Each face of a detail part (a stitch's dash) made k times as wide across its length, about its middle, so the
    bake's texels hold it (an 8 mm dash is under two texels)."""
    bm = bmesh.new()
    bm.from_mesh(o.data)
    for f in bm.faces:
        along = max((e for e in f.edges), key=lambda e: e.calc_length())
        a = (along.verts[1].co - along.verts[0].co).normalized()
        mid = f.calc_center_median()
        for v in f.verts:
            d = v.co - mid
            v.co = mid + a * d.dot(a) + (d - a * d.dot(a)) * k
    bm.to_mesh(o.data)
    bm.free()


def _flag(o, name, value):
    me = o.data
    a = me.attributes.get(name) or me.attributes.new(name, 'FLOAT', 'FACE')
    a.data.foreach_set('value', [value] * len(me.polygons))


def high_poly(objs, details, scene):
    """One high-poly object per rig part: its parts with rounded edges, and its baked-only detail made solid."""
    groups = {}
    for o in objs + details:
        groups.setdefault(group_of(o), []).append(o)
    highs = []
    for g, members in groups.items():
        parts = []
        for o in members:
            c = o.copy()
            c.data = o.data.copy()
            c.modifiers.clear()
            scene.collection.objects.link(c)
            c.matrix_world = o.matrix_world
            detail = o in details
            _flag(c, 'db_decal', 1.0 if detail else 0.0)
            if detail:
                _widen(c, DETAIL_WIDEN)
                for name, value in (('db_tone', 1.0), ('db_lo', -100.0), ('db_hi', 100.0)):
                    _flag(c, name, value)
                s = c.modifiers.new('raise', 'SOLIDIFY')
                s.thickness, s.offset = 0.004, 1.0   # (its top 6 mm proud: under the rays' start)
            b = c.modifiers.new('round', 'BEVEL')
            b.width, b.segments = (0.0015 if detail else HIGH_BEVEL), HIGH_SEGMENTS
            b.limit_method, b.angle_limit = 'ANGLE', math.radians(25)
            b.use_clamp_overlap, b.harden_normals = True, False
            w = c.modifiers.new('weighted', 'WEIGHTED_NORMAL')
            w.mode, w.weight, w.keep_sharp = 'FACE_AREA', 100, False
            for p in c.data.polygons:
                p.use_smooth = True
            parts.append(c)
        highs.append(_join(parts, f'DB_high_{g}', scene))
    return highs


def _evaluated(o, scene, name):
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(o.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
    c = bpy.data.objects.new(name, me)
    scene.collection.objects.link(c)
    c.matrix_world = o.matrix_world
    return c


def _join(parts, name, scene):
    """The parts (modifiers applied) joined into one new object; the parts go."""
    bpy.context.view_layer.update()
    flat = [_evaluated(p, scene, name) for p in parts]
    for p in parts:
        bpy.data.objects.remove(p, do_unlink=True)
    select(flat)
    bpy.ops.object.join()
    out = bpy.context.view_layer.objects.active
    out.name = name
    return out


# ─── 5. Bake ─────────────────────────────────────────────────────────────────

def _target(objs, scene, image):
    """The game parts, as exported (weighted normals applied), joined into one bake target drawing into `image`."""
    low = _join([_copy(o, scene) for o in objs], 'DB_bake_low', scene)
    mat = bpy.data.materials.new('DB_bake_target')
    node = mat.node_tree.nodes.new('ShaderNodeTexImage')
    node.image = image
    mat.node_tree.nodes.active = node
    low.data.materials.clear()
    low.data.materials.append(mat)
    for p in low.data.polygons:
        p.material_index = 0
    low.data.uv_layers.active = low.data.uv_layers['bake']
    return low, mat


def _copy(o, scene):
    c = o.copy()
    c.data = o.data.copy()
    scene.collection.objects.link(c)
    c.matrix_world = o.matrix_world
    return c


def _mask_material():
    """Emission = (occlusion x island tone, convex edge, detail cover) at the high-poly's surface."""
    m = bpy.data.materials.new('DB_bake_masks')
    nt = m.node_tree
    nt.nodes.clear()
    N = nt.nodes.new
    out, emit = N('ShaderNodeOutputMaterial'), N('ShaderNodeEmission')
    far, near = N('ShaderNodeAmbientOcclusion'), N('ShaderNodeAmbientOcclusion')
    for ao, dist, samples in ((far, AO_FAR, 16), (near, AO_NEAR, 8)):
        ao.only_local, ao.samples = True, samples
        ao.inputs['Distance'].default_value = dist
    tone, decal = N('ShaderNodeAttribute'), N('ShaderNodeAttribute')
    tone.attribute_name, decal.attribute_name = 'db_tone', 'db_decal'
    bevel, geo = N('ShaderNodeBevel'), N('ShaderNodeNewGeometry')
    bevel.samples = 16
    bevel.inputs['Radius'].default_value = EDGE_RADIUS
    dot = N('ShaderNodeVectorMath')
    dot.operation = 'DOT_PRODUCT'
    L = nt.links.new
    L(bevel.outputs['Normal'], dot.inputs[0])
    L(geo.outputs['Normal'], dot.inputs[1])
    # Convex edge: how far the rounded normal turns from the surface's, where nothing is near (not a crease).
    turn = N('ShaderNodeMapRange')
    turn.interpolation_type = 'SMOOTHSTEP'
    turn.inputs['From Min'].default_value, turn.inputs['From Max'].default_value = 0.996, 0.95
    L(dot.outputs['Value'], turn.inputs['Value'])
    open_ = N('ShaderNodeMapRange')
    open_.interpolation_type = 'SMOOTHSTEP'
    open_.inputs['From Min'].default_value, open_.inputs['From Max'].default_value = 0.75, 0.95
    L(near.outputs['AO'], open_.inputs['Value'])
    edge = _math(nt, 'MULTIPLY', turn.outputs['Result'], open_.outputs['Result'])
    # The painted light: each side face lighter at its top than its foot (its island's height range), tops lit and
    # undersides shaded, as a painter lights a block from above.
    lo, hi, pos, nrm = N('ShaderNodeAttribute'), N('ShaderNodeAttribute'), N('ShaderNodeSeparateXYZ'), N('ShaderNodeSeparateXYZ')
    lo.attribute_name, hi.attribute_name = 'db_lo', 'db_hi'
    L(geo.outputs['Position'], pos.inputs[0])
    L(geo.outputs['Normal'], nrm.inputs[0])
    up_t = N('ShaderNodeMapRange')
    L(pos.outputs['Z'], up_t.inputs['Value'])
    L(lo.outputs['Fac'], up_t.inputs['From Min'])
    L(hi.outputs['Fac'], up_t.inputs['From Max'])
    up_t.inputs['To Min'].default_value, up_t.inputs['To Max'].default_value = LIGHT['foot'], LIGHT['top']
    facing = []
    for sign in (1, -1):
        f = N('ShaderNodeMapRange')
        f.interpolation_type = 'SMOOTHSTEP'
        f.inputs['From Min'].default_value, f.inputs['From Max'].default_value = 0.55 * sign, 0.85 * sign
        L(nrm.outputs['Z'], f.inputs['Value'])
        facing.append(f.outputs['Result'])
    side = _math(nt, 'SUBTRACT', _math(nt, 'SUBTRACT', 1.0, facing[0]), facing[1])
    light = _math(nt, 'ADD', _math(nt, 'MULTIPLY', side, up_t.outputs['Result']),
                  _math(nt, 'ADD', _math(nt, 'MULTIPLY', facing[0], LIGHT['up']), _math(nt, 'MULTIPLY', facing[1], LIGHT['down'])))
    # The painted value: the broad occlusion, deepened in creases by the near one, times the island's tone and the
    # painted light, stored at VALUE_SCALE (so a value up to 1.25 fits).
    crease = _math(nt, 'MULTIPLY_ADD', near.outputs['AO'], 0.45, 0.55)
    ao = _math(nt, 'MULTIPLY', _math(nt, 'MULTIPLY', far.outputs['AO'], crease), tone.outputs['Fac'])
    ao = _math(nt, 'MULTIPLY', _math(nt, 'MULTIPLY', ao, light), VALUE_SCALE)
    comb = N('ShaderNodeCombineColor')
    L(ao, comb.inputs[0])
    L(edge, comb.inputs[1])
    L(decal.outputs['Fac'], comb.inputs[2])
    L(comb.outputs['Color'], emit.inputs['Color'])
    emit.inputs['Strength'].default_value = 1.0
    L(emit.outputs['Emission'], out.inputs['Surface'])
    return m


def _math(nt, op, a, b, c=None):
    n = nt.nodes.new('ShaderNodeMath')
    n.operation = op
    for i, x in enumerate((a, b, c)[: 3 if c is not None else 2]):
        if isinstance(x, (int, float)):
            n.inputs[i].default_value = x
        else:
            nt.links.new(x, n.inputs[i])
    return n.outputs['Value']


def use_cycles(scene):
    scene.render.engine = 'CYCLES'
    cy = scene.cycles
    cy.device, cy.samples, cy.seed, cy.use_denoising = 'CPU', SAMPLES, 0, False
    cy.use_adaptive_sampling = False
    scene.render.bake.margin, scene.render.bake.margin_type = MARGIN_PX, 'EXTEND'


def new_image(name, size):
    old = bpy.data.images.get(name)
    if old:
        bpy.data.images.remove(old)
    img = bpy.data.images.new(name, size, size, alpha=True, float_buffer=True)
    img.colorspace_settings.name = 'Non-Color'
    return img


def pixels(img):
    a = np.empty(img.size[0] * img.size[1] * 4, np.float32)
    img.pixels.foreach_get(a)
    return a.reshape(img.size[1], img.size[0], 4)


def check_bake(texels, path):
    """Refuse a bake that came out empty or flat: the islands' normals must turn, their painted value must sit round
    the part's own colour and some edges must wear."""
    assert len(texels) > 1000, f'{path}: the bake reached almost nothing'
    assert texels[:, 0].std() > 0.004 and texels[:, 1].std() > 0.004, f'{path}: the baked normal is flat'
    assert 0.45 < texels[:, 2].mean() / VALUE_SCALE < 1.15, f'{path}: the painted value is off ({texels[:, 2].mean():.2f})'
    assert (texels[:, 3] > EDGE_BASE + 0.05).any(), f'{path}: no worn edges'


def bake_maps(objs, highs, scene, size, path):
    """Bake the normal and the masks from the highs onto the parts and write the packed map to `path`."""
    use_cycles(scene)
    nimg, mimg = new_image('DB_bake_normal', size), new_image('DB_bake_masks', size)
    low, tmat = _target(objs, scene, nimg)
    masks = _mask_material()
    for h in highs:
        h.data.materials.clear()
        h.data.materials.append(masks)
    common = dict(use_selected_to_active=True, cage_extrusion=CAGE, max_ray_distance=RAY, margin=MARGIN_PX,
                  margin_type='EXTEND', uv_layer='bake', use_clear=True, target='IMAGE_TEXTURES')
    select([low] + highs)
    bpy.context.view_layer.objects.active = low
    bpy.ops.object.bake(type='NORMAL', normal_space='TANGENT', **common)
    tmat.node_tree.nodes.active.image = mimg
    bpy.ops.object.bake(type='EMIT', **common)
    n, m = pixels(nimg), pixels(mimg)
    out = np.empty_like(n)
    out[..., 0], out[..., 1] = n[..., 0], n[..., 1]
    out[..., 2] = np.clip(m[..., 0], 0, 1)
    out[..., 3] = np.clip(EDGE_BASE + 0.25 * m[..., 1] * (1 - m[..., 2]) - 0.25 * m[..., 2], 0.5, 1)
    # Texels no island reached (between islands, past the bleed): flat, unshaded, no edge.
    empty = (m[..., 0] == 0) & (m[..., 1] == 0) & (m[..., 2] == 0)
    out[empty] = (0.5, 0.5, VALUE_SCALE, EDGE_BASE)
    check_bake(out[~empty], path)
    img = bpy.data.images.new('DB_bake_out', size, size, alpha=True, float_buffer=False)
    img.colorspace_settings.name = 'Non-Color'
    img.alpha_mode = 'STRAIGHT'
    img.pixels.foreach_set(out.ravel())
    img.filepath_raw, img.file_format = path, 'WEBP'
    img.save(quality=100)   # (lossless: the channels are data)
    for x in (img, nimg, mimg):
        bpy.data.images.remove(x)
    for o in [low] + highs:
        bpy.data.objects.remove(o, do_unlink=True)
    for x in (tmat, masks):
        bpy.data.materials.remove(x)


# ─── The finish ──────────────────────────────────────────────────────────────

def finish(scene, glb_path):
    """UVs, weighted normals and the baked map for the model in `scene`, about to be exported to `glb_path` (see the
    module comment). Returns the bake map's path."""
    bpy.context.window.scene = scene
    root = model_root(scene)
    meshes = [o for o in scene.objects if o.type == 'MESH']
    for o in [o for o in meshes if contract(o) in DROP]:
        bpy.data.objects.remove(o, do_unlink=True)
    meshes = [o for o in scene.objects if o.type == 'MESH']
    details = [o for o in meshes if contract(o) in BAKE_ONLY]
    parts = [o for o in meshes if o not in details]
    for o in parts:
        weighted_normals(o)
    hidden = hidden_faces(parts)
    for a, b in sorted(coplanar_overlaps(parts)):
        print(f'BAKE WARNING {os.path.basename(glb_path)}: {a} and {b} lie flush over each other (they flicker)')
    area = unwrap(parts, root, hidden)
    size = atlas_size(area)
    n_hidden = sum(len(h) for h in hidden.values())
    print(f'BAKE {os.path.basename(glb_path)}: {len(parts)} parts, {area:.2f} m2 of surface seen ({n_hidden} faces hidden), a {size} atlas')
    pack(parts, size, hidden)
    tones(parts)
    highs = high_poly(parts, details, scene)
    for o in details:
        bpy.data.objects.remove(o, do_unlink=True)
    path = os.path.splitext(glb_path)[0] + '.bake.webp'
    bake_maps(parts, highs, scene, size, path)
    for o in parts:
        for name in ('db_tone', 'db_lo', 'db_hi'):
            a = o.data.attributes.get(name)
            if a:
                o.data.attributes.remove(a)
    return path
