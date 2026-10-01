"""Castle v2 blueprint generator. Authored by Claude Opus. PROPOSAL - NOT IMPLEMENTED.
Writes design.json and three SVG+PNG review sheets beside this file only.
Units: 1 cell = 1 world unit. x east, y = world +Z (south, toward the gameplay camera)."""
import json, math, os
from xml.sax.saxutils import escape

HERE = os.path.dirname(os.path.abspath(__file__))

# ---------------------------------------------------------------- design data
CURTAIN = [(8, 30), (26, 10), (60, 6), (84, 18), (92, 46), (76, 72), (44, 78), (14, 62)]
CROSS = [(74, 13), (34, 72.67)]
WARDS = {
    "inner_court": [(8, 30), (26, 10), (60, 6), (74, 13), (34, 72.67), (14, 62)],
    "lower_ward": [(74, 13), (84, 18), (92, 46), (76, 72), (44, 78), (34, 72.67)],
}
TOWERS = [  # x, y, r, height, name
    (26, 10, 3.2, 9, "NW tower"), (60, 6, 3.6, 10, "North tower"), (84, 18, 3.4, 9, "NE tower"),
    (92, 46, 3.8, 10, "East tower"), (76, 72, 3.2, 9, "SE tower"), (44, 78, 3.6, 9, "South tower"),
    (14, 62, 3.0, 9, "Postern tower")]
GATE = {"id": "G_outer", "x": 84, "y": 59, "width": 3, "towers": [(83.45, 62.77, 3.3), (87.1, 56.8, 3.3)], "height": 10}
INNER_GATE = {"id": "G_inner", "x": 54, "y": 42.8, "width": 3, "height": 9}
POSTERN = {"id": "G_postern", "x": 13.4, "y": 60, "width": 2}
FLOORS = {"ground": 0, "upper": 5, "wall_walk": 7, "hall_eaves": 9, "hall_ridge": 12, "kitchen_ridge": 11, "donjon_parapet": 13}

ROOMS = [  # id, floor, name, shape, fill-key
    ("donjon_g", "G", "Donjon Guard Hall", ("c", 22, 28, 7), "stone"),
    ("hall", "G", "Great Hall", ("r", 29, 12, 48, 28), "oak"),
    ("screens", "G", "Screens Passage", ("r", 48, 12, 51, 28), "flag"),
    ("buttery", "G", "Buttery", ("r", 51, 12, 56, 18.5), "flag"),
    ("svc", "G", "Service Passage", ("r", 51, 18.5, 56, 20.5), "flag"),
    ("pantry", "G", "Pantry", ("r", 51, 20.5, 56, 28), "flag"),
    ("kitchen", "G", "Great Kitchen", ("r", 56, 10, 64, 24), "flag"),
    ("armory", "G", "Guardroom & Armory", ("r", 14, 35, 26, 43), "stone"),
    ("chapel", "G", "Chapel", ("r", 14, 43, 26, 53), "oak"),
    ("barracks", "G", "Barracks", ("r", 52, 64, 68, 70), "oak"),
    ("stable", "G", "Stables", ("r", 78, 26, 84, 40), "straw"),
    ("smithy", "G", "Smithy", ("r", 80, 44, 86, 50), "stone"),
    ("donjon_u", "U", "Map Room", ("c", 22, 28, 7), "oak"),
    ("gw1", "U", "Hall Gallery (west)", ("r", 29, 14, 31, 27), "oak"),
    ("gw2", "U", "Hall Gallery (north)", ("r", 29, 12, 48, 14), "oak"),
    ("gallery", "U", "Minstrel Gallery", ("r", 48, 12, 51, 28), "oak"),
    ("steward", "U", "Steward's Chamber", ("r", 51, 12, 56, 28), "oak"),
    ("solar", "U", "Solar", ("r", 14, 35, 26, 45), "oak"),
    ("bedchamber", "U", "Bedchamber", ("r", 14, 45, 26, 53), "oak"),
]
VOIDS = [("hall_void", "Hall open to roof (void)", (31, 14, 48, 28)), ("kitchen_void", "Kitchen two-storey (void)", (56, 10, 64, 24))]
ZONES = [  # court purposes
    ("feast_court", "Feast Court", ("r", 32, 30, 48, 38)),
    ("kitchen_yard", "Kitchen Yard", ("r", 51, 28, 58, 34)),
    ("herb_garden", "Herb Garden", ("r", 18, 56, 30, 63)),
    ("well", "Well", ("c", 42, 44, 1.6)),
    ("lists", "Training Lists", ("r", 62, 28, 76, 44)),
    ("muster", "Muster Yard", ("r", 66, 50, 80, 62)),
]
# doors: id, floor, x, y, wall axis (v = wall runs N-S), width, swing side, a, b
DOORS = [
    ("D1", "G", 38, 28, "h", 4, "n", "hall", "inner_court"),
    ("D2", "G", 49.5, 28, "h", 2.5, "n", "screens", "inner_court"),
    ("D3", "G", 48, 20, "v", 3, "w", "screens", "hall"),
    ("D4", "G", 51, 15, "v", 2, "e", "screens", "buttery"),
    ("D5", "G", 51, 19.5, "v", 2, "e", "screens", "svc"),
    ("D6", "G", 56, 19.5, "v", 2, "e", "svc", "kitchen"),
    ("D7", "G", 51, 24, "v", 2, "e", "screens", "pantry"),
    ("D8", "G", 60, 24, "h", 3, "n", "kitchen", "inner_court"),
    ("D9", "G", 29, 26, "v", 2, "w", "hall", "donjon_g"),
    ("D10", "G", 22, 35, "h", 2, "s", "donjon_g", "armory"),
    ("D11", "G", 26, 39, "v", 2, "w", "armory", "inner_court"),
    ("D12", "G", 20, 43, "h", 2, "s", "armory", "chapel"),
    ("D13", "G", 26, 48, "v", 3, "w", "chapel", "inner_court"),
    ("D14", "G", 60, 64, "h", 3, "s", "barracks", "lower_ward"),
    ("D15", "G", 84, 33, "v", 4, "w", "stable", "lower_ward"),
    ("D16", "G", 80, 47, "v", 2, "e", "smithy", "lower_ward"),
    ("U1", "U", 29, 25.5, "v", 2, "e", "donjon_u", "gw1"),
    ("U2", "U", 48, 13, "v", 2, "w", "gw2", "gallery"),
    ("U3", "U", 51, 22, "v", 2, "e", "gallery", "steward"),
    ("U4", "U", 22, 35, "h", 2, "s", "donjon_u", "solar"),
    ("U5", "U", 20, 45, "h", 2, "s", "solar", "bedchamber"),
]
OPENINGS = [("O1", "U", 30, 14, 2, "gw1", "gw2")]  # doorless junction (gallery corner)
GATES = [("G_outer", 84, 59, 3, "outside", "lower_ward"), ("G_inner", 54, 42.8, 3, "lower_ward", "inner_court"),
         ("G_postern", 13.4, 60, 2, "inner_court", "outside")]
STAIRS = [  # id, x, y, w, h (rect) or r, kind, floors
    ("S1", 22, 28, 1.8, "spiral", "G<->U<->roof (+13)"),
    ("S2", 49.5, 13.75, 1.4, "straight", "G screens <-> U minstrel gallery"),
    ("W1", 40, 60, 1.4, "wall stair", "inner court <-> wall walk (+7)"),
    ("W2", 78, 62, 1.4, "wall stair", "muster yard <-> wall walk / gatehouse (+7)"),
]
FURN = [  # id, floor, x0,y0,x1,y1, kind
    ("table_n", "G", 34, 16.4, 46, 17.6, "table"), ("table_s", "G", 34, 22.4, 46, 23.6, "table"),
    ("high_table", "G", 30.2, 15, 31.4, 23, "table"), ("hall_hearth", "G", 39.2, 19.2, 40.8, 20.8, "hearth"),
    ("k_hearth_n", "G", 57.5, 10, 62.5, 11.4, "hearth"), ("k_hearth_e", "G", 62.6, 14, 64, 19, "hearth"),
    ("k_table", "G", 58, 15, 61, 16.6, "table"), ("casks", "G", 52, 12.3, 55.6, 13.7, "casks"),
    ("shelves", "G", 52, 26.4, 55.6, 27.6, "shelves"), ("altar", "G", 15, 46.5, 16.2, 49.5, "altar"),
    ("rack", "G", 14.4, 36, 15.4, 42, "rack"), ("bunks", "G", 53, 68.4, 67, 69.6, "bunks"),
    ("anvil", "G", 82.5, 46.5, 83.7, 47.5, "anvil"), ("forge", "G", 84.6, 45, 86, 48, "hearth"),
    ("map_table", "U", 17.5, 31.6, 20.5, 32.8, "table"), ("bed", "U", 15, 48, 18, 51.5, "bed"),
    ("desk", "U", 53, 14, 55.4, 15.2, "table"),
]
HEARTHS = [  # x,y,floor,label - flues stack where x,y repeat
    (15, 28, "G+U", "donjon flue"), (40, 20, "G", "central hearth, roof louver"), (60, 10.2, "G", "kitchen flue N"),
    (63.8, 16.5, "G", "kitchen flue E"), (14.2, 39, "G+U", "armory/solar flue"), (55.8, 26, "U", "steward flue in wall"),
    (85.6, 46.5, "G", "forge flue")]
WINDOWS_U = [  # x,y, room, facing
    (22, 21, "donjon_u", "N"), (16, 33, "donjon_u", "SW"), (28, 32, "donjon_u", "SE"),
    (26, 38, "solar", "E"), (26, 42, "solar", "E"), (14, 50, "bedchamber", "W"), (26, 50, "bedchamber", "E"),
    (53.5, 28, "steward", "S"), (56, 14, "steward", "E-into kitchen void"),
    (35, 28, "hall_void", "S clerestory"), (42, 28, "hall_void", "S clerestory")]
ROUTES = {
    "approach": ("G", [(100, 88), (95, 72), (89.5, 62.4), (84, 59), (79, 56), (66, 48), (57, 44.6), (54, 42.8),
                      (50, 40), (42, 34), (38, 30), (38, 28), (38, 25), (31, 26), (29, 26), (25, 27)]),
    "service": ("G", [(55, 31), (60, 26), (60, 24), (60, 19.5), (56, 19.5), (53, 19.5), (51, 19.5), (49.5, 19.8),
                     (48, 20), (44, 20)]),
    "guard": ("G", [(60, 67), (60, 64), (62, 60), (72, 58), (78, 62)]),
    "postern": ("G", [(22, 39), (26, 39), (28, 46), (28, 52), (24, 58), (16, 61), (13.4, 60), (6, 60)]),
    "upper_hall": ("U", [(22, 28), (26, 26.5), (29, 25.5), (30, 22), (30, 13), (40, 13), (48, 13), (49.5, 15),
                        (49.5, 22), (51, 22), (53.5, 22)]),
    "upper_wing": ("U", [(22, 29), (22, 35), (22, 40), (20, 45), (20, 49)]),
}
EXPANSION = [("E", (96, 40), (106, 36), "settlement edge (east)"), ("S", (98, 88), (104, 96), "lower town / approach"),
             ("W", (8, 60), (0, 62), "postern -> cliff stair")]
REFS = [
    {"url": "https://www.nationaltrust.org.uk/visit/sussex/bodiam-castle/exploring-bodiam-castle",
     "used": "screens passage dividing service end (kitchen/buttery/pantry, two-storey kitchen with two hearths) from hall; private apartments at the hall's upper end; postern as secondary entrance"},
    {"url": "https://en.wikipedia.org/wiki/Harlech_Castle",
     "used": "wards in sequence with a twin D-tower gatehouse (multiple barriers); domestic buildings built against the inner wall; site-following defences with a water-gate stair from the steep side"},
]


def shape_bbox(s):
    return (s[1] - s[3], s[2] - s[3], s[1] + s[3], s[2] + s[3]) if s[0] == "c" else s[1:]


def write_design():
    d = {
        "status": "PROPOSAL - NOT IMPLEMENTED / OPUS-AUTHORED", "units": "1 cell = 1 world unit; x east, y = +Z south (camera side)",
        "floor_heights": FLOORS, "curtain": CURTAIN, "curtain_thickness": 2, "cross_wall": CROSS, "wards": WARDS,
        "towers": [dict(x=t[0], y=t[1], r=t[2], h=t[3], name=t[4]) for t in TOWERS],
        "openings": [dict(id=o[0], floor=o[1], x=o[2], y=o[3], width=o[4], a=o[5], b=o[6]) for o in OPENINGS],
        "gates": [dict(id=g[0], x=g[1], y=g[2], width=g[3], a=g[4], b=g[5]) for g in GATES],
        "rooms": [dict(id=r[0], floor=r[1], name=r[2], shape=r[3][0], geom=list(r[3][1:])) for r in ROOMS],
        "voids": [dict(id=v[0], name=v[1], rect=v[2]) for v in VOIDS],
        "zones": [dict(id=z[0], name=z[1], shape=z[2][0], geom=list(z[2][1:])) for z in ZONES],
        "doors": [dict(id=o[0], floor=o[1], x=o[2], y=o[3], wall=o[4], width=o[5], swing=o[6], a=o[7], b=o[8],
                       swing_reserve="width x width square on swing side") for o in DOORS],
        "stairs": [dict(id=s[0], x=s[1], y=s[2], r=s[3], kind=s[4], links=s[5]) for s in STAIRS],
        "furniture": [dict(id=f[0], floor=f[1], rect=f[2:6], kind=f[6]) for f in FURN],
        "hearths": [dict(x=h[0], y=h[1], floors=h[2], note=h[3]) for h in HEARTHS],
        "windows_upper": [dict(x=w[0], y=w[1], room=w[2], facing=w[3]) for w in WINDOWS_U],
        "routes": {k: dict(floor=v[0], points=v[1]) for k, v in ROUTES.items()},
        "camera_cutaway": "walls whose outward face points south (+Z) render at 1.2 high; north/west/east walls full height",
        "references": REFS,
        "open_questions": [
            "Should the hall keep a central open hearth + roof louver (current) or a north-wall chimney?",
            "Is the stair fade acceptable for the donjon spiral, or should S1 become a visible ramped turn?",
            "Does the lower ward keep the lists, or become the first settlement market once the island grows east?",
            "Wall walk: playable at +7 (W1/W2) or decorative only?",
            "Postern cliff stair destination depends on the future island edge shape."],
    }
    with open(os.path.join(HERE, "design.json"), "w", encoding="utf-8") as f:
        json.dump(d, f, indent=1)


# ---------------------------------------------------------------- svg helpers
C = dict(paper="#efe3c8", ink="#2b2420", grass="#7a9a4c", grass2="#6a8a40", void="#2e3440", cliff="#5d4c3e",
         court="#c9b48c", lower="#b59a72", wall="#5e4a3a", walltop="#8c7560", slate="#4d5462", slate2="#636b7a",
         oak="#a7703e", oakline="#8a5a30", flag="#bfae90", stone="#9c8a74", straw="#c9a95a", red="#b0262a",
         gold="#e0b040", fire="#e8742a", route_a="#d49a1a", route_s="#d2601e", route_g="#3f6fb0", route_p="#3f8f4a",
         upper="#c8925a")


class Svg:
    def __init__(s, w, h):
        s.w, s.h, s.o = w, h, []

    def add(s, t):
        s.o.append(t)

    def rect(s, x, y, w, h, fill, stroke="none", sw=1, extra=""):
        s.add(f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}" {extra}/>')

    def poly(s, pts, fill, stroke="none", sw=1, extra=""):
        p = " ".join(f"{a:.1f},{b:.1f}" for a, b in pts)
        s.add(f'<polygon points="{p}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}" stroke-linejoin="round" {extra}/>')

    def line(s, pts, stroke, sw=1, extra=""):
        p = " ".join(f"{a:.1f},{b:.1f}" for a, b in pts)
        s.add(f'<polyline points="{p}" fill="none" stroke="{stroke}" stroke-width="{sw}" stroke-linejoin="round" stroke-linecap="round" {extra}/>')

    def circle(s, x, y, r, fill, stroke="none", sw=1, extra=""):
        s.add(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r:.1f}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}" {extra}/>')

    def text(s, x, y, t, fs=14, fill=C["ink"], anchor="start", weight="normal", bg=None, pad=3):
        if bg:
            w = len(t) * fs * (0.6 if weight == "bold" else 0.55)
            x0 = x - (w / 2 if anchor == "middle" else (w if anchor == "end" else 0))
            s.rect(x0 - pad, y - fs * 0.85 - pad / 2, w + 2 * pad, fs * 1.1 + pad, bg, extra='rx="3" opacity="0.88"')
        s.add(f'<text x="{x:.1f}" y="{y:.1f}" font-family="sans-serif" font-size="{fs}" fill="{fill}" '
              f'text-anchor="{anchor}" font-weight="{weight}">{escape(t)}</text>')

    def save(s, name):
        body = "\n".join(s.o)
        svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{s.w}" height="{s.h}" viewBox="0 0 {s.w} {s.h}">\n'
               f'{body}\n</svg>\n')
        with open(os.path.join(HERE, name + ".svg"), "w", encoding="utf-8") as f:
            f.write(svg)
        try:
            import fitz
            doc = fitz.open(stream=svg.encode("utf-8"), filetype="svg")
            doc[0].get_pixmap().save(os.path.join(HERE, name + ".png"))
        except Exception as e:  # keep the SVG even if PNG fails
            print("PNG failed for", name, e)


class Map:  # cell -> px transform
    def __init__(s, ox, oy, sc, x0=0, y0=0):
        s.ox, s.oy, s.sc, s.x0, s.y0 = ox, oy, sc, x0, y0

    def p(s, x, y):
        return (s.ox + (x - s.x0) * s.sc, s.oy + (y - s.y0) * s.sc)

    def pts(s, L):
        return [s.p(*q) for q in L]


def frame(svg, title, sub):
    svg.rect(0, 0, svg.w, svg.h, C["paper"])
    svg.title, svg.sub = title, sub
    bands(svg, title, sub)


def bands(svg, title, sub):
    svg.rect(0, 0, svg.w, 78, C["ink"])
    svg.rect(0, 78, svg.w, 5, C["red"])
    svg.rect(0, 83, svg.w, 2, C["gold"])
    svg.text(28, 44, title, 30, "#f3e6c4", weight="bold")
    svg.text(28, 68, sub, 15, "#d8c69c")
    svg.rect(svg.w - 470, 14, 450, 52, C["red"], C["gold"], 3, 'rx="6"')
    svg.text(svg.w - 245, 38, "PROPOSAL — NOT IMPLEMENTED", 19, "#fff3d0", "middle", "bold")
    svg.text(svg.w - 245, 58, "OPUS-AUTHORED · castle-v2 · not gameplay", 13, "#f6dca0", "middle")
    svg.rect(0, svg.h - 30, svg.w, 30, C["ink"])
    svg.text(20, svg.h - 10, "1 cell = 1 world unit · x east · +Z south = gameplay camera side · layout for review, not structural engineering",
             13, "#d8c69c")
    svg.text(svg.w - 20, svg.h - 10, "PROPOSAL — NOT IMPLEMENTED / OPUS-AUTHORED", 13, C["gold"], "end", "bold")


def grid(svg, m, x0, y0, x1, y1, step=4):
    for x in range(int(x0), int(x1) + 1, step):
        svg.line([m.p(x, y0), m.p(x, y1)], "#d9c9a6", 0.7)
    for y in range(int(y0), int(y1) + 1, step):
        svg.line([m.p(x0, y), m.p(x1, y)], "#d9c9a6", 0.7)


def compass_scale(svg, x, y, sc, cells=10):
    svg.circle(x, y, 26, "#f6ecd4", C["ink"], 1.5)
    svg.poly([(x, y - 22), (x - 7, y + 4), (x, y - 2), (x + 7, y + 4)], C["red"], C["ink"], 1)
    svg.text(x, y - 30, "N", 15, C["ink"], "middle", "bold")
    svg.text(x, y + 44, "camera ↓ (+Z)", 12, C["ink"], "middle")
    bx = x + 50
    for i in range(cells // 2):
        svg.rect(bx + i * 2 * sc, y + 6, sc, 7, C["ink"])
        svg.rect(bx + (i * 2 + 1) * sc, y + 6, sc, 7, "#f6ecd4", C["ink"], 0.8)
    svg.text(bx, y - 2, "0", 12)
    svg.text(bx + cells * sc, y - 2, f"{cells} cells", 12, anchor="middle")


def offset_seg(a, b, t):
    dx, dy = b[0] - a[0], b[1] - a[1]
    L = math.hypot(dx, dy)
    nx, ny = -dy / L * t, dx / L * t
    return [(a[0] + nx, a[1] + ny), (b[0] + nx, b[1] + ny), (b[0] - nx, b[1] - ny), (a[0] - nx, a[1] - ny)]


def draw_site(svg, m, detail=True):
    # ripped island lip: plateau beyond curtain; void N and W
    plateau = [(-2, 24), (6, 12), (20, 2), (44, -2), (66, -2), (86, 6), (100, 18), (108, 34), (110, 60),
               (112, 100), (60, 100), (30, 90), (8, 78), (-2, 64), (-6, 44)]
    svg.poly(m.pts([(q[0] - 3, q[1] - 3) for q in plateau]), C["void"])
    svg.poly(m.pts([(q[0] + 0.0, q[1] + 1.2) for q in plateau]), C["cliff"])
    svg.poly(m.pts(plateau), C["grass"])
    svg.poly(m.pts(WARDS["inner_court"]), C["court"])
    svg.poly(m.pts(WARDS["lower_ward"]), C["lower"])


def draw_walls(svg, m, walk=False):
    sc = m.sc
    for i in range(len(CURTAIN)):
        a, b = CURTAIN[i], CURTAIN[(i + 1) % len(CURTAIN)]
        svg.line(m.pts([a, b]), C["wall"], 2.2 * sc)
        svg.line(m.pts([a, b]), C["walltop"] if not walk else "#d8a860", 0.9 * sc)
    svg.line(m.pts(CROSS), C["wall"], 1.8 * sc)
    svg.line(m.pts(CROSS), C["walltop"] if not walk else "#d8a860", 0.7 * sc)
    for x, y, r, h, n in TOWERS:
        svg.circle(*m.p(x, y), r * sc, C["slate"], C["wall"], 0.5 * sc)
        svg.circle(*m.p(x, y), r * sc * 0.45, C["slate2"])
    # gates (openings)
    for gid, gx, gy, gw, a, b in GATES:
        svg.circle(*m.p(gx, gy), gw * 0.6 * sc, "#d8c69c", C["ink"], 1)
    for x, y, r in GATE["towers"]:
        svg.circle(*m.p(x, y), r * sc, C["slate"], C["wall"], 0.5 * sc)
        svg.circle(*m.p(x, y), r * sc * 0.4, C["slate2"])
    gx, gy = INNER_GATE["x"], INNER_GATE["y"]
    u = (-0.557, 0.831)
    sq = [(gx + u[0] * 2.6 + u[1] * 1.6, gy + u[1] * 2.6 - u[0] * 1.6), (gx + u[0] * 2.6 - u[1] * 1.6, gy + u[1] * 2.6 + u[0] * 1.6),
          (gx - u[0] * 2.6 - u[1] * 1.6, gy - u[1] * 2.6 + u[0] * 1.6), (gx - u[0] * 2.6 + u[1] * 1.6, gy - u[1] * 2.6 - u[0] * 1.6)]
    svg.poly(m.pts(sq), C["slate"], C["wall"], 0.4 * sc)
    svg.line(m.pts([sq[0], sq[1]]), C["ink"], 0.12 * sc)
    svg.circle(*m.p(gx, gy), 1.4 * sc, "#d8c69c", C["ink"], 1)


def banner(svg, x, y, s=1.0):
    svg.rect(x - 6 * s, y, 12 * s, 18 * s, C["red"], C["ink"], 0.8)
    svg.poly([(x, y + 4 * s), (x + 4 * s, y + 9 * s), (x, y + 14 * s), (x - 4 * s, y + 9 * s)], C["gold"])


def rpx(m, r):
    x0, y0, x1, y1 = r
    a, b = m.p(x0, y0)
    c, d = m.p(x1, y1)
    return a, b, c - a, d - b


# ---------------------------------------------------------------- axonometric inset
def axon(svg, ox, oy, s):
    def P(x, y, z):
        return (ox + (x - y * 0.45) * s, oy + (y * 0.55 + x * 0.12) * s - z * s * 0.9)

    objs = []

    def prism(poly, z0, z1, top, side, key=None):
        objs.append((key if key is not None else max(q[1] for q in poly), poly, z0, z1, top, side))

    def ngon(x, y, r, n=12):
        return [(x + r * math.cos(2 * math.pi * i / n), y + r * math.sin(2 * math.pi * i / n)) for i in range(n)]

    plateau = [(-2, 24), (6, 12), (20, 2), (44, -2), (66, -2), (86, 6), (100, 18), (104, 40), (104, 70), (96, 92), (60, 92), (30, 86), (8, 76), (-2, 62), (-6, 44)]
    svg.poly([P(x, y, -3) for x, y in plateau], C["cliff"])
    svg.poly([P(x, y, 0) for x, y in plateau], C["grass"])
    svg.poly([P(x, y, 0) for x, y in WARDS["inner_court"]], C["court"])
    svg.poly([P(x, y, 0) for x, y in WARDS["lower_ward"]], C["lower"])
    for i in range(len(CURTAIN)):
        a, b = CURTAIN[i], CURTAIN[(i + 1) % len(CURTAIN)]
        prism(offset_seg(a, b, 1), 0, 7, C["walltop"], C["wall"])
    prism(offset_seg(*CROSS, 0.9), 0, 6, C["walltop"], C["wall"])
    for x, y, r, h, n in TOWERS:
        prism(ngon(x, y, r), 0, h, C["slate2"], C["wall"])
    for x, y, r in GATE["towers"]:
        prism(ngon(x, y, r), 0, 10, C["slate2"], C["wall"])
    prism(ngon(54, 42.8, 2.4, 4), 0, 9, C["slate2"], C["wall"])
    prism(ngon(22, 28, 7), 0, 13, C["slate"], "#6a5646", key=36)
    prism([(29, 12), (51, 12), (51, 28), (29, 28)], 0, 11, C["red"], "#7a6250", key=28.5)
    prism([(51, 12), (56, 12), (56, 28), (51, 28)], 0, 9, C["slate"], "#7a6250")
    prism([(56, 10), (64, 10), (64, 24), (56, 24)], 0, 10, C["slate"], "#7a6250")
    prism([(14, 35), (26, 35), (26, 53), (14, 53)], 0, 9, C["slate"], "#7a6250")
    prism([(52, 64), (68, 64), (68, 70), (52, 70)], 0, 4, C["slate2"], "#7a6250")
    prism([(78, 26), (84, 26), (84, 40), (78, 40)], 0, 4, C["slate2"], "#7a6250")
    prism([(80, 44), (86, 44), (86, 50), (80, 50)], 0, 4, C["slate2"], "#7a6250")
    objs.sort(key=lambda o: o[0])
    for key, poly, z0, z1, top, side in objs:
        n = len(poly)
        cx = sum(q[0] for q in poly) / n
        cy = sum(q[1] for q in poly) / n
        for i in range(n):
            a, b = poly[i], poly[(i + 1) % n]
            mx, my = (a[0] + b[0]) / 2 - cx, (a[1] + b[1]) / 2 - cy
            ex, ey = b[0] - a[0], b[1] - a[1]
            nx, ny = ey, -ex  # outward for ccw? choose by midpoint test
            if nx * mx + ny * my < 0:
                nx, ny = -nx, -ny
            if ny > 0 or nx < -0.2 * abs(ny) - 0.01 and ny >= 0:
                shade = side
                svg.poly([P(*a, z0), P(*b, z0), P(*b, z1), P(*a, z1)], shade, "#3a2e25", 0.6)
        svg.poly([P(x, y, z1) for x, y in poly], top, "#3a2e25", 0.6)
    # roof louver + banners
    lx, ly = P(40, 20, 11)
    svg.rect(lx - 4, ly - 6, 8, 6, C["gold"], C["ink"], 0.6)
    for x, y, z in ((22, 28, 13), (84, 59, 10), (40, 28, 9)):
        bx, by = P(x, y, z)
        svg.line([(bx, by), (bx, by - 16)], C["ink"], 1.2)
        svg.poly([(bx, by - 16), (bx + 11, by - 13), (bx, by - 9)], C["red"], C["gold"], 0.8)
    for t, x, y, z in (("Donjon +13", 22, 28, 13), ("Great Hall ridge +12", 40, 12, 11), ("Kitchen +10", 63, 10, 10),
                       ("Gatehouse +10", 90, 59, 10), ("Inner gate +9", 56, 42, 9), ("Curtain walk +7", 44, 78, 7),
                       ("Barracks +4", 60, 70, 4)):
        tx, ty = P(x, y, z)
        svg.text(tx, ty - 6, t, 11, C["ink"], "middle", "bold", bg="#f6ecd4", pad=2)


# ---------------------------------------------------------------- sheet 1 overview
def overview():
    svg = Svg(1700, 1100)
    frame(svg, "CASTLE v2 — OVERVIEW: spur castle, two wards, bent approach",
           "Polygonal curtain on the rock lip · twin-D gatehouse in the SE face · inner gate in a diagonal cross wall · L-range residence hinged on a round donjon")
    m = Map(40, 110, 8.6, -4, -2)
    draw_site(svg, m)
    grid(svg, m, -4, -2, 108, 104 - 8, 4)
    # zones
    for zid, name, sh in ZONES:
        if sh[0] == "r":
            x, y, w, h = rpx(m, sh[1:])
            svg.rect(x, y, w, h, "#ffffff", "#5a4630", 1.4, 'fill-opacity="0.18" stroke-dasharray="6,4"')
        else:
            svg.circle(*m.p(sh[1], sh[2]), sh[3] * m.sc, "#4f86b8", C["ink"], 1.5)
    # furniture hints in lists/garden
    for i in range(5):
        svg.line(m.pts([(64 + i * 2.6, 30), (64 + i * 2.6, 42)]), "#8a6a40", 1, 'stroke-dasharray="3,3"')
    for i in range(4):
        svg.line(m.pts([(19, 57.5 + i * 1.6), (29, 57.5 + i * 1.6)]), "#4f7a30", 4)
    # buildings roofs
    def roof(r, col, ridge="h"):
        x, y, w, h = rpx(m, r)
        svg.rect(x, y, w, h, col, C["wall"], 3)
        if ridge == "h":
            svg.line([(x, y + h / 2), (x + w, y + h / 2)], "#2f343e", 2)
        else:
            svg.line([(x + w / 2, y), (x + w / 2, y + h)], "#2f343e", 2)
    roof((29, 12, 51, 28), "#7d3a2c")
    roof((51, 12, 56, 28), C["slate"], "v")
    roof((56, 10, 64, 24), C["slate"], "v")
    roof((14, 35, 26, 53), C["slate"], "v")
    roof((52, 64, 68, 70), C["slate2"])
    roof((78, 26, 84, 40), C["slate2"], "v")
    roof((80, 44, 86, 50), C["slate2"])
    svg.rect(*rpx(m, (39, 19, 41, 21)), C["gold"], C["ink"], 1)  # louver
    for x, y in ((60, 10.2), (63.8, 16.5), (15, 28), (14.2, 39)):
        svg.rect(*rpx(m, (x - 0.7, y - 0.7, x + 0.7, y + 0.7)), "#3a2e25")
    draw_walls(svg, m)
    svg.circle(*m.p(22, 28), 7 * m.sc, C["slate"], C["wall"], 4)
    svg.circle(*m.p(22, 28), 3.5 * m.sc, C["slate2"], "#2f343e", 2)
    svg.circle(*m.p(22, 28), 0.8 * m.sc, C["gold"])
    # routes
    cols = {"approach": C["route_a"], "service": C["route_s"], "guard": C["route_g"], "postern": C["route_p"]}
    for k, col in cols.items():
        svg.line(m.pts(ROUTES[k][1]), "#2b2420", 7, 'opacity="0.35"')
        svg.line(m.pts(ROUTES[k][1]), col, 4.5, 'stroke-dasharray="10,6"')
    # banners
    for x, y in ((80.5, 60.5), (86.5, 54.5), (38, 28.3), (54, 44)):
        bx, by = m.p(x, y)
        banner(svg, bx, by - 4, 0.9)
    # labels
    L = [("DONJON (+13)", 22, 23.5), ("GREAT HALL", 39, 15.4), ("Kitchen", 60, 13), ("Service", 53.5, 24),
         ("Private wing", 20, 47), ("FEAST COURT", 40, 34.5), ("Kitchen yard", 54.5, 31.5), ("Well", 42, 47.6),
         ("Herb garden", 24, 55.2), ("UPPER INNER COURT", 30, 64), ("TRAINING LISTS", 69, 36), ("Stables", 81, 24.6),
         ("Smithy", 83, 52.5), ("MUSTER YARD", 71, 55), ("Barracks", 60, 72.6), ("LOWER WARD", 62, 76),
         ("OUTER GATEHOUSE", 92, 64.5), ("INNER GATE", 58, 41), ("Postern", 10, 66), ("Wall stair W1", 40, 58),
         ("W2", 78, 64.6)]
    for t, x, y in L:
        px, py = m.p(x, y)
        svg.text(px, py, t, 13 if t.isupper() else 12, C["ink"], "middle", "bold" if t.isupper() else "normal", bg="#f6ecd4")
    for k, (x, y), (x2, y2), t in EXPANSION:
        a, b = m.p(x, y)
        c, d = m.p(x2, y2)
        svg.line([(a, b), (c, d)], "#f6ecd4", 3, 'stroke-dasharray="4,4"')
        svg.poly([(c, d), (c - 8, d - 6), (c - 8, d + 6)] if k != "W" else [(c, d), (c + 8, d - 6), (c + 8, d + 6)], "#f6ecd4")
    svg.text(*m.p(84, 92), "approach & lower town (expansion)", 12, "#f6ecd4", "middle", "bold", bg="#3a4a2a")
    svg.text(*m.p(97, 31), "east expansion", 12, "#f6ecd4", "middle", "bold", bg="#3a4a2a")
    svg.text(*m.p(12, 4), "SHEER RIPPED EDGE", 12, "#f6ecd4", "middle", "bold", bg=C["void"])
    svg.text(*m.p(-2, 70), "cliff stair", 12, "#f6ecd4", "middle", "bold", bg=C["void"])
    compass_scale(svg, 90, 990, m.sc)
    # right panel
    px0 = 1000
    svg.rect(px0, 100, 680, 450, "#f6ecd4", C["ink"], 1.5, 'rx="6"')
    svg.text(px0 + 16, 126, "MASSING — oblique view from the camera side (south)", 16, weight="bold")
    axon(svg, px0 + 150, 160, 5.0)
    svg.rect(px0, 562, 680, 500, "#f6ecd4", C["ink"], 1.5, 'rx="6"')
    y = 590
    svg.text(px0 + 16, y, "ROUTES", 16, weight="bold")
    for i, (k, col, t) in enumerate((("approach", C["route_a"], "Approach: up the SE ramp, turn under both gate towers, cross lower ward, inner gate, feast court, hall great door, dais, donjon"),
                                       ("service", C["route_s"], "Service: kitchen yard → kitchen → service passage → screens → hall (no crossing the court)"),
                                       ("guard", C["route_g"], "Guard: barracks → muster yard → wall stair W2 → gatehouse & wall walk"),
                                       ("postern", C["route_p"], "Postern: armory → court → herb garden → postern → cliff stair"))):
        yy = y + 24 + i * 40
        svg.line([(px0 + 18, yy - 4), (px0 + 58, yy - 4)], col, 5, 'stroke-dasharray="10,6"')
        words, line_, lines = t.split(" "), "", []
        for w in words:
            if len(line_) + len(w) > 70:
                lines.append(line_)
                line_ = ""
            line_ += w + " "
        lines.append(line_)
        for j, ln in enumerate(lines):
            svg.text(px0 + 68, yy + j * 16, ln.strip(), 13)
    y = 770
    svg.text(px0 + 16, y, "WHY THIS IS NOT v1", 16, weight="bold")
    for i, t in enumerate(("× No 36×20 box, no four corner towers: an L-range hinged on one round donjon.",
                           "× No rectangular bailey: an 8-sided curtain follows the rock lip.",
                           "× No axial walk to the front door: a bent approach, two gates, two wards.",
                           "× No ruin shells: every yard has a job (lists, muster, feast, kitchen, garden).",
                           "✓ Kept: warm stone/slate/oak, red-and-gold banners, the banquet hall.")):
        svg.text(px0 + 22, y + 24 + i * 22, t, 13)
    # v1 vs v2 thumbnails
    tx, ty = px0 + 40, 910
    svg.text(tx, ty, "v1 (rejected)", 13, weight="bold")
    svg.rect(tx, ty + 10, 150, 100, "#d8c69c", C["wall"], 4)
    svg.rect(tx + 35, ty + 22, 80, 40, "#9c8a74", C["wall"], 2)
    for cx, cy in ((tx, ty + 10), (tx + 150, ty + 10), (tx + 150, ty + 110), (tx, ty + 110)):
        svg.rect(cx - 7, cy - 7, 14, 14, C["wall"])
    svg.line([(tx - 5, ty + 5), (tx + 155, ty + 115)], C["red"], 4)
    svg.line([(tx + 155, ty + 5), (tx - 5, ty + 115)], C["red"], 4)
    svg.text(tx + 260, ty, "v2 (this proposal)", 13, weight="bold")
    mm = Map(tx + 230, ty + 8, 1.15, 0, 0)
    svg.poly(mm.pts(CURTAIN), "#d8c69c", C["wall"], 4)
    svg.line(mm.pts(CROSS), C["wall"], 3)
    svg.rect(*rpx(mm, (29, 12, 64, 28)), "#9c8a74", C["wall"], 1.5)
    svg.rect(*rpx(mm, (14, 35, 26, 53)), "#9c8a74", C["wall"], 1.5)
    svg.circle(*mm.p(22, 28), 7 * 1.15, C["slate"], C["wall"], 1.5)
    svg.circle(*mm.p(84, 59), 5, C["gold"], C["ink"], 1)
    gx_, gy_ = mm.p(84, 59)
    svg.text(gx_ + 10, gy_ + 5, "bent gate", 12)
    svg.save("castle-v2-overview")


# ---------------------------------------------------------------- floor sheets
FILL = {"oak": "#c08850", "flag": "#cdbd9c", "stone": "#b0a088", "straw": "#d6bc72"}


def room_shape(svg, m, sh, fill, stroke, sw):
    if sh[0] == "c":
        svg.circle(*m.p(sh[1], sh[2]), sh[3] * m.sc, fill, stroke, sw)
    else:
        svg.rect(*rpx(m, sh[1:]), fill, stroke, sw)


def planks(svg, m, sh):
    if sh[0] != "r":
        return
    x0, y0, x1, y1 = sh[1:]
    y = y0 + 1
    while y < y1:
        svg.line(m.pts([(x0, y), (x1, y)]), "#a8743f", 0.7)
        y += 1


def door_draw(svg, m, d, label=True):
    did, fl, x, y, ax, w, sw, a, b = d
    sc = m.sc
    if ax == "h":
        gap = (x - w / 2, y - 0.5, x + w / 2, y + 0.5)
    else:
        gap = (x - 0.5, y - w / 2, x + 0.5, y + w / 2)
    svg.rect(*rpx(m, gap), "#efe0bc")
    # reserve square
    dx, dy = {"n": (0, -1), "s": (0, 1), "e": (1, 0), "w": (-1, 0)}[sw]
    if ax == "h":
        res = (x - w / 2, min(y, y + dy * w), x + w / 2, max(y, y + dy * w))
    else:
        res = (min(x, x + dx * w), y - w / 2, max(x, x + dx * w), y + w / 2)
    svg.rect(*rpx(m, res), "none", "#b0262a", 1, 'stroke-dasharray="3,3"')
    # swing arc
    if ax == "h":
        hx, hy = x - w / 2, y
        ex, ey = hx, y + dy * w
        tx, ty = x + w / 2, y
    else:
        hx, hy = x, y - w / 2
        ex, ey = x + dx * w, hy
        tx, ty = x, y + w / 2
    P = m.p
    svg.line([P(hx, hy), P(ex, ey)], C["ink"], 2)
    r = w * sc
    a1, b1 = P(ex, ey)
    a2, b2 = P(tx, ty)
    svg.add(f'<path d="M{a1:.1f},{b1:.1f} A{r:.1f},{r:.1f} 0 0 {1 if (sw in "nw") ^ (ax == "v") else 0} {a2:.1f},{b2:.1f}" fill="none" stroke="{C["ink"]}" stroke-width="1" stroke-dasharray="2,2"/>')
    if label:
        lx, ly = P(x + w / 2 + 1.0, y + 0.35) if ax == "h" else P(x, y - w / 2 - 0.5)
        svg.text(lx, ly, did, 12, "#ffffff", "middle", "bold", bg=C["red"], pad=2)


def stair_draw(svg, m, s, fl):
    sid, x, y, r, kind, links = s
    sc = m.sc
    if kind == "spiral":
        svg.circle(*m.p(x, y), r * sc, "#e6d6b0", C["ink"], 1.5)
        for i in range(10):
            a = 2 * math.pi * i / 10
            svg.line([m.p(x, y), m.p(x + r * math.cos(a), y + r * math.sin(a))], C["ink"], 1)
        svg.circle(*m.p(x, y), 0.3 * sc, C["ink"])
    else:
        x0, y0, x1, y1 = x - r, y - r, x + r, y + r
        svg.rect(*rpx(m, (x0, y0, x1, y1)), "#e6d6b0", C["ink"], 1.5)
        k = y0
        while k < y1:
            svg.line(m.pts([(x0, k), (x1, k)]), C["ink"], 1)
            k += 0.4
        svg.line(m.pts([(x, y1), (x, y0 + 0.2)]), C["red"], 2)
    tx, ty = m.p(x, y)
    if kind == "straight":
        svg.text(tx - r * sc - 6, ty + 5, f"{sid} {'↑' if fl == 'G' else '↓'} {'UPPER' if fl == 'G' else 'GROUND'}", 12, "#ffffff", "end", "bold", bg="#3f6fb0", pad=2)
        return
    svg.text(tx, ty + r * sc + 16, f"{sid} {'↑' if fl == 'G' else '↓'} {'UPPER' if fl == 'G' else 'GROUND'}", 12, "#ffffff", "middle", "bold", bg="#3f6fb0", pad=2)


def furn_draw(svg, m, f):
    fid, fl, x0, y0, x1, y1, kind = f
    r = (x0, y0, x1, y1)
    if kind == "table":
        svg.rect(*rpx(m, r), "#7a4a24", "#3a2414", 1.2)
        x = x0 + 0.6
        while x < x1 - 0.3 and (x1 - x0) > (y1 - y0):
            cx, cy = m.p(x, (y0 + y1) / 2)
            svg.circle(cx, cy, 3.2, [C["gold"], C["red"], "#f0e0c0", "#d07a30"][int(x * 3) % 4])
            x += 1.1
        if (x1 - x0) > (y1 - y0):  # benches
            for yy in (y0 - 0.45, y1 + 0.15):
                svg.rect(*rpx(m, (x0, yy, x1, yy + 0.3)), "#5e3a1c")
    elif kind == "hearth":
        svg.rect(*rpx(m, r), "#5a4a40", C["ink"], 1.2)
        cx, cy = m.p((x0 + x1) / 2, (y0 + y1) / 2)
        svg.circle(cx, cy, min(x1 - x0, y1 - y0) * m.sc * 0.32, C["fire"])
        svg.circle(cx, cy, min(x1 - x0, y1 - y0) * m.sc * 0.15, C["gold"])
    elif kind == "casks":
        x = x0 + 0.6
        while x < x1:
            svg.circle(*m.p(x, (y0 + y1) / 2), 0.55 * m.sc, "#8a5a30", "#3a2414", 1)
            x += 1.2
    elif kind == "bed":
        svg.rect(*rpx(m, r), C["red"], "#3a2414", 1.2)
        svg.rect(*rpx(m, (x0, y0, x1, y0 + 0.8)), "#f0e0c0")
    else:
        svg.rect(*rpx(m, r), {"shelves": "#7a4a24", "altar": C["gold"], "rack": "#6a6a70", "bunks": "#8a5a30", "anvil": "#3a3a40"}[kind], "#3a2414", 1)


def floor_base(svg, m, region, ghost):
    x0, y0, x1, y1 = region
    svg.rect(*rpx(m, region), C["grass"] if not ghost else "#cdbf9c")
    svg.poly(m.pts(WARDS["inner_court"]), C["court"] if not ghost else "#d8caa6")
    svg.poly(m.pts(WARDS["lower_ward"]), C["lower"] if not ghost else "#d2c19c")
    grid(svg, m, x0, y0, x1, y1, 2)
    draw_walls(svg, m, walk=ghost)


def mask(svg):  # crop the floor-plan window (region 6..70 x 4..66 at 14.2 px)
    svg.rect(0, 85, 40, 1000, C["paper"])
    svg.rect(949, 85, 51, 1000, C["paper"])
    svg.rect(0, 985, svg.w, 115, C["paper"])
    svg.rect(0, 0, svg.w, 105, C["paper"])
    svg.rect(1000, 85, 700, 1015, C["paper"])
    bands(svg, svg.title, svg.sub)
    svg.rect(40, 105, 909, 880, "none", C["ink"], 1.5)


def panel_list(svg, x, y, title, rows, fs=13, lh=19):
    svg.text(x, y, title, 16, weight="bold")
    for i, r in enumerate(rows):
        svg.text(x + 6, y + 22 + i * lh, r, fs)
    return y + 22 + len(rows) * lh + 10


def ground():
    svg = Svg(1700, 1100)
    frame(svg, "CASTLE v2 — GROUND FLOOR (+0)",
           "Hall · screens · service end · two-storey kitchen · donjon guard hall · armory & chapel wing · court entrances, door reserves, stair pairs")
    region = (6, 4, 70, 66)
    m = Map(40, 105, 14.2, 6, 4)
    floor_base(svg, m, region, False)
    for zid, name, sh in ZONES:
        if sh[0] == "r":
            svg.rect(*rpx(m, sh[1:]), "#ffffff", "#5a4630", 1.4, 'fill-opacity="0.22" stroke-dasharray="6,4"')
        else:
            svg.circle(*m.p(sh[1], sh[2]), sh[3] * m.sc, "#4f86b8", C["ink"], 2)
    for r in ROOMS:
        if r[1] == "G":
            room_shape(svg, m, r[3], FILL[r[4]], C["wall"], 0.9 * m.sc)
            if r[4] == "oak":
                planks(svg, m, r[3])
    # dais
    svg.rect(*rpx(m, (29.4, 14, 32.6, 27.6)), "#d9a868", "#7a4a24", 1.2)
    for f in FURN:
        if f[1] == "G":
            furn_draw(svg, m, f)
    for d in DOORS:
        if d[1] == "G":
            door_draw(svg, m, d)
    for s in STAIRS:
        if s[0] in ("S1", "S2", "W1"):
            stair_draw(svg, m, s, "G")
    # camera cutaway marks on south faces
    for a, b in (((29, 28), (51, 28)), ((51, 28), (56, 28)), ((56, 24), (64, 24))):
        svg.line(m.pts([a, b]), "#f6ecd4", 2.5, 'stroke-dasharray="8,5"')
    mask(svg)
    for x, y in ((35, 28.6), (44, 28.6), (29.2, 20)):
        banner(svg, *m.p(x, y), 1.0)
    routes = {"approach": C["route_a"], "service": C["route_s"], "postern": C["route_p"]}
    for k, col in routes.items():
        pts = [q for q in ROUTES[k][1] if region[0] - 2 <= q[0] <= region[2] + 2 and region[1] <= q[1] <= region[3]]
        svg.line(m.pts(pts), col, 4, 'stroke-dasharray="9,6" opacity="0.9"')
    labels = [("GREAT HALL", 39, 13.6), ("dais", 31, 25.0), ("Screens", 49.5, 26.6),
              ("Buttery", 53.5, 17.5), ("svc", 53.5, 20.0), ("Pantry", 53.5, 25.0), ("GREAT KITCHEN", 60, 21.6),
              ("two hearths, open to roof", 60, 13.2), ("DONJON GUARD HALL", 22, 23.6), ("GUARDROOM & ARMORY", 20.5, 41.5),
              ("CHAPEL", 21, 51.5), ("FEAST COURT", 40, 36.8), ("KITCHEN YARD", 54.5, 33.2), ("WELL", 42, 47.4),
              ("HERB GARDEN", 24, 61.8), ("cross wall → lower ward", 52, 52)]
    for t, x, y in labels:
        svg.text(*m.p(x, y), t, 13 if t.isupper() else 11, C["ink"], "middle", "bold" if t.isupper() else "normal", bg="#f6ecd4", pad=2)
    svg.text(*m.p(54, 41), "INNER GATE", 12, "#ffffff", "middle", "bold", bg=C["ink"])
    svg.text(*m.p(18, 64.6), "POSTERN", 12, "#ffffff", "middle", "bold", bg=C["ink"])
    compass_scale(svg, 90, 1010, m.sc, 6)
    px0 = 1000
    svg.rect(px0, 100, 680, 965, "#f6ecd4", C["ink"], 1.5, 'rx="6"')
    names = {r[0]: r[2] for r in ROOMS}
    names.update(inner_court="Inner court", lower_ward="Lower ward")
    rows = [f"{d[0]:<4} {names[d[7]]} ⇄ {names[d[8]]}  ({d[5]} wide, swings {d[6].upper()})" for d in DOORS if d[1] == "G"]
    y = panel_list(svg, px0 + 18, 128, "DOOR SCHEDULE (dashed red = swing reserve, keep clear)", rows, 12.5, 18)
    y = panel_list(svg, px0 + 18, y + 6, "STAIR PAIRS (fade triggers stand at the same x,z on both floors)",
                   [f"{s[0]}  @ ({s[1]}, {s[2]})  {s[4]}: {s[5]}" for s in STAIRS], 12.5, 18)
    y = panel_list(svg, px0 + 18, y + 6, "FOOD LOGIC (Bodiam-style service end)", [
        "Kitchen yard (deliveries, wood, water from well) → kitchen D8.",
        "Kitchen → service passage D6 → screens D5; buttery D4 (casks, drink)",
        "  and pantry D7 (bread, stores) open off the same screens.",
        "Servers enter the hall at D3, behind the table ends — never through guests.",
        "Guests enter by the great door D1 from the feast court; lord's party",
        "  arrives at the dais from the donjon D9.",
        "Central hearth (louver above) lights two long tables + high table."], 12.5, 18)
    y = panel_list(svg, px0 + 18, y + 6, "CIRCULATION", [
        "White dashed south faces = camera-side cutaway (walls cut to 1.2).",
        "Main lanes 3-4 cells: hall aisle south of the tables, court routes.",
        "Hall: 19×16 cells; aisle y 24-28 kept clear for the approach route.",
        "Guard: armory D11 to court; donjon reachable only via hall dais",
        "  or armory D10 — defensible residence.",
        "Lower ward rooms (barracks, stables, smithy) on overview sheet."], 12.5, 18)
    svg.save("castle-v2-ground")


def hatch(svg, m, r, step=1.0, col="#7a6a58"):
    x0, y0, x1, y1 = r
    c = x0 + y0
    while c < x1 + y1:
        pts = []
        for x in (x0, x1):
            y = c - x
            if y0 <= y <= y1:
                pts.append((x, y))
        for y in (y0, y1):
            x = c - y
            if x0 <= x <= x1:
                pts.append((x, y))
        if len(pts) >= 2:
            svg.line(m.pts(pts[:2]), col, 1)
        c += step


def upper():
    svg = Svg(1700, 1100)
    frame(svg, "CASTLE v2 — UPPER FLOOR (+5) · wall walk (+7)",
           "Map room in the donjon · solar & bedchamber · hall galleries over the void · steward's chamber · flues, windows, landings, section")
    region = (6, 4, 70, 66)
    m = Map(40, 105, 14.2, 6, 4)
    floor_base(svg, m, region, True)
    svg.text(*m.p(48, 64), "WALL WALK +7 (gold) — reached by W1 / W2, not from the +5 floor", 12, C["ink"], "middle", "bold", bg="#f6ecd4")
    # ground ghost outlines
    for r in ROOMS:
        if r[1] == "G" and r[0] not in ("barracks", "stable", "smithy"):
            room_shape(svg, m, r[3], "#d6c8a8", "#a89878", 1)
    # roofs / voids
    for vid, name, r in VOIDS:
        svg.rect(*rpx(m, r), "#9aa0ac", "#4d5462", 2)
        hatch(svg, m, r, 1.0, "#5d6474")
    for r in ROOMS:
        if r[1] == "U":
            room_shape(svg, m, r[3], C["upper"], C["wall"], 0.9 * m.sc)
            planks(svg, m, r[3])
    for f in FURN:
        if f[1] == "U":
            furn_draw(svg, m, f)
    for d in DOORS:
        if d[1] == "U":
            door_draw(svg, m, d)
    for s in STAIRS:
        if s[0] in ("S1", "S2"):
            stair_draw(svg, m, s, "U")
    # landings
    svg.rect(*rpx(m, (48.2, 15.6, 50.8, 17.4)), "none", C["route_g"], 2, 'stroke-dasharray="4,3"')
    svg.circle(*m.p(22, 28), 2.9 * m.sc, "none", C["route_g"], 2, 'stroke-dasharray="4,3"')
    svg.text(*m.p(49.5, 18.4), "landing", 10, C["route_g"], "middle", bg="#f6ecd4", pad=1)
    # windows
    for x, y, room, face in WINDOWS_U:
        cx, cy = m.p(x, y)
        horiz = face[0] in "NS"
        if horiz:
            svg.rect(cx - 12, cy - 4, 24, 8, "#9cc8e8", C["ink"], 1.2)
        else:
            svg.rect(cx - 4, cy - 12, 8, 24, "#9cc8e8", C["ink"], 1.2)
    # hearths / flues
    for x, y, fl, note in HEARTHS:
        if x > 70 or "louver" in note:
            continue
        cx, cy = m.p(x, y)
        svg.rect(cx - 9, cy - 9, 18, 18, "#3a2e25", C["ink"], 1)
        svg.circle(cx, cy, 5, C["fire"] if "U" in fl else "#7a6a58")
    lx, ly = m.p(40, 20)
    svg.rect(lx - 16, ly - 16, 32, 32, C["gold"], C["ink"], 1.5)
    svg.text(lx, ly + 34, "roof louver", 11, C["ink"], "middle", bg="#f6ecd4", pad=2)
    for x, y in ((40, 13), (22, 23)):
        banner(svg, *m.p(x, y + 1.2), 0.9)
    mask(svg)
    pts = ROUTES["upper_hall"][1]
    svg.line(m.pts(pts), C["route_a"], 4, 'stroke-dasharray="9,6"')
    svg.line(m.pts(ROUTES["upper_wing"][1]), C["route_a"], 4, 'stroke-dasharray="9,6"')
    labels = [("MAP ROOM", 22, 32.8), ("SOLAR", 20, 38.6), ("BEDCHAMBER", 21, 46.8), ("MINSTREL GALLERY", 49.5, 30.2),
              ("STEWARD'S CHAMBER", 57, 32.2), ("HALL VOID — open to roof +12", 39.5, 26.4),
              ("KITCHEN VOID", 60, 22.6), ("gallery looks down into hall", 39, 15.6), ("west gallery", 30, 9.6)]
    for t, x, y in labels:
        svg.text(*m.p(x, y), t, 13 if t.isupper() else 11, C["ink"], "middle", "bold" if t[0].isupper() and t.isupper() else "normal", bg="#f6ecd4", pad=2)
    svg.line(m.pts([(49.5, 29.4), (49.5, 27)]), C["ink"], 1)
    svg.line(m.pts([(57, 31.4), (54, 27)]), C["ink"], 1)
    svg.line(m.pts([(30, 10.2), (30, 14.5)]), C["ink"], 1)
    compass_scale(svg, 90, 1010, m.sc, 6)
    px0 = 1000
    svg.rect(px0, 100, 680, 965, "#f6ecd4", C["ink"], 1.5, 'rx="6"')
    names = {r[0]: r[2] for r in ROOMS}
    rows = [f"{d[0]:<4} {names[d[7]]} ⇄ {names[d[8]]}  ({d[5]} wide)" for d in DOORS if d[1] == "U"]
    y = panel_list(svg, px0 + 18, 128, "UPPER DOORS", rows, 12.5, 18)
    y = panel_list(svg, px0 + 18, y + 4, "LEGEND", [
        "Warm oak fill = occupied +5 floor.  Grey hatch = void (no floor).",
        "Blue bars = windows (tied to the room they light).",
        "Dark square = flue; orange dot = hearth on this floor, grey = flue passing.",
        "Blue dashed = stair landing (arrival point of the fade).",
        "Gold walls = curtain wall walk at +7 — separate level, own stairs."], 12.5, 18)
    y = panel_list(svg, px0 + 18, y + 4, "FLUES (stacked, so roofs read honestly)", [
        "Donjon W wall: guard hall hearth → map room hearth → one stack.",
        "Wing W wall: armory hearth → solar hearth → one stack.",
        "Kitchen N + E: two tall stacks (kitchen open to roof).",
        "Hall: central hearth, smoke out through roof louver (no flue)."], 12.5, 18)
    # section inset
    sy = y + 14
    svg.text(px0 + 18, sy, "SECTION A–A (north–south through hall, x = 40, looking west)", 15, weight="bold")
    S = lambda yy, z: (px0 + 60 + (yy - 4) * 13.5, sy + 270 - z * 18)
    gnd = [(px0 + 30, sy + 270), (px0 + 660, sy + 270)]
    svg.rect(px0 + 30, sy + 270, 630, 24, C["cliff"])
    svg.line(gnd, C["ink"], 2)
    svg.poly([S(6.5, 0), S(9.5, 0), S(9.5, 7), S(6.5, 7)], C["wall"])  # curtain
    for k in range(4):
        svg.rect(S(6.5 + k * 0.8, 7.7)[0], S(0, 7.7)[1], 6, 0.7 * 18, C["wall"])
    svg.poly([S(11.5, 0), S(12, 0), S(12, 9), S(11.5, 9)], C["stone"], C["ink"], 1)
    svg.poly([S(28, 1.2), S(28.5, 1.2), S(28.5, 9), S(28, 9)], "none", C["ink"], 1, 'stroke-dasharray="4,3"')
    svg.poly([S(28, 0), S(28.5, 0), S(28.5, 1.2), S(28, 1.2)], C["stone"], C["ink"], 1)
    svg.poly([S(11.5, 9), S(20, 12.5), S(28.5, 9)], C["slate"], C["ink"], 1.2)
    svg.poly([S(19.2, 12.2), S(20.8, 12.2), S(20.8, 13.2), S(19.2, 13.2)], C["gold"], C["ink"], 1)
    svg.poly([S(12, 5), S(14, 5), S(14, 5.4), S(12, 5.4)], C["upper"], C["ink"], 1)
    svg.rect(S(12, 0)[0], S(0, 0.6)[1], (S(28, 0)[0] - S(12, 0)[0]), 0.6 * 18, "#c08850")
    svg.rect(S(19.2, 0)[0], S(0, 1)[1], 0.16 * 13.5 * 10, 18, C["fire"])
    for yy in (17, 23):
        svg.rect(S(yy - 0.6, 0)[0], S(0, 1.6)[1], 1.2 * 13.5, 1.0 * 18, "#7a4a24")
    svg.poly([S(30, 0), S(46, 0), S(46, 0.2), S(30, 0.2)], C["court"])
    svg.rect(S(38, 0)[0] - 6, S(0, 3)[1], 12, 3 * 18, C["red"])
    for z, t in ((0, "+0 ground"), (5, "+5 upper / gallery"), (7, "+7 wall walk"), (9, "+9 eaves"), (12, "+12 ridge")):
        a, b = S(4, z)
        svg.line([(px0 + 30, b), (px0 + 660, b)], "#a89878", 0.8, 'stroke-dasharray="3,4"')
        svg.text(px0 + 640, b - 3, t, 11, anchor="end")
    for t, yy, z in (("curtain", 8, 3.3), ("hall void", 20, 6.8), ("gallery +5", 13, 4.2), ("feast court", 36, 1.3),
                     ("tables", 20, 2.4), ("camera-side wall cut", 28.3, 10.2)):
        svg.text(*S(yy, z), t, 11, C["ink"], "middle", bg="#f6ecd4", pad=1)
    svg.text(px0 + 30, sy + 312, "N ←", 12, weight="bold")
    svg.text(px0 + 660, sy + 312, "→ S (camera)", 12, anchor="end", weight="bold")
    svg.save("castle-v2-upper")


if __name__ == "__main__":
    write_design()
    overview()
    ground()
    upper()
    print("wrote design.json and castle-v2-{overview,ground,upper}.svg/.png")
