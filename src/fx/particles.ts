import * as THREE from 'three';
import { SpriteLayer } from './sprites';
import type { SheetId } from './sheets';

/**
 * Particles in two kinds, each one pool and one draw:
 * - glow (additive): painted light, drawn on the graphics card (sprites.ts) from the painted shapes on page A: a soft
 *   mote, a four-pointed glint, a flame, an ice shard. A mote moving fast streaks along its flight, as sparks do.
 * - solid: chunky chips of stone, wood or bone, lit by the sun like the world around them, tumbling as they fly and
 *   bouncing to rest on the ground.
 */

/** A glow particle's shape. */
export type GlowKind = 'mote' | 'spark' | 'glint' | 'flame' | 'shard';

export interface BurstOpts {
  count: number;
  color: number | number[];
  speed?: number;
  up?: number;
  life?: number;
  size?: number;
  gravity?: number;
  drag?: number;
  spread?: number;
  kind?: GlowKind;
}

/**
 * How each shape is drawn: its painted cell, its card's width for a particle of size 1 (the painted shape fills part
 * of its cell), how much it streaks along its flight, how hot its middle burns (bloom), how fast it spins.
 */
const GLOW: Record<GlowKind, { sheet: SheetId; scale: number; stretch: number; heat: number; spin: number; tint: number }> = {
  mote: { sheet: 'mote', scale: 2.8, stretch: 0.025, heat: 0.7, spin: 0, tint: 1.3 },
  spark: { sheet: 'mote', scale: 2.2, stretch: 0.07, heat: 1.6, spin: 0, tint: 1.6 },
  glint: { sheet: 'glint', scale: 4.2, stretch: 0, heat: 1.0, spin: 1.2, tint: 1.4 },
  flame: { sheet: 'flame', scale: 2.8, stretch: 0, heat: 0.25, spin: 0, tint: 0.8 },
  shard: { sheet: 'shard', scale: 3.6, stretch: 0.01, heat: 0.4, spin: 0, tint: 1.3 },
};

/** Where the ground is under a point (the particles' floor; set by the effects for the current zone). */
export type GroundAt = (x: number, z: number) => number;

/** A chip: an irregular faceted lump, flat-shaded so its faces catch the light. */
function chipGeometry() {
  const g = new THREE.IcosahedronGeometry(0.5, 0);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    // (Fixed, per-corner squash and push, so the chips read as broken bits rather than balls.)
    const h = Math.sin(i * 12.9898) * 43758.5453;
    const k = 0.75 + (h - Math.floor(h)) * 0.5;
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.62, p.getZ(i) * k * 0.85);
  }
  g.computeVertexNormals();
  return g;
}

export class Particles {
  readonly mesh: THREE.Object3D;
  /** The floor under a point; particles with gravity come to rest on it. */
  ground: GroundAt = () => 0;
  private readonly glow: SpriteLayer | null;
  private readonly chips: Chips | null;
  private readonly col = new THREE.Color();

  constructor(max: number, additive: boolean) {
    this.glow = additive ? new SpriteLayer('a', max) : null;
    this.chips = additive ? null : new Chips(max);
    this.mesh = (this.glow?.mesh ?? this.chips!.mesh) as THREE.Object3D;
  }

  spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, color: number, gravity = 0, drag = 0, kind: GlowKind = 'mote') {
    if (this.chips) {
      this.chips.spawn(x, y, z, vx, vy, vz, life, size, color, gravity, drag, this.ground(x, z) + 0.05);
      return;
    }
    const k = GLOW[kind];
    this.col.setHex(color).multiplyScalar(k.tint);
    this.glow!.spawn({
      x, y, z, vx, vy, vz, drag, gravity, life,
      floor: gravity > 0 ? this.ground(x, z) + 0.05 : undefined,
      size: size * k.scale, grow: 0.55, fadeOut: 0.6, stretch: k.stretch, heat: k.heat,
      rot: Math.random() * Math.PI * 2, spin: (Math.random() - 0.5) * 2 * k.spin,
      color: this.col, sheet: k.sheet,
    });
  }

  burst(pos: THREE.Vector3, o: BurstOpts) {
    const colors = Array.isArray(o.color) ? o.color : [o.color];
    const speed = o.speed ?? 4;
    for (let k = 0; k < o.count; k++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * (o.spread ?? 1);
      const sp = speed * (0.4 + Math.random() * 0.8);
      this.spawn(
        pos.x + Math.cos(a) * r * 0.3, pos.y, pos.z + Math.sin(a) * r * 0.3,
        Math.cos(a) * sp, (o.up ?? 3) * (0.5 + Math.random()), Math.sin(a) * sp,
        (o.life ?? 0.6) * (0.6 + Math.random() * 0.8), (o.size ?? 0.15) * (0.6 + Math.random() * 0.8),
        colors[k % colors.length], o.gravity ?? 9, o.drag ?? 1.5, o.kind,
      );
    }
  }

  /** Drop every live particle (zone change: effects never carry over). */
  clear() {
    this.glow?.clear();
    this.chips?.clear();
  }

  update(dt: number) {
    this.glow?.update(dt);
    this.chips?.update(dt);
  }
}

/** The solid chips: simulated here (they bounce and settle), drawn as one lit instanced mesh. */
class Chips {
  readonly mesh: THREE.InstancedMesh;
  private n = 0;
  private p: Float32Array;
  private v: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private size: Float32Array;
  private grav: Float32Array;
  private drag: Float32Array;
  private floor: Float32Array;
  private spin: Float32Array;
  private axis: Float32Array;
  private col: Float32Array;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3();
  private t = new THREE.Vector3();
  private ax = new THREE.Vector3();
  private c = new THREE.Color();

  constructor(private max: number) {
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0, flatShading: true });
    this.mesh = new THREE.InstancedMesh(chipGeometry(), mat, max);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.name = 'fx-chips';
    this.p = new Float32Array(max * 3);
    this.v = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.size = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.floor = new Float32Array(max);
    this.spin = new Float32Array(max);
    this.axis = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
  }

  spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, color: number, gravity: number, drag: number, floor: number) {
    if (this.n >= this.max) return;
    const i = this.n++;
    this.p.set([x, y, z], i * 3);
    this.v.set([vx, vy, vz], i * 3);
    this.life[i] = this.maxLife[i] = life;
    this.size[i] = size;
    this.grav[i] = gravity;
    this.drag[i] = drag;
    this.floor[i] = floor;
    this.spin[i] = 4 + Math.random() * 10;
    this.ax.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
    this.axis.set([this.ax.x, this.ax.y, this.ax.z], i * 3);
    this.c.setHex(color);
    // (A little light and dark between chips, as broken stone and wood vary.)
    const shade = 0.85 + Math.random() * 0.3;
    this.col.set([this.c.r * shade, this.c.g * shade, this.c.b * shade], i * 3);
  }

  clear() {
    this.n = 0;
    this.mesh.count = 0;
  }

  update(dt: number) {
    let i = 0;
    while (i < this.n) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.n--;
        this.copy(this.n, i);
        continue;
      }
      const j = i * 3;
      const d = Math.max(0, 1 - this.drag[i] * dt);
      this.v[j] *= d;
      this.v[j + 1] = this.v[j + 1] * d - this.grav[i] * dt;
      this.v[j + 2] *= d;
      this.p[j] += this.v[j] * dt;
      this.p[j + 1] += this.v[j + 1] * dt;
      this.p[j + 2] += this.v[j + 2] * dt;
      if (this.p[j + 1] < this.floor[i] && this.grav[i] > 0) {
        // A bounce that soon settles: most of its speed lost, its tumble slowing.
        this.p[j + 1] = this.floor[i];
        this.v[j + 1] *= -0.3;
        this.v[j] *= 0.5;
        this.v[j + 2] *= 0.5;
        this.spin[i] *= 0.5;
      }
      const f = this.life[i] / this.maxLife[i];
      const sc = this.size[i] * Math.min(1, f * 4);
      this.ax.set(this.axis[j], this.axis[j + 1], this.axis[j + 2]);
      this.q.setFromAxisAngle(this.ax, (this.maxLife[i] - this.life[i]) * this.spin[i]);
      this.s.set(sc, sc, sc);
      this.t.set(this.p[j], this.p[j + 1] + sc * 0.3, this.p[j + 2]);
      this.m.compose(this.t, this.q, this.s);
      this.mesh.setMatrixAt(i, this.m);
      this.c.setRGB(this.col[j], this.col[j + 1], this.col[j + 2]);
      this.mesh.setColorAt(i, this.c);
      i++;
    }
    this.mesh.count = this.n;
    // (Only the live chips are sent.)
    for (const a of [this.mesh.instanceMatrix, this.mesh.instanceColor!]) {
      a.clearUpdateRanges();
      if (this.n) a.addUpdateRange(0, this.n * a.itemSize);
      a.needsUpdate = this.n > 0;
    }
  }

  private copy(from: number, to: number) {
    if (from === to) return;
    for (let k = 0; k < 3; k++) {
      this.p[to * 3 + k] = this.p[from * 3 + k];
      this.v[to * 3 + k] = this.v[from * 3 + k];
      this.col[to * 3 + k] = this.col[from * 3 + k];
      this.axis[to * 3 + k] = this.axis[from * 3 + k];
    }
    this.life[to] = this.life[from];
    this.maxLife[to] = this.maxLife[from];
    this.size[to] = this.size[from];
    this.grav[to] = this.grav[from];
    this.drag[to] = this.drag[from];
    this.floor[to] = this.floor[from];
    this.spin[to] = this.spin[from];
  }
}
