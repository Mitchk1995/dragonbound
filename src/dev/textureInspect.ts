import * as THREE from 'three';
import type { AttackKind } from '../render/anim';
import type { Game } from '../game';
import { makeItem } from '../loot/itemGen';
import { bakesSettled } from '../render/charBake';
import { HeroDresser, makeModel } from '../render/registry';
import { Rig, newAnimState } from '../render/anim';
import type { Slot } from '../types';
import { creature, hero } from './charactersInspect';
import { equip, perf, Studio } from './inspect';

type Shot = (n: string) => Promise<void>;
type Set = Partial<Record<Slot, string>>;

/** The hero in every tier he can wear (the textures' proof), with the weapon each is shown with. */
export const TIERS: [string, Set, AttackKind][] = [
  ['outfit', { weapon: 'bronze_sword' }, 'swing'],
  ['leather', { weapon: 'hunter_bow', helm: 'leather_cap', body: 'leather_body', gloves: 'leather_gloves', boots: 'leather_boots' }, 'bow'],
  ['chain', { weapon: 'iron_sword', helm: 'iron_medhelm', body: 'iron_chainbody', gloves: 'iron_gauntlets', boots: 'iron_boots' }, 'swing'],
  ['bronze', { weapon: 'bronze_longsword', helm: 'bronze_fullhelm', body: 'bronze_platebody', gloves: 'bronze_gauntlets', boots: 'bronze_boots' }, 'swing'],
  ['steel', { weapon: 'steel_longsword', helm: 'steel_fullhelm', body: 'steel_platebody', gloves: 'steel_gauntlets', boots: 'steel_boots' }, 'swing'],
  ['ember', { weapon: 'apprentice_staff', helm: 'ember_fullhelm', body: 'ember_platebody', gloves: 'ember_gauntlets', boots: 'ember_boots' }, 'cast'],
];

const DIRS: Record<string, THREE.Vector3> = {
  front: new THREE.Vector3(0, 0.15, 1), '3-4': new THREE.Vector3(0.8, 0.3, 0.75), back: new THREE.Vector3(-0.5, 0.25, -1),
  side: new THREE.Vector3(1, 0.12, 0.05), high: new THREE.Vector3(0.45, 1.1, 0.8),
};

interface Cell { obj: THREE.Object3D; eye: THREE.Vector3; at: THREE.Vector3 }

/** Cells side by side in one 1600 x 900 capture, no labels (the review sheets are made from these). */
async function row(g: Game, st: Studio, shot: Shot, name: string, cells: Cell[], rows = 1) {
  const r = g.renderer;
  const W = 1600, H = 900, cols = Math.ceil(cells.length / rows), cw = Math.floor(W / cols), ch = Math.floor(H / rows);
  for (const c of cells) st.scene.add(c.obj);
  g.debug.hold = () => {
    r.setScissorTest(true);
    cells.forEach((c, i) => {
      const x = (i % cols) * cw, y = H - (Math.floor(i / cols) + 1) * ch;
      r.setViewport(x, y, cw, ch);
      r.setScissor(x, y, cw, ch);
      st.cam.aspect = cw / ch;
      st.cam.updateProjectionMatrix();
      st.cam.position.copy(c.eye);
      st.cam.lookAt(c.at);
      for (const o of cells) o.obj.visible = o === c;
      r.render(st.scene, st.cam);
    });
    r.setScissorTest(false);
    r.setViewport(0, 0, W, H);
    return true;
  };
  await bakesSettled();
  await shot(name);
  for (const c of cells) c.obj.removeFromParent();
  g.debug.hold = null;
}

const view = (obj: THREE.Object3D, dir: string, at: number, dist: number, x = 0): Cell =>
  ({ obj, at: new THREE.Vector3(x, at, 0), eye: new THREE.Vector3(x, at, 0).addScaledVector(DIRS[dir].clone().normalize(), dist) });

/** A camera close on one part of a posed model. */
function on(obj: THREE.Object3D, part: string, dir: string, dist: number, lift = 0): Cell {
  obj.updateMatrixWorld(true);
  const at = obj.getObjectByName(part)!.getWorldPosition(new THREE.Vector3());
  at.y += lift;
  return { obj, at, eye: at.clone().addScaledVector(DIRS[dir].clone().normalize(), dist) };
}

const tier = (name: string) => TIERS.find((t) => t[0] === name)!;
const idleHero = (name: string) => hero(tier(name)[1], tier(name)[2], -1);

/**
 * The characters' textures (explicit suite: `npm run inspect -- chartex`): the hero in every tier and the goblin, close
 * from the front, three-quarter and back; each painted material close up on the part that wears it; and a crowd of
 * twenty at the play camera, with what the crowd costs a frame.
 */
export async function textureSuite(g: Game, shot: Shot) {
  document.body.classList.add('inspect-clean');
  const st = new Studio(g);
  await row(g, st, shot, 'ct-tiers', TIERS.map(([name]) => view(idleHero(name), '3-4', 1.15, 5.0)));
  for (const [name] of TIERS) {
    await row(g, st, shot, `ct-hero-${name}`, ['front', '3-4', 'back'].map((d) => view(idleHero(name), d, 1.1, 4.1)));
  }
  const gob = () => creature('goblin', 'swing', -1);
  await row(g, st, shot, 'ct-goblin', ['front', '3-4', 'back'].map((d) => view(gob(), d, 0.92, 3.5)));
  // Each material close up, where it is worn.
  await row(g, st, shot, 'ct-mat-a', [
    on(idleHero('outfit'), 'head', 'front', 1.15, 0.25),         // skin
    on(idleHero('outfit'), 'body', '3-4', 1.2, 0.45),            // wool tunic, leather belt and strap, gold buckle
    on(idleHero('outfit'), 'legL', 'front', 1.1, -0.35),         // linen trousers, leather boots
    on(idleHero('leather'), 'body', 'front', 1.3, 0.35),         // leather armour, stitching
    on(idleHero('chain'), 'body', '3-4', 1.3, 0.35),             // mail
    on(idleHero('steel'), 'body', '3-4', 1.4, 0.4),              // plate
  ], 2);
  await row(g, st, shot, 'ct-mat-b', [
    on(idleHero('ember'), 'body', '3-4', 1.4, 0.4),              // blackened plate
    on(idleHero('bronze'), 'head', '3-4', 1.1, 0.25),            // bronze helm
    on(hero({ ...tier('outfit')[1], weapon: 'oak_staff' }, 'cast', -1), 'handR', '3-4', 1.4, 0.5),   // wood
    on(hero({}, 'swing', -1), 'head', 'back', 1.2, 0.3),         // hair
    on(gob(), 'head', 'front', 1.2, 0.2),                        // goblin skin
    on(gob(), 'body', '3-4', 1.3, 0.3),                          // goblin leathers
  ], 2);
  document.body.classList.remove('inspect-clean');
  await crowd(g, shot);
}

/**
 * Twenty characters at the play camera (the player, nine heroes in every tier and ten goblins) in the Foothills, at the
 * default zoom and zoomed in, and the frame's cost: with the crowd and without it.
 */
async function crowd(g: Game, shot: Shot) {
  g.travel('foothills', true);
  for (let i = 0; i < 15; i++) await new Promise<void>((r) => requestAnimationFrame(() => r()));
  const dais = g.zone.layout.props.find((p) => p.kind === 'ritual_dais')!;
  // On the open paving east of the cultists' shrine, clear of the trees' shade.
  const spot = { x: dais.x + 15, z: dais.z + 2.6 };
  document.body.classList.add('inspect-clean');
  for (const e of g.zone.enemies) e.obj.removeFromParent();
  g.zone.enemies = [];
  const p = g.player;
  equip(g, tier('steel')[1]);
  p.pos.set(spot.x, g.zone.nav.y(spot.x, spot.z), spot.z);
  p.stop();
  p.faceTo(p.x, p.z + 4, true);
  p.obj.rotation.y = p.facing;
  g.camPos.copy(p.pos);
  const empty = await perf(g, 60);
  const heroes: THREE.Object3D[] = [];
  for (let i = 0; i < 9; i++) {
    const m = makeModel('hero');
    const [, set] = TIERS[i % TIERS.length];
    new HeroDresser(m).dress({ name: '', skin: i % 4, hair: 1 + (i % 4), hairColor: i % 5, beard: i % 3, cloth: i % 6, cloth2: (i + 3) % 8 },
      Object.fromEntries(Object.entries(set).map(([s, id]) => [s, makeItem(id!)])));
    new Rig(m.root).update(0, newAnimState());
    const x = spot.x + ((i % 5) - 2) * 1.5, z = spot.z + (i < 5 ? 1.6 : 3.1);
    m.root.position.set(x, g.zone.nav.y(x, z), z);
    g.scene.add(m.root);
    heroes.push(m.root);
  }
  const gobs = Array.from({ length: 10 }, (_, i) => {
    const x = spot.x + ((i % 5) - 2) * 1.5, z = spot.z - (i < 5 ? 1.8 : 3.3);
    const e = g.combat.spawnEnemy('goblin', x, z, null);
    e.pos.y = g.zone.nav.y(e.x, e.z);
    e.faceTo(p.x, p.z, true);
    e.obj.rotation.y = e.facing;
    return e;
  });
  g.debug.hold = () => false;
  for (const [zoom, tag] of [[1, 'default'], [0.55, 'near']] as const) {
    g.camZoom = zoom;
    g.camPos.copy(p.pos);
    g['updateCamera'](0);
    await bakesSettled();
    await shot(`ct-playcam-${tag}`);
  }
  g.camZoom = 1;
  g.debug.hold = null;
  const full = await perf(g, 60);
  const info = g.renderer.info.render as unknown as Record<string, number>;
  const api = window.electronAPI!.inspect!;
  void api.log(`chartex frame cost: empty ${JSON.stringify(empty)} crowd ${JSON.stringify(full)} draws ${JSON.stringify(info)}`);
  for (const h of heroes) h.removeFromParent();
  for (const e of gobs) e.obj.removeFromParent();
  g.zone.enemies = [];
  document.body.classList.remove('inspect-clean');
}
