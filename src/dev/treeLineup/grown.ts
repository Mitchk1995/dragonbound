import * as THREE from 'three';
import { CASTLE_PLAN } from '../../data/zoneMaps';
import type { Game } from '../../game';
import { Ground } from '../../world/layout';
import { GROWN, grownTriangles, TREE_STYLE, type GrownKind } from '../../world/trees';
import { grownMeshes, OCCLUDE } from '../../world/worldView';
import { clearTrees, CLOSE_DIR, frames, freeShot, hideEnemies, measure, restore, standHero, type Shot } from './stage';

/**
 * The stage for a grown kind's progress pictures: lawn on the castle's own level under its south
 * walls near the head of the climb, grass round two trunks 14 m apart and the hero between them
 * (the nearest such spot to the lawn by the landing), so the gameplay camera sees the castle beyond.
 */
function castleLawn(g: Game) {
  const P = CASTLE_PLAN, nav = g.zone.nav, y = (x: number, z: number) => g.zone.groundY(x, z), L = g.zone.layout;
  const grass = (x: number, z: number) => {
    const i = Math.floor(z) * L.w + Math.floor(x);
    return L.ground[i] === Ground.Grass && !L.fluid[i];
  };
  const crownY = y(P.fountain.x, P.fountain.z);
  const tx = P.gate.x + 46, tz = P.gate.z + 13;
  let best: { x: number; z: number; d: number } | null = null;
  for (let dz = -12; dz <= 12; dz++) for (let dx = -18; dx <= 18; dx++) {
    const cx = tx + dx, cz = tz + dz, d = Math.hypot(dx, dz * 1.5);
    if ((best && d >= best.d) || !nav.isWalkable(cx, cz + 1.5)) continue;
    const y0 = y(cx, cz + 1.5);
    if (Math.abs(y0 - crownY) > 1) continue;
    let ok = true;
    for (const ox of [-7, 7]) for (let a = 0; a < 8 && ok; a++) for (const r of [0, 1.2]) {
      const px = cx + ox + Math.cos((a / 8) * Math.PI * 2) * r, pz = cz + Math.sin((a / 8) * Math.PI * 2) * r;
      if (!nav.isWalkable(px, pz) || !grass(px, pz) || Math.abs(y(px, pz) - y0) > 0.5) ok = false;
    }
    if (ok) best = { x: cx, z: cz, d };
  }
  return best;
}

/**
 * A grown kind's progress pictures, in the keep zone as it ships (block trees):
 * - progress-<kind>: the kind and an oak planted 14 m apart on the lawn under the castle walls, the
 *   hero between them, through the gameplay camera drawn back as far as the player can draw it;
 * - trees-<kind>-close: the kind from a low three-quarter angle, the hero at its foot;
 * - trees-oak-close and trees-oak-bark: the oak from the same angle, and its trunk up close.
 * Returns each kind's triangles per variant and the progress view's frame cost.
 */
export async function grownSuite(g: Game, shot: Shot, kind: GrownKind) {
  const out: Record<string, unknown> = {};
  const shipped = TREE_STYLE.value;
  for (const k of new Set<GrownKind>([kind, 'oak'])) out[k] = { triangles: grownTriangles(k) };
  TREE_STYLE.value = 'block';
  const stage = new THREE.Group();
  try {
    for (const k of Object.keys(g.save.keep)) g.save.keep[k] = true;
    g.travel('keep', true);
    await frames(20);
    hideEnemies(g);
    g.debug.timeScale = 0;
    document.body.classList.add('inspect-clean');
    const lawn = castleLawn(g);
    if (!lawn) throw new Error('no open lawn under the castle walls for the grown trees');
    const plant = (k: GrownKind, x: number, z: number, yaw: number) => {
      const pos = new THREE.Vector3(x, g.zone.view.heightAt(x, z) - 0.05, z);
      const mm = new THREE.Matrix4().compose(pos, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)), new THREE.Vector3(1, 1, 1));
      stage.add(...grownMeshes(k, [mm], [new THREE.Color(GROWN[k].look.palette[0])]));
      return pos;
    };
    g.zone.group.add(stage);
    const oak = plant('oak', lawn.x - 7, lawn.z, 2.2), tree = plant(kind, lawn.x + 7, lawn.z, 0.9);
    clearTrees(g, [oak, tree], 13);
    out.stage = { oak: [oak.x, oak.z], [kind]: [tree.x, tree.z] };

    standHero(g, lawn.x, lawn.z + 1.5, 1.35);
    g.debug.hold = () => {
      OCCLUDE.uOccOn.value = 0;
      return false;
    };
    await frames(4);
    await shot(`progress-${kind}`);
    out.progress = await measure(g);
    g.debug.hold = null;

    // Close up: the kind with the hero at its foot, then the oak and its bark.
    const foot = standHero(g, tree.x - 2.6, tree.z + 2.2);
    const h = GROWN[kind].species.height[1];
    const look = tree.clone().add(new THREE.Vector3(0, h * 0.42, 0));
    await freeShot(g, shot, `trees-${kind}-close`, look.clone().addScaledVector(CLOSE_DIR, h * 2.1), look, 20);
    standHero(g, oak.x - 2.8, oak.z + 2.4);
    const oakLook = oak.clone().add(new THREE.Vector3(0, 4.6, 0));
    if (kind !== 'oak') await freeShot(g, shot, 'trees-oak-close', oakLook.clone().addScaledVector(CLOSE_DIR, 24), oakLook, 20);
    await freeShot(g, shot, 'trees-oak-bark', oak.clone().add(new THREE.Vector3(1.2, 1.7, 5.2)), oak.clone().add(new THREE.Vector3(0, 1.9, 0)), 12);
    out.hero = [foot.x, foot.z];
  } finally {
    restore(g, stage, shipped);
  }
  return out;
}
