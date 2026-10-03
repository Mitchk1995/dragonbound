/**
 * Dragon art rules from the owner's round 2 notes (October 3), measured on the exported GLBs: Cinderwing's paws are the
 * main mass of its feet, with claws growing out of the toes that are lower and narrower than the paw; its chest wears a
 * run of ivory scutes that wrap its front and narrow down between the forelegs; its tail tapers smoothly from the hips
 * to a fine tip; and the drakeling's skull is one solid piece, with no extra shape stuck on its cheek. From his round 3
 * notes: the drakeling has a short, deep head and a broad, deep body on thick legs, and both dragons stand in paws wider
 * than their legs. Animated as the game does, the dragons' tails stay off the ground and their claws rest on it.
 */
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { Rig, newAnimState, type AnimState } from '../src/render/anim';
import { makeModel, registerModelScene } from '../src/render/registry';

/** The models as exported, every part its own mesh (the game merges them per rig part on load). */
const raw = new Map<string, THREE.Group>();

beforeAll(async () => {
  const loader = new GLTFLoader();
  const parse = async (name: string) => {
    const buf = readFileSync(`public/models/${name}.glb`);
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    return (await new Promise<any>((res, rej) => loader.parse(ab, '', res, rej))).scene as THREE.Group;
  };
  for (const name of ['drakeling', 'cinderwing']) {
    registerModelScene(name, await parse(name));
    raw.set(name, await parse(name));
  }
});

// Authored colours (tools/blender/dragons.py).
const CW = { main: 0x5a2422, dark: 0x3a1715, ivory: 0xe4d8be };
const DRAKE = { main: 0xcf3826, cream: 0xe8c48e };

/** A rig part by name (exports may add Blender's `.001` suffixes). */
const part = (root: THREE.Object3D, name: string) => {
  let found: THREE.Object3D | undefined;
  root.traverse((o) => {
    if (!found && ((o.userData.name as string | undefined) ?? o.name).replace(/\.\d{3}$/, '') === name) found = o;
  });
  if (!found) throw Error(`no part ${name}`);
  return found;
};
const hexOf = (m: THREE.Mesh) => (m.material as THREE.MeshStandardMaterial).color.getHex(THREE.SRGBColorSpace);
const isColour = (m: THREE.Mesh, hex: number) =>
  [16, 8, 0].every((s) => Math.abs(((hexOf(m) >> s) & 255) - ((hex >> s) & 255)) <= 2);
/** The meshes that hang directly on a rig part. */
const pieces = (node: THREE.Object3D, hex: number) =>
  node.children.filter((c): c is THREE.Mesh => c instanceof THREE.Mesh && isColour(c, hex));
/**
 * A piece's bounds in its rig part's own frame, on the authored axes (Y up, +Z forward): the export turns every frame to
 * glTF's axes (its y is the authored Z, its z the authored -Y), which the game turns back on load.
 */
const localBox = (m: THREE.Mesh) => {
  m.updateMatrix();
  if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
  const b = m.geometry.boundingBox!.clone().applyMatrix4(m.matrix);
  return new THREE.Box3(new THREE.Vector3(b.min.x, -b.max.z, b.min.y), new THREE.Vector3(b.max.x, -b.min.z, b.max.y));
};
const size = (b: THREE.Box3) => b.getSize(new THREE.Vector3());
/** A piece's bounds in the frame of one of its ancestors (a rig part), on the authored axes, as `localBox`. */
const boxIn = (m: THREE.Mesh, frame: THREE.Object3D) => {
  m.updateWorldMatrix(true, false);
  frame.updateWorldMatrix(true, false);
  if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
  const b = m.geometry.boundingBox!.clone().applyMatrix4(frame.matrixWorld.clone().invert().multiply(m.matrixWorld));
  return new THREE.Box3(new THREE.Vector3(b.min.x, -b.max.z, b.min.y), new THREE.Vector3(b.max.x, -b.min.z, b.max.y));
};
/**
 * A leg's paw and the block standing in it: the paw is the widest of the lowest pieces in the leg's colour (the toes stand
 * on the ground too), the block the lowest of the leg's own blocks reaching well above the paw.
 */
const pawAndLeg = (node: THREE.Object3D, hex: number) => {
  const blocks = pieces(node, hex).map(localBox);
  const ground = Math.min(...blocks.map((b) => b.min.y));
  const paw = blocks.filter((b) => b.min.y < ground + 1e-3).sort((a, b) => size(b).x - size(a).x)[0];
  const leg = blocks.filter((b) => b.max.y > paw.max.y + 0.1).sort((a, b) => a.min.y - b.min.y);
  return { paw, leg };
};

describe('Cinderwing', () => {
  it('stands in paws: each claw grows out of a toe, lower and narrower than the paw it belongs to', () => {
    for (const leg of ['legFL', 'legFR', 'legBL', 'legBR']) {
      const node = part(raw.get('cinderwing')!, leg);
      const paw = pieces(node, CW.main).map(localBox).sort((a, b) => a.min.y - b.min.y)[0];
      const claws = pieces(node, CW.ivory).map(localBox);
      const toes = pieces(node, CW.dark).map(localBox).filter((b) => b.max.y < paw.max.y + 1e-4);
      expect(claws.length, `${leg} claws`).toBe(3);
      expect(toes.length, `${leg} toes`).toBe(3);
      const p = size(paw);
      for (const c of claws) {
        const s = size(c);
        expect(s.y, `${leg} claw height against the paw's`).toBeLessThan(p.y * 0.5);
        expect(s.x, `${leg} claw width against the paw's`).toBeLessThan(p.x * 0.35);
        expect(c.max.y, `${leg} claw below the top of the toes`).toBeLessThan(Math.max(...toes.map((t) => t.max.y)));
        expect(c.min.y - paw.min.y, `${leg} claw tip on the ground`).toBeLessThan(0.01);
      }
    }
  });

  it('wears ivory scutes wrapping the front of its chest, narrowing down between the forelegs', () => {
    const body = part(raw.get('cinderwing')!, 'body');
    const scutes = pieces(body, CW.ivory)
      .map(localBox)
      .filter((b) => b.getCenter(new THREE.Vector3()).z > 0.6)
      .sort((a, b) => b.getCenter(new THREE.Vector3()).y - a.getCenter(new THREE.Vector3()).y);
    expect(scutes.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < scutes.length; i++) expect(size(scutes[i]).x, `scute ${i + 1}`).toBeLessThan(size(scutes[i - 1]).x);
  });

  it('has a tail that tapers smoothly from the hips to a fine tip, one piece per segment', () => {
    const root = raw.get('cinderwing')!;
    const widths: number[] = [];
    for (let i = 1; i <= 6; i++) {
      const segment = pieces(part(root, `tail${i}`), CW.main);
      expect(segment.length, `tail${i} pieces`).toBe(1);
      widths.push(size(localBox(segment[0])).x);
    }
    for (let i = 1; i < widths.length; i++) {
      expect(widths[i], `tail${i + 1} no wider than tail${i}`).toBeLessThan(widths[i - 1]);
      expect(widths[i] / widths[i - 1], `tail${i + 1} steps down gently`).toBeGreaterThan(0.75);
    }
    expect(widths[5] / widths[0], 'tip against root').toBeLessThan(0.4);
    // The hips: the hindmost block across the middle of the body.
    const hips = pieces(part(root, 'body'), CW.main)
      .map(localBox)
      .filter((b) => Math.abs(b.getCenter(new THREE.Vector3()).x) < 0.05)
      .sort((a, b) => a.min.z - b.min.z)[0];
    expect(widths[0] / size(hips).x, 'root against the hips').toBeLessThan(0.7);
  });
});

describe('drakeling', () => {
  it('has a skull of one solid piece, nothing stuck on its cheeks or snout, its eyes sunk in sockets in its sides', () => {
    const head = part(raw.get('drakeling')!, 'head');
    const skull = pieces(head, DRAKE.main);
    expect(skull.length).toBe(1);
    // The skull's vertices on the authored axes, in the head's frame.
    skull[0].updateMatrix();
    const pos = skull[0].geometry.attributes.position, v = new THREE.Vector3();
    const verts = Array.from({ length: pos.count }, (_, i) => {
      v.fromBufferAttribute(pos, i).applyMatrix4(skull[0].matrix);
      return new THREE.Vector3(v.x, -v.z, v.y);
    });
    const glows = (c: THREE.Object3D): c is THREE.Mesh => {
      const m = c instanceof THREE.Mesh ? (c.material as THREE.MeshStandardMaterial) : null;
      return !!m && m.emissiveIntensity > 0 && m.emissive.getHex() !== 0;
    };
    const eyes = head.children.filter(glows);   // the irises are the head's only glowing parts
    expect(eyes.length).toBe(2);
    for (const e of eyes) {
      const b = localBox(e);
      // The side of the skull round the eye: its widest point no higher than the eye and near it fore and aft (the
      // cranium's side and the socket's rim, not the brow overhanging above).
      const mid = (b.min.z + b.max.z) / 2;
      const side = Math.max(...verts.filter((p) => p.y <= b.max.y && Math.abs(p.z - mid) < 0.15).map((p) => Math.abs(p.x)));
      expect(Math.max(Math.abs(b.min.x), Math.abs(b.max.x)), 'eye sunk inside the side of the skull').toBeLessThan(side);
    }
  });

  // The owner's round 3 notes (October 3): "too skinny", a "long head and skinny body", "head shape weak". Its sheet has a
  // short, deep, wedge-shaped head on a thick neck, a heavy barrel body and thick legs. Each bound sits between round 3,
  // which fails it, and round 4.
  it('has a short, deep head, as on its sheet: from the nose to the back of the skull under 1.6 times its depth', () => {
    const root = raw.get('drakeling')!;
    const head = part(root, 'head');
    const skull = boxIn(pieces(head, DRAKE.main)[0], head);
    const jaw = boxIn(pieces(part(root, 'jaw'), DRAKE.cream)[0], head);
    const length = Math.max(skull.max.z, jaw.max.z) - Math.min(skull.min.z, jaw.min.z);
    const depth = Math.max(skull.max.y, jaw.max.y) - Math.min(skull.min.y, jaw.min.y);
    expect(length / depth).toBeLessThan(1.6);
  });

  it('has a broad, deep barrel of a body on thick legs, as on its sheet', () => {
    const root = raw.get('drakeling')!;
    const torso = pieces(part(root, 'body'), DRAKE.main).map(localBox).reduce((a, b) => a.union(b));
    const t = size(torso);
    expect(t.x / t.z, 'body width against its length').toBeGreaterThan(0.55);
    expect(t.y / t.z, 'body depth against its length').toBeGreaterThan(0.6);
    const neck = size(pieces(part(root, 'neck1'), DRAKE.main).map(localBox)[0]);
    expect(neck.x / t.x, 'neck against the body, across').toBeGreaterThan(0.6);
    for (const leg of ['legFL', 'legFR', 'legBL', 'legBR']) {
      const thinnest = Math.min(...pawAndLeg(part(root, leg), DRAKE.main).leg.map((b) => size(b).x));
      expect(thinnest / t.y, `${leg}: its thinnest block against the body's depth`).toBeGreaterThan(0.22);
    }
  });
});

describe('dragons', () => {
  it('stand in paws wider than the leg that stands in each', () => {
    for (const [name, hex] of [['drakeling', DRAKE.main], ['cinderwing', CW.main]] as const) {
      for (const leg of ['legFL', 'legFR', 'legBL', 'legBR']) {
        const { paw, leg: blocks } = pawAndLeg(part(raw.get(name)!, leg), hex);
        expect(size(blocks[0]).x, `${name} ${leg}`).toBeLessThan(size(paw).x);
      }
    }
  });
});

describe('dragons, animated as the game does', () => {
  /** The model posed `secs` into an animation, its rig's clock started at `phase` (0..1) of its 10 s random start window. */
  const pose = (name: string, st: Partial<AnimState>, secs: number, phase = 0) => {
    const m = makeModel(name);
    const holder = new THREE.Group();
    holder.add(m.root);
    const random = vi.spyOn(Math, 'random').mockReturnValue(phase);
    const rig = new Rig(m.root);
    random.mockRestore();
    const s = { ...newAnimState(), ...st };
    rig.update(0, s);
    for (let t = 0; t < secs; t += 1 / 60) rig.update(1 / 60, s);
    holder.updateMatrixWorld(true);
    return m.root;
  };
  /** Lowest world height of a rig part's vertices (optionally only those whose baked colour passes `keep`). */
  const lowest = (node: THREE.Object3D, keep?: (r: number, g: number, b: number) => boolean) => {
    let low = Infinity;
    const v = new THREE.Vector3();
    node.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const pos = o.geometry.attributes.position, col = o.geometry.attributes.color;
      for (let i = 0; i < pos.count; i++) {
        if (keep && (!col || !keep(col.getX(i), col.getY(i), col.getZ(i)))) continue;
        low = Math.min(low, v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld).y);
      }
    });
    return low;
  };
  const claw = (r: number, g: number, b: number) => r > 0.6 && b > 0.35;   // ivory and horn, not cream, gilt or red
  const poses: [string, Partial<AnimState>, number][] = [
    ['idle', {}, 0.6], ['walk', { speed: 3 }, 0.35], ['walk, later', { speed: 3 }, 0.9],
    ['bite wind-up', { attackKind: 'bite', attack: 0.3 }, 0], ['bite', { attackKind: 'bite', attack: 0.6 }, 0],
    ['slam', { attackKind: 'slam', attack: 0.55 }, 0], ['breath', { special: 0.6 }, 0], ['hurt', { hurt: 1 }, 0.2],
    ['flight', { fly: 1, speed: 3 }, 0.5],
  ];
  for (const name of ['cinderwing', 'drakeling']) {
    it(`${name}: the tail stays off the ground in every pose, whatever the moment of its sway`, () => {
      for (const [label, st, secs] of poses) {
        for (let k = 0; k < 16; k++) {
          const root = pose(name, st, secs, k / 16);
          expect(lowest(part(root, 'tail1')), `${label}, sway phase ${k}/16`).toBeGreaterThan(0.02);
        }
      }
    });
    it(`${name}: at rest the claws rest on the ground, not in it`, () => {
      const root = pose(name, {}, 0.6);
      for (const leg of ['legFL', 'legFR', 'legBL', 'legBR']) {
        const node = part(root, leg);
        expect(lowest(node), `${leg} sole`).toBeGreaterThan(-0.005);
        const tips = lowest(node, claw);
        expect(tips, `${leg} claw tips`).toBeGreaterThan(-0.005);
        expect(tips, `${leg} claw tips`).toBeLessThan(0.04);
      }
    });
  }
});
