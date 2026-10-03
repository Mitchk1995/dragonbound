import { CURTAIN_WALL } from '../../data/castle';
import { COURSE } from '../../render/masonry';
import type { BuildingSpec, Fit, Side } from '../building';
import type { CastleLook, CastleSpec, CastleWindow } from '../buildingModel';
import { pitchOf } from './rangeParts';
import { CROWN_Y, CURTAIN, GROW, RANGE, TERRACE_Y, type Box } from './plan';

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
/** A piece of furniture's footprint, half-extents given at its first size and grown with it. */
const block = (x: number, z: number): [number, number] => [x * GROW, z * GROW];
/** Every piece of the castle's furniture grew with its rooms (a rug only longer: it lies a hair over the floor). */
const grown = (fits: Fit[]): Fit[] => fits.map((f) => (f.kind === 'rug' ? { ...f, len: (f.len ?? 4) * GROW } : { ...f, s: GROW }));
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
  { out: 0.12, top: CURTAIN_WALL.H + COURSE + 0.09 - UP },
];

/** The kitchen at the hall's service end: two hearths on the north wall, the pantry, passage and buttery along its south end under their ceiling. */
const KITCHEN = spec({
  id: 'kitchen', style: 'keep', interior: 'keep', ...at(RANGE.kitchen), wallH: 10, roof: DARK_SLATE, backs: ['n', 'w'], joined: ['e'],
  doors: [{ side: 's', at: 4, w: 3 }, { side: 'e', at: 12, w: 3 }],
  partitions: [
    { axis: 'x', at: 11, from: 1, to: 11, doors: [[4, 3]] },
    { axis: 'z', at: 3, from: 12, to: 16, doors: [[13, 2]] },
    { axis: 'z', at: 7, from: 12, to: 16, doors: [[13, 2]] },
  ],
  windows: [],
  fits: grown([
    { kind: 'hearth_oven', x: 3.2, z: 2.1, block: block(1.2, 0.7) },
    { kind: 'hearth_oven', x: 7.8, z: 2.1, block: block(1.2, 0.7) },
    { kind: 'kitchen_table', x: 5.5, z: 6.5, block: block(1.2, 0.55) },
    { kind: 'sacks', x: 1.6, z: 15.2, block: block(0.45, 0.45) }, { kind: 'jars', x: 2.4, z: 12.4, block: block(0.45, 0.4) },
    { kind: 'barrel', x: 8.7, z: 13.2, block: block(0.5, 0.5) }, { kind: 'barrel', x: 9.6, z: 14.8, block: block(0.5, 0.5) },
  ]),
}, {
  // Small square lights set high, over the low rooms' ceiling, lighting the kitchen's open volume.
  windows: [win('s', 'square', 3.1, SILL + 6.5, 1.3, 2 - SILL), win('s', 'square', 8.9, SILL + 6.5, 1.3, 2 - SILL)],
  fill: [{ side: 'n', steps: FILL }, { side: 'w', steps: FILL }],
  ceiling: { rect: [1, 11, 11, 16], y: 4.5 },
  partitionTop: 4.5,
  course: 6,
});

/**
 * The great hall: the screens passage at the west end behind the carved screen (the hall door under
 * its porch, the buttery door, the stair up to the minstrels' gallery over it), the hall open to its
 * timber roof, the open hearth under the lantern, long tables either side of it, and the high table
 * on the dais at the keep end, three steps up, under the lord's door.
 */
/** The great hall's and the chapel's ridge (over their floors, 27.2 over the crown) and its line across them. */
const RIDGE = 27.2 - UP, RIDGE_Z = pitchOf(RANGE.hall[3] - RANGE.hall[1], 13, RIDGE).zr;
const HALL = spec({
  id: 'great_hall', style: 'keep', interior: 'keep', ...at(RANGE.hall), wallH: 13, storeyH: 6.5, roof: SLATE, shared: ['w', 'e'], backs: ['n'],
  doors: [{ side: 's', at: 2, w: 3 }, { side: 'w', at: 12, w: 3 }, { side: 'e', at: 5, w: 3 }],
  partitions: [{ axis: 'z', at: 7, from: 1, to: 16, doors: [[14, 2]], screen: true }],
  stairs: [{
    x: 5, z: 1, w: 2, len: 6, dir: 's', land0: [4, 1], land1: [5, 14],
    turns: [{ landing: [5, 7, 7, 8], flight: { x: 5, z: 8, w: 2, len: 6, dir: 's' } }],
  }],
  windows: [],
  raised: [{ rect: [22, 1, 28, 16], h: 0.5 }],
  fits: grown([
    { kind: 'high_table', x: 24.6, z: 8.5, rot: Math.PI / 2, block: block(1.4, 2.6) },
    { kind: 'feast_table', x: 14.5, z: 4.4, rot: Math.PI / 2, len: 8, block: block(4, 1.0) },
    { kind: 'feast_table', x: 14.5, z: 12.6, rot: Math.PI / 2, len: 8, block: block(4, 1.0) },
    // The open hearth under the lantern on the ridge.
    { kind: 'open_hearth', x: 16.5, z: RIDGE_Z, block: block(0.7, 0.7) },
    { kind: 'banner', x: 24.6, z: 0.97 },
  ]),
  upper: {
    voids: [[7, 1, 28, 16]],
    fits: grown([{ kind: 'lectern', x: 2.9, z: 5.9, rot: Math.PI / 2, block: block(0.4, 0.4) }, { kind: 'bench', x: 2.1, z: 10.4, rot: Math.PI / 2, block: block(0.3, 1.1) }]),
  },
}, {
  roof: { ridge: RIDGE, lantern: { u: 16.5, tip: 32 - UP } },
  over: { w: KITCHEN.wallH },
  // Tall paired lights between buttresses, the east one over the high table, all lighting the hall itself.
  windows: [8.7, 15.5, 22.3].map((u) => win('s', 'pair', u, SILL + 4.0, 3.0, 5.5)),
  buttresses: [12.1, 18.9],
  porch: true,
  course: 3.5,
  gallery: true,
  fill: [{ side: 'n', steps: FILL }],
});

/**
 * The chapel: the nave from the south door, benches either side of the aisle, the lord's pew at the
 * west end by his door from the keep, the chancel two steps up behind its rail at the east end, the
 * altar against the east wall.
 */
const CHAPEL = spec({
  id: 'chapel', style: 'keep', interior: 'keep', ...at(RANGE.chapel), wallH: 13, roof: SLATE, shared: ['w', 'e'], backs: ['n'],
  doors: [{ side: 's', at: 13, w: 3 }, { side: 'w', at: 5, w: 3 }],
  windows: [],
  // (Two steps up: a height the walking levels hold exactly.)
  raised: [{ rect: [21, 1, 28, 16], h: 0.375 }],
  fits: grown([
    { kind: 'chapel_altar', x: 26.4, z: 8.5, rot: -Math.PI / 2, block: block(0.6, 1.2) },
    { kind: 'candelabra', x: 24.6, z: 4.2, block: block(0.3, 0.3) }, { kind: 'candelabra', x: 24.6, z: 12.8, block: block(0.3, 0.3) },
    { kind: 'chancel_rail', x: 21.25, z: 3.3, len: 3.5, block: block(0.4, 1.75) },
    { kind: 'chancel_rail', x: 21.25, z: 13.7, len: 3.5, block: block(0.4, 1.75) },
    { kind: 'pew', x: 4.4, z: 4.4, rot: Math.PI / 2, block: block(0.5, 1.2) },
    { kind: 'chapel_bench', x: 4.4, z: 12.6, rot: Math.PI / 2, block: block(0.3, 1.1) },
    ...[7.4, 10.3, 18].flatMap((x) => [4.4, 12.6].map((z): Fit => ({ kind: 'chapel_bench', x, z, rot: Math.PI / 2, block: block(0.3, 1.1) }))),
    // The crimson runner up the aisle from the west end to the chancel's step.
    { kind: 'rug', x: 11.2, z: 8.5, rot: Math.PI / 2, len: 14.6 },
  ]),
}, {
  roof: { ridge: RIDGE, fleche: { u: 14.5, tip: 35 - UP } },
  over: { e: 10 },
  // Four tall lancets between buttresses (three to the nave, one to the chancel) and the rose window over the south door.
  windows: [...[6.1, 10.3, 18.7, 23].map((u) => win('s', 'lancet', u, SILL + 4.0, 1.6, 7.0)), win('s', 'rose', 14.5, 6.5, 4.0, 4.0)],
  buttresses: [8.2, 20.85],
  course: 3.5,
  fill: [{ side: 'n', steps: FILL }],
});

/** The lord's solar: the day room below, the lord's chamber above, a dog-leg stair against the chapel wall between them. */
const SOLAR = spec({
  id: 'solar', style: 'keep', interior: 'keep', ...at(RANGE.solar), wallH: 10, storeyH: 6, roof: DARK_SLATE, backs: ['n', 'e'], joined: ['w'],
  doors: [{ side: 's', at: 7, w: 3 }],
  stairs: [{
    x: 1, z: 3, w: 2, len: 5, dir: 'n', land0: [1, 8], land1: [3, 8],
    turns: [{ landing: [1, 1, 5, 3], flight: { x: 3, z: 3, w: 2, len: 5, dir: 's' } }],
  }],
  windows: [],
  fits: grown([
    { kind: 'fireplace', x: 7.6, z: 1.9, block: block(1.8, 0.5) },
    { kind: 'ledger_desk', x: 5, z: 13.9, block: block(0.9, 0.45) }, { kind: 'chair', x: 5, z: 12.7, rot: Math.PI },
    { kind: 'rug', x: 7.2, z: 9, len: 3.2 },
    { kind: 'sideboard', x: 10.2, z: 7.8, rot: -Math.PI / 2, block: block(0.4, 0.8) },
  ]),
  upper: {
    fits: grown([
      { kind: 'fireplace', x: 7.6, z: 1.9, block: block(1.8, 0.5) },
      { kind: 'bed', x: 8.6, z: 11.2, rot: Math.PI, block: block(1.0, 1.3) },
      { kind: 'wardrobe', x: 5.3, z: 14.9, block: block(0.7, 0.4) },
      { kind: 'strongbox', x: 10.3, z: 5.9, rot: -Math.PI / 2, block: block(0.5, 0.6) },
      { kind: 'rug', x: 7, z: 7.3, len: 2.6 },
    ]),
  },
}, {
  // A mullioned day-room light, and over the door the oriel on its corbels lighting the lord's chamber.
  windows: [win('s', 'square', 3.6, ON + 1.5, 2.1, 3 - ON), win('s', 'oriel', 8.5, 7.5, 3.4, 1.5)],
  fill: [{ side: 'n', steps: FILL }, { side: 'e', steps: FILL }],
});

/**
 * The stables against the west curtain (its west wall): the tack room at the west end, three stalls
 * either side of the aisle on the cross axis, each with a horse looking out over its half-door, the
 * feed bay open to the roof inside the gable door with the stair up to the hay loft over the stalls.
 */
const STALLS = [8.17, 12.5, 16.83];
const STABLES = spec({
  id: 'stables', style: 'keep', interior: 'keep', ...at(RANGE.stables), wallH: 6.5, roof: SLATE, backs: ['w'],
  doors: [{ side: 'e', at: 5, w: 3 }],
  partitions: [
    { axis: 'z', at: 5, from: 1, to: 12, doors: [[5, 3]] },
    { axis: 'z', at: 19, from: 1, to: 12, doors: [[5, 3]] },
  ],
  windows: [],
  fits: grown([
    // The stalls, each with its horse facing out over its half-door (coats by turns).
    ...STALLS.flatMap((x, i): Fit[] => [
      { kind: 'horse_stall', x, z: 3, rot: Math.PI, len: i % 3, block: block(1.6, 1.4) },
      { kind: 'horse_stall', x, z: 10, len: (i + 1) % 3, block: block(1.6, 1.4) },
    ]),
    // The boarded walls between the stalls.
    ...[10.33, 14.67].flatMap((x) => [2.95, 10.05].map((z): Fit => ({ kind: 'stall_boards', x, z, len: 3.0 }))),
    { kind: 'saddle_rack', x: 1.6, z: 3, rot: Math.PI / 2, block: block(0.4, 1.0) },
    { kind: 'saddle_rack', x: 1.6, z: 10, rot: Math.PI / 2, block: block(0.4, 1.0) },
    { kind: 'hay', x: 24.2, z: 9.8, block: block(0.6, 0.6) },
    { kind: 'sacks', x: 21.6, z: 10.2, block: block(0.45, 0.45) },
    { kind: 'barrel', x: 24.8, z: 4.2, block: block(0.5, 0.5) },
    { kind: 'straw', x: 12.5, z: 6.5 },
  ]).concat([{ kind: 'loft_stair', x: 23, z: 1.8, rot: -Math.PI / 2, len: 5.2, block: block(2.0, 0.5) }]),
}, {
  // The stalls' half-doors on the stable yard and on the paddock, the loft door with its hoist over the
  // middle stall, a small light in the tack room either side and two high in the feed bay.
  windows: [
    ...STALLS.flatMap((u) => [win('n', 'stall', u, 0, 1.7, 3), win('s', 'stall', u, 0, 1.7, 3)]),
    win('n', 'loft', 12.5, ON + 4.0, 1.6, 1.5 - ON),
    ...(['n', 's'] as Side[]).flatMap((s) => [win(s, 'square', 3, ON + 2.0, 1.0, 1.5 - ON), win(s, 'slit', 23, ON + 4.0, 0.65, 1.5 - ON)]),
  ],
  loft: { rect: [1, 1, 19.45, 12], y: 3.8 },
  partitionTop: 3.8,
});

/**
 * The barracks, the stables' mirror against the east curtain: the guardroom open to the roof inside
 * the gable door with the stair to the dormitory, the armoury and the mess either side of the passage,
 * the sergeant's room at the far end, the dormitory over them.
 */
const BARRACKS = spec({
  id: 'barracks', style: 'keep', interior: 'keep', ...at(RANGE.barracks), wallH: 6.5, roof: DARK_SLATE, backs: ['e'],
  doors: [{ side: 'w', at: 5, w: 3 }, { side: 'n', at: 13, w: 3 }],
  partitions: [
    { axis: 'z', at: 7, from: 1, to: 12, doors: [[6, 2]] },
    { axis: 'z', at: 20, from: 1, to: 12, doors: [[6, 2]] },
    { axis: 'x', at: 5, from: 8, to: 20, doors: [[13, 3]] },
    { axis: 'x', at: 8, from: 8, to: 20, doors: [[9, 3]] },
  ],
  windows: [],
  fits: grown([
    { kind: 'guard_table', x: 3.5, z: 9.5, block: block(0.9, 0.7) },
    { kind: 'weapon_rack', x: 1.6, z: 3.8, rot: Math.PI / 2, block: block(0.25, 1.0) },
    // The armoury: racks along its north wall either side of its door, the smith's bench at its end.
    { kind: 'arms_rack', x: 10.2, z: 1.9, rot: Math.PI, block: block(1.0, 0.35) },
    { kind: 'armor_stand', x: 17.2, z: 1.9, block: block(0.4, 0.4) },
    { kind: 'workbench', x: 19.3, z: 2.6, rot: -Math.PI / 2, block: block(0.4, 0.9) },
    // The mess: the long table, its hearth at the west end.
    { kind: 'feast_table', x: 14, z: 10.5, rot: Math.PI / 2, len: 6, block: block(3.0, 0.6) },
    { kind: 'fireplace', x: 8.6, z: 10.5, rot: Math.PI / 2, len: 2.4, block: block(0.5, 1.0) },
    // The sergeant's room: his bunk, his chest and his table.
    { kind: 'bunk', x: 24.2, z: 3.4, block: block(0.6, 1.1) },
    { kind: 'strongbox', x: 24.2, z: 6, rot: -Math.PI / 2, block: block(0.3, 0.4) },
    { kind: 'guard_table', x: 23.2, z: 9.5, block: block(0.6, 0.5) },
  ]).concat([{ kind: 'loft_stair', x: 3.8, z: 1.8, rot: Math.PI / 2, len: 5.2, block: block(2.0, 0.5) }]),
}, {
  // A shuttered window to each room, the armoury's either side of its door, and a row of small lights to the dormitory over them.
  windows: [
    ...[3.5, 10.3, 18.2, 23].map((u) => win('n', 'shuttered', u, ON + 1.5, 1.3, 2 - ON)),
    ...[3.5, 11, 16.5, 23].map((u) => win('s', 'shuttered', u, ON + 1.5, 1.3, 2 - ON)),
    // (The north row over the windows either side of the armoury's door, the south row along the mess.)
    ...[3.5, 10.3, 18.2, 23].map((u) => win('n', 'slit', u, ON + 4.0, 0.6, 1.5 - ON)),
    ...[3.5, 11, 13.75, 16.5, 23].map((u) => win('s', 'slit', u, ON + 4.0, 0.6, 1.5 - ON)),
  ],
  loft: { rect: [7.55, 1, 26, 12], y: 3.8 },
  partitionTop: 3.8,
});

/** The castle's buildings round the keep. */
export const RANGE_SPECS: BuildingSpec[] = [KITCHEN, HALL, CHAPEL, SOLAR, STABLES, BARRACKS];
