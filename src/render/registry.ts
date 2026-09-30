import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CLOTH_COLORS, HAIR_COLORS, SKIN_TONES } from '../data/appearance';
import { BASES, UNIQUES, type Palette } from '../data/items';
import type { Appearance } from '../save/save';
import type { Item, Slot } from '../types';
import type { Model } from './kit';
import { MODEL_BUILDERS, PLACEHOLDER_GEAR } from './models';

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

async function loadOne(name: string) {
  if (loaded.has(name)) return true;
  try {
    const gltf = await loader.loadAsync(`./models/${name}.glb`);
    cleanNames(gltf.scene);
    const box = new THREE.Box3().setFromObject(gltf.scene);
    loaded.set(name, { scene: gltf.scene, height: box.max.y - box.min.y });
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
      cloned.set(orig, m);
    }
    o.material = m;
  });
  return { root, mats: [...cloned.values()] };
}

export function makeModel(name: string): Model {
  const src = loaded.get(name);
  if (!src) return MODEL_BUILDERS[name]();
  const { root, mats } = cloneWithMaterials(src.scene);
  return { root: root as THREE.Group, mats, height: src.height };
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
      m.emissiveIntensity = 1.6;
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
  const { root } = cloneWithMaterials(src);
  applyRoles(root, paletteRoles(palette), !!palette.glow);
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
    const hide = helm ? HAIR_HIDDEN_BY[helm.model] : undefined;
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
      if (gl) this.attachParts(buildGear(gl.model, gl.palette));
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
  'gear_u_cinderfang', 'gear_u_emberstring', 'gear_u_kindled_ash', 'gear_u_ashen_crown', 'gear_u_scaleguard',
  'hair_1', 'hair_2', 'hair_3', 'hair_4', 'beard_1', 'beard_2', 'beard_3',
];
