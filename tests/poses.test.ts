/**
 * Pose audit: loads the real exported models (public/models/*.glb), dresses and animates them
 * exactly like the game, and checks measurable facts about every pose. The hero faces +Z
 * (forward), +Y is up, the hero's right hand is at -X. If a pose looks wrong in game, add the
 * expectation here first, watch it fail, then fix the animation.
 */
import { readFileSync, existsSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { Rig, newAnimState, type AnimState, type AttackKind } from '../src/render/anim';
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
    // hence its extra meshes.
    expect(count('drakeling')).toBeLessThanOrEqual(20);
    expect(count('cinderwing')).toBeLessThanOrEqual(31);
    expect(count('goblin')).toBeLessThanOrEqual(9);
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
  it('idle: shaft held in front of the fist and leaning forward, not running down the forearm', () => {
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

describe('pose audit: bow', () => {
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
      const run = (st: Partial<AnimState>, secs: number) => {
        const m = makeModel(name);
        const holder = new THREE.Group();
        holder.add(m.root);
        const rig = new Rig(m.root);
        const s = { ...newAnimState(), ...st };
        for (let t = 0; t < secs; t += 1 / 60) rig.update(1 / 60, s);
        holder.updateMatrixWorld(true);
        return m.root;
      };
      it('grounded: head faces forward, roughly level through the idle sway', () => {
        // Sample many independent rigs (random idle phase) and moments.
        for (let k = 0; k < 12; k++) {
          const root = run({ speed: 0 }, 0.3 + k * 0.37);
          const f = partForward(root, 'head')!;
          expect(f.z).toBeGreaterThan(0.7);
          expect(deg(f.y), `head pitch (deg) sample ${k}`).toBeLessThan(25);
          expect(deg(f.y), `head pitch (deg) sample ${k}`).toBeGreaterThan(-35);
        }
      });
      it('flying: neck extended forward, head level (not craned upward)', () => {
        for (const secs of [0.3, 0.7, 1.1, 1.6, 2.2, 2.9, 3.4]) {
          const root = run({ fly: 1, speed: 3 }, secs);
          const f = partForward(root, 'head')!;
          const head = partCenter(root, 'head')!, body = partCenter(root, 'body')!;
          expect(deg(f.y), `head pitch at ${secs}s`).toBeLessThan(15);
          expect(deg(f.y), `head pitch at ${secs}s`).toBeGreaterThan(-30);
          // The head should lead the body, not tower above it.
          expect(head.z - body.z, 'head ahead of body').toBeGreaterThan(0);
          expect((head.y - body.y) / Math.max(0.01, head.z - body.z), 'neck rise per forward unit').toBeLessThan(0.6);
        }
      });
    });
  }
});
