/**
 * Diablo 2 pacing: the tuning math (swing length, impact frame, gear stacking, caps), who a
 * held mouse button attacks, a click's single committed swing, and that enemies and boss
 * telegraphs stay fair against the slower hero.
 */
import { describe, expect, it } from 'vitest';
import { holdTarget, pressTarget, type Foe } from '../src/combat/holdInput';
import { STYLE_RANGE, castTime, computeStats, swingTiming } from '../src/combat/stats';
import { ENEMIES } from '../src/data/enemies';
import { BASES } from '../src/data/items';
import { COMBAT_TUNING } from '../src/data/tuning';
import type { Enemy } from '../src/entities/enemy';
import { Player } from '../src/entities/player';
import type { Game } from '../src/game';
import { makeItem } from '../src/loot/itemGen';
import { NavGrid } from '../src/world/navgrid';
import type { Item } from '../src/types';

const T = COMBAT_TUNING;
const LV = { melee: 1, ranged: 1, magic: 1, defence: 1, hitpoints: 10, mining: 1, smithing: 1 };
const withAffixes = (id: string, affixes: Item['affixes']) => ({ ...makeItem(id), affixes });

describe('combat pacing: tuning math', () => {
  it('base weapons attack about once a second; a fresh hero punches at 1/s', () => {
    expect(computeStats(LV, {}).atkSpeed).toBe(1);
    expect(computeStats(LV, { weapon: makeItem('steel_sword') }).atkSpeed).toBe(1.25);
    for (const b of Object.values(BASES)) if (b.speed) expect(b.speed, b.id).toBeLessThanOrEqual(1.25);
  });

  it('a sword swing winds up, lands at 55% and has no 0.5 s cap', () => {
    const t = swingTiming(1.25);
    expect(t.dur).toBeCloseTo(0.736, 3);
    expect(t.impactAt).toBeCloseTo(0.405, 3);
    expect(t.interval).toBeCloseTo(0.8, 5);
    expect(swingTiming(1).dur).toBeGreaterThan(0.9);
    expect(t.dur).toBeLessThan(t.interval);
  });

  it('attack speed from affixes, uniques and War Cry stacks, up to the cap', () => {
    const base = computeStats(LV, { weapon: makeItem('steel_longsword') }).atkSpeed;
    const geared = computeStats(LV, {
      weapon: withAffixes('steel_longsword', [{ id: 'atkSpd', value: 15 }]),
      gloves: withAffixes('steel_gauntlets', [{ id: 'atkSpd', value: 9 }]),
      ring: withAffixes('copper_ring', [{ id: 'atkSpd', value: 9 }]),
    }, { warCry: true }).atkSpeed;
    expect(geared).toBeCloseTo(base * (1 + (15 + 9 + 9 + T.warCryAtkSpd) / 100), 5);
    expect(swingTiming(geared).dur).toBeLessThan(swingTiming(base).dur * 0.7);
    const silly = computeStats(LV, { weapon: withAffixes('steel_sword', [{ id: 'atkSpd', value: 500 }]) });
    expect(silly.atkSpeed).toBe(T.maxAtkSpeed);
  });

  it('skills take their tuned cast time, and cast-speed gear shortens it', () => {
    const plain = computeStats(LV, { weapon: makeItem('apprentice_staff') });
    expect(plain.castSpeed).toBe(1);
    expect(castTime('fireball', plain.castSpeed)).toBe(T.skillCast.fireball);
    const fast = computeStats(LV, { weapon: withAffixes('runed_staff', [{ id: 'castSpd', value: 20 }]), amulet: withAffixes('jade_amulet', [{ id: 'castSpd', value: 10 }]) });
    expect(fast.castSpeed).toBeCloseTo(1.3, 5);
    expect(castTime('fireball', fast.castSpeed)).toBeCloseTo(T.skillCast.fireball / 1.3, 5);
    expect(computeStats(LV, { weapon: withAffixes('runed_staff', [{ id: 'castSpd', value: 400 }]) }).castSpeed).toBe(T.maxCastSpeed);
  });

  it('every skill lands no sooner than about 0.3 s after the key press', () => {
    for (const [id, secs] of Object.entries(T.skillCast)) expect(secs * T.impact, id).toBeGreaterThanOrEqual(0.3);
  });
});

describe('combat pacing: fairness', () => {
  it('regular enemies are clearly slower than the hero, so kiting and catching kiters both work', () => {
    for (const e of Object.values(ENEMIES)) {
      if (e.behavior === 'boss') continue;
      expect(e.speed * 1.4, e.id).toBeLessThanOrEqual(T.hero.moveSpeed);
    }
  });

  it("Cinderwing's warnings outlast the slowest base melee swing plus a step out of the area", () => {
    const slowest = swingTiming(Math.min(T.weaponSpeed.fists, T.weaponSpeed.sword, T.weaponSpeed.longsword)).dur;
    const walk = (dist: number) => dist / T.hero.moveSpeed;
    const boss = ENEMIES.cinderwing, hero = 0.45;
    // A melee hero stands at attack reach from the boss's centre.
    const reach = STYLE_RANGE.melee + boss.radius;
    expect(T.boss.tail, 'tail sweep (circle of boss radius + 3.2)').toBeGreaterThanOrEqual(slowest + walk(boss.radius + 3.2 + hero - reach));
    expect(T.boss.meteor, 'meteor (circle of 1.7 on the hero)').toBeGreaterThanOrEqual(slowest + walk(1.7 + hero));
    for (const k of ['breathWindup', 'gust', 'land'] as const) expect(T.boss[k], k).toBeGreaterThanOrEqual(slowest + 0.3);
  });
});

const foe = (x: number, z: number, o: Partial<Foe> = {}): Foe => ({ x, z, radius: 0.45, dead: false, untargetable: false, ...o });

describe('hold to attack: who gets hit', () => {
  const hero = { x: 0, z: 0 }, melee = STYLE_RANGE.melee;

  it('a press just beside an enemy still attacks it; a press on open ground does not', () => {
    const e = foe(5, 5);
    expect(pressTarget([e], { x: 5.6, z: 5.5 })).toBe(e);
    expect(pressTarget([e], { x: 7, z: 5 })).toBeNull();
    expect(pressTarget([foe(5, 5, { dead: true })], { x: 5, z: 5 })).toBeNull();
  });

  it('keeps the current target until it dies, wherever the cursor goes', () => {
    const cur = foe(2, 0), other = foe(0, 2);
    expect(holdTarget([cur, other], cur, other, { x: 0, z: 2 }, hero, melee)).toBe(cur);
  });

  it('after a kill, takes the enemy under or near the cursor', () => {
    const dead = foe(2, 0, { dead: true }), a = foe(0, 2.5), b = foe(-2.5, 0);
    expect(holdTarget([dead, a, b], dead, a, { x: 0, z: 2.5 }, hero, melee)).toBe(a);
    expect(holdTarget([dead, a, b], dead, null, { x: -2, z: 0.6 }, hero, melee)).toBe(b);
  });

  it('falls back to an enemy already in reach, and otherwise stands still', () => {
    const adjacent = foe(1.5, 0);
    expect(holdTarget([adjacent], null, null, { x: -6, z: -6 }, hero, melee)).toBe(adjacent);
    expect(holdTarget([], null, null, { x: 3, z: 3 }, hero, melee)).toBeNull();
  });

  it('never drags a melee hero into the next pack', () => {
    const farPack = [foe(9, 0), foe(9.5, 0.8)];
    expect(holdTarget(farPack, null, farPack[0], { x: 9, z: 0 }, hero, melee)).toBeNull();
    // The same pack is fair game for a bow (it's within shooting range, no walking needed).
    expect(holdTarget(farPack, null, farPack[0], { x: 9, z: 0 }, hero, STYLE_RANGE.ranged)).toBe(farPack[0]);
  });
});

describe('click vs hold: committed swings', () => {
  function fixture() {
    const p = new Player();
    const nav = new NavGrid(40, 40, new Uint8Array(40 * 40));
    const stats = computeStats(LV, { weapon: makeItem('steel_sword') });
    const g = {
      stats, zone: { nav }, skilling: { busy: false, stop() {} }, prog: { recomputeStats() {} },
      combat: {
        // Enough of Combat.startBasicAttack to drive the command loop: a committed swing and its cooldown.
        startBasicAttack() {
          const t = swingTiming(stats.atkSpeed);
          p.swings++;
          p.attackCd = t.interval;
          p.action = { t: 0, dur: t.dur, hitAt: T.impact, done: false, kind: 'swing', onHit() {} };
        },
      },
    } as unknown as Game;
    p.bind(g);
    p.pos.set(10, 0, 10);
    const target = { x: 11.5, z: 10, radius: 0.45, dead: false, untargetable: false } as unknown as Enemy;
    const run = (secs: number) => {
      for (let i = 0; i < Math.round(secs * 60); i++) p.update(1 / 60, g);
    };
    return { p, g, target, run };
  }

  it('a click on an enemy swings exactly once', () => {
    const { p, target, run } = fixture();
    p.attack(target);
    run(3);
    expect(p.swings).toBe(1);
    expect(p.cmd.kind).toBe('none');
  });

  it('holding keeps swinging at the attack rate', () => {
    const { p, target, run } = fixture();
    p.attack(target, true);
    run(3.05);
    // 1.25 attacks/s: swings start at 0, 0.8, 1.6, 2.4 s.
    expect(p.swings).toBe(4);
  });

  it('a move order during a swing waits for the follow-through, then runs', () => {
    const { p, g, target, run } = fixture();
    p.attack(target);
    run(1 / 60);
    expect(p.action).not.toBeNull();
    p.moveTo(g, 10, 16);
    run(0.5);
    expect(p.z, 'rooted mid-swing').toBeCloseTo(10, 5);
    run(0.6);
    expect(p.z, 'walking after the swing').toBeGreaterThan(10.5);
  });
});
