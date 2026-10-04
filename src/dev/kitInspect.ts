import * as THREE from 'three';
import type { Game } from '../game';
import type { KitBuild } from '../world/kit/build';
import { buildBakery, DOOR, H, HOUSE, STAIR, type Cut, standsIn } from '../world/kit/house';
import { OVEN, treadTop } from '../world/kit/houseInside';
import { CELL, COURSE, HERO_H, STEP } from '../world/kit/scale';
import { loadKitSurfaces } from '../world/kit/surfaces';
import { KitView } from '../world/kit/view';
import { OCCLUDE } from '../world/worldView';
import { houseColour, kitGallery, testLot } from './kitStreet';
import { equip, perf } from './inspect';

type Shot = (name: string) => Promise<void>;
type Free = (n: string, eye: THREE.Vector3, look: THREE.Vector3, fov?: number) => Promise<void>;

/**
 * The building kit's first house in the hub town's ground below the castle (explicit suite: `kit`;
 * `kit:gallery` adds every piece of the kit laid out; `kit:cycles` instead draws and frees streets
 * over and over, checking nothing is freed while drawn and nothing leaks, kitCycles.ts). The house
 * stands on a clear, level plot of the home island's meadow south of the castle rock, the hero beside
 * it: the play camera outside, a wide
 * view and two more angles, at the door at his eye height (in plate armour), inside both floors
 * through the play camera with the cut-away the game's buildings use, the stair, the oven's mouth,
 * close-ups of the stone, the timber and plaster, the roof and the chimney, and a street of sixteen
 * from above. Reports the frame cost with none, one and sixteen houses.
 */
export async function kitSuite(g: Game, shot: Shot, args: string[]) {
  if (args.includes('cycles')) return (await import('./kitCycles')).kitCycles(g);
  g.travel('keep', true);
  await new Promise((r) => setTimeout(r, 400));
  await loadKitSurfaces();
  document.body.classList.add('inspect-clean');
  g.debug.timeScale = 0;
  g.player.stop();
  // The starting outfit, bare-headed and empty-handed: his height against the stones is the scale.
  equip(g, { weapon: null, helm: null, body: null, gloves: null, boots: null });
  const out: Record<string, unknown> = {};

  // The plot: the house's grid corner (cell 0, 0) here, its foot on the lowest ground under it.
  const corner = new THREE.Vector2(89.6, 202.5);
  let lo = Infinity, hi = -Infinity;
  for (let x = -1; x <= 26; x++) for (let z = -1; z <= 21; z++) {
    const h = g.zone.view.floorAt(corner.x + x * CELL, corner.y + z * CELL);
    lo = Math.min(lo, h);
    hi = Math.max(hi, h);
  }
  out.ground = { lowest: +lo.toFixed(3), highest: +hi.toFixed(3) };
  const origin = new THREE.Vector3(corner.x, lo, corner.y);
  /** A grid point of the house (cells across, steps up) in the world. */
  const at = (x: number, y: number, z: number) => new THREE.Vector3(origin.x + x * CELL, origin.y + y * STEP, origin.z + z * CELL);

  const build = buildBakery();
  const view = new KitView(build);
  view.group.position.copy(origin);
  g.scene.add(view.group);
  const cut = (c: Cut) => view.setVisible((p) => standsIn(c, p.part, p.y, p.el.h));
  out.house = view.stats();

  // The hero stands where he is put (the game's own update would drop him to the meadow under the house).
  const hero = g.player;
  const stand = (p: THREE.Vector3, face: number) => {
    hero.pos.copy(p);
    hero.obj.position.copy(p);
    hero.facing = face;
    hero.obj.rotation.y = face;
    hero.obj.visible = true;
  };
  const onGround = () => (hero.pos.y = hero.obj.position.y = g.zone.view.floorAt(hero.pos.x, hero.pos.z));
  /** The play camera on the hero at `zoom`, held while captured (the game's update would move him). */
  const play = async (name: string, zoom: number) => {
    g.camZoom = zoom;
    const p = hero.pos;
    const pose = () => {
      g.camera.position.set(p.x, p.y + 21 * zoom, p.z + 14 * zoom);
      g.camera.lookAt(p.x, p.y + 1, p.z);
      OCCLUDE.uOccOn.value = 0;
    };
    g.debug.hold = () => {
      pose();
      g.draw();
      return true;
    };
    try {
      out[`perf-${name}`] = await perf(g, 30, () => { pose(); g.draw(); });
      await shot(`kit-${name}`);
    } finally {
      g.debug.hold = null;
    }
  };
  /** A free camera at `eye` looking at `look` (world), fog pushed back. */
  const free = async (name: string, eye: THREE.Vector3, look: THREE.Vector3, fov = 42) => {
    const fog = g.scene.fog as THREE.Fog, keep = { near: fog.near, far: fog.far, fov: g.camera.fov };
    g.debug.hold = () => {
      fog.near = 300;
      fog.far = 900;
      g.camera.fov = fov;
      g.camera.updateProjectionMatrix();
      g.camera.position.copy(eye);
      g.camera.lookAt(look);
      OCCLUDE.uOccOn.value = 0;
      g.draw();
      return true;
    };
    try {
      await shot(`kit-${name}`);
    } finally {
      g.debug.hold = null;
      Object.assign(fog, { near: keep.near, far: keep.far });
      g.camera.fov = keep.fov;
      g.camera.updateProjectionMatrix();
    }
  };
  /** The game's indoor light (sun softened, sky light raised), as it gives the buildings the hero is in. */
  const indoors = (on: boolean) => {
    if (on) Object.defineProperty(g.zone, 'indoors', { get: () => 1, configurable: true });
    else delete (g.zone as unknown as Record<string, unknown>).indoors;
  };

  try {
    out.hero = measureHero(g, stand, at(40, 0, 40));
    // Outside, through the play camera zoomed out: the hero on the grass by the house's east side.
    cut('none');
    view.setDoor('shut');
    stand(at(29.5, 0, 9), -0.6);
    onGround();
    await play('outside', 1.35);
    // The hero in the street before the steps, at the default zoom.
    stand(at(12.5, 0, 25), 0.35);
    onGround();
    await play('street', 1);
    // The whole house from across the street, the castle rock behind; from behind; the chimney's side.
    await free('wide', at(48, 120, 76), at(12.5, 30, 9), 40);
    await free('back', at(-30, 95, -40), at(12.5, 30, 9), 40);
    await free('east', at(66, 58, 28), at(20, 32, 9), 40);
    // At the door in plate armour: the hero on the top step, the doors open, seen at his eye height.
    equip(g, { weapon: 'steel_longsword', helm: 'steel_fullhelm', body: 'steel_platebody', gloves: 'steel_gauntlets', boots: 'steel_boots' });
    out.heroPlate = measureHero(g, stand, at(40, 0, 40));
    view.setDoor('open');
    stand(at(DOOR.x + DOOR.w / 2, H.plinth + 1, HOUSE.z1 + 0.6), Math.PI);
    await free('door', at(DOOR.x + 6.5, H.walk + 1.7 / STEP, HOUSE.z1 + 12), at(DOOR.x + DOOR.w / 2, H.walk + 1.3 / STEP, HOUSE.z1 - 0.5), 46);
    equip(g, { weapon: null, helm: null, body: null, gloves: null, boots: null });
    view.setDoor('shut');
    // Inside, through the play camera: the ground floor (the upper storey and the front lifted off),
    // then upstairs (the roof and the front above the window sills lifted off).
    indoors(true);
    cut('ground');
    stand(at(10, H.walk, 9), 0.6);
    await play('ground', 0.9);
    // The oven's mouth from the shop floor at his eye height.
    await free('oven', at(OVEN.x - 1.5, H.walk + 1.6 / STEP, 13.5), at(OVEN.x + 3, OVEN.floor + 2, OVEN.z1), 50);
    cut('upper');
    stand(at(9, H.upperWalk, 10), -0.4);
    await play('upper', 0.9);
    // The stair at his eye height, the roof lifted so daylight falls down the stairwell: from the landing at
    // its foot, the hero half way up; then from the top, looking down the flight at him.
    indoors(false);
    const sx = STAIR.foot + 6, eye = 1.65 / STEP;
    stand(at(sx + 0.5, treadTop(sx), (STAIR.z0 + STAIR.z1) / 2), Math.PI / 2);
    await free('stair', at(1.6, H.walk + eye, 3.2), at(sx + 2, treadTop(sx) + 7, 3), 64);
    await free('stair-top', at(STAIR.top + 2.5, H.upperWalk + eye, 3), at(sx - 1, treadTop(sx) + 4, 3), 62);
    cut('none');
    // Close up: the ground floor's corner and a shop window (plinth, quoins, sill, flat arch), an upper
    // window (its box, flowers, shutters, the timbers and plaster round it), the roof's verge, the chimney.
    hero.obj.visible = false;
    await free('close-stone', at(-4.5, 14, 27), at(3, 11, 17), 40);
    await free('close-timber', at(8, 36, 27), at(5, 34, 17.5), 40);
    await free('close-roof', at(-7, 62, 25), at(1, 54, 13), 40);
    await free('close-chimney', at(36, 76, 0), at(25.5, 64, 2), 40);
    hero.obj.visible = true;
    // A street of sixteen on the test lot: the frame cost and a view from above.
    view.group.visible = false;
    out.cost = await onTheLot(g, build, origin, stand, free);
    view.group.visible = true;
    if (args.includes('gallery')) {
      view.group.visible = false;
      await kitGallery(g, origin, free);
      view.group.visible = true;
    }
  } finally {
    indoors(false);
    view.dispose();
    document.body.classList.remove('inspect-clean');
    g.debug.timeScale = 1;
    g.travel('keep', true);
  }
  out.scale = { cell: CELL, step: STEP, course: COURSE, heroCourses: +(HERO_H / COURSE).toFixed(2) };
  return out;
}

/** The hero as the game draws him, measured: feet to the crown of his head (hair aside) and to the top of his hair, and across. */
function measureHero(g: Game, stand: (p: THREE.Vector3, face: number) => void, p: THREE.Vector3) {
  const hero = g.player;
  stand(p, 0);
  hero.obj.updateMatrixWorld(true);
  const head = hero.obj.getObjectByName('head')!, crown = new THREE.Box3(), all = new THREE.Box3().setFromObject(head);
  head.children.forEach((c) => { if (c instanceof THREE.Mesh) crown.expandByObject(c); });
  const body = new THREE.Box3().setFromObject(hero.obj);
  return { crown: +(crown.max.y - hero.pos.y).toFixed(3), top: +(all.max.y - hero.pos.y).toFixed(3), across: +(body.max.x - body.min.x).toFixed(3) };
}

/**
 * A street of sixteen on the test lot beside the island (kitStreet.ts): the frame cost at the play camera
 * over its middle street with the lot bare, one house on it, and all sixteen (medians of five
 * interleaved rounds of 24 frames each; CPU and GPU milliseconds; the paving shown in all three), then
 * the sixteen seen from above.
 */
async function onTheLot(g: Game, build: KitBuild, plot: THREE.Vector3, stand: (p: THREE.Vector3, face: number) => void, free: Free) {
  const { corner, copies, paving, middle } = testLot(g, plot);
  const views = { paving: new KitView(paving), street: new KitView(build, copies), house: new KitView(build, [copies[5]]) };
  views.street.recolor((p, k) => houseColour(p.color, k));
  for (const v of Object.values(views)) {
    v.group.position.copy(corner);
    g.scene.add(v.group);
  }
  const hero = corner.clone().add(middle), zoom = 1.35;
  stand(hero, 0);
  const pose = () => {
    g.camera.position.set(hero.x, hero.y + 21 * zoom, hero.z + 14 * zoom);
    g.camera.lookAt(hero.x, hero.y + 1, hero.z);
    OCCLUDE.uOccOn.value = 0;
    g.draw();
  };
  const runs: Record<'none' | 'house' | 'street', { cpu: number[]; gpu: number[] }> = { none: { cpu: [], gpu: [] }, house: { cpu: [], gpu: [] }, street: { cpu: [], gpu: [] } };
  const out: Record<string, unknown> = { houses: copies.length, houseDrawn: views.house.stats(), streetDrawn: views.street.stats(), pavingDrawn: views.paving.stats() };
  try {
    for (let round = 0; round < 5; round++) for (const k of ['none', 'house', 'street'] as const) {
      views.house.group.visible = k === 'house';
      views.street.group.visible = k === 'street';
      const p = await perf(g, 24, pose);
      runs[k].cpu.push(...(p.cpuRaw ?? []));
      runs[k].gpu.push(...(p.gpuRaw ?? []));
    }
    views.house.group.visible = false;
    views.street.group.visible = true;
    // From above the lot's west end, looking along both streets: in each, two rows face each other.
    const across = corner.clone().add(new THREE.Vector3(0, 0, 55.5 * CELL));
    await free('street16', across.clone().add(new THREE.Vector3(-26, 40, 0)), across.clone().add(new THREE.Vector3(middle.x + 4, 0, 0)), 55);
  } finally {
    for (const v of Object.values(views)) v.dispose();
  }
  const med = (x: number[]) => +x.slice().sort((a, b) => a - b)[Math.floor(x.length / 2)].toFixed(2);
  for (const [k, v] of Object.entries(runs)) out[k] = { cpu: med(v.cpu), gpu: v.gpu.length ? med(v.gpu) : null };
  return out;
}
