/**
 * A small deterministic combat simulation for balance work (no renderer, no DOM, seeded RNG).
 *
 * It clears a zone's real packs (positions from the zone builder, compositions from data/zones)
 * with a hero of a given style and level wearing the tier-appropriate weapon, and reports kills
 * per minute, XP per hour and how mana behaves. Fights are stepped at 30 Hz on a flat plane:
 * enemies move with their real behaviours (chasers close in, kiters and casters keep their
 * distance, lungers wind up and dash), the hero follows a simple greedy policy (cast every useful
 * skill it can afford, otherwise basic-attack the nearest enemy), and hits roll through the
 * game's own `rollHit` / `mitigate` / `computeStats`.
 *
 * Besides XP it counts what the hero would face: the raw damage enemies' attacks would deal
 * (chasers and Cinderwing always connect, a lunge connects if it reaches, a kobold's stone and a
 * cultist's fire circle are partly dodged: see simEnemies.ts), which sets how much Defence
 * XP armour absorption is worth, and melee swings that whiffed on the enemy they were aimed at.
 *
 * Deliberately left out: the hero never dies or drinks (damage is counted, not applied), projectile
 * flight time, knockback, terrain. Those change absolute numbers a little, not the conclusions.
 *
 * This file walks the tour between packs; simFight.ts fights one pack, simEnemies.ts moves its enemies,
 * and simKit.ts holds the pacing, gear, options and results.
 */
import { computeStats, type PlayerStats } from '../../src/combat/stats';
import { mulberry32 } from '../../src/core/rng';
import { abilitiesFor } from '../../src/data/abilities';
import { BASES } from '../../src/data/items';
import { COMBAT_TUNING, MANA_TUNING } from '../../src/data/tuning';
import { makeItem } from '../../src/loot/itemGen';
import { fightPack } from './simFight';
import { levelsAt, weaponFor, type ClearResult, type Kit, type PackResult, type SimOptions, type Tally } from './simKit';

export { NOW, tour, weaponFor, type ClearResult, type PackResult, type Pacing, type SimOptions } from './simKit';

const SEED = 7;
/** Walking paths wind around trees and cliffs: route length vs the straight line. */
const PATH_FACTOR = 1.25;
/** The hero stops walking and the pack wakes at about this distance (enemy aggro is 9-12). */
const ENGAGE = 9;
/** Units walked per kill to pick up its drops. */
const LOOT_WALK = 1.5;
/** Seconds to portal out and back in (the keep round trip) after a full clear. */
const RESET_SECS = 20;

export function simulateClear(o: SimOptions): ClearResult {
  const P = o.pacing;
  const levels = levelsAt(o.style, o.level);
  const weapon = weaponFor(o.style, o.level);
  const equip = { weapon: makeItem(weapon) };
  const speedOverride = (st: PlayerStats) => ({ ...st, atkSpeed: Math.min(COMBAT_TUNING.maxAtkSpeed, P.weaponSpeed(weapon) * (st.atkSpeed / BASES[weapon].speed!)) });
  const plain = speedOverride(computeStats(levels, equip));
  const skills = abilitiesFor(o.style).filter((a) => a.unlock <= o.level && a.id !== 'evasive_roll');
  const kit: Kit = {
    o, P, rng: mulberry32(SEED), plain, cried: speedOverride(computeStats(levels, equip, { warCry: true })), skills,
    maxMana: plain.maxMana, regen: plain.manaRegen, cheapest: Math.min(...skills.map((a) => a.mana)),
  };
  const { maxMana, regen } = kit;
  const oocRegen = MANA_TUNING.outOfCombatFrac * maxMana;
  const tally: Tally = { mana: maxMana, casts: 0, spent: 0, wanted: 0, blocked: 0, dry: 0, incoming: 0, swings: 0, whiffs: 0 };
  const packs: PackResult[] = [];
  let at = { ...o.entry };
  let fightTotal = 0, travelTotal = 0;

  const walk = (dist: number) => {
    const secs = (dist * PATH_FACTOR) / P.heroMove;
    // Mana refills on the way: combat regen, plus the out-of-combat bonus once a few seconds pass.
    const quiet = Math.max(0, secs - MANA_TUNING.outOfCombatAfter);
    tally.mana = Math.min(maxMana, tally.mana + regen * secs + oocRegen * quiet);
    return secs;
  };

  for (const pk of o.packs) {
    const leg = Math.max(0, Math.hypot(pk.x - at.x, pk.z - at.z) - ENGAGE);
    const travelSecs = o.noTravel ? 0 : walk(leg);
    const manaAtStart = tally.mana;
    // Place the hero ENGAGE units from the pack centre, on the side they arrived from.
    const ax = at.x - pk.x, az = at.z - pk.z, ad = Math.hypot(ax, az) || 1;
    const hero = { x: pk.x + (ax / ad) * ENGAGE, z: pk.z + (az / ad) * ENGAGE };
    const { t, xp, kills } = fightPack(kit, tally, pk, hero);
    fightTotal += t;
    // Walking over to pick up the drops.
    const loot = o.noTravel ? 0 : walk(LOOT_WALK * kills);
    travelTotal += travelSecs + loot;
    packs.push({ comp: pk.comp, fightSecs: t, travelSecs: travelSecs + loot, xp, kills, manaAtStart });
    at = { x: hero.x, z: hero.z };
  }
  // Walk back out and step through the portal to reset the instance (zones don't respawn).
  if (!o.noTravel) travelTotal += walk(Math.hypot(o.entry.x - at.x, o.entry.z - at.z) + ENGAGE) + RESET_SECS;

  const totalSecs = fightTotal + travelTotal;
  const kills = packs.reduce((s, p) => s + p.kills, 0);
  const xp = packs.reduce((s, p) => s + p.xp, 0);
  return {
    style: o.style, level: o.level, pacing: P.name, weapon, packs, totalSecs, fightSecs: fightTotal, kills, xp,
    incomingPerHour: tally.incoming * (3600 / totalSecs), swings: tally.swings, whiffs: tally.whiffs,
    killsPerMin: kills / (totalSecs / 60),
    xpPerHour: xp * (3600 / totalSecs),
    castsPerMin: tally.casts / (fightTotal / 60),
    manaPerMin: tally.spent / (fightTotal / 60),
    manaBlocked: tally.wanted ? tally.blocked / tally.wanted : 0,
    dryTime: fightTotal ? tally.dry / fightTotal : 0,
    maxMana, manaRegen: regen,
  };
}
