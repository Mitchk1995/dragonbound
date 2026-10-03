import { GATEHOUSE } from '../../data/castle';
import { Cell, Fluid, Ground } from '../layout';
import { BRIDGE, CROWN_OUTLINE, CROWN_Y, CURTAIN, GATE, KEEP, MOAT, TERRACE_Y, TOWERS, WATER } from './plan';
import { inPoly, type Site } from './site';

/**
 * The castle's ground and water: the crown it stands on, the moat round it and the water below the
 * rock (the south fall's pool and the stream from it, the west fall off the brink).
 */

/** Is a point on the crown (inside its natural edge)? */
export const onCrown = (x: number, z: number) => inPoly(x, z, CROWN_OUTLINE);

/** The crown: everything inside its natural edge stands at CROWN_Y. */
export function crown(s: Site) {
  s.within(CROWN_OUTLINE, (i) => {
    if (s.G.l.cells[i] !== Cell.Void) s.level[i] = CROWN_Y;
  });
}

/** Inside the curtain's outer faces (its masonry and everything it encloses)? */
const insideCurtain = (x: number, z: number) => {
  const h = CURTAIN.T / 2;
  return x > CURTAIN.west - h && x < CURTAIN.east + h && z > CURTAIN.north - h && z < CURTAIN.south + h;
};

/**
 * The moat: every cell inside its outer bank that no masonry stands on (the curtain, its towers and
 * the gatehouse's drums standing out into it, the keep's back half and its plinth, the bridge) is
 * water. Its plan levels are MOAT.surface and MOAT.bed; until its banks are built and the curtain,
 * the towers and the keep stand on plinths founded on its bed, its water stands level with the
 * crown, so nothing built at the water's edge stands over a drop.
 */
export function moat(s: Site) {
  const { G } = s, [kx0, kz0, kx1] = KEEP.rect;
  const masonry = (x: number, z: number) =>
    insideCurtain(x, z) ||
    TOWERS.some((t) => Math.hypot(x - t.x, z - t.z) <= t.r) ||
    [-1, 1].some((sx) => Math.hypot(x - GATE.x - sx * GATEHOUSE.cx, z - GATE.z) <= GATEHOUSE.R) ||
    (x > kx0 - 2 && x < kx1 + 2 && z > kz0 - 2 && z < CURTAIN.north) ||
    (x > BRIDGE.x0 - 0.5 && x < BRIDGE.x1 + 0.5 && z > CURTAIN.south && z < BRIDGE.z1);
  s.within(MOAT.counterscarp, (i, x, z) => {
    if (masonry(x + 0.5, z + 0.5)) return;
    G.l.fluid[i] = Fluid.Water;
    G.l.cells[i] = Cell.Blocked;
    G.l.ground[i] = Ground.Cave;
    s.level[i] = CROWN_Y;
    G.reserved[i] = 1;
  });
}

/**
 * The keep's back half stands out over the moat behind the curtain: its footprint and a plinth a
 * cell wide round it at the terrace's level, then a batter of rock a cell wide down to the water.
 */
export function keepPlinth(s: Site) {
  const [x0, z0, x1] = KEEP.rect;
  s.cells([x0 - 1, z0 - 1, x1 + 1, CURTAIN.north - CURTAIN.T / 2], (i) => s.block(i, TERRACE_Y));
  // (Where the curtain meets its flanks the keep's floor runs on through at the terrace's level.)
  s.cells([x0, z0, x1, CURTAIN.north + CURTAIN.T], (i) => (s.level[i] = TERRACE_Y));
  s.cells([x0 - 2, z0 - 2, x1 + 2, CURTAIN.north - CURTAIN.T / 2], (i, x, z) => {
    if (x >= x0 - 1 && x < x1 + 1 && z >= z0 - 1) return;
    const l = s.G.l;
    l.fluid[i] = Fluid.None;
    l.cells[i] = Cell.Cliff;
    l.ground[i] = Ground.Cave;
    l.elev[i] = TERRACE_Y - CROWN_Y;
    s.level[i] = CROWN_Y;
  });
}

/** The pool at the foot of the south fall and the stream it feeds (rejoining today's course to the pond). */
export function stream(s: Site, roads: { x: number; z: number }[][]) {
  const { G } = s, P = WATER.stream.map(([x, z]) => ({ x, z }));
  const poly = G.river(P, 2.1, Fluid.Water, roads);
  // (Every cell its bed crosses is water: no bank cell pinches it where it runs on the diagonal.)
  G.along(poly, 2.9, 0, (i) => {
    if (G.reserved[i] === 1 && G.l.cells[i] === Cell.Ground) return;
    G.l.fluid[i] = Fluid.Water;
    G.l.cells[i] = Cell.Blocked;
  });
  // (The pool keeps a cell of the rock's foot between it and the gate bastion over it.)
  const r = WATER.pool.r - 0.7;
  G.lake(WATER.pool.x, WATER.pool.z, r, Fluid.Water, 0);
  // The stream runs on the lowland from the pool, its bed and banks on one level.
  G.along(poly, 2.1 + 4, 0, (i) => {
    if (s.level[i] < CROWN_Y) s.level[i] = 0;
  });
  G.blob(WATER.pool.x, WATER.pool.z, r + 1.4, 0, (i) => {
    if (s.level[i] < CROWN_Y) s.level[i] = 0;
  });
  return { poly, pool: { x: WATER.pool.x, z: WATER.pool.z, r } };
}

/**
 * The falls: the moat pours out under the gate terrace from an arch in the bastion's south face into
 * the pool (its back against the bastion); the west fall drops off the brink into the Veil.
 */
export function falls(s: Site) {
  const f = WATER.southFall;
  s.prop('spring_fall', f.x, f.z + 1.1, 0, 0, { len: f.top, y: 0 });
  s.G.reserve(WATER.westFall.x, WATER.westFall.z, 2.8);
  s.prop('edge_fall', WATER.westFall.x, WATER.westFall.z, -Math.PI / 2, 1.8, { v: 1 });
}
