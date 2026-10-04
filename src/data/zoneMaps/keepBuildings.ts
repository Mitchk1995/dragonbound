import type { BuildingSpec } from '../../world/building';
import { KEEP_SPEC } from '../../world/castle/keepSpec';
import { RANGE_SPECS } from '../../world/castle/rangeSpecs';

/** Roof colours (painted as shingles). */
const ROOF = { darkSlate: 0x3e4450, terracotta: 0x9a5438, moss: 0x4a6a48, teal: 0x3e6a6a, violet: 0x4a4a78, rust: 0x7a4a34 };

/**
 * The keep's enterable buildings: the castle's (the great keep and its ranges, src/world/castle/)
 * and the island's. Coordinates are grid cells (outer walls included); fittings are in cells from
 * each building's corner. Stations inside them are placed by layTown (keepTown.ts).
 */
export const KEEP_BUILDINGS: BuildingSpec[] = [
  KEEP_SPEC,
  ...RANGE_SPECS,
  {
    // The smelter: a timber-framed forge house on a stone base, laid out as the work flows. Ore
    // comes in by cart through the east door to the bin beside the furnace (coal heaped next to it);
    // the furnace stands against the back wall with its bellows; the melt is poured at the crucible
    // stand to the west; finished bars are racked by the south door, which opens onto the anvil yard.
    id: 'smelter', style: 'timber', interior: 'smelter', x: 132, z: 166, w: 17, d: 13, wallH: 3.9, roof: ROOF.terracotta,
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
    id: 'bank', style: 'stone', interior: 'bank', x: 198, z: 162, w: 20, d: 15, wallH: 4.6, roof: ROOF.darkSlate,
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
    id: 'vault', style: 'stone', interior: 'vault', x: 217, z: 165, w: 10, d: 11, wallH: 4.0, roof: ROOF.darkSlate, roofKind: 'flat',
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
    id: 'shop', style: 'timber', interior: 'shop', x: 188, z: 190, w: 15, d: 11, wallH: 3.7, roof: ROOF.moss,
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
    id: 'alchemy_plot', style: 'timber', interior: 'alchemy', x: 126, z: 212, w: 13, d: 10, wallH: 3.6, roof: ROOF.teal, restore: 'alchemy_lab',
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
    id: 'rune_plot', style: 'stone', interior: 'rune', x: 270, z: 114, w: 11, d: 10, wallH: 4.0, roof: ROOF.violet, restore: 'rune_altar',
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
    id: 'hatch_plot', style: 'timber', interior: 'hatchery', x: 206, z: 70, w: 14, d: 12, wallH: 4.2, roof: ROOF.rust, restore: 'hatchery',
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
export const inB = (id: string, x: number, z: number) => ({ x: BUILDING[id].x + x, z: BUILDING[id].z + z });
