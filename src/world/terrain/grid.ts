import type { ZoneTheme } from '../../data/zones';
import { Cell, Ground, type ZoneLayout } from '../layout';
import { smoothNoise } from './noise';

/** Default relief height per blocking cell type (plateaus/walls can override via layout.elev). */
export const CLIFF_H = 3.2;
export const CAVE_WALL_H = 3.6;
/** Fluid beds sink below the surface; the surface sits at WATER_Y. */
export const BED_Y = -1.0;
/** Highest a relief vertex below the first terrace may stand (cells with a corner above it are relief). */
export const FLOOR_CAP = 0.6;
/** How far outdoor cliff faces are weathered back into the rock at most (bays, undercuts). */
export const WEATHER = 1.6;
/** How far a gully cuts back into an outdoor face beyond the weathering. */
export const GULLY = 1.3;
export const WATER_Y = -0.28;
/** Brightness of the ground under a lawn (its root layer). */
export const LAWN_ROOT = 0.5;

/** The splat channel each ground type paints by default (themes can override). */
export const SPLAT: Record<number, number> = {
  [Ground.Dirt]: 0, [Ground.Path]: 0, [Ground.Camp]: 0, [Ground.Grass]: 1,
  [Ground.Arena]: 2, [Ground.Stone]: 2, [Ground.Cave]: 3, [Ground.Scorch]: 3,
};

/** True for cells whose terrain rises (they block movement anyway). */
export function isRelief(cell: number, theme: ZoneTheme) {
  return cell === Cell.Cliff || (cell === Cell.Wall && theme.wall === 'cave');
}

export function distToSeg(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax, dz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(px - ax - dx * t, pz - az - dz * t);
}

export const sstep = (a: number, b: number, v: number) => {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * The zone's vertex grid (vertices at cell corners, `w + 1` by `h + 1`) and the helpers every
 * terrain pass works through.
 */
export interface Grid {
  layout: ZoneLayout;
  theme: ZoneTheme;
  w: number;
  h: number;
  /** Vertices per row. */
  VW: number;
  /** Vertex count. */
  nV: number;
  /** Index of the vertex at corner (x, z). */
  vi(x: number, z: number): number;
  /** The cell at (x, z), Void outside the zone. */
  at(x: number, z: number): number;
  /** The zone's slow colour and height noise. */
  noise(x: number, z: number): number;
  /** Chamfer distance (in vertices) from every vertex to the nearest seed vertex. */
  distField(seed: (k: number) => boolean): Float32Array;
  /** A per-vertex value at a world point (bilinear over the vertex grid). */
  gridAt(grid: ArrayLike<number>, x: number, z: number): number;
}

export function makeGrid(layout: ZoneLayout, theme: ZoneTheme, seed: number): Grid {
  const { w, h } = layout;
  const VW = w + 1;
  const nV = VW * (h + 1);
  const vi = (x: number, z: number) => z * VW + x;
  const at = (x: number, z: number) => (x < 0 || z < 0 || x >= w || z >= h ? Cell.Void : layout.cells[z * w + x]);
  const distField = (seed: (k: number) => boolean) => {
    const d = new Float32Array(nV).fill(1e6);
    for (let k = 0; k < nV; k++) if (seed(k)) d[k] = 0;
    const relax = (k: number, j: number, c: number) => {
      if (d[j] + c < d[k]) d[k] = d[j] + c;
    };
    for (let z = 0; z <= h; z++) for (let x = 0; x <= w; x++) {
      const k = vi(x, z);
      if (x > 0) relax(k, k - 1, 1);
      if (z > 0) {
        relax(k, k - VW, 1);
        if (x > 0) relax(k, k - VW - 1, 1.414);
        if (x < w) relax(k, k - VW + 1, 1.414);
      }
    }
    for (let z = h; z >= 0; z--) for (let x = w; x >= 0; x--) {
      const k = vi(x, z);
      if (x < w) relax(k, k + 1, 1);
      if (z < h) {
        relax(k, k + VW, 1);
        if (x < w) relax(k, k + VW + 1, 1.414);
        if (x > 0) relax(k, k + VW - 1, 1.414);
      }
    }
    return d;
  };
  const gridAt = (grid: ArrayLike<number>, x: number, z: number) => {
    const x0 = Math.max(0, Math.min(w - 1, Math.floor(x))), z0 = Math.max(0, Math.min(h - 1, Math.floor(z)));
    const fx = Math.max(0, Math.min(1, x - x0)), fz = Math.max(0, Math.min(1, z - z0));
    const a = grid[vi(x0, z0)], b = grid[vi(x0 + 1, z0)], cc = grid[vi(x0, z0 + 1)], d = grid[vi(x0 + 1, z0 + 1)];
    return a + (b - a) * fx + (cc - a) * fz + (a - b - cc + d) * fx * fz;
  };
  return { layout, theme, w, h, VW, nV, vi, at, noise: smoothNoise(seed + 3), distField, gridAt };
}
