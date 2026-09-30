import * as THREE from 'three';
import { BASES } from '../data/items';
import type { Item } from '../types';
import { buildGear, gearLook, makeModel } from './registry';
import { buildMaterialModel } from './models';

/**
 * Item icons rendered from the item's own 3D model (with its tier recolour), so the icon
 * always matches what the hero wears. Rendered once per look on a small offscreen renderer
 * and cached as data URLs.
 */
const SIZE = 128;
let renderer: THREE.WebGLRenderer | null = null;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
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

/** Arrange the object so its longest axis runs diagonally, then fit the camera to it. */
function sizeOf(o: THREE.Object3D) {
  o.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3());
}

/** Wrap `inner` in a group rotated by `euler`; returns the wrapper. */
function turn(inner: THREE.Object3D, x: number, y: number, z: number) {
  const g = new THREE.Group();
  g.add(inner);
  g.rotation.set(x, y, z);
  return g;
}

function frame(obj: THREE.Object3D, diagonal: boolean) {
  let holder: THREE.Object3D = new THREE.Group();
  holder.add(obj);
  if (diagonal) {
    // Longest axis → vertical; thinnest horizontal axis → toward the camera (so bows aren't edge-on);
    // then tilt 45° for the classic diagonal weapon icon.
    let s = sizeOf(holder);
    if (s.z > s.y && s.z >= s.x) holder = turn(holder, Math.PI / 2, 0, 0);
    else if (s.x > s.y) holder = turn(holder, 0, 0, Math.PI / 2);
    s = sizeOf(holder);
    if (s.x < s.z) holder = turn(holder, 0, Math.PI / 2, 0);
    holder = turn(holder, 0, 0, -Math.PI / 4);
  } else {
    holder.rotation.y = -0.45;
    holder.rotation.x = 0.18;
  }
  holder.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(holder);
  const center = b.getCenter(new THREE.Vector3());
  const radius = b.getBoundingSphere(new THREE.Sphere()).radius;
  holder.position.sub(center);
  const dist = radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) * 0.94;
  camera.position.set(0, 0, dist);
  camera.lookAt(0, 0, 0);
  return holder;
}

function buildIconObject(item: Item): { obj: THREE.Object3D; diagonal: boolean } {
  const base = BASES[item.base];
  const gl = gearLook(item);
  if (base?.kind === 'material' || base?.kind === 'quest' || (base?.slot === 'amulet' || base?.slot === 'ring')) {
    const kind = base.slot === 'amulet' || base.slot === 'ring' ? base.slot : base.model ?? 'ore';
    const color = base.color ?? base.palette?.main ?? 0x888888;
    const g = buildMaterialModel(kind, color);
    g.rotation.x = 0.5;
    return { obj: g, diagonal: false };
  }
  if (!gl) return { obj: buildMaterialModel('gem', 0x888888), diagonal: false };
  const parts = buildGear(gl.model, gl.palette);
  if (parts.has('sock_handR')) return { obj: parts.get('sock_handR')!, diagonal: true };
  // Armour: lay the pieces out on an invisible mannequin so they sit where they would be worn.
  const man = makeModel('hero');
  const sockets = new Map<string, THREE.Object3D>();
  man.root.traverse((o) => {
    if (o.name.startsWith('sock_')) sockets.set(o.name, o);
    if (o instanceof THREE.Mesh) o.visible = false;
  });
  for (const [name, part] of parts) sockets.get(name)?.add(part);
  man.root.updateMatrixWorld(true);
  // Keep only the gear meshes in the bounds calculation.
  const gearOnly = new THREE.Group();
  gearOnly.add(man.root);
  const box = new THREE.Box3();
  for (const part of parts.values()) box.expandByObject(part);
  const c = box.getCenter(new THREE.Vector3());
  man.root.position.sub(c);
  const wrap = new THREE.Group();
  wrap.add(gearOnly);
  // Frame manually using the gear-only bounds.
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  wrap.userData.radius = sphere.radius;
  return { obj: wrap, diagonal: false };
}

export function itemIconUrl(item: Item): string {
  const key = lookKey(item);
  const hit = cache.get(key);
  if (hit) return hit;
  const r = init();
  const { obj, diagonal } = buildIconObject(item);
  let holder: THREE.Object3D;
  if (obj.userData.radius) {
    holder = new THREE.Group();
    holder.add(obj);
    obj.rotation.y = -0.45;
    const radius = obj.userData.radius as number;
    camera.position.set(0, radius * 0.35, radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) * 0.98);
    camera.lookAt(0, 0, 0);
  } else {
    holder = frame(obj, diagonal);
  }
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
