import { KERB_SET } from '../kerbStones';
import { Cell, Ground, Lawn } from '../layout';
import { AXIS, BAILEY, CROSS, CROWN_Y, FOUNTAIN, GROW, LAMPS, mx, RANGE, TERRACE, TERRACE_STAIRS, TERRACE_Y, TOWERS, WALKS, ZONES, type Box } from './plan';
import { LIFT } from './approach';
import { STAIR_RULE } from '../building';
import { inBox, type Site } from './site';

/**
 * The bailey's grounds: the terrace (the upper court) at TERRACE_Y behind its retaining wall, the
 * stairs down from it, the walks, courts and yards below, the lawns, and the centrepiece (the dragon
 * fountain in its plaza within the four lawn panels of the parterre).
 */

/** Is a point inside the curtain (the bailey and the terrace)? */
export const inCastle = (x: number, z: number) => inBox(x, z, BAILEY);

/** The parterre's blossom trees' leaves and fallen petals: pink toward the keep, white toward the gate. */
const BLOSSOM = { pink: [0xf4a6c4, 0xf2b4c8], white: [0xf6f0ea, 0xf4ece0] };

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

/** The risers of each stair down from the terrace: the fewest the hero's stair rule allows, all one height. */
export const TERRACE_STAIR_RISERS = Math.ceil((TERRACE_Y - CROWN_Y) / STAIR_RULE.riserMax - 1e-6);

/** Is a cell (by its middle) on the terrace: the upper court and the keep's podium, to the curtain's inner cells? */
const onTerrace = (x: number, z: number) => TERRACE.parts.some(([x0, z0, x1, z1]) => inBox(x, z, [x0 - 0.5, z0 - 0.5, x1 + 0.5, z1]));

/**
 * The terrace and the stairs down from it, laid once the curtain stands (its inner cells along the
 * terrace take the terrace's fill against them): the upper court and the podium at TERRACE_Y, paved;
 * each stair built in steps from the terrace's edge down to its foot at the crown; and the retaining
 * wall round the terrace's edge, a cell thick, its coping a parapet over the paving, turning down
 * beside each stair as its cheek walls, which end on piers at the garden stairs' feet and in the
 * champions' plinths at the grand stair's.
 */
export function terrace(s: Site) {
  s.cells([BAILEY[0] - 1, BAILEY[1] - 1, BAILEY[2] + 1, TERRACE.parts[1][3]], (i, x, z) => {
    if (!onTerrace(x + 0.5, z + 0.5)) return;
    s.level[i] = TERRACE_Y;
    s.G.l.ground[i] = Ground.Stone;
    s.G.reserved[i] = 1;
  });
  // Each stair one flight of TERRACE_STAIR_RISERS risers (18 to 20 cm each) between its cheek walls, its treads
  // sharing its run: the grand stair's a stately going, the garden stairs' an easy one. The ground
  // under it runs just under the line through the treads' backs, from cell edge to cell edge.
  for (const st of TERRACE_STAIRS) {
    const run = st.z1 - st.z0, r = (TERRACE_Y - CROWN_Y) / TERRACE_STAIR_RISERS, g = run / TERRACE_STAIR_RISERS;
    s.prop('stair_flight', (st.x0 + st.x1) / 2, st.z1, 0, 0, { y: CROWN_Y, opt: { w: st.x1 - st.x0, run, n: TERRACE_STAIR_RISERS, r, g, lift: LIFT } });
    s.cells([st.x0, st.z0, st.x1, st.z1], (i, _x, z) => s.open(i, CROWN_Y + (Math.max(0, st.z1 - (z + 1)) * r) / g - 0.02, Ground.Stone));
  }
  // The retaining wall (west half, then its mirror): from the curtain along the terrace's edge to
  // the kitchen garden's stair, down its west cheek; from its east cheek along the edge round the
  // podium to the grand stair, down its west cheek.
  // (Its coping stands as high over the bailey at each stair's foot as over the terrace's paving.)
  const top = TERRACE.edgeTop, foot = CROWN_Y + TERRACE.edgeTop - TERRACE_Y;
  const [g, grand] = [TERRACE_STAIRS[1], TERRACE_STAIRS[0]], podium = TERRACE.parts[1], edge = TERRACE.parts[0][3] - 0.5;
  const runs: [number, number, number][][] = [
    [[BAILEY[0] + 0.3, edge, top], [g.x0 - 0.5, edge, top], [g.x0 - 0.5, g.z1 + 0.57, foot]],
    [[g.x1 + 0.5, g.z1 + 0.57, foot], [g.x1 + 0.5, edge, top], [podium[0] + 0.5, edge, top], [podium[0] + 0.5, podium[3] - 0.5, top], [grand.x0 - 0.5, podium[3] - 0.5, top], [grand.x0 - 0.5, grand.z1 + 0.7, foot]],
  ];
  for (const run of runs) for (const side of [-1, 1]) {
    const pts = run.map(([x, z, y]): [number, number, number] => [side < 0 ? x : mx(x), z, y]);
    s.wall(pts, CROWN_Y);
    // (A pier closes the cheek at each garden stair's foot, the wall's end buried in it and its base
    // clear of the bottom step; the grand
    // stair's cheeks end in the champions' plinths, flush with the stair's sides.)
    for (const e of [pts[0], pts[pts.length - 1]]) {
      if (e[2] !== foot) continue;
      if (Math.abs(e[0] - AXIS) < (grand.x1 - grand.x0) / 2 + 2) {
        // (Its plinth's shaft flush with the stair's side, standing clear of the stair's foot.)
        const cx = e[0] + Math.sign(e[0] - AXIS) * 0.55, cz = e[1] + 0.6;
        s.prop('champion', cx, cz, 0, 0, { y: CROWN_Y });
        s.blockRect(cx, cz, 1.3, 1.3, 0);
        // (The cour's paving runs on under the plinth's base, so no lawn shows round its foot.)
        s.cells([cx - 1.5, cz - 1.5, cx + 1.5, cz + 1.5], (i) => (s.G.l.ground[i] = Ground.Stone));
      } else s.prop('parapet_pier', e[0], e[1] + 0.15, 0, 0.6, { y: CROWN_Y });
    }
  }
}

/**
 * The walled gardens below the terrace, laid out on their own axes (the garden stairs'), the privy
 * garden the kitchen garden's mirror. Rectangles are [x0, z0, x1, z1] in the kitchen garden; the
 * privy garden takes each one mirrored.
 */
const GARDEN = {
  /** The wall's coping over the turf, its line on the garden's south and outer side (cell middles). */
  wallH: 3.5, south: 74.5, side: 57.5,
  /** The garden's axis (the stair's middle) and its cross axis: the well (the basin) where they cross. */
  x: (TERRACE_STAIRS[1].x0 + TERRACE_STAIRS[1].x1) / 2, z: 66,
  /** The gates: four metres wide on each axis, the side gate through to the cour. */
  gateW: 4,
  /**
   * The gravel: the broad walk from the stair's foot down the axis to the south gate (and through
   * it), the cross walk to the side gate, and its link across the lawn to the cour.
   */
  walks: [[41, 63, 47, 74], [42, 74, 46, 75], [BAILEY[0], 64, 58, 68], [58, 64, ZONES.cour[0], 68]] as Box[],
  /** The four quarters, each [cells, box border's centre line]. */
  quarters: [
    { cells: [BAILEY[0], 58, 40, 64], border: [30.65, 58.85, 39.5, 63.65] },
    { cells: [48, 58, 57, 64], border: [48.5, 58.85, 56.5, 63.65] },
    { cells: [BAILEY[0], 68, 41, 74], border: [30.65, 68.35, 40.65, 73.25] },
    { cells: [47, 68, 57, 74], border: [47.35, 68.35, 56.5, 73.25] },
  ] as { cells: Box; border: Box }[],
};

/** A rectangle mirrored about the main axis. */
const mbox = ([x0, z0, x1, z1]: Box): Box => [mx(x1), z0, mx(x0), z1];

/** The gravel under the privy garden's rose arbour, at the end of its cross walk against the curtain. */
const ARBOUR: Box = [138, 63, BAILEY[2], 69];

/**
 * The bailey's walks, courts and yards (paved, gravelled or beaten earth on the lawn).
 */
export function grounds(s: Site) {
  const below = (box: Box, g: Ground) => s.cells(box, (i, x, z) => {
    if (!onTerrace(x + 0.5, z + 0.5) && s.G.l.cells[i] === Cell.Ground) s.G.l.ground[i] = g;
  });
  for (const w of WALKS) below(w, Ground.Stone);
  for (const z of [ZONES.cour, ZONES.forecourt, ZONES.stableYard, ZONES.musterYard]) below(z, Ground.Stone);
  below(ZONES.trainingYard, Ground.Dirt);
  // The gardens' gravel walks, and the gravel under the privy garden's arbour.
  for (const w of GARDEN.walks) for (const b of [w, mbox(w)]) below(b, Ground.Path);
  below(ARBOUR, Ground.Path);
  s.G.clearing(FOUNTAIN.x, FOUNTAIN.z, FOUNTAIN.plaza, Ground.Stone, 0);
  // (The gate's passage, paved through the curtain.)
  s.pave([AXIS - 3, 128, AXIS + 3, 134]);
}

/** The private gardens and the paddock grow the longer garden lawn. */
export const GARDEN_LAWNS: Box[] = [ZONES.kitchenGarden, ZONES.privyGarden, ZONES.paddock];

/**
 * The bailey's dressing, from its centrepiece out: the dragon fountain at the crossing of the axes
 * in its plaza, a bench on each of the plaza's diagonals facing it; round it the parterre's four
 * lawn panels, each boxed in clipped box along its walks and round its arc, a blossom tree in its
 * outer corner, a lozenge bed of flowers in its lawn and clipped topiary at each end of its arc (a
 * tiered standard by the avenue, a spiral by the cross walk), the lawn inside planted (never
 * walked); lamps along the avenue. Then the grounds round it: the gardens, the yards, the paddock,
 * the training yard and the forecourt.
 */
export function centrepiece(s: Site) {
  const { G } = s;
  s.prop('dragon_fountain', FOUNTAIN.x, FOUNTAIN.z, 0, 7.7);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const x = FOUNTAIN.x + sx * 7.3, z = FOUNTAIN.z + sz * 7.3;
    s.prop('garden_bench', x, z, Math.atan2(FOUNTAIN.x - x, FOUNTAIN.z - z), 0.65, { s: GROW });
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
    // The blossom tree: pink on the panels toward the keep, white toward the gate.
    const blossom = sz < 0 ? BLOSSOM.pink : BLOSSOM.white;
    s.prop('garden_tree', ox - sx * 1.95, oz - sz * 1.95, 0, 0.45, { opt: { kind: 'tree', v: (sx + 1) / 2 + (sz + 1), s: 0.62, turn: sx * 0.9 + sz * 0.4, tint: blossom[0], petals: blossom[1] } });
    // The lozenge of flowers in the lawn, a little out from the panel's middle toward its outer corner.
    s.prop('parterre_bed', (x0 + x1) / 2 + sx * 1.3, (z0 + z1) / 2 + sz * 1.3, 0, 0, { v: sz < 0 ? 0 : 2, opt: { w: 7.3, d: 4.7 } });
    // (Topiary a clear step in from the border at each end of the arc.)
    const cx = ix + sx * 1.56, cz = iz + sz * 1.43;
    s.prop('topiary', cx, CROSS + sz * (Math.sqrt(R * R - (cx - AXIS) ** 2) + 2.1), 0, 0.65, { len: 4, s: GROW });
    s.prop('topiary', AXIS + sx * (Math.sqrt(R * R - (cz - CROSS) ** 2) + 2.1), cz, 0, 0.65, { len: 3, s: GROW });
  }
  // Round the fountain the panels' lawns end in a circle just under their box arcs: the plaza's
  // paving runs out to the arcs and the lawn grows over the cells the circle crosses.
  for (const [x0, z0, x1, z1] of ZONES.parterre) s.cells([x0, z0, x1, z1], (i, x, z) => {
    const r = Math.hypot(x + 0.5 - AXIS, z + 0.5 - CROSS);
    if (r < R) G.l.ground[i] = Ground.Stone;
  });
  // The kerb round the plaza under the arcs: in each quarter from the cross walk's kerb round the
  // circle to the avenue's kerb, on along it to where that kerb takes over at the lawn's circle.
  const xc = (WALKS[0][2] - WALKS[0][0]) / 2 - KERB_SET;
  const ring = s.prop('kerb_ring', FOUNTAIN.x, FOUNTAIN.z);
  ring.len = ARC_LAWN - KERB_SET;
  ring.opt = { d0: (WALKS[1][3] - WALKS[1][1]) / 2 - KERB_SET, x0: R, xc, d1: Math.sqrt(ARC_LAWN * ARC_LAWN - xc * xc), x1: xc };
  for (const [x, z] of LAMPS) s.prop('lamp_post', x, z, 0, 0.5, { s: GROW });
  gardens(s);
  yards(s);
  paddock(s);
  trainingYard(s);
  forecourt(s);
}

/**
 * The walled gardens: each walled on its south and outer side (the curtain and the terrace's
 * retaining wall close the others), a gate on each axis (into its yard on the south, across the lawn
 * to the cour on the side). The kitchen garden: four quarters boxed in clipped box and planted with
 * vegetables, fruit trees trained flat on its walls behind them, the well where the walks cross,
 * bee skeps at the end of the cross walk. The privy garden: its quarters lawn, a shade tree and a
 * bench in each upper one, flower beds in each lower one, a basin where the walks cross, the rose
 * arbour against the curtain at the end of the cross walk.
 */
function gardens(s: Site) {
  const top = CROWN_Y + GARDEN.wallH, W = GARDEN.gateW;
  for (const side of [-1, 1]) {
    const X = (x: number) => (side < 0 ? x : mx(x)), B = (b: Box) => (side < 0 ? b : mbox(b));
    const gx = X(GARDEN.x), sx = X(GARDEN.side), pier = W / 2 + 0.52;
    // The walls, each run's end buried in its gate's pier (the side run's in the terrace's wall).
    s.wall([[X(BAILEY[0] - 0.1), GARDEN.south, top], [gx + side * pier, GARDEN.south, top]], CROWN_Y);
    s.wall([[gx - side * pier, GARDEN.south, top], [sx, GARDEN.south, top], [sx, GARDEN.z + pier, top]], CROWN_Y);
    s.wall([[sx, GARDEN.z - pier, top], [sx, TERRACE.parts[0][3] - 0.1, top]], CROWN_Y);
    // The gates (their way out toward local +Z), standing open into the garden.
    s.prop('garden_gate', gx, GARDEN.south, 0, 0, { len: W, opt: { h: GARDEN.wallH } });
    s.prop('garden_gate', sx, GARDEN.z, -side * (Math.PI / 2), 0, { len: W, opt: { h: GARDEN.wallH } });
    for (const [x, z] of [[gx - pier, GARDEN.south], [gx + pier, GARDEN.south], [sx, GARDEN.z - pier], [sx, GARDEN.z + pier]]) s.blockRect(x, z, 0.55, 0.55, 0);
    // The quarters.
    GARDEN.quarters.forEach((q, n) => {
      const [x0, z0, x1, z1] = B(q.border), upper = n < 2;
      if (side < 0) {
        // Boxed beds of vegetables (never walked), fruit trained on the wall behind each.
        s.cells(B(q.cells), (i) => s.block(i));
        border(s, [[x0, z0], [x1, z0], [x1, z1], [x0, z1]], true);
        const w = x1 - x0 - 0.9, d = z1 - z0 - 0.9;
        s.prop('kitchen_bed', (x0 + x1) / 2, (z0 + z1) / 2, 0, 0, { v: [5, 4, 2, 0][n], opt: { w, d } });
        const [wx0, , wx1] = B(q.cells), wall = upper ? TERRACE.parts[0][3] : GARDEN.south - 0.5;
        for (const f of [0.27, 0.73]) s.prop('espalier', wx0 + 0.3 + (wx1 - wx0 - 0.6) * f, wall, upper ? 0 : Math.PI, 0, { len: Math.min(2.6, (wx1 - wx0 - 1.2) / 2), v: n % 2 });
      } else if (upper) {
        // A shade tree on the lawn, a bench before it facing the cross walk.
        const tx = gx + Math.sign((x0 + x1) / 2 - gx) * 8;
        s.prop('garden_tree', tx, z0 + 2.3, 0, 0.6, { opt: { kind: 'maple', v: n === 0 ? 0 : 3, s: 0.52, turn: n * 2.1 } });
        s.prop('garden_bench', tx, z1 - 0.55, 0, 0, { s: GROW });
        s.blockRect(tx, z1 - 0.55, 1.45, 0.4, 0);
      } else {
        // Two flower beds, roses before delphiniums, clear of the arbour's gravel.
        const cx = gx + Math.sign((x0 + x1) / 2 - gx) * 6.2;
        for (const [z, v] of [[z0 + 1.35, 1], [z0 + 3.55, 3]]) {
          s.prop('flower_bed', cx, z, 0, 0, { len: 4.7, v });
          s.blockRect(cx, z, 2.35, 0.65, 0);
        }
      }
    });
    if (side < 0) {
      s.prop('well', gx, GARDEN.z, 0, 0, { s: GROW });
      s.blockRect(gx, GARDEN.z, 1.5, 1.5, 0);
      s.prop('skeps', BAILEY[0] + 0.55, GARDEN.z, Math.PI / 2, 0);
      s.blockRect(BAILEY[0] + 0.55, GARDEN.z, 0.45, 1.0, 0);
    } else {
      s.prop('garden_basin', gx, GARDEN.z, 0, 1.45);
      s.prop('pergola', BAILEY[2] - 1.85, GARDEN.z, -Math.PI / 2, 0, { s: GROW });
      // (Its posts stand on the gravel's first and last rows; the walk runs on in under its front
      // arch to the seat.)
      s.cells(ARBOUR, (i, x, z) => {
        if (z === ARBOUR[1] || z === ARBOUR[3] - 1 || x > ARBOUR[0]) s.block(i);
      });
    }
  }
  // Yews flanking each garden's walk where it leaves the cour.
  for (const side of [-1, 1]) for (const z of [GARDEN.walks[2][1] - 0.8, GARDEN.walks[2][3] + 0.8]) {
    const x = side < 0 ? ZONES.cour[0] - 3.6 : mx(ZONES.cour[0] - 3.6);
    s.prop('topiary', x, z, 0, 0.65, { len: 5, s: GROW });
  }
}

/** Half the width of a field gate between its piers (gate_piers, grown with the castle). */
const GATE_HALF = 1.25 * GROW;
/** The stables' and the barracks' doors on the cross axis (rangeSpecs.ts): three metres wide, five cells from their north corners. */
const RANGE_DOOR = 3, RANGE_DOOR_AT = 5;

/** A post-and-rail fence from (x0, z0) to (x1, z1), set exactly as drawn, blocking the cells its line crosses. */
function fence(s: Site, x0: number, z0: number, x1: number, z1: number) {
  const L = Math.hypot(x1 - x0, z1 - z0);
  s.prop('fence', (x0 + x1) / 2, (z0 + z1) / 2, Math.atan2(-(z1 - z0), x1 - x0)).len = L;
  const n = Math.ceil(L / 0.1);
  for (let k = 0; k <= n; k++) s.block(s.G.idx(Math.floor(x0 + ((x1 - x0) * k) / n), Math.floor(z0 + ((z1 - z0) * k) / n)));
}

/**
 * The yards either side of the gardens' south gates: the stable yard before the stall doors (the
 * trough against the stable wall, a mounting block, a hand cart and barrels by the curtain) and the
 * muster yard before the barracks (the well, weapon racks against the curtain), the walk between
 * each garden gate and the building before it kept clear; a lamp either side of the stables' and
 * the barracks' doors on the side walks.
 */
function yards(s: Site) {
  const [yx0, yz0, yx1] = ZONES.stableYard, door = RANGE.stables[1] - 0.6;
  s.prop('fit_trough', RANGE.stables[0] + 10.5, door - 0.2, 0, 0, { s: GROW });
  s.blockRect(RANGE.stables[0] + 10.5, door - 0.2, 1.17, 0.45, 0);
  s.prop('mounting_block', yx1 - 2.1, door - 1.2, -Math.PI / 2, 0, { s: GROW });
  s.blockRect(yx1 - 2.1, door - 1.2, 0.8, 0.8, 0);
  s.prop('cart', yx0 + 4.6, yz0 + 3.6, 0.35, 0.9);
  s.prop('barrels', yx0 + 1.4, door - 0.7, 0, 0.6);
  const well = { x: mx(yx0 + 5.6), z: yz0 + 4.7 };
  s.prop('well', well.x, well.z, Math.PI / 2, 0, { s: GROW });
  s.blockRect(well.x, well.z, 1.5, 1.5, 0);
  // (Clear of the wall tower's drum, which stands out into the yard between them.)
  const tower = TOWERS.find((t) => t.id === 'wall-E2')!;
  for (const z of [tower.z - 3, tower.z + 3]) {
    s.prop('arms_rack', BAILEY[2] - 1.7, z, -Math.PI / 2, 0, { s: GROW });
    s.blockRect(BAILEY[2] - 1.7, z, 0.52, 1.37, 0);
  }
  s.prop('barrels', mx(yx1 - 2.1), door - 1.3, 0.4, 0.6);
  // (A lamp either side of each door on the side walks.)
  const half = RANGE_DOOR / 2 + 1, dz = RANGE.stables[1] + RANGE_DOOR_AT + RANGE_DOOR / 2;
  for (const x of [WALKS[4][0] + 1.8, mx(WALKS[4][0] + 1.8)]) for (const z of [dz - half, dz + half]) s.prop('lamp_post', x, z, 0, 0.5, { s: GROW });
}

/**
 * The paddock behind the stables, three times today's: the curtain and the stables close three
 * sides, a post-and-rail fence the open east side, its field gate on the south walk's line; a big
 * oak in the far corner for shade, the hay rack against the stables, the water trough by the fence,
 * and the horses out on the grass, grazing or standing about.
 */
function paddock(s: Site) {
  const [x0, z0, x1, z1] = ZONES.paddock, fx = x1 - 0.5, gz = (WALKS[3][1] + WALKS[3][3]) / 2;
  fence(s, fx, z0 + 0.5, fx, gz - GATE_HALF);
  // (The fence stops at the foot of the wall tower's drum, which closes the last metre.)
  fence(s, fx, gz + GATE_HALF, fx, z1 - 1.1);
  s.cells([fx - 0.5, z1 - 1.1, fx + 0.5, z1], (i) => s.block(i));
  s.prop('gate_piers', fx, gz, Math.PI / 2, 0, { s: GROW });
  for (const sz of [-1, 1]) s.blockRect(fx, gz + sz * GATE_HALF, 0.52, 0.52, 0);
  s.prop('garden_tree', x0 + 6.5, z1 - 7.3, 0, 0.7, { opt: { kind: 'oak', v: 1, s: 0.7, turn: 0.8 } });
  s.prop('hay_rack', x1 - 5.5, z0 + 1.3, 0, 0);
  s.blockRect(x1 - 5.5, z0 + 1.3, 1.0, 0.45, 0);
  s.prop('field_trough', fx - 2.9, gz + 8.5, Math.PI / 2, 0);
  s.blockRect(fx - 2.9, gz + 8.5, 0.4, 1.1, 0);
  // (Across the paddock, each [x, z] from its north-west corner.)
  for (const [x, z, rot, v, graze] of [[14.4, 8.1, 1.3, 0, 0], [8.4, 14.8, -0.7, 2, 1], [18.8, 20.3, 2.5, 1, 1], [12, 26.3, -2.1, 0, 1], [8.4, 21.6, 0.6, 1, 0]]) {
    // (Full-sized horses, a little bigger than the stables' own, standing a head over the hero.)
    s.prop('horse', x0 + x, z0 + z, rot, 0, { len: graze, v, s: 1.15 });
    s.blockRect(x0 + x, z0 + z, 0.45, 1.25, rot);
  }
}

/**
 * The training yard, the paddock's mirror on beaten earth, fenced on its open west side with its
 * gate on the south walk's line: beyond the gate the archery ground, its shooting line along the
 * lane in from the gate and three butts before the barracks; south of it the lists, two rows of
 * pells either side of a lane; arms racks along the fence.
 */
function trainingYard(s: Site) {
  const [x0, z0, x1, z1] = ZONES.trainingYard, fx = x0 + 0.5, gz = (WALKS[3][1] + WALKS[3][3]) / 2;
  fence(s, fx, z0 + 0.5, fx, gz - GATE_HALF);
  // (The fence stops at the foot of the wall tower's drum, which closes the last metre.)
  fence(s, fx, gz + GATE_HALF, fx, z1 - 1.1);
  s.cells([fx - 0.5, z1 - 1.1, fx + 0.5, z1], (i) => s.block(i));
  s.prop('gate_piers', fx, gz, -Math.PI / 2, 0, { s: GROW });
  for (const sz of [-1, 1]) s.blockRect(fx, gz + sz * GATE_HALF, 0.52, 0.52, 0);
  s.prop('shooting_line', (x0 + x1) / 2 + 1.3, gz - 1.4, Math.PI, 0, { len: 21.5 });
  for (const x of [7.15, 13.65, 20.15]) s.prop('target', x0 + x, z0 + 2.9, 0, 0.8, { s: GROW });
  const lists = gz + 9.75;
  for (const x of [6.5, 11.7, 16.9, 22.1]) for (const sz of [-1, 1]) s.prop('pell', x0 + x, lists + sz * 2.6, 0, 0.5, { s: GROW });
  for (const z of [gz + 4.4, gz + 15.1]) {
    s.prop('arms_rack', fx + 1.4, z, Math.PI / 2, 0, { s: GROW });
    s.blockRect(fx + 1.4, z, 0.52, 1.43, 0);
  }
}

/**
 * The forecourt inside the gate: an avenue of tall clipped yews in planters along each side of its
 * paving, and on the lawn either side a tree in full leaf.
 */
function forecourt(s: Site) {
  const [x0, z0, x1] = ZONES.forecourt;
  for (const z of [3.3, 7.2, 11.1, 15]) for (const x of [x0 + 1.3, x1 - 1.3]) s.prop('topiary', x, z0 + z, 0, 0.65, { len: 5, s: GROW });
  for (const side of [-1, 1]) s.prop('garden_tree', side < 0 ? 66 : mx(66), z0 + 8.5, 0, 0.6, { opt: { kind: 'tree', v: side < 0 ? 0 : 2, s: 0.8, turn: side * 1.3 } });
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
