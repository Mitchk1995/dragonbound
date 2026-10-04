import * as THREE from 'three';
import { el, type Box, type ElementDef } from './elements';
import { BRICK_COLORS, type BrickColor } from './palette';
import { LDU, PL_LDU, P_LDU, type Rot } from './scale';

/**
 * Building with the kit: every element is placed on the grid by its footprint's corner in studs (x
 * and z) and its foot in plates (y), turned in quarter turns, in one colour. Nothing may overlap:
 * each placement is checked against everything already placed (to the exact space each element
 * fills, in LDU), and a placement that would pass through another throws.
 */

export interface Placed {
  /** Its index in the build. */
  i: number;
  el: ElementDef;
  x: number;
  y: number;
  z: number;
  rot: Rot;
  color: number;
  /** Which part of the building it belongs to (what a cut-away lifts off). */
  part: string;
}

export interface PlaceOpts {
  rot?: Rot;
  part?: string;
}

const EPS = 0.05;
const key = (x: number, z: number) => (x + 4096) * 8192 + (z + 4096);

/** The footprint of `e` turned by `rot`: [along x, along z]. */
export const turnedSize = (e: ElementDef, rot: Rot): [number, number] => (rot % 2 ? [e.d, e.w] : [e.w, e.d]);

/** An element-local LDU point, turned by `rot` (quarter turns about the vertical; 1 turns +z to +x). */
export function turn(lx: number, lz: number, rot: Rot): [number, number] {
  switch (rot) {
    case 1: return [lz, -lx];
    case 2: return [-lx, -lz];
    case 3: return [-lz, lx];
    default: return [lx, lz];
  }
}

export class BrickBuild {
  readonly items: Placed[] = [];
  private readonly cols = new Map<number, number[]>();
  private readonly worldBoxes: Box[][] = [];

  /** Places element `id`; throws if it is off the grid or would overlap anything already placed. */
  place(id: string, x: number, y: number, z: number, color: number | BrickColor, opts: PlaceOpts = {}): Placed {
    const e = el(id), rot = opts.rot ?? 0;
    if (![x, y, z].every(Number.isInteger)) throw new Error(`brick kit: ${id} off the grid at ${x}, ${y}, ${z}`);
    if (![0, 1, 2, 3].includes(rot)) throw new Error(`brick kit: ${id} turned ${rot}`);
    const p: Placed = { i: this.items.length, el: e, x, y, z, rot, color: typeof color === 'number' ? color : BRICK_COLORS[color], part: opts.part ?? '' };
    const boxes = this.boxesOf(p);
    for (const b of boxes) {
      const hit = this.hits(b)[0];
      if (hit) throw new Error(`brick kit: ${id} at ${x}, ${y}, ${z} (turn ${rot}) passes through ${hit.el.id} at ${hit.x}, ${hit.y}, ${hit.z} (turn ${hit.rot})`);
    }
    this.items.push(p);
    this.worldBoxes.push(boxes);
    for (const k of this.columns(boxes)) {
      const list = this.cols.get(k);
      if (list) list.push(p.i);
      else this.cols.set(k, [p.i]);
    }
    return p;
  }

  /** The stud columns a set of world boxes reaches into. */
  private columns(boxes: Box[]) {
    const out = new Set<number>();
    for (const [x0, , z0, x1, , z1] of boxes) {
      for (let x = Math.floor((x0 + EPS) / P_LDU); x <= Math.floor((x1 - EPS) / P_LDU); x++)
        for (let z = Math.floor((z0 + EPS) / P_LDU); z <= Math.floor((z1 - EPS) / P_LDU); z++) out.add(key(x, z));
    }
    return out;
  }

  /** The centre of a placement's footprint and its foot, in world LDU. */
  origin(p: Placed): [number, number, number] {
    const [w, d] = turnedSize(p.el, p.rot);
    return [(p.x + w / 2) * P_LDU, p.y * PL_LDU, (p.z + d / 2) * P_LDU];
  }

  /** The space a placement fills, in world LDU. */
  boxesOf(p: Placed): Box[] {
    const [ox, oy, oz] = this.origin(p);
    return p.el.boxes.map(([x0, y0, z0, x1, y1, z1]) => {
      const [ax, az] = turn(x0, z0, p.rot), [bx, bz] = turn(x1, z1, p.rot);
      return [ox + Math.min(ax, bx), oy + y0, oz + Math.min(az, bz), ox + Math.max(ax, bx), oy + y1, oz + Math.max(az, bz)];
    });
  }

  /** Everything placed whose space overlaps box `b` (world LDU). */
  hits(b: Box, skip?: Placed): Placed[] {
    const out = new Set<Placed>();
    for (const k of this.columns([b])) for (const i of this.cols.get(k) ?? []) {
      const q = this.items[i];
      if (q === skip || out.has(q)) continue;
      if (this.worldBoxes[i].some((c) => overlaps(b, c))) out.add(q);
    }
    return [...out];
  }

  /** Is stud cell (x, z) empty over plates [y0, y1)? */
  free(x: number, z: number, y0: number, y1: number) {
    return this.hits([x * P_LDU + 0.5, y0 * PL_LDU + 0.5, z * P_LDU + 0.5, (x + 1) * P_LDU - 0.5, y1 * PL_LDU - 0.5, (z + 1) * P_LDU - 0.5]).length === 0;
  }

  /** What fills stud cell (x, z) at plate y (its middle), if anything. */
  at(x: number, y: number, z: number): Placed | undefined {
    return this.hits([x * P_LDU + 9, y * PL_LDU + 3.5, z * P_LDU + 9, x * P_LDU + 11, y * PL_LDU + 4.5, z * P_LDU + 11])[0];
  }

  /** The world matrix of a placement (metres), for drawing. */
  matrix(p: Placed, into = new THREE.Matrix4()): THREE.Matrix4 {
    const [x, y, z] = this.origin(p);
    return into.makeRotationY((p.rot * Math.PI) / 2).setPosition(x * LDU, y * LDU, z * LDU);
  }

  /** The studs on top of a placement, in world LDU (their foot centres). */
  studsOf(p: Placed): [number, number, number][] {
    const [ox, oy, oz] = this.origin(p);
    return p.el.studs.map(([sx, sz]) => {
      const [x, z] = turn(sx, sz, p.rot);
      return [ox + x, oy + p.el.studY, oz + z];
    });
  }

  /** What stands on a stud (world LDU foot centre), covering it, if anything. */
  coverOf(s: [number, number, number], skip: Placed): Placed | undefined {
    return this.hits([s[0] - 5, s[1] + 0.5, s[2] - 5, s[0] + 5, s[1] + 3.5, s[2] + 5], skip)[0];
  }
}

/** Do two boxes share any space (more than a hair)? */
export function overlaps(a: Box, b: Box) {
  return a[0] < b[3] - EPS && b[0] < a[3] - EPS && a[1] < b[4] - EPS && b[1] < a[4] - EPS && a[2] < b[5] - EPS && b[2] < a[5] - EPS;
}
