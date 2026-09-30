import * as THREE from 'three';
import { BASES } from '../data/items';
import { itemName } from '../loot/itemGen';
import { buildMaterialModel } from '../render/models';
import { buildGear, gearLook } from '../render/registry';
import type { Item, Rarity } from '../types';

export const RARITY_COLOR: Record<Rarity, number> = {
  normal: 0xd8d8d8,
  magic: 0x6a8cff,
  rare: 0xffd84a,
  unique: 0xff8a1a,
};
export const RARITY_CSS: Record<Rarity, string> = {
  normal: '#dcdcdc',
  magic: '#7c9cff',
  rare: '#ffe066',
  unique: '#ff9a2e',
};

/** The item's real model, laid on the ground: gear uses its worn mesh, materials their chunk. */
function groundModel(item: Item): THREE.Group {
  const base = BASES[item.base];
  const g = new THREE.Group();
  const gl = base.kind === 'gear' || base.kind === 'tool' ? gearLook(item) : null;
  if (gl && base.slot !== 'amulet' && base.slot !== 'ring') {
    const parts = buildGear(gl.model, gl.palette);
    const main = parts.get('sock_handR') ?? parts.get('sock_chest') ?? parts.get('sock_head') ?? parts.get('sock_handL') ?? parts.get('sock_footL');
    if (main) {
      const box = new THREE.Box3().setFromObject(main);
      const size = box.getSize(new THREE.Vector3());
      // Lay long items (weapons, tools) flat; keep armour upright but low.
      if (parts.has('sock_handR')) {
        if (size.y >= size.z) main.rotation.x = Math.PI / 2;
        main.position.y = 0.12;
      } else {
        main.position.y = -box.min.y;
      }
      const s = Math.min(1, 1.1 / Math.max(size.x, size.y, size.z, 0.01));
      g.scale.setScalar(Math.max(0.55, s));
      g.add(main);
      return g;
    }
  }
  const kind = base.slot === 'amulet' || base.slot === 'ring' ? base.slot : base.model ?? 'ore';
  g.add(buildMaterialModel(kind, base.color ?? base.palette?.main ?? 0x999999, base.id));
  return g;
}

const coinGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.04, 8);
const coinMat = new THREE.MeshStandardMaterial({ color: 0xffd040, metalness: 0.6, roughness: 0.3, emissive: 0x6a4a00 });

/** Loot on the ground: an item or a gold pile. Pops out of a kill in an arc, then waits to be picked up. */
export class GroundItem {
  readonly group = new THREE.Group();
  gone = false;
  beam: THREE.Mesh | null = null;
  label: HTMLElement | null = null;
  private t = 0;
  private flight: { fx: number; fz: number; tx: number; tz: number; dur: number } | null;
  readonly x0: number;
  readonly z0: number;

  constructor(public item: Item | null, public gold: number, fromX: number, fromZ: number, toX: number, toZ: number) {
    this.x0 = toX;
    this.z0 = toZ;
    if (item) {
      const base = BASES[item.base];
      const color = RARITY_COLOR[item.rarity];
      const model = groundModel(item);
      model.rotation.y = Math.random() * Math.PI * 2;
      this.group.add(model);
      if (item.rarity !== 'normal') {
        const h = { magic: 2.2, rare: 4, unique: 9, normal: 0 }[item.rarity];
        const beamGeo = new THREE.CylinderGeometry(0.1, 0.22, h, 6, 1, true).translate(0, h / 2, 0);
        this.beam = new THREE.Mesh(
          beamGeo,
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
        );
        this.group.add(this.beam);
      }
    } else {
      const n = Math.min(8, 2 + Math.floor(gold / 10));
      for (let i = 0; i < n; i++) {
        const c = new THREE.Mesh(coinGeo, coinMat);
        c.position.set((Math.random() - 0.5) * 0.35, 0.03 + i * 0.03, (Math.random() - 0.5) * 0.35);
        c.castShadow = true;
        this.group.add(c);
      }
    }
    this.group.traverse((o) => (o.castShadow = o instanceof THREE.Mesh && o !== this.beam));
    this.group.position.set(fromX, 0, fromZ);
    this.flight = { fx: fromX, fz: fromZ, tx: toX, tz: toZ, dur: 0.45 + Math.random() * 0.2 };
  }

  get x() {
    return this.group.position.x;
  }
  get z() {
    return this.group.position.z;
  }
  get landed() {
    return !this.flight;
  }

  get labelText() {
    return this.item ? itemName(this.item) : `${this.gold} gold`;
  }

  /** Returns true on the frame it lands. */
  update(dt: number): boolean {
    this.t += dt;
    if (this.beam) {
      const m = this.beam.material as THREE.MeshBasicMaterial;
      m.opacity = 0.3 + Math.sin(this.t * 3) * 0.12;
      this.beam.rotation.y += dt;
    }
    if (!this.flight) return false;
    const f = this.flight;
    const p = Math.min(1, this.t / f.dur);
    this.group.position.set(f.fx + (f.tx - f.fx) * p, Math.sin(p * Math.PI) * 1.6, f.fz + (f.tz - f.fz) * p);
    this.group.rotation.y += dt * 8;
    if (p >= 1) {
      this.flight = null;
      this.group.position.y = 0;
      return true;
    }
    return false;
  }
}
