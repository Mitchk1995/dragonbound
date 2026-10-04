import * as THREE from 'three';
import { fluidSurface } from '../fluid';
import { Cell, Fluid } from '../layout';
import { isRelief, WATER_Y, type Grid } from './grid';
import type { Heights } from './heightfield';

/**
 * Fluids: one surface mesh per kind over its cells (plus a one-cell skirt so it meets the shore),
 * and the ticks that animate them.
 */
export function buildFluids(g: Grid, hs: Heights) {
  const { layout, theme, w, h, vi } = g;
  const { base, hgt, wLevel } = hs;
  const meshes: THREE.Mesh[] = [];
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
    // Water standing above the zone's floor in a built moat is drawn as its own surface, still and
    // mirroring the walls round it (a planar reflection at its level), like the drowned city's; open
    // rivers and lakes elsewhere keep the cheaper painted sky.
    const parts = new Map<number, { fp: number[]; depth: number[] }>();
    for (const i of cells) {
      const x = i % w, z = Math.floor(i / w);
      // The surface stands at its own water's level (a skirt cell's: the water's beside it), never
      // lifted onto a bank above it.
      let own = -Infinity;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, zz = z + dz;
        if (xx < 0 || zz < 0 || xx >= w || zz >= h || layout.fluid[zz * w + xx] !== kind) continue;
        own = Math.max(own, layout.level ? layout.level[zz * w + xx] : 0);
      }
      const key = kind === Fluid.Water && own > 0.5 ? Math.round(own * 100) / 100 : 0;
      if (!parts.has(key)) parts.set(key, { fp: [], depth: [] });
      const { fp, depth } = parts.get(key)!;
      // Counter-clockwise seen from above (normal +Y), or the surface is culled.
      for (const [dx, dz] of [[0, 0], [1, 1], [1, 0], [0, 0], [0, 1], [1, 1]]) {
        const k = vi(x + dx, z + dz), y = (wLevel[k] > -Infinity ? wLevel[k] : own) + WATER_Y;
        fp.push(x + dx, y, z + dz);
        depth.push(y - base[k] - hgt[k]);
      }
    }
    for (const [key, { fp, depth }] of parts) {
      const fg = new THREE.BufferGeometry();
      fg.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3));
      fg.setAttribute('aDepth', new THREE.Float32BufferAttribute(depth, 1));
      fg.computeVertexNormals();
      const mirror = kind === Fluid.Water && (key > 0 || theme.wall === 'ruin') ? { level: key + WATER_Y, moat: key > 0 } : null;
      const { mesh, tick } = fluidSurface(fg, kind, theme, mirror);
      meshes.push(mesh);
      ticks.push(tick);
    }
  }
  return { meshes, ticks };
}
