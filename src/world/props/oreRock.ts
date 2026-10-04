import * as THREE from 'three';
import { prism } from '../../render/blocks';
import { ModelKit, type V3 } from '../../render/kit';
import { cb, chunk, type Prop } from './core';
import { COAL } from './palette';

// The ore rocks, one design per ore.

/**
 * Per-ore rock designs, about two units across: a low rock bed with the ore standing proud on
 * top, so each kind reads by shape and colour from the camera. `ore` is hidden when depleted.
 */
export function oreRock(k: ModelKit, g: THREE.Group, id: string): Prop {
  const host = new THREE.Group(), ore = new THREE.Group();
  g.add(host, ore);
  const hostCol = id === 'emberite' ? 0x2e2624 : id === 'tin' ? 0x6e6a66 : 0x6a6258;
  const s = id.length * 11;
  chunk(k, host, s + 1, [1.5, 0.62, 1.25], [0, -0.08, 0], hostCol, 0.3);
  chunk(k, host, s + 2, [0.85, 0.5, 0.8], [0.62, -0.08, 0.5], hostCol, 1.1);
  chunk(k, host, s + 3, [0.8, 0.42, 0.7], [-0.68, -0.08, 0.38], hostCol, 2.2);
  chunk(k, host, s + 4, [0.6, 0.35, 0.5], [-0.3, -0.08, -0.72], hostCol, 0.8);
  type Spot = [number, number, number, number, number];
  switch (id) {
    case 'copper': {
      // Green-teal patina chunks with bright copper breaking through.
      const xs: Spot[] = [[0.05, 0.36, 0.05, 0.62, 0x46a88c], [-0.42, 0.26, 0.38, 0.46, 0xd07a3a], [0.5, 0.26, 0.42, 0.5, 0x3d9a80], [0.28, 0.3, -0.4, 0.44, 0xd07a3a], [-0.5, 0.2, -0.22, 0.4, 0x46a88c]];
      xs.forEach(([x, y, z, r, c], i) => chunk(k, ore, 40 + i, [r, r * 0.8, r], [x, y, z], c, i, c === 0xd07a3a ? 0x6a2a08 : 0x0a3a2a, 0.5));
      break;
    }
    case 'tin': {
      // Pale silvery crystal blocks fanning up out of the rock.
      const xs: Spot[] = [[0, 0.25, 0.05, 0.34, 1.3], [0.34, 0.2, 0.32, 0.28, 1.0], [-0.34, 0.2, 0.26, 0.26, 0.95], [0.18, 0.2, -0.32, 0.28, 0.9], [-0.42, 0.15, -0.22, 0.22, 0.7], [0.58, 0.1, 0.55, 0.2, 0.6]];
      xs.forEach(([x, y, z, w, h], i) => k.mesh(ore, prism(w, h, 0.26), i % 2 ? 0xd8e0e8 : 0xbcc8d0, [x, y, z], [z * 0.8, i * 0.7, -x * 0.8], 0x3a4450, 0.6));
      break;
    }
    case 'iron': {
      // Rusty square blocks stacked out of the rock.
      const xs: Spot[] = [[0.05, 0.62, 0.08, 0.6, 0xb4603a], [-0.4, 0.46, 0.4, 0.48, 0x8a4028], [0.48, 0.46, 0.36, 0.5, 0xa8583a], [0.22, 0.5, -0.38, 0.46, 0x6a524c], [-0.5, 0.38, -0.18, 0.4, 0x9a4a2e]];
      xs.forEach(([x, y, z, r, c], i) => cb(k, ore, [r, r * 0.85, r], [x, y, z], c, [0.2 * (i % 2), i * 0.8, 0.15], 0.05, 0x2a0a00, 0.3));
      break;
    }
    case 'coal': {
      // Black glossy blocks (they catch the light).
      const xs: Spot[] = [[0, 0.64, 0.08, 0.62, 0], [-0.42, 0.48, 0.4, 0.48, 0], [0.48, 0.48, 0.38, 0.5, 0], [0.22, 0.5, -0.38, 0.46, 0], [-0.52, 0.38, -0.16, 0.4, 0], [0.66, 0.32, -0.08, 0.34, 0]];
      xs.forEach(([x, y, z, r], i) => cb(k, ore, [r, r * 0.8, r * 0.95], [x, y, z], COAL, [0.3 * (i % 2), i * 0.9, 0.15], 0.04));
      break;
    }
    default: {
      // Emberite: glowing ember crystals out of dark basalt.
      const xs: Spot[] = [[0, 0.2, 0.05, 0.38, 1.5], [0.36, 0.15, 0.34, 0.3, 1.05], [-0.36, 0.15, 0.3, 0.3, 1.0], [0.2, 0.15, -0.32, 0.26, 0.85], [-0.46, 0.1, -0.26, 0.22, 0.65]];
      xs.forEach(([x, y, z, w, h], i) => k.mesh(ore, prism(w, h, 0.3), i % 2 ? 0xff8a3a : 0xff6a1a, [x, y, z], [z * 0.7, i * 0.9, -x * 0.7], 0xff4a10, 1.6));
    }
  }
  // Glints: a few tiny bright facets on the ore that flash in turn (they bloom), so a vein catches
  // the eye in the dark the way wet metal catches a lamp. Emberite glows on its own.
  const glints: THREE.Object3D[] = [];
  const glintCol: Record<string, number> = { copper: 0xffc070, tin: 0xe8f4ff, iron: 0xffb080, coal: 0xd8e4ff };
  if (glintCol[id]) {
    const spots: V3[] = id === 'copper' ? [[0.1, 0.72, 0.28], [-0.4, 0.5, 0.58], [0.5, 0.5, 0.62]]
      : id === 'tin' ? [[0.02, 1.32, 0.12], [0.36, 0.96, 0.4], [-0.32, 0.92, 0.36]]
      : [[0.08, 0.98, 0.36], [-0.4, 0.72, 0.62], [0.5, 0.74, 0.6]];
    spots.forEach((at, i) => {
      const m = k.mesh(ore, prism(0.09, 0.16, 0.5), glintCol[id], at, [0.6, i * 1.3, 0.4], glintCol[id], 3.2);
      m.name = 'glint';
      glints.push(m);
    });
  }
  const phase = (s * 0.37) % 1;
  return {
    obj: g,
    tick: glints.length ? (t) => {
      glints.forEach((m, i) => {
        // Each flashes for a short moment of its own 3.4 s cycle.
        const f = (t / 3.4 + phase + i / glints.length) % 1;
        const on = Math.max(0, 1 - Math.abs(f - 0.5) / 0.07);
        m.scale.setScalar(0.45 + on * 0.9);
      });
    } : undefined,
    setState: (st) => {
      ore.visible = st !== 'depleted';
      host.scale.setScalar(st === 'depleted' ? 0.85 : 1);
    },
  };
}
