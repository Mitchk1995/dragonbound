import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { coverageMips, LEAF_ATLAS, oakLeafHalfWidth, paintBark, paintLeafAtlas, SPRAY_CELLS } from '../src/render/foliage';
import { SIZE } from '../src/render/textures';
import { mulberry32 } from '../src/core/rng';
import { OAK_SEEDS, thinWood, treeSet, treeTriangles, type GrownLook } from '../src/world/trees';
import { growTree, leafGeometry, OAK, woodGeometry } from '../src/world/treeGrowth';

const tris = (g: THREE.BufferGeometry) => g.index!.count / 3;
const oaks = OAK_SEEDS.map((seed) => {
  const sk = growTree(OAK, seed);
  return { seed, sk, wood: woodGeometry(sk), leaves: leafGeometry(sk, seed) };
});

/** Connected pieces of an indexed mesh (vertices joined by its triangles), and vertices no triangle uses. */
function pieces(g: THREE.BufferGeometry) {
  const n = g.getAttribute('position').count, idx = g.index!.array;
  const up = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => (up[i] === i ? i : (up[i] = find(up[i])));
  const used = new Set<number>();
  for (let t = 0; t < idx.length; t += 3) {
    const a = find(idx[t]);
    up[find(idx[t + 1])] = a;
    up[find(idx[t + 2])] = a;
    for (let k = 0; k < 3; k++) used.add(idx[t + k]);
  }
  return { pieces: new Set([...used].map(find)).size, unused: n - used.size };
}

/** How many triangles share each edge. */
function edgeUse(g: THREE.BufferGeometry) {
  const idx = g.index!.array, use = new Map<string, number>();
  for (let t = 0; t < idx.length; t += 3) {
    for (let k = 0; k < 3; k++) {
      const a = idx[t + k], b = idx[t + ((k + 1) % 3)], key = a < b ? `${a},${b}` : `${b},${a}`;
      use.set(key, (use.get(key) ?? 0) + 1);
    }
  }
  return use;
}

describe('grown trees: the oak', () => {
  it('the same seed grows the same oak, another seed another', () => {
    const again = growTree(OAK, OAK_SEEDS[0]);
    const a = oaks[0], b = oaks[1];
    expect(Array.from(woodGeometry(again).getAttribute('position').array)).toEqual(Array.from(a.wood.getAttribute('position').array));
    expect(Array.from(leafGeometry(again, a.seed).getAttribute('position').array)).toEqual(Array.from(a.leaves.getAttribute('position').array));
    expect(Array.from(b.wood.getAttribute('position').array)).not.toEqual(Array.from(a.wood.getAttribute('position').array));
  });

  it('its trunk, roots, limbs and branches are one connected surface, welded at every fork', () => {
    for (const { wood } of oaks) {
      expect(pieces(wood)).toEqual({ pieces: 1, unused: 0 });
      // Manifold: no edge carries more than two faces, and the only open edges are round the
      // trunk's foot, under the ground (every tip, collar and step is closed).
      const pos = wood.getAttribute('position');
      for (const [key, n] of edgeUse(wood)) {
        expect(n).toBeLessThanOrEqual(2);
        if (n === 1) for (const v of key.split(',').map(Number)) expect(pos.getY(v)).toBeLessThan(-0.4);
      }
    }
  });

  it('its wood faces outward from every limb', () => {
    const { sk, wood } = oaks[0];
    const pts = sk.limbs.flatMap((L) => L.path);
    const pos = wood.getAttribute('position'), idx = wood.index!.array;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3(), mid = new THREE.Vector3();
    let out = 0, total = 0;
    for (let t = 0; t < idx.length; t += 3) {
      a.fromBufferAttribute(pos, idx[t]);
      b.fromBufferAttribute(pos, idx[t + 1]);
      c.fromBufferAttribute(pos, idx[t + 2]);
      n.subVectors(b, a).cross(c.clone().sub(a));
      if (n.lengthSq() < 1e-12) continue;
      mid.copy(a).add(b).add(c).divideScalar(3);
      let near = pts[0], best = Infinity;
      for (const p of pts) {
        const d = p.distanceToSquared(mid);
        if (d < best) { best = d; near = p; }
      }
      total++;
      if (n.dot(mid.clone().sub(near)) > 0) out++;
    }
    expect(out / total).toBeGreaterThan(0.97);
  });

  it('stands true to size beside the 2 m hero: about 11 m tall, a crown wider than it is tall, a massive trunk', () => {
    for (const { sk, wood, leaves } of oaks) {
      const w = new THREE.Box3().setFromBufferAttribute(wood.getAttribute('position') as THREE.BufferAttribute);
      const l = new THREE.Box3().setFromBufferAttribute(leaves.getAttribute('position') as THREE.BufferAttribute);
      expect(sk.height).toBeGreaterThanOrEqual(OAK.height[0]);
      expect(sk.height).toBeLessThanOrEqual(OAK.height[1]);
      // The topmost sprays reach the tree's height, not past it by much.
      expect(l.max.y).toBeGreaterThan(sk.height - 1.2);
      expect(l.max.y).toBeLessThan(sk.height + 0.6);
      expect(w.max.y).toBeLessThan(l.max.y);
      const spread = Math.min(l.max.x - l.min.x, l.max.z - l.min.z);
      expect(spread).toBeGreaterThan(sk.height);
      expect(spread).toBeLessThan(17);
      // The crown's lowest leaves hang above the hero's head.
      expect(l.min.y).toBeGreaterThan(2.1);
      const trunk = sk.limbs[0], breast = trunk.path.findIndex((p) => p.y >= 1.3);
      expect(trunk.radius[breast]).toBeGreaterThan(OAK.trunk * 0.95);
      expect(trunk.radius[breast]).toBeLessThan(OAK.trunk * 1.15);
    }
  });

  it('keeps every main limb and root, and almost every branch, welded on', () => {
    for (const { sk } of oaks) {
      const count = (order: number) => sk.limbs.filter((L) => L.order === order).length;
      expect(count(0)).toBe(1);
      expect(count(-1)).toBe(OAK.roots);
      expect(count(1)).toBeGreaterThanOrEqual(OAK.limbs[0]);
      expect(count(1)).toBeLessThanOrEqual(OAK.limbs[1]);
      expect(count(2)).toBeGreaterThan(25);
      expect(sk.dropped).toBeLessThanOrEqual(Math.max(3, sk.limbs.length * 0.12));
      expect(sk.limbs.slice(1).every((L) => L.joint !== null)).toBe(true);
    }
  });

  it('stays within its triangle budget (wood and leaves together)', () => {
    for (const { wood, leaves } of oaks) {
      expect(tris(wood) + tris(leaves)).toBeLessThanOrEqual(8000);
      expect(tris(leaves)).toBeGreaterThan(1200);
    }
    expect(treeTriangles('natural').grove).toBeLessThanOrEqual(8000);
  });

  it('leaf cards: each shows one painted spray, lit by unit normals turned toward the sky', () => {
    const { leaves } = oaks[0];
    const uv = leaves.getAttribute('uv'), nrm = leaves.getAttribute('normal'), cell = 1 / SPRAY_CELLS;
    let up = 0;
    for (let i = 0; i < uv.count; i += 4) {
      const us = [0, 1, 2, 3].map((k) => uv.getX(i + k)), vs = [0, 1, 2, 3].map((k) => uv.getY(i + k));
      expect(Math.floor(Math.min(...us) / cell)).toBe(Math.floor((Math.max(...us) - 1e-6) / cell));
      expect(Math.floor(Math.min(...vs) / cell)).toBe(Math.floor((Math.max(...vs) - 1e-6) / cell));
    }
    for (let i = 0; i < nrm.count; i++) {
      expect(Math.hypot(nrm.getX(i), nrm.getY(i), nrm.getZ(i))).toBeCloseTo(1, 4);
      up += nrm.getY(i);
    }
    expect(up / nrm.count).toBeGreaterThan(0.25);
  });
});

describe('grown trees: painted surfaces', () => {
  it('an oak leaf has rounded lobes: its outline swells and dips three or more times a side', () => {
    for (const left of [true, false]) {
      const w = Array.from({ length: 400 }, (_, i) => oakLeafHalfWidth((i + 0.5) / 400, left));
      let dips = 0;
      for (let i = 1; i < w.length - 1; i++) if (w[i] < w[i - 1] && w[i] <= w[i + 1]) dips++;
      expect(dips).toBeGreaterThanOrEqual(3);
      expect(oakLeafHalfWidth(0, left)).toBe(0);
      expect(oakLeafHalfWidth(1, left)).toBe(0);
    }
  });

  it('the leaf atlas: sprays on clear ground, and mipmaps that keep the leaves as full at a distance', () => {
    const levels = coverageMips(paintLeafAtlas(), LEAF_ATLAS);
    expect(levels[0].width).toBe(LEAF_ATLAS);
    expect(levels[levels.length - 1].width).toBe(1);
    const passing = (l: (typeof levels)[number]) => {
      let p = 0;
      for (let i = 3; i < l.data.length; i += 4) if (l.data[i] >= 128) p++;
      return p / (l.width * l.height);
    };
    const full = passing(levels[0]);
    expect(full).toBeGreaterThan(0.2);
    expect(full).toBeLessThan(0.7);
    // Each cell's corners are clear (the sprays never touch a neighbour's).
    const cell = LEAF_ATLAS / SPRAY_CELLS, a = (x: number, y: number) => levels[0].data[(y * LEAF_ATLAS + x) * 4 + 3];
    for (let cy = 0; cy < SPRAY_CELLS; cy++) for (let cx = 0; cx < SPRAY_CELLS; cx++) {
      for (const [x, y] of [[0, cell - 1], [cell - 1, cell - 1], [0, 0]]) expect(a(cx * cell + x, cy * cell + y)).toBe(0);
    }
    for (const l of levels.filter((l) => l.width >= 16)) {
      expect(passing(l) / full).toBeGreaterThan(0.85);
      expect(passing(l) / full).toBeLessThan(1.15);
    }
    // Clear texels carry the leaves' colour (no dark fringe where an edge is filtered).
    let dark = 0, clear = 0;
    for (let i = 0; i < levels[0].data.length; i += 4) {
      if (levels[0].data[i + 3] > 0) continue;
      clear++;
      if (levels[0].data[i + 1] < 40) dark++;
    }
    expect(dark / clear).toBeLessThan(0.01);
  });

  it('the bark tiles without a seam and has real furrows', () => {
    const data = paintBark();
    const at = (x: number, y: number) => data[(y * SIZE + x) * 4];
    const col = (a: number, b: number) => {
      let s = 0;
      for (let y = 0; y < SIZE; y++) s += Math.abs(at(a, y) - at(b, y));
      return s / SIZE;
    };
    const row = (a: number, b: number) => {
      let s = 0;
      for (let x = 0; x < SIZE; x++) s += Math.abs(at(x, a) - at(x, b));
      return s / SIZE;
    };
    let colStep = 0, rowStep = 0;
    for (let i = 0; i < SIZE - 1; i++) {
      colStep = Math.max(colStep, col(i, i + 1));
      rowStep = Math.max(rowStep, row(i, i + 1));
    }
    expect(col(SIZE - 1, 0)).toBeLessThan(colStep * 1.05 + 2);
    expect(row(SIZE - 1, 0)).toBeLessThan(rowStep * 1.05 + 2);
    // Furrows run up the bark: it changes far faster across than along.
    let across = 0, alongBark = 0;
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE - 1; x++) across += Math.abs(at(x + 1, y) - at(x, y));
    for (let y = 0; y < SIZE - 1; y++) for (let x = 0; x < SIZE; x++) alongBark += Math.abs(at(x, y + 1) - at(x, y));
    expect(across).toBeGreaterThan(alongBark * 1.5);
    let lo = 255, hi = 0;
    for (let i = 0; i < data.length; i += 4) {
      lo = Math.min(lo, data[i]);
      hi = Math.max(hi, data[i]);
    }
    expect(hi - lo).toBeGreaterThan(150);
  });
});

describe('grown trees in the world', () => {
  it('the natural style pairs the wood of each oak with its own leaves; block trees still share one trunk', () => {
    const natural = treeSet('natural'), block = treeSet('block');
    expect(natural.trunk.grove.length).toBe(OAK_SEEDS.length);
    expect(natural.canopy.grove.length).toBe(OAK_SEEDS.length);
    expect(natural.grown.grove).toBeDefined();
    expect(block.trunk.grove.length).toBe(1);
    expect(block.grown).toEqual({});
  });

  it('a wood of grown trees is thinned to their spacing, and nothing smaller stands under a kept crown', () => {
    const rng = mulberry32(5);
    const pts = (n: number) => Array.from({ length: n }, () => ({ x: rng() * 60, z: rng() * 60 }));
    const at = { grove: pts(500), pine: pts(150), ash: pts(20) }, bushes = pts(80);
    const look = treeSet('natural').grown.grove as GrownLook;
    const thin = thinWood(at, { grove: look }, bushes);
    const kept = at.grove.filter((_, i) => thin.trees.grove[i]);
    expect(kept.length).toBeGreaterThan(20);
    for (const p of kept) for (const q of kept) if (p !== q) expect(Math.hypot(p.x - q.x, p.z - q.z)).toBeGreaterThanOrEqual(look.spacing);
    // Every oak left out stood too close to one kept (the wood is as full as its spacing allows).
    at.grove.forEach((p, i) => thin.trees.grove[i] || expect(kept.some((q) => Math.hypot(p.x - q.x, p.z - q.z) < look.spacing)).toBe(true));
    const underCrown = (p: { x: number; z: number }) => kept.some((q) => Math.hypot(p.x - q.x, p.z - q.z) < look.spacing * 0.5);
    at.pine.forEach((p, i) => expect(thin.trees.pine[i]).toBe(!underCrown(p)));
    bushes.forEach((p, i) => expect(thin.under[i]).toBe(!underCrown(p)));
    // The same wood thins the same way every visit.
    expect(thinWood(at, { grove: look }, bushes)).toEqual(thin);
  });
});
