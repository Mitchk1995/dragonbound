import * as THREE from 'three';
import type { Enemy } from '../entities/enemy';
import type { ProjectileKind } from '../entities/projectile';
import { MeshFx } from '../fx/meshFx';
import type { GlowKind } from '../fx/particles';
import { SHEETS, type PageId, type SheetId } from '../fx/sheets';
import { SpriteLayer, type SpriteSpawn } from '../fx/sprites';
import { preloadEffectTextures } from '../fx/textures';
import type { Game } from '../game';
import { PAL } from '../render/kit';
import { disposeObject } from '../render/resources';

/**
 * The game's visual effects, each built the way an effects artist layers one: a painted flipbook burst on a card
 * facing the camera (impact, explosion, frost, crackle, smoke), mesh effects with scrolling, eroding paint (slashes,
 * shockwaves, magic circles, light pillars, lightning), and particles (sparks streaking, glints, flames, ice shards,
 * blood, chips of stone). Bright parts burn above white so the bloom catches them.
 *
 * The cards and meshes live in the scene for the session (pools, reused); `add` hangs a caller's own object on the
 * current zone, so it is cleaned up on travel.
 */

interface FxMesh {
  obj: THREE.Object3D;
  life: number;
  max: number;
  tick?: (f: number, obj: THREE.Object3D) => void;
}

/** The burst cards' pools: how many each holds (the oldest is reused when full). */
const LAYERS: [PageId, number][] = [['impact', 48], ['crit', 24], ['explosion', 16], ['frost', 12], ['teleport', 8], ['b', 256], ['c', 768]];

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(xs: readonly T[]) => xs[Math.floor(Math.random() * xs.length)];
const lin = (hex: number, k = 1) => new THREE.Color(hex).multiplyScalar(k);

/** Each creature's blood (the painted drops are grey: this is their colour). */
const BLOOD: Record<string, number> = { goblin: 0x5a8a2a, cultist: 0x6a1a30, priest: 0x6a1a30 };

export class Fx {
  private list: FxMesh[] = [];
  private cards: Record<string, SpriteLayer> | null = null;
  private meshes: MeshFx | null = null;
  private readonly v = new THREE.Vector3();
  /**
   * The game time a spell's own burst went off (fireBurst, frostNova, lightning, slam, warCry): the blows it lands in
   * that same moment show no impact flash of their own (the spell's burst is their flash), only sparks and blood.
   */
  private burstAt = -1;

  constructor(private g: Game) {
    preloadEffectTextures();
    // Particles that fall come to rest on the ground of the zone they fly in.
    const ground = (x: number, z: number) => g.zoneOrNull?.groundY(x, z) ?? 0;
    for (const p of [g.particles, g.glow]) if (p) p.ground = ground;
  }

  /** The pools, made on first use (and in the scene from then on). */
  private get layers() {
    if (!this.cards) {
      this.cards = Object.fromEntries(LAYERS.map(([page, max]) => [page, new SpriteLayer(page, max)]));
      for (const l of Object.values(this.cards)) this.g.scene.add(l.mesh);
      this.meshes = new MeshFx();
      this.g.scene.add(this.meshes.root);
    }
    return this.cards;
  }

  private get mesh() {
    void this.layers;
    return this.meshes!;
  }

  /** A burst card from a sheet (its page's pool). */
  private card(sheet: SheetId, s: Omit<SpriteSpawn, 'sheet'>) {
    this.layers[SHEETS[sheet].page].spawn({ ...s, sheet });
  }

  add(obj: THREE.Object3D, life: number, tick?: FxMesh['tick']) {
    this.g.zone.group.add(obj);
    this.list.push({ obj, life, max: life, tick });
  }

  clear() {
    for (const f of this.list) disposeObject(f.obj);
    this.list = [];
    if (this.cards) for (const l of Object.values(this.cards)) l.clear();
    this.meshes?.clear();
  }

  update(dt: number) {
    for (const f of this.list) {
      f.life -= dt;
      f.tick?.(Math.max(0, f.life / f.max), f.obj);
    }
    this.list = this.list.filter((f) => {
      if (f.life <= 0) disposeObject(f.obj);
      return f.life > 0;
    });
    if (this.cards) for (const l of Object.values(this.cards)) l.update(dt);
    this.meshes?.update(dt);
  }

  private groundY(x: number, z: number) {
    return this.g.zoneOrNull?.groundY(x, z) ?? 0;
  }

  /** A point `d` toward the camera from (x, y, z): where a burst card stands so the body it bursts from never hides it. */
  private front(x: number, y: number, z: number, d: number) {
    const c = this.g.camera.position;
    this.v.set(c.x - x, c.y - y, c.z - z).normalize().multiplyScalar(d);
    return this.v.set(this.v.x + x, this.v.y + y, this.v.z + z);
  }

  /** Glow particles thrown out from a point, `n` of them, in a cone of half-angle `spread` round `dir` (or all round). */
  private spray(x: number, y: number, z: number, n: number, o: { speed: [number, number]; up: [number, number]; life: [number, number]; size: [number, number]; colors: number[]; kind?: GlowKind; gravity?: number; drag?: number; dir?: number; spread?: number }) {
    for (let i = 0; i < n; i++) {
      const a = o.dir === undefined ? Math.random() * Math.PI * 2 : o.dir + (Math.random() - 0.5) * 2 * (o.spread ?? 1);
      const sp = rand(...o.speed);
      this.g.glow.spawn(x, y, z, Math.cos(a) * sp, rand(...o.up), Math.sin(a) * sp, rand(...o.life), rand(...o.size), pick(o.colors), o.gravity ?? 0, o.drag ?? 0, o.kind ?? 'spark');
    }
  }

  // ─── Combat ────────────────────────────────────────────────────────────────

  /** The click-to-move marker: a small ring settling on the ground. */
  moveMarker(x: number, z: number) {
    this.mesh.decal({ kind: 'ring', x, y: this.groundY(x, z) + 0.05, z, from: 1.1, to: 0.7, life: 0.35, color: 0x9fe070, gain: 1.2, fadeIn: 0.01 });
  }

  /**
   * A weapon's slash round the hero at (x, z), toward `dir`: a crescent swept through `angle`, out to `r`, its edge
   * burning white, its tail breaking into wisps.
   */
  arc(x: number, z: number, dir: number, r: number, angle: number, color: number) {
    this.mesh.slash({ x, y: this.groundY(x, z) + 0.95, z, dir, sweep: angle, r0: r * 0.55, r1: r, tilt: 0.45, color, gain: 1.0 });
  }

  /**
   * A blow landing on `e`, struck from (fromX, fromZ): a painted impact flash on the struck side (a bigger, redder
   * burst and a shock ring for a crit), sparks streaking away from the blow, and the creature's blood. Steel and
   * arrows flash white-gold; a magic weapon's blows burst in arcane blue.
   */
  hit(e: Enemy, crit: boolean, fromX?: number, fromZ?: number) {
    const g = this.g, gy = e.pos.y, h = e.model.height;
    const away = fromX === undefined || fromZ === undefined ? Math.random() * Math.PI * 2 : Math.atan2(e.z - fromZ, e.x - fromX);
    const y = gy + h * 0.55;
    // On the struck side, in front of the body.
    const sx = e.x - Math.cos(away) * e.radius * 0.5, sz = e.z - Math.sin(away) * e.radius * 0.5;
    const at = this.front(sx, y, sz, e.radius + 0.35);
    const magic = g.stats?.style === 'magic';
    if (this.burstAt !== g.time) {
      const rot = Math.random() * 6.3;
      if (magic) this.card('arcane', { x: at.x, y: at.y, z: at.z, life: crit ? 0.42 : 0.32, size: crit ? 2.5 : 1.7, rot, color: lin(0x7aaeff, 1.5), heat: 0.7 });
      else this.card(crit ? 'crit' : 'impact', { x: at.x, y: at.y, z: at.z, life: crit ? 0.38 : 0.28, size: crit ? 2.3 : 1.55, rot, color: lin(0xffffff, 0.95), heat: 0.45 });
      if (crit) {
        this.card('impact', { x: at.x, y: at.y, z: at.z, life: 0.24, size: 1.15, rot: rot + 0.8, color: lin(0xffffff, 1.0), heat: 0.6 });
        this.mesh.decal({ kind: 'ring', x: e.x, y: gy + 0.06, z: e.z, from: 0.8, to: 3.2, life: 0.32, color: 0xffb060, gain: 1.6, fadeIn: 0.01 });
      }
    }
    this.spray(at.x, at.y, at.z, crit ? 16 : 9, {
      speed: [5, crit ? 13 : 10], up: [0.5, 4], life: [0.22, 0.42], size: [0.05, 0.085], gravity: 14, drag: 2.2,
      colors: magic ? [0xcfe4ff, 0x8ab8ff, 0xffffff] : crit ? [0xffe070, 0xff8a3a, 0xffffff] : [0xffe8a0, 0xffffff], dir: away, spread: 1.1,
    });
    const blood = lin(BLOOD[e.def.model] ?? 0x9a2418);
    for (let i = 0; i < (crit ? 8 : 5); i++) {
      const a = away + (Math.random() - 0.5) * 2.2, sp = rand(2.5, 5.5);
      this.card('blood', {
        x: at.x, y: at.y - 0.1, z: at.z, vx: Math.cos(a) * sp, vy: rand(1.5, 4), vz: Math.sin(a) * sp, gravity: 13, drag: 1.2,
        floor: gy + 0.03, life: rand(0.45, 0.7), size: rand(0.22, 0.36), grow: 0.8, stretch: 0.03, color: blood,
        frame: Math.floor(Math.random() * 4), fadeOut: 0.55,
      });
    }
  }

  /** A creature's death: a puff of smoke and sparkle where it stood, chips flying, embers rising. */
  death(e: Enemy) {
    const gy = e.pos.y, h = e.model.height;
    const at = this.front(e.x, gy + h * 0.5, e.z, e.radius + 0.3);
    this.card('poof', { x: at.x, y: at.y, z: at.z, vy: 0.5, life: 0.85, size: h * 1.2 + 0.7, rot: rand(-0.3, 0.3), color: lin(0xffffff, 0.9), heat: 0.25 });
    this.g.particles.burst(new THREE.Vector3(e.x, gy + h * 0.5, e.z), { count: 12, color: [0x4a4038, 0x6a5a50, 0x3a3030], speed: 4.5, up: 4, life: 0.9, size: 0.16 });
    this.spray(e.x, gy + h * 0.5, e.z, 10, { speed: [0.5, 2], up: [1.5, 3.5], life: [0.6, 1.1], size: [0.06, 0.1], colors: [PAL.ember, PAL.fire], kind: 'mote', gravity: -0.5, drag: 1.5 });
  }

  /** A spell in flight leaves its trail: the fireball sheds flames, the arcane bolt cold motes. */
  trail(kind: ProjectileKind, x: number, y: number, z: number) {
    if (kind === 'fireball') {
      this.g.glow.spawn(x, y, z, rand(-0.6, 0.6), rand(0.3, 0.9), rand(-0.6, 0.6), rand(0.3, 0.45), rand(0.16, 0.24), pick([PAL.fire, PAL.ember, 0xffffff]), -1, 2, 'flame');
      if (Math.random() < 0.3) this.g.glow.spawn(x, y, z, rand(-1.5, 1.5), rand(0.5, 2), rand(-1.5, 1.5), 0.5, 0.05, PAL.ember, 3, 1, 'spark');
    } else if (kind === 'bolt') {
      this.g.glow.spawn(x, y, z, rand(-0.3, 0.3), rand(-0.2, 0.3), rand(-0.3, 0.3), 0.28, rand(0.09, 0.13), pick([PAL.arcane, 0xcfe4ff]), 0, 1, 'mote');
    }
  }

  /**
   * A ball of fire bursting at (x, z), `r` across its blast: the painted explosion, a ring of fire racing out along
   * the ground, flames and embers thrown, smoke rolling up after, scorched chips.
   */
  fireBurst(x: number, z: number, r: number) {
    this.burstAt = this.g.time;
    const gy = this.groundY(x, z);
    const at = this.front(x, gy + r * 0.45, z, 1);
    this.card('explosion', { x: at.x, y: at.y, z: at.z, life: 0.85, size: r * 1.55 + 0.8, rot: rand(-0.4, 0.4), color: lin(0xffd0a0, 0.85), heat: 0.25 });
    this.mesh.decal({ kind: 'ring', x, y: gy + 0.07, z, from: r * 0.4, to: r * 2.3, life: 0.45, color: 0xff7a2a, gain: 1.6, fadeIn: 0.01 });
    this.spray(x, gy + 0.5, z, Math.round(10 + r * 4), { speed: [r * 1.2, r * 2.6], up: [1, 4], life: [0.35, 0.65], size: [0.22, 0.36], colors: [PAL.fire, PAL.ember, 0xffffff], kind: 'flame', gravity: -1.5, drag: 3 });
    this.spray(x, gy + 0.6, z, Math.round(8 + r * 3), { speed: [r * 2, r * 4.5], up: [3, 7], life: [0.5, 0.9], size: [0.05, 0.08], colors: [PAL.ember, 0xffe080], gravity: 9, drag: 1.2 });
    for (let i = 0; i < 4; i++) {
      const a = Math.random() * Math.PI * 2, d = rand(0, r * 0.5);
      this.card('smoke', { x: x + Math.cos(a) * d, y: gy + r * 0.5, z: z + Math.sin(a) * d, vx: Math.cos(a) * 0.4, vy: rand(0.6, 1.2), vz: Math.sin(a) * 0.4, drag: 0.5, life: rand(1.5, 2.1), size: r * rand(1.1, 1.5), rot: rand(0, 6.3), spin: rand(-0.3, 0.3), color: lin(0x4a4440), opacity: 0.85 });
    }
    this.g.particles.burst(new THREE.Vector3(x, gy + 0.3, z), { count: 10, color: [0x2a2020, 0x4a3a30], speed: r * 2, up: 5, life: 0.9, size: 0.14 });
  }

  /** Lightning from one point to another: a jagged painted bolt flickering, a crackle and sparks where it strikes. */
  lightning(from: { x: number; y: number; z: number }, to: { x: number; y: number; z: number }) {
    this.burstAt = this.g.time;
    const pts: THREE.Vector3[] = [];
    const n = 8;
    for (let i = 0; i <= n; i++) {
      const t = i / n, j = i === 0 || i === n ? 0 : 0.55;
      pts.push(new THREE.Vector3(
        from.x + (to.x - from.x) * t + (Math.random() - 0.5) * j,
        from.y + (to.y - from.y) * t + (Math.random() - 0.5) * j,
        from.z + (to.z - from.z) * t + (Math.random() - 0.5) * j,
      ));
    }
    this.mesh.bolt(pts, 0x8ab8ff, 0.75, 0.26, 2.2);
    this.mesh.bolt(pts, 0xeaf4ff, 0.3, 0.2, 2.6);
    const at = this.front(to.x, to.y, to.z, 0.8);
    this.card('electric', { x: at.x, y: at.y, z: at.z, life: 0.32, size: 1.5, fps: 30, rot: rand(0, 6.3), color: lin(0xffffff, 1.0), heat: 0.45 });
    this.spray(at.x, at.y, at.z, 7, { speed: [3, 7], up: [-1, 2], life: [0.15, 0.3], size: [0.04, 0.07], colors: [0xcfe8ff, 0x6aa8ff, 0xffffff] });
  }

  /** Sparks off the anvil under the hammer, `h` above the ground: a white-hot flash and sparks fanning up and falling. */
  sparks(x: number, h: number, z: number, color = 0xffd080) {
    const at = this.front(x, this.groundY(x, z) + h, z, 0.5);
    this.g.glow.spawn(at.x, at.y, at.z, 0, 0, 0, 0.18, 0.32, 0xffffff, 0, 0, 'glint');
    this.spray(at.x, at.y, at.z, 22, { speed: [3, 7.5], up: [3, 7], life: [0.35, 0.7], size: [0.07, 0.12], colors: [color, 0xffffff, 0xffb040], gravity: 13, drag: 0.8 });
  }

  /**
   * A pickaxe biting into the rock at (x, z), `h` above the ground, on the face the hero strikes: chips of the stone
   * and its ore flying, a white flash and sparks off the iron, a puff of rock dust.
   */
  mine(x: number, h: number, z: number, ore: number) {
    const p = this.g.player, d = Math.hypot(p.x - x, p.z - z) || 1;
    const fx = x + ((p.x - x) / d) * 0.55, fz = z + ((p.z - z) / d) * 0.55;
    const gy = this.groundY(fx, fz), at = this.front(fx, gy + h, fz, 0.4);
    this.g.particles.burst(at, { count: 12, color: [0x9a958e, 0x7e7a74, ore, ore], speed: 3.8, up: 6, life: 1.0, size: 0.17 });
    this.g.glow.spawn(at.x, at.y, at.z, 0, 0, 0, 0.16, 0.26, 0xffffff, 0, 0, 'glint');
    this.spray(at.x, at.y, at.z, 10, { speed: [3, 6], up: [2, 5], life: [0.25, 0.5], size: [0.05, 0.08], colors: [0xffe0a0, 0xffffff, 0xffb040], gravity: 13, drag: 0.8 });
    this.card('dust', { x: fx, y: gy + 0.05, z: fz, vy: 0.3, life: 0.85, size: 1.7, rot: rand(-0.2, 0.2), anchor: 0.35, color: lin(0xc8c0b8), opacity: 0.9 });
  }

  /** Dust kicked up at the feet (a roll). */
  dust(x: number, z: number) {
    const gy = this.groundY(x, z);
    for (let i = 0; i < 3; i++) {
      const a = Math.random() * Math.PI * 2;
      this.card('dust', { x: x + Math.cos(a) * 0.3, y: gy + 0.05, z: z + Math.sin(a) * 0.3, vx: Math.cos(a) * 0.8, vz: Math.sin(a) * 0.8, drag: 2, life: rand(0.55, 0.75), size: rand(0.9, 1.3), anchor: 0.35, color: lin(0xc8b89a), opacity: 0.85 });
    }
  }

  /**
   * A heavy landing or a slam at (x, z), `r` across: dust thrown out along the ground in a ring with the pale edge
   * of its shockwave racing ahead, puffs of it rolling outward, chips of earth.
   */
  dustRing(x: number, z: number, r: number, color = 0xb8a88a) {
    const gy = this.groundY(x, z);
    this.mesh.decal({ kind: 'dust', x, y: gy + 0.05, z, from: r * 0.8, to: r * 2.3, life: 0.6, color, fadeIn: 0.02 });
    this.mesh.decal({ kind: 'ring', x, y: gy + 0.06, z, from: r * 0.6, to: r * 2.4, life: 0.45, color, gain: 0.9, fadeIn: 0.01 });
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + rand(-0.2, 0.2);
      this.card('dust', {
        x: x + Math.cos(a) * r * 0.55, y: gy + 0.05, z: z + Math.sin(a) * r * 0.55, vx: Math.cos(a) * r * 1.6, vz: Math.sin(a) * r * 1.6, drag: 3.5,
        life: rand(0.6, 0.85), size: rand(1.2, 1.7), anchor: 0.35, color: lin(color, 1.1), opacity: 0.9,
      });
    }
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      this.g.particles.spawn(x + Math.cos(a) * r * 0.5, gy + 0.2, z + Math.sin(a) * r * 0.5, Math.cos(a) * r * 2, 1.5 + Math.random() * 2, Math.sin(a) * r * 2, 0.6, 0.15, i % 2 ? color : 0x6a5a48, 9, 2);
    }
  }

  /** Leap Slam's landing: the dust ring and a white shock ring racing out ahead of it. */
  slam(x: number, z: number, r: number) {
    this.burstAt = this.g.time;
    this.dustRing(x, z, r);
    this.mesh.decal({ kind: 'ring', x, y: this.groundY(x, z) + 0.07, z, from: 1, to: r * 2.6, life: 0.3, color: 0xfff2d0, gain: 2.2, fadeIn: 0.01 });
  }

  /** War Cry: a red shockwave of rage rolling out from the hero, embers rising round him. */
  warCry(x: number, z: number, r: number) {
    this.burstAt = this.g.time;
    const gy = this.groundY(x, z);
    this.mesh.decal({ kind: 'ring', x, y: gy + 0.07, z, from: 1, to: r * 2.4, life: 0.5, color: 0xff4a2a, gain: 2.6, fadeIn: 0.01 });
    this.mesh.decal({ kind: 'sigil', x, y: gy + 0.05, z, from: r * 1.2, to: r * 1.5, life: 0.8, color: 0xff6a3a, gain: 1.6, spin: 1.2 });
    this.spray(x, gy + 0.3, z, 22, { speed: [0.5, 2.5], up: [2, 5], life: [0.6, 1], size: [0.07, 0.12], colors: [0xff5a3a, 0xffa040, 0xffe080], kind: 'mote', gravity: -0.5, drag: 1.2 });
  }

  /**
   * Frost Nova round the hero: the frost circle flaring on the ground, a cold ring racing out, an ice burst at his
   * feet, shards of ice flying out radially, and a cold mist settling.
   */
  frostNova(x: number, z: number, r: number) {
    this.burstAt = this.g.time;
    const gy = this.groundY(x, z);
    this.mesh.decal({ kind: 'frostCircle', x, y: gy + 0.05, z, from: r * 1.2, to: r * 2.15, life: 0.9, color: 0xffffff, gain: 0.95, spin: 0.7 });
    this.mesh.decal({ kind: 'ring', x, y: gy + 0.07, z, from: 1, to: r * 2.5, life: 0.4, color: 0x9fe4ff, gain: 1.9, fadeIn: 0.01 });
    const at = this.front(x, gy + 1, z, 0.8);
    this.card('frostBurst', { x: at.x, y: at.y, z: at.z, life: 0.6, size: r * 1.1, rot: rand(0, 6.3), color: lin(0xffffff, 1.0), heat: 0.5 });
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + rand(-0.1, 0.1), sp = rand(r * 2.2, r * 3.4);
      this.g.glow.spawn(x, gy + rand(0.4, 1.1), z, Math.cos(a) * sp, rand(-0.5, 1.5), Math.sin(a) * sp, rand(0.35, 0.5), rand(0.12, 0.18), pick([PAL.frost, 0xffffff]), 0, 2.5, 'shard');
    }
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      this.card('smoke', { x: x + Math.cos(a) * r * 0.7, y: gy + 0.1, z: z + Math.sin(a) * r * 0.7, vx: Math.cos(a) * 1.2, vz: Math.sin(a) * 1.2, vy: 0.2, drag: 1.5, life: rand(1, 1.4), size: rand(1.4, 1.9), rot: rand(0, 6.3), anchor: 0.25, color: lin(0xbfe8ff, 1.3), opacity: 0.55 });
    }
  }

  /** A strong wind blown from (x, z) toward `dir`: pale streaks racing along it, dust lifting. */
  gust(x: number, z: number, dir: number) {
    const gy = this.groundY(x, z);
    for (let i = 0; i < 40; i++) {
      const a = dir + (Math.random() - 0.5) * 1.8, sp = 10 + Math.random() * 8;
      this.g.glow.spawn(x, gy + 0.5 + Math.random() * 2, z, Math.cos(a) * sp, 0.5, Math.sin(a) * sp, 0.55, 0.07, 0xe8e0d0, 0, 2, 'spark');
    }
    for (let i = 0; i < 5; i++) {
      const a = dir + (Math.random() - 0.5) * 1.2, sp = rand(4, 7);
      this.card('dust', { x, y: gy + 0.1, z, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, drag: 2, life: rand(0.7, 1), size: rand(1.4, 2), anchor: 0.35, color: lin(0xd8d0c0), opacity: 0.8 });
    }
  }

  // ─── The hero ──────────────────────────────────────────────────────────────

  /** A potion drunk: a swirl of rose light and petals rising round the hero, a soft ring pulsing out at his feet. */
  heal(x: number, z: number) {
    const gy = this.groundY(x, z);
    const at = this.front(x, gy, z, 0.6);
    this.card('heal', { x: at.x, y: at.y, z: at.z, life: 1.3, size: 3.8, anchor: 0.42, color: lin(0xff6a8a, 2.8), heat: 0.9 });
    this.mesh.decal({ kind: 'ring', x, y: gy + 0.06, z, from: 0.8, to: 3.0, life: 0.7, color: 0xff7a9a, gain: 2.0 });
    this.spray(x, gy + 0.4, z, 22, { speed: [0.3, 1.3], up: [1.4, 3.2], life: [0.9, 1.3], size: [0.08, 0.13], colors: [0xff7a9a, 0xffd0dc, 0xffe080], kind: 'glint', gravity: -0.4, drag: 1 });
  }

  /**
   * A level-up: a pillar of golden light rising through the hero, a ring of light thrown out and a golden circle
   * turning at his feet, a burst of sparkle, and glints (some in the skill's own colour) spiralling up.
   */
  levelUp(x: number, z: number, accent: number) {
    const gy = this.groundY(x, z);
    this.mesh.pillar({ x, y: gy, z, radius: 0.85, height: 7, life: 1.6, color: 0xffd060, gain: 2.2, rise: 1.6 });
    this.mesh.decal({ kind: 'sigil', x, y: gy + 0.05, z, from: 2.6, to: 3.4, life: 1.6, color: 0xffc040, gain: 1.8, spin: 1.4 });
    this.mesh.decal({ kind: 'ring', x, y: gy + 0.07, z, from: 1, to: 5.5, life: 0.6, color: 0xffe080, gain: 2.4, fadeIn: 0.01 });
    const at = this.front(x, gy + 1.2, z, 0.8);
    this.card('sparkle', { x: at.x, y: at.y, z: at.z, life: 0.8, size: 2.6, color: lin(0xffffff, 1.4), heat: 0.8 });
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 4, rr = rand(0.5, 1.1);
      this.g.glow.spawn(x + Math.cos(a) * rr, gy + rand(0.2, 1), z + Math.sin(a) * rr, -Math.sin(a) * 1.2, rand(2, 5), Math.cos(a) * 1.2, rand(1.1, 1.6), rand(0.08, 0.13), i % 4 === 0 ? accent : pick([0xffe070, 0xffffff, 0xffc040]), -0.3, 0.8, 'glint');
    }
  }

  /** A rare or unique drop landing: a burst of sparkle, a ring of light, glints; a unique adds a column of light. */
  loot(x: number, y: number, z: number, unique: boolean) {
    const gy = this.groundY(x, z);
    const at = this.front(x, y + 0.3, z, 0.6);
    this.card('sparkle', { x: at.x, y: at.y, z: at.z, life: 0.8, size: unique ? 3.2 : 2.2, color: lin(unique ? 0xffb050 : 0xfff0a0, 1.4), heat: 0.8 });
    this.mesh.decal({ kind: 'ring', x, y: gy + 0.06, z, from: 0.5, to: unique ? 3.6 : 2.4, life: 0.5, color: unique ? 0xff9a30 : 0xffe060, gain: 2.2, fadeIn: 0.01 });
    this.spray(x, y, z, unique ? 26 : 12, { speed: [1, unique ? 5 : 3], up: [2, unique ? 7 : 5], life: [0.6, 1.1], size: [0.07, 0.12], colors: unique ? [0xff8a1a, 0xffe080, 0xffffff] : [0xffd84a, 0xffffff], kind: 'glint', gravity: 3, drag: 1 });
    if (unique) this.mesh.pillar({ x, y: gy, z, radius: 0.45, height: 6, life: 1.1, color: 0xffa040, gain: 2.4, rise: 2 });
  }

  /** Portal arrival (and the end of a recall): a column of blue light and sparkles round the arrival, a circle turning at the feet. */
  teleport(x: number, z: number, color = 0x9ab8ff) {
    const gy = this.groundY(x, z);
    const at = this.front(x, gy, z, 0.6);
    this.card('teleport', { x: at.x, y: at.y, z: at.z, life: 0.9, size: 3.4, anchor: 0.45, color: lin(0xffffff, 1.3), heat: 0.8 });
    this.mesh.decal({ kind: 'sigil', x, y: gy + 0.05, z, from: 2.2, to: 2.8, life: 1, color, gain: 1.8, spin: -1.2 });
    for (let i = 0; i < 30; i++) {
      const a = (i / 30) * Math.PI * 2;
      this.g.glow.spawn(x + Math.cos(a) * 0.8, gy + 0.2 + Math.random() * 0.4, z + Math.sin(a) * 0.8, -Math.sin(a) * 2, 3 + Math.random() * 3, Math.cos(a) * 2, 0.9, 0.09, i % 2 ? color : 0xffffff, -1, 0.5, 'glint');
    }
  }
}
