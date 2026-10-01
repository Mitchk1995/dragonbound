"""Checks for castle-v2 (authored by Claude Opus). PROPOSAL - NOT IMPLEMENTED.
Part A: the original room/door/stair/route checks on design.json.
Part B: physical courtyard checks on the SAME shapes the renderer draws (render.court_model), run on the current design
and on the unchanged baseline (baseline-before-courtyard/design.json plus its hard-coded drawing constants, transcribed below).
Writes courtyard-validation.json. Exit code 1 on any current failure or if the baseline conflict is not detected."""
import json, math, os, sys
from collections import deque

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from render import court_model, _box, _rp  # noqa: E402  (shared geometry; render.py main is not run)

D = json.load(open(os.path.join(HERE, "design.json"), encoding="utf-8"))
DB = json.load(open(os.path.join(HERE, "baseline-before-courtyard", "design.json"), encoding="utf-8"))
HERO_R = 0.45
fails, notes = [], []


def pip(x, y, poly):
    inside = False
    for i in range(len(poly)):
        (x1, y1), (x2, y2) = poly[i], poly[i - 1]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            inside = not inside
    return inside


# ================================================================ Part A (unchanged logic)
def in_room(r, x, y, tol=0.0):
    g = r["geom"]
    if r["shape"] == "c":
        return math.hypot(x - g[0], y - g[1]) <= g[2] + tol
    return g[0] - tol <= x <= g[2] + tol and g[1] - tol <= y <= g[3] + tol


def area(r):
    g = r["geom"]
    return math.pi * g[2] ** 2 if r["shape"] == "c" else (g[2] - g[0]) * (g[3] - g[1])


def rect_dist(rc, x, y):
    return math.hypot(max(rc[0] - x, 0, x - rc[2]), max(rc[1] - y, 0, y - rc[3]))


def overlap(a, b):
    return a[0] < b[2] and b[0] < a[2] and a[1] < b[3] and b[1] < a[3]


rooms = {r["id"]: r for r in D["rooms"]}
wards = D["wards"]


def container(fl, x, y):
    cands = [r for r in D["rooms"] if r["floor"] == fl and in_room(r, x, y, 0.5 if r["shape"] == "c" else 0.0)]
    if cands:
        return min(cands, key=area)["id"]
    if fl == "U":
        return None
    for w, poly in wards.items():
        if pip(x, y, poly):
            return w
    return "outside"


for r in D["rooms"]:
    g = r["geom"]
    pts = [(g[0] + g[2] * math.cos(a), g[1] + g[2] * math.sin(a)) for a in [i * math.pi / 8 for i in range(16)]] if r["shape"] == "c" \
        else [(g[0], g[1]), (g[2], g[1]), (g[2], g[3]), (g[0], g[3]), ((g[0] + g[2]) / 2, (g[1] + g[3]) / 2)]
    ws = {w for x, y in pts for w, p in wards.items() if pip(x, y, p)}
    if not all(pip(x, y, D["curtain"]) for x, y in pts):
        fails.append(f"room {r['id']} leaves the curtain")
    elif len(ws) != 1:
        fails.append(f"room {r['id']} straddles wards {ws}")
notes.append(f"rooms-in-curtain/one-ward: {len(D['rooms'])} rooms checked")
for r in D["rooms"]:
    if r["floor"] != "U":
        continue
    g = r["geom"]
    samples = [(g[0] + g[2] * 0.9 * math.cos(a), g[1] + g[2] * 0.9 * math.sin(a)) for a in [i * math.pi / 6 for i in range(12)]] \
        if r["shape"] == "c" else [(g[0] + (g[2] - g[0]) * i / 6, g[1] + (g[3] - g[1]) * j / 6) for i in range(7) for j in range(7)]
    bad = [s for s in samples if not any(q["floor"] == "G" and in_room(q, *s, 0.05) for q in D["rooms"])]
    if bad:
        fails.append(f"upper room {r['id']} unsupported at {bad[:2]}")
notes.append("upper-floor support: sampled 7x7 / 12-point rings")
obst = {"G": [], "U": []}
for f in D["furniture"]:
    obst[f["floor"]].append((f["id"], f["rect"]))
for s in D["stairs"]:
    for fl in ("G", "U"):
        obst[fl].append((s["id"], [s["x"] - s["r"], s["y"] - s["r"], s["x"] + s["r"], s["y"] + s["r"]]))
yard_door_swings = []
for d in D["doors"]:
    if d["width"] < 2:
        fails.append(f"door {d['id']} narrower than 2")
    for side in (d["a"], d["b"]):
        if side in rooms:
            g = rooms[side]["geom"]
            if rooms[side]["shape"] == "c":
                ok = abs(math.hypot(d["x"] - g[0], d["y"] - g[1]) - g[2]) <= 0.6
            else:
                ok = in_room(rooms[side], d["x"], d["y"], 0.01) and min(abs(d["x"] - g[0]), abs(d["x"] - g[2]), abs(d["y"] - g[1]), abs(d["y"] - g[3])) <= 0.01
            if not ok:
                fails.append(f"door {d['id']} not on boundary of {side}")
        elif side in wards and not pip(d["x"], d["y"], wards[side]):
            fails.append(f"door {d['id']} not in ward {side}")
    w, x, y = d["width"], d["x"], d["y"]
    dx, dy = {"n": (0, -1), "s": (0, 1), "e": (1, 0), "w": (-1, 0)}[d["swing"]]
    res = [x - w / 2, min(y, y + dy * w), x + w / 2, max(y, y + dy * w)] if d["wall"] == "h" else [min(x, x + dx * w), y - w / 2, max(x, x + dx * w), y + w / 2]
    for oid, rc in obst[d["floor"]]:
        if not oid.startswith("W") and overlap(res, rc):
            fails.append(f"door {d['id']} swing reserve hits {oid}")
    if d["floor"] == "G" and (d["a"] in wards or d["b"] in wards):
        room = d["a"] if d["a"] in rooms else d["b"]
        cx, cy = (res[0] + res[2]) / 2, (res[1] + res[3]) / 2
        yard_door_swings.append({"door": d["id"], "swings_into": room, "reserve_inside_building": in_room(rooms[room], cx, cy)})
        if not in_room(rooms[room], cx, cy):
            fails.append(f"yard door {d['id']} swings into the yard (reserve not modelled)")
notes.append(f"doors: {len(D['doors'])} checked for width>=2, boundary contact, swing reserve vs furniture+stairs; yard doors all swing inward")
for s in D["stairs"]:
    if s["id"].startswith("S"):
        g, u = container("G", s["x"], s["y"]), container("U", s["x"], s["y"])
        if g not in rooms or u is None:
            fails.append(f"stair {s['id']} not paired inside rooms on both floors ({g}, {u})")
    elif container("G", s["x"], s["y"]) not in wards:
        fails.append(f"wall stair {s['id']} not in a ward")
links = [(d["floor"], d["x"], d["y"], {d["a"], d["b"]}, d["width"]) for d in D["doors"]]
links += [(o["floor"], o["x"], o["y"], {o["a"], o["b"]}, o["width"]) for o in D["openings"]]
links += [("G", g["x"], g["y"], {g["a"], g["b"]}, g["width"]) for g in D["gates"]]
for name, rt in D["routes"].items():
    fl, P = rt["floor"], rt["points"]
    prev = container(fl, *P[0])
    for (x1, y1), (x2, y2) in zip(P, P[1:]):
        steps = max(1, int(math.hypot(x2 - x1, y2 - y1) / 0.2))
        for k in range(1, steps + 1):
            x, y = x1 + (x2 - x1) * k / steps, y1 + (y2 - y1) * k / steps
            c = container(fl, x, y)
            if c is None:
                fails.append(f"route {name} leaves the floor at ({x:.1f},{y:.1f})")
                break
            if c != prev:
                if not any(lf == fl and {prev, c} == pair and math.hypot(x - lx, y - ly) <= lw / 2 + 0.6 for lf, lx, ly, pair, lw in links):
                    fails.append(f"route {name} passes {prev}->{c} through a wall at ({x:.1f},{y:.1f})")
                prev = c
            for oid, rc in obst[fl]:
                if oid[0] not in "SW" and rect_dist(rc, x, y) < HERO_R:
                    fails.append(f"route {name} clips {oid} at ({x:.1f},{y:.1f})")
                    break
notes.append(f"interior/abstract routes: {len(D['routes'])} sampled at 0.2")


# ================================================================ Part B geometry (exact for convex polygons and circles)
def edges(P):
    return [(P[i], P[(i + 1) % len(P)]) for i in range(len(P))]


def pt_seg(p, a, b):
    dx, dy = b[0] - a[0], b[1] - a[1]
    L2 = dx * dx + dy * dy
    t = 0 if L2 == 0 else max(0, min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2))
    return math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy)


def inside_convex(p, P):
    s = [(b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) for a, b in edges(P)]
    return all(v >= 0 for v in s) or all(v <= 0 for v in s)


def sd_point(p, sh):  # signed distance point -> shape (negative inside)
    if sh[0] == "circ":
        x, y, r = sh[1]
        return math.hypot(p[0] - x, p[1] - y) - r
    d = min(pt_seg(p, a, b) for a, b in edges(sh[1]))
    return -d if inside_convex(p, sh[1]) else d


def sat_overlap(P, Q):
    best = math.inf
    for poly in (P, Q):
        for a, b in edges(poly):
            ax, ay = -(b[1] - a[1]), b[0] - a[0]
            L = math.hypot(ax, ay)
            if L < 1e-12:
                continue
            ax, ay = ax / L, ay / L
            pa = [q[0] * ax + q[1] * ay for q in P]
            pb = [q[0] * ax + q[1] * ay for q in Q]
            best = min(best, min(max(pa), max(pb)) - max(min(pa), min(pb)))
    return best


def clearance(A, B):
    """>0 gap, <0 penetration depth (SAT minimum overlap / circle depth). Exact for convex polygons and circles."""
    if A[0] == "circ" and B[0] == "circ":
        (x1, y1, r1), (x2, y2, r2) = A[1], B[1]
        return math.hypot(x1 - x2, y1 - y2) - r1 - r2
    if A[0] == "circ" or B[0] == "circ":
        c, P = (A, B) if A[0] == "circ" else (B, A)
        return sd_point(c[1][:2], P) - c[1][2]
    ov = sat_overlap(A[1], B[1])
    if ov > 0:
        return -ov
    return min(min(min(pt_seg(p, a, b) for a, b in edges(B[1])) for p in A[1]),
               min(min(pt_seg(p, a, b) for a, b in edges(A[1])) for p in B[1]))


clearance_pp = clearance


def bbox(sh):
    if sh[0] == "circ":
        x, y, r = sh[1]
        return (x - r, y - r, x + r, y + r)
    xs, ys = [p[0] for p in sh[1]], [p[1] for p in sh[1]]
    return (min(xs), min(ys), max(xs), max(ys))


# ================================================================ Part B checks
BASELINE_COURT = {  # transcribed from baseline-before-courtyard/render.py drawing code; its design.json omitted these
    "wall_half": {"curtain": 1.1, "cross": 0.9, "building": 0.45},  # line widths 2.2*sc, 1.8*sc, room stroke 0.9*sc
    "gate_towers": [[83.45, 62.77, 3.3], [87.1, 56.8, 3.3]],  # GATE["towers"]
    "gate_detail": {"G_outer": {"swing_to": "lower_ward", "leaves": 2, "jamb_half_depth": 1.1},
                    "G_inner": {"swing_to": "inner_court", "leaves": 2, "jamb_half_depth": 1.6, "gatehouse_half_len": 2.6},  # sq 2.6 x 1.6
                    "G_postern": {"swing_to": "inner_court", "leaves": 1, "jamb_half_depth": 1.1}},
    "lists": {"action": [62, 28, 76, 44], "rails": [[64 + i * 2.6 - 0.058, 30, 64 + i * 2.6 + 0.058, 42] for i in range(5)],  # 1px dashed lines
              "entry": [69, 44], "buffer": 0.5},
    "beds": [[19, 57.5 + i * 1.6 - 0.233, 29, 57.5 + i * 1.6 + 0.233] for i in range(4)],  # 4px strokes at 8.6 px/cell
    "wall_stair_landings": {"W1": [37.1, 58.6, 38.6, 61.4], "W2": [75.1, 60.6, 76.6, 63.4]},  # stair face + 1.5, not drawn in baseline
    "built_against": ["donjon_g", "hall", "screens", "buttery", "svc", "pantry", "kitchen", "armory", "chapel"],
    "route_reserve": {"approach": 2.4, "guard": 2.0, "service": 1.8, "postern": 1.6},
}
MASONRY = ("curtain", "cross", "tower", "gatehouse")
FACIL = ("building", "facility", "bed", "rail", "wall_stair")
R_RESERVE = 0.9  # 1.8-wide secondary circulation reserve used for the reachability flood


def run(Dx, K):
    M = court_model(Dx, K)
    S, F, allow = M["solids"], [], []
    mins = {}

    def note_min(key, v, what):
        if key not in mins or v < mins[key]["clearance"]:
            mins[key] = {"clearance": round(v, 3), "between": what}

    def finding(check, a, b, c, req, extra=""):
        F.append({"check": check, "a": a, "b": b, "clearance": round(c, 3), "required": req, "detail": extra})

    # 1 facility solids vs masonry
    for f in [s for s in S if s["cls"] in FACIL]:
        for w in [s for s in S if s["cls"] in MASONRY]:
            c = clearance_pp(f["shape"], w["shape"])
            if f["cls"] == "building" and f["id"] in K["built_against"] and w["cls"] in ("curtain", "tower"):
                if c < 0:
                    allow.append({"building": f["id"], "against": w["id"], "bond_depth": round(-c, 3)})
                continue
            req = -0.02 if f["cls"] == "wall_stair" else 0.0
            note_min("facility_vs_masonry", c, f"{f['id']} / {w['id']}")
            if c < req - 1e-9:
                finding("facility footprint vs wall/tower (drawn thickness)", f["id"], w["id"], c, req)
    # 2 facility solids vs each other and vs parked gate leaves
    fs = [s for s in S if s["cls"] in FACIL + ("leaf",)]
    for i, a in enumerate(fs):
        for b in fs[i + 1:]:
            if (a["cls"] == b["cls"] and a["cls"] in ("building", "bed", "rail", "leaf")) or "leaf" == a["cls"] == b["cls"]:
                continue
            c = clearance_pp(a["shape"], b["shape"])
            note_min("facility_vs_facility", c, f"{a['id']} / {b['id']}")
            if c < -1e-9:
                finding("facility vs facility / parked leaf", a["id"], b["id"], c, 0.0)
    # 3 open activity areas (incl. training action space, landings) vs every solid except their own fixtures
    for ar in M["areas"]:
        for s in S:
            if s.get("owner") == ar["id"]:
                continue
            c = clearance_pp(ar["shape"], s["shape"])
            key = "lists_action_vs_solids" if ar["id"] == "lists" else "areas_vs_solids"
            note_min(key, c, f"{ar['id']} / {s['id']}")
            if c < ar["buffer"] - 1e-9:
                finding("open/action area vs solid" + (" (lists buffer)" if ar["buffer"] else ""), ar["id"], s["id"], c, ar["buffer"])
    # 4 gate leaf sweeps vs solids (host wall/own jambs/leaves exempt: the sweep starts on their face) and vs areas
    sweeps = []
    for G in M["gates"]:
        worst = math.inf
        for k, sw in enumerate(G["sweeps"]):
            for s in S:
                if s.get("wall") == G["host"] or (s.get("gate") == G["id"] and s["cls"] in ("gatehouse", "leaf")):
                    continue
                c = clearance_pp(("poly", sw), s["shape"])
                worst = min(worst, c)
                if c < -1e-6:
                    finding("gate leaf sweep vs solid", f"{G['id']}_sweep{k}", s["id"], c, 0.0)
            for ar in M["areas"]:
                c = clearance_pp(("poly", sw), ar["shape"])
                worst = min(worst, c)
                if c < -1e-6:
                    finding("gate leaf sweep vs open area", f"{G['id']}_sweep{k}", ar["id"], c, 0.0)
        sweeps.append({"gate": G["id"], "width": G["width"], "leaves": len(G["sweeps"]), "leaf_len": G["width"] / len(G["sweeps"]),
                       "host_wall": G["host"], "gate_point_off_wall_line": round(G["off_line"], 3), "min_sweep_clearance": round(worst, 3)})
    # route obstacle set: buildings as wall bands with door gaps (interiors are Part A's domain)
    RS = [s for s in S if s["cls"] != "building"] + M["bwalls"]

    def dist_all(p, solids, skip=()):
        best, who = math.inf, None
        for s in solids:
            if s["id"] in skip:
                continue
            b = s.setdefault("_bb", bbox(s["shape"]))
            if p[0] < b[0] - best or p[0] > b[2] + best or p[1] < b[1] - best or p[1] > b[3] + best:
                continue
            v = sd_point(p, s["shape"])
            if v < best:
                best, who = v, s["id"]
        return best, who

    bh = K["wall_half"]["building"]
    yard_rooms = {d[k] for d in Dx["doors"] if d["floor"] == "G" and (d["a"] in Dx["wards"] or d["b"] in Dx["wards"]) for k in "ab"}

    def zone_of(p):
        for r in M["rooms"]:
            g = r["geom"]
            if r["kind"] == "c":  # round donjon: door gaps not modelled; it has no yard door, so its wall band is interior (Part A)
                assert r["id"] not in yard_rooms
                dd = math.hypot(p[0] - g[0], p[1] - g[1])
                if dd <= g[2] + bh:
                    return "interior"
            elif g[0] <= p[0] <= g[2] and g[1] <= p[1] <= g[3]:
                return "interior"  # inside the room outline (incl. inner half of its wall): Part A territory
        for r in M["rooms"]:
            g = r["geom"]
            if r["kind"] == "r" and g[0] - bh <= p[0] <= g[2] + bh and g[1] - bh <= p[1] <= g[3] + bh:
                return "band"  # yard-side half of a building wall: only a door gap lets the avatar through
        return "yard"

    lists_area = [a for a in M["areas"] if a["id"] == "lists"][0]
    routes = {}
    for name, res in K["route_reserve"].items():
        P = Dx["routes"][name]["points"]
        worst, at, n_y, n_b = math.inf, None, 0, 0
        for (x1, y1), (x2, y2) in zip(P, P[1:]):
            steps = max(1, int(math.ceil(math.hypot(x2 - x1, y2 - y1) / 0.1)))
            for k in range(steps + 1):
                p = (x1 + (x2 - x1) * k / steps, y1 + (y2 - y1) * k / steps)
                z = zone_of(p)
                if z == "interior":
                    continue
                req = HERO_R if z == "band" else res / 2
                n_y += z == "yard"
                n_b += z == "band"
                dd, who = dist_all(p, RS)
                if z == "yard":
                    dl = sd_point(p, lists_area["shape"])
                    if dl < dd:
                        dd, who = dl, "lists action space"
                m_ = dd - req
                if m_ < worst:
                    worst, at = m_, (round(p[0], 2), round(p[1], 2), who, z)
        routes[name] = {"reserve_width": res, "yard_samples": n_y, "door_band_samples(avatar .45)": n_b,
                        "min_margin_over_reserve": round(worst, 3), "at": at}
        if worst < -1e-9:
            finding("route circulation reserve", name, at[2], worst, f"reserve {res} wide (half {res / 2}), avatar {HERO_R} in door bands", f"at {at[:2]}")
    # 6 open-gate traversal along each gate axis with leaves parked open
    trav = []
    for G in M["gates"]:
        c, n, dep = G["c"], G["n"], G["depth"]
        ll = G["width"] / len(G["sweeps"])
        worst, who = math.inf, None
        t = -(dep + 3)
        while t <= dep + ll + 1.5 + 1e-9:
            dd, w_ = dist_all((c[0] + n[0] * t, c[1] + n[1] * t), RS)
            if dd < worst:
                worst, who = dd, w_
            t += 0.1
        trav.append({"gate": G["id"], "aperture_width": G["width"], "min_clear_half_width_on_axis": round(worst, 3), "limited_by": who,
                     "avatar_passes": worst >= HERO_R})
        if worst < HERO_R:
            finding("open-gate traversal (leaves parked)", G["id"], who, worst - HERO_R, HERO_R, "axis clear half-width below avatar radius")
    # 7 reachability flood over yard free space from outside the outer gate (gates open, leaves parked)
    gate = {G["id"]: G for G in M["gates"]}
    aprons = [_box((G["c"][0] - G["n"][0] * 3, G["c"][1] - G["n"][1] * 3), G["u"], G["width"] / 2 + 1, 3)
              for G in M["gates"] if G["exterior"]]
    dests = []
    for G in M["gates"]:
        c, n, dep = G["c"], G["n"], G["depth"]
        # a 2-wide postern leaves 0.1 either side of a 1.8 reserve: below the 0.25 grid, so its exterior is required at avatar
        # radius only here and its 1.6 reserve is checked exactly-sampled on the postern route instead
        dests.append((f"{G['id']} {'exterior' if G['exterior'] else 'lower-ward'} side", (c[0] - n[0] * (dep + 1.2), c[1] - n[1] * (dep + 1.2)),
                      G["width"] >= 2 * R_RESERVE + 0.5))
        dests.append((f"{G['id']} yard side", (c[0] + n[0] * (dep + 1.2), c[1] + n[1] * (dep + 1.2)), True))
    rm = {r["id"]: r for r in Dx["rooms"]}
    for d in Dx["doors"]:
        if d["floor"] == "G" and (d["a"] in Dx["wards"] or d["b"] in Dx["wards"]):
            g = rm[d["a"] if d["a"] in rm else d["b"]]["geom"]
            if d["wall"] == "h":
                o = (0, -1) if abs(d["y"] - g[1]) < 1e-6 else (0, 1)
            else:
                o = (-1, 0) if abs(d["x"] - g[0]) < 1e-6 else (1, 0)
            dests.append((f"door {d['id']} threshold", (d["x"] + o[0] * (bh + 1.0), d["y"] + o[1] * (bh + 1.0)), True))
    zs = {z["id"]: z for z in Dx["zones"]}
    wx, wy, wr = zs["well"]["geom"]
    dests.append(("well (east side)", (wx + wr + 1.2, wy), True))
    for zid in ("feast_court", "kitchen_yard", "muster", "lists"):
        g = zs[zid]["geom"]
        dests.append((f"{zid} centre", ((g[0] + g[2]) / 2, (g[1] + g[3]) / 2), True))
    e = K["lists"]["entry"]
    dests.append(("training lists entry", (e[0], e[1] + 1.0), True))
    g = zs["herb_garden"]["geom"]
    dests.append(("herb garden between beds", ((g[0] + g[2]) / 2, (g[1] + g[3]) / 2), False))
    dests.append(("herb garden west path", (g[0] - 0.5, (g[1] + g[3]) / 2), True))
    for k, v in K["wall_stair_landings"].items():
        dests.append((f"wall stair {k} landing", tuple(v), True))  # rect: reached if a free node stands on the landing
    step, X0, Y0, NX, NY = 0.25, -2.0, -2.0, 409, 377
    dom = bytearray(NX * NY)
    for j in range(NY):
        y = Y0 + j * step
        for i in range(NX):
            x = X0 + i * step
            if pip(x, y, Dx["curtain"]) or any(inside_convex((x, y), a) for a in aprons):
                dom[j * NX + i] = 1
    cov = {}
    for r_ in (HERO_R, R_RESERVE):
        free = bytearray(dom)
        for s in S:
            b = bbox(s["shape"])
            for j in range(max(0, int((b[1] - r_ - Y0) / step)), min(NY, int((b[3] + r_ - Y0) / step) + 2)):
                for i in range(max(0, int((b[0] - r_ - X0) / step)), min(NX, int((b[2] + r_ - X0) / step) + 2)):
                    k = j * NX + i
                    if free[k] and sd_point((X0 + i * step, Y0 + j * step), s["shape"]) < r_:
                        free[k] = 0
        G = gate["G_outer"]
        st = (G["c"][0] - G["n"][0] * (G["depth"] + 3), G["c"][1] - G["n"][1] * (G["depth"] + 3))
        si, sj = round((st[0] - X0) / step), round((st[1] - Y0) / step)
        seen = bytearray(NX * NY)
        q = deque()
        if free[sj * NX + si]:
            seen[sj * NX + si] = 1
            q.append((si, sj))
        while q:
            i, j = q.popleft()
            for a, b in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                ii, jj = i + a, j + b
                if 0 <= ii < NX and 0 <= jj < NY and free[jj * NX + ii] and not seen[jj * NX + ii]:
                    seen[jj * NX + ii] = 1
                    q.append((ii, jj))
        res_ = {}
        for nm, p, need in dests:
            if len(p) == 4:
                ok = any(seen[jj * NX + ii] for jj in range(int((p[1] - Y0) / step), int((p[3] - Y0) / step) + 1)
                         for ii in range(int((p[0] - X0) / step), int((p[2] - X0) / step) + 1)
                         if p[0] <= X0 + ii * step <= p[2] and p[1] <= Y0 + jj * step <= p[3])
            else:
                ci, cj = (p[0] - X0) / step, (p[1] - Y0) / step
                ok = any(seen[jj * NX + ii] for jj in range(int(cj) - 1, int(cj) + 3) for ii in range(int(ci) - 1, int(ci) + 3)
                         if 0 <= ii < NX and 0 <= jj < NY and math.hypot(X0 + ii * step - p[0], Y0 + jj * step - p[1]) <= 0.36)
            res_[nm] = ok
            if not ok and (r_ == HERO_R or need):
                finding(f"reachability (free radius {r_})", nm, "-", -1, "connected free space from outside the outer gate",
                        f"point {tuple(round(v, 2) for v in p)}")
        cov[str(r_)] = res_
    return M, F, allow, mins, routes, sweeps, trav, cov, dests


def summarise(F):
    out = {}
    for f in F:
        out.setdefault(f["check"], []).append(f)
    return {k: v for k, v in out.items()}


assert D["courtyard"]["lists"]["action"] == [z for z in D["zones"] if z["id"] == "lists"][0]["geom"], "lists zone and model diverge"
Mc, Fc, Ac, minc, Rc, Swc, Tc, Cc, dest_c = run(D, D["courtyard"])
Mb, Fb, Ab, minb, Rb, Swb, Tb, Cb, _ = run(DB, BASELINE_COURT)
detected = any(f["a"] == "lists" and f["b"].startswith("cross") for f in Fb)

print("\n".join("ok   " + s for s in notes))
fails = list(dict.fromkeys(fails))
print("\n".join("FAIL " + s for s in fails) if fails else "Part A: ALL CHECKS PASSED")
print(f"\nBASELINE courtyard findings: {len(Fb)}  (lists vs diagonal cross wall detected: {detected})")
for f in Fb:
    print(f"  base  {f['check']}: {f['a']} / {f['b']} clearance {f['clearance']} (req {f['required']}) {f['detail']}")
print(f"CURRENT courtyard findings: {len(Fc)}")
for f in Fc:
    print(f"  FAIL  {f['check']}: {f['a']} / {f['b']} clearance {f['clearance']} (req {f['required']}) {f['detail']}")
for k, v in minc.items():
    print(f"  min {k}: {v['clearance']} ({v['between']})")
for k, v in Rc.items():
    print(f"  route {k}: reserve {v['reserve_width']}, margin {v['min_margin_over_reserve']} at {v['at']}")
for t in Tc:
    print(f"  gate {t['gate']}: axis clear half-width {t['min_clear_half_width_on_axis']} ({t['limited_by']})")
print(f"  reachable @0.45: {sum(Cc['0.45'].values())}/{len(Cc['0.45'])}, @0.9: {sum(Cc['0.9'].values())}/{len(Cc['0.9'])}")
for a in Ac:
    print(f"  allowance (built against curtain/tower): {a}")

out = {
    "status": "PROPOSAL - NOT IMPLEMENTED / OPUS-AUTHORED",
    "author": "Claude Opus (claude-opus-5-5[1m]) - validate.py",
    "method": {
        "shared_geometry": "render.court_model() builds every courtyard shape; render.py draws those shapes and this script tests the same objects. Baseline is run through the same function with its design.json plus transcribed hard-coded drawing constants (BASELINE_COURT).",
        "exact": "Footprint/area/sweep clearances use exact convex-polygon (SAT + vertex-edge) and circle distances; negative = penetration depth.",
        "sampled": "Routes sampled every 0.1 cell (error <= 0.05); gate axes every 0.1; reachability flood on a 0.25 grid with free-radius 0.45 (avatar) and 0.9 (1.8 circulation), 4-connected, destination counted if a reached node lies within 0.36.",
        "walls": "Curtain and cross wall are thick boxes per segment (round joints/caps as discs) with gate apertures cut at true orientation and width; building walls are 0.9 bands centred on room edges with door gaps cut (routes) or solid footprints (flood).",
        "gates": "Leaf sweeps are 90-degree sectors from hinges on the swing-side face (12 chords, circumscribed radius); parked open leaves are 0.15 x leaf-length solids at the jambs. Closed-gate blocking is expected and not tested as traversal.",
    },
    "tested_wall_half_widths": D["courtyard"]["wall_half"],
    "allowances": {"built_against": "Listed residence/service buildings may bond into curtain/towers (structural shared wall); reported, never applied to yard areas, fixtures or routes.",
                   "wall_stairs": "may touch their host wall (tolerance 0.02), never penetrate.",
                   "current_bonds": Ac, "baseline_bonds": Ab},
    "baseline": {"finding_count": len(Fb), "lists_vs_cross_wall_detected": detected, "findings": Fb,
                 "routes": Rb, "gate_traversal": Tb, "gate_sweeps": Swb,
                 "reachable_at_0.45": f"{sum(Cb['0.45'].values())}/{len(Cb['0.45'])}", "reachable_at_0.9": f"{sum(Cb['0.9'].values())}/{len(Cb['0.9'])}"},
    "current": {"finding_count": len(Fc), "findings": Fc, "minima": minc, "routes": Rc, "gate_traversal": Tc, "gate_sweeps": Swc,
                "reachability": Cc, "yard_door_swings": yard_door_swings, "part_a_fails": fails,
                "solids_tested": {c: sum(1 for s in Mc["solids"] if s["cls"] == c) for c in sorted({s["cls"] for s in Mc["solids"]})},
                "areas_tested": [a["id"] for a in Mc["areas"]]},
    "untested": ["wall walk (+7) circulation and W1/W2 upper landings", "building interiors beyond Part A furniture/route checks",
                 "kitchen-yard storage: none is drawn, so the yard is tested as open service area only",
                 "closed-gate state; portcullis; drawbridge", "outside-the-curtain approach beyond 6 cells from the gates"],
    "limits": "Planning-space checks of a 2D proposal. Training action/standing space is architectural planning space only - no combat, movement or in-game testing. No navmesh, camera occlusion, height or structural test.",
}
with open(os.path.join(HERE, "courtyard-validation.json"), "w", encoding="utf-8") as f:
    json.dump(out, f, indent=1, default=lambda o: list(o) if isinstance(o, tuple) else str(o))
ok = not fails and not Fc and detected
print("\nRESULT:", "PASS (current clear, baseline conflict detected)" if ok else "FAIL")
sys.exit(0 if ok else 1)
