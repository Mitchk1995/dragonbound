/**
 * Balance follow-up to the Diablo 2 pacing pass: a deterministic simulation (tests/balance/sim.ts)
 * clears the real zones with each weapon style at a few levels and checks that
 *  - XP per hour is back near what it was before the pacing pass (enemy XP was raised to match),
 *  - mana matters: using every skill on cooldown can't be sustained, but a normal clear never
 *    runs dry and a full pool outlasts any regular pack fight.
 * Set BALANCE_REPORT=<file> to write the full table (the numbers quoted in the PR).
 */
import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { abilitiesFor } from '../src/data/abilities';
import { ENEMIES } from '../src/data/enemies';
import { ZONES } from '../src/data/zones';
import { manaRegenFor, maxManaFor } from '../src/combat/stats';
import type { Style } from '../src/types';
import { NOW, PRE_D2, simulateClear, tour, type ClearResult } from './balance/sim';

/** Enemy XP before this retune (set for the pre-D2 combat speed in #3). */
const OLD_XP: Record<string, number> = { goblin: 12, kobold: 10, drakeling: 24, cultist: 28, cinder_priest: 320, cinderwing: 1400 };

const STYLES: Style[] = ['melee', 'ranged', 'magic'];
const zone = (id: string) => {
  const L = ZONES[id].build(1000 + id.length * 97);
  return { entry: L.entry, packs: tour(L.entry, L.packs) };
};
const FOOTHILLS = zone('foothills');
const RUIN = zone('ruin');
/** Typical content per level: a fresh hero in the Foothills, a mid one, and the Sunken Ruin before the lair. */
const CASES = [
  { level: 5, where: 'Foothills', z: FOOTHILLS },
  { level: 12, where: 'Foothills', z: FOOTHILLS },
  { level: 20, where: 'Sunken Ruin', z: RUIN },
];
const BOSS = { entry: { x: 0, z: 0 }, packs: [{ x: 0, z: 12, comp: ['cinderwing'] }], noTravel: true };

const runs = CASES.flatMap((c) =>
  STYLES.map((style) => ({
    ...c,
    style,
    before: simulateClear({ pacing: PRE_D2, style, level: c.level, ...c.z, xp: OLD_XP }),
    slowOldXp: simulateClear({ pacing: NOW, style, level: c.level, ...c.z, xp: OLD_XP }),
    now: simulateClear({ pacing: NOW, style, level: c.level, ...c.z }),
  })),
);

/** Mana per second needed to use every unlocked skill the moment it comes off cooldown. */
const spamCost = (style: Style, level: number) => abilitiesFor(style).filter((a) => a.unlock <= level).reduce((s, a) => s + a.mana / a.cooldown, 0);
const lv = (n: number) => ({ melee: n, ranged: n, magic: n });

describe('balance: XP per hour after the Diablo 2 pacing', () => {
  it('the slower pacing cleared zones more slowly (why enemy XP went up)', () => {
    for (const r of runs) expect(r.slowOldXp.xpPerHour, `${r.style} ${r.level}`).toBeLessThan(r.before.xpPerHour * 0.95);
  });

  it('XP per hour is back near the pre-pacing target for every style and level', () => {
    const ratios = runs.map((r) => r.now.xpPerHour / r.before.xpPerHour);
    runs.forEach((r, i) => {
      expect(ratios[i], `${r.style} L${r.level}`).toBeGreaterThan(0.9);
      expect(ratios[i], `${r.style} L${r.level}`).toBeLessThan(1.12);
    });
    const mean = ratios.reduce((a, b) => a + b, 0) / ratios.length;
    expect(mean).toBeGreaterThan(0.96);
    expect(mean).toBeLessThan(1.06);
  });

  it('XP stays per-enemy and modest (no return to per-damage XP)', () => {
    for (const e of Object.values(ENEMIES)) expect(e.xp, e.id).toBeLessThan(e.hp * 2);
    // A tougher enemy is always worth more.
    expect(ENEMIES.kobold.xp).toBeLessThan(ENEMIES.goblin.xp);
    expect(ENEMIES.goblin.xp).toBeLessThan(ENEMIES.drakeling.xp);
    expect(ENEMIES.drakeling.xp).toBeLessThan(ENEMIES.cultist.xp);
  });
});

describe('balance: mana', () => {
  it('using every skill on cooldown costs more than regen covers, at every level', () => {
    for (const style of STYLES) {
      for (const level of [5, 15, 20, 40, 60]) {
        const regen = manaRegenFor(maxManaFor(lv(level)));
        expect(spamCost(style, level), `${style} ${level}`).toBeGreaterThan(regen * 1.2);
      }
    }
  });

  it('but regen covers at least ~half of it, and a full pool lasts well past a pack fight', () => {
    for (const style of STYLES) {
      for (const level of [5, 15, 20, 40]) {
        const max = maxManaFor(lv(level)), regen = manaRegenFor(max), spam = spamCost(style, level);
        expect(regen / spam, `${style} ${level} sustain`).toBeGreaterThan(0.45);
        expect(max / (spam - regen), `${style} ${level} seconds of all-out casting`).toBeGreaterThan(20);
      }
    }
  });

  it('a normal clear is never mana-starved', () => {
    for (const r of runs) {
      expect(r.now.manaBlocked, `${r.style} L${r.level} casts refused`).toBeLessThan(0.1);
      expect(r.now.dryTime, `${r.style} L${r.level} time dry`).toBeLessThan(0.15);
    }
  });

  it('a long fight makes the heaviest caster pick their casts, without starving anyone', () => {
    const boss = STYLES.map((style) => simulateClear({ pacing: NOW, style, level: 20, ...BOSS }));
    expect(boss[2].manaBlocked, 'magic vs Cinderwing').toBeGreaterThan(0.1);
    for (const b of boss) expect(b.dryTime, `${b.style} vs Cinderwing`).toBeLessThan(0.5);
  });

  it('writes the report when asked', () => {
    const path = process.env.BALANCE_REPORT;
    if (!path) return;
    const f = (n: number, d = 0) => n.toFixed(d);
    const row = (r: (typeof runs)[number]) => {
      const pack = (x: ClearResult) => `${f(x.killsPerMin, 1)} kills/min, ${f(x.xpPerHour)} XP/h`;
      return `| ${r.style} ${r.level} (${r.now.weapon}, ${r.where}) | ${pack(r.before)} | ${pack(r.slowOldXp)} | ${pack(r.now)} | ${f((r.now.xpPerHour / r.before.xpPerHour) * 100)}% | ${f(r.now.maxMana)} / ${f(r.now.manaRegen, 1)} | ${f(r.now.manaPerMin)} | ${f(r.now.manaBlocked * 100)}% |`;
    };
    const boss = STYLES.map((style) => simulateClear({ pacing: NOW, style, level: 20, ...BOSS }));
    const lines = [
      '| Style, level | Before pacing (old XP) | Now, old XP | Now, new XP | New vs before | Mana pool / regen | Mana spent per fight-minute | Casts refused |',
      '|---|---|---|---|---|---|---|---|',
      ...runs.map(row),
      '',
      '| Style | Spam cost L5 / L20 / L40 (mana/s) | Regen L5 / L20 / L40 | Seconds of all-out casting L5 / L20 / L40 |',
      '|---|---|---|---|',
      ...STYLES.map((s) => {
        const at = [5, 20, 40].map((l) => ({ spam: spamCost(s, l), max: maxManaFor(lv(l)), regen: manaRegenFor(maxManaFor(lv(l))) }));
        return `| ${s} | ${at.map((a) => f(a.spam, 1)).join(' / ')} | ${at.map((a) => f(a.regen, 1)).join(' / ')} | ${at.map((a) => f(a.max / (a.spam - a.regen))).join(' / ')} |`;
      }),
      '',
      '| Cinderwing at 20 | Fight (s) | Casts/min | Casts refused | Time dry |',
      '|---|---|---|---|---|',
      ...boss.map((b) => `| ${b.style} | ${f(b.fightSecs)} | ${f(b.castsPerMin)} | ${f(b.manaBlocked * 100)}% | ${f(b.dryTime * 100)}% |`),
    ];
    writeFileSync(path, lines.join('\n'));
  });
});
