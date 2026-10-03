import { CURTAIN_WALL } from '../../data/castle';
import { COURSE } from '../../render/masonry';
import type { BuildingSpec, Fit, Side } from '../building';
import type { CastleLook, CastleSpec, CastleWindow } from '../buildingModel';
import { pitchOf } from './rangeParts';
import { CROWN_Y, CURTAIN, RANGE, TERRACE_Y, type Box } from './plan';

/**
 * The castle's other enterable buildings (castle v4, stage 5; docs/blueprints/castle-v4, design.json
 * `buildings` and `interiors`), each with its own look (buildingModel.ts, CastleLook):
 *  - the north range either side of the keep on the terrace: the great hall and the chapel under
 *    steep blue slate roofs on stone-coped gables, their north slopes draining into lead gutters
 *    behind parapets over the wall walk, the hall's louvred lantern on the ridge over its hearth and
 *    the chapel's flèche over its south door; the kitchen and the lord's solar, the range's low ends,
 *    flat behind battlements; every back wall built hard against the curtain under its walk;
 *  - the stables and the barracks facing each other across the bailey on the cross axis, flat
 *    behind battlements, the curtain their back wall: stalls either side of an aisle with the hay
 *    loft over them, and the barracks' rooms either side of a passage with the dormitory over them.
 * Every building has its own windows: the kitchen small square lights set high, the hall tall pairs
 * between buttresses, the chapel lancets and a rose window, the solar a mullioned light and an oriel,
 * the stables the stalls' half-doors with the horses looking out, the barracks shuttered windows and
 * a row of small lights. Cells and fittings are counted from each building's corner; heights are
 * over its floor.
 */

const SLATE = 0x4e5564, DARK_SLATE = 0x3e4450;
const at = ([x0, z0, x1, z1]: Box) => ({ x: x0, z: z0, w: x1 - x0, d: z1 - z0 });
const block = (x: number, z: number): [number, number] => [x, z];
const spec = (s: BuildingSpec, look: CastleLook): CastleSpec => ({ ...s, look });
/** A window's sill standing on a course stands a hair over its top (the sill stone lies on the course). */
const SILL = 0.02;
/** A window whose opening starts on a course line (its foot is cut a hair under its sill). */
const ON = 0.006;
const win = (side: Side, kind: CastleWindow['kind'], u: number, sill: number, w: number, h: number): CastleWindow => ({ side, kind, u, sill, w, h });

/** The terrace's floor over the crown (the north range stands on it). */
const UP = TERRACE_Y - CROWN_Y;
/**
 * A back wall built against the curtain. The north range's back and end walls stand a cell in from the
 * curtain, clear of the wall walk's corbelled crown; the slot between a wall's outer face and the
 * curtain's inner face is walled up solid to the underside of the crown's first corbel course, then
 * to its second's (which reaches 0.42 out from the curtain's face), then a slip up to the walk's
 * inner coping, so the range stands hard against the curtain as one wall.
 */
const GAP = RANGE.hall[1] + 0.05 - (CURTAIN.north + CURTAIN.T / 2);
const CORBEL = CURTAIN_WALL.H - 2 * COURSE - UP;
const FILL = [
  { out: GAP, top: CORBEL },
  { out: GAP - 0.42, top: CORBEL + COURSE },
  { out: 0.12, top: CURTAIN_WALL.H + COURSE + 0.12 - UP },
];

/** The kitchen at the hall's service end: two hearths on the north wall, the pantry, passage and buttery along its south end under their ceiling. */
const KITCHEN = spec({
  id: 'kitchen', style: 'keep', interior: 'keep', ...at(RANGE.kitchen), wallH: 7.5, roof: DARK_SLATE, backs: ['n', 'w'], joined: ['e'],
  doors: [{ side: 's', at: 4, w: 2 }, { side: 'e', at: 9, w: 2 }],
  partitions: [
    { axis: 'x', at: 8, from: 1, to: 9, doors: [[4, 2]] },
    { axis: 'z', at: 3, from: 9, to: 12, doors: [[10, 2]] },
    { axis: 'z', at: 6, from: 9, to: 12, doors: [[10, 2]] },
  ],
  windows: [],
  fits: [
    { kind: 'hearth_oven', x: 2.5, z: 1.6, block: block(1.2, 0.7) },
    { kind: 'hearth_oven', x: 6.0, z: 1.6, block: block(1.2, 0.7) },
    { kind: 'kitchen_table', x: 4.5, z: 5.0, block: block(1.2, 0.55) },
    { kind: 'sacks', x: 1.5, z: 11.4, block: block(0.45, 0.45) }, { kind: 'jars', x: 2.5, z: 11.4, block: block(0.45, 0.4) },
    { kind: 'barrel', x: 7.6, z: 10.4, block: block(0.5, 0.5) }, { kind: 'barrel', x: 8.4, z: 11.4, block: block(0.5, 0.5) },
  ],
}, {
  // Small square lights set high, over the low rooms' ceiling, lighting the kitchen's open volume.
  windows: [win('s', 'square', 2.6, SILL + 5.0, 1.0, 1.5 - SILL), win('s', 'square', 7.4, SILL + 5.0, 1.0, 1.5 - SILL)],
  fill: [{ side: 'n', steps: FILL }, { side: 'w', steps: FILL }],
  ceiling: { rect: [1, 8, 9, 12], y: 3.4 },
  partitionTop: 3.4,
  course: 4.5,
});

/**
 * The great hall: the screens passage at the west end behind the carved screen (the hall door under
 * its porch, the buttery door, the stair up to the minstrels' gallery over it), the hall open to its
 * timber roof, the open hearth under the lantern, long tables either side of it, and the high table
 * on the dais at the keep end, three steps up, under the lord's door.
 */
/** The great hall's and the chapel's ridge (over their floors, the plan's 20.9 over the crown) and its line across them. */
const RIDGE = 20.9 - UP, RIDGE_Z = pitchOf(RANGE.hall[3] - RANGE.hall[1], 10, RIDGE).zr;
const HALL = spec({
  id: 'great_hall', style: 'keep', interior: 'keep', ...at(RANGE.hall), wallH: 10, storeyH: 5, roof: SLATE, shared: ['w', 'e'], backs: ['n'],
  doors: [{ side: 's', at: 2, w: 2 }, { side: 'w', at: 9, w: 2 }, { side: 'e', at: 3, w: 2 }],
  partitions: [{ axis: 'z', at: 5, from: 1, to: 12, doors: [[10, 2]], screen: true }],
  stairs: [{
    x: 4, z: 1, w: 1, len: 4, dir: 's', land0: [3, 1], land1: [4, 10],
    turns: [{ landing: [4, 5, 5, 6], flight: { x: 4, z: 6, w: 1, len: 4, dir: 's' } }],
  }],
  windows: [],
  raised: [{ rect: [17, 1, 21, 12], h: 0.5 }],
  fits: [
    { kind: 'high_table', x: 18.8, z: 6.5, rot: Math.PI / 2, block: block(1.4, 2.6) },
    { kind: 'feast_table', x: 11, z: 3.4, rot: Math.PI / 2, len: 8, block: block(4, 1.0) },
    { kind: 'feast_table', x: 11, z: 9.6, rot: Math.PI / 2, len: 8, block: block(4, 1.0) },
    // The open hearth under the lantern on the ridge.
    { kind: 'open_hearth', x: 12.5, z: RIDGE_Z, block: block(0.7, 0.7) },
    { kind: 'banner', x: 18.8, z: 0.97 },
  ],
  upper: {
    voids: [[5, 1, 21, 12]],
    fits: [{ kind: 'lectern', x: 2.2, z: 4.5, rot: Math.PI / 2, block: block(0.4, 0.4) }, { kind: 'bench', x: 1.6, z: 8, rot: Math.PI / 2, block: block(0.3, 1.1) }],
  },
}, {
  roof: { ridge: RIDGE, lantern: { u: 12.5, tip: 24.6 - UP } },
  over: { w: KITCHEN.wallH },
  // Tall paired lights between buttresses, the east one over the high table, all lighting the hall itself.
  windows: [6.6, 11.75, 16.9].map((u) => win('s', 'pair', u, SILL + 3.0, 2.3, 4.4)),
  buttresses: [9.18, 14.33],
  porch: true,
  course: 2.5,
  gallery: true,
  fill: [{ side: 'n', steps: FILL }],
});

/**
 * The chapel: the nave from the south door, benches either side of the aisle, the lord's pew at the
 * west end by his door from the keep, the chancel two steps up behind its rail at the east end, the
 * altar against the east wall.
 */
const CHAPEL = spec({
  id: 'chapel', style: 'keep', interior: 'keep', ...at(RANGE.chapel), wallH: 10, roof: SLATE, shared: ['w', 'e'], backs: ['n'],
  doors: [{ side: 's', at: 10, w: 2 }, { side: 'w', at: 3, w: 2 }],
  windows: [],
  // (Two steps up: a height the walking levels hold exactly.)
  raised: [{ rect: [16, 1, 21, 12], h: 0.3125 }],
  fits: [
    { kind: 'chapel_altar', x: 20.0, z: 6.5, rot: -Math.PI / 2, block: block(0.6, 1.2) },
    { kind: 'candelabra', x: 18.6, z: 3.2, block: block(0.3, 0.3) }, { kind: 'candelabra', x: 18.6, z: 9.8, block: block(0.3, 0.3) },
    { kind: 'chancel_rail', x: 16.2, z: 2.75, len: 3.5, block: block(0.4, 1.75) },
    { kind: 'chancel_rail', x: 16.2, z: 10.25, len: 3.5, block: block(0.4, 1.75) },
    { kind: 'pew', x: 3.4, z: 3.4, rot: Math.PI / 2, block: block(0.5, 1.2) },
    { kind: 'chapel_bench', x: 3.4, z: 9.6, rot: Math.PI / 2, block: block(0.3, 1.1) },
    ...[5.6, 7.8, 13.6].flatMap((x) => [3.4, 9.6].map((z): Fit => ({ kind: 'chapel_bench', x, z, rot: Math.PI / 2, block: block(0.3, 1.1) }))),
    // The crimson runner up the aisle from the west end to the chancel's step.
    { kind: 'rug', x: 8.5, z: 6.5, rot: Math.PI / 2, len: 14.6 },
  ],
}, {
  roof: { ridge: RIDGE, fleche: { u: 11, tip: 27 - UP } },
  over: { e: 7.5 },
  // Four tall lancets between buttresses (three to the nave, one to the chancel) and the rose window over the south door.
  windows: [...[4.6, 7.8, 14.2, 17.4].map((u) => win('s', 'lancet', u, SILL + 3.0, 1.2, 5.2)), win('s', 'rose', 11, 5.0, 3.0, 3.0)],
  buttresses: [6.2, 15.8],
  course: 2.5,
  fill: [{ side: 'n', steps: FILL }],
});

/** The lord's solar: the day room below, the lord's chamber above, a dog-leg stair against the chapel wall between them. */
const SOLAR = spec({
  id: 'solar', style: 'keep', interior: 'keep', ...at(RANGE.solar), wallH: 7.5, storeyH: 4.5, roof: DARK_SLATE, backs: ['n', 'e'], joined: ['w'],
  doors: [{ side: 's', at: 6, w: 2 }],
  stairs: [{
    x: 1, z: 4, w: 1, len: 4, dir: 'n', land0: [1, 8], land1: [2, 8],
    turns: [{ landing: [1, 3, 3, 4], flight: { x: 2, z: 4, w: 1, len: 4, dir: 's' } }],
  }],
  windows: [],
  fits: [
    { kind: 'fireplace', x: 3.8, z: 1.45, block: block(1.8, 0.5) },
    { kind: 'ledger_desk', x: 4.2, z: 10.6, block: block(0.9, 0.45) }, { kind: 'chair', x: 4.2, z: 9.7, rot: Math.PI },
    { kind: 'rug', x: 5.6, z: 6.5, len: 3.2 },
    { kind: 'sideboard', x: 8.5, z: 6, rot: -Math.PI / 2, block: block(0.4, 0.8) },
  ],
  upper: {
    fits: [
      { kind: 'fireplace', x: 7.0, z: 1.45, block: block(1.8, 0.5) },
      { kind: 'bed', x: 7.2, z: 8.6, rot: Math.PI, block: block(1.0, 1.3) },
      { kind: 'wardrobe', x: 4.4, z: 11.4, block: block(0.7, 0.4) },
      { kind: 'strongbox', x: 8.6, z: 4.5, rot: -Math.PI / 2, block: block(0.5, 0.6) },
      { kind: 'rug', x: 5.8, z: 5.6, len: 2.6 },
    ],
  },
}, {
  // A mullioned day-room light, and over the door the oriel on its corbels lighting the lord's chamber.
  windows: [win('s', 'square', 3.0, ON + 1.0, 1.6, 2.5 - ON), win('s', 'oriel', 7, 5.5, 2.6, 1.0)],
  fill: [{ side: 'n', steps: FILL }, { side: 'e', steps: FILL }],
});

/**
 * The stables against the west curtain (its west wall): the tack room at the west end, three stalls
 * either side of the aisle on the cross axis, each with a horse looking out over its half-door, the
 * feed bay open to the roof inside the gable door with the stair up to the hay loft over the stalls.
 */
const STALLS = [6.67, 10, 13.33];
const STABLES = spec({
  id: 'stables', style: 'keep', interior: 'keep', ...at(RANGE.stables), wallH: 5, roof: SLATE, backs: ['w'],
  doors: [{ side: 'e', at: 4, w: 2 }],
  partitions: [
    { axis: 'z', at: 4, from: 1, to: 9, doors: [[4, 2]] },
    { axis: 'z', at: 15, from: 1, to: 9, doors: [[4, 2]] },
  ],
  windows: [],
  fits: [
    // The stalls, each with its horse facing out over its half-door (coats by turns).
    ...STALLS.flatMap((x, i): Fit[] => [
      { kind: 'horse_stall', x, z: 2.5, rot: Math.PI, len: i % 3, block: block(1.6, 1.4) },
      { kind: 'horse_stall', x, z: 7.5, len: (i + 1) % 3, block: block(1.6, 1.4) },
    ]),
    // The boarded walls between the stalls.
    ...[8.335, 11.665].flatMap((x) => [2.45, 7.55].map((z): Fit => ({ kind: 'stall_boards', x, z, len: 3.0 }))),
    { kind: 'saddle_rack', x: 1.45, z: 2.5, rot: Math.PI / 2, block: block(0.4, 1.0) },
    { kind: 'saddle_rack', x: 1.45, z: 7.5, rot: Math.PI / 2, block: block(0.4, 1.0) },
    { kind: 'loft_stair', x: 17.5, z: 1.5, rot: -Math.PI / 2, len: 4, block: block(2.0, 0.5) },
    { kind: 'hay', x: 18.4, z: 8.2, block: block(0.6, 0.6) },
    { kind: 'sacks', x: 16.6, z: 8.4, block: block(0.45, 0.45) },
    { kind: 'barrel', x: 19.4, z: 3.2, block: block(0.5, 0.5) },
    { kind: 'straw', x: 10, z: 5 },
  ],
}, {
  // The stalls' half-doors on the stable yard and on the paddock, the loft door with its hoist over the
  // middle stall, a small light in the tack room either side and two high in the feed bay.
  windows: [
    ...STALLS.flatMap((u) => [win('n', 'stall', u, 0, 1.3, 2.5), win('s', 'stall', u, 0, 1.3, 2.5)]),
    win('n', 'loft', 10, ON + 3.0, 1.2, 1.0 - ON),
    ...(['n', 's'] as Side[]).flatMap((s) => [win(s, 'square', 2.5, ON + 1.5, 0.8, 1.0 - ON), win(s, 'slit', 17.5, ON + 2.5, 0.5, 1.0 - ON)]),
  ],
  loft: { rect: [1, 1, 15.45, 9], y: 2.9 },
  partitionTop: 2.9,
});

/**
 * The barracks, the stables' mirror against the east curtain: the guardroom open to the roof inside
 * the gable door with the stair to the dormitory, the armoury and the mess either side of the passage,
 * the sergeant's room at the far end, the dormitory over them.
 */
const BARRACKS = spec({
  id: 'barracks', style: 'keep', interior: 'keep', ...at(RANGE.barracks), wallH: 5, roof: DARK_SLATE, backs: ['e'],
  doors: [{ side: 'w', at: 4, w: 2 }, { side: 'n', at: 10, w: 2 }],
  partitions: [
    { axis: 'z', at: 5, from: 1, to: 9, doors: [[4, 1]] },
    { axis: 'z', at: 16, from: 1, to: 9, doors: [[4, 1]] },
    { axis: 'x', at: 3, from: 6, to: 16, doors: [[10, 2]] },
    { axis: 'x', at: 5, from: 6, to: 16, doors: [[7, 2]] },
  ],
  windows: [],
  fits: [
    { kind: 'guard_table', x: 2.8, z: 6.6, block: block(0.9, 0.7) },
    { kind: 'weapon_rack', x: 1.45, z: 4.5, rot: Math.PI / 2, block: block(0.25, 1.0) },
    { kind: 'loft_stair', x: 3, z: 1.5, rot: Math.PI / 2, len: 4, block: block(2.0, 0.5) },
    // The armoury: racks along its north wall either side of its door, the smith's bench at its end.
    { kind: 'arms_rack', x: 8.2, z: 2.5, rot: Math.PI, block: block(1.0, 0.35) },
    { kind: 'armor_stand', x: 13.2, z: 1.5, block: block(0.4, 0.4) },
    { kind: 'workbench', x: 15.25, z: 2.0, rot: -Math.PI / 2, block: block(0.4, 0.9) },
    // The mess: the long table, its hearth at the west end.
    { kind: 'feast_table', x: 11.8, z: 7.5, rot: Math.PI / 2, len: 6, block: block(3.0, 0.6) },
    { kind: 'fireplace', x: 6.45, z: 7.5, rot: Math.PI / 2, len: 2.4, block: block(0.5, 1.0) },
    // The sergeant's room: his bunk, his chest and his table.
    { kind: 'bunk', x: 19.4, z: 2.6, block: block(0.6, 1.1) },
    { kind: 'strongbox', x: 19.4, z: 4.6, rot: -Math.PI / 2, block: block(0.3, 0.4) },
    { kind: 'guard_table', x: 18.6, z: 7.3, block: block(0.6, 0.5) },
  ],
}, {
  // A shuttered window to each room, the armoury's either side of its door, and a row of small lights to the dormitory over them.
  windows: [
    ...[2.5, 7.4, 14.6, 18.4].map((u) => win('n', 'shuttered', u, ON + 1.0, 1.0, 1.5 - ON)),
    ...[2.5, 8.6, 13.4, 18.4].map((u) => win('s', 'shuttered', u, ON + 1.0, 1.0, 1.5 - ON)),
    // (The north row over the windows either side of the armoury's door, the south row along the mess.)
    ...[2.5, 7.4, 14.6, 18.4].map((u) => win('n', 'slit', u, ON + 3.0, 0.45, 1.0 - ON)),
    ...[2.5, 8.6, 11, 13.4, 18.4].map((u) => win('s', 'slit', u, ON + 3.0, 0.45, 1.0 - ON)),
  ],
  loft: { rect: [5.55, 1, 20, 9], y: 2.9 },
  partitionTop: 2.9,
});

/** The castle's buildings round the keep. */
export const RANGE_SPECS: BuildingSpec[] = [KITCHEN, HALL, CHAPEL, SOLAR, STABLES, BARRACKS];
