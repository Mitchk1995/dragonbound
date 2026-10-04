import * as THREE from 'three';
import { packAttributes } from '../../render/patch';
import type { Mesh3 } from './mesh';
import { U } from './scale';
import { FIXED, LAYERS, SURFACE, type Layer } from './surfaces';

/**
 * A piece's mesh made drawable: in metres, each face given texture coordinates by projecting it onto
 * the piece's own axes (so the texture lies flat on every face and turns with the piece), and every
 * vertex its layer of the texture array and its stone, tile or board within the piece. All of a
 * piece's textured parts are drawn as one: a part with a colour of its own (a door's iron, an oven's
 * bricks) carries it in its vertices, marked so the piece's colour leaves it alone.
 *
 * Wood is laid with its grain along the piece's length (`grain`): along a beam, up a post, along a
 * board; the end grain, where a beam's end shows, is a little darker. Every vertex also knows where it
 * lies in its own stone, tile or board's box, so the material can wear that piece's edges and make
 * its shape a little irregular.
 */

/** How a part's texture runs: projected square on to each face, or with the grain along an axis (`auto`: the longest). */
export type Grain = 'box' | 'auto' | 'x' | 'y' | 'z';

/** The end grain's shade. */
const END_GRAIN = 0.72;



const AX: Record<'x' | 'y' | 'z', number> = { x: 0, y: 1, z: 2 };

/**
 * The face's texture axes for a face facing along `n` (0 x, 1 y, 2 z): which coordinates run along u
 * and v, and whether it is end grain.
 */
function axesFor(n: number, grain: number): { u: number; v: number; end: boolean } {
  if (grain < 0) return n === 0 ? { u: 2, v: 1, end: false } : n === 1 ? { u: 0, v: 2, end: false } : { u: 0, v: 1, end: false };
  if (n === grain) return { ...axesFor(n, -1), end: true };
  // The grain runs along v; u is the face's other axis.
  const other = [0, 1, 2].find((k) => k !== n && k !== grain)!;
  return { u: other, v: grain, end: false };
}

/** One textured part: its mesh, surface, grain and (when it has one) its own colour. */
export interface TexturedPart {
  mesh: Mesh3;
  layer: Layer;
  grain?: Grain;
  color?: number;
}

interface Arrays {
  pos: number[];
  nor: number[];
  col: number[];
  kit: number[];
  /** Where the vertex lies in its stone, tile or board's box (metres from its middle), and that box's half size. */
  rel: number[];
  half: number[];
  idx: number[];
}

/** Each stone, tile or board's box within a part (kit units), by its number. */
function boxesOf(mesh: Mesh3) {
  const out = new Map<number, { lo: number[]; hi: number[] }>();
  for (let i = 0; i < mesh.sub.length; i++) {
    let b = out.get(mesh.sub[i]);
    if (!b) out.set(mesh.sub[i], (b = { lo: [Infinity, Infinity, Infinity], hi: [-Infinity, -Infinity, -Infinity] }));
    for (let k = 0; k < 3; k++) {
      b.lo[k] = Math.min(b.lo[k], mesh.pos[i * 3 + k]);
      b.hi[k] = Math.max(b.hi[k], mesh.pos[i * 3 + k]);
    }
  }
  return out;
}

const own = new THREE.Color();

/** Appends one part's vertices to `out`. */
function addPart(out: Arrays, { mesh, layer, grain = SURFACE[layer].grain ? 'auto' : 'box', color }: TexturedPart) {
  const tile = SURFACE[layer].tile, li = LAYERS.indexOf(layer);
  let g = -1;
  if (grain === 'auto') {
    const [lo, hi] = mesh.bounds(), size = hi.clone().sub(lo);
    g = size.x >= size.y && size.x >= size.z ? 0 : size.y >= size.z ? 1 : 2;
  } else if (grain !== 'box') g = AX[grain];
  if (color !== undefined) own.setHex(color);
  const P = mesh.pos, N = mesh.nor, base = out.pos.length / 3, boxes = boxesOf(mesh);
  // A vertex is shared by the triangles projected the same way; one on a face turning another way is split off.
  const made = new Map<number, number>();
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), fn = new THREE.Vector3();
  for (let t = 0; t < mesh.idx.length; t += 3) {
    const tri = [mesh.idx[t], mesh.idx[t + 1], mesh.idx[t + 2]];
    e1.set(P[tri[1] * 3] - P[tri[0] * 3], P[tri[1] * 3 + 1] - P[tri[0] * 3 + 1], P[tri[1] * 3 + 2] - P[tri[0] * 3 + 2]);
    e2.set(P[tri[2] * 3] - P[tri[0] * 3], P[tri[2] * 3 + 1] - P[tri[0] * 3 + 1], P[tri[2] * 3 + 2] - P[tri[0] * 3 + 2]);
    fn.crossVectors(e1, e2);
    if (fn.lengthSq() < 1e-12) fn.set(N[tri[0] * 3], N[tri[0] * 3 + 1], N[tri[0] * 3 + 2]);
    const a = [Math.abs(fn.x), Math.abs(fn.y), Math.abs(fn.z)];
    const n = a[0] >= a[1] && a[0] >= a[2] ? 0 : a[1] >= a[2] ? 1 : 2;
    const { u, v, end } = axesFor(n, g);
    for (const i of tri) {
      const key = i * 4 + n;
      let j = made.get(key);
      if (j === undefined) {
        j = out.pos.length / 3;
        made.set(key, j);
        out.pos.push(P[i * 3] * U, P[i * 3 + 1] * U, P[i * 3 + 2] * U);
        out.nor.push(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]);
        const s = mesh.shade[i] * (end ? END_GRAIN : 1);
        if (color === undefined) out.col.push(s, s, s);
        else out.col.push(own.r * s, own.g * s, own.b * s);
        out.kit.push((P[i * 3 + u] * U) / tile, (P[i * 3 + v] * U) / tile, li, mesh.sub[i] + (color === undefined ? 0 : FIXED));
        const b = boxes.get(mesh.sub[i])!;
        for (let k = 0; k < 3; k++) {
          out.rel.push((P[i * 3 + k] - (b.lo[k] + b.hi[k]) / 2) * U);
          out.half.push(((b.hi[k] - b.lo[k]) / 2) * U);
        }
      }
      out.idx.push(j);
    }
  }
  return base;
}

/** The geometry of a piece's textured parts, drawn as one and ready to be instanced. */
export function texturedGeometry(parts: TexturedPart[]): THREE.BufferGeometry {
  const a: Arrays = { pos: [], nor: [], col: [], kit: [], rel: [], half: [], idx: [] };
  for (const p of parts) addPart(a, p);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(a.pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(a.nor, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(a.col, 3));
  geo.setAttribute('aKit', new THREE.Float32BufferAttribute(a.kit, 4));
  geo.setAttribute('aRel', new THREE.Float32BufferAttribute(a.rel, 3));
  geo.setAttribute('aHalf', new THREE.Float32BufferAttribute(a.half, 3));
  geo.setIndex(a.idx);
  geo.computeBoundingSphere();
  geo.computeBoundingBox();
  packAttributes(geo, ['position', 'normal', 'color', 'aKit', 'aRel', 'aHalf']);
  return geo;
}

/** The geometry of a part drawn without the kit's textures (glass, glowing glass, a plant's cards), in metres. */
export function plainGeometry(mesh: Mesh3): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(mesh.pos.map((v) => v * U), 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(mesh.nor, 3));
  if (mesh.uv.length) geo.setAttribute('uv', new THREE.Float32BufferAttribute(mesh.uv, 2));
  geo.setIndex(mesh.idx);
  geo.computeBoundingSphere();
  geo.computeBoundingBox();
  return geo;
}
