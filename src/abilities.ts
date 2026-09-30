import type { AbilityDef } from './data/abilities';
import type { Enemy } from './entities/enemy';
import type { Game } from './game';
import { PAL } from './render/kit';

export interface Aim {
  x: number;
  z: number;
  target: Enemy | null;
}

/** Execute an ability. Cooldown/unlock checks happen in Game.useAbility. */
export function castAbility(g: Game, def: AbilityDef, aim: Aim) {
  const p = g.player;
  const st = g.stats;
  const tx = aim.target?.x ?? aim.x, tz = aim.target?.z ?? aim.z;
  p.faceTo(tx, tz, true);
  const dx = tx - p.x, dz = tz - p.z;
  const d = Math.hypot(dx, dz) || 1;
  const dirX = dx / d, dirZ = dz / d;

  switch (def.id) {
    case 'cleave':
      g.combat.playerAction(0.34, 0.45, 'swing', () => {
        g.sfx.play('swing', 1.2, 0.8);
        g.fx.arc(p.x, p.z, Math.atan2(dirZ, dirX), 3.2, Math.PI * 1.1, 0xfff0c0);
        for (const e of g.combat.enemiesInCone(p.x, p.z, Math.atan2(dirZ, dirX), 3.2, Math.PI * 1.1)) {
          g.combat.hitEnemy(e, def.mult, { kb: 5, fromX: p.x, fromZ: p.z });
        }
      });
      break;

    case 'leap_slam': {
      const maxD = 7.5;
      let lx = p.x + dirX * Math.min(d, maxD), lz = p.z + dirZ * Math.min(d, maxD);
      const spot = g.zone.nav.nearestWalkable(lx, lz);
      if (spot) {
        lx = spot.x;
        lz = spot.z;
      }
      p.action = null;
      p.anim.attack = 0;
      p.anim.attackKind = 'slam';
      p.dash = {
        fx: p.x, fz: p.z, tx: lx, tz: lz, t: 0, dur: 0.45, height: 2.2,
        onEnd: () => {
          p.anim.attack = -1;
          g.sfx.play('slam');
          g.shake(0.45, 0.35);
          g.fx.dustRing(p.x, p.z, 3);
          for (const e of g.combat.enemiesInRadius(p.x, p.z, 3)) g.combat.hitEnemy(e, def.mult, { kb: 10, fromX: p.x, fromZ: p.z });
        },
      };
      p.stop();
      break;
    }

    case 'war_cry':
      g.combat.playerAction(0.3, 0.4, 'slam', () => {
        p.warCryT = 6;
        g.prog.recomputeStats();
        g.sfx.play('warcry');
        g.fx.dustRing(p.x, p.z, 4, 0xff5a3a);
        g.announce('War Cry!', 'buff');
      });
      break;

    case 'multishot':
      g.combat.playerAction(0.3, 0.5, 'bow', () => {
        g.sfx.play('arrow', 1.3);
        const base = Math.atan2(dirZ, dirX);
        for (let i = -2; i <= 2; i++) {
          const a = base + i * 0.16;
          g.combat.firePlayerProjectile('arrow', Math.cos(a), Math.sin(a), def.mult, { pierce: 1 });
        }
      });
      break;

    case 'evasive_roll': {
      const rollD = 5;
      let rx = p.x + dirX * rollD, rz = p.z + dirZ * rollD;
      // Stop short of walls.
      for (let s = rollD; s > 0.5; s -= 0.5) {
        rx = p.x + dirX * s;
        rz = p.z + dirZ * s;
        if (g.zone.nav.lineClear(p.x, p.z, rx, rz, 0.3)) break;
      }
      p.action = null;
      p.invulnT = 0.35;
      p.dash = {
        fx: p.x, fz: p.z, tx: rx, tz: rz, t: 0, dur: 0.28, height: 0.3,
        onEnd: () => {
          p.nextShotCrit = true;
        },
      };
      p.stop();
      g.sfx.play('roll');
      g.particles.burst(p.pos.clone().setY(0.2), { count: 10, color: [0x9a8666, 0x7a6a50], speed: 3, up: 1, life: 0.4 });
      break;
    }

    case 'arrow_rain':
      g.combat.playerAction(0.3, 0.5, 'bow', () => {
        g.sfx.play('arrow', 1.2, 0.8);
        g.combat.arrowRain(aim.x, aim.z, 3.2, 2.5, def.mult);
      });
      break;

    case 'fireball':
      g.combat.playerAction(0.32, 0.5, 'cast', () => {
        g.sfx.play('fireball');
        g.combat.firePlayerProjectile('fireball', dirX, dirZ, def.mult, { aoe: 2.6, speed: 16 });
      });
      break;

    case 'frost_nova':
      g.combat.playerAction(0.28, 0.45, 'cast', () => {
        g.sfx.play('frost');
        g.fx.dustRing(p.x, p.z, 4.2, PAL.frost);
        g.glow.burst(p.pos.clone().setY(0.5), { count: 40, color: [PAL.frost, 0xffffff], speed: 10, up: 1, life: 0.5, gravity: 0, size: 0.18 });
        for (const e of g.combat.enemiesInRadius(p.x, p.z, 4.2)) {
          g.combat.hitEnemy(e, def.mult, { kb: 3, fromX: p.x, fromZ: p.z });
          e.slow(0.5, 3);
        }
      });
      break;

    case 'chain_lightning':
      g.combat.playerAction(0.28, 0.5, 'cast', () => {
        g.sfx.play('lightning');
        let from = { x: p.x, y: 1.4, z: p.z };
        let cur = aim.target && !aim.target.dead ? aim.target : g.combat.nearestEnemy(tx, tz, 6, p.x, p.z, st.range + 2);
        const hit = new Set<Enemy>();
        for (let i = 0; i < 5 && cur; i++) {
          hit.add(cur);
          g.fx.lightning(from, { x: cur.x, y: 1, z: cur.z });
          g.combat.hitEnemy(cur, def.mult * Math.pow(0.85, i), {});
          from = { x: cur.x, y: 1, z: cur.z };
          cur = g.combat.nearestEnemy(cur.x, cur.z, 6, undefined, undefined, undefined, hit);
        }
      });
      break;
  }
}
