/**
 * Enterable buildings. One plain-data spec drives both the nav grid (walls block, doorways and the
 * interior are walkable) and the model built in props.ts, so what you see is exactly where you can
 * walk. Specs live on whole cells: the outer ring of cells is the wall, everything inside is floor.
 */

/** Wall side of a building: n = low z (away from the camera), s = high z (facing the camera). */
export type Side = 'n' | 's' | 'e' | 'w';

export interface Doorway {
  side: Side;
  /** First open cell, counted along the wall from its low end (x for n/s walls, z for e/w walls). */
  at: number;
  /** Width in cells. */
  w: number;
}

export interface Window {
  side: Side;
  /** Window centre along the wall, in cells from its low end. */
  at: number;
  /** Storey: 0 = ground floor (default), 1 = the upper floor of a building with `storeyH`. */
  floor?: number;
}

/**
 * An interior wall on the grid: a straight line of cells, `axis` 'x' runs along x at local z = `at`
 * (cells `from`..`to`-1), 'z' runs along z at local x = `at`. Doorways are [first cell, width] along it.
 */
export interface Partition {
  axis: 'x' | 'z';
  at: number;
  from: number;
  to: number;
  doors?: [number, number][];
  /** A panelled oak screen (the hall's screens) rather than a stone wall: it stops short of the ceiling. */
  screen?: boolean;
}

/** A piece of furniture or fitting inside (tables, pillars, shelves, the hearth…). */
export interface Fit {
  kind: string;
  /** Position in cells from the building's min corner (floats: 5.5 is a cell centre). */
  x: number;
  z: number;
  /** Facing (radians, 0 = +Z, toward the camera). */
  rot?: number;
  /** Length of long pieces (tables, rugs). */
  len?: number;
  /** Half-extents in cells (world axes) of the floor it blocks; omitted = walk over it (rugs, wall hangings). */
  block?: [number, number];
}

export type BuildingStyle = 'hall' | 'stone' | 'timber' | 'keep';

/** What furnishes the inside (and, for plots, what the restored building is for). */
export type Interior = 'keep' | 'hall' | 'smelter' | 'bank' | 'vault' | 'shop' | 'alchemy' | 'rune' | 'hatchery';

export interface BuildingSpec {
  id: string;
  style: BuildingStyle;
  interior: Interior;
  /** Min corner cell and outer size in cells (walls included). */
  x: number;
  z: number;
  w: number;
  d: number;
  /** Eave height of the walls. */
  wallH: number;
  roof: number;
  doors: Doorway[];
  windows: Window[];
  /** Sides whose wall belongs to a neighbour sharing it (not drawn twice; still blocks). */
  shared?: Side[];
  fits?: Fit[];
  /** Roof: a gable (ridge along the longer side) or a flat crenellated deck. */
  roofKind?: 'gable' | 'flat';
  /** Restoration id: ruined foundations until restored. */
  restore?: string;
  /** Interior walls dividing the floor into rooms. */
  partitions?: Partition[];
  /**
   * Walls this building shares with a neighbour of the same height whose roof continues its own:
   * no parapet stands on them, so the two roofs read as one.
   */
  joined?: Side[];
  /** Height of the ground storey of a multi-storey building (upper-floor windows sit above it). */
  storeyH?: number;
  /** Stairs between the ground and upper floors (a building with an `upper` floor). */
  stairs?: Stair[];
  /** The upper floor's rooms (a building with `storeyH`): its own interior walls and furnishings. */
  upper?: Storey;
}

/**
 * A straight stair between the floors: a flight `w` cells across and `len` cells long, its
 * rectangle starting at local cell (x, z), climbing toward `dir` from its foot row to its head row.
 * On the ground floor the foot row is the stair (stepping onto it takes you up) and the rest of the
 * flight is solid; upstairs the head row is the stair (stepping onto it takes you down) and the rest
 * is the open stairwell. You arrive beside it, on local cell `land0` (ground) or `land1` (upstairs).
 */
export interface Stair {
  x: number;
  z: number;
  w: number;
  len: number;
  dir: Side;
  land0: [number, number];
  land1: [number, number];
}

export interface Storey {
  partitions?: Partition[];
  fits?: Fit[];
  /** Local cell rectangles [x0, z0, x1, z1) open to the floor below (a hall open to its roof): no floor up here. */
  voids?: [number, number, number, number][];
}

/** A floor of a building: 0 = ground, 1 = the upper floor. */
export type Floor = 0 | 1;

/** Interior walls / furnishings of a floor. */
export const partitionsOf = (b: BuildingSpec, floor: Floor = 0) => (floor ? b.upper?.partitions : b.partitions) ?? [];
export const fitsOf = (b: BuildingSpec, floor: Floor = 0) => (floor ? b.upper?.fits : b.fits) ?? [];

/** A stair's flight rectangle [x0, z0, x1, z1) in local cells. */
export function stairRect(st: Stair): [number, number, number, number] {
  const alongZ = st.dir === 'n' || st.dir === 's';
  return alongZ ? [st.x, st.z, st.x + st.w, st.z + st.len] : [st.x, st.z, st.x + st.len, st.z + st.w];
}

/** Is local cell (lx, lz) on the stair's foot row (floor 0) or head row (floor 1)? */
function onStairEnd(st: Stair, lx: number, lz: number, floor: Floor) {
  const [x0, z0, x1, z1] = stairRect(st);
  if (lx < x0 || lx >= x1 || lz < z0 || lz >= z1) return false;
  // The low end of the rectangle is the foot when the flight climbs toward +x / +z.
  const low = st.dir === 's' || st.dir === 'e', atLow = st.dir === 'n' || st.dir === 's' ? lz === z0 : lx === x0;
  const atHigh = st.dir === 'n' || st.dir === 's' ? lz === z1 - 1 : lx === x1 - 1;
  return floor === 0 ? (low ? atLow : atHigh) : low ? atHigh : atLow;
}

/** The stair whose flight covers local cell (lx, lz), if any. */
const stairOn = (b: BuildingSpec, lx: number, lz: number) =>
  (b.stairs ?? []).find((st) => {
    const [x0, z0, x1, z1] = stairRect(st);
    return lx >= x0 && lx < x1 && lz >= z0 && lz < z1;
  });

/** Is local cell (lx, lz) open to the floor below on the upper floor? */
export const isVoid = (b: BuildingSpec, lx: number, lz: number) => (b.upper?.voids ?? []).some(([x0, z0, x1, z1]) => lx >= x0 && lx < x1 && lz >= z0 && lz < z1);

/**
 * If (x, z) stands on a stair's foot (ground) or head (upstairs), where it brings you on the other
 * floor (the cell beside the stair there) and that floor's height.
 */
export function stairDest(b: BuildingSpec, x: number, z: number, floor: Floor): { x: number; z: number; floor: Floor; y: number } | null {
  const lx = Math.floor(x) - b.x, lz = Math.floor(z) - b.z;
  for (const st of b.stairs ?? []) {
    if (!onStairEnd(st, lx, lz, floor)) continue;
    const to: Floor = floor ? 0 : 1, [ax, az] = to ? st.land1 : st.land0;
    return { x: b.x + ax + 0.5, z: b.z + az + 0.5, floor: to, y: to ? b.storeyH ?? 0 : 0 };
  }
  return null;
}

/** Cell bounds [x0, z0, x1, z1) of the footprint. */
export function footprint(b: BuildingSpec): [number, number, number, number] {
  return [b.x, b.z, b.x + b.w, b.z + b.d];
}

/** Wall length in cells along a side. */
export const sideLen = (b: BuildingSpec, side: Side) => (side === 'n' || side === 's' ? b.w : b.d);

/** The cell at offset `t` along a side's wall. */
export function wallCell(b: BuildingSpec, side: Side, t: number): [number, number] {
  switch (side) {
    case 'n': return [b.x + t, b.z];
    case 's': return [b.x + t, b.z + b.d - 1];
    case 'w': return [b.x, b.z + t];
    case 'e': return [b.x + b.w - 1, b.z + t];
  }
}

/** True if offset `t` along `side` is inside one of its doorways. */
export const isDoor = (b: BuildingSpec, side: Side, t: number) => b.doors.some((d) => d.side === side && t >= d.at && t < d.at + d.w);

/** True if a fitting blocks this grid cell. */
export function fitBlocks(b: BuildingSpec, cx: number, cz: number, floor: Floor = 0) {
  return fitsOf(b, floor).some((f) => f.block && Math.abs(cx + 0.5 - (b.x + f.x)) <= f.block[0] && Math.abs(cz + 0.5 - (b.z + f.z)) <= f.block[1]);
}

/**
 * 'stair' is a stair's end on this floor: walkable, and stepping onto it takes you to the other
 * floor. A stair's flight (and, upstairs, its well) and the upper floor's voids are 'wall'.
 */
export type CellRole = 'out' | 'wall' | 'door' | 'floor' | 'stair';

/** What a grid cell is for this building, on a floor. */
export function cellRole(b: BuildingSpec, cx: number, cz: number, floor: Floor = 0): CellRole {
  const lx = cx - b.x, lz = cz - b.z;
  if (lx < 0 || lz < 0 || lx >= b.w || lz >= b.d) return 'out';
  const edgeX = lx === 0 || lx === b.w - 1, edgeZ = lz === 0 || lz === b.d - 1;
  if (!edgeX && !edgeZ) {
    const st = stairOn(b, lx, lz);
    if (st) return onStairEnd(st, lx, lz, floor) ? 'stair' : 'wall';
    if (floor && isVoid(b, lx, lz)) return 'wall';
    const p = partitionAt(b, lx, lz, floor);
    return !p ? 'floor' : p.door ? 'door' : 'wall';
  }
  // Corners are always wall; doorways sit along the straight runs (the upper floor has none outside).
  if ((edgeX && edgeZ) || floor) return 'wall';
  const side: Side = lz === 0 ? 'n' : lz === b.d - 1 ? 's' : lx === 0 ? 'w' : 'e';
  return isDoor(b, side, side === 'n' || side === 's' ? lx : lz) ? 'door' : 'wall';
}

/** Can you stand on this cell of a building's floor (open floor, a doorway or a stair foot, clear of furniture)? */
export function walkable(b: BuildingSpec, cx: number, cz: number, floor: Floor = 0) {
  const r = cellRole(b, cx, cz, floor);
  return r === 'door' || r === 'stair' || (r === 'floor' && !fitBlocks(b, cx, cz, floor));
}

/**
 * The upper-floor walk grid of a zone (same size as its cells, 0 = open): everything is solid
 * except the upper floors of multi-storey buildings.
 */
export function upperCells(w: number, h: number, buildings: BuildingSpec[]): Uint8Array {
  const cells = new Uint8Array(w * h).fill(4);
  for (const b of buildings) {
    if (!b.upper) continue;
    const [x0, z0, x1, z1] = footprint(b);
    for (let z = Math.max(0, z0); z < Math.min(h, z1); z++) for (let x = Math.max(0, x0); x < Math.min(w, x1); x++) {
      if (walkable(b, x, z, 1)) cells[z * w + x] = 0;
    }
  }
  return cells;
}

/**
 * Is a point inside the building (its floor, or standing in a doorway)? `margin` reaches into the
 * wall ring, so the roof starts lifting as the hero steps through the door.
 */
export function inRoom(b: BuildingSpec, x: number, z: number, margin = 0.9) {
  return x > b.x + 1 - margin && x < b.x + b.w - 1 + margin && z > b.z + 1 - margin && z < b.z + b.d - 1 + margin;
}

/** The interior wall on local cell (lx, lz), if any, and whether that cell is one of its doorways. */
export function partitionAt(b: BuildingSpec, lx: number, lz: number, floor: Floor = 0) {
  for (const p of partitionsOf(b, floor)) {
    const [across, along] = p.axis === 'x' ? [lz, lx] : [lx, lz];
    if (across !== p.at || along < p.from || along >= p.to) continue;
    return { p, door: (p.doors ?? []).some(([a, w]) => along >= a && along < a + w) };
  }
  return null;
}

/** Solid runs of an interior wall between its doorways: [start, end) in cells along it. */
export function partitionRuns(p: Partition): [number, number][] {
  const runs: [number, number][] = [];
  let s = p.from;
  for (const [a, w] of [...(p.doors ?? [])].sort((x, y) => x[0] - y[0])) {
    if (a > s) runs.push([s, a]);
    s = Math.max(s, a + w);
  }
  if (p.to > s) runs.push([s, p.to]);
  return runs;
}

/** Solid wall runs along a side, between doorways: [start, end) in cells from the low end. */
export function wallRuns(b: BuildingSpec, side: Side): [number, number][] {
  const n = sideLen(b, side), runs: [number, number][] = [];
  let s = -1;
  for (let t = 0; t <= n; t++) {
    const solid = t < n && !isDoor(b, side, t);
    if (solid && s < 0) s = t;
    if (!solid && s >= 0) {
      runs.push([s, t]);
      s = -1;
    }
  }
  return runs;
}

/** Centre of the building's floor. */
export const centre = (b: BuildingSpec) => ({ x: b.x + b.w / 2, z: b.z + b.d / 2 });
