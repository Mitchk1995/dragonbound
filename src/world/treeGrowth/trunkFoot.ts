import * as THREE from 'three';
import { clamp } from '../../core/rng';
import { arcAtHeight, type Joint, type Limb, type Root } from './skeleton';

/** The trunk's foot: its flare and buttresses, and the roots' ridges swelling out of it into the ground (grow.ts, wood.ts). */

/** The trunk's buttresses at height y: how far the trunk swells toward a root, as a multiple of its radius (`flute`: Species.flute). */
const buttressSwell = (y: number, flute = 1) => 1 + 0.32 * (1 - THREE.MathUtils.smoothstep(y, -0.1, 1.1 * flute));

/** The trunk's flare toward its foot: its radius there as a multiple of the pipe model's. */
export const footFlare = (y: number) => 1 + 0.3 * (1 - THREE.MathUtils.smoothstep(y, -0.2, 1.6));

/** Where the trunk's foot begins (m): under the ground, deep enough that on a slope its downhill side stays in it. */
export const TRUNK_FOOT = -0.6;

/**
 * How far a root's ridge stands out beyond the bark at height y: nothing above its top, then
 * swelling ever faster down to its reach at the ground (a concave flare, steep against the trunk),
 * and under the ground drawing in again as it goes down, so the trunk's foot ends compact (on a
 * slope, the ground on its downhill side still covers it).
 */
function rootReach(r: Root, y: number) {
  if (y >= r.top) return 0;
  if (y >= 0) {
    const t = 1 - y / r.top;
    return r.reach * t * t;
  }
  return r.reach * (1 - (0.5 * y) / TRUNK_FOOT);
}

/** The trunk's buttresses: swelling toward each root at its foot. */
export function buttress(roots: number[], a: number, y: number, flute: number) {
  const k = buttressSwell(y, flute) - 1;
  if (k <= 0) return 1;
  let s = 0;
  for (const r of roots) s += Math.pow(Math.max(0, Math.cos(a - r)), 6);
  return 1 + k * Math.min(1, s);
}

/** Heights of the trunk's foot rings (m): sparse under the ground, close where the roots swell out of the bark. */
export const FOOT_YS = [TRUNK_FOOT, -0.04, 0.15, 0.36, 0.6, 0.86];
/** The highest the trunk's foot reaches (m; lower where a limb leaves the trunk close over it). */
const FOOT_TOP = 1.05;

/** Arc length along the trunk where its tube starts, over its foot: under every hole a limb cuts in it. */
export function footTop(L: Limb, holes: Joint[]) {
  return Math.max(0, Math.min(arcAtHeight(L, FOOT_TOP), ...holes.map((j) => j.s - j.h - 0.12)));
}

/** A root ridge's half-width at height y (m): broader where it leaves the bark, so it swells out of the trunk rather than standing on it. */
const ridgeWidth = (root: Root, y: number) => root.width * (1 + 0.8 * clamp(y / root.top, 0, 1));

/**
 * Where the trunk foot's vertices stand round it at height y (its girth there `r`): five across
 * each root's crest, from one flank's foot over the crest to the other's (so every ridge stays round
 * however far it reaches), and a few in each gap between roots. Every ring has the same vertices in
 * the same order, so they join ring to ring along the ridges; `bark` is each one's fixed angle round
 * the trunk (the bark's furrows run down the ridges with them).
 */
export function footLayout(roots: Root[], n: number, y: number, r: number) {
  const order = [...roots].sort((p, q) => mod2pi(p.a) - mod2pi(q.a)), k = order.length, TAU = Math.PI * 2;
  if (!k) {
    const even = Array.from({ length: n }, (_, j) => (j / n) * TAU);
    return { angles: even, bark: even };
  }
  const at = order.map((q) => mod2pi(q.a));
  const gapTo = (i: number) => (i + 1 < k ? at[i + 1] - at[i] : at[0] + TAU - at[i]);
  // (Each crest's place round the trunk: as wide as it can be without crowding its neighbours.)
  const half = at.map((_, i) => Math.min(0.4, 0.45 * Math.min(gapTo(i), gapTo((i + k - 1) % k))));
  const gaps = at.map((_, i) => gapTo(i) - half[i] - half[(i + 1) % k]), spare = Math.max(k, n - 5 * k), total = gaps.reduce((a, b) => a + b, 0);
  const angles: number[] = [], bark: number[] = [];
  order.forEach((root, i) => {
    const w = Math.min(half[i], Math.asin(Math.min(0.95, ridgeWidth(root, y) / (r + rootReach(root, y)))));
    for (const x of [-1, -0.5, 0, 0.5, 1]) {
      angles.push(at[i] + x * w);
      bark.push(at[i] + x * half[i]);
    }
    const j = (i + 1) % k, next = at[i] + gapTo(i);
    const wn = Math.min(half[j], Math.asin(Math.min(0.95, ridgeWidth(order[j], y) / (r + rootReach(order[j], y)))));
    const m = Math.max(1, Math.round((spare * gaps[i]) / total));
    for (let g = 1; g <= m; g++) {
      angles.push(at[i] + w + ((next - wn - at[i] - w) * g) / (m + 1));
      bark.push(at[i] + half[i] + (gaps[i] * g) / (m + 1));
    }
  });
  return { angles, bark };
}

const mod2pi = (a: number) => ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);

/**
 * The trunk foot's radius at angle a round it and height y: its girth `r` buttressed toward the
 * roots, and every root's ridge standing out of it (rootReach), as wide as the root at its crest
 * and easing into the bark either side.
 */
export function footRadius(roots: Root[], angles: number[], a: number, y: number, r: number, flute: number) {
  const base = r * buttress(angles, a, y, flute);
  let R = base;
  for (const root of roots) {
    const ext = rootReach(root, y), d = Math.abs(Math.atan2(Math.sin(a - root.a), Math.cos(a - root.a)));
    if (ext <= 0 || d >= Math.PI / 2) continue;
    const x = ((base + ext) * Math.sin(d)) / ridgeWidth(root, y);
    if (x < 1) R += ext * (1 - x * x);
  }
  return R;
}
