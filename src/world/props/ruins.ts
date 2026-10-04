import * as THREE from 'three';
import { hash01, octagon, taper } from '../../render/blocks';
import { ModelKit, PAL, type V3 } from '../../render/kit';
import { type Builder, cb, chunk, type Obj, q } from './core';
import { PUDDLE, STONE_DD, WOOD_D, WOOD_L } from './palette';

// The drowned city: ruined walls, a dry fountain, fallen stalls and amphorae, a broken well, the temple portico, arcade and dais.

/**
 * A blocky clay amphora (about 0.9 tall, base at the pivot) under `parent`: foot, octagonal body,
 * shoulder, neck, lip and two handles. `broken`: the shoulder and neck gone, sherds beside it.
 */
function amphora(k: ModelKit, parent: Obj, pos: V3, rot: V3, seed: number, broken = false) {
  const p = new THREE.Group();
  p.position.set(...pos);
  p.rotation.set(...rot);
  parent.add(p);
  const clay = [0xa0583a, 0x9a6a44, 0x8a4a30][seed % 3], dark = 0x6a3a26;
  k.mesh(p, taper(0.2, 0.2, 0.3, 0.3, 0.14), dark, [0, 0.07, 0]);
  cb(k, p, [0.5, 0.42, 0.5], [0, 0.35, 0], clay, undefined, 0.14);
  cb(k, p, [0.52, 0.05, 0.52], [0, 0.44, 0], dark, undefined, 0.14);
  if (broken) {
    for (let i = 0; i < 3; i++) cb(k, parent, [0.22, 0.05, 0.16], [pos[0] + Math.cos(i * 2.1 + seed) * 0.45, 0.03, pos[2] + Math.sin(i * 2.1 + seed) * 0.45], clay, [0, i + seed, 0.1], 0.01);
    return p;
  }
  k.mesh(p, taper(0.5, 0.5, 0.2, 0.2, 0.2), clay, [0, 0.66, 0]);
  cb(k, p, [0.16, 0.2, 0.16], [0, 0.85, 0], clay, undefined, 0.04);
  cb(k, p, [0.24, 0.06, 0.24], [0, 0.96, 0], dark, undefined, 0.02);
  for (const sx of [-1, 1]) cb(k, p, [0.06, 0.24, 0.06], [sx * 0.16, 0.78, 0], dark, [0, 0, sx * -0.5], 0.01);
  return p;
}
export const RUINS_PROPS: Record<string, Builder> = {
  /**
   * A length of ruined city wall along local X (`arg` = { len, v }): a sunk plinth course and a few
   * courses of big ashlar blocks in running bond, broken down to a stepped top (the height and the
   * way it has fallen come from `v`), with the odd block fallen at its foot. Bold, few pieces.
   * `v` ≥ 10000: a drowned wall, only its broken top breaking the water.
   */
  ruin_wall: (k, g, arg) => {
    const len = Math.max(1.6, arg?.len ?? 4), v = arg?.v ?? 800;
    const drowned = v >= 10000, sd = v % 100;
    const H = drowned ? 0.5 + hash01(sd, 1) * 0.5 : Math.max(0.6, Math.floor((v % 10000) / 100) / 10 * 1.5);
    const shades = [0x7a7870, 0x6e6a66, 0x6a6860];
    const D = 0.9, rowH = 0.6, y0 = drowned ? -1.25 : 0.2;
    if (!drowned) cb(k, g, [q(len + 0.2), 1.3, D + 0.2], [0, -0.45, 0], 0x6a6860, undefined, 0.06);
    const rows = Math.max(1, Math.round((H - (drowned ? -1.25 : 0.2)) / rowH));
    // Broken profile: which fraction of the length still stands at each height.
    const mode = Math.floor(hash01(sd, 2) * 4);
    const prof = (x: number) => {
      const t = x / len + 0.5;
      return mode === 0 ? 1 - t * 0.75 : mode === 1 ? 0.25 + t * 0.75 : mode === 2 ? 1 - Math.sin(t * Math.PI) * 0.6 : 0.55 + Math.sin(t * Math.PI) * 0.45;
    };
    for (let r = 0; r < rows; r++) {
      let x = -len / 2 + (r % 2 ? 0 : -0.5);
      let b = 0;
      while (x < len / 2 - 0.05) {
        const bl = 1.2 + hash01(sd, r, b) * 1.0;
        const a = Math.max(-len / 2, x), e = Math.min(len / 2, x + bl);
        x += bl;
        b++;
        if (e - a < 0.45) continue;
        const mid = (a + e) / 2;
        // Rows above the standing profile are gone; the top row keeps only its highest stretch.
        if ((r + 1) / rows > prof(mid) + 0.08) continue;
        const inset = hash01(sd, r, b, 5) * 0.08;
        cb(k, g, [q(e - a - 0.06), rowH - 0.04, q(D - inset)], [mid, y0 + r * rowH + rowH / 2, (hash01(sd, r, b, 6) - 0.5) * 0.08], shades[(r + b) % 3], undefined, 0.07);
      }
    }
    if (!drowned && hash01(sd, 9) < 0.55) {
      // One block fallen at the foot, lying askew.
      const side = hash01(sd, 10) < 0.5 ? -1 : 1, fx = (hash01(sd, 11) - 0.5) * len * 0.6;
      cb(k, g, [1.3, 0.55, 0.8], [fx, 0.22, side * 1.05], shades[1], [0.08 * side, 0.4 + hash01(sd, 12), 0.1], 0.07);
    }
  },
  /** A dry-cracked market fountain: an octagonal curb (one block fallen out) round a pool of rainwater. */
  fountain_ruin: (k, g) => {
    const R = 2.75;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      if (i === 3) {
        cb(k, g, [2.1, 0.55, 0.55], [Math.sin(a) * (R + 1.0), 0.2, Math.cos(a) * (R + 1.0)], 0x6e6a66, [0.1, a + 0.5, 0.25], 0.07);
        continue;
      }
      cb(k, g, [2.25, 0.6, 0.55], [Math.sin(a) * R, 0.3, Math.cos(a) * R], i % 2 ? 0x7a7870 : 0x6e6a66, [0, a, 0], 0.07);
    }
    k.cyl(g, R - 0.2, R - 0.2, 0.1, [0, 0.12, 0], PUDDLE, [0, Math.PI / 8, 0], 8);
  },
  /**
   * A market stall the flood knocked down (faces +Z): its stone counter still standing but split,
   * one post upright with a scrap of rotted awning, the other two fallen across the counter, the
   * shelf board slid off and a spill of broken crates and pots at its foot (`v` varies the spill).
   */
  stall_ruin: (k, g, v) => {
    const s = v ?? 0, side = s % 2 ? -1 : 1;
    // Split stone counter: two blocks, the second tipped and sunk.
    cb(k, g, [1.6, 0.8, 0.9], [-0.75 * side, 0.4, 0], 0x7a7870, [0, 0.05 * side, 0], 0.06);
    cb(k, g, [1.3, 0.72, 0.9], [0.85 * side, 0.26, 0.05], 0x6e6a66, [0.08, -0.12 * side, 0.16 * side], 0.06);
    cb(k, g, [1.7, 0.1, 1.0], [-0.72 * side, 0.85, 0], 0x5a3a22, [0, 0.05 * side, 0.03], 0.02);
    // The standing post and its scrap of faded awning.
    cb(k, g, [0.16, 2.3, 0.16], [-1.45 * side, 1.15, -0.55], WOOD_D, [0.04, 0, 0.05 * side], 0.02);
    const cloth = s % 3 === 0 ? 0x7a3a34 : s % 3 === 1 ? 0x3e5a6e : 0x5a6a3a;
    cb(k, g, [0.9, 0.05, 0.8], [-1.05 * side, 2.2, -0.3], cloth, [0.5, 0.2 * side, -0.25 * side], 0.01);
    cb(k, g, [0.5, 0.05, 0.5], [-0.9 * side, 1.85, 0.2], cloth, [1.1, 0.3 * side, -0.2 * side], 0.01);
    // Fallen posts across the counter and the shelf board slid to the ground.
    cb(k, g, [0.16, 2.2, 0.16], [0.2 * side, 1.0, 0.2], WOOD_D, [0.25, 0.4 * side, 1.15 * side], 0.02);
    cb(k, g, [0.16, 2.0, 0.16], [1.2 * side, 0.12, 0.9], WOOD_D, [Math.PI / 2, 0.9 * side, 0], 0.02);
    cb(k, g, [1.4, 0.08, 0.4], [0.3 * side, 0.08, 0.85], WOOD_L, [0.1, 0.35 * side, 0.08], 0.02);
    // The spill: a broken crate, a tipped jar and potsherds.
    cb(k, g, [0.6, 0.45, 0.6], [1.7 * side, 0.2, -0.3], WOOD_L, [0.2, 0.6 + s, 0.15], 0.03);
    amphora(k, g, [0.9 * side, 0.22, 1.35], [Math.PI / 2 - 0.2, s * 1.3, 0], s);
    for (let i = 0; i < 4; i++) cb(k, g, [0.2, 0.05, 0.14], [(0.2 + hash01(s, i) * 1.4) * side, 0.03, 1.1 + hash01(s, i, 2) * 0.7], 0xa0583a, [0, hash01(s, i, 3) * 6, 0.1], 0.01);
  },
  /** A cluster of clay amphorae: some standing, one tipped over, one broken open (`v` varies it). */
  amphorae: (k, g, v) => {
    const s = v ?? 0;
    const spots: [number, number][] = [[0, 0], [0.62, 0.2], [0.2, 0.62], [-0.45, 0.5]];
    spots.forEach(([x, z], i) => {
      if (i === 3 && s % 2) return;
      if (i === 1) amphora(k, g, [x + 0.3, 0.24, z + 0.2], [Math.PI / 2 - 0.15, s * 1.7 + 0.6, 0], s + i);
      else amphora(k, g, [x, 0, z], [0, s + i, 0], s + i, i === 2);
    });
  },
  /** A broken well: an octagonal stone curb with a gap knocked in it, its winch beam fallen. */
  well_ruin: (k, g) => {
    const R = 0.95;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      if (i === 5) {
        // The knocked-out block lies beside the gap.
        cb(k, g, [0.8, 0.45, 0.4], [Math.sin(a) * (R + 0.75), 0.18, Math.cos(a) * (R + 0.75)], 0x6e6a66, [0.15, a + 0.6, 0.3], 0.05);
        continue;
      }
      const hgt = i === 4 || i === 6 ? 0.55 : 0.8;
      cb(k, g, [0.82, hgt, 0.36], [Math.sin(a) * R, hgt / 2, Math.cos(a) * R], i % 2 ? 0x7a7870 : 0x6e6a66, [0, a, 0], 0.05);
    }
    k.mesh(g, octagon(R - 0.1, 0.05), 0x10181a, [0, 0.5, 0], [0, 0, Math.PI / 2]);
    // One upright of the winch frame still stands; the beam and the other lie in the court.
    cb(k, g, [0.16, 1.6, 0.16], [-1.05, 0.8, 0], WOOD_D, [0, 0, 0.06], 0.02);
    cb(k, g, [0.16, 1.6, 0.16], [1.5, 0.1, 0.8], WOOD_D, [Math.PI / 2, 0.7, 0], 0.02);
    cb(k, g, [1.9, 0.14, 0.14], [0.6, 0.09, 1.55], WOOD_D, [0, 0.35, 0], 0.02);
  },
  /** Big paving slabs keeping a narrow way across a slumped causeway (along local Z; `arg` = span). */
  sunken_slabs: (k, g, arg) => {
    const span = Math.max(2, arg ?? 4), n = Math.max(2, Math.round(span / 1.3));
    for (let i = 0; i < n; i++) {
      const z = -span / 2 + (i + 0.5) * (span / n), s = hash01(i, span, 3);
      cb(k, g, [q(2.1 + s * 0.3), 0.36, q(span / n - 0.12)], [(s - 0.5) * 0.25, -0.16 + s * 0.08, z], i % 2 ? 0x6e6a66 : 0x7a7870, [(s - 0.5) * 0.06, (s - 0.5) * 0.2, (hash01(i, 7) - 0.5) * 0.08], 0.05);
    }
    // Slabs that went under, tipped at the sides of the gap.
    for (const sx of [-1, 1]) cb(k, g, [1.3, 0.3, 1.5], [sx * 1.9, -0.42, (hash01(sx, span) - 0.5) * span * 0.5], 0x6a6860, [0, 0.3 * sx, sx * 0.32], 0.05);
  },
  /**
   * The drowned temple's great portico (faces +Z; about 17 wide, 4.5 deep, 6.5 high): a stepped
   * platform carrying six tall square columns before the dark doorway of the cella wall, a heavy
   * architrave still spanning four of them; the fifth has snapped, its drums and a fallen lintel
   * lying across the steps, and the last stands alone. Built of the same big ashlar as the walls.
   */
  temple_portico: (k, g) => {
    const S1 = 0x6a6860, S2 = 0x6e6a66, S3 = 0x7a7870, S4 = 0x84827a;
    // Platform: three broad steps.
    cb(k, g, [17.4, 0.4, 4.8], [0, 0.15, -0.2], S1, undefined, 0.06);
    cb(k, g, [16.6, 0.4, 4.2], [0, 0.55, -0.4], S2, undefined, 0.06);
    cb(k, g, [15.8, 0.4, 3.6], [0, 0.95, -0.6], S3, undefined, 0.06);
    const base = 1.15;
    // The cella wall behind: big courses, a tall doorway in the middle (dark inside), its top
    // broken down toward the sides.
    const wallZ = -2.1;
    for (let r = 0; r < 7; r++) {
      const y = base + r * 0.72 + 0.36;
      let x = -7.6 + (r % 2 ? 0.7 : 0);
      for (let b = 0; x < 7.6; b++) {
        const bl = 1.5 + hash01(r, b, 41) * 0.9, a = x, e = Math.min(7.6, x + bl);
        x += bl;
        const mid = (a + e) / 2;
        if (Math.abs(mid) < 1.5 && r < 5) continue;
        // The top courses survive only toward the middle.
        if (r >= 5 && Math.abs(mid) > 7.2 - (r - 4) * 2.2) continue;
        cb(k, g, [q(e - a - 0.06), 0.68, 0.9], [mid, y, wallZ], [S1, S2, S3][(r + b) % 3], undefined, 0.07);
      }
    }
    // The doorway: a deep dark opening under a lintel.
    k.box(g, [2.9, 3.5, 0.2], [0, base + 1.75, wallZ - 0.3], 0x101416);
    cb(k, g, [3.8, 0.6, 1.0], [0, base + 3.86, wallZ], S4, undefined, 0.06);
    // Columns: base block, a shaft of three drums, a capital.
    const xs = [-6.5, -3.9, -1.3, 1.3, 3.9, 6.5];
    const colZ = 0.4, H = 4.6;
    xs.forEach((x, i) => {
      const broken = i === 4;
      cb(k, g, [1.25, 0.35, 1.25], [x, base + 0.17, colZ], S1, undefined, 0.05);
      const drums = broken ? 1 : 3;
      for (let d = 0; d < drums; d++) cb(k, g, [0.9 - d * 0.03, H / 3 - 0.04, 0.9 - d * 0.03], [x, base + 0.35 + (d + 0.5) * (H / 3), colZ], d % 2 ? S2 : S3, [0, hash01(i, d) * 0.06, 0], 0.08);
      if (!broken) cb(k, g, [1.3, 0.4, 1.3], [x, base + 0.35 + H + 0.2, colZ], S4, undefined, 0.06);
    });
    // The architrave over the first four columns, in two long blocks with a cornice.
    const top = base + 0.35 + H + 0.4;
    cb(k, g, [5.4, 0.75, 1.3], [-5.2, top + 0.37, colZ], S2, undefined, 0.06);
    cb(k, g, [5.2, 0.75, 1.3], [0, top + 0.37, colZ], S3, [0, 0, 0.012], 0.06);
    cb(k, g, [10.8, 0.3, 1.55], [-2.6, top + 0.9, colZ], S4, undefined, 0.05);
    // Beams back to the cella wall (the portico's roof is gone; only a few remain).
    for (const x of [-5.2, -1.3]) cb(k, g, [0.6, 0.5, 2.6], [x, top + 0.4, -0.85], S1, undefined, 0.05);
    // The fall: the snapped column's drums and a lintel block across the steps.
    cb(k, g, [0.9, 1.4, 0.9], [4.6, 0.9, 1.9], S3, [Math.PI / 2, 0.5, 0], 0.08);
    cb(k, g, [0.88, 1.4, 0.88], [5.9, 0.75, 2.6], S2, [Math.PI / 2, 1.2, 0.1], 0.08);
    cb(k, g, [3.6, 0.7, 1.2], [3.2, 1.5, 1.3], S2, [0.12, 0.25, -0.2], 0.06);
    chunk(k, g, 470, [0.7, 0.4, 0.6], [6.9, 0.35, 2.2], S1, 0.6);
  },
  /**
   * A drowned arcade (an aqueduct or a city gallery) rising out of the water along local X:
   * square piers carrying blocky stepped arches, the deck above broken off at one end. Its base is
   * well below the surface. `arg` = number of bays (2..4).
   */
  drowned_arcade: (k, g, arg) => {
    const bays = Math.max(2, Math.min(4, arg ?? 3)), span = 3.2, len = bays * span;
    const S = [0x6a6860, 0x6e6a66, 0x7a7870];
    const y0 = -1.6, pierH = 3.2;
    for (let i = 0; i <= bays; i++) {
      const x = -len / 2 + i * span;
      const h = i === bays ? pierH * 0.55 : pierH;
      cb(k, g, [1.0, h, 1.2], [x, y0 + h / 2, 0], S[i % 3], undefined, 0.06);
      if (i === bays) continue;
      cb(k, g, [1.2, 0.3, 1.3], [x, y0 + pierH + 0.15, 0], S[2], undefined, 0.04);
    }
    // Every bay but the last (whose far pier has broken off) still carries its arch.
    for (let i = 0; i < bays - 1; i++) {
      const x = -len / 2 + (i + 0.5) * span;
      // A stepped arch: two corbel blocks narrowing the opening, a keystone course across.
      for (const sx of [-1, 1]) cb(k, g, [0.7, 0.45, 1.15], [x + sx * (span / 2 - 0.75), y0 + pierH + 0.52, 0], S[1], undefined, 0.05);
      cb(k, g, [span + 0.2, 0.55, 1.2], [x, y0 + pierH + 1.0, 0], S[(i + 1) % 3], undefined, 0.05);
      // The deck's parapet blocks, some fallen away.
      if (hash01(i, bays) < 0.7) cb(k, g, [span * 0.8, 0.4, 0.4], [x + (hash01(i, 3) - 0.5) * 0.5, y0 + pierH + 1.48, 0.42], S[i % 3], undefined, 0.04);
    }
    // The broken end: a fallen voussoir block half in the water.
    cb(k, g, [1.3, 0.55, 1.0], [len / 2 - 0.9, -0.35, 0.9], S[0], [0.3, 0.6, 0.2], 0.05);
  },
  /** The temple's stepped dais with the altar on top (faces +Z). */
  temple_dais: (k, g) => {
    const DAIS = [0x6a6860, 0x6e6a66, 0x7a7870];
    const steps: [number, number, number][] = [[10.4, 5.4, 0.3], [8.2, 4.4, 0.3], [6.0, 3.4, 0.3]];
    let y = -0.05;
    steps.forEach(([sw, sd, sh], i) => {
      cb(k, g, [sw, sh, sd], [0, y + sh / 2, -(5.4 - sd) / 2 * 0.6], DAIS[i], undefined, 0.06);
      y += sh;
    });
    const top = y, zc = -(5.4 - 3.4) / 2 * 0.6;
    // The altar: a heavy block on a footing, a darker slab lid, the seal's socket glowing faintly.
    cb(k, g, [3.0, 0.3, 1.6], [0, top + 0.15, zc - 0.2], STONE_DD, undefined, 0.05);
    cb(k, g, [2.6, 0.8, 1.2], [0, top + 0.7, zc - 0.2], 0x6e6a66, undefined, 0.06);
    cb(k, g, [2.9, 0.2, 1.5], [0, top + 1.2, zc - 0.2], 0x7a7870, undefined, 0.04);
    k.box(g, [0.9, 0.05, 0.6], [0, top + 1.32, zc - 0.2], 0x4a1c0c, undefined, PAL.fire, 0.35);
    // Two tall broken stelae behind it.
    for (const sx of [-1, 1]) cb(k, g, [0.9, sx > 0 ? 2.4 : 3.1, 0.6], [sx * 2.4, top + (sx > 0 ? 1.2 : 1.55), zc - 1.1], 0x6e6a66, [0, 0, sx * 0.03], 0.08);
  },
};
