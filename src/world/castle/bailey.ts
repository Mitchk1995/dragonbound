import { KERB_SET } from '../kerbStones';
import { Cell, Ground, Lawn } from '../layout';
import { AXIS, BAILEY, CROSS, CROWN_Y, FOUNTAIN, LAMPS, mx, TERRACE, TERRACE_STAIRS, TERRACE_Y, WALKS, ZONES, type Box } from './plan';
import { inBox, type Site } from './site';

/**
 * The bailey's grounds: the terrace (the upper court) at TERRACE_Y behind its retaining wall, the
 * stairs down from it, the walks, courts and yards below, the lawns, and the centrepiece (the dragon
 * fountain in its plaza within the four lawn panels of the parterre).
 */

/** Is a point inside the curtain (the bailey and the terrace)? */
export const inCastle = (x: number, z: number) => inBox(x, z, BAILEY);

/** The parterre's lawns end in this circle round the fountain (their box border just outside it). */
export const ARC_LAWN = FOUNTAIN.arc - 0.3;

/** The bailey's turf at the crown's level, before the rock is cut round the castle. */
export function turf(s: Site) {
  s.cells(BAILEY, (i) => {
    s.G.l.ground[i] = Ground.Grass;
    s.level[i] = CROWN_Y;
    if (!s.G.reserved[i]) s.G.reserved[i] = 3;
  });
}

/** Is a cell (by its middle) on the terrace: the upper court and the keep's podium, to the curtain's inner cells? */
const onTerrace = (x: number, z: number) => TERRACE.parts.some(([x0, z0, x1, z1]) => inBox(x, z, [x0 - 0.5, z0 - 0.5, x1 + 0.5, z1]));

/**
 * The terrace and the stairs down from it, laid once the curtain stands (its inner cells along the
 * terrace take the terrace's fill against them): the upper court and the podium at TERRACE_Y, paved;
 * each stair graded from the terrace's edge down to its foot at the crown; and the retaining wall
 * round the terrace's edge, a cell thick, its coping a parapet over the paving, turning down beside
 * each stair as its cheek walls, which end on piers at the stairs' feet.
 */
export function terrace(s: Site) {
  s.cells([BAILEY[0] - 1, BAILEY[1] - 1, BAILEY[2] + 1, TERRACE.parts[1][3]], (i, x, z) => {
    if (!onTerrace(x + 0.5, z + 0.5)) return;
    s.level[i] = TERRACE_Y;
    s.G.l.ground[i] = Ground.Stone;
    s.G.reserved[i] = 1;
  });
  for (const st of TERRACE_STAIRS) {
    s.cells([st.x0, st.z0, st.x1, st.z1], (i, _x, z) => s.open(i, TERRACE_Y - (TERRACE_Y - CROWN_Y) * Math.min(1, (z + 0.5 - st.z0) / (st.z1 - st.z0)), Ground.Stone));
  }
  // The retaining wall (west half, then its mirror): from the curtain along the terrace's edge to
  // the kitchen garden's stair, down its west cheek; from its east cheek along the edge round the
  // podium to the grand stair, down its west cheek.
  const top = TERRACE.edgeTop, foot = TERRACE_Y - 1;
  const [g, grand] = [TERRACE_STAIRS[1], TERRACE_STAIRS[0]];
  const runs: [number, number, number][][] = [
    [[33.4, 43.5, top], [g.x0 - 0.5, 43.5, top], [g.x0 - 0.5, 48.2, foot]],
    [[g.x1 + 0.5, 48.2, foot], [g.x1 + 0.5, 43.5, top], [60.5, 43.5, top], [60.5, 47.5, top], [grand.x0 - 0.5, 47.5, top], [grand.x0 - 0.5, 54.2, foot]],
  ];
  for (const run of runs) for (const side of [-1, 1]) {
    const pts = run.map(([x, z, y]): [number, number, number] => [side < 0 ? x : mx(x), z, y]);
    s.wall(pts, CROWN_Y);
    // (A pier closes the cheek at each stair's foot, the wall's end buried in it.)
    for (const e of [pts[0], pts[pts.length - 1]]) if (e[2] === foot) s.prop('parapet_pier', e[0], e[1], 0, 0.6, { y: CROWN_Y });
  }
}

/**
 * The bailey's walks, courts and yards (paved, gravelled or beaten earth on the lawn), and the
 * gardens' and the paddock's longer lawn (`garden` cells, for the lawn pass).
 */
export function grounds(s: Site) {
  const below = (box: Box, g: Ground) => s.cells(box, (i, x, z) => {
    if (!onTerrace(x + 0.5, z + 0.5) && s.G.l.cells[i] === Cell.Ground) s.G.l.ground[i] = g;
  });
  for (const w of WALKS) below(w, Ground.Stone);
  for (const z of [ZONES.cour, ZONES.forecourt, ZONES.stableYard, ZONES.musterYard]) below(z, Ground.Stone);
  below(ZONES.trainingYard, Ground.Dirt);
  s.G.clearing(FOUNTAIN.x, FOUNTAIN.z, FOUNTAIN.plaza, Ground.Stone, 0);
  // (The gate's passage, paved through the curtain.)
  s.pave([AXIS - 2, 97, AXIS + 2, 102]);
}

/** The private gardens and the paddock grow the longer garden lawn. */
export const GARDEN_LAWNS: Box[] = [ZONES.kitchenGarden, ZONES.privyGarden, ZONES.paddock];

/**
 * The centrepiece: the dragon fountain at the crossing of the axes in its plaza, a bench on each of
 * the plaza's diagonals facing it; round it the parterre's four lawn panels, each boxed in clipped
 * box along its walks and round its arc, a blossom tree in its outer corner and a clipped cone at
 * each end of its arc, the lawn inside planted (never walked); lamps along the avenue.
 */
export function centrepiece(s: Site) {
  const { G } = s;
  s.prop('dragon_fountain', FOUNTAIN.x, FOUNTAIN.z, 0, 5.9);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const x = FOUNTAIN.x + sx * 5.6, z = FOUNTAIN.z + sz * 5.6;
    s.prop('garden_bench', x, z, Math.atan2(FOUNTAIN.x - x, FOUNTAIN.z - z), 0.5);
  }
  const R = FOUNTAIN.arc;
  for (const [x0, z0, x1, z1] of ZONES.parterre) {
    // This panel's corner nearest the fountain, and which way its outer corner lies.
    const sx = x0 < AXIS ? -1 : 1, sz = z0 < CROSS ? -1 : 1;
    const ix = sx < 0 ? x1 - 0.5 : x0 + 0.5, iz = sz < 0 ? z1 - 0.5 : z0 + 0.5, ox = sx < 0 ? x0 + 0.5 : x1 - 0.5, oz = sz < 0 ? z0 + 0.5 : z1 - 0.5;
    // The arc from the panel's cross-walk side round to its avenue side, on the circle of radius R.
    const a0 = Math.asin(Math.abs(iz - CROSS) / R), a1 = Math.acos(Math.abs(ix - AXIS) / R), n = 6;
    const arc = Array.from({ length: n + 1 }, (_, k) => {
      const a = a0 + ((a1 - a0) * k) / n;
      return [AXIS + sx * R * Math.cos(a), CROSS + sz * R * Math.sin(a)];
    });
    border(s, [[ox, oz], [ox, iz], ...arc, [ix, oz]], true);
    // The lawn inside the border is planted ground.
    s.cells([x0, z0, x1, z1], (i, x, z) => {
      if (G.l.cells[i] === Cell.Ground && G.l.ground[i] === Ground.Grass && Math.hypot(x + 0.5 - AXIS, z + 0.5 - CROSS) > R) G.l.cells[i] = Cell.Blocked;
    });
    s.prop('garden_tree', ox - sx * 1.5, oz - sz * 1.5, 0, 0.45, { v: sz < 0 ? 1 : 2, s: 0.9, len: 0 });
    // (A cone a clear step in from the border at each end of the arc.)
    const cx = ix + sx * 1.2, cz = iz + sz * 1.1;
    s.prop('topiary', cx, CROSS + sz * (Math.sqrt(R * R - (cx - AXIS) ** 2) + 1.6), 0, 0.5, { len: 1 });
    s.prop('topiary', AXIS + sx * (Math.sqrt(R * R - (cz - CROSS) ** 2) + 1.6), cz, 0, 0.5, { len: 1 });
  }
  // Round the fountain the panels' lawns end in a circle just under their box arcs: the plaza's
  // paving runs out to the arcs and the lawn grows over the cells the circle crosses.
  for (const [x0, z0, x1, z1] of ZONES.parterre) s.cells([x0, z0, x1, z1], (i, x, z) => {
    const r = Math.hypot(x + 0.5 - AXIS, z + 0.5 - CROSS);
    if (r < R) G.l.ground[i] = Ground.Stone;
  });
  // The kerb round the plaza under the arcs: in each quarter from the cross walk's kerb round the
  // circle to the avenue's kerb, on along it to where that kerb takes over at the lawn's circle.
  const xc = 3 - KERB_SET;
  const ring = s.prop('kerb_ring', FOUNTAIN.x, FOUNTAIN.z);
  ring.len = ARC_LAWN - KERB_SET;
  ring.opt = { d0: 2 - KERB_SET, x0: R, xc, d1: Math.sqrt(ARC_LAWN * ARC_LAWN - xc * xc), x1: xc };
  for (const [x, z] of LAMPS) s.prop('lamp_post', x, z, 0, 0.4);
}

/** Round the fountain the panels' lawn carpet: clipped over the cells the circle crosses, cut along it. */
export function parterreLawn(s: Site, lawn: Uint8Array) {
  for (const [x0, z0, x1, z1] of ZONES.parterre) s.cells([x0, z0, x1, z1], (i, x, z) => {
    const r = Math.hypot(x + 0.5 - AXIS, z + 0.5 - CROSS);
    if (r < FOUNTAIN.arc + 0.6 && r >= FOUNTAIN.plaza - 0.2 && (s.G.l.cells[i] === Cell.Ground || s.G.l.cells[i] === Cell.Blocked)) lawn[i] = Lawn.Clipped;
  });
}

/**
 * A clipped box border along an outline of corners (closed into a loop when `closed`): one
 * continuous shape, blocking the cells its centreline crosses.
 */
function border(s: Site, pts: number[][], closed = false) {
  const { G } = s;
  const cx = pts.reduce((a, q) => a + q[0], 0) / pts.length, cz = pts.reduce((a, q) => a + q[1], 0) / pts.length;
  const p = G.prop('box_border', cx, cz, 0);
  p.opt = { pts: pts.map(([x, z]) => [x - cx, z - cz]), closed };
  const segs = closed ? pts.map((q, k) => [q, pts[(k + 1) % pts.length]]) : pts.slice(0, -1).map((q, k) => [q, pts[k + 1]]);
  for (const [[x0, z0], [x1, z1]] of segs) {
    const L = Math.hypot(x1 - x0, z1 - z0), n = Math.ceil(L / 0.1), e = Math.min(0.02, L / 4) / L;
    for (let k = 0; k <= n; k++) {
      const t = e + ((1 - 2 * e) * k) / n, i = G.idx(Math.floor(x0 + (x1 - x0) * t), Math.floor(z0 + (z1 - z0) * t));
      if (G.l.cells[i] === Cell.Ground) G.l.cells[i] = Cell.Blocked;
    }
  }
}
