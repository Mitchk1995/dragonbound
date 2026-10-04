import * as THREE from 'three';
import type { Game } from '../../game';
import { GROWN, GROWN_KINDS, grownTrees, grownTriangles, TREE_STYLE, type GrownKind } from '../../world/trees';
import { OCCLUDE } from '../../world/worldView';
import { clearTrees, CLOSE_DIR, frames, freeShot, gameplayCamera, hideEnemies, measure, openField, overlay, plantTree, restore, standHero, zoneShot, type Shot } from './stage';

/**
 * Where the hero stands for the Foothills forest picture, its grown trees as they ship: open walkable
 * ground (no trunk within 5 m) with the most grown trees, of the most species, in the gameplay
 * camera's view beyond it, the camera drawn back as far as the player can draw it.
 */
async function forestSpot(g: Game) {
  TREE_STYLE.value = 'natural';
  g.travel('foothills', true);
  await frames(20);
  const crowns = new Map<THREE.BufferGeometry, GrownKind>();
  for (const k of GROWN_KINDS) for (const geo of grownTrees(k).canopy) crowns.set(geo, k);
  const at: { p: THREE.Vector3; k: GrownKind }[] = [];
  const m = new THREE.Matrix4();
  g.zone.group.traverse((o) => {
    if (!(o instanceof THREE.InstancedMesh) || !crowns.has(o.geometry)) return;
    for (let i = 0; i < o.count; i++) {
      o.getMatrixAt(i, m);
      at.push({ p: new THREE.Vector3().setFromMatrixPosition(m), k: crowns.get(o.geometry)! });
    }
  });
  const L = g.zone.layout;
  let best = { x: L.entry.x, z: L.entry.z, zoom: 1.35, score: -Infinity };
  for (let z = 10; z < L.h - 10; z += 2) for (let x = 10; x < L.w - 10; x += 2) {
    if (!g.zone.nav.isWalkable(x, z) || at.some((t) => Math.hypot(t.p.x - x, t.p.z - z) < 5)) continue;
    const seen = at.filter((t) => Math.abs(t.p.x - x) < 17 && t.p.z - z > -18 && t.p.z - z < 4);
    const score = Math.min(seen.length, 18) + new Set(seen.map((t) => t.k)).size * 3;
    if (score > best.score) best = { x: x + 0.5, z: z + 0.5, zoom: 1.35, score };
  }
  return best;
}

/** The ladder's names as the pictures label them. */
export const LADDER_NAMES: Record<GrownKind, string> = { tree: 'tree', oak: 'oak', willow: 'willow', maple: 'maple', yew: 'yew', magic: 'magic tree' };

/** The ladder's species new in this round (each gets a close-up). */
const NEW_KINDS: GrownKind[] = ['willow', 'maple', 'yew', 'magic'];

/**
 * The Foothills meadow for the ladder, its own trees and bushes hidden: trees-ladder, the six species
 * in their order, two shapes each (the back row a species' first shape, the front its second; the
 * front maple in its autumn reds), the hero among them, through the gameplay camera drawn back to
 * fit. Returns the meadow's centre, the hidden trees and the view's frame cost.
 */
export async function ladderLineup(g: Game, shot: Shot, stage: THREE.Group) {
  TREE_STYLE.value = 'natural';
  g.travel('foothills', true);
  await frames(20);
  hideEnemies(g);
  g.debug.timeScale = 0;
  document.body.classList.add('inspect-clean');
  const hidden: THREE.Object3D[] = [];
  g.zone.group.traverse((o) => {
    if ((o.name === 'tree' || o.name === 'bush') && o.visible) hidden.push(o);
  });
  hidden.forEach((o) => (o.visible = false));
  g.zone.group.add(stage);
  const c = openField(g, 12), hAt = g.zone.view.heightAt;
  const SX = 11, SZ = 12;
  const planted: { kind: GrownKind; row: number; pos: THREE.Vector3 }[] = [];
  GROWN_KINDS.forEach((kind, i) => {
    for (const row of [0, 1]) {
      const look = GROWN[kind].look, color = row === 1 && look.autumn && kind === 'maple' ? look.autumn[0] : look.palette[0];
      const x = c.x + (i - 2.5) * SX + (row ? 1.5 : -1.5), z = c.z + (row - 0.5) * SZ;
      const { pos } = plantTree(g, stage, kind, x, z, row, 0.7 + i * 1.3 + row * 2.4, color);
      planted.push({ kind, row, pos });
    }
  });
  // The hero stands in front, between the common tree and the oak, for scale.
  standHero(g, c.x - 2 * SX, c.z + SZ * 0.5 + 3.5);
  g.debug.hold = () => {
    OCCLUDE.uOccOn.value = 0;
    gameplayCamera(g, c.x, hAt(c.x, c.z), c.z + 3, 2.45);
    return false;
  };
  await frames(3);
  const ov = overlay();
  const toScreen = (v: THREE.Vector3) => {
    const p = v.clone().project(g.camera);
    return { x: ((p.x + 1) / 2) * innerWidth, y: ((1 - p.y) / 2) * innerHeight };
  };
  for (const t of planted.filter((p) => p.row === 1)) {
    const sp = toScreen(t.pos.clone().add(new THREE.Vector3(0, 0, 4)));
    ov.label(LADDER_NAMES[t.kind], sp.x - 30, sp.y, true);
  }
  await shot('trees-ladder');
  ov.el.remove();
  const frame = await measure(g);
  g.debug.hold = null;
  stage.clear();
  return { c, hidden, frame };
}

/** One species' close-up as the ladder takes it: its first shape planted at `at` on its own, the wood round it as it ships, the hero at its foot. */
export async function closeUp(g: Game, shot: Shot, stage: THREE.Group, kind: GrownKind, at: { x: number; z: number }) {
  const { pos } = plantTree(g, stage, kind, at.x, at.z, 0, 0.9, GROWN[kind].look.palette[0]);
  clearTrees(g, [pos], 12);
  const foot = standHero(g, pos.x - 2.6, pos.z + 2.4);
  const h = GROWN[kind].species.height[1], look = pos.clone().add(new THREE.Vector3(0, h * 0.42, 0));
  await freeShot(g, shot, `trees-${kind}-close`, look.clone().addScaledVector(CLOSE_DIR, h * 2.1), look, 20);
  stage.clear();
  return foot;
}

/**
 * The whole woodcutting ladder, in the Foothills meadow:
 * - trees-ladder: the six species in their order, two shapes each (the back row a species' first
 *   shape, the front its second; the front maple in its autumn reds), the hero among them, through the
 *   gameplay camera drawn back to fit;
 * - trees-<kind>-close for each new species: its first shape on its own from a low three-quarter
 *   angle, the hero at its foot, the wood round it as it ships;
 * - trees-foothills-forest: a forest of the Foothills as it ships (grown trees) through the gameplay
 *   camera; its frame cost there, and with the block trees at the same spot.
 */
export async function ladderSuite(g: Game, shot: Shot) {
  const out: Record<string, unknown> = {};
  const shipped = TREE_STYLE.value;
  out.triangles = Object.fromEntries(GROWN_KINDS.map((k) => [k, grownTriangles(k)]));
  const stage = new THREE.Group();
  try {
    const { c, hidden, frame } = await ladderLineup(g, shot, stage);
    out.ladder = frame;

    // Each new species on its own, the wood round it as it ships.
    hidden.forEach((o) => (o.visible = true));
    for (const kind of NEW_KINDS) {
      const foot = await closeUp(g, shot, stage, kind, c);
      out[`${kind}Hero`] = [foot.x, foot.z];
    }

    // A forest of the Foothills as it ships, then with the block trees.
    const spot = await forestSpot(g);
    out.forestSpot = spot;
    out.forest = await zoneShot(g, shot, 'foothills', 'natural', spot, 'trees-foothills-forest', true);
    out.forestBlock = await zoneShot(g, shot, 'foothills', 'block', spot, 'trees-foothills-forest-block', true);
  } finally {
    restore(g, stage, shipped);
  }
  return out;
}
