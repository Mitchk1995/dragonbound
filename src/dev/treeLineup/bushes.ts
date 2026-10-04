import * as THREE from 'three';
import type { Game } from '../../game';
import { GROWN, GROWN_KINDS, grownTrees, TREE_STYLE, treeSet, type GrownStandIn } from '../../world/trees';
import { OCCLUDE } from '../../world/worldView';
import { WIND } from '../../world/worldView/materials';
import { frames, freeShot, gameplayCamera, hideEnemies, measure, openField, overlay, plantTree, restore, sheetShot, standHero, zoneShot, type SheetView, type Shot } from './stage';

/** One shape of a grown stand-in (the dead ash, a bush) as instanced meshes with its own materials, as the world draws it. */
function standIn(part: GrownStandIn, v: number, at: THREE.Matrix4, color: number) {
  const mk = (geo: THREE.BufferGeometry, setup: GrownStandIn['look']['trunk'], tint: boolean) => {
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
    setup(mat, WIND);
    const mesh = new THREE.InstancedMesh(geo, mat, 1);
    mesh.setMatrixAt(0, at);
    if (tint) mesh.setColorAt(0, new THREE.Color(color));
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    return mesh;
  };
  return [mk(part.trunk[v], part.look.trunk, false), ...(part.canopy[v] ? [mk(part.canopy[v], part.look.canopy, true)] : [])];
}

/** Plant shape v of a stand-in at (x, z), turned `yaw`, at `size`. */
function plant(g: Game, stage: THREE.Group, part: GrownStandIn, v: number, x: number, z: number, yaw: number, size = 1) {
  const pos = new THREE.Vector3(x, g.zone.view.heightAt(x, z) - 0.05, z);
  stage.add(...standIn(part, v, new THREE.Matrix4().compose(pos, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)), new THREE.Vector3(size, size * (part.canopy.length ? 0.75 : 1), size)), part.look.palette[0]));
  return pos;
}

/** Where a zone's grown dead ash, bushes and grown trees stand (their instances; a tree's `r` the reach of its crown). */
function standing(g: Game) {
  const ts = treeSet(), ash = new Set(ts.grown!.ash.trunk), bush = new Set(ts.grown!.bush.canopy), crowns = new Map(GROWN_KINDS.flatMap((k) => grownTrees(k).canopy.map((c) => [c, GROWN[k].species.spread[1] / 2] as const)));
  const out = { ash: [] as THREE.Vector3[], bush: [] as THREE.Vector3[], tree: [] as (THREE.Vector3 & { r?: number })[] };
  const m = new THREE.Matrix4(), sc = new THREE.Vector3();
  g.zone.group.traverse((o) => {
    if (!(o instanceof THREE.InstancedMesh)) return;
    const list = ash.has(o.geometry) ? out.ash : bush.has(o.geometry) ? out.bush : crowns.has(o.geometry) ? out.tree : null;
    for (let i = 0; list && i < o.count; i++) {
      o.getMatrixAt(i, m);
      list.push(Object.assign(new THREE.Vector3().setFromMatrixPosition(m), list === out.tree ? { r: crowns.get(o.geometry)! * sc.setFromMatrixScale(m).x } : {}));
    }
  });
  return out;
}

/**
 * The spot in the current zone whose play-camera view holds the most dead ash and bushes in the open
 * (out from under the trees' crowns) among its trees: open walkable ground out from under any crown,
 * the camera drawn back a little.
 */
function woodSpot(g: Game, ashWeight: number) {
  const s = standing(g), L = g.zone.layout;
  const clear = (p: THREE.Vector3, d = 0) => s.tree.every((t) => Math.hypot(t.x - p.x, t.z - p.z) > (t.r ?? 4) + d);
  const open = s.bush.filter((p) => clear(p, 0.3));
  let best = { x: L.entry.x, z: L.entry.z, zoom: 1.2, score: -Infinity };
  const seen = (list: THREE.Vector3[], x: number, z: number) => list.filter((p) => Math.abs(p.x - x) < 14 && p.z - z > -15 && p.z - z < 5).length;
  for (let z = 8; z < L.h - 8; z += 2) for (let x = 8; x < L.w - 8; x += 2) {
    if (!g.zone.nav.isWalkable(x, z) || s.ash.some((p) => Math.hypot(p.x - x, p.z - z) < 3) || !clear(new THREE.Vector3(x, 0, z))) continue;
    const ash = seen(s.ash, x, z);
    if (ashWeight && ash < 2) continue;
    const score = Math.min(seen(open, x, z), 10) * 1.5 + Math.min(ash, 5) * ashWeight + Math.min(seen(s.tree, x, z), 8) * 0.5;
    if (score > best.score) best = { x: x + 0.5, z: z + 0.5, zoom: 1.2, score };
  }
  return { ...best, ash: seen(s.ash, best.x, best.z), bushes: seen(open, best.x, best.z) };
}

/**
 * Every shape of the dead ash and the bushes from four sides (`trees:bushes:angles`), one picture
 * each (bushes-angles-ash, bushes-angles-bush), each shape on its own in the meadow.
 */
async function anglesSuite(g: Game, shot: Shot, stage: THREE.Group, c: { x: number; z: number }, parts: Record<'ash' | 'bush', GrownStandIn>) {
  g.player.obj.visible = false;
  for (const kind of ['ash', 'bush'] as const) {
    const part = parts[kind], n = part.trunk.length, at = new THREE.Vector3(c.x, 0, c.z);
    const planted = part.trunk.map((_, v) => {
      const before = stage.children.length;
      at.copy(plant(g, stage, part, v, c.x, c.z, 0.3));
      return stage.children.slice(before);
    });
    const solo = (v: number) => () => planted.forEach((meshes, i) => meshes.forEach((mesh) => (mesh.visible = i === v)));
    const [h, d] = kind === 'ash' ? [3.2, 15] : [0.6, 5.5];
    const views: SheetView[] = [];
    for (const [side, a] of [['front', 0], ['right', Math.PI / 2], ['back', Math.PI], ['left', -Math.PI / 2]] as const) {
      for (let v = 0; v < n; v++) views.push({ label: `${kind === 'ash' ? 'dead ash' : 'bush'} ${v + 1}, ${side}`, prepare: solo(v), eye: at.clone().add(new THREE.Vector3(Math.sin(a) * d, h + d * 0.3, Math.cos(a) * d)), look: at.clone().add(new THREE.Vector3(0, h, 0)) });
    }
    await sheetShot(g, shot, `bushes-angles-${kind}`, views, n);
    stage.clear();
  }
  g.player.obj.visible = true;
}

/**
 * The grown bushes and dead ash (`trees:bushes`), in the Foothills meadow with its own trees and
 * bushes hidden, and in the woods as they ship:
 * - bushes-lineup: every dead ash and bush shape beside an approved oak and common tree and the hero
 *   (the bushes at the largest the woods set them, and at half that), through the gameplay camera
 *   drawn back to fit;
 * - bushes-lineup-low: the same from a low three-quarter angle, the silhouettes against the sky;
 * - bushes-close and dead-ash-close: the bushes, and the dead ash's feet and breaks, close up;
 * - bushes-wood-foothills and bushes-wood-lair: the Foothills' mixed wood and the dead wood of
 *   Cinderwing's lair as they ship through the gameplay camera, with their frame costs (and,
 *   measured only, the same views' with the block dead ash and bushes).
 */
export async function bushesSuite(g: Game, shot: Shot, opts: string[] = []) {
  const out: Record<string, unknown> = {};
  const shipped = TREE_STYLE.value;
  const stage = new THREE.Group();
  try {
    TREE_STYLE.value = 'natural';
    const grown = treeSet('natural').grown!, { ash, bush } = grown;
    g.travel('foothills', true);
    await frames(20);
    hideEnemies(g);
    g.debug.timeScale = 0;
    document.body.classList.add('inspect-clean');
    g.zone.group.traverse((o) => {
      if (o.name === 'tree' || o.name === 'bush') o.visible = false;
    });
    g.zone.group.add(stage);
    const c = openField(g, 12), hAt = g.zone.view.heightAt;
    if (opts.includes('angles')) {
      await anglesSuite(g, shot, stage, c, grown);
      return out;
    }
    const oak = plantTree(g, stage, 'oak', c.x - 15, c.z - 4, 0, 2.2, GROWN.oak.look.palette[0]).pos;
    const tree = plantTree(g, stage, 'tree', c.x - 6, c.z - 4.5, 1, 0.6, GROWN.tree.look.palette[0]).pos;
    const ashes = ash.trunk.map((_, v) => plant(g, stage, ash, v, c.x + 1 + v * 6.5, c.z - 4.5 + (v % 2) * 1.5, 0.8 + v * 2.1));
    const bushes = bush.trunk.map((_, v) => plant(g, stage, bush, v, c.x - 3.5 + v * 3.6, c.z + 4.2, 0.4 + v * 1.7));
    const small = bush.trunk.map((_, v) => plant(g, stage, bush, v, c.x + 8 + v * 2.4, c.z + 4.6, 2.5 + v * 1.1, 0.5));
    const hero = standHero(g, c.x - 8, c.z + 3);
    out.stage = { oak: [oak.x, oak.z], tree: [tree.x, tree.z], hero: [hero.x, hero.z] };
    g.debug.hold = () => {
      OCCLUDE.uOccOn.value = 0;
      gameplayCamera(g, c.x - 3, hAt(c.x, c.z), c.z + 2, 1.65);
      return false;
    };
    await frames(3);
    // (Labels large enough to read on a review sheet, centred under what they name.)
    const ov = overlay();
    const label = (text: string, p: THREE.Vector3, dz: number) => {
      const q = p.clone().add(new THREE.Vector3(0, 0, dz)).project(g.camera), l = document.createElement('div');
      l.className = 'lbl';
      l.textContent = text;
      Object.assign(l.style, { left: `${((q.x + 1) / 2) * innerWidth}px`, top: `${((1 - q.y) / 2) * innerHeight}px`, transform: 'translateX(-50%)', font: "700 22px 'Alegreya Sans', sans-serif" });
      ov.el.appendChild(l);
    };
    label('oak', oak, 2.5);
    label('common tree', tree, 2);
    ashes.forEach((p, v) => label(`dead ash ${v + 1}`, p, 3));
    bushes.forEach((p, v) => label(`bush ${v + 1}`, p, 1.9));
    label('bushes at half size', small[1], 1.5);
    await shot('bushes-lineup');
    ov.el.remove();
    out.lineup = await measure(g);
    g.debug.hold = null;

    // The same from low down, the silhouettes against the sky.
    const mid = new THREE.Vector3(c.x - 3, hAt(c.x, c.z) + 3.4, c.z - 1);
    await freeShot(g, shot, 'bushes-lineup-low', mid.clone().add(new THREE.Vector3(4, 1.2, 33)), mid, 28);

    // Close up: the bushes with the hero beside them, then the dead ash's feet and breaks.
    standHero(g, bushes[0].x - 2.2, bushes[0].z + 0.4);
    const bLook = bushes[1].clone().add(new THREE.Vector3(0, 0.7, 0.4));
    await freeShot(g, shot, 'bushes-close', bLook.clone().add(new THREE.Vector3(3.2, 2.6, 7.4)), bLook, 10);
    standHero(g, ashes[1].x - 1.6, ashes[1].z + 1.8);
    const aLook = ashes[1].clone().add(new THREE.Vector3(0, 3.0, 0));
    await freeShot(g, shot, 'dead-ash-close', aLook.clone().add(new THREE.Vector3(6.5, 1.0, 13)), aLook, 16);
    stage.clear();

    // The woods as they ship, through the gameplay camera, with what the view costs; and what it
    // cost with the block dead ash and bushes (measured only).
    for (const [zone, weight] of [['foothills', 4], ['lair', 2]] as const) {
      TREE_STYLE.value = 'natural';
      g.travel(zone, true);
      await frames(20);
      const spot = woodSpot(g, weight);
      out[`${zone}Spot`] = spot;
      out[zone] = await zoneShot(g, shot, zone, 'natural', spot, `bushes-wood-${zone}`, true);
      const set = treeSet('natural');
      delete set.grown;
      try {
        out[`${zone}Block`] = await zoneShot(g, async () => {}, zone, 'natural', spot, '', true);
      } finally {
        set.grown = grown;
      }
    }
  } finally {
    restore(g, stage, shipped);
  }
  return out;
}
