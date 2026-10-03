import type { Vec2 } from '../../types';

/**
 * Castle v4, the great keep: the approved plan (docs/blueprints/castle-v4/design.json) grown 1.3×
 * about the castle's middle (Mitchell's pick B, October 3), in island cells (1 cell = 1 m; x east,
 * z south). A rectangle is [x0, z0, x1, z1] in cell edges. The stone blocks keep their size (more
 * courses, not bigger stones), so every building's length and depth is a whole number of metres and
 * every wall height, sill, head, parapet and floor line a multiple of half a metre; the stairs and the
 * doors are sized to the hero. Heights are world heights; the crown (the bailey's turf) stands at
 * CROWN_Y. Everything the castle modules lay out reads from here, so the plan is stated once.
 */

export type Box = [number, number, number, number];

/** How much the castle grew from the v4 plan as first built: its fittings (benches, lamps, racks) grow with it. */
export const GROW = 1.3;

/** The crown's level (the bailey's turf) and the upper court's (the terrace), world heights. */
export const CROWN_Y = 11;
export const TERRACE_Y = CROWN_Y + 2.5;

/** The main axis (the gate, the fountain and the great door stand on it) and the cross axis. */
export const AXIS = 86;
export const CROSS = 92;

/** Mirror a point's x about the main axis. Cell column x mirrors onto MIRROR_CELL - x. */
export const mx = (x: number) => 2 * AXIS - x;
export const MIRROR_CELL = 2 * AXIS - 1;

/**
 * The curtain: one rectangle round the bailey on these centre lines, its north face broken by the
 * keep (the north runs meet the keep's flanks square). The wall walk's deck at CROWN_Y + 9.06.
 */
export const CURTAIN = { west: 29, east: 143, north: 28, south: 131, T: 2.2 };
/** The curtain's runs, each [a, b] along its centre line; the keep stands between the two north runs. */
export const CURTAIN_RUNS: [Vec2, Vec2][] = [
  [{ x: 29, z: 28 }, { x: 70, z: 28 }],
  [{ x: 102, z: 28 }, { x: 143, z: 28 }],
  [{ x: 143, z: 28 }, { x: 143, z: 131 }],
  [{ x: 143, z: 131 }, { x: 29, z: 131 }],
  [{ x: 29, z: 131 }, { x: 29, z: 28 }],
];
/** The curtain's corners, clockwise from the north-west. */
export const CURTAIN_CORNERS: Vec2[] = [{ x: 29, z: 28 }, { x: 143, z: 28 }, { x: 143, z: 131 }, { x: 29, z: 131 }];
/** Inside the curtain's inner faces: the bailey and the terrace. */
export const BAILEY: Box = [30.1, 29.1, 141.9, 129.9];

/**
 * The twelve towers, evenly spaced and mirrored: a corner tower at each corner (a stage taller,
 * spired), three wall towers on the west and east faces and two on the south, all standing out
 * into the moat. `H`: the drum's height to the walk's storey (its platform at H + 1.4 over its foot).
 */
export const TOWERS: { id: string; x: number; z: number; r: number; H: number; corner: boolean }[] = [
  { id: 'corner-NW', x: 26.4, z: 25.4, r: 4.9, H: 15.5, corner: true },
  { id: 'corner-NE', x: 145.6, z: 25.4, r: 4.9, H: 15.5, corner: true },
  { id: 'corner-SW', x: 26.4, z: 133.6, r: 4.9, H: 15.5, corner: true },
  { id: 'corner-SE', x: 145.6, z: 133.6, r: 4.9, H: 15.5, corner: true },
  // (The wall towers stand 2.6 out from the wall's line, so the wall's inner face dies into the drum
  // as everywhere else and the walk's doorways fit in the drum.)
  ...[53.75, 79.5, 105.25].flatMap((z, i) => [
    { id: `wall-W${i + 1}`, x: 26.4, z, r: 4.2, H: 14.5, corner: false },
    { id: `wall-E${i + 1}`, x: 145.6, z, r: 4.2, H: 14.5, corner: false },
  ]),
  { id: 'wall-S1', x: 56, z: 133.6, r: 4.2, H: 14.5, corner: false },
  { id: 'wall-S2', x: 116, z: 133.6, r: 4.2, H: 14.5, corner: false },
];

/** The gatehouse on the axis in the south run: its drums either side (GATEHOUSE), a passage 6 wide. */
export const GATE = { x: AXIS, z: 131, pass: 6 };

/**
 * The great keep: 32 m square on the axis, its front half on the terrace and its back half out over
 * the moat behind the curtain, its floor at the terrace's level, its battlements at CROWN_Y + 36.5.
 */
export const KEEP = { rect: [70, 20, 102, 52] as Box, floor: TERRACE_Y, top: CROWN_Y + 36.5, door: { x: AXIS, z: 52, w: 6 } };

/**
 * The terrace (the upper court) at TERRACE_Y: from the north curtain to a retaining wall at z 58,
 * the keep's podium standing out on the axis to z 63 to carry the grand stair. Its edge is a
 * retaining wall carrying a parapet 1.5 m over the paving, open only where the three stairs come up.
 */
export const TERRACE = {
  parts: [[30.1, 29.1, 141.9, 58], [64, 58, 108, 63]] as Box[],
  edgeTop: TERRACE_Y + 1.5,
};

/**
 * The stairs down from the terrace: the grand stair on the axis (16 m wide, 12 risers between cheek
 * walls) and the two garden stairs (6 m wide), each [x0, x1] across it, from its head at `z0` on
 * the terrace's edge down to its foot at `z1` in the bailey.
 */
export const TERRACE_STAIRS = [
  { id: 'grand-stair', x0: 78, x1: 94, z0: 63, z1: 70.2 },
  { id: 'kitchen-garden-stair', x0: 41, x1: 47, z0: 58, z1: 62.7 },
  { id: 'privy-garden-stair', x0: 125, x1: 131, z0: 58, z1: 62.7 },
];

/**
 * The buildings round the keep, each [x0, z0, x1, z1) in whole cells: the north range on the terrace
 * (the kitchen, the great hall, the keep, the chapel and the solar, sharing their party walls), and
 * the stables and the barracks facing each other across the bailey on the cross axis.
 */
export const RANGE = {
  kitchen: [31, 30, 43, 47] as Box,
  hall: [42, 30, 71, 47] as Box,
  chapel: [101, 30, 130, 47] as Box,
  solar: [129, 30, 141, 47] as Box,
  stables: [30, 85, 58, 98] as Box,
  barracks: [114, 85, 142, 98] as Box,
};

/** The bailey's grounds below the terrace. */
export const ZONES = {
  kitchenGarden: [30.1, 58, 58, 75] as Box,
  privyGarden: [114, 58, 141.9, 75] as Box,
  stableYard: [30.1, 75, 58, 85] as Box,
  musterYard: [114, 75, 141.9, 85] as Box,
  paddock: [30.1, 98, 58, 129.9] as Box,
  trainingYard: [114, 98, 141.9, 129.9] as Box,
  cour: [67, 63, 105, 75] as Box,
  forecourt: [70, 113, 102, 129.9] as Box,
  /** The four lawn panels of the parterre round the fountain plaza, each cut back in an arc. */
  parterre: [[62, 75, 82, 89], [62, 95, 82, 109], [90, 75, 110, 89], [90, 95, 110, 109]] as Box[],
};

/** The walks: the avenue on the axis, the cross walk, and the walks round the parterre. */
export const WALKS: Box[] = [
  [82, 71, 90, 132.1],
  [58, 89, 114, 95],
  [58, 71, 114, 75],
  [58, 109, 114, 113],
  [58, 71, 62, 113],
  [110, 71, 114, 113],
];

/** The dragon fountain at the crossing of the axes, its plaza, and the arc the parterre is cut back to. */
export const FOUNTAIN = { x: AXIS, z: CROSS, plaza: 12, arc: 13 };

/** Lamp posts along the avenue. */
export const LAMPS: [number, number][] = [[81.3, 73], [90.7, 73], [81.3, 111], [90.7, 111], [81.3, 118], [90.7, 118], [81.3, 125.5], [90.7, 125.5]];

/**
 * The moat: its outer bank (the counterscarp) as a loop round the west, north and east, closed along
 * the ledge road at z 142; it widens into a basin behind the keep. Its water stands 2.5 m under the
 * crown and its bed 5.5 m under it (MOAT.surface, MOAT.bed).
 */
export const MOAT = {
  counterscarp: [[19.4, 142], [19.4, 21.4], [23.4, 17.4], [52.6, 17.4], [61.6, 8.4], [110.4, 8.4], [119.4, 17.4], [148.6, 17.4], [152.6, 21.4], [152.6, 142]] as [number, number][],
  surface: CROWN_Y - 2.5,
  bed: CROWN_Y - 5.5,
};

/**
 * The bridge from the gate terrace to the gate: its deck 6 clear between parapets on its two edges,
 * walked at the crown's level. It stands on two round arches either side of a pier in the moat's
 * middle (pointed cutwaters east and west, where the water comes from), the arches springing just
 * over the water from abutments against the gate's threshold and the terrace's bank.
 */
// (Its parapets start half a metre out from the gatehouse's face, clear of its drums' footings.)
export const BRIDGE = {
  x0: 82.5, x1: 89.5, z0: 133.4, z1: 142, deck: [83, 89] as [number, number],
  /** Its two arches, each [z0, z1] between the abutments and the pier, and the arches' springing. */
  arches: [[134, 137], [138, 141]] as [number, number][],
  spring: MOAT.surface + 0.2,
};

/** The approach: everything from the stair's head to the gate is level with the crown. */
export const APPROACH = {
  /** The gate terrace before the bridge, its bastion projecting over the brink (rows z 154 on). */
  gateTerrace: [73, 142, 99, 156] as Box,
  /**
   * The gate terrace's bastion: battered masonry on the rock at the cliff's foot (world 0), its top
   * the terrace's edge on west, south and east (`rect`: the faces at the top, its back in the rock),
   * leaning out `batter` per metre down; the culvert's arch in its south face on the axis, its sill
   * just under the moat's water (the moat pours out of it as the fall to the pool).
   */
  bastion: { rect: [72.85, 154.5, 99.15, 156] as Box, batter: 1 / 10, culvert: { w: 2, sill: MOAT.surface - 0.2 } },
  ledgeRoad: [99, 142, 137, 149.3] as Box,
  ledgeWalk: [31, 142, 73, 149.3] as Box,
  /** The walled terrace at the stair's head over the court, and the lookout on the south-west knoll. */
  landing: [[136.9, 142], [159.3, 142], [158.7, 145.3], [156.7, 152.4], [142.1, 152.4], [142.1, 153], [136.9, 153]] as [number, number][],
  lookout: [[15.7, 142], [43.1, 142], [43.1, 149.7], [39.2, 150.5], [35.3, 152.8], [30.9, 155.3], [24.9, 157.5], [19.7, 156.4], [16.2, 152.8], [15.1, 147]] as [number, number][],
  /** The crown-level parapets: on the moat's outer bank (straight) and along the brink (following it). */
  parapets: {
    innerWest: [[15.3, 142.5], [82.5, 142.5]] as [number, number][],
    innerEast: [[89.5, 142.5], [159.2, 142.5]] as [number, number][],
    outerWest: [[15.3, 142.5], [14.8, 147], [15.8, 153.1], [19.4, 157], [24.9, 158], [31.4, 155.7], [39.2, 153.6], [47, 154.4], [56.1, 153.1], [65.2, 154.1], [73.55, 152.5], [73.55, 155.4], [86, 155.4]] as [number, number][],
    outerEast: [[86, 155.4], [98.45, 155.4], [98.45, 152.3], [104.2, 153.1], [113.3, 152], [122.4, 152.8], [130.2, 151.8], [136.5, 152.4]] as [number, number][],
    landing: [[142.1, 151.4], [156.5, 151.4], [159.2, 142.5]] as [number, number][],
  },
  /** Lanterns on the parapets' piers (each on the pier nearest its point): the lookout, the ledge walk and road, the landing, the stair's head. */
  lamps: [[24.9, 158], [21, 142.8], [47, 154.4], [122.4, 152.8], [148.9, 151.4], [151, 142.8], [142.1, 151.4]] as [number, number][],
  /** Stone benches looking out over the parapets, [x, z, the way each faces]. */
  benches: [[22.8, 152.3, 0.55], [147.8, 148.6, 0]] as [number, number, number][],
  /** The two banner poles at the bridge's foot on the gate terrace. */
  banners: [[79.5, 144.5], [92.5, 144.5]] as [number, number][],
};

/**
 * The climb from the ore lane (world 0) to the ledge (CROWN_Y): four straight flights of 15 risers
 * (18.3 cm) and 14 treads (38 cm), a hero's easy going, two north up the rock's south-east corner to
 * the turning landing, two west along its face, with level landings between them. Each flight climbs
 * from `y0` at its foot (the rectangle's downhill edge, where its first riser stands) to `y1` at its
 * head, toward `up`; rectangles are whole cells (the flights 5 m wide between walls a cell thick, each
 * flight's last 0.68 m its head's landing).
 */
export const CLIMB = {
  risers: 15,
  tread: 0.38,
  flights: [
    { rect: [155, 165, 160, 171], up: 'n', y0: 0, y1: 2.75 },
    { rect: [155, 158, 160, 164], up: 'n', y0: 2.75, y1: 5.5 },
    { rect: [149, 153, 155, 158], up: 'w', y0: 5.5, y1: 8.25 },
    { rect: [142, 153, 148, 158], up: 'w', y0: 8.25, y1: 11 },
  ] as { rect: Box; up: 'n' | 's' | 'e' | 'w'; y0: number; y1: number }[],
  landings: [
    { rect: [155, 164, 160, 165] as Box, y: 2.75 },
    { rect: [155, 153, 160, 158] as Box, y: 5.5 },
    { rect: [148, 153, 149, 158] as Box, y: 8.25 },
    { rect: [137, 152, 142, 158] as Box, y: 11 },
  ],
  /**
   * Its walls, a cell thick, standing on the lane, along the centre of their cells: a pier at every
   * point (each pier where a coping changes pitch; one long pier across each short landing), the
   * copings raking with the flights and level over the landings. The west run climbs from the lane
   * beside the flights and turns along their outer side to the head; the east run, on the court
   * side, ends against the dressed rock face over the turning landing.
   */
  walls: [
    [[154.5, 171], [154.5, 164.84], [154.5, 158.5], [148.84, 158.5], [142.68, 158.5], [136.5, 158.5], [136.5, 152.4]],
    [[160.5, 171], [160.5, 164.84], [160.5, 158.68], [160.5, 153.6]],
  ] as [number, number][][],
  /** Buttresses on the outer face of the tall south wall, between its piers. */
  buttresses: [151.67, 145.76, 139.59],
  /**
   * The dressed rock face over flights 3 and 4 and the turning landing, a cell thick along its middle
   * (z), from its west end at the head to the east wall's outer face, where it comes down to the lane
   * as the corner of the east wall.
   */
  face: { z: 152.5, x0: 142.68, x1: 161 },
};

/** The crown's natural edge (the rock round the moat, the ledge and the knolls), at CROWN_Y. */
export const CROWN_OUTLINE: [number, number][] = [
  [15.1, 15], [22.3, 11.4], [34, 9.5], [47, 7.2], [57.4, 4.9], [70.4, 3.8], [86, 3.3], [101.6, 3.8], [113.3, 4.9], [121.1, 9.8], [132.8, 11.1], [145.8, 13.2], [156.9, 17.1],
  [159.3, 26.7], [158.3, 39.7], [160.4, 52.7], [158.8, 65.7], [160.9, 76.1], [159.1, 89.1], [158, 102.1], [159.8, 115.1], [158.8, 128.1], [160.4, 137.2], [159.6, 145],
  [157.5, 153], [137, 153], [130.2, 152.3], [122.4, 153.3], [113.3, 152.5], [104.2, 153.6], [99, 152.8], [73, 153.1], [65.2, 154.6], [56.1, 153.6], [47, 154.9],
  [39.2, 154.1], [31.4, 156.2], [24.9, 158.5], [19, 157.5], [15.3, 153.3], [14.2, 147], [15, 139.8], [14, 130.7], [15.5, 117.7], [14.2, 104.7], [15.3, 91.7],
  [14, 78.7], [15, 65.7], [14.4, 52.7], [14.8, 39.7], [14, 26.7],
];

/** Below the rock: the pool the south fall pours into, the stream from it, the west fall's sluice. */
export const WATER = {
  southFall: { x: AXIS, z: 156, top: CROWN_Y - 2.7 },
  pool: { x: AXIS, z: 161, r: 4.7 },
  stream: [[86, 161], [95, 163.5], [104, 165], [113, 167], [119, 170], [122.5, 173], [124, 178], [123, 192], [120, 206], [116, 216], [110, 226], [105, 234]] as [number, number][],
  westFall: { x: 14.2, z: 106 },
};

/** The farm at the rock's foot, west of the pool: the paddock's fence and the vegetable plots. */
export const FARM = { fence: [50, 164, 64.4, 176.4] as Box, gate: 57, plotsX: [68, 72, 76, 80], plotsZ: [171, 175, 182, 186] };
