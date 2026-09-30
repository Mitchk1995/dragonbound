import { ENEMIES, type EnemyDef } from '../data/enemies';
import { makeModel } from '../render/registry';
import { randInt } from '../core/rng';
import type { Game } from '../game';
import type { Vec2 } from '../types';
import { Unit } from './unit';
import { updateBoss, type BossState } from '../ai/boss';

export interface PackState {
  x: number;
  z: number;
  comp: string[];
  members: Enemy[];
  respawnT: number;
}

const LEASH = 26;
/** Idle enemies farther than this from the hero sleep (see update). */
const DORMANT_DIST = 42;

export class Enemy extends Unit {
  readonly def: EnemyDef;
  home: Vec2;
  aggro = false;
  returning = false;
  deadT = 0;
  atkCd = 0;
  actT = -1;
  actDur = 0.6;
  actDone = false;
  repathT = 0;
  /** The last path search failed (see chase). */
  pathFailed = false;
  wanderT = Math.random() * 4;
  untargetable = false;
  /** Lunger state. */
  lunge: { dirX: number; dirZ: number; t: number; hit: boolean } | null = null;
  recoverT = 0;
  boss: BossState | null = null;

  constructor(defId: string, x: number, z: number, public pack: PackState | null) {
    const def = ENEMIES[defId];
    super(makeModel(def.model), def.radius, def.hp);
    this.def = def;
    this.pos.set(x, 0, z);
    this.home = { x, z };
    this.facing = this.targetFacing = Math.random() * Math.PI * 2;
    this.atkCd = Math.random();
    this.turnSpeed = def.behavior === 'boss' ? 4 : 10;
    if (def.behavior === 'boss') this.kbResist = 1;
    else if (def.elite) this.kbResist = 0.7;
    if (def.scale !== 1) {
      this.model.root.scale.setScalar(def.scale);
      this.model.height *= def.scale;
    }
  }

  get name() {
    return this.def.name;
  }

  setAggro(g: Game) {
    if (this.aggro || this.dead) return;
    this.aggro = true;
    this.returning = false;
    // Pull nearby packmates too.
    for (const e of g.zone.enemies) {
      if (e !== this && !e.aggro && !e.dead && e.def.behavior !== 'boss' && e.distTo(this) < 8) e.setAggro(g);
    }
  }

  rollDamage() {
    return randInt(Math.random, this.def.dmg[0], this.def.dmg[1]);
  }

  update(dt: number, g: Game) {
    if (this.dead) {
      this.deadT += dt;
      this.anim.dead = this.deadT;
      this.updateCommon(dt, g.zone.nav);
      return;
    }
    // Dormant when far away and idle: no AI, no animation, not drawn (big zones hold ~100 enemies;
    // only the ones near the hero cost anything). DORMANT_DIST is well beyond the view and aggro range.
    if (!this.aggro && !this.returning && this.def.behavior !== 'boss') {
      const dormant = this.distTo(g.player) > DORMANT_DIST;
      this.obj.visible = !dormant;
      if (dormant) return;
    }
    this.atkCd -= dt;
    let moved = 0;
    if (this.def.behavior === 'boss') {
      moved = updateBoss(this, dt, g);
    } else {
      moved = this.think(dt, g);
    }
    this.anim.speed = dt > 0 ? moved / dt : 0;
    this.updateCommon(dt, g.zone.nav);
  }

  private think(dt: number, g: Game): number {
    const p = g.player;
    const dist = this.distTo(p);
    const speed = this.def.speed * this.speedMult;

    if (this.returning) {
      this.hp = Math.min(this.maxHp, this.hp + this.maxHp * dt);
      if (Math.hypot(this.x - this.home.x, this.z - this.home.z) < 1) {
        this.returning = false;
        return 0;
      }
      return this.chase(dt, g, this.home.x, this.home.z, speed * 1.4);
    }
    if (!this.aggro) {
      if (!p.dead && dist < this.def.aggro) this.setAggro(g);
      return this.wander(dt, g);
    }
    if (p.dead || Math.hypot(this.x - this.home.x, this.z - this.home.z) > LEASH) {
      this.aggro = false;
      this.returning = true;
      this.actT = -1;
      this.anim.attack = -1;
      this.lunge = null;
      return 0;
    }

    // Mid-attack: advance the animation and resolve the hit frame.
    if (this.actT >= 0) {
      this.actT += dt / this.actDur;
      this.anim.attack = Math.min(1, this.actT);
      if (!this.actDone && this.actT >= 0.5) {
        this.actDone = true;
        this.onHitFrame(g);
      }
      if (this.actT >= 1) {
        this.actT = -1;
        this.anim.attack = -1;
      }
      if (this.def.behavior !== 'caster') this.faceTo(p.x, p.z);
      return 0;
    }

    switch (this.def.behavior) {
      case 'chaser':
        return this.chaser(dt, g, dist, speed);
      case 'kiter':
        return this.kiter(dt, g, dist, speed);
      case 'lunger':
        return this.lunger(dt, g, dist, speed);
      case 'caster':
        return this.caster(dt, g, dist, speed);
      default:
        return 0;
    }
  }

  private startAct(dur: number, kind: 'swing' | 'throw' | 'cast' | 'bite') {
    this.actT = 0;
    this.actDur = dur;
    this.actDone = false;
    this.anim.attackKind = kind;
    this.atkCd = 1 / this.def.atkSpeed;
  }

  private onHitFrame(g: Game) {
    const p = g.player;
    switch (this.def.behavior) {
      case 'chaser':
        if (this.distTo(p) <= this.def.atkRange + this.radius + p.radius + 0.4) g.combat.damagePlayer(this.rollDamage(), this);
        break;
      case 'kiter':
        g.combat.spawnEnemyProjectile(this, p.x + (Math.random() - 0.5), p.z + (Math.random() - 0.5), this.def.projSpeed ?? 10, this.rollDamage());
        break;
    }
  }

  private chaser(dt: number, g: Game, dist: number, speed: number) {
    const p = g.player;
    const reach = this.def.atkRange + this.radius + p.radius;
    if (dist > reach) return this.chase(dt, g, p.x, p.z, speed);
    this.faceTo(p.x, p.z);
    if (this.atkCd <= 0) this.startAct(0.55, 'swing');
    return 0;
  }

  private kiter(dt: number, g: Game, dist: number, speed: number) {
    const p = g.player;
    if (dist < 4.5) {
      const dx = this.x - p.x, dz = this.z - p.z;
      const d = Math.hypot(dx, dz) || 1;
      return this.moveToward(dt, this.x + (dx / d) * 2, this.z + (dz / d) * 2, speed * 0.85, g.zone.nav);
    }
    if (dist > this.def.atkRange) return this.chase(dt, g, p.x, p.z, speed);
    this.faceTo(p.x, p.z);
    if (this.atkCd <= 0) this.startAct(0.7, 'throw');
    return 0;
  }

  private lunger(dt: number, g: Game, dist: number, speed: number) {
    const p = g.player;
    if (this.lunge) {
      const L = this.lunge;
      L.t += dt;
      if (L.t < 0.55) {
        // Wind-up: crouch and hold the locked direction.
        this.anim.special = L.t / 0.55;
        return 0;
      }
      this.anim.special = -1;
      this.anim.attack = Math.min(1, (L.t - 0.55) / 0.35);
      this.anim.attackKind = 'bite';
      const step = 15 * dt;
      const px = this.x, pz = this.z;
      this.pos.x += L.dirX * step;
      this.pos.z += L.dirZ * step;
      g.zone.nav.resolveCircle(this.pos, this.radius * 0.8);
      if (!L.hit && this.distTo(p) < this.radius + p.radius + 0.35) {
        L.hit = true;
        g.combat.damagePlayer(this.rollDamage(), this, 6);
      }
      if (L.t >= 0.9) {
        this.lunge = null;
        this.anim.attack = -1;
        this.recoverT = 0.7;
      }
      return Math.hypot(this.x - px, this.z - pz);
    }
    if (this.recoverT > 0) {
      this.recoverT -= dt;
      return 0;
    }
    if (dist > 5 || !g.zone.nav.lineClear(this.x, this.z, p.x, p.z, 0.3)) return this.chase(dt, g, p.x, p.z, speed);
    if (this.atkCd > 0) {
      // Circle-strafe while waiting.
      const a = Math.atan2(this.z - p.z, this.x - p.x) + dt * 0.8;
      return this.moveToward(dt, p.x + Math.cos(a) * 4, p.z + Math.sin(a) * 4, speed * 0.6, g.zone.nav);
    }
    const dx = p.x - this.x, dz = p.z - this.z;
    const d = Math.hypot(dx, dz) || 1;
    this.lunge = { dirX: dx / d, dirZ: dz / d, t: 0, hit: false };
    this.faceTo(p.x, p.z, true);
    this.atkCd = 1 / this.def.atkSpeed;
    g.combat.telegraph(this.x, this.z, { kind: 'cone', r: 6, angle: 0.4, dir: Math.atan2(dz, dx) }, 0.55, () => {});
    return 0;
  }

  private caster(dt: number, g: Game, dist: number, speed: number) {
    const p = g.player;
    if (dist < 4) {
      const dx = this.x - p.x, dz = this.z - p.z;
      const d = Math.hypot(dx, dz) || 1;
      return this.moveToward(dt, this.x + (dx / d) * 2, this.z + (dz / d) * 2, speed * 0.8, g.zone.nav);
    }
    if (dist > this.def.atkRange) return this.chase(dt, g, p.x, p.z, speed);
    this.faceTo(p.x, p.z);
    if (this.atkCd <= 0) {
      this.startAct(this.def.castTime ?? 1.2, 'cast');
      const r = this.def.aoeRadius ?? 1.8;
      const dmg = this.rollDamage();
      // The first circle lands on the player; extra circles (mini-bosses) cut off escape routes.
      for (let k = 0; k < (this.def.multiCast ?? 1); k++) {
        const a = Math.random() * Math.PI * 2, off = k === 0 ? 0 : 2.5 + Math.random() * 2;
        const cx = p.x + Math.cos(a) * off, cz = p.z + Math.sin(a) * off;
        g.combat.telegraph(cx, cz, { kind: 'circle', r }, (this.def.castTime ?? 1.2) + k * 0.15, (t) => {
          g.fx.fireBurst(t.x, t.z, r);
          if (Math.hypot(p.x - t.x, p.z - t.z) <= r + p.radius * 0.6) g.combat.damagePlayer(dmg, this);
        });
      }
    }
    return 0;
  }

  private wander(dt: number, g: Game) {
    this.wanderT -= dt;
    if (this.wanderT <= 0) {
      this.wanderT = 3 + Math.random() * 4;
      const a = Math.random() * Math.PI * 2, r = Math.random() * 2.5;
      const tx = this.home.x + Math.cos(a) * r, tz = this.home.z + Math.sin(a) * r;
      if (g.zone.nav.isWalkable(tx, tz)) this.path = [{ x: tx, z: tz }];
    }
    return this.followPath(dt, this.def.speed * 0.35, g.zone.nav);
  }

  chase(dt: number, g: Game, tx: number, tz: number, speed: number): number {
    this.repathT -= dt;
    if (g.zone.nav.lineClear(this.x, this.z, tx, tz, this.radius * 0.7)) {
      this.path = [];
      return this.moveToward(dt, tx, tz, speed, g.zone.nav);
    }
    // Re-path on the timer, or early when a good path ran out. A failed search (target
    // unreachable, e.g. across water) waits for the timer: retrying every frame costs a full
    // 2500-node search per enemy per frame.
    if (this.repathT <= 0 || (!this.path.length && !this.pathFailed)) {
      const found = g.zone.nav.findPath(this.x, this.z, tx, tz, 2500);
      this.path = found ?? [];
      this.pathFailed = !found;
      this.repathT = 0.5 + Math.random() * 0.3;
    }
    return this.followPath(dt, speed, g.zone.nav);
  }
}
