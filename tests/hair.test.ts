/**
 * The hair and beards (tools/blender/hair.py), checked on the committed models: each is one moulded piece, LEGO hair's
 * way (a subdivided cage, its locks pressed in as creased grooves), that comes out of the head with its edge tucked
 * into the skin and nothing of it sinking into the head; beards hang in front of every collar; hair at the height of
 * the Ashen Crown's band runs in under it; and each stays within a character's triangle budget.
 */
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { beforeAll, describe, expect, it } from 'vitest';

const HAIR = ['hair_1', 'hair_2', 'hair_3', 'hair_4'];
const BEARDS = ['beard_1', 'beard_2', 'beard_3'];
/** Each piece's vertices and triangles in sock_head space (the head's centre; the head is a 0.46 cube, 0.06 chamfers). */
const pieces = new Map<string, { pos: THREE.Vector3[]; tris: number[][]; hairMeshes: number }>();

beforeAll(async () => {
  const loader = new GLTFLoader();
  for (const name of [...HAIR, ...BEARDS]) {
    const buf = readFileSync(`public/models/${name}.glb`);
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const scene = (await new Promise<{ scene: THREE.Group }>((res, rej) => loader.parse(ab, '', res as never, rej))).scene;
    scene.updateMatrixWorld(true);
    // The exported scene's world frame is the authored one (three.js axes), so sock_head space is the world less the
    // socket's position. (Blender numbers the socket per scene, sock_head.001 and on: the loader writes sock_head001.)
    let sock: THREE.Object3D | undefined;
    scene.traverse((o) => {
      if (/^sock_head\d*$/.test(o.name)) sock = o;
    });
    const centre = sock!.getWorldPosition(new THREE.Vector3());
    const pos: THREE.Vector3[] = [], tris: number[][] = [];
    const weld = new Map<string, number>();
    let hairMeshes = 0;
    scene.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      if ((o.material as THREE.Material).name === 'ROLE_hair') hairMeshes++;
      const g = o.geometry as THREE.BufferGeometry, p = g.attributes.position;
      // Vertices split along UV seams are one vertex of the moulding: weld them back by position.
      const id = Array.from({ length: p.count }, (_, i) => {
        const v = new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld).sub(centre);
        const key = v.toArray().map((x) => Math.round(x * 1e4)).join();
        if (!weld.has(key)) {
          weld.set(key, pos.length);
          pos.push(v);
        }
        return weld.get(key)!;
      });
      const idx = g.index ? Array.from(g.index.array) : id.map((_, i) => i);
      for (let t = 0; t < idx.length; t += 3) tris.push([id[idx[t]], id[idx[t + 1]], id[idx[t + 2]]]);
    });
    pieces.set(name, { pos, tris, hairMeshes });
  }
});

/** Signed distance from the head's chamfered cube (hero.py: 0.23 half size, 0.06 chamfers): negative inside it. */
function headDistance(p: THREE.Vector3) {
  const a = [Math.abs(p.x), Math.abs(p.y), Math.abs(p.z)];
  let d = Math.max(a[0] - 0.23, a[1] - 0.23, a[2] - 0.23);
  for (const [i, j] of [[0, 1], [0, 2], [1, 2]]) d = Math.max(d, (a[i] + a[j] - 0.4) / Math.SQRT2);
  return d;
}

/** The triangles round each edge (welded), by edge key. */
function edges(tris: number[][]) {
  const out = new Map<string, number[]>();
  tris.forEach((t, k) => {
    for (let e = 0; e < 3; e++) {
      const a = t[e], b = t[(e + 1) % 3], key = a < b ? `${a}_${b}` : `${b}_${a}`;
      out.set(key, [...(out.get(key) ?? []), k]);
    }
  });
  return out;
}

const normal = (pos: THREE.Vector3[], t: number[]) =>
  pos[t[1]].clone().sub(pos[t[0]]).cross(pos[t[2]].clone().sub(pos[t[0]])).normalize();

describe('hair and beards: one moulded piece each', () => {
  for (const name of [...HAIR, ...BEARDS]) {
    it(`${name} is one hair mesh whose surface is all one piece, within a character's triangle budget`, () => {
      const { pos, tris, hairMeshes } = pieces.get(name)!;
      // (A tie, a mouth or beads are faces of the same moulding in their own colour: the export splits them off.)
      expect(hairMeshes, name).toBe(1);
      // Every triangle is reached from the first across shared corners.
      const parent = pos.map((_, i) => i);
      const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
      for (const [a, b, c] of tris) parent[find(b)] = parent[find(c)] = find(a);
      expect(new Set(tris.map((t) => find(t[0]))).size, name).toBe(1);
      expect(tris.length, name).toBeLessThan(3000);
    });

    it(`${name} comes out of the head: its edge on the skin, nothing of it inside the head`, () => {
      const { pos, tris } = pieces.get(name)!;
      // The open edge: tucked a few millimetres under the skin, or the foot of a wall set on it (hair_cage.py).
      const rim = new Set<number>();
      for (const [key, faces] of edges(tris)) if (faces.length === 1) key.split('_').forEach((v) => rim.add(Number(v)));
      expect(rim.size, name).toBeGreaterThan(20);
      for (const v of rim) {
        const d = headDistance(pos[v]);
        expect(d, `${name} edge at ${pos[v].toArray().map((x) => x.toFixed(3))}`).toBeGreaterThan(-0.006);
        expect(d, `${name} edge at ${pos[v].toArray().map((x) => x.toFixed(3))}`).toBeLessThan(0.006);
      }
      for (const p of pos) expect(headDistance(p), `${name} at ${p.toArray().map((x) => x.toFixed(3))}`).toBeGreaterThan(-0.006);
    });
  }

  for (const name of [...HAIR, 'beard_2', 'beard_3']) {
    it(`${name} is carved into locks: grooves pressed into the moulding`, () => {
      const { pos, tris } = pieces.get(name)!;
      // A groove is a crease folding inward: across it, each face rises above the other's plane.
      let grooves = 0;
      for (const faces of edges(tris).values()) {
        if (faces.length !== 2) continue;
        const [t1, t2] = faces.map((k) => tris[k]);
        const n1 = normal(pos, t1), n2 = normal(pos, t2);
        const far = t2.find((v) => !t1.includes(v))!;
        const rise = n1.dot(pos[far].clone().sub(pos[t1[0]]));
        if (rise > 1e-4 && n1.dot(n2) < Math.cos(THREE.MathUtils.degToRad(20))) grooves++;
      }
      expect(grooves, name).toBeGreaterThan(name.startsWith('hair') ? 60 : 20);
    });
  }
});

describe('hair and beards with headgear and armour', () => {
  it('beards hang in front of every collar and gorget, and stop at the top of the chest', () => {
    // Collars and gorgets rise round the head to 0.145 below its centre, their faces at most 0.23 out (gear.py).
    for (const name of BEARDS) {
      for (const p of pieces.get(name)!.pos) {
        expect(p.y, `${name} at ${p.toArray().map((x) => x.toFixed(3))}`).toBeGreaterThan(-0.265);
        if (p.y < -0.15) expect(p.z, `${name} at ${p.toArray().map((x) => x.toFixed(3))}`).toBeGreaterThan(0.226);
      }
    }
  });

  it('hair at the height of the Ashen Crown\'s band runs in under it, never out through it', () => {
    // The band (uniques.py u_ashen_crown): y 0.09 to 0.21, its outer faces at x +-0.3275, z 0.3325 and -0.3425. Hair
    // pressed in under it (inside its walls) is hidden by it, and above it may spring out; in front of it, it shows.
    const out: string[] = [];
    for (const name of HAIR) {
      for (const p of pieces.get(name)!.pos) {
        if (p.y > 0.09 && p.y < 0.21 && (Math.abs(p.x) > 0.3275 || p.z > 0.3325 || p.z < -0.3425)) {
          out.push(`${name} at ${p.toArray().map((x) => x.toFixed(3))}`);
        }
      }
    }
    expect(out).toEqual([]);
  });
});
