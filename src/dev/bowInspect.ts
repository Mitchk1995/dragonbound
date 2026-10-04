import * as THREE from 'three';
import { COMBAT_TUNING } from '../data/tuning';
import type { Game } from '../game';
import { makeItem } from '../loot/itemGen';
import { BOW_HOLD, BOW_LOWER, Rig, newAnimState, type AnimState } from '../render/anim';
import { BowDraw } from '../render/bowDraw';
import { auditBow, measureBow, type BowCheck } from '../render/bowMeasure';
import { HeroDresser, makeModel } from '../render/registry';
import type { Slot } from '../types';
import { Studio, equip, fit } from './inspect';

type Shot = (n: string) => Promise<void>;
type Cell = Parameters<Studio['sheet']>[0][number];

const LOOK = { name: '', skin: 1, hair: 1, hairColor: 1, beard: 0, cloth: 0, cloth2: 5 };
/** The hero's running speed: the stride at its full swing. */
const RUN = 5.6;
/** Stride phases: the right leg forward, then the left. */
const RIGHT = Math.PI / 2, LEFT = -Math.PI / 2;
/** Full draw, just before the arrow looses. */
const FULL = COMBAT_TUNING.impact - 0.03;

const SETS: [string, Partial<Record<Slot, string>>][] = [
  ['starting outfit', { weapon: 'worn_bow' }],
  ['leather', { weapon: 'hunter_bow', helm: 'leather_cap', body: 'leather_body', gloves: 'leather_gloves', boots: 'leather_boots' }],
  ['steel plate', { weapon: 'drakebone_bow', helm: 'steel_fullhelm', body: 'steel_platebody', gloves: 'steel_gauntlets', boots: 'steel_boots' }],
];

/** One frame of the rig: how long it lasts (seconds; or, walking, the stride's phase it reaches) and what the hero is
 * doing. */
type Frame = { dt?: number; phase?: number; s: Partial<AnimState> };

/** The hero in `set`, played through `frames` exactly as the game plays him (Player.update: the rig, then the string);
 * `marked`: the bow tinted so which way it faces reads at a glance (markBow). */
function archer(set: Partial<Record<Slot, string>>, frames: Frame[], marked = false) {
  const m = makeModel('hero');
  const holder = new THREE.Group();
  holder.add(m.root);
  const dresser = new HeroDresser(m);
  dresser.dress(LOOK, Object.fromEntries(Object.entries(set).map(([s, id]) => [s, makeItem(id!)])));
  const bow = new BowDraw(m.root);
  bow.attach();
  const rig = new Rig(m.root);
  for (const f of frames) {
    const s = { ...newAnimState(), attackKind: 'bow' as const, ...f.s };
    rig.update(f.phase === undefined ? f.dt ?? 0 : f.phase / (s.speed * rig.stride), s);
    bow.update(s, dresser.socket('sock_handL'));
  }
  if (marked) markBow(m.root);
  return holder;
}

const RED = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
const GREEN = new THREE.MeshBasicMaterial({ color: 0x2aff4a });
const BLUE = new THREE.Color(0x2a6aff);

/**
 * Marks the bow for the orientation pictures (never in play): the string red and drawn thicker, the back of the limbs
 * and riser blue (every face turned away from inside the bow's D) and the arrow's head green.
 */
function markBow(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  const m = measureBow(root);
  if (!m) return;
  // A point inside the D, beyond the string from the riser: the faces on the back of the bow look away from it.
  const inner = m.string.clone().add(m.string.clone().sub(m.riser).multiplyScalar(0.6));
  const p = new THREE.Vector3(), n = new THREE.Vector3(), nm = new THREE.Matrix3();
  root.getObjectByName('gear:sock_handR')!.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    if (o.name === 'bow_string') {
      o.material = RED;
      o.geometry = new THREE.CylinderGeometry(0.02, 0.02, 1, 6).translate(0, 0.5, 0);
      return;
    }
    if (o.name === 'bow_arrow_head') {
      o.material = GREEN;
      return;
    }
    for (let q = o.parent; q; q = q.parent) if (q.name === 'bow_arrow') return;
    const geo = o.geometry.clone();
    const pos = geo.attributes.position, nor = geo.attributes.normal;
    const base = (o.material as THREE.MeshStandardMaterial).color ?? new THREE.Color(0x888888);
    const col = new Float32Array(pos.count * 3);
    nm.getNormalMatrix(o.matrixWorld);
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld).sub(inner).normalize();
      n.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize();
      const c = n.dot(p) > 0.35 ? BLUE : base;
      col.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    o.geometry = geo;
    o.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, flatShading: true });
  });
}

/** Straight down on the hero without perspective (Studio's ortho cells): his front (+Z) up the picture, or with
 * `game`, the top of the picture up the screen as the play camera sees it (-Z). */
function above(o: THREE.Object3D, half = 1.05, game = false) {
  o.updateMatrixWorld(true);
  const at = new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3());
  return { eye: at.clone().add(new THREE.Vector3(0, 6, game ? 0.012 : -0.012)), at, ortho: half };
}

/** The bow's key numbers in this pose, for a picture's label. */
function numbers(o: THREE.Object3D, attack: number) {
  const a = auditBow(o.children[0], attack);
  if (!a) return 'no bow';
  const v = (k: string) => a.checks[k]?.value.toFixed(2) ?? '-';
  return a.state === 'carried' ? `back fwd ${v('7 back forward (cos)')} · string to chest ${v('1 string toward the chest (cos)')}`
    : `back to target ${v('2 back toward the target (cos)')} · arrow to target ${v('6 arrow at the target (cos)')}`
      + ` · side-on ${v('8 side-on: shoulders along the aim (cos)')}`;
}

const shot = (a: number): Frame[] => [{ s: { attack: a } }];
const standing: Frame[] = [{ s: {} }];
const walking = (phase: number): Frame[] => [{ phase, s: { speed: RUN } }];
/** After a shot, the bow lowered `k` of the way back to the carry. */
const lowering = (k: number): Frame[] =>
  [{ s: { attack: 0.99 } }, { dt: BOW_HOLD, s: { attack: -1 } }, { dt: BOW_LOWER * k, s: { attack: -1 } }];

// Views of the shot: the target is +Z, the archer side-on to it with his chest to +X.
const SIDE = new THREE.Vector3(1, 0.12, 0.02), FRONT = new THREE.Vector3(0.12, 0.12, 1), ABOVE = new THREE.Vector3(0.25, 1, 0.12);
const BEHIND = new THREE.Vector3(-0.1, 0.25, -1), PLAY = new THREE.Vector3(0, 1.5, -1), PLAY_SIDE = new THREE.Vector3(1, 1.5, 0);
// Views of the carry: the hero walks toward +Z, the bow in his right hand (-X).
const RIGHT_SIDE = new THREE.Vector3(-1, 0.1, 0.02), CARRY_FRONT = new THREE.Vector3(-0.25, 0.15, 1);
const CARRY_Q = new THREE.Vector3(-0.8, 0.35, 0.7), CARRY_PLAY = new THREE.Vector3(-0.3, 1.5, 1);
// The play camera's own angle, from the south and high up (game.ts updateCamera), fixed in the world.
const PLAY_CAMERA = new THREE.Vector3(0, 21, 14);

/** A camera `dist` from the head, looking at the draw hand's side of it. */
function face(o: THREE.Object3D, dir: THREE.Vector3, dist = 1.9) {
  o.updateMatrixWorld(true);
  const at = o.getObjectByName('head')!.getWorldPosition(new THREE.Vector3());
  at.y -= 0.05;
  return { eye: at.clone().add(dir.clone().normalize().multiplyScalar(dist)), at };
}

/**
 * The bow in the hero's hands (explicit suite: `npm run inspect -- bow`): first measured in the running game (inGame,
 * returned for report.json; a broken rule fails the run), then which way it faces marked in colour from the side and
 * straight down and shooting every way, the shot side-on from every side and the draw hand at the jaw close up, the
 * bow carried walking, the stance turning in and out of a shot, everything at the play camera, and the goblin's and
 * kobold's hips mid-stride.
 */
export async function bowSuite(g: Game, shoot: Shot) {
  const measured = await inGame(g);
  document.body.classList.add('inspect-clean');
  const st = new Studio(g);
  const cells: Cell[] = [];
  const flush = async (name: string, cols: number, rows: number) => {
    st.sheet(cells, cols, rows);
    await shoot(name);
    st.clear(cells.map((c) => c.obj));
    cells.length = 0;
  };
  // Framed on the standing hero, so every cell of a sheet keeps one scale.
  const add = (label: string, set: Partial<Record<Slot, string>>, frames: Frame[], dir: THREE.Vector3) =>
    cells.push({ label, obj: archer(set, frames), ...fit(archer(set, []), dir) });

  // Which way the bow faces, beyond doubt: string red, back of the bow blue, arrow head green, from the side and
  // straight down (no perspective), with the numbers measured in that pose.
  const marked = (label: string, set: Partial<Record<Slot, string>>, frames: Frame[], dir: THREE.Vector3 | null, attack = -1) => {
    const o = archer(set, frames, true);
    cells.push({ label: `${label} · ${numbers(o, attack)}`, obj: o, ...(dir ? fit(archer(set, []), dir) : above(o)) });
  };
  const [worn, leather, plate] = SETS.map(([, set]) => set);
  marked('carried, standing · side', worn, standing, RIGHT_SIDE);
  marked('walking · side', worn, walking(RIGHT), RIGHT_SIDE);
  marked(`hunter's bow walking · side`, leather, walking(LEFT), RIGHT_SIDE);
  marked('carried, standing · from above', worn, standing, null);
  marked('walking · from above', worn, walking(RIGHT), null);
  marked(`hunter's bow walking · from above`, leather, walking(LEFT), null);
  await flush('bow-marked-carry', 3, 2);
  marked('full draw · side', worn, shot(FULL), SIDE, FULL);
  marked('from the target', worn, shot(FULL), FRONT, FULL);
  marked('from above', worn, shot(FULL), null, FULL);
  marked('drakebone, plate · side', plate, shot(FULL), SIDE, FULL);
  marked('from the target', plate, shot(FULL), FRONT, FULL);
  marked('from above', plate, shot(FULL), null, FULL);
  await flush('bow-marked-draw', 3, 2);
  // Side-on to the target whichever way he shoots: one shot to each quarter of the compass, at the play camera's angle
  // and straight down, the top of the picture up the screen as in the game.
  const aims: [string, number][] = [['toward the camera', 0], ['to the right', Math.PI / 2], ['up the screen', Math.PI], ['to the left', -Math.PI / 2]];
  for (const view of ['play camera', 'from above'] as const) {
    for (const [label, facing] of aims) {
      const o = archer(worn, shot(FULL), true);
      o.rotation.y = facing;
      o.updateMatrixWorld(true);
      const a = auditBow(o.children[0], FULL)!;
      const v = (k: string) => a.checks[k]?.value.toFixed(2) ?? '-';
      cells.push({
        label: `${label} · side-on ${v('8 side-on: shoulders along the aim (cos)')} · arrow ${v('6 arrow at the target (cos)')}`,
        obj: o, ...(view === 'play camera' ? fit(o, PLAY_CAMERA) : above(o, 1.05, true)),
      });
    }
  }
  await flush('bow-marked-aims', 4, 2);

  for (const [label, set] of SETS) {
    add(`${label} · full draw · side`, set, shot(FULL), SIDE);
    add(`${label} · from the target`, set, shot(FULL), FRONT);
    add(`${label} · from above`, set, shot(FULL), ABOVE);
    add(`${label} · from behind`, set, shot(FULL), BEHIND);
    add(`${label} · play camera angle`, set, shot(FULL), PLAY);
    const o = archer(set, shot(FULL));
    cells.push({ label: `${label} · the draw hand at the jaw`, obj: o, ...face(o, new THREE.Vector3(1, 0.1, 0.35)) });
    await flush(`bow-draw-${label.replace(/\s+/g, '_')}`, 3, 2);
  }

  for (const [label, set] of SETS.slice(0, 2)) {
    add(`${label} · carried, right leg forward · side`, set, walking(RIGHT), RIGHT_SIDE);
    add(`${label} · left leg forward · side`, set, walking(LEFT), RIGHT_SIDE);
    add(`${label} · standing`, set, standing, RIGHT_SIDE);
    add(`${label} · walking · front`, set, walking(RIGHT), CARRY_FRONT);
    add(`${label} · walking · 3/4`, set, walking(LEFT), CARRY_Q);
    add(`${label} · walking · play camera angle`, set, walking(RIGHT), CARRY_PLAY);
    await flush(`bow-carry-${label.replace(/\s+/g, '_')}`, 3, 2);
  }

  // Into the shot and out of it: carried, the bow coming up, drawn, loosed, lowering and back.
  const set = SETS[0][1];
  for (const [view, dir] of [['side', SIDE], ['play camera angle', PLAY_SIDE]] as const) {
    add(`carried · ${view}`, set, standing, dir);
    add(`coming up`, set, shot(0.1), dir);
    add(`full draw`, set, shot(FULL), dir);
    add(`loosed`, set, shot(0.8), dir);
    add(`lowering`, set, lowering(0.5), dir);
    add(`nearly down`, set, lowering(0.8), dir);
    await flush(`bow-stance-${view.replace(/\s+/g, '_')}`, 3, 2);
  }

  await creatures(cells, flush);
  await playCamera(g, shoot);
  reportFailures(measured);
  return measured;
}

/** One set's measurements in the running game: how many frames in each state, each rule's range and failures, and the
 * frames with any of the bow inside the hero. */
interface Tally {
  frames: number;
  states: Record<string, number>;
  checks: Record<string, { min: number; max: number; limit: string; failed: number }>;
  clipped: { frames: number; most: number; into: string[] };
  failures: string[];
}

/**
 * The bow measured in the running game: the player himself in each set, standing, walking, stopping, shooting twice
 * and lowering the bow, all driven by the game's own loop (Player.update: the rig, then the string) at half speed for
 * more frames. After every update of his, the bow is measured and judged from the scene graph (render/bowMeasure.ts
 * auditBow), exactly as tests/bow-audit.test.ts does with the same models outside the game. He is the only one who
 * holds a bow.
 */
async function inGame(g: Game) {
  const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
  const until = async (done: () => boolean, max = 900) => {
    for (let i = 0; i < max && !done(); i++) await frame();
  };
  const wait = async (sec: number) => {
    const end = g.time + sec;
    await until(() => g.time >= end);
  };
  g.travel('foothills', true);
  for (let i = 0; i < 15; i++) await frame();
  for (const e of g.zone.enemies) e.obj.removeFromParent();
  g.zone.enemies = [];
  const p = g.player;
  const dais = g.zone.layout.props.find((q) => q.kind === 'ritual_dais')!;
  const out: Record<string, Tally> = {};
  let phase = '';
  g.debug.timeScale = 0.5;
  try {
    for (const [label, set] of SETS) {
      equip(g, { weapon: null, helm: null, body: null, gloves: null, boots: null, ...set });
      p.obj.position.set(dais.x + 10, 0, dais.z + 2.6);
      p.stop();
      for (let i = 0; i < 5; i++) await frame();
      const t: Tally = { frames: 0, states: {}, checks: {}, clipped: { frames: 0, most: 0, into: [] }, failures: [] };
      out[label] = t;
      const own = Object.getPrototypeOf(p).update as typeof p.update;
      p.update = (dt, game) => {
        own.call(p, dt, game);
        const a = auditBow(p.model.root, p.anim.attack);
        if (!a) return;
        t.frames++;
        t.states[a.state] = (t.states[a.state] ?? 0) + 1;
        for (const [k, c] of Object.entries(a.checks) as [string, BowCheck][]) {
          const r = (t.checks[k] ??= { min: Infinity, max: -Infinity, limit: c.limit, failed: 0 });
          r.min = Math.min(r.min, c.value);
          r.max = Math.max(r.max, c.value);
          if (c.ok) continue;
          r.failed++;
          if (t.failures.length < 12) t.failures.push(`${phase} (${a.state}): ${k} = ${c.value}, wants ${c.limit}`);
        }
        if (a.clips.count) {
          t.clipped.frames++;
          t.clipped.most = Math.max(t.clipped.most, a.clips.count);
          t.clipped.into = [...new Set([...t.clipped.into, ...a.clips.into])];
          if (t.failures.length < 12) t.failures.push(`${phase} (${a.state}): ${a.clips.count} points inside (${a.clips.into.join(', ')})`);
        }
      };
      phase = 'standing';
      await wait(0.4);
      phase = 'walking';
      p.moveTo(g, p.x + 5, p.z);
      await wait(0.9);
      phase = 'stopped';
      p.stop();
      await wait(0.3);
      // Two shots where he stands, then one at each quarter of the compass: down the screen (toward the play camera),
      // to its right, up it and to its left.
      for (const [k, facing] of [null, null, 0, Math.PI / 2, Math.PI, -Math.PI / 2].entries()) {
        await until(() => !p.action && p.attackCd <= 0);
        if (facing !== null) p.faceTo(p.x + Math.sin(facing), p.z + Math.cos(facing), true);
        phase = facing === null ? `shot ${k + 1}` : `shot ${k + 1}, facing ${facing.toFixed(2)}`;
        g.combat.startBasicAttack(null);
        await until(() => !p.action);
      }
      phase = 'lowering';
      await wait(0.9);
      phase = 'walking on';
      p.moveTo(g, p.x - 4, p.z);
      await wait(0.8);
      delete (p as { update?: unknown }).update;
      p.stop();
    }
  } finally {
    delete (p as { update?: unknown }).update;
    g.debug.timeScale = 1;
  }
  return out;
}

/** Every rule a set broke in the running game, and every frame its bow cut into him, as console errors (report.json's
 * errors: the inspect run fails). */
function reportFailures(measured: Record<string, Tally>) {
  for (const [label, t] of Object.entries(measured)) {
    for (const f of t.failures) console.error(`bow, ${label}: ${f}`);
    for (const state of ['carried', 'turning', 'aimed', 'drawn']) if (!t.states[state]) console.error(`bow, ${label}: never ${state}`);
  }
}

/** The goblin and the kobold mid-stride and running just hit, side and front. */
async function creatures(cells: Cell[], flush: (name: string, cols: number, rows: number) => Promise<void>) {
  const runner = (model: string, phase: number, extra: Partial<AnimState> = {}) => {
    const m = makeModel(model);
    const holder = new THREE.Group();
    holder.add(m.root);
    const rig = new Rig(m.root);
    rig.update(phase / (RUN * rig.stride), { ...newAnimState(), speed: RUN, ...extra });
    return holder;
  };
  for (const model of ['goblin', 'kobold']) {
    const at = (label: string, phase: number, dir: THREE.Vector3, extra?: Partial<AnimState>) =>
      cells.push({ label: `${model} · ${label}`, obj: runner(model, phase, extra), ...fit(runner(model, 0), dir) });
    at('left leg forward · side', LEFT, new THREE.Vector3(1, 0.1, 0.03));
    at('right leg forward · front', RIGHT, new THREE.Vector3(0.1, 0.15, 1));
    at('running, just hit · side', LEFT, new THREE.Vector3(-1, 0.1, 0.03), { hurt: 1 });
  }
  await flush('bow-creature-hips', 3, 2);
  // The hips close up from behind, under the arms, where a thigh used to show through: mid-stride, and just hit.
  for (const model of ['goblin', 'kobold']) {
    const close = (label: string, phase: number, dir: THREE.Vector3, extra?: Partial<AnimState>) => {
      const o = runner(model, phase, extra);
      o.updateMatrixWorld(true);
      const at = o.getObjectByName('body')!.getWorldPosition(new THREE.Vector3());
      at.y -= 0.08;
      cells.push({ label: `${model} · hips · ${label}`, obj: o, eye: at.clone().add(dir.clone().normalize().multiplyScalar(2.1)), at });
    };
    close('left leg forward · back', LEFT, new THREE.Vector3(0.55, 0.12, -1));
    close('right leg forward · back', RIGHT, new THREE.Vector3(-0.55, 0.12, -1));
    close('running, just hit · back', LEFT, new THREE.Vector3(-0.75, 0.1, -1), { hurt: 1 });
  }
  await flush('bow-creature-hips-close', 3, 2);
}

/**
 * At the play camera in the Foothills (the player hidden and the world held still): the hero at full draw shooting up
 * the screen and across it, and walking with the bow.
 */
async function playCamera(g: Game, shoot: Shot) {
  g.travel('foothills', true);
  for (let i = 0; i < 15; i++) await new Promise<void>((r) => requestAnimationFrame(() => r()));
  const dais = g.zone.layout.props.find((p) => p.kind === 'ritual_dais')!;
  const spot = new THREE.Vector3(dais.x + 10, 0, dais.z + 2.6);
  spot.y = g.zone.nav.y(spot.x, spot.z);
  g.debug.hold = () => false;
  for (const e of g.zone.enemies) e.obj.removeFromParent();
  g.zone.enemies = [];
  g.player.obj.visible = false;
  const views: [string, Frame[], number][] = [
    ['draw-up', shot(FULL), Math.PI], ['draw-across', shot(FULL), Math.PI / 2], ['draw-toward', shot(FULL), 0],
    ['carry-across', walking(LEFT), -Math.PI / 2], ['carry-toward', walking(RIGHT), 0.4],
  ];
  for (const [name, frames, facing] of views) {
    const o = archer(SETS[0][1], frames);
    o.position.copy(spot);
    o.rotation.y = facing;
    g.scene.add(o);
    for (const [zoom, tag] of [[1, 'default'], [0.4, 'close']] as const) {
      g.camZoom = zoom;
      g.camPos.copy(spot);
      g['updateCamera'](0);
      await shoot(`bow-playcam-${name}-${tag}`);
    }
    o.removeFromParent();
  }
  g.player.obj.visible = true;
  g.camZoom = 1;
  document.body.classList.remove('inspect-clean');
  g.debug.hold = null;
}
