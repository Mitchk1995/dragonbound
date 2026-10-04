import * as THREE from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { abs, clamp, cos, float, Fn, length, max, mix, normalView, pow, sin, smoothstep, texture, time, uv, vec2, vec3, vec4 } from 'three/tsl';
import { own, type V2 } from '../render/patch';
import { shareResource } from '../render/resources';
import { maskTexture, type MaskId } from './textures';

/**
 * The mesh effects: shapes that carry painted, scrolling, eroding textures (textures.ts), the way effects artists
 * build slashes, shockwaves, magic circles, light pillars and lightning:
 * - a slash: a band swept round the swing carrying the painted slash, its bright head riding the blade's tip, its
 *   wispy tail eaten away through cloud noise as it fades;
 * - a decal: a flat card on the ground, a ring, a magic circle or the frost circle (turning, growing, eroding away),
 *   or a soft ring of dust thrown out along the ground;
 * - a pillar: an open column of light, streaks rising through it, bright at its edges, fading upward (also the
 *   standing loot beam);
 * - a bolt: a jagged ribbon carrying the painted lightning strip, flickering.
 * Each kind shares one shape and one program; every effect has its own material from a pool (its values are read off
 * it while it draws), reused when it ends. Light is added (premultiplied, as the sprites), the dust laid over.
 */

const premultiplied = {
  blending: THREE.CustomBlending,
  blendSrc: THREE.OneFactor,
  blendDst: THREE.OneMinusSrcAlphaFactor,
  blendSrcAlpha: THREE.OneFactor,
  blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
} as const;

/**
 * A material carrying the values its program reads (fxColor, fxFade, …), premultiplied: light adds (no coverage),
 * dust lays its colour over by its coverage.
 */
function fxMaterial() {
  const m = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false });
  Object.assign(m, premultiplied, { fxColor: new THREE.Color(), fxFade: 1, fxErode: -1, fxSeed: 0, fxGain: 1, fxPulse: 0 });
  return m;
}

const tex = (id: MaskId, at: V2) => texture(maskTexture(id), at);

// ─── Slash ──────────────────────────────────────────────────────────────────

/** A slash's band: u along the swing (0 where it starts), v across (0 inside, 1 the blade's edge). */
const SLASH_GEO = shareResource(new THREE.PlaneGeometry(1, 1, 40, 3).translate(0.5, 0.5, 0));

/** The band laid round the swing: angle from fxDir + fxSweep/2 down to fxDir − fxSweep/2, dipping by fxTilt. */
const slashPosition = Fn(() => {
  const u = uv().x, v = uv().y;
  const a = own.f('fxDir').add(own.f('fxSweep').mul(float(0.5).sub(u)));
  const r = mix(own.f('fxR0'), own.f('fxR1'), v);
  return vec3(cos(a).mul(r), own.f('fxTilt').mul(float(0.5).sub(u)).sub(v.mul(0.1)), sin(a).mul(r));
});

/**
 * The painted slash (fx-slash: its wispy tail to its thick bright head, its crisp edge outermost) drawn along the
 * swept part of the band, its head riding the leading tip as it sweeps; it breaks up through the cloud noise as it
 * fades, its hottest paint lifted toward white for the bloom.
 */
const slashColor = Fn(() => {
  const u = uv().x, v = uv().y;
  const head = own.f('fxHead'), tail = own.f('fxTail');
  // 0 at the tail .. 1 at the leading tip.
  const s = clamp(u.sub(tail).div(max(head.sub(tail), 1e-3)), 0, 1);
  const inside = smoothstep(tail, tail.add(0.02), u).mul(smoothstep(head, head.sub(0.004), u));
  const paint = tex('slash', vec2(s, v)).rgb.toVar();
  const seed = own.f('fxSeed');
  const noise = tex('noise', vec2(u.mul(1.1).add(seed.mul(2)), v.mul(0.45).sub(head.mul(0.2)))).r;
  const erode = own.f('fxErode');
  const a = inside.mul(smoothstep(erode, erode.add(0.3), noise.mul(0.7).add(paint.g.mul(0.3)))).mul(own.f('fxFade'));
  const rgb = paint.mul(own.color('fxColor')).add(pow(paint, vec3(3)).mul(0.8)).mul(own.f('fxGain'));
  return vec4(rgb.mul(a), 0);
});

// ─── Decals ─────────────────────────────────────────────────────────────────

/** A flat card on the ground (1 × 1, centred). */
const DECAL_GEO = shareResource(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2));

export type DecalKind = 'ring' | 'sigil' | 'frostCircle' | 'dust';

const turnedUV = Fn(() => {
  const c = uv().sub(0.5), a = own.f('fxSpin');
  return vec2(c.x.mul(cos(a)).sub(c.y.mul(sin(a))), c.x.mul(sin(a)).add(c.y.mul(cos(a)))).add(0.5);
});

/**
 * A painted ring or circle, turning, its light eroding away through the cloud noise as it fades; faded out before the
 * card's own round edge, so no glow ever shows the square card.
 */
const decalLight = (map: MaskId) => Fn(() => {
  const paint = tex(map, turnedUV() as V2).rgb;
  const noise = tex('noise', uv().mul(1.3).add(own.f('fxSeed'))).r;
  const erode = own.f('fxErode');
  const round = smoothstep(0.5, 0.44, length(uv().sub(0.5)));
  const a = smoothstep(erode, erode.add(0.35), noise).mul(round).mul(own.f('fxFade'));
  return vec4(paint.mul(own.color('fxColor')).mul(own.f('fxGain')).mul(a), 0);
});

/** A ring of dust thrown out along the ground: a soft band at radius fxRadius (of the card's half), lumpy with the noise. */
const decalDust = Fn(() => {
  const r = length(uv().sub(0.5)).mul(2);
  const R = own.f('fxRadius'), W = own.f('fxWidth');
  const band = smoothstep(R.sub(W), R.sub(W.mul(0.25)), r).mul(smoothstep(R.add(W.mul(0.35)), R, r));
  const noise = tex('noise', uv().mul(2.2).add(own.f('fxSeed'))).r;
  const a = band.mul(smoothstep(0.2, 0.6, noise.add(band.mul(0.3)))).mul(own.f('fxFade')).toVar();
  const shade = mix(float(0.7), float(1.15), noise);
  return vec4(own.color('fxColor').mul(shade).mul(a), a);
});

// ─── Pillar ─────────────────────────────────────────────────────────────────

/** An open column, its foot at 0 and its top at 1 (scaled to radius and height). */
const PILLAR_GEO = shareResource(new THREE.CylinderGeometry(1, 1, 1, 24, 1, true).translate(0, 0.5, 0));

/** Streaks rising up the column (on the renderer's clock), bright at its edges, fading upward; a loot beam also breathes (fxPulse). */
const pillarColor = Fn(() => {
  const u = uv().x, v = uv().y, seed = own.f('fxSeed');
  const streak = tex('trail', vec2(v.mul(0.9).sub(time.mul(own.f('fxRise'))).add(seed), u.mul(2).add(seed))).r;
  const edge = pow(float(1).sub(abs(normalView.z)), 1.4);
  const along = smoothstep(0, 0.05, v).mul(smoothstep(1, 0.3, v));
  const breath = mix(float(1), sin(time.mul(3).add(seed)).mul(0.25).add(0.75), own.f('fxPulse'));
  const a = edge.mul(0.9).add(0.25).mul(streak.add(0.35)).mul(along).mul(breath).mul(own.f('fxFade'));
  return vec4(own.color('fxColor').mul(own.f('fxGain')).mul(a), 0);
});

// ─── Bolt ───────────────────────────────────────────────────────────────────

const boltColor = Fn(() => {
  const paint = tex('bolt', vec2(uv().x.add(own.f('fxShift')), uv().y)).r;
  return vec4(own.color('fxColor').mul(own.f('fxGain')).mul(paint).mul(own.f('fxFade')), 0);
});

/**
 * A jagged ribbon through `pts`, `width` wide, as two crossed bands (flat and upright, so it reads from the high
 * camera), u running along it (one paint repeat each 2.5 units) and v across.
 */
function boltGeometry(pts: THREE.Vector3[], width: number) {
  const pos: number[] = [], uvs: number[] = [];
  const up = new THREE.Vector3(0, 1, 0), side = new THREE.Vector3(), dir = new THREE.Vector3();
  let along = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    dir.subVectors(b, a);
    const l = dir.length();
    dir.normalize();
    side.crossVectors(dir, up).normalize();
    const u0 = along / 2.5, u1 = (along + l) / 2.5;
    for (const o of [side, up]) {
      const h = o.clone().multiplyScalar(width / 2);
      const a0 = a.clone().sub(h), a1 = a.clone().add(h), b0 = b.clone().sub(h), b1 = b.clone().add(h);
      for (const [v, uu, vv] of [[a0, u0, 0], [b0, u1, 0], [b1, u1, 1], [a0, u0, 0], [b1, u1, 1], [a1, u0, 1]] as [THREE.Vector3, number, number][]) {
        pos.push(v.x, v.y, v.z);
        uvs.push(uu, vv);
      }
    }
    along += l;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  return g;
}

const beams = new Map<number, THREE.Material>();

/**
 * A loot beam: a slender column of light in the drop's rarity colour, streaks rising through it as it breathes,
 * standing for as long as the drop lies there. Shared shape and (per colour) material.
 */
export function lootBeam(color: number, height: number) {
  let mat = beams.get(color);
  if (!mat) {
    const m = shareResource(fxMaterial() as Mat);
    Object.assign(m, { fxGain: 1.4, fxRise: 0.8, fxPulse: 1, fxSeed: (color % 97) / 13 });
    (m.fxColor as THREE.Color).setHex(color);
    m.colorNode = pillarColor();
    beams.set(color, (mat = m));
  }
  const beam = new THREE.Mesh(PILLAR_GEO, mat);
  beam.scale.set(0.2, height, 0.2);
  beam.renderOrder = 23;
  return beam;
}

// ─── The effects in flight ──────────────────────────────────────────────────

type Mat = MeshBasicNodeMaterial & Record<string, unknown>;

interface Active {
  mesh: THREE.Mesh;
  mat: Mat;
  age: number;
  life: number;
  /** Per frame, with p its progress (0 → 1). */
  tick(p: number, mat: Mat, mesh: THREE.Mesh): void;
  pool: Mat[];
  /** Its shape is its own (a bolt's), freed when it ends. */
  ownShape: boolean;
}

const ease = (x: number) => 1 - (1 - Math.min(1, Math.max(0, x))) ** 2;
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export interface SlashOpts {
  x: number;
  y: number;
  z: number;
  /** The swing's middle direction (radians from +x toward +z) and its whole angle. */
  dir: number;
  sweep: number;
  /** Inner and outer radius. */
  r0: number;
  r1: number;
  /** How far the band drops from the swing's start to its end (a diagonal cut). */
  tilt?: number;
  color: number;
  /** Brightness (1: as painted, its edge white-hot). */
  gain?: number;
  life?: number;
}

export interface DecalOpts {
  kind: DecalKind;
  x: number;
  y: number;
  z: number;
  /** The card's width at its start and end. */
  from: number;
  to: number;
  life: number;
  color: number;
  gain?: number;
  /** Turns over its life (radians). */
  spin?: number;
  /** Share of its life spent fading in. */
  fadeIn?: number;
}

export interface PillarOpts {
  x: number;
  y: number;
  z: number;
  radius: number;
  height: number;
  life: number;
  color: number;
  gain?: number;
  /** How fast its streaks rise. */
  rise?: number;
}

export class MeshFx {
  /** Everything in flight hangs here (in the scene, not the zone: ended effects go back to their pools). */
  readonly root = new THREE.Group();
  private active: Active[] = [];
  private readonly pools = new Map<string, Mat[]>();
  /** Each kind's program: its colour (and, for the slash, its shape), built once and shared by its materials. */
  private readonly programs = {
    slash: { color: slashColor(), position: slashPosition() },
    ring: { color: decalLight('ring')() },
    sigil: { color: decalLight('sigil')() },
    frostCircle: { color: decalLight('frostCircle')() },
    dust: { color: decalDust() },
    pillar: { color: pillarColor() },
    bolt: { color: boltColor() },
  };

  constructor() {
    this.root.name = 'fx-meshes';
  }

  private take(kind: keyof MeshFx['programs']) {
    let pool = this.pools.get(kind);
    if (!pool) this.pools.set(kind, (pool = []));
    let mat = pool.pop();
    if (!mat) {
      const prog: { color: unknown; position?: unknown } = this.programs[kind];
      mat = shareResource(fxMaterial() as Mat);
      mat.colorNode = prog.color as Mat['colorNode'];
      if (prog.position) mat.positionNode = prog.position as Mat['positionNode'];
    }
    return { mat, pool };
  }

  private start(geo: THREE.BufferGeometry, kind: keyof MeshFx['programs'], life: number, tick: Active['tick'], order: number, ownShape = false) {
    const { mat, pool } = this.take(kind);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = order;
    (mat.fxColor as THREE.Color).setRGB(1, 1, 1);
    Object.assign(mat, { fxFade: 1, fxErode: -1, fxSeed: Math.random() * 7, fxGain: 1 });
    this.root.add(mesh);
    const a: Active = { mesh, mat, age: 0, life, tick, pool, ownShape };
    this.active.push(a);
    tick(0, mat, mesh);
    return a;
  }

  update(dt: number) {
    for (const a of this.active) {
      a.age += dt;
      a.tick(Math.min(1, a.age / a.life), a.mat, a.mesh);
    }
    if (this.active.some((a) => a.age >= a.life)) this.active = this.active.filter((a) => (a.age < a.life ? true : (this.end(a), false)));
  }

  clear() {
    for (const a of this.active) this.end(a);
    this.active = [];
  }

  private end(a: Active) {
    a.mesh.removeFromParent();
    if (a.ownShape) a.mesh.geometry.dispose();
    a.pool.push(a.mat);
  }

  /** A weapon's slash: the band sweeps round in the first third of its life, then its tail eats forward and it erodes away. */
  slash(o: SlashOpts) {
    const life = o.life ?? 0.32;
    const a = this.start(SLASH_GEO, 'slash', life, (p, m) => {
      const head = ease(p / 0.32);
      Object.assign(m, {
        fxHead: head,
        fxTail: 0.92 * smooth(0.28, 1, p),
        fxErode: -0.35 + 1.3 * smooth(0.3, 1, p),
        fxFade: 1 - smooth(0.8, 1, p),
      });
    }, 22);
    a.mesh.position.set(o.x, o.y, o.z);
    (a.mat.fxColor as THREE.Color).setHex(o.color);
    Object.assign(a.mat, { fxDir: o.dir, fxSweep: o.sweep, fxR0: o.r0, fxR1: o.r1, fxTilt: o.tilt ?? 0.3, fxGain: o.gain ?? 1 });
  }

  /** A card on the ground at (x, y, z): it grows from `from` to `to` wide (easing out), fading in and eroding away. */
  decal(o: DecalOpts) {
    const fadeIn = o.fadeIn ?? 0.08, spin = o.spin ?? 0;
    const a = this.start(DECAL_GEO, o.kind, o.life, (p, m, mesh) => {
      const w = o.from + (o.to - o.from) * ease(p);
      mesh.scale.set(w, 1, w);
      Object.assign(m, {
        fxSpin: spin * p,
        fxFade: smooth(0, fadeIn, p) * (1 - smooth(0.7, 1, p)),
        fxErode: -0.4 + 1.25 * smooth(0.35, 1, p),
        // The dust ring: a band riding out to the card's rim, thinning.
        fxRadius: 0.55 + 0.4 * ease(p),
        fxWidth: 0.45 - 0.25 * p,
      });
    }, o.kind === 'dust' ? 19 : 18);
    a.mesh.position.set(o.x, o.y, o.z);
    (a.mat.fxColor as THREE.Color).setHex(o.color);
    a.mat.fxGain = o.gain ?? 1;
  }

  /** A column of light standing at (x, y, z), rising in and fading out. */
  pillar(o: PillarOpts) {
    const a = this.start(PILLAR_GEO, 'pillar', o.life, (p, m, mesh) => {
      const rise = ease(p / 0.25);
      mesh.scale.set(o.radius * (0.6 + 0.4 * rise), o.height * rise, o.radius * (0.6 + 0.4 * rise));
      m.fxFade = smooth(0, 0.1, p) * (1 - smooth(0.55, 1, p));
    }, 23);
    a.mesh.position.set(o.x, o.y, o.z);
    (a.mat.fxColor as THREE.Color).setHex(o.color);
    Object.assign(a.mat, { fxGain: o.gain ?? 1, fxRise: o.rise ?? 1.2 });
  }

  /** A lightning bolt along `pts`: the painted strip jumping to new places as it flickers, then gone. */
  bolt(pts: THREE.Vector3[], color: number, width: number, life: number, gain = 1) {
    let last = -1;
    const a = this.start(boltGeometry(pts, width), 'bolt', life, (p, m) => {
      const step = Math.floor(p * 6);
      if (step !== last) {
        last = step;
        m.fxShift = Math.random() * 4;
      }
      // A quick double flicker, like a real strike.
      m.fxFade = (1 - smooth(0.6, 1, p)) * (p > 0.42 && p < 0.55 ? 0.35 : 1);
    }, 23, true);
    (a.mat.fxColor as THREE.Color).setHex(color);
    a.mat.fxGain = gain;
  }
}
