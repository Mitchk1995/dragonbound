import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../src/core/rng';
import { SPRAY_CELLS, sprayCell } from '../src/render/foliage';
import { growTree, leafGeometry, OAK, woodGeometry } from '../src/world/treeGrowth';
import { DEAD_ASH, killTree } from '../src/world/treeGrowth/deadwood';
import { along, arcAtHeight, normalOn, pointOn, sidesAt, tangentOn } from '../src/world/treeGrowth/skeleton';
import { branchAlignedWoodGeometry } from '../src/world/treeGrowth/wood';
import { BUSH, growShrub } from '../src/world/treeGrowth/shrub';
import { clearOfStones, thinWood, treeSet } from '../src/world/trees';
import { BUSHES, DEAD_ASHES, grownStandIns } from '../src/world/treeStandIns';

/** The natural style's grown dead ash and bushes (treeStandIns.ts), grown as the trees are. */

const tris = (g: THREE.BufferGeometry) => g.index!.count / 3;
const box = (g: THREE.BufferGeometry) => new THREE.Box3().setFromBufferAttribute(g.getAttribute('position') as THREE.BufferAttribute);
const ashes = DEAD_ASHES.map(({ seed, form, death }) => {
  const alive = growTree({ ...DEAD_ASH, ...form }, seed);
  const sk = killTree(growTree({ ...DEAD_ASH, ...form }, seed), seed, death);
  return { alive, sk, wood: branchAlignedWoodGeometry(sk) };
});
const bushes = BUSHES.map(({ seed, form }) => {
  const sk = growShrub({ ...BUSH, ...form }, seed);
  return { sk, wood: woodGeometry(sk), leaves: leafGeometry(sk, seed) };
});

/** A UV seam has coincident copies of a surface vertex; audit their exact positions as one vertex. */
function surfaceIndices(g: THREE.BufferGeometry) {
  const pos = g.getAttribute('position'), unique = new Map<string, number>(), remap: number[] = [];
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i)},${pos.getY(i)},${pos.getZ(i)}`;
    if (!unique.has(key)) unique.set(key, i);
    remap.push(unique.get(key)!);
  }
  return Array.from(g.index!.array, (i) => remap[i]);
}

/** How many triangles share each geometric edge, including edges cut only for UV seams. */
function edgeUse(g: THREE.BufferGeometry) {
  const idx = surfaceIndices(g), use = new Map<string, number>();
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
  const n = g.getAttribute('position').count, idx = surfaceIndices(g);
  const up = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => (up[i] === i ? i : (up[i] = find(up[i])));
  const used = new Set<number>();
  for (let t = 0; t < idx.length; t += 3) {
    const a = find(idx[t]);
    up[find(idx[t + 1])] = a;
    up[find(idx[t + 2])] = a;
    for (let k = 0; k < 3; k++) used.add(idx[t + k]);
  }
  return { pieces: new Set([...used].map(find)).size, unused: n - new Set(g.index!.array).size };
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
    expect(Array.from(branchAlignedWoodGeometry(again).getAttribute('position').array)).toEqual(Array.from(ashes[0].wood.getAttribute('position').array));
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

  it('keeps each ash collar in its branch frame without winding the grain, with length measured along the branch', () => {
    for (const { sk, wood } of ashes) {
      const pos = wood.getAttribute('position'), A = wood.getAttribute('aBarkA'), B = wood.getAttribute('aBarkB');
      const w = wood.getAttribute('aWood'), uv = wood.getAttribute('aBarkUV'), idx = wood.index!.array;
      for (const L of sk.limbs.filter((l) => l.parent >= 0)) {
        const start = L.joint!.ring, p = pointOn(L, start), t = tangentOn(L, start), n = normalOn(L, start, t);
        const b = new THREE.Vector3().crossVectors(t, n), r = along(L.radius, L, start);
        const first = new Set<number>();
        for (let j = 0; j < sidesAt(L, start); j++) {
          const a = j / sidesAt(L, start) * Math.PI * 2;
          const at = p.clone().addScaledVector(n, Math.cos(a) * r).addScaledVector(b, Math.sin(a) * r);
          for (let i = 0; i < pos.count; i++) if (w.getW(i) === 1 && at.distanceTo(new THREE.Vector3().fromBufferAttribute(pos, i)) < 1e-5) first.add(i);
        }
        const firstPositions = new Set([...first].map((i) => `${pos.getX(i)},${pos.getY(i)},${pos.getZ(i)}`));
        expect(firstPositions.size).toBe(sidesAt(L, start));
        const foot = [...first][0], k = Math.max(0.75, Math.min(4, sk.species.bark * A.getZ(foot) / (Math.PI * 2 * L.radius[0])));
        const rim = new Set<number>(), collarFirst = new Set<number>();
        for (let i = 0; i < idx.length; i += 3) {
          if (!first.has(idx[i + 2])) continue;
          for (let j = i; j < i + 3; j++) {
            if (first.has(idx[j])) collarFirst.add(idx[j]);
            else rim.add(idx[j]);
          }
        }
        expect(rim.size).toBeGreaterThanOrEqual(4);
        for (const i of rim) {
          const delta = new THREE.Vector3().fromBufferAttribute(pos, i).sub(p), a = Math.atan2(delta.dot(b), delta.dot(n));
          expect(B.getX(i)).toBeCloseTo(Math.cos(a), 5);
          expect(B.getY(i)).toBeCloseTo(Math.sin(a), 5);
          expect(B.getW(i)).toBe(0);
          expect(uv.getY(i)).toBeCloseTo(w.getZ(foot) + delta.dot(t) * k, 5);
          expect(uv.getW(i)).toBe(w.getZ(i));
          const turn = uv.getX(i) - (a / (Math.PI * 2) * A.getZ(foot) + A.getW(foot));
          expect(turn).toBeCloseTo(Math.round(turn), 4);
        }
        const parent = sk.limbs[L.parent], pc = pointOn(parent, L.joint!.s), pt = tangentOn(parent, L.joint!.s);
        const pn = normalOn(parent, L.joint!.s, pt), pb = new THREE.Vector3().crossVectors(pt, pn);
        const parentRim = [...rim][0], parentTiles = A.getZ(parentRim), parentOffset = A.getW(parentRim);
        const pk = parentTiles * sk.species.bark / (Math.PI * 2 * (parent.order ? parent.radius[0] : along(parent.radius, parent, arcAtHeight(parent, 1.3))));
        const parentScale = Math.max(0.75, Math.min(4, pk)), parentFoot = [...collarFirst][0];
        const anchor = new THREE.Vector3().fromBufferAttribute(pos, parentFoot);
        for (const i of collarFirst) {
          expect(uv.getY(i)).toBe(w.getZ(i));
          const at = new THREE.Vector3().fromBufferAttribute(pos, i), delta = at.clone().sub(pc), a = Math.atan2(delta.dot(pb), delta.dot(pn));
          const turn = uv.getZ(i) - (a / (Math.PI * 2) * parentTiles + parentOffset);
          expect(turn).toBeCloseTo(Math.round(turn), 4);
          expect(uv.getW(i) - uv.getW(parentFoot)).toBeCloseTo(at.sub(anchor).dot(pt) * parentScale, 4);
        }
      }
    }
  });

  it('changes ash mapping only: its grown surface and shade stay identical, and living wood keeps its approved chart', () => {
    for (const { sk, wood } of ashes) {
      const before = woodGeometry(sk);
      expect(wood.index!.count).toBe(before.index!.count);
      for (const name of ['position', 'normal', 'color', 'aWood', 'aBarkA', 'aDead']) {
        const a = wood.getAttribute(name), b = before.getAttribute(name);
        for (let i = 0; i < wood.index!.count; i++) for (let j = 0; j < a.itemSize; j++) {
          expect(a.getComponent(wood.index!.getX(i), j)).toBe(b.getComponent(before.index!.getX(i), j));
        }
      }
    }
    expect(woodGeometry(growTree(OAK, 1)).getAttribute('aBarkUV')).toBeUndefined();
    for (const { wood } of bushes) expect(wood.getAttribute('aBarkUV')).toBeUndefined();
  });

  it('cuts linear UV charts without changing the grain where neighbouring faces meet', () => {
    for (const { wood } of ashes) {
      const uv = wood.getAttribute('aBarkUV'), w = wood.getAttribute('aWood'), idx = wood.index!.array, welded = surfaceIndices(wood);
      const edges = new Map<string, { primary: number[][]; parent: number[][]; collar: boolean }>();
      const sameGrain = (a: number[][], b: number[][], at: string) => {
        const turns = a.map((p, i) => p[0] - b[i][0]);
        for (const turn of turns) expect(turn, at).toBeCloseTo(Math.round(turn), 4);
        expect(turns[0], at).toBeCloseTo(turns[1], 4);
        a.forEach((p, i) => expect(p[1], at).toBeCloseTo(b[i][1], 5));
      };
      for (let t = 0; t < idx.length; t += 3) {
        const collar = w.getW(idx[t + 2]) === 1, cap = [idx[t], idx[t + 1], idx[t + 2]].some((i) => w.getY(i) <= 0.00101);
        for (let k = 0; k < 3; k++) {
          const a = t + k, b = t + ((k + 1) % 3);
          const ids = [a, b].sort((x, y) => welded[x] - welded[y]);
          const primary = ids.map((j) => [uv.getX(idx[j]), uv.getY(idx[j])]);
          const parent = ids.map((j) => [uv.getZ(idx[j]), uv.getW(idx[j])]);
          [...primary, ...parent].flat().forEach((c) => expect(Number.isFinite(c)).toBe(true));
          // The broken face has its own planar chart; its edge is an intentional cut from the side.
          const key = `${cap ? 'cap' : 'side'}:${ids.map((j) => welded[j]).join(',')}`;
          const previous = edges.get(key);
          if (previous) {
            if (collar && previous.collar) {
              sameGrain(primary, previous.primary, `${key} branch chart`);
              sameGrain(parent, previous.parent, `${key} parent chart`);
            } else if (!collar && !previous.collar) sameGrain(primary, previous.primary, key);
            else {
              const rim = ids.every((j) => w.getW(idx[j]) === 0);
              sameGrain(collar && rim ? parent : primary, previous.collar && rim ? previous.parent : previous.primary, key);
            }
          } else edges.set(key, { primary, parent, collar });
        }
      }
    }
  });

  it('carries, for where its bark has gone, the direction of the limb under each point and how far back from its break that lies', () => {
    for (const { sk, wood } of ashes) {
      const dead = wood.getAttribute('aDead');
      expect(dead.count).toBe(wood.getAttribute('position').count);
      let tips = 0, breaks = 0;
      for (let i = 0; i < dead.count; i++) {
        expect(Math.hypot(dead.getX(i), dead.getY(i), dead.getZ(i))).toBeCloseTo(1, 3);
        expect(dead.getW(i)).toBeGreaterThanOrEqual(-1e-6);
        if (dead.getW(i) < 1e-4) tips++;
        if (dead.getW(i) < 0.99) breaks++;
      }
      // Each snapped limb's tallest splinter reaches the limb's end (0); the rest of its break lies short of its foot (1).
      expect(tips).toBeGreaterThanOrEqual(sk.limbs.filter((L) => L.broken !== undefined).length);
      expect(breaks).toBeGreaterThan(tips);
      // A limb that never snapped reads as far from any break, to its tip.
      const pos = wood.getAttribute('position'), whole = sk.limbs.filter((L) => L.broken === undefined);
      expect(whole.length).toBeGreaterThan(0);
      for (const L of whole) {
        const tip = L.path[L.path.length - 1];
        const at = Array.from({ length: pos.count }, (_, i) => i).filter((i) => Math.hypot(pos.getX(i) - tip.x, pos.getY(i) - tip.y, pos.getZ(i) - tip.z) < 1e-5);
        expect(at.length).toBeGreaterThan(0);
        for (const i of at) expect(dead.getW(i)).toBe(99);
      }
    }
    // A living tree's wood and a bush's carry none.
    expect(woodGeometry(growTree(OAK, 1)).getAttribute('aDead')).toBeUndefined();
    for (const { wood } of bushes) expect(wood.getAttribute('aDead')).toBeUndefined();
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
