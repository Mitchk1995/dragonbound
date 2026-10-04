import * as THREE from 'three';
import { chamferBox, hash01, rockBlock, slabBlock } from '../../render/blocks';
import { ModelKit, PAL, type V3 } from '../../render/kit';
import { BLOCKS, PAINT_OF } from './palette';

/**
 * World props are modular blocks: chamfered boxes, stacked stone courses, wedges and faceted
 * chunks (src/render/blocks.ts), in clean flat colours. Only effects stay organic (flames, the
 * portal column). Every prop is built facing +Z (its front) with its base on y = 0.
 *
 * This file holds what every prop builder shares: the Prop and Builder shapes and the basic blocks.
 */

export interface Prop {
  obj: THREE.Group;
  /** Per-frame animation (flames, portal swirl…). */
  tick?: (t: number) => void;
  light?: THREE.PointLight;
  /** Swap between states, e.g. ruined/restored or full/depleted. */
  setState?: (state: string) => void;
}

export type Obj = THREE.Object3D;

/** Quantise sizes so blocks share cached geometry. */
export const q = (v: number) => Math.round(v * 20) / 20;

/** Chamfered box. */
export function cb(k: ModelKit, p: Obj, size: V3, pos: V3, color: number, rot?: V3, c = 0.05, em = 0, int = 1) {
  return k.mesh(p, chamferBox(size[0], size[1], size[2], c), color, pos, rot, em, int);
}

/**
 * Points spread evenly along a run `L` long (centred on 0) about `step` apart, the first and last
 * `clear` in from its ends: merlons, corbels and posts that end the same way at both ends.
 */
export function spread(L: number, step: number, clear: number): number[] {
  const span = L - 2 * clear;
  if (span < 0) return [];
  const n = Math.max(1, Math.round(span / step));
  return Array.from({ length: n + 1 }, (_, i) => -span / 2 + (span * i) / n);
}

/** A faceted rock chunk (base at y = pos.y). */
export function chunk(k: ModelKit, p: Obj, seed: number, size: V3, pos: V3, color: number, rotY = 0, em = 0, int = 1) {
  // A rock chunk's colour paints as rock unless it is already claimed (warm browns would
  // otherwise be judged wood and get plank grain).
  if (!PAINT_OF.has(color) && !em) PAINT_OF.set(color, 'rock');
  return k.mesh(p, rockBlock(seed, size[0], size[1], size[2]), color, pos, [0, rotY, 0], em, int);
}

/** A flat-topped rock slab with sheer sides (base at y = pos.y), scaled to `size`. */
export function slab(k: ModelKit, p: Obj, seed: number, size: V3, pos: V3, color: number, rotY = 0) {
  if (!PAINT_OF.has(color)) PAINT_OF.set(color, 'rock');
  const m = k.mesh(p, slabBlock(seed), color, pos, [0, rotY, 0]);
  m.scale.set(...size);
  return m;
}

/** Ground-hugging parts (decals, seams) never cast shadows: flag their material. */
export function decal(m: THREE.Mesh) {
  (m.material as THREE.Material).userData.decal = true;
  return m;
}

export interface WallSpec {
  /** Centre of the wall's base line and its direction (rotation about Y; 0 = along +X). */
  x: number;
  z: number;
  rot: number;
  len: number;
  y0: number;
  rows: number;
  rowH: number;
  thick: number;
  seed: number;
  shades?: number[];
  unit?: number;
  /** Height of the wall top along it (broken crowns). */
  top?: (u: number) => number;
  /** Leave out blocks overlapping an opening (door, mouth). */
  hole?: { u: number; w: number; h: number };
}

/** A wall of staggered, slightly uneven blocks in running bond. */
export function masonry(k: ModelKit, p: Obj, s: WallSpec) {
  const shades = s.shades ?? BLOCKS, unit = s.unit ?? 1;
  const cos = Math.cos(s.rot), sin = Math.sin(s.rot);
  for (let r = 0; r < s.rows; r++) {
    const y = s.y0 + r * s.rowH;
    let u = -s.len / 2 - (r % 2 ? unit * 0.5 : 0), n = 0;
    while (u < s.len / 2 - 0.01) {
      const hv = hash01(s.seed, r, n++);
      const l = unit * (0.75 + Math.round(hv * 4) / 8);
      const a = Math.max(u, -s.len / 2), b = Math.min(u + l, s.len / 2);
      u += l;
      if (b - a < 0.15) continue;
      const cu = (a + b) / 2;
      if (s.top && y + s.rowH > s.top(cu) + 0.02) continue;
      if (s.hole && b > s.hole.u - s.hole.w / 2 && a < s.hole.u + s.hole.w / 2 && y < s.hole.h) continue;
      const pick = hash01(s.seed + 7, r, n);
      const proud = hash01(s.seed + 3, r, n) * 0.05;
      k.mesh(p, chamferBox(q(b - a - 0.04), q(s.rowH - 0.04), q(s.thick + proud), 0.05), shades[pick < 0.55 ? 0 : pick < 0.82 ? 1 : 2],
        [s.x + cos * cu, y + s.rowH / 2, s.z - sin * cu], [0, s.rot, 0]);
    }
  }
}

/** A flickering flame at (x, y, z) of `g`; returns its per-frame animation. */
export function flame(k: ModelKit, g: Obj, x: number, y: number, z: number, s = 1) {
  // Flames are effects: soft faceted tongues are fine here.
  const a = k.cone(g, 0.3 * s, 0.7 * s, [x, y + 0.35 * s, z], PAL.fire, undefined, 5, PAL.fire);
  const b = k.cone(g, 0.18 * s, 0.5 * s, [x, y + 0.35 * s, z], PAL.ember, undefined, 5, PAL.ember);
  a.name = b.name = 'flame'; // animated: never merged
  return (t: number) => {
    const f = 1 + Math.sin(t * 13 + x) * 0.1 + Math.sin(t * 7.3 + z) * 0.08;
    a.scale.set(1, f, 1);
    b.scale.set(1, 2 - f, 1);
  };
}

/** A point light `y` above the prop's foot. */
export function light(g: Obj, color: number, intensity: number, dist: number, y: number) {
  const l = new THREE.PointLight(color, intensity, dist, 1.6);
  l.position.set(0, y, 0);
  g.add(l);
  return l;
}

export type Builder = (k: ModelKit, g: THREE.Group, arg?: any) => Prop | void;

/** A prop's length argument: a number, or the `len` of `{ len, v }` (a length with a variant). */
export const lenOf = (arg: any): number | undefined => (typeof arg === 'number' ? arg : arg?.len);
/** A prop's variant (the `v` of `{ len, v }`), 0 if none. */
export const vOf = (arg: any): number => (arg !== null && typeof arg === 'object' ? arg.v ?? 0 : 0);
