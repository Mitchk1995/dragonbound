import * as THREE from 'three';
import { inside, overlap, placeClaim, type Box, type Hull, type P3 } from './claims';
import { el, type ElementDef } from './elements';
import { CELL_U, STEP_U, U, type Rot } from './scale';

/**
 * Building with the kit: every piece is placed on the grid by its footprint's corner in cells (x and
 * z) and its foot in steps (y, half steps allowed), turned in quarter turns, in one colour. Nothing
 * may overlap: each placement is checked against everything already placed (to the exact space each
 * piece claims), and a placement that would pass through another throws.
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

const key = (x: number, z: number) => (x + 4096) * 8192 + (z + 4096);

/** The footprint of `e` turned by `rot`: [along x, along z]. */
const turnedSize = (e: ElementDef, rot: Rot): [number, number] => (rot % 2 ? [e.d, e.w] : [e.w, e.d]);

export class KitBuild {
  readonly items: Placed[] = [];
  private readonly cols = new Map<number, number[]>();
  private readonly hulls: Hull[][] = [];

  /** Places piece `e` (or the piece with that id); throws if it is off the grid or would overlap anything already placed. */
  place(e: ElementDef | string, x: number, y: number, z: number, color: number, opts: PlaceOpts = {}): Placed {
    const def = typeof e === 'string' ? el(e) : e, rot = opts.rot ?? 0;
    if (!Number.isInteger(x) || !Number.isInteger(z) || !Number.isInteger(y * 2)) throw new Error(`building kit: ${def.id} off the grid at ${x}, ${y}, ${z}`);
    if (![0, 1, 2, 3].includes(rot)) throw new Error(`building kit: ${def.id} turned ${rot}`);
    const p: Placed = { i: this.items.length, el: def, x, y, z, rot, color, part: opts.part ?? '' };
    const hulls = this.hullsOf(p);
    for (const h of hulls) {
      const hit = this.hits(h)[0];
      if (hit) throw new Error(`building kit: ${def.id} at ${x}, ${y}, ${z} (turn ${rot}) passes through ${hit.el.id} at ${hit.x}, ${hit.y}, ${hit.z} (turn ${hit.rot})`);
    }
    this.items.push(p);
    this.hulls.push(hulls);
    for (const k of this.columns(hulls)) {
      const list = this.cols.get(k);
      if (list) list.push(p.i);
      else this.cols.set(k, [p.i]);
    }
    return p;
  }

  /** The cell columns a set of placed claims reaches into. */
  private columns(hulls: Hull[]) {
    const out = new Set<number>();
    for (const { lo, hi } of hulls) {
      for (let x = Math.floor((lo[0] + 0.05) / CELL_U); x <= Math.floor((hi[0] - 0.05) / CELL_U); x++)
        for (let z = Math.floor((lo[2] + 0.05) / CELL_U); z <= Math.floor((hi[2] - 0.05) / CELL_U); z++) out.add(key(x, z));
    }
    return out;
  }

  /** The centre of a placement's footprint and its foot, in world kit units. */
  origin(p: Placed): P3 {
    const [w, d] = turnedSize(p.el, p.rot);
    return [(p.x + w / 2) * CELL_U, p.y * STEP_U, (p.z + d / 2) * CELL_U];
  }

  /** The space a placement claims, placed in the world. */
  hullsOf(p: Placed): Hull[] {
    const o = this.origin(p);
    return p.el.claims.map((c) => placeClaim(c, p.rot, o));
  }

  /** The claims of the i-th placement (as placed). */
  claimed(p: Placed): Hull[] {
    return this.hulls[p.i];
  }

  /** Everything placed whose space overlaps `h` (a placed claim, or a box in world kit units). */
  hits(h: Hull | Box, skip?: Placed): Placed[] {
    const hull = Array.isArray(h) ? placeClaim({ box: h }, 0, [0, 0, 0]) : h;
    const out = new Set<Placed>();
    for (const k of this.columns([hull])) for (const i of this.cols.get(k) ?? []) {
      const q = this.items[i];
      if (q === skip || out.has(q)) continue;
      if (this.hulls[i].some((c) => overlap(hull, c))) out.add(q);
    }
    return [...out];
  }

  /** Is cell (x, z) empty over steps [y0, y1)? */
  free(x: number, z: number, y0: number, y1: number) {
    return this.hits([x * CELL_U + 0.5, y0 * STEP_U + 0.5, z * CELL_U + 0.5, (x + 1) * CELL_U - 0.5, y1 * STEP_U - 0.5, (z + 1) * CELL_U - 0.5]).length === 0;
  }

  /** What fills cell (x, z) at step y (the middle of the step), if anything. */
  at(x: number, y: number, z: number): Placed | undefined {
    return this.hits([x * CELL_U + 9, y * STEP_U + 3.5, z * CELL_U + 9, x * CELL_U + 11, y * STEP_U + 4.5, z * CELL_U + 11])[0];
  }

  /** Is a world point (kit units) inside anything placed? */
  solidAt(p: P3, skip?: Placed): Placed | undefined {
    const probe: Box = [p[0] - 0.01, p[1] - 0.01, p[2] - 0.01, p[0] + 0.01, p[1] + 0.01, p[2] + 0.01];
    return this.hits(probe, skip).find((q) => this.hulls[q.i].some((h) => inside(p, h, 0)));
  }

  /** The world matrix of a placement (metres), for drawing. */
  matrix(p: Placed, into = new THREE.Matrix4()): THREE.Matrix4 {
    const [x, y, z] = this.origin(p);
    return into.makeRotationY((p.rot * Math.PI) / 2).setPosition(x * U, y * U, z * U);
  }
}
