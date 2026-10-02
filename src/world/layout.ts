import { mulberry32, type Rng } from '../core/rng';
import type { Vec2 } from '../types';
import type { BuildingSpec } from './building';

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
  /** Builder variant/seed for props that take one alongside a length (ruin walls, slabs). */
  v?: number;
  /** The radius of a curved face the prop hugs (a climber on a round tower's drum); none = a flat wall. */
  bend?: number;
}

/** Liquid in a cell: rendered as a lowered bed with an animated surface. Bridges are walkable cells over it. */
export enum Fluid {
  None = 0,
  Water = 1,
  Lava = 2,
}

/** Grass carpet over a cell (see lawn.ts): none (loose tufts instead), meadow, or a clipped lawn. */
export enum Lawn {
  None = 0,
  Meadow = 1,
  /** Clipped castle lawn: short, striped. */
  Clipped = 2,
  /** A private garden's lawn: a little longer, scattered with daisies and clover. */
  Garden = 3,
}

/** The lawn a cell grows: grass ground on open ground, under trees and under props. */
export function lawnCell(cell: number, ground: number, fluid: number, clipped: boolean): Lawn {
  if (fluid || ground !== Ground.Grass) return Lawn.None;
  if (cell !== Cell.Ground && cell !== Cell.Blocked && cell !== Cell.Tree) return Lawn.None;
  return clipped ? Lawn.Clipped : Lawn.Meadow;
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
  /**
   * Height of the walkable ground per cell (plateaus, ramps, terraces), in world units; absent = flat at 0.
   * Relief cells take the level of the ground they rise from and `elev` on top of it. Keep plateau
   * levels whole numbers (the cliff terraces are 1 unit tall) and ramp between levels on walkable cells.
   */
  level?: Float32Array;
  entry: Vec2;
  packs: PackSpawn[];
  boss?: { id: string; x: number; z: number; r: number };
  nodes: { ore: string; x: number; z: number }[];
  stations: StationSpawn[];
  props: PropSpawn[];
  /**
   * Scorched ground: soft soot gradients painted into the floor's vertex colour, darkest on the
   * source (a point, or a segment to x2/z2) and fading out over `r`; `k` is the strength (0..1).
   */
  burns?: Burn[];
  /** Walk grid of the upper floors of multi-storey buildings (0 = open; see building.ts upperCells). */
  upper?: Uint8Array;
  /** Enterable buildings (walls in the grid are Blocked; see building.ts). */
  buildings?: BuildingSpec[];
  /** Chance (percent) of a tree on each raised relief cell; the theme's reliefTrees otherwise. */
  canopy?: Uint8Array;
  /** Grass carpet per cell (Lawn enum); absent = loose grass tufts only. */
  lawn?: Uint8Array;
  /** Discs the lawn is cut back from, its border running exactly along each circle. */
  lawnCut?: { x: number; z: number; r: number }[];
  /** Walkable cells nobody could reach, sealed off by Gen.connect (a designed area should leave none). */
  sealed?: number[];
  /**
   * Roads and streams as centre lines (with their half widths): the ground, the grass carpet and the
   * water draw their edges along these smooth curves instead of the cell grid.
   */
  strands?: Strand[];
  /** Round pools (a spring, a pond): dished hollows with a soft, round shore. */
  pools?: { x: number; z: number; r: number }[];
}

export interface Strand {
  pts: Vec2[];
  hw: number;
  kind: 'path' | 'water';
  /** The ground the strand is paved with (a road), or its banks' wet earth (a stream). */
  ground: number;
}

export interface Burn {
  x: number;
  z: number;
  x2?: number;
  z2?: number;
  r: number;
  k: number;
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
