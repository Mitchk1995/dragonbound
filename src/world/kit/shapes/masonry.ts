import { arc, box, join, Mesh3, prism, rect, ring, slab, type V2 } from '../mesh';
import { COURSE_U, half, PLAY } from '../scale';

/**
 * Dressed stone, in kit units: each piece stands on y = 0 centred on its footprint, one cell deep,
 * its face toward +z. Every stone is a block with chamfered edges, so where two meet the joint is a
 * groove: lit along the lower stone's top edge, in shadow under the upper one's.
 */

/** The chamfer on a dressed stone's edges (U): 3.6 cm; a plinth stone's broad chamfer (7 cm). */
const STONE_EDGE = 1.6, PLINTH_EDGE = 3.2;
/** How far a sill stands proud of the wall under it (U). */
export const SILL_OUT = 2.6;

const hd = half(1);

/** A stone `w` cells long, `d` deep and `hU` tall (a course by default). */
export const stone = (w: number, hU = COURSE_U, d = 1) => box(-half(w), 0, -half(d), half(w), hU, half(d), STONE_EDGE);

/**
 * A plinth stone: a course tall, every edge cut back in a broad chamfer, so the base of the walls
 * reads as a band of heavy blocks with deep V joints, turning its corners like any other course.
 */
export const plinth = (w: number) => box(-half(w), 0, -hd, half(w), COURSE_U, hd, PLINTH_EDGE);

/**
 * A window's sill: one step tall across the opening, flat at the back where the frame stands and
 * sloping down to a front edge that stands proud of the wall, so rain runs off it.
 */
export function sill(w: number): Mesh3 {
  const prof: V2[] = [[-hd, 0], [hd + SILL_OUT, 0], [hd + SILL_OUT, 4.6], [1, 8], [-hd, 8]];
  return prism(ring(prof, 0.9), [], half(w) * 2, 0.9, 'x')[0];
}

/** Cuts a convex polygon's edges in by `d[i]` each (edge i runs from point i to i + 1). */
function cut(poly: V2[], d: number[]): V2[] {
  const n = poly.length;
  const lines = poly.map((a, i) => {
    const b = poly[(i + 1) % n], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    const nx = dy / l, ny = -dx / l;
    return { p: [a[0] - nx * d[i], a[1] - ny * d[i]] as V2, dir: [dx / l, dy / l] as V2 };
  });
  return lines.map((l, i) => {
    const m = lines[(i - 1 + n) % n];
    const den = m.dir[0] * l.dir[1] - m.dir[1] * l.dir[0];
    if (Math.abs(den) < 1e-9) return l.p;
    const t = ((l.p[0] - m.p[0]) * l.dir[1] - (l.p[1] - m.p[1]) * l.dir[0]) / den;
    return [m.p[0] + m.dir[0] * t, m.p[1] + m.dir[1] * t] as V2;
  });
}

/** A stone cut to a convex outline in the wall's plane, the full depth of the wall. */
const cutStone = (poly: V2[], d: number[]) => slab(cut(poly, d), -hd, hd, STONE_EDGE);

/**
 * A flat arch over an opening `span` cells wide: a course tall and two cells longer than the opening,
 * its stones (voussoirs) cut with joints fanning out from a point under the opening, the keystone in
 * the middle, and a skewback block at each end bearing on the jambs. Each stone is its own (sub 1, 2, …).
 */
export function flatArch(span: number): Mesh3 {
  const L = span + 2, W = L * 10, S = span * 10, H = COURSE_U, R = S * 2.6;
  const n = span % 2 ? span + 2 : span + 3;
  const bottom = (i: number) => -S + (2 * S * i) / n, top = (i: number) => bottom(i) * (R + H) / R;
  const stones: Mesh3[] = [];
  // (Joints between the arch's own stones are PLAY each side; its outer ends stop PLAY short of the cell.)
  stones.push(cutStone([[-W, 0], [bottom(0), 0], [top(0), H], [-W, H]], [0, PLAY, 0, PLAY]));
  for (let i = 0; i < n; i++) stones.push(cutStone([[bottom(i), 0], [bottom(i + 1), 0], [top(i + 1), H], [top(i), H]], [0, PLAY, 0, PLAY]));
  stones.push(cutStone([[bottom(n), 0], [W, 0], [W, H], [top(n), H]], [0, PLAY, 0, PLAY]));
  return join(...stones.map((s, i) => s.tag(i + 1)));
}

/** The joint each side of a cut stone in a wall that is not a straight block (U). */
const J = PLAY;

/**
 * An arched front: a wall `w` cells long (its face toward +z) and `H2` U tall in two courses, with a
 * mouth in the middle: `mouth` U wide with straight sides up to `spring` U, then a round head of brick
 * voussoirs, the stones round it cut to the ring and to the course between. Returns [stones,
 * bricks], each stone and brick its own.
 */
export function archFront(w: number, mouth: number, spring: number, ringDepth: number, H2 = 2 * COURSE_U): [Mesh3, Mesh3] {
  const W = w * 10 - PLAY, r0 = mouth / 2, r1 = r0 + ringDepth, H1 = H2 / 2;
  const stones: Mesh3[] = [], bricks: Mesh3[] = [];
  const at = (r: number, y: number) => Math.sqrt(Math.max(0, r * r - (y - spring) ** 2));
  // The voussoirs: the ring cut into seven, the joints running to the mouth's centre.
  const N = 7;
  for (let i = 0; i < N; i++) {
    const a0 = Math.PI - (Math.PI * i) / N, a1 = Math.PI - (Math.PI * (i + 1)) / N;
    const da = J / r0;
    const inner = arc(0, spring, r0, r0, a0 - da, a1 + da, 3), outer = arc(0, spring, r1, r1, a1 + J / r1, a0 - J / r1, 3);
    bricks.push(slab([...inner, ...outer], -hd, hd, 0.9));
  }
  // The lower course: two stones each side, the inner one notched under the ring's springer.
  const jamb = -r0 - (W - r0) / 2;
  for (const s of [1, -1]) {
    const f = (p: V2[]): V2[] => (s > 0 ? p : p.map(([x, y]) => [-x, y] as V2).reverse());
    stones.push(slab(f(rect(-W, 0, jamb - J, H1)), -hd, hd, 1.3));
    const notch: V2[] = [[jamb + J, 0], [-r0 - J, 0], [-r0 - J, spring - J], [-r1 - J, spring - J]];
    // Up the ring's back to the top of the course.
    for (const [x, y] of arc(0, spring, r1 + J, r1 + J, Math.PI, Math.PI - Math.asin(Math.min(1, (H1 - spring) / (r1 + J))), 4).slice(1)) notch.push([x, y]);
    notch.push([jamb + J, H1]);
    stones.push(slab(f(notch), -hd, hd, 1.3));
  }
  // The upper course: an outer stone each side, and one stone over the ring with its underside cut to it.
  const outerX = -r1 - (W - r1) / 2, crown = spring + r1 + J;
  for (const s of [1, -1]) {
    const f = (p: V2[]): V2[] => (s > 0 ? p : p.map(([x, y]) => [-x, y] as V2).reverse());
    stones.push(slab(f(rect(-W, H1, outerX - J, H2)), -hd, hd, 1.3));
  }
  const over: V2[] = [[outerX + J, H1], [-at(r1 + J, H1), H1]];
  if (crown < H2 - 2) {
    for (const p of arc(0, spring, r1 + J, r1 + J, Math.PI - Math.asin(Math.min(1, (H1 - spring) / (r1 + J))), Math.asin(Math.min(1, (H1 - spring) / (r1 + J))), 12).slice(1, -1)) over.push(p);
  }
  over.push([at(r1 + J, H1), H1], [-outerX - J, H1], [-outerX - J, H2], [outerX + J, H2]);
  stones.push(prism(ring(over, 1.3), [], hd * 2, 1.3, 'z')[0]);
  return [join(...stones.map((s, i) => s.tag(i + 1))), join(...bricks.map((b, i) => b.tag(20 + i)))];
}
