import { Gen } from '../../world/gen';
import { Cell, Fluid, Ground, type ZoneLayout } from '../../world/layout';

// ─── Wyrmwood Foothills: the big, dangerous hunting grounds ─────────────────

export function buildFoothills(seed: number): ZoneLayout {
  const w = 170, h = 190;
  const G = new Gen(w, h, seed, Cell.Ground, Ground.Grass);
  const entry = { x: 85, z: 176 };
  const gate = { x: 85, z: 24 };
  // Main road: a long winding climb from the portal to the sealed lair gate.
  const main = G.road([{ x: 85, z: 182 }, entry, { x: 80, z: 160 }, { x: 92, z: 140 }, { x: 84, z: 122 }, { x: 72, z: 104 }, { x: 78, z: 82 }, { x: 96, z: 64 }, { x: 88, z: 44 }, { x: 85, z: 27 }], 3.6);
  const roads = [
    main,
    G.road([{ x: 84, z: 124 }, { x: 62, z: 130 }, { x: 44, z: 136 }], 2.8),
    G.road([{ x: 78, z: 82 }, { x: 108, z: 86 }, { x: 130, z: 94 }], 2.8),
    G.road([{ x: 92, z: 140 }, { x: 118, z: 134 }, { x: 128, z: 112 }, { x: 132, z: 96 }], 2.6),
    G.road([{ x: 88, z: 46 }, { x: 68, z: 50 }, { x: 57, z: 52 }], 2.8),
    G.road([{ x: 96, z: 64 }, { x: 122, z: 58 }, { x: 138, z: 48 }], 2.6),
    G.road([{ x: 72, z: 104 }, { x: 52, z: 96 }, { x: 34, z: 88 }], 2.4),
  ];
  // Region grounds: meadow grass everywhere, with bare ground only where it means something: the
  // roads, the camps, the scorched drake nests and the shrine (set below). No random brown smudges.
  // Water: a river across the middle (bridged by every road), born at a waterfall pouring off the
  // western mesa and running out east through a gorge in the rim; and a lake in the south-west.
  const fall = { x: 26.5, z: 103.4 };
  G.river([{ x: fall.x, z: fall.z + 1.5 }, { x: 30, z: 110 }, { x: 40, z: 114 }, { x: 70, z: 112 }, { x: 100, z: 118 }, { x: 128, z: 110 }, { x: 169, z: 116 }], 5, Fluid.Water, roads);
  G.lake(fall.x, fall.z + 4.2, 3.4, Fluid.Water, 0.8);
  G.lake(34, 154, 11);
  // Highlands: mesas you walk around (forested tops), and the eastern escarpment.
  // Highlands: stepped mesas you walk around (grassy, wooded tops), each rising in two or three
  // terraces instead of one sheer block.
  const mesa = (x: number, z: number, r: number, hgt: number, wob: number) => {
    G.plateau(x, z, r, hgt * 0.5, wob);
    G.plateau(x + r * 0.12, z - r * 0.1, r * 0.68, hgt * 0.78, wob * 0.8);
    if (r > 7.5) G.plateau(x + r * 0.2, z - r * 0.18, r * 0.36, hgt, wob * 0.6);
  };
  mesa(144, 72, 13, 5.2, 3);
  mesa(58, 76, 6.5, 3.8, 1.6);
  mesa(112, 38, 8, 4.6, 2);
  // The waterfall's mesa: a broad step of rock north of the river, the fall pouring off its face.
  G.plateau(fall.x - 0.5, fall.z - 6.5, 7.5, 2.4, 1.6);
  G.plateau(fall.x - 0.8, fall.z - 7.6, 5.6, 3.6, 1.2);
  G.plateau(fall.x - 1.2, fall.z - 8.6, 3.6, 4.6, 0.8);
  G.rect(fall.x, fall.z - 0.4, 3.2, 2.4, 0, (i) => {
    G.l.cells[i] = Cell.Blocked;
    G.l.fluid[i] = Fluid.None;
  });
  G.prop('waterfall', fall.x, fall.z, 0, 1);
  mesa(118, 158, 8, 3.8, 2);
  // The cultists' shrine: a paved processional way leads west off the road to a stepped dais.
  // Designed ground, not a bare patch: the meadow is cleared round it, a worn earth verge runs
  // either side of the paved way (trodden by the processions), a square paved forecourt sets the
  // dais, and the earth is scorched only round the braziers and the altar (soft soot gradients).
  G.clearing(41, 52, 10, undefined, 2);
  G.road([{ x: 58, z: 52 }, { x: 38, z: 52 }], 6.6, Ground.Path, 0.5);
  G.road([{ x: 57, z: 52 }, { x: 37, z: 52 }], 4.4, Ground.Stone, 0.05);
  G.floor(33, 52, 6.2, 6.2, 0, Ground.Stone);
  const burns: NonNullable<ZoneLayout['burns']> = (G.l.burns = []);
  for (const z of [48.6, 55.4]) burns.push({ x: 38.2, z, r: 2.6, k: 0.75 });
  burns.push({ x: 32.5, z: 52, r: 3.2, k: 0.45 }, { x: 47, z: 52, x2: 39, z2: 52, r: 1.6, k: 0.25 });
  // Encounter areas (packs sit in clearings; the roads link them).
  // A camp's trodden earth or a drake nest's scorch is a ragged patch inside the clearing (lobed,
  // never a disc), so bare ground reads as a purposeful place, not a stamp.
  const P = (x: number, z: number, comp: string[], r = 7, g?: Ground) => {
    G.pack(x, z, comp, r);
    if (g !== undefined) G.blob(x, z, r * 0.72, r * 0.38, (i) => {
      if (G.l.cells[i] === Cell.Ground && G.l.ground[i] !== Ground.Path && G.l.ground[i] !== Ground.Stone) G.l.ground[i] = g;
    });
  };
  P(70, 158, ['goblin', 'goblin', 'goblin']);
  P(106, 152, ['goblin', 'goblin', 'goblin', 'goblin']);
  P(84, 134, ['goblin', 'kobold']);
  P(48, 124, ['goblin', 'goblin', 'goblin', 'goblin', 'goblin'], 9, Ground.Camp);
  P(60, 134, ['goblin', 'goblin', 'goblin', 'kobold', 'kobold'], 6, Ground.Camp);
  P(44, 140, ['kobold', 'kobold', 'kobold']);
  P(62, 94, ['drakeling', 'drakeling', 'goblin', 'goblin'], 8);
  P(36, 86, ['kobold', 'kobold', 'goblin']);
  P(78, 96, ['kobold', 'kobold']);
  P(132, 92, ['kobold', 'kobold', 'kobold', 'kobold', 'kobold'], 8);
  P(128, 116, ['kobold', 'kobold', 'kobold', 'goblin']);
  P(102, 74, ['drakeling', 'drakeling', 'drakeling'], 9, Ground.Scorch);
  P(138, 48, ['drakeling', 'drakeling', 'drakeling', 'drakeling'], 8, Ground.Scorch);
  P(124, 58, ['drakeling', 'drakeling', 'kobold']);
  P(44.5, 52, ['cultist', 'cultist', 'cultist', 'drakeling', 'drakeling'], 5);
  P(58, 40, ['cultist', 'cultist', 'drakeling']);
  P(86, 42, ['drakeling', 'cultist', 'cultist', 'kobold', 'kobold'], 8, Ground.Scorch);
  P(112, 26, ['cultist', 'cultist', 'cultist']);
  // Landmarks.
  G.clearing(34, 136, 6);
  G.prop('tower_ruin', 66, 92, 0.6, 1, 3.0);
  G.verge(66, 99, 6);
  G.prop('dragon_bones', 100, 70, 0.7, 1);
  // An old stone circle: seven menhirs, their carved faces turned to the altar stone at its heart.
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2;
    G.prop('standing_stone', 34 + Math.cos(a) * 4.5, 136 + Math.sin(a) * 4.5, Math.atan2(-Math.cos(a), -Math.sin(a)), 1, 0.5).len = k;
  }
  G.prop('standing_stone', 34, 136, 0.4, 1, 1.0).len = 99;
  // The shrine, composed along its processional way (east to west): cult banners where it leaves
  // the road, two pairs of obelisks (one broken off, one toppled outward), then braziers at the
  // foot of the stepped dais with its ritual circle and altar, banners standing behind.
  G.prop('ritual_dais', 32.5, 52, 0, 1);
  G.rect(32.5, 52, 4.1, 4.1, 0, (i) => (G.l.cells[i] = Cell.Blocked));
  for (const [x, z, v, r] of [[51.5, 48.2, 0, 0], [51.5, 55.8, 1, 0.3], [45.5, 48.2, 2, Math.PI / 2], [45.5, 55.8, 0, 0]]) G.prop('obelisk', x, z, r, 1, 0.8).len = v;
  for (const z of [48.6, 55.4]) G.prop('brazier', 38.2, z, 0, 1, 0.6);
  for (const [x, z] of [[57.5, 47.8], [57.5, 56.2], [28.2, 47.6], [28.2, 56.4]]) G.prop('cult_banner', x, z, 0, 1, 0.35);
  G.prop('statue', 79, 128, Math.PI * 0.8, 1, 1.4);
  for (const [x, z, r] of [[80, 162, 0.2], [90, 142, -0.4], [80, 84, 0.3], [90, 48, 0.2]]) G.prop('signpost', x + 2.5, z, r, 1, 0.3);
  // Goblin war camp: a palisade on the dry bank (the river runs just north of it), hide tents
  // around the fires, war banners at the gaps, crate stacks and weapon racks.
  G.prop('palisade', 44, 117.5, 0, 1).len = 11;
  G.prop('palisade', 37.5, 125, Math.PI / 2, 1).len = 10;
  G.prop('banner', 50.5, 117.8, 0, 1, 0.3);
  G.prop('banner', 37.8, 131.2, Math.PI / 2, 1, 0.3);
  G.prop('banner', 64.5, 131, -0.4, 1, 0.3);
  const tents: [number, number, number][] = [[42, 120.5, 0.3], [54, 128.5, -0.9], [44.5, 130.5, 2.8], [66, 136.5, -2.2], [57.5, 138, 2.5]];
  tents.forEach(([x, z, r], i) => (G.prop('tent', x, z, r, 1, 1.1).len = i));
  for (const [x, z] of [[48, 124], [60, 134], [70, 158], [106, 152]]) G.prop('campfire', x, z);
  for (const [x, z, r] of [[51.5, 120.5, 0.4], [63, 131, -0.3], [73, 155, 1.2], [40.5, 127, 0.1]]) G.prop('crates', x, z, r, 1, 0.6);
  for (const [x, z, r] of [[45.5, 118.8, 0], [61.5, 137.5, -0.5], [103, 150, 0.3]]) G.prop('weapon_rack', x, z, r, 1, 0.5);
  for (const [x, z] of [[128, 88], [136, 90], [131, 97], [127, 114], [135, 94]]) G.prop('burrow', x, z, G.rng() * 6, 1, 0.8);
  for (let k = 0; k < 10; k++) G.prop('bones', 90 + G.rng() * 20, 64 + G.rng() * 14, G.rng() * 6).len = k;
  // Emberite veins in the dangerous north and east.
  for (const [x, z] of [[40, 62], [142, 42], [106, 78], [89, 38], [60, 36], [136, 98]]) G.ore('emberite', x, z);
  // Portals.
  G.l.entry = { x: entry.x, z: entry.z };
  G.station('exit', 'keep', entry.x, entry.z + 6, Math.PI, 1.4);
  // North of the gate is sheer cliff: the lair is a separate place.
  // (Its foot wanders, pushed back into bays away from the gate, so it never runs as one straight line.)
  for (let z = 0; z < gate.z + 8; z++) for (let x = 0; x < w; x++) {
    const i = G.idx(x, z);
    const foot = gate.z - 1 + (G.noise(x * 0.06, 5) - 0.3) * 26 * Math.min(1, Math.abs(x + 0.5 - gate.x) / 14);
    if (z < foot && G.reserved[i] !== 1 && G.reserved[i] !== 3 && (Math.abs(x + 0.5 - gate.x) > 2.5 || z < gate.z - 3)) {
      G.l.cells[i] = Cell.Cliff;
      G.l.elev[i] = 6;
      // Bare rock above the gate (the lair's mountain), not another meadow.
      G.l.ground[i] = Ground.Cave;
    }
  }
  G.station('gate', 'lair', gate.x, gate.z - 0.5, 0, 2.2);

  // ─── The wild beyond the hunting grounds ───────────────────────────────────
  // The play area is wrapped in wide scenery, so wherever the hero stands the camera only ever
  // sees rim, never the edge of the world: the map grows by OX each side and OS to the south
  // (everything above moves OX east). The rim climbs from the open land in wooded, then bare
  // terraces to high forested ground, and the whole zone ends along an organic outline far out
  // in that forest (Void beyond: the map shows a landmass, never a rectangle).
  const OX = 16, OS = 26;
  G.pad(OX, 0, OX, OS);
  const W = G.w, H = G.h;
  // The river runs on east out of the meadow, through a gorge in the rim.
  G.river([{ x: OX + 166, z: 115.5 }, { x: OX + 178, z: 119 }, { x: W - 2, z: 124 }], 5, Fluid.Water);
  const coreD = G.distance((i) => G.reserved[i] === 1 || G.reserved[i] === 3);
  const canopy = (G.l.canopy = new Uint8Array(W * H).fill(8));
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
    const i = G.idx(x, z);
    if (G.reserved[i] === 1 || G.reserved[i] === 3 || (G.l.cells[i] === Cell.Cliff && G.l.elev[i] >= 6)) continue;
    // Distance in from the old map's edge (negative beyond it), bent by broad noise into bays and
    // headlands so the rim never runs parallel to a rectangle.
    const ox = x - OX;
    const n = G.noise(x * 0.045 + 7, z * 0.045 + 3);
    const bd = Math.min(ox, z, 169 - ox, 189 - z) + (G.noise(x * 0.016 + 31, z * 0.016 + 17) - 0.5) * 30 + (G.noise(x * 0.04 + 5, z * 0.04 + 9) - 0.5) * 8;
    const reach = Math.max(0, Math.min(1, (34 - bd) / 12));
    const t = Math.max((coreD[i] - (7 + n * 9)) * reach, (12 - bd) * 1.7 + (n - 0.5) * 4);
    if (t <= 0) continue;
    // The gorge: the river keeps its water through the rim (its banks rise as the rim does).
    if (G.l.fluid[i] === Fluid.Water) continue;
    // A thin band of wood at the foot, then terraces climbing to the high ground: wide steps, each
    // edge wobbling on its own; the highest is a broad forested upland.
    const step = t + (G.noise(x * 0.11 + 40, z * 0.11) - 0.5) * 3;
    if (step > 3.5) {
      G.l.cells[i] = Cell.Cliff;
      G.l.fluid[i] = Fluid.None;
      G.l.elev[i] = step > 26 ? 11.6 : step > 17 ? 9.5 : step > 12 ? 7.2 : step > 7.5 ? 4.9 : 2.8;
      // The cliffs between are bare rock; the lowest terraces keep their grass and a few trees,
      // and the upland is grass under thick forest.
      // Bare cliffs come in stretches (bluffs and scarps), wooded terraces between them, so the
      // rock never rings the meadow like a frame.
      const scarp = G.noise(x * 0.035 + 90, z * 0.035 + 23) > 0.42;
      const bare = scarp && step > 7.5 + (G.noise(x * 0.13 + 70, z * 0.13) - 0.5) * 4 && step < 20 + (G.noise(x * 0.07 + 11, z * 0.07) - 0.5) * 6;
      if (bare) G.l.ground[i] = Ground.Cave;
      else canopy[i] = step >= 17 ? 34 : step > 7.5 ? 22 : 8;
    } else if (G.l.cells[i] === Cell.Ground && !G.l.fluid[i] && G.rng() < 0.35 + t * 0.12) G.l.cells[i] = G.rng() < 0.1 ? Cell.Rock : Cell.Tree;
  }
  // Rock outcrops breaking the tree wall: bluffs thrust out from the rim into the woods at the
  // edge of the open land (never onto a road, a camp or a clearing).
  for (let k = 0, placed = 0; k < 400 && placed < 16; k++) {
    const x = OX + 8 + G.rng() * 154, z = 30 + G.rng() * 150;
    const i = G.idx(Math.floor(x), Math.floor(z));
    const bd = Math.min(x - OX, z, OX + 170 - x, 190 - z);
    if (bd > 38 || coreD[i] < 5 || coreD[i] > 11 || G.l.cells[i] === Cell.Cliff || G.l.fluid[i]) continue;
    const r = 2.2 + G.rng() * 2.2, top = 3.4 + G.rng() * 2.6;
    G.blob(x, z, r, 1.2, (j, _x, _z, d) => {
      if (G.reserved[j] === 1 || G.reserved[j] === 3 || coreD[j] < 3 || G.l.fluid[j]) return;
      G.l.cells[j] = Cell.Cliff;
      G.l.elev[j] = Math.max(G.l.elev[j], top * (d < 0.55 ? 1 : 0.62));
      G.l.ground[j] = Ground.Cave;
    });
    placed++;
  }
  // Woods: clustered forests and copses, open meadows between; logs and mushrooms in the woods.
  G.scatter((x, z) => {
    const n = G.noise(x * 0.035, z * 0.035);
    const woods = n > 0.6 ? 0.5 + (n - 0.6) * 2 : n > 0.5 ? 0.05 : 0.012;
    return Math.min(0.85, woods);
  }, 0.1);
  for (let k = 0; k < 60; k++) {
    const x = OX + 12 + G.rng() * 146, z = 30 + G.rng() * 150;
    const i = G.idx(Math.floor(x), Math.floor(z));
    if (G.l.cells[i] === Cell.Ground && !G.l.fluid[i] && !G.reserved[i]) G.prop(G.rng() < 0.5 ? 'log' : 'mushrooms', x, z, G.rng() * 6);
  }
  G.connect();
  // The outline: well beyond sight of anywhere the hero can walk (22 to 34 cells, wandering), the
  // land ends; the forest thins out over its last few cells.
  const walkD = G.distance((i) => G.l.cells[i] === Cell.Ground);
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
    const i = G.idx(x, z);
    const R = 22 + G.noise(x * 0.03 + 61, z * 0.03 + 5) * 12 + (G.noise(x * 0.09 + 3, z * 0.09 + 41) - 0.5) * 4;
    const left = R - walkD[i];
    if (left <= 0 || x === 0 || z === 0 || x === W - 1 || z === H - 1) {
      G.l.cells[i] = Cell.Void;
      G.l.fluid[i] = Fluid.None;
    } else if (left < 6) canopy[i] = Math.round(canopy[i] * (left / 6));
  }
  return G.l;
}
