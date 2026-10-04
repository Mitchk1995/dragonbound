import * as THREE from 'three';
import { ShadowNode } from 'three/webgpu';
import { float, Fn, reference, renderGroup, texture, vec2 } from 'three/tsl';
import type { F, V2, V3 } from './patch';
import { shareResource } from './resources';

/**
 * A small "studio" environment for reflective materials: warm light overhead, a neutral horizon,
 * dark ground and two softboxes that put crisp highlights on flat-shaded facets. Without it
 * metal has nothing to reflect and reads as painted wood.
 *
 * Built as an HDR equirectangular DataTexture, so it belongs to no renderer: three.js turns it
 * into a prefiltered (PMREM) map for each renderer on first use (the game's and the item icons').
 * It is set per material, never as scene.environment, so the rest of the lighting is unchanged.
 */

const W = 128, H = 64;

const TOP = [1.35, 1.2, 0.98], HORIZON = [0.3, 0.3, 0.32], GROUND = [0.035, 0.03, 0.03];

/** Softboxes: direction (up-front-left key, back-right rim), angular radius, colour × intensity. */
const SOFTBOXES = [
  { dir: new THREE.Vector3(-0.45, 0.72, 0.53).normalize(), radius: 0.32, color: [3.2, 3.0, 2.7] },
  { dir: new THREE.Vector3(0.75, 0.3, -0.59).normalize(), radius: 0.24, color: [1.3, 1.5, 1.8] },
];

const mix = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * t);
const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Linear HDR radiance seen along a (unit) direction. */
export function studioRadiance(d: THREE.Vector3): [number, number, number] {
  const c = d.y >= 0 ? mix(HORIZON, TOP, Math.pow(d.y, 0.6)) : mix(HORIZON, GROUND, smooth(0, 0.35, -d.y));
  for (const b of SOFTBOXES) {
    const a = Math.acos(Math.max(-1, Math.min(1, d.dot(b.dir))));
    const k = smooth(b.radius, b.radius * 0.7, a);
    for (let i = 0; i < 3; i++) c[i] += b.color[i] * k;
  }
  return [c[0], c[1], c[2]];
}

let env: THREE.DataTexture | null = null;

/** The shared studio environment (built once). */
export function studioEnv(): THREE.DataTexture {
  if (env) return env;
  const data = new Uint16Array(W * H * 4);
  const d = new THREE.Vector3();
  for (let y = 0; y < H; y++) {
    // three.js equirect lookup: v = asin(dir.y) / π + 0.5, u = atan(dir.z, dir.x) / 2π + 0.5.
    const lat = ((y + 0.5) / H - 0.5) * Math.PI;
    for (let x = 0; x < W; x++) {
      const lon = ((x + 0.5) / W - 0.5) * Math.PI * 2;
      d.set(Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon));
      const c = studioRadiance(d);
      const i = (y * W + x) * 4;
      for (let k = 0; k < 3; k++) data[i + k] = THREE.DataUtils.toHalfFloat(c[k]);
      data[i + 3] = THREE.DataUtils.toHalfFloat(1);
    }
  }
  env = shareResource(new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.HalfFloatType));
  env.mapping = THREE.EquirectangularReflectionMapping;
  env.colorSpace = THREE.LinearSRGBColorSpace;
  env.magFilter = env.minFilter = THREE.LinearFilter;
  env.needsUpdate = true;
  return env;
}

/**
 * How forged metal parts reflect. Rough enough that the softboxes spread into soft sheens rather
 * than pinpoints (bright specks would trip the bloom threshold and sparkle).
 */
export const METAL_FINISH = {
  metal: { metalness: 0.85, roughness: 0.34, envMapIntensity: 1 },
  trim: { metalness: 0.9, roughness: 0.32, envMapIntensity: 1 },
  dark: { metalness: 0.6, roughness: 0.5, envMapIntensity: 0.8 },
} as const;

export type Finish = keyof typeof METAL_FINISH;

/** Give a material the studio reflections and a metal finish. */
export function applyFinish(mat: THREE.Material, finish: Finish) {
  if (!(mat instanceof THREE.MeshStandardMaterial)) return;
  Object.assign(mat, METAL_FINISH[finish]);
  mat.envMap = studioEnv();
  mat.needsUpdate = true;
}

// ─── Zone lighting ──────────────────────────────────────────────────────────

/** The theme fields zone lighting reads (a ZoneTheme satisfies it). */
export interface LightingTheme {
  hemi: [number, number, number];
  sun: [number, number];
  wallRise?: number;
  shade?: number;
}

export interface ZoneLighting {
  key: THREE.Color;
  keyIntensity: number;
  /** The sky light from above and the bounce light from the ground below (a hemisphere light). */
  sky: THREE.Color;
  ground: THREE.Color;
  hemiIntensity: number;
  fill: THREE.Color;
  fillIntensity: number;
}

const WARM = new THREE.Color(0xffcf9a), COOL = new THREE.Color(0x8fb0ff);
const warmth = (c: THREE.Color) => c.r - c.b;

/**
 * How the light is shared between the sun (key), the sky light (sky) and the fill, as multiples of
 * the theme's own intensities: `soft` where a theme's shade is 0, `deep` at its full outdoor contrast
 * (1, the default); underground the sky light and fill stay as in `under`. `bounce` is how far the
 * ground light takes the sun's colour; `exposure` scales every zone's exposure to match.
 */
export const LIGHT_BALANCE = {
  soft: { key: 1.05, sky: 0.8, fill: 0.32 },
  deep: { key: 1.6, sky: 0.4, fill: 0.13 },
  under: { sky: 0.8, fill: 0.2 },
  bounce: 0.3,
  exposure: 1.08,
};

/**
 * The lights for a zone, from its theme: a warm key (the sun) strong enough that its shadows read
 * clearly, a gentler sky light (cool from above) and a warm bounce from the sunlit ground below, and
 * a cool fill from the side away from the sun. The ambient occlusion (post.ts) gives the shade
 * its depth, so the sky and bounce light fill the shadows with colour instead of washing them out.
 */
export function zoneLighting(t: LightingTheme): ZoneLighting {
  const under = !!t.wallRise, B = LIGHT_BALANCE, k = t.shade ?? 1;
  const mix = (a: number, b: number) => a + (b - a) * k;
  const sun = new THREE.Color(t.sun[0]);
  // Only nudged if the sun is cooler than WARM (the lair's is warmer already).
  const key = warmth(sun) < warmth(WARM) ? sun.lerp(WARM, 0.3) : sun;
  return {
    key,
    keyIntensity: t.sun[1] * mix(B.soft.key, B.deep.key),
    sky: new THREE.Color(t.hemi[0]),
    ground: new THREE.Color(t.hemi[1]).lerp(key, B.bounce),
    hemiIntensity: t.hemi[2] * (under ? B.under.sky : mix(B.soft.sky, B.deep.sky)),
    fill: new THREE.Color(t.hemi[0]).lerp(COOL, under ? 0.15 : 0.4),
    fillIntensity: t.sun[1] * (under ? B.under.fill : mix(B.soft.fill, B.deep.fill)),
  };
}

/**
 * Soft, steady shadow edges: the stock filter turns its few samples by a per-pixel noise, which
 * reads as a dithered stripe along every shadow edge on a wall or a basin's rim. A fixed 4 × 4 grid
 * of filtered taps across the light's shadow radius gives an even soft edge with no noise. (Set as a
 * light's shadow filter: `light.shadow.filterNode`.)
 */
export const steadyShadows = Fn(({ depthTexture, shadowCoord, shadow }: { depthTexture: THREE.DepthTexture; shadowCoord: V3; shadow: THREE.LightShadow }) => {
  const mapSize = (reference('mapSize', 'vec2', shadow) as unknown as { setGroup(g: unknown): V2 }).setGroup(renderGroup);
  const radius = (reference('radius', 'float', shadow) as unknown as { setGroup(g: unknown): F }).setGroup(renderGroup).div(mapSize.x).mul(0.66).toVar();
  let sum: F = float(0);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    sum = sum.add(texture(depthTexture, shadowCoord.xy.add(vec2(i - 1.5, j - 1.5).mul(radius))).compare(shadowCoord.z) as unknown as F);
  }
  return sum.div(16);
});

/**
 * Keep the shadow pass cheap on the CPU. The pass draws every caster with one shared material that
 * takes each caster's alpha test in turn, and three.js counts each switch between cut-out casters
 * (leaves) and solid ones as a new material version, so every caster's draw re-derived its program
 * key every frame (about 5 ms a frame in the keep). Each caster's draw is built once with its own
 * alpha test either way, so the shared material takes the value without counting a new version.
 */
let shadowPassSteady = false;
export function steadyShadowPass() {
  if (shadowPassSteady) return;
  shadowPassSteady = true;
  const proto = ShadowNode.prototype as unknown as { getShadowMaterial(): THREE.Material };
  const get = proto.getShadowMaterial;
  proto.getShadowMaterial = function (this: unknown) {
    const mat = get.call(this) as THREE.Material & { _alphaTest: number; steadyAlphaTest?: boolean };
    if (!mat.steadyAlphaTest) {
      mat.steadyAlphaTest = true;
      Object.defineProperty(mat, 'alphaTest', {
        get: () => mat._alphaTest,
        set: (v: number) => (mat._alphaTest = v),
      });
    }
    return mat;
  };
}
