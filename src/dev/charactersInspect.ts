import * as THREE from 'three';
import { ENEMIES } from '../data/enemies';
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

function hero(set: Partial<Record<Slot, string>>, kind: AttackKind, attack: number) {
  const m = makeModel('hero');
  const holder = new THREE.Group();
  holder.add(m.root);
  const dresser = new HeroDresser(m);
  dresser.dress({ ...LOOK, hair: 1 }, Object.fromEntries(Object.entries(set).map(([s, id]) => [s, makeItem(id!)])));
  const bow = new BowDraw(m.root);
  bow.attach();
  const s: AnimState = { ...newAnimState(), attackKind: kind, attack };
  new Rig(m.root).update(0, s);
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
  await playCamera(g, shot);
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
