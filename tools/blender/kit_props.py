"""
The building kit's furniture and props (src/world/kit/props.ts), each modelled the way a furniture
maker or a smith would shape it: one continuous, watertight shape, never parts pushed into one
another. Carcasses are box-modelled: each block's outside edges eased round as a joiner eases each
piece (the round sized to the piece: a counter top's a couple of centimetres, a rail's less), then
the blocks boolean-unioned into one and cut (panels recessed with raised fields, doors and lids
jointed, feet notched), so joints and the rims of cuts stay crisp lines. Round things are lathed, iron
bars swept, soft furnishings rounded by subdivision, and the bed's blanket is draped over the bedding
by cloth simulation. Each shape is welded, refused unless it is closed all round, and shaded. Things
that really are separate stay separate shapes, resting on each other: a chest's iron bands, the
bedding on a bed.

A face's material names its surface and the way the wood's grain runs on it (`oak.x`: oak, the grain
along x); the game maps them to its textures. Sizes are in kit units on three.js axes (kit_shapes.py).

Run from the checkout with Blender 5.2 (reproducible on the same Blender build: booleans, bevels and the cloth
simulation may come out a little differently on another), re-exporting whenever a prop changes, into
public/models/kit_props.glb:
    set DRAGONBOUND_ROOT=<checkout>
    blender -b --factory-startup --python tools/blender/kit_props.py
"""
import math
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit_shapes import U, M, attach, band, block, cut, drape, elbow, finish, half, lathe, prism, recolour, remove, rod, seat, soft, transform, union, watertight  # noqa: E402

if bpy.app.version[:2] != (5, 2):
    raise RuntimeError(f'kit_props.py is made with Blender 5.2 (D:/pokemon/tools/blender-5.2.2); this is {bpy.app.version_string}')

ROOT = os.environ.get('DRAGONBOUND_ROOT') or os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'public', 'models', 'kit_props.glb')


def _on(name, axis, a0, a1, u0, v0, u1, v1, mat, r=0.0):
    """A box standing on a face across `axis` from a0 to a1, over (u, v) on the face: (x, y) on a z face, (z, y) on an x face."""
    lo, hi = min(a0, a1), max(a0, a1)
    return block(name, u0, v0, lo, u1, v1, hi, mat, r) if axis == 'z' else block(name, lo, v0, u0, hi, v1, u1, mat, r)


def panelled(ob, axis, sign, at, rects, depth=1.0, inset=2.2, proud=0.6, mat='oak.y'):
    """Recesses panels into the face of `ob` facing `sign` along `axis` at `at`, a raised field in each, its rails and stiles left standing."""
    cut(ob, *[_on('recess', axis, at - sign * depth, at + sign * 2, *q, mat) for q in rects])
    return union(ob, *[_on('field', axis, at - sign * (depth + 0.3), at - sign * (depth - proud), q[0] + inset, q[1] + inset, q[2] - inset, q[3] - inset, mat, 0.3)
                       for q in rects])


# ─── The shop ───────────────────────────────────────────────────────────────

def counter():
    """The shop counter, eight cells long: a panelled carcass on a recessed plinth, a thick top overhanging all round."""
    W, D, s, n = 79.4, 19.4, 4.4, 4
    ob = block('counter8', -80.9, 41, -20.9, 80.9, 44, 20.9, 'oak.x', 1.0)
    union(ob, block('carcass', -W, 3.4, -D, W, 41.2, D, 'oak.y', 1.2), block('plinth', -W + 1, 0, -D + 1, W - 1, 3.6, D - 1, 'oak.x', 0.8))
    pw = (2 * W - (n + 1) * s) / n
    for sign in (1, -1):
        panelled(ob, 'z', sign, sign * D, [(-W + s + i * (pw + s), 7.4, -W + s + i * (pw + s) + pw, 37.4) for i in range(n)], depth=1.4, proud=0.9)
        panelled(ob, 'x', sign, sign * W, [(-D + s, 7.4, D - s, 37.4)], depth=1.4, proud=0.9)
    return finish(ob)


def turned_leg(name, x, z, h, r=1.9):
    # (Its top, turned narrower than the square block it runs up into, meets that block's foot in a clean ring.)
    prof = [(0, 0), (r * 0.9, 0), (r, 1.2), (r * 0.78, 3.2), (r * 0.66, 8), (r * 0.84, 13), (r * 0.66, 16.5), (r * 0.56, h - 6),
            (r * 0.7, h - 2.5), (r * 0.72, h - 1), (r * 0.72, h), (0, h)]
    return lathe(name, prof, 16, 'oak.y', at=(x, 0, z))


def table(w):
    """A table `w` cells long and two deep: a plank top on four turned legs squared where the aprons join them, an H of stretchers low down."""
    W, D, H, t, sq = half(w) - 0.15, half(2) - 0.15, 40, 3, 1.8
    lx, lz = W - 3.6, D - 3.6
    ob = block(f'table{w}', -W, H - t, -D, W, H, D, 'oak.x', 1.0)
    parts = []
    for x in (-lx, lx):
        for z in (-lz, lz):
            parts += [block('square', x - sq, H - t - 7.2, z - sq, x + sq, H - t + 0.2, z + sq, 'oak.y', 0.35), turned_leg('leg', x, z, H - t - 7.0)]
    oz, ox, y0, y1 = lz + sq - 0.5, lx + sq - 0.5, H - t - 6.2, H - t + 0.2
    parts += [block('apron', -lx, y0, oz - 1.6, lx, y1, oz, 'oak.x', 0.4), block('apron', -lx, y0, -oz, lx, y1, -oz + 1.6, 'oak.x', 0.4),
              block('apron', ox - 1.6, y0, -lz, ox, y1, lz, 'oak.z', 0.4), block('apron', -ox, y0, -lz, -ox + 1.6, y1, lz, 'oak.z', 0.4),
              block('stretcher', -lx - 0.9, 6.0, -lz, -lx + 0.9, 8.4, lz, 'oak.z', 0.5), block('stretcher', lx - 0.9, 6.0, -lz, lx + 0.9, 8.4, lz, 'oak.z', 0.5),
              block('stretcher', -lx, 6.2, -0.8, lx, 8.2, 0.8, 'oak.x', 0.5)]
    union(ob, *parts)
    return finish(ob)


def bench():
    """A bench three cells long: a thick seat on two slab ends notched into feet, a rail tenoned through both, its ends showing."""
    W = half(3) - 0.15
    ob = block('bench3', -W + 0.8, 17.4, -7.2, W - 0.8, 20, 7.2, 'oak.x', 0.8)
    ends = []
    for x in (-22, 22):
        e = block('end', x - 1.3, 0, -6.2, x + 1.3, 17.6, 6.2, 'oak.y', 0.6)
        ends.append(cut(e, rod('notch', (x - 2, 0, 0), (x + 2, 0, 0), 3.4, 'oak.y', 20)))
    union(ob, *ends, block('rail', -24.4, 9, -1.2, 24.4, 12, 1.2, 'oak.x', 0.5))
    return finish(ob)


def stool():
    """A three-legged stool: a round seat, its legs splayed out to the floor."""
    ob = lathe('stool', [(0, 17.6), (8.0, 17.6), (8.6, 18.3), (8.6, 19.3), (8.1, 20), (0, 20)], 24, 'oak.x')
    legs = []
    for i in range(3):
        a = 2 * math.pi * i / 3 + 0.5
        legs.append(rod('leg', (7.2 * math.cos(a), -1.0, 7.2 * math.sin(a)), (4.4 * math.cos(a), 18.4, 4.4 * math.sin(a)), 1.05, 'oak.y', 12, 1.35))
    union(ob, *legs)
    cut(ob, block('floor', -20, -10, -20, 20, 0, 20, 'oak.y'))
    return finish(ob)


def shelves():
    """Shelves four cells long against a wall (their back at -z): two sides notched into feet, four boards, a capping board, rails."""
    W, D, H = half(4) - 0.15, half(1) - 0.15, 88
    ob = block('shelves4', -W, 86, -D, W, H, D, 'oak.x', 0.6)
    parts = []
    for x0 in (-W, W - 2.4):
        side = block('side', x0, 0, -D, x0 + 2.4, 86.2, D, 'oak.y', 0.6)
        parts.append(cut(side, rod('notch', (x0 - 1, 0, 0), (x0 + 3.4, 0, 0), 4.5, 'oak.y', 20)))
    parts += [block('board', -W + 2.2, y, -D, W - 2.2, y + 2, D - 0.6, 'oak.x', 0.5) for y in (4 + (H - 6) * i / 3 for i in range(3))]
    parts += [block('rail', -W + 2.2, 78, -D, W - 2.2, 86.2, -D + 1.2, 'oak.x', 0.35), block('kick', -W + 2.2, 0, D - 2, W - 2.2, 4.2, D - 0.8, 'oak.x', 0.35)]
    union(ob, *parts)
    return finish(ob)


# ─── Upstairs ───────────────────────────────────────────────────────────────

def wardrobe():
    """A wardrobe three cells wide: a carcass on a plinth under a stepped cornice, two doors of two raised panels, iron knobs."""
    W = half(3) - 0.35
    ob = block('wardrobe3', -W, 3.0, -9, W, 92.2, 8.4, 'oak.y', 1.0)
    union(ob, block('plinth', -W - 0.5, 0, -9, W + 0.5, 3.2, 8.9, 'oak.x', 0.6), block('frieze', -W - 0.4, 91.8, -9, W + 0.4, 93.6, 8.8, 'oak.x', 0.4),
          block('cornice', -W - 0.9, 93.4, -9, W + 0.9, 96, 9.5, 'oak.x', 0.6))
    cut(ob, block('joint', -0.4, 6, 7.8, 0.4, 89, 9, 'oak.y'), block('joint', -27.6, 89, 7.8, 27.6, 89.8, 9, 'oak.y'),
        block('joint', -27.6, 5.2, 7.8, 27.6, 6, 9, 'oak.y'), block('joint', -28.4, 5.2, 7.8, -27.6, 89.8, 9, 'oak.y'),
        block('joint', 27.6, 5.2, 7.8, 28.4, 89.8, 9, 'oak.y'))
    panelled(ob, 'z', 1, 8.4, [(x0, y0, x1, y1) for x0, x1 in ((-24.6, -3.2), (3.2, 24.6)) for y0, y1 in ((10, 44), (50, 85))], depth=1.2, proud=0.8)
    knobs = [transform(lathe('knob', [(0, 0), (0.8, 0), (0.55, 0.4), (0.7, 0.75), (1.1, 1.0), (0.9, 1.2), (0, 1.25)], 12, 'iron'), M(at=(x, 47.5, 8.15), rx=math.pi / 2))
             for x in (-1.9, 1.9)]
    union(ob, *knobs)
    return finish(ob)


def chest():
    """A chest three cells long: a box under a domed lid that overhangs it a little all round; iron bands over it and a lock plate (their own shapes)."""
    W, D, L = half(3) - 1.25, 7.8, 0.4
    arch = [(-D - L, 19), (D + L, 19), (D + L, 20.2), (6.9, 21.9), (4.3, 23.0), (0, 23.5), (-4.3, 23.0), (-6.9, 21.9), (-D - L, 20.2)]
    ob = block('chest3', -W, 0, -D, W, 19.2, D, 'oak.x', 1.0)
    union(ob, prism('lid', arch, 'x', -W - L, W + L, 'oak.x', 0.8))
    finish(ob)
    # (Up the back, under the lid's lip, over the lid and down the front, on the chest's outline before it was eased, so
    # nowhere inside it; the chest on the band's right.)
    path = [(-D, 0.6), (-D, 19), *arch[:1:-1], (D + L, 19), (D, 19), (D, 0.6)]
    path.insert(2, (-D - L, 19))
    # (Each band and the lock plate a shape of its own, lying on the chest.)
    for x in (-17, 17):
        attach(finish(band('chest3 band', path, x - 1.2, x + 1.2, 0.4, 'iron', 0.15)), ob)
    attach(finish(block('chest3 lock', -2.2, 13.5, D, 2.2, 18.6, D + 0.5, 'iron', 0.15)), ob)
    return ob


def post(name, x, z, h):
    prof = [(0, 0), (2.4, 0), (2.4, 1.6), (2.0, 2.6), (2.0, h - 9), (2.4, h - 7.6), (2.4, h - 5.6), (2.0, h - 4.8), (1.5, h - 3.4), (1.7, h - 1.8),
            (1.0, h - 0.5), (0, h)]
    return lathe(name, prof, 16, 'oak.y', at=(x, 0, z))


def plump(ob):
    """A pillow's stuffing: thickest in its middle, thinning to its edges, its foot left flat."""
    vs = ob.data.vertices
    lo = [min(v.co[k] for v in vs) for k in range(3)]
    hi = [max(v.co[k] for v in vs) for k in range(3)]
    for v in vs:
        dx = (v.co.x - (lo[0] + hi[0]) / 2) / ((hi[0] - lo[0]) / 2)
        dy = (v.co.y - (lo[1] + hi[1]) / 2) / ((hi[1] - lo[1]) / 2)
        v.co.z = lo[2] + (v.co.z - lo[2]) * (1 - 0.45 * min(1.0, dx * dx + dy * dy))
    return ob


def bed():
    """A bed six cells long and four wide: turned posts, a panelled head and foot board, rails and slats; its mattress, pillows and draped blanket."""
    px, pz = half(6) - 2.4, half(4) - 2.4
    ob = post('bed6', -px, -pz, 34)
    union(ob, post('post', -px, pz, 34), post('post', px, -pz, 22), post('post', px, pz, 22),
          block('head', -px - 1.4, 9.5, -pz, -px + 1.4, 30, pz, 'oak.z', 0.6), block('foot', px - 1.4, 9.5, -pz, px + 1.4, 19, pz, 'oak.z', 0.6),
          *[block('rail', -px, 5, s * pz - 1.2, px, 11, s * pz + 1.2, 'oak.x', 0.5) for s in (-1, 1)],
          block('slats', -px + 0.6, 7.5, -pz + 0.4, px - 0.6, 9.0, pz - 0.4, 'oak.x', 0.3))
    panelled(ob, 'x', 1, -px + 1.4, [(-pz + 4, 13, -2, 27), (2, 13, pz - 4, 27)], depth=1.2, proud=0.8)
    panelled(ob, 'x', 1, px + 1.4, [(-pz + 4, 11.5, pz - 4, 17)], depth=1.0, inset=1.6, proud=0.7)
    finish(ob)
    mattress = soft('bed6 mattress', -px + 1.6, 9, -pz + 1.45, px - 1.6, 17.4, pz - 1.45, 'linen', 2.4)
    top = max(v.co.z for v in mattress.data.vertices) / U
    pillows = [seat(plump(soft('pillow', -px + 2.4, top, z0, -43.4, top + 6.4, z1, 'linen', 2.2)), top) for z0, z1 in ((-34.4, -1.0), (1.0, 34.4))]
    blanket = drape('bed6 blanket', -42.6, 53.4, -40.2, 40.2, top + 0.6, [ob, mattress, *pillows], 'blanket')
    for part in (mattress, *pillows, blanket):
        attach(part, ob)
    return ob


# ─── The street and the oven ────────────────────────────────────────────────

def window_box(w):
    """A window box `w` cells long hung on the wall: a planked box hollowed from one block, full of earth, on two knee brackets."""
    W, z0 = half(w), half(1)
    ob = block(f'windowBox{w}', -W, 2.2, z0 + 0.4, W, 7.5, z0 + 9, 'oak.x', 0.5)
    cut(ob, block('hollow', -W + 1.2, 6.3, z0 + 1.6, W - 1.2, 9, z0 + 7.8, 'oak.x'), block('joint', -W - 1, 4.5, z0 + 8.5, W + 1, 5.2, z0 + 10, 'oak.x'))
    # (Square at its foot on the wall, a quarter round out under the box, a square shoulder the box sits on.)
    knee = [(z0, 2.4), (z0, -5)] + [(z0 + 3.6 - 2.8 * math.cos(t), -5 + 6.0 * math.sin(t)) for t in (math.pi / 2 * k / 6 for k in range(7))] + [(z0 + 3.6, 2.4)]
    union(ob, *[prism('knee', knee, 'x', x - 1, x + 1, 'oak.y', 0.3) for x in (-W + 6, W - 6)])
    recolour(ob, 'earth', lambda c, n: n[1] > 0.9 and abs(c[1] - 6.3) < 0.05)
    return finish(ob)


def sign():
    """The baker's sign: an oak board with a raised border, a loaf carved standing proud of it, its crust scored."""
    W, y0, y1 = 29.5, 3, 43
    ob = block('sign', -W, y0, -2, W, y1, 2, 'oak.x', 0.8)
    border = cut(block('border', -W + 1, y0 + 1, 1.8, W - 1, y1 - 1, 3, 'oak.x', 0.3), block('inside', -W + 3.5, y0 + 3.5, 1, W - 3.5, y1 - 3.5, 4, 'oak.x'))
    loaf = transform(lathe('loaf', [(0, 0), (8.5, 0), (8.4, 1.0), (7.6, 2.3), (6.0, 3.4), (3.6, 4.1), (0, 4.4)], 24, 'bread'),
                     M(at=(0, (y0 + y1) / 2, 1.8), rx=math.pi / 2, scale=(2.0, 1, 1)))
    finish(union(ob, border, loaf))
    # Three slashes scored across its crust after it is shaped: short round grooves, deep enough all along to end in square cuts.
    mid = (y0 + y1) / 2
    cut(ob, *[transform(rod('score', (0, -3.6, 0), (0, 3.6, 0), 1.2, 'crust', 12), M(at=(x, mid, 6.2), rz=-0.5)) for x in (-8, 0, 8)])
    return watertight(ob)


def sign_bracket():
    """The sign's bracket: an iron arm from a plate on the wall, a stay under it, a crossbar at its end, a knob, two hangers."""
    face, tip = half(1) + 0.3, 40
    ob = block('signBracket', -4, 4, face - 0.3, 4, 30, face + 1.4, 'iron', 0.4)
    union(ob, rod('arm', (0, 26, face + 1.0), (0, 26, tip + 3), 1.6, 'iron'), rod('stay', (0, 8, face + 1.0), (0, 26, tip - 12), 1.2, 'iron'),
          rod('bar', (-31, 26, tip), (31, 26, tip), 1.4, 'iron'),
          lathe('knob', [(0, 0), (1.6, 0), (2.4, 1.2), (2.4, 3.6), (1.6, 4.8), (0, 4.8)], 12, 'iron', at=(0, 23.6, tip + 3)),
          *[rod('hanger', (x, 19, tip), (x, 26, tip), 0.8, 'iron') for x in (-24, 24)])
    return finish(ob)


def lantern():
    """The street lamp's lantern (its iron; the glass is the game's): a turned base, four corner bars, a ring and a pointed cap."""
    ob = lathe('lantern', [(0, 0), (6.8, 0), (7.2, 0.4), (7.2, 1.6), (6.6, 2.4), (0, 2.4)], 16, 'iron')
    union(ob, lathe('ring', [(0, 19), (7.6, 19), (8, 19.4), (8, 20.8), (7.6, 21.2), (0, 21.2)], 16, 'iron'),
          lathe('cap', [(0, 21.0), (7.2, 21.0), (7.6, 21.4), (2.0, 29.2), (1.4, 30.2), (2.0, 31.4), (0, 32.8)], 16, 'iron'),
          # (Each bar stands on the base's flat top and runs up into the ring.)
          *[block('bar', x * 5.2 - 0.8, 2.2, z * 5.2 - 0.8, x * 5.2 + 0.8, 19.2, z * 5.2 + 0.8, 'iron', 0.3) for x in (-1, 1) for z in (-1, 1)])
    return finish(ob)


def oven_dome():
    """The bread oven's clay dome, six cells by three, and its flue: a pipe rising out of it, turning in a mitred elbow into the wall."""
    X, Z, H = half(6), half(3), 52
    # (Turned finely: where the flue comes out of it, its faces are small enough to take the fillet.)
    prof = [(0, 0), (1, 0)] + [(math.cos(t), math.sin(t)) for t in (math.pi / 2 * k / 14 for k in range(1, 14))] + [(0, 1)]
    ob = lathe('ovenDome', [(r * X, y * H) for r, y in prof], 48, 'clay', squash=(1, Z / X))
    union(ob, elbow('flue', 30, -10, 31.2, 73.5, X, 6.5, 'flue'))
    return finish(ob)


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    props = [counter(), table(3), table(4), bench(), stool(), shelves(), wardrobe(), chest(), bed(), *[window_box(w) for w in (2, 3, 4)],
             sign(), sign_bracket(), lantern(), oven_dome()]
    keep = set(props) | {c for p in props for c in p.children}
    for ob in list(bpy.data.objects):
        if ob not in keep:
            remove(ob)
    # Each prop stands apart in the file, four metres along from the last (the game takes each from where it stands).
    for i, ob in enumerate(props):
        ob.location = (4.0 * i, 0, 0)
    bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=False, export_apply=True, export_yup=True, export_texcoords=False,
                              export_normals=True, export_materials='EXPORT', export_cameras=False, export_extras=False, export_animations=False,
                              export_skins=False, export_morph=False)
    for ob in sorted(keep, key=lambda o: o.name):
        ob.data.calc_loop_triangles()
        print(f'kit prop {ob.name}: {len(ob.data.loop_triangles)} triangles, {[m.name for m in ob.data.materials]}')
    print('kit props written to', OUT, os.path.getsize(OUT) // 1024, 'KB')


main()
