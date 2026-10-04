import { mulberry32 } from '../../core/rng';
import { FLOOR_CAP } from './grid';
import { smoothNoise } from './noise';

/**
 * The bedding planes outdoor relief is cut on: a stack of planes at irregular spacing (mostly tall
 * beds, now and then a thin one), dipping slowly across the land and thickening and thinning from
 * place to place, so no two cliffs step the same way and the ledges along one face wander up and down
 * like real strata. `q` maps a height at a point into the stack ("stratum space"), `index` names the
 * bed a stratum value falls in, `plane` is the height of bed k's floor at a point, and `bandY` is
 * the height of bed k's ledge where the ground is `f` and the raw rock `r` (beds at the ground hug it,
 * at most FLOOR_CAP above, so the rock meets the floor mesh exactly).
 */
export function bedding(seed: number) {
  const n = smoothNoise(seed + 401);
  const rng = mulberry32(seed * 31 + 402);
  const L: number[] = [];
  // Mostly tall beds (two to six high), now and then a thin one, so a face reads as a few big masses
  // rather than a stack of equal slabs.
  for (let y = -12; y < 90; y += rng() < 0.15 ? 0.9 + rng() * 0.5 : 2.4 + rng() * 3.4) L.push(y);
  // The beds dip and roll across the land (up to about 20 degrees), so ledges run slantwise across a
  // face and climb or drop along it, never level the full width.
  // A second, shorter swell (a few metres over a dozen cells) ends each ledge after a short run and
  // sets the next one higher or lower, so no line runs the full width of a face.
  const tilt = (x: number, z: number) => (n(x * 0.035, z * 0.035) - 0.5) * 9 + (n(x * 0.085 + 31, z * 0.085) - 0.5) * 4.6 + (n(x * 0.2 + 17, z * 0.2 + 5) - 0.5) * 0.9;
  const dens = (x: number, z: number) => 0.8 + 0.45 * n(x * 0.045 + 57, z * 0.045 + 13);
  const q = (y: number, x: number, z: number) => (y + tilt(x, z)) * dens(x, z);
  const index = (s: number) => {
    let lo = 0, hi = L.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (L[mid] <= s) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };
  const plane = (k: number, x: number, z: number) => L[k] / dens(x, z) - tilt(x, z);
  const groundIndex = (x: number, z: number, f: number) => index(q(f + FLOOR_CAP, x, z));
  const bandY = (k: number, x: number, z: number, f: number, r: number) => (k <= groundIndex(x, z, f) ? f + Math.min(r - f, FLOOR_CAP) : plane(k, x, z));
  return { L, q, index, plane, groundIndex, bandY };
}

export type Bedding = ReturnType<typeof bedding>;
