export interface DropTable {
  /** Gear rolls per kill. */
  rolls: number;
  itemChance: number;
  rarity: { normal: number; magic: number; rare: number };
  goldChance: number;
  gold: [number, number];
  /** Materials, each rolled independently. */
  materials?: { id: string; chance: number; qty: [number, number] }[];
  /** Named uniques, each rolled independently at 1/chance. */
  uniques?: { id: string; chance: number }[];
  pet?: { id: string; chance: number };
}

export const DROP_TABLES: Record<string, DropTable> = {
  common: {
    rolls: 1, itemChance: 0.18, rarity: { normal: 70, magic: 25, rare: 5 },
    goldChance: 0.45, gold: [2, 9],
    materials: [{ id: 'copper_ore', chance: 0.06, qty: [1, 1] }, { id: 'tin_ore', chance: 0.06, qty: [1, 1] }, { id: 'bronze_bar', chance: 0.03, qty: [1, 1] }],
  },
  elite: {
    rolls: 1, itemChance: 0.3, rarity: { normal: 58, magic: 33, rare: 9 },
    goldChance: 0.55, gold: [5, 16],
    materials: [{ id: 'iron_ore', chance: 0.08, qty: [1, 1] }, { id: 'coal', chance: 0.08, qty: [1, 2] }, { id: 'iron_bar', chance: 0.03, qty: [1, 1] }],
  },
  priest: {
    rolls: 3, itemChance: 1, rarity: { normal: 30, magic: 50, rare: 20 },
    goldChance: 1, gold: [40, 80],
    materials: [{ id: 'emberite_ore', chance: 0.5, qty: [1, 2] }],
  },
  cinderwing: {
    rolls: 4, itemChance: 1, rarity: { normal: 25, magic: 50, rare: 25 },
    goldChance: 1, gold: [80, 160],
    materials: [{ id: 'emberite_ore', chance: 0.6, qty: [2, 5] }, { id: 'steel_bar', chance: 0.25, qty: [1, 3] }, { id: 'uncut_ruby', chance: 0.05, qty: [1, 1] }],
    uniques: [
      { id: 'cinderfang', chance: 64 },
      { id: 'emberstring', chance: 64 },
      { id: 'kindled_ash', chance: 64 },
      { id: 'ashen_crown', chance: 64 },
      { id: 'scaleguard', chance: 64 },
    ],
    pet: { id: 'ember_whelp', chance: 1000 },
  },
};
