import * as THREE from 'three';
import { GroundItem } from '../entities/groundItem';
import { makeItem } from '../loot/itemGen';
import { Rig, newAnimState, type AttackKind } from '../render/anim';
import { HeroDresser, makeModel } from '../render/registry';
import type { Item, Slot } from '../types';
import { frames, type Probe } from './approvedProbe';
import { Studio, fit } from './inspect';

type Cell = Parameters<Studio['sheet']>[0][number];

/**
 * `approved:fit` (see approvedInspect.ts): the Steel Platebody's fit as worn (neck, arms) and dropped, and the bare
 * hand beside the glove models. Read-only: the shipped GLB, rig and dresser as the game uses them.
 */
export async function steelPlateFit(c: Probe) {
  const { g, ui, p, checks, next } = c;
  document.body.classList.add('inspect-clean');
  const st = new Studio(g);
  const LOOK = { name: '', skin: 1, hair: 2, hairColor: 1, beard: 0, cloth: 0, cloth2: 5 };
  const POSES: [string, { walk?: number; kind?: AttackKind; t?: number }][] = [
    ['idle', {}], ['walk f8', { walk: 8 }], ['walk f20', { walk: 20 }], ['swing 0.3', { kind: 'swing', t: 0.3 }],
    ['swing 0.55', { kind: 'swing', t: 0.55 }], ['slam 0.3', { kind: 'slam', t: 0.3 }], ['slam 0.55', { kind: 'slam', t: 0.55 }], ['cast 0.55', { kind: 'cast', t: 0.55 }],
  ];
  const hero = (pose: (typeof POSES)[number][1], helm: boolean) => {
    const m = makeModel('hero');
    const holder = new THREE.Group();
    holder.add(m.root);
    const gear: Partial<Record<Slot, Item>> = { body: makeItem('steel_platebody'), weapon: makeItem('steel_longsword') };
    if (helm) gear.helm = makeItem('steel_fullhelm');
    new HeroDresser(m).dress(LOOK, gear);
    const rig = new Rig(m.root);
    if (pose.walk !== undefined) {
      const s = { ...newAnimState(), speed: 5.6 };
      for (let f = 0; f <= pose.walk; f++) rig.update(1 / 60, s);
    } else rig.update(0, { ...newAnimState(), ...(pose.kind ? { attackKind: pose.kind, attack: pose.t! } : {}) });
    return holder;
  };
  const sheetOf = async (name: string, cells: Cell[], cols: number, rows: number) => {
    st.sheet(cells, cols, rows);
    await next(name);
    st.clear(cells.map((cell) => cell.obj));
  };
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  // The gameplay camera's pitch: (0, 21, 14) per zoom unit, looking at the player's waist.
  const gameDir = v(0, 21, 14).normalize();

  // Neck: the gorget against the bare head (beardless so the chin line shows), then under the full helm.
  const NECK: [string, THREE.Vector3][] = [['front', v(0, 1.78, 1.35)], ['side', v(1.35, 1.78, 0)], ['back', v(0, 1.78, -1.35)], ['3/4 top', v(-0.85, 2.45, 0.85)]];
  await sheetOf('fit-neck', [false, true].flatMap((helm) => NECK.map(([view, eye]): Cell => ({ label: `${helm ? 'full helm' : 'no helm'} · ${view}`, obj: hero({}, helm), eye, at: v(0, 1.7, 0) }))), 4, 2);
  await sheetOf('fit-neck-poses', POSES.map(([label, pose]): Cell => ({ label: `neck · ${label} · side`, obj: hero(pose, false), eye: v(1.5, 1.85, 0.25), at: v(0, 1.66, 0) })), 4, 2);
  // Arms against the cuirass: front, and from the gameplay camera's pitch.
  await sheetOf('fit-arms-front', POSES.map(([label, pose]): Cell => ({ label: `arms · ${label} · front`, obj: hero(pose, true), eye: v(0.25, 1.55, 4.2), at: v(0, 1.3, 0) })), 4, 2);
  await sheetOf('fit-arms-game', POSES.map(([label, pose]): Cell => ({ label: `arms · ${label} · game pitch`, obj: hero(pose, true), eye: v(0, 1.2, 0).addScaledVector(gameDir, 4.6), at: v(0, 1.2, 0) })), 4, 2);

  // Hands: the bare hero hand (a LEGO C, never a thumb) beside the glove models, idle, close on the left hand; nothing
  // else worn so the sleeves match.
  // Steel stands for the plate model bronze and iron share (gloves_p); Emberforged has its own (gloves_e).
  const HANDS: [string, Item | null][] = [['bare hand', null], ['Steel Gauntlets', makeItem('steel_gauntlets')], ['Emberforged Gauntlets', makeItem('ember_gauntlets')], ['Leather Gloves', makeItem('leather_gloves')]];
  const handed = (gloves: Item | null) => {
    const m = makeModel('hero');
    const holder = new THREE.Group();
    holder.add(m.root);
    new HeroDresser(m).dress(LOOK, gloves ? { gloves } : {});
    new Rig(m.root).update(0, newAnimState());
    holder.updateMatrixWorld(true);
    return { m, holder };
  };
  const hL = handed(null).m.root.getObjectByName('sock_handL')?.getWorldPosition(v(0, 0, 0)) ?? v(0.5, 0.75, 0);
  // Front (through the hole), outer side, 3/4 from the body side, from below, and close at the gameplay pitch.
  const HAND_VIEWS: [string, THREE.Vector3][] = [['front', v(0, 0.05, 0.95)], ['outer side', v(0.95, 0.05, 0)], ['body side 3/4', v(-0.45, 0.1, 0.8)], ['below', v(0.05, -0.55, 0.4)], ['game pitch', gameDir.clone().multiplyScalar(1.5)]];
  await sheetOf('fit-hands', HANDS.flatMap(([label, gloves]) => HAND_VIEWS.map(([view, off]): Cell => ({ label: `${label} · ${view}`, obj: handed(gloves).holder, eye: hL.clone().add(off), at: hL }))), 5, HANDS.length);

  const r3 = (x: number) => Math.round(x * 1000) / 1000;

  // Dropped: the real GroundItem (groundModel: the cuirass on sock_chest only), landed and turned square. Each view
  // is placed by `fit` on the dropped group's own bounds, in a 2×2 sheet: cells of a 4×1 sheet are too narrow
  // (aspect ~0.44) to hold it whole.
  const dropped = () => {
    const gi = new GroundItem({ ...makeItem('steel_platebody'), rarity: 'normal' }, 0, 0, 0, 0, 0);
    gi.update(1);
    gi.group.rotation.y = 0;
    gi.group.children[0].rotation.y = 0;
    gi.group.updateMatrixWorld(true);
    return gi.group;
  };
  const d0 = dropped();
  const dropBox = new THREE.Box3().setFromObject(d0);
  checks.drop = { scale: r3(d0.children[0].scale.x), min: dropBox.min.toArray().map(r3), max: dropBox.max.toArray().map(r3) };
  const DROP: [string, THREE.Vector3][] = [['front', v(0, 0.3, 1)], ['side', v(1, 0.3, 0)], ['game pitch', gameDir], ['top', v(0, 1, 0.02)]];
  await sheetOf('fit-drop', DROP.map(([view, dir]): Cell => {
    const obj = dropped();
    return { label: `dropped · ${view}`, obj, ...fit(obj, dir) };
  }), 2, 2);
  document.body.classList.remove('inspect-clean');

  // The same drop in the world, at the closest gameplay zoom. It lands 0.8 to the hero's side, which at the
  // gameplay pitch puts the hero over it, so the hero steps clear before the capture.
  await c.toKeep();
  ui.showTab('inventory');
  if (!g.save.inventory.some((it) => it?.base === 'steel_platebody' && !it.unique)) g.items.add(makeItem('steel_platebody'));
  const di = g.save.inventory.findIndex((it) => it?.base === 'steel_platebody' && !it.unique);
  if (di >= 0) {
    g.items.dropFromInventory(di);
    p.pos.x -= 1.4;
    p.stop();
    g.camZoom = 0.65;
    await frames(60);
    await next('fit-drop-world');
    g.camZoom = 1;
  }
}
