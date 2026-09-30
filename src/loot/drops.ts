import { DROP_TABLES } from '../data/dropTables';
import { randInt, weighted, type Rng } from '../core/rng';
import type { Item } from '../types';
import { generateItem, generateUnique, makeItem } from './itemGen';

export interface DropResult {
  items: Item[];
  gold: number;
  pet?: string;
}

/**
 * Roll a kill's loot. Every roll is independent true RNG, OSRS-style: no pity timers,
 * so a 1/64 unique can take 300 kills or come on the first.
 * `mult` scales all drop chances (debug/testing only).
 */
export function rollDrops(rng: Rng, tableId: string, ilvl: number, mult = 1): DropResult {
  const table = DROP_TABLES[tableId];
  const result: DropResult = { items: [], gold: 0 };
  if (!table) return result;

  for (let i = 0; i < table.rolls; i++) {
    if (rng() < Math.min(1, table.itemChance * mult)) {
      result.items.push(generateItem(rng, ilvl, weighted(rng, table.rarity)));
    }
  }
  for (const m of table.materials ?? []) {
    if (rng() < Math.min(1, m.chance * mult)) {
      const n = randInt(rng, m.qty[0], m.qty[1]);
      for (let i = 0; i < n; i++) result.items.push(makeItem(m.id));
    }
  }
  if (rng() < Math.min(1, table.goldChance * mult)) {
    result.gold = randInt(rng, table.gold[0], table.gold[1]) + Math.floor(ilvl * 0.5);
  }
  for (const u of table.uniques ?? []) {
    if (rng() < Math.min(1, mult / u.chance)) result.items.push(generateUnique(rng, u.id, ilvl));
  }
  if (table.pet && rng() < Math.min(1, mult / table.pet.chance)) result.pet = table.pet.id;
  return result;
}
