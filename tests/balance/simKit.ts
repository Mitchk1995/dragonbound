/**
 * The combat simulation's shared pieces (see sim.ts): the pacing it runs at, the hero's gear and levels, the
 * options and results, and the state one clear carries from fight to fight.
 */
import { castTime, swingTiming, type CastSkill, type PlayerStats } from '../../src/combat/stats';
import type { Rng } from '../../src/core/rng';
import type { AbilityDef } from '../../src/data/abilities';
import type { EnemyDef } from '../../src/data/enemies';
import { BASES } from '../../src/data/items';
import { COMBAT_TUNING } from '../../src/data/tuning';
import type { SkillId, Style } from '../../src/types';

export const HERO_R = 0.45;
export const DT = 1 / 30;

export interface Pacing {
  name: string;
  heroMove: number;
  weaponSpeed: (baseId: string) => number;
  swing: (atkSpeed: number) => { dur: number; hitAt: number; interval: number };
  /** Skill animation length (s) and when it lands (s). */
  cast: (id: CastSkill) => { dur: number; hitAt: number };
  leapDur: number;
  enemySpeed: (e: EnemyDef) => number;
  lunge: { windup: number; dash: number; speed: number; recover: number };
}

export const NOW: Pacing = {
  name: 'now',
  heroMove: COMBAT_TUNING.hero.moveSpeed,
  weaponSpeed: (id) => BASES[id].speed!,
  swing: (s) => {
    const t = swingTiming(s);
    return { dur: t.dur, hitAt: t.impactAt, interval: t.interval };
  },
  cast: (id) => {
    const dur = castTime(id, 1);
    return { dur, hitAt: dur * COMBAT_TUNING.impact };
  },
  leapDur: COMBAT_TUNING.leapDur,
  enemySpeed: (e) => e.speed,
  lunge: { windup: COMBAT_TUNING.enemy.lungeWindup, dash: COMBAT_TUNING.enemy.lungeDash, speed: COMBAT_TUNING.enemy.lungeSpeed, recover: COMBAT_TUNING.enemy.lungeRecover },
};

/** The weapon a hero of this style and level would carry (the best one they can wield). */
export function weaponFor(style: Style, level: number): string {
  if (style === 'melee') {
    const tier = level >= 30 ? 'ember' : level >= 20 ? 'steel' : level >= 10 ? 'iron' : 'bronze';
    return `${tier}_${level >= 10 ? 'longsword' : 'sword'}`;
  }
  if (style === 'ranged') return level >= 30 ? 'drakebone_bow' : level >= 20 ? 'recurve_bow' : level >= 10 ? 'hunter_bow' : 'worn_bow';
  return level >= 30 ? 'ember_staff' : level >= 20 ? 'runed_staff' : level >= 10 ? 'oak_staff' : 'apprentice_staff';
}

export const levelsAt = (style: Style, level: number): Record<SkillId, number> => ({
  melee: style === 'melee' ? level : 1, ranged: style === 'ranged' ? level : 1, magic: style === 'magic' ? level : 1,
  defence: level, hitpoints: Math.max(10, level), mining: 1, smithing: 1,
});

/** Order packs as a player would clear them: nearest unvisited first, starting at the entry. */
export function tour<T extends { x: number; z: number }>(entry: { x: number; z: number }, packs: T[]): T[] {
  const left = [...packs];
  const out: T[] = [];
  let at: { x: number; z: number } = entry;
  while (left.length) {
    let bi = 0;
    for (let i = 1; i < left.length; i++) if (Math.hypot(left[i].x - at.x, left[i].z - at.z) < Math.hypot(left[bi].x - at.x, left[bi].z - at.z)) bi = i;
    const next = left.splice(bi, 1)[0];
    out.push(next);
    at = next;
  }
  return out;
}

export interface SimOptions {
  pacing: Pacing;
  style: Style;
  level: number;
  /** Pack positions and compositions, in visiting order; `x`,`z` in zone units. */
  packs: { x: number; z: number; comp: string[] }[];
  /** Where the hero enters (and returns to, to reset the instance). */
  entry: { x: number; z: number };
  /** Skip the walk between packs (back-to-back fights: the sustained-spam case). */
  noTravel?: boolean;
  /** No clearing edge: a retreating enemy can back off as far as it likes (open ground). */
  openGround?: boolean;
  /** Leave out the wind-up step after a retreating target (how melee swings worked before). */
  noTrack?: boolean;
}

export interface PackResult {
  comp: string[];
  fightSecs: number;
  travelSecs: number;
  xp: number;
  kills: number;
  manaAtStart: number;
}

export interface ClearResult {
  style: Style;
  level: number;
  pacing: string;
  weapon: string;
  packs: PackResult[];
  /** Raw damage enemies' attacks would deal per hour (before armour). */
  incomingPerHour: number;
  /** Melee basic attacks, and how many missed the enemy they were aimed at. */
  swings: number;
  whiffs: number;
  totalSecs: number;
  fightSecs: number;
  kills: number;
  xp: number;
  killsPerMin: number;
  xpPerHour: number;
  /** Skill casts per minute of fighting. */
  castsPerMin: number;
  /** Mana spent per minute of fighting. */
  manaPerMin: number;
  /** Share of wanted skill casts that were refused for lack of mana. */
  manaBlocked: number;
  /** Share of fighting time spent with less mana than the cheapest damaging skill costs. */
  dryTime: number;
  maxMana: number;
  manaRegen: number;
}

/** The hero as one clear fixes them: options, pacing, seeded dice, stats with and without War Cry, skills and mana. */
export interface Kit {
  o: SimOptions;
  P: Pacing;
  rng: Rng;
  plain: PlayerStats;
  cried: PlayerStats;
  /** The style's skills unlocked at this level (the roll left out). */
  skills: AbilityDef[];
  maxMana: number;
  regen: number;
  /** The cheapest of `skills`. */
  cheapest: number;
}

/** What one clear carries across its fights: the mana pool, and the running counts its result reports. */
export interface Tally {
  mana: number;
  casts: number;
  spent: number;
  wanted: number;
  blocked: number;
  dry: number;
  incoming: number;
  swings: number;
  whiffs: number;
}

export interface Foe {
  def: EnemyDef;
  x: number;
  z: number;
  hp: number;
  dead: boolean;
  stagger: number;
  slowT: number;
  atkCd: number;
  lunge: { t: number; dx: number; dz: number; hit?: boolean } | null;
  recover: number;
  /** Cinderwing: seconds left in the air (untouchable), phase 2 reached, time to the next flight. */
  away: number;
  phase2: boolean;
  flightCd: number;
}
