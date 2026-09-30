import { COMBAT_TUNING } from '../data/tuning';

/**
 * Left-mouse behaviour, Diablo 2 style. A press decides the hold mode: on (or just beside) an
 * enemy it attacks, on open ground it walks. Holding keeps doing that; a quick click on an enemy
 * walks into range and swings once.
 */
export type HoldMode = 'none' | 'move' | 'attack';

export interface Foe {
  x: number;
  z: number;
  radius: number;
  dead: boolean;
  untargetable: boolean;
}

interface Point {
  x: number;
  z: number;
}

const alive = (e: Foe) => !e.dead && !e.untargetable;

/** The live foe nearest `at` within `maxR` (optionally only those passing `ok`). */
export function nearestFoe<T extends Foe>(foes: readonly T[], at: Point, maxR: number, ok: (e: T) => boolean = () => true): T | null {
  let best: T | null = null;
  let bd = maxR;
  for (const e of foes) {
    if (!alive(e) || !ok(e)) continue;
    const d = Math.hypot(e.x - at.x, e.z - at.z);
    if (d < bd) {
      bd = d;
      best = e;
    }
  }
  return best;
}

/** What a press on no enemy, item or station attacks: an enemy within a small radius of the cursor (a near miss still counts). */
export function pressTarget<T extends Foe>(foes: readonly T[], cursor: Point): T | null {
  return nearestFoe(foes, cursor, COMBAT_TUNING.input.pressPick);
}

/**
 * Who to attack while the button stays held in attack mode. The current target is kept until it
 * dies (whatever the cursor does). Then: the enemy under the cursor, else one near the cursor,
 * else one already within reach of the hero. A new target must be close to the hero's attack
 * range so holding never drags you into the next pack. Null means stand still (never walk).
 */
export function holdTarget<T extends Foe>(foes: readonly T[], current: T | null, hovered: T | null, cursor: Point, hero: Point, range: number): T | null {
  if (current && alive(current)) return current;
  const I = COMBAT_TUNING.input;
  const gap = (e: T) => Math.hypot(e.x - hero.x, e.z - hero.z) - range - e.radius;
  const near = (e: T) => gap(e) <= I.holdChase;
  if (hovered && alive(hovered) && near(hovered)) return hovered;
  return nearestFoe(foes, cursor, I.holdPick, near) ?? nearestFoe(foes, hero, Infinity, (e) => gap(e) <= 0);
}
