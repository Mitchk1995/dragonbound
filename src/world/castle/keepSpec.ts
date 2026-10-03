import type { BuildingSpec, Side } from '../building';
import { CURTAIN, GROW, KEEP, RANGE } from './plan';
import type { Site } from './site';

/**
 * The great keep as an enterable building (its model is keepModel.ts): a 32 m square on the axis,
 * its floor the terrace's, a round turret on each corner rising a stage over its machicolated
 * parapet to a blue spire, a frontispiece on the axis carrying the great door, the showpiece window
 * and the lord's crest between two pinnacles, and its back half standing out of the moat on a
 * battered plinth. Inside, the throne hall rises the whole height to the great chamber's floor;
 * galleries run round its north, west and east sides at the wall walk's level, each side reached by
 * a stair of two flights from beside the great door, along the south wall to a half landing (where a
 * door opens into the front turret's spiral stair) and up the side wall through the gallery's floor.
 * Cells are local to the keep's corner (KEEP.rect); heights are over its floor.
 */
const [x0, z0, x1, z1] = KEEP.rect;

/** The keep's heights over its floor (the terrace's level, two and a half metres over the crown). */
export const KEEP_H = {
  /** The galleries' floor, at the wall walk's own level (the walk at +9.06 over the crown). */
  gallery: 6.5,
  /** The wall walk's deck where it comes in at the galleries' doors. */
  walk: 6.56,
  /** The great chamber's floor: the throne hall's ceiling. */
  chamber: 23.5,
  /** The string courses on the walls and turrets (their feet). */
  courses: [8.5, 23.5],
  /** The walls' faces rise to the machicolations, which carry the parapet out over the roof deck. */
  corbels: 29.5,
  deck: 31,
  /** The parapet's foot (on the corbels' tips) and its coping's foot; merlons stand on the coping. */
  parapet: 31,
  coping: 32.5,
  /** The plinth's foot, founded on the moat's rock bed (MOAT.bed, sunk a little into it). */
  plinth: -9,
} as const;

/** The keep's side, in cells. */
const S = KEEP.rect[2] - KEEP.rect[0];

/** The four corner turrets on the keep's corners (local), the spiral stairs in the front pair. */
export const TURRET = { r: 4.7, shaft: 39, deck: 40.5, spireTip: 54.5 } as const;
export const TURRETS = [
  { x: 0, z: 0, front: false },
  { x: S, z: 0, front: false },
  { x: 0, z: S, front: true },
  { x: S, z: S, front: true },
] as const;

/** The frontispiece on the axis: x0..x1 along the front, standing `out` proud of it, its body to `top`; a pinnacle on each front corner. */
export const FRONTISPIECE = { x0: 11, x1: 21, out: 2, top: 36, pinnacle: { r: 1.2, top: 39.5, tip: 43.5 } } as const;

/** The great door: its arch through the frontispiece (7 wide, apex at 10.5) and the doorway in the wall behind (6 wide, square head at 5.5). */
export const GREAT_DOOR = { arch: 7, apex: 10.5, w: KEEP.door.w, head: 5.5 } as const;

/**
 * The keep's windows, each on a face's outer wall (u along the face from its low end: x for the north
 * and south faces, z for the west and east), its sill and size over the floor. Sizes fall storey by
 * storey (small lancets low, tall lancets, paired lights, small square-headed lights under the
 * parapet), one showpiece over the great door. `chamber`: it lights the closed great chamber (a lit
 * room behind it); the rest light the throne hall itself.
 */
export interface KeepWindow {
  side: Side;
  u: number;
  sill: number;
  w: number;
  h: number;
  kind: 'lancet' | 'pair' | 'square' | 'showpiece';
  chamber?: boolean;
}

const lancet = (side: Side, u: number, sill: number): KeepWindow => ({ side, u, sill, w: 1.2, h: 3, kind: 'lancet' });
const tall = (side: Side, u: number): KeepWindow => ({ side, u, sill: 10, w: 1.8, h: 5.5, kind: 'lancet' });
const pair = (side: Side, u: number): KeepWindow => ({ side, u, sill: 17.5, w: 2.9, h: 3.5, kind: 'pair' });
const small = (side: Side, u: number): KeepWindow => ({ side, u, sill: 25.5, w: 1.3, h: 2, kind: 'square', chamber: true });

/** The galleries' doors onto the north wall walks (west and east flanks), on the walk's middle. */
export const WALK_DOOR_U = CURTAIN.north + 0.445 - z0;

export const KEEP_WINDOWS: KeepWindow[] = [
  // The front: the showpiece over the great door; in each side bay (under the lord's banners) a small
  // lancet over the hall stair and a small light high in the great chamber.
  { side: 's', u: S / 2, sill: 12.5, w: 5.5, h: 10, kind: 'showpiece' },
  ...[7.7, S - 7.7].flatMap((u) => [lancet('s', u, 3), small('s', u)]),
  // The back, over the moat: two axes, each a small lancet under the council gallery, a tall lancet
  // and a pair of lights in the hall, a small light in the great chamber; one more over the throne.
  ...[8.7, S - 8.7].flatMap((u) => [lancet('n', u, 2.5), tall('n', u), pair('n', u), small('n', u)]),
  small('n', S / 2),
  // The flanks, over the great hall's and the chapel's roofs: a pair of lights over the wall walk's
  // door, and small lights in the great chamber.
  ...(['w', 'e'] as Side[]).flatMap((s) => [pair(s, WALK_DOOR_U), small(s, WALK_DOOR_U), small(s, 14), small(s, 24.7)]),
];

/** Where the great hall and the chapel stand against the keep's flanks (z along them, local). */
export const RANGE_ON_FLANK: [number, number] = [RANGE.hall[1] - z0, RANGE.hall[3] - z0];

export const KEEP_SPEC: BuildingSpec = {
  id: 'keep', style: 'keep', interior: 'keep', x: x0, z: z0, w: x1 - x0, d: z1 - z0,
  // Its walls to the roof deck; the galleries' floor a hair under the wall walk (on a course line).
  wallH: KEEP_H.deck + 1, storeyH: KEEP_H.gallery, roof: 0x4e5564,
  doors: [
    // The great door on the axis, and the lord's doors onto the great hall's dais and the chapel.
    { side: 's', at: KEEP.door.x - KEEP.door.w / 2 - x0, w: KEEP.door.w },
    { side: 'w', at: 15, w: 3 },
    { side: 'e', at: 15, w: 3 },
  ],
  // (The same windows, by storey: the throne hall's low windows, and those over the galleries' floor.)
  windows: KEEP_WINDOWS.filter((w) => w.kind !== 'showpiece').map((w) => ({ side: w.side, at: w.u, ...(w.sill >= KEEP_H.gallery ? { floor: 1 } : {}) })),
  // The throne's dais against the north wall on the axis, three steps up.
  raised: [{ rect: [11, 3, 21, 8], h: 0.5 }],
  stairs: [
    {
      x: 7, z: 28, w: 3, len: 6, dir: 'w', land0: [13, 28], land1: [1, 21],
      turns: [{ landing: [1, 28, 7, 31], flight: { x: 1, z: 22, w: 3, len: 6, dir: 'n' } }],
    },
    {
      x: 19, z: 28, w: 3, len: 6, dir: 'e', land0: [18, 28], land1: [28, 21],
      turns: [{ landing: [25, 28, 31, 31], flight: { x: 28, z: 22, w: 3, len: 6, dir: 'n' } }],
    },
  ],
  fits: [
    // The lord's high table on the dais, braziers either side of it, the hall's four great piers.
    { kind: 'high_table', x: S / 2, z: 5.3, block: [2.6 * GROW, 1.4 * GROW], s: GROW },
    { kind: 'brazier', x: 8.7, z: 5.3, block: [0.4 * GROW, 0.4 * GROW], s: GROW }, { kind: 'brazier', x: S - 8.7, z: 5.3, block: [0.4 * GROW, 0.4 * GROW], s: GROW },
    ...[[7.5, 12.5], [S - 7.5, 12.5], [7.5, 21.5], [S - 7.5, 21.5]].map(([x, z]) => ({ kind: 'pillar', x, z, block: [0.65, 0.65] as [number, number] })),
  ],
  upper: {
    // Open over the hall from the council gallery to the south wall, and over each stair and its half
    // landing (the galleries stop short of the south wall, so the great door and the showpiece window
    // rise clear, and the landing's door into the turret stands clear under the open well).
    voids: [[8, 8, 24, 31], [1, 22, 8, 31], [24, 22, 31, 31]],
  },
};

/**
 * The keep's masses standing outside its walls on the terrace's grid: the front turrets' drums and
 * the frontispiece with its pinnacles block the cells they stand on (the great door's porch stays
 * open). The back turrets stand out over the moat.
 */
export function keepGround(s: Site) {
  const block = (x: number, z: number) => {
    if (!s.G.inside(x, z)) return;
    // (Not the keep's own cells: its walls and floor are its spec's.)
    if (x >= x0 && x < x1 && z >= z0 && z < z1) return;
    s.block(s.G.idx(x, z));
  };
  for (const t of TURRETS.filter((q) => q.front)) {
    const R = TURRET.r + 0.3, cx = x0 + t.x, cz = z0 + t.z;
    for (let z = Math.floor(cz - R); z <= cz + R; z++) for (let x = Math.floor(cx - R); x <= cx + R; x++) {
      if (Math.hypot(x + 0.5 - cx, z + 0.5 - cz) < R) block(x, z);
    }
  }
  const F = FRONTISPIECE, door = [KEEP.door.x - KEEP.door.w / 2, KEEP.door.x + KEEP.door.w / 2];
  for (let z = z1; z < z1 + 4; z++) for (let x = x0 + F.x0 - 2; x < x0 + F.x1 + 2; x++) {
    if (x >= door[0] && x < door[1]) continue;
    const pin = [F.x0, F.x1].some((px) => Math.hypot(x + 0.5 - x0 - px, z + 0.5 - (z1 + 1.3)) < F.pinnacle.r + 0.6);
    if (pin || (x >= x0 + F.x0 && x < x0 + F.x1 && z + 0.5 < z1 + F.out + 0.3)) block(x, z);
  }
}
