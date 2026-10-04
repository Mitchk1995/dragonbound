import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { applyHeightShade } from '../../render/surface';
import { hash01, MOSS_TALL, ROCK_MASSES, rockBlock, rockMass, rockMassMoss, slabBlock } from '../../render/blocks';
import { useStrataRock } from '../../render/rock';
import { grownTrees, GROWN, GROWN_KINDS, thinWood, type TreeKind } from '../trees';
import { grownArgs, treeArgs, withVertexShade } from './materials';
import type { Scatter, Scene } from './scene';

/** Everything scattered over the land, made into instanced meshes (the woods thinned first). */
export function drawScatter(scene: Scene, sets: Scatter) {
  const { theme, inst, ts, woods } = scene;
  const { trees, grown, rocks, rockCols, rims, rimCols, walls, wallCols, bushes, bushCols, flowers, flowerCols, reeds, strata, strataCols, crevices, debris, debrisCols, mass, massCols, rockMasses, rockMassCols, mossMats, mossCols, ferns, fernCols, cushions, cushionCols } = sets;
  // Grown trees need far more room than one to a cell: their woods are thinned (trees.ts thinWood),
  // and no bush is left in the shade of their crowns.
  if (woods) {
    const tp = new THREE.Vector3();
    const xz = (mm: THREE.Matrix4, spacing?: number) => (tp.setFromMatrixPosition(mm), { x: tp.x, z: tp.z, spacing });
    const lists = [...(['pine', 'grove', 'ash'] as TreeKind[]).map((k) => ({ list: trees[k], spacing: undefined })), ...GROWN_KINDS.map((g) => ({ list: grown[g], spacing: GROWN[g].look.spacing }))];
    const thin = thinWood(lists.flatMap(({ list, spacing }) => list.m.map((mm) => xz(mm, spacing))), bushes.map((mm) => xz(mm)));
    let n = 0;
    for (const { list } of lists) {
      const keep = list.m.map(() => thin.trees[n++]);
      list.m = list.m.filter((_, i) => keep[i]);
      list.c = list.c.filter((_, i) => keep[i]);
    }
    for (let i = bushes.length - 1; i >= 0; i--) {
      if (thin.under[i]) continue;
      bushes.splice(i, 1);
      bushCols.splice(i, 1);
    }
  }
  for (const k of ['pine', 'grove', 'ash'] as TreeKind[]) {
    if (!trees[k].m.length) continue;
    const [trunk, crown] = treeArgs(ts, k);
    // Painted canopies: leaf clusters on broadleaves, needle tufts on pines, bark on dead ash.
    // Each tree takes one of the style's canopy variants, picked from its position (no pattern
    // along the rows, and the same tree every visit).
    const vs = ts.canopy[k], tp = new THREE.Vector3();
    const variant = trees[k].m.map((mm) => (tp.setFromMatrixPosition(mm), Math.floor(hash01(tp.x, tp.z) * vs.length)));
    const pick = <T>(list: T[], v: number) => list.filter((_, i) => variant[i] === v);
    // (Block trees share one trunk.)
    const made = [...inst(ts.trunk[k][0], trees[k].m, null, ...trunk)!, ...vs.flatMap((geo, v) => inst(geo, pick(trees[k].m, v), pick(trees[k].c, v), ...crown) ?? [])];
    for (const mesh of made) mesh.name = 'tree';
  }
  // Grown trees: each shape's own wood paired with its own leaves, every one instanced.
  for (const g of GROWN_KINDS) {
    const { m: at, c: cols } = grown[g];
    if (!at.length) continue;
    const set = grownTrees(g), [trunk, crown] = grownArgs(GROWN[g].look), tp = new THREE.Vector3();
    const variant = at.map((mm) => (tp.setFromMatrixPosition(mm), Math.floor(hash01(tp.x, tp.z) * set.canopy.length)));
    const pick = <T>(list: T[], v: number) => list.filter((_, i) => variant[i] === v);
    const made = set.canopy.flatMap((geo, v) => [...(inst(set.trunk[v], pick(at, v), null, ...trunk) ?? []), ...(inst(geo, pick(at, v), pick(cols, v), ...crown) ?? [])]);
    for (const mesh of made) mesh.name = 'tree';
  }
  // Rocks are chunky faceted blocks (two shapes, alternating) sunk into the ground.
  const half = <T>(list: T[], odd: number) => list.filter((_, i) => i % 2 === odd);
  /** Rock lying on the land (the geometry audit checks none of it rises through a walk or the masonry). */
  const rocky = (made: THREE.InstancedMesh[] | undefined) => made?.forEach((m) => (m.userData.rock = true));
  rocky(inst(rockBlock(7, 1.25, 1.0, 1.1), half(rocks, 0), half(rockCols, 0), 0, true, 'rock'));
  rocky(inst(rockBlock(8, 1.1, 1.05, 1.2), half(rocks, 1), half(rockCols, 1), 0, true, 'rock'));
  inst(rockBlock(9, 1.1, 1.0, 1.0), rims, rimCols, 0, false, 'rock');
  // Cave slabs fade into the dark with height exactly like the rock mass behind them.
  const caveShade = (mat: THREE.MeshStandardMaterial) => {
    if (!theme.wallRise) return;
    applyHeightShade(mat, theme.topShade ?? 1, ...(theme.topRange ?? [2.5, 12]));
    useStrataRock(mat);
  };
  inst(slabBlock(31), half(strata, 0), half(strataCols, 0), 0, true, 'rock', true, undefined, caveShade);
  inst(slabBlock(32), half(strata, 1), half(strataCols, 1), 0, true, 'rock', true, undefined, caveShade);
  inst(slabBlock(34), half(mass, 0), half(massCols, 0), 0, true, 'rock', false, undefined, caveShade);
  inst(slabBlock(35), half(mass, 1), half(massCols, 1), 0, true, 'rock', false, undefined, caveShade);
  inst(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), crevices, null, 0x120e0b, true, undefined, false);
  rocky(inst(rockBlock(33, 1, 0.8, 1), debris, debrisCols, 0, false, 'rock', false));
  for (let v = 0; v < ROCK_MASSES; v++) {
    rocky(inst(rockMass(v), rockMasses[v], rockMassCols[v], 0, true, 'rock'));
    MOSS_TALL.forEach((tall, tb) => rocky(inst(rockMassMoss(v, tall), mossMats[v][tb], mossCols[v][tb], 0, true, ts.paint.grove, false)));
  }
  if (ferns.length) {
    // A fern: a ring of fronds arching up and out from the root and nodding over at their tips,
    // each a slender stalk set with pairs of blocky leaflets that shorten toward the tip, so it reads
    // as a fern, not a spiky rosette.
    const frond = (i: number, n: number) => {
      const reach = 0.85 + (i % 2) * 0.15, rise = 0.42 - (i % 2) * 0.1;
      /** A point along the frond (t: 0 root .. 1 tip): out along +Z, rising and then nodding over. */
      const at = (t: number) => new THREE.Vector3(0, rise * Math.sin(Math.PI * 0.85 * t) * 1.1, reach * t);
      const parts: THREE.BufferGeometry[] = [];
      // (The stalk in two straight lengths, root to mid and mid to tip.)
      for (const [t0, t1] of [[0, 0.5], [0.5, 1]]) {
        const a = at(t0), b = at(t1), d = b.clone().sub(a), L = d.length();
        parts.push(new THREE.OctahedronGeometry(1, 0).scale(0.03, 0.03, L / 2 + 0.02).rotateX(-Math.atan2(d.y, d.z)).translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2));
      }
      for (const t of [0.24, 0.4, 0.55, 0.69, 0.82, 0.93]) {
        const c = at(t), len = 0.09 + 0.24 * (1 - t);
        for (const sx of [-1, 1]) parts.push(new THREE.OctahedronGeometry(1, 0).scale(len / 2, 0.02, 0.07).rotateY(sx * 0.45).translate(sx * len * 0.42, c.y + 0.01, c.z + len * 0.12));
      }
      parts.push(new THREE.OctahedronGeometry(1, 0).scale(0.03, 0.02, 0.07).translate(0, at(1).y, at(1).z + 0.05));
      return mergeGeometries(parts)!.rotateY((i / n) * Math.PI * 2 + (i % 2) * 0.3);
    };
    inst(mergeGeometries(Array.from({ length: 6 }, (_, i) => frond(i, 6)))!, ferns, fernCols, 0, false, ts.paint.grove, false);
  }
  // Masonry: stacked, offset courses with a broken top (instances turn in 90° steps for variety).
  const masonry = mergeGeometries([
    new THREE.BoxGeometry(1, 0.45, 1).translate(0, -0.275, 0),
    new THREE.BoxGeometry(0.92, 0.36, 0.94).translate(0.03, 0.125, -0.02),
    new THREE.BoxGeometry(0.52, 0.3, 0.5).translate(-0.22, 0.45, 0.2),
    new THREE.BoxGeometry(0.4, 0.2, 0.44).translate(0.26, 0.4, -0.22),
  ])!;
  inst(masonry, walls, wallCols, 0, true, 'masonry');
  for (const mesh of inst(ts.bush, bushes, bushCols, 0, false, ts.paint.grove, true, ts.bushGrade, ts.shaded ? withVertexShade : undefined) ?? []) mesh.name = 'bush';
  // Moss cushions on the rock: a few soft lobes run together, flattened onto the ledge.
  if (cushions.length) {
    const lobe = (r: number, x: number, z: number) => new THREE.IcosahedronGeometry(r, 1).scale(1, 0.42, 1).translate(x, r * 0.12, z);
    inst(mergeGeometries([lobe(0.55, 0, 0), lobe(0.42, 0.5, 0.18), lobe(0.36, -0.38, 0.3), lobe(0.3, 0.1, -0.45)])!, cushions, cushionCols, 0, false, ts.paint.grove, true);
  }
  inst(new THREE.ConeGeometry(0.05, 0.7, 3).translate(0, 0.35, 0), reeds, null, 0x7e9446, false, undefined, false);
  const flowerGeo = mergeGeometries([
    new THREE.CylinderGeometry(0.012, 0.012, 0.25, 3).translate(0, 0.125, 0).toNonIndexed(),
    new THREE.OctahedronGeometry(0.06, 0).translate(0, 0.27, 0),
  ])!;
  inst(flowerGeo, flowers, flowerCols, 0, false, undefined, false);
}
