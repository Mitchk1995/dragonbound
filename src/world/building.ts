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

export type BuildingStyle = 'hall' | 'stone' | 'timber';

/** What furnishes the inside (and, for plots, what the restored building is for). */
export type Interior = 'hall' | 'smelter' | 'bank' | 'vault' | 'shop' | 'alchemy' | 'rune' | 'hatchery';

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
export function fitBlocks(b: BuildingSpec, cx: number, cz: number) {
  return (b.fits ?? []).some((f) => f.block && Math.abs(cx + 0.5 - (b.x + f.x)) <= f.block[0] && Math.abs(cz + 0.5 - (b.z + f.z)) <= f.block[1]);
}

export type CellRole = 'out' | 'wall' | 'door' | 'floor';

/** What a grid cell is for this building. */
export function cellRole(b: BuildingSpec, cx: number, cz: number): CellRole {
  const lx = cx - b.x, lz = cz - b.z;
  if (lx < 0 || lz < 0 || lx >= b.w || lz >= b.d) return 'out';
  const edgeX = lx === 0 || lx === b.w - 1, edgeZ = lz === 0 || lz === b.d - 1;
  if (!edgeX && !edgeZ) return 'floor';
  // Corners are always wall; doorways sit along the straight runs.
  if (edgeX && edgeZ) return 'wall';
  const side: Side = lz === 0 ? 'n' : lz === b.d - 1 ? 's' : lx === 0 ? 'w' : 'e';
  return isDoor(b, side, side === 'n' || side === 's' ? lx : lz) ? 'door' : 'wall';
}

/**
 * Is a point inside the building (its floor, or standing in a doorway)? `margin` reaches into the
 * wall ring, so the roof starts lifting as the hero steps through the door.
 */
export function inRoom(b: BuildingSpec, x: number, z: number, margin = 0.9) {
  return x > b.x + 1 - margin && x < b.x + b.w - 1 + margin && z > b.z + 1 - margin && z < b.z + b.d - 1 + margin;
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
