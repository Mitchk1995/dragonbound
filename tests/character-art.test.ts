/**
 * Character and gear art rules from the owner's review, measured on the real exported GLBs: hair covers the whole
 * scalp (no bald patches at the temples), the tunic front is plain cloth (no floating V-neck wedge), kobolds are
 * short, dragon wings are mirrored on the shoulder blades and span most of a drakeling's length, swords are long, every hairstyle is one sculpted piece, plate
 * stays a few bold blocks, the Emberforged set glows only in thin seams and its visor slit, swept and tied hair sit on
 * the head (no gap under their edge), and the Wyrmbone shoulders stay compact behind the hero.
 */
import { existsSync, readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { BASES, TIER_ORDER, UNIQUES } from '../src/data/items';
import { GroundItem, HIPS_BELOW_CHEST } from '../src/entities/groundItem';
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
        // The hands (below the bracer) stay inside the gauntlets.
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

describe('body armour off the hero', () => {
  // A body armour's skirt is worn on the hips (sock_hips), below its cuirass (sock_chest); dropped on the ground it
  // comes whole, the skirt hanging from the cuirass where it is worn and the whole resting on the ground.
  const bodies = ['iron_chainbody', 'leather_body', 'steel_platebody', 'ember_platebody'];
  it('the hips sit where the ground model hangs them from the chest', () => {
    const root = makeModel('hero').root;
    root.updateMatrixWorld(true);
    const at = (n: string) => root.getObjectByName(n)!.getWorldPosition(new THREE.Vector3());
    expect(at('sock_chest').y - at('sock_hips').y).toBeCloseTo(HIPS_BELOW_CHEST, 4);
  });
  for (const id of [...bodies, 'scaleguard']) {
    it(`${id} lies on the ground with its skirt`, () => {
      const item = id === 'scaleguard' ? ({ ...makeItem('steel_chainbody'), unique: id, rarity: 'unique' } as Item) : makeItem(id);
      const drop = new GroundItem(item, 0, 0, 0, 0, 0);
      const chest = drop.group.getObjectByName('gear:sock_chest')!;
      expect(chest.getObjectByName('gear:sock_hips'), `${id}: skirt`).toBeTruthy();
      drop.group.position.set(0, 0, 0);
      drop.group.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(chest);
      expect(box.min.y, `${id}: resting on the ground`).toBeCloseTo(0, 3);
    });
  }
});

describe('LEGO hands and elbows', () => {
  // The owner: "no thumbs look bad on this type of hand, don't ever add them… it has to be all one shape like a lego
  // hand", and every arm bends at the elbow. Every humanoid hand is one C in one piece with a hole through it.
  const HUMANOIDS = ['hero', 'goblin', 'cultist', 'priest', 'warden', 'quartermaster'];
  for (const name of HUMANOIDS) {
    it(`${name}: both arms bend at an elbow and end in a one-piece hand with a hole through it`, () => {
      const root = makeModel(name).root;
      root.updateMatrixWorld(true);
      for (const side of ['L', 'R']) {
        expect(root.getObjectByName(`elbow${side}`), `${name} elbow${side}`).toBeTruthy();
        const hand = root.getObjectByName(`hand${side}`)!;
        // The hand's own meshes (not what it holds): one piece.
        const own = hand.children.filter((c): c is THREE.Mesh => c instanceof THREE.Mesh);
        expect(own.length, `${name} hand${side} pieces`).toBe(1);
        const piece = own[0];
        // In the hand's frame the C hangs below the wrist, as wide as it is tall; its hole runs along local Z.
        const box = new THREE.Box3();
        const v = new THREE.Vector3();
        const pos = piece.geometry.getAttribute('position');
        for (let i = 0; i < pos.count; i++) box.expandByPoint(v.fromBufferAttribute(pos, i).applyMatrix4(piece.matrix));
        const r = (box.max.x - box.min.x) / 2;
        const centre = new THREE.Vector3((box.max.x + box.min.x) / 2, box.min.y + r, 0);
        const hits = (x: number) => {
          const o = centre.clone().add(new THREE.Vector3(x, 0, box.min.z - 0.1)).applyMatrix4(hand.matrixWorld);
          const d = new THREE.Vector3(0, 0, 1).transformDirection(hand.matrixWorld);
          return new THREE.Raycaster(o, d, 0, box.max.z - box.min.z + 0.2).intersectObject(piece, false).length;
        };
        expect(hits(0), `${name} hand${side}: open through its hole`).toBe(0);
        expect(hits(r * 0.8), `${name} hand${side}: solid round it`).toBeGreaterThan(0);
        expect(hits(-r * 0.8), `${name} hand${side}: solid round it`).toBeGreaterThan(0);
      }
    });
  }
  it('gloves and gauntlets are the same C round the same hole, their cuffs on the forearm', () => {
    for (const file of ['gear_gloves', 'gear_gloves_p', 'gear_gloves_e']) {
      const root = makeModel(file).root;
      root.updateMatrixWorld(true);
      for (const [handName, cuffName] of [['sock_handL', 'sock_cuffL'], ['sock_gloveR', 'sock_cuffR']]) {
        const hand = root.getObjectByName(handName), cuff = root.getObjectByName(cuffName);
        expect(hand && cuff, `${file} ${handName} and ${cuffName}`).toBeTruthy();
        // Straight through the centre of the glove's hand there is nothing (the hole); either side of it, the ring.
        const hits = (x: number) => {
          const o = new THREE.Vector3(x, 0, -0.5).applyMatrix4(hand!.matrixWorld);
          const d = new THREE.Vector3(0, 0, 1).transformDirection(hand!.matrixWorld);
          return new THREE.Raycaster(o, d, 0, 1).intersectObject(hand!, true).length;
        };
        expect(hits(0), `${file} ${handName}: open through the hole`).toBe(0);
        expect(hits(0.11), `${file} ${handName}: solid round it`).toBeGreaterThan(0);
        expect(hits(-0.11), `${file} ${handName}: solid round it`).toBeGreaterThan(0);
        // The cuff stands above the hand, round the forearm.
        const box = new THREE.Box3().setFromObject(cuff!);
        expect(box.isEmpty(), `${file} ${cuffName} has a cuff`).toBe(false);
        expect(box.min.y - hand!.getWorldPosition(new THREE.Vector3()).y, `${file} ${cuffName} above the hand`).toBeGreaterThan(0.08);
      }
    }
  });
});

describe('the minifigure body', () => {
  // The owner (October 4): every humanoid matches the hero the way LEGO does it, on one minifigure body (minifig.py),
  // so every gear piece made for the hero fits any humanoid built on it. Their gear sockets, arm joints and hands sit
  // exactly where the hero's do, whatever their legs, head and robes.
  const FIGURES = ['goblin', 'cultist'];
  const SHARED = ['sock_head', 'sock_chest', 'sock_shoulderL', 'sock_shoulderR', 'sock_upperL', 'sock_upperR', 'sock_cuffL',
    'sock_cuffR', 'sock_handL', 'sock_gloveR', 'sock_handR', 'armL', 'armR', 'elbowL', 'elbowR', 'handL', 'handR', 'head'];
  /** A part's place and turn at rest, measured from the torso's centre. */
  const pose = (root: THREE.Object3D, part: string) => {
    root.updateMatrixWorld(true);
    const o = root.getObjectByName(part), chest = root.getObjectByName('sock_chest');
    expect(o && chest, part).toBeTruthy();
    return { at: o!.getWorldPosition(new THREE.Vector3()).sub(chest!.getWorldPosition(new THREE.Vector3())), turn: o!.getWorldQuaternion(new THREE.Quaternion()) };
  };
  for (const name of FIGURES) {
    it(`${name}: the hero's gear sockets and arm joints, where the hero's are`, () => {
      const hero = makeModel('hero').root, fig = makeModel(name).root;
      for (const part of SHARED) {
        const a = pose(fig, part), b = pose(hero, part);
        expect(a.at.distanceTo(b.at), `${name} ${part} place`).toBeLessThan(1e-3);
        expect(a.turn.angleTo(b.turn), `${name} ${part} turn`).toBeLessThan(1e-3);
      }
    });
    it(`${name}: the hero's hands, so gloves and gauntlets fit`, () => {
      const size = (root: THREE.Object3D, side: string) => {
        const hand = root.getObjectByName(`hand${side}`)!;
        const piece = hand.children.find((c): c is THREE.Mesh => c instanceof THREE.Mesh)!;
        return new THREE.Box3().setFromBufferAttribute(piece.geometry.getAttribute('position') as THREE.BufferAttribute).applyMatrix4(piece.matrix).getSize(new THREE.Vector3());
      };
      const hero = makeModel('hero').root, fig = makeModel(name).root;
      for (const side of ['L', 'R']) expect(size(fig, side).distanceTo(size(hero, side)), `${name} hand${side}`).toBeLessThan(1e-3);
    });
  }
  // The body's own attachment points, from the torso's centre (minifig.py BODY_SOCKETS): the hero has none of them but
  // the hips. A figure with legs (the goblin's short ones) hangs its hips on sock_hips, level with them; a robe hangs on
  // sock_skirt.
  const POINTS: Record<string, [number, number, number]> = { sock_neck: [0, 0.31, 0], sock_back: [0, -0.02, -0.21], sock_belt: [0, -0.37, 0] };
  const HIPS: Record<string, string> = { goblin: 'sock_hips', cultist: 'sock_skirt' };
  for (const name of FIGURES) {
    it(`${name}: the body's attachment points for necks, backs, belts and hips, where the body puts them`, () => {
      const fig = makeModel(name).root;
      const points: Record<string, [number, number, number]> = { ...POINTS, [HIPS[name]]: [0, -0.44, 0] };
      for (const [part, at] of Object.entries(points)) expect(pose(fig, part).at.distanceTo(new THREE.Vector3(...at)), `${name} ${part}`).toBeLessThan(1e-3);
    });
    it(`${name}: stands on the ground, its feet or robe's hem at ground level`, () => {
      const root = makeModel(name).root;
      root.updateMatrixWorld(true);
      expect(Math.abs(new THREE.Box3().setFromObject(root).min.y), `${name} lowest point`).toBeLessThan(0.01);
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
  it('drakeling wings, raised as on its approved sheet, still span most of its length, nose to tail tip', () => {
    const s = extent(makeModel('drakeling').root);
    expect(s.x).toBeGreaterThan(s.z * 0.8);
  });
  it('dragon wings are mirrored and rooted on the shoulder blades: high on the back, over the forelegs', () => {
    for (const name of ['drakeling', 'cinderwing']) {
      const root = makeModel(name).root;
      root.updateMatrixWorld(true);
      const at = (part: string) => root.getObjectByName(part)!.getWorldPosition(new THREE.Vector3());
      const [l, r, body, fore, hind] = [at('wingL'), at('wingR'), at('body'), at('legFL'), at('legBL')];
      expect(l.x, `${name} wingL on the left`).toBeGreaterThan(0);
      expect(l.x + r.x, `${name} wings mirrored`).toBeCloseTo(0, 4);
      expect(l.y - r.y, `${name} wings level`).toBeCloseTo(0, 4);
      expect(l.y, `${name} wings on the back`).toBeGreaterThan(body.y);
      expect(l.z, `${name} wings over the forelegs`).toBeGreaterThan((fore.z + hind.z) / 2);
    }
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
