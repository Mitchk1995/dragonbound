import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../src/core/rng';
import { SPRAY_CELLS, sprayCell } from '../src/render/foliage';
import { growTree, leafGeometry, woodGeometry } from '../src/world/treeGrowth';
import { DEAD_ASH, killTree } from '../src/world/treeGrowth/deadwood';
import { BUSH, growShrub } from '../src/world/treeGrowth/shrub';
import { clearOfStones, thinWood, treeSet } from '../src/world/trees';
import { BUSHES, DEAD_ASHES, grownStandIns } from '../src/world/treeStandIns';

/** The natural style's grown dead ash and bushes (treeStandIns.ts), grown as the trees are. */

const tris = (g: THREE.BufferGeometry) => g.index!.count / 3;
const box = (g: THREE.BufferGeometry) => new THREE.Box3().setFromBufferAttribute(g.getAttribute('position') as THREE.BufferAttribute);
const ashes = DEAD_ASHES.map(({ seed, form, death }) => {
  const alive = growTree({ ...DEAD_ASH, ...form }, seed);
  const sk = killTree(growTree({ ...DEAD_ASH, ...form }, seed), seed, death);
  return { alive, sk, wood: woodGeometry(sk) };
});
const bushes = BUSHES.map(({ seed, form }) => {
  const sk = growShrub({ ...BUSH, ...form }, seed);
  return { sk, wood: woodGeometry(sk), leaves: leafGeometry(sk, seed) };
});

/** How many triangles share each edge of an indexed mesh. */
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

/** Connected pieces of an indexed mesh, and vertices no triangle uses. */
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

/** One connected surface, no edge carrying more than two faces, open only round its foot under the ground (on a slope of 1 in 2.5 too). */
function expectOneClosedPiece(wood: THREE.BufferGeometry, at: string) {
  expect(pieces(wood), at).toEqual({ pieces: 1, unused: 0 });
  const pos = wood.getAttribute('position');
  let rim = 0;
  for (const [key, n] of edgeUse(wood)) {
    expect(n, at).toBeLessThanOrEqual(2);
    if (n === 1) for (const v of key.split(',').map(Number)) {
      rim++;
      expect(pos.getY(v) + 0.4 * Math.hypot(pos.getX(v), pos.getZ(v)), at).toBeLessThan(-0.02);
    }
  }
  expect(rim, at).toBeGreaterThan(0);
}

describe('the dead ash', () => {
  it('grows the same from the same seed, and each shape differs', () => {
    const again = killTree(growTree({ ...DEAD_ASH, ...DEAD_ASHES[0].form }, DEAD_ASHES[0].seed), DEAD_ASHES[0].seed, DEAD_ASHES[0].death);
    expect(Array.from(woodGeometry(again).getAttribute('position').array)).toEqual(Array.from(ashes[0].wood.getAttribute('position').array));
    expect(new Set(ashes.map((a) => tris(a.wood))).size).toBe(ashes.length);
  });

  it('is one grown surface, trunk, roots, limbs and every break, its foot running into the ground', () => {
    ashes.forEach(({ wood }, v) => expectOneClosedPiece(wood, `dead ash ${v + 1}`));
  });

  it('is bare and broken: no leaves, its top snapped off, limbs and branches snapped, most of its twigs fallen', () => {
    for (const { alive, sk } of ashes) {
      expect(sk.sprays.length).toBe(0);
      expect(sk.limbs[0].broken).toBeDefined();
      expect(sk.limbs.filter((L) => L.broken !== undefined).length).toBeGreaterThanOrEqual(4);
      expect(sk.limbs.length).toBeLessThan(alive.limbs.length);
      expect(sk.height).toBeLessThan(alive.height);
      // (It keeps its roots and the girth it grew to.)
      expect(sk.roots.length).toBe(alive.roots.length);
      expect(sk.limbs[0].radius[0]).toBe(alive.limbs[0].radius[0]);
    }
  });

  it('ends each snapped limb in a ragged break: splinters standing to heights of their own round a sunk face', () => {
    for (const { sk, wood } of ashes) {
      const pos = wood.getAttribute('position'), p = new THREE.Vector3();
      for (const L of sk.limbs.filter((l) => l.broken !== undefined && l.radius[l.radius.length - 1] > 0.05)) {
        const len = L.arc[L.arc.length - 1], end = L.path[L.path.length - 1], T = L.tangent[L.tangent.length - 1], r = L.radius[L.radius.length - 1];
        const h = Math.min(len * 0.25, Math.max(0.05, r * 2));
        // The splinters: the wood's points standing past the break's last ring, drawn in from it.
        const heights: number[] = [];
        for (let i = 0; i < pos.count; i++) {
          p.fromBufferAttribute(pos, i).sub(end);
          const along = p.dot(T), across = p.clone().addScaledVector(T, -along).length();
          if (along > -h * 0.92 && along < 0.01 && across < r * 0.9 && across > r * 0.3) heights.push(along);
        }
        expect(heights.length).toBeGreaterThanOrEqual(3);
        expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThan(h * 0.3);
      }
    }
  });

  it('stands true to size: a dead tree two to four times the 2 m hero\'s height, its crown open', () => {
    for (const { sk, wood } of ashes) {
      const b = box(wood);
      expect(b.max.y).toBeGreaterThan(3.5);
      expect(b.max.y).toBeLessThan(8.5);
      expect(Math.max(b.max.x - b.min.x, b.max.z - b.min.z)).toBeGreaterThan(2.5);
      expect(sk.limbs[0].radius[sk.limbs[0].path.findIndex((q) => q.y >= 1.3)]).toBeGreaterThan(0.3);
    }
  });

  it('stays within its triangle budget', () => {
    for (const { wood } of ashes) expect(tris(wood)).toBeLessThanOrEqual(4000);
  });
});

describe('the bushes', () => {
  it('grow the same from the same seed', () => {
    const again = growShrub({ ...BUSH, ...BUSHES[1].form }, BUSHES[1].seed);
    expect(Array.from(leafGeometry(again, BUSHES[1].seed).getAttribute('position').array)).toEqual(Array.from(bushes[1].leaves.getAttribute('position').array));
  });

  it('are one grown surface each: several stems out of one root crown at their foot', () => {
    bushes.forEach(({ sk, wood }, v) => {
      expectOneClosedPiece(wood, `bush ${v + 1}`);
      const crown = sk.limbs[0], stems = sk.limbs.filter((L) => L.order === 1);
      expect(stems.length).toBeGreaterThanOrEqual(4);
      // Each stem leaves the root crown from under the ground, its collar ending at the grass.
      const yAt = (s: number) => crown.path[crown.arc.findIndex((a) => a >= s)].y;
      for (const L of stems) {
        expect(L.path[0].y, `bush ${v + 1}`).toBeLessThan(0.05);
        expect(yAt(L.joint!.s + L.joint!.h), `bush ${v + 1}`).toBeLessThan(0.35);
      }
    });
  });

  it('wear a dome of leaf sprays reaching down to the grass, none under it, the stems hidden in it', () => {
    for (const { sk, wood, leaves } of bushes) {
      const l = box(leaves), w = box(wood);
      expect(l.min.y).toBeGreaterThanOrEqual(0);
      expect(l.min.y).toBeLessThan(0.25);
      expect(l.max.y).toBeLessThan(sk.height + 0.7);
      expect(w.max.y).toBeLessThan(l.max.y);
      expect(Math.min(l.max.x - l.min.x, l.max.z - l.min.z)).toBeGreaterThan(1.6);
      expect(sk.sprays.length).toBeGreaterThan(120);
      // Every shoot carries leaves along it.
      sk.limbs.forEach((L, i) => L.order === 2 && expect(sk.sprays.some((q) => q.limb === i && q.s < L.arc[L.arc.length - 1] - 1e-6)).toBe(true));
    }
  });

  it('show every spray design of the bush leaves, on cards lit from above', () => {
    const cells = Array.from({ length: SPRAY_CELLS * SPRAY_CELLS }, (_, i) => sprayCell(i));
    for (const { leaves } of bushes) {
      const uv = leaves.getAttribute('uv'), nrm = leaves.getAttribute('normal'), used = new Set<number>();
      for (let i = 0; i < uv.count; i += 4) used.add(cells.findIndex((r) => uv.getX(i) >= r.u0 && uv.getX(i) <= r.u1 && uv.getY(i) >= r.v0 && uv.getY(i) <= r.v1));
      expect(used.size).toBe(cells.length);
      let up = 0;
      for (let i = 0; i < nrm.count; i++) up += nrm.getY(i);
      expect(up / nrm.count).toBeGreaterThan(0.2);
    }
  });

  it('stay within their triangle budget (wood and leaves together)', () => {
    for (const { wood, leaves } of bushes) expect(tris(wood) + tris(leaves)).toBeLessThanOrEqual(3500);
  });
});

describe('the dead ash and bushes in the world', () => {
  it('the natural style grows them, each shape its own wood (and a bush its own leaves); the other styles keep the block ones', () => {
    const { ash, bush } = treeSet('natural').grown!;
    expect(treeSet('natural').grown).toBe(grownStandIns());
    expect(ash.trunk.length).toBe(DEAD_ASHES.length);
    expect(ash.canopy.length).toBe(0);
    expect(bush.trunk.length).toBe(BUSHES.length);
    expect(bush.canopy.length).toBe(BUSHES.length);
    expect(treeSet('block').grown).toBeUndefined();
    expect(treeSet('faceted').grown).toBeUndefined();
  });

  it('plants no dead ash with its foot in a boulder', () => {
    const stones = [{ x: 0, z: 0, r: 0.5 }, { x: 10, z: 0, r: 0.8 }];
    expect(clearOfStones([{ x: 1.2, z: 0 }, { x: 1.6, z: 0 }, { x: 8.3, z: 0 }, { x: 5, z: 5 }], stones, 1)).toEqual([false, true, false, true]);
  });

  it('a wood keeps its dead ash in their own patches before the living trees round them, each its room', () => {
    const rng = mulberry32(9);
    const pts = (n: number, spacing: number, first = false) => Array.from({ length: n }, () => ({ x: rng() * 40, z: rng() * 40, spacing, first }));
    const dead = pts(30, 5.5, true), oaks = pts(300, 7.5);
    const thin = thinWood([...oaks, ...dead]);
    const kept = [...oaks, ...dead].filter((_, i) => thin.trees[i]);
    // Every dead ash left out stood within 5.5 m of another kept dead ash: no oak took its place.
    dead.forEach((p, i) => thin.trees[oaks.length + i] || expect(kept.some((q) => q.first && q !== p && Math.hypot(p.x - q.x, p.z - q.z) < 5.5)).toBe(true));
    for (const p of kept) for (const q of kept) if (p !== q) expect(Math.hypot(p.x - q.x, p.z - q.z)).toBeGreaterThanOrEqual(Math.max(p.spacing, q.spacing));
  });
});
