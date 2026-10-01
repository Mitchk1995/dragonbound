/**
 * How long levels take: XP per hour at each level with the best Chapter 1 content for it (measured
 * by the simulators in this folder), turned into hours of efficient play to reach a level.
 *
 * Chapter 1 tops out: its best zones stop getting faster around level 35 (the last gear tier is
 * level 30), and on those rates alone 99 is well over a thousand hours away. Later chapters will add
 * higher-XP zones, ores and metals. The stated assumption for them, LATER_GROWTH, is that the best
 * content keeps XP/hour climbing by 4% per level from where Chapter 1 stops (Chapter 1 itself climbs
 * about 3% per level from level 1 to 35). laterTarget() turns that into the XP/hour a later zone
 * should offer at a given level, so future content can be checked against it.
 */
import { MAX_LEVEL, levelForXp, xpForLevel } from '../../src/progression/skills';
import { RECIPES } from '../../src/data/recipes';
import { BASES, TIERS, TIER_ORDER, pieceId } from '../../src/data/items';
import { ORES } from '../../src/data/ores';
import { XP_TUNING } from '../../src/data/tuning';
import { ZONES } from '../../src/data/zones';
import type { Style } from '../../src/types';
import { NOW, simulateClear, tour, type ClearResult } from './sim';
import { bestMining, simulateMining, simulateSmithing } from './skilling';

export const LATER_GROWTH = 1.04;
/** Levels past which Chapter 1 has nothing faster to offer. */
export const CH1_TOP = { combat: 35, mining: 35, smithing: 53 };

export const STYLES: Style[] = ['melee', 'ranged', 'magic'];

export const zoneRoute = (id: string) => {
  const L = ZONES[id].build(1000 + id.length * 97);
  const packs = tour(L.entry, L.packs);
  // The lair ends at Cinderwing's arena.
  if (L.boss) packs.push({ x: L.boss.x, z: L.boss.z, comp: [L.boss.id] });
  return { entry: L.entry, packs };
};
const ROUTES = { foothills: zoneRoute('foothills'), ruin: zoneRoute('ruin'), lair: zoneRoute('lair') };
export type ZoneId = keyof typeof ROUTES;
export const ZONE_NAMES: Record<ZoneId, string> = { foothills: 'Wyrmwood Foothills', ruin: 'Sunken Ruin', lair: "Cinderwing's Lair" };

/**
 * Where a hero of this level fights: the Foothills first, the Sunken Ruin from 15 (its Cinder Priest
 * is level 14), and the Lair once Cinderwing (level 20) is a fair fight.
 */
export const zonesFor = (level: number): ZoneId[] => (level < 15 ? ['foothills'] : level < 20 ? ['foothills', 'ruin'] : ['foothills', 'ruin', 'lair']);

const clearCache = new Map<string, ClearResult>();
export function clear(zone: ZoneId, style: Style, level: number): ClearResult {
  const key = `${zone}|${style}|${level}`;
  let r = clearCache.get(key);
  if (!r) clearCache.set(key, (r = simulateClear({ pacing: NOW, style, level, ...ROUTES[zone] })));
  return r;
}

/** Weapon-style XP per hour from the best zone for this level (the mean of the three styles). */
export function combatRate(level: number): { xpPerHour: number; zone: ZoneId } {
  const lv = Math.min(level, CH1_TOP.combat);
  let best = { xpPerHour: 0, zone: 'foothills' as ZoneId };
  for (const z of zonesFor(lv)) {
    const xp = STYLES.reduce((s, st) => s + clear(z, st, lv).xpPerHour, 0) / STYLES.length;
    if (xp > best.xpPerHour) best = { xpPerHour: xp, zone: z };
  }
  return best;
}

const miningCache = new Map<number, number>();
export function miningRate(level: number) {
  const lv = Math.min(level, CH1_TOP.mining);
  if (!miningCache.has(lv)) miningCache.set(lv, bestMining(lv).xpPerHour);
  return miningCache.get(lv)!;
}

/**
 * Smithing XP per hour at the anvil with the bars already made, smithing the best-paying piece the
 * level allows (OSRS's "buy the bars" rate; here bars only come from your own ore).
 */
export function anvilRate(level: number) {
  const lv = Math.min(level, CH1_TOP.smithing);
  return Object.values(RECIPES)
    .filter((r) => r.station === 'anvil' && r.level <= lv && r.tier && !r.id.endsWith('pickaxe'))
    .map((r) => simulateSmithing(r.id, lv))
    .sort((a, b) => b.xpPerHour - a.xpPerHour)[0];
}

/**
 * Smithing fully self-supplied, the way Chapter 1 actually works: mine the ore (at the same Mining
 * level), smelt it, smith the best-paying piece of that metal. XP per hour of all that time, for
 * Smithing and for Mining, for the metal that trains Smithing fastest at this level.
 */
export function selfSuppliedRate(level: number) {
  const lv = Math.min(level, CH1_TOP.smithing);
  const options = TIER_ORDER.filter((t) => TIERS[t].smith <= lv && RECIPES[`smelt_${t}`].level <= lv).map((tier) => {
    const smelt = RECIPES[`smelt_${tier}`];
    const anvil = Object.values(RECIPES)
      .filter((r) => r.station === 'anvil' && r.tier === tier && r.level <= lv && !r.id.endsWith('pickaxe'))
      .map((r) => simulateSmithing(r.id, lv))
      .sort((a, b) => b.xpPerHour - a.xpPerHour)[0];
    let hours = 1 / simulateSmithing(smelt.id, lv).itemsPerHour + 1 / anvil.barsPerHour;
    let miningXp = 0;
    for (const [ore, n] of Object.entries(smelt.inputs)) {
      const def = Object.values(ORES).find((o) => o.ore === ore)!;
      const m = simulateMining(def.id, Math.max(lv, def.level));
      hours += n / m.orePerHour;
      miningXp += (n * m.xpPerHour) / m.orePerHour;
    }
    const smithXpPerBar = smelt.xp * XP_TUNING.smithing + anvil.xpPerHour / anvil.barsPerHour;
    return { tier, recipe: anvil.recipe, smithingXpPerHour: smithXpPerBar / hours, miningXpPerHour: miningXp / hours };
  });
  return options.sort((a, b) => b.smithingXpPerHour - a.smithingXpPerHour)[0];
}

/** The XP/hour later content should offer at `level` (LATER_GROWTH on top of Chapter 1's best). */
export function laterTarget(rate: (lv: number) => number, top: number, level: number) {
  return level <= top ? rate(level) : rate(top) * Math.pow(LATER_GROWTH, level - top);
}

/** Hours of efficient play from level 1 (or `from`) to each level, at `rate(level)` XP/hour. */
export function hoursTable(rate: (lv: number) => number, startXp = 0): number[] {
  const out: number[] = [0];
  let h = 0;
  for (let lv = 1; lv < MAX_LEVEL; lv++) {
    const from = Math.max(xpForLevel(lv), startXp), to = xpForLevel(lv + 1);
    if (to > from) h += (to - from) / rate(lv);
    out[lv + 1] = h;
  }
  out[1] = 0;
  return out;
}

/** Armour of a full plate set (full helm, platebody, gauntlets, boots) a Defence level can wear. */
function armourFor(defence: number) {
  const tier = [...TIER_ORDER].reverse().find((t) => TIERS[t].req <= defence)!;
  const set = ['fullhelm', 'platebody', 'gauntlets', 'boots'].reduce((s, p) => s + (BASES[pieceId(tier, p)].armor ?? 0), 0);
  return set + Math.floor((defence - 1) * 0.5);
}

/**
 * The Defence level of a hero who has only fought with one style when that style reaches `level`:
 * its share of every fight's XP, plus what its armour absorbed of the damage the simulator counted.
 */
export function defenceWhenStyleAt(style: Style, level: number) {
  let xp = 0, def = 1;
  for (let lv = 1; lv < level; lv++) {
    const top = Math.min(lv, CH1_TOP.combat);
    const r = clear(combatRate(top).zone, style, top);
    const gained = xpForLevel(lv + 1) - xpForLevel(lv);
    const armour = armourFor(def);
    xp += gained * XP_TUNING.defenceShare + (gained / r.xpPerHour) * r.incomingPerHour * (armour / (armour + 50)) * XP_TUNING.defencePerAbsorbed;
    def = levelForXp(xp);
  }
  return def;
}
