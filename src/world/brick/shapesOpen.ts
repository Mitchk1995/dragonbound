import * as THREE from 'three';
import { arc, box, cylinder, join, Mesh3, prism, rect, ring, type V2 } from './mesh';
import { half } from './shapes';
import { EDGE } from './scale';

/**
 * Window frames, their glass and panes, shutters, the door frame and its door, in LDU: frames
 * stand on y = 0 a stud deep, centred on their footprint, the outside (+z) at the front.
 */

/** A frame's opening: [x0, y0] to [x1, y1], with a round head (a half circle) when `round`. */
export interface Opening {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  round: boolean;
}

/** A window frame's opening, w studs wide and `hL` LDU tall: thin sides, a sill and a head. */
export function windowOpening(w: number, hL: number, round = false): Opening {
  return { x0: -half(w) + 4, y0: 5, x1: half(w) - 4, y1: hL - 5, round };
}

/** The opening's outline, counter-clockwise (a round head as 16 facets). */
function openingPoly(o: Opening, grow = 0): V2[] {
  const x0 = o.x0 - grow, x1 = o.x1 + grow, y0 = o.y0 - grow, y1 = o.y1 + grow;
  if (!o.round) return rect(x0, y0, x1, y1);
  const r = (x1 - x0) / 2, cy = y1 - r;
  return [[x0, y0], [x1, y0], ...arc((x0 + x1) / 2, cy, r, r, 0, Math.PI, 16)];
}

const cw = (pts: V2[]) => pts.slice().reverse();

/** A window frame 1 × w, `hL` tall: a stud deep all through, so its reveal shows the wall's depth. */
export function windowFrame(w: number, hL: number, round = false): Mesh3 {
  const o = windowOpening(w, hL, round);
  return prism(ring(rect(-half(w), 0, half(w), hL), EDGE), [ring(cw(openingPoly(o)), EDGE * 0.7)], half(1) * 2, EDGE)[0];
}

/** Clear glass seated in a frame's opening, a little behind the middle of the wall. */
export function glassPane(o: Opening): Mesh3 {
  return prism(ring(openingPoly(o, 1), 0), [], 1.2, 0, 'z', [0, 0, -2])[0];
}

/** A thin bar from a to b (in the x–y plane), `wide` across, from z0 to z1. */
function bar(a: V2, b: V2, wide: number, z0: number, z1: number): Mesh3 {
  const d = [b[0] - a[0], b[1] - a[1]], l = Math.hypot(d[0], d[1]) || 1, n = [(-d[1] / l) * wide / 2, (d[0] / l) * wide / 2];
  const pts: V2[] = [[a[0] - n[0], a[1] - n[1]], [b[0] - n[0], b[1] - n[1]], [b[0] + n[0], b[1] + n[1]], [a[0] + n[0], a[1] + n[1]]];
  const ccw = (pts[1][0] - pts[0][0]) * (pts[2][1] - pts[0][1]) - (pts[1][1] - pts[0][1]) * (pts[2][0] - pts[0][0]) > 0;
  return prism(ring(ccw ? pts : cw(pts), 0), [], z1 - z0, 0, 'z', [0, 0, (z0 + z1) / 2])[0];
}

/** The part of the line through p along d that lies inside the convex polygon `poly` (counter-clockwise), or null. */
function clip(p: V2, d: V2, poly: V2[]): [V2, V2] | null {
  let t0 = -1e9, t1 = 1e9;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    // Inside is to the left of each edge: cross(b − a, x − a) ≥ 0.
    const ex = b[0] - a[0], ey = b[1] - a[1];
    const num = ex * (p[1] - a[1]) - ey * (p[0] - a[0]), den = ex * d[1] - ey * d[0];
    if (Math.abs(den) < 1e-9) {
      if (num < 0) return null;
      continue;
    }
    const t = -num / den;
    if (den > 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
  }
  if (t1 - t0 < 1) return null;
  return [[p[0] + d[0] * t0, p[1] + d[1] * t0], [p[0] + d[0] * t1, p[1] + d[1] * t1]];
}

/** Leaded glass: diamond quarries in thin lead cames, on the outside of the pane. */
export function lattice(o: Opening, spacing = 9): Mesh3 {
  const poly = openingPoly(o), parts: Mesh3[] = [];
  const cx = (o.x0 + o.x1) / 2, cy = (o.y0 + o.y1) / 2;
  for (const d of [[1, 1.35], [-1, 1.35]] as V2[]) {
    const n = Math.hypot(d[0], d[1]), u: V2 = [d[0] / n, d[1] / n], perp: V2 = [-u[1], u[0]];
    for (let k = -12; k <= 12; k++) {
      const p: V2 = [cx + perp[0] * k * spacing, cy + perp[1] * k * spacing];
      const seg = clip(p, u, poly);
      if (seg) parts.push(bar(seg[0], seg[1], 1.1, -1.4, -0.2));
    }
  }
  return join(...parts);
}

/** A sash: a slim frame round the opening and glazing bars dividing it into `cols` × `rows` lights. */
export function sash(o: Opening, cols: number, rows: number): Mesh3 {
  const t = 2.4, parts = [prism(ring(openingPoly(o, 0.5), 0.4), [ring(cw(openingPoly({ ...o, x0: o.x0 + t, y0: o.y0 + t, x1: o.x1 - t, y1: o.y1 - t })), 0.4)], 2.6, 0.4, 'z', [0, 0, -0.1])[0]];
  const top = o.round ? o.y1 - (o.x1 - o.x0) / 2 : o.y1;
  for (let i = 1; i < cols; i++) {
    const x = o.x0 + ((o.x1 - o.x0) * i) / cols;
    parts.push(box(x - 0.7, o.y0 + t, -1.2, x + 0.7, (o.round ? o.y1 : top) - t, 1.0, 0.3));
  }
  for (let j = 1; j < rows; j++) {
    const y = o.y0 + ((top - o.y0) * j) / rows;
    parts.push(box(o.x0 + t, y - 0.7, -1.2, o.x1 - t, y + 0.7, 1.0, 0.3));
  }
  return join(...parts);
}

/**
 * A shutter, swung open flat against the wall beside its window: one stud wide and `hL` tall, three
 * boards held by two battens, lying just outside the stud it stands in front of.
 */
export function shutter(hL: number): Mesh3 {
  const z0 = half(1) + 0.3, parts: Mesh3[] = [];
  const w = 19, bw = w / 3;
  for (let i = 0; i < 3; i++) parts.push(box(-w / 2 + i * bw + 0.15, 2, z0, -w / 2 + (i + 1) * bw - 0.15, hL - 2, z0 + 2.2, 0.55));
  for (const y of [hL * 0.22, hL * 0.78]) parts.push(box(-w / 2 + 1.5, y - 2, z0 + 2.2, w / 2 - 1.5, y + 2, z0 + 3.2, 0.45));
  return join(...parts);
}

// ─── The door ───────────────────────────────────────────────────────────────

/** The 1 × 4 × 6 door frame: posts, a head and a threshold flush with a tiled floor. */
export const DOOR_OPENING: Opening = { x0: -33.75, y0: 8, x1: 33.75, y1: 136, round: false };

export function doorFrame(): Mesh3 {
  return prism(ring(rect(-half(4), 0, half(4), 144), EDGE), [ring(cw(openingPoly(DOOR_OPENING)), EDGE * 0.7)], half(1) * 2, EDGE)[0];
}

/** The hinge: on the left post, at the back of the door's battens; an open door swings in about it (to −z). */
const HINGE: [number, number] = [-33.5, -4.4];

/**
 * The door: five upright boards with two battens behind, two black strap hinges across the front and
 * a gold knob each side at the hero's hand height. Returns [boards, iron, knobs], shut or swung in.
 */
export function door(open: boolean): [Mesh3, Mesh3, Mesh3] {
  const x0 = -33.5, x1 = 33.5, y0 = 8.25, y1 = 135.75, bw = (x1 - x0) / 5;
  const boards: Mesh3[] = [], iron: Mesh3[] = [], knobs: Mesh3[] = [];
  for (let i = 0; i < 5; i++) boards.push(box(x0 + i * bw + 0.12, y0, -2, x0 + (i + 1) * bw - 0.12, y1, 2, 0.5));
  for (const y of [32, 112]) {
    boards.push(box(x0 + 6, y - 3.5, -4.4, x1 - 6, y + 3.5, -2, 0.6));
    iron.push(box(x0 + 1, y - 1.6, 2, x0 + 46, y + 1.6, 2.8, 0.3), box(x0 + 44, y - 2.6, 2, x0 + 48, y + 2.6, 2.8, 0.3));
  }
  // Knobs a metre over the threshold, at the hero's hand (his fists hang about 0.9 m up): a round
  // rose on the board and a stud-like knob on it, each side.
  const ky = 8 + 1.0 / 0.0225;
  const along = (s: number) => new THREE.Matrix4().makeRotationX((s * Math.PI) / 2);
  for (const s of [1, -1]) {
    const face = s * 2;
    knobs.push(cylinder(3, 0.7, 0.25, 16).moved(along(s).setPosition(26.5, ky, face)), cylinder(2, 3.2, 0.7, 16).moved(along(s).setPosition(26.5, ky, face + s * 0.6)));
  }
  const parts: [Mesh3, Mesh3, Mesh3] = [join(...boards), join(...iron), join(...knobs)];
  if (!open) return parts;
  const m = new THREE.Matrix4().makeTranslation(HINGE[0], 0, HINGE[1])
    .multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2))
    .multiply(new THREE.Matrix4().makeTranslation(-HINGE[0], 0, -HINGE[1]));
  return parts.map((p) => p.moved(m)) as [Mesh3, Mesh3, Mesh3];
}

/**
 * What the door needs (LDU, element-local): the frame's opening when shut, and the whole square it
 * sweeps swinging in (nothing may stand there, so it always opens clear).
 */
export const DOOR_BOXES: [number, number, number, number, number, number][] = [
  [-33.5, 8.25, -9.5, 33.5, 135.75, 9.5],
  // (Swung in, its inner knob stands a little past the hinge's line.)
  [-36, 8.25, -4.4 - 71, 33.5, 135.75, -9.75],
];
