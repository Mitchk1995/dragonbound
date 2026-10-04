import * as THREE from 'three';
import { ZONES, type ZoneDef } from '../data/zones';
import type { Game } from '../game';
import { buildBakery } from '../world/kit/house';
import { CELL } from '../world/kit/scale';
import { loadKitSurfaces } from '../world/kit/surfaces';
import { KitView } from '../world/kit/view';
import { OCCLUDE } from '../world/worldView';
import { massing } from './hub/massing';
import { planA } from './hub/optionA';
import { planB } from './hub/optionB';
import { planC } from './hub/optionC';
import { disposeOverlay, labels, routes } from './hub/overlay';
import { CX, HOUSE_CELLS, type HubPlan, TURN } from './hub/plan';
import { walks } from './hub/walk';
import { houseColour } from './kitStreet';

type Shot = (name: string) => Promise<void>;
const PLANS: Record<string, () => HubPlan> = { a: planA, b: planB, c: planC };
/** What the options leave drawn, freed once the last is captured. */
interface Done { overlays: THREE.Object3D[]; houses: KitView[] }

/**
 * The hub town's three layout options (explicit suite: `hub`, or `hub:a+c` for some), each on a lot
 * of its own, for the owner to pick from: straight down with every station, exit and the castle
 * named and the busiest runs drawn with their times; a three-quarter view; the play camera at the
 * town's heart; and the street at the hero's eye. Reports each option's run times and house count.
 */
export async function hubSuite(g: Game, shot: Shot, suites: string) {
  const only = suites.split(',').find((s) => s.startsWith('hub:'))?.slice(4).split('+') ?? [];
  await loadKitSurfaces();
  await document.fonts.ready;
  document.body.classList.add('inspect-clean');
  g.debug.timeScale = 0;
  g.player.stop();
  const bakery = buildBakery(), out: Record<string, unknown> = {};
  // (Each option's drawings are taken out of the scene when it is done but freed only at the end: every
  // option's street of kit houses shares the kit's attribute buffers, and freeing one view destroys the
  // buffers the next option's view draws from.)
  const done: Done = { overlays: [], houses: [] };
  const unknown = only.filter((id) => !PLANS[id]);
  if (unknown.length) throw new Error(`hub suite: no layout option ${unknown.join(', ')} (there are ${Object.keys(PLANS).join(', ')})`);
  try {
    for (const id of only.length ? only : Object.keys(PLANS)) out[id] = await option(g, shot, PLANS[id](), bakery, done);
  } finally {
    for (const o of done.overlays) disposeOverlay(o);
    for (const v of done.houses) v.dispose();
    document.body.classList.remove('inspect-clean');
    g.debug.timeScale = 1;
    g.travel('keep', true);
  }
  return out;
}

async function option(g: Game, shot: Shot, plan: HubPlan, bakery: ReturnType<typeof buildBakery>, done: Done) {
  const zone: ZoneDef = { id: `hub-${plan.id}`, name: plan.name, kind: 'hub', arch: 0xffffff, build: () => plan.layout, theme: { ...ZONES.keep.theme } };
  ZONES[zone.id] = zone;
  const added: THREE.Object3D[] = [];
  try {
    g.travel(zone.id, true);
    await new Promise((r) => setTimeout(r, 500));
    const view = g.zone.view, floor = (x: number, z: number) => view.floorAt(x, z);
    const rockTop = Math.max(...[[CX, 12], [CX, 24], [CX - 16, 18], [CX + 16, 18]].map(([x, z]) => view.heightAt(x, z)));
    const add = <T extends THREE.Object3D>(o: T) => (g.scene.add(o), added.push(o), o);

    add(massing(plan, floor, rockTop));
    // Every house is the finished kit house, each in colours of its own, standing on the lowest ground under it.
    const copies = plan.houses.map(({ box: b, face }) => {
      let y = Infinity;
      for (const [x, z] of [[b.x0, b.z0], [b.x1, b.z0], [b.x0, b.z1], [b.x1, b.z1]]) y = Math.min(y, floor(x, z));
      return new THREE.Matrix4().makeTranslation((b.x0 + b.x1) / 2, y, (b.z0 + b.z1) / 2)
        .multiply(new THREE.Matrix4().makeRotationY((TURN[face] * Math.PI) / 2))
        .multiply(new THREE.Matrix4().makeTranslation(-HOUSE_CELLS.mid.x * CELL, 0, -HOUSE_CELLS.mid.z * CELL));
    });
    const houses = new KitView(bakery, copies);
    done.houses.push(houses);
    houses.recolor((p, k) => houseColour(p.color, k));
    add(houses.group);

    const timed = walks(plan);
    const hero = g.player, heart = new THREE.Vector3(plan.heart.x, floor(plan.heart.x, plan.heart.z), plan.heart.z);
    hero.pos.copy(heart);
    hero.obj.position.copy(heart);
    hero.facing = hero.obj.rotation.y = Math.PI;

    // Straight down, north up: every name and the busiest runs (the loop, the castle stair, the road out).
    const names = add(labels(plan, floor, 3.8, 4, rockTop));
    // (The loop round the four busiest stations, listed first, then the runs to the castle stair and out of town.)
    const drawn = timed.filter((w, i) => i < 4 || plan.spots.find((s) => s.id === w.to)!.kind !== 'station');
    const runs = add(routes(drawn, plan, floor, 4.6, { x: CX + 112, y: 40, z: 40 }));
    await free(g, shot, `hub-${plan.id}-1-top`, new THREE.Vector3(CX, 384, 105), new THREE.Vector3(CX, 0, 105), 30, true);
    runs.visible = names.visible = false;
    // Three-quarters from the south-east, smaller names.
    const small = add(labels(plan, floor, 2.8, 6, rockTop));
    const stations = plan.spots.filter((s) => s.kind === 'station'), mid = stations.reduce((z, s) => z + s.at.z, 0) / stations.length + 8;
    await free(g, shot, `hub-${plan.id}-2-overview`, new THREE.Vector3(CX + 95, 118, mid + 142), new THREE.Vector3(CX - 6, 0, mid), 38);
    small.visible = false;
    // The play camera, zoomed out, on the hero at the heart of the town.
    await play(g, shot, `hub-${plan.id}-3-play`, heart, 1.2);
    // The street at the hero's eye, looking toward the castle.
    const { eye, look } = plan.street;
    await free(g, shot, `hub-${plan.id}-4-street`, new THREE.Vector3(eye.x, floor(eye.x, eye.z) + 1.7, eye.z), new THREE.Vector3(look.x, floor(look.x, look.z) + look.y, look.z), 55);
    return { houses: plan.houses.length, rockTop: +rockTop.toFixed(2), walks: timed.map((w) => `${w.from}-${w.to} ${w.seconds} s (${w.metres} m)`) };
  } finally {
    for (const o of added) {
      o.removeFromParent();
      if (!done.houses.some((v) => v.group === o)) done.overlays.push(o);
    }
    delete ZONES[zone.id];
  }
}

/** A free camera at `eye` looking at `look`, the fog pushed far back; `down` looks straight down with north up. */
async function free(g: Game, shot: Shot, name: string, eye: THREE.Vector3, look: THREE.Vector3, fov: number, down = false) {
  const fog = g.scene.fog as THREE.Fog, keep = { near: fog.near, far: fog.far, fov: g.camera.fov };
  g.debug.hold = () => {
    fog.near = 2000;
    fog.far = 4000;
    g.camera.fov = fov;
    g.camera.updateProjectionMatrix();
    g.camera.up.set(0, down ? 0 : 1, down ? -1 : 0);
    g.camera.position.copy(eye);
    g.camera.lookAt(look);
    OCCLUDE.uOccOn.value = 0;
    g.draw();
    return true;
  };
  try {
    await shot(name);
  } finally {
    g.debug.hold = null;
    g.camera.up.set(0, 1, 0);
    Object.assign(fog, { near: keep.near, far: keep.far });
    g.camera.fov = keep.fov;
    g.camera.updateProjectionMatrix();
  }
}

/** The play camera on the hero at `at`, zoomed by `zoom`. */
async function play(g: Game, shot: Shot, name: string, at: THREE.Vector3, zoom: number) {
  const keep = g.camZoom;
  g.camZoom = zoom;
  g.debug.hold = () => {
    g.camera.position.set(at.x, at.y + 21 * zoom, at.z + 14 * zoom);
    g.camera.lookAt(at.x, at.y + 1, at.z);
    OCCLUDE.uOccOn.value = 0;
    g.draw();
    return true;
  };
  try {
    await shot(name);
  } finally {
    g.debug.hold = null;
    g.camZoom = keep;
  }
}
