"""Dragons: Drakeling (minion), Cinderwing (boss) and the Ember Whelp pet.

Blocky, modular build: bodies are stacked chamfered slabs (hips, belly, chest, withers), necks and tails are
chains of shrinking boxes (Cinderwing's tail one smooth eight-sided taper cut into mitred segments), heads are a box
skull with a tapered snout and jaw (the drakeling's carved as one solid), legs are box segments standing in paws whose
claws grow out of the toes, horns are angled wedge segments. Only the bat-wing membranes, the whelp's flame and the
glowing cracks are flat faceted panels; the parts are built by dragon_parts.py. The drakeling and Cinderwing follow their
approved concept sheets (docs/concepts). Faces +Z; right-side parts (legFR/legBR/wingR) at -X, left at +X. Rig names match
src/render/anim.ts: body, neck1.., head, jaw, tail1.., wingL/wingR, legFL/legFR/legBL/legBR, all under a
scaled 'inner' empty (the animation's flight lift and bob are in that scaled space).
"""
import math
import os
import sys

# Repo root: DRAGONBOUND_ROOT, else two levels above this script (when run as a file), else the old fixed path.
_ROOT = os.environ.get('DRAGONBOUND_ROOT') or (os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
                                               if '__file__' in globals() else r'D:\gameplanning')
sys.path.insert(0, os.path.join(_ROOT, 'tools', 'blender'))
import importlib
import _common
importlib.reload(_common)
from _common import *
import dragon_parts
importlib.reload(dragon_parts)
from dragon_parts import *


# ─── Drakeling (docs/concepts/drakeling.jpg) ──────────────────────────────────

def drakeling():
    """A young red dragon in a harness, as chunky as its sheet: a short, deep head, a thick neck, a broad barrel body on
    short thick legs, in bright red chamfered blocks; a cream jaw, throat, chest scutes and belly, dark red brow lines,
    plates, pads and wing bones, cream horns and claws, a leather girth and breast collar with gilt buckles and hexagonal
    gilt shoulder plates, a pouch on the left flank, raised wings with gilt caps and an arrowhead tail with a gilt band."""
    main, dark, cream, horn_col = 0xCF3826, 0x861E1A, 0xE8C48E, 0xF2E2C4
    skin, gold, leather, pouch = 0xB42A20, 0xE6A83A, 0x5E3B26, 0x7A5036
    scene, root = fresh_scene('DB_drakeling')
    inner = pivot(root, 'inner')
    inner.scale = (0.8, 0.8, 0.8)
    # Short, thick legs under a deep barrel: heavy shoulders and thighs, chunky forearms and shins, big paws with big
    # cream claws, as on its sheet. The forelegs stand at the chest's sides, so the cream breast shows between them.
    for name, x, z, back in (('legFL', 0.34, 0.3, False), ('legFR', -0.34, 0.3, False), ('legBL', 0.33, -0.44, True), ('legBR', -0.33, -0.44, True)):
        limb(inner, name, (x, 0.88, z), main, dark, horn_col, r=1.0, back=back, claw_k=1.2, girth=1.6, paw_r=1.5)

    body = pivot(inner, 'body', (0, 1.12, 0))
    box(body, (0.74, 0.66, 0.5), (0, 0.05, -0.47), main, bevel=0.08)                    # hips
    box(body, (0.86, 0.78, 0.62), (0, 0.03, -0.05), main, bevel=0.09)                   # belly barrel
    box(body, (0.86, 0.88, 0.5), (0, 0.1, 0.34), main, rot=(-0.15, 0, 0), bevel=0.09)   # deep chest
    # Cream underside: scutes down the chest's front below the throat, the last turning under it, and a belly plate.
    yd = Vector((0, 0.989, -0.149))   # the chest's local Y (it is turned -0.15 about X); its front face is at local z 0.25
    zd = Vector((0, 0.149, 0.989))
    C = lambda x, y, z: Vector((x, 0.1, 0.34)) + yd * y + zd * z
    wrap = lambda *a, **k: chest_band(body, C, 0.25, *a, **k)
    wrap(-0.03, -0.21, 0.52, 0.06, cream)
    wrap(-0.17, -0.33, 0.46, 0.05, cream)
    wrap(-0.29, -0.44, 0.4, 0.03, cream, lift=(0.03, -0.1))
    box(body, (0.5, 0.06, 0.74), (0, -0.37, -0.07), cream, bevel=0.02)
    for z, y, h in ((0.28, 0.53, 0.2), (0.04, 0.44, 0.19), (-0.2, 0.43, 0.18), (-0.44, 0.39, 0.17), (-0.66, 0.34, 0.15)):
        dorsal(body, (0, y, z), h, 0.1, 0.1, 0.26, dark, taper=(0.6, 0.42))                             # dark plates down the back

    # Harness: a girth behind the forelegs, a breast collar across the chest and straps between them along the sides,
    # gilt buckles where they meet, a hexagonal gilt shoulder plate each side and a pouch hanging on the left flank.
    box(body, (0.9, 0.84, 0.11), (0, 0.03, 0.02), leather, bevel=0.02)                                    # girth
    wrap(0.0, -0.1, 0.62, 0.12, leather, lift=(0.075, 0.075), thick=0.06, shrink=1.0)                       # collar
    obox(body, (0.15, 0.15, 0.05), C(0, -0.05, 0.34), (1, 0, 0), yd, gold)                                 # buckle
    obox(body, (0.07, 0.07, 0.05), C(0, -0.05, 0.355), (1, 0, 0), yd, leather)
    for s in (-1, 1):
        box(body, (0.03, 0.1, 0.58), (s * 0.44, 0.08, 0.25), leather, bevel=0)                             # side strap
        box(body, (0.03, 0.14, 0.15), (s * 0.455, 0.08, 0.02), gold, bevel=0)                              # strap buckle
        box(body, (0.03, 0.07, 0.07), (s * 0.463, 0.08, 0.02), leather, bevel=0)
        hex_plate(body, (s * 0.43, 0.24, 0.4), (s, 0.2, 0), 0.19, gold, dark)                             # shoulder plate
    box(body, (0.08, 0.22, 0.22), (0.47, -0.1, -0.2), pouch, bevel=0)                                      # pouch
    box(body, (0.09, 0.08, 0.23), (0.475, 0.025, -0.2), leather, bevel=0)                                 # its flap
    box(body, (0.03, 0.08, 0.08), (0.516, -0.04, -0.2), gold, bevel=0)                                    # gilt clasp
    box(body, (0.03, 0.04, 0.04), (0.522, -0.04, -0.2), leather, bevel=0)

    def neck(n, i):
        beam(n, (0, 0, -0.14), (0, 0, 0.34), 0.56, 0.58, main, taper=(0.92, 0.92), bevel=0.06)
        box(n, (0.4, 0.09, 0.44), (0, -0.265, 0.1), cream, bevel=0.015)                      # cream throat plate
        for z, h in ((-0.02, 0.21), (0.22, 0.19)):
            dorsal(n, (0, 0.27, z), h, 0.1, 0.1, 0.24, dark, taper=(0.6, 0.42))                            # dark plates up the neck
    # A thick neck rising steeply out of the chest, its cream throat running down into the cream breast, so the head is
    # carried high over the chest.
    last = segments(body, 'neck', 2, (0, 0.34, 0.37), (0.28,), (-1.05, -0.15), neck)

    # The head sits forward on the neck's end, so the neck's top runs into the back of the skull, behind the jaw.
    head = pivot(last, 'head', (0, -0.09, 0.42), (0.85, 0, 0))
    # The head after its sheet, one solid with nothing stuck on: a short, deep wedge. A tall cranium under a heavy
    # brow block, and a snout whose top slopes down from the brow to a blunt nose with two square nostrils cut into its
    # front, its top edges cut back in broad facets. An eye socket is sunk into each side under the brow, so the eye
    # reads from the side only (the cranium's side stands in front of it); a dark brow line runs along the top of the
    # socket. A deep cream jaw closes under the snout and runs back under the cheek into the throat.
    X, Y = Vector((1, 0, 0)), Vector((0, 1, 0))
    K = 1.15   # the head's build, in the units below
    k3 = lambda *p: tuple(K * c for c in p)

    def wedge(z, w, y0, y1, c):   # snout section: straight sides, flat underside, its top corners cut by c
        a = w / 2
        return [Vector(k3(*p)) for p in ((-a, y0, z), (a, y0, z), (a, y1 - c, z), (a - c, y1, z), (c - a, y1, z), (-a, y1 - c, z))]
    skull = box(head, k3(0.5, 0.38, 0.46), k3(0, 0.17, -0.05), main, bevel=0.05)                    # cranium
    brow = box(head, k3(0.56, 0.14, 0.34), k3(0, 0.34, 0.03), main, bevel=0.045, taper=(0.96, 0.62))  # brow block
    snout = loft(head, [wedge(0.1, 0.42, -0.01, 0.29, 0.1), wedge(0.52, 0.32, 0.0, 0.19, 0.07)], main)
    union(skull, brow, snout)
    carve(skull, *[box(head, k3(0.2, 0.15, 0.14), k3(s * 0.3, 0.2, 0.07), main, bevel=0) for s in (-1, 1)],     # sockets
          *[box(head, k3(0.05, 0.045, 0.08), k3(s * 0.07, 0.12, 0.52), main, bevel=0) for s in (-1, 1)])          # nostrils
    box(head, k3(0.3, 0.009, 0.42), k3(0, -0.005, 0.3), MOUTH, bevel=0)                   # roof of the mouth
    for s in (-1, 1):
        box(head, k3(0.05, 0.045, 0.012), k3(s * 0.07, 0.12, 0.486), MOUTH, bevel=0)      # in the nostril
        box(head, k3(0.012, 0.15, 0.14), k3(s * 0.206, 0.2, 0.07), 0x3A0C08, bevel=0)    # socket floor, dark
        box(head, k3(0.05, 0.03, 0.15), k3(s * 0.225, 0.26, 0.07), dark, bevel=0.007)   # brow line along its top
        prism(head, [(-0.064, -0.036), (-0.064, 0.036), (-0.034, 0.07), (0.034, 0.07), (0.064, 0.036), (0.064, -0.036),
                     (0.034, -0.07), (-0.034, -0.07)], 0.014, k3(s * 0.216, 0.195, 0.072), 0xF6BA38,
              rot=(0, s * PI / 2, 0), emissive=0xF0A020, strength=0.5)                   # the eye
        prism(head, [(0, 0.06), (0.014, 0), (0, -0.06), (-0.014, 0)], 0.009, k3(s * 0.224, 0.195, 0.082), 0x1A0A06,
              rot=(0, s * PI / 2, 0))                                                  # its slit pupil
        horn(head, [k3(s * 0.16, 0.36, -0.1), k3(s * 0.21, 0.51, -0.29), k3(s * 0.26, 0.64, -0.49)], 0.15 * K, horn_col, tip=0.12)
    jaw = pivot(head, 'jaw', k3(0, 0.0, 0.06))
    loft(jaw, [oct_ring(k3(0, -0.1, -0.32), X, Y, 0.5 * K, 0.26 * K, 0.16), oct_ring(k3(0, -0.075, 0.12), X, Y, 0.42 * K, 0.17 * K, 0.16),
               oct_ring(k3(0, -0.06, 0.42), X, Y, 0.32 * K, 0.13 * K, 0.16)], cream)
    box(jaw, k3(0.28, 0.008, 0.38), k3(0, 0.004, 0.2), MOUTH, bevel=0)                   # floor of the mouth

    # Tail: three thick segments tapering from the hips, a cream underside and dark plates along the top, then a dark
    # cuff, a gilt band and a red arrowhead.
    TW = (0.56, 0.45, 0.35, 0.27)   # width at each joint, root to the cuff
    TL = (0.36, 0.34, 0.32)

    def tail(t, i):
        w0, w1, L = TW[i - 1], TW[i], TL[i - 1]
        beam(t, (0, 0, 0.12), (0, 0, -L - 0.04), w0, w0 * 0.92, main, taper=(w1 / w0, w1 / w0), bevel=0.04)
        beam(t, (0, -w0 * 0.43, 0.08), (0, -w1 * 0.43, -L - 0.04), w0 * 0.62, 0.06, cream, taper=(w1 / w0, 1))  # cream underside
        for k in (0.22, 0.68):
            dorsal(t, (0, w0 * 0.43 - (w0 - w1) * 0.4 * k, -k * L), 0.17 - i * 0.025 - 0.02 * k, 0.08, 0.09, 0.2, dark, taper=(0.6, 0.42))
    # It droops from the hips and lifts toward the arrowhead.
    last = segments(body, 'tail', 3, (0, 0.06, -0.62), [-v for v in TL[:-1]], (-0.4, 0.15, 0.3), tail)
    e = -TL[-1]
    box(last, (0.24, 0.22, 0.12), (0, 0, e - 0.1), dark, bevel=0.01)                                # cuff
    box(last, (0.29, 0.26, 0.05), (0, 0, e - 0.03), gold, bevel=0)                                  # gilt band
    beam(last, (0, 0, e - 0.14), (0, 0.03, e - 0.58), 0.32, 0.17, main, taper=(0.04, 0.1))        # arrowhead
    for s in (-1, 1):
        beam(last, (s * 0.08, 0, e - 0.12), (s * 0.25, 0.0, e - 0.28), 0.09, 0.08, dark, taper=(0.2, 0.3))   # its barbs

    for side, s in (('L', 1), ('R', -1)):
        # Rooted on the shoulder tops, wide enough apart that the gilt wrist caps clear each other at the top of the flight
        # flap even though the wings stand raised; the leading finger points up and back, as on its sheet.
        raised_wing(body, side, (s * 0.4, 0.44, 0.22), 1.65, dark, skin, gold, horn_col, (s * 0.26, 0.42, -0.42), thick=0.82, tilt=0.45,
                    raise_=0.08, tips=((0.88, 0.66, -0.5), (0.84, 0.24, -0.82), (0.52, 0.0, -0.96)))
    finish('DB_drakeling', 'drakeling.glb')


# ─── Cinderwing: the boss (docs/concepts/cinderwing.jpg) ─────────────────────

def cinderwing():
    """The boss: a heavy dark oxblood dragon with a furnace inside, glowing through zigzag cracks down the throat and
    across the chest, flanks and legs; an ivory breastplate in a leather harness with gilt buckles and saddle packs;
    bright red crystals down the spine and tail; ivory horns and cheek spikes in gilt bands; one glowing eye a side
    under a dark brow; big raised wings with gilt bones and edges; gilt ankle bands and an ivory tail spike."""
    import random
    rng = random.Random(11)
    main, dark, ivory, crystal = 0x5A2422, 0x3A1715, 0xE4D8BE, 0xC21C1E
    skin, gold, leather, glow = 0x4A2220, 0xD9A040, 0x5A361E, 0xFFB848
    scene, root = fresh_scene('DB_cinderwing')
    inner = pivot(root, 'inner')
    inner.scale = (2.4, 2.4, 2.4)
    # Thick, short legs set wide under a massive barrel chest, big rounded shoulders and haunches.
    for name, x, z, back in (('legFL', 0.58, 0.44, False), ('legFR', -0.58, 0.44, False), ('legBL', 0.56, -0.56, True), ('legBR', -0.56, -0.56, True)):
        limb(inner, name, (x, 0.95, z), main, dark, ivory, r=1.8 if back else 1.9, back=back, toe=dark, gilt=gold, glow=glow, rng=rng,
             girth=1.3, paw_r=2.2 if back else 2.35)

    body = pivot(inner, 'body', (0, 1.21, 0))
    built = set(body.children)
    box(body, (1.0, 0.8, 0.6), (0, 0.06, -0.6), main, bevel=0.12)                      # hips
    box(body, (1.2, 0.98, 0.72), (0, 0.06, -0.08), main, bevel=0.12)                   # belly block
    box(body, (1.3, 1.16, 0.72), (0, 0.16, 0.42), main, rot=(-0.18, 0, 0), bevel=0.14)  # barrel chest
    box(body, (0.86, 0.6, 0.46), (0, 0.5, 0.62), main, rot=(-0.55, 0, 0), bevel=0.1)   # withers into the neck
    for s in (-1, 1):
        box(body, (0.4, 0.66, 0.74), (s * 0.62, 0.2, 0.42), main, rot=(-0.18, 0, 0), bevel=0.15)   # rounded shoulder
        box(body, (0.38, 0.7, 0.74), (s * 0.56, 0.06, -0.6), main, bevel=0.15)                    # rounded haunch
    yd, zd = Vector((0, 0.984, -0.179)), Vector((0, 0.179, 0.984))   # the chest's local Y and Z (it is turned -0.18 about X)
    C = lambda x, y, z: Vector((x, 0.16, 0.42)) + yd * y + zd * z     # a point in the chest's frame (its front face at z 0.36)

    wrap = lambda *a, **k: chest_band(body, C, 0.36, *a, **k)

    # The chest after its sheet: the furnace glows through cracks down the throat, and below it ivory scutes wrap round
    # the front of the chest from under the neck down between the forelegs, narrowing as they go, each plate's lower edge
    # standing proud over the next (the lower ones stay clear of the swinging forelegs); the last turns under the chest
    # along its lower edge and more carry on under the belly, so the ivory runs on unbroken. Cracks in the upper chest,
    # under the neck's root, glow when the neck rears back to breathe.
    wrap(0.06, -0.17, 0.64, 0.2, ivory)
    wrap(-0.13, -0.34, 0.54, 0.08, ivory)
    wrap(-0.3, -0.48, 0.42, 0.05, ivory)
    wrap(-0.44, -0.6, 0.36, 0.03, ivory, lift=(0.03, -0.1))
    for k, z in enumerate((0.56, 0.24, -0.08)):
        box(body, (0.38 - 0.04 * k, 0.07, 0.36), (0, -0.445, z), ivory, rot=(-0.08, 0, 0), bevel=0.02)  # belly scutes
    crng = random.Random(5)   # its own stream, so the cracks elsewhere keep their shapes
    for x, ux, length, w, branches in ((-0.04, 0.12, 0.3, 0.05, 2), (-0.26, -0.5, 0.22, 0.038, 1), (0.22, 0.45, 0.24, 0.038, 1)):
        crack(body, C(x, 0.42, 0.36), Vector((ux, 0, 0)) - yd, zd, length, w, crng, steps=4, branches=branches, color=glow)
    for z, y, h in ((0.5, 0.74, 0.28), (0.12, 0.6, 0.27), (-0.22, 0.55, 0.25), (-0.5, 0.46, 0.22), (-0.78, 0.42, 0.18)):
        dorsal(body, (0, y, z), h, 0.06, 0.15, 0.25, crystal)                          # red crystals down the spine
    # Furnace cracks across each shoulder, flank and haunch.
    for s in (-1, 1):
        crack(body, (s * 0.825, 0.3, 0.6), (0, -0.5, -1), (s, 0, 0), 0.36, 0.05, rng, steps=4, color=glow)
        crack(body, (s * 0.606, 0.0, 0.26), (0, 0.3, -1), (s, 0, 0), 0.3, 0.045, rng, steps=3, branches=0, color=glow)
        crack(body, (s * 0.756, 0.2, -0.4), (0, -0.5, -1), (s, 0, 0), 0.32, 0.04, rng, steps=3, branches=0, color=glow)
    # Harness: a girth behind the forelegs; a breast strap wrapping the scutes, with a square gilt buckle (a raised boss in
    # a gilt plate) at each front corner, its ends running back under the shoulders; and a saddle pack on each flank
    # behind the girth, below the wing.
    box(body, (1.24, 1.1, 0.13), (0, 0.06, 0.04), leather, bevel=0.03)                                     # girth
    wrap(-0.115, -0.235, 0.6, 0.16, leather, lift=(0.08, 0.08), thick=0.06, shrink=1.0)                    # breast strap
    for s in (-1, 1):
        n = Vector((s * 0.38, 0, 0.92))                                    # halfway round the strap's corner (chest frame)
        out = (n.x * Vector((1, 0, 0)) + n.z * zd).normalized()
        across = (n.z * Vector((1, 0, 0)) - n.x * zd).normalized()
        at = C(s * 0.3, -0.175, 0.44) + out * 0.005
        obox(body, (0.17, 0.05, 0.17), at, across, out, gold, bevel=0.012)                               # buckle plate
        obox(body, (0.085, 0.05, 0.085), at + out * 0.04, across, out, gold, taper=(0.35, 0.35))        # its boss
        box(body, (0.04, 0.17, 0.17), (s * 0.635, 0.24, 0.04), gold, bevel=0)                            # girth buckle
        box(body, (0.04, 0.08, 0.08), (s * 0.645, 0.24, 0.04), leather, bevel=0)
        box(body, (0.14, 0.32, 0.28), (s * 0.62, 0.08, -0.2), leather, bevel=0.02)                      # saddle pack
        box(body, (0.15, 0.1, 0.29), (s * 0.625, 0.23, -0.2), 0x4A2A16, bevel=0)                        # its flap
        for z in (-0.27, -0.13):
            box(body, (0.03, 0.08, 0.06), (s * 0.7, 0.13, z), gold, bevel=0)                            # gilt clasps
            box(body, (0.03, 0.04, 0.03), (s * 0.706, 0.13, z), leather, bevel=0)
    # The torso, harness and all, grown as one to the sheet's massive build: broader and deeper, a little longer.
    G = (1.18, 1.1, 1.04)
    inflate(body, built, G)
    g = lambda x, y, z: (x * G[0], y * G[1], z * G[2])

    def neck(n, i):
        w = 0.48 - i * 0.035
        beam(n, (0, 0, -0.14), (0, 0, 0.42), 2 * w, 2 * w, main, taper=((w - 0.035) / w,) * 2, bevel=0.05)
        dorsal(n, (0, w - 0.01, 0.1), 0.22, 0.05, 0.12, 0.22, crystal)
        k = 0.035 / 0.56   # the neck's faces lean in as it tapers; the cracks lie along them
        if i < 3:   # a crack running up the throat, and one up a side
            trunk = []
            crack(n, (0.03, -w + 0.003 + k * 0.04, -0.1), (0, k, 1), (0, -1, k), 0.5, 0.042, rng, steps=4, branches=0,
                  color=glow, path=trunk)
            s = 1 if i == 1 else -1
            crack(n, (s * (w - 0.003 - k * 0.16), -w * 0.6, 0.02), (-s * k, 0.45, 1), (s, 0, k), 0.36, 0.035, rng, steps=3,
                  branches=0, color=glow)
        if i == 1:  # and forks off the throat crack over the top scute, so the furnace glows through a network, as on the sheet
            for j, s in ((1, -1), (2, 1), (3, -1)):
                p = trunk[j]
                crack(n, (p.x, -w + 0.003 + k * (p.z + 0.14), p.z), (s * 0.85, k, 1), (0, -1, k), 0.4 - 0.05 * j, 0.034, crng,
                      steps=3, branches=1 if j < 3 else 0, color=glow)
    # A short, thick neck rises out of the top of the chest, so the head is carried close over it and the scutes show under it.
    last = segments(body, 'neck', 3, g(0, 0.6, 0.62), (0.32, 0.32, 0.32), (-0.55, -0.25, -0.05), neck)

    head = pivot(last, 'head', (0, 0.02, 0.38), (0.2, 0, 0))
    # Skull built round the eye sockets, as the drakeling's: core, back of the head, cheek, front wall, brow ridge.
    box(head, (0.56, 0.46, 0.6), (0, 0.14, 0.0), main, bevel=0.05)                    # core (eye floor at |x| 0.28)
    box(head, (0.65, 0.42, 0.34), (0, 0.15, -0.13), main, bevel=0.05)                 # back of the head
    box(head, (0.65, 0.17, 0.36), (0, 0.0, 0.2), main, bevel=0.04)                    # cheek
    box(head, (0.64, 0.17, 0.08), (0, 0.17, 0.35), main, bevel=0)                     # wall in front of the eye
    beam(head, (0, 0.13, 0.26), (0, 0.1, 0.86), 0.52, 0.28, main, taper=(0.84, 0.82), bevel=0.04)  # snout
    box(head, (0.36, 0.02, 0.5), (0, 0.008, 0.55), 0xE8601C, bevel=0, emissive=0xC03A0A, strength=1.2)  # molten roof of the mouth
    for s in (-1, 1):
        beam(head, (s * 0.255, 0.31, -0.04), (s * 0.26, 0.29, 0.4), 0.15, 0.09, dark, taper=(0.7, 0.6), bevel=0.02)  # brow ridge
        eye(head, s, 0.28, 0.17, 0.175, 0.11, 0.22, 0xFF8A1C, 0x140806, 0x1A0806, glow=0xFF5A08, strength=1.4)
        box(head, (0.08, 0.02, 0.02), (s * 0.1, 0.05, 0.865), MOUTH, bevel=0)            # nostril: a low slit
        horn(head, [(s * 0.235, 0.04, 0.72), (s * 0.235, -0.08, 0.73)], 0.045, ivory)    # upper fang
        dorsal(head, (s * 0.13, 0.37, 0.14), 0.13, 0.03, 0.08, 0.14, crystal)             # red crystal crest, in front of the horns
        a, m, b = Vector((s * 0.18, 0.34, -0.1)), Vector((s * 0.3, 0.7, -0.44)), Vector((s * 0.38, 0.98, -0.86))
        horn(head, [a, m, b], 0.29, ivory, tip=0.1)                                       # great horn
        band(head, a, m, 0.62, 0.29 * 0.72, 0.29 * 0.72, gold, length=0.1)
        for (base, tip), w in ((((0.3, 0.22, -0.2), (0.6, 0.36, -1.02)), 0.21), (((0.31, 0.05, -0.18), (0.55, 0.02, -0.74)), 0.14),
                               (((0.29, -0.1, -0.12), (0.48, -0.2, -0.56)), 0.11)):
            base, tip = Vector((s * base[0], base[1], base[2])), Vector((s * tip[0], tip[1], tip[2]))
            horn(head, [base, tip], w, ivory, tip=0.15)                                    # swept-back cheek horns
            band(head, base, tip, 0.4, w * 0.75, w * 0.75, gold, length=0.06)
    jaw = pivot(head, 'jaw', (0, -0.06, 0.22))
    beam(jaw, (0, -0.02, -0.4), (0, -0.012, 0.62), 0.5, 0.15, main, taper=(0.82, 0.8), bevel=0.03)
    box(jaw, (0.32, 0.02, 0.54), (0, 0.048, 0.27), 0xE8601C, bevel=0, emissive=0xC03A0A, strength=1.2)   # molten floor of the mouth

    # Tail: six segments in one smooth taper from the hips to a fine tip, eight-sided with a flat top. Each segment
    # starts the size the one before ends and the joints are mitred (both ends cut on the plane halfway between the two
    # segments), so at rest it reads as one tapering piece; a sleeve at each segment's root, inside the one before, fills
    # the joint when the tail swings. It droops from the hips and lifts toward the tip, red crystals stand along its top,
    # shrinking toward the tip, and it ends in a gilt cuff and an ivory spike.
    TW = (0.64, 0.54, 0.45, 0.37, 0.3, 0.235, 0.175)   # width at each joint, root to tip (height 0.86 of it)
    TL = (0.42, 0.4, 0.38, 0.36, 0.34, 0.32)
    TR = (-0.5, 0.15, 0.2, 0.2, 0.17, 0.13)            # each segment's turn from the one before (about X)
    X, Y = Vector((1, 0, 0)), Vector((0, 1, 0))

    def section(z, w, cut=0.0):   # the section w wide at depth z, on a plane tilted `cut` radians about X
        return [p + Vector((0, 0, p.y * math.tan(cut))) for p in oct_ring((0, 0, z), X, Y, w, w * 0.86, 0.3)]

    def tail(t, i):
        w0, w1, L = TW[i - 1], TW[i], TL[i - 1]
        sleeve = section(0.22 if i == 1 else 0.5 * w0, w0 * 0.9)
        loft(t, [sleeve, section(0, w0, -TR[i - 1] / 2 if i > 1 else 0.0), section(-L, w1, TR[i] / 2 if i < 6 else 0.0)], main)
        wm = (w0 + w1) / 2
        dorsal(t, (0, 0.43 * wm - 0.005, -L * (0.62 if i == 6 else 0.5)), 0.08 + 0.45 * wm, 0.07, 0.03 + 0.36 * wm, 0.45 * L,
               crystal)
    last = segments(body, 'tail', 6, g(0, 0.1, -0.84), [-v for v in TL[:-1]], TR, tail)
    e, we = -TL[-1], TW[-1]
    loft(last, [section(e + 0.035, we * 1.24), section(e - 0.065, we * 1.24)], gold)                     # gilt cuff
    # A chunky faceted spike, as wide as the cuff where it leaves it and swelling a little before it narrows to a point.
    loft(last, [section(e - 0.03, we * 1.2), section(e - 0.13, we * 1.22), [Vector((0, 0.012, e - 0.44))]], ivory)

    for side, s in (('L', 1), ('R', -1)):
        raised_wing(body, side, g(s * 0.44, 0.6, 0.24), 2.3, dark, skin, gold, ivory, g(s * 0.36, 0.43, -0.62), thick=0.75,
                    edge=gold, lift=1.1)
    finish('DB_cinderwing', 'cinderwing.glb')


# ─── Ember Whelp: the chibi pet ──────────────────────────────────────────────

def whelp():
    main, dark, belly, cream, skin = 0xFF8A2A, 0xD8601C, 0xFFD27A, 0xFFF0C8, 0xFFB45C
    scene, root = fresh_scene('DB_whelp')
    inner = pivot(root, 'inner')
    inner.scale = (0.42, 0.42, 0.42)
    for name, x, z in (('legFL', 0.22, 0.24), ('legFR', -0.22, 0.24), ('legBL', 0.25, -0.2), ('legBR', -0.25, -0.2)):
        l = pivot(inner, name, (x, 0.36, z))
        box(l, (0.24, 0.3, 0.26), (0, -0.13, 0), main, bevel=0.05)             # stubby leg
        box(l, (0.28, 0.14, 0.34), (0, -0.29, 0.05), main, bevel=0.04)         # foot, sole on the ground
        for k in (-1, 0, 1):
            box(l, (0.06, 0.06, 0.05), (k * 0.08, -0.32, 0.23), cream, bevel=0.01)  # toe nubs

    body = pivot(inner, 'body', (0, 0.66, 0))
    box(body, (0.7, 0.64, 0.84), (0, 0, 0), main, bevel=0.1)
    box(body, (0.5, 0.46, 0.66), (0, -0.1, 0.1), belly, bevel=0.08)  # belly patch showing under and in front
    for i in range(3):  # three soft back nubs
        box(body, (0.09, 0.1, 0.12), (0, 0.33 - i * 0.02, 0.06 - i * 0.18), dark, bevel=0.02)

    def neck(n, i):
        box(n, (0.44, 0.42, 0.36), (0, -0.01, 0.05), main, bevel=0.07)
    last = segments(body, 'neck', 2, (0, 0.2, 0.3), (0.1, 0.1), (-0.35, -0.35), neck)

    # Head sits down on the short neck (no gap under the chin in profile).
    head = pivot(last, 'head', (0, -0.03, 0.0), (0.4, 0, 0))
    box(head, (0.72, 0.64, 0.66), (0, 0.2, 0.08), main, bevel=0.1)       # big cube head
    box(head, (0.44, 0.26, 0.24), (0, 0.06, 0.4), main, bevel=0.06)      # short square snout
    for s in (-1, 1):
        # Big square eyes on the face: white square, a large dark pupil set slightly in, a white catch-light.
        box(head, (0.2, 0.22, 0.03), (s * 0.17, 0.33, 0.415), 'white', bevel=0.01)
        box(head, (0.13, 0.16, 0.03), (s * 0.15, 0.31, 0.43), 0x24160F, bevel=0)
        box(head, (0.05, 0.05, 0.02), (s * 0.18, 0.36, 0.45), 'white', bevel=0)
        box(head, (0.1, 0.05, 0.02), (s * 0.27, 0.17, 0.415), 0xFF6A4A, bevel=0)  # blush
        box(head, (0.04, 0.03, 0.02), (s * 0.07, 0.12, 0.525), 0x8A3A14, bevel=0)  # nostril
        beam(head, (s * 0.14, 0.5, -0.02), (s * 0.19, 0.66, -0.1), 0.1, 0.1, cream, taper=(0.6, 0.6), bevel=0.015)  # nub horn
    jaw = pivot(head, 'jaw', (0, 0.0, 0.26))
    box(jaw, (0.36, 0.08, 0.24), (0, -0.07, 0.1), belly, bevel=0.02)

    def tail(t, i):
        r = 0.15 - i * 0.035
        beam(t, (0, 0, 0.06), (0, 0, -0.26), 2 * r, 2 * r, main, taper=(0.75, 0.75), bevel=0.02)
    last = segments(body, 'tail', 3, (0, -0.02, -0.38), (-0.17, -0.15), (0.15, 0.55, 0.8), tail)
    # Flame tuft: a bright core and two licks splaying out, pointing on along the tail.
    for d, r, h, col in (((0, 0, -1), 0.08, 0.26, 0xFFD040), ((0.5, 0.1, -1), 0.055, 0.18, 0xFF8A20), ((-0.5, 0.1, -1), 0.055, 0.18, 0xFF8A20)):
        a = Vector((0, 0, -0.2))
        beam(last, a, a + Vector(d).normalized() * h, 2 * r, 2 * r, col, taper=(0.1, 0.1), emissive=col, strength=2.5)

    for side, s in (('L', 1), ('R', -1)):
        bat_wing(body, side, (s * 0.2, 0.24, 0.06), 0.6, dark, skin, cream, fingers=3, raise_=0.4, thick=1.5, scallop_depth=0.3)
    finish('DB_whelp', 'whelp.glb')


for _build in (drakeling, cinderwing, whelp):   # DB_ONLY = ['drakeling'] exports only those
    if _build.__name__ in (globals().get('DB_ONLY') or ('drakeling', 'cinderwing', 'whelp')):
        _build()
result = {'ok': True}
