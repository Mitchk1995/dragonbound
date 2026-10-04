import * as THREE from 'three';
import { hash01, octagon, prism, taper, wedge } from '../../render/blocks';
import { PAL } from '../../render/kit';
import { type Builder, cb, chunk, decal, flame, lenOf, light, masonry, type Obj, spread, vOf, type WallSpec } from './core';
import { BONE, BONE_D, BRICK, BRICK_D, BRICK_L, BRICK_SOOT, COAL, DARK, HERALD_BLUE, HERALD_BLUE_D, IRON, IRON_L, SAND, SLATE, SOOT, STONE, STONE_D, STONE_DD, STONE_L, WOOD, WOOD_D, WOOD_L } from './palette';
import { raggedDisc } from './pieces';
import { PLANT } from './plants';

// Keep dressing (roadsides, yards, gardens): fences, hedges, carts, crops, the forge yard and the camp.

export const KEEP_PROPS: Record<string, Builder> = {
  /** A post-and-rail fence along local X, `len` long. */
  fence: (k, g, arg) => {
    const L = Math.max(1.5, arg ?? 6), n = Math.max(1, Math.round(L / 1.6));
    for (let i = 0; i <= n; i++) {
      const x = -L / 2 + (i * L) / n;
      cb(k, g, [0.18, 1.1, 0.18], [x, 0.55, 0], WOOD_D, [0, 0, (hash01(i, 5) - 0.5) * 0.06], 0.03);
      k.mesh(g, taper(0.18, 0.18, 0.06, 0.06, 0.12), WOOD_D, [x, 1.16, 0]);
    }
    // Each rail one straight length nailed along the posts' faces from end to end.
    for (const y of [0.45, 0.88]) cb(k, g, [L + 0.1, 0.1, 0.08], [0, y, 0.1], WOOD, undefined, 0.02);
  },
  /**
   * The forge yard's lean-to: a shingled roof on four squared posts on stone pads, built to stand
   * against a wall on its back (-Z) side, sloping down toward the front (+Z), with a deep front
   * beam and knee braces; the Emberforge's chimney rises through it at the back. Kept high and
   * shallow so the hearth under it stays in view of the high camera.
   */
  forge_canopy: (k, g) => {
    const W = 7.0, D = 3.0, back = 3.6, front = 3.2;
    for (const x of [-W / 2 + 0.2, W / 2 - 0.2]) for (const z of [-D / 2 + 0.2, D / 2 - 0.2]) {
      const h = z < 0 ? back : front;
      cb(k, g, [0.5, 0.2, 0.5], [x, 0.1, z], STONE_D, undefined, 0.04);
      cb(k, g, [0.24, h, 0.24], [x, h / 2, z], WOOD_D, undefined, 0.03);
      if (z > 0) for (const e of [-1, 1]) if ((x < 0 && e > 0) || (x > 0 && e < 0)) cb(k, g, [0.9, 0.14, 0.14], [x + e * 0.38, front - 0.42, z], WOOD_D, [0, 0, e * 0.7], 0.02);
    }
    cb(k, g, [W + 0.2, 0.3, 0.26], [0, front - 0.1, D / 2 - 0.2], WOOD, undefined, 0.03);
    cb(k, g, [W + 0.2, 0.26, 0.26], [0, back - 0.1, -D / 2 + 0.2], WOOD, undefined, 0.03);
    for (const x of [-W / 2 + 0.2, W / 2 - 0.2]) cb(k, g, [0.2, 0.2, D], [x, (front + back) / 2 + 0.02, 0], WOOD, [Math.atan2(back - front, D), 0, 0], 0.02);
    const slope = Math.atan2(back - front, D), run = (D + 0.9) / Math.cos(slope);
    cb(k, g, [W + 0.7, 0.16, run], [0, (front + back) / 2 + 0.2, 0.15], 0x9a5438, [slope, 0, 0], 0.03);
    cb(k, g, [W + 0.75, 0.12, 0.2], [0, front + 0.06, D / 2 + 0.55], 0x7a4a34, [slope, 0, 0], 0.02);
  },
  /** A memorial: a stele on three steps with a bronze dragon crest, an undying flame before it. */
  memorial: (k, g) => {
    cb(k, g, [3.0, 0.24, 3.0], [0, 0.12, 0], STONE_DD, undefined, 0.05);
    cb(k, g, [2.3, 0.24, 2.3], [0, 0.36, 0], STONE_D, undefined, 0.05);
    cb(k, g, [1.6, 0.24, 1.2], [0, 0.6, -0.2], STONE, undefined, 0.05);
    k.mesh(g, taper(1.1, 0.46, 0.92, 0.38, 2.2), STONE_L, [0, 1.82, -0.2]);
    cb(k, g, [1.2, 0.22, 0.56], [0, 3.02, -0.2], STONE, undefined, 0.05);
    k.mesh(g, taper(0.9, 0.42, 0.2, 0.2, 0.36), STONE, [0, 3.31, -0.2]);
    // The crest: a bronze diamond with spread wings, and a dark tablet of names below it.
    k.box(g, [0.44, 0.44, 0.06], [0, 2.35, 0.0], 0xb07a3a, [0, 0, Math.PI / 4]);
    for (const e of [-1, 1]) k.mesh(g, wedge(0.5, 0.2, 0.05), 0xb07a3a, [e * 0.38, 2.42, 0.0], [0, 0, e * -0.35]);
    k.box(g, [0.66, 0.66, 0.04], [0, 1.45, 0.01], 0x4a4440);
    for (let i = 0; i < 4; i++) k.box(g, [0.46 - (i % 2) * 0.12, 0.04, 0.02], [0, 1.66 - i * 0.14, 0.04], 0xc8b890);
    // The undying flame in a bowl on the top step.
    k.mesh(g, taper(0.36, 0.36, 0.56, 0.56, 0.22), IRON, [0, 0.83, 0.65]);
    k.box(g, [0.46, 0.04, 0.46], [0, 0.93, 0.65], 0x4a1c0c, undefined, PAL.fire, 0.6);
    return { obj: g, tick: flame(k, g, 0, 0.92, 0.65, 0.55) };
  },
  /** A clipped box hedge along local X, `len` long, with leafy lumps on top. */
  hedge: (k, g, arg) => {
    // v: its height (a low garden hedge by default, a tall clipped yew where it frames a court).
    const L = Math.max(1.2, lenOf(arg) ?? 4), H = vOf(arg) || 0.9, T = H > 1.2 ? 1.0 : 0.9;
    cb(k, g, [L, H, T], [0, H / 2, 0], H > 1.2 ? 0x2f5a28 : 0x3e6a2e, undefined, 0.12);
    for (let x = -L / 2 + 0.45; x < L / 2 - 0.2; x += 0.7) {
      const s = 0.5 + hash01(x, 3) * 0.2;
      cb(k, g, [s + 0.2, 0.3, T - 0.2], [x + (hash01(x, 1) - 0.5) * 0.2, H + 0.05, (hash01(x, 2) - 0.5) * 0.12], hash01(x, 4) > 0.5 ? 0x4a7a34 : 0x44722f, [0, hash01(x) * 0.6, 0], 0.12);
    }
  },
  /** A two-wheeled hand cart loaded with sacks and a crate, its shafts resting on the ground. */
  cart: (k, g) => {
    cb(k, g, [1.3, 0.12, 1.9], [0, 0.72, 0], WOOD, undefined, 0.02);
    for (const x of [-0.62, 0.62]) cb(k, g, [0.08, 0.34, 1.9], [x, 0.93, 0], WOOD_D, undefined, 0.02);
    cb(k, g, [1.3, 0.34, 0.08], [0, 0.93, -0.92], WOOD_D, undefined, 0.02);
    for (const x of [-0.78, 0.78]) {
      k.mesh(g, octagon(0.52, 0.12), WOOD_D, [x, 0.52, -0.1]);
      k.mesh(g, octagon(0.14, 0.16), IRON, [x, 0.52, -0.1]);
    }
    cb(k, g, [1.7, 0.08, 0.08], [0, 0.52, -0.1], IRON, undefined, 0.01);
    for (const x of [-0.5, 0.5]) cb(k, g, [0.09, 0.09, 1.7], [x, 0.42, 1.55], WOOD_D, [-0.42, 0, 0], 0.02);
    cb(k, g, [0.6, 0.5, 0.5], [-0.25, 1.03, -0.4], 0xb09a70, [0, 0.3, 0], 0.18);
    cb(k, g, [0.5, 0.46, 0.46], [0.3, 1.01, 0.1], 0xa08a60, [0, -0.2, 0], 0.18);
    cb(k, g, [0.5, 0.45, 0.5], [-0.2, 1.0, 0.5], WOOD_L, [0, 0.2, 0], 0.04);
  },
  /** A straw archery butt on an easel, rings facing +Z, a pennant flying beside it. */
  target: (k, g) => {
    for (const x of [-0.45, 0.45]) cb(k, g, [0.1, 1.6, 0.1], [x, 0.8, -0.2], WOOD_D, undefined, 0.02);
    cb(k, g, [0.1, 1.5, 0.1], [0, 0.7, -0.6], WOOD_D, [-0.4, 0, 0], 0.02);
    cb(k, g, [1.1, 0.08, 0.1], [0, 0.5, -0.2], WOOD_D, undefined, 0.01);
    k.mesh(g, octagon(0.62, 0.3), 0xc8a858, [0, 1.15, 0], [0, Math.PI / 2, 0]);
    ([[0.5, 0xe8dcc0], [0.36, HERALD_BLUE], [0.2, 0xe8dcc0], [0.09, PAL.gold]] as [number, number][]).forEach(([r, c], i) => {
      k.mesh(g, octagon(r, 0.04), c, [0, 1.15, 0.17 + i * 0.03], [0, Math.PI / 2, 0]);
    });
    for (const [x, y] of [[0.12, 1.25], [-0.2, 1.05]]) cb(k, g, [0.03, 0.03, 0.5], [x, y, 0.45], WOOD_L, [0.1, 0.1, 0], 0.01);
    // A pennant on a pole beside it, so the archers can read the wind.
    cb(k, g, [0.06, 2.4, 0.06], [0.7, 1.2, -0.2], WOOD_D, undefined, 0.01);
    k.mesh(g, wedge(0.04, 0.6, 0.32), HERALD_BLUE, [0.7, 2.22, 0.13], [Math.PI / 2, 0, 0]);
    k.box(g, [0.05, 0.32, 0.08], [0.7, 2.22, -0.17], PAL.gold);
  },
  /** A stone planter box of flowers. */
  planter: (k, g) => {
    cb(k, g, [1.4, 0.5, 0.8], [0, 0.25, 0], STONE_L, undefined, 0.05);
    k.box(g, [1.2, 0.05, 0.6], [0, 0.5, 0], 0x3a2a1e);
    for (let i = 0; i < 6; i++) {
      const x = -0.45 + (i % 3) * 0.45, z = i < 3 ? -0.14 : 0.14;
      cb(k, g, [0.3, 0.26, 0.3], [x, 0.62, z], 0x4a7a34, [0, i, 0], 0.1);
      cb(k, g, [0.14, 0.1, 0.14], [x + 0.04, 0.78, z], [0xd05a8a, 0xe8c040, 0xe8dcc0, 0x8a5aa0][i % 4], [0, i, 0], 0.03);
    }
  },
  /**
   * A field plot of one crop (`v`): 0 cabbages, 1 lettuces, 2 carrots, 3 leeks, 4 red cabbages, in
   * three rows on ridged dark soil, each plant the kitchen garden's own a size up (field-grown), so
   * every plot reads as what grows in it.
   */
  veg_patch: (k, g, arg) => {
    const v = vOf(arg) % 5;
    cb(k, g, [3.2, 0.2, 1.8], [0, 0.1, 0], 0x4a3624, undefined, 0.06);
    const S = 1.4, rows = new THREE.Group();
    rows.position.y = 0.2;
    rows.scale.setScalar(S);
    g.add(rows);
    const step = v === 2 || v === 3 ? 0.36 : 0.6;
    for (const z of [-0.55, 0, 0.55]) {
      // (Each row on its own ridge of turned earth, a shade darker than the plot.)
      k.box(rows, [2.9 / S, 0.05 / S, 0.36 / S], [0, 0.0, z / S], 0x3a2a1c);
      spread(2.9, step, step / 2).forEach((x, i) => {
        const seed = i * 1.37 + z * 5.1, px = x / S, pz = z / S;
        if (v === 0 || v === 4) PLANT.cabbage(k, rows, px, pz, seed, v === 4);
        else if (v === 1) PLANT.lettuce(k, rows, px, pz, seed);
        else if (v === 2) PLANT.carrot(k, rows, px, pz, seed);
        else PLANT.leek(k, rows, px, pz, seed);
      });
    }
  },
  /** A round haystack with a pitchfork leaning on it. */
  haystack: (k, g) => {
    k.mesh(g, taper(1.9, 1.9, 1.3, 1.3, 1.0), 0xc8a858, [0, 0.5, 0], [0, 0.4, 0]);
    k.mesh(g, taper(1.3, 1.3, 0.2, 0.2, 0.9), 0xb8984a, [0, 1.45, 0], [0, 0.4, 0]);
    cb(k, g, [0.06, 1.8, 0.06], [0.95, 0.9, 0.3], WOOD_L, [0, 0, 0.3], 0.01);
    cb(k, g, [0.3, 0.2, 0.04], [0.68, 1.75, 0.3], IRON, [0, 0, 0.3], 0.01);
  },
  /** A garden scarecrow: sack head, hat, ragged coat on a cross. */
  scarecrow: (k, g) => {
    cb(k, g, [0.12, 2.2, 0.12], [0, 1.1, 0], WOOD_D, undefined, 0.02);
    cb(k, g, [1.3, 0.1, 0.1], [0, 1.6, 0], WOOD_D, undefined, 0.02);
    cb(k, g, [0.6, 0.7, 0.34], [0, 1.4, 0], 0x5a6a3a, undefined, 0.08);
    cb(k, g, [0.34, 0.36, 0.32], [0, 2.02, 0], 0xb09a70, undefined, 0.08);
    k.mesh(g, taper(0.6, 0.6, 0.26, 0.26, 0.28), 0x5a4230, [0, 2.3, 0]);
    for (const x of [-0.55, 0.55]) cb(k, g, [0.24, 0.3, 0.3], [x, 1.52, 0], 0x5a6a3a, undefined, 0.06);
  },
  /** A chopping stump with an axe bitten into it and split logs around it. */
  stump: (k, g) => {
    cb(k, g, [0.7, 0.55, 0.7], [0, 0.27, 0], 0x4a3020, undefined, 0.2);
    k.mesh(g, octagon(0.3, 0.02), 0xa08058, [0, 0.55, 0], [0, 0, Math.PI / 2]);
    cb(k, g, [0.06, 0.8, 0.06], [0.2, 0.85, 0], WOOD_L, [0, 0, -0.5], 0.01);
    cb(k, g, [0.26, 0.1, 0.05], [0.02, 0.6, 0], IRON_L, [0, 0, -0.5], 0.01);
    for (let i = 0; i < 3; i++) cb(k, g, [0.5, 0.22, 0.22], [-0.6 + i * 0.1, 0.11, 0.45 - i * 0.35], 0x8a6a44, [0, i * 0.9, 0], 0.04);
  },
  board: (k, g) => {
    for (const sx of [-1, 1]) cb(k, g, [0.14, 2.3, 0.14], [sx * 0.85, 1.15, 0], PAL.wood, undefined, 0.02);
    cb(k, g, [1.9, 1.2, 0.1], [0, 1.4, 0], PAL.wood, undefined, 0.02);
    k.box(g, [0.5, 0.6, 0.02], [-0.4, 1.45, 0.06], 0xe8dcc0, [0, 0, 0.05]);
    k.box(g, [0.5, 0.5, 0.02], [0.35, 1.35, 0.06], 0xe8dcc0, [0, 0, -0.08]);
    k.mesh(g, wedge(2.3, 0.4, 0.6), SLATE, [0, 2.25, 0]);
  },
  forgeheart: (k, g) => {
    // The Emberforge (concept: docs/concepts/emberforge.jpg): a waist-high hearth of dressed stone with a brick-arched ash
    // pit behind an iron door, a fire pot of coals inside a stone rim, brick cheeks and a back wall
    // carrying a stone hood that narrows into the forge's own brick chimney (it rises through the
    // lean-to's roof), and the great bellows hung on its west side, its nozzle over the rim into the
    // fire. Nothing stands under it. Cold: soot-black stone, dead grey coals, the bellows sagging,
    // bricks fallen at its foot. Restored: warm stone, the pot full of glowing coals and flame.
    const cold = new THREE.Group(), hot = new THREE.Group();
    g.add(cold, hot);
    hot.visible = false;
    const W = 1.7, D = 1.3, T = 0.24, RIM = 0.75, TOP = 1.55;
    const build = (p: Obj, stone: number[], brick: number[], leather: number, seed: number, ruined: boolean) => {
      const wall = (s: Omit<WallSpec, 'seed' | 'unit'>, sd: number) => masonry(k, p, { ...s, seed: seed + sd, unit: 0.42 });
      // The body: four stone walls three courses high, the front opened for the ash pit.
      wall({ x: 0, z: D / 2 - T / 2, rot: 0, len: W, y0: 0, rows: 3, rowH: 0.25, thick: T, shades: stone, hole: { u: 0, w: 0.62, h: RIM } }, 0);
      wall({ x: 0, z: -D / 2 + T / 2, rot: 0, len: W, y0: 0, rows: 3, rowH: 0.25, thick: T, shades: stone }, 1);
      for (const sx of [-1, 1]) wall({ x: sx * (W / 2 - T / 2), z: 0, rot: Math.PI / 2, len: D - 2 * T, y0: 0, rows: 3, rowH: 0.25, thick: T, shades: stone }, 2 + sx);
      cb(k, p, [W - 2 * T, RIM - 0.05, D - 2 * T], [0, (RIM - 0.05) / 2, 0], stone[2], undefined, 0.02);
      // The ash pit: an iron door under a round brick arch.
      k.box(p, [0.44, 0.36, 0.04], [0, 0.2, D / 2 - T + 0.02], IRON);
      k.box(p, [0.22, 0.04, 0.02], [0, 0.26, D / 2 - T + 0.045], DARK);
      for (let i = 0; i < 7; i++) {
        const a = (i / 6) * Math.PI;
        cb(k, p, [0.15, 0.1, T - 0.02], [Math.cos(a) * 0.25, 0.42 + Math.sin(a) * 0.2, D / 2 - T / 2], brick[i % 2], [0, 0, a - Math.PI / 2], 0.02);
      }
      // The fire pot's rim: a course of stone across the front and down both sides.
      wall({ x: 0, z: D / 2 - 0.15, rot: 0, len: W, y0: RIM, rows: 1, rowH: 0.15, thick: 0.3, shades: stone }, 5);
      for (const sx of [-1, 1]) wall({ x: sx * (W / 2 - 0.15), z: -0.03, rot: Math.PI / 2, len: 0.76, y0: RIM, rows: 1, rowH: 0.15, thick: 0.3, shades: stone }, 6 + sx);
      // Brick back wall and cheeks round the fire, the stone hood on them, the chimney out of it.
      wall({ x: 0, z: -D / 2 + T / 2, rot: 0, len: W, y0: RIM, rows: 4, rowH: (TOP - RIM) / 4, thick: T, shades: brick }, 10);
      for (const sx of [-1, 1]) wall({ x: sx * (W / 2 - T / 2), z: -0.155, rot: Math.PI / 2, len: 0.51, y0: RIM + 0.15, rows: 3, rowH: (TOP - RIM - 0.15) / 3, thick: T, shades: brick }, 11 + sx);
      k.mesh(p, taper(W + 0.1, 0.85, 0.72, 0.56, 0.55, 0, -0.1), stone[0], [0, TOP + 0.275, -0.225]);
      cb(k, p, [0.6, 2.4, 0.48], [0, 3.2, -0.325], brick[0], undefined, 0.03);
      cb(k, p, [0.74, 0.16, 0.62], [0, 4.48, -0.325], stone[1], undefined, 0.03);
      // The bellows: a leather bag between its nozzle and an outer board, hung from a post.
      const droop = ruined ? 0.18 : 0;
      k.mesh(p, taper(0.75, 0.6, 0.18, 0.18, 0.55), leather, [-1.2, 1.05 - droop / 2, 0.3], [droop, 0, -Math.PI / 2]);
      cb(k, p, [0.06, 0.8, 0.62], [-1.5, 1.05 - droop, 0.3], WOOD_D, [droop, 0, 0], 0.02);
      cb(k, p, [0.12, 1.45, 0.12], [-1.6, 0.725, 0.3], WOOD_D, undefined, 0.02);
      k.mesh(p, taper(0.09, 0.09, 0.06, 0.06, 0.5), IRON, [-0.73, 0.97, 0.3], [0, 0, -Math.PI / 2]);
      if (ruined) for (const [x, z, r] of [[1.0, 0.75, 0.4], [1.12, 0.45, 1.3], [0.7, 0.86, 2.2]]) cb(k, p, [0.22, 0.1, 0.12], [x, 0.05, z], brick[1], [0, r, 0], 0.02);
    };
    build(cold, SOOT, BRICK_SOOT, 0x5a4230, 31, true);
    build(hot, SAND, [BRICK, BRICK_L, BRICK_D], PAL.leather, 31, false);
    // The coals: dead and grey, or banked high and glowing with a flame on them.
    for (let i = 0; i < 9; i++) chunk(k, cold, 900 + i, [0.24, 0.12, 0.22], [-0.42 + (i % 3) * 0.42, RIM, -0.3 + Math.floor(i / 3) * 0.28], 0x4a4644, i);
    k.box(hot, [W - 0.62, 0.05, 0.74], [0, RIM + 0.03, -0.03], 0x3a1206, undefined, PAL.fire, 0.9);
    for (let i = 0; i < 9; i++) chunk(k, hot, 900 + i, [0.24, 0.12, 0.22], [-0.42 + (i % 3) * 0.42, RIM, -0.3 + Math.floor(i / 3) * 0.28], i % 3 ? COAL : 0xff8a30, i, i % 3 ? 0 : PAL.fire, 1.6);
    k.box(hot, [0.38, 0.03, 0.28], [0, 4.57, -0.325], 0x2a0c04, undefined, 0xff5a1a, 0.9);
    const f = flame(k, hot, 0, RIM + 0.05, -0.1, 0.55);
    const l = light(hot, 0xff7a30, 8, 7, 1.2);
    l.position.z = 0.6;
    return {
      obj: g,
      light: l,
      tick: (t: number) => {
        f(t);
        l.intensity = 7 + Math.sin(t * 11) * 1.2;
      },
      setState: (s) => {
        cold.visible = s !== 'restored';
        hot.visible = s === 'restored';
      },
    };
  },
  tent: (k, g, v) => {
    // A goblin hide tent: an A-frame of stitched hides with crossed poles at each end.
    const hides = [[0x8a6a48, 0x6e5238], [0x7a5a3a, 0x5a4230], [0x8a4a34, 0x6a3a2a]][(v ?? 0) % 3];
    k.mesh(g, wedge(2.6, 1.7, 2.3), hides[0], [0, 0.85, 0], [0, Math.PI / 2, 0]);
    k.mesh(g, wedge(0.04, 1.1, 1.0), DARK, [0, 0.55, 1.29], [0, Math.PI / 2, 0]);
    // Stitched seams between hide panels, lying on the slopes (atan(1.15 / 1.7) from vertical).
    for (const x of [0.62, -0.62]) {
      k.box(g, [0.05, 0.1, 2.62], [x + Math.sign(x) * 0.03, 1.7 * (1 - Math.abs(x) / 1.15), 0], hides[1], [0, 0, Math.sign(x) * 0.595]);
      k.box(g, [0.05, 0.9, 0.08], [x * 0.9 + Math.sign(x) * 0.03, 1.7 * (1 - Math.abs(x * 0.9) / 1.15), 0.35], hides[1], [0, 0, Math.sign(x) * 0.595]);
    }
    for (const z of [-1.2, 1.2]) for (const e of [-1, 1]) cb(k, g, [0.09, 2.3, 0.09], [e * 0.28, 1.05, z], WOOD_D, [0, 0, e * 0.4], 0.02);
    cb(k, g, [0.1, 0.1, 2.9], [0, 1.72, 0], WOOD_D, undefined, 0.02);
    cb(k, g, [0.2, 0.18, 0.22], [0.32, 2.15, 1.2], BONE, undefined, 0.04);
  },
  banner: (k, g) => {
    // Goblin war banner: tattered red hide with a bone skull, on a spiked pole in a rock pile.
    cb(k, g, [0.13, 3.3, 0.13], [0, 1.65, 0], WOOD_D, undefined, 0.02);
    k.mesh(g, taper(0.13, 0.13, 0.01, 0.01, 0.4), IRON, [0, 3.5, 0]);
    cb(k, g, [1.2, 0.1, 0.1], [0, 3.05, 0], WOOD_D, undefined, 0.02);
    cb(k, g, [1.05, 1.4, 0.05], [0, 2.3, 0.06], 0x8a2a1e, undefined, 0.01);
    for (const x of [-0.36, 0.36]) cb(k, g, [0.32, 0.35, 0.05], [x, 1.43, 0.06], 0x8a2a1e, undefined, 0.01);
    cb(k, g, [0.36, 0.32, 0.06], [0, 2.4, 0.1], BONE, undefined, 0.03);
    cb(k, g, [0.24, 0.12, 0.06], [0, 2.2, 0.1], BONE_D, undefined, 0.02);
    for (const e of [-1, 1]) k.box(g, [0.08, 0.08, 0.02], [e * 0.08, 2.43, 0.135], DARK);
    for (let i = 0; i < 4; i++) chunk(k, g, 110 + i, [0.45, 0.35, 0.4], [Math.cos(i * 1.6) * 0.3, -0.05, Math.sin(i * 1.6) * 0.3], 0x6a6258, i);
  },
  weapon_rack: (k, g) => {
    for (const x of [-0.9, 0.9]) for (const e of [-1, 1]) cb(k, g, [0.1, 1.5, 0.1], [x, 0.7, e * 0.22], WOOD_D, [e * -0.3, 0, 0], 0.02);
    cb(k, g, [2.0, 0.1, 0.1], [0, 1.35, 0], WOOD, undefined, 0.02);
    cb(k, g, [2.0, 0.08, 0.08], [0, 0.35, 0.3], WOOD, undefined, 0.02);
    for (const [x, tilt] of [[-0.6, 0.15], [-0.2, -0.1], [0.55, 0.1]]) {
      cb(k, g, [0.06, 1.9, 0.06], [x, 0.95, 0.12], WOOD_L, [0.25, 0, tilt], 0.01);
      // The spear's head on the top of its shaft.
      const top = new THREE.Vector3(0, 0.92, 0).applyEuler(new THREE.Euler(0.25, 0, tilt)).add(new THREE.Vector3(x, 0.95, 0.12));
      k.mesh(g, prism(0.12, 0.35, 0.6), IRON_L, [top.x, top.y, top.z], [0.25, 0, tilt]);
    }
    cb(k, g, [0.07, 1.2, 0.07], [0.2, 0.6, 0.28], WOOD, [0.3, 0, 0.05], 0.01);
    {
      // The axe's head on the top of its haft.
      const head = new THREE.Vector3(0.1, 0.48, 0).applyEuler(new THREE.Euler(0.3, 0, 0.05)).add(new THREE.Vector3(0.2, 0.6, 0.28));
      cb(k, g, [0.3, 0.26, 0.05], [head.x, head.y, head.z], IRON, [0.3, 0, 0.05], 0.02);
    }
    // Two kite shields leaning on its front, painted in the lord's colours.
    for (const [x, c] of [[-0.55, HERALD_BLUE_D], [0.45, HERALD_BLUE]] as [number, number][]) {
      cb(k, g, [0.56, 0.62, 0.06], [x, 0.62, 0.42], c, [-0.22, 0, 0], 0.02);
      k.mesh(g, wedge(0.56, 0.36, 0.06), c, [x, 0.13, 0.52], [Math.PI - 0.22, 0, 0]);
      k.box(g, [0.18, 0.18, 0.03], [x, 0.66, 0.46], PAL.gold, [-0.22, 0, Math.PI / 4]);
    }
  },
  campfire: (k, g) => {
    // Read from above: a dark ash bed inside a ring of grey stones, two charred logs crossed over
    // glowing coals, and a tall flame. The light hangs high so the stones stay stone-coloured.
    decal(k.mesh(g, raggedDisc(61, 14, 0.8, 0.95, 0.2), 0x241e1a, [0, 0.03, 0]));
    const stones = [0x6a6560, 0x5c5752, 0x77716a];
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + hash01(i, 3) * 0.2;
      chunk(k, g, 50 + i, [0.34, 0.26, 0.3], [Math.cos(a) * 0.82, -0.04, Math.sin(a) * 0.82], stones[i % 3], -a);
    }
    k.box(g, [0.62, 0.08, 0.62], [0, 0.06, 0], 0x5a1a04, [0, 0.4, 0], PAL.fire, 1.4);
    for (const [a, y] of [[0.62, 0.16], [-0.62, 0.3]] as [number, number][]) {
      cb(k, g, [0.22, 0.2, 1.35], [0, y, 0], 0x4a3020, [0, a, 0], 0.07);
      for (const e of [-1, 1]) cb(k, g, [0.23, 0.21, 0.16], [Math.sin(a) * e * 0.6, y, Math.cos(a) * e * 0.6], 0x1e1612, [0, a, 0], 0.06);
    }
    const f = flame(k, g, 0, 0.22, 0, 1.3);
    const f2 = flame(k, g, 0.22, 0.2, 0.12, 0.7), f3 = flame(k, g, -0.18, 0.2, -0.14, 0.6);
    const l = light(g, 0xff8a3a, 10, 11, 2.6);
    return { obj: g, light: l, tick: (t) => { f(t); f2(t + 0.4); f3(t + 0.9); l.intensity = 9.5 + Math.sin(t * 13) * 1.5; } };
  },
};
