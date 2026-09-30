import * as THREE from 'three';
import { BASES } from '../data/items';
import type { Item } from '../types';
import { buildGear, gearLook, makeModel } from './registry';
import { buildMaterialModel } from './materialModels';
import { setPaintGain } from './surface';

/** Painted albedo contrast in icons, relative to the game. */
export const ICON_PAINT_GAIN = 0.75;

/**
 * Item icons rendered from the item's own 3D model (with its tier recolour), so the icon
 * always matches what the hero wears. Rendered once per look on a small offscreen renderer
 * and cached as data URLs.
 */
/** Pixels per side: sharp in a 52px slot on a 2× display. */
const SIZE = 160;
/** Share of the icon the item's silhouette spans along its longer side. */
const FILL = 0.94;
/** Gap between the two pieces of a pair (gloves, boots), as a share of the wider piece. */
const PAIR_GAP = 0.1;
/** Armour and trinkets are turned three-quarters and tipped toward the viewer. */
const YAW = -0.45, PITCH = 0.22;

let renderer: THREE.WebGLRenderer | null = null;
const scene = new THREE.Scene();
// Orthographic: the silhouette fills the frame exactly, with no perspective shrink at the edges.
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 100);
const cache = new Map<string, string>();

function init() {
  if (renderer) return renderer;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(SIZE, SIZE, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  scene.add(new THREE.HemisphereLight(0xfff4e0, 0x3a3040, 1.6));
  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(-2, 4, 5);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x9ab8ff, 1.2);
  rim.position.set(3, 1, -4);
  scene.add(rim);
  return renderer;
}

function lookKey(item: Item) {
  const gl = gearLook(item);
  return `${item.base}|${item.unique ?? ''}|${gl?.model ?? ''}`;
}

/** Tight bounds of the given objects' vertices, in world space. */
function silhouetteBox(objs: THREE.Object3D[]) {
  const box = new THREE.Box3();
  for (const o of objs) {
    o.updateWorldMatrix(true, true);
    box.expandByObject(o, true);
  }
  return box;
}

/** Wrap `inner` in a group rotated by `euler`; returns the wrapper. */
function turn(inner: THREE.Object3D, x: number, y: number, z: number) {
  const g = new THREE.Group();
  g.add(inner);
  g.rotation.set(x, y, z);
  return g;
}

/** Longest axis diagonal, thinnest axis toward the camera (so bows aren't edge-on): the classic weapon icon. */
function diagonal(obj: THREE.Object3D) {
  let holder = turn(obj, 0, 0, 0);
  let s = silhouetteBox([holder]).getSize(new THREE.Vector3());
  if (s.z > s.y && s.z >= s.x) holder = turn(holder, Math.PI / 2, 0, 0);
  else if (s.x > s.y) holder = turn(holder, 0, 0, Math.PI / 2);
  s = silhouetteBox([holder]).getSize(new THREE.Vector3());
  if (s.x < s.z) holder = turn(holder, 0, Math.PI / 2, 0);
  return turn(holder, 0, 0, -Math.PI / 4);
}

/** Two matching pieces side by side, right-hand piece on the left (as when facing the wearer). */
function pair(pieces: THREE.Object3D[]) {
  const holder = new THREE.Group();
  const ordered = [...pieces].sort((a, b) => Number(b.name.endsWith('R')) - Number(a.name.endsWith('R')));
  const turned = ordered.map((p) => turn(p, PITCH, YAW, 0));
  const boxes = turned.map((t) => silhouetteBox([t]));
  const gap = PAIR_GAP * Math.max(...boxes.map((b) => b.max.x - b.min.x));
  let x = 0;
  turned.forEach((t, i) => {
    t.position.set(x - boxes[i].min.x, -boxes[i].min.y, 0);
    x += boxes[i].max.x - boxes[i].min.x + gap;
    holder.add(t);
  });
  return holder;
}

/**
 * An item's icon subject arranged for the camera (looking down -Z) and centred on its silhouette,
 * plus the half-size of the square view that frames it at FILL.
 */
export function iconSubject(item: Item): { holder: THREE.Object3D; half: number; depth: number } {
  const base = BASES[item.base];
  const gl = gearLook(item);
  let holder: THREE.Object3D;
  let subjects: THREE.Object3D[] | null = null;
  if (base?.kind === 'material' || base?.kind === 'quest' || base?.slot === 'amulet' || base?.slot === 'ring') {
    const kind = base.slot === 'amulet' || base.slot === 'ring' ? base.slot : base.model ?? 'ore';
    const g = buildMaterialModel(kind, base.color ?? base.palette?.main ?? 0x888888, base.id);
    g.rotation.x = 0.5;
    holder = turn(g, PITCH, YAW, 0);
  } else if (!gl) {
    holder = turn(buildMaterialModel('gem', 0x888888), PITCH, YAW, 0);
  } else {
    const parts = buildGear(gl.model, gl.palette);
    const names = [...parts.keys()];
    if (parts.has('sock_handR')) holder = diagonal(parts.get('sock_handR')!);
    else if (parts.size === 1) holder = turn(parts.values().next().value!, PITCH, YAW, 0);
    else if (names.every((n) => /^sock_(hand|glove|foot)/.test(n))) holder = pair([...parts.values()]);
    else {
      // Body armour: lay the pieces out on an invisible mannequin so they sit where they are worn.
      const man = makeModel('hero');
      delete man.root.userData.gradeHeight;
      const sockets = new Map<string, THREE.Object3D>();
      man.root.traverse((o) => {
        if (o.name.startsWith('sock_')) sockets.set(o.name, o);
        if (o instanceof THREE.Mesh) o.visible = false;
      });
      for (const [name, part] of parts) sockets.get(name)?.add(part);
      holder = turn(man.root, PITCH, YAW, 0);
      subjects = [...parts.values()];
    }
  }
  // A 72px slot shows the painted albedo much larger than the game does: soften it a little.
  setPaintGain(holder, ICON_PAINT_GAIN);
  const box = silhouetteBox(subjects ?? [holder]);
  holder.position.sub(box.getCenter(new THREE.Vector3()));
  const size = box.getSize(new THREE.Vector3());
  return { holder, half: Math.max(size.x, size.y) / 2 / FILL, depth: size.z };
}

export function itemIconUrl(item: Item): string {
  const key = lookKey(item);
  const hit = cache.get(key);
  if (hit) return hit;
  const r = init();
  const { holder, half, depth } = iconSubject(item);
  camera.left = camera.bottom = -half;
  camera.right = camera.top = half;
  camera.position.set(0, 0, depth / 2 + 5);
  camera.far = depth + 10;
  camera.updateProjectionMatrix();
  scene.add(holder);
  r.setClearColor(0x000000, 0);
  r.render(scene, camera);
  const url = r.domElement.toDataURL('image/png');
  scene.remove(holder);
  cache.set(key, url);
  return url;
}

/** Drop cached icons (e.g. after new GLBs load). */
export function clearIconCache() {
  cache.clear();
}
