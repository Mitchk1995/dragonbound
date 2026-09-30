import * as THREE from 'three';
import { castAbility } from '../abilities';
import { newBossState } from '../ai/boss';
import { mitigate, rollHit } from '../combat/damage';
import { canAfford, swingTiming } from '../combat/stats';
import { abilityFor, type AbilityKey } from '../data/abilities';
import { Enemy, type PackState } from '../entities/enemy';
import { ATTACK_ANIM } from '../entities/player';
import { Projectile, type ProjectileKind } from '../entities/projectile';
import { Telegraph, shapeContains, type Shape } from '../fx/telegraph';
import type { Game } from '../game';
import { rollDrops } from '../loot/drops';
import { SKILL_INFO } from '../progression/skills';
import type { AttackKind } from '../render/anim';
import { PAL } from '../render/kit';
import { Cell } from '../world/layout';
import { COMBAT_TUNING, MANA_TUNING, XP_TUNING } from '../data/tuning';

export interface HitOpts {
  kb?: number;
  fromX?: number;
  fromZ?: number;
  forceCrit?: boolean;
  /** A damage-over-time tick (Rain of Arrows): no hitstop, no flinch. */
  tick?: boolean;
}

export interface Hazard {
  x: number;
  z: number;
  shape: Shape;
  t: number;
  dur: number;
  tick: number;
  tickT: number;
  dmg: number;
  source: Enemy;
  /** Fractional particles owed to the emitter (emission is per second, not per frame). */
  emit?: number;
}

/** Meteor fire-trail density in particles per second (≈3 per frame at 60 fps). */
const METEOR_TRAIL_RATE = 180;

/** Breath cone density in particles per second (≈10 per frame at 60 fps). */
const BREATH_RATE = 600;

/** Player attacks, abilities, projectiles, enemy damage, telegraphs and hazards. */
export class Combat {
  potionProgress = 0;
  bossEngagedAt = 0;
  /** Current mana (one pool for every style). Starts full; clamped to the max each frame. */
  mana = Infinity;
  /** Potion mana still to arrive, and how fast (per second). */
  private manaHealT = 0;
  private manaHealRate = 0;

  constructor(private g: Game) {}

  // ─── Mana ────────────────────────────────────────────────────────────────

  /** Regenerate mana. Full in the keep and while dead (you wake with a full pool). */
  updateMana(dt: number) {
    const g = this.g, p = g.player, st = g.stats, M = MANA_TUNING;
    if (p.dead || g.zone.def.kind === 'hub') {
      this.mana = st.maxMana;
      this.manaHealT = 0;
      return;
    }
    let regen = st.manaRegen + (p.sinceHit > M.outOfCombatAfter ? st.maxMana * M.outOfCombatFrac : 0);
    if (this.manaHealT > 0) {
      this.manaHealT -= dt;
      regen += this.manaHealRate;
    }
    this.mana = Math.min(st.maxMana, this.mana + regen * dt);
  }

  /** Restore `frac` of max mana over `secs` (the healing potion). */
  restoreMana(frac: number, secs: number) {
    this.manaHealT = secs;
    this.manaHealRate = (this.g.stats.maxMana * frac) / secs;
  }

  get manaFull() {
    return this.mana >= this.g.stats.maxMana;
  }

  private get z() {
    return this.g.zone;
  }

  // ─── Player offence ──────────────────────────────────────────────────────

  /** Start a committed attack/cast animation; `onHit` fires at the impact frame (COMBAT_TUNING.impact). */
  playerAction(dur: number, kind: AttackKind, onHit: () => void) {
    const p = this.g.player;
    const hitAt = COMBAT_TUNING.impact;
    p.action = { t: 0, dur, hitAt, done: false, kind, onHit };
    p.anim.attack = 0;
    p.anim.attackKind = kind;
  }

  startBasicAttack(target: Enemy | null) {
    const g = this.g, p = g.player, st = g.stats;
    const timing = swingTiming(st.atkSpeed);
    p.attackCd = timing.interval;
    p.swings++;
    if (target) p.faceTo(target.x, target.z, true);
    this.playerAction(timing.dur, ATTACK_ANIM[st.style], () => {
      const dirA = target && !target.dead ? Math.atan2(target.z - p.z, target.x - p.x) : p.dirAngle;
      if (st.style === 'melee') {
        g.sfx.play('swing', 0.8, 0.9 + Math.random() * 0.2);
        g.fx.arc(p.x, p.z, dirA, st.range + 0.6, Math.PI * 0.6, 0xffffff);
        const hits = this.enemiesInCone(p.x, p.z, dirA, st.range + 0.5, Math.PI * 0.6);
        if (target && !target.dead && !hits.includes(target) && p.distTo(target) <= st.range + target.radius + 0.8) hits.push(target);
        for (const e of hits) this.hitEnemy(e, 1, { kb: COMBAT_TUNING.knockback.melee, fromX: p.x, fromZ: p.z });
      } else {
        const tx = target && !target.dead ? target.x : p.x + Math.cos(dirA);
        const tz = target && !target.dead ? target.z : p.z + Math.sin(dirA);
        const dx = tx - p.x, dz = tz - p.z;
        const d = Math.hypot(dx, dz) || 1;
        if (st.style === 'ranged') {
          g.sfx.play('arrow');
          this.firePlayerProjectile('arrow', dx / d, dz / d, 1, {});
        } else {
          g.sfx.play('bolt');
          this.firePlayerProjectile('bolt', dx / d, dz / d, 1, { speed: 18 });
        }
      }
    });
  }

  /** `quiet` (a held key repeating) skips the refusal sounds and messages. */
  useAbility(key: AbilityKey, quiet = false) {
    const g = this.g, p = g.player;
    if (p.dead || p.dash || g.zone.def.kind === 'hub') return;
    const def = abilityFor(g.stats.style, key);
    if (!def) {
      if (!quiet) g.sfx.play('deny');
      return;
    }
    if (g.stats.styleLevel < def.unlock) {
      if (quiet) return;
      g.announce(`${def.name} unlocks at ${SKILL_INFO[def.style].name} level ${def.unlock}.`, 'deny');
      g.sfx.play('deny');
      return;
    }
    if ((p.cds[def.id] ?? 0) > 0) {
      if (!quiet) g.sfx.play('deny', 0.5);
      return;
    }
    if (p.action && !p.action.done) return;
    if (!canAfford(Math.min(this.mana, g.stats.maxMana), def.mana)) {
      if (!quiet) {
        g.sfx.play('deny', 0.5);
        g.ui.noMana();
      }
      return;
    }
    g.skilling.stop();
    this.mana = Math.min(this.mana, g.stats.maxMana) - def.mana;
    p.cds[def.id] = def.cooldown * (1 - g.stats.cdr);
    castAbility(g, def, { x: g.ground.x, z: g.ground.z, target: g.hovered });
  }

  firePlayerProjectile(kind: ProjectileKind, dirX: number, dirZ: number, mult: number, o: { pierce?: number; aoe?: number; speed?: number }) {
    const p = this.g.player;
    const forceCrit = p.nextShotCrit && kind === 'arrow';
    if (forceCrit) p.nextShotCrit = false;
    const pr = new Projectile({
      kind, owner: 'player', x: p.x + dirX * 0.6, z: p.z + dirZ * 0.6, dirX, dirZ,
      speed: o.speed ?? 26, dmg: mult, crit: forceCrit, range: this.g.stats.range + 4, pierce: o.pierce, aoe: o.aoe,
    });
    this.z.projectiles.push(pr);
    this.z.group.add(pr.mesh);
  }

  spawnEnemyProjectile(e: Enemy, tx: number, tz: number, speed: number, dmg: number) {
    const dx = tx - e.x, dz = tz - e.z;
    const d = Math.hypot(dx, dz) || 1;
    const pr = new Projectile({ kind: 'rock', owner: 'enemy', x: e.x, z: e.z, dirX: dx / d, dirZ: dz / d, speed, dmg, range: Math.min(14, d + 3), source: e });
    this.z.projectiles.push(pr);
    this.z.group.add(pr.mesh);
    this.g.sfx.play('swing', 0.4, 1.4);
  }

  updateProjectiles(dt: number) {
    const g = this.g, p = g.player;
    for (const pr of this.z.projectiles) {
      pr.step(dt);
      if (pr.o.kind === 'fireball') {
        g.glow.spawn(pr.x, pr.mesh.position.y, pr.z, Math.random() - 0.5, 0.5, Math.random() - 0.5, 0.35, 0.22, Math.random() < 0.5 ? PAL.fire : PAL.ember, 0, 1);
      } else if (pr.o.kind === 'bolt') {
        g.glow.spawn(pr.x, pr.mesh.position.y, pr.z, 0, 0, 0, 0.2, 0.12, PAL.arcane, 0, 0);
      }
      if (pr.o.owner === 'player') {
        for (const e of this.z.enemies) {
          if (e.dead || e.untargetable || pr.hit.has(e)) continue;
          if (Math.hypot(e.x - pr.x, e.z - pr.z) < e.radius + 0.35) {
            pr.hit.add(e);
            if (pr.o.aoe) {
              this.explode(pr.x, pr.z, pr.o.aoe, pr.o.dmg);
              pr.dead = true;
              break;
            }
            this.hitEnemy(e, pr.o.dmg, { kb: pr.o.kind === 'arrow' ? COMBAT_TUNING.knockback.arrow : COMBAT_TUNING.knockback.bolt, fromX: pr.x - pr.o.dirX, fromZ: pr.z - pr.o.dirZ, forceCrit: pr.o.crit });
            if (pr.pierceLeft-- <= 0) {
              pr.dead = true;
              break;
            }
          }
        }
        // step() marks range expiry dead; an enemy impact may already have exploded it.
        if (pr.traveled >= pr.o.range && pr.o.aoe && pr.hit.size === 0) this.explode(pr.x, pr.z, pr.o.aoe, pr.o.dmg);
      } else if (!pr.dead && !p.dead && Math.hypot(p.x - pr.x, p.z - pr.z) < p.radius + 0.3) {
        this.damagePlayer(pr.o.dmg, pr.o.source ?? null);
        pr.dead = true;
      }
      // Projectiles fly over trees and rocks but are stopped by cliffs and walls.
      if (!pr.dead && this.isSolid(pr.x, pr.z)) {
        if (pr.o.aoe) this.explode(pr.x, pr.z, pr.o.aoe, pr.o.dmg);
        pr.dead = true;
      }
    }
    this.z.projectiles = this.z.projectiles.filter((pr) => {
      if (pr.dead) pr.mesh.removeFromParent();
      return !pr.dead;
    });
  }

  private isSolid(x: number, z: number) {
    const cx = Math.floor(x), cz = Math.floor(z);
    const { w, h, cells } = this.z.layout;
    if (cx < 0 || cz < 0 || cx >= w || cz >= h) return true;
    const c = cells[cz * w + cx];
    return c === Cell.Cliff || c === Cell.Wall;
  }

  private explode(x: number, z: number, r: number, mult: number) {
    this.g.sfx.play('explode', 0.7);
    this.g.shake(0.25, 0.25);
    this.g.fx.fireBurst(x, z, r);
    for (const e of this.enemiesInRadius(x, z, r)) this.hitEnemy(e, mult, { kb: COMBAT_TUNING.knockback.explosion, fromX: x, fromZ: z });
  }

  hitEnemy(e: Enemy, mult: number, o: HitOpts) {
    if (e.dead || e.untargetable) return;
    const g = this.g, st = g.stats, T = COMBAT_TUNING;
    const hit = rollHit(Math.random, st.dmgMin, st.dmgMax, mult, st.critChance, st.critMult, o.forceCrit);
    if (g.debug.oneShot) hit.amount = e.hp + 999;
    const dealt = Math.min(e.hp, mitigate(hit.amount, e.def.armor));
    e.hp -= dealt;
    // Each enemy is worth a fixed amount of XP, shared by the fraction of its health you dealt.
    g.prog.combatXp((e.def.xp * dealt) / e.maxHp);
    if (st.lifeOnHit) g.player.hp = Math.min(st.maxHp, g.player.hp + st.lifeOnHit);

    e.flash(1);
    if (e.def.behavior !== 'boss') e.anim.hurt = 1;
    if (o.kb && o.fromX !== undefined && o.fromZ !== undefined) e.knockback(o.fromX, o.fromZ, o.kb * (hit.crit ? T.knockback.critMult : 1));
    // Hit recovery: a heavy blow (or a crit on a regular enemy) makes it flinch and lose its attack.
    const heavy = dealt >= e.maxHp * T.stagger.frac || (hit.crit && !e.def.elite);
    if (heavy && !o.tick && e.hp > 0 && e.def.behavior !== 'boss') e.stagger(g, T.stagger.secs);
    if (!o.tick) g.hitstop(hit.crit ? T.hitstopCrit : T.hitstop);
    g.text.damage(hit.amount, e.x, e.model.height, e.z, hit.crit ? 'crit' : 'dmg');
    const blood = e.def.model === 'goblin' ? 0x5a8a2a : e.def.model === 'cultist' ? 0x5a1a2c : 0xb02a1a;
    g.particles.burst(new THREE.Vector3(e.x, e.model.height * 0.5, e.z), { count: hit.crit ? 10 : 5, color: [blood, 0x3a1a10], speed: 3.5, up: 3, life: 0.5, size: 0.12 });
    if (hit.crit) {
      g.sfx.play('crit', 0.9, 0.9 + Math.random() * 0.2);
      g.shake(0.18, 0.15);
      g.glow.burst(new THREE.Vector3(e.x, e.model.height * 0.6, e.z), { count: 8, color: [0xffffff, 0xffe070], speed: 7, up: 2, life: 0.25, gravity: 0, size: 0.1 });
    } else {
      g.sfx.play('hit', 0.6, 0.9 + Math.random() * 0.25);
    }
    e.setAggro(g);
    if (e.def.elite || e.def.behavior === 'boss') g.ui.showBoss(e);
    if (e.hp <= 0) this.killEnemy(e);
  }

  enemiesInRadius(x: number, z: number, r: number) {
    return this.z.enemies.filter((e) => !e.dead && !e.untargetable && Math.hypot(e.x - x, e.z - z) < r + e.radius);
  }

  enemiesInCone(x: number, z: number, dir: number, r: number, angle: number) {
    const shape: Shape = { kind: 'cone', r, angle, dir };
    return this.z.enemies.filter((e) => !e.dead && !e.untargetable && shapeContains(shape, x, z, e.x, e.z, e.radius));
  }

  nearestEnemy(x: number, z: number, maxR: number, fromX?: number, fromZ?: number, maxFrom?: number, exclude?: Set<Enemy>) {
    let best: Enemy | null = null;
    let bd = maxR;
    for (const e of this.z.enemies) {
      if (e.dead || e.untargetable || exclude?.has(e)) continue;
      if (maxFrom !== undefined && fromX !== undefined && fromZ !== undefined && Math.hypot(e.x - fromX, e.z - fromZ) > maxFrom) continue;
      const d = Math.hypot(e.x - x, e.z - z);
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  }

  inShape(t: Telegraph, u: { x: number; z: number; radius: number }) {
    return shapeContains(t.shape, t.x, t.z, u.x, u.z, u.radius);
  }

  arrowRain(x: number, z: number, r: number, dur: number, mult: number) {
    let tickT = 0;
    const holder = new THREE.Object3D();
    const ring = new THREE.Mesh(new THREE.RingGeometry(r - 0.1, r, 40), new THREE.MeshBasicMaterial({ color: 0xc8f0a0, transparent: true, opacity: 0.6, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.05, z);
    holder.add(ring);
    this.g.fx.add(holder, dur, () => {
      const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * r;
      for (let i = 0; i < 2; i++) this.g.glow.spawn(x + Math.cos(a + i) * rr, 7, z + Math.sin(a + i) * rr, 0, -34, 0, 0.2, 0.09, 0xf8f0d0, 0, 0);
      tickT -= 1 / 60;
      if (tickT <= 0) {
        tickT = 0.3;
        for (const e of this.enemiesInRadius(x, z, r)) this.hitEnemy(e, mult, { tick: true });
        this.g.sfx.play('arrow', 0.5, 0.8 + Math.random() * 0.4);
      }
    });
  }

  private killEnemy(e: Enemy) {
    const g = this.g;
    e.dead = true;
    e.deadT = 0;
    e.anim.attack = -1;
    e.anim.special = -1;
    e.path = [];
    g.sfx.play('enemyDie', 0.8, 0.8 + Math.random() * 0.4);
    const pos = new THREE.Vector3(e.x, e.model.height * 0.5, e.z);
    g.particles.burst(pos, { count: 18, color: [0x3a3030, 0x6a5a50], speed: 5, up: 4, life: 0.8, size: 0.16 });
    g.glow.burst(pos, { count: 10, color: [PAL.ember, PAL.fire], speed: 3, up: 3, life: 0.6, gravity: 1, size: 0.1 });
    if (g.player.cmd.kind === 'attack' && g.player.cmd.target === e) g.player.stop();

    const s = g.save;
    s.kc[e.def.id] = (s.kc[e.def.id] ?? 0) + 1;
    s.stats.kills++;
    g.prog.bump(`kill:${e.def.id}`);
    if (++this.potionProgress >= 6) {
      this.potionProgress = 0;
      if (s.potions < s.potionMax) {
        s.potions++;
        g.text.float('+1 potion', g.player.x, 2.4, g.player.z, 'heal');
      }
    }

    const big = e.def.behavior === 'boss' || !!e.def.elite;
    const drops = rollDrops(Math.random, e.def.drop, big ? e.def.level : e.def.level, g.debug.dropMult);
    for (const item of drops.items) g.items.drop(item, 0, e.x, e.z, big ? 4.5 : 2);
    if (drops.gold) g.items.drop(null, drops.gold, e.x, e.z, big ? 3 : 1.5);
    if (drops.pet) g.items.gainPet(drops.pet);

    if (e.def.behavior === 'boss') this.onBossKilled(e);
    else if (e.def.elite) g.ui.showBoss(null);
    g.story.onKill(e);
    g.dirty = true;
  }

  // ─── Enemy offence ───────────────────────────────────────────────────────

  damagePlayer(amount: number, source: Enemy | null, kb = 0) {
    const g = this.g, p = g.player;
    if (p.dead || p.invulnT > 0) return;
    g.skilling.interrupt();
    if (g.debug.god) {
      g.text.damage(0, p.x, 2.2, p.z, 'hurt');
      return;
    }
    const dmg = mitigate(amount, g.stats.armor);
    p.hp -= dmg;
    p.sinceHit = 0;
    p.flash(0.8);
    p.anim.hurt = 1;
    // Defence trains a little from absorbing hits, on top of stance XP.
    g.prog.grant('defence', Math.max(0, amount - dmg) * XP_TUNING.defencePerAbsorbed);
    g.text.damage(dmg, p.x, 2.2, p.z, 'hurt');
    g.sfx.play('playerHurt', 0.8);
    g.ui.hurtFlash(dmg / g.stats.maxHp);
    if (dmg > g.stats.maxHp * 0.12) g.shake(0.2, 0.2);
    if (kb && source) p.knockback(source.x, source.z, kb);
    if (p.hp <= 0) g.onPlayerDied();
  }

  /** `owner` lets a resetting boss cancel its pending attacks (see onBossDisengage). */
  telegraph(x: number, z: number, shape: Shape, dur: number, onResolve: (t: Telegraph) => void, owner: Enemy | null = null) {
    const t = new Telegraph(x, z, shape, dur, onResolve);
    t.owner = owner;
    this.z.telegraphs.push(t);
    this.z.group.add(t.group);
    return t;
  }

  /** Drop an enemy's pending telegraphs (its attack was interrupted or it reset). */
  cancelTelegraphs(owner: Enemy) {
    for (const t of this.z.telegraphs) if (t.owner === owner) t.done = true;
  }

  updateTelegraphs(dt: number) {
    for (const t of this.z.telegraphs) t.update(dt);
    this.z.telegraphs = this.z.telegraphs.filter((t) => {
      if (t.done) {
        t.group.removeFromParent();
        t.dispose();
      }
      return !t.done;
    });
  }

  hazard(x: number, z: number, shape: Shape, dur: number, tick: number, dmg: number, source: Enemy) {
    this.z.hazards.push({ x, z, shape, t: 0, dur, tick, tickT: 0, dmg, source });
  }

  updateHazards(dt: number) {
    const g = this.g, p = g.player;
    for (const h of this.z.hazards) {
      h.t += dt;
      h.tickT -= dt;
      if (h.shape.kind === 'cone') {
        const { r, angle, dir } = h.shape;
        h.emit = (h.emit ?? 0) + dt * BREATH_RATE;
        const count = Math.floor(h.emit);
        h.emit -= count;
        for (let i = 0; i < count; i++) {
          const a = dir + (Math.random() - 0.5) * angle * 0.9;
          const sp = 12 + Math.random() * 6;
          g.glow.spawn(h.x, 1.4, h.z, Math.cos(a) * sp, (Math.random() - 0.3) * 2, Math.sin(a) * sp, (r / sp) * (0.8 + Math.random() * 0.3), 0.3 + Math.random() * 0.3, [PAL.fire, PAL.ember, 0xff3a0a][i % 3], 0, 0.3);
        }
      }
      if (h.tickT <= 0) {
        h.tickT = h.tick;
        if (shapeContains(h.shape, h.x, h.z, p.x, p.z, p.radius)) this.damagePlayer(h.dmg, h.source);
      }
    }
    this.z.hazards = this.z.hazards.filter((h) => h.t < h.dur);
  }

  meteor(x: number, z: number, source: Enemy) {
    const g = this.g;
    // A burning basalt rock: dark faces with a molten glow (lit, so it reads as a solid lump rather
    // than a flat disc), a hot additive halo for bloom, spinning as it falls.
    const rock = new THREE.Group();
    rock.add(new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.55, 0),
      new THREE.MeshStandardMaterial({ color: 0x2a1a14, emissive: 0xff4a10, emissiveIntensity: 0.9, roughness: 0.8, flatShading: true }),
    ));
    const halo = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.85, 1),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(PAL.fire).multiplyScalar(1.2), transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    rock.add(halo);
    rock.position.set(x, 14, z);
    const dur = COMBAT_TUNING.boss.meteor;
    this.telegraph(x, z, { kind: 'circle', r: 1.7 }, dur, () => {
      g.fx.fireBurst(x, z, 1.7);
      g.sfx.play('explode', 0.5, 1.2);
      g.shake(0.15, 0.15);
      if (Math.hypot(g.player.x - x, g.player.z - z) < 1.7 + g.player.radius * 0.6) this.damagePlayer(12, source);
    }, source);
    // Trail emission follows the effect's age (180 particles/s): the same density at any frame
    // rate, and nothing while paused.
    let emitted = 0;
    g.fx.add(rock, dur, (f) => {
      rock.position.y = 0.3 + 14 * f;
      rock.rotation.set(f * 9, f * 6, 0);
      halo.scale.setScalar(0.9 + Math.sin(f * 40) * 0.1);
      const due = Math.floor((1 - f) * dur * METEOR_TRAIL_RATE + 1e-6);
      for (let k = emitted; k < due; k++) {
        g.glow.spawn(rock.position.x + (Math.random() - 0.5) * 0.5, rock.position.y + 0.3, rock.position.z + (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.6, 3 + Math.random() * 2, (Math.random() - 0.5) * 0.6, 0.35 + Math.random() * 0.2, 0.22 + Math.random() * 0.2, k % 3 ? PAL.ember : PAL.fire, 0, 0.5);
      }
      emitted = Math.max(emitted, due);
    });
  }

  // ─── Spawning ────────────────────────────────────────────────────────────

  spawnEnemy(defId: string, x: number, z: number, pack: PackState | null, aggro = false) {
    const spot = this.z.nav.nearestWalkable(x, z) ?? { x, z };
    const e = new Enemy(defId, spot.x, spot.z, pack);
    this.z.enemies.push(e);
    this.z.group.add(e.obj);
    if (e.def.behavior === 'boss') e.boss = newBossState();
    if (aggro) e.setAggro(this.g);
    return e;
  }

  spawnPack(pack: PackState) {
    pack.members = pack.comp.map((id, i) => {
      const a = (i / pack.comp.length) * Math.PI * 2 + Math.random() * 0.5;
      const r = 1.5 + Math.random() * 2.5;
      return this.spawnEnemy(id, pack.x + Math.cos(a) * r, pack.z + Math.sin(a) * r, pack);
    });
  }

  separateUnits() {
    const list = this.z.enemies.filter((e) => !e.dead);
    const p = this.g.player;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        const dx = b.x - a.x, dz = b.z - a.z;
        const min = a.radius + b.radius;
        const d2 = dx * dx + dz * dz;
        if (d2 < min * min && d2 > 1e-6) {
          const d = Math.sqrt(d2), push = (min - d) / 2;
          const wa = a.def.behavior === 'boss' ? 0 : 1, wb = b.def.behavior === 'boss' ? 0 : 1;
          a.pos.x -= (dx / d) * push * wa;
          a.pos.z -= (dz / d) * push * wa;
          b.pos.x += (dx / d) * push * wb;
          b.pos.z += (dz / d) * push * wb;
        }
      }
      if (!p.dead && !a.untargetable) {
        const dx = a.x - p.x, dz = a.z - p.z;
        const min = a.radius + p.radius;
        const d2 = dx * dx + dz * dz;
        if (d2 < min * min && d2 > 1e-6) {
          const d = Math.sqrt(d2);
          if (a.def.behavior === 'boss') {
            p.pos.x -= (dx / d) * (min - d);
            p.pos.z -= (dz / d) * (min - d);
          } else {
            a.pos.x += (dx / d) * (min - d);
            a.pos.z += (dz / d) * (min - d);
          }
        }
      }
    }
  }

  // ─── Boss hooks ──────────────────────────────────────────────────────────

  onBossEngage(e: Enemy) {
    const g = this.g;
    this.bossEngagedAt = g.time;
    g.announce('Cinderwing awakens!', 'boss');
    g.sfx.play('roar');
    g.shake(0.4, 0.9);
    g.ui.showBoss(e);
  }

  onBossDisengage(e: Enemy) {
    // A full reset: pending telegraphs never resolve and lingering breath/fire stops hurting.
    this.cancelTelegraphs(e);
    this.z.hazards = this.z.hazards.filter((h) => h.source !== e);
    this.g.ui.showBoss(null);
    if (!this.g.player.dead) this.g.announce('Cinderwing loses interest and returns to its roost.', 'info');
  }

  private onBossKilled(e: Enemy) {
    const g = this.g, s = g.save;
    const kc = s.kc[e.def.id];
    const secs = g.time - this.bossEngagedAt;
    const pb = s.stats.bestBossTime === null || secs < s.stats.bestBossTime;
    if (pb) s.stats.bestBossTime = secs;
    const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
    g.announce(`Your Cinderwing kill count is: ${kc}.`, 'boss');
    g.announce(`Fight duration: ${fmt(secs)}${pb ? ' (new personal best)' : ''}`, 'info');
    g.ui.showBoss(null);
    g.sfx.play('roar', 0.7, 0.7);
    g.shake(0.8, 1);
    g.hitstop(0.25);
    g.fx.fireBurst(e.x, e.z, 5);
    g.story.checkDiary();
  }
}
