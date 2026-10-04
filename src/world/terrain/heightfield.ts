import { CAVE_TERRACE } from '../../render/surface';
import { Cell, Fluid } from '../layout';
import type { StrandField } from '../strands';
import type { Bedding } from './bedding';
import { BED_Y, FLOOR_CAP, isRelief, sstep, WATER_Y, type Grid } from './grid';
import type { Tally } from './paint';

/**
 * The height grid. Every height is worked out relative to the local ground level (`base`, from
 * layout.level) and lifted onto it at the end, so a zone without levels is unchanged.
 */
export interface Heights {
  /** Ground level at each vertex (where units stand). */
  base: Float32Array;
  /** Height above the ground level at each vertex. */
  hgt: Float32Array;
  /** Relief rock's raw (unterraced, uncut) height above the ground level. */
  raw: Float32Array;
  /** The level of the water standing at each vertex (-Infinity where none). */
  wLevel: Float32Array;
}

/**
 * Ground level at each vertex: the highest walkable cell touching it (so a plateau's edge stays on
 * the plateau and the cliff below rises from the lower ground), else the lowest cell touching it
 * (rock all round: it rises from its lowest foot to the average of its tops). Water standing at its
 * own level (layout.level on its cells: a moat below the turf) is held by built banks: every corner it
 * touches stands at the water's level, so the bank drops straight inside the masonry that holds it and
 * no slope of earth shows in front of the wall's face. Its bed lies `layout.elev` under the surface
 * where the layout gives one (a fluid cell has no relief).
 */
function groundLevels(g: Grid) {
  const { layout, theme, w, h, nV, vi, at } = g;
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
  const wLevel = new Float32Array(nV).fill(-Infinity), wDepth = new Float32Array(nV);
  for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) {
    const i = z * w + x;
    if (!layout.fluid[i] || layout.cells[i] === Cell.Void) continue;
    const lv = layout.level ? layout.level[i] : 0;
    for (const k of [vi(x, z), vi(x + 1, z), vi(x + 1, z + 1), vi(x, z + 1)]) {
      wLevel[k] = Math.max(wLevel[k], lv);
      wDepth[k] = Math.max(wDepth[k], layout.elev[i]);
    }
  }
  for (let k = 0; k < nV; k++) if (wLevel[k] > -Infinity && base[k] - wLevel[k] > 1) base[k] = wLevel[k];
  return { base, wLevel, wDepth };
}

/**
 * Cave walls climb away from the floor into darkness instead of stopping at one flat plateau.
 * Walls on the camera side (+z) of open floor stay low, so they never hide the cavern.
 */
function caveRise(g: Grid, t: Tally) {
  const { theme, w, h, nV, vi, noise, distField } = g;
  const rise = new Float32Array(nV);
  if (!theme.wallRise) return rise;
  const open = distField((k) => !t.fullRelief(k));
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
  return rise;
}

export function buildHeights(g: Grid, t: Tally, beds: Bedding, sf: StrandField | null): Heights {
  const { layout, theme, w, h, nV, vi, noise } = g;
  const { count, raisedN, raisedH, fluidN, fullRelief } = t;
  const { base, wLevel, wDepth } = groundLevels(g);
  const rise = caveRise(g, t);
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
  const hgt = new Float32Array(nV);
  // Cave rock: raw (unterraced) heights, and the terrace profile: wide flat ledges, short risers.
  const raw = new Float32Array(nV);
  // The same hard steps the relief mesh is cut into (below the first ledge the rock stays at most
  // FLOOR_CAP high, so a vertex the floor mesh shares is never lifted off it).
  const terrace = (y: number) => (y < CAVE_TERRACE ? Math.min(y, FLOOR_CAP) : Math.floor(y / CAVE_TERRACE) * CAVE_TERRACE);
  for (let z = 0; z <= h; z++) {
    for (let x = 0; x <= w; x++) {
      const k = vi(x, z);
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
          // of the relief, each terrace reads as a slab with a crisp lip, like the stacked slabs at
          // the foot. (The relief mesh is rebuilt finer from the raw height; the grid keeps the
          // terraced value for height queries.)
          raw[k] = y;
          y = terrace(y);
        } else {
          // Cliffs and rims outdoors: slow noise only, then cut on the natural bedding planes
          // (bedding.ts), so no zone has smooth, lumpy slopes or big diagonal facets.
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
        // (A moat's bed falls away steeply from its masonry to its full depth.)
        y = wDepth[k] > 0
          ? Math.max(WATER_Y - wDepth[k], WATER_Y - 0.12 - dLand * 0.85) + (noise(x * 0.4, z * 0.4) - 0.5) * 0.16
          : Math.max(BED_Y, Math.min(WATER_Y - 0.16, WATER_Y - 0.1 - dLand * (lava ? 0.32 : 0.13) + shoal)) + (noise(x * 0.4, z * 0.4) - 0.5) * 0.12;
      } else if (fluidN[k] > 0) {
        // Waterline: some shore corners just above the surface, some just below, so the visible
        // edge (where the bank meets the water) wanders instead of following the cell grid.
        y = WATER_Y + (noise(x * 0.7 + 17, z * 0.7) - 0.5) * 0.36;
      }
      hgt[k] = y;
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
      // (Only among corners on one level: a built bank's top never sags toward the water under it.)
      const nb = (j: number) => (Math.abs(base[j] - base[k]) < 0.01 ? hgt[j] : hgt[k]);
      next[k] = hgt[k] * 0.4 + (nb(vi(x - 1, z)) + nb(vi(x + 1, z)) + nb(vi(x, z - 1)) + nb(vi(x, z + 1))) * 0.15;
    }
    hgt.set(next);
  }
  // Streams and pools drawn along their true outlines (strands.ts): every corner inside the
  // waterline sinks into a bed that deepens toward the middle (a pool is a dished hollow), and the
  // banks rise out of the water in an even slope instead of the cell grid's steps.
  if (sf) for (let k = 0; k < nV; k++) {
    if (raisedN[k]) continue;
    const d = sf.wet[k];
    if (d < 0) hgt[k] = Math.min(hgt[k], WATER_Y - 0.12 - 0.7 * sf.deep[k]);
    else if (d < 1.4 && fluidN[k] < count[k]) hgt[k] = WATER_Y + 0.05 + d * 0.2;
  }
  return { base, hgt, raw, wLevel };
}
