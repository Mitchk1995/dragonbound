import * as THREE from 'three';
import { shareResource } from './resources';
import { clamp, mulberry32, type Rng } from '../core/rng';
import { addPatch } from './surface';
import { fbm, SIZE, tileNoise } from './textures';

/**
 * Grown trees' surfaces (treeGrowth.ts): painted leaf atlases, painted bark, and the bark and leaf
 * materials that use them, both swaying in the wind.
 *
 * - Leaves: each leaf kind has its own atlas of nine painted sprays (oak: lobed leaves in rosettes
 *   at the ends of short shoots; oval: a common broadleaf's leaves set alternately along its
 *   shoots), painted at startup and alpha-cut. Each leaf takes its own tone between a deep
 *   blue-green and a warm light green, is lit on one half of its midrib, darker at its stalk, with a
 *   pale midrib and a soft shadow on the leaves under it. The colours are multipliers (the instance
 *   colour gives the tree its green or gold), and the mipmaps keep the leaves' coverage, so a crown
 *   never thins out at a distance.
 * - Bark: long ridges running up the limb between deep fissures that wander, close over now and
 *   then where two ridges merge, and are cut across into long plates, each its own tone, with fine
 *   striations and moss in patches. The bark shader wraps it round every limb in whole tiles (so
 *   the ridges never seam, and converge as the limb tapers, as an oak's furrows do) and lights its
 *   relief from the painted height, so the fissures read deep.
 */

/** The world's wind clock (worldView.ts advances it). */
export interface WindClock {
  uWindT: { value: number };
}

const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// ─── Leaf atlases ───────────────────────────────────────────────────────────

/** The leaf kinds: an oak's lobed leaves, and a common broadleaf's oval ones. */
export type LeafKind = 'oak' | 'oval';

/** Sprays in an atlas: a grid of SPRAY_CELLS × SPRAY_CELLS cells, one spray design in each. */
export const SPRAY_CELLS = 3;

/** Atlas size (px). */
export const LEAF_ATLAS = 1024;

/** A cell's first pixel (cells split the atlas as evenly as whole pixels allow). */
const cellEdge = (i: number) => Math.round((i * LEAF_ATLAS) / SPRAY_CELLS);

/** The texture rectangle of spray cell `i` (its u and v ranges, v up). */
export function sprayCell(i: number) {
  const cx = i % SPRAY_CELLS, cy = Math.floor(i / SPRAY_CELLS);
  return { u0: cellEdge(cx) / LEAF_ATLAS, u1: cellEdge(cx + 1) / LEAF_ATLAS, v0: cellEdge(cy) / LEAF_ATLAS, v1: cellEdge(cy + 1) / LEAF_ATLAS };
}

/** A leaf: its stalk's foot (cell px, y up), heading (radians), length and width (px), tone (0 deep .. 1 light). */
interface Leaf {
  x: number;
  y: number;
  a: number;
  len: number;
  wid: number;
  tone: number;
}

/** A spray's twigs (polylines in cell px, each with its width at the foot) and its leaves, the lower first. */
interface SprayPaint {
  twigs: { pts: [number, number][]; w: number }[];
  leaves: Leaf[];
}

/** How one leaf kind is painted: the leaf's outline, how a spray is laid out, and its colours (multipliers of the instance colour). */
interface LeafPaint {
  /** Half-width of a leaf (as a share of its width) at u along its midrib (0 stalk .. 1 tip). */
  outline: (u: number, left: boolean) => number;
  spray: (rng: Rng, cell: number) => SprayPaint;
  /** Seeds of the kind's spray designs start here. */
  seed: number;
  deep: number[];
  light: number[];
  twig: number[];
}

/** Light falls on the sprays from the upper left. */
const LIGHT_DIR = [-0.6, 0.8];

/**
 * Half-width of an oak leaf (as a share of its width) at u along its midrib (0 stalk .. 1 tip):
 * widest past the middle, four broad rounded lobes a side with deep sinuses between them (the two
 * sides' lobes alternate), a short stalk and a rounded tip.
 */
export function oakLeafHalfWidth(u: number, left: boolean) {
  if (u <= 0 || u >= 1) return 0;
  const stalk = smooth(0.02, 0.12, u);
  const body = Math.pow(Math.sin(Math.PI * Math.pow(u, 0.85)), 0.7);
  const lobe = 1 - 0.5 * Math.pow(0.5 + 0.5 * Math.cos(Math.PI * 2 * (4 * u + (left ? 0.1 : 0.6))), 2) * smooth(0.08, 0.2, u) * (1 - smooth(0.88, 0.99, u));
  return 0.5 * Math.max(u < 0.14 ? 0.07 : 0, body * lobe * stalk);
}

/**
 * Half-width of an oval leaf (as a share of its width) at u along its midrib: widest a little below
 * the middle, narrowing to a drawn-out point, its edge finely toothed, on a short stalk.
 */
export function ovalLeafHalfWidth(u: number, left: boolean) {
  if (u <= 0 || u >= 1) return 0;
  const stalk = smooth(0.03, 0.13, u);
  const body = Math.pow(Math.sin(Math.PI * Math.pow(u, 0.78)), 0.8) * (1 - 0.3 * smooth(0.72, 1, u));
  const teeth = 1 - 0.08 * Math.pow(Math.abs(Math.sin(Math.PI * (13 * u + (left ? 0.5 : 0)))), 3) * smooth(0.18, 0.3, u);
  return 0.5 * Math.max(u < 0.12 ? 0.06 : 0, body * teeth * stalk);
}

/** A point on a polyline at t (0..1) along it, and its heading there. */
function onLine(pts: [number, number][], t: number): [number, number, number] {
  const f = clamp(t, 0, 1) * (pts.length - 1), i = Math.min(pts.length - 2, Math.floor(f)), k = f - i;
  const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
  return [x0 + (x1 - x0) * k, y0 + (y1 - y0) * k, Math.atan2(y1 - y0, x1 - x0)];
}

/** Collects a spray's leaves: each set a little out from its stalk's foot, listed so the higher lie over the lower. */
function leafList(rng: Rng) {
  const leaves: (Leaf & { order: number })[] = [];
  const add = (x: number, y: number, a: number, len: number, tone: number, wid = 0.5 + rng() * 0.08) =>
    leaves.push({ x: x + Math.cos(a) * 2, y: y + Math.sin(a) * 2, a, len, wid: len * wid, tone: clamp(tone, 0, 1), order: y + rng() * 6 });
  return { add, done: () => leaves.sort((p, q) => p.order - q.order) };
}

/**
 * An oak's spray, the way an oak carries its leaves: they crowd in rosettes at the ends of its
 * shoots. A bending twig with four short side shoots, each ending in a rosette of five or six leaves
 * fanning outward (never a full star), a larger rosette at the twig's tip with lighter young leaves,
 * and a leaf or two low on the twig.
 */
function oakSpray(rng: Rng, C: number): SprayPaint {
  const bend = (rng() - 0.5) * 0.23 * C;
  const main: [number, number][] = [[C / 2, 1], [C / 2 + bend * 0.2, C * 0.22], [C / 2 + bend * 0.6, C * 0.45], [C / 2 + bend, C * 0.64]];
  const twigs = [{ pts: main, w: 3.6 }];
  const { add, done } = leafList(rng);
  /** A rosette of n leaves fanning outward round a shoot's heading a, the middle ones longest. */
  const rosette = (x: number, y: number, a: number, n: number, size: number, tone: number) => {
    for (let i = 0; i < n; i++) {
      const off = ((i / (n - 1)) - 0.5) * 2.5 + (rng() - 0.5) * 0.3;
      add(x, y, a + off, C * size * (0.17 + 0.06 * Math.cos(off)) * (0.88 + rng() * 0.24), tone + (rng() - 0.5) * 0.4);
    }
  };
  let side = rng() < 0.5 ? 1 : -1;
  for (const t of [0.24, 0.33]) {
    const [x, y, h] = onLine(main, t + rng() * 0.03);
    add(x, y, h + side * (0.6 + rng() * 0.4), C * (0.15 + rng() * 0.03), 0.2 + rng() * 0.35);
    side = -side;
  }
  for (const [t, sd] of [[0.38, side], [0.52, -side], [0.66, side], [0.8, -side]]) {
    const [x, y, h] = onLine(main, t + rng() * 0.05), a = h + sd * (0.65 + rng() * 0.35), l = C * (0.1 + rng() * 0.06);
    const end: [number, number] = [x + Math.cos(a) * l, y + Math.sin(a) * l];
    twigs.push({ pts: [[x, y], end], w: 1.8 });
    rosette(end[0], end[1], a, 5 + Math.floor(rng() * 2), 0.82 + rng() * 0.12, 0.25 + rng() * 0.4);
  }
  const [tx, ty, th] = onLine(main, 1);
  rosette(tx, ty, th, 6 + Math.floor(rng() * 2), 1, 0.55 + rng() * 0.3);
  return { twigs, leaves: done() };
}

/**
 * A common broadleaf's spray: a bending twig with three or four side shoots, every shoot carrying
 * its oval leaves alternately in two flat ranks, angled forward, and ending in a leaf; the young
 * leaves toward the tips lighter.
 */
function ovalSpray(rng: Rng, C: number): SprayPaint {
  const bend = (rng() - 0.5) * 0.25 * C;
  const main: [number, number][] = [[C / 2, 1], [C / 2 + bend * 0.2, C * 0.25], [C / 2 + bend * 0.6, C * 0.5], [C / 2 + bend, C * 0.7]];
  const twigs = [{ pts: main, w: 3.2 }];
  const { add, done } = leafList(rng);
  /** Leaves set alternately along a shoot from t0 to its tip, and one closing it. */
  const shoot = (pts: [number, number][], t0: number, n: number, size: number, tone: number) => {
    let side = rng() < 0.5 ? 1 : -1;
    for (let i = 0; i < n; i++) {
      const t = t0 + ((1 - t0) * (i + 0.4 + rng() * 0.2)) / n;
      const [x, y, h] = onLine(pts, t);
      add(x, y, h + side * (0.75 + rng() * 0.4), C * size * (0.86 + rng() * 0.24), tone + t * 0.3 + (rng() - 0.5) * 0.35, 0.52 + rng() * 0.08);
      side = -side;
    }
    const [x, y, h] = onLine(pts, 1);
    add(x, y, h + (rng() - 0.5) * 0.3, C * size * 1.08, tone + 0.4, 0.5);
  };
  let side = rng() < 0.5 ? 1 : -1;
  const shoots = 3 + Math.floor(rng() * 2);
  for (let i = 0; i < shoots; i++) {
    const t = 0.3 + (i / shoots) * 0.5 + rng() * 0.05;
    const [x, y, h] = onLine(main, t), a = h + side * (0.55 + rng() * 0.35), l = C * (0.2 + rng() * 0.07);
    const mid: [number, number] = [x + Math.cos(a) * l * 0.5, y + Math.sin(a) * l * 0.5];
    const a2 = a - side * 0.25;
    const pts: [number, number][] = [[x, y], mid, [mid[0] + Math.cos(a2) * l * 0.5, mid[1] + Math.sin(a2) * l * 0.5]];
    twigs.push({ pts, w: 1.8 });
    shoot(pts, 0.2, 4 + Math.floor(rng() * 2), 0.175, 0.2 + rng() * 0.25);
    side = -side;
  }
  shoot(main, 0.1, 5, 0.19, 0.25);
  return { twigs, leaves: done() };
}

const LEAF_PAINT: Record<LeafKind, LeafPaint> = {
  oak: { outline: oakLeafHalfWidth, spray: oakSpray, seed: 9001, deep: [0.34, 0.45, 0.5], light: [0.98, 1.0, 0.64], twig: [0.5, 0.4, 0.34] },
  oval: { outline: ovalLeafHalfWidth, spray: ovalSpray, seed: 14001, deep: [0.38, 0.5, 0.48], light: [1.0, 1.0, 0.66], twig: [0.52, 0.44, 0.38] },
};

/**
 * Paint a leaf kind's atlas into premultiplied RGBA floats (LEAF_ATLAS², rows bottom-up): one spray
 * per cell, each from its own seed.
 */
export function paintLeafAtlas(kind: LeafKind) {
  const W = LEAF_ATLAS, img = new Float32Array(W * W * 4);
  const lp = LEAF_PAINT[kind];
  const over = (i: number, r: number, g: number, b: number, a: number) => {
    const k = 1 - a;
    img[i] = r * a + img[i] * k;
    img[i + 1] = g * a + img[i + 1] * k;
    img[i + 2] = b * a + img[i + 2] * k;
    img[i + 3] = a + img[i + 3] * k;
  };
  for (let cell = 0; cell < SPRAY_CELLS * SPRAY_CELLS; cell++) {
    const cx = cell % SPRAY_CELLS, cy = Math.floor(cell / SPRAY_CELLS);
    const ox = cellEdge(cx), oy = cellEdge(cy), C = Math.min(cellEdge(cx + 1) - ox, cellEdge(cy + 1) - oy);
    const { twigs, leaves } = lp.spray(mulberry32(lp.seed + cell * 37), C);
    const px = (x: number, y: number) => ((oy + y) * W + ox + x) * 4;
    // Twigs: tapering strokes under the leaves.
    for (const { pts, w } of twigs) {
      for (let s = 0; s < pts.length - 1; s++) {
        const [x0, y0] = pts[s], [x1, y1] = pts[s + 1], w0 = w * (1 - (s / pts.length) * 0.5);
        for (let y = Math.max(0, Math.floor(Math.min(y0, y1) - 4)); y < Math.min(C, Math.ceil(Math.max(y0, y1) + 4)); y++) {
          for (let x = Math.max(0, Math.floor(Math.min(x0, x1) - 4)); x < Math.min(C, Math.ceil(Math.max(x0, x1) + 4)); x++) {
            const dx = x1 - x0, dy = y1 - y0, f = clamp(((x + 0.5 - x0) * dx + (y + 0.5 - y0) * dy) / (dx * dx + dy * dy), 0, 1);
            const d = Math.hypot(x + 0.5 - x0 - dx * f, y + 0.5 - y0 - dy * f), half = Math.max(0.8, w0 * (1 - f * 0.3)) / 2;
            const cov = clamp(half - d + 0.5, 0, 1), k = 0.85 + 0.3 * f;
            if (cov > 0) over(px(x, y), lp.twig[0] * k, lp.twig[1] * k, lp.twig[2] * k, cov);
          }
        }
      }
    }
    // Leaves, each first dropping a soft shadow on what lies under it.
    for (const lf of leaves) {
      const dx = Math.cos(lf.a), dy = Math.sin(lf.a);
      const lit = Math.sign(-dy * LIGHT_DIR[0] + dx * LIGHT_DIR[1]) || 1;
      const reachX = Math.abs(dx) * lf.len + Math.abs(dy) * lf.wid * 0.5 + 4, reachY = Math.abs(dy) * lf.len + Math.abs(dx) * lf.wid * 0.5 + 4;
      const mx = lf.x + dx * lf.len * 0.5, my = lf.y + dy * lf.len * 0.5;
      const x0 = Math.max(0, Math.floor(mx - reachX * 0.5 - 4)), x1 = Math.min(C, Math.ceil(mx + reachX * 0.5 + 6));
      const y0 = Math.max(0, Math.floor(my - reachY * 0.5 - 6)), y1 = Math.min(C, Math.ceil(my + reachY * 0.5 + 4));
      /** Signed distance (px, positive inside) to the leaf's outline at a point, and its place along and across the midrib. */
      const shape = (x: number, y: number) => {
        const rx = x - lf.x, ry = y - lf.y;
        const u = (rx * dx + ry * dy) / lf.len, v = dx * ry - dy * rx;
        // (Off the ends of the midrib there is no leaf at all, not a hairline.)
        return { d: u <= 0 || u >= 1 ? -9 : lp.outline(u, v > 0) * lf.wid - Math.abs(v), u, v };
      };
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const s = shape(x + 0.5 - 3, y + 0.5 + 4);
        const i = px(x, y);
        if (s.d > -2.5 && img[i + 3] > 0) {
          const k = 1 - 0.28 * smooth(-2.5, 2.5, s.d);
          img[i] *= k;
          img[i + 1] *= k;
          img[i + 2] *= k;
        }
      }
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const s = shape(x + 0.5, y + 0.5);
        const cov = clamp(s.d / 1.3 + 0.5, 0, 1);
        if (cov <= 0) continue;
        // The half of the leaf facing the light, its stalk darker, a pale midrib, a darker rim.
        let shade = (s.v * lit > 0 ? 1.07 : 0.86) * (0.86 + 0.18 * clamp(s.u, 0, 1));
        if (s.d < 1.8) shade *= 0.93;
        if (Math.abs(s.v) < 0.9 && s.u > 0.05 && s.u < 0.9) shade *= 1.12;
        shade = Math.round(shade * 8) / 8 * 0.6 + shade * 0.4;
        const t = lf.tone, { deep, light } = lp;
        over(px(x, y), (deep[0] + (light[0] - deep[0]) * t) * shade, (deep[1] + (light[1] - deep[1]) * t) * shade, (deep[2] + (light[2] - deep[2]) * t) * shade, cov);
      }
    }
  }
  return img;
}

/**
 * Mip levels of a premultiplied RGBA float image (square, a power of two) as straight-alpha bytes.
 * Colour bleeds out into the clear texels (no dark fringe where a leaf's edge is filtered), and each
 * level's alpha is scaled so as many texels pass the alpha test as at full size.
 */
export function coverageMips(img: Float32Array, size: number) {
  const levels: { data: Uint8Array; width: number; height: number }[] = [];
  const cut = 0.5;
  // Straight colour, bled into the clear texels from their neighbours, the rest the mean leaf colour.
  let n = size, rgba = new Float32Array(img.length);
  let mean = [0, 0, 0], wsum = 0;
  for (let i = 0; i < img.length; i += 4) {
    const a = img[i + 3];
    rgba[i + 3] = a;
    if (a > 1e-4) for (let c = 0; c < 3; c++) rgba[i + c] = img[i + c] / a;
    if (a > 0.5) {
      for (let c = 0; c < 3; c++) mean[c] += rgba[i + c];
      wsum++;
    }
  }
  mean = mean.map((m) => m / Math.max(1, wsum));
  let filled = new Uint8Array(n * n).map((_, i) => (img[i * 4 + 3] > 1e-4 ? 1 : 0));
  for (let pass = 0; pass < 6; pass++) {
    const next = filled.slice();
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const i = y * n + x;
      if (filled[i]) continue;
      let cnt = 0, r = 0, g = 0, b = 0;
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + ox, yy = y + oy;
        if (xx < 0 || yy < 0 || xx >= n || yy >= n || !filled[yy * n + xx]) continue;
        const j = (yy * n + xx) * 4;
        r += rgba[j];
        g += rgba[j + 1];
        b += rgba[j + 2];
        cnt++;
      }
      if (!cnt) continue;
      rgba[i * 4] = r / cnt;
      rgba[i * 4 + 1] = g / cnt;
      rgba[i * 4 + 2] = b / cnt;
      next[i] = 1;
    }
    filled = next;
  }
  filled.forEach((f, i) => {
    if (!f) for (let c = 0; c < 3; c++) rgba[i * 4 + c] = mean[c];
  });
  // The share of texels passing the alpha test at full size; each smaller level's alpha is scaled
  // so as many pass (read off the level's alpha histogram).
  const BINS = 4096;
  let target = 0;
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] >= cut) target++;
  target /= rgba.length / 4;
  for (;;) {
    let k = 1;
    if (n !== size) {
      const hist = new Uint32Array(BINS + 1);
      for (let i = 3; i < rgba.length; i += 4) hist[Math.min(BINS, Math.floor(rgba[i] * BINS))]++;
      const want = target * n * n;
      let count = 0, b = BINS;
      while (b > 1 && count + hist[b] < want) count += hist[b--];
      k = clamp(cut / (b / BINS), 0.5, 8);
    }
    const data = new Uint8Array(n * n * 4);
    for (let i = 0; i < data.length; i += 4) {
      for (let c = 0; c < 3; c++) data[i + c] = Math.round(clamp(rgba[i + c], 0, 1) * 255);
      data[i + 3] = Math.round(clamp(rgba[i + 3] * k, 0, 1) * 255);
    }
    levels.push({ data, width: n, height: n });
    if (n === 1) break;
    // Down a level: colour averaged by alpha (the bled colour where all four are clear).
    const m = n / 2, down = new Float32Array(m * m * 4);
    for (let y = 0; y < m; y++) for (let x = 0; x < m; x++) {
      let r = 0, g = 0, b = 0, a = 0, r0 = 0, g0 = 0, b0 = 0;
      for (const [ox, oy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        const j = ((y * 2 + oy) * n + x * 2 + ox) * 4, w = rgba[j + 3];
        r += rgba[j] * w;
        g += rgba[j + 1] * w;
        b += rgba[j + 2] * w;
        a += w;
        r0 += rgba[j] / 4;
        g0 += rgba[j + 1] / 4;
        b0 += rgba[j + 2] / 4;
      }
      const i = (y * m + x) * 4;
      down.set(a > 1e-4 ? [r / a, g / a, b / a, a / 4] : [r0, g0, b0, 0], i);
    }
    rgba = down;
    n = m;
  }
  return levels;
}

const leafTex = new Map<LeafKind, THREE.DataTexture>();

/** A leaf kind's painted atlas (built once, shared by every grown tree of that kind). */
export function leafAtlas(kind: LeafKind) {
  const made = leafTex.get(kind);
  if (made) return made;
  const mips = coverageMips(paintLeafAtlas(kind), LEAF_ATLAS);
  const tex = new THREE.DataTexture(mips[0].data, LEAF_ATLAS, LEAF_ATLAS, THREE.RGBAFormat);
  tex.mipmaps = mips;
  tex.generateMipmaps = false;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  tex.name = `leaves-${kind}`;
  leafTex.set(kind, shareResource(tex));
  return tex;
}

// ─── Bark ───────────────────────────────────────────────────────────────────

/** The bark kinds: an oak's deep furrows, and a common broadleaf's shallower ones. */
export type BarkKind = 'oak' | 'tree';

/** Bark texture size (px): one tile, wrapped round a limb a whole number of times. */
export const BARK_SIZE = 512;

/** How a bark is painted (paintBark). */
interface BarkPaint {
  seed: number;
  /** Ridges across a tile, and plates along a ridge per tile (whole numbers, so the tile repeats). */
  ridges: number;
  plates: [number, number];
  /** How far ridges wander across (in ridge widths), the fissures' width (a share of a ridge's pitch) and how often one closes over (0 never). */
  wander: number;
  fissure: number;
  merge: number;
  /** How deep the cracks cutting a ridge into plates are (0..1). */
  crack: number;
}

const BARK_PAINT: Record<BarkKind, BarkPaint> = {
  oak: { seed: 801, ridges: 5, plates: [1, 3], wander: 0.8, fissure: 0.36, merge: 0.3, crack: 0.5 },
  tree: { seed: 821, ridges: 6, plates: [2, 3], wander: 0.4, fissure: 0.22, merge: 0.35, crack: 0.3 },
};

/**
 * A bark texture's channels (tileable, BARK_SIZE², V up the limb): R the height (0 deep in a
 * fissure, 1 on a ridge's crown), G each plate's tone, B the moss. Long rounded ridges run up the
 * tile between fissures that wander and widen and narrow along their length, pinching shut where
 * two ridges merge; ragged splits break some ridges across into long staggered plates, and the
 * ridges are lumpy along their length and finely striated.
 */
export function paintBark(kind: BarkKind) {
  const { seed, ridges, plates, wander, fissure, merge, crack } = BARK_PAINT[kind];
  const N = BARK_SIZE, P = N / ridges;
  // (The noises tile on a SIZE torus: sampled at half the bark's pixels, they tile on the bark's.)
  const warp = fbm(seed + 2, 2, 3), wobble = fbm(seed + 3, 8, 2);
  const width = tileNoise(seed + 4, ridges, 7), close = tileNoise(seed + 5, ridges, 5);
  const striae = tileNoise(seed + 6, 64, 6), jag = tileNoise(seed + 9, 16, 16), tone = fbm(seed + 7, 4, 3), moss = fbm(seed + 8, 3, 3);
  const lumps = tileNoise(seed + 10, 10, 9), split = tileNoise(seed + 11, 24, 10);
  const rng = mulberry32(seed);
  const cols = Array.from({ length: ridges }, () => {
    const n = plates[0] + Math.floor(rng() * (plates[1] - plates[0] + 1));
    return { n, off: rng(), slant: (rng() - 0.5) * 0.8, tones: Array.from({ length: n }, () => rng()), cracked: Array.from({ length: n }, () => rng() > 0.2) };
  });
  const data = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const hx = x / 2, hy = y / 2;
    // Across: the ridge this point is on, and how far it is from the nearer fissure.
    const u = x + (warp(hx, hy) - 0.5) * P * wander * 2 + (wobble(hx, hy) - 0.5) * P * 0.3;
    const ph = u / P, ci = Math.floor(ph), f = ph - ci, c = ((ci % ridges) + ridges) % ridges;
    const k = f < 0.5 ? c : (c + 1) % ridges, e = Math.min(f, 1 - f), kx = (k * SIZE) / ridges;
    // (Where two ridges merge, the fissure between them pinches to a seam.)
    const hw = 0.5 * fissure * (0.6 + 0.8 * width(kx, hy)) * (1 - 0.85 * smooth(1 - merge, 1 - merge + 0.15, close(kx, hy)));
    const side = smooth(hw * 0.4, hw + 0.1, e);
    // A rounded ridge, lumpy along its length.
    let h = side * (0.62 + 0.38 * smooth(hw, 0.5, e)) * (0.82 + 0.18 * lumps(hx, hy));
    // Along: ragged splits breaking some ridges across into plates, slanting a little.
    const col = cols[c];
    const yy = (y / N) * col.n + col.off + (f - 0.5) * col.slant * 0.25 + (jag(hx, hy) - 0.5) * 0.14;
    const p = Math.floor(yy), g = yy - p, pi = ((p % col.n) + col.n) % col.n;
    h -= crack * 0.6 * (1 - smooth(0.01, 0.05, Math.min(g, 1 - g))) * (col.cracked[pi] ? 1 : 0) * side * smooth(0.3, 0.55, split(hx, hy));
    h += (striae(hx, hy) - 0.5) * 0.16 * side;
    const t = clamp(0.5 + (col.tones[pi] - 0.5) * 0.55 + (tone(hx, hy) - 0.5) * 0.5, 0, 1);
    const m = smooth(0.55, 0.7, moss(hx, hy)) * (0.4 + 0.6 * side);
    const i = (y * N + x) * 4;
    data[i] = clamp(h * 0.85 + 0.08, 0, 1) * 255;
    data[i + 1] = (Math.round(t * 5) / 5 * 0.6 + t * 0.4) * 255;
    data[i + 2] = m * 255;
    data[i + 3] = 255;
  }
  return data;
}

const barkTex = new Map<BarkKind, THREE.DataTexture>();

/** A bark kind's painted texture (built once, shared). */
export function barkTexture(kind: BarkKind) {
  const made = barkTex.get(kind);
  if (made) return made;
  const tex = new THREE.DataTexture(paintBark(kind), BARK_SIZE, BARK_SIZE, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  tex.name = `bark-${kind}`;
  barkTex.set(kind, shareResource(tex));
  return tex;
}

// ─── Materials ──────────────────────────────────────────────────────────────

/**
 * GLSL: how far the wind carries a point with a sway weight `w` (0 still .. about 1.5 at the
 * twigs). The whole tree leans slowly with the gusts; each bough rocks on its own phase, set by
 * where it is in the crown; every tree has its own phase from where it stands.
 */
const SWAY_GLSL = `
  uniform float uWindT;
  vec3 treeSway(vec3 at, float w) {
    vec3 ip = vec3(0.0);
    #ifdef USE_INSTANCING
      ip = instanceMatrix[3].xyz;
    #endif
    float ph = uWindT * 0.9 + ip.x * 0.31 + ip.z * 0.23;
    float gust = 0.6 + 0.4 * sin(uWindT * 0.37 + ip.x * 0.05 + ip.z * 0.03);
    float lean = (sin(ph) * 0.65 + sin(ph * 2.17 + 1.3) * 0.35) * gust;
    float bough = sin(uWindT * 1.9 + dot(at, vec3(0.61, 0.37, 0.53)) + ip.z * 0.7) * gust;
    return vec3(lean * 0.07 + bough * 0.05, bough * 0.03, lean * 0.04 + bough * 0.045) * w;
  }`;

/** A grown tree's bark: its painted texture, how it is laid on the wood, and its colours (linear). */
export interface BarkLook {
  kind: BarkKind;
  /** Metres of bark up the limb per tile, and the relief's depth (a share of a tile's width round the limb). */
  tile: number;
  relief: number;
  furrow: number[];
  plate: [number[], number[]];
  moss: number[];
}

/**
 * Turn a scenery material into a grown tree's bark: smooth shading over the wood's painted shade
 * (vertex colour), the bark texture wrapped round every limb (see the file comment), painted in
 * dark fissures and plates in their own tones, brighter along their crowns and lit in relief from
 * the painted height, with moss on the limbs' upper sides and round the damp foot. Young branches
 * and the collars where branches leave are smoother, even bark. Limbs and branches sway with their
 * weight.
 */
export function grownBark(mat: THREE.MeshStandardMaterial, wind: WindClock, look: BarkLook) {
  mat.flatShading = false;
  mat.vertexColors = true;
  mat.roughness = 0.95;
  mat.color.setRGB(1, 1, 1);
  const v3 = (c: number[]) => ({ value: new THREE.Vector3(c[0], c[1], c[2]) });
  const uniforms = {
    uBarkTex: { value: barkTexture(look.kind) },
    uBarkTile: { value: look.tile },
    uBarkRelief: { value: look.relief },
    uBarkFurrow: v3(look.furrow),
    uBarkPlateLo: v3(look.plate[0]),
    uBarkPlateHi: v3(look.plate[1]),
    uBarkMoss: v3(look.moss),
  };
  addPatch(mat, {
    key: 'grown-bark',
    apply(shader) {
      Object.assign(shader.uniforms, uniforms, wind);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
          attribute vec4 aBarkA;
          attribute vec4 aBarkB;
          attribute vec2 aWood;
          varying vec4 vBarkA;
          varying vec4 vBarkB;
          varying vec3 vBarkUp;
          varying vec2 vBarkW;
          ${SWAY_GLSL}`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          {
            vBarkA = aBarkA;
            vec3 bt = aBarkB.xyz;
            #ifdef USE_INSTANCING
              bt = mat3(instanceMatrix) * bt;
            #endif
            vBarkB = vec4(normalize(mat3(modelViewMatrix) * bt), aBarkB.w);
            vBarkUp = objectNormal;
            vBarkW = vec2(aWood.y, position.y);
          }
          transformed += treeSway(position, aWood.x);`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform sampler2D uBarkTex;
          uniform float uBarkTile;
          uniform float uBarkRelief;
          uniform vec3 uBarkFurrow;
          uniform vec3 uBarkPlateLo;
          uniform vec3 uBarkPlateHi;
          uniform vec3 uBarkMoss;
          varying vec4 vBarkA;
          varying vec4 vBarkB;
          varying vec3 vBarkUp;
          varying vec2 vBarkW;
          const float BARK_E = 1.0 / ${BARK_SIZE}.0;`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          // Round the limb: its angle counted in whole tiles (taken from whichever of two seams lies
          // elsewhere, so the mip level never jumps); along it: its arc length.
          float barkAng = atan(vBarkA.y, vBarkA.x) * 0.15915494;
          float barkS1 = barkAng * vBarkA.z, barkS2 = fract(barkAng + 1.0) * vBarkA.z;
          vec2 barkUv = vec2(fwidth(barkS1) <= fwidth(barkS2) ? barkS1 : barkS2, vBarkB.w / uBarkTile);
          vec4 bk = texture2D(uBarkTex, barkUv);
          vec2 barkGrad = vec2(texture2D(uBarkTex, barkUv + vec2(BARK_E, 0.0)).r, texture2D(uBarkTex, barkUv + vec2(0.0, BARK_E)).r) - bk.r;
          // Young branches are smoother, and the bark gathers into an even collar where a branch
          // leaves its parent.
          float barkDetail = (0.3 + 0.7 * smoothstep(0.025, 0.14, vBarkA.w)) * vBarkW.x;
          {
            vec3 plate = mix(uBarkPlateLo, uBarkPlateHi, bk.g);
            vec3 bark = mix(uBarkFurrow, plate, smoothstep(0.12, 0.55, bk.r));
            bark *= 0.92 + 0.18 * smoothstep(0.72, 1.0, bk.r);
            bark = mix(mix(uBarkPlateLo, uBarkFurrow, 0.4), bark, barkDetail);
            float moss = bk.b * clamp(smoothstep(0.25, 0.9, normalize(vBarkUp).y) + (1.0 - smoothstep(0.1, 1.3, vBarkW.y)) * 0.8, 0.0, 1.0);
            bark = mix(bark, uBarkMoss, moss * 0.75);
            diffuseColor.rgb *= bark * 1.6;
          }`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          {
            // Relief: the painted height's slope round the limb (the same at any girth, as the
            // ridges converge with it) and along it.
            vec3 bt = normalize(vBarkB.xyz - normal * dot(vBarkB.xyz, normal));
            vec3 ba = cross(bt, normal);
            float tileW = 6.2831853 * vBarkA.w / max(vBarkA.z, 1.0);
            vec2 slope = barkGrad / BARK_E * uBarkRelief * barkDetail;
            slope.y *= tileW / uBarkTile;
            normal = normalize(normal - slope.x * ba - slope.y * bt);
          }`);
    },
  });
}

/** Leaves are this much brighter than the atlas's multipliers (it keeps headroom for its light leaves). */
const LEAF_GAIN = 1.3;

/**
 * Turn a scenery material into a grown tree's leaves: a leaf kind's painted atlas, alpha-cut
 * (soft-edged with multisampling), both faces lit by the crown's normals (never darkened as back
 * faces), the instance colour and the crown's painted shade over it. A card seen edge on narrows
 * onto its twig instead of showing as a sliver; each card rides its twig in the wind and flutters
 * at its far edge.
 */
export function grownLeaves(mat: THREE.MeshStandardMaterial, wind: WindClock, kind: LeafKind) {
  mat.map = leafAtlas(kind);
  mat.alphaTest = 0.5;
  mat.side = THREE.DoubleSide;
  mat.flatShading = false;
  mat.vertexColors = true;
  mat.roughness = 0.85;
  mat.color.setScalar(LEAF_GAIN);
  addPatch(mat, {
    key: 'grown-leaves',
    apply(shader) {
      Object.assign(shader.uniforms, wind);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
          attribute vec4 aWind;
          attribute float aFlutter;
          attribute vec3 aCard;
          attribute vec3 aSpine;
          ${SWAY_GLSL}`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          {
            vec3 cn = aCard;
            vec4 wp = vec4(transformed, 1.0);
            #ifdef USE_INSTANCING
              cn = mat3(instanceMatrix) * cn;
              wp = instanceMatrix * wp;
            #endif
            wp = modelMatrix * wp;
            cn = normalize(mat3(modelMatrix) * cn);
            float facing = abs(dot(cn, normalize(cameraPosition - wp.xyz)));
            transformed = aSpine + (transformed - aSpine) * smoothstep(0.06, 0.3, facing);
          }
          transformed += treeSway(aWind.xyz, aWind.w);
          transformed += objectNormal * sin(uWindT * 6.3 + dot(aWind.xyz, vec3(12.9, 7.3, 9.1))) * 0.05 * aFlutter * aWind.w;`);
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <normal_fragment_begin>',
        `#include <normal_fragment_begin>
        #ifdef DOUBLE_SIDED
          normal *= faceDirection;
        #endif`,
      );
    },
  });
}
