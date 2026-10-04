import * as THREE from 'three';
import { box, cylinder, join, Mesh3, prism, ring, turned, type V2 } from '../mesh';
import { half } from '../scale';

/**
 * The street's details, in kit units (each standing on y = 0, centred on its footprint, its front
 * toward +z): the lamp post and its lantern, the baker's hanging sign and its bracket, window boxes and
 * pots (their plants are painted cards: plants.ts).
 */

/** The lamp post: a forged post on a moulded foot, a collar and a cap the lantern stands on. */
export function lampPost(hU: number): Mesh3 {
  return turned([
    { r: 0, y: 0 }, { r: 9, y: 0 }, { r: 9, y: 2.6, round: true }, { r: 7.6, y: 4 }, { r: 5.6, y: 8, smooth: true },
    { r: 3.6, y: 14, smooth: true }, { r: 2.6, y: 20 }, { r: 3.6, y: 21 }, { r: 3.6, y: 24 }, { r: 2.1, y: 25 },
    { r: 2.1, y: hU - 9 }, { r: 3.4, y: hU - 8 }, { r: 3.4, y: hU - 5 }, { r: 6.2, y: hU - 3, smooth: true }, { r: 6.8, y: hU - 0.6, round: true }, { r: 6.2, y: hU }, { r: 0, y: hU },
  ], 16);
}

/** The lantern on the post: a base, four slim corner bars round a glass that glows at dusk, a pointed cap. Returns [iron, glass]. */
export function lantern(): [Mesh3, Mesh3] {
  const iron = [cylinder(7.2, 2.4, 0.6, 16), cylinder(8, 2.2, 0.6, 16, [0, 19, 0]), turned([
    { r: 8, y: 0 }, { r: 2, y: 8, smooth: true }, { r: 1.4, y: 9 }, { r: 2, y: 10.2, smooth: true }, { r: 0, y: 11.6 },
  ], 16, [0, 21.2, 0])];
  for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) iron.push(box(x * 5.6 - 0.8, 2.4, z * 5.6 - 0.8, x * 5.6 + 0.8, 19, z * 5.6 + 0.8, 0.3));
  return [join(...iron), cylinder(5.2, 16.6, 0, 16, [0, 2.4, 0], false)];
}

/** A round iron bar from a to b (U), radius r. */
function rod(a: THREE.Vector3, b: THREE.Vector3, r: number): Mesh3 {
  const d = b.clone().sub(a), l = d.length();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return cylinder(r, l, 0, 8, [0, 0, 0], false).moved(new THREE.Matrix4().compose(a, q, new THREE.Vector3(1, 1, 1)));
}

/** The sign's bracket: a wrought-iron arm set into the wall, two cells out over the street, a stay under it and a crossbar at its end. */
export function signBracket(): Mesh3 {
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const face = half(1) + 0.3, tip = 40;
  return join(
    box(-4, 4, face - 0.3, 4, 30, face + 1.6, 0.5),
    rod(v(0, 26, face), v(0, 26, tip + 3), 1.6),
    rod(v(0, 8, face + 1), v(0, 25, tip - 12), 1.2),
    rod(v(-31, 26, tip), v(31, 26, tip), 1.4),
    cylinder(2.4, 4.8, 1, 10, [0, 23.6, tip + 3]),
    ...[-24, 24].map((x) => rod(v(x, 19, tip), v(x, 26, tip), 0.8)),
  );
}

/** The sign: an oak board three cells wide with a raised border, a loaf of bread standing proud on its face. Returns [board, loaf]. */
export function signBoard(): [Mesh3, Mesh3] {
  const W = 29.5, y0 = 3, y1 = 43;
  const board = join(
    box(-W, y0, -2, W, y1, 2, 0.8).tag(1),
    box(-W + 2.5, y1 - 3.5, 2, W - 2.5, y1 - 1, 3, 0.4).tag(2), box(-W + 2.5, y0 + 1, 2, W - 2.5, y0 + 3.5, 3, 0.4).tag(2),
    box(-W + 1, y0 + 1, 2, -W + 3.5, y1 - 1, 3, 0.4).tag(3), box(W - 3.5, y0 + 1, 2, W - 1, y1 - 1, 3, 0.4).tag(3),
  );
  const pts: V2[] = [];
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2;
    pts.push([Math.cos(a) * 17, Math.sin(a) * (8.5 + 1.5 * Math.sin(a))]);
  }
  const loaf = prism(ring(pts, 1.6, undefined, 0.9), [], 4.4, 1.6, 'z', [0, (y0 + y1) / 2, 4.0])[0];
  // Three scores slashed across its crust.
  const scores = [-8, 0, 8].map((x) => box(x - 1.1, (y0 + y1) / 2 - 1, 5.9, x + 1.1, (y0 + y1) / 2 + 7, 6.7, 0.3).moved(
    new THREE.Matrix4().makeTranslation(x, (y0 + y1) / 2 + 3, 0).multiply(new THREE.Matrix4().makeRotationZ(-0.5)).multiply(new THREE.Matrix4().makeTranslation(-x, -(y0 + y1) / 2 - 3, 0)),
  ).darken(0.55));
  return [board, join(loaf, ...scores)];
}

// ─── Window boxes and pots ──────────────────────────────────────────────────

/**
 * A window box `w` cells long hung on the wall under a window (its back against the wall's face at
 * z = 0): a planked box on two brackets, full of earth. Returns [box, earth].
 */
export function windowBox(w: number): [Mesh3, Mesh3] {
  const W = half(w), D = 9, H = 7.5;
  const parts = [
    box(-W, 2.2, 0.4, W, 2.2 + 1.2, D, 0.3),
    box(-W, 2.2, D - 1.4, W, H, D, 0.5), box(-W, 2.2, 0.4, W, H - 0.6, 1.6, 0.4),
    box(-W, 2.2, 0.4, -W + 1.4, H, D, 0.4), box(W - 1.4, 2.2, 0.4, W, H, D, 0.4),
  ];
  for (const x of [-W + 6, W - 6]) parts.push(prism(ring([[0.3, 2.2], [0.3, -5], [3.2, 2.2]], 0.3), [], 2, 0.3, 'x', [x, 0, 0])[0]);
  return [join(...parts.map((p, i) => p.tag(i + 1))), box(-W + 1.4, H - 2.4, 1.6, W - 1.4, H - 1, D - 1.4, 0)];
}

/** A clay pot, `rU` across its rim and `hU` tall, a rolled rim and a foot. */
export function pot(rU: number, hU: number): Mesh3 {
  return turned([
    { r: 0, y: 0 }, { r: rU * 0.62, y: 0 }, { r: rU * 0.66, y: 1.2, round: true }, { r: rU * 0.7, y: 1.8 },
    { r: rU * 0.9, y: hU * 0.8, smooth: true }, { r: rU * 0.92, y: hU - 2.6 }, { r: rU, y: hU - 2 }, { r: rU, y: hU - 0.5, round: true },
    { r: rU * 0.88, y: hU }, { r: rU * 0.84, y: hU - 1.5 }, { r: 0, y: hU - 1.5 },
  ], 18);
}
