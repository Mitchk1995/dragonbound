import type { Vec2 } from '../../types';
import { Gen, distToPoly, pointAt } from '../../world/gen';
import { blockDisc, Cell, Fluid, Ground, type ZoneLayout } from '../../world/layout';

// ─── Sunken Ruin: a flooded city (quest area for The Cinder Seal) ───────────

/**
 * A ruined wall from a to b, built from a few long pieces (each a bold run of big ashlar blocks
 * with a broken top), with collapsed gaps. `h` is the standing height (about 0.6–1.6 units of
 * courses); pieces near any of `gates` are left out so doorways and causeways stay open. Wall cells
 * block movement.
 */
function wallRun(G: Gen, ax: number, az: number, bx: number, bz: number, h: number, gates: Vec2[] = [], broken = 0.22) {
  const len = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / len, uz = (bz - az) / len;
  let t = 0;
  while (t <= len - 1.6) {
    const piece = Math.min(len - t, 2.6 + G.rng() * 2.6);
    const mx = ax + ux * (t + piece / 2), mz = az + uz * (t + piece / 2);
    const gated = gates.some((g) => distToPoly(g.x, g.z, [{ x: ax + ux * t, z: az + uz * t }, { x: ax + ux * (t + piece), z: az + uz * (t + piece) }]).d < 2.6);
    if (!gated && G.rng() > broken) {
      const p = G.prop('ruin_wall', mx, mz, Math.atan2(-uz, ux), 1);
      p.len = +piece.toFixed(2);
      p.v = Math.round(Math.max(0, Math.min(3, h * (0.75 + G.rng() * 0.5)) * 10)) * 100 + Math.floor(G.rng() * 100);
      for (let s = 0; s <= piece; s += 0.4) blockDisc(G.l, ax + ux * (t + s), az + uz * (t + s), 0.55);
    }
    t += piece + (G.rng() < broken ? 1.2 + G.rng() * 1.5 : 0);
  }
}

/**
 * A place where a causeway has slumped into the water, `t` (0..1) along the road polyline: the
 * gap floods, and a line of big sunken paving slabs keeps a narrow way across (walkable, drawn
 * by the 'sunken_slabs' prop).
 */
function sunkenBreak(G: Gen, poly: Vec2[], t: number, span: number, half = 2.6) {
  const { p, dir } = pointAt(poly, t);
  G.rect(p.x, p.z, half, span / 2, Math.atan2(dir.x, dir.z), (i, _x, _z, lx) => {
    G.l.fluid[i] = Fluid.Water;
    G.l.cells[i] = Math.abs(lx) <= 1.05 ? Cell.Ground : Cell.Blocked;
    G.reserved[i] = 1;
  });
  G.prop('sunken_slabs', p.x, p.z, Math.atan2(dir.x, dir.z), 1).len = span;
}

export function buildRuin(seed: number): ZoneLayout {
  const w = 110, h = 112;
  const G = new Gen(w, h, seed, Cell.Blocked, Ground.Stone);
  G.l.fluid.fill(Fluid.Water);
  // An asymmetric drowned city. From the landing quay in the south, one causeway runs north-east
  // to the market square and another west to the drowned houses; a colonnaded avenue climbs from
  // the market to the temple precinct in the north-west, and broken causeways loop out to the
  // eastern shrine isle and the western watch islet, both of which reach the precinct too.
  const S = Ground.Stone;
  // The landing quay (entry) and the market square: paved, set square to their own streets.
  G.floor(44, 99.5, 6.5, 4.5, -0.06, S);
  const market = { x: 69, z: 73, hw: 10.5, hd: 8, rot: 0.2 };
  G.floor(market.x, market.z, market.hw, market.hd, market.rot, S);
  // The temple precinct: a walled rectangle on its own island.
  // (It reaches far north, so the great portico can stand behind the dais and crown the view.)
  const T = { x0: 28, z0: 4.5, x1: 61, z1: 33 };
  G.floor((T.x0 + T.x1) / 2, (T.z0 + T.z1) / 2, (T.x1 - T.x0) / 2, (T.z1 - T.z0) / 2, 0, S);
  // The drowned houses: an irregular island of broken paving.
  for (const [x, z, r] of [[25, 72, 8.5], [32, 63, 5.5], [20, 81, 5], [30, 79, 4]]) G.clearing(x, z, r, S, 1.3);
  // The eastern shrine isle, the western watch islet and a guard landing on the east causeway.
  G.clearing(89, 37, 7.5, S, 1.8);
  G.clearing(19, 40, 6.5, S, 1.8);
  G.clearing(89, 56, 4.5, S, 1.2);
  // The colonnade: a straight paved avenue from the market's north-west corner to the precinct gate.
  const colA = { x: 45, z: 33 }, colB = { x: 59, z: 64 };
  const colLen = Math.hypot(colB.x - colA.x, colB.z - colA.z), colRot = Math.atan2(colB.x - colA.x, colB.z - colA.z);
  const colC = { x: (colA.x + colB.x) / 2, z: (colA.z + colB.z) / 2 };
  G.rect(colC.x, colC.z, 3.6, colLen / 2 + 1, colRot, (i) => {
    G.l.cells[i] = Cell.Ground;
    G.l.fluid[i] = Fluid.None;
    G.l.ground[i] = S;
    G.reserved[i] = 1;
  });
  // Causeways.
  const quayMarket = G.road([{ x: 47, z: 96 }, { x: 53, z: 89 }, { x: 61, z: 81 }], 3.4, S, 0.3);
  G.road([{ x: 40, z: 97 }, { x: 34, z: 91 }, { x: 28, z: 84 }], 3.2, S, 0.3);
  const westIslet = G.road([{ x: 31, z: 59 }, { x: 26, z: 50 }, { x: 21, z: 44 }], 3.0, S, 0.3);
  G.road([{ x: 22, z: 35 }, { x: 25, z: 28 }, { x: 30, z: 24 }], 3.0, S, 0.3);
  G.road([{ x: 78, z: 72 }, { x: 86, z: 63 }, { x: 89, z: 56 }, { x: 90, z: 46 }], 3.0, S, 0.3);
  const isleGate = G.road([{ x: 83, z: 32 }, { x: 72, z: 25 }, { x: 60, z: 22 }], 3.0, S, 0.3);
  // Where the causeways have slumped into the water.
  sunkenBreak(G, quayMarket, 0.5, 4);
  sunkenBreak(G, isleGate, 0.45, 5);
  sunkenBreak(G, westIslet, 0.55, 4);
  // A lower stretch of the colonnade has sunk too.
  sunkenBreak(G, [colA, colB], 0.62, 4.5, 4);
  // Moss and grass reclaiming the stone (more on the quiet west side).
  for (let i = 0; i < w * h; i++) {
    const x = i % w, z = Math.floor(i / w);
    if (G.l.cells[i] === Cell.Ground && !G.l.fluid[i] && G.noise(x * 0.14, z * 0.14) > 0.6 - (x < 40 ? 0.08 : 0)) G.l.ground[i] = Ground.Grass;
  }

  // Precinct walls: a high north wall behind the altar, collapsing lower toward the camera side,
  // with the colonnade gate (south), a west gate from the islet and an east gate from the isle.
  const gates = [{ x: 45, z: 33 }, { x: 28, z: 24 }, { x: 61, z: 22 }];
  // The north side is the temple itself: its portico in the middle, high wall either side.
  wallRun(G, T.x0 + 0.5, T.z0 + 0.5, 35.4, T.z0 + 0.5, 1.6, gates, 0.12);
  wallRun(G, 53.6, T.z0 + 0.5, T.x1 - 0.5, T.z0 + 0.5, 1.6, gates, 0.12);
  wallRun(G, T.x0 + 0.5, T.z0 + 1.5, T.x0 + 0.5, T.z1 - 0.5, 1.2, gates);
  wallRun(G, T.x1 - 0.5, T.z0 + 1.5, T.x1 - 0.5, T.z1 - 0.5, 1.0, gates, 0.35);
  wallRun(G, T.x0 + 1.5, T.z1 - 0.5, T.x1 - 1.5, T.z1 - 0.5, 0.6, gates, 0.4);
  // The drowned houses: foundations of three buildings, the hall (with the first pedestal) whole
  // enough to read as a room, the others down to a wall or two.
  const house = (cx: number, cz: number, hw: number, hd: number, rot: number, hgt: number, sides: boolean[], door: Vec2[]) => {
    const c = Math.cos(rot), s = Math.sin(rot);
    const at = (lx: number, lz: number) => ({ x: cx + lx * c + lz * s, z: cz - lx * s + lz * c });
    const corners = [at(-hw, -hd), at(hw, -hd), at(hw, hd), at(-hw, hd)];
    corners.forEach((a, k) => {
      if (!sides[k]) return;
      const b = corners[(k + 1) % 4];
      // The camera-side wall (k = 2) stands lower so it never hides the room.
      wallRun(G, a.x, a.z, b.x, b.z, k === 2 ? hgt * 0.45 : hgt, door, 0.18);
    });
  };
  house(24, 70, 5.5, 4, -0.12, 1.2, [true, true, true, true], [{ x: 24.6, z: 74.5 }, { x: 29.5, z: 70 }]);
  house(34, 62.5, 3, 2.4, 0.35, 0.9, [true, false, false, true], []);
  house(19.5, 81, 3.2, 2.5, 0.1, 0.8, [false, true, true, false], []);

  G.l.entry = { x: 44, z: 97 };
  G.station('exit', 'keep', 44, 103, Math.PI, 1.4);
  G.station('pedestal', '0', 23, 69, 0, 0.6);
  G.station('pedestal', '1', 91.5, 33, 0, 0.6);
  G.station('pedestal', '2', 44.5, 18, 0, 0.6);
  G.pack(27, 76, ['cultist', 'cultist', 'kobold', 'kobold'], 4);
  G.pack(89, 56, ['cultist', 'drakeling', 'drakeling'], 3.5);
  G.pack(70, 75, ['cultist', 'cultist', 'goblin', 'goblin'], 5);
  G.pack(19, 40, ['kobold', 'kobold', 'kobold', 'cultist'], 4);
  G.pack(87, 39, ['drakeling', 'drakeling', 'cultist'], 4);
  G.pack(44.5, 25, ['cinder_priest', 'cultist', 'cultist'], 5);

  // The temple: a stepped dais against the north wall with the altar on top, the seal's pedestal
  // at its foot, one brazier each side, and a row of columns down each flank of the court.
  G.prop('temple_portico', 44.5, 7.3, 0, 1, 0);
  G.rect(44.5, 6.9, 8.8, 2.6, 0, (i) => (G.l.cells[i] = Cell.Blocked));
  G.prop('temple_dais', 44.5, 12.2, 0, 1, 0);
  G.rect(44.5, 12.2, 5, 2.6, 0, (i) => (G.l.cells[i] = Cell.Blocked));
  G.prop('altar', 44.5, 11.4, 0, 1, 0);
  for (const x of [39.2, 49.8]) G.prop('brazier', x, 15.6, 0, 1, 0.6);
  for (const x of [32.5, 56.5]) for (let z = 14; z <= 29; z += 5) {
    const k = Math.round(x + z);
    const kind = x > 50 && z > 22 ? 'pillar_broken' : k % 3 === 0 ? 'pillar_broken' : 'pillar';
    if (x > 50 && z === 24) continue;
    G.prop(kind, x, z, k * 0.7, 1, 0.5);
  }
  // The colonnade: paired columns down both sides, a few fallen or gone.
  const cc = Math.cos(colRot), cs = Math.sin(colRot);
  for (let d = -colLen / 2 + 2; d <= colLen / 2 - 1; d += 4) {
    for (const side of [-1, 1]) {
      const lx = side * 3.1;
      const x = colC.x + lx * cc + d * cs, z = colC.z - lx * cs + d * cc;
      const i = G.idx(Math.floor(x), Math.floor(z));
      if (G.l.fluid[i]) continue;
      const k = Math.round(d * 3 + side * 7);
      if ((k & 7) === 3) continue;
      G.prop((k & 3) === 1 ? 'pillar_broken' : 'pillar', x, z, colRot + k, 1, 0.5);
    }
  }
  // The market: a statue in a broken fountain off-centre, the stubs of stall walls along its east side, a toppled column.
  G.prop('fountain_ruin', 65.5, 70.5, 0.2, 1, 3.1);
  G.prop('statue', 65.5, 70.5, Math.PI * 0.85, 1);
  const mc = Math.cos(market.rot), ms = Math.sin(market.rot);
  const mAt = (lx: number, lz: number) => ({ x: market.x + lx * mc + lz * ms, z: market.z - lx * ms + lz * mc });
  const m1 = mAt(9.5, -6.5), m2 = mAt(9.5, -1.5), m3 = mAt(3, -7.5), m4 = mAt(8, -7.5);
  wallRun(G, m1.x, m1.z, m2.x, m2.z, 0.5, [], 0.1);
  wallRun(G, m3.x, m3.z, m4.x, m4.z, 0.7, [], 0.1);
  const mp = mAt(-6, 5);
  G.prop('pillar_broken', mp.x, mp.z, 2.2, 1, 0.5);
  // The market's trade, knocked down by the flood, kept to the edges so the middle stays open to
  // fight in: two toppled stalls along the west side facing in, a broken well in the south-east
  // corner, and amphorae spilled by the stalls and the stall-wall stubs.
  for (const [lx, lz, v] of [[-8.6, -3.6, 0], [-8.2, 2.4, 1]]) {
    const p = mAt(lx, lz);
    G.prop('stall_ruin', p.x, p.z, market.rot + Math.PI / 2, 1).len = v;
    G.rect(p.x, p.z, 1.9, 0.8, market.rot + Math.PI / 2, (i) => (G.l.cells[i] = Cell.Blocked));
  }
  const well = mAt(7, 5.2);
  G.prop('well_ruin', well.x, well.z, 0.4, 1, 1.3);
  for (const [lx, lz, v] of [[-6.8, -6.4, 0], [7.4, -4.2, 1], [-9.2, 5.8, 2], [4.2, 6.6, 3]]) {
    const p = mAt(lx, lz);
    G.prop('amphorae', p.x, p.z, lx + lz, 1, 0.6).len = v;
  }
  // Watchtowers on the two outer isles.
  G.prop('tower_ruin', 14.5, 35.5, 1.2, 0.8, 2.2);
  G.prop('tower_ruin', 95.5, 30.5, -0.8, 0.8, 2.2);
  // The drowned city beyond the causeways: wall tops and column stumps breaking the surface.
  const drowned: [number, number, number, number][] = [
    [36, 48, 0.6, 5], [70, 50, 1.1, 6], [78, 88, 0.3, 4], [16, 58, 1.4, 5], [60, 96, -0.4, 4.5], [98, 70, 1.3, 5], [74, 36, 0.2, 4], [14, 96, 0.8, 4],
  ];
  for (const [x, z, r, l] of drowned) {
    if (G.l.cells[G.idx(Math.floor(x), Math.floor(z))] !== Cell.Blocked || !G.l.fluid[G.idx(Math.floor(x), Math.floor(z))]) continue;
    const p = G.prop('ruin_wall', x, z, r, 1);
    p.len = l;
    p.v = 10000 + (Math.round(x * 3 + z) % 100);
  }
  // Arcades of the drowned city standing out of the open water (an aqueduct, a gallery): the
  // city went on far beyond the islands that still break the surface.
  for (const [x, z, r, bays] of [[39.5, 58, 1.25, 4], [84, 89, -0.25, 3], [81, 15, 0.12, 3]]) {
    let wet = true;
    for (let t = -bays * 1.7; t <= bays * 1.7; t += 0.5) {
      const i = G.idx(Math.floor(x + Math.cos(r) * t), Math.floor(z - Math.sin(r) * t));
      if (G.l.cells[i] !== Cell.Blocked || !G.l.fluid[i]) wet = false;
    }
    if (wet) G.prop('drowned_arcade', x, z, r, 1).len = bays;
  }
  G.scatter((x, z) => (G.noise(x * 0.1, z * 0.1) > 0.62 ? 0.06 : 0.008), 0.1);
  G.frame(8, Cell.Cliff, 4, 1.6, 0.05);
  G.connect();
  return G.l;
}
