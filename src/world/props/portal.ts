import * as THREE from 'three';
import { hash01, taper } from '../../render/blocks';
import { ModelKit } from '../../render/kit';
import { makePortal, type PortalSpec } from '../portalFx';
import { cb, light, type Obj, type Prop } from './core';
import { STONE, STONE_D, STONE_L } from './palette';

// The portal platform (and the stepped dais it shares with the landing).

/** Stepped square dais with rune inlays (portals, landing). Returns the height of its top. */
export function dais(k: ModelKit, g: Obj, size: number, rune: number | null, seed: number) {
  const glow = rune ?? 0;
  const inlay = rune ?? 0x2e2c34;
  cb(k, g, [size, 0.26, size], [0, 0.13, 0], STONE_D, undefined, 0.06);
  cb(k, g, [size - 0.56, 0.22, size - 0.56], [0, 0.37, 0], STONE, undefined, 0.05);
  cb(k, g, [size - 1.12, 0.14, size - 1.12], [0, 0.55, 0], STONE_L, undefined, 0.04);
  const top = 0.62, inner = (size - 1.12) / 2 - 0.2;
  // A square rune ring inlaid in the top step, glyph ticks on the middle step.
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2, ca = Math.cos(a), sa = Math.sin(a);
    k.box(g, [inner * 2, 0.02, 0.07], [sa * inner, top, ca * inner], inlay, [0, a, 0], glow, rune ? 1.8 : 0);
    for (const t of [-0.55, 0, 0.55]) {
      const r = (size - 0.56) / 2 - 0.13, v = t * r;
      const tall = hash01(seed, i, t) > 0.5;
      k.box(g, [0.07, 0.02, tall ? 0.16 : 0.1], [sa * r + ca * v, 0.49, ca * r - sa * v], inlay, [0, a, 0], glow, rune ? 1.6 : 0);
    }
  }
  // Short corner pylons with a glowing band.
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const x = sx * (size / 2 - 0.3), z = sz * (size / 2 - 0.3);
    k.mesh(g, taper(0.42, 0.42, 0.24, 0.24, 1.0), STONE_D, [x, 0.26 + 0.5, z]);
    k.box(g, [0.36, 0.08, 0.36], [x, 0.9, z], inlay, undefined, glow, rune ? 1.5 : 0);
  }
  return top;
}

/**
 * Portal platform projecting the portal window and its title (src/world/portalFx.ts). `arg` is a
 * PortalSpec (destination, name, colour) or just a colour; a null colour = sealed/dormant.
 */
export function portal(k: ModelKit, g: THREE.Group, arg: PortalSpec | number | null): Prop {
  const spec: PortalSpec = arg !== null && typeof arg === 'object' ? arg : { color: arg };
  const top = dais(k, g, 3.0, spec.color, 5);
  const fx = makePortal(spec, top);
  if (fx) g.add(fx.obj);
  if (spec.color === null) return { obj: g, tick: fx?.tick };
  const l = light(g, spec.color, 3.5, 6, 1.6);
  return { obj: g, light: l, tick: (t) => { fx?.tick(t); l.intensity = 3.2 + Math.sin(t * 2.2) * 0.6; } };
}
