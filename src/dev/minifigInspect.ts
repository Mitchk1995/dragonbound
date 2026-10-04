import * as THREE from 'three';
import type { AttackKind } from '../render/anim';
import type { Game } from '../game';
import { MID_ATTACK, creature, hero, playCamera } from './charactersInspect';
import { Studio } from './inspect';

type Shot = (n: string) => Promise<void>;

interface Pose { attack: number; walk?: number; hurt?: number }

/** Each figure's own attack (enemy.ts: the goblin swings his club, the cultist casts). */
const ATTACK: Record<string, AttackKind> = { hero: 'swing', goblin: 'swing', cultist: 'cast' };

/** A figure posed as the game poses it: idle, at `attack` of its attack, mid-stride (walk = the stride's phase) or just
 * hit (a creature: hurt 0..1); the hero in his starting outfit with the bronze sword. */
const posed = (model: string, p: Pose) =>
  model === 'hero' ? hero({ weapon: 'bronze_sword' }, ATTACK.hero, p.attack, p.walk) : creature(model, ATTACK[model], p.attack, p.walk, p.hurt);

/** Camera directions round a figure facing +Z: '3-4' from its front left, as the concept sheets are drawn, 'right-3-4'
 * from its front right; 'side' from its left, 'right' from its right. */
const DIRS: Record<string, THREE.Vector3> = {
  front: new THREE.Vector3(0, 0.12, 1), '3-4': new THREE.Vector3(0.8, 0.3, 0.75), 'right-3-4': new THREE.Vector3(-0.8, 0.3, 0.75),
  side: new THREE.Vector3(1, 0.1, 0.02), right: new THREE.Vector3(-1, 0.1, 0.02), back: new THREE.Vector3(-0.05, 0.15, -1),
  'back-3-4': new THREE.Vector3(-0.75, 0.3, -0.8), above: new THREE.Vector3(0.55, 1.25, 0.75),
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
 * attacks and mid-stride; the cultist's collar close up all round, idle, mid-stride, casting and just hit; the goblin's
 * strap and pad close up; and the three at the play camera. Three cells to a capture, labelled by the capture's name.
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
    const attack: Pose = { attack: MID_ATTACK[ATTACK[who]] }, walk: Pose = { attack: -1, walk: Math.PI / 2 };
    await row(g, st, shot, `${pre}-${who}-idle`, [cell('front', idle), cell('3-4', idle), cell('side', idle)]);
    await row(g, st, shot, `${pre}-${who}-round`, [cell('back', idle), cell('back-3-4', idle), cell('right', idle)]);
    await row(g, st, shot, `${pre}-${who}-attack`, [cell('front', attack, raised[who]), cell('3-4', attack, raised[who]), cell('side', attack, raised[who])]);
    await row(g, st, shot, `${pre}-${who}-walk`, [cell('front', walk), cell('3-4', walk), cell('above', idle)]);
  }
  // Close up: the cultist's gold-edged collar all round, then mid-stride, casting (her staff arm is her right) and just
  // hit; the goblin's strap and pad.
  const collar = (dir: string, p = idle): Cell => ({ obj: posed('cultist', p), dir: DIRS[dir], at: 1.84, dist: 2.1 });
  await row(g, st, shot, `${pre}-collar`, [collar('front'), collar('3-4'), collar('back')]);
  await row(g, st, shot, `${pre}-collar-round`, [collar('side'), collar('above'), collar('back-3-4')]);
  await row(g, st, shot, `${pre}-collar-moving`, [collar('3-4', { attack: -1, walk: Math.PI / 2 }),
    collar('right-3-4', { attack: MID_ATTACK.cast }), collar('back-3-4', { attack: -1, hurt: 1 })]);
  const strap = (dir: string): Cell => ({ obj: posed('goblin', idle), dir: DIRS[dir], at: 1.2, dist: 2.4 });
  await row(g, st, shot, `${pre}-strap`, [strap('front'), strap('side'), strap('back-3-4')]);
  document.body.classList.remove('inspect-clean');
  await playCamera(g, shot, ['goblin', 'cultist'],
    { spacing: 3.2, back: 1.2, zooms: [[1, 'default'], [0.55, 'near']], name: (zoom, pose) => `${pre}-playcam-${zoom}-${pose}` });
}
