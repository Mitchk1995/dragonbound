import * as THREE from 'three';
import type { Game } from '../game';
import { BrickBuild } from '../world/brick/build';
import { ELEMENTS } from '../world/brick/elements';
import { BRICK_COLORS } from '../world/brick/palette';
import { buildTownhouse, DOOR, H, HOUSE, standsIn, STAIR, type Cut } from '../world/brick/house';
import { treadTop } from '../world/brick/houseInside';
import { BRICK, HERO_H, PLATE, STUD } from '../world/brick/scale';
import { BrickView } from '../world/brick/view';
import { OCCLUDE } from '../world/worldView';
import { equip, perf } from './inspect';

type Shot = (name: string) => Promise<void>;

/**
 * The brick kit's first house in the hub town's ground below the castle (explicit suite: `brick`;
 * `brick:gallery` adds every element of the kit laid out; `brick:town` measures a street of them).
 * The house stands on a clear, level plot of the home island's meadow south of the castle rock, the
 * hero beside it: the play camera outside, a wide view, at the door at his eye height, inside both
 * floors through the play camera with the cut-away the game's buildings use, the stair at his eye
 * height, and close-ups of the bricks. Reports the frame cost with and without it.
 */
export async function brickSuite(g: Game, shot: Shot, args: string[]) {
  g.travel('keep', true);
  await new Promise((r) => setTimeout(r, 400));
  document.body.classList.add('inspect-clean');
  g.debug.timeScale = 0;
  g.player.stop();
  // The starting outfit, bare-headed and empty-handed: his height against the bricks is the scale.
  equip(g, { weapon: null, helm: null, body: null, gloves: null, boots: null });
  const out: Record<string, unknown> = {};

  // The plot: the house's grid corner (stud 0, 0) here, its foot on the lowest ground under it.
  const corner = new THREE.Vector2(89.6, 202.5);
  let lo = Infinity, hi = -Infinity;
  for (let x = -1; x <= 25; x++) for (let z = -1; z <= 22; z++) {
    const h = g.zone.view.floorAt(corner.x + x * STUD, corner.y + z * STUD);
    lo = Math.min(lo, h);
    hi = Math.max(hi, h);
  }
  out.ground = { lowest: +lo.toFixed(3), highest: +hi.toFixed(3) };
  const origin = new THREE.Vector3(corner.x, lo, corner.y);
  /** A grid point of the house (studs across, plates up) in the world. */
  const at = (x: number, y: number, z: number) => new THREE.Vector3(origin.x + x * STUD, origin.y + y * PLATE, origin.z + z * STUD);

  const build = buildTownhouse();
  const view = new BrickView(build);
  view.group.position.copy(origin);
  g.scene.add(view.group);
  const cut = (c: Cut) => view.setVisible((p) => standsIn(c, p.part, p.y, p.el.h));
  out.house = { ...view.stats(), studs: view.stats().studs };

  // The hero stands where he is put (the game's own update would drop him to the meadow under the house).
  const hero = g.player;
  const stand = (p: THREE.Vector3, face: number) => {
    hero.pos.copy(p);
    hero.obj.position.copy(p);
    hero.facing = face;
    hero.obj.rotation.y = face;
    hero.obj.visible = true;
  };
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
      out[`perf-${name}`] = await perf(g, 40, () => { pose(); g.draw(); });
      await shot(`brick-${name}`);
    } finally {
      g.debug.hold = null;
    }
  };
  /** A free camera at `eye` looking at `look` (world), fog pushed back. */
  const free = async (name: string, eye: THREE.Vector3, look: THREE.Vector3, fov = 42) => {
    const fog = g.scene.fog as THREE.Fog, keep = { near: fog.near, far: fog.far, fov: g.camera.fov };
    g.debug.hold = () => {
      fog.near = 300;
      fog.far = 700;
      g.camera.fov = fov;
      g.camera.updateProjectionMatrix();
      g.camera.position.copy(eye);
      g.camera.lookAt(look);
      OCCLUDE.uOccOn.value = 0;
      g.draw();
      return true;
    };
    try {
      await shot(`brick-${name}`);
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
    // The hero as the game draws him, measured: feet to the crown of his head (the head cube, hair
    // aside) and to the top of his hair, and across his shoulders.
    stand(at(30, 0, 30), 0);
    hero.obj.updateMatrixWorld(true);
    const head = hero.obj.getObjectByName('head')!, crown = new THREE.Box3(), all = new THREE.Box3().setFromObject(head);
    head.children.forEach((c) => { if (c instanceof THREE.Mesh) crown.expandByObject(c); });
    const body = new THREE.Box3().setFromObject(hero.obj.getObjectByName('body')!);
    out.hero = { crown: +(crown.max.y - hero.pos.y).toFixed(3), hair: +(all.max.y - hero.pos.y).toFixed(3), shoulders: +(body.max.x - body.min.x).toFixed(3), bricks: +((crown.max.y - hero.pos.y) / BRICK).toFixed(2) };
    // Outside, through the play camera zoomed out: the hero on the grass by the house's east side, so
    // the whole house is in view (from the street in front of it, the roof runs off the top).
    cut('none');
    view.setDoor('shut');
    stand(at(28.5, 0, 8), -0.6);
    hero.pos.y = hero.obj.position.y = g.zone.view.floorAt(hero.pos.x, hero.pos.z);
    await play('outside', 1.35);
    // The frame cost the house adds there, and a street of sixteen of them: each measured in turns
    // (none, one, sixteen) five times over, so the machine's other work falls on all three alike.
    out.cost = await costs(g, build, origin, view, hero.pos.clone(), 1.35);
    // The hero in the street before the steps, at the default zoom.
    stand(at(12, 0, 24), 0.35);
    hero.pos.y = hero.obj.position.y = g.zone.view.floorAt(hero.pos.x, hero.pos.z);
    await play('street', 1);
    // The whole house from across the street, the castle rock behind; from behind; the chimney's side.
    const wideEye = at(46, 120, 74), wideAt = at(12, 26, 8);
    await free('wide', wideEye, wideAt, 40);
    // (The same in grey stone, for comparison with the castle's cream.)
    const grey: Record<number, number> = { [BRICK_COLORS.tan]: BRICK_COLORS.lightGrey, [BRICK_COLORS.darkTan]: BRICK_COLORS.darkGrey };
    view.recolor((p) => grey[p.color] ?? p.color);
    await free('wide-grey', wideEye, wideAt, 40);
    view.recolor((p) => p.color);
    await free('back', at(-30, 90, -40), at(12, 26, 9), 40);
    await free('east', at(64, 54, 26), at(20, 30, 9), 40);
    // At the door: the hero on the top step, the door open, seen at his eye height.
    view.setDoor('open');
    stand(at(DOOR.x + 2, H.plinth + 1, HOUSE.z1 + 0.5), Math.PI);
    await free('door', at(DOOR.x + 6.5, H.plinth + 1 + 1.65 / PLATE, HOUSE.z1 + 11), at(DOOR.x + 2, H.plinth + 1 + 1.35 / PLATE, HOUSE.z1 - 0.5), 46);
    view.setDoor('shut');
    // Inside, through the play camera: the ground floor (the upper storey and the front lifted off),
    // then upstairs (the roof and the front above the window boxes lifted off).
    indoors(true);
    cut('ground');
    stand(at(12, H.groundWalk, 10), 0.6);
    await play('ground', 0.9);
    cut('upper');
    stand(at(7, H.upperWalk, 9.5), -0.4);
    await play('upper', 0.9);
    // The stair at his eye height, the roof lifted so the daylight falls down the stairwell: from the
    // landing at its foot, the hero half way up under the rail upstairs; then from the landing at the
    // top, looking down at him climbing.
    indoors(false);
    cut('upper');
    const sx = STAIR.foot - 5, eye = 1.65 / PLATE;
    stand(at(sx + 0.5, treadTop(sx), (STAIR.z0 + STAIR.z1) / 2), -Math.PI / 2);
    await free('stair', at(22.5, H.groundWalk + eye, 2.2), at(sx - 1, treadTop(sx) + 9, 3.2), 64);
    await free('stair-top', at(STAIR.top - 3.5, H.upperWalk + eye, 3), at(sx + 1, treadTop(sx) + 4, 3), 62);
    cut('none');
    // Close up: the ground floor's corner (plinth, quoins, coursed stone, a shop window), an upper
    // window (its box, flowers, shutters, the timber and plaster round it) and the roof's verge.
    hero.obj.visible = false;
    await free('close', at(-4.5, 16, 26), at(2, 12, 17), 40);
    await free('close-upper', at(8, 36, 27), at(5, 33, 17.5), 40);
    await free('close-roof', at(-6, 62, 26), at(1, 52, 14), 40);
    await free('close-chimney', at(34, 78, 22), at(24, 66, 11), 40);
    hero.obj.visible = true;
    if (args.includes('gallery')) {
      view.group.visible = false;
      await gallery(g, origin, free);
      view.group.visible = true;
    }
  } finally {
    indoors(false);
    view.dispose();
    document.body.classList.remove('inspect-clean');
    g.debug.timeScale = 1;
    g.travel('keep', true);
  }
  out.scale = { stud: STUD, plate: PLATE, brick: BRICK, heroBricks: +(HERO_H / BRICK).toFixed(2) };
  return out;
}

/**
 * Every element of the kit in rows on the house's plot (the house lifted away), each in a colour of
 * the palette, the big plates left out (they are plain); seen from above the street.
 */
async function gallery(g: Game, origin: THREE.Vector3, free: (n: string, eye: THREE.Vector3, look: THREE.Vector3, fov?: number) => Promise<void>) {
  const b = new BrickBuild(), colors = Object.values(BRICK_COLORS).filter((c) => c !== BRICK_COLORS.white);
  // (Spaced by the room each really takes: a shutter, a sign or a door's swing reach past their footprints.)
  let x = 0, row = 0, end = 0, i = 0;
  const W = 34;
  for (const e of Object.values(ELEMENTS)) {
    if (e.kind === 'plate' && e.d > 2) continue;
    const lo = [Math.min(...e.boxes.map((q) => q[0])) / 20 + e.w / 2, Math.min(...e.boxes.map((q) => q[2])) / 20 + e.d / 2];
    const hi = [Math.max(...e.boxes.map((q) => q[3])) / 20 + e.w / 2, Math.max(...e.boxes.map((q) => q[5])) / 20 + e.d / 2];
    let px = Math.ceil(x - lo[0]);
    if (px + hi[0] > W) {
      x = 0;
      row = Math.ceil(end) + 1;
      px = Math.ceil(-lo[0]);
    }
    const pz = Math.ceil(row - lo[1]);
    b.place(e.id, px, 0, pz, e.kind === 'pane' ? 'black' : colors[i++ % colors.length]);
    x = px + hi[0] + 1;
    end = Math.max(end, pz + hi[1]);
  }
  const depth = Math.ceil(end);
  const v = new BrickView(b);
  v.group.position.set(origin.x - 4 * STUD, origin.y, origin.z - 6 * STUD);
  g.scene.add(v.group);
  const c = v.group.position, mid = new THREE.Vector3(c.x + (W / 2) * STUD, c.y, c.z + (depth / 2) * STUD);
  await free('gallery', mid.clone().add(new THREE.Vector3(0, 13, 13)), mid, 50);
  await free('gallery-close', mid.clone().add(new THREE.Vector3(-3, 4, 6.5)), mid.clone().add(new THREE.Vector3(-3, 0.3, 1.5)), 45);
  v.dispose();
}

/**
 * The frame cost at the play camera with no house, the house, and a street of sixteen copies of it
 * round the plot (one draw call per element shape for all of them). Medians of five interleaved
 * rounds of 24 frames each; CPU and GPU milliseconds.
 */
async function costs(g: Game, build: BrickBuild, origin: THREE.Vector3, house: BrickView, hero: THREE.Vector3, zoom: number) {
  const copies: THREE.Vector3[] = [];
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) copies.push(new THREE.Vector3((i - 1) * 30 * STUD, 0, (j - 2) * 28 * STUD));
  const street = new BrickView(build, copies);
  street.group.position.copy(origin);
  g.scene.add(street.group);
  const pose = () => {
    g.camera.position.set(hero.x, hero.y + 21 * zoom, hero.z + 14 * zoom);
    g.camera.lookAt(hero.x, hero.y + 1, hero.z);
    g.draw();
  };
  const runs: Record<'none' | 'house' | 'street', { cpu: number[]; gpu: number[] }> = { none: { cpu: [], gpu: [] }, house: { cpu: [], gpu: [] }, street: { cpu: [], gpu: [] } };
  for (let round = 0; round < 5; round++) for (const k of ['none', 'house', 'street'] as const) {
    house.group.visible = k === 'house';
    street.group.visible = k === 'street';
    const p = await perf(g, 24, pose);
    runs[k].cpu.push(...(p.cpuRaw ?? []));
    runs[k].gpu.push(...(p.gpuRaw ?? []));
  }
  house.group.visible = true;
  const stats = street.stats();
  street.dispose();
  const med = (x: number[]) => +x.slice().sort((a, b) => a - b)[Math.floor(x.length / 2)].toFixed(2);
  const out: Record<string, unknown> = { streetHouses: copies.length, streetDrawn: stats };
  for (const [k, v] of Object.entries(runs)) out[k] = { cpu: med(v.cpu), gpu: v.gpu.length ? med(v.gpu) : null };
  return out;
}
