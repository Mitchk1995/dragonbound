/**
 * The enemies' half of a simulated fight (see sim.ts): one 30 Hz step of each behaviour, counting the raw damage
 * their attacks would deal, then bodies pushed apart.
 */
import { COMBAT_TUNING } from '../../src/data/tuning';
import type { EnemyDef } from '../../src/data/enemies';
import { DT, HERO_R, type Foe, type Pacing, type Tally } from './simKit';

/** Pack clearings are about this wide (Gen.pack `clear`); a retreating enemy stops at the edge. */
const CLEARING = 7;
/** Share of kobold stones and cultist fire circles that land on a hero who mostly keeps attacking. */
const KITER_HITS = 0.6;
const CASTER_HITS = 0.35;
/**
 * Cinderwing (ai/boss.ts): an attack every telegraph plus 1.3-2.0 s (x0.7 in phase 2), and each one
 * costs the hero about this long stepping out of its shape instead of attacking (BOSS_DODGE). Below half
 * life it takes to the sky every 22 s for the flight and landing, out of reach.
 */
const BOSS_TELEGRAPH = 1.35;
export const BOSS_DODGE = 0.6;
const BOSS_FLIGHT_EVERY = 22;

const avgDmg = (e: EnemyDef) => (e.dmg[0] + e.dmg[1]) / 2;

/**
 * Step every living foe once. `pack` is the clearing's centre, `openGround` lifts its edge. Returns true when
 * Cinderwing attacked, so the hero spends BOSS_DODGE stepping clear.
 */
export function stepEnemies(live: Foe[], hero: { x: number; z: number }, pack: { x: number; z: number }, P: Pacing, openGround: boolean, tally: Tally): boolean {
  let bossAttacked = false;
  for (const f of live) {
    if (f.stagger > 0) {
      f.stagger -= DT;
      continue;
    }
    f.atkCd -= DT;
    f.slowT -= DT;
    const sp = P.enemySpeed(f.def) * (f.slowT > 0 ? 0.5 : 1);
    const d = Math.hypot(f.x - hero.x, f.z - hero.z) || 1e-6;
    const ux = (hero.x - f.x) / d, uz = (hero.z - f.z) / d;
    const move = (vx: number, vz: number, s: number, away = false) => {
      const nx = f.x + vx * s * DT, nz = f.z + vz * s * DT;
      // Packs sit in clearings ringed by trees and rock: backing off stops at the edge.
      if (away && !openGround && Math.hypot(nx - pack.x, nz - pack.z) > CLEARING && Math.hypot(nx - pack.x, nz - pack.z) > Math.hypot(f.x - pack.x, f.z - pack.z)) return;
      f.x = nx;
      f.z = nz;
    };
    const b = f.def.behavior;
    if (b === 'boss') {
      if (f.away > 0) {
        f.away -= DT;
        continue;
      }
      if (!f.phase2 && f.hp < f.def.hp * 0.5) f.phase2 = true;
      if (f.phase2 && (f.flightCd -= DT) <= 0) {
        f.away = COMBAT_TUNING.boss.flight + COMBAT_TUNING.boss.land;
        f.flightCd = BOSS_FLIGHT_EVERY;
        continue;
      }
      if (d > f.def.atkRange + f.def.radius + HERO_R) move(ux, uz, sp);
      else if (f.atkCd <= 0) {
        f.atkCd = BOSS_TELEGRAPH + 1.65 * (f.phase2 ? 0.7 : 1);
        tally.incoming += avgDmg(f.def);
        bossAttacked = true;
      }
    } else if (b === 'chaser') {
      if (d > f.def.atkRange + f.def.radius + HERO_R) move(ux, uz, sp);
      else if (f.atkCd <= 0) {
        f.atkCd = 1 / f.def.atkSpeed;
        tally.incoming += avgDmg(f.def);
      }
    } else if (b === 'kiter' || b === 'caster') {
      const tooClose = b === 'kiter' ? 4.5 : 4;
      if (d < tooClose) move(-ux, -uz, sp * (b === 'kiter' ? 0.85 : 0.8), true);
      else if (d > f.def.atkRange) move(ux, uz, sp);
      else if (f.atkCd <= 0) {
        f.atkCd = 1 / f.def.atkSpeed;
        tally.incoming += avgDmg(f.def) * (b === 'kiter' ? KITER_HITS : CASTER_HITS);
      }
    } else if (b === 'lunger') {
      const L = P.lunge;
      if (f.lunge) {
        f.lunge.t += DT;
        if (f.lunge.t > L.windup) {
          if (d > f.def.radius + HERO_R + 0.3) move(f.lunge.dx, f.lunge.dz, L.speed);
          else if (!f.lunge.hit) {
            f.lunge.hit = true;
            tally.incoming += avgDmg(f.def);
          }
          if (f.lunge.t >= L.windup + L.dash) {
            f.lunge = null;
            f.recover = L.recover;
          }
        }
      } else if (f.recover > 0) f.recover -= DT;
      else if (d > 5) move(ux, uz, sp);
      else if (f.atkCd > 0) {
        // Circle-strafe at about 4 units while the next lunge charges.
        if (Math.abs(d - 4) > 0.2) move(d < 4 ? -ux : ux, d < 4 ? -uz : uz, sp * 0.6);
      } else {
        f.lunge = { t: 0, dx: ux, dz: uz };
        f.atkCd = 1 / f.def.atkSpeed;
      }
    }
  }
  return bossAttacked;
}

/** Bodies don't overlap (Combat.separateUnits): foes push each other apart, and off the hero. */
export function separate(live: Foe[], hero: { x: number; z: number }) {
  for (let i = 0; i < live.length; i++) {
    const a = live[i];
    for (let j = i + 1; j < live.length; j++) {
      const c = live[j];
      const dx = c.x - a.x, dz = c.z - a.z, min = a.def.radius + c.def.radius, d2 = dx * dx + dz * dz;
      if (d2 < min * min && d2 > 1e-9) {
        const d = Math.sqrt(d2), push = (min - d) / 2;
        a.x -= (dx / d) * push;
        a.z -= (dz / d) * push;
        c.x += (dx / d) * push;
        c.z += (dz / d) * push;
      }
    }
    const dx = a.x - hero.x, dz = a.z - hero.z, min = a.def.radius + HERO_R, d2 = dx * dx + dz * dz;
    if (d2 < min * min && d2 > 1e-9) {
      const d = Math.sqrt(d2);
      a.x += (dx / d) * (min - d);
      a.z += (dz / d) * (min - d);
    }
  }
}
