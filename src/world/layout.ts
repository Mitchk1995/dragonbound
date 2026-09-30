import { mulberry32, type Rng } from '../core/rng';
import type { Vec2 } from '../types';

/** Walkability/visual class of a grid cell. Everything except Ground blocks movement. */
export enum Cell {
  Ground = 0,
  Tree = 1,
  Rock = 2,
  Cliff = 3,
  /** Cave or castle wall. */
  Wall = 4,
  /** Empty sky around a floating island. */
  Void = 5,
  /** Occupied by a prop/station; drawn by the prop itself. */
  Blocked = 6,
}

export enum Ground {
  Dirt = 0,
  Path = 1,
  Arena = 2,
  Camp = 3,
  Stone = 4,
  Cave = 5,
  Grass = 6,
  Scorch = 7,
}

export interface PackSpawn {
  x: number;
  z: number;
  comp: string[];
}

export type StationKind = 'portal' | 'exit' | 'bank' | 'furnace' | 'anvil' | 'shop' | 'npc' | 'restore' | 'chest' | 'gate' | 'pedestal';

export interface StationSpawn {
  kind: StationKind;
  /** Portal destination, NPC id, restoration id, pedestal index… */
  id: string;
  x: number;
  z: number;
  /** Facing angle (radians, 0 = +Z). */
  rot?: number;
}

export interface PropSpawn {
  kind: string;
  x: number;
  z: number;
  rot?: number;
  s?: number;
  /** Builder argument for length-based props (bridge span, rail length). */
  len?: number;
}

/** Liquid in a cell: rendered as a lowered bed with an animated surface. Bridges are walkable cells over it. */
export enum Fluid {
  None = 0,
  Water = 1,
  Lava = 2,
}

export interface ZoneLayout {
  w: number;
  h: number;
  cells: Uint8Array;
  ground: Uint8Array;
  /** Fluid per cell (Fluid enum). */
  fluid: Uint8Array;
  /** Terrain height for raised cells (cliffs, plateaus, cave rock); 0 = use the default for the cell. */
  elev: Float32Array;
  entry: Vec2;
  packs: PackSpawn[];
  boss?: { id: string; x: number; z: number; r: number };
  nodes: { ore: string; x: number; z: number }[];
  stations: StationSpawn[];
  props: PropSpawn[];
}

export const emptyLayout = (w: number, h: number): ZoneLayout => ({
  w, h, cells: new Uint8Array(w * h), ground: new Uint8Array(w * h), fluid: new Uint8Array(w * h), elev: new Float32Array(w * h),
  entry: { x: w / 2, z: h / 2 }, packs: [], nodes: [], stations: [], props: [],
});

/** Mark a disc of cells around a station/prop as blocked so the player walks up to it, not through it. */
export function blockDisc(l: ZoneLayout, x: number, z: number, r: number) {
  for (let cz = Math.floor(z - r); cz <= Math.floor(z + r); cz++) {
    for (let cx = Math.floor(x - r); cx <= Math.floor(x + r); cx++) {
      if (cx < 0 || cz < 0 || cx >= l.w || cz >= l.h) continue;
      if (Math.hypot(cx + 0.5 - x, cz + 0.5 - z) <= r) l.cells[cz * l.w + cx] = Cell.Blocked;
    }
  }
}

// ─── ASCII maps ─────────────────────────────────────────────────────────────

export interface Legend {
  [ch: string]: {
    cell?: Cell;
    ground?: Ground;
    /** Called with the cell centre for spawns/stations/props. */
    on?: (l: ZoneLayout, x: number, z: number) => void;
  };
}

/**
 * Parse an ASCII map (rows top = north = low z). Characters not in the legend are ground.
 * Each character is one 1×1 cell.
 */
export function parseAscii(rows: string[], legend: Legend, defaultGround = Ground.Dirt): ZoneLayout {
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const l = emptyLayout(w, h);
  const deferred: (() => void)[] = [];
  for (let z = 0; z < h; z++) {
    for (let x = 0; x < w; x++) {
      const ch = rows[z][x] ?? ' ';
      const i = z * w + x;
      const e = legend[ch];
      l.cells[i] = e?.cell ?? Cell.Ground;
      l.ground[i] = e?.ground ?? defaultGround;
      if (e?.on) deferred.push(() => e.on!(l, x + 0.5, z + 0.5));
    }
  }
  // Stations block their surroundings, so run spawns after the grid is filled.
  for (const f of deferred) f();
  return l;
}

// ─── Value noise ────────────────────────────────────────────────────────────

export function makeNoise(rng: Rng) {
  const size = 256;
  const perm = new Uint8Array(size * 2);
  const vals = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    perm[i] = i;
    vals[i] = rng();
  }
  for (let i = size - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  for (let i = 0; i < size; i++) perm[i + size] = perm[i];
  const v = (x: number, y: number) => vals[perm[(perm[x & 255] + y) & 511] & 255];
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const noise = (x: number, y: number) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = smooth(x - xi), yf = smooth(y - yi);
    const a = v(xi, yi), b = v(xi + 1, yi), c = v(xi, yi + 1), d = v(xi + 1, yi + 1);
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
  };
  return (x: number, y: number) => noise(x, y) * 0.55 + noise(x * 2.1, y * 2.1) * 0.3 + noise(x * 4.3, y * 4.3) * 0.15;
}

export function distToSegment(px: number, pz: number, a: Vec2, b: Vec2) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const len2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((px - a.x) * dx + (pz - a.z) * dz) / len2));
  return Math.hypot(px - (a.x + dx * t), pz - (a.z + dz * t));
}

export { mulberry32 };
