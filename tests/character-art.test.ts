/**
 * Character and gear art rules from the owner's review, measured on the real exported GLBs: hair covers the whole
 * scalp (no bald patches at the temples), the tunic front is plain cloth (no floating V-neck wedge), kobolds are
 * short, drakelings have wings as wide as they are long, swords are long, every hairstyle is one sculpted piece, plate
 * stays a few bold blocks, the Emberforged set glows only in thin seams and its visor slit, swept and tied hair sit on
 * the head (no gap under their edge), and the Wyrmbone shoulders stay compact behind the hero.
 */
import { existsSync, readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { BASES, TIER_ORDER, UNIQUES } from '../src/data/items';
import { makeItem } from '../src/loot/itemGen';
import { HeroDresser, MODEL_FILES, makeModel, registerModelScene, roleOf } from '../src/render/registry';
import type { Item, Slot } from '../src/types';

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

describe('hair meets the head', () => {
  // The owner: swept-back and tied hair read as a helmet floating on the head, with a dark void at the temples and
  // sides. Along each side of the head, the lowest edge of the hair has to sit on the skin, not stand off it.
  for (const style of [2, 3]) {
    it(`style ${style} has no gap under its edge at the sides of the head`, () => {
      const root = makeModel(`hair_${style}`).root;
      root.updateMatrixWorld(true);
      const sock = root.getObjectByName('sock_head')!;
      const inv = sock.matrixWorld.clone().invert();
      const hair = meshes(root).filter((m) => role(m) === 'hair')[0];
      const pos = hair.geometry.getAttribute('position');
      const v = new THREE.Vector3();
      // Lowest hair point over each strip of the side faces of the head (front half to back, both sides).
      const lowest = new Map<string, THREE.Vector3>();
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(hair.matrixWorld).applyMatrix4(inv);
        if (Math.abs(v.x) < 0.16 || Math.abs(v.z) > 0.16) continue;
        const key = `${Math.sign(v.x)}:${Math.round(v.z / 0.04)}`;
        const cur = lowest.get(key);
        if (!cur || v.y < cur.y) lowest.set(key, v.clone());
      }
      expect(lowest.size).toBeGreaterThan(10);
      // Distance outside the chamfered head cube (0.23 half size, 0.06 chamfers).
      const outside = (p: THREE.Vector3) => {
        const a = [Math.abs(p.x), Math.abs(p.y), Math.abs(p.z)];
        let d = Math.max(a[0] - 0.23, a[1] - 0.23, a[2] - 0.23);
        for (const [i, j] of [[0, 1], [0, 2], [1, 2]]) d = Math.max(d, (a[i] + a[j] - 0.4) / Math.SQRT2);
        return d;
      };
      for (const [key, p] of lowest) expect(outside(p), `hair ${style} edge at ${key}: ${p.toArray().map((x) => x.toFixed(3))}`).toBeLessThan(0.02);
    });
  }
});

describe('hair is one piece', () => {
  // The owner: every style has to be one cohesive piece, not a base cap with wigs and locks stacked on top.
  for (const style of [1, 2, 3, 4]) {
    it(`style ${style} is a single hair mesh`, () => {
      const hair = meshes(makeModel(`hair_${style}`).root).filter((m) => role(m) === 'hair');
      expect(hair.length).toBe(1);
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

describe('the starting outfit and the gear on the redesigned hero', () => {
  // Every body armour, glove and boot the game has, worn the way the game dresses the hero.
  const pieces: [string, Slot, () => Item][] = [
    ...TIER_ORDER.flatMap((t) => (['chainbody', 'platebody', 'gauntlets', 'boots'] as const).map((p): [string, Slot, () => Item] =>
      [`${t}_${p}`, BASES[`${t}_${p}`].slot!, () => makeItem(`${t}_${p}`)])),
    ...(['leather_body', 'leather_gloves', 'leather_boots'] as const).map((id): [string, Slot, () => Item] => [id, BASES[id].slot!, () => makeItem(id)]),
    ...Object.values(UNIQUES).filter((u) => ['body', 'gloves', 'boots'].includes(BASES[u.base].slot!))
      .map((u): [string, Slot, () => Item] => [u.id, BASES[u.base].slot!, () => ({ ...makeItem(u.base), unique: u.id, rarity: 'unique' }) as Item]),
  ];
  const visible = (o: THREE.Object3D) => {
    for (let a: THREE.Object3D | null = o; a; a = a.parent) if (!a.visible) return false;
    return true;
  };
  const inGear = (o: THREE.Object3D) => {
    for (let a: THREE.Object3D | null = o; a; a = a.parent) if (a.name.startsWith('gear:')) return true;
    return false;
  };
  /** The rig part a mesh moves with. */
  const partOf = (o: THREE.Object3D) => {
    for (let a: THREE.Object3D | null = o.parent; a; a = a.parent) if (['body', 'head', 'armL', 'armR', 'legL', 'legR'].includes(a.name)) return a;
    return null;
  };
  /** World points of the hero's own visible parts that `keep` selects (rest pose). */
  const heroPoints = (root: THREE.Object3D, keep: (m: THREE.Mesh, part: THREE.Object3D, local: THREE.Vector3) => boolean) => {
    root.updateMatrixWorld(true);
    const out: THREE.Vector3[] = [];
    for (const m of meshes(root)) {
      const part = partOf(m);
      if (!part || inGear(m) || !visible(m)) continue;
      const inv = part.matrixWorld.clone().invert();
      const pos = m.geometry.getAttribute('position');
      for (let i = 0; i < pos.count; i++) {
        const w = new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
        if (keep(m, part, w.clone().applyMatrix4(inv))) out.push(w);
      }
    }
    return out;
  };
  const gearBox = (root: THREE.Object3D, socks: string[]) => {
    const box = new THREE.Box3();
    root.traverse((o) => {
      if (socks.some((s) => o.name === `gear:${s}`)) box.expandByObject(o);
    });
    return box.expandByScalar(0.005);
  };

  it('outfit pieces show in plain clothes and come off under the gear that covers them', () => {
    const plain = makeModel('hero');
    new HeroDresser(plain).dress(null, {});
    const outfit: THREE.Object3D[] = [];
    plain.root.traverse((o) => {
      if (o.name.startsWith('outfit_')) outfit.push(o);
    });
    expect(outfit.map((o) => o.name.split('_').slice(0, 2).join('_'))).toEqual(expect.arrayContaining(['outfit_body', 'outfit_boots', 'outfit_gloves']));
    for (const o of outfit) expect(o.visible, o.name).toBe(true);
    for (const [id, slot, item] of pieces) {
      const m = makeModel('hero');
      new HeroDresser(m).dress(null, { [slot]: item() });
      m.root.traverse((o) => {
        if (o.name.startsWith('outfit_')) expect(o.visible, `${id}: ${o.name}`).toBe(!o.name.startsWith(`outfit_${slot}_`));
      });
    }
  });

  for (const [id, slot, item] of pieces) {
    it(`${id} covers what it should`, () => {
      const m = makeModel('hero');
      new HeroDresser(m).dress(null, { [slot]: item() });
      const root = m.root;
      if (slot === 'gloves') {
        // The fists (below the bracer) stay inside the gauntlets.
        for (const [arm, sock] of [['armL', 'sock_handL'], ['armR', 'sock_gloveR']]) {
          const box = gearBox(root, [sock]);
          const hand = heroPoints(root, (_, part, l) => part.name === arm && l.y < -0.52);
          expect(hand.length, arm).toBeGreaterThan(20);
          for (const p of hand) expect(box.containsPoint(p), `${id} ${arm} hand at ${p.toArray().map((v) => v.toFixed(3))}`).toBe(true);
        }
      } else if (slot === 'boots') {
        // Everything of the leg below the boot's top is inside the boot.
        for (const [leg, sock] of [['legL', 'sock_footL'], ['legR', 'sock_footR']]) {
          const box = gearBox(root, [sock]);
          const low = heroPoints(root, (_, part, l) => part.name === leg && l.y < box.max.y - part.getWorldPosition(new THREE.Vector3()).y - 0.01);
          expect(low.length, leg).toBeGreaterThan(8);
          for (const p of low) expect(box.containsPoint(p), `${id} ${leg} at ${p.toArray().map((v) => v.toFixed(3))}`).toBe(true);
        }
      } else {
        // The tunic's torso and skirt sit inside the armour (the belt line and above, down to the hem).
        const box = gearBox(root, ['sock_chest']);
        const torso = heroPoints(root, (mesh, part, l) => part.name === 'body' && role(mesh) !== 'skin' && l.y > -0.12 && l.y < 0.74);
        expect(torso.length).toBeGreaterThan(50);
        for (const p of torso) {
          expect(box.min.x <= p.x && p.x <= box.max.x && p.z <= box.max.z && p.z >= box.min.z, `${id} tunic at ${p.toArray().map((v) => v.toFixed(3))}`).toBe(true);
        }
      }
    });
  }
});

describe('creatures', () => {
  it('the Cinder Priest has his own model, a head taller than his cultists', () => {
    expect(makeModel('priest').height).toBeGreaterThan(makeModel('cultist').height * 1.15);
  });
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
  it('Emberforged glows only in hairline seams between its plates and one line in the visor slit (no chest symbol)', () => {
    const glowing = (f: string) =>
      meshes(makeModel(f).root).filter((m) => {
        const mat = m.material as THREE.MeshStandardMaterial;
        return role(m) === 'glow' || (mat.emissive.getHex() !== 0 && mat.emissiveIntensity > 0);
      });
    // Every glowing part is made of thin horizontal strips: its heights fall into bands no thicker than a seam.
    const thinStrips = (m: THREE.Mesh) => {
      const pos = m.geometry.getAttribute('position');
      const ys = Array.from({ length: pos.count }, (_, i) => pos.getY(i)).sort((a, b) => a - b);
      let start = ys[0], worst = 0;
      for (let i = 1; i < ys.length; i++) {
        if (ys[i] - ys[i - 1] > 0.03) start = ys[i];
        worst = Math.max(worst, ys[i] - start);
      }
      return worst;
    };
    const body = glowing('gear_body_plate_e');
    expect(body.length).toBeGreaterThan(0);
    for (const m of body) expect(thinStrips(m)).toBeLessThan(0.03);
    const helm = glowing('gear_helm_full_e');
    expect(helm.length).toBe(1);
    expect(thinStrips(helm[0])).toBeLessThan(0.03);
    expect(glowing('gear_gloves_e').length + glowing('gear_boots_e').length).toBe(0);
  });
  it('plate is a few bold blocks, not a pile of ridges, rivets and trim bands', () => {
    // Part counts per plate piece (bronze/iron/steel share set p; Emberforged adds only horns, the slit and its
    // three ember seam parts: the cuirass joints and one under each pauldron).
    const parts = (f: string) => meshes(makeModel(f).root).length;
    expect(parts('gear_body_plate_p')).toBeLessThanOrEqual(18);
    expect(parts('gear_helm_full_p')).toBeLessThanOrEqual(5);
    expect(parts('gear_gloves_p')).toBeLessThanOrEqual(6);
    expect(parts('gear_boots_p')).toBeLessThanOrEqual(8);
    expect(parts('gear_body_plate_e')).toBeLessThanOrEqual(parts('gear_body_plate_p') + 3);
  });
  it('the Wyrmbone has nothing sweeping back off the shoulders', () => {
    const root = makeModel('gear_u_wyrmbone').root;
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
