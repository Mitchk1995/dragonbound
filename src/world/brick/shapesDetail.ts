import * as THREE from 'three';
import { box, cylinder, join, Mesh3, prism, ring, turned, type Turn, type V2 } from './mesh';
import { half } from './shapes';
import { EDGE } from './scale';

/**
 * Fences, the lamp post and its lantern, plants, flames and the hanging sign, in LDU (each
 * standing on y = 0, centred on its footprint, front toward +z).
 */

/** A turned baluster from y0 to y1: a bulb low down, a slim neck and a collar under the rail. */
function baluster(x: number, y0: number, y1: number): Mesh3 {
  const h = y1 - y0, p: Turn[] = [
    { r: 2.4, y: 0 }, { r: 3.4, y: h * 0.18, smooth: true }, { r: 2.6, y: h * 0.32, smooth: true }, { r: 1.8, y: h * 0.5, smooth: true },
    { r: 2.2, y: h * 0.82, smooth: true }, { r: 3.0, y: h * 0.9 }, { r: 2.4, y: h },
  ];
  return turned(p, 10, [x, y0, 0]);
}

/** A spindled fence 1 × 4 × 2: a rail on the ground, a rail on top with four studs, seven turned spindles. */
export function fenceSpindled(): Mesh3 {
  const W = half(4), parts = [box(-W, 0, -5, W, 6, 5, EDGE), box(-W, 40, -6, W, 48, 6, EDGE)];
  for (let k = 0; k < 7; k++) parts.push(baluster(-30 + k * 10, 6, 40));
  return join(...parts);
}

/** A fence 1 × 4 × 1: two rails and seven square pickets. */
export function fenceLow(): Mesh3 {
  const W = half(4), parts = [box(-W, 0, -4, W, 4, 4, EDGE), box(-W, 18, -5, W, 24, 5, EDGE)];
  for (let k = 0; k < 7; k++) parts.push(box(-30 + k * 10 - 1.4, 4, -1.4, -30 + k * 10 + 1.4, 18, 1.4, 0.4));
  return join(...parts);
}

/** The lamp post 2 × 2 × 7: a moulded foot flaring into a slim shaft, a collar and a cap with one stud. */
export function lampPost(): Mesh3 {
  return turned([
    { r: 0, y: 0 }, { r: 18.4, y: 0 }, { r: 18.4, y: 2.6, round: true }, { r: 17.2, y: 3.8 }, { r: 14, y: 7, smooth: true },
    { r: 9.5, y: 13, smooth: true }, { r: 6.4, y: 20 }, { r: 7.4, y: 21 }, { r: 7.4, y: 25 }, { r: 3.6, y: 26 },
    { r: 3.6, y: 157 }, { r: 6.2, y: 158.5 }, { r: 6.2, y: 162 }, { r: 7.8, y: 163 }, { r: 7.8, y: 167.2, round: true }, { r: 7, y: 168 }, { r: 0, y: 168 },
  ], 24);
}

/**
 * The lantern on top of the post: a round base plate, four slim corner bars round a glass that glows
 * at dusk, a cap and a pointed roof with a ball. Returns [frame, glass].
 */
export function lantern(): [Mesh3, Mesh3] {
  const frame = [cylinder(15, 4, 0.9, 28), cylinder(15.5, 3, 0.9, 28, [0, 30, 0]), turned([
    { r: 15.5, y: 0 }, { r: 3.2, y: 11, smooth: true }, { r: 2.4, y: 12 }, { r: 3.2, y: 13.5, smooth: true }, { r: 2.6, y: 16, smooth: true }, { r: 0, y: 17 },
  ], 28, [0, 33, 0])];
  for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) frame.push(box(x * 9.2 - 1.3, 4, z * 9.2 - 1.3, x * 9.2 + 1.3, 30, z * 9.2 + 1.3, 0.4));
  return [join(...frame), cylinder(11.5, 26, 0, 28, [0, 4, 0], false)];
}

// ─── Plants ─────────────────────────────────────────────────────────────────

/** Where the 4 × 3 leaves' hub sits (element-local LDU): on the stud a stud right of the middle, as on the real part. */
export const LEAVES_HUB: V2 = [10, 0];

/**
 * The 4 × 3 leaves: six serrated leaves radiating from a hub that fits on one stud, their tips bowed
 * down a little; they spread over four studs by three, a plate and a half high.
 */
export function leaves(): Mesh3 {
  const pts: V2[] = [], N = 120, [hx, hz] = LEAVES_HUB, X = 37, Z = 27;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    // Each leaf reaches as far as the footprint allows in its direction from the hub.
    const tx = Math.abs(c) < 1e-3 ? Infinity : ((c > 0 ? X : -X) - hx) / c;
    const tz = Math.abs(s) < 1e-3 ? Infinity : ((s > 0 ? Z : -Z) - hz) / s;
    const lobe = Math.pow(Math.abs(Math.cos(3 * a)), 0.7);
    const saw = 1 - (0.07 * ((i * 5) % 4)) / 3;
    const r = (6 + (Math.min(tx, tz, 46) - 6) * lobe) * saw;
    // (The flat profile's second axis is −z.)
    pts.push([hx + c * r, -(hz + s * r)]);
  }
  const blade = prism(ring(pts, 0.5, undefined, 0.9), [], 2.2, 0.5, 'y', [0, 7, 0])[0];
  // (Bowed: each point drops with the square of its reach from the hub.)
  for (let i = 0; i < blade.pos.length; i += 3) {
    const r2 = ((blade.pos[i] - hx) ** 2 + (blade.pos[i + 2] - hz) ** 2) / (46 * 46);
    blade.pos[i + 1] -= 5 * r2;
  }
  return join(blade, cylinder(4.2, 7, 0.5, 12, [hx, 0, hz]));
}

/** A round 1 × 1 plate with a flower edge: five round petals, a stud in the middle. */
export function flowerPlate(): Mesh3 {
  const pts: V2[] = [];
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2;
    const r = 6.2 + 3.55 * Math.pow(Math.abs(Math.cos((5 * a) / 2)), 0.7);
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return prism(ring(pts, 0.6, undefined, 0.9), [], 8, 0.6, 'y', [0, 4, 0])[0];
}

/** A flame: a turned tongue of fire, a plate wide and a brick tall. */
export function flame(): Mesh3 {
  return turned([
    { r: 0, y: 0 }, { r: 4.2, y: 3, smooth: true }, { r: 6, y: 8, smooth: true }, { r: 5, y: 13, smooth: true },
    { r: 2.6, y: 18.5, smooth: true }, { r: 0.6, y: 23, smooth: true }, { r: 0, y: 24 },
  ], 12);
}

// ─── The hanging sign ───────────────────────────────────────────────────────

/** A round iron bar from a to b (LDU), radius r. */
function rod(a: THREE.Vector3, b: THREE.Vector3, r: number): Mesh3 {
  const d = b.clone().sub(a), l = d.length();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return cylinder(r, l, 0, 8, [0, 0, 0], false).moved(new THREE.Matrix4().compose(a, q, new THREE.Vector3(1, 1, 1)));
}

/**
 * The sign bracket: a wrought-iron arm set into the wall, standing out two studs over the street with
 * a stay under it and a crossbar at its end that the sign hangs from.
 */
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

/**
 * The sign: a board three studs wide and two high, hung by its top edge from the bracket's two rings, with a raised border and a loaf
 * of bread standing proud on its face (a baker's sign). Returns [board, loaf, scores].
 */
export function signBoard(): [Mesh3, Mesh3, Mesh3] {
  const W = 29.5, y0 = 3, y1 = 43;
  const board = join(
    box(-W, y0, -2, W, y1, 2, 0.8),
    box(-W + 2.5, y1 - 3.5, 2, W - 2.5, y1 - 1, 3, 0.4), box(-W + 2.5, y0 + 1, 2, W - 2.5, y0 + 3.5, 3, 0.4),
    box(-W + 1, y0 + 1, 2, -W + 3.5, y1 - 1, 3, 0.4), box(W - 3.5, y0 + 1, 2, W - 1, y1 - 1, 3, 0.4),
  );
  const pts: V2[] = [];
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2;
    pts.push([Math.cos(a) * 17, Math.sin(a) * (8.5 + 1.5 * Math.sin(a))]);
  }
  // (Set a little into the board, so no gap shows round it from the side.)
  const loaf = prism(ring(pts, 1.6, undefined, 0.9), [], 4.4, 1.6, 'z', [0, (y0 + y1) / 2, 4.0])[0];
  const scores = join(...[-8, 0, 8].map((x) => box(x - 1.1, (y0 + y1) / 2 - 1, 5.9, x + 1.1, (y0 + y1) / 2 + 7, 6.7, 0.3).moved(
    new THREE.Matrix4().makeTranslation(x, (y0 + y1) / 2 + 3, 0).multiply(new THREE.Matrix4().makeRotationZ(-0.5)).multiply(new THREE.Matrix4().makeTranslation(-x, -(y0 + y1) / 2 - 3, 0)),
  )));
  return [board, loaf, scores];
}
