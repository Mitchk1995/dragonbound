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
  /** Height of the ground storey of a multi-storey building (upper-floor windows sit above it). */
  storeyH?: number;
  /**
   * Corner towers: square, `towers` cells a side (odd), centred on each outer corner cell, so a
   * quarter of each stands inside the corner room. What each one holds is in `turrets`.
   */
  towers?: number;
  /** What the corner towers are for (towers not listed are solid masonry). */
  turrets?: Turret[];
  /** The upper floor's rooms (a building with `storeyH`): its own interior walls and furnishings. */
  upper?: Storey;
}

export type Corner = 'nw' | 'ne' | 'sw' | 'se';

/**
 * A corner tower with a use. A spiral stair links the floors listed in `doors`; a well room opens
 * on the ground floor only. `doors` maps a floor to the side of the tower its door opens toward
 * (always into the building: e.g. the north-west tower opens 'e' or 's').
 */
export interface Turret {
  corner: Corner;
  use: 'stair' | 'well';
  doors: Partial<Record<0 | 1, Side>>;
}

export interface Storey {
  partitions?: Partition[];
  fits?: Fit[];
}

/** A floor of a building: 0 = ground, 1 = the upper floor. */
export type Floor = 0 | 1;

/** Interior walls / furnishings of a floor. */
export const partitionsOf = (b: BuildingSpec, floor: Floor = 0) => (floor ? b.upper?.partitions : b.partitions) ?? [];
export const fitsOf = (b: BuildingSpec, floor: Floor = 0) => (floor ? b.upper?.fits : b.fits) ?? [];

/** The corner cell (world) of a corner, and the unit direction pointing into the building. */
export function cornerCell(b: BuildingSpec, c: Corner) {
  const west = c[1] === 'w', north = c[0] === 'n';
  return { cx: west ? b.x : b.x + b.w - 1, cz: north ? b.z : b.z + b.d - 1, ix: west ? 1 : -1, iz: north ? 1 : -1 };
}

/** The tower standing on a cell, with the cell in the tower's inward frame (ti, tj in -h..h), if any. */
export function towerAt(b: BuildingSpec, cx: number, cz: number) {
  const S = b.towers ?? 0, h = (S - 1) / 2;
  if (!S) return null;
  for (const c of ['nw', 'ne', 'sw', 'se'] as Corner[]) {
    const k = cornerCell(b, c), tx = cx - k.cx, tz = cz - k.cz;
    if (Math.abs(tx) <= h && Math.abs(tz) <= h) {
      // Inward-facing coordinates: +ti / +tj point into the building.
      return { corner: c, ...k, ti: tx * k.ix, tj: tz * k.iz, h, turret: b.turrets?.find((t) => t.corner === c) };
    }
  }
  return null;
}

/** The ring cell a tower door passes through on a floor (world cell), or null. */
export function towerDoorCell(b: BuildingSpec, t: Turret, floor: Floor): [number, number] | null {
  const side = t.doors[floor];
  if (!side) return null;
  const k = cornerCell(b, t.corner), h = ((b.towers ?? 0) - 1) / 2;
  // A door toward ±x passes the ring at (h, 1) inward; toward ±z at (1, h).
  const alongX = side === 'e' || side === 'w';
  return alongX ? [k.cx + h * k.ix, k.cz + k.iz] : [k.cx + k.ix, k.cz + h * k.iz];
}

/** The cell inside a tower just through its door (the stair foot / the well-room floor). */
export function towerEntry(b: BuildingSpec, t: Turret): [number, number] {
  const k = cornerCell(b, t.corner);
  return [k.cx + k.ix, k.cz + k.iz];
}

/** Where you step out of a tower's door on a floor: the centre of the room cell beyond the door. */
export function towerExit(b: BuildingSpec, t: Turret, floor: Floor): { x: number; z: number } | null {
  const d = towerDoorCell(b, t, floor);
  if (!d) return null;
  const side = t.doors[floor]!, dx = side === 'e' ? 1 : side === 'w' ? -1 : 0, dz = side === 's' ? 1 : side === 'n' ? -1 : 0;
  return { x: d[0] + dx + 0.5, z: d[1] + dz + 0.5 };
}

/**
 * If (x, z) stands on the foot of a spiral stair on `floor`, where the stair comes out on the
 * other floor (the room just outside its door there) and the height of that floor.
 */
export function stairDest(b: BuildingSpec, x: number, z: number, floor: Floor): { x: number; z: number; floor: Floor; y: number } | null {
  for (const t of b.turrets ?? []) {
    if (t.use !== 'stair' || !t.doors[floor]) continue;
    const [ex, ez] = towerEntry(b, t);
    if (Math.floor(x) !== ex || Math.floor(z) !== ez) continue;
    const to: Floor = floor ? 0 : 1, out = towerExit(b, t, to);
    if (out) return { ...out, floor: to, y: to ? b.storeyH ?? 0 : 0 };
  }
  return null;
}

/** Cell bounds [x0, z0, x1, z1) of the whole footprint, towers included. */
export function footprint(b: BuildingSpec): [number, number, number, number] {
  const h = b.towers ? (b.towers - 1) / 2 : 0;
  return [b.x - h, b.z - h, b.x + b.w + h, b.z + b.d + h];
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

/** 'stair' is the foot of a spiral stair: walkable, and stepping onto it takes you to the other floor. */
export type CellRole = 'out' | 'wall' | 'door' | 'floor' | 'stair';

/** What a grid cell is for this building, on a floor (corner towers included). */
export function cellRole(b: BuildingSpec, cx: number, cz: number, floor: Floor = 0): CellRole {
  const t = towerAt(b, cx, cz);
  if (t) {
    if (Math.abs(t.ti) === t.h || Math.abs(t.tj) === t.h) {
      const d = t.turret && towerDoorCell(b, t.turret, floor);
      return d && d[0] === cx && d[1] === cz ? 'door' : 'wall';
    }
    // Inside: only the cell through the door is open (the steps and the newel, or the well, fill the rest).
    if (t.turret?.doors[floor] && t.ti === 1 && t.tj === 1) return t.turret.use === 'stair' ? 'stair' : 'floor';
    return 'wall';
  }
  const lx = cx - b.x, lz = cz - b.z;
  if (lx < 0 || lz < 0 || lx >= b.w || lz >= b.d) return 'out';
  const edgeX = lx === 0 || lx === b.w - 1, edgeZ = lz === 0 || lz === b.d - 1;
  if (!edgeX && !edgeZ) {
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

/** World cell rectangles [x0, z0, x1, z1) of the corner towers (each centred on its corner cell). */
export function towerRects(b: BuildingSpec): [number, number, number, number][] {
  const S = b.towers ?? 0, h = (S - 1) / 2;
  if (!S) return [];
  return (['nw', 'ne', 'sw', 'se'] as Corner[]).map((c) => {
    const k = cornerCell(b, c);
    return [k.cx - h, k.cz - h, k.cx + h + 1, k.cz + h + 1] as [number, number, number, number];
  });
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
