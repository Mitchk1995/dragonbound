import type { BuildingSpec } from '../building';
import { KEEP, TERRACE_Y } from './plan';

/**
 * The great keep as an enterable building: a plain shell in the castle's stone under a flat roof
 * behind battlements, its entrance bay over the great door. Its floor is the terrace's; the throne hall rises the
 * whole height in the middle, and galleries run round its north, west and east sides at the wall
 * walk's level, each side reached by a stair of two flights from beside the great door, along the
 * south wall to a half landing and up the side wall through the gallery's floor. Cells are local to
 * the keep's corner (KEEP.rect).
 */
const [x0, z0, x1, z1] = KEEP.rect;

export const KEEP_SPEC: BuildingSpec = {
  id: 'keep', style: 'keep', interior: 'keep', x: x0, z: z0, w: x1 - x0, d: z1 - z0,
  // Its battlements at KEEP.top; the galleries' floor a hair under the wall walk (on a course line).
  wallH: KEEP.top - TERRACE_Y - 1, storeyH: 5, roof: 0x4e5564,
  doors: [
    // The great door on the axis, and the lord's doors onto the great hall's dais and the chapel.
    { side: 's', at: KEEP.door.x - KEEP.door.w / 2 - x0, w: KEEP.door.w },
    { side: 'w', at: 11, w: 2 },
    { side: 'e', at: 11, w: 2 },
  ],
  windows: [
    { side: 's', at: 3.5 }, { side: 's', at: 20.5 },
    { side: 's', at: 4.5, floor: 1 }, { side: 's', at: 19.5, floor: 1 },
    { side: 'n', at: 6.5 }, { side: 'n', at: 17.5 },
    { side: 'n', at: 6.5, floor: 1 }, { side: 'n', at: 17.5, floor: 1 },
  ],
  // The throne's dais against the north wall on the axis, three steps up.
  raised: [{ rect: [8, 2, 16, 5], h: 0.5 }],
  stairs: [
    {
      x: 5, z: 21, w: 2, len: 4, dir: 'w', land0: [9, 21], land1: [1, 16],
      turns: [{ landing: [1, 21, 5, 23], flight: { x: 1, z: 17, w: 2, len: 4, dir: 'n' } }],
    },
    {
      x: 15, z: 21, w: 2, len: 4, dir: 'e', land0: [14, 21], land1: [22, 16],
      turns: [{ landing: [19, 21, 23, 23], flight: { x: 21, z: 17, w: 2, len: 4, dir: 'n' } }],
    },
  ],
  fits: [
    // The lord's high table on the dais, braziers either side of it, the hall's four great piers.
    { kind: 'high_table', x: 12, z: 3.5, block: [2.6, 1.4] },
    { kind: 'brazier', x: 6.5, z: 3.5, block: [0.4, 0.4] }, { kind: 'brazier', x: 17.5, z: 3.5, block: [0.4, 0.4] },
    ...[[5.5, 9.5], [18.5, 9.5], [5.5, 16.5], [18.5, 16.5]].map(([x, z]) => ({ kind: 'pillar', x, z, block: [0.5, 0.5] as [number, number] })),
  ],
  upper: {
    // Open over the hall from the council gallery to the south wall, and beside each stair.
    voids: [[6, 6, 18, 23], [3, 17, 6, 21], [18, 17, 21, 21]],
  },
};
