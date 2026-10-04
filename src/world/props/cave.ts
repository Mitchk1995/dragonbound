import * as THREE from 'three';
import { hash01, taper } from '../../render/blocks';
import { studioEnv } from '../../render/env';
import { ModelKit, PAL } from '../../render/kit';
import { type Builder, cb, chunk, flame, light, type Prop, q } from './core';
import { LANDMARK_PROPS } from './landmarks';
import { BASALT, BASALT_D, BASALT_L, BLOCKS, COAL, IRON, STONE, STONE_D, WOOD, WOOD_D, WOOD_L } from './palette';
import { softDisc } from './pieces';

// Cave floor dressing: rubble, seep puddles, ore chips, mine timbers and carts, crates, pillars and braziers.

/**
 * Mine support set across a tunnel (local X spans the tunnel, +Z is along it): squared posts on
 * stone footings, a cap beam with corner braces, and an iron lantern hanging off-centre. The lit
 * variant also casts light (used sparingly: every point light costs every material).
 */
function mineFrame(k: ModelKit, g: THREE.Group, span: number, lit: boolean): Prop {
  const s = Math.max(3, span), px = s / 2 - 0.2, H = 3.0;
  for (const sx of [-1, 1]) {
    chunk(k, g, 160 + (sx > 0 ? 1 : 0), [0.6, 0.3, 0.55], [sx * px, -0.05, 0], 0x5a4a3c, sx);
    cb(k, g, [0.32, H, 0.32], [sx * px, H / 2, 0], WOOD_D, [0, 0, sx * -0.04], 0.04);
    cb(k, g, [0.14, 1.1, 0.14], [sx * (px - 0.45), H - 0.42, 0], WOOD_D, [0, 0, sx * 0.8], 0.02);
  }
  cb(k, g, [s + 0.5, 0.36, 0.4], [0, H + 0.1, 0], WOOD, undefined, 0.05);
  for (const sx of [-1, 1]) k.box(g, [0.1, 0.44, 0.44], [sx * (px + 0.02), H + 0.1, 0], IRON);
  const lx = s * 0.22;
  k.box(g, [0.04, 0.5, 0.04], [lx, H - 0.33, 0.1], IRON);
  cb(k, g, [0.3, 0.36, 0.3], [lx, H - 0.72, 0.1], IRON, undefined, 0.03);
  k.box(g, [0.2, 0.26, 0.2], [lx, H - 0.72, 0.1], 0xffd080, undefined, 0xffb040, 2.4);
  if (!lit) return { obj: g };
  const l = light(g, 0xffa050, 9, 10, H - 0.9);
  l.position.x = lx;
  l.position.z = 0.4;
  return { obj: g, light: l };
}
export const CAVE_PROPS: Record<string, Builder> = {
  /** A heap of broken rock (variant picks the arrangement); `v` ≥ 10 uses basalt. */
  rubble: (k, g, v) => {
    const s = (v ?? 0) % 10, cols = (v ?? 0) >= 10 ? [BASALT, BASALT_D, BASALT_L] : [0x6a5a4a, 0x5a4a3c, 0x7a6a58];
    const n = 5 + (s % 3);
    for (let i = 0; i < n; i++) {
      const a = hash01(s, i) * 6.3, r = i === 0 ? 0 : 0.35 + hash01(s, i, 1) * 0.55;
      const sz = i === 0 ? 0.75 : 0.25 + hash01(s, i, 2) * 0.35;
      chunk(k, g, 300 + s * 10 + i, [q(sz * 1.2), q(sz * 0.8), q(sz)], [Math.cos(a) * r, -0.04, Math.sin(a) * r], cols[i % 3], a);
    }
  },
  /** A still puddle of seep water on the cave floor (dark, glossy). */
  puddle: (k, g, v) => {
    // Shallow seep water: a damp patch darkening the floor round it, and the water itself, both
    // fading out to nothing at an irregular edge (no hard outline), glossy so it catches the
    // lantern light. A few stones at the edge.
    const s = v ?? 0;
    const damp = new THREE.Mesh(softDisc(120 + s, 1.45, [0.02, 0.012, 0.008], 0.45), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false }));
    damp.position.y = 0.03;
    damp.name = 'puddle-damp';
    const water = new THREE.Mesh(softDisc(125 + s, 1.05, [0.025, 0.055, 0.06], 0.85), new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, depthWrite: false, roughness: 0.05, metalness: 0, envMap: studioEnv(), envMapIntensity: 0.4 }));
    water.position.y = 0.045;
    water.name = 'puddle-water';
    for (const m of [damp, water]) {
      (m.material as THREE.Material).userData.decal = true;
      m.renderOrder = 1;
      g.add(m);
    }
    for (let i = 0; i < 3; i++) chunk(k, g, 130 + s * 3 + i, [0.3, 0.14, 0.24], [Math.cos(i * 2.2 + s) * 1.15, -0.03, Math.sin(i * 2.2 + s) * 0.95], 0x5a4a3c, i);
  },
  /** Loose ore chips on the floor (`v` = 0 copper, 1 tin, 2 iron, 3 coal). */
  ore_chips: (k, g, v) => {
    const cols = [[0x46a88c, 0xd07a3a], [0xd8e0e8, 0xbcc8d0], [0xb4603a, 0x8a4028], [COAL, COAL]][(v ?? 0) % 4];
    for (let i = 0; i < 7; i++) {
      const a = hash01(v ?? 0, i) * 6.3, r = 0.2 + hash01(v ?? 0, i, 1) * 0.8;
      chunk(k, g, 140 + (v ?? 0) * 7 + i, [0.2, 0.13, 0.17], [Math.cos(a) * r, -0.02, Math.sin(a) * r], cols[i % 2], a);
    }
  },
  /** A timber support set spanning a tunnel (posts, cap beam, braces, a hanging lantern); `len` = span. */
  mine_frame: (k, g, len) => mineFrame(k, g, len ?? 4, false),
  mine_frame_lit: (k, g, len) => mineFrame(k, g, len ?? 4, true),
  /** Timber shoring against a cave wall, facing +Z: posts, a cap beam and lagging planks. */
  shoring: (k, g) => {
    for (const x of [-1.2, 1.2]) cb(k, g, [0.26, 2.7, 0.26], [x, 1.35, 0], WOOD_D, undefined, 0.04);
    cb(k, g, [3.0, 0.3, 0.32], [0, 2.75, 0], WOOD, undefined, 0.04);
    for (let i = 0; i < 4; i++) cb(k, g, [2.2, 0.26, 0.08], [0, 0.5 + i * 0.55, -0.16], i % 2 ? WOOD : 0x5a3a22, [0, 0, (hash01(i) - 0.5) * 0.04], 0.02);
    for (const sx of [-1, 1]) cb(k, g, [0.12, 0.8, 0.12], [sx * 0.95, 2.35, 0.02], WOOD_D, [0, 0, sx * 0.8], 0.02);
    cb(k, g, [0.3, 0.3, 0.3], [-1.6, 0.15, 0.3], WOOD_L, [0, 0.3, 0], 0.04);
  },
  /** A mine cart tipped on its side, its ore spilled across the floor. */
  minecart_tipped: (k, g) => {
    const cart = new THREE.Group();
    cart.position.set(0, 0.62, 0);
    cart.rotation.z = 1.35;
    g.add(cart);
    LANDMARK_PROPS.minecart(k, cart);
    cart.traverse((o) => o.position.y -= o === cart ? 0 : 0.62);
    for (let i = 0; i < 7; i++) chunk(k, g, 150 + i, [0.34, 0.24, 0.3], [-0.9 - hash01(i) * 0.9, -0.04, (hash01(i, 1) - 0.5) * 1.3], 0xb4743a, i, 0x3a1a00, 0.3);
  },
  crates: (k, g) => {
    // A crate stack with a lashed lid and an octagonal barrel.
    cb(k, g, [0.85, 0.75, 0.85], [0, 0.375, 0], WOOD_L, [0, 0.3, 0], 0.04);
    for (const y of [0.12, 0.62]) cb(k, g, [0.89, 0.07, 0.89], [0, y, 0], WOOD_D, [0, 0.3, 0], 0.03);
    cb(k, g, [0.6, 0.5, 0.6], [0.1, 1.0, 0.05], WOOD_L, [0, -0.2, 0], 0.04);
    cb(k, g, [0.64, 0.06, 0.64], [0.1, 1.1, 0.05], WOOD_D, [0, -0.2, 0], 0.03);
    cb(k, g, [0.55, 0.8, 0.55], [0.8, 0.4, 0.35], PAL.leather, undefined, 0.16);
    for (const y of [0.18, 0.62]) cb(k, g, [0.59, 0.06, 0.59], [0.8, y, 0.35], IRON, undefined, 0.17);
  },
  burrow: (k, g) => {
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      chunk(k, g, 130 + i, [0.6, 0.35, 0.5], [Math.cos(a) * 0.75, -0.05, Math.sin(a) * 0.75], i % 2 ? 0x6a5a40 : 0x5a4a34, -a);
    }
    k.box(g, [0.9, 0.06, 0.9], [0, 0.03, 0], PAL.black, [0, 0.4, 0]);
  },
  boulder: (k, g) => {
    chunk(k, g, 140, [1.5, 1.1, 1.3], [0, -0.1, 0], 0x7a7068, 0.4);
    chunk(k, g, 141, [0.8, 0.6, 0.7], [0.8, -0.1, 0.4], 0x6a6058, 1.4);
  },
  pillar: (k, g) => {
    cb(k, g, [0.8, 0.3, 0.8], [0, 0.15, 0], STONE_D, undefined, 0.05);
    cb(k, g, [0.52, 2.6, 0.52], [0, 1.6, 0], STONE, undefined, 0.1);
    cb(k, g, [0.8, 0.3, 0.8], [0, 3.0, 0], STONE_D, undefined, 0.05);
  },
  pillar_broken: (k, g) => {
    cb(k, g, [0.8, 0.3, 0.8], [0, 0.15, 0], STONE_D, undefined, 0.05);
    cb(k, g, [0.52, 1.2, 0.52], [0, 0.9, 0], STONE, [0.05, 0, 0.04], 0.1);
    cb(k, g, [0.52, 1.1, 0.52], [0.9, 0.27, 0.3], STONE, [0, 0.5, Math.PI / 2], 0.1);
    chunk(k, g, 150, [0.4, 0.3, 0.35], [-0.5, 0, 0.4], BLOCKS[2], 1);
  },
  brazier: (k, g) => {
    // Kept low: an iron bowl of coals giving a warm pool of light, not a beacon (bloom only just
    // catches the coals).
    k.mesh(g, taper(0.6, 0.6, 0.3, 0.3, 0.16), IRON, [0, 0.08, 0]);
    cb(k, g, [0.16, 0.6, 0.16], [0, 0.46, 0], IRON, undefined, 0.02);
    k.mesh(g, taper(0.42, 0.42, 0.8, 0.8, 0.3), IRON, [0, 0.9, 0]);
    k.box(g, [0.66, 0.06, 0.66], [0, 1.03, 0], 0x4a1c0c, undefined, PAL.fire, 0.4);
    const f = flame(k, g, 0, 0.95, 0, 0.7);
    g.traverse((o) => {
      if (o.name === 'flame') ((o as THREE.Mesh).material as THREE.MeshStandardMaterial).emissiveIntensity = 0.5;
    });
    const l = light(g, 0xff7a3a, 3.2, 7, 1.5);
    return { obj: g, light: l, tick: (t: number) => { f(t); l.intensity = 3.2 + Math.sin(t * 9 + g.id) * 0.3; } };
  },
};
