/**
 * Pose audit: loads the real exported models (public/models/*.glb), dresses and animates them
 * exactly like the game, and checks measurable facts about every pose. The hero faces +Z
 * (forward), +Y is up, the hero's right hand is at -X. If a pose looks wrong in game, add the
 * expectation here first, watch it fail, then fix the animation.
 */
import { readFileSync, existsSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { BOW_TURN, Rig, newAnimState, type AnimState, type AttackKind } from '../src/render/anim';
import { BowDraw } from '../src/render/bowDraw';
import { HeroDresser, MODEL_FILES, hasModel, makeModel, registerModelScene } from '../src/render/registry';
import { bowFacts, partCenter, partForward, shoulderCap, weaponFacts } from '../src/render/poseMetrics';
import { makeItem } from '../src/loot/itemGen';
import { BASES as BASES_FOR_TEST } from '../src/data/items';
import type { Slot } from '../src/types';
import { COMBAT_TUNING } from '../src/data/tuning';

/** The frame every attack lands on; swing keyframes are timed around it (anim.ts). */
const IMPACT = COMBAT_TUNING.impact;

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

/**
 * A hero built on first use. describe() bodies run at collection time, before beforeAll loads
 * the GLBs, so building there would silently audit the placeholder models instead.
 */
function lazyHero(equip: Partial<Record<Slot, string>>): ReturnType<typeof hero> {
  let h: ReturnType<typeof hero> | undefined;
  return new Proxy({} as ReturnType<typeof hero>, { get: (_, k) => (h ??= hero(equip))[k as keyof ReturnType<typeof hero>] });
}

function hero(equip: Partial<Record<Slot, string>>) {
  if (!hasModel('hero')) throw new Error('hero() before the GLBs loaded: this would audit placeholder models');
  const model = makeModel('hero');
  const holder = new THREE.Group();
  holder.add(model.root);
  const dresser = new HeroDresser(model);
  const items = Object.fromEntries(Object.entries(equip).map(([s, id]) => [s, makeItem(id!)]));
  dresser.dress(null, items);
  const bow = new BowDraw(model.root);
  bow.attach();
  const rig = new Rig(model.root);
  const pose = (kind: AttackKind, t: number, extra: Partial<AnimState> = {}, dt = 0) => {
    const st = { ...newAnimState(), attackKind: kind, attack: t, ...extra };
    rig.update(dt, st);
    bow.update(st, dresser.socket('sock_handL'));
    holder.updateMatrixWorld(true);
    return st;
  };
  return { model, root: model.root, dresser, pose };
}

const deg = (v: number) => (Math.asin(Math.max(-1, Math.min(1, v))) * 180) / Math.PI;

describe('pose audit: models loaded', () => {
  it('uses the exported hero, gear and dragons (not placeholders)', () => {
    for (const n of ['hero', 'gear_sword', 'gear_longsword', 'gear_bow_worn', 'gear_staff_apprentice', 'gear_body_plate', 'cinderwing', 'drakeling', 'whelp']) expect(hasModel(n), n).toBe(true);
  });
  it('merges anonymous rigid parts per rig node and material (draw calls)', () => {
    const count = (name: string) => {
      let n = 0;
      makeModel(name).root.traverse((o) => {
        if (o instanceof THREE.Mesh) n++;
      });
      return n;
    };
    // Merged, every rig part drops to a few meshes (Cinderwing measured 29), with rig parts intact.
    // Cinderwing's glowing cracks (on the body, neck and every leg), eyes and molten mouth each keep their own material,
    // hence its extra meshes. A goblin is one mesh per rig part: body, the hips (the seat and loincloth, kept level),
    // head, legs, and each arm's upper arm, forearm (below the elbow) and hand (below the wrist), and the club.
    expect(count('drakeling')).toBeLessThanOrEqual(20);
    expect(count('cinderwing')).toBeLessThanOrEqual(31);
    expect(count('goblin')).toBeLessThanOrEqual(12);
    for (const part of ['head', 'jaw', 'wingL', 'wingR', 'tail1', 'legFL']) expect(makeModel('drakeling').root.getObjectByName(part), part).toBeTruthy();
  });
});

describe('pose audit: one-handed melee weapons', () => {
  for (const weapon of ['bronze_sword', 'iron_longsword']) {
    describe(weapon, () => {
      const h = lazyHero({ weapon });
      it('idle: blade held forward at a relaxed downward angle, edge vertical', () => {
        h.pose('swing', -1);
        const w = weaponFacts(h.root)!;
        expect(w.dir.z, 'blade points forward').toBeGreaterThan(0.5);
        expect(deg(w.dir.y), 'blade pitch (deg)').toBeGreaterThan(-60);
        expect(deg(w.dir.y), 'blade pitch (deg)').toBeLessThan(10);
        expect(Math.abs(w.width.x), 'edge vertical, flat facing sideways').toBeLessThan(0.45);
      });
      it('walking: blade stays forward (never swings behind or into the ground)', () => {
        for (let k = 0; k < 24; k++) {
          h.pose('swing', -1, { speed: 5.6 }, 0.05);
          const w = weaponFacts(h.root)!;
          expect(w.dir.z, `walk frame ${k}`).toBeGreaterThan(0.2);
          expect(w.tip.y, `walk frame ${k} tip above ground`).toBeGreaterThan(0.15);
        }
      });
      it('windup: raised above and behind the head', () => {
        h.pose('swing', IMPACT - 0.11);
        const w = weaponFacts(h.root)!;
        expect(w.dir.y, 'blade points up').toBeGreaterThan(0.3);
        expect(w.tip.y, 'tip above head height').toBeGreaterThan(2.3);
        expect(w.dir.z, 'blade leans back').toBeLessThan(0.2);
      });
      it('impact: blade sweeps forward with the edge leading', () => {
        h.pose('swing', IMPACT);
        const w = weaponFacts(h.root)!;
        expect(w.dir.z, 'blade forward').toBeGreaterThan(0.5);
        expect(Math.abs(w.width.x), 'edge leads in the swing plane').toBeLessThan(0.45);
      });
      it('follow-through: blade forward and down', () => {
        h.pose('swing', IMPACT + 0.12);
        const w = weaponFacts(h.root)!;
        expect(w.dir.y).toBeLessThan(0.1);
        expect(w.dir.z).toBeGreaterThan(0.4);
      });
    });
  }
});

describe('pose audit: arms bend at the elbow', () => {
  // The owner: hands are one-piece LEGO hands (whatever is held runs through the hole) and arms bend at the elbow.
  const world = (root: THREE.Object3D, name: string) => root.getObjectByName(name)!.getWorldPosition(new THREE.Vector3());
  it('raised sword: the blade comes up out of the hand in line with the forearm', () => {
    const h = hero({ weapon: 'bronze_sword' });
    h.pose('swing', IMPACT - 0.11);
    const fore = world(h.root, 'handR').sub(world(h.root, 'elbowR')).normalize();
    const blade = weaponFacts(h.root)!.dir;
    expect((Math.acos(fore.dot(blade)) * 180) / Math.PI, 'blade off the forearm (deg)').toBeLessThan(25);
    expect(-h.root.getObjectByName('elbowR')!.rotation.x, 'the elbow bends in the wind-up').toBeGreaterThan(0.5);
  });
  it('bow at full draw: the draw arm bends at the elbow, the hand at the jaw in front of the chest', () => {
    const h = hero({ weapon: 'hunter_bow' });
    h.pose('bow', IMPACT - 0.03);
    const body = h.root.getObjectByName('body')!;
    const hand = body.worldToLocal(world(h.root, 'sock_handL'));
    const elbow = body.worldToLocal(world(h.root, 'elbowL'));
    expect(-h.root.getObjectByName('elbowL')!.rotation.x, 'elbow bend (rad)').toBeGreaterThan(1.2);
    expect(hand.y, 'hand at jaw height').toBeGreaterThan(0.7);
    expect(hand.y, 'hand at jaw height').toBeLessThan(0.95);
    // The tunic's front is at z 0.21, plate's at 0.29: the hand (and the string through it) stays in front of both.
    expect(hand.z, 'hand in front of the chest').toBeGreaterThan(0.38);
    // The elbow swings out and forward, clear of the chest's top corner.
    expect(elbow.x > 0.5 || elbow.z > 0.32, `elbow clear of the chest at ${elbow.toArray().map((v) => v.toFixed(2))}`).toBe(true);
  });
  it('a staff stands upright through the hand, the forearm forward', () => {
    const h = hero({ weapon: 'apprentice_staff' });
    h.pose('cast', -1);
    const fore = world(h.root, 'handR').sub(world(h.root, 'elbowR')).normalize();
    expect(fore.z, 'forearm points forward').toBeGreaterThan(0.85);
    expect(weaponFacts(h.root)!.dir.y, 'staff upright').toBeGreaterThan(0.9);
  });
});

describe('pose audit: the hips', () => {
  // The owner never wants a leg showing through a skirt. Like a LEGO minifigure's, the legs hinge under the hips, at the
  // tunic's hem, the top of each thigh rounded about the hinge; everything hanging from the hips (sock_hips: the tunic's
  // skirt, every armour's skirt, flaps and tabard) stays level with the legs however the body leans, and the whole hero
  // turns into a sword swing. tools/blender/skirtcheck.py checks every outfit against the legs in every pose.
  it('the legs hinge at the hem, the tops of the thighs rounded about the hinge', () => {
    const root = makeModel('hero').root;
    root.updateMatrixWorld(true);
    const v = new THREE.Vector3();
    for (const name of ['legL', 'legR']) {
      const leg = root.getObjectByName(name)!;
      expect(leg.getWorldPosition(v).y, `${name} hinge height`).toBeCloseTo(0.725, 3);
      let above = 0;
      leg.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        const pos = o.geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          leg.worldToLocal(v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld));
          if (v.y <= 1e-4) continue;
          above++;
          expect(Math.hypot(v.y, v.z), `${name} top at ${v.toArray().map((c) => c.toFixed(3))}`).toBeLessThan(0.175);
        }
      });
      expect(above, `${name}: a rounded top above the hinge`).toBeGreaterThan(4);
    }
  });
  it('what hangs from the hips stays level with the legs: running, running just hit, and in every attack', () => {
    const h = hero({ weapon: 'bronze_sword', body: 'iron_chainbody' });
    const hips = h.root.getObjectByName('sock_hips')!;
    const q = new THREE.Quaternion(), r = new THREE.Quaternion();
    const frames: [AttackKind, number, Partial<AnimState>][] = [
      ['swing', -1, { speed: 5.6 }], ['swing', -1, { speed: 5.6, hurt: 1 }], ['swing', 0.3, { speed: 3.4 }],
      ['swing', IMPACT - 0.05, { speed: 3.4 }], ['slam', 0.3, {}], ['slam', 0.8, {}], ['cast', IMPACT, {}], ['bow', 0.4, {}],
    ];
    for (const [kind, a, extra] of frames) {
      for (let k = 0; k < 6; k++) {
        h.pose(kind, a, extra, 0.05);
        const off = hips.getWorldQuaternion(q).angleTo(h.root.getWorldQuaternion(r));
        expect(off, `${kind}@${a} ${JSON.stringify(extra)}, frame ${k}`).toBeLessThan(1e-4);
      }
    }
  });
  it('a sword swing turns the whole hero, never the body against its legs', () => {
    const h = hero({ weapon: 'bronze_sword' });
    h.pose('swing', IMPACT - 0.15);
    expect(h.root.rotation.y, 'the wind-up turns the hero').toBeGreaterThan(0.2);
    expect(h.root.getObjectByName('body')!.rotation.y, 'the body does not twist on the hips').toBe(0);
  });
});

describe('pose audit: mining (pickaxe tool override, as Player.dress uses it)', () => {
  it('the pick head never goes below the ground through the whole swing', () => {
    const model = makeModel('hero');
    const holder = new THREE.Group();
    holder.add(model.root);
    const dresser = new HeroDresser(model);
    const pick = BASES_FOR_TEST.steel_pickaxe;
    dresser.dress(null, {}, { weaponModel: pick.model!, weaponPalette: pick.palette });
    const rig = new Rig(model.root);
    const v = new THREE.Vector3();
    let lowest = Infinity, at = -1;
    for (let k = 0; k <= 40; k++) {
      const t = k / 40;
      rig.update(0, { ...newAnimState(), attackKind: 'swing', attack: t });
      holder.updateMatrixWorld(true);
      model.root.getObjectByName('gear:sock_handR')!.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        const pos = o.geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          const y = v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld).y;
          if (y < lowest) {
            lowest = y;
            at = t;
          }
        }
      });
    }
    expect(lowest, `lowest point (at t=${at})`).toBeGreaterThan(0.02);
  });
});

describe('pose audit: staff', () => {
  const h = lazyHero({ weapon: 'apprentice_staff' });
  it('idle: staff upright, head up', () => {
    h.pose('cast', -1);
    const w = weaponFacts(h.root)!;
    expect(w.dir.y).toBeGreaterThan(0.85);
  });
  it('idle: shaft held in front of the hand and leaning forward, not running down the forearm', () => {
    h.pose('cast', -1);
    const w = weaponFacts(h.root)!;
    const hand = h.dresser.socket('sock_handR')!.getWorldPosition(new THREE.Vector3());
    expect(w.tip.z - hand.z).toBeGreaterThan(0.15);
  });
  it('cast: staff raised, head leaning toward the target', () => {
    h.pose('cast', IMPACT);
    const w = weaponFacts(h.root)!;
    expect(w.dir.y).toBeGreaterThan(0.6);
    expect(w.dir.z).toBeGreaterThan(0.15);
  });
});

describe('pose audit: cult staffs', () => {
  // The owner: the cultist's staff hold looked wrong, and in the cast the staff swung down behind the head. The staff
  // hangs on sock_handR in the hand, so it stands upright at rest and stays upright, leaning at the target, in the cast.
  for (const name of ['cultist', 'priest']) {
    it(`${name}: staff upright at rest and in the cast`, () => {
      const m = makeModel(name);
      const holder = new THREE.Group();
      holder.add(m.root);
      const rig = new Rig(m.root);
      const dir = () => {
        holder.updateMatrixWorld(true);
        return new THREE.Vector3(0, 1, 0).transformDirection(m.root.getObjectByName('sock_handR')!.matrixWorld);
      };
      rig.update(0, { ...newAnimState() });
      expect(dir().y, 'at rest').toBeGreaterThan(0.95);
      rig.update(0, { ...newAnimState(), attackKind: 'cast', attack: IMPACT });
      const d = dir();
      expect(d.y, 'cast: upright').toBeGreaterThan(0.8);
      expect(d.z, 'cast: leaning toward the target').toBeGreaterThan(0.1);
    });
  }
});

describe('pose audit: bow', () => {
  /** Whether a world point lies inside a closed mesh: a ray from it crosses the surface an odd number of times. */
  const inside = (mesh: THREE.Mesh, point: THREE.Vector3) => {
    const ray = new THREE.Ray(point.clone().applyMatrix4(mesh.matrixWorld.clone().invert()), new THREE.Vector3(1, 0.0013, 0.0007).normalize());
    const pos = mesh.geometry.attributes.position, index = mesh.geometry.index;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), hit = new THREE.Vector3();
    let crossings = 0;
    for (let i = 0; i < (index ? index.count : pos.count); i += 3) {
      const [i0, i1, i2] = index ? [index.getX(i), index.getX(i + 1), index.getX(i + 2)] : [i, i + 1, i + 2];
      if (ray.intersectTriangle(a.fromBufferAttribute(pos, i0), b.fromBufferAttribute(pos, i1), c.fromBufferAttribute(pos, i2), false, hit)) crossings++;
    }
    return crossings % 2 === 1;
  };
  // The owner: a held bow's string faces the archer and its limbs curve away from him, in every state ("holding bow
  // completely backwards"). Carried, the bow is held at the side angled down and forward the way games show archers
  // walking, its back forward and its string toward him, and never cuts into the striding leg (tests/bow-audit.test.ts
  // measures every rule in every frame).
  for (const weapon of ['worn_bow', 'hunter_bow', 'recurve_bow', 'drakebone_bow']) {
    it(`${weapon}: carried angled down and forward, back forward, string toward the archer, clear of the right leg`, () => {
      const h = hero({ weapon });
      const legMeshes: THREE.Mesh[] = [];
      h.root.getObjectByName('legR')!.traverse((o) => {
        if (o instanceof THREE.Mesh) legMeshes.push(o);
      });
      const bow = h.root.getObjectByName('gear:sock_handR')!;
      const hand = h.dresser.socket('sock_handL')!;
      const v = new THREE.Vector3();
      for (let k = 0; k < 30; k++) {
        h.pose('bow', -1, { speed: 5.6 }, 0.05);
        // The bow runs along the hand socket's +Y (gear.py bow_frame): its top tipped down and forward from upright.
        const axis = new THREE.Vector3(0, 1, 0).transformDirection(h.root.getObjectByName('sock_handR')!.matrixWorld);
        expect(axis.z, `walk frame ${k}: top tip forward`).toBeGreaterThan(0.3);
        expect(axis.y, `walk frame ${k}: tipped from upright`).toBeLessThan(0.95);
        expect(axis.y, `walk frame ${k}: not lying flat`).toBeGreaterThan(0.4);
        expect(bowFacts(h.root, hand)!.stringFacing, `walk frame ${k}: string toward the archer`).toBeGreaterThan(0.5);
        const boxes = legMeshes.map((m) => new THREE.Box3().setFromObject(m));
        let cut = 0;
        bow.traverse((o) => {
          if (!(o instanceof THREE.Mesh) || !o.visible) return;
          const pos = o.geometry.attributes.position;
          for (let i = 0; i < pos.count; i++) {
            v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
            if (legMeshes.some((m, j) => boxes[j].containsPoint(v) && inside(m, v))) cut++;
          }
        });
        expect(cut, `walk frame ${k}: points of the bow inside the right leg`).toBe(0);
      }
    });
  }
  for (const weapon of ['worn_bow', 'drakebone_bow']) {
    it(`${weapon}: upright, string toward the archer, arrow at the target, nock on the draw hand`, () => {
      const h = hero({ weapon });
      const hand = h.dresser.socket('sock_handL')!;
      // The string stays in the draw hand through the whole draw, pulled from its middle, with a level arrow.
      for (const t of [0.25, 0.35, 0.45]) {
        h.pose('bow', t);
        const f = bowFacts(h.root, hand)!;
        expect(f.nockToHand!, `nock at t=${t}`).toBeLessThan(0.03);
        expect(Math.abs(f.nockAboveMiddle!), `nock height at t=${t}`).toBeLessThan(0.03);
        expect(Math.abs(f.arrowRise!), `arrow level at t=${t}`).toBeLessThan(0.08);
      }
      h.pose('bow', IMPACT - 0.03);
      const full = bowFacts(h.root, hand)!;
      expect(full.upright).toBe(true);
      expect(full.stringBehindGrip).toBeLessThan(-0.3);
      expect(full.arrowVisible).toBe(true);
      expect(full.arrowForward!).toBeGreaterThan(0.9);
      expect(full.nockToHand!).toBeLessThan(0.15);
      h.pose('bow', 0.8);
      const rest = bowFacts(h.root, hand)!;
      expect(rest.upright).toBe(true);
      expect(rest.stringBehindGrip, 'brace faces the archer at rest').toBeLessThan(-0.12);
      expect(rest.arrowVisible).toBe(false);
    });
  }
  // A shot as the game plays it, frame by frame (Player.update, swingTiming): the archer turns side-on into it, holds
  // the stance through the next shot, and a moment after the last lowers the bow back to the carry. Nothing jumps, and
  // the string faces the archer in every frame.
  for (const weapon of ['worn_bow', 'recurve_bow']) {
    it(`${weapon}: turns into the shot and back out smoothly, the string facing the archer throughout`, () => {
      const h = hero({ weapon });
      const hand = h.dresser.socket('sock_handL')!;
      const dt = 1 / 60, dur = COMBAT_TUNING.swingFrac / 1.1, gap = (1 - COMBAT_TUNING.swingFrac) / 1.1;
      const bowHand = () => h.root.getObjectByName('sock_handR')!.getWorldPosition(new THREE.Vector3());
      h.pose('bow', -1, { speed: 3 }, dt);   // from the model's bind pose to the carry, which never shows
      let yaw = 0, at = bowHand(), worst = { yaw: 0, hand: 0, facing: 1 };
      const step = (attack: number, speed = 0) => {
        h.pose('bow', attack, { speed }, dt);
        const y = h.root.rotation.y, p = bowHand();
        worst.yaw = Math.max(worst.yaw, Math.abs(y - yaw));
        worst.hand = Math.max(worst.hand, p.distanceTo(at));
        worst.facing = Math.min(worst.facing, bowFacts(h.root, hand)!.stringFacing);
        yaw = y;
        at = p;
      };
      for (let t = 0; t < 0.5; t += dt) step(-1, 3);
      for (let shot = 0; shot < 2; shot++) {
        for (let t = 0; t < dur; t += dt) step(t / dur);
        for (let t = 0; t < gap; t += dt) step(-1);
        if (shot === 0) expect(h.root.rotation.y, 'held side-on between shots').toBeGreaterThan(BOW_TURN * 0.99);
      }
      for (let t = 0; t < 1.2; t += dt) step(-1, t > 0.4 ? 3 : 0);
      expect(h.root.rotation.y, 'turned back to the carry').toBe(0);
      // The bow comes up quickly (BOW_RAISE of the shot, a fifth of a second) but never in a single frame.
      expect(worst.yaw, 'largest turn in one frame (rad)').toBeLessThan(0.3);
      expect(worst.hand, 'largest move of the bow hand in one frame').toBeLessThan(0.25);
      expect(worst.facing, 'the string toward the archer in every frame').toBeGreaterThan(0.5);
    });
  }
});

// Each plate set (items.ts PLATE_STYLE): bronze, iron and steel share one design, Emberforged has its own.
// The pauldron's top block (the only part on the shoulder socket; its side block and the lames ride the arm)
// sits over the joint, so its centre stays above it in every pose; the Emberforged wing claws on it shift its
// centre a little.
for (const [body, style, cap] of [['bronze_platebody', 'Plate', -0.3], ['steel_platebody', 'Plate (steel)', -0.3], ['ember_platebody', 'Emberforged', -0.25]] as const) {
  describe(`pose audit: ${style} plate pauldrons cap the shoulder in every pose`, () => {
    const h = lazyHero({ weapon: 'iron_longsword', body });
    const poses: [AttackKind, number][] = [['swing', -1], ['swing', IMPACT - 0.11], ['swing', IMPACT], ['slam', IMPACT - 0.1], ['cast', IMPACT]];
    for (const [kind, t] of poses) {
      it(`${kind} t=${t}`, () => {
        h.pose(kind, t);
        for (const side of ['L', 'R'] as const) expect(shoulderCap(h.root, side)!, side).toBeLessThan(cap);
      });
    }
  });
}

describe('pose audit: dragons', () => {
  for (const name of ['cinderwing', 'drakeling', 'whelp']) {
    describe(name, () => {
      // Posed `secs` into an animation, the rig's clock started `phase` (0..1) of the way through the window it would
      // otherwise start in at random, so every sample is the same run to run.
      const run = (st: Partial<AnimState>, secs: number, phase: number) => {
        const m = makeModel(name);
        const holder = new THREE.Group();
        holder.add(m.root);
        const random = vi.spyOn(Math, 'random').mockReturnValue(phase);
        const rig = new Rig(m.root);
        random.mockRestore();
        const s = { ...newAnimState(), ...st };
        for (let t = 0; t < secs; t += 1 / 60) rig.update(1 / 60, s);
        holder.updateMatrixWorld(true);
        return m.root;
      };
      it('grounded: head faces forward, roughly level through the idle sway', () => {
        // Many rigs, each started at its own moment of the idle sway, sampled at different times.
        for (let k = 0; k < 12; k++) {
          const root = run({ speed: 0 }, 0.3 + k * 0.37, k / 12);
          const f = partForward(root, 'head')!;
          expect(f.z).toBeGreaterThan(0.7);
          expect(deg(f.y), `head pitch (deg) sample ${k}`).toBeLessThan(25);
          expect(deg(f.y), `head pitch (deg) sample ${k}`).toBeGreaterThan(-35);
        }
      });
      it('flying: neck extended forward, head level (not craned upward), at every moment of the sway and flap', () => {
        for (const secs of [0.3, 0.7, 1.1, 1.6, 2.2, 2.9, 3.4]) {
          for (let k = 0; k < 16; k++) {
            const root = run({ fly: 1, speed: 3 }, secs, k / 16);
            const f = partForward(root, 'head')!;
            const head = partCenter(root, 'head')!, body = partCenter(root, 'body')!;
            const at = `${secs}s, sway ${k}/16`;
            expect(deg(f.y), `head pitch at ${at}`).toBeLessThan(15);
            expect(deg(f.y), `head pitch at ${at}`).toBeGreaterThan(-30);
            // The head should lead the body, not tower above it.
            expect(head.z - body.z, `head ahead of body at ${at}`).toBeGreaterThan(0);
            expect((head.y - body.y) / Math.max(0.01, head.z - body.z), `neck rise per forward unit at ${at}`).toBeLessThan(0.6);
          }
        }
      });
      if (name !== 'whelp') {
        it('flying: the two wings never cross over the back, all through the flap', () => {
          const m = makeModel(name);
          const rig = new Rig(m.root);
          const s = { ...newAnimState(), fly: 1, speed: 3 };
          const v = new THREE.Vector3();
          for (let f = 0; f < 90; f++) {
            rig.update(1 / 60, s);
            m.root.updateMatrixWorld(true);
            for (const [side, sign] of [['wingL', 1], ['wingR', -1]] as const) {
              let inmost = Infinity;
              m.root.getObjectByName(side)!.traverse((o) => {
                if (!(o instanceof THREE.Mesh)) return;
                const pos = o.geometry.attributes.position;
                for (let i = 0; i < pos.count; i++) inmost = Math.min(inmost, v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld).x * sign);
              });
              expect(inmost, `${side} frame ${f}`).toBeGreaterThan(0);
            }
          }
        });
      }
    });
  }
});
