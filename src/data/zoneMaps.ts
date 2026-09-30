import type { Vec2 } from '../types';
import { Gen, distToPoly } from '../world/gen';
import { Cell, Fluid, Ground, type ZoneLayout } from '../world/layout';

/**
 * Zone maps. Each is composed from big authored shapes (roads, rivers, lakes, clearings,
 * plateaus, forests) with the Gen toolkit: open meadows and long sightlines, landmarks to
 * navigate by, side areas worth detouring for, and a scenery frame so the camera never sees
 * past the edge. Coordinates are in cells (1 cell = 1 unit); +z is south (toward the camera).
 */

export const KEEP_ARCHES: { id: string; angle: number; dormant?: string }[] = [
  { id: 'mine', angle: -150 },
  { id: 'foothills', angle: -126 },
  { id: 'ruin', angle: -102 },
  { id: 'lair', angle: -78 },
  { id: 'mirefen', angle: -54, dormant: 'Mirefen: Chapter 2' },
  { id: 'frostspire', angle: -30, dormant: 'Frostspire: Chapter 3' },
];

/** Open plaza spot in the keep used to stage the hero (character creation, pose tools). */
export const KEEP_STAGE: Vec2 = { x: 45.5, z: 50.5 };

/** Camera offsets from KEEP_STAGE used by character creation and the pose tools (x/z only). */
export const STAGE_CAMERAS: Vec2[] = [{ x: -1.4, z: 5.2 }, { x: 0, z: 4.2 }, { x: 4.2, z: 0 }, { x: -4.2, z: 0 }];

// ─── Dragonspire Keep: a floating island in the Veil ────────────────────────

export function buildKeep(seed: number): ZoneLayout {
  const w = 96, h = 96;
  const G = new Gen(w, h, seed, Cell.Void, Ground.Grass);
  const C = { x: 48, z: 49 };
  const plaza = { x: 48, z: 44, r: 11 };
  // The island: a big noise-edged disc.
  for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) {
    const a = Math.atan2(z + 0.5 - C.z, x + 0.5 - C.x);
    const edge = 37 + (G.noise(Math.cos(a) * 3 + 10, Math.sin(a) * 3 + 10) - 0.5) * 9;
    if (Math.hypot(x + 0.5 - C.x, z + 0.5 - C.z) < edge) G.l.cells[G.idx(x, z)] = Cell.Ground;
  }
  // Roads first (reserved), then the plaza.
  const roads = [
    G.road([{ x: 48, z: 80 }, { x: 47, z: 68 }, { x: 48, z: 55 }], 3.2, Ground.Stone, 0.2),
    G.road([{ x: 48, z: 33 }, { x: 48, z: 22 }], 3.2, Ground.Stone, 0.2),
    G.road([{ x: 58, z: 44 }, { x: 62, z: 44 }], 3, Ground.Stone, 0.2),
    G.road([{ x: 38, z: 44 }, { x: 33, z: 44 }], 3, Ground.Stone, 0.2),
    G.road([{ x: 55, z: 51 }, { x: 60, z: 57 }], 2.6, Ground.Stone, 0.2),
    G.road([{ x: 58, z: 57 }, { x: 70, z: 54 }, { x: 76, z: 52 }], 2.4, Ground.Path, 0.4),
    G.road([{ x: 40, z: 52 }, { x: 34, z: 62 }, { x: 34, z: 70 }], 2.4, Ground.Path, 0.4),
    G.road([{ x: 40, z: 36 }, { x: 32, z: 26 }], 2.2, Ground.Path, 0.4),
    G.road([{ x: 56, z: 36 }, { x: 66, z: 26 }], 2.2, Ground.Path, 0.4),
  ];
  void roads;
  G.clearing(plaza.x, plaza.z, plaza.r, Ground.Stone, 0.4);
  // Gardens: a pond with reeds east, an orchard south-west, a training yard east.
  G.lake(74, 66, 5.5, Fluid.Water, 1.5);
  G.clearing(76, 52, 5, Ground.Dirt, 1);
  for (const [x, z] of [[74, 50], [77, 53], [79, 50]]) G.prop('dummy', x, z, Math.PI, 1, 0.5);
  for (let x = 22; x <= 32; x += 3.4) for (let z = 60; z <= 76; z += 3.4) {
    const i = G.idx(Math.floor(x), Math.floor(z));
    if (G.l.cells[i] === Cell.Ground && !G.reserved[i]) G.l.cells[i] = Cell.Tree;
  }
  G.prop('well', 40, 62, 0, 1, 1.1);
  G.prop('landing', 48, 81);
  G.l.entry = { x: 48, z: 79 };
  G.reserve(48, 81, 4);
  G.prop('keep_hall', 48, 16, 0, 1);
  G.reserve(48, 16, 8);
  // The hall and its towers block movement.
  for (let z = 8; z < 23; z++) for (let x = 34; x < 63; x++) if (Math.abs(x + 0.5 - 48) < 7.5 && z < 21) G.l.cells[G.idx(x, z)] = Cell.Blocked;
  for (const a of KEEP_ARCHES) {
    const rad = (a.angle * Math.PI) / 180;
    const x = plaza.x + Math.cos(rad) * 8.6, z = plaza.z + Math.sin(rad) * 8.6;
    G.station('portal', a.id, x, z, Math.atan2(plaza.x - x, plaza.z - z), 1.1);
  }
  G.station('bank', 'bank', 64.5, 44, -Math.PI / 2, 2.2);
  G.station('furnace', 'furnace', 31.5, 40, Math.PI / 2, 1.5);
  G.station('anvil', 'anvil', 33.5, 47.5, Math.PI / 2, 0.9);
  G.station('restore', 'emberforge', 29.5, 47, Math.PI / 2, 1.3);
  G.station('shop', 'shop', 62, 60, -Math.PI * 0.75, 1.8);
  G.station('npc', 'quartermaster', 60.2, 58.4, -Math.PI * 0.75, 0.5);
  G.station('npc', 'warden', 52, 56, Math.PI, 0.5);
  G.station('restore', 'board', 39.5, 59, Math.PI * 0.8, 0.8);
  G.station('restore', 'vault_expanded', 68, 36, -Math.PI / 2, 1.8);
  G.station('restore', 'alchemy_lab', 30, 24, Math.PI / 4, 2.6);
  G.station('restore', 'rune_altar', 67, 24, -Math.PI / 4, 2.6);
  G.station('restore', 'hatchery', 36, 73, Math.PI * 0.8, 2.4);
  for (const [x, z] of [[40, 53], [56, 53], [40, 35], [56, 35], [44.5, 66], [51.5, 66], [44.5, 74], [51.5, 74]]) G.prop('lamp', x, z, 0, 1, 0.4);
  G.prop('signpost', 51, 64, 0.4, 1, 0.3);
  // The hero is staged here for character creation and the pose tools; keep every camera spot
  // around it clear, or the near plane slices whatever prop sits there (the old "purple spike").
  for (const c of STAGE_CAMERAS) G.reserve(KEEP_STAGE.x + c.x, KEEP_STAGE.z + c.z, 2);
  G.reserve(KEEP_STAGE.x, KEEP_STAGE.z, 3);
  // Woods and boulders thicken toward the rim; the middle stays open lawn.
  G.scatter((x, z) => {
    const d = Math.hypot(x - C.x, z - C.z);
    return Math.max(0, (d - 26) / 12) * 0.45 + (G.noise(x * 0.08, z * 0.08) > 0.62 ? 0.12 : 0);
  }, 0.18);
  G.connect();
  return G.l;
}

// ─── Emberdeep Mine: a cave network (safe gathering) ────────────────────────

export function buildMine(seed: number): ZoneLayout {
  const w = 120, h = 120;
  const G = new Gen(w, h, seed, Cell.Wall, Ground.Cave);
  const caverns = {
    entry: { x: 60, z: 104, r: 8 },
    hall: { x: 60, z: 74, r: 16 },
    west: { x: 28, z: 70, r: 10 },
    tin: { x: 22, z: 94, r: 7 },
    east: { x: 94, z: 64, r: 10 },
    east2: { x: 101, z: 88, r: 7 },
    deep: { x: 60, z: 30, r: 13 },
    grotto: { x: 100, z: 24, r: 7 },
  };
  const tunnels: Vec2[][] = [
    [caverns.entry, { x: 58, z: 94 }, { x: 60, z: 88 }],
    [{ x: 46, z: 74 }, { x: 38, z: 70 }, { x: 34, z: 70 }],
    [caverns.west, { x: 24, z: 82 }, caverns.tin],
    [{ x: 74, z: 72 }, { x: 86, z: 66 }],
    [caverns.east, { x: 100, z: 76 }, caverns.east2],
    [{ x: 60, z: 60 }, { x: 58, z: 50 }, { x: 62, z: 42 }],
    [{ x: 70, z: 26 }, { x: 82, z: 18 }, { x: 94, z: 22 }],
  ];
  const tunnelPolys = tunnels.map((t, i) => G.road(t, i === tunnels.length - 1 ? 3 : 4.2, Ground.Cave, 0.6));
  for (const c of Object.values(caverns)) G.clearing(c.x, c.z, c.r, Ground.Cave, 2.2);
  // The great hall's underground lake and the lava rift before the deep workings.
  G.lake(68, 70, 6.5, Fluid.Water, 1.6, true);
  G.river([{ x: 36, z: 50 }, { x: 60, z: 47 }, { x: 86, z: 50 }], 3.2, Fluid.Lava, tunnelPolys);
  // Rock pillars break up the big halls.
  for (const [x, z, r] of [[50, 66, 1.6], [49, 82, 1.4], [72, 84, 1.8], [54, 26, 1.5], [67, 36, 1.3]]) {
    G.blob(x, z, r, 0.4, (i) => {
      G.l.cells[i] = Cell.Wall;
      G.l.elev[i] = 4.5;
    });
  }
  G.l.entry = { x: 60, z: 103 };
  G.station('exit', 'keep', 60, 112, Math.PI, 1.1);
  G.station('chest', 'mine_chest', 53.5, 106, Math.PI / 2, 0.7);
  // Ore sits against the cavern walls, never in a tunnel mouth.
  const onRoute = (x: number, z: number) => tunnelPolys.some((p) => distToPoly(x, z, p).d < 3.5);
  const ring = (c: { x: number; z: number; r: number }, ores: string[], start: number) => {
    ores.forEach((ore, k) => {
      const a = start + (k / ores.length) * Math.PI * 2;
      for (let rr = c.r + 3; rr > 1.5; rr -= 0.5) {
        const x = c.x + Math.cos(a) * rr, z = c.z + Math.sin(a) * rr;
        const i = G.idx(Math.floor(x), Math.floor(z));
        if (G.l.cells[i] === Cell.Ground && !G.l.fluid[i]) {
          const xi = c.x + Math.cos(a) * (rr - 1), zi = c.z + Math.sin(a) * (rr - 1);
          if (!onRoute(xi, zi) && G.l.cells[G.idx(Math.floor(xi), Math.floor(zi))] === Cell.Ground) G.ore(ore, xi, zi);
          break;
        }
      }
    });
  };
  ring(caverns.west, ['copper', 'tin', 'copper', 'tin', 'copper', 'tin', 'copper', 'tin', 'copper', 'tin'], 0.3);
  ring(caverns.tin, ['tin', 'tin', 'copper', 'tin', 'tin', 'copper'], 0.5);
  ring(caverns.hall, ['copper', 'tin', 'iron', 'copper', 'tin', 'iron'], 0.9);
  ring(caverns.east, ['iron', 'iron', 'iron', 'iron', 'iron', 'iron', 'iron'], 0.6);
  ring(caverns.east2, ['iron', 'coal', 'iron', 'coal', 'iron'], 0.2);
  ring(caverns.deep, ['coal', 'coal', 'iron', 'coal', 'coal', 'coal', 'iron', 'coal', 'coal', 'coal'], 0.2);
  // Dressing: rails and carts along the main galleries, lanterns in every cavern, crystals.
  G.prop('rails', 58, 94, 0, 1).len = 12;
  G.prop('minecart', 57, 90, 0.2, 1, 0.8);
  G.prop('rails', 36, 72, Math.PI / 2 + 0.2, 1).len = 10;
  G.prop('minecart', 30, 74, 1.4, 1, 0.8);
  for (const c of Object.values(caverns)) G.prop('lantern', c.x + 0.5, c.z - c.r + 2.5);
  for (let k = 0; k < 6; k++) {
    const a = k * 1.05 + 0.3;
    G.prop('crystal_big', caverns.grotto.x + Math.cos(a) * 4.5, caverns.grotto.z + Math.sin(a) * 4.5, a, 0.8 + (k % 3) * 0.2, 0.7);
  }
  for (let k = 0; k < 40; k++) {
    const x = 4 + G.rng() * (w - 8), z = 4 + G.rng() * (h - 8);
    const i = G.idx(Math.floor(x), Math.floor(z));
    if (G.l.cells[i] === Cell.Ground && !G.l.fluid[i] && !onRoute(x, z)) G.prop(G.rng() < 0.3 ? 'mushrooms' : 'crystal', x, z, G.rng() * 6, 0.6 + G.rng() * 0.6);
  }
  G.connect();
  return G.l;
}

// ─── Ashen Foothills: the big, dangerous hunting grounds ────────────────────

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
    G.road([{ x: 88, z: 46 }, { x: 64, z: 50 }, { x: 42, z: 56 }], 2.8),
    G.road([{ x: 96, z: 64 }, { x: 122, z: 58 }, { x: 138, z: 48 }], 2.6),
    G.road([{ x: 72, z: 104 }, { x: 52, z: 96 }, { x: 34, z: 88 }], 2.4),
  ];
  // Region grounds: ash in the north, meadow in the south.
  for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) {
    const i = G.idx(x, z);
    if (G.l.ground[i] === Ground.Path) continue;
    const ash = z < 66 + (G.noise(x * 0.05, 3) - 0.5) * 24;
    if (ash) G.l.ground[i] = G.noise(x * 0.12, z * 0.12) > 0.55 ? Ground.Scorch : Ground.Dirt;
    else if (G.noise(x * 0.07 + 20, z * 0.07) > 0.68) G.l.ground[i] = Ground.Dirt;
  }
  // Water: a river across the middle (bridged by every road) and a lake in the west.
  G.river([{ x: -4, z: 108 }, { x: 36, z: 114 }, { x: 70, z: 112 }, { x: 100, z: 118 }, { x: 128, z: 110 }, { x: 174, z: 116 }], 5, Fluid.Water, roads);
  G.lake(34, 154, 11);
  // Highlands: mesas you walk around (forested tops), and the eastern escarpment.
  G.plateau(144, 70, 13, 4.4, 3);
  G.plateau(58, 76, 6.5, 3.6, 1.6);
  G.plateau(112, 38, 8, 4.2, 2);
  G.plateau(28, 100, 7, 3.4, 2);
  G.plateau(118, 158, 8, 3.2, 2);
  G.ridge([{ x: 160, z: 20 }, { x: 156, z: 90 }, { x: 162, z: 150 }], 10, 5);
  // Encounter areas (packs sit in clearings; the roads link them).
  const P = (x: number, z: number, comp: string[], r = 7, g?: Ground) => G.pack(x, z, comp, r, g);
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
  P(42, 56, ['cultist', 'cultist', 'cultist', 'drakeling', 'drakeling'], 8, Ground.Scorch);
  P(58, 40, ['cultist', 'cultist', 'drakeling']);
  P(86, 42, ['drakeling', 'cultist', 'cultist', 'kobold', 'kobold'], 8, Ground.Scorch);
  P(112, 26, ['cultist', 'cultist', 'cultist']);
  // Landmarks.
  G.clearing(34, 136, 6);
  G.prop('tower_ruin', 66, 92, 0.6, 1, 2.6);
  G.prop('dragon_bones', 100, 70, 0.7, 1);
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2;
    G.prop('standing_stone', 34 + Math.cos(a) * 4.5, 136 + Math.sin(a) * 4.5, -a, 1, 0.5);
  }
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + 0.3;
    G.prop('pillar', 42 + Math.cos(a) * 6, 56 + Math.sin(a) * 6, a, 1, 0.5);
  }
  G.prop('brazier', 43.5, 55, 0, 1, 0.5);
  G.prop('statue', 79, 128, Math.PI * 0.8, 1, 1.4);
  for (const [x, z, r] of [[80, 162, 0.2], [90, 142, -0.4], [80, 84, 0.3], [90, 48, 0.2]]) G.prop('signpost', x + 2.5, z, r, 1, 0.3);
  // Goblin war camp: palisade, tents, fires.
  G.prop('palisade', 48, 114, 0, 1).len = 12;
  G.prop('palisade', 38, 124, Math.PI / 2, 1).len = 10;
  for (const [x, z] of [[42, 119], [53, 128], [45, 130], [66, 136]]) G.prop('tent', x, z, G.rng() * 6, 1, 0.9);
  for (const [x, z] of [[48, 124], [60, 134], [70, 158], [106, 152]]) G.prop('campfire', x, z);
  for (const [x, z] of [[51, 120], [63, 131], [73, 155]]) G.prop('crates', x, z, G.rng() * 6, 1, 0.6);
  for (const [x, z] of [[128, 88], [136, 90], [131, 97], [127, 114], [135, 94]]) G.prop('burrow', x, z, G.rng() * 6, 1, 0.8);
  for (let k = 0; k < 10; k++) G.prop('bones', 90 + G.rng() * 20, 64 + G.rng() * 14, G.rng() * 6);
  // Emberite veins in the dangerous north and east.
  for (const [x, z] of [[46, 52], [142, 42], [106, 78], [89, 38], [60, 36], [136, 98]]) G.ore('emberite', x, z);
  // Portals.
  G.l.entry = { x: entry.x, z: entry.z };
  G.station('exit', 'keep', entry.x, entry.z + 6, Math.PI, 1.1);
  // North of the gate is sheer cliff: the lair is a separate place.
  for (let z = 0; z < gate.z; z++) for (let x = 0; x < w; x++) {
    const i = G.idx(x, z);
    if (Math.abs(x + 0.5 - gate.x) > 2.5 || z < gate.z - 3) {
      G.l.cells[i] = Cell.Cliff;
      G.l.elev[i] = 6;
    }
  }
  G.station('gate', 'lair', gate.x, gate.z - 0.5, 0, 2.2);
  // Woods: clustered forests and copses, open meadows between; logs and mushrooms in the woods.
  G.scatter((x, z) => {
    const n = G.noise(x * 0.035, z * 0.035);
    const woods = n > 0.56 ? 0.55 + (n - 0.56) * 2 : n > 0.46 ? 0.08 : 0.015;
    return Math.min(0.85, woods);
  }, 0.1);
  for (let k = 0; k < 60; k++) {
    const x = 12 + G.rng() * (w - 24), z = 30 + G.rng() * (h - 40);
    const i = G.idx(Math.floor(x), Math.floor(z));
    if (G.l.cells[i] === Cell.Ground && !G.l.fluid[i] && !G.reserved[i]) G.prop(G.rng() < 0.5 ? 'log' : 'mushrooms', x, z, G.rng() * 6);
  }
  G.frame(9, Cell.Cliff, 5);
  G.connect();
  return G.l;
}

// ─── Sunken Ruin: a flooded city (quest area for The Cinder Seal) ───────────

export function buildRuin(seed: number): ZoneLayout {
  const w = 110, h = 112;
  const G = new Gen(w, h, seed, Cell.Blocked, Ground.Stone);
  G.l.fluid.fill(Fluid.Water);
  const districts = {
    dock: { x: 55, z: 98, r: 7 },
    west: { x: 26, z: 72, r: 11 },
    east: { x: 84, z: 70, r: 11 },
    plaza: { x: 55, z: 58, r: 12 },
    temple: { x: 55, z: 22, r: 14 },
    islW: { x: 22, z: 38, r: 7 },
    islE: { x: 88, z: 36, r: 7 },
  };
  const causeways: Vec2[][] = [
    [{ x: 55, z: 104 }, districts.dock, { x: 55, z: 70 }],
    [{ x: 44, z: 60 }, { x: 34, z: 66 }],
    [{ x: 66, z: 60 }, { x: 76, z: 66 }],
    [{ x: 55, z: 46 }, { x: 55, z: 36 }],
    [districts.west, { x: 20, z: 54 }, districts.islW],
    [districts.east, { x: 92, z: 52 }, districts.islE],
    [districts.islE, { x: 74, z: 28 }, { x: 68, z: 24 }],
  ];
  for (const c of causeways) G.road(c, 3.4, Ground.Stone, 0.3);
  for (const d of Object.values(districts)) G.clearing(d.x, d.z, d.r, Ground.Stone, 1.4);
  // Crumbling walls ring each district (with gaps and every causeway left open).
  const polys = causeways;
  for (const d of [districts.west, districts.east, districts.plaza, districts.temple]) {
    G.blob(d.x, d.z, d.r - 0.5, 0.8, (i, x, z, t) => {
      if (t < 0.88 || G.noise(x * 0.4, z * 0.4) < 0.4) return;
      if (polys.some((p) => distToPoly(x + 0.5, z + 0.5, p).d < 3)) return;
      G.l.cells[i] = Cell.Wall;
    });
  }
  // Moss and grass reclaiming the stone.
  for (let i = 0; i < w * h; i++) if (G.l.cells[i] === Cell.Ground && G.noise((i % w) * 0.14, Math.floor(i / w) * 0.14) > 0.6) G.l.ground[i] = Ground.Grass;
  G.l.entry = { x: 55, z: 97 };
  G.station('exit', 'keep', 55, 103, Math.PI, 1.1);
  G.station('pedestal', '0', 22, 68, 0, 0.6);
  G.station('pedestal', '1', 88, 66, 0, 0.6);
  G.station('pedestal', '2', 55, 16, 0, 0.6);
  G.pack(26, 74, ['cultist', 'cultist', 'kobold', 'kobold'], 6);
  G.pack(84, 72, ['cultist', 'drakeling', 'drakeling'], 6);
  G.pack(55, 58, ['cultist', 'cultist', 'goblin', 'goblin'], 6);
  G.pack(22, 38, ['kobold', 'kobold', 'kobold', 'cultist'], 5);
  G.pack(88, 36, ['drakeling', 'drakeling', 'cultist'], 5);
  G.pack(55, 26, ['cinder_priest', 'cultist', 'cultist'], 7);
  G.prop('altar', 55, 9.5, 0, 1, 2);
  G.prop('statue', 55, 58, 0, 1, 1.4);
  G.prop('tower_ruin', 20, 32, 1.2, 0.8, 2.2);
  G.prop('tower_ruin', 92, 30, -0.8, 0.8, 2.2);
  for (const d of Object.values(districts)) {
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const x = d.x + dx * (d.r - 2.5), z = d.z + dz * (d.r - 2.5);
      if (G.l.cells[G.idx(Math.floor(x), Math.floor(z))] === Cell.Ground) G.prop(G.rng() < 0.4 ? 'pillar_broken' : 'pillar', x, z, G.rng() * 6, 1, 0.5);
    }
  }
  for (const [x, z] of [[50, 20], [60, 20], [50, 30], [60, 30]]) G.prop('brazier', x, z, 0, 1, 0.5);
  G.scatter((x, z) => (G.noise(x * 0.1, z * 0.1) > 0.62 ? 0.06 : 0.01), 0.3);
  G.frame(8, Cell.Cliff, 4);
  G.connect();
  return G.l;
}

// ─── Cinderwing's Lair: a volcanic approach to the caldera ──────────────────

export function buildLair(seed: number): ZoneLayout {
  const w = 100, h = 132;
  const G = new Gen(w, h, seed, Cell.Ground, Ground.Scorch);
  const A = { x: 50, z: 32, r: 15 };
  const road = G.road([{ x: 50, z: 126 }, { x: 50, z: 116 }, { x: 40, z: 98 }, { x: 58, z: 80 }, { x: 46, z: 64 }, { x: 50, z: 50 }, { x: 50, z: 44 }], 3.6, Ground.Path);
  G.road([{ x: 40, z: 98 }, { x: 26, z: 104 }], 2.6, Ground.Path);
  G.road([{ x: 58, z: 80 }, { x: 72, z: 80 }, { x: 86, z: 79 }], 2.6, Ground.Path);
  G.clearing(A.x, A.z, A.r, Ground.Arena, 1);
  // Lava: a river across the badlands (the road bridges it) and seething lakes.
  G.river([{ x: -4, z: 92 }, { x: 30, z: 88 }, { x: 64, z: 94 }, { x: 104, z: 86 }], 3.6, Fluid.Lava, [road], [], 'bridge_stone');
  G.lake(22, 72, 9, Fluid.Lava, 2.5);
  G.lake(78, 64, 8, Fluid.Lava, 2.5);
  G.lake(76, 112, 6, Fluid.Lava, 2);
  // The caldera wall rings the arena (open to the south where the road enters).
  for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) {
    const d = Math.hypot(x + 0.5 - A.x, z + 0.5 - A.z);
    const i = G.idx(x, z);
    if (G.reserved[i] === 1 || G.reserved[i] === 3) continue;
    if (d > A.r + 1.5 && d < A.r + 12 + G.noise(x * 0.2, z * 0.2) * 4 && z < A.z + A.r + 6) {
      G.l.cells[i] = Cell.Cliff;
      G.l.elev[i] = 5 + G.noise(x * 0.15, z * 0.15) * 3;
    }
  }
  G.pack(26, 104, ['drakeling', 'drakeling'], 6);
  G.pack(88, 79, ['drakeling', 'drakeling', 'drakeling'], 6);
  G.pack(44, 62, ['drakeling', 'kobold', 'kobold'], 6);
  G.l.entry = { x: 50, z: 118 };
  G.station('exit', 'keep', 50, 124, Math.PI, 1.1);
  G.l.boss = { id: 'cinderwing', x: A.x, z: A.z - 2, r: A.r };
  for (let k = 0; k < 28; k++) {
    const a = G.rng() * Math.PI * 2, r = 3 + G.rng() * (A.r - 4);
    G.prop(k % 2 ? 'bones' : 'crack', A.x + Math.cos(a) * r, A.z + Math.sin(a) * r, G.rng() * 6);
  }
  G.prop('hoard', A.x - 5, A.z - 9);
  // Obsidian spires and bone fields across the badlands.
  for (let k = 0; k < 26; k++) {
    const x = 10 + G.rng() * (w - 20), z = 52 + G.rng() * 66;
    const i = G.idx(Math.floor(x), Math.floor(z));
    if (G.l.cells[i] === Cell.Ground && !G.l.fluid[i] && !G.reserved[i]) G.prop('obsidian', x, z, G.rng() * 6, 0.7 + G.rng() * 0.7, 1);
  }
  for (let k = 0; k < 30; k++) {
    const x = 10 + G.rng() * (w - 20), z = 52 + G.rng() * 66;
    const i = G.idx(Math.floor(x), Math.floor(z));
    if (G.l.cells[i] === Cell.Ground && !G.l.fluid[i]) G.prop('bones', x, z, G.rng() * 6);
  }
  G.prop('dragon_bones', 30, 60, -0.5, 0.8);
  G.scatter((x, z) => (G.noise(x * 0.08, z * 0.08) > 0.6 ? 0.1 : 0.02), 0.5);
  G.frame(9, Cell.Cliff, 6);
  G.connect();
  return G.l;
}
