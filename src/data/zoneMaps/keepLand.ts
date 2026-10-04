import type { Vec2 } from '../../types';
import { Cell, Fluid, Ground, type Strand } from '../../world/layout';
import * as castleApproach from '../../world/castle/approach';
import * as castleBailey from '../../world/castle/bailey';
import * as castleGround from '../../world/castle/ground';
import { inPoly, P } from './helpers';
import { BAY_PATH, FIELD_LANE, ISLAND, type KeepBuild } from './keepPlan';

/**
 * The island's land and levels, its roads (and the ramps they climb), its water and the cliffs where
 * two levels meet.
 */
export function layLand({ G, level, site, w, h }: KeepBuild) {
  // ─── The land and its levels ────────────────────────────────────────────────
  const outline = ISLAND.outline.map(([x, z]) => [x, z]);
  for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) {
    const px = x + 0.5, pz = z + 0.5;
    if (!inPoly(px, pz, outline)) continue;
    const i = G.idx(x, z);
    G.l.cells[i] = Cell.Ground;
    // The edges between levels wander (bays and spurs a few cells either side of the plan's lines).
    const wx = px + (G.noise(px * 0.07, pz * 0.07) - 0.5) * 8, wz = pz + (G.noise(px * 0.07 + 40, pz * 0.07 + 40) - 0.5) * 8;
    for (const lv of ISLAND.levels) if (inPoly(wx, wz, lv.poly)) level[i] = lv.h;
  }
  // The castle's crown, its natural edge drawn in the plan, and the bailey's turf on it.
  castleGround.crown(site);
  castleBailey.turf(site);

  // ─── Roads (laid before anything is built; ramps follow them between levels) ─
  const court = ISLAND.court;
  G.clearing(court.x, court.z, 14, Ground.Stone, 0.6);
  const roads: Record<string, Vec2[]> = {};
  // Every earth road is also kept as a strand (its centre line and half width), so the ground and the
  // grass carpet draw its edges as smooth curves rather than along the cell grid.
  const strands: Strand[] = (G.l.strands = []);
  const road = (id: string, pts: number[][], width: number, ground: Ground, wobble = 0.25) => {
    roads[id] = G.road(P(pts), width, ground, wobble);
    if (ground === Ground.Path || ground === Ground.Dirt) strands.push({ pts: roads[id], hw: width / 2, kind: 'path', ground });
    return roads[id];
  };
  // The ore lane runs west from the court along the foot of the castle rock past the foot of the
  // castle's stair to the smelter's ore door.
  road('ore_lane', [[163, 172], [152, 172.5], [149, 172.5]], 2.5, Ground.Path, 0);
  road('smithy', [[164, 179], [150, 182.5], [140.5, 182.5], [140.5, 179]], 3.4, Ground.Stone, 0.2);
  road('farm', [[144, 182.5], [130, 191], [123, 192], [110, 188], [98, 183], [91, 178.2]], 2.4, Ground.Path, 0);
  // Where the farm lane ends the spring path climbs to the viewing bay by the pool under the castle's
  // fall, and the field lane runs on west between the vegetable plots to the hay paddock's gate.
  road('spring', [[91, 178.2], [87.5, 172.5], [BAY_PATH.x, BAY_PATH.z]], 2.0, Ground.Path, 0);
  road('field', FIELD_LANE, 2.0, Ground.Path, 0);
  road('bank', [[189, 177], [200, 181], [208, 181], [208, 177]], 3.4, Ground.Stone, 0.2);
  road('market', [[181, 187], [184, 204], [195.5, 204], [195.5, 201]], 3.0, Ground.Stone, 0.2);
  road('alchemy', [[167, 185], [156, 200], [144, 220], [142, 226], [132.5, 226], [132.5, 222]], 2.6, Ground.Path, 0);
  road('memorial', [[176, 187], [176, 210], [177, 226], [179, 245]], 2.4, Ground.Path, 0);
  road('east', [[192, 178.1], [193, 158], [224, 140], [244, 134], [256, 124], [266, 119.5], [270, 119.5]], 2.6, Ground.Path, 0);
  road('upland', [[224, 140], [223, 124], [220, 114], [218, 96], [224, 84], [224, 76.5], [220, 76.5]], 2.4, Ground.Path, 0);

  // The castle's approach: the stair's flights and landings up the rock, the ledge, the gate terrace,
  // the bridge's deck, the landing and the lookout, laid before the rock is cut round them.
  castleApproach.levels(site);

  // Other ramps: where a road crosses between levels, its cells take a smoothed profile of the levels
  // under it (a 26-cell running average), so it climbs steadily instead of stepping.
  for (const id of ['upland']) {
    const poly = roads[id];
    const steps: { x: number; z: number; v: number }[] = [];
    for (let k = 0; k < poly.length - 1; k++) {
      const a = poly[k], b = poly[k + 1], n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.5));
      for (let j = 0; j < n; j++) {
        const x = a.x + ((b.x - a.x) * j) / n, z = a.z + ((b.z - a.z) * j) / n;
        steps.push({ x, z, v: G.inside(Math.floor(x), Math.floor(z)) ? level[G.idx(Math.floor(x), Math.floor(z))] : 0 });
      }
    }
    const win = 26;
    const smooth = steps.map((_, k) => {
      let s = 0, n = 0;
      for (let j = Math.max(0, k - win); j <= Math.min(steps.length - 1, k + win); j++) (s += steps[j].v), n++;
      return s / n;
    });
    G.along(poly, 4.0 + 2, 0, (i, x, z) => {
      let best = 0, bd = Infinity;
      for (let k = 0; k < steps.length; k += 2) {
        const d = Math.hypot(steps[k].x - x - 0.5, steps[k].z - z - 0.5);
        if (d < bd) (bd = d), (best = k);
      }
      if (G.reserved[i] === 1) level[i] = smooth[best];
    });
  }

  // ─── Water: the moat round the castle, the pool under its fall, the stream, the pond ──
  castleGround.moat(site);
  const { poly: stream, pool } = castleGround.stream(site, [roads.farm, roads.alchemy]);
  strands.push({ pts: stream, hw: 1.45, kind: 'water', ground: Ground.Dirt });
  G.l.pools = [pool, { x: 116, z: 216, r: 5 }];
  G.lake(116, 216, 5, Fluid.Water, 0);
  // The stream spills off the old south edge into the void.
  for (let z = 232; z < h; z++) for (let x = 100; x < 112; x++) if (G.l.fluid[G.idx(x, z)] && !inPoly(x + 0.5, z + 0.5, outline)) G.l.cells[G.idx(x, z)] = Cell.Void;

  // ─── Cliffs where two levels meet ────────────────────────────────────────────
  // A band of rock rises from the lower ground to just above the higher one: two cells thick, and
  // up to four where the noise says (an uneven foot, so the face reads as rock, not a wall). Roads
  // and stations are never turned to rock: where the lower cell is a road, the higher cell takes the
  // cliff instead (it drops to the road's level and rises from there).
  const LIP = 0.4;
  const ground = (i: number) => G.l.cells[i] === Cell.Ground && !G.l.fluid[i];
  const top = (i: number) => level[i] + (G.l.cells[i] === Cell.Cliff ? G.l.elev[i] : 0);
  for (let pass = 0; pass < 4; pass++) {
    const turn: [number, number][] = [];
    for (let z = 1; z < h - 1; z++) for (let x = 1; x < w - 1; x++) {
      const i = G.idx(x, z);
      if (!ground(i)) continue;
      let hi = -Infinity;
      const banks: number[] = [];
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const j = G.idx(x + dx, z + dz);
        if (j === i || G.l.cells[j] === Cell.Void) continue;
        if (pass === 0 && !ground(j)) continue;
        if (pass > 0 && G.l.cells[j] !== Cell.Cliff) continue;
        hi = Math.max(hi, top(j));
        if (top(j) - level[i] > 1.2 && G.reserved[j] !== 1) banks.push(j);
      }
      if (hi - level[i] <= 1.2) continue;
      if (pass >= 2 && G.noise(x * 0.15 + pass * 17, z * 0.15) < 0.25 + pass * 0.12) continue;
      if (G.reserved[i] !== 1) turn.push([i, hi]);
      // Every bank above a road takes the cliff (not just the highest), or a ramp is left with
      // bare earth slopes between its rock.
      else if (pass === 0) for (const j of banks) turn.push([j, -level[i]]);
    }
    for (const [i, v] of turn) {
      if (v >= 0) {
        G.l.elev[i] = v - level[i] + LIP;
      } else {
        // A cliff over a road drops to the road and rises to just above its own ground. Several
        // road cells can claim it (a ramp descending past): it drops to the lowest, its top unchanged.
        const rim = G.l.cells[i] === Cell.Cliff ? level[i] + G.l.elev[i] : level[i] + LIP;
        level[i] = Math.min(level[i], -v);
        G.l.elev[i] = rim - level[i];
      }
      // The outer rows of a thick band step down toward the foot.
      if (pass >= 2) G.l.elev[i] *= 0.55 + G.noise(i * 0.013, pass) * 0.25;
      G.l.cells[i] = Cell.Cliff;
      G.l.ground[i] = Ground.Cave;
    }
  }

  // Slivers of land sticking out into the void (a cell with void on most sides) break off: left in,
  // they stand up as lone needles of rock with the island's side dropping all round them.
  for (let pass = 0; pass < 3; pass++) for (let z = 1; z < h - 1; z++) for (let x = 1; x < w - 1; x++) {
    const i = G.idx(x, z);
    if (G.l.cells[i] === Cell.Void || G.reserved[i] === 1) continue;
    let vd = 0;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (G.l.cells[G.idx(x + dx, z + dz)] === Cell.Void) vd++;
    if (vd >= 5) {
      G.l.cells[i] = Cell.Void;
      G.l.elev[i] = 0;
    }
  }
  return { outline, court, stream };
}
