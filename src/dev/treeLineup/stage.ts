import * as THREE from 'three';
import type { Game } from '../../game';
import { Cell, Ground } from '../../world/layout';
import { TREE_STYLE, type GrownKind, type TreeStyle } from '../../world/trees';
import { grownMeshes, OCCLUDE, treeMeshes } from '../../world/worldView';
import { perf } from '../inspect';

/** The tree suites' stage: placing the hero, the camera and the sun, planting trees, and taking views and sheets of views. */

export type Shot = (name: string) => Promise<void>;
const raf = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
export const frames = async (n: number) => {
  for (let i = 0; i < n; i++) await raf();
};

export function hideEnemies(g: Game) {
  for (const e of g.zone.enemies) {
    e.dead = true;
    e.obj.removeFromParent();
  }
  g.zone.enemies = [];
}

export function overlay() {
  const el = document.createElement('div');
  el.id = 'inspect-overlay';
  document.body.appendChild(el);
  const label = (text: string, x: number, y: number, big = false) => {
    const l = document.createElement('div');
    l.className = 'lbl';
    l.textContent = text;
    l.style.left = `${x}px`;
    l.style.top = `${y}px`;
    if (big) l.style.font = "700 15px 'Alegreya Sans', sans-serif";
    el.appendChild(l);
  };
  return { el, label };
}

/** Gameplay camera framing a point (game.ts updateCamera), with the sun and fill placed the same way. */
export function gameplayCamera(g: Game, x: number, y: number, z: number, zoom = 1) {
  g.camera.position.set(x, y + 21 * zoom, z + 14 * zoom);
  g.camera.lookAt(x, y + 1, z);
  placeSun(g, x, z);
}

export function placeSun(g: Game, x: number, z: number) {
  g.sun.position.set(x + 14, 28, z + 10);
  g.sun.target.position.set(x, 0, z);
  g.fill.position.set(x - 18, 14, z - 6);
}

/** An open, flat stretch of grass at least `r` cells round (for the lineup). */
export function openField(g: Game, r: number) {
  const L = g.zone.layout, hAt = g.zone.view.heightAt;
  let best: { x: number; z: number; score: number } | null = null;
  for (let cz = r + 2; cz < L.h - r - 2; cz += 2) for (let cx = r + 2; cx < L.w - r - 2; cx += 2) {
    let ok = true, lo = Infinity, hi = -Infinity;
    for (let dz = -r; dz <= r && ok; dz++) for (let dx = -r; dx <= r; dx++) {
      const i = (cz + dz) * L.w + cx + dx;
      if ((L.cells[i] !== Cell.Ground && L.cells[i] !== Cell.Tree) || L.fluid[i] || L.ground[i] === Ground.Path) {
        ok = false;
        break;
      }
      const hh = hAt(cx + dx, cz + dz);
      lo = Math.min(lo, hh);
      hi = Math.max(hi, hh);
    }
    if (!ok || hi - lo > 0.4) continue;
    const score = -(hi - lo) - Math.abs(cz - L.h * 0.7) * 0.01;
    if (!best || score > best.score) best = { x: cx + 0.5, z: cz + 0.5, score };
  }
  return best ?? { x: L.entry.x, z: L.entry.z - 8 };
}

/** A zone in a tree style through the gameplay camera, the hero at `spot`; with `cost`, the view's frame cost and draw counts too. */
export async function zoneShot(g: Game, shot: Shot, zone: string, style: TreeStyle, spot: { x: number; z: number; zoom?: number }, name: string, cost = false) {
  TREE_STYLE.value = style;
  if (zone === 'keep') for (const k of Object.keys(g.save.keep)) g.save.keep[k] = true;
  g.travel(zone, true);
  await frames(20);
  hideEnemies(g);
  const p = g.player;
  p.pos.set(spot.x, 0, spot.z);
  p.stop();
  p.faceTo(spot.x - 1, spot.z - 1.5, true);
  g.camPos.copy(p.pos);
  g.camZoom = spot.zoom ?? 1;
  g.debug.timeScale = 0;
  g.update(0);
  document.body.classList.add('inspect-clean');
  await frames(6);
  const out = cost ? await measure(g) : undefined;
  await shot(name);
  document.body.classList.remove('inspect-clean');
  g.camZoom = 1;
  g.debug.timeScale = 1;
  return out;
}

/** Frame cost and draw counts of the current view (the world frozen). */
export async function measure(g: Game) {
  const ps = await perf(g, 40);
  const info = g.renderer.info;
  info.autoReset = false;
  info.reset();
  g.draw();
  info.autoReset = true;
  return { cpuMs: ps.cpuMs, gpuMs: ps.gpuMs, gpuP95: ps.gpuP95, calls: info.render.calls, triangles: info.render.triangles };
}

/** Stand the hero at (x, z) facing the camera, the gameplay camera following them. */
export function standHero(g: Game, x: number, z: number, zoom = 1) {
  const p = g.player;
  p.pos.set(x, g.zone.groundY(x, z), z);
  p.stop();
  p.faceTo(x - 0.3, z + 1, true);
  g.camPos.copy(p.pos);
  g.camZoom = zoom;
  g.update(0);
  return p.pos.clone();
}

/**
 * Open walkable ground on a tree's own level `d` m from its trunk, west of it first (so the tree
 * stands to the hero's right), then east, then on the camera's side.
 */
export function besideTree(g: Game, at: THREE.Vector3, d = 6.5) {
  for (const a of [Math.PI, 0, Math.PI * 0.75, Math.PI * 0.25, Math.PI * 0.5]) {
    for (const dd of [d, d + 1.5, d - 1.5]) {
      const x = at.x + Math.cos(a) * dd, z = at.z + Math.sin(a) * dd;
      if (g.zone.nav.isWalkable(x, z) && Math.abs(g.zone.groundY(x, z) - at.y) < 0.6) return { x, z };
    }
  }
  return null;
}

/** An open stretch of walkable ground at most `reach` m from (x, z), level within `r` m round it (for a staged tree and the hero beside it). */
export function openGround(g: Game, x: number, z: number, reach: number, r: number) {
  const nav = g.zone.nav, y = (px: number, pz: number) => g.zone.groundY(px, pz);
  let best: { x: number; z: number; d: number } | null = null;
  for (let dz = -reach; dz <= reach; dz += 1) for (let dx = -reach; dx <= reach; dx += 1) {
    const cx = x + dx, cz = z + dz, d = Math.hypot(dx, dz);
    if (d > reach || (best && d >= best.d) || !nav.isWalkable(cx, cz)) continue;
    const y0 = y(cx, cz);
    let ok = true;
    for (let a = 0; a < 16 && ok; a++) for (const rr of [r * 0.5, r]) {
      const px = cx + Math.cos((a / 16) * Math.PI * 2) * rr, pz = cz + Math.sin((a / 16) * Math.PI * 2) * rr;
      if (!nav.isWalkable(px, pz) || Math.abs(y(px, pz) - y0) > 0.5) ok = false;
    }
    if (ok) best = { x: cx, z: cz, d };
  }
  return best;
}

/** A free camera at `eye` looking at `look`, fog pushed back and the sun's shadows cast over `span` m round the focus. */
export async function freeShot(g: Game, shot: Shot, name: string, eye: THREE.Vector3, look: THREE.Vector3, span: number) {
  const fog = g.scene.fog as THREE.Fog, sc = g.sun.shadow.camera;
  const keep = { near: fog.near, far: fog.far, l: sc.left, r: sc.right, t: sc.top, b: sc.bottom, f: sc.far };
  g.debug.hold = () => {
    fog.near = 400;
    fog.far = 900;
    Object.assign(sc, { left: -span, bottom: -span, right: span, top: span, far: 60 + span * 3 });
    sc.updateProjectionMatrix();
    const k = 1 + span / 30;
    g.sun.position.set(look.x + 14 * k, look.y + 28 * k, look.z + 10 * k);
    g.sun.target.position.copy(look);
    g.fill.position.set(look.x - 18, look.y + 14, look.z - 6);
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
    Object.assign(fog, { near: keep.near, far: keep.far });
    Object.assign(sc, { left: keep.l, right: keep.r, top: keep.t, bottom: keep.b, far: keep.f });
    sc.updateProjectionMatrix();
  }
}

/** Plant one tree into the current zone (instanced with the world's own materials): a grown kind, or a block broadleaf. */
export function plantTree(g: Game, parent: THREE.Object3D, kind: GrownKind | 'block', x: number, z: number, variant: number, yaw: number, color: number) {
  const pos = new THREE.Vector3(x, g.zone.view.heightAt(x, z) - 0.05, z);
  const m = new THREE.Matrix4().compose(pos, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)), new THREE.Vector3(1, 1, 1));
  const meshes = kind === 'block' ? treeMeshes('block', 'grove', [m], [new THREE.Color(color)], variant) : grownMeshes(kind, [m], [new THREE.Color(color)], variant);
  parent.add(...meshes);
  return { pos, meshes };
}

/** The low three-quarter angle the close-ups take (from the south-east, a little above the crown's foot). */
export const CLOSE_DIR = new THREE.Vector3(0.55, 0.22, 0.8).normalize();

/** Hide the world's own trees and bushes standing within `r` m of any of `at` (so staged trees stand clear). */
export function clearTrees(g: Game, at: THREE.Vector3[], r: number) {
  const m = new THREE.Matrix4(), p = new THREE.Vector3(), none = new THREE.Matrix4().makeScale(0, 0, 0);
  g.zone.group.traverse((o) => {
    if (!(o instanceof THREE.InstancedMesh) || (o.name !== 'tree' && o.name !== 'bush')) return;
    for (let i = 0; i < o.count; i++) {
      o.getMatrixAt(i, m);
      p.setFromMatrixPosition(m);
      if (at.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < r)) o.setMatrixAt(i, none);
    }
    o.instanceMatrix.needsUpdate = true;
  });
}

export interface SheetView {
  label: string;
  /** Before the view is drawn (which tree shows). */
  prepare: () => void;
  eye: THREE.Vector3;
  look: THREE.Vector3;
}

/** Several views side by side in one picture, `cols` to a row, each labelled (each copied out the frame it is drawn: the canvas is cleared once shown). */
export async function sheetShot(g: Game, shot: Shot, name: string, views: SheetView[], cols: number) {
  const cv = g.renderer.domElement, sheet = document.createElement('canvas');
  sheet.width = cv.width;
  sheet.height = cv.height;
  Object.assign(sheet.style, { position: 'fixed', inset: '0', width: '100vw', height: '100vh', zIndex: '1999' });
  const ctx = sheet.getContext('2d')!;
  ctx.fillStyle = '#1c1a1e';
  ctx.fillRect(0, 0, sheet.width, sheet.height);
  const rows = Math.ceil(views.length / cols), w = cv.width / cols, h = cv.height / rows;
  const fog = g.scene.fog as THREE.Fog, keep = { near: fog.near, far: fog.far };
  for (let i = 0; i < views.length; i++) {
    const v = views[i];
    v.prepare();
    let done = false;
    g.debug.hold = () => {
      if (done) return true;
      fog.near = 400;
      fog.far = 900;
      OCCLUDE.uOccOn.value = 0;
      g.camera.position.copy(v.eye);
      g.camera.lookAt(v.look);
      placeSun(g, v.look.x, v.look.z);
      g.draw();
      const sw = Math.min(cv.width, cv.height * (w / h)), sh = sw * (h / w);
      ctx.drawImage(cv, (cv.width - sw) / 2, (cv.height - sh) / 2, sw, sh, (i % cols) * w, Math.floor(i / cols) * h, w - 4, h - 4);
      done = true;
      return true;
    };
    await frames(3);
  }
  g.debug.hold = null;
  Object.assign(fog, keep);
  document.body.appendChild(sheet);
  const ov = overlay();
  const scale = innerWidth / cv.width;
  views.forEach((v, i) => ov.label(v.label, ((i % cols) * w) * scale + 8, Math.floor(i / cols) * h * scale + 8));
  await shot(name);
  ov.el.remove();
  sheet.remove();
}

/** Put the inspect state back as the game had it (after a suite, however it ended). */
export function restore(g: Game, stage: THREE.Object3D, style: TreeStyle) {
  stage.removeFromParent();
  g.debug.hold = null;
  document.body.classList.remove('inspect-clean');
  g.camZoom = 1;
  g.debug.timeScale = 1;
  TREE_STYLE.value = style;
}
