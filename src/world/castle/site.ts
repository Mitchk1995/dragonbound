import type { Vec2 } from '../../types';
import { Gen } from '../gen';
import { blockDisc, Cell, Ground, type PropSpawn } from '../layout';
import { CROWN_Y, type Box } from './plan';

/**
 * The ground the castle is laid out on: the island's generator and its walking levels, with the
 * small placing kit every castle module shares (cells by rectangle or outline, levels, paving and
 * props that block what they stand on). One per build of the island.
 */
export class Site {
  readonly level: Float32Array;
  constructor(readonly G: Gen) {
    this.level = G.l.level!;
  }

  get w() {
    return this.G.w;
  }

  /** Every cell whose centre lies in a rectangle (cell edges, fractions allowed). */
  cells(box: Box, fn: (i: number, x: number, z: number) => void) {
    const [x0, z0, x1, z1] = box;
    for (let z = Math.floor(z0); z < Math.ceil(z1); z++) for (let x = Math.floor(x0); x < Math.ceil(x1); x++) {
      if (this.G.inside(x, z) && x + 0.5 > x0 && x + 0.5 < x1 && z + 0.5 > z0 && z + 0.5 < z1) fn(this.G.idx(x, z), x, z);
    }
  }

  /** Every cell whose centre lies inside an outline. */
  within(poly: [number, number][], fn: (i: number, x: number, z: number) => void) {
    const xs = poly.map((p) => p[0]), zs = poly.map((p) => p[1]);
    this.cells([Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)], (i, x, z) => {
      if (inPoly(x + 0.5, z + 0.5, poly)) fn(i, x, z);
    });
  }

  /** Lay a rectangle of open ground at a level: walkable, reserved (no rock, cliff or tree takes it). */
  ground(box: Box, y: number, ground: Ground) {
    this.cells(box, (i) => this.open(i, y, ground));
  }

  /** One cell of open, reserved ground at a level. */
  open(i: number, y: number, ground: Ground) {
    const l = this.G.l;
    l.cells[i] = Cell.Ground;
    l.fluid[i] = 0;
    l.elev[i] = 0;
    l.ground[i] = ground;
    this.level[i] = y;
    this.G.reserved[i] = 1;
  }

  /** Block one cell (masonry or planting stands on it) at a level. */
  block(i: number, y?: number) {
    this.G.l.cells[i] = Cell.Blocked;
    if (y !== undefined) this.level[i] = y;
    this.G.reserved[i] = 1;
  }

  /** Re-pave a rectangle without changing its levels or what stands on it. */
  pave(box: Box, ground: Ground = Ground.Stone) {
    this.cells(box, (i) => (this.G.l.ground[i] = ground));
  }

  /** A prop at (x, z), blocking a disc of radius `r` (0: nothing). */
  prop(kind: string, x: number, z: number, rot = 0, r = 0, extra: Partial<PropSpawn> = {}) {
    const p = this.G.prop(kind, x, z, rot);
    Object.assign(p, extra);
    if (r > 0) blockDisc(this.G.l, x, z, r);
    return p;
  }

  /** Block a turned rectangle (half-width hw along its X, half-depth hd along Z). */
  blockRect(cx: number, cz: number, hw: number, hd: number, rot: number) {
    this.G.rect(cx, cz, hw, hd, rot, (i) => (this.G.l.cells[i] = Cell.Blocked));
  }

  /**
   * A low wall a cell thick on the cells it runs through (centred on their middles): one continuous
   * dressed wall along `pts` ([x, z, coping height] at each point, the coping raking between them),
   * standing on its foot at `foot` (world height), the cells under it blocked; with `lower` they are
   * brought down to its foot (a retaining wall, its ground stepping down under it), and otherwise
   * they keep the crown's level where they stand on it.
   */
  wall(pts: [number, number, number][], foot: number, lower = true) {
    const cx = pts.reduce((a, q) => a + q[0], 0) / pts.length, cz = pts.reduce((a, q) => a + q[1], 0) / pts.length;
    const p = this.G.prop('ramp_wall', cx, cz, 0);
    p.y = 0;
    p.opt = { pts: pts.map(([x, z]) => [x - cx, z - cz]), ys: pts.map(() => foot), tops: pts.map((q) => q[2]), w: 1.0 };
    for (let k = 0; k < pts.length - 1; k++) {
      const [ax, az] = pts[k], [bx, bz] = pts[k + 1], n = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.25);
      for (let j = 0; j <= n; j++) {
        const x = Math.floor(ax + ((bx - ax) * j) / n), z = Math.floor(az + ((bz - az) * j) / n);
        if (!this.G.inside(x, z)) continue;
        const i = this.G.idx(x, z);
        if (lower) this.block(i, foot);
        else if (this.level[i] < CROWN_Y || this.G.l.cells[i] === Cell.Ground) {
          // (Masonry, not rock: off the crown its cells come down to its foot.)
          this.block(i, this.level[i] < CROWN_Y ? foot : undefined);
          this.G.l.elev[i] = 0;
        }
      }
    }
    return p;
  }
}

/** Is a point inside an outline (even-odd rule)? */
export function inPoly(x: number, z: number, poly: number[][]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** Is a point inside a rectangle (cell edges)? */
export const inBox = (x: number, z: number, [x0, z0, x1, z1]: Box) => x > x0 && x < x1 && z > z0 && z < z1;

/** The outward normal's turn for a run from a to b whose outer face (local +Z) looks away from `inside`. */
export function runRot(a: Vec2, b: Vec2, inside: Vec2) {
  const rot = Math.atan2(-(b.z - a.z), b.x - a.x);
  // Local +Z in world: (sin rot, cos rot).
  const ox = Math.sin(rot), oz = Math.cos(rot), mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
  return (inside.x - mx) * ox + (inside.z - mz) * oz > 0 ? rot + Math.PI : rot;
}
