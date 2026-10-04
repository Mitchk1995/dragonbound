import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { hash01, prism } from '../../render/blocks';
import { ModelKit } from '../../render/kit';
import { shareResource } from '../../render/resources';
import { cb, type Obj } from './core';
import { BONE, BONE_D, DARK } from './palette';

// Small pieces several prop families share: ragged and soft ground discs, broken foam, bone piles.

/**
 * A flat, ragged disc lying on the ground (scorch marks, puddles): a triangle fan whose rim radius
 * alternates between `inner` and `outer` (plus seeded jitter), facing up.
 */
const fanCache = new Map<string, THREE.BufferGeometry>();
export function raggedDisc(seed: number, spokes: number, inner: number, outer: number, jitter: number) {
  const key = `${seed},${spokes},${inner},${outer},${jitter}`;
  let geo = fanCache.get(key);
  if (geo) return geo;
  const rim: [number, number][] = [];
  for (let i = 0; i < spokes; i++) {
    const a = ((i + (hash01(seed, i, 7) - 0.5) * 0.5) / spokes) * Math.PI * 2;
    const r = (i % 2 ? inner : outer) * (1 - jitter / 2 + hash01(seed, i) * jitter);
    rim.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  const pos: number[] = [];
  for (let i = 0; i < spokes; i++) {
    const [ax, az] = rim[i], [bx, bz] = rim[(i + 1) % spokes];
    // Wound so the face points up (+Y).
    pos.push(0, 0, 0, bx, 0, bz, ax, 0, az);
  }
  geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  fanCache.set(key, shareResource(geo));
  return geo;
}

/**
 * A soft-edged flat patch facing up (puddles, damp ground): a centre fan and two rings with an
 * irregular, lobed outline; colour `rgb` everywhere, alpha `a` over the inner part fading to 0 at
 * the rim, so it has no hard outline.
 */
const softCache = new Map<string, THREE.BufferGeometry>();
export function softDisc(seed: number, r: number, rgb: [number, number, number], a: number) {
  const key = `${seed},${r},${rgb},${a}`;
  let geo = softCache.get(key);
  if (geo) return geo;
  const N = 28;
  const rim = Array.from({ length: N }, (_, i) => {
    const t = (i / N) * Math.PI * 2;
    const lobe = 1 + 0.16 * Math.sin(t * 2 + seed) + 0.1 * Math.sin(t * 3 + seed * 1.7) + (hash01(seed, i) - 0.5) * 0.1;
    return [Math.cos(t) * r * lobe, Math.sin(t) * r * lobe * 0.8];
  });
  const pos: number[] = [], col: number[] = [];
  const P = (f: number, i: number, al: number) => {
    const [x, z] = rim[i % N];
    pos.push(x * f, 0, z * f);
    col.push(...rgb, al);
  };
  for (let i = 0; i < N; i++) {
    // Centre fan (full alpha), then the inner ring to 0.72, then the fade to the rim.
    pos.push(0, 0, 0);
    col.push(...rgb, a);
    P(0.62, i + 1, a);
    P(0.62, i, a);
    for (const [f0, a0, f1, a1] of [[0.62, a, 0.86, a * 0.55], [0.86, a * 0.55, 1, 0]]) {
      P(f0, i, a0); P(f0, i + 1, a0); P(f1, i + 1, a1);
      P(f0, i, a0); P(f1, i + 1, a1); P(f1, i, a1);
    }
  }
  geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(pos.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  softCache.set(key, shareResource(geo));
  return geo;
}

/**
 * Broken foam: `n` small soft blobs of foam scattered over a patch of radius `r` (denser and brighter
 * toward its heart), merged, so it reads as churned water rather than a disc.
 */
const foamCache = new Map<string, THREE.BufferGeometry>();
export function brokenFoam(seed: number, r: number, n: number, a: number) {
  const key = `${seed},${r},${n},${a}`;
  let geo = foamCache.get(key);
  if (geo) return geo;
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < n; i++) {
    const ang = hash01(seed, i, 1) * Math.PI * 2, d = Math.sqrt(hash01(seed, i, 2)) * r * 0.8;
    const br = r * (0.1 + 0.15 * hash01(seed, i, 3)) * (1.2 - (0.5 * d) / r);
    parts.push(softDisc(seed * 31 + i, Math.max(0.05, br), [0.94, 0.97, 0.98], a * (1 - (0.55 * d) / r)).clone().translate(Math.cos(ang) * d, 0.001 * i, Math.sin(ang) * d));
  }
  geo = mergeGeometries(parts)!;
  foamCache.set(key, geo);
  return geo;
}

/** A pile of bones; `variant` picks the arrangement (0..3). No glow, warm bone colour. */
export function bonePile(k: ModelKit, g: Obj, variant: number) {
  const femur = (x: number, z: number, a: number, len = 0.8) => {
    const c = Math.cos(a), s = Math.sin(a);
    cb(k, g, [0.1, 0.09, len], [x, 0.05, z], BONE, [0, a, 0], 0.02);
    for (const e of [-1, 1]) cb(k, g, [0.2, 0.15, 0.16], [x + s * e * len * 0.5, 0.07, z + c * e * len * 0.5], BONE_D, [0, a, 0], 0.03);
  };
  const skull = (x: number, z: number, a: number, horned: boolean) => {
    const c = Math.cos(a), s = Math.sin(a);
    cb(k, g, [0.36, 0.3, 0.42], [x, 0.15, z], BONE, [0, a, 0], 0.06);
    cb(k, g, [0.28, 0.1, 0.2], [x + s * 0.22, 0.05, z + c * 0.22], BONE_D, [0, a, 0], 0.02);
    for (const e of [-1, 1]) k.box(g, [0.09, 0.08, 0.02], [x + s * 0.215 + c * e * 0.08, 0.2, z + c * 0.215 - s * e * 0.08], DARK, [0, a, 0]);
    if (horned) for (const e of [-1, 1]) k.mesh(g, prism(0.08, 0.5, 0.5), BONE_D, [x + c * e * 0.15, 0.25, z - s * e * 0.15], [-0.9 * c, a, e * 0.7]);
  };
  switch (variant % 4) {
    case 0:
      femur(0, 0, 0.4); femur(0.2, 0.1, -0.9, 0.7); skull(-0.35, 0.25, 0.5, false);
      break;
    case 1: {
      // A ribcage: spine blocks and bent ribs.
      for (let i = 0; i < 5; i++) cb(k, g, [0.16, 0.14, 0.18], [0, 0.07, -0.5 + i * 0.25], BONE_D, undefined, 0.03);
      for (let i = 0; i < 4; i++) for (const e of [-1, 1]) {
        const z = -0.4 + i * 0.25;
        cb(k, g, [0.3, 0.07, 0.07], [e * 0.2, 0.2, z], BONE, [0, 0, e * 0.6], 0.015);
        cb(k, g, [0.07, 0.3, 0.07], [e * 0.36, 0.14, z], BONE, [0, 0, e * 0.15], 0.015);
      }
      break;
    }
    case 2:
      femur(-0.2, 0, 1.2); femur(0.25, -0.2, 0.2, 0.6); femur(0.1, 0.35, 2.3, 0.7);
      break;
    default:
      skull(0, 0, -0.3, true); femur(0.4, 0.3, 1.0, 0.6);
  }
}
