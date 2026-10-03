import * as THREE from 'three';
import { CASTLE_PLAN } from '../data/zoneMaps';
import type { Game } from '../game';
import { Cell, Ground } from '../world/layout';
import { GROWN, GROWN_KINDS, grownTrees, grownTriangles, TREE_STYLE, TREE_STYLES, treeSet, treeTriangles, type GrownKind, type TreeKind, type TreeStyle } from '../world/trees';
import { grownMeshes, OCCLUDE, treeMeshes } from '../world/worldView';
import { perf } from './inspect';

/**
 * Dev only (inspect suite `trees`): the trees of trees.ts in the real game renderer with game
 * lighting. Captures:
 * - a lineup of every canopy variant (green / pink blossom / autumn gold crowns, the pines, and the
 *   old faceted trees for reference) from the gameplay camera, and each tree close up from a low
 *   3/4 angle;
 * - tree-heavy views at the gameplay camera: the Foothills forest edge, deep forest and rim, the
 *   keep island's lawn and rim, the Sunken Ruin; the Foothills spots also with the faceted
 *   fallback, with frame time and triangle counts (report.json `trees`);
 * - the grown oak (style 'natural', see oakSuite): beside the hero and an old block tree, close
 *   up, by the castle in the keep zone and in a wood, with frame cost and draw counts
 *   (report.json `trees.oak`).
 * - a grown kind's progress (`trees:grown:<kind>`, see grownSuite): beside the hero and an oak on the
 *   lawn under the castle walls through the gameplay camera, and close up.
 * - the whole woodcutting ladder (`trees:ladder`, see ladderSuite): its six species in two shapes
 *   each, every new species close up, and a forest of the Foothills as it ships, with frame costs.
 * `trees:oak` captures only the oak; `trees:scout` captures candidate spots instead (to pick the views).
 */

type Shot = (name: string) => Promise<void>;
const raf = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
const frames = async (n: number) => {
  for (let i = 0; i < n; i++) await raf();
};

const COLORS: { label: string; color: number }[] = [
  { label: 'green', color: 0x5a9a44 },
  { label: 'pink blossom', color: 0xb86a8a },
  { label: 'autumn gold', color: 0xc8a040 },
];
const PINE = 0x4b7a3a;

/** Hero spots for the zone views (picked with trees:scout). */
const VIEWS: { zone: string; label: string; x: number; z: number; zoom?: number }[] = [
  { zone: 'foothills', label: 'edge', x: 70.5, z: 154.5 },
  { zone: 'foothills', label: 'forest', x: 0, z: 0 },
  { zone: 'foothills', label: 'rim', x: 0, z: 0 },
  { zone: 'keep', label: 'lawn', x: 114.5, z: 28.5 },
  { zone: 'keep', label: 'rim', x: 0, z: 0 },
  { zone: 'ruin', label: 'grove', x: 0, z: 0 },
];

export async function treesSuite(g: Game, shot: Shot, opts: string[]) {
  const report: Record<string, unknown> = {};
  report.triangles = Object.fromEntries(TREE_STYLES.map((s) => [s, treeTriangles(s)]));
  report.variants = Object.fromEntries((['grove', 'pine'] as TreeKind[]).map((k) => [k, treeSet('block').canopy[k].length]));
  const shipped = TREE_STYLE.value;
  if (opts[0] === 'grown' && GROWN_KINDS.includes(opts[1] as GrownKind)) return { ...report, grown: await grownSuite(g, shot, opts[1] as GrownKind) };
  if (opts[0] === 'ladder') return { ...report, ladder: await ladderSuite(g, shot) };
  if (opts.includes('scout')) {
    await scout(g, shot);
    return report;
  }
  report.oak = await oakSuite(g, shot);
  if (opts.includes('oak')) return report;
  await lineup(g, shot);
  const frame: Record<string, unknown> = {};
  for (const v of VIEWS) {
    for (const style of v.zone === 'foothills' ? TREE_STYLES : [shipped]) {
      const name = `trees-${v.zone}-${v.label}${style === shipped ? '' : `-${style}`}`;
      frame[name] = await zoneShot(g, shot, v.zone, style, v, name, v.zone === 'foothills');
    }
  }
  report.frame = frame;
  TREE_STYLE.value = shipped;
  return report;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function hideEnemies(g: Game) {
  for (const e of g.zone.enemies) {
    e.dead = true;
    e.obj.removeFromParent();
  }
  g.zone.enemies = [];
}

function overlay() {
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
function gameplayCamera(g: Game, x: number, y: number, z: number, zoom = 1) {
  g.camera.position.set(x, y + 21 * zoom, z + 14 * zoom);
  g.camera.lookAt(x, y + 1, z);
  placeSun(g, x, z);
}

function placeSun(g: Game, x: number, z: number) {
  g.sun.position.set(x + 14, 28, z + 10);
  g.sun.target.position.set(x, 0, z);
  g.fill.position.set(x - 18, 14, z - 6);
}

/** An open, flat stretch of grass at least `r` cells round (for the lineup). */
function openField(g: Game, r: number) {
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

// ─── Lineup ─────────────────────────────────────────────────────────────────

interface Slot { label: string; style: TreeStyle; kind: TreeKind; color: number; variant: number }

async function lineup(g: Game, shot: Shot) {
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

// ─── Zone views ─────────────────────────────────────────────────────────────

async function zoneShot(g: Game, shot: Shot, zone: string, style: TreeStyle, spot: { x: number; z: number; zoom?: number }, name: string, measure = false) {
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
  let out: unknown;
  if (measure) {
    const ps = await perf(g, 40);
    const info = g.renderer.info;
    info.autoReset = false;
    info.reset();
    g.draw();
    info.autoReset = true;
    out = { cpuMs: ps.cpuMs, gpuMs: ps.gpuMs, gpuP95: ps.gpuP95, calls: info.render.calls, triangles: info.render.triangles };
  }
  await shot(name);
  document.body.classList.remove('inspect-clean');
  g.camZoom = 1;
  g.debug.timeScale = 1;
  return out;
}

/** Candidate spots: forest edges, deep forest and the map rim, with woods filling the screen. */
async function scout(g: Game, shot: Shot) {
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

// ─── The grown oak ──────────────────────────────────────────────────────────

/** Frame cost and draw counts of the current view (the world frozen). */
async function measure(g: Game) {
  const ps = await perf(g, 40);
  const info = g.renderer.info;
  info.autoReset = false;
  info.reset();
  g.draw();
  info.autoReset = true;
  return { cpuMs: ps.cpuMs, gpuMs: ps.gpuMs, gpuP95: ps.gpuP95, calls: info.render.calls, triangles: info.render.triangles };
}

/** Where the zone's grown oaks stand (their crowns' instances). */
function oaksInZone(g: Game) {
  const crowns = new Set(grownTrees('oak').canopy);
  const at: THREE.Vector3[] = [];
  const m = new THREE.Matrix4();
  g.zone.group.traverse((o) => {
    if (!(o instanceof THREE.InstancedMesh) || !crowns.has(o.geometry)) return;
    for (let i = 0; i < o.count; i++) {
      o.getMatrixAt(i, m);
      at.push(new THREE.Vector3().setFromMatrixPosition(m));
    }
  });
  return at;
}

/** Stand the hero at (x, z) facing the camera, the gameplay camera following them. */
function standHero(g: Game, x: number, z: number, zoom = 1) {
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
function besideTree(g: Game, at: THREE.Vector3, d = 6.5) {
  for (const a of [Math.PI, 0, Math.PI * 0.75, Math.PI * 0.25, Math.PI * 0.5]) {
    for (const dd of [d, d + 1.5, d - 1.5]) {
      const x = at.x + Math.cos(a) * dd, z = at.z + Math.sin(a) * dd;
      if (g.zone.nav.isWalkable(x, z) && Math.abs(g.zone.groundY(x, z) - at.y) < 0.6) return { x, z };
    }
  }
  return null;
}

/** An open stretch of walkable ground at most `reach` m from (x, z), level within `r` m round it (for a staged tree and the hero beside it). */
function openGround(g: Game, x: number, z: number, reach: number, r: number) {
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
async function freeShot(g: Game, shot: Shot, name: string, eye: THREE.Vector3, look: THREE.Vector3, span: number) {
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
function plantTree(g: Game, parent: THREE.Object3D, kind: GrownKind | 'block', x: number, z: number, variant: number, yaw: number, color: number) {
  const pos = new THREE.Vector3(x, g.zone.view.heightAt(x, z) - 0.05, z);
  const m = new THREE.Matrix4().compose(pos, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)), new THREE.Vector3(1, 1, 1));
  const meshes = kind === 'block' ? treeMeshes('block', 'grove', [m], [new THREE.Color(color)], variant) : grownMeshes(kind, [m], [new THREE.Color(color)], variant);
  parent.add(...meshes);
  return { pos, meshes };
}

/** Oak colour in the lineup and the staged shots: the grown oaks' first summer green. */
const OAK_GREEN = 0x4f8a3b;

/** The low three-quarter angle the close-ups take (from the south-east, a little above the crown's foot). */
const CLOSE_DIR = new THREE.Vector3(0.55, 0.22, 0.8).normalize();

/**
 * The grown oak (style 'natural'):
 * - trees-oak-lineup: its three seeded variants side by side in the Foothills meadow with the hero
 *   and one of the old block trees beside them, through the gameplay camera drawn back to fit;
 * - the keep zone grown in the natural style: trees-oak-landing, the hero beside an oak near the
 *   head of the castle climb through the gameplay camera; trees-oak-landing-view, the same place
 *   from the castle review's landing viewpoint (the picture Mitchell pinned the old trees on);
 * - one oak planted on open ground by the fields under the castle rock: trees-oak-farm through the
 *   gameplay camera, trees-oak-close from a low three-quarter angle with the castle beyond,
 *   trees-oak-close-hero nearer, at the hero's foot, and trees-oak-variants, each variant there;
 * - trees-oak-wood / trees-oak-wood-block: the thickest wood of oaks on the island through the
 *   gameplay camera, and the same spot with the block trees, each with its frame cost (and the
 *   landing's with the block trees too, for comparison).
 */
async function oakSuite(g: Game, shot: Shot) {
  const out: Record<string, unknown> = {};
  const shipped = TREE_STYLE.value;
  out.triangles = grownTriangles('oak');
  g.debug.timeScale = 0;
  document.body.classList.add('inspect-clean');

  // The lineup, in an open stretch of the Foothills meadow.
  TREE_STYLE.value = 'block';
  g.travel('foothills', true);
  await frames(20);
  hideEnemies(g);
  g.zone.group.traverse((o) => {
    if (o.name === 'tree' || o.name === 'bush') o.visible = false;
  });
  const c = openField(g, 9), hAt = g.zone.view.heightAt;
  const stage = new THREE.Group();
  g.zone.group.add(stage);
  const oaks = [0, 1, 2].map((v) => plantTree(g, stage, 'oak', c.x + (v - 1) * 13.5, c.z - 2.5, v, 0.6 + v * 1.9, OAK_GREEN));
  const block = plantTree(g, stage, 'block', c.x + 22, c.z + 3, 0, 0.35, COLORS[0].color);
  standHero(g, c.x - 6.8, c.z + 3.2, 1.55);
  g.debug.hold = () => {
    OCCLUDE.uOccOn.value = 0;
    gameplayCamera(g, c.x + 1.5, hAt(c.x, c.z), c.z + 0.5, 1.55);
    return false;
  };
  await frames(3);
  const ov = overlay();
  const toScreen = (v: THREE.Vector3) => {
    const p = v.clone().project(g.camera);
    return { x: ((p.x + 1) / 2) * innerWidth, y: ((1 - p.y) / 2) * innerHeight };
  };
  oaks.forEach((o, i) => {
    const sp = toScreen(o.pos.clone().add(new THREE.Vector3(0, 0, 7.5)));
    ov.label(`grown oak ${i + 1}`, sp.x - 40, sp.y);
  });
  const bs = toScreen(block.pos.clone().add(new THREE.Vector3(0, 0, 2.5)));
  ov.label('old block tree', bs.x - 45, bs.y);
  await shot('trees-oak-lineup');
  ov.el.remove();
  out.lineup = await measure(g);
  // The wind: the first oak close through the gameplay camera at two moments 1.4 s apart.
  for (const [name, t] of [['trees-oak-sway-a', 10], ['trees-oak-sway-b', 11.4]] as const) {
    g.debug.hold = () => {
      OCCLUDE.uOccOn.value = 0;
      g.zone.view.tick(t);
      gameplayCamera(g, oaks[0].pos.x, oaks[0].pos.y, oaks[0].pos.z + 1, 0.62);
      return false;
    };
    await shot(name);
  }
  g.debug.hold = null;
  stage.removeFromParent();

  // The keep zone grown in the natural style.
  TREE_STYLE.value = 'natural';
  for (const k of Object.keys(g.save.keep)) g.save.keep[k] = true;
  g.travel('keep', true);
  await frames(20);
  hideEnemies(g);
  const inKeep = oaksInZone(g);
  out.keepOaks = inKeep.length;
  const P = CASTLE_PLAN;
  /** The oak nearest (x, z) with open ground beside it on its own level, and that spot. */
  const oakNear = (x: number, z: number) => {
    for (const o of [...inKeep].sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z))) {
      const spot = besideTree(g, o);
      if (spot) return { o, spot };
    }
    return null;
  };
  // Beside an oak near the head of the climb, the castle beyond.
  const landing = oakNear(P.gate.x + 48, P.gate.z + 8);
  if (landing) {
    standHero(g, landing.spot.x, landing.spot.z);
    await frames(4);
    await shot('trees-oak-landing');
    out.landing = { oak: [landing.o.x, landing.o.z], hero: [landing.spot.x, landing.spot.z], ...(await measure(g)) };
  }
  const y0 = g.zone.groundY(P.fountain.x, P.fountain.z);
  g.player.obj.visible = false;
  await freeShot(g, shot, 'trees-oak-landing-view', new THREE.Vector3(P.gate.x + 72, y0 + 12, P.gate.z + 22), new THREE.Vector3(P.gate.x + 50, y0 + 2, P.gate.z + 6), 24);
  g.player.obj.visible = true;

  // One oak planted on open ground by the fields, under the castle rock.
  const field = openGround(g, P.gate.x + 10, P.gate.z + 20, 14, 7.5);
  if (field) {
    const staged = new THREE.Group();
    g.zone.group.add(staged);
    const planted = [0, 1, 2].map((v) => plantTree(g, staged, 'oak', field.x, field.z, v, 2.2, OAK_GREEN));
    const solo = (v: number) => planted.forEach((p, i) => p.meshes.forEach((mesh) => (mesh.visible = i === v)));
    solo(0);
    const oak = planted[0].pos, spot = besideTree(g, oak) ?? { x: oak.x - 6.5, z: oak.z };
    const foot = standHero(g, spot.x, spot.z);
    await frames(4);
    await shot('trees-oak-farm');
    out.farm = { oak: [oak.x, oak.z], hero: [spot.x, spot.z] };
    const look = oak.clone().add(new THREE.Vector3(0, 4.6, 0));
    await freeShot(g, shot, 'trees-oak-close', look.clone().addScaledVector(CLOSE_DIR, 24), look, 20);
    await freeShot(g, shot, 'trees-oak-close-hero', foot.clone().add(new THREE.Vector3(1.5, 1.8, 9)), oak.clone().add(new THREE.Vector3(-1, 3.6, 0)), 20);
    // Each variant there in turn, from the same angle, side by side in one picture.
    const cv = g.renderer.domElement, sheet = document.createElement('canvas');
    sheet.width = cv.width;
    sheet.height = cv.height;
    Object.assign(sheet.style, { position: 'fixed', inset: '0', width: '100vw', height: '100vh', zIndex: '1999' });
    const ctx = sheet.getContext('2d')!;
    ctx.fillStyle = '#1c1a1e';
    ctx.fillRect(0, 0, sheet.width, sheet.height);
    g.player.obj.visible = false;
    for (let v = 0; v < planted.length; v++) {
      solo(v);
      let done = false;
      // (Copied out in the same frame it is drawn: the canvas is cleared once shown.)
      g.debug.hold = () => {
        if (done) return true;
        OCCLUDE.uOccOn.value = 0;
        g.camera.position.copy(look).addScaledVector(CLOSE_DIR, 25);
        g.camera.lookAt(look);
        placeSun(g, look.x, look.z);
        g.draw();
        const w = cv.width / 3, h = cv.height * 0.6, sw = cv.height * (w / h);
        ctx.drawImage(cv, (cv.width - sw) / 2, 0, sw, cv.height, v * w, cv.height * 0.2, w, h);
        done = true;
        return true;
      };
      await frames(3);
    }
    document.body.appendChild(sheet);
    const ov2 = overlay();
    planted.forEach((_, i) => ov2.label(`grown oak ${i + 1}`, (i * innerWidth) / 3 + 8, innerHeight * 0.2 + 8));
    await shot('trees-oak-variants');
    ov2.el.remove();
    sheet.remove();
    g.player.obj.visible = true;
    g.debug.hold = null;
    staged.removeFromParent();
  }

  // The thickest wood of oaks on the island (with land all round, not at the rim), then the same
  // spot with the block trees.
  const L = g.zone.layout;
  const landAround = (x: number, z: number) => {
    for (let dz = -16; dz <= 16; dz += 4) for (let dx = -20; dx <= 20; dx += 4) {
      const cx = Math.floor(x + dx), cz = Math.floor(z + dz);
      if (cx < 0 || cz < 0 || cx >= L.w || cz >= L.h || L.cells[cz * L.w + cx] === Cell.Void) return false;
    }
    return true;
  };
  const wood = inKeep.reduce((b, p) => {
    const n = inKeep.filter((q) => q.distanceTo(p) < 16).length;
    return n > b.n && landAround(p.x, p.z) ? { p, n } : b;
  }, { p: inKeep[0], n: 0 });
  const inWood = besideTree(g, wood.p, 3.5) ?? { x: wood.p.x + 3.5, z: wood.p.z };
  standHero(g, inWood.x, inWood.z);
  await frames(4);
  await shot('trees-oak-wood');
  out.wood = { at: [inWood.x, inWood.z], oaksWithin16m: wood.n, ...(await measure(g)) };
  TREE_STYLE.value = 'block';
  g.travel('keep', true);
  await frames(20);
  hideEnemies(g);
  standHero(g, inWood.x, inWood.z);
  await frames(4);
  await shot('trees-oak-wood-block');
  out.woodBlock = await measure(g);
  if (landing) {
    standHero(g, landing.spot.x, landing.spot.z);
    await frames(4);
    out.landingBlock = await measure(g);
  }

  document.body.classList.remove('inspect-clean');
  g.camZoom = 1;
  g.debug.timeScale = 1;
  TREE_STYLE.value = shipped;
  return out;
}

// ─── A grown kind's progress ────────────────────────────────────────────────

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

/** Hide the world's own trees and bushes standing within `r` m of any of `at` (so staged trees stand clear). */
function clearTrees(g: Game, at: THREE.Vector3[], r: number) {
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

/**
 * A grown kind's progress pictures, in the keep zone as it ships (block trees):
 * - progress-<kind>: the kind and an oak planted 14 m apart on the lawn under the castle walls, the
 *   hero between them, through the gameplay camera drawn back as far as the player can draw it;
 * - trees-<kind>-close: the kind from a low three-quarter angle, the hero at its foot;
 * - trees-oak-close and trees-oak-bark: the oak from the same angle, and its trunk up close.
 * Returns each kind's triangles per variant and the progress view's frame cost.
 */
async function grownSuite(g: Game, shot: Shot, kind: GrownKind) {
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

/** Put the inspect state back as the game had it (after a suite, however it ended). */
function restore(g: Game, stage: THREE.Object3D, style: TreeStyle) {
  stage.removeFromParent();
  g.debug.hold = null;
  document.body.classList.remove('inspect-clean');
  g.camZoom = 1;
  g.debug.timeScale = 1;
  TREE_STYLE.value = style;
}

// ─── The woodcutting ladder ─────────────────────────────────────────────────

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
const LADDER_NAMES: Record<GrownKind, string> = { tree: 'tree', oak: 'oak', willow: 'willow', maple: 'maple', yew: 'yew', magic: 'magic tree' };

/** The ladder's species new in this round (each gets a close-up). */
const NEW_KINDS: GrownKind[] = ['willow', 'maple', 'yew', 'magic'];

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
async function ladderSuite(g: Game, shot: Shot) {
  const out: Record<string, unknown> = {};
  const shipped = TREE_STYLE.value;
  out.triangles = Object.fromEntries(GROWN_KINDS.map((k) => [k, grownTriangles(k)]));
  const stage = new THREE.Group();
  try {
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
    out.ladder = await measure(g);
    g.debug.hold = null;
    stage.clear();

    // Each new species on its own, the wood round it as it ships.
    hidden.forEach((o) => (o.visible = true));
    for (const kind of NEW_KINDS) {
      const { pos } = plantTree(g, stage, kind, c.x, c.z, 0, 0.9, GROWN[kind].look.palette[0]);
      clearTrees(g, [pos], 12);
      const foot = standHero(g, pos.x - 2.6, pos.z + 2.4);
      const h = GROWN[kind].species.height[1], look = pos.clone().add(new THREE.Vector3(0, h * 0.42, 0));
      await freeShot(g, shot, `trees-${kind}-close`, look.clone().addScaledVector(CLOSE_DIR, h * 2.1), look, 20);
      out[`${kind}Hero`] = [foot.x, foot.z];
      stage.clear();
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
