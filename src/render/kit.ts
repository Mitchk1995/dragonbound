import * as THREE from 'three';
import { shareResource } from './resources';

export type V3 = [number, number, number];

export const PAL = {
  skin: 0xf2c49b,
  steel: 0xb9c6d2,
  steelDark: 0x7d8a99,
  gold: 0xe8b64a,
  leather: 0x8a5a34,
  leatherDark: 0x5a3a22,
  cloth: 0x2f6db5,
  clothDark: 0x1f4a80,
  red: 0xc0392b,
  wood: 0x6b4426,
  goblin: 0x74b347,
  goblinDark: 0x4e7f2c,
  kobold: 0xc77b3a,
  koboldDark: 0x8f5222,
  drake: 0xc9442a,
  drakeDark: 0x8e2a1a,
  belly: 0xf2b45a,
  robe: 0x5b1a2c,
  robeDark: 0x3a0f1c,
  fire: 0xff7a1a,
  ember: 0xffb040,
  bone: 0xeee4cc,
  black: 0x1a1414,
  eye: 0xffe070,
  frost: 0x9fe4ff,
  arcane: 0x6aa8ff,
};

/**
 * Role colours: pass these instead of a hex colour and the material is named ROLE_<role>,
 * so the game can recolour it (appearance, gear tier palettes). See docs/ART_NAMES.md.
 */
const ROLE_NAMES = ['skin', 'hair', 'cloth', 'cloth2', 'leather', 'metal', 'trim', 'dark', 'glow'] as const;
export const ROLE = { skin: -1, hair: -2, cloth: -3, cloth2: -4, leather: -5, metal: -6, trim: -7, dark: -8, glow: -9 } as const;

const geoCache = new Map<string, THREE.BufferGeometry>();
function cachedGeo(key: string, make: () => THREE.BufferGeometry) {
  let g = geoCache.get(key);
  if (!g) {
    g = shareResource(make());
    geoCache.set(key, g);
  }
  return g;
}

/**
 * Builds chunky flat-shaded models out of primitives. Each model gets its own materials
 * so hit flashes can tint one enemy without affecting the others.
 */
export class ModelKit {
  readonly mats: THREE.MeshStandardMaterial[] = [];
  private byKey = new Map<string, THREE.MeshStandardMaterial>();

  mat(color: number, emissive = 0, intensity = 1, doubleSide = false) {
    const key = `${color}|${emissive}|${intensity}|${doubleSide}`;
    let m = this.byKey.get(key);
    if (!m) {
      const role = color < 0 ? ROLE_NAMES[-color - 1] : null;
      m = new THREE.MeshStandardMaterial({
        color: role ? 0x999999 : color, flatShading: true, roughness: 0.78, metalness: 0.04,
        emissive, emissiveIntensity: intensity,
        side: doubleSide ? THREE.DoubleSide : THREE.FrontSide,
      });
      if (role) m.name = `ROLE_${role}`;
      m.userData.baseEmissive = new THREE.Color(emissive);
      m.userData.baseIntensity = intensity;
      this.byKey.set(key, m);
      this.mats.push(m);
    }
    return m;
  }

  mesh(parent: THREE.Object3D, geo: THREE.BufferGeometry, color: number, pos: V3, rot?: V3, emissive = 0, intensity = 1) {
    const m = new THREE.Mesh(geo, this.mat(color, emissive, intensity, geo.userData.doubleSide));
    m.position.set(...pos);
    if (rot) m.rotation.set(...rot);
    m.castShadow = true;
    m.receiveShadow = false;
    parent.add(m);
    return m;
  }

  box(parent: THREE.Object3D, size: V3, pos: V3, color: number, rot?: V3, emissive = 0, intensity = 1) {
    const g = cachedGeo(`b${size}`, () => new THREE.BoxGeometry(...size));
    return this.mesh(parent, g, color, pos, rot, emissive, intensity);
  }

  cyl(parent: THREE.Object3D, rTop: number, rBot: number, h: number, pos: V3, color: number, rot?: V3, seg = 6, emissive = 0) {
    const g = cachedGeo(`c${rTop},${rBot},${h},${seg}`, () => new THREE.CylinderGeometry(rTop, rBot, h, seg));
    return this.mesh(parent, g, color, pos, rot, emissive);
  }

  cone(parent: THREE.Object3D, r: number, h: number, pos: V3, color: number, rot?: V3, seg = 5, emissive = 0) {
    const g = cachedGeo(`k${r},${h},${seg}`, () => new THREE.ConeGeometry(r, h, seg));
    return this.mesh(parent, g, color, pos, rot, emissive);
  }

  gem(parent: THREE.Object3D, r: number, pos: V3, color: number, emissive = 0, intensity = 1) {
    const g = cachedGeo(`i${r}`, () => new THREE.IcosahedronGeometry(r, 0));
    return this.mesh(parent, g, color, pos, undefined, emissive, intensity);
  }

  /** Flat double-sided triangle fan (wing membranes). Points are in the XZ plane of the parent. */
  membrane(parent: THREE.Object3D, pts: [number, number][], color: number, y = 0) {
    const key = `m${JSON.stringify(pts)}`;
    const g = cachedGeo(key, () => {
      const geo = new THREE.BufferGeometry();
      const verts: number[] = [];
      for (let i = 1; i < pts.length - 1; i++) {
        for (const p of [pts[0], pts[i], pts[i + 1]]) verts.push(p[0], y, p[1]);
      }
      geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      geo.computeVertexNormals();
      geo.userData.doubleSide = true;
      return geo;
    });
    return this.mesh(parent, g, color, [0, 0, 0]);
  }

  pivot(parent: THREE.Object3D, name: string, pos: V3, rot?: V3) {
    const g = new THREE.Group();
    g.name = name;
    g.position.set(...pos);
    if (rot) g.rotation.set(...rot);
    parent.add(g);
    return g;
  }
}

export interface Model {
  root: THREE.Group;
  /** Per-instance materials, so hit flashes tint one unit only. */
  mats: THREE.MeshStandardMaterial[];
  /** Height used for health bars, labels and projectile spawn points. */
  height: number;
}

const flashColor = new THREE.Color();

export function setFlash(model: Model, amount: number, color = 0xffffff) {
  const c = flashColor.setHex(color);
  for (const m of model.mats) {
    const base = m.userData.baseEmissive as THREE.Color;
    if (amount <= 0) {
      m.emissive.copy(base);
      m.emissiveIntensity = m.userData.baseIntensity;
    } else {
      m.emissive.copy(base).lerp(c, amount);
      m.emissiveIntensity = Math.max(m.userData.baseIntensity, amount * 0.9);
    }
  }
}

export function setOpacity(model: Model, opacity: number) {
  for (const m of model.mats) {
    m.transparent = opacity < 1;
    m.opacity = opacity;
  }
}
