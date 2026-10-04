import * as THREE from 'three';
import type { Game } from '../../game';
import { Cell } from '../../world/layout';
import { TREE_STYLE, treeSet, type TreeKind, type TreeStyle } from '../../world/trees';
import { OCCLUDE, treeMeshes } from '../../world/worldView';
import { frames, gameplayCamera, hideEnemies, openField, overlay, placeSun, zoneShot, type Shot } from './stage';

export const COLORS: { label: string; color: number }[] = [
  { label: 'green', color: 0x5a9a44 },
  { label: 'pink blossom', color: 0xb86a8a },
  { label: 'autumn gold', color: 0xc8a040 },
];
const PINE = 0x4b7a3a;

interface Slot { label: string; style: TreeStyle; kind: TreeKind; color: number; variant: number }

export async function lineup(g: Game, shot: Shot) {
  g.travel('foothills', true);
  await frames(20);
  hideEnemies(g);
  // Clear the stage: the zone's own trees and bushes would crowd the lineup.
  g.zone.group.traverse((o) => {
    if (o.name === 'tree' || o.name === 'bush') o.visible = false;
  });
  // Rows: the broadleaf crowns in each colour; then the pines and the old faceted trees.
  const crowns = treeSet('block').canopy.grove.length, pines = treeSet('block').canopy.pine.length;
  const rows: Slot[][] = COLORS.map((c) => Array.from({ length: crowns }, (_, v): Slot => ({ label: `crown ${v + 1} · ${c.label}`, style: 'block', kind: 'grove', color: c.color, variant: v })));
  rows.push([
    ...Array.from({ length: pines }, (_, v): Slot => ({ label: `pine ${v + 1}`, style: 'block', kind: 'pine', color: PINE, variant: v })),
    { label: 'old faceted broadleaf', style: 'faceted', kind: 'grove', color: COLORS[0].color, variant: 0 },
    { label: 'old faceted pine', style: 'faceted', kind: 'pine', color: PINE, variant: 0 },
  ]);
  const cols = Math.max(...rows.map((r) => r.length));
  const c = openField(g, 9);
  const hAt = g.zone.view.heightAt;
  const SX = 3.8, SZ = 3.9;
  const stage = new THREE.Group();
  g.zone.group.add(stage);
  const trees: { slot: Slot; pos: THREE.Vector3; meshes: THREE.Object3D[] }[] = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.35, 0));
  rows.forEach((row, r) => row.forEach((slot, col) => {
    const x = c.x + (col - (cols - 1) / 2) * SX, z = c.z + (r - 1.5) * SZ;
    const pos = new THREE.Vector3(x, hAt(x, z) - 0.05, z);
    m.compose(pos, q, new THREE.Vector3(1.1, 1.1, 1.1));
    const meshes = treeMeshes(slot.style, slot.kind, [m.clone()], [new THREE.Color(slot.color)], slot.variant);
    stage.add(...meshes);
    trees.push({ slot, pos, meshes });
  }));
  // The hero stands in the gap between the autumn row and the pines, for scale.
  const p = g.player;
  p.pos.set(c.x + 0.5 * SX, 0, c.z + 1.05 * SZ);
  p.stop();
  p.faceTo(p.x - 0.4, p.z + 1, true);
  g.camPos.copy(p.pos);
  g.debug.timeScale = 0;
  g.update(0);
  document.body.classList.add('inspect-clean');

  // 1. The gameplay camera angle (zoomed out a touch to fit the grid), the grid centred.
  const cy = hAt(c.x, c.z);
  const ov = overlay();
  g.debug.hold = () => {
    // No cut-away: the hero stands among the lineup, and nothing should be hidden.
    OCCLUDE.uOccOn.value = 0;
    gameplayCamera(g, c.x - 0.3, cy, c.z + 0.6, 0.92);
    return false;
  };
  await frames(2);
  const toScreen = (v: THREE.Vector3) => {
    const s = v.clone().project(g.camera);
    return { x: ((s.x + 1) / 2) * innerWidth, y: ((1 - s.y) / 2) * innerHeight };
  };
  rows.forEach((row, r) => {
    const s = toScreen(new THREE.Vector3(c.x - ((cols - 1) / 2) * SX - 1.8, cy + 2, c.z + (r - 1.5) * SZ));
    ov.label(r < COLORS.length ? COLORS[r].label : 'pines · old trees', s.x - 110, s.y - 10);
  });
  await shot('trees-lineup-gameplay');
  ov.el.remove();

  // 2. Close 3/4 views, each tree on its own.
  const eyeDir = new THREE.Vector3(0.62, 0.42, 0.8).normalize();
  const close = (t: (typeof trees)[number], dist = 7.3) => {
    const at = t.pos.clone().add(new THREE.Vector3(0, 2.0, 0));
    return { t, at, eye: at.clone().add(eyeDir.clone().multiplyScalar(dist)) };
  };
  const sheet = async (cells: ReturnType<typeof close>[], nc: number, nr: number, name: string) => {
    const cv = g.renderer.domElement;
    const out = document.createElement('canvas');
    out.width = cv.width;
    out.height = cv.height;
    Object.assign(out.style, { position: 'fixed', inset: '0', width: '100vw', height: '100vh', zIndex: '1999' });
    const ctx = out.getContext('2d')!;
    let done = false;
    g.debug.hold = () => {
      if (done) return true;
      OCCLUDE.uOccOn.value = 0;
      p.obj.visible = false;
      const cw = out.width / nc, ch = out.height / nr;
      cells.forEach((cell, i) => {
        for (const t of trees) for (const o of t.meshes) o.visible = t === cell.t;
        g.camera.position.copy(cell.eye);
        g.camera.lookAt(cell.at);
        placeSun(g, cell.at.x, cell.at.z);
        g.draw();
        ctx.drawImage(cv, 0, 0, cv.width, cv.height, (i % nc) * cw, Math.floor(i / nc) * ch, cw, ch);
      });
      done = true;
      return true;
    };
    await frames(3);
    document.body.appendChild(out);
    const ov2 = overlay();
    cells.forEach((cell, i) => ov2.label(cell.t.slot.label, (i % nc) * (innerWidth / nc) + 6, Math.floor(i / nc) * (innerHeight / nr) + 6));
    await shot(name);
    ov2.el.remove();
    out.remove();
  };
  await sheet(trees.map((t) => close(t)), cols, rows.length, 'trees-lineup-close');
  // The crowns larger, one colour per sheet (green and pink), and the pines.
  for (const r of [0, 1, 3]) await sheet(trees.filter((t) => t.pos.z === trees.find((u) => u.slot === rows[r][0])!.pos.z).map((t) => close(t, 6.7)), 2, 2, `trees-lineup-close-${r === 3 ? 'pines' : COLORS[r].label.split(' ')[0]}`);
  p.obj.visible = true;
  stage.removeFromParent();
  g.debug.hold = null;
  g.debug.timeScale = 1;
  document.body.classList.remove('inspect-clean');
}

/** Candidate spots: forest edges, deep forest and the map rim, with woods filling the screen. */
export async function scout(g: Game, shot: Shot) {
  for (const zone of ['foothills', 'keep', 'ruin']) {
    g.travel(zone, true);
    await frames(20);
    const L = g.zone.layout;
    const at = (x: number, z: number) => (x < 0 || z < 0 || x >= L.w || z >= L.h ? Cell.Void : L.cells[z * L.w + x]);
    const count = (x: number, z: number, x0: number, x1: number, z0: number, z1: number, c: Cell) => {
      let n = 0;
      for (let dz = z0; dz <= z1; dz++) for (let dx = x0; dx <= x1; dx++) if (at(x + dx, z + dz) === c) n++;
      return n;
    };
    const kinds: Record<string, { x: number; z: number; s: number }[]> = { edge: [], forest: [], rim: [] };
    for (let z = 8; z < L.h - 8; z += 2) for (let x = 8; x < L.w - 8; x += 2) {
      if (at(x, z) !== Cell.Ground || L.fluid[z * L.w + x]) continue;
      const woods = count(x, z, -10, 10, -10, -2, Cell.Tree), open = count(x, z, -6, 6, -1, 5, Cell.Ground);
      if (woods > 25 && open > 60) kinds.edge.push({ x, z, s: Math.min(woods, 90) + open * 0.8 });
      const around = count(x, z, -5, 5, -5, 5, Cell.Tree);
      if (around > 50) kinds.forest.push({ x, z, s: around });
      const edgeD = Math.min(x, z, L.w - 1 - x, L.h - 1 - z);
      const rimTrees = count(x, z, -8, 8, -8, 8, Cell.Tree);
      if (edgeD < 22 && rimTrees > 30) kinds.rim.push({ x, z, s: rimTrees - edgeD * 2 });
    }
    for (const [kind, list] of Object.entries(kinds)) {
      list.sort((a, b) => b.s - a.s);
      const picks: typeof list = [];
      for (const f of list) if (picks.length < 3 && picks.every((p) => Math.hypot(p.x - f.x, p.z - f.z) > 20)) picks.push(f);
      for (const f of picks) await zoneShot(g, shot, zone, TREE_STYLE.value, { x: f.x + 0.5, z: f.z + 0.5 }, `trees-scout-${zone}-${kind}-${f.x + 0.5}-${f.z + 0.5}`);
    }
  }
}
