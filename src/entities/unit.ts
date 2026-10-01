import * as THREE from 'three';
import { Rig, newAnimState, type AnimState } from '../render/anim';
import { setFlash, type Model } from '../render/kit';
import { COMBAT_TUNING } from '../data/tuning';
import type { NavGrid } from '../world/navgrid';
import type { Vec2 } from '../types';

/** Shared movement, knockback, facing and hit-flash for the player and enemies. */
export class Unit {
  readonly obj = new THREE.Group();
  readonly rig: Rig;
  readonly anim: AnimState = newAnimState();
  facing = 0;
  targetFacing = 0;
  turnSpeed = 14;
  hp: number;
  dead = false;
  flashT = 0;
  slowT = 0;
  slowAmt = 0;
  kbx = 0;
  kbz = 0;
  kbResist = 0;
  kbDecay = COMBAT_TUNING.knockback.decay;
  path: Vec2[] = [];

  constructor(public model: Model, public radius: number, public maxHp: number) {
    this.hp = maxHp;
    this.obj.add(model.root);
    this.rig = new Rig(model.root);
  }

  get pos() {
    return this.obj.position;
  }

  get x() {
    return this.obj.position.x;
  }

  get z() {
    return this.obj.position.z;
  }

  distTo(o: { x: number; z: number }) {
    return Math.hypot(o.x - this.x, o.z - this.z);
  }

  faceTo(x: number, z: number, instant = false) {
    const dx = x - this.x, dz = z - this.z;
    if (dx * dx + dz * dz < 1e-6) return;
    this.targetFacing = Math.atan2(dx, dz);
    if (instant) this.facing = this.targetFacing;
  }

  /** Direction angle in XZ (atan2(dz, dx)) of the current facing — for telegraph shapes. */
  get dirAngle() {
    return Math.atan2(Math.cos(this.facing), Math.sin(this.facing));
  }

  flash(amount = 1) {
    this.flashT = Math.max(this.flashT, amount);
  }

  knockback(fromX: number, fromZ: number, force: number) {
    const dx = this.x - fromX, dz = this.z - fromZ;
    const d = Math.hypot(dx, dz) || 1;
    const f = force * (1 - this.kbResist);
    this.kbx += (dx / d) * f;
    this.kbz += (dz / d) * f;
  }

  slow(amount: number, time: number) {
    this.slowAmt = Math.max(this.slowAmt, amount);
    this.slowT = Math.max(this.slowT, time);
  }

  get speedMult() {
    return this.slowT > 0 ? 1 - this.slowAmt : 1;
  }

  /** Move along `path` at `speed`. Returns distance actually moved. */
  followPath(dt: number, speed: number, nav: NavGrid): number {
    if (!this.path.length) return 0;
    let remaining = speed * dt;
    let moved = 0;
    while (remaining > 0 && this.path.length) {
      const wp = this.path[0];
      const dx = wp.x - this.x, dz = wp.z - this.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.05) {
        this.path.shift();
        continue;
      }
      const step = Math.min(d, remaining);
      this.pos.x += (dx / d) * step;
      this.pos.z += (dz / d) * step;
      this.faceTo(wp.x, wp.z);
      remaining -= step;
      moved += step;
      if (step >= d - 1e-4) this.path.shift();
    }
    nav.resolveCircle(this.pos, this.radius * 0.8);
    return moved;
  }

  /** Straight-line move toward a point, sliding along walls. */
  moveToward(dt: number, tx: number, tz: number, speed: number, nav: NavGrid): number {
    const dx = tx - this.x, dz = tz - this.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.01) return 0;
    const step = Math.min(d, speed * dt);
    this.pos.x += (dx / d) * step;
    this.pos.z += (dz / d) * step;
    this.faceTo(tx, tz);
    nav.resolveCircle(this.pos, this.radius * 0.8);
    return step;
  }

  updateCommon(dt: number, nav: NavGrid) {
    this.pos.y = nav.y(this.pos.x, this.pos.z);
    if (this.kbx || this.kbz) {
      this.pos.x += this.kbx * dt;
      this.pos.z += this.kbz * dt;
      const decay = Math.exp(-dt * this.kbDecay);
      this.kbx *= decay;
      this.kbz *= decay;
      if (Math.abs(this.kbx) + Math.abs(this.kbz) < 0.05) this.kbx = this.kbz = 0;
      nav.resolveCircle(this.pos, this.radius * 0.8);
    }
    let diff = this.targetFacing - this.facing;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.facing += diff * Math.min(1, dt * this.turnSpeed);
    this.obj.rotation.y = this.facing;

    if (this.slowT > 0) {
      this.slowT -= dt;
      if (this.slowT <= 0) this.slowAmt = 0;
    }
    if (this.flashT > 0) {
      this.flashT = Math.max(0, this.flashT - dt * 6);
      setFlash(this.model, this.flashT, this.slowT > 0 ? 0x9fe4ff : 0xffffff);
    } else if (this.slowT > 0) {
      setFlash(this.model, 0.35, 0x6ac8ff);
    } else {
      setFlash(this.model, 0);
    }
    this.anim.hurt = Math.max(0, this.anim.hurt - dt * 4);
    this.rig.update(dt, this.anim);
  }
}
