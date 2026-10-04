"""The hand-built uniques: the Wyrmbone set. Not run on its own: gear.py runs it in its own namespace (after the
plate kit, the arms and the bows and staffs it builds on), and its pieces are listed in gear.py's GEAR like the rest."""


# ─── Uniques: the Wyrmbone set ───────────────────────────────────────────────
# Every unique is cut from one dead wyrm: pale dragon BONE as the big shapes, OBSIDIAN-black plate under it, and one
# ember glow per piece (the skull's eyes and mouth, the crown's gem, the fang's molten core, the burning string, the
# staff's heart). The inverse of Emberforged (blackened steel with thin ember seams): light over dark, so the two
# never read alike. One strong silhouette idea per piece, big clean shapes, no scales, pouches or tassets.
# Own authored colours; obsidian parts are metallic() so the game gives them the forged-metal finish, and bone is
# painted as bone (registry.ts fixedPaint).
BONE = 0xDDCFAF           # pale dragon bone
BONE_DK = 0xBCA987        # bone in shade: the lower jaw, horn roots
OBSIDIAN = 0x2A2530       # the black plate under the bone
GRIP = 0x3E2218           # dark oxblood leather grips and belt
SOCKET = 0x140E0E         # eye sockets
EMBER = 0xFF6A1A
EMBER_HOT = 0xFFC050


def obsidian():
    return metallic(OBSIDIAN)


def dragon_skull(f):
    """A dragon's skull on frame f with its snout along local +X: a broad cranium block, a snout tapering out of
    it over a slightly open lower jaw with an ember glow between them, two fangs at the tip, heavy brows over
    burning eye sockets on both sides and two horns swept back level along the cranium (upright horns read as ears)."""
    box(f, (0.38, 0.24, 0.4), (0, 0, 0), BONE, bevel=0.06)                                          # cranium
    beam(f, (0.13, -0.01, 0), (0.56, -0.06, 0), 0.16, BONE, w1=0.1, d=0.3, d1=0.2, bevel=0.03)     # snout
    beam(f, (0.1, -0.13, 0), (0.5, -0.21, 0), 0.06, BONE_DK, w1=0.05, d=0.26, d1=0.16, bevel=0.015)  # lower jaw
    beam(f, (0.16, -0.1, 0), (0.5, -0.15, 0), 0.035, EMBER, w1=0.06, d=0.22, d1=0.13, bevel=0,
         emissive=EMBER, strength=3)                                                                # smoulder in the mouth
    for z in (-0.07, 0.07):
        beam(f, (0.5, -0.1, z), (0.52, -0.21, z), 0.035, BONE, w1=0.006, bevel=0)                    # fangs
    for z in (-1, 1):
        box(f, (0.12, 0.075, 0.02), (0.11, 0.03, z * 0.201), SOCKET, bevel=0)                        # eye socket
        box(f, (0.07, 0.032, 0.02), (0.12, 0.028, z * 0.207), EMBER, bevel=0, emissive=EMBER, strength=4)  # eye
        box(f, (0.2, 0.05, 0.07), (0.1, 0.1, z * 0.18), BONE, rot=(0, 0, -0.18), bevel=0.018)         # brow
        beam(f, (0.06, 0.07, z * 0.13), (-0.27, 0.12, z * 0.19), 0.1, BONE_DK, w1=0.012, bevel=0.012)  # horn swept back


def u_wyrmbone(S):
    """Wyrmbone Harness: a bone breastplate over obsidian plate, and ONE strong idea: a dragon's skull over the left
    shoulder, snout out over the arm, eyes and mouth smouldering. The right shoulder is a plain bone cap, the upper
    arms obsidian, the forearms bone. Below the chest it is all obsidian (waist, belt, a plain under-skirt), so the
    pale chest and skull carry the read. As in the approved icon: a bone chevron with an ember gem on the chest, an
    ember buckle and three bone strips down the skirt."""
    c = S('sock_chest')
    obs = obsidian()
    y, w, hgt, d = CHEST
    box(c, (w + 0.02, hgt + 0.02, d + 0.02), (0, y, 0), BONE, bevel=0.07)                        # breastplate
    y, w, hgt, d = WAIST
    box(c, (w, hgt, d), (0, y, 0), obs, bevel=0.04)                                                   # waist
    box(c, (0.77, 0.085, 0.58), (0, BELT_Y, 0), GRIP, bevel=0.02)                                     # belt
    box(c, (0.13, 0.11, 0.03), (0, BELT_Y, 0.29), obs, bevel=0.012)                                   # buckle
    facet_gem(c, 0.04, (0, BELT_Y, 0.31), EMBER, emissive=EMBER, strength=4)                          # ember in the buckle
    open_gorget(c, obs)                                                                               # gorget
    prism(c, [(-0.3, 0.3), (-0.17, 0.3), (0, 0.06), (0.17, 0.3), (0.3, 0.3), (0, -0.06)], 0.03, (0, 0, 0.305),
          BONE_DK, bevel=0.008)                                                                       # bone chevron
    box(c, (0.1, 0.1, 0.03), (0, 0.08, 0.322), obs, rot=(0, 0, PI / 4), bevel=0.01)                   # gem setting
    facet_gem(c, 0.045, (0, 0.08, 0.34), EMBER, emissive=EMBER, strength=4)                           # chest ember
    hips = S('sock_hips')
    hip_skirt(hips, 0.38, 0.275, -0.16, obs, band(BELT_Y, 0.085), bevel=0.03)                        # under-skirt
    h = at_chest(hips)
    for x in (-0.26, 0, 0.26):   # (leaning back a touch, to lie on the skirt's round top up under the belt)
        box(h, (0.08, 0.24, 0.02), (x, -0.47, 0.2784), BONE, rot=(-0.055, 0, 0), bevel=0.008)         # bone skirt strip
    # Keep the skull's rear edge within the shoulder envelope (-0.22 in socket-local Z).
    # A small forward seat preserves the skull and horn shapes without sweeping behind the hero.
    dragon_skull(pivot(S('sock_shoulderL'), 'skull', (0.08, 0.05, 0.03), (0, 0, -0.22)))
    block_pauldron(S, -1, color=BONE, top=None, edge=None, rivets=None)
    for (name, s), (cuff, _, _) in zip(ARM_SOCKS, HAND_SOCKS):
        sleeve(S(name), s, *SLEEVE, 0.31, obs, bevel=0.035)                                          # rerebrace
        # Bone vambrace from the elbow (rounded about it), set a touch outward so it clears the breastplate.
        joint_limb(pivot(S(cuff), 'vambrace', (s * 0.01, PALM - ELBOW, 0)), 0.265, 0.285, 0.0, ELBOW - 0.515, BONE,
                   round_top=True, bevel=0.03)


def horn_point(h, a, r, base_y, ln, w):
    """A dragon horn standing on the crown band at bearing a (radians from the front), r out from the centre:
    two blocks, flaring outward from the band and then turning up to a point."""
    out = Vector((math.sin(a), 0, math.cos(a)))
    b = Vector((0, base_y, 0)) + out * r
    m = b + Vector((0, ln * 0.45, 0)) + out * (ln * 0.3)
    t = b + Vector((0, ln, 0)) + out * (ln * 0.42)
    beam(h, tuple(b - Vector((0, 0.04, 0))), tuple(m), w, BONE, w1=w * 0.72, bevel=0.012)
    beam(h, tuple(m - (m - b).normalized() * 0.025), tuple(t), w * 0.72, BONE, w1=0.01, bevel=0)


def u_ashen_crown(S):
    """The Ashen Crown, as in the approved icon: an open circlet worn over the hair. A slim black band between two
    bone rims carries five short dragon horns (the tallest over the brow, a pair at the front corners, a shorter pair
    behind), an ember gem under the front horn and a small one under each corner horn. Sized to sit snugly on the
    hair, not to tower over the head."""
    h = S('sock_head')
    obs = obsidian()
    open_box(h, (0.64, 0.085, 0.66), (0, 0.15, -0.005), obs, inner=None, wall=0.05, bevel=0.015)    # band
    for y in (0.1, 0.2):
        open_box(h, (0.655, 0.02, 0.675), (0, y, -0.005), BONE, inner=None, wall=0.06, bevel=0.008)  # bone rims
    for deg, ln, w in ((0, 0.25, 0.085), (52, 0.19, 0.07), (-52, 0.19, 0.07), (128, 0.13, 0.06), (-128, 0.13, 0.06)):
        a = math.radians(deg)
        ca, sa = math.cos(a), math.sin(a)
        r = 1 / max(abs(sa) / 0.3, abs(ca) / 0.31)                                                    # onto the band's square
        horn_point(h, a, r, 0.19, ln, w)
    box(h, (0.09, 0.09, 0.025), (0, 0.15, 0.325), obs, rot=(0, 0, PI / 4), bevel=0.01)               # gem setting
    facet_gem(h, 0.038, (0, 0.15, 0.338), EMBER_HOT, emissive=EMBER, strength=5)                    # ember gem
    for x in (-0.18, 0.18):
        facet_gem(h, 0.024, (x, 0.15, 0.33), EMBER, emissive=EMBER, strength=4)                     # corner gems


def u_cinderfang(S):
    """Cinderfang, as in the approved icon: a broad straight dragon-fang blade of pale bone with a black channel and a
    burning ember line down its middle, set in an obsidian jaw guard with two bone horn quillons and an ember gem;
    an ember gem for a pommel. Big, clean shapes that read in the hand."""
    h = S('sock_handR')
    obs = obsidian()
    grip(h, -0.21, 0.21, 0.12, GRIP, (-0.16, 0.16), obs)
    box(h, (0.13, 0.08, 0.13), (0, -0.25, 0), obs, bevel=0.02)                                        # pommel cap
    facet_gem(h, 0.07, (0, -0.33, 0), EMBER, emissive=EMBER, strength=4, rot=corner_up(), depth=0.1)  # ember pommel
    box(h, (0.24, 0.16, 0.18), (0, 0.24, 0), obs, bevel=0.04)                                         # jaw guard
    for s in (-1, 1):
        prism(h, [(0, -0.06), (0.32, -0.02), (0.44, 0.18), (0.29, 0.09), (0, 0.07)], 0.09, (s * 0.07, 0.24, 0), BONE,
              rot=(0, 0 if s > 0 else PI, 0), bevel=0.012)                                           # horn quillons
    facet_gem(h, 0.05, (0, 0.24, 0.095), EMBER, emissive=EMBER, strength=5)
    fang = [(-0.16, 0.3), (0.16, 0.3), (0.175, 0.62), (0.165, 1.0), (0.12, 1.3), (0, 1.6), (-0.12, 1.3),
            (-0.165, 1.0), (-0.175, 0.62)]
    prism(h, fang, 0.08, (0, 0, 0), BONE, bevel=0.016)                                               # the fang blade
    prism(h, [(-0.05, 0.33), (0.05, 0.33), (0.05, 1.16), (0, 1.36), (-0.05, 1.16)], 0.09, (0, 0, 0), obs,
          bevel=0.008)                                                                                # dark channel
    prism(h, [(-0.016, 0.36), (0.016, 0.36), (0.016, 1.14), (0, 1.27), (-0.016, 1.14)], 0.1, (0, 0, 0), EMBER,
          emissive=EMBER, strength=4)                                                                 # ember line


# The Emberstring's limbs: the bow's own profile from the end of its riser.
EMBER_LIMB = [(RISER, 0.0), (0.4, 0.05), (0.52, 0.12), (0.62, 0.18), (0.7, 0.19), (0.78, 0.14)]


def u_emberstring(S):
    """Emberstring, as in the approved icon: a bone recurve with an ember inlay down the inside of each limb, obsidian
    horn tips, an ember gem in the grip and a burning string."""
    obs = obsidian()
    b = bow_frame(S)
    z0 = BOW_Z
    grip = RISER - BOW_MID + 0.13            # the riser in two: the grip round the hand, then the rest with the gem
    box(b, (0.12, grip, 0.12), (0, -RISER + grip / 2, z0), GRIP, bevel=0.03).name = 'bow_grip'
    box(b, (0.12, 2 * RISER - grip, 0.12), (0, grip / 2, z0), GRIP, bevel=0.03)
    facet_gem(b, 0.05, (0, 0.04, z0 - 0.075), EMBER, emissive=EMBER, strength=5, rot=(0, PI / 4, 0))
    for s in (-1, 1):
        box(b, (0.13, 0.05, 0.15), (0, s * (RISER + 0.02), z0), obs, bevel=0.015)
        limb_chain(b, [(s * y, z + z0) for y, z in EMBER_LIMB], 0.12, 0.09, BONE)
        beam(b, (0, s * 0.76, z0 + 0.16), (0, s * 0.94, z0 + 0.06), 0.08, obs, w1=0.015)              # horn tips
        for (y0, za), (y1, zb) in zip(EMBER_LIMB, EMBER_LIMB[1:]):
            beam(b, (0, s * y0, za + z0 + 0.047), (0, s * y1, zb + z0 + 0.047), 0.04, EMBER, d=0.012, bevel=0,
                 emissive=EMBER, strength=3)                                                          # ember inlay
    box(b, (0.026, 1.36, 0.026), (0, 0, z0 + 0.195), EMBER_HOT, emissive=EMBER, strength=6, bevel=0)  # burning string


def u_kindled_ash(S):
    """Staff of Kindled Ash, as in the approved icon: an obsidian shaft ringed with bone bands and an oxblood grip;
    four bone claws rise from a bone collar and bend in around a tall burning crystal."""
    obs = obsidian()
    b = staff_frame(S, grip=-0.31)                                                                    # the oxblood grip
    box(b, (0.11, 1.72, 0.11), (0, 0.21, 0), obs, taper=(0.85, 0.85), bevel=0.02)                   # obsidian shaft
    for y in (-0.5, -0.12, 0.12, 0.8):
        box(b, (0.14, 0.05, 0.14), (0, y, 0), BONE, bevel=0.012)                                     # bone bands
    box(b, (0.125, 0.2, 0.125), (0, -0.31, 0), GRIP, bevel=0.02)                                     # oxblood grip
    beam(b, (0, -0.66, 0), (0, -0.84, 0), 0.12, obs, w1=0.02)                                        # butt spike
    box(b, (0.19, 0.14, 0.19), (0, 1.12, 0), BONE, taper=(1.3, 1.3), bevel=0.02)                     # claw collar
    for i in range(4):
        a = i * PI / 2 + PI / 4
        d = Vector((math.cos(a), 0, math.sin(a)))
        pts = [d * 0.08 + Vector((0, 1.18, 0)), d * 0.18 + Vector((0, 1.32, 0)), d * 0.19 + Vector((0, 1.5, 0)), d * 0.07 + Vector((0, 1.7, 0))]
        for p0, p1, w0, w1 in zip(pts, pts[1:], (0.075, 0.065, 0.05), (0.065, 0.05, 0.012)):
            beam(b, tuple(p0 - (p1 - p0).normalized() * 0.02), tuple(p1), w0, BONE, w1=w1)
    beam(b, (0, 1.42, 0), (0, 1.8, 0), 0.15, EMBER_HOT, w1=0.01, d=0.15, d1=0.01, bevel=0,
         emissive=EMBER, strength=5)                                                                 # crystal, upper
    beam(b, (0, 1.42, 0), (0, 1.24, 0), 0.15, EMBER, w1=0.02, d=0.15, d1=0.02, bevel=0,
         emissive=EMBER, strength=4)                                                                 # crystal, lower
