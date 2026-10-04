import * as THREE from 'three';
import type { ZoneTheme } from '../../data/zones';
import { packAttributes } from '../../render/patch';
import { applyGround } from '../../render/surface';
import { Cell } from '../layout';
import { FLOOR_CAP, WATER_Y, type Grid } from './grid';
import type { Heights } from './heightfield';
import type { Tally } from './paint';

/**
 * The flat ground mesh over the vertex grid. Cells with a corner raised above FLOOR_CAP are relief:
 * they leave the grid mesh entirely (relief.ts rebuilds them finer) and are listed in `caveCells`
 * as x, z pairs. Takes the per-channel colours (paint.ts) and returns the ground geometry, the
 * vertex positions and those cells.
 */
export function buildGround(g: Grid, t: Tally, hs: Heights, chanCol: Float32Array[]) {
  const { w, h, nV, vi, at } = g;
  const { base, hgt } = hs;
  const pos = new Float32Array(nV * 3);
  for (let z = 0; z <= h; z++) for (let x = 0; x <= w; x++) {
    const k = vi(x, z);
    pos[k * 3] = x;
    pos[k * 3 + 1] = base[k] + hgt[k];
    pos[k * 3 + 2] = z;
  }
  const flat: number[] = [], caveCells: number[] = [];
  for (let z = 0; z < h; z++) {
    for (let x = 0; x < w; x++) {
      if (at(x, z) === Cell.Void) continue;
      const a = vi(x, z), b = vi(x + 1, z), cc = vi(x + 1, z + 1), d = vi(x, z + 1);
      if ([a, b, cc, d].some((v) => hgt[v] > FLOOR_CAP)) {
        caveCells.push(x, z);
        continue;
      }
      // (A cell with one corner far off the level of the other three, at a built bank's step, is cut
      // on the diagonal that leaves that corner's slope to its own half, so the rest stays level.)
      const ys = [a, b, cc, d].map((v) => hgt[v] + base[v]);
      const odd = ys.findIndex((y, j) => ys.every((o, m) => m === j || (Math.abs(o - y) > 1 && ys.every((q, n) => n === j || Math.abs(q - o) < 0.4))));
      const anti = odd < 0 ? (x + z) & 1 : odd === 0 || odd === 2 ? 1 : 0;
      flat.push(...(anti ? [a, d, b, b, d, cc] : [a, d, cc, a, cc, b]));
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(t.col, 3));
  geo.setAttribute('aSplat', new THREE.BufferAttribute(t.splat, 4));
  chanCol.forEach((a, ch) => geo.setAttribute(`aCol${ch}`, new THREE.BufferAttribute(a, 3)));
  packAttributes(geo, ['aSplat', 'aCol0', 'aCol1', 'aCol2', 'aCol3']);
  geo.setIndex(flat);
  geo.computeVertexNormals();
  const ground = new THREE.BufferGeometry();
  for (const k of ['position', 'normal', 'color', 'aSplat', 'aCol0', 'aCol1', 'aCol2', 'aCol3']) ground.setAttribute(k, geo.getAttribute(k));
  ground.setIndex(flat);
  return { ground, pos, caveCells };
}

/** A terrain mesh with the ground material (`sharp`: blended with per-channel colours). */
export function terrainMesh(geo: THREE.BufferGeometry, theme: ZoneTheme, name: string, wet: boolean, sharp = true) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
  applyGround(mat, theme.lava ?? 0, theme.topShade ?? 1, theme.cliff?.[0] ?? null, theme.topRange, !!theme.wallRise, wet ? WATER_Y : null, theme.water?.[1], theme.mesaTop === undefined, sharp, theme.wall === 'ruin', theme.rockMoss ?? 0, theme.wall === 'castle');
  // (Outdoor rock is weathered back hard in its gullies, and where a thin rib of it is cut back
  // from both sides its faces can fold through each other: drawn from both sides, a fold shows as
  // rock in shadow, never a slit the sky shows through.)
  if (name === 'relief' && !theme.wallRise) mat.side = THREE.DoubleSide;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  // Towering cave walls would throw the whole floor into sun shadow (there is no sun
  // underground anyway): only open-air relief casts shadows.
  mesh.castShadow = name === 'relief' && !theme.wallRise;
  mesh.name = name;
  return mesh;
}
