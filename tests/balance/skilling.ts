/**
 * Deterministic Mining and Smithing pacing for balance work (seeded RNG, no renderer). It runs the
 * game's own rules on the 0.6 s skilling tick: the swing interval of the best pickaxe for the
 * level, the per-swing success chance (data/ores mineChance), rocks depleting after every ore and
 * respawning on their own clock, and banking when the 28-slot inventory is full (the pickaxe is
 * wielded). Rock, chest and station positions come from the real zone builders.
 *
 * The hero plays efficiently: always to the rock it can start on soonest (walking there while a
 * nearby one respawns counts), straight to the chest when full. Walking uses the hero's move speed
 * over PATH_FACTOR times the straight line, like the combat simulator.
 */
import { mulberry32 } from '../../src/core/rng';
import { BASES, TIERS, TIER_ORDER, pieceId } from '../../src/data/items';
import { mineChance, ORES } from '../../src/data/ores';
import { RECIPE_LIST, RECIPES, type Recipe } from '../../src/data/recipes';
import { COMBAT_TUNING, XP_TUNING } from '../../src/data/tuning';
import { ZONES } from '../../src/data/zones';

const TICK = 0.6;
const PATH_FACTOR = 1.25;
const INV = 28;
/** Ticks spent at a bank or chest per visit (open, deposit or withdraw, close). */
const BANK_TICKS = 3;
/**
 * Emberite grows in the Foothills, far from any chest: a full load means recalling home with the
 * Veilstone, banking and taking the portal back (seconds, not counting the walk to the first vein).
 */
const EMBERITE_TRIP_SECS = 45;

const walkTicks = (dx: number, dz: number) => Math.ceil((Math.hypot(dx, dz) * PATH_FACTOR) / COMBAT_TUNING.hero.moveSpeed / TICK);

/** The best pickaxe a miner of this level can use (bronze is sold; the rest are smithed). */
export function pickaxeFor(level: number): string {
  const tier = [...TIER_ORDER].reverse().find((t) => TIERS[t].req <= level) ?? 'bronze';
  return pieceId(tier, 'pickaxe');
}

export interface MiningResult {
  ore: string;
  level: number;
  pickaxe: string;
  orePerHour: number;
  xpPerHour: number;
}

const layouts = new Map<string, ReturnType<(typeof ZONES)['mine']['build']>>();
const layout = (id: string) => {
  if (!layouts.has(id)) layouts.set(id, ZONES[id].build(1000 + id.length * 97));
  return layouts.get(id)!;
};

function rocksFor(ore: string) {
  if (ore === 'emberite') return { rocks: layout('foothills').nodes.filter((n) => n.ore === ore), chest: null };
  const L = layout('mine');
  // Copper and tin are one pool: same XP and respawn, and bronze needs both.
  const pool = ore === 'copper' || ore === 'tin' ? ['copper', 'tin'] : [ore];
  const chest = L.stations.find((s) => s.kind === 'chest')!;
  return { rocks: L.nodes.filter((n) => pool.includes(n.ore)), chest };
}

const miningCache = new Map<string, MiningResult>();

/** Mine one ore type at a fixed level for `hours` of game time. */
export function simulateMining(ore: string, level: number, hours = 1, seed = 11): MiningResult {
  const key = `${ore}|${level}|${hours}|${seed}|${XP_TUNING.mining}`;
  if (!miningCache.has(key)) miningCache.set(key, mine(ore, level, hours, seed));
  return miningCache.get(key)!;
}

function mine(ore: string, level: number, hours: number, seed: number): MiningResult {
  const def = ORES[ore];
  const rng = mulberry32(seed);
  const pickaxe = pickaxeFor(level);
  const swing = BASES[pickaxe].swingTicks!;
  const p = mineChance(def, level);
  if (p <= 0) return { ore, level, pickaxe, orePerHour: 0, xpPerHour: 0 };
  const { rocks, chest } = rocksFor(ore);
  const ready = rocks.map(() => 0);
  const end = Math.round((hours * 3600) / TICK);
  let now = 0, carried = 0, mined = 0;
  let at = { x: rocks[0].x, z: rocks[0].z };
  while (now < end) {
    if (carried >= INV) {
      if (chest) now += walkTicks(chest.x - at.x, chest.z - at.z) + BANK_TICKS;
      else now += Math.round(EMBERITE_TRIP_SECS / TICK);
      at = chest ? { x: chest.x, z: chest.z } : { x: rocks[0].x, z: rocks[0].z };
      carried = 0;
      continue;
    }
    // The rock we can start on soonest, counting the walk to it.
    let best = 0, bestAt = Infinity;
    rocks.forEach((r, i) => {
      const start = Math.max(now + walkTicks(r.x - at.x, r.z - at.z), ready[i]);
      if (start < bestAt) {
        bestAt = start;
        best = i;
      }
    });
    now = bestAt;
    at = { x: rocks[best].x, z: rocks[best].z };
    // The first swing takes a full swing interval (Skilling.startMining), then one roll per swing.
    do now += swing;
    while (rng() >= p);
    mined++;
    carried++;
    ready[best] = now + def.respawnTicks;
  }
  const scale = end / now;
  return { ore, level, pickaxe, orePerHour: (mined * scale) / hours, xpPerHour: (mined * scale * def.xp * XP_TUNING.mining) / hours };
}

/** The ore a miner of this level gets the most XP per hour from (in Chapter 1). */
export function bestMining(level: number): MiningResult {
  const ores = Object.values(ORES).filter((o) => o.level <= level && o.id !== 'tin');
  return ores.map((o) => simulateMining(o.id, level)).sort((a, b) => b.xpPerHour - a.xpPerHour)[0];
}

export interface SmithingResult {
  recipe: string;
  level: number;
  /** At the station with the materials banked (OSRS's "buy the bars" rate). */
  xpPerHour: number;
  itemsPerHour: number;
  barsPerHour: number;
}

const station = (kind: string) => layout('keep').stations.find((s) => s.kind === kind)!;

/** Make `recipe` over and over from the bank: withdraw a load, walk to the station, make, walk back. */
export function simulateSmithing(recipeId: string, level: number): SmithingResult {
  const r = RECIPES[recipeId];
  const bank = station('bank'), at = station(r.station);
  const perItem = Object.values(r.inputs).reduce((a, b) => a + b, 0);
  const load = Math.floor(INV / perItem);
  const round = 2 * walkTicks(at.x - bank.x, at.z - bank.z) + BANK_TICKS;
  const secs = (round + load * r.ticks) * TICK;
  const items = (load * 3600) / secs;
  const bars = r.station === 'anvil' ? Object.values(r.inputs)[0] : 0;
  return { recipe: recipeId, level, xpPerHour: items * r.xp * XP_TUNING.smithing, itemsPerHour: items, barsPerHour: items * bars };
}

/** The anvil or furnace recipe a smith of this level gets the most XP per hour from (in Chapter 1). */
export function bestSmithing(level: number, station?: 'anvil' | 'furnace'): SmithingResult {
  const ok = (rc: Recipe) => rc.level <= level && (!station || rc.station === station) && rc.id !== 'forge_cinder_key' && BASES[rc.out]?.kind !== 'tool';
  return RECIPE_LIST.filter(ok).map((rc) => simulateSmithing(rc.id, level)).sort((a, b) => b.xpPerHour - a.xpPerHour)[0];
}
