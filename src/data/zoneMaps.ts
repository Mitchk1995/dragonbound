import type { Vec2 } from '../types';
import { Gen, distToPoly } from '../world/gen';
import type { BuildingSpec } from '../world/building';
import { blockDisc, Cell, Fluid, Ground, type StationKind, type ZoneLayout } from '../world/layout';

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
export const KEEP_STAGE: Vec2 = { x: 68.5, z: 102.5 };

/** Camera offsets from KEEP_STAGE used by character creation and the pose tools (x/z only). */
export const STAGE_CAMERAS: Vec2[] = [{ x: -1.4, z: 5.2 }, { x: 0, z: 4.2 }, { x: 4.2, z: 0 }, { x: -4.2, z: 0 }];

/** Block a rotated rectangle (a building footprint): half-width hw along its X, half-depth hd along Z. */
function blockRect(G: Gen, cx: number, cz: number, hw: number, hd: number, rot: number) {
  const c = Math.cos(rot), s = Math.sin(rot), R = Math.ceil(Math.hypot(hw, hd)) + 1;
  for (let z = Math.floor(cz - R); z <= cz + R; z++) for (let x = Math.floor(cx - R); x <= cx + R; x++) {
    if (!G.inside(x, z)) continue;
    const dx = x + 0.5 - cx, dz = z + 0.5 - cz;
    // World offset back into the building's frame (the prop is rotated by `rot` about Y).
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    if (Math.abs(lx) <= hw && Math.abs(lz) <= hd) G.l.cells[G.idx(x, z)] = Cell.Blocked;
  }
}

// ─── Dragonspire Keep: a floating island in the Veil ────────────────────────

/** Roof colours (painted as shingles). */
const ROOF = { slate: 0x4e5564, darkSlate: 0x3e4450, terracotta: 0x9a5438, moss: 0x4a6a48, teal: 0x3e6a6a, violet: 0x4a4a78, rust: 0x7a4a34 };

/**
 * The keep's enterable buildings. Coordinates are grid cells (outer walls included); fittings are
 * in cells from each building's corner. Stations inside them are placed by buildKeep.
 */
export const KEEP_BUILDINGS: BuildingSpec[] = [
  {
    // The great hall: the Warden's council hall, where the Restoration Board stands by the high table.
    id: 'great_hall', style: 'hall', interior: 'hall', x: 60, z: 22, w: 30, d: 18, wallH: 6.2, roof: ROOF.slate,
    doors: [{ side: 's', at: 13, w: 4 }],
    windows: [{ side: 's', at: 4.5 }, { side: 's', at: 9 }, { side: 's', at: 21 }, { side: 's', at: 25.5 }, { side: 'n', at: 6 }, { side: 'n', at: 24 }, { side: 'e', at: 5 }, { side: 'e', at: 13 }],
    fits: [
      { kind: 'fireplace', x: 1.45, z: 9, rot: Math.PI / 2, block: [0.6, 2] },
      { kind: 'high_table', x: 15, z: 3.2, block: [2.2, 1.2] },
      { kind: 'banner', x: 10.5, z: 1.0 }, { kind: 'banner', x: 19.5, z: 1.0 },
      { kind: 'rug', x: 15, z: 11, len: 11 },
      { kind: 'table', x: 9.5, z: 10.5, len: 8, block: [1.3, 4.2] },
      { kind: 'table', x: 20.5, z: 10.5, len: 8, block: [1.3, 4.2] },
      ...[5.5, 24.5].flatMap((x) => [5.5, 9.5, 13.5].map((z) => ({ kind: 'pillar', x, z, block: [0.5, 0.5] as [number, number] }))),
      { kind: 'brazier', x: 12.5, z: 15.5, block: [0.4, 0.4] }, { kind: 'brazier', x: 17.5, z: 15.5, block: [0.4, 0.4] },
      { kind: 'weapon_rack', x: 28.4, z: 9, rot: -Math.PI / 2, block: [0.4, 1.1] },
    ],
  },
  {
    // The smelter: a timber-framed forge house on a stone base, the furnace against its back wall.
    id: 'smelter', style: 'timber', interior: 'smelter', x: 20, z: 67, w: 17, d: 13, wallH: 3.9, roof: ROOF.terracotta,
    doors: [{ side: 's', at: 7, w: 3 }, { side: 'e', at: 5, w: 3 }],
    windows: [{ side: 's', at: 3 }, { side: 's', at: 13.5 }, { side: 'n', at: 3 }, { side: 'n', at: 14 }, { side: 'w', at: 6.5 }, { side: 'e', at: 10.5 }],
    fits: [
      { kind: 'furnace_spot', x: 8.5, z: 2.6, block: [1.9, 1.2] },
      { kind: 'ore_bin', x: 3, z: 2.2, block: [0.9, 0.6] },
      { kind: 'coal', x: 13.8, z: 2.2, block: [0.8, 0.6] },
      { kind: 'tools', x: 11.8, z: 1.0 },
      { kind: 'bars', x: 15.3, z: 10.5, rot: -Math.PI / 2, block: [0.6, 0.9] },
      { kind: 'workbench', x: 2.2, z: 10, rot: Math.PI / 2, block: [0.6, 1.2] },
      { kind: 'barrel', x: 2.0, z: 6, block: [0.5, 0.5] },
    ],
  },
  {
    // The bank: a stone counting hall. Tellers' counter across the room, the vault door behind.
    id: 'bank', style: 'stone', interior: 'bank', x: 102, z: 69, w: 20, d: 15, wallH: 4.6, roof: ROOF.darkSlate,
    doors: [{ side: 's', at: 8, w: 4 }, { side: 'e', at: 9, w: 3 }],
    windows: [{ side: 's', at: 3.5 }, { side: 's', at: 16.5 }, { side: 'n', at: 4 }, { side: 'n', at: 16 }, { side: 'w', at: 7.5 }],
    fits: [
      { kind: 'vault_door', x: 10, z: 1.2, block: [1.6, 0.4] },
      { kind: 'strongbox', x: 3, z: 2, block: [0.6, 0.5] }, { kind: 'strongbox', x: 17, z: 2, block: [0.6, 0.5] },
      { kind: 'gold', x: 5.5, z: 2, block: [0.7, 0.5] }, { kind: 'gold', x: 14.5, z: 2.2, block: [0.7, 0.5] },
      { kind: 'rug', x: 10, z: 10.5, len: 6 },
      { kind: 'pillar', x: 5.5, z: 10.5, block: [0.5, 0.5] }, { kind: 'pillar', x: 14.5, z: 10.5, block: [0.5, 0.5] },
    ],
  },
  {
    // The side vault off the bank (Expand the Vault): collapsed until restored, then a strongroom.
    id: 'vault', style: 'stone', interior: 'vault', x: 121, z: 72, w: 10, d: 11, wallH: 4.0, roof: ROOF.darkSlate, roofKind: 'flat',
    shared: ['w'], restore: 'vault_expanded',
    doors: [{ side: 'w', at: 6, w: 3 }],
    windows: [{ side: 's', at: 5 }, { side: 'e', at: 4 }],
    fits: [
      { kind: 'strongbox', x: 3, z: 2, block: [0.6, 0.5] }, { kind: 'strongbox', x: 5.5, z: 2, block: [0.6, 0.5] },
      { kind: 'gold', x: 8, z: 2.2, block: [0.7, 0.5] },
      { kind: 'shelf', x: 8.35, z: 7, rot: -Math.PI / 2, block: [0.4, 1.3] },
      { kind: 'strongbox', x: 4.5, z: 8.6, block: [0.6, 0.5] }, { kind: 'gold', x: 2.5, z: 8.6, block: [0.7, 0.5] },
      { kind: 'gold', x: 5.5, z: 5.2, block: [0.7, 0.5] },
    ],
  },
  {
    // The Quartermaster's shop: a timber shopfront with the counter inside and stocked shelves.
    id: 'shop', style: 'timber', interior: 'shop', x: 100, z: 104, w: 15, d: 11, wallH: 3.7, roof: ROOF.moss,
    doors: [{ side: 's', at: 6, w: 3 }],
    windows: [{ side: 's', at: 2.5 }, { side: 's', at: 12 }, { side: 'n', at: 3 }, { side: 'n', at: 12 }, { side: 'w', at: 5.5 }, { side: 'e', at: 5.5 }],
    fits: [
      { kind: 'shelf', x: 4, z: 1.5, block: [1.3, 0.4] }, { kind: 'shelf', x: 11, z: 1.5, block: [1.3, 0.4] },
      { kind: 'barrel', x: 1.9, z: 8.6, block: [0.5, 0.5] }, { kind: 'crate', x: 13, z: 8.6, block: [0.5, 0.5] },
      { kind: 'weapon_rack', x: 13.6, z: 4.6, rot: -Math.PI / 2, block: [0.4, 1.1] },
      { kind: 'rug', x: 7.5, z: 7.6, len: 3.2 },
    ],
  },
  {
    // Chapter 2: the alchemy lab (herb garden and pond beside it).
    id: 'alchemy_plot', style: 'timber', interior: 'alchemy', x: 32, z: 105, w: 13, d: 10, wallH: 3.6, roof: ROOF.teal, restore: 'alchemy_lab',
    doors: [{ side: 's', at: 5, w: 3 }],
    windows: [{ side: 's', at: 2.5 }, { side: 's', at: 10.5 }, { side: 'n', at: 6.5 }, { side: 'e', at: 5 }, { side: 'w', at: 5 }],
    fits: [
      { kind: 'cauldron', x: 6.5, z: 5, block: [0.8, 0.8] },
      { kind: 'flasks', x: 3.5, z: 1.8, block: [1.2, 0.5] },
      { kind: 'shelf', x: 9.5, z: 1.5, block: [1.3, 0.4] },
      { kind: 'workbench', x: 11.2, z: 6, rot: -Math.PI / 2, block: [0.6, 1.2] },
      { kind: 'barrel', x: 1.9, z: 7.4, block: [0.5, 0.5] }, { kind: 'crate', x: 2.0, z: 5.6, block: [0.5, 0.5] },
      { kind: 'rug', x: 6.5, z: 6.8, len: 2.4 },
    ],
  },
  {
    // Chapter 3: the rune altar house, in the bailey's east corner.
    id: 'rune_plot', style: 'stone', interior: 'rune', x: 88, z: 44, w: 11, d: 10, wallH: 4.0, roof: ROOF.violet, restore: 'rune_altar',
    doors: [{ side: 'w', at: 4, w: 3 }],
    windows: [{ side: 's', at: 3 }, { side: 's', at: 8 }, { side: 'n', at: 5.5 }, { side: 'e', at: 5 }],
    fits: [
      { kind: 'rune_altar', x: 5.5, z: 4.4, block: [1.3, 1.3] },
      { kind: 'shelf', x: 2.6, z: 1.5, block: [1.3, 0.4] },
      { kind: 'brazier', x: 9.1, z: 1.9, block: [0.4, 0.4] }, { kind: 'brazier', x: 9.1, z: 7.6, block: [0.4, 0.4] },
      { kind: 'rug', x: 5.5, z: 7.6, len: 1.6 },
    ],
  },
  {
    // Chapter 4: the dragon hatchery, a timber roost barn in the bailey's west corner.
    id: 'hatch_plot', style: 'timber', interior: 'hatchery', x: 50, z: 42, w: 14, d: 12, wallH: 4.2, roof: ROOF.rust, restore: 'hatchery',
    doors: [{ side: 'e', at: 5, w: 3 }],
    windows: [{ side: 's', at: 3.5 }, { side: 's', at: 10.5 }, { side: 'n', at: 4 }, { side: 'n', at: 10 }, { side: 'w', at: 6 }],
    fits: [
      { kind: 'nest', x: 4, z: 3.8, block: [1, 1] }, { kind: 'nest', x: 9, z: 6.5, block: [1, 1] }, { kind: 'nest', x: 4, z: 8.5, block: [1, 1] },
      { kind: 'brazier', x: 11, z: 2.5, block: [0.4, 0.4] },
      { kind: 'coal', x: 11.2, z: 9.6, block: [0.8, 0.6] }, { kind: 'crate', x: 1.9, z: 6.2, block: [0.5, 0.5] },
    ],
  },
];

const BUILDING = Object.fromEntries(KEEP_BUILDINGS.map((b) => [b.id, b]));
/** World position of a point given in a building's own cells. */
const inB = (id: string, x: number, z: number) => ({ x: BUILDING[id].x + x, z: BUILDING[id].z + z });

/**
 * The keep: a big floating island laid out in districts around the portal court where you arrive.
 * North, through a gatehouse, the walled inner keep (bailey, great hall, rune and hatchery plots);
 * west, the smithing quarter (smelter house and anvil yard); east, the bank and its side vault;
 * south-east, the Quartermaster's shop and market stalls; south-west, the alchemy plot and garden.
 */
export function buildKeep(seed: number): ZoneLayout {
  const w = 150, h = 150;
  const G = new Gen(w, h, seed, Cell.Void, Ground.Grass);
  const C = { x: 75, z: 72 };
  // Island: a rounded, noise-edged square (a superellipse), so the districts fill its corners.
  const reach = (x: number, z: number) => (Math.abs(x - C.x) ** 2.6 + Math.abs(z - C.z) ** 2.6) ** (1 / 2.6);
  for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) {
    const a = Math.atan2(z + 0.5 - C.z, x + 0.5 - C.x);
    const edge = 66 + (G.noise(Math.cos(a) * 3 + 10, Math.sin(a) * 3 + 10) - 0.5) * 8;
    if (reach(x + 0.5, z + 0.5) < edge) G.l.cells[G.idx(x, z)] = Cell.Ground;
  }
  // Every district stands on solid ground, whatever the rim noise did.
  for (const [x0, z0, x1, z1] of [[43, 12, 107, 64], [15, 62, 45, 102], [99, 65, 135, 88], [88, 100, 118, 122], [28, 101, 50, 122], [60, 80, 90, 112]]) {
    for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) G.l.cells[G.idx(x, z)] = Cell.Ground;
  }

  // ─── Roads and open spaces (reserved before anything is built) ─────────────
  const court = { x: 75, z: 95 };
  G.clearing(court.x, court.z, 14, Ground.Stone, 0.6);
  G.road([{ x: 75, z: 84 }, { x: 75, z: 72 }, { x: 75, z: 62 }], 4.4, Ground.Stone, 0.2);
  G.road([{ x: 62, z: 95 }, { x: 50, z: 93 }, { x: 41, z: 90 }, { x: 36, z: 89 }], 3.6, Ground.Stone, 0.2);
  G.road([{ x: 38.5, z: 86 }, { x: 38.8, z: 80 }, { x: 38.5, z: 73.5 }], 2.8, Ground.Stone, 0.2);
  G.road([{ x: 28.5, z: 80 }, { x: 28.5, z: 86 }], 3, Ground.Stone, 0.2);
  G.road([{ x: 88, z: 95 }, { x: 100, z: 92 }, { x: 112, z: 88 }], 4, Ground.Stone, 0.2);
  G.road([{ x: 98, z: 93 }, { x: 97.5, z: 104 }, { x: 99, z: 116 }, { x: 108, z: 117.5 }], 3.2, Ground.Stone, 0.2);
  G.road([{ x: 67, z: 106 }, { x: 56, z: 112 }, { x: 46, z: 117 }, { x: 38.5, z: 117 }], 2.8, Ground.Path, 0.4);
  // Inside the walls: gate to the hall door round a statue plaza, branching to the two plots.
  G.road([{ x: 75, z: 58 }, { x: 75, z: 48 }, { x: 75, z: 40 }], 3.6, Ground.Stone, 0.2);
  G.road([{ x: 65, z: 48 }, { x: 70, z: 49.5 }, { x: 80, z: 49.5 }, { x: 87, z: 49 }], 2.6, Ground.Path, 0.3);
  G.clearing(75, 48.5, 3.6, Ground.Stone, 0.3);
  // Anvil yard, bank and shop forecourts, market square, alchemy garden.
  G.clearing(30.5, 90.5, 9, Ground.Stone, 0.8);
  G.verge(30.5, 90.5, 14);
  G.clearing(112, 88, 4, Ground.Stone, 0.6);
  G.clearing(93, 110, 5, Ground.Stone, 0.8);
  G.clearing(46, 110, 4.5, Ground.Dirt, 1);
  // The bailey lawn stays open (trees only where planted below).
  for (let z = 18; z < 58; z++) for (let x = 49; x < 101; x++) if (!G.reserved[G.idx(x, z)]) G.reserved[G.idx(x, z)] = 3;

  // ─── Buildings ─────────────────────────────────────────────────────────────
  for (const b of KEEP_BUILDINGS) G.building(b);
  // Woods thin out around every building, so none is swallowed by the rim forest.
  for (const b of KEEP_BUILDINGS) G.verge(b.x + b.w / 2, b.z + b.d / 2, Math.max(b.w, b.d) / 2 + 7);

  // ─── Curtain wall, towers and gatehouse around the inner keep ──────────────
  const wall = (x: number, z: number, len: number, rot: number) => {
    G.prop('curtain', x, z, rot).len = len;
    const along = Math.abs(Math.sin(rot)) < 0.5;
    blockRect(G, x, z, along ? len / 2 : 1, along ? 1 : len / 2, 0);
  };
  wall(75, 17, 50, Math.PI);
  wall(48, 38, 38, -Math.PI / 2);
  wall(102, 38, 38, Math.PI / 2);
  wall(61.3, 59, 20.6, 0);
  wall(88.7, 59, 20.6, 0);
  for (const [x, z] of [[48, 17], [102, 17], [48, 59], [102, 59]]) {
    G.prop('wall_tower', x, z);
    blockRect(G, x, z, 3, 3, 0);
  }
  G.prop('gatehouse', 75, 59).len = 4;
  for (const sx of [-1, 1]) blockRect(G, 75 + sx * 3.7, 59, 1.7, 2, 0);

  // ─── Portal court: arrival dais, the portal ring, the Warden ───────────────
  G.prop('landing', 75, 101);
  G.l.entry = { x: 75, z: 99.2 };
  G.reserve(75, 101, 4);

  // ─── Stations (bank, furnace and shop first: the inspect tool frames the first few) ──
  const st = (kind: StationKind, id: string, p: Vec2, rot = 0, block = 0.1) => G.station(kind, id, p.x, p.z, rot, block);
  st('bank', 'bank', inB('bank', 10, 6.5));
  st('furnace', 'furnace', inB('smelter', 8.5, 2.6));
  st('shop', 'shop', inB('shop', 7.5, 4.5));
  st('restore', 'board', inB('great_hall', 11, 3.4), 0, 0.6);
  st('anvil', 'anvil', { x: 27.5, z: 89.5 }, 0, 0.9);
  st('restore', 'emberforge', { x: 33.5, z: 91 }, 0, 1.3);
  st('npc', 'warden', { x: 81.5, z: 101 }, -Math.PI * 0.6, 0.5);
  st('npc', 'quartermaster', inB('shop', 7.5, 2.9), 0, 0.4);
  // The two counters block their row (customers stand in front).
  blockRect(G, inB('bank', 10, 6.5).x, inB('bank', 10, 6.5).z, 3.1, 0.6, 0);
  blockRect(G, inB('shop', 7.5, 4.5).x, inB('shop', 7.5, 4.5).z, 2.6, 0.6, 0);
  for (const a of KEEP_ARCHES) {
    const rad = (a.angle * Math.PI) / 180;
    const x = court.x + Math.cos(rad) * 10.5, z = court.z + Math.sin(rad) * 10.5;
    G.station('portal', a.id, x, z, Math.atan2(court.x - x, court.z - z), 1.4);
  }
  // Restoration markers stand by each plot's door (the side vault's is inside the bank).
  st('restore', 'vault_expanded', inB('bank', 17.5, 12.3), -Math.PI / 2, 0.3);
  st('restore', 'alchemy_lab', inB('alchemy_plot', 3.2, 11.3), 0, 0.3);
  st('restore', 'rune_altar', inB('rune_plot', -1.6, 2.4), Math.PI / 2, 0.3);
  st('restore', 'hatchery', inB('hatch_plot', 15.6, 3.6), -Math.PI / 2, 0.3);

  // ─── Dressing ──────────────────────────────────────────────────────────────
  // Real lights only at the court, the gate and the two busiest doors; lamp posts elsewhere.
  for (const [x, z] of [[62.5, 95.5], [87.5, 95.5], [71, 64], [79, 64], [108, 86], [104.5, 118.5]]) G.prop('lamp', x, z, 0, 1, 0.4);
  for (const [x, z] of [[70.5, 43], [79.5, 43], [45, 91.5], [96, 100], [58, 111], [39, 83], [30.8, 116], [115.5, 86]]) G.prop('lamp_post', x, z, 0, 1, 0.4);
  // The yard: braziers either side of the Emberforge hearth, a rack and crates.
  G.prop('brazier', 31, 94.5, 0, 1, 0.45);
  G.prop('brazier', 36, 94.5, 0, 1, 0.45);
  G.prop('weapon_rack', 23.5, 93.5, 0.3, 1, 1.1);
  G.prop('crates', 22.5, 86.5, 0.4, 1, 0.9);
  G.prop('barrels', 36.5, 84.8, 0, 1, 0.9);
  // Bailey: statue plaza, a well, training dummies and a bench of barrels by the hall.
  G.prop('statue', 75, 48.5, 0, 1, 1.3);
  G.prop('well', 83.5, 53.5, 0, 1, 1.1);
  for (const [x, z] of [[66.5, 54], [69, 55.5], [64, 55.5]]) G.prop('dummy', x, z, Math.PI, 1, 0.5);
  G.prop('barrels', 91.5, 38.5, 0, 1, 0.9);
  // Market stalls between the court road and the shop, crates and barrels by the shop.
  G.prop('stall', 92, 106.5, Math.PI / 2, 1, 1.6).len = 0;
  G.prop('stall', 92.5, 113.5, Math.PI / 2, 1, 1.6).len = 1;
  G.prop('crates', 116.5, 116.5, 0.2, 1, 0.9);
  G.prop('barrels', 101.5, 101.5, 0, 1, 0.9);
  // Alchemy garden: herb beds and a pond.
  G.prop('herb_bed', 48, 107, Math.PI / 2, 1, 1.2);
  G.prop('herb_bed', 51.5, 107, Math.PI / 2, 1, 1.2);
  G.lake(52, 119, 4.5, Fluid.Water, 1.2);
  G.prop('signpost', 63, 100, 0.5, 1, 0.3);
  G.prop('signpost', 88.5, 91.5, -0.4, 1, 0.3);
  G.prop('crates', 22.5, 81.5, 0.3, 1, 0.9);

  // The hero is staged here for character creation and the pose tools; keep every camera spot
  // around it clear, or the near plane slices whatever prop sits there (the old "purple spike").
  for (const c of STAGE_CAMERAS) G.reserve(KEEP_STAGE.x + c.x, KEEP_STAGE.z + c.z, 2);
  G.reserve(KEEP_STAGE.x, KEEP_STAGE.z, 3);

  // Trees: a garden in each back corner of the bailey, woods thickening toward the rim.
  for (let z = 19; z < 57; z++) for (let x = 49; x < 101; x++) {
    const i = G.idx(x, z);
    if (G.l.cells[i] !== Cell.Ground || G.reserved[i] === 1) continue;
    const garden = (x < 59 && z < 40) || (x > 91 && z < 43) || z < 21;
    if (garden && G.rng() < 0.3 + (G.noise(x * 0.2, z * 0.2) - 0.5) * 0.4) G.l.cells[i] = G.rng() < 0.08 ? Cell.Rock : Cell.Tree;
  }
  // Small groves break up the lawns between the districts.
  for (const [gx, gz, r] of [[57, 73, 3.2], [93, 69, 3.6], [42, 63, 3], [111, 59, 3.4], [86, 118, 3], [119, 96, 2.6], [62, 124, 2.8], [52, 83, 2.2]]) {
    G.blob(gx, gz, r, 1, (i) => {
      if (G.l.cells[i] === Cell.Ground && !G.reserved[i] && G.rng() < 0.6) G.l.cells[i] = G.rng() < 0.1 ? Cell.Rock : Cell.Tree;
    });
  }
  G.scatter((x, z) => {
    if (x > 45 && x < 105 && z > 13 && z < 62) return 0;
    const d = reach(x, z);
    return Math.max(0, (d - 48) / 14) * 0.5 + (G.noise(x * 0.08, z * 0.08) > 0.64 ? 0.1 : 0);
  }, 0.16);
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
  G.station('exit', 'keep', 60, 112, Math.PI, 1.4);
  G.station('chest', 'mine_chest', 53.5, 106, Math.PI / 2, 0.7);
  // Open, dry floor within `r` of a point (no wall, fluid, prop or station cells).
  const clear = (x: number, z: number, r: number) => {
    for (let zz = Math.floor(z - r); zz <= z + r; zz++) for (let xx = Math.floor(x - r); xx <= x + r; xx++) {
      if (Math.hypot(xx + 0.5 - x, zz + 0.5 - z) > r + 0.3) continue;
      if (!G.inside(xx, zz)) return false;
      const i = G.idx(xx, zz);
      if (G.l.cells[i] !== Cell.Ground || G.l.fluid[i]) return false;
    }
    return true;
  };
  const onRoute = (x: number, z: number) => tunnelPolys.some((p) => distToPoly(x, z, p).d < 3.5);
  // Ore sits near the cavern walls but never inside them: the rock keeps a margin from the wall
  // and the camera side (+z) stays open floor, so the hero never mines from inside a rock.
  const ring = (c: { x: number; z: number; r: number }, ores: string[], start: number) => {
    ores.forEach((ore, k) => {
      const a = start + (k / ores.length) * Math.PI * 2;
      for (let rr = c.r + 3; rr > 1.5; rr -= 0.5) {
        const x = c.x + Math.cos(a) * rr, z = c.z + Math.sin(a) * rr;
        if (!clear(x, z, 1.3) || !clear(x, z + 1.9, 0.8) || onRoute(x, z)) continue;
        if (G.l.nodes.some((n) => Math.hypot(n.x - x, n.z - z) < 2.8)) continue;
        G.ore(ore, x, z);
        break;
      }
    });
  };
  ring(caverns.west, ['copper', 'tin', 'copper', 'tin', 'copper', 'tin', 'copper', 'tin', 'copper', 'tin'], 0.3);
  ring(caverns.tin, ['tin', 'tin', 'copper', 'tin', 'tin', 'copper'], 0.5);
  ring(caverns.hall, ['copper', 'tin', 'iron', 'copper', 'tin', 'iron'], 0.9);
  ring(caverns.east, ['iron', 'iron', 'iron', 'iron', 'iron', 'iron', 'iron'], 0.6);
  ring(caverns.east2, ['iron', 'coal', 'iron', 'coal', 'iron'], 0.2);
  ring(caverns.deep, ['coal', 'coal', 'iron', 'coal', 'coal', 'coal', 'iron', 'coal', 'coal', 'coal'], 0.2);
  const used: Vec2[] = [...G.l.nodes, ...G.l.stations];
  const free = (x: number, z: number, r: number, gap = 2.6) => clear(x, z, r) && !used.some((u) => Math.hypot(u.x - x, u.z - z) < gap);
  const put = (kind: string, x: number, z: number, rot = 0, s = 1, block = 0) => {
    used.push({ x, z });
    return G.prop(kind, x, z, rot, s, block);
  };
  // Timber support sets across the tunnels (every ~7 units where the passage is narrow), each
  // with a hanging lantern; a few of them light the way.
  let lit = 0;
  tunnelPolys.forEach((poly, ti) => {
    let last = -99, acc = 0;
    for (let k = 1; k < poly.length - 1; k++) {
      acc += Math.hypot(poly[k].x - poly[k - 1].x, poly[k].z - poly[k - 1].z);
      if (acc - last < 7) continue;
      const p = poly[k], dx = poly[k + 1].x - poly[k - 1].x, dz = poly[k + 1].z - poly[k - 1].z, dl = Math.hypot(dx, dz) || 1;
      const ux = dx / dl, uz = dz / dl, px = uz, pz = -ux;
      const reach = (sgn: number) => {
        for (let s = 0; s < 6; s += 0.25) {
          const x = Math.floor(p.x + px * s * sgn), z = Math.floor(p.z + pz * s * sgn);
          if (!G.inside(x, z) || G.l.cells[G.idx(x, z)] !== Cell.Ground) return s;
        }
        return 6;
      };
      const sR = reach(1), sL = reach(-1), span = sR + sL;
      if (span < 2.6 || span > 6.2) continue;
      const cx = p.x + px * (sR - sL) / 2, cz = p.z + pz * (sR - sL) / 2;
      if (!clear(cx, cz, 1.0) || used.some((u) => Math.hypot(u.x - cx, u.z - cz) < 3)) continue;
      let nearFluid = false;
      for (let zz = Math.floor(cz - 3); zz <= cz + 3; zz++) for (let xx = Math.floor(cx - 3); xx <= cx + 3; xx++) if (G.inside(xx, zz) && G.l.fluid[G.idx(xx, zz)]) nearFluid = true;
      if (nearFluid) continue;
      last = acc;
      const litHere = lit < 5 && (ti + k) % 2 === 0;
      if (litHere) lit++;
      G.prop(litHere ? 'mine_frame_lit' : 'mine_frame', cx, cz, Math.atan2(ux, uz), 1).len = span - 0.3;
      for (const sgn of [-1, 1]) blockDisc(G.l, cx + px * sgn * (span / 2 - 0.35), cz + pz * sgn * (span / 2 - 0.35), 0.45);
      used.push({ x: cx, z: cz });
    }
  });
  // Rails and carts along the main galleries, a tipped cart spilling ore in the iron workings.
  G.prop('rails', 58, 94, 0, 1).len = 12;
  put('minecart', 57, 90, 0.2, 1, 0.8);
  G.prop('rails', 36, 72, Math.PI / 2 + 0.2, 1).len = 10;
  put('minecart', 30, 74, 1.4, 1, 0.8);
  G.prop('rails', 80, 69, Math.PI / 2 - 0.45, 1).len = 9;
  G.prop('rails', 60, 36, 0.1, 1).len = 7;
  put('minecart', 59.6, 39.5, 0.1, 1, 0.8);
  for (const [c, a] of [[caverns.east, 2.4], [caverns.deep, 0.9]] as [typeof caverns.east, number][]) {
    for (let r = 3; r < c.r; r += 0.5) {
      const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
      if (free(x, z, 1.6, 3.2)) {
        put('minecart_tipped', x, z, a + Math.PI / 2, 1, 0.9);
        break;
      }
    }
  }
  // Miners' camp by the entry: crates and a lantern by the deposit chest.
  put('crates', 51.5, 103.5, 0.4, 1, 0.6);
  put('crates', 67.5, 104.5, -0.3, 1, 0.6);
  // Lanterns in every cavern (on the far wall), shoring timbers against cavern walls.
  for (const c of Object.values(caverns)) put('lantern', c.x + 0.5, c.z - c.r + 2.5);
  for (const [name, c] of Object.entries(caverns)) {
    if (name === 'grotto') continue;
    for (const a0 of [-Math.PI / 2 - 0.7, -Math.PI / 2 + 0.8, Math.PI + 0.3, 0.2]) {
      let wx = 0, wz = 0, hit = false;
      for (let r = 2; r < c.r + 6; r += 0.25) {
        wx = c.x + Math.cos(a0) * r;
        wz = c.z + Math.sin(a0) * r;
        const cell = G.l.cells[G.idx(Math.floor(wx), Math.floor(wz))];
        if (cell !== Cell.Ground) {
          // Only against rock (never a lake shore or another prop).
          hit = cell === Cell.Wall;
          break;
        }
      }
      if (!hit) continue;
      const x = wx - Math.cos(a0) * 0.9, z = wz - Math.sin(a0) * 0.9;
      if (!free(x, z, 0.6, 3) || onRoute(x, z)) continue;
      put('shoring', x, z, Math.atan2(-Math.cos(a0), -Math.sin(a0)), 1, 0.6);
      break;
    }
  }
  // Seep puddles and loose ore chips on the floors.
  for (const [c, n] of [[caverns.hall, 3], [caverns.west, 1], [caverns.deep, 2], [caverns.east, 1], [caverns.entry, 1]] as [typeof caverns.hall, number][]) {
    let placed = 0;
    for (let t = 0; t < 40 && placed < n; t++) {
      const a = G.rng() * Math.PI * 2, r = 2 + G.rng() * (c.r - 2);
      const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
      if (!free(x, z, 1.5, 3)) continue;
      G.prop('puddle', x, z, G.rng() * 6, 0.65 + G.rng() * 0.35).len = placed++;
      used.push({ x, z });
    }
  }
  const chipKind: Record<string, number> = { copper: 0, tin: 1, iron: 2, coal: 3 };
  G.l.nodes.forEach((n, i) => {
    if (i % 2) return;
    for (let t = 0; t < 8; t++) {
      const a = G.rng() * Math.PI * 2, x = n.x + Math.cos(a) * 1.9, z = n.z + Math.sin(a) * 1.9;
      if (!clear(x, z, 0.5)) continue;
      G.prop('ore_chips', x, z, G.rng() * 6).len = chipKind[n.ore] ?? 0;
      break;
    }
  });
  for (let k = 0; k < 6; k++) {
    const a = k * 1.05 + 0.3;
    G.prop('crystal_big', caverns.grotto.x + Math.cos(a) * 4.5, caverns.grotto.z + Math.sin(a) * 4.5, a, 0.8 + (k % 3) * 0.2, 0.7);
  }
  for (let k = 0; k < 40; k++) {
    const x = 4 + G.rng() * (w - 8), z = 4 + G.rng() * (h - 8);
    if (free(x, z, 0.5, 2.2) && !onRoute(x, z)) G.prop(G.rng() < 0.3 ? 'mushrooms' : 'crystal', x, z, G.rng() * 6, 0.6 + G.rng() * 0.6);
  }
  G.connect();
  return G.l;
}

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
  G.prop('tower_ruin', 66, 92, 0.6, 1, 3.0);
  G.verge(66, 99, 6);
  G.prop('dragon_bones', 100, 70, 0.7, 1);
  // An old stone circle: seven menhirs, their carved faces turned to the altar stone at its heart.
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2;
    G.prop('standing_stone', 34 + Math.cos(a) * 4.5, 136 + Math.sin(a) * 4.5, Math.atan2(-Math.cos(a), -Math.sin(a)), 1, 0.5).len = k;
  }
  G.prop('standing_stone', 34, 136, 0.4, 1, 1.0).len = 99;
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + 0.3;
    G.prop('pillar', 42 + Math.cos(a) * 6, 56 + Math.sin(a) * 6, a, 1, 0.5);
  }
  G.prop('brazier', 43.5, 55, 0, 1, 0.5);
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
  for (const [x, z] of [[46, 52], [142, 42], [106, 78], [89, 38], [60, 36], [136, 98]]) G.ore('emberite', x, z);
  // Portals.
  G.l.entry = { x: entry.x, z: entry.z };
  G.station('exit', 'keep', entry.x, entry.z + 6, Math.PI, 1.4);
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
    const woods = n > 0.6 ? 0.5 + (n - 0.6) * 2 : n > 0.5 ? 0.05 : 0.012;
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
  G.station('exit', 'keep', 55, 103, Math.PI, 1.4);
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
  // The den: a wide caldera floor (the boss logic scales with A.r).
  const A = { x: 50, z: 33, r: 17 };
  const road = G.road([{ x: 50, z: 126 }, { x: 50, z: 116 }, { x: 40, z: 98 }, { x: 58, z: 80 }, { x: 46, z: 64 }, { x: 50, z: 54 }, { x: 50, z: 48 }], 3.6, Ground.Path);
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
  // The fighting floor is one calm sheet of ruddy arena rock: soot gradients (burns) darken it
  // around the roost and along the lava seams, and the caldera wall's foot sits in its own shade.
  const home = { x: A.x, z: A.z - 2 };
  const burns: NonNullable<ZoneLayout['burns']> = (G.l.burns = []);
  burns.push({ x: home.x, z: home.z, r: 7.5, k: 0.8 });
  // A lava pool seeps out of the north-west wall; fissures run from it across the floor's edge.
  G.lake(39, 21, 3.6, Fluid.Lava, 1.2, true);
  const seam = (x: number, z: number, dx: number, dz: number, v: number) => {
    G.prop('lava_seam', x, z, Math.atan2(dx, dz), 1).len = v;
    // Soot fans out along the fissure, strongest round its wide, hot source.
    const l = 7.5 / Math.hypot(dx, dz);
    burns.push({ x, z, x2: x + dx * l, z2: z + dz * l, r: 3.0, k: 0.6 }, { x, z, r: 4.0, k: 0.75 });
  };
  seam(41.2, 24.8, -0.15, 1, 0);
  seam(42.6, 22.6, 1, 0.3, 1);
  seam(55, 25.2, 0.3, 1, 2);
  seam(36.5, 44.5, 1, -0.55, 3);
  // The hoard: a raised basalt ledge against the north-east wall, heaped with gold.
  G.prop('hoard_ledge', 58, 21.2, -0.25, 1, 3.4);
  // A few plates of cooled lava crust set into the fighting floor (flat, so telegraphs read on them).
  for (const [x, z, v, sc] of [[43.2, 30.2, 0, 1], [56.4, 41.4, 1, 1.15], [44.6, 43.2, 2, 0.9]]) G.prop('crust', x, z, Math.atan2(-(z - A.z), x - A.x), sc).len = v;
  // Scorch marks where it has breathed fire: a charred core in a wide, soft burn.
  for (const [x, z, s, v] of [[home.x, home.z, 2.0, 0], [49.5, 39.5, 1.1, 1], [56.5, 34.5, 1.2, 2], [42.5, 36.5, 0.9, 3]]) {
    G.prop('scorch', x, z, x, s).len = v;
    burns.push({ x, z, r: 2.6 * s, k: 0.7 });
  }
  // Blocky basalt columns frame the entrance and stand along the wall; ember crystals glow at the rim.
  for (const [x, z, v] of [[34.2, 28.5, 0], [45.5, 16.8, 1], [43.6, 48.6, 2], [56.8, 48.6, 3], [66.4, 42.5, 4]]) G.prop('basalt_columns', x, z, v * 1.3, 1, 1.3).len = v;
  for (const [x, z, v] of [[35.2, 39.8, 0], [61.2, 45.6, 1], [48.6, 16.2, 1]]) G.prop('ember_crystals', x, z, v * 2 + x, 1, 1.0).len = v;
  // A cooled lava tongue along the west wall.
  G.prop('basalt_ridge', 34.6, 34, 0.08, 1).len = 7;
  for (let t = -3; t <= 3; t += 1) blockDisc(G.l, 34.6 + t * 0.08, 34 + t, 0.8);
  // The bones of a dragon that lost, curled along the east wall; bone drifts where the dead fell.
  G.prop('dragon_bones', 64.2, 31, 0.08, 0.72);
  for (let t = -8; t <= 6; t += 1.5) blockDisc(G.l, 64.2 + t * 0.08, 31 + t, 0.7);
  for (const [x, z, v] of [[52.8, 23.8, 1], [46.2, 21.2, 2], [38.6, 44.2, 3], [40.6, 46.2, 0], [60.4, 41.2, 2], [47.2, 19.2, 0], [62.2, 25.2, 1]]) G.prop('bones', x, z, x * 1.7, 1.2).len = v;
  // Rock fallen from the caldera wall lies at its foot, not out on the fighting floor.
  for (const [x, z, v] of [[37.2, 25.4, 10], [61.4, 45.2, 12]]) G.prop('rubble', x, z, x, 1).len = v;
  G.pack(26, 104, ['drakeling', 'drakeling'], 6);
  G.pack(88, 79, ['drakeling', 'drakeling', 'drakeling'], 6);
  G.pack(44, 64, ['drakeling', 'kobold', 'kobold'], 6);
  G.l.entry = { x: 50, z: 118 };
  G.station('exit', 'keep', 50, 124, Math.PI, 1.4);
  G.l.boss = { id: 'cinderwing', x: home.x, z: home.z, r: A.r };
  // A second skeleton out in the badlands, on dry ground between the east lava lake and the river
  // (reserved, so no spire or rock grows through it), lying along the river bank.
  G.prop('dragon_bones', 69, 85.6, 1.45, 0.8);
  for (let t = -9; t <= 7; t += 2) G.reserve(69 + t, 85.6 + t * 0.12, 2);
  // Obsidian spires and bone fields across the badlands.
  for (let k = 0; k < 26; k++) {
    const x = 10 + G.rng() * (w - 20), z = 56 + G.rng() * 62;
    const i = G.idx(Math.floor(x), Math.floor(z));
    if (G.l.cells[i] === Cell.Ground && !G.l.fluid[i] && !G.reserved[i]) G.prop('obsidian', x, z, G.rng() * 6, 0.7 + G.rng() * 0.7, 1);
  }
  for (let k = 0; k < 30; k++) {
    const x = 10 + G.rng() * (w - 20), z = 56 + G.rng() * 62;
    const i = G.idx(Math.floor(x), Math.floor(z));
    if (G.l.cells[i] === Cell.Ground && !G.l.fluid[i]) G.prop('bones', x, z, G.rng() * 6).len = k;
  }
  G.scatter((x, z) => (G.noise(x * 0.08, z * 0.08) > 0.6 ? 0.1 : 0.02), 0.5);
  G.frame(9, Cell.Cliff, 6);
  G.connect();
  return G.l;
}
