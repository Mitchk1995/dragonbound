import * as THREE from 'three';
import type { Game } from '../game';
import { startAction } from '../ai/boss';
import { Rig, newAnimState, type AnimState } from '../render/anim';
import { makeModel } from '../render/registry';
import { Studio, fit } from './inspect';

/**
 * The drakeling and Cinderwing against their concept sheets (explicit suite: `dragons`): studio sheets of each from
 * the front, side and three-quarter, at rest and through their attacks and flight; head close-ups for the eyes;
 * close-ups of the paws, chest and tail; then both in the world through the gameplay camera, at rest and mid-attack.
 */
export async function dragonSuite(g: Game, shot: (n: string) => Promise<void>) {
  document.body.classList.add('inspect-clean');
  const st = new Studio(g);
  const posed = (name: string, a: Partial<AnimState>, secs: number) => {
    const m = makeModel(name);
    const holder = new THREE.Group();
    holder.add(m.root);
    // Every model starts its sway at the same moment (the rig would pick one at random), so the sheets repeat run to
    // run, and at rest the tail lies out behind toward the camera's side, as on the concept sheet.
    const random = Math.random;
    Math.random = () => 0.825;
    const rig = new Rig(m.root);
    Math.random = random;
    const s = { ...newAnimState(), ...a };
    rig.update(0, s);
    for (let t = 0; t < secs; t += 1 / 60) rig.update(1 / 60, s);
    holder.updateMatrixWorld(true);
    return holder;
  };
  const sheet = async (file: string, cells: { label: string; obj: THREE.Object3D; eye: THREE.Vector3; at: THREE.Vector3 }[], cols: number, rows: number) => {
    st.sheet(cells, cols, rows);
    await shot(file);
    st.clear(cells.map((c) => c.obj));
  };
  // The studio fit frames the bounding sphere; a long dragon fills far less of it, so come in closer.
  const near = (o: THREE.Object3D, d: THREE.Vector3, k = 0.66) => {
    const f = fit(o, d);
    f.eye.sub(f.at).multiplyScalar(k).add(f.at);
    return f;
  };
  const dirs: [string, THREE.Vector3][] = [
    ['front', new THREE.Vector3(0, 0.25, 1)], ['side', new THREE.Vector3(1, 0.2, 0)], ['3/4', new THREE.Vector3(-0.8, 0.45, 0.75)],
    ['game cam', new THREE.Vector3(-0.45, 1.5, 1)], ['back 3/4', new THREE.Vector3(0.8, 0.5, -0.8)], ['above', new THREE.Vector3(0, 1, 0.05)],
  ];
  const attack = (name: string): [string, Partial<AnimState>, number][] => [
    ['idle', {}, 0.6], ['walk', { speed: 3 }, 0.35], ['bite wind-up', { attackKind: 'bite', attack: 0.3 }, 0], ['bite', { attackKind: 'bite', attack: 0.6 }, 0],
    ...(name === 'cinderwing' ? [['tail slam', { attackKind: 'slam', attack: 0.55 }, 0], ['breath', { special: 0.6 }, 0]] as [string, Partial<AnimState>, number][] : [['hurt', { hurt: 1 }, 0], ['dead', { dead: 0.6 }, 0]] as [string, Partial<AnimState>, number][]),
    ['fly, downstroke', { fly: 1, speed: 3 }, 0.18], ['fly, upstroke', { fly: 1, speed: 3 }, 0.53],
  ];
  for (const name of ['drakeling', 'cinderwing']) {
    // Rest pose from six sides.
    await sheet(`dragon-${name}-views`, dirs.map(([label, d]) => {
      const obj = posed(name, {}, 0.6);
      return { label: `${name} · ${label}`, obj, ...near(obj, d) };
    }), 3, 2);
    // The concept sheet's two views, large: the left flank from the front quarter and from the back quarter.
    await sheet(`dragon-${name}-concept-angles`, [new THREE.Vector3(0.9, 0.3, 0.75), new THREE.Vector3(0.85, 0.32, -0.6)].map((d, i) => {
      const obj = posed(name, {}, 0.6);
      return { label: `${name} · ${i ? 'back 3/4' : '3/4'}`, obj, ...near(obj, d, 0.72) };
    }), 2, 1);
    // Animation.
    await sheet(`dragon-${name}-anims`, attack(name).map(([label, a, secs]) => {
      const obj = posed(name, a, secs);
      return { label: `${name} · ${label}`, obj, ...near(obj, new THREE.Vector3(0.8, 0.5, 0.8)) };
    }), 4, 2);
    await sheet(`dragon-${name}-anims-front`, attack(name).map(([label, a, secs]) => {
      const obj = posed(name, a, secs);
      return { label: `${name} · ${label}`, obj, ...near(obj, new THREE.Vector3(0.05, 0.3, 1)) };
    }), 4, 2);
    // The head close up: the eye from every side (it must read on the side only, under the brow).
    const head: [string, THREE.Vector3, Partial<AnimState>][] = [
      ['side', new THREE.Vector3(1, 0.05, 0.05), {}], ['front', new THREE.Vector3(0, 0.08, 1), {}], ['3/4 front', new THREE.Vector3(0.7, 0.2, 0.7), {}],
      ['game cam', new THREE.Vector3(0.5, 1.4, 0.9), {}], ['other side', new THREE.Vector3(-1, 0.15, -0.1), {}], ['above', new THREE.Vector3(0, 1, 0.2), {}],
      ['3/4 jaw open', new THREE.Vector3(-0.7, 0.2, 0.7), { attackKind: 'bite', attack: 0.4 }], ['back 3/4', new THREE.Vector3(0.6, 0.3, -0.7), {}],
    ];
    await sheet(`dragon-${name}-head`, head.map(([label, d, a]) => {
      const obj = posed(name, a, 0.6);
      const h = obj.getObjectByName('head')!;
      const box = new THREE.Box3().setFromObject(h);
      const c = box.getCenter(new THREE.Vector3());
      const r = box.getSize(new THREE.Vector3()).length() * 0.55;
      return { label: `${name} head · ${label}`, obj, eye: c.clone().add(d.clone().normalize().multiplyScalar(r * 2.6)), at: c };
    }), 4, 2);
    // Close-ups of the paws, the chest and the tail, at rest: points in a rig part's own frame, framed by the build scale.
    const close: [string, string, [number, number, number], THREE.Vector3, number][] = [
      ['paw · 3/4', 'legFL', [0, -0.6, 0.12], new THREE.Vector3(0.8, 0.35, 1), 1.3],
      ['paw · front', 'legFL', [0, -0.6, 0.12], new THREE.Vector3(0, 0.2, 1), 1.3],
      ['paw · side', 'legFL', [0, -0.6, 0.12], new THREE.Vector3(1, 0.15, 0), 1.3],
      ['hind paw · 3/4', 'legBL', [0, -0.55, 0.05], new THREE.Vector3(0.9, 0.3, 0.6), 1.5],
      ['chest · 3/4', 'body', [0, -0.1, 0.6], new THREE.Vector3(0.75, 0.25, 1), 2.6],
      ['chest · front', 'body', [0, -0.1, 0.6], new THREE.Vector3(0, 0.15, 1), 2.6],
      ['tail · side', 'tail4|tail2', [0, 0, 0], new THREE.Vector3(1, 0.2, -0.2), 5],
      ['tail · back 3/4', 'tail4|tail2', [0, 0, 0], new THREE.Vector3(0.8, 0.6, -0.9), 5],
    ];
    await sheet(`dragon-${name}-parts`, close.map(([label, part, p, d, dist]) => {
      const obj = posed(name, {}, 0.6);
      const k = obj.getObjectByName('body')!.getWorldScale(new THREE.Vector3()).x;
      // `a|b`: the first of those parts the model has (the drakeling's tail is shorter than Cinderwing's).
      const node = part.split('|').map((n) => obj.getObjectByName(n)).find((o) => o)!;
      const at = node.localToWorld(new THREE.Vector3(...p));
      return { label: `${name} · ${label}`, obj, eye: at.clone().add(d.clone().normalize().multiplyScalar(dist * k)), at };
    }), 4, 2);
  }

  // In the world, through the gameplay camera: a drakeling pack in the Foothills scorch, then Cinderwing in its lair.
  const step = (secs: number) => {
    for (let i = 0; i < Math.round(secs * 60); i++) g.update(1 / 60);
  };
  g.debug.god = true;
  g.travel('foothills', true);
  await frames(20);
  // The biggest drakeling pack (out on the open scorch), the others near it moved away, the drakes facing the hero.
  const count = (c: string[]) => c.filter((id) => id === 'drakeling').length;
  const pack = [...g.zone.layout.packs].sort((a, b) => count(b.comp) - count(a.comp))[0];
  const p = g.player;
  p.pos.set(pack.x, 0, pack.z + 6);
  p.stop();
  g.camPos.copy(p.pos);
  for (const e of g.zone.enemies) {
    if (Math.hypot(e.pos.x - pack.x, e.pos.z - pack.z) > 16) continue;
    if (e.def.id !== 'drakeling') e.pos.set(-500, 0, -500);
    else e.faceTo(p.x, p.z, true);
  }
  g.debug.timeScale = 0;
  g.update(0);
  for (const zoom of [1, 0.6]) {
    g.camZoom = zoom;
    g.update(0);
    await shot(`dragon-world-drakeling-rest-zoom${zoom}`);
  }
  g.debug.timeScale = 1;
  g.debug.hold = () => false;
  for (let k = 0; k < 3; k++) {
    step(0.9);
    await shot(`dragon-world-drakeling-fight-${k}`);
  }
  g.debug.hold = null;
  g.camZoom = 1;

  g.travel('lair', true);
  await frames(15);
  const L = g.zone.layout;
  const boss = g.zone.enemies.find((e) => e.def.behavior === 'boss')!;
  g.debug.hold = () => false;
  const reset = () => {
    p.pos.set(L.boss!.x + 2, 0, L.boss!.z + 7);
    p.stop();
    g.camPos.copy(p.pos);
    boss.pos.set(L.boss!.x, 0, L.boss!.z);
    boss.faceTo(p.x, p.z, true);
    for (const t of g.zone.telegraphs) t.done = true;
    g.zone.hazards = [];
    step(0.05);
  };
  g.camZoom = 1.35;
  reset();
  await shot('dragon-world-cinderwing-rest');
  step(0.5);
  const b = boss.boss!;
  for (const [kind, times] of [['bite', [0.4]], ['gust', [0.7]], ['tail', [0.7]], ['flight', [1.2, 1.5]]] as const) {
    reset();
    b.action = null;
    b.actionCd = 99;
    if (kind === 'flight') b.phase = 2;
    startAction(boss, b, kind, g);
    let at = 0;
    for (const time of times) {
      step(time - at);
      at = time;
      await shot(`dragon-world-cinderwing-${kind}-${time}s`);
    }
    step(2);
  }
  g.debug.hold = null;
  g.camZoom = 1;
  document.body.classList.remove('inspect-clean');
}

const frames = async (n: number) => {
  for (let i = 0; i < n; i++) await new Promise<void>((r) => requestAnimationFrame(() => r()));
};
