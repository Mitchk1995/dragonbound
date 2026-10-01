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
import { applyCharPaint, applyGrade, CHAR_PAINTS, MODEL_GRADE, paintAttributes, prepareCharGeometry, setCharPaint, trackGradeRoot, type CharPaint, type CharPaintKind } from './surface';

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
        for (const k of Object.keys(g.attributes)) if (!KEEP_ATTRS.has(k)) g.deleteAttribute(k);
        if (g.index) g = g.toNonIndexed();
        if (baked) {
          const mm = m.material as THREE.MeshStandardMaterial;
          const c = mm.color;
          const n = g.attributes.position.count;
          const col = new Float32Array(n * 3);
          for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
          g.setAttribute('color', new THREE.BufferAttribute(col, 3));
          // Each baked colour keeps its own painted recipe (a goblin's skin, belt and loincloth).
          const kind = fixedPaint(model, c, mm.metalness > 0.5, mm.side === THREE.DoubleSide);
          paintAttributes(g, kind ? CHAR_PAINTS[kind] : null);
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

/** Geometry attributes merged parts keep (the painted shader's rest frame and face coordinates). */
const KEEP_ATTRS = new Set(['position', 'normal', 'aRest', 'aRestN', 'aFace', 'aPart']);

// ─── Painted albedo recipes ──────────────────────────────────────────────────

const ROLE_PAINT: Record<string, CharPaintKind | null> = {
  skin: 'skin', hair: 'hair', cloth: 'cloth', cloth2: 'cloth', leather: 'leather',
  metal: 'metal', trim: 'trim', dark: 'darkMetal', glow: null,
};

const SCALY = new Set(['drakeling', 'cinderwing', 'kobold', 'whelp']);

/**
 * Pattern size per model (1 = hero-sized): scales and blotches stay readable on a boss and
 * small and soft on the whelp.
 */
const PAINT_SIZE: Record<string, number> = { goblin: 0.8, kobold: 0.75, drakeling: 1.3, cinderwing: 4.5, whelp: 0.5, golem: 0.55 };

/**
 * The recipe for a fixed (authored) colour, from the model it belongs to and the colour itself:
 * dragons are scaled with bone horns and claws, the golem is mossy stone, NPC and unique parts
 * are judged by colour (bone, gold trim, skin, dark browns as leather, the rest cloth).
 */
export function fixedPaint(model: string, c: THREE.Color, metallic: boolean, double = false): CharPaintKind | null {
  const { h, s, l } = c.getHSL({ h: 0, s: 0, l: 0 }, THREE.SRGBColorSpace);
  const hue = h * 360;
  if (metallic) return 'metal';
  if (l < 0.09) return null; // eyes, pupils, visor slits stay clean
  if (model === 'golem') return 'stone';
  if (SCALY.has(model)) {
    if (double) return 'membrane';
    if (l > 0.72) return model === 'whelp' ? 'soft' : 'bone';
    return model === 'whelp' ? 'softScales' : 'scales';
  }
  // The uniques are cut from dragon bone (light and shaded), painted as big bone plates.
  if (model.startsWith('gear_u_') && l > 0.5 && s < 0.6 && hue >= 25 && hue <= 60) return 'wyrmbone';
  if (l > 0.75 && s < 0.6) return model.startsWith('gear_') ? 'bone' : 'soft';
  if (hue >= 34 && hue <= 56 && s > 0.5 && l > 0.4 && l < 0.78) return 'trim';
  if (s < 0.14) return 'metal';
  if (model === 'goblin' && hue > 70 && hue < 160) return 'hide';
  if (hue >= 14 && hue <= 40 && s > 0.4 && l > 0.58 && l < 0.86) return 'skin';
  if (hue >= 10 && hue <= 45 && l < 0.42) return 'leather';
  return 'cloth';
}

const glowing = (m: THREE.MeshStandardMaterial) =>
  m.transparent || (m.emissive.r * 0.3 + m.emissive.g * 0.59 + m.emissive.b * 0.11) * m.emissiveIntensity > 0.2;

/** The painted recipe a model's material starts with ('vertex': merged parts carry their own). */
function paintFor(model: string, mesh: THREE.Mesh, m: THREE.MeshStandardMaterial): CharPaint | 'vertex' | null {
  if (!mesh.geometry.getAttribute('aRest')) return null; // code-built placeholders stay flat
  if (m.vertexColors) return mesh.geometry.getAttribute('aPaintW') ? 'vertex' : null;
  const role = roleOf(m);
  if (role) {
    const k = ROLE_PAINT[role];
    return k ? CHAR_PAINTS[k] : null;
  }
  if (glowing(m)) return null;
  const k = fixedPaint(model, m.color, m.metalness > 0.5, m.side === THREE.DoubleSide);
  return k ? CHAR_PAINTS[k] : null;
}

/** Register a parsed glTF scene under a model name (used by the browser loader and by tests). */
export function registerModelScene(name: string, scene: THREE.Group) {
  cleanNames(scene);
  normalizeAuthoredFrame(scene);
  // Rest frame and flat-face coordinates for the painted albedo, before parts are merged.
  scene.updateMatrixWorld(true);
  const inv = scene.matrixWorld.clone().invert(), rest = new THREE.Matrix4();
  scene.traverse((o) => {
    if (o instanceof THREE.Mesh) o.geometry = prepareCharGeometry(o.geometry, rest.multiplyMatrices(inv, o.matrixWorld));
  });
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
 * Models get hand-painted albedo per material (surface.ts applyCharPaint) plus the soft vertical
 * grade (shade toward the feet of whatever model the mesh ends up part of) for depth.
 */
function gradeMeshes(root: THREE.Object3D) {
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) trackGradeRoot(o);
  });
}

/** Clone with per-instance materials so hit flashes and recolours stay local. */
function cloneWithMaterials(src: THREE.Object3D, model: string) {
  const root = src.clone(true);
  const cloned = new Map<THREE.Material, THREE.MeshStandardMaterial>();
  const size = PAINT_SIZE[model] ?? 1;
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    o.castShadow = true;
    const orig = o.material as THREE.MeshStandardMaterial;
    let m = cloned.get(orig);
    if (!m) {
      m = orig.clone();
      m.userData.baseEmissive = m.emissive.clone();
      m.userData.baseIntensity = m.emissiveIntensity;
      const paint = paintFor(model, o, m);
      if (paint) applyCharPaint(m, paint, size);
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
    const { root, mats } = cloneWithMaterials(src.scene, name);
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

/**
 * The palette decides what a gear model's metal roles are made of: forged tiers are metal,
 * bows and staves are wood, leather armour is leather.
 */
function gearPaint(model: string, role: string | null, palette: Palette): CharPaintKind | null {
  if (role !== 'metal' && role !== 'dark') return null;
  if (palette.metal) return role === 'metal' ? 'metal' : 'darkMetal';
  return /bow|staff|emberstring|kindled/.test(model) ? 'wood' : 'leather';
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
  const { root, mats } = cloneWithMaterials(src, file);
  // A glowing palette lights the trim, unless the model has its own glow accents (eyes, gems):
  // then only those glow, instead of flooding large trim surfaces.
  let ownGlow = false;
  root.traverse((o) => {
    if (o instanceof THREE.Mesh && roleOf(o.material as THREE.Material) === 'glow') ownGlow = true;
  });
  applyRoles(root, paletteRoles(palette), !!palette.glow && !ownGlow);
  // Forged palettes shine: their role parts reflect the studio environment. So do fixed-colour parts
  // authored as metal (unique gear: _common.metallic in the Blender scripts).
  for (const m of mats) {
    const role = roleOf(m);
    if (palette.metal && (role === 'metal' || role === 'trim' || role === 'dark')) {
      applyFinish(m, role as Finish);
      // Tier finish: iron is forged dull, steel polished (the dark underlayer keeps its own finish).
      if (palette.rough !== undefined && role !== 'dark') m.roughness = palette.rough;
    }
    else if (!role && m.metalness > 0.5) applyFinish(m, 'metal');
    const paint = gearPaint(model, role, palette);
    if (paint) setCharPaint(m, CHAR_PAINTS[paint]);
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
    const dye = { cloth: CLOTH_COLORS[a.cloth] ?? CLOTH_COLORS[0], cloth2: CLOTH_COLORS[a.cloth2] ?? CLOTH_COLORS[5] };
    applyRoles(this.model.root, {
      skin: SKIN_TONES[a.skin] ?? SKIN_TONES[1],
      hair: HAIR_COLORS[a.hairColor] ?? HAIR_COLORS[1],
      ...dye,
      leather: 0x6a4428,
    });

    const helm = equipment.helm ? gearLook(equipment.helm) : null;
    // Plate sets (helm_full_p/e, items.ts PLATE_STYLE) hide hair like their base model.
    const hide = helm ? (HAIR_HIDDEN_BY[helm.model] ?? HAIR_HIDDEN_BY[helm.model.replace(/_[pe]$/, '')]) : undefined;
    if (a.hair > 0 && !hide) this.attachFile(`hair_${a.hair}`, { hair: HAIR_COLORS[a.hairColor] });
    if (a.beard > 0 && hide !== 'all') this.attachFile(`beard_${a.beard}`, { hair: HAIR_COLORS[a.hairColor] });

    for (const slot of ['helm', 'body', 'gloves', 'boots'] as Slot[]) {
      const item = equipment[slot];
      const gl = item ? gearLook(item) : null;
      if (!gl) continue;
      // Cloth on armour (the plate tabard) is dyed to match the wearer's tunic.
      const parts = buildGear(gl.model, gl.palette);
      for (const g of parts.values()) applyRoles(g, dye);
      this.attachParts(parts);
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
    const { root } = cloneWithMaterials(src, file);
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
  'gear_body_chain', 'gear_body_plate', 'gear_body_leather', 'gear_gloves', 'gear_boots',
  ...['p', 'e'].flatMap((v) => [`gear_body_plate_${v}`, `gear_helm_full_${v}`, `gear_gloves_${v}`, `gear_boots_${v}`]),
  'gear_u_cinderfang', 'gear_u_emberstring', 'gear_u_kindled_ash', 'gear_u_ashen_crown', 'gear_u_wyrmbone',
  'hair_1', 'hair_2', 'hair_3', 'hair_4', 'beard_1', 'beard_2', 'beard_3',
];
