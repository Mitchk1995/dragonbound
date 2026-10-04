import * as THREE from 'three';
import { Cell, Fluid, Ground } from '../layout';
import type { StrandField } from '../strands';
import { CAVE_WALL_H, CLIFF_H, distToSeg, isRelief, LAWN_ROOT, SPLAT, sstep, type Grid } from './grid';

/**
 * Ground colour and splat painting: what each vertex of the grid is painted with (the blended colour,
 * the ground-type weights the shader blends between, and a colour per weight), shaded by the zone's
 * occlusion, edge fade and soot, then redrawn along roads and stream banks.
 */

/** What the cells touching each vertex add up to (sums over the up to four cells round it). */
export interface Tally {
  /** Blended colour per vertex (summed, then shaded and averaged by `shadeGround`). */
  col: Float32Array;
  /** Ground-type weights per vertex (four splat channels). */
  splat: Float32Array;
  /** Colour sums per splat channel (12 per vertex) and their weights (4 per vertex). */
  chan: Float32Array;
  chanN: Float32Array;
  /** The raw colour sums, before shading (AO, soot, tone) is folded in. */
  rawCol: Float32Array;
  /** Cells touching each vertex, how many of them are relief, their summed tops, and how many are fluid. */
  count: Float32Array;
  raisedN: Float32Array;
  raisedH: Float32Array;
  fluidN: Float32Array;
  /** True for a vertex standing wholly inside relief. */
  fullRelief(k: number): boolean;
}

const c = new THREE.Color(), c2 = new THREE.Color(), cliffC = new THREE.Color(), stoneC = new THREE.Color();

/** The rock colour pair of a theme (cliff shades, else the cave's or the open land's default). */
export function cliffShadesOf(theme: Grid['theme']) {
  return theme.cliff ?? (theme.wall === 'cave' ? [0x4e4238, 0x3e342c] : [0x7a6e62, 0x5e544a]);
}

export function tallyCells(g: Grid): Tally {
  const { layout, theme, w, h, nV, vi, at, noise } = g;
  const col = new Float32Array(nV * 3), splat = new Float32Array(nV * 4);
  // Colour per splat channel at each vertex (the average of the adjacent cells of that channel),
  // so the shader can sharpen the blend between ground types without smearing their colours.
  const chan = new Float32Array(nV * 12), chanN = new Float32Array(nV * 4);
  const count = new Float32Array(nV), raisedN = new Float32Array(nV), raisedH = new Float32Array(nV), fluidN = new Float32Array(nV);
  const cliffShades = cliffShadesOf(theme);

  for (let z = 0; z < h; z++) {
    for (let x = 0; x < w; x++) {
      const cell = at(x, z);
      if (cell === Cell.Void) continue;
      const i = z * w + x;
      const gr = layout.ground[i] as Ground;
      const shades = theme.ground[gr] ?? theme.ground[Ground.Dirt] ?? [0x6e6048, 0x5a5040];
      // Large-scale colour drift (per-cell randomness reads as pixels).
      c.setHex(shades[0]).lerp(c2.setHex(shades[1]), noise(x * 0.09, z * 0.09));
      const relief = isRelief(cell, theme);
      // (Relief marked as bare rock ground keeps rock on top too: the high rim, the outcrops.)
      const mesaTop = relief && cell === Cell.Cliff && theme.mesaTop !== undefined && gr !== Ground.Cave;
      if (mesaTop) {
        const top = theme.ground[theme.mesaTop!] ?? shades;
        c.setHex(top[0]).lerp(c2.setHex(top[1]), noise(x * 0.09, z * 0.09));
      } else if (relief) c.copy(cliffC.setHex(cliffShades[0]).lerp(c2.setHex(cliffShades[1]), noise(x * 0.21 + 50, z * 0.21)));
      // Under a grass carpet (lawn.ts) the ground is its dark root layer: gaps between blades read as depth.
      if (layout.lawn?.[i] && gr === Ground.Grass) c.multiplyScalar(LAWN_ROOT);
      const bed = layout.fluid[i] !== Fluid.None && cell !== Cell.Ground;
      // Under water the bed is dark silt/rock; in the drowned city it is the old paving, sunk.
      if (bed) c.multiplyScalar(theme.wall === 'ruin' ? 0.62 : 0.5);
      const ch = bed ? (theme.wall === 'ruin' ? 2 : 3) : mesaTop ? (theme.splat?.[theme.mesaTop!] ?? SPLAT[theme.mesaTop!] ?? 1) : relief ? 3 : (theme.splat?.[gr] ?? SPLAT[gr] ?? 0);
      const elev = relief ? (layout.elev[i] || (cell === Cell.Wall ? CAVE_WALL_H : CLIFF_H)) : 0;
      const fluid = layout.fluid[i] !== Fluid.None;
      // In the drowned city grass never covers the paving outright: it grows up between the old
      // stones (half the cell stays paving, so the height blend lets the stones stand through).
      const overgrown = theme.wall === 'ruin' && gr === Ground.Grass && !relief && !bed;
      const parts: [number, number, THREE.Color][] = overgrown
        ? [[ch, 0.5, c], [2, 0.5, stoneC.setHex(theme.ground[Ground.Stone]?.[0] ?? 0x6a7070).lerp(c2.setHex(theme.ground[Ground.Stone]?.[1] ?? 0x5a6060), noise(x * 0.09 + 13, z * 0.09))]]
        : [[ch, 1, c]];
      // A lawn's ground gives way to the paving beside it (the carpet's own edge is the lawn's
      // border), so no grass bleeds out over the stones.
      const splatW = layout.lawn?.[i] ? 0.35 : 1;
      for (const [xx, zz] of [[x, z], [x + 1, z], [x + 1, z + 1], [x, z + 1]]) {
        const k = vi(xx, zz);
        for (const [pc, wt, cc] of parts) {
          col[k * 3] += cc.r * wt;
          col[k * 3 + 1] += cc.g * wt;
          col[k * 3 + 2] += cc.b * wt;
          splat[k * 4 + pc] += wt * splatW;
          chan[k * 12 + pc * 3] += cc.r * wt;
          chan[k * 12 + pc * 3 + 1] += cc.g * wt;
          chan[k * 12 + pc * 3 + 2] += cc.b * wt;
          chanN[k * 4 + pc] += wt;
        }
        if (relief) {
          raisedN[k]++;
          // The rock's absolute top (its own ground plus its height), so a corner shared by rock
          // standing on different levels averages their real tops instead of stacking the lower
          // rock's height on the higher ground (which raised needles where crags met a cliff).
          raisedH[k] += elev + (layout.level ? layout.level[i] : 0);
        }
        if (fluid) fluidN[k]++;
        count[k]++;
      }
    }
  }
  const fullRelief = (k: number) => count[k] > 0 && raisedN[k] === count[k];
  return { col, splat, chan, chanN, rawCol: col.slice(), count, raisedN, raisedH, fluidN, fullRelief };
}

/**
 * Shade the blended colour: occlusion at the foot of cave walls, the fade where the land ends, soot
 * round burns and lava; then average each vertex's sum and lay a slow tone over it.
 */
export function shadeGround(g: Grid, t: Tally) {
  const { layout, theme, w, h, nV, vi, noise, distField } = g;
  const { col, count, raisedN, fluidN, fullRelief } = t;
  // Ambient occlusion in caves: floor darkens toward the foot of the walls.
  if ((theme.topShade ?? 1) < 1) {
    const near = distField((k) => raisedN[k] > 0);
    for (let k = 0; k < nV; k++) {
      if (fullRelief(k)) continue;
      const f = 0.68 + 0.32 * sstep(0, 3.5, near[k]);
      for (let j = 0; j < 3; j++) col[k * 3 + j] *= f;
    }
  }
  // Where the land ends (a zone wrapped in an organic outline of Void), it dims over its last few
  // cells, so the edge melts into the dusk instead of stopping on a cell-sized step.
  if (theme.edgeFade) {
    const voidV = new Uint8Array(nV);
    for (let i = 0; i < w * h; i++) if (layout.cells[i] === Cell.Void) {
      const x0 = i % w, z0 = (i - x0) / w;
      for (const [xx, zz] of [[x0, z0], [x0 + 1, z0], [x0 + 1, z0 + 1], [x0, z0 + 1]]) voidV[vi(xx, zz)] = 1;
    }
    const edge = distField((k) => voidV[k] === 1);
    for (let k = 0; k < nV; k++) {
      const f = 0.22 + 0.78 * sstep(0, 7, edge[k]);
      for (let j = 0; j < 3; j++) col[k * 3 + j] *= f;
    }
  }
  // Scorched floor: soot gradients around burn sources and along lava shores, darkening and greying
  // the rock with a faint warm cast right at the heat (soft, so it reads as a burn, not a blotch).
  if (layout.burns?.length || theme.lava) {
    // Lava shores: vertices on a corner of a lava cell.
    const lavaV = new Uint8Array(nV);
    if (theme.lava) for (let i = 0; i < w * h; i++) if (layout.fluid[i] === Fluid.Lava) {
      const x0 = i % w, z0 = (i - x0) / w;
      for (const [xx, zz] of [[x0, z0], [x0 + 1, z0], [x0 + 1, z0 + 1], [x0, z0 + 1]]) lavaV[vi(xx, zz)] = 1;
    }
    const lavaD = theme.lava ? distField((k) => lavaV[k] === 1) : null;
    const lavaShore = (k: number) => (lavaD ? 1 - sstep(0, 3.2, lavaD[k]) : 0);
    for (let z = 0; z <= h; z++) for (let x = 0; x <= w; x++) {
      const k = vi(x, z);
      if (fullRelief(k) || (count[k] && fluidN[k] === count[k])) continue;
      let burn = 0, heat = 0;
      for (const b of layout.burns ?? []) {
        const d = b.x2 === undefined ? Math.hypot(x - b.x, z - b.z) : distToSeg(x, z, b.x, b.z, b.x2, b.z2 ?? b.z);
        const tt = 1 - sstep(0, b.r, d);
        burn = Math.max(burn, Math.pow(tt, 1.5) * b.k);
        heat = Math.max(heat, (1 - sstep(0, b.r * 0.35, d)) * b.k);
      }
      burn = Math.max(burn, lavaShore(k) * 0.5);
      heat = Math.max(heat, lavaShore(k) * 0.6);
      if (!burn) continue;
      const r = col[k * 3], gg = col[k * 3 + 1], b = col[k * 3 + 2];
      const grey = (r * 0.3 + gg * 0.5 + b * 0.2) * 0.42;
      col[k * 3] = r + (grey * (1 + heat * 0.5) - r) * burn;
      col[k * 3 + 1] = gg + (grey * 0.9 - gg) * burn;
      col[k * 3 + 2] = b + (grey * 0.85 - b) * burn;
    }
  }
  for (let z = 0; z <= h; z++) for (let x = 0; x <= w; x++) {
    const k = vi(x, z);
    const n = count[k] || 1;
    // A third, slow tone on top of the per-ground colour pair (breaks up large floors).
    const tone = 0.86 + 0.14 * noise(x * 0.035 + 70, z * 0.035);
    for (let j = 0; j < 3; j++) col[k * 3 + j] = (col[k * 3 + j] / n) * tone;
  }
}

/**
 * Per-channel colours, shaded like the blended vertex colour (a channel absent at a vertex takes
 * the blended colour, so a sharpened blend never reaches for an undefined one).
 */
export function channelColours(g: Grid, t: Tally) {
  const { nV } = g;
  const { col, rawCol, chan, chanN, count } = t;
  const chanCol = [0, 1, 2, 3].map(() => new Float32Array(nV * 3));
  for (let k = 0; k < nV; k++) {
    const n = count[k] || 1;
    for (let j = 0; j < 3; j++) {
      const ratio = rawCol[k * 3 + j] > 1e-6 ? col[k * 3 + j] / (rawCol[k * 3 + j] / n) : 1;
      for (let ch = 0; ch < 4; ch++) {
        const m = chanN[k * 4 + ch];
        chanCol[ch][k * 3 + j] = m ? (chan[k * 12 + ch * 3 + j] / m) * ratio : col[k * 3 + j];
      }
    }
  }
  return chanCol;
}

/**
 * Roads drawn along their centre lines: each corner near a road takes the road's ground in
 * proportion to how far inside its edge it lies (a soft band either side of the true edge), so the
 * sharpened blend draws the edge as a smooth curve, not a staircase along the cells. The banks of
 * streams and pools are wet, dark earth down to the waterline.
 */
export function paintStrands(g: Grid, t: Tally, chanCol: Float32Array[], sf: StrandField) {
  const { layout, theme, w, h, vi, noise } = g;
  const { splat, chanN, count, raisedN, fluidN } = t;
  const groundCol = (gr: number, x: number, z: number) => {
    const sh = theme.ground[gr as Ground] ?? [0x6e6048, 0x5a5040];
    return c.setHex(sh[0]).lerp(c2.setHex(sh[1]), noise(x * 0.09, z * 0.09));
  };
  const GRASS = SPLAT[Ground.Grass], EARTH = SPLAT[Ground.Dirt];
  const setCh = (k: number, ch: number, col3: THREE.Color) => {
    chanCol[ch][k * 3] = col3.r;
    chanCol[ch][k * 3 + 1] = col3.g;
    chanCol[ch][k * 3 + 2] = col3.b;
  };
  /** Give channel `ch` the share `wt` of a corner's weight, the other channels the rest. */
  const share = (k: number, ch: number, wt: number, x: number, z: number) => {
    let tot = 0;
    for (let j = 0; j < 4; j++) tot += splat[k * 4 + j];
    if (tot <= 0) return;
    const others = tot - splat[k * 4 + ch], rest = (1 - wt) * tot;
    if (others > 1e-6) for (let j = 0; j < 4; j++) {
      if (j !== ch) splat[k * 4 + j] *= rest / others;
    }
    else if (ch !== GRASS) {
      splat[k * 4 + GRASS] = rest;
      setCh(k, GRASS, groundCol(Ground.Grass, x, z).multiplyScalar(layout.lawn ? LAWN_ROOT : 1));
    }
    splat[k * 4 + ch] = wt * tot;
  };
  for (let z = 0; z <= h; z++) for (let x = 0; x <= w; x++) {
    const k = vi(x, z);
    if (raisedN[k] || !count[k]) continue;
    const pd = sf.path[k];
    if (pd < 1.2 && sf.pathGround[k] >= 0) {
      const gr = sf.pathGround[k], ch = theme.splat?.[gr as Ground] ?? SPLAT[gr] ?? 0;
      if (!chanN[k * 4 + ch]) setCh(k, ch, groundCol(gr, x, z));
      share(k, ch, 1 - sstep(-0.3, 0.3, pd), x, z);
      continue;
    }
    const wd = sf.wet[k];
    if (wd < 1.3 && fluidN[k] < count[k]) {
      setCh(k, EARTH, c.setHex(0x5a5436).lerp(c2.setHex(0x6c6a44), sstep(0, 1.1, wd)));
      share(k, EARTH, 1 - sstep(0.2, 1.0, wd), x, z);
    }
  }
}
