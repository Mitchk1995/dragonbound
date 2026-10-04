import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ZONES } from '../src/data/zones';
import { GROWN_KINDS, grownTrees, treeSet } from '../src/world/trees';
import { buildWorldView } from '../src/world/worldView';

/**
 * The grown trees (and the grown dead ash and bushes) as the woods plant them (the zones the game
 * builds with a fixed seed): wherever the ground round a tree is gentle (it falls at most 1 in 3
 * within 2 m of its trunk), the open rim of its foot is under the ground all round, so no root or
 * trunk shows its end on the downhill side.
 */
describe('grown trees stand seated in the ground', () => {
  const trunks = new Map<THREE.BufferGeometry, number[]>();
  const { ash, bush } = treeSet('natural').grown!;
  for (const woods of [...GROWN_KINDS.map((k) => grownTrees(k).trunk), ash.trunk, bush.trunk]) {
    for (const geo of woods) {
      // The foot's open rim: the vertices on edges only one face uses.
      const idx = geo.index!.array, use = new Map<string, number>();
      for (let t = 0; t < idx.length; t += 3) {
        for (let e = 0; e < 3; e++) {
          const a = idx[t + e], b = idx[t + ((e + 1) % 3)], key = a < b ? `${a},${b}` : `${b},${a}`;
          use.set(key, (use.get(key) ?? 0) + 1);
        }
      }
      trunks.set(geo, [...new Set([...use].filter(([, n]) => n === 1).flatMap(([key]) => key.split(',').map(Number)))]);
    }
  }

  it.each(['keep', 'foothills'])('in the %s', (id) => {
    const seed = 1000 + id.length * 97, layout = ZONES[id].build(seed), view = buildWorldView(layout, ZONES[id].theme, seed + 7);
    const m = new THREE.Matrix4(), at = new THREE.Vector3(), p = new THREE.Vector3();
    let seated = 0;
    view.group.traverse((o) => {
      if (!(o instanceof THREE.InstancedMesh) || !trunks.has(o.geometry)) return;
      const pos = o.geometry.getAttribute('position'), rim = trunks.get(o.geometry)!;
      for (let i = 0; i < o.count; i++) {
        o.getMatrixAt(i, m);
        at.setFromMatrixPosition(m);
        let fall = 0;
        for (let a = 0; a < 16; a++) for (const r of [1, 2]) fall = Math.max(fall, (at.y - view.heightAt(at.x + Math.cos((a / 8) * Math.PI) * r, at.z + Math.sin((a / 8) * Math.PI) * r)) / r);
        if (fall > 1 / 3) continue;
        seated++;
        for (const v of rim) {
          p.fromBufferAttribute(pos, v).applyMatrix4(m);
          expect(p.y, `tree at ${at.x.toFixed(1)}, ${at.z.toFixed(1)}`).toBeLessThan(view.heightAt(p.x, p.z));
        }
      }
    });
    expect(seated).toBeGreaterThan(100);
  }, 120000);
});
