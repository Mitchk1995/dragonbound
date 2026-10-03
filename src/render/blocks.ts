import * as THREE from 'three';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
import { mulberry32 } from '../core/rng';
import { shareResource } from './resources';

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
    g = shareResource(make());
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
    let g: THREE.BufferGeometry;
    if (cc <= 0.001) g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
    else {
      const pts: THREE.Vector3[] = [];
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
        pts.push(V(sx * hx, sy * (hy - cc), sz * (hz - cc)), V(sx * (hx - cc), sy * hy, sz * (hz - cc)), V(sx * (hx - cc), sy * (hy - cc), sz * hz));
      }
      g = new ConvexGeometry(pts);
    }
    // (A true box: its bounds are its faces, for the geometry audit.)
    g.userData.box = true;
    return g;
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

/**
 * A flat rock slab for stacked strata (cave walls, cliff ledges): a unit footprint (±0.5) from
 * y = 0 to 1, with vertical sides, a flat top and each corner knocked off by its own amount
 * (some barely), and a narrow bevel round the top edge so every ledge has a crisp lit lip. Scaled
 * freely per instance; unlike rockBlock it never shows big diagonal facets from above.
 */
export function slabBlock(seed: number) {
  return cached(`sl${seed}`, () => {
    const rng = mulberry32(seed * 6271 + 5);
    const ring: [number, number][] = [];
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const cut = rng() < 0.3 ? 0.02 : 0.06 + rng() * 0.16, cut2 = cut * (0.6 + rng() * 0.8);
      const x = sx * 0.5 * (0.94 + rng() * 0.06), z = sz * 0.5 * (0.94 + rng() * 0.06);
      // Two points per corner, ordered round the ring (the hull sorts it out anyway).
      ring.push([x - sx * cut, z], [x, z - sz * cut2]);
    }
    const pts: THREE.Vector3[] = [];
    const bevel = 0.07;
    for (const [x, z] of ring) {
      pts.push(V(x, 0, z), V(x, 1 - bevel, z));
      // The top ring pulled in a little: a narrow bevel all round.
      const l = Math.hypot(x, z) || 1;
      pts.push(V(x - (x / l) * bevel * 0.9, 1, z - (z / l) * bevel * 0.9));
    }
    return new ConvexGeometry(pts);
  });
}

/** How many distinct rock masses the kit holds (rockMass 0..ROCK_MASSES - 1). */
export const ROCK_MASSES = 10;

/**
 * A weathered rock mass for cliff faces (unit size: about 1 across, base on y = 0, 1 high): a
 * rounded, faceted lump of stone. Each of the kit's masses has its own profile, from a low dome to
 * a tall rounded block with a broad weathered shoulder, a slab-topped ledge or a leaning knuckle;
 * its rings are jittered point by point and turned against each other, so no two facets line up and
 * no two masses read alike. Overlapped at different sizes and turns along a face they build one
 * irregular massif, never a row of the same shape.
 */
export function rockMass(v: number) {
  return cached(`rm${v}`, () => {
    const rng = mulberry32(v * 7411 + 29);
    // [height, radius] rings from the foot to the crown: the shoulders round off at different heights.
    const profiles: [number, number][][] = [
      [[0, 1], [0.42, 0.98], [0.72, 0.88], [0.9, 0.7], [1, 0.42]],
      [[0, 1], [0.5, 0.96], [0.8, 0.9], [0.95, 0.74], [1, 0.56]],
      [[0, 1], [0.34, 0.94], [0.64, 0.82], [0.86, 0.62], [1, 0.36]],
      [[0, 1], [0.55, 1.0], [0.8, 0.94], [0.94, 0.8], [1, 0.62]],
      [[0, 1], [0.38, 0.96], [0.68, 0.86], [0.88, 0.68], [1, 0.46]],
    ];
    const prof = profiles[v % profiles.length];
    const n = 7 + Math.floor(rng() * 3), squash = 0.72 + rng() * 0.28;
    // Some lean: the upper rings slide off-centre, so the crown hangs out over one side.
    const lean = v % 3 === 2 ? [(rng() - 0.5) * 0.34, (rng() - 0.5) * 0.34] : [(rng() - 0.5) * 0.1, (rng() - 0.5) * 0.1];
    const radii = Array.from({ length: n }, () => 0.82 + rng() * 0.3);
    const pts: THREE.Vector3[] = [];
    prof.forEach(([y, r], ri) => {
      const a0 = rng() * Math.PI * 2;
      const m = ri === prof.length - 1 ? Math.max(3, n - 3) : n;
      for (let i = 0; i < m; i++) {
        const a = a0 + (i / m) * Math.PI * 2 + (rng() - 0.5) * 0.5;
        const rr = 0.5 * r * radii[(i + ri * 2) % n] * (0.9 + rng() * 0.2);
        const yy = y === 0 ? 0 : Math.min(1, y + (rng() - 0.5) * 0.08);
        pts.push(V(Math.cos(a) * rr + lean[0] * y, yy, Math.sin(a) * rr * squash + lean[1] * y));
      }
    });
    return new ConvexGeometry(pts);
  });
}

/** How tall for its width a rock mass may stand, in the steps its moss is laid for (rockMassMoss). */
export const MOSS_TALL = [0.6, 1, 1.6, 2.6, 4];

/**
 * The moss over a rock mass (rockMass(v)) stood `tall` times as high as it is wide: the faces that
 * face up on it, the top all covered and the steeper shoulders only here and there, so the moss
 * drapes over the crown in a ragged patch. It is bedded on the stone: round its edge it lies a hair
 * off the rock, and only inside the patch, each face split in four and its inner points lifted by
 * their own small amounts, does it swell off the stone, so it reads as a soft, lumpy cushion
 * following the rock, never a sheet or a sliver standing off it.
 */
export function rockMassMoss(v: number, tall = 1) {
  return cached(`rmm${v},${tall}`, () => {
    const src = rockMass(v), pos = src.getAttribute('position');
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), e = new THREE.Vector3(), nrm = new THREE.Vector3();
    const key = (p: THREE.Vector3) => `${Math.round(p.x * 1e4)},${Math.round(p.y * 1e4)},${Math.round(p.z * 1e4)}`;
    // The mossy faces, and how many of them share each edge (an edge only one shares is the patch's rim).
    const faces: THREE.Vector3[][] = [], edges = new Map<string, number>();
    const edgeKey = (p: THREE.Vector3, q: THREE.Vector3) => [key(p), key(q)].sort().join('|');
    for (let t = 0; t < pos.count; t += 3) {
      a.fromBufferAttribute(pos, t);
      b.fromBufferAttribute(pos, t + 1);
      c.fromBufferAttribute(pos, t + 2);
      // (The hull's faces wind counter-clockwise seen from outside: this is the outward normal.)
      // (Judged as the face will lie on a mass stood `tall` times as high as it is wide.)
      nrm.subVectors(b, a).cross(e.subVectors(c, a));
      nrm.y /= tall;
      nrm.normalize();
      if (nrm.y < 0.36 + hash01(v, t) * 0.3) continue;
      faces.push([a.clone(), b.clone(), c.clone()]);
      for (const [p, q] of [[a, b], [b, c], [c, a]]) edges.set(edgeKey(p, q), (edges.get(edgeKey(p, q)) ?? 0) + 1);
    }
    // Points on the rim (the corners and middles of rim edges) lie on the stone; the rest swell off it.
    const rim = new Set<string>();
    for (const [p, q, r] of faces) for (const [m, n] of [[p, q], [q, r], [r, p]]) {
      if (edges.get(edgeKey(m, n)) !== 1) continue;
      rim.add(key(m));
      rim.add(key(n));
      rim.add(key(m.clone().lerp(n, 0.5)));
    }
    const out: number[] = [];
    // (Each point is lifted straight up by an amount that depends on the point alone, so faces sharing it stay joined.)
    const put = (p: THREE.Vector3) => out.push(p.x, p.y + (rim.has(key(p)) ? 0.006 : 0.016 + hash01(v, Math.round(p.x * 200), Math.round(p.y * 200), Math.round(p.z * 200)) * 0.024), p.z);
    for (const [p, q, r] of faces) {
      const pq = p.clone().lerp(q, 0.5), qr = q.clone().lerp(r, 0.5), rp = r.clone().lerp(p, 0.5);
      for (const [p0, p1, p2] of [[p, pq, rp], [pq, q, qr], [rp, qr, r], [pq, qr, rp]]) {
        put(p0);
        put(p1);
        put(p2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
    g.computeVertexNormals();
    return g;
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
