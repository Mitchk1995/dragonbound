import * as THREE from 'three';
import { chamferBox, hash01, octagon, prism, taper, wedge } from '../../render/blocks';
import { PAL } from '../../render/kit';
import { fallingWaterMaterial, poolWater } from '../water';
import { type Builder, cb, chunk, light, masonry, q, slab } from './core';
import { BASALT, BLOCKS, BONE, BONE_D, DARK, HERALD_BLUE, IRON, OBSIDIAN, SLATE, STONE, STONE_D, STONE_DD, STONE_L, WOOD, WOOD_D, WOOD_L } from './palette';
import { softDisc } from './pieces';
import { dais } from './portal';

// Landmarks and world dressing: the waterfall, bridges, ruins of the wilds, standing stones, wells, signposts and the landing.

/**
 * A flat sheet of falling water `w` wide and `h` tall (see fallingWaterMaterial). `time` is shared by
 * every sheet of one waterfall.
 */
function fallingWater(w: number, h: number, time: { value: number }, seed: number) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), fallingWaterMaterial(time, seed, h, w));
  m.name = 'waterfall';
  m.renderOrder = 2;
  return m;
}
export const LANDMARK_PROPS: Record<string, Builder> = {
  /**
   * A waterfall pouring down a stepped rock face (front = +Z, back against the cliff): three tiers
   * of big flat slabs, the water cutting a channel down their middle, a step pool on each ledge
   * and white churn where it lands in the river. About 5 wide, 3.5 deep, 4.3 high.
   */
  waterfall: (k, g) => {
    const time = { value: 0 };
    const ROCK = 0x7a6a5a, ROCK_D = 0x5e5246, ROCK_L = 0x8a7a68;
    // Tiers: [front z, height]; each tier's slab runs back to the cliff at z = -2.
    const tiers: [number, number][] = [[0.6, 1.3], [-0.5, 2.6], [-1.4, 4.0]];
    tiers.forEach(([fz, ht], i) => {
      const d = fz + 2.1;
      for (const sx of [-1, 1]) {
        // Cheeks either side of the channel, each split into two blocks of their own tone.
        slab(k, g, 400 + i * 4 + (sx > 0 ? 1 : 0), [1.9, ht + 0.5, d], [sx * 1.75, -0.3, fz - d / 2], i % 2 ? ROCK_D : ROCK, sx * 0.04);
        slab(k, g, 402 + i * 4 + (sx > 0 ? 1 : 0), [1.0, ht + 0.8, d * 0.75], [sx * 2.55, -0.3, fz - d * 0.55], ROCK_L, -sx * 0.06);
      }
      // The channel floor of this tier (lower than the cheeks: the water has worn it down).
      slab(k, g, 420 + i, [1.75, ht + 0.18, d], [0, -0.3, fz - d / 2], ROCK_D);
    });
    // Water: a sheet down the front of each tier, a pool on each ledge, the stream on the top.
    const lips = [[0.6, 1.18, -0.2], [-0.5, 2.48, 1.18], [-1.4, 3.88, 2.48]];
    lips.forEach(([fz, top, bot], i) => {
      const hh = top - bot + 0.1;
      const sheet = fallingWater(1.5 - i * 0.12, hh, time, 11 + i);
      sheet.position.set(0, (top + bot) / 2, fz + 0.06);
      g.add(sheet);
    });
    for (const [i, [z0, z1, y]] of [[-0.5, 0.55, 1.2], [-1.4, -0.55, 2.5], [-2.0, -1.45, 3.9]].entries()) {
      // Each ledge pool takes the sheet from the tier above at its back edge (the top pool is fed by the stream).
      const pool = poolWater(time, 0.9, i < 2 ? [[0, -(z1 - z0) / 2 + 0.12, 0.5]] : []);
      const p = new THREE.Mesh(new THREE.PlaneGeometry(1.55, z1 - z0).rotateX(-Math.PI / 2), pool);
      p.position.set(0, y + 0.01, (z0 + z1) / 2);
      p.name = 'waterfall-pool';
      g.add(p);
    }
    // Churn where it lands: pale foam boulders that heave, and a soft white spread on the river.
    const foamMat = new THREE.MeshStandardMaterial({ color: 0xe8f4f4, roughness: 0.6, emissive: 0x3a5a60, flatShading: true });
    const foam: THREE.Mesh[] = [];
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI - Math.PI, r = 0.5 + hash01(i, 9) * 0.6;
      const f = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22 + hash01(i, 3) * 0.16, 0), foamMat);
      f.position.set(Math.cos(a) * r * 1.2, -0.2, 0.9 + Math.abs(Math.sin(a)) * r * 0.6);
      f.name = 'foam';
      g.add(f);
      foam.push(f);
    }
    const spread = new THREE.Mesh(softDisc(77, 1.9, [0.86, 0.95, 0.95], 0.55), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false }));
    spread.position.set(0, -0.22, 1.5);
    spread.name = 'foam-spread';
    spread.material.userData.decal = true;
    g.add(spread);
    return {
      obj: g,
      tick: (t) => {
        time.value = t;
        foam.forEach((f, i) => {
          const s = 0.8 + 0.3 * Math.sin(t * 3.1 + i * 1.7);
          f.scale.set(s, s * (0.8 + 0.2 * Math.sin(t * 4.3 + i)), s);
        });
      },
    };
  },
  /** Plank bridge along local +Z; `arg` = span length in cells. */
  bridge: (k, g, arg) => {
    const len = Math.max(4, arg ?? 6);
    const n = Math.round(len / 0.5);
    for (let i = 0; i < n; i++) {
      const z = -len / 2 + (i + 0.5) * (len / n);
      k.box(g, [2.4, 0.12, len / n - 0.04], [0, 0.02 + Math.sin((i / (n - 1)) * Math.PI) * 0.12, z], i % 3 ? PAL.wood : 0x5a3a20, [0, 0, (i % 2 - 0.5) * 0.02]);
    }
    for (const sx of [-1, 1]) {
      for (let i = 0; i <= Math.floor(len / 2); i++) {
        const z = -len / 2 + i * (len / Math.floor(len / 2));
        k.box(g, [0.14, 1.1, 0.14], [sx * 1.15, -0.1 + Math.sin(((z + len / 2) / len) * Math.PI) * 0.12, z], 0x4a3020);
      }
      k.box(g, [0.1, 0.1, len], [sx * 1.15, 0.72, 0], PAL.wood);
      for (const z of [-len / 2 + 0.3, len / 2 - 0.3]) k.box(g, [0.3, 1.4, 0.3], [sx * 1.1, -0.6, z], 0x3a2618);
    }
  },
  /** Basalt-slab bridge along local +Z (lava crossings); `arg` = span. */
  bridge_stone: (k, g, arg) => {
    const len = Math.max(4, arg ?? 6);
    const n = Math.round(len / 0.9);
    for (let i = 0; i < n; i++) {
      const z = -len / 2 + (i + 0.5) * (len / n);
      cb(k, g, [2.8, 0.35, q(len / n - 0.05)], [0, -0.1 + Math.sin((i / Math.max(1, n - 1)) * Math.PI) * 0.18, z], i % 2 ? 0x3a3232 : 0x2e2828);
    }
    for (const sx of [-1, 1]) {
      k.box(g, [0.35, 0.5, len], [sx * 1.4, 0.2, 0], 0x241e1e);
      for (const z of [-len / 2 + 0.4, 0, len / 2 - 0.4]) k.box(g, [0.6, 2, 0.6], [sx * 1.2, -0.9, z], 0x1e1818);
    }
  },
  tower_ruin: (k, g) => {
    // A square stone keep-tower: running-bond courses, a broken crenellated crown collapsing
    // toward the front-left corner, a door, and a rubble skirt sunk into the ground.
    const S = 4.0, th = 0.7, rowH = 0.62, rows = 11, y0 = -0.9, H = y0 + rows * rowH;
    const off = S / 2 - th / 2;
    // Plinth course (wider, darker) hides the ground seam on slopes.
    cb(k, g, [S + 0.4, 1.0, S + 0.4], [0, -0.35, 0], STONE_DD, undefined, 0.08);
    masonry(k, g, { x: 0, z: -off, rot: 0, len: S, y0, rows, rowH, thick: th, seed: 11 });
    masonry(k, g, { x: off, z: 0, rot: Math.PI / 2, len: S - 2 * th, y0, rows, rowH, thick: th, seed: 12 });
    masonry(k, g, {
      x: 0, z: off, rot: 0, len: S, y0, rows, rowH, thick: th, seed: 13,
      top: (u) => (u < -0.3 ? H - 2.6 - (-u - 0.3) * 1.3 : u < 0.6 ? H - 0.7 : H),
      hole: { u: 0.35, w: 1.1, h: 1.9 },
    });
    // Left wall: u runs from front (+z, u < 0) to back.
    masonry(k, g, { x: -off, z: 0, rot: Math.PI / 2, len: S - 2 * th, y0, rows, rowH, thick: th, seed: 14, top: (u) => H - Math.max(0, -u + 0.4) * 2.2 });
    // Merlons on the intact back and right walls.
    for (const u of [-1.55, -0.45, 0.65, 1.6]) {
      cb(k, g, [0.66, 0.55, th + 0.04], [u, H + 0.275, -off], hash01(u) > 0.5 ? STONE : STONE_L, undefined, 0.05);
      if (u > -1) cb(k, g, [th + 0.04, 0.55, 0.66], [off, H + 0.275, u - 0.1], STONE, undefined, 0.05);
    }
    // Door: dark doorway, planked door set back, a lintel stone above.
    k.box(g, [1.04, 1.9, 0.3], [0.35, 0.95, off + 0.05], DARK);
    cb(k, g, [0.92, 1.8, 0.1], [0.35, 0.9, off + 0.2], WOOD_D, undefined, 0.02);
    for (const y of [0.4, 1.4]) k.box(g, [0.96, 0.08, 0.04], [0.35, y, off + 0.26], IRON);
    cb(k, g, [1.6, 0.42, th + 0.1], [0.35, 2.12, off], STONE_D, undefined, 0.06);
    // Arrow slits.
    for (const [x, y, z, r] of [[1.2, 3.4, off + th / 2 + 0.01, 0], [-off - th / 2 - 0.01, 3.1, -0.9, Math.PI / 2], [off + th / 2 + 0.01, 3.9, 0.3, Math.PI / 2]] as [number, number, number, number][]) {
      k.box(g, [0.14, 0.7, 0.04], [x, y, z], DARK, [0, r, 0]);
    }
    // Inside: a dark floor, a half-fallen timber floor and a beam wedged across.
    k.box(g, [S - 2 * th, 0.1, S - 2 * th], [0, 0.05, 0], 0x3a342e);
    cb(k, g, [S - 2 * th, 0.14, 1.2], [0, 3.1, -0.7], WOOD, undefined, 0.02);
    for (const x of [-0.8, 0, 0.8]) k.box(g, [0.18, 0.18, S - 2 * th + 0.5], [x, 2.95, 0], WOOD_D, [x * 0.12, 0, 0]);
    cb(k, g, [0.24, 0.24, 2.9], [0.2, 1.5, 0.2], WOOD_D, [0.75, 0.5, 0], 0.03);
    // Banner on a pole jutting from the right wall.
    k.box(g, [0.9, 0.09, 0.09], [S / 2 + 0.45, H - 0.5, 0.9], WOOD_D);
    cb(k, g, [0.72, 1.3, 0.05], [S / 2 + 0.55, H - 1.2, 0.9], 0x8a2424, undefined, 0.01);
    for (const x of [-0.22, 0.22]) cb(k, g, [0.24, 0.3, 0.05], [S / 2 + 0.55 + x, H - 2.0, 0.9], 0x8a2424, undefined, 0.01);
    for (const e of [-1, 1]) k.box(g, [0.3, 0.3, 0.02], [S / 2 + 0.55, H - 1.1, 0.9 + e * 0.035], 0xd8b060, [0, 0, Math.PI / 4]);
    // Rubble skirt: heaviest under the collapsed corner, sunk so it never floats.
    const rubble: [number, number, number][] = [[-2.6, 1.9, 0.9], [-1.9, 2.7, 0.75], [-2.8, 0.8, 0.6], [-1.1, 2.8, 0.55], [-3.2, 2.4, 0.5], [-2.3, 3.3, 0.45], [2.6, -1.8, 0.45], [2.7, 1.9, 0.4], [-2.5, -1.6, 0.4], [0.9, -2.7, 0.4], [-0.4, 3.3, 0.35], [-3.4, 1.4, 0.35]];
    rubble.forEach(([x, z, s], i) => chunk(k, g, 60 + i, [s * 1.3, s, s * 1.1], [x, -0.25, z], BLOCKS[i % 3], i * 1.3));
  },
  dragon_bones: (k, g) => {
    // A long-dead dragon: blocky vertebrae along an arc, bent ribs, a heavy horned skull.
    for (let i = 0; i < 16; i++) {
      const z = -7 + i * 0.9;
      const y = Math.sin((i / 15) * Math.PI) * 1.2 + 0.25;
      cb(k, g, [0.5, 0.42, 0.62], [0, y, z], i % 2 ? BONE : BONE_D, [0.15, 0, 0], 0.06);
      cb(k, g, [0.12, 0.4, 0.2], [0, y + 0.35, z], BONE, undefined, 0.03);
      if (i > 3 && i < 12) {
        const span = 1.2 + Math.sin(((i - 4) / 7) * Math.PI) * 0.5;
        for (const sx of [-1, 1]) {
          cb(k, g, [span, 0.14, 0.16], [sx * span * 0.45, y + 0.05, z], BONE, [0, 0, sx * -0.35], 0.03);
          cb(k, g, [0.14, y + 0.4, 0.16], [sx * span * 0.9, (y + 0.1) / 2, z], BONE_D, [0, 0, sx * 0.12], 0.03);
        }
      }
    }
    cb(k, g, [1.3, 0.9, 2.2], [0.3, 0.45, 8.4], BONE, [0.1, 0.3, 0.1], 0.1);
    cb(k, g, [1.0, 0.35, 1.6], [0.3, 0.12, 9.5], BONE_D, [0.2, 0.3, 0], 0.06);
    for (const e of [-1, 1]) k.box(g, [0.22, 0.2, 0.05], [0.3 + e * 0.35, 0.72, 9.5], DARK, [0, 0.3, 0]);
    k.mesh(g, prism(0.28, 1.8, 0.5), BONE_D, [-0.15, 0.7, 7.7], [-1.1, 0.3, 0.35]);
    k.mesh(g, prism(0.28, 1.8, 0.5), BONE_D, [0.85, 0.7, 7.9], [-1.1, 0.3, -0.35]);
    for (let i = 0; i < 8; i++) cb(k, g, [0.3 - i * 0.025, 0.25 - i * 0.02, 0.6], [0, 0.15, -7.5 - i * 0.65], i % 2 ? BONE : BONE_D, [0, i * 0.06, 0], 0.04);
  },
  /**
   * A weathered menhir of an old stone circle (`v` picks its build): a tapered shaft leaning a
   * little, its crown broken off at a slant, standing in a half-buried footing with a fallen
   * chip at its foot, and a column of faint rune glyphs cut into its front (+Z, toward the ring's
   * centre). `v` = 99 builds the recumbent altar stone that lies in the middle of the ring.
   */
  standing_stone: (k, g, v) => {
    const s = v ?? 0, MEN = 0x6c675f, MEN_D = 0x5a554e, MEN_L = 0x7a746a, RUNE = 0x9ec8ff;
    const glyph = (x: number, y: number, z: number, tall: boolean, a = 0) =>
      k.box(g, tall ? [0.09, 0.26, 0.03] : [0.26, 0.08, 0.03], [x, y, z], RUNE, [0, a, 0], 0x3a78e0, 1.1);
    if (s === 99) {
      // Recumbent stone: a long low slab on two chocks, glyphs along its top.
      for (const x of [-0.8, 0.8]) chunk(k, g, 400 + x * 10, [0.6, 0.35, 0.8], [x, -0.05, 0], MEN_D, x);
      k.mesh(g, chamferBox(2.6, 0.5, 1.1, 0.12), MEN, [0, 0.5, 0], [0, 0, 0.03]);
      for (let i = 0; i < 4; i++) {
        const b = k.box(g, i % 2 ? [0.07, 0.03, 0.26] : [0.24, 0.03, 0.07], [-0.75 + i * 0.5, 0.76, 0], RUNE, undefined, 0x3a78e0, 0.8);
        b.rotation.z = 0.03;
      }
      return;
    }
    // Squat and broad (tall stones stretch into beams at the edge of the high camera's view).
    const h = 1.75 + hash01(s, 1) * 0.6, lean = (hash01(s, 2) - 0.5) * 0.14;
    const shaft = new THREE.Group();
    shaft.rotation.set(-0.06, 0, lean);
    g.add(shaft);
    chunk(k, g, 410 + s, [1.5, 0.42, 1.15], [0, -0.14, 0], MEN_D, hash01(s, 3));
    const wb = 1.15 + hash01(s, 5) * 0.2, db = 0.8;
    k.mesh(shaft, taper(q(wb), db, q(wb * 0.72), 0.56, q(h), 0.05, 0), MEN, [0, h / 2 + 0.1, 0]);
    // Weathered top: the crown worn down at a slant, paler where the rain has bleached it.
    k.mesh(shaft, taper(q(wb * 0.74), 0.58, q(wb * 0.5), 0.4, 0.3, 0.08 * (s % 2 ? 1 : -1), 0), MEN_L, [0.05, h + 0.25, 0]);
    const ys = [0.7, 1.05, 1.4].filter((y) => y < h - 0.25);
    ys.forEach((y, i) => {
      const t = (y - 0.1) / h, d = db / 2 - t * (db - 0.56) / 2 + 0.01;
      const b = glyph(0.05 * t, y, d, (i + s) % 2 === 0);
      g.remove(b);
      shaft.add(b);
    });
    chunk(k, g, 420 + s, [0.42, 0.28, 0.36], [0.8, -0.04, 0.55], MEN_D, s);
  },
  rails: (k, g, arg) => {
    const len = Math.max(2, arg ?? 6);
    for (const sx of [-0.35, 0.35]) k.box(g, [0.08, 0.1, len], [sx, 0.06, 0], IRON);
    for (let z = -len / 2 + 0.3; z < len / 2; z += 0.7) k.box(g, [1.1, 0.08, 0.22], [0, 0.03, z], PAL.wood);
  },
  minecart: (k, g) => {
    k.mesh(g, taper(0.9, 1.25, 1.1, 1.45, 0.62), 0x5a4a3a, [0, 0.62, 0]);
    for (const y of [0.45, 0.8]) k.box(g, [1.14, 0.07, 1.5], [0, y, 0], IRON);
    for (let i = 0; i < 5; i++) chunk(k, g, 90 + i, [0.4, 0.3, 0.4], [-0.3 + (i % 3) * 0.3, 0.8, -0.35 + Math.floor(i / 3) * 0.6], 0xb4743a, i, 0x3a1a00, 0.3);
    for (const [x, z] of [[-0.5, -0.42], [0.5, -0.42], [-0.5, 0.42], [0.5, 0.42]]) k.mesh(g, octagon(0.19, 0.1), IRON, [x, 0.2, z]);
  },
  dummy: (k, g) => {
    cb(k, g, [0.16, 1.9, 0.16], [0, 0.95, 0], WOOD, undefined, 0.03);
    cb(k, g, [1.2, 0.12, 0.12], [0, 1.4, 0], WOOD, undefined, 0.03);
    cb(k, g, [0.62, 0.8, 0.5], [0, 1.25, 0], 0xc8b070, undefined, 0.12);
    cb(k, g, [0.42, 0.4, 0.4], [0, 1.85, 0], 0xc8b070, undefined, 0.08);
    k.box(g, [0.3, 0.3, 0.04], [0, 1.3, 0.26], HERALD_BLUE);
    k.box(g, [0.12, 0.12, 0.05], [0, 1.3, 0.27], PAL.gold, [0, 0, Math.PI / 4]);
  },
  palisade: (k, g, arg) => {
    const len = Math.max(2, arg ?? 6);
    for (let x = -len / 2; x <= len / 2; x += 0.42) {
      const hgt = q(2 + (((x * 7.3) % 1) + 1) % 1 * 0.5);
      const lean = (((x * 3.1) % 1) - 0.5) * 0.06;
      cb(k, g, [0.34, hgt, 0.3], [x, hgt / 2, 0], 0x5a3a22, [0, 0, lean], 0.05);
      k.mesh(g, taper(0.34, 0.3, 0.02, 0.02, 0.45), 0x4a2e18, [x - lean * hgt, hgt + 0.22, 0], [0, 0, lean]);
    }
    k.box(g, [len, 0.14, 0.12], [0, 1.2, 0.2], 0x4a2e18);
    k.box(g, [len, 0.14, 0.12], [0, 0.5, 0.2], 0x4a2e18);
  },
  signpost: (k, g) => {
    // A squared post in a cairn with two chunky arrow boards (pointed ends), readable from above.
    for (let i = 0; i < 4; i++) chunk(k, g, 20 + i, [0.34, 0.24, 0.3], [Math.cos(i * 1.6) * 0.26, -0.04, Math.sin(i * 1.6) * 0.26], BLOCKS[i % 3], i);
    cb(k, g, [0.2, 2.3, 0.2], [0, 1.15, 0], WOOD_D, undefined, 0.03);
    k.mesh(g, taper(0.28, 0.28, 0.06, 0.06, 0.16), WOOD_D, [0, 2.38, 0]);
    // Both boards on one line, pointing opposite ways: from above it reads as one straight
    // fingerpost, never as a broken cross.
    for (const [y, a, dir] of [[1.95, 0, 1], [1.5, 0, -1]] as [number, number, number][]) {
      const arm = new THREE.Group();
      arm.position.set(0, y, 0);
      arm.rotation.y = a;
      g.add(arm);
      cb(k, arm, [1.0, 0.34, 0.1], [dir * 0.55, 0, 0.12], 0x8a6a44, undefined, 0.02);
      k.mesh(arm, wedge(0.34, 0.3, 0.1), 0x8a6a44, [dir * 1.2, 0, 0.12], [0, 0, dir * -Math.PI / 2]);
      k.box(arm, [0.6, 0.05, 0.02], [dir * 0.5, 0.04, 0.18], WOOD_D);
    }
  },
  well: (k, g) => {
    // Square stone curb, timber frame, slate gable roof, bucket.
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      cb(k, g, [1.9, 0.8, 0.35], [Math.sin(a) * 0.78, 0.4, Math.cos(a) * 0.78], i % 2 ? STONE : STONE_L, [0, a, 0], 0.06);
    }
    k.box(g, [1.2, 0.05, 1.2], [0, 0.55, 0], 0x1e3a44);
    for (const sx of [-0.8, 0.8]) cb(k, g, [0.16, 1.9, 0.16], [sx, 1.5, 0], WOOD, undefined, 0.03);
    cb(k, g, [1.9, 0.14, 0.14], [0, 2.2, 0], WOOD_D, undefined, 0.03);
    k.mesh(g, wedge(2.3, 0.7, 1.7, 0.08), SLATE, [0, 2.6, 0]);
    // The bucket on its rope from the beam.
    k.box(g, [0.03, 0.56, 0.03], [0.25, 1.92, 0], 0x8a7a5a);
    cb(k, g, [0.3, 0.3, 0.3], [0.25, 1.5, 0], WOOD_L, undefined, 0.04);
  },
  log: (k, g) => {
    // A felled log: a long octagonal beam with pale cut ends and a moss patch.
    cb(k, g, [3, 0.6, 0.6], [0, 0.28, 0], 0x4a3020, undefined, 0.17);
    for (const e of [-1, 1]) k.mesh(g, octagon(0.25, 0.04), 0xa08058, [e * 1.5, 0.28, 0]);
    cb(k, g, [0.7, 0.08, 0.36], [0.4, 0.6, 0.05], 0x5a8a3a, undefined, 0.03);
  },
  mushrooms: (k, g) => {
    for (let i = 0; i < 5; i++) {
      const x = Math.cos(i * 2.4) * 0.4, z = Math.sin(i * 2.4) * 0.4, s = 0.6 + (i % 3) * 0.25;
      k.box(g, [0.08 * s, 0.34 * s, 0.08 * s], [x, 0.17 * s, z], 0xe8dcc0);
      k.mesh(g, taper(0.36 * s, 0.36 * s, 0.18 * s, 0.18 * s, 0.14 * s), 0xb03a2a, [x, 0.4 * s, z], [0, i, 0], 0x2a0800);
    }
  },
  obsidian: (k, g) => {
    // Chunky volcanic-glass blocks with chisel tops out of a basalt knuckle (blocky, not spikes).
    chunk(k, g, 190, [1.8, 0.45, 1.5], [0, -0.12, 0], BASALT, 0.3);
    k.mesh(g, taper(1.05, 0.85, 0.42, 0.34, 3.0, 0.12, 0), OBSIDIAN, [0, 1.4, 0], [0.04, 0, 0.06]);
    k.mesh(g, taper(0.7, 0.6, 0.28, 0.24, 1.9, -0.08, 0.04), 0x241c22, [0.72, 0.85, 0.3], [-0.18, 0.6, -0.22]);
    k.mesh(g, taper(0.6, 0.5, 0.24, 0.2, 1.3, 0.04, 0), OBSIDIAN, [-0.6, 0.55, -0.35], [0.22, 1.2, 0.26]);
  },
  crystal_big: (k, g) => {
    // Glows by itself (emissive + bloom): no point light.
    k.mesh(g, prism(0.62, 2.8, 0.3), 0x7ad0ff, [0, 0, 0], [0.15, 0.3, 0.1], 0x2a8ad0, 1.3);
    k.mesh(g, prism(0.44, 1.9, 0.3), 0x7ad0ff, [0.55, 0, 0.2], [-0.3, 1, -0.35], 0x2a8ad0, 1.3);
    k.mesh(g, prism(0.38, 1.5, 0.3), 0xa0e0ff, [-0.5, 0, -0.3], [0.35, 2, 0.3], 0x2a8ad0, 1.3);
    chunk(k, g, 77, [1.3, 0.4, 1.1], [0, -0.1, 0], 0x4a4440, 0.5);
  },
  statue: (k, g) => {
    // A weathered dragon-knight on a stepped plinth.
    cb(k, g, [2.2, 0.5, 2.2], [0, 0.25, 0], STONE_D, undefined, 0.06);
    cb(k, g, [1.8, 0.6, 1.8], [0, 0.8, 0], STONE, undefined, 0.06);
    cb(k, g, [0.8, 1.4, 0.5], [0, 1.8, 0], 0x7a7870, undefined, 0.08);
    cb(k, g, [1.1, 0.35, 0.55], [0, 2.4, 0], 0x7a7870, undefined, 0.08);
    cb(k, g, [0.46, 0.5, 0.5], [0, 2.85, 0], 0x7a7870, undefined, 0.08);
    k.mesh(g, prism(0.08, 0.5, 0.6), 0x6a6860, [0, 3.05, -0.05], [-0.4, 0, 0]);
    cb(k, g, [0.16, 2.6, 0.12], [0.62, 2.3, 0.2], 0x6a6860, [0, 0, -0.1], 0.03);
    cb(k, g, [0.6, 0.9, 0.14], [-0.66, 1.9, 0.28], 0x6a6860, [0, 0.2, 0], 0.05);
  },
  landing: (k, g) => {
    // Arrival platform: a broad stepped dais with blue rune inlays.
    dais(k, g, 5.6, 0x6ab0ff, 9);
    return { obj: g, light: light(g, 0x6ab0ff, 2.2, 6, 0.8) };
  },
};
