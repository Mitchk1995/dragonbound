/**
 * Mining rocks. Success chance per swing interpolates from `low` (at level 1) to `high`
 * (at level 99), OSRS-style. Each success yields one ore and depletes the rock for
 * `respawnTicks` game ticks (0.6s each).
 */
export interface OreDef {
  id: string;
  name: string;
  ore: string;
  level: number;
  xp: number;
  low: number;
  high: number;
  respawnTicks: number;
  color: number;
}

export const ORES: Record<string, OreDef> = {
  copper: { id: 'copper', name: 'Copper rock', ore: 'copper_ore', level: 1, xp: 17.5, low: 0.5, high: 0.98, respawnTicks: 4, color: 0xc8703a },
  tin: { id: 'tin', name: 'Tin rock', ore: 'tin_ore', level: 1, xp: 17.5, low: 0.5, high: 0.98, respawnTicks: 4, color: 0xc8c8c0 },
  iron: { id: 'iron', name: 'Iron rock', ore: 'iron_ore', level: 15, xp: 35, low: 0.32, high: 0.95, respawnTicks: 9, color: 0x9a5a48 },
  coal: { id: 'coal', name: 'Coal rock', ore: 'coal', level: 30, xp: 50, low: 0.18, high: 0.8, respawnTicks: 50, color: 0x2a2626 },
  emberite: { id: 'emberite', name: 'Emberite vein', ore: 'emberite_ore', level: 32, xp: 80, low: 0.1, high: 0.6, respawnTicks: 100, color: 0xff5a1a },
};

export function mineChance(ore: OreDef, level: number): number {
  if (level < ore.level) return 0;
  const t = (Math.min(99, level) - 1) / 98;
  return ore.low + (ore.high - ore.low) * t;
}

/** Chance per ore mined to also find an uncut gem, and the gem table. */
export const GEM_CHANCE = 1 / 180;
export const GEM_TABLE = { uncut_sapphire: 60, uncut_emerald: 30, uncut_ruby: 10 };
/** Chance per ore mined of the Rock Golem pet. */
export const GOLEM_CHANCE = 1 / 4000;
