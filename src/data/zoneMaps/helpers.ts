import type { Vec2 } from '../../types';
import { Gen } from '../../world/gen';
import { Cell } from '../../world/layout';
import { inPoly as inPolygon } from '../../world/castle/site';

/** Block a rotated rectangle (a building footprint): half-width hw along its X, half-depth hd along Z. */
export function blockRect(G: Gen, cx: number, cz: number, hw: number, hd: number, rot: number) {
  const c = Math.cos(rot), s = Math.sin(rot), R = Math.ceil(Math.hypot(hw, hd)) + 1;
  for (let z = Math.floor(cz - R); z <= cz + R; z++) for (let x = Math.floor(cx - R); x <= cx + R; x++) {
    if (!G.inside(x, z)) continue;
    const dx = x + 0.5 - cx, dz = z + 0.5 - cz;
    // World offset back into the building's frame (the prop is rotated by `rot` about Y).
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    if (Math.abs(lx) <= hw && Math.abs(lz) <= hd) G.l.cells[G.idx(x, z)] = Cell.Blocked;
  }
}

/** Points given as [x, z] pairs. */
export const P = (pts: number[][]): Vec2[] => pts.map(([x, z]) => ({ x, z }));

/** Is a point inside a polygon (even-odd rule)? */
export const inPoly = (x: number, z: number, poly: number[][]) => inPolygon(x, z, poly);
