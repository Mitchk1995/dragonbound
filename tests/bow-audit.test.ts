/**
 * Bow audit (owner, October 4: "holding bow completely backwards"; then "still held wrong"). The real exported models,
 * dressed, animated and strung exactly as the game does it (Player.update: the rig, then BowDraw), played frame by
 * frame at 60 fps through standing, a whole stride, two shots back to back and lowering the bow after them. Every frame,
 * the bow is measured in world space from the scene graph (src/render/bowMeasure.ts) and held to the owner's rules:
 * the string between the riser and the archer, the limbs bending away from him, aimed upright with the aim in the bow's
 * plane, the hand's hole on the grip, the draw hand on the nock beside the jaw, the arrow on the string and at the
 * target with its head past the riser, carried angled down and forward with its back forward, and the bow never inside
 * the hero's body or legs. The `bow` inspect suite takes the same measurements in the running game.
 */
import { existsSync, readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { COMBAT_TUNING } from '../src/data/tuning';
import { makeItem } from '../src/loot/itemGen';
import { Rig, newAnimState, type AnimState } from '../src/render/anim';
import { BowDraw } from '../src/render/bowDraw';
import { auditBow, bowClips, measureBow, type BowState } from '../src/render/bowMeasure';
import { HeroDresser, MODEL_FILES, hasModel, makeModel, registerModelScene } from '../src/render/registry';
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

/** Every bow the hero can hold, in his starting outfit and in plate (the widest skirt, tassets and gauntlets). */
const PLATE: Partial<Record<Slot, string>> = { body: 'steel_platebody', gloves: 'steel_gauntlets', boots: 'steel_boots', helm: 'steel_fullhelm' };
const BOWS: [string, () => Partial<Record<Slot, Item>>][] = [];
for (const [bow, unique] of [['worn_bow'], ['hunter_bow'], ['recurve_bow'], ['drakebone_bow'], ['recurve_bow', 'emberstring']]) {
  for (const outfit of ['tunic', 'plate']) {
    BOWS.push([`${unique ?? bow} in ${outfit}`, () => ({
      weapon: unique ? ({ ...makeItem(bow), unique, rarity: 'unique' } as Item) : makeItem(bow),
      ...(outfit === 'plate' ? Object.fromEntries(Object.entries(PLATE).map(([s, id]) => [s, makeItem(id!)])) : {}),
    })]);
  }
}

/** One frame: how long it lasts, the attack's progress (-1: none) and the ground speed. */
type Frame = [label: string, dt: number, attack: number, speed: number];

/** Standing, a whole stride, two shots back to back at 60 fps with the gap between them, then lowering the bow. */
function playthrough(): Frame[] {
  const out: Frame[] = [['standing', 0, -1, 0]];
  for (let i = 0; i < 16; i++) out.push([`walking ${i}`, 0.05, -1, 5.6]);
  out.push(['stopped', 0.3, -1, 0]);
  const dt = 1 / 60, dur = COMBAT_TUNING.swingFrac / 1.1, gap = (1 - COMBAT_TUNING.swingFrac) / 1.1;
  for (let shot = 1; shot <= 2; shot++) {
    for (let t = 0; t < dur; t += dt) out.push([`shot ${shot} at ${(t / dur).toFixed(2)}`, dt, t / dur, 0]);
    for (let t = 0; t < gap; t += dt) out.push([`between shots`, dt, -1, 0]);
  }
  for (let t = 0; t < 0.8; t += dt) out.push([`lowering ${t.toFixed(2)}s`, dt, -1, t > 0.4 ? 3 : 0]);
  return out;
}

/** The hero dressed in `gear`, his bow strung and his rig ready, in a holder facing +Z. */
function archer(gear: Partial<Record<Slot, Item>>) {
  expect(hasModel('hero')).toBe(true);
  const model = makeModel('hero');
  const holder = new THREE.Group();
  holder.add(model.root);
  const dresser = new HeroDresser(model);
  dresser.dress(null, gear);
  const bow = new BowDraw(model.root);
  bow.attach();
  return { root: model.root, holder, dresser, bow, rig: new Rig(model.root) };
}

/** One frame of the rig and the string, as Player.update plays them. */
function play(a: ReturnType<typeof archer>, dt: number, attack: number, speed = 0) {
  const s: AnimState = { ...newAnimState(), attackKind: 'bow', attack, speed };
  a.rig.update(dt, s);
  a.bow.update(s, a.dresser.socket('sock_handL'));
  a.holder.updateMatrixWorld(true);
}

describe('bow audit: the bow in the hand, measured every frame', () => {
  for (const [label, gear] of BOWS) {
    it(label, () => {
      const a = archer(gear());
      const failures: string[] = [];
      const states: Record<BowState, number> = { carried: 0, turning: 0, aimed: 0, drawn: 0 };
      for (const [frame, dt, attack, speed] of playthrough()) {
        play(a, dt, attack, speed);
        const audit = auditBow(a.root, attack);
        if (!audit) {
          failures.push(`${frame}: no bow measured`);
          continue;
        }
        states[audit.state]++;
        if (audit.state === 'drawn' && !audit.measure.arrow) failures.push(`${frame}: drawn with no arrow nocked`);
        for (const [name, c] of Object.entries(audit.checks)) if (!c.ok) failures.push(`${frame} (${audit.state}): ${name} = ${c.value}, wants ${c.limit}`);
        const { count, deepest, into } = audit.clips;
        if (count) failures.push(`${frame} (${audit.state}): ${count} points of the bow cut into the hero, up to ${deepest} deep (${into.join(', ')})`);
      }
      expect(failures.slice(0, 25).join(' | '), `${failures.length} failing frame checks`).toBe('');
      // Every rule was judged: the playthrough passes through every state.
      for (const [state, n] of Object.entries(states)) expect(n, `frames ${state}`).toBeGreaterThan(0);
    }, 60_000);
  }
});

describe('bow audit: the checks catch a bow held wrong', () => {
  const worn = () => ({ weapon: makeItem('worn_bow') });
  const fails = (checks: Record<string, { ok: boolean }>, name: string) => expect(checks[name]?.ok, name).toBe(false);

  it('the bow turned round in the hand, as it was reported, fails the facing rules', () => {
    const a = archer(worn());
    play(a, 0, -1);
    a.root.getObjectByName('sock_handR')!.rotateY(Math.PI);
    a.holder.updateMatrixWorld(true);
    const audit = auditBow(a.root, -1)!;
    fails(audit.checks, '1 string toward the chest (cos)');
    fails(audit.checks, '7 back forward (cos)');
  });

  it('a bow pushed into the chest and into the thigh is caught cutting in', () => {
    const a = archer(worn());
    play(a, 0, -1);
    const bow = a.root.getObjectByName('gear:sock_handR')!;
    for (const [part, into] of [['sock_chest', ['sock_chest', 'body']], ['legR', ['legR']]] as const) {
      // Move the bow's riser onto the part (a little below the leg's hinge, into the thigh).
      const m = measureBow(a.root)!;
      const to = a.root.getObjectByName(part)!.getWorldPosition(new THREE.Vector3());
      if (part === 'legR') to.y -= 0.3;
      bow.position.add(bow.parent!.worldToLocal(to).sub(bow.parent!.worldToLocal(m.riser.clone())));
      a.holder.updateMatrixWorld(true);
      const clips = bowClips(a.root, measureBow(a.root)!);
      expect(clips.count, `points cut into ${part}`).toBeGreaterThan(0);
      expect(clips.into.filter((p) => (into as readonly string[]).includes(p)), `cut into ${part}`).not.toHaveLength(0);
    }
  });

  it('a bow with no grip, or the hand off it, fails the grip rules', () => {
    const a = archer(worn());
    play(a, 0, -1);
    a.root.getObjectByName('bow_grip')!.name = 'riser';
    let checks = auditBow(a.root, -1)!.checks;
    fails(checks, '4 hand on the grip');
    fails(checks, '4 hand hole at the grip\'s middle');
    fails(checks, '4 hand hole off the grip\'s centre line');
    a.root.getObjectByName('riser')!.name = 'bow_grip';
    a.root.getObjectByName('gear:sock_handR')!.translateY(0.12);
    a.holder.updateMatrixWorld(true);
    checks = auditBow(a.root, -1)!.checks;
    fails(checks, '4 hand on the grip');
    fails(checks, '4 hand hole at the grip\'s middle');
  });
});
