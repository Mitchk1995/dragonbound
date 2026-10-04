import * as THREE from 'three';
import { shareResource } from './resources';
import { clamp, mulberry32, type Rng } from '../core/rng';
import { abs, attribute, atan, cameraPosition, cross, dFdx, dFdy, diffuseColor, dot, faceDirection, float, fwidth, mat3, max, mix, modelWorldMatrix, normalGeometry, normalize, positionGeometry, positionView, saturate, select, sin, smoothstep, texture, varying, vec2, vec3, vec4 } from 'three/tsl';
import { addPatch, instanceMatrixNode, instanceOrigin, type F, type V2, type V3, type V4 } from './patch';

/**
 * Grown trees' surfaces (treeGrowth.ts): painted leaf atlases, sourced bark, and the bark and leaf
 * materials that use them, both swaying in the wind.
 *
 * - Leaves: each leaf kind has its own atlas of nine sprays, alpha-cut. The oak's and the common
 *   tree's are painted at startup (oak: lobed leaves in rosettes at the ends of short shoots; oval: a
 *   common broadleaf's leaves set alternately along its shoots); the willow's, maple's, yew's and
 *   magic tree's are sourced (public/textures/leaves/, made by tools/bark_textures.py), each its
 *   sourced spray turned and toned a little differently in every cell. Each leaf takes its own tone between a deep
 *   blue-green and a warm light green, is lit on one half of its midrib, darker at its stalk, with a
 *   pale midrib and a soft shadow on the leaves under it. The colours are multipliers (the instance
 *   colour gives the tree its green or gold), and the mipmaps keep the leaves' coverage, so a crown
 *   never thins out at a distance.
 * - Bark: a sourced, tileable bark for each kind (public/textures/bark/), its colour and its relief,
 *   wrapped round every limb (see grownBark).
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

/** Leaf kinds whose sprays are sourced (public/textures/leaves/): a willow's narrow hanging leaves, a maple's lobed ones, a yew's needles and the magic tree's glowing leaves. */
export const SOURCED_LEAVES = ['willow', 'maple', 'yew', 'magic'] as const;
export type SourcedLeaf = (typeof SOURCED_LEAVES)[number];

/** The leaf kinds: an oak's lobed leaves and a common broadleaf's oval ones (painted), and the sourced ones. */
export type PaintedLeaf = 'oak' | 'oval';
export type LeafKind = PaintedLeaf | SourcedLeaf;

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

const LEAF_PAINT: Record<PaintedLeaf, LeafPaint> = {
  oak: { outline: oakLeafHalfWidth, spray: oakSpray, seed: 9001, deep: [0.34, 0.45, 0.5], light: [0.98, 1.0, 0.64], twig: [0.5, 0.4, 0.34] },
  oval: { outline: ovalLeafHalfWidth, spray: ovalSpray, seed: 14001, deep: [0.38, 0.5, 0.48], light: [1.0, 1.0, 0.66], twig: [0.52, 0.44, 0.38] },
};

/**
 * Paint a leaf kind's atlas into premultiplied RGBA floats (LEAF_ATLAS², rows bottom-up): one spray
 * per cell, each from its own seed.
 */
export function paintLeafAtlas(kind: PaintedLeaf) {
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
const leafImages = new Map<SourcedLeaf, ImageBitmap>();

const isSourced = (kind: LeafKind): kind is SourcedLeaf => (SOURCED_LEAVES as readonly string[]).includes(kind);

/** A sourced leaf atlas as premultiplied RGBA floats, rows bottom-up (as paintLeafAtlas). */
function sourcedLeafAtlas(kind: SourcedLeaf) {
  const bmp = leafImages.get(kind);
  if (!bmp) throw new Error(`leaves ${kind} are not loaded (preloadTreeTextures)`);
  const cv = document.createElement('canvas');
  cv.width = cv.height = LEAF_ATLAS;
  const ctx = cv.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0, LEAF_ATLAS, LEAF_ATLAS);
  const px = ctx.getImageData(0, 0, LEAF_ATLAS, LEAF_ATLAS).data, W = LEAF_ATLAS;
  const img = new Float32Array(W * W * 4);
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const i = ((W - 1 - y) * W + x) * 4, o = (y * W + x) * 4, a = px[i + 3] / 255;
    img[o] = (px[i] / 255) * a;
    img[o + 1] = (px[i + 1] / 255) * a;
    img[o + 2] = (px[i + 2] / 255) * a;
    img[o + 3] = a;
  }
  return img;
}

/**
 * A leaf kind's atlas (built once, shared by every grown tree of that kind). A world built headless
 * (the tests build one, with no images loaded and no canvas to read them through) gets an empty
 * stand-in for a sourced atlas: it is never drawn there.
 */
export function leafAtlas(kind: LeafKind) {
  const made = leafTex.get(kind);
  if (made) return made;
  const headless = typeof document === 'undefined' && isSourced(kind);
  const mips = headless ? [{ data: new Uint8Array(4), width: 1, height: 1 }] : coverageMips(isSourced(kind) ? sourcedLeafAtlas(kind) : paintLeafAtlas(kind), LEAF_ATLAS);
  const tex = new THREE.DataTexture(mips[0].data, mips[0].width, mips[0].height, THREE.RGBAFormat);
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

/**
 * The bark kinds, one per grown kind: an oak's deep furrows, a common broadleaf's shallower ones, a
 * willow's criss-crossing ridges, a maple's grey plates, a yew's red-brown flakes and the magic
 * tree's pale ridges with glowing veins.
 */
export type BarkKind = 'oak' | 'tree' | 'willow' | 'maple' | 'yew' | 'magic';

export const BARK_KINDS: BarkKind[] = ['oak', 'tree', 'willow', 'maple', 'yew', 'magic'];

/** A bark's maps (public/textures/bark/, made by tools/bark_textures.py): its colour and its relief. */
interface BarkMaps {
  map: THREE.Texture;
  normal: THREE.Texture;
}

const barkMaps = new Map<BarkKind, BarkMaps>();

/** Load every bark's maps and every sourced leaf atlas (at startup, before any tree is built). */
export async function preloadTreeTextures() {
  const loader = new THREE.TextureLoader();
  const load = async (file: string, srgb: boolean) => {
    const tex = await loader.loadAsync(`./textures/bark/${file}.jpg`);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 8;
    tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    tex.name = `bark-${file}`;
    return shareResource(tex);
  };
  const leaves = async (kind: SourcedLeaf) => {
    const res = await fetch(`./textures/leaves/${kind}.webp`);
    if (!res.ok) throw new Error(`leaves ${kind}: ${res.status}`);
    leafImages.set(kind, await createImageBitmap(await res.blob(), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' }));
  };
  await Promise.all([
    ...BARK_KINDS.map(async (kind) => {
      const [map, normal] = await Promise.all([load(kind, true), load(`${kind}-normal`, false)]);
      barkMaps.set(kind, { map, normal });
    }),
    ...SOURCED_LEAVES.map(leaves),
  ]);
}

function barkFor(kind: BarkKind) {
  const maps = barkMaps.get(kind);
  if (!maps) throw new Error(`bark ${kind} is not loaded (preloadTreeTextures)`);
  return maps;
}

// ─── Materials ──────────────────────────────────────────────────────────────

/**
 * How far the wind carries a point `at` with a sway weight `w` (0 still .. about 1.5 at the twigs),
 * at wind time `t`, for a tree standing at `ip`. The whole tree leans slowly with the gusts; each
 * bough rocks on its own phase, set by where it is in the crown; every tree has its own phase from
 * where it stands.
 */
function treeSway(at: V3, w: F, t: F, ip: V3): V3 {
  const ph = t.mul(0.9).add(ip.x.mul(0.31)).add(ip.z.mul(0.23)).toVar();
  const gust = sin(t.mul(0.37).add(ip.x.mul(0.05)).add(ip.z.mul(0.03))).mul(0.4).add(0.6).toVar();
  const lean = sin(ph).mul(0.65).add(sin(ph.mul(2.17).add(1.3)).mul(0.35)).mul(gust).toVar();
  const bough = sin(t.mul(1.9).add(dot(at, vec3(0.61, 0.37, 0.53))).add(ip.z.mul(0.7))).mul(gust).toVar();
  return vec3(lean.mul(0.07).add(bough.mul(0.05)), bough.mul(0.03), lean.mul(0.04).add(bough.mul(0.045))).mul(w);
}

/** A grown tree's bark: its sourced maps, how they are laid on the wood, and how it is toned. */
export interface BarkLook {
  kind: BarkKind;
  /** Bark metres up the limb per tile (round it, a tile is the species' bark girth). */
  tile: number;
  /** How strongly the relief lights (1 as sourced), and the colour map's brightness. */
  relief: number;
  gain: number;
  /** Moss in the furrows on the limbs' upper sides and round the damp foot (linear colour). */
  moss: number[];
  /** How brightly the bark's blue veins glow (the magic tree's; none when left out). */
  glow?: number;
}

/**
 * Turn a scenery material into a grown tree's bark: the bark's sourced colour and relief over the
 * wood's painted shade (vertex colour). Every limb wears it wrapped round in whole tiles (so it
 * never seams, and the furrows converge as the limb tapers, as an oak's do) and running up it by
 * its length, so the furrows follow each limb from its foot to its tip. Over a collar, where a
 * branch or root leaves its parent, the branch's own wrap runs down to the rim of its hole, turned
 * to carry on from the parent's bark there (treeGrowth.ts, woodGeometry): the furrows flow out of
 * the parent into the branch with no seam or cross-grain patch. The relief follows the wrap.
 * Young branches' relief is gentler; moss settles in the furrows on upper sides and round the foot.
 * Limbs and branches sway with their weight.
 */
export function grownBark(mat: THREE.MeshStandardMaterial, wind: WindClock, look: BarkLook) {
  mat.flatShading = false;
  mat.vertexColors = true;
  mat.roughness = 0.95;
  mat.color.setRGB(1, 1, 1);
  const uniforms = {
    uWindT: wind.uWindT,
    uBarkTile: { value: look.tile },
    uBarkRelief: { value: look.relief },
    uBarkGain: { value: look.gain },
    uBarkMoss: { value: new THREE.Vector3(look.moss[0], look.moss[1], look.moss[2]) },
    uBarkGlow: { value: look.glow ?? 0 },
  };
  addPatch(mat, {
    // (The maps are looked up when the material is first drawn, so a world can be built without them.)
    key: `grown-bark:${look.kind}`,
    uniforms,
    nodes(u, b) {
      const maps = barkFor(look.kind);
      const barkA = attribute('aBarkA', 'vec4') as V4, barkB = attribute('aBarkB', 'vec4') as V4, wood = attribute('aWood', 'vec4') as V4;
      let uv: V2 = vec2(0), nl: V3 = vec3(0), detail: F = float(0);
      return {
        position: (p) => p.add(treeSway(positionGeometry, wood.x, u.f('uWindT'), instanceOrigin(b))),
        color(c) {
          // Round the limb: its angle counted in whole tiles (taken from whichever of two seams lies
          // elsewhere, so the mip level never jumps) plus the wrap's offset; up it, its bark
          // coordinate. A collar takes its branch's wrap, turned toward the parent's bark at the rim
          // (the turn eased in and out, so the furrows bend smoothly from one into the other).
          const collar = (varying(wood.w).setInterpolation('flat') as F).greaterThan(0.5);
          const foot = varying(barkA.w).setInterpolation('flat') as F;
          const w = select(collar, barkB, barkA).toVar();
          const rim = float(1).sub(wood.w).toVar();
          const off = select(collar, foot.add(select(rim.greaterThan(1e-4), w.w.div(rim), float(0)).mul(rim).mul(rim).mul(float(3).sub(rim.mul(2)))), w.w);
          const ang = atan(w.y, w.x).mul(0.15915494).toVar();
          const s1 = ang.mul(w.z).toVar(), s2 = ang.add(1).fract().mul(w.z).toVar();
          uv = vec2(select(fwidth(s1).lessThanEqual(fwidth(s2)), s1, s2).add(off), wood.z.div(u.f('uBarkTile'))).toVar();
          const col = texture(maps.map).sample(uv).rgb.toVar();
          nl = texture(maps.normal).sample(uv).xyz.mul(2).sub(1).toVar();
          // Young branches' relief is gentler.
          detail = smoothstep(0.02, 0.12, wood.y).mul(0.65).add(0.35).toVar();
          const lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
          const up = smoothstep(0.3, 0.9, normalize(normalGeometry).y), base = float(1).sub(smoothstep(0.1, 1.2, positionGeometry.y));
          const moss = saturate(up.mul(0.7).add(base.mul(0.6))).mul(float(1).sub(smoothstep(0.04, 0.12, lum)));
          return c.mul(mix(col, u.v3('uBarkMoss'), moss.mul(0.55)).mul(u.f('uBarkGain')));
        },
        emissive(e) {
          // A glowing bark's veins: where it runs bluer than its grey.
          const raw = texture(maps.map).sample(uv).rgb;
          const vein = smoothstep(0.03, 0.12, raw.b.sub(max(raw.r, raw.g)));
          return e.add(vec3(0.35, 0.8, 1.0).mul(vein.mul(u.f('uBarkGlow'))));
        },
        normal(n) {
          // The relief along the wrap's own directions on the surface: round the limb (u) and up it (v).
          const q0 = dFdx(positionView), q1 = dFdy(positionView);
          const st0 = dFdx(uv), st1 = dFdy(uv);
          const q1n = cross(q1, n), q0n = cross(n, q0);
          const bu0 = q1n.mul(st0.x).add(q0n.mul(st1.x)).toVar(), bv0 = q1n.mul(st0.y).add(q0n.mul(st1.y)).toVar();
          const bu = select(dot(bu0, bu0).greaterThan(0), normalize(bu0), vec3(0));
          const bv = select(dot(bv0, bv0).greaterThan(0), normalize(bv0), vec3(0));
          const tilt = bu.mul(nl.x).add(bv.mul(nl.y)).mul(u.f('uBarkRelief').mul(detail)).toVar();
          return normalize(n.add(tilt).sub(n.mul(dot(tilt, n))));
        },
      };
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
export function grownLeaves(mat: THREE.MeshStandardMaterial, wind: WindClock, kind: LeafKind, glow = 0) {
  mat.map = leafAtlas(kind);
  mat.alphaTest = 0.5;
  mat.side = THREE.DoubleSide;
  mat.flatShading = false;
  mat.vertexColors = true;
  mat.roughness = 0.85;
  mat.color.setScalar(LEAF_GAIN);
  addPatch(mat, {
    key: 'grown-leaves',
    uniforms: { uWindT: wind.uWindT, uLeafGlow: { value: glow } },
    nodes(u, b) {
      return {
        position(p) {
          const t = u.f('uWindT');
          const windA = attribute('aWind', 'vec4') as V4, spine = attribute('aSpine', 'vec3') as V3;
          const inst = instanceMatrixNode(b);
          const card = attribute('aCard', 'vec3') as V3;
          const cn = normalize(mat3(modelWorldMatrix).mul(inst ? mat3(inst).mul(card) : card));
          const wp = modelWorldMatrix.mul(inst ? inst.mul(vec4(p, 1)) : vec4(p, 1)).xyz;
          const facing = abs(dot(cn, normalize(cameraPosition.sub(wp))));
          const narrowed = spine.add(p.sub(spine).mul(smoothstep(0.06, 0.3, facing)));
          const flutter = sin(t.mul(6.3).add(dot(windA.xyz, vec3(12.9, 7.3, 9.1)))).mul(0.05).mul(attribute('aFlutter', 'float') as F).mul(windA.w);
          return narrowed.add(treeSway(windA.xyz, windA.w, t, instanceOrigin(b))).add(normalGeometry.mul(flutter));
        },
        // (Both faces take the crown's normal: the back face's flip is undone.)
        normal: (n) => n.mul(faceDirection),
        // A glowing kind's leaves give off their own colour (the magic tree's teal).
        emissive: (e) => e.add(diffuseColor.rgb.mul(u.f('uLeafGlow'))),
      };
    },
  });
}
