import { CURTAIN_WALL, GATEHOUSE } from '../../data/castle';
import { Cell, Fluid, Ground } from '../layout';
import { WATER_Y } from '../terrain';
import { APPROACH, AXIS, BRIDGE, CROWN_OUTLINE, CROWN_Y, CURTAIN, CURTAIN_RUNS, GATE, KEEP, MOAT, TERRACE_Y, TOWERS, WATER } from './plan';
import { inPoly, type Site } from './site';

/**
 * The castle's ground and water: the crown it stands on, the moat round it two and a half metres
 * under the turf (its dressed outer bank, the plinths the walls and towers rise from it on, the
 * springs that feed it, the sluice and the fall from the outfall that drain it) and the water below
 * the rock (the south fall's pool and the stream from it, the west fall off the brink).
 */

/**
 * The crown's natural edge: the rock round the moat wandering in and out in bays and spurs of
 * different sizes (never a ruled line, seen from above or from below), and on the south the plan's
 * own brink, which the ledge's outer walls follow. Everywhere it keeps at least three metres of rim
 * beyond the moat's outer bank and stays on the island.
 */
const NORTH_AND_EAST: [number, number][] = [
  [15, 15], [18.1, 12.4], [21.8, 14], [25.5, 11.1], [30.1, 9.8], [34.3, 7.7], [39.9, 10.3], [44.4, 7.2], [49.1, 5.1], [54.2, 6.9], [58.1, 3.8],
  [63.3, 3], [67.8, 4.5], [73, 2.6], [78.9, 2.3], [83.4, 3.9], [88.6, 2.1], [94.5, 2.6], [99, 4.3], [104.2, 2.9], [109.4, 3.8], [114, 5],
  [117.9, 9], [122.4, 9.3], [127, 12.3], [132.2, 10.3], [136.7, 12.9], [141.3, 11.4], [145.8, 14], [151, 14.2], [154.9, 16.8], [156.9, 17.1],
  [159.3, 21.5], [157.8, 26.1], [160.1, 30.6], [163.7, 35.2], [165.6, 41], [163.2, 46.2], [158.8, 50.8], [159.6, 55.3], [163.2, 59.9], [167.1, 64.4],
  [166.6, 70.9], [163, 74.8], [158.8, 79.4], [158, 84.6], [160.9, 89.1], [161.4, 95], [158.5, 99.5], [158, 104.7], [161.1, 108.6], [166.1, 113.2],
  [167.4, 119], [164.5, 124.9], [160.1, 128.8], [160.4, 137.2],
];
const WEST: [number, number][] = [
  [12.7, 135.3], [10.1, 131.4], [8.8, 126.8], [10.6, 121.6], [14, 118.4], [12.7, 113.8], [14, 109.9], [13.6, 106], [13.7, 102.8], [11.4, 100.2], [8.5, 96.3],
  [6.2, 91.1], [7, 87.2], [10.1, 83.9], [12.9, 79.4], [14.4, 73.5], [14.5, 68.3], [13.7, 63.1], [14.8, 57.9], [14.2, 52.7], [13.6, 47.5], [14.8, 42.3],
  [13.2, 35.8], [14, 30.6], [14, 26.7],
];
/** The plan's south brink, from the landing round to the lookout's knoll (its points [159.6, 145] to [15, 139.8]). */
const SOUTH = CROWN_OUTLINE.slice(
  CROWN_OUTLINE.findIndex(([x, z]) => x === 159.6 && z === 145),
  CROWN_OUTLINE.findIndex(([x, z]) => x === 15 && z === 139.8) + 1,
);
export const CROWN_EDGE: [number, number][] = [...NORTH_AND_EAST, ...SOUTH, ...WEST];

/** Is a point on the crown (inside its natural edge)? */
export const onCrown = (x: number, z: number) => inPoly(x, z, CROWN_EDGE);

/**
 * The crown: everything inside its natural edge stands at CROWN_Y. Where the island's own edge runs
 * within a couple of metres outside it (the tear faces on the north and the west), the strip between
 * breaks away, so the crown's edge is the cliff's brink over the Veil, never a ledge too narrow to
 * stand on.
 */
export function crown(s: Site) {
  const { G } = s, l = G.l;
  s.within(CROWN_EDGE, (i) => {
    if (l.cells[i] !== Cell.Void) s.level[i] = CROWN_Y;
  });
  const near = (x: number, z: number, test: (j: number, x: number, z: number) => boolean) => {
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) if (G.inside(x + dx, z + dz) && test(G.idx(x + dx, z + dz), x + dx, z + dz)) return true;
    return false;
  };
  const xs = CROWN_EDGE.map((p) => p[0]), ys = CROWN_EDGE.map((p) => p[1]), drop: number[] = [];
  s.cells([Math.min(...xs) - 3, Math.min(...ys) - 3, Math.max(...xs) + 3, Math.max(...ys) + 3], (i, x, z) => {
    if (l.cells[i] === Cell.Void || z > 136 || onCrown(x + 0.5, z + 0.5)) return;
    if (near(x, z, (j) => l.cells[j] === Cell.Void) && near(x, z, (_, cx, cz) => onCrown(cx + 0.5, cz + 0.5))) drop.push(i);
  });
  for (const i of drop) l.cells[i] = Cell.Void;
}

/**
 * The moat's outer bank as built: the plan's outer bank (MOAT.counterscarp) set out on the cell
 * grid, its straight runs on cell edges and its splays on true diagonals through cell corners (none
 * more than half a metre off the plan's lines), so the water's edge steps exactly along the bank's
 * dressed face and no step of the bank's earth shows in front of it. Closed along the ledge at z 142.
 */
const MOAT_EDGE: [number, number][] = [[19, 142], [19, 22], [23, 18], [53, 18], [62, 9], [110, 9], [119, 18], [149, 18], [153, 22], [153, 142]];
/** Does a cell's middle lie inside the moat's outer bank (its splays pass through cells' middles: those stay bank)? */
const inMoat = (x: number, z: number) => {
  const px = x + 0.5, pz = z + 0.5;
  if (!inPoly(px, pz, MOAT_EDGE)) return false;
  return MOAT_EDGE.every(([ax, az], k) => {
    const [bx, bz] = MOAT_EDGE[(k + 1) % MOAT_EDGE.length], L2 = (bx - ax) ** 2 + (bz - az) ** 2;
    const t = Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (pz - az) * (bz - az)) / L2));
    return Math.hypot(px - ax - (bx - ax) * t, pz - az - (bz - az) * t) > 0.05;
  });
};
/**
 * Is a point on the rim, the strip of the crown's natural rock and turf beyond the moat on the west,
 * north and east that no one walks (it grows the island's own meadow grass, not a kept lawn)?
 */
export const onRim = (x: number, z: number) => onCrown(x, z) && z < MOAT_EDGE[0][1] && !inPoly(x, z, MOAT_EDGE);
/** The level of a moat cell: its water's surface then stands at MOAT.surface (see terrain.ts). */
const MOAT_LEVEL = MOAT.surface - WATER_Y;
/** The foot of the masonry founded on the moat's bed (on a course line, a hair into the bed). */
const MOAT_FOOT = Math.floor(MOAT.bed + 0.2);
/** The two springs behind the keep, spilling into the basin either side of the axis. */
const SPRINGS = [AXIS - 21.5, AXIS + 21.5];
/** The west sluice and the channel from it across the rim to the brink: its middle and its rows (cell edges). */
const SLUICE = { z: WATER.westFall.z, z0: WATER.westFall.z - 1, z1: WATER.westFall.z + 1 };
/** The moat's masonry's frame (see castleProps/water.ts): from its foot up to the turf and to the water. */
const FRAME = { h: CROWN_Y - MOAT_FOOT, wl: MOAT.surface - MOAT_FOOT };
/** How far the drums' battered plinths lean out per metre of fall: the towers' base course's own batter. */
const PLINTH_BATTER = 0.35;
/** The middle of the bailey: the moat's outer bank and the curtain's runs face away from it. */
const MID = { x: (CURTAIN.west + CURTAIN.east) / 2, z: (CURTAIN.north + CURTAIN.south) / 2 };

/** Inside the curtain's outer faces (its masonry and everything it encloses)? */
const insideCurtain = (x: number, z: number) => {
  const h = CURTAIN.T / 2;
  return x > CURTAIN.west - h && x < CURTAIN.east + h && z > CURTAIN.north - h && z < CURTAIN.south + h;
};

/** Is a cell the moat's own water (not the sluice's channel off it)? */
const moatWater = (s: Site, i: number, x: number, z: number) => !!s.G.l.fluid[i] && Math.abs(s.level[i] - MOAT_LEVEL) < 1e-3 && inMoat(x, z);

/** The x of the brink at the sluice's channel (its last cell's outer edge). */
function channelEnd() {
  let x = Math.floor(Math.min(...MOAT_EDGE.map((p) => p[0]))) - 1;
  while (onCrown(x - 0.5, SLUICE.z)) x--;
  return x;
}

/**
 * The moat: every cell inside its outer bank that no masonry stands on (the curtain, its towers and
 * the gatehouse's drums standing out into it, the keep's back half and its plinth, the bridge) is
 * water standing at MOAT.surface, its bed at MOAT.bed. Round it the bank: the cells along the outer
 * bank's dressed face are its masonry (closed off under its coping, at the crown's level).
 * Off the west arm the sluice's channel runs across the rim between walls of rock to the brink.
 */
export function moat(s: Site) {
  const { G } = s, l = G.l, [kx0, kz0, kx1] = KEEP.rect;
  const masonry = (x: number, z: number) =>
    insideCurtain(x, z) ||
    TOWERS.some((t) => Math.hypot(x - t.x, z - t.z) <= t.r) ||
    [-1, 1].some((sx) => Math.hypot(x - GATE.x - sx * GATEHOUSE.cx, z - GATE.z) <= GATEHOUSE.R) ||
    (x > kx0 - 2 && x < kx1 + 2 && z > kz0 - 2 && z < CURTAIN.north) ||
    (x > BRIDGE.x0 - 0.5 && x < BRIDGE.x1 + 0.5 && z > CURTAIN.south && z < BRIDGE.z1);
  const water = (i: number, depth: number) => {
    l.fluid[i] = Fluid.Water;
    l.cells[i] = Cell.Blocked;
    l.ground[i] = Ground.Cave;
    l.elev[i] = depth;
    s.level[i] = MOAT_LEVEL;
    G.reserved[i] = 1;
  };
  const xs = MOAT_EDGE.map((p) => p[0]), ys = MOAT_EDGE.map((p) => p[1]);
  s.cells([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], (i, x, z) => {
    if (inMoat(x, z) && !masonry(x + 0.5, z + 0.5)) water(i, MOAT.surface - MOAT.bed);
  });
  // The sluice's channel: water a little deep in a cut through the rim from the bank to the brink,
  // walled by the rim's own rock either side.
  const end = channelEnd();
  for (let x = Math.floor(Math.min(...MOAT_EDGE.map((p) => p[0]))) - 1; x >= end; x--) {
    for (let z = SLUICE.z0; z < SLUICE.z1; z++) water(G.idx(x, z), 0.6);
    for (const z of [SLUICE.z0 - 1, SLUICE.z1]) {
      const i = G.idx(x, z);
      l.cells[i] = Cell.Cliff;
      l.ground[i] = Ground.Cave;
      l.fluid[i] = Fluid.None;
      s.level[i] = MOAT_LEVEL;
      l.elev[i] = CROWN_Y + 0.35 - MOAT_LEVEL;
      G.reserved[i] = 1;
    }
  }
  // The bank's masonry: every cell of the crown beside the water outside the outer bank.
  s.cells([Math.min(...xs) - 3, Math.min(...ys) - 3, Math.max(...xs) + 3, Math.max(...ys) + 3], (i, x, z) => {
    if (l.fluid[i] || l.cells[i] === Cell.Void || l.cells[i] === Cell.Cliff || inMoat(x, z)) return;
    let wet = false;
    for (let dz = -1; dz <= 1 && !wet; dz++) for (let dx = -1; dx <= 1; dx++) if (moatWater(s, G.idx(x + dx, z + dz), x + dx, z + dz)) wet = true;
    if (!wet) return;
    s.block(i, CROWN_Y);
    l.ground[i] = Ground.Cave;
    l.elev[i] = 0;
  });
}

/**
 * The keep's back half stands out over the moat behind the curtain: its footprint and a plinth a
 * cell wide round it at the terrace's level (the keep's own battered plinth stands on it, founded on
 * the moat's bed), the water up to it all round; only at the curtain's outer face, where the
 * curtain's run meets the keep's flank, the rock rises to the curtain's foot.
 */
export function keepPlinth(s: Site) {
  const [x0, z0, x1] = KEEP.rect, l = s.G.l, face = CURTAIN.north - CURTAIN.T / 2;
  s.cells([x0 - 1, z0 - 1, x1 + 1, face], (i) => s.block(i, TERRACE_Y));
  // (Where the curtain meets its flanks the keep's floor runs on through at the terrace's level.)
  s.cells([x0, z0, x1, CURTAIN.north + CURTAIN.T], (i) => (s.level[i] = TERRACE_Y));
  s.cells([x0 - 2, z0 - 2, x1 + 2, face], (i, x, z) => {
    if (x >= x0 - 1 && x < x1 + 1 && z >= z0 - 1) return;
    l.ground[i] = Ground.Cave;
    if (z + 1 < face) {
      l.fluid[i] = Fluid.Water;
      l.cells[i] = Cell.Blocked;
      l.elev[i] = MOAT.surface - MOAT.bed;
      s.level[i] = MOAT_LEVEL;
      s.G.reserved[i] = 1;
      return;
    }
    l.fluid[i] = Fluid.None;
    l.cells[i] = Cell.Cliff;
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

type P2 = [number, number];

/** A polyline cut at gaps (each a point on it and a half width), into the pieces between them. */
function cut(pts: P2[], gaps: { x: number; z: number; half: number }[]): P2[][] {
  const out: P2[][] = [];
  let cur: P2[] = [pts[0]];
  for (let k = 0; k < pts.length - 1; k++) {
    const a = pts[k], b = pts[k + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L;
    const on = gaps
      .map((g) => ({ g, t: (g.x - a[0]) * ux + (g.z - a[1]) * uz, d: Math.abs((g.x - a[0]) * -uz + (g.z - a[1]) * ux) }))
      .filter(({ t, d }) => d < 0.8 && t > 0 && t < L)
      .sort((p, q) => p.t - q.t);
    for (const { g, t } of on) {
      cur.push([a[0] + ux * (t - g.half), a[1] + uz * (t - g.half)]);
      out.push(cur);
      cur = [[a[0] + ux * (t + g.half), a[1] + uz * (t + g.half)]];
    }
    cur.push(b);
  }
  out.push(cur);
  return out;
}

/** A prop laid along world points: placed at their middle, the points made relative to it. */
function run(s: Site, kind: string, pts: P2[], y: number, opt: Record<string, unknown> = {}) {
  const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cz = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  return s.prop(kind, cx, cz, 0, 0, { y, opt: { ...FRAME, ...opt, pts: pts.map(([x, z]) => [x - cx, z - cz]) } });
}

/**
 * The moat's masonry and water works: the outer bank's dressed face from the bed to its coping
 * (along the ledge, the ledge's wall stands on it instead), the battered plinths the curtain, its
 * towers and the gatehouse's drums rise from the water on (the bridge on its arches is the
 * approach's), the two springs spilling from arched spouts in the bank behind the keep, and the
 * sluice in the west arm's bank feeding the west fall.
 */
function moatWorks(s: Site) {
  // (Every cell the water touches, behind the face to the cell beyond, is the bank's: it holds it all.)
  const face = MOAT_EDGE, n = face.length, depth = 1.05;
  const springs = SPRINGS.map((x) => ({ x, z: face[4][1], half: 1.0 }));
  const sluice = { x: face[0][0], z: SLUICE.z, half: (SLUICE.z1 - SLUICE.z0) / 2 + 0.5 };
  // The coped bank round the west, north and east arms, cut for the sluice and the springs' spouts.
  for (const pts of cut(face, [sluice, ...springs])) run(s, 'moat_bank', pts, MOAT_FOOT, { top: FRAME.h, coping: 1, depth });
  // Along the ledge the bank carries the ledge's wall, its top flush with the paving, either side of
  // the bridge's south abutment (running on under the rim's end at each corner).
  const back = depth, south = face[0][1];
  for (const [a, b] of [[face[n - 1][0] + back, BRIDGE.x1 - 0.4], [BRIDGE.x0 + 0.4, face[0][0] - back]]) {
    run(s, 'moat_bank', [[a, south], [b, south]], MOAT_FOOT, { top: FRAME.h + 0.02, coping: 0, depth });
  }
  for (const sp of springs) s.prop('moat_spring', sp.x, sp.z, 0, 0, { y: MOAT_FOOT, opt: { ...FRAME, depth } });
  s.prop('moat_sluice', sluice.x, sluice.z, Math.PI / 2, 0, { y: MOAT_FOOT, len: sluice.x - channelEnd(), opt: FRAME });
  // The plinths: each drum on a battered drum, each run of the curtain on a battered band along its
  // outer face (its base course's face at the top), the bridge landing between the gate's drums.
  for (const t of TOWERS) s.prop('moat_plinth', t.x, t.z, 0, 0, { y: MOAT_FOOT, len: t.r + 0.5, opt: { ...FRAME, r: t.r, batter: PLINTH_BATTER } });
  for (const sx of [-1, 1]) s.prop('moat_plinth', GATE.x + sx * GATEHOUSE.cx, GATE.z, 0, 0, { y: MOAT_FOOT, len: GATEHOUSE.R + 0.55, opt: { ...FRAME, r: GATEHOUSE.R, batter: PLINTH_BATTER } });
  const out = CURTAIN_WALL.T / 2 + 0.25, [kx0, , kx1] = KEEP.rect;
  for (const [a, b] of CURTAIN_RUNS) {
    const L = Math.hypot(b.x - a.x, b.z - a.z), ux = (b.x - a.x) / L, uz = (b.z - a.z) / L;
    let nx = -uz, nz = ux;
    if ((MID.x - a.x) * nx + (MID.z - a.z) * nz > 0) (nx = -nx), (nz = -nz);
    const at = (t: number): P2 => [a.x + ux * t + nx * out, a.z + uz * t + nz * out];
    /** How far along the run a point's x lies (the north and south runs). */
    const tx = (x: number) => (x - a.x) / ux;
    // (A north run ends a metre into the keep's plinth; the south run stops at the bridge.)
    let spans: [number, number][] = [[0, L]];
    if (a.z === CURTAIN.north && b.x === kx0) spans = [[0, tx(kx0 - 1)]];
    else if (a.z === CURTAIN.north && a.x === kx1) spans = [[tx(kx1 + 1), L]];
    else if (a.z === CURTAIN.south && b.z === CURTAIN.south) spans = [[0, tx(BRIDGE.x1 + 0.5)], [tx(BRIDGE.x0 - 0.5), L]];
    for (const [t0, t1] of spans) run(s, 'moat_plinth_run', [at(t0), at(t1)], MOAT_FOOT, { out: [nx, nz] });
  }
}

/**
 * The moat's works (above) and the falls: the moat pours out of the culvert under the gate terrace
 * from an arch in the bastion's south face into the pool; the west sluice's channel spills off the
 * brink into the Veil.
 */
export function falls(s: Site) {
  moatWorks(s);
  // (From the spout's lip, standing out over the bastion's battered face at its foot.)
  const b = APPROACH.bastion;
  s.prop('moat_outfall', WATER.southFall.x, b.rect[3] + b.batter * CROWN_Y + 0.5, 0, 0, { len: b.culvert.sill, y: 0, opt: { w: b.culvert.w } });
  s.prop('edge_fall', channelEnd(), SLUICE.z, -Math.PI / 2, 0, { y: MOAT.surface + 0.25 });
}
