import type { KitBuild, Placed } from './build';
import type { ElementDef, Kind } from './elements';
import type { Rot } from './scale';

/**
 * Laying walls and floors the way a mason and a joiner lay them. A wall is laid course by course in
 * running bond: within every free stretch of a course the pieces are chosen so that no joint falls
 * over a joint of the course below, or under a fixed joint of the course above (a quoin, a jamb, an
 * arch already set), so every course binds the one under it. Every stretch ends on a whole piece.
 */

/** A straight run of cells: along x or z, at `at` across it, from `from` to `to` (exclusive). */
export interface Line {
  axis: 'x' | 'z';
  at: number;
  from: number;
  to: number;
}

/** How a course is laid: the piece for each length (null: no such piece), its colour and part. */
export interface Course {
  /** Lengths to try. */
  sizes: number[];
  /** The piece for a length. */
  piece: (len: number) => ElementDef | null;
  /** The colour of the piece of length `len` starting at `pos` along the line. */
  color: number | ((pos: number, len: number) => number);
  part: string;
  /** Height in steps (a course of stone is three). */
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
const cellOf = (l: Line, pos: number): [number, number] => (l.axis === 'x' ? [pos, l.at] : [l.at, pos]);

/** The pieces courses are laid from. */
const COURSED = new Set<Kind>(['stone', 'beam', 'floor', 'panel']);

/** Is q a coursed piece standing in the course at y, h steps tall? */
const inCourse = (q: Placed | undefined, y: number, h: number) => (q && COURSED.has(q.el.kind) && q.y === y && q.el.h === h ? q : undefined);

/** The joints between one piece of a course and the next: positions along the line. */
export function joints(b: KitBuild, l: Line, y: number, h = 3): Set<number> {
  const out = new Set<number>();
  let prev: Placed | undefined;
  for (let pos = l.from; pos < l.to; pos++) {
    const [x, z] = cellOf(l, pos);
    const piece = inCourse(b.at(x, y, z), y, h);
    if (piece && prev && piece !== prev) out.add(pos);
    prev = piece;
  }
  return out;
}

/** Where pieces already set in a course meet the free cells round them: joints the fill must bind across. */
function fixedEdges(b: KitBuild, l: Line, y: number, h: number): Set<number> {
  const out = new Set<number>();
  for (let pos = l.from + 1; pos < l.to; pos++) {
    const [ax, az] = cellOf(l, pos - 1), [bx, bz] = cellOf(l, pos);
    const fa = b.free(ax, az, y, y + h), fb = b.free(bx, bz, y, y + h);
    if (fa !== fb && inCourse(b.at(fa ? bx : ax, y, fa ? bz : az), y, h)) out.add(pos);
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
  if (best[n] === Infinity) throw new Error(`building kit: cannot lay ${n} cells from ${sizes.join(', ')}`);
  const lens: number[] = [];
  for (let q = n; q > 0; q = from[q]) lens.unshift(q - from[q]);
  return { lens, forced: Math.floor(best[n] / 1000) };
}

/** Lays one course of `line` at step y: every free stretch filled, bound to the courses round it. Returns the joints it had to force. */
export function course(b: KitBuild, l: Line, y: number, c: Course): number {
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
    while (end < l.to && b.free(...cellOf(l, end), y, y + h)) end++;
    const s = split(pos, end, c.sizes.filter((n) => c.piece(n)), avoid, c.cost, c.parity);
    forced += s.forced;
    let at = pos;
    for (const n of s.lens) {
      const [cx, cz] = cellOf(l, at);
      b.place(c.piece(n)!, cx, y, cz, typeof c.color === 'function' ? c.color(at, n) : c.color, { rot: c.rot, part: c.part });
      at += n;
    }
    pos = end;
  }
  return forced;
}

/**
 * Fills a rectangle of cells [x0, x1) × [z0, z1) at step y with rows of pieces `rowD` cells deep laid
 * along `axis`, each row's joints broken against the row before (cells already filled, or that `skip`
 * picks, are left): floorboards, or a floor of flags.
 */
export function rows(b: KitBuild, x0: number, z0: number, x1: number, z1: number, y: number, piece: (len: number, rowD: number) => ElementDef | null, color: Course['color'], part: string, axis: 'x' | 'z' = 'x', sizes = [6, 4, 3, 2, 1], rowD = 1, skip: (x: number, z: number) => boolean = () => false, h = 1) {
  const across = axis === 'x' ? [z0, z1] : [x0, x1], run = axis === 'x' ? [x0, x1] : [z0, z1];
  const open = (l: Line, pos: number, d: number) => {
    for (let k = 0; k < d; k++) {
      const [x, z] = cellOf({ ...l, at: l.at + k }, pos);
      if (skip(x, z) || !b.free(x, z, y, y + h)) return false;
    }
    return true;
  };
  let prev = new Set<number>();
  for (let r = across[0]; r < across[1];) {
    const d = Math.min(rowD, across[1] - r);
    const l: Line = { axis, at: r, from: run[0], to: run[1] }, joins = new Set<number>();
    // Where a full-depth row piece cannot go (the row runs into something), single rows fill in.
    for (let pos = l.from; pos < l.to;) {
      if (!open(l, pos, d)) {
        pos++;
        continue;
      }
      let end = pos;
      while (end < l.to && open(l, end, d)) end++;
      let at = pos;
      for (const n of split(pos, end, sizes.filter((s) => piece(s, d)), prev, (n) => (n < 2 ? 0.8 : 0)).lens) {
        const [cx, cz] = cellOf(l, at);
        b.place(piece(n, d)!, cx, y, cz, typeof color === 'function' ? color(at, n) : color, { rot: axis === 'x' ? 0 : 1, part });
        if (at > pos) joins.add(at);
        at += n;
      }
      pos = end;
    }
    if (d > 1) for (let k = 0; k < d; k++) rows(b, x0, z0, x1, z1, y, piece, color, part, axis, sizes, 1, (x, z) => skip(x, z) || (axis === 'x' ? z !== r + k : x !== r + k), h);
    prev = joins;
    r += d;
  }
}
