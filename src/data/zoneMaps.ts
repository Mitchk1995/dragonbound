import type { Vec2 } from '../types';
import { Gen, distToPoly, pointAt } from '../world/gen';
import { upperCells, type BuildingSpec } from '../world/building';
import { blockDisc, Cell, Fluid, Ground, Lawn, lawnCell, type StationKind, type Strand, type ZoneLayout } from '../world/layout';
import { KERB_SET } from '../world/kerbStones';
import * as castleApproach from '../world/castle/approach';
import * as castleBailey from '../world/castle/bailey';
import * as castleCurtain from '../world/castle/curtain';
import * as castleGround from '../world/castle/ground';
import { onCrown } from '../world/castle/ground';
import { keepGround, KEEP_SPEC } from '../world/castle/keepSpec';
import { AXIS, CROWN_Y, CURTAIN_CORNERS, FARM, FOUNTAIN, GATE, KEEP, mx, WATER, ZONES } from '../world/castle/plan';
import { RANGE_SPECS } from '../world/castle/rangeSpecs';
import { inPoly as inPolygon, Site } from '../world/castle/site';

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
export const KEEP_STAGE: Vec2 = { x: 145, z: 149 };

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
const ROOF = { darkSlate: 0x3e4450, terracotta: 0x9a5438, moss: 0x4a6a48, teal: 0x3e6a6a, violet: 0x4a4a78, rust: 0x7a4a34 };

/**
 * The keep's enterable buildings: the castle's (the great keep and its ranges, src/world/castle/)
 * and the island's. Coordinates are grid cells (outer walls included); fittings are in cells from
 * each building's corner. Stations inside them are placed by buildKeep.
 */
export const KEEP_BUILDINGS: BuildingSpec[] = [
  KEEP_SPEC,
  ...RANGE_SPECS,
  {
    // The smelter: a timber-framed forge house on a stone base, laid out as the work flows. Ore
    // comes in by cart through the east door to the bin beside the furnace (coal heaped next to it);
    // the furnace stands against the back wall with its bellows; the melt is poured at the crucible
    // stand to the west; finished bars are racked by the south door, which opens onto the anvil yard.
    id: 'smelter', style: 'timber', interior: 'smelter', x: 106, z: 126, w: 17, d: 13, wallH: 3.9, roof: ROOF.terracotta,
    doors: [{ side: 's', at: 7, w: 3 }, { side: 'e', at: 5, w: 3 }],
    // (No south window west of the door: the forge yard's lean-to stands against that stretch.)
    windows: [{ side: 's', at: 13.5 }, { side: 'n', at: 3 }, { side: 'n', at: 14 }, { side: 'w', at: 6.5 }, { side: 'e', at: 10.5 }],
    fits: [
      { kind: 'furnace_spot', x: 8.5, z: 2.6, block: [1.9, 1.2] },
      // Ore in: the cart track from the east door, the ore bin and coal heap beside the furnace.
      { kind: 'rails', x: 13.9, z: 6.5, rot: Math.PI / 2, len: 4.6 },
      { kind: 'ore_cart', x: 12.6, z: 6.5, rot: Math.PI / 2, block: [1.0, 0.6] },
      { kind: 'ore_bin', x: 12.2, z: 2.2, block: [0.9, 0.6] },
      { kind: 'coal', x: 14.5, z: 2.4, block: [0.8, 0.6] },
      // The furnace's west side: bellows, the tool board, the crucible stand.
      { kind: 'bellows', x: 5.4, z: 2.8, rot: Math.PI / 2, block: [0.8, 0.5] },
      { kind: 'tools', x: 5.4, z: 1.0 },
      { kind: 'crucibles', x: 2.4, z: 2.3, block: [0.65, 0.4] },
      // Casting down the west side: the melt is poured into the moulds on the casting table, the
      // moulds knocked out over the water trough under the window.
      { kind: 'mould_table', x: 4.6, z: 5.9, block: [1.0, 0.45] },
      { kind: 'trough', x: 1.6, z: 6.4, rot: Math.PI / 2, block: [0.4, 0.95] },
      // Bars out: rack and pallet by the south door; the tally bench across the floor from them.
      { kind: 'bars', x: 1.6, z: 9.8, rot: Math.PI / 2, block: [0.35, 0.8] },
      { kind: 'bar_stack', x: 4.2, z: 10.5, block: [0.7, 0.5] },
      { kind: 'workbench', x: 12.0, z: 10.4, block: [1.1, 0.5] },
      { kind: 'barrel', x: 15.0, z: 10.7, block: [0.5, 0.5] },
      { kind: 'sacks', x: 15.1, z: 3.9, block: [0.45, 0.45] },
    ],
  },
  {
    // The bank: a stone counting hall. Tellers' counter across the room, the vault door behind,
    // clerks' desks and ledger shelves on the tellers' side, benches and candle stands out front.
    id: 'bank', style: 'stone', interior: 'bank', x: 172, z: 122, w: 20, d: 15, wallH: 4.6, roof: ROOF.darkSlate,
    doors: [{ side: 's', at: 8, w: 4 }, { side: 'e', at: 9, w: 3 }],
    windows: [{ side: 's', at: 3.5 }, { side: 's', at: 16.5 }, { side: 'n', at: 4 }, { side: 'n', at: 16 }, { side: 'w', at: 7.5 }],
    fits: [
      { kind: 'vault_door', x: 10, z: 1.2, block: [1.6, 0.4] },
      { kind: 'banner', x: 6.8, z: 1.0 }, { kind: 'banner', x: 13.2, z: 1.0 },
      { kind: 'strongbox', x: 3, z: 2, block: [0.6, 0.5] }, { kind: 'strongbox', x: 17, z: 2, block: [0.6, 0.5] },
      { kind: 'gold', x: 5.5, z: 2, block: [0.7, 0.5] }, { kind: 'gold', x: 14.5, z: 2.2, block: [0.7, 0.5] },
      { kind: 'coin_sacks', x: 7.6, z: 2.5, block: [0.45, 0.4] }, { kind: 'coin_sacks', x: 12.4, z: 2.5, rot: 1.2, block: [0.45, 0.4] },
      { kind: 'shelf', x: 1.4, z: 4.2, rot: Math.PI / 2, len: 1, block: [0.4, 1.3] },
      { kind: 'shelf', x: 18.6, z: 4.2, rot: -Math.PI / 2, len: 1, block: [0.4, 1.3] },
      { kind: 'ledger_desk', x: 5.8, z: 4.2, block: [0.9, 0.45] }, { kind: 'ledger_desk', x: 14.2, z: 4.2, block: [0.9, 0.45] },
      { kind: 'rug', x: 10, z: 10.5, len: 6 },
      { kind: 'candelabra', x: 6.2, z: 8.1, block: [0.3, 0.3] }, { kind: 'candelabra', x: 13.8, z: 8.1, block: [0.3, 0.3] },
      { kind: 'pillar', x: 5.5, z: 10.5, block: [0.5, 0.5] }, { kind: 'pillar', x: 14.5, z: 10.5, block: [0.5, 0.5] },
      { kind: 'bench', x: 1.6, z: 10.8, rot: Math.PI / 2, block: [0.3, 1.1] },
      { kind: 'bench', x: 4.4, z: 13.4, block: [1.1, 0.3] },
    ],
  },
  {
    // The side vault off the bank (Expand the Vault): collapsed until restored, then a strongroom.
    id: 'vault', style: 'stone', interior: 'vault', x: 191, z: 125, w: 10, d: 11, wallH: 4.0, roof: ROOF.darkSlate, roofKind: 'flat',
    shared: ['w'], restore: 'vault_expanded',
    doors: [{ side: 'w', at: 6, w: 3 }],
    windows: [{ side: 's', at: 5 }, { side: 'e', at: 4 }],
    fits: [
      { kind: 'strongbox', x: 3, z: 2, block: [0.6, 0.5] }, { kind: 'strongbox', x: 5.5, z: 2, block: [0.6, 0.5] },
      { kind: 'gold', x: 8, z: 2.2, block: [0.7, 0.5] },
      { kind: 'candelabra', x: 1.7, z: 3.6, block: [0.3, 0.3] },
      { kind: 'coin_sacks', x: 7.9, z: 4.3, block: [0.45, 0.4] },
      { kind: 'rug', x: 4.6, z: 6.9, len: 2.6 },
      { kind: 'shelf', x: 8.35, z: 7, rot: -Math.PI / 2, block: [0.4, 1.3] },
      { kind: 'strongbox', x: 4.5, z: 8.6, block: [0.6, 0.5] }, { kind: 'gold', x: 2.5, z: 8.6, block: [0.7, 0.5] },
      { kind: 'strongbox', x: 7.4, z: 9.4, rot: 0.2, block: [0.6, 0.5] },
      { kind: 'gold', x: 5.5, z: 4.8, block: [0.7, 0.5] },
    ],
  },
  {
    // The Quartermaster's shop: a timber shopfront. Counters run wall to wall (the Quartermaster
    // serves from behind them, stock shelves at his back); customers browse the front of the room.
    id: 'shop', style: 'timber', interior: 'shop', x: 162, z: 150, w: 15, d: 11, wallH: 3.7, roof: ROOF.moss,
    doors: [{ side: 's', at: 6, w: 3 }],
    windows: [{ side: 's', at: 2.5 }, { side: 's', at: 12 }, { side: 'n', at: 3 }, { side: 'n', at: 12 }, { side: 'w', at: 5.5 }, { side: 'e', at: 5.5 }],
    fits: [
      // Behind the counter.
      { kind: 'shelf', x: 5.3, z: 1.5, block: [1.3, 0.4] }, { kind: 'shelf', x: 9.7, z: 1.5, len: 2, block: [1.3, 0.4] },
      { kind: 'barrel', x: 1.9, z: 1.9, block: [0.5, 0.5] }, { kind: 'sacks', x: 2.2, z: 3.2, block: [0.45, 0.45] },
      { kind: 'crate', x: 13.1, z: 1.9, block: [0.5, 0.5] }, { kind: 'jars', x: 12.8, z: 3.2, block: [0.45, 0.4] },
      // The counter line (the Quartermaster's own counter in the middle is the shop station).
      { kind: 'display_case', x: 3.0, z: 4.5, len: 3.6, block: [1.9, 0.5] },
      { kind: 'display_case', x: 12.0, z: 4.5, len: 3.6, block: [1.9, 0.5] },
      // The shop floor.
      { kind: 'rug', x: 7.5, z: 7.6, len: 3.2 },
      { kind: 'armor_stand', x: 1.8, z: 6.4, rot: Math.PI / 2, block: [0.45, 0.45] },
      { kind: 'barrel', x: 1.9, z: 8.6, block: [0.5, 0.5] }, { kind: 'sacks', x: 3.3, z: 9.2, block: [0.45, 0.45] },
      { kind: 'weapon_rack', x: 13.55, z: 6.9, rot: -Math.PI / 2, block: [0.4, 1.1] },
      { kind: 'crate', x: 13.0, z: 9.1, block: [0.5, 0.5] },
      { kind: 'display_table', x: 10.9, z: 8.2, block: [0.8, 0.5] },
    ],
  },
  {
    // Chapter 2: the alchemy lab (herb garden and pond beside it).
    id: 'alchemy_plot', style: 'timber', interior: 'alchemy', x: 100, z: 172, w: 13, d: 10, wallH: 3.6, roof: ROOF.teal, restore: 'alchemy_lab',
    doors: [{ side: 's', at: 5, w: 3 }],
    windows: [{ side: 's', at: 2.5 }, { side: 's', at: 10.5 }, { side: 'n', at: 6.5 }, { side: 'e', at: 5 }, { side: 'w', at: 5 }],
    fits: [
      { kind: 'cauldron', x: 6.5, z: 3.8, block: [0.8, 0.8] },
      { kind: 'rug', x: 6.5, z: 6.4, len: 2.4 },
      { kind: 'flasks', x: 3.3, z: 1.8, block: [1.2, 0.5] },
      { kind: 'shelf', x: 9.6, z: 1.5, len: 2, block: [1.3, 0.4] },
      { kind: 'distiller', x: 9.4, z: 4.2, block: [0.5, 0.5] },
      { kind: 'sacks', x: 11.3, z: 2.9, block: [0.4, 0.4] },
      { kind: 'workbench', x: 11.2, z: 6.4, rot: -Math.PI / 2, block: [0.6, 1.2] },
      { kind: 'herb_rack', x: 1.5, z: 3.4, rot: Math.PI / 2, block: [0.35, 0.9] },
      { kind: 'crate', x: 2.0, z: 5.6, block: [0.5, 0.5] }, { kind: 'barrel', x: 1.9, z: 7.0, block: [0.5, 0.5] },
      { kind: 'jars', x: 3.3, z: 8.2, block: [0.45, 0.4] },
      { kind: 'candles', x: 9.0, z: 7.9 },
    ],
  },
  {
    // Chapter 3: the rune altar house, at the end of the east lane past the orchard.
    id: 'rune_plot', style: 'stone', interior: 'rune', x: 244, z: 74, w: 11, d: 10, wallH: 4.0, roof: ROOF.violet, restore: 'rune_altar',
    doors: [{ side: 'w', at: 4, w: 3 }],
    windows: [{ side: 's', at: 3 }, { side: 's', at: 8 }, { side: 'n', at: 5.5 }, { side: 'e', at: 5 }],
    fits: [
      // A runner from the door to the altar.
      { kind: 'rug', x: 2.7, z: 5.5, rot: Math.PI / 2, len: 3.4 },
      { kind: 'rune_altar', x: 5.8, z: 4.2, block: [1.3, 1.3] },
      { kind: 'shelf', x: 2.6, z: 1.5, len: 1, block: [1.3, 0.4] },
      { kind: 'brazier', x: 9.1, z: 1.9, block: [0.4, 0.4] }, { kind: 'brazier', x: 9.1, z: 7.6, block: [0.4, 0.4] },
      { kind: 'crystals', x: 9.0, z: 4.8, block: [0.45, 0.45] }, { kind: 'crystals', x: 1.9, z: 8.0, block: [0.45, 0.45] },
      { kind: 'lectern', x: 7.4, z: 7.6, rot: -0.5, block: [0.35, 0.35] },
      { kind: 'candles', x: 7.6, z: 1.8 }, { kind: 'candles', x: 4.2, z: 7.6 },
    ],
  },
  {
    // Chapter 4: the dragon hatchery, a timber roost barn up on the north-east upland.
    id: 'hatch_plot', style: 'timber', interior: 'hatchery', x: 180, z: 30, w: 14, d: 12, wallH: 4.2, roof: ROOF.rust, restore: 'hatchery',
    doors: [{ side: 'e', at: 5, w: 3 }],
    windows: [{ side: 's', at: 3.5 }, { side: 's', at: 10.5 }, { side: 'n', at: 4 }, { side: 'n', at: 10 }, { side: 'w', at: 6 }],
    fits: [
      { kind: 'straw', x: 6.5, z: 6.0 }, { kind: 'straw', x: 3.0, z: 6.2 }, { kind: 'straw', x: 10.5, z: 4.4 },
      { kind: 'nest', x: 4, z: 3.8, block: [1, 1] }, { kind: 'nest', x: 9, z: 6.5, block: [1, 1] }, { kind: 'nest', x: 4, z: 8.5, block: [1, 1] },
      { kind: 'hay', x: 1.9, z: 1.8, block: [0.7, 0.4] }, { kind: 'hay', x: 6.0, z: 1.8, rot: 0.2, block: [0.7, 0.4] },
      { kind: 'perch', x: 9.2, z: 2.0, block: [1.1, 0.2] },
      { kind: 'brazier', x: 11.6, z: 2.5, block: [0.4, 0.4] }, { kind: 'brazier', x: 6.6, z: 9.9, block: [0.4, 0.4] },
      { kind: 'sacks', x: 12.3, z: 3.8, block: [0.4, 0.4] },
      { kind: 'trough', x: 9.3, z: 10.2, block: [0.9, 0.35] },
      { kind: 'coal', x: 11.6, z: 9.6, block: [0.8, 0.6] },
      { kind: 'crate', x: 1.9, z: 6.2, block: [0.5, 0.5] }, { kind: 'egg_crate', x: 1.9, z: 10.2, block: [0.45, 0.4] },
    ],
  },
];

const BUILDING = Object.fromEntries(KEEP_BUILDINGS.map((b) => [b.id, b]));
/** World position of a point given in a building's own cells. */
const inB = (id: string, x: number, z: number) => ({ x: BUILDING[id].x + x, z: BUILDING[id].z + z });

/**
 * The forge yard south of the smelter: the lean-to against its south wall (west of the door), the
 * hearth (the Emberforge) under it and the anvil out in front.
 */
export const FORGE = { canopy: { x: 109.2, z: 140.5 }, hearth: { x: 108.9, z: 140.1 }, anvil: { x: 109.4, z: 145.8 } };

/**
 * Inspect views of the island's districts and landmarks and the castle's yards (label, centre, zoom).
 * The harness frames each one through the gameplay camera.
 */
export const KEEP_VIEWS: { label: string; x: number; z: number; zoom: number }[] = [
  { label: 'court', x: 150, z: 138, zoom: 1.35 },
  { label: 'forge-yard', x: 114.6, z: 148, zoom: 1.05 },
  { label: 'anvil-close', x: 109.4, z: 147.2, zoom: 0.65 },
  { label: 'craft-quarter', x: 120, z: 136, zoom: 1.35 },
  { label: 'green', x: 120, z: 158, zoom: 1.15 },
  { label: 'stream-bridge', x: 97, z: 153, zoom: 1.0 },
  { label: 'farm', x: 58, z: 140, zoom: 1.35 },
  { label: 'falls-pool', x: 78, z: 128, zoom: 1.0 },
  { label: 'climb', x: 131, z: 128, zoom: 1.2 },
  { label: 'castle-gate', x: 76, z: 106, zoom: 1.35 },
  { label: 'castle-bailey', x: 76, z: 72, zoom: 1.6 },
  { label: 'castle-fountain', x: 76, z: 70, zoom: 0.9 },
  { label: 'castle-cour', x: 76, z: 55, zoom: 1.2 },
  { label: 'castle-terrace', x: 76, z: 42, zoom: 1.2 },
  { label: 'castle-stables', x: 50, z: 61, zoom: 1.1 },
  { label: 'castle-training', x: 108, z: 87, zoom: 1.2 },
  { label: 'orchard', x: 218, z: 84, zoom: 1.35 },
  { label: 'market-lane', x: 162, z: 162, zoom: 1.15 },
  { label: 'alchemy-pond', x: 100, z: 180, zoom: 1.2 },
  { label: 'memorial', x: 150.5, z: 189, zoom: 1.15 },
  { label: 'lookout', x: 153, z: 206, zoom: 1.0 },
  { label: 'upland', x: 192, z: 44, zoom: 1.35 },
  { label: 'east-shelf', x: 236, z: 130, zoom: 1.5 },
];

/**
 * The home island (docs/blueprints/home-island-v1): a torn fragment of land drifting in the Veil.
 * Fresh, angular tear faces run along the north and west and one unbridged fracture notch splits the
 * castle's crown from the north-east upland; the older south and east edges are weathered into
 * rounded lobes and headlands. The ground climbs in levels: the lowland round the portal court (0),
 * the east shelf (+3), the castle rock's shoulder (+5), the north-east upland (+7) and the crown
 * (+11), where the castle stands (src/world/castle/: castle v4, the great keep). Cliffs rise wherever
 * two levels meet, except where a road or a stair climbs between them. From the court, roads go:
 * - west along the ore lane to the foot of the castle's stair up the rock's south-east corner, then
 *   along the ledge under the castle's south wall to the gate terrace and the bridge to the gate;
 * - west to the smelter and its forge yard, the farm lane on past the green and over the stream to
 *   the fields, and the spring path up to the pool under the castle's fall;
 * - east to the bank and its side vault, and the east lane on to the orchard and the rune plot, with
 *   the upland lane climbing to the hatchery;
 * - south past the market stalls to the Quartermaster's shop, south-west to the alchemy lab by the
 *   pond, and south through the memorial garden to the lookout on the old south headland.
 * The east shelf, the north-east upland and the south-west terrace are kept open for later.
 */
const ISLAND = {
  w: 296, h: 228,
  // The land's outline (clockwise from the north-west tear); t = fresh tear face, o = old weathered
  // edge. The north-west and north stand out far enough for the castle's crown and the rock round
  // its moat behind the keep.
  outline: [
    [20, 40, 't'], [19, 22, 't'], [21, 8, 't'], [40, 3.5, 't'], [56, 0.5, 't'], [76, -0.5, 't'], [96, 1, 't'], [104, 5.5, 't'], [118, 6, 't'], [132, 12, 't'],
    [138, 10, 't'], [141, 30, 't'], [144, 46, 't'], [147, 30, 't'], [150, 10, 't'], [166, 8, 't'], [186, 14, 't'], [204, 10, 't'],
    [222, 20, 't'], [236, 18, 'o'], [250, 30, 'o'], [262, 46, 'o'], [272, 64, 'o'], [278, 86, 'o'], [276, 104, 'o'], [282, 122, 'o'],
    [280, 142, 'o'], [270, 158, 'o'], [256, 166, 'o'], [248, 178, 'o'], [252, 192, 'o'], [240, 204, 'o'], [222, 206, 'o'], [204, 198, 'o'],
    [190, 200, 'o'], [176, 206, 'o'], [164, 214, 'o'], [154, 220, 'o'], [146, 214, 'o'], [140, 204, 'o'], [126, 200, 'o'], [112, 204, 'o'],
    [96, 198, 'o'], [74, 190, 'o'], [60, 184, 'o'], [46, 170, 'o'], [34, 158, 't'], [28, 140, 't'], [20, 124, 't'], [20, 108, 't'],
    [14, 96, 't'], [18, 80, 't'], [12, 66, 't'], [20, 54, 't'],
  ] as [number, number, string][],
  // Ground levels below the crown, lowest first (each overrides what lies under it; the crown, its
  // edge drawn as the rock's own, is laid over them by the castle's ground).
  levels: [
    { h: 3, poly: [[206, 104], [262, 100], [270, 130], [256, 156], [214, 160], [206, 132]] },
    // (On the east the shoulder runs close under the crown and fans out unevenly, so its cliff and
    // the crown's merge into one broken massif instead of two parallel ribs.)
    { h: 5, poly: [[25, 46], [30, 26], [46, 16], [60, 8], [84, 7], [100, 11.5], [118, 10], [134, 18], [130, 32], [127.5, 42], [133, 50], [142, 58], [139, 66], [131, 72], [127.5, 80], [129, 90], [124, 100], [100, 108], [66, 108], [44, 106], [30, 100], [22, 90], [20, 66]] },
    // A knoll rising off that spur, higher than it and set at its own angle (the second outcrop).
    { h: 8, poly: [[125, 50], [131, 53], [136, 58.5], [132.5, 63], [125, 62]] },
    { h: 7, poly: [[156, 20], [186, 20], [220, 28], [232, 40], [226, 58], [200, 64], [170, 60], [156, 44]] },
  ],
  court: { x: 150, z: 135 },
  landing: { x: 150, z: 141 },
};

const P = (pts: number[][]): Vec2[] => pts.map(([x, z]) => ({ x, z }));

/** The castle's plan for the dev tools: the curtain, the axis points (gate, fountain, great door) and the centre of each yard. */
export const CASTLE_PLAN = {
  curtain: CURTAIN_CORNERS,
  gate: { x: GATE.x, z: GATE.z },
  fountain: { x: FOUNTAIN.x, z: FOUNTAIN.z },
  door: { x: KEEP.door.x, z: KEEP.door.z },
  keep: KEEP.rect,
  zones: {
    parterre: { x: (ZONES.parterre[0][0] + ZONES.parterre[0][2]) / 2, z: (ZONES.parterre[0][1] + ZONES.parterre[0][3]) / 2 },
    cour: { x: AXIS, z: 55 },
    terrace: { x: AXIS, z: 42 },
    kitchenGarden: { x: 43.5, z: 51 }, privyGarden: { x: mx(43.5), z: 51 },
    stableYard: { x: 43.5, z: 61 }, musterYard: { x: mx(43.5), z: 61 },
    paddock: { x: 43.5, z: 88 }, training: { x: mx(43.5), z: 88 },
    forecourt: { x: AXIS, z: 92 },
  },
};

/** Is a point inside a polygon (even-odd rule)? */
const inPoly = (x: number, z: number, poly: number[][]) => inPolygon(x, z, poly);

/** The farm's vegetable plots and the field lane, moved south with the farm. */
const FIELD_LANE = [[81, 140.2], [54.6, 140.2], [52.4, 139.7], [51.2, 138.8]];
/** The round viewing bay at the end of the spring path, on the pool's south-west bank. */
const POOL_BAY = { x: 70.6, z: 127.6 };

export function buildKeep(seed: number): ZoneLayout {
  const { w, h } = ISLAND;
  const G = new Gen(w, h, seed, Cell.Void, Ground.Grass);
  const level = (G.l.level = new Float32Array(w * h));
  const site = new Site(G);
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
  road('ore_lane', [[137, 132], [126, 132.5], [123, 132.5]], 2.5, Ground.Path, 0);
  road('smithy', [[138, 139], [124, 142.5], [114.5, 142.5], [114.5, 139]], 3.4, Ground.Stone, 0.2);
  road('farm', [[118, 142.5], [104, 151], [97, 152], [84, 148], [72, 146]], 2.4, Ground.Path, 0);
  // The spring path leaves the farm lane and climbs to the viewing bay by the pool under the
  // castle's fall; the field lane from it runs west between the vegetable plots to the hay paddock's gate.
  road('spring', [[84, 148], [80, 142], [76, 135], [72.6, 129.6]], 2.0, Ground.Path, 0);
  road('field', FIELD_LANE, 2.0, Ground.Path, 0);
  road('bank', [[163, 137], [174, 141], [182, 141], [182, 137]], 3.4, Ground.Stone, 0.2);
  road('market', [[155, 147], [158, 164], [169.5, 164], [169.5, 161]], 3.0, Ground.Stone, 0.2);
  road('alchemy', [[141, 145], [130, 160], [118, 180], [116, 186], [106.5, 186], [106.5, 182]], 2.6, Ground.Path, 0);
  road('memorial', [[150, 147], [150, 170], [151, 186], [153, 205]], 2.4, Ground.Path, 0);
  road('east', [[166, 138.1], [167, 118], [198, 100], [218, 94], [230, 84], [240, 79.5], [244, 79.5]], 2.6, Ground.Path, 0);
  road('upland', [[198, 100], [197, 84], [194, 74], [192, 56], [198, 44], [198, 36.5], [194, 36.5]], 2.4, Ground.Path, 0);

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
  G.l.pools = [pool, { x: 90, z: 176, r: 5 }];
  G.lake(90, 176, 5, Fluid.Water, 0);
  // The stream spills off the old south edge into the void.
  for (let z = 192; z < h; z++) for (let x = 74; x < 86; x++) if (G.l.fluid[G.idx(x, z)] && !inPoly(x + 0.5, z + 0.5, outline)) G.l.cells[G.idx(x, z)] = Cell.Void;

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

  // ─── Portal court: arrival dais, the portal ring, the Warden, the board ─────
  G.prop('landing', ISLAND.landing.x, ISLAND.landing.z);
  G.l.entry = { x: ISLAND.landing.x, z: ISLAND.landing.z - 1.8 };
  G.reserve(ISLAND.landing.x, ISLAND.landing.z, 4);

  // ─── Yards, forecourts and open ground ───────────────────────────────────────
  const yard = (p: Vec2, r: number, gr: Ground, wob: number) => G.clearing(p.x, p.z, r, gr, wob);
  yard(inB('smelter', 8.6, 20.4), 6.6, Ground.Stone, 0.8);
  yard(inB('smelter', 3.6, 15.8), 3.8, Ground.Stone, 0.4);
  yard(inB('bank', 10, 19), 4, Ground.Stone, 0.6);
  yard(inB('shop', 7, 13), 3.4, Ground.Stone, 0.6);
  // The green, the memorial garden, the fields and the reserved ground stay open lawn.
  const keepOpen = (poly: number[][]) => {
    const xs = poly.map((p) => p[0]), zs = poly.map((p) => p[1]);
    for (let z = Math.floor(Math.min(...zs)); z < Math.max(...zs); z++) for (let x = Math.floor(Math.min(...xs)); x < Math.max(...xs); x++) {
      if (!G.inside(x, z) || !inPoly(x + 0.5, z + 0.5, poly)) continue;
      const i = G.idx(x, z);
      if (!G.reserved[i]) G.reserved[i] = 3;
    }
  };
  G.verge(120, 158, 7);
  G.clearing(120, 158, 6, undefined, 1);
  keepOpen([[140, 178], [160, 178], [161, 196], [141, 196]]);
  keepOpen([[42, 124], [84, 124], [84, 160], [42, 160]]);
  keepOpen([[209, 108], [258, 104], [265, 130], [253, 152], [216, 155], [209, 132]]);
  keepOpen([[46, 162], [82, 162], [84, 178], [66, 182], [56, 172]]);
  const look = { x: 153, z: 208 };
  G.floor(look.x, look.z, 4.6, 2.6, 0, Ground.Stone);

  // ─── The castle: the curtain, then the terrace and the bailey's grounds ─────
  castleCurtain.curtain(site);
  castleGround.keepPlinth(site);
  castleBailey.terrace(site);
  castleBailey.grounds(site);

  // ─── Buildings ─────────────────────────────────────────────────────────────
  for (const b of KEEP_BUILDINGS) G.building(b);
  // (The keep's turrets and frontispiece stand on the terrace round it.)
  keepGround(site);
  for (const b of KEEP_BUILDINGS) G.verge(b.x + b.w / 2, b.z + b.d / 2, Math.max(b.w, b.d) / 2 + 7);
  // (A raised part of a floor, a dais, raises the ground the hero stands on there.)
  for (const b of KEEP_BUILDINGS) for (const r of b.raised ?? []) site.cells([b.x + r.rect[0], b.z + r.rect[1], b.x + r.rect[2], b.z + r.rect[3]], (i) => (level[i] += r.h));
  G.l.upper = upperCells(w, h, KEEP_BUILDINGS);
  // The great door's leaves stand open inside the keep's doorway on the axis.
  G.prop('great_doors', KEEP.door.x, KEEP.door.z - 0.95, 0).len = KEEP.door.w;

  // ─── Stations (bank, furnace and shop first: the inspect tool frames the first few) ──
  const st = (kind: StationKind, id: string, p: Vec2, rot = 0, block = 0.1) => G.station(kind, id, p.x, p.z, rot, block);
  st('bank', 'bank', inB('bank', 10, 6.5));
  st('furnace', 'furnace', inB('smelter', 8.5, 2.6));
  st('shop', 'shop', inB('shop', 7.5, 4.5));
  // The Restoration Board stands in the arrival court with the Warden.
  st('restore', 'board', { x: 143.5, z: 141.5 }, 0, 0.6);
  st('anvil', 'anvil', FORGE.anvil, 0, 1.0);
  st('restore', 'emberforge', FORGE.hearth, 0, 1.3);
  st('npc', 'warden', { x: 156.5, z: 141 }, -Math.PI * 0.6, 0.5);
  st('npc', 'quartermaster', inB('shop', 7.5, 3.3), 0, 0.4);
  blockRect(G, inB('bank', 10, 6.5).x, inB('bank', 10, 6.5).z, 3.1, 0.6, 0);
  blockRect(G, inB('shop', 7.5, 4.5).x, inB('shop', 7.5, 4.5).z, 2.6, 0.6, 0);
  for (const a of KEEP_ARCHES) {
    const rad = (a.angle * Math.PI) / 180;
    const x = court.x + Math.cos(rad) * 10.5, z = court.z + Math.sin(rad) * 10.5;
    G.station('portal', a.id, x, z, Math.atan2(court.x - x, court.z - z), 1.4);
  }
  st('restore', 'vault_expanded', inB('bank', 17.5, 12.3), -Math.PI / 2, 0.3);
  st('restore', 'alchemy_lab', inB('alchemy_plot', 3.2, 11.3), 0, 0.3);
  st('restore', 'rune_altar', inB('rune_plot', -1.6, 2.4), Math.PI / 2, 0.3);
  st('restore', 'hatchery', inB('hatch_plot', 15.6, 3.6), -Math.PI / 2, 0.3);

  // ─── Dressing ──────────────────────────────────────────────────────────────
  // Real lights only at the court, the castle's gate terrace and the two busiest doors; lamp posts
  // elsewhere.
  for (const [x, z] of [[court.x - 12.5, court.z + 0.5], [court.x + 12.5, court.z + 0.5], [70, 118.4], [82, 118.4], [inB('bank', 6, 17).x, inB('bank', 6, 17).z], [inB('shop', 4.5, 15.2).x, inB('shop', 4.5, 15.2).z]]) G.prop('lamp', x, z, 0, 1, 0.4);
  for (const p of [{ x: 126, z: 140 }, { x: 140.6, z: 129 }, { x: 160.4, z: 146 }, { x: 132, z: 154 }, { x: 147.6, z: 160 }, { x: 170, z: 128 }]) G.prop('lamp_post', p.x, p.z, 0, 1, 0.4);
  // The forge yard, as the work flows from west to east (see FORGE): under the lean-to against the
  // smelter's south wall the Emberforge (its bellows and chimney built on) and the coal bin; the bars come out of
  // the smelter door onto their pallet. Out in front of the fire: the anvil, the quench trough at the
  // smith's right hand, the grindstone, and the finished work on show where the road comes in.
  G.prop('forge_canopy', FORGE.canopy.x, FORGE.canopy.z);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) blockDisc(G.l, FORGE.canopy.x + sx * 3.3, FORGE.canopy.z + sz * 1.3, 0.3);
  const fit = (kind: string, p: Vec2, rot: number, s: number, block: number) => G.prop(kind, p.x, p.z, rot, s, block);
  fit('fit_coal_bin', inB('smelter', 5.3, 13.75), 0, 1, 0.75);
  fit('fit_bar_stack', inB('smelter', 10.4, 14.6), 0.1, 1, 0.7);
  fit('fit_trough', inB('smelter', 6.3, 20.0), Math.PI / 2, 1, 0.75);
  fit('fit_grindstone', inB('smelter', 8.9, 21.6), 0.25, 1, 0.6);
  fit('fit_arms_rack', inB('smelter', 11.8, 23.6), 0, 1.15, 1.0);
  fit('fit_armor_stand', inB('smelter', 14.6, 23.4), -0.2, 1.1, 0.5);
  // Ore comes in by cart at the smelter's east door; the bin waits beside the track.
  G.prop('rails', inB('smelter', 19.2, 6.5).x, inB('smelter', 19.2, 6.5).z, Math.PI / 2).len = 3.4;
  fit('minecart', inB('smelter', 19.6, 6.5), Math.PI / 2, 1, 0.9);
  fit('fit_ore_bin', inB('smelter', 20.0, 3.0), 0, 1, 0.8);
  fit('fit_woodpile', inB('smelter', -1.4, 6.0), Math.PI / 2, 1, 0.8);
  // The market: stalls along the lane down to the shop.
  G.prop('stall', 153.8, 158, Math.PI / 2, 1, 1.6).len = 0;
  G.prop('stall', 161, 168, Math.PI / 2 - 0.3, 1, 1.6).len = 2;
  G.prop('stall', 175, 167.5, -Math.PI / 2, 1, 1.6).len = 1;
  // Fingerposts where the smithy and bank roads leave the court.
  G.prop('signpost', 135.6, 141.2, 0, 1, 0.3);
  G.prop('signpost', 164.6, 138.2, 0, 1, 0.3);

  // ─── District and roadside dressing ──────────────────────────────────────────
  // Everything here keeps off the roads, the station approaches and the stage (any cell it would
  // block must be open, unreserved ground; `paved` allows yard and market paving). Pieces that
  // don't fit are simply skipped, so the walks stay clear however the land falls.
  /** Cells blocked by fences and hedges: another run may meet them (at a corner or a gate post). */
  const lined = new Set<number>();
  const fits = (x: number, z: number, r: number, paved: boolean, joins = false) => {
    for (let cz = Math.floor(z - r - 0.5); cz <= z + r + 0.5; cz++) for (let cx = Math.floor(x - r - 0.5); cx <= x + r + 0.5; cx++) {
      if (Math.hypot(cx + 0.5 - x, cz + 0.5 - z) > r + 0.5) continue;
      if (!G.inside(cx, cz)) return false;
      const i = G.idx(cx, cz), gr = G.l.ground[i];
      if (joins && lined.has(i)) continue;
      if (G.l.cells[i] !== Cell.Ground || G.l.fluid[i] || G.reserved[i] === 1) return false;
      if (!paved && (gr === Ground.Stone || gr === Ground.Path)) return false;
    }
    return true;
  };
  const dress = (kind: string, x: number, z: number, rot = 0, block = 0.6, opt: { paved?: boolean; len?: number; s?: number } = {}) => {
    if (!fits(x, z, block, !!opt.paved)) return null;
    const p = G.prop(kind, x, z, rot, opt.s ?? 1, block);
    if (opt.len !== undefined) p.len = opt.len;
    G.verge(x, z, block + 1.5);
    return p;
  };
  /**
   * A fence or hedge from (x0, z0) to (x1, z1): all or nothing, keeping its whole width on open
   * ground and blocking the cells along its line.
   */
  const line = (kind: 'fence' | 'hedge', x0: number, z0: number, x1: number, z1: number) => {
    const L = Math.hypot(x1 - x0, z1 - z0), at = (t: number) => ({ x: x0 + (x1 - x0) * t, z: z0 + (z1 - z0) * t });
    const cells: number[] = [];
    const n = Math.ceil(L / 0.7), r = kind === 'hedge' ? 0.5 : 0.35;
    for (let k = 0; k <= n; k++) if (!fits(at(k / n).x, at(k / n).z, r, false, true)) return;
    for (let k = 0; k <= n; k++) {
      const q = at(k / n);
      for (let cz = Math.floor(q.z - r); cz <= Math.floor(q.z + r); cz++) for (let cx = Math.floor(q.x - r); cx <= Math.floor(q.x + r); cx++) {
        if (Math.hypot(cx + 0.5 - q.x, cz + 0.5 - q.z) <= r) cells.push(G.idx(cx, cz));
      }
    }
    const p = G.prop(kind, (x0 + x1) / 2, (z0 + z1) / 2, Math.atan2(-(z1 - z0), x1 - x0));
    p.len = L;
    for (const i of cells) {
      G.l.cells[i] = Cell.Blocked;
      lined.add(i);
    }
    G.verge((x0 + x1) / 2, (z0 + z1) / 2, L / 2 + 1.5);
  };
  /** Plant one tree (a planted tree, not scenery: the green, the orchard). */
  const plant = (x: number, z: number) => {
    const i = G.idx(Math.floor(x), Math.floor(z));
    if (G.l.cells[i] === Cell.Ground && !G.l.fluid[i] && G.reserved[i] !== 1 && G.l.ground[i] !== Ground.Stone && G.l.ground[i] !== Ground.Path) G.l.cells[i] = Cell.Tree;
  };

  // The village green: an open lawn round the old well, a pair of shade trees and benches.
  dress('well', 120.6, 158.4, 0.12, 1.1);
  for (const [x, z] of [[122.5, 154.2], [125.5, 155.5]]) plant(x, z);
  dress('fit_bench', 119.4, 154.6, 0.08, 0.5);
  dress('fit_bench', 125.2, 159.4, Math.PI / 2 + 0.1, 0.5);

  // The vegetable plots in a true grid either side of the field lane, the scarecrow between them
  // (the hay paddock at the lane's end, below). Each plot
  // grows one crop, the five crops turning through the grid so no two plots side by side match.
  // (Moved 8 m south with the farm, and 2 m west, clear of the pool under the castle's fall.)
  for (const [xi, x] of FARM.plotsX.entries()) for (const [zi, z] of FARM.plotsZ.entries()) {
    const plot = dress('veg_patch', x, z, 0, 1.5);
    if (plot) plot.v = (xi + 2 * zi) % 5;
  }
  dress('scarecrow', 68.0, 141.6, 0, 0.4);

  // The bank forecourt: planters either side of the door, a bench facing the square.
  dress('planter', inB('bank', 6.2, 16).x, inB('bank', 6.2, 16).z, 0, 0.7, { paved: true });
  dress('planter', inB('bank', 13.8, 16).x, inB('bank', 13.8, 16).z, 0, 0.7, { paved: true });
  dress('fit_bench', inB('bank', 15.6, 21.2).x, inB('bank', 15.6, 21.2).z, -Math.PI / 2, 0.5);
  // The market: each stall's stock stacked at its back corner.
  dress('fit_sacks', 152.6, 155.6, 0.4, 0.5);
  dress('crates', 159.4, 170.6, 0.6, 0.9);
  dress('barrels', 176.4, 165.0, 0.2, 0.9);
  // The alchemy lab's front garden and a bench by the pond.
  for (const [x, z] of [[102.4, 186.2], [102.4, 189.4], [111.0, 186.2], [111.0, 189.4]]) dress('herb_bed', x, z, 0, 1.2);
  dress('fit_bench', 96.6, 181.4, -0.5, 0.5);
  // The memorial garden: hedges on three sides, open to the lookout path; planters and benches.
  line('hedge', 141.0, 178.6, 148.4, 178.6);
  line('hedge', 152.6, 178.6, 159.4, 178.6);
  line('hedge', 141.0, 179.4, 141.0, 195.6);
  line('hedge', 160.0, 179.4, 160.0, 195.6);
  G.prop('memorial', 150.6, 187.0, 0, 1.35, 1.9);
  for (const [x, z] of [[146.6, 184.2], [154.6, 184.2]]) dress('planter', x, z, 0, 0.7, { paved: true });
  dress('fit_bench', 154.4, 191.4, 0, 0.5);
  dress('fit_bench', 146.6, 191.4, 0, 0.5, { paved: true });
  // The lookout on the old south headland: a parapet on the edge, a bench and a lamp.
  G.prop('parapet', look.x, look.z + 2.6, 0).len = 9;
  blockRect(G, look.x, look.z + 2.6, 4.6, 0.5, 0);
  G.prop('fit_bench', look.x - 2.8, look.z + 1.0, 0, 1, 0.5);
  G.prop('lamp_post', look.x + 3.6, look.z + 1.0, 0, 1, 0.4);
  // The orchard by the east lane: fruit trees in rows, a cart and crates for the picking.
  for (let x = 206.5; x <= 230.5; x += 4) for (let z = 73.5; z <= 89.5; z += 4) if (inPoly(x, z, [[200, 68], [236, 70], [238, 92], [222, 96], [202, 90]])) plant(x, z);
  dress('cart', 214.4, 96.6, -0.3, 1.1);
  dress('crates', 218.0, 97.2, 0.3, 0.9);

  /** A piece of dressing: blocking a disc of radius `block`, or a turned rectangle [hw, hd]. */
  const place = (kind: string, x: number, z: number, rot = 0, opt: { s?: number; len?: number; v?: number; block?: number | [number, number] } = {}) => {
    const p = G.prop(kind, x, z, rot, opt.s ?? 1);
    if (opt.len !== undefined) p.len = opt.len;
    if (opt.v !== undefined) p.v = opt.v;
    const b = opt.block ?? 0.45;
    if (typeof b === 'number') {
      if (b > 0) blockDisc(G.l, x, z, b);
    } else blockRect(G, x, z, b[0], b[1], rot);
    return p;
  };
  /** The angle that faces from (x, z) toward (tx, tz). */
  const toward = (x: number, z: number, tx: number, tz: number) => Math.atan2(tx - x, tz - z);
  /**
   * A fence or hedge run from (x0, z0) to (x1, z1), set exactly as drawn: it blocks every cell its
   * centreline crosses (`v`: a hedge's height).
   */
  const rail = (kind: 'fence' | 'hedge', x0: number, z0: number, x1: number, z1: number, v?: number) => {
    const L = Math.hypot(x1 - x0, z1 - z0);
    const p = G.prop(kind, (x0 + x1) / 2, (z0 + z1) / 2, Math.atan2(-(z1 - z0), x1 - x0));
    p.len = L;
    if (v !== undefined) p.v = v;
    const n = Math.ceil(L / 0.1);
    for (let k = 0; k <= n; k++) {
      const t = 0.002 + (0.996 * k) / n, i = G.idx(Math.floor(x0 + (x1 - x0) * t), Math.floor(z0 + (z1 - z0) * t));
      G.l.cells[i] = Cell.Blocked;
      lined.add(i);
    }
  };
  // The farm at the rock's foot: the hay paddock at the end of the field lane, fenced all round with its
  // gate between stone piers where the lane arrives; the trough just inside the gate on its axis, the
  // hay lined up along the north fence.
  {
    const [fx, fz] = FARM.fence, gx = FARM.gate;
    rail('fence', fx, fz, fx + 14.4, fz);
    rail('fence', fx, fz, fx, fz + 12.4);
    rail('fence', fx + 14.4, fz, fx + 14.4, fz + 12.4);
    rail('fence', fx, fz + 12.4, gx - 1.4, fz + 12.4);
    rail('fence', gx + 1.4, fz + 12.4, fx + 14.4, fz + 12.4);
    place('gate_piers', gx, fz + 12.4, 0, { block: 0 });
    for (const sx of [-1, 1]) blockDisc(G.l, gx + sx * 1.25, fz + 12.4, 0.35);
    for (const x of [gx - 4, gx + 4]) place('haystack', x, fz + 2.4, 0, { block: 1.1 });
    place('fit_hay', gx, fz + 1.8, 0, { block: 0.7 });
    place('fit_trough', gx, fz + 10.4, 0, { block: [0.9, 0.35] });
  }
  // ─── The castle's walls and dressing, the falls ─────────────────────────────
  castleApproach.walls(site);
  castleBailey.centrepiece(site);
  castleGround.falls(site);
  // The round viewing bay at the end of the spring path, on the pool's bank: a bench on its far
  // side looking at the fall, a lamp either side of where the path comes in.
  {
    const c = POOL_BAY, fall = { x: WATER.pool.x, z: WATER.pool.z - 3 };
    G.clearing(c.x, c.z, 2.0, Ground.Stone, 0);
    G.prop('round_terrace', c.x, c.z, toward(c.x, c.z, 72.6, 129.6)).len = 2.2;
    const ux = (fall.x - c.x) / Math.hypot(fall.x - c.x, fall.z - c.z), uz = (fall.z - c.z) / Math.hypot(fall.x - c.x, fall.z - c.z);
    const bx = c.x + ux * 1.15, bz = c.z + uz * 1.15;
    G.prop('stone_bench', bx, bz, toward(bx, bz, fall.x, fall.z));
    blockRect(G, bx, bz, 0.9, 0.3, toward(bx, bz, fall.x, fall.z));
    const px = 72.6 - c.x, pz = 129.6 - c.z, pl = Math.hypot(px, pz), tx = px / pl, tz = pz / pl;
    for (const sx of [-1, 1]) G.prop('lamp_post', c.x + tx * 2.4 - tz * sx * 1.4, c.z + tz * 2.4 + tx * sx * 1.4, 0, 1, 0.4);
  }
  // Reeds along the pool's west shore and the pond's.
  for (const [x, z, a] of [[73.2, 124.4, 0.4], [73.6, 122.2, 1.6], [86.0, 172.0, 0.6], [85.6, 175.8, 2.2], [86.4, 179.6, 4.0]]) G.prop('reeds', x, z, a);
  // A few rounded stones breaking the stream's surface below the pool, foam trailing from them.
  for (const [n, t] of [[1, 0.35], [2, 0.62], [3, 0.88], [4, 1.5], [5, 2.3]] as const) {
    const k = Math.floor(t), a = stream[k], b = stream[k + 1], f = t - k;
    const x = a.x + (b.x - a.x) * f, z = a.z + (b.z - a.z) * f, nx = -(b.z - a.z), nz = b.x - a.x, l = Math.hypot(nx, nz);
    const side = (n % 2 ? 1 : -1) * 0.45;
    G.prop('stream_stone', x + (nx / l) * side, z + (nz / l) * side, Math.atan2(b.x - a.x, b.z - a.z)).len = n;
  }
  // Where the stream leaves the island over its old south edge, it falls away into the Veil.
  G.prop('edge_fall', 80.6, 191.6, Math.atan2(79 - 84, 194 - 186));
  // The hero is staged here for character creation and the pose tools; keep every camera spot
  // around it clear, or the near plane slices whatever prop sits there.
  for (const c of STAGE_CAMERAS) G.reserve(KEEP_STAGE.x + c.x, KEEP_STAGE.z + c.z, 2);
  G.reserve(KEEP_STAGE.x, KEEP_STAGE.z, 3);

  // ─── Rock: outcrops, and crags along the fresh tear faces ─────────────────────
  // Rock rises only on open, unclaimed ground (never a road, yard, building or lawn kept open), and
  // never on the castle's crown or by its stair.
  const nearCastle = (x: number, z: number) => onCrown(x, z) || (x > 108 && x < 140 && z > 108 && z < 136) || Math.hypot(x - WATER.pool.x, z - WATER.pool.z) < 9;
  const rock = (i: number, height: number) => {
    if (G.l.cells[i] !== Cell.Ground || G.l.fluid[i] || G.reserved[i] === 1 || G.reserved[i] === 3) return;
    if (nearCastle((i % w) + 0.5, Math.floor(i / w) + 0.5)) return;
    G.l.cells[i] = Cell.Cliff;
    G.l.ground[i] = Ground.Cave;
    G.l.elev[i] = Math.max(0.9, height);
  };
  for (const [x, z, r, hgt] of [[242, 150, 3.0, 2.2], [236, 186, 2.4, 1.8], [30, 116, 2.6, 2.0], [266, 120, 2.6, 2.4], [178, 182, 2.2, 1.6]]) {
    G.blob(x, z, r, 1.0, (i, _x, _z, t) => rock(i, hgt * (1.1 - t * 0.5)));
  }
  // Buttresses: at irregular intervals along the foot of every tall face (the castle rock, the
  // upland's scarps), a spur of the same rock runs out over the ground below, high where it leaves
  // the face and stepping down toward its nose, so the cliffs stand on great roots of rock and their
  // foot wanders in and out instead of running straight. None reaches a road, a kept lawn, the
  // pool, the castle's stair or the farm.
  {
    const tallFace = (i: number) => G.l.cells[i] === Cell.Cliff && G.l.elev[i] > 4.5;
    const taken = new Set<string>();
    const spurs: number[][] = [];
    for (let z = 2; z < h - 2; z++) for (let x = 2; x < w - 2; x++) {
      const i = G.idx(x, z);
      if (G.l.cells[i] !== Cell.Ground || G.l.fluid[i] || G.reserved[i]) continue;
      let ox = 0, oz = 0, hi = 0;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const j = G.idx(x + dx, z + dz);
        if (!tallFace(j)) continue;
        ox -= dx;
        oz -= dz;
        hi = Math.max(hi, level[j] + G.l.elev[j] - level[i]);
      }
      const ol = Math.hypot(ox, oz);
      if (hi < 5 || ol < 0.5) continue;
      if (nearCastle(x + 0.5, z + 0.5)) continue;
      const key = `${Math.floor((x + G.noise(z * 0.2, 3) * 6) / 11)},${Math.floor((z + G.noise(x * 0.2, 7) * 6) / 11)}`;
      if (taken.has(key)) continue;
      taken.add(key);
      if (G.rng() < 0.3) continue;
      spurs.push([x + 0.5, z + 0.5, ox / ol, oz / ol, hi]);
    }
    for (const [x, z, ox, oz, hi] of spurs) {
      const len = 2.5 + G.rng() * 4, wide = 1.4 + G.rng() * 1.4, bend = (G.rng() - 0.5) * 0.6;
      for (let t = 0; t <= len; t += 0.5) {
        const f = t / len, a = bend * f;
        const dx = ox * Math.cos(a) - oz * Math.sin(a), dz = ox * Math.sin(a) + oz * Math.cos(a);
        G.blob(x + dx * t, z + dz * t, wide * (1 - f * 0.55), 0.4, (i) => rock(i, hi * (0.85 - 0.6 * f) - 1));
      }
    }
  }
  // The tear faces are fresh rock: a broken lip of crags along the north and west edges; the old
  // weathered edges keep only the odd crag between the woods.
  const voidD = G.distance((i) => G.l.cells[i] === Cell.Void);
  const tears: number[][][] = [];
  for (let k = 0; k < outline.length; k++) {
    const [, , kind] = ISLAND.outline[k];
    if (kind === 't') tears.push([outline[k], outline[(k + 1) % outline.length]]);
  }
  const nearTear = (x: number, z: number) => tears.some(([a, b]) => distToPoly(x, z, P([a, b])).d < 7);
  for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) {
    const i = G.idx(x, z), d = voidD[i];
    if (d === 0 || d > 6) continue;
    const clump = G.noise(x * 0.09 + 50, z * 0.09 + 50);
    const tear = nearTear(x + 0.5, z + 0.5);
    if (clump < (tear ? 0.38 : 0.62)) continue;
    const band = 1 + (clump - 0.38) * 10;
    if (d < band) rock(i, Math.min(2.0, (1.3 + (clump - 0.4) * 5 - d * 0.25) * (tear ? 1 : 0.7)));
  }

  // ─── Woods ─────────────────────────────────────────────────────────────────
  // Block-canopy woods on the rim belts and toward the edges; small groves break up the lawns.
  const belts = [
    [[240, 26], [252, 38], [264, 56], [270, 80], [262, 96], [250, 70], [238, 40]],
    [[236, 166], [250, 166], [246, 190], [234, 198], [214, 196], [206, 188], [224, 178]],
    [[96, 190], [124, 192], [136, 198], [112, 200], [98, 196]],
    [[22, 124], [34, 128], [42, 132], [36, 146], [26, 144]],
  ];
  for (const [gx, gz, r] of [[176, 112, 3.4], [186, 160, 3.0], [124, 176, 2.8], [192, 186, 3.2], [270, 140, 3.0], [230, 140, 3.4],
    [140, 112, 2.6], [182, 102, 2.8], [196, 132, 3.2], [204, 166, 2.8], [168, 186, 3.0], [128, 190, 2.4], [70, 164, 3.0], [84, 168, 2.6], [212, 116, 2.6], [244, 120, 2.8], [160, 34, 2.6], [214, 44, 3.0]]) {
    G.blob(gx, gz, r, 1, (i) => {
      if (G.l.cells[i] === Cell.Ground && !G.reserved[i] && G.rng() < 0.6) G.l.cells[i] = Cell.Tree;
    });
  }
  G.scatter((x, z) => {
    if (nearCastle(x, z)) return 0;
    const d = voidD[G.idx(Math.floor(x), Math.floor(z))];
    const near = Math.max(0, 1 - (d - 3) / 9);
    const belt = belts.some((b) => inPoly(x, z, b)) ? 0.5 : 0;
    return near * 0.4 * (0.4 + G.noise(x * 0.07 + 20, z * 0.07) * 1.1) + belt + (G.noise(x * 0.08, z * 0.08) > 0.68 ? 0.07 : 0);
  }, 0);
  // The farm's hay paddock stays open grass inside its fence (no tree or bush seeded in it).
  site.cells(FARM.fence, (i) => {
    if (G.l.cells[i] === Cell.Tree) G.l.cells[i] = Cell.Ground;
  });
  // No fins or needles: a rock cell standing more than a few metres above the ground on both
  // opposite sides of it (a one-cell ridge between two lower places) is cut down to just above the
  // higher of them, so every crag has a body behind it.
  for (let pass = 0; pass < 3; pass++) for (let z = 1; z < h - 1; z++) for (let x = 1; x < w - 1; x++) {
    const i = G.idx(x, z);
    if (G.l.cells[i] !== Cell.Cliff) continue;
    const top = (j: number) => (G.l.cells[j] === Cell.Void ? -Infinity : level[j] + (G.l.cells[j] === Cell.Cliff ? G.l.elev[j] : 0));
    const t = top(i);
    let cap = Infinity;
    for (const [a, b] of [[i - 1, i + 1], [i - w, i + w]]) if (top(a) < t - 3 && top(b) < t - 3) cap = Math.min(cap, Math.max(top(a), top(b), level[i]) + 1.2);
    if (cap < t) G.l.elev[i] = Math.max(0.9, cap - level[i]);
  }
  G.connect();
  // The meadow at the foot of the castle rock (round the fields and the pool) rolls a little: a slow
  // swell of a few tenths over a dozen cells, easing out to dead level three cells short of anything
  // set on the land (the rock, the road, the water, a plot, a fence), so every one of them stands on
  // level ground and only the open grass undulates.
  {
    const open = (i: number) => G.l.cells[i] === Cell.Ground && G.l.ground[i] === Ground.Grass && !G.l.fluid[i] && G.reserved[i] !== 1;
    const set = new Uint8Array(w * h);
    for (const p of G.l.props) if (G.inside(Math.floor(p.x), Math.floor(p.z))) set[G.idx(Math.floor(p.x), Math.floor(p.z))] = 1;
    const near = G.distance((i) => !open(i) || !!set[i]);
    for (let z = 118; z < 160; z++) for (let x = 40; x < 116; x++) {
      const i = G.idx(x, z);
      if (!open(i) || onCrown(x + 0.5, z + 0.5) || level[i] >= CROWN_Y) continue;
      const ease = Math.min(1, Math.max(0, (near[i] - 1) / 3));
      const swell = (G.noise(x * 0.09 + 13, z * 0.09 + 29) - 0.5) * 0.7 + (G.noise(x * 0.23 + 5, z * 0.23 + 61) - 0.5) * 0.2;
      level[i] += swell * ease;
    }
  }
  // Trees grow on the island's crags, but not on the castle's crown.
  const canopy = (G.l.canopy = new Uint8Array(w * h).fill(4));
  for (let i = 0; i < w * h; i++) if (nearCastle((i % w) + 0.5, Math.floor(i / w) + 0.5)) canopy[i] = 0;
  // A full grass carpet on every grassy cell: clipped lawns inside the curtain and on the crown
  // round it, meadow elsewhere (the rim of rock beyond the moat included).
  const lawn = (G.l.lawn = new Uint8Array(w * h));
  for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) {
    const i = G.idx(x, z);
    lawn[i] = lawnCell(G.l.cells[i], G.l.ground[i], G.l.fluid[i], castleBailey.inCastle(x + 0.5, z + 0.5) || (level[i] >= CROWN_Y && onCrown(x + 0.5, z + 0.5) && !castleGround.onRim(x + 0.5, z + 0.5)));
  }
  // The private gardens and the paddock grow a longer garden lawn with daisies and clover; the
  // formal lawns stay clipped and striped.
  for (const box of castleBailey.GARDEN_LAWNS) site.cells(box, (i) => {
    if (lawn[i] === Lawn.Clipped) lawn[i] = Lawn.Garden;
  });
  castleBailey.parterreLawn(site, lawn);
  // (The pool's round bay too: its paving lies flush to the kerb with no grass through it.)
  G.l.lawnCut = [{ x: FOUNTAIN.x, z: FOUNTAIN.z, r: castleBailey.ARC_LAWN }, { ...POOL_BAY, r: 3.0 }];
  G.l.kerbs = castleKerbs(G, lawn);
  return G.l;
}

/**
 * Kerbs: inside the curtain every lawn meets the paving along a dressed stone kerb, and the gravel
 * and beaten earth meet the flagstones (and the gravel meets the lawns) the same way: one slab laid
 * on the harder side of every such cell edge, runs merged, so no lawn or path ends in a raw cut.
 * (Round the fountain the ring kerb does this; the straight kerbs stop on its circle.)
 */
function castleKerbs(G: Gen, lawn: Uint8Array) {
  const { w, h } = G;
  const kerbs: { x: number; z: number; rot: number; len: number }[] = [];
  const inside = (x: number, z: number) => x >= 0 && z >= 0 && x < w && z < h && castleBailey.inCastle(x + 0.5, z + 0.5);
  const hard = (x: number, z: number) => inside(x, z) && G.l.cells[G.idx(x, z)] === Cell.Ground && G.l.ground[G.idx(x, z)] === Ground.Stone;
  const soft = (x: number, z: number) => inside(x, z) && (G.l.ground[G.idx(x, z)] === Ground.Path || G.l.ground[G.idx(x, z)] === Ground.Dirt) && (G.l.cells[G.idx(x, z)] === Cell.Ground || G.l.cells[G.idx(x, z)] === Cell.Blocked);
  const green = (x: number, z: number) => inside(x, z) && lawn[G.idx(x, z)] !== Lawn.None && G.l.ground[G.idx(x, z)] === Ground.Grass;
  const edge = (ax: number, az: number, bx: number, bz: number) => (hard(ax, az) && (green(bx, bz) || soft(bx, bz))) || (soft(ax, az) && green(bx, bz));
  const R = castleBailey.ARC_LAWN;
  const clear = (x: number, z: number) => Math.hypot(x - FOUNTAIN.x, z - FOUNTAIN.z) > R - 0.6;
  // Edges between rows z - 1 and z (along X), then between columns x - 1 and x (along Z); the kerb
  // lies flush along the edge on whichever side is the harder one, a third of a cell wide (the
  // paving's first row: see kerbStones).
  for (let z = 1; z < h; z++) for (const [a, b, off] of [[z - 1, z, -KERB_SET], [z, z - 1, KERB_SET]]) {
    let s = -1;
    for (let x = 0; x <= w; x++) {
      const ok = x < w && edge(x, a, x, b) && clear(x + 0.5, z);
      if (ok && s < 0) s = x;
      if (!ok && s >= 0) {
        kerbs.push({ x: (s + x) / 2, z: z + off, rot: 0, len: x - s });
        s = -1;
      }
    }
  }
  for (let x = 1; x < w; x++) for (const [a, b, off] of [[x - 1, x, -KERB_SET], [x, x - 1, KERB_SET]]) {
    let s = -1;
    for (let z = 0; z <= h; z++) {
      const ok = z < h && edge(a, z, b, z) && clear(x, z + 0.5);
      if (ok && s < 0) s = z;
      if (!ok && s >= 0) {
        kerbs.push({ x: x + off, z: (s + z) / 2, rot: Math.PI / 2, len: z - s });
        s = -1;
      }
    }
  }
  // The straight kerbs that reach the fountain's circle stop on it, where the curved kerb takes
  // over (the lawn's edge there is the circle, not the cell's).
  for (let k = kerbs.length - 1; k >= 0; k--) {
    const kb = kerbs[k], ux = Math.cos(kb.rot), uz = -Math.sin(kb.rot), dx = kb.x - FOUNTAIN.x, dz = kb.z - FOUNTAIN.z;
    const b = dx * ux + dz * uz, c = dx * dx + dz * dz - R * R, disc = b * b - c;
    if (disc <= 0) continue;
    const t1 = -b - Math.sqrt(disc), t2 = -b + Math.sqrt(disc), lo = -kb.len / 2, hi = kb.len / 2;
    if (t2 <= lo || t1 >= hi) continue;
    kerbs.splice(k, 1);
    // (A stub left between the circle and a cell corner, under the arc's hedge, is dropped.)
    for (const [a, e] of [[lo, Math.min(hi, t1)], [Math.max(lo, t2), hi]]) if (e - a > 0.5) kerbs.push({ x: kb.x + ux * (a + e) / 2, z: kb.z + uz * (a + e) / 2, rot: kb.rot, len: e - a });
  }
  return kerbs;
}

// ─── Emberdeep Mine: a cave network (safe gathering) ────────────────────────

export function buildMine(seed: number): ZoneLayout {
  const w = 120, h = 120;
  const G = new Gen(w, h, seed, Cell.Wall, Ground.Cave);
  // Caverns are lobed (a few overlapping chambers of different sizes), strung on winding tunnels
  // with two loops (entry ↔ copper gallery ↔ tin pocket, and hall ↔ iron works ↔ grotto ↔ deep
  // workings) and a couple of dead-end pockets. Ore runs in veins along the cavern walls.
  type Lobe = [number, number, number];
  const caverns: Record<string, { x: number; z: number; r: number; lobes: Lobe[] }> = {
    entry: { x: 60, z: 104, r: 7, lobes: [[60, 104, 7], [53.5, 100, 4.5], [66.5, 107.5, 3.8]] },
    hall: { x: 57, z: 75, r: 11, lobes: [[57, 76, 10.5], [67.5, 70, 7.5], [47.5, 69, 6], [52, 85, 4.5]] },
    west: { x: 27, z: 65, r: 8, lobes: [[27, 66, 7.5], [21, 74, 5.5], [33, 58, 4.5]] },
    tin: { x: 21, z: 92, r: 6, lobes: [[20, 91, 5.5], [27, 96, 4.2], [15, 97, 3.5]] },
    east: { x: 94, z: 61, r: 8, lobes: [[94, 61, 8], [101, 69, 5.5], [88, 53, 4.5]] },
    east2: { x: 101, z: 89, r: 5.5, lobes: [[101, 88, 5.5], [95, 93, 4]] },
    deep: { x: 57, z: 29, r: 10, lobes: [[58, 30, 10], [45.5, 25, 6.5], [68, 37, 5.5], [62, 20, 5]] },
    grotto: { x: 98, z: 22, r: 6.5, lobes: [[98, 22, 6.5], [104, 28, 3.8]] },
  };
  const tunnels: Vec2[][] = [
    [{ x: 58, z: 98 }, { x: 55, z: 92 }, { x: 53, z: 86 }],
    [{ x: 43, z: 69 }, { x: 37, z: 64 }, { x: 33, z: 64 }],
    [{ x: 22, z: 78 }, { x: 17, z: 84 }, { x: 19, z: 88 }],
    [{ x: 29, z: 97 }, { x: 38, z: 101 }, { x: 49, z: 100 }],
    [{ x: 74, z: 70 }, { x: 81, z: 64 }, { x: 87, z: 61 }],
    [{ x: 102, z: 74 }, { x: 105, z: 80 }, { x: 102, z: 84 }],
    [{ x: 58, z: 65 }, { x: 61, z: 55 }, { x: 57, z: 46 }, { x: 60, z: 40 }],
    [{ x: 88, z: 50 }, { x: 94, z: 40 }, { x: 99, z: 30 }],
    [{ x: 72, z: 36 }, { x: 80, z: 30 }, { x: 88, z: 22 }, { x: 93, z: 21 }],
  ];
  const tunnelPolys = tunnels.map((t, i) => G.road(t, i === 3 || i === 8 ? 3.2 : 4.0, Ground.Cave, 0.7));
  for (const c of Object.values(caverns)) for (const [x, z, r] of c.lobes) G.clearing(x, z, r, Ground.Cave, 2.0);
  // The great hall's underground lake (in its east lobe) and the lava rift before the deep workings.
  G.lake(70, 68, 4.8, Fluid.Water, 1.4, true);
  G.river([{ x: 30, z: 52 }, { x: 48, z: 48 }, { x: 64, z: 51 }, { x: 84, z: 46 }], 3.0, Fluid.Lava, tunnelPolys);
  // A few rock pillars where the halls are widest (never in a line).
  for (const [x, z, r] of [[51, 72, 1.5], [60, 81, 1.2], [53, 31, 1.4], [26, 69, 1.0]]) {
    G.blob(x, z, r, 0.4, (i) => {
      G.l.cells[i] = Cell.Wall;
      G.l.elev[i] = 4.5;
    });
  }
  G.l.entry = { x: 60, z: 103 };
  G.station('exit', 'keep', 60, 111, Math.PI, 1.4);
  G.station('chest', 'mine_chest', 53, 102.5, Math.PI / 2, 0.7);
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
  // A vein: ore rocks strung along the cavern wall from angle `a0` (radians about the cavern's
  // centre), each set just off the rock face (never inside it, and with open floor on the camera
  // side, so the hero never mines from inside a rock).
  const vein = (c: { x: number; z: number; r: number }, ores: string[], a0: number) => {
    let a = a0, placed = 0;
    // Rocks sit about three units apart along the wall (whatever the cavern's size); where one
    // won't fit, the vein creeps on a little and tries again.
    for (let tries = 0; placed < ores.length && tries < ores.length * 8; tries++) {
      const was = placed;
      let wall = 0;
      for (let r = 1; r < c.r + 8; r += 0.25) {
        const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
        if (!G.inside(Math.floor(x), Math.floor(z)) || G.l.cells[G.idx(Math.floor(x), Math.floor(z))] === Cell.Wall) {
          wall = r;
          break;
        }
      }
      let rr = wall - 1.6;
      for (; wall && rr > Math.max(1.5, wall - 3.4); rr -= 0.4) {
        const x = c.x + Math.cos(a) * rr, z = c.z + Math.sin(a) * rr;
        if (!clear(x, z, 1.3) || !clear(x, z + 1.9, 0.8) || onRoute(x, z)) continue;
        if (G.l.nodes.some((n) => Math.hypot(n.x - x, n.z - z) < 2.8)) continue;
        G.ore(ores[placed++], x, z);
        break;
      }
      a += placed > was ? 3.0 / Math.max(2.5, rr) : 0.12;
    }
  };
  const C = caverns;
  vein(C.west, ['copper', 'copper', 'copper', 'tin'], -2.3);
  vein(C.west, ['tin', 'copper', 'copper'], 0.5);
  vein({ x: 21, z: 74, r: 5.5 }, ['copper', 'tin', 'copper'], 1.9);
  vein(C.tin, ['tin', 'tin', 'tin', 'copper'], -2.0);
  vein({ x: 27, z: 96, r: 4.2 }, ['tin', 'tin'], -0.6);
  vein(C.hall, ['copper', 'tin', 'copper'], 2.6);
  vein({ x: 47.5, z: 69, r: 6 }, ['tin', 'iron'], 2.6);
  vein(C.east, ['iron', 'iron', 'iron', 'iron'], -1.9);
  vein({ x: 101, z: 69, r: 5.5 }, ['iron', 'iron', 'iron'], 0.2);
  vein(C.east2, ['iron', 'coal', 'iron'], -1.2);
  vein(C.deep, ['coal', 'coal', 'coal', 'iron'], -1.9);
  vein({ x: 45.5, z: 25, r: 6.5 }, ['coal', 'coal', 'iron'], 2.4);
  vein({ x: 68, z: 37, r: 5.5 }, ['coal', 'coal'], -0.4);
  vein({ x: 62, z: 20, r: 5 }, ['coal', 'iron', 'coal'], -1.4);
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
  // Rails down the main galleries (following each tunnel), a cart on some, a tipped cart
  // spilling ore in the iron works and the deep workings.
  const rail = (poly: Vec2[], t: number, len: number, cart: number | null) => {
    const { p, dir } = pointAt(poly, t);
    G.prop('rails', p.x, p.z, Math.atan2(dir.x, dir.z), 1).len = len;
    used.push(p);
    if (cart === null) return;
    const q = pointAt(poly, cart).p;
    put('minecart', q.x, q.z, Math.atan2(dir.x, dir.z), 1, 0.8);
  };
  rail(tunnelPolys[0], 0.5, 11, 0.8);
  rail(tunnelPolys[1], 0.55, 8, 0.3);
  rail(tunnelPolys[6], 0.2, 8, null);
  rail(tunnelPolys[4], 0.5, 8, null);
  for (const [c, a] of [[C.east, 2.5], [C.deep, 0.7]] as [typeof C.east, number][]) {
    for (let r = 3; r < c.r; r += 0.5) {
      const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
      if (free(x, z, 1.6, 3.2)) {
        put('minecart_tipped', x, z, a + Math.PI / 2, 1, 0.9);
        break;
      }
    }
  }
  // Miners' camp by the entry: crates by the deposit chest.
  put('crates', 51, 105.5, 0.4, 1, 0.6);
  put('crates', 67.5, 104.5, -0.3, 1, 0.6);
  // Miners' lamps set against the rock: one on each cavern's far wall (the face the camera looks
  // at), a second on a side wall in the big halls, each throwing a warm pool over the wall and
  // the ore in front of it.
  const wallLamp = (c: { x: number; z: number; r: number }, a: number) => {
    for (const da of [0, 0.25, -0.25, 0.5, -0.5]) {
      const dx = Math.cos(a + da), dz = Math.sin(a + da);
      let r = 1;
      for (; r < c.r + 8; r += 0.25) {
        const xx = Math.floor(c.x + dx * r), zz = Math.floor(c.z + dz * r);
        if (!G.inside(xx, zz) || G.l.cells[G.idx(xx, zz)] !== Cell.Ground) break;
      }
      const xx = Math.floor(c.x + dx * r), zz = Math.floor(c.z + dz * r);
      if (!G.inside(xx, zz) || G.l.cells[G.idx(xx, zz)] !== Cell.Wall) continue;
      const x = c.x + dx * (r - 0.75), z = c.z + dz * (r - 0.75);
      if (!free(x, z, 0.5, 2.4) || onRoute(x, z)) continue;
      put('wall_lantern', x, z, Math.atan2(-dx, -dz), 1, 0.45);
      return;
    }
  };
  for (const [name, c] of Object.entries(caverns)) {
    wallLamp(c, -Math.PI / 2 + (name === 'hall' ? 0.5 : 0.15));
    if (c.r >= 8) wallLamp(c, name === 'east' ? -0.2 : Math.PI + 0.2);
  }
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
  for (const [c, n] of [[C.hall, 2], [C.west, 1], [C.deep, 2], [C.east, 1], [C.entry, 1]] as [typeof C.hall, number][]) {
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
  // The crystal grotto: clusters grown out of its walls, not a ring.
  for (const [x, z, s] of [[93.5, 18.5, 1.1], [102.5, 18, 0.9], [96, 16.5, 0.8], [104.5, 25, 1.0], [92.5, 25.5, 0.8], [107, 30, 0.9]]) {
    if (clear(x, z, 0.6)) G.prop('crystal_big', x, z, x * 0.7, s, 0.7);
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
  const quayWest = G.road([{ x: 40, z: 97 }, { x: 34, z: 91 }, { x: 28, z: 84 }], 3.2, S, 0.3);
  const westIslet = G.road([{ x: 31, z: 59 }, { x: 26, z: 50 }, { x: 21, z: 44 }], 3.0, S, 0.3);
  const isletGate = G.road([{ x: 22, z: 35 }, { x: 25, z: 28 }, { x: 30, z: 24 }], 3.0, S, 0.3);
  const marketEast = G.road([{ x: 78, z: 72 }, { x: 86, z: 63 }, { x: 89, z: 56 }, { x: 90, z: 46 }], 3.0, S, 0.3);
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
