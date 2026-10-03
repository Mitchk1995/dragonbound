import type { BuildingSpec, Fit } from '../building';
import { RANGE, type Box } from './plan';

/**
 * The castle's other enterable buildings, plain shells in the castle's stone under flat roofs behind
 * battlements: the north range either side of the keep on the terrace (the
 * kitchen, the great hall, the chapel and the lord's solar, their party walls shared with the keep
 * and each other), and the stables and the barracks facing each other across the bailey on the
 * cross axis, each built against the curtain. Fittings and rooms are in cells from each building's
 * corner.
 */

const SLATE = 0x4e5564, DARK_SLATE = 0x3e4450;
const at = ([x0, z0, x1, z1]: Box) => ({ x: x0, z: z0, w: x1 - x0, d: z1 - z0 });
const block = (x: number, z: number): [number, number] => [x, z];

/** The kitchen at the hall's service end: two hearths on the north wall, the pantry, passage and buttery along its south end. */
const KITCHEN: BuildingSpec = {
  id: 'kitchen', style: 'keep', interior: 'keep', ...at(RANGE.kitchen), wallH: 8.5, roof: DARK_SLATE,
  doors: [{ side: 's', at: 4, w: 2 }, { side: 'e', at: 9, w: 2 }],
  partitions: [
    { axis: 'x', at: 8, from: 1, to: 9, doors: [[4, 2]] },
    { axis: 'z', at: 3, from: 9, to: 12, doors: [[10, 2]] },
    { axis: 'z', at: 6, from: 9, to: 12, doors: [[10, 2]] },
  ],
  windows: [{ side: 's', at: 1.8 }, { side: 's', at: 7.2 }],
  fits: [
    { kind: 'hearth_oven', x: 2.5, z: 1.6, block: block(1.2, 0.7) },
    { kind: 'hearth_oven', x: 6.0, z: 1.6, block: block(1.2, 0.7) },
    { kind: 'kitchen_table', x: 4.5, z: 5.0, block: block(1.2, 0.55) },
    { kind: 'sacks', x: 1.5, z: 11.4, block: block(0.45, 0.45) }, { kind: 'jars', x: 2.5, z: 11.4, block: block(0.45, 0.4) },
    { kind: 'barrel', x: 7.6, z: 10.4, block: block(0.5, 0.5) },
  ],
};

/**
 * The great hall: the screens passage at the west end (the hall door, the buttery door and the
 * stair to the minstrels' gallery over it, the screen opening onto the hall at its south end beside
 * the stair's head), the hall open to its roof with the hearth and the long tables, the high table
 * on the dais at the keep end, three steps up, under the lord's door.
 */
const HALL: BuildingSpec = {
  id: 'great_hall', style: 'keep', interior: 'keep', ...at(RANGE.hall), wallH: 10, storeyH: 5, roof: SLATE, shared: ['w', 'e'],
  doors: [{ side: 's', at: 3, w: 2 }, { side: 'w', at: 9, w: 2 }, { side: 'e', at: 3, w: 2 }],
  partitions: [{ axis: 'z', at: 5, from: 1, to: 12, doors: [[10, 2]], screen: true }],
  stairs: [{
    x: 4, z: 1, w: 1, len: 4, dir: 's', land0: [3, 1], land1: [4, 10],
    turns: [{ landing: [4, 5, 5, 6], flight: { x: 4, z: 6, w: 1, len: 4, dir: 's' } }],
  }],
  windows: [{ side: 's', at: 7.3 }, { side: 's', at: 12.75 }, { side: 's', at: 18.2 }],
  raised: [{ rect: [17, 1, 21, 12], h: 0.5 }],
  fits: [
    { kind: 'high_table', x: 18.8, z: 6, rot: Math.PI / 2, block: block(1.4, 2.6) },
    { kind: 'feast_table', x: 10.5, z: 3.3, rot: Math.PI / 2, len: 8, block: block(4, 1.0) },
    { kind: 'feast_table', x: 10.5, z: 8.7, rot: Math.PI / 2, len: 8, block: block(4, 1.0) },
    { kind: 'open_hearth', x: 12.5, z: 6, block: block(0.9, 0.9) },
  ],
  upper: { voids: [[5, 1, 21, 12]] },
};

/** The chapel: the nave from the south door, benches either side of the aisle, the altar in the chancel at the east end. */
const CHAPEL: BuildingSpec = {
  id: 'chapel', style: 'keep', interior: 'keep', ...at(RANGE.chapel), wallH: 10, roof: SLATE, shared: ['w', 'e'],
  doors: [{ side: 's', at: 11, w: 2 }, { side: 'w', at: 3, w: 2 }],
  windows: [{ side: 's', at: 4.5 }, { side: 's', at: 7.6 }, { side: 's', at: 15.4 }, { side: 's', at: 18.6 }],
  raised: [{ rect: [16, 1, 21, 12], h: 0.5 }],
  fits: [
    { kind: 'chapel_altar', x: 19.6, z: 6, rot: -Math.PI / 2, block: block(0.6, 1.2) },
    { kind: 'candelabra', x: 18.4, z: 2.2, block: block(0.3, 0.3) }, { kind: 'candelabra', x: 18.4, z: 9.8, block: block(0.3, 0.3) },
    ...[5, 7.5, 10, 12.5].flatMap((x) => [3.5, 8.5].map((z): Fit => ({ kind: 'bench', x, z, rot: Math.PI / 2, block: block(0.3, 1.1) }))),
  ],
};

/** The lord's solar: the day room below, the lord's chamber above, a dog-leg stair against the chapel wall between them. */
const SOLAR: BuildingSpec = {
  id: 'solar', style: 'keep', interior: 'keep', ...at(RANGE.solar), wallH: 8.5, storeyH: 4.5, roof: DARK_SLATE,
  doors: [{ side: 's', at: 6, w: 2 }],
  stairs: [{
    x: 1, z: 4, w: 1, len: 4, dir: 'n', land0: [1, 8], land1: [2, 8],
    turns: [{ landing: [1, 3, 3, 4], flight: { x: 2, z: 4, w: 1, len: 4, dir: 's' } }],
  }],
  windows: [{ side: 's', at: 3.8 }, { side: 's', at: 5.7, floor: 1 }],
  fits: [{ kind: 'ledger_desk', x: 5.5, z: 6, block: block(0.9, 0.45) }],
  upper: { fits: [{ kind: 'strongbox', x: 6.6, z: 2, block: block(0.6, 0.5) }] },
};

/**
 * The stables against the west curtain (its west wall): the tack room at the west end, the stalls
 * either side of the aisle on the cross axis, the feed bay inside the gable door; and the barracks,
 * their mirror against the east curtain (the guardroom inside the gable door, the armoury and the
 * mess either side of the passage, the sergeant's room at the far end).
 */
const STABLES: BuildingSpec = {
  id: 'stables', style: 'keep', interior: 'keep', ...at(RANGE.stables), wallH: 5, roof: SLATE, backs: ['w'],
  doors: [{ side: 'e', at: 4, w: 2 }],
  partitions: [
    { axis: 'z', at: 4, from: 1, to: 9, doors: [[4, 2]] },
    { axis: 'z', at: 15, from: 1, to: 9, doors: [[4, 2]] },
  ],
  windows: [6.3, 9.9, 13.5].flatMap((a) => [{ side: 'n' as const, at: a, stall: true }, { side: 's' as const, at: a, stall: true }]),
  fits: [
    { kind: 'hay', x: 17.4, z: 1.8, block: block(0.6, 0.6) },
    { kind: 'trough', x: 9.9, z: 1.4, block: block(0.9, 0.4) },
    { kind: 'straw', x: 9.9, z: 7.4, block: block(0.7, 0.6) },
  ],
};

const BARRACKS: BuildingSpec = {
  id: 'barracks', style: 'keep', interior: 'keep', ...at(RANGE.barracks), wallH: 5, roof: DARK_SLATE, backs: ['e'],
  doors: [{ side: 'w', at: 4, w: 2 }],
  partitions: [
    { axis: 'z', at: 5, from: 1, to: 9, doors: [[4, 2]] },
    { axis: 'z', at: 16, from: 1, to: 9, doors: [[4, 2]] },
  ],
  windows: [6.5, 10.1, 13.7].flatMap((a) => [{ side: 'n' as const, at: a }, { side: 's' as const, at: a }]),
  fits: [
    { kind: 'guard_table', x: 2.8, z: 2.4, block: block(0.9, 0.7) },
    { kind: 'weapon_rack', x: 10, z: 1.3, block: block(1.0, 0.25) },
    ...[7.5, 10, 12.5].map((x): Fit => ({ kind: 'bunk', x, z: 7.4, block: block(0.6, 1.1) })),
  ],
};

/** The castle's buildings round the keep. */
export const RANGE_SPECS: BuildingSpec[] = [KITCHEN, HALL, CHAPEL, SOLAR, STABLES, BARRACKS];
