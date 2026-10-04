import type { KitBuild } from './build';
import { bargeEl, beamEl, chimneyCapEl, chimneyPotEl, panelEl, rakedEl, ridgeEl, stoneEl, tilesEl, windowEl } from './elements';
import { C, H, HOUSE, STACK } from './bakery';
import { ROOF_RISE } from './shapes/roof';
import { STEP_U, type Rot } from './scale';

/**
 * The bakery's roof: clay tiles in courses from eaves a cell out over the front and back walls up to
 * a ridge of capping tiles, each course a cell of run rising two steps (about 39°), its tiles bonded
 * half a tile on the course below; a cell of verge out over each gable, with a bargeboard under it.
 * The gables are framed like the walls under them: a collar across, posts and plaster panels raked
 * to the roof, a king post under the ridge and a small window. The chimney stack stands outside the
 * east gable, from the ground to above the ridge, and the courses beside it stop at it.
 */

/** Courses each side: from the eaves cell to the ridge. */
export const COURSES = (HOUSE.z1 - HOUSE.z0 + 2) / 2;
/** The roof's plane at the ridge (steps): the batten line, under the tiles. */
export const APEX = H.eaves + (COURSES - 1) * (ROOF_RISE / STEP_U);
/** The collar across each gable (its foot, steps). */
export const COLLAR = H.eaves + 8;
/** The chimney's top (steps), over its cap and under its pots. */
export const CHIMNEY_TOP = 69;

/** The roof's plane over cell edge z (steps): the batten line the courses' tiles hang from. */
export const plane = (z: number) => H.eaves + (ROOF_RISE / STEP_U) * Math.min(z - HOUSE.z0, HOUSE.z1 - z);

/** Is cell (x, z) taken by the chimney stack? */
export const inStack = (x: number, z: number) => x >= STACK.x && x < STACK.x + 2 && z >= STACK.z && z < STACK.z + 2;

export function roof(b: KitBuild) {
  chimney(b);
  const { x0, z0, x1, z1 } = HOUSE;
  for (let j = 0; j < COURSES; j++) {
    const y = H.eaves - ROOF_RISE / STEP_U + j * (ROOF_RISE / STEP_U), shift = j % 2 === 1;
    for (const [z, rot] of [[z1 - j, 0], [z0 - 1 + j, 2]] as [number, Rot][]) {
      // A course stops at the stack where it stands in the verge's way.
      const end = inStack(x1, z) ? x1 : x1 + 1;
      b.place(tilesEl(end - (x0 - 1), shift), x0 - 1, y, z, C.roof, { rot, part: 'roof' });
      // Bargeboards under the verges (their outer edge at the overhang's outer edge).
      b.place(bargeEl(rot === 0 ? -1 : 1), x0 - 1, y, z, C.timber, { rot, part: 'roof' });
      if (end > x1) b.place(bargeEl(rot === 0 ? 1 : -1), x1, y, z, C.timber, { rot, part: 'roof' });
    }
  }
  b.place(ridgeEl(x1 - x0 + 2), x0 - 1, APEX, (z0 + z1) / 2 - 1, C.ridge, { part: 'roof' });
  for (const x of [x0, x1 - 1]) gable(b, x, x === x0 ? 3 : 1);
}

/**
 * A gable over the end wall at x, its pieces turned `rot` (3 faces −x, 1 faces +x). Positions run along
 * z; a raked piece's top follows the roof over its own cells.
 */
function gable(b: KitBuild, x: number, rot: Rot) {
  const E = H.eaves, part = 'roof', U = (steps: number) => steps * STEP_U;
  const place = (e: ReturnType<typeof rakedEl>, z: number, y: number, color: number) => b.place(e, x, y, z, color, { rot, part });
  /** A raked piece over cells [a, c) standing on y: its tops at its two ends (and its peak) above y, turned for this gable. */
  const raked = (a: number, c: number, y: number, timberPiece: boolean, peak?: number) => {
    const ta = U(plane(a) - y), tc = U(plane(c) - y);
    // (Turned to face +x, a piece's own −x end is at the far z end of its cells.)
    const [t0, t1] = rot === 3 ? [ta, tc] : [tc, ta];
    return place(rakedEl(c - a, t0, t1, timberPiece, peak === undefined ? undefined : U(peak - y)), a, y, timberPiece ? C.timber : C.plaster);
  };
  const { z0, z1 } = HOUSE, mid = (z0 + z1) / 2;
  // Under the collar: a raked panel at each end, a raked post, the bays under the collar with a window in the middle.
  raked(z0, z0 + 4, E, false);
  raked(z0 + 4, z0 + 5, E, true);
  raked(z1 - 5, z1 - 4, E, true);
  raked(z1 - 4, z1, E, false);
  const bays = [[z0 + 5, mid - 1], [mid + 1, z1 - 5]];
  for (const [a, c] of bays) place(panelEl(c - a, COLLAR - E), a, E, C.plaster);
  place(panelEl(2, 2), mid - 1, E, C.plaster);
  place(windowEl(2, COLLAR - E - 2, 2, 2, C.bars), mid - 1, E + 2, C.frame);
  // The collar, and over it raked panels either side of the king post under the ridge.
  place(beamEl(z1 - z0 - 10), z0 + 5, COLLAR, C.timber);
  raked(z0 + 5, mid - 1, COLLAR + 2, false);
  raked(mid - 1, mid + 1, COLLAR + 2, true, APEX);
  raked(mid + 1, z1 - 5, COLLAR + 2, false);
}

/**
 * The chimney stack: two by two cells of stone from the ground, each course a pair of stones turned
 * across the one under it so its joints break; a cap standing out round its top, two clay pots.
 */
function chimney(b: KitBuild) {
  const { x, z } = STACK;
  for (let y = 0, k = 0; y < CHIMNEY_TOP; y += 3, k++) {
    const part = y < H.wallTop ? 'stackG' : y < H.eaves ? 'stackU' : 'stackR';
    if (k % 2 === 0) for (const zz of [z, z + 1]) b.place(stoneEl(2), x, y, zz, C.stone, { part });
    else for (const xx of [x, x + 1]) b.place(stoneEl(2), xx, y, z, C.stone, { rot: 1, part });
  }
  b.place(chimneyCapEl(2), x, CHIMNEY_TOP, z, C.stone, { part: 'stackR' });
  for (const [px, pz] of [[x, z], [x + 1, z + 1]]) b.place(chimneyPotEl(), px, CHIMNEY_TOP + 1, pz, C.roof, { part: 'stackR' });
}
