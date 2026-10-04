import { arc, box, cylinder, join, Mesh3, prism, ring, turned, type Turn, type V2 } from '../mesh';
import { half } from '../scale';

/**
 * The house's furniture, in kit units (each standing on y = 0, centred on its footprint, its front
 * toward +z): planked oak, turned legs, bread, sacks, cloth and fire.
 */

const E = 0.6;

/** A plank top `w` × `d` cells, `t` thick at height y, its boards running along x (each its own). */
export function planks(w: number, d: number, y: number, t: number, over = 0.8): Mesh3 {
  const W = half(w) + over, D = half(d) + over, n = Math.max(2, Math.round(d * 2)), bd = (2 * D) / n;
  const out: Mesh3[] = [];
  for (let i = 0; i < n; i++) out.push(box(-W, y, -D + i * bd + 0.12, W, y + t, -D + (i + 1) * bd - 0.12, 0.4).tag(i + 1));
  return join(...out);
}

/** A turned leg `hU` tall at (x, z). */
const leg = (x: number, z: number, hU: number, r = 1.9) => turned([
  { r: 0, y: 0 }, { r: r * 0.8, y: 0 }, { r: r, y: hU * 0.12, smooth: true }, { r: r * 0.7, y: hU * 0.3, smooth: true },
  { r: r * 0.85, y: hU * 0.55, smooth: true }, { r: r * 0.7, y: hU * 0.8, smooth: true }, { r: r, y: hU }, { r: 0, y: hU },
], 8, [x, 0, z]);

/**
 * The shop counter, `w` cells long and two deep, `hU` tall: a panelled front of upright boards
 * between posts, a thick plank top overhanging toward the customers.
 */
export function counter(w: number, hU: number): Mesh3 {
  const W = half(w), D = half(2), t = 3, parts: Mesh3[] = [];
  // The carcass: posts at the ends, boards between them on all four sides.
  for (const x of [-W, W - 3.4]) for (const z of [-D, D - 3.4]) parts.push(box(x, 0, z, x + 3.4, hU - t, z + 3.4, E));
  const bays = Math.round(w * 2), bw = (2 * W - 6.8) / bays;
  for (let i = 0; i < bays; i++) {
    const x0 = -W + 3.4 + i * bw + 0.1;
    parts.push(box(x0, 1, D - 2.4, x0 + bw - 0.2, hU - t, D - 0.6, 0.4), box(x0, 1, -D + 0.6, x0 + bw - 0.2, hU - t, -D + 2.4, 0.4));
  }
  for (const s of [-1, 1]) parts.push(box(s < 0 ? -W + 0.6 : W - 2.4, 1, -D + 3.4, s < 0 ? -W + 2.4 : W - 0.6, hU - t, D - 3.4, 0.4));
  // The plinth rail along the front, and the top.
  parts.push(box(-W + 3.4, 0, D - 2.9, W - 3.4, 4, D - 0.3, 0.5));
  return join(...parts.map((p, i) => p.tag(i + 1)), planks(w, 2, hU - t, t, 1.2).tag(40));
}

/** A table `w` × `d` cells, `hU` tall: four turned legs, rails, a plank top. */
export function table(w: number, d: number, hU: number): Mesh3 {
  const W = half(w) - 2.5, D = half(d) - 2.5, t = 2.6, parts: Mesh3[] = [];
  for (const x of [-W, W]) for (const z of [-D, D]) parts.push(leg(x, z, hU - t));
  for (const z of [-D, D]) parts.push(box(-W, hU - t - 4, z - 1, W, hU - t, z + 1, 0.4));
  for (const x of [-W, W]) parts.push(box(x - 1, hU - t - 4, -D, x + 1, hU - t, D, 0.4));
  return join(...parts.map((p, i) => p.tag(i + 1)), planks(w, d, hU - t, t, 0).tag(20));
}

/** A three-legged stool, `hU` tall. */
export function stool(hU: number): Mesh3 {
  const parts: Mesh3[] = [cylinder(8.2, 2.4, 0.8, 16, [0, hU - 2.4, 0]).tag(1)];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    parts.push(leg(Math.cos(a) * 5, Math.sin(a) * 5, hU - 2.4, 1.4).tag(2 + i));
  }
  return join(...parts);
}

/** A bench `w` cells long: a thick plank seat on two slab ends. */
export function bench(w: number, hU: number): Mesh3 {
  const W = half(w) - 1, parts = [box(-W, hU - 2.6, -6, W, hU, 6, 0.6).tag(1)];
  for (const x of [-W + 3, W - 5.4]) parts.push(box(x, 0, -5, x + 2.4, hU - 2.6, 5, 0.5).tag(2));
  return join(...parts);
}

/** A barrel: bulging staves (wood) and iron hoops. Returns [staves, hoops]. */
export function barrel(r: number, hU: number): [Mesh3, Mesh3] {
  const prof: Turn[] = [{ r: 0, y: 0 }, { r: r * 0.82, y: 0 }, { r: r * 0.86, y: 0.8 }, { r: r, y: hU / 2, smooth: true }, { r: r * 0.86, y: hU - 0.8 }, { r: r * 0.82, y: hU }, { r: r * 0.7, y: hU }, { r: r * 0.7, y: hU - 1 }, { r: 0, y: hU - 1 }];
  const hoops = [0.12, 0.3, 0.7, 0.88].map((f) => {
    const y = hU * f, rr = r * (0.86 + 0.14 * Math.sin(Math.PI * f)) + 0.35;
    return turned([{ r: rr - 0.6, y: y - 1 }, { r: rr, y: y - 1 }, { r: rr, y: y + 1 }, { r: rr - 0.6, y: y + 1 }], 20);
  });
  return [turned(prof, 20), join(...hoops)];
}

/** A round loaf of bread `r` U across: a domed cob with a scored top. */
export const cob = (r: number) => turned([
  { r: 0, y: 0 }, { r: r * 0.92, y: 0 }, { r: r, y: r * 0.3, smooth: true }, { r: r * 0.85, y: r * 0.62, smooth: true }, { r: r * 0.45, y: r * 0.82, smooth: true }, { r: 0, y: r * 0.88 },
], 10);

/** A long loaf, `l` U long along x. */
export function longLoaf(l: number, r: number): Mesh3 {
  const pts: V2[] = arc(0, 0, r, r * 0.85, 0, Math.PI, 10);
  return prism(ring(pts, 0.6, undefined, 0.9), [], l, 1.6, 'x')[0];
}

/** A sack of flour: a lumpy bag tied at its neck. */
export const sack = (r: number, hU: number) => turned([
  { r: 0, y: 0 }, { r: r * 0.85, y: 0 }, { r: r, y: hU * 0.2, smooth: true }, { r: r * 0.95, y: hU * 0.55, smooth: true }, { r: r * 0.6, y: hU * 0.82, smooth: true },
  { r: r * 0.28, y: hU * 0.9 }, { r: r * 0.36, y: hU * 0.97, smooth: true }, { r: 0, y: hU },
], 12, [0, 0, 0], [1, 0.82]);

/** A candle in a dish: [wax, dish]. */
export const candle = (): [Mesh3, Mesh3] => [cylinder(1.6, 6, 0.4, 10, [0, 0.8, 0]), cylinder(3.4, 0.8, 0.3, 14)];

/**
 * A flame: a tongue of fire `hU` tall and `r` thick at its widest, `flat` as deep as it is wide, its
 * tip licking `lean` U aside (toward +x turned `yaw` radians about the vertical) in a curve.
 */
export function flame(r: number, hU: number, lean = 0, yaw = 0, flat = 1): Mesh3 {
  const m = turned([
    { r: 0, y: 0 }, { r: r * 0.85, y: hU * 0.08, smooth: true }, { r: r, y: hU * 0.22, smooth: true }, { r: r * 0.92, y: hU * 0.36, smooth: true },
    { r: r * 0.66, y: hU * 0.55, smooth: true }, { r: r * 0.36, y: hU * 0.74, smooth: true }, { r: r * 0.12, y: hU * 0.9, smooth: true }, { r: 0, y: hU },
  ], 12, [0, 0, 0], [1, flat]);
  const cx = Math.cos(yaw), cz = Math.sin(yaw);
  for (let i = 0; i < m.pos.length; i += 3) {
    const t = m.pos[i + 1] / hU, off = lean * t * t;
    m.pos[i] += off * cx;
    m.pos[i + 2] += off * cz;
  }
  return m;
}

/** A bed `w` × `d` cells: a panelled oak frame with head and foot boards. Returns [frame, mattress and pillows, blanket]. */
export function bed(w: number, d: number): [Mesh3, Mesh3, Mesh3] {
  const W = half(w), D = half(d), parts: Mesh3[] = [];
  // Four turned posts, a panelled head and a low foot board between them, side rails carrying the mattress.
  for (const [x, z, hU] of [[-W + 2.2, -D + 2.2, 34], [-W + 2.2, D - 2.2, 34], [W - 2.2, -D + 2.2, 22], [W - 2.2, D - 2.2, 22]]) parts.push(leg(x, z, hU, 2.2));
  parts.push(box(-W + 0.8, 10, -D + 4.4, -W + 3.6, 29, D - 4.4, E), box(W - 3.6, 10, -D + 4.4, W - 0.8, 18, D - 4.4, E));
  for (const z of [-D + 0.8, D - 3.6]) parts.push(box(-W + 4.4, 5, z, W - 4.4, 11, z + 2.8, E));
  // A deep, soft mattress, two plump pillows at the head.
  const soft = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, r: number) => box(x0, y0, z0, x1, y1, z1, r);
  const mattress = join(soft(-W + 3.6, 9, -D + 3.6, W - 3.6, 17, D - 3.6, 3), ...[-1, 1].map((s, i) => soft(-W + 4.4, 16.4, s < 0 ? -D + 4.6 : 0.8, -W + 16, 21.6, s < 0 ? -0.8 : D - 4.6, 2.4).tag(2 + i)));
  // The blanket: over the mattress from below the pillows to the foot board, falling over the sides.
  const B = D - 2.6, top = 17.8, drop = 6, x0 = -W + 15, x1 = W - 4;
  const prof: V2[] = [[-B, top - drop], [-B + 1.2, top - drop], [-B + 1.2, top - 1.4], [B - 1.2, top - 1.4], [B - 1.2, top - drop], [B, top - drop], [B, top - 0.6], [B - 2, top], [-B + 2, top], [-B, top - 0.6]];
  const blanket = prism(ring(prof, 0.5, undefined, 0.5), [], x1 - x0, 0.5, 'x', [(x0 + x1) / 2, 0, 0])[0];
  return [join(...parts.map((p, i) => p.tag(i + 1))), mattress, blanket];
}

/** A chest `w` cells long: a planked box with a domed lid. Returns [wood, iron bands]. */
export function chest(w: number, hU: number): [Mesh3, Mesh3] {
  const W = half(w) - 1, D = 8, lid = 4;
  const body = box(-W, 0, -D, W, hU - lid, D, E);
  const top = prism(ring([[-D, 0], [D, 0], [D * 0.8, lid * 0.7], [0, lid], [-D * 0.8, lid * 0.7]], 0.5, undefined, 0.6), [], 2 * W, 0.6, 'x', [0, hU - lid, 0])[0];
  const bands = [-W + 4, W - 4].map((x) => box(x - 1, 0.5, -D - 0.3, x + 1, hU - 0.2, D + 0.3, 0.2));
  return [join(body.tag(1), top.tag(2)), join(...bands)];
}

/** A wardrobe `w` cells wide, `hU` tall: a tall cupboard with two panelled doors. */
export function wardrobe(w: number, hU: number): Mesh3 {
  const W = half(w), D = 9, parts = [box(-W, 0, -D, W, hU, D - 1, E), box(-W - 0.6, hU - 3, -D, W + 0.6, hU, D + 0.2, E), box(-W - 0.4, 0, -D, W + 0.4, 3, D + 0.2, E)];
  for (const s of [-1, 1]) {
    const x0 = s < 0 ? -W + 1.2 : 0.4, x1 = s < 0 ? -0.4 : W - 1.2;
    parts.push(box(x0, 4, D - 1, x1, hU - 4, D, 0.4), box(x0 + 2.4, 8, D - 0.2, x1 - 2.4, hU - 8, D + 0.6, 0.4));
  }
  return join(...parts.map((p, i) => p.tag(i + 1)));
}

/** A rug `w` × `d` cells, a hair thick, with a border band. Returns [field, border]. */
export function rug(w: number, d: number): [Mesh3, Mesh3] {
  const W = half(w), D = half(d), b = 3;
  return [box(-W + b, 0, -D + b, W - b, 0.8, D - b, 0.2), join(box(-W, 0, -D, W, 0.7, -D + b, 0.2), box(-W, 0, D - b, W, 0.7, D, 0.2), box(-W, 0, -D + b, -W + b, 0.7, D - b, 0.2), box(W - b, 0, -D + b, W, 0.7, D - b, 0.2))];
}

/** Shelves `w` cells long against a wall (their back at −z), `hU` tall, `n` boards. */
export function shelves(w: number, hU: number, n: number): Mesh3 {
  const W = half(w), D = half(1), parts = [box(-W, 0, -D, -W + 2.4, hU, D, E), box(W - 2.4, 0, -D, W, hU, D, E)];
  for (let i = 0; i < n; i++) {
    const y = 4 + ((hU - 6) * i) / (n - 1);
    parts.push(box(-W + 2.4, y, -D, W - 2.4, y + 2, D, 0.4));
  }
  return join(...parts.map((p, i) => p.tag(i + 1)));
}
