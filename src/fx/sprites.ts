import * as THREE from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { atan, attribute, cameraProjectionMatrix, cameraViewMatrix, cos, exp, float, floor, Fn, max, min, mix, mod, positionGeometry, pow, select, sin, smoothstep, step, texture, uniform, uv, vec2, vec3, vec4 } from 'three/tsl';
import type { F, V2, V3, V4 } from '../render/patch';
import { shareResource } from '../render/resources';
import { frameCell, PAGES, SHEETS, type PageId, type SheetId } from './sheets';
import { pageTexture } from './textures';

/**
 * Camera-facing painted cards (sprites) by the thousand, one draw for each page of frames: every card's flight, size,
 * turn, fade and flipbook frame are worked out on the graphics card from what it was given when it was spawned (where,
 * how fast, how long, which frames), so nothing is updated per card per frame and a spawn writes only its own slot.
 *
 * A card flies as a body thrown with gravity and air drag (worked out exactly, so it is the same at any frame rate),
 * stops on the floor it was given, grows or shrinks over its life, turns or spins, and stretches along its flight on
 * screen as fast things blur (sparks streak). Its frames play once over its life or loop at a rate, each blended
 * into the next. Light-adding pages add their painted light, tinted, with the hottest parts lifted toward white for
 * the bloom; the alpha page lays its painted colour over what lies behind.
 */

export interface SpriteSpawn {
  x: number;
  y: number;
  z: number;
  vx?: number;
  vy?: number;
  vz?: number;
  /** Air drag (per second): 0 flies straight on. */
  drag?: number;
  /** Downward pull (units/s²); negative floats up. */
  gravity?: number;
  /** The height it stops at (default far below). */
  floor?: number;
  life: number;
  /** Width and height (units). */
  size: number;
  /** Size at the end of its life, as a multiple of `size` (1). */
  grow?: number;
  /** Turn (radians) and spin (radians/s), when not stretched along its flight. */
  rot?: number;
  spin?: number;
  /** Stretch along its flight on screen: the card's length grows by this times its speed (0: none). */
  stretch?: number;
  /** Tint (linear; above 1 is brighter than painted) and opacity. */
  color?: THREE.Color;
  opacity?: number;
  sheet: SheetId;
  /** One frame of the sheet to show, still (its variants: the blood drops, the smoke puffs); left out, the frames play. */
  frame?: number;
  /** Frames a second, looping (left out: the frames play once over the card's life). */
  fps?: number;
  /** Share of its life after which it fades out (1: never, the frames fade themselves). */
  fadeOut?: number;
  /** How much its brightest parts are lifted toward white (light-adding pages). */
  heat?: number;
  /** Where the card hangs from its point: 0 its middle, 0.5 its foot (a flame stands on its point). */
  anchor?: number;
}

const WHITE = new THREE.Color(1, 1, 1);
/**
 * The per-card values, seven vec4s side by side in one buffer (a card's 28 floats; one vertex buffer, as WebGPU allows
 * few): aP where (xyz) and when (w) it was spawned; aV its velocity and drag; aL its life, gravity, floor and size; aS
 * its end size, turn, spin and stretch; aC its tint and opacity; aA its first frame's cell (xy), how many frames and
 * their rate; aX its heat, anchor and fade-out (w unused).
 */
const ATTRS = ['aP', 'aV', 'aL', 'aS', 'aC', 'aA', 'aX'] as const;
const STRIDE = ATTRS.length * 4;
/** Seconds after which an idle layer's clock starts over (see update). */
const REBASE = 600;

/** One page's cards (sheets.ts): a pool of `max` slots, reused oldest first. */
export class SpriteLayer {
  readonly mesh: THREE.Mesh;
  private readonly geo: THREE.InstancedBufferGeometry;
  private readonly buf: THREE.InstancedInterleavedBuffer;
  private readonly data: Float32Array;
  private readonly time = uniform(0);
  /** Cards spawned before this time are gone (clear). */
  private readonly born = uniform(-1);
  private head = 0;
  private used = 0;
  /** When the last card alive dies. */
  private lastDeath = -Infinity;
  /** Slots written since the last upload (inclusive ranges). */
  private dirty: [number, number][] = [];
  private readonly c = new THREE.Color();

  constructor(readonly page: PageId, readonly max: number) {
    const quad = new THREE.PlaneGeometry(1, 1);
    quad.deleteAttribute('normal');
    this.geo = new THREE.InstancedBufferGeometry().copy(quad as unknown as THREE.InstancedBufferGeometry);
    quad.dispose();
    this.data = new Float32Array(max * STRIDE);
    this.buf = new THREE.InstancedInterleavedBuffer(this.data, STRIDE);
    ATTRS.forEach((name, k) => this.geo.setAttribute(name, new THREE.InterleavedBufferAttribute(this.buf, 4, k * 4)));
    this.geo.instanceCount = 0;
    this.mesh = new THREE.Mesh(this.geo, this.material());
    this.mesh.name = `fx-${page}`;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    // Smoke and dust first, light added over them.
    this.mesh.renderOrder = PAGES[page].blend === 'alpha' ? 20 : 21;
    this.mesh.onBeforeRender = () => this.upload();
    shareResource(this.geo);
    shareResource(this.mesh.material as THREE.Material);
  }

  spawn(s: SpriteSpawn) {
    const sheet = SHEETS[s.sheet];
    if (sheet.page !== this.page) throw new Error(`sheet ${s.sheet} is not on page ${this.page}`);
    const i = this.head;
    this.head = (this.head + 1) % this.max;
    this.used = Math.max(this.used, i + 1);
    const still = sheet.frames > 1 && s.fps === undefined && s.frame !== undefined;
    const cell = frameCell(sheet, still ? s.frame! : 0);
    const frames = still ? 1 : sheet.frames;
    const t0 = this.time.value;
    const col = this.c.copy(s.color ?? WHITE);
    const d = this.data;
    let o = i * STRIDE;
    const put = (a: number, b: number, c: number, e: number) => {
      d[o++] = a;
      d[o++] = b;
      d[o++] = c;
      d[o++] = e;
    };
    put(s.x, s.y, s.z, t0);
    put(s.vx ?? 0, s.vy ?? 0, s.vz ?? 0, s.drag ?? 0);
    put(s.life, s.gravity ?? 0, s.floor ?? -1e4, s.size);
    put(s.grow ?? 1, s.rot ?? 0, s.spin ?? 0, s.stretch ?? 0);
    put(col.r, col.g, col.b, s.opacity ?? 1);
    put(cell.col, cell.row, frames, s.fps ?? 0);
    // (The fade's start kept below its end: smoothstep with equal edges is undefined on the graphics card.)
    put(s.heat ?? 0, s.anchor ?? 0, Math.min(s.fadeOut ?? 1, 0.999), 0);
    this.lastDeath = Math.max(this.lastDeath, t0 + s.life);
    const last = this.dirty[this.dirty.length - 1];
    if (last && last[1] === i - 1) last[1] = i;
    else this.dirty.push([i, i]);
    if (this.dirty.length > 8) this.dirty = [[0, this.max - 1]];
    this.mesh.visible = true;
    this.geo.instanceCount = this.used;
  }

  /**
   * Advance the clock (seconds of game time: paused with the game, slowed by hit-stop). While no card is alive the
   * clock starts over now and then, so it never grows large enough to lose precision on the graphics card (every
   * old card sent far into the past, never to show again).
   */
  update(dt: number) {
    this.time.value += dt;
    if (this.time.value <= this.lastDeath) return;
    this.mesh.visible = false;
    if (this.time.value < REBASE) return;
    this.time.value = 0;
    this.born.value = -1;
    this.lastDeath = -Infinity;
    for (let i = 0; i < this.used; i++) this.data[i * STRIDE + 3] = -1e6;
    this.dirty = this.used ? [[0, this.used - 1]] : [];
  }

  /** Every card gone at once (zone change); cards spawned from now on live. */
  clear() {
    this.time.value += 1e-3;
    this.born.value = this.time.value;
    this.lastDeath = -Infinity;
    this.mesh.visible = false;
  }

  /** Just before the layer draws: send the slots written since the last draw. */
  private upload() {
    if (!this.dirty.length) return;
    this.buf.clearUpdateRanges();
    for (const [lo, hi] of this.dirty) this.buf.addUpdateRange(lo * STRIDE, (hi - lo + 1) * STRIDE);
    this.buf.needsUpdate = true;
    this.dirty = [];
  }

  private material() {
    const page = PAGES[this.page], map = pageTexture(this.page), grid = float(page.grid);
    const P = attribute('aP', 'vec4') as V4, V = attribute('aV', 'vec4') as V4, L = attribute('aL', 'vec4') as V4;
    const S = attribute('aS', 'vec4') as V4, C = attribute('aC', 'vec4') as V4, A = attribute('aA', 'vec4') as V4, X = attribute('aX', 'vec4') as V4;
    const time = this.time, born = this.born;
    const mat = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false });
    mat.vertexNode = Fn(() => {
      const age = time.sub(P.w).toVar();
      const u = age.div(L.x);
      const alive = step(0, age).mul(step(age, L.x)).mul(step(born, P.w));
      // Flight with drag k and gravity g, exactly: v = v0·e^(-kt) + a·f1, p = p0 + v0·f1 + a·f2, where
      // f1 = (1 − e^(-kt))/k and f2 = (t − f1)/k (their series where kt is small).
      const t = max(age, 0).toVar(), k = max(V.w, 0).toVar(), kt = k.mul(t);
      const e = exp(kt.negate()).toVar();
      const small = kt.lessThan(1e-3);
      const f1 = select(small, t.sub(k.mul(t).mul(t).mul(0.5)), float(1).sub(e).div(k)).toVar();
      const f2 = select(small, t.mul(t).mul(0.5).sub(k.mul(t).mul(t).mul(t).div(6)), t.sub(f1).div(k));
      const acc = vec3(0, L.y.negate(), 0);
      const flown = P.xyz.add(V.xyz.mul(f1)).add(acc.mul(f2)).toVar();
      const p = vec3(flown.x, max(flown.y, L.z), flown.z);
      // (Come to rest on its floor it only slides: no falling speed to streak with.)
      const vel = select(flown.y.lessThan(L.z), vec3(V.x, 0, V.z).mul(e), V.xyz.mul(e).add(acc.mul(f1)));
      const size = L.w.mul(mix(float(1), S.x, u)).toVar();
      // Turned along its flight on screen when stretched, else by its own turn and spin.
      const mv = cameraViewMatrix.mul(vec4(p, 1)).toVar();
      const sv = cameraViewMatrix.mul(vec4(vel, 0)).xy.toVar();
      const spd = sv.length().toVar();
      const flying = S.w.greaterThan(0).and(spd.greaterThan(0.01));
      const ang = select(flying, atan(sv.y, sv.x), S.y.add(S.z.mul(t))).toVar();
      const len = size.mul(S.w.mul(spd).add(1));
      const corner = positionGeometry.xy as V2;
      const local = vec2(corner.x.mul(len), corner.y.add(X.y).mul(size)).mul(alive).toVar();
      const turned = vec2(local.x.mul(cos(ang)).sub(local.y.mul(sin(ang))), local.x.mul(sin(ang)).add(local.y.mul(cos(ang))));
      return cameraProjectionMatrix.mul(vec4(mv.xy.add(turned), mv.z, 1));
    })();
    mat.colorNode = Fn(() => {
      const age = time.sub(P.w).toVar();
      const u = age.div(L.x).toVar();
      // Frames: once over the life, or looping at fps, each blended into the next.
      const frames = A.z, fps = A.w;
      const loop = fps.greaterThan(0);
      const fi = select(loop, mod(age.mul(fps), frames), min(u.mul(frames), frames.sub(1))).toVar();
      const f0 = floor(fi).toVar();
      const f1n = select(loop, mod(f0.add(1), frames), min(f0.add(1), frames.sub(1)));
      const inCell = vec2(uv().x, float(1).sub(uv().y));
      const cellUV = (f: F) => vec2(A.x.add(mod(f, 4)), A.y.add(floor(f.div(4)))).add(inCell).div(grid);
      const tex = mix(texture(map, cellUV(f0)), texture(map, cellUV(f1n)), fi.sub(f0)).toVar() as V4;
      const fade = float(1).sub(smoothstep(X.z, 1, u)).mul(C.w);
      const hot = pow(tex.rgb, vec3(3)).mul(X.x);
      if (page.blend === 'add') return vec4(tex.rgb.mul(C.rgb).add(hot).mul(fade), 0);
      // (Premultiplied: never more colour than coverage, whatever the compression left under clear texels.)
      const rgb = min(tex.rgb, vec3(tex.a)) as V3;
      return vec4(rgb.mul(C.rgb).add(hot).mul(fade), tex.a.mul(fade));
    })();
    Object.assign(mat, {
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    });
    return mat;
  }
}
