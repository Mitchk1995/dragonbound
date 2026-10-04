import * as THREE from 'three';
import { KEEP_VIEWS } from '../data/zoneMaps';
import type { Game } from '../game';
import { makeItem } from '../loot/itemGen';
import { bakesSettled } from '../render/charBake';
import { buildGear, gearLook } from '../render/registry';
import type { Item } from '../types';
import { creature, hero } from './charactersInspect';
import { TIERS } from './textureInspect';

type Shot = (n: string) => Promise<void>;

/** Every weapon with metal on it: the blades (Cinderfang last), then the pickaxe, the bows and the staves. */
const BLADES = [
  'bronze_sword', 'iron_sword', 'steel_sword', 'ember_sword', 'bronze_longsword', 'iron_longsword', 'steel_longsword',
  'ember_longsword', 'u:cinderfang',
];
const HAFTS = [
  'steel_pickaxe', 'worn_bow', 'hunter_bow', 'recurve_bow', 'drakebone_bow', 'u:emberstring', 'apprentice_staff',
  'oak_staff', 'runed_staff', 'ember_staff', 'u:kindled_ash',
];
/** The uniques, by the base each is cut from. */
const UNIQUE_BASE: Record<string, string> = { cinderfang: 'steel_longsword', emberstring: 'recurve_bow', kindled_ash: 'runed_staff' };
/** The goblin, the cultist, the Cinder Priest and the two town NPCs: buckles, studs, an iron mask, gold fittings. */
const FOLK = ['goblin', 'cultist', 'priest', 'warden', 'quartermaster'];

const item = (id: string): Item => {
  if (!id.startsWith('u:')) return makeItem(id);
  const u = id.slice(2);
  return { ...makeItem(UNIQUE_BASE[u]), unique: u, rarity: 'unique' } as Item;
};

/** A weapon upright, its foot a hand above the grass, its flat to the camera and turned a little to the sun. */
function weapon(id: string) {
  const look = gearLook(item(id))!;
  const holder = new THREE.Group();
  for (const part of buildGear(look.model, look.palette).values()) holder.add(part);
  holder.rotation.y = 0.35;
  holder.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(holder);
  const out = new THREE.Group();
  holder.position.y = 0.2 - box.min.y;
  out.add(holder);
  return { obj: out, height: box.max.y - box.min.y };
}

/**
 * The open lawn south of the well on the home island's green, in the late-afternoon sun; the player stands there
 * unseen (the sun's shadows are fitted round him). Returns the ground point.
 */
async function openGround(g: Game) {
  g.travel('keep', true);
  for (let i = 0; i < 15; i++) await new Promise<void>((r) => requestAnimationFrame(() => r()));
  const green = KEEP_VIEWS.find((v) => v.label === 'green')!;
  const x = green.x, z = green.z + 7.5;
  for (const e of g.zone.enemies) e.obj.removeFromParent();
  g.zone.enemies = [];
  const p = g.player;
  p.pos.set(x, g.zone.nav.y(x, z), z);
  p.stop();
  p.obj.visible = false;
  return new THREE.Vector3(x, p.pos.y, z);
}

/** `objs` in the world, seen from `eye` looking at `at` through the game's own frame (its light, shadows and post). */
async function inWorld(g: Game, shot: Shot, name: string, objs: THREE.Object3D[], eye: THREE.Vector3, at: THREE.Vector3, fov = 30) {
  for (const o of objs) g.scene.add(o);
  const cam = g.camera, keep = cam.fov;
  g.debug.hold = () => {
    cam.fov = fov;
    cam.updateProjectionMatrix();
    cam.position.copy(eye);
    cam.lookAt(at);
    g.draw();
    return true;
  };
  try {
    await bakesSettled();
    await shot(name);
  } finally {
    g.debug.hold = null;
    cam.fov = keep;
    cam.updateProjectionMatrix();
    for (const o of objs) o.removeFromParent();
  }
}

/** Objects side by side along x, `gap` apart, centred on `at` (on the ground, with `g`), each turned `turn`. */
function row(objs: THREE.Object3D[], at: THREE.Vector3, gap: number, turn = 0, g?: Game) {
  objs.forEach((o, i) => {
    const x = at.x + (i - (objs.length - 1) / 2) * gap;
    o.position.set(x, g ? g.zone.nav.y(x, at.z) : at.y, at.z);
    o.rotation.y += turn;
  });
  return objs;
}

/**
 * The metal (explicit suite: `npm run inspect -- chartex:metal`; part of `chartex`), all under the game's own light on
 * the home island's green: the hero in every tier side by side, the four metal tiers closer, and every tier at the play
 * camera; every weapon with metal on it, upright; a breastplate and a sword's blade close up; and the goblin, the
 * cultist, the Cinder Priest, the Warden and the Quartermaster.
 */
export async function metalSuite(g: Game, shot: Shot) {
  const at = await openGround(g);
  document.body.classList.add('inspect-clean');
  const up = (y: number) => at.clone().setY(at.y + y);
  /** The hero in each of these tiers, side by side on the grass. */
  const heroes = (names = TIERS.map((t) => t[0]), gap = 1.3) => {
    const tiers = TIERS.filter(([name]) => names.includes(name));
    return row(tiers.map(([, set, kind]) => hero(set, kind, -1)), at, gap, 0.35, g);
  };
  await inWorld(g, shot, 'ct-metal-tiers', heroes(), up(1.9).setZ(at.z + 9.4), up(1.0));
  const plate = heroes(['chain', 'bronze', 'steel', 'ember'], 1.25);
  await inWorld(g, shot, 'ct-metal-plate', plate, up(1.55).setZ(at.z + 6.0), up(1.05));

  const blades = row(BLADES.map((id) => weapon(id).obj), at, 0.62);
  await inWorld(g, shot, 'ct-metal-blades', blades, up(1.05).setZ(at.z + 6.4), up(0.95));
  const hafts = row(HAFTS.map((id) => weapon(id).obj), at, 0.6);
  await inWorld(g, shot, 'ct-metal-hafts', hafts, up(1.3).setZ(at.z + 7.0), up(1.2));

  // A steel breastplate, and a steel sword's blade, close up.
  const [knight] = row([hero(TIERS.find((t) => t[0] === 'steel')![1], 'swing', -1)], at, 0, 0.35, g);
  knight.updateMatrixWorld(true);
  const chest = knight.getObjectByName('body')!.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.3, 0));
  await inWorld(g, shot, 'ct-metal-breastplate', [knight], chest.clone().add(new THREE.Vector3(0.45, 0.3, 1.25)), chest, 32);
  const sword = weapon('steel_sword');
  sword.obj.position.copy(at);
  const tip = up(0.2 + sword.height * 0.74);
  await inWorld(g, shot, 'ct-metal-blade', [sword.obj], tip.clone().add(new THREE.Vector3(0.25, 0.25, 1.15)), tip, 34);

  const folk = row(FOLK.map((m) => creature(m, 'swing', -1)), at, 1.5, 0.35, g);
  await inWorld(g, shot, 'ct-metal-folk', folk, up(1.9).setZ(at.z + 8.4), up(1.0));

  // Every tier as the player sees them: the play camera, zoomed in.
  const line = heroes();
  for (const o of line) g.scene.add(o);
  g.debug.hold = () => false;
  g.camZoom = 0.55;
  g.camPos.copy(at).setZ(at.z - 0.6);
  g['updateCamera'](0);
  await bakesSettled();
  await shot('ct-metal-playcam');
  g.camZoom = 1;
  g.debug.hold = null;
  for (const o of line) o.removeFromParent();
  g.player.obj.visible = true;
  document.body.classList.remove('inspect-clean');
}
