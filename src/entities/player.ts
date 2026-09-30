import { BASES } from '../data/items';
import { COMBAT_TUNING } from '../data/tuning';
import type { AttackKind } from '../render/anim';
import { BowDraw } from '../render/bowDraw';
import { HeroDresser, makeModel } from '../render/registry';
import type { Style } from '../types';
import type { Game } from '../game';
import type { Enemy } from './enemy';
import type { GroundItem } from './groundItem';
import type { Interactable } from './interactable';
import { Unit } from './unit';

export type Command =
  | { kind: 'none' }
  | { kind: 'move'; x: number; z: number }
  /** `hold`: keep swinging (mouse held); otherwise walk into range, swing once and stop. */
  | { kind: 'attack'; target: Enemy; hold: boolean }
  | { kind: 'pickup'; item: GroundItem }
  | { kind: 'interact'; target: Interactable };

export interface Action {
  t: number;
  dur: number;
  hitAt: number;
  done: boolean;
  kind: AttackKind;
  onHit: () => void;
}

export interface Dash {
  fx: number;
  fz: number;
  tx: number;
  tz: number;
  t: number;
  dur: number;
  height: number;
  onEnd?: () => void;
}

export const ATTACK_ANIM: Record<Style, AttackKind> = { melee: 'swing', ranged: 'bow', magic: 'cast' };

export class Player extends Unit {
  cmd: Command = { kind: 'none' };
  /** A command issued mid-leap/roll, applied (and re-pathed) on landing. */
  queued: Command | null = null;
  action: Action | null = null;
  dash: Dash | null = null;
  attackCd = 0;
  /** Basic attacks started, ever (lets a click tell whether its swing has begun). */
  swings = 0;
  cds: Record<string, number> = {};
  invulnT = 0;
  nextShotCrit = false;
  warCryT = 0;
  weakenedT = 0;
  healT = 0;
  healRate = 0;
  potionCd = 0;
  sinceHit = 99;
  repathT = 0;
  deadT = 0;
  style: Style = 'melee';
  readonly dresser: HeroDresser;
  readonly bow: BowDraw;
  private tool: string | null = null;
  private g: Game | null = null;

  constructor() {
    super(makeModel('hero'), 0.45, 100);
    this.turnSpeed = COMBAT_TUNING.hero.turnSpeed;
    this.dresser = new HeroDresser(this.model);
    this.bow = new BowDraw(this.model.root);
  }

  bind(g: Game) {
    this.g = g;
  }

  setStyle(style: Style) {
    this.style = style;
  }

  /** Re-dress from the save: appearance + gear, or a tool (pickaxe) while skilling. */
  dress() {
    const g = this.g;
    if (!g) return;
    const tool = this.tool ? BASES[this.tool] : null;
    this.dresser.dress(g.save.character, g.save.equipment, tool ? { weaponModel: tool.model, weaponPalette: tool.palette } : undefined);
    this.bow.attach();
  }

  toolOverride(baseId: string | null) {
    if (this.tool === baseId) return;
    this.tool = baseId;
    this.dress();
  }

  private setCmd(c: Command) {
    if (this.dash) {
      this.queued = c;
      return;
    }
    this.g?.skilling.stop();
    this.cmd = c;
    this.path = [];
    this.repathT = 0;
  }

  moveTo(g: Game, x: number, z: number) {
    if (this.dash) {
      this.queued = { kind: 'move', x, z };
      return;
    }
    g.skilling.stop();
    this.cmd = { kind: 'move', x, z };
    this.path = g.zone.nav.findPath(this.x, this.z, x, z) ?? [];
    this.repathT = 0.12;
  }

  attack(target: Enemy, hold = false) {
    if (this.cmd.kind === 'attack' && this.cmd.target === target) {
      this.cmd.hold = hold;
      return;
    }
    this.setCmd({ kind: 'attack', target, hold });
  }

  pickup(item: GroundItem) {
    this.setCmd({ kind: 'pickup', item });
  }

  interact(target: Interactable) {
    if (this.cmd.kind === 'interact' && this.cmd.target === target && this.g?.skilling.busy) return;
    this.setCmd({ kind: 'interact', target });
  }

  stop() {
    this.cmd = { kind: 'none' };
    this.path = [];
  }

  /**
   * True while a leap/roll or an attack/cast animation commits the player. Swings are committed
   * start to finish (Diablo 2 style): orders given meanwhile wait and run as soon as it ends.
   */
  get rooted() {
    return !!this.dash || !!this.action;
  }

  update(dt: number, g: Game) {
    if (this.dead) {
      this.deadT += dt;
      this.anim.dead = this.deadT;
      this.updateCommon(dt, g.zone.nav);
      return;
    }
    const st = g.stats;
    this.attackCd -= dt;
    this.potionCd -= dt;
    this.invulnT -= dt;
    this.sinceHit += dt;
    for (const k in this.cds) this.cds[k] = Math.max(0, this.cds[k] - dt);
    if (this.warCryT > 0 && (this.warCryT -= dt) <= 0) g.prog.recomputeStats();
    if (this.weakenedT > 0 && (this.weakenedT -= dt) <= 0) g.prog.recomputeStats();

    // Regen: base + a strong out-of-combat regen so downtime is short (forgiving by design).
    let regen = st.regen + (this.sinceHit > 4 ? st.maxHp * 0.04 : 0);
    if (this.healT > 0) {
      this.healT -= dt;
      regen += this.healRate;
    }
    this.hp = Math.min(st.maxHp, this.hp + regen * dt);

    let moved = 0;
    if (this.dash) {
      moved = this.updateDash(dt, g);
    } else {
      if (this.action) {
        const a = this.action;
        a.t += dt / a.dur;
        this.anim.attack = Math.min(1, a.t);
        this.anim.attackKind = a.kind;
        if (!a.done && a.t >= a.hitAt) {
          a.done = true;
          a.onHit();
        }
        if (a.t >= 1) {
          this.action = null;
          this.anim.attack = -1;
        }
      }
      if (!this.rooted && !g.skilling.busy) moved = this.updateCommand(dt, g);
    }
    this.anim.speed = dt > 0 ? moved / dt : 0;
    this.updateCommon(dt, g.zone.nav);
    this.bow.update(this.anim, this.dresser.socket('sock_handL'));
  }

  private updateDash(dt: number, g: Game) {
    const d = this.dash!;
    d.t += dt / d.dur;
    const t = Math.min(1, d.t);
    const px = this.x, pz = this.z;
    this.pos.x = d.fx + (d.tx - d.fx) * t;
    this.pos.z = d.fz + (d.tz - d.fz) * t;
    this.model.root.position.y = Math.sin(t * Math.PI) * d.height;
    g.zone.nav.resolveCircle(this.pos, this.radius * 0.8);
    if (t >= 1) {
      this.dash = null;
      this.model.root.position.y = 0;
      d.onEnd?.();
      // Apply whatever the player clicked mid-air, pathing from where we actually landed.
      const q = this.queued;
      this.queued = null;
      if (q?.kind === 'move') this.moveTo(g, q.x, q.z);
      else if (q) this.setCmd(q);
    }
    return Math.hypot(this.x - px, this.z - pz);
  }

  private updateCommand(dt: number, g: Game): number {
    const st = g.stats;
    const speed = st.moveSpeed * this.speedMult;
    const cmd = this.cmd;
    switch (cmd.kind) {
      case 'none':
        return 0;
      case 'move': {
        const moved = this.followPath(dt, speed, g.zone.nav);
        if (!this.path.length) this.cmd = { kind: 'none' };
        return moved;
      }
      case 'pickup': {
        const it = cmd.item;
        if (it.gone) {
          this.stop();
          return 0;
        }
        if (this.distTo(it) < 1.3) {
          g.items.pickup(it);
          this.stop();
          return 0;
        }
        return this.approach(dt, g, it.x, it.z, speed);
      }
      case 'interact': {
        const t = cmd.target;
        if (this.distTo(t) <= t.reach + this.radius) {
          this.stop();
          this.faceTo(t.x, t.z, true);
          if (t.kind === 'rock') g.skilling.startMining(t);
          else g.story.useStation(t);
          return 0;
        }
        return this.approach(dt, g, t.x, t.z, speed);
      }
      case 'attack': {
        const t = cmd.target;
        if (t.dead || t.untargetable) {
          this.stop();
          return 0;
        }
        const reach = st.range + t.radius;
        const dist = this.distTo(t);
        if (dist <= reach) {
          this.path = [];
          this.faceTo(t.x, t.z);
          if (this.attackCd <= 0 && !this.action) {
            g.combat.startBasicAttack(t);
            if (!cmd.hold) this.stop();
          }
          return 0;
        }
        return this.approach(dt, g, t.x, t.z, speed);
      }
    }
  }

  private approach(dt: number, g: Game, tx: number, tz: number, speed: number) {
    const nav = g.zone.nav;
    this.repathT -= dt;
    if (nav.lineClear(this.x, this.z, tx, tz, 0.3)) {
      this.path = [];
      return this.moveToward(dt, tx, tz, speed, nav);
    }
    if (this.repathT <= 0 || !this.path.length) {
      this.path = nav.findPath(this.x, this.z, tx, tz) ?? [];
      this.repathT = 0.3;
    }
    return this.followPath(dt, speed, nav);
  }
}
