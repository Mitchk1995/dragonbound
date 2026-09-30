import * as THREE from 'three';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
import { mulberry32 } from '../core/rng';

/**
 * Modular block shapes for world props: chamfered boxes, wedges, tapered blocks, faceted rock
 * chunks and crystal prisms. Every shape is a convex hull, so faces stay crisp and flat-shaded
 * (one normal per face) and read cleanly from the top-down camera. Geometries are cached by
 * their parameters; props share them freely.
 */

const cache = new Map<string, THREE.BufferGeometry>();
function cached(key: string, make: () => THREE.BufferGeometry) {
  let g = cache.get(key);
  if (!g) {
    g = make();
    g.computeBoundingSphere();
    cache.set(key, g);
  }
  return g;
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/**
 * A box centred on the origin with its 12 edges cut at 45° by `c` (clamped so faces survive).
 * A large chamfer on a long box gives an octagonal beam (logs, wheels, basalt columns).
 */
export function chamferBox(w: number, h: number, d: number, c = 0.06) {
  const hx = w / 2, hy = h / 2, hz = d / 2;
  const cc = Math.max(0, Math.min(c, hx * 0.49, hy * 0.49, hz * 0.49));
  return cached(`cb${w},${h},${d},${cc}`, () => {
    if (cc <= 0.001) return new THREE.BoxGeometry(w, h, d).toNonIndexed();
    const pts: THREE.Vector3[] = [];
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
      pts.push(V(sx * hx, sy * (hy - cc), sz * (hz - cc)), V(sx * (hx - cc), sy * hy, sz * (hz - cc)), V(sx * (hx - cc), sy * (hy - cc), sz * hz));
    }
    return new ConvexGeometry(pts);
  });
}

/** A gable prism (roof, tent): base w × d at y = -h/2, ridge along X at y = +h/2. `c` trims the ridge flat. */
export function wedge(w: number, h: number, d: number, c = 0) {
  return cached(`wg${w},${h},${d},${c}`, () => {
    const hx = w / 2, hy = h / 2, hz = d / 2;
    const pts: THREE.Vector3[] = [];
    for (const sx of [-1, 1]) {
      pts.push(V(sx * hx, -hy, -hz), V(sx * hx, -hy, hz));
      if (c > 0) pts.push(V(sx * hx, hy, -c), V(sx * hx, hy, c));
      else pts.push(V(sx * hx, hy, 0));
    }
    return new ConvexGeometry(pts);
  });
}

/**
 * A tapered block (frustum): bottom wb × db at y = -h/2, top wt × dt at y = +h/2, the top shifted
 * by (ox, oz). Chimneys, obelisks, plinths, the anvil horn.
 */
export function taper(wb: number, db: number, wt: number, dt: number, h: number, ox = 0, oz = 0) {
  return cached(`tp${wb},${db},${wt},${dt},${h},${ox},${oz}`, () => {
    const pts: THREE.Vector3[] = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      pts.push(V((sx * wb) / 2, -h / 2, (sz * db) / 2));
      pts.push(V((sx * Math.max(0.001, wt)) / 2 + ox, h / 2, (sz * Math.max(0.001, dt)) / 2 + oz));
    }
    return new ConvexGeometry(pts);
  });
}

/**
 * A chunky faceted rock block: a box whose corners are cut by different amounts (seeded), so it
 * reads as a broken stone block rather than a smooth pebble. Base on y = 0.
 */
export function rockBlock(seed: number, w = 1, h = 0.8, d = 1) {
  return cached(`rk${seed},${w},${h},${d}`, () => {
    const rng = mulberry32(seed * 7919 + 13);
    const pts: THREE.Vector3[] = [];
    const hx = w / 2, hz = d / 2;
    for (const sx of [-1, 1]) for (const sy of [0, 1]) for (const sz of [-1, 1]) {
      // Each corner gets its own cut; the top corners are cut deeper (weathered).
      const cut = (sy ? 0.12 : 0.05) + rng() * (sy ? 0.3 : 0.12);
      const y = sy * h * (0.82 + rng() * 0.18);
      const x = sx * hx * (0.9 + rng() * 0.1), z = sz * hz * (0.9 + rng() * 0.1);
      pts.push(V(x - sx * cut * w, y, z), V(x, y, z - sz * cut * d), V(x, y - (sy ? 1 : -1) * cut * h * 0.8, z));
    }
    return new ConvexGeometry(pts);
  });
}

/** A square crystal prism with a pyramid tip; base on y = 0, total height h. */
export function prism(w: number, h: number, tip = 0.3) {
  return cached(`pr${w},${h},${tip}`, () => {
    const hw = w / 2, body = h * (1 - tip);
    const pts: THREE.Vector3[] = [V(0, h, 0)];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) pts.push(V(sx * hw, 0, sz * hw), V(sx * hw, body, sz * hw));
    return new ConvexGeometry(pts);
  });
}

/** A flat octagon of radius r (to the flats), thickness t along X: wheels, coins, seals. */
export function octagon(r: number, t: number) {
  return cached(`oc${r},${t}`, () => {
    const pts: THREE.Vector3[] = [];
    const R = r / Math.cos(Math.PI / 8);
    for (let i = 0; i < 8; i++) {
      const a = (i + 0.5) * (Math.PI / 4);
      for (const sx of [-1, 1]) pts.push(V((sx * t) / 2, Math.sin(a) * R, Math.cos(a) * R));
    }
    return new ConvexGeometry(pts);
  });
}

/** Tiny deterministic hash of a few numbers into 0..1 (variants picked from a position). */
export function hash01(...v: number[]) {
  let h = 2166136261;
  for (const n of v) {
    h ^= Math.floor(n * 1000) | 0;
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}
