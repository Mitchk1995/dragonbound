import * as THREE from 'three';
import { clamp } from '../../core/rng';

/** The crown's envelope: an irregular dome the branches grow to fill. */
export interface Crown {
  centre: THREE.Vector3;
  /** Horizontal radius, and the vertical radii above and below the centre (m). */
  r: number;
  up: number;
  down: number;
  /** Bays and bulges: [amplitude, waves round, tilt with elevation, phase]. */
  lumps: [number, number, number, number][];
  /** How much it narrows above its middle (Species.taper). */
  taper: number;
}

/** The envelope's horizontal radius at a height (dy: up its upper radius, 1 at the top) as a share of its widest. */
export const narrow = (c: Crown, dy: number) => (c.taper ? 1 - c.taper * clamp(dy, 0, 1) : 1);

const scratch = new THREE.Vector3();

/** How far the envelope reaches toward a unit direction, as a multiple of its ellipsoid. */
export function reach(c: Crown, u: THREE.Vector3) {
  const az = Math.atan2(u.z, u.x), el = Math.asin(clamp(u.y, -1, 1));
  let k = 1;
  for (const [a, m, t, ph] of c.lumps) k += a * Math.sin(m * az + t * el + ph);
  return k;
}

/** Where a point sits in the crown: 0 at its centre, 1 on the envelope, more outside it. */
export function crownDepth(c: Crown, p: THREE.Vector3) {
  const dy = (p.y - c.centre.y) / (p.y > c.centre.y ? c.up : c.down), r = c.r * narrow(c, dy);
  const dx = (p.x - c.centre.x) / r, dz = (p.z - c.centre.z) / r;
  const d = Math.hypot(dx, dy, dz);
  return d < 1e-6 ? 0 : d / reach(c, scratch.set(dx, dy, dz).divideScalar(d));
}

/** The envelope's outward direction at a point (its ellipsoid's normal). */
export function crownNormal(c: Crown, p: THREE.Vector3, out = new THREE.Vector3()) {
  const ry = p.y > c.centre.y ? c.up : c.down, r = c.r * narrow(c, (p.y - c.centre.y) / ry);
  out.set((p.x - c.centre.x) / (r * r), (p.y - c.centre.y) / (ry * ry), (p.z - c.centre.z) / (r * r));
  return out.lengthSq() < 1e-12 ? out.set(0, 1, 0) : out.normalize();
}

/** Distance from p along the unit direction u to the envelope (0 when p is already outside it). */
export function toEnvelope(c: Crown, p: THREE.Vector3, u: THREE.Vector3) {
  const q = new THREE.Vector3();
  if (crownDepth(c, p) >= 1) return 0;
  let lo = 0, hi = 0.25;
  while (hi < 40 && crownDepth(c, q.copy(p).addScaledVector(u, hi)) < 1) {
    lo = hi;
    hi += 0.25;
  }
  for (let i = 0; i < 10; i++) {
    const mid = (lo + hi) / 2;
    if (crownDepth(c, q.copy(p).addScaledVector(u, mid)) < 1) lo = mid;
    else hi = mid;
  }
  return lo;
}
