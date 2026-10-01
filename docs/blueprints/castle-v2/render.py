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
# twin-D towers flank a 3-wide passage: centres 4.35 either side of the gate along the SE face, pushed 1.5 outward
_GU = (-16 / math.hypot(16, 26), 26 / math.hypot(16, 26))
_GN = (_GU[1], -_GU[0])  # outward normal of the SE curtain face
GATE = {"id": "G_outer", "x": 84, "y": 59, "width": 3, "height": 10,
        "towers": [(round(84 + s * 4.35 * _GU[0] + 1.5 * _GN[0], 2), round(59 + s * 4.35 * _GU[1] + 1.5 * _GN[1], 2), 2.6) for s in (1, -1)]}
INNER_GATE = {"id": "G_inner", "x": 54, "y": 42.8, "width": 3, "height": 9}
POSTERN = {"id": "G_postern", "x": 12.875, "y": 56, "width": 2}
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
    ("kitchen_yard", "Kitchen Yard", ("r", 51, 28.6, 58, 34)),
    ("herb_garden", "Herb Garden", ("r", 18, 56, 30, 62.5)),
    ("well", "Well", ("c", 42, 44, 1.6)),
    ("lists", "Training Lists", ("r", 65, 30, 76, 44)),
    ("muster", "Muster Yard", ("r", 66, 50, 79, 60)),
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
         ("G_postern", 12.875, 56, 2, "inner_court", "outside")]
STAIRS = [  # id, x, y, w, h (rect) or r, kind, floors. W1/W2 x,y are recomputed from WALK (flight centres) in design()
    ("S1", 22, 28, 1.8, "spiral", "G<->U<->roof (+13)"),
    ("S2", 49.5, 13.75, 1.4, "straight", "G screens <-> U minstrel gallery"),
    ("W1", 38.5, 62.9, 0.8, "wall stair", "inner court +0 -> 25 risers along cross wall -> +7 landing -> cross-wall walk"),
    ("W2", 78.2, 64.9, 0.8, "wall stair", "muster yard +0 -> 25 risers along SE curtain -> +7 doorway into SE tower platform"),
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
    "service": ("G", [(55, 31), (60, 27), (60, 24), (60, 19.5), (56, 19.5), (53, 19.5), (51, 19.5), (49.5, 19.8),
                     (48, 20), (44, 20)]),
    "guard": ("G", [(60, 67), (60, 64), (62, 60), (72, 58), (79.7, 59.8)]),
    "postern": ("G", [(22, 39), (26, 39), (27.5, 39), (28, 46), (28, 54.6), (16, 55.4), (12.875, 56), (6, 57.3)]),
    "upper_hall": ("U", [(22, 28), (26, 26.5), (29, 25.5), (30, 22), (30, 13), (40, 13), (48, 13), (49.5, 15),
                        (49.5, 22), (51, 22), (53.5, 22)]),
    "upper_wing": ("U", [(22, 29), (22, 35), (22, 40), (20, 45), (20, 49)]),
}
EXPANSION = [("E", (96, 40), (106, 36), "settlement edge (east)"), ("S", (98, 88), (104, 96), "lower town / approach"),
             ("W", (8, 57), (0, 59), "postern -> cliff stair")]
# courtyard physical model: drawn half-thicknesses (curtain stroke 2.2, cross wall 1.8, building walls 0.9 cells),
# yard fixtures, gate leaves and route reserves. court_model() turns this into the shapes BOTH drawn and validated.
COURT = {
    "wall_half": {"curtain": 1.1, "cross": 0.9, "building": 0.45},
    "gate_towers": [list(t) for t in GATE["towers"]],
    "gate_detail": {"G_outer": {"swing_to": "lower_ward", "leaves": 2, "jamb_half_depth": 1.1},
                    "G_inner": {"swing_to": "inner_court", "leaves": 2, "jamb_half_depth": 1.6, "gatehouse_half_len": 2.6},
                    "G_postern": {"swing_to": "inner_court", "leaves": 1, "jamb_half_depth": 1.1}},
    "lists": {"action": [65, 30, 76, 44], "rails": [[x - 0.15, 31.5, x + 0.15, 42.5] for x in (67.2, 69.4, 71.6, 73.8)],
              "entry": [70.5, 44], "buffer": 0.5,
              "note": "action/standing space is architectural planning space only, not tested combat or movement mechanics"},
    "beds": [[19, y - 0.23, 29, y + 0.23] for y in (57.2, 58.8, 60.4, 62.0)],
    "wall_stair_landings": "derived from WALK stairs (ground_landing) by walk_model()",
    "built_against": ["donjon_g", "hall", "screens", "buttery", "svc", "pantry", "kitchen", "armory", "chapel"],
    "route_reserve": {"approach": 2.4, "guard": 2.0, "service": 1.8, "postern": 1.6},
}
# wall walk (+7) physical model. Local wall coords: s along the wall from its first point, o = offset across it,
# + toward the ward (curtain: inward; cross wall: toward the inner court). walk_model() turns this into the shapes
# that render.py draws and validate.py floods. Dimensions are PROPOSED planning values, not measured game facts.
WALK = {
    "levels": {"ground": 0, "upper_residence_floor": 5, "wall_walk_deck": 7, "tower_platforms": 7, "inner_gatehouse_platform": 7,
               "parapet_tops": {"curtain_outer": 8.2, "curtain_inner_rail": 7.9, "cross_east": 8.2, "cross_west_rail": 7.9, "stair_guard": 7.9},
               "towers": "open-topped platforms at +7; merlons rise to the tower height (9 or 10); no roof or floor above +7"},
    "curtain_strips": [["outer_parapet", -1.1, -0.5], ["deck", -0.5, 0.8], ["inner_rail", 0.8, 1.1]],
    "cross_strips": [["east_parapet", -0.9, -0.5], ["deck", -0.5, 0.7], ["west_rail", 0.7, 0.9]],
    "tower_shell": 0.6, "tower_sectors": 48, "gatehouse_shell": 0.4, "junction_rail_mid": 0.95,
    "flight": {"risers": 25, "riser": 0.28, "going": 0.35, "construction": "solid masonry built against the wall (no space beneath)"},
    "stairs": {
        "W1": {"wall": "cross", "s_foot": 57.0, "o": [0.9, 2.3], "guard": 0.2, "top": "landing", "landing_len": 1.4,
               "ground_landing": [55.3, 57.0, 0.95, 2.75]},
        "W2": {"wall": "curtain4", "s_foot": 19.1, "o": [1.1, 2.5], "guard": 0.2, "top": "tower", "tower": "SE tower",
               "ground_landing": [17.4, 19.1, 1.15, 2.95]},
    },
    "soffits": {"G_outer": 4.5, "G_inner": 4.5, "G_postern": 3.0},
    "avatar": {"radius": 0.45, "radius_source": "current run context (task brief)",
               "mesh_height": 2.15, "mesh_height_source": "references/current-hero.py: sole at HIP-0.9025 (~0), head top HIP+0.78+0.24+0.23 = 2.15 authored units; runtime scale/normalisation NOT measured"},
    "rules": {"riser_max": 0.30, "going_min": 0.30, "pitch_max_deg": 40.0, "flight_clear_min": 1.2, "landing_len_min": 1.2,
              "headroom_min": 2.6, "note": "proposed planning rules (avatar 2.15 + 0.45 margin), not engine limits"},
    "patrol": ["W1 top (+7)", "S junction (+7)", "South tower (+7)", "SE tower (+7)", "S gate tower (+7)", "over G_outer (+7)",
               "N gate tower (+7)", "East tower (+7)", "NE tower (+7)", "N junction (+7)", "North tower (+7)", "NW tower (+7)",
               "corner (8,30) (+7)", "over G_postern (+7)", "Postern tower (+7)", "S junction (+7)"],
    "spurs": [["N junction (+7)", "inner gatehouse G_inner (+7)"], ["inner gatehouse G_inner (+7)", "W1 top (+7)"],
              ["W2 top (+7)", "SE tower (+7)"]],
}
REFS = [
    {"url": "https://www.nationaltrust.org.uk/visit/sussex/bodiam-castle/exploring-bodiam-castle",
     "used": "screens passage dividing service end (kitchen/buttery/pantry, two-storey kitchen with two hearths) from hall; private apartments at the hall's upper end; postern as secondary entrance"},
    {"url": "https://en.wikipedia.org/wiki/Harlech_Castle",
     "used": "wards in sequence with a twin D-tower gatehouse (multiple barriers); domestic buildings built against the inner wall; site-following defences with a water-gate stair from the steep side"},
]


def shape_bbox(s):
    return (s[1] - s[3], s[2] - s[3], s[1] + s[3], s[2] + s[3]) if s[0] == "c" else s[1:]


def _unit(a, b):
    dx, dy = b[0] - a[0], b[1] - a[1]
    L = math.hypot(dx, dy)
    return (dx / L, dy / L), L


def _box(c, u, hl, hw):  # oriented rectangle: half-length hl along u, half-width hw across
    n = (-u[1], u[0])
    return [(c[0] + u[0] * a * hl + n[0] * b * hw, c[1] + u[1] * a * hl + n[1] * b * hw) for a, b in ((-1, -1), (1, -1), (1, 1), (-1, 1))]


def _pip(x, y, poly):
    inside = False
    for i in range(len(poly)):
        (x1, y1), (x2, y2) = poly[i], poly[i - 1]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            inside = not inside
    return inside


def _rp(r, e=0.0):
    return [(r[0] - e, r[1] - e), (r[2] + e, r[1] - e), (r[2] + e, r[3] + e), (r[0] - e, r[3] + e)]


def court_model(d, K):
    """Physical courtyard shapes from a design dict + COURT-style params. Shapes: ("poly", convex pts) or ("circ", (x, y, r)).
    Used unchanged by the renderer and by validate.py (which also feeds it the transcribed baseline)."""
    wh = K["wall_half"]
    cur = [tuple(p) for p in d["curtain"]]
    walls = [(f"curtain{i}", "curtain", cur[i], cur[(i + 1) % len(cur)], wh["curtain"]) for i in range(len(cur))]
    walls.append(("cross", "cross", tuple(d["cross_wall"][0]), tuple(d["cross_wall"][1]), wh["cross"]))
    cuts = {w[0]: [] for w in walls}
    solids, gates = [], []
    for g in d["gates"]:
        gd = K["gate_detail"][g["id"]]
        best = None
        for wid, cls, a, b, h in walls:
            u, L = _unit(a, b)
            s = (g["x"] - a[0]) * u[0] + (g["y"] - a[1]) * u[1]
            off = abs(-(g["x"] - a[0]) * u[1] + (g["y"] - a[1]) * u[0])
            if 0 < s < L and (best is None or off < best[0]):
                best = (off, wid, a, u, s)
        off, wid, a, u, s = best
        c = (a[0] + u[0] * s, a[1] + u[1] * s)
        n = (-u[1], u[0])
        if not _pip(c[0] + n[0] * 3, c[1] + n[1] * 3, d["wards"][gd["swing_to"]]):
            n = (-n[0], -n[1])
        w, dep = g["width"], gd["jamb_half_depth"]
        cuts[wid].append((s - w / 2, s + w / 2))
        G = dict(id=g["id"], c=c, u=u, n=n, width=w, depth=dep, host=wid, off_line=off,
                 exterior="outside" in (g["a"], g["b"]), passage=_box(c, u, w / 2, dep), sweeps=[], leaves=[], jambs=[])
        if "gatehouse_half_len" in gd:
            hl2 = gd["gatehouse_half_len"]
            G["block"] = _box(c, u, hl2, dep)
            for sg in (1, -1):
                q = (c[0] + u[0] * sg * (w / 2 + hl2) / 2, c[1] + u[1] * sg * (w / 2 + hl2) / 2)
                G["jambs"].append(_box(q, u, (hl2 - w / 2) / 2, dep))
        nl = gd["leaves"]
        Ll = w / nl
        for sg in ((1, -1) if nl == 2 else (-1,)):
            h = (c[0] + u[0] * sg * w / 2 + n[0] * dep, c[1] + u[1] * sg * w / 2 + n[1] * dep)
            cl = (-u[0] * sg, -u[1] * sg)  # closed leaf points across the aperture
            R = Ll / math.cos(math.radians(3.75))  # circumscribed 12-chord arc
            arc = [(h[0] + R * (math.cos(t) * cl[0] + math.sin(t) * n[0]), h[1] + R * (math.cos(t) * cl[1] + math.sin(t) * n[1]))
                   for t in [math.radians(7.5 * k) for k in range(13)]]
            G["sweeps"].append([h] + arc)
            q = (h[0] + n[0] * Ll / 2 - cl[0] * 0.075, h[1] + n[1] * Ll / 2 - cl[1] * 0.075)
            G["leaves"].append(_box(q, n, Ll / 2, 0.075))
        gates.append(G)
    for wid, cls, a, b, h in walls:
        u, L = _unit(a, b)
        edges, t0 = [], 0.0
        for c0, c1 in sorted(cuts[wid]):
            edges.append((t0, c0))
            t0 = c1
        edges.append((t0, L))
        for k, (s0, s1) in enumerate(edges):
            if s1 - s0 > 1e-6:
                mid = (a[0] + u[0] * (s0 + s1) / 2, a[1] + u[1] * (s0 + s1) / 2)
                solids.append(dict(id=f"{wid}.{k}", cls=cls, wall=wid, shape=("poly", _box(mid, u, (s1 - s0) / 2, h))))
    for i, p in enumerate(cur):
        solids.append(dict(id=f"curtain_joint{i}", cls="curtain", wall="joint", shape=("circ", (p[0], p[1], wh["curtain"]))))
    for i, p in enumerate(d["cross_wall"]):
        solids.append(dict(id=f"cross_cap{i}", cls="cross", wall="cross", shape=("circ", (p[0], p[1], wh["cross"]))))
    for t in d["towers"]:
        solids.append(dict(id=t["name"], cls="tower", shape=("circ", (t["x"], t["y"], t["r"]))))
    for i, t in enumerate(K["gate_towers"]):
        solids.append(dict(id=f"gate_tower{i}", cls="tower", gate="G_outer", shape=("circ", tuple(t))))
    for G in gates:
        for i, j in enumerate(G["jambs"]):
            solids.append(dict(id=f"{G['id']}_jamb{i}", cls="gatehouse", gate=G["id"], shape=("poly", j)))
        for i, j in enumerate(G["leaves"]):
            solids.append(dict(id=f"{G['id']}_leaf{i}", cls="leaf", gate=G["id"], shape=("poly", j)))
    bh = wh["building"]
    bwalls, rooms = [], []
    for r in d["rooms"]:
        if r["floor"] != "G":
            continue
        g = r["geom"]
        if r["shape"] == "c":
            sh = ("circ", (g[0], g[1], g[2] + bh))
            bwalls.append(dict(id=r["id"], cls="building", shape=sh))
        else:
            sh = ("poly", _rp(g, bh))
            for fid, (p, q), axis in (("N", ((g[0], g[1]), (g[2], g[1])), "h"), ("S", ((g[0], g[3]), (g[2], g[3])), "h"),
                                      ("W", ((g[0], g[1]), (g[0], g[3])), "v"), ("E", ((g[2], g[1]), (g[2], g[3])), "v")):
                k = 0 if axis == "h" else 1
                ds = sorted((dr["x"], dr["width"]) if axis == "h" else (dr["y"], dr["width"]) for dr in d["doors"]
                            if dr["floor"] == "G" and dr["wall"] == axis and r["id"] in (dr["a"], dr["b"])
                            and abs((dr["y"] if axis == "h" else dr["x"]) - p[1 - k]) < 1e-6)
                t0 = p[k] - bh
                for cc, w in ds + [(q[k] + bh + 1e9, 0)]:
                    t1 = min(cc - w / 2, q[k] + bh)
                    if t1 - t0 > 1e-6:
                        bwalls.append(dict(id=f"{r['id']}.{fid}", cls="building", shape=("poly",
                                           _rp((t0, p[1] - bh, t1, p[1] + bh) if axis == "h" else (p[0] - bh, t0, p[0] + bh, t1)))))
                    t0 = cc + w / 2
        rooms.append(dict(id=r["id"], shape=sh, geom=g, kind=r["shape"]))
        solids.append(dict(id=r["id"], cls="building", shape=sh))
    zones = {z["id"]: z for z in d["zones"]}
    wg = zones["well"]["geom"]
    solids.append(dict(id="well", cls="facility", shape=("circ", tuple(wg))))
    for i, b in enumerate(K["beds"]):
        solids.append(dict(id=f"bed{i}", cls="bed", owner="herb_garden", shape=("poly", _rp(b))))
    for i, b in enumerate(K["lists"]["rails"]):
        solids.append(dict(id=f"rail{i}", cls="rail", owner="lists", shape=("poly", _rp(b))))
    if "wallwalk" in d:  # current: solid masonry flights (+ top landing / tower wedge) from the shared wall-walk model
        WMx = walk_model(d)
        for sid, st in WMx["stairs"].items():
            for k, pc in enumerate(st["solid"]):
                solids.append(dict(id=f"{sid}.{k}", cls="wall_stair", stair=sid, shape=("poly", pc)))
        landings = {k: st["ground_landing"] for k, st in WMx["stairs"].items()}
    else:  # baselines: the old 2.8-square wall stairs
        for s in d["stairs"]:
            if s["kind"] == "wall stair":
                solids.append(dict(id=s["id"], cls="wall_stair", stair=s["id"], shape=("poly", _rp((s["x"] - s["r"], s["y"] - s["r"], s["x"] + s["r"], s["y"] + s["r"])))))
        landings = {k: _rp(v) for k, v in K["wall_stair_landings"].items()}
    areas = [dict(id=z["id"], shape=("poly", _rp(z["geom"])), buffer=K["lists"]["buffer"] if z["id"] == "lists" else 0.0)
             for z in d["zones"] if z["shape"] == "r"]
    areas += [dict(id=f"{k}_landing", shape=("poly", v), buffer=0.0) for k, v in landings.items()]
    return dict(solids=solids, bwalls=bwalls, rooms=rooms, gates=gates, areas=areas, landings=landings)


# ---------------------------------------------------------------- wall walk (+7) shared model
def _sat(P, Q):  # >0 = overlap depth of two convex polygons
    best = math.inf
    for poly in (P, Q):
        for i in range(len(poly)):
            a, b = poly[i], poly[(i + 1) % len(poly)]
            ax, ay = -(b[1] - a[1]), b[0] - a[0]
            L = math.hypot(ax, ay)
            if L < 1e-12:
                continue
            ax, ay = ax / L, ay / L
            pa = [q[0] * ax + q[1] * ay for q in P]
            pb = [q[0] * ax + q[1] * ay for q in Q]
            best = min(best, min(max(pa), max(pb)) - max(min(pa), min(pb)))
    return best


def _clip(P, Q):  # convex polygon P clipped to convex polygon Q (Sutherland-Hodgman)
    sgn = 1 if sum(Q[i][0] * Q[(i + 1) % len(Q)][1] - Q[(i + 1) % len(Q)][0] * Q[i][1] for i in range(len(Q))) > 0 else -1
    out = list(P)
    for i in range(len(Q)):
        a, b = Q[i], Q[(i + 1) % len(Q)]
        side = lambda p: sgn * ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]))
        inp, out = out, []
        for j in range(len(inp)):
            p, q = inp[j], inp[(j + 1) % len(inp)]
            sp, sq = side(p), side(q)
            if sp >= 0:
                out.append(p)
            if (sp >= 0) != (sq >= 0):
                t = sp / (sp - sq)
                out.append((p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t))
        if not out:
            break
    return out


def wall_frames(d):
    cur = [tuple(p) for p in d["curtain"]]
    F = {}
    for i in range(len(cur)):
        a, b = cur[i], cur[(i + 1) % len(cur)]
        u, L = _unit(a, b)
        n = (-u[1], u[0])
        if not _pip((a[0] + b[0]) / 2 + n[0] * 2, (a[1] + b[1]) / 2 + n[1] * 2, cur):
            n = (-n[0], -n[1])
        F[f"curtain{i}"] = dict(a=a, u=u, n=n, L=L)
    a, b = tuple(d["cross_wall"][0]), tuple(d["cross_wall"][1])
    u, L = _unit(a, b)
    n = (-u[1], u[0])
    if not _pip(a[0] + u[0] * L / 2 + n[0] * 2, a[1] + u[1] * L / 2 + n[1] * 2, d["wards"]["inner_court"]):
        n = (-n[0], -n[1])
    F["cross"] = dict(a=a, u=u, n=n, L=L)
    return F


def wP(f, s, o):
    return (f["a"][0] + f["u"][0] * s + f["n"][0] * o, f["a"][1] + f["u"][1] * s + f["n"][1] * o)


def wloc(f, p):
    dx, dy = p[0] - f["a"][0], p[1] - f["a"][1]
    return (dx * f["u"][0] + dy * f["u"][1], dx * f["n"][0] + dy * f["n"][1])


def _meet(f, o, g, og):  # s along f where f's offset line o meets g's offset line og
    A = wP(f, 0, o)
    den = f["u"][0] * g["n"][0] + f["u"][1] * g["n"][1]
    return (og - ((A[0] - g["a"][0]) * g["n"][0] + (A[1] - g["a"][1]) * g["n"][1])) / den


def _quad(f, o1, o2, l1, l2, r1, r2):
    return [wP(f, l1, o1), wP(f, r1, o1), wP(f, r2, o2), wP(f, l2, o2)]


def wrect(f, s0, s1, o0, o1):
    return _quad(f, o0, o1, s0, s0, s1, s1)


def _pieces(f, o1, o2, l, r, cuts):  # strip between offsets, start/end edges l/r (s at o1, s at o2), minus perpendicular cuts
    out, cl = [], l
    for c0, c1 in sorted(cuts):
        if c0 > max(cl) + 1e-9:
            rr = (min(c0, r[0]), min(c0, r[1]))
            if rr[0] > cl[0] + 1e-9 and rr[1] > cl[1] + 1e-9:
                out.append(_quad(f, o1, o2, cl[0], cl[1], rr[0], rr[1]))
        cl = (max(cl[0], c1), max(cl[1], c1))
    if r[0] > cl[0] + 1e-9 and r[1] > cl[1] + 1e-9:
        out.append(_quad(f, o1, o2, cl[0], cl[1], r[0], r[1]))
    return out


def walk_model(d):
    """+7 wall-walk shapes: domain (walkable floor), obst (parapets, rails, tower shells, guards), openings, support
    (what each +7 floor stands on), stairs, destinations. Shared by the renderer and validate.py."""
    W = d["wallwalk"]
    F = wall_frames(d)
    nseg = len(d["curtain"])
    sh = W["tower_shell"]
    towers = [(t["name"], t["x"], t["y"], t["r"]) for t in d["towers"]]
    gt = d["courtyard"]["gate_towers"]
    towers += [("S gate tower", *gt[0]), ("N gate tower", *gt[1])]
    cs = {k: (a, b) for k, a, b in W["curtain_strips"]}
    xs = {k: (a, b) for k, a, b in W["cross_strips"]}
    cr = F["cross"]
    domain, obst, openings, support, masonry = [], [], [], [], []

    def host(p):
        best = None
        for i in range(nseg):
            f = F[f"curtain{i}"]
            s, o = wloc(f, p)
            if -1e-6 <= s <= f["L"] + 1e-6 and (best is None or abs(o) < best[0]):
                best = (abs(o), i, s)
        return best[1], best[2]

    junctions = [host(tuple(p)) for p in d["cross_wall"]]
    rail_cuts = {i: [] for i in range(nseg)}
    for i, s in junctions:  # cross-wall deck enters the curtain deck through a gap in the inner rail
        f = F[f"curtain{i}"]
        ss = [_meet(f, ro, cr, co) for ro in cs["inner_rail"] for co in xs["deck"]]
        rail_cuts[i].append((min(ss), max(ss)))
        openings.append(dict(kind="rail", id=f"junction.curtain{i}", shape=("poly", wrect(f, min(ss), max(ss), *cs["inner_rail"]))))
    # ---- wall stairs
    fl = W["flight"]
    run = (fl["risers"] - 1) * fl["going"]
    stairs, cross_rail_cuts = {}, []
    for sid, st in W.get("stairs", {}).items():
        f = F[st["wall"]]
        o1, o2 = st["o"]
        g = st["guard"]
        s0 = st["s_foot"]
        s1 = s0 + run
        if st["top"] == "landing":
            ll = st["landing_len"]
            top = wrect(f, s1, s1 + ll, o1, o2)
            solid = [wrect(f, s0, s1 + ll + g, o1, o2 + g)]
            guards = [wrect(f, s1, s1 + ll + g, o2, o2 + g), wrect(f, s1 + ll, s1 + ll + g, o1, o2)]
            arrive = wP(f, s1 + ll / 2, (o1 + o2) / 2)
            cut = (s1, s1 + ll)
            if st["wall"] == "cross":
                cross_rail_cuts.append(cut)
                openings.append(dict(kind="rail", id=f"{sid}.rail_opening", shape=("poly", wrect(f, cut[0], cut[1], *xs["west_rail"]))))
                domain.append(dict(id=f"opening.{sid}", kind="stair_top", shape=("poly", wrect(f, cut[0], cut[1], *xs["west_rail"]))))
            into = "cross-wall deck through a %.1f opening in the west rail" % ll
        else:
            t = [q for q in towers if q[0] == st["tower"]][0]
            sc, oc = wloc(f, (t[1], t[2]))
            ri = t[3] - sh
            se = sc - math.sqrt(ri * ri - (o2 - oc) ** 2)
            top = wrect(f, s1, se + 0.1, o1, o2)
            guards = [wrect(f, s1, se, o2, o2 + g)]
            solid = [wrect(f, s0, s1, o1, o2 + g)]
            os_ = [o1 + (o2 + g - o1) * k / 4 for k in range(5)]
            arc = lambda o: sc - math.sqrt(t[3] ** 2 - (o - oc) ** 2)
            for a_, b_ in zip(os_, os_[1:]):  # masonry wedge from the flight head to the tower face
                solid.append([wP(f, s1, a_), wP(f, arc(a_), a_), wP(f, arc(b_), b_), wP(f, s1, b_)])
            arrive = wP(f, s1 + 0.6, (o1 + o2) / 2)
            into = f"{st['tower']} platform through an open-topped {o2 - o1:.1f} opening in its shell"
        gl = st["ground_landing"]
        stairs[sid] = dict(wall=st["wall"], s0=s0, s1=s1, o=(o1, o2), guard=g, run=run, rise=fl["risers"] * fl["riser"],
                           flight=wrect(f, s0, s1, o1, o2), solid=solid, top=top, guards=guards, into=into,
                           ground_landing=wrect(f, gl[0], gl[1], gl[2], gl[3]), foot=wP(f, (gl[0] + gl[1]) / 2, (gl[2] + gl[3]) / 2),
                           arrive=arrive, head=wrect(f, s1 - 0.2, s1 + 0.2, o1, o2),
                           treads=[(wP(f, s0 + k * fl["going"], o1), wP(f, s0 + k * fl["going"], o2)) for k in range(fl["risers"])],
                           up=(wP(f, s0 + 0.3, (o1 + o2) / 2), wP(f, s1 - 0.3, (o1 + o2) / 2)))
        domain.append(dict(id=f"top.{sid}", kind="stair_top", shape=("poly", top)))
        for k, gd in enumerate(guards):
            obst.append(dict(id=f"guard.{sid}.{k}", kind="stair_guard", shape=("poly", gd)))
        for pc in solid:
            support.append(dict(id=f"stair.{sid}", shape=("poly", pc)))
    for sid, rc in W.get("loose_tops", {}).items():  # baseline reconstruction only: old squares read as +7 tops
        domain.append(dict(id=f"top.{sid}", kind="stair_top", shape=("poly", _rp(rc))))

    # ---- curtain decks and parapets (mitered at the corners, cut where towers stand)
    def tcuts(f, o1, o2):
        out = []
        for nm, x, y, r in towers:
            sc, oc = wloc(f, (x, y))
            if sc < -r or sc > f["L"] + r or abs(oc) > r + 2:
                continue
            m = max(abs(o1 - oc), abs(o2 - oc))  # cut only where the whole strip is inside the platform: it runs through the shell
            ri = r - sh
            if m < ri:
                e = math.sqrt(ri * ri - m * m)
                out.append((sc - e, sc + e))
        return out

    for i in range(nseg):
        f, pv, nx = F[f"curtain{i}"], F[f"curtain{(i - 1) % nseg}"], F[f"curtain{(i + 1) % nseg}"]
        for name, o1, o2 in W["curtain_strips"]:
            l = (_meet(f, o1, pv, o1), _meet(f, o2, pv, o2))
            r = (_meet(f, o1, nx, o1), _meet(f, o2, nx, o2))
            if name == "deck":
                domain.append(dict(id=f"deck.curtain{i}", kind="deck", shape=("poly", _quad(f, o1, o2, *l, *r))))
            else:
                cuts = tcuts(f, o1, o2) + (rail_cuts[i] if name == "inner_rail" else [])
                for k, pc in enumerate(_pieces(f, o1, o2, l, r, cuts)):
                    obst.append(dict(id=f"{name}.curtain{i}.{k}", kind=name, shape=("poly", pc)))
        lo, hi = W["curtain_strips"][0][1], W["curtain_strips"][-1][2]
        q = _quad(f, lo, hi, _meet(f, lo, pv, lo), _meet(f, hi, pv, hi), _meet(f, lo, nx, lo), _meet(f, hi, nx, hi))
        support.append(dict(id=f"curtain{i}", shape=("poly", q)))
        masonry.append(("poly", q))
    # ---- cross wall deck and parapets, through the inner gatehouse
    f0, f1 = F[f"curtain{junctions[0][0]}"], F[f"curtain{junctions[1][0]}"]
    jm = W["junction_rail_mid"]
    Gi = [g for g in d["gates"] if g["id"] == "G_inner"][0]
    gdi = d["courtyard"]["gate_detail"]["G_inner"]
    sg = wloc(cr, (Gi["x"], Gi["y"]))[0]
    hl, hd, gs = gdi["gatehouse_half_len"], gdi["jamb_half_depth"], W["gatehouse_shell"]
    for name, o1, o2 in W["cross_strips"]:
        if name == "deck":
            l = (_meet(cr, o1, f0, 0.0), _meet(cr, o2, f0, 0.0))
            r = (_meet(cr, o1, f1, 0.0), _meet(cr, o2, f1, 0.0))
            domain.append(dict(id="deck.cross", kind="deck", shape=("poly", _quad(cr, o1, o2, *l, *r))))
        else:
            l = (_meet(cr, o1, f0, jm), _meet(cr, o2, f0, jm))
            r = (_meet(cr, o1, f1, jm), _meet(cr, o2, f1, jm))
            cuts = [(sg - hl, sg + hl)] + (cross_rail_cuts if name == "west_rail" else [])
            for k, pc in enumerate(_pieces(cr, o1, o2, l, r, cuts)):
                obst.append(dict(id=f"{name}.cross.{k}", kind=name, shape=("poly", pc)))
    lo, hi = W["cross_strips"][0][1], W["cross_strips"][-1][2]
    q = _quad(cr, lo, hi, _meet(cr, lo, f0, 0.0), _meet(cr, hi, f0, 0.0), _meet(cr, lo, f1, 0.0), _meet(cr, hi, f1, 0.0))
    support.append(dict(id="cross", shape=("poly", q)))
    masonry.append(("poly", q))
    dk = xs["deck"]
    domain.append(dict(id="platform.G_inner", kind="gatehouse", shape=("poly", wrect(cr, sg - hl + gs, sg + hl - gs, -(hd - gs), hd - gs))))
    shell = [wrect(cr, sg - hl, sg + hl, -hd, -(hd - gs)), wrect(cr, sg - hl, sg + hl, hd - gs, hd)]
    for e0, e1 in ((sg - hl, sg - hl + gs), (sg + hl - gs, sg + hl)):
        shell += [wrect(cr, e0, e1, -(hd - gs), dk[0]), wrect(cr, e0, e1, dk[1], hd - gs)]
        openings.append(dict(kind="gatehouse", id="G_inner.door", shape=("poly", wrect(cr, e0, e1, dk[0], dk[1]))))
    for k, pc in enumerate(shell):
        obst.append(dict(id=f"shell.G_inner.{k}", kind="gatehouse_shell", shape=("poly", pc)))
    blk = wrect(cr, sg - hl, sg + hl, -hd, hd)
    support.append(dict(id="G_inner.block", shape=("poly", blk)))
    masonry.append(("poly", blk))
    # ---- towers: open +7 platforms; shell sectors removed only where a deck or stair top passes through
    opens = [dm["shape"][1] for dm in domain if dm["kind"] in ("deck", "stair_top")]
    N = W["tower_sectors"]
    for nm, x, y, r in towers:
        ri = r - sh
        domain.append(dict(id=f"platform.{nm}", kind="tower", shape=("circ", (x, y, ri))))
        support.append(dict(id=nm, shape=("circ", (x, y, r))))
        masonry.append(("circ", (x, y, r)))
        for k in range(N):
            a0, a1 = 2 * math.pi * k / N, 2 * math.pi * (k + 1) / N
            pc = [(x + ri * math.cos(a0), y + ri * math.sin(a0)), (x + r * math.cos(a0), y + r * math.sin(a0)),
                  (x + r * math.cos(a1), y + r * math.sin(a1)), (x + ri * math.cos(a1), y + ri * math.sin(a1))]
            hit = [o for o in opens if _sat(pc, o) > 1e-6]
            if hit:  # doorway gap: open-topped; its floor is the sector clipped to the deck / stair top passing through
                openings.append(dict(kind="tower", id=f"{nm}.door", shape=("poly", pc)))
                for o in hit:
                    cp = _clip(pc, o)
                    if len(cp) >= 3:
                        domain.append(dict(id=f"door.{nm}", kind="door", shape=("poly", cp)))
            else:
                obst.append(dict(id=f"shell.{nm}.{k}", kind="tower_shell", shape=("poly", pc)))
    # ---- destinations (+7)
    dests = {}
    for sid, s in stairs.items():
        dests[f"{sid} top (+7)"] = s["arrive"]
    for nm, x, y, r in towers:
        dests[f"{nm} (+7)"] = (x, y)
    for g in d["gates"]:
        if g["id"] == "G_inner":
            dests["inner gatehouse G_inner (+7)"] = wP(cr, sg, 0.1)
        else:
            i, s = host((g["x"], g["y"]))
            dests[f"over {g['id']} (+7)"] = wP(F[f"curtain{i}"], s, 0.15)
    for nm, (i, s) in zip(("N junction (+7)", "S junction (+7)"), junctions):
        dests[nm] = wP(F[f"curtain{i}"], s, 0.15)
    tw = {(round(t[1], 2), round(t[2], 2)) for t in towers}
    for i, p in enumerate(d["curtain"]):
        if (round(p[0], 2), round(p[1], 2)) not in tw:
            dests[f"corner ({p[0]:g},{p[1]:g}) (+7)"] = wP(F[f"curtain{i}"], 1.0, 0.15)
    legs = [(a, b) for a, b in zip(W["patrol"], W["patrol"][1:])] + [tuple(x) for x in W["spurs"]] if W.get("stairs") else []
    return dict(frames=F, domain=domain, obst=obst, openings=openings, support=support, masonry=masonry, stairs=stairs,
                dests=dests, legs=legs, towers=towers, junctions=junctions, gate_s={"G_inner": sg})


def design():
    d = {
        "status": "PROPOSAL - NOT IMPLEMENTED / OPUS-AUTHORED", "units": "1 cell = 1 world unit; x east, y = +Z south (camera side)",
        "floor_heights": FLOORS, "curtain": CURTAIN, "curtain_thickness": 2.2, "cross_wall_thickness": 1.8,
        "cross_wall": CROSS, "wards": WARDS, "courtyard": COURT, "wallwalk": WALK,
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
            "Wall walk: the +7 patrol architecture is now detailed; whether the game makes it playable is a separate implementation decision.",
            "Camera cutaway: south-facing walls render at 1.2 in game, which would hide the +7 walk on those faces - needs a runtime rule.",
            "Postern cliff stair destination depends on the future island edge shape."],
    }
    d = json.loads(json.dumps(d))
    wm = walk_model(d)
    for s in d["stairs"]:
        if s["id"] in wm["stairs"]:
            st = wm["stairs"][s["id"]]
            pts = st["flight"]
            s["x"], s["y"] = round(sum(p[0] for p in pts) / 4, 2), round(sum(p[1] for p in pts) / 4, 2)
            s["r"] = 0.8
            s["footprint"] = [[round(a, 3), round(b, 3)] for a, b in pts]
            s["ground_landing"] = [[round(a, 3), round(b, 3)] for a, b in st["ground_landing"]]
            s["top"] = [[round(a, 3), round(b, 3)] for a, b in st["top"]]
            s["arrives"] = st["into"]
    d["wallwalk_derived"] = {"destinations_+7": {k: [round(v[0], 2), round(v[1], 2)] for k, v in wm["dests"].items()},
                             "legs": wm["legs"], "deck_clear_widths": {"curtain": 1.3, "cross": 1.2}}
    return d


def write_design():
    global MODEL, WM, DESIGN
    d = design()
    DESIGN = d
    MODEL = court_model(d, d["courtyard"])
    WM = walk_model(d)
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

    def doc(s):
        body = "\n".join(s.o)
        return (f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="{s.w}" height="{s.h}" '
                f'viewBox="0 0 {s.w} {s.h}">\n{body}\n</svg>\n')

    def png_uri(s, zoom=2):  # raster of this (sub)sheet: the PDF/PNG renderer does not clip nested viewports
        import base64
        import fitz
        d = fitz.open(stream=s.doc().encode("utf-8"), filetype="svg")
        return "data:image/png;base64," + base64.b64encode(d[0].get_pixmap(matrix=fitz.Matrix(zoom, zoom)).tobytes("png")).decode()

    def save(s, name):
        svg = s.doc()
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
    wh = COURT["wall_half"]
    for i in range(len(CURTAIN)):
        a, b = CURTAIN[i], CURTAIN[(i + 1) % len(CURTAIN)]
        svg.line(m.pts([a, b]), C["wall"], 2 * wh["curtain"] * sc)
        svg.line(m.pts([a, b]), C["walltop"] if not walk else "#d8a860", 0.9 * sc)
    svg.line(m.pts(CROSS), C["wall"], 2 * wh["cross"] * sc)
    svg.line(m.pts(CROSS), C["walltop"] if not walk else "#d8a860", 0.7 * sc)
    for x, y, r, h, n in TOWERS:
        svg.circle(*m.p(x, y), r * sc, C["slate"], C["wall"], 0.5 * sc)
        svg.circle(*m.p(x, y), r * sc * 0.45, C["slate2"])
    # gates: inner gatehouse block, then the true passage apertures (width x wall depth), then the twin-D towers
    for G in MODEL["gates"]:
        if "block" in G:
            svg.poly(m.pts(G["block"]), C["slate"], C["wall"], 0.25 * sc)
    for G in MODEL["gates"]:
        svg.poly(m.pts(G["passage"]), "#d8c69c", C["ink"], 1)
    for x, y, r in GATE["towers"]:
        svg.circle(*m.p(x, y), r * sc, C["slate"], C["wall"], 0.4 * sc)
        svg.circle(*m.p(x, y), r * sc * 0.4, C["slate2"])


def draw_court(svg, m, stairs=True):
    """Yard fixtures and reserves straight from MODEL (the same shapes validate.py tests)."""
    for s in MODEL["solids"]:
        if s["cls"] == "rail":
            svg.poly(m.pts(s["shape"][1]), "#8a6a40", "#5e3a1c", 0.8)
        elif s["cls"] == "bed":
            svg.poly(m.pts(s["shape"][1]), "#4f7a30", "#3a5a22", 0.6)
    if stairs:
        draw_flights(svg, m)
    for a in MODEL["areas"]:
        if a["id"].endswith("_landing"):
            svg.poly(m.pts(a["shape"][1]), "none", C["route_g"], 1.5, 'stroke-dasharray="3,2"')
    for G in MODEL["gates"]:
        for sw in G["sweeps"]:
            svg.poly(m.pts(sw), "none", C["red"], 1, 'stroke-dasharray="3,2"')
        for lf in G["leaves"]:
            svg.poly(m.pts(lf), "#5e3a1c")


def draw_flights(svg, m, labels=False, fs=11):
    """W1/W2 solid flights from the shared wall-walk model: masonry, treads, guard, +7 top, UP arrow."""
    for sid, st in WM["stairs"].items():
        for pc in st["solid"]:
            svg.poly(m.pts(pc), "#8c7560", C["ink"], 0.8)
        svg.poly(m.pts(st["flight"]), "#e6d6b0", C["ink"], 1)
        if m.sc >= 6:
            for a, b in st["treads"]:
                svg.line(m.pts([a, b]), C["ink"], 0.6 if m.sc < 12 else 0.9)
        svg.poly(m.pts(st["top"]), "#f0cf78", C["ink"], 1)
        for gd in st["guards"]:
            svg.poly(m.pts(gd), "#4a3a2c")
        a, b = st["up"]
        A, B = m.p(*a), m.p(*b)
        svg.line([A, B], C["red"], max(1.5, m.sc * 0.12))
        L = math.hypot(B[0] - A[0], B[1] - A[1])
        ux, uy = (B[0] - A[0]) / L, (B[1] - A[1]) / L
        h = max(5, m.sc * 0.45)
        svg.poly([(B[0] + ux * h, B[1] + uy * h), (B[0] - uy * h * 0.6, B[1] + ux * h * 0.6), (B[0] + uy * h * 0.6, B[1] - ux * h * 0.6)], C["red"])
        if labels:
            fx, fy = m.p(*st["foot"])
            svg.text(fx, fy + 4, "+0", fs, "#ffffff", "middle", "bold", bg=C["route_g"], pad=2)
            tx, ty = m.p(*st["arrive"])
            svg.text(tx, ty + 4, "+7", fs, C["ink"], "middle", "bold", bg="#f0cf78", pad=2)


def draw_walk(svg, m, openings=True):
    """+7 wall-walk floor, parapets and openings from the shared model (validate.py floods the same shapes)."""
    for dm in WM["domain"]:
        sh = dm["shape"]
        col = {"deck": "#e8c477", "tower": "#d9b56a", "gatehouse": "#d9b56a", "stair_top": "#f0cf78", "door": "#e8c477"}[dm["kind"]]
        if sh[0] == "circ":
            svg.circle(*m.p(sh[1][0], sh[1][1]), sh[1][2] * m.sc, col)
        else:
            svg.poly(m.pts(sh[1]), col)
    for ob in WM["obst"]:
        svg.poly(m.pts(ob["shape"][1]), "#4a3a2c" if ob["kind"] not in ("inner_rail", "west_rail", "stair_guard") else "#6e5844")
    if openings:
        for op in WM["openings"]:
            svg.poly(m.pts(op["shape"][1]), "#5fae4a")


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
    draw_court(svg, m)
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
         ("Herb garden", 24.5, 64.4), ("UPPER INNER COURT", 37.5, 51), ("TRAINING LISTS", 70.5, 37.4), ("Stables", 81, 24.6),
         ("Smithy", 83, 52.5), ("MUSTER YARD", 72, 52.5), ("Barracks", 60, 72.6), ("LOWER WARD", 62, 76),
         ("OUTER GATEHOUSE", 92, 66.5), ("INNER GATE", 58, 41), ("Postern", 8.5, 53), ("W1 stair ↑+7", 33.0, 60.0),
         ("W2 stair ↑+7", 72.0, 66.2)]
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
                                       ("guard", C["route_g"], "Guard: barracks → muster yard → W2 flight → SE tower +7 → gatehouse & wall-walk patrol (see WALL WALK sheet)"),
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
        if s[0] in ("S1", "S2"):
            stair_draw(svg, m, s, "G")
    draw_court(svg, m, stairs=True)
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
              ("HERB GARDEN", 24, 61.8), ("cross wall → lower ward", 52, 52), ("W1 ↑ +7 (25 risers)", 34.6, 57.0)]
    for t, x, y in labels:
        svg.text(*m.p(x, y), t, 13 if t.isupper() else 11, C["ink"], "middle", "bold" if t.isupper() else "normal", bg="#f6ecd4", pad=2)
    svg.text(*m.p(54, 41), "INNER GATE", 12, "#ffffff", "middle", "bold", bg=C["ink"])
    svg.text(*m.p(9.5, 59.5), "POSTERN", 12, "#ffffff", "middle", "bold", bg=C["ink"])
    compass_scale(svg, 90, 1010, m.sc, 6)
    px0 = 1000
    svg.rect(px0, 100, 680, 965, "#f6ecd4", C["ink"], 1.5, 'rx="6"')
    names = {r[0]: r[2] for r in ROOMS}
    names.update(inner_court="Inner court", lower_ward="Lower ward")
    rows = [f"{d[0]:<4} {names[d[7]]} ⇄ {names[d[8]]}  ({d[5]} wide, swings {d[6].upper()})" for d in DOORS if d[1] == "G"]
    y = panel_list(svg, px0 + 18, 128, "DOOR SCHEDULE (dashed red = swing reserve, keep clear)", rows, 12.5, 18)
    y = panel_list(svg, px0 + 18, y + 6, "STAIRS (S = fade pairs at the same x,z; W = built flights +0 → +7)",
                   [f"{s['id']}  @ ({s['x']}, {s['y']})  {s['kind']}" for s in DESIGN["stairs"][:2]] +
                   ["W1  flight along the cross wall, foot landing in the inner court → +7 landing (wall-walk sheet)",
                    "W2  flight along the SE curtain (lower ward) → SE tower +7 (wall-walk sheet)"], 12.5, 18)
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
    draw_walk(svg, m)
    draw_flights(svg, m, labels=True)
    svg.text(*m.p(57, 62.9), "WALL WALK +7: gold deck · dark parapets · green = openings", 12, C["ink"], "middle", "bold", bg="#f6ecd4")
    svg.text(*m.p(57, 64.5), "W2 and the full patrol loop: see the WALL-WALK sheet", 12, C["ink"], "middle", "bold", bg="#f6ecd4")
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
        "Gold = +7 wall walk (separate level): W flights, red arrow = up."], 12.5, 18)
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
    panel_list(svg, px0 + 18, sy + 345, "LEVELS · WALL WALK (+7) — proposed, not implemented", [
        "+5 = residence floors only. No door joins +5 rooms to the +7 walk.",
        "+7 = curtain deck 1.3 clear (2.2 wall: 0.6 parapet + 1.3 + 0.3 rail),",
        "  cross-wall deck 1.2 clear, open tower platforms, inner-gate platform.",
        "W1: foot landing +0 → 25 risers × 0.28 / 24 goings × 0.35 → +7 landing",
        "  1.4 × 1.4 → 1.4 opening in the west rail → cross-wall deck.",
        "W2: off-sheet. Lower ward → flight on the SE curtain → SE tower +7.",
        "Towers do not change level: decks pass through open-topped shell gaps.",
        "Gates: the walk crosses on vaults (soffits +4.5; postern +3.0).",
    ], 12, 17)
    svg.save("castle-v2-upper")


def walk_plan(svg, m, region, num=True, fs=11):
    x0, y0, x1, y1 = region
    svg.rect(*rpx(m, region), "#e9dcc0")
    svg.poly(m.pts(WARDS["inner_court"]), "#ddcfae")
    svg.poly(m.pts(WARDS["lower_ward"]), "#d6c4a0")
    grid(svg, m, x0, y0, x1, y1, 2 if m.sc > 12 else 4)
    for r in ROOMS:
        if r[1] == "G":
            room_shape(svg, m, r[3], "#cdbf9f", "#a89878", 1)
    for s in MODEL["solids"]:  # ground masonry footprint, under the +7 floor
        if s["cls"] in ("curtain", "cross", "tower", "gatehouse"):
            if s["shape"][0] == "circ":
                svg.circle(*m.p(*s["shape"][1][:2]), s["shape"][1][2] * m.sc, "#8c7560")
            else:
                svg.poly(m.pts(s["shape"][1]), "#8c7560")
    for G in MODEL["gates"]:
        if "block" in G:
            svg.poly(m.pts(G["block"]), "#8c7560")
    draw_walk(svg, m)
    draw_flights(svg, m, labels=True, fs=fs)
    for a in MODEL["areas"]:
        if a["id"].endswith("_landing"):
            svg.poly(m.pts(a["shape"][1]), "none", C["route_g"], 1.5, 'stroke-dasharray="3,2"')
    # patrol line along deck centres: drawn on the decks, through tower doorways, never across masonry
    F = WM["frames"]
    for k, f in F.items():
        o = 0.15 if k != "cross" else 0.1
        svg.line([m.p(*wP(f, 0, o)), m.p(*wP(f, f["L"], o))], C["route_g"], max(1.5, m.sc * 0.14), 'stroke-dasharray="6,4" opacity="0.85"')
    if num:
        for i, nm in enumerate(DEST_ORDER):
            x, y = WM["dests"][nm]
            px, py = m.p(x, y)
            svg.circle(px, py, 8.5, C["route_g"], "#ffffff", 1.5)
            svg.text(px, py + 4, str(i + 1), 10, "#ffffff", "middle", "bold")


DEST_ORDER = ["W1 top (+7)", "S junction (+7)", "South tower (+7)", "SE tower (+7)", "W2 top (+7)", "S gate tower (+7)",
              "over G_outer (+7)", "N gate tower (+7)", "East tower (+7)", "NE tower (+7)", "N junction (+7)",
              "inner gatehouse G_inner (+7)", "North tower (+7)", "NW tower (+7)", "corner (8,30) (+7)",
              "over G_postern (+7)", "Postern tower (+7)"]


def inset(svg, box, center, sc, title, notes):
    bx, by, bw, bh = box
    sub = Svg(bw, bh)
    cw, ch = bw / sc, bh / sc
    reg = (center[0] - cw / 2, center[1] - ch / 2, center[0] + cw / 2, center[1] + ch / 2)
    m = Map(0, 0, sc, reg[0], reg[1])
    walk_plan(sub, m, reg, num=False, fs=12)
    for t, x, y, kw in notes:
        sub.text(*m.p(x, y), t, 11, C["ink"], kw.get("anchor", "middle"), kw.get("weight", "normal"), bg="#f6ecd4", pad=2)
    svg.add(f'<image x="{bx}" y="{by}" width="{bw}" height="{bh}" xlink:href="{sub.png_uri()}"/>')
    svg.rect(bx, by, bw, bh, "none", C["ink"], 1.5)
    svg.rect(bx, by, bw, 22, C["ink"])
    svg.text(bx + 8, by + 16, title, 13, "#f3e6c4", weight="bold")
    return m


def wallwalk():
    svg = Svg(1700, 1100)
    frame(svg, "CASTLE v2 — WALL WALK (+7) · W1 / W2 · PATROL",
           "Supplemental detail to the upper sheet: physical decks, parapets, tower doorways, stair flights and landings — the shapes validate.py floods")
    m = Map(40, 105, 9.5, 3, 0)
    region = (3, 0, 101, 86.5)
    walk_plan(svg, m, region)
    svg.rect(0, 85, 40, 1000, C["paper"])
    svg.rect(0, 0, svg.w, 105, C["paper"])
    svg.rect(971, 85, 729, 1000, C["paper"])
    svg.rect(0, 927, 980, 150, C["paper"])
    bands(svg, svg.title, svg.sub)
    svg.rect(40, 105, 931, 822, "none", C["ink"], 1.5)
    for t, x, y in (("INNER COURT +0", 30, 47), ("LOWER WARD +0", 62, 62), ("INNER GATE", 57.5, 45.6), ("OUTER GATE", 90.5, 62.5),
                    ("POSTERN", 7.0, 59.5), ("cross-wall walk", 61, 30.5), ("curtain walk", 44, 3.2)):
        svg.text(*m.p(x, y), t, 11, C["ink"], "middle", "bold", bg="#f6ecd4", pad=2)
    # destination list under the plan
    svg.text(46, 948, "PATROL DESTINATIONS (+7) — blue dashed line = patrol on the deck centre; every leg is flooded by validate.py", 13, weight="bold")
    for i, nm in enumerate(DEST_ORDER):
        col, row = i // 6, i % 6
        svg.text(52 + col * 310, 968 + row * 17, f"{i + 1:>2}  {nm.replace(' (+7)', '')}", 12)
    # ---- right column: details
    px0 = 990
    W2 = WM["stairs"]["W2"]
    c2 = (80.5, 64.6)
    inset(svg, (px0, 100, 690, 330), c2, 15, "DETAIL A — W2: lower ward +0 → SE tower platform +7 (1 cell = 15 px)", [
        ("ground landing +0 (guard route ends here)", W2["foot"][0] - 6.2, W2["foot"][1] + 0.2, {}),
        ("25 risers ↑ along the curtain face", W2["foot"][0] - 7.6, (W2["foot"][1] + W2["arrive"][1]) / 2 + 0.4, {}),
        ("SE tower platform +7", 76, 72.4, {"weight": "bold"}),
        ("open-topped 1.4 shell opening", W2["arrive"][0] - 6.4, W2["arrive"][1] - 0.2, {}),
        ("S gate tower +7", 85.2, 65.4, {}), ("curtain deck +7 runs over the gate", 93.5, 57.2, {}),
        ("gate passage below, soffit +4.5", 93.0, 60.4, {}), ("muster yard", 72.0, 57.2, {}),
        ("curtain deck → South tower", 67.5, 73.6, {})])
    W1 = WM["stairs"]["W1"]
    c1 = ((W1["foot"][0] + W1["arrive"][0]) / 2 - 1.0, (W1["foot"][1] + W1["arrive"][1]) / 2 + 0.8)
    inset(svg, (px0, 445, 690, 285), c1, 15, "DETAIL B — W1: inner court +0 → cross-wall walk +7 (1 cell = 15 px)", [
        ("ground landing +0", W1["foot"][0] - 4.4, W1["foot"][1] + 0.2, {}),
        ("25 risers ↑ along the cross-wall face", (W1["foot"][0] + W1["arrive"][0]) / 2 - 6.2, (W1["foot"][1] + W1["arrive"][1]) / 2, {}),
        ("+7 landing 1.4 × 1.4", W1["arrive"][0] - 5.0, W1["arrive"][1] + 0.9, {}),
        ("1.4 rail opening → deck", W1["arrive"][0] + 4.4, W1["arrive"][1] - 0.6, {}),
        ("cross-wall deck 1.2 → inner gate", 48.5, 57.0, {}), ("junction: rail gap → curtain deck", 42.5, 71.4, {}),
        ("lower ward", 48, 64, {}), ("inner court", 29.5, 60, {})])
    # ---- section along W2 (cut on the flight centreline, looking from the lower ward)
    sy = 745
    svg.rect(px0, sy, 690, 320, "#f6ecd4", C["ink"], 1.5)
    svg.text(px0 + 12, sy + 20, "SECTION C — along the W2 flight centreline (s = metres along SE curtain), looking out from the ward", 13, weight="bold")
    s_lo, s_hi = 15.5, 33.0
    S = lambda s, z: (px0 + 40 + (s - s_lo) * 34, sy + 270 - z * 22)
    svg.rect(px0 + 20, S(0, 0)[1], 650, 20, C["cliff"])
    st = W2
    fl = WALK["flight"]
    pts = [S(st["s0"], 0)]
    for k in range(fl["risers"]):
        s_ = st["s0"] + k * fl["going"]
        pts += [S(s_, (k + 1) * fl["riser"]), S(s_ + (fl["going"] if k < fl["risers"] - 1 else 0), (k + 1) * fl["riser"])]
    sc_, oc_ = wloc(WM["frames"]["curtain4"], (76, 72))
    ri, ro = 3.2 - WALK["tower_shell"], 3.2
    mid = sum(st["o"]) / 2
    t_out = sc_ - math.sqrt(ro ** 2 - (mid - oc_) ** 2)
    t_in = sc_ - math.sqrt(ri ** 2 - (mid - oc_) ** 2)
    t_far = sc_ + math.sqrt(ri ** 2 - (mid - oc_) ** 2)
    svg.poly(pts + [S(st["s1"], 0)], "#8c7560", C["ink"], 1)
    svg.poly([S(st["s1"], 0), S(st["s1"], 7), S(t_far, 7), S(t_far, 0)], "#8c7560", C["ink"], 1)  # wedge + tower body
    svg.poly([S(t_out, 0), S(t_out, 7), S(t_in, 7), S(t_in, 0)], "#5e4a3a")  # shell below the floor
    svg.poly([S(t_far, 0), S(t_far, 9), S(t_far + 0.6, 9), S(t_far + 0.6, 0)], "#5e4a3a")
    svg.line([S(st["s1"], 7), S(t_far, 7)], "#c89a3a", 5)
    svg.poly([S(st["s1"], 7), S(t_in, 7), S(t_in, 7.9), S(st["s1"], 7.9)], "none", "#4a3a2c", 1, 'stroke-dasharray="3,2"')
    svg.poly([S(st["s0"] - 1.7, 0), S(st["s0"], 0), S(st["s0"], 0.15), S(st["s0"] - 1.7, 0.15)], C["route_g"])
    # avatar figures (source mesh height 2.15, runtime scale unmeasured)
    for s_, z_ in ((st["s0"] - 0.85, 0), (st["s1"] + 0.9, 7)):
        a, b = S(s_, z_)
        hpx = 2.15 * 22
        svg.rect(a - 0.45 * 34, b - hpx, 0.9 * 34, hpx, "#3f6fb0", C["ink"], 1, 'opacity="0.55"')
    for z, t in ((0, "+0 lower ward"), (7, "+7 threshold / tower platform"), (7.9, "+7.9 stair guard top"), (9, "+9 SE tower merlons")):
        a, b = S(s_hi, z)
        svg.line([(px0 + 20, b), (px0 + 670, b)], "#a89878", 0.8, 'stroke-dasharray="3,4"')
        svg.text(px0 + 24, b - 3, t, 11, bg="#f6ecd4", pad=1) if z != 0 else svg.text(px0 + 664, b + 14, t, 11, "#f6ecd4", "end")
    for t, s_, z_ in (("ground landing", st["s0"] - 0.85, -0.55), ("25 risers × 0.28 = 7.0 · 24 goings × 0.35 = 8.4 · pitch 38.7°", 23.3, 4.3),
                      ("solid flight, no space beneath", 24.2, 1.2), ("SE tower", (t_in + t_far) / 2, 4.0),
                      ("open-topped doorway, sky above", (st["s1"] + t_in) / 2 + 1.2, 8.55), ("avatar mesh 2.15 (scale unmeasured)", st["s0"] - 0.2, 2.75)):
        svg.text(*S(s_, z_), t, 11, C["ink"], "middle", bg="#f6ecd4", pad=1)
    svg.text(px0 + 20, sy + 312, "← gate (NW)", 12, weight="bold")
    svg.text(px0 + 670, sy + 312, "SE tower centre →", 12, anchor="end", weight="bold")
    svg.save("castle-v2-wallwalk")


MODEL = WM = DESIGN = None

if __name__ == "__main__":
    write_design()
    overview()
    ground()
    upper()
    wallwalk()
    print("wrote design.json and castle-v2-{overview,ground,upper,wallwalk}.svg/.png")
