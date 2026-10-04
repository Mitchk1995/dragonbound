/**
 * The tied hair's tail as the game swings it (src/render/ponytail.ts), on the real hero and hair_3 models posed by the
 * game's rig: at rest it hangs as modelled; aiming a bow it turns with the head and leans back and out over the
 * shoulder the tie comes round to; it hangs with gravity as the body leans back and rests on the back as the body leans
 * forward; and it follows a turn through, lagging, overshooting a touch and settling.
 */
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { Rig, newAnimState, type AnimState } from '../src/render/anim';
import { PONYTAIL, PONYTAIL_BACK, PONYTAIL_OUT, ponytailHang } from '../src/render/ponytail';
import { HeroDresser, makeModel, registerModelScene } from '../src/render/registry';

beforeAll(async () => {
  const loader = new GLTFLoader();
  for (const name of ['hero', 'hair_3']) {
    const buf = readFileSync(`public/models/${name}.glb`);
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    registerModelScene(name, (await new Promise<{ scene: THREE.Group }>((res, rej) => loader.parse(ab, '', res as never, rej))).scene);
  }
});

const DOWN = new THREE.Vector3(0, -1, 0);
const deg = (a: number) => THREE.MathUtils.radToDeg(a);

/** A hero wearing the tied hair, posed by the game's rig, measured in his own frame (the root's: Y up, +Z his front). */
function tied() {
  const model = makeModel('hero');
  const holder = new THREE.Group();
  holder.add(model.root);
  new HeroDresser(model).dress({ name: '', skin: 1, hair: 3, hairColor: 1, beard: 0, cloth: 0, cloth2: 5 }, {});
  const rig = new Rig(model.root);
  const tail = model.root.getObjectByName(PONYTAIL)!;
  const part = (name: string) => model.root.getObjectByName(name)!;
  const pose = (st: Partial<AnimState>, dt = 0) => {
    rig.update(dt, { ...newAnimState(), ...st });
    holder.updateMatrixWorld(true);
  };
  /** A part's rotation in the hero's own frame. */
  const turn = (o: THREE.Object3D) =>
    model.root.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(o.getWorldQuaternion(new THREE.Quaternion()));
  /** The tail's hang, from the tie down to its tip as modelled, in the hero's own frame. */
  const hang = () => DOWN.clone().applyQuaternion(turn(tail));
  /** The head's turn from the body's front, about the upright. */
  const headTurn = () => {
    const front = new THREE.Vector3(0, 0, 1).applyQuaternion(turn(part('head')));
    return Math.atan2(front.x, front.z);
  };
  return { tail, part, pose, turn, hang, headTurn };
}

describe('the tied hair\'s tail', () => {
  it('leans as far as the Blender audit\'s copy of it does (tools/blender/animpose.py ponytail)', () => {
    const m = /PONYTAIL_BACK, PONYTAIL_OUT = math\.radians\(([\d.]+)\), math\.radians\(([\d.]+)\)/.exec(
      readFileSync('tools/blender/animpose.py', 'utf8'));
    expect(m, 'animpose.py names both leans').toBeTruthy();
    expect(Number(m![1])).toBeCloseTo(deg(PONYTAIL_BACK), 6);
    expect(Number(m![2])).toBeCloseTo(deg(PONYTAIL_OUT), 6);
  });

  it('hangs at the tie as modelled when the hero stands at rest', () => {
    const h = tied();
    expect(h.tail.parent, 'the tail rides the head').toBeTruthy();
    h.pose({});
    // (At rest the head sways a few degrees from side to side, and the tail leans with it a little.)
    expect(deg(h.hang().angleTo(DOWN))).toBeLessThan(4);
  });

  it('aiming a bow, turns with the head and leans back and out over the shoulder the tie comes round to', () => {
    const h = tied();
    h.pose({ attackKind: 'bow', attack: 0.5 });
    const turn = h.headTurn(), s = Math.sin(turn);
    expect(deg(Math.abs(turn)), 'the head turns to look down the arrow').toBeGreaterThan(60);
    // Turned with the head (so it never twists against its own tie), then leaning out of the shoulder's way.
    expect(deg(h.turn(h.tail).angleTo(ponytailHang(turn)))).toBeLessThan(0.5);
    const hang = h.hang();
    // Back, away from the shoulder, as far as the tie has come round...
    expect(deg(Math.asin(-hang.z))).toBeCloseTo(deg(PONYTAIL_BACK * Math.abs(s)), 0);
    // ...and a little out past it, on the side the tie came round to (behind the head, at -sin(turn) along X).
    expect(Math.sign(hang.x)).toBe(Math.sign(-s));
    expect(deg(Math.asin(Math.abs(hang.x)))).toBeGreaterThan(3);
    expect(deg(Math.asin(Math.abs(hang.x)))).toBeLessThan(15);
  });

  it('hangs with gravity as the body leans back, and rests on the back as the body leans forward', () => {
    const hit = tied();
    hit.pose({ hurt: 1 });                         // thrown back by a hit: the body leans back, away from the tail
    const bodyDown = (h: ReturnType<typeof tied>) => DOWN.clone().applyQuaternion(h.turn(h.part('body')));
    expect(deg(bodyDown(hit).angleTo(DOWN))).toBeGreaterThan(10);
    expect(deg(hit.hang().angleTo(DOWN))).toBeLessThan(4);
    const slam = tied();
    slam.pose({ attackKind: 'slam', attack: 0.8 }); // following the slam through: the body leans forward over it
    expect(bodyDown(slam).z).toBeLessThan(-0.1);
    expect(deg(slam.hang().angleTo(bodyDown(slam)))).toBeLessThan(4);
  });

  it('follows the head round with a little follow-through: lagging, overshooting a touch, then settling', () => {
    const settled = tied();
    settled.pose({ attackKind: 'bow', attack: 0.5 });
    const target = settled.hang();
    const h = tied();
    h.pose({});
    const from = deg(h.hang().angleTo(target));
    expect(from).toBeGreaterThan(30);
    const off: number[] = [];
    for (let f = 0; f < 120; f++) {
      h.pose({ attackKind: 'bow', attack: 0.5 }, 1 / 60);
      off.push(deg(h.hang().angleTo(target)));
    }
    expect(off[0], 'a frame after the turn, it has barely moved').toBeGreaterThan(0.9 * from);
    const near = off.findIndex((a) => a < 0.15 * from);
    expect(near, 'it swings over within half a second').toBeGreaterThan(0);
    expect(near).toBeLessThan(30);
    const over = Math.max(...off.slice(near));
    expect(over, 'it swings on past the hang a little').toBeGreaterThan(0.05 * from);
    expect(over).toBeLessThan(0.35 * from);
    expect(off[off.length - 1], 'and settles within two seconds').toBeLessThan(0.5);
  });

  it('never swings into the back: lowering the bow or slamming, it stops at the upright through its tie', () => {
    /** How far forward of the upright through the tie the tail hangs (the upright leaning with the body as far as the
     * body leans forward, onto its back): positive is into the back. */
    const forward = (h: ReturnType<typeof tied>) => {
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(h.turn(h.part('body')));
      return h.hang().applyAxisAngle(new THREE.Vector3(1, 0, 0), -Math.max(0, Math.atan2(up.z, up.y))).z;
    };
    // Lowering the bow, the head turns back to the front and the tail swings back down after it.
    const bow = tied();
    bow.pose({ attackKind: 'bow', attack: 0.5 });
    let worst = -1;
    for (let f = 0; f < 120; f++) {
      bow.pose({}, 1 / 60);
      worst = Math.max(worst, forward(bow));
    }
    expect(deg(bow.hang().angleTo(DOWN)), 'it hangs again').toBeLessThan(4);
    expect(worst).toBeLessThan(1e-4);
    // A slam: the body leans back in the wind-up, then over forward through the blow.
    const slam = tied();
    slam.pose({});
    worst = -1;
    for (let f = 0; f <= 60; f++) {
      slam.pose({ attackKind: 'slam', attack: f / 60 }, 1 / 60);
      worst = Math.max(worst, forward(slam));
    }
    expect(worst).toBeLessThan(1e-4);
  });
});
