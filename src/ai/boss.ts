import type { Enemy } from '../entities/enemy';
import type { Game } from '../game';

type ActionKind = 'bite' | 'breath' | 'tail' | 'gust' | 'flight';

export interface BossState {
  engaged: boolean;
  phase: 1 | 2;
  action: { kind: ActionKind; t: number; dur: number; step: number; data: any } | null;
  actionCd: number;
  flightCd: number;
  summoned: boolean;
  fightTime: number;
}

export const newBossState = (): BossState => ({
  engaged: false, phase: 1, action: null, actionCd: 2, flightCd: 0, summoned: false, fightTime: 0,
});

/**
 * Cinderwing. Every special is preceded by a ground telegraph sized exactly to its hit area:
 * breath (cone), tail sweep (circle), wing gust (wide cone, knockback), and in phase 2 a
 * flight with fire rain and a landing slam. Returns distance moved this frame.
 */
export function updateBoss(e: Enemy, dt: number, g: Game): number {
  const b = e.boss!;
  const p = g.player;
  const A = g.zone.arena!;
  const playerInArena = Math.hypot(p.x - A.x, p.z - A.z) < A.r;

  if (!b.engaged) {
    e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.2 * dt);
    if (!p.dead && playerInArena) {
      b.engaged = true;
      b.actionCd = 1.8;
      g.combat.onBossEngage(e);
    }
    const dHome = Math.hypot(e.x - e.home.x, e.z - e.home.z);
    if (dHome > 0.5) return e.chase(dt, g, e.home.x, e.home.z, e.def.speed * 1.5);
    e.faceTo(p.x, p.z);
    return 0;
  }

  // Disengage if the player dies or flees the arena: reset fully (no punishment for retreating).
  if (p.dead || Math.hypot(p.x - A.x, p.z - A.z) > A.r + 8) {
    b.engaged = false;
    b.action = null;
    b.phase = 1;
    b.summoned = false;
    b.fightTime = 0;
    e.untargetable = false;
    e.anim.fly = 0;
    e.anim.special = -1;
    e.anim.attack = -1;
    g.combat.onBossDisengage(e);
    return 0;
  }

  b.fightTime += dt;
  b.actionCd -= dt;
  b.flightCd -= dt;

  if (b.phase === 1 && e.hp < e.maxHp * 0.5) {
    b.phase = 2;
    b.actionCd = 0;
    b.flightCd = 0;
    g.announce('Cinderwing takes to the sky!', 'boss');
    g.sfx.play('roar');
    g.shake(0.5, 0.8);
  }
  if (b.phase === 2 && !b.summoned && e.hp < e.maxHp * 0.25 && !b.action) {
    b.summoned = true;
    g.announce('Cinderwing calls its brood!', 'boss');
    g.sfx.play('roar', 0.8, 1.2);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + Math.random();
      g.combat.spawnEnemy('drakeling', A.x + Math.cos(a) * (A.r - 2), A.z + Math.sin(a) * (A.r - 2), null, true);
    }
  }

  if (b.action) return runAction(e, b, dt, g);

  const dist = e.distTo(p) - e.radius;
  const tempo = b.phase === 2 ? 0.7 : 1;
  if (b.actionCd <= 0) {
    let kind: ActionKind | null = null;
    const r = Math.random();
    if (b.phase === 2 && b.flightCd <= 0) kind = 'flight';
    else if (dist < 3) kind = r < 0.45 ? 'bite' : r < 0.8 ? 'tail' : 'gust';
    else if (dist < 10) kind = r < 0.65 ? 'breath' : r < 0.85 ? 'gust' : null;
    if (kind) {
      startAction(e, b, kind, g);
      b.actionCd = (1.3 + Math.random() * 0.7) * tempo;
      return 0;
    }
  }
  if (dist > 2.2) return e.chase(dt, g, p.x, p.z, e.def.speed * (b.phase === 2 ? 1.2 : 1));
  e.faceTo(p.x, p.z);
  return 0;
}

function startAction(e: Enemy, b: BossState, kind: ActionKind, g: Game) {
  const p = g.player;
  e.faceTo(p.x, p.z, true);
  const dir = Math.atan2(p.z - e.z, p.x - e.x);
  const fwdX = Math.cos(dir), fwdZ = Math.sin(dir);
  switch (kind) {
    case 'bite': {
      b.action = { kind, t: 0, dur: 0.9, step: 0, data: null };
      e.anim.attackKind = 'bite';
      break;
    }
    case 'breath': {
      const ox = e.x + fwdX * e.radius, oz = e.z + fwdZ * e.radius;
      b.action = { kind, t: 0, dur: 2.8, step: 0, data: { dir, ox, oz } };
      g.combat.telegraph(ox, oz, { kind: 'cone', r: 10, angle: 0.95, dir }, 1.0, () => {});
      g.sfx.play('telegraph');
      break;
    }
    case 'tail': {
      b.action = { kind, t: 0, dur: 1.3, step: 0, data: null };
      g.combat.telegraph(e.x, e.z, { kind: 'circle', r: e.radius + 3.2 }, 0.9, (t) => {
        g.shake(0.35, 0.3);
        g.fx.dustRing(t.x, t.z, e.radius + 3.2);
        if (Math.hypot(p.x - t.x, p.z - t.z) < e.radius + 3.2 + p.radius * 0.6) g.combat.damagePlayer(14, e, 14);
      });
      break;
    }
    case 'gust': {
      b.action = { kind, t: 0, dur: 1.2, step: 0, data: { dir } };
      g.combat.telegraph(e.x, e.z, { kind: 'cone', r: 8.5, angle: 1.8, dir }, 0.8, (t) => {
        g.sfx.play('roll', 1.5, 0.6);
        g.fx.gust(e.x, e.z, dir);
        if (t.shape.kind === 'cone' && g.combat.inShape(t, p)) g.combat.damagePlayer(6, e, 20);
      });
      break;
    }
    case 'flight': {
      b.action = { kind, t: 0, dur: 9.5, step: 0, data: { rained: 0, rainT: 0 } };
      b.flightCd = 22;
      g.sfx.play('roar', 0.7, 1.1);
      break;
    }
  }
}

function runAction(e: Enemy, b: BossState, dt: number, g: Game): number {
  const a = b.action!;
  const p = g.player;
  const A = g.zone.arena!;
  a.t += dt;
  let moved = 0;
  switch (a.kind) {
    case 'bite': {
      e.anim.attack = Math.min(1, a.t / a.dur);
      if (a.step === 0 && a.t >= a.dur * 0.5) {
        a.step = 1;
        const dir = e.dirAngle;
        const reach = e.radius + 2.6;
        const dx = p.x - e.x, dz = p.z - e.z;
        let diff = Math.atan2(dz, dx) - dir;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        if (Math.hypot(dx, dz) < reach + p.radius && Math.abs(diff) < 1.0) g.combat.damagePlayer(e.rollDamage(), e, 5);
        g.sfx.play('hit', 0.8, 0.6);
      }
      break;
    }
    case 'breath': {
      const { dir, ox, oz } = a.data;
      e.anim.special = Math.min(1, a.t / 1.0) * 0.6 + (a.t > 1 ? 0.4 : 0);
      if (a.t >= 1.0) {
        if (a.step === 0) {
          a.step = 1;
          g.sfx.play('breath');
          g.combat.hazard(ox, oz, { kind: 'cone', r: 10, angle: 0.95, dir }, 1.6, 0.25, 5, e);
        }
        e.anim.special = 0.7;
      }
      break;
    }
    case 'tail': {
      e.anim.attackKind = 'slam';
      e.anim.attack = Math.min(1, a.t / a.dur);
      // Spin the body during the sweep for readability.
      if (a.t > 0.8 && a.t < 1.2) e.targetFacing += dt * 14;
      break;
    }
    case 'gust': {
      e.anim.special = Math.min(1, a.t / 0.8) * 0.5;
      break;
    }
    case 'flight': {
      const d = a.data;
      const up = Math.min(1, a.t / 1.2);
      const landing = a.t > a.dur - 1.6;
      e.anim.fly = landing ? Math.max(0, (a.dur - a.t) / 1.6) : up;
      e.untargetable = e.anim.fly > 0.3;
      if (!landing) {
        // Circle the player at a distance (never on top of them, so telegraphs stay visible) and rain fire.
        d.orbit = (d.orbit ?? Math.atan2(e.z - p.z, e.x - p.x)) + dt * 0.5;
        let ox = p.x + Math.cos(d.orbit) * 8, oz = p.z + Math.sin(d.orbit) * 8;
        const fromA = Math.hypot(ox - A.x, oz - A.z), maxR = A.r - 3;
        if (fromA > maxR) {
          ox = A.x + ((ox - A.x) / fromA) * maxR;
          oz = A.z + ((oz - A.z) / fromA) * maxR;
        }
        const dx = ox - e.x, dz = oz - e.z, dd = Math.hypot(dx, dz);
        if (dd > 0.1) {
          const step = Math.min(dd, 7 * dt);
          e.pos.x += (dx / dd) * step;
          e.pos.z += (dz / dd) * step;
          moved = step;
        }
        e.faceTo(p.x, p.z);
        d.rainT -= dt;
        if (a.t > 1.2 && d.rainT <= 0 && d.rained < 12) {
          d.rainT = 0.45;
          d.rained++;
          const off = d.rained % 3 === 0 ? 0 : 1.5;
          const ang = Math.random() * Math.PI * 2;
          g.combat.meteor(p.x + Math.cos(ang) * off * Math.random(), p.z + Math.sin(ang) * off * Math.random(), e);
        }
      } else if (a.step === 0) {
        a.step = 1;
        // Land on solid ground inside the arena.
        const spot = g.zone.nav.nearestWalkable(e.x, e.z) ?? { x: A.x, z: A.z };
        e.pos.x = spot.x;
        e.pos.z = spot.z;
        const lx = e.x, lz = e.z;
        g.combat.telegraph(lx, lz, { kind: 'circle', r: 4.5 }, 1.5, (t) => {
          g.shake(0.6, 0.5);
          g.fx.dustRing(t.x, t.z, 4.5);
          g.sfx.play('slam');
          if (Math.hypot(p.x - t.x, p.z - t.z) < 4.5 + p.radius * 0.6) g.combat.damagePlayer(16, e, 16);
        });
      }
      break;
    }
  }
  if (a.t >= a.dur) {
    b.action = null;
    e.anim.attack = -1;
    e.anim.special = -1;
    e.anim.fly = 0;
    e.untargetable = false;
  }
  return moved;
}
