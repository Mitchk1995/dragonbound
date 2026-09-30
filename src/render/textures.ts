import * as THREE from 'three';
import { mulberry32 } from '../core/rng';

/**
 * Procedural surface textures. The Blender models have no UVs, so detail is projected
 * triplanar (object space for characters/gear, world space for the environment) and used
 * both to modulate albedo and as a bump map. Everything is generated at startup: no files.
 */

export type SurfaceKind =
  | 'metal' | 'cloth' | 'leather' | 'wood' | 'stone' | 'skin' | 'hair' | 'scales'
  | 'bark' | 'leaves' | 'generic';

interface SurfaceParams {
  /** Texture repeats per world unit. */
  scale: number;
  /** How strongly the texture darkens/lightens the base colour (0..1). */
  albedo: number;
  /** Bump strength. */
  bump: number;
}

export const SURFACES: Record<SurfaceKind, SurfaceParams> = {
  metal: { scale: 1.1, albedo: 0.2, bump: 0.3 },
  cloth: { scale: 4.5, albedo: 0.32, bump: 0.7 },
  leather: { scale: 2.6, albedo: 0.34, bump: 0.8 },
  wood: { scale: 1.5, albedo: 0.42, bump: 0.9 },
  stone: { scale: 0.9, albedo: 0.45, bump: 1.2 },
  skin: { scale: 3, albedo: 0.1, bump: 0.2 },
  hair: { scale: 4, albedo: 0.4, bump: 0.8 },
  scales: { scale: 0.4, albedo: 0.34, bump: 1.0 },
  bark: { scale: 1.8, albedo: 0.5, bump: 1.3 },
  leaves: { scale: 1.2, albedo: 0.45, bump: 1.1 },
  generic: { scale: 1.8, albedo: 0.18, bump: 0.5 },
};

const SIZE = 256;

/**
 * Tileable value noise on a SIZE×SIZE torus; `cellsY` ≠ `cells` stretches it (strands, grain).
 * Never scale the coordinates passed in: that breaks the wrap.
 */
function tileNoise(seed: number, cells: number, cellsY = cells) {
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

function fbm(seed: number, base: number, octaves = 4) {
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
function worley(seed: number, cells: number) {
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

type Gen = (x: number, y: number) => number;

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

const GENERATORS: Record<SurfaceKind, () => Gen> = {
  metal: () => {
    // Hammered plate: broad shallow dents plus fine brushing and a few scratches.
    const dents = worley(11, 5), brush = tileNoise(12, 64, 3), soft = fbm(13, 3);
    const scratches = Array.from({ length: 8 }, (_, i) => {
      const r = mulberry32(100 + i);
      return { x: r() * SIZE, y: r() * SIZE, a: r() * Math.PI, len: 20 + r() * 50 };
    });
    return (x, y) => {
      const [f1] = dents(x, y);
      const dent = Math.min(1, f1 / 28);
      let v = 0.4 + dent * dent * 0.3 + (soft(x, y) - 0.5) * 0.2 + (brush(x, y) - 0.5) * 0.08;
      for (const s of scratches) {
        const dx = x - s.x, dy = y - s.y;
        const along = dx * Math.cos(s.a) + dy * Math.sin(s.a);
        const across = -dx * Math.sin(s.a) + dy * Math.cos(s.a);
        if (Math.abs(along) < s.len && Math.abs(across) < 0.8) v -= 0.15;
      }
      return v;
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

/** Ground atlas: R dirt/pebbles, G grass, B flagstones, A cave rock. */
export function groundTexture(): THREE.Texture {
  const hit = cache.get('ground');
  if (hit) return hit;
  const dirtN = fbm(201, 6), pebbles = worley(202, 20);
  const grassN = fbm(203, 32, 2), grassSpeck = tileNoise(207, 128), grassClump = fbm(204, 6);
  const flag = worley(205, 5), flagN = fbm(206, 8);
  const cave = rock(208);
  const data = new Uint8Array(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const [p1] = pebbles(x, y);
      const dirt = 0.35 + dirtN(x, y) * 0.4 + (p1 < 3.5 ? 0.25 : 0);
      const grass = 0.3 + grassN(x, y) * 0.35 + grassSpeck(x, y) * 0.15 + (grassClump(x, y) - 0.5) * 0.3;
      const [f1, f2, id] = flag(x, y);
      const grout = Math.min(1, (f2 - f1) / 5);
      const stone = (0.4 + id * 0.25 + flagN(x, y) * 0.25) * (0.5 + 0.5 * Math.sqrt(grout));
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
