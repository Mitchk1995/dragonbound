import type { Vec2 } from '../../types';

/**
 * Castle v4, the great keep: the approved plan's numbers (docs/blueprints/castle-v4/design.json),
 * in island cells (1 cell = 1 m; x east, z south). A rectangle is [x0, z0, x1, z1] in cell edges.
 * Heights are world heights; the crown (the bailey's turf) stands at CROWN_Y. Everything the castle
 * modules lay out reads from here, so the plan is stated once.
 */

export type Box = [number, number, number, number];

/** The crown's level (the bailey's turf) and the upper court's (the terrace), world heights. */
export const CROWN_Y = 11;
export const TERRACE_Y = CROWN_Y + 2;

/** The main axis (the gate, the fountain and the great door stand on it) and the cross axis. */
export const AXIS = 76;
export const CROSS = 70;

/** Mirror a point's x about the main axis. Cell column x mirrors onto MIRROR_CELL - x. */
export const mx = (x: number) => 2 * AXIS - x;
export const MIRROR_CELL = 2 * AXIS - 1;

/**
 * The curtain: one rectangle round the bailey on these centre lines, its north face broken by the
 * keep (the north runs meet the keep's flanks square). The wall walk's deck at CROWN_Y + 7.06.
 */
export const CURTAIN = { west: 32, east: 120, north: 21, south: 100, T: 2.2 };
/** The curtain's runs, each [a, b] along its centre line; the keep stands between the two north runs. */
export const CURTAIN_RUNS: [Vec2, Vec2][] = [
  [{ x: 32, z: 21 }, { x: 64, z: 21 }],
  [{ x: 88, z: 21 }, { x: 120, z: 21 }],
  [{ x: 120, z: 21 }, { x: 120, z: 100 }],
  [{ x: 120, z: 100 }, { x: 32, z: 100 }],
  [{ x: 32, z: 100 }, { x: 32, z: 21 }],
];
/** The curtain's corners, clockwise from the north-west. */
export const CURTAIN_CORNERS: Vec2[] = [{ x: 32, z: 21 }, { x: 120, z: 21 }, { x: 120, z: 100 }, { x: 32, z: 100 }];
/** Inside the curtain's inner faces: the bailey and the terrace. */
export const BAILEY: Box = [33.1, 22.1, 118.9, 98.9];

/**
 * The twelve towers, evenly spaced and mirrored: a corner tower at each corner (a stage taller,
 * spired), three wall towers on the west and east faces and two on the south, all standing out
 * into the moat. `H`: the drum's height to the walk's storey (its platform at H + 1.4 over its foot).
 */
export const TOWERS: { id: string; x: number; z: number; r: number; H: number; corner: boolean }[] = [
  { id: 'corner-NW', x: 30, z: 19, r: 3.8, H: 12, corner: true },
  { id: 'corner-NE', x: 122, z: 19, r: 3.8, H: 12, corner: true },
  { id: 'corner-SW', x: 30, z: 102, r: 3.8, H: 12, corner: true },
  { id: 'corner-SE', x: 122, z: 102, r: 3.8, H: 12, corner: true },
  // (The wall towers stand 1.7 out from the wall's line, 0.5 in from the plan's 2.2, so the wall's
  // inner face dies into the drum as everywhere else and the walk's doorways fit in the drum.)
  ...[40.75, 60.5, 80.25].flatMap((z, i) => [
    { id: `wall-W${i + 1}`, x: 30.3, z, r: 3.2, H: 11.2, corner: false },
    { id: `wall-E${i + 1}`, x: 121.7, z, r: 3.2, H: 11.2, corner: false },
  ]),
  { id: 'wall-S1', x: 53, z: 101.7, r: 3.2, H: 11.2, corner: false },
  { id: 'wall-S2', x: 99, z: 101.7, r: 3.2, H: 11.2, corner: false },
];

/** Today's gatehouse on the axis in the south run: its drums 6 either side, a passage 4 wide. */
export const GATE = { x: AXIS, z: 100, pass: 4 };

/**
 * The great keep: 24 m square on the axis, its front half on the terrace and its back half out over
 * the moat behind the curtain, its floor at the terrace's level, its battlements at CROWN_Y + 28.
 */
export const KEEP = { rect: [64, 15, 88, 39] as Box, floor: TERRACE_Y, top: CROWN_Y + 28, door: { x: AXIS, z: 39, w: 4 } };

/**
 * The terrace (the upper court) at TERRACE_Y: from the north curtain to a retaining wall at z 44,
 * the keep's podium standing out on the axis to z 48 to carry the grand stair. Its edge is a
 * retaining wall carrying a parapet 1 m over the paving, open only where the three stairs come up.
 */
export const TERRACE = {
  parts: [[33.1, 22.1, 118.9, 44], [60, 44, 92, 48]] as Box[],
  edgeTop: TERRACE_Y + 1,
};

/**
 * The stairs down from the terrace: the grand stair on the axis (12 m wide, 12 risers between cheek
 * walls) and the two garden stairs (5 m wide), each [x0, x1] across it, from its head at `z0` on
 * the terrace's edge down to its foot at `z1` in the bailey.
 */
export const TERRACE_STAIRS = [
  { id: 'grand-stair', x0: 70, x1: 82, z0: 48, z1: 53.5 },
  { id: 'kitchen-garden-stair', x0: 41, x1: 46, z0: 44, z1: 47.63 },
  { id: 'privy-garden-stair', x0: 106, x1: 111, z0: 44, z1: 47.63 },
];

/**
 * The buildings round the keep, each [x0, z0, x1, z1) in whole cells: the north range on the terrace
 * (the kitchen, the great hall, the keep, the chapel and the solar, sharing their party walls), and
 * the stables and the barracks facing each other across the bailey on the cross axis.
 */
export const RANGE = {
  kitchen: [34, 23, 44, 36] as Box,
  hall: [43, 23, 65, 36] as Box,
  chapel: [87, 23, 109, 36] as Box,
  solar: [108, 23, 118, 36] as Box,
  stables: [33, 65, 54, 75] as Box,
  barracks: [98, 65, 119, 75] as Box,
};

/** The bailey's grounds below the terrace. */
export const ZONES = {
  kitchenGarden: [33.1, 44, 54, 57] as Box,
  privyGarden: [98, 44, 118.9, 57] as Box,
  stableYard: [33.1, 57, 54, 65] as Box,
  musterYard: [98, 57, 118.9, 65] as Box,
  paddock: [33.1, 75, 54, 98.9] as Box,
  trainingYard: [98, 75, 118.9, 98.9] as Box,
  cour: [62, 48, 90, 57] as Box,
  forecourt: [64, 86, 88, 98.9] as Box,
  /** The four lawn panels of the parterre round the fountain plaza, each cut back in an arc. */
  parterre: [[57, 57, 73, 68], [57, 72, 73, 83], [79, 57, 95, 68], [79, 72, 95, 83]] as Box[],
};

/** The walks: the avenue on the axis, the cross walk, and the walks round the parterre. */
export const WALKS: Box[] = [
  [73, 54, 79, 101.1],
  [54, 68, 98, 72],
  [54, 54, 98, 57],
  [54, 83, 98, 86],
  [54, 54, 57, 86],
  [95, 54, 98, 86],
];

/** The dragon fountain at the crossing of the axes, its plaza, and the arc the parterre is cut back to. */
export const FOUNTAIN = { x: AXIS, z: CROSS, plaza: 9, arc: 10 };

/** Lamp posts along the avenue. */
export const LAMPS: [number, number][] = [[72.3, 55.5], [79.7, 55.5], [72.3, 84.5], [79.7, 84.5], [72.3, 90], [79.7, 90], [72.3, 96], [79.7, 96]];

/**
 * The moat: its outer bank (the counterscarp) as a loop round the west, north and east, closed along
 * the ledge road at z 109; it widens into a basin behind the keep. Its water stands 2 m under the
 * crown and its bed 4.2 m under it (MOAT.surface, MOAT.bed).
 */
export const MOAT = {
  counterscarp: [[24.4, 109], [24.4, 16.4], [27.4, 13.4], [51, 13.4], [57.5, 6], [94.5, 6], [101, 13.4], [124.6, 13.4], [127.6, 16.4], [127.6, 109]] as [number, number][],
  surface: CROWN_Y - 2,
  bed: CROWN_Y - 4.2,
};

/**
 * The bridge from the gate terrace to the gate: its deck 4 clear between parapets on its two edges,
 * walked at the crown's level. It stands on two round arches either side of a pier in the moat's
 * middle (pointed cutwaters east and west, where the water comes from), the arches springing just
 * over the water from abutments against the gate's threshold and the terrace's bank.
 */
// (Its parapets start half a metre out from the gatehouse's face, clear of its drums' footings.)
export const BRIDGE = {
  x0: 73.5, x1: 78.5, z0: 102.4, z1: 109, deck: [74, 78] as [number, number],
  /** Its two arches, each [z0, z1] between the abutments and the pier, and the arches' springing. */
  arches: [[103, 105], [106, 108]] as [number, number][],
  spring: MOAT.surface + 0.2,
};

/** The approach: everything from the stair's head to the gate is level with the crown. */
export const APPROACH = {
  /** The gate terrace before the bridge, its bastion projecting over the brink (rows z 116 on). */
  gateTerrace: [66, 109, 86, 119.5] as Box,
  /**
   * The gate terrace's bastion: battered masonry on the rock at the cliff's foot (world 0), its top
   * the terrace's edge on west, south and east (`rect`: the faces at the top, its back in the rock),
   * leaning out `batter` per metre down; the culvert's arch in its south face on the axis, its sill
   * just under the moat's water (the moat pours out of it as the fall to the pool).
   */
  bastion: { rect: [65.85, 118, 86.15, 120.15] as Box, batter: 1 / 10, culvert: { w: 2, sill: MOAT.surface - 0.2 } },
  ledgeRoad: [86, 109, 114, 114.6] as Box,
  ledgeWalk: [34, 109, 66, 114.6] as Box,
  /** The walled terrace at the stair's head over the court, and the lookout on the south-west knoll. */
  landing: [[113.9, 109], [132.4, 109], [131.9, 111.2], [130.4, 115.4], [118.1, 115.4], [118.1, 116], [113.9, 116]] as [number, number][],
  lookout: [[21.9, 109], [43, 109], [43, 114.6], [40, 115.2], [37, 117], [33.6, 118.9], [29, 120.6], [25, 119.8], [22.3, 117], [21.5, 112.5]] as [number, number][],
  /** The crown-level parapets: on the moat's outer bank (straight) and along the brink (following it). */
  parapets: {
    innerWest: [[21.6, 109.5], [73.5, 109.5]] as [number, number][],
    innerEast: [[78.5, 109.5], [132.3, 109.5]] as [number, number][],
    outerWest: [[21.6, 109.5], [21.2, 112.5], [22, 117.2], [24.8, 120.2], [29, 121], [34, 119.2], [40, 117.6], [46, 118.2], [53, 117.2], [60, 118], [66.6, 116.8], [66.6, 119.4], [76, 119.4]] as [number, number][],
    outerEast: [[76, 119.4], [85.4, 119.4], [85.4, 116.6], [90, 117.2], [97, 116.4], [104, 117], [110, 116.2], [113.5, 115.4]] as [number, number][],
    landing: [[118.1, 114.4], [130.2, 114.4], [132.3, 109.5]] as [number, number][],
  },
  /** Lanterns on the parapets' piers (each on the pier nearest its point): the lookout, the ledge walk and road, the landing, the stair's head. */
  lamps: [[29, 121], [26, 109.3], [46, 118.2], [104, 117], [124.4, 114.4], [126, 109.3], [118.1, 114.4]] as [number, number][],
  /** Stone benches looking out over the parapets, [x, z, the way each faces]. */
  benches: [[27.4, 116.6, 0.55], [123.5, 113.3, 0]] as [number, number, number][],
  /** The two banner poles at the bridge's foot on the gate terrace. */
  banners: [[71, 110.6], [81, 110.6]] as [number, number][],
};

/**
 * The climb from the ore lane (world 0) to the ledge (CROWN_Y): four straight flights of 17 risers
 * (16.2 cm) and 16 treads (28 cm), two north up the rock's south-east corner to the turning landing,
 * two west along its face, with level landings between them. Each flight climbs from `y0` at its foot
 * (the rectangle's downhill edge, where its first riser stands) to `y1` at its head, toward `up`;
 * rectangles are whole cells (the flights 4 m wide between walls a cell thick, each flight's last half
 * metre its head's landing).
 */
export const CLIMB = {
  risers: 17,
  tread: 0.28,
  flights: [
    { rect: [129, 126, 133, 131], up: 'n', y0: 0, y1: 2.75 },
    { rect: [129, 120, 133, 125], up: 'n', y0: 2.75, y1: 5.5 },
    { rect: [124, 116, 129, 120], up: 'w', y0: 5.5, y1: 8.25 },
    { rect: [118, 116, 123, 120], up: 'w', y0: 8.25, y1: 11 },
  ] as { rect: Box; up: 'n' | 's' | 'e' | 'w'; y0: number; y1: number }[],
  landings: [
    { rect: [129, 125, 133, 126] as Box, y: 2.75 },
    { rect: [129, 116, 133, 120] as Box, y: 5.5 },
    { rect: [123, 116, 124, 120] as Box, y: 8.25 },
    { rect: [114, 115, 118, 120] as Box, y: 11 },
  ],
  /**
   * Its walls, a cell thick, standing on the lane, along the centre of their cells: a pier at every
   * point (each pier where a coping changes pitch; one long pier across each short landing), the
   * copings raking with the flights and level over the landings. The west run climbs from the lane
   * beside the flights and turns along their outer side to the head; the east run, on the court
   * side, ends against the dressed rock face over the turning landing.
   */
  walls: [
    [[128.5, 131], [128.5, 125.76], [128.5, 120.5], [123.76, 120.5], [118.52, 120.5], [113.5, 120.5], [113.5, 115.4]],
    [[133.5, 131], [133.5, 125.76], [133.5, 120.52], [133.5, 116.6]],
  ] as [number, number][][],
  /** Buttresses on the outer face of the tall south wall, between its piers. */
  buttresses: [126.23, 121.04, 116.01],
  /**
   * The dressed rock face over flights 3 and 4 and the turning landing, a cell thick along its middle
   * (z), from its west end at the head to the east wall's outer face, where it comes down to the lane
   * as the corner of the east wall.
   */
  face: { z: 115.5, x0: 118.52, x1: 134 },
};

/** The crown's natural edge (the rock round the moat, the ledge and the knolls), at CROWN_Y. */
export const CROWN_OUTLINE: [number, number][] = [
  [21.5, 11], [27, 8.2], [36, 6.8], [46, 5], [54, 3.2], [64, 2.4], [76, 2], [88, 2.4], [97, 3.2], [103, 7], [112, 8], [122, 9.6], [130.5, 12.6],
  [132.4, 20], [131.6, 30], [133.2, 40], [132, 50], [133.6, 58], [132.2, 68], [131.4, 78], [132.8, 88], [132, 98], [133.2, 105], [132.6, 111],
  [131, 116], [114, 116], [110, 116.6], [104, 117.4], [97, 116.8], [90, 117.6], [86, 117], [66, 117.2], [60, 118.4], [53, 117.6], [46, 118.6],
  [40, 118], [34, 119.6], [29, 121.4], [24.5, 120.6], [21.6, 117.4], [20.8, 112.5], [21.4, 107], [20.6, 100], [21.8, 90], [20.8, 80], [21.6, 70],
  [20.6, 60], [21.4, 50], [20.9, 40], [21.2, 30], [20.6, 20],
];

/** Below the rock: the pool the south fall pours into, the stream from it, the west fall's sluice. */
export const WATER = {
  southFall: { x: AXIS, z: 119.5, top: CROWN_Y - 2.2 },
  pool: { x: AXIS, z: 123.5, r: 3.6 },
  stream: [[76, 123.5], [83, 126], [91, 128.5], [96.5, 133], [98, 138], [97, 152], [94, 166], [90, 176], [84, 186], [79, 194]] as [number, number][],
  westFall: { x: 20.8, z: 81 },
};

/** The farm at the rock's foot, moved 8 m south: the paddock's fence and the vegetable plots. */
export const FARM = { fence: [44, 126, 58.4, 138.4] as Box, gate: 51, plotsX: [58, 62, 66, 70], plotsZ: [133, 137, 144, 148] };
