import * as THREE from 'three';
import type { Game } from '../game';
import { makeItem } from '../loot/itemGen';
import { BOW_SOCKET, Rig, newAnimState, type AnimState, type AttackKind } from '../render/anim';
import { makeModel } from '../render/registry';
import type { Slot } from '../types';

/**
 * Dev-only visual QA helpers (never bundled into production builds).
 * In the browser console:
 *   await __check('bow', 'worn_bow', 'bow', 0.58)          → 4-view contact sheet of a posed hero
 *   await __check('plate', 'iron_longsword', 'swing', 0.5, { body: 'steel_platebody', helm: 'steel_fullhelm' })
 *   __closeViews()
 */
export function installPoseCheck(g: Game) {
  const w = window as any;

  const pose = (weapon: string | null, kind: AttackKind, t: number, gear: Partial<Record<Slot, string | null>> = {}) => {
    g.save.equipment.weapon = weapon ? makeItem(weapon) : null;
    for (const [slot, id] of Object.entries(gear)) g.save.equipment[slot as Slot] = id ? makeItem(id) : null;
    g.prog.recomputeStats();
    g.dressHero();
    const p = g.player;
    p.pos.set(27.5, 0, 33.5);
    p.obj.rotation.y = 0;
    p.anim.attackKind = kind;
    p.anim.attack = t;
    p.anim.speed = 0;
    p.rig.update(0, p.anim);
    p.bow.update(p.anim, p.dresser.socket('sock_handL'));
  };

  const views: [string, [number, number, number]][] = [
    ['front (hero faces camera)', [0, 1.4, 4.2]],
    ["from hero's left", [4.2, 1.4, 0]],
    ["from hero's right", [-4.2, 1.4, 0]],
    ['game camera', [0, 12, 8]],
  ];

  w.__check = async (label: string, weapon: string | null, kind: AttackKind, t: number, gear?: Partial<Record<Slot, string | null>>) => {
    if (g.zone.def.id !== 'keep') g.travel('keep', true);
    const prevMode = g.mode;
    g.mode = 'create'; // stops gameplay updates while we pose
    pose(weapon, kind, t, gear);
    document.getElementById('hud')?.classList.add('hidden');
    const cam = g.camera, r = g.renderer, p = g.player;
    const shots: [string, string][] = [];
    for (const [name, [x, y, z]] of views) {
      cam.position.set(p.x + x, y, p.z + z);
      cam.lookAt(p.x, 1.1, p.z);
      cam.updateMatrixWorld();
      r.render(g.scene, cam);
      shots.push([name, r.domElement.toDataURL('image/jpeg', 0.85)]);
    }
    g.mode = prevMode === 'play' ? 'create' : prevMode;
    document.getElementById('views')?.remove();
    const ov = document.createElement('div');
    ov.id = 'views';
    ov.style.cssText = 'position:fixed;inset:0;z-index:999;background:#111;display:grid;grid-template-columns:1fr 1fr;gap:4px;padding:4px';
    for (const [n, u] of shots) {
      ov.insertAdjacentHTML('beforeend', `<div style="position:relative;overflow:hidden"><img src="${u}" style="width:100%;height:100%;object-fit:cover"><span style="position:absolute;left:6px;top:4px;color:#fff;font:14px sans-serif;background:#000a;padding:2px 6px">${label} · ${n}</span></div>`);
    }
    document.body.appendChild(ov);
  };

  /**
   * Pose any model (enemy, dragon, NPC) with an animation state at a given time and show a
   * 4-view sheet. Returns world-space facts: where named parts are relative to the model origin.
   *   await __checkUnit('cinderwing flying', 'cinderwing', { fly: 1, speed: 3 }, 0.3, ['body', 'wingL', 'wingR'])
   */
  let unitObj: THREE.Group | null = null;
  w.__checkUnit = async (label: string, model: string, anim: Partial<AnimState>, time: number, parts: string[] = []) => {
    if (g.zone.def.id !== 'keep') g.travel('keep', true);
    g.mode = 'create';
    g.player.obj.visible = false;
    unitObj?.removeFromParent();
    const m = makeModel(model);
    unitObj = new THREE.Group();
    unitObj.add(m.root);
    unitObj.position.set(27.5, 0, 33.5);
    g.scene.add(unitObj);
    const rig = new Rig(m.root);
    const st = { ...newAnimState(), ...anim };
    // Advance the rig to `time` seconds so cyclic motion (flaps, walk) is at a known phase.
    for (let t = 0; t < time; t += 1 / 60) rig.update(1 / 60, st);
    unitObj.updateMatrixWorld(true);
    const facts: Record<string, number[]> = {};
    for (const n of parts) {
      const o = m.root.getObjectByName(n);
      if (!o) continue;
      const box = new THREE.Box3().setFromObject(o);
      facts[n] = box.getCenter(new THREE.Vector3()).sub(unitObj.position).toArray().map((v) => +v.toFixed(2));
    }
    const cam = g.camera, r = g.renderer;
    const h = Math.max(2, m.height);
    const shots: [string, string][] = [];
    for (const [name, [x, y, z]] of views) {
      const k = h / 2;
      cam.position.set(unitObj.position.x + x * k, y * k * 0.7 + 0.5, unitObj.position.z + z * k);
      cam.lookAt(unitObj.position.x, h * 0.45, unitObj.position.z);
      cam.updateMatrixWorld();
      r.render(g.scene, cam);
      shots.push([name, r.domElement.toDataURL('image/jpeg', 0.85)]);
    }
    document.getElementById('views')?.remove();
    const ov = document.createElement('div');
    ov.id = 'views';
    ov.style.cssText = 'position:fixed;inset:0;z-index:999;background:#111;display:grid;grid-template-columns:1fr 1fr;gap:4px;padding:4px';
    for (const [n, u] of shots) ov.insertAdjacentHTML('beforeend', `<div style="position:relative;overflow:hidden"><img src="${u}" style="width:100%;height:100%;object-fit:cover"><span style="position:absolute;left:6px;top:4px;color:#fff;font:14px sans-serif;background:#000a;padding:2px 6px">${label} · ${n}</span></div>`);
    document.body.appendChild(ov);
    return facts;
  };
  w.__clearUnit = () => {
    unitObj?.removeFromParent();
    unitObj = null;
    g.player.obj.visible = true;
  };

  /** The live bow socket offset used by the rig (for tuning; same module instance as the game). */
  w.__BOW_SOCKET = BOW_SOCKET;

  w.__closeViews = () => document.getElementById('views')?.remove();

  /**
   * Numeric bow check through the shot. The hero faces +Z, so a correct bow has its string
   * behind the grip (smaller z), the arrow pointing +Z, and a tall, thin bounding box.
   */
  w.__bowReport = (weapon = 'worn_bow') => {
    const p = g.player;
    const rows: Record<string, unknown>[] = [];
    for (const t of [-1, 0.1, 0.3, 0.45, 0.52, 0.8]) {
      pose(weapon, 'bow', t);
      p.obj.updateMatrixWorld(true);
      let bowGroup: THREE.Object3D | undefined;
      p.obj.traverse((o) => {
        if (o.name === 'gear:sock_handR') bowGroup = o;
      });
      if (!bowGroup) return 'no bow attached';
      const box = new THREE.Box3();
      const meshes: THREE.Mesh[] = [];
      bowGroup.traverse((o) => {
        if (o instanceof THREE.Mesh && o.visible) meshes.push(o);
      });
      const centerOf = (m: THREE.Mesh) => new THREE.Box3().setFromObject(m).getCenter(new THREE.Vector3());
      const grip = meshes.find((m) => (m.material as THREE.Material).name === 'ROLE_leather');
      const arrow = bowGroup.getObjectByName('bow_arrow');
      const strings = meshes.filter((m) => m.name === 'bow_string');
      for (const m of meshes) if (!strings.includes(m) && !arrow?.getObjectById(m.id)) box.union(new THREE.Box3().setFromObject(m));
      if (box.isEmpty()) return 'bow meshes not found';
      const size = box.getSize(new THREE.Vector3());
      const gripC = grip ? centerOf(grip) : new THREE.Vector3();
      const stringMid = strings.length ? new THREE.Vector3().addVectors(centerOf(strings[0]), centerOf(strings[1])).multiplyScalar(0.5) : null;
      const hand = p.dresser.socket('sock_handL')!.getWorldPosition(new THREE.Vector3());
      let arrowDir: THREE.Vector3 | null = null;
      if (arrow?.visible) arrowDir = new THREE.Vector3(0, 1, 0).applyQuaternion(arrow.getWorldQuaternion(new THREE.Quaternion())).normalize();
      rows.push({
        t,
        bowUpright: size.y > 1.3 && size.y > size.x * 3 && size.y > size.z * 3,
        stringBehindGrip: stringMid ? +(stringMid.z - gripC.z).toFixed(2) : 'n/a',
        arrowVisible: !!arrow?.visible,
        arrowPointsForward: arrowDir ? +arrowDir.z.toFixed(2) : 'n/a',
        // String halves run tip → nock along their local +Y (unit height, scaled), so the nock is local (0,1,0).
        nockToHand: strings.length ? +strings[0].localToWorld(new THREE.Vector3(0, 1, 0)).distanceTo(hand).toFixed(2) : 'n/a',
      });
    }
    return rows;
  };

  /** Step the simulation manually (the pane may be throttled when hidden). */
  w.__step = (secs: number) => {
    for (let i = 0; i < Math.round(secs * 60); i++) g.update(1 / 60);
    g.renderer.render(g.scene, g.camera);
  };
}
