/**
 * Character and gear art rules from the owner's review, measured on the real exported GLBs: hair covers the whole
 * scalp (no bald patches at the temples), the tunic front is plain cloth (no floating V-neck wedge), kobolds are
 * short, drakelings have wings as wide as they are long, swords are long, the Emberforged set keeps its glow to two
 * spots, and the Scaleguard has no horns.
 */
import { existsSync, readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { HeroDresser, MODEL_FILES, makeModel, registerModelScene, roleOf } from '../src/render/registry';

beforeAll(async () => {
  const loader = new GLTFLoader();
  for (const name of MODEL_FILES) {
    const file = `public/models/${name}.glb`;
    if (!existsSync(file)) continue;
    const buf = readFileSync(file);
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const gltf = await new Promise<any>((res, rej) => loader.parse(ab, '', res, rej));
    registerModelScene(name, gltf.scene);
  }
});

const meshes = (root: THREE.Object3D) => {
  const out: THREE.Mesh[] = [];
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) out.push(o);
  });
  return out;
};
const role = (m: THREE.Mesh) => roleOf(m.material as THREE.Material);
const extent = (root: THREE.Object3D) => {
  root.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
};

describe('hair', () => {
  // Points on the head cube (sock_head space; the head is a 0.46 cube) above the hairline: crown corners, temples,
  // over the ears and the back of the crown. Seen from straight outside, each has to be behind hair, not skin.
  const scalp: [number, number, number][] = [
    [0, 0.23, 0], [0.19, 0.2, 0.19], [-0.19, 0.2, 0.19], [0.19, 0.2, -0.19], [-0.19, 0.2, -0.19],
    [0.23, 0.14, 0.12], [-0.23, 0.14, 0.12], [0.23, 0.12, -0.02], [-0.23, 0.12, -0.02], [0, 0.18, -0.23],
    [0.23, 0.17, 0.2], [-0.23, 0.17, 0.2],
  ];
  for (const style of [1, 2, 3, 4]) {
    it(`style ${style} covers the whole scalp`, () => {
      const m = makeModel('hero');
      new HeroDresser(m).dress({ name: '', skin: 1, hair: style, hairColor: 1, beard: 0, cloth: 0, cloth2: 5 }, {});
      m.root.updateMatrixWorld(true);
      const head = m.root.getObjectByName('sock_head')!;
      const targets = meshes(m.root);
      const ray = new THREE.Raycaster();
      for (const p of scalp) {
        const local = new THREE.Vector3(...p);
        const at = head.localToWorld(local.clone());
        const out = head.localToWorld(local.clone().multiplyScalar(4)).sub(at).normalize();
        ray.set(at.clone().addScaledVector(out, 1.5), out.clone().negate());
        const hit = ray.intersectObjects(targets, false)[0];
        expect(hit && role(hit.object as THREE.Mesh), `hair ${style} at ${p}`).toBe('hair');
      }
    });
  }
});

describe('hero base', () => {
  it('has a plain tunic front: no skin below the collar on the body (the V-neck wedge is gone)', () => {
    const m = makeModel('hero');
    const body = m.root.getObjectByName('body')!;
    body.updateMatrixWorld(true);
    const inv = body.matrixWorld.clone().invert();
    const v = new THREE.Vector3();
    let lowest = Infinity;
    for (const mesh of meshes(body)) {
      if (role(mesh) !== 'skin') continue;
      let a: THREE.Object3D | null = mesh.parent;
      while (a && a !== body && !['head', 'armL', 'armR'].includes(a.name)) a = a.parent;
      if (a !== body) continue;
      const pos = mesh.geometry.getAttribute('position');
      for (let i = 0; i < pos.count; i++) lowest = Math.min(lowest, v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld).applyMatrix4(inv).y);
    }
    expect(lowest, 'only the neck is skin on the torso').toBeGreaterThan(0.72);
  });
});

describe('creatures', () => {
  it('kobolds are short: well under two thirds of the hero', () => {
    expect(makeModel('kobold').height).toBeLessThan(makeModel('hero').height * 0.65);
  });
  it('drakeling wings span about the length of its body, nose to tail tip', () => {
    const s = extent(makeModel('drakeling').root);
    expect(s.x).toBeGreaterThan(s.z * 0.9);
  });
});

describe('gear', () => {
  it('swords are long enough to read as swords', () => {
    expect(extent(makeModel('gear_sword').root).y).toBeGreaterThan(1.35);
    expect(extent(makeModel('gear_longsword').root).y).toBeGreaterThan(1.75);
  });
  it('Emberforged keeps its glow to two spots: the heart and the visor', () => {
    const glow = (f: string) => meshes(makeModel(f).root).filter((m) => role(m) === 'glow').length;
    expect(glow('gear_body_plate_e')).toBe(1);
    expect(glow('gear_helm_full_e')).toBe(1);
    expect(glow('gear_gloves_e') + glow('gear_boots_e')).toBe(0);
  });
  it('the Scaleguard has nothing sweeping back off the shoulders (no horns)', () => {
    const root = makeModel('gear_u_scaleguard').root;
    root.updateMatrixWorld(true);
    const v = new THREE.Vector3();
    for (const name of ['sock_shoulderL', 'sock_shoulderR']) {
      const sock = root.getObjectByName(name)!;
      const inv = sock.matrixWorld.clone().invert();
      let back = 0;
      for (const m of meshes(sock)) {
        const pos = m.geometry.getAttribute('position');
        for (let i = 0; i < pos.count; i++) back = Math.min(back, v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld).applyMatrix4(inv).z);
      }
      expect(back, name).toBeGreaterThan(-0.22);
    }
  });
});
