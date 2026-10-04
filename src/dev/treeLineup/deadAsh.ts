import * as THREE from 'three';
import type { Game } from '../../game';
import { GROWN, TREE_STYLE, treeSet } from '../../world/trees';
import { OCCLUDE } from '../../world/worldView';
import { plant, woodSpot } from './bushes';
import { frames, freeShot, gameplayCamera, hideEnemies, measure, openField, overlay, plantTree, restore, standHero, zoneShot, type Shot } from './stage';

/**
 * The dead ash's bark and bare wood (`trees:ash`), in the Foothills meadow with its own trees and
 * bushes hidden, and in the woods as they ship:
 * - ash-beside-oak: the three dead ash beside an approved oak and common tree and the hero, through
 *   the gameplay camera drawn back to fit; ash-beside-oak-low the same from a low three-quarter angle;
 * - ash-close: two of them with the hero, their feet, bark and breaks; ash-bark: one trunk up close,
 *   its bark still on low down and falling away above; ash-top: its snapped top and broken limbs;
 *   ash-bark-beside-oak: its bark beside an oak's and a common tree's, close;
 * - ash-wood-foothills and ash-wood-lair: the Foothills' wood and Cinderwing's lair as they ship,
 *   through the gameplay camera, with their frame costs.
 */
export async function deadAshSuite(g: Game, shot: Shot) {
  const out: Record<string, unknown> = {};
  const shipped = TREE_STYLE.value;
  const stage = new THREE.Group();
  try {
    TREE_STYLE.value = 'natural';
    const { ash } = treeSet('natural').grown!;
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
    const oak = plantTree(g, stage, 'oak', c.x - 12, c.z - 3, 0, 2.2, GROWN.oak.look.palette[0]).pos;
    const tree = plantTree(g, stage, 'tree', c.x - 4, c.z - 3.5, 1, 0.6, GROWN.tree.look.palette[0]).pos;
    const yaws = [0.8, 2.9, 5.0];
    const ashes = ash.trunk.map((_, v) => plant(g, stage, ash, v, c.x + 2.5 + v * 6.5, c.z - 4 + (v % 2) * 1.5, yaws[v]));
    standHero(g, c.x - 1, c.z + 2.5);
    g.debug.hold = () => {
      OCCLUDE.uOccOn.value = 0;
      gameplayCamera(g, c.x + 1, hAt(c.x, c.z), c.z + 1, 1.5);
      return false;
    };
    await frames(3);
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
    await shot('ash-beside-oak');
    ov.el.remove();
    out.lineup = await measure(g);
    g.debug.hold = null;

    // The same from low down, every tree at about the same distance in the same light.
    const mid = new THREE.Vector3(c.x + 1, hAt(c.x, c.z) + 3.2, c.z - 3.5);
    await freeShot(g, shot, 'ash-beside-oak-low', mid.clone().add(new THREE.Vector3(3, 0.4, 27)), mid, 26);

    // Close up: two of them with the hero; one trunk from its foot up; the first's snapped top.
    standHero(g, ashes[1].x - 1.6, ashes[1].z + 1.8);
    const aLook = ashes[1].clone().add(new THREE.Vector3(0, 3.0, 0));
    await freeShot(g, shot, 'ash-close', aLook.clone().add(new THREE.Vector3(6.5, 1.0, 13)), aLook, 16);
    standHero(g, ashes[0].x - 1.3, ashes[0].z + 1.4);
    const bLook = ashes[0].clone().add(new THREE.Vector3(0, 2.4, 0));
    await freeShot(g, shot, 'ash-bark', bLook.clone().add(new THREE.Vector3(2.6, 0.1, 5.6)), bLook, 8);
    // (Its crown from a little below, the broken limbs against the sky.)
    ash.trunk[0].computeBoundingBox();
    const crown = ashes[0].clone().add(new THREE.Vector3(0, ash.trunk[0].boundingBox!.max.y * 0.72, 0));
    await freeShot(g, shot, 'ash-top', crown.clone().add(new THREE.Vector3(3.4, -0.8, 5.6)), crown, 8);
    stage.clear();

    // Their bark beside the approved trees': an oak, a common tree and the tall snag side by side, close.
    const row = [plantTree(g, stage, 'oak', c.x - 6, c.z, 0, 2.2, GROWN.oak.look.palette[0]).pos, plantTree(g, stage, 'tree', c.x - 1.5, c.z, 1, 0.6, GROWN.tree.look.palette[0]).pos, plant(g, stage, ash, 0, c.x + 3, c.z, yaws[0])];
    standHero(g, c.x + 0.8, c.z + 1.6);
    const rLook = new THREE.Vector3(c.x - 1.5, hAt(c.x, c.z) + 1.9, c.z);
    out.row = row.map((p) => [p.x, p.z]);
    await freeShot(g, shot, 'ash-bark-beside-oak', rLook.clone().add(new THREE.Vector3(0.6, 0.2, 9.5)), rLook, 10);
    stage.clear();

    // The woods as they ship, through the gameplay camera, with what the view costs.
    for (const [zone, weight] of [['foothills', 4], ['lair', 2]] as const) {
      TREE_STYLE.value = 'natural';
      g.travel(zone, true);
      await frames(20);
      const spot = woodSpot(g, weight);
      out[`${zone}Spot`] = spot;
      out[zone] = await zoneShot(g, shot, zone, 'natural', spot, `ash-wood-${zone}`, true);
    }
  } finally {
    restore(g, stage, shipped);
  }
  return out;
}
