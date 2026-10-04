import type { Rot } from './scale';
import type { Line } from './walls';

/**
 * The plan of the first hub-town house built from the kit, a baker's shop with the family's room over
 * it: its footprint and heights, where its door, stair, oven and chimney stand, its colours, and the
 * posts and bays of its timber-framed upper floor. house.ts, houseRoof.ts and houseInside.ts build it.
 *
 * Grid (cells across, steps up): the walls stand on x 0–25 (west to east) and z 0–18 (back to front;
 * the front faces the camera, +z).
 */
export const H = {
  /** The plinth course; the walls start on it, the floor's flags lie inside it. */
  plinth: 3,
  walk: 4,
  /** Ground floor windows: sills, frames, the flat arches over them; the door's head. */
  sill: 9,
  window: 10,
  head: 18,
  doorHead: 21,
  /** Seven courses of stone, then the floor frame, then the boards. */
  wallTop: 24,
  frameTop: 26,
  upperWalk: 26.5,
  /** The upper floor's frame: the girding rail, the windows over it, their head rails, the wall plate (the eaves on top of it). */
  upSill: 29,
  upWindow: 31,
  upHead: 40,
  plate: 44,
  eaves: 46,
} as const;

/**
 * The walls' footprint, and the stubs (steps) the walls on the camera's side are cut down to while the
 * hero is inside: on the ground floor up to the windows' sills; upstairs up to the girding rail under
 * the windows (their window boxes stay).
 */
export const HOUSE = { x0: 0, z0: 0, x1: 25, z1: 18, stubGround: 9, stubUpper: 31 } as const;

/**
 * The door (its frame's corner and width); the stair: treads along the back wall from `foot` to `top`
 * (exclusive) climbing east from a landing in the north-west corner, and the well over it.
 */
export const DOOR = { x: 10, w: 5 } as const;
export const STAIR = { foot: 4, top: 18, z0: 1, z1: 5, well: [4, 18, 1, 5] as const } as const;
/** The chimney stack outside the east gable, over the oven. */
export const STACK = { x: 25, z: 1 } as const;

/** The house's colours (sRGB): cream limestone, darker plinth and floor, dark oak, lime plaster, terracotta. */
export const C = {
  stone: 0xdcc9a1, plinth: 0xa99e88, flags: 0xb3a88f, step: 0xbcae92,
  timber: 0x5e4029, joist: 0x5a3c27, frame: 0x6a4529, bars: 0xe8e1cf, door: 0x7a4026, iron: 0x3c3a39,
  plaster: 0xf0e7d6, boards: 0x9a6b42, roof: 0x8c503e, ridge: 0x7a4535, shutter: 0x6e8c78,
} as const;

export type Side = 'S' | 'N' | 'E' | 'W';
export const SIDES: Side[] = ['S', 'N', 'E', 'W'];
/** The turn that faces a piece's front out of each side. */
export const OUT: Record<Side, Rot> = { S: 0, N: 2, E: 1, W: 3 };

/** The line of cells of one side of the box [x0, z0, x1, z1). */
export function sideLine(s: Side, x0: number, z0: number, x1: number, z1: number): Line {
  if (s === 'S') return { axis: 'x', at: z1 - 1, from: x0, to: x1 };
  if (s === 'N') return { axis: 'x', at: z0, from: x0, to: x1 };
  if (s === 'E') return { axis: 'z', at: x1 - 1, from: z0, to: z1 };
  return { axis: 'z', at: x0, from: z0, to: z1 };
}

/** The cell on side s at position `pos` along it (x on the fronts, z on the ends). */
function cellOn(s: Side, pos: number): [number, number] {
  const { x0, z0, x1, z1 } = HOUSE;
  return s === 'S' ? [pos, z1 - 1] : s === 'N' ? [pos, z0] : s === 'E' ? [x1 - 1, pos] : [x0, pos];
}

/** Where a piece starting at `pos` on side s stands: [x, y, z] (a piece turned out of the side runs along it from there). */
export function at(s: Side, pos: number, y: number): [number, number, number] {
  const [x, z] = cellOn(s, pos);
  return [x, y, z];
}

/**
 * What stands while the hero is inside, on the ground floor or upstairs, as the game's buildings do:
 * the roof lifts off, and the walls on the camera's side come down to a stub (on the ground floor up
 * to the sills; upstairs up to the girding rail, its window boxes kept). On the ground floor the
 * whole upper storey goes too.
 */
export type Cut = 'none' | 'ground' | 'upper';
export function standsIn(cut: Cut, part: string, y: number, h: number): boolean {
  if (cut === 'none') return true;
  if (part === 'roof' || part === 'stackR') return false;
  if (cut === 'ground') {
    if (part === 'stackU' || part.startsWith('u')) return false;
    return part === 'gS' || part === 'door' ? y + h <= HOUSE.stubGround : true;
  }
  return part === 'uS' ? y + h <= HOUSE.stubUpper : true;
}

/** The joists (each spanning front to back, at these cells across x), and the trimmer carrying those the stairwell cuts. */
export const JOISTS = [2, 5, 8, 11, 14, 17, 20, 23];
export const TRIMMER_Z = STAIR.z1;

/** Is (x, z) in the stairwell? */
export const inWell = (x: number, z: number) => x >= STAIR.well[0] && x < STAIR.well[1] && z >= STAIR.well[2] && z < STAIR.well[3];

/** A bay of an upper wall between two posts: a window, a braced panel, or two panels on a middle rail. */
export interface Bay {
  from: number;
  to: number;
  kind: 'window' | 'braced' | 'railed';
  dir?: 1 | -1;
}

/**
 * The upper walls' posts and bays (positions along each side: x on the fronts, z on the ends). A
 * braced bay's `dir` is the way its brace rises seen from outside (1 to the right): every brace rises
 * toward its corner post.
 */
export const FRAMES: Record<Side, { posts: number[]; bays: Bay[] }> = {
  S: {
    posts: [0, 3, 6, 10, 14, 18, 21, 24],
    bays: [{ from: 1, to: 3, kind: 'braced', dir: -1 }, { from: 4, to: 6, kind: 'window' }, { from: 7, to: 10, kind: 'railed' }, { from: 11, to: 14, kind: 'window' },
      { from: 15, to: 18, kind: 'railed' }, { from: 19, to: 21, kind: 'window' }, { from: 22, to: 24, kind: 'braced', dir: 1 }],
  },
  N: {
    posts: [0, 3, 6, 10, 14, 18, 21, 24],
    bays: [{ from: 1, to: 3, kind: 'braced', dir: 1 }, { from: 4, to: 6, kind: 'window' }, { from: 7, to: 10, kind: 'railed' }, { from: 11, to: 14, kind: 'railed' },
      { from: 15, to: 18, kind: 'railed' }, { from: 19, to: 21, kind: 'window' }, { from: 22, to: 24, kind: 'braced', dir: -1 }],
  },
  W: { posts: [5, 8, 12], bays: [{ from: 1, to: 5, kind: 'braced', dir: -1 }, { from: 6, to: 8, kind: 'window' }, { from: 9, to: 12, kind: 'railed' }, { from: 13, to: 17, kind: 'braced', dir: 1 }] },
  E: { posts: [5, 9, 12], bays: [{ from: 1, to: 5, kind: 'braced', dir: 1 }, { from: 6, to: 9, kind: 'railed' }, { from: 10, to: 12, kind: 'window' }, { from: 13, to: 17, kind: 'braced', dir: -1 }] },
};
