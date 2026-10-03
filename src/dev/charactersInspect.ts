import * as THREE from 'three';
import { ENEMIES } from '../data/enemies';
import { COMBAT_TUNING } from '../data/tuning';
import type { Game } from '../game';
import { makeItem } from '../loot/itemGen';
import { Rig, newAnimState, type AnimState, type AttackKind } from '../render/anim';
import { BowDraw } from '../render/bowDraw';
import { HeroDresser, makeModel } from '../render/registry';
import type { Slot } from '../types';
import { Studio, equip, fit } from './inspect';

type Shot = (n: string) => Promise<void>;

const LOOK = { name: '', skin: 1, hair: 1, hairColor: 1, beard: 0, cloth: 0, cloth2: 5 };

/** The hero in each outfit the redesign was checked in, with the attack its weapon makes. */
const HERO_SETS: [string, Partial<Record<Slot, string>>, AttackKind][] = [
  ['starting outfit', { weapon: 'bronze_sword' }, 'swing'],
  ['starting outfit staff', { weapon: 'apprentice_staff' }, 'cast'],
  ['starting outfit bow', { weapon: 'worn_bow' }, 'bow'],
  ['steel plate', { weapon: 'steel_longsword', helm: 'steel_fullhelm', body: 'steel_platebody', gloves: 'steel_gauntlets', boots: 'steel_boots' }, 'swing'],
  ['leather', { weapon: 'hunter_bow', helm: 'leather_cap', body: 'leather_body', gloves: 'leather_gloves', boots: 'leather_boots' }, 'bow'],
  ['iron chain', { weapon: 'apprentice_staff', helm: 'iron_medhelm', body: 'iron_chainbody', gloves: 'iron_gauntlets', boots: 'iron_boots' }, 'cast'],
  ['emberforged', { weapon: 'ember_longsword', helm: 'ember_fullhelm', body: 'ember_platebody', gloves: 'ember_gauntlets', boots: 'ember_boots' }, 'swing'],
];

/** Each enemy's attack, as its behaviour plays it (enemy.ts startAct). */
const ENEMY_ATTACK: Record<string, AttackKind> = { chaser: 'swing', kiter: 'throw', caster: 'cast' };

/** The wind-up's peak, where each attack reads best in a still. */
const MID_ATTACK: Record<AttackKind, number> = { swing: 0.36, bow: 0.4, cast: 0.4, throw: 0.36, slam: 0.4, bite: 0.4 };

/** Mid-strike, the sword arm swinging forward past the body. */
const IMPACT_FRAME = COMBAT_TUNING.impact;

/** Running speed for the walking captures (the stride at full swing). */
const WALK_SPEED = 5.6;

/** The hero in `set`, at `attack` of `kind`; with `walk`, mid-stride at that phase of it (PI / 2: right leg forward). */
function hero(set: Partial<Record<Slot, string>>, kind: AttackKind, attack: number, walk = 0) {
  const m = makeModel('hero');
  const holder = new THREE.Group();
  holder.add(m.root);
  const dresser = new HeroDresser(m);
  dresser.dress({ ...LOOK, hair: 1 }, Object.fromEntries(Object.entries(set).map(([s, id]) => [s, makeItem(id!)])));
  const bow = new BowDraw(m.root);
  bow.attach();
  const s: AnimState = { ...newAnimState(), attackKind: kind, attack, speed: walk ? WALK_SPEED : 0 };
  const rig = new Rig(m.root);
  rig.update(walk / (WALK_SPEED * rig.stride), s);
  bow.update(s, dresser.socket('sock_handL'));
  return holder;
}

function creature(model: string, kind: AttackKind, attack: number) {
  const m = makeModel(model);
  const holder = new THREE.Group();
  holder.add(m.root);
  new Rig(m.root).update(0, { ...newAnimState(), attackKind: kind, attack });
  return holder;
}

const FRONT = new THREE.Vector3(0, 0.25, 1);
const THREE_Q = new THREE.Vector3(-0.75, 0.4, 0.8);
const BACK_Q = new THREE.Vector3(0.7, 0.4, -0.8);

/**
 * Character redesign captures (explicit suite: `npm run inspect -- characters`): every redesigned character close up
 * (front and three-quarter, idle and at the peak of its attack, plus a back three-quarter), then the hero and the four
 * enemies together in the Foothills at the play camera, idle and mid-attack, at the default zoom and zoomed in.
 */
export async function charactersSuite(g: Game, shot: Shot) {
  document.body.classList.add('inspect-clean');
  const st = new Studio(g);
  const sheet = async (name: string, build: (attack: number) => THREE.Object3D, kind: AttackKind) => {
    const mid = MID_ATTACK[kind];
    const cells: Parameters<Studio['sheet']>[0] = [];
    const objs: THREE.Object3D[] = [];
    for (const [label, attack, dir] of [['front', -1, FRONT], ['3/4', -1, THREE_Q], ['back 3/4', -1, BACK_Q], ['front attack', mid, FRONT], ['3/4 attack', mid, THREE_Q], ['back attack', mid, BACK_Q]] as const) {
      // Frame on the idle pose so attack cells keep the same scale.
      const idle = build(-1);
      const cam = fit(idle, dir);
      const obj = attack < 0 ? idle : build(attack);
      cells.push({ label: `${name} · ${label}`, obj, ...cam });
      objs.push(obj);
    }
    st.sheet(cells, 3, 2);
    await shot(`char-${name.replace(/\s+/g, '_')}`);
    st.clear(objs);
  };
  for (const [label, set, kind] of HERO_SETS) await sheet(`hero ${label}`, (a) => hero(set, kind, a), kind);
  for (const id of ['goblin', 'kobold', 'cultist', 'cinder_priest']) {
    const def = ENEMIES[id];
    const kind = ENEMY_ATTACK[def.behavior];
    await sheet(id, (a) => {
      const o = creature(def.model, kind, a);
      o.scale.setScalar(def.scale);
      return o;
    }, kind);
  }
  await closeUps(st, shot);
  await handsAndElbows(st, shot);
  await playCamera(g, shot);
}

/** A town NPC as the game stands it (idle). */
function npc(model: string) {
  return creature(model, 'swing', -1);
}

/**
 * The LEGO hands and the elbows: the hands close up (empty, round a sword, a staff, in a gauntlet and a glove), the
 * bow drawn from four sides with the draw hand close up, the bow carried, the town NPCs and the raised poses.
 */
async function handsAndElbows(st: Studio, shot: Shot) {
  const cells: Parameters<Studio['sheet']>[0] = [];
  const add = (label: string, obj: THREE.Object3D, cam: { eye: THREE.Vector3; at: THREE.Vector3 }) => cells.push({ label, obj, ...cam });
  const flush = async (name: string, cols: number, rows: number) => {
    st.sheet(cells, cols, rows);
    await shot(name);
    st.clear(cells.map((c) => c.obj));
    cells.length = 0;
  };
  const front = new THREE.Vector3(0.15, 0.25, 1), three = new THREE.Vector3(0.8, 0.35, 0.7), threeR = new THREE.Vector3(-0.8, 0.35, 0.7);
  let h = hero({}, 'swing', -1);
  add('empty hand · front', h, near(h, 'handL', front, 0.95, -0.14));
  h = hero({}, 'swing', -1);
  add('empty hand · 3/4', h, near(h, 'handL', three, 0.95, -0.14));
  h = hero({ weapon: 'bronze_sword' }, 'swing', -1);
  add('sword hand', h, near(h, 'handR', threeR, 1.0, -0.12));
  h = hero({ weapon: 'apprentice_staff' }, 'cast', -1);
  add('staff hand', h, near(h, 'handR', threeR, 1.1, -0.05));
  h = hero({ weapon: 'steel_longsword', gloves: 'steel_gauntlets', body: 'steel_platebody' }, 'swing', -1);
  add('steel gauntlet', h, near(h, 'handR', threeR, 1.1, -0.12));
  h = hero({ weapon: 'bronze_sword', gloves: 'leather_gloves' }, 'swing', -1);
  add('leather glove', h, near(h, 'handR', threeR, 1.1, -0.12));
  await flush('char-hands', 3, 2);

  const draw = IMPACT_FRAME - 0.03;
  for (const [label, set] of [['bow', HERO_SETS[2][1]], ['leather bow', HERO_SETS[4][1]]] as const) {
    // Turned side-on for the shot, the hero faces world +X: the camera side is +X, the target +Z.
    for (const [view, dir] of [['side', new THREE.Vector3(1, 0.22, 0.12)], ['from the target', new THREE.Vector3(0.25, 0.2, 1)],
      ['from behind', new THREE.Vector3(0.3, 0.3, -1)], ['above', new THREE.Vector3(0.5, 1.2, 0.35)]] as const) {
      h = hero(set, 'bow', draw);
      add(`${label} drawn · ${view}`, h, fit(h, dir));
    }
    h = hero(set, 'bow', draw);
    add(`${label} · string through the draw hand`, h, near(h, 'sock_handL', new THREE.Vector3(0.75, 1, 0.45), 1.0));
    h = hero(set, 'bow', draw);
    add(`${label} · draw arm from above`, h, near(h, 'elbowL', new THREE.Vector3(0.45, 1, 0.2), 1.7));
    await flush(`char-bow-${label.replace(/\s+/g, '_')}`, 3, 2);
  }

  // The bow carried plumb and out from the body, standing and mid-stride, its limbs clear of the legs.
  const sideOn = new THREE.Vector3(-1, 0.15, 0.05), behind = new THREE.Vector3(0.35, 0.8, -1);
  for (const [label, set] of [['bow', HERO_SETS[2][1]], ['leather bow', HERO_SETS[4][1]]] as const) {
    h = hero(set, 'bow', -1);
    add(`${label} carried · front`, h, fit(h, FRONT));
    h = hero(set, 'bow', -1, Math.PI / 2);
    add(`${label} walking · side`, h, fit(h, sideOn));
    h = hero(set, 'bow', -1, Math.PI / 2);
    add(`${label} walking · from behind`, h, fit(h, behind));
  }
  await flush('char-bow-carry', 3, 2);

  for (const id of ['warden', 'quartermaster']) {
    for (const [view, dir] of [['front', FRONT], ['3/4', THREE_Q], ['back 3/4', BACK_Q]] as const) {
      const o = npc(id);
      add(`${id} · ${view}`, o, fit(o, dir));
    }
  }
  await flush('char-npcs', 3, 2);

  // The raised poses framed whole (the sheets above frame every cell on the idle pose).
  const side = new THREE.Vector3(-1, 0.15, 0.05);
  for (const [view, dir] of [['front', FRONT], ['3/4', THREE_Q], ['side', side]] as const) {
    h = hero(HERO_SETS[0][1], 'swing', MID_ATTACK.swing);
    add(`sword raised · ${view}`, h, fit(h, dir));
  }
  for (const [view, dir] of [['front', FRONT], ['3/4', THREE_Q]] as const) {
    const o = creature('cultist', 'cast', IMPACT_FRAME);
    add(`cultist casting · ${view}`, o, fit(o, dir));
  }
  const gob = creature('goblin', 'swing', MID_ATTACK.swing);
  add('goblin club raised · 3/4', gob, fit(gob, THREE_Q));
  await flush('char-raised', 3, 2);
}

/** A camera `dist` from the named part (world centre), looking at it from `dir`. */
function near(root: THREE.Object3D, part: string, dir: THREE.Vector3, dist: number, lift = 0) {
  root.updateMatrixWorld(true);
  const at = root.getObjectByName(part)!.getWorldPosition(new THREE.Vector3());
  at.y += lift;
  return { eye: at.clone().add(dir.clone().normalize().multiplyScalar(dist)), at };
}

/**
 * Close-ups the owner judges hands and hoods from: the hero's fist round the sword at rest and raised, the cultist's
 * hood and its fist round the staff (at rest and in the cast), and all five from the side mid-attack, where an arm
 * cutting into the body would show.
 */
async function closeUps(st: Studio, shot: Shot) {
  const sword = HERO_SETS[0][1];
  const cells: Parameters<Studio['sheet']>[0] = [];
  const add = (label: string, obj: THREE.Object3D, cam: { eye: THREE.Vector3; at: THREE.Vector3 }) => cells.push({ label, obj, ...cam });
  const flush = async (name: string, cols: number, rows: number) => {
    st.sheet(cells, cols, rows);
    await shot(name);
    st.clear(cells.map((c) => c.obj));
    cells.length = 0;
  };
  let h = hero(sword, 'swing', -1);
  add('sword hand · 3/4', h, near(h, 'sock_handR', new THREE.Vector3(-0.8, 0.35, 0.7), 1.3));
  h = hero(sword, 'swing', -1);
  add('sword hand · front', h, near(h, 'sock_handR', new THREE.Vector3(-0.15, 0.2, 1), 1.3));
  h = hero(sword, 'swing', MID_ATTACK.swing);
  add('raised · 3/4', h, near(h, 'sock_handR', new THREE.Vector3(-0.75, 0.25, 0.8), 1.4, -0.1));
  h = hero(sword, 'swing', MID_ATTACK.swing);
  add('raised · front', h, near(h, 'sock_handR', new THREE.Vector3(-0.1, 0.1, 1), 1.4, -0.1));
  await flush('char-close-hero-hands', 2, 2);

  let c = creature('cultist', 'cast', -1);
  add('cultist hood · front', c, near(c, 'head', new THREE.Vector3(0, 0.15, 1), 1.9, 0.3));
  c = creature('cultist', 'cast', -1);
  add('cultist hood · side', c, near(c, 'head', new THREE.Vector3(1, 0.15, 0.1), 2.2, 0.3));
  c = creature('cultist', 'cast', -1);
  add('staff grip · 3/4', c, near(c, 'sock_handR', new THREE.Vector3(-0.8, 0.3, 0.7), 1.5, 0.15));
  c = creature('cultist', 'cast', MID_ATTACK.cast);
  add('staff grip · cast', c, near(c, 'sock_handR', new THREE.Vector3(-0.8, 0.2, 0.7), 1.3));
  await flush('char-close-cultist', 2, 2);

  // From each one's right side (the attacking arm's side), mid-attack: the arm swings past the body's side.
  const side = new THREE.Vector3(-1, 0.12, 0.08);
  for (const [label, set] of [HERO_SETS[0], HERO_SETS[3]]) {
    h = hero(set, 'swing', IMPACT_FRAME);
    add(`hero ${label} · strike`, h, fit(h, side));
  }
  for (const id of ['goblin', 'kobold', 'cultist', 'cinder_priest']) {
    const def = ENEMIES[id];
    const kind = ENEMY_ATTACK[def.behavior];
    const o = creature(def.model, kind, MID_ATTACK[kind]);
    o.scale.setScalar(def.scale);
    add(`${id} · ${kind}`, o, fit(o, side));
  }
  await flush('char-side-attacks', 3, 2);
}

/** The hero and one of each enemy in a row in the Foothills, posed by hand (the simulation is held). */
async function playCamera(g: Game, shot: Shot) {
  g.travel('foothills', true);
  for (let i = 0; i < 15; i++) await new Promise<void>((r) => requestAnimationFrame(() => r()));
  // On the paved way into the cultists' shrine, clear of trees.
  const dais = g.zone.layout.props.find((p) => p.kind === 'ritual_dais')!;
  const spot = { x: dais.x + 10, z: dais.z + 2.6 };
  document.body.classList.add('inspect-clean');
  g.debug.hold = () => false;
  for (const e of g.zone.enemies) e.obj.removeFromParent();
  g.zone.enemies = [];
  const p = g.player;
  equip(g, { weapon: 'bronze_sword', helm: null, body: null, gloves: null, boots: null });
  p.pos.set(spot.x, 0, spot.z);
  p.stop();
  g.camPos.copy(p.pos);
  const row = ['goblin', 'kobold', 'cultist', 'cinder_priest'].map((id, i) => {
    const e = g.combat.spawnEnemy(id, spot.x - 3.3 + i * 2.2, spot.z - 2.6, null);
    e.pos.y = g.zone.nav.y(e.x, e.z);
    e.faceTo(p.x, p.z + 6, true);
    e.obj.rotation.y = e.facing;
    return e;
  });
  p.faceTo(p.x, p.z + 4, true);
  p.obj.rotation.y = p.facing;
  p.pos.y = g.zone.nav.y(p.x, p.z);
  const pose = (attack: number) => {
    for (const e of row) {
      const s = { ...newAnimState(), attackKind: ENEMY_ATTACK[e.def.behavior], attack: attack < 0 ? -1 : MID_ATTACK[ENEMY_ATTACK[e.def.behavior]] };
      e.rig.update(0, s);
    }
    p.rig.update(0, { ...newAnimState(), attackKind: 'swing', attack: attack < 0 ? -1 : MID_ATTACK.swing });
  };
  for (const [zoom, tag] of [[1, 'default'], [0.65, 'near'], [0.4, 'close']] as const) {
    g.camZoom = zoom;
    g.camPos.copy(p.pos);
    for (const [attack, label] of [[-1, 'idle'], [0.5, 'attack']] as const) {
      pose(attack);
      g['updateCamera'](0);
      await shot(`char-playcam-${tag}-${label}`);
    }
  }
  g.camZoom = 1;
  document.body.classList.remove('inspect-clean');
  for (const e of row) e.obj.removeFromParent();
  g.zone.enemies = [];
  g.debug.hold = null;
}
