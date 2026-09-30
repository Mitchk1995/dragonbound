import { BASES, PIECES, TIERS, TIER_ORDER, pieceId, type TierId } from './items';

export interface Recipe {
  id: string;
  /** Output base id. */
  out: string;
  station: 'furnace' | 'anvil';
  level: number;
  xp: number;
  inputs: Record<string, number>;
  /** Game ticks (0.6s) per item. */
  ticks: number;
  /** Keep restoration needed to use it, if any. */
  needs?: string;
  tier?: TierId;
}

const list: Recipe[] = [
  { id: 'smelt_bronze', out: 'bronze_bar', station: 'furnace', level: 1, xp: 6.2, inputs: { copper_ore: 1, tin_ore: 1 }, ticks: 3, tier: 'bronze' },
  { id: 'smelt_iron', out: 'iron_bar', station: 'furnace', level: 15, xp: 12.5, inputs: { iron_ore: 1 }, ticks: 3, tier: 'iron' },
  { id: 'smelt_steel', out: 'steel_bar', station: 'furnace', level: 30, xp: 17.5, inputs: { iron_ore: 1, coal: 2 }, ticks: 3, tier: 'steel', needs: 'anvil_reforged' },
  { id: 'smelt_ember', out: 'ember_bar', station: 'furnace', level: 40, xp: 30, inputs: { emberite_ore: 1, coal: 3 }, ticks: 4, tier: 'ember', needs: 'emberforge' },
];

const TIER_NEEDS: Partial<Record<TierId, string>> = { steel: 'anvil_reforged', ember: 'emberforge' };

for (const tierId of TIER_ORDER) {
  const tier = TIERS[tierId];
  for (const p of PIECES) {
    list.push({
      id: `smith_${pieceId(tierId, p.key)}`,
      out: pieceId(tierId, p.key),
      station: 'anvil',
      level: tier.smith + p.offset,
      xp: tier.xpPerBar * p.bars,
      inputs: { [tier.bar]: p.bars },
      ticks: 4,
      tier: tierId,
      needs: TIER_NEEDS[tierId],
    });
  }
}

// Quest: The Cinder Seal
list.push({ id: 'forge_cinder_key', out: 'cinder_key', station: 'anvil', level: 25, xp: 400, inputs: { seal_fragment: 3, iron_bar: 2, emberite_ore: 1 }, ticks: 5 });

export const RECIPES: Record<string, Recipe> = Object.fromEntries(list.map((r) => [r.id, r]));
export const RECIPE_LIST = list;
export const recipesFor = (station: 'furnace' | 'anvil') => list.filter((r) => r.station === station);

/** Masterwork chance: grows with levels above the recipe requirement, capped at 6%. */
export function masterworkChance(level: number, recipe: Recipe): number {
  if (BASES[recipe.out]?.kind !== 'gear') return 0;
  return Math.min(0.06, Math.max(0, (level - recipe.level) * 0.002));
}
