import * as THREE from 'three';
import { taper } from '../../render/blocks';
import { ModelKit, type V3 } from '../../render/kit';
import { cb } from './core';

// Garden plants.
// Chunky, readable plants for the castle's beds, each built of a few blocks so it reads as what it
// is from the play camera: tulips, rose bushes, lavender, delphiniums and daisies in the flower beds;
// cabbages, lettuces, carrots and leeks in the kitchen garden. Each stands on y = 0 at (x, z).
const STEM = 0x4a7a34, LEAF_G = 0x5a8a3a, LEAF_D = 0x3e6a2e;
export const PLANT = {
  /** A tulip: a straight stem, two broad leaves at its foot and a cup of colour on top. */
  tulip(k: ModelKit, g: THREE.Object3D, x: number, z: number, c: number, h: number, turn: number) {
    k.box(g, [0.03, h, 0.03], [x, h / 2, z], STEM);
    k.box(g, [0.1, 0.22, 0.03], [x, 0.11, z], LEAF_G, [0, turn, 0.3]);
    k.box(g, [0.1, 0.18, 0.03], [x, 0.09, z], LEAF_G, [0, turn + 1.6, -0.3]);
    k.mesh(g, taper(0.08, 0.08, 0.15, 0.15, 0.16), c, [x, h + 0.06, z], [0, turn, 0]);
  },
  /** A rose bush: a rounded dark-green bush studded with layered blooms. */
  rose(k: ModelKit, g: THREE.Object3D, x: number, z: number, c: number, s: number, seed: number) {
    cb(k, g, [0.5 * s, 0.42 * s, 0.5 * s], [x, 0.21 * s, z], LEAF_D, [0, seed, 0], 0.12 * s);
    cb(k, g, [0.36 * s, 0.22 * s, 0.36 * s], [x, 0.44 * s, z], STEM, [0, seed + 0.7, 0], 0.08 * s);
    for (let i = 0; i < 5; i++) {
      const a = seed * 2.3 + (i * Math.PI * 2) / 5, r = i === 4 ? 0 : 0.17 * s, y = (i === 4 ? 0.58 : 0.4 + (i % 2) * 0.08) * s;
      const bx = x + Math.sin(a) * r, bz = z + Math.cos(a) * r;
      k.box(g, [0.13, 0.08, 0.13], [bx, y, bz], c, [0, a, 0]);
      k.box(g, [0.08, 0.06, 0.08], [bx, y + 0.06, bz], c, [0, a + 0.8, 0]);
    }
  },
  /** Lavender: a low grey-green mound bristling with purple flower spikes. */
  lavender(k: ModelKit, g: THREE.Object3D, x: number, z: number, seed: number) {
    cb(k, g, [0.42, 0.2, 0.42], [x, 0.1, z], 0x6e8e6a, [0, seed, 0], 0.08);
    for (let i = 0; i < 7; i++) {
      const a = seed + i * 2.4, r = i ? 0.13 : 0, lean = i ? 0.22 : 0;
      const bx = x + Math.sin(a) * r, bz = z + Math.cos(a) * r, rot: V3 = [Math.cos(a) * lean, 0, -Math.sin(a) * lean];
      k.box(g, [0.022, 0.3, 0.022], [bx, 0.33, bz], 0x7a9a72, rot);
      k.box(g, [0.05, 0.13, 0.05], [bx + Math.sin(a) * lean * 0.2, 0.5, bz + Math.cos(a) * lean * 0.2], 0x8a62c8, rot);
    }
  },
  /** A delphinium: a tall spike of blue florets over a clump of leaves. */
  delphinium(k: ModelKit, g: THREE.Object3D, x: number, z: number, c: number, h: number) {
    cb(k, g, [0.3, 0.18, 0.3], [x, 0.09, z], LEAF_G, undefined, 0.06);
    k.box(g, [0.03, h, 0.03], [x, h / 2, z], STEM);
    for (let i = 0; i < 4; i++) k.box(g, [0.11 - i * 0.02, 0.09, 0.11 - i * 0.02], [x, h * 0.55 + i * h * 0.13, z], c, [0, i * 0.7, 0]);
  },
  /** Daisies: a low clump of white flowers with gold hearts. */
  daisy(k: ModelKit, g: THREE.Object3D, x: number, z: number, seed: number) {
    cb(k, g, [0.34, 0.12, 0.34], [x, 0.06, z], LEAF_G, [0, seed, 0], 0.05);
    for (let i = 0; i < 3; i++) {
      const a = seed + i * 2.1, bx = x + Math.sin(a) * 0.09, bz = z + Math.cos(a) * 0.09;
      k.box(g, [0.11, 0.03, 0.11], [bx, 0.13, bz], 0xf4ece0, [0, a, 0]);
      k.box(g, [0.04, 0.03, 0.04], [bx, 0.15, bz], 0xf0c040);
    }
  },
  /** A cabbage: a round pale heart in a ring of broad blue-green outer leaves. */
  cabbage(k: ModelKit, g: THREE.Object3D, x: number, z: number, seed: number, red = false) {
    for (let i = 0; i < 5; i++) {
      const a = seed + (i * Math.PI * 2) / 5;
      k.box(g, [0.24, 0.04, 0.16], [x + Math.sin(a) * 0.13, 0.08, z + Math.cos(a) * 0.13], red ? 0x6a4a7a : 0x5f8f5a, [0, a + Math.PI / 2, 0.35]);
    }
    cb(k, g, [0.24, 0.2, 0.24], [x, 0.14, z], red ? 0x8a5a98 : 0x9cc27a, [0, seed, 0], 0.08);
  },
  /** A lettuce: a frilled ring of light green leaves round a tight heart. */
  lettuce(k: ModelKit, g: THREE.Object3D, x: number, z: number, seed: number) {
    for (let i = 0; i < 6; i++) {
      const a = seed + (i * Math.PI * 2) / 6;
      k.box(g, [0.18, 0.12, 0.04], [x + Math.sin(a) * 0.1, 0.08, z + Math.cos(a) * 0.1], i % 2 ? 0x8ac050 : 0x7ab044, [0.45, a, 0]);
    }
    k.box(g, [0.1, 0.12, 0.1], [x, 0.09, z], 0xa8d468, [0, seed, 0]);
  },
  /** A carrot: its orange shoulder at the soil, a feathery green top. */
  carrot(k: ModelKit, g: THREE.Object3D, x: number, z: number, seed: number) {
    k.box(g, [0.08, 0.06, 0.08], [x, 0.02, z], 0xe07a2a, [0, seed, 0]);
    for (let i = 0; i < 3; i++) {
      const a = seed + i * 2.1;
      k.box(g, [0.02, 0.24, 0.02], [x + Math.sin(a) * 0.03, 0.15, z + Math.cos(a) * 0.03], 0x5a9a3a, [Math.cos(a) * 0.35, 0, -Math.sin(a) * 0.35]);
      k.box(g, [0.09, 0.07, 0.09], [x + Math.sin(a) * 0.08, 0.27, z + Math.cos(a) * 0.08], 0x6aaa44, [0, a, 0]);
    }
  },
  /** A leek: a white shank under a fan of long flat blue-green leaves. */
  leek(k: ModelKit, g: THREE.Object3D, x: number, z: number, seed: number) {
    k.box(g, [0.07, 0.16, 0.07], [x, 0.08, z], 0xe6ead2);
    for (let i = 0; i < 4; i++) k.box(g, [0.07, 0.34, 0.015], [x, 0.3, z], 0x5a8a72, [0, seed + i * 0.8, (i % 2 ? 1 : -1) * (0.15 + i * 0.06)]);
  },
};
