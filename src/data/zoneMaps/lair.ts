import { Gen } from '../../world/gen';
import { blockDisc, Cell, Fluid, Ground, type ZoneLayout } from '../../world/layout';

// ─── Cinderwing's Lair: a volcanic approach to the caldera ──────────────────

export function buildLair(seed: number): ZoneLayout {
  const w = 100, h = 132;
  const G = new Gen(w, h, seed, Cell.Ground, Ground.Scorch);
  // The den: an irregular caldera floor of several lobes, reached not by a road that ends in a
  // bowl but up a ravine that breaks through the rim on its east side. (The boss logic scales with
  // A.r: its leash circle sits inside the lobes.)
  const A = { x: 47, z: 33, r: 17 };
  const lobes: [number, number, number][] = [[47, 33, 13], [37, 24, 7.5], [59, 41, 7], [51, 20, 6.5], [40, 42, 6]];
  const road = G.road([{ x: 58, z: 126 }, { x: 58, z: 116 }, { x: 47, z: 104 }, { x: 40, z: 92 }, { x: 47, z: 79 }, { x: 63, z: 71 }, { x: 72, z: 61 }, { x: 69, z: 52 }, { x: 61, z: 45 }], 3.4, Ground.Path);
  G.road([{ x: 47, z: 104 }, { x: 34, z: 107 }, { x: 25, z: 104 }], 2.6, Ground.Path);
  G.road([{ x: 63, z: 71 }, { x: 77, z: 74 }, { x: 87, z: 78 }], 2.6, Ground.Path);
  G.road([{ x: 47, z: 79 }, { x: 38, z: 72 }, { x: 33, z: 64 }], 2.4, Ground.Path);
  for (const [x, z, r] of lobes) G.clearing(x, z, r, Ground.Arena, 1.2);
  // Lava: a river across the badlands (the road bridges it) and seething lakes.
  G.river([{ x: -4, z: 92 }, { x: 30, z: 88 }, { x: 64, z: 94 }, { x: 104, z: 86 }], 3.6, Fluid.Lava, [road], [], 'bridge_stone');
  G.lake(16, 76, 8, Fluid.Lava, 2.5);
  G.lake(82, 104, 6, Fluid.Lava, 2);
  G.lake(84, 52, 5.5, Fluid.Lava, 1.8);
  // The caldera rim: a thick, uneven wall grown out from the floor's own outline (bays, spurs and
  // shoulders, never a ring), highest where it is thickest. The ravine road cuts through it.
  const floorD = G.distance((i) => G.reserved[i] === 3 && G.l.ground[i] === Ground.Arena);
  for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) {
    const i = G.idx(x, z), d = floorD[i];
    if (G.reserved[i] === 1 || G.reserved[i] === 3 || d < 1) continue;
    const n = G.noise(x * 0.09 + 11, z * 0.09);
    // Thicker toward the back, so the rim swallows the badlands' far corners (no dead-end strips).
    const thick = 7 + n * 9 + Math.max(0, (54 - z) * 1.2);
    if (d < thick && z < 58 + G.noise(x * 0.07 + 5, 9) * 14) {
      G.l.cells[i] = Cell.Cliff;
      G.l.fluid[i] = Fluid.None;
      G.l.elev[i] = 4.2 + Math.min(d, 9) * 0.45 + G.noise(x * 0.15, z * 0.15) * 2.5;
    }
  }
  // The fighting floor is one calm sheet of ruddy arena rock: soot gradients (burns) darken it
  // around the roost and along the lava seams, and the caldera wall's foot sits in its own shade.
  const home = { x: A.x, z: A.z - 2 };
  const burns: NonNullable<ZoneLayout['burns']> = (G.l.burns = []);
  burns.push({ x: home.x, z: home.z, r: 7.5, k: 0.8 });
  // A lava pool seeps out of the north-west wall; fissures run from it across the floor's edge.
  G.lake(34, 20, 3.6, Fluid.Lava, 1.2, true);
  const seam = (x: number, z: number, dx: number, dz: number, v: number) => {
    G.prop('lava_seam', x, z, Math.atan2(dx, dz), 1).len = v;
    // Soot fans out along the fissure, strongest round its wide, hot source.
    const l = 7.5 / Math.hypot(dx, dz);
    burns.push({ x, z, x2: x + dx * l, z2: z + dz * l, r: 3.0, k: 0.6 }, { x, z, r: 4.0, k: 0.75 });
  };
  seam(36.4, 23.8, 0.1, 1, 0);
  seam(37.8, 21.6, 1, 0.3, 1);
  seam(52.5, 24.5, 0.3, 1, 2);
  seam(36.5, 44.5, 1, -0.55, 3);
  // The hoard: a raised basalt ledge in the north lobe, heaped with gold.
  G.prop('hoard_ledge', 54.5, 16.6, -0.25, 1, 3.4);
  // A few plates of cooled lava crust set into the fighting floor (flat, so telegraphs read on them).
  for (const [x, z, v, sc] of [[40.2, 30.2, 0, 1], [55.4, 40.4, 1, 1.15], [42.6, 41.2, 2, 0.9]]) G.prop('crust', x, z, Math.atan2(-(z - A.z), x - A.x), sc).len = v;
  // Scorch marks where it has breathed fire: a charred core in a wide, soft burn.
  for (const [x, z, s, v] of [[home.x, home.z, 2.0, 0], [46.5, 39.5, 1.1, 1], [53.5, 34.5, 1.2, 2], [39.5, 36.5, 0.9, 3]]) {
    G.prop('scorch', x, z, x, s).len = v;
    burns.push({ x, z, r: 2.6 * s, k: 0.7 });
  }
  // Blocky basalt columns stand along the wall and flank the ravine mouth; ember crystals at the rim.
  for (const [x, z, v] of [[31.5, 30.5, 0], [44.5, 13.8, 1], [63.4, 34.5, 2], [65.6, 44.6, 3], [35.4, 46.4, 4]]) G.prop('basalt_columns', x, z, v * 1.3, 1, 1.3).len = v;
  for (const [x, z, v] of [[32.6, 38.8, 0], [60.4, 30.2, 1], [47.4, 14.6, 1]]) G.prop('ember_crystals', x, z, v * 2 + x, 1, 1.0).len = v;
  // A cooled lava tongue down the west wall.
  G.prop('basalt_ridge', 34.8, 34, 0.08, 1).len = 7;
  for (let t = -3; t <= 3; t += 1) blockDisc(G.l, 34.8 + t * 0.08, 34 + t, 0.8);
  // The bones of a dragon that lost, curled along the east wall; bone drifts where the dead fell.
  G.prop('dragon_bones', 59.2, 27.5, 0.3, 0.72);
  for (let t = -8; t <= 6; t += 1.5) blockDisc(G.l, 59.2 + t * 0.3, 27.5 + t * 0.95, 0.7);
  for (const [x, z, v] of [[49.8, 23.8, 1], [43.2, 21.2, 2], [38.6, 44.2, 3], [41.6, 46.2, 0], [57.4, 43.2, 2], [44.2, 18.2, 0], [55.2, 21.2, 1]]) G.prop('bones', x, z, x * 1.7, 1.2).len = v;
  // Rock fallen from the caldera wall lies at its foot, not out on the fighting floor.
  for (const [x, z, v] of [[32.2, 25.4, 10], [60.4, 46.2, 12]]) G.prop('rubble', x, z, x, 1).len = v;
  G.pack(25, 104, ['drakeling', 'drakeling'], 6);
  G.pack(88, 79, ['drakeling', 'drakeling', 'drakeling'], 6);
  G.pack(33, 64, ['drakeling', 'kobold', 'kobold'], 6);
  G.l.entry = { x: 58, z: 118 };
  G.station('exit', 'keep', 58, 124, Math.PI, 1.4);
  G.l.boss = { id: 'cinderwing', x: home.x, z: home.z, r: A.r };
  // A second skeleton out in the badlands on dry ground north of the river, lying along its bank
  // (reserved, so no spire or rock grows through it).
  G.prop('dragon_bones', 66, 83.6, 1.45, 0.8);
  for (let t = -9; t <= 7; t += 2) G.reserve(66 + t, 83.6 + t * 0.12, 2);
  // The badlands are not a box: open ground only in a chain of lobes and bays strung along the
  // road (the entry basin, the river crossing, the lava bays, the skeleton's shelf, the packs'
  // hollows), with an uneven rock rim everywhere else. The lava river and lakes run in and out of
  // the rock. Camera-side rock stays low so it never walls off the view.
  {
    const open = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) if (G.reserved[i] === 1 || G.reserved[i] === 3) open[i] = 1;
    const lobesB: [number, number, number][] = [
      [58, 118, 7.5], [52, 110, 6], [46, 102, 7], [36, 106, 5.5], [26, 104, 8],
      [41, 93, 7.5], [31, 88, 6], [52, 91, 6.5], [63, 93, 5.5], [19, 77, 11.5],
      [47, 80, 8], [55, 75, 6.5], [63, 71, 5.5], [64, 84, 6], [73, 85, 5],
      [38, 71, 5.5], [33, 64, 7.5], [72, 66, 4.5], [79, 75, 6], [88, 79, 7.5],
      [80, 104, 9], [68, 108, 5.5], [81, 54, 7], [72, 58, 3.5],
    ];
    for (const [x, z, r] of lobesB) G.blob(x, z, r, 2.2, (i) => (open[i] = 1));
    // Every road keeps a walkable corridor either side (the ravine stays a ravine: narrow).
    G.along(road, 6.4, 0.8, (i) => (open[i] = 1));
    // The ravine through the caldera rim is widened a little so the climb reads from the camera.
    G.along(road, 5.4, 0.5, (i) => {
      if (G.l.cells[i] !== Cell.Cliff) return;
      G.l.cells[i] = Cell.Ground;
      G.l.ground[i] = Ground.Path;
      open[i] = 1;
    });
    const openD = G.distance((i) => open[i] === 1);
    for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) {
      const i = G.idx(x, z);
      if (open[i] || G.l.cells[i] === Cell.Cliff) continue;
      let north = 99;
      for (let k = 1; k <= 7 && z - k >= 0; k++) if (open[G.idx(x, z - k)]) {
        north = k;
        break;
      }
      const d = openD[i];
      const elev = 3.4 + Math.min(d, 8) * 0.5 + G.noise(x * 0.15 + 3, z * 0.15) * 1.8;
      G.l.cells[i] = Cell.Cliff;
      G.l.fluid[i] = Fluid.None;
      // Camera-side rock steps down in whole ledges (a ramp would make long diagonal facets).
      G.l.elev[i] = Math.min(elev, north <= 2 ? 1.6 : north <= 4 ? 3.1 : 99);
    }
  }
  // Warm light down the ravine: ember vents glowing in its walls, so the way up reads from afar.
  for (const [x, z, r] of [[69.6, 67.9, -0.6], [73.2, 55.6, 2.4], [63.2, 50.6, 0.9]]) G.prop('ember_vent', x, z, r, 1, 0.9);
  // Obsidian spires and bone fields across the badlands.
  for (let k = 0; k < 26; k++) {
    const x = 10 + G.rng() * (w - 20), z = 60 + G.rng() * 58;
    const i = G.idx(Math.floor(x), Math.floor(z));
    if (G.l.cells[i] === Cell.Ground && !G.l.fluid[i] && !G.reserved[i]) G.prop('obsidian', x, z, G.rng() * 6, 0.7 + G.rng() * 0.7, 1);
  }
  for (let k = 0; k < 30; k++) {
    const x = 10 + G.rng() * (w - 20), z = 60 + G.rng() * 58;
    const i = G.idx(Math.floor(x), Math.floor(z));
    if (G.l.cells[i] === Cell.Ground && !G.l.fluid[i]) G.prop('bones', x, z, G.rng() * 6).len = k;
  }
  G.scatter((x, z) => (G.noise(x * 0.08, z * 0.08) > 0.6 ? 0.1 : 0.02), 0.5);
  G.frame(9, Cell.Cliff, 6, 1.7, 0.045);
  G.connect();
  return G.l;
}
