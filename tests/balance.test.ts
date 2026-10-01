/**
 * Pacing and balance, checked with the deterministic simulators in tests/balance/:
 *  - how long levels take: OSRS-length progression (early levels quick, mid levels a steady grind,
 *    99 in a combat style in roughly 150-250 hours of efficient play once later chapters exist),
 *  - Mining and Smithing on a similar clock,
 *  - Defence (no stance any more) keeping close behind the weapon style,
 *  - melee swings landing on a kobold that backs away,
 *  - mana mattering without starving anyone.
 * Set BALANCE_REPORT=<file> to write the tables quoted in docs/BALANCE.md and the PR.
 */
import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { combatLevel, manaRegenFor, maxManaFor } from '../src/combat/stats';
import { abilitiesFor } from '../src/data/abilities';
import { ENEMIES } from '../src/data/enemies';
import { XP_TUNING } from '../src/data/tuning';
import { levelForXp, xpForLevel } from '../src/progression/skills';
import type { Style } from '../src/types';
import {
  anvilRate, CH1_TOP, clear, combatRate, defenceWhenStyleAt, hoursTable, LATER_GROWTH, laterTarget, miningRate, selfSuppliedRate, STYLES, ZONE_NAMES, zonesFor,
} from './balance/pacing';
import { NOW, simulateClear, type ClearResult } from './balance/sim';
import { bestMining } from './balance/skilling';

const combat = (lv: number) => combatRate(lv).xpPerHour;
const COMBAT_CH1 = hoursTable(combat);
const COMBAT = hoursTable((lv) => laterTarget(combat, CH1_TOP.combat, lv));
const MINING_CH1 = hoursTable(miningRate);
const MINING = hoursTable((lv) => laterTarget(miningRate, CH1_TOP.mining, lv));
const selfSmith = (lv: number) => selfSuppliedRate(lv).smithingXpPerHour;
const anvil = (lv: number) => anvilRate(lv).xpPerHour;
const SMITH_CH1 = hoursTable(selfSmith);
const SMITH = hoursTable((lv) => laterTarget(selfSmith, CH1_TOP.smithing, lv));
const ANVIL = hoursTable((lv) => laterTarget(anvil, CH1_TOP.smithing, lv));

describe('pacing: combat levels take OSRS-length time', () => {
  it('early levels come quickly: 10 in under half an hour, 20 in about an hour, 30 in a few', () => {
    expect(COMBAT[10]).toBeGreaterThan(0.15);
    expect(COMBAT[10]).toBeLessThan(0.5);
    expect(COMBAT[20]).toBeGreaterThan(0.7);
    expect(COMBAT[20]).toBeLessThan(1.6);
    expect(COMBAT[30]).toBeGreaterThan(1.8);
    expect(COMBAT[30]).toBeLessThan(3.5);
  });

  it('mid levels are a steady grind: 50 in about half a day of play, 70 in a couple of days', () => {
    expect(COMBAT[50]).toBeGreaterThan(8);
    expect(COMBAT[50]).toBeLessThan(16);
    expect(COMBAT[70]).toBeGreaterThan(30);
    expect(COMBAT[70]).toBeLessThan(60);
  });

  it('99 takes 150-250 hours, given later chapters keep XP/hour climbing as assumed', () => {
    expect(COMBAT[99]).toBeGreaterThan(150);
    expect(COMBAT[99]).toBeLessThan(250);
    // The assumption itself stays modest: Chapter 1 climbs ~3% a level, later content 4%.
    expect(LATER_GROWTH).toBeLessThanOrEqual(1.045);
  });

  it('Chapter 1 alone never gets anyone near 99: its best zones stop getting faster', () => {
    expect(COMBAT_CH1[99]).toBeGreaterThan(1000);
    expect(combat(40)).toBeCloseTo(combat(CH1_TOP.combat), 6);
    // ...and the early game is identical either way.
    expect(COMBAT_CH1[30]).toBeCloseTo(COMBAT[30], 6);
  });

  it('every weapon style trains at about the same pace', () => {
    for (const lv of [5, 12, 18, 25, 35]) {
      for (const z of zonesFor(lv)) {
        const rates = STYLES.map((s) => clear(z, s, lv).xpPerHour);
        const mean = rates.reduce((a, b) => a + b, 0) / rates.length;
        rates.forEach((r, i) => expect(r / mean, `${STYLES[i]} L${lv} ${z}`).toBeGreaterThan(0.8));
        rates.forEach((r, i) => expect(r / mean, `${STYLES[i]} L${lv} ${z}`).toBeLessThan(1.2));
      }
    }
  });

  it('XP stays per-enemy and is ordered by toughness', () => {
    for (const e of Object.values(ENEMIES)) expect(e.xp, e.id).toBeLessThan(e.hp);
    expect(ENEMIES.kobold.xp).toBeLessThan(ENEMIES.goblin.xp);
    expect(ENEMIES.goblin.xp).toBeLessThan(ENEMIES.drakeling.xp);
    expect(ENEMIES.drakeling.xp).toBeLessThan(ENEMIES.cultist.xp);
    expect(ENEMIES.cultist.xp).toBeLessThan(ENEMIES.cinder_priest.xp);
    // A first kill is a satisfying chunk of level 2 (83 XP), not all of it.
    expect(ENEMIES.goblin.xp).toBeLessThan(xpForLevel(2) / 10);
  });

  it("Cinderwing pays for the fight, but the Lair isn't a runaway XP farm", () => {
    for (const lv of [20, 30]) {
      const lair = STYLES.reduce((s, st) => s + clear('lair', st, lv).xpPerHour, 0);
      const ruin = STYLES.reduce((s, st) => s + clear('ruin', st, lv).xpPerHour, 0);
      expect(lair / ruin, `L${lv}`).toBeGreaterThan(0.9);
      expect(lair / ruin, `L${lv}`).toBeLessThan(1.35);
    }
  });
});

describe('pacing: Mining and Smithing', () => {
  it('Mining: 15 (iron) inside the first hour, 99 in OSRS-like time with later ores', () => {
    expect(MINING[15]).toBeLessThan(1);
    expect(MINING[30]).toBeLessThan(4);
    expect(MINING[99]).toBeGreaterThan(130);
    expect(MINING[99]).toBeLessThan(250);
    expect(MINING_CH1[99]).toBeGreaterThan(1000);
  });

  it('Smithing, mining every bar yourself, reaches 99 in a few hundred hours (bars at hand: far less)', () => {
    expect(SMITH[30]).toBeLessThan(4);
    expect(SMITH[99]).toBeGreaterThan(200);
    expect(SMITH[99]).toBeLessThan(450);
    expect(ANVIL[99]).toBeLessThan(SMITH[99] / 3);
  });
});

describe('Defence without a stance', () => {
  it('trails a single weapon style by a few levels, never so far that armour falls a tier behind for long', () => {
    for (const style of STYLES) {
      for (const lv of [10, 20, 30, 40]) {
        const def = defenceWhenStyleAt(style, lv);
        expect(def, `${style} ${lv}`).toBeGreaterThanOrEqual(lv - 8);
        expect(def, `${style} ${lv}`).toBeLessThan(lv);
      }
    }
  });

  it('armour absorption is a small bonus, not a way to train by soaking hits', () => {
    // A goblin pack hitting a hero in full iron, every hit absorbed, for an hour: well under a combat hour's share.
    const goblinRawPerHour = 3 * ENEMIES.goblin.atkSpeed * ((ENEMIES.goblin.dmg[0] + ENEMIES.goblin.dmg[1]) / 2) * 3600;
    const absorbedXp = goblinRawPerHour * (21 / 71) * XP_TUNING.defencePerAbsorbed;
    expect(absorbedXp).toBeLessThan(combat(10) * XP_TUNING.defenceShare);
  });

  it('combat level sits with enemy levels: a Lair-ready hero outranks Cinderwing', () => {
    const lv = 22, def = defenceWhenStyleAt('melee', lv);
    const hp = levelForXp(xpForLevel(10) + xpForLevel(lv) * XP_TUNING.hitpointsShare);
    const cl = combatLevel({ melee: lv, ranged: 1, magic: 1, defence: def, hitpoints: hp });
    expect(cl).toBeGreaterThanOrEqual(ENEMIES.cinderwing.level - 4);
    expect(cl).toBeLessThan(ENEMIES.cinderwing.level + 8);
  });
});

describe('melee swings follow their target', () => {
  // Three kobolds on open ground: nothing stops them backing away from a swordsman.
  const KOBOLDS = { entry: { x: 0, z: 0 }, packs: [{ x: 0, z: 14, comp: ['kobold', 'kobold', 'kobold'] }], noTravel: true, openGround: true };
  it('before: a kobold backing off slipped out of every swing it started inside', () => {
    const r = simulateClear({ pacing: NOW, style: 'melee', level: 3, ...KOBOLDS, noTrack: true });
    expect(r.whiffs / r.swings).toBeGreaterThan(0.5);
    expect(r.kills).toBeLessThan(3);
  });
  it('now: the wind-up steps after it and the blow lands', () => {
    for (const level of [1, 3, 12]) {
      const r = simulateClear({ pacing: NOW, style: 'melee', level, ...KOBOLDS });
      expect(r.whiffs, `L${level}`).toBe(0);
      expect(r.kills, `L${level}`).toBe(3);
      expect(r.fightSecs, `L${level}`).toBeLessThan(15);
    }
  });
  it('and in real packs no melee swing at its target whiffs', () => {
    for (const lv of [5, 20, 30]) for (const z of zonesFor(lv)) expect(clear(z, 'melee', lv).whiffs, `${z} ${lv}`).toBe(0);
  });
});

/** Mana per second needed to use every unlocked skill the moment it comes off cooldown. */
const spamCost = (style: Style, level: number) => abilitiesFor(style).filter((a) => a.unlock <= level).reduce((s, a) => s + a.mana / a.cooldown, 0);
const lv3 = (n: number) => ({ melee: n, ranged: n, magic: n });
const MANA_CASES: [number, ReturnType<typeof zonesFor>[number]][] = [[5, 'foothills'], [12, 'foothills'], [20, 'ruin'], [30, 'lair']];
const BOSS = { entry: { x: 0, z: 0 }, packs: [{ x: 0, z: 12, comp: ['cinderwing'] }], noTravel: true };

describe('balance: mana', () => {
  it('using every skill on cooldown costs more than regen covers, at every level', () => {
    for (const style of STYLES) {
      for (const level of [5, 15, 20, 40, 60]) {
        const regen = manaRegenFor(maxManaFor(lv3(level)));
        expect(spamCost(style, level), `${style} ${level}`).toBeGreaterThan(regen * 1.2);
      }
    }
  });

  it('but regen covers at least ~half of it, and a full pool lasts well past a pack fight', () => {
    for (const style of STYLES) {
      for (const level of [5, 15, 20, 40]) {
        const max = maxManaFor(lv3(level)), regen = manaRegenFor(max), spam = spamCost(style, level);
        expect(regen / spam, `${style} ${level} sustain`).toBeGreaterThan(0.45);
        expect(max / (spam - regen), `${style} ${level} seconds of all-out casting`).toBeGreaterThan(20);
      }
    }
  });

  it('a normal clear is never mana-starved', () => {
    for (const [lv, z] of MANA_CASES) {
      for (const style of STYLES) {
        const r = clear(z, style, lv);
        expect(r.manaBlocked, `${style} L${lv} casts refused`).toBeLessThan(0.1);
        expect(r.dryTime, `${style} L${lv} time dry`).toBeLessThan(0.15);
      }
    }
  });

  it('a long fight makes the heaviest caster pick their casts, without starving anyone', () => {
    const boss = STYLES.map((style) => simulateClear({ pacing: NOW, style, level: 20, ...BOSS }));
    expect(boss[2].manaBlocked, 'magic vs Cinderwing').toBeGreaterThan(0.1);
    for (const b of boss) expect(b.dryTime, `${b.style} vs Cinderwing`).toBeLessThan(0.5);
  });
});

describe('report', () => {
  it('writes the tables when asked', () => {
    const path = process.env.BALANCE_REPORT;
    if (!path) return;
    const f = (n: number, d = 0) => n.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
    const hrs = (h: number) => (h < 1 ? `${Math.round(h * 60)} min` : h < 10 ? `${f(h, 1)} h` : `${f(h)} h`);
    const MARKS = [10, 20, 30, 40, 50, 60, 70, 80, 90, 99];
    const row = (name: string, t: number[]) => `| ${name} | ${MARKS.map((m) => hrs(t[m])).join(' | ')} |`;
    const head = `| | ${MARKS.map((m) => `to ${m}`).join(' | ')} |\n|---|${MARKS.map(() => '---').join('|')}|`;
    const rateRows = [1, 5, 10, 15, 20, 25, 30, 35].map((lv) => {
      const best = combatRate(lv);
      const per = STYLES.map((s) => f(clear(best.zone, s, lv).xpPerHour)).join(' / ');
      return `| ${lv} | ${ZONE_NAMES[best.zone]} | ${f(best.xpPerHour)} | ${per} |`;
    });
    const later = [40, 50, 60, 70, 80, 90, 98].map((lv) => `| ${lv} | later chapters (assumed) | ${f(laterTarget(combat, CH1_TOP.combat, lv))} | |`);
    const mineRows = [1, 15, 30, 35].map((lv) => {
      const b = bestMining(lv);
      return `| ${lv} | ${b.ore} (${b.pickaxe.replace('_', ' ')}) | ${f(b.orePerHour)} | ${f(b.xpPerHour)} |`;
    });
    const smithRows = [1, 15, 30, 40, 53].map((lv) => {
      const a = anvilRate(lv), s = selfSuppliedRate(lv);
      return `| ${lv} | ${a.recipe.replace('smith_', '').replace('_', ' ')} | ${f(a.xpPerHour)} | ${s.tier} (${s.recipe.replace('smith_', '').replace('_', ' ')}) | ${f(s.smithingXpPerHour)} | ${f(s.miningXpPerHour)} |`;
    });
    const defRows = [10, 20, 30, 40, 50].map((lv) => `| ${lv} | ${STYLES.map((s) => defenceWhenStyleAt(s, lv)).join(' / ')} |`);
    const pack = (x: ClearResult) => `${f(x.killsPerMin, 1)} kills/min, ${f(x.xpPerHour)} XP/h, ${f(x.manaPerMin)} mana/min, ${f(x.manaBlocked * 100)}% refused`;
    const boss = STYLES.map((style) => simulateClear({ pacing: NOW, style, level: 20, ...BOSS }));
    const lines = [
      '### Hours of efficient play to reach a level (one combat style)',
      head,
      row('Chapter 1 only', COMBAT_CH1),
      row(`With later chapters (+${Math.round((LATER_GROWTH - 1) * 100)}% XP/h per level past ${CH1_TOP.combat})`, COMBAT),
      '',
      '### Weapon-style XP per hour with the best content for the level',
      '| Level | Where | XP/h (average) | Melee / Ranged / Magic |',
      '|---|---|---|---|',
      ...rateRows,
      ...later,
      '',
      '### Mining and Smithing: hours to reach a level',
      head,
      row('Mining, Chapter 1 only', MINING_CH1),
      row('Mining, with later ores', MINING),
      row('Smithing, mining every bar yourself, Chapter 1 only', SMITH_CH1),
      row('Smithing, mining every bar yourself, with later metals', SMITH),
      row('Smithing with the bars already made', ANVIL),
      '',
      '| Mining level | Best ore | Ore/h | XP/h |',
      '|---|---|---|---|',
      ...mineRows,
      '',
      '| Smithing level | Best anvil piece | XP/h at the anvil | Self-supplied metal | Smithing XP/h, self-supplied | Mining XP/h alongside |',
      '|---|---|---|---|---|---|',
      ...smithRows,
      '',
      '### Defence level when one weapon style reaches a level (Melee / Ranged / Magic)',
      '| Style level | Defence |',
      '|---|---|',
      ...defRows,
      '',
      '### Mana in normal clears and against Cinderwing',
      '| Case | Melee | Ranged | Magic |',
      '|---|---|---|---|',
      ...MANA_CASES.map(([lv, z]) => `| ${ZONE_NAMES[z]}, level ${lv} | ${STYLES.map((s) => pack(clear(z, s, lv))).join(' | ')} |`),
      `| Cinderwing at 20 | ${boss.map((b) => `${f(b.fightSecs)} s, ${f(b.manaBlocked * 100)}% refused, ${f(b.dryTime * 100)}% dry`).join(' | ')} |`,
    ];
    writeFileSync(path, lines.join('\n'));
  });
});
