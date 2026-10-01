"""Nonvisual checks for castle-v2 design.json (authored by Claude Opus). Reads only design.json beside this file."""
import json, math, os

D = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "design.json"), encoding="utf-8"))
HERO_R = 0.45
fails, notes = [], []


def pip(x, y, poly):
    inside = False
    for i in range(len(poly)):
        (x1, y1), (x2, y2) = poly[i], poly[i - 1]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            inside = not inside
    return inside


def in_room(r, x, y, tol=0.0):
    g = r["geom"]
    if r["shape"] == "c":
        return math.hypot(x - g[0], y - g[1]) <= g[2] + tol
    return g[0] - tol <= x <= g[2] + tol and g[1] - tol <= y <= g[3] + tol


def area(r):
    g = r["geom"]
    return math.pi * g[2] ** 2 if r["shape"] == "c" else (g[2] - g[0]) * (g[3] - g[1])


def rect_dist(rc, x, y):
    dx = max(rc[0] - x, 0, x - rc[2])
    dy = max(rc[1] - y, 0, y - rc[3])
    return math.hypot(dx, dy)


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


# 1 rooms inside the curtain and wholly in one ward
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

# 2 upper rooms are carried by ground rooms
for r in D["rooms"]:
    if r["floor"] != "U":
        continue
    g = r["geom"]
    if r["shape"] == "c":
        samples = [(g[0] + g[2] * 0.9 * math.cos(a), g[1] + g[2] * 0.9 * math.sin(a)) for a in [i * math.pi / 6 for i in range(12)]]
    else:
        samples = [(g[0] + (g[2] - g[0]) * i / 6, g[1] + (g[3] - g[1]) * j / 6) for i in range(7) for j in range(7)]
    bad = [s for s in samples if not any(q["floor"] == "G" and in_room(q, *s, 0.05) for q in D["rooms"])]
    if bad:
        fails.append(f"upper room {r['id']} unsupported at {bad[:2]}")
notes.append("upper-floor support: sampled 7x7 / 12-point rings")

# 3 doors: width, both sides touch the door, swing reserve clear
obst = {"G": [], "U": []}
for f in D["furniture"]:
    obst[f["floor"]].append((f["id"], f["rect"]))
for s in D["stairs"]:
    rc = [s["x"] - s["r"], s["y"] - s["r"], s["x"] + s["r"], s["y"] + s["r"]]
    for fl in ("G", "U"):
        obst[fl].append((s["id"], rc))
for d in D["doors"]:
    if d["width"] < 2:
        fails.append(f"door {d['id']} narrower than 2")
    for side in (d["a"], d["b"]):
        if side in rooms:
            r = rooms[side]
            g = r["geom"]
            if r["shape"] == "c":
                ok = abs(math.hypot(d["x"] - g[0], d["y"] - g[1]) - g[2]) <= 0.6
            else:
                ok = in_room(r, d["x"], d["y"], 0.01) and min(abs(d["x"] - g[0]), abs(d["x"] - g[2]), abs(d["y"] - g[1]), abs(d["y"] - g[3])) <= 0.01
            if not ok:
                fails.append(f"door {d['id']} not on boundary of {side}")
        elif side in wards and not pip(d["x"], d["y"], wards[side]):
            fails.append(f"door {d['id']} not in ward {side}")
    w, x, y = d["width"], d["x"], d["y"]
    dx, dy = {"n": (0, -1), "s": (0, 1), "e": (1, 0), "w": (-1, 0)}[d["swing"]]
    res = [x - w / 2, min(y, y + dy * w), x + w / 2, max(y, y + dy * w)] if d["wall"] == "h" else \
        [min(x, x + dx * w), y - w / 2, max(x, x + dx * w), y + w / 2]
    for oid, rc in obst[d["floor"]]:
        if oid.startswith("W"):
            continue
        if overlap(res, rc):
            fails.append(f"door {d['id']} swing reserve hits {oid}")
notes.append(f"doors: {len(D['doors'])} checked for width>=2, boundary contact, swing reserve vs furniture+stairs")

# 4 stair pairs: same x,z on both floors, inside a room on each floor
for s in D["stairs"]:
    if s["id"].startswith("S"):
        g = container("G", s["x"], s["y"])
        u = container("U", s["x"], s["y"])
        if g not in rooms or u is None:
            fails.append(f"stair {s['id']} not paired inside rooms on both floors ({g}, {u})")
        else:
            notes.append(f"stair {s['id']}: ground '{rooms[g]['name']}' <-> upper '{rooms[u]['name']}' at ({s['x']}, {s['y']})")
    else:
        c = container("G", s["x"], s["y"])
        if c not in wards:
            fails.append(f"wall stair {s['id']} not in a ward ({c})")

# 5 routes: every container change happens at a door/gate/opening; hero clearance from furniture
links = [(d["floor"], d["x"], d["y"], {d["a"], d["b"]}, d["width"]) for d in D["doors"]]
links += [(o["floor"], o["x"], o["y"], {o["a"], o["b"]}, o["width"]) for o in D["openings"]]
links += [("G", g["x"], g["y"], {g["a"], g["b"]}, g["width"]) for g in D["gates"]]
for name, rt in D["routes"].items():
    fl, P = rt["floor"], rt["points"]
    prev, n = container(fl, *P[0]), 0
    for (x1, y1), (x2, y2) in zip(P, P[1:]):
        steps = max(1, int(math.hypot(x2 - x1, y2 - y1) / 0.2))
        for k in range(1, steps + 1):
            x, y = x1 + (x2 - x1) * k / steps, y1 + (y2 - y1) * k / steps
            n += 1
            c = container(fl, x, y)
            if c is None:
                fails.append(f"route {name} leaves the floor at ({x:.1f},{y:.1f})")
                break
            if c != prev:
                if not any(lf == fl and {prev, c} == pair and math.hypot(x - lx, y - ly) <= lw / 2 + 0.6 for lf, lx, ly, pair, lw in links):
                    fails.append(f"route {name} passes {prev}->{c} through a wall at ({x:.1f},{y:.1f})")
                prev = c
            for oid, rc in obst[fl]:
                if oid[0] in "SW":
                    continue
                if rect_dist(rc, x, y) < HERO_R:
                    fails.append(f"route {name} clips {oid} at ({x:.1f},{y:.1f})")
                    break
    notes.append(f"route {name} ({fl}): {len(P)} waypoints, {n} samples, ends in {prev}")

print("\n".join("ok   " + s for s in notes))
fails = list(dict.fromkeys(fails))
print("\n".join("FAIL " + s for s in fails) if fails else "ALL CHECKS PASSED")
print("limits: rectangles/circles only; no wall thickness collision, no camera occlusion or navmesh test.")
