import * as THREE from 'three';
import type { ZoneTheme } from '../data/zones';
import { applyGround, CAVE_TERRACE, GROUND_TIME } from '../render/surface';
import { noiseTexture } from '../render/textures';
import { planarReflection } from './water';
import { Cell, Fluid, Ground, type ZoneLayout } from './layout';
import { strandField } from './strands';
import { mulberry32 } from '../core/rng';
import { hash01 } from '../render/blocks';

/**
 * Terrain for a zone: one continuous height grid (vertices at cell corners) split into
 * - flat ground: everything walkable and its gentle shore slopes (never dissolved), and
 * - relief: cliffs, plateaus and cave rock rising out of the same grid (dissolves around the
 *   hero like trees do, so a cliff never hides them);
 * plus animated water/lava surfaces over Fluid cells. Raised terrain only ever rises on cells that
 * block movement. The walkable ground itself may sit at a level (layout.level: plateaus, ramps):
 * every height below is worked out relative to the local ground level and lifted onto it at the end,
 * so a zone without levels is unchanged, and units stand on the ground level (floorAt).
 */

/** Default relief height per blocking cell type (plateaus/walls can override via layout.elev). */
const CLIFF_H = 3.2;
const CAVE_WALL_H = 3.6;
/** Fluid beds sink below the surface; the surface sits at WATER_Y. */
const BED_Y = -1.0;
/** Highest a relief vertex below the first terrace may stand (cells with a corner above it are relief). */
const FLOOR_CAP = 0.6;
/** How far outdoor cliff faces are weathered back into the rock at most (bays, undercuts). */
const WEATHER = 1.6;
/** How far a gully cuts back into an outdoor face beyond the weathering. */
const GULLY = 1.3;
export const WATER_Y = -0.28;
/** Brightness of the ground under a lawn (its root layer). */
const LAWN_ROOT = 0.5;

const SPLAT: Record<number, number> = {
  [Ground.Dirt]: 0, [Ground.Path]: 0, [Ground.Camp]: 0, [Ground.Grass]: 1,
  [Ground.Arena]: 2, [Ground.Stone]: 2, [Ground.Cave]: 3, [Ground.Scorch]: 3,
};

function distToSeg(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax, dz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(px - ax - dx * t, pz - az - dz * t);
}

/** Smooth 2D value noise in 0..1 (bilinear-smoothstep over a hashed lattice). */
export function smoothNoise(seed: number) {
  const hash = (x: number, z: number) => {
    let hh = (x * 374761393 + z * 668265263 + seed * 2246822519) | 0;
    hh = Math.imul(hh ^ (hh >>> 13), 1274126177);
    return ((hh ^ (hh >>> 16)) >>> 0) / 4294967296;
  };
  const sm = (t: number) => t * t * (3 - 2 * t);
  return (x: number, z: number) => {
    const x0 = Math.floor(x), z0 = Math.floor(z);
    const fx = sm(x - x0), fz = sm(z - z0);
    const a = hash(x0, z0), b = hash(x0 + 1, z0), c = hash(x0, z0 + 1), d = hash(x0 + 1, z0 + 1);
    return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
  };
}

/**
 * The bedding planes outdoor relief is cut on: a stack of planes at irregular spacing (mostly tall
 * beds, now and then a thin one), dipping slowly across the land and thickening and thinning from
 * place to place, so no two cliffs step the same way and the ledges along one face wander up and down
 * like real strata. `q` maps a height at a point into the stack ("stratum space"), `index` names the
 * bed a stratum value falls in, `plane` is the height of bed k's floor at a point, and `bandY` is
 * the height of bed k's ledge where the ground is `f` and the raw rock `r` (beds at the ground hug it,
 * at most FLOOR_CAP above, so the rock meets the floor mesh exactly).
 */
export function bedding(seed: number) {
  const n = smoothNoise(seed + 401);
  const rng = mulberry32(seed * 31 + 402);
  const L: number[] = [];
  // Mostly tall beds (two to six high), now and then a thin one, so a face reads as a few big masses
  // rather than a stack of equal slabs.
  for (let y = -12; y < 90; y += rng() < 0.15 ? 0.9 + rng() * 0.5 : 2.4 + rng() * 3.4) L.push(y);
  // The beds dip and roll across the land (up to about 20 degrees), so ledges run slantwise across a
  // face and climb or drop along it, never level the full width.
  // A second, shorter swell (a few metres over a dozen cells) ends each ledge after a short run and
  // sets the next one higher or lower, so no line runs the full width of a face.
  const tilt = (x: number, z: number) => (n(x * 0.035, z * 0.035) - 0.5) * 9 + (n(x * 0.085 + 31, z * 0.085) - 0.5) * 4.6 + (n(x * 0.2 + 17, z * 0.2 + 5) - 0.5) * 0.9;
  const dens = (x: number, z: number) => 0.8 + 0.45 * n(x * 0.045 + 57, z * 0.045 + 13);
  const q = (y: number, x: number, z: number) => (y + tilt(x, z)) * dens(x, z);
  const index = (s: number) => {
    let lo = 0, hi = L.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (L[mid] <= s) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };
  const plane = (k: number, x: number, z: number) => L[k] / dens(x, z) - tilt(x, z);
  const groundIndex = (x: number, z: number, f: number) => index(q(f + FLOOR_CAP, x, z));
  const bandY = (k: number, x: number, z: number, f: number, r: number) => (k <= groundIndex(x, z, f) ? f + Math.min(r - f, FLOOR_CAP) : plane(k, x, z));
  return { L, q, index, plane, groundIndex, bandY };
}

export interface Terrain {
  meshes: THREE.Mesh[];
  /** The relief mesh (cliffs/cave rock), if any: callers make it occludable. */
  relief: THREE.Mesh | null;
  /** Terrain height at a world point (bilinear over the vertex grid). */
  heightAt(x: number, z: number): number;
  /** Height of the walkable ground level at a world point (where units stand). */
  floorAt(x: number, z: number): number;
  /** Animated surfaces to tick each frame. */
  tick(t: number): void;
  /** The height of a flat ledge of outdoor rock at a point (on one bed out to `r`), else null. */
  ledge(x: number, z: number, r?: number): number | null;
  /** Where a point on outdoor rock at height y is drawn once the cliff is weathered (x, z). */
  warp(x: number, y: number, z: number): [number, number];
}

/** True for cells whose terrain rises (they block movement anyway). */
export function isRelief(cell: number, theme: ZoneTheme) {
  return cell === Cell.Cliff || (cell === Cell.Wall && theme.wall === 'cave');
}

export function buildTerrain(layout: ZoneLayout, theme: ZoneTheme, seed: number): Terrain {
  const { w, h } = layout;
  const VW = w + 1;
  const vi = (x: number, z: number) => z * VW + x;
  const at = (x: number, z: number) => (x < 0 || z < 0 || x >= w || z >= h ? Cell.Void : layout.cells[z * w + x]);
  const noise = smoothNoise(seed + 3);
  const nV = VW * (h + 1);
  const pos = new Float32Array(nV * 3), col = new Float32Array(nV * 3), splat = new Float32Array(nV * 4);
  // Colour per splat channel at each vertex (the average of the adjacent cells of that channel),
  // so the shader can sharpen the blend between ground types without smearing their colours.
  const chan = new Float32Array(nV * 12), chanN = new Float32Array(nV * 4);
  const count = new Float32Array(nV), raisedN = new Float32Array(nV), raisedH = new Float32Array(nV), fluidN = new Float32Array(nV);
  const c = new THREE.Color(), c2 = new THREE.Color(), cliffC = new THREE.Color(), stoneC = new THREE.Color();
  const cliffShades = theme.cliff ?? (theme.wall === 'cave' ? [0x4e4238, 0x3e342c] : [0x7a6e62, 0x5e544a]);

  for (let z = 0; z < h; z++) {
    for (let x = 0; x < w; x++) {
      const cell = at(x, z);
      if (cell === Cell.Void) continue;
      const i = z * w + x;
      const g = layout.ground[i] as Ground;
      const shades = theme.ground[g] ?? theme.ground[Ground.Dirt] ?? [0x6e6048, 0x5a5040];
      // Large-scale colour drift (per-cell randomness reads as pixels).
      c.setHex(shades[0]).lerp(c2.setHex(shades[1]), noise(x * 0.09, z * 0.09));
      const relief = isRelief(cell, theme);
      // (Relief marked as bare rock ground keeps rock on top too: the high rim, the outcrops.)
      const mesaTop = relief && cell === Cell.Cliff && theme.mesaTop !== undefined && g !== Ground.Cave;
      if (mesaTop) {
        const top = theme.ground[theme.mesaTop!] ?? shades;
        c.setHex(top[0]).lerp(c2.setHex(top[1]), noise(x * 0.09, z * 0.09));
      } else if (relief) c.copy(cliffC.setHex(cliffShades[0]).lerp(c2.setHex(cliffShades[1]), noise(x * 0.21 + 50, z * 0.21)));
      // Under a grass carpet (lawn.ts) the ground is its dark root layer: gaps between blades read as depth.
      if (layout.lawn?.[i] && g === Ground.Grass) c.multiplyScalar(LAWN_ROOT);
      const bed = layout.fluid[i] !== Fluid.None && cell !== Cell.Ground;
      // Under water the bed is dark silt/rock; in the drowned city it is the old paving, sunk.
      if (bed) c.multiplyScalar(theme.wall === 'ruin' ? 0.62 : 0.5);
      const ch = bed ? (theme.wall === 'ruin' ? 2 : 3) : mesaTop ? (theme.splat?.[theme.mesaTop!] ?? SPLAT[theme.mesaTop!] ?? 1) : relief ? 3 : (theme.splat?.[g] ?? SPLAT[g] ?? 0);
      const elev = relief ? (layout.elev[i] || (cell === Cell.Wall ? CAVE_WALL_H : CLIFF_H)) : 0;
      const fluid = layout.fluid[i] !== Fluid.None;
      // In the drowned city grass never covers the paving outright: it grows up between the old
      // stones (half the cell stays paving, so the height blend lets the stones stand through).
      const overgrown = theme.wall === 'ruin' && g === Ground.Grass && !relief && !bed;
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
  // The raw colour sums, before shading (AO, soot, tone) is folded in: the per-channel colours
  // take the same shading as a ratio at the end.
  const rawCol = col.slice();
  // Ground level at each vertex: the highest walkable cell touching it (so a plateau's edge stays on
  // the plateau and the cliff below rises from the lower ground), else the lowest cell touching it
  // (rock all round: it rises from its lowest foot to the average of its tops).
  const base = new Float32Array(nV);
  if (layout.level) {
    const lv = layout.level;
    for (let z = 0; z <= h; z++) for (let x = 0; x <= w; x++) {
      let walk = -Infinity, any = -Infinity, low = Infinity;
      for (const [cx, cz] of [[x - 1, z - 1], [x, z - 1], [x - 1, z], [x, z]]) {
        const cell = at(cx, cz);
        if (cell === Cell.Void) continue;
        const v = lv[cz * w + cx];
        any = Math.max(any, v);
        low = Math.min(low, v);
        if (!isRelief(cell, theme)) walk = Math.max(walk, v);
      }
      base[vi(x, z)] = walk > -Infinity ? walk : any > -Infinity ? low : 0;
    }
  }
  /** Distance from a grid vertex to the nearest dry (non-fluid, non-void) cell, searched out to 5. */
  const distToLand = (vx: number, vz: number) => {
    let best = 5;
    for (let z = Math.max(0, vz - 5); z < Math.min(h, vz + 5); z++) {
      for (let x = Math.max(0, vx - 5); x < Math.min(w, vx + 5); x++) {
        const i = z * w + x;
        if (layout.fluid[i] || layout.cells[i] === Cell.Void) continue;
        const dx = Math.max(x - vx, 0, vx - (x + 1)), dz = Math.max(z - vz, 0, vz - (z + 1));
        best = Math.min(best, Math.hypot(dx, dz));
      }
    }
    return best;
  };
  const fullRelief = (k: number) => count[k] > 0 && raisedN[k] === count[k];
  /** Chamfer distance (in vertices) from every vertex to the nearest seed vertex. */
  const distField = (seed: (k: number) => boolean) => {
    const d = new Float32Array(nV).fill(1e6);
    for (let k = 0; k < nV; k++) if (seed(k)) d[k] = 0;
    const relax = (k: number, j: number, c: number) => {
      if (d[j] + c < d[k]) d[k] = d[j] + c;
    };
    for (let z = 0; z <= h; z++) for (let x = 0; x <= w; x++) {
      const k = vi(x, z);
      if (x > 0) relax(k, k - 1, 1);
      if (z > 0) {
        relax(k, k - VW, 1);
        if (x > 0) relax(k, k - VW - 1, 1.414);
        if (x < w) relax(k, k - VW + 1, 1.414);
      }
    }
    for (let z = h; z >= 0; z--) for (let x = w; x >= 0; x--) {
      const k = vi(x, z);
      if (x < w) relax(k, k + 1, 1);
      if (z < h) {
        relax(k, k + VW, 1);
        if (x < w) relax(k, k + VW + 1, 1.414);
        if (x > 0) relax(k, k + VW - 1, 1.414);
      }
    }
    return d;
  };
  const sstep = (a: number, b: number, v: number) => {
    const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  // Cave walls climb away from the floor into darkness instead of stopping at one flat plateau.
  // Walls on the camera side (+z) of open floor stay low, so they never hide the cavern.
  const rise = new Float32Array(nV);
  if (theme.wallRise) {
    const open = distField((k) => !fullRelief(k));
    for (let z = 0; z <= h; z++) for (let x = 0; x <= w; x++) {
      const k = vi(x, z);
      if (!open[k]) continue;
      let north = Infinity;
      for (let s2 = 1; s2 <= 10 && z - s2 >= 0; s2++) if (open[vi(x, z - s2)] === 0) {
        north = s2;
        break;
      }
      const want = theme.wallRise * sstep(0.6, 4.5, open[k]) * (0.7 + noise(x * 0.23 + 5, z * 0.23) * 0.6);
      rise[k] = Math.min(want, Math.max(0, north - 1.5) * 1.1);
    }
  }
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
        const t = 1 - sstep(0, b.r, d);
        burn = Math.max(burn, Math.pow(t, 1.5) * b.k);
        heat = Math.max(heat, (1 - sstep(0, b.r * 0.35, d)) * b.k);
      }
      burn = Math.max(burn, lavaShore(k) * 0.5);
      heat = Math.max(heat, lavaShore(k) * 0.6);
      if (!burn) continue;
      const r = col[k * 3], g = col[k * 3 + 1], b = col[k * 3 + 2];
      const grey = (r * 0.3 + g * 0.5 + b * 0.2) * 0.42;
      col[k * 3] = r + (grey * (1 + heat * 0.5) - r) * burn;
      col[k * 3 + 1] = g + (grey * 0.9 - g) * burn;
      col[k * 3 + 2] = b + (grey * 0.85 - b) * burn;
    }
  }
  const hgt = new Float32Array(nV);
  const beds = bedding(seed);
  // Cave rock: raw (unterraced) heights, and the terrace profile: wide flat ledges, short risers.
  const raw = new Float32Array(nV);
  // The same hard steps the relief mesh is cut into (below the first ledge the rock stays at most
  // FLOOR_CAP high, so a vertex the floor mesh shares is never lifted off it).
  const terrace = (y: number) => (y < CAVE_TERRACE ? Math.min(y, FLOOR_CAP) : Math.floor(y / CAVE_TERRACE) * CAVE_TERRACE);
  for (let z = 0; z <= h; z++) {
    for (let x = 0; x <= w; x++) {
      const k = vi(x, z);
      const n = count[k] || 1;
      // A third, slow tone on top of the per-ground colour pair (breaks up large floors).
      const tone = 0.86 + 0.14 * noise(x * 0.035 + 70, z * 0.035);
      for (let j = 0; j < 3; j++) col[k * 3 + j] = (col[k * 3 + j] / n) * tone;
      let y = (noise(x * 0.15, z * 0.15) - 0.5) * 0.06 + (noise(x * 0.5 + 40, z * 0.5) - 0.5) * 0.03;
      if (fullRelief(k)) {
        // Fully inside relief: rugged top (noise breaks up the flat mesa look).
        const top = raisedH[k] / raisedN[k] - base[k];
        if (theme.wallRise) {
          // Cave rock: one continuous mass climbing in broad terraces (wide ledges, short steep
          // risers) whose edges wander slowly, so the walls read as layered strata in a single
          // body of rock. Only slow noise: fine per-vertex noise made the tops lumpy.
          y = top * (0.9 + noise(x * 0.18 + 9, z * 0.18) * 0.2) + (noise(x * 0.16 + 20, z * 0.16) - 0.5) * 3.0 + (noise(x * 0.4 + 40, z * 0.4) - 0.5) * 0.5 + rise[k];
          // Narrow risers (steep, short faces) between wide flat ledges: with the faceted shading
          // below, each terrace reads as a slab with a crisp lip, like the stacked slabs at the foot.
          // (The cave relief mesh is rebuilt finer below from the raw height; the grid keeps the
          // terraced value for height queries.)
          raw[k] = y;
          y = terrace(y);
        } else {
          // Cliffs and rims outdoors: slow noise only, then cut on the natural bedding planes
          // (strata below), so no zone has smooth, lumpy slopes or big diagonal facets.
          y = top * (0.86 + noise(x * 0.2 + 9, z * 0.2) * 0.28) + (noise(x * 0.16 + 20, z * 0.16) - 0.5) * 1.2 + rise[k];
          raw[k] = y;
          const b0 = base[k];
          y = beds.bandY(beds.index(beds.q(b0 + y, x, z)), x, z, b0, b0 + y) - b0;
        }
      } else if (count[k] && fluidN[k] === count[k]) {
        // Under water: a long shallow shelf that deepens toward the middle, with noise shoals, so
        // the lighter shallows show. Lava keeps a steep bank (it is opaque; depth drives its crust).
        const dLand = distToLand(x, z);
        const lava = layout.fluid[Math.min(h - 1, z) * w + Math.min(w - 1, x)] === Fluid.Lava;
        const shoal = lava ? 0 : (noise(x * 0.12 + 31, z * 0.12) - 0.5) * 0.5;
        y = Math.max(BED_Y, Math.min(WATER_Y - 0.16, WATER_Y - 0.1 - dLand * (lava ? 0.32 : 0.13) + shoal)) + (noise(x * 0.4, z * 0.4) - 0.5) * 0.12;
      } else if (fluidN[k] > 0) {
        // Waterline: some shore corners just above the surface, some just below, so the visible
        // edge (where the bank meets the water) wanders instead of following the cell grid.
        y = WATER_Y + (noise(x * 0.7 + 17, z * 0.7) - 0.5) * 0.36;
      }
      hgt[k] = y;
      pos[k * 3] = x;
      pos[k * 3 + 1] = y;
      pos[k * 3 + 2] = z;
    }
  }

  // Round off the shoreline: relax heights around the waterline a few times so the bank/water
  // intersection curves instead of stepping along cell edges. Only near fluid, never relief.
  const shore = new Uint8Array(nV);
  for (let z = 0; z <= h; z++) for (let x = 0; x <= w; x++) {
    const k = vi(x, z);
    if (fluidN[k] > 0 && raisedN[k] === 0) for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, zz = z + dz;
      if (xx >= 0 && zz >= 0 && xx <= w && zz <= h && raisedN[vi(xx, zz)] === 0) shore[vi(xx, zz)] = 1;
    }
  }
  for (let pass = 0; pass < 3; pass++) {
    const next = hgt.slice();
    for (let z = 1; z < h; z++) for (let x = 1; x < w; x++) {
      const k = vi(x, z);
      if (!shore[k]) continue;
      next[k] = hgt[k] * 0.4 + (hgt[vi(x - 1, z)] + hgt[vi(x + 1, z)] + hgt[vi(x, z - 1)] + hgt[vi(x, z + 1)]) * 0.15;
    }
    hgt.set(next);
  }
  // Streams and pools drawn along their true outlines (strands.ts): every corner inside the
  // waterline sinks into a bed that deepens toward the middle (a pool is a dished hollow), and the
  // banks rise out of the water in an even slope instead of the cell grid's steps.
  const sf = layout.lawn ? strandField(layout) : null;
  if (sf) for (let k = 0; k < nV; k++) {
    if (raisedN[k]) continue;
    const d = sf.wet[k];
    if (d < 0) hgt[k] = Math.min(hgt[k], WATER_Y - 0.12 - 0.7 * sf.deep[k]);
    else if (d < 1.4 && fluidN[k] < count[k]) hgt[k] = WATER_Y + 0.05 + d * 0.2;
  }
  for (let k = 0; k < nV; k++) pos[k * 3 + 1] = base[k] + hgt[k];
  // Per-channel colours, shaded like the blended vertex colour (a channel absent at a vertex takes
  // the blended colour, so a sharpened blend never reaches for an undefined one).
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

  // Roads drawn along their centre lines: each corner near a road takes the road's ground in
  // proportion to how far inside its edge it lies (a soft band either side of the true edge), so the
  // sharpened blend draws the edge as a smooth curve, not a staircase along the cells. The banks of
  // streams and pools are wet, dark earth down to the waterline.
  if (sf) {
    const groundCol = (g: number, x: number, z: number) => {
      const sh = theme.ground[g as Ground] ?? [0x6e6048, 0x5a5040];
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
        const g = sf.pathGround[k], ch = theme.splat?.[g as Ground] ?? SPLAT[g] ?? 0;
        if (!chanN[k * 4 + ch]) setCh(k, ch, groundCol(g, x, z));
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
  const flat: number[] = [], rough: number[] = [], caveCells: number[] = [];
  for (let z = 0; z < h; z++) {
    for (let x = 0; x < w; x++) {
      if (at(x, z) === Cell.Void) continue;
      const a = vi(x, z), b = vi(x + 1, z), cc = vi(x + 1, z + 1), d = vi(x, z + 1);
      const tris = (x + z) & 1 ? [a, d, b, b, d, cc] : [a, d, cc, a, cc, b];
      // Cave rock is rebuilt finer (caveRelief below): its cells leave the grid mesh entirely.
      if ([a, b, cc, d].some((v) => hgt[v] > FLOOR_CAP)) {
        caveCells.push(x, z);
        continue;
      }
      // A triangle is relief if any corner is raised (so cliff faces dissolve as one piece).
      for (let t = 0; t < 6; t += 3) {
        const tri = tris.slice(t, t + 3);
        (tri.some((v) => hgt[v] > FLOOR_CAP) ? rough : flat).push(...tri);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aSplat', new THREE.BufferAttribute(splat, 4));
  chanCol.forEach((a, ch) => geo.setAttribute(`aCol${ch}`, new THREE.BufferAttribute(a, 3)));
  geo.setIndex([...flat, ...rough]);
  geo.computeVertexNormals();
  const wet = layout.fluid.some((f) => f === Fluid.Water);
  const gridAt = (grid: Float32Array, x: number, z: number) => {
    const x0 = Math.max(0, Math.min(w - 1, Math.floor(x))), z0 = Math.max(0, Math.min(h - 1, Math.floor(z)));
    const fx = Math.max(0, Math.min(1, x - x0)), fz = Math.max(0, Math.min(1, z - z0));
    const a = grid[vi(x0, z0)], b = grid[vi(x0 + 1, z0)], cc = grid[vi(x0, z0 + 1)], d = grid[vi(x0 + 1, z0 + 1)];
    return a + (b - a) * fx + (cc - a) * fz + (a - b - cc + d) * fx * fz;
  };
  // ─── Weathering outdoor rock ────────────────────────────────────────────────
  // The raw rock height everywhere (absolute), and its uphill direction, smoothed over a few cells
  // so it turns gently round spurs and bays (it says which way "into the rock" is).
  const rockH = new Float32Array(nV), upX = new Float32Array(nV), upZ = new Float32Array(nV);
  for (let k = 0; k < nV; k++) rockH[k] = base[k] + (fullRelief(k) ? raw[k] : hgt[k]);
  if (!theme.wallRise) {
    for (let z = 0; z <= h; z++) for (let x = 0; x <= w; x++) {
      const xa = Math.max(0, x - 1), xb = Math.min(w, x + 1), za = Math.max(0, z - 1), zb = Math.min(h, z + 1);
      upX[vi(x, z)] = (rockH[vi(xb, z)] - rockH[vi(xa, z)]) / (xb - xa);
      upZ[vi(x, z)] = (rockH[vi(x, zb)] - rockH[vi(x, za)]) / (zb - za);
    }
    for (let pass = 0; pass < 3; pass++) for (const g of [upX, upZ]) {
      const src = g.slice();
      for (let z = 1; z < h; z++) for (let x = 1; x < w; x++) {
        let s = 0;
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) s += src[vi(x + dx, z + dz)];
        g[vi(x, z)] = s / 9;
      }
    }
  }
  // The highest walkable ground within two cells of each vertex (where a cliff's lip meets a road
  // or a terrace above it).
  const floorNear = new Float32Array(nV).fill(-1e6);
  for (let z = 0; z <= h; z++) for (let x = 0; x <= w; x++) {
    let m = -1e6;
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      const xx = x + dx, zz = z + dz;
      if (xx < 0 || zz < 0 || xx > w || zz > h) continue;
      const kk = vi(xx, zz);
      if (count[kk] > raisedN[kk]) m = Math.max(m, base[kk]);
    }
    floorNear[vi(x, z)] = m;
  }
  // The highest rock within three cells of each vertex (a ledge well below it is partway down a face).
  const topNear = new Float32Array(nV);
  for (let z = 0; z <= h; z++) for (let x = 0; x <= w; x++) {
    let m = -1e6;
    for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
      const xx = x + dx, zz = z + dz;
      if (xx >= 0 && zz >= 0 && xx <= w && zz <= h) m = Math.max(m, rockH[vi(xx, zz)]);
    }
    topNear[vi(x, z)] = m;
  }
  // Rock along the land's edge stays put: its open side meets the island's underside there.
  const edgeKeep = new Float32Array(nV).fill(1);
  if (!theme.wallRise) {
    const voidD = distField((k) => count[k] < 4);
    for (let k = 0; k < nV; k++) edgeKeep[k] = sstep(0.5, 2.5, voidD[k]);
  }
  // ─── The island's side ───────────────────────────────────────────────────────
  // Where land ends at the void (a floating island), a sheer skirt of rock drops from the very edge
  // of the ground or the cliff top, so the land is a closed mass: no gap ever opens between a raised
  // edge and the rocky underside below it (the sky would show through the rock).
  const skirtOn = theme.ambient === 'void';
  const SK = { P: [] as number[], N: [] as number[], C: [] as number[], A: [] as number[] };
  const skn = new THREE.Vector3(), ska = new THREE.Vector3(), skb = new THREE.Vector3();
  /** One quad of the skirt from the edge a..b (tops ya, yb) down to `bottom`, facing (nx, nz). */
  const skirtQuad = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, bottom: number, nx: number, nz: number, ca: number[], cb2: number[]) => {
    const quad = [[ax, ay, az, ca], [bx, by, bz, cb2], [bx, bottom, bz, cb2], [ax, bottom, az, ca]] as [number, number, number, number[]][];
    for (const t of [[0, 1, 2], [0, 2, 3]]) {
      let [i0, i1, i2] = t;
      ska.set(quad[i1][0] - quad[i0][0], quad[i1][1] - quad[i0][1], quad[i1][2] - quad[i0][2]);
      skb.set(quad[i2][0] - quad[i0][0], quad[i2][1] - quad[i0][1], quad[i2][2] - quad[i0][2]);
      skn.crossVectors(ska, skb);
      if (skn.lengthSq() < 1e-10) continue;
      if (skn.x * nx + skn.z * nz < 0) [i1, i2] = [i2, i1];
      for (const i of [i0, i1, i2]) {
        SK.P.push(quad[i][0], quad[i][1], quad[i][2]);
        SK.N.push(nx, 0, nz);
        SK.C.push(...quad[i][3]);
        SK.A.push(0, 0, 0, 1);
      }
    }
  };
  /** Which way an edge on the line x = X (or z = Z) at `m` along it looks out over the void, if it does. */
  const voidSide = (alongZ: boolean, line: number, m: number): number => {
    const c = Math.floor(m);
    const lo = alongZ ? at(line - 1, c) : at(c, line - 1), hi = alongZ ? at(line, c) : at(c, line);
    if (lo === Cell.Void && hi !== Cell.Void) return -1;
    if (hi === Cell.Void && lo !== Cell.Void) return 1;
    return 0;
  };
  const SKIRT_DEPTH = 6;
  const sculpt = smoothNoise(seed + 501);
  /**
   * Where a point of outdoor rock moves to (x, z) once weathered: pushed back into the rock along
   * its uphill direction by up to WEATHER, less where the cliff stands out as a buttress, more in the
   * bays between, and varying with height (so a bed leans out over the one below, or is cut back
   * under the one above). Nothing moves within FLOOR_CAP of the ground, so the foot stays on its cell
   * edge and the floor mesh still meets it exactly. A smooth field: shared edges stay shut.
   */
  const warp = (x: number, y: number, z: number): [number, number] => {
    if (theme.wallRise) return [x, z];
    // The rock's own top stays put where it meets the ground above it (a road, a terrace, the crown),
    // so the lip runs on flush under whatever stands there and the face falls back below it.
    const top = gridAt(floorNear, x, z), lip = 1 - sstep(top - 2.6, top - 0.6, y);
    const ramp = sstep(FLOOR_CAP + 0.1, 2.4, y - gridAt(base, x, z)) * gridAt(edgeKeep, x, z) * lip;
    if (ramp <= 0) return [x, z];
    const gx = gridAt(upX, x, z), gz = gridAt(upZ, x, z), gl = Math.hypot(gx, gz);
    const wgt = sstep(0.2, 1.0, gl);
    if (wgt <= 0) return [x, z];
    const mass = sstep(0.4, 0.6, sculpt(x * 0.19 + 5, z * 0.19 + 9));
    const bed = sculpt(x * 0.3 + y * 0.45 + 3, z * 0.3 - y * 0.3 + 11);
    // Gullies: narrow, deep clefts cut back into the face from top to foot along the crests of a
    // ridged noise, so the beds are broken into separate buttresses (the same at every height).
    const gn = sculpt(x * 0.075 + 41, z * 0.075 + 23), gully = sstep(0.6, 0.93, 1 - Math.abs(gn * 2 - 1));
    // (Lush, mossy rock is only lightly cut back: the rock masses standing out of it shape the face,
    // and its lip never hangs out as a dark overhang over a face cut deep beneath it.)
    const cut = theme.rockMoss ? 0.35 : 1;
    const d = (cut * ramp * wgt * (WEATHER * (0.62 * (1 - mass) + 0.38 * bed) + GULLY * gully)) / gl;
    return [x + gx * d, z + gz * d];
  };
  /**
   * The height of the outdoor rock's ledge at (x, z) when the point and the ground round it (out to
   * `r`) lie on one bed above the local ground (a flat place for a plant to root), else null.
   */
  const ledge = (x: number, z: number, r = 0.6): number | null => {
    if (theme.wallRise) return null;
    let k = -1;
    for (const [dx, dz] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) {
      const px = x + dx, pz = z + dz;
      if (px < 0 || pz < 0 || px > w || pz > h) return null;
      const f = gridAt(base, px, pz), kk = beds.index(beds.q(gridAt(rockH, px, pz), px, pz));
      if (kk <= beds.groundIndex(px, pz, f) || (k >= 0 && kk !== k)) return null;
      k = kk;
    }
    return beds.plane(k, x, z);
  };
  /**
   * Relief rock (cave walls, cliffs, rims), rebuilt at twice the grid's resolution from the raw
   * heights and cut into true beds: every triangle of the fine grid is sliced by the bedding planes,
   * each band between two planes lies on its floor plane, and a sheer face stands along every cut
   * from the bed below up to it. So whichever way a wall faces it is built of flat-topped beds with
   * steep faces and crisp lips, never a smooth slope. Cave walls (wallRise) keep evenly spaced level
   * terraces, read as one layered mass climbing into the dark. Outdoor cliffs are cut on the natural
   * bedding (`bedding`: tall beds and thin ones, dipping and wandering) and then weathered: the faces
   * are pushed back into the rock by different amounts along the cliff and up it (`warp`), so they
   * stand out as buttresses and fall back into bays, lean out into overhangs and back under ledges.
   * Each bed takes its own tone. A cell lying wholly on one ledge is a single quad. Edges shared with
   * the floor mesh stay exactly on it (no cracks).
   */
  function caveRelief() {
    const S = 2, band = [1.16, 0.82, 1.04, 0.88], tones = [1.07, 0.93, 1.0, 0.96, 1.04, 0.9, 1.02];
    const natural = !theme.wallRise;
    const P: number[] = [], C: number[] = [], A: number[] = [], N: number[] = [];
    const src = (k: number) => base[k] + (fullRelief(k) ? raw[k] : hgt[k]);
    // r: absolute height; f: the ground level under the point; s: the height in stratum space.
    type V = { x: number; z: number; r: number; f: number; s: number; c: number[]; a: number[] };
    const sOf = (r: number, x: number, z: number) => (natural ? beds.q(r, x, z) : r);
    const level = (k: number) => (natural ? beds.L[k] : k * CAVE_TERRACE);
    const indexOf = (s: number) => (natural ? beds.index(s) : Math.max(0, Math.floor(s / CAVE_TERRACE)));
    const groundOf = (v: V) => (natural ? beds.groundIndex(v.x, v.z, v.f) : Math.floor(v.f / CAVE_TERRACE + 1e-6));
    const sample = (x: number, z: number, u: number, v: number): V => {
      const k00 = vi(x, z), k10 = vi(x + 1, z), k01 = vi(x, z + 1), k11 = vi(x + 1, z + 1);
      const w00 = (1 - u) * (1 - v), w10 = u * (1 - v), w01 = (1 - u) * v, w11 = u * v;
      const bil = (arr: ArrayLike<number>, n: number, j: number) => arr[k00 * n + j] * w00 + arr[k10 * n + j] * w10 + arr[k01 * n + j] * w01 + arr[k11 * n + j] * w11;
      const r = src(k00) * w00 + src(k10) * w10 + src(k01) * w01 + src(k11) * w11;
      const f = base[k00] * w00 + base[k10] * w10 + base[k01] * w01 + base[k11] * w11;
      // (No nudge off the grid: the cut lines follow the noise in the heights, never the rows.)
      return { x: x + u, z: z + v, r, f, s: sOf(r, x + u, z + v), c: [bil(col, 3, 0), bil(col, 3, 1), bil(col, 3, 2)], a: [bil(splat, 4, 0), bil(splat, 4, 1), bil(splat, 4, 2), bil(splat, 4, 3)] };
    };
    const lerpV = (p: V, q: V, t: number): V => ({
      x: p.x + (q.x - p.x) * t, z: p.z + (q.z - p.z) * t, r: p.r + (q.r - p.r) * t, f: p.f + (q.f - p.f) * t, s: p.s + (q.s - p.s) * t,
      c: p.c.map((v, j) => v + (q.c[j] - v) * t),
      a: p.a.map((v, j) => v + (q.a[j] - v) * t),
    });
    /** Clip a convex polygon to s >= lv (keep = 1) or s < lv (keep = -1). */
    const clip = (poly: V[], lv: number, keep: 1 | -1) => {
      const out: V[] = [];
      for (let i = 0; i < poly.length; i++) {
        const p = poly[i], q = poly[(i + 1) % poly.length];
        const pin = keep > 0 ? p.s >= lv : p.s < lv, qin = keep > 0 ? q.s >= lv : q.s < lv;
        if (pin) out.push(p);
        if (pin !== qin) out.push(lerpV(p, q, (lv - p.s) / (q.s - p.s)));
      }
      return out;
    };
    /** Tone of bed `k` at a point (cave terraces alternate light and dark; outdoor beds each take their own). */
    const tone = (k: number, x: number, z: number) => {
      if (k <= 0) return 1;
      if (natural) return tones[Math.floor(hash01(k * 7.13, 3.7) * tones.length)] * (0.95 + noise(x * 0.3 + 60, z * 0.3) * 0.1);
      const b = k + Math.floor((noise(x * 0.05 + 3, z * 0.05) - 0.5) * 0.6 + 0.5);
      return band[((b % 4) + 4) % 4] * (0.95 + noise(x * 0.3 + 60, z * 0.3) * 0.1);
    };
    const ea = new THREE.Vector3(), eb = new THREE.Vector3(), fn = new THREE.Vector3();
    /** One triangle, wound to face `want`; its normal its own face's, or `nrm` (a weathered lip's: see slice). */
    const tri = (p: number[][], c: number[][], a: number[][], want: number[], nrm?: number[]) => {
      ea.set(p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]);
      eb.set(p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]);
      fn.crossVectors(ea, eb);
      const len = fn.length();
      if (len < 1e-7) return;
      let order = [0, 1, 2];
      if (fn.x * want[0] + fn.y * want[1] + fn.z * want[2] < 0) {
        order = [0, 2, 1];
        fn.negate();
      }
      fn.divideScalar(len);
      if (nrm) fn.set(nrm[0], nrm[1], nrm[2]);
      for (const o of order) {
        P.push(p[o][0], p[o][1], p[o][2]);
        C.push(c[o][0], c[o][1], c[o][2]);
        A.push(a[o][0], a[o][1], a[o][2], a[o][3]);
        N.push(fn.x, fn.y, fn.z);
      }
    };
    /**
     * Height of bed k at a point: the beds at or below the local ground level hug the ground (at
     * most FLOOR_CAP above it, so edges shared with the floor mesh meet it exactly); every bed above
     * lies on its plane.
     */
    const bandY = (k: number, v: V) => (natural ? beds.bandY(k, v.x, v.z, v.f, v.r) : k <= groundOf(v) ? v.f + Math.min(v.r - v.f, FLOOR_CAP) : k * CAVE_TERRACE);
    /**
     * A ledge partway down a face (well below the rock's top near it) is bare rock, not the turf of
     * the crown: its colour and ground weights go over to the cliff's own, so grass grows only on the
     * top and moss takes the lower ledges in patches (the shader's), never a green stripe per bed.
     */
    const ledgeT = (v: V, y: number) => (natural && theme.mesaTop !== undefined ? sstep(1.2, 3.0, gridAt(topNear, v.x, v.z) - y) : 0);
    const ledgeCol = (c3: number[], v: V, y: number) => {
      const t = ledgeT(v, y);
      if (t <= 0) return c3;
      const rc = cliffC.setHex(cliffShades[0]).lerp(c2.setHex(cliffShades[1]), noise(v.x * 0.21 + 50, v.z * 0.21));
      return [c3[0] + (rc.r - c3[0]) * t, c3[1] + (rc.g - c3[1]) * t, c3[2] + (rc.b - c3[2]) * t];
    };
    const ledgeA = (v: V, y: number) => {
      const t = ledgeT(v, y);
      if (t <= 0) return v.a;
      const tot = v.a[0] + v.a[1] + v.a[2] + v.a[3];
      return [v.a[0] * (1 - t), v.a[1] * (1 - t), v.a[2] * (1 - t), v.a[3] * (1 - t) + tot * t];
    };
    const shadeOf = (k: number, v: V, lift = 1) => {
      const f = tone(k, v.x, v.z);
      return [v.c[0] * f * (1 + 0.03 * lift), v.c[1] * f, v.c[2] * f * (1 - 0.04 * lift)];
    };
    const slice = (t: V[]) => {
      let lo = Infinity, hi = -Infinity;
      for (const v of t) {
        lo = Math.min(lo, v.s);
        hi = Math.max(hi, v.s);
      }
      const k0 = indexOf(lo), k1 = indexOf(hi);
      // Downhill (toward lower r) in the triangle's plane, for the faces' facing.
      const ab = [t[1].x - t[0].x, t[1].z - t[0].z, t[1].r - t[0].r], ac = [t[2].x - t[0].x, t[2].z - t[0].z, t[2].r - t[0].r];
      const det = ab[0] * ac[1] - ab[1] * ac[0] || 1e-9;
      const gx = (ab[2] * ac[1] - ac[2] * ab[1]) / det, gz = (ac[2] * ab[0] - ab[2] * ac[0]) / det;
      const down = [-gx, 0, -gz];
      // How wide each bed's ledge runs across this triangle: its thickness over how fast the strata
      // climb across it. A ledge only a hand or two deep partway down a face is no shelf for moss:
      // it is the bed's weathered lip, rounded off toward the drop, so it never shows as a thin bright
      // line of moss drawn along the face (its normal leans out, so it takes the light as a lip).
      const sb = [t[1].s - t[0].s, t[2].s - t[0].s], gsx = (sb[0] * ac[1] - sb[1] * ab[1]) / det, gsz = (sb[1] * ab[0] - sb[0] * ac[0]) / det, gs = Math.hypot(gsx, gsz);
      const dl = Math.hypot(gx, gz), lipN = dl > 1e-6 ? [(-gx / dl) * 0.88, 0.47, (-gz / dl) * 0.88] : [0, 1, 0];
      const lip = (k: number, q: V[]) => natural && k < k1 && gs > 1e-6 && (level(k + 1) - level(k)) / gs < 0.7 && q.every((v) => gridAt(topNear, v.x, v.z) - bandY(k, v) > 0.6);
      for (let k = k0; k <= k1; k++) {
        // The band of this triangle between plane k and k + 1, lying on plane k.
        let poly = t;
        if (k > k0) poly = clip(poly, level(k), 1);
        if (k < k1) poly = clip(poly, level(k + 1), -1);
        if (poly.length >= 3) {
          for (let i = 1; i < poly.length - 1; i++) {
            const q = [poly[0], poly[i], poly[i + 1]];
            tri(q.map((v) => [v.x, bandY(k, v), v.z]), q.map((v) => ledgeCol(shadeOf(k, v, k > 0 ? 1 : 0), v, bandY(k, v))), q.map((v) => ledgeA(v, bandY(k, v))), [0, 1, 0], lip(k, q) ? lipN : undefined);
          }
          // Where this band's edge runs along the island's edge, the skirt drops from it.
          if (skirtOn) for (let i = 0; i < poly.length; i++) {
            const p = poly[i], q = poly[(i + 1) % poly.length];
            const alongZ = p.x === q.x && Number.isInteger(p.x), alongX = p.z === q.z && Number.isInteger(p.z);
            if (!alongZ && !alongX) continue;
            const side = alongZ ? voidSide(true, p.x, (p.z + q.z) / 2) : voidSide(false, p.z, (p.x + q.x) / 2);
            if (!side) continue;
            const bottom = Math.min(p.f, q.f) - SKIRT_DEPTH;
            skirtQuad(p.x, bandY(k, p), p.z, q.x, bandY(k, q), q.z, bottom, alongZ ? side : 0, alongX ? side : 0, shadeOf(k, p), shadeOf(k, q));
          }
        }
        // The sheer face up to this bed, along the cut where s crosses its plane.
        if (k > k0) {
          const lv = level(k), cut: V[] = [];
          for (let i = 0; i < 3; i++) {
            const p = t[i], q = t[(i + 1) % 3];
            if ((p.s >= lv) !== (q.s >= lv)) cut.push(lerpV(p, q, (lv - p.s) / (q.s - p.s)));
          }
          if (cut.length !== 2) continue;
          const [u, v] = cut;
          const pu0 = [u.x, bandY(k - 1, u), u.z], pv0 = [v.x, bandY(k - 1, v), v.z], pu1 = [u.x, bandY(k, u), u.z], pv1 = [v.x, bandY(k, v), v.z];
          tri([pu0, pv0, pv1], [shadeOf(k, u), shadeOf(k, v), shadeOf(k, v)], [u.a, v.a, v.a], down);
          tri([pu0, pv1, pu1], [shadeOf(k, u), shadeOf(k, v), shadeOf(k, u)], [u.a, v.a, u.a], down);
        }
      }
    };
    for (let i = 0; i < caveCells.length; i += 2) {
      const x = caveCells[i], z = caveCells[i + 1];
      const grid: V[] = [];
      for (let jv = 0; jv <= S; jv++) for (let ju = 0; ju <= S; ju++) grid.push(sample(x, z, ju / S, jv / S));
      const at2 = (ju: number, jv: number) => grid[jv * (S + 1) + ju];
      // A cell lying wholly on one ledge above its ground (the broad tops of the high rock) is one quad.
      const lv0 = indexOf(grid[0].s);
      if (grid.every((q) => indexOf(q.s) === lv0 && lv0 > groundOf(q))) {
        const q00 = at2(0, 0), q10 = at2(S, 0), q01 = at2(0, S), q11 = at2(S, S);
        for (const q of [[q00, q01, q11], [q00, q11, q10]]) tri(q.map((v) => [v.x, bandY(lv0, v), v.z]), q.map((v) => ledgeCol(shadeOf(lv0, v), v, bandY(lv0, v))), q.map((v) => ledgeA(v, bandY(lv0, v))), [0, 1, 0]);
        if (skirtOn) for (const [p, q] of [[q00, q01], [q10, q11], [q00, q10], [q01, q11]]) {
          const alongZ = p.x === q.x;
          const side = alongZ ? voidSide(true, p.x, (p.z + q.z) / 2) : voidSide(false, p.z, (p.x + q.x) / 2);
          if (side) skirtQuad(p.x, bandY(lv0, p), p.z, q.x, bandY(lv0, q), q.z, Math.min(p.f, q.f) - SKIRT_DEPTH, alongZ ? side : 0, alongZ ? 0 : side, shadeOf(lv0, p), shadeOf(lv0, q));
        }
        continue;
      }
      for (let jv = 0; jv < S; jv++) for (let ju = 0; ju < S; ju++) {
        const q00 = at2(ju, jv), q10 = at2(ju + 1, jv), q01 = at2(ju, jv + 1), q11 = at2(ju + 1, jv + 1);
        const alt = (x * S + ju + z * S + jv) & 1;
        if (alt) {
          slice([q00, q01, q10]);
          slice([q10, q01, q11]);
        } else {
          slice([q00, q01, q11]);
          slice([q00, q11, q10]);
        }
      }
    }
    // Weather the outdoor rock: every vertex moves by the same smooth field, so shared edges stay
    // shut; then each face takes its new flat normal (same winding, so it still faces out).
    if (natural) {
      for (let i = 0; i < P.length; i += 3) {
        const [wx, wz] = warp(P[i], P[i + 1], P[i + 2]);
        P[i] = wx;
        P[i + 2] = wz;
      }
      for (let i = 0; i < P.length; i += 9) {
        ea.set(P[i + 3] - P[i], P[i + 4] - P[i + 1], P[i + 5] - P[i + 2]);
        eb.set(P[i + 6] - P[i], P[i + 7] - P[i + 1], P[i + 8] - P[i + 2]);
        fn.crossVectors(ea, eb);
        const len = fn.length();
        if (len < 1e-9) continue;
        fn.divideScalar(len);
        for (let j = 0; j < 9; j += 3) {
          N[i + j] = fn.x;
          N[i + j + 1] = fn.y;
          N[i + j + 2] = fn.z;
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    g.setAttribute('aSplat', new THREE.Float32BufferAttribute(A, 4));
    return g;
  }
  const make = (index: number[], name: string, sharp = true) => {
    const g = new THREE.BufferGeometry();
    for (const k of ['position', 'normal', 'color', 'aSplat', ...(sharp ? ['aCol0', 'aCol1', 'aCol2', 'aCol3'] : [])]) g.setAttribute(k, geo.getAttribute(k));
    g.setIndex(index);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
    applyGround(mat, theme.lava ?? 0, theme.topShade ?? 1, theme.cliff?.[0] ?? null, theme.topRange, !!theme.wallRise, wet ? WATER_Y : null, theme.water?.[1], theme.mesaTop === undefined, sharp, theme.wall === 'ruin', theme.rockMoss ?? 0, theme.wall === 'castle');
    // (Outdoor rock is weathered back hard in its gullies, and where a thin rib of it is cut back
    // from both sides its faces can fold through each other: drawn from both sides, a fold shows as
    // rock in shadow, never a slit the sky shows through.)
    if (name === 'relief' && !theme.wallRise) mat.side = THREE.DoubleSide;
    const mesh = new THREE.Mesh(g, mat);
    mesh.receiveShadow = true;
    // Towering cave walls would throw the whole floor into sun shadow (there is no sun
    // underground anyway): only open-air relief casts shadows.
    mesh.castShadow = name === 'relief' && !theme.wallRise;
    mesh.name = name;
    return mesh;
  };
  const meshes = [make(flat, 'ground')];
  let relief = rough.length ? make(rough, 'relief') : null;
  if (caveCells.length) {
    relief = make([], 'relief', false);
    relief.geometry.dispose();
    relief.geometry = caveRelief();
  }
  if (relief) meshes.push(relief);
  if (skirtOn) {
    // The skirt under the flat ground's edge (the relief's own edge laid its skirt as it was cut).
    const cut = new Set<number>();
    for (let i = 0; i < caveCells.length; i += 2) cut.add(caveCells[i + 1] * w + caveCells[i]);
    const colAt = (k: number) => [col[k * 3], col[k * 3 + 1], col[k * 3 + 2]];
    for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) {
      if (at(x, z) === Cell.Void || cut.has(z * w + x)) continue;
      for (const [ax, az, bx, bz, nx, nz] of [[x, z, x, z + 1, -1, 0], [x + 1, z, x + 1, z + 1, 1, 0], [x, z, x + 1, z, 0, -1], [x, z + 1, x + 1, z + 1, 0, 1]]) {
        if (at(x + nx, z + nz) !== Cell.Void) continue;
        const ka = vi(ax, az), kb = vi(bx, bz);
        skirtQuad(ax, pos[ka * 3 + 1], az, bx, pos[kb * 3 + 1], bz, Math.min(base[ka], base[kb]) - SKIRT_DEPTH, nx, nz, colAt(ka), colAt(kb));
      }
    }
    if (SK.P.length) {
      const skirt = make([], 'skirt', false);
      skirt.geometry.dispose();
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(SK.P, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(SK.N, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(SK.C, 3));
      g.setAttribute('aSplat', new THREE.Float32BufferAttribute(SK.A, 4));
      skirt.geometry = g;
      skirt.castShadow = true;
      meshes.push(skirt);
    }
  }

  // Fluids: one surface mesh per kind over its cells (plus a one-cell skirt so it meets the shore).
  const ticks: ((t: number) => void)[] = [];
  for (const kind of [Fluid.Water, Fluid.Lava]) {
    // Fluid cells plus a one-cell skirt under the banks: the visible shoreline is then where the
    // sloping bank rises through the surface, not the edge of the mesh.
    const mark = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) {
      if (layout.fluid[i] !== kind) continue;
      const x0 = i % w, z0 = Math.floor(i / w);
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const x = x0 + dx, z = z0 + dz;
        if (x < 0 || z < 0 || x >= w || z >= h) continue;
        const j = z * w + x;
        if (layout.fluid[j] === kind || (!isRelief(layout.cells[j], theme) && layout.cells[j] !== Cell.Void)) mark[j] = 1;
      }
    }
    const cells: number[] = [];
    for (let i = 0; i < w * h; i++) if (mark[i]) cells.push(i);
    if (!cells.length) continue;
    const fp: number[] = [], depth: number[] = [];
    for (const i of cells) {
      const x = i % w, z = Math.floor(i / w);
      // Counter-clockwise seen from above (normal +Y), or the surface is culled.
      for (const [dx, dz] of [[0, 0], [1, 1], [1, 0], [0, 0], [0, 1], [1, 1]]) {
        const vx = x + dx, vz = z + dz;
        fp.push(vx, base[vi(vx, vz)] + WATER_Y, vz);
        depth.push(WATER_Y - hgt[vi(vx, vz)]);
      }
    }
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3));
    fg.setAttribute('aDepth', new THREE.Float32BufferAttribute(depth, 1));
    fg.computeVertexNormals();
    // The drowned city's still water mirrors the ruins and the sky (a planar reflection); open
    // rivers and lakes elsewhere keep the cheaper painted sky.
    const { mesh, tick } = fluidSurface(fg, kind, theme, kind === Fluid.Water && theme.wall === 'ruin');
    meshes.push(mesh);
    ticks.push(tick);
  }

  const bilinear = (grid: Float32Array, x: number, z: number) => {
    const x0 = Math.max(0, Math.min(w - 1, Math.floor(x))), z0 = Math.max(0, Math.min(h - 1, Math.floor(z)));
    const fx = Math.max(0, Math.min(1, x - x0)), fz = Math.max(0, Math.min(1, z - z0));
    const a = grid[vi(x0, z0)], b = grid[vi(x0 + 1, z0)], cc = grid[vi(x0, z0 + 1)], d = grid[vi(x0 + 1, z0 + 1)];
    return a + (b - a) * fx + (cc - a) * fz + (a - b - cc + d) * fx * fz;
  };
  const heightAt = (x: number, z: number) => bilinear(base, x, z) + bilinear(hgt, x, z);
  const floorAt = (x: number, z: number) => bilinear(base, x, z);
  return { meshes, relief, heightAt, floorAt, ledge, warp, tick: (t) => { GROUND_TIME.value = t; ticks.forEach((f) => f(t)); } };
}

/**
 * Stylised animated liquids.
 * - Water: depth-tinted over a long shelf (shallows show), two layers of drifting ripples in the
 *   normal, a sky reflection tinted from the zone's sky and background (stronger at grazing
 *   angles, broken up by the ripples), glints on ripple crests, soft caustics in the shallows and
 *   a foam line where the bed meets the surface.
 * - Lava: cooled black crust plates drifting slowly, with glowing seams that widen toward the
 *   hot, deep middle; open molten patches churn in the deepest spots. Emission stays moderate so
 *   bloom shows seams, not a blown-out disc.
 */
function fluidSurface(geo: THREE.BufferGeometry, kind: Fluid, theme: ZoneTheme, mirror = false) {
  const lava = kind === Fluid.Lava;
  const refl = mirror ? planarReflection(WATER_Y) : null;
  // The painted sky the water reflects. Mirror water (the drowned city) reflects a deep
  // dusk navy instead: a pale painted sky turned its open water milky grey from the steep camera.
  const deepHex = theme.water?.[1] ?? 0x123a52;
  const skyHigh = mirror ? new THREE.Color(deepHex).lerp(new THREE.Color(theme.hemi[0]), 0.3).multiplyScalar(0.9) : new THREE.Color(theme.hemi[0]).multiplyScalar(0.75);
  const skyLow = mirror ? new THREE.Color(deepHex).multiplyScalar(0.8) : new THREE.Color(theme.bg).lerp(new THREE.Color(theme.hemi[0]), 0.25);
  const uniforms = {
    uTime: { value: 0 },
    uNoise: { value: noiseTexture() },
    uShallow: { value: new THREE.Color(lava ? 0xff6a10 : (theme.water?.[0] ?? 0x3f8fa8)) },
    uDeep: { value: new THREE.Color(lava ? 0x5a0c02 : (theme.water?.[1] ?? 0x123a52)) },
    uSkyHigh: { value: skyHigh },
    uSkyLow: { value: skyLow },
    uRefl: { value: refl?.texture ?? null },
    uReflMat: { value: refl?.texMat ?? new THREE.Matrix4() },
    uReflOn: refl?.on ?? { value: 0 },
  };
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: lava ? 0.55 : 0.3, metalness: 0,
    transparent: !lava, opacity: lava ? 1 : 0.86, depthWrite: lava,
  });
  const common = `
    uniform float uTime;
    uniform sampler2D uNoise;
    uniform vec3 uShallow;
    uniform vec3 uDeep;
    uniform vec3 uSkyHigh;
    uniform vec3 uSkyLow;
    uniform float uReflOn;
    uniform mat4 uReflMat;
    ${refl ? 'uniform sampler2D uRefl;' : ''}
    varying float vDepth;
    varying vec3 vFluidPos;
    float fluidN(vec2 p) { return texture2D(uNoise, p).r; }
    vec2 fluidGrad(vec2 p, float e) { float c = fluidN(p); return vec2(fluidN(p + vec2(e, 0.0)) - c, fluidN(p + vec2(0.0, e)) - c) / e; }
    vec2 lavaHash(vec2 p) { p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return fract(sin(p) * 43758.5453); }
    // Cellular noise: x = distance to nearest cell, y = to second nearest, z = nearest cell id.
    vec3 lavaCells(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      float f1 = 8.0, f2 = 8.0, id = 0.0;
      for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
        vec2 o = vec2(float(x), float(y));
        vec2 h = lavaHash(i + o);
        float d = length(o + 0.15 + h * 0.7 - f);
        if (d < f1) { f2 = f1; f1 = d; id = h.x; } else if (d < f2) f2 = d;
      }
      return vec3(f1, f2, id);
    }`;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aDepth;\nvarying float vDepth;\nvarying vec3 vFluidPos;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvDepth = aDepth;\nvFluidPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${common}`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec2 fp = vFluidPos.xz;
        vec2 q1 = fp * 0.07 + vec2(uTime * 0.011, uTime * 0.006);
        vec2 q2 = fp * 0.23 - vec2(uTime * 0.021, -uTime * 0.014);
        float n1 = fluidN(q1), n2 = fluidN(q2);
        float ripple = n1 * 0.6 + n2 * 0.4;
        ${lava
          ? `// Crust plates drift and slowly deform; seams widen with depth (heat).
             vec2 warp = vec2(fluidN(fp * 0.05 + uTime * 0.004), fluidN(fp * 0.05 + 0.5 - uTime * 0.003)) - 0.5;
             vec3 cells = lavaCells(fp * 0.45 + warp * 1.4 + vec2(uTime * 0.014, uTime * 0.009));
             float heat = smoothstep(0.02, 0.6, vDepth + (n1 - 0.5) * 0.2);
             float gap = cells.y - cells.x;
             float seam = 1.0 - smoothstep(0.015, 0.035 + heat * 0.075, gap);
             float glowNear = 1.0 - smoothstep(0.0, 0.2 + heat * 0.2, gap);
             float molten = smoothstep(0.82, 0.98, heat * 0.45 + n2 * 0.65);
             vec3 crust = vec3(0.06, 0.045, 0.042) * (0.75 + cells.z * 0.5);
             crust = mix(crust, vec3(0.22, 0.05, 0.015), glowNear * heat * 0.7);
             diffuseColor.rgb = mix(crust, vec3(0.3, 0.08, 0.02), max(seam, molten));`
          : `// Depth colour: clear turquoise shallows (the bed shows through, see the ground's wet
             // patch) deepening to opaque blue-green.
             float deep = smoothstep(0.03, 0.72, vDepth + (ripple - 0.5) * 0.1);
             // The deep is not one flat colour: broad, slowly drifting patches of a greener and a
             // bluer deep, darkest where it is deepest.
             float patchN = fluidN(fp * 0.016 + vec2(uTime * 0.0015, -uTime * 0.001));
             vec3 deepC = mix(uDeep * vec3(0.8, 1.1, 0.95), uDeep * vec3(1.05, 0.9, 1.18), smoothstep(0.3, 0.7, patchN));
             deepC *= 1.0 - 0.28 * smoothstep(0.45, 0.72, vDepth);
             diffuseColor.rgb = mix(uShallow, deepC, deep);
             // Foam: a broken rim where the bank meets the water, and a second line that laps
             // in and out a little way offshore.
             float n3 = fluidN(fp * 0.61 + vec2(uTime * 0.05, -uTime * 0.04));
             // Thin and soft: a narrow, broken lace right at the waterline, never a white band.
             float rim = (1.0 - smoothstep(0.0, 0.028, vDepth + (n2 - 0.5) * 0.03)) * smoothstep(0.4, 0.62, n3 + 0.08);
             float lap = smoothstep(0.72, 0.95, 0.5 + 0.5 * sin(uTime * 0.8 - vDepth * 40.0 + n1 * 5.0));
             float band = lap * (1.0 - smoothstep(0.03, 0.1, vDepth)) * smoothstep(0.48, 0.66, n3);
             float foam = max(rim, band * 0.45);
             diffuseColor.rgb = mix(diffuseColor.rgb, mix(uShallow, vec3(0.86, 0.92, 0.92), 0.7), foam * 0.55);
             diffuseColor.a = mix(0.38, 0.94, smoothstep(0.0, 0.6, vDepth)) + foam * 0.2;`}`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        {
          // Water: long swells, a cross-chop and fine wind ripples; lava: a slow heave.
          vec2 g = fluidGrad(q1, 0.01) * ${lava ? '0.0' : '0.006'} + fluidGrad(q2, 0.01) * ${lava ? '0.002' : '0.004'};
          ${lava ? '' : `// Gentle swells rolling across the surface (their crests wander with the noise), under
          // a faint wind chop.
          vec2 swD = vec2(0.8, 0.6);
          float swPh = dot(fp, swD) * 0.7 - uTime * 0.85 + n1 * 4.0;
          g += swD * cos(swPh) * 0.045 * (0.55 + 0.45 * n2) + fluidGrad(fp * 0.7 + vec2(uTime * 0.06, uTime * 0.045), 0.01) * 0.0015;`}
          vec3 gv = (viewMatrix * vec4(g.x, 0.0, g.y, 0.0)).xyz;
          normal = normalize(normal - gv + dot(gv, normal) * normal);
        }`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        ${lava
          ? `vec3 hot = mix(vec3(1.2, 0.3, 0.04), vec3(1.5, 0.6, 0.12), heat);
             float pulse = 0.85 + 0.15 * sin(uTime * 1.3 + fp.x * 0.3 + fp.y * 0.2);
             totalEmissiveRadiance += max(hot * seam, vec3(1.25, 0.34, 0.05) * molten * (0.6 + 0.3 * n2)) * pulse;
             totalEmissiveRadiance += vec3(0.3, 0.05, 0.005) * glowNear * heat * 0.35;`
          : `// Sky reflection: the reflected ray picks a colour from a sky gradient, so ripples
             // show as moving light and dark bands; stronger toward grazing angles.
             vec3 vdir = normalize(vViewPosition);
             float ndv = clamp(dot(vdir, normal), 0.0, 1.0);
             vec3 rw = (vec4(reflect(-vdir, normal), 0.0) * viewMatrix).xyz;
             vec3 sky = mix(uSkyLow, uSkyHigh, smoothstep(-0.1, 0.9, rw.y) * (0.75 + 0.25 * smoothstep(0.3, -0.6, rw.z)));
             // Drifting cloud shadows in the reflection keep open water from reading as one flat sheet.
             float cloud = smoothstep(0.35, 0.75, fluidN(rw.xz / max(0.25, rw.y) * 0.05 + fp * 0.012 + vec2(uTime * 0.004, 0.0)));
             sky *= 0.8 + 0.35 * cloud;
             float fres = 0.1 + 0.9 * pow(1.0 - ndv, 4.0);
             vec3 envC = sky * fres;
             ${refl ? `// The mirrored scene (ruins, columns, the far shore) where there is one, rippled by the
             // swells; the painted sky everywhere else. Solid reflections read stronger than the
             // sky's, so the ruins show in the water even from the high camera.
             vec4 rc = uReflMat * vec4(vFluidPos, 1.0);
             vec3 flatN = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
             vec2 ruv = rc.xy / rc.w + (normal.xy - flatN.xy) * 0.45;
             vec4 mir = texture2D(uRefl, ruv);
             float cover = clamp(mir.a, 0.0, 1.0) * uReflOn;
             envC = mix(envC, mir.rgb * (0.95 + 0.25 * pow(1.0 - ndv, 2.0)), cover);
             diffuseColor.rgb *= 1.0 - cover * 0.78;
             // Caustic shimmer in the shallows: a drifting web of light over the drowned paving.
             float ca = fluidN(fp * 0.55 + vec2(uTime * 0.035, uTime * 0.013));
             float cb = fluidN(fp * 0.73 + vec2(0.37, 0.61) - vec2(uTime * 0.015, uTime * 0.03));
             float caus = pow((1.0 - abs(ca * 2.0 - 1.0)) * (1.0 - abs(cb * 2.0 - 1.0)), 4.0);
             float shoal = 1.0 - smoothstep(0.06, 0.5, vDepth);
             totalEmissiveRadiance += vec3(0.5, 0.95, 0.85) * caus * shoal * (1.0 - cover * 0.7) * 0.55;` : ''}
             totalEmissiveRadiance += envC * (0.55 + 0.45 * smoothstep(0.0, 0.5, vDepth));
             // Sun glints: a sun low ahead of the camera, reflected by the ripple normals, so a
             // path of sparkles flickers on the crests (HDR: they bloom).
             vec3 sunDir = normalize(vec3(0.25, 0.5, -0.83));
             float spec = pow(max(dot(normalize(rw), sunDir), 0.0), 400.0);
             // Two samples at unrelated scales and angles multiplied, so the sparkles never line up on the noise lattice.
             float twinkle = smoothstep(0.42, 0.62, fluidN(fp * 1.13 + vec2(uTime * 0.11, -uTime * 0.07)) * fluidN(mat2(0.8, 0.6, -0.6, 0.8) * fp * 1.71 - vec2(uTime * 0.05, uTime * 0.09)));
             // (Capped, so a glint never burns the surface out to white.)
             totalEmissiveRadiance += vec3(1.0, 0.96, 0.86) * min(spec * twinkle * 0.9 + pow(max(dot(normalize(rw), sunDir), 0.0), 18.0) * 0.05, 0.45);`}`,
      );
  };
  mat.customProgramCacheKey = () => (lava ? 'fluid4-lava' : refl ? 'fluid4-mirror' : 'fluid4-water');
  const mesh = new THREE.Mesh(geo, mat);
  if (refl) {
    mesh.onBeforeRender = (renderer, scene, camera) => refl.render(renderer, scene, camera, mesh);
    mat.addEventListener('dispose', () => refl.dispose());
  }
  mesh.name = lava ? 'lava' : 'water';
  mesh.receiveShadow = !lava;
  mesh.renderOrder = 1;
  return { mesh, tick: (t: number) => (uniforms.uTime.value = t) };
}
