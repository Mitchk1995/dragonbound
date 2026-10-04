import { clamp, mulberry32, type Rng } from '../../core/rng';

/** The leaf kinds, the atlas's spray cells, and the painted atlases of the oak's and the common tree's leaves. */

const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

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
