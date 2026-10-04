"""One terrain-led town proposal. This is a drawing, never game construction.

Run: python tools/planning/hub_layout.py --check
     node tools/heavy.cjs "python tools/planning/hub_layout.py --draw"

Python 3.14, NumPy and Pillow; Chrome only rasterises the authored SVG.
Design method: land and drainage, connected street network, frontage parcels,
then building footprints. Geometry is checked before either picture is written.
"""
from pathlib import Path
import argparse
import json
import sys

sys.dont_write_bytecode = True

import numpy as np

from hub_geometry import (check_layout, distance_to_line, parcel, rectangle,
                          sample_line, smooth_line, surface)
from hub_draw import draw_plan, draw_sections, render

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "docs" / "blueprints" / "hub-town"
SCRATCH = ROOT / "inspect" / "town-plan-owner-notes"
SITE = (260, 220)
CELL = .45
CRAG = [(32, 16), (53, 10), (91, 12), (111, 23), (117, 37),
        (106, 48), (85, 55), (52, 52), (32, 40), (27, 28)]
MAIN = [(138.8, 178), (139, 169), (157, 164), (175, 155),
        (182, 143), (177, 135), (156, 137), (132, 139),
        (107, 136), (84, 131), (66, 123), (57, 112),
        (58, 101), (72, 96), (92, 101), (112, 108),
        (136, 112), (157, 109), (175, 100), (183, 90),
        (178, 80), (163, 75), (143, 76), (121, 80),
        (99, 79), (78, 74), (65, 66), (64, 61),
        (78, 61), (94, 60), (111, 58), (126, 53),
        (140, 46), (146, 32)]
RIVER = [(-6, 184), (35, 187), (72, 183), (106, 185),
         (140, 190), (175, 195), (214, 197), (266, 193)]
BURN = [(209, -5), (210, 25), (206, 52), (213, 81), (208, 105),
        (216, 133), (213, 156), (218, 180), (215, 197)]
MARKET = [(114, 112), (128, 114), (143, 113), (146, 119),
          (137, 126), (123, 127), (114, 122)]
ORCHARD = [(20, 101), (39, 98), (51, 105), (51, 121),
           (46, 137), (23, 136)]
BRIDGE = [(138.8, 178), (140.2, 201)]


def ground(x, z):
    """Rising north-facing coordinate profile, carved by one stream and river."""
    x, z = np.asarray(x), np.asarray(z)
    ridge = 2.5 * np.exp(-((x - 125) / 85) ** 2 - ((z - 100) / 110) ** 2)
    west = 5 * np.exp(-((x - 15) / 42) ** 2 - ((z - 95) / 140) ** 2)
    base = 2.4 + .23 * (177 - z) + ridge - west
    base += 3 * np.exp(-((x - 250) / 35) ** 2 - ((z - 95) / 95) ** 2)
    from hub_geometry import signed_distance
    cd = signed_distance(CRAG, x, z)
    crest = 44 + .025 * (28 - z)
    base = np.where(cd <= 0, crest, np.maximum(base, crest - 3.2 * cd))
    rd, _, _ = distance_to_line(smooth_line(RIVER), x, z)
    river_h = .84 - .006 * x
    base = np.minimum(base, river_h - .9 + np.maximum(0, rd - 5.7) * 1.0)
    bd, _, _ = distance_to_line(smooth_line(BURN), x, z)
    burn_h = .18 * (197 - z) + .84 - .006 * 215
    base = np.minimum(base, burn_h - .35 + np.maximum(0, bd - 1.7) * 1.25)
    south = z > np.interp(x, [p[0] for p in RIVER], [p[1] for p in RIVER]) + 8
    base = np.where(south, np.maximum(base, 1.2 + .035 * (z - 197)), base)
    return base


def street(name, points, width, kind="street"):
    line = smooth_line(points)
    heights = ground(line[:, 0], line[:, 1])
    if kind == "street":
        # A narrow cut/fill street bench, never a flattened neighbourhood.
        steps = np.linalg.norm(np.diff(line, axis=0), axis=1) * .17
        for _ in range(12):
            for i in range(1, len(heights)):
                heights[i] = np.clip(heights[i], heights[i-1]-steps[i-1],
                                     heights[i-1]+steps[i-1])
            for i in range(len(heights)-2, -1, -1):
                heights[i] = np.clip(heights[i], heights[i+1]-steps[i],
                                     heights[i+1]+steps[i])
    if kind == "bridge":
        heights = np.linspace(heights[0],max(3.0,heights[-1]),len(line))
    if name == "South Road":
        heights = np.linspace(3.0,heights[-1],len(line))
    return {"id": name, "line": line, "width": width, "kind": kind,
            "heights": heights}


def lot(world, name, anchor, w, d, yard, roof, storeys=2, side=-1,
        role=None, form="gable", setback=1.8):
    """Parcel and door derive from a street frontage, not arbitrary roof rotation."""
    road = world["streets"][0]
    p, t, h = sample_line(road["line"], road["heights"], anchor)
    n = np.array([-t[1], t[0]])
    if n[1] * side < 0:
        n = -n
    w, d = round(w / CELL) * CELL, round(d / CELL) * CELL
    front = p + n * (road["width"]/2 + setback)
    depth = d + yard
    outline = parcel(front, t, n, w + 2.7, depth + .9)
    c = front + n * (d/2 + .45)
    building = rectangle(c, t, n, w, d)
    if form == "court":
        # One L-shaped frontage building; the open corner remains a real court.
        left = front - t*w/2 + n*.45
        building = [left, left+t*w, left+t*w+n*d*.52,
                    left+t*w*.63+n*d*.52, left+t*w*.63+n*d,
                    left+n*d]
    door = front + n*.45
    world["lots"].append({"id": name, "parcel": outline, "building": building,
                          "front": front, "door": door, "road": p, "t": t,
                          "n": n, "c": c, "width": w, "depth": d,
                          "floor": float(h + .1), "roof": roof,
                          "storeys": storeys, "role": role, "form": form})


def build():
    streets = [
        street("High Street", MAIN, 5.4),
        street("River Walk", [(42, 172), (79, 168), (112, 169),
                              (139, 169), (161, 172), (177, 176)], 4.5),
        street("Orchard Lane", [(66, 123), (54, 124), (54, 139),
                                (49, 150), (42, 159), (42, 172)], 3.2, "lane"),
        street("Field Track", [(42, 159), (20, 161), (0, 164)], 2.7, "lane"),
        street("South Road", [(140.2, 201), (137, 220)], 5.4),
        street("Court Steps", [(128, 111), (128, 117)], 3.6, "stairs"),
        street("Market Steps", [(126, 139), (124, 128)], 3.6, "stairs"),
        street("Brow Steps", [(118, 108), (118, 96), (118, 80)], 3.6, "stairs"),
        street("Rift Steps", [(171, 102), (171, 91), (169, 76)], 3.6, "stairs"),
        street("Royal Steps", [(146, 32), (133, 26), (120, 24), (111, 28)], 3.6, "stairs"),
        street("Stone Bridge", BRIDGE, 5.4, "bridge")
    ]
    world = {"site": SITE, "crag": CRAG, "ground": ground, "streets": streets,
             "river": smooth_line(RIVER), "burn": smooth_line(BURN),
             "market": MARKET, "orchard": ORCHARD, "lots": [],
             "portal": None}
    # Lower contour front. Deliberately leave the middle open to the market stair.
    lot(world, "Weaver House", (83, 131), 9.9, 7.2, 4.5, "ochre", 2)
    lot(world, "Carpenter House", (100, 135), 12.6, 8.1, 4.0, "shingle", 2)
    lot(world, "Forge Court", (161, 137), 18, 10.8, 3.1, "red", 1, role="Smithy", form="court")
    lot(world, "Riverside Inn", (133, 139), 18, 11.25, 2.2, "tile", 3, side=1,
        role="Quest givers", form="court")
    lot(world, "Boatwright House", (91, 133), 9, 7.2, 3.2, "shingle", 1, side=1)
    lot(world, "Bridge Cottage", (163, 163), 8.1, 6.75, 2.5, "ochre", 1, side=-1)
    # Market-facing plots. The approved bakery keeps its exact kit footprint.
    lot(world, "Bakery", (91, 101), 11.25, 8.1, 2.1, "tile", 2, role="Approved bakery")
    lot(world, "Tailor House", (105, 105), 8.1, 6.75, 2.2, "red", 2)
    lot(world, "Supply Shop", (127, 111), 12.15, 8.1, 3.1, "ochre", 2, role="Shop")
    lot(world, "Counting House", (154, 109), 15.3, 9.9, 4.2, "slate", 2, role="Bank", form="court", setback=2.2)
    # Upper contour front: compact homes with defined rear gardens.
    lot(world, "Mason House", (102, 79), 10.8, 8.1, 2.1, "shingle", 2)
    lot(world, "Candle House", (126, 80), 9, 6.75, 3.0, "tile", 2)
    lot(world, "Upper Guild", (146, 76), 12.6, 8.1, 3.8, "slate", 2)
    # A portal court, entered directly from the upper street. No isolated Tor.
    road = streets[0]
    p, t, h = sample_line(road["line"], road["heights"], (168, 76))
    n = np.array([-t[1], t[0]])
    if n[1] > 0:
        n = -n
    front = p + n * (road["width"]/2 + 1.8)
    world["portal"] = {"c": front + n*8.6, "poly": parcel(front,t,n,18,18),
                       "front": front, "road": p, "floor": float(h+.1), "t":t,"n":n}
    reference = {**world, "streets": [s for s in streets if s["kind"] != "stairs"]}
    for stairs in streets:
        if stairs["kind"] != "stairs":
            continue
        line = stairs["line"]
        chain = np.r_[0,np.cumsum(np.linalg.norm(np.diff(line,axis=0),axis=1))]
        ends = [float(surface(reference,*p)) for p in (line[0],line[-1])]
        stairs["heights"] = np.interp(chain,[0,chain[-1]],ends)
    return world


def main():
    args = argparse.ArgumentParser(description=__doc__)
    args.add_argument("--check", action="store_true")
    args.add_argument("--draw", action="store_true")
    options = args.parse_args()
    world = build()
    results = check_layout(world)
    print(json.dumps(results, indent=2))
    if options.draw:
        OUTPUT.mkdir(parents=True, exist_ok=True)
        SCRATCH.mkdir(parents=True, exist_ok=True)
        for name, svg, size in [
            ("hub-plan", draw_plan(world), (1800, 1600)),
            ("hub-sections", draw_sections(world), (1800, 1300))
        ]:
            target = OUTPUT / (name + ".svg")
            target.write_text(svg, encoding="utf-8")
            render(target, OUTPUT / (name + ".png"), size, SCRATCH)
        (SCRATCH / "spatial-check.json").write_text(json.dumps(results, indent=2),
                                                   encoding="utf-8")


if __name__ == "__main__":
    main()