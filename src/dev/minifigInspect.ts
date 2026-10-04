import * as THREE from 'three';
import type { Game } from '../game';
import { makeItem } from '../loot/itemGen';
import { Rig, newAnimState, type AnimState, type AttackKind } from '../render/anim';
import { HeroDresser, makeModel } from '../render/registry';
import { Studio, equip } from './inspect';

type Shot = (n: string) => Promise<void>;

/** Running speed for the walking captures (the stride at full swing). */
const WALK_SPEED = 5.6;
/** The peak of each wind-up, where an attack reads best in a still. */
const MID: Record<AttackKind, number> = { swing: 0.36, bow: 0.4, cast: 0.4, throw: 0.36, slam: 0.4, bite: 0.4 };

interface Pose { attack: number; walk?: number }

/** Each figure's own attack (enemy.ts: the goblin swings his club, the cultist casts). */
const ATTACK: Record<string, AttackKind> = { hero: 'swing', goblin: 'swing', cultist: 'cast' };

/** A model posed as the game poses it: idle, at `attack` of its attack, or mid-stride (walk = the stride's phase). */
function posed(model: string, p: Pose) {
  const m = makeModel(model);
  const holder = new THREE.Group();
  holder.add(m.root);
  if (model === 'hero') new HeroDresser(m).dress({ name: '', skin: 1, hair: 1, hairColor: 1, beard: 0, cloth: 0, cloth2: 5 }, { weapon: makeItem('bronze_sword') });
  const s: AnimState = { ...newAnimState(), attackKind: ATTACK[model], attack: p.attack, speed: p.walk ? WALK_SPEED : 0 };
  const rig = new Rig(m.root);
  rig.update(p.walk ? p.walk / (WALK_SPEED * rig.stride) : 0, s);
  return holder;
}

/** Camera directions round a figure facing +Z: '3-4' from its front left, as the concept sheets are drawn; 'side' from
 * its left, 'right' from its right. */
const DIRS: Record<string, THREE.Vector3> = {
  front: new THREE.Vector3(0, 0.12, 1), '3-4': new THREE.Vector3(0.8, 0.3, 0.75), side: new THREE.Vector3(1, 0.1, 0.02),
  right: new THREE.Vector3(-1, 0.1, 0.02), back: new THREE.Vector3(-0.05, 0.15, -1), 'back-3-4': new THREE.Vector3(-0.75, 0.3, -0.8),
  above: new THREE.Vector3(0.55, 1.25, 0.75),
};

interface Cell { obj: THREE.Object3D; dir: THREE.Vector3; at: number; dist: number }

/**
 * Cells rendered side by side into one capture, each with its own camera and no labels (the owner's sheets are made
 * from these), every figure framed on a fixed height so like is compared with like.
 */
async function row(g: Game, st: Studio, shot: Shot, name: string, cells: Cell[]) {
  const r = g.renderer;
  const W = 1600, H = 900, cw = Math.floor(W / cells.length);
  for (const c of cells) st.scene.add(c.obj);
  g.debug.hold = () => {
    r.setScissorTest(true);
    cells.forEach((c, i) => {
      r.setViewport(i * cw, 0, cw, H);
      r.setScissor(i * cw, 0, cw, H);
      st.cam.aspect = cw / H;
      st.cam.updateProjectionMatrix();
      const at = new THREE.Vector3(0, c.at, 0);
      st.cam.position.copy(at).addScaledVector(c.dir.clone().normalize(), c.dist);
      st.cam.lookAt(at);
      for (const o of cells) o.obj.visible = o === c;
      r.render(st.scene, st.cam);
    });
    r.setScissorTest(false);
    r.setViewport(0, 0, W, H);
    return true;
  };
  await shot(name);
  for (const c of cells) c.obj.removeFromParent();
  g.debug.hold = null;
}

/**
 * The minifigure body (explicit suite: `npm run inspect -- minifig`; `minifig:<tag>` names the captures for a run on
 * other models, e.g. the ones they replace): the hero, the goblin and the cultist in a row at one scale, front and
 * three-quarter; each of them close from the front, three-quarter, side, back and above, idle, at the peak of their
 * attacks and mid-stride; the cultist's hood and the goblin's strap and pad close up; and the three at the play camera.
 * Three cells to a capture, labelled by the capture's name.
 */
export async function minifigSuite(g: Game, shot: Shot, tag: string) {
  document.body.classList.add('inspect-clean');
  const st = new Studio(g);
  const pre = `mf${tag ? '-' + tag : ''}`;
  const idle: Pose = { attack: -1 };
  const shared = { at: 1.5, dist: 5.8 };
  for (const dir of ['front', '3-4']) {
    await row(g, st, shot, `${pre}-lineup-${dir}`, ['hero', 'goblin', 'cultist'].map((who) => ({ obj: posed(who, idle), dir: DIRS[dir], ...shared })));
  }
  // Close on each figure; a little further back for the attacks, so the raised club or staff stays in the picture.
  const close: Record<string, { at: number; dist: number }> = {
    hero: { at: 1.1, dist: 4.4 }, goblin: { at: 0.92, dist: 3.9 }, cultist: { at: 1.4, dist: 5.4 },
  };
  const raised: Record<string, { at: number; dist: number }> = {
    hero: { at: 1.35, dist: 5.2 }, goblin: { at: 1.2, dist: 4.9 }, cultist: { at: 1.65, dist: 6.2 },
  };
  for (const who of ['goblin', 'cultist', 'hero']) {
    const cell = (dir: string, p: Pose, f = close[who]): Cell => ({ obj: posed(who, p), dir: DIRS[dir], ...f });
    const attack: Pose = { attack: MID[ATTACK[who]] }, walk: Pose = { attack: -1, walk: Math.PI / 2 };
    await row(g, st, shot, `${pre}-${who}-idle`, [cell('front', idle), cell('3-4', idle), cell('side', idle)]);
    await row(g, st, shot, `${pre}-${who}-round`, [cell('back', idle), cell('back-3-4', idle), cell('right', idle)]);
    await row(g, st, shot, `${pre}-${who}-attack`, [cell('front', attack, raised[who]), cell('3-4', attack, raised[who]), cell('side', attack, raised[who])]);
    await row(g, st, shot, `${pre}-${who}-walk`, [cell('front', walk), cell('3-4', walk), cell('above', idle)]);
  }
  // Close up: the cultist's hood from the front, three-quarter and side; the goblin's strap and pad.
  const hood = (dir: string): Cell => ({ obj: posed('cultist', idle), dir: DIRS[dir], at: 1.98, dist: 2.4 });
  await row(g, st, shot, `${pre}-hood`, [hood('front'), hood('3-4'), hood('side')]);
  const strap = (dir: string): Cell => ({ obj: posed('goblin', idle), dir: DIRS[dir], at: 1.2, dist: 2.4 });
  await row(g, st, shot, `${pre}-strap`, [strap('front'), strap('side'), strap('back-3-4')]);
  await playCamera(g, shot, pre);
  document.body.classList.remove('inspect-clean');
}

/** The hero, the goblin and the cultist side by side in the Foothills at the play camera (the simulation held). */
async function playCamera(g: Game, shot: Shot, pre: string) {
  g.travel('foothills', true);
  for (let i = 0; i < 15; i++) await new Promise<void>((r) => requestAnimationFrame(() => r()));
  const dais = g.zone.layout.props.find((p) => p.kind === 'ritual_dais')!;
  const spot = { x: dais.x + 10, z: dais.z + 2.6 };
  g.debug.hold = () => false;
  for (const e of g.zone.enemies) e.obj.removeFromParent();
  g.zone.enemies = [];
  const p = g.player;
  equip(g, { weapon: 'bronze_sword', helm: null, body: null, gloves: null, boots: null });
  p.pos.set(spot.x, 0, spot.z);
  p.stop();
  p.pos.y = g.zone.nav.y(p.x, p.z);
  const foes = ['goblin', 'cultist'].map((id, i) => {
    const e = g.combat.spawnEnemy(id, spot.x - 1.6 + i * 3.2, spot.z - 1.2, null);
    e.pos.y = g.zone.nav.y(e.x, e.z);
    e.faceTo(p.x, p.z + 6, true);
    e.obj.rotation.y = e.facing;
    return e;
  });
  p.faceTo(p.x, p.z + 4, true);
  p.obj.rotation.y = p.facing;
  const pose = (attack: boolean) => {
    for (const e of foes) {
      const kind = ATTACK[e.def.model] ?? 'swing';
      e.rig.update(0, { ...newAnimState(), attackKind: kind, attack: attack ? MID[kind] : -1 });
    }
    p.rig.update(0, { ...newAnimState(), attackKind: 'swing', attack: attack ? MID.swing : -1 });
  };
  for (const [zoom, z] of [[1, 'default'], [0.55, 'near']] as const) {
    g.camZoom = zoom;
    g.camPos.copy(p.pos);
    for (const attack of [false, true]) {
      pose(attack);
      g['updateCamera'](0);
      await shot(`${pre}-playcam-${z}-${attack ? 'attack' : 'idle'}`);
    }
  }
  g.camZoom = 1;
  for (const e of foes) e.obj.removeFromParent();
  g.zone.enemies = [];
  g.debug.hold = null;
}
