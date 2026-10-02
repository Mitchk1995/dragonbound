import * as THREE from 'three';
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
}

export interface ZoneLighting {
  key: THREE.Color;
  keyIntensity: number;
  hemiIntensity: number;
  fill: THREE.Color;
  fillIntensity: number;
}

const WARM = new THREE.Color(0xffcf9a), COOL = new THREE.Color(0x8fb0ff);
const warmth = (c: THREE.Color) => c.r - c.b;

/**
 * The lights for a zone, from its theme: a slightly warmer key (sun), a little less flat
 * hemisphere ambient, and a cool fill from the side away from the sun (sky colour pushed toward
 * blue; underground it stays close to the cave's own warm bounce). Warm lit sides against cool
 * shaded sides carve form without darkening the scene: the total light stays about the same.
 */
export function zoneLighting(t: LightingTheme): ZoneLighting {
  const under = !!t.wallRise;
  const sun = new THREE.Color(t.sun[0]);
  return {
    // Only nudged if the sun is cooler than WARM (the lair's is warmer already).
    key: warmth(sun) < warmth(WARM) ? sun.lerp(WARM, 0.2) : sun,
    keyIntensity: t.sun[1] * 1.05,
    hemiIntensity: t.hemi[2] * 0.8,
    fill: new THREE.Color(t.hemi[0]).lerp(COOL, under ? 0.15 : 0.4),
    fillIntensity: t.sun[1] * (under ? 0.2 : 0.32),
  };
}

/**
 * Soft, steady shadow edges: the stock PCF filter turns its few samples by a per-pixel noise, which
 * reads as a dithered stripe along every shadow edge on a wall or a basin's rim. A fixed 4 × 4 grid
 * of filtered taps across the light's shadow radius gives an even soft edge with no noise. (Patched into the shader
 * chunk once, before any material compiles.)
 */
export function steadyShadows() {
  const chunk = THREE.ShaderChunk.shadowmap_pars_fragment;
  if (chunk.includes('steady-shadows')) return;
  const next = chunk.replace(/float phi = interleavedGradientNoise\( gl_FragCoord\.xy \) \* PI2;[\s\S]*?\) \* 0\.2;/, `// steady-shadows
				shadow = 0.0;
				for ( int i = 0; i < 4; i ++ ) for ( int j = 0; j < 4; j ++ ) {
					shadow += texture( shadowMap, vec3( shadowCoord.xy + ( vec2( float( i ), float( j ) ) - 1.5 ) * radius * 0.66, shadowCoord.z ) );
				}
				shadow /= 16.0;`);
  if (next === chunk) throw new Error('steadyShadows: the shadow chunk has changed; update the patch');
  THREE.ShaderChunk.shadowmap_pars_fragment = next;
}
