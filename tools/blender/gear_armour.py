"""Helms, body armour, gloves and boots.

Loaded by gear.py in its shared namespace; re-executed on every load for Blender iteration.
"""

# ─── Helms (sock_head) ───────────────────────────────────────────────────────

def open_helm(h, shell=R.metal, rim=R.trim, nasal=R.trim, stud=R.dark):
    """Boxy open-faced helm: a box bowl over the top of the head cube with a smaller block on top, a rim band
    over the brow, cheek guards over the ears and a neck guard. The face stays clear."""
    box(h, (0.56, 0.22, 0.58), (0, 0.2, -0.005), shell, bevel=0.04)                           # bowl
    box(h, (0.44, 0.07, 0.46), (0, 0.33, -0.005), shell, bevel=0.022)                         # top block
    box(h, (0.585, 0.065, 0.605), (0, 0.11, -0.005), rim, bevel=0.014)                        # rim band
    box(h, (0.56, 0.24, 0.07), (0, -0.03, -0.265), shell, bevel=0.022)                        # neck guard
    for s in (-1, 1):
        box(h, (0.07, 0.23, 0.26), (s * 0.28, -0.015, -0.07), shell, bevel=0.022)             # cheek guard
        if stud:
            rivet(h, (s * 0.2, 0.11, 0.304), stud, 0.018)
            rivet(h, (s * 0.2935, 0.11, 0.12), stud, 0.018, rot=(PI / 4, PI / 2, 0))
    if nasal:
        box(h, (0.07, 0.21, 0.04), (0, 0.0, 0.312), nasal, taper=(1.3, 1), bevel=0.012)      # nasal bar


def helm_open(S):
    """Med helm."""
    open_helm(S('sock_head'))


def slotted_plate(p, xs, ys, holes, depth, z, color, bevel=0.01):
    """A flat plate facing +Z (front at z + depth) over the grid of cells between the breakpoints xs, ys, with the
    cells in `holes` ((i, j) pairs) cut clean through: a real opening with walls, whose lower wall faces up and takes
    the light (a lit lip) while its upper wall faces down into shadow. One mesh; every edge lightly chamfered."""
    bm = bmesh.new()
    vf, vb = {}, {}

    def v(d, i, j, zz):
        if (i, j) not in d:
            d[(i, j)] = bm.verts.new((xs[i], ys[j], zz))
        return d[(i, j)]
    nx, ny = len(xs) - 1, len(ys) - 1
    keep = {(i, j) for i in range(nx) for j in range(ny) if (i, j) not in holes}
    for i, j in keep:
        bm.faces.new((v(vf, i, j, z + depth), v(vf, i + 1, j, z + depth), v(vf, i + 1, j + 1, z + depth), v(vf, i, j + 1, z + depth)))
        bm.faces.new((v(vb, i, j + 1, z), v(vb, i + 1, j + 1, z), v(vb, i + 1, j, z), v(vb, i, j, z)))
        for (di, dj), (a, b) in (((0, -1), ((i, j), (i + 1, j))), ((1, 0), ((i + 1, j), (i + 1, j + 1))),
                                 ((0, 1), ((i + 1, j + 1), (i, j + 1))), ((-1, 0), ((i, j + 1), (i, j)))):
            if (i + di, j + dj) not in keep:            # boundary: a wall between the front and the back
                bm.faces.new((v(vf, *b, z + depth), v(vf, *a, z + depth), v(vb, *a, z), v(vb, *b, z)))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if bevel > 0:
        edges = [e for e in bm.edges if len(e.link_faces) == 2 and abs(e.link_faces[0].normal.dot(e.link_faces[1].normal)) < 0.5]
        bmesh.ops.bevel(bm, geom=edges, offset=bevel, segments=1, affect='EDGES', profile=0.5, clamp_overlap=True)
    return _common._mesh_obj(bm, p, (0, 0, 0), (0, 0, 0), color)


def great_helm(h, crest=R.cloth, slit=SLIT):
    """Cube-over-cube great helm, kept bold and plain: a box shell over the head cube, a smaller block on top with a
    low crest, and a T visor: a face plate standing proud of the shell with the eye slit and the breathing slot below
    it cut right through it, so the T is a real recess (lit lower lip, shadowed upper wall) onto a dark lining
    (`slit`). Every heavy tier wears it."""
    box(h, (0.58, 0.5, 0.6), (0, 0.02, 0.01), R.metal, bevel=0.045)                          # shell
    box(h, (0.46, 0.08, 0.48), (0, 0.3, 0.01), R.metal, bevel=0.028)                          # top block
    if crest:
        box(h, (0.08, 0.12, 0.4), (0, 0.395, -0.02), crest, taper=(1, 0.8), bevel=0.022)       # crest
    # Face plate: columns / rows round the T (eye slit y 0.062..0.118 across x +-0.2, breathing slot x +-0.032
    # from the slit down to y -0.13).
    xs = (-0.255, -0.2, -0.032, 0.032, 0.2, 0.255)
    ys = (-0.2, -0.13, 0.062, 0.118, 0.245)
    holes = {(1, 2), (2, 2), (3, 2), (2, 1)}
    slotted_plate(h, xs, ys, holes, 0.04, 0.3, R.metal, bevel=0.009)
    box(h, (0.44, 0.1, 0.02), (0, 0.09, 0.305), slit, bevel=0)                                # dark lining: eye slit
    box(h, (0.1, 0.24, 0.02), (0, -0.04, 0.305), slit, bevel=0)                               # dark lining: breathing slot


def helm_full(S):
    """Full helm: the great helm with a low crest dyed like the wearer's tunic (ROLE_cloth)."""
    great_helm(S('sock_head'))


# ─── Body armour (sock_chest + shoulders) ────────────────────────────────────

# Mail link rows on the hauberk: body block and skirt (the skirt flares out a little, so its rows sit a little out),
# and over the front and back of the skirt's round top (MAIL_TOP_ROWS, above the hip axis), which show when the belt
# rides up there as the body leans.
MAIL_BODY_ROWS = [-0.3 + 0.05 * k for k in range(12)]
MAIL_SKIRT_ROWS = (-0.56, -0.51, -0.46)
MAIL_TOP_ROWS = (0.03, 0.08)
# The hauberk's skirt: (half width, half depth) at the hip axis, its hem (hips space) and its flare (x, z) down to it.
MAIL_SKIRT = (0.381, 0.263, -0.16, (0.009, 0.007))


def hauberk(c, hips, mail=R.metal, dark=R.dark, belt=R.leather, buckle=R.trim, collar=None, links=True):
    """Box mail shirt from the collar to a short skirt (on the hips, its top rounded under the belt), with a belt,
    hem and collar, covered in fine staggered rows of flat links (mail on the metal tiers, stitched leather on the
    leather set)."""
    box(c, (0.76, 0.66, 0.52), (0, -0.01, 0), mail, bevel=0.045)
    hw, hd, hem, flare = MAIL_SKIRT
    hip_skirt(hips, hw, hd, hem, mail, band(-0.37, 0.085), flare=flare, bevel=0.035)          # skirt
    h = at_chest(hips)
    box(h, (0.8, 0.04, 0.56), (0, -0.585, 0), dark, bevel=0.01)                             # hem
    open_box(c, (0.5, 0.1, 0.44), (0, 0.36, 0), collar or mail, sink=0.05, bevel=0.02)       # open collar
    box(c, (0.78, 0.085, 0.56), (0, -0.37, 0), belt, bevel=0.02)
    box(c, (0.13, 0.1, 0.03), (0, -0.37, 0.285), buckle, bevel=0.012)
    if not links:
        return
    for f, hw_ in faces(c, 0.38, 0.26):
        mail_links(f, hw_ - 0.03, MAIL_BODY_ROWS, dark)
    for f, hw_ in faces(h, 0.38, 0.26):
        mail_links(pivot(f, 'skirt_face', (0, 0, 0.01)), hw_ - 0.03, MAIL_SKIRT_ROWS, dark)
    for j, y in enumerate(MAIL_TOP_ROWS):          # over the round top, front and back, each row tipped back with it
        t = math.asin(y / hd)
        for f in (pivot(hips, 'top_face', (0, y, hd * math.cos(t) + 0.002), (-t, 0, 0)),
                  pivot(hips, 'top_face', (0, y, -hd * math.cos(t) - 0.002), (t, PI, 0))):
            mail_links(f, 0.32, (0.0,), dark, stagger=len(MAIL_SKIRT_ROWS) + j)   # (in line with the skirt's, narrower)


def body_chain(S):
    """Mail shirt: box hauberk with a short skirt, blocky mail shoulder caps and mail sleeves down to the
    gauntlets."""
    hauberk(S('sock_chest'), S('sock_hips'))
    for s in (1, -1):
        block_pauldron(S, s, top=None, edge=R.dark, rivets=None)
    mail_sleeve(S)


STITCH = 0xD8C8A0
BRASS = 0xB08A48


def stitches(f, pts, color=STITCH, pitch=0.045, ln=0.024, t=0.008, z=0.002):
    """Running stitch along a polyline of (x, y) points on a face frame (local +Z out): short flat dashes
    `pitch` apart lying just on the face. One mesh."""
    bm = bmesh.new()
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        a, b = Vector((x0, y0, 0)), Vector((x1, y1, 0))
        d = b - a
        n = max(1, int(d.length / pitch))
        u = d.normalized()
        v = Vector((-u.y, u.x, 0)) * t / 2
        for i in range(n):
            p = a + d * ((i + 0.5) / n) - u * ln / 2
            q = p + u * ln
            bm.faces.new([bm.verts.new(tuple(c_ + Vector((0, 0, z)))) for c_ in (p - v, q - v, q + v, p + v)])
    o = _common._mesh_obj(bm, f, (0, 0, 0), (0, 0, 0), color)
    o.name = 'stitch'
    return o


def panel_stitched(f, x, y, w, hgt, color=R.metal, depth=0.035, inset=0.028):
    """Raised leather panel on a face frame with a running stitch just inside its edge."""
    box(f, (w, hgt, depth), (x, y, depth / 2), color, bevel=0.012)
    hw, hh = w / 2 - inset, hgt / 2 - inset
    stitches(f, [(x - hw, y - hh), (x + hw, y - hh), (x + hw, y + hh), (x - hw, y + hh), (x - hw, y - hh)], z=depth + 0.002)


def body_leather(S):
    """Leather jerkin: stitched leather panels over a dark underlayer (the gaps between them read as seams),
    a stand-up collar, a strap across the chest with a brass buckle, a belt, a skirt of hanging flaps, layered
    leather shoulder caps with studs and leather sleeves with a strap. Main leather is ROLE_metal (the leather
    palette's main colour), straps and collar trim are ROLE_trim (darker), the underlayer ROLE_dark."""
    c = S('sock_chest')
    box(c, (0.72, 0.64, 0.5), (0, -0.01, 0), R.dark, bevel=0.04)                               # underlayer
    fr, bk, sl, sr = faces(c, 0.36, 0.25)
    for s in (-1, 1):
        panel_stitched(fr[0], s * 0.18, 0.15, 0.33, 0.3)                                          # chest panels
        panel_stitched(fr[0], s * 0.18, -0.17, 0.33, 0.28)                                        # belly panels
        panel_stitched(bk[0], s * 0.18, -0.01, 0.33, 0.6)                                         # back panels
    for f, hw in (sl, sr):
        panel_stitched(f, 0, -0.01, 0.44, 0.6, depth=0.02)                                        # (sides at 0.38)
    # open stand-up collar with a darker rim over a shoulder yoke
    open_box(c, (0.52, 0.11, 0.44), (0, 0.35, -0.01), R.metal, wall=0.06, sink=0.05, bevel=0.02)
    open_box(c, (0.54, 0.035, 0.46), (0, 0.41, -0.01), R.trim, inner=None, wall=0.06, bevel=0.01)
    box(c, (0.68, 0.05, 0.46), (0, 0.32, -0.01), R.metal, bevel=0.018)                        # shoulder yoke
    # strap from the left shoulder across the chest to the right hip, with a brass buckle
    st = pivot(c, 'strap', (0, 0.02, 0.3), (0, 0, 0.62))
    box(st, (0.1, 0.72, 0.03), (0, 0, 0), R.trim, bevel=0.01)
    box(st, (0.13, 0.11, 0.03), (0, -0.05, 0.012), BRASS, bevel=0.012)
    box(st, (0.07, 0.05, 0.03), (0, -0.05, 0.02), R.trim, bevel=0)
    stb = pivot(c, 'strap', (0, 0.02, -0.3), (0, 0, 0.62))
    box(stb, (0.1, 0.72, 0.03), (0, 0, 0), R.trim, bevel=0.01)
    box(c, (0.76, 0.085, 0.54), (0, -0.33, 0), R.trim, bevel=0.02)                              # belt
    box(c, (0.12, 0.1, 0.03), (0, -0.33, 0.275), BRASS, bevel=0.012)
    # skirt (on the hips): hanging flaps over a dark under-skirt, each flap starting TUCK up behind the belt
    hips = S('sock_hips')
    hip_skirt(hips, 0.36, 0.23, -0.16, R.dark, band(-0.33, 0.085), bevel=0.02)
    h = at_chest(hips)
    top = -0.3725 + TUCK                                                     # (the belt's lower edge is at -0.3725)
    for z in (0.25, -0.25):
        for x in (-0.24, 0.0, 0.24):
            f = pivot(pivot(h, 'flap', (x, top, z), (0, 0 if z > 0 else PI, 0)), 'flap_tilt', (0, 0, 0), (-0.1, 0, 0))
            box(f, (0.21, top + 0.63, 0.035), (0, -(top + 0.63) / 2, 0), R.metal, bevel=0.012)
            for sx in (-0.075, 0.075):                                       # (where they were before the tuck)
                stitches(f, [(sx, -0.6 - top), (sx, -0.4 - top)], z=0.02)
    for s in (-1, 1):   # (just inside the belt's sides, so their tops stay hidden behind it)
        f = pivot(h, 'flap', (s * 0.36, top, 0), (0, 0, s * 0.1))
        box(f, (0.035, top + 0.61, 0.36), (0, -(top + 0.61) / 2, 0), R.metal, bevel=0.012)
    # layered leather shoulder caps with studs, leather sleeves with a strap
    for s in (1, -1):
        top, side = block_pauldron(S, s, top=R.trim, edge=R.trim, rivets=BRASS)
    for name, s in ARM_SOCKS:
        g = S(name)
        sleeve(g, s, *SLEEVE, 0.31, R.metal, bevel=0.03)
        elbow_guard(S, s, R.metal, 0.31, band=R.dark)
        sleeve(g, s, 0.05, -0.2, 0.325, R.trim, out=0.1525, bevel=0.01)                           # strap
        arm_lames(g, s, (R.metal, R.metal), R.dark)


def plate_accent(hips, tabard=R.cloth, under=R.dark):
    """The plate's one accent: a plain tabard falling from the belt between the tassets (ROLE_cloth: it takes the
    wearer's tunic colour, so the knight is not one grey mass), over a plain dark under-skirt that shows between the
    plates at the hips. Both hang on the hips; the tabard, hanging in front of the belt, starts a little up over it."""
    hip_skirt(hips, 0.37, 0.245, -0.19, under, band(BELT_Y, 0.08), bevel=0.02)
    over = 0.025
    f = pivot(at_chest(hips), 'tabard', (0, BELT_Y - 0.04 + over, 0.29), (-0.12, 0, 0))
    box(f, (0.24, 0.38 + over, 0.03), (0, -(0.38 + over) / 2, 0.03), tabard, taper=(1.12, 1), bevel=0.01)
    box(f, (0.265, 0.03, 0.035), (0, -0.015, -0.002), tabard, bevel=0.008)        # its top folded over the belt


def body_plate(S):
    """Platebody (the plate sets in plate_variants.py build on this: set P is exactly it). Bold and plain, like a
    toy knight: a chest block over a waist block, belt, gorget, one tasset per thigh and one accent (a plain dyed
    tabard); block pauldron caps and a plain rerebrace down each upper arm. No lames, ridges, rivets or trim bands."""
    c, hips = S('sock_chest'), S('sock_hips')
    plate_torso(c, hips)
    plate_accent(hips)
    for s in (1, -1):
        block_pauldron(S, s, top=None, edge=None, rivets=None)
    upper_arm_plate(S, lames=False)


# ─── Gloves & boots ──────────────────────────────────────────────────────────

def gloves(S):
    """Leather gloves: the hand's C in leather with a dark strap round the knuckles and a plate on the back of the
    hand, under an open cuff with a rim and a rivet."""
    for cuff, hand, s in HAND_SOCKS:
        h, c = S(hand), S(cuff)
        clip_hand(h, (0, 0, 0), R.metal, s, **GLOVE)                                       # the glove's hand
        clip_hand(h, (0, 0, 0), R.dark, s, outer=0.154, inner=0.142, depth=0.07, gap=0.1, gap_tilt=0.6, stub=None,
                  bevel=0.003)                                                             # knuckle strap
        box(h, (0.03, 0.14, 0.17), (s * 0.165, 0.005, 0), R.trim, bevel=0.01)              # back plate
        # open cuff and its rim, slim on the inner side so they hang clear of the hips and armour skirts
        open_box(c, (0.275, 0.19, 0.33), (s * 0.0175, CUFF_Y, 0), R.metal, wall=0.05, sink=0.05, bevel=0.025)
        open_box(c, (0.295, 0.045, 0.35), (s * 0.0175, CUFF_Y + 0.1, 0), R.trim, inner=None, wall=0.05, bevel=0.012)
        rivet(c, (s * 0.17, CUFF_Y, 0), R.trim, 0.022, rot=(PI / 4, PI / 2, 0))


def boots(S):
    for name in ('sock_footL', 'sock_footR'):
        f = S(name)
        box(f, (0.35, 0.19, 0.46), (0, -0.075, 0.055), R.metal, bevel=0.05)                # foot
        box(f, (0.36, 0.04, 0.48), (0, -0.162, 0.055), R.dark, bevel=0.01)                 # sole
        box(f, (0.33, 0.13, 0.16), (0, -0.08, 0.235), R.metal, taper=(0.9, 0.8), bevel=0.04)  # toe cap
        box(f, (0.34, 0.035, 0.18), (0, -0.02, 0.23), R.trim, bevel=0.01)
        open_box(f, (0.35, 0.34, 0.36), (0, 0.15, 0), R.metal, wall=0.035, sink=0.05, bevel=0.03)  # open shaft
        box(f, (0.37, 0.04, 0.38), (0, 0.1, 0), R.dark, bevel=0)                           # strap
        box(f, (0.2, 0.26, 0.05), (0, 0.17, 0.185), R.metal, bevel=0.02)                   # shin plate
        open_box(f, (0.38, 0.08, 0.4), (0, 0.33, 0), R.trim, inner=None, wall=0.05, bevel=0.02)  # cuff
        rivet(f, (0, 0.2, 0.215), R.trim, 0.022)
