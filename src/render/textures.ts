import * as THREE from 'three';
import { mulberry32 } from '../core/rng';

/**
 * Procedural surface textures. The Blender models have no UVs, so detail is projected
 * triplanar and used to modulate albedo and, for rock, as a gentle bump map. Everything is
 * generated at startup: no files. Detail is opt-in per call site (stone props, rocks, walls,
 * tree trunks): characters, gear, foliage and most props stay clean flat colour.
 */

export type SurfaceKind =
  | 'metal' | 'cloth' | 'leather' | 'wood' | 'stone' | 'skin' | 'hair' | 'scales'
  | 'bark' | 'leaves' | 'generic';

interface SurfaceParams {
  /** Texture repeats per world unit. */
  scale: number;
  /** How strongly the texture darkens/lightens the base colour (0..1). */
  albedo: number;
  /** Bump strength. 0 skips the bump entirely (albedo only, one texture fetch per plane). */
  bump: number;
}

/**
 * Kept quiet on purpose: at game zoom any fine pattern reads as felt or wood grain, so only
 * rock gets a (gentle) bump and every albedo swing stays small.
 */
export const SURFACES: Record<SurfaceKind, SurfaceParams> = {
  metal: { scale: 1.1, albedo: 0.1, bump: 0 },
  cloth: { scale: 4.5, albedo: 0.1, bump: 0 },
  leather: { scale: 5, albedo: 0.1, bump: 0 },
  wood: { scale: 1.5, albedo: 0.12, bump: 0 },
  stone: { scale: 0.9, albedo: 0.12, bump: 0.2 },
  skin: { scale: 3, albedo: 0.05, bump: 0 },
  hair: { scale: 4, albedo: 0.1, bump: 0 },
  scales: { scale: 0.4, albedo: 0.1, bump: 0 },
  bark: { scale: 1.8, albedo: 0.12, bump: 0 },
  leaves: { scale: 1.2, albedo: 0.1, bump: 0 },
  generic: { scale: 1.8, albedo: 0.1, bump: 0 },
};

export const SIZE = 256;

/**
 * Tileable value noise on a SIZE×SIZE torus; `cellsY` ≠ `cells` stretches it (strands, grain).
 * Never scale the coordinates passed in: that breaks the wrap.
 */
export function tileNoise(seed: number, cells: number, cellsY = cells) {
  const rng = mulberry32(seed);
  const g = Array.from({ length: cells * cellsY }, () => rng());
  const at = (x: number, y: number) => g[(((y % cellsY) + cellsY) % cellsY) * cells + (((x % cells) + cells) % cells)];
  const s = (t: number) => t * t * (3 - 2 * t);
  return (px: number, py: number) => {
    const x = (px / SIZE) * cells, y = (py / SIZE) * cellsY;
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const fx = s(x - x0), fy = s(y - y0);
    const a = at(x0, y0), b = at(x0 + 1, y0), c = at(x0, y0 + 1), d = at(x0 + 1, y0 + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
}

export function fbm(seed: number, base: number, octaves = 4) {
  const layers = Array.from({ length: octaves }, (_, i) => tileNoise(seed + i * 17, base << i));
  return (x: number, y: number) => {
    let v = 0, amp = 0.5, total = 0;
    for (const l of layers) {
      v += l(x, y) * amp;
      total += amp;
      amp *= 0.5;
    }
    return v / total;
  };
}

/** Tileable Worley (cellular) noise: returns [F1, F2] distances in pixels and a random value for the nearest cell. */
export function worley(seed: number, cells: number) {
  const rng = mulberry32(seed);
  const pts = Array.from({ length: cells * cells }, (_, i) => [((i % cells) + rng()) * (SIZE / cells), (Math.floor(i / cells) + rng()) * (SIZE / cells)]);
  const cell = SIZE / cells;
  return (x: number, y: number) => {
    const cx = Math.floor(x / cell), cy = Math.floor(y / cell);
    let f1 = 1e9, f2 = 1e9, id = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const gx = (cx + dx + cells) % cells, gy = (cy + dy + cells) % cells;
      const [px, py] = pts[gy * cells + gx];
      const ox = px + (cx + dx - gx) * cell, oy = py + (cy + dy - gy) * cell;
      const d = Math.hypot(x - ox, y - oy);
      if (d < f1) {
        f2 = f1;
        f1 = d;
        id = ((gy * cells + gx) * 0.618034 + seed * 0.1234) % 1;
      } else if (d < f2) f2 = d;
    }
    return [f1, f2, id] as const;
  };
}

export type Gen = (x: number, y: number) => number;

/** Natural rock: lumpy fbm, soft ridges and a few thin hairline cracks (not a tiled pattern). */
function rock(seed: number): Gen {
  const n = fbm(seed, 4, 5), ridgeN = fbm(seed + 2, 6, 3), cracks = worley(seed + 1, 7), mask = fbm(seed + 3, 3, 3);
  return (x, y) => {
    const [f1, f2] = cracks(x, y);
    // Cracks only in patches, so cell outlines never read as tiles.
    const crack = f2 - f1 < 1.2 && mask(x, y) > 0.58 ? 0.14 : 0;
    const ridge = 1 - Math.abs(ridgeN(x, y) * 2 - 1);
    return 0.28 + n(x, y) * 0.52 + ridge * 0.1 - crack;
  };
}

/**
 * Smooth floor rock for walkable cave, lair and scorched ground: lumpy fbm over broad swells (the
 * lair's lava glows in the low hollows). No cracks or cell edges: at game zoom any line pattern
 * that repeats reads as a decal.
 */
function floorRock(seed: number): Gen {
  const n = fbm(seed, 3, 5), broad = fbm(seed + 4, 2, 3);
  return (x, y) => paintSteps(0.22 + n(x, y) * 0.5 + broad(x, y) * 0.24, 5);
}

/** Flat painted tones in soft steps (see paint.ts posterize; duplicated to keep this module leaf). */
function paintSteps(v: number, steps: number, soft = 0.4) {
  const s = Math.max(0, Math.min(0.9999, v)) * steps, f = Math.floor(s), t = s - f;
  const e = Math.max(0, Math.min(1, (t - (0.5 - soft / 2)) / soft));
  return (f + e * e * (3 - 2 * e)) / steps;
}

const GENERATORS: Record<SurfaceKind, () => Gen> = {
  metal: () => {
    // Hammered plate: broad shallow dents only. No brushing or scratches: directional streaks read
    // as wood grain and scratch lines as gashes (metal shine comes from the environment map).
    const dents = worley(11, 5), soft = fbm(13, 3);
    return (x, y) => {
      const [f1] = dents(x, y);
      const dent = Math.min(1, f1 / 28);
      return 0.4 + dent * dent * 0.3 + (soft(x, y) - 0.5) * 0.2;
    };
  },
  cloth: () => {
    const n = fbm(21, 8);
    return (x, y) => {
      const warp = Math.sin((x / SIZE) * Math.PI * 2 * 48) * 0.5 + 0.5;
      const weft = Math.sin((y / SIZE) * Math.PI * 2 * 48) * 0.5 + 0.5;
      const over = ((Math.floor((x / SIZE) * 48) + Math.floor((y / SIZE) * 48)) % 2) ? warp : weft;
      return 0.35 + over * 0.45 + (n(x, y) - 0.5) * 0.3;
    };
  },
  leather: () => {
    const cells = worley(31, 22), n = fbm(32, 6);
    return (x, y) => {
      const [f1, f2] = cells(x, y);
      return 0.35 + Math.min(1, (f2 - f1) / 4) * 0.45 + (n(x, y) - 0.5) * 0.35;
    };
  },
  wood: () => {
    const warp = fbm(41, 3), fine = tileNoise(42, 256, 24);
    return (x, y) => {
      const u = x / SIZE + (warp(x, y) - 0.5) * 0.25;
      const rings = Math.sin(u * Math.PI * 2 * 14) * 0.5 + 0.5;
      return 0.3 + rings * 0.45 + (fine(x, y) - 0.5) * 0.3;
    };
  },
  stone: () => rock(51),
  skin: () => {
    const n = fbm(61, 8, 3);
    return (x, y) => 0.45 + n(x, y) * 0.2;
  },
  hair: () => {
    const strands = tileNoise(71, 96, 8), clump = fbm(72, 4);
    return (x, y) => 0.25 + strands(x, y) * 0.55 + (clump(x, y) - 0.5) * 0.3;
  },
  scales: () => {
    // Overlapping scale rows: offset half-discs with a darker rim.
    const rows = 12, cols = 12;
    const n = fbm(81, 8);
    return (x, y) => {
      const r = Math.floor((y / SIZE) * rows);
      const offset = r % 2 ? 0.5 : 0;
      const u = ((x / SIZE) * cols + offset) % 1;
      const v = ((y / SIZE) * rows) % 1;
      const d = Math.hypot(u - 0.5, v * 1.1);
      const disc = d < 0.55 ? 1 - Math.pow(d / 0.55, 3) : 0.1;
      return 0.2 + disc * 0.6 + (n(x, y) - 0.5) * 0.2;
    };
  },
  bark: () => {
    const ridges = fbm(91, 2), n = fbm(92, 16);
    return (x, y) => {
      const u = x / SIZE + (ridges(x, y) - 0.5) * 0.2;
      const r = Math.pow(Math.abs(Math.sin(u * Math.PI * 10)), 0.6);
      return 0.2 + r * 0.55 + (n(x, y) - 0.5) * 0.3;
    };
  },
  leaves: () => {
    const clumps = worley(101, 10), n = fbm(102, 12);
    return (x, y) => {
      const [f1] = clumps(x, y);
      return 0.3 + (1 - Math.min(1, f1 / 18)) * 0.5 + (n(x, y) - 0.5) * 0.35;
    };
  },
  generic: () => {
    const n = fbm(111, 6);
    return (x, y) => 0.4 + n(x, y) * 0.3;
  },
};

const cache = new Map<string, THREE.Texture>();

function makeTexture(key: string, gen: Gen) {
  const data = new Uint8Array(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const v = Math.max(0, Math.min(1, gen(x, y)));
      const i = (y * SIZE + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = v * 255;
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, SIZE, SIZE, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  tex.name = key;
  cache.set(key, tex);
  return tex;
}

export function surfaceTexture(kind: SurfaceKind): THREE.Texture {
  return cache.get(kind) ?? makeTexture(kind, GENERATORS[kind]());
}

/**
 * Tileable noise normalised to the full 0..1 range: masks and animated fluids need real contrast
 * (a raw fbm sits in a narrow band around 0.5).
 */
export function noiseTexture(): THREE.Texture {
  const hit = cache.get('noise');
  if (hit) return hit;
  const n = fbm(301, 4, 5);
  const v = new Float32Array(SIZE * SIZE);
  let lo = 1, hi = 0;
  for (let i = 0; i < v.length; i++) {
    v[i] = n(i % SIZE, Math.floor(i / SIZE));
    lo = Math.min(lo, v[i]);
    hi = Math.max(hi, v[i]);
  }
  return makeTexture('noise', (x, y) => (v[y * SIZE + x] - lo) / (hi - lo));
}

/** Ground atlas: R dirt/pebbles, G grass, B flagstones, A smooth floor rock (cliff faces use 'stone'). */
export function groundTexture(): THREE.Texture {
  const hit = cache.get('ground');
  if (hit) return hit;
  // Painted, calm and large-scale: flat tonal patches, soft clumps, a few big pebbles. No speckle.
  const dirtN = fbm(201, 4, 3), pebbles = worley(202, 9), pebMask = fbm(207, 3, 2);
  const grassN = fbm(203, 4, 3), grassClump = worley(204, 8);
  const flag = worley(205, 5), flagN = fbm(206, 4, 3);
  const cave = floorRock(208);
  const data = new Uint8Array(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const [p1] = pebbles(x, y);
      const pebble = pebMask(x, y) > 0.55 ? Math.max(0, 1 - p1 / 5.5) : 0;
      const dirt = paintSteps(0.25 + dirtN(x, y) * 0.5, 5) + (pebble > 0 ? 0.1 + pebble * 0.06 : 0);
      const [c1] = grassClump(x, y);
      const clump = Math.max(0, 1 - c1 / 17);
      const grass = paintSteps(0.22 + grassN(x, y) * 0.5, 5) + clump * clump * 0.16;
      const [f1, f2, id] = flag(x, y);
      const g = f2 - f1;
      const grout = Math.max(0, Math.min(1, (g - 1.2) / 2.5));
      const rim = Math.max(0, Math.min(1, (g - 2.5) / 3)) * Math.max(0, 1 - (g - 5.5) / 6);
      const face = 0.4 + paintSteps(id, 5) * 0.26 + paintSteps(flagN(x, y), 4) * 0.14 + rim * 0.08;
      const stone = 0.16 + (face - 0.16) * grout;
      const i = (y * SIZE + x) * 4;
      data[i] = Math.max(0, Math.min(1, dirt)) * 255;
      data[i + 1] = Math.max(0, Math.min(1, grass)) * 255;
      data[i + 2] = Math.max(0, Math.min(1, stone)) * 255;
      data[i + 3] = Math.max(0, Math.min(1, cave(x, y))) * 255;
    }
  }
  const tex = new THREE.DataTexture(data, SIZE, SIZE, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  cache.set('ground', tex);
  return tex;
}
