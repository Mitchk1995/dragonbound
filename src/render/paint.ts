import * as THREE from 'three';
import { shareResource } from './resources';
import { mulberry32 } from '../core/rng';
import { addPatch, type SurfaceSpace } from './surface';
import { applyRock } from './rock';
import { fbm, SIZE, tileNoise, worley, type Gen } from './textures';

/**
 * Hand-painted albedo (colour only: no bump, no normal changes), in the spirit of WoW and
 * Torchlight: flat painted tones in soft steps, painted mortar and seams, lighter top edges,
 * warm lights and cool darks. Patterns are large and calm so they read as painted detail from
 * the top-down camera, never as noise.
 *
 * Everything is generated at startup into a few RGBA atlases (one pattern per channel), so every
 * painted material binds one texture and makes one fetch: box projection picks the face's
 * dominant axis, with the texture's V always along world/object up on side faces, so courses,
 * strata and plank seams never flip direction between faces.
 *
 * Reusable: `applyPaint(material, kind, space)` works on any MeshStandardMaterial; 'object' space
 * keeps the pattern fixed to a model as it moves (characters, props), 'world' lines it up across
 * instances (rocks, walls).
 */

export type PaintKind = 'masonry' | 'ashlar' | 'rock' | 'wood' | 'shingle' | 'bone' | 'hide' | 'plaster' | 'soft' | 'bark' | 'leaves' | 'needles' | 'foliage' | 'grain';

interface PaintParams {
  atlas: 0 | 1 | 2 | 3;
  channel: 0 | 1 | 2 | 3;
  /** Pattern repeats per unit (one tile = 1 / scale units). */
  scale: number;
  /** How strongly the paint lightens/darkens the base colour (0..1). */
  amount: number;
}

export const PAINTS: Record<PaintKind, PaintParams> = {
  masonry: { atlas: 0, channel: 0, scale: 0.5, amount: 0.34 },
  /** The castle's dressed limestone: the masonry pattern, painted a little stronger, damp and cool at its foot. */
  ashlar: { atlas: 0, channel: 0, scale: 0.5, amount: 0.38 },
  rock: { atlas: 0, channel: 1, scale: 0.33, amount: 0.3 },
  wood: { atlas: 0, channel: 2, scale: 0.8, amount: 0.3 },
  shingle: { atlas: 0, channel: 3, scale: 0.55, amount: 0.34 },
  bone: { atlas: 1, channel: 0, scale: 1.2, amount: 0.3 },
  hide: { atlas: 1, channel: 1, scale: 0.7, amount: 0.24 },
  plaster: { atlas: 1, channel: 2, scale: 0.5, amount: 0.2 },
  soft: { atlas: 1, channel: 3, scale: 0.6, amount: 0.18 },
  bark: { atlas: 2, channel: 0, scale: 1.0, amount: 0.4 },
  leaves: { atlas: 2, channel: 1, scale: 0.5, amount: 0.48 },
  needles: { atlas: 2, channel: 2, scale: 0.6, amount: 0.46 },
  foliage: { atlas: 2, channel: 3, scale: 0.42, amount: 0.5 },
  /** A door's boards: the grain of each board, stained, with no seams (the boards are built apart). */
  grain: { atlas: 3, channel: 0, scale: 0.5, amount: 0.42 },
};

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Quantise into `steps` flat tones with soft transitions: the painted look. */
export const posterize = (v: number, steps = 5, soft = 0.4) => {
  const s = Math.max(0, Math.min(0.9999, v)) * steps, f = Math.floor(s);
  return (f + smooth(0.5 - soft / 2, 0.5 + soft / 2, s - f)) / steps;
};

const hash = (a: number, b: number, seed: number) => {
  let h = Math.imul(a * 73856093 ^ b * 19349663 ^ seed * 83492791, 0x5bd1e995);
  h ^= h >>> 15;
  return ((Math.imul(h, 0x27d4eb2d) ^ (h >>> 13)) >>> 0) / 4294967296;
};

/**
 * Painted generators: (x, y) in texels (y = up on side faces) → value 0..1, 0.5 = base colour.
 * All tile seamlessly on the SIZE × SIZE torus.
 */
export const PAINTERS: Record<PaintKind, () => Gen> = {
  masonry: () => {
    // Four courses per tile, dressed blocks in running bond as a mason lays them: each block between
    // one and a half and three times as long as its course is high (never a square or upright
    // block), each course's joints falling over the middle of the blocks below, painted mortar, a
    // lighter top edge on each block and a soft shadow under it.
    const rows = 4, rowH = SIZE / rows, rng = mulberry32(501);
    const layout = Array.from({ length: rows }, (_, r) => {
      const off = (r * 76 + Math.floor(rng() * 24)) % SIZE, edges: number[] = [];
      for (let x = 0; x < SIZE;) {
        let l = 104 + Math.floor(rng() * 5) * 16;
        if (SIZE - x - l < 96) l = SIZE - x;
        edges.push(x);
        x += l;
      }
      return { off, edges };
    });
    const blotch = fbm(502, 4, 3), fine = fbm(503, 16, 2);
    return (x, y) => {
      const r = Math.floor(y / rowH), fy = y - r * rowH;
      const { off, edges } = layout[r];
      const xx = (x + off) % SIZE;
      let b = 0;
      while (b + 1 < edges.length && edges[b + 1] <= xx) b++;
      const x1 = b + 1 < edges.length ? edges[b + 1] : SIZE;
      const joint = Math.min(xx - edges[b], x1 - xx);
      const inside = smooth(1.5, 4, joint) * smooth(1.5, 4, Math.min(fy, rowH - fy));
      let v = 0.47 + (hash(r, b, 7) - 0.5) * 0.24 + posterize(blotch(x, y), 4) * 0.2 - 0.1 + (fine(x, y) - 0.5) * 0.05;
      v += 0.11 * smooth(rowH - 14, rowH - 5, fy) - 0.07 * (1 - smooth(4, 14, fy));
      return 0.17 + (v - 0.17) * inside;
    };
  },
  // The castle's ashlar shares the masonry's pattern (and its atlas channel).
  ashlar: () => PAINTERS.masonry(),
  rock: () => {
    // Painted strata: soft horizontal bands that wander, in flat tones, with pale chips.
    const warp = fbm(511, 2, 3), bands = tileNoise(512, 2, 12), blotch = fbm(513, 3, 3), chips = worley(514, 7);
    return (x, y) => {
      const b = bands(x, y + (warp(x, y) - 0.5) * 60);
      const [f1] = chips(x, y);
      const chip = f1 < 5 && blotch(x + 90, y) > 0.56 ? 0.08 : 0;
      return posterize(0.25 + b * 0.45 + blotch(x, y) * 0.25, 5) + chip;
    };
  },
  wood: () => {
    // Planks (seams every 32 texels) with soft grain streaks along them and per-plank tone.
    const grain = tileNoise(521, 48, 3), soft = fbm(522, 3, 3);
    return (x, y) => {
      const p = Math.floor(x / 32), fx = x - p * 32;
      const seam = smooth(0.8, 2.6, Math.min(fx, 32 - fx));
      const v = 0.5 + (hash(p, 0, 9) - 0.5) * 0.18 + (posterize(grain(x, y), 4) - 0.5) * 0.2 + (soft(x, y) - 0.5) * 0.12;
      return 0.2 + (v - 0.2) * seam;
    };
  },
  shingle: () => {
    // Rows of tiles in running bond, each with its own tone, lit in the middle, dark joints.
    const rows = 8, rowH = SIZE / rows, tileW = 32, soft = fbm(531, 3, 3);
    return (x, y) => {
      const r = Math.floor(y / rowH), fy = y - r * rowH;
      const xx = (x + (r % 2) * (tileW / 2)) % SIZE, t = Math.floor(xx / tileW), fx = xx - t * tileW;
      const joint = smooth(0.8, 2.5, Math.min(fx, tileW - fx)) * smooth(1, 3, Math.min(fy, rowH - fy));
      const v = 0.46 + (hash(r, t, 11) - 0.5) * 0.26 + 0.1 * (1 - Math.abs(fy - rowH / 2) / (rowH / 2)) + (soft(x, y) - 0.5) * 0.12;
      return 0.18 + (v - 0.18) * joint;
    };
  },
  bone: () => {
    // Clean bone with painted grime pooling in patches.
    const grime = fbm(541, 3, 3), fine = fbm(542, 8, 2);
    return (x, y) => 0.62 - posterize(grime(x, y), 4) * 0.3 - (fine(x, y) - 0.5) * 0.08;
  },
  hide: () => {
    const blot = fbm(551, 4, 3), stitch = tileNoise(552, 24, 2);
    return (x, y) => posterize(0.3 + blot(x, y) * 0.45, 4) + (stitch(x, y) - 0.5) * 0.06;
  },
  plaster: () => {
    const stain = fbm(561, 3, 3), fine = fbm(562, 12, 2);
    return (x, y) => 0.58 - posterize(stain(x, y), 4) * 0.2 + (fine(x, y) - 0.5) * 0.05;
  },
  soft: () => {
    const blot = fbm(571, 3, 3);
    return (x, y) => posterize(0.25 + blot(x, y) * 0.5, 5);
  },
  bark: () => {
    // Vertical bark plates: dark grooves between lighter ridges, broken up along their length.
    const strips = tileNoise(581, 6, 2), breaks = tileNoise(582, 12, 4), blot = fbm(583, 3, 2);
    return (x, y) => {
      const s = strips(x, y) * 0.75 + breaks(x, y) * 0.25;
      const groove = smooth(0.42, 0.26, s), ridge = smooth(0.58, 0.74, s);
      return 0.52 - groove * 0.3 + ridge * 0.14 + (blot(x, y) - 0.5) * 0.1;
    };
  },
  leaves: () => {
    // Leaf clusters of mixed sizes (a few big masses, many small sprigs), each an irregular lobed
    // blob turned its own way and lit from a slightly different side, tucked under whichever
    // cluster lies over it, with a few painted leaf dabs. No row order, so no fish-scale repeat.
    const dabs = worley(592, 14), blot = fbm(593, 3, 2);
    return clumps(591, 4, (c, x, y) => {
      const [f1] = dabs(x, y);
      const dab = f1 < 3.5 ? (c.light > 0.55 ? 0.08 : -0.06) : 0;
      return posterize(0.3 + c.light * 0.36 + (c.tone - 0.5) * 0.2 - c.rim * 0.15 - c.tuck * 0.2 + dab + (blot(x, y) - 0.5) * 0.08, 5);
    }, { size: [0.6, 1.35], lobes: 0.07, stretch: 0.3, turn: 0.6, order: 0.8 });
  },
  needles: () => {
    // Pine: tiers of needle tufts hanging over the ones below, streaked along the needles, pale
    // tips along each tuft's lower edge and a dark shadow under the tier above.
    const streak = tileNoise(602, 40, 3), blot = fbm(603, 3, 2);
    return clumps(601, 6, (c, x, y) => {
      const tip = smooth(0.6, 0.82, c.d) * (c.ly < 0 ? 1 : 0) * (1 - c.rim);
      return posterize(0.3 + c.light * 0.3 + (c.tone - 0.5) * 0.1 + tip * 0.12 - c.rim * 0.2 - c.tuck * 0.24 + (streak(x, y) - 0.5) * 0.16 + (blot(x, y) - 0.5) * 0.06, 5);
    });
  },
  foliage: () => {
    // Leaf masses for block canopies: many small scalloped leaf clusters, each lit from its upper
    // side with a pale leaf dab or two, tucked under its neighbours with only a soft shade (no
    // hard outline, so a large flat face reads as foliage, not paving), over a slow light/dark
    // drift so no two blocks look stamped.
    const dabs = worley(612, 22), drift = fbm(613, 2, 2), blot = fbm(614, 5, 2);
    return clumps(611, 8, (c, x, y) => {
      const [f1] = dabs(x, y);
      const dab = f1 < 2.6 ? (c.light > 0.5 ? 0.1 : -0.05) : 0;
      return posterize(0.31 + c.light * 0.36 + (c.tone - 0.5) * 0.2 - c.rim * 0.08 - c.tuck * 0.15 + dab + (drift(x, y) - 0.5) * 0.24 + (blot(x, y) - 0.5) * 0.06, 6);
    }, { size: [0.7, 1.25], lobes: 0.14, stretch: 0.25, turn: 0.7, order: 0.9 });
  },
  grain: () => {
    // Long grain running up the board: fine streaks and broader growth bands that drift across as
    // they climb, a few dark knots with the grain swept round them, and the stain pooled darker in
    // soft weathered patches.
    const streak = tileNoise(621, 96, 2), bands = tileNoise(622, 20, 3), drift = fbm(623, 2, 2), weather = fbm(624, 3, 3);
    const knots = Array.from({ length: 5 }, (_, i) => [hash(i, 1, 625) * SIZE, hash(i, 2, 625) * SIZE, 5 + hash(i, 3, 625) * 5]);
    return (x, y) => {
      let sweep = 0, knot = 0;
      for (const [kx, ky, kr] of knots) for (const ox of [-SIZE, 0, SIZE]) for (const oy of [-SIZE, 0, SIZE]) {
        const dx = x - kx - ox, dy = (y - ky - oy) * 0.45, d = Math.hypot(dx, dy);
        knot = Math.max(knot, smooth(kr, kr * 0.5, d));
        sweep += Math.sign(dx) * kr * 1.8 * Math.exp(-(d * d) / (kr * kr * 9));
      }
      const xx = x + (drift(x, y) - 0.5) * 26 + sweep;
      const v = 0.5 + (streak(xx, y) - 0.5) * 0.34 + (posterize(bands(xx, y), 4) - 0.5) * 0.3 - posterize(weather(x, y), 3) * 0.16 + 0.06;
      return v * (1 - 0.55 * knot);
    };
  },
};

interface Clump {
  /** 0..1: lit toward the clump's upper left. */
  light: number;
  /** Dark band along the clump's lower (free) edge. */
  rim: number;
  /** Shadow cast by the clump above. */
  tuck: number;
  /** Distance from the clump centre as a share of its radius, and height within it (-1..1). */
  d: number;
  ly: number;
  /** Per-clump random tone. */
  tone: number;
}

interface ClumpStyle {
  /** Radius range, as a share of the grid cell (default 0.95..1.15: even clumps). */
  size?: [number, number];
  /** Lobed outline: how far the rim wanders in and out (0 = round). */
  lobes?: number;
  /** Up to this much longer along a random axis (0 = round). */
  stretch?: number;
  /** Up to this much (radians) each clump's light direction turns either way. */
  turn?: number;
  /** Stacking order jitter, in cells (0 = strictly the higher clump on top). */
  order?: number;
}

/**
 * Jittered clumps, n × n per tile, where the higher clump overlaps the lower one (V is up on side
 * faces), shaded by `shade`. `style` varies their size, outline, orientation, lighting and
 * stacking so they need not form regular rows. Tiles seamlessly.
 */
function clumps(seed: number, n: number, shade: (c: Clump, x: number, y: number) => number, style: ClumpStyle = {}): Gen {
  const cell = SIZE / n, rng = mulberry32(seed);
  const [s0, s1] = style.size ?? [0.95 * 0.9, 1.15 * 0.9];
  const lobes = style.lobes ?? 0, stretch = style.stretch ?? 0, turn = style.turn ?? 0, order = style.order ?? 0;
  const styled = style.size !== undefined;
  const pts = Array.from({ length: n * n }, (_, i) => {
    const x = ((i % n) + 0.15 + rng() * 0.7) * cell, y = (Math.floor(i / n) + 0.15 + rng() * 0.7) * cell, t = rng();
    // Styled: skewed toward small, a few big masses among many smaller sprigs.
    const sz = s0 + (s1 - s0) * (styled ? Math.pow(rng(), 1.6) : rng());
    const ax = styled ? rng() * Math.PI : 0, turnA = styled ? (rng() - 0.5) * 2 * turn : 0;
    return {
      x, y, t, r: cell * sz,
      ca: Math.cos(ax), sa: Math.sin(ax), k: 1 + (styled ? rng() : 0) * stretch, lc: Math.cos(turnA), ls: Math.sin(turnA),
      pri: styled ? (rng() - 0.5) * order * cell : 0, lobeN: styled ? 6 + Math.floor(rng() * 4) : 0, lobeP: styled ? rng() * 6.283 : 0,
    };
  });
  type P = (typeof pts)[number];
  const wrap = (i: number) => ((i % n) + n) % n;
  const reach = Math.ceil(s1 * (1 + stretch) * (1 + lobes) + 0.9);
  return (x, y) => {
    const px = x + 0.5, py = y + 0.5, cx = Math.floor(px / cell), cy = Math.floor(py / cell);
    const near: { ox: number; oy: number; d: number; p: P; ux: number; uy: number }[] = [];
    for (let dy = -reach; dy <= reach; dy++) for (let dx = -reach; dx <= reach; dx++) {
      const gx = wrap(cx + dx), gy = wrap(cy + dy), p = pts[gy * n + gx];
      const ox = p.x + (cx + dx - gx) * cell, oy = p.y + (cy + dy - gy) * cell;
      // Distance in the clump's own frame (stretched along its axis), rim pushed in and out by lobes.
      const rx = px - ox, ry = py - oy;
      const u = (rx * p.ca + ry * p.sa) / p.k, v = -rx * p.sa + ry * p.ca;
      // Scalloped: a row of rounded leaf tips round the rim.
      const lobe = 1 + lobes * (Math.abs(Math.sin(Math.atan2(v, u) * p.lobeN * 0.5 + p.lobeP)) * 2 - 1);
      near.push({ ox, oy, d: Math.hypot(u, v) / lobe, p, ux: rx, uy: ry });
    }
    let hit: (typeof near)[number] | null = null;
    for (const c of near) if (c.d < c.p.r && (!hit || c.oy + c.p.pri > hit.oy + hit.p.pri)) hit = c;
    if (!hit) return 0.3;
    let above = Infinity;
    for (const c of near) if (c.oy + c.p.pri > hit.oy + hit.p.pri) above = Math.min(above, c.d - c.p.r);
    const r = hit.p.r, d = hit.d / r;
    // Light from the upper left, turned per clump.
    const lx0 = hit.ux / r, ly0 = hit.uy / r;
    const lx = lx0 * hit.p.lc - ly0 * hit.p.ls, ly = lx0 * hit.p.ls + ly0 * hit.p.lc;
    return shade({
      light: Math.max(0, Math.min(1, 0.5 + ly * 0.55 - lx * 0.3)),
      rim: smooth(0.72, 0.98, d) * (ly < 0.2 ? 1 : 0.45),
      tuck: 1 - smooth(0, cell * 0.12, above),
      d, ly, tone: hit.p.t,
    }, x, y);
  };
}

const atlases: (THREE.DataTexture | null)[] = [null, null, null, null];

export const isPaintKind = (k: string): k is PaintKind => k in PAINTS;

/** A painted atlas (built once, up to four patterns per texture, one per channel). */
export function paintAtlas(atlas: 0 | 1 | 2 | 3): THREE.DataTexture {
  const hit = atlases[atlas];
  if (hit) return hit;
  const kinds = (Object.keys(PAINTS) as PaintKind[]).filter((k) => PAINTS[k].atlas === atlas);
  const data = new Uint8Array(SIZE * SIZE * 4), done = new Set<number>();
  for (const k of kinds) {
    const c = PAINTS[k].channel;
    // Kinds sharing a channel share its pattern: paint it once.
    if (done.has(c)) continue;
    done.add(c);
    const gen = PAINTERS[k]();
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) data[(y * SIZE + x) * 4 + c] = Math.max(0, Math.min(1, gen(x, y))) * 255;
  }
  const tex = new THREE.DataTexture(data, SIZE, SIZE, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  tex.name = `paint${atlas}`;
  atlases[atlas] = shareResource(tex);
  return tex;
}

/** How many metres one tile of the stone relief spans (see stoneRelief). */
const RELIEF_TILE = 1.6;
/** The swell's slope per tile that maps to the relief texture's full range. */
const RELIEF_SLOPE = 24;

let reliefTex: THREE.DataTexture | null = null;
/**
 * The dressed stone's relief noise, one tile per RELIEF_TILE metres, sampled at a different offset on
 * every stone: r a fine noise that bites chips out of the stone's bevelled edges; g the slow swell of
 * a chiselled face and b, a its slope across and up (0.5 level), so one fetch gives the swell's slope.
 */
export function stoneRelief(): THREE.DataTexture {
  if (reliefTex) return reliefTex;
  const chip = fbm(711, 12, 3), swell = fbm(712, 3, 3), g = new Float32Array(SIZE * SIZE);
  let lo = 1, hi = 0;
  for (let i = 0; i < g.length; i++) {
    g[i] = swell(i % SIZE, Math.floor(i / SIZE));
    lo = Math.min(lo, g[i]);
    hi = Math.max(hi, g[i]);
  }
  const at = (x: number, y: number) => (g[((y + SIZE) % SIZE) * SIZE + ((x + SIZE) % SIZE)] - lo) / (hi - lo);
  const data = new Uint8Array(SIZE * SIZE * 4), c = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 255);
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    // (The slope per tile, scaled into 0..1: the shader undoes it with RELIEF_SLOPE.)
    const dx = ((at(x + 1, y) - at(x - 1, y)) / 2) * SIZE, dy = ((at(x, y + 1) - at(x, y - 1)) / 2) * SIZE, i = (y * SIZE + x) * 4;
    data[i] = c(chip(x, y));
    data[i + 1] = c(at(x, y));
    data[i + 2] = c(0.5 + dx / RELIEF_SLOPE);
    data[i + 3] = c(0.5 + dy / RELIEF_SLOPE);
  }
  const tex = new THREE.DataTexture(data, SIZE, SIZE, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  tex.name = 'stoneRelief';
  reliefTex = shareResource(tex);
  return tex;
}

/**
 * GLSL: dressed stone from a part's own layout (masonry.ts), hand-painted and with real relief (the
 * owner's pick B). vMason = (stone coordinate along the face, course coordinate, stone length, course
 * height), both coordinates whole on the joints; vMasonK = (mode, seed); vMasonF = the face's arrises: its
 * ends in the stone coordinate and its foot and head in the course coordinate (each pair equal where it
 * has none). Running bond: every other course's
 * joints fall over the middle of the stones below; at a face's ends the quoins turn the corner, so an
 * arris is bevelled like an edge but carries no joint (as is the arris of a band laid in one course:
 * an arch's ring where it turns into the reveal, a kerb's top edge). Every stone is a chunky block: a deep, dark,
 * recessed joint round it, a bevelled edge whose width wanders and bites into chips, here and there a
 * corner knocked off, a gently swelling chiselled face, a tone of its own and soft stains, and on side
 * faces a painted light along its top edge and a little shade at its foot. The relief is a height
 * field over the face: masonSample sets its slope (masonGrad, metres per metre along and up the face)
 * and the normal is bent by it once the lighting normal exists (MASON_BUMP), so the bevels catch the
 * sun. Far off, where a stone is only a few pixels across, the relief and the joints soften instead of
 * shimmering.
 */
const MASON_GLSL = `
          varying vec4 vMason;
          varying vec2 vMasonK;
          varying vec4 vMasonF;
          uniform sampler2D uPaintStain;
          uniform sampler2D uStoneRelief;
          // Set by masonSample: the relief's slope, and how much of the fragment is joint.
          vec2 masonGrad = vec2(0.0);
          float masonJoint = 0.0;
          float masonHash(vec2 p) {
            return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
          }
          // Where this fragment lies on its face, in metres along it and up it (round a drum's axis).
          vec2 masonPlace() {
            float drum = step(2.5, vMasonK.x);
            float X = mix(vMason.x, (atan(vPaintPos.x, vPaintPos.z) / 6.2831853 + 0.5) * vMason.x, drum);
            float C = mix(vMason.y, 0.5, step(3.5, vMasonK.x));
            return vec2(X * vMason.z, C * vMason.w);
          }
          // p: the place on the face (masonPlace); px: how many metres one pixel spans there.
          float masonSample(vec2 p, float px) {
            float mode = vMasonK.x, l = vMason.z, h = vMason.w;
            float X = p.x / l, C = p.y / h;
            float r = floor(C + 1e-4), fy = C - r;
            float xo = X + (mod(r, 2.0) > 0.5 ? 0.5 : 0.0);
            float bi = floor(xo), fx = xo - bi;
            // (Hashed from whole numbers only: an interpolated value would jitter the hash into streaks.)
            vec2 id = vec2(r + floor(vMasonK.y + 0.5) * 13.0, bi);
            float hs = masonHash(id), hs2 = masonHash(id + 17.31);
            // Distances in metres to the stone's edges; a face's end (or its foot or head) inside the
            // stone is an arris.
            float faced = step(1e-3, vMasonF.y - vMasonF.x), headed = step(1e-3, vMasonF.w - vMasonF.z);
            float al = mix(1e3, (X - vMasonF.x) * l, faced), ar = mix(1e3, (vMasonF.y - X) * l, faced);
            float ab = mix(1e3, (C - vMasonF.z) * h, headed), at = mix(1e3, (vMasonF.w - C) * h, headed);
            float dl = fx * l, dr = (1.0 - fx) * l, db = fy * h, dt = (1.0 - fy) * h;
            bool qL = al < dl + 1e-3, qR = ar < dr + 1e-3, qB = ab < db + 1e-3, qT = at < dt + 1e-3;
            const float JW = 0.013;
            float eL = qL ? al : dl - JW, eR = qR ? ar : dr - JW, eB = qB ? ab : db - JW, eT = qT ? at : dt - JW;
            vec4 rel = texture2D(uStoneRelief, (p + vec2(hs, hs2) * 9.0) / ${RELIEF_TILE.toFixed(2)});
            // (A small stone, a paving stone or a kerb's, takes its bevel smaller; a deep base course's larger.)
            float chip = smoothstep(0.64, 0.86, rel.r), sz = clamp(min(l, h) / 0.5, 0.55, 1.4);
            float B = 0.055 * sz * (1.0 + 0.9 * chip) * mix(0.85, 1.15, hs2), D = 0.03 * sz * (1.0 + 0.4 * chip);
            // The nearest edge and the way into the stone from it; the corners rounded off (a knocked
            // corner here and there rounded further), so the stone reads as a dressed block.
            float ex = min(eL, eR), ey = min(eB, eT);
            vec2 cs = vec2(eL < eR ? 1.0 : -1.0, eB < eT ? 1.0 : -1.0);
            float rc = B + step(0.78, masonHash(id + cs * 3.7)) * (0.04 + 0.06 * hs) * sz;
            vec2 cq = vec2(rc - ex, rc - ey);
            float e = ex < ey ? ex : ey;
            vec2 dir = ex < ey ? vec2(cs.x, 0.0) : vec2(0.0, cs.y);
            if (cq.x > 0.0 && cq.y > 0.0) {
              e = rc - length(cq);
              dir = normalize(cq) * cs;
            }
            // The joint (antialiased over the pixel), and the bevel rising from it onto the face.
            masonJoint = 1.0 - smoothstep(-0.5 * px, 0.5 * px, e);
            float t = clamp(e / B, 0.0, 1.0), bev = (1.0 - t) * (1.0 - t);
            float slope = 2.0 * D * (1.0 - t) / B;
            vec2 swell = (rel.ba - 0.5) * (${RELIEF_SLOPE.toFixed(1)} / ${RELIEF_TILE.toFixed(2)}) * 0.02;
            // (Softened far off: no relief finer than the pixels, the joints a softer line.)
            float near = 1.0 - smoothstep(0.6 * B, 1.8 * B, px);
            // (The bevel's slope runs on down into the joint, so its edge never shows a flat, lit rim.)
            masonGrad = (dir * slope + swell * (1.0 - bev)) * near;
            masonJoint *= mix(0.55, 1.0, near);
            float stain = texture2D(uPaintStain, p * 0.5).b;
            float v = 0.47 + (hs - 0.5) * 0.24 + (0.5 - stain) * 0.32;
            // The quoins dressed a shade paler; fresh stone where a chip bit in; dust down in the bevel.
            v += (qL || qR) ? 0.05 : 0.0;
            v += (0.06 * chip - 0.03) * bev;
            if (mode < 1.5 || (mode > 2.5 && mode < 3.5)) {
              // Side faces: the painted light along each stone's top edge, a little shade at its foot.
              v += 0.15 * (1.0 - smoothstep(0.0, 1.4 * B, eT)) - 0.08 * (1.0 - smoothstep(0.0, 2.0 * B, eB));
            }
            return v;
          }`;

/**
 * GLSL at main's top (in the colour pass): where the fragment lies on its stone face and how that
 * place and the surface move across the screen, for the bump (MASON_BUMP) and the joints' softening.
 * A drum's coordinate wraps once round its axis, so its slope is never taken across the seam.
 */
const MASON_PLACE = `
          vec2 masonP = masonPlace();
          vec2 masonDx = dFdx(masonP), masonDy = dFdy(masonP);
          float masonCirc = max(vMason.x * vMason.z, 1e-3), masonDrum = step(2.5, vMasonK.x);
          masonDx.x -= masonDrum * masonCirc * floor(masonDx.x / masonCirc + 0.5);
          masonDy.x -= masonDrum * masonCirc * floor(masonDy.x / masonCirc + 0.5);
          vec3 masonPx = dFdx(-vViewPosition), masonPy = dFdy(-vViewPosition);
          float masonPix = max(length(masonDx), length(masonDy));`;

/**
 * GLSL after the lighting normal is set: bend it by the stone's relief (masonGrad, chained through the
 * face coordinates to the screen and carried onto the surface as a surface gradient), so the bevels
 * and the chiselled faces take the light.
 */
const MASON_BUMP = `
          {
            vec3 r1 = cross(masonPy, normal), r2 = cross(normal, masonPx);
            float det = dot(masonPx, r1);
            vec3 sg = (dot(masonGrad, masonDx) * r1 + dot(masonGrad, masonDy) * r2) / (abs(det) > 1e-14 ? det : 1e-14);
            // (Seen almost edge-on the gradient grows unbounded: never let it tip the normal over.)
            float sl = length(sg);
            if (sl > 1.8) sg *= 1.8 / sl;
            normal = normalize(normal - sg);
          }`;

/** GLSL: warm lights and cool darks, scaled by how strongly the paint applies. */
export const PAINT_TINT = 'mix(vec3(1.0), mix(vec3(0.94, 0.97, 1.06), vec3(1.05, 1.01, 0.93), paintV), uPaintAmt * 1.6)';

/** GLSL (ashlar only): a damp, cooler foot brightening upward (props and buildings stand on y = 0). */
const ASHLAR_FOOT = 'diffuseColor.rgb *= mix(vec3(0.84, 0.83, 0.87), vec3(1.03), smoothstep(0.0, 5.0, vPaintPos.y));';

/**
 * Paint a material. Top and bottom faces take (x, z); side faces take the distance along the face
 * itself (its horizontal tangent) and y, so the texture's V always runs up the side of a model and
 * its blocks keep one size on a face turned at any angle. `wrap` paints a drum (a round tower
 * centred on its model's origin): its side faces take the arc length round the axis instead, so the
 * courses run on round it at one block size with no seam between its facets.
 */
export function applyPaint(mat: THREE.Material, kind: PaintKind, space: SurfaceSpace = 'object', scaleMul = 1, wrap = false) {
  if (!(mat instanceof THREE.MeshStandardMaterial)) return;
  // Every rock surface shares one richer painted rock (strata blocks, cracks, grain, drift).
  if (kind === 'rock') return applyRock(mat, space, scaleMul);
  const p = PAINTS[kind];
  const ch = new THREE.Vector4(0, 0, 0, 0).setComponent(p.channel, 1);
  const uniforms = {
    uPaintTex: { value: paintAtlas(p.atlas) },
    uPaintCh: { value: ch },
    uPaintScale: { value: p.scale * scaleMul },
    uPaintAmt: { value: p.amount },
  };
  const ashlar = kind === 'ashlar';
  // Dressed stone laid by its parts' own stone layouts where they carry one (masonry.ts).
  const fit = kind === 'masonry' || kind === 'ashlar';
  if (fit) Object.assign(uniforms, { uPaintStain: { value: paintAtlas(1) }, uStoneRelief: { value: stoneRelief() } });
  addPatch(mat, {
    key: `paint:${space}${ashlar ? ':ashlar' : ''}${wrap ? ':wrap' : ''}${fit ? ':fit' : ''}`,
    slot: 'surface',
    apply(shader) {
      Object.assign(shader.uniforms, uniforms);
      const vert = space === 'world'
        ? `{
            vec4 pw = vec4(transformed, 1.0);
            mat3 pm = mat3(modelMatrix);
            #ifdef USE_INSTANCING
              pw = instanceMatrix * pw;
              pm = pm * mat3(instanceMatrix);
            #endif
            vPaintPos = (modelMatrix * pw).xyz;
            vPaintNrm = pm * objectNormal;
          }`
        : 'vPaintPos = transformed; vPaintNrm = objectNormal;';
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\nvarying vec3 vPaintPos;\nvarying vec3 vPaintNrm;${fit ? '\nattribute vec4 aMason;\nattribute vec2 aMasonK;\nattribute vec4 aMasonF;\nvarying vec4 vMason;\nvarying vec2 vMasonK;\nvarying vec4 vMasonF;' : ''}`)
        .replace('#include <project_vertex>', `#include <project_vertex>\n${vert}${fit ? '\nvMason = aMason; vMasonK = aMasonK; vMasonF = aMasonF;' : ''}`);
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          varying vec3 vPaintPos;
          varying vec3 vPaintNrm;
          uniform sampler2D uPaintTex;
          uniform vec4 uPaintCh;
          uniform float uPaintScale;
          uniform float uPaintAmt;
          ${fit ? MASON_GLSL : ''}
          float paintSample(${fit ? 'vec2 masonP, float masonPix' : ''}) {
            ${fit ? 'if (vMasonK.x > 0.5) return masonSample(masonP, masonPix);' : ''}
            vec3 n = abs(vPaintNrm);
            vec3 q = vPaintPos * uPaintScale;
            vec2 uv;
            if (n.y >= max(n.x, n.z)) uv = q.xz;
            else {
              ${wrap
                ? 'uv = vec2(atan(vPaintPos.x, vPaintPos.z) * length(vPaintPos.xz) * uPaintScale, q.y);'
                : 'uv = vec2(dot(q.xz, normalize(vec2(-vPaintNrm.z, vPaintNrm.x))), q.y);'}
            }
            return dot(texture2D(uPaintTex, uv), uPaintCh);
          }`,
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          ${fit ? MASON_PLACE : ''}
          {
            float paintV = paintSample(${fit ? 'masonP, masonPix' : ''});
            diffuseColor.rgb *= clamp(1.0 + (paintV - 0.5) * 2.0 * uPaintAmt, 0.0, 2.0) * ${PAINT_TINT};
            ${ashlar ? ASHLAR_FOOT : ''}
            ${fit ? '// The joints: deep and dark, cool in their shadow.\n            diffuseColor.rgb *= mix(vec3(1.0), vec3(0.36, 0.34, 0.38), masonJoint);' : ''}
          }`,
        );
      if (fit) shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${MASON_BUMP}`);
    },
  });
}
