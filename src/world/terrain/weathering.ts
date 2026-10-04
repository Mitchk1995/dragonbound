import type { Bedding } from './bedding';
import { FLOOR_CAP, GULLY, sstep, WEATHER, type Grid } from './grid';
import type { Heights } from './heightfield';
import { smoothNoise } from './noise';
import type { Tally } from './paint';

/**
 * Weathering outdoor rock: the fields that say which way "into the rock" is and how far a face may
 * be cut back, the `warp` that moves outdoor relief by them, and the flat `ledge`s left on its beds.
 */
export function weathering(g: Grid, t: Tally, hs: Heights, beds: Bedding, seed: number) {
  const { theme, w, h, nV, vi, distField, gridAt } = g;
  const { count, raisedN, fullRelief } = t;
  const { base, hgt, raw } = hs;
  // The raw rock height everywhere (absolute), and its uphill direction, smoothed over a few cells
  // so it turns gently round spurs and bays (it says which way "into the rock" is).
  const rockH = new Float32Array(nV), upX = new Float32Array(nV), upZ = new Float32Array(nV);
  for (let k = 0; k < nV; k++) rockH[k] = base[k] + (fullRelief(k) ? raw[k] : hgt[k]);
  if (!theme.wallRise) {
    for (let z = 0; z <= h; z++) for (let x = 0; x <= w; x++) {
      const xa = Math.max(0, x - 1), xb = Math.min(w, x + 1), za = Math.max(0, z - 1), zb = Math.min(h, z + 1);
      upX[vi(x, z)] = (rockH[vi(xb, z)] - rockH[vi(xa, z)]) / (xb - xa);
      upZ[vi(x, z)] = (rockH[vi(x, zb)] - rockH[vi(x, za)]) / (zb - za);
    }
    for (let pass = 0; pass < 3; pass++) for (const gr of [upX, upZ]) {
      const src = gr.slice();
      for (let z = 1; z < h; z++) for (let x = 1; x < w; x++) {
        let s = 0;
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) s += src[vi(x + dx, z + dz)];
        gr[vi(x, z)] = s / 9;
      }
    }
  }
  // The highest walkable ground within two cells of each vertex (where a cliff's lip meets a road
  // or a terrace above it).
  const floorNear = new Float32Array(nV).fill(-1e6);
  for (let z = 0; z <= h; z++) for (let x = 0; x <= w; x++) {
    let m = -1e6;
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      const xx = x + dx, zz = z + dz;
      if (xx < 0 || zz < 0 || xx > w || zz > h) continue;
      const kk = vi(xx, zz);
      if (count[kk] > raisedN[kk]) m = Math.max(m, base[kk]);
    }
    floorNear[vi(x, z)] = m;
  }
  // The highest rock within three cells of each vertex (a ledge well below it is partway down a face).
  const topNear = new Float32Array(nV);
  for (let z = 0; z <= h; z++) for (let x = 0; x <= w; x++) {
    let m = -1e6;
    for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
      const xx = x + dx, zz = z + dz;
      if (xx >= 0 && zz >= 0 && xx <= w && zz <= h) m = Math.max(m, rockH[vi(xx, zz)]);
    }
    topNear[vi(x, z)] = m;
  }
  // Rock along the land's edge stays put: its open side meets the island's underside there.
  const edgeKeep = new Float32Array(nV).fill(1);
  if (!theme.wallRise) {
    const voidD = distField((k) => count[k] < 4);
    for (let k = 0; k < nV; k++) edgeKeep[k] = sstep(0.5, 2.5, voidD[k]);
  }
  const sculpt = smoothNoise(seed + 501);
  /**
   * Where a point of outdoor rock moves to (x, z) once weathered: pushed back into the rock along
   * its uphill direction by up to WEATHER, less where the cliff stands out as a buttress, more in the
   * bays between, and varying with height (so a bed leans out over the one below, or is cut back
   * under the one above). Nothing moves within FLOOR_CAP of the ground, so the foot stays on its cell
   * edge and the floor mesh still meets it exactly. A smooth field: shared edges stay shut.
   */
  const warp = (x: number, y: number, z: number): [number, number] => {
    if (theme.wallRise) return [x, z];
    // The rock's own top stays put where it meets the ground above it (a road, a terrace, the crown),
    // so the lip runs on flush under whatever stands there and the face falls back below it.
    const top = gridAt(floorNear, x, z), lip = 1 - sstep(top - 2.6, top - 0.6, y);
    const ramp = sstep(FLOOR_CAP + 0.1, 2.4, y - gridAt(base, x, z)) * gridAt(edgeKeep, x, z) * lip;
    if (ramp <= 0) return [x, z];
    const gx = gridAt(upX, x, z), gz = gridAt(upZ, x, z), gl = Math.hypot(gx, gz);
    const wgt = sstep(0.2, 1.0, gl);
    if (wgt <= 0) return [x, z];
    const mass = sstep(0.4, 0.6, sculpt(x * 0.19 + 5, z * 0.19 + 9));
    const bed = sculpt(x * 0.3 + y * 0.45 + 3, z * 0.3 - y * 0.3 + 11);
    // Gullies: narrow, deep clefts cut back into the face from top to foot along the crests of a
    // ridged noise, so the beds are broken into separate buttresses (the same at every height).
    const gn = sculpt(x * 0.075 + 41, z * 0.075 + 23), gully = sstep(0.6, 0.93, 1 - Math.abs(gn * 2 - 1));
    // (Lush, mossy rock is only lightly cut back: the rock masses standing out of it shape the face,
    // and its lip never hangs out as a dark overhang over a face cut deep beneath it.)
    const cut = theme.rockMoss ? 0.35 : 1;
    const d = (cut * ramp * wgt * (WEATHER * (0.62 * (1 - mass) + 0.38 * bed) + GULLY * gully)) / gl;
    return [x + gx * d, z + gz * d];
  };
  /**
   * The height of the outdoor rock's ledge at (x, z) when the point and the ground round it (out to
   * `r`) lie on one bed above the local ground (a flat place for a plant to root), else null.
   */
  const ledge = (x: number, z: number, r = 0.6): number | null => {
    if (theme.wallRise) return null;
    let k = -1;
    for (const [dx, dz] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) {
      const px = x + dx, pz = z + dz;
      if (px < 0 || pz < 0 || px > w || pz > h) return null;
      const f = gridAt(base, px, pz), kk = beds.index(beds.q(gridAt(rockH, px, pz), px, pz));
      if (kk <= beds.groundIndex(px, pz, f) || (k >= 0 && kk !== k)) return null;
      k = kk;
    }
    return beds.plane(k, x, z);
  };
  return { warp, ledge, topNear };
}

export type Weathering = ReturnType<typeof weathering>;
