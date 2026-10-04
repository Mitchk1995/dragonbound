import type { Rot } from './scale';

/**
 * The space each piece fills, which no other piece may share: a box, or a box whose top or bottom
 * slopes along x or z (a roof's slab, a gable's raking top, a stair's string). Every claim is a convex
 * hexahedron, so two claims overlap exactly when no plane separates them (the separating axis test);
 * pieces that only touch, face to face, do not overlap.
 */

/** A box of space: [x0, y0, z0, x1, y1, z1]. */
export type Box = [number, number, number, number, number, number];

/** A sloping face: its height at the low end of `axis` and at the high end. */
interface Slope {
  axis: 'x' | 'z';
  at0: number;
  at1: number;
}

export interface Claim {
  box: Box;
  /** The top face, sloping between these heights (the box's own top otherwise). */
  top?: Slope;
  /** The bottom face, sloping between these heights (the box's own bottom otherwise). */
  bottom?: Slope;
}

export type P3 = [number, number, number];

/** A claim's corners: index = x (0, 1) + 2 × z (0, 1) + 4 × (0 bottom, 1 top). */
export function corners(c: Claim): P3[] {
  const [x0, y0, z0, x1, y1, z1] = c.box;
  const out: P3[] = [];
  for (const top of [0, 1]) for (const zi of [0, 1]) for (const xi of [0, 1]) {
    const s = top ? c.top : c.bottom;
    let y = top ? y1 : y0;
    if (s) y = (s.axis === 'x' ? xi : zi) ? s.at1 : s.at0;
    out.push([xi ? x1 : x0, y, zi ? z1 : z0]);
  }
  return out;
}

/** The six faces of a hexahedron by corner index, each wound so its normal points out. */
const FACES = [
  [0, 1, 3, 2], [4, 6, 7, 5], // bottom, top
  [0, 2, 6, 4], [1, 5, 7, 3], // x0, x1
  [0, 4, 5, 1], [2, 3, 7, 6], // z0, z1
];
const EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];

/** A claim placed in the world: its corners, and its bounding box for the broad phase. */
export interface Hull {
  v: P3[];
  lo: P3;
  hi: P3;
}

export function hull(v: P3[]): Hull {
  const lo: P3 = [Infinity, Infinity, Infinity], hi: P3 = [-Infinity, -Infinity, -Infinity];
  for (const p of v) for (let k = 0; k < 3; k++) {
    lo[k] = Math.min(lo[k], p[k]);
    hi[k] = Math.max(hi[k], p[k]);
  }
  return { v, lo, hi };
}

/** An element-local point turned by `rot` (quarter turns about the vertical; 1 turns +z to +x). */
export function turn(lx: number, lz: number, rot: Rot): [number, number] {
  switch (rot) {
    case 1: return [lz, -lx];
    case 2: return [-lx, -lz];
    case 3: return [-lz, lx];
    default: return [lx, lz];
  }
}

/** A claim turned by `rot` and moved to `o`. */
export function placeClaim(c: Claim, rot: Rot, o: P3): Hull {
  return hull(corners(c).map(([x, y, z]) => {
    const [tx, tz] = turn(x, z, rot);
    return [o[0] + tx, o[1] + y, o[2] + tz] as P3;
  }));
}

const sub = (a: P3, b: P3): P3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: P3, b: P3): P3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: P3, b: P3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (a: P3): P3 | null => {
  const l = Math.hypot(a[0], a[1], a[2]);
  return l < 1e-9 ? null : [a[0] / l, a[1] / l, a[2] / l];
};

/** A face's outward normal (from its first three distinct corners; a degenerate face gives none). */
function faceNormal(v: P3[], f: number[]): P3 | null {
  for (let i = 0; i < 4; i++) {
    const a = v[f[i]], b = v[f[(i + 1) % 4]], c = v[f[(i + 2) % 4]];
    const n = unit(cross(sub(b, a), sub(c, b)));
    if (n) return n;
  }
  return null;
}

function axesOf(h: Hull) {
  const normals = FACES.map((f) => faceNormal(h.v, f)).filter((n): n is P3 => !!n);
  const edges = EDGES.map(([a, b]) => unit(sub(h.v[b], h.v[a]))).filter((n): n is P3 => !!n);
  return { normals, edges };
}

/** Do two placed claims share space deeper than `eps` (touching faces do not)? */
export function overlap(a: Hull, b: Hull, eps = 0.05): boolean {
  for (let k = 0; k < 3; k++) if (a.hi[k] <= b.lo[k] + eps || b.hi[k] <= a.lo[k] + eps) return false;
  const A = axesOf(a), B = axesOf(b);
  const axes: P3[] = [...A.normals, ...B.normals];
  for (const e of A.edges) for (const f of B.edges) {
    const c = unit(cross(e, f));
    if (c) axes.push(c);
  }
  for (const ax of axes) {
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
    for (const p of a.v) {
      const d = dot(p, ax);
      a0 = Math.min(a0, d);
      a1 = Math.max(a1, d);
    }
    for (const p of b.v) {
      const d = dot(p, ax);
      b0 = Math.min(b0, d);
      b1 = Math.max(b1, d);
    }
    if (a1 <= b0 + eps || b1 <= a0 + eps) return false;
  }
  return true;
}

/** Is point p inside the placed claim (within `eps`)? */
export function inside(p: P3, h: Hull, eps = 0.05): boolean {
  for (const f of FACES) {
    // (Every face is flat; one squeezed to an edge, as at a wedge's thin end, bounds nothing.)
    const n = faceNormal(h.v, f);
    if (n && dot(sub(p, h.v[f[0]]), n) > eps && dot(sub(p, h.v[f[2]]), n) > eps) return false;
  }
  return true;
}

/** A plain box claim. */
export const boxClaim = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Claim => ({ box: [x0, y0, z0, x1, y1, z1] });
