import { BrickBuild, type Placed } from './build';
import { brickId, slopeId } from './elements';
import type { BrickColor } from './palette';
import type { Rot } from './scale';
import type { SlopeDeg } from './shapes';

/**
 * Laying walls, floors and roofs the way a builder lays them. A wall is laid course by course in
 * running bond: within every free stretch of a course the bricks are chosen so that no joint falls
 * over a joint of the course below, or under a fixed joint of the course above (a quoin, a jamb, a
 * lintel already set), so every course binds the one under it.
 */

/** A straight run of stud cells: along x or z, at `at` across it, from `from` to `to` (exclusive). */
export interface Line {
  axis: 'x' | 'z';
  at: number;
  from: number;
  to: number;
}

/** How a course is laid: the element for each length (null: no such brick), its colour and part. */
export interface Course {
  /** Lengths to try, in order of preference. */
  sizes: number[];
  /** The element id for a length. */
  id: (len: number) => string | null;
  /** The colour of the piece of length `len` starting at `pos` along the line. */
  color: BrickColor | number | ((pos: number, len: number) => BrickColor | number);
  part: string;
  /** Height in plates (3 for bricks). */
  h?: number;
  /** The turn that faces each piece's front outward. */
  rot: Rot;
  /** Extra cost of a length (so short pieces are a last resort). */
  cost?: (len: number) => number;
  /**
   * Which positions (even 0, odd 1) this course's joints should fall on: alternating it course by
   * course is running bond, so a joint is broken even by courses still to be laid.
   */
  parity?: number;
}

/** The cell of a line at position `pos`: [x, z] (also the footprint corner of a piece laid along the line from there). */
export const cellOf = (l: Line, pos: number): [number, number] => (l.axis === 'x' ? [pos, l.at] : [l.at, pos]);

/** The joints between one wall brick and the next in a course: positions along the line. */
export function joints(b: BrickBuild, l: Line, y: number, h = 3): Set<number> {
  const out = new Set<number>();
  let prev: Placed | undefined;
  for (let pos = l.from; pos < l.to; pos++) {
    const [x, z] = cellOf(l, pos);
    const q = b.at(x, y, z);
    const brick = q && q.el.kind === 'brick' && q.y === y && q.el.h === h ? q : undefined;
    if (brick && prev && brick !== prev) out.add(pos);
    prev = brick;
  }
  return out;
}

/** Where pieces already set in a course meet the free cells round them: joints the fill must bind across. */
function fixedEdges(b: BrickBuild, l: Line, y: number, h: number): Set<number> {
  const out = new Set<number>();
  for (let pos = l.from + 1; pos < l.to; pos++) {
    const [ax, az] = cellOf(l, pos - 1), [bx, bz] = cellOf(l, pos);
    const fa = b.free(ax, az, y, y + h), fb = b.free(bx, bz, y, y + h);
    if (fa !== fb) {
      const q = b.at(fa ? bx : ax, y, fa ? bz : az);
      if (q?.el.kind === 'brick') out.add(pos);
    }
  }
  return out;
}

/**
 * Splits [a, b) into pieces from `sizes` with no inner joint on `avoid`, as few and as cheap as can
 * be. If no such split exists, joints on `avoid` are allowed at a heavy cost (and reported).
 */
export function split(a: number, b: number, sizes: number[], avoid: Set<number>, cost: (len: number) => number = () => 0, parity?: number): { lens: number[]; forced: number } {
  const n = b - a, best = new Array<number>(n + 1).fill(Infinity), from = new Array<number>(n + 1).fill(-1);
  best[0] = 0;
  for (let p = 0; p < n; p++) {
    if (best[p] === Infinity) continue;
    for (const s of sizes) {
      const q = p + s;
      if (q > n) continue;
      const clash = q < n && avoid.has(a + q) ? 1000 : 0;
      const odd = q < n && parity !== undefined && (((a + q) % 2) + 2) % 2 !== parity ? 6 : 0;
      const c = best[p] + 1 + cost(s) + clash + odd;
      if (c < best[q] - 1e-9) {
        best[q] = c;
        from[q] = p;
      }
    }
  }
  if (best[n] === Infinity) throw new Error(`brick kit: cannot lay ${n} studs from ${sizes.join(', ')}`);
  const lens: number[] = [];
  for (let q = n; q > 0; q = from[q]) lens.unshift(q - from[q]);
  return { lens, forced: Math.floor(best[n] / 1000) };
}

/** Lays one course of `line` at plate y: every free stretch filled, bound to the courses round it. Returns the joints it had to force. */
export function course(b: BrickBuild, l: Line, y: number, c: Course): number {
  const h = c.h ?? 3;
  const avoid = new Set([...joints(b, l, y - h, h), ...fixedEdges(b, l, y + h, h)]);
  let forced = 0;
  for (let pos = l.from; pos < l.to;) {
    const [x, z] = cellOf(l, pos);
    if (!b.free(x, z, y, y + h)) {
      pos++;
      continue;
    }
    let end = pos;
    while (end < l.to && b.free(...(cellOf(l, end) as [number, number]), y, y + h)) end++;
    const s = split(pos, end, c.sizes.filter((n) => c.id(n)), avoid, c.cost, c.parity);
    forced += s.forced;
    let at = pos;
    for (const n of s.lens) {
      const [cx, cz] = cellOf(l, at);
      const color = typeof c.color === 'function' ? c.color(at, n) : c.color;
      b.place(c.id(n)!, cx, y, cz, color, { rot: c.rot, part: c.part });
      at += n;
    }
    pos = end;
  }
  return forced;
}

/** Plain bricks 1 × n. */
export const plainBricks = (n: number) => (n === 5 || n === 7 ? null : brickId('brick', 1, n));
/** Masonry bricks 1 × 2 and 1 × 4, with plain 1 × 1s where the bond needs a single stud. */
export const masonryBricks = (n: number) => (n === 2 || n === 4 ? `masonry1x${n}` : n === 1 ? 'brick1x1' : null);

/**
 * Fills a rectangle of cells [x0, x1) × [z0, z1) at plate y with plates or tiles laid as boards
 * running along `axis`, each row's joints broken against the row before (cells already filled, or
 * that `skip` picks, are left).
 */
export function boards(b: BrickBuild, x0: number, z0: number, x1: number, z1: number, y: number, kind: 'plate' | 'tile', color: Course['color'], part: string, axis: 'x' | 'z' = 'x', sizes = [8, 6, 4, 3, 2, 1], skip: (x: number, z: number) => boolean = () => false) {
  const rows = axis === 'x' ? [z0, z1] : [x0, x1], run = axis === 'x' ? [x0, x1] : [z0, z1];
  const open = (l: Line, pos: number) => {
    const [x, z] = cellOf(l, pos);
    return !skip(x, z) && b.free(x, z, y, y + 1);
  };
  let prev = new Set<number>();
  for (let r = rows[0]; r < rows[1]; r++) {
    const l: Line = { axis, at: r, from: run[0], to: run[1] }, joins = new Set<number>();
    for (let pos = l.from; pos < l.to;) {
      if (!open(l, pos)) {
        pos++;
        continue;
      }
      let end = pos;
      while (end < l.to && open(l, end)) end++;
      let at = pos;
      for (const n of split(pos, end, sizes, prev, (n) => (n < 3 ? 0.6 : 0)).lens) {
        const [cx, cz] = cellOf(l, at);
        b.place(brickId(kind, 1, n), cx, y, cz, typeof color === 'function' ? color(at, n) : color, { rot: axis === 'x' ? 0 : 1, part });
        if (at > pos) joins.add(at);
        at += n;
      }
      pos = end;
    }
    prev = joins;
  }
}

/**
 * Fills a rectangle [x0, x1) × [z0, z1) at plate y with the largest plates that fit (a sub-floor),
 * skipping filled cells.
 */
export function plates(b: BrickBuild, x0: number, z0: number, x1: number, z1: number, y: number, color: Course['color'], part: string, skip: (x: number, z: number) => boolean = () => false) {
  const sizes: [number, number][] = [[8, 16], [6, 16], [6, 12], [6, 10], [6, 8], [4, 12], [4, 10], [4, 8], [4, 6], [6, 6], [4, 4], [2, 8], [2, 6], [2, 4], [2, 3], [2, 2], [1, 8], [1, 6], [1, 4], [1, 3], [1, 2], [1, 1]];
  const fits = (x: number, z: number, w: number, d: number) => {
    if (x + w > x1 || z + d > z1) return false;
    for (let i = 0; i < w; i++) for (let j = 0; j < d; j++) if (skip(x + i, z + j) || !b.free(x + i, z + j, y, y + 1)) return false;
    return true;
  };
  for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) {
    if (skip(x, z) || !b.free(x, z, y, y + 1)) continue;
    for (const [d, w] of sizes) {
      const rot: Rot | null = fits(x, z, w, d) ? 0 : fits(x, z, d, w) ? 1 : null;
      if (rot === null) continue;
      b.place(brickId('plate', d, w), x, y, z, typeof color === 'function' ? color(x, w) : color, { rot, part });
      break;
    }
  }
}

/** Caps every stud left bare on the pieces `which` picks with a 1 × 1 tile (the flashing round a chimney, a roof's ends). */
export function capStuds(b: BrickBuild, which: (p: Placed) => boolean, color: BrickColor | number, part: string) {
  for (const p of b.items.filter(which)) for (const s of b.studsOf(p)) {
    if (b.coverOf(s, p)) continue;
    b.place('tile1x1', Math.floor(s[0] / 20), Math.round(s[1] / 8), Math.floor(s[2] / 20), color, { part });
  }
}

/**
 * One row of a roof: slopes `deg` facing `rot` laid along x from x0 to x1 (exclusive) with their
 * footprint's back corner row at z, at plate y, joints broken against the row below.
 */
export function slopeRow(b: BrickBuild, kind: 'slope' | 'ridge' | 'inv', deg: SlopeDeg, x0: number, x1: number, z: number, y: number, rot: 0 | 2, color: BrickColor | number, part: string, avoid: Set<number>): Set<number> {
  const widths = kind === 'slope' ? (deg === 45 ? [8, 6, 4, 3, 2, 1] : [4, 3, 2, 1]) : kind === 'ridge' ? [4, 2, 1] : [2, 1];
  const depth = kind === 'ridge' ? (deg === 45 ? 2 : 4) : deg === 45 ? 2 : 3;
  const open = (x: number) => {
    for (let j = 0; j < depth; j++) if (!b.free(x, z + j, y, y + 3)) return false;
    return true;
  };
  const out = new Set<number>();
  for (let pos = x0; pos < x1;) {
    if (!open(pos)) {
      pos++;
      continue;
    }
    let end = pos;
    while (end < x1 && open(end)) end++;
    const s = split(pos, end, widths, avoid, (n) => (n === 1 ? 1.5 : 0));
    let at = pos;
    for (const n of s.lens) {
      b.place(slopeId(kind, deg, n), at, y, z, color, { rot, part });
      if (at > pos) out.add(at);
      at += n;
    }
    pos = end;
  }
  return out;
}
