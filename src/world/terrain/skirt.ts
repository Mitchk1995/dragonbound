import * as THREE from 'three';
import { Cell } from '../layout';
import type { Grid } from './grid';

/**
 * The island's side. Where land ends at the void (a floating island), a sheer skirt of rock drops
 * from the very edge of the ground or the cliff top, so the land is a closed mass: no gap ever opens
 * between a raised edge and the rocky underside below it (the sky would show through the rock).
 */
export const SKIRT_DEPTH = 6;

export function skirtBuilder(g: Grid) {
  const { at } = g;
  const P: number[] = [], N: number[] = [], C: number[] = [], A: number[] = [];
  const skn = new THREE.Vector3(), ska = new THREE.Vector3(), skb = new THREE.Vector3();
  /** One quad of the skirt from the edge a..b (tops ya, yb) down to `bottom`, facing (nx, nz). */
  const quad = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, bottom: number, nx: number, nz: number, ca: number[], cb2: number[]) => {
    const q = [[ax, ay, az, ca], [bx, by, bz, cb2], [bx, bottom, bz, cb2], [ax, bottom, az, ca]] as [number, number, number, number[]][];
    for (const t of [[0, 1, 2], [0, 2, 3]]) {
      let [i0, i1, i2] = t;
      ska.set(q[i1][0] - q[i0][0], q[i1][1] - q[i0][1], q[i1][2] - q[i0][2]);
      skb.set(q[i2][0] - q[i0][0], q[i2][1] - q[i0][1], q[i2][2] - q[i0][2]);
      skn.crossVectors(ska, skb);
      if (skn.lengthSq() < 1e-10) continue;
      if (skn.x * nx + skn.z * nz < 0) [i1, i2] = [i2, i1];
      for (const i of [i0, i1, i2]) {
        P.push(q[i][0], q[i][1], q[i][2]);
        N.push(nx, 0, nz);
        C.push(...q[i][3]);
        A.push(0, 0, 0, 1);
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
  /**
   * The skirt under the flat ground's edge (the relief lays its own skirt as it is cut), skipping
   * the cells in `cut`; `pos` and `col` are the grid's vertex positions and colours.
   */
  const underGround = (cut: Set<number>, pos: Float32Array, col: Float32Array, base: Float32Array) => {
    const { w, h, vi } = g;
    const colAt = (k: number) => [col[k * 3], col[k * 3 + 1], col[k * 3 + 2]];
    for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) {
      if (at(x, z) === Cell.Void || cut.has(z * w + x)) continue;
      for (const [ax, az, bx, bz, nx, nz] of [[x, z, x, z + 1, -1, 0], [x + 1, z, x + 1, z + 1, 1, 0], [x, z, x + 1, z, 0, -1], [x, z + 1, x + 1, z + 1, 0, 1]]) {
        if (at(x + nx, z + nz) !== Cell.Void) continue;
        const ka = vi(ax, az), kb = vi(bx, bz);
        quad(ax, pos[ka * 3 + 1], az, bx, pos[kb * 3 + 1], bz, Math.min(base[ka], base[kb]) - SKIRT_DEPTH, nx, nz, colAt(ka), colAt(kb));
      }
    }
  };
  /** The skirt laid so far as one geometry, or null if none was. */
  const geometry = () => {
    if (!P.length) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    geo.setAttribute('aSplat', new THREE.Float32BufferAttribute(A, 4));
    return geo;
  };
  return { quad, voidSide, underGround, geometry };
}

export type Skirt = ReturnType<typeof skirtBuilder>;
