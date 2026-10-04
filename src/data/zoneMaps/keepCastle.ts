import { Gen } from '../../world/gen';
import { Cell, Ground, Lawn } from '../../world/layout';
import { KERB_SET } from '../../world/kerbStones';
import * as castleBailey from '../../world/castle/bailey';
import { onCrown } from '../../world/castle/ground';
import { AXIS, CURTAIN_CORNERS, FOUNTAIN, GATE, KEEP, mx, WATER, ZONES } from '../../world/castle/plan';

// The castle-only parts of the keep's map (its plan for the dev tools, the ground kept clear round it, its
// kerbs), together so the castle's rebuild can replace them in one place.

/** The castle's plan for the dev tools: the curtain, the axis points (gate, fountain, great door) and the centre of each yard. */
export const CASTLE_PLAN = {
  curtain: CURTAIN_CORNERS,
  gate: { x: GATE.x, z: GATE.z },
  fountain: { x: FOUNTAIN.x, z: FOUNTAIN.z },
  door: { x: KEEP.door.x, z: KEEP.door.z },
  keep: KEEP.rect,
  zones: {
    parterre: { x: (ZONES.parterre[0][0] + ZONES.parterre[0][2]) / 2, z: (ZONES.parterre[0][1] + ZONES.parterre[0][3]) / 2 },
    cour: { x: AXIS, z: 69 },
    terrace: { x: AXIS, z: 55 },
    kitchenGarden: { x: 44, z: 66 }, privyGarden: { x: mx(44), z: 66 },
    stableYard: { x: 44, z: 80 }, musterYard: { x: mx(44), z: 80 },
    paddock: { x: 44, z: 114.5 }, training: { x: mx(44), z: 114.5 },
    forecourt: { x: AXIS, z: 121.5 },
  },
};

/** The castle's crown, the stair up its rock and the pool under its fall: no rock or tree is set there. */
export const nearCastle = (x: number, z: number) => onCrown(x, z) || (x > 133 && x < 166 && z > 141 && z < 176) || Math.hypot(x - WATER.pool.x, z - WATER.pool.z) < 11;

/**
 * Kerbs: inside the curtain every lawn meets the paving along a dressed stone kerb, and the gravel
 * and beaten earth meet the flagstones (and the gravel meets the lawns) the same way: one slab laid
 * on the harder side of every such cell edge, runs merged, so no lawn or path ends in a raw cut.
 * (Round the fountain the ring kerb does this; the straight kerbs stop on its circle.)
 */
export function castleKerbs(G: Gen, lawn: Uint8Array) {
  const { w, h } = G;
  const kerbs: { x: number; z: number; rot: number; len: number }[] = [];
  const inside = (x: number, z: number) => x >= 0 && z >= 0 && x < w && z < h && castleBailey.inCastle(x + 0.5, z + 0.5);
  const hard = (x: number, z: number) => inside(x, z) && G.l.cells[G.idx(x, z)] === Cell.Ground && G.l.ground[G.idx(x, z)] === Ground.Stone;
  const soft = (x: number, z: number) => inside(x, z) && (G.l.ground[G.idx(x, z)] === Ground.Path || G.l.ground[G.idx(x, z)] === Ground.Dirt) && (G.l.cells[G.idx(x, z)] === Cell.Ground || G.l.cells[G.idx(x, z)] === Cell.Blocked);
  const green = (x: number, z: number) => inside(x, z) && lawn[G.idx(x, z)] !== Lawn.None && G.l.ground[G.idx(x, z)] === Ground.Grass;
  const edge = (ax: number, az: number, bx: number, bz: number) => (hard(ax, az) && (green(bx, bz) || soft(bx, bz))) || (soft(ax, az) && green(bx, bz));
  const R = castleBailey.ARC_LAWN;
  const clear = (x: number, z: number) => Math.hypot(x - FOUNTAIN.x, z - FOUNTAIN.z) > R - 0.6;
  // Edges between rows z - 1 and z (along X), then between columns x - 1 and x (along Z); the kerb
  // lies flush along the edge on whichever side is the harder one, a third of a cell wide (the
  // paving's first row: see kerbStones).
  for (let z = 1; z < h; z++) for (const [a, b, off] of [[z - 1, z, -KERB_SET], [z, z - 1, KERB_SET]]) {
    let s = -1;
    for (let x = 0; x <= w; x++) {
      const ok = x < w && edge(x, a, x, b) && clear(x + 0.5, z);
      if (ok && s < 0) s = x;
      if (!ok && s >= 0) {
        kerbs.push({ x: (s + x) / 2, z: z + off, rot: 0, len: x - s });
        s = -1;
      }
    }
  }
  for (let x = 1; x < w; x++) for (const [a, b, off] of [[x - 1, x, -KERB_SET], [x, x - 1, KERB_SET]]) {
    let s = -1;
    for (let z = 0; z <= h; z++) {
      const ok = z < h && edge(a, z, b, z) && clear(x, z + 0.5);
      if (ok && s < 0) s = z;
      if (!ok && s >= 0) {
        kerbs.push({ x: x + off, z: (s + z) / 2, rot: Math.PI / 2, len: z - s });
        s = -1;
      }
    }
  }
  // The straight kerbs that reach the fountain's circle stop on it, where the curved kerb takes
  // over (the lawn's edge there is the circle, not the cell's).
  for (let k = kerbs.length - 1; k >= 0; k--) {
    const kb = kerbs[k], ux = Math.cos(kb.rot), uz = -Math.sin(kb.rot), dx = kb.x - FOUNTAIN.x, dz = kb.z - FOUNTAIN.z;
    const b = dx * ux + dz * uz, c = dx * dx + dz * dz - R * R, disc = b * b - c;
    if (disc <= 0) continue;
    const t1 = -b - Math.sqrt(disc), t2 = -b + Math.sqrt(disc), lo = -kb.len / 2, hi = kb.len / 2;
    if (t2 <= lo || t1 >= hi) continue;
    kerbs.splice(k, 1);
    // (A stub left between the circle and a cell corner, under the arc's hedge, is dropped.)
    for (const [a, e] of [[lo, Math.min(hi, t1)], [Math.max(lo, t2), hi]]) if (e - a > 0.5) kerbs.push({ x: kb.x + ux * (a + e) / 2, z: kb.z + uz * (a + e) / 2, rot: kb.rot, len: e - a });
  }
  return kerbs;
}
