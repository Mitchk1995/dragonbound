"""The rock kit's geometry-nodes generator (rocks.py): one node tree per rock, made from its recipe, that turns a
coarse base shape into the rock's dense, watertight surface the way a professional builds rocks: as a signed
distance field (Blender's SDF grid nodes), remeshed from the volume.

The tree, in the rock's own space (three.js axes: Y up, +Z its front):
  base     the input mesh (a convex hull of seeded points, or a prism for cliff modules) as an SDF grid, its edges
           worn round by a mean filter (weathered shoulders), sampled through a low domain warp (no two alike);
  slices   a few big fracture planes shearing flat broken faces off its sides, and a mass's caprock crown off its
           top along the bedding (rocks.py lays them);
  chips    planar cuts from 3D Voronoi cells: a share of the cells at the surface each shave the rock flat a little
           way in, along the surface turned a little, so it breaks into facets and chipped edges, not a pebble;
  relief   broad lumps and fine noise displacement, and cracks along some Voronoi cell edges;
  strata   bedding planes (tilted, wandering, thick and thin): each bed (or each jointed block of it) set in or out
           by its own amount, a groove along every bed joint, the foot of each bed cut back under the one above;
  joints   long vertical joints (2D Voronoi edges) cracking the faces of cliffs and splitting their beds into blocks;
  front    buttresses and bays along a cliff module's face;
  cuts     a flat foot sunk into the ground, a slab's flat top, a cliff module's flat back sunk into the hill;
  veins    ore veins (branching networks or glowing fissures) raised or sunk a little, and stored on the surface as
           the `vein` attribute for the bake.
The field is evaluated over a dense grid (Field to Grid on a Cube Grid Topology), smoothed once and meshed at its
zero level (Grid to Mesh), its faces turned outward. Every random choice comes from the recipe's seed, so a
re-export makes the same rock.
"""
import math

import bpy


class Graph:
    """A geometry-nodes tree built from Python: each helper adds nodes and returns the output socket."""

    def __init__(self, name):
        old = bpy.data.node_groups.get(name)
        if old:
            bpy.data.node_groups.remove(old)
        self.tree = bpy.data.node_groups.new(name, 'GeometryNodeTree')
        self.tree.interface.new_socket('Geometry', in_out='INPUT', socket_type='NodeSocketGeometry')
        self.tree.interface.new_socket('Geometry', in_out='OUTPUT', socket_type='NodeSocketGeometry')
        self.geo_in = self.node('NodeGroupInput').outputs[0]
        self.out = self.node('NodeGroupOutput')
        self.pos = self.node('GeometryNodeInputPosition').outputs[0]

    def node(self, kind, **props):
        n = self.tree.nodes.new(kind)
        for k, v in props.items():
            setattr(n, k, v)
        return n

    def feed(self, sock, v):
        if isinstance(v, bpy.types.NodeSocket):
            self.tree.links.new(v, sock)
        elif v is not None:
            sock.default_value = v

    @staticmethod
    def sock(socks, name, kind):
        """A node's socket by name and type (nodes like Random Value and Map Range carry one per data type)."""
        return next(s for s in socks if s.name == name and s.type == kind)

    # ─── Maths ───────────────────────────────────────────────────────────────

    def math(self, op, a, b=None, c=None):
        n = self.node('ShaderNodeMath', operation=op)
        for i, v in enumerate((a, b, c)):
            self.feed(n.inputs[i], v)
        return n.outputs[0]

    def add(self, *xs):
        out = xs[0]
        for x in xs[1:]:
            out = self.math('ADD', out, x)
        return out

    def mul(self, a, b):
        return self.math('MULTIPLY', a, b)

    def mad(self, a, b, c):
        return self.math('MULTIPLY_ADD', a, b, c)

    def centred(self, f, amp):
        """amp * (f - 0.5) * 2: a 0..1 noise turned into a signed displacement."""
        return self.mad(f, 2 * amp, -amp)

    def vmath(self, op, a, b=None, scale=None):
        n = self.node('ShaderNodeVectorMath', operation=op)
        self.feed(n.inputs[0], a)
        if b is not None:
            self.feed(n.inputs[1], b)
        if scale is not None:
            self.feed(n.inputs[3], scale)
        return n.outputs['Value'] if op in ('DOT_PRODUCT', 'LENGTH', 'DISTANCE') else n.outputs['Vector']

    def xyz(self, v):
        n = self.node('ShaderNodeSeparateXYZ')
        self.feed(n.inputs[0], v)
        return n.outputs

    def vec(self, x, y, z):
        n = self.node('ShaderNodeCombineXYZ')
        for i, v in enumerate((x, y, z)):
            self.feed(n.inputs[i], v)
        return n.outputs[0]

    def smooth(self, e0, e1, x):
        """Smoothstep of x from e0 to e1 (0..1)."""
        n = self.node('ShaderNodeMapRange', data_type='FLOAT', interpolation_type='SMOOTHSTEP', clamp=True)
        self.feed(self.sock(n.inputs, 'Value', 'VALUE'), x)
        self.feed(self.sock(n.inputs, 'From Min', 'VALUE'), e0)
        self.feed(self.sock(n.inputs, 'From Max', 'VALUE'), e1)
        return self.sock(n.outputs, 'Result', 'VALUE')

    # ─── Textures and randomness ─────────────────────────────────────────────

    def noise(self, v, scale, detail=0.0, rough=0.5, distortion=0.0):
        """Fractal noise at v (factor 0..1, and its three-channel colour)."""
        n = self.node('ShaderNodeTexNoise')
        for name, x in (('Vector', v), ('Scale', scale), ('Detail', detail), ('Roughness', rough),
                        ('Distortion', distortion)):
            self.feed(n.inputs[name], x)
        return n.outputs['Factor'], n.outputs['Color']

    def voronoi(self, v, scale, feature='F1', dims='3D', randomness=1.0):
        n = self.node('ShaderNodeTexVoronoi', feature=feature, voronoi_dimensions=dims)
        for name, x in (('Vector', v), ('Scale', scale), ('Randomness', randomness)):
            self.feed(n.inputs[name], x)
        return n.outputs

    def rand(self, ident, seed, lo=0.0, hi=1.0):
        """A random value in lo..hi for an integer id (the same id always draws the same value)."""
        n = self.node('FunctionNodeRandomValue', data_type='FLOAT')
        self.feed(self.sock(n.inputs, 'Min', 'VALUE'), lo)
        self.feed(self.sock(n.inputs, 'Max', 'VALUE'), hi)
        self.feed(n.inputs['ID'], ident)
        self.feed(n.inputs['Seed'], seed)
        return self.sock(n.outputs, 'Value', 'VALUE')

    def floor_int(self, f):
        n = self.node('FunctionNodeFloatToInt', rounding_mode='FLOOR')
        self.feed(n.inputs[0], f)
        return n.outputs[0]


def bed_normal(tilt, azimuth):
    """The bedding planes' normal: up, tipped `tilt` radians toward the compass direction `azimuth`."""
    return (math.sin(tilt) * math.sin(azimuth), math.cos(tilt), math.sin(tilt) * math.cos(azimuth))


def sample(g, grid, at, kind='FLOAT'):
    s = g.node('GeometryNodeSampleGrid', data_type=kind)
    g.feed(s.inputs['Grid'], grid)
    g.feed(s.inputs['Position'], at)
    return s.outputs['Value']


def sdf_field(g, r, sdf_grid, offset):
    """The rock's signed distance at each point (negative inside), from its recipe `r` (see rocks.py)."""
    P = g.vmath('ADD', g.pos, offset)       # (the seed's own place in every noise)
    # Base: the worn base shape and its chips, together sampled through a low domain warp.
    warp_amp, warp_scale = r['warp']
    _, wc = g.noise(P, warp_scale, detail=1.0)
    Pw = g.vmath('ADD', g.pos, g.vmath('SCALE', g.vmath('SUBTRACT', wc, (0.5, 0.5, 0.5)), scale=2 * warp_amp))
    d = base_d = sample(g, sdf_grid, Pw)
    # Slices: a few big fracture planes across the whole rock (its broken faces), from rocks.py's seeded planes.
    for n, at in r.get('planes', ()):
        side = g.vmath('DOT_PRODUCT', g.vmath('SUBTRACT', Pw, r['middle']), n)
        d = g.math('MAXIMUM', d, g.math('SUBTRACT', side, at))
    if r.get('chips'):
        d = chips(g, r, d, base_d, sdf_grid, Pw)
    # Relief: broad lumps, then the fine weathered noise.
    lump_amp, lump_scale = r['lump']
    if lump_amp:
        d = g.add(d, g.centred(g.noise(P, lump_scale, detail=1.0)[0], lump_amp))
    n_amp, n_scale, n_detail, n_rough = r['noise']
    if n_amp:
        d = g.add(d, g.centred(g.noise(P, n_scale, detail=n_detail, rough=n_rough)[0], n_amp))
    if r.get('cracks'):
        d = cracks(g, r, d, P)
    if r.get('strata'):
        d = strata(g, r, d, P)
    if r.get('joints'):
        d = joints(g, r, d, P)
    if r.get('front'):
        d = front(g, r, d, P)
    if r.get('vein'):
        d = g.math('SUBTRACT', d, g.mul(vein_field(g, r['vein'], P), r['vein']['lift']))
    # Cuts: the flat foot (sunk into the ground), a slab's flat top, a cliff module's flat back (sunk into the hill
    # behind it). Each keeps the side of a plane: (axis, -1, at) keeps axis >= at, (axis, +1, at) keeps axis <= at.
    axes = dict(zip('xyz', g.xyz(g.pos)))
    for axis, sign, at in r['cuts']:
        d = g.math('MAXIMUM', d, g.mul(g.math('SUBTRACT', axes[axis], at), float(sign)))
    return d


def chips(g, r, d, base_d, base, at):
    """Chips: a share of the 3D Voronoi cells lying at the surface each shave the rock flat a little way under it,
    along a plane turned a little from the surface there (the base's own normal at the cell's point, from its
    gradient): flat facets meeting in crisp edges, as struck stone breaks. `at` is where the base is read (the warped
    point). Cells whose point lies deep inside or far outside cut nothing (their normal says nothing of the surface),
    and no chip goes deeper than `depth` under the base's surface (`base_d`), so none slices through a thin spire."""
    scale, depth, density, jitter = r['chips']
    P = g.vmath('ADD', at, r['chip_offset'])
    out = g.voronoi(P, scale)
    col = out['Color']
    cell = g.vmath('SUBTRACT', g.vmath('SCALE', out['Position'], scale=1.0 / scale), r['chip_offset'])
    grad = g.node('GeometryNodeGridGradient')
    g.feed(grad.inputs['Grid'], base)
    gv = sample(g, grad.outputs['Gradient'], cell, 'VECTOR')
    turn = g.vmath('SCALE', g.vmath('SUBTRACT', col, (0.5, 0.5, 0.5)), scale=2 * jitter)
    nrm = g.vmath('NORMALIZE', g.vmath('ADD', g.vmath('NORMALIZE', gv), turn))
    cr, cg, _ = g.xyz(col)
    sd = sample(g, base, cell)
    near = g.math('LESS_THAN', g.math('ABSOLUTE', sd), 0.45 / scale)
    sure = g.math('GREATER_THAN', g.vmath('LENGTH', gv), 0.6)
    picked = g.mul(g.mul(g.math('LESS_THAN', cg, density), near), sure)
    # The plane through the surface near the cell's point (its distance there along the normal), `depth * cr` in.
    plane = g.add(g.vmath('DOT_PRODUCT', g.vmath('SUBTRACT', at, cell), nrm), sd, g.mul(g.mad(cr, 0.7, 0.3), depth))
    plane = g.math('SUBTRACT', plane, g.mul(g.math('SUBTRACT', 1.0, picked), 50.0))
    return g.math('MAXIMUM', d, g.math('MINIMUM', plane, g.add(base_d, depth)))


def cracks(g, r, d, P):
    """Cracks: thin grooves along a share of the edges of 3D Voronoi cells, running in and out of a slow noise."""
    scale, depth, width, share = r['cracks']
    edge = g.voronoi(g.vmath('ADD', P, (3.7, 1.9, 8.3)), scale, feature='DISTANCE_TO_EDGE', randomness=0.95)['Distance']
    line = g.math('SUBTRACT', 1.0, g.smooth(0.0, width * scale, edge))
    keep, _ = g.noise(P, 0.9, detail=1.0)
    return g.add(d, g.mul(g.mul(line, g.smooth(1.0 - share, 1.0 - share + 0.08, keep)), depth))


def strata(g, r, d, P):
    """Bedding: beds about `thick` deep across the bed normal, thick and thin at random (a slow noise along the normal
    stretches some and squeezes others) and wandering a little across the rock. Each bed's face stands flat, set in or
    out by the bed's own amount; its lower part is cut back under the bed above (a ledge with an overhanging lip), a
    fine groove marks each bed joint and every lip is worn a little round."""
    st = r['strata']
    b = bed_normal(st['tilt'], st['azimuth'])
    h = g.math('DIVIDE', g.vmath('DOT_PRODUCT', g.pos, b), st['thick'])
    irregular, _ = g.noise(g.vec(g.mul(h, 0.33), float(r['seed'] % 97), 0.0), 1.0, detail=0.0)
    wav, _ = g.noise(P, st['wander_scale'], detail=1.0)
    s = g.add(h, g.centred(irregular, 0.6), g.centred(wav, st['wander']))
    k = g.math('FLOOR', s)
    f = g.math('SUBTRACT', s, k)
    kid = g.floor_int(k)
    bed = g.rand(kid, r['seed'])
    if r.get('joints'):
        # Jointed beds: the vertical joints split each bed into blocks, each block set in or out on its own.
        cell = joint_cells(g, r, P)['Color']
        bed = g.math('FRACT', g.add(g.mul(bed, 7.31), g.mul(g.xyz(cell)[0], 3.17)))
    d = g.add(d, g.centred(bed, st['recess']))
    # (Not every bed is cut back under the next: each its own share of the undercut.)
    under = g.mul(g.rand(kid, r['seed'] + 1, 0.15, 1.0), st['under'])
    d = g.add(d, g.mul(g.smooth(0.22, 0.0, f), under))
    d = g.add(d, g.mul(g.smooth(0.93, 1.0, f), st['under'] * 0.15))
    return g.add(d, g.mul(g.math('SUBTRACT', 1.0, g.smooth(0.0, st['groove_w'] / st['thick'], f)), st['groove']))


def joint_cells(g, r, P):
    """The 2D Voronoi cells of the vertical joints (across the ground plane), shared by joints() and strata()."""
    x, _, z = g.xyz(P)
    return g.voronoi(g.vec(x, z, 0.0), r['joints'][0], feature='F1', dims='2D', randomness=0.9)


def joints(g, r, d, P):
    """Long vertical joints: the edges of 2D Voronoi cells across the ground plane, cut into the faces, fading in and
    out along their length so they break here and there."""
    scale, depth, width = r['joints']
    x, _, z = g.xyz(P)
    flat = g.vec(x, z, 0.0)
    edge = g.voronoi(flat, scale, feature='DISTANCE_TO_EDGE', dims='2D', randomness=0.9)['Distance']
    crack = g.math('SUBTRACT', 1.0, g.smooth(0.0, width * scale, edge))
    breaks, _ = g.noise(P, 0.45, detail=1.0)
    return g.add(d, g.mul(g.mul(crack, g.smooth(0.38, 0.55, breaks)), depth))


def front(g, r, d, P):
    """Buttresses and bays along a cliff module's face (+Z): the face pushed out and in by a slow noise along its run,
    strongest at the face and gone by its back."""
    amp, scale = r['front']
    x, y, _ = g.xyz(P)
    along, _ = g.noise(g.vec(x, g.mul(y, 0.25), 0.0), scale, detail=1.0)
    _, _, z = g.xyz(g.pos)
    mz, hz = r['middle'][2], r['half'][2]
    return g.add(d, g.mul(g.centred(along, amp), g.smooth(mz - hz * 0.2, mz + hz, z)))


def vein_field(g, v, P):
    """Where the ore runs (0..1), as veins: `branch` veins follow the ridges of a noise (where it crosses its middle), a
    network that forks and wanders, in two sizes, the finer fainter; `stretch` squeezes the noise along the axes (coal's
    seams run level along the beds); `halo` stains the rock a little way round each vein. `crack` veins follow the edges
    of Voronoi cells (a crack network: emberite's glowing fissures). Patches of the rock carry the ore and the rest is
    bare, so a rock is never all ore."""
    Q = g.vmath('MULTIPLY', P, v.get('stretch', (1.0, 1.0, 1.0)))
    if v['style'] == 'crack':
        # The fissures wander (the cells read through a warp, so no edge runs straight), open and close along their
        # length, and finer cracks branch off them here and there.
        _, wc = g.noise(Q, 1.6, detail=1.0)
        Qw = g.vmath('ADD', Q, g.vmath('SCALE', g.vmath('SUBTRACT', wc, (0.5, 0.5, 0.5)), scale=0.3))
        lines = []
        sets = ((v['scale'], v['width'], 1.0), (v['scale'] * 2.2, v['width'] * 0.6, 0.8))
        for k, (scale, width, weight) in enumerate(sets):
            at = g.vmath('ADD', Qw, (k * 5.3, k * 2.9, k * 8.1))
            edge = g.voronoi(at, scale, feature='DISTANCE_TO_EDGE', randomness=0.95)['Distance']
            swell, _ = g.noise(g.vmath('ADD', Q, (k * 3.1, 0.0, k * 6.7)), 1.1 + k, detail=1.0)
            line = g.math('SUBTRACT', 1.0, g.smooth(width * 0.5 * scale, width * scale, edge))
            lines.append(g.mul(g.mul(line, g.smooth(0.32 + k * 0.1, 0.56 + k * 0.1, swell)), weight))
        line = g.math('MAXIMUM', *lines)
    else:
        lines = []
        sets = ((v['scale'], v['width'], 1.0), (v['scale'] * 2.3, v['width'] * 0.7, 0.75))
        for k, (scale, width, weight) in enumerate(sets):
            f, _ = g.noise(g.vmath('ADD', Q, (k * 11.3, k * 4.1, k * 7.7)), scale, detail=v.get('detail', 2.0),
                           rough=0.45)
            ridge = g.math('ABSOLUTE', g.math('SUBTRACT', f, 0.5))
            vein = g.math('SUBTRACT', 1.0, g.smooth(width * 0.45, width, ridge))
            if v.get('halo'):
                halo = g.math('SUBTRACT', 1.0, g.smooth(width, width * v['halo'], ridge))
                vein = g.math('MAXIMUM', vein, g.mul(halo, 0.4))
            lines.append(g.mul(vein, weight))
        line = g.math('MAXIMUM', *lines)
    patch, _ = g.noise(g.vmath('ADD', P, (7.1, 3.3, 5.9)), v['patch_scale'], detail=1.0)
    return g.mul(line, g.smooth(v['patch'][0], v['patch'][1], patch))


def build_tree(r):
    """The node tree for recipe `r`: base mesh in, the rock's dense watertight surface out (with `vein` for ores)."""
    g = Graph(f"DB_rock_{r['name']}")
    vox = r['voxel']
    band = max(6, int(math.ceil(r['band'] / vox)))
    m2s = g.node('GeometryNodeMeshToSDFGrid')
    g.feed(m2s.inputs['Mesh'], g.geo_in)
    g.feed(m2s.inputs['Voxel Size'], vox)
    g.feed(m2s.inputs['Band Width'], band)
    base = m2s.outputs['SDF Grid']
    width, iters = r['wear']
    if iters:
        mean = g.node('GeometryNodeSDFGridMean')
        g.feed(mean.inputs['Grid'], base)
        g.feed(mean.inputs['Width'], width)
        g.feed(mean.inputs['Iterations'], iters)
        base = mean.outputs['Grid']
    lo, hi = r['bounds']
    topo = g.node('GeometryNodeCubeGridTopology')
    g.feed(topo.inputs['Bounds Min'], lo)
    g.feed(topo.inputs['Bounds Max'], hi)
    for i, a in enumerate('XYZ'):
        g.feed(topo.inputs['Resolution ' + a], max(8, int(math.ceil((hi[i] - lo[i]) / vox))))
    f2g = g.node('GeometryNodeFieldToGrid')
    f2g.grid_items.new('FLOAT', 'sdf')
    g.feed(f2g.inputs['Topology'], topo.outputs['Topology'])
    g.feed(f2g.inputs['sdf'], sdf_field(g, r, base, r['offset']))
    # (Outside the grid counts as well outside the rock, never as on its surface.)
    bg = g.node('GeometryNodeSetGridBackground', data_type='FLOAT')
    g.feed(bg.inputs['Grid'], f2g.outputs['sdf'])
    g.feed(bg.inputs['Background'], 1.0)
    # (A plain float grid's mean: the SDF filters take only the level sets that Mesh to SDF Grid makes.)
    clean = g.node('GeometryNodeGridMean', data_type='FLOAT')
    g.feed(clean.inputs['Grid'], bg.outputs['Grid'])
    g.feed(clean.inputs['Width'], 1)
    g.feed(clean.inputs['Iterations'], r['clean'])
    g2m = g.node('GeometryNodeGridToMesh')
    g.feed(g2m.inputs['Grid'], clean.outputs['Grid'])
    g.feed(g2m.inputs['Threshold'], 0.0)
    flip = g.node('GeometryNodeFlipFaces')
    g.feed(flip.inputs['Mesh'], g2m.outputs['Mesh'])
    mesh = flip.outputs['Mesh']
    if r.get('vein'):
        store = g.node('GeometryNodeStoreNamedAttribute', data_type='FLOAT', domain='POINT')
        g.feed(store.inputs['Geometry'], mesh)
        g.feed(store.inputs['Name'], 'vein')
        g.feed(g.sock(store.inputs, 'Value', 'VALUE'), vein_field(g, r['vein'], g.vmath('ADD', g.pos, r['offset'])))
        mesh = store.outputs['Geometry']
    g.tree.links.new(mesh, g.out.inputs[0])
    return g.tree
