import * as THREE from 'three';
import { chamferBox, hash01, prism } from '../../render/blocks';
import { shareResource } from '../../render/resources';
import { type Builder, cb, chunk, decal, light, q } from './core';
import { DUNGEON_PROPS } from './dungeon';
import { BASALT, BASALT_D, BASALT_L, IRON, IRON_L } from './palette';
import { bonePile, raggedDisc } from './pieces';

// Cinderwing's den: lava seams and crusts, scorch marks, basalt columns and ridges, ember crystals and the hoard ledge.

/**
 * Cooled crust plates: Voronoi cells over an elliptical patch (radii CRUST_RX × CRUST_RZ along
 * X/Z), split by a narrow crack and extruded a few centimetres, merged into three geometries (one
 * per colour). The rim follows a ragged ellipse, so the patch has no clean outline.
 */
const CRUST_RX = 1.55, CRUST_RZ = 1.0;
const plateCache = new Map<number, THREE.BufferGeometry[]>();
function crustPlates(seed: number) {
  const hit = plateCache.get(seed);
  if (hit) return hit;
  const RX = CRUST_RX, RZ = CRUST_RZ, GAP = 0.045;
  // Scattered seeds with a varying minimum spacing: plates of mixed sizes, no honeycomb.
  const seeds: [number, number][] = [];
  for (let i = 0; i < 90 && seeds.length < 16; i++) {
    const a = hash01(seed, i, 1) * Math.PI * 2, r = Math.sqrt(hash01(seed, i, 2)) * 0.92;
    const x = Math.cos(a) * r * RX, z = Math.sin(a) * r * RZ;
    const gap = 0.34 + hash01(seed, i, 3) * 0.3;
    if (seeds.every(([sx, sz]) => Math.hypot(sx - x, sz - z) > gap)) seeds.push([x, z]);
  }
  const rim: [number, number][] = [];
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2, r = 0.8 + hash01(seed, i, 5) * 0.24;
    rim.push([Math.cos(a) * RX * r, Math.sin(a) * RZ * r]);
  }
  const parts: number[][] = [[], [], []];
  seeds.forEach(([sx, sz], si) => {
    let poly = rim.slice();
    for (const [ox, oz] of seeds) {
      if (ox === sx && oz === sz) continue;
      const dl = Math.hypot(ox - sx, oz - sz), dx = (ox - sx) / dl, dz = (oz - sz) / dl, mx = (ox + sx) / 2, mz = (oz + sz) / 2;
      const f = (p: [number, number]) => (p[0] - mx) * dx + (p[1] - mz) * dz + GAP / 2;
      const out: [number, number][] = [];
      poly.forEach((a, i) => {
        const b = poly[(i + 1) % poly.length], fa = f(a), fb = f(b);
        if (fa <= 0) out.push(a);
        if (fa <= 0 !== fb <= 0) {
          const t = fa / (fa - fb);
          out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
        }
      });
      poly = out;
      if (poly.length < 3) return;
    }
    const cx = poly.reduce((t, p) => t + p[0], 0) / poly.length, cz = poly.reduce((t, p) => t + p[1], 0) / poly.length;
    const top = 0.03 + hash01(seed, si, 3) * 0.03, bot = -0.02;
    const pos = parts[si % 3];
    const tri = (a: number[], b: number[], c: number[], want: number[]) => {
      // Wind each triangle so its normal faces `want` (up for the top, outward for the sides).
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
      if (n[0] * want[0] + n[1] * want[1] + n[2] * want[2] < 0) pos.push(...a, ...c, ...b);
      else pos.push(...a, ...b, ...c);
    };
    // A slight tilt per plate, so neighbours catch the light differently.
    const tx = (hash01(seed, si, 7) - 0.5) * 0.05, tz = (hash01(seed, si, 8) - 0.5) * 0.05;
    const yt = (x: number, z: number) => top + (x - cx) * tx + (z - cz) * tz;
    for (let i = 0; i < poly.length; i++) {
      const [ax, az] = poly[i], [bx, bz] = poly[(i + 1) % poly.length];
      tri([cx, yt(cx, cz), cz], [ax, yt(ax, az), az], [bx, yt(bx, bz), bz], [0, 1, 0]);
      const out = [(ax + bx) / 2 - cx, 0, (az + bz) / 2 - cz];
      tri([ax, yt(ax, az), az], [bx, yt(bx, bz), bz], [bx, bot, bz], out);
      tri([ax, yt(ax, az), az], [bx, bot, bz], [ax, bot, az], out);
    }
  });
  const geos = parts.filter((p) => p.length).map((p) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    geo.computeVertexNormals();
    return geo;
  });
  plateCache.set(seed, geos.map(shareResource));
  return geos;
}
export const DEN_PROPS: Record<string, Builder> = {
  /**
   * A glowing lava fissure running along local +Z (variant `v` picks its wander): a molten core in a
   * wider glowing crack, lipped both sides by cooled basalt, widest at its source (z = 0) and
   * pinching out at the far end, with a couple of short side cracks. Walkable (it hugs the floor).
   */
  lava_seam: (k, g, v) => {
    const seed = (v ?? 0) * 17 + 3;
    const L = 6.5 + hash01(seed, 1) * 3, n = Math.round(L / 0.6);
    const pts: [number, number][] = [];
    let x = 0;
    for (let i = 0; i <= n; i++) {
      pts.push([x, (i / n) * L]);
      x += (hash01(seed, i) - 0.5) * 0.7;
    }
    const lips = [BASALT, BASALT_D, BASALT_L];
    const run = (p: [number, number][], w0: number, s: number) => {
      for (let i = 0; i < p.length - 1; i++) {
        const [ax, az] = p[i], [bx, bz] = p[i + 1];
        const len = Math.hypot(bx - ax, bz - az), ang = Math.atan2(bx - ax, bz - az);
        const t = i / (p.length - 1);
        const w = q(Math.max(0.08, w0 * Math.pow(1 - t, 0.7) * (0.8 + hash01(s, i, 2) * 0.4)));
        const mx = (ax + bx) / 2, mz = (az + bz) / 2, px = Math.cos(ang), pz = -Math.sin(ang);
        // Deep red glow in the crack, a thin hot core only where it is wide (bloom does the rest).
        decal(k.box(g, [w, 0.05, q(len + 0.14)], [mx, 0.06, mz], 0x3a0c02, [0, ang, 0], 0xc8300a, 0.9));
        if (w > 0.3) decal(k.box(g, [q(w * 0.3), 0.05, q(len + 0.06)], [mx, 0.075, mz], 0xff9040, [0, ang, 0], 0xff7a20, 1.2));
        for (const side of [-1, 1]) {
          const lw = 0.26 + w * 0.35;
          chunk(k, g, s + i * 2 + (side > 0 ? 1 : 0), [q(lw), q(0.12 + w * 0.18), q(len * 0.95 + 0.12)], [mx + px * side * (w / 2 + lw * 0.32), -0.03, mz + pz * side * (w / 2 + lw * 0.32)], lips[(i + (side > 0 ? 1 : 0)) % 3], ang);
        }
      }
    };
    run(pts, 0.7, seed);
    // Side cracks off the main fissure.
    for (const [at, turn] of [[Math.floor(n * 0.3), 0.9], [Math.floor(n * 0.6), -1.0]] as [number, number][]) {
      const [sx, sz] = pts[at];
      const dir = turn + (hash01(seed, at) - 0.5) * 0.4;
      const branch: [number, number][] = [];
      for (let i = 0; i < 4; i++) branch.push([sx + Math.sin(dir) * i * 0.55, sz + Math.cos(dir) * i * 0.55]);
      run(branch, 0.32, seed + 50 + at);
    }
  },
  /**
   * Cooled lava crust set into the floor: an elongated patch (along local X) of flat basalt plates,
   * cut like a dried mud flat (Voronoi cells with a narrow gap between them) and standing barely
   * proud of the ground, a dull red glow down in the cracks.
   */
  crust: (k, g, v) => {
    const s = (v ?? 0) * 11 + 5;
    // The glow bed stops short of the rim: the cracks glow in the heart of the patch and go dark
    // toward its edge.
    const glow = decal(k.mesh(g, raggedDisc(s, 18, 0.95, 1.02, 0.12), 0x140402, [0, 0.015, 0], undefined, 0x7a1804, 0.4));
    glow.scale.set(CRUST_RX * 0.62, 1, CRUST_RZ * 0.62);
    decal(k.mesh(g, raggedDisc(s + 1, 18, 0.95, 1.02, 0.12), 0x1e1614, [0, 0.01, 0])).scale.set(CRUST_RX * 0.95, 1, CRUST_RZ * 0.95);
    const cols = [0x3a2e2a, 0x322828, BASALT];
    crustPlates(s).forEach((geo, i) => decal(k.mesh(g, geo, cols[i % 3], [0, 0, 0])));
  },
  /** Scorch mark: a small charred core (the terrain paints the wide soft burn), embers still glowing. */
  scorch: (k, g, v) => {
    const s = (v ?? 0) + 1;
    decal(k.mesh(g, raggedDisc(92 + s, 18, 0.46, 0.58, 0.35), 0x1e1512, [0, 0.03, 0]));
    decal(k.mesh(g, raggedDisc(95 + s, 12, 0.24, 0.3, 0.3), 0x0f0b0a, [0, 0.04, 0]));
    for (let i = 0; i < 5; i++) {
      const a = hash01(s, i) * 6.3, r = 0.12 + hash01(s, i, 1) * 0.45;
      decal(k.box(g, [0.07, 0.02, 0.07], [Math.cos(a) * r, 0.05, Math.sin(a) * r], 0x5a1a04, [0, a, 0], 0xff5a10, 1.4));
    }
  },
  /** A cluster of blocky basalt columns (octagonal, flat-topped, stepped heights), one fallen. */
  basalt_columns: (k, g, v) => {
    const s = (v ?? 0) * 7 + 1, n = 5 + ((v ?? 0) % 3);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + hash01(s, i) * 0.5;
      const r = i === 0 ? 0 : 0.55 + hash01(s, i, 1) * 0.35;
      const w = q(0.62 + hash01(s, i, 2) * 0.22), h = q((i === 0 ? 3.6 : 1.1 + hash01(s, i, 3) * 2.4) * (0.85 + hash01(s) * 0.3));
      const x = Math.cos(a) * r, z = Math.sin(a) * r, rot = hash01(s, i, 4) * 0.8;
      k.mesh(g, chamferBox(w, h, w, q(w * 0.24)), i % 2 ? BASALT : BASALT_D, [x, h / 2 - 0.2, z], [0, rot, 0]);
      k.mesh(g, chamferBox(q(w * 0.9), 0.1, q(w * 0.9), q(w * 0.2)), BASALT_L, [x, h - 0.17, z], [0, rot, 0]);
    }
    const fa = hash01(s, 9) * 6.3;
    k.mesh(g, chamferBox(0.6, 0.6, 2.0, 0.14), BASALT, [Math.cos(fa) * 1.5, 0.22, Math.sin(fa) * 1.5], [0, fa, 0.05]);
    for (let i = 0; i < 4; i++) chunk(k, g, s + 30 + i, [0.4, 0.3, 0.35], [Math.cos(fa + 1 + i) * 1.3, -0.05, Math.sin(fa + 1 + i) * 1.3], BASALT_D, i);
  },
  /** Ember crystals: a burst of glowing orange-red shards out of a basalt knuckle. */
  ember_crystals: (k, g, v) => {
    const s = (v ?? 0) * 5 + 2;
    chunk(k, g, 180 + s, [1.4, 0.5, 1.2], [0, -0.1, 0], BASALT, 0.4);
    const n = 4 + ((v ?? 0) % 2);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + hash01(s, i) * 0.6, r = i === 0 ? 0 : 0.35;
      const h = q(i === 0 ? 2.3 : 1.0 + hash01(s, i, 1) * 0.9), w = q(i === 0 ? 0.46 : 0.28 + hash01(s, i, 2) * 0.1);
      k.mesh(g, prism(w, h, 0.3), i % 2 ? 0xff8a3a : 0xff5a1a, [Math.cos(a) * r, 0.1, Math.sin(a) * r], [Math.sin(a) * 0.45 * (r > 0 ? 1 : 0.2), a, -Math.cos(a) * 0.45 * (r > 0 ? 1 : 0.2)], 0xff3a08, 1.5);
    }
  },
  /** An ember vent at a wall's foot: glowing crystals in a cracked basalt knuckle that light the way. */
  ember_vent: (k, g) => {
    chunk(k, g, 186, [1.9, 0.6, 1.6], [0, -0.15, 0], BASALT_D, 0.7);
    DEN_PROPS.ember_crystals(k, g, 2);
    const l = light(g, 0xff7a3a, 4.2, 10, 1.6);
    return { obj: g, light: l, tick: (t: number) => (l.intensity = 4.2 + Math.sin(t * 2.3 + g.id) * 0.5) };
  },
  /**
   * Cinderwing's hoard ledge: a raised two-tier basalt shelf with steps down the front, heaped with
   * gold, a chest, skulls and swords of the fallen, ember crystals at its back corners.
   */
  hoard_ledge: (k, g) => {
    const slabs: [number, number, number, number, number, number][] = [
      // x, z, w, d, h, y
      [-1.6, 0.2, 3.6, 3.8, 0.7, -0.1], [1.7, -0.2, 3.4, 4.0, 0.72, -0.1], [0, -1.2, 5.8, 2.4, 0.7, -0.1],
      [-0.6, -0.6, 3.4, 2.6, 0.55, 0.55], [1.2, -0.9, 2.6, 2.2, 0.55, 0.55],
    ];
    slabs.forEach(([x, z, w, d, h, y], i) => chunk(k, g, 200 + i, [w, h, d], [x, y, z], i < 3 ? BASALT : BASALT_L, hash01(i, 5) * 0.2 - 0.1));
    for (let i = 0; i < 3; i++) cb(k, g, [2.4 - i * 0.3, 0.2, 0.5], [0.1, 0.1 + i * 0.2, 2.35 - i * 0.4], i % 2 ? BASALT_L : BASALT, undefined, 0.05);
    const hoard = new THREE.Group();
    hoard.position.set(0.2, 1.05, -0.6);
    hoard.scale.setScalar(1.35);
    g.add(hoard);
    DUNGEON_PROPS.hoard(k, hoard);
    for (const [x, z, a] of [[-2.2, 0.9, 0.5], [2.4, 0.6, -0.8]] as [number, number, number][]) {
      const bones = new THREE.Group();
      bones.position.set(x, 0.6, z);
      bones.rotation.y = a;
      g.add(bones);
      bonePile(k, bones, x > 0 ? 3 : 0);
    }
    for (const [x, tilt] of [[-1.0, 0.35], [1.6, -0.3]] as [number, number][]) {
      cb(k, g, [0.08, 1.3, 0.04], [x, 1.5, 0.4], IRON_L, [0.2, 0, tilt], 0.01);
      cb(k, g, [0.34, 0.07, 0.1], [x - tilt * 0.55, 1.0, 0.3], IRON, [0.2, 0, tilt], 0.02);
    }
    for (const sx of [-1, 1]) {
      const c = new THREE.Group();
      c.position.set(sx * 2.7, 0.5, -1.7);
      g.add(c);
      DEN_PROPS.ember_crystals(k, c, sx > 0 ? 1 : 0);
    }
  },
  /** A cooled lava tongue: a low, lumpy run of black basalt plates along local +Z (`len` long). */
  basalt_ridge: (k, g, arg) => {
    const len = Math.max(2, arg ?? 5), n = Math.round(len / 0.9);
    for (let i = 0; i < n; i++) {
      const z = -len / 2 + (i + 0.5) * (len / n), t = Math.sin(((i + 0.5) / n) * Math.PI);
      const w = q(1.2 + t * 0.8 + hash01(len, i) * 0.4), h = q(0.35 + t * 0.45 + hash01(len, i, 1) * 0.2);
      chunk(k, g, 230 + i, [w, h, 1.1], [(hash01(len, i, 2) - 0.5) * 0.4, -0.08, z], i % 2 ? BASALT : BASALT_D, (hash01(len, i, 3) - 0.5) * 0.4);
      if (t > 0.5) chunk(k, g, 250 + i, [q(w * 0.6), q(h * 0.6), 0.7], [(hash01(len, i, 4) - 0.5) * 0.3, h - 0.2, z], BASALT_L, hash01(i, 4));
    }
  },
};
