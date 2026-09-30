import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CLOTH_COLORS, HAIR_COLORS, SKIN_TONES } from '../data/appearance';
import { BASES, UNIQUES, type Palette } from '../data/items';
import type { Appearance } from '../save/save';
import type { Item, Slot } from '../types';
import type { Model } from './kit';
import { applyFinish, type Finish } from './env';
import { MODEL_BUILDERS, PLACEHOLDER_GEAR } from './models';
import { applyGrade, MODEL_GRADE, trackGradeRoot } from './surface';

/**
 * Blender-made models (public/models/<name>.glb) replace the code-built placeholders when
 * present. Any model that fails to load silently falls back to its placeholder builder.
 * See docs/ART_CONTRACT.md for naming conventions.
 */
const loaded = new Map<string, { scene: THREE.Group; height: number }>();
const loader = new GLTFLoader();

/** Blender appends ".001" to duplicate names across scenes; strip it back to the contract name. */
function cleanNames(root: THREE.Object3D) {
  root.traverse((o) => {
    const original = (o.userData.name as string | undefined) ?? o.name;
    o.name = original.replace(/\.\d{3}$/, '');
  });
}

/**
 * Blender scripts author everything under a root rotated +90° about X, in three.js coordinates.
 * The glTF exporter's Y-up conversion then leaves every node below that root expressed in a
 * rotated frame (local = C·T·C⁻¹ with C = RotX(-90°)), so rig offsets on those nodes would
 * move along the wrong axes (a Y "bob" goes forward, a yaw becomes a roll). Undo it once at
 * load time: T = C⁻¹·local·C for every node, vertices v = C⁻¹·v, and the root becomes identity.
 */
const C = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
const C_INV = new THREE.Matrix4().makeRotationX(Math.PI / 2);

function normalizeAuthoredFrame(scene: THREE.Object3D) {
  const roots: THREE.Object3D[] = [];
  scene.traverse((o) => {
    if (/^DB_.*_root$/.test(o.name) && Math.abs(o.rotation.x - Math.PI / 2) < 1e-3) roots.push(o);
  });
  const m = new THREE.Matrix4();
  const done = new Set<THREE.BufferGeometry>();
  for (const root of roots) {
    root.traverse((o) => {
      if (o === root) return;
      m.compose(o.position, o.quaternion, o.scale);
      m.premultiply(C_INV).multiply(C);
      m.decompose(o.position, o.quaternion, o.scale);
      if (o instanceof THREE.Mesh && !done.has(o.geometry)) {
        o.geometry.applyMatrix4(C_INV);
        done.add(o.geometry);
      }
    });
    root.quaternion.identity();
    root.updateMatrixWorld(true);
  }
}

/** Authored primitive parts are exported as p<N>; anything else is a named part code may look up. */
const ANON_PART = /^p\d+$/;

/**
 * Merge a model's anonymous rigid leaf meshes under each rig node into as few meshes as possible,
 * in the node's space so they still move with it:
 * - fixed-colour materials are baked into vertex colours and grouped by finish (a goblin's
 *   arm is one mesh, not one per colour);
 * - recolourable ROLE_ materials and glowing (emissive) materials keep their own material.
 * A creature drops from ~30-100 draw calls to a handful, and shadows with it. Named meshes,
 * meshes with children are left alone (and bows: their string is identified by shape).
 */
export function mergeRigidParts(root: THREE.Object3D, model: string) {
  // Gear parts are never looked up by name (bows are excluded by the caller), so every leaf merges.
  const anon = (name: string) => model.startsWith('gear_') || ANON_PART.test(name);
  const parents = new Set<THREE.Object3D>();
  root.traverse((o) => {
    if (o instanceof THREE.Mesh && !o.children.length && anon(o.name) && o.parent) parents.add(o.parent);
  });
  const vcMats = new Map<string, THREE.MeshStandardMaterial>();
  const keyOf = (m: THREE.Material): string | THREE.Material => {
    if (!(m instanceof THREE.MeshStandardMaterial) || roleOf(m) || (m.emissive.getHex() !== 0 && m.emissiveIntensity > 0) || m.transparent || m.map) return m;
    return `vc|${m.roughness.toFixed(2)}|${m.metalness.toFixed(2)}|${m.side}`;
  };
  let before = 0, after = 0;
  for (const parent of parents) {
    const groups = new Map<string | THREE.Material, THREE.Mesh[]>();
    for (const c of parent.children) {
      if (!(c instanceof THREE.Mesh) || c.children.length || !anon(c.name) || Array.isArray(c.material)) continue;
      const k = keyOf(c.material);
      const list = groups.get(k) ?? [];
      list.push(c);
      groups.set(k, list);
    }
    for (const [key, meshes] of groups) {
      before += meshes.length;
      after++;
      const baked = typeof key === 'string';
      if (meshes.length < 2 && !baked) continue;
      const geos = meshes.map((m) => {
        m.updateMatrix();
        let g = m.geometry.clone().applyMatrix4(m.matrix);
        for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
        if (g.index) g = g.toNonIndexed();
        if (baked) {
          const c = (m.material as THREE.MeshStandardMaterial).color;
          const n = g.attributes.position.count;
          const col = new Float32Array(n * 3);
          for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
          g.setAttribute('color', new THREE.BufferAttribute(col, 3));
        }
        return g;
      });
      const merged = geos.length > 1 ? mergeGeometries(geos) : geos[0];
      if (!merged) continue;
      let mat = meshes[0].material as THREE.Material;
      if (baked) {
        let vc = vcMats.get(key);
        if (!vc) {
          vc = (mat as THREE.MeshStandardMaterial).clone();
          vc.color.set(0xffffff);
          vc.vertexColors = true;
          vc.name = `VC_${key}`;
          vcMats.set(key, vc);
        }
        mat = vc;
      }
      const mesh = new THREE.Mesh(merged, mat);
      mesh.name = meshes[0].name;
      mesh.castShadow = mesh.receiveShadow = meshes.some((m) => m.castShadow);
      for (const m of meshes) m.removeFromParent();
      parent.add(mesh);
    }
  }
  return { before, after };
}

/** Register a parsed glTF scene under a model name (used by the browser loader and by tests). */
export function registerModelScene(name: string, scene: THREE.Group) {
  cleanNames(scene);
  normalizeAuthoredFrame(scene);
  // Bows stay unmerged: BowDraw finds the static string by its shape.
  if (name !== 'gear_bow' && name !== 'gear_u_emberstring') mergeRigidParts(scene, name);
  const box = new THREE.Box3().setFromObject(scene);
  loaded.set(name, { scene, height: box.max.y - box.min.y });
}

async function loadOne(name: string) {
  if (loaded.has(name)) return true;
  try {
    const gltf = await loader.loadAsync(`./models/${name}.glb`);
    registerModelScene(name, gltf.scene);
    return true;
  } catch {
    return false;
  }
}

export async function preloadModels(names: string[]) {
  await Promise.all(names.map(loadOne));
  return [...loaded.keys()];
}

export const hasModel = (name: string) => loaded.has(name);

/**
 * Models are clean flat colour: no surface texture, just the soft vertical grade (shade toward
 * the feet of whatever model the mesh ends up part of) for depth.
 */
function gradeMeshes(root: THREE.Object3D) {
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) trackGradeRoot(o);
  });
}

/** Clone with per-instance materials so hit flashes and recolours stay local. */
function cloneWithMaterials(src: THREE.Object3D) {
  const root = src.clone(true);
  const cloned = new Map<THREE.Material, THREE.MeshStandardMaterial>();
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    o.castShadow = true;
    const orig = o.material as THREE.MeshStandardMaterial;
    let m = cloned.get(orig);
    if (!m) {
      m = orig.clone();
      m.userData.baseEmissive = m.emissive.clone();
      m.userData.baseIntensity = m.emissiveIntensity;
      applyGrade(m, MODEL_GRADE, 'root');
      cloned.set(orig, m);
    }
    o.material = m;
  });
  gradeMeshes(root);
  return { root, mats: [...cloned.values()] };
}

export function makeModel(name: string): Model {
  const src = loaded.get(name);
  let model: Model;
  if (src) {
    const { root, mats } = cloneWithMaterials(src.scene);
    model = { root: root as THREE.Group, mats, height: src.height };
  } else {
    model = MODEL_BUILDERS[name]();
    for (const m of model.mats) applyGrade(m, MODEL_GRADE, 'root');
    gradeMeshes(model.root);
  }
  model.root.userData.gradeHeight = model.height;
  return model;
}

// ─── Role recolouring ───────────────────────────────────────────────────────

export type RoleColors = Partial<Record<'skin' | 'hair' | 'cloth' | 'cloth2' | 'leather' | 'metal' | 'trim' | 'dark' | 'glow', number>>;

export function roleOf(m: THREE.Material): string | null {
  const match = /^ROLE_(\w+?)(\.\d{3})?$/.exec(m.name);
  return match ? match[1] : null;
}

export function applyRoles(root: THREE.Object3D, colors: RoleColors, glow = false) {
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const m = o.material as THREE.MeshStandardMaterial;
    const role = roleOf(m) as keyof RoleColors | null;
    if (!role) return;
    const c = role === 'glow' ? colors.trim : colors[role];
    if (c === undefined) return;
    m.color.setHex(c);
    if (role === 'glow' || (glow && role === 'trim')) {
      m.emissive.setHex(c);
      // Glow accents burn bright; glowing trim (larger surfaces) smoulders so it stays orange, not white.
      m.emissiveIntensity = role === 'glow' ? 1.6 : 0.8;
      m.userData.baseEmissive = m.emissive.clone();
      m.userData.baseIntensity = m.emissiveIntensity;
    }
  });
}

export const paletteRoles = (p: Palette): RoleColors => ({ metal: p.main, trim: p.trim, dark: p.dark, leather: p.dark });

// ─── Gear attachment ────────────────────────────────────────────────────────

/** Model id and palette for an item as worn. */
export function gearLook(item: Item): { model: string; palette: Palette } | null {
  const base = BASES[item.base];
  if (!base?.model) return null;
  const model = item.unique ? UNIQUES[item.unique].model : base.model;
  return { model, palette: base.palette ?? { main: 0x888888, trim: 0xcccccc, dark: 0x444444 } };
}

/** Build a detached copy of a gear model: a map of socket name → group to attach there. */
export function buildGear(model: string, palette: Palette): Map<string, THREE.Object3D> {
  const file = `gear_${model}`;
  let src = loaded.get(file)?.scene;
  // Uniques without their own art fall back to their base shape.
  if (!src && model.startsWith('u_')) {
    const uid = model.slice(2);
    const base = UNIQUES[uid] ? BASES[UNIQUES[uid].base].model : undefined;
    if (base) return buildGear(base, palette);
  }
  const parts = new Map<string, THREE.Object3D>();
  if (!src) {
    const ph = PLACEHOLDER_GEAR[model]?.();
    if (!ph) return parts;
    src = ph;
  }
  const { root, mats } = cloneWithMaterials(src);
  // A glowing palette lights the trim, unless the model has its own glow accents (eyes, gems):
  // then only those glow, instead of flooding large trim surfaces.
  let ownGlow = false;
  root.traverse((o) => {
    if (o instanceof THREE.Mesh && roleOf(o.material as THREE.Material) === 'glow') ownGlow = true;
  });
  applyRoles(root, paletteRoles(palette), !!palette.glow && !ownGlow);
  // Forged palettes shine: their role parts reflect the studio environment.
  if (palette.metal) {
    for (const m of mats) {
      const role = roleOf(m);
      if (role === 'metal' || role === 'trim' || role === 'dark') applyFinish(m, role as Finish);
    }
  }
  const sockets: THREE.Object3D[] = [];
  root.traverse((o) => {
    if (o.name.startsWith('sock_')) sockets.push(o);
  });
  for (const s of sockets) {
    const g = new THREE.Group();
    g.name = `gear:${s.name}`;
    for (const child of [...s.children]) g.add(child);
    parts.set(s.name, g);
  }
  return parts;
}

const BOW_MODELS = new Set(['bow', 'u_emberstring']);
const BLADE_MODELS = new Set(['sword', 'longsword', 'u_cinderfang']);

const HAIR_HIDDEN_BY: Record<string, 'hair' | 'all'> = { helm_open: 'hair', helm_full: 'all', u_ashen_crown: 'hair' };

/**
 * Dresses a hero model: appearance colours, hair/beard, and visible gear per equipped slot.
 * Call again whenever equipment or appearance changes.
 */
export class HeroDresser {
  private attached: THREE.Object3D[] = [];
  private sockets = new Map<string, THREE.Object3D>();

  constructor(private model: Model) {
    model.root.traverse((o) => {
      if (o.name.startsWith('sock_')) this.sockets.set(o.name, o);
    });
  }

  socket(name: string) {
    return this.sockets.get(name);
  }

  dress(look: Appearance | null, equipment: Partial<Record<Slot, Item | null>>, override?: { weaponModel?: string; weaponPalette?: Palette }) {
    for (const o of this.attached) o.removeFromParent();
    this.attached = [];
    const a = look ?? { name: '', skin: 1, hair: 1, hairColor: 1, beard: 0, cloth: 0, cloth2: 5 };
    applyRoles(this.model.root, {
      skin: SKIN_TONES[a.skin] ?? SKIN_TONES[1],
      hair: HAIR_COLORS[a.hairColor] ?? HAIR_COLORS[1],
      cloth: CLOTH_COLORS[a.cloth] ?? CLOTH_COLORS[0],
      cloth2: CLOTH_COLORS[a.cloth2] ?? CLOTH_COLORS[5],
      leather: 0x6a4428,
    });

    const helm = equipment.helm ? gearLook(equipment.helm) : null;
    // Tier design variants (helm_full_a/b/c) hide hair like their base model.
    const hide = helm ? (HAIR_HIDDEN_BY[helm.model] ?? HAIR_HIDDEN_BY[helm.model.replace(/_[abc]$/, '')]) : undefined;
    if (a.hair > 0 && !hide) this.attachFile(`hair_${a.hair}`, { hair: HAIR_COLORS[a.hairColor] });
    if (a.beard > 0 && hide !== 'all') this.attachFile(`beard_${a.beard}`, { hair: HAIR_COLORS[a.hairColor] });

    for (const slot of ['helm', 'body', 'gloves', 'boots'] as Slot[]) {
      const item = equipment[slot];
      const gl = item ? gearLook(item) : null;
      if (gl) this.attachParts(buildGear(gl.model, gl.palette));
    }
    if (override?.weaponModel) {
      this.attachParts(buildGear(override.weaponModel, override.weaponPalette ?? { main: 0x888888, trim: 0xcccccc, dark: 0x444444 }));
    } else if (equipment.weapon) {
      const gl = gearLook(equipment.weapon);
      if (gl) {
        const parts = buildGear(gl.model, gl.palette);
        // Bows are authored with the string on the socket's +Y side; turn them so the string
        // faces the archer when shooting (verified: string sits behind the grip at full draw).
        if (BOW_MODELS.has(gl.model)) parts.get('sock_handR')?.rotateX(Math.PI);
        // Blades are authored flat across the socket; turn them edge-on so the edge leads a vertical swing
        // (verified: blade width axis stays in the swing plane in tests/poses.test.ts).
        if (BLADE_MODELS.has(gl.model)) parts.get('sock_handR')?.rotateY(Math.PI / 2);
        this.attachParts(parts);
      }
    }
    this.refreshMaterials();
  }

  private attachFile(file: string, colors: RoleColors) {
    const src = loaded.get(file)?.scene ?? PLACEHOLDER_GEAR[file]?.();
    if (!src) return;
    const { root } = cloneWithMaterials(src);
    applyRoles(root, colors);
    const parts = new Map<string, THREE.Object3D>();
    root.traverse((o) => {
      if (o.name.startsWith('sock_')) {
        const g = new THREE.Group();
        for (const c of [...o.children]) g.add(c);
        parts.set(o.name, g);
      }
    });
    this.attachParts(parts);
  }

  private attachParts(parts: Map<string, THREE.Object3D>) {
    for (const [name, group] of parts) {
      const sock = this.sockets.get(name);
      if (!sock) continue;
      sock.add(group);
      this.attached.push(group);
    }
  }

  /** Rebuild the model's material list so hit flashes cover attached gear too. */
  private refreshMaterials() {
    const set = new Set<THREE.MeshStandardMaterial>();
    this.model.root.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        const m = o.material as THREE.MeshStandardMaterial;
        if (!m.userData.baseEmissive) {
          m.userData.baseEmissive = m.emissive.clone();
          m.userData.baseIntensity = m.emissiveIntensity;
        }
        o.castShadow = true;
        set.add(m);
      }
    });
    this.model.mats = [...set];
  }
}

/** Every model file the game may use; missing ones fall back to placeholders. */
export const MODEL_FILES = [
  'hero', 'goblin', 'kobold', 'cultist', 'drakeling', 'cinderwing', 'whelp', 'golem', 'warden', 'quartermaster',
  'gear_sword', 'gear_longsword', 'gear_pickaxe', 'gear_bow', 'gear_staff', 'gear_helm_open', 'gear_helm_full',
  'gear_body_chain', 'gear_body_plate', 'gear_gloves', 'gear_boots',
  ...['a', 'b', 'c'].flatMap((v) => [`gear_body_plate_${v}`, `gear_helm_full_${v}`, `gear_gloves_${v}`, `gear_boots_${v}`]),
  'gear_u_cinderfang', 'gear_u_emberstring', 'gear_u_kindled_ash', 'gear_u_ashen_crown', 'gear_u_scaleguard',
  'hair_1', 'hair_2', 'hair_3', 'hair_4', 'beard_1', 'beard_2', 'beard_3',
];
