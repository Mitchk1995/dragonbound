import * as THREE from 'three';
import type { Part } from '../src/world/props';

/**
 * Solid-geometry helpers for the castle's geometry audit (castle-geometry.test.ts): every built part
 * placed in the world as an oriented box or an upright cylinder, overlap depths between them, and a
 * grid to find the parts near each other.
 */

/** A part in world space: an oriented box (centre, unit axes, half extents) or an upright cylinder. */
export interface Solid {
  /** Index of the piece (prop or building) it belongs to. */
  piece: number;
  part: Part;
  c: THREE.Vector3;
  u: THREE.Vector3[];
  e: number[];
  /** Upright cylinder: its radius (0 for a box); a ring's inner radius `rIn`. */
  r: number;
  rIn: number;
  lo: THREE.Vector3;
  hi: THREE.Vector3;
}

const v = new THREE.Vector3();

/**
 * A part as solids in world space: one box or upright cylinder, or (a cone or a tapering drum) a stack
 * of cylinders, each as wide as the taper at its middle.
 */
export function solidsOf(piece: number, part: Part, world: THREE.Matrix4): Solid[] {
  if (part.shape !== 'cyl' || Math.abs(part.r - part.rTop) < 0.05) return [solidOf(piece, part, world)];
  const n = 6, y0 = part.min.y, h = part.max.y - part.min.y;
  return Array.from({ length: n }, (_, i) => {
    const f = (i + 0.5) / n, r = part.r + (part.rTop - part.r) * f;
    const slice: Part = { ...part, r, rTop: r, min: new THREE.Vector3(-r, y0 + (h * i) / n, -r), max: new THREE.Vector3(r, y0 + (h * (i + 1)) / n, r) };
    return solidOf(piece, slice, world);
  });
}

export function solidOf(piece: number, part: Part, world: THREE.Matrix4): Solid {
  const M = world.clone().multiply(part.m);
  const mid = part.min.clone().add(part.max).multiplyScalar(0.5), half = part.max.clone().sub(part.min).multiplyScalar(0.5);
  const c = mid.clone().applyMatrix4(M);
  const cols = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  M.extractBasis(cols[0], cols[1], cols[2]);
  const len = cols.map((a) => a.length());
  const u = cols.map((a, i) => (len[i] > 1e-9 ? a.clone().divideScalar(len[i]) : new THREE.Vector3(i === 0 ? 1 : 0, i === 1 ? 1 : 0, i === 2 ? 1 : 0)));
  const e = [half.x * len[0], half.y * len[1], half.z * len[2]];
  let r = 0, rIn = 0;
  if (part.shape === 'cyl' && Math.abs(u[1].y) > 0.985) {
    r = Math.max(part.r, part.rTop) * Math.max(len[0], len[2]);
    rIn = part.rIn * Math.max(len[0], len[2]);
  }
  // World bounds.
  const ext = [0, 1, 2].map((k) => Math.abs(u[0].getComponent(k)) * e[0] + Math.abs(u[1].getComponent(k)) * e[1] + Math.abs(u[2].getComponent(k)) * e[2]);
  const lo = new THREE.Vector3(c.x - ext[0], c.y - ext[1], c.z - ext[2]), hi = new THREE.Vector3(c.x + ext[0], c.y + ext[1], c.z + ext[2]);
  if (r) {
    lo.x = Math.min(lo.x, c.x - r);
    hi.x = Math.max(hi.x, c.x + r);
    lo.z = Math.min(lo.z, c.z - r);
    hi.z = Math.max(hi.z, c.z + r);
  }
  return { piece, part, c, u, e, r, rIn, lo, hi };
}

/** The 8 corners of a box solid. */
export function corners(s: Solid) {
  const out: THREE.Vector3[] = [];
  for (const a of [-1, 1]) for (const b of [-1, 1]) for (const d of [-1, 1]) {
    out.push(s.c.clone().addScaledVector(s.u[0], a * s.e[0]).addScaledVector(s.u[1], b * s.e[1]).addScaledVector(s.u[2], d * s.e[2]));
  }
  return out;
}

function boxBox(A: Solid, B: Solid) {
  const axes: THREE.Vector3[] = [...A.u, ...B.u];
  for (const a of A.u) for (const b of B.u) {
    const x = new THREE.Vector3().crossVectors(a, b);
    if (x.lengthSq() > 1e-6) axes.push(x.normalize());
  }
  const d = B.c.clone().sub(A.c);
  let pen = Infinity;
  for (const L of axes) {
    const ra = A.e[0] * Math.abs(A.u[0].dot(L)) + A.e[1] * Math.abs(A.u[1].dot(L)) + A.e[2] * Math.abs(A.u[2].dot(L));
    const rb = B.e[0] * Math.abs(B.u[0].dot(L)) + B.e[1] * Math.abs(B.u[1].dot(L)) + B.e[2] * Math.abs(B.u[2].dot(L));
    pen = Math.min(pen, ra + rb - Math.abs(d.dot(L)));
    if (pen < -1) return pen;
  }
  return pen;
}

/** The convex outline of points in plan (x, z), counter-clockwise. */
function hull(pts: [number, number][]) {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [], upper: [number, number][] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  for (const q of [...p].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

/** Signed distance from (x, z) to a convex polygon's edge (negative inside). */
function polyDist(poly: [number, number][], x: number, z: number) {
  let inside = true, best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const [ax, az] = poly[i], [bx, bz] = poly[(i + 1) % poly.length];
    const ex = bx - ax, ez = bz - az, l2 = ex * ex + ez * ez || 1e-12;
    const t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / l2));
    best = Math.min(best, Math.hypot(ax + ex * t - x, az + ez * t - z));
    if (ex * (z - az) - ez * (x - ax) < 0) inside = false;
  }
  return inside ? -best : best;
}

function cylY(s: Solid) {
  return [s.c.y - s.e[1], s.c.y + s.e[1]];
}

function cylBox(C: Solid, B: Solid) {
  const [y0, y1] = cylY(C);
  const yo = Math.min(y1, B.hi.y) - Math.max(y0, B.lo.y);
  if (yo <= 0) return yo;
  const poly = hull(corners(B).map((p) => [p.x, p.z] as [number, number]));
  const flat = poly.length < 3;
  const d = flat ? Math.hypot(C.c.x - B.c.x, C.c.z - B.c.z) - Math.max(B.e[0], B.e[2]) : polyDist(poly, C.c.x, C.c.z);
  return Math.min(yo, C.r - d);
}

/** How deep two solids overlap (negative: the gap between them, roughly). */
export function overlap(A: Solid, B: Solid): number {
  for (const k of ['x', 'y', 'z'] as const) {
    const g = Math.max(A.lo[k] - B.hi[k], B.lo[k] - A.hi[k]);
    if (g > 0) return -g;
  }
  // Inside a ring's hole: clear of it.
  for (const [R, O] of [[A, B], [B, A]]) {
    if (!R.rIn) continue;
    const reach = O.r ? Math.hypot(O.c.x - R.c.x, O.c.z - R.c.z) + O.r : Math.max(...corners(O).map((p) => Math.hypot(p.x - R.c.x, p.z - R.c.z)));
    if (reach < R.rIn) return -(R.rIn - reach);
  }
  if (A.r && B.r) {
    const [a0, a1] = cylY(A), [b0, b1] = cylY(B);
    return Math.min(Math.min(a1, b1) - Math.max(a0, b0), A.r + B.r - Math.hypot(A.c.x - B.c.x, A.c.z - B.c.z));
  }
  if (A.r) return cylBox(A, B);
  if (B.r) return cylBox(B, A);
  return boxBox(A, B);
}

/** Is a world point inside a solid (within `tol`)? */
export function contains(s: Solid, p: THREE.Vector3, tol = 0) {
  if (s.r) {
    const [y0, y1] = cylY(s);
    return p.y >= y0 - tol && p.y <= y1 + tol && Math.hypot(p.x - s.c.x, p.z - s.c.z) <= s.r + tol;
  }
  v.copy(p).sub(s.c);
  return s.u.every((a, i) => Math.abs(v.dot(a)) <= s.e[i] + tol);
}

/** A plan grid of solids (by their world bounds), to find the ones near a box. */
export class Grid {
  private cells = new Map<number, number[]>();
  constructor(readonly solids: Solid[], private size = 2) {
    solids.forEach((s, i) => this.each(s.lo, s.hi, (key) => {
      const list = this.cells.get(key);
      if (list) list.push(i);
      else this.cells.set(key, [i]);
    }));
  }
  private each(lo: THREE.Vector3, hi: THREE.Vector3, f: (key: number) => void) {
    for (let z = Math.floor(lo.z / this.size); z <= Math.floor(hi.z / this.size); z++) for (let x = Math.floor(lo.x / this.size); x <= Math.floor(hi.x / this.size); x++) f(x * 100003 + z);
  }
  /** Indices of solids whose bounds come within `pad` of the box lo..hi. */
  near(lo: THREE.Vector3, hi: THREE.Vector3, pad = 0) {
    const out = new Set<number>();
    const a = lo.clone().subScalar(pad), b = hi.clone().addScalar(pad);
    this.each(a, b, (key) => this.cells.get(key)?.forEach((i) => {
      const s = this.solids[i];
      if (s.lo.x <= b.x && s.hi.x >= a.x && s.lo.y <= b.y && s.hi.y >= a.y && s.lo.z <= b.z && s.hi.z >= a.z) out.add(i);
    }));
    return [...out];
  }
}
