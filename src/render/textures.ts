import * as THREE from 'three';
import { mulberry32 } from '../core/rng';

/**
 * Procedural textures, generated at startup (no files). The Blender models have no UVs, so
 * detail is projected in the shader. This module holds the pattern generators and three atlases:
 * the ground atlas (surface.ts applyGround), the character atlas (surface.ts applyCharPaint:
 * painted albedo for characters, creatures and gear) and the legacy per-kind surface textures
 * (applySurface, kept for callers without a painted kind). World props use paint.ts.
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

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const sstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const hash2 = (a: number, b: number, seed: number) => {
  let h = Math.imul((a * 73856093) ^ (b * 19349663) ^ (seed * 83492791), 0x5bd1e995);
  h ^= h >>> 15;
  return ((Math.imul(h, 0x27d4eb2d) ^ (h >>> 13)) >>> 0) / 4294967296;
};
const wrap = (i: number, n: number) => ((i % n) + n) % n;

/**
 * Rescale a generator so its values span 0..1 over the tile (between the 2nd and 98th
 * percentile): raw fbm sits in a narrow band around 0.5 and paints almost nothing. The result
 * only accepts the integer texel coordinates the texture builders pass.
 */
export function stretch(gen: Gen): Gen {
  const v = new Float32Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) v[y * SIZE + x] = gen(x, y);
  const sorted = Float32Array.from(v).sort();
  const lo = sorted[Math.floor(v.length * 0.02)], hi = sorted[Math.floor(v.length * 0.98)];
  return (x, y) => clamp01((v[y * SIZE + x] - lo) / Math.max(1e-6, hi - lo));
}

/**
 * Laid paving: a grid of 16 Ã— 16 half-unit cells packed with stones one to three cells long and
 * one or two deep (so sizes vary and joints never run in long straight lines), dark mortar gaps
 * with a slightly wobbly painted edge, a worn darker bevel round each stone, a paler far edge,
 * and its own tone per stone.
 */
function paving(seed: number): Gen {
  const N = 16, cell = SIZE / N, rng = mulberry32(seed);
  const id = new Int32Array(N * N).fill(-1);
  const rects: [number, number, number, number][] = [];
  for (let cy = 0; cy < N; cy++) {
    for (let cx = 0; cx < N; cx++) {
      if (id[cy * N + cx] >= 0) continue;
      const r = rng();
      let w = r < 0.3 ? 1 : r < 0.75 ? 2 : 3;
      let h = rng() < 0.4 ? 2 : 1;
      w = Math.min(w, N - cx);
      h = Math.min(h, N - cy);
      let free = 0;
      while (free < w && id[cy * N + cx + free] < 0) free++;
      w = free;
      if (h === 2) for (let i = 0; i < w; i++) if (id[(cy + 1) * N + cx + i] >= 0) h = 1;
      const k = rects.length;
      rects.push([cx, cy, w, h]);
      for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) id[(cy + dy) * N + cx + dx] = k;
    }
  }
  const jitter = fbm(seed + 1, 8, 2), mott = stretch(fbm(seed + 2, 6, 3)), broad = stretch(fbm(seed + 3, 2, 2));
  return (x, y) => {
    const k = id[Math.floor(y / cell) * N + Math.floor(x / cell)];
    const [x0, y0, w, h] = rects[k];
    const px = x + 0.5, py = y + 0.5;
    const top = py - y0 * cell;
    // Distance to the stone's edge with worn, rounded corners.
    const dx = Math.min(px - x0 * cell, (x0 + w) * cell - px), dy = Math.min(top, (y0 + h) * cell - py), rc = 4;
    const edge = dx < rc && dy < rc ? rc - Math.hypot(rc - dx, rc - dy) : Math.min(dx, dy);
    const d = edge + (jitter(x, y) - 0.5) * 2.5;
    const tone = 0.54 + (hash2(k, 3, seed) - 0.5) * 0.32 + (broad(x, y) - 0.5) * 0.1 + (paintSteps(mott(x, y), 4, 0.45) - 0.5) * 0.1;
    const bevel = 1 - sstep(1.6, 5.5, d);
    const far = (1 - sstep(1.5, 5, top)) * sstep(1, 2.5, d);
    const face = tone - bevel * 0.12 + far * 0.08;
    return 0.12 + (face - 0.12) * sstep(0.6, 1.8, d);
  };
}

/**
 * Walkable cave and lair floor: wandering strata bands in flat painted tones, broad light and
 * dark patches and scattered pale pebbles. Never darker than ~0.38, so the lair's lava only
 * glows in the rim pools, not through the floor.
 */
function floorStrata(seed: number): Gen {
  const warp = fbm(seed, 2, 3), bands = tileNoise(seed + 1, 1, 7), broad = stretch(fbm(seed + 2, 2, 3)), blot = stretch(fbm(seed + 3, 6, 3));
  const peb = worley(seed + 4, 12), pebMask = fbm(seed + 5, 3, 2);
  const strata = stretch((x, y) => bands(x, y + (warp(x, y) - 0.5) * 110));
  return (x, y) => {
    const [p1] = peb(x, y);
    const pebble = pebMask(x, y) > 0.54 ? 1 - sstep(2.5, 4.5, p1) : 0;
    const v = paintSteps(strata(x, y) * 0.6 + broad(x, y) * 0.4, 5, 0.35);
    return 0.4 + v * 0.42 + (blot(x, y) - 0.5) * 0.06 + pebble * 0.1;
  };
}

/** Ground atlas: R dirt/pebbles, G grass, B laid paving, A cave/lair floor rock (cliff faces use the painted rock). */
export function groundTexture(): THREE.Texture {
  const hit = cache.get('ground');
  if (hit) return hit;
  // Painted, calm and large-scale: flat tonal patches, soft clumps, a few big pebbles. No speckle.
  const dirtN = fbm(201, 4, 3), pebbles = worley(202, 9), pebMask = fbm(207, 3, 2);
  // Dirt detail: small pebbles (pale, with a dark rim where they sit in the soil) and a fine grain
  // of light and dark flecks, so bare ground reads as earth rather than a smooth brown wash.
  const stones = worley(209, 22), stoneMask = fbm(210, 4, 2), grainD = worley(211, 48);
  const grassN = fbm(203, 4, 3), grassClump = worley(204, 8);
  const stone = paving(205);
  const cave = floorStrata(208);
  const data = new Uint8Array(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const [p1] = pebbles(x, y);
      const pebble = pebMask(x, y) > 0.55 ? Math.max(0, 1 - p1 / 5.5) : 0;
      const [s1, , sid] = stones(x, y);
      const stoneR = 2.2 + sid * 1.6;
      const rockBit = stoneMask(x, y) > 0.46 ? (s1 < stoneR ? 0.14 + (1 - s1 / stoneR) * 0.06 : s1 < stoneR + 1.2 ? -0.1 : 0) : 0;
      const [g1, , gid] = grainD(x, y);
      const fleck = g1 < 1.2 ? (gid > 0.5 ? 0.07 : -0.07) : 0;
      const dirt = paintSteps(0.25 + dirtN(x, y) * 0.5, 5) + (pebble > 0 ? 0.1 + pebble * 0.06 : 0) + rockBit + fleck;
      const [c1] = grassClump(x, y);
      const clump = Math.max(0, 1 - c1 / 17);
      const grass = paintSteps(0.22 + grassN(x, y) * 0.5, 5) + clump * clump * 0.16;
      const i = (y * SIZE + x) * 4;
      data[i] = clamp01(dirt) * 255;
      data[i + 1] = clamp01(grass) * 255;
      data[i + 2] = clamp01(stone(x, y)) * 255;
      data[i + 3] = clamp01(cave(x, y)) * 255;
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

// ─── Character atlas ────────────────────────────────────────────────────────

/**
 * Overlapping dragon scales in rows (four across the tile): free edges point down (V is up on
 * side faces), each scale lit across its bulge with its own tone, a darker rim along its edge and
 * a soft shadow where it tucks under the row above.
 */
function scaleRows(seed: number): Gen {
  const cols = 4, w = SIZE / cols, rh = w / 2, rows = SIZE / rh, R = w * 0.6;
  const blot = fbm(seed + 1, 4, 2);
  const inRow = (j: number, x: number, y: number) => {
    const off = wrap(j, 2) * 0.5, cy = j * rh;
    const k0 = Math.round(x / w - off);
    let best = Infinity, bk = 0;
    for (let k = k0 - 1; k <= k0 + 1; k++) {
      const d = Math.hypot(x - (k + off) * w, y - cy);
      if (d < best) {
        best = d;
        bk = k;
      }
    }
    return { d: best, k: bk, cx: (bk + off) * w, cy };
  };
  return (x, y) => {
    const px = x + 0.5, py = y + 0.5;
    // Highest row first: a scale overlaps the ones below it.
    for (let j = Math.floor((py + R) / rh); j >= Math.ceil((py - R) / rh); j--) {
      const s = inRow(j, px, py);
      if (s.d >= R) continue;
      const above = inRow(j + 1, px, py).d - R;
      const tuck = 1 - sstep(0, 7, above);
      const rr = s.d / R;
      const bulge = 1 - sstep(0.05, 0.75, Math.hypot(px - s.cx, py - (s.cy - R * 0.3)) / R);
      const v = 0.55 + (hash2(wrap(j, rows), wrap(s.k, cols), seed) - 0.5) * 0.12 + bulge * 0.12 - sstep(0.7, 0.98, rr) * 0.26 - tuck * 0.16 + (blot(x, y) - 0.5) * 0.06;
      return paintSteps(v, 6, 0.55);
    }
    return 0.4;
  };
}

/**
 * The character atlas: four calm painted patterns, one per channel, 0.5 = the base colour.
 * R mottle (leather, skin, hide, stone, bone), G vertical brushing (metal, wood grain, hair
 * strands), B cloth folds with a faint large weave, A dragon scales. One texture, one fetch.
 */
export function charTexture(): THREE.Texture {
  const hit = cache.get('char');
  if (hit) return hit;
  const mottle = stretch(fbm(701, 3, 4)), mottleFine = stretch(fbm(702, 8, 2));
  const streak = tileNoise(711, 40, 1), streak2 = tileNoise(712, 17, 1), brushBroad = stretch(fbm(713, 2, 3));
  const foldWarp = fbm(721, 2, 2), folds = tileNoise(722, 5, 1), clothBlot = stretch(fbm(723, 3, 3));
  const scales = scaleRows(731);
  const foldN = stretch((x, y) => folds(x + (foldWarp(x, y) - 0.5) * 70, y));
  const data = new Uint8Array(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const r = 0.5 + (paintSteps(mottle(x, y), 5, 0.5) - 0.5) * 0.85 + (mottleFine(x, y) - 0.5) * 0.15;
      const g = 0.5 + (streak(x, y) - 0.5) * 0.4 + (streak2(x, y) - 0.5) * 0.2 + (brushBroad(x, y) - 0.5) * 0.5;
      const weave = ((Math.floor(x / 8) + Math.floor(y / 8)) % 2 ? 1 : -1) * 0.025;
      const b = 0.5 + (paintSteps(foldN(x, y), 4, 0.7) - 0.5) * 0.6 + (clothBlot(x, y) - 0.5) * 0.25 + weave;
      const i = (y * SIZE + x) * 4;
      data[i] = clamp01(r) * 255;
      data[i + 1] = clamp01(g) * 255;
      data[i + 2] = clamp01(b) * 255;
      data[i + 3] = clamp01(scales(x, y)) * 255;
    }
  }
  const tex = new THREE.DataTexture(data, SIZE, SIZE, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  tex.name = 'char';
  cache.set('char', tex);
  return tex;
}

/**
 * Hammered plate: shallow dishes left by the hammer (tileable cells), each lit on its lower
 * inside (it faces up) and shaded under its upper lip, fading out where two dishes meet. 0.5 = flat.
 */
function hammered(seed: number, cells: number): Gen {
  const rng = mulberry32(seed);
  const cell = SIZE / cells;
  const pts = Array.from({ length: cells * cells }, (_, i) => [((i % cells) + 0.15 + rng() * 0.7) * cell, (Math.floor(i / cells) + 0.15 + rng() * 0.7) * cell, rng()]);
  return (x, y) => {
    const px = x + 0.5, py = y + 0.5;
    const cx = Math.floor(px / cell), cy = Math.floor(py / cell);
    let f1 = 1e9, f2 = 1e9, ox = 0, oy = 0, tone = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const gx = wrap(cx + dx, cells), gy = wrap(cy + dy, cells);
      const [qx, qy, t] = pts[gy * cells + gx];
      const ax = qx + (cx + dx - gx) * cell, ay = qy + (cy + dy - gy) * cell;
      const d = Math.hypot(px - ax, py - ay);
      if (d < f1) {
        f2 = f1;
        f1 = d;
        ox = px - ax;
        oy = py - ay;
        tone = t;
      } else if (d < f2) f2 = d;
    }
    const R = cell * 0.75;
    const dish = Math.max(0, 1 - (f1 / R) ** 2);
    // Concave: the half below the centre faces up (lit), the half above faces down (shaded).
    const lit = (-oy / R) * dish * 0.5 + (ox / R) * dish * 0.12;
    // Soft where dishes meet: no outline (hard cell edges read as cracked stone).
    const blend = sstep(0, 6, f2 - f1);
    return paintSteps(0.5 + (lit * 0.9 + (tone - 0.5) * 0.1) * blend, 6, 0.75);
  };
}

/**
 * Forged-metal atlas (surface.ts applyCharPaint, `forge` recipes): R hammered dishes, G fine
 * horizontal draw-marks (the grain the hammer and file leave along a plate), B broad grime and
 * soot blotches, A fine pitting. 0.5 = the base colour; one fetch.
 */
export function forgeTexture(): THREE.Texture {
  const hit = cache.get('forge');
  if (hit) return hit;
  const ham = hammered(741, 9);
  const grain = tileNoise(742, 3, 110), grain2 = tileNoise(743, 7, 46), grainBroad = stretch(fbm(744, 2, 2));
  const grime = stretch(fbm(745, 3, 4)), pit = stretch(fbm(746, 16, 2));
  const data = new Uint8Array(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const g = 0.5 + (grain(x, y) - 0.5) * 0.55 + (grain2(x, y) - 0.5) * 0.3 + (grainBroad(x, y) - 0.5) * 0.3;
      const b = paintSteps(grime(x, y), 5, 0.6);
      const i = (y * SIZE + x) * 4;
      data[i] = clamp01(ham(x, y)) * 255;
      data[i + 1] = clamp01(g) * 255;
      data[i + 2] = clamp01(b) * 255;
      data[i + 3] = clamp01(pit(x, y)) * 255;
    }
  }
  const tex = new THREE.DataTexture(data, SIZE, SIZE, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  tex.name = 'forge';
  cache.set('forge', tex);
  return tex;
}
